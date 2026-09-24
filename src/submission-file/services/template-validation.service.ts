import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger
} from '@nestjs/common'
import {PrismaService} from '../../../prisma/prisma.service'
import {
  getTodayNowAdd7,
  getTodayStartAdd7,
  getTodayEndAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayNowMMDDYYAdd7,
  excelSerialToDate
} from '../../common/utils/date.util'
import * as dayjs from 'dayjs'
import {parseToNumber} from 'src/common/utils/number.util'

export interface TemplateValidationResult {
  checkTemplate: any
  contractCode: any
  nominationDeadlineSubmission: any
  nominationDeadlineReceptionOfRenomination: any
  isValid: boolean
  message?: string
}

@Injectable()
export class TemplateValidationService {
  private readonly logger =
    new Logger(
      TemplateValidationService.name
    )
  constructor(
    private readonly prisma: PrismaService
  ) {}

  /**
   * STEP 12-16: TEMPLATE AND CAPACITY VALIDATION
   * ตรวจสอบ template, capacity, contract status, deadline และ weekly nomination date
   *
   * @param shipper_id - ID ของ shipper
   * @param contract_code_id - ID ของ contract code
   * @param nomination_type_id - ID ของ nomination type (1=Daily, 2=Weekly)
   * @param gAuserType - ข้อมูล user type
   * @param todayStart - วันที่เริ่มต้น
   * @param todayEnd - วันที่สิ้นสุด
   * @param startDateEx - วันที่เริ่มต้นจากไฟล์
   * @param sheet1 - ข้อมูล sheet หลัก
   * @returns TemplateValidationResult - ผลลัพธ์การตรวจสอบ
   */
  async executeTemplateValidation(
    shipper_id: number,
    contract_code_id: number,
    nomination_type_id: number,
    gAuserType: any,
    todayStart: Date,
    todayEnd: Date,
    startDateEx: string,
    sheet1: any
  ): Promise<TemplateValidationResult> {
    try {
      // ===== STEP 12: TEMPLATE VALIDATION =====
      const checkTemplate =
        await this.validateTemplate(
          shipper_id,
          contract_code_id,
          nomination_type_id
        )
      // ===== STEP 13: CONTRACT CAPACITY VALIDATION =====
      const contractCode =
        await this.validateContractCapacity(
          contract_code_id,
          startDateEx,
          nomination_type_id
        )

      // ===== STEP 14: CONTRACT STATUS VALIDATION =====
      this.validateContractStatus(
        contractCode
      )

      // ===== STEP 15: DEADLINE VALIDATION =====
      const {
        nominationDeadlineSubmission,
        nominationDeadlineReceptionOfRenomination
      } =
        await this.validateDeadline(
          gAuserType,
          nomination_type_id,
          todayStart,
          todayEnd
        )

      // ===== STEP 16: WEEKLY NOMINATION DATE VALIDATION =====
      this.validateWeeklyNominationDate(
        nomination_type_id,
        startDateEx,
        sheet1
      )

      return {
        checkTemplate,
        contractCode,
        nominationDeadlineSubmission,
        nominationDeadlineReceptionOfRenomination,
        isValid: true,
        message:
          'All validations passed'
      }
    } catch (error) {
      throw error
    }
  }

