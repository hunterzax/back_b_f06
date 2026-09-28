import * as https from 'https'
import axios from 'axios'
import {Dayjs} from 'dayjs'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {parseToNumber} from 'src/common/utils/number.util'
import {sleep} from 'src/common/utils/async.util'
import {getTodayNowAdd7} from 'src/common/utils/date.util'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Bangkok')

@Injectable()
export class AllocationRepository {
  constructor(private readonly prisma: PrismaService) {}
  // *Request Eviden API

  async getEvidenApiAllocationIntraday(startDate: Dayjs, endDate: Dayjs) {
    try {
      console.time('[RUNTIME] getEvidenApiAllocationIntraday')
      console.log('[INFO] getEvidenApiAllocationIntraday: input = { ', startDate.format('YYYY-MM-DD'), ', ', endDate.format('YYYY-MM-DD'), ' }')
      const executeList = await this.getExecuteIntradayOKRecords(startDate.toDate(), endDate.toDate())
      const limit = await this.countExecuteIntraday(startDate.toDate(), endDate.toDate())
      const dateArray: Dayjs[] = []
      let current = startDate

      while (current.isSameOrBefore(endDate)) {
        dateArray.push(current)
        current = current.add(1, 'day')
      }

      const responseEvidenApi = (
        await Promise.all(
          dateArray.map(async (date) => {
            const data = {
              gas_day: date,
              start_hour: 1,
              end_hour: 24,
              skip: 0,
              limit: limit
            }
            return await this.requestEvidenApi(data, 'allocation_intraday')
          })
        )
      ).flat()
      console.timeEnd('[RUNTIME] getEvidenApiAllocationIntraday')
      return this.matchExecute(responseEvidenApi, executeList)
    } catch (error) {
      console.log('[ERROR] getEvidenApiAllocationIntraday: ', error)
      return []
    }
  }

  async getEvidenApiAllocationIntradayReportNom(startDate: Dayjs, endDate: Dayjs) {
    try {
      console.time('[RUNTIME] getEvidenApiAllocationIntradayReportNom')
      console.log('[INFO] getEvidenApiAllocationIntradayReportNom: input = { ', startDate.format('YYYY-MM-DD'), ', ', endDate.format('YYYY-MM-DD'), ' }')
      const executeList = await this.getExecuteIntradayOKRecords(startDate.toDate(), endDate.toDate())
      const limit = await this.countExecuteIntraday(startDate.toDate(), endDate.toDate())
      const data = {
        start_date: startDate,
        end_date: endDate,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: limit
      }

      const responseEvidenApi = await this.requestEvidenApi(data, 'allocation_allocation_report_intraday_by_nomination_point')
      console.timeEnd('[RUNTIME] getEvidenApiAllocationIntradayReportNom')
      return this.matchExecute(responseEvidenApi, executeList)
    } catch (error) {
      console.log('[ERROR] getEvidenApiAllocationIntradayReportNom: ', error)
      return []
    }
  }

  async getEvidenApiAllocationIntradayReportCon(startDate: Dayjs, endDate: Dayjs) {
    try {
      console.time('[RUNTIME] getEvidenApiAllocationIntradayReportCon')
      console.log('[INFO] getEvidenApiAllocationIntradayReportCon: input = { ', startDate.format('YYYY-MM-DD'), ', ', endDate.format('YYYY-MM-DD'), ' }')
      const executeList = await this.getExecuteIntradayOKRecords(startDate.toDate(), endDate.toDate())
      const limit = await this.countExecuteIntraday(startDate.toDate(), endDate.toDate())

      const data = {
        start_date: startDate,
        end_date: endDate,
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: limit
      }

      const responseEvidenApi = await this.requestEvidenApi(data, 'allocation_allocation_report_intraday_by_contract_point')
      console.timeEnd('[RUNTIME] getEvidenApiAllocationIntradayReportCon')
      return this.matchExecute(responseEvidenApi, executeList)
    } catch (error) {
      console.log('[ERROR] getEvidenApiAllocationIntradayReportCon: ', error)
      return []
    }
  }

  async getEvidenApiAllocationEod(startDate: Dayjs, endDate: Dayjs) {
    console.time('[RUNTIME] getEvidenApiAllocationEod')
    console.log('[INFO] evidenApiAllocationEod: input = { ', startDate.format('YYYY-MM-DD'), ', ', endDate.format('YYYY-MM-DD'), ' }')
    const executeList = await this.getExecuteEodOKRecords(startDate.toDate(), endDate.toDate())
    const count = await this.countExecuteEod(startDate.toDate(), endDate.toDate())
    const limit = count * (endDate.diff(startDate, 'day') + 1)

    const data = {
      start_date: startDate,
      end_date: endDate,
      skip: 0,
      limit: limit
    }

    const responseEvidenApi = await this.requestEvidenApi(data, 'allocation_eod')

    console.timeEnd('[RUNTIME] getEvidenApiAllocationEod')
    return this.matchExecute(responseEvidenApi, executeList)
  }

