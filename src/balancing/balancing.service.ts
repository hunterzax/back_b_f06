import {forwardRef, HttpException, HttpStatus, Inject, Injectable, Logger} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'

import {Response} from 'express'
import * as XLSX from 'xlsx-js-style'

import axios from 'axios'
import * as https from 'https'
import {MeteredMicroService} from 'src/grpc/metered-service.service'
// import { CapacityV2Service } from 'src/capacity-v2/capacity-v2.service';
import {
  getDayjsFromHHmm,
  getTodayEndAdd7,
  getTodayEndYYYYMMDDDfaultAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayNowDDMMYYYYHHmmDfaultAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayNowYYYYMMDDHHmmDfaultAdd7,
  getTodayStartAdd7,
  getTodayStartYYYYMMDDDfaultAdd7
} from 'src/common/utils/date.util'
import {CapacityService} from 'src/capacity/capacity.service'
import * as nodemailer from 'nodemailer'
import {ExportFilesService} from 'src/export-files/export-files.service'
import {Prisma} from '@prisma/client'
import {accImbValueMappings, compareGasHour, compareTimestamps, findMinMaxExeDate, getBalanceReportAccumulatedData, getGasHourValue, getIntradayBaseInentoryFromWebService, getTimestampValue, getValueByTag, groupAndFilterLatestData} from 'src/common/utils/balancing.util'

import * as minMax from 'dayjs/plugin/minMax'
import {uploadFilsTemp} from 'src/common/utils/uploadFileIn'
import {parseToNumber, parseToNumber6Decimal} from 'src/common/utils/number.util'
import {isMatch} from 'src/common/utils/allocation.util'
import {getGroupData} from 'src/common/utils/group.util'
import {middleNotiInapp, middleNotiInappShipper} from 'src/common/utils/inapp.util'
import {join} from 'path'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Bangkok')
dayjs.extend(minMax)
dayjs.extend(isSameOrBefore)
dayjs.extend(isSameOrAfter)
@Injectable()
export class BalancingService {
  private readonly logger = new Logger(BalancingService.name)
  constructor(
    private prisma: PrismaService,
    private readonly meteredMicroService: MeteredMicroService,
    @Inject(forwardRef(() => ExportFilesService))
    private readonly exportFilesService: ExportFilesService
  ) {}

  // balance_balance_report
  async evidenApiCenter(payload: any, url: any, callback?: (total_record: number) => void) {
    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })
    let data = JSON.stringify(payload)
    let config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      // 10.100.98.49
      url: `${process.env.IP_EVIDEN}/${url}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN || ''
      },
      httpsAgent: agent,
      data: data
    }
    try {
      const resEviden = await axios.request(config)

      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (resEviden && Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden && resEviden?.data?.forEach((resEvidenData: any) => {
            if (resEvidenData && resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              if (resEvidenData && resEvidenData?.total_record) {
                if (total_record) {
                  total_record += resEvidenData?.total_record
                } else {
                  total_record = resEvidenData?.total_record
                }
              }
              evidenData.push(...resEvidenData)
            }
          })
          if (callback && total_record) {
            callback(total_record)
          }
        } else {
          if (callback && resEviden && resEviden?.data?.total_record) {
            callback(resEviden.data.total_record)
          }
          evidenData = resEviden && resEviden?.data
        }
      }

      return evidenData
    } catch (error) {
      if (error.response) {
        this.logger.error('Eviden API Error Status:', error.response.status)
        this.logger.error('Eviden API Error Data:', error.response.data)
      } else {
        this.logger.error('Eviden API Error:', error.message)
      }
      if(error.response.status === 502){
        throw new HttpException(
          {
            status: HttpStatus.BAD_GATEWAY,
            error: error.response.data,
            message: error.message,
            type: "Eviden"
          },
          HttpStatus.BAD_GATEWAY
        )
      }

      return []
    }
  }

  async useReqs(req: any) {
    const ip = req?.headers?.['x-forwarded-for'] || req?.ip
    return {
      ip: ip,
      sub: (req?.user?.sub || -1),
      first_name: req?.user?.first_name,
      last_name: req?.user?.last_name,
      username: req?.user?.username,
      originalUrl: req?.originalUrl
    }
  }

  async writeReq(reqUser: any, type: any, method: any, value: any) {
    const usedData = {
      reqUser: !!reqUser ? JSON.stringify(await this.useReqs(reqUser)) : null,
      type: type,
      method: method,
      value: JSON.stringify(value),
      id_value: value?.id,
      create_date: getTodayNowAdd7().toDate(),
      create_date_num: getTodayNowAdd7().unix(),
      module: 'BALANCING',
      ...(!!reqUser?.user?.sub && {
        create_by_account: {
          connect: {
            id: Number(reqUser?.user?.sub) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      })
    }
    await this.prisma.history.create({
      data: usedData
    })
    return true
  }

  async closedBalancingReportSetting(payload: any, userId: any) {
    const {date_balance} = payload

    const inputDate = dayjs(date_balance + 'T00:00:00Z')
    const now = dayjs() // เวลา ปัจจุบัน

    const isCurrentMonth = inputDate.isSame(now, 'month')
    const isFutureMonth = inputDate.isAfter(now, 'month')

    if (isCurrentMonth || isFutureMonth) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'วันที่ต้องเป็นเดือนที่ผ่านมาเท่านั้น.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const dateBalance = dayjs(date_balance + 'T00:00:00Z').toDate() // 👉 new Date("2025-02-01T00:00:00.000Z")
    // const dateBalance = dayjs.tz(date_balance, 'YYYY-MM-DD', 'Asia/Bangkok').format('YYYY-MM-DD');
    // const dateBalance = dayjs.tz(date_balance, 'YYYY-MM-DD HH:mm:ss', 'Asia/Bangkok').toDate(); //แบบนี้ตรง
    // // "date_balance":"2025-02-01 12:23:41"
    // // "2025-02-01T05:23:41.000Z"

    const checkSE = await this.prisma.closed_balancing_report.findFirst({
      where: {},
      orderBy: {
        id: 'desc'
      }
    })
    let flagSE = false

    if (checkSE) {
      const oldDate = dayjs(checkSE?.date_balance)
      const newDate = getTodayNowAdd7(date_balance + 'T00:00:00Z')
      const isFutureMonth = newDate.isSameOrBefore(oldDate, 'month')
      if (isFutureMonth) {
        flagSE = true
      }
    } else {
      flagSE = false
    }

    if (flagSE) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Close Balancing should not condition.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const closedBalancingReportCreate = await this.prisma.closed_balancing_report.create({
      data: {
        date_balance: dateBalance,
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      }
    })
    return closedBalancingReportCreate
  }

  closedBalancingReport() {
    return this.prisma.closed_balancing_report.findFirst({
      orderBy: {
        id: 'desc'
      }
    })
  }

  // adjust
  async intradayAccImbalanceInventory(payload = null, del_flag = null) {
    const {gas_day} = payload ?? {}

    const intradayAcc = await this.prisma.intraday_acc_imbalance_inventory.findMany({
      where: {
        del_flag: del_flag,
        ...(gas_day && {
          gas_day_text: gas_day
        })
      },
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: [{gas_day: 'desc'}, {gas_hour: 'desc'}]
    })

    const intradayAccComment = await this.prisma.intraday_acc_imbalance_inventory_comment.findMany({
      where: {
        del_flag: del_flag,
        ...(gas_day && {
          gas_day_text: gas_day
        })
      },
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        id: 'desc'
      }
    })

    const grouped: any = Object.values(
      intradayAcc.reduce((acc, item, index) => {
        const key = item.gas_day_text
        if (!acc[key]) {
          acc[key] = {
            index: index,
            group: key,
            data: []
          }
        }
        acc[key].data.push(item)
        return acc
      }, {})
    )

    const groupedDate = grouped.map((e: any) => {
      const minCreateDateItem = e['data'].reduce((min, current) => {
        if (current.create_date_num !== null && (min === null || current.create_date_num < min.create_date_num)) {
          return current
        }
        return min
      }, null)
      const maxUpdateDateItem = e['data'].reduce((max, current) => {
        if (current.update_date_num !== null && (max === null || current.update_date_num > max.update_date_num)) {
          return current
        }
        return max
      }, null)

      const east =
        e['data'] && e['data']
          ?.filter((f: any) => {
            return f?.zone === 'EAST'
          })
          .reduce((max, current) => {
            if (current.gas_hour !== null && (max === null || current.gas_hour > max.gas_hour)) {
              return current
            }
            return max
          }, null)?.value || null
      const west =
        e['data'] && e['data']
          ?.filter((f: any) => {
            return f?.zone === 'WEST'
          })
          .reduce((max, current) => {
            if (current.gas_hour !== null && (max === null || current.gas_hour > max.gas_hour)) {
              return current
            }
            return max
          }, null)?.value || null

      const comment = intradayAccComment.filter((f: any) => {
        return f?.gas_day_text === e?.group
      })

      return {
        id: minCreateDateItem?.create_date_num || null,
        gas_day: e?.group,
        east: east,
        west: west,
        create_by_account: minCreateDateItem?.create_by_account || null,
        create_date_num: minCreateDateItem?.create_date_num || null,
        create_date: minCreateDateItem?.create_date || null,
        update_by_account: maxUpdateDateItem?.update_by_account || null,
        update_date_num: minCreateDateItem?.update_date_num || null,
        update_date: minCreateDateItem?.update_date || null,
        comment: comment
      }
    })

    return groupedDate
  }

  async intradayAccImbalanceInventoryOnce(payload: any) {
    const {gas_day} = payload

    const once = await this.intradayAccImbalanceInventory(payload)

    return once.length > 0 ? once[0] : null
  }

  async intradayAccImbalanceInventoryCommentOnce(payload: any) {
    const {gas_day} = payload

    const intradayAccComment = await this.prisma.intraday_acc_imbalance_inventory_comment.findMany({
      where: {
        del_flag: null,
        ...(gas_day && {
          gas_day_text: gas_day
        })
      },
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        id: 'desc'
      }
    })

    return intradayAccComment
  }

  // **
  async intradayAccImbalanceInventoryDelete(payload: any) {
    const {gas_day} = payload

    await this.prisma.intraday_acc_imbalance_inventory.updateMany({
      where: {
        gas_day: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
      },
      data: {
        del_flag: true
      }
    })

    await this.prisma.intraday_acc_imbalance_inventory_comment.updateMany({
      where: {
        gas_day: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
      },
      data: {
        del_flag: true
      }
    })

    return true
  }

  async intradayAccImbalanceInventoryCU(payload: any, userId: any) {
    const {zone, gas_day, value} = payload
    const newDate = getTodayNowAdd7()

    const checkUpdate = await this.prisma.intraday_acc_imbalance_inventory.findFirst({
      where: {
        gas_day: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate(),
        gas_day_text: getTodayNowYYYYMMDDDfaultAdd7(gas_day).format('YYYY-MM-DD'),
        gas_hour: Number(dayjs().format('HH')),
        zone: zone,
        del_flag: null
      }
    })

    if (checkUpdate) {
      const update = await this.prisma.intraday_acc_imbalance_inventory.update({
        where: {
          id: Number(checkUpdate?.id ?? -1)
        },
        data: {
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate(),
          gas_day_text: getTodayNowYYYYMMDDDfaultAdd7(gas_day).format('YYYY-MM-DD'),
          gas_hour: Number(dayjs().format('HH')),
          zone: zone,
          value: value,
          update_date_num: newDate.unix(),
          update_date: newDate.toDate(),
          update_by_account: {
            connect: {
              id: Number(userId)
            }
          }
        }
      })

      return {
        type: `edit-${zone}`,
        data: update
      }
    } else {
      // create
      const create = await this.prisma.intraday_acc_imbalance_inventory.create({
        data: {
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate(),
          gas_day_text: getTodayNowYYYYMMDDDfaultAdd7(gas_day).format('YYYY-MM-DD'),
          gas_hour: Number(dayjs().format('HH')),
          zone: zone,
          value: value,
          create_date_num: newDate.unix(),
          create_date: newDate.toDate(),
          create_by_account: {
            connect: {
              id: Number(userId)
            }
          }
        }
      })

      return {
        type: `create-${zone}`,
        data: create
      }
    }
  }

  async intradayAccImbalanceInventoryCommentCreate(payload: any, userId: any) {
    const {gas_day, remark} = payload
    const newDate = getTodayNowAdd7()

    // create

    const create = await this.prisma.intraday_acc_imbalance_inventory_comment.create({
      data: {
        gas_day: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate(),
        gas_day_text: getTodayNowYYYYMMDDDfaultAdd7(gas_day).format('YYYY-MM-DD'),
        gas_hour: Number(dayjs().format('HH')),
        remark: remark,
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    return {
      type: `comment`,
      data: create
    }
  }

  async adjustmentDailyImbalance(payload: any, userId: any) {
    const {start_date, end_date, skip, limit, request_number, execute_timestamp, contract, shipper, start_hour, end_hour} = payload
    const startHour = start_hour ? start_hour : 1
    const endHour = end_hour ? end_hour : 24

    const start = start_date ? getTodayNowAdd7(start_date) : null
    const end = end_date ? getTodayNowAdd7(end_date) : null
    const today = getTodayEndAdd7()

    if (start == null || end == null || !start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    const todayStart = getTodayStartAdd7(dayjs(start_date, 'YYYY-MM-DD').toDate()).toDate()
    const todayEnd = getTodayEndAdd7(dayjs(end_date, 'YYYY-MM-DD').toDate()).toDate()

    const zoneMaster = await this.prisma.zone.findMany({
      where: {
        AND: [
          {
            NOT: {
              name: {
                equals: 'east-west',
                mode: 'insensitive'
              }
            }
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
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      }
    })

    const groupMaster = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
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

    const executeEodList = await this.prisma.execute_eod.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        start_date_date: {
          lte: end.toDate()
        },
        end_date_date: {
          gte: start.toDate()
        }
      }
    })

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: start.toDate(),
          lte: end.toDate()
        }
      }
    })

    // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
    const {minDate, maxDate} = await findMinMaxExeDate(this.prisma, start_date, end_date)

    const dateArray: string[] = []

    let current = minDate ?? start

    while (current.isSameOrBefore(maxDate ?? end)) {
      dateArray.push(current && current.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }
    // ---- ดึง  eviden
    // Generate dynamic tags based on zones
    const balanceReportTag = zoneMaster.map((zone) => `dailyImb_${zone.name.toLowerCase()}_withoutAdjust`)
    const balanceIntradayReportTag = zoneMaster.map((zone) => `dailyImb_${zone.name.toLowerCase()}_withoutAdjust`)

    let startForEviden = minDate ?? start
    if (!startForEviden || !startForEviden.isValid()) {
      startForEviden = today.startOf('month')
    }
    let endForEviden = maxDate ?? end
    if (!endForEviden || !endForEviden.isValid() || endForEviden.isAfter(today)) {
      endForEviden = today
    }
    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        // start_date: start_date,
        // end_date: end_date,
        start_date: startForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
        end_date: endForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
        request_number,
        execute_timestamp,
        contract,
        shipper,
        skip: 0,
        limit: 1
      },
      'balance_balance_report',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const balanceReportResponse: any = await this.evidenApiCenter(
      {
        // start_date: start_date,
        // end_date: end_date,
        start_date: startForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
        end_date: endForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
        request_number,
        execute_timestamp,
        contract,
        shipper,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_balance_report'
    )

    const balanceReportData = (balanceReportResponse?.data || []).filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeEodList?.some((executeData: any) => {
        const executeStart = getTodayNowAdd7(executeData?.start_date_date)
        const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
        return executeData?.request_number_id == item?.request_number && executeStart?.isSameOrBefore(itemGasDay, 'day') && executeEnd?.isSameOrAfter(itemGasDay, 'day')
      })
    })

    // Call balanceIntradayReportResponse for each day between start_date and end_date in parallel
    const balanceIntradayReportDataArrays: any[] = await Promise.all(
      dateArray.map(async (currentDate) => {
        let totalRecord: number | undefined = undefined
        await this.evidenApiCenter(
          {
            gas_day: currentDate,
            start_hour: startHour,
            end_hour: endHour,
            request_number,
            execute_timestamp,
            contract,
            shipper,
            skip: 0,
            limit: 1
          },
          'balance_intraday_balance_report',
          (total_record: number) => {
            totalRecord = total_record
          }
        )
        const dailyResponse: any = await this.evidenApiCenter(
          {
            gas_day: currentDate,
            start_hour: startHour,
            end_hour: endHour,
            request_number,
            execute_timestamp,
            contract,
            shipper,
            skip: totalRecord ? 0 : Number(skip),
            limit: totalRecord ? totalRecord : Number(limit)
          },
          'balance_intraday_balance_report'
        )
        return dailyResponse?.data || []
      })
    )

    // Flatten the array of arrays into a single array of objects
    const balanceIntradayReportData: any[] = balanceIntradayReportDataArrays.flat()

    const matchWithExecuteList = balanceIntradayReportData.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day') && executeData.gas_hour == item.gas_hour
      })
    })

    // Get publication_center records with del_flag = true for filtering
    const publicationCenterDeleted = await this.prisma.publication_center.findMany({
      where: {
        del_flag: true
      },
      select: {
        execute_timestamp: true,
        gas_day_text: true,
        gas_day: true
      }
    })

    // Function to filter out data that matches publication_center deleted records
    const filterData = (data: any[]) => {
      return data.filter((item: any) => {
        // Check if this item should be filtered out
        const shouldFilter = publicationCenterDeleted.some((pubRecord: any) => {
          // Match execute_timestamp
          const timestampMatch = item.execute_timestamp === pubRecord.execute_timestamp

          // Match gas_day with either gas_day_text or gas_day
          const gasDateMatch = item.gas_day === pubRecord.gas_day_text || item.gas_day === pubRecord.gas_day

          return timestampMatch && gasDateMatch
        })

        // Return true to keep the item (filter out returns false for items to exclude)
        return !shouldFilter
      })
    }

    // Apply filtering to both data sources
    const filteredBalanceReportData = filterData(balanceReportData)
    const filteredBalanceIntradayReportData = filterData(matchWithExecuteList)

    // Function to get only latest execute_timestamp for each gas_day
    const getLatestByGasDay = (data: any[]) => {
      // Group by gas_day and find max execute_timestamp for each group
      const gasDayGroups = data.reduce((acc: any, item: any) => {
        const gasDay = item.gas_day
        if (!acc[gasDay]) {
          acc[gasDay] = []
        }
        acc[gasDay].push(item)
        return acc
      }, {})

      // For each gas_day, keep only items with the latest execute_timestamp
      const latestItems: any[] = []
      Object.keys(gasDayGroups).forEach((gasDay) => {
        const items = gasDayGroups[gasDay]
        // Find the maximum execute_timestamp for this gas_day
        const maxTimestamp = Math.max(...items.map((item: any) => item.execute_timestamp))
        // Keep only items with the maximum timestamp
        const latestForGasDay = items.filter((item: any) => item.execute_timestamp === maxTimestamp)
        latestItems.push(...latestForGasDay)
      })

      return latestItems
    }

    // Get only latest execute_timestamp for each gas_day
    const latestBalanceReportData = getLatestByGasDay(filteredBalanceReportData)
    const latestBalanceIntradayReportData = getLatestByGasDay(filteredBalanceIntradayReportData)

    // Function to get only latest gas_hour for each gas_day (for intraday data)
    const getLatestGasHourByGasDay = (data: any[]) => {
      // Group by gas_day and find max gas_hour for each group
      const gasDayGroups = data.reduce((acc: any, item: any) => {
        const gasDay = item.gas_day
        if (!acc[gasDay]) {
          acc[gasDay] = []
        }
        acc[gasDay].push(item)
        return acc
      }, {})

      // For each gas_day, keep only items with the latest gas_hour
      const latestItems: any[] = []
      Object.keys(gasDayGroups).forEach((gasDay) => {
        const items = gasDayGroups[gasDay]
        // Find the maximum gas_hour for this gas_day
        const maxGasHour = Math.max(...items.map((item: any) => item.gas_hour || 0))
        // Keep only items with the maximum gas_hour
        const latestForGasDay = items.filter((item: any) => (item.gas_hour || 0) === maxGasHour)
        latestItems.push(...latestForGasDay)
      })

      return latestItems
    }

    // Get only latest gas_hour for each gas_day from intraday data
    const latestGasHourIntradayData = getLatestGasHourByGasDay(latestBalanceIntradayReportData)

    const grouped = {}

    // Process balance report data
    const processData = (data: any[], reportType: string, tags: string[]) => {
      data.forEach((item: any) => {
        item.shipper_data?.forEach((shipperItem: any) => {
          ;(shipperItem.balance_values || shipperItem.values)
            ?.filter((valueItem: any) => tags.includes(valueItem.tag))
            .forEach((valueItem: any) => {
              // Extract zone from tag
              let zone = ''
              const tag = valueItem.tag

              if (tag.includes('east-west')) {
                zone = 'east-west'
              } else if (tag.includes('east')) {
                zone = 'east'
              } else if (tag.includes('west')) {
                zone = 'west'
              }

              if (zone) {
                // Only process if zone is found
                const key = `${item.gas_day}|${shipperItem.shipper}|${zone}`

                if (!grouped[key]) {
                  grouped[key] = {
                    request_number: item.request_number,
                    execute_timestamp: item.execute_timestamp,
                    gas_day: item.gas_day,
                    shipper: shipperItem.shipper,
                    zone: zone,
                    gas_hour: null, // Initialize as null, will be set for intraday data
                    dailyAccIm: null,
                    intradayAccIm: null
                  }
                }

                // Add values based on report type
                if (reportType === 'balance_balance_report') {
                  if (valueItem.value || valueItem.value == 0) {
                    if (grouped[key].dailyAccIm != null) {
                      grouped[key].dailyAccIm += valueItem.value || 0
                    } else {
                      grouped[key].dailyAccIm = valueItem.value
                    }
                  }
                } else if (reportType === 'balance_intraday_balance_report') {
                  if (valueItem.value || valueItem.value == 0) {
                    if (grouped[key].intradayAccIm != null) {
                      grouped[key].intradayAccIm += valueItem.value || 0
                    } else {
                      grouped[key].intradayAccIm = valueItem.value
                    }
                  }
                  // Add gas_hour for intraday data
                  if (item.gas_hour !== undefined && item.gas_hour !== null) {
                    grouped[key].gas_hour = item.gas_hour
                  }
                }
              }
            })
        })
      })
    }

    // Process both data sources using latest data
    processData(latestBalanceReportData, 'balance_balance_report', balanceReportTag)
    processData(latestGasHourIntradayData, 'balance_intraday_balance_report', balanceIntradayReportTag)

    const resultEodGroup: any = Object.values(grouped)

    // db
    let balanceMaster = await this.prisma.balancing_adjustment_daily_imbalance.findMany({
      where: {
        OR: [
          {
            gas_day_text: {
              in: dateArray // Filter by gas_day_text using the date range
            }
          },
          {
            gas_day: {
              gte: start.toDate(), // Filter by gas_day >= start date
              lte: end.toDate() // Filter by gas_day <= end date
            }
          }
        ]
      },
      include: {
        balancing_adjustment_daily_imbalance_comment: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          },
          orderBy: {
            id: 'desc'
          }
        },
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    })

    let newAllocation = []

    for (let i = 0; i < resultEodGroup.length; i++) {
      const findAllocationReport = balanceMaster.find((f: any) => {
        return f?.gas_day_text === resultEodGroup[i]?.gas_day && f?.shipper_name_text === resultEodGroup[i]?.shipper && f?.zone_text === resultEodGroup[i]?.zone
      })

      if (!!!findAllocationReport) {
        newAllocation.push({
          shipper_name_text: resultEodGroup[i]?.shipper,
          gas_day_text: resultEodGroup[i]?.gas_day,
          contract_code_text: resultEodGroup[i]?.contract,
          zone_text: resultEodGroup[i]?.zone,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(resultEodGroup[i]?.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId),
          gas_hour: resultEodGroup[i]?.gas_hour
        })
      }
    }

    if (newAllocation.length > 0) {
      // create
      await this.prisma.balancing_adjustment_daily_imbalance.createMany({
        data: newAllocation
      })

      balanceMaster = await this.prisma.balancing_adjustment_daily_imbalance.findMany({
        where: {
          OR: [
            {
              gas_day_text: {
                in: dateArray // Filter by gas_day_text using the date range
              }
            },
            {
              gas_day: {
                gte: start.toDate(), // Filter by gas_day >= start date
                lte: end.toDate() // Filter by gas_day <= end date
              }
            }
          ]
        },
        include: {
          balancing_adjustment_daily_imbalance_comment: {
            include: {
              create_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },
              update_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              }
            },
            orderBy: {
              id: 'desc'
            }
          },
          create_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          },
          update_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        }
      })
    }

    const newEODF = resultEodGroup && resultEodGroup?.map((eod: any) => {
      const finG = groupMaster.find((f: any) => {
        return f?.id_name === eod?.shipper
      })

      const zone_obj = zoneMaster.find((f: any) => {
        return f?.name?.toUpperCase() === eod['zone']?.toUpperCase()
      })
      const findAllocationReport = balanceMaster.find((f: any) => {
        return f?.gas_day_text === eod?.['gas_day'] && f?.shipper_name_text === eod?.['shipper'] && f?.zone_text?.toUpperCase() === eod?.['zone']?.toUpperCase()
      })

      if ((eod?.dailyAccIm == 0 || eod?.dailyAccIm) && parseToNumber(findAllocationReport?.adjust_imbalance) != null) {
      }
      const dailyAcc = eod?.dailyAccIm != null ? Number(eod.dailyAccIm) : 0;
      const adjustImb = findAllocationReport?.adjust_imbalance != null ? Number(findAllocationReport.adjust_imbalance) : 0;
      const finalDailyAccIm = (eod?.dailyAccIm != null || findAllocationReport?.adjust_imbalance != null) ? dailyAcc + adjustImb : null;

      const intradayAcc = eod?.intradayAccIm != null ? Number(eod.intradayAccIm) : 0;
      const finalIntradayAccIm = (eod?.intradayAccIm != null || findAllocationReport?.adjust_imbalance != null) ? intradayAcc + adjustImb : null;

      // const { values, ...nEod } = eod

      return {
        id: findAllocationReport?.id,
        ...eod,
        adjust_imbalance: findAllocationReport?.adjust_imbalance,
        finalDailyAccIm,
        finalIntradayAccIm,
        group: finG,
        zone_obj,
        create_by_account: findAllocationReport?.create_by_account,
        create_date: findAllocationReport?.create_date,
        update_by_account: findAllocationReport?.update_by_account,
        update_date: findAllocationReport?.update_date,
        comment: findAllocationReport?.balancing_adjustment_daily_imbalance_comment
      }
    }) || []

    return newEODF
  }

  async adjustmentDailyImbalanceOnce(payload: any, userId: any) {
    const {id, adjustImbalance, start_date, end_date, skip, limit} = payload

    const once = await this.adjustmentDailyImbalance(payload, userId)
    const find = once.find((f: any) => {
      return f?.id === Number(id)
    })

    return find
  }

  // comment
  async adjustmentDailyImbalanceCommentOnce(payload: any) {
    const {balancing_adjustment_daily_imbalance_id} = payload

    const intradayAccComment = await this.prisma.balancing_adjustment_daily_imbalance_comment.findMany({
      where: {
        del_flag: null,
        balancing_adjustment_daily_imbalance_id: Number(balancing_adjustment_daily_imbalance_id) || 0
        // ...(gas_day && { gas_day_text: gas_day }),
      },
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        id: 'desc'
      }
    })

    return intradayAccComment
  }

  // comment
  async adjustmentDailyImbalanceCommentCreate(payload: any, userId: any) {
    const {balancing_adjustment_daily_imbalance_id, remark} = payload

    const newDate = getTodayNowAdd7()

    const create = await this.prisma.balancing_adjustment_daily_imbalance_comment.create({
      data: {
        balancing_adjustment_daily_imbalance: {
          connect: {
            id: Number(balancing_adjustment_daily_imbalance_id)
          }
        },
        remark: remark,
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    return {
      type: `comment`,
      data: create
    }
  }

  async adjustmentDailyImbalanceAdjustIm(payload: any, userId: any) {
    const {id, adjustImbalance} = payload

    const dateCre = getTodayNowAdd7()

    const update = await this.prisma.balancing_adjustment_daily_imbalance.update({
      where: {
        id: Number(id)
      },
      data: {
        adjust_imbalance: String(adjustImbalance),
        update_date: dateCre.toDate(),
        // update_by: Number(userId),
        update_date_num: dateCre.unix(),
        update_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      }
    })

    return update
  }

  async adjustAccumulatedImbalance(payload: any, userId: any) {
    const {start_date, end_date, skip, limit, request_number, execute_timestamp, contract, shipper, start_hour, end_hour} = payload
    const startHour = start_hour ? start_hour : 1
    const endHour = end_hour ? end_hour : 24

    const start = start_date ? getTodayNowAdd7(start_date) : null
    const end = end_date ? getTodayNowAdd7(end_date) : null

    if (!start || !end || !start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    const todayStart = getTodayStartAdd7(dayjs(start_date, 'YYYY-MM-DD').toDate()).toDate()
    const todayEnd = getTodayEndAdd7(dayjs(end_date, 'YYYY-MM-DD').toDate()).toDate()

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
      }
    })

    const groupMaster = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
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

    const executeEodList = await this.prisma.execute_eod.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        start_date_date: {
          lte: end.toDate()
        },
        end_date_date: {
          gte: start.toDate()
        }
      }
    })

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: start.toDate(),
          lte: end.toDate()
        }
      }
    })

    // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
    const {minDate, maxDate} = await findMinMaxExeDate(this.prisma, start_date, end_date)

    const dateArray: string[] = []

    if(minDate && maxDate){
    let current = minDate

    while (current.isSameOrBefore(maxDate)) {
      dateArray.push(current && current.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }
    }

    // ---- ดึง  eviden
    // Generate dynamic tags based on zones
    const balanceReportTag = zoneMaster.map((zone) => `accImb_${zone.name.toLowerCase()}_withoutAdjust`)
    const balanceIntradayReportTag = zoneMaster.map((zone) => `accImb_${zone.name.toLowerCase()}_withoutAdjust`)

    let totalRecord: number | undefined = undefined
    minDate &&
      (await this.evidenApiCenter(
        {
          start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          request_number,
          execute_timestamp,
          contract,
          shipper,
          skip: 0,
          limit: 1
        },
        'balance_balance_report',
        (total_record: number) => {
          totalRecord = total_record
        }
      ))
    const balanceReportResponse: any = minDate
      ? await this.evidenApiCenter(
          {
            start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            request_number,
            execute_timestamp,
            contract,
            shipper,
            skip: totalRecord ? 0 : Number(skip),
            limit: totalRecord ? totalRecord : Number(limit)
          },
          'balance_balance_report'
        )
      : null

    const balanceReportData = (balanceReportResponse?.data || []).filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeEodList?.some((executeData: any) => {
        const executeStart = getTodayNowAdd7(executeData?.start_date_date)
        const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
        return executeData?.request_number_id == item?.request_number && executeStart?.isSameOrBefore(itemGasDay, 'day') && executeEnd?.isSameOrAfter(itemGasDay, 'day')
      })
    })

    // Call balanceIntradayReportResponse for each day between start_date and end_date in parallel
    const balanceIntradayReportDataArrays: any[] = await Promise.all(
      dateArray.map(async (currentDate) => {
        let totalRecord: number | undefined = undefined
        await this.evidenApiCenter(
          {
            gas_day: currentDate,
            start_hour: startHour,
            end_hour: endHour,
            request_number,
            execute_timestamp,
            contract,
            shipper,
            skip: 0,
            limit: 1
          },
          'balance_intraday_balance_report',
          (total_record: number) => {
            totalRecord = total_record
          }
        )
        const dailyResponse: any = await this.evidenApiCenter(
          {
            gas_day: currentDate,
            start_hour: startHour,
            end_hour: endHour,
            request_number,
            execute_timestamp,
            contract,
            shipper,
            skip: totalRecord ? 0 : Number(skip),
            limit: totalRecord ? totalRecord : Number(limit)
          },
          'balance_intraday_balance_report'
        )
        return dailyResponse?.data || []
      })
    )

    const balanceIntradayReportData: any[] = balanceIntradayReportDataArrays.flat()

    const matchWithExecuteList = balanceIntradayReportData.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day') && executeData.gas_hour == item.gas_hour
      })
    })

    // Get publication_center records with del_flag = true for filtering
    const publicationCenterDeleted = await this.prisma.publication_center.findMany({
      where: {
        del_flag: true
      },
      select: {
        execute_timestamp: true,
        gas_day_text: true,
        gas_day: true
      }
    })

    // Function to filter out data that matches publication_center deleted records
    const filterData = (data: any[]) => {
      return data.filter((item: any) => {
        // Check if this item should be filtered out
        const shouldFilter = publicationCenterDeleted.some((pubRecord: any) => {
          return pubRecord.execute_timestamp === item.execute_timestamp && (pubRecord.gas_day_text === item.gas_day || (pubRecord.gas_day && dayjs(pubRecord.gas_day).format('YYYY-MM-DD') === item.gas_day))
        })
        return !shouldFilter // Keep items that should NOT be filtered
      })
    }

    // Apply filtering to both data sources
    const filteredBalanceReportData = filterData(balanceReportData)
    const filteredBalanceIntradayReportData = filterData(matchWithExecuteList)

    // Function to get only latest execute_timestamp for each gas_day
    const getLatestByGasDay = (data: any[]) => {
      // Group by gas_day and find max execute_timestamp for each group
      const gasDayGroups = data.reduce((acc: any, item: any) => {
        const gasDay = item.gas_day
        if (!acc[gasDay]) {
          acc[gasDay] = []
        }
        acc[gasDay].push(item)
        return acc
      }, {})

      // For each gas_day, keep only items with the latest execute_timestamp
      const latestItems: any[] = []
      Object.keys(gasDayGroups).forEach((gasDay) => {
        const items = gasDayGroups[gasDay]
        const maxTimestamp = Math.max(...items.map((item: any) => item.execute_timestamp))
        const latestItemsForDay = items.filter((item: any) => item.execute_timestamp === maxTimestamp)
        latestItems.push(...latestItemsForDay)
      })

      return latestItems
    }

    // Function to get only latest gas_hour for each gas_day (for intraday data)
    const getLatestGasHourByGasDay = (data: any[]) => {
      // Group by gas_day and find max gas_hour for each group
      const gasDayGroups = data.reduce((acc: any, item: any) => {
        const gasDay = item.gas_day
        if (!acc[gasDay]) {
          acc[gasDay] = []
        }
        acc[gasDay].push(item)
        return acc
      }, {})

      // For each gas_day, keep only items with the latest gas_hour
      const latestItems: any[] = []
      Object.keys(gasDayGroups).forEach((gasDay) => {
        const items = gasDayGroups[gasDay]
        const maxGasHour = Math.max(...items.map((item: any) => item.gas_hour || 0))
        const latestItemsForDay = items.filter((item: any) => (item.gas_hour || 0) === maxGasHour)
        latestItems.push(...latestItemsForDay)
      })

      return latestItems
    }

    // Get only latest execute_timestamp for each gas_day
    const latestBalanceReportData = getLatestByGasDay(filteredBalanceReportData)
    const latestBalanceIntradayReportData = getLatestByGasDay(filteredBalanceIntradayReportData)

    // Get only latest gas_hour for each gas_day from intraday data
    const latestGasHourIntradayData = getLatestGasHourByGasDay(latestBalanceIntradayReportData)

    const grouped = {}

    const processData = (data: any[], reportType: string, tags: string[]) => {
      data.forEach((item: any) => {
        item.shipper_data?.forEach((shipperItem: any) => {
          // shipperItem.values?.forEach((valueItem: any) => {
          shipperItem.values?.forEach((valueItem: any) => {
            // Extract zone from tag
            let zone = ''
            const tag = valueItem.tag

            if (tag.includes('east-west')) {
              zone = 'east-west'
            } else if (tag.includes('east')) {
              zone = 'east'
            } else if (tag.includes('west')) {
              zone = 'west'
            }

            if (zone && tags.includes(tag)) {
              // Only process if zone is found and tag is in our list
              const key = `${item.gas_day}|${shipperItem.shipper}|${zone}`

              if (!grouped[key]) {
                grouped[key] = {
                  request_number: item.request_number,
                  execute_timestamp: item.execute_timestamp,
                  gas_day: item.gas_day,
                  shipper: shipperItem.shipper,
                  zone: zone,
                  gas_hour: null, // Initialize as null, will be set for intraday data
                  dailyAccIm: null,
                  intradayAccIm: null
                }
              }

              // Add values based on report type
              if (reportType === 'balance_balance_report') {
                if (valueItem.value || valueItem.value == 0) {
                  if (grouped[key].dailyAccIm != null) {
                    grouped[key].dailyAccIm += valueItem.value || 0
                  } else {
                    grouped[key].dailyAccIm = valueItem.value
                  }
                }
              } else if (reportType === 'balance_intraday_balance_report') {
                if (valueItem.value || valueItem.value == 0) {
                  if (grouped[key].intradayAccIm != null) {
                    grouped[key].intradayAccIm += valueItem.value || 0
                  } else {
                    grouped[key].intradayAccIm = valueItem.value
                  }
                }
                // Set gas_hour for intraday data
                if (item.gas_hour !== undefined) {
                  grouped[key].gas_hour = item.gas_hour
                }
              }
            }
          })
        })
      })
    }

    const processData2 = (data: any[], reportType: string, tags: string[]) => {
      data.forEach((item: any) => {
        item.shipper_data?.forEach((shipperItem: any) => {
          // shipperItem.values?.forEach((valueItem: any) => {
          shipperItem.balance_values?.forEach((valueItem: any) => {
            // Extract zone from tag
            let zone = ''
            const tag = valueItem.tag

            if (tag.includes('east-west')) {
              zone = 'east-west'
            } else if (tag.includes('east')) {
              zone = 'east'
            } else if (tag.includes('west')) {
              zone = 'west'
            }

            if (zone && tags.includes(tag)) {
              // Only process if zone is found and tag is in our list
              const key = `${item.gas_day}|${shipperItem.shipper}|${zone}`

              if (!grouped[key]) {
                grouped[key] = {
                  request_number: item.request_number,
                  execute_timestamp: item.execute_timestamp,
                  gas_day: item.gas_day,
                  shipper: shipperItem.shipper,
                  zone: zone,
                  gas_hour: null, // Initialize as null, will be set for intraday data
                  dailyAccIm: 0,
                  intradayAccIm: 0
                }
              }

              // Add values based on report type
              if (reportType === 'balance_balance_report') {
                grouped[key].dailyAccIm += valueItem.value || 0
              } else if (reportType === 'balance_intraday_balance_report') {
                grouped[key].intradayAccIm += valueItem.value || 0
                // Set gas_hour for intraday data
                if (item.gas_hour !== undefined) {
                  grouped[key].gas_hour = item.gas_hour
                }
              }
            }
          })
        })
      })
    }

    // Process both data sources using latest data
    processData(latestBalanceReportData, 'balance_balance_report', balanceReportTag)
    processData2(latestGasHourIntradayData, 'balance_intraday_balance_report', balanceIntradayReportTag)
    const resultEodGroup: any = Object.values(grouped)

    // db
    let balanceMaster = await this.prisma.balancing_adjust_accumulated_imbalance.findMany({
      where: {
        OR: [
          {
            gas_day_text: {
              in: dateArray // Filter by gas_day_text using the date range
            }
          },
          {
            gas_day: {
              gte: start.toDate(), // Filter by gas_day >= start date
              lte: end.toDate() // Filter by gas_day <= end date
            }
          }
        ]
      },
      include: {
        balancing_adjust_accumulated_imbalance_comment: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          },
          orderBy: {
            id: 'desc'
          }
        },
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    })

    let newAllocation = []

    for (let i = 0; i < resultEodGroup.length; i++) {
      const findAllocationReport = balanceMaster.find((f: any) => {
        return f?.gas_day_text === resultEodGroup[i]?.gas_day && f?.shipper_name_text === resultEodGroup[i]?.shipper && f?.zone_text === resultEodGroup[i]?.zone
      })

      if (!!!findAllocationReport) {
        newAllocation.push({
          shipper_name_text: resultEodGroup[i]?.shipper,
          gas_day_text: resultEodGroup[i]?.gas_day,
          contract_code_text: resultEodGroup[i]?.contract,
          zone_text: resultEodGroup[i]?.zone,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(resultEodGroup[i]?.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId),
          gas_hour: resultEodGroup[i]?.gas_hour
        })
      }
    }

    if (newAllocation.length > 0) {
      // create
      await this.prisma.balancing_adjust_accumulated_imbalance.createMany({
        data: newAllocation
      })

      balanceMaster = await this.prisma.balancing_adjust_accumulated_imbalance.findMany({
        where: {
          OR: [
            {
              gas_day_text: {
                in: dateArray // Filter by gas_day_text using the date range
              }
            },
            {
              gas_day: {
                gte: start.toDate(), // Filter by gas_day >= start date
                lte: end.toDate() // Filter by gas_day <= end date
              }
            }
          ]
        },
        include: {
          balancing_adjust_accumulated_imbalance_comment: {
            include: {
              create_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },
              update_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              }
            },
            orderBy: {
              id: 'desc'
            }
          },
          create_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          },
          update_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        }
      })
    }
    const newEODF = resultEodGroup && resultEodGroup?.map((eod: any) => {
      const finG = groupMaster.find((f: any) => {
        return f?.id_name === eod?.shipper
      })

      const zone_obj = zoneMaster.find((f: any) => {
        return f?.name?.toUpperCase() === eod['zone']?.toUpperCase()
      })

      const findAllocationReport = balanceMaster.find((f: any) => {
        return f?.gas_day_text === eod?.['gas_day'] && f?.shipper_name_text === eod?.['shipper'] && f?.zone_text?.toUpperCase() === eod?.['zone']?.toUpperCase()
      })
      const dailyAcc = eod?.dailyAccIm != null ? Number(eod.dailyAccIm) : 0;
      const adjustImb = findAllocationReport?.adjust_imbalance != null ? Number(findAllocationReport.adjust_imbalance) : 0;
      const finalDailyAccIm = (eod?.dailyAccIm != null || findAllocationReport?.adjust_imbalance != null) ? dailyAcc + adjustImb : null;

      const intradayAcc = eod?.intradayAccIm != null ? Number(eod.intradayAccIm) : 0;
      const finalIntradayAccIm = (eod?.intradayAccIm != null || findAllocationReport?.adjust_imbalance != null) ? intradayAcc + adjustImb : null;

      // const { values, ...nEod } = eod

      return {
        id: findAllocationReport?.id,
        ...eod,
        adjust_imbalance: findAllocationReport?.adjust_imbalance,
        finalDailyAccIm,
        finalIntradayAccIm,
        group: finG,
        zone_obj,
        create_by_account: findAllocationReport?.create_by_account,
        create_date: findAllocationReport?.create_date,
        update_by_account: findAllocationReport?.update_by_account,
        update_date: findAllocationReport?.update_date,
        comment: findAllocationReport?.balancing_adjust_accumulated_imbalance_comment
      }
    }) || []

    return newEODF
  }

  async adjustAccumulatedImbalanceOnce(payload: any, userId: any) {
    const {id, adjustImbalance, start_date, end_date, skip, limit} = payload

    const once = await this.adjustAccumulatedImbalance(payload, userId)
    const find = once.find((f: any) => {
      return f?.id === Number(id)
    })

    return find
  }

  async adjustAccumulatedImbalanceAdjustIm(payload: any, userId: any) {
    const {id, adjustImbalance} = payload

    const dateCre = getTodayNowAdd7()

    const update = await this.prisma.balancing_adjust_accumulated_imbalance.update({
      where: {
        id: Number(id)
      },
      data: {
        adjust_imbalance: String(adjustImbalance),
        update_date: dateCre.toDate(),
        // update_by: Number(userId),
        update_date_num: dateCre.unix(),
        update_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      }
    })

    return update
  }

  // comment
  async adjustAccumulatedImbalanceCommentOnce(payload: any) {
    const {balancing_adjust_accumulated_imbalance_id} = payload

    const intradayAccComment = await this.prisma.balancing_adjust_accumulated_imbalance_comment.findMany({
      where: {
        del_flag: null,
        balancing_adjust_accumulated_imbalance_id: Number(balancing_adjust_accumulated_imbalance_id) || 0
      },
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        id: 'desc'
      }
    })

    return intradayAccComment
  }

  // comment
  async adjustAccumulatedImbalanceCommentCreate(payload: any, userId: any) {
    const {balancing_adjust_accumulated_imbalance_id, remark} = payload

    const newDate = getTodayNowAdd7()

    const create = await this.prisma.balancing_adjust_accumulated_imbalance_comment.create({
      data: {
        balancing_adjust_accumulated_imbalance: {
          connect: {
            id: Number(balancing_adjust_accumulated_imbalance_id)
          }
        },
        remark: remark,
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    return {
      type: `comment`,
      data: create
    }
  }

  async shipper() {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const resData = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
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
    return resData
  }

  async zone() {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const resData = await this.prisma.zone.findMany({
      where: {
        sensitive: null,
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
    return resData
  }

  async ventCommissioningOtherGasOnce(id: any) {
    const vent = await this.prisma.vent_commissioning_other_gas.findFirst({
      where: {
        id: Number(id)
      },
      include: {
        group: true,
        zone: true,
        vent_commissioning_other_gas_remark: {
          orderBy: {
            id: 'desc'
          },
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          }
        },
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    })

    return vent
  }

  async ventCommissioningOtherGas() {
    const vent = await this.prisma.vent_commissioning_other_gas.findMany({
      where: {
        del_flag: null,
        group:{
          status: true
        }
      },
      orderBy: {
        id: 'desc'
      },
      include: {
        group: true,
        zone: true,
        vent_commissioning_other_gas_remark: {
          orderBy: {
            id: 'desc'
          },
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          }
        },
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    })

    return vent
  }

  async ventCommissioningOtherGasCreate(payload: any, userId: any) {
    const {gas_day, group_id, zone_id, vent_gas_value_mmbtud, commissioning_gas_value_mmbtud, other_gas_value_mmbtud, remark} = payload
    const closedBalancingReport = await this.closedBalancingReport()
    const date_balance = closedBalancingReport?.date_balance || null
    const isAfterOrSame = dayjs(gas_day).isSameOrAfter(dayjs(date_balance).add(1, 'month').startOf('month'), 'day')

    if (!!!date_balance || !isAfterOrSame) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Gas Day is not within the range after the closing balance.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const zone = await this.prisma.zone.findFirst({
      where: {
        id: Number(zone_id),
        sensitive: null,
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

    const vent = await this.prisma.vent_commissioning_other_gas.findFirst({
      where: {
        gas_day_text: gas_day,
        group_id: group_id,
        zone: {
          name: zone?.name
        },
        del_flag: null
      }
    })

    if (vent || !zone) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          // error: 'data has been system.',
          error: 'This data already exists.' // 1. Vent/Commissioning/Other Gas > Add ข้อมูลซ้ำเดิม ปรับ error message ใหม่เป็น This data already exists.
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const dateCre = getTodayNowAdd7()

    const create = await this.prisma.vent_commissioning_other_gas.create({
      data: {
        gas_day: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate(),
        gas_day_text: gas_day,
        group_id: group_id,
        zone_id: zone_id,
        vent_gas_value_mmbtud: vent_gas_value_mmbtud,
        commissioning_gas_value_mmbtud: commissioning_gas_value_mmbtud,
        other_gas_value_mmbtud: other_gas_value_mmbtud,
        create_date: dateCre.toDate(),
        create_date_num: dateCre.unix(),
        create_by: Number(userId)
        // create_by_account: {
        //   connect: {
        //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
        //   },
        // },
      }
    })

    if (remark) {
      await this.prisma.vent_commissioning_other_gas_remark.create({
        data: {
          remark: remark,
          vent_commissioning_other_gas_id: create?.id,
          create_date: dateCre.toDate(),
          create_date_num: dateCre.unix(),
          create_by: Number(userId)
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }
      })
    }

    return create
  }

  async ventCommissioningOtherGasUpdate(id: any, payload: any, userId: any) {
    const {gas_day, group_id, zone_id, vent_gas_value_mmbtud, commissioning_gas_value_mmbtud, other_gas_value_mmbtud, remark} = payload

    const dateCre = getTodayNowAdd7()

    const update = await this.prisma.vent_commissioning_other_gas.updateMany({
      where: {
        id: Number(id)
      },
      data: {
        vent_gas_value_mmbtud: vent_gas_value_mmbtud,
        commissioning_gas_value_mmbtud: commissioning_gas_value_mmbtud,
        other_gas_value_mmbtud: other_gas_value_mmbtud,
        update_date: dateCre.toDate(),
        update_date_num: dateCre.unix(),
        update_by: Number(userId)
        // update_by_account: {
        //   connect: {
        //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
        //   },
        // },
      }
    })

    if (remark) {
      await this.prisma.vent_commissioning_other_gas_remark.create({
        data: {
          remark: remark,
          vent_commissioning_other_gas_id: Number(id),
          create_date: dateCre.toDate(),
          create_date_num: dateCre.unix(),
          create_by: Number(userId)
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }
      })
    }

    return update
  }

  async ventCommissioningOtherGasDelete(id: any, userId: any) {
    const dateCre = getTodayNowAdd7()

    const deleted = await this.prisma.vent_commissioning_other_gas.updateMany({
      where: {
        id: {
          in: id
        }
      },
      data: {
        del_flag: true,
        update_date: dateCre.toDate(),
        update_date_num: dateCre.unix(),
        update_by: Number(userId)
        // update_by_account: {
        //   connect: {
        //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
        //   },
        // },
      }
    })

    return deleted
  }

  // parse "23/02/2027" -> Date (เวลา 00:00:00 แบบ local)
  parseDDMMYYYYToDate(dateStr: string): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null
    const [dd, mm, yyyy] = dateStr.split('/').map((x) => Number(x))
    if (!dd || !mm || !yyyy) return null

    const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0)
    // กันเคสวันที่ไม่จริง เช่น 31/02/2027
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null

    return d
  }

  startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  }
  endOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  }

  // เช็คว่า gasDay อยู่ในช่วง shipper (inclusive)
  // - start_date: ใช้ startOfDay
  // - end_date: ถ้า null => ไม่จำกัดปลายทาง
  isGasDayWithinShipperPeriod(gasDayStr: string, shipper: any): boolean {
    const gasDay = this.parseDDMMYYYYToDate(gasDayStr)
    if (!gasDay) return false

    const shipperStart = shipper?.start_date ? this.startOfDay(new Date(shipper.start_date)) : null
    const shipperEnd = shipper?.end_date ? this.endOfDay(new Date(shipper.end_date)) : null

    const t = gasDay.getTime()

    if (shipperStart && t < shipperStart.getTime()) return false
    if (shipperEnd && t > shipperEnd.getTime()) return false
    return true
  }

  async ventCommissioningOtherGasImport(grpcTransform: any, file: any, userId: any) {
    // this.closedBalancingReport() date_balance
    // vent_commissioning_other_gas
    // vent_commissioning_other_gas_remark
    // vent_commissioning_other_gas_import_log
    // update
    const findData = JSON.parse(grpcTransform?.jsonDataMultiSheet)
    // const checkType = findData.reduce((acc: string | null, f: any) => {
    //   if (f?.sheet === 'Daily Nomination') return 'Daily Nomination';
    //   if (f?.sheet === 'Weekly Nomination') return 'Weekly Nomination';
    //   return acc;
    // }, null);
    const dataRes = findData[0]?.data
    const header = dataRes?.[0] || {}
    const value = dataRes && dataRes.slice(1) || []
    const gasDayKey = Object.keys(header).find((key) => header[key] === 'Gas Day')
    const shipperNameKey = Object.keys(header).find((key) => header[key] === 'Shipper Name')
    const zoneKey = Object.keys(header).find((key) => header[key] === 'Zone')
    // const ventGasKey = Object.keys(header).find((key) => header[key] === 'Vent Gas')
    // const commissiongGasKey = Object.keys(header).find((key) => header[key] === 'Commissioning Gas')
    // const otherGasKey = Object.keys(header).find((key) => header[key] === 'Other Gas')
    const ventGasKey = Object.keys(header).find((key) => header[key] === 'Vent Gas' || header[key] === 'Vent Gas (MMBTU)')
    const commissiongGasKey = Object.keys(header).find((key) => header[key] === 'Commissioning Gas' || header[key] === 'Commissioning Gas (MMBTU)')
    const otherGasKey = Object.keys(header).find((key) => header[key] === 'Other Gas' || header[key] === 'Other Gas (MMBTU)')
    const remarksKey = Object.keys(header).find((key) => header[key] === 'Comment')
    if (!gasDayKey || !shipperNameKey || !zoneKey || !ventGasKey || !commissiongGasKey || !otherGasKey) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Template is not match.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const ventCommissioningOtherGas = await this.ventCommissioningOtherGas()

    let dataUse = []
    let dataUseCreate = []

    if ((value?.length || 0) < 1) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Upload failed: No data found in the file. Please check and upload a valid file with required data.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    let validateList = []

    for (let i = 0; i < value.length; i++) {
      const gasDay = dayjs(value[i][gasDayKey], 'DD/MM/YYYY')
      if (!gasDay.isValid()) {
        validateList.push(`Gas Day must be in DD/MM/YYYY format.`)
        break
      }

      const ventGas = value[i][ventGasKey] ? Number(value[i][ventGasKey]) : 0
      const commissiongGas = value[i][ventGasKey] ? Number(value[i][commissiongGasKey]) : 0
      const otherGas = value[i][ventGasKey] ? Number(value[i][otherGasKey]) : 0
      if (Number.isNaN(ventGas) || Number.isNaN(commissiongGas) || Number.isNaN(otherGas)) {
        validateList.push(`Invalid data format: Please enter numeric values in 'Vent Gas', 'Commissioning Gas', and 'Other Gas' columns. Text inputs are not accepted.`)
        break
      }

      const checkMaster = ventCommissioningOtherGas.find((f: any) => {
        return f?.gas_day_text === gasDay.format('YYYY-MM-DD') && f?.group?.name === value[i][shipperNameKey] && f?.zone?.name === value[i][zoneKey]
      })
      if (!checkMaster) {
        // create
        dataUseCreate.push({
          gas_day: value[i][gasDayKey],
          shipper: value[i][shipperNameKey],
          zone: value[i][zoneKey],
          ventGas: value[i][ventGasKey],
          commissiongGas: value[i][commissiongGasKey],
          otherGas: value[i][otherGasKey],
          remarks: value[i][remarksKey] || null
        })
      } else {
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: 'Data is not match.',
        //   },
        //   HttpStatus.BAD_REQUEST,
        // );

        dataUse.push({
          id: checkMaster?.id,
          ventGas: value[i][ventGasKey],
          commissiongGas: value[i][commissiongGasKey],
          otherGas: value[i][otherGasKey],
          remarks: value[i][remarksKey] || null
        })
      }
    }

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

    const dateCre = getTodayNowAdd7()

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const zone = await this.prisma.zone.findMany({
      where: {
        sensitive: null,
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
      }
    })

    // กรอง shipper ที่ยังไม่หมดอายุ
    const shipper = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
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

    for (let i = 0; i < dataUseCreate.length; i++) {
      // closedB
      const closedBalancingReport = await this.closedBalancingReport()
      const date_balance = closedBalancingReport?.date_balance || null
      const isAfterOrSame = getTodayNowDDMMYYYYAdd7(dataUseCreate[i]?.gas_day).isSameOrAfter(dayjs(date_balance).add(1, 'month').startOf('month'), 'day')

      if (!!!date_balance || !isAfterOrSame) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Gas Day is not within the range after the closing balance.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      const ckshipper = shipper?.find((f: any) => {
        return f?.name === dataUseCreate[i]?.shipper
      })
      console.log('ckshipper : ', ckshipper);
      // v2.0.132 New/Edit/Import ต้องใช้ shipper ที่ inactive ไปแล้วไม่ได้ https://app.clickup.com/t/86ev5f706 (ต้องดู vid)
      const invalid = dataUseCreate.filter((row) => {
        const s = shipper.find((x: any) => x?.name === row?.shipper)
        if (!s) return true // shipper ไม่เจอในระบบก็ผิดเลย
        return !this.isGasDayWithinShipperPeriod(row.gas_day, s)
      })

      if (invalid.length > 0) {
        const names = [...new Set(invalid.map((x) => x.shipper))].filter(Boolean)
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `Shipper is incorrect. Gas day out of period: ${names.join(', ')}`
          },
          HttpStatus.BAD_REQUEST
        )
      }

      if (!ckshipper) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Shipper is incorrect.' //'Shipper name does not match in the system.',
          },
          HttpStatus.BAD_REQUEST
        )
      }
      if (!ckshipper?.status) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Shipper Is Inactive.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      const ckzone = zone?.find((f: any) => {
        return f?.name === dataUseCreate[i]?.zone
      })

      if (!ckzone) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Zone is incorrect.' //'Zone is not currently active.',
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }
    let dataUseCreateArr = []
    for (let i = 0; i < dataUseCreate.length; i++) {
      // create
      let ckzone: any = zone?.filter((f: any) => {
        return f?.name === dataUseCreate[i]?.zone
      })
      const lastestEntryZone = ckzone.find((zone: any) => {
        return zone.entry_exit_id == 1
      })
      if (lastestEntryZone) {
        ckzone = lastestEntryZone
      } else {
        ckzone = lastestEntryZone[0]
      }

      const ckshipper = shipper?.find((f: any) => {
        return f?.name === dataUseCreate[i]?.shipper
      })

      const create = await this.prisma.vent_commissioning_other_gas.create({
        data: {
          gas_day: getTodayNowDDMMYYYYDfaultAdd7(dataUseCreate[i]?.gas_day).toDate(),
          gas_day_text: getTodayNowDDMMYYYYDfaultAdd7(dataUseCreate[i]?.gas_day).format('YYYY-MM-DD'),
          group_id: ckshipper?.id,
          zone_id: ckzone?.id,
          vent_gas_value_mmbtud: dataUseCreate[i]?.ventGas,
          commissioning_gas_value_mmbtud: dataUseCreate[i]?.commissiongGas,
          other_gas_value_mmbtud: dataUseCreate[i]?.otherGas,
          create_date: dateCre.toDate(),
          create_date_num: dateCre.unix(),
          create_by: Number(userId)
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }
      })
      dataUseCreateArr.push({
        id: create?.id,
        ...dataUseCreate[i]
      })
      if (dataUseCreate[i]?.remarks) {
        await this.prisma.vent_commissioning_other_gas_remark.create({
          data: {
            remark: dataUseCreate[i]?.remarks,
            vent_commissioning_other_gas_id: Number(create?.id),
            create_date: dateCre.toDate(),
            create_date_num: dateCre.unix(),
            create_by: Number(userId)
            // create_by_account: {
            //   connect: {
            //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            //   },
            // },
          }
        })
      }
    }

    for (let i = 0; i < dataUse.length; i++) {
      const update = await this.prisma.vent_commissioning_other_gas.updateMany({
        where: {
          id: Number(dataUse[i]?.id ?? -1)
        },
        data: {
          vent_gas_value_mmbtud: dataUse[i]?.ventGas,
          commissioning_gas_value_mmbtud: dataUse[i]?.commissiongGas,
          other_gas_value_mmbtud: dataUse[i]?.otherGas,
          update_date: dateCre.toDate(),
          update_date_num: dateCre.unix(),
          update_by: Number(userId)
          // update_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }
      })

      if (dataUse[i]?.remarks) {
        await this.prisma.vent_commissioning_other_gas_remark.create({
          data: {
            remark: dataUse[i]?.remarks,
            vent_commissioning_other_gas_id: Number(dataUse[i]?.id),
            create_date: dateCre.toDate(),
            create_date_num: dateCre.unix(),
            create_by: Number(userId)
            // create_by_account: {
            //   connect: {
            //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            //   },
            // },
          }
        })
      }
    }

    const responseUpFile = await uploadFilsTemp(file)
    await this.prisma.vent_commissioning_other_gas_import_log.create({
      data: {
        file: responseUpFile?.file?.url,
        create_date: dateCre.toDate(),
        create_date_num: dateCre.unix(),
        create_by: Number(userId)
        // create_by_account: {
        //   connect: {
        //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
        //   },
        // },
      }
    })

    return [...dataUseCreateArr, ...dataUse]
  }

  exportDataToExcelNew(data: any[], response: Response, nameFile: string, skipFirstRow: boolean): void {
    // ตรวจสอบว่ามีข้อมูลหรือไม่
    // if (!data || data.length === 0) {
    //   response
    //     .status(400)
    //     .send({ message: 'Data is empty. Cannot generate Excel file.' });
    // }

    // สร้าง workbook และ worksheet ใหม่
    const wb = XLSX.utils.book_new()
    const ws = skipFirstRow ? XLSX.utils.aoa_to_sheet([[]]) : XLSX.utils.aoa_to_sheet([])

    // เพิ่ม header ในบรรทัดที่ 2 ถ้า skipFirstRow เป็น true, ถ้าไม่เป็น true จะอยู่ที่บรรทัดที่ 1
    const headers = Object.keys(data[0])
    XLSX.utils.sheet_add_aoa(ws, [headers], {
      origin: skipFirstRow ? 1 : 0
    })

    // เพิ่มข้อมูลที่บรรทัดที่ 3 ถ้า skipFirstRow เป็น true, ถ้าไม่เป็น true จะอยู่ที่บรรทัดที่ 2
    if (data.length > 0) {
      XLSX.utils.sheet_add_json(ws, data, {
        origin: skipFirstRow ? 2 : 1,
        skipHeader: true
      })
    }

    // ตรวจสอบว่า worksheet มีข้อมูลหรือไม่
    const range = XLSX.utils.decode_range(ws['!ref'])
    if (range.e.r < 0 || range.e.c < 0) {
      throw new Error('Worksheet is empty. Cannot generate Excel file.')
    }

    // เพิ่ม worksheet ลงใน workbook
    XLSX.utils.book_append_sheet(wb, ws, 'DataSheet')

    // ปรับความกว้างของคอลัมน์แบบไดนามิก
    const objectMaxLength = headers.map((header) => header.length) // เริ่มต้นจากความยาวของ headers
    data.forEach((row) => {
      Object.keys(row).forEach((key, index) => {
        const columnLength = row[key] ? row[key].toString().length : 0
        objectMaxLength[index] = Math.max(objectMaxLength[index], columnLength)
      })
    })

    // กำหนดความกว้างของคอลัมน์ให้พอดีกับ header และข้อมูล
    ws['!cols'] = objectMaxLength.map((maxLength) => {
      return {
        wch: Math.min(maxLength + 5, 30)
      } // จำกัดความกว้างไม่เกิน 30
    })

    // ปรับ wrap text ในทุกเซลล์และจัดการขนาดแถวอัตโนมัติ
    ws['!rows'] = []
    for (let R = range.s.r; R <= range.e.r; ++R) {
      let maxHeight = 20 // ค่าเริ่มต้นของความสูงแถว
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({r: R, c: C})
        if (!ws[cellAddress]) continue

        // ตรวจสอบว่ามีข้อความในเซลล์หรือไม่
        if (ws[cellAddress].v && typeof ws[cellAddress].v === 'string') {
          // เปิดการ wrapText และจัดให้ align ซ้ายและด้านบน
          ws[cellAddress].s = {
            alignment: {
              wrapText: true, // เปิดการ wrapText ที่นี่
              vertical: 'top',
              horizontal: 'left'
            }
          }
        }

        const cellText = ws[cellAddress].v ? ws[cellAddress].v.toString() : ''
        const lines = Math.ceil(cellText.length / 30) // คำนวณจำนวนบรรทัด
        maxHeight = Math.max(maxHeight, lines * 15) // เพิ่มความสูงตามจำนวนบรรทัด
      }
      ws['!rows'][R] = {
        hpx: maxHeight
      } // ปรับความสูงของแถวตามจำนวนบรรทัด
    }

    Object.keys(ws).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')) // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '')

      if (ws[cell] && typeof ws[cell] === 'object' && cell[0] !== '!') {
        ws[cell].z = '@' // ใช้รูปแบบ '@' เพื่อระบุว่าเป็น Text
        ws[cell].t = 's'
      }
    })

    // ตรวจสอบว่า workbook มีข้อมูลหรือไม่
    if (!wb.SheetNames.length) {
      throw new Error('Workbook is empty. Cannot generate Excel file.')
    }

    // เขียนไฟล์ Excel ลงใน Buffer
    const excelBuffer = XLSX.write(wb, {
      bookType: 'xlsx',
      type: 'buffer'
    })

    // กำหนดการดาวน์โหลดไฟล์ Excel
    response.setHeader('Content-Disposition', `attachment; filename="${getTodayNowAdd7().format('YYYY-MM-DD HH:mm')}_${nameFile}.xlsx"`)
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response.send(excelBuffer)
  }

  async ventCommissioningOtherGasTemplate(response: any) {
    // const ventCommissioningOtherGas = await this.ventCommissioningOtherGas();
    // const formateData = await ventCommissioningOtherGas.map((e: any) => {
    //   let setData = {
    //     ['Gas Day']: dayjs(e['gas_day_text'], 'YYYY-MM-DD').format(
    //       'DD/MM/YYYY',
    //     ),
    //     ['Shipper Name']: e['group']?.['name'] || '', //
    //     ['Zone']: e['zone']?.['name'] || '', //
    //     ['Vent Gas']: '', //
    //     ['Commissioning Gas']: '', //
    //     ['Other Gas']: '', //
    //     ['Remarks']: '',
    //   };
    //   let filteredData = Object.keys(setData).reduce((obj, key) => {
    //     obj[key] = setData[key]; // เพิ่ม key และ value ที่ผ่านการกรอง
    //     return obj;
    //   }, {});
    //   // filter

    //   return filteredData;
    // });
    return await this.exportDataToExcelNew(
      [
        {
          'Gas Day': '02/05/2025',
          'Shipper Name': 'B.GRIMM',
          Zone: 'EAST',
          'Vent Gas (MMBTU)': '1.0000',
          'Commissioning Gas (MMBTU)': '0.5000',
          'Other Gas (MMBTU)': '0.3000',
          "Comment": 'Sample Data'
        }
      ],
      // formateData,
      response,
      'Vent Commissioning Other Gas',
      true
    )
  }

  // ----

  async intradayBaseInentoryAll() {
    const resData = await this.prisma.intraday_base_inentory.findMany({})
    return resData
  }

  async intradayBaseInentory(payload: any, userId: any) {
    const {gas_day, zone, mode, active_mode, latest_daily_version, latest_hourly_version, timestamp, skip, limit} = payload
    // userId = userId ? userId : 99999

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const zoneMaster = await this.prisma.zone.findMany({
      where: {
        // sensitive: null,
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

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_acc_imb_inventory',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const balance_intraday_acc_imb_inventory: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: '1',
        end_hour: '24',
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_intraday_acc_imb_inventory'
    )
    const eviden = balance_intraday_acc_imb_inventory?.data || []

    let resData = await this.prisma.intraday_base_inentory.findMany({
      where: {},
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        id: 'desc'
      }
    })

    let addData = []
    for (let i = 0; i < eviden.length; i++) {
      const filter = resData?.filter((f: any) => {
        const gasH = Number(f?.gas_hour?.split(':')[0]) + 1 || null
        return f?.gas_day_text === eviden[i]?.gas_day && gasH === eviden[i]?.gas_hour && f?.zone_text === eviden[i]?.zone && f?.mode === eviden[i]?.mode
      })

      if (filter.length > 0) {
        const timestamp = dayjs(eviden[i]?.execute_timestamp * 1000).format('DD/MM/YYYY HH:mm:ss') || null
        const evidenTime = dayjs(timestamp, 'DD/MM/YYYY HH:mm:ss')
        for (let iT = 0; iT < filter.length; iT++) {
          const date2 = dayjs(filter[iT]?.timestamp, 'DD/MM/YYYY HH:mm')
          if (evidenTime.isAfter(date2)) {
            addData.push({
              ...eviden[i]
            })
            break
          }
        }
      } else {
        addData.push({
          ...eviden[i]
        })
      }
    }
    // หาเวลาล่าสุด
    function getLatestByGroupTimeLast(data: any) {
      const groupMap = new Map()

      for (const item of data) {
        const key = `${item.gas_day}_${item.gas_hour}_${item.zone}_${item.mode}`
        const existing = groupMap.get(key)

        // ถ้ายังไม่มีในกลุ่ม หรือมีแล้วแต่ timestamp ใหม่กว่า
        if (!existing || item.execute_timestamp > existing.execute_timestamp) {
          groupMap.set(key, item)
        }
      }

      return Array.from(groupMap.values())
    }

    const addDataLast = getLatestByGroupTimeLast(addData)

    const dateCre = getTodayNowAdd7()

    const addDataLastNew = addDataLast.map((e: any) => {
      const hv = e['values']?.find((f: any) => {
        return f?.tag === 'heatingValue_base'
      })?.value
      const base_inventory_value = e['values']?.find((f: any) => {
        return f?.tag === 'baseInv'
      })?.value
      const high_difficult_day = e['values']?.find((f: any) => {
        return f?.tag === 'high_dd'
      })?.value
      const high_red = e['values']?.find((f: any) => {
        return f?.tag === 'high_red'
      })?.value
      const high_orange = e['values']?.find((f: any) => {
        return f?.tag === 'high_orange'
      })?.value
      const high_max = e['values']?.find((f: any) => {
        return f?.tag === 'high_max'
      })?.value
      const alert_high = e['values']?.find((f: any) => {
        return f?.tag === 'high_alert'
      })?.value
      const alert_low = e['values']?.find((f: any) => {
        return f?.tag === 'low_alert'
      })?.value
      const low_orange = e['values']?.find((f: any) => {
        return f?.tag === 'low_orange'
      })?.value
      const low_red = e['values']?.find((f: any) => {
        return f?.tag === 'low_red'
      })?.value
      const low_difficult_day = e['values']?.find((f: any) => {
        return f?.tag === 'low_dd'
      })?.value
      const low_max = e['values']?.find((f: any) => {
        return f?.tag === 'low_max'
      })?.value

      return {
        gas_day: e && getTodayNowYYYYMMDDDfaultAdd7(e?.gas_day).toDate() || dayjs().toDate(),

        gas_day_text: e?.gas_day,
        gas_hour: e && e?.gas_hour && `${e?.gas_hour > 10 ? e?.gas_hour + ':00' : '0' + e?.gas_hour + ':00'}`,
        timestamp: dayjs(e['execute_timestamp'] * 1000).format('DD/MM/YYYY HH:mm'),
        zone_text: e?.zone,
        mode: e?.mode || null,

        hv: (!!hv && String(hv)) || null,
        base_inventory_value: (!!base_inventory_value && String(base_inventory_value)) || null,
        high_difficult_day: (!!high_difficult_day && String(high_difficult_day)) || null,
        high_red: (!!high_red && String(high_red)) || null,
        high_orange: (!!high_orange && String(high_orange)) || null,
        high_max: (!!high_max && String(high_max)) || null,
        alert_high: (!!alert_high && String(alert_high)) || null,
        alert_low: (!!alert_low && String(alert_low)) || null,
        low_orange: (!!low_orange && String(low_orange)) || null,
        low_red: (!!low_red && String(low_red)) || null,
        low_difficult_day: (!!low_difficult_day && String(low_difficult_day)) || null,
        low_max: (!!low_max && String(low_max)) || null,

        create_date: dateCre.toDate(),
        create_date_num: dateCre.unix(),
        create_by: Number(userId)
      }
    })

    let created = []
    let updated = []
    for (let i = 0; i < addDataLastNew.length; i++) {
      const findUpdate = resData?.find((f: any) => {
        return f?.gas_day_text === addDataLastNew[i]?.gas_day_text && f?.gas_hour === addDataLastNew[i]?.gas_hour && f?.zone_text === addDataLastNew[i]?.zone_text && f?.mode === addDataLastNew[i]?.mode
      })
      if (findUpdate) {
        updated.push(addDataLastNew[i])
      } else {
        created.push(addDataLastNew[i])
      }
    }
    // created
    // return { created , updated }
    if (userId) {
      const createDb = await this.prisma.intraday_base_inentory.createMany({
        data: created
      })

      for (let i = 0; i < updated.length; i++) {
        const updateDb = await this.prisma.intraday_base_inentory.updateMany({
          where: {
            gas_day_text: updated?.[i]?.gas_day_text,
            gas_hour: updated?.[i]?.gas_hour,
            zone_text: updated?.[i]?.zone_text,
            mode: updated?.[i]?.mode
          },
          data: {
            gas_day: updated?.[i]?.gas_day,
            gas_day_text: updated?.[i]?.gas_day_text,
            gas_hour: updated?.[i]?.gas_hour,
            timestamp: updated?.[i]?.timestamp,
            zone_text: updated?.[i]?.zone_text,
            mode: updated?.[i]?.mode,
            hv: updated?.[i]?.hv,
            base_inventory_value: updated?.[i]?.base_inventory_value,
            high_difficult_day: updated?.[i]?.high_difficult_day,
            high_red: updated?.[i]?.high_red,
            high_orange: updated?.[i]?.high_orange,
            high_max: updated?.[i]?.high_max,
            alert_high: updated?.[i]?.alert_high,
            alert_low: updated?.[i]?.alert_low,
            low_orange: updated?.[i]?.low_orange,
            low_red: updated?.[i]?.low_red,
            low_difficult_day: updated?.[i]?.low_difficult_day,
            low_max: updated?.[i]?.low_max,
            update_date: updated?.[i]?.create_date,
            update_date_num: updated?.[i]?.create_date_num,
            update_by: updated?.[i]?.create_by
          }
        })
      }
    }

    resData = await this.prisma.intraday_base_inentory.findMany({
      where: {},
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        id: 'desc'
      }
    })

    const nresData = resData?.map((e: any) => {
      const zoneObj = zoneMaster?.find((f: any) => {
        return f?.name === e['zone_text']
      })
      const gas_day_text_DDMMYY = dayjs(e['gas_day_text'], 'YYYY-MM-DD').format('DD/MM/YYYY')
      return {
        gas_day_text_DDMMYY,
        ...e,
        zoneObj
      }
    })

    const filterGasDay = !!gas_day
      ? nresData?.filter((f: any) => {
          return f?.gas_day_text === gas_day
        })
      : nresData
    const filterZone = !!zone
      ? filterGasDay?.filter((f: any) => {
          return f?.zone_text === zone
        })
      : filterGasDay
    const filterMode = !!mode
      ? filterZone?.filter((f: any) => {
          return f?.mode === mode
        })
      : filterZone
    const filterTimestamp = !!timestamp
      ? filterMode?.filter((f: any) => {
          return f?.timestamp === timestamp
        })
      : filterMode

    const filteredActiveMode = active_mode
      ? Object.values(
          filterTimestamp.reduce(
            (acc, curr) => {
              const key = `${curr.gas_day_text}_${curr.zone_text}`

              const currentTimestamp = dayjs(curr.timestamp, 'DD/MM/YYYY HH:mm')
              const existing = acc[key]

              if (!existing || currentTimestamp.isAfter(dayjs(existing.timestamp, 'DD/MM/YYYY HH:mm'))) {
                acc[key] = curr
              }

              return acc
            },
            {} as Record<string, (typeof filterTimestamp)[0]>
          )
        )
      : filterTimestamp

    const filteredLatestDailyVersion = latest_daily_version
      ? Object.values(
          filteredActiveMode.reduce(
            (acc, curr) => {
              // const key = curr.gas_day_text;
              const key = curr && `${curr.gas_day}|${curr.zone}|${curr.mode}|${curr?.shipper}` || ""
              const currTimestamp = dayjs(curr.timestamp, 'DD/MM/YYYY HH:mm')

              if (!acc[key] || currTimestamp.isAfter(dayjs(acc[key].timestamp, 'DD/MM/YYYY HH:mm'))) {
                acc[key] = curr
              }

              return acc
            },
            {} as Record<string, (typeof filteredActiveMode)[0]>
          )
        )
      : filteredActiveMode

    const f_latest_hourly_version = (data: any[]) => {
      const latestPerHour = Object.values(
        data.reduce(
          (acc, curr) => {
            const gasDay = curr.gas_day_text // "2025-05-02"
            const [hour, minute] = curr.gas_hour.split(':') // ["16", "15"]
            // const key = `${gasDay}_${hour}`; // group: "2025-05-02_16"
            const key = curr && `${gasDay}_${hour}|${curr.zone}|${curr.mode}|${curr?.shipper}` || ""

            const currentMinutes = parseInt(minute) // นาทีของ current
            const existing = acc[key]

            const existingMinutes = existing ? parseInt(existing.gas_hour.split(':')[1]) : -1

            // ถ้ายังไม่มี หรือ นาทีของใหม่ > นาทีของที่มีอยู่
            if (!existing || currentMinutes > existingMinutes) {
              acc[key] = curr
            }

            return acc
          },
          {} as Record<string, (typeof data)[0]>
        )
      )

      // 🔃 (Optional) เรียงตามวัน+ชั่วโมง
      const sorted = latestPerHour.sort((a: any, b: any) => {
        const aTime = dayjs(`${a.gas_day_text} ${a.gas_hour}`, 'YYYY-MM-DD HH:mm')
        const bTime = dayjs(`${b.gas_day_text} ${b.gas_hour}`, 'YYYY-MM-DD HH:mm')
        return aTime.diff(bTime)
      })

      return sorted
    }

    const filteredLatestHourlyVersion = latest_hourly_version ? f_latest_hourly_version(filteredLatestDailyVersion) : filteredLatestDailyVersion

    return filteredLatestHourlyVersion
  }

  async intradayBaseInentoryFromWebService(payload: any, userId: any) {
    return await getIntradayBaseInentoryFromWebService(this.prisma, this.meteredMicroService, payload, userId)
  }

  async intradayBaseInentoryShipper(payload: any, userId: any) {
    const {
      gas_day,
      zone,
      mode,
      active_mode,
      latest_daily_version,
      latest_hourly_version,
      timestamp,
      start_date,
      end_date,
      skip,
      limit
      // start_hour, end_hour,
    } = payload

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const zoneMaster = await this.prisma.zone.findMany({
      where: {
        // sensitive: null,
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

    const group = await this.prisma.group.findMany({
      // where: {
      //   account_manage: {
      //     some: {
      //       account_id: Number(userId),
      //     },
      //   },
      // },
      where: {
        // sensitive: null,
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

    let totalRecordByShipper: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_acc_imb_inventory_by_shipper',
      (total_record: number) => {
        totalRecordByShipper = total_record
      }
    )
    const balance_intraday_acc_imb_inventory_by_shipper: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: '1',
        end_hour: '24',
        skip: totalRecordByShipper ? 0 : Number(skip),
        limit: totalRecordByShipper ? totalRecordByShipper : Number(limit)
      },
      'balance_intraday_acc_imb_inventory_by_shipper'
    )
    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_acc_imb_inventory',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const balance_intraday_acc_imb_inventory: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: '1',
        end_hour: '24',
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_intraday_acc_imb_inventory'
    )

    const flatData = (balance_intraday_acc_imb_inventory_by_shipper?.data || [])?.flatMap((e: any) => {
      const {shipper_data, values, ...nE} = e
      const shipperData = shipper_data
        ?.map((sd: any) => {
          return {
            ...nE,
            ...sd
          }
        })
        ?.filter((f: any) => {
          return f?.shipper !== 'Total'
        })

      return [...shipperData]
    })

    const addProp = flatData?.map((e: any) => {
      const zoneObj =
        zoneMaster?.find((f: any) => {
          return f?.name === e['zone']
        }) || null
      const groupObj =
        group?.find((f: any) => {
          return f?.id_name === e['shipper']
        }) || null
      const hv = (balance_intraday_acc_imb_inventory?.data || [])?.filter((f: any) => {
        return f?.gas_day === e['gas_day'] && f?.gas_hour === e['gas_hour'] && f?.zone === e['zone'] && f?.mode === e['mode']
      })
      const hvObjFil = hv.length > 0 ? hv[hv.length - 1] : null
      const heatingValue_base = hvObjFil
        ? hvObjFil?.values?.find((f: any) => {
            return f?.tag === 'heatingValue_base'
          })?.value || null
        : null

      return {
        ...e,
        zoneObj,
        groupObj,
        heatingValue_base,
        timestamp: dayjs(e['execute_timestamp'] * 1000).format('DD/MM/YYYY HH:mm:ss') || null
      }
    })

    const zoneFil = !!zone
      ? addProp?.filter((f: any) => {
          return f?.zone === zone
        })
      : addProp
    const modeFil = !!mode
      ? zoneFil?.filter((f: any) => {
          return f?.mode === mode
        })
      : zoneFil
    const timestampFil = !!timestamp
      ? modeFil?.filter((f: any) => {
          return f?.execute_timestamp === Number(timestamp)
        })
      : modeFil

    // latest_daily_version

    const filteredLatestDailyVersion = latest_daily_version
      ? Object.values(
          timestampFil.reduce(
            (acc, curr) => {
              const key = curr && `${curr.gas_day}|${curr.zone}|${curr.mode}|${curr?.shipper}` || ""
              // const key = `${curr.gas_day}`;
              const currTimestamp = dayjs(curr.timestamp, 'DD/MM/YYYY HH:mm')

              if (!acc[key] || currTimestamp.isAfter(dayjs(acc[key].timestamp, 'DD/MM/YYYY HH:mm'))) {
                acc[key] = curr
              }

              return acc
            },
            {} as Record<string, (typeof timestampFil)[0]>
          )
        )
      : timestampFil

    const f_latest_hourly_version = (data: any[]) => {
      const latestPerHour = Object.values(
        data.reduce(
          (acc, curr) => {
            // const gasDay = curr?.gas_day; // "2025-05-02"
            // const [hour, minute] = curr.gas_hour.split(':'); // ["16", "15"]
            // const key = `${gasDay}_${hour}`; // group: "2025-05-02_16"

            // const currentMinutes = parseInt(minute); // นาทีของ current
            // const existing = acc[key];

            // // const existingMinutes = existing
            // //   ? parseInt(existing.gas_hour?.split(':')[1])
            // //   : -1;

            // ถ้ายังไม่มี หรือ นาทีของใหม่ > นาทีของที่มีอยู่
            // if (!existing || currentMinutes > existing.gas_hour) {
            //   acc[key] = curr;
            // }
            const key = curr && `${curr.gas_day}|${curr.zone}|${curr.mode}|${curr?.shipper}` || ""
            const currHour = Number(curr.gas_hour) // แปลงเป็นเลขชัวร์

            const existing = acc[key]
            const existingHour = Number(existing?.gas_hour ?? -1) // ถ้าไม่มี = -1

            if (currHour > existingHour) {
              acc[key] = curr
            }

            return acc
          },
          {} as Record<string, (typeof data)[0]>
        )
      )

      // 🔃 (Optional) เรียงตามวัน+ชั่วโมง
      const sorted = latestPerHour.sort((a: any, b: any) => {
        const aTime = dayjs(`${a.gas_day_text} ${a.gas_hour}`, 'YYYY-MM-DD HH:mm')
        const bTime = dayjs(`${b.gas_day_text} ${b.gas_hour}`, 'YYYY-MM-DD HH:mm')
        return aTime.diff(bTime)
      })

      return sorted
    }

    const filteredLatestHourlyVersion = latest_hourly_version ? f_latest_hourly_version(filteredLatestDailyVersion) : filteredLatestDailyVersion

    return filteredLatestHourlyVersion
  }

  async intradayBaseInentoryTemplate(response: any) {
    const gasDay = dayjs().startOf('day').tz('Asia/Bangkok').format('DD/MM/YYYY')
    // const timestamp = dayjs().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm');
    const timestamp = dayjs().tz('Asia/Bangkok').format('DD/MM/YYYY HH:mm')

    // return await this.exportDataToExcelNew(
    //   [
    //     {
    //       'Gas Day': gasDay,
    //       'Gas Hour': '15',
    //       Timestamp: `${timestamp}:00`,
    //       Zone: 'EAST',
    //       Mode: 'Base 1',
    //       'HV (BTU/SCF)': '',
    //       'Base Inventory Value (MMBTU)': '',
    //       'High Difficult Day': '',
    //       'High Red (MMBTU)': '',
    //       'High Orange (MMBTU)': '',
    //       'High Max (MMBTU)': '',
    //       'Alert High (MMBTU)': '',
    //       'Alert Low (MMBTU)': '',
    //       'Low Orange (MMBTU)': '',
    //       'Low Red (MMBTU)': '',
    //       'Low Difficult Day': '',
    //       // 'Low Min (MMBTU)': '', // เดิมโรงงาน
    //       'Low Max (MMBTU)': '', //  Rechecked Pre-Prod V.158 Not Passed @Niti  เคส Auto Execute ขึ้นแล้ว แต่เคส Manual Import ข้อมูลเข้าไป ยังขึ้น Error Missing Required Field อยู่ ไม่แน่ใจว่าติดอะไร https://app.clickup.com/t/86ev2865u
    //     },
    //   ],
    //   response,
    //   'Intraday Base Inventory',
    //   true,
    // );

    //v2.0.132 template ต้องเรียง column เหมือน ui และ export https://app.clickup.com/t/86ev5f73v
    return await this.exportDataToExcelNew(
      [
        {
          'Gas Day': gasDay,
          'Gas Hour': '15:00',
          Timestamp: `${timestamp}:00`,
          Zone: 'EAST',
          Mode: 'Base 1',
          'HV (BTU/SCF)': '',
          'Base Inventory Value (MMBTU)': '',
          'High Max (MMBTU)': '',
          'High Difficult Day': '',
          'High Red (MMBTU)': '',
          'High Orange (MMBTU)': '',
          'Alert High (MMBTU)': '',
          'Alert Low (MMBTU)': '',
          'Low Orange (MMBTU)': '',
          'Low Red (MMBTU)': '',
          'Low Difficult Day': '',
          // 'Low Min (MMBTU)': '', // เดิมโรงงาน
          'Low Min (MMBTU)': '' //  https://app.clickup.com/t/86eujrgt9 | Rechecked Pre-Prod V.158 Not Passed @Niti  เคส Auto Execute ขึ้นแล้ว แต่เคส Manual Import ข้อมูลเข้าไป ยังขึ้น Error Missing Required Field อยู่ ไม่แน่ใจว่าติดอะไร https://app.clickup.com/t/86ev2865u
        }
      ],
      response,
      'Intraday Base Inventory',
      true
    )
  }

  async intradayBaseInentoryImport(grpcTransform: any, file: any, userId: any) {
    const findData = JSON.parse(grpcTransform?.jsonDataMultiSheet)
    const dataRes = findData[0]?.data
    const header = dataRes?.[0] || {}
    const value = dataRes && dataRes.slice(1) || []

    const gasDayKey = Object.keys(header).find((key) => header[key] === 'Gas Day')
    const gasHourKey = Object.keys(header).find((key) => header[key] === 'Gas Hour')
    const timestampKey = Object.keys(header).find((key) => header[key] === 'Timestamp')
    const zoneKey = Object.keys(header).find((key) => header[key] === 'Zone')
    const modeKey = Object.keys(header).find((key) => header[key] === 'Mode')
    const hvKey = Object.keys(header).find((key) => header[key] === 'HV (BTU/SCF)')
    const baseInventoryValueKey = Object.keys(header).find((key) => header[key] === 'Base Inventory Value (MMBTU)')
    const highDifficultDayKey = Object.keys(header).find((key) => header[key] === 'High Difficult Day')
    const highRedKey = Object.keys(header).find((key) => header[key] === 'High Red (MMBTU)')
    const highOrangeKey = Object.keys(header).find((key) => header[key] === 'High Orange (MMBTU)')
    const highMaxKey = Object.keys(header).find((key) => header[key] === 'High Max (MMBTU)')
    const alertHighKey = Object.keys(header).find((key) => header[key] === 'Alert High (MMBTU)')
    const alertLowKey = Object.keys(header).find((key) => header[key] === 'Alert Low (MMBTU)')
    const lowOrangeKey = Object.keys(header).find((key) => header[key] === 'Low Orange (MMBTU)')
    const lowRedKey = Object.keys(header).find((key) => header[key] === 'Low Red (MMBTU)')
    const lowDifficultDayKey = Object.keys(header).find((key) => header[key] === 'Low Difficult Day')
    const lowMaxKey = Object.keys(header).find(
      // (key) => header[key] === 'Low Min (MMBTU)', // เดิมโรงงาน
      // (key) => header[key] === 'Low Max (MMBTU)' // Rechecked Pre-Prod V.158 Not Passed @Niti  เคส Auto Execute ขึ้นแล้ว แต่เคส Manual Import ข้อมูลเข้าไป ยังขึ้น Error Missing Required Field อยู่ ไม่แน่ใจว่าติดอะไร https://app.clickup.com/t/86ev2865u
      (key) => header[key] === 'Low Min (MMBTU)'
    )

    if (!gasDayKey || !gasHourKey || !timestampKey || !zoneKey || !modeKey) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Template is not match.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // Validate time format for gasHourKey
    let validateList = []
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
    for (let i = 0; i < value.length; i++) {
      // if (!timeRegex.test(value[i][gasHourKey])) {
      //   validateList.push(
      //     `Invalid time format at row ${i + 1}. Time must be in HH:mm format between 00:00 and 23:59.`,
      //   );
      // }
      if (timeRegex.test(value[i][gasHourKey])) {
        const gasHourHHmm = getDayjsFromHHmm(value[i][gasHourKey])
        if (gasHourHHmm.isValid()) {
          value[i][gasHourKey] = gasHourHHmm.format('H')
        }
      }
      const gasHour = parseToNumber(value[i][gasHourKey])
      if (gasHour == null || gasHour < 1 || gasHour > 24) {
        validateList.push(
          // `Invalid Gas Hour at row ${i + 1}. Gas Hour must be between 1 to 24.`,
          `Invalid Gas Hour at row ${i + 1}. Gas Hour must be between 01:00 to 24:00.`
        )
      }

      // const timestamp = dayjs(`${value[i][timestampKey]}`.trim(),'YYYY-MM-DD HH:mm:ss');
      const timestamp = dayjs(`${value[i][timestampKey]}`.trim(), 'DD/MM/YYYY HH:mm:ss')

      if (!timestamp.isValid()) {
        validateList.push(
          // `Invalid Timestamp at row ${i + 1}. Timestamp must be in YYYY-MM-DD HH:mm:ss format.`,
          `Invalid Timestamp at row ${i + 1}. Timestamp must be in DD/MM/YYYY HH:mm:ss format.`
        )
      }
    }
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

    const intradayBaseInentoryAll = await this.intradayBaseInentoryAll()

    let dataUse = [] // update
    let dataUseCreate = [] // create

    if ((value?.length || 0) < 1) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required field'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    for (let i = 0; i < value.length; i++) {
      // https://app.clickup.com/t/86etd8wmw
      if (
        !!!value[i][gasDayKey] ||
        !!!value[i][gasHourKey] ||
        !!!value[i][timestampKey] ||
        !!!value[i][zoneKey] ||
        !!!value[i][modeKey] ||
        !!!value[i][hvKey] ||
        !!!value[i][baseInventoryValueKey] ||
        !!!value[i][highDifficultDayKey] ||
        !!!value[i][highRedKey] ||
        !!!value[i][highOrangeKey] ||
        !!!value[i][highMaxKey] ||
        !!!value[i][alertHighKey] ||
        !!!value[i][alertLowKey] ||
        !!!value[i][lowOrangeKey] ||
        !!!value[i][lowRedKey] ||
        !!!value[i][lowDifficultDayKey] ||
        !!!value[i][lowMaxKey]
      ) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Missing required field'
            //'Some data is missing. Please complete all required columns before importing',
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const checkMaster = intradayBaseInentoryAll.find((f: any) => {
        return f?.gas_day_text === dayjs(value[i][gasDayKey], 'DD/MM/YYYY').format('YYYY-MM-DD') && f?.gas_hour === value[i][gasHourKey] && f?.timestamp === value[i][timestampKey] && f?.zone_text === value[i][zoneKey] && f?.mode === value[i][modeKey]
      })

      if (!checkMaster) {
        // create
        const gasHour = parseToNumber(value[i][gasHourKey])
        dataUseCreate.push({
          gas_day: value[i][gasDayKey],
          gas_hour: `${gasHour}`,
          timestamp: value[i][timestampKey],
          zone_text: value[i][zoneKey],
          mode: value[i][modeKey] || null,
          hv: value[i][hvKey]?.trim()?.replace(/,/g, '') || null,
          base_inventory_value: value[i][baseInventoryValueKey]?.trim()?.replace(/,/g, '') || null,
          high_difficult_day: value[i][highDifficultDayKey]?.trim()?.replace(/,/g, '') || null,
          high_red: value[i][highRedKey]?.trim()?.replace(/,/g, '') || null,
          high_orange: value[i][highOrangeKey]?.trim()?.replace(/,/g, '') || null,
          high_max: value[i][highMaxKey]?.trim()?.replace(/,/g, '') || null,
          alert_high: value[i][alertHighKey]?.trim()?.replace(/,/g, '') || null,
          alert_low: value[i][alertLowKey]?.trim()?.replace(/,/g, '') || null,
          low_orange: value[i][lowOrangeKey]?.trim()?.replace(/,/g, '') || null,
          low_red: value[i][lowRedKey]?.trim()?.replace(/,/g, '') || null,
          low_difficult_day: value[i][lowDifficultDayKey]?.trim()?.replace(/,/g, '') || null,
          low_max: value[i][lowMaxKey]?.trim()?.replace(/,/g, '') || null
        })
      } else {
        dataUse.push({
          id: checkMaster?.id,
          hv: value[i][hvKey]?.trim()?.replace(/,/g, '') || null,
          base_inventory_value: value[i][baseInventoryValueKey]?.trim()?.replace(/,/g, '') || null,
          high_difficult_day: value[i][highDifficultDayKey]?.trim()?.replace(/,/g, '') || null,
          high_red: value[i][highRedKey]?.trim()?.replace(/,/g, '') || null,
          high_orange: value[i][highOrangeKey]?.trim()?.replace(/,/g, '') || null,
          high_max: value[i][highMaxKey]?.trim()?.replace(/,/g, '') || null,
          alert_high: value[i][alertHighKey]?.trim()?.replace(/,/g, '') || null,
          alert_low: value[i][alertLowKey]?.trim()?.replace(/,/g, '') || null,
          low_orange: value[i][lowOrangeKey]?.trim()?.replace(/,/g, '') || null,
          low_red: value[i][lowRedKey]?.trim()?.replace(/,/g, '') || null,
          low_difficult_day: value[i][lowDifficultDayKey]?.trim()?.replace(/,/g, '') || null,
          low_max: value[i][lowMaxKey]?.trim()?.replace(/,/g, '') || null
        })
      }
    }

    const dateCre = getTodayNowAdd7()

    for (let i = 0; i < dataUseCreate.length; i++) {
      const gasDay = getTodayNowDDMMYYYYDfaultAdd7(dataUseCreate[i]?.gas_day)
      let isBeforeOrSame = gasDay.isBefore(dateCre, 'day')

      if (!isBeforeOrSame && gasDay.isSame(dateCre, 'day')) {
        const gasHour = getTodayNowDDMMYYYYHHmmDfaultAdd7(`${gasDay.format('DD/MM/YYYY')} ${`${dataUseCreate[i]?.gas_hour}`.padStart(2, '0')}:00`)
        isBeforeOrSame = gasHour.isSameOrBefore(dateCre.tz('Asia/Bangkok'), 'minute')
      }

      let timestamp = getTodayNowDDMMYYYYHHmmDfaultAdd7(dataUseCreate[i]?.timestamp)
      if (!timestamp.isValid()) {
        timestamp = getTodayNowAdd7(dataUseCreate[i]?.timestamp)
      }
      const isTimestampBeforeOrSame = timestamp.tz('Asia/Bangkok').isSameOrBefore(dateCre.tz('Asia/Bangkok'))
      if (!isBeforeOrSame || !isTimestampBeforeOrSame) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Gas Day / Gas Hour /Timestamp cannot be in the future.' //'Gas Day is not within the range before the now date.',
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const zone = await this.prisma.zone.findMany({
        where: {
          // sensitive: null,
          AND: [
            {
              name: dataUseCreate[i]?.zone_text
            },
            {
              start_date: {
                lte: gasDay.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gt: gasDay.toDate()
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        }
      })

      // const ckzone = zone?.find((f: any) => {
      //   return f?.name === dataUseCreate[i]?.zone_text;
      // });

      if ((zone?.length || 0) < 1) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Zone is not currently active.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const configModeZone = await this.prisma.config_mode_zone_base_inventory.findMany({
        where: {
          AND: [
            {
              zone: {
                name: {
                  equals: dataUseCreate[i]?.zone_text,
                  mode: 'insensitive'
                }
              }
            },
            {
              mode: {
                equals: dataUseCreate[i]?.mode,
                mode: 'insensitive'
              }
            },
            {
              start_date: {
                lte: gasDay.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            }
          ]
        }
      })

      if ((configModeZone?.length || 0) < 1) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Zone / Mode is inactive for selected Gas Day.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }
    let dataUseCreateArr = []
    for (let i = 0; i < dataUseCreate.length; i++) {
      // create

      const create = await this.prisma.intraday_base_inentory.create({
        data: {
          gas_day: getTodayNowDDMMYYYYDfaultAdd7(dataUseCreate[i]?.gas_day).toDate(),
          gas_day_text: getTodayNowDDMMYYYYDfaultAdd7(dataUseCreate[i]?.gas_day).format('YYYY-MM-DD'),

          gas_hour: dataUseCreate[i]?.gas_hour,
          timestamp: dataUseCreate[i]?.timestamp,
          zone_text: dataUseCreate[i]?.zone_text,
          mode: dataUseCreate[i]?.mode || null,
          hv: dataUseCreate[i]?.hv || null,
          base_inventory_value: dataUseCreate[i]?.base_inventory_value || null,
          high_difficult_day: dataUseCreate[i]?.high_difficult_day || null,
          high_red: dataUseCreate[i]?.high_red || null,
          high_orange: dataUseCreate[i]?.high_orange || null,
          high_max: dataUseCreate[i]?.high_max || null,
          alert_high: dataUseCreate[i]?.alert_high || null,
          alert_low: dataUseCreate[i]?.alert_low || null,
          low_orange: dataUseCreate[i]?.low_orange || null,
          low_red: dataUseCreate[i]?.low_red || null,
          low_difficult_day: dataUseCreate[i]?.low_difficult_day || null,
          low_max: dataUseCreate[i]?.low_max || null,

          create_date: dateCre.toDate(),
          create_date_num: dateCre.unix(),
          create_by: Number(userId)
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }
      })
      dataUseCreateArr.push({
        id: create?.id,
        ...dataUseCreate[i]
      })
    }

    for (let i = 0; i < dataUse.length; i++) {
      const update = await this.prisma.intraday_base_inentory.updateMany({
        where: {
          id: Number(dataUse[i]?.id ?? -1)
        },
        data: {
          hv: dataUse[i]?.hv || null,
          base_inventory_value: dataUse[i]?.base_inventory_value || null,
          high_difficult_day: dataUse[i]?.high_difficult_day || null,
          high_red: dataUse[i]?.high_red || null,
          high_orange: dataUse[i]?.high_orange || null,
          high_max: dataUse[i]?.high_max || null,
          alert_high: dataUse[i]?.alert_high || null,
          alert_low: dataUse[i]?.alert_low || null,
          low_orange: dataUse[i]?.low_orange || null,
          low_red: dataUse[i]?.low_red || null,
          low_difficult_day: dataUse[i]?.low_difficult_day || null,
          low_max: dataUse[i]?.low_max || null,
          update_date: dateCre.toDate(),
          update_date_num: dateCre.unix(),
          update_by: Number(userId)
          // update_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }
      })
    }

    const responseUpFile = await uploadFilsTemp(file)
    await this.prisma.intraday_base_inentory_import_log.create({
      data: {
        file: responseUpFile?.file?.url,
        create_date: dateCre.toDate(),
        create_date_num: dateCre.unix(),
        create_by: Number(userId)
        // create_by_account: {
        //   connect: {
        //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
        //   },
        // },
      }
    })

    try {
      // const contractCode = await this.prisma.contract_code.findFirst({ where: { id: Number(uploadFile?.dataInfo?.contract_code_id) } })
      // const shipper = await this.prisma.group.findFirst({ where: { id: Number(uploadFile?.dataInfo?.shipper_id) } })
      const message = `Intraday Base Inventory: Data retrieving from file ${file.originalname} executed on ${dateCre.format('DD/MM/YYYY HH:mm:ss')}[finished OK}`
      await middleNotiInapp(
        this.prisma,
        'Balancing',
        message,
        87, // Balancing menus_id
        1
      )
    } catch (error) {}

    return [...dataUseCreateArr, ...dataUse]
  }

  async lastRetrievingNew() {
    // let totalRecord: number | undefined = undefined;
    // await this.evidenApiCenter(
    //   {
    //     skip: 0,
    //     limit: 1,
    //   },
    //   'execute_records_eod',
    //   (total_record: number) => {
    //     totalRecord = total_record;
    //   },
    // );

    // const evidenApiCenter = await this.evidenApiCenter(
    //   {
    //     skip: totalRecord - 1,
    //     limit: 1,
    //   },
    //   'execute_records_eod',
    // );

    // let nData: any = evidenApiCenter;
    // const { data } = nData;
    // const timestamp = data?.[0]?.execute_timestamp  &&  getTodayNowAdd7(data?.[0]?.execute_timestamp  * 1000).tz('Asia/Bangkok').format(
    //       'YYYY-MM-DD HH:mm:ss',
    //     )

    const lastExecuteEod = await this.prisma.execute_eod.findFirst({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        }
      },
      orderBy: {
        execute_timestamp: 'desc'
      }
    })

    const timestamp =
      lastExecuteEod?.execute_timestamp &&
      getTodayNowAdd7(lastExecuteEod?.execute_timestamp * 1000)
        .tz('Asia/Bangkok')
        .format('YYYY-MM-DD HH:mm:ss')

    return {
      timestamp: timestamp || null,
      execute_timestamp: lastExecuteEod?.execute_timestamp || null
    }
  }

  // https://app.clickup.com/t/86ev2866j
  // request_number
  async balancReport(payload: any, userId: any) {
    // balance_balance_report
    const {start_date, end_date, skip, limit} = payload || {}
    //
    const {minDate, maxDate} = await findMinMaxExeDate(this.prisma, start_date, end_date)

    // คมมาเยือน
    // เติมกัน 500
    if (!minDate) {
      return []
    }

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        // start_date: start_date,
        // end_date: end_date,
        start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
        end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
        skip: 0,
        limit: 1
      },
      'balance_balance_report',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        // start_date,
        // end_date,
        start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
        end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_balance_report'
    )
    // รอทำเช็ค request_number
    // request_number

    // // Filter to get only the latest execute_timestamp for each gas_day
    if (evidenApiCenter && evidenApiCenter.data && Array.isArray(evidenApiCenter.data)) {
      const todayStart = getTodayStartAdd7(start_date).toDate()
      const todayEnd = getTodayStartAdd7(end_date).toDate()

      const executeEodList = await this.prisma.execute_eod.findMany({
        where: {
          status: {
            equals: 'OK',
            mode: 'insensitive'
          },
          start_date_date: {
            lte: todayEnd
          },
          end_date_date: {
            gte: todayStart
          }
        }
      })

      const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
        where: {
          AND: [
            {
              gas_day: {
                gte: todayStart
              }
            },
            {
              gas_day: {
                lte: todayEnd
              }
            },
            {
              del_flag: true
            }
          ]
        }
      })

      const matchWithExecuteList = evidenApiCenter.data.filter((item: any) => {
        const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
        return executeEodList?.some((executeData: any) => {
          const executeStart = getTodayNowAdd7(executeData?.start_date_date)
          const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
          return executeData?.request_number_id == item?.request_number && executeStart?.isSameOrBefore(itemGasDay, 'day') && executeEnd?.isSameOrAfter(itemGasDay, 'day')
        })
      })

      const publicationData = matchWithExecuteList.filter((item: any) => {
        return !publicationCenterDeletedList?.some((f: any) => {
          return f?.execute_timestamp === item.execute_timestamp && f?.gas_day_text === item.gas_day && !f?.gas_hour
        })
      })

      let filteredData = []
      if (publicationData.length > 0) {
        const latestByGasDay = publicationData.reduce((acc: any, current: any) => {
          const gasDay = current.gas_day

          if (!acc[gasDay] || current.execute_timestamp > acc[gasDay].execute_timestamp) {
            acc[gasDay] = current
          }

          return acc
        }, {})
        // Convert back to array and update the response
        filteredData = Object.values(latestByGasDay)
      }

      evidenApiCenter.data = filteredData
      evidenApiCenter.total_record = filteredData.length
    }

    return evidenApiCenter
  }

  async intradayBalancingReport(payload: any, userId: any) {
    const {gas_day, start_hour, end_hour, skip, limit, latest_daily_version, latest_hourly_version, show_total, show_total_all_shipper, only_public, shipper: shipperArr} = payload

    // const groupMasterCheck = await this.prisma.group.findFirst({
    //   where: {
    //     account_manage: {
    //       some: {
    //         account_id: Number(userId),
    //       },
    //     },
    //   },
    // });

    // const userType = groupMasterCheck?.user_type_id;

    const todayStart = getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
    const todayEnd = getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
    const groupMaster = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
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

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: todayStart,
          lte: todayEnd
        }
      }
    })

    const publicationCenter = await this.prisma.publication_center.findMany({
      where: {
        // del_flag: null,
        gas_day_text: gas_day
      }
    })

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day: gas_day,
        start_hour: start_hour ? Number(start_hour) : 1,
        end_hour: end_hour ? Number(end_hour) : 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_balance_report',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day: gas_day, // 2025-01-01 to 2025-02-28
        start_hour: start_hour ? Number(start_hour) : 1,
        end_hour: end_hour ? Number(end_hour) : 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_intraday_balance_report'
    )

    const newData = evidenApiCenter?.data || []
    // validation

    const matchWithExecuteList = newData.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day') && executeData.gas_hour == item.gas_hour
      })
    })

    let numHour = 0
    const newDataNewData = await Promise.all(
      matchWithExecuteList?.map(async (e: any) => {
        const {nomination_values, balance_values, shipper_data, gas_day, gas_hour, ...nE} = e

        const publication = !publicationCenter.some((publication: any) => {
          return publication.gas_day_text === gas_day && publication.gas_hour === gas_hour && publication.execute_timestamp === nE.execute_timestamp && publication.del_flag === true
        })

        const gasDay = dayjs(gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY')
        const gasHour = `${gas_hour > 10 ? gas_hour + ':00' : '0' + gas_hour + ':00'}` || null
        const timestamp = dayjs(e['execute_timestamp'] * 1000).format('DD/MM/YYYY HH:mm')
        const totalAllPlanning = {
          gas_day: `TOTAL ALL : (${gasDay})`,
          ...Object.fromEntries(Array.isArray(nomination_values) ? nomination_values.map((item) => [item?.tag, item?.value]) : []),
          ...Object.fromEntries(Array.isArray(nomination_values) ? nomination_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
        }

        const totalAllActual = {
          gas_day: `TOTAL ALL : (${gasDay})`,
          // validation
          ...Object.fromEntries(Array.isArray(balance_values) ? balance_values.map((item) => [item?.tag, item?.value]) : []),
          ...Object.fromEntries(Array.isArray(balance_values) ? balance_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
        }

        const shipperData = await Promise.all(
          shipper_data?.map(async (sd: any) => {
            const {nomination_values: shipper_nomination_values, balance_values: shipper_balance_values, contract_data, shipper, ...nSd} = sd

            const findShipperName: any =
              groupMaster?.find((f: any) => {
                return f?.id_name === sd['shipper']
              }) || ''

            const totalShipperPlanning = {
              gas_day: `TOTAL : ${findShipperName?.name} (${gasDay})`,
              ...Object.fromEntries(Array.isArray(shipper_nomination_values) ? shipper_nomination_values.map((item) => [item?.tag, item?.value]) : []),
              ...Object.fromEntries(Array.isArray(shipper_nomination_values) ? shipper_nomination_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
            }

            const totalShipperActual = {
              gas_day: `TOTAL : ${findShipperName?.name} (${gasDay})`,
              ...Object.fromEntries(Array.isArray(shipper_balance_values) ? shipper_balance_values.map((item) => [item?.tag, item?.value]) : []),
              ...Object.fromEntries(Array.isArray(shipper_balance_values) ? shipper_balance_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
            }
            // ---------

            // advali
            const contractData = await Promise.all(
              contract_data?.map(async (cd: any) => {
                const {nomination_values: contract_nomination_values, balance_values: contract_balance_values, contract, ...nCd} = cd

                // เช็คค่าเดิมก่อน
                if (gas_hour > numHour) {
                  numHour = gas_hour
                }

                const valueContractPlanning = {
                  publication,
                  execute_timestamp: e['execute_timestamp'],
                  gas_day: gasDay,
                  gas_day_text: e['gas_day'],
                  gas_hour: gasHour,
                  gas_hour_num: gas_hour,
                  shipper: findShipperName?.id_name || sd['shipper'],
                  shipper_name: findShipperName?.name,
                  contract,
                  timestamp: timestamp,
                  ...Object.fromEntries(Array.isArray(contract_nomination_values) ? contract_nomination_values.map((item) => [item?.tag, item?.value]) : [])
                  // ...Object.fromEntries(
                  //   (contract_nomination_values || [])?.map((item) => [
                  //     `validation_${item?.tag}`,
                  //     item?.validation,
                  //   ]),
                  // ),
                }
                const valueContractActual = {
                  publication,
                  execute_timestamp: e['execute_timestamp'],
                  gas_day: gasDay,
                  gas_day_text: e['gas_day'],
                  gas_hour: gasHour,
                  gas_hour_num: gas_hour,
                  shipper: findShipperName?.id_name || sd['shipper'],
                  shipper_name: findShipperName?.name,
                  contract,
                  timestamp: timestamp,
                  ...Object.fromEntries(Array.isArray(contract_balance_values) ? contract_balance_values.map((item) => [item?.tag, item?.value]) : [])
                  // ...Object.fromEntries(
                  //   (contract_balance_values || [])?.map((item) => [
                  //     `validation_${item?.tag}`,
                  //     item?.validation,
                  //   ]),
                  // ),
                }

                return {
                  valueContractPlanning,
                  valueContractActual
                }
              })
            )

            return {
              ...nSd,
              shipper,
              contractData,
              totalShipperPlanning,
              totalShipperActual
            }
          })
        )

        return {
          gas_day: gas_day || null,
          gas_hour: gas_hour,
          ...nE,
          // shipperData: null,
          // totalAllPlanning: null,
          // totalAllActual: null,
          shipperData: shipperData || null,
          totalAllPlanning,
          totalAllActual
        }
      })
    )

    // filter shipper
    const shipperIdName = shipperArr // NGP-S01-002
    let fShipperData = []
    if (!!shipperIdName && shipperIdName.length > 0) {
      let cutShipper = []
      for (let i = 0; i < newDataNewData.length; i++) {
        let shipperArr = []
        const {shipperData, ...nNewDataNewData} = newDataNewData[i]

        for (let iShipper = 0; iShipper < shipperData.length; iShipper++) {
          const {shipper} = shipperData[iShipper]
          if (shipperIdName.includes(shipper)) {
            shipperArr.push({
              ...shipperData[iShipper]
            })
          }
        }
        if (shipperArr.length > 0) {
          cutShipper.push({
            ...nNewDataNewData,
            shipperData: shipperArr
          })
        }
      }

      fShipperData = cutShipper
    } else {
      fShipperData = newDataNewData
    }

    //
    // "latest_daily_version": false,
    // "latest_hourly_version": false,
    // "show_total": false,
    // "show_total_all_shipper": false,
    // "only_public": false,
    let fOnlyPublicData = []
    if (only_public) {
      let cutOnluPublic = []
      for (let i = 0; i < fShipperData.length; i++) {
        let publicArr = []
        const {shipperData, ...nNewDataNewData} = fShipperData[i]

        for (let iShipper = 0; iShipper < shipperData.length; iShipper++) {
          const {contractData} = shipperData[iShipper]
          let contractArr = []
          for (let iContract = 0; iContract < contractData.length; iContract++) {
            const {valueContractPlanning, valueContractActual} = contractData[iContract]

            if (valueContractPlanning?.publication && valueContractActual?.publication) {
              contractArr.push({
                ...contractData[iContract]
              })
            }
          }
          if (contractArr.length > 0) {
            publicArr.push({
              ...shipperData[iShipper]
            })
          }
        }
        if (publicArr.length > 0) {
          cutOnluPublic.push({
            ...nNewDataNewData,
            shipperData: publicArr
            // totalAllPlanning: null,
            // totalAllActual: null,
          })
        }
      }

      fOnlyPublicData = cutOnluPublic
    } else {
      fOnlyPublicData = fShipperData
    }

    // latest_daily_version
    // latest_hourly_version
    // gas_hour

    if (latest_hourly_version) {
      // Group by gas_day and gas_hour, then get the latest timestamp for each group
      const groupedByHour = new Map()

      fOnlyPublicData.forEach((item: any) => {
        const key = `${item.gas_day}_${item.gas_hour}`
        if (!groupedByHour.has(key) || compareTimestamps(item.execute_timestamp, groupedByHour.get(key).execute_timestamp) > 0) {
          groupedByHour.set(key, item)
        }
      })

      fOnlyPublicData = Array.from(groupedByHour.values())
    }

    if (latest_daily_version) {
      // First, group by gas_day, zone, and mode to get the latest gas_hour for each group
      const groupedByLatestHour = new Map()
      fOnlyPublicData.forEach((item: any) => {
        const key = `${item.gas_day}`

        if (!groupedByLatestHour.has(key) || compareGasHour(item.gas_hour, groupedByLatestHour.get(key).gas_hour) > 0) {
          groupedByLatestHour.set(key, item)
        }
      })

      // Then, from the latest gas_hour records, get the latest timestamp for each group
      const groupedByDay = new Map()
      Array.from(groupedByLatestHour.values()).forEach((item: any) => {
        const key = `${item.gas_day}`

        if (!groupedByDay.has(key) || compareTimestamps(item.execute_timestamp, groupedByDay.get(key).execute_timestamp) > 0) {
          groupedByDay.set(key, item)
        }
      })
      fOnlyPublicData = Array.from(groupedByDay.values())
    }

    // calc total new
    const ttfData = fOnlyPublicData?.map((e: any) => {
      const {gas_day, request_number, execute_timestamp, request_number_previous_hour, request_number_eod, shipperData, totalAllPlanning, totalAllActual, ...nE} = e
      const shipperData_ = shipperData?.map((sd: any) => {
        const {contractData, totalShipperPlanning, totalShipperActual, ...nSd} = sd
        const calcTotals = (keyT: any, key: any) => {
          const calcs = contractData?.reduce((accumulator, currentValue) => accumulator + currentValue?.[keyT]?.[key], 0)
          return calcs
        }

        let totalShipperPlanning_ = totalShipperPlanning
        totalShipperPlanning_['total_entry_east'] = calcTotals('valueContractPlanning', 'total_entry_east')
        totalShipperPlanning_['total_entry_west'] = calcTotals('valueContractPlanning', 'total_entry_west')
        totalShipperPlanning_['total_entry_east-west'] = calcTotals('valueContractPlanning', 'total_entry_east-west')
        totalShipperPlanning_['total_exit_east'] = calcTotals('valueContractPlanning', 'total_exit_east')
        totalShipperPlanning_['total_exit_west'] = calcTotals('valueContractPlanning', 'total_exit_west')
        totalShipperPlanning_['total_exit_east-west'] = calcTotals('valueContractPlanning', 'total_exit_east-west')
        totalShipperPlanning_['shrinkage_east'] = calcTotals('valueContractPlanning', 'shrinkage_east')
        totalShipperPlanning_['shrinkage_west'] = calcTotals('valueContractPlanning', 'shrinkage_west')
        totalShipperPlanning_['shrinkage_east-west'] = calcTotals('valueContractPlanning', 'shrinkage_east-west')
        totalShipperPlanning_['minInventoryChange_east'] = calcTotals('valueContractPlanning', 'minInventoryChange_east')
        totalShipperPlanning_['minInventoryChange_west'] = calcTotals('valueContractPlanning', 'minInventoryChange_west')
        totalShipperPlanning_['minInventoryChange_east-west'] = calcTotals('valueContractPlanning', 'minInventoryChange_east-west')
        totalShipperPlanning_['park_east'] = calcTotals('valueContractPlanning', 'park_east')
        totalShipperPlanning_['park_west'] = calcTotals('valueContractPlanning', 'park_west')
        totalShipperPlanning_['park_east-west'] = calcTotals('valueContractPlanning', 'park_east-west')
        totalShipperPlanning_['Unpark_east'] = calcTotals('valueContractPlanning', 'Unpark_east')
        totalShipperPlanning_['Unpark_west'] = calcTotals('valueContractPlanning', 'Unpark_west')
        totalShipperPlanning_['Unpark_east-west'] = calcTotals('valueContractPlanning', 'Unpark_east-west')
        totalShipperPlanning_['reserveBal_east'] = calcTotals('valueContractPlanning', 'reserveBal_east')
        totalShipperPlanning_['reserveBal_west'] = calcTotals('valueContractPlanning', 'reserveBal_west')
        totalShipperPlanning_['SodPark_east'] = calcTotals('valueContractPlanning', 'SodPark_east')
        totalShipperPlanning_['SodPark_west'] = calcTotals('valueContractPlanning', 'SodPark_west')
        totalShipperPlanning_['SodPark_east-west'] = calcTotals('valueContractPlanning', 'SodPark_east-west')
        totalShipperPlanning_['EodPark_east'] = calcTotals('valueContractPlanning', 'EodPark_east')
        totalShipperPlanning_['EodPark_west'] = calcTotals('valueContractPlanning', 'EodPark_west')
        totalShipperPlanning_['EodPark_east-west'] = calcTotals('valueContractPlanning', 'EodPark_east-west')
        // totalShipperPlanning_['InstructedFlow_east'] = calcTotals(
        //   'valueContractPlanning',
        //   'InstructedFlow_east',
        // );
        // totalShipperPlanning_['InstructedFlow_west'] = calcTotals(
        //   'valueContractPlanning',
        //   'InstructedFlow_west',
        // );
        totalShipperPlanning_['instructedFlow_east'] = calcTotals('valueContractPlanning', 'instructedFlow_east')
        totalShipperPlanning_['instructedFlow_west'] = calcTotals('valueContractPlanning', 'instructedFlow_west')
        totalShipperPlanning_['instructedFlow_east-west'] = calcTotals('valueContractPlanning', 'instructedFlow_east-west')
        totalShipperPlanning_['detail_entry_east_gsp'] = calcTotals('valueContractPlanning', 'detail_entry_east_gsp')
        totalShipperPlanning_['detail_entry_east_bypassGas'] = calcTotals('valueContractPlanning', 'detail_entry_east_bypassGas')
        totalShipperPlanning_['detail_entry_east_lng'] = calcTotals('valueContractPlanning', 'detail_entry_east_lng')
        totalShipperPlanning_['detail_entry_west_yadana'] = calcTotals('valueContractPlanning', 'detail_entry_west_yadana')
        totalShipperPlanning_['detail_entry_west_yetagun'] = calcTotals('valueContractPlanning', 'detail_entry_west_yetagun')
        totalShipperPlanning_['detail_entry_west_zawtika'] = calcTotals('valueContractPlanning', 'detail_entry_west_zawtika')
        totalShipperPlanning_['detail_entry_east-west_ra6East'] = calcTotals('valueContractPlanning', 'detail_entry_east-west_ra6East')
        totalShipperPlanning_['detail_entry_east-west_ra6West'] = calcTotals('valueContractPlanning', 'detail_entry_east-west_ra6West')
        totalShipperPlanning_['detail_entry_east-west_ra6Ratio'] = calcTotals('valueContractPlanning', 'detail_entry_east-west_ra6Ratio')
        totalShipperPlanning_['detail_entry_east-west_bvw10East'] = calcTotals('valueContractPlanning', 'detail_entry_east-west_bvw10East')
        totalShipperPlanning_['detail_entry_east-west_bvw10West'] = calcTotals('valueContractPlanning', 'detail_entry_east-west_bvw10West')
        totalShipperPlanning_['detail_entry_east-west_bvw10Ratio'] = calcTotals('valueContractPlanning', 'detail_entry_east-west_bvw10Ratio')
        totalShipperPlanning_['detail_exit_east_egat'] = calcTotals('valueContractPlanning', 'detail_exit_east_egat')
        totalShipperPlanning_['detail_exit_east_ipp'] = calcTotals('valueContractPlanning', 'detail_exit_east_ipp')
        totalShipperPlanning_['detail_exit_east_spp'] = calcTotals('valueContractPlanning', 'detail_exit_east_spp')
        totalShipperPlanning_['detail_exit_east_ind'] = calcTotals('valueContractPlanning', 'detail_exit_east_ind')
        totalShipperPlanning_['detail_exit_east_fuel'] = calcTotals('valueContractPlanning', 'detail_exit_east_fuel')
        totalShipperPlanning_['detail_exit_west_egat'] = calcTotals('valueContractPlanning', 'detail_exit_west_egat')
        totalShipperPlanning_['detail_exit_west_ipp'] = calcTotals('valueContractPlanning', 'detail_exit_west_ipp')
        totalShipperPlanning_['detail_exit_west_spp'] = calcTotals('valueContractPlanning', 'detail_exit_west_spp')
        totalShipperPlanning_['detail_exit_west_ind'] = calcTotals('valueContractPlanning', 'detail_exit_west_ind')
        totalShipperPlanning_['detail_exit_west_fuel'] = calcTotals('valueContractPlanning', 'detail_exit_west_fuel')
        totalShipperPlanning_['detail_exit_east-west_egat'] = calcTotals('valueContractPlanning', 'detail_exit_east-west_egat')
        totalShipperPlanning_['detail_exit_east-west_ipp'] = calcTotals('valueContractPlanning', 'detail_exit_east-west_ipp')
        totalShipperPlanning_['detail_exit_east-west_spp'] = calcTotals('valueContractPlanning', 'detail_exit_east-west_spp')
        totalShipperPlanning_['detail_exit_east-west_ind'] = calcTotals('valueContractPlanning', 'detail_exit_east-west_ind')
        totalShipperPlanning_['detail_exit_east-west_fuel'] = calcTotals('valueContractPlanning', 'detail_exit_east-west_fuel')
        totalShipperPlanning_['minInventory_east'] = calcTotals('valueContractPlanning', 'minInventory_east')
        totalShipperPlanning_['minInventory_west'] = calcTotals('valueContractPlanning', 'minInventory_west')
        totalShipperPlanning_['minInventory_east-west'] = calcTotals('valueContractPlanning', 'minInventory_east-west')

        let totalShipperActual_ = totalShipperActual
        totalShipperActual_['total_entry_east'] = calcTotals('valueContractActual', 'total_entry_east')
        totalShipperActual_['total_entry_west'] = calcTotals('valueContractActual', 'total_entry_west')
        totalShipperActual_['total_entry_east-west'] = calcTotals('valueContractActual', 'total_entry_east-west')
        totalShipperActual_['total_exit_east'] = calcTotals('valueContractActual', 'total_exit_east')
        totalShipperActual_['total_exit_west'] = calcTotals('valueContractActual', 'total_exit_west')
        totalShipperActual_['total_exit_east-west'] = calcTotals('valueContractActual', 'total_exit_east-west')
        totalShipperActual_['shrinkage_east'] = calcTotals('valueContractActual', 'shrinkage_east')
        totalShipperActual_['shrinkage_west'] = calcTotals('valueContractActual', 'shrinkage_west')
        totalShipperActual_['shrinkage_east-west'] = calcTotals('valueContractActual', 'shrinkage_east-west')
        totalShipperActual_['minInventoryChange_east'] = calcTotals('valueContractActual', 'minInventoryChange_east')
        totalShipperActual_['minInventoryChange_west'] = calcTotals('valueContractActual', 'minInventoryChange_west')
        totalShipperActual_['minInventoryChange_east-west'] = calcTotals('valueContractActual', 'minInventoryChange_east-west')
        totalShipperActual_['park_east'] = calcTotals('valueContractActual', 'park_east')
        totalShipperActual_['park_west'] = calcTotals('valueContractActual', 'park_west')
        totalShipperActual_['park_east-west'] = calcTotals('valueContractActual', 'park_east-west')
        totalShipperActual_['Unpark_east'] = calcTotals('valueContractActual', 'Unpark_east')
        totalShipperActual_['Unpark_west'] = calcTotals('valueContractActual', 'Unpark_west')
        totalShipperActual_['Unpark_east-west'] = calcTotals('valueContractActual', 'Unpark_east-west')
        totalShipperActual_['reserveBal_east'] = calcTotals('valueContractActual', 'reserveBal_east')
        totalShipperActual_['reserveBal_west'] = calcTotals('valueContractActual', 'reserveBal_west')
        totalShipperActual_['SodPark_east'] = calcTotals('valueContractActual', 'SodPark_east')
        totalShipperActual_['SodPark_west'] = calcTotals('valueContractActual', 'SodPark_west')
        totalShipperActual_['SodPark_east-west'] = calcTotals('valueContractActual', 'SodPark_east-west')
        totalShipperActual_['EodPark_east'] = calcTotals('valueContractActual', 'EodPark_east')
        totalShipperActual_['EodPark_west'] = calcTotals('valueContractActual', 'EodPark_west')
        totalShipperActual_['EodPark_east-west'] = calcTotals('valueContractActual', 'EodPark_east-west')
        // totalShipperActual_['InstructedFlow_east'] = calcTotals(
        //   'valueContractActual',
        //   'InstructedFlow_east',
        // );
        // totalShipperActual_['InstructedFlow_west'] = calcTotals(
        //   'valueContractActual',
        //   'InstructedFlow_west',
        // );
        totalShipperActual_['instructedFlow_east'] = calcTotals('valueContractActual', 'instructedFlow_east')
        totalShipperActual_['instructedFlow_west'] = calcTotals('valueContractActual', 'instructedFlow_west')
        totalShipperActual_['instructedFlow_east-west'] = calcTotals('valueContractActual', 'instructedFlow_east-west')
        totalShipperActual_['detail_entry_east_gsp'] = calcTotals('valueContractActual', 'detail_entry_east_gsp')
        totalShipperActual_['detail_entry_east_bypassGas'] = calcTotals('valueContractActual', 'detail_entry_east_bypassGas')
        totalShipperActual_['detail_entry_east_lng'] = calcTotals('valueContractActual', 'detail_entry_east_lng')
        totalShipperActual_['detail_entry_west_yadana'] = calcTotals('valueContractActual', 'detail_entry_west_yadana')
        totalShipperActual_['detail_entry_west_yetagun'] = calcTotals('valueContractActual', 'detail_entry_west_yetagun')
        totalShipperActual_['detail_entry_west_zawtika'] = calcTotals('valueContractActual', 'detail_entry_west_zawtika')
        totalShipperActual_['detail_entry_east-west_ra6East'] = calcTotals('valueContractActual', 'detail_entry_east-west_ra6East')
        totalShipperActual_['detail_entry_east-west_ra6West'] = calcTotals('valueContractActual', 'detail_entry_east-west_ra6West')
        totalShipperActual_['detail_entry_east-west_ra6Ratio'] = calcTotals('valueContractActual', 'detail_entry_east-west_ra6Ratio')
        totalShipperActual_['detail_entry_east-west_bvw10East'] = calcTotals('valueContractActual', 'detail_entry_east-west_bvw10East')
        totalShipperActual_['detail_entry_east-west_bvw10West'] = calcTotals('valueContractActual', 'detail_entry_east-west_bvw10West')
        totalShipperActual_['detail_entry_east-west_bvw10Ratio'] = calcTotals('valueContractActual', 'detail_entry_east-west_bvw10Ratio')
        totalShipperActual_['detail_exit_east_egat'] = calcTotals('valueContractActual', 'detail_exit_east_egat')
        totalShipperActual_['detail_exit_east_ipp'] = calcTotals('valueContractActual', 'detail_exit_east_ipp')
        totalShipperActual_['detail_exit_east_spp'] = calcTotals('valueContractActual', 'detail_exit_east_spp')
        totalShipperActual_['detail_exit_east_ind'] = calcTotals('valueContractActual', 'detail_exit_east_ind')
        totalShipperActual_['detail_exit_east_fuel'] = calcTotals('valueContractActual', 'detail_exit_east_fuel')
        totalShipperActual_['detail_exit_west_egat'] = calcTotals('valueContractActual', 'detail_exit_west_egat')
        totalShipperActual_['detail_exit_west_ipp'] = calcTotals('valueContractActual', 'detail_exit_west_ipp')
        totalShipperActual_['detail_exit_west_spp'] = calcTotals('valueContractActual', 'detail_exit_west_spp')
        totalShipperActual_['detail_exit_west_ind'] = calcTotals('valueContractActual', 'detail_exit_west_ind')
        totalShipperActual_['detail_exit_west_fuel'] = calcTotals('valueContractActual', 'detail_exit_west_fuel')
        totalShipperActual_['detail_exit_east-west_egat'] = calcTotals('valueContractActual', 'detail_exit_east-west_egat')
        totalShipperActual_['detail_exit_east-west_ipp'] = calcTotals('valueContractActual', 'detail_exit_east-west_ipp')
        totalShipperActual_['detail_exit_east-west_spp'] = calcTotals('valueContractActual', 'detail_exit_east-west_spp')
        totalShipperActual_['detail_exit_east-west_ind'] = calcTotals('valueContractActual', 'detail_exit_east-west_ind')
        totalShipperActual_['detail_exit_east-west_fuel'] = calcTotals('valueContractActual', 'detail_exit_east-west_fuel')
        totalShipperActual_['minInventory_east'] = calcTotals('valueContractActual', 'minInventory_east')
        totalShipperActual_['minInventory_west'] = calcTotals('valueContractActual', 'minInventory_west')
        totalShipperActual_['minInventory_east-west'] = calcTotals('valueContractActual', 'minInventory_east-west')

        return {
          ...nSd,
          contractData,
          totalShipperPlanning: totalShipperPlanning_,
          totalShipperActual: totalShipperActual_
        }
      })

      const calcTotalsAll = (keyT: any, key: any) => {
        const calcs = shipperData?.reduce((accumulator, currentValue) => accumulator + currentValue?.[keyT]?.[key], 0)
        return calcs
      }

      let totalAllPlanning_ = totalAllPlanning
      totalAllPlanning_['total_entry_east'] = calcTotalsAll('totalShipperPlanning', 'total_entry_east')
      totalAllPlanning_['total_entry_west'] = calcTotalsAll('totalShipperPlanning', 'total_entry_west')
      totalAllPlanning_['total_entry_east-west'] = calcTotalsAll('totalShipperPlanning', 'total_entry_east-west')
      totalAllPlanning_['total_exit_east'] = calcTotalsAll('totalShipperPlanning', 'total_exit_east')
      totalAllPlanning_['total_exit_west'] = calcTotalsAll('totalShipperPlanning', 'total_exit_west')
      totalAllPlanning_['total_exit_east-west'] = calcTotalsAll('totalShipperPlanning', 'total_exit_east-west')
      totalAllPlanning_['shrinkage_east'] = calcTotalsAll('totalShipperPlanning', 'shrinkage_east')
      totalAllPlanning_['shrinkage_west'] = calcTotalsAll('totalShipperPlanning', 'shrinkage_west')
      totalAllPlanning_['shrinkage_east-west'] = calcTotalsAll('totalShipperPlanning', 'shrinkage_east-west')
      totalAllPlanning_['minInventoryChange_east'] = calcTotalsAll('totalShipperPlanning', 'minInventoryChange_east')
      totalAllPlanning_['minInventoryChange_west'] = calcTotalsAll('totalShipperPlanning', 'minInventoryChange_west')
      totalAllPlanning_['minInventoryChange_east-west'] = calcTotalsAll('totalShipperPlanning', 'minInventoryChange_east-west')
      totalAllPlanning_['park_east'] = calcTotalsAll('totalShipperPlanning', 'park_east')
      totalAllPlanning_['park_west'] = calcTotalsAll('totalShipperPlanning', 'park_west')
      totalAllPlanning_['park_east-west'] = calcTotalsAll('totalShipperPlanning', 'park_east-west')
      totalAllPlanning_['Unpark_east'] = calcTotalsAll('totalShipperPlanning', 'Unpark_east')
      totalAllPlanning_['Unpark_west'] = calcTotalsAll('totalShipperPlanning', 'Unpark_west')
      totalAllPlanning_['Unpark_east-west'] = calcTotalsAll('totalShipperPlanning', 'Unpark_east-west')
      totalAllPlanning_['reserveBal_east'] = calcTotalsAll('totalShipperPlanning', 'reserveBal_east')
      totalAllPlanning_['reserveBal_west'] = calcTotalsAll('totalShipperPlanning', 'reserveBal_west')
      totalAllPlanning_['SodPark_east'] = calcTotalsAll('totalShipperPlanning', 'SodPark_east')
      totalAllPlanning_['SodPark_west'] = calcTotalsAll('totalShipperPlanning', 'SodPark_west')
      totalAllPlanning_['SodPark_east-west'] = calcTotalsAll('totalShipperPlanning', 'SodPark_east-west')
      totalAllPlanning_['EodPark_east'] = calcTotalsAll('totalShipperPlanning', 'EodPark_east')
      totalAllPlanning_['EodPark_west'] = calcTotalsAll('totalShipperPlanning', 'EodPark_west')
      totalAllPlanning_['EodPark_east-west'] = calcTotalsAll('totalShipperPlanning', 'EodPark_east-west')
      // totalAllPlanning_['InstructedFlow_east'] = calcTotalsAll(
      //   'totalShipperPlanning',
      //   'InstructedFlow_east',
      // );
      // totalAllPlanning_['InstructedFlow_west'] = calcTotalsAll(
      //   'totalShipperPlanning',
      //   'InstructedFlow_west',
      // );
      totalAllPlanning_['instructedFlow_east'] = calcTotalsAll('totalShipperPlanning', 'instructedFlow_east')
      totalAllPlanning_['instructedFlow_west'] = calcTotalsAll('totalShipperPlanning', 'instructedFlow_west')
      totalAllPlanning_['instructedFlow_east-west'] = calcTotalsAll('totalShipperPlanning', 'instructedFlow_east-west')
      totalAllPlanning_['detail_entry_east_gsp'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east_gsp')
      totalAllPlanning_['detail_entry_east_bypassGas'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east_bypassGas')
      totalAllPlanning_['detail_entry_east_lng'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east_lng')
      totalAllPlanning_['detail_entry_west_yadana'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_west_yadana')
      totalAllPlanning_['detail_entry_west_yetagun'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_west_yetagun')
      totalAllPlanning_['detail_entry_west_zawtika'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_west_zawtika')
      totalAllPlanning_['detail_entry_east-west_ra6East'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east-west_ra6East')
      totalAllPlanning_['detail_entry_east-west_ra6West'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east-west_ra6West')
      totalAllPlanning_['detail_entry_east-west_ra6Ratio'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east-west_ra6Ratio')
      totalAllPlanning_['detail_entry_east-west_bvw10East'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east-west_bvw10East')
      totalAllPlanning_['detail_entry_east-west_bvw10West'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east-west_bvw10West')
      totalAllPlanning_['detail_entry_east-west_bvw10Ratio'] = calcTotalsAll('totalShipperPlanning', 'detail_entry_east-west_bvw10Ratio')
      totalAllPlanning_['detail_exit_east_egat'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east_egat')
      totalAllPlanning_['detail_exit_east_ipp'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east_ipp')
      totalAllPlanning_['detail_exit_east_spp'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east_spp')
      totalAllPlanning_['detail_exit_east_ind'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east_ind')
      totalAllPlanning_['detail_exit_east_fuel'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east_fuel')
      totalAllPlanning_['detail_exit_west_egat'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_west_egat')
      totalAllPlanning_['detail_exit_west_ipp'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_west_ipp')
      totalAllPlanning_['detail_exit_west_spp'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_west_spp')
      totalAllPlanning_['detail_exit_west_ind'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_west_ind')
      totalAllPlanning_['detail_exit_west_fuel'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_west_fuel')
      totalAllPlanning_['detail_exit_east-west_egat'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east-west_egat')
      totalAllPlanning_['detail_exit_east-west_ipp'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east-west_ipp')
      totalAllPlanning_['detail_exit_east-west_spp'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east-west_spp')
      totalAllPlanning_['detail_exit_east-west_ind'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east-west_ind')
      totalAllPlanning_['detail_exit_east-west_fuel'] = calcTotalsAll('totalShipperPlanning', 'detail_exit_east-west_fuel')
      totalAllPlanning_['minInventory_east'] = calcTotalsAll('totalShipperPlanning', 'minInventory_east')
      totalAllPlanning_['minInventory_west'] = calcTotalsAll('totalShipperPlanning', 'minInventory_west')
      totalAllPlanning_['minInventory_east-west'] = calcTotalsAll('totalShipperPlanning', 'minInventory_east-west')

      let totalAllActual_ = totalAllActual
      totalAllActual_['total_entry_east'] = calcTotalsAll('totalShipperActual', 'total_entry_east')
      totalAllActual_['total_entry_west'] = calcTotalsAll('totalShipperActual', 'total_entry_west')
      totalAllActual_['total_entry_east-west'] = calcTotalsAll('totalShipperActual', 'total_entry_east-west')
      totalAllActual_['total_exit_east'] = calcTotalsAll('totalShipperActual', 'total_exit_east')
      totalAllActual_['total_exit_west'] = calcTotalsAll('totalShipperActual', 'total_exit_west')
      totalAllActual_['total_exit_east-west'] = calcTotalsAll('totalShipperActual', 'total_exit_east-west')
      totalAllActual_['shrinkage_east'] = calcTotalsAll('totalShipperActual', 'shrinkage_east')
      totalAllActual_['shrinkage_west'] = calcTotalsAll('totalShipperActual', 'shrinkage_west')
      totalAllActual_['shrinkage_east-west'] = calcTotalsAll('totalShipperActual', 'shrinkage_east-west')
      totalAllActual_['minInventoryChange_east'] = calcTotalsAll('totalShipperActual', 'minInventoryChange_east')
      totalAllActual_['minInventoryChange_west'] = calcTotalsAll('totalShipperActual', 'minInventoryChange_west')
      totalAllActual_['minInventoryChange_east-west'] = calcTotalsAll('totalShipperActual', 'minInventoryChange_east-west')
      totalAllActual_['park_east'] = calcTotalsAll('totalShipperActual', 'park_east')
      totalAllActual_['park_west'] = calcTotalsAll('totalShipperActual', 'park_west')
      totalAllActual_['park_east-west'] = calcTotalsAll('totalShipperActual', 'park_east-west')
      totalAllActual_['Unpark_east'] = calcTotalsAll('totalShipperActual', 'Unpark_east')
      totalAllActual_['Unpark_west'] = calcTotalsAll('totalShipperActual', 'Unpark_west')
      totalAllActual_['Unpark_east-west'] = calcTotalsAll('totalShipperActual', 'Unpark_east-west')
      totalAllActual_['reserveBal_east'] = calcTotalsAll('totalShipperActual', 'reserveBal_east')
      totalAllActual_['reserveBal_west'] = calcTotalsAll('totalShipperActual', 'reserveBal_west')
      totalAllActual_['SodPark_east'] = calcTotalsAll('totalShipperActual', 'SodPark_east')
      totalAllActual_['SodPark_west'] = calcTotalsAll('totalShipperActual', 'SodPark_west')
      totalAllActual_['SodPark_east-west'] = calcTotalsAll('totalShipperActual', 'SodPark_east-west')
      totalAllActual_['EodPark_east'] = calcTotalsAll('totalShipperActual', 'EodPark_east')
      totalAllActual_['EodPark_west'] = calcTotalsAll('totalShipperActual', 'EodPark_west')
      totalAllActual_['EodPark_east-west'] = calcTotalsAll('totalShipperActual', 'EodPark_east-west')
      // totalAllActual_['InstructedFlow_east'] = calcTotalsAll(
      //   'totalShipperActual',
      //   'InstructedFlow_east',
      // );
      // totalAllActual_['InstructedFlow_west'] = calcTotalsAll(
      //   'totalShipperActual',
      //   'InstructedFlow_west',
      // );
      totalAllActual_['instructedFlow_east'] = calcTotalsAll('totalShipperActual', 'instructedFlow_east')
      totalAllActual_['instructedFlow_west'] = calcTotalsAll('totalShipperActual', 'instructedFlow_west')
      totalAllActual_['instructedFlow_east-west'] = calcTotalsAll('totalShipperActual', 'instructedFlow_east-west')
      totalAllActual_['detail_entry_east_gsp'] = calcTotalsAll('totalShipperActual', 'detail_entry_east_gsp')
      totalAllActual_['detail_entry_east_bypassGas'] = calcTotalsAll('totalShipperActual', 'detail_entry_east_bypassGas')
      totalAllActual_['detail_entry_east_lng'] = calcTotalsAll('totalShipperActual', 'detail_entry_east_lng')
      totalAllActual_['detail_entry_west_yadana'] = calcTotalsAll('totalShipperActual', 'detail_entry_west_yadana')
      totalAllActual_['detail_entry_west_yetagun'] = calcTotalsAll('totalShipperActual', 'detail_entry_west_yetagun')
      totalAllActual_['detail_entry_west_zawtika'] = calcTotalsAll('totalShipperActual', 'detail_entry_west_zawtika')
      totalAllActual_['detail_entry_east-west_ra6East'] = calcTotalsAll('totalShipperActual', 'detail_entry_east-west_ra6East')
      totalAllActual_['detail_entry_east-west_ra6West'] = calcTotalsAll('totalShipperActual', 'detail_entry_east-west_ra6West')
      totalAllActual_['detail_entry_east-west_ra6Ratio'] = calcTotalsAll('totalShipperActual', 'detail_entry_east-west_ra6Ratio')
      totalAllActual_['detail_entry_east-west_bvw10East'] = calcTotalsAll('totalShipperActual', 'detail_entry_east-west_bvw10East')
      totalAllActual_['detail_entry_east-west_bvw10West'] = calcTotalsAll('totalShipperActual', 'detail_entry_east-west_bvw10West')
      totalAllActual_['detail_entry_east-west_bvw10Ratio'] = calcTotalsAll('totalShipperActual', 'detail_entry_east-west_bvw10Ratio')
      totalAllActual_['detail_exit_east_egat'] = calcTotalsAll('totalShipperActual', 'detail_exit_east_egat')
      totalAllActual_['detail_exit_east_ipp'] = calcTotalsAll('totalShipperActual', 'detail_exit_east_ipp')
      totalAllActual_['detail_exit_east_spp'] = calcTotalsAll('totalShipperActual', 'detail_exit_east_spp')
      totalAllActual_['detail_exit_east_ind'] = calcTotalsAll('totalShipperActual', 'detail_exit_east_ind')
      totalAllActual_['detail_exit_east_fuel'] = calcTotalsAll('totalShipperActual', 'detail_exit_east_fuel')
      totalAllActual_['detail_exit_west_egat'] = calcTotalsAll('totalShipperActual', 'detail_exit_west_egat')
      totalAllActual_['detail_exit_west_ipp'] = calcTotalsAll('totalShipperActual', 'detail_exit_west_ipp')
      totalAllActual_['detail_exit_west_spp'] = calcTotalsAll('totalShipperActual', 'detail_exit_west_spp')
      totalAllActual_['detail_exit_west_ind'] = calcTotalsAll('totalShipperActual', 'detail_exit_west_ind')
      totalAllActual_['detail_exit_west_fuel'] = calcTotalsAll('totalShipperActual', 'detail_exit_west_fuel')
      totalAllActual_['detail_exit_east-west_egat'] = calcTotalsAll('totalShipperActual', 'detail_exit_east-west_egat')
      totalAllActual_['detail_exit_east-west_ipp'] = calcTotalsAll('totalShipperActual', 'detail_exit_east-west_ipp')
      totalAllActual_['detail_exit_east-west_spp'] = calcTotalsAll('totalShipperActual', 'detail_exit_east-west_spp')
      totalAllActual_['detail_exit_east-west_ind'] = calcTotalsAll('totalShipperActual', 'detail_exit_east-west_ind')
      totalAllActual_['detail_exit_east-west_fuel'] = calcTotalsAll('totalShipperActual', 'detail_exit_east-west_fuel')
      totalAllActual_['minInventory_east'] = calcTotalsAll('totalShipperActual', 'minInventory_east')
      totalAllActual_['minInventory_west'] = calcTotalsAll('totalShipperActual', 'minInventory_west')
      totalAllActual_['minInventory_east-west'] = calcTotalsAll('totalShipperActual', 'minInventory_east-west')

      return {
        gas_day,
        request_number,
        execute_timestamp,
        request_number_previous_hour,
        request_number_eod,
        shipperData: shipperData_,
        totalAllPlanning: totalAllPlanning_,
        totalAllActual: totalAllActual_,
        ...nE
      }
    })

    return ttfData
  }

  async intradayAccImbalanceInventoryOriginal(payload: any, userId: any) {
    const {gas_day, latest_daily_version, latest_hourly_version, timestamp, skip, limit} = payload

    const gasDayjs = getTodayNowYYYYMMDDDfaultAdd7(gas_day)

    const publicationCenter = await this.prisma.publication_center.findMany({
      where: {
        // del_flag: null,
        gas_day_text: gas_day
      }
    })

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day: gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_acc_imb_inventory',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day: gas_day, // 2025-01-01 to 2025-02-28
        start_hour: 1,
        end_hour: 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_intraday_acc_imb_inventory'
    )
    console.log('evidenApiCenter : ', evidenApiCenter);
    // const newData = (evidenApiCenter?.data || []).filter((evidenData: any) => {
    //   const isDelete = publicationCenter.some((publication: any) => {
    //     return (
    //       publication.gas_day_text === evidenData.gas_day &&
    //       publication.gas_hour === evidenData.gas_hour &&
    //       evidenData.execute_timestamp === publication.execute_timestamp &&
    //       publication.del_flag === true
    //     );
    //   });
    //   return !isDelete;
    // });

    const grouped = {}
    for (const curr of evidenApiCenter?.data ?? []) {
      if(!curr){
        continue;
      }
      const key = `${curr.gas_day}|${curr.gas_hour}|${curr.execute_timestamp}`

      if (!grouped[key]) {
        grouped[key] = {
          gas_day: curr.gas_day,
          gas_hour: curr.gas_hour,
          execute_timestamp: curr.execute_timestamp,
          data: []
        }
      }

      grouped[key].data.push({
        ...curr
      })
    }
    console.log('grouped : ', grouped);

    //   const now = getTodayNowAdd7().toDate(); // หรือใช้ dayjs().toDate()

    // const allRecords = await this.prisma.mode_zone_base_inventory.findMany({
    //   where: {
    //     start_date: {
    //       lte: now, // เริ่มต้นไปแล้ว
    //     },
    //   },
    //   include: {
    //     zone: true,
    //     mode: true,
    //   },
    // });

    // // 🧠 Step 2: group by mode_id แล้วเลือกอันที่ใกล้วันที่ปัจจุบันที่สุด
    // const mode_zone_base_inventory = Object.values(
    //   allRecords.reduce((acc, record) => {
    //     const modeId = record.mode_id;
    //     const currentDiff = Math.abs(new Date(record.start_date).getTime() - now.getTime());

    //     if (!acc[modeId] || currentDiff < Math.abs(new Date(acc[modeId].start_date).getTime() - now.getTime())) {
    //       acc[modeId] = record;
    //     }

    //     return acc;
    //   }, {} as Record<string, typeof allRecords[0]>)
    // );

    const mode_zone_base_inventory = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          lte: gasDayjs.endOf('day').toDate()
        }
      },
      include: {
        zone: true,
        mode: true
      }
    })

    const resultGroup: any = Object.values(grouped)
    function filterLatestByZone(data: any) {
      const grouped = new Map()

      for (const item of data) {
        const key = `${item.zone}`
        const existing = grouped.get(key)

        // ถ้ายังไม่มี หรือ request_number ใหม่กว่า
        if (!existing || item.request_number > existing.request_number) {
          grouped.set(key, item)
        }
      }

      return Array.from(grouped.values())
    }

    let resultGroupZoneLast = await Promise.all(
      resultGroup?.map(async (e: any) => {
        const {data, gas_hour, ...nE} = e
        const filtered = filterLatestByZone(data)
        // const timestamp = getTodayNowAdd7(nE?.['execute_timestamp'] * 1000).format(
        //   'DD/MM/YYYY HH:mm',
        // );

        const gasHour = `${gas_hour > 10 ? gas_hour + ':00' : '0' + gas_hour + ':00'}` || null

        // const timestamp = getTodayNowYYYYMMDDDfaultAdd7(gas_day).format(
        //   `DD/MM/YYYY ${gasHour}`,
        // );

        const formatedTimestamp = getTodayNowAdd7(e['execute_timestamp'] * 1000)
          .tz('Asia/Bangkok')
          .format(`DD/MM/YYYY HH:mm`)
        const gasTime = getTodayNowYYYYMMDDHHmmDfaultAdd7(`${nE?.gas_day} ${gasHour ? gasHour: '00:00'}`)
        const timestamp = gasTime.isValid() ? gasTime.format(`DD/MM/YYYY HH:mm`) : formatedTimestamp
        

        const eastData =
          filtered?.find((f: any) => {
            return f?.zone === 'EAST'
          })?.values || []
        const westData =
          filtered?.find((f: any) => {
            return f?.zone === 'WEST'
          })?.values || []
        const findFn = (data: any, key: any) => {
          const value = data?.find((f: any) => {
            return f?.tag === key
          })?.value
          return value
        }

        const filteredEast = mode_zone_base_inventory?.filter((f: any) => isMatch(f?.zone?.name, 'EAST') && getTodayNowAdd7(f?.start_date).isSameOrBefore(getTodayNowDDMMYYYYHHmmDfaultAdd7(timestamp)))

        const modeZoneEast =
          filteredEast && filteredEast.length > 0
            ? filteredEast.reduce((prev: any, curr: any) => {
                const prevDiff = Math.abs(dayjs(timestamp, 'DD/MM/YYYY HH:mm').diff(dayjs(prev.start_date)))
                const currDiff = Math.abs(dayjs(timestamp, 'DD/MM/YYYY HH:mm').diff(dayjs(curr.start_date)))
                if(currDiff == prevDiff){
                  return dayjs(curr.create_date).isAfter(dayjs(prev.create_date)) ? curr : prev
                }
                return currDiff < prevDiff ? curr : prev
              })
            : null

        const filteredWest = mode_zone_base_inventory?.filter((f: any) => isMatch(f?.zone?.name, 'WEST')&& getTodayNowAdd7(f?.start_date).isSameOrBefore(getTodayNowDDMMYYYYHHmmDfaultAdd7(timestamp)))

        const modeZoneWest =
          filteredWest && filteredWest.length > 0
            ? filteredWest.reduce((prev: any, curr: any) => {
                const prevDiff = Math.abs(dayjs(timestamp, 'DD/MM/YYYY HH:mm').diff(dayjs(prev.start_date)))
                const currDiff = Math.abs(dayjs(timestamp, 'DD/MM/YYYY HH:mm').diff(dayjs(curr.start_date)))
                if(currDiff == prevDiff){
                  return dayjs(curr.create_date).isAfter(dayjs(prev.create_date)) ? curr : prev
                }
                return currDiff < prevDiff ? curr : prev
              })
            : null

        const publication = !publicationCenter.some((publication: any) => {
          return publication.gas_day_text === nE.gas_day && publication.gas_hour === gas_hour && publication.execute_timestamp === nE.execute_timestamp && publication.del_flag === true
        })

        return {
          ...nE,
          publication,
          gasHour: gasHour,
          gas_hour: gas_hour,
          timestamp: timestamp,
          east_totalInv: findFn(eastData, 'totalInv'),
          east_baseInv: findFn(eastData, 'baseInv'),
          east_totalAccImbInv: findFn(eastData, 'totalAccImbInv'),
          east_accImbExculdePTT: findFn(eastData, 'accImbExculdePTT'),
          east_other: findFn(eastData, 'other'),
          east_accImbInvPTT: findFn(eastData, 'accImbInvPTT'),
          east_mode_zone: modeZoneEast?.mode?.mode || null,
          west_totalInv: findFn(westData, 'totalInv'),
          west_baseInv: findFn(westData, 'baseInv'),
          west_totalAccImbInv: findFn(westData, 'totalAccImbInv'),
          west_accImbExculdePTT: findFn(westData, 'accImbExculdePTT'),
          west_other: findFn(westData, 'other'),
          west_accImbInvPTT: findFn(westData, 'accImbInvPTT'),
          west_mode_zone: modeZoneWest?.mode?.mode || null,
          valiedateEast: eastData,
          valiedateWest: westData
          // data: filtered,
        }
      })
    )

    if (timestamp) {
      const filterTimestamp = getTodayNowDDMMYYYYHHmmDfaultAdd7(timestamp)
      if (filterTimestamp.isValid()) {
        resultGroupZoneLast = resultGroupZoneLast.filter((item: any) => {
          const itemTimestamp = getTodayNowAdd7(item.execute_timestamp * 1000)

          return itemTimestamp.isValid() && itemTimestamp.isSame(filterTimestamp, 'minute')
        })
      }
    }

    if (latest_hourly_version) {
      // Group by gas_day_text and gas_hour, then get the latest timestamp for each group
      const groupedByHour = new Map()

      resultGroupZoneLast.forEach((item: any) => {
        const key = `${item.gas_day}_${item.gas_hour ?? item.gasHour}`
        if (!groupedByHour.has(key) || compareTimestamps(item.execute_timestamp, groupedByHour.get(key).execute_timestamp) > 0) {
          groupedByHour.set(key, item)
        }
      })

      resultGroupZoneLast = Array.from(groupedByHour.values())
    }

    if (latest_daily_version) {
      // First, group by gas_day_text, zone_text, and mode to get the latest gas_hour for each group
      const groupedByLatestHour = new Map()
      resultGroupZoneLast.forEach((item: any) => {
        const key = `${item.gas_day}`

        if (!groupedByLatestHour.has(key) || compareGasHour(item.gas_hour ?? item.gasHour, groupedByLatestHour.get(key).gas_hour ?? groupedByLatestHour.get(key).gasHour) > 0) {
          groupedByLatestHour.set(key, item)
        }
      })

      // Then, from the latest gas_hour records, get the latest timestamp for each group
      const groupedByDay = new Map()
      Array.from(groupedByLatestHour.values()).forEach((item: any) => {
        const key = `${item.gas_day}`

        if (!groupedByDay.has(key) || compareTimestamps(item.execute_timestamp, groupedByDay.get(key).execute_timestamp) > 0) {
          groupedByDay.set(key, item)
        }
      })
      resultGroupZoneLast = Array.from(groupedByDay.values())
    }

    return resultGroupZoneLast
  }

  async instructedOperationFlowShippers(payload: any, userId: any) {
    const {gas_day, start_hour, end_hour, last_version, skip, limit} = payload

    const nowCre = getTodayNowAdd7()
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_operation_flow_and_instructed_flow_order',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_operation_flow_and_instructed_flow_order'
    )

    const publicationCenter = await this.prisma.publication_center.findMany({
      where: {
        gas_day_text: gas_day
      }
    })

    // const intradayTimeRaw = await this.prisma.system_parameter.findMany({
    //   where: {
    //     system_parameter_id: {
    //       in: [35, 36, 37]
    //     },
    //     start_date: {
    //       lte: nowCre.toDate(),
    //     },
    //   },
    //   orderBy: {
    //     start_date: 'desc',
    //   },
    // });

    // // Get the latest record for each system_parameter_id
    // const intradayTime = intradayTimeRaw.reduce((acc, record) => {
    //   const paramId = record.system_parameter_id;
    //   if (!acc[paramId] || dayjs(record.start_date).isAfter(dayjs(acc[paramId].start_date))) {
    //     acc[paramId] = record;
    //   }
    //   return acc;
    // }, {});

    // const intradayTimeSystemParameter: any[] = Object.values(intradayTime)

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
      }
    })

    let evidenData = []

    const {isShipper} = await getGroupData(this.prisma, userId)
    if (isShipper) {
      evidenData = (evidenApiCenter?.data ?? []).filter((evidenData: any) => {
        const isDelete = publicationCenter.some((publication: any) => {
          return publication.gas_day_text === evidenData.gas_day && publication.gas_hour === evidenData.gas_hour && evidenData.execute_timestamp === publication.execute_timestamp && publication.del_flag === true
        })
        return !isDelete
      })
    } else {
      evidenData = evidenApiCenter?.data ?? []
    }

    if (last_version == true && evidenData.length > 0) {
      // Group data by gas_day, gas_hour and zone, then get the latest execute_timestamp for each group
      const groupedData = evidenData.reduce((acc: any, item: any) => {
        const key = `${item.gas_day}_${item.gas_hour}_${item.zone}`

        if (!acc[key] || item.execute_timestamp > acc[key].execute_timestamp) {
          acc[key] = item
        }

        return acc
      }, {})

      evidenData = Object.values(groupedData)
    }

    // new Data
    const nEvidenApiCenter = evidenData.map((e: any, ix: number) => {
      const {values, shipper_data, ...nE} = e

      const publication = !publicationCenter.some((publication: any) => {
        return publication.gas_day_text === nE.gas_day && publication.gas_hour === nE.gas_hour && publication.execute_timestamp === nE.execute_timestamp && publication.del_flag === true
      })

      const level = e['level']
      const energyAdjust = values?.find((f: any) => {
        return f?.tag === 'energyAdjust'
      })
      // flow type DD = DIFFICULT DAY FLOW,OFO = OPERATION FLOW,IF = INSTRACTED FLOW
      const flow_type = level === 'DD' ? 'DIFFICULT DAY' : level === 'OFO' ? 'OPERATION FLOW ORDER' : level === 'IF' ? 'INSTRUCTED FLOW' : level

      const zoneObj =
        zoneMaster?.find((f: any) => {
          return f?.name === e['zone']
        }) || null
      // keyData
      const valuesData = {
        timestamp: dayjs(e['execute_timestamp'] * 1000).format('DD/MM/YYYY HH:mm'),
        gas_hour: e && e?.gas_hour && `${e?.gas_hour > 10 ? e?.gas_hour + ':00' : '0' + e?.gas_hour + ':00'}`,
        shipperName: null,
        zone: e['zone'],
        zoneObj: zoneObj,
        accImb_or_accImbInv:
          values?.find((f: any) => {
            return f?.tag === 'accImb_or_accImbInv'
          })?.value || null,
        accMargin:
          values?.find((f: any) => {
            return f?.tag === 'accMargin'
          })?.value || null,
        flow_type: flow_type,
        energyAdjust:
          values?.find((f: any) => {
            return f?.tag === 'energyAdjust'
          })?.value || null,
        // energyAdjust: energyAdjust?.value > 0 ? 0 : energyAdjust?.value || null, //
        energyAdjustRate_mmbtuh:
          values?.find((f: any) => {
            return f?.tag === 'energyAdjustRate_mmbtuh'
          })?.value || null,
        energyAdjustRate_mmbtud:
          values?.find((f: any) => {
            return f?.tag === 'energyAdjustRate_mmbtud'
          })?.value || null,
        volumeAdjust:
          values?.find((f: any) => {
            return f?.tag === 'volumeAdjust'
          })?.value || null,
        volumeAdjustRate_mmscfh:
          values?.find((f: any) => {
            return f?.tag === 'volumeAdjustRate_mmscfh'
          })?.value || null,
        volumeAdjustRate_mmscfd:
          values?.find((f: any) => {
            return f?.tag === 'volumeAdjustRate_mmscfd'
          })?.value || null,
        resolveHour:
          values?.find((f: any) => {
            return f?.tag === 'resolveHour'
          })?.value || null,
        // (
        //   (level == 'DD' || level == 'OFO' || level == 'IF' || level == 'DIFFICULT DAY FLOW' || level == 'OPERATION FLOW' || level == 'INSTRUCTED FLOW')
        //   ?
        //   intradayTimeSystemParameter.find((f: any) => f?.system_parameter_id === 35)?.value || null
        //   :
        //   null
        // )
        heatingValue:
          values?.find((f: any) => {
            return f?.tag === 'heatingValue'
          })?.value || null,
        file: [],
        comment: [],
        publication: null
      }

      let signConsistentData = []
      switch (level.toUpperCase()) {
        case 'DD':
        case 'DIFFICULT DAY FLOW':
        case 'DIFFICULT DAY':
        case 'OFO':
        case 'OPERATION FLOW':
        case 'OPERATION FLOW ORDER':
        case 'IF':
        case 'INSTRUCTED FLOW':
          if (energyAdjust?.value) {
            signConsistentData = shipper_data?.filter((sd: any) => {
              const {values: valuesShipper} = sd
              const energyAdjustShipper =
                valuesShipper?.find((f: any) => {
                  return f?.tag === 'energyAdjust'
                })?.value || null

              if (energyAdjustShipper) {
                if (energyAdjust?.value < 0) {
                  return energyAdjustShipper < 0
                } else {
                  return energyAdjustShipper >= 0
                }
              } else {
                return true
              }
            })
          } else {
            signConsistentData = shipper_data
          }
          break
        default:
          signConsistentData = shipper_data
          break
      }

      const shipperData = signConsistentData.map((sd: any) => {
        const {values: valuesShipper, shipper, ...nSd} = sd

        return {
          timestamp: dayjs(e['execute_timestamp'] * 1000).format('DD/MM/YYYY HH:mm'),
          gas_hour: e && e?.gas_hour && `${e?.gas_hour > 10 ? e?.gas_hour + ':00' : '0' + e?.gas_hour + ':00'}`,
          shipperName: shipper,
          zone: e['zone'],
          zoneObj: zoneObj,
          accImb_or_accImbInv:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'accImb_or_accImbInv'
            })?.value || null,
          accMargin:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'accMargin'
            })?.value || null,
          flow_type: flow_type, // flow type DD = DIFFICULT DAY FLOW,OFO = OPERATION FLOW,IF = INSTRACTED FLOW
          // energyAdjust:
          //   energyAdjust?.value > 0 ? 0 : energyAdjust?.value || null, //
          energyAdjust:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'energyAdjust'
            })?.value || null,
          energyAdjustRate_mmbtuh:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'energyAdjustRate_mmbtuh'
            })?.value || null,
          energyAdjustRate_mmbtud:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'energyAdjustRate_mmbtud'
            })?.value || null,
          volumeAdjust:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'volumeAdjust'
            })?.value || null,
          volumeAdjustRate_mmscfh:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'volumeAdjustRate_mmscfh'
            })?.value || null,
          volumeAdjustRate_mmscfd:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'volumeAdjustRate_mmscfd'
            })?.value || null,
          resolveHour:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'resolveHour'
            })?.value || null,
          heatingValue:
            valuesShipper?.find((f: any) => {
              return f?.tag === 'heatingValue'
            })?.value || null,
          file: [],
          comment: [],
          publication
        }
      })

      return {
        ...nE,
        valuesData,
        shipperData
      }
    })

    let operation_flow_and_instructed_flow = await this.prisma.operation_flow_and_instructed_flow.findMany({
      where: {},
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            account_manage: {
              select: {
                group: {
                  include: {
                    user_type: true
                  }
                }
              }
            }
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            account_manage: {
              select: {
                group: {
                  include: {
                    user_type: true
                  }
                }
              }
            }
          }
        }
      }
    })

    let greenData = []
    let greenDataUpdate = []
    for (let i = 0; i < nEvidenApiCenter.length; i++) {
      let isFilterSignConsistent = false
      switch (nEvidenApiCenter[i]?.level.toUpperCase()) {
        case 'DD':
        case 'DIFFICULT DAY FLOW':
        case 'DIFFICULT DAY':
        case 'OFO':
        case 'OPERATION FLOW':
        case 'OPERATION FLOW ORDER':
        case 'IF':
        case 'INSTRUCTED FLOW':
          if (nEvidenApiCenter[i]?.valuesData?.energyAdjust) {
            isFilterSignConsistent = true
          } else {
            isFilterSignConsistent = false
          }
          break
        default:
          isFilterSignConsistent = false
          break
      }
      const findData = operation_flow_and_instructed_flow?.find((f: any) => {
        return f?.gas_day === nEvidenApiCenter[i]?.gas_day && f?.gas_hour === nEvidenApiCenter[i]?.gas_hour && f?.zone === nEvidenApiCenter[i]?.zone && f?.shipper === nEvidenApiCenter[i]?.valuesData?.shipperName
      })
      // green
      if (findData) {
        const createDate = dayjs(findData?.execute_timestamp * 1000) // แปลงจาก timestamp
        const executeTimestamp = dayjs(nEvidenApiCenter[i]?.execute_timestamp * 1000) // แปลงจาก timestamp
        const isExecuteNewer = executeTimestamp.isAfter(createDate)
        // update
        // check date
        if (isExecuteNewer) {
          greenDataUpdate.push({
            id: findData?.id,
            execute_timestamp: nEvidenApiCenter[i]?.execute_timestamp,
            gas_day: nEvidenApiCenter[i]?.gas_day,
            gas_day_date: getTodayNowYYYYMMDDDfaultAdd7(nEvidenApiCenter[i]?.gas_day).toDate(),
            gas_hour: nEvidenApiCenter[i]?.gas_hour,
            shipper: nEvidenApiCenter[i]?.valuesData?.shipperName,
            zone: nEvidenApiCenter[i]?.zone,
            accImb_or_accImbInv: (nEvidenApiCenter[i]?.valuesData?.accImb_or_accImbInv && String(nEvidenApiCenter[i]?.valuesData?.accImb_or_accImbInv)) || null,
            accMargin: (nEvidenApiCenter[i]?.valuesData?.accMargin && String(nEvidenApiCenter[i]?.valuesData?.accMargin)) || null,
            level: (nEvidenApiCenter[i]?.level && String(nEvidenApiCenter[i]?.level)) || null,
            energyAdjust: (nEvidenApiCenter[i]?.valuesData?.energyAdjust && String(nEvidenApiCenter[i]?.valuesData?.energyAdjust)) || null,
            energyAdjustRate_mmbtuh: (nEvidenApiCenter[i]?.valuesData?.energyAdjustRate_mmbtuh && String(nEvidenApiCenter[i]?.valuesData?.energyAdjustRate_mmbtuh)) || null,
            energyAdjustRate_mmbtud: (nEvidenApiCenter[i]?.valuesData?.energyAdjustRate_mmbtud && String(nEvidenApiCenter[i]?.valuesData?.energyAdjustRate_mmbtud)) || null,
            volumeAdjust: (nEvidenApiCenter[i]?.valuesData?.volumeAdjust && String(nEvidenApiCenter[i]?.valuesData?.volumeAdjust)) || null,
            volumeAdjustRate_mmscfh: (nEvidenApiCenter[i]?.valuesData?.volumeAdjustRate_mmscfh && String(nEvidenApiCenter[i]?.valuesData?.volumeAdjustRate_mmscfh)) || null,
            volumeAdjustRate_mmscfd: (nEvidenApiCenter[i]?.valuesData?.volumeAdjustRate_mmscfd && String(nEvidenApiCenter[i]?.valuesData?.volumeAdjustRate_mmscfd)) || null,
            resolveHour: (nEvidenApiCenter[i]?.valuesData?.resolveHour && String(nEvidenApiCenter[i]?.valuesData?.resolveHour)) || null,
            heatingValue: (nEvidenApiCenter[i]?.valuesData?.heatingValue && String(nEvidenApiCenter[i]?.valuesData?.heatingValue)) || null,
            update_by: Number(userId),
            update_date: nowCre.toDate(),
            update_date_num: nowCre.unix()
          })
        }
      } else {
        // create
        greenData.push({
          execute_timestamp: nEvidenApiCenter[i]?.execute_timestamp,
          gas_day: nEvidenApiCenter[i]?.gas_day,
          gas_day_date: getTodayNowYYYYMMDDDfaultAdd7(nEvidenApiCenter[i]?.gas_day).toDate(),
          gas_hour: nEvidenApiCenter[i]?.gas_hour,
          shipper: nEvidenApiCenter[i]?.valuesData?.shipperName,
          zone: nEvidenApiCenter[i]?.zone,
          accImb_or_accImbInv: (nEvidenApiCenter[i]?.valuesData?.accImb_or_accImbInv && String(nEvidenApiCenter[i]?.valuesData?.accImb_or_accImbInv)) || null,
          accMargin: (nEvidenApiCenter[i]?.valuesData?.accMargin && String(nEvidenApiCenter[i]?.valuesData?.accMargin)) || null,
          level: (nEvidenApiCenter[i]?.level && String(nEvidenApiCenter[i]?.level)) || null,
          energyAdjust: (nEvidenApiCenter[i]?.valuesData?.energyAdjust && String(nEvidenApiCenter[i]?.valuesData?.energyAdjust)) || null,
          energyAdjustRate_mmbtuh: (nEvidenApiCenter[i]?.valuesData?.energyAdjustRate_mmbtuh && String(nEvidenApiCenter[i]?.valuesData?.energyAdjustRate_mmbtuh)) || null,
          energyAdjustRate_mmbtud: (nEvidenApiCenter[i]?.valuesData?.energyAdjustRate_mmbtud && String(nEvidenApiCenter[i]?.valuesData?.energyAdjustRate_mmbtud)) || null,
          volumeAdjust: (nEvidenApiCenter[i]?.valuesData?.volumeAdjust && String(nEvidenApiCenter[i]?.valuesData?.volumeAdjust)) || null,
          volumeAdjustRate_mmscfh: (nEvidenApiCenter[i]?.valuesData?.volumeAdjustRate_mmscfh && String(nEvidenApiCenter[i]?.valuesData?.volumeAdjustRate_mmscfh)) || null,
          volumeAdjustRate_mmscfd: (nEvidenApiCenter[i]?.valuesData?.volumeAdjustRate_mmscfd && String(nEvidenApiCenter[i]?.valuesData?.volumeAdjustRate_mmscfd)) || null,
          resolveHour: (nEvidenApiCenter[i]?.valuesData?.resolveHour && String(nEvidenApiCenter[i]?.valuesData?.resolveHour)) || null,
          heatingValue: (nEvidenApiCenter[i]?.valuesData?.heatingValue && String(nEvidenApiCenter[i]?.valuesData?.heatingValue)) || null,
          create_by: Number(userId),
          create_date: nowCre.toDate(),
          create_date_num: nowCre.unix()
        })
      }

      for (let iSd = 0; iSd < nEvidenApiCenter[i]?.shipperData.length; iSd++) {
        const findDataShipper = operation_flow_and_instructed_flow?.find((f: any) => {
          let isSignConsistent = true
          if (isFilterSignConsistent) {
            if (f?.energyAdjust) {
              if (nEvidenApiCenter[i]?.valuesData?.energyAdjust?.value < 0) {
                isSignConsistent = f?.energyAdjust < 0
              } else {
                isSignConsistent = f?.energyAdjust >= 0
              }
            } else {
              isSignConsistent = true
            }
          }

          return f?.gas_day === nEvidenApiCenter[i]?.gas_day && f?.gas_hour === nEvidenApiCenter[i]?.gas_hour && f?.zone === nEvidenApiCenter[i]?.zone && f?.shipper === nEvidenApiCenter[i]?.shipperData[iSd]?.shipperName && f?.execute_timestamp === nEvidenApiCenter[i]?.execute_timestamp && isSignConsistent
        })
        if (findDataShipper) {
          const createDate = dayjs(findDataShipper?.execute_timestamp * 1000) // แปลงจาก timestamp
          const executeTimestamp = dayjs(nEvidenApiCenter[i]?.execute_timestamp * 1000) // แปลงจาก timestamp
          const isExecuteNewer = executeTimestamp.isAfter(createDate)
          // update
          // check date
          if (isExecuteNewer) {
            greenDataUpdate.push({
              id: findDataShipper?.id,
              execute_timestamp: nEvidenApiCenter[i]?.execute_timestamp,
              gas_day: nEvidenApiCenter[i]?.gas_day,
              gas_day_date: getTodayNowYYYYMMDDDfaultAdd7(nEvidenApiCenter[i]?.gas_day).toDate(),
              gas_hour: nEvidenApiCenter[i]?.gas_hour,
              shipper: nEvidenApiCenter[i]?.shipperData[iSd]?.shipperName,
              zone: nEvidenApiCenter[i]?.zone,
              accImb_or_accImbInv: (nEvidenApiCenter[i]?.shipperData[iSd]?.accImb_or_accImbInv && String(nEvidenApiCenter[i]?.shipperData[iSd]?.accImb_or_accImbInv)) || null,
              accMargin: (nEvidenApiCenter[i]?.shipperData[iSd]?.accMargin && String(nEvidenApiCenter[i]?.shipperData[iSd]?.accMargin)) || null,
              level: (nEvidenApiCenter[i]?.level && String(nEvidenApiCenter[i]?.level)) || null,
              energyAdjust: (nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjust && String(nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjust)) || null,
              energyAdjustRate_mmbtuh: (nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjustRate_mmbtuh && String(nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjustRate_mmbtuh)) || null,
              energyAdjustRate_mmbtud: (nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjustRate_mmbtud && String(nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjustRate_mmbtud)) || null,
              volumeAdjust: (nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjust && String(nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjust)) || null,
              volumeAdjustRate_mmscfh: (nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjustRate_mmscfh && String(nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjustRate_mmscfh)) || null,
              volumeAdjustRate_mmscfd: (nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjustRate_mmscfd && String(nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjustRate_mmscfd)) || null,
              resolveHour: (nEvidenApiCenter[i]?.shipperData[iSd]?.resolveHour && String(nEvidenApiCenter[i]?.shipperData[iSd]?.resolveHour)) || null,
              heatingValue: (nEvidenApiCenter[i]?.shipperData[iSd]?.heatingValue && String(nEvidenApiCenter[i]?.shipperData[iSd]?.heatingValue)) || null,
              update_by: Number(userId),
              update_date: nowCre.toDate(),
              update_date_num: nowCre.unix()
            })
          }
        } else {
          // create
          greenData.push({
            execute_timestamp: nEvidenApiCenter[i]?.execute_timestamp,
            gas_day: nEvidenApiCenter[i]?.gas_day,
            gas_day_date: getTodayNowYYYYMMDDDfaultAdd7(nEvidenApiCenter[i]?.gas_day).toDate(),
            gas_hour: nEvidenApiCenter[i]?.gas_hour,
            shipper: nEvidenApiCenter[i]?.shipperData[iSd]?.shipperName,
            zone: nEvidenApiCenter[i]?.zone,
            accImb_or_accImbInv: (nEvidenApiCenter[i]?.shipperData[iSd]?.accImb_or_accImbInv && String(nEvidenApiCenter[i]?.shipperData[iSd]?.accImb_or_accImbInv)) || null,
            accMargin: (nEvidenApiCenter[i]?.shipperData[iSd]?.accMargin && String(nEvidenApiCenter[i]?.shipperData[iSd]?.accMargin)) || null,
            level: (nEvidenApiCenter[i]?.level && String(nEvidenApiCenter[i]?.level)) || null,
            energyAdjust: (nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjust && String(nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjust)) || null,
            energyAdjustRate_mmbtuh: (nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjustRate_mmbtuh && String(nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjustRate_mmbtuh)) || null,
            energyAdjustRate_mmbtud: (nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjustRate_mmbtud && String(nEvidenApiCenter[i]?.shipperData[iSd]?.energyAdjustRate_mmbtud)) || null,
            volumeAdjust: (nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjust && String(nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjust)) || null,
            volumeAdjustRate_mmscfh: (nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjustRate_mmscfh && String(nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjustRate_mmscfh)) || null,
            volumeAdjustRate_mmscfd: (nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjustRate_mmscfd && String(nEvidenApiCenter[i]?.shipperData[iSd]?.volumeAdjustRate_mmscfd)) || null,
            resolveHour: (nEvidenApiCenter[i]?.shipperData[iSd]?.resolveHour && String(nEvidenApiCenter[i]?.shipperData[iSd]?.resolveHour)) || null,
            heatingValue: (nEvidenApiCenter[i]?.shipperData[iSd]?.heatingValue && String(nEvidenApiCenter[i]?.shipperData[iSd]?.heatingValue)) || null,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
      }
    }

    const filteredGreenData: any = Object.values(
      greenData.reduce((acc, item) => {
        const key = `${item.gas_day}-${item.gas_hour}-${item.shipper ?? 'null'}-${item.zone}`
        if (!acc[key] || item.execute_timestamp > acc[key].execute_timestamp) {
          // acc[key] = item;
          if (!acc[key] || item.request_number > acc[key].request_number) {
            acc[key] = item
          }
        }
        return acc
      }, {})
    )
    if (filteredGreenData.length > 0) {
      const createdGreenData = await this.prisma.operation_flow_and_instructed_flow.createMany({
        data: filteredGreenData,
        skipDuplicates: true // 🔥
      })
    }
    const filteredgreenDataUpdate: any = Object.values(
      greenDataUpdate.reduce((acc, item) => {
        const key = `${item.gas_day}-${item.gas_hour}-${item.shipper ?? 'null'}-${item.zone}`
        if (!acc[key] || item.execute_timestamp > acc[key].execute_timestamp) {
          // acc[key] = item;
          if (!acc[key] || item.request_number > acc[key].request_number) {
            acc[key] = item
          }
        }
        return acc
      }, {})
    )
    if (filteredgreenDataUpdate.length > 0) {
      for (let i = 0; i < filteredgreenDataUpdate.length; i++) {
        const {id, ...nShipperData} = filteredgreenDataUpdate[i]
        const updatedGreenData = await this.prisma.operation_flow_and_instructed_flow.updateMany({
          where: {
            id: id
          },
          data: nShipperData
        })
      }
    }

    operation_flow_and_instructed_flow = await this.prisma.operation_flow_and_instructed_flow.findMany({
      where: {},
      include: {
        operation_flow_and_instructed_flow_comment: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                account_manage: {
                  select: {
                    group: {
                      include: {
                        user_type: true
                      }
                    }
                  }
                }
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                account_manage: {
                  select: {
                    group: {
                      include: {
                        user_type: true
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
        },
        operation_flow_and_instructed_flow_file: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                account_manage: {
                  select: {
                    group: {
                      include: {
                        user_type: true
                      }
                    }
                  }
                }
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                account_manage: {
                  select: {
                    group: {
                      include: {
                        user_type: true
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
        },
        // file
        // comment
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            account_manage: {
              select: {
                group: {
                  include: {
                    user_type: true
                  }
                }
              }
            }
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            account_manage: {
              select: {
                group: {
                  include: {
                    user_type: true
                  }
                }
              }
            }
          }
        }
      }
    })

    const nnEvidenApiCenter = nEvidenApiCenter?.map((e: any) => {
      const findData = operation_flow_and_instructed_flow?.find((f: any) => {
        return f?.gas_day === e?.gas_day && f?.gas_hour === e?.gas_hour && f?.zone === e?.zone && f?.shipper === e?.valuesData?.shipperName
      })

      const {shipperData, valuesData, ...nE} = e
      const nshipperData = shipperData?.map((sd: any) => {
        const {file, comment, accImb_or_accImbInv, accMargin, energyAdjust, energyAdjustRate_mmbtud, energyAdjustRate_mmbtuh, flow_type, heatingValue, resolveHour, volumeAdjust, volumeAdjustRate_mmscfd, volumeAdjustRate_mmscfh, ...nSd} = sd
        const findDataShipper: any = operation_flow_and_instructed_flow?.find((f: any) => {
          return f?.gas_day === e?.gas_day && f?.gas_hour === e?.gas_hour && f?.zone === e?.zone && f?.shipper === sd?.shipperName && f?.execute_timestamp === e?.execute_timestamp
        })
        // operation_flow_and_instructed_flow_file

        // // flow type DD = DIFFICULT DAY FLOW,OFO = OPERATION FLOW,IF = INSTRACTED FLOW
        // OPERATION FLOW
        // OFO

        const dbEdit = !!findDataShipper
          ? {
              accImb_or_accImbInv: findDataShipper?.accImb_or_accImbInv,
              accMargin: findDataShipper?.accMargin,
              energyAdjust: findDataShipper?.energyAdjust,
              energyAdjustRate_mmbtud: findDataShipper?.energyAdjustRate_mmbtud,
              energyAdjustRate_mmbtuh: findDataShipper?.energyAdjustRate_mmbtuh,
              flow_type: findDataShipper?.level === 'DD' ? 'DIFFICULT DAY' : findDataShipper?.level === 'OFO' ? 'OPERATION FLOW ORDER' : findDataShipper?.level === 'IF' ? 'INSTRUCTED FLOW' : findDataShipper?.level,
              heatingValue: findDataShipper?.heatingValue,
              resolveHour: findDataShipper?.resolveHour,
              volumeAdjust: findDataShipper?.volumeAdjust,
              volumeAdjustRate_mmscfd: findDataShipper?.volumeAdjustRate_mmscfd,
              volumeAdjustRate_mmscfh: findDataShipper?.volumeAdjustRate_mmscfh
            }
          : {
              accImb_or_accImbInv,
              accMargin,
              energyAdjust,
              energyAdjustRate_mmbtud,
              energyAdjustRate_mmbtuh,
              flow_type,
              heatingValue,
              resolveHour,
              volumeAdjust,
              volumeAdjustRate_mmscfd,
              volumeAdjustRate_mmscfh
            }

        return {
          id: findDataShipper?.id || null,
          ...nSd,
          ...dbEdit,
          file: findDataShipper?.operation_flow_and_instructed_flow_file?.map((fc: any) => {
            const {create_by_account, update_by_account, ...mFc} = fc
            const {account_manage, ...ncreate_by_account} = create_by_account
            return {
              ...mFc,
              create_by_account: {
                ...ncreate_by_account,
                userType: account_manage?.[0]?.group?.user_type || null
              },
              update_by_account:
                (update_by_account && {
                  ...update_by_account,
                  userType: update_by_account?.account_manage?.[0]?.group?.user_type || null
                }) ||
                null
            }
          }),
          comment: findDataShipper?.operation_flow_and_instructed_flow_comment?.map((fc: any) => {
            const {create_by_account, update_by_account, ...mFc} = fc
            const {account_manage, ...ncreate_by_account} = create_by_account
            return {
              ...mFc,
              create_by_account: {
                ...ncreate_by_account,
                userType: account_manage?.[0]?.group?.user_type || null
              },
              update_by_account:
                (update_by_account && {
                  ...update_by_account,
                  userType: update_by_account?.account_manage?.[0]?.group?.user_type || null
                }) ||
                null
            }
          })
        }
      })

      // const sumGreen = {
      //   ...valuesData,
      //   accImb_or_accImbInv:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['accImb_or_accImbInv'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   accMargin:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['accMargin'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   energyAdjust:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['energyAdjust'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   energyAdjustRate_mmbtud:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['energyAdjustRate_mmbtud'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   energyAdjustRate_mmbtuh:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['energyAdjustRate_mmbtuh'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   heatingValue:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['heatingValue'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   resolveHour:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['resolveHour'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   volumeAdjust:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['volumeAdjust'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   volumeAdjustRate_mmscfd:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['volumeAdjustRate_mmscfd'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      //   volumeAdjustRate_mmscfh:
      //     nshipperData.reduce((sum, item) => {
      //       const value = Number(item['volumeAdjustRate_mmscfh'] ?? 0);
      //       return sum + value;
      //     }, 0) || 0,
      // };
      // // valuesData

      return {
        id: findData?.id || null,
        shipperData: nshipperData,
        // valuesData: sumGreen,
        valuesData,
        ...nE
      }
    })

    const groupMasterCheck = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      }
    })

    const shipperIdName = groupMasterCheck?.id_name
    const userType = groupMasterCheck?.user_type_id
    if (userType === 3) {
      let cutShipper = []
      for (let i = 0; i < nnEvidenApiCenter.length; i++) {
        let shipperArr = []
        const {shipperData, valuesData, ...nNewDataNewData} = nnEvidenApiCenter[i]

        for (let iShipper = 0; iShipper < shipperData.length; iShipper++) {
          const {shipperName} = shipperData[iShipper]
          if (shipperName === shipperIdName) {
            shipperArr.push({
              ...shipperData[iShipper]
            })
          }
        }
        if (shipperArr.length > 0) {
          cutShipper.push({
            ...nNewDataNewData,
            shipperData: shipperArr
          })
        }
      }

      return cutShipper
    } else {
      return nnEvidenApiCenter
    }
  }

  //  await this.uploadTemplateForShipperService.writeReq(
  //     req,
  //     `upload-template-for-shipper`,
  //     message, //create | edit
  //     his,
  //   );

  async instructedOperationFlowShippersUpload(file: any, userId: any, id: any) {
    // const { comment } = payload;
    const idS = Number(id)

    const uploadResponse = await uploadFilsTemp({
      buffer: file?.buffer,
      originalname: `${file?.originalname}`
    })

    await this.prisma.operation_flow_and_instructed_flow_file.create({
      data: {
        operation_flow_and_instructed_flow: {
          connect: {
            id: Number(idS)
          }
        },
        url: uploadResponse?.file?.url,
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      }
    })

    return uploadResponse

    // await this.prisma.upload_template_for_shipper_comment.create({
    //         data: {
    //           ...(!!uploadTemplateId?.id && {
    //             upload_template_for_shipper: {
    //               connect: {
    //                 id: Number(uploadTemplateId?.id),
    //               },
    //             },
    //           }),
    //           comment: comment,
    //           create_date: getTodayNowAdd7().toDate(),
    //           create_date_num: getTodayNowAdd7().unix(),
    //           create_by_account: {
    //             connect: {
    //               id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
    //             },
    //           },
    //         },
    //       });
  }

  async instructedOperationFlowShippersComment(payload: any, id: any, userId: any) {
    const idS = Number(id)
    const {comment, comment_tap_user_type} = payload

    const comments = await this.prisma.operation_flow_and_instructed_flow_comment.create({
      data: {
        operation_flow_and_instructed_flow: {
          connect: {
            id: Number(idS)
          }
        },
        comment: comment,
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        },
        comment_tap_user_type: comment_tap_user_type
      }
    })

    return comments
  }

  async instructedOperationFlowShippersEdit(payload: any, id: any, userId: any) {
    const idS = Number(id)
    const {accImb_or_accImbInv, accMargin, flow_type, energyAdjust, energyAdjustRate_mmbtuh, energyAdjustRate_mmbtud, volumeAdjust, volumeAdjustRate_mmscfh, volumeAdjustRate_mmscfd, resolveHour, heatingValue} = payload

    const edit = await this.prisma.operation_flow_and_instructed_flow.updateMany({
      where: {
        id: Number(idS)
      },
      data: {
        accImb_or_accImbInv,
        accMargin,
        level: flow_type,
        energyAdjust,
        energyAdjustRate_mmbtuh,
        energyAdjustRate_mmbtud,
        volumeAdjust,
        volumeAdjustRate_mmscfh,
        volumeAdjustRate_mmscfd,
        resolveHour,
        heatingValue,
        update_date: getTodayNowAdd7().toDate(),
        update_date_num: getTodayNowAdd7().unix(),
        update_by: Number(userId)
      }
    })

    return edit
  }

  async instructedOperationFlowShippersOnce(id: any) {
    const idS = Number(id)
    const resData = await this.prisma.operation_flow_and_instructed_flow.findFirst({
      where: {
        id: idS
      },
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            account_manage: {
              select: {
                group: {
                  include: {
                    user_type: true
                  }
                }
              }
            }
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            account_manage: {
              select: {
                group: {
                  include: {
                    user_type: true
                  }
                }
              }
            }
          }
        },
        operation_flow_and_instructed_flow_comment: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                account_manage: {
                  select: {
                    group: {
                      include: {
                        user_type: true
                      }
                    }
                  }
                }
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                account_manage: {
                  select: {
                    group: {
                      include: {
                        user_type: true
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
        },
        operation_flow_and_instructed_flow_file: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                account_manage: {
                  select: {
                    group: {
                      include: {
                        user_type: true
                      }
                    }
                  }
                }
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                account_manage: {
                  select: {
                    group: {
                      include: {
                        user_type: true
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
        }
        // file
        // comment
      }
    })

    return {
      ...resData,
      timestamp: dayjs(resData['execute_timestamp'] * 1000).format('DD/MM/YYYY HH:mm'),
      gas_hours: resData && resData?.gas_hour && `${resData?.gas_hour > 10 ? resData?.gas_hour + ':00' : '0' + resData?.gas_hour + ':00'}`
    }
  }

  // detail_entry_east-west_ra6Ratio
  // plan_
  async balanceIntradayDashboard(payload: any, userId: any) {
    const {gas_day, skip, limit, shipper_id, execute_timestamp, lasted_version} = payload
    console.log('shipper_id : ', shipper_id);

    const todayStart = getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
    const todayEnd = getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
    const publicationCenter = await this.prisma.publication_center.findMany({
      where: {
        gas_day_text: gas_day
      }
    })

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: todayStart,
          lte: todayEnd
        }
      }
    })

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_dashboard',
      (total_record: number) => {
        totalRecord = total_record
      }
    )

    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_intraday_dashboard'
    )

    const matchWithExecuteList = (evidenApiCenter?.data ?? []).filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day') && executeData.gas_hour == item.gas_hour
      })
    })

    const publishData = matchWithExecuteList.filter((evidenData: any) => {
      return !publicationCenter.some((publication: any) => {
        return publication.gas_day_text === evidenData.gas_day && publication.gas_hour === evidenData.gas_hour && evidenData.execute_timestamp === publication.execute_timestamp && publication.del_flag === true
      })
    })

    // Get the latest execute_timestamp for each unique combination of gas_day, gas_hour, zone, and mode
    const dataEvuent = publishData.reduce((acc: any[], current: any) => {
      // const key = `${current.gas_day}_${current.gas_hour}_${current.zone}_${current.mode}`;
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, [])

    const grouped: any = Object.values(
      dataEvuent?.reduce((acc, item, index) => {
        const key = `${item?.gas_day}|${item?.gas_hour}|${item?.execute_timestamp}`
        if (!acc[key]) {
          acc[key] = {
            gas_day: item?.gas_day,
            gas_hour: item?.gas_hour,
            execute_timestamp: item?.execute_timestamp,
            data: []
          }
        }
        acc[key].data.push(item)
        return acc
      }, {})
    )

    const nGrouped = grouped?.map((e: any) => {
      let plan = []
      let actual = []
      let sys_plan = []
      let sys_actual = []

      let shipperSystemCheck:any = null

      if (shipper_id) {
        const findShipper = e?.data?.[0]?.shipper_data?.find((f: any) => {
          return f?.shipper === shipper_id
        })
        // https://app.clickup.com/t/9018502823/86ey4nae3
        // https://app.clickup.com/t/9018502823/86ey4naef

        // Acc. Imbalance (Meter) (MMBTU)
        // accImb_east
        // accImb_west

        // Acc. Imbalance (Inventory) (MMBTU)
        // accImbInv_east
        // accImbInv_west

        // Order (East)
        // MMBTU energyAdjustIFOFO_east?.value
        // MMSCF volumeAdjustIFOFO_east?.value

        // Order (West)
        // MMBTU energyAdjustIFOFO_west?.value
        // MMSCF volumeAdjustIFOFO_west?.value

        const hasPTT = shipper_id?.trim().toLowerCase() === 'ngp-s16-001';
        const checkPMN = (pnm:any) => {
          if (!pnm && pnm !== 0) return null;
          return Number(pnm) >= 0;
        }
        // const checkPMNMatch = (pnmMatch:any, pttCheck_:any, valueCheck:any, shipperDataArr:any) => {

        //   if(pnmMatch?.tag === "energyAdjustIFOFO_east" || pnmMatch?.tag === "volumeAdjustIFOFO_east"){
        //     if(pttCheck_){
        //       const shipperCheck_ = checkPMN(shipperDataArr?.find((f:any) => f?.tag === "accImbInv_east")?.value)
        //       return {
        //         ...pnmMatch,
        //         value: valueCheck?.accImbInv_east === null ? null : (shipperCheck_ === valueCheck?.accImbInv_east ? pnmMatch?.value : null)
        //       }
        //     }else{
        //       const shipperCheck_ = checkPMN(shipperDataArr?.find((f:any) => f?.tag === "accImb_east")?.value)
        //       return {
        //         ...pnmMatch,
        //         value: valueCheck?.accImb_east === null ? null : (shipperCheck_ === valueCheck?.accImb_east ? pnmMatch?.value : null)
        //       }
        //     }
        //   }else if(pnmMatch?.tag === "energyAdjustIFOFO_west" || pnmMatch?.tag === "volumeAdjustIFOFO_west"){
        //     if(pttCheck_){
        //       const shipperCheck_ = checkPMN(shipperDataArr?.find((f:any) => f?.tag === "accImbInv_west")?.value)
        //       return {
        //         ...pnmMatch,
        //         value: valueCheck?.accImbInv_west === null ? null : (shipperCheck_ === valueCheck?.accImbInv_west ? pnmMatch?.value : null)
        //       }
        //     }else{
        //       const shipperCheck_ = checkPMN(shipperDataArr?.find((f:any) => f?.tag === "accImb_west")?.value)
        //       return {
        //         ...pnmMatch,
        //         value: valueCheck?.accImb_west === null ? null : (shipperCheck_ === valueCheck?.accImb_west ? pnmMatch?.value : null)
        //       }
        //     }
        //   }
        // }
        // shipperSystemCheck = {
        //   systemPlan: {
        //     accImb_east: checkPMN((e?.data?.[0]?.nomination_values || [])?.find((f:any) => f?.tag === "accImb_east")?.value), // No PTT check
        //     accImb_west: checkPMN((e?.data?.[0]?.nomination_values || [])?.find((f:any) => f?.tag === "accImb_west")?.value), // No PTT check
        //     accImbInv_east: checkPMN((e?.data?.[0]?.nomination_values || [])?.find((f:any) => f?.tag === "accImbInv_east")?.value),  // PTT check
        //     accImbInv_west: checkPMN((e?.data?.[0]?.nomination_values || [])?.find((f:any) => f?.tag === "accImbInv_west")?.value),  // PTT check
        //   },
        //   systemActual: {
        //     accImb_east: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "accImb_east")?.value), // No PTT check
        //     accImb_west: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "accImb_west")?.value), // No PTT check
        //     accImbInv_east: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "accImbInv_east")?.value),  // PTT check
        //     accImbInv_west: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "accImbInv_west")?.value),  // PTT check
        //   },
        //   shipperPTT: hasPTT, // true PTT , false ไม่ใช่ PTT
        //   remark1:`Shipper PTT ให้เทียบค่า Acc. Imbalance (Inventory) กับฝั่ง System ถ้าค่าเป็น + หรือ - ตรงกับ system ให้แสดงค่า order ตาม zone นั้นๆ แต่ถ้าไม่ตรงกับ system ให้ระบบ hide ค่า order ไม่ต้องแสดง`,
        //   remark2:`Shipper อื่นๆ ให้เทียบค่า Acc. Imbalance (Meter) กับฝั่ง System ถ้าค่าเป็น + หรือ - ตรงกับ system ให้แสดงค่า order ตาม zone นั้นๆ แต่ถ้าไม่ตรงกับ system ให้ระบบ hide ค่า order ไม่ต้องแสดง`
        // }

        const checkPMNMatchNew = (pnmMatch:any, pttCheck_:any, valueCheck:any, shipperDataArr:any) => {

          if(pnmMatch?.tag === "energyAdjustIFOFO_east" || pnmMatch?.tag === "volumeAdjustIFOFO_east"){
            if(pttCheck_){
              const shipperCheck_ = checkPMN(pnmMatch?.value)
              return {
                ...pnmMatch,
                value: valueCheck?.[pnmMatch?.tag] === null ? null : (shipperCheck_ === valueCheck?.[pnmMatch?.tag] ? pnmMatch?.value : null)
              }
            }else{
              const shipperCheck_ = checkPMN(pnmMatch?.value)
              return {
                ...pnmMatch,
                value: valueCheck?.[pnmMatch?.tag] === null ? null : (shipperCheck_ === valueCheck?.[pnmMatch?.tag] ? pnmMatch?.value : null)
              }
            }
          }else if(pnmMatch?.tag === "energyAdjustIFOFO_west" || pnmMatch?.tag === "volumeAdjustIFOFO_west"){
            if(pttCheck_){
              const shipperCheck_ = checkPMN(pnmMatch?.value)
              return {
                ...pnmMatch,
                value: valueCheck?.[pnmMatch?.tag] === null ? null : (shipperCheck_ === valueCheck?.[pnmMatch?.tag] ? pnmMatch?.value : null)
              }
            }else{
              const shipperCheck_ = checkPMN(pnmMatch?.value)
              return {
                ...pnmMatch,
                value: valueCheck?.[pnmMatch?.tag] === null ? null : (shipperCheck_ === valueCheck?.[pnmMatch?.tag] ? pnmMatch?.value : null)
              }
            }
          }
        }
        shipperSystemCheck = {
          systemPlan: {
            // accImb_east: checkPMN((e?.data?.[0]?.nomination_values || [])?.find((f:any) => f?.tag === "accImb_east")?.value), // No PTT check
            // accImb_west: checkPMN((e?.data?.[0]?.nomination_values || [])?.find((f:any) => f?.tag === "accImb_west")?.value), // No PTT check
            // accImbInv_east: checkPMN((e?.data?.[0]?.nomination_values || [])?.find((f:any) => f?.tag === "accImbInv_east")?.value),  // PTT check
            // accImbInv_west: checkPMN((e?.data?.[0]?.nomination_values || [])?.find((f:any) => f?.tag === "accImbInv_west")?.value),  // PTT check
            order_mmbtu_east: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "energyAdjustIFOFO_east")?.value),  
            order_mmscf_east: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "volumeAdjustIFOFO_east")?.value),  
            order_mmbtu_west: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "energyAdjustIFOFO_west")?.value),  
            order_mmscf_west: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "volumeAdjustIFOFO_west")?.value),
          },
          systemActual: {
            // accImb_east: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "accImb_east")?.value), // No PTT check
            // accImb_west: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "accImb_west")?.value), // No PTT check
            // accImbInv_east: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "accImbInv_east")?.value),  // PTT check
            // accImbInv_west: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "accImbInv_west")?.value),  // PTT check
            energyAdjustIFOFO_east: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "energyAdjustIFOFO_east")?.value),  
            volumeAdjustIFOFO_east: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "volumeAdjustIFOFO_east")?.value),  
            energyAdjustIFOFO_west: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "energyAdjustIFOFO_west")?.value),  
            volumeAdjustIFOFO_west: checkPMN((e?.data?.[0]?.balance_values || [])?.find((f:any) => f?.tag === "volumeAdjustIFOFO_west")?.value),  
          },
          shipperPTT: hasPTT, // true PTT , false ไม่ใช่ PTT
          remark1:`Shipper PTT ให้เทียบค่า Acc. Imbalance (Inventory) กับฝั่ง System ถ้าค่าเป็น + หรือ - ตรงกับ system ให้แสดงค่า order ตาม zone นั้นๆ แต่ถ้าไม่ตรงกับ system ให้ระบบ hide ค่า order ไม่ต้องแสดง`,
          remark2:`Shipper อื่นๆ ให้เทียบค่า Acc. Imbalance (Meter) กับฝั่ง System ถ้าค่าเป็น + หรือ - ตรงกับ system ให้แสดงค่า order ตาม zone นั้นๆ แต่ถ้าไม่ตรงกับ system ให้ระบบ hide ค่า order ไม่ต้องแสดง`
        }
      
        plan = (findShipper?.nomination_values || [])?.map((d_:any) => {
          const tagCheck = ["energyAdjustIFOFO_east", "volumeAdjustIFOFO_east", "energyAdjustIFOFO_west", "volumeAdjustIFOFO_west"]
          if(tagCheck?.includes(d_?.tag)){

            if(d_ === null){
              return d_
            }else{
              // return checkPMNMatch(d_, shipperSystemCheck?.shipperPTT, shipperSystemCheck?.systemPlan, (findShipper?.nomination_values || []))
              return checkPMNMatchNew(d_, shipperSystemCheck?.shipperPTT, shipperSystemCheck?.systemPlan, (findShipper?.nomination_values || []))
            }
          }else {
            return d_
          }
        })
        actual = (findShipper?.balance_values || [])?.map((d_:any) => {
          // order mmbtu energyAdjustIFOFO_east energyAdjustIFOFO_west
          // order mmscf volumeAdjustIFOFO_east volumeAdjustIFOFO_west
          const tagCheck = ["energyAdjustIFOFO_east", "volumeAdjustIFOFO_east", "energyAdjustIFOFO_west", "volumeAdjustIFOFO_west"]
          if(tagCheck?.includes(d_?.tag)){
            if(d_ === null){
              return d_
            }else{
              // console.log(`+++ d_?.tag : `, d_?.tag);
              // console.log(`+++ d_?.value : `, d_?.value);
              // console.log((e?.data?.[0]?.balance_values || []));
              // console.log('d_ : ', d_);
              // console.log('shipperSystemCheck?.systemActual : ', shipperSystemCheck?.systemActual);
              // return checkPMNMatch(d_, shipperSystemCheck?.shipperPTT, shipperSystemCheck?.systemActual, (findShipper?.balance_values || []))
              return checkPMNMatchNew(d_, shipperSystemCheck?.shipperPTT, shipperSystemCheck?.systemActual, (findShipper?.balance_values || []))
              // return d_

            }
          }else {
            return d_
          }
        })
        
        sys_plan = e?.data?.[0]?.nomination_values || []
        sys_actual = e?.data?.[0]?.balance_values || []
      } else {
        plan = e?.data?.[0]?.nomination_values || []
        actual = e?.data?.[0]?.balance_values || []
      }

      return {
        gas_day: e?.gas_day,
        gas_hour: e?.gas_hour,
        execute_timestamp: e?.execute_timestamp,
        zone_data: e?.data?.[0]?.zone_data,
        plan,
        actual,
        sys_plan,
        sys_actual,
        shipperSystemCheck
      }
    })

    console.log('nGrouped : ', nGrouped);

    const fnGrouped = nGrouped?.filter((f: any) => {
      return f?.plan.length > 0 && f?.actual.length > 0
    })
    const efnGrouped = execute_timestamp
      ? fnGrouped?.filter((f: any) => {
          return f?.execute_timestamp === execute_timestamp
        })
      : fnGrouped

    const nefnGrouped = efnGrouped?.map((e: any) => {
      const condition_east = {
        tag: 'condition_east',
        value: e?.['zone_data']?.find((f: any) => f?.zone === 'EAST' && f?.tag?.toLowerCase() === 'mode')?.value || null,
        validation: e?.['zone_data']?.find((f: any) => f?.zone === 'EAST' && f?.tag?.toLowerCase() === 'flow_type')?.value || null
      }
      const condition_west = {
        tag: 'condition_west',
        value: e?.['zone_data']?.find((f: any) => f?.zone === 'WEST' && f?.tag?.toLowerCase() === 'mode')?.value || null,
        validation: e?.['zone_data']?.find((f: any) => f?.zone === 'WEST' && f?.tag?.toLowerCase() === 'flow_type')?.value || null
      }

      const {plan = [], actual = [], zone_data = [], ...nE} = e || {}

      const plan_ = [...plan]
      const actual_ = [...actual, condition_east, condition_west]

      return {
        ...nE,
        zone_data,
        plan: plan_,
        actual: actual_
      }
    })
    
    console.log('nefnGrouped : ', nefnGrouped);

    const fnefnGrouped = nefnGrouped?.map((e: any) => {
      const {gas_day, gas_hour, execute_timestamp, plan, actual, sys_plan, sys_actual, zone_data, shipperSystemCheck, ...nE} = e

      const getValueArr = (mains: any, key: any) => {
        const finds = mains?.find((f: any) => f?.tag === key)
        return finds
      }

      const system_level_east =
        zone_data?.find((f: any) => f?.zone === 'EAST' && f?.tag?.toLowerCase() === 'flow_type')?.value ??
        getValueArr(sys_actual, 'level_percentage_east')?.validation ??
        getValueArr(sys_plan, 'level_percentage_east')?.validation ??
        getValueArr(actual, 'level_percentage_east')?.validation ??
        getValueArr(plan, 'level_percentage_east')?.validation

      const system_level_west =
        zone_data?.find((f: any) => f?.zone === 'WEST' && f?.tag?.toLowerCase() === 'flow_type')?.value ??
        getValueArr(sys_actual, 'level_percentage_west')?.validation ??
        getValueArr(sys_plan, 'level_percentage_west')?.validation ??
        getValueArr(actual, 'level_percentage_west')?.validation ??
        getValueArr(plan, 'level_percentage_west')?.validation

      const fnNullCheckZeroAll = (datas: any, a: any, b: any, c: any, d: any, e: any) => {
        if (getValueArr(datas, a)?.value === undefined && getValueArr(datas, b)?.value === undefined && getValueArr(datas, c)?.value === undefined && getValueArr(datas, d)?.value === undefined && getValueArr(datas, e)?.value === undefined) {
          return null
        } else {
          return (getValueArr(datas, a)?.value ?? 0) + (getValueArr(datas, b)?.value ?? 0) - (getValueArr(datas, c)?.value ?? 0) + (getValueArr(datas, d)?.value ?? 0) + (getValueArr(datas, e)?.value ?? 0) || 0 //calc
        }
      }
      const p_shrinkage_others_east = fnNullCheckZeroAll(plan, 'shrinkage_east', 'instructedFlow_east', 'ventGas_east', 'commissioningGas_east', 'otherGas_east')
      const p_shrinkage_others_west = fnNullCheckZeroAll(plan, 'shrinkage_west', 'instructedFlow_west', 'ventGas_west', 'commissioningGas_west', 'otherGas_west')
      const p_shrinkage_others_east_west = fnNullCheckZeroAll(plan, 'shrinkage_east-west', 'instructedFlow_east-west', 'ventGas_east-west', 'commissioningGas_east-west', 'otherGas_east-west')

      const a_shrinkage_others_east = fnNullCheckZeroAll(actual, 'shrinkage_east', 'instructedFlow_east', 'ventGas_east', 'commissioningGas_east', 'otherGas_east')
      const a_shrinkage_others_west = fnNullCheckZeroAll(actual, 'shrinkage_west', 'instructedFlow_west', 'ventGas_west', 'commissioningGas_west', 'otherGas_west')
      const a_shrinkage_others_east_west = fnNullCheckZeroAll(actual, 'shrinkage_east-west', 'instructedFlow_east-west', 'ventGas_east-west', 'commissioningGas_east-west', 'otherGas_east-west')

      const plan_ = {
        ['total_entry_east']: getValueArr(plan, 'total_entry_east'),
        ['total_entry_west']: getValueArr(plan, 'total_entry_west'),
        ['total_entry_east-west']: getValueArr(plan, 'total_entry_east-west'),
        ['total_exit_east']: getValueArr(plan, 'total_exit_east'),
        ['total_exit_west']: getValueArr(plan, 'total_exit_west'),
        ['total_exit_east-west']: getValueArr(plan, 'total_exit_east-west'),
        ['revserveBal_east']: getValueArr(plan, 'revserveBal_east'),
        ['revserveBal_west']: getValueArr(plan, 'revserveBal_west'),
        ['revserveBal_east-west']: getValueArr(plan, 'revserveBal_east-west'),
        ['park/unpark_east']: (getValueArr(plan, 'park_east')?.value ?? 0) - (getValueArr(plan, 'unpark_east')?.value ?? getValueArr(plan, 'Unpark_east')?.value ?? 0), //calc
        ['park/unpark_west']: (getValueArr(plan, 'park_west')?.value ?? 0) - (getValueArr(plan, 'unpark_west')?.value ?? getValueArr(plan, 'Unpark_west')?.value ?? 0), //calc
        ['park/unpark_east-west']: (getValueArr(plan, 'park_east-west')?.value ?? 0) - (getValueArr(plan, 'unpark_east-west')?.value ?? getValueArr(plan, 'Unpark_east-west')?.value ?? 0), //calc
        ['detail_entry_east-west_ra6Ratio']: getValueArr(plan, 'detail_entry_east-west_ra6Ratio'),
        ['detail_entry_east-west_bvw10Ratio']: getValueArr(plan, 'detail_entry_east-west_bvw10Ratio'),
        ['shrinkage_others_east']: p_shrinkage_others_east, //calc
        ['shrinkage_others_west']: p_shrinkage_others_west, //calc
        ['shrinkage_others_east-west']: p_shrinkage_others_east_west, //calc
        ['minInventoryChange_east']: getValueArr(plan, 'minInventoryChange_east'),
        ['minInventoryChange_west']: getValueArr(plan, 'minInventoryChange_west'),
        ['minInventoryChange_east-west']: getValueArr(plan, 'minInventoryChange_east-west'),
        ['dailyImb_east']: getValueArr(plan, 'dailyImb_east'),
        ['dailyImb_west']: getValueArr(plan, 'dailyImb_west'),
        ['accImb_east']: getValueArr(plan, 'accImb_east'),
        ['accImb_west']: getValueArr(plan, 'accImb_west'),
        ['accImbInv_east']: getValueArr(plan, 'accImbInv_east'),
        ['accImbInv_west']: getValueArr(plan, 'accImbInv_west'),
        ['dailyImb_total']: getValueArr(plan, 'dailyImb_total'),
        ['absimb']: getValueArr(plan, 'absimb'),
        ['system_level_east']: null, // null
        ['level_percentage_east']: null, // null
        ['energyAdjustIFOFO_east']: null, // null
        ['volumeAdjustIFOFO_east']: null, // null
        ['system_level_west']: null, // null
        ['level_percentage_west']: null, // null
        ['energyAdjustIFOFO_west']: getValueArr(plan, 'energyAdjustIFOFO_west'),
        ['volumeAdjustIFOFO_west']: getValueArr(plan, 'volumeAdjustIFOFO_west'),
        ['condition_east']: getValueArr(plan, 'condition_east'),
        ['condition_west']: getValueArr(plan, 'condition_west')
      }
      const actual_ = {
        ['total_entry_east']: getValueArr(actual, 'total_entry_east'),
        ['total_entry_west']: getValueArr(actual, 'total_entry_west'),
        ['total_entry_east-west']: getValueArr(actual, 'total_entry_east-west'),
        ['total_exit_east']: getValueArr(actual, 'total_exit_east'),
        ['total_exit_west']: getValueArr(actual, 'total_exit_west'),
        ['total_exit_east-west']: getValueArr(actual, 'total_exit_east-west'),
        ['revserveBal_east']: getValueArr(actual, 'revserveBal_east'),
        ['revserveBal_west']: getValueArr(actual, 'revserveBal_west'),
        ['revserveBal_east-west']: getValueArr(actual, 'revserveBal_east-west'),
        ['park/unpark_east']: (getValueArr(actual, 'park_east')?.value ?? 0) - (getValueArr(actual, 'unpark_east')?.value ?? getValueArr(actual, 'Unpark_east')?.value ?? 0), //calc
        ['park/unpark_west']: (getValueArr(actual, 'park_west')?.value ?? 0) - (getValueArr(actual, 'unpark_west')?.value ?? getValueArr(actual, 'Unpark_west')?.value ?? 0), //calc
        ['park/unpark_east-west']: (getValueArr(actual, 'park_east-west')?.value ?? 0) - (getValueArr(actual, 'unpark_east-west')?.value ?? getValueArr(actual, 'Unpark_east-west')?.value ?? 0), //calc
        ['detail_entry_east-west_ra6Ratio']: getValueArr(actual, 'detail_entry_east-west_ra6Ratio'),
        ['detail_entry_east-west_bvw10Ratio']: getValueArr(actual, 'detail_entry_east-west_bvw10Ratio'),
        ['shrinkage_others_east']: a_shrinkage_others_east, //calc
        ['shrinkage_others_west']: a_shrinkage_others_west, //calc
        ['shrinkage_others_east-west']: a_shrinkage_others_east_west, //calc
        ['minInventoryChange_east']: getValueArr(actual, 'minInventoryChange_east'),
        ['minInventoryChange_west']: getValueArr(actual, 'minInventoryChange_west'),
        ['minInventoryChange_east-west']: getValueArr(actual, 'minInventoryChange_east-west'),
        ['dailyImb_east']: getValueArr(actual, 'dailyImb_east'),
        ['dailyImb_west']: getValueArr(actual, 'dailyImb_west'),
        ['accImb_east']: getValueArr(actual, 'accImb_east'),
        ['accImb_west']: getValueArr(actual, 'accImb_west'),
        ['accImbInv_east']: getValueArr(actual, 'accImbInv_east'),
        ['accImbInv_west']: getValueArr(actual, 'accImbInv_west'),
        ['dailyImb_total']: getValueArr(actual, 'dailyImb_total'),
        ['absimb']: getValueArr(actual, 'absimb'),
        ['system_level_east']: system_level_east,
        ['level_percentage_east']: getValueArr(actual, 'level_percentage_east'),
        ['custom_level_percentage_east']: getValueArr(sys_actual, 'level_percentage_east'),
        ['energyAdjustIFOFO_east']: getValueArr(actual, 'energyAdjustIFOFO_east'),
        ['volumeAdjustIFOFO_east']: getValueArr(actual, 'volumeAdjustIFOFO_east'),
        ['system_level_west']: system_level_west,
        ['level_percentage_west']: getValueArr(actual, 'level_percentage_west'),
        ['custom_level_percentage_west']: getValueArr(sys_actual, 'level_percentage_west'),
        ['energyAdjustIFOFO_west']: getValueArr(actual, 'energyAdjustIFOFO_west'),
        ['volumeAdjustIFOFO_west']: getValueArr(actual, 'volumeAdjustIFOFO_west'),
        ['condition_east']: getValueArr(actual, 'condition_east'),
        ['condition_west']: getValueArr(actual, 'condition_west')
      }

      return {
        gas_day,
        gas_hour_num: gas_hour,
        gas_hour: (gas_hour && `${gas_hour > 10 ? gas_hour + ':00' : '0' + gas_hour + ':00'}`) || '', //,
        execute_timestamp,
        plan_,
        actual_
      }
    })
    console.log('fnefnGrouped : ', fnefnGrouped);

    const latestPerHour = Object.values(
      fnefnGrouped.reduce((acc, curr) => {
        const key = curr.gas_hour_num // ใช้เลขชั่วโมงเป็น key
        if (!acc[key] || curr.execute_timestamp > acc[key].execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )

    return latestPerHour
  }

  async balanceIntradayDashboardSendEmailGetUserType(userId: any) {
    const resData = await this.prisma.user_type?.findMany({
      where: {
        id: {
          not: {
            in: [1, 4]
          }
        }
      },
      orderBy: {
        id: 'asc'
      },
      include: {
        group: {
          include: {
            account_manage: {
              include: {
                account: true
              }
            }
          }
        }
      }
    })
    const nresData = resData?.map((e: any) => {
      const {group, ...nE} = e
      const groupM = group?.map((g: any) => {
        const {account_manage, ...nG} = g
        const account = account_manage?.map((am: any) => {
          return {
            id: am?.account?.id,
            email: am?.account?.email,
            first_name: am?.account?.first_name,
            last_name: am?.account?.last_name
          }
        })

        return {
          id: nG?.id,
          id_name: nG?.id_name,
          name: nG?.name,
          email: nG?.email,
          account: account || []
        }
      })

      return {
        id: nE?.id,
        id_name: nE?.id_name,
        name: nE?.name,
        remark: nE?.remark,
        color: nE?.color,
        color_text: nE?.color_text,
        group: groupM || []
      }
    })

    return nresData
  }

  async balanceIntradayDashboardSendEmailGet(userId: any) {
    const resData = await this.prisma.intraday_dashboard_sent_email?.findFirst({
      where: {},
      orderBy: {
        id: 'desc'
      }
    })

    return resData
  }

  // prover email
  async sendEmailProviderCustom(header: any, subject: any, sendEmail: any, detail: any, excelBuffer: any, type: any) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false // Ignore self-signed certificates
      }
    })

    const info = await transporter.sendMail({
      from: `<${process.env.SMTP_USER}>`,
      to: sendEmail,
      subject: subject || '',
      attachments: [
        {
          filename: 'IntradayDashboard.xlsx',
          content: excelBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        {
          filename: 'logo-ptt.png',
          path: join(process.cwd(), 'public', 'img/logo-ptt.png'),
          cid: 'logoPtt'
        },
        {
          filename: 'email-img.png',
          path: join(process.cwd(), 'public', 'img/email-img.png'),
          cid: 'emailImg'
        }
      ],
      html: `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Document</title>
                </head>
                <body>
                    <div 
                        style="width: 500px; 
                        border: 1px solid #D6D6D6; 
                        height: auto; 
                        border-radius: 15px;
                        margin: 10px auto;
                        padding: 15px;"
                    >
                        <div
                            style="display: flex;
                            margin-bottom: 50px;"
                        >
                            <img
                                src="cid:logoPtt"
                                alt="logo-ptt"
                                style="margin: 0 auto; width: 120px; object-fit: contain;"
                            />
                        </div>
                        <div
                            style="display: flex;
                            margin-bottom: 40px;"
                        >
                            <img
                                src="cid:emailImg"
                                alt="img-email"
                                style="margin: 0 auto; object-fit: contain;"
                            />
                        </div>
                        <div
                            style="text-align: center;
                            font-size: 20px;
                            font-weight: 700;"
                        >
                            ${header || '-'}
                        </div>
                        <div
                            style="line-height: 40px;
                            margin-top: 20px;
                            text-align: center;
                            font-size: 15px;
                            "
                        >
                            ${detail ? String(detail).replace(/\n/g, '<br>') : '-'} 
                        </div>
                      
                        <div style="margin-top: 30px; font-size: 15px;">
                            <div style="text-align: center;">
                                Thank You,
                            </div>
                            <div style="text-align: center;">
                                TPA, Systems
                            </div>
                        </div>
                        <div style="margin-top: 40px; text-align: center; font-size: 14px;">
                            <span>If you did not initiate this request, please contact us immediately at </span>
                            <a href="#">support@ptt.com.</a>
                        </div>
                    </div>
                </body>
            </html>`
    })

    return info
  }

  async balanceIntradayDashboardSendEmail(payload: any, userId: any) {
    const {subject, sendEmail, detail, exportFile} = payload
    const header = 'Intraday Dashboard'

    const excelBuffer: any = await this.exportFilesService.balanceIntradayDashboard(null, exportFile, userId)
    const info = await this.sendEmailProviderCustom(header, subject, sendEmail, detail, excelBuffer, null)

    const newDate = getTodayNowAdd7()

    const create = await this.prisma.intraday_dashboard_sent_email.create({
      data: {
        subject: subject || null,
        detail: detail || null,
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by: Number(userId)
      }
    })

    return create
  }

  async systemAccImbalanceInventory(payload: any, userId: any) {
    const {gas_day, skip, limit, shipper_id, execute_timestamp, lasted_version} = payload

    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: Number(skip),
        limit: Number(limit)
      },
      'balance_system_acc_imb'
    )

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const modeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          lte: todayEnd
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        start_date: 'desc'
      }
    })

    const modeZoneData = modeZone?.[0] || null
    const mode = modeZoneData?.mode?.mode || null
    // const EAST = modeZone?.filter((f:any) => f?.zone?.name === "EAST")?.[0]
    // const WEST = modeZone?.filter((f:any) => f?.zone?.name === "WEST")?.[0]
    // const mode = [EAST?.mode?.mode, WEST?.mode?.mode]
    const dataEvuent = evidenApiCenter?.data || []
    const filterMode = dataEvuent?.filter((f: any) => f?.mode === mode)
    // const filterMode = dataEvuent?.filter((f: any) => mode?.includes(f?.mode));

    if (dataEvuent?.length > 0 && filterMode.length > 0) {
      let hourData = []
      for (let i = 0; i <= 24; i++) {
        hourData.push({
          gas_hour: i,
          gas_hour_text: i >= 10 ? `${i}:00` : `0${i}:00`,
          mode: null,
          zone: null,
          value: null
        })
      }

      const hourDataSet = hourData?.map((e: any) => {
        const fHour = filterMode?.filter((f: any) => f?.gas_hour === e?.gas_hour)
        const maxTimestamp = Math.max(...fHour?.map((e) => e.execute_timestamp))
        const index = fHour?.findIndex((e: any) => e.execute_timestamp === maxTimestamp)
        const fHours = fHour?.[index]
        const {values, ...nE} = e
        let value = {
          totalAccImbInv_percentage: null,
          high_max_percentage: null,
          high_dd_percentage: null,
          high_red_percentage: null,
          high_orange_percentage: null,
          high_alert_percentage: null,
          low_max_percentage: null,
          low_dd_percentage: null,
          low_red_percentage: null,
          low_orange_percentage: null,
          low_alert_percentage: null
        }

        if (fHours) {
          nE['mode'] = fHours?.mode
          nE['zone'] = fHours?.zone
          value['totalAccImbInv_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'totalAccImbInv_percentage')?.value ?? null
          value['high_max_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_max_percentage')?.value ?? null
          value['high_dd_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_dd_percentage')?.value ?? null
          value['high_red_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_red_percentage')?.value ?? null
          value['high_orange_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_orange_percentage')?.value ?? null
          value['high_alert_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_alert_percentage')?.value ?? null
          value['low_max_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_max_percentage')?.value ?? null
          value['low_dd_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_dd_percentage')?.value ?? null
          value['low_red_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_red_percentage')?.value ?? null
          value['low_orange_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_orange_percentage')?.value ?? null
          value['low_alert_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_alert_percentage')?.value ?? null
        }

        return {
          ...nE,
          value
        }
      })

      const dataUse = {
        templateLabelKeys: [
          {
            lebel: 'EAST',
            color: '#dbe4fe',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'WEST',
            color: '#fdcee3',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'High Max',
            color: '#535353',
            key: 'high_max_percentage',
            type: 'line'
          },
          {
            lebel: 'High Difficult Day',
            color: '#824ba6',
            key: 'high_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'High Red',
            color: '#da1610',
            key: 'high_red_percentage',
            type: 'line'
          },
          {
            lebel: 'High Orange',
            color: '#f56f16',
            key: 'high_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert High',
            color: '#eac12a',
            key: 'high_alert_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Min',
            color: '#535353',
            key: 'low_max_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Difficult Day',
            color: '#824ba6',
            key: 'low_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Red',
            color: '#da1610',
            key: 'low_red_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Orange',
            color: '#f56f16',
            key: 'low_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert Low',
            color: '#eac12a',
            key: 'low_alert_percentage',
            type: 'line'
          }
        ],
        data: [
          {
            gas_day: gas_day,
            hour: hourDataSet
          }
        ]
      }
      return dataUse
    } else {
      const dataUse = {
        templateLabelKeys: [
          {
            lebel: 'EAST',
            color: '#dbe4fe',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'WEST',
            color: '#fdcee3',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'High Max',
            color: '#535353',
            key: 'high_max_percentage',
            type: 'line'
          },
          {
            lebel: 'High Difficult Day',
            color: '#824ba6',
            key: 'high_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'High Red',
            color: '#da1610',
            key: 'high_red_percentage',
            type: 'line'
          },
          {
            lebel: 'High Orange',
            color: '#f56f16',
            key: 'high_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert High',
            color: '#eac12a',
            key: 'high_alert_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Min',
            color: '#535353',
            key: 'low_max_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Difficult Day',
            color: '#824ba6',
            key: 'low_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Red',
            color: '#da1610',
            key: 'low_red_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Orange',
            color: '#f56f16',
            key: 'low_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert Low',
            color: '#eac12a',
            key: 'low_alert_percentage',
            type: 'line'
          }
        ],
        data: []
      }
      return dataUse
    }
  }

  async intradayAccImbalanceDashboard(payload: any, userId: any) {
    const {gas_day, skip, limit, shipper_id, execute_timestamp, lasted_version, tab, shipper} = payload
    // const mode = tab || null;

    // const datesArray = Array.from({ length: 3 }).map((_, i) =>
    //   dayjs(gas_day).subtract(2 - i, "day").format("YYYY-MM-DD")
    // );
    const datesArray = Array.from({
      length: 3
    }).map((_, i) => dayjs(gas_day).subtract(i, 'day').format('YYYY-MM-DD'))

    const mapShipperIDWithName: Record<string, string> = {}
    let shipperDataTempAll = []
    let nDataTempAll = []
    for (let iDay = 0; iDay < datesArray.length; iDay++) {
      const gasDay = getTodayNowYYYYMMDDDfaultAdd7(datesArray[iDay]).toDate()

      // const modeZone = await this.prisma.mode_zone_base_inventory.findMany({
      //   where: {
      //     start_date: {
      //       lte: gasDay,
      //     },
      //   },
      //   include: {
      //     zone: true,
      //     mode: true,
      //     create_by_account: {
      //       select: {
      //         id: true,
      //         email: true,
      //         first_name: true,
      //         last_name: true,
      //       },
      //     },
      //     update_by_account: {
      //       select: {
      //         id: true,
      //         email: true,
      //         first_name: true,
      //         last_name: true,
      //       },
      //     },
      //   },
      //   orderBy: {
      //     start_date: 'desc',
      //   },
      // });

      // const EAST = modeZone?.filter((f:any) => f?.zone?.name === "EAST")?.[0]
      // const WEST = modeZone?.filter((f:any) => f?.zone?.name === "WEST")?.[0]
      // const modeZoneData = tab === "EAST" ? EAST : tab === "WEST" ? WEST : null;

      const groupMaster = await this.prisma.group.findMany({
        where: {
          user_type_id: 3,
          ...(shipper &&
            shipper.length > 0 && {
              id_name: {
                in: shipper
              }
            }),
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
                    gt: gasDay
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        }
      })
      const modeZoneData = await this.prisma.mode_zone_base_inventory.findFirst({
        where: {
          start_date: {
            lte: gasDay
          },
          zone: {
            name: tab
          }
        },
        include: {
          zone: true,
          mode: true,
          create_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          },
          update_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        },
        orderBy: {
          start_date: 'desc'
        }
      })
      const mode = modeZoneData?.mode?.mode || null

      let totalRecord: number | undefined = undefined
      await this.evidenApiCenter(
        {
          gas_day: datesArray[iDay],
          zone: modeZoneData?.zone?.name || tab,
          start_hour: 1,
          end_hour: 24,
          skip: 0,
          limit: 1
        },
        'balance_intraday_acc_imb_inventory_by_shipper',
        (total_record: number) => {
          totalRecord = total_record
        }
      )
      const evidenApiCenter: any = await this.evidenApiCenter(
        {
          gas_day: datesArray[iDay],
          zone: modeZoneData?.zone?.name || tab,
          start_hour: 1,
          end_hour: 24,
          skip: totalRecord ? 0 : Number(skip),
          limit: totalRecord ? totalRecord : Number(limit)
        },
        'balance_intraday_acc_imb_inventory_by_shipper'
      )

      const dataEvuent = evidenApiCenter?.data || []
      const filterZone = dataEvuent?.filter((f: any) => f?.zone === tab)
      const filterMode = filterZone?.filter((f: any) => f?.mode === mode)

      // intraday-acc-imbalance-dashboard
      // values

      if (
        // modeZoneData &&
        tab &&
        mode &&
        dataEvuent?.length > 0 &&
        filterMode.length > 0
      ) {
        let hourData = []
        let shipperDataTemp = []
        for (let i = 0; i <= 24; i++) {
          hourData.push({
            gas_hour: i,
            gas_hour_text: i >= 10 ? `${i}:00` : `0${i}:00`,
            mode: null,
            zone: null,
            value: null
          })
        }

        const hourDataSet = hourData?.map((e: any) => {
          const fHour = filterMode?.filter((f: any) => f?.gas_hour === e?.gas_hour)
          const maxTimestamp = Math.max(...fHour?.map((e) => e.execute_timestamp))
          const index = fHour?.findIndex((e: any) => e.execute_timestamp === maxTimestamp)
          const fHours = fHour?.[index]
          if (fHours?.shipper_data?.length > 0) {
            fHours?.shipper_data
              ?.filter((f: any) => f?.shipper !== 'Total')
              ?.map((sp: any) => {
                if (!shipper || shipper.length === 0 || shipper.includes(sp?.shipper)) {
                  const fShipperName = groupMaster?.find((f: any) => f?.id_name == sp?.shipper)

                  if (fShipperName) {
                    shipperDataTemp?.push(sp?.shipper)
                    mapShipperIDWithName[sp?.shipper] = fShipperName?.name
                  }
                }
                return sp
              })
          }
          return {
            ...e
          }
        })
        shipperDataTempAll = [...shipperDataTempAll, ...shipperDataTemp]
        const nshipperDataTemp = [...new Set(shipperDataTemp)]

        const hourDataSetS = hourDataSet?.map((e: any) => {
          const fHour = filterMode?.filter((f: any) => f?.gas_hour === e?.gas_hour)
          const maxTimestamp = Math.max(...fHour?.map((e) => e.execute_timestamp))
          const index = fHour?.findIndex((e: any) => e.execute_timestamp === maxTimestamp)
          const fHours = fHour?.[index]

          const {...nE} = e

          let value = {
            // accImb_or_accImbInv: null,
            high_max_percentage: null,
            high_dd_percentage: null,
            high_red_percentage: null,
            high_orange_percentage: null,
            high_alert_percentage: null,
            low_max_percentage: null,
            low_dd_percentage: null,
            low_red_percentage: null,
            low_orange_percentage: null,
            low_alert_percentage: null,

            high_alert: null,
            high_orange: null,
            high_red: null,
            high_dd: null,
            high_max: null,
            baseInv: null,
            accImb_or_accImbInv: null,
            accImb_or_accImbInv_percentage: null,
            low_alert: null,
            low_orange: null,
            low_red: null,
            low_dd: null,
            low_max: null
          }

          if (fHours) {
            nE['mode'] = fHours?.mode
            nE['zone'] = fHours?.zone

            value['all'] = fHours?.values?.find((f: any) => f?.tag === 'accImb_or_accImbInv')?.value ?? null

            value['high_max_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_max_percentage')?.value ?? null
            value['high_dd_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_dd_percentage')?.value ?? null
            value['high_red_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_red_percentage')?.value ?? null
            value['high_orange_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_orange_percentage')?.value ?? null
            value['high_alert_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'high_alert_percentage')?.value ?? null
            value['low_max_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_max_percentage')?.value ?? null
            value['low_dd_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_dd_percentage')?.value ?? null
            value['low_red_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_red_percentage')?.value ?? null
            value['low_orange_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_orange_percentage')?.value ?? null
            value['low_alert_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'low_alert_percentage')?.value ?? null

            value['high_alert'] = fHours?.values?.find((f: any) => f?.tag === 'high_alert')?.value ?? null
            value['high_orange'] = fHours?.values?.find((f: any) => f?.tag === 'high_orange')?.value ?? null
            value['high_red'] = fHours?.values?.find((f: any) => f?.tag === 'high_red')?.value ?? null
            value['high_dd'] = fHours?.values?.find((f: any) => f?.tag === 'high_dd')?.value ?? null
            value['high_max'] = fHours?.values?.find((f: any) => f?.tag === 'high_max')?.value ?? null
            value['baseInv'] = fHours?.values?.find((f: any) => f?.tag === 'baseInv')?.value ?? null
            value['accImb_or_accImbInv'] = fHours?.values?.find((f: any) => f?.tag === 'accImb_or_accImbInv')?.value ?? null
            value['accImb_or_accImbInv_percentage'] = fHours?.values?.find((f: any) => f?.tag === 'accImb_or_accImbInv_percentage')?.value ?? null
            value['low_alert'] = fHours?.values?.find((f: any) => f?.tag === 'low_alert')?.value ?? null
            value['low_orange'] = fHours?.values?.find((f: any) => f?.tag === 'low_orange')?.value ?? null
            value['low_red'] = fHours?.values?.find((f: any) => f?.tag === 'low_red')?.value ?? null
            value['low_dd'] = fHours?.values?.find((f: any) => f?.tag === 'low_dd')?.value ?? null
            value['low_max'] = fHours?.values?.find((f: any) => f?.tag === 'low_max')?.value ?? null

            //   const fShipper = shipper.length > 0 ? nshipperDataTemp?.filter((f:any) => {
            //     return (
            //       shipper.includes(f)
            //     )
            //   }) : nshipperDataTemp

            // let spData = fShipper?.map((sps: any) => {
            let spData = nshipperDataTemp
              ?.map((sps: any) => {
                const findSp =
                  fHours?.shipper_data
                    ?.filter((f: any) => {
                      return f?.shipper === sps
                    })?.[0]
                    ?.values?.find((f: any) => f?.tag === 'accImb_or_accImbInv')?.value ?? 0

                // sps

                const fShipperName = groupMaster?.find((f: any) => {
                  return f?.id_name === sps
                })?.name
                if (fShipperName) {
                  return {
                    [fShipperName]: findSp ?? 0
                  }
                } else {
                  return null
                }
              })
              ?.filter((f: any) => f !== null)

            value = {
              ...value,
              ...Object.assign({}, ...spData)
            }
          }

          return {
            ...nE,
            value
          }
        })

        nDataTempAll.push({
          gas_day: datesArray[iDay],
          hour: hourDataSetS
        })
      } else {
        nDataTempAll.push({
          gas_day: datesArray[iDay],
          hour: []
        })
      }
    }

    // shipper

    const nshipperDataTemp = [...new Set(shipperDataTempAll)]

    // shipper

    // const fShipper = shipper.length > 0 ? nshipperDataTemp?.filter((f:any) => {
    //   return (
    //     shipper.includes(f)
    //   )
    // }) : nshipperDataTemp

    // const fShipperName = groupMaster?.filter((f:any) => {
    //   return (
    //     fShipper.includes(f?.id_name)
    //   )
    // })?.map((e:any) => e?.name)
    const fShipperName = Object.values(mapShipperIDWithName)
    const dataUse = {
      templateLabelKeys: [
        ...fShipperName.map((t: any) => {
          function randomColor() {
            return (
              '#' +
              Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, '0')
            )
          }

          return {
            lebel: t,
            color: randomColor(),
            key: t,
            type: 'bar'
          }
        }),
        {
          lebel: 'All',
          color: '#535353',
          key: 'all',
          type: 'lineGraph'
        },
        //    high_alert: null,
        //     high_orange: null,
        //     high_red: null,
        //     high_dd: null,
        //      high_max: null,
        //     baseInv: null,
        //     accImb_or_accImbInv: null,
        //     accImb_or_accImbInv_percentage: null,
        //     low_alert: null,
        //     low_orange: null,
        //     low_red: null,
        //     low_dd: null,
        //     low_max: null,
        {
          lebel: 'High Max',
          color: '#535353',
          key: 'high_max',
          // key: 'high_max_percentage',
          type: 'line'
        },
        {
          lebel: 'High Difficult Day',
          color: '#824ba6',
          key: 'high_dd',
          // key: 'high_dd_percentage',
          type: 'line'
        },
        {
          lebel: 'High Red',
          color: '#da1610',
          key: 'high_red',
          // key: 'high_red_percentage',
          type: 'line'
        },
        {
          lebel: 'High Orange',
          color: '#f56f16',
          key: 'high_orange',
          // key: 'high_orange_percentage',
          type: 'line'
        },
        {
          lebel: 'Alert High',
          color: '#eac12a',
          key: 'high_alert',
          // key: 'high_alert_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Min', // https://app.clickup.com/t/86eujrgh1
          color: '#535353',
          key: 'low_max',
          // key: 'low_max_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Difficult Day',
          color: '#824ba6',
          key: 'low_dd',
          // key: 'low_dd_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Red',
          color: '#da1610',
          key: 'low_red',
          // key: 'low_red_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Orange',
          color: '#f56f16',
          key: 'low_orange',
          // key: 'low_orange_percentage',
          type: 'line'
        },
        {
          lebel: 'Alert Low',
          color: '#eac12a',
          key: 'low_alert',
          // key: 'low_alert_percentage',
          type: 'line'
        }
      ],
      data: nDataTempAll
    }

    return dataUse
  }

  // request_number
  // execute_timestamp
  async balanceReportViewGet(payload: any, userId: any) {
    const {start_date, end_date, skip, limit, shipperId: shipperId_, contractCode, shipperIdList} = payload
    const shipperId = Array.isArray(shipperId_) ? (shipperId_?.[0] || "") : shipperId_
    const shipperIdListArray = shipperIdList ? shipperIdList.split(',') : []

    // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
    const {minDate, maxDate} = await findMinMaxExeDate(this.prisma, start_date, end_date)
    let totalRecord: number | undefined = undefined
    minDate &&
      (await this.evidenApiCenter(
        {
          // start_date: minDate.toDate(),
          // end_date: maxDate.toDate(),
          start_date: minDate?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
          end_date: maxDate?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
          skip: 0,
          limit: 1
        },
        'balance_balance_report',
        (total_record: number) => {
          totalRecord = total_record
        }
      ))
    const evidenApi: any = minDate
      ? await this.evidenApiCenter(
          {
            // start_date: minDate.toDate(),
            // end_date: maxDate.toDate(),
            start_date: minDate?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
            end_date: maxDate?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
            skip: totalRecord ? 0 : Number(skip),
            limit: totalRecord ? totalRecord : Number(limit)
          },
          'balance_balance_report'
        )
      : null
    // console.log('evidenApi : ', evidenApi)
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    console.log('shipperId : ', shipperId);
    const groupMaster = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
        ...((Array.isArray(shipperId) && shipperId.length > 0) ? {
          id_name: {
            in: shipperId
          }
        } : shipperId ? {
          id_name: shipperId
        } : {}),
        ...(shipperIdListArray.length > 0 && {
          id_name: {
            in: shipperIdListArray
          }
        }),
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
    console.log('groupMaster : ', groupMaster);

    const start = start_date ? getTodayStartAdd7(start_date) : null
    const end = end_date ? getTodayEndAdd7(end_date) : null

    if (!start || !end || !start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    const dateArray: string[] = []

    let current = start

    while (current.isSameOrBefore(end)) {
      dateArray.push(current && current.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }

    const arrayToObjTag = (arr: any) => {
      return arr.reduce((acc, cur) => {
        acc[cur.tag] = cur.value
        return acc
      }, {})
    }

    const evidenApiData = evidenApi?.data?.map((e: any) => {
      const {values, shipper_data, ...nE} = e
      const shipperData = shipper_data?.map((sd: any) => {
        const {values: shipperSummary, contract_data, ...nSd} = sd
        const findShipperName = groupMaster?.find((f: any) => f?.id_name === nSd?.shipper)
        const contractData = contract_data?.map((cd: any) => {
          const {values: contractSummary, ...nCd} = cd

          return {
            ...nCd,
            contractSummary: arrayToObjTag(contractSummary) || null
          }
        })
        return {
          ...nSd,
          shipperName: findShipperName?.name || null,
          shipperSummary: arrayToObjTag(shipperSummary) || null,
          contractData: contractData
        }
      })

      return {
        ...nE,
        summary: arrayToObjTag(values) || null,
        shipperData: shipperData
      }
    })

    const evidenResultLast: any[] = evidenApiData
      ? Object.values(
          evidenApiData?.reduce((acc, curr) => {
            const key = `${curr.gas_day}`
            if (
              !acc[key] ||
              acc[key].request_number < curr.request_number // https://app.clickup.com/t/86ev28665
              // acc[key].execute_timestamp < curr.execute_timestamp
            ) {
              acc[key] = curr
            }
            return acc
          }, {})
        )
      : []

    const calcMonthly = (cData: any, keyArr: any) => {
      let cDataCalc = 0
      let checkNot = 0
      for (let cDataIx = 0; cDataIx < keyArr.length; cDataIx++) {
        if (cData?.[keyArr[cDataIx]] !== undefined && cData?.[keyArr[cDataIx]] !== null) {
          cDataCalc = cDataCalc + cData?.[keyArr[cDataIx]]
        } else {
          checkNot = checkNot + 1
        }
      }
      if (checkNot === keyArr.length) {
        return null
      } else {
        return cDataCalc
      }
    }
    let contractArr = []
    console.log('evidenResultLast : ', evidenResultLast);
    // contractData
    const evidenResultLastCalc = evidenResultLast
      ?.map((e: any) => {
        const {summary, shipperData, ...nE} = e
        const shipperDataTemp = shipperData?.map((sd: any) => {
          const {shipperSummary, contractData, ...nSd} = sd
          const findShipperName = groupMaster?.find((f: any) => f?.id_name === nSd?.shipper)

          const contractDataTemp = contractData?.map((cd: any) => {
            const {contractSummary, ...nCd} = cd
            if (findShipperName) {
              contractArr.push(nCd?.contract)
            }
            return {
              ...nCd,
              contractSummary: {
                'Entry Point': calcMonthly(contractSummary, ['total_entry_east', 'total_entry_west', 'total_entry_east-west']), //total_entry_east | total_entry_west | total_entry_east-west
                Exit: calcMonthly(contractSummary, ['total_exit_east', 'total_exit_west', 'total_exit_east-west']), //total_exit_east | total_exit_west | total_exit_east-west
                'Entry - Exit': calcMonthly(contractSummary, ['total_entry_east', 'total_entry_west', 'total_entry_east-west']) - calcMonthly(contractSummary, ['total_exit_east', 'total_exit_west', 'total_exit_east-west']),
                'Fuel Gas': calcMonthly(contractSummary, ['detail_exit_east_fuel', 'detail_exit_west_fuel', 'detail_exit_east-west_fuel']), //detail_exit_east_fuel | detail_exit_west_fuel | detail_exit_east-west_fuel
                'Balancing Gas': calcMonthly(contractSummary, ['reserveBal_east', 'reserveBal_west']), //reserveBal_east | reserveBal_west
                'Change Min Inventory': calcMonthly(contractSummary, ['minInventoryChange_east', 'minInventoryChange_west', 'minInventoryChange_east-west']), //minInventoryChange_east | minInventoryChange_west | minInventoryChange_east-west
                Shrinkagate: calcMonthly(contractSummary, ['shrinkage_east', 'shrinkage_west', 'shrinkage_east-west']) + calcMonthly(contractSummary, ['InstructedFlow_east', 'InstructedFlow_west']), //(shrinkage_east | shrinkage_west | shrinkage_east-west) + (InstructedFlow_east | InstructedFlow_west)
                Commissioning: calcMonthly(contractSummary, ['commissioningGas_east', 'commissioningGas_west']), //commissioningGas_east | commissioningGas_west
                'Gas Vent': calcMonthly(contractSummary, ['ventGas_east', 'ventGas_west']), //ventGas_east | ventGas_west
                'Other Gas': calcMonthly(contractSummary, ['otherGas_east', 'otherGas_west']), //otherGas_east | otherGas_west
                Imbalance: contractSummary['aip'] ? contractSummary['aip'] : contractSummary['ain'] || null, // aip <- เช็คก่อนไม่มีหา ain
                ImbalancePercen: contractSummary['absimb'] || null,
                'Acc. Imbqalance': calcMonthly(contractSummary, ['accImb_east', 'accImb_west']), //accImb_east | accImb_west
                'Min Inventory': calcMonthly(contractSummary, ['minInventory_east', 'minInventory_west', 'minInventory_east-west']), //minInventory_east | minInventory_west | minInventory_east-west
                'Instructed Flow': calcMonthly(contractSummary, [
                  // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
                  'instructedFlow_east',
                  'instructedFlow_west',
                  'instructedFlow_east-west'
                ]) //instructedFlow_east | instructedFlow_west | instructedFlow_east-west
              }
            }
          })
          console.log('contractDataTemp : ', contractDataTemp);
          return {
            ...nSd,
            shipperName: findShipperName?.name || null,
            shipperSummary: {
              'Entry Point': calcMonthly(shipperSummary, ['total_entry_east', 'total_entry_west', 'total_entry_east-west']), //total_entry_east | total_entry_west | total_entry_east-west
              Exit: calcMonthly(shipperSummary, ['total_exit_east', 'total_exit_west', 'total_exit_east-west']), //total_exit_east | total_exit_west | total_exit_east-west
              'Entry - Exit': calcMonthly(shipperSummary, ['total_entry_east', 'total_entry_west', 'total_entry_east-west']) - calcMonthly(shipperSummary, ['total_exit_east', 'total_exit_west', 'total_exit_east-west']),
              'Fuel Gas': calcMonthly(shipperSummary, ['detail_exit_east_fuel', 'detail_exit_west_fuel', 'detail_exit_east-west_fuel']), //detail_exit_east_fuel | detail_exit_west_fuel | detail_exit_east-west_fuel
              'Balancing Gas': calcMonthly(shipperSummary, ['reserveBal_east', 'reserveBal_west']), //reserveBal_east | reserveBal_west
              'Change Min Inventory': calcMonthly(shipperSummary, ['minInventoryChange_east', 'minInventoryChange_west', 'minInventoryChange_east-west']), //minInventoryChange_east | minInventoryChange_west | minInventoryChange_east-west
              Shrinkagate: calcMonthly(shipperSummary, ['shrinkage_east', 'shrinkage_west', 'shrinkage_east-west']) + calcMonthly(shipperSummary, ['InstructedFlow_east', 'InstructedFlow_west']), //(shrinkage_east | shrinkage_west | shrinkage_east-west) + (InstructedFlow_east | InstructedFlow_west)
              Commissioning: calcMonthly(shipperSummary, ['commissioningGas_east', 'commissioningGas_west']), //commissioningGas_east | commissioningGas_west
              'Gas Vent': calcMonthly(shipperSummary, ['ventGas_east', 'ventGas_west']), //ventGas_east | ventGas_west
              'Other Gas': calcMonthly(shipperSummary, ['otherGas_east', 'otherGas_west']), //otherGas_east | otherGas_west
              Imbalance: shipperSummary['aip'] ? shipperSummary['aip'] : shipperSummary['ain'] || null, // aip <- เช็คก่อนไม่มีหา ain
              ImbalancePercen: shipperSummary['absimb'] || null,
              'Acc. Imbqalance': calcMonthly(shipperSummary, ['accImb_east', 'accImb_west']), //accImb_east | accImb_west
              'Min Inventory': calcMonthly(shipperSummary, ['minInventory_east', 'minInventory_west', 'minInventory_east-west']), //minInventory_east | minInventory_west | minInventory_east-west
              'Instructed Flow': calcMonthly(shipperSummary, [
                // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
                'instructedFlow_east',
                'instructedFlow_west',
                'instructedFlow_east-west'
              ]) //instructedFlow_east | instructedFlow_west | instructedFlow_east-west
            },
            contractData: contractDataTemp,
            contractDataLength: contractDataTemp?.length
          }
        })
        console.log('shipperDataTemp : ', shipperDataTemp);
        return {
          ...nE,
          summary: {
            'Entry Point': calcMonthly(summary, ['total_entry_east', 'total_entry_west', 'total_entry_east-west']), //total_entry_east | total_entry_west | total_entry_east-west
            Exit: calcMonthly(summary, ['total_exit_east', 'total_exit_west', 'total_exit_east-west']), //total_exit_east | total_exit_west | total_exit_east-west
            'Entry - Exit': calcMonthly(summary, ['total_entry_east', 'total_entry_west', 'total_entry_east-west']) - calcMonthly(summary, ['total_exit_east', 'total_exit_west', 'total_exit_east-west']),
            'Fuel Gas': calcMonthly(summary, ['detail_exit_east_fuel', 'detail_exit_west_fuel', 'detail_exit_east-west_fuel']), //detail_exit_east_fuel | detail_exit_west_fuel | detail_exit_east-west_fuel
            'Balancing Gas': calcMonthly(summary, ['reserveBal_east', 'reserveBal_west']), //reserveBal_east | reserveBal_west
            'Change Min Inventory': calcMonthly(summary, ['minInventoryChange_east', 'minInventoryChange_west', 'minInventoryChange_east-west']), //minInventoryChange_east | minInventoryChange_west | minInventoryChange_east-west
            Shrinkagate: calcMonthly(summary, ['shrinkage_east', 'shrinkage_west', 'shrinkage_east-west']) + calcMonthly(summary, ['InstructedFlow_east', 'InstructedFlow_west']), //(shrinkage_east | shrinkage_west | shrinkage_east-west) + (InstructedFlow_east | InstructedFlow_west)
            Commissioning: calcMonthly(summary, ['commissioningGas_east', 'commissioningGas_west']), //commissioningGas_east | commissioningGas_west
            'Gas Vent': calcMonthly(summary, ['ventGas_east', 'ventGas_west']), //ventGas_east | ventGas_west
            'Other Gas': calcMonthly(summary, ['otherGas_east', 'otherGas_west']), //otherGas_east | otherGas_west
            Imbalance: summary['aip'] ? summary['aip'] : summary['ain'] || null, // aip <- เช็คก่อนไม่มีหา ain
            ImbalancePercen: summary['absimb'] || null,
            'Acc. Imbqalance': calcMonthly(summary, ['accImb_east', 'accImb_west']), //accImb_east | accImb_west
            'Min Inventory': calcMonthly(summary, ['minInventory_east', 'minInventory_west', 'minInventory_east-west']), //minInventory_east | minInventory_west | minInventory_east-west
            'Instructed Flow': calcMonthly(summary, [
              // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
              'instructedFlow_east',
              'instructedFlow_west',
              'instructedFlow_east-west'
            ]) //instructedFlow_east | instructedFlow_west | instructedFlow_east-west
          },
          shipperData: shipperDataTemp?.filter((f: any) => f?.shipperName !== null)
        }
      })
      ?.filter((f: any) => f?.shipperData?.length > 0)

    const ncontractArr = contractCode === 'Summary' || !!!contractCode ? [...new Set(contractArr)] : [contractCode]

    const gasDayShipperData : Map<string, any> = new Map()

    const dataNewData = dateArray?.map((e: any) => {
      const targetData = evidenResultLastCalc?.find((lastCalc: any) => lastCalc?.gas_day === e)
      const gasDay = dayjs(e, 'YYYY-MM-DD').format('DD/MM/YYYY')

      // ถ้ามีข้อมูลของวันนั้น (targetData) และมีเงื่อนไขกรองอย่างใดอย่างหนึ่ง
      // ให้ลดชุดข้อมูลให้เหลือเฉพาะ shipper/contract ที่ต้องการ ก่อนนำไปคำนวณ summary/accumulated
      if(targetData && (shipperId || shipperIdListArray.length > 0 || contractCode)){
        let newShipperData = []
        if(shipperId){
          newShipperData = targetData.shipperData?.filter((shipperData: any) => shipperData?.shipper === shipperId)
        }

        if(shipperIdListArray.length > 0){
          newShipperData = targetData.shipperData?.filter((shipperData: any) => shipperIdListArray.includes(shipperData?.shipper))
        }

        if(newShipperData.length > 0){
          // เขียนทับ shipperData ให้เป็นชุดที่กรองแล้ว เพื่อให้ขั้นตอนถัดไปคำนวณเฉพาะข้อมูลที่ต้องการ
          targetData.shipperData = newShipperData
        }
  
        if(contractCode && contractCode != 'Summary'){
          // ถ้าระบุ contractCode ให้กรอง contractData ภายใน shipper ให้เหลือเฉพาะ contract นั้น
          targetData.shipperData = targetData.shipperData?.map((shipperData: any) => {
            const newContractData = shipperData.contractData?.filter((contractData: any) => contractData?.contract === contractCode)
            shipperData.contractData = newContractData
            return shipperData
          })
        }

        // สรุปยอดสะสม (accumulated) ของทั้งวัน (gas_day) ใน targetData
        // - reduce ชั้นใน: รวมระดับ contract → เป็นยอดสะสมระดับ shipper
        // - reduce ชั้นนอก: รวมยอดสะสมของทุก shipper → เป็นยอดสะสมรวมทั้งระบบ/ทั้งกลุ่มที่กรองมา
        const summaryData: balanceReportDataType = targetData.shipperData?.reduce((accSummary: balanceReportDataType, shipperData: any) => {
          // รวมข้อมูล contractSummary ของทุก contract ภายใต้ shipper เดียวกัน
          // เพื่อได้ค่า shipperAccumulated (ยอดสะสมระดับ shipper)
          const summaryDataShipper: balanceReportDataType = shipperData.contractData?.reduce((accShipper: balanceReportDataType, contractData: any) => {
            const contractSummary = contractData.contractSummary

            // ฟังก์ชันนี้ทำหน้าที่ “สะสมค่า” จาก contractSummary เข้า accShipper
            return getBalanceReportAccumulatedData(accShipper, contractSummary)
          },
          {
            "Entry Point": null,
            "Exit": null,
            "Entry - Exit": null,
            "Fuel Gas": null,
            "Balancing Gas": null,
            "Change Min Inventory": null,
            "Shrinkagate": null,
            "Commissioning": null,
            "Gas Vent": null,
            "Other Gas": null,
            "Imbalance": null,
            "ImbalancePercen": null,
            "Acc. Imbqalance": null,
            "Min Inventory": null,
            "Instructed Flow": null
          })

          // เก็บยอดสะสมระดับ shipper ไว้ใน shipperData เพื่อให้ฝั่ง response ใช้งานได้
          shipperData.shipperAccumulated = summaryDataShipper

          // สะสมยอดของ shipper นี้เข้า summary รวม (accSummary)
          return getBalanceReportAccumulatedData(accSummary, summaryDataShipper)
        },
        {
          "Entry Point": null,
          "Exit": null,
          "Entry - Exit": null,
          "Fuel Gas": null,
          "Balancing Gas": null,
          "Change Min Inventory": null,
          "Shrinkagate": null,
          "Commissioning": null,
          "Gas Vent": null,
          "Other Gas": null,
          "Imbalance": null,
          "ImbalancePercen": null,
          "Acc. Imbqalance": null,
          "Min Inventory": null,
          "Instructed Flow": null
        })

        // เก็บยอดสะสมรวมของวันนั้นไว้ที่ targetData.accumulated
        targetData.accumulated = summaryData
      }

      
      gasDayShipperData.get(gasDay) || gasDayShipperData.set(gasDay, {
        gas_day: gasDay,
        data: targetData
      })
      return {
        gas_day: e
      }
    })

    const useData = [
      ...(((!!shipperId || !!shipperIdList) && contractCode !== 'Summary' && !!contractCode)
        ? []
        : ncontractArr?.map((cA: any) => ({
            key: cA,
            value: dataNewData?.map((e: any) => e)
          }))),
      {
        key:
          ((shipperId || shipperIdList) && contractCode !== 'Summary' && !!contractCode)
            ? contractCode
            : shipperId
              ? `Summary - ${groupMaster?.[0]?.name}` //
              : // ? shipperId //
                'Summary',
        keys:
          ((shipperId || shipperIdList) && contractCode !== 'Summary' && !!contractCode)
            ? contractCode
            : shipperId
              ? `${groupMaster?.[0]?.id_name}` //
              : // ? shipperId //
                'Summary',
        value: dataNewData?.map((e: any) => e)
      }
    ]

    let setDataUse = []
    let typeReport = null
    let typeReportList = null
    let typeReportDB = null


    console.log('shipperId : ', shipperId);
    console.log('shipperIdList : ', shipperIdList);
    console.log('contractCode : ', contractCode);
    console.log('useData : ', useData);
    console.log('evidenResultLastCalc : ', evidenResultLastCalc);

    if ((contractCode === 'Summary' || !!!contractCode) && !!!shipperId && !!!shipperIdList) {
      typeReport = 'Summary'
      typeReportDB = 'System'
      // เอาหมด CT multi + summary
      setDataUse = useData?.map((e: any, ix: number) => {
        const {key, value, keys} = e
        let valueUse = []
        if (useData.length > 1 && ix !== useData.length - 1) {
          valueUse = value?.map((v: any) => {
            const gas_day = v?.gas_day
            const findGasday = evidenResultLastCalc?.find((f: any) => f?.gas_day === gas_day)?.shipperData || [] //summary
            let CTData = null
            // console.log('--- findGasday : ', findGasday);
            
            for (let iShipperContract = 0; iShipperContract < findGasday.length; iShipperContract++) {
              const findContract = findGasday[iShipperContract]?.contractData?.find((f: any) => f?.contract?.trim() === key?.trim())
              // if(iShipperContract < 1){
              //   console.log('--- findGasday : ', findGasday);
              //   console.log('--- findGasday[iShipperContract]?.contractData : ', findGasday[iShipperContract]?.contractData);
              //   console.log('key : ', key);
              //   console.log('.... findContract : ', findContract);
              // }
              if (findContract) {
                // console.log('findContract : ', findContract);
                CTData = findContract?.contractSummary
              }
            }
            if (!!!CTData) {
              CTData = {
                'Entry Point': null,
                Exit: null,
                'Entry - Exit': null,
                'Fuel Gas': null,
                'Balancing Gas': null,
                'Change Min Inventory': null,
                Shrinkagate: null,
                Commissioning: null,
                'Gas Vent': null,
                'Other Gas': null,
                Imbalance: null,
                ImbalancePercen: null,
                'Acc. Imbqalance': null,
                'Min Inventory': null,
                'Instructed Flow': null // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
              }
            }

            return {
              gas_day,
              value: CTData
            }
          })
        } else {
          valueUse = value?.map((v: any) => {
            const gas_day = v?.gas_day
            const findGasday = evidenResultLastCalc?.find((f: any) => f?.gas_day === gas_day)?.summary || null
            let CTData = null
            if (!!!findGasday) {
              CTData = {
                'Entry Point': null,
                Exit: null,
                'Entry - Exit': null,
                'Fuel Gas': null,
                'Balancing Gas': null,
                'Change Min Inventory': null,
                Shrinkagate: null,
                Commissioning: null,
                'Gas Vent': null,
                'Other Gas': null,
                Imbalance: null,
                ImbalancePercen: null,
                'Acc. Imbqalance': null,
                'Min Inventory': null,
                'Instructed Flow': null // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
              }
            } else {
              CTData = findGasday
            }
            return {
              gas_day,
              value: CTData
            }
          })
        }
        return {
          key,
          keys,
          value: valueUse
        }
      })
    } else if ((!!shipperId || !!shipperIdList) && (contractCode === 'Summary' || !!!contractCode)) {
      typeReport = shipperId
      typeReportList = shipperIdListArray
      typeReportDB = 'Summary'
      // CT multi + sheet summary ชื่อ shipper
      setDataUse = useData
        ?.map((e: any, ix: number) => {
          const {key, value, keys} = e
          let valueUse = []
          if (useData.length > 1 && ix !== useData.length - 1) {
            // CT
            const checkCTbyShipper = evidenResultLastCalc?.find((f: any) => f?.shipperData?.find((sdF: any) => sdF?.contractData?.find((cdF: any) => cdF?.contract === key)))
            if (!!!checkCTbyShipper) {
              return null
            }
            valueUse = value?.map((v: any) => {
              const gas_day = v?.gas_day
              const findGasday = evidenResultLastCalc?.find((f: any) => f?.gas_day === gas_day)?.shipperData || [] //summary
              let CTData = null
              for (let iShipperContract = 0; iShipperContract < findGasday.length; iShipperContract++) {
                if (findGasday[iShipperContract]?.shipper === shipperId || shipperIdListArray.includes(findGasday[iShipperContract]?.shipper)) {
                  const findContract = findGasday[iShipperContract]?.contractData?.find((f: any) => f?.contract === key)
                  if (findContract) {
                    CTData = findContract?.contractSummary
                  }
                }
              }
              if (!!!CTData) {
                CTData = {
                  'Entry Point': null,
                  Exit: null,
                  'Entry - Exit': null,
                  'Fuel Gas': null,
                  'Balancing Gas': null,
                  'Change Min Inventory': null,
                  Shrinkagate: null,
                  Commissioning: null,
                  'Gas Vent': null,
                  'Other Gas': null,
                  Imbalance: null,
                  ImbalancePercen: null,
                  'Acc. Imbqalance': null,
                  'Min Inventory': null,
                  'Instructed Flow': null // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
                }
              }

              return {
                gas_day,
                value: CTData
              }
            })
          } else {
            // summary shipper
            valueUse = value?.map((v: any) => {
              const gas_day = v?.gas_day
              const findGasday = evidenResultLastCalc?.find((f: any) => f?.gas_day === gas_day)?.shipperData || [] //summary
              let CTData = null
              for (let iShipperContract = 0; iShipperContract < findGasday.length; iShipperContract++) {
                if (findGasday[iShipperContract]?.shipper === shipperId || shipperIdListArray.includes(findGasday[iShipperContract]?.shipper)) {
                  CTData = findGasday[iShipperContract]?.shipperSummary
                }
              }
              if (!!!CTData) {
                CTData = {
                  'Entry Point': null,
                  Exit: null,
                  'Entry - Exit': null,
                  'Fuel Gas': null,
                  'Balancing Gas': null,
                  'Change Min Inventory': null,
                  Shrinkagate: null,
                  Commissioning: null,
                  'Gas Vent': null,
                  'Other Gas': null,
                  Imbalance: null,
                  ImbalancePercen: null,
                  'Acc. Imbqalance': null,
                  'Min Inventory': null,
                  'Instructed Flow': null // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
                }
              }
              return {
                gas_day,
                value: CTData
              }
            })
          }

          return {
            key,
            keys,
            value: valueUse
          }
        })
        .filter((f: any) => f !== null)
    } else if ((!!shipperId || !!shipperIdList) && !!contractCode) {
      typeReport = contractCode
      typeReportList = shipperIdListArray
      typeReportDB = 'By Contract Code'
      // sheet summary ชื่อ CT
      setDataUse = useData
        ?.map((e: any, ix: number) => {
          const {key, value, keys} = e
          let valueUse = []
          // CT
          const checkCTbyShipper = evidenResultLastCalc?.find((f: any) => f?.shipperData?.find((sdF: any) => sdF?.contractData?.find((cdF: any) => cdF?.contract === key)))
          if (!!!checkCTbyShipper) {
            return null
          }
          valueUse = value?.map((v: any) => {
            const gas_day = v?.gas_day
            const findGasday = evidenResultLastCalc?.find((f: any) => f?.gas_day === gas_day)?.shipperData || [] //summary
            let CTData = null
            for (let iShipperContract = 0; iShipperContract < findGasday.length; iShipperContract++) {
              if (findGasday[iShipperContract]?.shipper === shipperId || shipperIdListArray.includes(findGasday[iShipperContract]?.shipper)) {
                const findContract = findGasday[iShipperContract]?.contractData?.find((f: any) => f?.contract === key)
                if (findContract) {
                  CTData = findContract?.contractSummary
                }
              }
            }
            if (!!!CTData) {
              CTData = {
                'Entry Point': null,
                Exit: null,
                'Entry - Exit': null,
                'Fuel Gas': null,
                'Balancing Gas': null,
                'Change Min Inventory': null,
                Shrinkagate: null,
                Commissioning: null,
                'Gas Vent': null,
                'Other Gas': null,
                Imbalance: null,
                ImbalancePercen: null,
                'Acc. Imbqalance': null,
                'Min Inventory': null,
                'Instructed Flow': null // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
              }
            }

            return {
              gas_day,
              value: CTData
            }
          })

          return {
            key,
            keys,
            value: valueUse
          }
        })
        .filter((f: any) => f !== null)
    }
    console.log('typeReportDB : ', typeReportDB);
    console.log('- - - - - setDataUse : ', setDataUse);
    const sumValue = setDataUse?.map((e: any) => {
      const {value, ...nE} = e

      const sumFn = (keys: any) => {
        const resDataCalc = value.reduce((accumulator, currentValue) => accumulator + currentValue?.value?.[keys], 0)
        return resDataCalc
      }

      const sumObj = {
        gas_day: 'sum',
        value: {
          'Entry Point': sumFn('Entry Point'),
          Exit: sumFn('Exit'),
          'Entry - Exit': sumFn('Entry - Exit'),
          'Fuel Gas': sumFn('Fuel Gas'),
          'Balancing Gas': sumFn('Balancing Gas'),
          'Change Min Inventory': sumFn('Change Min Inventory'),
          Shrinkagate: sumFn('Shrinkagate'),
          Commissioning: sumFn('Commissioning'),
          'Gas Vent': sumFn('Gas Vent'),
          'Other Gas': sumFn('Other Gas'),
          Imbalance: sumFn('Imbalance'),
          ImbalancePercen: sumFn('ImbalancePercen'),
          'Acc. Imbqalance': sumFn('Acc. Imbqalance'),
          'Min Inventory': sumFn('Min Inventory'),
          'Instructed Flow': sumFn('Instructed Flow') // เพิ่ม column Instructed flow แยกออกมา https://app.clickup.com/t/86ev5f77j
        }
      }
      const cFormat = value?.map((v: any) => {
        v['gas_day'] = dayjs(v['gas_day'], 'YYYY-MM-DD').format('DD/MM/YYYY')
        return v
      })
      const valueData = [...cFormat, sumObj]
      return {
        ...nE,
        value: valueData
      }
    })

    
    return {
      typeReportDB,
      typeReport,
      setDataUse: evidenApiData ? sumValue : [],
      gasDayShipperData: evidenApiData ? Array.from(gasDayShipperData.values()).sort((a: any, b: any) => a.gas_day.localeCompare(b.gas_day)) : []
    }
  }
  // request_number
  // execute_timestamp

  generateDatesInMonth = (year: number, month: number) => {
    const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`)
    const daysInMonth = start.daysInMonth()

    const dates = Array.from({length: daysInMonth}, (_, i) => start.add(i, 'day').format('YYYY-MM-DD'))

    return dates
  }

  async balancingMonthlyReport(payload: any, userId: any, ext?: any) {
    const {
      // start_date,
      // end_date,
      skip,
      limit,
      shipperId,
      month,
      year,
      version,
      contractCode,
      shipperIdList
    } = payload

    const startOfMonth = dayjs(`${year}-${month}-01`).startOf('month').format('YYYY-MM-DD')
    const endOfMonth = dayjs(`${year}-${month}-01`).endOf('month').format('YYYY-MM-DD')
    console.log('startOfMonth : ', startOfMonth);
    console.log('endOfMonth : ', endOfMonth);
    const {typeReportDB, setDataUse, typeReport, gasDayShipperData} = await this.balanceReportViewGet(
      {
        start_date: startOfMonth,
        end_date: endOfMonth,
        skip,
        limit,
        shipperId,
        contractCode,
        shipperIdList: shipperIdList ? `${shipperIdList}`.replace('HashNumberSign', '#') : shipperIdList
      },
      userId
    )

    return {
      typeReportDB,
      typeReport,
      setDataUse,
      gasDayShipperData
    }
  }

  async balancingMonthlyReportApproved(payload: any, userId: any, ext?: any) {
    // { typeReportDB, typeReport, setDataUse }
    const balancingMonthlyReport = await this.balancingMonthlyReport(payload, userId, ext)

    function getMonthNameFromNumber(monthNumber: string) {
      const month = dayjs(`2025-${monthNumber}-01`) // ใส่วันที่สมมติ เช่น 1 วัน เพื่อให้ dayjs สร้าง
      return month.format('MMMM') // 'MMMM' จะได้ชื่อเดือนเต็ม เช่น June
    }

    const monthText = payload && getMonthNameFromNumber(payload?.month) || "";
    const year = payload?.year || '';
    const monthYearFormat = `${monthText} ${year}`
    const contractCode = !!payload?.contractCode && payload?.contractCode !== 'Summary' ? payload?.contractCode : null
    const typeReport = balancingMonthlyReport?.typeReportDB

    const newDate = getTodayNowAdd7()

    const monthStart = newDate.startOf('month').toDate() // วันที่ 1 ของเดือนนี้ เวลา 00:00:00
    const monthEnd = newDate.endOf('month').toDate() // วันสุดท้ายของเดือนนี้ เวลา 23:59:59

    // rev

    // monthText
    // monthYearFormat
    console.log('monthText : ', monthText);
    console.log('monthYearFormat : ', monthYearFormat);

    const revCount = await this.prisma.balancing_monthly_report_approved.count({
      where: {
        monthText: monthYearFormat,
      }
    })
    // console.log('revCount : ', revCount);
    // const monthlyCount = await this.prisma.balancing_monthly_report_approved.count({
    //   where: {
    //     monthText: monthText,
    //     create_date: {
    //       gte: monthStart, // มากกว่าหรือเท่ากับวันที่ 1
    //       lte: monthEnd // น้อยกว่าหรือเท่ากับวันสุดท้าย
    //     }
    //   }
    // })

    // // const fileRun = `${dayjs(newDate).format('YYYYMMDD')} Monthly Report ${monthlyCount > 0 ? monthlyCount + 1 : 1}`
    // const monthlyCountAll = await this.prisma.balancing_monthly_report_approved.count({
    //   where: {}
    // })
    // const fileRun = `${dayjs(newDate).format('YYYYMMDD')} Monthly Report ${monthYearFormat} (Rev.${monthlyCountAll > 0 ? monthlyCountAll + 1 : 1})`
    const fileRun = `${dayjs(newDate).format('YYYYMMDD')} Monthly Report ${monthYearFormat} (Rev.${revCount > 0 ? revCount + 1 : 1})`
    const version = `V.${revCount > 0 ? revCount + 1 : 1}`

    const create = await this.prisma.balancing_monthly_report_approved.create({
      data: {
        rev: revCount > 0 ? revCount + 1 : 1,
        monthText: monthYearFormat,
        contractCode,
        file: fileRun,
        version,
        typeReport,
        jsonData: JSON.stringify(balancingMonthlyReport),
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })
    return {
      monthText: monthYearFormat,
      contractCode,
      file: fileRun,
      version,
      typeReport,
      jsonData: JSON.stringify(balancingMonthlyReport)
    }
  }

  async balancingMonthlyReportDownload() {
    const allMonthly = await this.prisma.balancing_monthly_report_approved.findMany({
      where: {},
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        id: 'desc'
      }
    })

    return allMonthly
  }

  async balancingMonthlyReportDownloadUse(response: any, id: any, userId: any) {
    const allMonthly = await this.prisma.balancing_monthly_report_approved.findFirst({
      where: {
        id: Number(id)
      }
    })
    const dataD = JSON.parse(allMonthly['jsonData'])
    // const fName = allMonthly ? `Allocation Monthly Report ${allMonthly?.monthText} (Rev.${allMonthly?.version?.split('V.')?.[1]})` : allMonthly['file']
    const fName = allMonthly ? `Allocation Monthly Report ${allMonthly?.monthText} (Rev.${allMonthly?.rev})` : allMonthly['file']
    console.log('fName : ', fName);
    await this.exportFilesService.exportDataToExcelNewMontlyBalancing(
      dataD,
      response,
      fName,
      // userId,
      allMonthly && allMonthly?.create_by || null // https://app.clickup.com/t/86eujrga5
    )
  }
  
  async systemAccImbalanceInventory2(payload: any, userId: any) {
    const {gas_day, skip, limit, shipper_id, execute_timestamp, lasted_version} = payload

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_system_acc_imb',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_system_acc_imb'
    )

    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(gas_day).toDate()
    const todayEnd = getTodayEndYYYYMMDDDfaultAdd7(gas_day).toDate()

    const todayModeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          gte: todayStart,
          lte: todayEnd
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: [
        {
        start_date: 'desc'
      },
      {
        create_date: "desc"
      }
      ]
    })

    let lastetModeBeforeToday = []

    const modeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          lt: todayStart
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        start_date: 'desc'
      }
    })

    lastetModeBeforeToday = modeZone.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => isMatch(item.zone?.name, current.zone?.name))

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.start_date > acc[existingIndex]?.start_date) {
        acc[existingIndex] = current
      }
      else if (current.start_date == acc[existingIndex]?.start_date && dayjs(current.create_date).isAfter(dayjs(acc[existingIndex]?.create_date))) {
        acc[existingIndex] = current
      }

      return acc
    }, [])

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: todayStart,
          lte: todayEnd
        }
      }
    })

    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: todayStart
            }
          },
          {
            gas_day: {
              lte: todayEnd
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })

    const groupMasterCheck = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      },
      include: {
        contract_code: {
          where: {
            AND: [
              {
                status_capacity_request_management_id: {
                  in: [2, 5]
                }
              }, // Approved
              {
                contract_start_date: {
                  lte: todayEnd
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
                      gt: todayStart
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
                          gt: todayStart
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
                              gt: todayStart
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
          include: {
            booking_version: {
              where: {
                flag_use: true
              },
              include: {
                // booking_full_json: true,
                booking_row_json: true
              },
              take: 1,
              orderBy: {
                id: 'desc'
              }
            }
          }
        }
      }
    })
    const userType = groupMasterCheck?.user_type_id

    let dataEvuent = evidenApiCenter?.data || []

    // If not admin or TSO filter data by shipper group
    if (userType && userType != 1 && userType != 2) {
      let uniqueZones = []
      groupMasterCheck.contract_code.map((contract) => {
        contract.booking_version.map((version) => {
          version.booking_row_json.map((row) => {
            if (row.zone_text && !uniqueZones.some((zone) => isMatch(zone, row.zone_text))) {
              uniqueZones.push(row.zone_text)
            }
          })
        })
      })

      dataEvuent = dataEvuent.filter((item: any) => {
        return uniqueZones.some((zone) => isMatch(zone, item.zone))
      })
    }

    const matchWithExecuteList = dataEvuent.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day')
      })
    })

    const publishData = matchWithExecuteList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData?.execute_timestamp && unpublishData?.gas_day_text === evidenData?.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
      })
    })

    // Get the latest execute_timestamp for each unique combination of gas_day, gas_hour, zone, and mode
    const latestPublishData = publishData.reduce((acc: any[], current: any) => {
      // const key = `${current.gas_day}_${current.gas_hour}_${current.zone}_${current.mode}`;
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour && item.zone === current.zone && item.mode === current.mode)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, [])

    if (latestPublishData.length > 0) {
      const uniqueZones = [...new Set(latestPublishData.map((data: any) => data.zone))]

      let hourData = []
      for (let i = 0; i <= 24; i++) {
        for (const zone of uniqueZones) {
          const modeOfThisHourAndZone = todayModeZone.filter((modeZone: any) => {
            const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H'))
            const gasMinute = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('mm'))

            return gasHour == i && isMatch(modeZone?.zone?.name, `${zone}`) && gasMinute == 0
          })

          let activeMode = undefined
          if (modeOfThisHourAndZone.length > 0) {
            // if must prorate do it here
            // just get the lastet for now
            modeOfThisHourAndZone.sort((a: any, b: any) => {
              const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
              if (startDateDiff !== 0) {
                return startDateDiff
              }
              return dayjs(b.create_date).diff(dayjs(a.create_date))
            })
            activeMode = modeOfThisHourAndZone[0]
          } else {
            let todayModeOfZoneBeforeThisHour = todayModeZone.filter((modeZone: any) => {
              const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
              return gasHour < i && modeZone && isMatch(modeZone?.zone?.name, `${zone}`)
            })

            if (todayModeOfZoneBeforeThisHour.length > 0) {
              todayModeOfZoneBeforeThisHour.sort((a: any, b: any) => {
                const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
                if (startDateDiff !== 0) {
                  return startDateDiff
                }
                return dayjs(b.create_date).diff(dayjs(a.create_date))
              })
              activeMode = todayModeOfZoneBeforeThisHour[0]
            } else {
              activeMode = lastetModeBeforeToday.find((f: any) => isMatch(f?.zone?.name, `${zone}`))
            }
          }

          const thisHourData = latestPublishData && latestPublishData?.find((evidenData: any) => {
            return evidenData?.gas_hour === i && isMatch(evidenData?.mode, activeMode?.mode?.mode) && isMatch(evidenData?.zone, `${zone}`)
          }) || null

          let value = {
            totalAccImbInv_percentage: null,
            high_max_percentage: null,
            high_dd_percentage: null,
            high_red_percentage: null,
            high_orange_percentage: null,
            high_alert_percentage: null,
            low_max_percentage: null,
            low_dd_percentage: null,
            low_red_percentage: null,
            low_orange_percentage: null,
            low_alert_percentage: null
          }

          if (thisHourData) {
            value['totalAccImbInv_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'totalAccImbInv_percentage')?.value ?? null
            value['high_max_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_max_percentage')?.value ?? null
            value['high_dd_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_dd_percentage')?.value ?? null
            value['high_red_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_red_percentage')?.value ?? null
            value['high_orange_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_orange_percentage')?.value ?? null
            value['high_alert_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_alert_percentage')?.value ?? null
            value['low_max_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_max_percentage')?.value ?? null
            value['low_dd_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_dd_percentage')?.value ?? null
            value['low_red_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_red_percentage')?.value ?? null
            value['low_orange_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_orange_percentage')?.value ?? null
            value['low_alert_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_alert_percentage')?.value ?? null
          }

          const existingIndex = hourData.findIndex((data: any) => data.gas_hour === i)
          if (existingIndex >= 0) {
            if (hourData[existingIndex].activeMode?.start_date < activeMode?.start_date) {
              hourData[existingIndex].mode = thisHourData ? (thisHourData.mode ?? activeMode?.mode?.mode) : null
              hourData[existingIndex].zone = thisHourData ? zone : null
              hourData[existingIndex].value = value
              hourData[existingIndex].activeMode = activeMode
            }
            hourData[existingIndex].valueOfEachZone[`${zone}`] = value
          } else {
            hourData.push({
              gas_hour: i,
              gas_hour_text: i >= 10 ? `${i}:00` : `0${i}:00`,
              mode: thisHourData ? (thisHourData.mode ?? activeMode?.mode?.mode) : null,
              zone: thisHourData ? zone : null,
              value: value,
              valueOfEachZone: {
                [`${zone}`]: value
              },
              activeMode
            })
          }
        }
      }

      const dataUse = {
        templateLabelKeys: [
          {
            lebel: 'EAST',
            color: '#dbe4fe',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'WEST',
            color: '#fdcee3',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'High Max',
            color: '#535353',
            key: 'high_max_percentage',
            type: 'line'
          },
          {
            lebel: 'High Difficult Day',
            color: '#824ba6',
            key: 'high_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'High Red',
            color: '#da1610',
            key: 'high_red_percentage',
            type: 'line'
          },
          {
            lebel: 'High Orange',
            color: '#f56f16',
            key: 'high_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert High',
            color: '#eac12a',
            key: 'high_alert_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Min',
            color: '#535353',
            key: 'low_max_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Difficult Day',
            color: '#824ba6',
            key: 'low_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Red',
            color: '#da1610',
            key: 'low_red_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Orange',
            color: '#f56f16',
            key: 'low_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert Low',
            color: '#eac12a',
            key: 'low_alert_percentage',
            type: 'line'
          }
        ],
        data: [
          {
            gas_day: gas_day,
            hour: hourData
          }
        ]
      }
      return dataUse
    } else {
      const dataUse = {
        templateLabelKeys: [
          {
            lebel: 'EAST',
            color: '#dbe4fe',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'WEST',
            color: '#fdcee3',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'High Max',
            color: '#535353',
            key: 'high_max_percentage',
            type: 'line'
          },
          {
            lebel: 'High Difficult Day',
            color: '#824ba6',
            key: 'high_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'High Red',
            color: '#da1610',
            key: 'high_red_percentage',
            type: 'line'
          },
          {
            lebel: 'High Orange',
            color: '#f56f16',
            key: 'high_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert High',
            color: '#eac12a',
            key: 'high_alert_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Min',
            color: '#535353',
            key: 'low_max_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Difficult Day',
            color: '#824ba6',
            key: 'low_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Red',
            color: '#da1610',
            key: 'low_red_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Orange',
            color: '#f56f16',
            key: 'low_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert Low',
            color: '#eac12a',
            key: 'low_alert_percentage',
            type: 'line'
          }
        ],
        data: []
      }
      return dataUse
    }
  }

  async intradayBalancingReport2(payload: any, userId: any) {
    const {gas_day, start_hour, end_hour, skip, limit, latest_daily_version, latest_hourly_version, show_total, show_total_all_shipper, only_public, shipper: shipperArr} = payload

    const todayStart = getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
    const todayEnd = getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
    const groupMaster = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
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

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: todayStart,
          lte: todayEnd
        }
      }
    })

    const publicationCenter = await this.prisma.publication_center.findMany({
      where: {
        gas_day_text: gas_day
      }
    })

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day: gas_day,
        start_hour: start_hour ? Number(start_hour) : 1,
        end_hour: end_hour ? Number(end_hour) : 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_balance_report',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day: gas_day, // 2025-01-01 to 2025-02-28
        start_hour: start_hour ? Number(start_hour) : 1,
        end_hour: end_hour ? Number(end_hour) : 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_intraday_balance_report'
    )

    const newData = evidenApiCenter?.data || []
    // validation

    const matchWithExecuteList = newData.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day') && executeData.gas_hour == item.gas_hour
      })
    })

    let numHour = 0
    const newDataNewData = await Promise.all(
      matchWithExecuteList?.map(async (e: any) => {
        const {nomination_values, balance_values, shipper_data, gas_day, gas_hour, ...nE} = e

        const publication = !publicationCenter.some((publication: any) => {
          return publication.gas_day_text === gas_day && publication.gas_hour === gas_hour && publication.execute_timestamp === nE.execute_timestamp && publication.del_flag === true
        })

        const gasDay = dayjs(gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY')
        const gasHour = `${gas_hour > 10 ? gas_hour + ':00' : '0' + gas_hour + ':00'}` || null
        const timestamp = dayjs(e['execute_timestamp'] * 1000).format('DD/MM/YYYY HH:mm')
        // const totalAllPlanning = {
        //   gas_day: `TOTAL ALL : (${gasDay})`,
        //   ...Object.fromEntries(Array.isArray(nomination_values) ? nomination_values.map((item) => [item?.tag, item?.value]) : []),
        //   ...Object.fromEntries(Array.isArray(nomination_values) ? nomination_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
        // }

        // const totalAllActual = {
        //   gas_day: `TOTAL ALL : (${gasDay})`,
        //   // validation
        //   ...Object.fromEntries(Array.isArray(balance_values) ? balance_values.map((item) => [item?.tag, item?.value]) : []),
        //   ...Object.fromEntries(Array.isArray(balance_values) ? balance_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
        // }
        const totalAllPlanning = {
          gas_day: `TOTAL ALL : (${gasDay})`,
          gas_day_2: gasDay,
          gas_hour: gasHour,
          timestamp: timestamp,
          shipper_name: '',
          ...Object.fromEntries(Array.isArray(nomination_values) ? nomination_values.map((item) => [item?.tag, item?.value]) : []),
          ...Object.fromEntries(Array.isArray(nomination_values) ? nomination_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
        }

        const totalAllActual = {
          gas_day: `TOTAL ALL : (${gasDay})`,
          gas_day_2: gasDay,
          gas_hour: gasHour,
          timestamp: timestamp,
          shipper_name: '',
          // validation
          ...Object.fromEntries(Array.isArray(balance_values) ? balance_values.map((item) => [item?.tag, item?.value]) : []),
          ...Object.fromEntries(Array.isArray(balance_values) ? balance_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
        }

        const shipperData = await Promise.all(
          shipper_data?.map(async (sd: any) => {
            const {nomination_values: shipper_nomination_values, balance_values: shipper_balance_values, contract_data, shipper, ...nSd} = sd

            const findShipperName: any =
              groupMaster?.find((f: any) => {
                return f?.id_name === sd['shipper']
              }) || ''

            // const totalShipperPlanning = {
            //   gas_day: `TOTAL : ${findShipperName?.name} (${gasDay})`,
            //   ...Object.fromEntries(Array.isArray(shipper_nomination_values) ? shipper_nomination_values.map((item) => [item?.tag, item?.value]) : []),
            //   ...Object.fromEntries(Array.isArray(shipper_nomination_values) ? shipper_nomination_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
            // }

            // const totalShipperActual = {
            //   gas_day: `TOTAL : ${findShipperName?.name} (${gasDay})`,
            //   ...Object.fromEntries(Array.isArray(shipper_balance_values) ? shipper_balance_values.map((item) => [item?.tag, item?.value]) : []),
            //   ...Object.fromEntries(Array.isArray(shipper_balance_values) ? shipper_balance_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
            // }

            const totalShipperPlanning = {
              gas_day: `TOTAL : ${findShipperName?.name} (${gasDay})`,
              gas_day_2: gasDay,
              gas_hour: gasHour,
              timestamp: timestamp,
              shipper_name: findShipperName?.name,
              ...Object.fromEntries(Array.isArray(shipper_nomination_values) ? shipper_nomination_values.map((item) => [item?.tag, item?.value]) : []),
              ...Object.fromEntries(Array.isArray(shipper_nomination_values) ? shipper_nomination_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
            }
            const totalShipperActual = {
              gas_day: `TOTAL : ${findShipperName?.name} (${gasDay})`,
              gas_day_2: gasDay,
              gas_hour: gasHour,
              timestamp: timestamp,
              shipper_name: findShipperName?.name,
              ...Object.fromEntries(Array.isArray(shipper_balance_values) ? shipper_balance_values.map((item) => [item?.tag, item?.value]) : []),
              ...Object.fromEntries(Array.isArray(shipper_balance_values) ? shipper_balance_values.map((item) => [`validation_${item?.tag}`, item?.validation || null]) : [])
            }
            // ---------

            // advali
            const contractData = await Promise.all(
              contract_data?.map(async (cd: any) => {
                const {nomination_values: contract_nomination_values, balance_values: contract_balance_values, contract, ...nCd} = cd

                // เช็คค่าเดิมก่อน
                if (gas_hour > numHour) {
                  numHour = gas_hour
                }

                const valueContractPlanning = {
                  publication,
                  execute_timestamp: e['execute_timestamp'],
                  gas_day: gasDay,
                  gas_day_text: e['gas_day'],
                  gas_hour: gasHour,
                  gas_hour_num: gas_hour,
                  shipper: findShipperName?.id_name || sd['shipper'],
                  shipper_name: findShipperName?.name,
                  contract,
                  timestamp: timestamp,
                  ...Object.fromEntries(Array.isArray(contract_nomination_values) ? contract_nomination_values.map((item) => [item?.tag, item?.value]) : [])
                }
                const valueContractActual = {
                  publication,
                  execute_timestamp: e['execute_timestamp'],
                  gas_day: gasDay,
                  gas_day_text: e['gas_day'],
                  gas_hour: gasHour,
                  gas_hour_num: gas_hour,
                  shipper: findShipperName?.id_name || sd['shipper'],
                  shipper_name: findShipperName?.name,
                  contract,
                  timestamp: timestamp,
                  ...Object.fromEntries(Array.isArray(contract_balance_values) ? contract_balance_values.map((item) => [item?.tag, item?.value]) : [])
                }

                return {
                  valueContractPlanning,
                  valueContractActual
                }
              })
            )

            const shipperName = findShipperName ? findShipperName?.name : ''

            return {
              ...nSd,
              shipper,
              shipperName,
              contractData,
              totalShipperPlanning,
              totalShipperActual
            }
          })
        )

        return {
          gas_day: gas_day || null,
          gas_hour: gas_hour,
          ...nE,
          shipperData: shipperData || null,
          totalAllPlanning,
          totalAllActual
        }
      })
    )
    console.log('newDataNewData : ', newDataNewData);
    console.log('shipperArr : ', shipperArr);
    // filter shipper
    const shipperIdName = shipperArr // NGP-S01-002
    let fShipperData = []
    if (!!shipperIdName && shipperIdName.length > 0) {
      let cutShipper = []
      for (let i = 0; i < newDataNewData.length; i++) {
        let shipperArr = []
        const {shipperData, ...nNewDataNewData} = newDataNewData[i]

        for (let iShipper = 0; iShipper < shipperData.length; iShipper++) {
          const {shipper} = shipperData[iShipper]
          if (shipperIdName.includes(shipper)) {
            shipperArr.push({
              ...shipperData[iShipper]
            })
          }
        }
        if (shipperArr.length > 0) {
          cutShipper.push({
            ...nNewDataNewData,
            shipperData: shipperArr
          })
        }
      }

      fShipperData = cutShipper
    } else {
      fShipperData = newDataNewData
    }

    let fOnlyPublicData = []
    if (only_public) {
      let cutOnluPublic = []
      for (let i = 0; i < fShipperData.length; i++) {
        let publicArr = []
        const {shipperData, ...nNewDataNewData} = fShipperData[i]

        for (let iShipper = 0; iShipper < shipperData.length; iShipper++) {
          const {contractData} = shipperData[iShipper]
          let contractArr = []
          for (let iContract = 0; iContract < contractData.length; iContract++) {
            const {valueContractPlanning, valueContractActual} = contractData[iContract]

            if (valueContractPlanning?.publication && valueContractActual?.publication) {
              contractArr.push({
                ...contractData[iContract]
              })
            }
          }
          if (contractArr.length > 0) {
            publicArr.push({
              ...shipperData[iShipper]
            })
          }
        }
        if (publicArr.length > 0) {
          cutOnluPublic.push({
            ...nNewDataNewData,
            shipperData: publicArr
          })
        }
      }

      fOnlyPublicData = cutOnluPublic
    } else {
      fOnlyPublicData = fShipperData
    }

    if (latest_hourly_version) {
      // Group by gas_day and gas_hour, then get the latest timestamp for each group
      const groupedByHour = new Map()

      fOnlyPublicData.forEach((item: any) => {
        const key = `${item.gas_day}_${item.gas_hour}`
        if (!groupedByHour.has(key) || compareTimestamps(item.execute_timestamp, groupedByHour.get(key).execute_timestamp) > 0) {
          groupedByHour.set(key, item)
        }
      })

      fOnlyPublicData = Array.from(groupedByHour.values())
    }

    if (latest_daily_version) {
      // First, group by gas_day, zone, and mode to get the latest gas_hour for each group
      const groupedByLatestHour = new Map()
      fOnlyPublicData.forEach((item: any) => {
        const key = `${item.gas_day}`

        if (!groupedByLatestHour.has(key) || compareGasHour(item.gas_hour, groupedByLatestHour.get(key).gas_hour) > 0) {
          groupedByLatestHour.set(key, item)
        }
      })

      // Then, from the latest gas_hour records, get the latest timestamp for each group
      const groupedByDay = new Map()
      Array.from(groupedByLatestHour.values()).forEach((item: any) => {
        const key = `${item.gas_day}`

        if (!groupedByDay.has(key) || compareTimestamps(item.execute_timestamp, groupedByDay.get(key).execute_timestamp) > 0) {
          groupedByDay.set(key, item)
        }
      })
      fOnlyPublicData = Array.from(groupedByDay.values())
    }
    console.log('fOnlyPublicData : ', fOnlyPublicData);

    return fOnlyPublicData
  }

  async intradayBaseInentoryShipper2(payload: any, userId: any) {
    console.log('////');
    const {gas_day, zone, mode, active_mode, latest_daily_version, latest_hourly_version, timestamp, start_date, end_date, skip, limit} = payload

    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(gas_day).toDate()
    const todayEnd = getTodayEndYYYYMMDDDfaultAdd7(gas_day).toDate()

    const currentUserShipperList = await this.prisma.group.findMany({
      where: {
        AND: [
          {
            account_manage: {
              some: {
                account_id: Number(userId)
              }
            }
          },
          {
            user_type_id: 3
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
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      }
    })
    const isShipper = currentUserShipperList.length > 0

    const shipperList = await this.prisma.group.findMany({
      where: {
        // account_manage: {
        //   some: {
        //     account_id: Number(userId),
        //   },
        // },
        AND: [
          {
            user_type_id: 3
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
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      }
    })

    const zoneList = await this.prisma.zone.findMany({
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
      }
    })

    let shipperEvidenData = []

    let totalRecordByShipper: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_acc_imb_inventory_by_shipper',
      (total_record: number) => {
        totalRecordByShipper = total_record
      }
    )
    const balance_intraday_acc_imb_inventory_by_shipper: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: '1',
        end_hour: '24',
        skip: totalRecordByShipper ? 0 : Number(skip),
        limit: totalRecordByShipper ? totalRecordByShipper : Number(limit)
      },
      'balance_intraday_acc_imb_inventory_by_shipper'
    )
    shipperEvidenData = balance_intraday_acc_imb_inventory_by_shipper?.data || []
    if (isShipper) {
      shipperEvidenData = shipperEvidenData.filter((evidenData: any) => {
        const shipperData =
          evidenData?.shipper_data?.filter((shipperData: any) => {
            return currentUserShipperList.some((f: any) => f.id_name === shipperData.shipper)
          }) ?? []

        if (shipperData.length > 0) {
          if (evidenData) evidenData.shipper_data = shipperData
          return evidenData
        }

        return false
      })
    }

    if (zone) {
      shipperEvidenData = shipperEvidenData.filter((evidenData: any) => {
        return isMatch(evidenData.zone, zone)
      })
    }

    if (mode) {
      shipperEvidenData = shipperEvidenData.filter((evidenData: any) => {
        return isMatch(evidenData.mode, mode)
      })
    }

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_acc_imb_inventory',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const balance_intraday_acc_imb_inventory: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: '1',
        end_hour: '24',
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_intraday_acc_imb_inventory'
    )

    const todayModeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          gte: todayStart,
          lte: todayEnd
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        start_date: 'desc'
      }
    })

    let lastetModeBeforeToday = []

    const modeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          lt: todayStart
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        start_date: 'desc'
      }
    })

    lastetModeBeforeToday = modeZone.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => isMatch(item.zone?.name, current.zone?.name))

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.start_date > acc[existingIndex]?.start_date) {
        acc[existingIndex] = current
      }
      else if (current.start_date == acc[existingIndex]?.start_date && dayjs(current.create_date).isAfter(dayjs(acc[existingIndex]?.create_date))) {
        acc[existingIndex] = current
      }

      return acc
    }, [])

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: todayStart,
          lte: todayEnd
        }
      }
    })

    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: todayStart
            }
          },
          {
            gas_day: {
              lte: todayEnd
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })

    const systemEvidenData = balance_intraday_acc_imb_inventory?.data || []

    const formatedShipperData: any[] = []

    shipperEvidenData.map((evidenData: any) => {
      const {values, shipper_data, ...evidenDataWithoutValues} = evidenData

      const modeOfThisHourAndZone = todayModeZone.filter((modeZone: any) => {
        const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H'))
        return gasHour == evidenDataWithoutValues?.gas_hour && modeZone && isMatch(modeZone?.zone?.name, evidenDataWithoutValues?.zone)
      })

      let activeMode = undefined
      if (modeOfThisHourAndZone.length > 0) {
        // if must prorate do it here
        // just get the lastet for now
        modeOfThisHourAndZone.sort((a: any, b: any) => {
          const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
          if (startDateDiff !== 0) {
            return startDateDiff
          }
          return dayjs(b.create_date).diff(dayjs(a.create_date))
        })
        activeMode = modeOfThisHourAndZone[0]
      } else {
        let todayModeOfZoneBeforeThisHour = todayModeZone.filter((modeZone: any) => {
          const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
          return gasHour < evidenDataWithoutValues?.gas_hour && modeZone && isMatch(modeZone?.zone?.name, evidenDataWithoutValues?.zone)
        })

        if (todayModeOfZoneBeforeThisHour.length > 0) {
          todayModeOfZoneBeforeThisHour.sort((a: any, b: any) => {
            const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
            if (startDateDiff !== 0) {
              return startDateDiff
            }
            return dayjs(b.create_date).diff(dayjs(a.create_date))
          })
          activeMode = todayModeOfZoneBeforeThisHour[0]
        } else {
          activeMode = lastetModeBeforeToday.find((f: any) => isMatch(f?.zone?.name, evidenDataWithoutValues.zone))
        }
      }

      if ((activeMode && isMatch(activeMode?.mode?.mode, evidenDataWithoutValues?.mode)) || !isShipper) {
        const baseDataForGetHv = systemEvidenData.find(
          (systemData: any) =>
            systemData?.gas_day === evidenDataWithoutValues?.gas_day &&
            systemData?.gas_hour === evidenDataWithoutValues?.gas_hour &&
            systemData?.zone === evidenDataWithoutValues?.zone &&
            systemData?.mode === evidenDataWithoutValues?.mode &&
            systemData?.request_number === evidenDataWithoutValues?.request_number &&
            systemData?.execute_timestamp === evidenDataWithoutValues?.execute_timestamp
        )

        const zoneObj = zoneList.find((zone) => isMatch(zone.name, evidenDataWithoutValues.zone))

        const heatingValue = baseDataForGetHv
          ? (baseDataForGetHv?.values?.find((f: any) => {
              return f?.tag === 'heatingValue_base'
            }) ?? null)
          : null

        const heatingValue_base = heatingValue?.value ?? null

        shipper_data.map((shipperData: any) => {
          const shipperValues = shipperData.values
          if (heatingValue) {
            shipperValues.push(heatingValue)
          }

          const groupObj = shipperList.find((shipper) => shipper.id_name === shipperData.shipper)

          formatedShipperData.push({
            ...evidenDataWithoutValues,
            shipper: shipperData.shipper,
            groupObj,
            zoneObj,
            timestamp: dayjs(evidenDataWithoutValues.execute_timestamp * 1000).format('DD/MM/YYYY HH:mm:ss'),
            heatingValue_base,
            values: shipperValues,
            activeMode
          })
        })
      }
    })

    const matchWithExecuteList = formatedShipperData.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day')
      })
    })

    const publishData = matchWithExecuteList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData?.execute_timestamp && unpublishData?.gas_day_text === evidenData?.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
      })
    })

    let resData = publishData
    if (timestamp) {
      const filterTimestamp = getTodayNowDDMMYYYYHHmmDfaultAdd7(timestamp)
      if (filterTimestamp.isValid()) {
        resData = publishData.filter((item: any) => {
          let itemTimestamp = getTodayNowDDMMYYYYHHmmDfaultAdd7(item.timestamp)
          if (!itemTimestamp.isValid()) {
            itemTimestamp = getTodayNowAdd7(item.timestamp)
          }
          return itemTimestamp.isValid() && itemTimestamp.isSame(filterTimestamp, 'minute')
        })
      }
    }

    // if (latest_hourly_version) {
    //   // Group by gas_day and gas_hour, then get the latest timestamp for each group
    //   const groupedByHour = new Map()

    //   resData.forEach((item: any) => {
    //     // const key = `${item.gas_day}_${item.gas_hour || 'null'}_${item.shipper}_${item.zone}_${item.mode}`
    //     // const key = `${item.gas_day}_${item.gas_hour}_${item.shipper}`
    //     const key = `${item.gas_day}_${item.gas_hour}_${item.shipper}_${item.zone}_${item.mode}`
    //     if (!groupedByHour.has(key) || compareTimestamps(item.execute_timestamp, groupedByHour.get(key).execute_timestamp) > 0) {
    //       groupedByHour.set(key, item)
    //     }
    //   })

    //   resData = Array.from(groupedByHour.values())
    // }
    if (latest_hourly_version) {
        const latestTimestampByHour = new Map<string, any>()

        // หา timestamp ล่าสุดของแต่ละ Gas Day + Gas Hour
        resData.forEach((item: any) => {
          const key = `${item.gas_day}_${item.gas_hour}`
          const currentLatest = latestTimestampByHour.get(key)

          if (
            !currentLatest ||
            compareTimestamps(
              item.execute_timestamp,
              currentLatest
            ) > 0
          ) {
            latestTimestampByHour.set(key, item.execute_timestamp)
          }
        })

        // เอาทุก row ที่เป็น timestamp ล่าสุดของชั่วโมงนั้น
        resData = resData.filter((item: any) => {
          const key = `${item.gas_day}_${item.gas_hour}`
          const latestTimestamp = latestTimestampByHour.get(key)

          return (
            compareTimestamps(
              item.execute_timestamp,
              latestTimestamp
            ) === 0
          )
        })
      }

    if (latest_daily_version) {
      // First, group by gas_day, zone, and mode to get the latest gas_hour for each group
      const groupedByLatestHour = new Map()
      resData.forEach((item: any) => {
        const key = `${item.gas_day}_${item.zone}_${item.shipper}_${item.mode}`

        if (!groupedByLatestHour.has(key) || compareGasHour(item.gas_hour, groupedByLatestHour.get(key).gas_hour) > 0) {
          groupedByLatestHour.set(key, item)
        }
      })

      // Then, from the latest gas_hour records, get the latest timestamp for each group
      const groupedByDay = new Map()
      Array.from(groupedByLatestHour.values()).forEach((item: any) => {
        const key = `${item.gas_day}_${item.zone}_${item.shipper}_${item.mode}`

        if (!groupedByDay.has(key) || compareTimestamps(item.execute_timestamp, groupedByDay.get(key).execute_timestamp) > 0) {
          groupedByDay.set(key, item)
        }
      })
      resData = Array.from(groupedByDay.values())
    }

    return resData
  }

  async intradayAccImbalanceDashboard2(payload: any, userId: any) {
    const {gas_day, skip, limit, shipper_id, execute_timestamp, lasted_version, isSystemValue, tab, shipper} = payload

    let nDataTempAll = []
    const mapShipperIDWithName: Record<string, string> = {}
    if (gas_day) {
      const datesArray = Array.from({
        length: 3
      }).map((_, i) => dayjs(gas_day).subtract(i, 'day').format('YYYY-MM-DD'))

      for (let iDay = 0; iDay < datesArray.length; iDay++) {
        const gasDay = getTodayNowYYYYMMDDDfaultAdd7(datesArray[iDay]).toDate()
        const gasDayStart = getTodayStartYYYYMMDDDfaultAdd7(datesArray[iDay]).toDate()
        const gasDayEnd = getTodayEndYYYYMMDDDfaultAdd7(datesArray[iDay]).toDate()

        const groupMaster = await this.prisma.group.findMany({
          where: {
            user_type_id: 3,
            ...(shipper &&
              shipper.length > 0 && {
                id_name: {
                  in: shipper
                }
              }),
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
                      gt: gasDay
                    }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          }
        })

        const todayModeZone = await this.prisma.mode_zone_base_inventory.findMany({
          where: {
            start_date: {
              gte: gasDayStart,
              lte: gasDayEnd
            },
            // zone: {
            //   name: {
            //     equals: tab,
            //     mode: 'insensitive'
            //   }
            // }
          },
          include: {
            zone: true,
            mode: true,
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          },
           orderBy: [
            {
            start_date: 'desc'
          },
          {
            create_date: 'desc'
          }
          ],
        })
        console.log('todayModeZone : ', todayModeZone);

        let lastetModeBeforeToday = []

        const modeZone = await this.prisma.mode_zone_base_inventory.findMany({
          where: {
            start_date: {
              lt: gasDayStart
            },
            zone: {
              name: {
                equals: tab,
                mode: 'insensitive'
              }
            }
          },
          include: {
            zone: true,
            mode: true,
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          },
          orderBy: [
            {
            start_date: 'desc'
          },
          {
            create_date: 'desc'
          }
          ],
        })
        console.log('modeZone : ', modeZone); 


        lastetModeBeforeToday = modeZone.reduce((acc: any[], current: any) => {
          const existingIndex = acc.findIndex((item) => isMatch(item.zone?.name, current.zone?.name))

          if (existingIndex < 0) {
            acc.push(current)
          } else if (current.start_date > acc[existingIndex]?.start_date) {
            acc[existingIndex] = current
          }
          else if (current.start_date == acc[existingIndex]?.start_date && dayjs(current.create_date).isAfter(dayjs(acc[existingIndex]?.create_date))) {
            acc[existingIndex] = current
          }

          return acc
        }, [])

        const executeIntradayList = await this.prisma.execute_intraday.findMany({
          where: {
            status: {
              equals: 'OK',
              mode: 'insensitive'
            },
            gas_day_date: {
              gte: gasDayStart,
              lte: gasDayEnd
            }
          }
        })

        const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
          where: {
            AND: [
              {
                gas_day: {
                  gte: gasDayStart
                }
              },
              {
                gas_day: {
                  lte: gasDayEnd
                }
              },
              {
                del_flag: true
              }
            ]
          }
        })

        let totalRecord: number | undefined = undefined
        await this.evidenApiCenter(
          {
            gas_day: datesArray[iDay],
            zone: tab,
            start_hour: 1,
            end_hour: 24,
            skip: 0,
            limit: 1
          },
          'balance_intraday_acc_imb_inventory_by_shipper',
          (total_record: number) => {
            totalRecord = total_record
          }
        )
        const evidenApiCenter: any = await this.evidenApiCenter(
          {
            gas_day: datesArray[iDay],
            zone: tab,
            start_hour: 1,
            end_hour: 24,
            skip: totalRecord ? 0 : Number(skip),
            limit: totalRecord ? totalRecord : Number(limit)
          },
          'balance_intraday_acc_imb_inventory_by_shipper'
        )

        const dataEvuent = evidenApiCenter?.data || []
        const filterZone = dataEvuent?.filter((f: any) => isMatch(f?.zone, tab))
        const matchWithExecuteList = filterZone.filter((item: any) => {
          const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
          return executeIntradayList?.some((executeData: any) => {
            const executeGasDay = getTodayNowAdd7(executeData.gas_day)
            return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day')
          })
        })

        const publishData = matchWithExecuteList.filter((evidenData: any) => {
          return !publicationCenterDeletedList?.some((unpublishData: any) => {
            return unpublishData?.execute_timestamp === evidenData?.execute_timestamp && unpublishData?.gas_day_text === evidenData?.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
          })
        })

        // Get the latest execute_timestamp for each unique combination of gas_day, gas_hour, zone, and mode
        const latestPublishData = publishData.reduce((acc: any[], current: any) => {
          // const key = `${current.gas_day}_${current.gas_hour}_${current.zone}_${current.mode}`;
          const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour && item.zone === current.zone && item.mode === current.mode)

          if (existingIndex < 0) {
            acc.push(current)
          } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
            acc[existingIndex] = current
          }

          return acc
        }, [])
        // console.log('latestPublishData : ', latestPublishData);


        if (tab && latestPublishData?.length > 0) {
          let hourData = []
          for (let i = 0; i <= 24; i++) {
            // if(i == 15){
            //   console.log('a')
            // }
            const modeOfThisHourAndZone = todayModeZone.filter((modeZone: any) => {
              const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H'))
              const gasMinute = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('mm'))
              return gasHour == i && gasMinute == 0
            })

            let activeMode = undefined
            if (modeOfThisHourAndZone.length > 0) {
              // if must prorate do it here
              // just get the lastet for now
              modeOfThisHourAndZone.sort((a: any, b: any) => {
                const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
                if (startDateDiff !== 0) {
                  return startDateDiff
                }
                return dayjs(b.create_date).diff(dayjs(a.create_date))
              })
              activeMode = modeOfThisHourAndZone[0]
            } else {
              let todayModeOfZoneBeforeThisHour = todayModeZone.filter((modeZone: any) => {
                const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
                return gasHour < i
              })

              if (todayModeOfZoneBeforeThisHour.length > 0) {
                todayModeOfZoneBeforeThisHour.sort((a: any, b: any) => {
                  const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
                  if (startDateDiff !== 0) {
                    return startDateDiff
                  }
                  return dayjs(b.create_date).diff(dayjs(a.create_date))
                })
                activeMode = todayModeOfZoneBeforeThisHour[0]
              } else {

                // let todayModeOfZoneBeforeThisHour2 = lastetModeBeforeToday.filter((modeZone: any) => {
                //   const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
                //   return gasHour < i
                // })
                // todayModeOfZoneBeforeThisHour2.sort((a: any, b: any) => {
                //     return dayjs(b.start_date).diff(dayjs(a.start_date))
                //   })

                activeMode = lastetModeBeforeToday.find((f: any) => isMatch(f?.zone?.name, tab))
              }
            }
            // console.log('i : ', i);
            // console.log('____activeMode : ', activeMode);
            // console.log('-----');
            const thisHourData = latestPublishData && latestPublishData?.find((evidenData: any) => {
              return evidenData.gas_hour === i && isMatch(evidenData.mode, activeMode?.mode?.mode)
            }) || null

            let value: any = {
              all: null,
              high_max_percentage: null,
              high_dd_percentage: null,
              high_red_percentage: null,
              high_orange_percentage: null,
              high_alert_percentage: null,
              low_max_percentage: null,
              low_dd_percentage: null,
              low_red_percentage: null,
              low_orange_percentage: null,
              low_alert_percentage: null,
              high_alert: null,
              high_orange: null,
              high_red: null,
              high_dd: null,
              high_max: null,
              baseInv: null,
              accImb_or_accImbInv: null,
              accImb_or_accImbInv_percentage: null,
              low_alert: null,
              low_orange: null,
              low_red: null,
              low_dd: null,
              low_max: null
            }
            let systemValue: any = {
              all: null,
              high_max_percentage: null,
              high_dd_percentage: null,
              high_red_percentage: null,
              high_orange_percentage: null,
              high_alert_percentage: null,
              low_max_percentage: null,
              low_dd_percentage: null,
              low_red_percentage: null,
              low_orange_percentage: null,
              low_alert_percentage: null,
              high_alert: null,
              high_orange: null,
              high_red: null,
              high_dd: null,
              high_max: null,
              baseInv: null,
              accImb_or_accImbInv: null,
              accImb_or_accImbInv_percentage: null,
              low_alert: null,
              low_orange: null,
              low_red: null,
              low_dd: null,
              low_max: null
            }

            let valueOfEachShipper: Record<
              string,
              {
                high_max_percentage: number | null
                high_dd_percentage: number | null
                high_red_percentage: number | null
                high_orange_percentage: number | null
                high_alert_percentage: number | null
                low_max_percentage: number | null
                low_dd_percentage: number | null
                low_red_percentage: number | null
                low_orange_percentage: number | null
                low_alert_percentage: number | null
                high_alert: number | null
                high_orange: number | null
                high_red: number | null
                high_dd: number | null
                high_max: number | null
                baseInv: number | null
                accImb_or_accImbInv: number | null
                accImb_or_accImbInv_percentage: number | null
                low_alert: number | null
                low_orange: number | null
                low_red: number | null
                low_dd: number | null
                low_max: number | null
              }
            > = {}

            if (thisHourData) {
              const isUseSystemValue = isSystemValue == true || (thisHourData?.shipper_data?.length ?? 0) == 0 || !shipper || shipper.length === 0

              // Assign values using the mapping
              Object.entries(accImbValueMappings).forEach(([property, tag]) => {
                const valueByTag = getValueByTag(thisHourData, tag)
                if (isUseSystemValue) {
                  value[property] = valueByTag
                }
                systemValue[property] = valueByTag
              })

              if (thisHourData?.shipper_data?.length > 0) {
                thisHourData?.shipper_data
                  ?.filter((f: any) => f?.shipper !== 'Total')
                  ?.map((sp: any) => {
                    if (!shipper || shipper.length === 0 || shipper.includes(sp?.shipper)) {
                      const fShipperName = groupMaster?.find((f: any) => f?.id_name == sp?.shipper)

                      if (fShipperName) {
                        mapShipperIDWithName[sp?.shipper] = fShipperName?.name

                        const shipperValue: any = {
                          high_max_percentage: null,
                          high_dd_percentage: null,
                          high_red_percentage: null,
                          high_orange_percentage: null,
                          high_alert_percentage: null,
                          low_max_percentage: null,
                          low_dd_percentage: null,
                          low_red_percentage: null,
                          low_orange_percentage: null,
                          low_alert_percentage: null,
                          high_alert: null,
                          high_orange: null,
                          high_red: null,
                          high_dd: null,
                          high_max: null,
                          baseInv: null,
                          accImb_or_accImbInv: null,
                          accImb_or_accImbInv_percentage: null,
                          low_alert: null,
                          low_orange: null,
                          low_red: null,
                          low_dd: null,
                          low_max: null
                        }

                        // Assign values using the mapping
                        Object.entries(accImbValueMappings).forEach(([property, tag]) => {
                          const valueByTag = getValueByTag(sp, tag)
                          shipperValue[property] = valueByTag

                          if (!isUseSystemValue) {
                            if (value[property] && valueByTag) {
                              value[property] = value[property] + valueByTag
                            } else {
                              value[property] = valueByTag
                            }
                          }
                        })
                        value[fShipperName?.name] = shipperValue.accImb_or_accImbInv
                        systemValue[fShipperName?.name] = shipperValue.accImb_or_accImbInv
                        valueOfEachShipper[fShipperName?.name] = shipperValue
                      }
                    }
                    return sp
                  })
              }
            }
            const existingIndex = hourData.findIndex((data: any) => data.gas_hour === i)
            if (existingIndex >= 0) {
              if (hourData[existingIndex].activeMode?.start_date < activeMode?.start_date) {
                hourData[existingIndex].mode = thisHourData ? (thisHourData.mode ?? activeMode?.mode?.mode) : null
                hourData[existingIndex].zone = thisHourData ? tab : null
                hourData[existingIndex].value = value
                hourData[existingIndex].activeMode = activeMode
                hourData[existingIndex].valueOfEachShipper = valueOfEachShipper
                hourData[existingIndex].systemValue = systemValue
              }
            } else {
              hourData.push({
                gas_hour: i,
                gas_hour_text: i >= 10 ? `${i}:00` : `0${i}:00`,
                mode: thisHourData ? (thisHourData.mode ?? activeMode?.mode?.mode) : null,
                zone: thisHourData ? tab : null,
                value: value,
                valueOfEachShipper: valueOfEachShipper,
                systemValue,
                activeMode
              })
            }
          }

          nDataTempAll.push({
            gas_day: datesArray[iDay],
            hour: hourData
          })
        } else {
          nDataTempAll.push({
            gas_day: datesArray[iDay],
            hour: []
          })
        }
      }
    }
    console.log('nDataTempAll : ', nDataTempAll);
    // accImb_or_accImbInv
    // accImb_or_accImbInv_percentage

    const fShipperName = Object.values(mapShipperIDWithName)

    const dataUse = {
      templateLabelKeys: [
        ...fShipperName.map((t: any) => {
          function randomColor() {
            return (
              '#' +
              Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, '0')
            )
          }

          return {
            lebel: t,
            color: randomColor(),
            key: t,
            type: 'bar'
          }
        }),
        {
          lebel: 'All',
          color: '#535353',
          key: 'all',
          type: 'lineGraph'
        },
        {
          lebel: 'High Max',
          color: '#535353',
          key: 'high_max',
          // key: 'high_max_percentage',
          type: 'line'
        },
        {
          lebel: 'High Difficult Day',
          color: '#824ba6',
          key: 'high_dd',
          // key: 'high_dd_percentage',
          type: 'line'
        },
        {
          lebel: 'High Red',
          color: '#da1610',
          key: 'high_red',
          // key: 'high_red_percentage',
          type: 'line'
        },
        {
          lebel: 'High Orange',
          color: '#f56f16',
          key: 'high_orange',
          // key: 'high_orange_percentage',
          type: 'line'
        },
        {
          lebel: 'Alert High',
          color: '#eac12a',
          key: 'high_alert',
          // key: 'high_alert_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Min', // https://app.clickup.com/t/86eujrgh1
          color: '#535353',
          key: 'low_max',
          // key: 'low_max_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Difficult Day',
          color: '#824ba6',
          key: 'low_dd',
          // key: 'low_dd_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Red',
          color: '#da1610',
          key: 'low_red',
          // key: 'low_red_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Orange',
          color: '#f56f16',
          key: 'low_orange',
          // key: 'low_orange_percentage',
          type: 'line'
        },
        {
          lebel: 'Alert Low',
          color: '#eac12a',
          key: 'low_alert',
          // key: 'low_alert_percentage',
          type: 'line'
        }
      ],
      data: nDataTempAll
    }

    return dataUse
  }

  //#region ignore active mode  
  async systemAccImbalanceInventory3OLD(payload: any, userId: any) {
    const {gas_day, skip, limit, shipper_id, execute_timestamp, lasted_version} = payload

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_system_acc_imb',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_system_acc_imb'
    )

    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(gas_day).toDate()
    const todayEnd = getTodayEndYYYYMMDDDfaultAdd7(gas_day).toDate()

    const todayModeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          gte: todayStart,
          lte: todayEnd
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: [
        {
        start_date: 'desc'
      },
      {
        create_date: "desc"
      }
      ]
    })

    let lastetModeBeforeToday = []

    const modeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          lt: todayStart
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        start_date: 'desc'
      }
    })

    lastetModeBeforeToday = modeZone.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => isMatch(item.zone?.name, current.zone?.name))

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.start_date > acc[existingIndex]?.start_date) {
        acc[existingIndex] = current
      }
      else if (current.start_date == acc[existingIndex]?.start_date && dayjs(current.create_date).isAfter(dayjs(acc[existingIndex]?.create_date))) {
        acc[existingIndex] = current
      }

      return acc
    }, [])

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: todayStart,
          lte: todayEnd
        }
      }
    })

    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: todayStart
            }
          },
          {
            gas_day: {
              lte: todayEnd
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })

    const groupMasterCheck = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      },
      include: {
        contract_code: {
          where: {
            AND: [
              {
                status_capacity_request_management_id: {
                  in: [2, 5]
                }
              }, // Approved
              {
                contract_start_date: {
                  lte: todayEnd
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
                      gt: todayStart
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
                          gt: todayStart
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
                              gt: todayStart
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
          include: {
            booking_version: {
              where: {
                flag_use: true
              },
              include: {
                // booking_full_json: true,
                booking_row_json: true
              },
              take: 1,
              orderBy: {
                id: 'desc'
              }
            }
          }
        }
      }
    })
    const userType = groupMasterCheck?.user_type_id

    let dataEvuent = evidenApiCenter?.data || []

    // If not admin or TSO filter data by shipper group
    if (userType && userType != 1 && userType != 2) {
      let uniqueZones = []
      groupMasterCheck.contract_code.map((contract) => {
        contract.booking_version.map((version) => {
          version.booking_row_json.map((row) => {
            if (row.zone_text && !uniqueZones.some((zone) => isMatch(zone, row.zone_text))) {
              uniqueZones.push(row.zone_text)
            }
          })
        })
      })

      dataEvuent = dataEvuent.filter((item: any) => {
        return uniqueZones.some((zone) => isMatch(zone, item.zone))
      })
    }

    const matchWithExecuteList = dataEvuent.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day')
      })
    })

    const publishData = matchWithExecuteList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData?.execute_timestamp && unpublishData?.gas_day_text === evidenData?.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
      })
    })

    // Get the latest execute_timestamp for each unique combination of gas_day, gas_hour, zone, and mode
    const latestPublishData = publishData.reduce((acc: any[], current: any) => {
      // const key = `${current.gas_day}_${current.gas_hour}_${current.zone}_${current.mode}`;
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour && item.zone === current.zone && item.mode === current.mode)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, []).sort((a: any, b: any) => b.execute_timestamp - a.execute_timestamp)

    if (latestPublishData.length > 0) {
      const uniqueZones = [...new Set(latestPublishData.map((data: any) => data.zone))]

      let hourData = []
      for (let i = 0; i <= 24; i++) {
        for (const zone of uniqueZones) {
          const modeOfThisHourAndZone = todayModeZone.filter((modeZone: any) => {
            const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H'))
            const gasMinute = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('mm'))

            return gasHour == i && isMatch(modeZone?.zone?.name, `${zone}`) && gasMinute == 0
          })

          let activeMode = undefined
          if (modeOfThisHourAndZone.length > 0) {
            // if must prorate do it here
            // just get the lastet for now
            modeOfThisHourAndZone.sort((a: any, b: any) => {
              const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
              if (startDateDiff !== 0) {
                return startDateDiff
              }
              return dayjs(b.create_date).diff(dayjs(a.create_date))
            })
            activeMode = modeOfThisHourAndZone[0]
          } else {
            let todayModeOfZoneBeforeThisHour = todayModeZone.filter((modeZone: any) => {
              const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
              return gasHour < i && modeZone && isMatch(modeZone?.zone?.name, `${zone}`)
            })

            if (todayModeOfZoneBeforeThisHour.length > 0) {
              todayModeOfZoneBeforeThisHour.sort((a: any, b: any) => {
                const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
                if (startDateDiff !== 0) {
                  return startDateDiff
                }
                return dayjs(b.create_date).diff(dayjs(a.create_date))
              })
              activeMode = todayModeOfZoneBeforeThisHour[0]
            } else {
              activeMode = lastetModeBeforeToday.find((f: any) => isMatch(f?.zone?.name, `${zone}`))
            }
          }

          let thisHourData = (latestPublishData || [])?.find((evidenData: any) => {
            return evidenData?.gas_hour === i && isMatch(evidenData?.zone, `${zone}`)
          })

          if(!thisHourData) {
            const beforeLatestPublishData = (publishData || [])?.filter((evidenData: any) => {
              return evidenData?.gas_hour === i && isMatch(evidenData?.zone, `${zone}`)
            })?.reduce((acc: any[], current: any) => {
              const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour && item.zone === current.zone && item.mode === current.mode)
        
              if (existingIndex < 0) {
                acc.push(current)
              } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
                acc[existingIndex] = current
              }
        
              return acc
            }, [])

            thisHourData = beforeLatestPublishData?.find((evidenData: any) => {
              return evidenData?.gas_hour === i && isMatch(evidenData?.zone, `${zone}`)
            })
          }

          let value = {
            totalAccImbInv_percentage: null,
            high_max_percentage: null,
            high_dd_percentage: null,
            high_red_percentage: null,
            high_orange_percentage: null,
            high_alert_percentage: null,
            low_max_percentage: null,
            low_dd_percentage: null,
            low_red_percentage: null,
            low_orange_percentage: null,
            low_alert_percentage: null,
            mode: null
          }

          if (thisHourData) {
            value['totalAccImbInv_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'totalAccImbInv_percentage')?.value ?? null
            value['high_max_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_max_percentage')?.value ?? null
            value['high_dd_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_dd_percentage')?.value ?? null
            value['high_red_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_red_percentage')?.value ?? null
            value['high_orange_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_orange_percentage')?.value ?? null
            value['high_alert_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_alert_percentage')?.value ?? null
            value['low_max_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_max_percentage')?.value ?? null
            value['low_dd_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_dd_percentage')?.value ?? null
            value['low_red_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_red_percentage')?.value ?? null
            value['low_orange_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_orange_percentage')?.value ?? null
            value['low_alert_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_alert_percentage')?.value ?? null
            value['mode'] = thisHourData.mode ?? null
          }

          const existingIndex = hourData.findIndex((data: any) => data.gas_hour === i)
          if (existingIndex >= 0) {
            hourData[existingIndex].mode = thisHourData ? thisHourData.mode : null
            hourData[existingIndex].zone = thisHourData ? zone : null
            hourData[existingIndex].value = value
            if (hourData[existingIndex].activeMode?.start_date < activeMode?.start_date) {
              hourData[existingIndex].activeMode = activeMode
            }
            hourData[existingIndex].valueOfEachZone[`${zone}`] = value
          } else {
            hourData.push({
              gas_hour: i,
              gas_hour_text: i >= 10 ? `${i}:00` : `0${i}:00`,
              mode: thisHourData ? (thisHourData.mode ?? activeMode?.mode?.mode) : null,
              zone: thisHourData ? zone : null,
              value: value,
              valueOfEachZone: {
                [`${zone}`]: value
              },
              activeMode
            })
          }
        }
      }

      const dataUse = {
        templateLabelKeys: [
          {
            lebel: 'EAST',
            color: '#dbe4fe',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'WEST',
            color: '#fdcee3',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'High Max',
            color: '#535353',
            key: 'high_max_percentage',
            type: 'line'
          },
          {
            lebel: 'High Difficult Day',
            color: '#824ba6',
            key: 'high_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'High Red',
            color: '#da1610',
            key: 'high_red_percentage',
            type: 'line'
          },
          {
            lebel: 'High Orange',
            color: '#f56f16',
            key: 'high_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert High',
            color: '#eac12a',
            key: 'high_alert_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Min',
            color: '#535353',
            key: 'low_max_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Difficult Day',
            color: '#824ba6',
            key: 'low_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Red',
            color: '#da1610',
            key: 'low_red_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Orange',
            color: '#f56f16',
            key: 'low_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert Low',
            color: '#eac12a',
            key: 'low_alert_percentage',
            type: 'line'
          }
        ],
        data: [
          {
            gas_day: gas_day,
            hour: hourData
          }
        ]
      }
      return dataUse
    } else {
      const dataUse = {
        templateLabelKeys: [
          {
            lebel: 'EAST',
            color: '#dbe4fe',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'WEST',
            color: '#fdcee3',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'High Max',
            color: '#535353',
            key: 'high_max_percentage',
            type: 'line'
          },
          {
            lebel: 'High Difficult Day',
            color: '#824ba6',
            key: 'high_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'High Red',
            color: '#da1610',
            key: 'high_red_percentage',
            type: 'line'
          },
          {
            lebel: 'High Orange',
            color: '#f56f16',
            key: 'high_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert High',
            color: '#eac12a',
            key: 'high_alert_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Min',
            color: '#535353',
            key: 'low_max_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Difficult Day',
            color: '#824ba6',
            key: 'low_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Red',
            color: '#da1610',
            key: 'low_red_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Orange',
            color: '#f56f16',
            key: 'low_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert Low',
            color: '#eac12a',
            key: 'low_alert_percentage',
            type: 'line'
          }
        ],
        data: []
      }
      return dataUse
    }
  }
  
  async systemAccImbalanceInventory3(payload: any, userId: any) {
    const {gas_day, skip, limit, shipper_id, execute_timestamp, lasted_version} = payload

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_system_acc_imb',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_system_acc_imb'
    )

    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(gas_day).toDate()
    const todayEnd = getTodayEndYYYYMMDDDfaultAdd7(gas_day).toDate()

    const todayModeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          gte: todayStart,
          lte: todayEnd
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: [
        {
        start_date: 'desc'
      },
      {
        create_date: "desc"
      }
      ]
    })

    let lastetModeBeforeToday = []

    const modeZone = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          lt: todayStart
        }
      },
      include: {
        zone: true,
        mode: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        start_date: 'desc'
      }
    })

    lastetModeBeforeToday = modeZone.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => isMatch(item.zone?.name, current.zone?.name))

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.start_date > acc[existingIndex]?.start_date) {
        acc[existingIndex] = current
      }
      else if (current.start_date == acc[existingIndex]?.start_date && dayjs(current.create_date).isAfter(dayjs(acc[existingIndex]?.create_date))) {
        acc[existingIndex] = current
      }

      return acc
    }, [])

    const executeIntradayList = await this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: todayStart,
          lte: todayEnd
        }
      }
    })

    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: todayStart
            }
          },
          {
            gas_day: {
              lte: todayEnd
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })

    const groupMasterCheck = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      },
      include: {
        contract_code: {
          where: {
            AND: [
              {
                status_capacity_request_management_id: {
                  in: [2, 5]
                }
              }, // Approved
              {
                contract_start_date: {
                  lte: todayEnd
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
                      gt: todayStart
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
                          gt: todayStart
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
                              gt: todayStart
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
          include: {
            booking_version: {
              where: {
                flag_use: true
              },
              include: {
                // booking_full_json: true,
                booking_row_json: true
              },
              take: 1,
              orderBy: {
                id: 'desc'
              }
            }
          }
        }
      }
    })
    const userType = groupMasterCheck?.user_type_id

    let dataEvuent = evidenApiCenter?.data || []

    // If not admin or TSO filter data by shipper group
    if (userType && userType != 1 && userType != 2) {
      let uniqueZones = []
      groupMasterCheck.contract_code.map((contract) => {
        contract.booking_version.map((version) => {
          version.booking_row_json.map((row) => {
            if (row.zone_text && !uniqueZones.some((zone) => isMatch(zone, row.zone_text))) {
              uniqueZones.push(row.zone_text)
            }
          })
        })
      })

      dataEvuent = dataEvuent.filter((item: any) => {
        return uniqueZones.some((zone) => isMatch(zone, item.zone))
      })
    }

    const matchWithExecuteList = dataEvuent.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day')
      })
    })

    const publishData = matchWithExecuteList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData?.execute_timestamp && unpublishData?.gas_day_text === evidenData?.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
      })
    })

    // Get the latest execute_timestamp for each unique combination of gas_day, gas_hour, zone, and mode
    const latestPublishData = publishData.reduce((acc: any[], current: any) => {
      // const key = `${current.gas_day}_${current.gas_hour}_${current.zone}_${current.mode}`;
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour && item.zone === current.zone && item.mode === current.mode)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, []).sort((a: any, b: any) => b.execute_timestamp - a.execute_timestamp)

    if (latestPublishData.length > 0) {
      const uniqueZones = [...new Set(latestPublishData.map((data: any) => data.zone))]

      let hourData = []
      for (let i = 0; i <= 24; i++) {
        for (const zone of uniqueZones) {
          const modeOfThisHourAndZone = todayModeZone.filter((modeZone: any) => {
            const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H'))
            const gasMinute = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('mm'))

            return gasHour == i && isMatch(modeZone?.zone?.name, `${zone}`) && gasMinute == 0
          })

          let activeMode = undefined
          if (modeOfThisHourAndZone.length > 0) {
            // if must prorate do it here
            // just get the lastet for now
            modeOfThisHourAndZone.sort((a: any, b: any) => {
              const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
              if (startDateDiff !== 0) {
                return startDateDiff
              }
              return dayjs(b.create_date).diff(dayjs(a.create_date))
            })
            activeMode = modeOfThisHourAndZone[0]
          } else {
            let todayModeOfZoneBeforeThisHour = todayModeZone.filter((modeZone: any) => {
              const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
              return gasHour < i && modeZone && isMatch(modeZone?.zone?.name, `${zone}`)
            })

            if (todayModeOfZoneBeforeThisHour.length > 0) {
              todayModeOfZoneBeforeThisHour.sort((a: any, b: any) => {
                const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
                if (startDateDiff !== 0) {
                  return startDateDiff
                }
                return dayjs(b.create_date).diff(dayjs(a.create_date))
              })
              activeMode = todayModeOfZoneBeforeThisHour[0]
            } else {
              activeMode = lastetModeBeforeToday.find((f: any) => isMatch(f?.zone?.name, `${zone}`))
            }
          }

          let thisHourData = (latestPublishData || [])?.find((evidenData: any) => {
            return evidenData?.gas_hour === i && isMatch(evidenData?.zone, `${zone}`)
          })

          if(!thisHourData) {
            const beforeLatestPublishData = (publishData || [])?.filter((evidenData: any) => {
              return evidenData?.gas_hour === i && isMatch(evidenData?.zone, `${zone}`)
            })?.reduce((acc: any[], current: any) => {
              const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour && item.zone === current.zone && item.mode === current.mode)
        
              if (existingIndex < 0) {
                acc.push(current)
              } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
                acc[existingIndex] = current
              }
        
              return acc
            }, [])

            thisHourData = beforeLatestPublishData?.find((evidenData: any) => {
              return evidenData?.gas_hour === i && isMatch(evidenData?.zone, `${zone}`)
            })
          }

          let value = {
            totalAccImbInv_percentage: null,
            high_max_percentage: null,
            high_dd_percentage: null,
            high_red_percentage: null,
            high_orange_percentage: null,
            high_alert_percentage: null,
            low_max_percentage: null,
            low_dd_percentage: null,
            low_red_percentage: null,
            low_orange_percentage: null,
            low_alert_percentage: null,
            mode: null
          }

          if (thisHourData) {
            value['totalAccImbInv_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'totalAccImbInv_percentage')?.value ?? null
            value['high_max_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_max_percentage')?.value ?? null
            value['high_dd_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_dd_percentage')?.value ?? null
            value['high_red_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_red_percentage')?.value ?? null
            value['high_orange_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_orange_percentage')?.value ?? null
            value['high_alert_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'high_alert_percentage')?.value ?? null
            value['low_max_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_max_percentage')?.value ?? null
            value['low_dd_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_dd_percentage')?.value ?? null
            value['low_red_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_red_percentage')?.value ?? null
            value['low_orange_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_orange_percentage')?.value ?? null
            value['low_alert_percentage'] = thisHourData.values?.find((f: any) => f?.tag === 'low_alert_percentage')?.value ?? null
            value['mode'] = thisHourData.mode ?? null
          }

          const existingIndex = hourData.findIndex((data: any) => data.gas_hour === i)
          if (existingIndex >= 0) {
            hourData[existingIndex].mode = thisHourData ? thisHourData.mode : null
            hourData[existingIndex].zone = thisHourData ? zone : null
            hourData[existingIndex].value = value
            if (hourData[existingIndex].activeMode?.start_date < activeMode?.start_date) {
              hourData[existingIndex].activeMode = activeMode
            }
            hourData[existingIndex].valueOfEachZone[`${zone}`] = value
          } else {
            hourData.push({
              gas_hour: i,
              gas_hour_text: i >= 10 ? `${i}:00` : `0${i}:00`,
              mode: thisHourData ? (thisHourData.mode ?? activeMode?.mode?.mode) : null,
              zone: thisHourData ? zone : null,
              value: value,
              valueOfEachZone: {
                [`${zone}`]: value
              },
              activeMode
            })
          }
        }
      }

      const dataUse = {
        templateLabelKeys: [
          {
            lebel: 'EAST',
            color: '#dbe4fe',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'WEST',
            color: '#fdcee3',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'High Max',
            color: '#535353',
            key: 'high_max_percentage',
            type: 'line'
          },
          {
            lebel: 'High Difficult Day',
            color: '#824ba6',
            key: 'high_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'High Red',
            color: '#da1610',
            key: 'high_red_percentage',
            type: 'line'
          },
          {
            lebel: 'High Orange',
            color: '#f56f16',
            key: 'high_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert High',
            color: '#eac12a',
            key: 'high_alert_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Min',
            color: '#535353',
            key: 'low_max_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Difficult Day',
            color: '#824ba6',
            key: 'low_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Red',
            color: '#da1610',
            key: 'low_red_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Orange',
            color: '#f56f16',
            key: 'low_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert Low',
            color: '#eac12a',
            key: 'low_alert_percentage',
            type: 'line'
          }
        ],
        data: [
          {
            gas_day: gas_day,
            hour: hourData
          }
        ]
      }
      return dataUse
    } else {
      const dataUse = {
        templateLabelKeys: [
          {
            lebel: 'EAST',
            color: '#dbe4fe',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'WEST',
            color: '#fdcee3',
            key: 'totalAccImbInv_percentage',
            type: 'bar'
          },
          {
            lebel: 'High Max',
            color: '#535353',
            key: 'high_max_percentage',
            type: 'line'
          },
          {
            lebel: 'High Difficult Day',
            color: '#824ba6',
            key: 'high_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'High Red',
            color: '#da1610',
            key: 'high_red_percentage',
            type: 'line'
          },
          {
            lebel: 'High Orange',
            color: '#f56f16',
            key: 'high_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert High',
            color: '#eac12a',
            key: 'high_alert_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Min',
            color: '#535353',
            key: 'low_max_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Difficult Day',
            color: '#824ba6',
            key: 'low_dd_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Red',
            color: '#da1610',
            key: 'low_red_percentage',
            type: 'line'
          },
          {
            lebel: 'Low Orange',
            color: '#f56f16',
            key: 'low_orange_percentage',
            type: 'line'
          },
          {
            lebel: 'Alert Low',
            color: '#eac12a',
            key: 'low_alert_percentage',
            type: 'line'
          }
        ],
        data: []
      }
      return dataUse
    }
  }

  async intradayAccImbalanceDashboard3OLD(payload: any, userId: any) {
    const {gas_day, skip, limit, shipper_id, execute_timestamp, lasted_version, isSystemValue, tab, shipper} = payload

    let nDataTempAll = []
    const mapShipperIDWithName: Record<string, string> = {}
    if (gas_day) {
      const datesArray = Array.from({
        length: 3
      }).map((_, i) => dayjs(gas_day).subtract(i, 'day').format('YYYY-MM-DD'))

      for (let iDay = 0; iDay < datesArray.length; iDay++) {
        const gasDay = getTodayNowYYYYMMDDDfaultAdd7(datesArray[iDay]).toDate()
        const gasDayStart = getTodayStartYYYYMMDDDfaultAdd7(datesArray[iDay]).toDate()
        const gasDayEnd = getTodayEndYYYYMMDDDfaultAdd7(datesArray[iDay]).toDate()

        const groupMaster = await this.prisma.group.findMany({
          where: {
            user_type_id: 3,
            ...(shipper &&
              shipper.length > 0 && {
                id_name: {
                  in: shipper
                }
              }),
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
                      gt: gasDay
                    }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          }
        })

        const todayModeZone = await this.prisma.mode_zone_base_inventory.findMany({
          where: {
            start_date: {
              gte: gasDayStart,
              lte: gasDayEnd
            },
            // zone: {
            //   name: {
            //     equals: tab,
            //     mode: 'insensitive'
            //   }
            // }
          },
          include: {
            zone: true,
            mode: true,
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          },
           orderBy: [
            {
            start_date: 'desc'
          },
          {
            create_date: 'desc'
          }
          ],
        })

        let lastetModeBeforeToday = []

        const modeZone = await this.prisma.mode_zone_base_inventory.findMany({
          where: {
            start_date: {
              lt: gasDayStart
            },
            zone: {
              name: {
                equals: tab,
                mode: 'insensitive'
              }
            }
          },
          include: {
            zone: true,
            mode: true,
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          },
          orderBy: [
            {
            start_date: 'desc'
          },
          {
            create_date: 'desc'
          }
          ],
        })


        lastetModeBeforeToday = modeZone.reduce((acc: any[], current: any) => {
          const existingIndex = acc.findIndex((item) => isMatch(item.zone?.name, current.zone?.name))

          if (existingIndex < 0) {
            acc.push(current)
          } else if (current.start_date > acc[existingIndex]?.start_date) {
            acc[existingIndex] = current
          }
          else if (current.start_date == acc[existingIndex]?.start_date && dayjs(current.create_date).isAfter(dayjs(acc[existingIndex]?.create_date))) {
            acc[existingIndex] = current
          }

          return acc
        }, [])

        const executeIntradayList = await this.prisma.execute_intraday.findMany({
          where: {
            status: {
              equals: 'OK',
              mode: 'insensitive'
            },
            gas_day_date: {
              gte: gasDayStart,
              lte: gasDayEnd
            }
          }
        })

        const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
          where: {
            AND: [
              {
                gas_day: {
                  gte: gasDayStart
                }
              },
              {
                gas_day: {
                  lte: gasDayEnd
                }
              },
              {
                del_flag: true
              }
            ]
          }
        })

        let totalRecord: number | undefined = undefined
        await this.evidenApiCenter(
          {
            gas_day: datesArray[iDay],
            zone: tab,
            start_hour: 1,
            end_hour: 24,
            skip: 0,
            limit: 1
          },
          'balance_intraday_acc_imb_inventory_by_shipper',
          (total_record: number) => {
            totalRecord = total_record
          }
        )
        const evidenApiCenter: any = await this.evidenApiCenter(
          {
            gas_day: datesArray[iDay],
            zone: tab,
            start_hour: 1,
            end_hour: 24,
            skip: totalRecord ? 0 : Number(skip),
            limit: totalRecord ? totalRecord : Number(limit)
          },
          'balance_intraday_acc_imb_inventory_by_shipper'
        )

        const dataEvuent = evidenApiCenter?.data || []
        const filterZone = dataEvuent?.filter((f: any) => isMatch(f?.zone, tab))
        const matchWithExecuteList = filterZone.filter((item: any) => {
          const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
          return executeIntradayList?.some((executeData: any) => {
            const executeGasDay = getTodayNowAdd7(executeData.gas_day)
            return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day')
          })
        })

        const publishData = matchWithExecuteList.filter((evidenData: any) => {
          return !publicationCenterDeletedList?.some((unpublishData: any) => {
            return unpublishData?.execute_timestamp === evidenData?.execute_timestamp && unpublishData?.gas_day_text === evidenData?.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
          })
        })

        // Get the latest execute_timestamp for each unique combination of gas_day, gas_hour, zone, and mode
        const latestPublishData = publishData.reduce((acc: any[], current: any) => {
          // const key = `${current.gas_day}_${current.gas_hour}_${current.zone}_${current.mode}`;
          const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour && item.zone === current.zone && item.mode === current.mode)

          if (existingIndex < 0) {
            acc.push(current)
          } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
            acc[existingIndex] = current
          }

          return acc
        }, []).sort((a: any, b: any) => b.execute_timestamp - a.execute_timestamp)


        if (tab && latestPublishData?.length > 0) {
          let hourData = []
          for (let i = 0; i <= 24; i++) {
            const modeOfThisHourAndZone = todayModeZone.filter((modeZone: any) => {
              const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H'))
              const gasMinute = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('mm'))
              return gasHour == i && gasMinute == 0
            })

            let activeMode = undefined
            if (modeOfThisHourAndZone.length > 0) {
              // if must prorate do it here
              // just get the lastet for now
              modeOfThisHourAndZone.sort((a: any, b: any) => {
                const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
                if (startDateDiff !== 0) {
                  return startDateDiff
                }
                return dayjs(b.create_date).diff(dayjs(a.create_date))
              })
              activeMode = modeOfThisHourAndZone[0]
            } else {
              let todayModeOfZoneBeforeThisHour = todayModeZone.filter((modeZone: any) => {
                const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
                return gasHour < i
              })

              if (todayModeOfZoneBeforeThisHour.length > 0) {
                todayModeOfZoneBeforeThisHour.sort((a: any, b: any) => {
                  const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
                  if (startDateDiff !== 0) {
                    return startDateDiff
                  }
                  return dayjs(b.create_date).diff(dayjs(a.create_date))
                })
                activeMode = todayModeOfZoneBeforeThisHour[0]
              } else {

                // let todayModeOfZoneBeforeThisHour2 = lastetModeBeforeToday.filter((modeZone: any) => {
                //   const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
                //   return gasHour < i
                // })
                // todayModeOfZoneBeforeThisHour2.sort((a: any, b: any) => {
                //     return dayjs(b.start_date).diff(dayjs(a.start_date))
                //   })

                activeMode = lastetModeBeforeToday.find((f: any) => isMatch(f?.zone?.name, tab))
              }
            }
            
            let thisHourData = (latestPublishData || [])?.find((evidenData: any) => {
              return evidenData?.gas_hour === i
            })

            if(!thisHourData) {
              const beforeLatestPublishData = (publishData || [])?.filter((evidenData: any) => {
                return evidenData?.gas_hour === i
              })?.reduce((acc: any[], current: any) => {
                const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day && item.gas_hour === current.gas_hour && item.zone === current.zone && item.mode === current.mode)
      
                if (existingIndex < 0) {
                  acc.push(current)
                } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
                  acc[existingIndex] = current
                }
      
                return acc
              }, [])
  
              thisHourData = beforeLatestPublishData?.find((evidenData: any) => {
                return evidenData?.gas_hour === i
              })
            }

            let value: any = {
              all: null,
              high_max_percentage: null,
              high_dd_percentage: null,
              high_red_percentage: null,
              high_orange_percentage: null,
              high_alert_percentage: null,
              low_max_percentage: null,
              low_dd_percentage: null,
              low_red_percentage: null,
              low_orange_percentage: null,
              low_alert_percentage: null,
              high_alert: null,
              high_orange: null,
              high_red: null,
              high_dd: null,
              high_max: null,
              baseInv: null,
              accImb_or_accImbInv: null,
              accImb_or_accImbInv_percentage: null,
              low_alert: null,
              low_orange: null,
              low_red: null,
              low_dd: null,
              low_max: null
            }
            let systemValue: any = {
              all: null,
              high_max_percentage: null,
              high_dd_percentage: null,
              high_red_percentage: null,
              high_orange_percentage: null,
              high_alert_percentage: null,
              low_max_percentage: null,
              low_dd_percentage: null,
              low_red_percentage: null,
              low_orange_percentage: null,
              low_alert_percentage: null,
              high_alert: null,
              high_orange: null,
              high_red: null,
              high_dd: null,
              high_max: null,
              baseInv: null,
              accImb_or_accImbInv: null,
              accImb_or_accImbInv_percentage: null,
              low_alert: null,
              low_orange: null,
              low_red: null,
              low_dd: null,
              low_max: null
            }

            let valueOfEachShipper: Record<
              string,
              {
                high_max_percentage: number | null
                high_dd_percentage: number | null
                high_red_percentage: number | null
                high_orange_percentage: number | null
                high_alert_percentage: number | null
                low_max_percentage: number | null
                low_dd_percentage: number | null
                low_red_percentage: number | null
                low_orange_percentage: number | null
                low_alert_percentage: number | null
                high_alert: number | null
                high_orange: number | null
                high_red: number | null
                high_dd: number | null
                high_max: number | null
                baseInv: number | null
                accImb_or_accImbInv: number | null
                accImb_or_accImbInv_percentage: number | null
                low_alert: number | null
                low_orange: number | null
                low_red: number | null
                low_dd: number | null
                low_max: number | null
              }
            > = {}

            if (thisHourData) {
              const isUseSystemValue = isSystemValue == true || (thisHourData?.shipper_data?.length ?? 0) == 0 || !shipper || shipper.length === 0

              // Assign values using the mapping
              Object.entries(accImbValueMappings).forEach(([property, tag]) => {
                const valueByTag = getValueByTag(thisHourData, tag)
                if (isUseSystemValue) {
                  value[property] = valueByTag
                }
                systemValue[property] = valueByTag
              })

              if (thisHourData?.shipper_data?.length > 0) {
                thisHourData?.shipper_data
                  ?.filter((f: any) => f?.shipper !== 'Total')
                  ?.map((sp: any) => {
                    if (!shipper || shipper.length === 0 || shipper.includes(sp?.shipper)) {
                      const fShipperName = groupMaster?.find((f: any) => f?.id_name == sp?.shipper)

                      if (fShipperName) {
                        mapShipperIDWithName[sp?.shipper] = fShipperName?.name

                        const shipperValue: any = {
                          high_max_percentage: null,
                          high_dd_percentage: null,
                          high_red_percentage: null,
                          high_orange_percentage: null,
                          high_alert_percentage: null,
                          low_max_percentage: null,
                          low_dd_percentage: null,
                          low_red_percentage: null,
                          low_orange_percentage: null,
                          low_alert_percentage: null,
                          high_alert: null,
                          high_orange: null,
                          high_red: null,
                          high_dd: null,
                          high_max: null,
                          baseInv: null,
                          accImb_or_accImbInv: null,
                          accImb_or_accImbInv_percentage: null,
                          low_alert: null,
                          low_orange: null,
                          low_red: null,
                          low_dd: null,
                          low_max: null
                        }

                        // Assign values using the mapping
                        Object.entries(accImbValueMappings).forEach(([property, tag]) => {
                          const valueByTag = getValueByTag(sp, tag)
                          shipperValue[property] = valueByTag

                          if (!isUseSystemValue) {
                            if (value[property] && valueByTag) {
                              value[property] = value[property] + valueByTag
                            } else {
                              value[property] = valueByTag
                            }
                          }
                        })
                        value[fShipperName?.name] = shipperValue.accImb_or_accImbInv
                        systemValue[fShipperName?.name] = shipperValue.accImb_or_accImbInv
                        valueOfEachShipper[fShipperName?.name] = shipperValue
                      }
                    }
                    return sp
                  })
              }
            }
            const existingIndex = hourData.findIndex((data: any) => data.gas_hour === i)
            if (existingIndex >= 0) {
              hourData[existingIndex].mode = thisHourData ? thisHourData.mode : null
              hourData[existingIndex].zone = thisHourData ? tab : null
              hourData[existingIndex].value = value
              hourData[existingIndex].valueOfEachShipper = valueOfEachShipper
              hourData[existingIndex].systemValue = systemValue
              if (hourData[existingIndex].activeMode?.start_date < activeMode?.start_date) {
                hourData[existingIndex].activeMode = activeMode
              }
            } else {
              hourData.push({
                gas_hour: i,
                gas_hour_text: i >= 10 ? `${i}:00` : `0${i}:00`,
                mode: thisHourData ? thisHourData.mode : null,
                zone: thisHourData ? tab : null,
                value: value,
                valueOfEachShipper: valueOfEachShipper,
                systemValue,
                activeMode
              })
            }
          }

          nDataTempAll.push({
            gas_day: datesArray[iDay],
            hour: hourData
          })
        } else {
          nDataTempAll.push({
            gas_day: datesArray[iDay],
            hour: []
          })
        }
      }
    }
    
    // accImb_or_accImbInv
    // accImb_or_accImbInv_percentage

    const fShipperName = Object.values(mapShipperIDWithName)

    const dataUse = {
      templateLabelKeys: [
        ...fShipperName.map((t: any) => {
          function randomColor() {
            return (
              '#' +
              Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, '0')
            )
          }

          return {
            lebel: t,
            color: randomColor(),
            key: t,
            type: 'bar'
          }
        }),
        {
          lebel: 'All',
          color: '#535353',
          key: 'all',
          type: 'lineGraph'
        },
        {
          lebel: 'High Max',
          color: '#535353',
          key: 'high_max',
          // key: 'high_max_percentage',
          type: 'line'
        },
        {
          lebel: 'High Difficult Day',
          color: '#824ba6',
          key: 'high_dd',
          // key: 'high_dd_percentage',
          type: 'line'
        },
        {
          lebel: 'High Red',
          color: '#da1610',
          key: 'high_red',
          // key: 'high_red_percentage',
          type: 'line'
        },
        {
          lebel: 'High Orange',
          color: '#f56f16',
          key: 'high_orange',
          // key: 'high_orange_percentage',
          type: 'line'
        },
        {
          lebel: 'Alert High',
          color: '#eac12a',
          key: 'high_alert',
          // key: 'high_alert_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Min', // https://app.clickup.com/t/86eujrgh1
          color: '#535353',
          key: 'low_max',
          // key: 'low_max_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Difficult Day',
          color: '#824ba6',
          key: 'low_dd',
          // key: 'low_dd_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Red',
          color: '#da1610',
          key: 'low_red',
          // key: 'low_red_percentage',
          type: 'line'
        },
        {
          lebel: 'Low Orange',
          color: '#f56f16',
          key: 'low_orange',
          // key: 'low_orange_percentage',
          type: 'line'
        },
        {
          lebel: 'Alert Low',
          color: '#eac12a',
          key: 'low_alert',
          // key: 'low_alert_percentage',
          type: 'line'
        }
      ],
      data: nDataTempAll
    }

    return dataUse
  }

  async intradayAccImbalanceDashboard3(payload: any, userId: any) {
    const {
      gas_day,
      skip,
      limit,
      shipper_id,
      execute_timestamp,
      lasted_version,
      isSystemValue,
      tab,
      shipper
    } = payload

    const selectedShippers: string[] = Array.isArray(shipper)
      ? shipper.filter((item: any) => item !== null && item !== undefined && item !== '')
      : shipper
        ? [shipper]
        : []

    const hasSelectedShipper = selectedShippers.length > 0

    const useSystemValue =
      isSystemValue === true ||
      isSystemValue === 'true' ||
      !hasSelectedShipper

    const nDataTempAll: any[] = []

    const mapShipperIDWithName: Record<string, string> = {}

    if (gas_day) {
      const datesArray = Array.from({
        length: 3
      }).map((_, i) =>
        dayjs(gas_day)
          .subtract(i, 'day')
          .format('YYYY-MM-DD')
      )

      for (let iDay = 0; iDay < datesArray.length; iDay++) {
        const currentGasDay = datesArray[iDay]

        const gasDay =
          getTodayNowYYYYMMDDDfaultAdd7(currentGasDay).toDate()

        const gasDayStart =
          getTodayStartYYYYMMDDDfaultAdd7(currentGasDay).toDate()

        const gasDayEnd =
          getTodayEndYYYYMMDDDfaultAdd7(currentGasDay).toDate()

        const groupMaster = await this.prisma.group.findMany({
          where: {
            user_type_id: 3,
            contract_code: {
              some: {
                contract_start_date: { lte: gasDayEnd }, // Started before or on target date
                AND: [
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
                          gt: gasDayStart
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
                              gt: gasDayStart
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
                                  gt: gasDayStart
                                }
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            ...(hasSelectedShipper
              ? {
                  id_name: {
                    in: selectedShippers
                  }
                }
              : {}),

            AND: [
              {
                start_date: {
                  lte: gasDay
                }
              },
              {
                OR: [
                  {
                    end_date: null
                  },
                  {
                    end_date: {
                      gt: gasDay
                    }
                  }
                ]
              }
            ]
          }
        })

        /*
        * สร้าง Label ของ Shipper จาก Master ทันที
        *
        * เดิม Label จะถูกสร้างเมื่อพบ shipper_data เท่านั้น
        * ทำให้ WEST ที่ไม่มี shipper_data เหลือเพียง Label "All"
        */
        groupMaster.forEach((group: any) => {
          if (group?.id_name && group?.name) {
            mapShipperIDWithName[group.id_name] = group.name
          }
        })

        const todayModeZone =
          await this.prisma.mode_zone_base_inventory.findMany({
            where: {
              start_date: {
                gte: gasDayStart,
                lte: gasDayEnd
              },

              /*
              * ต้องกรองตาม EAST/WEST
              * ป้องกัน Mode ของอีก Zone ปนเข้ามา
              */
              ...(tab
                ? {
                    zone: {
                      name: {
                        equals: tab,
                        mode: 'insensitive'
                      }
                    }
                  }
                : {})
            },

            include: {
              zone: true,
              mode: true,

              create_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },

              update_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              }
            },

            orderBy: [
              {
                start_date: 'desc'
              },
              {
                create_date: 'desc'
              }
            ]
          })

        const modeZone =
          await this.prisma.mode_zone_base_inventory.findMany({
            where: {
              start_date: {
                lt: gasDayStart
              },

              ...(tab
                ? {
                    zone: {
                      name: {
                        equals: tab,
                        mode: 'insensitive'
                      }
                    }
                  }
                : {})
            },

            include: {
              zone: true,
              mode: true,

              create_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },

              update_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              }
            },

            orderBy: [
              {
                start_date: 'desc'
              },
              {
                create_date: 'desc'
              }
            ]
          })

        const lastetModeBeforeToday = modeZone.reduce(
          (acc: any[], current: any) => {
            const existingIndex = acc.findIndex((item: any) =>
              isMatch(item?.zone?.name, current?.zone?.name)
            )

            if (existingIndex < 0) {
              acc.push(current)

              return acc
            }

            const currentStartDate = dayjs(current?.start_date)
            const existingStartDate = dayjs(
              acc[existingIndex]?.start_date
            )

            if (currentStartDate.isAfter(existingStartDate)) {
              acc[existingIndex] = current

              return acc
            }

            if (
              currentStartDate.isSame(existingStartDate) &&
              dayjs(current?.create_date).isAfter(
                dayjs(acc[existingIndex]?.create_date)
              )
            ) {
              acc[existingIndex] = current
            }

            return acc
          },
          []
        )

        const executeIntradayList =
          await this.prisma.execute_intraday.findMany({
            where: {
              status: {
                equals: 'OK',
                mode: 'insensitive'
              },

              gas_day_date: {
                gte: gasDayStart,
                lte: gasDayEnd
              }
            }
          })

        const publicationCenterDeletedList =
          await this.prisma.publication_center.findMany({
            where: {
              gas_day: {
                gte: gasDayStart,
                lte: gasDayEnd
              },

              del_flag: true
            }
          })

        let totalRecord: number | undefined = undefined

        await this.evidenApiCenter(
          {
            gas_day: currentGasDay,
            zone: tab,
            start_hour: 1,
            end_hour: 24,
            skip: 0,
            limit: 1
          },
          'balance_intraday_acc_imb_inventory_by_shipper',
          (total_record: number) => {
            totalRecord = total_record
          }
        )

        const requestSkip =
          totalRecord !== undefined && totalRecord !== null
            ? 0
            : Number(skip ?? 0)

        const requestLimit =
          totalRecord !== undefined &&
          totalRecord !== null &&
          totalRecord > 0
            ? totalRecord
            : Number(limit ?? 100)

        const evidenResponse: any =
          await this.evidenApiCenter(
            {
              gas_day: currentGasDay,
              zone: tab,
              start_hour: 1,
              end_hour: 24,
              skip: requestSkip,
              limit: requestLimit
            },
            'balance_intraday_acc_imb_inventory_by_shipper'
          )

        const dataEvent = Array.isArray(evidenResponse?.data)
          ? evidenResponse.data
          : []

        const filterZone = dataEvent.filter((item: any) =>
          isMatch(item?.zone, tab)
        )

        const matchWithExecuteList = filterZone.filter(
          (item: any) => {
            const itemGasDay =
              getTodayNowYYYYMMDDDfaultAdd7(item?.gas_day)

            return executeIntradayList.some(
              (executeData: any) => {
                const executeGasDay = getTodayNowAdd7(
                  executeData?.gas_day
                )

                return (
                  executeData?.request_number_id ==
                    item?.request_number &&
                  executeGasDay.isSame(itemGasDay, 'day')
                )
              }
            )
          }
        )

        const publishData = matchWithExecuteList.filter(
          (evidenData: any) => {
            return !publicationCenterDeletedList.some(
              (unpublishData: any) => {
                return (
                  unpublishData?.execute_timestamp ===
                    evidenData?.execute_timestamp &&
                  unpublishData?.gas_day_text ===
                    evidenData?.gas_day &&
                  unpublishData?.gas_hour ===
                    evidenData?.gas_hour
                )
              }
            )
          }
        )

        /*
        * เลือกรายการ execute_timestamp ล่าสุด
        * แยกตาม gas_day, gas_hour, zone และ mode
        */
        const latestPublishData = publishData
          .reduce((acc: any[], current: any) => {
            const existingIndex = acc.findIndex(
              (item: any) =>
                item?.gas_day === current?.gas_day &&
                item?.gas_hour === current?.gas_hour &&
                item?.zone === current?.zone &&
                item?.mode === current?.mode
            )

            if (existingIndex < 0) {
              acc.push(current)

              return acc
            }

            const currentTimestamp = Number(
              current?.execute_timestamp ?? 0
            )

            const existingTimestamp = Number(
              acc[existingIndex]?.execute_timestamp ?? 0
            )

            if (currentTimestamp > existingTimestamp) {
              acc[existingIndex] = current
            }

            return acc
          }, [])
          .sort((a: any, b: any) => {
            return (
              Number(b?.execute_timestamp ?? 0) -
              Number(a?.execute_timestamp ?? 0)
            )
          })

        if (tab && latestPublishData.length > 0) {
          const hourData: any[] = []

          for (let i = 0; i <= 24; i++) {
            const modeOfThisHourAndZone = todayModeZone.filter(
              (modeZone: any) => {
                const gasHour = parseToNumber(
                  dayjs(modeZone?.start_date)
                    .tz('Asia/Bangkok')
                    .format('H')
                )

                const gasMinute = parseToNumber(
                  dayjs(modeZone?.start_date)
                    .tz('Asia/Bangkok')
                    .format('mm')
                )

                return gasHour === i && gasMinute === 0
              }
            )

            let activeMode: any = undefined

            if (modeOfThisHourAndZone.length > 0) {
              modeOfThisHourAndZone.sort(
                (a: any, b: any) => {
                  const startDateDiff = dayjs(
                    b?.start_date
                  ).diff(dayjs(a?.start_date))

                  if (startDateDiff !== 0) {
                    return startDateDiff
                  }

                  return dayjs(b?.create_date).diff(
                    dayjs(a?.create_date)
                  )
                }
              )

              activeMode = modeOfThisHourAndZone[0]
            } else {
              const todayModeOfZoneBeforeThisHour =
                todayModeZone.filter((modeZone: any) => {
                  const gasHour =
                    parseToNumber(
                      dayjs(modeZone?.start_date)
                        .tz('Asia/Bangkok')
                        .format('H')
                    ) + 1

                  return gasHour < i
                })

              if (todayModeOfZoneBeforeThisHour.length > 0) {
                todayModeOfZoneBeforeThisHour.sort(
                  (a: any, b: any) => {
                    const startDateDiff = dayjs(
                      b?.start_date
                    ).diff(dayjs(a?.start_date))

                    if (startDateDiff !== 0) {
                      return startDateDiff
                    }

                    return dayjs(b?.create_date).diff(
                      dayjs(a?.create_date)
                    )
                  }
                )

                activeMode =
                  todayModeOfZoneBeforeThisHour[0]
              } else {
                activeMode = lastetModeBeforeToday.find(
                  (item: any) =>
                    isMatch(item?.zone?.name, tab)
                )
              }
            }

            let thisHourData = latestPublishData.find(
              (evidenData: any) =>
                Number(evidenData?.gas_hour) === i
            )

            /*
            * สำรองกรณี latestPublishData หาไม่เจอ
            * ให้ค้นจาก publishData ของชั่วโมงนั้นโดยตรง
            */
            if (!thisHourData) {
              const beforeLatestPublishData = publishData
                .filter(
                  (evidenData: any) =>
                    Number(evidenData?.gas_hour) === i
                )
                .reduce((acc: any[], current: any) => {
                  const existingIndex = acc.findIndex(
                    (item: any) =>
                      item?.gas_day === current?.gas_day &&
                      item?.gas_hour === current?.gas_hour &&
                      item?.zone === current?.zone &&
                      item?.mode === current?.mode
                  )

                  if (existingIndex < 0) {
                    acc.push(current)

                    return acc
                  }

                  const currentTimestamp = Number(
                    current?.execute_timestamp ?? 0
                  )

                  const existingTimestamp = Number(
                    acc[existingIndex]
                      ?.execute_timestamp ?? 0
                  )

                  if (
                    currentTimestamp >
                    existingTimestamp
                  ) {
                    acc[existingIndex] = current
                  }

                  return acc
                }, [])

              thisHourData =
                beforeLatestPublishData.find(
                  (evidenData: any) =>
                    Number(evidenData?.gas_hour) === i
                )
            }

            const value: any = {
              all: null,

              high_max_percentage: null,
              high_dd_percentage: null,
              high_red_percentage: null,
              high_orange_percentage: null,
              high_alert_percentage: null,

              low_max_percentage: null,
              low_dd_percentage: null,
              low_red_percentage: null,
              low_orange_percentage: null,
              low_alert_percentage: null,

              high_alert: null,
              high_orange: null,
              high_red: null,
              high_dd: null,
              high_max: null,

              baseInv: null,

              accImb_or_accImbInv: null,
              accImb_or_accImbInv_percentage: null,

              low_alert: null,
              low_orange: null,
              low_red: null,
              low_dd: null,
              low_max: null
            }

            const systemValue: any = {
              all: null,

              high_max_percentage: null,
              high_dd_percentage: null,
              high_red_percentage: null,
              high_orange_percentage: null,
              high_alert_percentage: null,

              low_max_percentage: null,
              low_dd_percentage: null,
              low_red_percentage: null,
              low_orange_percentage: null,
              low_alert_percentage: null,

              high_alert: null,
              high_orange: null,
              high_red: null,
              high_dd: null,
              high_max: null,

              baseInv: null,

              accImb_or_accImbInv: null,
              accImb_or_accImbInv_percentage: null,

              low_alert: null,
              low_orange: null,
              low_red: null,
              low_dd: null,
              low_max: null
            }

            const valueOfEachShipper: Record<
              string,
              {
                high_max_percentage: number | null
                high_dd_percentage: number | null
                high_red_percentage: number | null
                high_orange_percentage: number | null
                high_alert_percentage: number | null

                low_max_percentage: number | null
                low_dd_percentage: number | null
                low_red_percentage: number | null
                low_orange_percentage: number | null
                low_alert_percentage: number | null

                high_alert: number | null
                high_orange: number | null
                high_red: number | null
                high_dd: number | null
                high_max: number | null

                baseInv: number | null

                accImb_or_accImbInv: number | null
                accImb_or_accImbInv_percentage:
                  | number
                  | null

                low_alert: number | null
                low_orange: number | null
                low_red: number | null
                low_dd: number | null
                low_max: number | null
              }
            > = {}

            /*
            * เตรียม key Shipper ใน value ล่วงหน้า
            *
            * ทำให้แม้ WEST ชั่วโมงนั้นไม่มี shipper_data
            * Label และ key ของ Shipper ยังมีอยู่ โดยค่าเป็น null
            */
            groupMaster.forEach((group: any) => {
              if (group?.name) {
                value[group.name] = null
                systemValue[group.name] = null
              }
            })

            if (thisHourData) {
              /*
              * ค่ารวมจาก Eviden
              *
              * สำหรับ System:
              * นำค่ารวมใส่ value และ systemValue
              *
              * สำหรับ Shipper:
              * ใส่ค่ารวมเฉพาะ systemValue
              * ส่วน value จะรวมจาก shipper_data เท่านั้น
              */
              Object.entries(accImbValueMappings).forEach(
                ([property, tag]) => {
                  const valueByTag = getValueByTag(
                    thisHourData,
                    tag
                  )

                  if (useSystemValue) {
                    value[property] = valueByTag
                  }

                  systemValue[property] = valueByTag
                }
              )

              const shipperData = Array.isArray(
                thisHourData?.shipper_data
              )
                ? thisHourData.shipper_data
                : []

              shipperData
                .filter(
                  (item: any) =>
                    item?.shipper !== 'Total'
                )
                .forEach((shipperItem: any) => {
                  const shipperCode =
                    shipperItem?.shipper

                  const isSelected =
                    !hasSelectedShipper ||
                    selectedShippers.includes(
                      shipperCode
                    )

                  if (!isSelected) {
                    return
                  }

                  const matchedShipper =
                    groupMaster.find(
                      (group: any) =>
                        group?.id_name ===
                        shipperCode
                    )

                  if (!matchedShipper) {
                    return
                  }

                  mapShipperIDWithName[shipperCode] =
                    matchedShipper.name

                  const shipperValue: any = {
                    high_max_percentage: null,
                    high_dd_percentage: null,
                    high_red_percentage: null,
                    high_orange_percentage: null,
                    high_alert_percentage: null,

                    low_max_percentage: null,
                    low_dd_percentage: null,
                    low_red_percentage: null,
                    low_orange_percentage: null,
                    low_alert_percentage: null,

                    high_alert: null,
                    high_orange: null,
                    high_red: null,
                    high_dd: null,
                    high_max: null,

                    baseInv: null,

                    accImb_or_accImbInv: null,
                    accImb_or_accImbInv_percentage:
                      null,

                    low_alert: null,
                    low_orange: null,
                    low_red: null,
                    low_dd: null,
                    low_max: null
                  }

                  Object.entries(
                    accImbValueMappings
                  ).forEach(([property, tag]) => {
                    const valueByTag =
                      getValueByTag(
                        shipperItem,
                        tag
                      )

                    shipperValue[property] =
                      valueByTag

                    /*
                    * รวมค่าของ Shipper เมื่อไม่ได้ใช้ System
                    *
                    * ห้ามใช้:
                    * if (value[property] && valueByTag)
                    *
                    * เพราะเลข 0 จะถูกมองเป็น false
                    */
                    if (!useSystemValue) {
                      const currentValue =
                        value[property]

                      const hasCurrentValue =
                        currentValue !== null &&
                        currentValue !== undefined

                      const hasNewValue =
                        valueByTag !== null &&
                        valueByTag !== undefined

                      if (
                        hasCurrentValue &&
                        hasNewValue
                      ) {
                        value[property] =
                          Number(currentValue) +
                          Number(valueByTag)
                      } else if (hasNewValue) {
                        value[property] =
                          valueByTag
                      }
                    }
                  })

                  value[matchedShipper.name] =
                    shipperValue
                      .accImb_or_accImbInv

                  systemValue[
                    matchedShipper.name
                  ] =
                    shipperValue
                      .accImb_or_accImbInv

                  valueOfEachShipper[
                    matchedShipper.name
                  ] = shipperValue
                })
            }

            const existingIndex =
              hourData.findIndex(
                (data: any) =>
                  data?.gas_hour === i
              )

            if (existingIndex >= 0) {
              hourData[existingIndex].mode =
                thisHourData
                  ? thisHourData?.mode
                  : null

              hourData[existingIndex].zone =
                thisHourData ? tab : null

              hourData[existingIndex].value =
                value

              hourData[
                existingIndex
              ].valueOfEachShipper =
                valueOfEachShipper

              hourData[
                existingIndex
              ].systemValue = systemValue

              const existingActiveModeDate =
                hourData?.[existingIndex]
                  ?.activeMode?.start_date

              const newActiveModeDate =
                activeMode?.start_date

              if (
                !existingActiveModeDate ||
                (
                  newActiveModeDate &&
                  dayjs(newActiveModeDate).isAfter(
                    dayjs(existingActiveModeDate)
                  )
                )
              ) {
                hourData[
                  existingIndex
                ].activeMode = activeMode
              }
            } else {
              hourData.push({
                gas_hour: i,

                gas_hour_text:
                  i >= 10
                    ? `${i}:00`
                    : `0${i}:00`,

                mode: thisHourData
                  ? thisHourData?.mode
                  : null,

                zone: thisHourData
                  ? tab
                  : null,

                value,

                valueOfEachShipper,

                systemValue,

                activeMode
              })
            }
          }

          nDataTempAll.push({
            gas_day: currentGasDay,
            hour: hourData
          })
        } else {
          /*
          * ถึงไม่มีข้อมูล Eviden ก็สร้าง hour 0-24
          * พร้อม key Shipper เป็น null
          *
          * ป้องกันกราฟและตารางไม่มีโครงสร้างข้อมูล
          */
          const emptyHourData = Array.from({
            length: 25
          }).map((_, i) => {
            const emptyValue: any = {
              all: null,

              high_max_percentage: null,
              high_dd_percentage: null,
              high_red_percentage: null,
              high_orange_percentage: null,
              high_alert_percentage: null,

              low_max_percentage: null,
              low_dd_percentage: null,
              low_red_percentage: null,
              low_orange_percentage: null,
              low_alert_percentage: null,

              high_alert: null,
              high_orange: null,
              high_red: null,
              high_dd: null,
              high_max: null,

              baseInv: null,

              accImb_or_accImbInv: null,
              accImb_or_accImbInv_percentage: null,

              low_alert: null,
              low_orange: null,
              low_red: null,
              low_dd: null,
              low_max: null
            }

            const emptySystemValue: any = {
              ...emptyValue
            }

            groupMaster.forEach((group: any) => {
              if (group?.name) {
                emptyValue[group.name] = null
                emptySystemValue[group.name] = null
              }
            })

            return {
              gas_hour: i,

              gas_hour_text:
                i >= 10
                  ? `${i}:00`
                  : `0${i}:00`,

              mode: null,
              zone: null,

              value: emptyValue,

              valueOfEachShipper: {},

              systemValue:
                emptySystemValue,

              activeMode:
                lastetModeBeforeToday.find(
                  (item: any) =>
                    isMatch(
                      item?.zone?.name,
                      tab
                    )
                )
            }
          })

          nDataTempAll.push({
            gas_day: currentGasDay,
            hour: emptyHourData
          })
        }
      }
    }

    const fShipperName = Array.from(
      new Set(
        Object.values(
          mapShipperIDWithName
        ).filter(Boolean)
      )
    )

    function randomColor() {
      return (
        '#' +
        Math.floor(
          Math.random() * 16777215
        )
          .toString(16)
          .padStart(6, '0')
      )
    }

    const dataUse = {
      templateLabelKeys: [
        ...fShipperName.map(
          (shipperName: string) => {
            return {
              lebel: shipperName,
              color: randomColor(),
              key: shipperName,
              type: 'bar'
            }
          }
        ),

        {
          lebel: 'All',
          color: '#535353',
          key: 'all',
          type: 'lineGraph'
        },

        {
          lebel: 'High Max',
          color: '#535353',
          key: 'high_max',
          type: 'line'
        },

        {
          lebel: 'High Difficult Day',
          color: '#824ba6',
          key: 'high_dd',
          type: 'line'
        },

        {
          lebel: 'High Red',
          color: '#da1610',
          key: 'high_red',
          type: 'line'
        },

        {
          lebel: 'High Orange',
          color: '#f56f16',
          key: 'high_orange',
          type: 'line'
        },

        {
          lebel: 'Alert High',
          color: '#eac12a',
          key: 'high_alert',
          type: 'line'
        },

        {
          lebel: 'Low Min',
          color: '#535353',
          key: 'low_max',
          type: 'line'
        },

        {
          lebel: 'Low Difficult Day',
          color: '#824ba6',
          key: 'low_dd',
          type: 'line'
        },

        {
          lebel: 'Low Red',
          color: '#da1610',
          key: 'low_red',
          type: 'line'
        },

        {
          lebel: 'Low Orange',
          color: '#f56f16',
          key: 'low_orange',
          type: 'line'
        },

        {
          lebel: 'Alert Low',
          color: '#eac12a',
          key: 'low_alert',
          type: 'line'
        }
      ],

      data: nDataTempAll
    }

    return dataUse
  }

  async intradayAccImbalanceInventoryOriginal2(payload: any, userId: any) {
    const {gas_day, latest_daily_version, latest_hourly_version, timestamp, skip, limit} = payload

    const gasDayjs = getTodayNowYYYYMMDDDfaultAdd7(gas_day)

    const publicationCenter = await this.prisma.publication_center.findMany({
      where: {
        // del_flag: null,
        gas_day_text: gas_day
      }
    })

    let totalRecord: number | undefined = undefined
    await this.evidenApiCenter(
      {
        gas_day: gas_day,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 1
      },
      'balance_intraday_acc_imb_inventory',
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    const evidenApiCenter: any = await this.evidenApiCenter(
      {
        gas_day: gas_day, // 2025-01-01 to 2025-02-28
        start_hour: 1,
        end_hour: 24,
        skip: totalRecord ? 0 : Number(skip),
        limit: totalRecord ? totalRecord : Number(limit)
      },
      'balance_intraday_acc_imb_inventory'
    )
    
    // const newData = (evidenApiCenter?.data || []).filter((evidenData: any) => {
    //   const isDelete = publicationCenter.some((publication: any) => {
    //     return (
    //       publication.gas_day_text === evidenData.gas_day &&
    //       publication.gas_hour === evidenData.gas_hour &&
    //       evidenData.execute_timestamp === publication.execute_timestamp &&
    //       publication.del_flag === true
    //     );
    //   });
    //   return !isDelete;
    // });

    const grouped = {}
    for (const curr of evidenApiCenter?.data ?? []) {
      if(!curr){
        continue;
      }
      const key = `${curr.gas_day}|${curr.gas_hour}|${curr.execute_timestamp}`

      if (!grouped[key]) {
        grouped[key] = {
          gas_day: curr.gas_day,
          gas_hour: curr.gas_hour,
          execute_timestamp: curr.execute_timestamp,
          data: []
        }
      }

      grouped[key].data.push({
        ...curr
      })
    }


    const mode_zone_base_inventory = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        start_date: {
          lte: gasDayjs.endOf('day').toDate()
        }
      },
      include: {
        zone: true,
        mode: true
      }
    })

    const resultGroup: any = Object.values(grouped)
    function filterLatestByZone(data: any) {
      const grouped = new Map()

      for (const item of data) {
        const key = `${item.zone}`
        const existing = grouped.get(key)

        // ถ้ายังไม่มี หรือ request_number ใหม่กว่า
        if (!existing || item.request_number > existing.request_number) {
          grouped.set(key, item)
        }
      }

      return Array.from(grouped.values())
    }

    let resultGroupZoneLast = await Promise.all(
      resultGroup?.map(async (e: any) => {
        const {data, gas_hour, ...nE} = e
        const filtered = filterLatestByZone(data)

        const gasHour = `${gas_hour > 10 ? gas_hour + ':00' : '0' + gas_hour + ':00'}` || null

        const formatedTimestamp = getTodayNowAdd7(e['execute_timestamp'] * 1000)
          .tz('Asia/Bangkok')
          .format(`DD/MM/YYYY HH:mm`)
        const gasTime = getTodayNowYYYYMMDDHHmmDfaultAdd7(`${nE?.gas_day} ${gasHour ? gasHour: '00:00'}`)
        // const timestamp = gasTime.isValid() ? gasTime.format(`DD/MM/YYYY HH:mm`) : formatedTimestamp
        const timestamp = formatedTimestamp // https://app.clickup.com/t/9018502823/86ey4nae1
        

        const eastEvidenData = filtered?.find((f: any) => {
          return f?.zone === 'EAST'
        })
        const westEvidenData = filtered?.find((f: any) => {
          return f?.zone === 'WEST'
        })
        const eastData = eastEvidenData?.values || []
        const westData = westEvidenData?.values || []
        const findFn = (data: any, key: any) => {
          const value = data?.find((f: any) => {
            return f?.tag === key
          })?.value
          return value
        }

        const filteredEast = mode_zone_base_inventory?.filter((f: any) => isMatch(f?.zone?.name, 'EAST') && getTodayNowAdd7(f?.start_date).isSameOrBefore(getTodayNowDDMMYYYYHHmmDfaultAdd7(timestamp)))

        const modeZoneEast =
          filteredEast && filteredEast.length > 0
            ? filteredEast.reduce((prev: any, curr: any) => {
                const prevDiff = Math.abs(dayjs(timestamp, 'DD/MM/YYYY HH:mm').diff(dayjs(prev.start_date)))
                const currDiff = Math.abs(dayjs(timestamp, 'DD/MM/YYYY HH:mm').diff(dayjs(curr.start_date)))
                if(currDiff == prevDiff){
                  return dayjs(curr.create_date).isAfter(dayjs(prev.create_date)) ? curr : prev
                }
                return currDiff < prevDiff ? curr : prev
              })
            : null

        const filteredWest = mode_zone_base_inventory?.filter((f: any) => isMatch(f?.zone?.name, 'WEST')&& getTodayNowAdd7(f?.start_date).isSameOrBefore(getTodayNowDDMMYYYYHHmmDfaultAdd7(timestamp)))

        const modeZoneWest =
          filteredWest && filteredWest.length > 0
            ? filteredWest.reduce((prev: any, curr: any) => {
                const prevDiff = Math.abs(dayjs(timestamp, 'DD/MM/YYYY HH:mm').diff(dayjs(prev.start_date)))
                const currDiff = Math.abs(dayjs(timestamp, 'DD/MM/YYYY HH:mm').diff(dayjs(curr.start_date)))
                if(currDiff == prevDiff){
                  return dayjs(curr.create_date).isAfter(dayjs(prev.create_date)) ? curr : prev
                }
                return currDiff < prevDiff ? curr : prev
              })
            : null

        const publication = !publicationCenter.some((publication: any) => {
          return publication.gas_day_text === nE.gas_day && publication.gas_hour === gas_hour && publication.execute_timestamp === nE.execute_timestamp && publication.del_flag === true
        })

        return {
          ...nE,
          publication,
          gasHour: gasHour,
          gas_hour: gas_hour,
          timestamp: timestamp,
          east_totalInv: findFn(eastData, 'totalInv'),
          east_baseInv: findFn(eastData, 'baseInv'),
          east_totalAccImbInv: findFn(eastData, 'totalAccImbInv'),
          east_accImbExculdePTT: findFn(eastData, 'accImbExculdePTT'),
          east_other: findFn(eastData, 'other'),
          east_accImbInvPTT: findFn(eastData, 'accImbInvPTT'),
          east_mode_zone: eastEvidenData?.mode || modeZoneEast?.mode?.mode || null,
          west_totalInv: findFn(westData, 'totalInv'),
          west_baseInv: findFn(westData, 'baseInv'),
          west_totalAccImbInv: findFn(westData, 'totalAccImbInv'),
          west_accImbExculdePTT: findFn(westData, 'accImbExculdePTT'),
          west_other: findFn(westData, 'other'),
          west_accImbInvPTT: findFn(westData, 'accImbInvPTT'),
          west_mode_zone: westEvidenData?.mode || modeZoneWest?.mode?.mode || null,
          valiedateEast: eastData,
          valiedateWest: westData
          // data: filtered,
        }
      })
    )

    if (timestamp) {
      const filterTimestamp = getTodayNowDDMMYYYYHHmmDfaultAdd7(timestamp)
      if (filterTimestamp.isValid()) {
        resultGroupZoneLast = resultGroupZoneLast.filter((item: any) => {
          const itemTimestamp = getTodayNowAdd7(item.execute_timestamp * 1000)

          return itemTimestamp.isValid() && itemTimestamp.isSame(filterTimestamp, 'minute')
        })
      }
    }

    if (latest_hourly_version) {
      // Group by gas_day_text and gas_hour, then get the latest timestamp for each group
      const groupedByHour = new Map()

      resultGroupZoneLast.forEach((item: any) => {
        const key = `${item.gas_day}_${item.gas_hour ?? item.gasHour}`
        if (!groupedByHour.has(key) || compareTimestamps(item.execute_timestamp, groupedByHour.get(key).execute_timestamp) > 0) {
          groupedByHour.set(key, item)
        }
      })

      resultGroupZoneLast = Array.from(groupedByHour.values())
    }

    if (latest_daily_version) {
      // First, group by gas_day_text, zone_text, and mode to get the latest gas_hour for each group
      const groupedByLatestHour = new Map()
      resultGroupZoneLast.forEach((item: any) => {
        const key = `${item.gas_day}`

        if (!groupedByLatestHour.has(key) || compareGasHour(item.gas_hour ?? item.gasHour, groupedByLatestHour.get(key).gas_hour ?? groupedByLatestHour.get(key).gasHour) > 0) {
          groupedByLatestHour.set(key, item)
        }
      })

      // Then, from the latest gas_hour records, get the latest timestamp for each group
      const groupedByDay = new Map()
      Array.from(groupedByLatestHour.values()).forEach((item: any) => {
        const key = `${item.gas_day}`

        if (!groupedByDay.has(key) || compareTimestamps(item.execute_timestamp, groupedByDay.get(key).execute_timestamp) > 0) {
          groupedByDay.set(key, item)
        }
      })
      resultGroupZoneLast = Array.from(groupedByDay.values())
    }

    return resultGroupZoneLast
  }
  //#endregion
}
