import {HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as XLSX from 'xlsx-js-style'
import * as fs from 'fs'
import * as FormData from 'form-data'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import axios from 'axios'
import {getTodayEndAdd7, getTodayEndDDMMYYYYDfaultAdd7, getTodayNowDDMMYYYYDfaultAdd7, getTodayStartAdd7, getTodayStartDDMMYYYYDfaultAdd7} from 'src/common/utils/date.util'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class CapacityDashboardService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async statusProcess(payload?: any) {
    const {id} = payload
    const idArrs = JSON.parse(id)
    const resStatusProcess = await this.prisma.status_capacity_request_management_process.findMany({
      where: {
        id: {not: 5}
      },
      include: {
        contract_code: {
          where: {
            group: {
              id: {
                in: idArrs
              }
            }
          }
        }
      },
      orderBy: {
        id: 'asc'
      }
    })
    return resStatusProcess
  }

  private toNullableNumber(value: any): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const numberValue = Number(
    String(value).replace(/,/g, '').trim()
  )

  if (!Number.isFinite(numberValue)) {
    return null
  }

  return numberValue
  // // ต้องการให้ค่า 0 กลายเป็น null
  // return numberValue === 0 ? null : numberValue
}

/**
 * รวมข้อมูลตามวันที่
 * ถ้าวันเดียวกันมีหลายสัญญา จะเลือกค่าสูงสุด
 *
 * จากนั้นรวมตามเดือน
 * และเลือกค่าต่ำสุดของแต่ละเดือน
 *
 * ถ้าเดือนนั้นทุกค่าเป็น null
 * เดือนจะยังอยู่ แต่ value จะเป็น null
 */
private calculateConditions(data: any[] = []): Array<{
  month: string
  value: number | null
}> {
  const dateMap = new Map<
    string,
    {
      month: string
      values: Array<number | null>
    }
  >()

  data.forEach((contract: any) => {
    const nsetData = Array.isArray(contract?.nsetData)
      ? contract.nsetData
      : []

    nsetData.forEach((item: any) => {
      const date = item?.date
      const month = item?.month

      if (!date || !month) {
        return
      }

      if (!dateMap.has(date)) {
        dateMap.set(date, {
          month,
          values: []
        })
      }

      dateMap
        .get(date)!
        .values
        .push(this.toNullableNumber(item?.value))
    })
  })

  /*
   * หาค่าสูงสุดในแต่ละวัน
   * null จะไม่ถูกเปลี่ยนเป็น 0
   */
  const dailyData = Array.from(dateMap.entries()).map(
    ([date, item]) => {
      const validValues = item.values.filter(
        (value): value is number => value !== null
      )

      return {
        date,
        month: item.month,
        value:
          validValues.length > 0
            ? Math.max(...validValues)
            : null
      }
    }
  )

  /*
   * จัดกลุ่มข้อมูลรายวันตามเดือน
   */
  const monthMap = new Map<
    string,
    Array<number | null>
  >()

  dailyData.forEach((item) => {
    if (!monthMap.has(item.month)) {
      monthMap.set(item.month, [])
    }

    monthMap.get(item.month)!.push(item.value)
  })

  /*
   * หาค่าต่ำสุดในแต่ละเดือน
   * ถ้าทั้งเดือนเป็น null จะคืน null
   */
  return Array.from(monthMap.entries()).map(
    ([month, values]) => {
      const validValues = values.filter(
        (value): value is number => value !== null
      )

      return {
        month,
        value:
          validValues.length > 0
            ? Math.min(...validValues)
            : null
      }
    }
  )
}

/**
 * รวมผลลัพธ์แบบผสม file_period_mode
 *
 * หากเดือนเดียวกันมีทั้ง day และ month
 * จะเลือกค่าต่ำสุดที่ไม่ใช่ null
 *
 * ถ้าทั้งคู่เป็น null จะเก็บเดือนและคืน null
 */
private mergeConditions(
  ...conditionGroups: Array<
    Array<{
      month: string
      value: number | null
    }>
  >
): Array<{
  month: string
  value: number | null
}> {
  const monthMap = new Map<
    string,
    Array<number | null>
  >()

  conditionGroups.flat().forEach(({month, value}) => {
    if (!month) {
      return
    }

    if (!monthMap.has(month)) {
      monthMap.set(month, [])
    }

    monthMap.get(month)!.push(value)
  })

  return Array.from(monthMap.entries()).map(
    ([month, values]) => {
      const validValues = values.filter(
        (value): value is number => value !== null
      )

      return {
        month,
        value:
          validValues.length > 0
            ? Math.min(...validValues)
            : null
      }
    }
  )
}