  async getEvidenApiAllocationReportNom(startDate: Dayjs, endDate: Dayjs, isLastVersion: boolean, version?: number) {
    console.time('[RUNTIME] getEvidenApiAllocationReportNom')
    let responseEvidenApi = []
    console.log('[INFO] getEvidenApiAllocationReportNom: input = { ', startDate.format('YYYY-MM-DD'), ', ', endDate.format('YYYY-MM-DD'), ' }')
    const executeList = await this.getExecuteEodOKRecords(startDate.toDate(), endDate.toDate(), version)
    const count = await this.countExecuteEod(startDate.toDate(), endDate.toDate())
    const limit = count * (endDate.diff(startDate, 'day') + 1)

    if (isLastVersion) {
      const listExecuteTimestemp = await this.getLastTimetempExecuteEOD(startDate, endDate)
      for (const row of listExecuteTimestemp) {
        const data = {
          start_date: row.start_date,
          end_date: row.end_date,
          execute_timestamp: row.execute_timestamp,
          skip: 0,
          limit: limit
        }
        const response = await this.requestEvidenApi(data, 'allocation_allocation_report_by_nomination_point')
      // ไม่มี concept "East_to_RA6", "East_to_BVW10", "West_to_RA6", "West_to_BVW10" ไม่ return มา
        console.log('data : ', data);
        console.log('### response : ', response);
        responseEvidenApi.push(response)
      }
      responseEvidenApi = responseEvidenApi.flat()
    } else {
      const data = {
        start_date: startDate,
        end_date: endDate,
        skip: 0,
        limit: limit
      }
      responseEvidenApi = await this.requestEvidenApi(data, 'allocation_allocation_report_by_nomination_point')
    }
    console.timeEnd('[RUNTIME] getEvidenApiAllocationReportNom')
    // เดิมส่งออกมาแต่ point_type: 'NOM'
    // ไม่มี concept "East_to_RA6", "East_to_BVW10", "West_to_RA6", "West_to_BVW10" ไม่ return มา
    // https://app.clickup.com/t/9018502823/86eun6ar1
    console.log('---###---');
    console.log('# isLastVersion : ', isLastVersion);
    console.log('# responseEvidenApi : ', responseEvidenApi);
    console.log('# executeList : ', executeList);
    console.log('---###---');
    return this.matchExecute(responseEvidenApi, executeList)
  }

  async getEvidenApiAllocationReportCon(startDate: Dayjs, endDate: Dayjs, isLastVersion: boolean) {
    console.time('[RUNTIME] getEvidenApiAllocationReportCon')
    let responseEvidenApi = []
    console.log('[INFO] getEvidenApiAllocationReportCon: input = { ', startDate.format('YYYY-MM-DD'), ', ', endDate.format('YYYY-MM-DD'), ' }')
    const executeList = await this.getExecuteEodOKRecords(startDate.toDate(), endDate.toDate())
    const count = await this.countExecuteEod(startDate.toDate(), endDate.toDate())
    const limit = count * (endDate.diff(startDate, 'day') + 1)

    if (isLastVersion) {
      const listExecuteTimestemp = await this.getLastTimetempExecuteEOD(startDate, endDate)
      for (const row of listExecuteTimestemp) {
        const data = {
          start_date: row.start_date,
          end_date: row.end_date,
          execute_timestamp: row.execute_timestamp,
          skip: 0,
          limit: limit
        }
        const response = await this.requestEvidenApi(data, 'allocation_allocation_report_by_contract_point')
        responseEvidenApi.push(response)
      }
      responseEvidenApi = responseEvidenApi.flat()
    } else {
      const data = {
        start_date: startDate,
        end_date: endDate,
        skip: 0,
        limit: limit
      }
      responseEvidenApi = await this.requestEvidenApi(data, 'allocation_allocation_report_by_contract_point')
    }
    console.timeEnd('[RUNTIME] getEvidenApiAllocationReportCon')
    return this.matchExecute(responseEvidenApi, executeList)
  }

  private matchExecute(responseEvidenApi, executerList) {
    return responseEvidenApi.filter((item: any) => {
      return executerList?.some((executeData: any) => {
        const isMatched = executeData.request_number_id == item.request_number
        // if (!isMatched) {
        //   console.log('[DEBUG] matchExecute: ',
        //     executeData.request_number_id, ' != ', item.request_number,
        //     '  DROP request_number:', item.request_number, 'gas_day:', item.gas_day
        //   );
        // }
        return isMatched
      })
    })
  }

