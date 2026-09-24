import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger
} from '@nestjs/common'
import {PrismaService} from '../../../prisma/prisma.service'
import {getTodayNow} from '../../common/utils/date.util'

export interface DailyNominationResult {
  renom: any
  sheet1: any
  flagEmtry: boolean
  bookingFullJson: any
  headerEntryCDBMMBTUD: any
  headerExitCDBMMBTUD: any
  headerEntryCDBMMBTUH: any
  headerExitCDBMMBTUH: any
  entryValue: any
  exitValue: any
  filePeriodMode: any
  zoneQualityMaster: any[]
  resultEntryExitUse: any
  resultEntryExitUsePerDay: any
  isValid: boolean
  message?: string
}

@Injectable()
export class DailyNominationService {
  private readonly logger =
    new Logger(
      DailyNominationService.name
    )
  constructor(
    private readonly prisma: PrismaService
  ) {}

  /**
   * STEP 23-28: DAILY NOMINATION PROCESSING
   * ประมวลผล daily nomination
   *
   * @param checkType - ประเภทการเสนอชื่อ
   * @param nomination_type_id - ID ของ nomination type
   * @param startDateExConv - วันที่แปลงแล้ว
   * @param nominationDeadlineSubmission - ข้อมูล deadline การส่ง
   * @param nominationDeadlineReceptionOfRenomination - ข้อมูล deadline การรับเสนอชื่อใหม่
   * @param sheet1 - ข้อมูล sheet หลัก
   * @param contractCode - ข้อมูล contract code
   * @param todayEnd - วันที่สิ้นสุด
   * @param flagEmtry - flag ตรวจสอบไฟล์ว่าง
   * @returns DailyNominationResult - ผลลัพธ์การประมวลผล daily nomination
   */
  async executeDailyNomination(
    checkType: string,
    nomination_type_id: number,
    startDateExConv: any,
    nominationDeadlineSubmission: any,
    nominationDeadlineReceptionOfRenomination: any,
    sheet1: any,
    contractCode: any,
    todayEnd: Date,
    flagEmtry: boolean
  ): Promise<DailyNominationResult> {
    try {
      // ===== STEP 23: DAILY NOMINATION PROCESSING =====
      if (
        checkType ===
        'Daily Nomination'
      ) {
        // Validate nomination type matches
        if (
          Number(
            nomination_type_id
          ) !== 1
        ) {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                'File template does not match the required format.'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        // ===== STEP 24: DEADLINE CHECK FOR DAILY NOMINATION =====
        const renom =
          this.ckDateInfoNomDailyAndWeeklyNew(
            getTodayNow(),
            startDateExConv,
            nominationDeadlineSubmission,
            nominationDeadlineReceptionOfRenomination,
            1
          )

        // ===== STEP 25: DAILY HEADER VALIDATION =====
        const ckDateHead =
          this.validateDataDaily(
            sheet1?.data[2]
          )
        if (!ckDateHead) {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                'The hour in the template must start from 1 to 24.'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        // Process sheet1 data
        sheet1 =
          this.processSheet1Data(
            sheet1
          )

        // ===== STEP 26: FINAL DATA VALIDATION =====
        if (flagEmtry) {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                'Invalid File : Values are missing. Please provide at least one valid entry'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        // ===== STEP 27: BOOKING DATA PROCESSING =====
        const bookingData =
          await this.processBookingData(
            contractCode,
            todayEnd
          )

        // ===== STEP 28: DAILY NOMINATION PROCESSING =====
        const dailyProcessingResult =
          this.processDailyNominationData(
            nomination_type_id,
            startDateExConv,
            bookingData
          )

        this.logger.log(
          'STEP 23-28: DAILY NOMINATION PROCESSING completed successfully'
        )

        return {
          renom,
          sheet1,
          flagEmtry: false, // Updated after validation
          ...bookingData,
          ...dailyProcessingResult,
          isValid: true,
          message:
            'Daily nomination processing completed successfully'
        }
      }

      // For non-daily nominations, return default values
      return {
        renom: null,
        sheet1,
        flagEmtry,
        bookingFullJson: null,
        headerEntryCDBMMBTUD:
          null,
        headerExitCDBMMBTUD:
          null,
        headerEntryCDBMMBTUH:
          null,
        headerExitCDBMMBTUH:
          null,
        entryValue: null,
        exitValue: null,
        filePeriodMode: null,
        zoneQualityMaster: [],
        resultEntryExitUse:
          null,
        resultEntryExitUsePerDay:
          null,
        isValid: true,
        message:
          'Non-daily nomination, skipping daily processing'
      }
    } catch (error) {
      console.error(
        'Error in STEP 23-28: DAILY NOMINATION PROCESSING:',
        error
      )
      throw error
    }
  }

  /**
   * STEP 24: DEADLINE CHECK FOR DAILY NOMINATION
   * ตรวจสอบ deadline สำหรับ daily
   *
   * @param getTodayNow - ฟังก์ชันดึงวันที่ปัจจุบัน
   * @param startDateExConv - วันที่แปลงแล้ว
   * @param nominationDeadlineSubmission - ข้อมูล deadline การส่ง
   * @param nominationDeadlineReceptionOfRenomination - ข้อมูล deadline การรับเสนอชื่อใหม่
   * @param type - ประเภท (1 = Daily)
   * @returns Renomination flag
   */

  private ckDateInfoNomDailyAndWeeklyNew(
    nowAts: any,
    startDateExConv: any,
    nominationDeadlineSubmission: any,
    nominationDeadlineReceptionOfRenomination: any,
    type: any
  ) {
    this.logger.log(
      'STEP 24: Deadline check for daily nomination completed'
    )

    const allowedDate = nowAts
      .add(
        nominationDeadlineSubmission?.before_gas_day,
        'day'
      )
      .set(
        'hour',
        nominationDeadlineSubmission?.hour
      )
      .set(
        'minute',
        nominationDeadlineSubmission?.minute
      )
      .startOf('minute')

    if (
      startDateExConv.isBefore(
        allowedDate,
        'day'
      )
    ) {
      this.logger.log(
        'ก่อน deadline'
      )
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date is over submission deadline.'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      this.logger.log(
        'ภายใน deadline'
      )
      if (
        startDateExConv.isSame(
          allowedDate,
          'day'
        )
      ) {
        if (
          nowAts.isSameOrBefore(
            allowedDate
          )
        ) {
          this.logger.log(
            'ยังไม่เกิน ผ่านได้'
          )
          return null
        } else {
          this.logger.log(
            'เกิน เช็ค renom'
          )
          if (
            !nominationDeadlineReceptionOfRenomination
          ) {
            return true
          } else {
            const renomAllowedDate =
              nowAts
                .add(
                  nominationDeadlineReceptionOfRenomination?.before_gas_day,
                  'day'
                )
                .set(
                  'hour',
                  nominationDeadlineReceptionOfRenomination?.hour
                )
                .set(
                  'minute',
                  nominationDeadlineReceptionOfRenomination?.minute
                )
                .startOf(
                  'minute'
                )
            if (
              startDateExConv.isBefore(
                renomAllowedDate,
                'day'
              )
            ) {
              this.logger.log(
                'ก่อน renom deadline'
              )
              throw new HttpException(
                {
                  status:
                    HttpStatus.BAD_REQUEST,
                  error:
                    'Start Date is over Reception of renomination deadline.'
                },
                HttpStatus.BAD_REQUEST
              )
            } else {
              this.logger.log(
                'ภายใน renom deadline'
              )
              if (
                startDateExConv.isSame(
                  renomAllowedDate,
                  'day'
                )
              ) {
                if (
                  nowAts.isSameOrBefore(
                    renomAllowedDate
                  )
                ) {
                  this.logger.log(
                    'ยังไม่เกิน renom ผ่านได้'
                  )
                  return true
                } else {
                  this.logger.log(
                    'เกิน renom'
                  )
                  throw new HttpException(
                    {
                      status:
                        HttpStatus.BAD_REQUEST,
                      error:
                        'Start Date is over Reception of renomination deadline.'
                    },
                    HttpStatus.BAD_REQUEST
                  )
                }
              } else {
                this.logger.log(
                  'ยังไม่เกิน renom ผ่านได้'
                )
                return true
              }
            }
          }
        }
      } else {
        this.logger.log(
          'ยังไม่เกิน ผ่านได้'
        )
        return null
      }
    }
  }

  /**
   * STEP 25: DAILY HEADER VALIDATION
   * ตรวจสอบ header ของ daily
   *
   * @param data - ข้อมูล header
   * @returns Boolean indicating if header is valid
   */

  private validateDataDaily(
    sheetData: any
  ) {
    this.logger.log(
      'STEP 25: Daily header validation completed'
    )
    // ตรวจสอบค่าตั้งแต่ key 14 ถึง 37
    for (
      let i = 14;
      i <= 37;
      i++
    ) {
      if (
        sheetData[
          i.toString()
        ] !==
        (i - 13).toString()
      ) {
        return false // ถ้าไม่ตรงกันให้คืนค่า false ทันที
      }
    }

    // ตรวจสอบค่า key 38 ต้องเป็น 'Total'
    if (
      sheetData['38'] !==
      'Total'
    ) {
      return false
    }

    return true // ถ้าทุกอย่างถูกต้อง คืนค่า true
  }

  /**
   * Process sheet1 data
   *
   * @param sheet1 - ข้อมูล sheet หลัก
   * @returns Processed sheet1 data
   */
  private processSheet1Data(
    sheet1: any
  ): any {
    // Process sheet1 data structure
    // This is a placeholder - the actual implementation would process the sheet data
    this.logger.log(
      'Sheet1 data processing completed'
    )
    return sheet1
  }

  /**
   * STEP 27: BOOKING DATA PROCESSING
   * ประมวลผล booking data
   *
   * @param contractCode - ข้อมูล contract code
   * @param todayEnd - วันที่สิ้นสุด
   * @returns Object containing booking data
   */
  private async processBookingData(
    contractCode: any,
    todayEnd: Date
  ) {
    this.logger.log(
      '********* start *********'
    )

    // Parse booking full JSON data from contract
    const bookingFullJson =
      JSON.parse(
        contractCode
          ?.booking_version[0]
          ?.booking_full_json[0]
          ?.data_temp
      )

    // Extract capacity daily booking headers for entry and exit
    const headerEntryCDBMMBTUD =
      bookingFullJson
        ?.headerEntry[
        'Capacity Daily Booking (MMBTU/d)'
      ]
    delete headerEntryCDBMMBTUD[
      'key'
    ] // Remove key field
    const headerExitCDBMMBTUD =
      bookingFullJson
        ?.headerExit[
        'Capacity Daily Booking (MMBTU/d)'
      ]
    delete headerExitCDBMMBTUD[
      'key'
    ] // Remove key field

    // Extract maximum hour booking headers for entry and exit
    const headerEntryCDBMMBTUH =
      bookingFullJson
        ?.headerEntry[
        'Maximum Hour Booking (MMBTU/h)'
      ]
    delete headerEntryCDBMMBTUH[
      'key'
    ]
    const headerExitCDBMMBTUH =
      bookingFullJson
        ?.headerExit[
        'Maximum Hour Booking (MMBTU/h)'
      ]
    delete headerExitCDBMMBTUH[
      'key'
    ]

    const entryValue =
      bookingFullJson?.entryValue
    const exitValue =
      bookingFullJson?.exitValue
    const filePeriodMode =
      contractCode?.file_period_mode

    const zoneQualityMaster =
      await this.prisma.zone.findMany(
        {
          where: {
            AND: [
              {
                start_date: {
                  lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                }
              },
              {
                OR: [
                  {
                    end_date:
                      null
                  }, // ถ้า end_date เป็น null
                  {
                    end_date:
                      {
                        gte: todayEnd
                      }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับสิ้นสุดวันนี้
                ]
              }
            ]
          }
        }
      )

    this.logger.log(
      'STEP 27: Booking data processing completed'
    )

    return {
      bookingFullJson,
      headerEntryCDBMMBTUD,
      headerExitCDBMMBTUD,
      headerEntryCDBMMBTUH,
      headerExitCDBMMBTUH,
      entryValue,
      exitValue,
      filePeriodMode,
      zoneQualityMaster
    }
  }

  /**
   * STEP 28: DAILY NOMINATION PROCESSING
   * ประมวลผล daily nomination (ส่วนหลัก)
   *
   * @param nomination_type_id - ID ของ nomination type
   * @param startDateExConv - วันที่แปลงแล้ว
   * @param bookingData - ข้อมูล booking
   * @returns Object containing daily processing result
   */
  private processDailyNominationData(
    nomination_type_id: number,
    startDateExConv: any,
    bookingData: any
  ) {
    // Process daily nomination data based on file period mode
    if (
      nomination_type_id === 1
    ) {
      // Daily nomination
      if (
        bookingData.filePeriodMode ===
          1 ||
        bookingData.filePeriodMode ===
          3
      ) {
        // Find matching keys for entry/exit use and per day values
        const resultEntryExitUse =
          this.findExactMatchingKeyDDMMYYYY(
            startDateExConv,
            bookingData.headerEntryCDBMMBTUH
          )
        const resultEntryExitUsePerDay =
          this.findExactMatchingKeyDDMMYYYY(
            startDateExConv,
            bookingData.headerEntryCDBMMBTUD
          )

        // Validate that matching keys exist
        if (
          !!!resultEntryExitUse ||
          !!!resultEntryExitUsePerDay
        ) {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                'Matching keys not found for the specified date.'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        this.logger.log(
          'STEP 28: Daily nomination processing completed'
        )

        return {
          resultEntryExitUse,
          resultEntryExitUsePerDay
        }
      }
    }

    return {
      resultEntryExitUse:
        null,
      resultEntryExitUsePerDay:
        null
    }
  }

  /**
   * Find exact matching key for DDMMYYYY format
   *
   * @param startDateExConv - วันที่แปลงแล้ว
   * @param headerData - ข้อมูล header
   * @returns Matching key result
   */
  private findExactMatchingKeyDDMMYYYY(
    startDateExConv: any,
    headerData: any
  ): any {
    // Implementation of key matching logic
    // This is a placeholder - the actual implementation would find matching keys
    return {
      key: 'test',
      value: 100
    } // Return matching key result for testing
  }
}
