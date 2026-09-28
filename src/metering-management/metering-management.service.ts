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
import {MeteredMicroService} from 'src/grpc/metered-service.service'
import {getTodayEndAdd7, getTodayEndYYYYMMDDDfaultAdd7, getTodayNow, getTodayNowAdd7, getTodayNowYYYYMMDDDfaultAdd7, getTodayStartAdd7, getTodayStartYYYYMMDDDfaultAdd7} from 'src/common/utils/date.util'
import {AstosService} from 'src/astos/astos.service'
import {buildActiveDataForDates, isMatch} from 'src/common/utils/allocation.util'
import {middleNotiInapp} from 'src/common/utils/inapp.util'
import {Prisma} from '@prisma/client'
import {getTimestampValue} from 'src/common/utils/balancing.util'
import {parseToNumber} from 'src/common/utils/number.util'
import {shareShipper} from 'src/common/utils/meter.util'
import {activeData, conceptPointPopulate, conceptPointWithRelations, meteringPointPopulate, meteringPointWithRelations} from '@type/prisma.type'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

@Injectable()
export class MeteringManagementService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly meteredMicroService: MeteredMicroService
    // private readonly astosService: AstosService,
  ) {}

  async allId() {
    const resData = await this.prisma.metered_run_number.findMany({
      orderBy: {
        id: 'desc'
      }
    })
    return resData
  }

  async retrievingNumber() {
    const resData = await this.prisma.metered_run_number.findMany({
      orderBy: {
        id: 'asc'
      }
    })
    return resData
  }

  async meteredMasterAll(start_date?: any, end_date?: any): Promise<meteringPointWithRelations[]> {
    const todayStart = start_date ? getTodayStartYYYYMMDDDfaultAdd7(start_date).toDate() : getTodayStartAdd7().toDate()
    const todayEnd = end_date ? getTodayEndYYYYMMDDDfaultAdd7(end_date).toDate() : getTodayEndAdd7().toDate()
    const resData: meteringPointWithRelations[] = await this.prisma.metering_point.findMany({
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
      orderBy: {
        id: 'desc'
      },
      ...meteringPointPopulate
    })
    return resData
  }

  // async meteredCompare(master:any, meter:any){

  //   let dataResult = []
  //   for (let i = 0; i < master.length; i++) {
  //     const findMeter = meter?.data?.find((f:any) => { return f?.meteringPointId === master[i]?.metered_point_name })
  //     if(findMeter){

  //       const area = !!master[i]?.non_tpa_point ? master[i]?.non_tpa_point?.nomination_point?.contract_point?.area : master[i]?.nomination_point?.contract_point?.area
  //       const zone = !!master[i]?.non_tpa_point ? master[i]?.non_tpa_point?.nomination_point?.contract_point?.zone : master[i]?.nomination_point?.contract_point?.zone
  //       const customer_type = !!master[i]?.non_tpa_point ? master[i]?.non_tpa_point?.nomination_point?.customer_type : master[i]?.nomination_point?.customer_type
  //       dataResult.push({id: i + 1, ...findMeter, prop:{ area:area, zone:zone, customer_type:customer_type }})
  //     }
  //   }

  //   return dataResult
  // }
  async meteredCompare(master: any, meter: any, gasDay?: string, concpetPointList?: any[]) {
    let dataResult = []
    if (Array.isArray(meter)) {
      if (!concpetPointList || concpetPointList.length === 0) {
        const conceptPoint = await this.prisma.concept_point.findMany({
          where: {
            type_concept_point_id: 4
          }
        })

        let mConcpetPoint = conceptPoint.map((e: any) => {
          return {
            metered_point_name: e?.concept_point
          }
        })

        master = [...master, ...mConcpetPoint]
      } else {
        const mConcpetPoint = concpetPointList.map((e: any) => {
          return {
            metered_point_name: e?.concept_point
          }
        })

        master = [...master, ...mConcpetPoint]
      }

      for (let i = 0; i < master.length; i++) {
        const findMeter = meter?.filter((f: any) => f?.meteringPointId === master[i]?.metered_point_name && (gasDay ? f?.gasDay === gasDay : true)) || []
        if (findMeter.length > 0) {
          for (let iM = 0; iM < findMeter.length; iM++) {
            const contractPoints = !!master[i]?.non_tpa_point ? master[i]?.non_tpa_point?.nomination_point?.contract_point_list : master[i]?.nomination_point?.contract_point_list

            const firstContractPoint = contractPoints?.[0] || {}
            const area = firstContractPoint?.area || master[i]?.area || null
            const zone = firstContractPoint?.zone || master[i]?.zone || null
            // const customer_type = !!master[i]?.non_tpa_point
            //   ? master[i]?.non_tpa_point?.nomination_point?.customer_type
            //   : master[i]?.nomination_point?.customer_type;
            const nomination_point_customer_type = master[i]?.nomination_point?.customer_type || master[i]?.non_tpa_point?.nomination_point?.customer_type
            const customer_type = master[i]?.customer_type || nomination_point_customer_type

            dataResult.push({
              id: i + 1 + iM + 1,
              ...findMeter[iM],
              prop: {
                area: area,
                zone: zone,
                customer_type: customer_type,
                nomination_point_customer_type
              }
            })
          }
        }

        //
      }
    }

    return dataResult
  }

  async meteringRetrievingLimit(limit: number = 100, offset: number = 0, startDate?: any, endDate?: any, metered_run_number_id?: any) {
    const page_ = offset
    let limit_ = limit
    let total = 0
    const offset_ = page_ * limit_

    //     const page = 701;
    // const limit = 10;
    // const offset = (page - 1) * limit;
    //

    // const records = metered_run_number_id ? await this.prisma.metered_retrieving.findMany({
    //   where: {
    //     del_flag: null,
    //     type: 'retrieving',
    //     metered_run_number_id: Number(metered_run_number_id),
    //     // gas_day: { gte: dayjs(startDate, "YYYY-MM-DD").toDate(), lte: dayjs(endDate, "YYYY-MM-DD").toDate() }
    //   },
    //   orderBy: { id: 'desc' },
    //   skip: Number(offset_),
    //   take: Number(limit_),
    //   select: { id: true },  // ดึง id พอ
    // }) : await this.prisma.metered_retrieving.findMany({
    //   where: {
    //     del_flag: null,
    //     type: 'retrieving',
    //     // gas_day: { gte: dayjs(startDate, "YYYY-MM-DD").toDate(), lte: dayjs(endDate, "YYYY-MM-DD").toDate() }
    //   },
    //   orderBy: { id: 'desc' },
    //   skip: Number(offset_),
    //   take: Number(limit_),
    //   select: { id: true },  // ดึง id พอ
    // });

    let andWhere: Prisma.metered_retrievingWhereInput[] = [
      {
        del_flag: null
      },
      {
        type: 'retrieving'
      }
    ]

    if (metered_run_number_id) {
      andWhere.push({
        metered_run_number_id: Number(metered_run_number_id)
      })
    }

    const start = getTodayStartYYYYMMDDDfaultAdd7(startDate) // dayjs(startDate, 'YYYY-MM-DD')
    const end = getTodayEndYYYYMMDDDfaultAdd7(endDate) // dayjs(endDate, 'YYYY-MM-DD')
    if (start.isValid() || end.isValid()) {
      if (start.isValid()) {
        andWhere.push({
          timestamp: {
            // gas_day: {
            gte: start.toDate()
          }
        })
      }
      if (end.isValid()) {
        andWhere.push({
          timestamp: {
            // gas_day: {
            lte: end.toDate()
          }
        })
      }
    }
    total = await this.prisma.metered_retrieving.count({
      where: {
        AND: andWhere
      }
    })
    if (limit == 40000 && offset == 0) {
      limit_ = total
    }

    // 1. Query ข้อมูลหลัก
    const resData = await this.prisma.metered_retrieving.findMany({
      where: {
        AND: andWhere
      },
      include: {
        metered_run_number: true
      },
      orderBy: {
        id: 'desc'
      },
      skip: Number(offset_),
      take: Number(limit_)
    })

    const masterMeterInDam = await this.prisma.metering_point.findMany({
      where: {
        start_date: {
          gte: start.toDate()
        },
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              lte: end.toDate()
            }
          }
        ]
      }
    })

    const masterConceptPointInDam = await this.prisma.concept_point.findMany({
      where: {
        type_concept_point_id: 4, //Metering Physical gas concept
        start_date: {
          gte: start.toDate()
        },
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              lte: end.toDate()
            }
          }
        ]
      }
    })

    // const map_name_in_dam = masterMeterInDam?.map((item: any) => item.metered_point_name)

    // เอา data_for_filter เทียบชื่อกับ dam ถ้ามีเอาออก
    // หาคำ contain ถ้ามี เอาออก “The point (ชื่อ Meter Point) does not exist in TPA system or is not valid”

    // const query_only_not_in_dam = resData?.filter((item: any) => !(map_name_in_dam.includes(item.metering_point_sys) && `${item?.description}`.trim().includes('does not exist in TPA system or is not valid'.trim())))

    // เทียบช่วง masterMeterInDam.start_date = Sat Nov 01 2025 00:00:00 GMT+0700 (Indochina Time)
    // เทียบช่วง masterMeterInDam.end_date = อาจจะ null ก็ได้
    // ว่า item.gas_day อยู่ในช่วง masterMeterInDam.start_date และ masterMeterInDam.end_date หรือไม่ ถ้า masterMeterInDam.end_date เป็น null ก็ดูแค่ start_date พอ

    const inRangeByMaster = (itemDateStr: string, dam: any) => {
      const d = dayjs(itemDateStr) // เช่น "2025-12-01"
      const start = dayjs(dam?.start_date) // เช่น Date/ISO
      if (!d.isValid() || !start.isValid()) return false

      const end = dam?.end_date ? dayjs(dam.end_date) : null

      // ถ้ามี end_date: start <= d <= end
      // ถ้าไม่มี end_date: d >= start
      return end ? d.isSameOrAfter(start, 'day') && d.isSameOrBefore(end, 'day') : d.isSameOrAfter(start, 'day')
    }

    const query_only_not_in_dam = (resData ?? []).filter((item: any) => {
      const matchedByNameAndDate = (masterMeterInDam ?? []).some((m: any) => m?.metered_point_name === item?.metering_point_sys && inRangeByMaster(item?.timestamp, m)) //inRangeByMaster(item?.gas_day, m))

      const matchedByNameAndDateConceptPoint = (masterConceptPointInDam ?? []).some((m: any) => m?.concept_point === item?.metering_point_sys && inRangeByMaster(item?.timestamp, m)) //inRangeByMaster(item?.gas_day, m))

      const hasMissingMsg = String(item?.description ?? '').includes('does not retrieved Metering data')

      // ตัดออกเมื่อ "ชื่อจุดตรง + วันที่อยู่ในช่วง" และ "มีข้อความ does not retrieved Metering data"
      return !((matchedByNameAndDate || matchedByNameAndDateConceptPoint) && hasMissingMsg)
    })

    // Error Description ใน Meter Retriving
    // 1. Meter มีในระบบ แต่ไม่มี Energy “The point (ชื่อ Meter Point) does not retrieved Metering data”
    // 2. Meter ไม่มีในระบบ มี Energy “The point (ชื่อ Meter Point) does not exist in TPA system or is not valid”

    // เงื่อนไขคือ
    // ตอนเข้ามาที่หน้านี้จะไม่มีข้อมูลใน Table แสดงเลย ต้อง Filter From-To ก่อน เพื่อตรวจสอบว่ามี Point ไหนบ้างที่มีอยู่ในระบบเรา แล้วยังไม่ได้รับค่าจากแหล่งใดๆเลย (ค่า Energy) (ตรวจสอบตาม Generated From - To) ถ้าพบว่าวันใดวันหนึ่งของช่วงที่ filter  Point นั้นมี energy ถูกส่งมา ก็ไม่ต้องแสดงข้อมูลที่หน้านี้
    // เช่น Filter From : 1/10/2025 , To : 30/10/2025
    // หากระบบตรวจสอบพบว่า Meter Point ABC มีค่า Energy เข้ามาแค่วันที่ 5/10/2025 วันเดียว ระบบก็ไม่ต้องแสดงข้อมูลของ Point ABC ที่หน้านี้เลย

    // STEP 1. กรองกับ masterMeterInDam
    const dataTypeDataCheck = await this.prisma.metered_retrieving.findMany({
      where: {
        type: 'mastering data check',
        del_flag: true,
        timestamp: {
          // gas_day: {
          gte: start.toDate(),
          lte: end.toDate()
        }
      },
      include: {
        metered_run_number: true
      },
      orderBy: {
        id: 'desc'
      }
    })

    const filter_ = query_only_not_in_dam?.filter(
      // (item: any) => !(dataTypeDataCheck.some((dataCheckItem: any) => dataCheckItem.metering_point_sys == item.metering_point_sys && item.gas_day == dataCheckItem.gas_day) && `${item?.description}`.trim().includes('does not retrieved Metering data'.trim()))
      (item: any) => !(dataTypeDataCheck.some((dataCheckItem: any) => dataCheckItem.metering_point_sys == item.metering_point_sys && item.timestamp == dataCheckItem.timestamp) && `${item?.description}`.trim().includes('does not retrieved Metering data'.trim()))
    )

    // const resData = metered_run_number_id ? await this.prisma.metered_retrieving.findMany({
    //   where: {
    //     // id: { in: records.map(r => r.id) },
    //     metered_run_number_id: Number(metered_run_number_id),
    //     del_flag: null,
    //     type: 'retrieving',
    //     // gas_day: { gte: dayjs(startDate, "YYYY-MM-DD").toDate(), lte: dayjs(endDate, "YYYY-MM-DD").toDate() }
    //   },
    //   include: { metered_run_number: true },
    //   orderBy: { id: 'desc' },
    //   skip: Number(offset_),
    //   take: Number(limit_),

    // }) : await this.prisma.metered_retrieving.findMany({
    //   where: {
    //     // id: { in: records.map(r => r.id) },
    //     del_flag: null,
    //     type: 'retrieving',
    //     // gas_day: { gte: dayjs(startDate, "YYYY-MM-DD").toDate(), lte: dayjs(endDate, "YYYY-MM-DD").toDate() }
    //   },
    //   include: { metered_run_number: true },
    //   orderBy: { id: 'desc' },
    //   skip: Number(offset_),
    //   take: Number(limit_),

    // });

    // "gasDay": "2025-06-27",

    // 2. Query นับ total

    // 3. Process data
    // ออกไป meter retriving
    // const newResData = resData.map((e: any) => { // เดิมโรงงาน
    const newResData = filter_?.map((e: any) => {
      e['data'] = (!!e['temp'] && JSON.parse(e['temp'])) || null
      e['gasDay'] = e['data']?.['gasDay'] || null
      const {temp, ...nE} = e
      return {...nE}
    })

    // startDate?: any,
    // endDate?: any,

    // const total = metered_run_number_id ? await this.prisma.metered_retrieving.count({
    //   where: {
    //     del_flag: null, type: 'retrieving', metered_run_number_id: Number(metered_run_number_id),
    //     // gas_day: { gte: dayjs(startDate, "YYYY-MM-DD").toDate(), lte: dayjs(endDate, "YYYY-MM-DD").toDate() }
    //   },
    // }) : await this.prisma.metered_retrieving.count({
    //   where: {
    //     del_flag: null, type: 'retrieving',
    //     // gas_day: { gte: dayjs(startDate, "YYYY-MM-DD").toDate(), lte: dayjs(endDate, "YYYY-MM-DD").toDate() }
    //   },
    // });

    // 4. Return แบบรองรับ frontend
    return {
      total: total,
      // data: filteredStartEnd,
      data: newResData,
      limit: Number(limit),
      offset: Number(offset)
    }
  }

  async meteringRetrievingMasterCheckLimit(limit: number = 100, offset: number = 0, metered_run_number_id?: any) {
    // 1. Query ข้อมูลหลัก
    const resData = metered_run_number_id
      ? await this.prisma.metered_retrieving.findMany({
          where: {
            del_flag: null,
            type: 'mastering data check',
            metered_run_number_id: Number(metered_run_number_id)
          },
          include: {
            metered_run_number: true
          },
          orderBy: {
            id: 'desc'
          },
          skip: Number(offset),
          take: Number(limit)
        })
      : await this.prisma.metered_retrieving.findMany({
          where: {
            del_flag: null,
            type: 'mastering data check'
          },
          include: {
            metered_run_number: true
          },
          orderBy: {
            id: 'desc'
          },
          skip: Number(offset),
          take: Number(limit)
        })

    // 2. Query นับ total
    const total = metered_run_number_id
      ? await this.prisma.metered_retrieving.count({
          where: {
            del_flag: null,
            type: 'mastering data check',
            metered_run_number_id: Number(metered_run_number_id)
          }
        })
      : await this.prisma.metered_retrieving.count({
          where: {
            del_flag: null,
            type: 'mastering data check'
          }
        })

    // 3. Process data
    const newResData = resData.map((e: any) => {
      e['data'] = (!!e['temp'] && JSON.parse(e['temp'])) || null
      delete e['temp']
      return {...e}
    })

    // 4. Return แบบรองรับ frontend
    return {
      total,
      data: newResData,
      limit: Number(limit),
      offset: Number(offset)
    }
  }

  async meteringRetrieving() {
    const resData = await this.prisma.metered_retrieving.findMany({
      where: {
        del_flag: null
      },
      include: {
        metered_run_number: true
      },
      orderBy: {
        id: 'desc'
      }
      // skip: offset,
      // take: limit,
    })

    const newResData = resData.map((e: any) => {
      e['data'] = (!!e['temp'] && JSON.parse(e['temp'])) || null
      delete e['temp']
      return {...e}
    })

    return newResData
  }

  async lastRetrieving() {
    const resData = await this.prisma.metered_run_number.findFirst({
      orderBy: {
        id: 'desc'
      }
    })
    return resData
  }

  async checkData() {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const meteredMaster = await this.prisma.metering_point.findMany({
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
      select: {
        metered_point_name: true
      },
      orderBy: {
        id: 'desc'
      }
    })

    const resData = await this.prisma.metered_retrieving.findMany({
      where: {
        del_flag: null,
        type: 'mastering data check'
      },
      select: {
        id: true,
        metering_point_sys: true
      },
      orderBy: {
        id: 'desc'
      }
    })
    let dataSet: any = []
    for (let i = 0; i < resData.length; i++) {
      const find = meteredMaster.find((f: any) => {
        return f?.metered_point_name === resData[i]?.metering_point_sys
      })
      if (find) {
        dataSet.push(resData[i]?.id)
      }
    }
    if (dataSet.length > 0) {
      await this.prisma.metered_retrieving.updateMany({
        where: {
          id: {
            in: dataSet
          }
        },
        data: {
          del_flag: true
        }
      })
    }

    return {
      count: dataSet.length
    }
  }

  async getDataLogicNoCondept(query: any, isReplaceMissingMeterWithNomination?: boolean) {
    console.time('getDataLogicNoCondept')
    const {share, start_date, end_date} = query

    let activeData: any[] | undefined = undefined
    if (isReplaceMissingMeterWithNomination) {
      try {
        // Extract gas days and generate date array
        const getMeterFrom = getTodayNow(start_date)
        const getMeterTo = getTodayNow(end_date)
        const dateArray: string[] = []
        // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
        let current = getMeterFrom.clone()
        while (current.isSameOrBefore(getMeterTo, 'day')) {
          dateArray.push((current && current.format('YYYY-MM-DD')) || dayjs().format('YYYY-MM-DD'))
          current = current.add(1, 'day')
        }
        // Build active data for all dates
        activeData = await buildActiveDataForDates(dateArray, this.prisma)
      } catch (error) {
        activeData = undefined
      }
    }

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'getLast',
        mode: 'metering',
        start_date: start_date,
        end_date: end_date
      }),
      isReplaceMissingMeterWithNomination && activeData
        ? {
            activeData: activeData,
            prisma: this.prisma
          }
        : undefined
    )
    console.timeEnd('getDataLogicNoCondept')
    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null
    const meteredPoint: meteringPointWithRelations[] = await this.meteredMasterAll(start_date, end_date)

    const start = start_date ? getTodayStartYYYYMMDDDfaultAdd7(start_date) : getTodayStartAdd7()
    const end = end_date ? getTodayEndYYYYMMDDDfaultAdd7(end_date) : getTodayEndAdd7()
    const ckShare = share === 'on' || share == true ? await shareShipper(meteredPoint, this.prisma, start, end) : meteredPoint

    return {
      meterNom: ckShare,
      meter: dataConvert
    }
  }

  async getRetrievingID(query: any, userId: any) {
    const {start_date, end_date} = query

    const startDate = getTodayNowYYYYMMDDDfaultAdd7(start_date)
    const endDate = getTodayNowYYYYMMDDDfaultAdd7(end_date)
    if (!startDate.isValid() || !endDate.isValid()) {
      throw new Error('⛔ Invalid date format')
    }
    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'get-retrieving-id',
        mode: 'metering',
        start_date: start_date,
        end_date: end_date
      })
    )
    const reply = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    return reply
  }

  async getDataByRetrievingID(query: any, isReplaceMissingMeterWithNomination?: boolean, userId?: any) {
    const {share, metering_retrieving_id} = query

    let activeData: activeData[] | undefined = undefined
    const payload = JSON.stringify({
      case: 'get-metering-by-retrieving-id',
      mode: 'metering',
      metering_retrieving_id: metering_retrieving_id
    })

    const meteredMicroData = await this.meteredMicroService.sendMessage(payload)

    let dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    const dateArray: string[] = Array.from(new Set(dataConvert?.map((item: any) => String(item.gasDay)) || []))

    if (isReplaceMissingMeterWithNomination) {
      try {
        // Build active data for all dates
        activeData = await buildActiveDataForDates(dateArray, this.prisma, userId)
        if (meteredMicroData) {
          const meteredMicroDataReplaceMissingMeterWithNomination = await this.meteredMicroService.replaceMissingMeterWithNomination(
            payload,
            activeData
              ? {
                  activeData: activeData,
                  prisma: this.prisma
                }
              : undefined,
            meteredMicroData
          )

          dataConvert = (!!meteredMicroDataReplaceMissingMeterWithNomination?.reply && JSON.parse(meteredMicroDataReplaceMissingMeterWithNomination?.reply)) || null
        }
      } catch (error) {
        activeData = undefined
      }
    }

    // return dataConvert
    const compareMeterEachDay = await Promise.all(
      dateArray.map(async (date) => {
        // Find active data for this gas_day
        const activeDataForDate = activeData?.find((ad) => ad.date === date)
        if (activeDataForDate) {
          const meteredPoint = activeDataForDate?.activeMeteringPoints || []
          const conceptPointList = activeDataForDate?.activeConceptPoints || []

          const ckShare = share === 'on' ? await shareShipper(meteredPoint, this.prisma, null, null) : meteredPoint

          const compareMeter = await this.meteredCompare(ckShare, dataConvert, date, conceptPointList) // ignoreConcpetPoint ไปก่อนจนกว่าจะทำข้อที่ให้ปรับ concpet point ใหม่
          return compareMeter
        }
      })
    )
    return compareMeterEachDay.flat()
  }

  async getDataLogicOLD(query: any, isReplaceMissingMeterWithNomination?: boolean, userId?: any) {
    const {share, start_date, end_date} = query

    const start = start_date ? getTodayStartYYYYMMDDDfaultAdd7(start_date) : getTodayStartAdd7()
    const end = end_date ? getTodayEndYYYYMMDDDfaultAdd7(end_date) : getTodayEndAdd7()
    let activeData: activeData[] | undefined = undefined
    const dateArray: string[] = []
    if (isReplaceMissingMeterWithNomination) {
      try {
        // Extract gas days and generate date array
        const getMeterFrom = getTodayNow(start_date)
        const getMeterTo = getTodayNow(end_date)
        // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
        let current = getMeterFrom.clone()
        while (current.isSameOrBefore(getMeterTo, 'day')) {
          dateArray.push((current && current.format('YYYY-MM-DD')) || dayjs().format('YYYY-MM-DD'))
          current = current.add(1, 'day')
        }
        // Build active data for all dates
        activeData = await buildActiveDataForDates(dateArray, this.prisma, userId)
      } catch (error) {
        activeData = undefined
      }
    }

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'get-last-have-value',
        // mode: 'metering',
        mode: 'metering',
        start_date: start_date,
        end_date: end_date
        // start_date: "2025-03-08",
        // end_date:"2025-03-10"
      }),
      isReplaceMissingMeterWithNomination && activeData
        ? {
            activeData: activeData,
            prisma: this.prisma
          }
        : undefined
    )

    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    // return dataConvert
    const compareMeterEachDay = await Promise.all(
      dateArray.map(async (date) => {
        // Find active data for this gas_day
        const activeDataForDate = activeData?.find((ad) => ad.date === date)
        if (activeDataForDate) {
          const meteredPoint = activeDataForDate?.activeMeteringPoints || []
          const conceptPointList = activeDataForDate?.activeConceptPoints || []
          const ckShare = share === 'on' ? await shareShipper(meteredPoint, this.prisma, start, end) : meteredPoint
          // console.log('ckShare : ', ckShare);
          const compareMeter = await this.meteredCompare(ckShare, dataConvert, date, conceptPointList) // ignoreConcpetPoint ไปก่อนจนกว่าจะทำข้อที่ให้ปรับ concpet point ใหม่
          // console.log('compareMeter : ', compareMeter);
          return compareMeter
        }
      })
    )
    const result_ = compareMeterEachDay.flat()

    if (userId) {
      const userType = await this.prisma.user_type.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(userId)
            }
          }
        }
      })
      if (userType?.id === 3) {
        const group_ = await this.prisma.group.findFirst({
          where: {
            account_manage: {
              some: {
                account_id: Number(userId)
              }
            }
          },
          include: {
            shipper_contract_point: {
              include: {
                contract_point: {
                  include: {
                    nomination_point_list: {
                      include: {
                        metering_point: true
                      }
                    }
                  }
                }
              }
            }
          }
        })
        const contractCode = await this.prisma.contract_code.findMany({
          where: {
            AND: [
              {
                group_id: group_?.id
              },
              {
                contract_start_date: {
                  lte: end.toDate()
                }
              }, // Started before or on target date
              // Not rejected
              {
                status_capacity_request_management: {
                  NOT: {
                    name: {
                      equals: 'Rejected',
                      mode: 'insensitive'
                    }
                  }
                }
              },
              // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
              {
                OR: [
                  {
                    terminate_date: null
                  }, // No terminate date
                  {
                    terminate_date: {
                      gt: start.toDate()
                    }
                  } // Terminate date is after target date
                ]
              },
              // Use extend_deadline if available, otherwise use contract_end_date
              {
                OR: [
                  // If extend_deadline exists, use it as end date
                  {
                    AND: [
                      {
                        extend_deadline: {
                          not: null
                        }
                      },
                      {
                        extend_deadline: {
                          gt: start.toDate()
                        }
                      }
                    ]
                  },
                  // If extend_deadline is null, use contract_end_date
                  {
                    AND: [
                      {
                        extend_deadline: null
                      },
                      {
                        OR: [
                          {
                            contract_end_date: null
                          },
                          {
                            contract_end_date: {
                              gt: start.toDate()
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          select: {
            id: true,
            contract_code: true,
            contract_start_date: true,
            contract_end_date: true,
            terminate_date: true,
            extend_deadline: true,
            booking_version: {
              include: {
                booking_row_json: {
                  select: {
                    contract_point: true
                  }
                }
              },
              where: {
                flag_use: true
              }
            }
          }
        })
        const reserveBalancingGasContract = await this.prisma.reserve_balancing_gas_contract.findMany({
          where: {
            group_id: group_?.id,
            reserve_balancing_gas_contract_detail: {
              some: {
                start_date: {
                  lte: end.toDate()
                },
                OR: [
                  {
                    end_date: null
                  },
                  {
                    end_date: {
                      gt: start.toDate()
                    }
                  }
                ]
              }
            }
          },
          include: {
            reserve_balancing_gas_contract_detail: {
              include: {
                nomination_point: true
              }
            }
          }
        })

        const orInWhereContractPoint: Prisma.contract_pointWhereInput[] = []
        console.log('contractCode : ', contractCode)
        const contract_point_contractSE = contractCode?.flatMap((fm) => {
          return fm?.booking_version?.flatMap((fm_v: any) => {
            return fm_v?.booking_row_json?.flatMap((fm_r: any) => {
              orInWhereContractPoint.push({
                AND: [
                  {
                    contract_point: fm_r?.contract_point
                  },
                  {
                    contract_point_start_date: {lte: fm?.terminate_date || fm?.extend_deadline || fm?.contract_end_date}
                  },
                  {
                    OR: [{contract_point_end_date: null}, {contract_point_end_date: {gt: fm?.contract_start_date}}]
                  }
                ]
              })
              return {
                contract_start_date: fm?.contract_start_date,
                contract_end_date: fm?.terminate_date || fm?.extend_deadline || fm?.contract_end_date,
                contract_point: fm_r?.contract_point
              }
            })
          })
        })
        console.log('orInWhereContractPoint : ', orInWhereContractPoint)
        const contractPointList = await this.prisma.contract_point.findMany({
          where: {
            OR: orInWhereContractPoint
          },
          include: {
            nomination_point_list: {
              include: {
                metering_point: true,
                non_tpa_point: {
                  include: {
                    metering_point: true
                  }
                }
              }
            }
          }
        })

        const orInWhereNominationPoint: Prisma.nomination_pointWhereInput[] = []
        const contractPointReserveBalancingGasContractSE = reserveBalancingGasContract?.flatMap((fm) => {
          fm.reserve_balancing_gas_contract_detail.map((fm_r) => {
            orInWhereNominationPoint.push({
              AND: [
                {
                  nomination_point: fm_r?.nomination_point?.nomination_point
                },
                {
                  start_date: {lte: fm_r?.end_date}
                },
                {
                  OR: [{end_date: null}, {end_date: {gt: fm_r?.start_date}}]
                }
              ]
            })
            return {
              start_date: fm_r?.start_date,
              end_date: fm_r?.end_date,
              nomination_point: fm_r?.nomination_point
            }
          })
        })
        // console.log('orInWhereNominationPoint : ', orInWhereNominationPoint);
        const nominationPointList = await this.prisma.nomination_point.findMany({
          where: {
            OR: orInWhereNominationPoint
          },
          include: {
            metering_point: true,
            non_tpa_point: {
              include: {
                metering_point: true
              }
            }
          }
        })
        const nominationPointList_ = await this.prisma.nomination_point.findMany({
          where: {},
          include: {
            contract_point_list: {
              select: {
                contract_point: true
              }
            },
            metering_point: true,
            non_tpa_point: {
              include: {
                metering_point: true
              }
            }
          }
        })
        const meterPointList_ = await this.prisma.metering_point.findMany({
          where: {},
          include: {
            nomination_point: {
              select: {
                nomination_point: true
              }
            }
          }
        })

        // // console.log('group_ : ', group_);
        // const startDate = getTodayStartAdd7(start_date == 'undefined' ? undefined : start_date)
        // const endDate = getTodayEndAdd7(end_date == 'undefined' ? undefined : end_date)
        // const metering_point_name = await this.prisma.metering_point.findMany({
        //     where: {
        //       AND: [
        //         {
        //           start_date: {
        //             lte: endDate.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
        //           }
        //         },
        //         {
        //           OR: [
        //             {
        //               end_date: null
        //             }, // ถ้า end_date เป็น null
        //             {
        //               end_date: {
        //                 gt: startDate.toDate()
        //               }
        //             } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
        //           ]
        //         }
        //       ]
        //     },
        //     include: {
        //       // point_type: true,
        //       // entry_exit: true,
        //       // customer_type: true,
        //       // zone: true,
        //       // area: true,
        //       non_tpa_point: true,
        //       nomination_point: true,
        //     },
        //     orderBy: {
        //       id: 'desc'
        //     }
        //   })

        //   // nomination_point?.nomination_point

        //   // metered_point_name

        //   // console.log('metering_point_name : ', metering_point_name);

        // // metering_point
        // // https://app.clickup.com/t/86euzxxpk
        // const metered_point_nom_ = group_?.shipper_contract_point?.flatMap((fm:any) => {
        //   return fm?.contract_point?.nomination_point_list?.flatMap((fm_:any) => {
        //     const mtName = fm_?.metering_point?.map((e:any) => e?.metered_point_name)
        //     // mtName
        //     const fMt = metering_point_name?.filter((f:any) => f?.nomination_point?.nomination_point === fm_?.nomination_point)
        //     return {
        //       metering_point: mtName?.length > 0 ? mtName : fMt?.map((e:any) => e?.metered_point_name),
        //       nomination_point: fm_?.nomination_point,
        //       contract_point: fm?.contract_point?.contract_point
        //     }
        //   })
        // })?.filter((f:any) => contract_point_contractSE?.map((cp:any) => cp?.contract_point)?.includes(f?.contract_point))

        // const metered_point_nom_se = metered_point_nom_?.map((e:any) => {
        //   const contractCodeSE = contract_point_contractSE?.filter((f:any) => f?.contract_point === e?.contract_point)
        //   return {
        //     ...e,
        //     contractCodeSE: contractCodeSE || []
        //   }
        // })

        // const newresult_ = result_?.filter((f:any) => {
        //   const meteringPointId = metered_point_nom_se?.filter((m_:any) => m_?.metering_point?.includes(f?.meteringPointId) )
        //   if(meteringPointId?.length > 0){
        //     const seDate = meteringPointId?.flatMap((fm:any) => {
        //       return fm?.contractCodeSE?.map((ccSE:any) => {
        //         return {
        //           contract_start_date: ccSE?.contract_start_date,
        //           contract_end_date: ccSE?.contract_end_date,
        //         }
        //       })
        //     })
        //     const minStartDate: dayjs.Dayjs = seDate?.reduce((min: dayjs.Dayjs, item: any) => {
        //       return dayjs(item.contract_start_date).isBefore(min)
        //         ? dayjs(item.contract_start_date)
        //         : min;
        //     }, dayjs(seDate?.[0].contract_start_date) as dayjs.Dayjs);

        //     const maxEndDate: dayjs.Dayjs = seDate?.reduce((max: dayjs.Dayjs, item: any) => {
        //       return dayjs(item.contract_end_date).isAfter(max)
        //         ? dayjs(item.contract_end_date)
        //         : max;
        //     }, dayjs(seDate?.[0].contract_end_date) as dayjs.Dayjs);

        //     const gasDay = dayjs(f?.gasDay)

        //     const inRange = gasDay.isSameOrAfter(minStartDate) && gasDay.isBefore(maxEndDate)

        //     return inRange

        //     // const rangDate = [dayjs(minStartDate).format("YYYY-MM-DD"),dayjs(maxEndDate).format("YYYY-MM-DD")]

        //     // return  (
        //     //   rangDate?.includes(f?.gasDay)
        //     // )
        //   }else{
        //     return false
        //   }
        // })

        // console.log('metered_point_nom_se : ', metered_point_nom_se);
        // console.log('metered_point_nom_ : ', metered_point_nom_);
        // console.log('result_ : ', result_);
        // console.log('newresult_ : ', newresult_);

        // กรอง result_ ให้เหลือเฉพาะแถว meter ที่มี metering point ที่ยัง active ตาม gasDay
        // โดยเช็คเส้นทาง: contract_point → nomination_point → (metering_point โดยตรง หรือผ่าน non_tpa_point)
        // ถ้า gasDay ไม่ valid จะถือว่าอยู่ในช่วง (isInRange = true) เพื่อไม่ตัดข้อมูลทิ้งโดยไม่จำเป็น
        // console.log('result_ : ', result_);
        // console.log('contractPointList : ', contractPointList);
        // console.log('nominationPointList : ', nominationPointList);
        // console.log('nominationPointList_ : ', nominationPointList_);
        // console.log('[LMPT1] nominationPointList_ : ', nominationPointList_?.filter((f:any) => f?.nomination_point === "LMPT1"));
        // console.log('meterPointList_ : ', meterPointList_);
        const currentDate = dayjs()
        // nomination_point: 'LMPT1'
        const newresult_ = result_?.filter((f: any) => {
          const meterGasday = dayjs(f?.gasDay)
          // มีอย่างน้อย 1 contract_point ที่ผูก meter นี้ได้ในช่วงวันที่ที่เกี่ยวข้อง
          const isHaveActiveMeterFromContract = contractPointList.some((contractPoint) => {
            const isContractPointHaveMeter = contractPoint.nomination_point_list.some((nomination_point_) => {
              // const nomination_point = nomination_point_ // relate จะไม่เจอติด period id
              const nomination_pointN = nominationPointList_?.filter((f: any) => f?.contract_point_list?.map((cpl: any) => cpl?.contract_point)?.includes(contractPoint?.contract_point))
              const nomination_point = nomination_pointN.find((item: any) => {
                const startDate = dayjs(item.start_date)
                const endDate = item.end_date ? dayjs(item.end_date) : null

                // ไม่มี start_date ไม่เอา
                if (!item.start_date) {
                  return false
                }

                // ถ้ามี end_date
                if (endDate) {
                  return currentDate.isSame(startDate, 'day') || currentDate.isSame(endDate, 'day') || (currentDate.isAfter(startDate) && currentDate.isBefore(endDate))
                }

                // ถ้าไม่มี end_date เช็คแค่ current >= start_date
                return currentDate.isSame(startDate, 'day') || currentDate.isAfter(startDate)
              })

              // if(nomination_point__?.length > 0){
              //   console.log('nomination_point__ : ', nomination_point__);
              // }
              // const nomination_point = nominationPointList_?.find((f:any) => f?.contract_point_list?.map((cpl:any) => cpl?.contract_point)?.includes(contractPoint?.contract_point))
              //
              // if(nomination_point_?.nomination_point === "LMPT1"){
              //   // console.log('@ nomination_point_ : ', nomination_point_);
              //   console.log('@ nomination_point : ', nomination_point);
              // }
              // กรณี meter ผูกผ่าน non_tpa_point ของ nomination_point
              const isNonTpaOfNomHaveMeter = nomination_point.non_tpa_point.some((non_tpa_point) => {
                // ชื่อ meter ตรงกัน และอยู่ภายในช่วง start/end ของ metering_point
                const nonTpaHaveMeter = non_tpa_point.metering_point.some((metering_point) => {
                  let isInRange = false
                  if (meterGasday?.isValid()) {
                    isInRange = meterGasday.isSameOrAfter(metering_point.start_date) && (!metering_point.end_date || meterGasday.isBefore(metering_point.end_date))
                  } else {
                    isInRange = true
                  }
                  return (metering_point.metered_point_name === f?.meteringPointId || metering_point.metered_id === f?.meteringPointId) && isInRange
                })
                // non_tpa_point เองก็ต้องยังอยู่ในช่วงวันที่ของ gasDay
                let isInRange = false
                if (meterGasday?.isValid()) {
                  isInRange = meterGasday.isSameOrAfter(non_tpa_point.start_date) && (!non_tpa_point.end_date || meterGasday.isBefore(non_tpa_point.end_date))
                } else {
                  isInRange = true
                }
                return nonTpaHaveMeter && isInRange
              })

              // กรณี meter ผูกตรงกับ nomination_point (ไม่ผ่าน non_tpa)
              // console.log('nomination_point.metering_point : ', nomination_point.metering_point);

              // nomination_point
              // nomination_point.metering_point
              // const meteringPointN = nomination_point.metering_point // relate จะไม่เจอติด period id
              const meteringPointN = meterPointList_?.filter((f: any) => f?.nomination_point?.nomination_point === nomination_point?.nomination_point)
              // const meteringPointN = meteringPointN_.find((item: any) => {
              //     const startDate = dayjs(item.start_date);
              //     const endDate = item.end_date ? dayjs(item.end_date) : null;

              //     // ไม่มี start_date ไม่เอา
              //     if (!item.start_date) {
              //         return false;
              //     }

              //     // ถ้ามี end_date
              //     if (endDate) {
              //         return (
              //             currentDate.isSame(startDate, "day") ||
              //             currentDate.isSame(endDate, "day") ||
              //             (currentDate.isAfter(startDate) && currentDate.isBefore(endDate))
              //         );
              //     }

              //     // ถ้าไม่มี end_date เช็คแค่ current >= start_date
              //     return (
              //         currentDate.isSame(startDate, "day") ||
              //         currentDate.isAfter(startDate)
              //     );
              // });

              // if(nomination_point_?.nomination_point === "LMPT1" && nomination_point.metering_point?.length > 0){
              //   console.log('@ nomination_point : ', nomination_point);
              // }
              const isNomHaveMeter = meteringPointN.some((metering_point) => {
                let isInRange = false
                if (meterGasday?.isValid()) {
                  isInRange = meterGasday.isSameOrAfter(metering_point.start_date) && (!metering_point.end_date || meterGasday.isBefore(metering_point.end_date))
                } else {
                  isInRange = true
                }
                return (metering_point.metered_point_name === f?.meteringPointId || metering_point.metered_id === f?.meteringPointId) && isInRange
              })

              // nom มัน new period ได้ทำให้ meter ไม่ได้ผูกอยู่กับ nom ที่กำลัง active อยู่ ทำให้ต้องกรองด้วย isInRange เหมือนอันอื่นไม่ได้
              // let isInRange = false
              // if(meterGasday?.isValid()){
              //   isInRange = meterGasday.isSameOrAfter(nomination_point.start_date) && (!nomination_point.end_date || meterGasday.isBefore(nomination_point.end_date))
              // }
              // else{
              //   isInRange = true
              // }

              // ผ่านถ้าเจอ meter จากเส้นทางใดเส้นทางหนึ่ง
              return isNomHaveMeter || isNonTpaOfNomHaveMeter
            })
            return isContractPointHaveMeter
          })

          // const isHaveActiveMeterFromReserveBalancingGasContract = nominationPointList.some(nomination_point => {
          //   // กรณี meter ผูกผ่าน non_tpa_point ของ nomination_point
          //   const isNonTpaOfNomHaveMeter = nomination_point.non_tpa_point.some(non_tpa_point => {
          //     // ชื่อ meter ตรงกัน และอยู่ภายในช่วง start/end ของ metering_point
          //     const nonTpaHaveMeter = non_tpa_point.metering_point.some(metering_point => {
          //       let isInRange = false
          //       if(meterGasday?.isValid()){
          //         isInRange = meterGasday.isSameOrAfter(metering_point.start_date) && (!metering_point.end_date || meterGasday.isBefore(metering_point.end_date))
          //       }
          //       else{
          //         isInRange = true
          //       }
          //       return (metering_point.metered_point_name === f?.meteringPointId || metering_point.metered_id === f?.meteringPointId) && isInRange
          //     })
          //     // non_tpa_point เองก็ต้องยังอยู่ในช่วงวันที่ของ gasDay
          //     let isInRange = false
          //     if(meterGasday?.isValid()){
          //       isInRange = meterGasday.isSameOrAfter(non_tpa_point.start_date) && (!non_tpa_point.end_date || meterGasday.isBefore(non_tpa_point.end_date))
          //     }
          //     else{
          //       isInRange = true
          //     }
          //     return nonTpaHaveMeter && isInRange
          //   })

          //   // กรณี meter ผูกตรงกับ nomination_point (ไม่ผ่าน non_tpa)
          //   const isNomHaveMeter = nomination_point.metering_point.some(metering_point => {
          //     let isInRange = false
          //     if(meterGasday?.isValid()){
          //       isInRange = meterGasday.isSameOrAfter(metering_point.start_date) && (!metering_point.end_date || meterGasday.isBefore(metering_point.end_date))
          //     }
          //     else{
          //       isInRange = true
          //     }
          //     return (metering_point.metered_point_name === f?.meteringPointId || metering_point.metered_id === f?.meteringPointId) && isInRange
          //   })

          //   // ผ่านถ้าเจอ meter จากเส้นทางใดเส้นทางหนึ่ง
          //   return isNomHaveMeter || isNonTpaOfNomHaveMeter
          // })
          // return isHaveActiveMeterFromContract || isHaveActiveMeterFromReserveBalancingGasContract
          return isHaveActiveMeterFromContract
        })
        // console.log('newresult_ : ', newresult_);
        return newresult_
      } else {
        console.log('result_ : ', result_)
        console.log(
          '[H] result_ : ',
          result_?.filter((f: any) => f?.prop?.area?.name === 'H')
        )
        return result_
      }
    } else {
      console.log('result_ : ', result_)
      return result_
    }
  }

  async getDataLogic(query: any, isReplaceMissingMeterWithNomination?: boolean, userId?: any) {
    const {share, start_date, end_date} = query

    const start = start_date ? getTodayStartYYYYMMDDDfaultAdd7(start_date) : getTodayStartAdd7()
    const end = end_date ? getTodayEndYYYYMMDDDfaultAdd7(end_date) : getTodayEndAdd7()
    let activeData: activeData[] | undefined = []
    const dateArray: string[] = []
    if (isReplaceMissingMeterWithNomination) {
      try {
        // Extract gas days and generate date array
        const getMeterFrom = getTodayNow(start_date)
        const getMeterTo = getTodayNow(end_date)
        // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
        let current = getMeterFrom.clone()
        while (current.isSameOrBefore(getMeterTo, 'day')) {
          dateArray.push((current && current.format('YYYY-MM-DD')) || dayjs().format('YYYY-MM-DD'))
          current = current.add(1, 'day')
        }
        // Build active data for all dates
        activeData = await buildActiveDataForDates(dateArray, this.prisma, userId)
      } catch (error) {
        activeData = undefined
      }
    } else {
      activeData = undefined
    }

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'get-last-have-value',
        // mode: 'metering',
        mode: 'metering',
        start_date: start_date,
        end_date: end_date
        // start_date: "2025-03-08",
        // end_date:"2025-03-10"
      }),
      isReplaceMissingMeterWithNomination && activeData
        ? {
            activeData: activeData,
            prisma: this.prisma
          }
        : undefined
    )

    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    const compareMeterEachDay = await Promise.all(
      dateArray.map(async (date) => {
        const activeDataForDate = activeData?.find((ad) => ad.date === date)

        if (!activeDataForDate) {
          return []
        }

        const meteredPoint = activeDataForDate?.activeMeteringPoints || []
        const conceptPointList = activeDataForDate?.activeConceptPoints || []

        // สำคัญ: share ต้องเช็คตาม gas day แต่ละวัน
        const gasDayStart = getTodayStartYYYYMMDDDfaultAdd7(date)
        const gasDayEnd = getTodayEndYYYYMMDDDfaultAdd7(date)

        const ckShare = share === 'on' ? await shareShipper(meteredPoint, this.prisma, gasDayStart, gasDayEnd) : meteredPoint

        const compareMeter = await this.meteredCompare(ckShare, dataConvert, date, conceptPointList)

        return compareMeter
      })
    )

    const result_ = compareMeterEachDay.flat()

    if (userId) {
      const userType = await this.prisma.user_type.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(userId)
            }
          }
        }
      })

      if (userType?.id === 3) {
        // =========================================================
        // 1. GET GROUP ของ USER
        // =========================================================
        const group_ = await this.prisma.group.findFirst({
          where: {
            account_manage: {
              some: {
                account_id: Number(userId)
              }
            }
          },
          include: {
            shipper_contract_point: {
              include: {
                contract_point: {
                  include: {
                    nomination_point_list: {
                      include: {
                        metering_point: true
                      }
                    }
                  }
                }
              }
            }
          }
        })

        // =========================================================
        // 2. GET CONTRACT CODE
        //
        // ตรงนี้ยังคง logic เดิม:
        // หา Contract ที่ overlap กับช่วง Search ทั้งหมด
        //
        // เช่น Search:
        // 25/02/2026 - 02/03/2026
        //
        // อาจได้ทั้ง Contract เดือน Feb และ Contract เดือน Mar
        //
        // ซึ่ง "ถูกต้อง"
        //
        // แต่เราจะไปแยก Contract ที่ active ตาม gasDay
        // ตอน filter result_ ด้านล่างอีกที
        // =========================================================
        const contractCode = await this.prisma.contract_code.findMany({
          where: {
            AND: [
              {
                group_id: group_?.id
              },
              {
                contract_start_date: {
                  lte: end.toDate()
                }
              },

              // ไม่เอา Rejected
              {
                status_capacity_request_management: {
                  NOT: {
                    name: {
                      equals: 'Rejected',
                      mode: 'insensitive'
                    }
                  }
                }
              },

              // terminate_date
              {
                OR: [
                  {
                    terminate_date: null
                  },
                  {
                    terminate_date: {
                      gt: start.toDate()
                    }
                  }
                ]
              },

              // ถ้ามี extend_deadline ให้ใช้ extend_deadline
              // ถ้าไม่มีให้ใช้ contract_end_date
              {
                OR: [
                  {
                    AND: [
                      {
                        extend_deadline: {
                          not: null
                        }
                      },
                      {
                        extend_deadline: {
                          gt: start.toDate()
                        }
                      }
                    ]
                  },
                  {
                    AND: [
                      {
                        extend_deadline: null
                      },
                      {
                        OR: [
                          {
                            contract_end_date: null
                          },
                          {
                            contract_end_date: {
                              gt: start.toDate()
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          select: {
            id: true,
            contract_code: true,
            contract_start_date: true,
            contract_end_date: true,
            terminate_date: true,
            extend_deadline: true,

            booking_version: {
              include: {
                booking_row_json: {
                  select: {
                    contract_point: true
                  }
                }
              },
              where: {
                flag_use: true
              }
            }
          }
        })

        // =========================================================
        // 3. RESERVE BALANCING GAS CONTRACT
        // =========================================================
        const reserveBalancingGasContract = await this.prisma.reserve_balancing_gas_contract.findMany({
          where: {
            group_id: group_?.id,

            reserve_balancing_gas_contract_detail: {
              some: {
                start_date: {
                  lte: end.toDate()
                },

                OR: [
                  {
                    end_date: null
                  },
                  {
                    end_date: {
                      gt: start.toDate()
                    }
                  }
                ]
              }
            }
          },
          include: {
            reserve_balancing_gas_contract_detail: {
              include: {
                nomination_point: true
              }
            }
          }
        })

        // =========================================================
        // 4. เตรียม Contract Point
        // =========================================================
        const orInWhereContractPoint: Prisma.contract_pointWhereInput[] = []

        // =========================================================
        // สำคัญ
        //
        // Array นี้จะเก็บว่า:
        //
        // Contract ไหน
        // start วันไหน
        // end วันไหน
        // และมี contract_point อะไร
        //
        // เพื่อเอาไปตรวจต่อ ROW ตาม gasDay
        // =========================================================
        const contract_point_contractSE: any[] =
          contractCode?.flatMap((fm: any) => {
            return (
              fm?.booking_version?.flatMap((fm_v: any) => {
                return (
                  fm_v?.booking_row_json?.flatMap((fm_r: any) => {
                    if (!fm_r?.contract_point) {
                      return []
                    }

                    // =============================================
                    // effective end date
                    //
                    // คง precedence เดิมของระบบ:
                    //
                    // terminate_date
                    // -> extend_deadline
                    // -> contract_end_date
                    // =============================================
                    const effectiveContractEnd = fm?.terminate_date || fm?.extend_deadline || fm?.contract_end_date || null

                    // =============================================
                    // Query Contract Point
                    // =============================================
                    orInWhereContractPoint.push({
                      AND: [
                        {
                          contract_point: fm_r?.contract_point
                        },

                        // ถ้าไม่มี contract end
                        // ใช้ search end เพื่อหา record ที่เกี่ยวข้องมาก่อน
                        {
                          contract_point_start_date: {
                            lte: effectiveContractEnd || end.toDate()
                            // lte: fm?.contract_start_date
                          }
                        },

                        {
                          OR: [
                            {
                              contract_point_end_date: null
                            },
                            {
                              contract_point_end_date: {
                                gt: fm?.contract_start_date
                                // gt: effectiveContractEnd || end.toDate()
                              }
                            }
                          ]
                        }
                      ]
                    })

                    return [
                      {
                        contract_id: fm?.id,
                        contract_code: fm?.contract_code,

                        contract_start_date: fm?.contract_start_date,

                        contract_end_date: effectiveContractEnd,

                        contract_point: fm_r?.contract_point
                      }
                    ]
                  }) ?? []
                )
              }) ?? []
            )
          }) ?? []

        console.log('contractCode : ', contractCode)
        console.log('contract_point_contractSE : ', contract_point_contractSE)
        console.log('orInWhereContractPoint : ', orInWhereContractPoint)

        // =========================================================
        // 5. GET CONTRACT POINT
        // =========================================================
        const contractPointList =
          orInWhereContractPoint.length > 0
            ? await this.prisma.contract_point.findMany({
                where: {
                  OR: orInWhereContractPoint
                },

                include: {
                  nomination_point_list: {
                    include: {
                      metering_point: true,

                      non_tpa_point: {
                        include: {
                          metering_point: true
                        }
                      }
                    }
                  }
                }
              })
            : []

        console.log('contractPointList : ', contractPointList);

        // =========================================================
        // 6. RESERVE BALANCING -> NOMINATION POINT
        // =========================================================
        const orInWhereNominationPoint: Prisma.nomination_pointWhereInput[] = []

        reserveBalancingGasContract?.forEach((fm: any) => {
          fm?.reserve_balancing_gas_contract_detail?.forEach((fm_r: any) => {
            if (!fm_r?.nomination_point?.nomination_point) {
              return
            }

            const conditions: Prisma.nomination_pointWhereInput[] = [
              {
                nomination_point: fm_r?.nomination_point?.nomination_point
              }
            ]

            // เดิมมี:
            //
            // start_date: { lte: fm_r?.end_date }
            //
            // แต่กรณี end_date = null Prisma อาจมีปัญหา
            //
            // ดังนั้นใส่เฉพาะเมื่อมี end_date
            if (fm_r?.end_date) {
              conditions.push({
                start_date: {
                  lte: fm_r.end_date
                }
              })
            }

            conditions.push({
              OR: [
                {
                  end_date: null
                },
                {
                  end_date: {
                    gt: fm_r?.start_date
                  }
                }
              ]
            })

            orInWhereNominationPoint.push({
              AND: conditions
            })
          })
        })

        // =========================================================
        // 7. GET RESERVE NOMINATION POINT
        // =========================================================
        const nominationPointList =
          orInWhereNominationPoint.length > 0
            ? await this.prisma.nomination_point.findMany({
                where: {
                  OR: orInWhereNominationPoint
                },

                include: {
                  metering_point: true,

                  non_tpa_point: {
                    include: {
                      metering_point: true
                    }
                  }
                }
              })
            : []

        // =========================================================
        // 8. GET NOMINATION POINT ทุก Period
        //
        // คง logic เดิมของคุณ
        //
        // เพราะ nomination_point relation โดยตรง
        // อาจไม่เจอจาก period id
        // =========================================================
        const nominationPointList_ = await this.prisma.nomination_point.findMany({
          where: {},

          include: {
            contract_point_list: {
              select: {
                contract_point: true
              }
            },

            metering_point: true,

            non_tpa_point: {
              include: {
                metering_point: true
              }
            }
          }
        })

        // =========================================================
        // 9. GET METER POINT ทุก Period
        //
        // คง logic เดิมของคุณ
        // =========================================================
        const meterPointList_ = await this.prisma.metering_point.findMany({
          where: {},

          include: {
            nomination_point: {
              select: {
                nomination_point: true
              }
            }
          }
        })

        // =========================================================
        // 10. CURRENT DATE
        //
        // *** สำคัญ ***
        //
        // ตรงนี้ยังใช้ currentDate เหมือนโค้ดเดิม
        //
        // ห้ามเปลี่ยนเป็น meterGasday
        //
        // เพราะจากการทดสอบรอบก่อน
        // จะทำให้ Nomination Point เก่า เช่น
        //
        // BPK_CC1
        // GPD1
        // GPD2
        // GPD3
        // GSRC...
        //
        // กลับมาแสดงทั้งหมด
        // =========================================================
        // const currentDate = dayjs()

        // =========================================================
        // 11. FILTER RESULT
        // =========================================================
        // console.log('result_ : ', result_);
        // console.log('[BPK_CC1] result_ : ', result_?.filter((f:any) => f?.meteringPointId === "BPK_CC1"));

        const newresult_ = result_?.filter((f: any) => {
          const meterGasday = dayjs(f?.gasDay)

          // =======================================================
          // FIX หลัก
          //
          // หา Contract Point ที่ Active
          // เฉพาะ gasDay ของ row ปัจจุบัน
          //
          // เช่น Search:
          //
          // 25/02 - 02/03
          //
          // ถึง contractCode จะมีทั้ง Contract Feb + Mar
          //
          // แต่:
          //
          // row 25/02
          // -> ใช้เฉพาะ Contract ที่ active 25/02
          //
          // row 01/03
          // -> ใช้เฉพาะ Contract ที่ active 01/03
          //
          // =======================================================
          const activeContractPointSet = new Set<string>()

          for (const contractItem of contract_point_contractSE ?? []) {
            if (!contractItem?.contract_point) {
              continue
            }

            // gasDay invalid:
            // คง behavior เดิม ไม่ตัดด้วยวันที่
            if (!meterGasday?.isValid()) {
              activeContractPointSet.add(contractItem.contract_point)

              continue
            }

            if (!contractItem?.contract_start_date) {
              continue
            }

            const contractStartDate = dayjs((contractItem && contractItem.contract_start_date) || undefined)

            const contractEndDate = contractItem && contractItem?.contract_end_date ? dayjs(contractItem.contract_end_date) : null

            if (!contractStartDate.isValid()) {
              continue
            }

            // =============================================
            // START = inclusive
            //
            // gasDay >= contract_start_date
            // =============================================
            const isAfterStart = meterGasday.isSame(contractStartDate, 'day') || meterGasday.isAfter(contractStartDate, 'day')

            // =============================================
            // END = exclusive
            //
            // gasDay < contract_end_date
            //
            // ถ้า end null = ยัง active
            //
            // ใช้แบบเดียวกับ logic เดิม:
            //
            // gasDay.isBefore(maxEndDate)
            // =============================================
            const isBeforeEnd = !contractEndDate || !contractEndDate.isValid() || meterGasday.isBefore(contractEndDate, 'day')

            if (isAfterStart && isBeforeEnd) {
              activeContractPointSet.add(contractItem.contract_point)
            }
          }

          // =======================================================
          // มีอย่างน้อย 1 Contract Point ที่ผูกกับ Meter นี้
          // =======================================================
          const isHaveActiveMeterFromContract = contractPointList.some((contractPoint: any) => {
            // =================================================
            // FIX 1
            //
            // Contract Point ตัวนี้ต้องมาจาก Contract
            // ที่ active ใน gasDay ก่อน
            // =================================================
            if (meterGasday?.isValid()) {
              const isContractActive = activeContractPointSet.has(contractPoint?.contract_point)

              if (!isContractActive) {
                return false
              }
            }

            // =================================================
            // FIX 2
            //
            // Contract Point record เอง
            // ก็ต้อง Active ตาม gasDay
            //
            // สำคัญกรณี contract_point ชื่อเดียวกัน
            // แต่มีหลาย period
            // =================================================
            if (meterGasday?.isValid()) {
              const contractPointStartDate = contractPoint?.contract_point_start_date ? dayjs(contractPoint.contract_point_start_date) : null

              const contractPointEndDate = contractPoint?.contract_point_end_date ? dayjs(contractPoint.contract_point_end_date) : null

              // -----------------------------------------------
              // start inclusive
              // -----------------------------------------------
              if (contractPointStartDate?.isValid() && meterGasday.isBefore(contractPointStartDate, 'day')) {
                return false
              }

              // -----------------------------------------------
              // end exclusive
              // -----------------------------------------------
              if (contractPointEndDate?.isValid() && !meterGasday.isBefore(contractPointEndDate, 'day')) {
                return false
              }
            }

            
            const isContractPointHaveMeter = (contractPoint?.nomination_point_list ?? []).some((nomination_point_: any) => {
              
              const nomination_pointN = nominationPointList_?.filter((np: any) => np?.nomination_point === nomination_point_?.nomination_point && np?.contract_point_list?.map((cpl: any) => cpl?.contract_point)?.includes(contractPoint?.contract_point)) ?? []




              const nomination_point = nomination_pointN.find((item: any) => {
                if (!item?.start_date) {
                  return false
                }

                // ช่วงที่เลือก
                const rangeStart = dayjs(start).startOf('day')
                const rangeEnd = dayjs(end).endOf('day')

                // ช่วงของ nomination point
                const itemStart = dayjs(item.start_date).startOf('day')
                const itemEnd = item?.end_date
                  ? dayjs(item.end_date).endOf('day')
                  : null

                if (
                  !rangeStart.isValid() ||
                  !rangeEnd.isValid() ||
                  !itemStart.isValid()
                ) {
                  return false
                }

                // ---------------------------------------
                // ถ้ามี end_date
                // เช็คว่าช่วงวันที่ทับซ้อนกันหรือไม่
                //
                // rangeStart <= itemEnd
                // AND
                // rangeEnd >= itemStart
                // ---------------------------------------
                if (itemEnd?.isValid()) {
                  return (
                    (rangeStart.isBefore(itemEnd) || rangeStart.isSame(itemEnd, 'day')) &&
                    (rangeEnd.isAfter(itemStart) || rangeEnd.isSame(itemStart, 'day'))
                  )
                }

                // ---------------------------------------
                // ถ้าไม่มี end_date
                // หมายถึงใช้ได้ตั้งแต่ itemStart เป็นต้นไป
                //
                // rangeEnd >= itemStart
                // ---------------------------------------
                return (
                  rangeEnd.isAfter(itemStart) ||
                  rangeEnd.isSame(itemStart, 'day')
                )
              })

              // if(f?.meteringPointId === "BPK_CC1" && nomination_point_?.nomination_point === "BPK_CC1"){
              //   console.log('- - - -'); 
              //   console.log('start : ', start);
              //   console.log('end : ', end);
              //   console.log('currentDate : ', currentDate);
              //   console.log('nomination_point_ : ', nomination_point_);
              //   console.log('nomination_point : ', nomination_point);
              //   console.log('meterPointList_ : ', meterPointList_);
              //   console.log('nomination_pointN : ', nomination_pointN);
              //   console.log('[BPK_CC1] nominationPointList_ : ', nominationPointList_?.filter((f:any) => f?.nomination_point === "BPK_CC1"));
              //   console.log('- - - -');
              // }

              // =============================================
              // ไม่พบ nomination point active
              // =============================================
              if (!nomination_point) {
                return false
              }

              // =============================================
              // 12. NON TPA
              // =============================================
              const isNonTpaOfNomHaveMeter = (nomination_point?.non_tpa_point ?? []).some((non_tpa_point: any) => {
                // -----------------------------------------
                // Meter ภายใน Non TPA
                // -----------------------------------------
                const nonTpaHaveMeter = (non_tpa_point?.metering_point ?? []).some((metering_point: any) => {
                  let isInRange = false

                  if (meterGasday?.isValid()) {
                    // ---------------------------------
                    // Meter start
                    // ---------------------------------
                    let startValid = true

                    if (metering_point?.start_date) {
                      const meterStart = dayjs(metering_point.start_date)

                      if (meterStart.isValid()) {
                        startValid = meterGasday.isSame(meterStart, 'day') || meterGasday.isAfter(meterStart, 'day')
                      }
                    }

                    // ---------------------------------
                    // Meter end
                    // ---------------------------------
                    let endValid = true

                    if (metering_point?.end_date) {
                      const meterEnd = dayjs(metering_point.end_date)

                      if (meterEnd.isValid()) {
                        endValid = meterGasday.isBefore(meterEnd, 'day')
                      }
                    }

                    isInRange = startValid && endValid
                  } else {
                    isInRange = true
                  }

                  const isMeterMatch = metering_point?.metered_point_name === f?.meteringPointId || metering_point?.metered_id === f?.meteringPointId

                  return isMeterMatch && isInRange
                })

                // -----------------------------------------
                // Non TPA เองต้องอยู่ในช่วง gasDay
                // -----------------------------------------
                let isNonTpaInRange = false

                if (meterGasday?.isValid()) {
                  let startValid = true

                  if (non_tpa_point?.start_date) {
                    const nonTpaStart = dayjs(non_tpa_point.start_date)

                    if (nonTpaStart.isValid()) {
                      startValid = meterGasday.isSame(nonTpaStart, 'day') || meterGasday.isAfter(nonTpaStart, 'day')
                    }
                  }

                  let endValid = true

                  if (non_tpa_point?.end_date) {
                    const nonTpaEnd = dayjs(non_tpa_point.end_date)

                    if (nonTpaEnd.isValid()) {
                      endValid = meterGasday.isBefore(nonTpaEnd, 'day')
                    }
                  }

                  isNonTpaInRange = startValid && endValid
                } else {
                  isNonTpaInRange = true
                }

                return nonTpaHaveMeter && isNonTpaInRange
              })

              // =============================================
              // 13. METER ผูกตรงกับ NOMINATION POINT
              //
              // ใช้ meterPointList_ เหมือนเดิม
              //
              // เพราะ relation:
              // nomination_point.metering_point
              //
              // อาจไม่เจอเนื่องจาก period id
              // =============================================
              const meteringPointN = meterPointList_?.filter((mp: any) => mp?.nomination_point?.nomination_point === nomination_point?.nomination_point) ?? []

              const isNomHaveMeter = meteringPointN.some((metering_point: any) => {
                let isInRange = false

                if (meterGasday?.isValid()) {
                  // -------------------------------------
                  // START
                  // -------------------------------------
                  let startValid = true

                  if (metering_point?.start_date) {
                    const meterStart = dayjs(metering_point.start_date)

                    if (meterStart.isValid()) {
                      startValid = meterGasday.isSame(meterStart, 'day') || meterGasday.isAfter(meterStart, 'day')
                    }
                  }

                  // -------------------------------------
                  // END
                  // -------------------------------------
                  let endValid = true

                  if (metering_point?.end_date) {
                    const meterEnd = dayjs(metering_point.end_date)

                    if (meterEnd.isValid()) {
                      endValid = meterGasday.isBefore(meterEnd, 'day')
                    }
                  }

                  isInRange = startValid && endValid
                } else {
                  isInRange = true
                }

                const isMeterMatch = metering_point?.metered_point_name === f?.meteringPointId || metering_point?.metered_id === f?.meteringPointId

                return isMeterMatch && isInRange
              })

              // if(f?.meteringPointId === "BPK_CC1" && nomination_point_?.nomination_point === "BPK_CC1"){
              //   console.log('- - - -');
              //   console.log('isNomHaveMeter : ', isNomHaveMeter);
              //   console.log('nomination_point_ : ', nomination_point_);
              //   console.log('meterPointList_ : ', meterPointList_);
              //   console.log('nomination_point : ', nomination_point);
              //   console.log('meteringPointN : ', meteringPointN);
              //   console.log('[BPK_CC1] nominationPointList_ : ', nominationPointList_?.filter((f:any) => f?.nomination_point === "BPK_CC1"));
              //   console.log('- - - -');
              // }
             
              return isNomHaveMeter || isNonTpaOfNomHaveMeter
            })

            // if(f?.meteringPointId === "BPK_CC1"){
            //   console.log('isContractPointHaveMeter : ', isContractPointHaveMeter);
            //   console.log('(contractPoint?.nomination_point_list ?? []) : ', (contractPoint?.nomination_point_list ?? []));
            // }

            return isContractPointHaveMeter
          })

          // if(f?.meteringPointId === "BPK_CC1"){
          //   console.log('f : ', f);
          //   console.log('contractPointList : ', contractPointList);
          //   console.log('isHaveActiveMeterFromContract : ', isHaveActiveMeterFromContract);
          // }

          let isHaveActiveConceptPoint = false
          const activeDataForDate = activeData?.find((ad) => ad.date === meterGasday.format('YYYY-MM-DD'))

          if (activeDataForDate) {
            const conceptPointList = activeDataForDate.activeConceptPoints || []
            isHaveActiveConceptPoint = conceptPointList.some((cp) => {
              return cp.concept_point === f.meteringPointId
            })
          }

          return isHaveActiveMeterFromContract || isHaveActiveConceptPoint
        })

        return newresult_
      } else {
        // =========================================================
        // User ไม่ใช่ Shipper
        // =========================================================
        return result_
      }
    } else {
      return result_
    }

    // if (userId) {

    //   const userType = await this.prisma.user_type?.findFirst({
    //     where: {
    //       account_manage: {
    //         some: {
    //           account_id: Number(userId)
    //         }
    //       }
    //     }
    //   })
    //   if (userType?.id === 3) {
    //     const group_ = await this.prisma.group?.findFirst({
    //     where: {
    //       account_manage: {
    //         some: {
    //           account_id: Number(userId)
    //         }
    //       }
    //     },
    //     include:{
    //       shipper_contract_point:{
    //         include:{
    //           contract_point:{
    //             include:{
    //               nomination_point_list:{
    //                 include:{
    //                   metering_point:true,
    //                 },
    //               },
    //             }
    //           }
    //         },
    //       },
    //     },
    //   })
    //   const contractCode = await this.prisma.contract_code.findMany({
    //     where: {
    //       AND: [
    //         {
    //           group_id: group_?.id,
    //         },
    //         {
    //           contract_start_date: {
    //             lte: end.toDate()
    //           }
    //         }, // Started before or on target date
    //         // Not rejected
    //         {
    //           status_capacity_request_management: {
    //             NOT: {
    //               name: {
    //                 equals: 'Rejected',
    //                 mode: 'insensitive'
    //               }
    //             }
    //           }
    //         },
    //         // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
    //         {
    //           OR: [
    //             {
    //               terminate_date: null
    //             }, // No terminate date
    //             {
    //               terminate_date: {
    //                 gt: start.toDate()
    //               }
    //             } // Terminate date is after target date
    //           ]
    //         },
    //         // Use extend_deadline if available, otherwise use contract_end_date
    //         {
    //           OR: [
    //             // If extend_deadline exists, use it as end date
    //             {
    //               AND: [
    //                 {
    //                   extend_deadline: {
    //                     not: null
    //                   }
    //                 },
    //                 {
    //                   extend_deadline: {
    //                     gt: start.toDate()
    //                   }
    //                 }
    //               ]
    //             },
    //             // If extend_deadline is null, use contract_end_date
    //             {
    //               AND: [
    //                 {
    //                   extend_deadline: null
    //                 },
    //                 {
    //                   OR: [
    //                     {
    //                       contract_end_date: null
    //                     },
    //                     {
    //                       contract_end_date: {
    //                         gt: start.toDate()
    //                       }
    //                     }
    //                   ]
    //                 }
    //               ]
    //             }
    //           ]
    //         }
    //       ]
    //     },
    //     select:{
    //       id: true,
    //       contract_start_date: true,
    //       contract_end_date: true,
    //       terminate_date: true,
    //       extend_deadline: true,
    //       booking_version:{
    //         include:{
    //           booking_row_json:{
    //             select:{
    //               contract_point:true,
    //             }
    //           },
    //         },
    //         where:{
    //           flag_use: true
    //         }
    //       }
    //     }
    //   })
    //   const reserveBalancingGasContract = await this.prisma.reserve_balancing_gas_contract.findMany({
    //     where: {
    //       group_id: group_?.id,
    //       reserve_balancing_gas_contract_detail: {
    //         some: {
    //           start_date: {
    //             lte: end.toDate()
    //           },
    //           OR: [
    //             {
    //               end_date: null
    //             },
    //             {
    //               end_date: {
    //                 gt: start.toDate()
    //               }
    //             }
    //           ]
    //         }
    //       }
    //     },
    //     include: {
    //       reserve_balancing_gas_contract_detail: {
    //         include: {
    //           nomination_point: true
    //         }
    //       }
    //     }
    //   })

    //   const orInWhereContractPoint : Prisma.contract_pointWhereInput[] = []
    //   const contract_point_contractSE = contractCode?.flatMap(fm => {
    //     return fm?.booking_version?.flatMap((fm_v:any) => {
    //       return fm_v?.booking_row_json?.flatMap((fm_r:any) => {
    //         orInWhereContractPoint.push({
    //           AND: [
    //             {
    //               contract_point: fm_r?.contract_point
    //             },
    //             {
    //               contract_point_start_date: { lte: fm?.terminate_date || fm?.extend_deadline || fm?.contract_end_date }
    //             },
    //             {
    //               OR: [
    //                 { contract_point_end_date: null },
    //                 { contract_point_end_date: { gt: fm?.contract_start_date } }
    //               ]
    //             }
    //           ]
    //         })
    //         return {
    //           contract_start_date: fm?.contract_start_date,
    //           contract_end_date: fm?.terminate_date || fm?.extend_deadline || fm?.contract_end_date,
    //           contract_point: fm_r?.contract_point
    //         }
    //       })
    //     })
    //   })
    //   const contractPointList = await this.prisma.contract_point.findMany({
    //     where: {
    //       OR: orInWhereContractPoint
    //     },
    //     include: {
    //       nomination_point_list: {
    //         include: {
    //           metering_point: true,
    //           non_tpa_point: {
    //             include: {
    //               metering_point: true,
    //             }
    //           },
    //         }
    //       },
    //     }
    //   })

    //   const orInWhereNominationPoint : Prisma.nomination_pointWhereInput[] = []
    //   const contractPointReserveBalancingGasContractSE = reserveBalancingGasContract?.flatMap(fm => {
    //     fm.reserve_balancing_gas_contract_detail.map(fm_r => {
    //       orInWhereNominationPoint.push({
    //         AND: [
    //           {
    //             nomination_point: fm_r?.nomination_point?.nomination_point
    //           },
    //           {
    //             start_date: { lte: fm_r?.end_date }
    //           },
    //           {
    //             OR: [
    //               { end_date: null },
    //               { end_date: { gt: fm_r?.start_date } }
    //             ]
    //           }
    //         ]
    //       })
    //       return {
    //         start_date: fm_r?.start_date,
    //         end_date: fm_r?.end_date,
    //         nomination_point: fm_r?.nomination_point
    //       }
    //     })
    //   })

    //   const nominationPointList = await this.prisma.nomination_point.findMany({
    //     where: {
    //       OR: orInWhereNominationPoint
    //     },
    //     include: {
    //       metering_point: true,
    //       non_tpa_point: {
    //         include: {
    //           metering_point: true
    //         }
    //       }
    //     }
    //   })

    //   // // console.log('group_ : ', group_);
    //   // const startDate = getTodayStartAdd7(start_date == 'undefined' ? undefined : start_date)
    //   // const endDate = getTodayEndAdd7(end_date == 'undefined' ? undefined : end_date)
    //   // const metering_point_name = await this.prisma.metering_point.findMany({
    //   //     where: {
    //   //       AND: [
    //   //         {
    //   //           start_date: {
    //   //             lte: endDate.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
    //   //           }
    //   //         },
    //   //         {
    //   //           OR: [
    //   //             {
    //   //               end_date: null
    //   //             }, // ถ้า end_date เป็น null
    //   //             {
    //   //               end_date: {
    //   //                 gt: startDate.toDate()
    //   //               }
    //   //             } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
    //   //           ]
    //   //         }
    //   //       ]
    //   //     },
    //   //     include: {
    //   //       // point_type: true,
    //   //       // entry_exit: true,
    //   //       // customer_type: true,
    //   //       // zone: true,
    //   //       // area: true,
    //   //       non_tpa_point: true,
    //   //       nomination_point: true,
    //   //     },
    //   //     orderBy: {
    //   //       id: 'desc'
    //   //     }
    //   //   })

    //   //   // nomination_point?.nomination_point

    //   //   // metered_point_name

    //   //   // console.log('metering_point_name : ', metering_point_name);

    //   // // metering_point
    //   // // https://app.clickup.com/t/86euzxxpk
    //   // const metered_point_nom_ = group_?.shipper_contract_point?.flatMap((fm:any) => {
    //   //   return fm?.contract_point?.nomination_point_list?.flatMap((fm_:any) => {
    //   //     const mtName = fm_?.metering_point?.map((e:any) => e?.metered_point_name)
    //   //     // mtName
    //   //     const fMt = metering_point_name?.filter((f:any) => f?.nomination_point?.nomination_point === fm_?.nomination_point)
    //   //     return {
    //   //       metering_point: mtName?.length > 0 ? mtName : fMt?.map((e:any) => e?.metered_point_name),
    //   //       nomination_point: fm_?.nomination_point,
    //   //       contract_point: fm?.contract_point?.contract_point
    //   //     }
    //   //   })
    //   // })?.filter((f:any) => contract_point_contractSE?.map((cp:any) => cp?.contract_point)?.includes(f?.contract_point))

    //   // const metered_point_nom_se = metered_point_nom_?.map((e:any) => {
    //   //   const contractCodeSE = contract_point_contractSE?.filter((f:any) => f?.contract_point === e?.contract_point)
    //   //   return {
    //   //     ...e,
    //   //     contractCodeSE: contractCodeSE || []
    //   //   }
    //   // })

    //   // const newresult_ = result_?.filter((f:any) => {
    //   //   const meteringPointId = metered_point_nom_se?.filter((m_:any) => m_?.metering_point?.includes(f?.meteringPointId) )
    //   //   if(meteringPointId?.length > 0){
    //   //     const seDate = meteringPointId?.flatMap((fm:any) => {
    //   //       return fm?.contractCodeSE?.map((ccSE:any) => {
    //   //         return {
    //   //           contract_start_date: ccSE?.contract_start_date,
    //   //           contract_end_date: ccSE?.contract_end_date,
    //   //         }
    //   //       })
    //   //     })
    //   //     const minStartDate: dayjs.Dayjs = seDate?.reduce((min: dayjs.Dayjs, item: any) => {
    //   //       return dayjs(item.contract_start_date).isBefore(min)
    //   //         ? dayjs(item.contract_start_date)
    //   //         : min;
    //   //     }, dayjs(seDate?.[0].contract_start_date) as dayjs.Dayjs);

    //   //     const maxEndDate: dayjs.Dayjs = seDate?.reduce((max: dayjs.Dayjs, item: any) => {
    //   //       return dayjs(item.contract_end_date).isAfter(max)
    //   //         ? dayjs(item.contract_end_date)
    //   //         : max;
    //   //     }, dayjs(seDate?.[0].contract_end_date) as dayjs.Dayjs);

    //   //     const gasDay = dayjs(f?.gasDay)

    //   //     const inRange = gasDay.isSameOrAfter(minStartDate) && gasDay.isBefore(maxEndDate)

    //   //     return inRange

    //   //     // const rangDate = [dayjs(minStartDate).format("YYYY-MM-DD"),dayjs(maxEndDate).format("YYYY-MM-DD")]

    //   //     // return  (
    //   //     //   rangDate?.includes(f?.gasDay)
    //   //     // )
    //   //   }else{
    //   //     return false
    //   //   }
    //   // })

    //   // console.log('metered_point_nom_se : ', metered_point_nom_se);
    //   // console.log('metered_point_nom_ : ', metered_point_nom_);
    //   // console.log('result_ : ', result_);
    //   // console.log('newresult_ : ', newresult_);

    //     // กรอง result_ ให้เหลือเฉพาะแถว meter ที่มี metering point ที่ยัง active ตาม gasDay
    //     // โดยเช็คเส้นทาง: contract_point → nomination_point → (metering_point โดยตรง หรือผ่าน non_tpa_point)
    //     // ถ้า gasDay ไม่ valid จะถือว่าอยู่ในช่วง (isInRange = true) เพื่อไม่ตัดข้อมูลทิ้งโดยไม่จำเป็น
    //     const newresult_ = result_?.filter((f:any) => {
    //       const meterGasday = dayjs(f?.gasDay)
    //       // มีอย่างน้อย 1 contract_point ที่ผูก meter นี้ได้ในช่วงวันที่ที่เกี่ยวข้อง
    //       const isHaveActiveMeterFromContract = contractPointList.some(contractPoint => {
    //         const isContractPointHaveMeter = contractPoint.nomination_point_list.some(nomination_point => {
    //           // กรณี meter ผูกผ่าน non_tpa_point ของ nomination_point
    //           const isNonTpaOfNomHaveMeter = nomination_point.non_tpa_point.some(non_tpa_point => {
    //             // ชื่อ meter ตรงกัน และอยู่ภายในช่วง start/end ของ metering_point
    //             const nonTpaHaveMeter = non_tpa_point.metering_point.some(metering_point => {
    //               let isInRange = false
    //               if(meterGasday?.isValid()){
    //                 isInRange = meterGasday.isSameOrAfter(metering_point.start_date) && (!metering_point.end_date || meterGasday.isBefore(metering_point.end_date))
    //               }
    //               else{
    //                 isInRange = true
    //               }
    //               return (metering_point.metered_point_name === f?.meteringPointId || metering_point.metered_id === f?.meteringPointId) && isInRange
    //             })
    //             // non_tpa_point เองก็ต้องยังอยู่ในช่วงวันที่ของ gasDay
    //             let isInRange = false
    //             if(meterGasday?.isValid()){
    //               isInRange = meterGasday.isSameOrAfter(non_tpa_point.start_date) && (!non_tpa_point.end_date || meterGasday.isBefore(non_tpa_point.end_date))
    //             }
    //             else{
    //               isInRange = true
    //             }
    //             return nonTpaHaveMeter && isInRange
    //           })

    //           // กรณี meter ผูกตรงกับ nomination_point (ไม่ผ่าน non_tpa)
    //           const isNomHaveMeter = nomination_point.metering_point.some(metering_point => {
    //             let isInRange = false
    //             if(meterGasday?.isValid()){
    //               isInRange = meterGasday.isSameOrAfter(metering_point.start_date) && (!metering_point.end_date || meterGasday.isBefore(metering_point.end_date))
    //             }
    //             else{
    //               isInRange = true
    //             }
    //             return (metering_point.metered_point_name === f?.meteringPointId || metering_point.metered_id === f?.meteringPointId) && isInRange
    //           })

    //           // nom มัน new period ได้ทำให้ meter ไม่ได้ผูกอยู่กับ nom ที่กำลัง active อยู่ ทำให้ต้องกรองด้วย isInRange เหมือนอันอื่นไม่ได้
    //           // let isInRange = false
    //           // if(meterGasday?.isValid()){
    //           //   isInRange = meterGasday.isSameOrAfter(nomination_point.start_date) && (!nomination_point.end_date || meterGasday.isBefore(nomination_point.end_date))
    //           // }
    //           // else{
    //           //   isInRange = true
    //           // }

    //           // ผ่านถ้าเจอ meter จากเส้นทางใดเส้นทางหนึ่ง
    //           return isNomHaveMeter || isNonTpaOfNomHaveMeter
    //         })
    //         return isContractPointHaveMeter
    //       })

    //       const isHaveActiveMeterFromReserveBalancingGasContract = nominationPointList.some(nomination_point => {
    //         // กรณี meter ผูกผ่าน non_tpa_point ของ nomination_point
    //         const isNonTpaOfNomHaveMeter = nomination_point.non_tpa_point.some(non_tpa_point => {
    //           // ชื่อ meter ตรงกัน และอยู่ภายในช่วง start/end ของ metering_point
    //           const nonTpaHaveMeter = non_tpa_point.metering_point.some(metering_point => {
    //             let isInRange = false
    //             if(meterGasday?.isValid()){
    //               isInRange = meterGasday.isSameOrAfter(metering_point.start_date) && (!metering_point.end_date || meterGasday.isBefore(metering_point.end_date))
    //             }
    //             else{
    //               isInRange = true
    //             }
    //             return (metering_point.metered_point_name === f?.meteringPointId || metering_point.metered_id === f?.meteringPointId) && isInRange
    //           })
    //           // non_tpa_point เองก็ต้องยังอยู่ในช่วงวันที่ของ gasDay
    //           let isInRange = false
    //           if(meterGasday?.isValid()){
    //             isInRange = meterGasday.isSameOrAfter(non_tpa_point.start_date) && (!non_tpa_point.end_date || meterGasday.isBefore(non_tpa_point.end_date))
    //           }
    //           else{
    //             isInRange = true
    //           }
    //           return nonTpaHaveMeter && isInRange
    //         })

    //         // กรณี meter ผูกตรงกับ nomination_point (ไม่ผ่าน non_tpa)
    //         const isNomHaveMeter = nomination_point.metering_point.some(metering_point => {
    //           let isInRange = false
    //           if(meterGasday?.isValid()){
    //             isInRange = meterGasday.isSameOrAfter(metering_point.start_date) && (!metering_point.end_date || meterGasday.isBefore(metering_point.end_date))
    //           }
    //           else{
    //             isInRange = true
    //           }
    //           return (metering_point.metered_point_name === f?.meteringPointId || metering_point.metered_id === f?.meteringPointId) && isInRange
    //         })

    //         // ผ่านถ้าเจอ meter จากเส้นทางใดเส้นทางหนึ่ง
    //         return isNomHaveMeter || isNonTpaOfNomHaveMeter
    //       })
    //       return isHaveActiveMeterFromContract || isHaveActiveMeterFromReserveBalancingGasContract
    //     })
    //     return newresult_
    //   } else {
    //     console.log('result_ : ', result_);
    //     console.log('[H] result_ : ', result_?.filter((f:any) => f?.prop?.area?.name === "H"));
    //     return result_
    //   }
    // } else {
    //   console.log('result_ : ', result_);
    //   return result_
    // }
  }

  async getDataLogicBeforeTimestamp(query: any, isReplaceMissingMeterWithNomination?: boolean, userId?: any) {
    const {share, start_date, end_date, timestamp} = query

    let activeData: activeData[] | undefined = undefined
    const dateArray: string[] = []
    if (isReplaceMissingMeterWithNomination) {
      try {
        // Extract gas days and generate date array
        const getMeterFrom = getTodayNow(start_date)
        const getMeterTo = getTodayNow(end_date)
        // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
        let current = getMeterFrom.clone()
        while (current.isSameOrBefore(getMeterTo, 'day')) {
          dateArray.push((current && current.format('YYYY-MM-DD')) || dayjs().format('YYYY-MM-DD'))
          current = current.add(1, 'day')
        }
        // Build active data for all dates
        activeData = await buildActiveDataForDates(dateArray, this.prisma, userId)
      } catch (error) {
        activeData = undefined
      }
    }

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'get-last-have-value-before-timestamp',
        mode: 'metering',
        start_date: start_date,
        end_date: end_date,
        timestamp: timestamp
      }),
      isReplaceMissingMeterWithNomination && activeData
        ? {
            activeData: activeData,
            prisma: this.prisma
          }
        : undefined
    )

    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    // return dataConvert
    const compareMeterEachDay = await Promise.all(
      dateArray.map(async (date) => {
        // Find active data for this gas_day
        const activeDataForDate = activeData?.find((ad) => ad.date === date)
        if (activeDataForDate) {
          const meteredPoint = activeDataForDate?.activeMeteringPoints || []
          const conceptPointList = activeDataForDate?.activeConceptPoints || []
          const ckShare = share === 'on' ? await shareShipper(meteredPoint, this.prisma, null, null) : meteredPoint
          // console.log('ckShare : ', ckShare);
          const compareMeter = await this.meteredCompare(ckShare, dataConvert, date, conceptPointList) // ignoreConcpetPoint ไปก่อนจนกว่าจะทำข้อที่ให้ปรับ concpet point ใหม่
          // console.log('compareMeter : ', compareMeter);
          return compareMeter
        }
      })
    )
    const result_ = compareMeterEachDay.flat()

    if (userId) {
      const userType = await this.prisma.user_type.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(userId)
            }
          }
        }
      })
      if (userType?.id === 3) {
        const group_ = await this.prisma.group.findFirst({
          where: {
            account_manage: {
              some: {
                account_id: Number(userId)
              }
            }
          },
          include: {
            shipper_contract_point: {
              include: {
                contract_point: {
                  include: {
                    nomination_point_list: {
                      include: {
                        metering_point: true
                      }
                    }
                  }
                }
              }
            }
          }
        })
        const contractCode = await this.prisma.contract_code.findMany({
          where: {
            group_id: group_?.id,
            contract_start_date: {
              lte: dayjs(end_date || start_date, 'YYYY-MM-DD')
                .endOf('day')
                .toDate()
            },
            ...(end_date && {
              contract_end_date: {
                gte: dayjs(start_date, 'YYYY-MM-DD').startOf('day').toDate()
              }
            })
          },
          select: {
            id: true,
            contract_start_date: true,
            contract_end_date: true,
            booking_version: {
              include: {
                booking_row_json: {
                  select: {
                    contract_point: true
                  }
                }
              },
              where: {
                flag_use: true
              }
            }
          }
        })

        const contract_point_contractSE = contractCode?.flatMap((fm: any) => {
          return fm?.booking_version?.flatMap((fm_v: any) => {
            return fm_v?.booking_row_json?.flatMap((fm_r: any) => {
              return {
                contract_start_date: fm?.contract_start_date,
                contract_end_date: fm?.contract_end_date,
                contract_point: fm_r?.contract_point
              }
            })
          })
        })
        // console.log('group_ : ', group_);
        const startDate = getTodayStartAdd7(start_date == 'undefined' ? undefined : start_date)
        const endDate = getTodayEndAdd7(end_date == 'undefined' ? undefined : end_date)
        const metering_point_name = await this.prisma.metering_point.findMany({
          where: {
            AND: [
              {
                start_date: {
                  lte: endDate.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                }
              },
              {
                OR: [
                  {
                    end_date: null
                  }, // ถ้า end_date เป็น null
                  {
                    end_date: {
                      gte: startDate.toDate()
                    }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          },
          include: {
            // point_type: true,
            // entry_exit: true,
            // customer_type: true,
            // zone: true,
            // area: true,
            non_tpa_point: true,
            nomination_point: true
          },
          orderBy: {
            id: 'desc'
          }
        })

        // nomination_point?.nomination_point

        // metered_point_name

        // console.log('metering_point_name : ', metering_point_name);

        // metering_point
        // https://app.clickup.com/t/86euzxxpk
        const metered_point_nom_ = group_?.shipper_contract_point
          ?.flatMap((fm: any) => {
            return fm?.contract_point?.nomination_point_list?.flatMap((fm_: any) => {
              const mtName = fm_?.metering_point?.map((e: any) => e?.metered_point_name)
              // mtName
              const fMt = metering_point_name?.filter((f: any) => f?.nomination_point?.nomination_point === fm_?.nomination_point)
              return {
                metering_point: mtName?.length > 0 ? mtName : fMt?.map((e: any) => e?.metered_point_name),
                nomination_point: fm_?.nomination_point,
                contract_point: fm?.contract_point?.contract_point
              }
            })
          })
          ?.filter((f: any) => contract_point_contractSE?.map((cp: any) => cp?.contract_point)?.includes(f?.contract_point))

        const metered_point_nom_se = metered_point_nom_?.map((e: any) => {
          const contractCodeSE = contract_point_contractSE?.filter((f: any) => f?.contract_point === e?.contract_point)
          return {
            ...e,
            contractCodeSE: contractCodeSE || []
          }
        })

        const newresult_ = result_?.filter((f: any) => {
          const meterGasday = dayjs(f?.gasDay)
          let isHaveActiveConceptPoint = false
          const activeDataForDate = activeData?.find((ad) => ad.date === meterGasday.format('YYYY-MM-DD'))

          if (activeDataForDate) {
            const conceptPointList = activeDataForDate.activeConceptPoints || []
            isHaveActiveConceptPoint = conceptPointList.some((cp) => {
              return cp.concept_point === f.meteringPointId
            })
          }

          const meteringPointId = metered_point_nom_se?.filter((m_: any) => m_?.metering_point?.includes(f?.meteringPointId))
          if (meteringPointId?.length > 0) {
            const seDate = meteringPointId?.flatMap((fm: any) => {
              return fm?.contractCodeSE?.map((ccSE: any) => {
                return {
                  contract_start_date: ccSE?.contract_start_date,
                  contract_end_date: ccSE?.contract_end_date
                }
              })
            })
            const minStartDate: dayjs.Dayjs = seDate?.reduce(
              (min: dayjs.Dayjs, item: any) => {
                return dayjs(item.contract_start_date).isBefore(min) ? dayjs(item.contract_start_date) : min
              },
              dayjs(seDate?.[0].contract_start_date) as dayjs.Dayjs
            )

            const maxEndDate: dayjs.Dayjs = seDate?.reduce(
              (max: dayjs.Dayjs, item: any) => {
                return dayjs(item.contract_end_date).isAfter(max) ? dayjs(item.contract_end_date) : max
              },
              dayjs(seDate?.[0].contract_end_date) as dayjs.Dayjs
            )

            const gasDay = dayjs(f?.gasDay)

            const inRange = gasDay.isSameOrAfter(minStartDate) && gasDay.isBefore(maxEndDate)

            return inRange || isHaveActiveConceptPoint

            // const rangDate = [dayjs(minStartDate).format("YYYY-MM-DD"),dayjs(maxEndDate).format("YYYY-MM-DD")]

            // return  (
            //   rangDate?.includes(f?.gasDay)
            // )
          } else {
            return isHaveActiveConceptPoint
          }
        })

        // console.log('metered_point_nom_se : ', metered_point_nom_se);
        // console.log('metered_point_nom_ : ', metered_point_nom_);
        // console.log('result_ : ', result_);
        // console.log('newresult_ : ', newresult_);

        return newresult_
      } else {
        console.log('result_ : ', result_)
        console.log(
          '[H] result_ : ',
          result_?.filter((f: any) => f?.prop?.area?.name === 'H')
        )
        return result_
      }
    } else {
      console.log('result_ : ', result_)
      return result_
    }
  }

  // exceljs
  async componentGenExcelMeter(data: any, data2: any, data3: any, name: any) {
    // สร้าง workbook และ worksheet
    const workbook = XLSX.utils.book_new() // สร้าง workbook ใหม่
    const worksheet1 = XLSX.utils.aoa_to_sheet(data) // สร้าง sheet จาก array ของ array
    // const worksheet2 = XLSX.utils.aoa_to_sheet(data2); // สร้าง sheet จาก array ของ array
    // const worksheet3 = XLSX.utils.aoa_to_sheet(data3); // สร้าง sheet จาก array ของ array
    XLSX.utils.book_append_sheet(workbook, worksheet1, name) // เพิ่ม sheet ลงใน workbook
    // XLSX.utils.book_append_sheet(workbook, worksheet2, 'Quality'); // เพิ่ม sheet ลงใน workbook
    // XLSX.utils.book_append_sheet(workbook, worksheet3, 'Lists'); // เพิ่ม sheet ลงใน workbook
    const startRow = 2
    // const endRow = 5
    const endRow = 6
    const startCol = 0 // A = index 0
    // const endCol = 26 // AA = index 26
    const endCol = 27 // AA = index 26
    const targetRow = 4
    // const specialCols = ['A', 'B', 'D']
    const specialCols = ['A', 'B', 'E']
    const specialColor = 'B8CCE4'
    const defaultColor = '92D050'
    const boldRows = [2, 4]

    boldRows.forEach((row) => {
      // for (let col = 0; col <= 26; col++) {
      for (let col = 0; col <= 27; col++) {
        // A (0) → AA (26)
        const colLetter = XLSX.utils.encode_col(col) // เช่น 0 -> 'A'
        const cellAddress = `${colLetter}${row}`

        if (!worksheet1[cellAddress]) {
          worksheet1[cellAddress] = {
            t: 's',
            v: ''
          } // สร้างเซลล์เปล่าถ้ายังไม่มี
        }

        worksheet1[cellAddress].s = worksheet1[cellAddress].s || {}
        worksheet1[cellAddress].s.font = {
          ...(worksheet1[cellAddress].s.font || {}),
          bold: true
        }
      }
    })

    // ใส่สีให้ row 4
    // for (let col = 0; col <= 26; col++) {
    for (let col = 0; col <= 27; col++) {
      // A (0) → AA (26)
      const colLetter = XLSX.utils.encode_col(col) // เช่น 0 -> 'A'
      const cellAddress = `${colLetter}${targetRow}`

      if (!worksheet1[cellAddress]) {
        worksheet1[cellAddress] = {t: 's', v: ''} // สร้างเซลล์ถ้าไม่มี
      }

      worksheet1[cellAddress].s = worksheet1[cellAddress].s || {}
      worksheet1[cellAddress].s.fill = {
        patternType: 'solid',
        fgColor: {
          rgb: specialCols.includes(colLetter) ? specialColor : defaultColor
        }
      }

      // (เลือก) ถ้าอยากให้ text ชัดเจน ใส่ font เพิ่มได้
      // worksheet1[cellAddress].s.font = {
      //   bold: true,
      //   color: { rgb: '000000' },
      // };
    }

    Object.keys(worksheet1).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, ''))
      const columnLetter = cell.replace(/[0-9]/g, '')

      // ข้ามถ้า cell เป็น metadata เช่น !ref
      if (cell[0] === '!') return

      // 🔧 ถ้าเซลล์ยังไม่มี ให้สร้างก่อน
      if (!worksheet1[cell]) {
        worksheet1[cell] = {
          t: 's',
          v: ''
        }
      }

      //   ตั้งค่าประเภทข้อความ
      worksheet1[cell].z = '@'
      worksheet1[cell].t = 's'

      //   เตรียม style object
      worksheet1[cell].s = worksheet1[cell].s || {}
      worksheet1[cell].s.border = worksheet1[cell].s.border || {}

      //   ใส่ border บน-ล่าง เฉพาะแถวที่กำหนด
      if (rowNumber === startRow) {
        worksheet1[cell].s.border.top = {
          style: 'thin',
          color: {
            rgb: '92D050'
          }
        }
      }

      if (rowNumber === endRow) {
        worksheet1[cell].s.border.bottom = {
          style: 'thin',
          color: {
            rgb: '92D050'
          }
        }
      }

      //   ใส่ border ซ้าย-ขวา เฉพาะคอลัมน์แรกและสุดท้าย
      const colIndex = XLSX.utils.decode_col(columnLetter)
      if (colIndex === startCol) {
        worksheet1[cell].s.border.left = {
          style: 'thin',
          color: {
            rgb: '92D050'
          }
        }
      }

      if (colIndex === endCol) {
        worksheet1[cell].s.border.right = {
          style: 'thin',
          color: {
            rgb: '92D050'
          }
        }
      }
    })

    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    })

    // ส่ง buffer กลับไปเพื่อให้ controller สามารถใช้งานต่อไปได้
    return excelBuffer
  }

  async genExcelTemplateFinalMeter(payload: any) {
    const {gasDay} = payload
    // const data = [
    //   [], // Row 0
    //   ['Gas Day', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], // Row 1
    //   [`${gasDay}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    //   ['POINT_ID', 'REGISTER_TIMSTAMP', 'VOLUME', 'ENERGY', 'HV', 'WI', 'CO2', 'C1', 'C2', 'C3', 'iC4', 'nC4', 'iC5', 'nC5', 'C6', 'C7', 'C2+', 'N2', 'O2', 'H2S', 'S', 'Hg', 'Pressure', 'Moisture', 'DewPoint', 'SG', 'Datasource'],
    //   ['LMPT1', `${dayjs(gasDay).format("DD/MM/YYYY")} 00:00:00`, '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', 'Manual']
    //   // https://app.clickup.com/t/9018502823/86eub6d16
    //   // ['LMPT1', `${gasDay}T00:00:00.000+00:00`, '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', 'Manual']
    // ]
    const data = [
      [], // Row 0
      ['Gas Day', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], // Row 1
      [`${dayjs(gasDay).format('DD/MM/YYYY')}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['POINT_ID', 'REGISTER_TIMSTAMP', 'Gas Hour', 'VOLUME', 'ENERGY', 'HV', 'WI', 'CO2', 'C1', 'C2', 'C3', 'iC4', 'nC4', 'iC5', 'nC5', 'C6', 'C7', 'C2+', 'N2', 'O2', 'H2S', 'S', 'Hg', 'Pressure', 'Moisture', 'DewPoint', 'SG', 'Datasource'],
      ['LMPT1', `${dayjs(gasDay).format('DD/MM/YYYY')} 00:00:00`, '1', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', 'Manual']
      // https://app.clickup.com/t/9018502823/86eub6d16
      // ['LMPT1', `${gasDay}T00:00:00.000+00:00`, '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', '0.000', 'Manual']
    ]
    const data2 = []
    const data3 = []
    const nameFile = `Daily Metering Data`
    const excelBuffer = await this.componentGenExcelMeter(data, data2, data3, nameFile)

    // ส่ง buffer กลับไปเพื่อให้ controller สามารถใช้งานต่อไปได้
    return {
      excelBuffer,
      nameFile: `${nameFile}`
    }
  }

  async meteredCompareAll(master: any, meter: any) {
    let dataResultByMaster = []
    let dataResultByMeter = []

    for (let i = 0; i < master.length; i++) {
      const findMeter = meter?.find((f: any) => f?.meteringPointId === master[i]?.metered_point_name)

      if (findMeter) {
        //   ดึง contract_point_list ถ้ามีข้อมูล
        const contractPoints = !!master[i]?.non_tpa_point ? master[i]?.non_tpa_point?.nomination_point?.contract_point_list : master[i]?.nomination_point?.contract_point_list
        //   เลือกค่าแรกใน contract_point_list หรือกำหนดค่าเริ่มต้น * จะตำแหน่งไหน area/zone เหมือนกัน
        const firstContractPoint = contractPoints?.[0] || {}

        //   Extract ค่า area, zone, customer_type จาก contract_point_list
        const area = firstContractPoint?.area || null
        const zone = firstContractPoint?.zone || null
        const customer_type = !!master[i]?.non_tpa_point ? master[i]?.non_tpa_point?.nomination_point?.customer_type : master[i]?.nomination_point?.customer_type

        //   เพิ่มข้อมูลเข้า array
        dataResultByMaster.push({
          id: i + 1,
          meteringPointId: findMeter?.meteringPointId,
          prop: {
            area: area,
            zone: zone,
            customer_type: customer_type
          }
        })
      }
    }

    for (let i = 0; i < meter.length; i++) {
      const findMaster = (master || []).find((f: any) => f?.metered_point_name === meter[i]?.meteringPointId)

      if (findMaster) {
        //   เพิ่มข้อมูลเข้า array
        dataResultByMeter.push({
          ...meter[i]
          // prop: { area: area, zone: zone, customer_type: customer_type },
        })
      }
    }

    let dataResultByMasterNew = dataResultByMaster.map((e: any) => {
      const fil = dataResultByMeter.filter((f: any) => {
        return f?.meteringPointId === e?.meteringPointId
      })

      return {
        ...e,
        data: fil
      }
    })

    return dataResultByMasterNew
  }

  // registerTimestamp
  async meteringChecking(payload: any) {
    const {gasDay} = payload
    // "gasDay": "2025-03-30",
    const gDay = !!gasDay ? gasDay : getTodayNow().format('YYYY-MM-DD')

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'getLastHour',
        mode: 'metering',
        // start_date: start_date,
        // end_date: end_date
        // start_date: getTodayNow(gDay).format('YYYY-MM-DD'),
        // end_date: gDay,
        gas_day: gDay
      })
    )
    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null
    const meteredPoint: meteringPointWithRelations[] = await this.meteredMasterAll(gDay, gDay)
    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(gDay).toDate()
    const todayEnd = getTodayEndYYYYMMDDDfaultAdd7(gDay).toDate()

    const checkCondition = await this.prisma.check_condition.findFirst({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd
            }
          },
          {
            OR: [
              {
                end_date: null
              },
              {
                end_date: {
                  gte: todayStart
                }
              }
            ]
          }
        ]
      }
    })

    const newData = meteredPoint.map((e: any) => {
      const filMeter = dataConvert?.filter((f: any) => {
        return f?.meteringPointId === e?.metered_point_name
      })

      const grouped: any = Object.values(
        filMeter.reduce((acc, item, index) => {
          const key = item.metering_retrieving_id
          if (!acc[key]) {
            acc[key] = {
              index: index,
              group: key,
              metered_point_name: e?.metered_point_name,
              data: []
            }
          }
          acc[key].data.push(item)
          return acc
        }, {})
      )

      const fHrIn0 = (payl: any, hr: any) => {
        return (payl || []).find((f: any) => {
          return (
            // f?.hour === hr &&
            (f?.hour || f?.gasHour) === hr && // new
            f?.gasDay === gDay
          )
        })
      }

      let fH1 = null
      let fH2 = null
      let fH3 = null
      let fH4 = null
      let fH5 = null
      let fH6 = null
      let fH7 = null
      let fH8 = null
      let fH9 = null
      let fH10 = null
      let fH11 = null
      let fH12 = null
      let fH13 = null
      let fH14 = null
      let fH15 = null
      let fH16 = null
      let fH17 = null
      let fH18 = null
      let fH19 = null
      let fH20 = null
      let fH21 = null
      let fH22 = null
      let fH23 = null
      let fH24 = null
      // หาวัน และ เวลา h ตั้งต้น
      for (let iTime = 1; iTime <= grouped.length; iTime++) {
        if (!!!fH1?.data) {
          fH1 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 1)
            // data: fHrIn0(grouped[iTime]?.data, 0),
          }
        }
        if (!!!fH2?.data) {
          fH2 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 2)
          }
        }
        if (!!!fH3?.data) {
          fH3 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 3)
          }
        }
        if (!!!fH4?.data) {
          fH4 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 4)
          }
        }
        if (!!!fH5?.data) {
          fH5 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 5)
          }
        }
        if (!!!fH6?.data) {
          fH6 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 6)
          }
        }
        if (!!!fH7?.data) {
          fH7 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 7)
          }
        }
        if (!!!fH8?.data) {
          fH8 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 8)
          }
        }
        if (!!!fH9?.data) {
          fH9 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 9)
          }
        }
        if (!!!fH10?.data) {
          fH10 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 10)
          }
        }
        if (!!!fH11?.data) {
          fH11 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 11)
          }
        }
        if (!!!fH12?.data) {
          fH12 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 12)
          }
        }
        if (!!!fH13?.data) {
          fH13 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 13)
          }
        }
        if (!!!fH14?.data) {
          fH14 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 14)
          }
        }
        if (!!!fH15?.data) {
          fH15 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 15)
          }
        }
        if (!!!fH16?.data) {
          fH16 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 16)
          }
        }
        if (!!!fH17?.data) {
          fH17 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 17)
          }
        }
        if (!!!fH18?.data) {
          fH18 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 18)
          }
        }
        if (!!!fH19?.data) {
          fH19 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 19)
          }
        }
        if (!!!fH20?.data) {
          fH20 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 20)
          }
        }
        if (!!!fH21?.data) {
          fH21 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 21)
          }
        }
        if (!!!fH22?.data) {
          fH22 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 22)
          }
        }
        if (!!!fH23?.data) {
          fH23 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 23)
          }
        }
        if (!!!fH24?.data) {
          fH24 = {
            ix: iTime,
            data: fHrIn0(grouped[iTime]?.data, 24)
          }
        }
      }

      const hNumber = (hr: any) => {
        if (hr === '00') {
          return 1
        } else if (hr === '01') {
          return 2
        } else if (hr === '02') {
          return 3
        } else if (hr === '03') {
          return 4
        } else if (hr === '04') {
          return 5
        } else if (hr === '05') {
          return 6
        } else if (hr === '06') {
          return 7
        } else if (hr === '07') {
          return 8
        } else if (hr === '08') {
          return 9
        } else if (hr === '09') {
          return 10
        } else if (hr === '10') {
          return 11
        } else if (hr === '11') {
          return 12
        } else if (hr === '12') {
          return 13
        } else if (hr === '13') {
          return 14
        } else if (hr === '14') {
          return 15
        } else if (hr === '15') {
          return 16
        } else if (hr === '16') {
          return 17
        } else if (hr === '17') {
          return 18
        } else if (hr === '18') {
          return 19
        } else if (hr === '19') {
          return 20
        } else if (hr === '20') {
          return 21
        } else if (hr === '21') {
          return 22
        } else if (hr === '22') {
          return 23
        } else if (hr === '23') {
          return 24
        }
      }

      const calcHf = (hourN: any) => {
        if (!!hourN?.data) {
          const calcArrH = grouped.slice(hourN?.ix + 1)
          const h_step_main = hourN?.data
          const h_step_h1 = calcArrH[0]?.data[0] || null
          const h_step_h2 = calcArrH[1]?.data[0] || null

          const checkMandH1 = h_step_main?.gasDay !== h_step_h1?.gasDay ? true : false // true 0 คือ ข้ามวัน
          const checkH1andhH2 = h_step_h1?.gasDay !== h_step_h2?.gasDay ? true : false // true 0 คือ ข้ามวัน
          const hourM = (!!h_step_main?.energy && Number(h_step_main?.energy)) || 0
          const hourH1 = checkMandH1 ? 0 : (!!h_step_h1?.energy && Number(h_step_h1?.energy)) || 0
          const hourH2 = checkH1andhH2 ? 0 : (!!h_step_h2?.energy && Number(h_step_h2?.energy)) || 0

          const nhourM = hNumber(dayjs(h_step_main?.registerTimestamp).format('HH'))
          const nhourH1 = checkMandH1 ? 0 : hNumber(dayjs(h_step_h1?.registerTimestamp).format('HH'))
          const nhourH2 = checkH1andhH2 ? 0 : hNumber(dayjs(h_step_h2?.registerTimestamp).format('HH'))
          // สูตร ABS((h1-0)/(1-0)-(h24-h23)/(24-23)) h1 => 1 ชั่งโมงตัวเอง, 0 = ข้ามวัน, (1-0 คือชั่วโมงตัวเองลบชั่วโมงก่อนหน้า ถ้าก่อนหน้าข้ามวันให้ 0), (24-23 คือชั่วโมงตัวก่อนหน้าลบชั่วโมงก่อนหน้า2ชม ถ้าก่อนหน้าลบชั่วโมงก่อนหน้า2ชมข้ามวันให้ 0)
          const calcCondition1 = Math.abs((hourM - hourH1) / (nhourM - nhourH1) - (hourH1 - hourH2) / (nhourH1 - nhourH2))

          if (calcCondition1 === Infinity) {
            return {
              url: 'Div/0',
              type: 'Div/0'
            }
          }
          if (calcCondition1 < 0) {
            return {
              url: checkCondition?.red_url || null,
              type: 'red_url'
            }
          }
          if (calcCondition1 < (checkCondition?.thershold_float === null ? checkCondition?.thershold : checkCondition?.thershold_float)) {
            return {
              url: checkCondition?.green_url || null,
              type: 'green_url'
            }
          } else {
            // สูตร ((h1-h2)/(t1-t2))/(ABS(h2-h3)/(T2-T3))*100
            const calcCondition2 = ((hourM - hourH1) / (nhourM - nhourH1) / (Math.abs(hourH1 - hourH2) / (nhourH1 - nhourH2))) * 100
            if (calcCondition2 === Infinity) {
              return {
                url: 'Div/0',
                type: 'Div/0'
              }
            }
            if (calcCondition2 > checkCondition?.orange_value) {
              return {
                url: '>%high',
                type: '>%high'
              }
            }
            if (calcCondition2 < checkCondition?.yellow_value) {
              if (calcCondition2 < 0) {
                return {
                  url: checkCondition?.red_url || null,
                  type: 'red_url'
                }
              } else if (calcCondition2 === 0) {
                return {
                  url: checkCondition?.purple_url || null,
                  type: 'purple_url'
                }
              } else {
                return {
                  url: '<%low',
                  type: '<%low'
                }
              }
            } else {
              return {
                url: checkCondition?.green_url || null,
                type: 'green_url'
              }
            }
          }
        } else {
          return {
            url: checkCondition?.gray_url || null,
            type: 'gray_url'
          }
        }
      }
      const nFH1 = calcHf(fH1)
      const nFH2 = calcHf(fH2)
      const nFH3 = calcHf(fH3)
      const nFH4 = calcHf(fH4)
      const nFH5 = calcHf(fH5)
      const nFH6 = calcHf(fH6)
      const nFH7 = calcHf(fH7)
      const nFH8 = calcHf(fH8)
      const nFH9 = calcHf(fH9)
      const nFH10 = calcHf(fH10)
      const nFH11 = calcHf(fH11)
      const nFH12 = calcHf(fH12)
      const nFH13 = calcHf(fH13)
      const nFH14 = calcHf(fH14)
      const nFH15 = calcHf(fH15)
      const nFH16 = calcHf(fH16)
      const nFH17 = calcHf(fH17)
      const nFH18 = calcHf(fH18)
      const nFH19 = calcHf(fH19)
      const nFH20 = calcHf(fH20)
      const nFH21 = calcHf(fH21)
      const nFH22 = calcHf(fH22)
      const nFH23 = calcHf(fH23)
      const nFH24 = calcHf(fH24)

      let timeHr = {
        '00:00': nFH1?.url,
        '01:00': nFH2?.url,
        '02:00': nFH3?.url,
        '03:00': nFH4?.url,
        '04:00': nFH5?.url,
        '05:00': nFH6?.url,
        '06:00': nFH7?.url,
        '07:00': nFH8?.url,
        '08:00': nFH9?.url,
        '09:00': nFH10?.url,
        '10:00': nFH11?.url,
        '11:00': nFH12?.url,
        '12:00': nFH13?.url,
        '13:00': nFH14?.url,
        '14:00': nFH15?.url,
        '15:00': nFH16?.url,
        '16:00': nFH17?.url,
        '17:00': nFH18?.url,
        '18:00': nFH19?.url,
        '19:00': nFH20?.url,
        '20:00': nFH21?.url,
        '21:00': nFH22?.url,
        '22:00': nFH23?.url,
        '23:00': nFH24?.url,
        'type_00:00': nFH1?.type,
        'type_01:00': nFH2?.type,
        'type_02:00': nFH3?.type,
        'type_03:00': nFH4?.type,
        'type_04:00': nFH5?.type,
        'type_05:00': nFH6?.type,
        'type_06:00': nFH7?.type,
        'type_07:00': nFH8?.type,
        'type_08:00': nFH9?.type,
        'type_09:00': nFH10?.type,
        'type_10:00': nFH11?.type,
        'type_11:00': nFH12?.type,
        'type_12:00': nFH13?.type,
        'type_13:00': nFH14?.type,
        'type_14:00': nFH15?.type,
        'type_15:00': nFH16?.type,
        'type_16:00': nFH17?.type,
        'type_17:00': nFH18?.type,
        'type_18:00': nFH19?.type,
        'type_19:00': nFH20?.type,
        'type_20:00': nFH21?.type,
        'type_21:00': nFH22?.type,
        'type_22:00': nFH23?.type,
        'type_23:00': nFH24?.type
      }

      return {
        ...e,
        gasDay,
        meteringPointId: e?.metered_point_name,
        ...timeHr
      }
    })

    return newData
  }

  async meteringChecking2(payload: any, userId?: any) {
    const {gasDay} = payload

    const gasDayjs = !!gasDay ? getTodayNowYYYYMMDDDfaultAdd7(gasDay) : getTodayNow()
    if (!gasDayjs.isValid()) {
      return []
    }
    const gDay = gasDayjs.format('YYYY-MM-DD')

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'getLastHour',
        mode: 'metering',
        gas_day: gDay
      })
    )
    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    const yeterdayMeteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'getLastHour',
        mode: 'metering',
        gas_day: gasDayjs.subtract(1, 'day').format('YYYY-MM-DD')
      })
    )
    const yeterdayDataConvert = (!!yeterdayMeteredMicroData?.reply && JSON.parse(yeterdayMeteredMicroData?.reply)) || null

    const meteredPoint: meteringPointWithRelations[] = await this.meteredMasterAll(gDay, gDay)
    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(gDay).toDate()
    const todayEnd = getTodayEndYYYYMMDDDfaultAdd7(gDay).toDate()

    const conceptPointAndInWhere: Prisma.concept_pointWhereInput[] = [
      {
        type_concept_point_id: 4 //Metering Physical gas concept
      },
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
              gt: todayStart
            }
          } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
        ]
      }
    ]

    if (userId) {
      const userType = await this.prisma.user_type.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(userId)
            }
          }
        }
      })

      if (userType?.id === 3) {
        const group_ = await this.prisma.group.findFirst({
          where: {
            account_manage: {
              some: {
                account_id: Number(userId)
              }
            }
          },
          include: {
            shipper_contract_point: {
              include: {
                contract_point: {
                  include: {
                    nomination_point_list: {
                      include: {
                        metering_point: true
                      }
                    }
                  }
                }
              }
            }
          }
        })

        if (group_) {
          conceptPointAndInWhere.push({
            limit_concept_point_history: {
              some: {
                group_id: group_.id,
                create_date: {lte: todayEnd},
                OR: [{deleted_date: null}, {deleted_date: {gte: todayStart}}]
              }
            }
          })
        }
      }
    }

    const conceptPoint = await this.prisma.concept_point.findMany({
      where: {
        AND: conceptPointAndInWhere
      }
    })

    const checkCondition = await this.prisma.check_condition.findFirst({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd
            }
          },
          {
            OR: [
              {
                end_date: null
              },
              {
                end_date: {
                  gt: todayStart
                }
              }
            ]
          }
        ]
      }
    })

    // const consoleMeterName = 'ZAWTIKA'

    const defaultUrl = checkCondition?.gray_url ?? null

    // let logsData = [];

    // const newDate = dayjs();

    // for(const point of meteredPoint){
    //   const filMeter = dataConvert?.filter((f: any) => {
    //     return f?.meteringPointId === point?.metered_point_name && (f?.energy || f?.energy == 0 || f?.energy == '0');
    //   });

    //   let target = undefined
    //   if(filMeter.length > 0){
    //     const lastestInsertTimestamp = filMeter.reduce((latest: any, current: any) => {
    //       return getTimestampValue(current?.insert_timestamp) > getTimestampValue(latest?.insert_timestamp) ? current : latest;
    //     }, null);
    //     target = lastestInsertTimestamp
    //   }

    //   if(target){
    //     const runNumId = await this.prisma.metered_run_number.findFirst({
    //       where: {
    //         metering_retrieving_id: target?.metering_retrieving_id,
    //       },
    //     })
    //     if(runNumId?.id){
    //       const count = await this.prisma.metered_retrieving.count({
    //         where: {
    //           del_flag: true,
    //           type: 'mastering data check',
    //           metered_run_number_id: runNumId.id,
    //           metering_point_sys: target?.meteringPointId
    //         ,
    //         gas_day: {
    //           gte: todayStart,
    //           lte: todayEnd
    //         }
    //         },
    //       })

    //       if (count == 0 && !logsData.some((f: any) => {
    //         return f.metering_point_sys === target.meteringPointId
    //       })) {

    //         logsData.push({
    //           metered_run_number_id: runNumId.id,
    //           temp: JSON.stringify(target.data_temp),
    //           type: 'mastering data check',
    //           description: `The point ${target.meteringPointId} already retrieved Metering data`,
    //           timestamp: todayStart,
    //           metering_point_sys: target.meteringPointId,
    //           gas_day: gasDayjs.toDate(),
    //           del_flag: true,
    //           create_date: newDate.toDate(),
    //           create_date_num: newDate.unix(),
    //         });
    //       }
    //     }
    //   }

    // }

    // if (logsData.length > 0) {
    //   // await this.prisma.metered_retrieving.createMany({
    //   //   data: logsData,
    //   // });
    // }

    const newData = [...meteredPoint, ...conceptPoint].map((e: any) => {
      const eachHourData: Record<number, any> = {
        1: undefined,
        2: undefined,
        3: undefined,
        4: undefined,
        5: undefined,
        6: undefined,
        7: undefined,
        8: undefined,
        9: undefined,
        10: undefined,
        11: undefined,
        12: undefined,
        13: undefined,
        14: undefined,
        15: undefined,
        16: undefined,
        17: undefined,
        18: undefined,
        19: undefined,
        20: undefined,
        21: undefined,
        22: undefined,
        23: undefined,
        24: undefined
      }

      let timeHr: Record<string, string | null> = {
        '00:00': defaultUrl,
        '01:00': defaultUrl,
        '02:00': defaultUrl,
        '03:00': defaultUrl,
        '04:00': defaultUrl,
        '05:00': defaultUrl,
        '06:00': defaultUrl,
        '07:00': defaultUrl,
        '08:00': defaultUrl,
        '09:00': defaultUrl,
        '10:00': defaultUrl,
        '11:00': defaultUrl,
        '12:00': defaultUrl,
        '13:00': defaultUrl,
        '14:00': defaultUrl,
        '15:00': defaultUrl,
        '16:00': defaultUrl,
        '17:00': defaultUrl,
        '18:00': defaultUrl,
        '19:00': defaultUrl,
        '20:00': defaultUrl,
        '21:00': defaultUrl,
        '22:00': defaultUrl,
        '23:00': defaultUrl,
        'type_00:00': 'gray_url',
        'type_01:00': 'gray_url',
        'type_02:00': 'gray_url',
        'type_03:00': 'gray_url',
        'type_04:00': 'gray_url',
        'type_05:00': 'gray_url',
        'type_06:00': 'gray_url',
        'type_07:00': 'gray_url',
        'type_08:00': 'gray_url',
        'type_09:00': 'gray_url',
        'type_10:00': 'gray_url',
        'type_11:00': 'gray_url',
        'type_12:00': 'gray_url',
        'type_13:00': 'gray_url',
        'type_14:00': 'gray_url',
        'type_15:00': 'gray_url',
        'type_16:00': 'gray_url',
        'type_17:00': 'gray_url',
        'type_18:00': 'gray_url',
        'type_19:00': 'gray_url',
        'type_20:00': 'gray_url',
        'type_21:00': 'gray_url',
        'type_22:00': 'gray_url',
        'type_23:00': 'gray_url'
      }

      if (checkCondition) {
        const filMeter = dataConvert?.filter((f: any) => {
          return f?.meteringPointId === e?.metered_point_name || f?.meteringPointId === e?.concept_point
        })

        const filMeterYeterday = yeterdayDataConvert?.filter((f: any) => {
          return f?.meteringPointId === e?.metered_point_name || f?.meteringPointId === e?.concept_point
        })

        for (let i = 1; i <= 24; i++) {
          if (eachHourData[i] == undefined) {
            const thisHourData = filMeter?.filter((meterData: any) => (meterData?.hour ?? meterData?.gasHour) === i && meterData?.gasDay === gDay && parseToNumber(meterData?.energy) != null)
            if ((thisHourData || [])?.length > 0) {
              const lastestInsertTimestamp = thisHourData.reduce((latest: any, current: any) => {
                return getTimestampValue(current?.insert_timestamp) > getTimestampValue(latest?.insert_timestamp) ? current : latest
              }, null)
              eachHourData[i] = lastestInsertTimestamp
            }
          }
        }

        const firstDefinedHour = Object.entries(eachHourData).find(([_, value]) => value !== undefined)?.[0]

        // if(e.metered_point_name === consoleMeterName || e?.concept_point === consoleMeterName){
        // }

        Object.entries(eachHourData).forEach(([key, value]) => {
          const hour = parseInt(key)
          if (value !== undefined) {
            const timeHrKey = `${(hour - 1).toString().padStart(2, '0')}:00`
            let prevHour = hour - 1

            let h_step_h1 = null
            let h_step_h2 = null

            while (prevHour > 0 && (h_step_h1 == null || h_step_h2 == null)) {
              if (eachHourData[prevHour] !== undefined) {
                if (h_step_h1 == null) {
                  h_step_h1 = eachHourData[prevHour]
                } else {
                  h_step_h2 = eachHourData[prevHour]
                }
              }
              prevHour--
            }

            if (h_step_h1 == null || h_step_h2 == null) {
              // ข้ามวัน
              prevHour = 24
              while (prevHour > 0 && (h_step_h1 == null || h_step_h2 == null)) {
                const prevHourData = filMeterYeterday.filter((meterData: any) => (meterData?.hour ?? meterData?.gasHour) === prevHour && parseToNumber(meterData?.energy) != null)
                if (prevHourData.length > 0) {
                  const lastestInsertTimestamp = prevHourData.reduce((latest: any, current: any) => {
                    return getTimestampValue(current?.insert_timestamp) > getTimestampValue(latest?.insert_timestamp) ? current : latest
                  }, null)

                  if (h_step_h1 == null) {
                    h_step_h1 = lastestInsertTimestamp
                  } else {
                    h_step_h2 = lastestInsertTimestamp
                  }
                }
                prevHour--
              }
            }

            // if(hour == parseInt(firstDefinedHour) && e.metered_point_name === consoleMeterName){
            // }

            const hourM = parseToNumber(value?.hour ?? value?.gasHour ?? 0)
            const hourH1ForM = value?.gasDay == h_step_h1?.gasDay ? parseToNumber(h_step_h1?.hour ?? h_step_h1?.gasHour ?? 0) : 0 // ถ้าข้ามวันให้ 0
            const hourH1 = parseToNumber(h_step_h1?.hour ?? h_step_h1?.gasHour ?? 0)
            const hourH2ForH1 = h_step_h2?.gasDay == h_step_h1?.gasDay ? parseToNumber(h_step_h2?.hour ?? h_step_h2?.gasHour ?? 0) : 0 // ถ้าข้ามวันให้ 0
            // const hourH2 = parseToNumber(h_step_h2?.hour ?? h_step_h2?.gasHour ?? 0);
            const energyM = parseToNumber(value?.energy ?? value?.data_temp?.energy ?? 0)
            const energyH1ForM = value?.gasDay == h_step_h1?.gasDay ? parseToNumber(h_step_h1?.energy ?? h_step_h1?.data_temp?.energy ?? 0) : 0 // ถ้าข้ามวันให้ 0
            const energyH1 = parseToNumber(h_step_h1?.energy ?? h_step_h1?.data_temp?.energy ?? 0)
            const energyH2ForH1 = h_step_h2?.gasDay == h_step_h1?.gasDay ? parseToNumber(h_step_h2?.energy ?? h_step_h2?.data_temp?.energy ?? 0) : 0 // ถ้าข้ามวันให้ 0
            // const energyH2 = parseToNumber(h_step_h2?.energy ?? h_step_h2?.data_temp?.energy ?? 0);

            const diff1 = energyM - energyH1ForM
            const diffHour1 = hourM - hourH1ForM
            const diff2 = energyH1 - energyH2ForH1
            const diffHour2 = hourH1 - hourH2ForH1

            const calcCondition1 = Math.abs(diff1 / diffHour1 - diff2 / diffHour2)

            // สูตร ((h1-h2)/(t1-t2))/(ABS(h2-h3)/(T2-T3))*100
            const calcCondition2 = (diff1 / diffHour1 / Math.abs(diff2 / diffHour2)) * 100

            timeHr[`calcCondition1_${timeHrKey}`] = `${calcCondition1}`
            timeHr[`calcCondition2_${timeHrKey}`] = `${calcCondition2}`
            if (calcCondition1 === Infinity) {
              timeHr[timeHrKey] = 'Div/0'
              timeHr[`type_${timeHrKey}`] = 'Div/0'
            } else if (calcCondition1 < (checkCondition?.thershold_float === null ? checkCondition?.thershold : checkCondition?.thershold_float)) {
              timeHr[timeHrKey] = checkCondition?.green_url || null
              timeHr[`type_${timeHrKey}`] = 'green_url'
            } else {
              if (calcCondition2 === Infinity) {
                timeHr[timeHrKey] = 'Div/0'
                timeHr[`type_${timeHrKey}`] = 'Div/0'
              } else if (calcCondition2 < 0) {
                timeHr[timeHrKey] = checkCondition?.red_url || null
                timeHr[`type_${timeHrKey}`] = 'red_url'
              } else if (calcCondition2 == 0) {
                timeHr[timeHrKey] = checkCondition?.purple_url || null
                timeHr[`type_${timeHrKey}`] = 'purple_url'
              } else if (calcCondition2 > checkCondition?.orange_value) {
                if (checkCondition && checkCondition.orange_mode == 2 && checkCondition?.orange_url) {
                  timeHr[timeHrKey] = checkCondition?.orange_url || null
                } else {
                  timeHr[timeHrKey] = '>%high'
                }
                timeHr[`type_${timeHrKey}`] = '>%high'
              } else if (calcCondition2 < checkCondition?.yellow_value) {
                if (checkCondition && checkCondition.yellow_mode == 2 && checkCondition.yellow_url) {
                  timeHr[timeHrKey] = checkCondition.yellow_url
                } else {
                  timeHr[timeHrKey] = '<%low'
                }
                timeHr[`type_${timeHrKey}`] = '<%low'
              } else {
                if (String(calcCondition1) === 'NaN' || String(calcCondition2) === 'NaN') {
                  // N/A ไม่ต้องเซ็ต
                } else {
                  timeHr[timeHrKey] = checkCondition?.green_url || null
                  timeHr[`type_${timeHrKey}`] = 'green_url'
                }
              }
            }
          }
        })
      }

      return {
        ...e,
        gasDay,
        meteringPointId: e?.metered_point_name ?? e?.concept_point,
        ...timeHr
      }
    })

    return newData
  }

  async updateExecuteStatus(payload: any, userId: any) {
    if (payload?.is_success) {
      try {
        const message = `Metering Interface: Data retrieving for the period ${payload.start_date} - ${payload.end_date} and executed on ${payload.insert_timestamp} finished OK   (Metering Input Code ${payload.metering_retrieving_id}). ${payload.susscess_points}/${payload.total_points} registers inserted. Allocation and Balancing process should be executed.`
        await middleNotiInapp(
          this.prisma,
          'Metering',
          message,
          77, // Metering Management menus_id
          1
        )
      } catch (error) {}
    } else {
      try {
        const message = `Metering Interface: Data retrieving for the period ${(payload && payload.start_date) || ''} - ${(payload && payload.end_date) || ''} and executed on ${(payload && payload.insert_timestamp) || ''} ${(payload && payload.message) || ''}.`
        await middleNotiInapp(
          this.prisma,
          'Metering',
          message,
          77, // Metering Management menus_id
          1
        )
      } catch (error) {}
    }

    return true
  }

  async test(query: any) {
    const {share, start_date, end_date} = query

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'getLast',
        mode: 'metering',
        // start_date: start_date,
        // end_date: end_date
        start_date: '2025-07-10',
        end_date: '2025-07-10'
      })
    )

    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null
    return dataConvert
  }

  async getDataLogic2(query: any, isReplaceMissingMeterWithNomination?: boolean, meterMaster?: any[], userId?: any) {
    const {share, start_date, end_date} = query

    let activeData: activeData[] | undefined = []
    const dateArray: string[] = []
    if (isReplaceMissingMeterWithNomination) {
      try {
        // Extract gas days and generate date array
        const getMeterFrom = getTodayNow(start_date)
        const getMeterTo = getTodayNow(end_date)

        const meteringPointMaster = meterMaster
          ? meterMaster
          : await this.prisma.metering_point.findMany({
              where: {
                OR: [
                  {
                    end_date: null
                  },
                  {
                    end_date: {
                      gt: getMeterFrom.toDate()
                    }
                  }
                ],
                start_date: {
                  lte: getMeterTo.toDate()
                }
              },
              ...meteringPointPopulate
            })

        const conceptPointAndInWhere: Prisma.concept_pointWhereInput[] = [
          {
            OR: [{end_date: null}, {end_date: {gt: getMeterFrom.toDate()}}]
          },
          {start_date: {lte: getMeterTo.toDate()}}
        ]

        if (userId) {
          const userType = await this.prisma.user_type.findFirst({
            where: {
              account_manage: {
                some: {
                  account_id: Number(userId)
                }
              }
            }
          })

          if (userType?.id === 3) {
            const group_ = await this.prisma.group.findFirst({
              where: {
                account_manage: {
                  some: {
                    account_id: Number(userId)
                  }
                }
              },
              include: {
                shipper_contract_point: {
                  include: {
                    contract_point: {
                      include: {
                        nomination_point_list: {
                          include: {
                            metering_point: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            })

            if (group_) {
              conceptPointAndInWhere.push({
                limit_concept_point_history: {
                  some: {
                    group_id: group_.id,
                    create_date: {lte: getMeterTo.toDate()},
                    OR: [{deleted_date: null}, {deleted_date: {gte: getMeterFrom.toDate()}}]
                  }
                }
              })
            }
          }
        }
        const conceptPointMaster: conceptPointWithRelations[] = await this.prisma.concept_point.findMany({
          where: {
            AND: conceptPointAndInWhere
          },
          ...conceptPointPopulate
        })

        // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
        let current = getMeterFrom.clone()
        while (current.isSameOrBefore(getMeterTo, 'day')) {
          dateArray.push((current && current.format('YYYY-MM-DD')) || dayjs().format('YYYY-MM-DD'))
          activeData.push({
            date: current.format('YYYY-MM-DD'),
            activeMeteringPoints: meteringPointMaster.filter((meteringPoint) => meteringPoint.start_date <= current.toDate() && (meteringPoint.end_date === null || meteringPoint.end_date >= current.toDate())),
            activeConceptPoints: conceptPointMaster.filter((conceptPoint) => conceptPoint.start_date <= current.toDate() && (conceptPoint.end_date === null || conceptPoint.end_date >= current.toDate()))
          })
          current = current.add(1, 'day')
        }
      } catch (error) {
        activeData = undefined
      }
    }

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'get-last-have-value',
        // mode: 'metering',
        mode: 'metering',
        start_date: start_date,
        end_date: end_date
        // start_date: "2025-03-08",
        // end_date:"2025-03-10"
      }),
      isReplaceMissingMeterWithNomination && activeData
        ? {
            activeData: activeData,
            prisma: this.prisma
          }
        : undefined
    )

    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    const compareMeterEachDay = await Promise.all(
      dateArray.map(async (date) => {
        // Find active data for this gas_day
        const activeDataForDate = activeData?.find((ad) => ad.date === date)
        if (activeDataForDate) {
          const meteredPoint = activeDataForDate?.activeMeteringPoints || []
          const conceptPointList = activeDataForDate?.activeConceptPoints || []

          const ckShare = share === 'on' ? await shareShipper(meteredPoint, this.prisma, null, null) : meteredPoint

          const compareMeter = await this.meteredCompare(ckShare, dataConvert, date, conceptPointList) // ignoreConcpetPoint ไปก่อนจนกว่าจะทำข้อที่ให้ปรับ concpet point ใหม่

          return compareMeter
        }
      })
    )
    return compareMeterEachDay.flat()
  }

  async getDataLogicNoCondept2(query: any, isReplaceMissingMeterWithNomination?: boolean, meterMaster?: any[]) {
    console.time('getDataLogicNoCondept2')
    const {share, start_date, end_date} = query

    let activeData: any[] | undefined = []
    let meteringPointMaster: any[] = []
    const dateArray: string[] = []
    if (isReplaceMissingMeterWithNomination) {
      try {
        console.time('getDataLogicNoCondept2 -1')
        // Extract gas days and generate date array
        const getMeterFrom = getTodayNow(start_date)
        const getMeterTo = getTodayNow(end_date)

        meteringPointMaster = meterMaster
          ? meterMaster
          : await this.prisma.metering_point.findMany({
              where: {
                OR: [
                  {
                    end_date: null
                  },
                  {
                    end_date: {
                      gt: getMeterFrom.toDate()
                    }
                  }
                ],
                start_date: {
                  lte: getMeterTo.toDate()
                }
              },
              ...meteringPointPopulate
            })

        // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
        let current = getMeterFrom.clone()
        console.timeEnd('getDataLogicNoCondept2 -1')
        console.time('getDataLogicNoCondept2 -2')
        while (current.isSameOrBefore(getMeterTo, 'day')) {
          dateArray.push((current && current.format('YYYY-MM-DD')) || dayjs().format('YYYY-MM-DD'))
          activeData.push({
            date: current.format('YYYY-MM-DD'),
            activeMeteringPoints: meteringPointMaster.filter((meteringPoint) => meteringPoint.start_date <= current.toDate() && (meteringPoint.end_date === null || meteringPoint.end_date >= current.toDate()))
          })
          current = current.add(1, 'day')
        }
        console.timeEnd('getDataLogicNoCondept2 -2')
      } catch (error) {
        activeData = undefined
      }
    } else {
      activeData = undefined
    }
    console.time('getDataLogicNoCondept2 -3')
    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'getLast',
        mode: 'metering',
        start_date: start_date,
        end_date: end_date
      }),
      isReplaceMissingMeterWithNomination && activeData
        ? {
            activeData: activeData,
            prisma: this.prisma
          }
        : undefined
    )
    console.timeEnd('getDataLogicNoCondept2 -3')
    console.timeEnd('getDataLogicNoCondept2')
    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null
    // const meteredPoint = await this.meteredMasterAll(start_date, end_date);
    const ckShare = share === 'on' || share == true ? await shareShipper(meteringPointMaster, this.prisma, null, null) : meteringPointMaster

    return {
      meterNom: ckShare,
      meter: dataConvert
    }
  }

  // tab metering data check
  // #region ปรับ mastering data check ไปเป็นถ้าไม่มีค่า energy เลยในช่วงเวลาที่เลือกถึงจะไปแสดงผลที่หน้าบ้าน
  async meteringRetrievingMasterCheckLimit2(limit: number = 100, offset: number = 0, startDate?: any, endDate?: any, metered_run_number_id?: any) {
    let andWhere: Prisma.metered_retrievingWhereInput[] = [
      {
        type: 'mastering data check'
      },
      {
        del_flag: true
      }
    ]

    if (metered_run_number_id) {
      andWhere.push({
        metered_run_number_id: Number(metered_run_number_id)
      })
    }

    const start = dayjs(startDate, 'YYYY-MM-DD')
    const end = dayjs(endDate, 'YYYY-MM-DD')
    if (start.isValid() || end.isValid()) {
      if (start.isValid()) {
        andWhere.push({
          gas_day: {
            gte: start.toDate()
          }
        })
      }
      if (end.isValid()) {
        andWhere.push({
          gas_day: {
            lte: end.toDate()
          }
        })
      }
    }

    // 1. Query ข้อมูลหลัก
    const resData = await this.prisma.metered_retrieving.findMany({
      where: {
        AND: andWhere
      },
      include: {
        metered_run_number: true
      },
      orderBy: {
        id: 'desc'
      }
    })
    const activeMeteringPoint = await this.prisma.metering_point.findMany({
      where: {
        start_date: {
          lte: end.toDate()
        },
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gte: start.toDate()
            }
          }
        ]
      }
    })
    const activeConceptPoint = await this.prisma.concept_point.findMany({
      where: {
        type_concept_point_id: 4, // Metering Physical gas concept
        start_date: {
          lte: end.toDate()
        },
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gte: start.toDate()
            }
          }
        ]
      }
    })

    // Group data by metering_point_sys
    // const groupedData = resData.reduce((acc: any, item: any) => {
    //   const meteringPointSys = item.metering_point_sys;
    //   if (!acc[meteringPointSys]) {
    //     acc[meteringPointSys] = [];
    //   }
    //   acc[meteringPointSys].push(item);
    //   return acc;
    // }, {});

    // ตอนเข้ามาที่หน้านี้จะไม่มีข้อมูลใน Table แสดงเลย ต้อง Filter From-To ก่อน เพื่อตรวจสอบว่ามี Point ไหนบ้างที่มีอยู่ในระบบเรา แล้วยังไม่ได้รับค่าจากแหล่งใดๆเลย (ค่า Energy) (ตรวจสอบตาม Generated From - To)
    // » ถ้าพบว่าวันใดวันหนึ่งของช่วงที่ filter  Point นั้นมี energy ถูกส่งมา ก็ไม่ต้องแสดงข้อมูลที่หน้านี้
    // เช่น Filter From : 1/10/2025 , To : 30/10/2025
    // หากระบบตรวจสอบพบว่า Meter Point ABC มีค่า Energy เข้ามาแค่วันที่ 5/10/2025 วันเดียว ระบบก็ไม่ต้องแสดงข้อมูลของ Point ABC ที่หน้านี้เลย

    // ถ้ามีตัวใดตัวนึง del_flag เป็น true หมายความว่า มีตัวนั้นมีค่ามาแล้วให้ลบออก
    const removedMeterPointThatHaveEnergy = activeMeteringPoint.filter((meteringPoint) => !resData.some((e: any) => isMatch(e.metering_point_sys, meteringPoint.metered_point_name)))
    const removedConceptPointThatHaveEnergy = activeConceptPoint.filter((conceptPoint) => !resData.some((e: any) => isMatch(e.metering_point_sys, conceptPoint.concept_point)))

    // ทำให้เหลือแค่ meter อย่างละตัว
    // Get the latest start_day for each activeMeteringPoint
    const latestRecord = removedMeterPointThatHaveEnergy.reduce((acc: any[], current) => {
      const existingIndex = acc.findIndex((item) => item.metered_point_name === current.metered_point_name)

      if (existingIndex === -1) {
        // If metered_point_name not found, add current item
        acc.push(current)
      } else if (current.start_date > acc[existingIndex].start_date) {
        // If found and current start_date is later, replace with current
        acc[existingIndex] = current
      }

      return acc
    }, [])

    // ทำให้เหลือแค่ concept point อย่างละตัว
    // Get the latest start_day for each activeConceptPoint
    const latestConceptPointRecord = removedConceptPointThatHaveEnergy.reduce((acc: any[], current) => {
      const existingIndex = acc.findIndex((item) => item.metered_point_name === current.concept_point)

      if (existingIndex === -1) {
        // If metered_point_name not found, add current item
        acc.push(current)
      } else if (current.start_date > acc[existingIndex].start_date) {
        // If found and current start_date is later, replace with current
        acc[existingIndex] = current
      }

      return acc
    }, [])

    const meteredWithLatestGasDay = []
    Object.values(latestRecord).map((meteringPoint) => {
      meteredWithLatestGasDay.push({
        type: 'mastering data check',
        description: meteringPoint.description,
        metering_point_sys: meteringPoint.metered_point_name,
        gas_day: end.toISOString(),
        temp: JSON.stringify({
          gasDay: end.format('YYYY-MM-DD'),
          meteringPointId: meteringPoint.metered_point_name
        })
      })
    })
    Object.values(latestConceptPointRecord).map((conceptPoint) => {
      meteredWithLatestGasDay.push({
        type: 'mastering data check',
        description: '',
        metering_point_sys: conceptPoint.concept_point,
        gas_day: end.toISOString(),
        temp: JSON.stringify({
          gasDay: end.format('YYYY-MM-DD'),
          meteringPointId: conceptPoint.concept_point
        })
      })
    })

    // 2. Query นับ total
    const total = meteredWithLatestGasDay.length

    // 3. Process data
    const newResData = meteredWithLatestGasDay.map((e: any) => {
      e['data'] = (!!e['temp'] && JSON.parse(e['temp'])) || null
      delete e['temp']
      return {...e}
    })

    // 3.1
    // https://app.clickup.com/t/86euzxxmp
    // » ถ้าพบว่าวันใดวันหนึ่งของช่วงที่ filter  Point นั้นมี energy ถูกส่งมา ก็ไม่ต้องแสดงข้อมูลที่หน้านี้
    // เช่น Filter From: 1 / 10 / 2025, To : 30 / 10 / 2025
    // หากระบบตรวจสอบพบว่า Meter Point ABC มีค่า Energy เข้ามาแค่วันที่ 5 / 10 / 2025 วันเดียว ระบบก็ไม่ต้องแสดงข้อมูลของ Point ABC ที่หน้านี้เลย

    // // ต้องทำกรองจาก dam ดูว่ามี point มี energy ไม่แสดง
    // const pointInDam = await this.prisma.metering_point.findMany({
    //   orderBy: {
    //     start_date: 'asc',
    //   },
    // });

    // เอา pointInDam มาหาว่าใน newResData มีอยู่มั้ย ถ้ามีแล้วมี newResData.energy มั้ย
    // ถ้ามี energy เอาออก

    // 4. Return แบบรองรับ frontend
    return {
      total,
      // data: newResData.slice(Number(offset), Number(offset) + Number(limit)),
      data: newResData,
      limit: Number(limit),
      offset: Number(offset)
    }
  }

  async checkData2() {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const meteredMaster = await this.prisma.metering_point.findMany({
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
      select: {
        metered_point_name: true
      },
      orderBy: {
        id: 'desc'
      }
    })

    const resData = await this.prisma.metered_retrieving.findMany({
      where: {
        del_flag: null,
        type: 'mastering data check'
      },
      select: {
        id: true,
        metering_point_sys: true
      },
      orderBy: {
        id: 'desc'
      }
    })
    let dataSet: any = []
    for (let i = 0; i < resData.length; i++) {
      const find = meteredMaster.find((f: any) => {
        return f?.metered_point_name === resData[i]?.metering_point_sys
      })
      if (find) {
        dataSet.push(resData[i]?.id)
      }
    }
    // if (dataSet.length > 0) {
    //   await this.prisma.metered_retrieving.updateMany({
    //     where: {
    //       id: {
    //         in: dataSet,
    //       },
    //     },
    //     data: {
    //       del_flag: true,
    //     },
    //   });
    // }

    return {
      count: dataSet.length
    }
  }

  // ...
  async uploadFile2(
    file: any,
    fileOriginal: any
    // userId: any,
  ) {
    // dayjs(gasDay).format('DD/MM/YYYY')
    const newDate = getTodayNow()
    try {
      const newDate7 = getTodayNowAdd7()
      const todayStart = getTodayStartAdd7().toDate()
      const todayEnd = getTodayEndAdd7().toDate()
      const findData = JSON.parse(file?.jsonDataMultiSheet)

      const meteredCount = await this.prisma.metered_run_number.count({
        where: {
          create_date: {
            gte: todayStart, // มากกว่าหรือเท่ากับเวลาเริ่มต้นของวันนี้
            lte: todayEnd // น้อยกว่าหรือเท่ากับเวลาสิ้นสุดของวันนี้
          }
        }
      })
      const meteringRetrievingId = `${newDate7.format('YYYYMMDD')}-MET-${(meteredCount > 0 ? meteredCount + 1 : 1).toString().padStart(4, '0')}`
      const insertTimestamp = newDate.format('YYYY-MM-DD HH:mm:ss')
      let meterArr = []

      const sheetArr = findData.filter((f: any) => {
        return /^Daily Metering Data(\s\(\d+\))?$/.test(f?.sheet || '')
      })

      if (sheetArr.length <= 0) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Sheet name is invalid.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      for (let i = 0; i < sheetArr.length; i++) {
        const sheet1 = sheetArr[i]

        const gasDay = sheet1.data[1]
        const headerCol = sheet1.data[2]
        let valueCol = sheet1.data.slice(3)
        function isValidGasDay(value) {
          // ต้องเป็น string ก่อน
          if (typeof value?.[0] !== 'string') return false

          // ตรวจว่าเป็นรูปแบบ YYYY-MM-DD และเป็นวันจริง
          if (dayjs(value?.[0], 'YYYY-MM-DD', true).isValid()) {
            return true
          } else {
            return dayjs(value?.[0], 'DD/MM/YYYY', true).isValid()
          }
        }

        if (!gasDay || !isValidGasDay(gasDay)) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Gas Day is required.'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        const ddmmyyyy = dayjs(gasDay[0], 'DD/MM/YYYY', true)
        if (ddmmyyyy.isValid()) {
          gasDay[0] = ddmmyyyy.format('YYYY-MM-DD')
        }

        if (valueCol.length === 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Required field is missing: Point_ID / Register Timestamp / Energy.'
            },
            HttpStatus.BAD_REQUEST
          )
        }
        // 2025-07-09T11:30:00.569+01:00

        function isValidStrictIsoDatetime(value) {
          if (typeof value !== 'string') return false

          const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/

          return regex.test(value)
        }

        const correctHeaders = ['POINT_ID', 'REGISTER_TIMSTAMP', 'Gas Hour', 'VOLUME', 'ENERGY', 'HV', 'WI', 'CO2', 'C1', 'C2', 'C3', 'iC4', 'nC4', 'iC5', 'nC5', 'C6', 'C7', 'C2+', 'N2', 'O2', 'H2S', 'S', 'Hg', 'Pressure', 'Moisture', 'DewPoint', 'SG', 'Datasource']

        const validateNegativeHeaders = ['VOLUME', 'ENERGY', 'HV', 'WI']

        function validateHeaderCol(headerCol, correctHeaders) {
          // แปลง object → array
          const values = Object.values(headerCol)

          // ตรวจว่าความยาวต้องเท่ากัน
          if (values.length !== correctHeaders.length) {
            return false
          }

          // เช็คค่าทีละตัว
          for (let i = 0; i < values.length; i++) {
            if (values[i] !== correctHeaders[i]) {
              return false
            }
          }

          return true
        }

        if (!validateHeaderCol(headerCol, correctHeaders)) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Template format is invalid.'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        const validateNegativeCol = Object.entries(headerCol).filter(([key, value]) => {
          return validateNegativeHeaders.some((header) => isMatch(`${value}`, header))
        })
        const validateList: Record<string, string[]> = {}
        // Required field is missing: Point_ID / Register Timestamp / Energy.
        const newValue = valueCol.map((e: any) => {
          const headerRow = Object.keys(headerCol).map((obj: any) => {
            if (Number(obj) >= 2) {
              const value = e[obj]
              if (value !== undefined && value !== null) {
                if (Number(value) < 0 && validateNegativeCol.some(([key, colValue]) => isMatch(`${obj}`, key))) {
                  if (validateList['negativeValues']) {
                    validateList['negativeValues'] = [...validateList['negativeValues'], e['0']]
                  } else {
                    validateList['negativeValues'] = [e['0']]
                  }
                  // throw new HttpException(
                  //   {
                  //     status:
                  //       HttpStatus.BAD_REQUEST,
                  //     error:
                  //       'Negative values are not allowed in Volume, Energy, HV, or WI.'
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                }
              }
            }
            if (Number(obj) === 1) {
              if (!!!e[obj]) {
                if (validateList['timestamp']) {
                  validateList['timestamp'] = [...validateList['timestamp'], e['0']]
                } else {
                  validateList['timestamp'] = [e['0']]
                }
                // // https://app.clickup.com/t/86eub6d6p
                // throw new HttpException(
                //   {
                //     status:
                //       HttpStatus.BAD_REQUEST,
                //     error:
                //       'Required field is missing: Register Timestamp.'
                //   },
                //   HttpStatus.BAD_REQUEST
                // )
              } else {
                // const ckRegis = isValidStrictIsoDatetime(e[obj])
                console.log('e[obj] : ', e[obj])
                // const ckRegis = isValidStrictIsoDatetime(e[obj])
                const ckRegis = dayjs(e[obj], 'DD/MM/YYYY HH:mm:ss', true).isValid()

                if (!ckRegis) {
                  if (validateList['dateFormatNotMatch']) {
                    validateList['dateFormatNotMatch'] = [...validateList['dateFormatNotMatch'], e['0']]
                  } else {
                    validateList['dateFormatNotMatch'] = [e['0']]
                  }
                  // throw new HttpException(
                  //   {
                  //     status:
                  //       HttpStatus.BAD_REQUEST,
                  //     error:
                  //       'Register Timestamp must be earlier or equal to Current date.'
                  //   },
                  //   HttpStatus.BAD_REQUEST
                  // )
                } else {
                  // const convertFormat = 'YYYY-MM-DD HH:mm:ss'
                  // const registerTime = dayjs(dayjs.utc(e[obj]).format(convertFormat), convertFormat)
                  const convertFormat = 'YYYY-MM-DD HH:mm:ss'
                  const registerTime = dayjs(e[obj], 'DD/MM/YYYY HH:mm:ss').format(convertFormat)
                  if (newDate7.isBefore(registerTime)) {
                    if (validateList['earlierTimestamp']) {
                      validateList['earlierTimestamp'] = [...validateList['earlierTimestamp'], e['0']]
                    } else {
                      validateList['earlierTimestamp'] = [e['0']]
                    }
                  }
                }
                e[obj] = e[obj].split('+')[0]
              }
            }
            return {
              [headerCol[obj]]: {
                key: obj,
                value: e[obj] || null
              }
            }
          })

          const merged = Object.assign({}, ...headerRow)
          return merged
        })

        if (validateList['negativeValues']) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: `Point ${[...new Set(validateList['negativeValues'])].join(', ')}; Negative values are not allowed in Volume, Energy, HV, or WI.`
            },
            HttpStatus.BAD_REQUEST
          )
        }
        if (validateList['timestamp']) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: `Point ${[...new Set(validateList['timestamp'])].join(', ')}; Required field is missing: Register Timestamp.`
            },
            HttpStatus.BAD_REQUEST
          )
        }
        if (validateList['dateFormatNotMatch']) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: `Point ${[...new Set(validateList['dateFormatNotMatch'])].join(', ')}; Register Timestamp's format is not match.`
            },
            HttpStatus.BAD_REQUEST
          )
        }
        if (validateList['earlierTimestamp']) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: `Point ${[...new Set(validateList['earlierTimestamp'])].join(', ')}; Register Timestamp must be earlier or equal to Current date.`
            },
            HttpStatus.BAD_REQUEST
          )
        }

        let newData = {
          gasDay: (gasDay && gasDay['0']) || null,
          data: newValue,
          tempExcel: findData
        }

        if (!!!newData?.gasDay) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Date is NOT match'
            },
            HttpStatus.BAD_REQUEST
          )
        }
        const ckDay = newDate7.isBefore(dayjs(newData?.gasDay, 'YYYY-MM-DD'))
        if (ckDay) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Date is NOT match'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        for (let i = 0; i < newData.data.length; i++) {
          // ห้ามว่าง
          // newData.data[i]?.POINT_ID?.value
          // newData.data[i]?.REGISTER_TIMSTAMP?.value
          // newData.data[i]?.ENERGY?.value
          if (!!!newData.data[i]?.POINT_ID?.value) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Required field is missing: Point_ID'
              },
              HttpStatus.BAD_REQUEST
            )
          } else if (!!!newData.data[i]?.REGISTER_TIMSTAMP?.value) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Required field is missing: Register Timestamp'
              },
              HttpStatus.BAD_REQUEST
            )
          } else if (!!!newData.data[i]?.["Gas Hour"]?.value) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Required field is missing: Gas Hour'
              },
              HttpStatus.BAD_REQUEST
            )
          } else if (!!!newData.data[i]?.ENERGY?.value) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Required field is missing: Energy.'
              },
              HttpStatus.BAD_REQUEST
            )
          }

          // ห้ามติดลบ
          // newData.data[i]?.VOLUME?.value
          // newData.data[i]?.ENERGY?.value
          // newData.data[i]?.HV?.value
          // newData.data[i]?.WI?.value
          if (!!newData.data[i]?.VOLUME?.value && Number(newData.data[i]?.VOLUME?.value) < 0) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Date is NOT match'
              },
              HttpStatus.BAD_REQUEST
            )
          } else if (!!newData.data[i]?.ENERGY?.value && Number(newData.data[i]?.ENERGY?.value) < 0) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Date is NOT match'
              },
              HttpStatus.BAD_REQUEST
            )
          } else if (!!newData.data[i]?.HV?.value && Number(newData.data[i]?.HV?.value) < 0) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Date is NOT match'
              },
              HttpStatus.BAD_REQUEST
            )
          } else if (!!newData.data[i]?.WI?.value && Number(newData.data[i]?.WI?.value) < 0) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Date is NOT match'
              },
              HttpStatus.BAD_REQUEST
            )
          }

          // newData.data[i]?.REGISTER_TIMSTAMP?.value -> 2024-03-15T11:30:00.569+01:00
          // const registerTime = dayjs(newData.data[i]?.REGISTER_TIMSTAMP?.value)

          // https://app.clickup.com/t/9018502823/86eub6d16
          // DD/MM/YYYY HH:mm:ss
          const registerTime = dayjs(newData.data[i]?.REGISTER_TIMSTAMP?.value, 'DD/MM/YYYY HH:mm:ss')
          newData.data[i].REGISTER_TIMSTAMP.value = registerTime.format('YYYY-MM-DDTHH:mm:ss.000+00:00') // แปลงเป็นแบบเดิมเพื่อให้ service meter ไม่ต้องแก้
          const ckRg = newDate7.isBefore(registerTime)
          if (ckRg) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Point ${newData.data[i]?.POINT_ID?.value}; Register Timestamp must be earlier or equal to Current date.`
              },
              HttpStatus.BAD_REQUEST
            )
          }
       
          if(dayjs(ddmmyyyy, "DD/MM/YYYY").isSame(dayjs(), "day")){
            if(Number(newData.data[i]?.["Gas Hour"]?.value) > dayjs().hour()){
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: `Point ${newData.data[i]?.POINT_ID?.value}; Gas Hour must be earlier or equal to Current date.`
                },
                HttpStatus.BAD_REQUEST
              )
            }
          }
          // 
        }
        meterArr = [...meterArr, newData]
      }

      // throw new HttpException(
      //     {
      //       status: HttpStatus.BAD_REQUEST,
      //       error: `Test.`
      //     },
      //     HttpStatus.BAD_REQUEST
      //   )

      const metered_run_number = await this.prisma.metered_run_number.create({
        data: {
          metering_retrieving_id: meteringRetrievingId,
          create_date: dayjs().toDate(),
          create_date_num: dayjs().unix()
        }
      })
      let countMeter = 0
      for (let i = 0; i < meterArr.length; i++) {
        const meteredMicroData = await this.meteredMicroService.sendMessage(
          JSON.stringify({
            case: 'upload-meter',
            mode: 'metering',
            metering_retrieving_id: meteringRetrievingId,
            insert_timestamp: insertTimestamp,
            json_data: meterArr[i]
          })
        )

        const reply = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

        if (reply?.status) {
          const gasDayjs = dayjs(reply?.data[i]?.gasDay ?? reply?.data[i]?.data?.gasDay ?? meterArr[i].gasDay, 'YYYY-MM-DD')
          const gasDay = gasDayjs.toDate()
          const resData = await this.prisma.metering_point.findMany({
            where: {
              AND: [
                {
                  start_date: {
                    lte: gasDay // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: gasDay
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
            },
            include: {
              non_tpa_point: {
                include: {
                  nomination_point: {
                    include: {
                      contract_point: {
                        include: {
                          area: true,
                          zone: true,
                          shipper_contract_point: {
                            include: {
                              group: true
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              nomination_point: {
                include: {
                  contract_point: {
                    include: {
                      area: true,
                      zone: true,
                      shipper_contract_point: {
                        include: {
                          group: true
                        }
                      }
                    }
                  }
                }
              }
            },
            orderBy: {
              id: 'desc'
            }
          })
          const conceptPointList = await this.prisma.concept_point.findMany({
            where: {
              AND: [
                {
                  type_concept_point_id: 4 //Metering Physical gas concept
                },
                {
                  start_date: {
                    lte: gasDay // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: gasDay
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
            },
            orderBy: {
              id: 'desc'
            }
          })

          let logsData = []

          for (let i = 0; i < (reply?.data?.length || 0); i++) {
            const findMeterDam = resData?.find((f: any) => {
              return f?.metered_point_name === reply?.data[i]?.meteringPointId
            })
            const findConceptDam = conceptPointList?.find((f: any) => {
              return f?.concept_point === reply?.data[i]?.meteringPointId
            })

            if (!reply?.data[i]?.energy && reply?.data[i]?.energy != 0) {
              // ไม่มี energy
              if (!!findMeterDam || !!findConceptDam) {
                // ไม่มี energy แต่ มีใน DAM
                logsData.push({
                  metered_run_number_id: metered_run_number?.id,
                  temp: JSON.stringify(reply?.data[i]),
                  type: 'retrieving',
                  description: `The point ${reply?.data[i]?.meteringPointId} does not retrieved Metering data`,
                  timestamp: newDate7.toDate(),
                  metering_point_sys: reply?.data[i]?.meteringPointId,
                  gas_day: gasDay,
                  create_date: newDate.toDate(),
                  create_date_num: newDate.unix()
                })
              }
            } else {
              // มี energy
              if (reply?.data[i]?.meteringPointId) {
                // เอาไปใส่ mastering data check เพื่อให้เวลาหาเป็นช่วงเวลาจะได้รู้ว่า meter นี้มีค่ามาแล้ว
                const count = await this.prisma.metered_retrieving.count({
                  where: {
                    del_flag: true,
                    type: 'mastering data check',
                    metered_run_number_id: metered_run_number?.id,
                    metering_point_sys: reply?.data[i]?.meteringPointId,
                    gas_day: {
                      gte: gasDayjs.startOf('day').toDate(),
                      lte: gasDayjs.endOf('day').toDate()
                    }
                  }
                })
                if (count == 0) {
                  logsData.push({
                    metered_run_number_id: metered_run_number?.id,
                    temp: JSON.stringify(reply?.data[i]),
                    type: 'mastering data check',
                    description: `The point ${reply?.data[i]?.meteringPointId} already retrieved Metering data`,
                    timestamp: newDate7.toDate(),
                    metering_point_sys: reply?.data[i]?.meteringPointId,
                    gas_day: gasDay,
                    del_flag: true,
                    create_date: newDate.toDate(),
                    create_date_num: newDate.unix()
                  })
                }

                if (!!!findMeterDam && !!!findConceptDam) {
                  // มี energy แต่ ไม่มีใน DAM
                  logsData.push({
                    metered_run_number_id: metered_run_number?.id,
                    temp: JSON.stringify(reply?.data[i]),
                    type: 'retrieving',
                    description: `The point ${reply?.data[i]?.meteringPointId} does not exist in TPA system or is not valid`,
                    timestamp: newDate7.toDate(),
                    metering_point_sys: reply?.data[i]?.meteringPointId,
                    gas_day: gasDay,
                    create_date: newDate.toDate(),
                    create_date_num: newDate.unix()
                  })
                }
                // else{
                //   // มี energy และ มีใน DAM
                // }
              } else {
                // มี energy แต่ ไม่มี meteringPointId
                logsData.push({
                  metered_run_number_id: metered_run_number?.id,
                  temp: JSON.stringify(reply?.data[i]),
                  type: 'retrieving',
                  description: 'The mandatory field Metering Point ID must be informed',
                  timestamp: newDate7.toDate(),
                  // metering_point_sys: reply?.data[i]?.meteringPointId,
                  metering_point_sys: '', // https://app.clickup.com/t/86euzxxmp
                  gas_day: gasDay,
                  create_date: newDate.toDate(),
                  create_date_num: newDate.unix()
                })
              }
            }
          }
          if (logsData.length > 0) {
            await this.prisma.metered_retrieving.createMany({
              data: logsData
            })
          }
        }
        countMeter = +1
      }
      try {
        await middleNotiInapp(
          this.prisma,
          'Metering', // 'Metering Management',
          `Metering Interface: Data retrieving from file ${(fileOriginal.originalname && String(fileOriginal.originalname)) || ''}.xlsx executed on ${insertTimestamp}[finished OK}   (Metering Input Code ${meteringRetrievingId})}. {${countMeter}/${meterArr.length} registers inserted. Allocation and Balancing process should be executed.`,
          77, // Metering Management menus_id
          1
        )
      } catch (error) {}

      return 'success'
    } catch (error) {
      console.log('error ', error, error)
      try {
        await middleNotiInapp(
          this.prisma,
          'Metering', // 'Metering Management',
          `Metering Interface: Data retrieving from file ${(fileOriginal.originalname && String(fileOriginal.originalname)) || ''}.xlsx executed on ${newDate.format('YYYY-MM-DD HH:mm:ss')} {Error}.`,
          77, // Metering Management menus_id
          1
        )
      } catch (error) {
        console.log('error2 ', error)
      }
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: error.response.error
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  async callMeter(meteringRetrievingId: any) {
    let newMeteringRetrievingId = meteringRetrievingId
    try {
      let exitsMeteredRunNumberCount = 0
      do {
        exitsMeteredRunNumberCount = await this.prisma.metered_run_number.count({
          where: {
            metering_retrieving_id: newMeteringRetrievingId
          }
        })
        if (exitsMeteredRunNumberCount > 0) {
          const idSplit = `${newMeteringRetrievingId}`.split('-')
          const lastId = idSplit.pop()
          const lastIdNumber = parseToNumber(lastId)
          newMeteringRetrievingId = `${idSplit.join('-')}-${(lastIdNumber + 1).toString().padStart(4, '0')}`
        }
      } while (exitsMeteredRunNumberCount > 0)
    } catch (error) {
      newMeteringRetrievingId = meteringRetrievingId
    }

    const metered_run_number = await this.prisma.metered_run_number.create({
      data: {
        metering_retrieving_id: newMeteringRetrievingId,
        create_date: dayjs().toDate(),
        create_date_num: dayjs().unix()
      }
    })
    return metered_run_number
  }
  //
  async procressMetered2(payload: any, userId: any) {
    const {startDate, endDate} = payload

    const newDate = dayjs()
    const todayStart = dayjs().startOf('day').toDate()
    const todayEnd = dayjs().endOf('day').toDate()
    const start = dayjs(startDate, 'YYYY-MM-DD').toDate()
    const end = dayjs(endDate, 'YYYY-MM-DD').toDate()

    const meteredCount = await this.prisma.metered_run_number.count({
      where: {
        create_date: {
          gte: todayStart, // มากกว่าหรือเท่ากับเวลาเริ่มต้นของวันนี้
          lte: todayEnd // น้อยกว่าหรือเท่ากับเวลาสิ้นสุดของวันนี้
        }
      }
    })
    const meteringRetrievingId = `${newDate.format('YYYYMMDD')}-MET-${(meteredCount > 0 ? meteredCount + 1 : 1).toString().padStart(4, '0')}`
    const insertTimestamp = newDate.format('YYYY-MM-DD HH:mm:ss')
    // const metered_run_number = await this.prisma.metered_run_number.create({
    //   data: {
    //     metering_retrieving_id: meteringRetrievingId,
    //     create_date: newDate.toDate(),
    //     create_date_num: dayjs().unix(),
    //   },
    // });

    try {
      const metered_run_number = await this.callMeter(meteringRetrievingId)
      const meteredMicroData = await this.meteredMicroService.sendMessage(
        JSON.stringify({
          case: 'execute-date',
          mode: 'metering',
          metering_retrieving_id: meteringRetrievingId,
          insert_timestamp: insertTimestamp,
          start_date: startDate,
          end_date: endDate
        })
      )
      const reply = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null
      // const metered_run_number = await this.prisma.metered_run_number.create({
      //   data: {
      //     metering_retrieving_id: meteringRetrievingId,
      //     create_date: dayjs().toDate(),
      //     create_date_num: dayjs().unix(),
      //   },
      // });
      if (!reply?.status || reply?.error === 'Internal server error') {
        if (reply?.error) {
          try {
            if (reply?.status_code === 504 && (reply?.error?.toLowerCase()?.includes('timeout') || reply?.detail?.toLowerCase()?.includes('timeout') || reply?.faultcode?.toLowerCase()?.includes('timeout') || reply?.faultstring?.toLowerCase()?.includes('timeout'))) {
              const message = `Metering Interface: Data retrieving for the period ${reply?.start_date ?? startDate} - ${reply?.end_date ?? endDate} and executed on ${reply?.insert_timestamp ?? insertTimestamp} was failed with timeout. Please reduce retrieving period. (Metering Input Code ${reply?.metering_retrieving_id ?? meteringRetrievingId})`
              await middleNotiInapp(
                this.prisma,
                'Metering',
                message,
                77, // Metering Management menus_id
                1
              )
            } else {
              const message = `Metering Interface: Data retrieving for the period ${reply?.start_date ?? startDate} - ${reply?.end_date ?? endDate} and executed on ${reply?.insert_timestamp ?? insertTimestamp} ${reply?.error?.message ?? reply?.error}.`
              await middleNotiInapp(
                this.prisma,
                'Metering',
                message,
                77, // Metering Management menus_id
                1
              )
            }
          } catch (error) {}
        } else {
          try {
            const message = `Metering Interface: Data retrieving for the period ${reply?.start_date ?? startDate} - ${reply?.end_date ?? endDate} and executed on ${reply?.insert_timestamp ?? insertTimestamp} have no change in this period.`
            await middleNotiInapp(
              this.prisma,
              'Metering',
              message,
              77, // Metering Management menus_id
              1
            )
          } catch (error) {}
        }
      }

      if (reply && reply?.status && reply.data.length > 0) {
        try {
          const message = `Metering Interface: Data retrieving for the period ${reply?.start_date ?? startDate} - ${reply?.end_date ?? endDate} and executed on ${reply?.insert_timestamp ?? insertTimestamp} finished OK   (Metering Input Code ${reply?.metering_retrieving_id ?? meteringRetrievingId}). ${reply?.susscess_points ?? 0}/${reply?.total_points ?? 0} registers inserted. Allocation and Balancing process should be executed.`
          await middleNotiInapp(
            this.prisma,
            'Metering',
            message,
            77, // Metering Management menus_id
            1
          )
        } catch (error) {}

        const resData = await this.prisma.metering_point.findMany({
          where: {
            AND: [
              {
                start_date: {
                  lte: end // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                }
              },
              {
                OR: [
                  {
                    end_date: null
                  }, // ถ้า end_date เป็น null
                  {
                    end_date: {
                      gte: start
                    }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          },
          include: {
            non_tpa_point: {
              include: {
                nomination_point: {
                  include: {
                    contract_point: {
                      include: {
                        area: true,
                        zone: true,
                        shipper_contract_point: {
                          include: {
                            group: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            nomination_point: {
              include: {
                contract_point: {
                  include: {
                    area: true,
                    zone: true,
                    shipper_contract_point: {
                      include: {
                        group: true
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            id: 'desc'
          }
        })
        const conceptPointList = await this.prisma.concept_point.findMany({
          where: {
            AND: [
              {
                type_concept_point_id: 4 //Metering Physical gas concept
              },
              {
                start_date: {
                  lte: end // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                }
              },
              {
                OR: [
                  {
                    end_date: null
                  }, // ถ้า end_date เป็น null
                  {
                    end_date: {
                      gte: start
                    }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          },
          orderBy: {
            id: 'desc'
          }
        })
        let logsData = []
        for (let i = 0; i < reply?.data.length; i++) {
          let gasDay: dayjs.Dayjs | null = reply?.data[i]?.gasDay ? dayjs(reply?.data[i]?.gasDay, 'YYYY-MM-DD') : null
          gasDay = gasDay?.isValid() ? gasDay : null
          const findMeterDam = resData?.find((f: any) => {
            return f?.metered_point_name === reply?.data[i]?.meteringPointId && dayjs(f?.start_date).isSameOrBefore(gasDay, 'day') && (!f?.end_date || dayjs(f?.end_date).isAfter(gasDay, 'day'))
          })
          const findConceptDam = conceptPointList?.find((f: any) => {
            return f?.concept_point === reply?.data[i]?.meteringPointId && dayjs(f?.start_date).isSameOrBefore(gasDay, 'day') && (!f?.end_date || dayjs(f?.end_date).isAfter(gasDay, 'day'))
          })
          if (!reply?.data[i]?.energy && reply?.data[i]?.energy != 0) {
            // ไม่มี energy
            if (!!findMeterDam || !!findConceptDam) {
              // ไม่มี energy แต่ มีใน DAM
              logsData.push({
                metered_run_number_id: metered_run_number?.id,
                temp: JSON.stringify(reply?.data[i]),
                type: 'retrieving',
                description: `The point ${reply?.data[i]?.meteringPointId} does not retrieved Metering data`,
                timestamp: newDate.toDate(),
                metering_point_sys: reply?.data[i]?.meteringPointId,
                gas_day: gasDay,
                create_date: newDate.toDate(),
                create_date_num: newDate.unix()
              })
            }
          } else {
            // มี energy
            // เอาไปใส่ mastering data check เพื่อให้เวลาหาเป็นช่วงเวลาจะได้รู้ว่า meter นี้มีค่ามาแล้ว
            if (reply?.data[i]?.meteringPointId) {
              if (gasDay != null) {
                const count = await this.prisma.metered_retrieving.count({
                  where: {
                    del_flag: true,
                    type: 'mastering data check',
                    metered_run_number_id: metered_run_number?.id,
                    metering_point_sys: reply?.data[i]?.meteringPointId,
                    gas_day: {
                      gte: gasDay.startOf('day').toDate(),
                      lte: gasDay.endOf('day').toDate()
                    }
                  }
                })
                if (count == 0) {
                  logsData.push({
                    metered_run_number_id: metered_run_number?.id,
                    temp: JSON.stringify(reply?.data[i]),
                    type: 'mastering data check',
                    description: `The point ${reply?.data[i]?.meteringPointId} already retrieved Metering data`,
                    timestamp: newDate.toDate(),
                    metering_point_sys: reply?.data[i]?.meteringPointId,
                    gas_day: gasDay,
                    del_flag: true,
                    create_date: newDate.toDate(),
                    create_date_num: newDate.unix()
                  })
                }
              }

              if (!!!findMeterDam && !!!findConceptDam) {
                // มี energy แต่ ไม่มีใน DAM
                logsData.push({
                  metered_run_number_id: metered_run_number?.id,
                  temp: JSON.stringify(reply?.data[i]),
                  type: 'retrieving',
                  description: `The point ${reply?.data[i]?.meteringPointId} does not exist in TPA system or is not valid`,
                  timestamp: newDate.toDate(),
                  metering_point_sys: reply?.data[i]?.meteringPointId,
                  gas_day: gasDay,
                  create_date: newDate.toDate(),
                  create_date_num: newDate.unix()
                })
              }
              // else{
              //   // มี energy และ มีใน DAM
              // }
            } else {
              // มี energy แต่ ไม่มี meteringPointId
              logsData.push({
                metered_run_number_id: metered_run_number?.id,
                temp: JSON.stringify(reply?.data[i]),
                type: 'retrieving',
                description: 'The mandatory field Metering Point ID must be informed',
                timestamp: newDate.toDate(),
                // metering_point_sys: reply?.data[i]?.meteringPointId,
                metering_point_sys: '', // https://app.clickup.com/t/86euzxxmp
                gas_day: gasDay,
                create_date: newDate.toDate(),
                create_date_num: newDate.unix()
              })
            }
          }
        }
        if (logsData.length > 0) {
          await this.prisma.metered_retrieving.createMany({
            data: logsData
          })
        }
      }
      return reply
    } catch (error) {
      // const metered_run_number = await this.callMeter(meteringRetrievingId)
      // const metered_run_number = await this.prisma.metered_run_number.create({
      //   data: {
      //     metering_retrieving_id: meteringRetrievingId,
      //     create_date: dayjs().toDate(),
      //     create_date_num: dayjs().unix(),
      //   },
      // });

      try {
        const message = `Metering Interface: Data retrieving for the period ${startDate} - ${endDate} and executed on ${insertTimestamp} ${error?.message ?? error}.`
        await middleNotiInapp(
          this.prisma,
          'Metering',
          message,
          77, // Metering Management menus_id
          1
        )
      } catch (error) {}
    }
  }
  // #endregion ปรับ mastering data check ไปเป็นถ้าไม่มีค่า energy เลยในช่วงเวลาที่เลือกถึงจะไปแสดงผลที่หน้าบ้าน
}
