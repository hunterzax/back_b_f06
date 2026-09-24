import {forwardRef, HttpException, HttpStatus, Inject, Injectable, Logger} from '@nestjs/common'
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
import {CapacityService} from 'src/capacity/capacity.service'
import {UploadTemplateForShipperService} from 'src/upload-template-for-shipper/upload-template-for-shipper.service'
import {AstosService} from 'src/astos/astos.service'
import {MeteredMicroService} from 'src/grpc/metered-service.service'
import {getTodayEndAdd7, getTodayNow, getTodayStartAdd7} from 'src/common/utils/date.util'
import {buildActiveDataForDates, isMatch} from 'src/common/utils/allocation.util'
import {divideTo8Decimal, parseToNumber, parseToNumber3Decimal, parseToNumber4Decimal, parseToNumber8Decimal} from 'src/common/utils/number.util'
import {Prisma, zone, group, contract_code} from '@prisma/client'
import {areaPopulate, areaWithRelations, meteringPointPopulate, meteringPointWithRelations} from '@type/prisma.type'

import {Mutex} from 'async-mutex'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

@Injectable()
export class QualityPlanningService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly meteredMicroService: MeteredMicroService,
    @Inject(forwardRef(() => AstosService))
    private readonly astosService: AstosService
  ) {}

  private readonly logger = new Logger(QualityPlanningService.name)
  private readonly mutex = new Mutex()

  async findAllNoIntar(gasDay?: any, resData_?: any) {
    const {nDay, activeData, daySet, newDaily, newWeekly, meterData} = await this.fnMiddleMain(gasDay, resData_)

    return {
      newDaily,
      newWeekly
    }
  }

  async findAllNoIntarWait(gasDay?: any, resData_?: any) {
    const {nDay, activeData, daySet, newDaily, newWeekly, meterData} = await this.fnMiddleMainWait(gasDay, resData_)

    return {
      newDaily,
      newWeekly
    }
  }

  formatClean(x: number, maxDp = 3): string {
    if (x == null || Number.isNaN(Number(x))) return ''
    return Number(x)
      .toFixed(maxDp)
      .replace(/\.?0+$/, '') // ตัด 0 ท้าย + จุดทศนิยมถ้าไม่เหลือ
  }

  // ถ้าอยากได้เป็น number (ไม่ใช่ string)
  normalizeNumber(x: number, maxDp = 3): number {
    const s = this.formatClean(x, maxDp)
    return s === '' ? NaN : Number(s)
  }

  async findAll(payload?: any) {
    this.logger.log(`findAll called | locked=${this.mutex.isLocked()}`)

    return this.mutex.runExclusive(async () => {
      this.logger.log(`findAll start`)
      try {
        return await this.processFindAll(payload)
      } catch (error) {
        this.logger.error('findAll error', error?.stack || error)
        throw error
      } finally {
        this.logger.log(`findAll end`)
      }
    })
  }

  // ...
  async processFindAll(query?: {gasDay?: string; tab?: string}) {
    let intraday = []
    let daily = []
    let weekly = []
    if (query?.tab === '0') {
      // intraday = await this.intraday2(query?.gasDay)
      intraday = await this.intraday3(query?.gasDay)
    } else {
      const {nDay, activeData, daySet, newDaily, newWeekly, meterData} = await this.fnMiddleMain(query?.gasDay)
      daily = newDaily
      weekly = newWeekly
    }

    // const intraday = await this.fnMiddleIntra(
    //   nDay,
    //   activeData,
    //   daySet,
    //   newDaily,
    //   newWeekly,
    //   meterData,
    // )

    return {
      intraday,
      newDaily: daily,
      newWeekly: weekly
    }
  }

  fn_calc_vi_all = (nomArr_: any, day_: any) => {
    const _calc_vi_all =
      nomArr_?.reduce((accIn, currIn) => {
        let resultIn = 0
        if (currIn?.nomination_type_id === 1) {
          // day
          resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[day_] ?? 0)
        }
        return accIn + resultIn
      }, 0) ?? 0
    return _calc_vi_all
  }

  fn_calc_hv_x_vi_all = (nomArr_: any, day_: any) => {
    const _calc_hv_x_vi_all =
      nomArr_?.reduce((accIn, currIn) => {
        let resultIn = 0
        let hv_ = 0
        let vi_ = 0
        hv_ = parseToNumber3Decimal(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
        if (currIn?.nomination_type_id === 1) {
          // day
          vi_ = parseToNumber3Decimal(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          vi_ = parseToNumber3Decimal(currIn?.nomination_row_json?.data_temp[day_] ?? 0)
        }
        if (hv_ === 0 && vi_ === 0) {
          resultIn = 0
        } else {
          resultIn = hv_ * vi_
        }
        return accIn + resultIn
      }, 0) ?? 0
    return _calc_hv_x_vi_all
  }

  fn_calc_sg_x_vi_all = (nomArr_: any, day_: any) => {
    const _calc_sg_x_vi_all =
      nomArr_?.reduce((accIn, currIn) => {
        let resultIn = 0
        let vi_ = 0
        let sg_ = 0
        sg_ = parseToNumber4Decimal(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
        if (currIn?.nomination_type_id === 1) {
          // day
          vi_ = parseToNumber3Decimal(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          vi_ = parseToNumber3Decimal(currIn?.nomination_row_json?.data_temp[day_] ?? 0)
        }
        if (sg_ === 0 && vi_ === 0) {
          resultIn = 0
        } else {
          resultIn = sg_ * vi_
        }
        return accIn + resultIn
      }, 0) ?? 0
    return _calc_sg_x_vi_all
  }

  fn_hv = (nomArr_: any, day_: any) => {
    const hv_ = this.fn_calc_vi_all(nomArr_, day_) === 0 && this.fn_calc_hv_x_vi_all(nomArr_, day_) === 0 ? 0 : this.normalizeNumber(this.fn_calc_hv_x_vi_all(nomArr_, day_) / this.fn_calc_vi_all(nomArr_, day_))
    return hv_
  }

  fn_sg = (nomArr_: any, day_: any) => {
    const sg_ = this.fn_calc_vi_all(nomArr_, day_) === 0 && this.fn_calc_sg_x_vi_all(nomArr_, day_) === 0 ? 0 : this.normalizeNumber(this.fn_calc_sg_x_vi_all(nomArr_, day_) / this.fn_calc_vi_all(nomArr_, day_), 4)
    return sg_
  }

  fn_wi = (nomArr_: any, day_: any) => {
    const wi_ = this.fn_calc_hv_x_vi_all(nomArr_, day_) / 0.982596 / Math.sqrt(this.fn_calc_sg_x_vi_all(nomArr_, day_) * this.fn_calc_vi_all(nomArr_, day_))
    return wi_
  }

  async findAllChunked(andInWhere: any, include: any, batch_ = 50) {
    const batchSize = batch_ // ลอง 20, 50, 100
    let cursorId: number | null = null
    let hasMore = true

    const finalResults: any[] = []

    while (hasMore) {
      // 1) ดึงเฉพาะ id ก่อน
      const idsBatch = await this.prisma.query_shipper_nomination_file.findMany({
        where: andInWhere,
        select: {
          id: true
        },
        orderBy: {
          id: 'desc'
        },
        take: batchSize,
        ...(cursorId
          ? {
              cursor: {
                id: cursorId
              },
              skip: 1
            }
          : {})
      })

      if (idsBatch.length === 0) {
        hasMore = false
        break
      }

      const ids = idsBatch.map((i) => i.id)

      // 2) ดึงข้อมูลเต็มของ batch นี้
      const rows = await this.prisma.query_shipper_nomination_file.findMany({
        where: {
          id: {in: ids}
        },
        include: include,
        orderBy: {
          id: 'desc'
        }
      })

      // 3) รักษาลำดับให้ตรงกับ idsBatch
      const rowsMap = new Map(rows.map((r) => [r.id, r]))
      const orderedRows = ids.map((id) => rowsMap.get(id)).filter(Boolean)

      finalResults.push(...orderedRows)

      // 4) cursor ไปต่อ
      cursorId = idsBatch[idsBatch.length - 1].id

      if (idsBatch.length < batchSize) {
        hasMore = false
      }
    }

    return finalResults
  }

  // ...
  async fnMiddleMain(gasDay?: any, resData_?: any) {
    // https://app.clickup.com/t/86etuazuc
    // https://app.clickup.com/t/86etub4u6
    // gasDay

    const andInWhere = {
      NOT: {
        contract_code_id: null
      }, // revers bal ไม่แสดง effect
      query_shipper_nomination_status: {
        id: {
          in: [2, 5]
        }
      },

      AND: [
        {
          OR: [{del_flag: false}, {del_flag: null}]
        }
      ],
      ...(gasDay
        ? {
            OR: [
              // 1) gas_day เท่ากับวันเป้าหมาย
              {
                gas_day: {
                  equals: getTodayStartAdd7(gasDay).toDate()
                }
              },

              // 2) gas_day เท่ากับวันอาทิตย์ของสัปดาห์นั้น และ nomination_type_id = 2
              {
                AND: [
                  {
                    gas_day: {
                      equals: dayjs(gasDay).subtract(dayjs(gasDay).day(), 'day').toDate()
                    }
                  },
                  {
                    nomination_type_id: 2
                  }
                ]
              }
            ]
          }
        : {})
    }
    const resData = resData_
      ? resData_
      : await this.findAllChunked(andInWhere, {
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
          contract_code: true,
          nomination_version: {
            where: {
              flag_use: true
            },
            include: {
              nomination_full_json: true,
              nomination_row_json: true
            }
          }
        })

    // const resData = resData_ ? resData_ : await this.prisma.query_shipper_nomination_file.findMany({
    //   where: andInWhere,
    //   include: {
    //     reserve_balancing_gas_contract: {
    //       include:{
    //         reserve_balancing_gas_contract_comment:true,
    //         reserve_balancing_gas_contract_detail:{
    //           include:{
    //             nomination_point:{
    //               include:{
    //                 area:true,
    //                 zone:true,
    //               },
    //             },
    //             area:true,
    //             zone:true,
    //           },
    //         },
    //         reserve_balancing_gas_contract_files:true,
    //       },
    //     },
    //     contract_code:true,
    //     nomination_version: {
    //       where: {
    //         flag_use: true,
    //       },
    //       include: {
    //         nomination_full_json: true,
    //         nomination_row_json: true,
    //       },
    //     },
    //   },
    //   orderBy: {
    //     id: 'desc',
    //   },
    // });
    // query_shipper_nomination_type_id 1
    let dailyData = []

    const resDataCv = resData.map((e: any) => {
      const nomination_version = e['nomination_version'].map((nv: any) => {
        const nomination_full_json = nv['nomination_full_json'].map((nfj: any) => {
          nfj['data_temp'] = JSON.parse(nfj['data_temp'])
          return {
            ...nfj
          }
        })
        const nomination_row_json = nv['nomination_row_json'].map((nfj: any) => {
          nfj['data_temp'] = JSON.parse(nfj['data_temp'])
          return {
            ...nfj
          }
        })
        const nomination_row_json_use = nomination_row_json.filter((f: any) => {
          return f?.query_shipper_nomination_type_id === 1 && f?.data_temp['9'] === 'MMSCFD'
        })

        if (nomination_row_json_use.length > 0) {
          nomination_row_json_use.map((nx: any) => {
            dailyData.push({
              nomination_type_id: e?.nomination_type_id,
              nomination_code: e?.nomination_code,
              gas_day: e?.gas_day,
              gas_day_text: dayjs(e?.gas_day).format('DD/MM/YYYY'),
              contract_code_id: e?.contract_code_id,
              group_id: e?.group_id,
              query_shipper_nomination_file_renom_id: e?.query_shipper_nomination_file_renom_id,
              submitted_timestamp: e?.submitted_timestamp,
              nomination_full_json: nomination_full_json[0],
              nomination_row_json: nx
            })

            return nx
          })
        }

        return {
          ...nv,
          nomination_full_json,
          nomination_row_json_use
        }
      })

      return {
        ...e,
        nomination_version
      }
    })

    const dailyArr = dailyData.filter((f: any) => {
      return f?.nomination_type_id === 1
    })
    const weeklyArr = dailyData.filter((f: any) => {
      return f?.nomination_type_id === 2
    })
    const areaGroup = [...new Set(dailyArr.map((gr: any) => gr?.nomination_row_json?.area_text))]
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const areaData = await this.prisma.area.findMany({
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
      include: {}
    })
    const zoneData = await this.prisma.zone.findMany({
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
    const meterData = await this.prisma.metering_point.findMany({
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
        zone: true,
        area: true
      }
    })
    const contractCodeData = await this.prisma.contract_code.findMany({})

    const gasdayArrDaily = [...new Set(dailyArr.map((es: any) => es?.gas_day_text))]
    const newDaily = gasdayArrDaily.flatMap((e: any) => {
      const fil = dailyArr.filter((f: any) => f?.gas_day_text === e)
      const areaGroupF = [...new Set(fil.map((gr: any) => gr?.nomination_row_json?.area_text))]

      const areaAll = areaGroupF.flatMap((es: any, ies: any, aes: any) => {
        const filAreaGF = fil.filter((fGf: any) => {
          return fGf?.nomination_row_json?.area_text === es
        })

        const zoneTextObj = zoneData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.zone_text && (f?.entry_exit_id === 1 ? 'Entry' : 'Exit') === filAreaGF[0]?.nomination_row_json?.data_temp['10']) || null
        const zoneTextObjExit = zoneData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.zone_text && (f?.entry_exit_id === 2)) || null
        
        const areaTextObj = areaData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.area_text && (f?.entry_exit_id === 1 ? 'Entry' : 'Exit') === filAreaGF[0]?.nomination_row_json?.data_temp['10']) || null
        const gasDayText = filAreaGF[0]?.gas_day_text || null
        const contractCodeId = contractCodeData.find((f: any) => f?.id === filAreaGF[0]?.contract_code_id) || null

        const hv = this.fn_hv(filAreaGF, null)
        const sg = this.fn_sg(filAreaGF, null)
        const wi = this.fn_wi(filAreaGF, null)

        return [
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'HV',
            valueBtuScf: hv,
            contractCodeId
          },
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'WI',
            valueBtuScf: wi,
            contractCodeId
          },
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'SG',
            valueBtuScf: sg,
            contractCodeId
          }
        ]
      })

      return [...areaAll]
    })

    const gasdayArrWeekly = [...new Set(weeklyArr.map((es: any) => es?.gas_day_text))]

    // New!
    const newWeekly = gasdayArrWeekly.flatMap((e: any) => {
      const fil = weeklyArr.filter((f: any) => f?.gas_day_text === e)

      const areaGroupF = [...new Set(fil.map((gr: any) => gr?.nomination_row_json?.area_text))]
      const areaAll = areaGroupF.flatMap((es: any, ies: any, aes: any) => {
        const filAreaGF = fil.filter((fGf: any) => {
          return fGf?.nomination_row_json?.area_text === es
        })

        // excel  wi 11 hv 12 sg 13
        // const gasDayText = filAreaGF[0]?.gas_day_text || null; // fix ได้ เพราะ weekly วันเริ่มอาทิตจะตรงกัน
        const gasDayText = e

        const hv1 = this.fn_hv(filAreaGF, 14)
        const sg1 = this.fn_sg(filAreaGF, 14)
        const wi1 = this.fn_wi(filAreaGF, 14)
        // ---------
        const hv2 = this.fn_hv(filAreaGF, 15)
        const sg2 = this.fn_sg(filAreaGF, 15)
        const wi2 = this.fn_wi(filAreaGF, 15)
        // ---------
        const hv3 = this.fn_hv(filAreaGF, 16)
        const sg3 = this.fn_sg(filAreaGF, 16)
        const wi3 = this.fn_wi(filAreaGF, 16)
        // ---------
        const hv4 = this.fn_hv(filAreaGF, 17)
        const sg4 = this.fn_sg(filAreaGF, 17)
        const wi4 = this.fn_wi(filAreaGF, 17)
        // ---------
        const hv5 = this.fn_hv(filAreaGF, 18)
        const sg5 = this.fn_sg(filAreaGF, 18)
        const wi5 = this.fn_wi(filAreaGF, 18)
        // ---------
        const hv6 = this.fn_hv(filAreaGF, 19)
        const sg6 = this.fn_sg(filAreaGF, 19)
        const wi6 = this.fn_wi(filAreaGF, 19)
        // ---------
        const hv7 = this.fn_hv(filAreaGF, 20)
        const sg7 = this.fn_sg(filAreaGF, 20)
        const wi7 = this.fn_wi(filAreaGF, 20)
        // ---------

        // ---------
        const zoneTextObj = zoneData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.zone_text && (f?.entry_exit_id === 1 ? 'Entry' : 'Exit') === filAreaGF[0]?.nomination_row_json?.data_temp['10']) || null
        const zoneTextObjExit = zoneData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.zone_text && (f?.entry_exit_id === 2)) || null

        const areaTextObj = areaData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.area_text && (f?.entry_exit_id === 1 ? 'Entry' : 'Exit') === filAreaGF[0]?.nomination_row_json?.data_temp['10']) || null

        const contractCodeId = contractCodeData.find((f: any) => f?.id === filAreaGF[0]?.contract_code_id) || null

        const sunday = dayjs(e, 'DD/MM/YYYY').add(0, 'day').format('DD/MM/YYYY')
        const monday = dayjs(e, 'DD/MM/YYYY').add(1, 'day').format('DD/MM/YYYY')
        const tuesday = dayjs(e, 'DD/MM/YYYY').add(2, 'day').format('DD/MM/YYYY')
        const wednesday = dayjs(e, 'DD/MM/YYYY').add(3, 'day').format('DD/MM/YYYY')
        const thursday = dayjs(e, 'DD/MM/YYYY').add(4, 'day').format('DD/MM/YYYY')
        const friday = dayjs(e, 'DD/MM/YYYY').add(5, 'day').format('DD/MM/YYYY')
        const saturday = dayjs(e, 'DD/MM/YYYY').add(7, 'day').format('DD/MM/YYYY')
        // ---------

        return [
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'HV',
            contractCodeId,
            sunday: {
              date: sunday,
              value: hv1
            },
            monday: {
              date: monday,
              value: hv2
            },
            tuesday: {
              date: tuesday,
              value: hv3
            },
            wednesday: {
              date: wednesday,
              value: hv4
            },
            thursday: {
              date: thursday,
              value: hv5
            },
            friday: {
              date: friday,
              value: hv6
            },
            saturday: {
              date: saturday,
              value: hv7
            }
          },
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'WI',
            contractCodeId,
            sunday: {
              date: sunday,
              value: wi1
            },
            monday: {
              date: monday,
              value: wi2
            },
            tuesday: {
              date: tuesday,
              value: wi3
            },
            wednesday: {
              date: wednesday,
              value: wi4
            },
            thursday: {
              date: thursday,
              value: wi5
            },
            friday: {
              date: friday,
              value: wi6
            },
            saturday: {
              date: saturday,
              value: wi7
            }
          },
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'SG',
            contractCodeId,
            sunday: {
              date: sunday,
              value: sg1
            },
            monday: {
              date: monday,
              value: sg2
            },
            tuesday: {
              date: tuesday,
              value: sg3
            },
            wednesday: {
              date: wednesday,
              value: sg4
            },
            thursday: {
              date: thursday,
              value: sg5
            },
            friday: {
              date: friday,
              value: sg6
            },
            saturday: {
              date: saturday,
              value: sg7
            }
          }
        ]
      })

      return [...areaAll]
    })

    const day = (newDaily.length > 0 ? newDaily : newWeekly.length > 0 ? newWeekly : []).map((e: any) => e?.gasday)
    const daySet = [...new Set(day)].map((e: any) => dayjs(e, 'DD/MM/YYYY').format('YYYY-MM-DD'))
    const findMinMaxDate = (dateArray) => {
      if (!dateArray || dateArray.length === 0) {
        return {
          minDate: null,
          maxDate: null
        }
      }

      let minDate = dateArray[0]
      let maxDate = dateArray[0]

      for (const dateStr of dateArray) {
        if (dateStr < minDate) {
          minDate = dateStr
        }
        if (dateStr > maxDate) {
          maxDate = dateStr
        }
      }

      return {
        minDate,
        maxDate
      }
    }

    const nDay = findMinMaxDate(daySet)

    // Extract gas days and generate date array
    const getMeterFrom = getTodayNow(nDay?.minDate)
    const getMeterTo = getTodayNow(nDay?.maxDate)
    const dateArray: string[] = []
    // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
    let current = getMeterFrom.clone()
    while (current.isSameOrBefore(getMeterTo, 'day')) {
      dateArray.push(current.format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }
    // Build active data for all dates
    const activeData = await buildActiveDataForDates(dateArray, this.prisma)

    return {
      nDay,
      activeData,
      daySet,
      newDaily,
      newWeekly,
      meterData
    }
  }

  // https://app.clickup.com/t/86etzcgv1
  async fnMiddleMainWait(gasDay?: any, resData_?: any) {
    // https://app.clickup.com/t/86etuazuc
    // https://app.clickup.com/t/86etub4u6
    // gasDay

    const andInWhere = {
      NOT: {
        contract_code_id: null
      }, // revers bal ไม่แสดง effect
      query_shipper_nomination_status: {
        id: {
          in: [1, 2, 5]
        }
      },

      AND: [
        {
          OR: [{del_flag: false}, {del_flag: null}]
        }
      ],
      ...(gasDay
        ? {
            OR: [
              // 1) gas_day เท่ากับวันเป้าหมาย
              {
                gas_day: {
                  equals: getTodayStartAdd7(gasDay).toDate()
                }
              },

              // 2) gas_day เท่ากับวันอาทิตย์ของสัปดาห์นั้น และ nomination_type_id = 2
              {
                AND: [
                  {
                    gas_day: {
                      equals: dayjs(gasDay).subtract(dayjs(gasDay).day(), 'day').toDate()
                    }
                  },
                  {
                    nomination_type_id: 2
                  }
                ]
              }
            ]
          }
        : {})
    }
    const resData = resData_
      ? resData_
      : await this.findAllChunked(andInWhere, {
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
          contract_code: true,
          nomination_version: {
            where: {
              flag_use: true
            },
            include: {
              nomination_full_json: true,
              nomination_row_json: true
            }
          }
        })
    // const resData = resData_ ? resData_ : await this.prisma.query_shipper_nomination_file.findMany({
    //   where: {
    //     NOT: { contract_code_id: null }, // revers bal ไม่แสดง effect
    //     query_shipper_nomination_status: {
    //       id: {
    //         in: [1, 2, 5],
    //       },
    //     },

    //     AND: [
    //       {
    //         OR: [{ del_flag: false }, { del_flag: null }],
    //       },
    //     ],
    //       ...(gasDay
    //     ? {
    //         OR: [
    //           // 1) gas_day เท่ากับวันเป้าหมาย
    //           { gas_day: { equals: getTodayStartAdd7(gasDay).toDate() } },

    //           // 2) gas_day เท่ากับวันอาทิตย์ของสัปดาห์นั้น และ nomination_type_id = 2
    //           {
    //             AND: [
    //               { gas_day: { equals: dayjs(gasDay).subtract(dayjs(gasDay).day(), "day").toDate() } },
    //               { nomination_type_id: 2 },
    //             ],
    //           },
    //         ],
    //       }
    //     : {}),
    //   },
    //   include: {
    //     reserve_balancing_gas_contract: {
    //       include:{
    //         reserve_balancing_gas_contract_comment:true,
    //         reserve_balancing_gas_contract_detail:{
    //           include:{
    //             nomination_point:{
    //               include:{
    //                 area:true,
    //                 zone:true,
    //               },
    //             },
    //             area:true,
    //             zone:true,
    //           },
    //         },
    //         reserve_balancing_gas_contract_files:true,
    //       },
    //     },
    //     contract_code:true,
    //     nomination_version: {
    //       where: {
    //         flag_use: true,
    //       },
    //       include: {
    //         nomination_full_json: true,
    //         nomination_row_json: true,
    //       },
    //     },
    //   },
    //   orderBy: {
    //     id: 'desc',
    //   },
    // });
    // query_shipper_nomination_type_id 1
    let dailyData = []

    const resDataCv = resData.map((e: any) => {
      const nomination_version = e['nomination_version'].map((nv: any) => {
        const nomination_full_json = nv['nomination_full_json'].map((nfj: any) => {
          nfj['data_temp'] = JSON.parse(nfj['data_temp'])
          return {
            ...nfj
          }
        })
        const nomination_row_json = nv['nomination_row_json'].map((nfj: any) => {
          nfj['data_temp'] = JSON.parse(nfj['data_temp'])
          return {
            ...nfj
          }
        })
        const nomination_row_json_use = nomination_row_json.filter((f: any) => {
          return f?.query_shipper_nomination_type_id === 1 && f?.data_temp['9'] === 'MMSCFD'
        })

        if (nomination_row_json_use.length > 0) {
          nomination_row_json_use.map((nx: any) => {
            dailyData.push({
              nomination_type_id: e?.nomination_type_id,
              nomination_code: e?.nomination_code,
              gas_day: e?.gas_day,
              gas_day_text: dayjs(e?.gas_day).format('DD/MM/YYYY'),
              contract_code_id: e?.contract_code_id,
              group_id: e?.group_id,
              query_shipper_nomination_file_renom_id: e?.query_shipper_nomination_file_renom_id,
              submitted_timestamp: e?.submitted_timestamp,
              nomination_full_json: nomination_full_json[0],
              nomination_row_json: nx
            })

            return nx
          })
        }

        return {
          ...nv,
          nomination_full_json,
          nomination_row_json_use
        }
      })

      return {
        ...e,
        nomination_version
      }
    })

    const dailyArr = dailyData.filter((f: any) => {
      return f?.nomination_type_id === 1
    })
    const weeklyArr = dailyData.filter((f: any) => {
      return f?.nomination_type_id === 2
    })
    const areaGroup = [...new Set(dailyArr.map((gr: any) => gr?.nomination_row_json?.area_text))]
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const areaData = await this.prisma.area.findMany({
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
      include: {}
    })
    const zoneData = await this.prisma.zone.findMany({
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
    const meterData = await this.prisma.metering_point.findMany({
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
        zone: true,
        area: true
      }
    })
    const contractCodeData = await this.prisma.contract_code.findMany({})

    const gasdayArrDaily = [...new Set(dailyArr.map((es: any) => es?.gas_day_text))]
    const newDaily = gasdayArrDaily.flatMap((e: any) => {
      const fil = dailyArr.filter((f: any) => f?.gas_day_text === e)
      const areaGroupF = [...new Set(fil.map((gr: any) => gr?.nomination_row_json?.area_text))]

      const areaAll = areaGroupF.flatMap((es: any, ies: any, aes: any) => {
        const filAreaGF = fil.filter((fGf: any) => {
          return fGf?.nomination_row_json?.area_text === es
        })

        const zoneTextObj = zoneData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.zone_text && (f?.entry_exit_id === 1 ? 'Entry' : 'Exit') === filAreaGF[0]?.nomination_row_json?.data_temp['10']) || null
        const zoneTextObjExit = zoneData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.zone_text && (f?.entry_exit_id === 2)) || null
        
        const areaTextObj = areaData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.area_text && (f?.entry_exit_id === 1 ? 'Entry' : 'Exit') === filAreaGF[0]?.nomination_row_json?.data_temp['10']) || null
        const gasDayText = filAreaGF[0]?.gas_day_text || null
        const contractCodeId = contractCodeData.find((f: any) => f?.id === filAreaGF[0]?.contract_code_id) || null

        const hv = this.fn_hv(filAreaGF, null)
        const sg = this.fn_sg(filAreaGF, null)
        const wi = this.fn_wi(filAreaGF, null)

        return [
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'HV',
            valueBtuScf: hv,
            contractCodeId
          },
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'WI',
            valueBtuScf: wi,
            contractCodeId
          },
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'SG',
            valueBtuScf: sg,
            contractCodeId
          }
        ]
      })

      return [...areaAll]
    })

    const gasdayArrWeekly = [...new Set(weeklyArr.map((es: any) => es?.gas_day_text))]

    // New!
    const newWeekly = gasdayArrWeekly.flatMap((e: any) => {
      const fil = weeklyArr.filter((f: any) => f?.gas_day_text === e)

      const areaGroupF = [...new Set(fil.map((gr: any) => gr?.nomination_row_json?.area_text))]
      const areaAll = areaGroupF.flatMap((es: any, ies: any, aes: any) => {
        const filAreaGF = fil.filter((fGf: any) => {
          return fGf?.nomination_row_json?.area_text === es
        })

        // excel  wi 11 hv 12 sg 13
        // const gasDayText = filAreaGF[0]?.gas_day_text || null; // fix ได้ เพราะ weekly วันเริ่มอาทิตจะตรงกัน
        const gasDayText = e

        const hv1 = this.fn_hv(filAreaGF, 14)
        const sg1 = this.fn_sg(filAreaGF, 14)
        const wi1 = this.fn_wi(filAreaGF, 14)
        // ---------
        const hv2 = this.fn_hv(filAreaGF, 15)
        const sg2 = this.fn_sg(filAreaGF, 15)
        const wi2 = this.fn_wi(filAreaGF, 15)
        // ---------
        const hv3 = this.fn_hv(filAreaGF, 16)
        const sg3 = this.fn_sg(filAreaGF, 16)
        const wi3 = this.fn_wi(filAreaGF, 16)
        // ---------
        const hv4 = this.fn_hv(filAreaGF, 17)
        const sg4 = this.fn_sg(filAreaGF, 17)
        const wi4 = this.fn_wi(filAreaGF, 17)
        // ---------
        const hv5 = this.fn_hv(filAreaGF, 18)
        const sg5 = this.fn_sg(filAreaGF, 18)
        const wi5 = this.fn_wi(filAreaGF, 18)
        // ---------
        const hv6 = this.fn_hv(filAreaGF, 19)
        const sg6 = this.fn_sg(filAreaGF, 19)
        const wi6 = this.fn_wi(filAreaGF, 19)
        // ---------
        const hv7 = this.fn_hv(filAreaGF, 20)
        const sg7 = this.fn_sg(filAreaGF, 20)
        const wi7 = this.fn_wi(filAreaGF, 20)
        // ---------

        // ---------
        const zoneTextObj = zoneData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.zone_text && (f?.entry_exit_id === 1 ? 'Entry' : 'Exit') === filAreaGF[0]?.nomination_row_json?.data_temp['10']) || null
        const zoneTextObjExit = zoneData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.zone_text && (f?.entry_exit_id === 2)) || null

        const areaTextObj = areaData.find((f: any) => f?.name === filAreaGF[0]?.nomination_row_json?.area_text && (f?.entry_exit_id === 1 ? 'Entry' : 'Exit') === filAreaGF[0]?.nomination_row_json?.data_temp['10']) || null

        const contractCodeId = contractCodeData.find((f: any) => f?.id === filAreaGF[0]?.contract_code_id) || null

        const sunday = dayjs(e, 'DD/MM/YYYY').add(0, 'day').format('DD/MM/YYYY')
        const monday = dayjs(e, 'DD/MM/YYYY').add(1, 'day').format('DD/MM/YYYY')
        const tuesday = dayjs(e, 'DD/MM/YYYY').add(2, 'day').format('DD/MM/YYYY')
        const wednesday = dayjs(e, 'DD/MM/YYYY').add(3, 'day').format('DD/MM/YYYY')
        const thursday = dayjs(e, 'DD/MM/YYYY').add(4, 'day').format('DD/MM/YYYY')
        const friday = dayjs(e, 'DD/MM/YYYY').add(5, 'day').format('DD/MM/YYYY')
        const saturday = dayjs(e, 'DD/MM/YYYY').add(7, 'day').format('DD/MM/YYYY')
        // ---------

        return [
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'HV',
            contractCodeId,
            sunday: {
              date: sunday,
              value: hv1
            },
            monday: {
              date: monday,
              value: hv2
            },
            tuesday: {
              date: tuesday,
              value: hv3
            },
            wednesday: {
              date: wednesday,
              value: hv4
            },
            thursday: {
              date: thursday,
              value: hv5
            },
            friday: {
              date: friday,
              value: hv6
            },
            saturday: {
              date: saturday,
              value: hv7
            }
          },
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'WI',
            contractCodeId,
            sunday: {
              date: sunday,
              value: wi1
            },
            monday: {
              date: monday,
              value: wi2
            },
            tuesday: {
              date: tuesday,
              value: wi3
            },
            wednesday: {
              date: wednesday,
              value: wi4
            },
            thursday: {
              date: thursday,
              value: wi5
            },
            friday: {
              date: friday,
              value: wi6
            },
            saturday: {
              date: saturday,
              value: wi7
            }
          },
          {
            gasday: gasDayText,
            zone: zoneTextObj,
            zoneExit: zoneTextObjExit,
            area: areaTextObj,
            parameter: 'SG',
            contractCodeId,
            sunday: {
              date: sunday,
              value: sg1
            },
            monday: {
              date: monday,
              value: sg2
            },
            tuesday: {
              date: tuesday,
              value: sg3
            },
            wednesday: {
              date: wednesday,
              value: sg4
            },
            thursday: {
              date: thursday,
              value: sg5
            },
            friday: {
              date: friday,
              value: sg6
            },
            saturday: {
              date: saturday,
              value: sg7
            }
          }
        ]
      })

      return [...areaAll]
    })

    const day = (newDaily.length > 0 ? newDaily : newWeekly.length > 0 ? newWeekly : []).map((e: any) => e?.gasday)
    const daySet = [...new Set(day)].map((e: any) => dayjs(e, 'DD/MM/YYYY').format('YYYY-MM-DD'))
    const findMinMaxDate = (dateArray) => {
      if (!dateArray || dateArray.length === 0) {
        return {
          minDate: null,
          maxDate: null
        }
      }

      let minDate = dateArray[0]
      let maxDate = dateArray[0]

      for (const dateStr of dateArray) {
        if (dateStr < minDate) {
          minDate = dateStr
        }
        if (dateStr > maxDate) {
          maxDate = dateStr
        }
      }

      return {
        minDate,
        maxDate
      }
    }

    const nDay = findMinMaxDate(daySet)

    // Extract gas days and generate date array
    const getMeterFrom = getTodayNow(nDay?.minDate)
    const getMeterTo = getTodayNow(nDay?.maxDate)
    const dateArray: string[] = []
    // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
    let current = getMeterFrom.clone()
    while (current.isSameOrBefore(getMeterTo, 'day')) {
      dateArray.push(current.format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }
    // Build active data for all dates
    const activeData = await buildActiveDataForDates(dateArray, this.prisma)

    return {
      nDay,
      activeData,
      daySet,
      newDaily,
      newWeekly,
      meterData
    }
  }

  async fnMiddleIntra(nDay, activeData, daySet, newDaily, newWeekly, meterData) {
    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        // case: "getLast",
        case: 'getLastH',
        mode: 'metering',

        start_date: nDay?.minDate,
        end_date: nDay?.maxDate
      }),
      {
        activeData,
        prisma: this.prisma
      }
    )

    const reply = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    let gasDayArr = []
    for (let i = 0; i < daySet.length; i++) {
      const fDaty = reply?.filter((f: any) => f?.gasDay === daySet[i])
      gasDayArr.push({
        gasDay: daySet[i],
        data: fDaty
      })
    }

    const intraday = (newDaily.length > 0 ? newDaily : newWeekly.length > 0 ? newWeekly : []).map((e: any) => {
      const fil = gasDayArr.filter((f: any) => {
        return dayjs(f?.gasDay, 'YYYY-MM-DD').format('DD/MM/YYYY') === e?.gasday
      })
      const fMeter = meterData
        .filter((f: any) => {
          return f?.area?.name === e?.area?.name && f?.zone?.name === e?.zone?.name
        })
        ?.map((mn: any) => mn?.metered_point_name)
      let filA = fil.map((fA: any) => fA?.data).flat()
      const filData = filA?.filter((f: any) => {
        return fMeter.includes(f?.meteringPointId)
      })

      const fHrIn0 = (payl: any, hr: any) =>
        (payl || []).filter((f: any) => {
          return dayjs(f?.registerTimestamp).format('HH') === hr
        })

      let fH1 = fHrIn0(filData, '00')
      let fH2 = fHrIn0(filData, '01')
      let fH3 = fHrIn0(filData, '02')
      let fH4 = fHrIn0(filData, '03')
      let fH5 = fHrIn0(filData, '04')
      let fH6 = fHrIn0(filData, '05')
      let fH7 = fHrIn0(filData, '06')
      let fH8 = fHrIn0(filData, '07')
      let fH9 = fHrIn0(filData, '08')
      let fH10 = fHrIn0(filData, '09')
      let fH11 = fHrIn0(filData, '10')
      let fH12 = fHrIn0(filData, '11')
      let fH13 = fHrIn0(filData, '12')
      let fH14 = fHrIn0(filData, '13')
      let fH15 = fHrIn0(filData, '14')
      let fH16 = fHrIn0(filData, '15')
      let fH17 = fHrIn0(filData, '16')
      let fH18 = fHrIn0(filData, '17')
      let fH19 = fHrIn0(filData, '18')
      let fH20 = fHrIn0(filData, '19')
      let fH21 = fHrIn0(filData, '20')
      let fH22 = fHrIn0(filData, '21')
      let fH23 = fHrIn0(filData, '22')
      let fH24 = fHrIn0(filData, '23')

      //     parseToNumber,
      // parseToNumber3Decimal,
      const calcParameter = (hourCalc: any) => {
        if (hourCalc.length > 0) {
          const hvXvi = hourCalc.length > 0 ? hourCalc.reduce((sum, item) => sum + parseToNumber(item.heatingValue) * parseToNumber(item.volume), 0) : null
          const viAll = hourCalc.length > 0 ? hourCalc.reduce((sum, item) => sum + parseToNumber(item.volume), 0) : null
          const sgXvi = hourCalc.length > 0 && viAll ? hourCalc.reduce((sum, item) => sum + parseToNumber4Decimal(item.sg) * parseToNumber(viAll), 0) : null
          const hv = hvXvi / viAll
          const wi = hvXvi / 0.982596 / Math.sqrt(sgXvi * viAll)
          const sg = sgXvi / viAll

          if (e?.parameter === 'HV') {
            return (hv !== Infinity && hv) || 'Div/0'
          } else if (e?.parameter === 'WI') {
            return (wi !== Infinity && wi) || 'Div/0'
          } else if (e?.parameter === 'SG') {
            return (sg !== Infinity && sg) || 'Div/0'
          } else {
            return null
          }
        } else {
          return null
        }
      }

      fH1 = calcParameter(fH1)
      fH2 = calcParameter(fH2)
      fH3 = calcParameter(fH3)
      fH4 = calcParameter(fH4)
      fH5 = calcParameter(fH5)
      fH6 = calcParameter(fH6)
      fH7 = calcParameter(fH7)
      fH8 = calcParameter(fH8)
      fH9 = calcParameter(fH9)
      fH10 = calcParameter(fH10)
      fH11 = calcParameter(fH11)
      fH12 = calcParameter(fH12)
      fH13 = calcParameter(fH13)
      fH14 = calcParameter(fH14)
      fH15 = calcParameter(fH15)
      fH16 = calcParameter(fH16)
      fH17 = calcParameter(fH17)
      fH18 = calcParameter(fH18)
      fH19 = calcParameter(fH19)
      fH20 = calcParameter(fH20)
      fH21 = calcParameter(fH21)
      fH22 = calcParameter(fH22)
      fH23 = calcParameter(fH23)
      fH24 = calcParameter(fH24)
      
      return {
        gasday: e?.gasday,
        zone: e?.zone,
        area: e?.area,
        parameter: e?.parameter,
        contractCodeId: e?.contractCodeId,
        h1: fH1,
        h2: fH2,
        h3: fH3,
        h4: fH4,
        h5: fH5,
        h6: fH6,
        h7: fH7,
        h8: fH8,
        h9: fH9,
        h10: fH10,
        h11: fH11,
        h12: fH12,
        h13: fH13,
        h14: fH14,
        h15: fH15,
        h16: fH16,
        h17: fH17,
        h18: fH18,
        h19: fH19,
        h20: fH20,
        h21: fH21,
        h22: fH22,
        h23: fH23,
        h24: fH24
      }
    })

    return intraday
  }

  async intraday2(gasDay?: string) {
    try {
      let end = gasDay ? getTodayEndAdd7(gasDay) : getTodayEndAdd7()
      if (!end.isValid()) {
        end = getTodayEndAdd7()
      }

      const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const areaData = await this.prisma.area.findMany({
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
      include: {}
    })
    const zoneData = await this.prisma.zone.findMany({
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
    
      const today = dayjs().tz('Asia/Bangkok')
      const yesterdayForGetMeterData = today.subtract(1, 'day')
      const start = end.subtract(6, 'day').startOf('day')
      let minDateForGetMeterData = start.subtract(1, 'day')

      const dateArray: string[] = []
      // Fill dateArray with all dates between end and start (inclusive) in YYYY-MM-DD format
      let current = end.clone()
      while (current.isSameOrAfter(start, 'day')) {
        dateArray.push(current.format('YYYY-MM-DD'))
        current = current.subtract(1, 'day')
      }

      const andInWhere = {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        query_shipper_nomination_status: {
          id: {
            in: [2, 5]
          }
        },
        OR: [
          // Daily nominations: exact date match
          {
            nomination_type: {
              id: 1
            },
            gas_day: {
              gte: start.toDate(),
              lte: end.toDate()
            }
          },
          // Weekly nominations: same week
          {
            nomination_type: {
              id: 2
            },
            gas_day: {
              gte: start.startOf('week').toDate(),
              lte: end.endOf('week').toDate()
            }
          }
        ]
      }
      // performance start...
      const nominationData = await this.findAllChunked(
        andInWhere,
        {
          group: true,
          query_shipper_nomination_status: true,
          contract_code: true,
          nomination_type: true,
          nomination_version: {
            include: {
              nomination_full_json: true,
              nomination_full_json_sheet2: true,
              nomination_row_json: {
                include: {
                  query_shipper_nomination_type: true
                },
                orderBy: {
                  id: 'asc'
                }
              }
            },
            where: {
              flag_use: true
            }
          }
        },
        20
      )
      // performance end...
      // const nominationData =
      //   await this.prisma.query_shipper_nomination_file.findMany({
      //     where: {
      //       NOT: { contract_code_id: null }, // revers bal ไม่แสดง effect
      //       query_shipper_nomination_status: {
      //         id: {
      //           in: [2, 5],
      //         },
      //       },
      //       OR: [
      //         // Daily nominations: exact date match
      //         {
      //           nomination_type: {
      //             id: 1,
      //           },
      //           gas_day: {
      //             gte: start.toDate(),
      //             lte: end.toDate(),
      //           },
      //         },
      //         // Weekly nominations: same week
      //         {
      //           nomination_type: {
      //             id: 2,
      //           },
      //           gas_day: {
      //             gte: start.startOf('week').toDate(),
      //             lte: end.endOf('week').toDate(),
      //           },
      //         },
      //       ],
      //     },
      //     include: {
      //       group: true,
      //       query_shipper_nomination_status: true,
      //       contract_code: true,
      //       nomination_type: true,
      //       nomination_version: {
      //         include: {
      //           nomination_full_json: true,
      //           nomination_full_json_sheet2: true,
      //           nomination_row_json: {
      //             include: { query_shipper_nomination_type: true },
      //             orderBy: { id: 'asc' },
      //           },
      //         },
      //         where: { flag_use: true },
      //       },
      //     },
      //     orderBy: { id: 'desc' },
      //   });

      const consoleAtArea = 'No console'
      const consoleAtHour = -1
      const meterDataList: any[] = []
      let returnItem = []

      // เรียก API ดึงข้อมูล metering แบบ parallel สำหรับทุกวันที่สร้างไว้
      // ใช้ Promise.all เพื่อให้เรียก API พร้อมกันหลายวันเพื่อเพิ่มประสิทธิภาพ
      let dateArrayForGetMeterData = dateArray
      if (!dateArray.includes(minDateForGetMeterData.format('YYYY-MM-DD'))) {
        dateArrayForGetMeterData.push(minDateForGetMeterData.format('YYYY-MM-DD'))
      }
      if (!dateArray.includes(today.format('YYYY-MM-DD'))) {
        dateArrayForGetMeterData.push(today.format('YYYY-MM-DD'))
      }
      if (!dateArray.includes(yesterdayForGetMeterData.format('YYYY-MM-DD'))) {
        dateArrayForGetMeterData.push(yesterdayForGetMeterData.format('YYYY-MM-DD'))
      }
      if (yesterdayForGetMeterData.isBefore(minDateForGetMeterData)) {
        minDateForGetMeterData = yesterdayForGetMeterData
      }

      // Build active data for all dates
      const areaMaster: areaWithRelations[] = await this.prisma.area.findMany({
        where: {
          OR: [
            {
              end_date: null
            }, // No end date means still active
            {
              end_date: {
                gt: minDateForGetMeterData.toDate()
              }
            } // End date is after target date
          ],
          start_date: {
            lte: end.toDate()
          } // Start date is before or on target date
        },
        ...areaPopulate
      })

      const zoneMaster: zone[] = await this.prisma.zone.findMany({
        where: {
          OR: [
            {
              end_date: null
            },
            {
              end_date: {
                gt: minDateForGetMeterData.toDate()
              }
            }
          ],
          start_date: {
            lte: end.toDate()
          }
        }
      })
      const meteringPointMaster: meteringPointWithRelations[] = await this.prisma.metering_point.findMany({
        where: {
          OR: [
            {
              end_date: null
            },
            {
              end_date: {
                gt: minDateForGetMeterData.toDate()
              }
            }
          ],
          start_date: {
            lte: end.toDate()
          }
        },
        ...meteringPointPopulate
      })

      await Promise.all(
        dateArrayForGetMeterData.map(async (date: string) => {
          // เรียก meteredMicroService เพื่อดึงข้อมูล metering timestamp สุดท้ายของแต่ละชั่วโมง
          const meteredMicroData = await this.meteredMicroService.sendMessage(
            JSON.stringify({
              case: 'getLastHour',
              mode: 'metering',
              gas_day: date
            })
          )
          // แปลง response จาก JSON string เป็น object (ถ้ามี reply)
          const meterData = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null
          // กรองเฉพาะข้อมูลที่มี energy (ทั้ง energy หลักหรือ data_temp?.energy)
          // รวมถึงกรณีที่ energy เป็น 0 ด้วย (เพราะ 0 ก็ถือว่ามีข้อมูล)
          if (meterData && Array.isArray(meterData)) {
            const haveEnergyMeterData = meterData.filter((meter: any) => meter.energy || meter.data_temp?.energy || meter.energy == 0 || meter.data_temp?.energy == 0)
            // เพิ่มข้อมูลที่ผ่านการกรองเข้า meterDataList
            meterDataList.push(...haveEnergyMeterData)
          }
        })
      )

      current = end.clone()
      while (current.isSameOrAfter(start, 'day')) {
        // สร้าง array สำหรับเก็บผลลัพธ์
        const result: any[] = []

        const activeAreas = areaMaster.filter((area) => area.start_date <= current.toDate() && (area.end_date === null || area.end_date >= current.toDate()))
        const activeZones = zoneMaster.filter((zone) => zone.start_date <= current.toDate() && (zone.end_date === null || zone.end_date >= current.toDate()))
        const activeMeteringPoints = meteringPointMaster.filter((meteringPoint) => meteringPoint.start_date <= current.toDate() && (meteringPoint.end_date === null || meteringPoint.end_date >= current.toDate()))

        if (activeAreas.length > 0) {
          // กรอง nomination แบบรายวันสำหรับวันที่กำลังประมวลผล
          const dailyNominationList = nominationData.filter((nominationFile) => dayjs(nominationFile.gas_day).isSame(current, 'day') && nominationFile.nomination_type_id == 1)

          // กรอง nomination แบบรายสัปดาห์สำหรับสัปดาห์ที่กำลังประมวลผล
          // ข้ามถ้ามี daily nomination สำหรับ contract เดียวกันแล้ว (daily nomination มีลำดับความสำคัญสูงกว่า)
          const weeklyNominationList = nominationData.filter((nominationFile) => dayjs(nominationFile.gas_day).isSame(current, 'week') && nominationFile.nomination_type_id == 2 && !dailyNominationList.some((daily) => daily.contract_code_id == nominationFile.contract_code_id))

          // ประมวลผล daily nomination
          dailyNominationList.map((dailyNomination) => {
            dailyNomination.nomination_version.map((nominationVersion) => {
              nominationVersion.nomination_row_json.map((nominationRowJson) => {
                // แปลง JSON string เป็น object
                const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp)

                // อ่านข้อมูลจาก JSON ตามตำแหน่งที่กำหนด
                const zone = nominationRowJsonDataTemp['0']
                const area = nominationRowJsonDataTemp['2']
                const point = nominationRowJsonDataTemp['3']
                const unit = nominationRowJsonDataTemp['9']
                const entryExit = nominationRowJsonDataTemp['10']
                const total = parseToNumber(nominationRowJsonDataTemp['38'])

                // ข้ามถ้าไม่มีข้อมูล zone, area (ต้องเป็น nomination point)
                // quality planning ไม่ต้องคำนวณค่ารายชั่วโมงของ Exit
                if (!zone || !area || isMatch(entryExit, 'Exit')) {
                  return
                }

                const zoneObj = activeZones.find((zoneObj) => isMatch(zoneObj.name, zone))
                const areaObj = activeAreas.find((areaObj) => isMatch(areaObj.name, area))

                // หาว่ามี point นี้ใน result แล้วหรือยัง (เช็คตาม point, zone, area, entryExit, gas_day, group, contract, nomination)
                let existPointIndex = result.findIndex((f: any) => {
                  return (
                    f?.point === point &&
                    f?.zone_text === nominationRowJson.zone_text &&
                    f?.area_text === nominationRowJson.area_text &&
                    f?.entryExit === entryExit &&
                    f?.gas_day === current.format('DD/MM/YYYY') &&
                    f?.group_id === dailyNomination.group_id &&
                    f?.contract_code_id === dailyNomination.contract_code_id
                  )
                  // && f?.nomination_id === dailyNomination.id
                })

                let timeShow = []

                // ถ้ายังไม่มี point นี้ใน result ให้สร้างใหม่
                if (existPointIndex < 0) {
                  existPointIndex = result.length
                  result.push({
                    gas_day: current.format('DD/MM/YYYY'),
                    group_id: dailyNomination.group_id,
                    shipper_name: dailyNomination.group?.name,
                    shipper_id_name: dailyNomination.group?.id_name,
                    contract: dailyNomination.contract_code?.contract_code,
                    contract_code_id: dailyNomination.contract_code_id,
                    // "nomination_id": dailyNomination.id,
                    nomination_code: dailyNomination.nomination_code,
                    zone_text: nominationRowJson.zone_text,
                    area_text: nominationRowJson.area_text,
                    zone_obj: zoneObj,
                    area_obj: areaObj,
                    // "unit": unit,
                    point: point,
                    entryExit: entryExit,
                    total: total,
                    totalType: 'daily',
                    nomination_type_id: dailyNomination.nomination_type_id,
                    timeShow: []
                  })
                } else {
                  // ถ้ามี point นี้แล้ว ให้ใช้ timeShow ที่มีอยู่
                  timeShow = result[existPointIndex].timeShow
                }

                const meterUnderNom = activeMeteringPoints.filter((meterPoint: any) => meterPoint.nomination_point?.nomination_point == point)
                const meterUnderNomSet = Array.from(new Set(meterUnderNom.map((f: any) => f.metered_point_name)))

                let targetMeterDataList = []
                if (meterUnderNom.length > 0) {
                  targetMeterDataList = meterDataList.filter((meterData: any) => {
                    return meterUnderNom.some((meterPoint: any) => meterPoint.metered_point_name == meterData.meteringPointId) && dayjs(meterData.gasDay, 'YYYY-MM-DD').isSameOrBefore(current)
                  })
                }

                // ดึงข้อมูลรายชั่วโมง (24 ชั่วโมง) จาก JSON
                // ข้อมูลชั่วโมงเริ่มที่ตำแหน่ง 14 (H1 = 00:00, H2 = 01:00, ..., H24 = 23:00)
                const h1Key = 14
                for (let i = 0; i <= 23; i++) {
                  let hourlyValue = null
                  for (let j = 0; j <= i; j++) {
                    const hourlyValueTemp = parseToNumber(nominationRowJsonDataTemp[`${h1Key + j}`])
                    if (hourlyValueTemp != null) {
                      if (hourlyValue != null) {
                        hourlyValue += hourlyValueTemp
                      } else {
                        hourlyValue = hourlyValueTemp
                      }
                    }
                  }
                  const key = `${i.toString().padStart(2, '0')}:00`

                  // หาว่ามีเวลานี้ใน timeShow แล้วหรือยัง
                  const timeShowIndex = timeShow.findIndex((f: any) => {
                    return f.time === key
                  })
                  if (timeShowIndex < 0) {
                    const heatingValueFromMeterList: {
                      metering_point_id: any
                      gas_day: any
                      gas_hour: any
                      insert_timestamp: any
                      metering_retrieving_id: any
                      heatingValue: number
                      volume: number
                      sg: number
                    }[] = []
                    // const volumeFromMeterList: { metering_point_id: any, gas_day: any, gas_hour: any, heatingValue: number, volume: number }[] = []

                    let calculatedHeatingValueFromMeter = null
                    let calculatedSgFromMeter = null

                    if (targetMeterDataList.length > 0) {
                      let sumSgMutipleByVolume: number | undefined
                      let sumHeatingValueMutipleByVolume: number | undefined
                      let sumVolume: number | undefined

                      let gasHourMeterDataList = []
                      meterUnderNomSet.map((meterPointName: any) => {
                        let gasHourMeterDataEachPoint = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour == i + 1 && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                        if (gasHourMeterDataEachPoint.length == 0) {
                          const beforeGasHourMeterDataList = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour < i + 1 && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                          if (beforeGasHourMeterDataList.length > 0) {
                            const lastestGasHour = beforeGasHourMeterDataList.sort((a: any, b: any) => b.gasHour - a.gasHour)[0].gasHour
                            gasHourMeterDataEachPoint = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour == lastestGasHour && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                          }
                        }

                        // ข้ามวัน
                        let yesterday = current.subtract(1, 'day')
                        while (yesterday.isSameOrAfter(minDateForGetMeterData, 'day') && gasHourMeterDataEachPoint.length == 0) {
                          const filMeterYeterday = meterDataList.filter((meterData: any) => {
                            return meterData.meteringPointId == meterPointName && meterData.gasDay == yesterday.tz('Asia/Bangkok').format('YYYY-MM-DD') && parseToNumber(meterData?.energy) != null
                          })

                          if (filMeterYeterday.length > 0) {
                            const lastestGasHour = filMeterYeterday.sort((a: any, b: any) => b.gasHour - a.gasHour)[0].gasHour
                            gasHourMeterDataEachPoint = filMeterYeterday.filter((meterData: any) => meterData.gasHour == lastestGasHour)
                          }

                          yesterday = yesterday.subtract(1, 'day')
                        }

                        gasHourMeterDataList.push(...gasHourMeterDataEachPoint)
                      })

                      gasHourMeterDataList.map((meterData: any) => {
                        const sgFromMeter = parseToNumber4Decimal(meterData.sg) ?? parseToNumber4Decimal(meterData.data_temp?.sg)
                        const heatingValueFromMeter = parseToNumber(meterData.heatingValue) ?? parseToNumber(meterData.data_temp?.heatingValue)
                        const volumeFromMeter = parseToNumber(meterData.volume) ?? parseToNumber(meterData.data_temp?.volume)
                        if (volumeFromMeter != null) {
                          // volumeFromMeterList.push({
                          //   metering_point_id: meterData.meteringPointId,
                          //   gas_day: meterData.gasDay,
                          //   gas_hour: meterData.gasHour,
                          //   heatingValue: heatingValueFromMeter,
                          //   volume: volumeFromMeter
                          // })
                          if (heatingValueFromMeter != null) {
                            heatingValueFromMeterList.push({
                              metering_point_id: meterData.meteringPointId,
                              gas_day: meterData.gasDay,
                              gas_hour: meterData.gasHour,
                              insert_timestamp: meterData.insert_timestamp,
                              metering_retrieving_id: meterData.metering_retrieving_id,
                              heatingValue: heatingValueFromMeter,
                              volume: volumeFromMeter,
                              sg: sgFromMeter
                            })
                            if (sumHeatingValueMutipleByVolume) {
                              sumHeatingValueMutipleByVolume += heatingValueFromMeter * volumeFromMeter
                            } else {
                              sumHeatingValueMutipleByVolume = heatingValueFromMeter * volumeFromMeter
                            }
                          }

                          if (sgFromMeter != null) {
                            if (sumSgMutipleByVolume) {
                              sumSgMutipleByVolume += sgFromMeter * volumeFromMeter
                            } else {
                              sumSgMutipleByVolume = sgFromMeter * volumeFromMeter
                            }
                          }

                          if (sumVolume) {
                            sumVolume += volumeFromMeter
                          } else {
                            sumVolume = volumeFromMeter
                          }
                        }
                      })

                      if (area == consoleAtArea && consoleAtHour == i + 1) {
                      }

                      if (sumHeatingValueMutipleByVolume != undefined && sumVolume != undefined) {
                        calculatedHeatingValueFromMeter = sumHeatingValueMutipleByVolume / sumVolume
                        if (area == consoleAtArea && consoleAtHour == i + 1) {
                        }
                      }

                      if (sumSgMutipleByVolume != undefined && sumVolume != undefined) {
                        calculatedSgFromMeter = sumSgMutipleByVolume / sumVolume
                        if (area == consoleAtArea && consoleAtHour == i + 1) {
                        }
                      }
                    }

                    // ถ้ายังไม่มี ให้สร้างใหม่
                    if (isMatch(unit, 'MMBTU/D')) {
                      timeShow.push({
                        time: key,
                        gasHour: i + 1,
                        value: hourlyValue,
                        valueMmscfd: null,
                        heatingValueFromMeter: heatingValueFromMeterList,
                        // volumeFromMeter: volumeFromMeterList,
                        calculatedHeatingValueFromMeter: calculatedHeatingValueFromMeter,
                        calculatedSgFromMeter: calculatedSgFromMeter
                      })
                    } else if (isMatch(unit, 'MMSCFD')) {
                      timeShow.push({
                        time: key,
                        gasHour: i + 1,
                        value: null,
                        valueMmscfd: hourlyValue,
                        heatingValueFromMeter: heatingValueFromMeterList,
                        // volumeFromMeter: volumeFromMeterList,
                        calculatedHeatingValueFromMeter: calculatedHeatingValueFromMeter,
                        calculatedSgFromMeter: calculatedSgFromMeter
                      })
                    }
                  } else {
                    // ถ้ามีแล้ว ให้บวกค่าเข้าไป (กรณีมีหลาย row สำหรับ point เดียวกัน)
                    if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMSCFD')) {
                      let timeShowValue = isMatch(unit, 'MMBTU/D') ? timeShow[timeShowIndex].value : timeShow[timeShowIndex].valueMmscfd
                      if (timeShowValue != null) {
                        if (hourlyValue != null) {
                          timeShowValue += hourlyValue
                        }
                      } else {
                        timeShowValue = hourlyValue
                      }
                      if (isMatch(unit, 'MMBTU/D')) {
                        timeShow[timeShowIndex].value = timeShowValue
                      } else {
                        timeShow[timeShowIndex].valueMmscfd = timeShowValue
                      }
                    }
                  }
                }
                result[existPointIndex].timeShow = timeShow
              })
            })
          })

          // ประมวลผล weekly nomination (สำหรับวันที่ไม่มี daily nomination)
          weeklyNominationList.map((weeklyNomination) => {
            weeklyNomination.nomination_version.map((nominationVersion) => {
              nominationVersion.nomination_row_json.map((nominationRowJson) => {
                // แปลง JSON string เป็น object
                const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp)

                // อ่านข้อมูลจาก JSON
                const zone = nominationRowJsonDataTemp['0']
                const area = nominationRowJsonDataTemp['2']
                const point = nominationRowJsonDataTemp['3']
                const unit = nominationRowJsonDataTemp['9']
                const entryExit = nominationRowJsonDataTemp['10']
                // สำหรับ weekly nomination: คำนวณค่ารายชั่วโมงจากค่ารายวัน
                // ดึงค่าตามวันในสัปดาห์ (Sunday = 0, Monday = 1, ..., Saturday = 6)
                const dayOfWeek = Number(current.format('d')) // วันในสัปดาห์ (0 = Sunday, 6 = Saturday)
                const thisDayValue3Decimal = parseToNumber(nominationRowJsonDataTemp[`${14 + dayOfWeek}`])
                // แบ่งค่ารายวันด้วย 24 เพื่อได้ค่ารายชั่วโมง
                // const hourlyValue = thisDayValue3Decimal == null ? null : parseFloat((thisDayValue3Decimal / 24).toFixed(3))
                const hourlyValue = thisDayValue3Decimal == null ? null : thisDayValue3Decimal / 24

                // ข้ามถ้าไม่มีข้อมูล zone, area (ต้องเป็น nomination point)
                // quality planning ไม่ต้องคำนวณค่ารายชั่วโมงของ Exit
                if (!zone || !area || isMatch(entryExit, 'Exit')) {
                  return
                }

                const zoneObj = activeZones.find((zoneObj) => isMatch(zoneObj.name, zone))
                const areaObj = activeAreas.find((areaObj) => isMatch(areaObj.name, area))

                let existPointIndex = result.findIndex((f: any) => {
                  return (
                    f?.point === point &&
                    f?.zone_text === nominationRowJson.zone_text &&
                    f?.area_text === nominationRowJson.area_text &&
                    f?.entryExit === entryExit &&
                    f?.gas_day === current.format('DD/MM/YYYY') &&
                    f?.group_id === weeklyNomination.group_id &&
                    f?.contract_code_id === weeklyNomination.contract_code_id
                  )
                  // && f?.nomination_id === weeklyNomination.id
                })

                let timeShow = []

                if (existPointIndex < 0) {
                  existPointIndex = result.length
                  result.push({
                    gas_day: current.format('DD/MM/YYYY'),
                    group_id: weeklyNomination.group_id,
                    shipper_name: weeklyNomination.group?.name,
                    shipper_id_name: weeklyNomination.group?.id_name,
                    contract: weeklyNomination.contract_code?.contract_code,
                    contract_code_id: weeklyNomination.contract_code_id,
                    // "nomination_id": weeklyNomination.id,
                    nomination_code: weeklyNomination.nomination_code,
                    zone_text: nominationRowJson.zone_text,
                    area_text: nominationRowJson.area_text,
                    zone_obj: zoneObj,
                    area_obj: areaObj,
                    // "unit": unit,
                    point: point,
                    entryExit: entryExit,
                    total: thisDayValue3Decimal,
                    totalType: current.format('dddd'),
                    nomination_type_id: weeklyNomination.nomination_type_id,
                    timeShow: []
                  })
                } else {
                  // ถ้ามี point นี้แล้ว ให้ใช้ timeShow ที่มีอยู่
                  timeShow = result[existPointIndex].timeShow
                }

                const meterUnderNom = activeMeteringPoints.filter((meterPoint: any) => meterPoint.nomination_point?.nomination_point == point)
                const meterUnderNomSet = Array.from(new Set(meterUnderNom.map((f: any) => f.metered_point_name)))
                let targetMeterDataList = []
                if (meterUnderNom.length > 0) {
                  targetMeterDataList = meterDataList.filter((meterData: any) => {
                    return meterUnderNom.some((meterPoint: any) => meterPoint.metered_point_name == meterData.meteringPointId) && dayjs(meterData.gasDay, 'YYYY-MM-DD').isSameOrBefore(current)
                  })
                }
                // สร้างค่ารายชั่วโมงเท่ากันทุกชั่วโมง (24 ชั่วโมง)
                for (let i = 0; i <= 23; i++) {
                  const key = `${i.toString().padStart(2, '0')}:00`

                  const timeShowIndex = timeShow.findIndex((f: any) => {
                    return f.time === key
                  })
                  if (timeShowIndex < 0) {
                    const heatingValueFromMeterList: {
                      metering_point_id: any
                      gas_day: any
                      gas_hour: any
                      insert_timestamp: any
                      metering_retrieving_id: any
                      heatingValue: number
                      volume: number
                      sg: number
                    }[] = []
                    // const volumeFromMeterList: { metering_point_id: any, gas_day: any, gas_hour: any, heatingValue: number, volume: number }[] = []

                    let calculatedHeatingValueFromMeter = null
                    let calculatedSgFromMeter = null

                    if (targetMeterDataList.length > 0) {
                      let sumSgMutipleByVolume: number | undefined
                      let sumHeatingValueMutipleByVolume: number | undefined
                      let sumVolume: number | undefined

                      let gasHourMeterDataList = []
                      meterUnderNomSet.map((meterPointName: any) => {
                        let gasHourMeterDataEachPoint = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour == i + 1 && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                        if (gasHourMeterDataEachPoint.length == 0) {
                          const beforeGasHourMeterDataList = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour < i + 1 && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                          if (beforeGasHourMeterDataList.length > 0) {
                            const lastestGasHour = beforeGasHourMeterDataList.sort((a: any, b: any) => b.gasHour - a.gasHour)[0].gasHour
                            gasHourMeterDataEachPoint = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour == lastestGasHour && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                          }
                        }

                        // ข้ามวัน
                        let yesterday = current.subtract(1, 'day')
                        while (yesterday.isSameOrAfter(minDateForGetMeterData, 'day') && gasHourMeterDataEachPoint.length == 0) {
                          const filMeterYeterday = meterDataList.filter((meterData: any) => {
                            return meterData.meteringPointId == meterPointName && meterData.gasDay == yesterday.tz('Asia/Bangkok').format('YYYY-MM-DD') && parseToNumber(meterData?.energy) != null
                          })

                          if (filMeterYeterday.length > 0) {
                            const lastestGasHour = filMeterYeterday.sort((a: any, b: any) => b.gasHour - a.gasHour)[0].gasHour
                            gasHourMeterDataEachPoint = filMeterYeterday.filter((meterData: any) => meterData.gasHour == lastestGasHour)
                          }

                          yesterday = yesterday.subtract(1, 'day')
                        }
                        gasHourMeterDataList.push(...gasHourMeterDataEachPoint)
                      })

                      gasHourMeterDataList.map((meterData: any) => {
                        const sgFromMeter = parseToNumber4Decimal(meterData.sg) ?? parseToNumber4Decimal(meterData.data_temp?.sg)
                        const heatingValueFromMeter = parseToNumber(meterData.heatingValue) ?? parseToNumber(meterData.data_temp?.heatingValue)
                        const volumeFromMeter = parseToNumber(meterData.volume) ?? parseToNumber(meterData.data_temp?.volume)
                        if (volumeFromMeter != null) {
                          // volumeFromMeterList.push({
                          //   metering_point_id: meterData.meteringPointId,
                          //   gas_day: meterData.gasDay,
                          //   gas_hour: meterData.gasHour,
                          //   heatingValue: heatingValueFromMeter,
                          //   volume: volumeFromMeter
                          // })
                          if (heatingValueFromMeter != null) {
                            heatingValueFromMeterList.push({
                              metering_point_id: meterData.meteringPointId,
                              gas_day: meterData.gasDay,
                              gas_hour: meterData.gasHour,
                              insert_timestamp: meterData.insert_timestamp,
                              metering_retrieving_id: meterData.metering_retrieving_id,
                              heatingValue: heatingValueFromMeter,
                              volume: volumeFromMeter,
                              sg: sgFromMeter
                            })
                            if (sumHeatingValueMutipleByVolume) {
                              sumHeatingValueMutipleByVolume += heatingValueFromMeter * volumeFromMeter
                            } else {
                              sumHeatingValueMutipleByVolume = heatingValueFromMeter * volumeFromMeter
                            }
                          }

                          if (sgFromMeter != null) {
                            if (sumSgMutipleByVolume) {
                              sumSgMutipleByVolume += sgFromMeter * volumeFromMeter
                            } else {
                              sumSgMutipleByVolume = sgFromMeter * volumeFromMeter
                            }
                          }

                          if (sumVolume) {
                            sumVolume += volumeFromMeter
                          } else {
                            sumVolume = volumeFromMeter
                          }
                        }
                      })

                      if (area == consoleAtArea && consoleAtHour == i + 1) {
                      }

                      if (sumHeatingValueMutipleByVolume != undefined && sumVolume != undefined) {
                        calculatedHeatingValueFromMeter = sumHeatingValueMutipleByVolume / sumVolume
                        if (area == consoleAtArea && consoleAtHour == i + 1) {
                        }
                      }

                      if (sumSgMutipleByVolume != undefined && sumVolume != undefined) {
                        calculatedSgFromMeter = sumSgMutipleByVolume / sumVolume
                        if (area == consoleAtArea && consoleAtHour == i + 1) {
                        }
                      }
                    }

                    // ถ้ายังไม่มี ให้สร้างใหม่
                    if (isMatch(unit, 'MMBTU/D')) {
                      timeShow.push({
                        time: key,
                        gasHour: i + 1,
                        value: hourlyValue * (i + 1),
                        valueMmscfd: null,
                        heatingValueFromMeter: heatingValueFromMeterList,
                        // volumeFromMeter: volumeFromMeterList,
                        calculatedHeatingValueFromMeter: calculatedHeatingValueFromMeter,
                        calculatedSgFromMeter: calculatedSgFromMeter
                      })
                    } else if (isMatch(unit, 'MMSCFD')) {
                      timeShow.push({
                        time: key,
                        gasHour: i + 1,
                        value: null,
                        valueMmscfd: hourlyValue * (i + 1),
                        heatingValueFromMeter: heatingValueFromMeterList,
                        // volumeFromMeter: volumeFromMeterList,
                        calculatedHeatingValueFromMeter: calculatedHeatingValueFromMeter,
                        calculatedSgFromMeter: calculatedSgFromMeter
                      })
                    }
                  } else {
                    // ถ้ามีแล้ว ให้บวกค่าเข้าไป (กรณีมีหลาย row สำหรับ point เดียวกัน)
                    if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMSCFD')) {
                      let timeShowValue = isMatch(unit, 'MMBTU/D') ? timeShow[timeShowIndex].value : timeShow[timeShowIndex].valueMmscfd
                      if (timeShowValue != null) {
                        if (hourlyValue != null) {
                          timeShowValue += hourlyValue * (i + 1)
                        }
                      } else {
                        timeShowValue = hourlyValue * (i + 1)
                      }
                      if (isMatch(unit, 'MMBTU/D')) {
                        timeShow[timeShowIndex].value = timeShowValue
                      } else {
                        timeShow[timeShowIndex].valueMmscfd = timeShowValue
                      }
                    }
                  }
                }
                result[existPointIndex].timeShow = timeShow
              })
            })
          })

          //จัด data
          activeAreas
            .filter((area) => area.entry_exit_id == 1)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((area: any) => {
              const hvObject: any = {
                gasday: current.format('DD/MM/YYYY'),
                zone: area.zone,
                zoneExit: zoneData.find((f: any) => f?.name === area.zone?.name && (f?.entry_exit_id === 2)) || null,
                area: area,
                parameter: 'HV',
                // "contractCodeId": {},
                h1: null,
                h2: null,
                h3: null,
                h4: null,
                h5: null,
                h6: null,
                h7: null,
                h8: null,
                h9: null,
                h10: null,
                h11: null,
                h12: null,
                h13: null,
                h14: null,
                h15: null,
                h16: null,
                h17: null,
                h18: null,
                h19: null,
                h20: null,
                h21: null,
                h22: null,
                h23: null,
                h24: null
              }
              const wiObject: any = {
                gasday: current.format('DD/MM/YYYY'),
                zone: area.zone,
                zoneExit: zoneData.find((f: any) => f?.name === area.zone?.name && (f?.entry_exit_id === 2)) || null,
                area: area,
                parameter: 'WI',
                // "contractCodeId": {},
                h1: null,
                h2: null,
                h3: null,
                h4: null,
                h5: null,
                h6: null,
                h7: null,
                h8: null,
                h9: null,
                h10: null,
                h11: null,
                h12: null,
                h13: null,
                h14: null,
                h15: null,
                h16: null,
                h17: null,
                h18: null,
                h19: null,
                h20: null,
                h21: null,
                h22: null,
                h23: null,
                h24: null
              }
              const sgObject: any = {
                gasday: current.format('DD/MM/YYYY'),
                zone: area.zone,
                zoneExit: zoneData.find((f: any) => f?.name === area.zone?.name && (f?.entry_exit_id === 2)) || null,
                area: area,
                parameter: 'SG',
                // "contractCodeId": {},
                h1: null,
                h2: null,
                h3: null,
                h4: null,
                h5: null,
                h6: null,
                h7: null,
                h8: null,
                h9: null,
                h10: null,
                h11: null,
                h12: null,
                h13: null,
                h14: null,
                h15: null,
                h16: null,
                h17: null,
                h18: null,
                h19: null,
                h20: null,
                h21: null,
                h22: null,
                h23: null,
                h24: null
              }
              const targetDataForArea = result.filter((item) => item.area_text == area.name && item.zone_text == area.zone.name)
              if (targetDataForArea.length > 0) {
                let sumNomValueEachHour: Record<
                  string,
                  {
                    pointNameList: string[]
                    value: number | null
                    valueMmscfd: number | null
                    hvMutipleByValue: number | null
                    sgMutipleByValue: number | null
                    hvMutipleByValueMmscfd: number | null
                    sgMutipleByValueMmscfd: number | null
                  }
                > = {}
                let calculatedHeatingValueFromMeterEachHourAndPoint: Record<string, number | null> = {}
                let calculatedSgFromMeterEachHourAndPoint: Record<string, number | null> = {}
                targetDataForArea.map((data: any) => {
                  data.timeShow.map((timeShow: any, index: number) => {
                    const key = `${data.point}_${data.area_text}_${data.zone_text}_h${timeShow.gasHour}`
                    const areaKey = `${data.area_text}_${data.zone_text}_h${timeShow.gasHour}`

                    if (sumNomValueEachHour[areaKey] != undefined) {
                      if (!sumNomValueEachHour[areaKey].pointNameList.includes(data.point)) {
                        sumNomValueEachHour[areaKey].pointNameList.push(data.point)
                      }
                      if (timeShow.value != null) {
                        sumNomValueEachHour[areaKey].value += timeShow.value
                      } else {
                        sumNomValueEachHour[areaKey].value = timeShow.value
                      }
                      if (timeShow.valueMmscfd != null) {
                        sumNomValueEachHour[areaKey].valueMmscfd += timeShow.valueMmscfd
                      } else {
                        sumNomValueEachHour[areaKey].valueMmscfd = timeShow.valueMmscfd
                      }
                    } else {
                      // sumNomValueEachHour[key] += timeShow.value
                      sumNomValueEachHour[areaKey] = {
                        pointNameList: [data.point],
                        value: timeShow.value,
                        valueMmscfd: timeShow.valueMmscfd,
                        hvMutipleByValue: null,
                        sgMutipleByValue: null,
                        hvMutipleByValueMmscfd: null,
                        sgMutipleByValueMmscfd: null
                      }
                    }

                    if (calculatedHeatingValueFromMeterEachHourAndPoint[key] == undefined || calculatedSgFromMeterEachHourAndPoint[key] == undefined) {
                      let currentCalculatedHeatingValueFromMeter = timeShow.calculatedHeatingValueFromMeter
                      let currentCalculatedSgFromMeter = timeShow.calculatedSgFromMeter
                      let currentGasHour = timeShow.gasHour
                      while (currentCalculatedHeatingValueFromMeter == null && currentGasHour > 0) {
                        currentGasHour = currentGasHour - 1
                        const previousTimeShow = data.timeShow.find((f: any) => f.gasHour == currentGasHour)
                        if (previousTimeShow && previousTimeShow.heatingValueFromMeter.length > 0) {
                          if (data.area_text == consoleAtArea && consoleAtHour == timeShow.gasHour) {
                          }
                          currentCalculatedHeatingValueFromMeter = previousTimeShow.calculatedHeatingValueFromMeter
                          currentCalculatedSgFromMeter = previousTimeShow.calculatedSgFromMeter
                        }
                      }

                      if (calculatedHeatingValueFromMeterEachHourAndPoint[key] == undefined && currentCalculatedHeatingValueFromMeter != null) {
                        calculatedHeatingValueFromMeterEachHourAndPoint[key] = currentCalculatedHeatingValueFromMeter
                      }

                      if (calculatedSgFromMeterEachHourAndPoint[key] == undefined && currentCalculatedSgFromMeter != null) {
                        calculatedSgFromMeterEachHourAndPoint[key] = currentCalculatedSgFromMeter
                      }
                    }

                    if (calculatedHeatingValueFromMeterEachHourAndPoint[key] != null) {
                      if (sumNomValueEachHour[areaKey].hvMutipleByValue != null) {
                        sumNomValueEachHour[areaKey].hvMutipleByValue += (timeShow.value ?? 0) * calculatedHeatingValueFromMeterEachHourAndPoint[key]
                      } else {
                        sumNomValueEachHour[areaKey].hvMutipleByValue = (timeShow.value ?? 0) * calculatedHeatingValueFromMeterEachHourAndPoint[key]
                      }

                      if (sumNomValueEachHour[areaKey].hvMutipleByValueMmscfd != null) {
                        sumNomValueEachHour[areaKey].hvMutipleByValueMmscfd += (timeShow.valueMmscfd ?? 0) * calculatedHeatingValueFromMeterEachHourAndPoint[key]
                      } else {
                        sumNomValueEachHour[areaKey].hvMutipleByValueMmscfd = (timeShow.valueMmscfd ?? 0) * calculatedHeatingValueFromMeterEachHourAndPoint[key]
                      }
                    }
                    if (calculatedSgFromMeterEachHourAndPoint[key] != null) {
                      if (sumNomValueEachHour[areaKey].sgMutipleByValue != null) {
                        sumNomValueEachHour[areaKey].sgMutipleByValue += (timeShow.value ?? 0) * calculatedSgFromMeterEachHourAndPoint[key]
                      } else {
                        sumNomValueEachHour[areaKey].sgMutipleByValue = (timeShow.value ?? 0) * calculatedSgFromMeterEachHourAndPoint[key]
                      }

                      if (sumNomValueEachHour[areaKey].sgMutipleByValueMmscfd != null) {
                        sumNomValueEachHour[areaKey].sgMutipleByValueMmscfd += (timeShow.valueMmscfd ?? 0) * calculatedSgFromMeterEachHourAndPoint[key]
                      } else {
                        sumNomValueEachHour[areaKey].sgMutipleByValueMmscfd = (timeShow.valueMmscfd ?? 0) * calculatedSgFromMeterEachHourAndPoint[key]
                      }
                    }

                    if (data.area_text == consoleAtArea && consoleAtHour == timeShow.gasHour) {
                    }
                  })
                })

                Object.keys(sumNomValueEachHour).forEach((key) => {
                  const [area, zone, gasHour] = key.split('_')
                  const sumNomValue = sumNomValueEachHour[key]

                  const hv = sumNomValue?.valueMmscfd == null ? null : (sumNomValue.hvMutipleByValueMmscfd ?? 0) / sumNomValue.valueMmscfd
                  const sg = sumNomValue?.valueMmscfd == null ? null : (sumNomValue.sgMutipleByValueMmscfd ?? 0) / sumNomValue.valueMmscfd
                  const wi = sumNomValue.sgMutipleByValueMmscfd == null || sumNomValue?.valueMmscfd == null ? null : (sumNomValue.hvMutipleByValueMmscfd ?? 0) / 0.982596 / Math.sqrt(sumNomValue.sgMutipleByValueMmscfd * sumNomValue.valueMmscfd)

                  if (area == consoleAtArea && `h${consoleAtHour}` == gasHour) {
                  }

                  hvObject[gasHour] = parseToNumber3Decimal(hv)
                  sgObject[gasHour] = parseToNumber4Decimal(sg)
                  wiObject[gasHour] = parseToNumber3Decimal(wi)
                })

                returnItem.push(hvObject)
                returnItem.push(wiObject)
                returnItem.push(sgObject)
              }
            })
        }

        // ไปวันก่อนหน้า
        current = current.subtract(1, 'day')
      }

      return returnItem
    } catch (error) {
      return []
    }
  }

  async intraday3(gasDay?: string) {
    try {
      let end = gasDay ? getTodayEndAdd7(gasDay) : getTodayEndAdd7()
      if (!end.isValid()) {
        end = getTodayEndAdd7()
      }
    
      const today = dayjs().tz('Asia/Bangkok')
      const yesterdayForGetMeterData = today.subtract(1, 'day')
      const start = end.subtract(6, 'day').startOf('day')
      let minDateForGetMeterData = start.subtract(1, 'day')

      const dateArray: string[] = []
      // Fill dateArray with all dates between end and start (inclusive) in YYYY-MM-DD format
      let current = end.clone()
      while (current.isSameOrAfter(start, 'day')) {
        dateArray.push(current.format('YYYY-MM-DD'))
        current = current.subtract(1, 'day')
      }

      const andInWhere = {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        query_shipper_nomination_status: {
          id: {
            in: [2, 5]
          }
        },
        OR: [
          // Daily nominations: exact date match
          {
            nomination_type: {
              id: 1
            },
            gas_day: {
              gte: start.toDate(),
              lte: end.toDate()
            }
          },
          // Weekly nominations: same week
          {
            nomination_type: {
              id: 2
            },
            gas_day: {
              gte: start.startOf('week').toDate(),
              lte: end.endOf('week').toDate()
            }
          }
        ]
      }
      
      const nominationData = await this.findAllChunked(
        andInWhere,
        {
          group: true,
          query_shipper_nomination_status: true,
          contract_code: true,
          nomination_type: true,
          nomination_version: {
            include: {
              nomination_full_json: true,
              nomination_full_json_sheet2: true,
              nomination_row_json: {
                include: {
                  query_shipper_nomination_type: true
                },
                orderBy: {
                  id: 'asc'
                }
              }
            },
            where: {
              flag_use: true
            }
          }
        },
        20
      )

      const consoleAtArea = 'No console'
      const consoleAtHour = -1
      const meterDataList: any[] = []
      let returnItem = []

      // เรียก API ดึงข้อมูล metering แบบ parallel สำหรับทุกวันที่สร้างไว้
      // ใช้ Promise.all เพื่อให้เรียก API พร้อมกันหลายวันเพื่อเพิ่มประสิทธิภาพ
      let dateArrayForGetMeterData = dateArray
      if (!dateArray.includes(minDateForGetMeterData.format('YYYY-MM-DD'))) {
        dateArrayForGetMeterData.push(minDateForGetMeterData.format('YYYY-MM-DD'))
      }
      if (!dateArray.includes(today.format('YYYY-MM-DD'))) {
        dateArrayForGetMeterData.push(today.format('YYYY-MM-DD'))
      }
      if (!dateArray.includes(yesterdayForGetMeterData.format('YYYY-MM-DD'))) {
        dateArrayForGetMeterData.push(yesterdayForGetMeterData.format('YYYY-MM-DD'))
      }
      if (yesterdayForGetMeterData.isBefore(minDateForGetMeterData)) {
        minDateForGetMeterData = yesterdayForGetMeterData
      }

      // Build active data for all dates
      const areaMaster: areaWithRelations[] = await this.prisma.area.findMany({
        where: {
          OR: [
            {
              end_date: null
            }, // No end date means still active
            {
              end_date: {
                gt: minDateForGetMeterData.toDate()
              }
            } // End date is after target date
          ],
          start_date: {
            lte: end.toDate()
          } // Start date is before or on target date
        },
        ...areaPopulate
      })

      const zoneMaster: zone[] = await this.prisma.zone.findMany({
        where: {
          OR: [
            {
              end_date: null
            },
            {
              end_date: {
                gt: minDateForGetMeterData.toDate()
              }
            }
          ],
          start_date: {
            lte: end.toDate()
          }
        }
      })
      const meteringPointMaster: meteringPointWithRelations[] = await this.prisma.metering_point.findMany({
        where: {
          OR: [
            {
              end_date: null
            },
            {
              end_date: {
                gt: minDateForGetMeterData.toDate()
              }
            }
          ],
          start_date: {
            lte: end.toDate()
          }
        },
        ...meteringPointPopulate
      })

      await Promise.all(
        dateArrayForGetMeterData.map(async (date: string) => {
          // เรียก meteredMicroService เพื่อดึงข้อมูล metering timestamp สุดท้ายของแต่ละชั่วโมง
          const meteredMicroData = await this.meteredMicroService.sendMessage(
            JSON.stringify({
              case: 'getLastHour',
              mode: 'metering',
              gas_day: date
            })
          )
          // แปลง response จาก JSON string เป็น object (ถ้ามี reply)
          const meterData = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null
          // กรองเฉพาะข้อมูลที่มี energy (ทั้ง energy หลักหรือ data_temp?.energy)
          // รวมถึงกรณีที่ energy เป็น 0 ด้วย (เพราะ 0 ก็ถือว่ามีข้อมูล)
          if (meterData && Array.isArray(meterData)) {
            const haveEnergyMeterData = meterData.filter((meter: any) => meter.energy || meter.data_temp?.energy || meter.energy == 0 || meter.data_temp?.energy == 0)
            // เพิ่มข้อมูลที่ผ่านการกรองเข้า meterDataList
            meterDataList.push(...haveEnergyMeterData)
          }
        })
      )

      // ใช้สำหรับเทสเท่านั้น
      // เขียน response จาก meterDataList ไปเป็น JSON เพื่อใช้ในการเทส
      // const fs = require('fs');
      // const path = require('path');
      // const meterJsonPath = path.join(process.cwd(), 'src', 'quality-planning', 'dto', 'meter.json');
      // // try {
      // //   fs.mkdirSync(path.dirname(meterJsonPath), { recursive: true });
      // //   fs.writeFileSync(meterJsonPath, JSON.stringify(meterDataList, null, 2), 'utf8');
      // //   console.log('meterDataList saved to', meterJsonPath, `(${meterDataList.length} items)`);
      // // } catch (err) {
      // //   console.error('Error writing meterDataList to meter.json:', err);
      // // }

      // เปิดการเทสจาก file meter.json
      // try {
      //   const meterDataFromFile = JSON.parse(fs.readFileSync(meterJsonPath, 'utf8'));
      //   console.log('meterDataList loaded from', meterJsonPath, `(${meterDataFromFile.length} items)`);
      //   meterDataList.length = 0;
      //   meterDataList.push(...meterDataFromFile);
      // } catch (err) {
      //   console.error('Error reading meter.json:', err);
      // }

      current = end.clone()
      while (current.isSameOrAfter(start, 'day')) {
        // สร้าง array สำหรับเก็บผลลัพธ์
        const result: any[] = []

        const activeAreas = areaMaster.filter((area) => area.start_date <= current.toDate() && (area.end_date === null || area.end_date >= current.toDate()))
        const activeZones = zoneMaster.filter((zone) => zone.start_date <= current.toDate() && (zone.end_date === null || zone.end_date >= current.toDate()))
        const activeMeteringPoints = meteringPointMaster.filter((meteringPoint) => meteringPoint.start_date <= current.toDate() && (meteringPoint.end_date === null || meteringPoint.end_date >= current.toDate()))

        if (activeAreas.length > 0) {
          const [adjustMMSCFList, adjustMMBTUList] = await Promise.all([
            this.astosService.daily_adjustment_summary({
              gas_day: current.format('YYYY-MM-DD'),
              start_hour: 1,
              end_hour: 24,
              skip: 0,
              limit: 0,
              daily_adjustment_summary_unit: 'MMSCF'
            }),
            this.astosService.daily_adjustment_summary({
              gas_day: current.format('YYYY-MM-DD'),
              start_hour: 1,
              end_hour: 24,
              skip: 0,
              limit: 0,
              daily_adjustment_summary_unit: 'MMBTU'
            })
          ])

          // กรอง nomination แบบรายวันสำหรับวันที่กำลังประมวลผล
          const dailyNominationList = nominationData.filter((nominationFile) => dayjs(nominationFile.gas_day).isSame(current, 'day') && nominationFile.nomination_type_id == 1)

          // กรอง nomination แบบรายสัปดาห์สำหรับสัปดาห์ที่กำลังประมวลผล
          // ข้ามถ้ามี daily nomination สำหรับ contract เดียวกันแล้ว (daily nomination มีลำดับความสำคัญสูงกว่า)
          const weeklyNominationList = nominationData.filter((nominationFile) => dayjs(nominationFile.gas_day).isSame(current, 'week') && nominationFile.nomination_type_id == 2 && !dailyNominationList.some((daily) => daily.contract_code_id == nominationFile.contract_code_id))

          // ประมวลผล daily nomination
          dailyNominationList.map((dailyNomination) => {
            dailyNomination.nomination_version.map((nominationVersion) => {
              nominationVersion.nomination_row_json.map((nominationRowJson) => {
                // แปลง JSON string เป็น object
                const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp)

                // อ่านข้อมูลจาก JSON ตามตำแหน่งที่กำหนด
                const zone = nominationRowJsonDataTemp['0']
                const area = nominationRowJsonDataTemp['2']
                const point = nominationRowJsonDataTemp['3']
                const unit = nominationRowJsonDataTemp['9']
                const entryExit = nominationRowJsonDataTemp['10']
                const total = parseToNumber(nominationRowJsonDataTemp['38'])

                // ข้ามถ้าไม่มีข้อมูล zone, area (ต้องเป็น nomination point)
                // quality planning ไม่ต้องคำนวณค่ารายชั่วโมงของ Exit
                if (!zone || !area || isMatch(entryExit, 'Exit')) {
                  return
                }

                const zoneObj = activeZones.find((zoneObj) => isMatch(zoneObj.name, zone))
                const areaObj = activeAreas.find((areaObj) => isMatch(areaObj.name, area))

                // หาว่ามี point นี้ใน result แล้วหรือยัง (เช็คตาม point, zone, area, entryExit, gas_day, group, contract, nomination)
                let existPointIndex = result.findIndex((f: any) => {
                  return (
                    f?.point === point &&
                    f?.zone_text === nominationRowJson.zone_text &&
                    f?.area_text === nominationRowJson.area_text &&
                    f?.entryExit === entryExit &&
                    f?.gas_day === current.format('DD/MM/YYYY') &&
                    f?.group_id === dailyNomination.group_id &&
                    f?.contract_code_id === dailyNomination.contract_code_id
                  )
                  // && f?.nomination_id === dailyNomination.id
                })

                let timeShow = []

                // ถ้ายังไม่มี point นี้ใน result ให้สร้างใหม่
                if (existPointIndex < 0) {
                  existPointIndex = result.length
                  result.push({
                    gas_day: current.format('DD/MM/YYYY'),
                    group_id: dailyNomination.group_id,
                    shipper_name: dailyNomination.group?.name,
                    shipper_id_name: dailyNomination.group?.id_name,
                    contract: dailyNomination.contract_code?.contract_code,
                    contract_code_id: dailyNomination.contract_code_id,
                    // "nomination_id": dailyNomination.id,
                    nomination_code: dailyNomination.nomination_code,
                    zone_text: nominationRowJson.zone_text,
                    area_text: nominationRowJson.area_text,
                    zone_obj: zoneObj,
                    area_obj: areaObj,
                    // "unit": unit,
                    point: point,
                    entryExit: entryExit,
                    total: total,
                    totalType: 'daily',
                    nomination_type_id: dailyNomination.nomination_type_id,
                    timeShow: []
                  })
                } else {
                  // ถ้ามี point นี้แล้ว ให้ใช้ timeShow ที่มีอยู่
                  timeShow = result[existPointIndex].timeShow
                }

                const meterUnderNom = activeMeteringPoints.filter((meterPoint: any) => meterPoint.nomination_point?.nomination_point == point)
                const meterUnderNomSet = Array.from(new Set(meterUnderNom.map((f: any) => f.metered_point_name)))

                let targetMeterDataList = []
                if (meterUnderNom.length > 0) {
                  targetMeterDataList = meterDataList.filter((meterData: any) => {
                    return meterUnderNom.some((meterPoint: any) => meterPoint.metered_point_name == meterData.meteringPointId) && dayjs(meterData.gasDay, 'YYYY-MM-DD').isSameOrBefore(current)
                  })
                }

                // ดึงข้อมูลรายชั่วโมง (24 ชั่วโมง) จาก JSON
                // ข้อมูลชั่วโมงเริ่มที่ตำแหน่ง 14 (H1 = 00:00, H2 = 01:00, ..., H24 = 23:00)
                const h1Key = 14
                for (let i = 0; i <= 23; i++) {
                  let hourlyValue = null
                  for (let j = 0; j <= i; j++) {
                    let hourlyValueTemp : number | null | undefined  = null
                    if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                      hourlyValueTemp = adjustMMBTUList.find(adjustItem => 
                        adjustItem.shipper == dailyNomination.group?.id_name
                        && adjustItem.contract == dailyNomination.contract_code?.contract_code
                        && adjustItem.gas_day == current.format('YYYY-MM-DD')
                        && adjustItem.gas_hour == i + 1
                      )?.data?.find(adjustItemData => 
                        isMatch(adjustItemData.point, point)
                        && isMatch(adjustItemData.zone, zone)
                        && isMatch(adjustItemData.area, area)
                        && isMatch(adjustItemData.entry_exit, entryExit)
                      )?.value
                    } else if (isMatch(unit, 'MMSCFD') || isMatch(unit, 'MMSCFH')){
                      hourlyValueTemp = adjustMMSCFList.find(adjustItem => 
                        adjustItem.shipper == dailyNomination.group?.id_name
                        && adjustItem.contract == dailyNomination.contract_code?.contract_code
                        && adjustItem.gas_day == current.format('YYYY-MM-DD')
                        && adjustItem.gas_hour == i + 1
                      )?.data?.find(adjustItemData => 
                        isMatch(adjustItemData.point, point)
                        && isMatch(adjustItemData.zone, zone)
                        && isMatch(adjustItemData.area, area)
                        && isMatch(adjustItemData.entry_exit, entryExit)
                      )?.value
                    }

                    if(hourlyValueTemp == null || hourlyValueTemp == undefined){
                      hourlyValueTemp = parseToNumber8Decimal(nominationRowJsonDataTemp[`${h1Key + j}`])
                    }
                    
                    if (hourlyValueTemp != null && hourlyValueTemp != undefined) {
                      if (hourlyValue != null) {
                        hourlyValue = parseToNumber8Decimal(hourlyValue + parseToNumber8Decimal(hourlyValueTemp))
                      } else {
                        hourlyValue = parseToNumber8Decimal(hourlyValueTemp)
                      }
                    }
                  }
                  const key = `${i.toString().padStart(2, '0')}:00`

                  // หาว่ามีเวลานี้ใน timeShow แล้วหรือยัง
                  const timeShowIndex = timeShow.findIndex((f: any) => {
                    return f.time === key
                  })
                  if (timeShowIndex < 0) {
                    const heatingValueFromMeterList: {
                      metering_point_id: any
                      gas_day: any
                      gas_hour: any
                      insert_timestamp: any
                      metering_retrieving_id: any
                      heatingValue: number
                      volume: number
                      sg: number
                    }[] = []
                    // const volumeFromMeterList: { metering_point_id: any, gas_day: any, gas_hour: any, heatingValue: number, volume: number }[] = []

                    let calculatedHeatingValueFromMeter = null
                    let calculatedSgFromMeter = null

                    if (targetMeterDataList.length > 0) {
                      let sumSgMutipleByVolume: number | undefined
                      let sumHeatingValueMutipleByVolume: number | undefined
                      let sumVolume: number | undefined

                      let gasHourMeterDataList = []
                      meterUnderNomSet.map((meterPointName: any) => {
                        let gasHourMeterDataEachPoint = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour == i + 1 && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                        if (gasHourMeterDataEachPoint.length == 0) {
                          const beforeGasHourMeterDataList = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour < i + 1 && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                          if (beforeGasHourMeterDataList.length > 0) {
                            const lastestGasHour = beforeGasHourMeterDataList.sort((a: any, b: any) => b.gasHour - a.gasHour)[0].gasHour
                            gasHourMeterDataEachPoint = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour == lastestGasHour && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                          }
                        }

                        // ข้ามวัน
                        let yesterday = current.subtract(1, 'day')
                        while (yesterday.isSameOrAfter(minDateForGetMeterData, 'day') && gasHourMeterDataEachPoint.length == 0) {
                          const filMeterYeterday = meterDataList.filter((meterData: any) => {
                            return meterData.meteringPointId == meterPointName && meterData.gasDay == yesterday.tz('Asia/Bangkok').format('YYYY-MM-DD') && parseToNumber(meterData?.energy) != null
                          })

                          if (filMeterYeterday.length > 0) {
                            const lastestGasHour = filMeterYeterday.sort((a: any, b: any) => b.gasHour - a.gasHour)[0].gasHour
                            gasHourMeterDataEachPoint = filMeterYeterday.filter((meterData: any) => meterData.gasHour == lastestGasHour)
                          }

                          yesterday = yesterday.subtract(1, 'day')
                        }

                        gasHourMeterDataList.push(...gasHourMeterDataEachPoint)
                      })

                      gasHourMeterDataList.map((meterData: any) => {
                        const sgFromMeter = parseToNumber4Decimal(meterData.sg) ?? parseToNumber4Decimal(meterData.data_temp?.sg)
                        const heatingValueFromMeter = parseToNumber8Decimal(meterData.heatingValue) ?? parseToNumber8Decimal(meterData.data_temp?.heatingValue)
                        const volumeFromMeter = parseToNumber8Decimal(meterData.volume) ?? parseToNumber8Decimal(meterData.data_temp?.volume)
                        if (volumeFromMeter != null) {
                          // volumeFromMeterList.push({
                          //   metering_point_id: meterData.meteringPointId,
                          //   gas_day: meterData.gasDay,
                          //   gas_hour: meterData.gasHour,
                          //   heatingValue: heatingValueFromMeter,
                          //   volume: volumeFromMeter
                          // })
                          if (heatingValueFromMeter != null) {
                            heatingValueFromMeterList.push({
                              metering_point_id: meterData.meteringPointId,
                              gas_day: meterData.gasDay,
                              gas_hour: meterData.gasHour,
                              insert_timestamp: meterData.insert_timestamp,
                              metering_retrieving_id: meterData.metering_retrieving_id,
                              heatingValue: heatingValueFromMeter,
                              volume: volumeFromMeter,
                              sg: sgFromMeter
                            })
                            if (sumHeatingValueMutipleByVolume) {
                              sumHeatingValueMutipleByVolume = parseToNumber8Decimal(sumHeatingValueMutipleByVolume + (heatingValueFromMeter * volumeFromMeter))
                            } else {
                              sumHeatingValueMutipleByVolume = heatingValueFromMeter * volumeFromMeter
                            }
                          }

                          if (sgFromMeter != null) {
                            if (sumSgMutipleByVolume) {
                              sumSgMutipleByVolume = parseToNumber8Decimal(sumSgMutipleByVolume + (sgFromMeter * volumeFromMeter))
                            } else {
                              sumSgMutipleByVolume = sgFromMeter * volumeFromMeter
                            }
                          }

                          if (sumVolume) {
                            sumVolume = parseToNumber8Decimal(sumVolume + volumeFromMeter)
                          } else {
                            sumVolume = volumeFromMeter
                          }
                        }
                      })

                      if (area == consoleAtArea && consoleAtHour == i + 1) {
                      }

                      if (sumHeatingValueMutipleByVolume != undefined && sumVolume != undefined) {
                        calculatedHeatingValueFromMeter = sumHeatingValueMutipleByVolume / sumVolume

                        if (area == consoleAtArea && consoleAtHour == i + 1) {
                        }
                      }

                      if (sumSgMutipleByVolume != undefined && sumVolume != undefined) {
                        calculatedSgFromMeter = sumSgMutipleByVolume / sumVolume
                        if (area == consoleAtArea && consoleAtHour == i + 1) {
                        }
                      }
                    }

                    // ถ้ายังไม่มี ให้สร้างใหม่
                    if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                      timeShow.push({
                        time: key,
                        gasHour: i + 1,
                        value: hourlyValue,
                        valueMmscfd: null,
                        heatingValueFromMeter: heatingValueFromMeterList,
                        // volumeFromMeter: volumeFromMeterList,
                        calculatedHeatingValueFromMeter: calculatedHeatingValueFromMeter,
                        calculatedSgFromMeter: calculatedSgFromMeter
                      })
                    } else if (isMatch(unit, 'MMSCFD') || isMatch(unit, 'MMSCFH')) {
                      timeShow.push({
                        time: key,
                        gasHour: i + 1,
                        value: null,
                        valueMmscfd: hourlyValue,
                        heatingValueFromMeter: heatingValueFromMeterList,
                        // volumeFromMeter: volumeFromMeterList,
                        calculatedHeatingValueFromMeter: calculatedHeatingValueFromMeter,
                        calculatedSgFromMeter: calculatedSgFromMeter
                      })
                    }
                  } else {
                    // ถ้ามีแล้ว ให้บวกค่าเข้าไป (กรณีมีหลาย row สำหรับ point เดียวกัน)
                    if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H') || isMatch(unit, 'MMSCFD') || isMatch(unit, 'MMSCFH')) {
                      let timeShowValue = (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) ? timeShow[timeShowIndex].value : timeShow[timeShowIndex].valueMmscfd
                      if (timeShowValue != null) {
                        if (hourlyValue != null) {
                          timeShowValue = parseToNumber8Decimal(timeShowValue + hourlyValue)
                        }
                      } else {
                        timeShowValue = hourlyValue
                      }
                      if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                        timeShow[timeShowIndex].value = timeShowValue
                      } else {
                        timeShow[timeShowIndex].valueMmscfd = timeShowValue
                      }
                    }
                  }
                }
                result[existPointIndex].timeShow = timeShow
              })
            })
          })

          // ประมวลผล weekly nomination (สำหรับวันที่ไม่มี daily nomination)
          weeklyNominationList.map((weeklyNomination) => {
            weeklyNomination.nomination_version.map((nominationVersion) => {
              nominationVersion.nomination_row_json.map((nominationRowJson) => {
                // แปลง JSON string เป็น object
                const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp)

                // อ่านข้อมูลจาก JSON
                const zone = nominationRowJsonDataTemp['0']
                const area = nominationRowJsonDataTemp['2']
                const point = nominationRowJsonDataTemp['3']
                const unit = nominationRowJsonDataTemp['9']
                const entryExit = nominationRowJsonDataTemp['10']

                // สำหรับ weekly nomination: คำนวณค่ารายชั่วโมงจากค่ารายวัน
                // ดึงค่าตามวันในสัปดาห์ (Sunday = 0, Monday = 1, ..., Saturday = 6)
                const dayOfWeek = Number(current.format('d')) // วันในสัปดาห์ (0 = Sunday, 6 = Saturday)
                // const thisDayValue3Decimal = parseToNumber(nominationRowJsonDataTemp[`${14 + dayOfWeek}`])
                const thisDayValue8Decimal = parseToNumber8Decimal(nominationRowJsonDataTemp[`${14 + dayOfWeek}`])
                // แบ่งค่ารายวันด้วย 24 เพื่อได้ค่ารายชั่วโมง
                // const hourlyValue = thisDayValue3Decimal == null ? null : parseFloat((thisDayValue3Decimal / 24).toFixed(3))
                // const hourlyValue = thisDayValue3Decimal == null ? null : thisDayValue3Decimal / 24
                const hourlyValue = divideTo8Decimal(thisDayValue8Decimal, 24);

                // ข้ามถ้าไม่มีข้อมูล zone, area (ต้องเป็น nomination point)
                // quality planning ไม่ต้องคำนวณค่ารายชั่วโมงของ Exit
                if (!zone || !area || isMatch(entryExit, 'Exit')) {
                  return
                }

                const zoneObj = activeZones.find((zoneObj) => isMatch(zoneObj.name, zone))
                const areaObj = activeAreas.find((areaObj) => isMatch(areaObj.name, area))

                let existPointIndex = result.findIndex((f: any) => {
                  return (
                    f?.point === point &&
                    f?.zone_text === nominationRowJson.zone_text &&
                    f?.area_text === nominationRowJson.area_text &&
                    f?.entryExit === entryExit &&
                    f?.gas_day === current.format('DD/MM/YYYY') &&
                    f?.group_id === weeklyNomination.group_id &&
                    f?.contract_code_id === weeklyNomination.contract_code_id
                  )
                  // && f?.nomination_id === weeklyNomination.id
                })

                let timeShow = []

                if (existPointIndex < 0) {
                  existPointIndex = result.length
                  result.push({
                    gas_day: current.format('DD/MM/YYYY'),
                    group_id: weeklyNomination.group_id,
                    shipper_name: weeklyNomination.group?.name,
                    shipper_id_name: weeklyNomination.group?.id_name,
                    contract: weeklyNomination.contract_code?.contract_code,
                    contract_code_id: weeklyNomination.contract_code_id,
                    // "nomination_id": weeklyNomination.id,
                    nomination_code: weeklyNomination.nomination_code,
                    zone_text: nominationRowJson.zone_text,
                    area_text: nominationRowJson.area_text,
                    zone_obj: zoneObj,
                    area_obj: areaObj,
                    // "unit": unit,
                    point: point,
                    entryExit: entryExit,
                    total: thisDayValue8Decimal,
                    totalType: current.format('dddd'),
                    nomination_type_id: weeklyNomination.nomination_type_id,
                    timeShow: []
                  })
                } else {
                  // ถ้ามี point นี้แล้ว ให้ใช้ timeShow ที่มีอยู่
                  timeShow = result[existPointIndex].timeShow
                }

                const meterUnderNom = activeMeteringPoints.filter((meterPoint: any) => meterPoint.nomination_point?.nomination_point == point)
                const meterUnderNomSet = Array.from(new Set(meterUnderNom.map((f: any) => f.metered_point_name)))
                let targetMeterDataList = []
                if (meterUnderNom.length > 0) {
                  targetMeterDataList = meterDataList.filter((meterData: any) => {
                    return meterUnderNom.some((meterPoint: any) => meterPoint.metered_point_name == meterData.meteringPointId) && dayjs(meterData.gasDay, 'YYYY-MM-DD').isSameOrBefore(current)
                  })
                }
                // สร้างค่ารายชั่วโมงเท่ากันทุกชั่วโมง (24 ชั่วโมง)
                for (let i = 0; i <= 23; i++) {
                  const key = `${i.toString().padStart(2, '0')}:00`

                  const timeShowIndex = timeShow.findIndex((f: any) => {
                    return f.time === key
                  })
                  if (timeShowIndex < 0) {
                    const heatingValueFromMeterList: {
                      metering_point_id: any
                      gas_day: any
                      gas_hour: any
                      insert_timestamp: any
                      metering_retrieving_id: any
                      heatingValue: number
                      volume: number
                      sg: number
                    }[] = []
                    // const volumeFromMeterList: { metering_point_id: any, gas_day: any, gas_hour: any, heatingValue: number, volume: number }[] = []

                    let calculatedHeatingValueFromMeter = null
                    let calculatedSgFromMeter = null

                    if (targetMeterDataList.length > 0) {
                      let sumSgMutipleByVolume: number | undefined
                      let sumHeatingValueMutipleByVolume: number | undefined
                      let sumVolume: number | undefined

                      let gasHourMeterDataList = []
                      meterUnderNomSet.map((meterPointName: any) => {
                        let gasHourMeterDataEachPoint = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour == i + 1 && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                        if (gasHourMeterDataEachPoint.length == 0) {
                          const beforeGasHourMeterDataList = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour < i + 1 && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                          if (beforeGasHourMeterDataList.length > 0) {
                            const lastestGasHour = beforeGasHourMeterDataList.sort((a: any, b: any) => b.gasHour - a.gasHour)[0].gasHour
                            gasHourMeterDataEachPoint = targetMeterDataList.filter((meterData: any) => meterData.meteringPointId == meterPointName && meterData.gasHour == lastestGasHour && meterData.gasDay == current.tz('Asia/Bangkok').format('YYYY-MM-DD'))
                          }
                        }

                        // ข้ามวัน
                        let yesterday = current.subtract(1, 'day')
                        while (yesterday.isSameOrAfter(minDateForGetMeterData, 'day') && gasHourMeterDataEachPoint.length == 0) {
                          const filMeterYeterday = meterDataList.filter((meterData: any) => {
                            return meterData.meteringPointId == meterPointName && meterData.gasDay == yesterday.tz('Asia/Bangkok').format('YYYY-MM-DD') && parseToNumber(meterData?.energy) != null
                          })

                          if (filMeterYeterday.length > 0) {
                            const lastestGasHour = filMeterYeterday.sort((a: any, b: any) => b.gasHour - a.gasHour)[0].gasHour
                            gasHourMeterDataEachPoint = filMeterYeterday.filter((meterData: any) => meterData.gasHour == lastestGasHour)
                          }

                          yesterday = yesterday.subtract(1, 'day')
                        }
                        gasHourMeterDataList.push(...gasHourMeterDataEachPoint)
                      })

                      gasHourMeterDataList.map((meterData: any) => {
                        const sgFromMeter = parseToNumber4Decimal(meterData.sg) ?? parseToNumber4Decimal(meterData.data_temp?.sg)
                        const heatingValueFromMeter = parseToNumber8Decimal(meterData.heatingValue) ?? parseToNumber8Decimal(meterData.data_temp?.heatingValue)
                        const volumeFromMeter = parseToNumber8Decimal(meterData.volume) ?? parseToNumber8Decimal(meterData.data_temp?.volume)
                        if (volumeFromMeter != null) {
                          // volumeFromMeterList.push({
                          //   metering_point_id: meterData.meteringPointId,
                          //   gas_day: meterData.gasDay,
                          //   gas_hour: meterData.gasHour,
                          //   heatingValue: heatingValueFromMeter,
                          //   volume: volumeFromMeter
                          // })
                          if (heatingValueFromMeter != null) {
                            heatingValueFromMeterList.push({
                              metering_point_id: meterData.meteringPointId,
                              gas_day: meterData.gasDay,
                              gas_hour: meterData.gasHour,
                              insert_timestamp: meterData.insert_timestamp,
                              metering_retrieving_id: meterData.metering_retrieving_id,
                              heatingValue: heatingValueFromMeter,
                              volume: volumeFromMeter,
                              sg: sgFromMeter
                            })
                            if (sumHeatingValueMutipleByVolume) {
                              sumHeatingValueMutipleByVolume = parseToNumber8Decimal(sumHeatingValueMutipleByVolume + (heatingValueFromMeter * volumeFromMeter))
                            } else {
                              sumHeatingValueMutipleByVolume = heatingValueFromMeter * volumeFromMeter
                            }
                          }

                          if (sgFromMeter != null) {
                            if (sumSgMutipleByVolume) {
                              sumSgMutipleByVolume = parseToNumber8Decimal(sumSgMutipleByVolume + (sgFromMeter * volumeFromMeter))
                            } else {
                              sumSgMutipleByVolume = sgFromMeter * volumeFromMeter
                            }
                          }

                          if (sumVolume) {
                            sumVolume = parseToNumber8Decimal(sumVolume + volumeFromMeter)
                          } else {
                            sumVolume = volumeFromMeter
                          }
                        }
                      })

                      if (area == consoleAtArea && consoleAtHour == i + 1) {
                      }

                      if (sumHeatingValueMutipleByVolume != undefined && sumVolume != undefined) {
                        calculatedHeatingValueFromMeter = sumHeatingValueMutipleByVolume / sumVolume
                        if (area == consoleAtArea && consoleAtHour == i + 1) {
                        }
                      }

                      if (sumSgMutipleByVolume != undefined && sumVolume != undefined) {
                        calculatedSgFromMeter = sumSgMutipleByVolume / sumVolume
                        if (area == consoleAtArea && consoleAtHour == i + 1) {
                        }
                      }
                    }

                    // ถ้ายังไม่มี ให้สร้างใหม่
                    if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                      let sumHourlyValue = null
                      for (let j = 0; j <= i; j++) {
                        const hourlyValueTemp = adjustMMBTUList.find(adjustItem => 
                          adjustItem.shipper == weeklyNomination.group?.id_name
                          && adjustItem.contract == weeklyNomination.contract_code?.contract_code
                          && adjustItem.gas_day == current.format('YYYY-MM-DD')
                          && adjustItem.gas_hour == i + 1
                        )?.data?.find(adjustItemData => 
                          isMatch(adjustItemData.point, point)
                          && isMatch(adjustItemData.zone, zone)
                          && isMatch(adjustItemData.area, area)
                          && isMatch(adjustItemData.entry_exit, entryExit)
                        )?.value

                        if(hourlyValueTemp == null || hourlyValueTemp == undefined){
                          if (sumHourlyValue != null) {
                            sumHourlyValue = parseToNumber8Decimal(sumHourlyValue + hourlyValue)
                          } else {
                            sumHourlyValue = hourlyValue
                          }
                        } else {
                          if (sumHourlyValue != null) {
                            sumHourlyValue = parseToNumber8Decimal(sumHourlyValue + parseToNumber8Decimal(hourlyValueTemp))
                          } else {
                            sumHourlyValue = parseToNumber8Decimal(hourlyValueTemp)
                          }
                        }
                      }

                      timeShow.push({
                        time: key,
                        gasHour: i + 1,
                        value: sumHourlyValue, //hourlyValue * (i + 1),
                        valueMmscfd: null,
                        heatingValueFromMeter: heatingValueFromMeterList,
                        // volumeFromMeter: volumeFromMeterList,
                        calculatedHeatingValueFromMeter: calculatedHeatingValueFromMeter,
                        calculatedSgFromMeter: calculatedSgFromMeter
                      })
                    } else if (isMatch(unit, 'MMSCFD') || isMatch(unit, 'MMSCFH')) {
                      let sumHourlyValue = null
                      for (let j = 0; j <= i; j++) {
                        const hourlyValueTemp = adjustMMSCFList.find(adjustItem => 
                          adjustItem.shipper == weeklyNomination.group?.id_name
                          && adjustItem.contract == weeklyNomination.contract_code?.contract_code
                          && adjustItem.gas_day == current.format('YYYY-MM-DD')
                          && adjustItem.gas_hour == i + 1
                        )?.data?.find(adjustItemData => 
                          isMatch(adjustItemData.point, point)
                          && isMatch(adjustItemData.zone, zone)
                          && isMatch(adjustItemData.area, area)
                          && isMatch(adjustItemData.entry_exit, entryExit)
                        )?.value

                        if(hourlyValueTemp == null || hourlyValueTemp == undefined){
                          if (sumHourlyValue != null) {
                            sumHourlyValue = parseToNumber8Decimal(sumHourlyValue + hourlyValue)
                          } else {
                            sumHourlyValue = hourlyValue
                          }
                        } else {
                          if (sumHourlyValue != null) {
                            sumHourlyValue = parseToNumber8Decimal(sumHourlyValue + parseToNumber8Decimal(hourlyValueTemp))
                          } else {
                            sumHourlyValue = parseToNumber8Decimal(hourlyValueTemp)
                          }
                        }
                      }

                      timeShow.push({
                        time: key,
                        gasHour: i + 1,
                        value: null,
                        valueMmscfd: sumHourlyValue, //hourlyValue * (i + 1),
                        heatingValueFromMeter: heatingValueFromMeterList,
                        // volumeFromMeter: volumeFromMeterList,
                        calculatedHeatingValueFromMeter: calculatedHeatingValueFromMeter,
                        calculatedSgFromMeter: calculatedSgFromMeter
                      })
                    }
                  } else {
                    // ถ้ามีแล้ว ให้บวกค่าเข้าไป (กรณีมีหลาย row สำหรับ point เดียวกัน)
                    if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H') || isMatch(unit, 'MMSCFD') || isMatch(unit, 'MMSCFH')) {
                      let timeShowValue = null
                      let sumHourlyValue = null
                      if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                        timeShowValue = timeShow[timeShowIndex].value

                        for (let j = 0; j <= i; j++) {
                          const hourlyValueTemp = adjustMMBTUList.find(adjustItem => 
                            adjustItem.shipper == weeklyNomination.group?.id_name
                            && adjustItem.contract == weeklyNomination.contract_code?.contract_code
                            && adjustItem.gas_day == current.format('YYYY-MM-DD')
                            && adjustItem.gas_hour == i + 1
                          )?.data?.find(adjustItemData => 
                            isMatch(adjustItemData.point, point)
                            && isMatch(adjustItemData.zone, zone)
                            && isMatch(adjustItemData.area, area)
                            && isMatch(adjustItemData.entry_exit, entryExit)
                          )?.value

                          if(hourlyValueTemp == null || hourlyValueTemp == undefined){
                            if (sumHourlyValue != null) {
                              sumHourlyValue = parseToNumber8Decimal(sumHourlyValue + hourlyValue)
                            } else {
                              sumHourlyValue = hourlyValue
                            }
                          } else {
                            if (sumHourlyValue != null) {
                              sumHourlyValue = parseToNumber8Decimal(sumHourlyValue + parseToNumber8Decimal(hourlyValueTemp))
                            } else {
                              sumHourlyValue = parseToNumber8Decimal(hourlyValueTemp)
                            }
                          }
                        }
                      }
                      else{
                        timeShowValue = timeShow[timeShowIndex].valueMmscfd

                        for (let j = 0; j <= i; j++) {
                          const hourlyValueTemp = adjustMMSCFList.find(adjustItem => 
                            adjustItem.shipper == weeklyNomination.group?.id_name
                            && adjustItem.contract == weeklyNomination.contract_code?.contract_code
                            && adjustItem.gas_day == current.format('YYYY-MM-DD')
                            && adjustItem.gas_hour == i + 1
                          )?.data?.find(adjustItemData => 
                            isMatch(adjustItemData.point, point)
                            && isMatch(adjustItemData.zone, zone)
                            && isMatch(adjustItemData.area, area)
                            && isMatch(adjustItemData.entry_exit, entryExit)
                          )?.value

                          if(hourlyValueTemp == null || hourlyValueTemp == undefined){
                            if (sumHourlyValue != null) {
                              sumHourlyValue = parseToNumber8Decimal(sumHourlyValue + hourlyValue)
                            } else {
                              sumHourlyValue = hourlyValue
                            }
                          } else {
                            if (sumHourlyValue != null) {
                              sumHourlyValue = parseToNumber8Decimal(sumHourlyValue + parseToNumber8Decimal(hourlyValueTemp))
                            } else {
                              sumHourlyValue = parseToNumber8Decimal(hourlyValueTemp)
                            }
                          }
                        }
                      }

                      if (timeShowValue != null) {
                        if (sumHourlyValue != null) {
                          timeShowValue = parseToNumber8Decimal(timeShowValue + sumHourlyValue) //hourlyValue * (i + 1)
                        }
                      } else {
                        timeShowValue = sumHourlyValue //hourlyValue * (i + 1)
                      }

                      if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                        timeShow[timeShowIndex].value = timeShowValue
                      } else {
                        timeShow[timeShowIndex].valueMmscfd = timeShowValue
                      }
                    }
                  }
                }
                result[existPointIndex].timeShow = timeShow
              })
            })
          })

          //จัด data
          activeAreas
            .filter((area) => area.entry_exit_id == 1)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((area: any) => {
              const hvObject: any = {
                gasday: current.format('DD/MM/YYYY'),
                zone: area.zone,
                zoneExit: zoneMaster.find((f: any) => f?.name === area.zone?.name && (f?.entry_exit_id === 2)) || null,
                area: area,
                parameter: 'HV',
                // "contractCodeId": {},
                h1: null,
                h2: null,
                h3: null,
                h4: null,
                h5: null,
                h6: null,
                h7: null,
                h8: null,
                h9: null,
                h10: null,
                h11: null,
                h12: null,
                h13: null,
                h14: null,
                h15: null,
                h16: null,
                h17: null,
                h18: null,
                h19: null,
                h20: null,
                h21: null,
                h22: null,
                h23: null,
                h24: null
              }
              const wiObject: any = {
                gasday: current.format('DD/MM/YYYY'),
                zone: area.zone,
                zoneExit: zoneMaster.find((f: any) => f?.name === area.zone?.name && (f?.entry_exit_id === 2)) || null,
                area: area,
                parameter: 'WI',
                // "contractCodeId": {},
                h1: null,
                h2: null,
                h3: null,
                h4: null,
                h5: null,
                h6: null,
                h7: null,
                h8: null,
                h9: null,
                h10: null,
                h11: null,
                h12: null,
                h13: null,
                h14: null,
                h15: null,
                h16: null,
                h17: null,
                h18: null,
                h19: null,
                h20: null,
                h21: null,
                h22: null,
                h23: null,
                h24: null
              }
              const sgObject: any = {
                gasday: current.format('DD/MM/YYYY'),
                zone: area.zone,
                zoneExit: zoneMaster.find((f: any) => f?.name === area.zone?.name && (f?.entry_exit_id === 2)) || null,
                area: area,
                parameter: 'SG',
                // "contractCodeId": {},
                h1: null,
                h2: null,
                h3: null,
                h4: null,
                h5: null,
                h6: null,
                h7: null,
                h8: null,
                h9: null,
                h10: null,
                h11: null,
                h12: null,
                h13: null,
                h14: null,
                h15: null,
                h16: null,
                h17: null,
                h18: null,
                h19: null,
                h20: null,
                h21: null,
                h22: null,
                h23: null,
                h24: null
              }
              const targetDataForArea = result.filter((item) => item.area_text == area.name && item.zone_text == area.zone.name)
              if (targetDataForArea.length > 0) {
                let sumNomValueEachHour: Record<
                  string,
                  {
                    pointNameList: string[]
                    value: number | null
                    valueMmscfd: number | null
                    hvMutipleByValue: number | null
                    sgMutipleByValue: number | null
                    hvMutipleByValueMmscfd: number | null
                    sgMutipleByValueMmscfd: number | null
                  }
                > = {}
                let calculatedHeatingValueFromMeterEachHourAndPoint: Record<string, number | null> = {}
                let calculatedSgFromMeterEachHourAndPoint: Record<string, number | null> = {}
                targetDataForArea.map((data: any) => {
                  data.timeShow.map((timeShow: any, index: number) => {
                    const key = `${data.point}_${data.area_text}_${data.zone_text}_h${timeShow.gasHour}`
                    const tmpAreaText = data.area_text.replace('_', '(underscore)')
                    const areaKey = `${tmpAreaText}_${data.zone_text}_h${timeShow.gasHour}`


                    if (data.area_text == consoleAtArea && consoleAtHour == timeShow.gasHour) {
                    }

                    if (sumNomValueEachHour[areaKey] != undefined) {
                      if (!sumNomValueEachHour[areaKey].pointNameList.includes(data.point)) {
                        sumNomValueEachHour[areaKey].pointNameList.push(data.point)
                      }
                      if (timeShow.value != null) {
                        if(sumNomValueEachHour[areaKey].value) {
                          sumNomValueEachHour[areaKey].value = parseToNumber8Decimal(sumNomValueEachHour[areaKey].value + timeShow.value)
                        }
                        else{
                          sumNomValueEachHour[areaKey].value = timeShow.value
                        }
                      }
                      
                      if (timeShow.valueMmscfd != null) {
                        if(sumNomValueEachHour[areaKey].valueMmscfd) {
                          sumNomValueEachHour[areaKey].valueMmscfd = parseToNumber8Decimal(sumNomValueEachHour[areaKey].valueMmscfd + timeShow.valueMmscfd)
                        }
                        else{
                          sumNomValueEachHour[areaKey].valueMmscfd = timeShow.valueMmscfd
                        }
                      }
                    } else {
                      // sumNomValueEachHour[key] += timeShow.value
                      sumNomValueEachHour[areaKey] = {
                        pointNameList: [data.point],
                        value: timeShow.value,
                        valueMmscfd: timeShow.valueMmscfd,
                        hvMutipleByValue: null,
                        sgMutipleByValue: null,
                        hvMutipleByValueMmscfd: null,
                        sgMutipleByValueMmscfd: null
                      }
                    }


                    if (calculatedHeatingValueFromMeterEachHourAndPoint[key] == undefined || calculatedSgFromMeterEachHourAndPoint[key] == undefined) {
                      let currentCalculatedHeatingValueFromMeter = timeShow.calculatedHeatingValueFromMeter
                      let currentCalculatedSgFromMeter = timeShow.calculatedSgFromMeter
                      let currentGasHour = timeShow.gasHour
                      while (currentCalculatedHeatingValueFromMeter == null && currentGasHour > 0) {
                        currentGasHour = currentGasHour - 1
                        const previousTimeShow = data.timeShow.find((f: any) => f.gasHour == currentGasHour)
                        if (previousTimeShow && previousTimeShow.heatingValueFromMeter.length > 0) {
                          if (data.area_text == consoleAtArea && consoleAtHour == timeShow.gasHour) {
                          }
                          currentCalculatedHeatingValueFromMeter = previousTimeShow.calculatedHeatingValueFromMeter
                          currentCalculatedSgFromMeter = previousTimeShow.calculatedSgFromMeter
                        }
                      }

                      if (calculatedHeatingValueFromMeterEachHourAndPoint[key] == undefined && currentCalculatedHeatingValueFromMeter != null && Number.isFinite(currentCalculatedHeatingValueFromMeter)) {
                        calculatedHeatingValueFromMeterEachHourAndPoint[key] = currentCalculatedHeatingValueFromMeter
                      }

                      if (calculatedSgFromMeterEachHourAndPoint[key] == undefined && currentCalculatedSgFromMeter != null && Number.isFinite(currentCalculatedSgFromMeter)) {
                        calculatedSgFromMeterEachHourAndPoint[key] = currentCalculatedSgFromMeter
                      }
                    }

                    if (calculatedHeatingValueFromMeterEachHourAndPoint[key] != null) {
                      if (sumNomValueEachHour[areaKey].hvMutipleByValue != null) {
                        sumNomValueEachHour[areaKey].hvMutipleByValue = parseToNumber8Decimal(sumNomValueEachHour[areaKey].hvMutipleByValue + ((timeShow.value ?? 0) * calculatedHeatingValueFromMeterEachHourAndPoint[key]))
                      } else {
                        sumNomValueEachHour[areaKey].hvMutipleByValue = (timeShow.value ?? 0) * calculatedHeatingValueFromMeterEachHourAndPoint[key]
                      }

                      if (sumNomValueEachHour[areaKey].hvMutipleByValueMmscfd != null) {
                        sumNomValueEachHour[areaKey].hvMutipleByValueMmscfd = parseToNumber8Decimal(sumNomValueEachHour[areaKey].hvMutipleByValueMmscfd + ((timeShow.valueMmscfd ?? 0) * calculatedHeatingValueFromMeterEachHourAndPoint[key]))
                      } else {
                        sumNomValueEachHour[areaKey].hvMutipleByValueMmscfd = (timeShow.valueMmscfd ?? 0) * calculatedHeatingValueFromMeterEachHourAndPoint[key]
                      }
                    }
                    if (calculatedSgFromMeterEachHourAndPoint[key] != null) {
                      if (sumNomValueEachHour[areaKey].sgMutipleByValue != null) {
                        sumNomValueEachHour[areaKey].sgMutipleByValue = parseToNumber8Decimal(sumNomValueEachHour[areaKey].sgMutipleByValue + ((timeShow.value ?? 0) * calculatedSgFromMeterEachHourAndPoint[key]))
                      } else {
                        sumNomValueEachHour[areaKey].sgMutipleByValue = (timeShow.value ?? 0) * calculatedSgFromMeterEachHourAndPoint[key]
                      }

                      if (sumNomValueEachHour[areaKey].sgMutipleByValueMmscfd != null) {
                        sumNomValueEachHour[areaKey].sgMutipleByValueMmscfd = parseToNumber8Decimal(sumNomValueEachHour[areaKey].sgMutipleByValueMmscfd + ((timeShow.valueMmscfd ?? 0) * calculatedSgFromMeterEachHourAndPoint[key]))
                      } else {
                        sumNomValueEachHour[areaKey].sgMutipleByValueMmscfd = (timeShow.valueMmscfd ?? 0) * calculatedSgFromMeterEachHourAndPoint[key]
                      }
                    }

                    if (data.area_text == consoleAtArea && consoleAtHour == timeShow.gasHour) {
                    }
                  })
                })

                Object.keys(sumNomValueEachHour).forEach((key) => {
                  const [area, zone, gasHour] = key.split('_')
                  const areaText = area.replace('(underscore)', '_')
                  const sumNomValue = sumNomValueEachHour[key]


                  if (areaText == consoleAtArea && `h${consoleAtHour}` == gasHour) {
                  }
                  const hv = sumNomValue?.valueMmscfd == null ? null : (sumNomValue.hvMutipleByValueMmscfd ?? 0) / sumNomValue.valueMmscfd
                  const sg = sumNomValue?.valueMmscfd == null ? null : (sumNomValue.sgMutipleByValueMmscfd ?? 0) / sumNomValue.valueMmscfd
                  const wi = sumNomValue.sgMutipleByValueMmscfd == null || sumNomValue?.valueMmscfd == null ? null : (sumNomValue.hvMutipleByValueMmscfd ?? 0) / 0.982596 / Math.sqrt(sumNomValue.sgMutipleByValueMmscfd * sumNomValue.valueMmscfd)

                  hvObject[gasHour] = parseToNumber3Decimal(hv)
                  sgObject[gasHour] = parseToNumber4Decimal(sg)
                  wiObject[gasHour] = parseToNumber3Decimal(wi)
                })

                returnItem.push(hvObject)
                returnItem.push(wiObject)
                returnItem.push(sgObject)
              }
            })
        }

        // ไปวันก่อนหน้า
        current = current.subtract(1, 'day')
      }

      return returnItem
    } catch (error) {
      return []
    }
  }
}