  async executeTemplateValidationReserveBalancingGasContract(
    shipper_id: number,
    contract_code_id: number,
    nomination_type_id: number,
    gAuserType: any,
    todayStart: Date,
    todayEnd: Date,
    startDateEx: string,
    sheet1: any
  ): Promise<TemplateValidationResult> {
    try {
      // ===== STEP 12: TEMPLATE VALIDATION =====
      // no template for reserve balancing gas contract

      // ===== STEP 13: CONTRACT CAPACITY VALIDATION =====
      // already get reserve balancing gas contract object in STEP 6

      // ===== STEP 14: CONTRACT STATUS VALIDATION =====
      // reserve balancing gas contract have no start date and end date

      // ===== STEP 15: DEADLINE VALIDATION =====
      const {
        nominationDeadlineSubmission,
        nominationDeadlineReceptionOfRenomination
      } =
        await this.validateDeadline(
          gAuserType,
          nomination_type_id,
          todayStart,
          todayEnd
        )

      // ===== STEP 16: WEEKLY NOMINATION DATE VALIDATION =====
      this.validateWeeklyNominationDate(
        nomination_type_id,
        startDateEx,
        sheet1
      )

      this.logger.log(
        'STEP 12-16: TEMPLATE AND CAPACITY VALIDATION for reserve balancing gas contract completed successfully'
      )

      return {
        checkTemplate: null,
        contractCode: null,
        nominationDeadlineSubmission,
        nominationDeadlineReceptionOfRenomination,
        isValid: true,
        message:
          'All validations passed'
      }
    } catch (error) {
      this.logger.error(
        'Error in STEP 12-16: TEMPLATE AND CAPACITY VALIDATION for reserve balancing gas contract:',
        error
      )
      throw error
    }
  }

