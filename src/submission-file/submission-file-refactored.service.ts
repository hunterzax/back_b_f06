import {HttpException, HttpStatus, Inject, Injectable, Logger} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as XLSX from 'xlsx-js-style'
// import * as XlsxPopulate from 'xlsx-populate';
import * as fs from 'fs'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {UploadTemplateForShipperService} from 'src/upload-template-for-shipper/upload-template-for-shipper.service'
// import { CapacityV2Service } from 'src/capacity-v2/capacity-v2.service';
import {QueryShipperNominationFileService} from 'src/query-shipper-nomination-file/query-shipper-nomination-file.service'
import {InitialSetupService} from './services/initial-setup.service'
import {FileTypeValidationService} from './services/file-type-validation.service'
import {SheetDataExtractionService} from './services/sheet-data-extraction.service'
import {StatusValidationService} from './services/status-validation.service'
import {TemplateValidationService} from './services/template-validation.service'
import {DataProcessingService} from './services/data-processing.service'
import {
  getTodayEnd,
  getTodayEndAdd7,
  getTodayEndDDMMYYYYAdd7,
  getTodayEndDDMMYYYYDfaultAdd7,
  getTodayNow,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYDfault,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayStart,
  getTodayStartAdd7,
  getTodayStartDDMMYYYYAdd7,
  getTodayStartDDMMYYYYDfaultAdd7
} from 'src/common/utils/date.util'
import {uploadFilsTemp} from 'src/common/utils/uploadFileIn'
import {parseToNumber, parseToNumber3Decimal, parseToNumber6Decimal} from 'src/common/utils/number.util'
import {isMatch} from 'src/common/utils/allocation.util'
import {HandleReserveBalancingGasContractService} from './services/handle-reserve-balancing-gas-contract-service'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

const headNom = [
  'Zone',
  'Supply/Demand',
  'Area',
  'POINT_ID',
  'WI/HV',
  // 'W/HV',
  'Park/UnparkInstructed Flows',
  'Type',
  'Area_Code',
  'Subarea_Code',
  'Unit',
  'Entry_Exit',
  'WI',
  'HV',
  'SG'
]
// const headNomSheet2 = ['Zone', 'Point', 'CO2', 'C1', 'C2', 'C3', 'iC4', 'nC4', 'iC5', 'nC5', 'C6', 'C7', 'C2+', 'N2', 'O2', 'H2S', 'S', 'Hg']
const headNomSheet2 = ['Zone', 'Point', 'CO2 (%mol)', 'C1 (%mol)', 'C2 (%mol)', 'C3 (%mol)', 'iC4 (%mol)', 'nC4 (%mol)', 'iC5 (%mol)', 'nC5 (%mol)', 'C6 (%mol)', 'C7 (%mol)', 'C2+ (%mol)', 'N2 (%mol)', 'O2 (%mol)', 'H2S (%mol)', 'S (%mol)', 'Hg (%mol)'] // https://app.clickup.com/t/9018502823/86etzcgr8

const headNomSheet3 = [
  [], // Row 0
  ['Supply/Demand'], // Row 1
  ['Supply'],
  ['Demand'],
  [],
  [],
  [],
  ['WI/HV'],
  ['East WI'],
  ['East HV'],
  ['East-West WI'],
  ['East-West HV'],
  ['West WI'],
  ['West HV'],
  [],
  [],
  ['Park/Unpark-Instructed Flows'],
  ['Unpark'],
  ['Instructed_Entry'],
  ['Park'],
  ['Instructed_Exit'],
  ['Shrinkage_Volume'],
  ['Min_Inventory_Change'],
  ['Exchange_Min_Inventory'],
  [],
  [],
  ['Type'],
  ['Sales GSP'],
  ['Bypass Gas'],
  ['Common Header'],
  ['Super Header'],
  ['LNG'],
  ['W-SUPPLY'],
  ['Other'],
  ['SPP'],
  ['IND'],
  ['NGV'],
  ['NGD'],
  ['FUEL'],
  ['EGAT'],
  ['IPP'],
  [],
  [],
  [],
  ['Unit'],
  ['MMBTU/D'],
  ['MMSCFD'],
  ['MMSCFH'],
  ['%'],
  ['BTU/SCF'],
  ['Unitless'],
  ['%.MOL'],
  ['PPM.VOL'],
  ['PPM.VOL.DEG'],
  ['microG.M3'],
  ['PPM.WEIGHT'],
  ['LB.MMSCF'],
  ['DEG.F'],
  ['MJ/m3'],
  [],
  [],
  [],
  [],
  ['Entry_Exit'],
  ['Entry'],
  ['Exit'],
  [],
  [],
  ['Quality Parameters'],
  ['CO2'],
  ['C1'],
  ['C2'],
  ['C3'],
  ['iC4'],
  ['nC4'],
  ['iC5'],
  ['nC5'],
  ['C6'],
  ['C7'],
  ['C2+'],
  ['N2'],
  ['O2'],
  ['H2S'],
  ['S'],
  ['Hg'],
  ['Total'],
  ['LHV dry'],
  ['LHV sat'],
  ['HHV dry'],
  ['HHV sat (Btu/scf)'],
  ['SG'],
  ['WI : HHVdry/sqrt(SG)'],
  ['WI : MJ/m3']
]

const daily = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', 'Total']

@Injectable()
export class SubmissionFileRefactoredService {
  private readonly logger = new Logger(SubmissionFileRefactoredService.name)
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    // private readonly capacityV2Service: CapacityV2Service,
    private readonly uploadTemplateForShipperService: UploadTemplateForShipperService,
    private readonly queryShipperNominationFileService: QueryShipperNominationFileService,

    private readonly initialSetupService: InitialSetupService,
    private readonly fileTypeValidationService: FileTypeValidationService,
    private readonly sheetDataExtractionService: SheetDataExtractionService,
    private readonly statusValidationService: StatusValidationService,
    private readonly templateValidationService: TemplateValidationService,
    private readonly dataProcessingService: DataProcessingService,
    private readonly handleReserveBalancingGasContractService: HandleReserveBalancingGasContractService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  isMoreThan3Decimals(num: any) {
    if (typeof num !== 'number' || isNaN(num)) return false
    const parts = num.toString().split('.')
    if (parts.length === 2 && parts[1].length > 3) {
      return true // เกิน 3 ตำแหน่ง
    }
    return false
  }

  /**
   * Validates weekly nomination data structure
   * Checks that date columns (14-20) contain 7 consecutive days
   * starting from the provided startDateExConv
   *
   * @param sheetData - The sheet data to validate
   * @param startDateExConv - The start date for validation
   * @returns Boolean indicating if validation passed
   */
  validateDataWeekly(sheetData: any, startDateExConv: any): boolean {
    // Validate 7 consecutive days starting from startDateExConv
    for (let i = 14; i <= 20; i++) {
      const expectedDate = dayjs(startDateExConv)
        .add(i - 14, 'day')
        .format('DD/MM/YYYY')
      const actualDate = sheetData[i.toString()]

      if (actualDate !== expectedDate) {
        return false // Fail immediately if any date doesn't match expected sequence
      }
    }

    return true // All date validations passed
  }

  /**
   * ===== DEADLINE VALIDATION METHODS =====
   * Functions to check submission and renomination deadlines
   */

  /**
   * Checks if nomination submission is within deadline or requires renomination
   * Handles both daily and weekly nomination types with appropriate deadline logic
   *
   * @param nowAts - Current timestamp
   * @param startDateExConv - Nomination start date
   * @param nominationDeadlineSubmission - Submission deadline configuration
   * @param nominationDeadlineReceptionOfRenomination - Renomination deadline configuration
   * @param type - Nomination type (1 = Daily, 2 = Weekly)
   * @returns Boolean or null indicating deadline status
   */

