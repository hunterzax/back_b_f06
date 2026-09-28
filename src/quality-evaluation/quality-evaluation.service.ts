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
import {CapacityService} from 'src/capacity/capacity.service'
import {UploadTemplateForShipperService} from 'src/upload-template-for-shipper/upload-template-for-shipper.service'
import {MeteredMicroService} from 'src/grpc/metered-service.service'
import {getTodayEnd, getTodayEndAdd7, getTodayNow, getTodayNowAdd7, getTodayNowDDMMYYYYAdd7, getTodayStart, getTodayStartAdd7, getWeekRange, getYearEndAdd7, getYearStartAdd7} from 'src/common/utils/date.util'
import {isMatch} from 'src/common/utils/allocation.util'
import {parseToNumber, parseToNumber3Decimal, parseToNumber4Decimal} from 'src/common/utils/number.util'

import {Mutex} from 'async-mutex'
import {queryShipperNominationFilePopulate, queryShipperNominationFileWithRelations} from '@type/prisma.type'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

@Injectable()
export class QualityEvaluationService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  private readonly logger = new Logger(QualityEvaluationService.name)
  private readonly mutex = new Mutex()

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

  fn_calc_vi_all = (nomArr_: any, day_: any) => {
    const _calc_vi_all = nomArr_?.reduce((accIn, currIn) => {
      let resultIn = null
      if (currIn?.nomination_type_id === 1) {
        // day
        resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'])
      } else {
        // week
        resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[day_])
      }
      if (resultIn != null) {
        if (accIn != null) {
          return (accIn += resultIn)
        } else {
          return (accIn = resultIn)
        }
      }
      return accIn
    }, null)
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
    const vi_ = this.fn_calc_vi_all(nomArr_, day_)
    const hv_x_vi_ = this.fn_calc_hv_x_vi_all(nomArr_, day_)
    const hv_ = vi_ === 0 || vi_ == null || hv_x_vi_ == null ? null : this.normalizeNumber(hv_x_vi_ / vi_)
    return hv_
  }

  fn_sg = (nomArr_: any, day_: any) => {
    const vi_ = this.fn_calc_vi_all(nomArr_, day_)
    const sg_x_vi_ = this.fn_calc_sg_x_vi_all(nomArr_, day_)
    const sg_ = vi_ === 0 || vi_ == null || sg_x_vi_ == null ? null : this.normalizeNumber(sg_x_vi_ / vi_, 4)
    return sg_
  }

  fn_wi = (nomArr_: any, day_: any) => {
    const wi_ = this.fn_calc_hv_x_vi_all(nomArr_, day_) / 0.982596 / Math.sqrt(this.fn_calc_sg_x_vi_all(nomArr_, day_) * this.fn_calc_vi_all(nomArr_, day_))
    return wi_
  }

  async contractActiveDate(payload: any) {
    this.logger.log(`contractActiveDate called | locked=${this.mutex.isLocked()}`)

    return this.mutex.runExclusive(async () => {
      this.logger.log(`contractActiveDate start`)
      try {
        return await this.processContractActiveDate(payload)
      } catch (error) {
        this.logger.error('contractActiveDate error', error?.stack || error)
        throw error
      } finally {
        this.logger.log(`contractActiveDate end`)
      }
    })
  }

  async processContractActiveDate(payload: any) {
    const {gasDay} = payload
    const nData = gasDay ? getTodayNow(gasDay) : getTodayStart()
    const activeNominationFiles: queryShipperNominationFileWithRelations[] = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        AND: [
          // Not rejected ot cancelled
          {
            query_shipper_nomination_status: {
              id: {
                notIn: [3, 5]
              }
            }
          },
          {
            OR: [
              {
                del_flag: false
              },
              {
                del_flag: null
              }
            ]
          },
          {
            OR: [
              // Daily nominations: exact date match
              {
                nomination_type: {
                  id: 1
                },
                gas_day: {
                  gte: nData.toDate(),
                  lte: nData.endOf('day').toDate()
                }
              },
              // Weekly nominations: same week
              {
                nomination_type: {
                  id: 2
                },
                gas_day: {
                  gte: nData.startOf('week').toDate(),
                  lte: nData.endOf('week').toDate()
                }
              }
            ]
          }
        ]
      },
      ...queryShipperNominationFilePopulate
    })

    const choiceList = activeNominationFiles
      .map((nomFile, index) => {
        const contract = nomFile.contract_code
        const reserveBalancingGasContract = nomFile.reserve_balancing_gas_contract
        if (contract?.contract_code) {
          return {
            id: contract.id,
            contract_code: contract.contract_code,
            is_reserve_balancing_gas_contract: false,
            index: index
          }
        } else if (reserveBalancingGasContract?.res_bal_gas_contract) {
          return {
            id: reserveBalancingGasContract.id,
            contract_code: reserveBalancingGasContract.res_bal_gas_contract,
            is_reserve_balancing_gas_contract: true,
            index: index
          }
        } else {
          return null
        }
      })
      .filter(Boolean)

    // กำจัด record ที่ซ้ำกันใน a (เหมือนกันทั้ง id และ contract_code)
    const uniqueChoiceList = Array.from(new Map(choiceList.map((item) => [`${item.id}_${item.contract_code}`, item])).values())

    return uniqueChoiceList
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

  async processFindAll(query?: any) {
    // https://app.clickup.com/t/86etubk74
    // https://app.clickup.com/t/86etubavw
    const andInWhere: any[] = [
      {
        query_shipper_nomination_status: {
          id: {
            // in: [1, 2, 5],
            in: [2, 5]
          }
        }
      },
      {
        OR: [{del_flag: false}, {del_flag: null}]
      }
    ]
    let gasDay = query?.gasDay
    if (!!!query?.gasDay) {
      gasDay = dayjs().format('YYYY-MM-DD')
      // return {
      //   newDaily: [],
      //   newWeekly: [],
      // }
    }

    const ctQ = query?.contract_code ? query?.contract_code?.split(',').map(Number) : []
    const rbQ = query?.reserve_balancing_gas_contract ? query?.reserve_balancing_gas_contract?.split(',').map(Number) : []

    const resData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        // NOT: {
        //   contract_code_id: null
        // }, // revers bal ไม่แสดง effect
        query_shipper_nomination_status: {
          id: {
            in: [1, 2, 5]
          }
        },
        AND: [
          ...(ctQ.length > 0
            ? [
                {
                  contract_code_id: {
                    in: ctQ
                  }
                }
              ]
            : []),
          ...(rbQ.length > 0
            ? [
                {
                  reserve_balancing_gas_contract_id: {
                    in: rbQ
                  }
                }
              ]
            : []),
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
      },
      orderBy: {
        id: 'desc'
      }
    })
    console.log('resData : ', resData);
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
              reserve_balancing_gas_contract_id: e?.reserve_balancing_gas_contract_id,
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
    const newWeekly = gasdayArrWeekly.flatMap((e: any) => {
      const fil = weeklyArr.filter((f: any) => f?.gas_day_text === e)

      const areaGroupF = [...new Set(fil.map((gr: any) => gr?.nomination_row_json?.area_text))]

      const areaAll = areaGroupF.flatMap((es: any, ies: any, aes: any) => {
        const filAreaGF = fil.filter((fGf: any) => {
          return fGf?.nomination_row_json?.area_text === es
        })

        // excel  wi 11 hv 12 sg 13
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

    return {
      newDaily,
      newWeekly
    }
  }

  async findHVByDateAndArea(payload: any, userId: any) {
    const {gasDay, area} = payload
    const gasDayjs = getTodayNowDDMMYYYYAdd7(gasDay)
    const {weekStart, weekEnd} = getWeekRange(gasDayjs.toDate())
    if (!gasDayjs.isValid()) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: 'Invalid gas day format',
          error: 'Invalid gas day format'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const res = await this.findAll({
      gasDay: gasDayjs.tz('Asia/Bangkok').format('YYYY-MM-DD')
    })
    const weekStartDayjs = getTodayNowAdd7(weekStart)

    if ((!res?.newWeekly || !Array.isArray(res.newWeekly) || res.newWeekly.length < 1) && !weekStartDayjs.isSame(gasDayjs, 'day')) {
      const resForWeekly = await this.findAll({
        gasDay: weekStartDayjs.tz('Asia/Bangkok').format('YYYY-MM-DD')
      })
      if (resForWeekly?.newWeekly && Array.isArray(resForWeekly.newWeekly) && resForWeekly.newWeekly.length > 0) {
        res.newWeekly = resForWeekly && resForWeekly.newWeekly || []
      }
    }
    const hvDaily = res?.newDaily?.find((f: any) => isMatch(f?.parameter, 'HV') && isMatch(f?.area?.name, area))?.valueBtuScf
    let hvWeekly: number | null
    if (!hvDaily) {
      for (const f of res?.newWeekly) {
        if (isMatch(f?.parameter, 'HV') && isMatch(f?.area?.name, area)) {
          if (isMatch(f?.sunday?.date, gasDay)) {
            hvWeekly = f?.sunday?.value
            break
          } else if (isMatch(f?.monday?.date, gasDay)) {
            hvWeekly = f?.monday?.value
            break
          } else if (isMatch(f?.tuesday?.date, gasDay)) {
            hvWeekly = f?.tuesday?.value
            break
          } else if (isMatch(f?.wednesday?.date, gasDay)) {
            hvWeekly = f?.wednesday?.value
            break
          } else if (isMatch(f?.thursday?.date, gasDay)) {
            hvWeekly = f?.thursday?.value
            break
          } else if (isMatch(f?.friday?.date, gasDay)) {
            hvWeekly = f?.friday?.value
            break
          } else if (isMatch(f?.saturday?.date, gasDay)) {
            hvWeekly = f?.saturday?.value
            break
          }
        }
      }
    }

    const hv = hvDaily || hvWeekly
    if (!hv) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: 'HV not found.',
          error: 'HV not found.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return hv
  }
}
