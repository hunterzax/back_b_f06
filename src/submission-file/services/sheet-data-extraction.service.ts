import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common'
import {PrismaService} from '../../../prisma/prisma.service'
import {TemplateValidationService} from './template-validation.service'
import {excelSerialToDate, getTodayEndAdd7, getTodayNowAdd7, getTodayNowDDMMYYYYDfaultAdd7, getTodayNowMMDDYYAdd7, getTodayStartAdd7} from '../../common/utils/date.util'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {isMatch} from 'src/common/utils/allocation.util'
import {parseToNumber} from 'src/common/utils/number.util'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

export interface SheetDataExtractionResult {
  sheet1: any // Main nomination sheet (Daily or Weekly)
  sheet2: any // Quality sheet
  sheet3: any // Lists sheet
  shipper: any // Validated shipper data
  shipperCompare: any // Shipper for comparison (including inactive ones)
  contractCodeName: any // Validated contract code data
  contractCodeNameCompare: any // Contract code for comparison
  shipper_id: number
  contract_code_id: number
  reserveBalancingGasContract: any
}

@Injectable()
export class SheetDataExtractionService {
  private readonly logger = new Logger(SheetDataExtractionService.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateValidationService: TemplateValidationService
  ) {}

  /**
   * STEP 3-6: EXTRACT SHEET DATA AND VALIDATE
   * ดึงข้อมูลจาก sheet ต่างๆ และตรวจสอบความถูกต้อง
   *
   * @param findData - ข้อมูลจาก file ที่ parse แล้ว
   * @param checkType - ประเภทของ nomination (Daily/Weekly)
   * @returns SheetDataExtractionResult - ผลลัพธ์การดึงข้อมูลและตรวจสอบ
   */
  async executeSheetDataExtraction(findData: any[], checkType: string, nomination_type_id: number, sheet1:any, sheet2:any, sheet3:any): Promise<SheetDataExtractionResult> {
    try {

      // ===== STEP 4: HEADER VALIDATION =====
      // ตรวจสอบ header ที่จำเป็น
      this.logger.log('STEP 4')
      this.validateRequiredHeaders(sheet1)

      // ===== STEP 5: SHIPPER VALIDATION =====
      // ตรวจสอบข้อมูล shipper
      this.logger.log('STEP 5')
      const {shipper, shipperCompare} = await this.validateShipperData(sheet1)

      // ===== STEP 6: CONTRACT CODE VALIDATION =====
      // ตรวจสอบ contract code
      this.logger.log('STEP 6')
      const {contractCodeName, contractCodeNameCompare, reserveBalancingGasContract} = await this.validateContractCode(sheet1, checkType, nomination_type_id)

      // Extract IDs and start date for further processing
      const shipper_id = shipper?.id
      const contract_code_id = contractCodeName?.id
      

      this.logger.log('STEP 4-6: SHEET DATA EXTRACTION completed successfully')

      return {
        sheet1,
        sheet2,
        sheet3,
        shipper,
        shipperCompare,
        contractCodeName,
        contractCodeNameCompare,
        shipper_id,
        contract_code_id,
        reserveBalancingGasContract
      }
    } catch (error) {
      this.logger.error('Error in STEP 3-6: SHEET DATA EXTRACTION:', error)
      throw error
    }
  }

  // /**
  //  * STEP 3: EXTRACT SHEET DATA
  //  * ดึงข้อมูลจาก sheet ต่างๆ
  //  *
  //  * @param findData - ข้อมูลจาก file ที่ parse แล้ว
  //  * @param checkType - ประเภทของ nomination (Daily/Weekly)
  //  * @returns Object containing sheet1, sheet2, sheet3
  //  */
  // private extractSheetData(findData: any[], checkType: string) {
  //   // Find the main nomination sheet (Daily or Weekly)
  //   const sheet1 = findData.find((f: any) => {
  //     return f?.sheet === checkType
  //   })

  //   // Find the Quality sheet
  //   const sheet2 = findData.find((f: any) => {
  //     return f?.sheet === 'Quality'
  //   })

  //   if (!sheet2) {
  //     throw new HttpException(
  //       {
  //         status: HttpStatus.BAD_REQUEST,
  //         error: 'File template does not match the required format.'
  //       },
  //       HttpStatus.BAD_REQUEST
  //     )
  //   }

  //   // Find the Lists sheet
  //   const sheet3 = findData.find((f: any) => {
  //     return f?.sheet === 'Lists'
  //   })