/**
 * Short Term (Non-firm)
 * เลือกค่าสูงสุดของแต่ละเดือน
 *
 * ถ้าทั้งเดือนเป็น null
 * เดือนจะยังอยู่ และ value เป็น null
 */
private getMaxByMonth(
  nsetData: any[] = []
): Array<{
  month: string
  value: number | null
  date: string | null
}> {
  const monthMap = new Map<
    string,
    {
      month: string
      value: number | null
      date: string | null
    }
  >()

  nsetData.forEach((item: any) => {
    const month = item?.month

    if (!month) {
      return
    }

    const value = this.toNullableNumber(item?.value)
    const current = monthMap.get(month)

    // ยังไม่มีเดือนนี้ ให้เพิ่มไว้ก่อน แม้ value เป็น null
    if (!current) {
      monthMap.set(month, {
        month,
        value,
        date: item?.date ?? null
      })

      return
    }

    // ค่าใหม่เป็น null ไม่ต้องนำไปเปรียบเทียบ
    if (value === null) {
      return
    }

    // ค่าเดิมเป็น null หรือค่าใหม่มากกว่า
    if (
      current.value === null ||
      value > current.value
    ) {
      monthMap.set(month, {
        month,
        value,
        date: item?.date ?? null
      })
    }
  })

  return Array.from(monthMap.values())
}


private getMonthRange(
  startDate: any,
  endDate: any
): Array<{
  month: string
  sortDate: string
}> {
  if (!startDate || !endDate) {
    return []
  }

  /*
   * รองรับทั้ง:
   * DD/MM/YYYY
   * YYYY-MM-DD
   * Date
   */
  const parseDate = (value: any) => {
    if (dayjs.isDayjs(value)) {
      return value
    }

    if (value instanceof Date) {
      return dayjs(value)
    }

    const formats = [
      'DD/MM/YYYY',
      'YYYY-MM-DD',
      'YYYY-MM-DD HH:mm:ss',
      'MM/DD/YYYY'
    ]

    for (const format of formats) {
      const parsed = dayjs(value, format, true)

      if (parsed.isValid()) {
        return parsed
      }
    }

    return dayjs(value)
  }

  const start = parseDate(startDate).startOf('month')
  const end = parseDate(endDate).startOf('month')

  if (!start || !end || !start.isValid() || !end.isValid()) {
    return []
  }

  if (start.isAfter(end, 'month')) {
    return []
  }

  const months: Array<{
    month: string
    sortDate: string
  }> = []

  let current = start

  while (
    current.isBefore(end, 'month') ||
    current.isSame(end, 'month')
  ) {
    months.push({
      month: current.format('MMM YYYY'),
      sortDate: current.format('YYYY-MM')
    })

    current = current.add(1, 'month')
  }

  return months
}

