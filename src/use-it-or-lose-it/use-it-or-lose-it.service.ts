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
import * as https from 'https'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter' // นำเข้า plugin isSameOrAfter
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import axios from 'axios'
import {ReleaseCapacitySubmissionService} from 'src/release-capacity-submission/release-capacity-submission.service'
import {getTodayNowAdd7, getTodayNowDDMMYYYYDfault, getTodayNowDDMMYYYYDfaultAdd7, getTodayNowYYYYMMDDDfaultAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'
import {isMatch} from 'src/common/utils/allocation.util'
import {Prisma} from '@prisma/client'
import {parseToNumber, parseToNumber3Decimal, parseToNumber6Decimal} from 'src/common/utils/number.util'
dayjs.extend(isSameOrAfter) // เปิดใช้งาน plugin isSameOrAfter
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Bangkok')

@Injectable()
export class UseItOrLoseItService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private readonly releaseCapacitySubmissionService: ReleaseCapacitySubmissionService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
      return false
    }

    const keys1 = Object.keys(obj1)
    const keys2 = Object.keys(obj2)

    if (keys1.length !== keys2.length) return false

    return keys1.every((key) => this.deepEqual(obj1[key], obj2[key]))
  }

  arraysContainSameElements(arr1, arr2) {
    if (arr1.length !== arr2.length) return false

    // เปรียบเทียบทุก element โดยไม่สนใจลำดับ
    return arr1.every((item1) => arr2.some((item2) => this.deepEqual(item1, item2)))
  }

  generateDateData12BF(dateEnd: string) {
    const [endMonth, endYear] = dateEnd.split('/').map(Number) // แยก MM/YYYY ออกเป็นตัวเลข
    const endDate = dayjs(`${endYear}-${endMonth}-01`) // สร้าง dayjs date

    let data: Record<
      string,
      {
        key: string
        value: string
      }
    > = {}

    for (let i = 11; i >= 0; i--) {
      const date = endDate.subtract(i, 'month') // ย้อนหลัง i เดือน
      const key = date.format('MM/YYYY') // แปลงเป็น MM/YYYY
      data[key] = {
        key: '',
        value: ''
      }
    }

    return data
  }

  async findAll() {
    const contractCode = await this.prisma.contract_code.findMany({
      include: {
        group: true,
        booking_version: {
          include: {
            booking_full_json: true,
            booking_row_json: {
              include: {
                entry_exit: true
              }
            }
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

    if (!contractCode) {
      return []
    }
    let resArr: any = []
    for (let ic = 0; ic < contractCode.length; ic++) {
      const useData = contractCode?.[ic]?.booking_version?.[0]?.booking_row_json || []
      const convertData = useData.map((e: any) => {
        return {
          ...e,
          data_temp: JSON.parse(e['data_temp'])
        }
      })

      const nowDates = getTodayNowAdd7().toDate()

      const pathManagement = await this.prisma.path_management.findFirst({
        where: {
          start_date: {
            lt: nowDates ? getTodayNowAdd7(nowDates).toDate() : null
          }
        },
        include: {
          path_management_config: true
        },
        orderBy: {
          start_date: 'desc'
        }
      })

      const pathEntryExit = pathManagement['path_management_config'].map((e: any) => {
        return {
          ...e,
          temps: JSON.parse(e['temps'])
        }
      })
      const findEntry = pathEntryExit.map((e: any) => {
        const findId = e?.temps?.revised_capacity_path?.find((f: any) => {
          return f?.area?.entry_exit_id === 1
        })
        const findExit = e?.temps?.revised_capacity_path?.filter((f: any) => {
          return f?.area?.entry_exit_id === 2
        })

        return {
          ...e,
          entryId: findId?.area?.id,
          entryName: findId?.area?.name,
          findExit,
          full: e?.temps?.revised_capacity_path
        }
      })

      const dataRow = convertData
      const entryUse = dataRow.filter((f: any) => {
        return f?.entry_exit_id === 1
      })
      const exitUse = dataRow.filter((f: any) => {
        return f?.entry_exit_id === 2
      })

      const compareArrEntry = []
      // const fromTo = 33;
      const fromTo = 5
      const fullData = (!!contractCode[ic]?.booking_version[0]?.booking_full_json[0]?.['data_temp'] && JSON.parse(contractCode[ic]?.booking_version[0]?.booking_full_json[0]?.['data_temp'])) || null
      const setData = (convertData || []).map((eSum: any) => {
        const result = Object.keys(eSum['data_temp'])
          .filter((key) => Number(key) >= fromTo + 2)
          .reduce((acc, key) => {
            acc[key] = eSum['data_temp'][key]
            return acc
          }, {})

        // ดึง key ทั้งหมดและจัดเรียง
        const keys = Object.keys(result).sort((a, b) => Number(a) - Number(b))

        // แบ่งเป็น 4 กลุ่ม
        const groups = []
        const groupSize = Math.ceil(keys.length / 4)
        for (let i = 0; i < keys.length; i += groupSize) {
          const group = keys.slice(i, i + groupSize).reduce((acc, key) => {
            acc[key] = result[key]
            return acc
          }, {})
          groups.push(group)
        }

        // รวม value ทั้งหมด
        const sum = Object.values(groups[0]).reduce((total: any, value: any) => total + Number(value), 0)

        const headEntry = fullData?.headerEntry['Capacity Daily Booking (MMBTU/d)']
        delete headEntry['key']

        const entryValue = fullData?.entryValue[0]
        const resultEntry = Object.entries(headEntry).reduce((acc: any, [date, obj]: any) => {
          const key = obj.key
          const value = entryValue[key] // ดึงค่าที่ตรงกับ key จาก entryObj
          acc[date] = {
            ...obj,
            value: value || null // ถ้าไม่พบค่า ให้ใส่เป็น null
          }
          return acc
        }, {})
        const headExit = fullData?.headerExit['Capacity Daily Booking (MMBTU/d)']
        const exitValue = fullData?.exitValue[0]
        delete headExit['key']
        const resultExit = Object.entries(headExit).reduce((acc: any, [date, obj]: any) => {
          const key = obj.key
          const value = exitValue[key] // ดึงค่าที่ตรงกับ key จาก entryObj
          acc[date] = {
            ...obj,
            value: value || null // ถ้าไม่พบค่า ให้ใส่เป็น null
          }
          return acc
        }, {})

        return {
          id: eSum['id'],
          entry_exit_id: eSum['entry_exit_id'],
          entry_exit: eSum['entry_exit'],
          contract_point: eSum['contract_point'],
          zone_text: eSum['zone_text'],
          area_text: eSum['area_text'],
          start_date: eSum['data_temp'][fromTo],
          end_date: eSum['data_temp'][fromTo + 1],
          contracted_mmbtu_d: sum,
          contracted_mmscfd: sum,
          value: eSum['entry_exit_id'] === 1 ? resultEntry : resultExit
        }
      })
      const newRes = await Promise.all(
        exitUse.map(async (e: any) => {
          const pathMatch = e
          let exitData =
            (!!setData &&
              setData.find((f: any) => {
                return f?.area_text === e['area_text']
              })) ||
            null

          const filETs = findEntry?.find((f: any) => {
            return f?.exit_name_temp === exitData?.area_text
          })

          return {
            pathMatch,
            exitData,
            path: filETs
          }
        })
      )

      const contP = await this.prisma.area.findMany({
        where: {
          name: {
            in:
              newRes
                .map((e: any) => e?.path?.entryName)
                .filter((ff: any) => {
                  return !!ff
                }) || [] // กรองเฉพาะ name ที่ต้องการ
          }
        },
        select: {
          name: true,
          entry_exit: true,
          area_nominal_capacity: true,
          contract_point: {
            select: {
              contract_point: true,
              zone: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      })

      let newRes2 = newRes.map((e: any) => {
        const fil = contP.find((f: any) => {
          return f?.name === e?.path?.entryName
        })

        let entryData: any = {
          id: e?.exitData?.id,
          entry_exit_id: 1,
          entry_exit: fil?.entry_exit,
          contract_point: fil?.contract_point[0]?.contract_point || null,
          zone_text: fil?.contract_point[0]?.zone?.name || null,
          area_text: e?.filETs?.entryName,
          start_date: e?.exitData?.start_date,
          end_date: e?.exitData?.end_date,
          // contracted_mmbtu_d: contP?.area_nominal_capacity,
          contracted_mmbtu_d: e?.exitData?.contracted_mmbtu_d,
          contracted_mmscfd: e?.exitData?.contracted_mmbtu_d,
          value: e?.exitData?.value
        }

        return {
          ...e,
          entryData
        }
      })

      resArr.push({
        group: contractCode[ic]?.group,
        contract_code_id: contractCode[ic]?.id,
        contract_code: contractCode[ic]?.contract_code,
        data: newRes2,
        setData: setData,
        findEntry: findEntry
      })
    }

    const newResArr = resArr.map((exs: any) => {
      return {...exs}
    })

    return newResArr
  }

  async findAll2old(payload: any) {
    const {startDate, groupId} = payload
    const contractCode = await this.prisma.contract_code.findMany({
      include: {
        group: true,
        booking_version: {
          include: {
            booking_full_json: true,
            booking_row_json: {
              include: {
                entry_exit: true
              }
            }
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

    if (!contractCode) {
      return []
    }
    let resArr: any = []
    for (let ic = 0; ic < contractCode.length; ic++) {
      const useData = contractCode?.[ic]?.booking_version?.[0]?.booking_row_json || []
      const convertData = useData.map((e: any) => {
        return {
          ...e,
          data_temp: JSON.parse(e['data_temp'])
        }
      })

      const nowDates = getTodayNowAdd7().toDate()

      const pathManagement = await this.prisma.path_management.findFirst({
        where: {
          start_date: {
            lt: nowDates ? getTodayNowAdd7(nowDates).toDate() : null
          }
        },
        include: {
          path_management_config: true
        },
        orderBy: {
          start_date: 'desc'
        }
      })

      const pathEntryExit = pathManagement['path_management_config'].map((e: any) => {
        return {
          ...e,
          temps: JSON.parse(e['temps'])
        }
      })
      const findEntry = pathEntryExit.map((e: any) => {
        const findId = e?.temps?.revised_capacity_path?.find((f: any) => {
          return f?.area?.entry_exit_id === 1
        })
        const findExit = e?.temps?.revised_capacity_path?.filter((f: any) => {
          return f?.area?.entry_exit_id === 2
        })

        return {
          ...e,
          entryId: findId?.area?.id,
          entryName: findId?.area?.name,
          findExit,
          full: e?.temps?.revised_capacity_path
        }
      })

      const dataRow = convertData
      const entryUse = dataRow.filter((f: any) => {
        return f?.entry_exit_id === 1
      })
      const exitUse = dataRow.filter((f: any) => {
        return f?.entry_exit_id === 2
      })

      const compareArrEntry = []
      // const fromTo = 33;
      const fromTo = 5
      const fullData = (!!contractCode[ic]?.booking_version[0]?.booking_full_json[0]?.['data_temp'] && JSON.parse(contractCode[ic]?.booking_version[0]?.booking_full_json[0]?.['data_temp'])) || null
      const setData = (convertData || []).map((eSum: any) => {
        const result = Object.keys(eSum['data_temp'])
          .filter((key) => Number(key) >= fromTo + 2)
          .reduce((acc, key) => {
            acc[key] = eSum['data_temp'][key]
            return acc
          }, {})

        // ดึง key ทั้งหมดและจัดเรียง
        const keys = Object.keys(result).sort((a, b) => Number(a) - Number(b))

        // แบ่งเป็น 4 กลุ่ม
        const groups = []
        const groupSize = Math.ceil(keys.length / 4)
        for (let i = 0; i < keys.length; i += groupSize) {
          const group = keys.slice(i, i + groupSize).reduce((acc, key) => {
            acc[key] = result[key]
            return acc
          }, {})
          groups.push(group)
        }

        // รวม value ทั้งหมด
        const sumSFCContractedMMBTU = Object.values(groups[0]).reduce((total: any, value: any) => total + Number(value), 0) || null
        const sumSFCMaximumMMBTU = Object.values(groups[1]).reduce((total: any, value: any) => total + Number(value), 0) || null
        const sumSFCContractedMmscfd = (eSum['entry_exit_id'] === 1 && Object.values(groups[2]).reduce((total: any, value: any) => total + Number(value), 0)) || null
        const sumSFCMaximumMmscfd = (eSum['entry_exit_id'] === 1 && Object.values(groups[3]).reduce((total: any, value: any) => total + Number(value), 0)) || null

        // // รวม value ทั้งหมด
        // const sum = Object.values(groups[0]).reduce(
        //   (total: any, value: any) => total + Number(value),
        //   0,
        // );

        const headEntry = fullData?.headerEntry['Capacity Daily Booking (MMBTU/d)']
        delete headEntry['key']

        const entryValue = fullData?.entryValue[0]
        const resultEntry = Object.entries(headEntry).reduce((acc: any, [date, obj]: any) => {
          const key = obj.key
          const value = entryValue[key] // ดึงค่าที่ตรงกับ key จาก entryObj
          acc[date] = {
            ...obj,
            value: value || null // ถ้าไม่พบค่า ให้ใส่เป็น null
          }
          return acc
        }, {})
        const headExit = fullData?.headerExit['Capacity Daily Booking (MMBTU/d)']
        const exitValue = fullData?.exitValue[0]
        delete headExit['key']
        const resultExit = Object.entries(headExit).reduce((acc: any, [date, obj]: any) => {
          const key = obj.key
          const value = exitValue[key] // ดึงค่าที่ตรงกับ key จาก entryObj
          acc[date] = {
            ...obj,
            value: value || null // ถ้าไม่พบค่า ให้ใส่เป็น null
          }
          return acc
        }, {})

        return {
          id: eSum['id'],
          entry_exit_id: eSum['entry_exit_id'],
          entry_exit: eSum['entry_exit'],
          contract_point: eSum['contract_point'],
          zone_text: eSum['zone_text'],
          area_text: eSum['area_text'],
          start_date: eSum['data_temp'][fromTo],
          end_date: eSum['data_temp'][fromTo + 1],
          value: eSum['entry_exit_id'] === 1 ? resultEntry : resultExit,
          // contracted_mmbtu_d: sum,
          // contracted_mmscfd: sum,
          contracted_mmbtu_d: sumSFCContractedMMBTU,
          maximum_mmbtu: sumSFCMaximumMMBTU,
          contracted_mmscfd: eSum['entry_exit_id'] === 1 ? sumSFCContractedMmscfd : null,
          maximum_mmscfd: eSum['entry_exit_id'] === 1 ? sumSFCMaximumMmscfd : null
        }
      })
      const newRes = await Promise.all(
        exitUse.map(async (e: any) => {
          const pathMatch = e
          let exitData =
            (!!setData &&
              setData.find((f: any) => {
                return f?.area_text === e['area_text']
              })) ||
            null

          const filETs = findEntry?.find((f: any) => {
            return f?.exit_name_temp === exitData?.area_text
          })

          return {
            pathMatch,
            pathMatchExit: pathMatch,
            exitData,
            path: filETs
          }
        })
      )

      const contP = await this.prisma.area.findMany({
        where: {
          name: {
            in:
              newRes
                .map((e: any) => e?.path?.entryName)
                .filter((ff: any) => {
                  return !!ff
                }) || [] // กรองเฉพาะ name ที่ต้องการ
          }
        },
        select: {
          name: true,
          entry_exit: true,
          area_nominal_capacity: true,
          contract_point: {
            select: {
              contract_point: true,
              zone: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      })

      let newRes2 = newRes.map((e: any) => {
        const fil = contP.find((f: any) => {
          return f?.name === e?.path?.entryName
        })

        let entData = setData.find((f: any) => {
          return f?.['entry_exit_id'] === 1
        })

        const pathMatchEntry = entryUse.find((f: any) => {
          return f?.area_text === entData['area_text']
        })

        let entryData: any = {
          id: entData?.id,
          entry_exit_id: 1,
          entry_exit: fil?.entry_exit,
          contract_point: fil?.contract_point[0]?.contract_point || null,
          zone_text: fil?.contract_point[0]?.zone?.name || null,
          // area_text: e?.filETs?.entryName,
          area_text: fil?.name,
          start_date: entData?.start_date,
          end_date: entData?.end_date,
          // contracted_mmbtu_d: contP?.area_nominal_capacity,
          contracted_mmbtu_d: entData?.contracted_mmbtu_d,
          contracted_mmscfd: entData?.contracted_mmbtu_d,
          value: entData?.value,
          maximum_mmbtu: entData?.maximum_mmbtu || null,
          maximum_mmscfd: entData?.maximum_mmscfd || null
        }

        return {
          ...e,
          pathMatchEntry: pathMatchEntry,
          entryData
        }
      })

      resArr.push({
        group: contractCode[ic]?.group,
        contract_code_id: contractCode[ic]?.id,
        contract_code: contractCode[ic]?.contract_code,
        data: newRes2,
        setData: setData,
        findEntry: findEntry
      })
    }

    const newResArr = resArr.map((exs: any) => {
      exs['data'] = exs['data'].map((exss: any) => {
        let date12MonthBefore = this.generateDateData12BF(startDate)
        let value3Et = date12MonthBefore
        let value3Ex = date12MonthBefore
        let valueOld = exss['entryData']?.['value']

        // 🔥 รวมค่าที่ตรงกัน entry
        Object.keys(value3Et).forEach((monthYear) => {
          // หา key ที่ตรงกันใน `value` โดยแปลง format จาก `10/MM/YYYY` → `MM/YYYY`
          const matchingKey = Object.keys(valueOld).find((date) => date.slice(3) === monthYear)

          // ถ้าพบ key ที่ตรงกัน ให้อัปเดต `value3Et`
          if (matchingKey) {
            value3Et[monthYear] = valueOld[matchingKey]
          }
        })
        // 🔥 รวมค่าที่ตรงกัน entry
        Object.keys(value3Ex).forEach((monthYear) => {
          // หา key ที่ตรงกันใน `value` โดยแปลง format จาก `10/MM/YYYY` → `MM/YYYY`
          const matchingKey = Object.keys(valueOld).find((date) => date.slice(3) === monthYear)

          // ถ้าพบ key ที่ตรงกัน ให้อัปเดต `value3Ex`
          if (matchingKey) {
            value3Ex[monthYear] = valueOld[matchingKey]
          }
        })

        return {
          ...exss,
          entryData: {
            ...exss['entryData'],
            valueBefor12Month: value3Et
          },
          exitData: {
            ...exss['exitData'],
            valueBefor12Month: value3Ex
          }
        }
      })
      return {...exs}
    })
    return newResArr
  }

  getContractValueSummaryByGroup(allValueInContractList: any[]) {
    const groupedContractPoints = allValueInContractList.reduce((groups: any, item: any) => {
      const groupKey = `${item.area_text}_${item.entry_exit?.name || item.entry_exit_id || 'Unknown'}_${item.zone_text}`

      if (!groups[groupKey]) {
        groups[groupKey] = {
          area_text: item.area_text,
          entry_exit_name: item.entry_exit?.name || item.entry_exit_id || 'Unknown',
          zone_text: item.zone_text,
          // items: [],
          contracted_mmbtu_d_summary: {},
          contracted_mmscfd_summary: {},
          maximum_mmbtu_summary: {},
          maximum_mmscfd_summary: {}
        }
      }

      // groups[groupKey].items.push(item);

      // Summary contracted_mmbtu_d_array values grouped by date
      if (item.contracted_mmbtu_d_array && Array.isArray(item.contracted_mmbtu_d_array)) {
        item.contracted_mmbtu_d_array.forEach((arrayItem: any) => {
          const date = arrayItem.date
          const value = arrayItem.value || 0

          if (!groups[groupKey].contracted_mmbtu_d_summary[date]) {
            groups[groupKey].contracted_mmbtu_d_summary[date] = {
              date: date,
              total_value: 0,
              count: 0
            }
          }

          groups[groupKey].contracted_mmbtu_d_summary[date].total_value += value
          groups[groupKey].contracted_mmbtu_d_summary[date].count += 1
        })
      }

      // Summary contracted_mmscfd_array values grouped by date
      if (item.contracted_mmscfd_array && Array.isArray(item.contracted_mmscfd_array)) {
        item.contracted_mmscfd_array.forEach((arrayItem: any) => {
          const date = arrayItem.date
          const value = arrayItem.value || 0

          if (!groups[groupKey].contracted_mmscfd_summary[date]) {
            groups[groupKey].contracted_mmscfd_summary[date] = {
              date: date,
              total_value: 0,
              count: 0
            }
          }

          groups[groupKey].contracted_mmscfd_summary[date].total_value += value
          groups[groupKey].contracted_mmscfd_summary[date].count += 1
        })
      }

      // Summary maximum_mmbtu_array values grouped by date
      if (item.maximum_mmbtu_array && Array.isArray(item.maximum_mmbtu_array)) {
        item.maximum_mmbtu_array.forEach((arrayItem: any) => {
          const date = arrayItem.date
          const value = arrayItem.value || 0

          if (!groups[groupKey].maximum_mmbtu_summary[date]) {
            groups[groupKey].maximum_mmbtu_summary[date] = {
              date: date,
              total_value: 0,
              count: 0
            }
          }

          groups[groupKey].maximum_mmbtu_summary[date].total_value += value
          groups[groupKey].maximum_mmbtu_summary[date].count += 1
        })
      }

      // Summary maximum_mmscfd_array values grouped by date
      if (item.maximum_mmscfd_array && Array.isArray(item.maximum_mmscfd_array)) {
        item.maximum_mmscfd_array.forEach((arrayItem: any) => {
          const date = arrayItem.date
          const value = arrayItem.value || 0

          if (!groups[groupKey].maximum_mmscfd_summary[date]) {
            groups[groupKey].maximum_mmscfd_summary[date] = {
              date: date,
              total_value: 0,
              count: 0
            }
          }

          groups[groupKey].maximum_mmscfd_summary[date].total_value += value
          groups[groupKey].maximum_mmscfd_summary[date].count += 1
        })
      }

      return groups
    }, {})
    return groupedContractPoints
  }

  getAllocatedValueByAreaEntryExitZone(evidenData: any[], gasDay: dayjs.Dayjs, areaText: string, entryExitName: string, zoneText: string, contractCode?: string) {
    let totalAllocatedValue = 0
    let count = 0
    let foundItems: any[] = []
    let hasValidValues = false

    // Filter evidenData by gas_day that is in the same month as gasDay
    const filteredEvidenData = evidenData.filter((item: any) => {
      const itemGasDay = item.gas_day || item.date || item.day
      if (itemGasDay) {
        const itemDate = dayjs(itemGasDay)
        return itemDate.isValid() && itemDate.isSame(gasDay, 'month') && item.data && Array.isArray(item.data)
      }
      return false
    })
    filteredEvidenData.forEach((item: any) => {
      const itemGasDay = item.gas_day || item.date || item.day
      if (item.data && Array.isArray(item.data)) {
        const onlyMatchContractList = item.data.filter((contractDataItem: any) => {
          return !contractCode || isMatch(contractDataItem.contract, contractCode)
        })
        onlyMatchContractList.map((contractDataItem: any) => {
          const filteredData = contractDataItem?.data?.filter((dataItem: any) => {
            const area = dataItem.area
            const entry_exit = dataItem.entry_exit
            const zone = dataItem.zone
            return isMatch(area, areaText) && isMatch(entry_exit, entryExitName) && isMatch(zone, zoneText) && dataItem.values && Array.isArray(dataItem.values)
          })
          filteredData.map((dataItem: any) => {
            if (dataItem.values && Array.isArray(dataItem.values)) {
              const allocatedValueItem = dataItem.values.find((valueItem: any) => valueItem.tag === 'allocatedValue')

              if (allocatedValueItem) {
                const value = allocatedValueItem.value
                try {
                  const numValue = Number(value)
                  if (!isNaN(numValue) && isFinite(numValue)) {
                    totalAllocatedValue += numValue
                    hasValidValues = true
                  }
                } catch (error) {
                  // Invalid value, skip it
                }
                count += 1
                foundItems.push({
                  contract: contractDataItem.contract,
                  shipper: contractDataItem.shipper,
                  contract_point: dataItem.contract_point,
                  allocated_value: allocatedValueItem.value,
                  gas_day: itemGasDay
                })
              }
            }
          })
        })
      }
    })

    return {
      gasDay: gasDay.format('MM/YYYY'),
      area_text: areaText,
      entry_exit_name: entryExitName,
      zone_text: zoneText,
      total_allocated_value: hasValidValues ? totalAllocatedValue : undefined,
      count: count,
      found_items: foundItems
    }
  }

  async findAll2(payload: any) {
    const {startDate, shipper} = payload
    const todayStart = getTodayStartAdd7().toDate()
    let lastDate = dayjs(startDate, 'MM/YYYY').endOf('month')
    if (!lastDate.isValid()) {
      lastDate = dayjs().endOf('month')
    }
    const firstDate = lastDate.subtract(11, 'month').startOf('month')

    const andInWhere: Prisma.contract_codeWhereInput[] = [
      {
        status_capacity_request_management_id: {
          in: [2, 5]
        }
      },
      {
        contract_start_date: {
          lte: lastDate.toDate() // start_date ต้องก่อน
        }
      },
      {
        term_type_id: {
          not: 4
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
              gt: firstDate.toDate()
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
                  gt: firstDate.toDate()
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
                      gt: firstDate.toDate()
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
    if (shipper) {
      andInWhere.push({
        group_id: Number(shipper)
      })
    }
    const contractCode = await this.prisma.contract_code.findMany({
      include: {
        group: true,
        booking_version: {
          include: {
            booking_full_json: true,
            booking_row_json: {
              include: {
                entry_exit: true
              }
            }
          },
          take: 1,
          orderBy: {
            id: 'desc'
          }
        }
      },
      where: {
        AND: andInWhere
      },
      orderBy: {
        id: 'desc'
      }
    })
    const fromTo = 5
    const nowDates = getTodayNowAdd7().toDate()

    const pathManagement = await this.prisma.path_management.findFirst({
      where: {
        start_date: {
          lt: nowDates ? getTodayNowAdd7(nowDates).toDate() : null
        }
      },
      include: {
        path_management_config: true
      },
      orderBy: {
        start_date: 'desc'
      }
    })

    if (!!!pathManagement) {
      return []
    }

    const pathEntryExit = pathManagement['path_management_config'].map((e: any) => {
      return {
        ...e,
        temps: JSON.parse(e['temps'])
      }
    })

    const findEntry = pathEntryExit.map((e: any) => {
      const findId = e?.temps?.revised_capacity_path?.find((f: any) => {
        return f?.area?.entry_exit_id === 1
      })
      const findExit = e?.temps?.revised_capacity_path?.filter((f: any) => {
        return f?.area?.entry_exit_id === 2
      })

      return {
        ...e,
        entryId: findId?.area?.id,
        entryName: findId?.area?.name,
        findExit,
        full: e?.temps?.revised_capacity_path
      }
    })

    if (!contractCode) {
      return []
    }

    const shipperObj = shipper
      ? await this.prisma.group.findFirst({
          where: {
            id: Number(shipper)
          }
        })
      : null

    let evidenData: any[] = []
    try {
      // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
      let endDate = lastDate
      if (lastDate.isAfter(dayjs(), 'day')) {
        endDate = dayjs()
      }
      const agent = new https.Agent({
        rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
      })
      const body = {
        start_date: firstDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
        end_date: endDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
        // start_date: '2025-01-01',
        // end_date: '2025-02-28',
        // contract: 'code',
        // contract_point: 'name'
        skip: Number(0),
        limit: Number(1)
      }
      if (shipperObj) {
        body['shipper'] = shipperObj.id_name
      }
      const dataToGetLimit = JSON.stringify(body)

      const resToGetLimit = await axios.request({
        method: `${process.env.METHOD_EVIDEN}`,
        maxBodyLength: Infinity,
        url: `${process.env.IP_EVIDEN}/allocation_allocation_report_by_contract_point`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: process.env.TOKEN_EVIDEN
        },
        httpsAgent: agent,
        data: dataToGetLimit
      })

      if (!!resToGetLimit?.data) {
        if (Array.isArray(resToGetLimit.data) && resToGetLimit.data.length > 0) {
          let total_record = undefined
          resToGetLimit.data.map((resEvidenData: any) => {
            if (resEvidenData && resEvidenData?.total_record) {
              try {
                const total = Number(resEvidenData?.total_record)
                if (!Number.isNaN(total)) {
                  if (total_record) {
                    total_record += total
                  } else {
                    total_record = total
                  }
                }
              } catch (error) {
                if (total_record) {
                  total_record += 0
                }
              }
            }
          })
          body.limit = total_record
        } else {
          body.limit = 100
        }
      }
      const data = JSON.stringify(body)

      const config = {
        method: `${process.env.METHOD_EVIDEN}`,
        maxBodyLength: Infinity,
        // 10.100.98.49
        url: `${process.env.IP_EVIDEN}/allocation_allocation_report_by_contract_point`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: process.env.TOKEN_EVIDEN
        },
        httpsAgent: agent,
        data: data
      }

      const resEviden = await axios.request(config)
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (resEviden && Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden.data.map((resEvidenData: any) => {
            if (resEvidenData && resEvidenData?.total_record) {
              try {
                const totalRecord = Number(resEvidenData?.total_record)
                if (!Number.isNaN(totalRecord)) {
                  if (total_record) {
                    total_record += totalRecord
                  } else {
                    total_record = totalRecord
                  }
                }
              } catch (error) {
                if (total_record) {
                  total_record += 0
                }
              }
            }
            if (resEvidenData && resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              evidenData.push(...resEvidenData.data)
            }
          })
        } else {
          evidenData = resEviden && resEviden?.data?.data || []
        }
      }
    } catch (error) {
      evidenData = []
    }

    let allContractPointInContractList: any[] = []
    let resArr: any = []
    for (let ic = 0; ic < contractCode.length; ic++) {
      const convertDataFull = contractCode[ic]?.booking_version[0]?.booking_full_json[0]
      convertDataFull['data_temp'] = JSON.parse(contractCode[ic]?.booking_version[0]?.booking_full_json[0]['data_temp'])

      const convertData = (contractCode[ic]?.booking_version[0]?.booking_row_json || []).map((e: any) => {
        return {
          ...e,
          data_temp: JSON.parse(e['data_temp'])
        }
      })

      const headMMBTU = convertDataFull['data_temp']['headerEntry']['Capacity Daily Booking (MMBTU/d)']
      const headMMSCFD = convertDataFull['data_temp']['headerEntry']['Capacity Daily Booking (MMscfd)']
      const headMMBTUH = convertDataFull['data_temp']['headerEntry']['Maximum Hour Booking (MMBTU/h)']
      const headMMSCFH = convertDataFull['data_temp']['headerEntry']['Maximum Hour Booking (MMscfh)']

      const keysMMBTU = Object.keys(headMMBTU)
        .filter((date) => headMMBTU[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
        .map((date) => ({
          key: Number(headMMBTU[date].key), // แปลง key เป็นตัวเลข
          date: date // ใช้ date เป็นค่า
        }))
        .sort((a, b) => a.key - b.key) // เรียงลำดับตาม key
      const keysMMBTH = Object.keys(headMMBTUH)
        .filter((date) => headMMBTUH[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
        .map((date) => ({
          key: Number(headMMBTUH[date].key), // แปลง key เป็นตัวเลข
          date: date // ใช้ date เป็นค่า
        }))
        .sort((a, b) => a.key - b.key) // เรียงลำดับตาม key
      const keysMMSCFD = Object.keys(headMMSCFD)
        .filter((date) => headMMSCFD[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
        .map((date) => ({
          key: Number(headMMSCFD[date].key), // แปลง key เป็นตัวเลข
          date: date // ใช้ date เป็นค่า
        }))
        .sort((a, b) => a.key - b.key) // เรียงลำดับตาม key
      const keysMMSCFH = Object.keys(headMMSCFH)
        .filter((date) => headMMSCFH[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
        .map((date) => ({
          key: Number(headMMSCFH[date].key), // แปลง key เป็นตัวเลข
          date: date // ใช้ date เป็นค่า
        }))
        .sort((a, b) => a.key - b.key) // เรียงลำดับตาม key

      const dataRow = convertData

      const entryUse = dataRow.filter((f: any) => {
        return f?.entry_exit_id === 1
      })

      const exitUse = dataRow.filter((f: any) => {
        return f?.entry_exit_id === 2
      })

      const setData = (convertData || []).map((eSum: any) => {
        const result = Object.keys(eSum['data_temp'])
          .filter((key) => Number(key) >= fromTo + 2)
          .reduce((acc, key) => {
            acc[key] = eSum['data_temp'][key]
            return acc
          }, {})

        // ดึง key ทั้งหมดและจัดเรียง
        const keys = Object.keys(result).sort((a, b) => Number(a) - Number(b))
        // แบ่งเป็น 4 กลุ่ม
        const groups = []
        const groupSize = eSum['entry_exit_id'] === 1 ? Math.ceil(keys.length / 4) : Math.ceil(keys.length / 2)
        for (let i = 0; i < keys.length; i += groupSize) {
          const group = keys.slice(i, i + groupSize).reduce((acc, key) => {
            acc[key] = result[key]
            return acc
          }, {})
          groups.push(group)
        }
        // รวม value ทั้งหมด
        const sumSFCContractedMMBTU = (!!groups[0] && Object.values(groups[0]).reduce((total: any, value: any) => total + Number(value), 0)) || null
        const sumSFCMaximumMMBTU = (!!groups[1] && Object.values(groups[1]).reduce((total: any, value: any) => total + Number(value), 0)) || null
        const sumSFCContractedMmscfd = (eSum['entry_exit_id'] === 1 && !!groups[2] && Object.values(groups[2]).reduce((total: any, value: any) => total + Number(value), 0)) || null
        const sumSFCMaximumMmscfd = (eSum['entry_exit_id'] === 1 && !!groups[3] && Object.values(groups[3]).reduce((total: any, value: any) => total + Number(value), 0)) || null

        const fullData: any = contractCode[ic]?.booking_version[0]?.booking_full_json[0]?.['data_temp'] || null

        const headEntry = fullData?.headerEntry['Capacity Daily Booking (MMBTU/d)']
        delete headEntry['key']

        const entryValue = fullData?.entryValue[0]
        const resultEntry = Object.entries(headEntry).reduce((acc: any, [date, obj]: any) => {
          const key = obj.key
          const value = entryValue[key] // ดึงค่าที่ตรงกับ key จาก entryObj
          acc[date] = {
            ...obj,
            value: value || null // ถ้าไม่พบค่า ให้ใส่เป็น null
          }
          return acc
        }, {})
        const headExit = fullData?.headerExit['Capacity Daily Booking (MMBTU/d)']
        const exitValue = fullData?.exitValue[0]
        delete headExit['key']
        const resultExit = Object.entries(headExit).reduce((acc: any, [date, obj]: any) => {
          const key = obj.key
          const value = exitValue[key] // ดึงค่าที่ตรงกับ key จาก entryObj
          acc[date] = {
            ...obj,
            value: value || null // ถ้าไม่พบค่า ให้ใส่เป็น null
          }
          return acc
        }, {})

        const transformedData = keysMMBTU.reduce((acc, item) => {
          acc[item.date] = {
            key: item.key.toString(),
            value: (!!result[item['key']] && Number(result[item['key']].replace(/,/g, ''))) || null
          }
          return acc
        }, {})

        return {
          id: eSum['id'],
          booking_row_json_id: eSum['id'],
          booking_version_id: eSum['booking_version_id'],
          entry_exit_id: eSum['entry_exit_id'],
          entry_exit: eSum['entry_exit'],
          contract_point: eSum['contract_point'],
          zone_text: eSum['zone_text'],
          area_text: eSum['area_text'],
          start_date: eSum['data_temp'][fromTo],
          end_date: eSum['data_temp'][fromTo + 1],
          contracted_mmbtu_d: sumSFCContractedMMBTU,
          maximum_mmbtu: sumSFCMaximumMMBTU,
          contracted_mmscfd: eSum['entry_exit_id'] === 1 ? sumSFCContractedMmscfd : null,
          maximum_mmscfd: eSum['entry_exit_id'] === 1 ? sumSFCMaximumMmscfd : null,
          contracted_mmbtu_d_array:
            keysMMBTU.map((ks: any, kix: number) => {
              let st = kix === 0 ? eSum['data_temp'][fromTo] : keysMMBTU[kix]?.date
              let ed =
                kix === keysMMBTU.length - 1
                  ? dayjs(eSum['data_temp'][fromTo + 1], 'DD/MM/YYYY')
                      .subtract(1, 'day')
                      .format('DD/MM/YYYY')
                  : keysMMBTU.length > 0
                    ? dayjs(keysMMBTU[kix + 1]?.date, 'DD/MM/YYYY')
                        .subtract(1, 'day')
                        .format('DD/MM/YYYY')
                    : dayjs(eSum['data_temp'][fromTo + 1], 'DD/MM/YYYY')
                        .subtract(1, 'day')
                        .format('DD/MM/YYYY')
              return {
                ...ks,
                value: (!!result[ks['key']] && Number(result[ks['key']].replace(/,/g, ''))) || null,
                start_date: st,
                end_date: ed
              }
            }) || [],
          maximum_mmbtu_array:
            keysMMBTH.map((ks: any, kix: number) => {
              let st = kix === 0 ? eSum['data_temp'][fromTo] : keysMMBTH[kix]?.date
              let ed =
                kix === keysMMBTH.length - 1
                  ? dayjs(eSum['data_temp'][fromTo + 1], 'DD/MM/YYYY')
                      .subtract(1, 'day')
                      .format('DD/MM/YYYY')
                  : keysMMBTH.length > 0
                    ? dayjs(keysMMBTH[kix + 1]?.date, 'DD/MM/YYYY')
                        .subtract(1, 'day')
                        .format('DD/MM/YYYY')
                    : dayjs(eSum['data_temp'][fromTo + 1], 'DD/MM/YYYY')
                        .subtract(1, 'day')
                        .format('DD/MM/YYYY')
              return {
                ...ks,
                value: (!!result[ks['key']] && Number(result[ks['key']].replace(/,/g, ''))) || null,
                start_date: st,
                end_date: ed
              }
            }) || [],
          contracted_mmscfd_array:
            eSum['entry_exit_id'] === 1
              ? keysMMSCFD.map((ks: any, kix: number) => {
                  let st = kix === 0 ? eSum['data_temp'][fromTo] : keysMMSCFD[kix]?.date
                  let ed =
                    kix === keysMMSCFD.length - 1
                      ? dayjs(eSum['data_temp'][fromTo + 1], 'DD/MM/YYYY')
                          .subtract(1, 'day')
                          .format('DD/MM/YYYY')
                      : keysMMSCFD.length > 0
                        ? dayjs(keysMMSCFD[kix + 1]?.date, 'DD/MM/YYYY')
                            .subtract(1, 'day')
                            .format('DD/MM/YYYY')
                        : dayjs(eSum['data_temp'][fromTo + 1], 'DD/MM/YYYY')
                            .subtract(1, 'day')
                            .format('DD/MM/YYYY')
                  return {
                    ...ks,
                    value: (!!result[ks['key']] && Number(result[ks['key']].replace(/,/g, ''))) || null,
                    start_date: st,
                    end_date: ed
                  }
                })
              : [],
          maximum_mmscfd_array:
            eSum['entry_exit_id'] === 1
              ? keysMMSCFH.map((ks: any, kix: number) => {
                  let st = kix === 0 ? eSum['data_temp'][fromTo] : keysMMSCFH[kix]?.date
                  let ed =
                    kix === keysMMSCFH.length - 1
                      ? dayjs(eSum['data_temp'][fromTo + 1], 'DD/MM/YYYY')
                          .subtract(1, 'day')
                          .format('DD/MM/YYYY')
                      : keysMMSCFH.length > 0
                        ? dayjs(keysMMSCFH[kix + 1]?.date, 'DD/MM/YYYY')
                            .subtract(1, 'day')
                            .format('DD/MM/YYYY')
                        : dayjs(eSum['data_temp'][fromTo + 1], 'DD/MM/YYYY')
                            .subtract(1, 'day')
                            .format('DD/MM/YYYY')
                  return {
                    ...ks,
                    value: (!!result[ks['key']] && Number(result[ks['key']].replace(/,/g, ''))) || null,
                    start_date: st,
                    end_date: ed
                  }
                })
              : [],
          value: transformedData
        }
      })

      if (setData && setData.length > 0) {
        allContractPointInContractList.push(...setData)
      }

      const newRes = await Promise.all(
        exitUse.map(async (e: any) => {
          const pathMatch = e
          let exitData = setData.find((f: any) => {
            return f?.area_text === e['area_text']
          })
          let entData = setData.find((f: any) => {
            return f?.['entry_exit_id'] === 1
          })

          const pathMatchEntry = entryUse.find((f: any) => {
            return f?.area_text === entData['area_text']
          })

          const filETs = findEntry?.find((f: any) => {
            return f?.exit_name_temp === exitData?.area_text
          })

          let entryData: any = {
            ...entData
          }

          let entryDataArrUse = setData.filter((f: any) => {
            return f?.['entry_exit_id'] === 1
          })

          return {
            pathMatch,
            pathMatchExit: pathMatch,
            pathMatchEntry: pathMatchEntry,
            entryData,
            //
            exitData,
            pathMatchExitUse: pathMatch,
            entryDataArrUse: entryDataArrUse.map((eDa: any) => {
              const pathMatchEntry = entryUse.find((f: any) => {
                return f?.area_text === eDa['area_text']
              })
              return {
                ...eDa,
                pathMatchEntry: pathMatchEntry
              }
            }),
            path: filETs
          }
        })
      )

      resArr.push({
        group: contractCode[ic]?.group,
        contract_code_id: contractCode[ic]?.id,
        contract_code: contractCode[ic]?.contract_code,
        data: newRes,
        setData: setData,
        findEntry: findEntry
      })
    }

    // Group allContractPointInContractList by area_text, entry_exit.name, and zone_text
    const groupedContractPoints = this.getContractValueSummaryByGroup(allContractPointInContractList)

    const newResArr = resArr.map((exs: any) => {
      exs['data'] = exs['data'].map((exss: any) => {
        let value3Et = this.generateDateData12BF(startDate)
        let value3Ex = this.generateDateData12BF(startDate)
        const oldEntry = exss['entryData']
        const oldExit = exss['exitData']
        const oldEntryAreaText = oldEntry?.area_text
        const oldEntryEntryExitName = oldEntry?.entry_exit?.name || oldEntry?.entry_exit_id || 'Unknown'
        const oldEntryZoneText = oldEntry?.zone_text
        const oldExitAreaText = oldExit?.area_text
        const oldExitEntryExitName = oldExit?.entry_exit?.name || oldExit?.entry_exit_id || 'Unknown'
        const oldExitZoneText = oldExit?.zone_text
        let valueOldEntry = exss['entryData']?.['value']
        let valueOldExit = exss['exitData']?.['value']

        // 🔥 รวมค่าที่ตรงกัน entry
        Object.keys(value3Et).forEach((monthYear) => {
          // หา key ที่ตรงกันใน `value` โดยแปลง format จาก `10/MM/YYYY` → `MM/YYYY`
          const matchingKey = Object.keys(valueOldEntry).find((date) => date.slice(3) === monthYear)

          // ถ้าพบ key ที่ตรงกัน ให้อัปเดต `value3Et`
          if (matchingKey) {
            const gasDay = dayjs(matchingKey, 'DD/MM/YYYY').endOf('month')
            const groupKey = `${oldEntryAreaText}_${oldEntryEntryExitName}_${oldEntryZoneText}`
            const totalMmbtuByArea = groupedContractPoints[groupKey]?.contracted_mmbtu_d_summary[matchingKey]?.total_value
            // const totalMmscfd = groupedContractPoints[groupKey]?.contracted_mmscfd_summary[matchingKey]?.total_value
            // const totalMaximumMmbtu = groupedContractPoints[groupKey]?.maximum_mmbtu_summary[matchingKey]?.total_value
            // const totalMaximumMmscfd = groupedContractPoints[groupKey]?.maximum_mmscfd_summary[matchingKey]?.total_value

            // Get allocatedValue summary for specific area, entry_exit, and zone
            const allocatedSummary = this.getAllocatedValueByAreaEntryExitZone(evidenData, gasDay, oldEntryAreaText, oldEntryEntryExitName, oldEntryZoneText)

            if (totalMmbtuByArea && gasDay.isValid() && allocatedSummary.total_allocated_value != undefined) {
              value3Et[monthYear] = {
                ...valueOldEntry[matchingKey],
                allocated_value: allocatedSummary.total_allocated_value / totalMmbtuByArea
              }
            } else {
              value3Et[monthYear] = valueOldEntry[matchingKey]
            }
          }
        })

        // 🔥 รวมค่าที่ตรงกัน exit
        Object.keys(value3Ex).forEach((monthYear) => {
          // หา key ที่ตรงกันใน `value` โดยแปลง format จาก `10/MM/YYYY` → `MM/YYYY`
          const matchingKey = Object.keys(valueOldExit).find((date) => date.slice(3) === monthYear)

          // ถ้าพบ key ที่ตรงกัน ให้อัปเดต `value3Ex`
          if (matchingKey) {
            const gasDay = dayjs(matchingKey, 'DD/MM/YYYY').endOf('month')
            const groupKey = `${oldExitAreaText}_${oldExitEntryExitName}_${oldExitZoneText}`
            const totalMmbtuByArea = groupedContractPoints[groupKey]?.contracted_mmbtu_d_summary[matchingKey]?.total_value

            // Get allocatedValue summary for specific area, entry_exit, and zone
            const allocatedSummary = this.getAllocatedValueByAreaEntryExitZone(evidenData, gasDay, oldExitAreaText, oldExitEntryExitName, oldExitZoneText)

            if (totalMmbtuByArea && gasDay.isValid() && allocatedSummary.total_allocated_value != undefined) {
              value3Et[monthYear] = {
                ...valueOldEntry[matchingKey],
                allocated_value: allocatedSummary.total_allocated_value / totalMmbtuByArea
              }
            } else {
              value3Ex[monthYear] = valueOldExit[matchingKey]
            }
          }
        })

        return {
          ...exss,
          entryData: {
            ...exss['entryData'],
            valueBefor12Month: value3Et
          },
          exitData: {
            ...exss['exitData'],
            valueBefor12Month: value3Ex
          }
        }
      })
      return {...exs}
    })
    return newResArr
  }

  async release(payload: any, userId: any) {
    const {contract_code_id, group_id, data, useData} = payload

    const dateCre = getTodayNowAdd7()

    const summary = await this.prisma.release_summary.create({
      data: {
        ...(contract_code_id !== null && {
          contract_code: {
            connect: {
              id: Number(contract_code_id)
            }
          }
        }),
        ...(group_id !== null && {
          group: {
            connect: {
              id: Number(group_id)
            }
          }
        }),

        release_type: {
          connect: {
            id: 1
          }
        },
        submitted_timestamp: dateCre.toDate(),
        create_date: dateCre.toDate(),
        // create_by: Number(userId),
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      }
    })
    let dataArr: any = []
    for (let i = 0; i < data.length; i++) {
      dataArr.push({
        release_summary_id: summary?.id,
        entry_exit_id: Number(data[i]?.entry_exit_id),
        booking_row_json_id: parseToNumber(data[i]?.id),
        temp_contract_point: data[i]?.contract_point,
        temp_area: data[i]?.area_text,
        temp_zone: data[i]?.zone_text,
        total_contracted_mmbtu_d: data[i]?.total_contracted_mmbtu_d || data[i]?.total_contracted_mmbtu_d == 0 ? String(data[i]?.total_contracted_mmbtu_d) : null,
        total_release_mmbtu_d: data[i]?.total_release_mmbtu_d || data[i]?.total_release_mmbtu_d == 0 ? String(data[i]?.total_release_mmbtu_d) : null,
        total_contracted_mmscfd: data[i]?.total_contracted_mmscfd || data[i]?.total_contracted_mmscfd == 0 ? String(data[i]?.total_contracted_mmscfd) : null,
        total_release_mmscfd: data[i]?.total_release_mmscfd || data[i]?.total_release_mmscfd == 0 ? String(data[i]?.total_release_mmscfd) : null,
        release_start_date: data[i]?.start_date ? getTodayNowDDMMYYYYDfaultAdd7(data[i]?.start_date).toDate() : null,
        release_end_date: data[i]?.end_date ? getTodayNowDDMMYYYYDfaultAdd7(data[i]?.end_date).toDate() : null,

        create_date: dateCre.toDate(),
        create_by: Number(userId),
        create_date_num: getTodayNowAdd7().unix()
      })
    }
    await this.prisma.release_summary_detail.createMany({
      data: dataArr
    })

    await this.releaseCapacitySubmissionService.stampRelease(useData, contract_code_id)

    return summary
  }

  async findAll3(payload: any) {
    try {
      const {startDate, shipper} = payload
      let lastDate = dayjs(startDate, 'MM/YYYY').endOf('month')
      if (!lastDate.isValid()) {
        lastDate = dayjs().endOf('month')
      }
      const firstDate = lastDate.subtract(11, 'month').startOf('month')

      const andInWhere: Prisma.contract_codeWhereInput[] = [
        {
          status_capacity_request_management_id: {
            in: [2, 5]
          }
        },
        {
          contract_start_date: {
            lte: lastDate.toDate() // start_date ต้องก่อน
          }
        },
        {
          term_type_id: {
            not: 4
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
                gt: firstDate.toDate()
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
                    gt: firstDate.toDate()
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
                        gt: firstDate.toDate()
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
      if (shipper) {
        andInWhere.push({
          group_id: Number(shipper)
        })
      }
      const contractCode = await this.prisma.contract_code.findMany({
        include: {
          group: true,
          booking_version: {
            include: {
              booking_full_json: true,
              booking_row_json: {
                include: {
                  entry_exit: true
                }
              }
            },
            take: 1,
            orderBy: {
              id: 'desc'
            }
          }
        },
        where: {
          AND: andInWhere
        },
        orderBy: {
          id: 'desc'
        }
      })

      if (!contractCode) {
        return []
      }

      const fromTo = 5

      const shipperObj = shipper
        ? await this.prisma.group.findFirst({
            where: {
              id: Number(shipper)
            }
          })
        : null

      let eodEviden: any[] = []
      try {
        // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
        let endDate = lastDate
        if (lastDate.isAfter(dayjs(), 'day')) {
          endDate = dayjs()
        }

        const agent = new https.Agent({
          rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
        })
        const body = {
          start_date: firstDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          end_date: endDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          // contract: 'code',
          // contract_point: 'name'
          skip: Number(0),
          limit: Number(1)
        }
        if (shipperObj) {
          body['shipper'] = shipperObj.id_name
        }
        const dataToGetLimit = JSON.stringify(body)

        const resToGetLimit = await axios.request({
          method: `${process.env.METHOD_EVIDEN}`,
          maxBodyLength: Infinity,
          url: `${process.env.IP_EVIDEN}/allocation_allocation_report_by_contract_point`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: process.env.TOKEN_EVIDEN
          },
          httpsAgent: agent,
          data: dataToGetLimit
        })

        if (!!resToGetLimit?.data) {
          if (Array.isArray(resToGetLimit.data) && resToGetLimit.data.length > 0) {
            let total_record = undefined
            resToGetLimit.data.map((resEvidenData: any) => {
              if (resEvidenData && resEvidenData?.total_record) {
                try {
                  const total = Number(resEvidenData?.total_record)
                  if (!Number.isNaN(total)) {
                    if (total_record) {
                      total_record += total
                    } else {
                      total_record = total
                    }
                  }
                } catch (error) {
                  if (total_record) {
                    total_record += 0
                  }
                }
              }
            })
            body.limit = total_record
          } else {
            body.limit = 100
          }
        }
        const data = JSON.stringify(body)

        const config = {
          method: `${process.env.METHOD_EVIDEN}`,
          maxBodyLength: Infinity,
          // 10.100.98.49
          url: `${process.env.IP_EVIDEN}/allocation_allocation_report_by_contract_point`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: process.env.TOKEN_EVIDEN
          },
          httpsAgent: agent,
          data: data
        }

        const resEviden = await axios.request(config)
        if (resEviden?.status === 200 && !!resEviden?.data) {
          if (resEviden && Array.isArray(resEviden.data) && resEviden.data.length > 0) {
            let total_record = undefined
            resEviden.data.map((resEvidenData: any) => {
              if (resEvidenData && resEvidenData?.total_record) {
                try {
                  const totalRecord = Number(resEvidenData?.total_record)
                  if (!Number.isNaN(totalRecord)) {
                    if (total_record) {
                      total_record += totalRecord
                    } else {
                      total_record = totalRecord
                    }
                  }
                } catch (error) {
                  if (total_record) {
                    total_record += 0
                  }
                }
              }
              if (resEvidenData && resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
                eodEviden.push(...resEvidenData.data)
              }
            })
          } else {
            eodEviden = resEviden && resEviden?.data?.data || []
          }
        }
      } catch (error) {
        eodEviden = []
      }

      const executeEodList = await this.prisma.execute_eod.findMany({
        where: {
          status: {
            equals: 'OK',
            mode: 'insensitive'
          },
          start_date_date: {
            lte: lastDate.toDate()
          },
          end_date_date: {
            gte: firstDate.toDate()
          }
        }
      })

      const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
        where: {
          AND: [
            {
              gas_day: {
                gte: firstDate.toDate()
              }
            },
            {
              gas_day: {
                lte: lastDate.toDate()
              }
            },
            {
              del_flag: true
            }
          ]
        }
      })

      const matchWithExecuteList = eodEviden.filter((item: any) => {
        const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
        return executeEodList?.some((executeData: any) => {
          const executeStart = getTodayNowAdd7(executeData?.start_date_date)
          const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
          return executeData?.request_number_id == item?.request_number && executeStart?.isSameOrBefore(itemGasDay, 'day') && executeEnd?.isSameOrAfter(itemGasDay, 'day')
        })
      })

      const publishData = matchWithExecuteList.filter((evidenData: any) => {
        return !publicationCenterDeletedList?.some((unpublishData: any) => {
          return unpublishData?.execute_timestamp === evidenData.execute_timestamp && unpublishData?.gas_day_text === evidenData.gas_day
        })
      })

      // Get the latest execute_timestamp for each unique combination of gas_day
      const evidenData = publishData.reduce((acc: any[], current: any) => {
        const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day)

        if (existingIndex < 0) {
          acc.push(current)
        } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
          acc[existingIndex] = current
        }

        return acc
      }, [])

      let resArr: any = []
      for (let ic = 0; ic < contractCode.length; ic++) {
        const resultItem: {
          group: {
            id: number
            id_name: string
            name: string
            user_type_id: number
          }
          contract_code_id: number
          contract_code: string
          data: any[]
        } = {
          group: {
            id: contractCode[ic]?.group?.id,
            id_name: contractCode[ic]?.group?.id_name,
            name: contractCode[ic]?.group?.name,
            user_type_id: contractCode[ic]?.group?.user_type_id
          },
          contract_code_id: contractCode[ic]?.id,
          contract_code: contractCode[ic]?.contract_code,
          data: []
        }

        const contractStartDate = getTodayNowAdd7(contractCode[ic]?.contract_start_date).tz('Asia/Bangkok')
        const contractEndDate = getTodayNowAdd7(contractCode[ic]?.terminate_date ?? contractCode[ic]?.extend_deadline ?? contractCode[ic]?.contract_end_date).tz('Asia/Bangkok')

        const fullData: any = contractCode[ic]?.booking_version[0]?.booking_full_json[0]['data_temp'] ? JSON.parse(contractCode[ic]?.booking_version[0]?.booking_full_json[0]['data_temp']) : null

        const dataRow = (contractCode[ic]?.booking_version[0]?.booking_row_json || []).map((e: any) => {
          return {
            ...e,
            data_temp: JSON.parse(e['data_temp'])
          }
        })

        const headMMBTU = fullData?.['headerEntry']?.['Capacity Daily Booking (MMBTU/d)']
        const headMMSCFD = fullData?.['headerEntry']?.['Capacity Daily Booking (MMscfd)']
        // const headMMBTUH = fullData['headerEntry']['Maximum Hour Booking (MMBTU/h)'];
        // const headMMSCFH = fullData['headerEntry']['Maximum Hour Booking (MMscfh)'];

        const firstDate = lastDate.subtract(11, 'month').startOf('month')
        const keysMMBTU = Object.keys(headMMBTU)
          .filter((date) => {
            // const dateJs = getTodayNowDDMMYYYYDfault(date);
            // return headMMBTU[date]?.key && dateJs.isSameOrAfter(firstDate, 'month') && dateJs.isSameOrBefore(lastDate, 'month');
            return headMMBTU[date]?.key
          }) // กรองเฉพาะที่เป็นวันที่และมี key
          .map((date) => ({
            key: Number(headMMBTU[date].key), // แปลง key เป็นตัวเลข
            date: date // ใช้ date เป็นค่า
          }))
          .sort((a, b) => a.key - b.key) // เรียงลำดับตาม key
        // const keysMMBTH = Object.keys(headMMBTUH)
        //   .filter((date) => headMMBTUH[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
        //   .map((date) => ({
        //     key: Number(headMMBTUH[date].key), // แปลง key เป็นตัวเลข
        //     date: date, // ใช้ date เป็นค่า
        //   }))
        //   .sort((a, b) => a.key - b.key); // เรียงลำดับตาม key
        const keysMMSCFD = Object.keys(headMMSCFD)
          .filter((date) => headMMSCFD[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
          .map((date) => ({
            key: Number(headMMSCFD[date].key), // แปลง key เป็นตัวเลข
            date: date // ใช้ date เป็นค่า
          }))
          .sort((a, b) => a.key - b.key) // เรียงลำดับตาม key
        // const keysMMSCFH = Object.keys(headMMSCFH)
        //   .filter((date) => headMMSCFH[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
        //   .map((date) => ({
        //     key: Number(headMMSCFH[date].key), // แปลง key เป็นตัวเลข
        //     date: date, // ใช้ date เป็นค่า
        //   }))
        //   .sort((a, b) => a.key - b.key); // เรียงลำดับตาม key

        const entryUse = dataRow.filter((f: any) => {
          return f?.entry_exit_id === 1
        })

        const exitUse = dataRow.filter((f: any) => {
          return f?.entry_exit_id === 2
        })

        entryUse.map((entryRow: any) => {
          const result = Object.keys(entryRow['data_temp'])
            .filter((key) => {
              const keyNumber = parseToNumber(key)
              return keyNumber >= fromTo + 2
            })
            .reduce((acc, key) => {
              acc[key] = entryRow['data_temp'][key]
              return acc
            }, {})

          const transformedData = keysMMBTU.reduce((acc, item) => {
            acc[item.date] = {
              key: item.key.toString(),
              value: parseToNumber(result[item['key']])
            }
            return acc
          }, {})

          const contractedMmscfd = keysMMSCFD.map((item) => {
            return {
              key: item.key.toString(),
              date: item.date,
              value: parseToNumber(result[item['key']])
              // start_date: st,
              // end_date: ed,
            }
          }, {})

          exitUse.map((exitRow: any) => {
            const exitResult = Object.keys(exitRow['data_temp'])
              .filter((key) => {
                const keyNumber = parseToNumber(key)
                return keyNumber >= fromTo + 2
              })
              .reduce((acc, key) => {
                acc[key] = exitRow['data_temp'][key]
                return acc
              }, {})

            const exitTransformedData = keysMMBTU.reduce((acc, item) => {
              acc[item.date] = {
                key: item.key.toString(),
                value: parseToNumber(exitResult[item['key']])
              }
              return acc
            }, {})

            const exitContractedMmscfd = keysMMSCFD.map((item) => {
              return {
                key: item.key.toString(),
                date: item.date,
                value: parseToNumber(exitResult[item['key']])
                // start_date: st,
                // end_date: ed,
              }
            }, {})

            const entryValueBefor12Month = {}
            const exitValueBefor12Month = {}

            let loopDate = firstDate.clone()
            do {
              const loopDateStart = loopDate.startOf('month')
              const loopDateEnd = loopDate.endOf('month')
              const entryStartDate = dayjs.max([contractStartDate, loopDateStart, getTodayNowDDMMYYYYDfault(entryRow['data_temp'][fromTo])])

              const entryEndDate = dayjs.min([
                contractEndDate.subtract(1, 'day').endOf('day'),
                loopDateEnd,
                getTodayNowDDMMYYYYDfault(entryRow['data_temp'][fromTo + 1])
                  .subtract(1, 'day')
                  .endOf('day')
              ])
              const exitStartDate = dayjs.max([contractStartDate, loopDateStart, getTodayNowDDMMYYYYDfault(exitRow['data_temp'][fromTo])])

              const exitEndDate = dayjs.min([
                contractEndDate.subtract(1, 'day').endOf('day'),
                loopDateEnd,
                getTodayNowDDMMYYYYDfault(exitRow['data_temp'][fromTo + 1])
                  .subtract(1, 'day')
                  .endOf('day')
              ])

              const keyFromDate = keysMMBTU.find((k: any) => {
                return k.date === loopDate.tz('Asia/Bangkok').format('DD/MM/YYYY')
              })?.key

              const monthYear = loopDate.format('MM/YYYY')

              if (keyFromDate || keyFromDate == 0) {
                const entryNumberOfDay = entryEndDate.diff(entryStartDate, 'day') + 1
                const exitNumberOfDay = exitEndDate.diff(exitStartDate, 'day') + 1
                const entryValue = entryRow['data_temp'][`${keyFromDate}`]
                const exitValue = exitRow['data_temp'][`${keyFromDate}`]
                const entryValueNumber = parseToNumber(entryValue)
                const exitValueNumber = parseToNumber(exitValue)

                const entryAllocatedSummary = this.getAllocatedValueByAreaEntryExitZone(evidenData, loopDateEnd, entryRow['area_text'], entryRow['entry_exit']?.name ?? (`${entryRow['entry_exit_id']}` == '1' ? 'Entry' : 'Exit'), entryRow['zone_text'])

                const exitAllocatedSummary = this.getAllocatedValueByAreaEntryExitZone(evidenData, loopDateEnd, exitRow['area_text'], exitRow['entry_exit']?.name ?? (`${exitRow['entry_exit_id']}` == '1' ? 'Entry' : 'Exit'), exitRow['zone_text'])

                const entryAccValue = entryValueNumber || entryValueNumber == 0 ? entryValueNumber * entryNumberOfDay : null
                const exitAccValue = exitValueNumber || exitValueNumber == 0 ? exitValueNumber * exitNumberOfDay : null
                const entryPercentUsedCap = (entryAllocatedSummary?.total_allocated_value || entryAllocatedSummary?.total_allocated_value == 0) && entryAccValue ? entryAllocatedSummary?.total_allocated_value / entryAccValue : null
                const exitPercentUsedCap = (exitAllocatedSummary?.total_allocated_value || exitAllocatedSummary?.total_allocated_value == 0) && exitAccValue ? exitAllocatedSummary?.total_allocated_value / exitAccValue : null

                entryValueBefor12Month[monthYear] = {
                  key: `${keyFromDate}`,
                  value: entryValueNumber ?? entryValue,
                  start_date: entryStartDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  end_date: entryEndDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  allocated_value: entryAllocatedSummary?.total_allocated_value,
                  number_of_day: entryNumberOfDay,
                  acc_value: entryAccValue,
                  percent_used_cap: entryPercentUsedCap
                }
                exitValueBefor12Month[monthYear] = {
                  key: `${keyFromDate}`,
                  value: exitValueNumber ?? exitValue,
                  start_date: exitStartDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  end_date: exitEndDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  allocated_value: exitAllocatedSummary?.total_allocated_value,
                  number_of_day: exitNumberOfDay,
                  acc_value: exitAccValue,
                  percent_used_cap: exitPercentUsedCap
                }
              } else {
                if (loopDate.isBefore(contractStartDate, 'month') || loopDate.isAfter(contractEndDate, 'month')) {
                  entryValueBefor12Month[monthYear] = {
                    key: '',
                    value: '',
                    start_date: '',
                    end_date: ''
                  }
                  exitValueBefor12Month[monthYear] = {
                    key: '',
                    value: '',
                    start_date: '',
                    end_date: ''
                  }
                } else {
                  entryValueBefor12Month[monthYear] = {
                    key: '',
                    value: '',
                    start_date: entryStartDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                    end_date: entryEndDate.tz('Asia/Bangkok').format('DD/MM/YYYY')
                  }
                  exitValueBefor12Month[monthYear] = {
                    key: '',
                    value: '',
                    start_date: exitStartDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                    end_date: exitEndDate.tz('Asia/Bangkok').format('DD/MM/YYYY')
                  }
                }
              }
              loopDate = loopDate.add(1, 'month')
            } while (loopDate.isSameOrBefore(lastDate, 'month'))

            const entryData = {
              id: entryRow['id'],
              booking_row_json_id: entryRow['id'],
              booking_version_id: entryRow['booking_version_id'],
              entry_exit_id: entryRow['entry_exit_id'],
              entry_exit: entryRow['entry_exit'],
              contract_point: entryRow['contract_point'],
              zone_text: entryRow['zone_text'],
              area_text: entryRow['area_text'],
              start_date: entryRow['data_temp'][fromTo],
              end_date: entryRow['data_temp'][fromTo + 1],
              value: transformedData,
              contracted_mmscfd_array: contractedMmscfd,
              valueBefor12Month: entryValueBefor12Month
            }

            const exitData = {
              id: exitRow['id'],
              booking_row_json_id: exitRow['id'],
              booking_version_id: exitRow['booking_version_id'],
              entry_exit_id: exitRow['entry_exit_id'],
              entry_exit: exitRow['entry_exit'],
              contract_point: exitRow['contract_point'],
              zone_text: exitRow['zone_text'],
              area_text: exitRow['area_text'],
              start_date: exitRow['data_temp'][fromTo],
              end_date: exitRow['data_temp'][fromTo + 1],
              value: exitTransformedData,
              contracted_mmscfd_array: exitContractedMmscfd,
              valueBefor12Month: exitValueBefor12Month
            }

            resultItem.data.push({
              entryData,
              exitData
            })
          })
        })

        resArr.push(resultItem)
      }

      return resArr
    } catch (error) {
      return []
    }
  }

  async findAll4(payload: any) {
    try {
      const {startDate, shipper} = payload
      const todayEnd = dayjs().endOf('day')
      let lastDate = dayjs(startDate, 'MM/YYYY').endOf('month')
      if (!lastDate.isValid()) {
        lastDate = dayjs().endOf('month')
      }
      const firstDate = lastDate.subtract(11, 'month').startOf('month')

      const andInWhere: Prisma.contract_codeWhereInput[] = [
        {
          status_capacity_request_management_id: {
            in: [2, 5]
          }
        },
        {
          contract_start_date: {
            lte: lastDate.toDate() // start_date ต้องก่อน
          }
        },
        {
          term_type_id: {
            not: 4
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
                gt: firstDate.toDate()
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
                    gt: firstDate.toDate()
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
                        gt: firstDate.toDate()
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
      if (shipper) {
        andInWhere.push({
          group_id: Number(shipper)
        })
      }
      const contractCode = await this.prisma.contract_code.findMany({
        include: {
          group: true,
          booking_version: {
            include: {
              booking_full_json: true,
              booking_row_json: {
                include: {
                  entry_exit: true
                }
              }
            },
            take: 1,
            orderBy: {
              id: 'desc'
            }
          }
        },
        where: {
          AND: andInWhere
        },
        orderBy: {
          id: 'desc'
        }
      })

      if (!contractCode) {
        return []
      }

      const fromTo = 5

      const shipperObj = shipper
        ? await this.prisma.group.findFirst({
            where: {
              id: Number(shipper)
            }
          })
        : null

      let eodEviden: any[] = []
      try {
        // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
        let endDate = lastDate
        if (lastDate.isAfter(dayjs(), 'day')) {
          endDate = dayjs()
        }

        const agent = new https.Agent({
          rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
        })
        const body = {
          start_date: firstDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          end_date: endDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          // contract: 'code',
          // contract_point: 'name'
          skip: Number(0),
          limit: Number(1)
        }
        if (shipperObj) {
          body['shipper'] = shipperObj.id_name
        }
        const dataToGetLimit = JSON.stringify(body)

        const resToGetLimit = await axios.request({
          method: `${process.env.METHOD_EVIDEN}`,
          maxBodyLength: Infinity,
          url: `${process.env.IP_EVIDEN}/allocation_allocation_report_by_contract_point`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: process.env.TOKEN_EVIDEN
          },
          httpsAgent: agent,
          data: dataToGetLimit
        })

        if (!!resToGetLimit?.data) {
          if (Array.isArray(resToGetLimit.data) && resToGetLimit.data.length > 0) {
            let total_record = undefined
            resToGetLimit.data.map((resEvidenData: any) => {
              if (resEvidenData && resEvidenData?.total_record) {
                try {
                  const total = Number(resEvidenData?.total_record)
                  if (!Number.isNaN(total)) {
                    if (total_record) {
                      total_record += total
                    } else {
                      total_record = total
                    }
                  }
                } catch (error) {
                  if (total_record) {
                    total_record += 0
                  }
                }
              }
            })
            body.limit = total_record
          } else {
            body.limit = 100
          }
        }
        const data = JSON.stringify(body)

        const config = {
          method: `${process.env.METHOD_EVIDEN}`,
          maxBodyLength: Infinity,
          // 10.100.98.49
          url: `${process.env.IP_EVIDEN}/allocation_allocation_report_by_contract_point`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: process.env.TOKEN_EVIDEN
          },
          httpsAgent: agent,
          data: data
        }

        const resEviden = await axios.request(config)
        if (resEviden?.status === 200 && !!resEviden?.data) {
          if (resEviden && Array.isArray(resEviden.data) && resEviden.data.length > 0) {
            let total_record = undefined
            resEviden.data.map((resEvidenData: any) => {
              if (resEvidenData && resEvidenData?.total_record) {
                try {
                  const totalRecord = Number(resEvidenData?.total_record)
                  if (!Number.isNaN(totalRecord)) {
                    if (total_record) {
                      total_record += totalRecord
                    } else {
                      total_record = totalRecord
                    }
                  }
                } catch (error) {
                  if (total_record) {
                    total_record += 0
                  }
                }
              }
              if (resEvidenData && resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
                eodEviden.push(...resEvidenData.data)
              }
            })
          } else {
            eodEviden = resEviden && resEviden?.data?.data || []
          }
        }
      } catch (error) {
        eodEviden = []
      }

      // console.log('eodEviden : ', eodEviden);

      const executeEodList = await this.prisma.execute_eod.findMany({
        where: {
          status: {
            equals: 'OK',
            mode: 'insensitive'
          },
          start_date_date: {
            lte: lastDate.toDate()
          },
          end_date_date: {
            gte: firstDate.toDate()
          }
        }
      })

      const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
        where: {
          AND: [
            {
              gas_day: {
                gte: firstDate.toDate()
              }
            },
            {
              gas_day: {
                lte: lastDate.toDate()
              }
            },
            {
              del_flag: true
            }
          ]
        }
      })

      const matchWithExecuteList = eodEviden.filter((item: any) => {
        const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
        return executeEodList?.some((executeData: any) => {
          const executeStart = getTodayNowAdd7(executeData?.start_date_date)
          const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
          return executeData?.request_number_id == item?.request_number && executeStart?.isSameOrBefore(itemGasDay, 'day') && executeEnd?.isSameOrAfter(itemGasDay, 'day')
        })
      })

      const publishData = matchWithExecuteList.filter((evidenData: any) => {
        return !publicationCenterDeletedList?.some((unpublishData: any) => {
          return unpublishData?.execute_timestamp === evidenData.execute_timestamp && unpublishData?.gas_day_text === evidenData.gas_day
        })
      })

      // Get the latest execute_timestamp for each unique combination of gas_day
      const evidenData = publishData.reduce((acc: any[], current: any) => {
        const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day)

        if (existingIndex < 0) {
          acc.push(current)
        } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
          acc[existingIndex] = current
        }

        return acc
      }, [])
      // console.log('evidenData : ', evidenData);
      let resArr: any = []
      for (let ic = 0; ic < contractCode.length; ic++) {
        const resultItem: {
          group: {
            id: number
            id_name: string
            name: string
            user_type_id: number
          }
          contract_code_id: number
          contract_code: string
          data: any[]
        } = {
          group: {
            id: contractCode[ic]?.group?.id,
            id_name: contractCode[ic]?.group?.id_name,
            name: contractCode[ic]?.group?.name,
            user_type_id: contractCode[ic]?.group?.user_type_id
          },
          contract_code_id: contractCode[ic]?.id,
          contract_code: contractCode[ic]?.contract_code,
          data: []
        }

        const contractStartDate = getTodayNowAdd7(contractCode[ic]?.contract_start_date).tz('Asia/Bangkok')
        const contractEndDate = getTodayNowAdd7(contractCode[ic]?.terminate_date ?? contractCode[ic]?.extend_deadline ?? contractCode[ic]?.contract_end_date).tz('Asia/Bangkok')

        const fullData: any = contractCode[ic]?.booking_version[0]?.booking_full_json[0]['data_temp'] ? JSON.parse(contractCode[ic]?.booking_version[0]?.booking_full_json[0]['data_temp']) : null

        const dataRow = (contractCode[ic]?.booking_version[0]?.booking_row_json || []).map((e: any) => {
          return {
            ...e,
            data_temp: JSON.parse(e['data_temp'])
          }
        })

        const headMMBTU = fullData?.['headerEntry']?.['Capacity Daily Booking (MMBTU/d)']
        const headMMSCFD = fullData?.['headerEntry']?.['Capacity Daily Booking (MMscfd)']
        // const headMMBTUH = fullData['headerEntry']['Maximum Hour Booking (MMBTU/h)'];
        // const headMMSCFH = fullData['headerEntry']['Maximum Hour Booking (MMscfh)'];

        const firstDate = lastDate.subtract(11, 'month').startOf('month')
        const keysMMBTU = Object.keys(headMMBTU)
          .filter((date) => {
            // const dateJs = getTodayNowDDMMYYYYDfault(date);
            // return headMMBTU[date]?.key && dateJs.isSameOrAfter(firstDate, 'month') && dateJs.isSameOrBefore(lastDate, 'month');
            return headMMBTU[date]?.key
          }) // กรองเฉพาะที่เป็นวันที่และมี key
          .map((date) => ({
            key: Number(headMMBTU[date].key), // แปลง key เป็นตัวเลข
            date: date // ใช้ date เป็นค่า
          }))
          .sort((a, b) => a.key - b.key) // เรียงลำดับตาม key
        // const keysMMBTH = Object.keys(headMMBTUH)
        //   .filter((date) => headMMBTUH[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
        //   .map((date) => ({
        //     key: Number(headMMBTUH[date].key), // แปลง key เป็นตัวเลข
        //     date: date, // ใช้ date เป็นค่า
        //   }))
        //   .sort((a, b) => a.key - b.key); // เรียงลำดับตาม key
        const keysMMSCFD = Object.keys(headMMSCFD)
          .filter((date) => headMMSCFD[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
          .map((date) => ({
            key: Number(headMMSCFD[date].key), // แปลง key เป็นตัวเลข
            date: date // ใช้ date เป็นค่า
          }))
          .sort((a, b) => a.key - b.key) // เรียงลำดับตาม key
        // const keysMMSCFH = Object.keys(headMMSCFH)
        //   .filter((date) => headMMSCFH[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
        //   .map((date) => ({
        //     key: Number(headMMSCFH[date].key), // แปลง key เป็นตัวเลข
        //     date: date, // ใช้ date เป็นค่า
        //   }))
        //   .sort((a, b) => a.key - b.key); // เรียงลำดับตาม key

        const entryUse = dataRow.filter((f: any) => {
          return f?.entry_exit_id === 1
        })

        const exitUse = dataRow.filter((f: any) => {
          return f?.entry_exit_id === 2
        })

        entryUse.map((entryRow: any) => {
          const result = Object.keys(entryRow['data_temp'])
            .filter((key) => {
              const keyNumber = parseToNumber(key)
              return keyNumber >= fromTo + 2
            })
            .reduce((acc, key) => {
              acc[key] = entryRow['data_temp'][key]
              return acc
            }, {})

          const transformedData = keysMMBTU.reduce((acc, item) => {
            acc[item.date] = {
              key: item.key.toString(),
              value: parseToNumber(result[item['key']])
            }
            return acc
          }, {})

          const contractedMmscfd = keysMMSCFD.map((item) => {
            return {
              key: item.key.toString(),
              date: item.date,
              value: parseToNumber(result[item['key']])
              // start_date: st,
              // end_date: ed,
            }
          }, {})

          exitUse.map((exitRow: any) => {
            const exitResult = Object.keys(exitRow['data_temp'])
              .filter((key) => {
                const keyNumber = parseToNumber(key)
                return keyNumber >= fromTo + 2
              })
              .reduce((acc, key) => {
                acc[key] = exitRow['data_temp'][key]
                return acc
              }, {})

            const exitTransformedData = keysMMBTU.reduce((acc, item) => {
              acc[item.date] = {
                key: item.key.toString(),
                value: parseToNumber(exitResult[item['key']])
              }
              return acc
            }, {})

            const exitContractedMmscfd = keysMMSCFD.map((item) => {
              return {
                key: item.key.toString(),
                date: item.date,
                value: parseToNumber(exitResult[item['key']])
                // start_date: st,
                // end_date: ed,
              }
            }, {})

            const entryValueBefor12Month = {}
            const exitValueBefor12Month = {}

            let loopDate = firstDate.clone()
            do {
              const loopDateStart = loopDate.startOf('month')
              const loopDateEnd = loopDate.endOf('month')
              const entryStartDate = dayjs.max([contractStartDate, loopDateStart, getTodayNowDDMMYYYYDfault(entryRow['data_temp'][fromTo])])

              const entryEndDateCompareList = [
                contractEndDate.subtract(1, 'day').endOf('day'),
                loopDateEnd,
                getTodayNowDDMMYYYYDfault(entryRow['data_temp'][fromTo + 1])
                  .subtract(1, 'day')
                  .endOf('day')
              ]
              if(loopDateStart.isSame(todayEnd, 'month')){
                entryEndDateCompareList.push(todayEnd)
              }
              const entryEndDate = dayjs.min(entryEndDateCompareList)
              const exitStartDate = dayjs.max([contractStartDate, loopDateStart, getTodayNowDDMMYYYYDfault(exitRow['data_temp'][fromTo])])

              const exitEndDateCompareList = [
                contractEndDate.subtract(1, 'day').endOf('day'),
                loopDateEnd,
                getTodayNowDDMMYYYYDfault(exitRow['data_temp'][fromTo + 1])
                  .subtract(1, 'day')
                  .endOf('day')
              ]
              if(loopDateStart.isSame(todayEnd, 'month')){
                exitEndDateCompareList.push(todayEnd)
              }
              const exitEndDate = dayjs.min(exitEndDateCompareList)

              const keyFromDate = keysMMBTU.find((k: any) => {
                return k.date === loopDate.tz('Asia/Bangkok').format('DD/MM/YYYY')
              })?.key

              const monthYear = loopDate.format('MM/YYYY')

              if (keyFromDate || keyFromDate == 0) {
                const entryNumberOfDay = entryEndDate.diff(entryStartDate, 'day') + 1
                const exitNumberOfDay = exitEndDate.diff(exitStartDate, 'day') + 1
                const entryValue = entryRow['data_temp'][`${keyFromDate}`]
                const exitValue = exitRow['data_temp'][`${keyFromDate}`]
                const entryValueNumber = parseToNumber(entryValue)
                const exitValueNumber = parseToNumber(exitValue)

                const entryAllocatedSummary = this.getAllocatedValueByAreaEntryExitZone(evidenData, loopDateEnd, entryRow['area_text'], entryRow['entry_exit']?.name ?? (`${entryRow['entry_exit_id']}` == '1' ? 'Entry' : 'Exit'), entryRow['zone_text'], contractCode[ic]?.contract_code)

                const exitAllocatedSummary = this.getAllocatedValueByAreaEntryExitZone(evidenData, loopDateEnd, exitRow['area_text'], exitRow['entry_exit']?.name ?? (`${exitRow['entry_exit_id']}` == '1' ? 'Entry' : 'Exit'), exitRow['zone_text'], contractCode[ic]?.contract_code)

                const entryAccValue = entryValueNumber || entryValueNumber == 0 ? entryValueNumber * entryNumberOfDay : null
                const exitAccValue = exitValueNumber || exitValueNumber == 0 ? exitValueNumber * exitNumberOfDay : null
                // const entryPercentUsedCap = (entryAllocatedSummary?.total_allocated_value || entryAllocatedSummary?.total_allocated_value == 0) && entryAccValue ? parseToNumber6Decimal(entryAllocatedSummary?.total_allocated_value) / entryAccValue : null
                // const exitPercentUsedCap = (exitAllocatedSummary?.total_allocated_value || exitAllocatedSummary?.total_allocated_value == 0) && exitAccValue ? parseToNumber6Decimal(exitAllocatedSummary?.total_allocated_value) / exitAccValue : null
                const entryPercentUsedCap = (entryAllocatedSummary?.total_allocated_value || entryAllocatedSummary?.total_allocated_value == 0) && entryAccValue ? parseToNumber3Decimal((entryAllocatedSummary?.total_allocated_value / entryAccValue) * 100) : null
                const exitPercentUsedCap = (exitAllocatedSummary?.total_allocated_value || exitAllocatedSummary?.total_allocated_value == 0) && exitAccValue ? parseToNumber3Decimal((exitAllocatedSummary?.total_allocated_value / exitAccValue) * 100) : null
                // if(entryRow['area_text'] === "X1" && exitRow['area_text'] === "A1" && entryValueNumber === 1753185){
                //   console.log('[X1] entryPercentUsedCap : ', entryPercentUsedCap);
                //   console.log(`[${exitRow['area_text']}] exitPercentUsedCap : `, exitPercentUsedCap);
                //   console.log('entryAllocatedSummary?.total_allocated_value : ', entryAllocatedSummary?.total_allocated_value);
                //   console.log('entryValueNumber : ', entryValueNumber);
                //   console.log('entryNumberOfDay : ', entryNumberOfDay);
                //   console.log('- - - - -');
                // }

                entryValueBefor12Month[monthYear] = {
                  key: `${keyFromDate}`,
                  value: entryValueNumber ?? entryValue,
                  start_date: entryStartDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  end_date: entryEndDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  allocated_value: entryAllocatedSummary?.total_allocated_value,
                  number_of_day: entryNumberOfDay,
                  acc_value: entryAccValue,
                  percent_used_cap: entryPercentUsedCap
                }
                exitValueBefor12Month[monthYear] = {
                  key: `${keyFromDate}`,
                  value: exitValueNumber ?? exitValue,
                  start_date: exitStartDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  end_date: exitEndDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  allocated_value: exitAllocatedSummary?.total_allocated_value,
                  number_of_day: exitNumberOfDay,
                  acc_value: exitAccValue,
                  percent_used_cap: exitPercentUsedCap
                }
              } else {
                if (loopDate.isBefore(contractStartDate, 'month') || loopDate.isAfter(contractEndDate, 'month')) {
                  entryValueBefor12Month[monthYear] = {
                    key: '',
                    value: '',
                    start_date: '',
                    end_date: ''
                  }
                  exitValueBefor12Month[monthYear] = {
                    key: '',
                    value: '',
                    start_date: '',
                    end_date: ''
                  }
                } else {
                  entryValueBefor12Month[monthYear] = {
                    key: '',
                    value: '',
                    start_date: entryStartDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                    end_date: entryEndDate.tz('Asia/Bangkok').format('DD/MM/YYYY')
                  }
                  exitValueBefor12Month[monthYear] = {
                    key: '',
                    value: '',
                    start_date: exitStartDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
                    end_date: exitEndDate.tz('Asia/Bangkok').format('DD/MM/YYYY')
                  }
                }
              }
              loopDate = loopDate.add(1, 'month')
            } while (loopDate.isSameOrBefore(lastDate, 'month'))

            const entryData = {
              id: entryRow['id'],
              booking_row_json_id: entryRow['id'],
              booking_version_id: entryRow['booking_version_id'],
              entry_exit_id: entryRow['entry_exit_id'],
              entry_exit: entryRow['entry_exit'],
              contract_point: entryRow['contract_point'],
              zone_text: entryRow['zone_text'],
              area_text: entryRow['area_text'],
              start_date: entryRow['data_temp'][fromTo],
              end_date: entryRow['data_temp'][fromTo + 1],
              value: transformedData,
              contracted_mmscfd_array: contractedMmscfd,
              valueBefor12Month: entryValueBefor12Month
            }

            const exitData = {
              id: exitRow['id'],
              booking_row_json_id: exitRow['id'],
              booking_version_id: exitRow['booking_version_id'],
              entry_exit_id: exitRow['entry_exit_id'],
              entry_exit: exitRow['entry_exit'],
              contract_point: exitRow['contract_point'],
              zone_text: exitRow['zone_text'],
              area_text: exitRow['area_text'],
              start_date: exitRow['data_temp'][fromTo],
              end_date: exitRow['data_temp'][fromTo + 1],
              value: exitTransformedData,
              contracted_mmscfd_array: exitContractedMmscfd,
              valueBefor12Month: exitValueBefor12Month
            }

            resultItem.data.push({
              entryData,
              exitData
            })
          })
        })

        resArr.push(resultItem)
      }

      return resArr
    } catch (error) {
      return []
    }
  }
}
