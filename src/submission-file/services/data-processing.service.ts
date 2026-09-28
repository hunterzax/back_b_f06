import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common'
import {PrismaService} from '../../../prisma/prisma.service'
import {getTodayNowDDMMYYYYDfault, getTodayEndDDMMYYYYDfaultAdd7, getTodayStartDDMMYYYYDfaultAdd7} from '../../common/utils/date.util'
import {isMatch} from 'src/common/utils/allocation.util'

export interface DataProcessingResult {
  startDateExConv: any
  renom: any
  getsValue: any[]
  getsValueNotMatch: any[]
  getsValuePark: any[]
  getsValueSheet2: any[]
  caseData: any
  informationData: any
  fullDataRow: any[]
  flagEmtry: boolean
  // overuseQuantity: boolean;
  // overMaximumHourCapacityRight: boolean;
  nominationPoint: any[]
  nonTpa: any[]
  conceptPoint: any[]
  // isEqualSheet2: boolean;
}

@Injectable()
export class DataProcessingService {
  private readonly logger = new Logger(DataProcessingService.name)
  constructor(private readonly prisma: PrismaService) {}

  /**
   * STEP 17-22: DATA PROCESSING SETUP AND VALIDATION
   * ตั้งค่าการประมวลผลข้อมูลและตรวจสอบ nomination points
   *
   * @param startDateEx - วันที่เริ่มต้นจากไฟล์
   * @param todayStart - วันที่เริ่มต้น
   * @param todayEnd - วันที่สิ้นสุด
   * @param sheet2 - ข้อมูล quality sheet
   * @returns DataProcessingResult - ผลลัพธ์การประมวลผลข้อมูล
   */
  async executeDataProcessing(startDateEx: string, todayStart: Date, todayEnd: Date, sheet2: any, nomination_type_id?: number): Promise<any> {
    try {
      // ===== STEP 17: DATA PROCESSING SETUP =====
      // const { startDateExConv, renom, getsValue, getsValueNotMatch, getsValuePark, getsValueSheet2, caseData, informationData, fullDataRow, flagEmtry } = this.setupDataProcessing(startDateEx);
      const {startDateExConv, getsValue, getsValueNotMatch, getsValuePark, getsValueSheet2, caseData, informationData, fullDataRow, flagEmtry} = this.setupDataProcessing(startDateEx)
      let startDateForMasterData = todayStart
      let endDateForMasterData = todayEnd
      let endDateEx: string | undefined = undefined
      if (startDateExConv.isValid()) {
        if (nomination_type_id == 2) {
          startDateForMasterData = startDateExConv.startOf('day').toDate()
          const endDateExConv = startDateExConv.add(1, 'week').endOf('day')
          endDateForMasterData = endDateExConv.toDate()
          endDateEx = endDateExConv.format('DD/MM/YYYY')
        }
      }

      // // ===== STEP 18: VALIDATION FLAGS ===== //
      // const { overuseQuantity, overMaximumHourCapacityRight } = this.setupValidationFlags();

      // ===== STEP 19: NOMINATION POINT VALIDATION =====
      const nominationPoint = await this.validateNominationPoints(startDateEx, nomination_type_id)

      // ===== STEP 20: NON-TPA POINT VALIDATION =====
      const nonTpa = await this.validateNonTpaPoints(startDateForMasterData, endDateForMasterData, startDateEx, endDateEx)
      // ===== STEP 21: CONCEPT POINT VALIDATION =====
      const conceptPoint = await this.validateConceptPoints(startDateEx)

      // // ===== STEP 22: QUALITY SHEET VALIDATION ===== //
      // const isEqualSheet2 = this.validateQualitySheet(sheet2);

      this.logger.log('STEP 17-22: DATA PROCESSING SETUP AND VALIDATION completed successfully')

      return {
        startDateExConv,
        // renom,
        getsValue,
        getsValueNotMatch,
        getsValuePark,
        getsValueSheet2,
        caseData,
        informationData,
        fullDataRow,
        flagEmtry,
        // overuseQuantity,
        // overMaximumHourCapacityRight,
        nominationPoint,
        nonTpa,
        conceptPoint
        // isEqualSheet2
      }
    } catch (error) {
      this.logger.error('Error in STEP 17-22: DATA PROCESSING SETUP AND VALIDATION:', error)
      throw error
    }
  }