  //   console.log('STEP 3: Sheet data extracted')

  //   return {
  //     sheet1,
  //     sheet2,
  //     sheet3
  //   }
  // }

  /**
   * STEP 4: HEADER VALIDATION
   * ตรวจสอบ header ที่จำเป็น
   *
   * @param sheet1 - Main nomination sheet
   * @throws HttpException if required headers are missing
   */
  private validateRequiredHeaders(sheet1: any) {
    // Validate required headers in the first row: ['SHIPPER ID', 'CONTRACT CODE', 'START DATE']
    let messageError = []
    if (sheet1?.data[0][0] !== 'SHIPPER ID') {
      messageError.push('Header SHIPPER ID Missing.')
      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'Header SHIPPER ID Missing.'
      //   },
      //   HttpStatus.BAD_REQUEST
      // )
    }
    this.logger.log('IN STEP 4 Shipper ID check pass...')

    if (sheet1?.data[0][1] !== 'CONTRACT CODE') {
      messageError.push('Header Contract Code is incorrect.')

      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'Header Contract Code is incorrect.'
      //   },
      //   HttpStatus.BAD_REQUEST
      // )
    }
    this.logger.log('IN STEP 4 CONTRACT CODE check pass...')

    if (sheet1?.data[0][2] !== 'START DATE') {
      messageError.push('Header START DATE Missing.')

      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'Header START DATE Missing.'
      //   },
      //   HttpStatus.BAD_REQUEST
      // )
    }
    this.logger.log('IN STEP 4 START DATE check pass...')

    if (!dayjs(sheet1?.data[1][2], 'DD/MM/YYYY', true).isValid()) {
      messageError.push('START DATE is not match template DD/MM/YYYY')
      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'START DATE is not match template DD/MM/YYYY'
      //   },
      //   HttpStatus.BAD_REQUEST
      // )
    }

    this.logger.log('STEP 4: Header validation passed')
    if(messageError?.length > 0){
       throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: messageError?.join("<br/>")
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  /**
   * STEP 5: SHIPPER VALIDATION
   * ตรวจสอบข้อมูล shipper
   *
   * @param sheet1 - Main nomination sheet
   * @returns Object containing validated shipper data and comparison data
   * @throws HttpException if shipper is not found or invalid
   */
  private async validateShipperData(sheet1: any) {
    // Find active shipper with valid date range
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const shipper = await this.prisma.group.findFirst({
      where: {
        id_name: sheet1?.data[1][0],
        status: true,
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      }
    })
    const shipperCompare = await this.prisma.group.findFirst({
      where: {
        id_name: sheet1?.data[1][0]
      }
    })

    if (!!!shipper && !!shipperCompare?.id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          // error: 'contract code not have system',
          error: 'Shipper is inactivated.'
        },
        HttpStatus.BAD_REQUEST
      )
    } else if (!!!shipperCompare?.id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Shipper ID is inactive.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    this.logger.log('STEP 5: Shipper validation passed')

    return {
      shipper,
      shipperCompare
    }
  }

  /**
   * STEP 6: CONTRACT CODE VALIDATION
   * ตรวจสอบ contract code
   *
   * @param sheet1 - Main nomination sheet
   * @returns Object containing contractCodeName and contractCodeNameCompare
   * @throws HttpException if contract code is not found or invalid
   */
  private async validateContractCode(sheet1: any, checkType: string, nomination_type_id: number) {
    // Find contract code with valid date range and approved status
    //
    const nomStartDate = getTodayNowDDMMYYYYDfaultAdd7(sheet1?.data[1][2])
    const ends = nomStartDate.toDate()
    const contractCodeName = await this.prisma.contract_code.findFirst({
      where: {
        contract_code: sheet1?.data[1][1],

        status_capacity_request_management: {
          id: {
            in: [2, 3, 5]
          }
        }
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
    })

    // Find contract code for comparison (including non-approved ones)
    const contractCodeNameCompare = await this.prisma.contract_code.findFirst({
      where: {
        contract_code: sheet1?.data[1][1]
      }
    })
    // Find reserve balancing gas contract
    const reserveBalancingGasContract = await this.prisma.reserve_balancing_gas_contract.findFirst({
      where: {
        res_bal_gas_contract: sheet1?.data[1][1]
        // reserve_balancing_gas_contract_detail: {
        //   some: {
        //     start_date: {
        //       lte: ends
        //     },
        //     end_date: {
        //       gte: ends
        //     },
        //   }
        // }
      },
      include: {
        group: true,
        reserve_balancing_gas_contract_detail: {
          include: {
            zone: true,
            area: true,
            entry_exit: true,
            nomination_point: true
          }
        }
      }
    })

    // สร้าง array สำหรับเก็บ error messages
    const validateList: string[] = []
    const firstNomValueColumn = 14 // คอลัมน์วันอาทิตย์
    // ตรวจสอบ status และวันที่เริ่มต้น/สิ้นสุดของสัญญา
    if (contractCodeName?.id) {
      // กรณีที่สัญญายังไม่เริ่มต้น (contract_start_date หลัง end_date)
      if (contractCodeName.contract_start_date > ends) {
        // ถ้าเป็น Weekly Nomination จะอนุญาตให้ส่งก่อนวันที่สัญญาเริ่ม หากอยู่ในสัปดาห์เดียวกัน
        if (isMatch(checkType, 'Weekly Nomination')) {
          const contractStart = dayjs(contractCodeName.contract_start_date).tz('Asia/Bangkok')
          // เช็กว่าสัญญาเริ่มต้นอยู่ในสัปดาห์เดียวกับ nomination
          if (contractStart.isSame(nomStartDate, 'week')) {
            //เช็กว่าค่าทั้งหมดในวันที่สัญญาที่ยังไม่เริ่มต้องว่าง
            this.templateValidationService.validateWeeklyDailyNominationDate(nomination_type_id, sheet1?.data[1][2], sheet1)
            const dayOfWeek = Number(contractStart.format('d')) // วันในสัปดาห์ (0 = Sunday, 6 = Saturday)
            if (sheet1?.data && Array.isArray(sheet1?.data) && sheet1?.data?.length > 3) {
              // วนลูปตรวจสอบทุกวันก่อนวันเริ่มต้นสัญญา (ตั้งแต่ Sunday ถึงวันก่อน contract_start_date)
              for (let dayOfWeekIndex = 0; dayOfWeekIndex < dayOfWeek; dayOfWeekIndex++) {
                const columnIndex = firstNomValueColumn + dayOfWeekIndex
                // เช็คว่ามีข้อมูลในคอลัมน์นั้นหรือไม่ (รวมทั้ง 0)
                const isNotEmpty = sheet1.data.slice(3).some((dataRow: any) => dataRow[columnIndex] || dataRow[columnIndex] === 0)
                if (isNotEmpty) {
                  // คำนวณวันที่จริงของคอลัมน์นั้น
                  const notEmptyDate = nomStartDate.add(dayOfWeekIndex, 'day').format('DD/MM/YYYY')
                  validateList.push(`${notEmptyDate} must be empty due to Contract Code is inactivated.`)
                }
              }
            }
          } else {
            // ถ้าอยู่คนละสัปดาห์กัน ให้ error เลย
            this.logger.log('HttpException 1')
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Contract Code is inactivated.'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        } else {
          // ถ้าไม่ใช่ Weekly Nomination ให้ error เลย
          this.logger.log('HttpException 2')
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Contract Code is inactivated.'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // กรณีที่สัญญาหมดอายุแล้ว
      // ดึงวันสิ้นสุดสัญญาจาก terminate_date, extend_deadline, หรือ contract_end_date (ตามลำดับ)
      const contractEndDate = contractCodeName.terminate_date ?? contractCodeName.extend_deadline ?? contractCodeName.contract_end_date
      if (contractEndDate <= ends) {
        this.logger.log('HttpException 3')
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Contract Code is inactivated.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      // ถ้าเป็น Weekly Nomination และสัญญาสิ้นสุดในสัปดาห์เดียวกันกับ nomination
      else if (isMatch(checkType, 'Weekly Nomination')) {
        const contractEnd = dayjs(contractEndDate).tz('Asia/Bangkok')
        if (contractEnd.isSame(nomStartDate, 'week')) {
          //เช็กว่าค่าทั้งหมดในวันที่สัญญาที่จบไปแล้วต้องว่าง
          this.templateValidationService.validateWeeklyDailyNominationDate(nomination_type_id, sheet1?.data[1][2], sheet1)
          let dayOfWeekIndex = Number(contractEnd.format('d')) // วันในสัปดาห์ (0 = Sunday, 6 = Saturday)
          if (sheet1?.data && Array.isArray(sheet1?.data) && sheet1?.data?.length > 3) {
            // วนลูปตรวจสอบทุกวันหลังวันสิ้นสุดสัญญา (ตั้งแต่ contract_end_date+1 ถึง Saturday)
            for (; dayOfWeekIndex < 7; dayOfWeekIndex++) {
              const columnIndex = firstNomValueColumn + dayOfWeekIndex
              // เช็คว่ามีข้อมูลในคอลัมน์นั้นหรือไม่ (รวมทั้ง 0)
              const isNotEmpty = sheet1.data.slice(3).some((dataRow: any) => dataRow[columnIndex] || dataRow[columnIndex] === 0)
              if (isNotEmpty) {
                // คำนวณวันที่จริงของคอลัมน์นั้น
                const notEmptyDate = nomStartDate.add(dayOfWeekIndex, 'day').format('DD/MM/YYYY')
                validateList.push(`${notEmptyDate} must be empty due to Contract Code is inactivated.`)
              }
            }
          }
        }
      }
    } else if (reserveBalancingGasContract?.id) {
      const reserveBalancingDetails = reserveBalancingGasContract.reserve_balancing_gas_contract_detail

      if (reserveBalancingDetails && reserveBalancingDetails.length > 0) {
        // Find min start_date and max end_date
        const startDates = reserveBalancingDetails.map((detail: any) => detail.start_date).filter((date: any) => date !== null)
        const endDates = reserveBalancingDetails.map((detail: any) => detail.end_date).filter((date: any) => date !== null)

        const minStartDate = startDates.length > 0 ? new Date(Math.min(...startDates.map((date: Date) => new Date(date).getTime()))) : null
        const maxEndDate = endDates.length > 0 ? new Date(Math.max(...endDates.map((date: Date) => new Date(date).getTime()))) : null

        if (!minStartDate || !maxEndDate) {
          this.logger.log('HttpException 4')
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Contract Code is inactivated.'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        // กรณีที่สัญญายังไม่เริ่มต้น (min start_date หลัง end_date)
        if (minStartDate > ends) {
          if (isMatch(checkType, 'Weekly Nomination')) {
            const contractStart = dayjs(minStartDate).tz('Asia/Bangkok')
            if (contractStart.isSame(nomStartDate, 'week')) {
              this.templateValidationService.validateWeeklyDailyNominationDate(nomination_type_id, sheet1?.data[1][2], sheet1)
              const dayOfWeek = Number(contractStart.format('d'))
              if (sheet1?.data && Array.isArray(sheet1?.data) && sheet1?.data?.length > 3) {
                for (let dayOfWeekIndex = 0; dayOfWeekIndex < dayOfWeek; dayOfWeekIndex++) {
                  const columnIndex = firstNomValueColumn + dayOfWeekIndex
                  const isNotEmpty = sheet1.data.slice(3).some((dataRow: any) => dataRow[columnIndex] || dataRow[columnIndex] === 0)
                  if (isNotEmpty) {
                    const notEmptyDate = nomStartDate.add(dayOfWeekIndex, 'day').format('DD/MM/YYYY')
                    validateList.push(`${notEmptyDate} must be empty due to Contract Code is inactivated.`)
                  }
                }
              }
            } else {
              this.logger.log('HttpException 5')
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'Contract Code is inactivated.'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            this.logger.log('HttpException 6')
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Contract Code is inactivated.'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        }

        // กรณีที่สัญญาหมดอายุแล้ว
        if (maxEndDate <= ends) {
          this.logger.log('HttpException 7')
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Contract Code is inactivated.'
            },
            HttpStatus.BAD_REQUEST
          )
        }
        // ถ้าเป็น Weekly Nomination และสัญญาสิ้นสุดในสัปดาห์เดียวกันกับ nomination
        else if (isMatch(checkType, 'Weekly Nomination') && maxEndDate) {
          const contractEnd = dayjs(maxEndDate).tz('Asia/Bangkok')
          if (contractEnd.isSame(nomStartDate, 'week')) {
            this.templateValidationService.validateWeeklyDailyNominationDate(nomination_type_id, sheet1?.data[1][2], sheet1)
            let dayOfWeekIndex = Number(contractEnd.format('d'))
            if (sheet1?.data && Array.isArray(sheet1?.data) && sheet1?.data?.length > 3) {
              for (; dayOfWeekIndex < 7; dayOfWeekIndex++) {
                const columnIndex = firstNomValueColumn + dayOfWeekIndex
                const isNotEmpty = sheet1.data.slice(3).some((dataRow: any) => dataRow[columnIndex] || dataRow[columnIndex] === 0)
                if (isNotEmpty) {
                  const notEmptyDate = nomStartDate.add(dayOfWeekIndex, 'day').format('DD/MM/YYYY')
                  validateList.push(`${notEmptyDate} must be empty due to Contract Code is inactivated.`)
                }
              }
            }
          }
        }
      }
    }

    // ถ้ามี error messages ให้ throw exception พร้อมรายการ errors ทั้งหมด
    if (validateList.length > 0) {
      const message = validateList.join('<br/>')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    }

    if (!!!contractCodeName?.id && !!contractCodeNameCompare?.id && !!!reserveBalancingGasContract?.id) {
      if (contractCodeNameCompare?.status_capacity_request_management_id === 3) {
        // 3 = Rejected
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Nomination upload not allowed : Capacity Right is rejected.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      this.logger.log('HttpException 8')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code is inactivated.'
        },
        HttpStatus.BAD_REQUEST
      )
    } else if (!!!contractCodeNameCompare?.id && !!!reserveBalancingGasContract?.id) {
      this.logger.log('HttpException 9')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code is incorrect.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // check terminate
    if (contractCodeName?.status_capacity_request_management_id === 5) {
      // if(getTodayNowAdd7(contractCodeName?.terminate_date).isSameOrBefore(getTodayNowAdd7())){
      if (getTodayNowAdd7(contractCodeName?.terminate_date).isBefore(getTodayNowDDMMYYYYDfaultAdd7(sheet1?.data[1][2]))) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Contract Code is inactivated.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    this.logger.log('STEP 6: Contract code validation passed')

    return {
      contractCodeName,
      contractCodeNameCompare,
      reserveBalancingGasContract,
    }
  }

  // **** ยังไม่ได้ใช้ ****
  // Nomination > Submission File > Daily > Validate เรื่องถ้าพบว่า Point Type Entry รายการนั้นในเทมเพลตระบุมาไม่ครบ ทั้งสองหน่วย จะต้องเอาเข้าระบบไม่ได้ ขึ้แจ้งเตือน Unit {MMSCFH} is not valid for Entry points {Nomination point name}.
  // ยกตัวอย่างเช่น Point S_GSP1 เป็น Entry และในไฟล์ระบุมาแค่ Row Unit MMBTU/D ขาด Row MMSCFD ไป จะต้องเอาเข้าไม่ได้
  // หมายเหตุ : ทำทั้ง Daily และ Weekly
  analyzeEntryUnits(sheet1: {data: any[]}): any {
    const rows = Array.isArray(sheet1?.data) ? sheet1.data.slice(2) : []

    // เงื่อนไขหลัก: คีย์ '10' ต้องเป็น Entry
    const entryRows = rows.filter((r) => {
      const entryExit = String(r?.['10'] ?? '')
        .trim()
        .toLowerCase()
      return entryExit === 'entry'
    })

    // จัดกลุ่มตามคีย์ '3'
    const groups = new Map<
      string,
      {
        units: Set<string>
        rows: any[]
      }
    >()

    for (const r of entryRows) {
      const name = String(r?.['3'] ?? '').trim()
      if (!name) continue

      const unit = String(r?.['9'] ?? '')
        .trim()
        .toUpperCase() // 'MMBTU/D' | 'MMSCFD' (หรืออันอื่น)
      const g = groups.get(name) ?? {
        units: new Set<string>(),
        rows: []
      }
      g.units.add(unit)
      g.rows.push(r)
      groups.set(name, g)
    }

    const REQUIRED_UNITS = new Set(['MMBTU/D', 'MMSCFD'])

    const completeGroups: Record<string, any[]> = {}
    const incompleteRows: any[] = []

    for (const [name, g] of groups) {
      const hasAll = [...REQUIRED_UNITS].every((u) => g.units.has(u))

      if (hasAll) {
        // กลุ่มที่ครบทั้ง 2 unit → เก็บเฉพาะแถวที่ unit เป็น 2 แบบนี้
        const picked = g.rows.filter((r) =>
          REQUIRED_UNITS.has(
            String(r?.['9'] ?? '')
              .trim()
              .toUpperCase()
          )
        )
        completeGroups[name] = picked
      } else {
        // ขาด unit ใด unit หนึ่ง → เก็บทั้ง object ของกลุ่มนั้น
        incompleteRows.push(...g.rows)
      }
    }

    return {
      completeGroups,
      incompleteRows
    }
  }
}