private fillMissingMonths(
  conditions: Array<{
    month: string
    value: number | null
  }> = [],
  monthRange: Array<{
    month: string
    sortDate: string
  }> = []
): Array<{
  month: string
  value: number | null
}> {
  const conditionMap = new Map<
    string,
    number | null
  >()

  conditions.forEach((item) => {
    if (!item?.month) {
      return
    }

    conditionMap.set(
      item.month,
      item && item?.value === undefined
        ? null
        : item.value
    )
  })

  return monthRange.map((item) => ({
    month: item.month,
    value: conditionMap.has(item.month)
      ? conditionMap.get(item.month)!
      : null
  }))
}

  //  conditions
  async areaDataGraph(idArrStr: any) {
    const {id, start_date, end_date} = idArrStr
    const idArrs = JSON.parse(id)
    const resEntryExit = await this.prisma.entry_exit.findMany({
      orderBy: {
        id: 'asc'
      }
    })

    const resArea = await this.prisma.area.findMany({
      select: {
        name: true,
        entry_exit_id: true,
        color: true
      },
      orderBy: {
        id: 'asc'
      }
    })
    const resTermType = await this.prisma.term_type.findMany({
      select: {
        id: true,
        name: true,
        color: true
      },
      orderBy: {
        id: 'asc'
      }
    })

    let corssData = resEntryExit.map((e: any) => {
      let filterAreaData = resArea.filter((f: any) => {
        return f?.entry_exit_id === e?.id
      })
      return {
        ...e,
        area: filterAreaData
      }
    })
    const todayStart = getTodayStartDDMMYYYYDfaultAdd7(start_date)
    const todayEnd = getTodayEndDDMMYYYYDfaultAdd7(end_date)
    const monthRange = this.getMonthRange(
  todayStart,
  todayEnd
)

console.log(
  'monthRange length:',
  monthRange.length
)

console.log(
  'monthRange first:',
  monthRange[0]
)

console.log(
  'monthRange last:',
  monthRange[monthRange.length - 1]
)
    const resContractCode = await this.prisma.contract_code.findMany({
      where: {
        // 1 = active, 2 = waiting for start date, 3 = waiting for approval, 4 = end, 5 = close
        status_capacity_request_management_process_id: {not: 5},
        group: {
          id: {
            in: idArrs
          }
        },

        AND: [
          {
            // 1 = saved, 2 = approved, 3 = rejected, 4 = comfirmed, 5 = terminated
            status_capacity_request_management_id: {
              in: [1, 2, 4, 5]
            }
          },
          {
            contract_start_date: {
              lte: todayEnd.toDate() // start_date ต้องก่อน
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
                  gt: todayStart.toDate()
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
                      gt: todayStart.toDate()
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
                          gt: todayStart.toDate()
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]

        // contract_start_date: {
        //   lte: end_date ? getTodayNowDDMMYYYYDfaultAdd7(end_date).toDate() : null
        // },
        // contract_end_date: {
        //   lte: start_date ? getTodayNowDDMMYYYYDfaultAdd7(start_date).toDate() : null
        // },
      },
      include: {
        group: true,
        term_type: true,
        booking_version: {
          include: {
            booking_row_json: true,
            booking_full_json: true,
            booking_row_json_release: {
              where: {
                flag_use: true
              }
            },
            booking_full_json_release: {
              where: {
                flag_use: true
              }
            },
          },
          take: 1,
          orderBy: {
            id: 'desc'
          }
        }
      },
      orderBy: {
        id: 'desc'
      }
    })

    console.log('resContractCode : ', resContractCode)
    // 115 2026-CSF-T002
    // 3 2024-CLF-001_Amd02

    // 186 2026-CSF-T015
    // 148 2026-CSF-T010

    // 102.64
    // 97.87

    // id:{
    //           // in:[148, 186, 115, 3] //102.64
    //           // in:[148, 115, 3] //98.38
    //           // in:[186, 115, 3] // 102.13
    //           // in:[115, 3] //97.87
    //         }, // test

    // terminate_date
    // nsetData

    // จัดเรียงข้อมูลใหม่ให้อยู่ในลำดับ booking_row_json -> booking_version -> contract_code
    // file_period_mode
    let reorderedData = []
    for (let i = 0; i < resContractCode.length; i++) {
      const {booking_version, group, ...newContractCode} = resContractCode[i]
      let bookingVersions = booking_version?.[0]
      let { booking_row_json, booking_full_json, booking_row_json_release, booking_full_json_release, ...newBookingVersions }: any = (bookingVersions || null);
      let bookingRowJsons = booking_row_json_release?.length > 0 ? booking_row_json_release : booking_row_json;
      let jsonFull = JSON.parse((booking_full_json_release?.length > 0 ? booking_full_json_release : booking_full_json)?.[0]?.data_temp);
      for (let iBRJ = 0; iBRJ < bookingRowJsons.length; iBRJ++) {
        const {data_temp, ...niBRJ} = bookingRowJsons[iBRJ]
        let newiBRJ = {
          ...niBRJ,
          rows: JSON.parse(data_temp),
          booking_version: newBookingVersions,
          booking_full_json_temp: jsonFull,
          contract_code: newContractCode,
          shipper: group
        }
        reorderedData.push(newiBRJ)
      }
    }
    // Entry-X1-บริษัทซอฟท์ไทย แอพลิเคชั่น จำกัด
    console.log('corssData : ', corssData);
    console.log('reorderedData : ', reorderedData);

    const newCorssData = corssData.map((e: any) => {
      const area = e['area'].map((eArea: any) => {
        const filterData = reorderedData.filter((f: any) => {
          return f?.area_text === eArea?.name && f?.entry_exit_id === eArea?.entry_exit_id
        })
        const term_type = resTermType.map((eTermType: any) => eTermType)
        return {
          ...eArea,
          data: filterData,
          term_type
        }
      })
      return {...e, area}
    })
    console.log('newCorssData : ', newCorssData);

    const calcData = newCorssData.map((e: any) => {
      const area = e['area'].map((eArea: any) => {
        const data = eArea['data'].map((eData: any) => {
          // let headType = eData?.entry_exit_id === 1 ? 'headerEntry' : 'headerExit'
          // let setData = eData?.booking_full_json_temp?.[headType]?.['Capacity Daily Booking (MMBTU/d)']
          // // อัปเดตค่าใน setData
          // Object.entries(setData).forEach(([dates, datas]: any) => {
          //   const key = datas.key
          //   if (eData?.rows[key] !== undefined) {
          //     // setData[dates].value = (!!eData?.rows[key] && Number(eData?.rows[key].replace(/,/g, ''))) || 0 // เพิ่ม value เข้าไป
          //     setData[dates].value = (!!eData?.rows[key] && Number(eData?.rows[key].replace(/,/g, ''))) || null // เพิ่ม value เข้าไป
          //     setData[dates].date = dayjs(dates, 'DD/MM/YYYY').format('YYYY-MM-DD 00:00:00') // เพิ่ม date เข้าไป
          //     setData[dates].month = dayjs(dates, 'DD/MM/YYYY').format('MMM YYYY') // เพิ่ม date เข้าไป
          //   }
          // })
          const headType =
            eData?.entry_exit_id === 1
              ? 'headerEntry'
              : 'headerExit'

          const originalSetData =
            eData?.booking_full_json_temp?.[headType]?.[
              'Capacity Daily Booking (MMBTU/d)'
            ] ?? {}

          /*
          * clone เพื่อไม่แก้ไข booking_full_json_temp ต้นฉบับ
          */
          const setData = Object.fromEntries(
            Object.entries(originalSetData).map(
              ([date, detail]: [string, any]) => [
                date,
                {
                  ...detail
                }
              ]
            )
          )

          Object.entries(setData).forEach(
            ([dates, datas]: [string, any]) => {
              const key = datas?.key
              const rawValue = eData?.rows?.[key]

              /*
              * ต้องกำหนด date และ month เสมอ
              * แม้ value จะเป็น null
              *
              * ถ้ากำหนดไว้ใน if เดือนที่ไม่มีค่าจะหาย
              */
              setData[dates].date = dayjs(
                dates,
                'DD/MM/YYYY'
              ).format('YYYY-MM-DD 00:00:00')

              setData[dates].month = dayjs(
                dates,
                'DD/MM/YYYY'
              ).format('MMM YYYY')

              setData[dates].value =
                this.toNullableNumber(rawValue)
            }
          )

          delete setData.key
          const {booking_full_json_temp, rows, booking_version, ...neData} = eData

          // แปลงข้อมูลให้อยู่ในรูปแบบ array และตัด "key" ออก
          const nsetData = Object.values(setData).map(({key, ...rest}) => rest)
          let newnsetData = []
          // contract_code?.terminate_date
          const endDate = neData?.contract_code?.terminate_date || neData?.contract_code?.extend_deadline || neData?.contract_code?.contract_end_date;
          if (endDate) {
            // if(neData?.contract_code?.term_type_id == 4){
              newnsetData = nsetData.filter((item: any) => dayjs(item.date).isBefore(dayjs(endDate), 'day'));
            // }
            // else{
            // const filteredTerminate = nsetData.filter((item: any) => dayjs(item.date).isBefore(dayjs(neData?.contract_code?.terminate_date), 'month'))
            // newnsetData = filteredTerminate
            // }
          } else {
            newnsetData = nsetData
          }

          return {
            ...neData,
            nsetData: newnsetData
          }
        })
        return {
          ...eArea,
          data
        }
      })

      return {...e, area}
    })

    console.log('calcData : ', calcData);

    // month
    // nsetData

    const calcDataTermType_ = calcData.map((e: any) => {
      const area = e['area'].map((eArea: any) => {
        const term_type = (eArea['term_type'] || []).map((eTermType: any) => {
          let filterTermType = eArea['data'].filter((f: any) => {
            return f?.contract_code?.term_type?.id === eTermType?.id
          })
          return {
            ...eTermType,
            data: filterTermType
          }
        })
        const {data, ...neArea} = (eArea || null)
        return {
          ...neArea,
          term_type
        }
      })
      return {...e, area}
    })
    console.log('calcDataTermType_ : ', calcDataTermType_);
    // # กราฟ 1 ยังแสดงข้อมูลไม่ถูกต้อง โดยสัญญาที่เป็น short term non-firm ยัง sum ค่ารายวันมาแสดงอยู่ ต้องแสดงเป็นค่าสูงสุดของเดือนนั้นๆ
    const calcDataTermType = calcDataTermType_?.map((e: any) => {
      const {area, ...nE} = e
      let area_ = area?.map((a: any) => {
        const {term_type, ...nA} = a
        let term_type_ = term_type?.map((t: any) => {
          const {data, ...nT} = t
          let data_ = data
          
          if (t && t?.name === 'Short Term (Non-firm)') {
            data_ = (data ?? []).map((nDa: any) => {
              const {
                nsetData,
                ...nDa_
              } = nDa

              return {
                ...nDa_,
                nsetData: this.getMaxByMonth(
                  nsetData ?? []
                )
              }
            })
          }
          return {
            ...nT,
            data: data_
          }
        })
        return {
          ...nA,
          term_type: term_type_
        }
      })
      return {
        ...nE,
        area: area_
      }
    })

    const calcDatas = calcDataTermType.map((e: any) => {
      const area = (e?.area ?? []).map((eArea: any) => {
        const term_type = (eArea?.term_type ?? []).map(
          (eTermType: any) => {
            const termData = Array.isArray(eTermType?.data)
              ? eTermType.data
              : []

            const filePeriodModes = termData.map(
              (item: any) =>
                item?.contract_code?.file_period_mode
            )

            const has1Or3 = filePeriodModes.some(
              (mode: number) =>
                mode === 1 || mode === 3
            )

            const has2 = filePeriodModes.some(
              (mode: number) => mode === 2
            )

            /*
            * array ว่างใช้ every() แล้วจะได้ true
            * จึงต้องเช็ก length > 0 ด้วย
            */
            const only2 =
              filePeriodModes.length > 0 &&
              filePeriodModes.every(
                (mode: number) => mode === 2
              )

            let conditions: Array<{
              month: string
              value: number | null
            }> = []

            if (termData.length === 0) {
              conditions = []
            } else if (only2) {
              /*
              * file_period_mode = 2 ทั้งหมด
              */
              conditions = this.calculateConditions(
                termData
              )
            } else if (has2 && has1Or3) {
              /*
              * มีทั้งแบบ day และ month
              */
              const daysMix = termData.filter(
                (item: any) => {
                  const mode =
                    item?.contract_code
                      ?.file_period_mode

                  return mode === 1 || mode === 3
                }
              )

              const monthMix = termData.filter(
                (item: any) =>
                  item?.contract_code
                    ?.file_period_mode === 2
              )

              const resultDay =
                this.calculateConditions(daysMix)

              const resultMonth =
                this.calculateConditions(monthMix)

              conditions = this.mergeConditions(
                resultDay,
                resultMonth
              )
            } else {
              /*
              * file_period_mode = day
              */
              conditions = this.calculateConditions(
                termData
              )
            }

            const completeConditions =

  this.fillMissingMonths(

    conditions,

    monthRange

  )

return {

  ...eTermType,

  conditions: completeConditions

}
          }
        )

        const {
          data,
          ...neArea
        } = (eArea || null)

        return {
          ...neArea,
          term_type
        }
      })

      return {
        ...e,
        area
      }
    })

    // console.log(
    //   'calcDatas : ',
    //   JSON.stringify(calcDatas, null, 2)
    // )

    console.log('calcDatas ; ', calcDatas);
    // dateSum[date].totalValue :
    return calcDatas
    // return { calcDatas, calcDataTermType };
  }
}