  /**
   * STEP 12: TEMPLATE VALIDATION
   * ตรวจสอบ template
   *
   * @param shipper_id - ID ของ shipper
   * @param contract_code_id - ID ของ contract code
   * @param nomination_type_id - ID ของ nomination type
   * @returns Template data
   * @throws HttpException if template is not found
   */
  private async validateTemplate(
    shipper_id: number,
    contract_code_id: number,
    nomination_type_id: number
  ) {
    // Check if upload template exists for this shipper, contract, and nomination type

    const checkTemplate =
      await this.prisma.upload_template_for_shipper.findFirst(
        {
          where: {
            group_id: Number(
              shipper_id
            ), // Shipper ID
            contract_code_id:
              Number(
                contract_code_id
              ), // Contract code ID
            nomination_type_id:
              Number(
                nomination_type_id
              ), // Nomination type (1=Daily, 2=Weekly)
            AND: [
              {
                OR: [
                  {
                    del_flag: false
                  }, // Template not deleted
                  {
                    del_flag:
                      null
                  } // Template deletion flag is null
                ]
              }
            ]
          }
        }
      )

    // Validate template existence
    if (!!!checkTemplate) {
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

    this.logger.log(
      'STEP 12: Template validation passed'
    )
    return checkTemplate
  }

  /**
   * STEP 13: CONTRACT CAPACITY VALIDATION
   * ตรวจสอบ capacity ของ contract
   *
   * @param contract_code_id - ID ของ contract code
   * @returns Contract code data
   * @throws HttpException if contract capacity is rejected
   */
  private async validateContractCapacity(
    contract_code_id: number,
    startDateEx,
    nomination_type_id?: number
  ) {
    // Get contract code with capacity information and booking data

    const contractCode =
      await this.prisma.contract_code.findFirst(
        {
          where: {
            // status_capacity_request_management_id: 2,
            status_capacity_request_management:
              {
                id: {
                  in: [
                    2, 3, 5
                  ]
                }
              },
            // status_capacity_request_management_process_id: 2,
            OR: [
              {
                id: Number(
                  contract_code_id
                )
              },
              {
                ref_contract_code_by_main_id:
                  Number(
                    contract_code_id
                  )
              }
            ],

            AND: [
              // เริ่มสัญญาก่อน "ต้นเดือนถัดไป" => มีผลในเดือนนี้แน่ ๆ
              ...(nomination_type_id ==
              2
                ? [
                    {
                      contract_start_date:
                        {
                          lte: dayjs(
                            startDateEx,
                            'DD/MM/YYYY'
                          )
                            .endOf(
                              'week'
                            )
                            .toDate()
                        }
                    }
                  ]
                : [
                    {
                      contract_start_date:
                        {
                          lte: dayjs(
                            startDateEx,
                            'DD/MM/YYYY'
                          ).toDate()
                        }
                    }
                  ]),
              // ถ้ามีวันยกเลิก ต้อง "ไม่ก่อน" ต้นเดือนนี้ (ยังมีผลในเดือนนี้)
              {
                OR: [
                  {
                    terminate_date:
                      null
                  },
                  {
                    terminate_date:
                      {
                        gt: dayjs(
                          startDateEx,
                          'DD/MM/YYYY'
                        ).toDate()
                      } as any
                  }
                ]
              },
              // ใช้ extend_deadline ถ้ามี; ถ้าไม่มีให้ใช้ contract_end_date
              {
                OR: [
                  {
                    AND: [
                      {
                        extend_deadline:
                          {
                            not: null
                          }
                      },
                      {
                        extend_deadline:
                          {
                            gt: dayjs(
                              startDateEx,
                              'DD/MM/YYYY'
                            ).toDate()
                          } as any
                      }
                    ]
                  },
                  {
                    AND: [
                      {
                        extend_deadline:
                          null
                      },
                      {
                        OR: [
                          {
                            contract_end_date:
                              null
                          },
                          {
                            contract_end_date:
                              {
                                gt: dayjs(
                                  startDateEx,
                                  'DD/MM/YYYY'
                                ).toDate()
                              } as any
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          include: {
            group: true,
            booking_version: {
              include: {
                booking_full_json: true,
                booking_row_json: true
              },
              take: 1,
              orderBy: {
                id: 'desc'
              }
            }
          },
          take: 1,
          orderBy: {id: 'asc'}
        }
      )

    // Check if contract capacity is rejected
    if (
      contractCode?.status_capacity_request_management_id ===
      3
    ) {
      //
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Nomination upload not allowed : Capacity Right is rejected.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    this.logger.log(
      'STEP 13: Contract capacity validation passed'
    )
    return contractCode
  }

  /**
   * STEP 14: CONTRACT STATUS VALIDATION
   * ตรวจสอบสถานะ contract
   *
   * @param contractCode - ข้อมูล contract code
   * @throws HttpException if contract status is invalid
   */
  private validateContractStatus(
    contractCode: any
  ) {
    // Check if contract exists and is not terminated
    if (
      !!!contractCode ||
      contractCode?.status_capacity_request_management_id ===
        5
    ) {
      if (
        contractCode?.status_capacity_request_management_id ===
        5
      ) {
        // Check if terminated contract is still within grace period
        const isFuture =
          getTodayNowAdd7(
            contractCode?.terminate_date
          ).isBefore(
            getTodayStartAdd7(),
            'day'
          )
        if (isFuture) {
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
      } else {
        // Contract doesn't exist or has invalid status
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
    }

    this.logger.log(
      'STEP 14: Contract status validation passed'
    )
  }

  /**
   * STEP 15: DEADLINE VALIDATION
   * ตรวจสอบ deadline
   *
   * @param gAuserType - ข้อมูล user type
   * @param nomination_type_id - ID ของ nomination type
   * @param todayStart - วันที่เริ่มต้น
   * @param todayEnd - วันที่สิ้นสุด
   * @returns Object containing deadline data
   * @throws HttpException if deadline is missing
   */
  private async validateDeadline(
    gAuserType: any,
    nomination_type_id: number,
    todayStart: Date,
    todayEnd: Date
  ) {
    // Get submission deadline configuration
    const nominationDeadlineSubmission =
      await this.prisma.new_nomination_deadline.findFirst(
        {
          where: {
            process_type_id: 1, // Process type: Submission
            user_type_id:
              gAuserType?.user_type_id ==
              1
                ? 2
                : gAuserType?.user_type_id, // User type specific deadline
            nomination_type_id:
              Number(
                nomination_type_id
              ), // Daily or Weekly nomination
            AND: [
              {
                start_date: {
                  lte: todayEnd // Deadline start must be before or equal to today end
                }
              },
              {
                OR: [
                  {
                    end_date:
                      null
                  }, // If end_date is null (no end date)
                  {
                    end_date:
                      {
                        gte: todayStart
                      }
                  } // If end_date exists, must be after or equal to today start
                ]
              }
            ]
          }
        }
      )

    // Validate submission deadline exists
    if (
      !nominationDeadlineSubmission
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Deadline is missing. Please configure it before proceeding.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // Get reception of renomination deadline configuration
    const nominationDeadlineReceptionOfRenomination =
      await this.prisma.new_nomination_deadline.findFirst(
        {
          where: {
            process_type_id: 3, // Process type: Reception of Renomination
            user_type_id:
              gAuserType?.user_type_id ==
              1
                ? 2
                : gAuserType?.user_type_id, // User type specific deadline
            nomination_type_id:
              Number(
                nomination_type_id
              ), // Daily or Weekly nomination
            AND: [
              {
                start_date: {
                  lte: todayEnd // Deadline start must be before or equal to today end
                }
              },
              {
                OR: [
                  {
                    end_date:
                      null
                  }, // If end_date is null (no end date)
                  {
                    end_date:
                      {
                        gte: todayStart
                      }
                  } // If end_date exists, must be after or equal to today start
                ]
              }
            ]
          }
        }
      )

    this.logger.log(
      'STEP 15: Deadline validation passed'
    )
    return {
      nominationDeadlineSubmission,
      nominationDeadlineReceptionOfRenomination
    }
  }

  /**
   * STEP 16: WEEKLY NOMINATION DATE VALIDATION
   * ตรวจสอบวันที่ weekly nomination
   *
   * @param nomination_type_id - ID ของ nomination type
   * @param startDateEx - วันที่เริ่มต้นจากไฟล์
   * @param sheet1 - ข้อมูล sheet หลัก
   * @throws HttpException if weekly nomination date is invalid
   */
  validateWeeklyNominationDate(
    nomination_type_id: number,
    startDateEx: string,
    sheet1: any
  ) {
    // https://app.clickup.com/t/86etzch2g
    if (
      nomination_type_id === 2
    ) {
      // Helper function to check if date is Sunday
      function isSunday(
        dateStr: string
      ) {
        const d = dayjs(
          dateStr,
          'DD/MM/YYYY',
          true
        ) // true = strict parse
        return (
          d.isValid() &&
          d.day() === 0
        )
      }

      // Validate that weekly nomination starts from Sunday
      if (
        !isSunday(startDateEx)
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'The date in the template must start from Sunday.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // Validate that all 7 days in weekly nomination are consecutive and correct
      // Check each day from Sunday to Saturday (columns 14-20 in sheet data)
      const sundayDate =
        getTodayNowDDMMYYYYDfaultAdd7(
          startDateEx
        )
      const mondayDate =
        sundayDate.add(
          1,
          'day'
        )
      const tuesdayDate =
        sundayDate.add(
          2,
          'day'
        )
      const wednesdayDate =
        sundayDate.add(
          3,
          'day'
        )
      const thursdayDate =
        sundayDate.add(
          4,
          'day'
        )
      const fridayDate =
        sundayDate.add(
          5,
          'day'
        )
      const saturdayDate =
        sundayDate.add(
          6,
          'day'
        )

      if (
        sundayDate.format(
          'DD/MM/YYYY'
        ) !==
        sheet1?.data[2][14]
      ) {
        let dayJsMMDDYYYY =
          getTodayNowMMDDYYAdd7(
            sheet1
              ?.data[2][14]
          )
        if (
          !dayJsMMDDYYYY.isValid()
        ) {
          // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
          const excelSerialDate =
            parseToNumber(
              sheet1
                ?.data[2][14]
            )
          if (
            excelSerialDate
          ) {
            // It's an Excel serial date
            const jsDate =
              excelSerialToDate(
                excelSerialDate
              )
            dayJsMMDDYYYY =
              dayjs(jsDate)
          }
        }
        if (
          dayJsMMDDYYYY.isValid() &&
          sundayDate.format(
            'DD/MM/YYYY'
          ) ==
            dayJsMMDDYYYY.format(
              'DD/MM/YYYY'
            )
        ) {
          sheet1.data[2][14] =
            sundayDate.format(
              'DD/MM/YYYY'
            )
        } else {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                // 'Date is NOT match.'
                'Submission failed. Please ensure the file contains complete data for all 7 days (Sunday–Saturday).'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }

      if (
        mondayDate.format(
          'DD/MM/YYYY'
        ) !==
        sheet1?.data[2][15]
      ) {
        let dayJsMMDDYYYY =
          getTodayNowMMDDYYAdd7(
            sheet1
              ?.data[2][15]
          )
        if (
          !dayJsMMDDYYYY.isValid()
        ) {
          // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
          const excelSerialDate =
            parseToNumber(
              sheet1
                ?.data[2][15]
            )
          if (
            excelSerialDate
          ) {
            // It's an Excel serial date
            const jsDate =
              excelSerialToDate(
                excelSerialDate
              )
            dayJsMMDDYYYY =
              dayjs(jsDate)
          }
        }
        if (
          dayJsMMDDYYYY.isValid() &&
          mondayDate.format(
            'DD/MM/YYYY'
          ) ==
            dayJsMMDDYYYY.format(
              'DD/MM/YYYY'
            )
        ) {
          sheet1.data[2][15] =
            mondayDate.format(
              'DD/MM/YYYY'
            )
        } else {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                // 'Date is NOT match.'
                'Submission failed. Please ensure the file contains complete data for all 7 days (Sunday–Saturday).'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }

      if (
        tuesdayDate.format(
          'DD/MM/YYYY'
        ) !==
        sheet1?.data[2][16]
      ) {
        let dayJsMMDDYYYY =
          getTodayNowMMDDYYAdd7(
            sheet1
              ?.data[2][16]
          )
        if (
          !dayJsMMDDYYYY.isValid()
        ) {
          // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
          const excelSerialDate =
            parseToNumber(
              sheet1
                ?.data[2][16]
            )
          if (
            excelSerialDate
          ) {
            // It's an Excel serial date
            const jsDate =
              excelSerialToDate(
                excelSerialDate
              )
            dayJsMMDDYYYY =
              dayjs(jsDate)
          }
        }
        if (
          dayJsMMDDYYYY.isValid() &&
          tuesdayDate.format(
            'DD/MM/YYYY'
          ) ==
            dayJsMMDDYYYY.format(
              'DD/MM/YYYY'
            )
        ) {
          sheet1.data[2][16] =
            tuesdayDate.format(
              'DD/MM/YYYY'
            )
        } else {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                // 'Date is NOT match.'
                'Submission failed. Please ensure the file contains complete data for all 7 days (Sunday–Saturday).'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }

      if (
        wednesdayDate.format(
          'DD/MM/YYYY'
        ) !==
        sheet1?.data[2][17]
      ) {
        let dayJsMMDDYYYY =
          getTodayNowMMDDYYAdd7(
            sheet1
              ?.data[2][17]
          )
        if (
          !dayJsMMDDYYYY.isValid()
        ) {
          // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
          const excelSerialDate =
            parseToNumber(
              sheet1
                ?.data[2][17]
            )
          if (
            excelSerialDate
          ) {
            // It's an Excel serial date
            const jsDate =
              excelSerialToDate(
                excelSerialDate
              )
            dayJsMMDDYYYY =
              dayjs(jsDate)
          }
        }
        if (
          dayJsMMDDYYYY.isValid() &&
          wednesdayDate.format(
            'DD/MM/YYYY'
          ) ==
            dayJsMMDDYYYY.format(
              'DD/MM/YYYY'
            )
        ) {
          sheet1.data[2][17] =
            wednesdayDate.format(
              'DD/MM/YYYY'
            )
        } else {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                // 'Date is NOT match.'
                'Submission failed. Please ensure the file contains complete data for all 7 days (Sunday–Saturday).'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }

      if (
        thursdayDate.format(
          'DD/MM/YYYY'
        ) !==
        sheet1?.data[2][18]
      ) {
        let dayJsMMDDYYYY =
          getTodayNowMMDDYYAdd7(
            sheet1
              ?.data[2][18]
          )
        if (
          !dayJsMMDDYYYY.isValid()
        ) {
          // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
          const excelSerialDate =
            parseToNumber(
              sheet1
                ?.data[2][18]
            )
          if (
            excelSerialDate
          ) {
            // It's an Excel serial date
            const jsDate =
              excelSerialToDate(
                excelSerialDate
              )
            dayJsMMDDYYYY =
              dayjs(jsDate)
          }
        }
        if (
          dayJsMMDDYYYY.isValid() &&
          thursdayDate.format(
            'DD/MM/YYYY'
          ) ==
            dayJsMMDDYYYY.format(
              'DD/MM/YYYY'
            )
        ) {
          sheet1.data[2][18] =
            thursdayDate.format(
              'DD/MM/YYYY'
            )
        } else {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                // 'Date is NOT match.'
                'Submission failed. Please ensure the file contains complete data for all 7 days (Sunday–Saturday).'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }

      if (
        fridayDate.format(
          'DD/MM/YYYY'
        ) !==
        sheet1?.data[2][19]
      ) {
        let dayJsMMDDYYYY =
          getTodayNowMMDDYYAdd7(
            sheet1
              ?.data[2][19]
          )
        if (
          !dayJsMMDDYYYY.isValid()
        ) {
          // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
          const excelSerialDate =
            parseToNumber(
              sheet1
                ?.data[2][19]
            )
          if (
            excelSerialDate
          ) {
            // It's an Excel serial date
            const jsDate =
              excelSerialToDate(
                excelSerialDate
              )
            dayJsMMDDYYYY =
              dayjs(jsDate)
          }
        }
        if (
          dayJsMMDDYYYY.isValid() &&
          fridayDate.format(
            'DD/MM/YYYY'
          ) ==
            dayJsMMDDYYYY.format(
              'DD/MM/YYYY'
            )
        ) {
          sheet1.data[2][19] =
            fridayDate.format(
              'DD/MM/YYYY'
            )
        } else {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                // 'Date is NOT match.'
                'Submission failed. Please ensure the file contains complete data for all 7 days (Sunday–Saturday).'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }

      if (
        saturdayDate.format(
          'DD/MM/YYYY'
        ) !==
        sheet1?.data[2][20]
      ) {
        let dayJsMMDDYYYY =
          getTodayNowMMDDYYAdd7(
            sheet1
              ?.data[2][20]
          )
        if (
          !dayJsMMDDYYYY.isValid()
        ) {
          // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
          const excelSerialDate =
            parseToNumber(
              sheet1
                ?.data[2][20]
            )
          if (
            excelSerialDate
          ) {
            // It's an Excel serial date
            const jsDate =
              excelSerialToDate(
                excelSerialDate
              )
            dayJsMMDDYYYY =
              dayjs(jsDate)
          }
        }
        if (
          dayJsMMDDYYYY.isValid() &&
          saturdayDate.format(
            'DD/MM/YYYY'
          ) ==
            dayJsMMDDYYYY.format(
              'DD/MM/YYYY'
            )
        ) {
          sheet1.data[2][20] =
            saturdayDate.format(
              'DD/MM/YYYY'
            )
        } else {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                // 'Date is NOT match.'
                'Submission failed. Please ensure the file contains complete data for all 7 days (Sunday–Saturday).'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }

    this.logger.log(
      'STEP 16: Weekly nomination date validation passed'
    )
  }
}