  // ก่อน deadline
  // check deadline ?
  ckDateInfoNomDailyAndWeeklyNew(nowAts: any, startDateExConv: any, nominationDeadlineSubmission: any, nominationDeadlineReceptionOfRenomination: any, type: any) {
    this.logger.log('[DEBUG][ckDateInfoNomDailyAndWeeklyNew] type=', type)
    this.logger.log('[DEBUG][ckDateInfoNomDailyAndWeeklyNew] startDateExConv=', dayjs(startDateExConv).format('YYYY-MM-DD HH:mm:ss'))
    this.logger.log('[DEBUG][ckDateInfoNomDailyAndWeeklyNew] submission=', nominationDeadlineSubmission)
    this.logger.log('[DEBUG][ckDateInfoNomDailyAndWeeklyNew] renom=', nominationDeadlineReceptionOfRenomination)
    this.logger.log('[DEBUG][ckDateInfoNomDailyAndWeeklyNew] todayDate=', dayjs().format('YYYY-MM-DD HH:mm:ss'))

    if (process.env.NODE_ENV === 'development') {
      return false
    }

    // READ THIS BRO
    // ความหมายของ Deadline แต่ละตัว
    // 1. Submission > Before Gas Day 2 เวลา 10:00 หมายถึงว่า ในไฟล์ระบุ Gas Day เป็น 05/11/2026 เพราะฉะนั้น deadline ที่สามารถจะเอาไฟล์ Nom นี้เข้าระบบได้ คือวันที่ 03/11/2026 ภายในเวลา 10.00 (เมื่อ Upload เข้าไปแล้วที่ Column Renomination จะเป็น NO)
    // 2. Reception of renomination > Before Gas Day 2 เวลา 23:00 หมายถึงว่า ในไฟล์ระบุ Gas Day เป็น 05/11/2026 เพราะฉะนั้น deadline ที่สามารถจะเอาไฟล์ Nom นี้เข้าระบบได้ คือวันที่ 03/11/2026 ภายในเวลา 23.00 (Column Renomination เป็น YES) ถ้าพ้นวันที่และเวลาของตัวนี้ไปแล้ว จะไม่สามารถเอาไฟล์ Nom เข้าระบบได้อีกเลย

    // error: 'Start Date is over submission deadline.', // https://app.clickup.com/t/86etzcgxn
    const allowedDate = nowAts
      // .add(nominationDeadlineSubmission?.before_gas_day, 'day') // เดิมโรงงาน
      .subtract(nominationDeadlineSubmission?.before_gas_day, 'day')
      .set('hour', nominationDeadlineSubmission?.hour)
      .set('minute', nominationDeadlineSubmission?.minute)
      .startOf('minute')

    // เขียนฟังก์ชั่นเช็คเวลา nominationDeadlineSubmission ว่า
    /**
     * คำนวณ upload ได้ไม่ได้
     * - today < baseDate => false
     * - today > baseDate => true
     * - today == baseDate => now > deadlineTime ? true : false
     */
    // --------- kom ---------
    // CASE ไม่มีทั้งคู่
    if (!nominationDeadlineSubmission && !nominationDeadlineReceptionOfRenomination) {
      this.logger.log(`[ERROR] ckDateInfoNomDailyAndWeeklyNew: Not found submission or receptions renomination deadline`)
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Start Date is over submission deadline.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const gd = (dayjs.isDayjs(startDateExConv) ? startDateExConv : dayjs(startDateExConv)).add(7, 'hour')
    // วันเดดไลน์ = gas_day - before_gas_day (เวลา 00:00)
    const deadline_submission = gd.subtract(nominationDeadlineSubmission?.before_gas_day ?? 0, 'day').startOf('day')

    const todayDate = dayjs().startOf('day')

    // CASE - ไม่ถึงวัน submission deadline
    if (todayDate.isBefore(deadline_submission)) {
      // ยังไม่ถึงวัน deadline_submission → อนุญาต
      return false
    }
    // ถ้าปัจจุบันตรงกับ submission เดดไลน์ เช็คเวลา
    if (todayDate.isSame(deadline_submission)) {
      const deadlineTime = deadline_submission
        .hour(nominationDeadlineSubmission?.hour ?? 0)
        .minute(nominationDeadlineSubmission?.minute ?? 0)
        .second(0)
        .millisecond(0)

      // เลยเวลาเดดไลน์แล้วหรือยัง
      const is_it_in_time_deadline = dayjs().isAfter(deadlineTime) // เลยเวลามาหรือยัง
      if (!is_it_in_time_deadline) {
        // ยังไม่เลย ผ่านได้
        return false
      } else {
        // CASE เลยวัน deadline ไปแล้ว → ให้เช็ค renom นะวัยรุ่น
        if (!nominationDeadlineReceptionOfRenomination) {
          // CASE - ไม่มี renom
          this.logger.log(`[ERROR] ckDateInfoNomDailyAndWeeklyNew: Not found receptions renomination deadline`)
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Start Date is over submission deadline.'
            },
            HttpStatus.BAD_REQUEST
          )
        } else {
          // CASE - มี renom
          const renom_deadline_submission = gd.subtract(nominationDeadlineReceptionOfRenomination?.before_gas_day ?? 0, 'day').startOf('day')

          if (todayDate.isBefore(renom_deadline_submission)) {
            // ยังไม่ถึงวัน renom deadline → อนุญาต
            return true
          }

          // CASE - เช็คเวลา renom deadline
          const renomDeadlineTime = renom_deadline_submission
            .hour(nominationDeadlineReceptionOfRenomination?.hour ?? 0)
            .minute(nominationDeadlineReceptionOfRenomination?.minute ?? 0)
            .second(0)
            .millisecond(0)

          const is_it_in_time_renom_deadline = dayjs().isAfter(renomDeadlineTime) // เลยเวลามาหรือยัง
          if (!is_it_in_time_renom_deadline) {
            // CASE - ยังไม่เลยเวลา renom deadline ผ่านได้
            return true
          } else {
            // CASE - เลยเวลา renom deadline
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Start Date is over Reception of renomination deadline.'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }
    } else {
      // CASE เลยวัน deadline ไปแล้ว → ให้เช็ค renom นะวัยรุ่น
      if (!nominationDeadlineReceptionOfRenomination) {
        // CASE - ไม่มี renom
        this.logger.log(`[ERROR] ckDateInfoNomDailyAndWeeklyNew: Not found receptions renomination deadline`)
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Start Date is over submission deadline.'
          },
          HttpStatus.BAD_REQUEST
        )
      } else {
        // CASE - มี renom
        const renom_deadline_submission = gd.subtract(nominationDeadlineReceptionOfRenomination?.before_gas_day ?? 0, 'day').startOf('day')

        if (todayDate.isBefore(renom_deadline_submission)) {
          // ยังไม่ถึงวัน renom deadline → อนุญาต
          return true
        }

        // CASE - เช็คเวลา renom deadline
        const renomDeadlineTime = renom_deadline_submission
          .hour(nominationDeadlineReceptionOfRenomination?.hour ?? 0)
          .minute(nominationDeadlineReceptionOfRenomination?.minute ?? 0)
          .second(0)
          .millisecond(0)

        const is_it_in_time_renom_deadline = dayjs().isAfter(renomDeadlineTime) // เลยเวลามาหรือยัง
        if (!is_it_in_time_renom_deadline) {
          // CASE - ยังไม่เลยเวลา renom deadline ผ่านได้
          return true
        } else {
          // CASE - เลยเวลา renom deadline
          this.logger.log(`[ERROR] ckDateInfoNomDailyAndWeeklyNew: start date (${startDateExConv.format('YYYY-MM-DD')}) is over renom ${nowAts.format('YYYY-MM-DD HH:mm:ss')}`)
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Start Date is over Reception of renomination deadline.'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }
  }

  /**
   * ===== DATE MATCHING METHODS =====
   * Functions to find matching date keys in various formats
   */

  /**
   * Finds matching key for MM/YYYY format dates
   * Used for monthly period matching in contracts
   *
   * @param startDateExConv - The date to match
   * @param headerEntry - Header entries to search through
   * @returns String key if found, null otherwise
   */
  findMatchingKeyMMYYYY(startDateExConv: any, headerEntry: any): string | null {
    const targetMonth = startDateExConv.month() // Target month (0 = January)
    const targetYear = startDateExConv.year() // Target year

    // Search through all header entries for month/year match
    for (const date in headerEntry) {
      const currentDate = dayjs(date, 'DD/MM/YYYY')
      const currentMonth = currentDate.month()
      const currentYear = currentDate.year()

      if (currentMonth === targetMonth && currentYear === targetYear) {
        return headerEntry[date].key // Return key if month/year match
      }
    }

    return null // No match found
  }

  /**
   * Finds exact matching key for DD/MM/YYYY format dates
   * Used for daily period matching in contracts
   *
   * @param startDateExConv - The date to match
   * @param headerEntry - Header entries to search through
   * @returns String key if found, null otherwise
   */
  findExactMatchingKeyDDMMYYYY(startDateExConv: any, headerEntry: any): string | null {
    const targetDate = startDateExConv.format('DD/MM/YYYY') // Format target date consistently

    // Search through all header entries for exact date match
    for (const date in headerEntry) {
      if (date === targetDate) {
        return headerEntry[date].key // Return key if exact date match
      }
    }

    return null // No exact match found
  }

  /**
   * ===== DATA TRANSFORMATION METHODS =====
   * Functions to convert data between different formats
   */

  /**
   * Transforms array data to object format with indexed keys
   * Converts row arrays to objects with numeric indices as keys
   *
   * @param data - Array data to transform
   * @returns Transformed data with object structure
   */
  transformColumn(data: any) {
    return data.map((item: any) => ({
      ...item,
      row: Object.fromEntries(item.row.map((value: any, index: number) => [index, value]))
    }))
  }

  /**
   * Transforms flat array to object with indexed keys
   *
   * @param data - Flat array to transform
   * @returns Object with numeric indices as keys
   */
  transformColumnDF(data: any) {
    return Object.fromEntries(data.map((value: any, index: number) => [index, value]))
  }

  /**
   * Formats number to three decimal places with thousand separators
   *
   * @param number - Number to format
   * @returns Formatted string with 3 decimals and thousand separators
   */
  // formatNumberThreeDecimal(number: any) {
  //   if (isNaN(number)) return number; // Handle invalid numbers gracefully

  //   // Convert to fixed 3-decimal format
  //   const fixedNumber = parseFloat(number).toFixed(3);

  //   // Add thousand separators
  //   return fixedNumber.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // }

  // เติมทศนิยม 3 ตำแหน่ง new
  formatNumberThreeDecimal(number: any) {
    // คืนค่าตามเดิมถ้าไม่ใช่ตัวเลข ไม่ปัดเศษ
    const n = Number(number)
    if (!Number.isFinite(n)) return number

    const sign = n < 0 ? '-' : ''
    const abs = Math.abs(n)

    // ตัดทศนิยมให้เหลือ 3 ตำแหน่ง (ไม่ปัด)
    const truncated = Math.floor(abs * 1000) / 1000

    // แยกส่วนจำนวนเต็ม/ทศนิยมแล้วจัดรูปแบบ
    const [i, d = ''] = truncated.toString().split('.')
    const intWithComma = i?.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const dec = d.padEnd(3, '0') // ให้ครบ 3 หลักเสมอ

    return `${sign}${intWithComma}.${dec}`
  }

  ensure3DecimalPlaces(numStr: any, text: any, point?: any): any {
    if (numStr === '') {
      // Missing required data: HV, WI, and SG must be provided for Entry points using MMSCFD unit.
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: `Missing required data: HV, WI, and SG must be provided for Entry points using MMSCFD unit.`
        },
        HttpStatus.FORBIDDEN
      )
    }
    const s = String(numStr).trim()
    const s2 = s.replace(/,/g, '')

    if (!/^[+-]?\d+(\.\d*)?$/.test(s2)) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: `Point ${point} ${text}: Invalid input. Only numeric values are allowed in these columns.` // https://app.clickup.com/t/86euzxxgg
        },
        HttpStatus.FORBIDDEN
      )
      // throw new Error(`Invalid number format: "${numStr}"`);
    }

    const [intPart, fracPart = ''] = s.split('.')
    if (fracPart.length > 3) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: `Invalid format: Column ${text} must have exactly 3 decimal places (e.g., 0.000).`
        },
        HttpStatus.FORBIDDEN
      )
    }

    return `${intPart}.${fracPart.padEnd(3, '0')}`
  }

  ensure3DecimalPlacesSG(numStr: any, text: any, point?: any): any {
    if (numStr === '') {
      // Missing required data: HV, WI, and SG must be provided for Entry points using MMSCFD unit.
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: `Missing required data: HV, WI, and SG must be provided for Entry points using MMSCFD unit.`
        },
        HttpStatus.FORBIDDEN
      )
    }
    const s = String(numStr).trim()
    const s2 = s.replace(/,/g, '')

    if (!/^[+-]?\d+(\.\d*)?$/.test(s2)) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: `Point ${point} ${text}: Invalid input. Only numeric values are allowed in these columns.` // https://app.clickup.com/t/86euzxxgg
        },
        HttpStatus.FORBIDDEN
      )
      // throw new Error(`Invalid number format: "${numStr}"`);
    }
  }

  validateDecimal3(value: any, point: any) {
    if (value === null || value === undefined || value === '') return

    const str = String(value)

    // เช็ค format ตัวเลขก่อน (กันพวก abc)
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          // error: 'contract code ไม่ตรง & shipper id ไม่ตรง',
          error: `Point [${point}] (${value}) Total Invalid number format`
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const decimalPart = str.split('.')[1]

    if (decimalPart && decimalPart.length > 3) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          // error: 'contract code ไม่ตรง & shipper id ไม่ตรง',
          error: `Point [${point}] (${value}) Total Decimal must not exceed 3 digits`
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return Number(value)
  }

  /**
   * Main upload file method for processing nomination files
   *
   * @param file - Processed file data from gRPC service
   * @param fileOriginal - Original uploaded file object
   * @param userId - User ID from JWT token
   * @param comment - Optional comment for submission
   * @param tabType - Nomination type (1 = Daily, 2 = Weekly)
   * @returns Processed upload result
   */
  // deadline

  // ....
  async uploadFile(file: any, fileOriginal: any, userId: any, comment: any, tabType: any) {
    let renom = null
    // ===== STEP 1: INITIAL SETUP =====
    const {todayStart, todayEnd, nowAts, gAuserType, zoneQualityMaster} = await this.initialSetupService.executeInitialSetup(userId)

    // ===== STEP 2-3: FILE TYPE VALIDATION Head Table =====
    let {findData, checkType, nomination_type_id, sheet1, sheet2, sheet3, startDateEx} = await this.fileTypeValidationService.executeFileTypeValidation(file, tabType, headNom, headNomSheet2)

    // ===== STEP 4-6: EXTRACT SHEET DATA AND VALIDATE =====
    let {shipper, shipperCompare, contractCodeName, contractCodeNameCompare, shipper_id, contract_code_id, reserveBalancingGasContract} = await this.sheetDataExtractionService.executeSheetDataExtraction(findData, checkType, nomination_type_id, sheet1, sheet2, sheet3)

    // ===== STEP 7-11: STATUS AND PERMISSION VALIDATION =====
    await this.statusValidationService.executeStatusValidation(shipper_id, shipperCompare, contract_code_id, contractCodeNameCompare, contractCodeName, shipper, gAuserType, sheet1, reserveBalancingGasContract)

    // ===== STEP 12-16: TEMPLATE AND CAPACITY VALIDATION =====
    const {contractCode, nominationDeadlineSubmission, nominationDeadlineReceptionOfRenomination} = !!reserveBalancingGasContract?.id
      ? await this.templateValidationService.executeTemplateValidationReserveBalancingGasContract(shipper_id, reserveBalancingGasContract.id, nomination_type_id, gAuserType, todayStart, todayEnd, startDateEx, sheet1)
      : await this.templateValidationService.executeTemplateValidation(shipper_id, contract_code_id, nomination_type_id, gAuserType, todayStart, todayEnd, startDateEx, sheet1, contractCodeName)

    // ===== STEP 17-22: DATA PROCESSING SETUP AND VALIDATION =====
    let {startDateExConv, getsValue, getsValueSheet2, caseData, informationData, fullDataRow, flagEmtry, nominationPoint, nonTpa, conceptPoint} = await this.dataProcessingService.executeDataProcessing(startDateEx, todayStart, todayEnd, sheet2, nomination_type_id)

    // ===== STEP 23: Renom VALIDATION =====
    if (checkType && checkType === 'Daily Nomination') {
      renom = this.ckDateInfoNomDailyAndWeeklyNew(getTodayNow(), startDateExConv, nominationDeadlineSubmission, nominationDeadlineReceptionOfRenomination, 1)
    } else {
      renom = this.ckDateInfoNomDailyAndWeeklyNew(getTodayNow(), startDateExConv, nominationDeadlineSubmission, nominationDeadlineReceptionOfRenomination, 2)
    }

    // ===== STEP 24: DATA SHEET FORMAT =====
    sheet1 = {
      ...sheet1,
      data: [
        [],
        this.uploadTemplateForShipperService.objToArr(sheet1?.data[0]),
        this.uploadTemplateForShipperService.objToArr(sheet1?.data[1]),
        [...this.uploadTemplateForShipperService.objToArr(sheet1?.data[2])],
        ...sheet1?.data.slice(3).map((e: any) => this.uploadTemplateForShipperService.objToArr(e))
      ]
    }
    sheet1.data = sheet1.data?.map((sd: any) => {
      const sdA = sd?.map((sdA: any) => {
        let valuesDa = sdA
        valuesDa = valuesDa?.trim()?.replace(/,/g, '')
        if (valuesDa && valuesDa.startsWith('(') && valuesDa.endsWith(')')) {
          valuesDa = '-' + valuesDa.slice(1, -1)
        }
        return valuesDa
      })
      return sdA
    })
    sheet2 = {
      ...sheet2,
      data: [[], [...this.uploadTemplateForShipperService.truncateArrayHeadSheet2(this.uploadTemplateForShipperService.objToArr(sheet2.data[0]))], ...sheet2?.data.slice(1).map((e: any) => this.uploadTemplateForShipperService.truncateArrayHeadSheet2(this.uploadTemplateForShipperService.objToArr(e)))]
    }
    sheet3 = {
      ...sheet3,
      data: headNomSheet3
    }
    let messageError: any = []

    // ===== STEP 24-25: DATA PROCESSING NOM CONCEPT AND VALIDATION =====
    if (checkType && checkType === 'Daily Nomination') {
      // 'Daily Nomination'

      // สร้าง array สำหรับเก็บ error messages
      const validateListForWiHvSg: string[] = []
      for (let i = 0; i < sheet1?.data.length; i++) {
        const zoneCk = sheet1?.data[i][0] || null
        const supplyDemandCk = sheet1?.data[i][1] || null
        const areaCk = sheet1?.data[i][2] || null
        // const pointIdCk = sheet1?.data[i][3] || null;  // เดิมโรงงาน
        const pointIdCk = sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5] || null
        const wHvCk = sheet1?.data[i][4] || null
        const parkUnparkInstructedFlowsCk = sheet1?.data[i][5] || null
        const typeCk = sheet1?.data[i][6] || null
        const areaCodeCk = sheet1?.data[i][7] || null
        const subareaCodeCk = sheet1?.data[i][8] || null
        const unitCk = sheet1?.data[i][9] || null
        const entryExitCk = sheet1?.data[i][10] || null
        const wiCk = sheet1?.data[i][11] || null
        const hvCk = sheet1?.data[i][12] || null
        const sgCk = sheet1?.data[i][13] || null
        const hr1Ck = sheet1?.data[i][14] || null
        const hr2Ck = sheet1?.data[i][15] || null
        const hr3Ck = sheet1?.data[i][16] || null
        const hr4Ck = sheet1?.data[i][17] || null
        const hr5Ck = sheet1?.data[i][18] || null
        const hr6Ck = sheet1?.data[i][19] || null
        const hr7Ck = sheet1?.data[i][20] || null
        const hr8Ck = sheet1?.data[i][21] || null
        const hr9Ck = sheet1?.data[i][22] || null
        const hr10Ck = sheet1?.data[i][23] || null
        const hr11Ck = sheet1?.data[i][24] || null
        const hr12Ck = sheet1?.data[i][25] || null
        const hr13Ck = sheet1?.data[i][26] || null
        const hr14Ck = sheet1?.data[i][27] || null
        const hr15Ck = sheet1?.data[i][28] || null
        const hr16Ck = sheet1?.data[i][29] || null
        const hr17Ck = sheet1?.data[i][30] || null
        const hr18Ck = sheet1?.data[i][31] || null
        const hr19Ck = sheet1?.data[i][32] || null
        const hr20Ck = sheet1?.data[i][33] || null
        const hr21Ck = sheet1?.data[i][34] || null
        const hr22Ck = sheet1?.data[i][35] || null
        const hr23Ck = sheet1?.data[i][36] || null
        const hr24Ck = sheet1?.data[i][37] || null
        const totalCk = sheet1?.data[i][38] || null
        if (i > 3) {
          // https://app.clickup.com/t/9018502823/86ev29wzy
          const ckDup = sheet1?.data?.filter((f:any) => {
            return (
              (f?.[0] || null) === zoneCk &&
              (f?.[1] || null) === supplyDemandCk &&
              (f?.[2] || null) === areaCk &&
              (f?.[3] || null) === (sheet1?.data[i][3] || null) &&
              (f?.[4] || null) === wHvCk &&
              (f?.[5] || null) === parkUnparkInstructedFlowsCk &&
              (f?.[6] || null) === typeCk &&
              (f?.[7] || null) === areaCodeCk &&
              (f?.[8] || null) === subareaCodeCk &&
              (f?.[9] || null) === unitCk &&
              (f?.[10] || null) === entryExitCk
            )
          })
          if(ckDup?.length > 1){
              messageError.push(`Duplicate value entries found for ${sheet1?.data[i][3] || pointIdCk}.`) // https://app.clickup.com/t/9018502823/86ev29wzy
          }else{
            if(parkUnparkInstructedFlowsCk === "Instructed_Entry"){
              console.log('parkUnparkInstructedFlowsCk : ', parkUnparkInstructedFlowsCk);
              console.log('ckDup : ', ckDup);
              console.log('sheet1?.data : ', sheet1?.data);
              console.log('- - -');
            }
          }

          if (zoneCk === '*') {
            break
          }

          if (!!totalCk) {
            //
            this.validateDecimal3(totalCk, pointIdCk)
          }

          for (let iW = 1; iW <= 24; iW++) {
            if (this.isMoreThan3Decimals(parseToNumber(sheet1?.data[i][14 + iW - 1] ?? 0))) {
              messageError.push(`Point ${pointIdCk || '-'} | Unit ${unitCk || '-'} | Hour ${iW} | Value ${parseToNumber(sheet1?.data[i][14 + iW - 1] ?? 0)} | The value must contain 3 decimal places.`)
              // throw new HttpException(
              //   {
              //     status: HttpStatus.BAD_REQUEST,
              //     error: `Point ${pointIdCk || '-'} | Unit ${unitCk || '-'} | Hour ${iW} | Value ${parseToNumber(sheet1?.data[i][14 + iW - 1] ?? 0)} | The value must contain 3 decimal places.`
              //   },
              //   HttpStatus.BAD_REQUEST
              // )
            }
          }
          const ckflagEmtry = [hr1Ck, hr2Ck, hr3Ck, hr4Ck, hr5Ck, hr6Ck, hr7Ck, hr8Ck, hr9Ck, hr10Ck, hr11Ck, hr12Ck, hr13Ck, hr14Ck, hr15Ck, hr16Ck, hr17Ck, hr18Ck, hr19Ck, hr20Ck, hr21Ck, hr22Ck, hr23Ck, hr24Ck].every((item) => item === null)
          if (ckflagEmtry) {
            flagEmtry = true
          }

          fullDataRow.push({
            ix: i,
            row: sheet1?.data[i]
          })

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === pointIdCk
          })
          if (areaCk && !checkNominationPoint) {
            console.log('1')
            const nomName = sheet1?.data[i][3] || pointIdCk
            const nomFind = await this.prisma.nomination_point.findFirst({
              where: {
                nomination_point: nomName
              }
            })
            if (nomFind) {
              messageError.push(`${nomName} is not activated on Gas Day ${startDateEx} in the file.`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `${nomName} is not activated on Gas Day ${startDateEx} in the file.` // https://app.clickup.com/t/9018502823/86etzcgzm
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            } else {
              // messageError.push(`Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.`)
              messageError.push(`Nomination Points [${sheet1?.data[i][3] || pointIdCk}] do not match the contract code.`) // https://app.clickup.com/t/9018502823/86ev5f6ve



              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.` // https://sharing.clickup.com//9018502823/t/h/86euxnaeg/SFVBI9PW12U844A // https://app.clickup.com/t/86euzxxhy
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }
            
          }
          
          

          if (typeCk === 'NONTPA') {
            const checkNonTPA = nonTpa.find((fn: any) => {
              return fn?.non_tpa_point_name?.trimEnd() === pointIdCk?.trimEnd()
            })
            if (checkNonTPA) {
              if (checkNonTPA?.nomination_point) {
                // ถ้าตรงทั้งหมดไปหาว่า Nomination Point นี้ใช้ Zone , Area, Entry/Exit และ Contract Point ที่มีอยู่ในสัญญาหรือไม่
                let checkNom = false
                if (!!reserveBalancingGasContract?.id) {
                  const haveSameNomPoint = reserveBalancingGasContract.reserve_balancing_gas_contract_detail.some(
                    (item: any) =>
                      checkNonTPA.nomination_point?.nomination_point === item.nomination_point?.nomination_point &&
                      checkNonTPA.nomination_point?.area?.name === item.area?.name &&
                      checkNonTPA.nomination_point?.zone?.name === item.zone?.name &&
                      checkNonTPA.nomination_point?.entry_exit?.name === item.entry_exit?.name
                  )
                  if (haveSameNomPoint) {
                    checkNom = true
                  }
                } else {
                  for (let ifb = 0; ifb < (contractCode?.booking_version[0]?.booking_row_json || []).length; ifb++) {
                    const findPoint = checkNonTPA?.nomination_point?.contract_point_list.find((inb: any) => {
                      return inb?.contract_point === contractCode?.booking_version[0]?.booking_row_json[ifb]?.contract_point
                    })
                    if (findPoint) {
                      if (findPoint?.area?.name === checkNonTPA?.nomination_point?.area?.name && findPoint?.zone?.name === checkNonTPA?.nomination_point?.zone?.name && findPoint?.entry_exit?.name === checkNonTPA?.nomination_point?.entry_exit?.name) {
                        checkNom = true
                      }
                    }
                  }
                }
                if (checkNom) {
                  // เพิ่มเงื่อนไข (ยังไม่ได้ทำ)
                  // https://app.clickup.com/t/86et0vtn2
                  // v2.0.16 Value Non TPA มากกว่า Nom ไม่มี Error แจ้งเตือน

                  caseData?.columnType.push({
                    ix: i,
                    row: sheet1?.data[i]
                  })
                } else {
                  // messageError.push(nonTpa?.find((f: any) => f?.non_tpa_point_name === (sheet1?.data[i][3] || pointIdCk)) ? `Non TPA Point: [${sheet1?.data[i][3] || pointIdCk}] has no related point in file` : `Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.`)
                  messageError.push(nonTpa?.find((f: any) => f?.non_tpa_point_name === (sheet1?.data[i][3] || pointIdCk)) ? `Non TPA Point: [${sheet1?.data[i][3] || pointIdCk}] has no related point in file` : `Nomination Points [${sheet1?.data[i][3] || pointIdCk}] do not match the contract code.`) // https://app.clickup.com/t/9018502823/86ev5f6ve

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: nonTpa?.find((f: any) => f?.non_tpa_point_name === (sheet1?.data[i][3] || pointIdCk)) ? `Non TPA Point: [${sheet1?.data[i][3] || pointIdCk}] has no related point in file` : `Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.` // https://app.clickup.com/t/86etzch1a
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }
              } else {
                messageError.push(`${checkNonTPA?.nomination_point?.nomination_point || 'Nomination Point'} is not found in file for ${sheet1?.data[i][3]}`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,
                //     error: `${checkNonTPA?.nomination_point?.nomination_point || 'Nomination Point'} is not found in file for ${sheet1?.data[i][3]}`
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              }
            } else {
              messageError.push(`${sheet1?.data[i][3]} is not activated on Gas Day ${startDateEx} in the file.`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `${sheet1?.data[i][3]} is not activated on Gas Day ${startDateEx} in the file.`
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }
          } else if (checkNominationPoint) {
            // ใช่ nom
            const supdemCk = supplyDemandCk === 'Supply' ? 'Entry' : 'Exit'
            if (areaCk === checkNominationPoint?.area?.name && zoneCk === checkNominationPoint?.zone?.name && supdemCk === checkNominationPoint?.entry_exit?.name) {
              let checkNom = false
              if (!!reserveBalancingGasContract?.id) {
                const haveSameNomPoint = reserveBalancingGasContract.reserve_balancing_gas_contract_detail.some(
                  (item: any) => checkNominationPoint.nomination_point === item.nomination_point?.nomination_point && checkNominationPoint.area?.name === item.area?.name && checkNominationPoint.zone?.name === item.zone?.name && checkNominationPoint.entry_exit?.name === item.entry_exit?.name
                )
                if (haveSameNomPoint) {
                  checkNom = true
                }
              } else {
                for (let ifb = 0; ifb < (contractCode?.booking_version[0]?.booking_row_json || []).length; ifb++) {
                  const findPoint = checkNominationPoint?.contract_point_list.find((inb: any) => {
                    return inb?.contract_point === contractCode?.booking_version[0]?.booking_row_json[ifb]?.contract_point
                  })

                  if (findPoint) {
                    if (findPoint?.area?.name === checkNominationPoint?.area?.name && findPoint?.zone?.name === checkNominationPoint?.zone?.name && findPoint?.entry_exit?.name === checkNominationPoint?.entry_exit?.name) {
                      checkNom = true
                    }
                  }
                }
              }

              if (checkNom) {
                // non ปกติ
                caseData?.columnPointId.push({
                  ix: i,
                  row: sheet1?.data[i]
                })
              } else {
                // ไม่ตรงเงื่อนไขใน nomination deadline
                // messageError.push(`Nomination Point [${sheet1?.data[i][3]}] is incorrect.`)
                messageError.push(`Nomination Points [${sheet1?.data[i][3] || pointIdCk}] do not match the contract code.`) // https://app.clickup.com/t/9018502823/86ev5f6ve

                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,
                //     error: `Nomination Point [${sheet1?.data[i][3]}] is incorrect.` // https://app.clickup.com/t/86etzcgzh
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              }
            } else {
              // ถ้าไม่ตรง
              messageError.push(`${areaCk}, ${zoneCk}, or ${supdemCk} for ${sheet1?.data[i][3]}  is incorrected`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `${areaCk}, ${zoneCk}, or ${supdemCk} for ${sheet1?.data[i][3]}  is incorrected`
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }

            // https://app.clickup.com/t/9018502823/86ev29wzz
            if(sheet1?.data[i][3] && ((checkNominationPoint?.customer_type?.name || "") !== (typeCk || ""))){
              messageError.push(`Customer Types for ${sheet1?.data[i][3]} do not match the settings in DAM > Nomination.`)
            }

          } else {
            // ไม่ใช่ nom
            // if (!!sheet1?.data[i][0] && sheet1?.data[i][3]) { // เดิมโรงงาน
            if (!!sheet1?.data[i][0] && (sheet1?.data[i][3] || sheet1?.data?.[i]?.[4] || sheet1?.data?.[i]?.[5])) {
              // เดิมโรงงาน
              // const findConcept = conceptPoint?.find((f: any) => {
              //   return f?.concept_point === sheet1?.data[i][3];
              // });

              // R : Validate File Daily/Weekly > เคสที่เอา Limit Concept Point ของ Shipper รายนั้นออก ต้องไม่สามารถเอาไฟล์ที่มี concept point นั้นเข้าระบบได้ https://app.clickup.com/t/86etzcgza
              const findConcept = conceptPoint?.find((f: any) => f?.concept_point === sheet1?.data?.[i]?.[3] || f?.concept_point === sheet1?.data?.[i]?.[4] || f?.concept_point === sheet1?.data?.[i]?.[5])
              let findNonTpa = undefined;

              if (!!!findConcept) {
                findNonTpa = nonTpa?.find((f: any) => f.non_tpa_point_name === sheet1?.data?.[i]?.[3] || f.non_tpa_point_name === sheet1?.data?.[i]?.[4] || f.non_tpa_point_name === sheet1?.data?.[i]?.[5])
                if (!!!findNonTpa) {
                messageError.push(`Concept Point [${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]}] is inactivated.`)
                }
                // else{
                //   messageError.push(`Types for ${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]} do not match the settings in DAM > Non-TPA.`)
                // }


                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,

                //     error: `Concept Point [${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]}] is inactivated.`
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              } else if (!findConcept?.limit_concept_point?.find((f: any) => f?.group?.id_name === shipper?.id_name)) {
                messageError.push(`No permission for this Concept Point ${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]} ,Please set the limit first.`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,

                //     error: `No permission for this Concept Point ${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]} ,Please set the limit first.`
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              }

              if(!!!findNonTpa){
              caseData?.columnPointIdConcept.push({
                ix: i,
                row: sheet1?.data[i]
              })
              }
              else{
                caseData?.columnOther.push({
                  ix: i,
                  row: sheet1?.data[i]
                })
              }
            } else {
              caseData?.columnOther.push({
                ix: i,
                row: sheet1?.data[i]
              })
            }
          }

          if (isMatch(unitCk, 'MMBTU/D')) {
            if (wiCk || hvCk || sgCk) {
              validateListForWiHvSg.push(`WI, HV and SG must be empty when unit is MMBTU/D at row ${i + 1} [${pointIdCk}].`)
            }
          }
        }
      }

      // ถ้ามี error messages ให้ throw exception พร้อมรายการ errors ทั้งหมด
      if (validateListForWiHvSg.length > 0) {
        // messageError.push(null)
        messageError = [...messageError, ...validateListForWiHvSg]

        // const message = validateListForWiHvSg.join('<br/>')
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: message
        //   },
        //   HttpStatus.BAD_REQUEST
        // )
      }

      for (let i = 0; i < sheet2?.data.length; i++) {
        const zoneCk = sheet2?.data[i][0] || null
        const pointIdCk = sheet2?.data[i][1] || null

        if (i > 0 && !!zoneCk && !!pointIdCk) {
          const ckContractPoint = await this.prisma.nomination_point.findFirst({
            where: {
              zone: {
                name: zoneCk
              },
              nomination_point: pointIdCk
            }
          })
          if (ckContractPoint) {
            getsValueSheet2.push({
              ix: i,
              row: sheet1?.data[i]
            })
          }
        }
      }
    } else {
      // 'Weekly Nomination'

      const sundayDayjs = dayjs(sheet1?.data[3][14], 'DD/MM/YYYY')
      const mondayDayjs = dayjs(sheet1?.data[3][15], 'DD/MM/YYYY')
      const tuesdayDayjs = dayjs(sheet1?.data[3][16], 'DD/MM/YYYY')
      const wednesdayDayjs = dayjs(sheet1?.data[3][17], 'DD/MM/YYYY')
      const thursdayDayjs = dayjs(sheet1?.data[3][18], 'DD/MM/YYYY')
      const fridayDayjs = dayjs(sheet1?.data[3][19], 'DD/MM/YYYY')
      const saturdayDayjs = dayjs(sheet1?.data[3][20], 'DD/MM/YYYY')

      // สร้าง array สำหรับเก็บ error messages
      const validateListForWiHvSg: string[] = []
      for (let i = 0; i < sheet1?.data.length; i++) {
        const zoneCk = sheet1?.data[i][0] || null
        const supplyDemandCk = sheet1?.data[i][1] || null
        const areaCk = sheet1?.data[i][2] || null
        // const pointIdCk = sheet1?.data[i][3] || null; // เดิมโรงงาน
        const pointIdCk = sheet1?.data[i][3]?.trimEnd() || sheet1?.data[i][4]?.trimEnd() || sheet1?.data[i][5]?.trimEnd() || null
        const wHvCk = sheet1?.data[i][4] || null
        const parkUnparkInstructedFlowsCk = sheet1?.data[i][5] || null
        const typeCk = sheet1?.data[i][6] || null
        const areaCodeCk = sheet1?.data[i][7] || null
        const subareaCodeCk = sheet1?.data[i][8] || null
        const unitCk = sheet1?.data[i][9] || null
        const entryExitCk = sheet1?.data[i][10] || null
        const wiCk = sheet1?.data[i][11] || null
        const hvCk = sheet1?.data[i][12] || null
        const sgCk = sheet1?.data[i][13] || null
        const day1Ck = sheet1?.data[i][14] || null
        const day2Ck = sheet1?.data[i][15] || null
        const day3Ck = sheet1?.data[i][16] || null
        const day4Ck = sheet1?.data[i][17] || null
        const day5Ck = sheet1?.data[i][18] || null
        const day6Ck = sheet1?.data[i][19] || null
        const day7Ck = sheet1?.data[i][20] || null

        if (i > 3) {
          // https://app.clickup.com/t/9018502823/86ev29wzy
          const ckDup = sheet1?.data?.filter((f:any) => {
            return (
              (f?.[0] || null) === zoneCk &&
              (f?.[1] || null) === supplyDemandCk &&
              (f?.[2] || null) === areaCk &&
              (f?.[3] || null) === (sheet1?.data[i][3] || null) &&
              (f?.[4] || null) === wHvCk &&
              (f?.[5] || null) === parkUnparkInstructedFlowsCk &&
              (f?.[6] || null) === typeCk &&
              (f?.[7] || null) === areaCodeCk &&
              (f?.[8] || null) === subareaCodeCk &&
              (f?.[9] || null) === unitCk &&
              (f?.[10] || null) === entryExitCk
            )
          })
          if(ckDup?.length > 1){
              messageError.push(`Duplicate value entries found for ${sheet1?.data[i][3] || pointIdCk}.`) // https://app.clickup.com/t/9018502823/86ev29wzy
          }
          
          if (zoneCk === '*') {
            break
          }

          for (let iW = 1; iW <= 7; iW++) {
            if (this.isMoreThan3Decimals(parseToNumber(sheet1?.data[i][14 + iW - 1] ?? 0))) {
              messageError.push(`Point ${pointIdCk || '-'} | Unit ${unitCk || '-'} | ${sheet1?.data[3]?.[14 + iW - 1]} | Value ${parseToNumber(sheet1?.data[i][14 + iW - 1] ?? 0)} | The value must contain 3 decimal places.`)
              // throw new HttpException(
              //   {
              //     status: HttpStatus.BAD_REQUEST,
              //     error: `Point ${pointIdCk || '-'} | Unit ${unitCk || '-'} | ${sheet1?.data[3]?.[14 + iW - 1]} | Value ${parseToNumber(sheet1?.data[i][14 + iW - 1] ?? 0)} | The value must contain 3 decimal places.`
              //   },
              //   HttpStatus.BAD_REQUEST
              // )
            }
          }

          const ckflagEmtry = [day1Ck, day2Ck, day3Ck, day4Ck, day5Ck, day6Ck, day7Ck].every((item) => item === null)
          if (ckflagEmtry) {
            flagEmtry = true
          }

          fullDataRow.push({
            ix: i,
            row: sheet1?.data[i]
          })

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === pointIdCk
          })
          if (areaCk && !checkNominationPoint) {
            const nomName = sheet1?.data[i][3] || pointIdCk
            const nomFind = await this.prisma.nomination_point.findFirst({
              where: {
                nomination_point: nomName
              }
            })
            if (nomFind) {
              messageError.push(`${nomName} is not activated on Gas Day ${sheet1?.data[3][14]} - ${sheet1?.data[3][20]} in the file.`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `${nomName} is not activated on Gas Day ${sheet1?.data[3][14]} - ${sheet1?.data[3][20]} in the file.` // https://app.clickup.com/t/9018502823/86etzcgzm
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            } else {
              // messageError.push(`Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.`)
              messageError.push(`Nomination Points [${sheet1?.data[i][3] || pointIdCk}] do not match the contract code.`) // https://app.clickup.com/t/9018502823/86ev5f6ve

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.` // https://sharing.clickup.com//9018502823/t/h/86euxnaeg/SFVBI9PW12U844A
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }
          }

          if (areaCk && checkNominationPoint) {
            let checkNominationPointArr = nominationPoint
              ?.filter((fnp: any) => {
                return fnp?.nomination_point === pointIdCk
              })
              ?.flatMap((date_: any) => {
                const startDam = dayjs(date_?.start_date).isBefore(sundayDayjs) ? sheet1?.data[3][14] : dayjs(date_?.start_date)?.format('DD/MM/YYYY')
                const endDam = !!date_?.end_date ? dayjs(date_?.end_date)?.format('DD/MM/YYYY') : sheet1?.data[3][20]

                const start = dayjs(startDam, 'DD/MM/YYYY')
                const end = dayjs(endDam, 'DD/MM/YYYY')

                const dates: string[] = []

                let current = start
                while (current.isSameOrBefore(end)) {
                  dates.push(current.format('DD/MM/YYYY'))
                  current = current.add(1, 'day')
                }
                return dates
              })
            if (checkNominationPointArr?.length > 0) {
              let notDateArr = []
              let notValueArr = []

              const contractStart = dayjs(contractCodeName.contract_start_date).tz('Asia/Bangkok')
              const contractEndDate = dayjs(contractCodeName.terminate_date ?? contractCodeName.extend_deadline ?? contractCodeName.contract_end_date).tz('Asia/Bangkok')

              const d0 = checkNominationPointArr?.includes(sheet1?.data[3][14])
              if (!d0 && sheet1?.data[i][14]) notDateArr.push(sheet1?.data[3][14]) // วันไม่มีตรงใน week และ ค่าไม่ว่าง ไม่ให้เอาเข้า
              else if(d0 && !sheet1?.data[i][14] && sundayDayjs.isAfter(contractStart) && sundayDayjs.isBefore(contractEndDate)) notValueArr.push(sheet1?.data[3][14]) // วันมีตรงใน week และ ค่าว่าง ไม่ให้เอาเข้า
              const d1 = checkNominationPointArr?.includes(sheet1?.data[3][15])
              if (!d1 && sheet1?.data[i][15]) notDateArr.push(sheet1?.data[3][15]) // วันไม่มีตรงใน week และ ค่าไม่ว่าง ไม่ให้เอาเข้า
              else if(d1 && !sheet1?.data[i][15] && mondayDayjs.isAfter(contractStart) && mondayDayjs.isBefore(contractEndDate)) notValueArr.push(sheet1?.data[3][15]) // วันมีตรงใน week และ ค่าว่าง ไม่ให้เอาเข้า
              const d2 = checkNominationPointArr?.includes(sheet1?.data[3][16])
              if (!d2 && sheet1?.data[i][16]) notDateArr.push(sheet1?.data[3][16]) // วันไม่มีตรงใน week และ ค่าไม่ว่าง ไม่ให้เอาเข้า
              else if(d2 && !sheet1?.data[i][16] && tuesdayDayjs.isAfter(contractStart) && tuesdayDayjs.isBefore(contractEndDate)) notValueArr.push(sheet1?.data[3][16]) // วันมีตรงใน week และ ค่าว่าง ไม่ให้เอาเข้า
              const d3 = checkNominationPointArr?.includes(sheet1?.data[3][17])
              if (!d3 && sheet1?.data[i][17]) notDateArr.push(sheet1?.data[3][17]) // วันไม่มีตรงใน week และ ค่าไม่ว่าง ไม่ให้เอาเข้า
              else if(d3 && !sheet1?.data[i][17] && wednesdayDayjs.isAfter(contractStart) && wednesdayDayjs.isBefore(contractEndDate)) notValueArr.push(sheet1?.data[3][17]) // วันมีตรงใน week และ ค่าว่าง ไม่ให้เอาเข้า
              const d4 = checkNominationPointArr?.includes(sheet1?.data[3][18])
              if (!d4 && sheet1?.data[i][18]) notDateArr.push(sheet1?.data[3][18]) // วันไม่มีตรงใน week และ ค่าไม่ว่าง ไม่ให้เอาเข้า
              else if(d4 && !sheet1?.data[i][18] && thursdayDayjs.isAfter(contractStart) && thursdayDayjs.isBefore(contractEndDate)) notValueArr.push(sheet1?.data[3][18]) // วันมีตรงใน week และ ค่าว่าง ไม่ให้เอาเข้า
              const d5 = checkNominationPointArr?.includes(sheet1?.data[3][19])
              if (!d5 && sheet1?.data[i][19]) notDateArr.push(sheet1?.data[3][19]) // วันไม่มีตรงใน week และ ค่าไม่ว่าง ไม่ให้เอาเข้า
              else if(d5 && !sheet1?.data[i][19] && fridayDayjs.isAfter(contractStart) && fridayDayjs.isBefore(contractEndDate)) notValueArr.push(sheet1?.data[3][19]) // วันมีตรงใน week และ ค่าว่าง ไม่ให้เอาเข้า
              const d6 = checkNominationPointArr?.includes(sheet1?.data[3][20])
              if (!d6 && sheet1?.data[i][20]) notDateArr.push(sheet1?.data[3][20]) // วันไม่มีตรงใน week และ ค่าไม่ว่าง ไม่ให้เอาเข้า
              else if(d6 && !sheet1?.data[i][20] && saturdayDayjs.isAfter(contractStart) && saturdayDayjs.isBefore(contractEndDate)) notValueArr.push(sheet1?.data[3][20]) // วันมีตรงใน week และ ค่าว่าง ไม่ให้เอาเข้า

              if (notDateArr.length > 0) {
                const nomName = sheet1?.data[i][3] || pointIdCk
                if(notDateArr.length > 1) {
                  messageError.push(`${nomName} is not activated on Gas Day ${notDateArr[0]} - ${notDateArr[notDateArr.length - 1]} Please leave this field blank for that date.`)
                }
                else{
                  messageError.push(`${nomName} is not activated on Gas Day ${notDateArr[0]} Please leave this field blank for that date.`)
                }

                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,
                //     error: `${nomName} is not activated on Gas Day ${notDateArr?.[0]} - ${notDateArr?.[notDateArr?.length - 1]} Please leave this field blank for that date.` // https://app.clickup.com/t/9018502823/86etzcgzm
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              }
              if(notValueArr.length > 0) {
                const nomName = sheet1?.data[i][3] || pointIdCk
                if(notValueArr.length > 1) {
                  messageError.push(`${nomName} can not be blank on Gas Day ${notValueArr[0]} - ${notValueArr[notValueArr.length - 1]}.`)
                }
                else{
                  messageError.push(`${nomName} can not be blank on Gas Day ${notValueArr[0]}.`)
                }
              }
            } else {
              const nomName = sheet1?.data[i][3] || pointIdCk
              messageError.push(`${nomName} is not activated on Gas Day ${sheet1?.data[3][14]} - ${sheet1?.data[3][20]} Please leave this field blank for that date.`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `${nomName} is not activated on Gas Day ${sheet1?.data[3][14]} - ${sheet1?.data[3][20]} Please leave this field blank for that date.` // https://app.clickup.com/t/9018502823/86etzcgzm
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }
          }

          if (typeCk === 'NONTPA') {
            let notActiveAtDate = []
            let defaultEndDate = ''
            const firstNomValueColumn = 14 // คอลัมน์วันอาทิตย์
            const lastNomValueColumn = 20 // คอลัมน์วันเสาร์
            try {
              for (let columnIndex = firstNomValueColumn; columnIndex <= lastNomValueColumn; columnIndex++) {
                const dateInWeek = getTodayNowDDMMYYYYDfault(sheet1.data[3][columnIndex])
                if (dateInWeek.isValid()) {
                  const isExist = nonTpa.some((fn: any) => {
                    const start = dayjs(fn?.start_date)
                    const end = fn?.end_date ? dayjs(fn.end_date) : null
                    const target = dateInWeek
                    return fn?.non_tpa_point_name?.trimEnd() === pointIdCk?.trimEnd() && start.isValid() && (start.isBefore(target) || start.isSame(target, 'day')) && (!end || end.isAfter(target))
                  })

                  if (!isExist && !!sheet1?.data[i][columnIndex]) {
                    sheet1 && notActiveAtDate.push(sheet1.data[3][columnIndex])
                  }
                }
              }

              if (startDateExConv && startDateExConv.isValid()) {
                defaultEndDate = startDateExConv.add(1, 'week').endOf('day').format('DD/MM/YYYY')
              }
            } catch (error) {
              notActiveAtDate = []
              defaultEndDate = ''
            }

            if (notActiveAtDate.length > 0) {
              let minNotActiveDate = null
              let maxNotActiveDate = null
              if (notActiveAtDate.length > 1) {
                minNotActiveDate = notActiveAtDate.reduce((min, curr) => {
                  return dayjs(curr, 'DD/MM/YYYY').isBefore(dayjs(min, 'DD/MM/YYYY')) ? curr : min
                }, notActiveAtDate[0])
                maxNotActiveDate = notActiveAtDate.reduce((max, curr) => {
                  return dayjs(curr, 'DD/MM/YYYY').isAfter(dayjs(max, 'DD/MM/YYYY')) ? curr : max
                }, notActiveAtDate[0])
              }
              messageError.push(
                notActiveAtDate.length === 7
                  ? `${sheet1?.data[i][3]} is not activated on Gas Day ${sheet1.data[2][firstNomValueColumn] ?? startDateEx} - ${sheet1.data[2][lastNomValueColumn] ?? defaultEndDate} in the file.`
                  : minNotActiveDate && maxNotActiveDate
                    ? `${sheet1?.data[i][3]} is not activated on Gas Day ${minNotActiveDate} - ${maxNotActiveDate} in the file.`
                    : `${sheet1?.data[i][3]} is not activated on Gas Day ${notActiveAtDate?.[0]} in the file.`
              )

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error:
              //       notActiveAtDate.length === 7
              //         ? `${sheet1?.data[i][3]} is not activated on Gas Day ${sheet1.data[2][firstNomValueColumn] ?? startDateEx} - ${sheet1.data[2][lastNomValueColumn] ?? defaultEndDate} in the file.`
              //         : minNotActiveDate && maxNotActiveDate
              //           ? `${sheet1?.data[i][3]} is not activated on Gas Day ${minNotActiveDate} - ${maxNotActiveDate} in the file.`
              //           : `${sheet1?.data[i][3]} is not activated on Gas Day ${notActiveAtDate?.[0]} in the file.`
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }

            const checkNonTPA = nonTpa.find((fn: any) => {
              return fn?.non_tpa_point_name?.trimEnd() === pointIdCk?.trimEnd()
            })
            if (checkNonTPA) {
              if (checkNonTPA?.nomination_point) {
                // ถ้าตรงทั้งหมดไปหาว่า Nomination Point นี้ใช้ Zone , Area, Entry/Exit และ Contract Point ที่มีอยู่ในสัญญาหรือไม่
                let checkNom = false
                if (!!reserveBalancingGasContract?.id) {
                  const haveSameNomPoint = reserveBalancingGasContract.reserve_balancing_gas_contract_detail.some(
                    (item: any) =>
                      checkNonTPA.nomination_point?.nomination_point === item.nomination_point?.nomination_point &&
                      checkNonTPA.nomination_point?.area?.name === item.area?.name &&
                      checkNonTPA.nomination_point?.zone?.name === item.zone?.name &&
                      checkNonTPA.nomination_point?.entry_exit?.name === item.entry_exit?.name
                  )
                  if (haveSameNomPoint) {
                    checkNom = true
                  }
                } else {
                  for (let ifb = 0; ifb < (contractCode?.booking_version[0]?.booking_row_json || []).length; ifb++) {
                    const findPoint = checkNonTPA?.nomination_point?.contract_point_list.find((inb: any) => {
                      return inb?.contract_point === contractCode?.booking_version[0]?.booking_row_json[ifb]?.contract_point
                    })
                    if (findPoint) {
                      if (findPoint?.area?.name === checkNonTPA?.nomination_point?.area?.name && findPoint?.zone?.name === checkNonTPA?.nomination_point?.zone?.name && findPoint?.entry_exit?.name === checkNonTPA?.nomination_point?.entry_exit?.name) {
                        checkNom = true
                      }
                    }
                  }
                }
                if (checkNom) {
                  caseData?.columnType.push({
                    ix: i,
                    row: sheet1?.data[i]
                  })
                } else {
                  // messageError.push(nonTpa?.find((f: any) => f?.non_tpa_point_name === (sheet1?.data[i][3] || pointIdCk)) ? `Non TPA Point: [${sheet1?.data[i][3] || pointIdCk}] has no related point in file` : `Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.`)
                  messageError.push(nonTpa?.find((f: any) => f?.non_tpa_point_name === (sheet1?.data[i][3] || pointIdCk)) ? `Non TPA Point: [${sheet1?.data[i][3] || pointIdCk}] has no related point in file` : `Nomination Points [${sheet1?.data[i][3] || pointIdCk}] do not match the contract code.`) // https://app.clickup.com/t/9018502823/86ev5f6ve
                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: nonTpa?.find((f: any) => f?.non_tpa_point_name === (sheet1?.data[i][3] || pointIdCk)) ? `Non TPA Point: [${sheet1?.data[i][3] || pointIdCk}] has no related point in file` : `Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.` // https://app.clickup.com/t/86etzch1a
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }
              } else {
                messageError.push(`${checkNonTPA?.nomination_point?.nomination_point || 'Nomination Point'} is not found in file for ${sheet1?.data[i][3]}`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,
                //     error: `${checkNonTPA?.nomination_point?.nomination_point || 'Nomination Point'} is not found in file for ${sheet1?.data[i][3]}`
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              }
            } else {
              messageError.push(`${sheet1?.data[i][3]} is not activated on Gas Day in the file.`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `${sheet1?.data[i][3]} is not activated on Gas Day in the file.`
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }
          } else if (checkNominationPoint) {
            // ใช่ nom
            const supdemCk = supplyDemandCk === 'Supply' ? 'Entry' : 'Exit'
            if (areaCk === checkNominationPoint?.area?.name && zoneCk === checkNominationPoint?.zone?.name && supdemCk === checkNominationPoint?.entry_exit?.name) {
              let checkNom = false
              if (!!reserveBalancingGasContract?.id) {
                const haveSameNomPoint = reserveBalancingGasContract.reserve_balancing_gas_contract_detail.some(
                  (item: any) => checkNominationPoint.nomination_point === item.nomination_point?.nomination_point && checkNominationPoint.area?.name === item.area?.name && checkNominationPoint.zone?.name === item.zone?.name && checkNominationPoint.entry_exit?.name === item.entry_exit?.name
                )
                if (haveSameNomPoint) {
                  checkNom = true
                }
              } else {
                for (let ifb = 0; ifb < (contractCode?.booking_version[0]?.booking_row_json || []).length; ifb++) {
                  const findPoint = checkNominationPoint?.contract_point_list.find((inb: any) => {
                    return inb?.contract_point === contractCode?.booking_version[0]?.booking_row_json[ifb]?.contract_point
                  })
                  if (findPoint) {
                    if (findPoint?.area?.name === checkNominationPoint?.area?.name && findPoint?.zone?.name === checkNominationPoint?.zone?.name && findPoint?.entry_exit?.name === checkNominationPoint?.entry_exit?.name) {
                      checkNom = true
                    }
                  }
                }
              }

              if (checkNom) {
                // non ปกติ
                caseData?.columnPointId.push({
                  ix: i,
                  row: sheet1?.data[i]
                })
              } else {
                // messageError.push(`Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.`)
                messageError.push(`Nomination Points [${sheet1?.data[i][3] || pointIdCk}] do not match the contract code.`) // https://app.clickup.com/t/9018502823/86ev5f6ve

                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,
                //     error: `Nomination Point [${sheet1?.data[i][3] || pointIdCk}] is incorrect.` // https://app.clickup.com/t/86etzcgzh
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              }

              // https://app.clickup.com/t/9018502823/86ev29wzz
              if(sheet1?.data[i][3] && ((checkNominationPoint?.customer_type?.name || "") !== (typeCk || ""))){
                messageError.push(`Customer Types for ${sheet1?.data[i][3]} do not match the settings in DAM > Nomination.`)
              }

            } else {
              // ถ้าไม่ตรง
              messageError.push(`${areaCk}, ${zoneCk}, or ${supdemCk} for ${sheet1?.data[i][3] || pointIdCk}  is incorrected`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     // error: `${sheet1?.data[i][3]} is activated for ${startDateEx} Click to continune`,
              //     error: `${areaCk}, ${zoneCk}, or ${supdemCk} for ${sheet1?.data[i][3] || pointIdCk}  is incorrected`
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }
          } else {
            // ไม่ใช่ nom
            // if (!!sheet1?.data[i][0] && !!sheet1?.data[i][3]) {  // เดิมโรงงาน
            if (!!sheet1?.data[i][0] && (!!sheet1?.data[i][3] || !!sheet1?.data[i][4] || !!sheet1?.data[i][5])) {
              // เดิมโรงงาน
              // const findConcept = conceptPoint?.find((f: any) => {
              //   return f?.concept_point === sheet1?.data[i][3];
              // });

              // R : Validate File Daily/Weekly > เคสที่เอา Limit Concept Point ของ Shipper รายนั้นออก ต้องไม่สามารถเอาไฟล์ที่มี concept point นั้นเข้าระบบได้ https://app.clickup.com/t/86etzcgza
              const findConcept = conceptPoint?.filter((f: any) => f?.concept_point === sheet1?.data?.[i]?.[3] || f?.concept_point === sheet1?.data?.[i]?.[4] || f?.concept_point === sheet1?.data?.[i]?.[5])
              let findNonTpa = undefined;

              if ((findConcept?.length ?? 0) < 1) {
                findNonTpa = nonTpa?.find((f: any) => f.non_tpa_point_name === sheet1?.data?.[i]?.[3] || f.non_tpa_point_name === sheet1?.data?.[i]?.[4] || f.non_tpa_point_name === sheet1?.data?.[i]?.[5])
                if (!!!findNonTpa) {
                messageError.push(`Concept Point [${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]}] is inactivated.`)
                }
                // else{
                //   messageError.push(`Types for ${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]} do not match the settings in DAM > Non-TPA.`)
                // }

                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,
                //     error: `Concept Point [${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]}] is inactivated.`
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              } else if (!(findConcept ?? []).some((f: any) => f?.limit_concept_point?.some((f: any) => f?.group?.id_name === shipper?.id_name))) {
                messageError.push(`No permission for this Concept Point ${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]}, Please set the limit first.`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.FORBIDDEN,
                //     error: `No permission for this Concept Point ${sheet1?.data[i][3] || sheet1?.data[i][4] || sheet1?.data[i][5]}, Please set the limit first.`
                //   },
                //   HttpStatus.FORBIDDEN
                // )
              }

              if(!!!findNonTpa){
              caseData?.columnPointIdConcept.push({
                ix: i,
                row: sheet1?.data[i]
              })
              }
              else{
                caseData?.columnOther.push({
                  ix: i,
                  row: sheet1?.data[i]
                })
              }
            } else {
              caseData?.columnOther.push({
                ix: i,
                row: sheet1?.data[i]
              })
            }
          }

          if (isMatch(unitCk, 'MMBTU/D')) {
            if (wiCk || hvCk || sgCk) {
              validateListForWiHvSg.push(`WI, HV and SG must be empty when unit is MMBTU/D at row ${i + 1} [${pointIdCk}].`)
            }
          }
        }
      }

      // ถ้ามี error messages ให้ throw exception พร้อมรายการ errors ทั้งหมด
      if (validateListForWiHvSg.length > 0) {
        messageError = [...messageError, ...validateListForWiHvSg]
        // const message = validateListForWiHvSg.join('<br/>')
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: message
        //   },
        //   HttpStatus.BAD_REQUEST
        // )
      }
      //

      for (let i = 0; i < sheet2?.data.length; i++) {
        const zoneCk = sheet2?.data[i][0] || null
        const pointIdCk = sheet2?.data[i][1] || null

        if (i > 0 && !!zoneCk && !!pointIdCk) {
          const ckContractPoint = await this.prisma.nomination_point.findFirst({
            where: {
              zone: {
                name: zoneCk
              },
              nomination_point: pointIdCk
            }
          })
          if (ckContractPoint) {
            getsValueSheet2.push({
              ix: i,
              row: sheet1?.data[i]
            })
          }
        }
      }
    }

    // ===== STEP 26: FINAL DATA VALIDATION =====
    console.log('STEP 26: FINAL DATA VALIDATION')
    // Check if file contains at least one valid data entry
    if (flagEmtry) {
      //https://app.clickup.com/t/86euxv3c8
      messageError.push(`Invalid File : Values are missing. Please provide at least one valid entry`)

      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'Invalid File : Values are missing. Please provide at least one valid entry'
      //   },
      //   HttpStatus.BAD_REQUEST
      // )
    }

    const validateDuplicatePoint = this.dataProcessingService.validateDuplicatePoint(caseData, conceptPoint, !!!reserveBalancingGasContract?.id)
    if (validateDuplicatePoint.length > 0) {
      messageError = [...messageError, ...validateDuplicatePoint]

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: validateDuplicatePoint.join('<br/>')
        },
        HttpStatus.BAD_REQUEST
      )
    }

    getsValue = [...caseData?.columnPointId]

    let checkEmtry = getsValue?.map((re: any) => re?.row?.map((rer: any) => false))

    if (!!reserveBalancingGasContract?.id) {
      // ===== STEP 27: RESERVE BALANCING GAS CONTRACT DATA PROCESSING =====
      console.log('RESEV.')
      return await this.handleReserveBalancingGasContractService.processReserveBalancingGasContract({
        reserveBalancingGasContract: reserveBalancingGasContract,
        getsValue: getsValue,
        caseData: caseData,
        nomination_type_id: nomination_type_id,
        nominationPoint: nominationPoint,
        startDateEx: startDateEx,
        zoneQualityMaster: zoneQualityMaster,
        checkEmtry: checkEmtry,
        sheet1: sheet1,
        sheet2: sheet2,
        fullDataRow: fullDataRow,
        fileOriginal: fileOriginal,
        userId: userId,
        comment: comment,
        shipper_id: shipper_id,
        startDateExConv: startDateExConv,
        checkType: checkType,
        renom: renom,
        informationData: informationData,
        queryShipperNominationFileService: this.queryShipperNominationFileService,
        nonTpa: nonTpa,
        messageError: messageError,
        tabType: tabType,
      })
    } else {
      // ===== STEP 27: BOOKING DATA PROCESSING =====

      const bookingFullJson = JSON.parse(contractCode?.booking_version[0]?.booking_full_json[0]?.data_temp)
      const headerEntryCDBMMBTUD = bookingFullJson?.headerEntry['Capacity Daily Booking (MMBTU/d)']
      delete headerEntryCDBMMBTUD['key']
      const headerEntryCDBMMscfd = bookingFullJson?.headerEntry['Capacity Daily Booking (MMscfd)']
      delete headerEntryCDBMMscfd['key']
      const headerExitCDBMMBTUD = bookingFullJson?.headerExit['Capacity Daily Booking (MMBTU/d)']
      delete headerExitCDBMMBTUD['key']

      const headerEntryCDBMMBTUH = bookingFullJson?.headerEntry['Maximum Hour Booking (MMBTU/h)']
      delete headerEntryCDBMMBTUH['key']
      const headerEntryCDBMMscfh = bookingFullJson?.headerEntry['Maximum Hour Booking (MMscfh)']
      delete headerEntryCDBMMscfh['key']
      const headerExitCDBMMBTUH = bookingFullJson?.headerExit['Maximum Hour Booking (MMBTU/h)']
      delete headerExitCDBMMBTUH['key']

      const entryValue = bookingFullJson?.entryValue
      const exitValue = bookingFullJson?.exitValue
      const filePeriodMode = contractCode?.file_period_mode
      let checksValue: any = []
      let warningLogHrTemp: any = []
      let warningLogHr: any = []
      let warningLogDay: any = []
      let warningLogDayWeek: any = []
      let warningLogDayWeekTemp: any = []
      let warningOtherTypePoint: any[] = []
      let sheet1Quality: any = []
      let sheet2Quality: any = []

      // throw new HttpException

      // ===== STEP 28: DAILY NOMINATION PROCESSING =====

      if (nomination_type_id === 1) {
        // daily
        if (contractCode?.term_type_id === 4) {
          // day
          const resultEntryExitUse = this.findExactMatchingKeyDDMMYYYY(startDateExConv, headerEntryCDBMMBTUH)
          const resultEntryExitUseMMscfh = this.findExactMatchingKeyDDMMYYYY(startDateExConv, headerEntryCDBMMscfh)
          const resultEntryExitUsePerDay = this.findExactMatchingKeyDDMMYYYY(startDateExConv, headerEntryCDBMMBTUD)
          const resultEntryExitUseMMscfd = this.findExactMatchingKeyDDMMYYYY(startDateExConv, headerEntryCDBMMscfd)
          if (!!!resultEntryExitUse || !!!resultEntryExitUsePerDay) {
            messageError.push('Nomination Point does not match the Contract Code.')
            // throw new HttpException(
            //   {
            //     status: HttpStatus.FORBIDDEN,
            //     error: 'Nomination Point does not match the Contract Code.'
            //   },
            //   HttpStatus.FORBIDDEN
            // )
          }

          checksValue = getsValue.map((e: any, cI: any) => {
            let entryQuality = null
            let overuseQuantity = null
            let overMaximumHourCapacityRight = null
            let valueCapa = 0
            let valueCapaPerDay = 0

            if (e['row'][10] === 'Entry' && e['row'][9] === 'MMBTU/D') {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (entryValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })
              if (!find && resultEntryExitUse) {
                messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.BAD_REQUEST,
                //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              }

              valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null // new
              valueCapaPerDay = find[resultEntryExitUsePerDay] === '0' || !!find[resultEntryExitUsePerDay] ? find[resultEntryExitUsePerDay] : null // new

              // ตรวจสอบค่าความจุในช่วงเวลา 24 ชั่วโมง (index 14 ถึง 37)

              Array.from(
                {
                  length: 24
                },
                (_, i) => i + 14
              ).forEach((index) => {
                //
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
                if ((valueCapa === null || valueCapaPerDay === null) && !!rIndex) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)
                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                if (!!e['row'][index]) {
                  checkEmtry[cI][index] = true
                }

                if (currentCapacity !== null && !!valueCapa && !!valueCapaPerDay) {
                  const finds = warningLogHrTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.hr === index - 14 + 1 &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                      let neHR = ehr
                      if (neHR && finds && finds.hr === neHR?.hr && finds.contractPoint === neHR?.contractPoint && finds.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                        neHR.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neHR
                      }
                    })
                  } else {
                    warningLogHrTemp.push({
                      nomination_point: e['row'][3],
                      hr: index - 14 + 1,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      valueDay: parseToNumber(valueCapaPerDay),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })

              const findZone = zoneQualityMaster.find((f: any) => {
                return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
              })

              // https://app.clickup.com/t/9018502823/86euzxxt1
              const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min
              const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max
              const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min
              const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max

              // WI
              if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
                const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[11]) || null
                // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                const validNumbers = Number.isFinite(val_)
                if (validNumbers) {
                  sheet1Quality.push(
                    `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
                  )
                }
              }
              // HV
              if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
                const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[12]) || null
                // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                const validNumbers = Number.isFinite(val_)
                if (validNumbers) {
                  sheet1Quality.push(
                    `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
                  )
                }
              }
            } else if (e['row'][10] === 'Entry' && isMatch(e['row'][9], 'MMscfd')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })

              const find = (entryValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              if (!find && resultEntryExitUseMMscfh) {
                messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)
                // throw new HttpException(
                //   {
                //     status: HttpStatus.BAD_REQUEST,
                //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              }

              valueCapa = resultEntryExitUseMMscfh ? (find[resultEntryExitUseMMscfh] === '0' || !!find[resultEntryExitUseMMscfh] ? find[resultEntryExitUseMMscfh] : null) : null
              valueCapaPerDay = resultEntryExitUseMMscfd ? (find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null) : null

              // ตรวจสอบค่าความจุในช่วงเวลา 24 ชั่วโมง (index 14 ถึง 37)

              Array.from(
                {
                  length: 24
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new

                // ถ้าค่าปัจจุบันเกินขีดจำกัด
                if (currentCapacity !== null && !!valueCapa && valueCapa != null && !!valueCapaPerDay && valueCapaPerDay != null) {
                  const finds = warningLogHrTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.hr === index - 14 + 1 &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                      let neHR = ehr
                      if (neHR && finds && finds.hr === neHR?.hr && finds.contractPoint === neHR?.contractPoint && finds.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                        neHR.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neHR
                      }
                    })
                  } else {
                    warningLogHrTemp.push({
                      nomination_point: e['row'][3],
                      hr: index - 14 + 1,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      valueDay: parseToNumber(valueCapaPerDay),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })

              if (e['row'][2] !== '') {
                const findZone = zoneQualityMaster.find((f: any) => {
                  return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
                })

                this.ensure3DecimalPlaces(e['row'][11], 'WI', e['row'][3] || e['row'][5])
                this.ensure3DecimalPlaces(e['row'][12], 'HV', e['row'][3] || e['row'][5])
                this.ensure3DecimalPlacesSG(e['row'][13], 'SG', e['row'][3] || e['row'][5])

                // https://app.clickup.com/t/9018502823/86euzxxt1
                const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min
                const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max
                const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min
                const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max

                // WI
                if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
                  const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[11]) || null

                  // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                  const validNumbers = Number.isFinite(val_)
                  if (validNumbers) {
                    sheet1Quality.push(
                      `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
                    )
                  }
                }
                // HV
                if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
                  const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[12]) || null

                  // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                  const validNumbers = Number.isFinite(val_)
                  if (validNumbers) {
                    sheet1Quality.push(
                      `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
                    )
                  }
                }
              }
            } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMBTU/D')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (exitValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              if (!find && resultEntryExitUse) {
                messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)
                // throw new HttpException(
                //   {
                //     status: HttpStatus.BAD_REQUEST,
                //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              }

              valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null // new
              valueCapaPerDay = find[resultEntryExitUsePerDay] === '0' || !!find[resultEntryExitUsePerDay] ? find[resultEntryExitUsePerDay] : null // new
              // ตรวจสอบค่าความจุในช่วงเวลา 24 ชั่วโมง (index 14 ถึง 37)
              Array.from(
                {
                  length: 24
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
                if (valueCapa === null && !!rIndex) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                if (!!e['row'][index]) {
                  checkEmtry[cI][index] = true
                }

                // ถ้าค่าปัจจุบันเกินขีดจำกัด
                if (currentCapacity !== null && !!valueCapa && !!valueCapaPerDay) {
                  const finds = warningLogHrTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.hr === index - 14 + 1 &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                      let neHR = ehr
                      if (neHR && finds && finds.hr === neHR?.hr && finds.contractPoint === neHR?.contractPoint && finds.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                        neHR.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neHR
                      }
                    })
                  } else {
                    warningLogHrTemp.push({
                      nomination_point: e['row'][3],
                      hr: index - 14 + 1,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      valueDay: parseToNumber(valueCapaPerDay),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
            } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMscfd')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (exitValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })
              if (!find && resultEntryExitUseMMscfh) {
                messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.BAD_REQUEST,
                //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              }
              valueCapa = resultEntryExitUseMMscfh ? (find[resultEntryExitUseMMscfh] === '0' || !!find[resultEntryExitUseMMscfh] ? find[resultEntryExitUseMMscfh] : null) : null
              valueCapaPerDay = resultEntryExitUseMMscfd ? (find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null) : null

              // ตรวจสอบค่าความจุในช่วงเวลา 24 ชั่วโมง (index 14 ถึง 37)
              Array.from(
                {
                  length: 24
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null

                // ถ้าค่าปัจจุบันเกินขีดจำกัด
                if (currentCapacity !== null && !!valueCapa && valueCapa != null && !!valueCapaPerDay && valueCapaPerDay != null) {
                  const finds = warningLogHrTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.hr === index - 14 + 1 &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                      let neHR = ehr
                      if (neHR && finds && finds.hr === neHR?.hr && finds.contractPoint === neHR?.contractPoint && finds.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                        neHR.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neHR
                      }
                    })
                  } else {
                    warningLogHrTemp.push({
                      nomination_point: e['row'][3],
                      hr: index - 14 + 1,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      valueDay: parseToNumber(valueCapaPerDay),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
            }

            return {
              ...e,
              entryQuality: entryQuality,
              overuseQuantity: overuseQuantity,
              overMaximumHourCapacityRight: overMaximumHourCapacityRight,
              bookValue: {
                date: startDateEx,
                value: parseToNumber(valueCapa)
              },
              unit: e['row'][9],
              entryExitText: e['row'][10],
              zoneText: e['row'][0],
              areaText: e['row'][2],
              contractPointText: e['row'][3]
            }
          })
        } else {
          // month
          const resultEntryExitUse = this.findMatchingKeyMMYYYY(startDateExConv, headerEntryCDBMMBTUH)
          const resultEntryExitUseMMscfh = this.findMatchingKeyMMYYYY(startDateExConv, headerEntryCDBMMscfh)
          const resultEntryExitUsePerDay = this.findMatchingKeyMMYYYY(startDateExConv, headerEntryCDBMMBTUD)
          const resultEntryExitUseMMscfd = this.findMatchingKeyMMYYYY(startDateExConv, headerEntryCDBMMscfd)
          if (!!!resultEntryExitUse || !!!resultEntryExitUsePerDay) {
            messageError.push(`Nomination Point does not match the Contract Code.`)
            // throw new HttpException(
            //   {
            //     status: HttpStatus.FORBIDDEN,
            //     error: 'Nomination Point does not match the Contract Code.'
            //   },
            //   HttpStatus.FORBIDDEN
            // )
          }

          checksValue = getsValue.map((e: any, cI: any) => {
            let entryQuality = null
            let overuseQuantity = null
            let overMaximumHourCapacityRight = null
            let valueCapa = 0
            let valueCapaPerDay = 0

            if (e['row'][10] === 'Entry' && e['row'][9] === 'MMBTU/D') {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (entryValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              if (!find && resultEntryExitUse) {
                messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.BAD_REQUEST,
                //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              }

              valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null // new
              valueCapaPerDay = find[resultEntryExitUsePerDay] === '0' || !!find[resultEntryExitUsePerDay] ? find[resultEntryExitUsePerDay] : null // new

              Array.from(
                {
                  length: 24
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
                if (valueCapa === null && !!rIndex) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                if (!!e['row'][index]) {
                  checkEmtry[cI][index] = true
                }

                // ถ้าค่าปัจจุบันเกินขีดจำกัด
                if (currentCapacity !== null && !!valueCapa && !!valueCapaPerDay) {
                  const finds = warningLogHrTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.hr === index - 14 + 1 &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                      let neHR = ehr
                      if (neHR && finds && finds.hr === neHR?.hr && finds.contractPoint === neHR?.contractPoint && finds.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                        neHR.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neHR
                      }
                    })
                  } else {
                    warningLogHrTemp.push({
                      nomination_point: e['row'][3],
                      hr: index - 14 + 1,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      valueDay: parseToNumber(valueCapaPerDay),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })

              const findZone = zoneQualityMaster.find((f: any) => {
                return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
              })

              // https://app.clickup.com/t/9018502823/86euzxxt1
              const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min
              const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max
              const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min
              const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max

              // WI
              if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
                const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[11]) || null

                // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                const validNumbers = Number.isFinite(val_)
                if (validNumbers) {
                  sheet1Quality.push(
                    `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
                  )
                }
              }
              // HV
              if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
                const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[12]) || null

                // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                const validNumbers = Number.isFinite(val_)
                if (validNumbers) {
                  sheet1Quality.push(
                    `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
                  )
                }
              }
            } else if (e['row'][10] === 'Entry' && isMatch(e['row'][9], 'MMscfd')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (entryValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              if (!find && resultEntryExitUseMMscfh) {
                messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.BAD_REQUEST,
                //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              }

              valueCapa = resultEntryExitUseMMscfh ? (find[resultEntryExitUseMMscfh] === '0' || !!find[resultEntryExitUseMMscfh] ? find[resultEntryExitUseMMscfh] : null) : null
              valueCapaPerDay = resultEntryExitUseMMscfd ? (find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null) : null

              Array.from(
                {
                  length: 24
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null

                // ถ้าค่าปัจจุบันเกินขีดจำกัด
                if (currentCapacity !== null && !!valueCapa && valueCapa != null && !!valueCapaPerDay && valueCapaPerDay != null) {
                  const finds = warningLogHrTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.hr === index - 14 + 1 &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                      let neHR = ehr
                      if (neHR && finds && finds.hr === neHR?.hr && finds.contractPoint === neHR?.contractPoint && finds.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                        neHR.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neHR
                      }
                    })
                  } else {
                    warningLogHrTemp.push({
                      nomination_point: e['row'][3],
                      hr: index - 14 + 1,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      valueDay: parseToNumber(valueCapaPerDay),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })

              if (e['row'][2] !== '') {
                const findZone = zoneQualityMaster.find((f: any) => {
                  return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
                })

                this.ensure3DecimalPlaces(e['row'][11], 'WI', e['row'][3] || e['row'][5])
                this.ensure3DecimalPlaces(e['row'][12], 'HV', e['row'][3] || e['row'][5])
                this.ensure3DecimalPlacesSG(e['row'][13], 'SG', e['row'][3] || e['row'][5])

                // https://app.clickup.com/t/9018502823/86euzxxt1
                const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min
                const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max
                const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min
                const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max

                // WI
                if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
                  const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[11]) || null
                  // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                  const validNumbers = Number.isFinite(val_)
                  if (validNumbers) {
                    sheet1Quality.push(
                      `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
                    )
                  }
                }
                // HV
                if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
                  const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[12]) || null

                  // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                  const validNumbers = Number.isFinite(val_)
                  if (validNumbers) {
                    sheet1Quality.push(
                      `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
                    )
                  }
                }
              }
            } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMBTU/D')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (exitValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              if (!find && resultEntryExitUse) {
                messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.BAD_REQUEST,
                //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              }

              valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null // new
              valueCapaPerDay = find[resultEntryExitUsePerDay] === '0' || !!find[resultEntryExitUsePerDay] ? find[resultEntryExitUsePerDay] : null // new
              Array.from(
                {
                  length: 24
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
                if (valueCapa === null && !!rIndex) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                if (!!e['row'][index]) {
                  checkEmtry[cI][index] = true
                }

                // ถ้าค่าปัจจุบันเกินขีดจำกัด
                if (currentCapacity !== null && !!valueCapa && !!valueCapaPerDay) {
                  const finds = warningLogHrTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.hr === index - 14 + 1 &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                      let neHR = ehr
                      if (neHR && finds && finds.hr === neHR?.hr && finds.contractPoint === neHR?.contractPoint && finds.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                        neHR.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neHR
                      }
                    })
                  } else {
                    warningLogHrTemp.push({
                      nomination_point: e['row'][3],
                      hr: index - 14 + 1,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      valueDay: parseToNumber(valueCapaPerDay),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
            } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMscfd')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (exitValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              if (!find && resultEntryExitUseMMscfh) {
                messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                // throw new HttpException(
                //   {
                //     status: HttpStatus.BAD_REQUEST,
                //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              }

              valueCapa = resultEntryExitUseMMscfh ? (find[resultEntryExitUseMMscfh] === '0' || !!find[resultEntryExitUseMMscfh] ? find[resultEntryExitUseMMscfh] : null) : null
              valueCapaPerDay = resultEntryExitUseMMscfd ? (find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null) : null

              Array.from(
                {
                  length: 24
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null

                // ถ้าค่าปัจจุบันเกินขีดจำกัด
                if (currentCapacity !== null && !!valueCapa && valueCapa != null && !!valueCapaPerDay && valueCapaPerDay != null) {
                  const finds = warningLogHrTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.hr === index - 14 + 1 &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                      let neHR = ehr
                      if (neHR && finds && finds.hr === neHR?.hr && finds.contractPoint === neHR?.contractPoint && finds.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                        neHR.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neHR
                      }
                    })
                  } else {
                    warningLogHrTemp.push({
                      nomination_point: e['row'][3],
                      hr: index - 14 + 1,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      valueDay: parseToNumber(valueCapaPerDay),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
            }

            return {
              ...e,
              entryQuality: entryQuality,
              overuseQuantity: overuseQuantity,
              overMaximumHourCapacityRight: overMaximumHourCapacityRight,
              bookValue: {
                date: startDateEx,
                value: parseToNumber(valueCapa)
              },
              unit: e['row'][9],
              entryExitText: e['row'][10],
              zoneText: e['row'][0],
              areaText: e['row'][2],
              contractPointText: e['row'][3]
            }
          })
        }
      } else {
        let weekBook = true
        // weekly
        if (contractCode?.term_type_id === 4) {
          // day
          const headDay = sheet1?.data[3]
          checksValue = getsValue.map((e: any, cI: any) => {
            let entryQuality = null
            let overuseQuantity = null
            let overMaximumHourCapacityRight = null
            let valueCapa = 0
            let valueCapaArr = []

            if (e['row'][10] === 'Entry' && e['row'][9] === 'MMBTU/D') {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (entryValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              Array.from(
                {
                  length: 7
                },
                (_, i) => i + 14
              ).forEach((index) => {
                if (!!e['row'][index]) {
                  checkEmtry[cI][index] = true
                }

                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                const headDayUse = headDay[index]
                const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDayUse)

                const resultEntryExitUse = this.findExactMatchingKeyDDMMYYYY(headDayUseConv, headerEntryCDBMMBTUD)
                if (!!resultEntryExitUse) {
                  weekBook = false
                }
                // valueCapa = (!!find && !!resultEntryExitUse) && find[resultEntryExitUse] || 0
                if (!find && resultEntryExitUse) {
                  messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.BAD_REQUEST,
                  //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }

                valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null // new
                valueCapaArr.push({
                  date: headDayUse,
                  value: parseToNumber(valueCapa)
                })

                let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
                if (valueCapa === null && !!rIndex) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                const contractCodeEnd = dayjs(contractCodeName.terminate_date ?? contractCodeName.extend_deadline ?? contractCodeName.contract_end_date).tz('Asia/Bangkok')
                if (!!!valueCapa && e['row'][index] !== '' && !headDayUseConv.isSame(contractCodeEnd, 'week')) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                // ถ้าค่าปัจจุบันเกินขีดจำกัด

                if (currentCapacity !== null && !!valueCapa) {
                  const finds = warningLogDayWeekTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.headDayUse === headDayUse &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                      let neD = ed
                      if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                        neD.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neD
                      }
                    })
                  } else {
                    warningLogDayWeekTemp.push({
                      nomination_point: e['row'][3],
                      headDayUse: headDayUse,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
              const findZone = zoneQualityMaster.find((f: any) => {
                return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
              })

              // https://app.clickup.com/t/9018502823/86euzxxt1
              const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min
              const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max
              const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min
              const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max

              // WI
              if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
                const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[11]) || null

                // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                const validNumbers = Number.isFinite(val_)
                if (validNumbers) {
                  sheet1Quality.push(
                    `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
                  )
                }
              }
              // HV
              if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
                const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[12]) || null

                // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                const validNumbers = Number.isFinite(val_)
                if (validNumbers) {
                  sheet1Quality.push(
                    `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
                  )
                }
              }
            } else if (e['row'][10] === 'Entry' && isMatch(e['row'][9], 'MMscfd')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (entryValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              Array.from(
                {
                  length: 7
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                const headDayUse = headDay[index]
                const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDayUse)
                const resultEntryExitUseMMscfd = this.findExactMatchingKeyDDMMYYYY(headDayUseConv, headerEntryCDBMMscfd)

                if (!find && resultEntryExitUseMMscfd) {
                  messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.BAD_REQUEST,
                  //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }

                valueCapa = resultEntryExitUseMMscfd ? (find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null) : null

                // ถ้าค่าปัจจุบันเกินขีดจำกัด

                if (currentCapacity !== null && !!valueCapa && valueCapa != null) {
                  const finds = warningLogDayWeekTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.headDayUse === headDayUse &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                      let neD = ed
                      if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                        neD.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neD
                      }
                    })
                  } else {
                    warningLogDayWeekTemp.push({
                      nomination_point: e['row'][3],
                      headDayUse: headDayUse,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })

              if (e['row'][2] !== '') {
                const findZone = zoneQualityMaster.find((f: any) => {
                  return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
                })

                this.ensure3DecimalPlaces(e['row'][11], 'WI', e['row'][3] || e['row'][5])
                this.ensure3DecimalPlaces(e['row'][12], 'HV', e['row'][3] || e['row'][5])
                this.ensure3DecimalPlacesSG(e['row'][13], 'SG', e['row'][3] || e['row'][5])

                // https://app.clickup.com/t/9018502823/86euzxxt1
                const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min
                const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max
                const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min
                const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max

                // WI
                if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
                  const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[11]) || null

                  // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                  const validNumbers = Number.isFinite(val_)
                  if (validNumbers) {
                    sheet1Quality.push(
                      `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
                    )
                  }
                }
                // HV
                if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
                  const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[12]) || null

                  // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                  const validNumbers = Number.isFinite(val_)
                  if (validNumbers) {
                    sheet1Quality.push(
                      `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
                    )
                  }
                }
              }
            } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMBTU/D')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (exitValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              Array.from(
                {
                  length: 7
                },
                (_, i) => i + 14
              ).forEach((index) => {
                if (!!e['row'][index]) {
                  checkEmtry[cI][index] = true
                }

                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                const headDayUse = headDay[index]
                const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDayUse)
                const resultEntryExitUse = this.findExactMatchingKeyDDMMYYYY(headDayUseConv, headerEntryCDBMMBTUD)
                if (!!resultEntryExitUse) {
                  weekBook = false
                }
                if (!find && resultEntryExitUse) {
                  messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.BAD_REQUEST,
                  //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }
                valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null // new
                valueCapaArr.push({
                  date: headDayUse,
                  value: parseToNumber(valueCapa)
                })

                let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
                if (valueCapa === null && !!rIndex) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                if (currentCapacity !== null && !!valueCapa) {
                  const finds = warningLogDayWeekTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.headDayUse === headDayUse &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                      let neD = ed
                      if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                        neD.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neD
                      }
                    })
                  } else {
                    warningLogDayWeekTemp.push({
                      nomination_point: e['row'][3],
                      headDayUse: headDayUse,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
            } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMscfd')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (exitValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              Array.from(
                {
                  length: 7
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                const headDayUse = headDay[index]
                const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDayUse)
                const resultEntryExitUseMMscfd = this.findExactMatchingKeyDDMMYYYY(headDayUseConv, headerEntryCDBMMscfd)

                if (!find && resultEntryExitUseMMscfd) {
                  messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.BAD_REQUEST,
                  //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }

                valueCapa = resultEntryExitUseMMscfd ? (find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null) : null

                if (currentCapacity !== null && !!valueCapa && valueCapa != null) {
                  const finds = warningLogDayWeekTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.headDayUse === headDayUse &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                      let neD = ed
                      if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                        neD.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neD
                      }
                    })
                  } else {
                    warningLogDayWeekTemp.push({
                      nomination_point: e['row'][3],
                      headDayUse: headDayUse,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
            }

            return {
              ...e,
              entryQuality: entryQuality,
              overuseQuantity: overuseQuantity,
              overMaximumHourCapacityRight: overMaximumHourCapacityRight,
              bookValue: valueCapaArr,
              unit: e['row'][9],
              entryExitText: e['row'][10],
              zoneText: e['row'][0],
              areaText: e['row'][2],
              contractPointText: e['row'][3]
            }
          })
        } else {
          const headDay = sheet1?.data[3]

          checksValue = getsValue.map((e: any, cI: any) => {
            let entryQuality = null
            let overuseQuantity = null
            let overMaximumHourCapacityRight = null
            let valueCapa = 0
            let valueCapaArr = []
            if (e['row'][10] === 'Entry' && e['row'][9] === 'MMBTU/D') {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (entryValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              Array.from(
                {
                  length: 7
                },
                (_, i) => i + 14
              ).forEach((index) => {
                if (!!e['row'][index]) {
                  checkEmtry[cI][index] = true
                }

                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                const headDayUse = headDay[index]
                const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDayUse)
                const resultEntryExitUse = this.findMatchingKeyMMYYYY(headDayUseConv, headerEntryCDBMMBTUD)
                if (!!resultEntryExitUse) {
                  weekBook = false
                }

                if (!find && resultEntryExitUse) {
                  messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.BAD_REQUEST,
                  //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }

                valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null // new

                valueCapaArr.push({
                  date: headDayUse,
                  value: parseToNumber(valueCapa)
                })

                let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
                if (valueCapa === null && !!rIndex) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                if (currentCapacity !== null && !!valueCapa) {
                  const finds = warningLogDayWeekTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.headDayUse === headDayUse &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                      let neD = ed
                      if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                        neD.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neD
                      }
                    })
                  } else {
                    warningLogDayWeekTemp.push({
                      nomination_point: e['row'][3],
                      headDayUse: headDayUse,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })

              const findZone = zoneQualityMaster.find((f: any) => {
                return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
              })

              // https://app.clickup.com/t/9018502823/86euzxxt1
              const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min
              const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max
              const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min
              const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max

              // WI
              if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
                const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[11]) || null

                // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                const validNumbers = Number.isFinite(val_)
                if (validNumbers) {
                  sheet1Quality.push(
                    `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
                  )
                }
              }
              // HV
              if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
                const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[12]) || null

                // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                const validNumbers = Number.isFinite(val_)
                if (validNumbers) {
                  sheet1Quality.push(
                    `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
                  )
                }
              }
            } else if (e['row'][10] === 'Entry' && isMatch(e['row'][9], 'MMscfd')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (entryValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              Array.from(
                {
                  length: 7
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null
                const headDayUse = headDay[index]
                const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDayUse)
                const resultEntryExitUseMMscfd = this.findMatchingKeyMMYYYY(headDayUseConv, headerEntryCDBMMscfd)

                if (!find && resultEntryExitUseMMscfd) {
                  messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.BAD_REQUEST,
                  //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }

                valueCapa = resultEntryExitUseMMscfd ? (find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null) : null

                if (currentCapacity !== null && !!valueCapa && valueCapa != null) {
                  const finds = warningLogDayWeekTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.headDayUse === headDayUse &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                      let neD = ed
                      if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                        neD.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neD
                      }
                    })
                  } else {
                    warningLogDayWeekTemp.push({
                      nomination_point: e['row'][3],
                      headDayUse: headDayUse,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })

              if (e['row'][2] !== '') {
                const findZone = zoneQualityMaster.find((f: any) => {
                  return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
                })

                this.ensure3DecimalPlaces(e['row'][11], 'WI', e['row'][3] || e['row'][5])
                this.ensure3DecimalPlaces(e['row'][12], 'HV', e['row'][3] || e['row'][5])
                this.ensure3DecimalPlacesSG(e['row'][13], 'SG', e['row'][3] || e['row'][5])

                // https://app.clickup.com/t/9018502823/86euzxxt1
                const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min
                const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max
                const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min
                const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max

                // WI
                if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
                  const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[11]) || null

                  // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                  const validNumbers = Number.isFinite(val_)
                  if (validNumbers) {
                    sheet1Quality.push(
                      `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
                    )
                  }
                }
                // HV
                if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
                  const val_ = e !== null && e !== undefined && parseToNumber(e?.row?.[12]) || null

                  // เช็คว่าเป็นตัวเลขทั้งสามตัวก่อน
                  const validNumbers = Number.isFinite(val_)
                  if (validNumbers) {
                    sheet1Quality.push(
                      `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
                    )
                  }
                }
              }
            } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMBTU/D')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (exitValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              Array.from(
                {
                  length: 7
                },
                (_, i) => i + 14
              ).forEach((index) => {
                if (!!e['row'][index]) {
                  checkEmtry[cI][index] = true
                }

                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                const headDayUse = headDay[index]
                const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDayUse)
                const resultEntryExitUse = this.findMatchingKeyMMYYYY(headDayUseConv, headerEntryCDBMMBTUD)
                if (!!resultEntryExitUse) {
                  weekBook = false
                }
                if (!find && resultEntryExitUse) {
                  messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)
                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.BAD_REQUEST,
                  //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }
                valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null // new
                valueCapaArr.push({
                  date: headDayUse,
                  value: parseToNumber(valueCapa)
                })

                let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
                if (valueCapa === null && !!rIndex) {
                  messageError.push(`Nomination Point does not match the Contract Code.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: 'Nomination Point does not match the Contract Code.'
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }

                if (currentCapacity !== null && !!valueCapa) {
                  const finds = warningLogDayWeekTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.headDayUse === headDayUse &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                      let neD = ed
                      if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                        neD.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neD
                      }
                    })
                  } else {
                    warningLogDayWeekTemp.push({
                      nomination_point: e['row'][3],
                      headDayUse: headDayUse,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
            } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMscfd')) {
              let checkNominationPoint = nominationPoint?.find((fnp: any) => {
                return fnp?.nomination_point === e['row'][3]
              })
              const find = (exitValue || []).find((f: any) => {
                return (
                  f['0'] ===
                  checkNominationPoint?.contract_point_list.find((cl: any) => {
                    return cl?.contract_point === f['0']
                  })?.contract_point
                )
              })

              Array.from(
                {
                  length: 7
                },
                (_, i) => i + 14
              ).forEach((index) => {
                let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && Number(e['row'][index]?.trim()?.replace(/,/g, ''))) || null //new
                const headDayUse = headDay[index]
                const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDayUse)
                const resultEntryExitUseMMscfd = this.findMatchingKeyMMYYYY(headDayUseConv, headerEntryCDBMMscfd)
                if (!find && resultEntryExitUseMMscfd) {
                  messageError.push(`Point ${e['row'][3]} Incorrect Entry/Exit Type.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.BAD_REQUEST,
                  //     error: `Point ${e['row'][3]} Incorrect Entry/Exit Type.`
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }

                valueCapa = resultEntryExitUseMMscfd ? (find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null) : null

                if (currentCapacity !== null && !!valueCapa && valueCapa != null) {
                  const finds = warningLogDayWeekTemp?.find((f: any) => {
                    return (
                      f?.nomination_point === e['row'][3] &&
                      f?.headDayUse === headDayUse &&
                      f?.contractPoint ===
                        checkNominationPoint?.contract_point_list.find((cl: any) => {
                          return cl?.contract_point === find['0']
                        })?.contract_point &&
                      isMatch(f?.unit, e['row'][9])
                    )
                  })
                  if (finds) {
                    warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                      let neD = ed
                      if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                        neD.energy = +Number(currentCapacity)
                      }
                      return {
                        ...neD
                      }
                    })
                  } else {
                    warningLogDayWeekTemp.push({
                      nomination_point: e['row'][3],
                      headDayUse: headDayUse,
                      contractPoint: checkNominationPoint?.contract_point_list.find((cl: any) => {
                        return cl?.contract_point === find['0']
                      })?.contract_point,
                      value: parseToNumber(valueCapa),
                      energy: currentCapacity,
                      unit: e['row'][9]
                    })
                  }
                }
              })
            }
            return {
              ...e,
              entryQuality: entryQuality,
              overuseQuantity: overuseQuantity,
              overMaximumHourCapacityRight: overMaximumHourCapacityRight,
              bookValue: valueCapaArr,
              unit: e['row'][9],
              entryExitText: e['row'][10],
              zoneText: e['row'][0],
              areaText: e['row'][2],
              contractPointText: e['row'][3]
            }
          })
        }

        if (weekBook) {
          messageError.push(`Nomination Point does not match the Contract Code.`)

          // throw new HttpException(
          //   {
          //     status: HttpStatus.FORBIDDEN,
          //     error: 'Nomination Point does not match the Contract Code.'
          //   },
          //   HttpStatus.FORBIDDEN
          // )
        }
      }

      let groupedBywarningLogHrTemp: any = Object.values(
        warningLogHrTemp.reduce((acc, item) => {
          const key = item && `${item?.hr}|${item?.contractPoint}|${item?.value}|${item?.unit}` || ""
          if (!acc[key]) {
            acc[key] = {
              hr: item && item.hr || "",
              contractPoint: item && item.contractPoint || null,
              value: item.value,
              valueDay: item.valueDay,
              unit: item.unit,
              data: []
            }
          }
          acc[key].data.push(item)
          return acc
        }, {})
      )

      for (let ig = 0; ig < groupedBywarningLogHrTemp.length; ig++) {
        const energyValues = groupedBywarningLogHrTemp[ig]?.data?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.energy) || 0, 0)

        if (parseToNumber3Decimal(energyValues) > parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) {
          if (isMatch(groupedBywarningLogHrTemp[ig]?.unit, 'MMscfd')) {
            warningLogHr.push(
              `Nominated max volume ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) ?? ''} for contract point ${groupedBywarningLogHrTemp[ig]?.contractPoint || '-'} and hour ${groupedBywarningLogHrTemp[ig]?.hr || '-'}`
            )
          } else {
            warningLogHr.push(
              `Nominated max energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) ?? ''} for contract point ${groupedBywarningLogHrTemp[ig]?.contractPoint || '-'} and hour ${groupedBywarningLogHrTemp[ig]?.hr || '-'}`
            )
          }
        }
      }

      let groupedBywarningLogTotalTemp: any = Object.values(
        groupedBywarningLogHrTemp.reduce((acc, item) => {
          const key = `${item?.contractPoint}|${item?.value}|${item?.unit}`
          if (!acc[key]) {
            acc[key] = {
              contractPoint: item && item.contractPoint || null,
              value: item.value,
              valueDay: item.valueDay,
              unit: item.unit,
              data: []
            }
          }
          acc[key].data.push(item)
          return acc
        }, {})
      )

      for (let ig = 0; ig < groupedBywarningLogTotalTemp.length; ig++) {
        const energyValues = groupedBywarningLogTotalTemp[ig]?.data?.reduce((accumulator, currentValue) => {
          let cal_ =
            accumulator +
              currentValue?.data?.reduce((accumulator, currentValue) => {
                return accumulator + parseToNumber(currentValue?.energy) || 0
              }, 0) || 0

          return cal_
        }, 0)
        if (parseToNumber3Decimal(energyValues) > parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay)) {
          if (isMatch(groupedBywarningLogTotalTemp[ig]?.unit, 'MMscfd')) {
            warningLogDay.push(
              `Nominated Total volume ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for contract point ${groupedBywarningLogTotalTemp[ig]?.contractPoint} and gas day ${startDateEx}`
            )
          } else {
            warningLogDay.push(
              `Nominated Total energy ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for contract point ${groupedBywarningLogTotalTemp[ig]?.contractPoint} and gas day ${startDateEx}`
            )
          }
        }
      }
      // weekly total

      let groupedBywarningLogHrWeeklyTemp: any = Object.values(
        warningLogDayWeekTemp.reduce((acc, item) => {
          const key = `${item?.headDayUse}|${item?.contractPoint}|${item?.value}|${item?.unit}`
          if (!acc[key]) {
            acc[key] = {
              headDayUse: item.headDayUse,
              contractPoint: item && item.contractPoint || null,
              value: item.value,
              unit: item.unit,
              data: []
            }
          }
          acc[key].data.push(item)
          return acc
        }, {})
      )

      for (let ig = 0; ig < groupedBywarningLogHrWeeklyTemp.length; ig++) {
        const energyValues = groupedBywarningLogHrWeeklyTemp[ig]?.data?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.energy) || 0, 0)

        if (parseToNumber3Decimal(energyValues) > parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value)) {
          if (isMatch(groupedBywarningLogHrWeeklyTemp[ig]?.unit, 'MMscfd')) {
            warningLogDayWeek.push(
              `Nominated Total volume ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues)) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for contract point ${
                groupedBywarningLogHrWeeklyTemp[ig]?.contractPoint
              } and gas day ${groupedBywarningLogHrWeeklyTemp[ig]?.headDayUse}`
            )
          } else {
            warningLogDayWeek.push(
              `Nominated Total energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues)) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for contract point ${
                groupedBywarningLogHrWeeklyTemp[ig]?.contractPoint
              } and gas day ${groupedBywarningLogHrWeeklyTemp[ig]?.headDayUse}`
            )
          }
        }
      }

      // const otherTypeNameList = Array.from(new Set((caseData?.columnOther || []).map((columnOther: any) => columnOther[3] || columnOther[4] || columnOther[5] || '')))
      const otherTypeIndexList = (caseData?.columnOther || []).map((columnOther: any) => columnOther.ix+1)
      if(otherTypeIndexList.length > 0){
        const otherTypeListText = otherTypeIndexList.length === 1
          ? (otherTypeIndexList[0] ?? '')
          : otherTypeIndexList.length === 2
            ? `${otherTypeIndexList[0]} and ${otherTypeIndexList[1]}`
            : `${otherTypeIndexList.slice(0, -1).join(', ')}, and ${otherTypeIndexList[otherTypeIndexList.length - 1]}`;
        warningOtherTypePoint.push(`Row ${otherTypeListText} will not be used due to incomplete details.`)
      }

      // https://app.clickup.com/t/86etrq2b6
      if (checkEmtry?.filter((f: any) => f === true).length === getsValue.length) {
        messageError.push(`Nomination Point does not match Emtry All.`)
        // throw new HttpException(
        //   {
        //     status: HttpStatus.FORBIDDEN,
        //     error: 'Nomination Point does not match Emtry All.'
        //   },
        //   HttpStatus.FORBIDDEN
        // )
      }

      if (nomination_type_id === 1) {
        // https://app.clickup.com/t/9018502823/86exmx0wd
        const validateListForEmptyValue = []
        getsValue?.map((item: any) => {
          item?.row?.slice(14)?.map((value: any, index: number) => {
            if ((value === '' || value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) && index < 24) {
              const pointName = item.row[3] || item.row[4] || item.row[5]
              const unit = item.row[9]
              const hour = index + 1
              // validateListForEmptyValue.push(`Missing hourly value. Please specify all hourly values. ${pointName ? `Check point ${pointName}` : ''} ${unit ? `Unit ${unit}` : ''} ${hour ? `at hour ${hour}` : ''}.`)
              messageError.push(`Missing hourly value. Please specify all hourly values. ${pointName ? `Check point ${pointName}` : ''} ${unit ? `Unit ${unit}` : ''} ${hour ? `at hour ${hour}` : ''}.`)
            }
          })
        })

        // if (validateListForEmptyValue.length > 0) {
        //   this.logger.log(`[ERROR] ${validateListForEmptyValue.join('\n')}`)
        //   const message = validateListForEmptyValue.join('<br/>')
        //   throw new HttpException(
        //     {
        //       status: HttpStatus.BAD_REQUEST,
        //       error: message
        //     },
        //     HttpStatus.BAD_REQUEST
        //   )
        // }
      }

      // sheet 2 check
      const indexSheetLastValue = sheet2.data.findIndex((row: any) => row.includes('*'))
      let fullShee2Data = []
      for (let i = 0; i < sheet2?.data.length; i++) {
        if (i > 1 && i < indexSheetLastValue) {
          fullShee2Data.push(sheet2?.data[i])
        }
      }

      let nominationFullJson = {
        shiperInfo: {
          '0': {
            'SHIPPER ID': sheet1?.data?.[2]?.[0]
          },
          '1': {
            'CONTRACT CODE': sheet1?.data?.[2]?.[1]
          },
          '2': {
            'START DATE': sheet1?.data?.[2]?.[2]
          }
        },
        headData: this.transformColumnDF(sheet1?.data?.[3]),
        valueData: this.transformColumn(fullDataRow).map((e: any) => e?.row),
        typeDoc: {
          columnType: this.transformColumn(caseData?.columnType),
          columnParkUnparkinstructedFlows: this.transformColumn(caseData?.columnParkUnparkinstructedFlows),
          columnWHV: this.transformColumn(caseData?.columnWHV),
          columnPointId: this.transformColumn(caseData?.columnPointId),
          columnPointIdConcept: this.transformColumn(caseData?.columnPointIdConcept),
          columnOther: this.transformColumn(caseData?.columnOther)
        }
      }
      let nominationRowJson: any = [
        ...nominationFullJson?.typeDoc?.columnPointId.map((e: any) => {
          return {
            zone_text: e?.row['0'] || null,
            area_text: e?.row['2'] || null,
            entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
            data: e?.row,
            old_index: e?.ix,
            type: 1
          }
        }),
        ...nominationFullJson?.typeDoc?.columnPointIdConcept.map((e: any) => {
          return {
            zone_text: e?.row['0'] || null,
            area_text: e?.row['2'] || null,
            entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
            data: e?.row,
            old_index: e?.ix,
            type: 2
          }
        }),
        ...nominationFullJson?.typeDoc?.columnType.map((e: any) => {
          return {
            zone_text: e?.row['0'] || null,
            area_text: e?.row['2'] || null,
            entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
            data: e?.row,
            old_index: e?.ix,
            type: 3
          }
        }),
        ...nominationFullJson?.typeDoc?.columnParkUnparkinstructedFlows.map((e: any) => {
          return {
            zone_text: e?.row['0'] || null,
            area_text: e?.row['2'] || null,
            entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
            data: e?.row,
            old_index: e?.ix,
            type: 4
          }
        }),
        ...nominationFullJson?.typeDoc?.columnWHV.map((e: any) => {
          return {
            zone_text: e?.row['0'] || null,
            area_text: e?.row['2'] || null,
            entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
            data: e?.row,
            old_index: e?.ix,
            type: 5
          }
        }),
        ...nominationFullJson?.typeDoc?.columnOther.map((e: any) => {
          return {
            zone_text: e?.row['0'] || null,
            area_text: e?.row['2'] || null,
            entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
            data: e?.row,
            old_index: e?.ix,
            type: 6
          }
        })
      ]

      let nominationFullJsonSheet2: any = {
        headData: this.transformColumnDF(sheet2?.data?.[1]),
        valueData: fullShee2Data.map((e: any) => this.transformColumnDF(e))
      }
      // ใส่ * ในไฟลได้
      const idx_dokjan_nominationFullJson = nominationFullJson.valueData.findIndex((r) => String(r?.[0]).trim() === '*')
      const result_dokjan_nominationFullJson = idx_dokjan_nominationFullJson === -1 ? nominationFullJson.valueData : nominationFullJson.valueData.slice(0, idx_dokjan_nominationFullJson)
      nominationFullJson.valueData = result_dokjan_nominationFullJson
      const idx_dokjan_nominationRowJson = nominationRowJson.findIndex((r) => String(r?.zone_text).trim() === '*')
      const result_dokjan_nominationRowJson = idx_dokjan_nominationRowJson === -1 ? nominationRowJson : nominationRowJson.slice(0, idx_dokjan_nominationRowJson)
      nominationRowJson = result_dokjan_nominationRowJson

      function ensure4DecimalPlaces(numStr: any): any {
        const s = String(numStr).trim()

        if (!/^[+-]?\d+(\.\d*)?$/.test(s)) {
          throw new Error(`Invalid number format: "${numStr}"`)
        }

        const [intPart, fracPart = ''] = s.split('.')
        if (fracPart.length > 4) {
          messageError.push(`Invalid format: Column SG must have exactly 4 decimal places (e.g., 0.0000).`)
          // throw new HttpException(
          //   {
          //     status: HttpStatus.FORBIDDEN,
          //     error: 'Invalid format: Column SG must have exactly 4 decimal places (e.g., 0.0000).'
          //   },
          //   HttpStatus.FORBIDDEN
          // )
        }

        return `${intPart}.${fracPart.padEnd(4, '0')}`
      }

      nominationFullJson.valueData = nominationFullJson.valueData?.map((e_: any) => {
        // data
        let data_: any = e_
        if (data_[13]) {
          data_[13] = ensure4DecimalPlaces(data_[13])
          return data_
        } else {
          return e_
        }
      })
      nominationRowJson = nominationRowJson?.map((e_: any) => {
        const {data, ...nE_} = e_
        if (data[13]) {
          data[13] = ensure4DecimalPlaces(data[13])
          return {
            ...nE_,
            data
          }
        } else {
          return {
            ...nE_,
            data
          }
        }
      })
      // https://app.clickup.com/t/86euzxxnq
      nominationRowJson = nominationRowJson?.map((e_: any) => {
        if (e_?.data[2] !== '' && e_?.data[9]?.toUpperCase() === 'MMSCFD' && e_?.data[10]?.toUpperCase() === 'ENTRY') {
          if (!!!e_?.data[11] || !!!e_?.data[12] || !!!e_?.data[13]) {
            messageError.push(`Missing required data: HV, WI, and SG must be provided for Entry points using MMSCFD unit.`)
            // throw new HttpException(
            //   {
            //     status: HttpStatus.FORBIDDEN,
            //     error: 'Missing required data: HV, WI, and SG must be provided for Entry points using MMSCFD unit.'
            //   },
            //   HttpStatus.FORBIDDEN
            // )
          }
        }
        return e_
      })

      const concept_point = await this.prisma.concept_point.findMany({
        where: {
          type_concept_point_id: 3,
          AND: [
            {
              start_date: {
                lte: getTodayEndDDMMYYYYDfaultAdd7(startDateEx).toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gte: getTodayStartDDMMYYYYDfaultAdd7(startDateEx).toDate()
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        }
      })

      // จะต้องไม่สามารถนำค่าติดลบเข้ามาในระบบได้ และจะต้องขึ้นแจ้งเตือน โดยแจ้งเตือนต้องระบุให้ชัดเจนว่า Point ที่ติดลบนั้นคือ Point อะไร
      // daily 14 - 38
      // weekly 14 - 20
      nominationRowJson?.map((e_: any) => {
        let nomSum = 0
        Object.assign([], e_?.data)?.map((ee_: any, ii: any) => {
          if (String(tabType) === '1') {
            for (let i = 14; i < 38; i++) {
              if (ii === i) {
                const isNotNumber = (v: any) => {
                  if (v === null || v === undefined) return false // allow empty

                  const str = String(v).trim().replace(/,/g, '')
                  if (str === '') return false // allow empty

                  const n = Number(str)
                  return Number.isNaN(n)
                }
                if (isNotNumber(ee_)) {
                  messageError.push(`Point ${e_?.data[3]}: Invalid input. Only numeric values are allowed in H1–H24 and Total columns.`)
                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: `Point ${e_?.data[3]}: Invalid input. Only numeric values are allowed in H1–H24 and Total columns.` // https://app.clickup.com/t/86euzxxgg
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }
                const n = Number(ee_)

                const isNegative = Number.isFinite(n) && n < 0
                const fOther = concept_point?.find((f: any) => f?.concept_point === e_?.data[5])
                if (!fOther) {
                  // ห้ามมีติดลบ
                  if (isNegative) {
                    messageError.push(`Invalid Gas Quality data. Negative values are not allowed ${e_?.data[3] || e_?.data[5]}.`)

                    // throw new HttpException(
                    //   {
                    //     status: HttpStatus.FORBIDDEN,
                    //     // error: `Point: ${e_?.data[3] || e_?.data[5]} [H${i - 14 + 1}] Value ${ee_} Positive.`,
                    //     error: `Invalid Gas Quality data. Negative values are not allowed ${e_?.data[3] || e_?.data[5]}.` // https://app.clickup.com/t/86euzxxq9
                    //   },
                    //   HttpStatus.FORBIDDEN
                    // )
                  }
                }
                nomSum = parseToNumber6Decimal(nomSum + n) // ปัดเศษเพื่อป้องกันการคำนวณผิดพลาดของ node ที่ตัวเลขจะเคลื่อนไป 0.00000000001 ส่วนที่ปัดเศษที่ตำแหน่งที่ 6 เพราะ nom file ไม่ให้มีตัวเลขทศนิยมมากกว่า 4 ตำแหน่ง
              } else {
                // ห้ามว่าง ไม่มีใน validate excel
              }
            }
          } else if (String(tabType) === '2') {
            for (let i = 14; i <= 20; i++) {
              if (ii === i) {
                const isNotNumber = (v: any) => {
                  if (v === null || v === undefined) return false // allow empty

                  const str = String(v).trim().replace(/,/g, '')
                  if (str === '') return false // allow empty

                  const n = Number(str)
                  return Number.isNaN(n)
                }
                if (isNotNumber(ee_)) {
                  messageError.push(`Point ${e_?.data[3]}: Invalid input. Only numeric values are allowed in each day columns.`)

                  // throw new HttpException(
                  //   {
                  //     status: HttpStatus.FORBIDDEN,
                  //     error: `Point ${e_?.data[3]}: Invalid input. Only numeric values are allowed in each day columns.` // https://app.clickup.com/t/86euzxxgg
                  //   },
                  //   HttpStatus.FORBIDDEN
                  // )
                }
                const n = Number(ee_)
                const isNegative = Number.isFinite(n) && n < 0
                const fOther = concept_point?.find((f: any) => f?.concept_point === e_?.data[5])
                if (!fOther) {
                  // ห้ามมีติดลบ
                  if (isNegative) {
                    messageError.push(`Invalid Gas Quality data. Negative values are not allowed ${e_?.data[3] || e_?.data[5]}.`)

                    // throw new HttpException(
                    //   {
                    //     status: HttpStatus.FORBIDDEN,
                    //     error: `Invalid Gas Quality data. Negative values are not allowed ${e_?.data[3] || e_?.data[5]}.` // https://app.clickup.com/t/86euzxxq9
                    //   },
                    //   HttpStatus.FORBIDDEN
                    // )
                  }
                }
              } else {
                // ห้ามว่าง ไม่มีใน validate excel
              }
            }
          }
          return ee_
        })
        if (String(tabType) === '1') {
          const total_ = Number(e_?.data?.[38])
          if (nomSum !== total_) {
            messageError.push(`The total value should be equal to the summatory of 24 hours for ${e_?.data?.[3] || e_?.data?.[5]}.`)

            // throw new HttpException(
            //   {
            //     status: HttpStatus.FORBIDDEN,
            //     error: `The total value should be equal to the summatory of 24 hours for ${e_?.data?.[3] || e_?.data?.[5]}.`
            //   },
            //   HttpStatus.FORBIDDEN
            // )
          }
        }

        return e_
      })

      // https://app.clickup.com/t/86euzxxq9
      const checkSheet1Entry = nominationRowJson
        ?.filter((f: any) => f?.data[10]?.toUpperCase() === 'ENTRY' && f?.type === 1 && (f?.data[9]?.toUpperCase() === 'MMSCFD' || f?.data[9]?.toUpperCase() === 'MMSCFH'))
        ?.map((e_: any) => {
          return {
            zone: e_?.data[0],
            point: e_?.data[3]
          }
        })
        const unique_checkSheet1Entry = Array.from(new Map(checkSheet1Entry.map((o) => [`${o.zone}__${o.point}`, o])).values())
      // Validate มากเกินไม่ได้ ขาดไม่ได้
      if ([...new Set(nominationFullJsonSheet2?.valueData?.map((e_: any) => e_?.[1]))]?.length !== unique_checkSheet1Entry?.length) {
        const diff = [...new Set(nominationFullJsonSheet2?.valueData?.map((e_: any) => e_?.[1]))].filter((item) => !unique_checkSheet1Entry?.map((e: any) => e?.point).includes(item))
        if (nominationFullJsonSheet2?.valueData?.length > unique_checkSheet1Entry?.length) {
          messageError.push(`Gas Quality data is not match ${diff?.join(',')}.`)
          // throw new HttpException(
          //   {
          //     status: HttpStatus.FORBIDDEN,
          //     error: `Gas Quality data is not match ${diff?.join(',')}.` // https://app.clickup.com/t/9018502823/86euzxxq9
          //   },
          //   HttpStatus.FORBIDDEN
          // )
        } else {
          messageError.push(`Gas Quality data have not been received for all nominated entry points.`)

          // throw new HttpException(
          //   {
          //     status: HttpStatus.FORBIDDEN,
          //     error: `Gas Quality data have not been received for all nominated entry points.`
          //   },
          //   HttpStatus.FORBIDDEN
          // )
        }
      }

      nominationFullJsonSheet2?.valueData?.map((e_: any) => {
        const findPoint = unique_checkSheet1Entry?.find((f: any) => {
          return f?.zone?.toUpperCase() === e_[0]?.toUpperCase() && f?.point?.toUpperCase() === e_[1]?.toUpperCase()
        })

        const diff2 = nominationFullJsonSheet2?.valueData?.filter((e_: any) => {
          const findPoint = unique_checkSheet1Entry?.find((f: any) => {
            return f?.zone?.toUpperCase() === e_?.[0]?.toUpperCase() && f?.point?.toUpperCase() === e_?.[1]?.toUpperCase()
          })

          return !findPoint
        })
        // point ไม่มีตรงใน sheet1
        if (!findPoint) {
          messageError.push(`Gas Quality data is not match ${diff2?.map((e: any) => e?.[1])?.join(',')}.`)

          // throw new HttpException(
          //   {
          //     status: HttpStatus.FORBIDDEN,
          //     error: `Gas Quality data is not match ${diff2?.map((e: any) => e?.[1])?.join(',')}`
          //   },
          //   HttpStatus.FORBIDDEN
          // )
        }
        for (let i = 2; i <= 17; i++) {
          if (e_[i]) {
            const n = Number(e_[i])
            const isNegative = Number.isFinite(n) && n < 0
            // ห้ามมีติดลบ
            if (!!!e_[i]) {
              messageError.push(`Missing Gas Quality data. All Fields must be filled ${e_ && e_?.[1] || ""}.`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `Missing Gas Quality data. All Fields must be filled ${e_?.[1]}.` // https://app.clickup.com/t/86euzxxq9
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }

            if (isNegative) {
              messageError.push(`Invalid Gas Quality data. Negative values are not allowed ${e_ && e_?.[1] || ""}.`)

              // throw new HttpException(
              //   {
              //     status: HttpStatus.FORBIDDEN,
              //     error: `Invalid Gas Quality data. Negative values are not allowed ${e_?.[1]}.`
              //   },
              //   HttpStatus.FORBIDDEN
              // )
            }
          } else {
            // ห้ามว่าง
            messageError.push(`Missing Gas Quality data. All Fields must be filled ${e_ && e_?.[1] || ""}.`)

            // throw new HttpException(
            //   {
            //     status: HttpStatus.FORBIDDEN,
            //     error: `Missing Gas Quality data. All Fields must be filled ${e_?.[1]}.`
            //   },
            //   HttpStatus.FORBIDDEN
            // )
          }

          const isNotNumber = (v: any) => {
            if (v === null || v === undefined) return false // allow empty

            const str = String(v).trim().replace(/,/g, '')
            if (str === '') return false // allow empty

            const n = Number(str)
            return Number.isNaN(n)
          }
          if (isNotNumber(e_[i])) {
            messageError.push(`Quality : Invalid input. Only numeric values are allowed in these columns.`)

            // throw new HttpException(
            //   {
            //     status: HttpStatus.FORBIDDEN,
            //     error: `Quality : Invalid input. Only numeric values are allowed in these columns.` // https://app.clickup.com/t/86euzxxgg
            //   },
            //   HttpStatus.FORBIDDEN
            // )
          }
        }

        return e_
      })

      const responseUpFile = await uploadFilsTemp(fileOriginal)
      const nominationCount = await this.prisma.query_shipper_nomination_file.count({
        where: {
          nomination_type_id: nomination_type_id,
          create_date: {
            gte: getTodayStartAdd7().toDate(), // เริ่มต้นวันตามเวลาประเทศไทย
            lte: getTodayEndAdd7().toDate() // สิ้นสุดวันตามเวลาประเทศไทย
          }
        }
      })

      let nomination_code = `${getTodayNow().format('YYYYMMDD')}-${nomination_type_id === 1 ? 'DNM' : 'WNM'}-${String(nominationCount + 1).padStart(4, '0')}`

      let warningAll = [...sheet1Quality, ...sheet2Quality, ...warningLogHr, ...warningLogDayWeek, ...warningLogDay, ...warningOtherTypePoint]

      // ===== STEP 29: WARNING HANDLING =====
      const finalData = {
        startDateExConv,
        nomination_code: nomination_code,
        dataInfo: {
          shipper_id,
          contract_code_id,
          checkType,
          nomination_type_id,
          files: responseUpFile?.file?.url,
          userId
        },
        nominationFullJson,
        nominationRowJson,
        nominationFullJsonSheet2,
        renom,
        sheet1Quality: sheet1Quality,
        sheet2Quality: sheet2Quality,
        overuseQuantity: warningLogDayWeek.length || warningLogDay.length > 0 ? true : null,
        overMaximumHourCapacityRight: warningLogHr.length > 0 || warningLogDayWeek.length > 0 ? true : null,
        warningLogHr: warningLogHr,
        warningLogDay: warningLogDay,
        warningLogDayWeek: warningLogDayWeek,
        warningOtherTypePoint: warningOtherTypePoint,
        warningAll,
        informationData
        // exampleBookingFullJson: bookingFullJson,
      }

      const newDate = getTodayNowAdd7()
      let checkVersion = null
      checkVersion = await this.prisma.query_shipper_nomination_file.findFirst({
        where: {
          contract_code_id: Number(contract_code_id),
          nomination_type_id: Number(nomination_type_id),
          gas_day: getTodayNowDDMMYYYYDfaultAdd7(startDateEx).toDate(),

          AND: [
            {
              OR: [
                {
                  del_flag: false
                },
                {
                  del_flag: null
                }
              ]
            }
          ]
        },
        include: {
          contract_code: true
        }
      })

      if (nomination_type_id === 1) {
        const nominationData = nominationFullJson?.typeDoc?.columnPointId?.map((e: any) => e?.row)
        const nonTpaData = nominationFullJson?.typeDoc?.columnType?.map((e: any) => e?.row)
        for (let i = 0; i < nonTpaData.length; i++) {
          const nTpa = nonTpaData[i][3]?.trimEnd()
          const findNom = nonTpa?.find((f: any) => {
            return f?.non_tpa_point_name?.trimEnd() === nTpa
          })
          const findNomName = findNom?.nomination_point?.nomination_point || null
          const findNomData = nominationData?.find((f: any) => {
            return f[3]?.trimEnd() === findNomName?.trimEnd() && f[9] === 'MMBTU/D'
          })
          if (findNomData) {
            if (!!nonTpaData[i]?.[38] && !!findNomData?.[38] && Number(nonTpaData[i]?.[38]) > Number(findNomData?.[38])) {
              // https://app.clickup.com/t/86etzcgt0
            }
          } else {
            messageError.push(`${findNomName ?? 'Nomination Point'} is not found in file for ${nTpa ?? 'Non-TPA Point'}.`)

            // throw new HttpException(
            //   {
            //     status: HttpStatus.BAD_REQUEST,
            //     error: `${findNomName ?? 'Nomination Point'} is not found in file for ${nTpa ?? 'Non-TPA Point'}.`
            //   },
            //   HttpStatus.BAD_REQUEST
            // )
          }
        }
      } else {
        // weekly
        const nominationData = nominationFullJson?.typeDoc?.columnPointId?.map((e: any) => e?.row)
        const nonTpaData = nominationFullJson?.typeDoc?.columnType?.map((e: any) => e?.row)
        for (let i = 0; i < nonTpaData.length; i++) {
          const nTpa = nonTpaData[i][3]?.trimEnd()
          const findNom = nonTpa?.find((f: any) => {
            return f?.non_tpa_point_name?.trimEnd() === nTpa?.trimEnd()
          })
          const findNomName = findNom?.nomination_point?.nomination_point || null
          const findNomData = nominationData?.find((f: any) => {
            return f[3]?.trimEnd() === findNomName?.trimEnd()
          })
          if (findNomData) {
            if (!!nonTpaData[i]?.[14] && !!findNomData?.[14] && Number(nonTpaData[i]?.[14]) > Number(findNomData?.[14])) {
              // https://app.clickup.com/t/86etzcgt0
            }
            if (!!nonTpaData[i]?.[15] && !!findNomData?.[15] && Number(nonTpaData[i]?.[15]) > Number(findNomData?.[15])) {
              // https://app.clickup.com/t/86etzcgt0
            }
            if (!!nonTpaData[i]?.[16] && !!findNomData?.[16] && Number(nonTpaData[i]?.[16]) > Number(findNomData?.[16])) {
              // https://app.clickup.com/t/86etzcgt0
            }
            if (!!nonTpaData[i]?.[17] && !!findNomData?.[17] && Number(nonTpaData[i]?.[17]) > Number(findNomData?.[17])) {
              // https://app.clickup.com/t/86etzcgt0
            }
            if (!!nonTpaData[i]?.[18] && !!findNomData?.[18] && Number(nonTpaData[i]?.[18]) > Number(findNomData?.[18])) {
              // https://app.clickup.com/t/86etzcgt0
            }
            if (!!nonTpaData[i]?.[19] && !!findNomData?.[19] && Number(nonTpaData[i]?.[19]) > Number(findNomData?.[19])) {
              // https://app.clickup.com/t/86etzcgt0
            }
            if (!!nonTpaData[i]?.[20] && !!findNomData?.[20] && Number(nonTpaData[i]?.[20]) > Number(findNomData?.[20])) {
              // https://app.clickup.com/t/86etzcgt0
            }
          } else {
            messageError.push(`${findNomName ?? 'Nomination Point'} is not found in file for ${nTpa ?? 'Non-TPA Point'}.`)

            // throw new HttpException(
            //   {
            //     status: HttpStatus.BAD_REQUEST,
            //     error: `${findNomName ?? 'Nomination Point'} is not found in file for ${nTpa ?? 'Non-TPA Point'}.`
            //   },
            //   HttpStatus.BAD_REQUEST
            // )
          }
        }
      }

      if (messageError?.length > 0) {
        const uniqueMessageError = [...new Set(messageError)]
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: uniqueMessageError?.join('<br/>')
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'test.'
      //   },
      //   HttpStatus.BAD_REQUEST
      // )

      if (checkVersion) {
        // มี update
        const contractStart = dayjs(contractCode?.contract_start_date).format('YYYY-MM-DD')
        const contractStartDayjs = dayjs(contractStart, 'YYYY-MM-DD')
        const excelStart = dayjs(nominationFullJson?.shiperInfo['2']['START DATE'], 'DD/MM/YYYY')
        const isExcelStartBeforeContract = excelStart.isBefore(contractStartDayjs, 'day')
        if (isExcelStartBeforeContract) {
          if (isMatch(checkType, 'Weekly Nomination')) {
            if (!excelStart.isSame(contractStartDayjs, 'week')) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'Failed Gas Day date does not match the Contract Start Date.'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Failed Gas Day date does not match the Contract Start Date.'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        }

        // update
        const queryShipperNominationFile = await this.prisma.query_shipper_nomination_file.update({
          where: {
            id: Number(checkVersion?.id ?? -1)
          },
          data: {
            query_shipper_nomination_file_renom: {
              connect: {
                id: finalData?.renom ? 1 : 2
              }
            },
            entry_quality: finalData?.sheet1Quality.length > 0 ? true : null,
            overuse_quantity: finalData?.overuseQuantity,
            over_maximum_hour_capacity_right: finalData?.overMaximumHourCapacityRight,
            gas_day: getTodayNowDDMMYYYYDfaultAdd7(startDateEx).toDate(),
            update_date_num: newDate.unix(),
            submitted_timestamp: newDate.toDate(),
            update_date: newDate.toDate(),
            update_by_account: {
              connect: {
                id: Number(userId)
              }
            },
            query_shipper_nomination_status: {
              connect: {
                id: 1
              }
            }
          }
        })

        const flaseVersion = await this.prisma.nomination_version.updateMany({
          where: {
            query_shipper_nomination_file_id: Number(checkVersion?.id ?? -1)
          },
          data: {
            flag_use: false
          }
        })

        const nominationVersionCount = await this.prisma.nomination_version.count({
          where: {
            query_shipper_nomination_file_id: queryShipperNominationFile?.id
          }
        })

        // version
        const nominationVersion = await this.prisma.nomination_version.create({
          data: {
            version: `V.${nominationVersionCount + 1}`,
            query_shipper_nomination_file: {
              connect: {
                id: queryShipperNominationFile?.id
              }
            },
            flag_use: true,
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        // json full
        const fullJson = await this.prisma.nomination_full_json.create({
          data: {
            data_temp: JSON.stringify(nominationFullJson),
            nomination_version: {
              connect: {
                id: nominationVersion?.id
              }
            },
            flag_use: true,
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        // json full sheet2
        const fullJson2 = await this.prisma.nomination_full_json_sheet2.create({
          data: {
            data_temp: JSON.stringify(nominationFullJsonSheet2),
            nomination_version: {
              connect: {
                id: nominationVersion?.id
              }
            },
            flag_use: true,
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        // json row
        const rowJson = await this.prisma.nomination_row_json.createMany({
          data: (nominationRowJson || []).map((e: any) => {
            return {
              nomination_version_id: nominationVersion?.id,
              flag_use: true,
              zone_text: e?.zone_text,
              area_text: e?.area_text,
              entry_exit_id: e?.entry_exit_id,
              query_shipper_nomination_type_id: e?.type,
              data_temp: JSON.stringify(e?.data),
              old_index: e && e?.old_index || null,
              create_date_num: newDate.unix(),
              create_date: newDate.toDate(),
              create_by: Number(userId)
            }
          })
        })

        // warning
        const submissionFile = await this.prisma.submission_comment_query_shipper_nomination_file.createMany({
          data: (warningAll || []).map((e: any) => {
            return {
              remark: e,
              query_shipper_nomination_file_id: Number(queryShipperNominationFile?.id),
              create_date_num: newDate.unix(),
              create_date: newDate.toDate(),
              create_by: Number(userId),

              nomination_version_id: nominationVersion?.id
            }
          })
        })

        await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.query_shipper_nomination_file_url','id'),
          COALESCE((SELECT MAX(id) FROM public.query_shipper_nomination_file_url), 0),
          true
        )
      `)
        // file
        const queryShipperNominationFileUrl = await this.prisma.query_shipper_nomination_file_url.create({
          data: {
            url: finalData?.dataInfo?.files,
            query_shipper_nomination_file: {
              connect: {
                id: queryShipperNominationFile?.id
              }
            },
            nomination_version: {
              connect: {
                id: nominationVersion?.id
              }
            },
            query_shipper_nomination_status: {
              connect: {
                id: queryShipperNominationFile?.query_shipper_nomination_status_id
              }
            },
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })
        if (!!comment) {
          await this.queryShipperNominationFileService.comments(
            {
              reasons: false,
              comment: comment,
              query_shipper_nomination_file_id: Number(checkVersion?.id)
            },
            userId
          )
        }
      } else {
        // ไม่มี create
        const contractStart = dayjs(contractCode?.contract_start_date).format('YYYY-MM-DD')
        const contractStartDayjs = dayjs(contractStart, 'YYYY-MM-DD')
        const excelStart = dayjs(nominationFullJson?.shiperInfo['2']['START DATE'], 'DD/MM/YYYY')
        const isExcelStartBeforeContract = dayjs(excelStart).isBefore(dayjs(contractStart), 'day')
        if (isExcelStartBeforeContract) {
          if (isMatch(checkType, 'Weekly Nomination')) {
            if (!excelStart.isSame(contractStartDayjs, 'week')) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'Failed Gas Day date does not match the Contract Start Date.'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Failed Gas Day date does not match the Contract Start Date.'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        }
        // query_shipper_nomination_file_renom
        // query_shipper_nomination_fileToquery_shipper_nomination_file_renom
        // create
        // nominated energy

        const queryShipperNominationFile = await this.prisma.query_shipper_nomination_file.create({
          data: {
            entry_quality: finalData?.sheet1Quality.length > 0 ? true : null,
            overuse_quantity: finalData?.overuseQuantity,
            over_maximum_hour_capacity_right: finalData?.overMaximumHourCapacityRight,
            nomination_code: nomination_code,
            nomination_type: {
              connect: {
                id: Number(nomination_type_id)
              }
            },
            query_shipper_nomination_status: {
              connect: {
                id: 1
              }
            },
            contract_code: {
              connect: {
                id: Number(contract_code_id)
              }
            },
            group: {
              connect: {
                id: Number(shipper_id)
              }
            },
            query_shipper_nomination_file_renom: {
              connect: {
                id: finalData?.renom ? 1 : 2
              }
            },
            gas_day: getTodayNowDDMMYYYYDfaultAdd7(startDateEx).toDate(),
            create_date_num: newDate.unix(),
            submitted_timestamp: newDate.toDate(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        // version
        const nominationVersion = await this.prisma.nomination_version.create({
          data: {
            version: 'V.1',
            query_shipper_nomination_file: {
              connect: {
                id: queryShipperNominationFile?.id
              }
            },
            flag_use: true,
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        // json full
        const fullJson = await this.prisma.nomination_full_json.create({
          data: {
            data_temp: JSON.stringify(nominationFullJson),
            nomination_version: {
              connect: {
                id: nominationVersion?.id
              }
            },
            flag_use: true,
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        // json full sheet2
        const fullJson2 = await this.prisma.nomination_full_json_sheet2.create({
          data: {
            data_temp: JSON.stringify(nominationFullJsonSheet2),
            nomination_version: {
              connect: {
                id: nominationVersion?.id
              }
            },
            flag_use: true,
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        // json row
        const rowJson = await this.prisma.nomination_row_json.createMany({
          data: (nominationRowJson || []).map((e: any) => {
            return {
              nomination_version_id: nominationVersion?.id,
              flag_use: true,
              zone_text: e?.zone_text,
              area_text: e?.area_text,
              entry_exit_id: e?.entry_exit_id,
              query_shipper_nomination_type_id: e?.type,
              data_temp: JSON.stringify(e?.data),
              old_index: e && e?.old_index || null,
              create_date_num: newDate.unix(),
              create_date: newDate.toDate(),
              create_by: Number(userId)
            }
          })
        })

        // warning
        const submissionFile = await this.prisma.submission_comment_query_shipper_nomination_file.createMany({
          data: (warningAll || []).map((e: any) => {
            return {
              remark: e,
              query_shipper_nomination_file_id: Number(queryShipperNominationFile?.id),
              create_date_num: newDate.unix(),
              create_date: newDate.toDate(),
              create_by: Number(userId),

              nomination_version_id: nominationVersion?.id
            }
          })
        })

        // file
        const queryShipperNominationFileUrl = await this.prisma.query_shipper_nomination_file_url.create({
          data: {
            url: finalData?.dataInfo?.files,
            query_shipper_nomination_file: {
              connect: {
                id: queryShipperNominationFile?.id
              }
            },
            nomination_version: {
              connect: {
                id: nominationVersion?.id
              }
            },
            query_shipper_nomination_status: {
              connect: {
                id: queryShipperNominationFile?.query_shipper_nomination_status_id
              }
            },
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        if (!!comment) {
          await this.queryShipperNominationFileService.comments(
            {
              reasons: false,
              comment: comment,
              query_shipper_nomination_file_id: queryShipperNominationFile?.id
            },
            userId
          )
        }
      }

      // ===== STEP 36: RETURN FINAL RESULT =====
      // Return processed data with all validation results and saved information
      return finalData
    }
  }
}
