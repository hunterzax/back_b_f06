import {HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common'
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
import {getTodayEndAdd7, getTodayNowAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'
import {QualityEvaluationService} from 'src/quality-evaluation/quality-evaluation.service'
import {SummaryNominationReportService} from 'src/summary-nomination-report/summary-nomination-report.service'
import {QueryShipperNominationFileService} from 'src/query-shipper-nomination-file/query-shipper-nomination-file.service'
import {parseToNumber} from 'src/common/utils/number.util'
import { MinimumInventorySummaryService } from 'src/minimum-inventory-summary/minimum-inventory-summary.service'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

@Injectable()
export class NominationDashboardService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private readonly qualityEvaluationService: QualityEvaluationService,
    private readonly summaryNominationReportService: SummaryNominationReportService,
    private readonly queryShipperNominationFileService: QueryShipperNominationFileService,
    private readonly minimumInventorySummaryService: MinimumInventorySummaryService

    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async findAll(payload: any = null, userId: any) {
    const {gas_day} = payload ?? {}
    const evQueary = {
      gasDay: gas_day
    } //! Hot fix ให้ค่าขึ้น

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const eva = await this.qualityEvaluationService.findAll(evQueary) //! Hot fix ให้ค่าขึ้น
    const nomination_ = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        // NOT: {
        //   contract_code_id: null
        // }, // revers bal ไม่แสดง effect
        query_shipper_nomination_status: {
          id: {
            notIn: [3, 4] // https://app.clickup.com/t/86ev18ayj
          }
        },
        ...(gas_day && {
          gas_day: getTodayNowAdd7(gas_day).toDate()
        }),
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
        reserve_balancing_gas_contract: {
          include: {
            reserve_balancing_gas_contract_comment: true,
            reserve_balancing_gas_contract_detail: {
              include: {
                nomination_point: {
                  include: {
                    area: true,
                    zone: true
                  }
                },
                area: true,
                zone: true
              }
            },
            reserve_balancing_gas_contract_files: true
          }
        },
        group: {
          select: {
            id: true,
            id_name: true,
            name: true
          }
        },
        nomination_version: {
          include: {
            nomination_full_json: true,
            nomination_row_json: true,
            nomination_full_json_sheet2: true
          },
          where: {
            flag_use: true
          }
        },
        contract_code: {
          select: {
            id: true,
            contract_code: true,
            booking_version: {
              include: {
                booking_full_json: true,
                booking_row_json: true
              },
              where: {
                flag_use: true
              }
            }
          }
        },
        nomination_type: true
      },
      orderBy: {
        id: 'desc'
      },
      distinct: ['contract_code_id', 'nomination_type_id']
    })

    const zoneMaster = await this.prisma.zone.findMany({
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
      },
      include: {
        zone_master_quality: true
      }
    })

    const areaMaster = await this.prisma.area.findMany({
      where: {
        // ไม่กรองตามหน้าบ้านใน summary ไม่งั้นเดะไม่เหมือน
        // AND: [
        //   {
        //     start_date: {
        //       lte: todayEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
        //     },
        //   },
        //   {
        //     OR: [
        //       { end_date: null }, // ถ้า end_date เป็น null
        //       { end_date: { gte: todayStart } }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
        //     ],
        //   },
        // ],
      },
      include: {}
    })

    const userType = await this.prisma.user_type.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      }
    })
    let nomination = []
    if (userType?.id === 3) {
      const group_ = await this.prisma.group.findFirst({
        where: {
          user_type_id: userType?.id,
          account_manage: {
            some: {
              account_id: Number(userId)
            }
          }
        },
        select: {
          id: true,
          name: true,
          id_name: true
        }
      })
      nomination = nomination_?.filter((f: any) => f?.group_id === group_?.id)
    } else {
      nomination = nomination_
    }

    const nominationPointData = await this.prisma.nomination_point.findMany({
      include: {
        zone: true,
        area: true
      },
      where: {}
    })

    const summaryNominationReport = await this.summaryNominationReportService.findAll({
      gas_day_text: getTodayNowAdd7(gas_day).format('DD/MM/YYYY')
    })

    const fAreaQuantityD = summaryNominationReport?.area?.daily?.MMBTUD || []
    const fAreaQuantityW = summaryNominationReport?.area?.weekly?.MMBTUD || []

    const dailyNom = nomination.filter((f: any) => {
      return f?.nomination_type_id === 1
    })
    const weeklyNom = nomination.filter((f: any) => {
      return f?.nomination_type_id === 2
    })
    let filDayDFormEva = eva?.newDaily?.filter((f: any) => f?.gasday === dayjs(gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY'))?.filter((f: any) => f?.parameter === 'HV' || f?.parameter === 'WI') || []
    let filDayWFormEva = eva?.newWeekly?.filter((f: any) => f?.gasday === dayjs(gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY'))?.filter((f: any) => f?.parameter === 'HV' || f?.parameter === 'WI') || []

    // ปรับข้อมูล

    const daily = dailyNom.map((e: any) => {
      const {entry_quality, overuse_quantity, over_maximum_hour_capacity_right, ...nE} = e //เอาค่า validate ตอน upload ออก
      return {...nE}
    })
    const weekly = weeklyNom.map((e: any) => {
      const {entry_quality, overuse_quantity, over_maximum_hour_capacity_right, ...nE} = e //เอาค่า validate ตอน upload ออก
      return {...nE}
    })

    // ✔ false
    // ✖ true

    const fnCheckDay = (valValidate: any) => {
      // daily valueBookDay คือค่าจาก Day Capacity Daily Booking (MMBTU/d)
      if (parseToNumber(valValidate?.value) > parseToNumber(valValidate?.valueBookDay)) {
        return true
      }
    }

    const fnCheck = (valValidate: any) => {
      // daily valueBook คือค่าจาก Hour Maximum Hour Booking (MMBTU/h)
      // weekly valueBook คือค่าจาก Day Capacity Daily Booking (MMBTU/d)
      if ((valValidate?.valueBook !== null && valValidate?.valueBook !== "") && (parseToNumber(valValidate?.value) > parseToNumber(valValidate?.valueBook))) {
        return true
      }
    }

    // const fnCheckWiHv = (valValidate: any) => {
    //   if (parseToNumber(valValidate?.value) < parseToNumber(valValidate?.min)) {
    //     return true
    //   } else if (parseToNumber(valValidate?.value) > parseToNumber(valValidate?.max)) {
    //     return true
    //   } else {
    //     return false
    //   }
    // }

    const isFiniteNum = (n: any) => Number.isFinite(n)

    const toNumK = (v: any) => {
      if (typeof v === 'number') return v
      if (v == null) return NaN
      const n = Number(String(v).replace(/,/g, '').trim())
      return n
    }

    const fnCheckWiHv = (valValidate: any): boolean => {
      if (valValidate?.value == '') return false // สตริงติ๊ง ๆ เปล่าไม่ต้องเช็ค

      const v = toNumK(valValidate?.value)
      const min = toNumK(valValidate?.min)
      const max = toNumK(valValidate?.max)

      // ถ้า value ไม่ใช่ตัวเลข → ไม่ flag
      if (!isFiniteNum(v)) return false

      const hasMin = isFiniteNum(min)
      const hasMax = isFiniteNum(max)

      // ถ้าไม่มี min และ max เลย → ไม่เช็ค
      if (!hasMin && !hasMax) return false

      // เช็คตามที่มีอยู่ (exclusive ตามโค้ดเดิม: <min หรือ >max)
      if (hasMin && v < min) return true
      if (hasMax && v > max) return true

      return false
    }

    // คำนวน entry composition และ WI, HV ถ้ามีอันไหนแดง เป็น true เลย
    const fnCheckSheet2 = (valValidate: any, zone: any) => {
      let validate = false
      for (let i = 0; i < valValidate.length; i++) {
        // const find = zoneMaster?.zone_master_quality?.[0]

        // เอา point_name ไปหาก่อนว่าเป็น entry หรือ exit แล้วค่อยเอาไปหาโซน
        const point_name = valValidate[i]?.['1']
        const findPoint = nominationPointData?.find((np: any) => np?.nomination_point == point_name)

        // const findZone = zoneMaster?.filter((f: any) => f?.name === valValidate[i]?.["0"]) // เดิมโรงงาน
        const findZone = zoneMaster?.filter((f: any) => f?.name === valValidate[i]?.['0'] && f?.entry_exit_id === findPoint?.entry_exit_id)

        if (findZone && findZone?.length > 0) {
          for (let iz = 0; iz < findZone.length; iz++) {
            // key 2 'CO2' Carbon - v2_carbon_dioxide_min v2_carbon_dioxide_max
            if (!!valValidate[i]?.['2'] && (findZone?.[iz]?.zone_master_quality?.[0]?.v2_carbon_dioxide_min !== null || findZone?.[iz]?.zone_master_quality?.[0]?.v2_carbon_dioxide_max !== null)) {
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_carbon_dioxide_min !== null && parseToNumber(valValidate[i]?.['2']) < findZone?.[iz]?.zone_master_quality?.[0]?.v2_carbon_dioxide_min) {
                validate = true
                break
              }
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_carbon_dioxide_max !== null && parseToNumber(valValidate[i]?.['2']) > findZone?.[iz]?.zone_master_quality?.[0]?.v2_carbon_dioxide_max) {
                validate = true
                break
              }
            }

            // key 3 'C1' dioxide	Methane - v2_methane_min v2_methane_max
            if (!!valValidate[i]?.['3'] && (findZone?.[iz]?.zone_master_quality?.[0]?.v2_methane_min !== null || findZone?.[iz]?.zone_master_quality?.[0]?.v2_methane_max !== null)) {
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_methane_min !== null && parseToNumber(valValidate[i]?.['3']) < findZone?.[iz]?.zone_master_quality?.[0]?.v2_methane_min) {
                validate = true
                break
              }
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_methane_max !== null && parseToNumber(valValidate[i]?.['3']) > findZone?.[iz]?.zone_master_quality?.[0]?.v2_methane_max) {
                validate = true
                break
              }
            }

            // key 12 'C2+' C2+	- v2_c2_plus_min v2_c2_plus_max
            if (!!valValidate[i]?.['12'] && (findZone?.[iz]?.zone_master_quality?.[0]?.v2_c2_plus_min !== null || findZone?.[iz]?.zone_master_quality?.[0]?.v2_c2_plus_max !== null)) {
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_c2_plus_min !== null && parseToNumber(valValidate[i]?.['12']) < findZone?.[iz]?.zone_master_quality?.[0]?.v2_c2_plus_min) {
                validate = true
                break
              }
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_c2_plus_max !== null && parseToNumber(valValidate[i]?.['12']) > findZone?.[iz]?.zone_master_quality?.[0]?.v2_c2_plus_max) {
                validate = true
                break
              }
            }

            // key 13 'N2' Nitrogen	- v2_nitrogen_min v2_nitrogen_max
            if (!!valValidate[i]?.['13'] && (findZone?.[iz]?.zone_master_quality?.[0]?.v2_nitrogen_min !== null || findZone?.[iz]?.zone_master_quality?.[0]?.v2_nitrogen_max !== null)) {
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_nitrogen_min !== null && parseToNumber(valValidate[i]?.['13']) < findZone?.[iz]?.zone_master_quality?.[0]?.v2_nitrogen_min) {
                validate = true
                break
              }
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_nitrogen_max !== null && parseToNumber(valValidate[i]?.['13']) > findZone?.[iz]?.zone_master_quality?.[0]?.v2_nitrogen_max) {
                validate = true
                break
              }
            }

            // key 14 'O2' Oxgen - v2_oxygen_min v2_oxygen_max
            if (!!valValidate[i]?.['14'] && (findZone?.[iz]?.zone_master_quality?.[0]?.v2_oxygen_min !== null || findZone?.[iz]?.zone_master_quality?.[0]?.v2_oxygen_max !== null)) {
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_oxygen_min !== null && parseToNumber(valValidate[i]?.['14']) < findZone?.[iz]?.zone_master_quality?.[0]?.v2_oxygen_min) {
                validate = true
                break
              }
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_oxygen_max !== null && parseToNumber(valValidate[i]?.['14']) > findZone?.[iz]?.zone_master_quality?.[0]?.v2_oxygen_max) {
                validate = true
                break
              }
            }

            // key 15 'H2S' Hydrogen Sulfide - v2_hydrogen_sulfide_min v2_hydrogen_sulfide_max
            if (!!valValidate[i]?.['15'] && (findZone?.[iz]?.zone_master_quality?.[0]?.v2_hydrogen_sulfide_min !== null || findZone?.[iz]?.zone_master_quality?.[0]?.v2_hydrogen_sulfide_max !== null)) {
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_hydrogen_sulfide_min !== null && parseToNumber(valValidate[i]?.['15']) < findZone?.[iz]?.zone_master_quality?.[0]?.v2_hydrogen_sulfide_min) {
                validate = true
                break
              }
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_hydrogen_sulfide_max !== null && parseToNumber(valValidate[i]?.['15']) > findZone?.[iz]?.zone_master_quality?.[0]?.v2_hydrogen_sulfide_max) {
                validate = true
                break
              }
            }

            // key 16 'S' Total Sulphur - v2_total_sulphur_min v2_total_sulphur_max
            if (!!valValidate[i]?.['16'] && (findZone?.[iz]?.zone_master_quality?.[0]?.v2_total_sulphur_min !== null || findZone?.[iz]?.zone_master_quality?.[0]?.v2_total_sulphur_max !== null)) {
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_total_sulphur_min !== null && parseToNumber(valValidate[i]?.['16']) < findZone?.[iz]?.zone_master_quality?.[0]?.v2_total_sulphur_min) {
                validate = true
                break
              }
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_total_sulphur_max !== null && parseToNumber(valValidate[i]?.['16']) > findZone?.[iz]?.zone_master_quality?.[0]?.v2_total_sulphur_max) {
                validate = true
                break
              }
            }

            // key 17 'Hg' Mercury - v2_mercury_min v2_mercury_max
            if (!!valValidate[i]?.['17'] && (findZone?.[iz]?.zone_master_quality?.[0]?.v2_mercury_min !== null || findZone?.[iz]?.zone_master_quality?.[0]?.v2_mercury_max !== null)) {
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_mercury_min !== null && parseToNumber(valValidate[i]?.['17']) < findZone?.[iz]?.zone_master_quality?.[0]?.v2_mercury_min) {
                validate = true
                break
              }
              if (findZone?.[iz]?.zone_master_quality?.[0]?.v2_mercury_max !== null && parseToNumber(valValidate[i]?.['17']) > findZone?.[iz]?.zone_master_quality?.[0]?.v2_mercury_max) {
                validate = true
                break
              }
            }
          }
        }

        if (validate) {
          break
        }
      }

      return validate
    }

    // ---------- func sum ค่าก่อน validate ----------
    // ---------- ดูว่า zone, are, unit, supply/demand เดียวกันหรือเปล่า
    // const KEY_FIELDS = [0, 1, 2, 3, 6, 9] as const;
    const KEY_FIELDS = [0, 1, 2, 9] as const // key 0 = zone, 1 = supply/demand, 2 = area, 3 = point, 6 = type, 9 = unit
    const HOUR_KEYS = Array.from({length: 24}, (_, i) => 14 + i) // 14..37

    const toStringNoExp = (n: number) => {
      let s = n.toFixed(10)
      s = s.replace(/\.?0+$/, '') // ตัดศูนย์เกิน
      return s === '' ? '0' : s
    }

    const toNumberSafeX = (v: any): number => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'number') return isFinite(v) ? v : 0
      if (typeof v === 'string') {
        const s = v.trim().replace(/,/g, '')
        const n = parseFloat(s)
        return isFinite(n) ? n : 0
      }
      return 0
    }

    const makeGroupKey = (row: any) => KEY_FIELDS.map((idx) => row.newObj?.[idx]?.value ?? '').join('|')

    const sumValidateCutByGroup = (input: any[]): any[] => {
      // 1) รวมยอดต่อกลุ่ม
      const groupSum = new Map<
        string,
        {
          sums: Record<number, number>
        }
      >()

      for (const row of input) {
        const gk = makeGroupKey(row)
        if (!groupSum.has(gk)) {
          const init: Record<number, number> = {}
          HOUR_KEYS.forEach((k) => (init[k] = 0))
          groupSum.set(gk, {
            sums: init
          })
        }
        const bucket = groupSum.get(gk)!
        for (const k of HOUR_KEYS) {
          const cellVal = row.newObj?.[k]?.value
          bucket.sums[k] += toNumberSafeX(cellVal)
        }
      }

      // 2) กระจายผลรวมกลับ “ตำแหน่งเดิม” ของทุกแถวในกลุ่ม
      //    (คงจำนวนแถวและโครงสร้างเดิมไว้)
      return input.map((row) => {
        const gk = makeGroupKey(row)
        const sums = groupSum.get(gk)!.sums

        // clone ตื้น ๆ + clone newObj เฉพาะส่วนที่แก้
        const newRow: any = {
          ...row,
          newObj: {
            ...row.newObj
          }
        }

        for (const k of HOUR_KEYS) {
          const oldCell = row.newObj?.[k] ?? {}
          // คง header/valueBook/valueBookDay/min/max เดิมไว้ เปลี่ยนเฉพาะ value
          newRow.newObj[k] = {
            ...oldCell,
            value: toStringNoExp(sums[k])
          }
        }
        return newRow
      })
    }
    // ---------------------------------------------

    // #region daily
    // daily
    let nDaily = []
    if (daily?.length > 0) {
      for (let i = 0; i < daily.length; i++) {
        // reserve_balancing_gas_contract
        const validate =
          (daily[i]?.contract_code_id &&
            (await this.queryShipperNominationFileService.versionValidate(
              {
                nomination_type_id: 1,
                contract_code_id: daily[i]?.contract_code_id,
                nomination_version_id: daily[i]?.nomination_version?.[0]?.id
              },
              null
            ))) ||
          []

        // เอามาแต่ daily
        // let validateCut = (validate || [])?.filter((f: any) => f?.query_shipper_nomination_type_id === 1)
        const onlyDaily = (validate || [])?.filter((f: any) => f?.query_shipper_nomination_type_id === 1)

        const validateCut = sumValidateCutByGroup(onlyDaily)

        // ส่ง validateCut เข้า validateHByPoint() <-- ฟังก์ชั่นเดียวกับหน้าบ้าน เอาไว้รวม point เดียวกันก่อน

        const validateData = (validateCut || [])?.map((e: any) => e?.newObj)

        const sheet2 = daily[i]?.nomination_version?.[0]?.nomination_full_json_sheet2
        const convertSheet2 = (sheet2 || [])?.length > 0 ? JSON.parse(sheet2?.[0]?.data_temp) : null
        // fnCheckSheet2

        // #region column entry quality
        // DW entry_quality -- sheet 2 nom
        // เทียบกับ zone quality
        // แล้วก็ WI, HV ด้วย ถ้ามันแดง entry_quality ต้องเป็น true <------
        let entry_quality = false
        if (convertSheet2 !== null && (convertSheet2?.valueData || [])?.length > 0) {
          const checkSheet2 = fnCheckSheet2(convertSheet2?.valueData, zoneMaster)

          let checkHvWi = false

          for (let val = 0; val < validateData.length; val++) {
            const HV = fnCheckWiHv(validateData[val]['11'])
            const WI = fnCheckWiHv(validateData[val]['12'])
            if (HV) {
              checkHvWi = true
              break
            }
            if (WI) {
              checkHvWi = true
              break
            }
          }

          // entry_quality = checkSheet2  // เดิมโรงงาน
          entry_quality = !!(checkSheet2 || checkHvWi)
        }

        // #region column overuse quantity
        // DW overuse_quantity
        // ขอเทียบกับ valueBook รายชั่วโมงนะ
        let overuse_quantity = false
        for (let val = 0; val < validateData.length; val++) {
          // // const H1 = fnCheckDay(validateData[val]["14"])
          // const H1 = fnCheck(validateData[val]['14']) 
          // if (H1) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H2 = fnCheckDay(validateData[val]["15"])
          // const H2 = fnCheck(validateData[val]['15'])
          // if (H2) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H3 = fnCheckDay(validateData[val]["16"])
          // const H3 = fnCheck(validateData[val]['16'])
          // if (H3) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H4 = fnCheckDay(validateData[val]["17"])
          // const H4 = fnCheck(validateData[val]['17'])
          // if (H4) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H5 = fnCheckDay(validateData[val]["18"])
          // const H5 = fnCheck(validateData[val]['18'])
          // if (H5) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H6 = fnCheckDay(validateData[val]["19"])
          // const H6 = fnCheck(validateData[val]['19'])
          // if (H6) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H7 = fnCheckDay(validateData[val]["20"])
          // const H7 = fnCheck(validateData[val]['20'])
          // if (H7) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H8 = fnCheckDay(validateData[val]["21"])
          // const H8 = fnCheck(validateData[val]['21'])
          // if (H8) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H9 = fnCheckDay(validateData[val]["22"])
          // const H9 = fnCheck(validateData[val]['22'])
          // if (H9) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H10 = fnCheckDay(validateData[val]["23"])
          // const H10 = fnCheck(validateData[val]['23'])
          // if (H10) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H11 = fnCheckDay(validateData[val]["24"])
          // const H11 = fnCheck(validateData[val]['24'])
          // if (H11) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H12 = fnCheckDay(validateData[val]["25"])
          // const H12 = fnCheck(validateData[val]['25'])
          // if (H12) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H13 = fnCheckDay(validateData[val]["26"])
          // const H13 = fnCheck(validateData[val]['26'])
          // if (H13) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H14 = fnCheckDay(validateData[val]["27"])
          // const H14 = fnCheck(validateData[val]['27'])
          // if (H14) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H15 = fnCheckDay(validateData[val]["28"])
          // const H15 = fnCheck(validateData[val]['28'])
          // if (H15) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H16 = fnCheckDay(validateData[val]["29"])
          // const H16 = fnCheck(validateData[val]['29'])
          // if (H16) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H17 = fnCheckDay(validateData[val]["30"])
          // const H17 = fnCheck(validateData[val]['30'])
          // if (H17) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H18 = fnCheckDay(validateData[val]["31"])
          // const H18 = fnCheck(validateData[val]['31'])
          // if (H18) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H19 = fnCheckDay(validateData[val]["32"])
          // const H19 = fnCheck(validateData[val]['32'])
          // if (H19) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H20 = fnCheckDay(validateData[val]["33"])
          // const H20 = fnCheck(validateData[val]['33'])
          // if (H20) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H21 = fnCheckDay(validateData[val]["34"])
          // const H21 = fnCheck(validateData[val]['34'])
          // if (H21) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H22 = fnCheckDay(validateData[val]["35"])
          // const H22 = fnCheck(validateData[val]['35'])
          // if (H22) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H23 = fnCheckDay(validateData[val]["36"])
          // const H23 = fnCheck(validateData[val]['36'])
          // if (H23) {
          //   overuse_quantity = true
          //   break
          // }
          // // const H24 = fnCheckDay(validateData[val]["37"])
          // const H24 = fnCheck(validateData[val]['37'])
          // if (H24) {
          //   overuse_quantity = true
          //   break
          // }


           const H_sum = (
            parseToNumber(validateData?.[val]?.['14']?.value) +
            parseToNumber(validateData?.[val]?.['15']?.value) +
            parseToNumber(validateData?.[val]?.['16']?.value) +
            parseToNumber(validateData?.[val]?.['17']?.value) +
            parseToNumber(validateData?.[val]?.['18']?.value) +
            parseToNumber(validateData?.[val]?.['19']?.value) +
            parseToNumber(validateData?.[val]?.['20']?.value) +
            parseToNumber(validateData?.[val]?.['21']?.value) +
            parseToNumber(validateData?.[val]?.['22']?.value) +
            parseToNumber(validateData?.[val]?.['23']?.value) +
            parseToNumber(validateData?.[val]?.['24']?.value) +
            parseToNumber(validateData?.[val]?.['25']?.value) +
            parseToNumber(validateData?.[val]?.['26']?.value) +
            parseToNumber(validateData?.[val]?.['27']?.value) +
            parseToNumber(validateData?.[val]?.['28']?.value) +
            parseToNumber(validateData?.[val]?.['29']?.value) +
            parseToNumber(validateData?.[val]?.['30']?.value) +
            parseToNumber(validateData?.[val]?.['31']?.value) +
            parseToNumber(validateData?.[val]?.['32']?.value) +
            parseToNumber(validateData?.[val]?.['33']?.value) +
            parseToNumber(validateData?.[val]?.['34']?.value) +
            parseToNumber(validateData?.[val]?.['35']?.value) +
            parseToNumber(validateData?.[val]?.['36']?.value) +
            parseToNumber(validateData?.[val]?.['37']?.value)
           )
          //  https://app.clickup.com/t/9018502823/86ey4naf1
           const TOTAL_H = H_sum > parseToNumber(validateData?.[val]?.['38']?.valueBookDay)
          //  console.log('validateData?.[val] : ', validateData?.[val]);
          //  console.log('H_sum : ', H_sum);
          //  console.log(`parseToNumber(validateData?.[val]?.['38']?.valueBookDay) : `, parseToNumber(validateData?.[val]?.['38']?.valueBookDay));
          //  console.log('------');
            if (TOTAL_H) {
              overuse_quantity = true
              break
            }

        }

        // #region column over maximum hour
        // D over_maximum_hour_capacity_right H
        let over_maximum_hour_capacity_right = false
        for (let val = 0; val < validateData.length; val++) {
          const H1 = fnCheck(validateData[val]['14'])
          if (H1) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H2 = fnCheck(validateData[val]['15'])
          if (H2) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H3 = fnCheck(validateData[val]['16'])
          if (H3) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H4 = fnCheck(validateData[val]['17'])
          if (H4) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H5 = fnCheck(validateData[val]['18'])
          if (H5) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H6 = fnCheck(validateData[val]['19'])
          if (H6) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H7 = fnCheck(validateData[val]['20'])
          if (H7) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H8 = fnCheck(validateData[val]['21'])
          if (H8) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H9 = fnCheck(validateData[val]['22'])
          if (H9) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H10 = fnCheck(validateData[val]['23'])
          if (H10) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H11 = fnCheck(validateData[val]['24'])
          if (H11) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H12 = fnCheck(validateData[val]['25'])
          if (H12) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H13 = fnCheck(validateData[val]['26'])
          if (H13) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H14 = fnCheck(validateData[val]['27'])
          if (H14) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H15 = fnCheck(validateData[val]['28'])
          if (H15) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H16 = fnCheck(validateData[val]['29'])
          if (H16) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H17 = fnCheck(validateData[val]['30'])
          if (H17) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H18 = fnCheck(validateData[val]['31'])
          if (H18) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H19 = fnCheck(validateData[val]['32'])
          if (H19) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H20 = fnCheck(validateData[val]['33'])
          if (H20) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H21 = fnCheck(validateData[val]['34'])
          if (H21) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H22 = fnCheck(validateData[val]['35'])
          if (H22) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H23 = fnCheck(validateData[val]['36'])
          if (H23) {
            over_maximum_hour_capacity_right = true
            break
          }
          const H24 = fnCheck(validateData[val]['37'])
          if (H24) {
            over_maximum_hour_capacity_right = true
            break
          }
        }

        nDaily?.push({
          ...daily[i],
          entry_quality: entry_quality,
          overuse_quantity: overuse_quantity,
          over_maximum_hour_capacity_right: over_maximum_hour_capacity_right
        })
      }
    }

    // #region weekly
    let nWeekly = []
    if (weekly?.length > 0) {
      for (let i = 0; i < weekly.length; i++) {
        const validate =
          (weekly[i]?.contract_code_id &&
            (await this.queryShipperNominationFileService.versionValidate(
              {
                nomination_type_id: 2,
                contract_code_id: weekly[i]?.contract_code_id,
                nomination_version_id: weekly[i]?.nomination_version?.[0]?.id
              },
              null
            ))) ||
          []
        const validateCut = (validate || [])?.filter((f: any) => f?.query_shipper_nomination_type_id === 1)
        const validateData = (validateCut || [])?.map((e: any) => e?.newObj)
        const sheet2 = weekly[i]?.nomination_version?.[0]?.nomination_full_json_sheet2
        const convertSheet2 = (sheet2 || [])?.length > 0 ? JSON.parse(sheet2?.[0]?.data_temp) : null

        // #region column entry quality
        // DW entry_quality
        // -- sheet 2 nom
        let entry_quality = false
        if (convertSheet2 !== null && (convertSheet2?.valueData || [])?.length > 0) {
          const checkSheet2 = fnCheckSheet2(convertSheet2?.valueData, zoneMaster)
          let checkHvWi = false

          for (let val = 0; val < validateData.length; val++) {
            const HV = fnCheckWiHv(validateData[val]['11'])
            const WI = fnCheckWiHv(validateData[val]['12'])
            if (HV) {
              checkHvWi = true
              break
            }
            if (WI) {
              checkHvWi = true
              break
            }
          }

          // entry_quality = checkSheet2  // เดิมโรงงาน
          entry_quality = !!(checkSheet2 || checkHvWi)
        }

        // #region column overuse quantity
        // DW overuse_quantity Day
        let overuse_quantity = false
        for (let val = 0; val < validateData.length; val++) {
          const sunday = fnCheck(validateData[val]['14'])
          if (sunday) {
            overuse_quantity = true
            break
          }
          const monday = fnCheck(validateData[val]['15'])
          if (monday) {
            overuse_quantity = true
            break
          }
          const tuesday = fnCheck(validateData[val]['16'])
          if (tuesday) {
            overuse_quantity = true
            break
          }
          const wednesday = fnCheck(validateData[val]['17'])
          if (wednesday) {
            overuse_quantity = true
            break
          }
          const thursday = fnCheck(validateData[val]['18'])
          if (thursday) {
            overuse_quantity = true
            break
          }
          const friday = fnCheck(validateData[val]['19'])
          if (friday) {
            overuse_quantity = true
            break
          }
          const saturday = fnCheck(validateData[val]['20'])
          if (saturday) {
            overuse_quantity = true
            break
          }
        }

        nWeekly?.push({
          ...weekly[i],
          entry_quality: entry_quality,
          overuse_quantity: overuse_quantity
        })
      }
    }

    // system
    // system - mix quality HV WI
    let sysDaily = false
    for (let i = 0; i < filDayDFormEva.length; i++) {
      // https://app.clickup.com/t/9018502823/86euzxxt1
      const v2_sat_heating_value_min = filDayDFormEva[i]?.zoneExit?.zone_master_quality?.[0]?.v2_sat_heating_value_min;
      const v2_sat_heating_value_max = filDayDFormEva[i]?.zoneExit?.zone_master_quality?.[0]?.v2_sat_heating_value_max;
      const v2_wobbe_index_min = filDayDFormEva[i]?.zoneExit?.zone_master_quality?.[0]?.v2_wobbe_index_min;
      const v2_wobbe_index_max = filDayDFormEva[i]?.zoneExit?.zone_master_quality?.[0]?.v2_wobbe_index_max;
      const valueBtuScf = filDayDFormEva[i]?.valueBtuScf;

      if (!!valueBtuScf || valueBtuScf === 0) {
        if (filDayDFormEva[i]?.parameter === 'HV') {
          if ((valueBtuScf < v2_sat_heating_value_min && v2_sat_heating_value_min !== null) || (valueBtuScf > v2_sat_heating_value_max && v2_sat_heating_value_max !== null)) {
            sysDaily = true
          }
        } else if (filDayDFormEva[i]?.parameter === 'WI') {
          if ((valueBtuScf < v2_wobbe_index_min && v2_wobbe_index_min !== null) || (valueBtuScf > v2_wobbe_index_max && v2_wobbe_index_max !== null)) {
            sysDaily = true
          }
        }
      }
    }

    let sysWeekly = false
    for (let i = 0; i < filDayWFormEva.length; i++) {
      // https://app.clickup.com/t/9018502823/86euzxxt1
      const v2_sat_heating_value_min = filDayWFormEva[i]?.zoneExit?.zone_master_quality?.[0]?.v2_sat_heating_value_min;
      const v2_sat_heating_value_max = filDayWFormEva[i]?.zoneExit?.zone_master_quality?.[0]?.v2_sat_heating_value_max;
      const v2_wobbe_index_min = filDayWFormEva[i]?.zoneExit?.zone_master_quality?.[0]?.v2_wobbe_index_min;
      const v2_wobbe_index_max = filDayWFormEva[i]?.zoneExit?.zone_master_quality?.[0]?.v2_wobbe_index_max;

      if (!!filDayWFormEva[i]?.sunday?.value || filDayWFormEva[i]?.sunday?.value === 0) {
        if (filDayWFormEva[i]?.parameter === 'HV') {
          if ((filDayWFormEva[i]?.sunday?.value < v2_sat_heating_value_min && v2_sat_heating_value_min !== null) || (filDayWFormEva[i]?.sunday?.value > v2_sat_heating_value_max && v2_sat_heating_value_max !== null)) {
            sysWeekly = true
          }
        } else if (filDayWFormEva[i]?.parameter === 'WI') {
          if ((filDayWFormEva[i]?.sunday?.value < v2_wobbe_index_min && v2_wobbe_index_min !== null) || (filDayWFormEva[i]?.sunday?.value > v2_wobbe_index_max && v2_wobbe_index_max !== null)) {
            sysWeekly = true
          }
        }
      }
    }

    // system - quantity
    let sysQuantityD = false
    fAreaQuantityD?.map((e: any) => {
      const find_validate = areaMaster?.find((f: any) => f?.name === e?.area_text)

      let total_cap_validate = find_validate?.area_nominal_capacity < e?.totalCap
      let h1_validate = find_validate?.area_nominal_capacity < e?.H1
      let h2_validate = find_validate?.area_nominal_capacity < e?.H2
      let h3_validate = find_validate?.area_nominal_capacity < e?.H3
      let h4_validate = find_validate?.area_nominal_capacity < e?.H4
      let h5_validate = find_validate?.area_nominal_capacity < e?.H5
      let h6_validate = find_validate?.area_nominal_capacity < e?.H6
      let h7_validate = find_validate?.area_nominal_capacity < e?.H7
      let h8_validate = find_validate?.area_nominal_capacity < e?.H8
      let h9_validate = find_validate?.area_nominal_capacity < e?.H9
      let h10_validate = find_validate?.area_nominal_capacity < e?.H10
      let h11_validate = find_validate?.area_nominal_capacity < e?.H11
      let h12_validate = find_validate?.area_nominal_capacity < e?.H12
      let h13_validate = find_validate?.area_nominal_capacity < e?.H13
      let h14_validate = find_validate?.area_nominal_capacity < e?.H14
      let h15_validate = find_validate?.area_nominal_capacity < e?.H15
      let h16_validate = find_validate?.area_nominal_capacity < e?.H16
      let h17_validate = find_validate?.area_nominal_capacity < e?.H17
      let h18_validate = find_validate?.area_nominal_capacity < e?.H18
      let h19_validate = find_validate?.area_nominal_capacity < e?.H19
      let h20_validate = find_validate?.area_nominal_capacity < e?.H20
      let h21_validate = find_validate?.area_nominal_capacity < e?.H21
      let h22_validate = find_validate?.area_nominal_capacity < e?.H22
      let h23_validate = find_validate?.area_nominal_capacity < e?.H23
      let h24_validate = find_validate?.area_nominal_capacity < e?.H24
      if (
        total_cap_validate ||
        h1_validate ||
        h2_validate ||
        h3_validate ||
        h4_validate ||
        h5_validate ||
        h6_validate ||
        h7_validate ||
        h8_validate ||
        h9_validate ||
        h10_validate ||
        h11_validate ||
        h12_validate ||
        h13_validate ||
        h14_validate ||
        h15_validate ||
        h16_validate ||
        h17_validate ||
        h18_validate ||
        h19_validate ||
        h20_validate ||
        h21_validate ||
        h22_validate ||
        h23_validate ||
        h24_validate
      ) {
        sysQuantityD = true
      }
      return e
    })

    let sysQuantityW = false
    fAreaQuantityW?.map((e: any) => {
      const find_validate = areaMaster?.find((f: any) => f?.name === e?.area_text)
      let total_cap_validate = find_validate?.area_nominal_capacity < e?.totalCap
      let sunday_validate = find_validate?.area_nominal_capacity < e?.sunday
      let monday_validate = find_validate?.area_nominal_capacity < e?.monday
      let tuesday_validate = find_validate?.area_nominal_capacity < e?.tuesday
      let wednesday_validate = find_validate?.area_nominal_capacity < e?.wednesday
      let thursday_validate = find_validate?.area_nominal_capacity < e?.thursday
      let friday_validate = find_validate?.area_nominal_capacity < e?.friday
      let saturday_validate = find_validate?.area_nominal_capacity < e?.saturday

      if (total_cap_validate || sunday_validate || monday_validate || tuesday_validate || wednesday_validate || thursday_validate || friday_validate || saturday_validate) {
        sysQuantityW = true
      }

      return e
    })

    // system - Min Inven
    const minData = await this.minimumInventorySummaryService.findAll(
      {gas_day},
      userId
    )
    const minDataD = minData?.flatMap((fM:any) => {
      const groupedByDaily = (fM?.groupedByDaily || [])?.flatMap((nFm:any) => {
        return (nFm?.data || [])
      })
      return groupedByDaily
    })
    const Min_Inventory_ChangeD = (minDataD || [])?.filter((f:any) => f?.type === "Min_Inventory_Change")?.map((e:any) => e?.value)?.reduce(
      (accumulator, currentValue) => accumulator + (currentValue || 0),
      0,
    );
    const Exchange_Min_InventoryD = (minDataD || [])?.filter((f:any) => f?.type === "Exchange_Min_Inventory")?.map((e:any) => e?.value)?.reduce(
      (accumulator, currentValue) => accumulator + (currentValue || 0),
      0,
    );
    let sysMinInvenD = (Min_Inventory_ChangeD !== 0 || Exchange_Min_InventoryD !== 0 || ((Min_Inventory_ChangeD + Exchange_Min_InventoryD) !== 0)) ? true : false

    const minDataW = minData?.flatMap((fM:any) => {
      const groupedByWeekly = (fM?.groupedByWeekly || [])?.flatMap((nFm:any) => {
        return (nFm?.data || [])
      })
      return groupedByWeekly
    })
    const groupByNomType = (data: any[]) => {
      return data.reduce((acc: any, item: any) => {
        const key = item.nomType || 'unknown';

        if (!acc[key]) {
          acc[key] = [];
        }

        acc[key].push(item);

        return acc;
      }, {});
    };
    const minDataWGroup = groupByNomType(minDataW);
    let sysMinInvenW = false
    Object.keys(minDataWGroup).forEach((day) => {
      const items = minDataWGroup[day];

      const Min_Inventory_ChangeW = (items || [])?.filter((f:any) => f?.type === "Min_Inventory_Change")?.map((e:any) => e?.value)?.reduce(
        (accumulator, currentValue) => accumulator + (currentValue || 0),
        0,
      );
      const Exchange_Min_InventoryW = (items || [])?.filter((f:any) => f?.type === "Exchange_Min_Inventory")?.map((e:any) => e?.value)?.reduce(
        (accumulator, currentValue) => accumulator + (currentValue || 0),
        0,
      );
      if((Min_Inventory_ChangeW !== 0 || Exchange_Min_InventoryW !== 0 || ((Min_Inventory_ChangeW + Exchange_Min_InventoryW) !== 0))){
        sysMinInvenW = true
      }

    });

    const resultData = {
      // note:"true คือเกินให้ ✖ นอกนั้น ✔",
      data: {
        daily: {
          table: nDaily,
          system: {
            mixQuality: sysDaily,
            quality: sysQuantityD,
            mixInven: sysMinInvenD
          },
          checkNom: dailyNom?.length
        },
        weekly: {
          table: nWeekly,
          system: {
            mixQuality: sysWeekly,
            quality: sysQuantityW,
            mixInven: sysMinInvenW
          },
          checkNom: weeklyNom?.length
        }
      }
    }
    // console.log('resultData : ', resultData);
    return resultData
  }
}