  private handleReqeust(requestBody) {
    const today = dayjs().startOf('day')

    if (requestBody?.start_date && requestBody?.end_date) {
      // console.log('[DEBUG] handleReqeust: start_date and end_date exist');
      const startDate = requestBody.start_date
      const endDate = requestBody.end_date
      if (today.isBefore(startDate)) return null
      if (endDate.isBefore(startDate)) return null
      if (today.isBefore(endDate)) {
        console.log('[INFO] handleReqeust: replace end with today', today.format('YYYY-MM-DD'))
        return {
          ...requestBody,
          start_date: startDate.format('YYYY-MM-DD'),
          end_date: today.format('YYYY-MM-DD')
        }
      }
      return {
        ...requestBody,
        start_date: startDate.format('YYYY-MM-DD'),
        end_date: endDate.format('YYYY-MM-DD')
      }
    }
    if (requestBody?.gas_day) {
      const gasDay = requestBody.gas_day
      return {
        ...requestBody,
        gas_day: gasDay.format('YYYY-MM-DD')
      }
    }
    return requestBody
  }

  async requestEvidenApi(requestBody, endpoint: string, callback?: (total_record: number) => void) {
    // console.time(
    //   '[RUNTIME] requestEvidenApi'
    // )
    requestBody = this.handleReqeust(requestBody)
    console.log('[INFO] requestEvidenApi: ' + endpoint + ' input = ', requestBody)
    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })
    const config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      url: `${process.env.IP_EVIDEN}/${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN
      },
      httpsAgent: agent,
      data: JSON.stringify(requestBody)
    }
    // console.log('__ config : ', config);
    try {
      if (!requestBody) return []
      const resEviden = await axios.request(config)
      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (resEviden && Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden.data.map((resEvidenData: any) => {
            if (resEvidenData && resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              if (resEvidenData && resEvidenData?.total_record) {
                if (total_record) {
                  total_record += resEvidenData?.total_record
                } else {
                  total_record = resEvidenData?.total_record
                }
              }
              evidenData.push(...resEvidenData.data)
            }
          })
          if (callback && total_record) {
            callback(total_record)
          }
        } else {
          if (callback && resEviden && resEviden?.data?.total_record) {
            callback(resEviden.data.total_record)
          }
          evidenData = resEviden && resEviden?.data?.data || []
        }
      }
      console.log('[INFO] requestEvidenApi: evidenData.length =', evidenData?.length || 0)
      return evidenData
    } catch (error) {
      console.log('[ERROR] requestEvidenApi: ', error)
      if (error.response) {
        console.log('[ERROR] requestEvidenApi: Eviden API Error Status:', error.response.status)
        console.log('[ERROR] requestEvidenApi: Eviden API Error Data:', error.response.data)
      } else {
        console.log('[ERROR] requestEvidenApi: Eviden API Error:', error.message)
      }
      return []
    } finally {
      // console.timeEnd(
      //   '[RUNTIME] requestEvidenApi'
      // )
    }
  }

  // *Postgres
  // DAM
  async getEntryExit() {
    return this.prisma.entry_exit.findMany({
      where: {}
    })
  }
  async getArea(startDate: Date, endDate: Date) {
    return await this.prisma.area.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: endDate
            }
          },
          {
            OR: [
              {
                end_date: null
              },
              {
                end_date: {
                  gte: startDate
                }
              }
            ]
          }
        ]
      }
    })
  }

  // Allocation
  async getAllocationManagement(startDate: Date, endDate: Date) {
    return this.prisma.allocation_management.findMany({
      where: {
        gas_day: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        allocation_management_comment: {
          include: {
            allocation_status: true,
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
        allocation_management_shipper_review: {
          include: {},
          take: 1,
          orderBy: {
            id: 'desc'
          }
        },
        allocation_status: true
      }
    })
  }

  async getAllocationReportView(startDate: Date, endDate: Date) {
    return this.prisma.allocation_report_view.findMany({
      select: {
        id: true,
        gas_day_text: true,
        shipper_name_text: true,
        contract_code_text: true,
        point_text: true,
        entry_exit_text: true,
        area_text: true,
        zone_text: true
      },
      where: {
        gas_day: {
          gte: startDate,
          lte: endDate
        }
      }
    })
  }

  async getAllocationReport(startDate: Date, endDate: Date) {
    return this.prisma.allocation_report.findMany({
      select: {
        id: true,
        gas_day_text: true,
        shipper_name_text: true,
        contract_code_text: true,
        point_text: true,
        entry_exit_text: true,
        area_text: true,
        zone_text: true
      },
      where: {
        gas_day: {
          gte: startDate,
          lte: endDate
        }
      }
    })
  }

  async createAllocationReportView(data: any) {
    await this.prisma.allocation_report_view.createMany({
      data: data
    })
  }

  async createAllocationReport(data: any) {
    await this.prisma.allocation_report.createMany({
      data: data
    })
  }

  // Execution
  async getPublication(startDate: Date, endDate: Date, isDel: boolean) {
    return this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: startDate
            }
          },
          {
            gas_day: {
              lte: endDate
            }
          },
          {
            del_flag: isDel
          }
        ]
      }
    })
  }

  async getExecuteEodOKRecords(startDate: Date, endDate: Date, version?: number) {
    return this.prisma.execute_eod.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        start_date_date: {
          lte: endDate
        },
        end_date_date: {
          gte: startDate
        },
        ...(version && {
          execute_timestamp: {
            lte: version
          }
        })
      },
      select: {
        request_number_id: true,
        execute_timestamp: true,
        status: true,
        start_date: true,
        end_date: true,
        start_date_date: true,
        end_date_date: true
      }
    })
  }

  async countExecuteEod(startDate: Date, endDate: Date) {
    return this.prisma.execute_eod.count({
      where: {
        start_date_date: {
          lte: endDate
        },
        end_date_date: {
          gte: startDate
        }
      }
    })
  }

  async getExecuteIntradayOKRecords(startDate: Date, endDate: Date) {
    return this.prisma.execute_intraday.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day_date: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        request_number_id: true,
        execute_timestamp: true,
        status: true,
        gas_day: true,
        gas_day_date: true,
        gas_hour: true
      }
    })
  }

  async getLastTimetempExecuteEOD(startDate: Dayjs, endDate: Dayjs) {
    const records = await this.getExecuteEodOKRecords(startDate.toDate(), endDate.toDate())
    const dailyMap = new Map<Dayjs, number>()

    for (let d = startDate.clone(); d.isSameOrBefore(endDate); d = d.add(1, 'day')) {
      const maxTs = records
        .filter((r) => dayjs(r.start_date_date).isSameOrBefore(d) && dayjs(r.end_date_date).isSameOrAfter(d))
        .reduce<number | null>((max, r) => {
          return Math.max(max ?? 0, r.execute_timestamp)
        }, null)

      if (maxTs) dailyMap.set(d, maxTs)
    }

    const entries = [...dailyMap.entries()]
    const result = []

    let rangeStart = null
    let prevDate = null
    let prevTs = null

    for (const [date, ts] of entries) {
      if (prevTs === null) {
        rangeStart = date
      } else if (ts !== prevTs || date.diff(prevDate, 'day') > 1) {
        result.push({
          start_date: rangeStart,
          end_date: prevDate,
          execute_timestamp: prevTs
        })
        rangeStart = date
      }

      prevDate = date
      prevTs = ts
    }

    if (prevTs !== null) {
      result.push({
        start_date: rangeStart,
        end_date: prevDate,
        execute_timestamp: prevTs
      })
    }

    return result
  }

  async countExecuteIntraday(startDate: Date, endDate: Date) {
    return this.prisma.execute_intraday.count({
      where: {
        gas_day_date: {
          gte: startDate,
          lte: endDate
        }
      }
    })
  }

  // *Execution helpers

  async createRunNumber(type: string, userId?: any): Promise<number> {
    const nowAt = getTodayNowAdd7()
    const runnum = await this.prisma.execute_runnumber.create({
      data: {
        request_number_type: type,
        create_date: nowAt.toDate(),
        create_date_num: nowAt.unix(),
        create_by: userId ? Number(userId) : undefined
      }
    })
    return runnum?.id
  }

  async createExecuteEod(createNumberId: number, execute_timestamp: number, start_date_eod: Date, end_date_eod: Date) {
    const nowAt = getTodayNowAdd7()
    return this.prisma.execute_eod.create({
      data: {
        request_number: {
          connect: {
            id: Number(createNumberId)
          }
        },
        execute_timestamp: execute_timestamp,
        create_date: nowAt.toDate(),
        create_date_num: nowAt.unix(),
        start_date_date: start_date_eod,
        start_date: dayjs(start_date_eod).format('YYYY-MM-DD'),
        end_date_date: end_date_eod,
        end_date: dayjs(end_date_eod).format('YYYY-MM-DD')
      },
      include: {
        request_number: true
      }
    })
  }

  async createLogExecuteEod(request_number: number, execute_timestamp: number, start_date: string, end_date: string, nowAt: Dayjs, userId?: any) {
    return this.prisma.log_execute_eod.create({
      data: {
        request_number: request_number,
        execute_timestamp: execute_timestamp,
        start_date: start_date,
        end_date: end_date,
        create_date: nowAt.toDate(),
        create_date_num: nowAt.unix(),
        create_by: userId ? Number(userId) : undefined
      }
    })
  }

  async findLatestOKEodForDate(dateStr: string) {
    return this.prisma.execute_eod.findFirst({
      select: {
        id: true,
        request_number_id: true,
        status: true,
        start_date: true
      },
      where: {
        status: 'OK',
        start_date_date: {
          lt: dayjs(dateStr, 'YYYY-MM-DD').toDate()
        },
        end_date_date: {
          gte: dayjs(dateStr, 'YYYY-MM-DD').subtract(1, 'day').toDate()
        }
      },
      orderBy: {
        execute_timestamp: 'desc'
      }
    })
  }

  async findOKIntradayBeforeHourOnDay(gasDay: string, beforeHour: number) {
    return this.prisma.execute_intraday.findMany({
      select: {
        request_number_id: true,
        gas_day: true,
        gas_hour: true,
        execute_timestamp: true
      },
      where: {
        status: 'OK',
        gas_day: gasDay,
        gas_hour: {
          lt: beforeHour
        }
      },
      orderBy: [
        {gas_day: 'desc'},
        {gas_hour: 'desc'},
        {
          execute_timestamp: 'desc'
        }
      ]
    })
  }

  async findOKIntradayBeforeHourOrYesterday(today: string, yesterday: string, beforeHour: number) {
    return this.prisma.execute_intraday.findMany({
      select: {
        request_number_id: true,
        gas_day: true,
        gas_hour: true,
        execute_timestamp: true
      },
      where: {
        status: 'OK',
        OR: [
          {
            AND: [
              {
                gas_hour: {
                  lt: beforeHour
                }
              },
              {gas_day: today}
            ]
          },
          {gas_day: yesterday}
        ]
      },
      orderBy: [
        {gas_day: 'desc'},
        {gas_hour: 'desc'},
        {
          execute_timestamp: 'desc'
        }
      ]
    })
  }

  async createLogExecuteIntraday(request_number: number, execute_timestamp: number, request_number_previous_hour: number | null, request_number_eod: number, gas_day: string, gas_hour: number, now: Dayjs, userId?: any) {
    return this.prisma.log_execute_intraday.create({
      data: {
        request_number: request_number,
        execute_timestamp: execute_timestamp,
        request_number_previous_hour: request_number_previous_hour,
        request_number_eod: request_number_eod,
        gas_day: gas_day,
        gas_hour: gas_hour,
        create_date: now.toDate(),
        create_date_num: now.unix(),
        create_by: userId ? Number(userId) : undefined
      }
    })
  }

  async createExerIntradayLog(createNumberId: any, id_eod: any, execute_timestamp: any, request_number_previous_hour: any, gas_day: any, hour: any) {
    try {
      const createIntraday = await this.prisma.execute_intraday.create({
        data: {
          request_number: {
            connect: {
              id: Number(createNumberId)
            }
          },
          request_number_eod: {
            connect: {
              id: id_eod
            }
          },
          execute_timestamp: execute_timestamp,
          request_number_previous_hour: request_number_previous_hour,
          gas_day_date: dayjs(gas_day).toDate(),
          gas_day: gas_day,
          gas_hour: hour
        },
        include: {
          request_number: true
        }
      })
      return createIntraday
    } catch (error) {
      return null
    }
  }

  async isPublish(execute_timestamp: any, gasHour: any, gasDay: string) {
    const lastPublic = await this.prisma.publication_center.findFirst({
      select: {
        execute_timestamp: true,
        gas_day: true,
        gas_hour: true
      },
      where: {
        execute_timestamp: execute_timestamp,
        gas_day_text: gasDay,
        gas_hour: gasHour,
        del_flag: true
      },
      orderBy: [
        {
          create_date_num: 'desc'
        },
        {
          update_date_num: 'desc'
        }
      ]
    })
    return lastPublic ? false : true
  }

  async waitExecuteEodFinished(request_number_id: any, execute_timestamp: any) {
    const timeoutMin = Math.max(parseToNumber(process.env.ALLOC_EOD_WAIT_TIMEOUT_MIN) ?? 30, 1)
    const intervalMin = Math.max(parseToNumber(process.env.ALLOC_EOD_POLL_INTERVAL_MIN) ?? 1, 1)
    const timeoutMs = timeoutMin * 60 * 1000
    const intervalMs = intervalMin * 60 * 1000
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const executeEod = await this.prisma.execute_eod.findFirst({
        select: {
          id: true,
          request_number_id: true,
          execute_timestamp: true,
          finish_timestamp: true,
          status: true,
          msg: true
        },
        where: {
          request_number_id: Number(request_number_id),
          execute_timestamp: Number(execute_timestamp)
        }
      })

      if (executeEod?.status) {
        return executeEod
      }

      await sleep(intervalMs)
    }

    return null
  }

  // *getStartDateForEod queries

  async findLastOKExecuteEod() {
    return this.prisma.execute_eod.findFirst({
      select: {
        id: true,
        execute_timestamp: true
      },
      where: {
        status: 'OK'
      },
      orderBy: {
        execute_timestamp: 'desc'
      }
    })
  }

  getThaiGasHourBoundary(gasDay: string, gasHour: number): Date {
    return dayjs.tz(gasDay, 'Asia/Bangkok').startOf('day').add(Number(gasHour), 'hour').toDate()
  }

  getModeZoneBaseInventoryEffectiveTime(modeZoneBaseInventory: any): Date | null {
    const startDate = modeZoneBaseInventory?.start_date

    if (!startDate) {
      return null
    }

    const effectiveTime = dayjs(startDate)

    if (!effectiveTime.isValid()) {
      return null
    }

    return effectiveTime.toDate()
  }

  getReplayStartGasDayAndHour(effectiveTimeInput: Date): {
    gasDay: string
    gasHour: number
  } | null {
    const effectiveTime = dayjs(effectiveTimeInput).tz('Asia/Bangkok')

    if (!effectiveTime.isValid()) {
      return null
    }

    if (effectiveTime.isSame(effectiveTime.startOf('day'))) {
      return {
        gasDay: effectiveTime.subtract(1, 'day').format('YYYY-MM-DD'),
        gasHour: 24
      }
    }

    let gasDay = effectiveTime.format('YYYY-MM-DD')
    let gasHour = effectiveTime.hour()

    if (!effectiveTime.isSame(effectiveTime.startOf('hour'))) {
      gasHour += 1
    }

    if (gasHour > 24) {
      gasDay = effectiveTime.add(1, 'day').format('YYYY-MM-DD')
      gasHour -= 24
    }

    return {
      gasDay,
      gasHour
    }
  }

  evaluateModeZoneBaseInventoryIntradayRecalculationCandidate(modeZoneBaseInventory: any, latestIntraday: any) {
    const createDateNum = Number(modeZoneBaseInventory?.create_date_num)
    const executeTimestamp = Number(latestIntraday?.execute_timestamp)
    const gasDay = latestIntraday?.gas_day
    const gasHour = Number(latestIntraday?.gas_hour)
    const effectiveTime = this.getModeZoneBaseInventoryEffectiveTime(modeZoneBaseInventory)

    if (!Number.isFinite(createDateNum)) {
      return {
        qualifies: false,
        effectiveTime,
        latestGasHourBoundary: null,
        reason: 'missing_create_date_num'
      }
    }

    if (!Number.isFinite(executeTimestamp)) {
      return {
        qualifies: false,
        effectiveTime,
        latestGasHourBoundary: null,
        reason: 'missing_latest_execute_timestamp'
      }
    }

    if (!gasDay || !Number.isFinite(gasHour)) {
      return {
        qualifies: false,
        effectiveTime,
        latestGasHourBoundary: null,
        reason: 'missing_latest_gas_hour'
      }
    }

    const latestGasHourBoundary = this.getThaiGasHourBoundary(gasDay, gasHour)

    if (!effectiveTime) {
      return {
        qualifies: false,
        effectiveTime: null,
        latestGasHourBoundary,
        reason: 'missing_effective_time'
      }
    }

    if (!(createDateNum > executeTimestamp)) {
      return {
        qualifies: false,
        effectiveTime,
        latestGasHourBoundary,
        reason: 'create_date_num_not_after_latest_execute_timestamp'
      }
    }

    if (!dayjs(effectiveTime).isBefore(latestGasHourBoundary)) {
      return {
        qualifies: false,
        effectiveTime,
        latestGasHourBoundary,
        reason: 'effective_time_not_before_latest_gas_hour_boundary'
      }
    }

    return {
      qualifies: true,
      effectiveTime,
      latestGasHourBoundary,
      reason: 'effective_time_before_latest_gas_hour_boundary'
    }
  }

  isModeZoneBaseInventoryIntradayRecalculationCandidate(modeZoneBaseInventory: any, latestIntraday: any) {
    return this.evaluateModeZoneBaseInventoryIntradayRecalculationCandidate(modeZoneBaseInventory, latestIntraday).qualifies
  }

  getDailyAdjustmentEffectiveTime(dailyAdjustment: any): Date | null {
    const gasDay = dailyAdjustment?.gas_day
    const time = typeof dailyAdjustment?.time === 'string' ? dailyAdjustment.time.trim() : ''

    if (!gasDay || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return null
    }

    const gasDayDate = dayjs(gasDay).tz('Asia/Bangkok')

    if (!gasDayDate.isValid()) {
      return null
    }

    const effectiveTime = dayjs.tz(`${gasDayDate.format('YYYY-MM-DD')} ${time}`, 'Asia/Bangkok')

    if (!effectiveTime.isValid()) {
      return null
    }

    return effectiveTime.toDate()
  }

  isDailyAdjustmentIntradayRecalculationCandidate(dailyAdjustment: any, latestIntraday: any) {
    const createDateNum = Number(dailyAdjustment?.create_date_num)
    const executeTimestamp = Number(latestIntraday?.execute_timestamp)
    const gasDay = latestIntraday?.gas_day
    const gasHour = Number(latestIntraday?.gas_hour)
    const effectiveTime = this.getDailyAdjustmentEffectiveTime(dailyAdjustment)

    if (!Number.isFinite(createDateNum) || !Number.isFinite(executeTimestamp) || !gasDay || !Number.isFinite(gasHour) || !effectiveTime) {
      return false
    }

    return createDateNum > executeTimestamp && dayjs(effectiveTime).isBefore(this.getThaiGasHourBoundary(gasDay, gasHour))
  }

  async findLatestOKExecuteIntradayForRecalculation() {
    return this.prisma.execute_intraday.findFirst({
      select: {
        id: true,
        request_number_id: true,
        execute_timestamp: true,
        gas_day: true,
        gas_hour: true
      },
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        gas_day: {
          not: null
        },
        gas_hour: {
          not: null
        },
        execute_timestamp: {
          not: null
        }
      },
      orderBy: [
        {gas_day: 'desc'},
        {gas_hour: 'desc'},
        {
          execute_timestamp: 'desc'
        }
      ]
    })
  }

  async findEarliestDailyAdjustmentIntradayRecalculationCandidate() {
    const latestIntraday = await this.findLatestOKExecuteIntradayForRecalculation()

    if (!latestIntraday) {
      return null
    }

    const latestGasHourBoundary = this.getThaiGasHourBoundary(latestIntraday.gas_day, latestIntraday.gas_hour)

    const dailyAdjustments = await this.prisma.daily_adjustment.findMany({
      select: {
        id: true,
        daily_code: true,
        gas_day: true,
        time: true,
        create_date: true,
        create_date_num: true
      },
      where: {
        daily_adjustment_status: {
          name: 'Approved'
        },
        create_date_num: {
          gt: latestIntraday.execute_timestamp
        },
        gas_day: {
          not: null
        },
        time: {
          not: null
        }
      },
      orderBy: [
        {
          create_date: 'asc'
        },
        {
          id: 'asc'
        }
      ]
    })

    const dailyAdjustmentCandidates = (dailyAdjustments ?? [])
      .map((dailyAdjustment) => {
        const effectiveTime = this.getDailyAdjustmentEffectiveTime(dailyAdjustment)
        const replayStart = effectiveTime ? this.getReplayStartGasDayAndHour(effectiveTime) : null
        const evaluation = this.isDailyAdjustmentIntradayRecalculationCandidate(dailyAdjustment, latestIntraday)

        return {
          dailyAdjustment,
          effectiveTime,
          replayStart,
          qualifies: evaluation
        }
      })
      .filter(({qualifies, effectiveTime, replayStart}) => !!effectiveTime && !!replayStart && qualifies)
      .sort((a, b) => {
        const effectiveDiff = dayjs(a.effectiveTime).valueOf() - dayjs(b.effectiveTime).valueOf()

        if (effectiveDiff !== 0) {
          return effectiveDiff
        }

        const createDateA = a.dailyAdjustment?.create_date ? dayjs(a.dailyAdjustment.create_date).valueOf() : Number.MAX_SAFE_INTEGER
        const createDateB = b.dailyAdjustment?.create_date ? dayjs(b.dailyAdjustment.create_date).valueOf() : Number.MAX_SAFE_INTEGER
        const createDateDiff = createDateA - createDateB

        if (createDateDiff !== 0) {
          return createDateDiff
        }

        return Number(a.dailyAdjustment?.id ?? 0) - Number(b.dailyAdjustment?.id ?? 0)
      })

    const candidate = dailyAdjustmentCandidates[0]
    const checkedDailyAdjustment = dailyAdjustments?.[0] ?? null
    const checkedDailyAdjustmentEffectiveTime = checkedDailyAdjustment ? this.getDailyAdjustmentEffectiveTime(checkedDailyAdjustment) : null
    const checkedDailyAdjustmentEvaluationReason = !checkedDailyAdjustment
      ? 'no_recent_daily_adjustment_found'
      : !checkedDailyAdjustmentEffectiveTime
        ? 'missing_effective_time'
        : !this.isDailyAdjustmentIntradayRecalculationCandidate(checkedDailyAdjustment, latestIntraday)
          ? 'effective_time_not_before_latest_gas_hour_boundary'
          : 'effective_time_before_latest_gas_hour_boundary'

    return {
      dailyAdjustment: candidate?.dailyAdjustment ?? null,
      dailyAdjustmentEffectiveTime: candidate?.effectiveTime ?? null,
      replayStartGasDay: candidate?.replayStart?.gasDay ?? null,
      replayStartGasHour: candidate?.replayStart?.gasHour ?? null,
      dailyAdjustmentEvaluationReason: candidate ? 'effective_time_before_latest_gas_hour_boundary' : null,
      checkedDailyAdjustment,
      checkedDailyAdjustmentEffectiveTime,
      checkedDailyAdjustmentEvaluationReason,
      latestIntraday,
      latestGasHourBoundary
    }
  }

  async findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate() {
    const latestIntraday = await this.findLatestOKExecuteIntradayForRecalculation()

    if (!latestIntraday) {
      return null
    }

    const latestGasHourBoundary = this.getThaiGasHourBoundary(latestIntraday.gas_day, latestIntraday.gas_hour)

    const modeZoneBaseInventories = await this.prisma.mode_zone_base_inventory.findMany({
      select: {
        id: true,
        start_date: true,
        create_date: true,
        create_date_num: true,
        zone: {
          select: {
            name: true
          }
        },
        mode: {
          select: {
            mode: true
          }
        }
      },
      where: {
        create_date_num: {
          gt: latestIntraday.execute_timestamp
        },
        start_date: {
          not: null
        }
      },
      orderBy: [
        {
          start_date: 'asc'
        },
        {
          create_date: 'asc'
        },
        {
          id: 'asc'
        }
      ]
    })
    const modeZoneBaseInventoryCandidates = (modeZoneBaseInventories ?? [])
      .map((modeZoneBaseInventory) => {
        const evaluation = this.evaluateModeZoneBaseInventoryIntradayRecalculationCandidate(modeZoneBaseInventory, latestIntraday)
        const replayStart = evaluation.effectiveTime ? this.getReplayStartGasDayAndHour(evaluation.effectiveTime) : null

        return {
          modeZoneBaseInventory,
          effectiveTime: evaluation.effectiveTime,
          replayStart,
          evaluation
        }
      })
      .filter(({evaluation, replayStart}) => !!replayStart && evaluation.qualifies)

    const candidate = modeZoneBaseInventoryCandidates[0]
    const checkedModeZoneBaseInventory = modeZoneBaseInventories?.[0] ?? null
    const checkedModeZoneBaseInventoryEvaluation = checkedModeZoneBaseInventory ? this.evaluateModeZoneBaseInventoryIntradayRecalculationCandidate(checkedModeZoneBaseInventory, latestIntraday) : null

    return {
      modeZoneBaseInventory: candidate?.modeZoneBaseInventory ?? null,
      modeZoneBaseInventoryEffectiveTime: candidate?.effectiveTime ?? null,
      replayStartGasDay: candidate?.replayStart?.gasDay ?? null,
      replayStartGasHour: candidate?.replayStart?.gasHour ?? null,
      modeZoneBaseInventoryEvaluationReason: candidate?.evaluation?.reason ?? null,
      checkedModeZoneBaseInventory,
      checkedModeZoneBaseInventoryEffectiveTime: checkedModeZoneBaseInventoryEvaluation?.effectiveTime ?? null,
      checkedModeZoneBaseInventoryEvaluationReason: checkedModeZoneBaseInventoryEvaluation?.reason ?? 'no_recent_mode_zone_base_inventory_found',
      latestIntraday,
      latestGasHourBoundary
    }
  }

  async findEarliestShipperReviewUpdatedAfter(afterDate: Date, beforeDate: Date) {
    return this.prisma.allocation_management.findFirst({
      select: {
        gas_day: true
      },
      where: {
        allocation_management_shipper_review: {
          some: {
            OR: [
              {
                create_date: {
                  gte: afterDate
                }
              },
              {
                update_date: {
                  gte: afterDate
                }
              }
            ]
          }
        },
        allocation_status: {
          name: {
            in: ['Accepted']
          }
        },
        gas_day: {
          lt: beforeDate
        }
      },
      orderBy: {
        gas_day: 'asc'
      }
    })
  }

  async findEarliestAdjDailyImbUpdatedAfter(afterDate: Date, beforeDate: Date) {
    return this.prisma.balancing_adjustment_daily_imbalance.findFirst({
      select: {
        gas_day: true
      },
      where: {
        OR: [
          {
            create_date: {
              gte: afterDate
            }
          },
          {
            update_date: {
              gte: afterDate
            }
          }
        ],
        gas_day: {
          lt: beforeDate
        }
      },
      orderBy: {
        gas_day: 'asc'
      }
    })
  }

  async findEarliestAdjAccImbUpdatedAfter(afterDate: Date, beforeDate: Date) {
    return this.prisma.balancing_adjust_accumulated_imbalance.findFirst({
      select: {
        gas_day: true
      },
      where: {
        OR: [
          {
            create_date: {
              gte: afterDate
            }
          },
          {
            update_date: {
              gte: afterDate
            }
          }
        ],
        gas_day: {
          lt: beforeDate
        }
      },
      orderBy: {
        gas_day: 'asc'
      }
    })
  }

  async findEarliestVCOUpdatedAfter(afterDate: Date, beforeDate: Date) {
    return this.prisma.vent_commissioning_other_gas.findFirst({
      select: {
        gas_day: true
      },
      where: {
        OR: [
          {
            create_date: {
              gte: afterDate
            }
          },
          {
            update_date: {
              gte: afterDate
            }
          }
        ],
        gas_day: {
          lt: beforeDate
        }
      },
      orderBy: {
        gas_day: 'asc'
      }
    })
  }

  async findEarliestDamParamUpdatedAfter(afterDate: Date, beforeDate: Date) {
    return this.prisma.system_parameter.findFirst({
      select: {
        start_date: true
      },
      where: {
        OR: [
          {
            create_date: {
              gte: afterDate
            }
          },
          {
            update_date: {
              gte: afterDate
            }
          }
        ],
        start_date: {
          lt: beforeDate
        },
        system_parameter: {
          name: {
            startsWith: 'Intraday'
          }
        }
      },
      orderBy: {
        start_date: 'asc'
      }
    })
  }

  async findLatestClosedBalancingReport() {
    return this.prisma.closed_balancing_report.findFirst({
      select: {
        date_balance: true
      },
      orderBy: {
        id: 'desc'
      }
    })
  }
}