  /**
   * STEP 17: DATA PROCESSING SETUP
   * ตั้งค่าการประมวลผลข้อมูล
   *
   * @param startDateEx - วันที่เริ่มต้นจากไฟล์
   * @returns Object containing processing setup data
   */
  private setupDataProcessing(startDateEx: string) {
    // Convert start date to proper format for processing
    const startDateExConv = getTodayNowDDMMYYYYDfault(startDateEx)
    // Initialize variables for data processing
    // const renom = null; // Renomination flag
    const getsValue = [] // Valid data values
    const getsValueNotMatch = [] // Data that doesn't match validation
    const getsValuePark = [] // Park/unpark data
    const getsValueSheet2 = [] // Quality sheet data
    const caseData = {
      columnType: [],
      columnParkUnparkinstructedFlows: [],
      columnWHV: [],
      columnPointId: [],
      columnPointIdConcept: [],
      columnOther: []
    }
    const informationData = {
      columnType: [],
      columnParkUnparkinstructedFlows: [],
      columnWHV: [],
      columnPointId: [],
      columnPointIdConcept: [],
      columnOther: []
    }
    const fullDataRow = [] // Complete data rows
    const flagEmtry = false // Flag to check if file has any valid data

    this.logger.log('STEP 17: Data processing setup completed')
    return {
      startDateExConv,
      // renom,
      getsValue,
      getsValueNotMatch,
      getsValuePark,
      getsValueSheet2,
      caseData,
      informationData,
      fullDataRow,
      flagEmtry
    }
  }

  /**
   * STEP 18: VALIDATION FLAGS
   * ตั้งค่า flag การตรวจสอบ
   *
   * @returns Object containing validation flags
   */
  private setupValidationFlags() {
    const overuseQuantity = false // Flag for overuse quantity validation
    const overMaximumHourCapacityRight = false // Flag for over maximum hour capacity validation

    this.logger.log('STEP 18: Validation flags setup completed')
    return {
      overuseQuantity,
      overMaximumHourCapacityRight
    }
  }

  /**
   * STEP 19: NOMINATION POINT VALIDATION
   * ตรวจสอบ nomination point
   *
   * @param startDateEx - วันที่เริ่มต้นจากไฟล์
   * @returns Array of nomination points
   */
  private async validateNominationPoints(startDateEx: string, nomination_type_id?: number) {
    // Get all active nomination points for the specified date range
    const nominationPoint = await this.prisma.nomination_point.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: nomination_type_id == 2 ? getTodayEndDDMMYYYYDfaultAdd7(startDateEx).endOf('week').toDate() : getTodayEndDDMMYYYYDfaultAdd7(startDateEx).toDate() // Point start date must be before or equal to file end date
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // If end_date is null (no end date)
              {
                end_date: {
                  gt: getTodayStartDDMMYYYYDfaultAdd7(startDateEx).toDate()
                }
              } // If end_date exists, must be after file start date
            ]
          }
        ]
      },
      orderBy: {
        end_date: 'desc' // Order by end date descending to get latest points first
      },
      include: {
        contract_point_list: {
          include: {
            area: true, // Include area information
            zone: true, // Include zone information
            entry_exit: true // Include entry/exit information
          }
        },
        area: true, // Include area information
        zone: true, // Include zone information
        entry_exit: true, // Include entry/exit information
        customer_type:true,
      }
    })

    this.logger.log('STEP 19: Nomination point validation completed')
    return nominationPoint
  }

  /**
   * STEP 20: NON-TPA POINT VALIDATION
   * ตรวจสอบ non-TPA point
   *
   * @param todayStart - วันที่เริ่มต้น
   * @param todayEnd - วันที่สิ้นสุด
   * @returns Array of non-TPA points
   */
  private async validateNonTpaPoints(todayStart: Date, todayEnd: Date, startDateEx: string, endDateEx?: string) {
    // Get all active non-TPA points for the current date range
    const nonTpa = await this.prisma.non_tpa_point.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: getTodayEndDDMMYYYYDfaultAdd7(endDateEx ?? startDateEx).toDate()
            }
          },
          {
            OR: [
              {
                end_date: null
              },
              {
                end_date: {
                  gt: getTodayStartDDMMYYYYDfaultAdd7(startDateEx).toDate()
                }
              }
            ]
          }
        ]
        // AND: [
        //   {
        //     start_date: {
        //       lte: todayEnd, // Point start date must be before or equal to today end
        //     },
        //   },
        //   {
        //     OR: [
        //       { end_date: null }, // If end_date is null (no end date)
        //       { end_date: { gte: todayStart } }, // If end_date exists, must be after or equal to today start
        //     ],
        //   },
        // ],
      },
      include: {
        nomination_point: {
          include: {
            contract_point_list: {
              include: {
                area: true, // Include area information
                zone: true, // Include zone information
                entry_exit: true // Include entry/exit information
              }
            },
            area: true, // Include area information
            zone: true, // Include zone information
            entry_exit: true // Include entry/exit information
          }
        }
      }
    })

    this.logger.log('STEP 20: Non-TPA point validation completed')
    return nonTpa
  }

  /**
   * STEP 21: CONCEPT POINT VALIDATION
   * ตรวจสอบ concept point
   *
   * @param startDateEx - วันที่เริ่มต้นจากไฟล์
   * @returns Array of concept points
   */
  private async validateConceptPoints(startDateEx: string) {
    // Get all active concept points for the specified date range

    const conceptPoint = await this.prisma.concept_point.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: getTodayEndDDMMYYYYDfaultAdd7(startDateEx).toDate() // Point start date must be before or equal to file end date
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // If end_date is null (no end date)
              {
                end_date: {
                  gte: getTodayStartDDMMYYYYDfaultAdd7(startDateEx).toDate()
                }
              } // If end_date exists, must be after or equal to file start date
            ]
          }
        ]
      },
      include: {
        limit_concept_point: {
          include: {
            group: true // Include group information for concept point limits
          }
        },
        type_concept_point: true // Include concept point type information
      }
    })

    this.logger.log('STEP 21: Concept point validation completed')
    return conceptPoint
  }

  /**
   * STEP 22: QUALITY SHEET VALIDATION
   * ตรวจสอบ quality sheet
   *
   * @param sheet2 - ข้อมูล quality sheet
   * @returns Boolean indicating if quality sheet is valid
   * @throws HttpException if quality sheet is invalid
   */
  private validateQualitySheet(sheet2: any) {
    // Check if Quality sheet exists and has data
    const isEqualSheet2 = sheet2 && sheet2.data && sheet2.data.length > 0

    if (!isEqualSheet2) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'File template does not match the required format.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    this.logger.log('STEP 22: Quality sheet validation completed')
    return isEqualSheet2
  }

  /**
   * STEP 26: VALIDATE DUPLICATE POINT
   * ตรวจสอบ duplicate point
   *
   * @param caseData - ข้อมูล caseData
   * @returns Array of error message
   */
  validateDuplicatePoint(caseData: any, conceptPoint: any[], isContract?: boolean) {
    // Group points by row.toString() เพื่อหา row ที่ซ้ำกัน
    const rowGroups = new Map<string, any[]>()
    let validateList: string[] = []

    const {columnPointId, columnPointIdConcept, columnOther, ...rest} = caseData
    const columnPointIdList = columnPointId || []
    for (const point of columnPointIdList) {
      const rowKey = point.row?.toString()
      if (!rowGroups.has(rowKey)) {
        rowGroups.set(rowKey, [])
      }
      rowGroups.get(rowKey)!.push(point)

      // Entry ต้องมีทั้ง MMBTU และ MMSCF
      const pointName = point.row?.[3]
      const unit = point.row?.[9]
      const entryExit = point.row?.[10]

      if (!isMatch(unit, 'MMBTU/D') && !isMatch(unit, 'MMBTU/H') && !isMatch(unit, 'MMSCFD') && !isMatch(unit, 'MMSCFH')) {
        validateList.push(`Unit ${unit} not support for ${pointName}.`)
      }
      if (isContract) {
        if (isMatch(entryExit, 'Entry')) {
          if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
            const isHaveAnotherUnit = columnPointIdList.some((otherPoint: any) => isMatch(otherPoint.row?.[3], point.row?.[3]) && isMatch(otherPoint.row?.[10], 'Entry') && (isMatch(otherPoint.row?.[9], 'MMSCFD') || isMatch(otherPoint.row?.[9], 'MMSCFH')))
            if (!isHaveAnotherUnit) {
              validateList.push(`Missing ${isMatch(unit, 'MMBTU/D') ? 'MMSCFD' : 'MMSCFH'} data for ${pointName}.`)
            }
          } else if (isMatch(unit, 'MMSCFD') || isMatch(unit, 'MMSCFH')) {
            const isHaveAnotherUnit = columnPointIdList.some((otherPoint: any) => isMatch(otherPoint.row?.[3], point.row?.[3]) && isMatch(otherPoint.row?.[10], 'Entry') && (isMatch(otherPoint.row?.[9], 'MMBTU/D') || isMatch(otherPoint.row?.[9], 'MMBTU/H')))
           
            if (!isHaveAnotherUnit) {
              validateList.push(`Missing ${isMatch(unit, 'MMSCFD') ? 'MMBTU/D' : 'MMBTU/H'} data for ${pointName}.`)
            }
          }
        } else if (isMatch(entryExit, 'Exit') && (isMatch(unit, 'MMSCFD') || isMatch(unit, 'MMSCFH'))) {
          validateList.push(`Invalid unit '${unit}' for ${pointName}.`)
        }
      }
    }

    for (const point of columnPointIdConcept) {
      const rowKey = point.row?.toString()
      if (!rowGroups.has(rowKey)) {
        rowGroups.set(rowKey, [])
      }
      rowGroups.get(rowKey)!.push(point)

      const pointName = point.row?.[3] || point.row?.[4] || point.row?.[5]
      const unit = point.row?.[9]
      const findConcept = (conceptPoint || []).sort((a: any, b: any) => a?.type_concept_point_id - b?.type_concept_point_id).find((f: any) => f?.concept_point === pointName)
      switch (findConcept?.type_concept_point_id) {
        case 1: // Gas quality related concepts
          if (!isMatch(unit, 'BTU/SCF')) {
            validateList.push(`Unit ${unit} not support for ${pointName}.`)
          }
          break
        case 2: // Nomination Physical gas concepts
          if (!isMatch(unit, 'MMBTU/D') && !isMatch(unit, 'MMBTU/H') && !isMatch(unit, 'MMSCFD') && !isMatch(unit, 'MMSCFH')) {
            validateList.push(`Unit ${unit} not support for ${pointName}.`)
          }
          break
        case 3: // Other (area/zone) concepts
          if (!isMatch(unit, 'MMBTU/D') && !isMatch(unit, 'MMBTU/H')) {
            validateList.push(`Unit ${unit} not support for ${pointName}.`)
          }
          break
        default: // Metering Physical gas concept
          break
      }
    }

    Object.values(rest).map((eachColumn: any) => {
      const eachColumnList = eachColumn || []
      for (const point of eachColumnList) {
        const rowKey = point.row?.toString()
        if (!rowGroups.has(rowKey)) {
          rowGroups.set(rowKey, [])
        }
        rowGroups.get(rowKey)!.push(point)
      }
    })

    // ข้อมูลทั้งหมดที่ point.row.toString() เหมือนกัน (count > 1)
    const duplicatePoints = [...rowGroups.values()].filter((group) => group.length > 1)

    duplicatePoints.map((group) => {
      const unit = group[0].row?.[9]
      const pointName = group[0].row?.[3] || group[0].row?.[4] || group[0].row?.[5]
      validateList.push(`Duplicate ${unit} entries found for ${pointName}.`)
    })

    return [...new Set(validateList)]
  }
}
