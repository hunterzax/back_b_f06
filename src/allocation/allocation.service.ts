import { forwardRef, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { PrismaService } from 'prisma/prisma.service'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as XLSX from 'xlsx-js-style'

import axios from 'axios'
import * as https from 'https'
import { MeteredMicroService } from 'src/grpc/metered-service.service'
import { ExportFilesService } from 'src/export-files/export-files.service'
import { MeteringManagementService } from 'src/metering-management/metering-management.service'
import { CapacityService } from 'src/capacity/capacity.service'
import { FileUploadService } from 'src/grpc/file-service.service'
import {
  getTodayEndAdd7,
  getTodayEndYYYYMMDDDfaultAdd7,
  getTodayNow,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayStartAdd7,
  getTodayStartYYYYMMDDDfaultAdd7,
  getTodayStartDDMMYYYYAdd7,
  getWeekRange,
  generateDatesInMonth,
  timeToMinutes
} from 'src/common/utils/date.util'
import {
  isMatch,
  extractAndGenerateDateArray,
  buildActiveDataForDates,
  validateContractAndShipper,
  validatePointByType,
  transformToShipperReportStructure,
  ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW,
  ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW_DUPLICATE,
  flatEvidenApiResponse,
  getNomValue,
  getAdjustedNomValue,
  createAdjustedNominationContext,
  getAdjustedNomValueFast,
  deduplicateAllocationModesByStartDate,
  getIntradayAllocationGasDays,
} from 'src/common/utils/allocation.util'
import * as nodemailer from 'nodemailer'
import { contract_code, group, Prisma } from '@prisma/client'
import { QualityEvaluationService } from 'src/quality-evaluation/quality-evaluation.service'
import { findMinMaxExeDate } from 'src/common/utils/balancing.util'
import { parseToNumber, parseToNumber2Decimal, parseToNumber3Decimal, parseToNumber6Decimal } from 'src/common/utils/number.util'
import { systemParameterPopulate, systemParameterWithRelations } from 'src/common/utils/tariff.util'
import { request } from 'http'
import { middleNotiInapp, middleNotiInappMenuArr } from 'src/common/utils/inapp.util'
import {
  allocationModeRecord,
  conceptPointPopulate,
  conceptPointWithRelations,
  meteringPointPopulate,
  meteringPointWithRelations,
  nominationPointPopulate,
  nominationPointWithRelations,
  nonTpaPointPopulate,
  nonTpaPointWithRelations,
  queryShipperNominationFilePopulate,
  queryShipperNominationFilePopulateForCal,
  queryShipperNominationFileWithRelations,
  queryShipperNominationFileWithRelationsForCal
} from '@type/prisma.type'
import { AllocationRepository } from './allocation.repository'
import { findHvFromEntryArea, getAdjustNom2 } from 'src/common/utils/nomination.util'
import { shareShipper, parseGasHoursFromRows } from 'src/common/utils/meter.util'
import { sleep } from 'src/common/utils/async.util'
import { join } from 'path'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Bangkok')

const headAllo = ['Zone', 'Area', 'POINT_ID', 'Unit', 'Entry_Exit']

@Injectable()
export class AllocationService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly meteredMicroService: MeteredMicroService,
    private readonly meteringManagementService: MeteringManagementService,
    private readonly fileUploadService: FileUploadService,
    private readonly qualityEvaluationService: QualityEvaluationService,
    private readonly repo: AllocationRepository,

    @Inject(forwardRef(() => ExportFilesService))
    private readonly exportFilesService: ExportFilesService
  ) { }

  async useReqs(req: any) {
    const ip = req.headers['x-forwarded-for'] || req.ip
    return {
      ip: ip,
      sub: req?.user?.sub,
      first_name: req?.user?.first_name,
      last_name: req?.user?.last_name,
      username: req?.user?.username,
      originalUrl: req?.originalUrl
    }
  }

  getEarliestIntradayReplayStart(
    replayStarts: any[]
  ) {
    return (
      replayStarts
        .filter(
          (replayStart) =>
            !!replayStart?.gasDay &&
            Number.isFinite(
              Number(replayStart?.gasHour)
            )
        )
        .sort((a, b) => {
          const gasDayDiff =
            dayjs
              .tz(a.gasDay, 'Asia/Bangkok')
              .startOf('day')
              .valueOf() -
            dayjs
              .tz(b.gasDay, 'Asia/Bangkok')
              .startOf('day')
              .valueOf()

          if (gasDayDiff !== 0) {
            return gasDayDiff
          }

          return (
            Number(a.gasHour) -
            Number(b.gasHour)
          )
        })[0] ?? null
    )
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
      module: 'ALLOCATION',
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

  async evidenApiAllocationEod(payload: any, callback?: (total_record: number) => void) {
    const { start_date, end_date, skip, limit } = payload

    // console.log('[INFO] evidenApiAllocationEod: payload =', payload)

    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })

    let data = JSON.stringify({
      start_date: start_date,
      end_date: end_date,
      skip: Number(skip),
      limit: Number(limit),
      contract: payload?.contract,
      shipper: payload?.shipper
    })

    let config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      url: `${process.env.IP_EVIDEN}/allocation_eod`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN
      },
      httpsAgent: agent,
      data: data
    }
    try {
      const resEviden = await axios.request(config)

      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden.data.map((resEvidenData: any) => {
            if (resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              if (resEvidenData?.total_record) {
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
          if (callback && resEviden?.data?.total_record) {
            callback(resEviden.data.total_record)
          }
          evidenData = resEviden?.data?.data
        }
      }
      // console.log('[INFO] evidenApiAllocationEod: evidenData.length =', evidenData?.length || 0)
      return evidenData
    } catch (error) {
      console.log('[ERROR] evidenApiAllocationEod: ', error)
      // return [];
      // เช็คว่ามี response หรือไม่
      if (error.response) {
        console.log('[ERROR] evidenApiAllocationEod: Eviden API Error Status:', error.response.status)
        console.log('[ERROR] evidenApiAllocationEod: Eviden API Error Data:', error.response.data)
      } else {
        console.log('[ERROR] evidenApiAllocationEod: Eviden API Error:', error.message)
      }

      // ไม่ให้แตก → return [] แทน
      return []
    }
  }

  async evidenApiAllocationIntraday(payload: any, callback?: (total_record: number) => void) {
    const { gas_day, start_hour, end_hour, skip, limit } = payload

    // console.log('[INFO] evidenApiAllocationIntraday: payload =', payload)

    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })

    let data = JSON.stringify({
      gas_day: gas_day,
      start_hour: Number(start_hour),
      end_hour: Number(end_hour),
      skip: Number(skip),
      limit: Number(limit)
    })

    let config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      url: `${process.env.IP_EVIDEN}/allocation_intraday`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN
      },
      httpsAgent: agent,
      data: data
    }

    try {
      const resEviden = await axios.request(config)

      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden.data.map((resEvidenData: any) => {
            if (resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              if (resEvidenData?.total_record) {
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
          if (callback && resEviden?.data?.total_record) {
            callback(resEviden.data.total_record)
          }
          evidenData = resEviden?.data?.data
        }
      }
      // console.log('[INFO] evidenApiAllocationIntraday: evidenData.length =', evidenData?.length || 0)

      return evidenData
    } catch (error) {
      // เช็คว่ามี response หรือไม่
      console.log('[ERROR] evidenApiAllocationIntraday: Eviden API Error:', error.message)

      // ไม่ให้แตก → return [] แทน
      return []
    }
  }

  async evidenApiAllocationContractPoint(payload: any, callback?: (total_record: number) => void) {
    const { start_date, end_date, skip, limit } = payload

    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })

    let data = JSON.stringify({
      start_date: start_date,
      end_date: end_date,
      skip: Number(skip),
      limit: Number(limit)
    })

    let config = {
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

    try {
      const resEviden = await axios.request(config)

      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden.data.map((resEvidenData: any) => {
            if (resEvidenData?.total_record) {
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
            if (resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              evidenData.push(...resEvidenData.data)
            }
          })
          if (callback && total_record) {
            callback(total_record)
          }
        } else {
          if (callback && resEviden?.data?.total_record) {
            callback(resEviden.data.total_record)
          }
          evidenData = resEviden?.data?.data
        }
      }

      return evidenData
    } catch (error) {
      console.log('[ERROR] evidenApiAllocationContractPoint: Eviden API Error:', error.message)

      // ไม่ให้แตก → return [] แทน
      return []
    }
  }

  async evidenApiAllocationContractPointIntraday(payload: any, callback?: (total_record: number) => void) {
    const { start_date, end_date, skip, limit } = payload

    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })

    let data = JSON.stringify({
      start_date: start_date,
      end_date: end_date,
      start_hour: 1,
      end_hour: 24,
      skip: Number(skip),
      limit: Number(limit)
    })

    let config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      url: `${process.env.IP_EVIDEN}/allocation_allocation_report_intraday_by_contract_point`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN
      },
      httpsAgent: agent,
      data: data
    }

    try {
      const resEviden = await axios.request(config)

      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden.data.map((resEvidenData: any) => {
            if (resEvidenData?.total_record) {
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
            if (resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              evidenData.push(...resEvidenData.data)
            }
          })
          if (callback && total_record) {
            callback(total_record)
          }
        } else {
          if (callback && resEviden?.data?.total_record) {
            callback(resEviden.data.total_record)
          }
          evidenData = resEviden?.data?.data
        }
      }

      return evidenData
    } catch (error) {
      console.log('[ERROR] evidenApiAllocationContractPointIntraday: Eviden API Error:', error.message)

      // ไม่ให้แตก → return [] แทน
      return []
    }
  }

  async evidenApiAllocationContractPointByNom(payload: any, callback?: (total_record: number) => void) {
    const { start_date, end_date, skip, limit, request_number } = payload

    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })

    let data = request_number ? JSON.stringify({
      start_date: start_date,
      end_date: end_date,
      skip: Number(skip),
      limit: Number(limit),
      request_number: Number(request_number)
    }) : JSON.stringify({
      start_date: start_date,
      end_date: end_date,
      skip: Number(skip),
      limit: Number(limit)
    })

    let config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      // 10.100.98.49
      url: `${process.env.IP_EVIDEN}/allocation_allocation_report_by_nomination_point`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN
      },
      httpsAgent: agent,
      data: data
    }

    try {
      const resEviden = await axios.request(config)

      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden.data.map((resEvidenData: any) => {
            if (resEvidenData?.total_record) {
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
            if (resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              evidenData.push(...resEvidenData.data)
            }
          })
          if (callback && total_record) {
            callback(total_record)
          }
        } else {
          if (callback && resEviden?.data?.total_record) {
            callback(resEviden.data.total_record)
          }
          evidenData = resEviden?.data?.data
        }
      }

      return evidenData
    } catch (error) {
      console.log('[ERROR] evidenApiAllocationContractPointByNom: Eviden API Error: 5', error.message)

      // ไม่ให้แตก → return [] แทน
      return []
    }
  }

  async evidenApiAllocationContractPointIntradayByNom(payload: any, callback?: (total_record: number) => void) {
    const { start_date, end_date, skip, limit } = payload

    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })

    let data = JSON.stringify({
      start_date: start_date,
      end_date: end_date,
      start_hour: 1,
      end_hour: 24,
      skip: Number(skip),
      //part 1 = 0, part 2 = 100, part 3 = 200, part 4 = 300, part 5 = 400, part 6 = 500, part 7 = 600, part 8 = 700
      limit: Number(limit)
    })

    let config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      url: `${process.env.IP_EVIDEN}/allocation_allocation_report_intraday_by_nomination_point`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN
      },
      httpsAgent: agent,
      data: data
    }

    try {
      const resEviden = await axios.request(config)

      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        if (Array.isArray(resEviden.data) && resEviden.data.length > 0) {
          let total_record = undefined
          resEviden.data.map((resEvidenData: any) => {
            if (resEvidenData?.total_record) {
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
            if (resEvidenData?.data && Array.isArray(resEvidenData.data) && resEvidenData.data.length > 0) {
              evidenData.push(...resEvidenData.data)
            }
          })
          if (callback && total_record) {
            callback(total_record)
          }
        } else {
          if (callback && resEviden?.data?.total_record) {
            callback(resEviden.data.total_record)
          }
          evidenData = resEviden?.data?.data
        }
      }

      return evidenData
    } catch (error) {
      // เช็คว่ามี response หรือไม่
      console.log('[ERROR] evidenApiAllocationContractPointIntradayByNom: Eviden API Error:', error.message)

      // ไม่ให้แตก → return [] แทน
      return []
    }
  }

  async allocationStatusMaster() {
    return this.prisma.allocation_status.findMany({
      orderBy: { id: 'asc' }
    })
  }

  async allocationManagement(payload: any, userId: any) {
    const { start_date, end_date, skip, limit } = payload

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const areaMaster = await this.prisma.area.findMany({
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
    const entryExitMaster = await this.prisma.entry_exit.findMany({
      where: {}
    })

    const meterMaster = await this.prisma.metering_point.findMany({
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
        nomination_point: true
      }
    })

    const nominationFile = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        query_shipper_nomination_status: {
          id: {
            in: [2, 5]
          }
        }
      },
      include: {
        contract_code: true,
        group: true,
        nomination_version: {
          where: {
            flag_use: true
          },
          include: {
            nomination_full_json: true,
            nomination_row_json: true
          }
        }
      }
    })

    const convertNomFile = nominationFile.map((e: any) => {
      // nomination_type_id 1 daily, 2 weekly
      e['gas_day'] = dayjs(e['gas_day']).format('YYYY-MM-DD')
      e['nomination_version'] = e['nomination_version'].map((nv: any) => {
        nv['nomination_full_json'] = nv['nomination_full_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        nv['nomination_row_json'] = nv['nomination_row_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        return { ...nv }
      })
      let fullData = e['nomination_version'][0]?.['nomination_full_json'][0]
      let rowData = e['nomination_version'][0]?.['nomination_row_json']
      delete e['nomination_version']
      return {
        ...e,
        fullData,
        rowData
      }
    })

    const evidenApiAllocationEod = await this.evidenApiAllocationEod({
      start_date,
      end_date,
      skip,
      limit
    })

    const start = start_date ? getTodayStartAdd7(start_date) : null
    const end = end_date ? getTodayEndAdd7(end_date) : null

    if (!start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    const dateArray: string[] = []

    let current = start

    while (current.isSameOrBefore(end)) {
      dateArray.push(current.format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }

    let intradayEviden = []

    // List รายการที่ต้องกลับมาแก้ mock ต้องปิด
    const evidenApiAllocationIntraday = await this.evidenApiAllocationIntraday({
      //test
      gas_day: '2025-02-28',
      start_hour: 1,
      end_hour: 24,
      skip: 0,
      limit: 100
    })
    for (let i = 0; i < dateArray.length; i++) {
      try {
        // List รายการที่ต้องกลับมาแก้ ของจริงต้องเปิด
        // const evidenApiAllocationIntraday = await this.evidenApiAllocationIntraday({
        //   gas_day: dateArray[i],
        //   start_hour: 1,
        //   end_hour: 24,
        //   skip: 0,
        //   limit: 100,
        // });
        intradayEviden.push({
          gasday: dateArray[i],
          data: evidenApiAllocationIntraday
        })
      } catch (error) {
        intradayEviden.push({
          gasday: dateArray[i],
          data: []
        })
      }
    }

    const nomExtPoint = convertNomFile.flatMap((e: any) => {
      const pointType1 = e['rowData'].filter((f: any) => {
        return f?.query_shipper_nomination_type_id === 1 && f?.data_temp['9'] === 'MMBTU/D'
      })
      const point = pointType1.map((pt: any) => {
        const { rowData, ...nE } = e
        return {
          ...nE,
          point: {
            ...pt
          }
        }
      })
      return point
    })
    const findGasday = nomExtPoint.filter((f: any) => {
      return (evidenApiAllocationEod || []).map((e: any) => e?.gas_day).includes(f?.gas_day)
    })
    const findGasdayAddEviden = findGasday.map((e: any) => {
      const eviden_data_gas_day = evidenApiAllocationEod.filter((f: any) => f?.gas_day === e?.gas_day)
      // headData

      let evidenUse = null
      let use = 0
      for (let iEviden = 0; iEviden < eviden_data_gas_day.length; iEviden++) {
        for (let iEvidenData = 0; iEvidenData < eviden_data_gas_day[iEviden]?.data.length; iEvidenData++) {
          if (eviden_data_gas_day[iEviden]?.data[iEvidenData]?.contract === e?.contract_code?.contract_code && eviden_data_gas_day[iEviden]?.data[iEvidenData]?.shipper === e?.group?.id_name) {
            const point = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data.find((f: any) => {
              return f?.['point'] === e['point']?.['data_temp']?.['3']
            })
            if (point) {
              if (point?.['area'] === e['point']?.['data_temp']?.['2'] && point?.['zone'] === e['point']?.['data_temp']?.['0'] && point?.['entry_exit'].toUpperCase() === e['point']?.['data_temp']?.['10'].toUpperCase()) {
                //
                if (use <= eviden_data_gas_day[iEviden]?.request_number) {
                  use = eviden_data_gas_day[iEviden]?.request_number
                  evidenUse = {
                    request_number: eviden_data_gas_day[iEviden]?.request_number,
                    execute_timestamp: eviden_data_gas_day[iEviden]?.execute_timestamp,
                    gas_day: eviden_data_gas_day[iEviden]?.gas_day,
                    data: point,
                    contract: eviden_data_gas_day[iEviden]?.data[iEvidenData]?.contract,
                    shipper: eviden_data_gas_day[iEviden]?.data[iEvidenData]?.shipper
                  }
                }
              }
            }
            // const zone = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["zone"]
            // const area = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["area"]
            // const entry_exit = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["entry_exit"]
            // * const customer_type = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["customer_type"]
            // * const point_type = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["point_type"]
            // * const relation_point = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["relation_point"]
            // * const relation_point_type = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["relation_point_type"]
            // * const previous_value = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["previous_value"]
            // * const value = eviden_data_gas_day[iEviden]?.data[iEvidenData]?.data["value"]

            // "data_temp": {
            //       "0": "WEST",
            //       "1": "Supply",
            //       "2": "Y",
            //       "3": "YDANA",
            //       "4": "",
            //       "5": "",
            //       "6": "Supply",
            //       "7": "",
            //       "8": "",
            //       "9": "MMBTU/D",
            //       "10": "Entry",
          }
        }
      }

      return {
        ...e,
        evidenUse
      }
    })

    const evidenUse = findGasdayAddEviden.filter((f: any) => !!f?.evidenUse)

    const ckEvidenUse = evidenUse.map((e: any) => {
      const nominationValue = e['nomination_type_id'] === 1 ? e['point']['data_temp']['38'] : e['point']['data_temp']['14'] // รอทำ weekly

      const systemAllocation = e['evidenUse']?.['data']?.['value']
      const previousAllocationTPAforReview = e['evidenUse']?.['data']?.['previous_value']

      // intradayEviden
      const intraFil =
        intradayEviden.find((f: any) => {
          return f?.gasday === e['gas_day']
        })?.data || []
      const intraFilValue = intraFil.filter((f: any) => {
        return f?.data?.filter((ff: any) => {
          return (
            ff?.contract === e['evidenUse']?.['contract'] &&
            ff?.shipper === e['evidenUse']?.['shipper'] &&
            ff?.data?.filter((fff: any) => {
              return fff?.point === e['evidenUse']?.['data']?.['point']
            })
          )
        })
      })
      // const intraDay = intraFilValue[intraFilValue.length - 1] || null;
      // const { data: dataIntraDay = null, ...nIntraDay }: any = intraDay;
      const { data: dataIntraDay = null, ...nIntraDay } = intraFilValue.at(-1) ?? {}
      const intradayFind = dataIntraDay?.find((f: any) => {
        return f?.contract === e['evidenUse']?.['contract'] && f?.shipper === e['evidenUse']?.['shipper']
      })
      const { data: dataIntradayFind, ...nIntradayFind } = intradayFind ?? {}
      const intradayData = dataIntradayFind?.find((f: any) => {
        return f?.point === e['evidenUse']?.['data']?.['point']
      })
      const intradayUse = {
        ...nIntraDay,
        ...nIntradayFind,
        data: intradayData
      }
      const intradaySystem = intradayUse?.data?.value || null //----

      // meteringValue
      const meteringValue = null //----
      const meterFil = meterMaster.filter((f: any) => {
        return f?.nomination_point?.nomination_point === e['evidenUse']?.['data']?.['point']
      })
      const meterName = meterFil?.map((mF: any) => mF?.metered_point_name)

      // areaMaster
      const area_obj = areaMaster.find((f: any) => {
        return f?.name === e['evidenUse']?.['data']?.['area']
      })
      const zone_obj = zoneMaster.find((f: any) => {
        return f?.name === e['evidenUse']?.['data']?.['zone']
      })
      const entry_exit_obj = entryExitMaster.find((f: any) => {
        return f?.name.toUpperCase() === e['evidenUse']?.['data']?.['entry_exit'].toUpperCase()
      })

      const checkDb = {
        gas_day_text: e['gas_day'], //
        shipper_name_text: e['evidenUse']?.['shipper'], //
        contract_code_text: e['evidenUse']?.['contract'], //
        point_text: e['evidenUse']?.['data']?.['point'], //
        entry_exit_text: e['evidenUse']?.['data']?.['entry_exit'], //
        area_text: e['evidenUse']?.['data']?.['area'],
        zone_text: e['evidenUse']?.['data']?.['zone']
      }

      delete e['fullData'] //full json

      return {
        ...e,
        intradayUse,
        nominationValue,
        systemAllocation,
        intradaySystem,
        previousAllocationTPAforReview,
        meteringValue,
        checkDb,
        area_obj,
        zone_obj,
        entry_exit_obj,
        meterName
      }
    })

    const newData = []
    let meterArr = []

    for (let i = 0; i < ckEvidenUse.length; i++) {
      const formateMeterG = ckEvidenUse[i]?.meterName.map((e: any) => ({
        meterPointId: e,
        gasDay: ckEvidenUse[i]?.gas_day
      }))
      meterArr = [...new Set([...meterArr, ...formateMeterG])]
    }
    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'get-last-once',
        mode: 'metering',
        meter_gas: meterArr
      })
    )
    const reply = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    let allocationMaster = await this.prisma.allocation_management.findMany({
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
          // orderBy: { id: "desc" }
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

    let newAllocation = []

    for (let i = 0; i < ckEvidenUse.length; i++) {
      const findAllocationMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === ckEvidenUse[i]?.checkDb?.gas_day_text &&
          f?.shipper_name_text === ckEvidenUse[i]?.checkDb?.shipper_name_text &&
          f?.contract_code_text === ckEvidenUse[i]?.checkDb?.contract_code_text &&
          f?.point_text === ckEvidenUse[i]?.checkDb?.point_text &&
          f?.entry_exit_text === ckEvidenUse[i]?.checkDb?.entry_exit_text &&
          f?.area_text === ckEvidenUse[i]?.checkDb?.area_text &&
          f?.zone_text === ckEvidenUse[i]?.checkDb?.zone_text
        )
      })

      if (!!!findAllocationMaster) {
        newAllocation.push({
          allocation_status_id: 1,
          shipper_name_text: ckEvidenUse[i]?.checkDb?.shipper_name_text,
          gas_day_text: ckEvidenUse[i]?.checkDb?.gas_day_text,
          contract_code_text: ckEvidenUse[i]?.checkDb?.contract_code_text,
          point_text: ckEvidenUse[i]?.checkDb?.point_text,
          entry_exit_text: ckEvidenUse[i]?.checkDb?.entry_exit_text,
          area_text: ckEvidenUse[i]?.checkDb?.area_text,
          zone_text: ckEvidenUse[i]?.checkDb?.zone_text,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(ckEvidenUse[i]?.checkDb?.gas_day_text + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId)
        })
      }
    }

    if (newAllocation.length > 0) {
      // create
      await this.prisma.allocation_management.createMany({
        data: newAllocation
      })

      allocationMaster = await this.prisma.allocation_management.findMany({
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
            // orderBy: { id: "desc" }
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

    for (let i = 0; i < ckEvidenUse.length; i++) {
      const formateMeterG = ckEvidenUse[i]?.meterName.map((e: any) => ({
        meterPointId: e,
        gasDay: ckEvidenUse[i]?.gas_day
      }))
      let matchMeter = 0
      for (let iM = 0; iM < formateMeterG.length; iM++) {
        const matchM = reply?.filter((f: any) => {
          return f?.gasDay === formateMeterG[iM]?.gasDay && f?.meterPointId === formateMeterG[iM]?.meterPointId
        })
        const matchValue = matchM?.map((nM: any) => nM?.value?.energy).reduce((total, num) => total + (num ?? 0), 0)
        matchMeter += matchValue
      }
      ckEvidenUse[i].meteringValue = matchMeter

      const findAllocationMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === ckEvidenUse[i]?.checkDb?.gas_day_text &&
          f?.shipper_name_text === ckEvidenUse[i]?.checkDb?.shipper_name_text &&
          f?.contract_code_text === ckEvidenUse[i]?.checkDb?.contract_code_text &&
          f?.point_text === ckEvidenUse[i]?.checkDb?.point_text &&
          f?.entry_exit_text === ckEvidenUse[i]?.checkDb?.entry_exit_text &&
          f?.area_text === ckEvidenUse[i]?.checkDb?.area_text &&
          f?.zone_text === ckEvidenUse[i]?.checkDb?.zone_text
        )
      })
      if (findAllocationMaster) {
        // ckEvidenUse[i].nom_id = ckEvidenUse[i]?.id;
        ckEvidenUse[i].id = findAllocationMaster?.id
        ckEvidenUse[i].allocation_status = findAllocationMaster?.allocation_status
        ckEvidenUse[i].review_code = findAllocationMaster?.review_code
        ckEvidenUse[i].allocation_management_comment = findAllocationMaster?.allocation_management_comment
        ckEvidenUse[i].allocation_management_shipper_review = findAllocationMaster?.allocation_management_shipper_review
        ckEvidenUse[i].point_text = findAllocationMaster?.point_text
        ckEvidenUse[i].shipper_id_text = findAllocationMaster?.shipper_name_text
        ckEvidenUse[i].contract_code_text = findAllocationMaster?.contract_code_text
        ckEvidenUse[i].gas_day_text = findAllocationMaster?.gas_day_text
        const finG = groupMaster.find((f: any) => {
          return f?.id_name === findAllocationMaster?.shipper_name_text
        })
        ckEvidenUse[i].shipper_name_text = finG?.name

        // group
        // id_name

        // name
      }

      const {
        nomination_code,
        create_date,
        update_date,
        create_date_num,
        update_date_num,
        create_by,
        update_by,
        nomination_type_id,
        query_shipper_nomination_status_id,
        contract_code_id,
        group_id,
        file_name,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        del_flag,
        group,
        contract_code,
        point,
        ...nckEvidenUse
      } = ckEvidenUse[i]

      newData.push(nckEvidenUse)
    }

    return newData
  }

  async allocationManagementNewReview(payload: any, userId: any) {
    const { start_date, end_date, skip, limit } = payload

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const areaMaster = await this.prisma.area.findMany({
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

    const entryExitMaster = await this.prisma.entry_exit.findMany({
      where: {}
    })

    const meterMaster = await this.prisma.metering_point.findMany({
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
        nomination_point: true
      }
    })

    // https://app.clickup.com/t/86eu48j4n
    const nominationFile = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        query_shipper_nomination_status: {
          id: {
            in: [2, 5]
          }
        }
      },
      include: {
        contract_code: true,
        group: true,
        nomination_version: {
          where: {
            flag_use: true
          },
          include: {
            nomination_full_json: true,
            nomination_row_json: true
          }
        }
      }
    })

    const convertNomFile = nominationFile.map((e: any) => {
      // nomination_type_id 1 daily, 2 weekly
      e['gas_day'] = dayjs(e['gas_day']).format('YYYY-MM-DD')
      e['nomination_version'] = e['nomination_version'].map((nv: any) => {
        nv['nomination_full_json'] = nv['nomination_full_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        nv['nomination_row_json'] = nv['nomination_row_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        return { ...nv }
      })
      let fullData = e['nomination_version'][0]?.['nomination_full_json'][0]
      let rowData = e['nomination_version'][0]?.['nomination_row_json']
      delete e['nomination_version']
      return {
        ...e,
        fullData,
        rowData
      }
    })
    // log('-----start');
    const evidenApiAllocationEod = await this.evidenApiAllocationEod({
      start_date,
      end_date,
      skip,
      limit
    })

    const start = start_date ? getTodayStartAdd7(start_date) : null
    const end = end_date ? getTodayEndAdd7(end_date) : null

    if (!start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    const dateArray: string[] = []

    let current = start

    while (current.isSameOrBefore(end)) {
      dateArray.push(current.format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }

    let intradayEviden = []
    // List รายการที่ต้องกลับมาแก้ mock ต้องปิด
    const evidenApiAllocationIntraday = await this.evidenApiAllocationIntraday({
      //test
      gas_day: '2025-02-28',
      start_hour: 1,
      end_hour: 24,
      skip: 0,
      limit: 100
    })

    for (let i = 0; i < dateArray.length; i++) {
      try {
        // List รายการที่ต้องกลับมาแก้ ของจริงต้องเปิด
        // const evidenApiAllocationIntraday = await this.evidenApiAllocationIntraday({
        //   gas_day: dateArray[i],
        //   start_hour: 1,
        //   end_hour: 24,
        //   skip: 0,
        //   limit: 100,
        // });
        intradayEviden.push({
          gasday: dateArray[i],
          data: evidenApiAllocationIntraday
        })
      } catch (error) {
        intradayEviden.push({
          gasday: dateArray[i],
          data: []
        })
      }
    }

    const newEOD = evidenApiAllocationEod.flatMap((fm: any) => {
      const { data: data1, ...fmD } = fm

      const nData = data1?.flatMap((dFm: any) => {
        const { data: data2, ...fmD2 } = dFm
        const nData2 = data2.map((dFm2: any) => {
          return {
            ...fmD,
            ...fmD2,
            ...dFm2
          }
        })

        return [...nData2]
      })

      return [...nData]
    })

    let allocationMaster = await this.prisma.allocation_management.findMany({
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
          // orderBy: { id: "desc" }
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

    let newAllocation = []

    const resultEodLast: any = Object.values(
      newEOD.reduce((acc, curr) => {
        const key = `${curr.gas_day}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )

    for (let i = 0; i < resultEodLast.length; i++) {
      const findAllocationMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === resultEodLast[i]?.gas_day &&
          f?.shipper_name_text === resultEodLast[i]?.shipper &&
          f?.contract_code_text === resultEodLast[i]?.contract &&
          f?.point_text === resultEodLast[i]?.point &&
          f?.entry_exit_text === resultEodLast[i]?.entry_exit &&
          f?.area_text === resultEodLast[i]?.area &&
          f?.zone_text === resultEodLast[i]?.zone
        )
      })
      // X3
      // contract: 2025-CNF-002
      // ENTRY
      // gas_day: 2025-02-21
      // point_text: LMPT2
      // shipper: NGP-S01-002
      // EAST

      if (!!!findAllocationMaster) {
        newAllocation.push({
          allocation_status_id: 1,
          shipper_name_text: resultEodLast[i]?.shipper,
          gas_day_text: resultEodLast[i]?.gas_day,
          contract_code_text: resultEodLast[i]?.contract,
          point_text: resultEodLast[i]?.point,
          entry_exit_text: resultEodLast[i]?.entry_exit,
          area_text: resultEodLast[i]?.area,
          zone_text: resultEodLast[i]?.zone,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(resultEodLast[i]?.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId)
        })
      }
    }

    if (newAllocation.length > 0) {
      // create
      await this.prisma.allocation_management.createMany({
        data: newAllocation
      })

      allocationMaster = await this.prisma.allocation_management.findMany({
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
            // orderBy: { id: "desc" }
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
    const nEodPorp = resultEodLast.map((eod: any) => {
      const alloc = convertNomFile?.find((f: any) => {
        return f?.gas_day === eod['gas_day'] && f?.group?.id_name === eod['shipper'] && f?.contract_code?.contract_code === eod['contract']
      })

      const pointN = alloc?.['rowData']?.find((f: any) => {
        return f?.query_shipper_nomination_type_id === 1 && f?.data_temp['9'] === 'MMBTU/D' && f?.area_text === eod['area'] && f?.zone_text === eod['zone']
      })

      const nominationValue = (!!alloc && !!pointN && (alloc?.nomination_type_id === 1 ? pointN['data_temp']['38'] : pointN['data_temp']['14'])) || null

      const systemAllocation = eod['value']
      const previousAllocationTPAforReview = eod['previous_value']

      const intraFil =
        intradayEviden.find((f: any) => {
          return f?.gasday === eod['gas_day']
        })?.data || []
      const intraFilValue = intraFil.filter((f: any) => {
        return f?.data?.filter((ff: any) => {
          return (
            ff?.contract === eod['contract'] &&
            ff?.shipper === eod['shipper'] &&
            ff?.data?.filter((fff: any) => {
              return fff?.point === eod['data']?.['point']
            })
          )
        })
      })
      const { data: dataIntraDay = null, ...nIntraDay } = intraFilValue.at(-1) ?? {}
      const intradayFind = dataIntraDay?.find((f: any) => {
        return f?.contract === eod['contract'] && f?.shipper === eod['shipper']
      })
      const { data: dataIntradayFind, ...nIntradayFind } = intradayFind ?? {}
      const intradayData = dataIntradayFind?.find((f: any) => {
        return f?.point === eod['point']
      })
      const intradayUse = {
        ...nIntraDay,
        ...nIntradayFind,
        data: intradayData
      }
      const intradaySystem = intradayUse?.data?.value || null //----

      const meterFil = meterMaster.filter((f: any) => {
        return f?.nomination_point?.nomination_point === eod['point']
      })
      const meterName = [...new Set([...meterFil?.map((mF: any) => mF?.metered_point_name)])]

      const area_obj = areaMaster.find((f: any) => {
        return f?.name === eod['area']
      })
      const zone_obj = zoneMaster.find((f: any) => {
        return f?.name === eod['zone']
      })
      const entry_exit_obj = entryExitMaster.find((f: any) => {
        return f?.name?.toUpperCase() === eod['entry_exit']?.toUpperCase()
      })

      return {
        ...eod,
        nominationValue,
        systemAllocation,
        previousAllocationTPAforReview,
        intradaySystem,
        // meteringValue,
        meterName,
        area_obj,
        zone_obj,
        entry_exit_obj
      }
    })

    let meterArr = []
    for (let i = 0; i < nEodPorp.length; i++) {
      if (nEodPorp[i]?.meterName.length > 0) {
        const formateMeterG = nEodPorp[i]?.meterName.map((e: any) =>
          JSON.stringify({
            meterPointId: e,
            gasDay: nEodPorp[i]?.gas_day
          })
        )
        meterArr = [...new Set([...meterArr, ...formateMeterG])]
      }
    }
    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'get-last-once',
        mode: 'metering',
        meter_gas: meterArr?.map((es: any) => JSON.parse(es)) || []
      })
    )

    const reply = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

    let nEodPorpRes = []
    for (let iMt = 0; iMt < nEodPorp.length; iMt++) {
      const formateMeterG = nEodPorp[iMt]['meterName'].map((e: any) => ({
        meterPointId: e,
        gasDay: nEodPorp[iMt]['gas_day']
      }))

      let matchMeter = 0

      for (let iM = 0; iM < formateMeterG.length; iM++) {
        const matchM = reply?.filter((f: any) => {
          return f?.gasDay === formateMeterG[iM]?.gasDay && f?.meterPointId === formateMeterG[iM]?.meterPointId
        })
        const matchValue = matchM?.map((nM: any) => nM?.value?.energy).reduce((total, num) => total + (num ?? 0), 0)
        matchMeter += matchValue
      }
      const meteringValue = matchMeter

      const aMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === nEodPorp[iMt]?.gas_day &&
          f?.shipper_name_text === nEodPorp[iMt]?.shipper &&
          f?.contract_code_text === nEodPorp[iMt]?.contract &&
          f?.point_text === nEodPorp[iMt]?.point &&
          f?.entry_exit_text === nEodPorp[iMt]?.entry_exit &&
          f?.area_text === nEodPorp[iMt]?.area &&
          f?.zone_text === nEodPorp[iMt]?.zone
        )
      })

      const finG = groupMaster.find((f: any) => {
        return f?.id_name === nEodPorp[iMt]?.shipper
      })

      nEodPorpRes.push({
        ...nEodPorp[iMt],
        id: aMaster?.['id'] || null,
        allocation_status: aMaster?.['allocation_status'] || null,
        review_code: aMaster?.['review_code'] || null,
        allocation_management_comment: aMaster?.['allocation_management_comment'] || [],
        allocation_management_shipper_review: aMaster?.['allocation_management_shipper_review'] || [],
        meteringValue,
        group: finG
        // aMaster,
      })
    }

    return nEodPorpRes
  }

  async allocationManagementNew(payload: any, userId: any) {
    const { start_date, end_date, skip, limit } = payload

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const startDate = getTodayStartAdd7(start_date == 'undefined' ? undefined : start_date)
    const endDate = getTodayEndAdd7(end_date == 'undefined' ? undefined : end_date)

    const executeEodList = await this.prisma.execute_eod.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        start_date_date: {
          lte: endDate.toDate()
        },
        end_date_date: {
          gte: startDate.toDate()
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
          gte: startDate.toDate(),
          lte: endDate.toDate()
        }
      }
    })

    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: startDate.toDate()
            }
          },
          {
            gas_day: {
              lte: endDate.toDate()
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })

    const entryExitMaster = await this.prisma.entry_exit.findMany({
      where: {}
    })

    const meterMaster = await this.prisma.metering_point.findMany({
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
        nomination_point: true
      }
    })

    // https://app.clickup.com/t/86eu49dch
    const nominationFile = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
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
          },
          {
            query_shipper_nomination_status: {
              id: {
                in: [2, 5]
              }
            }
          },
          {
            OR: [
              // Daily nominations: exact date match
              {
                nomination_type: {
                  id: 1
                },
                gas_day: {
                  gte: startDate.toDate(),
                  lte: endDate.toDate()
                }
              },
              // Weekly nominations: same week
              {
                nomination_type: {
                  id: 2
                },
                gas_day: {
                  gte: startDate.startOf('week').toDate(),
                  lte: endDate.endOf('week').toDate()
                }
              }
            ]
          }
        ]
      },
      include: {
        contract_code: true,
        reserve_balancing_gas_contract: true,
        group: true,
        nomination_version: {
          where: {
            flag_use: true
          },
          include: {
            nomination_full_json: true,
            nomination_row_json: true
          }
        }
      }
    })

    const convertNomFile = nominationFile.map((e: any) => {
      // nomination_type_id 1 daily, 2 weekly
      e['gas_day'] = dayjs(e['gas_day']).format('YYYY-MM-DD')
      e['nomination_version'] = e['nomination_version'].map((nv: any) => {
        nv['nomination_full_json'] = nv['nomination_full_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        nv['nomination_row_json'] = nv['nomination_row_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        return { ...nv }
      })
      let fullData = e['nomination_version'][0]?.['nomination_full_json'][0]
      let rowData = e['nomination_version'][0]?.['nomination_row_json']
      delete e['nomination_version']
      return {
        ...e,
        fullData,
        rowData
      }
    })
    // console.log('[DEBUG] allocationManagementNew: ---s--');
    const { minDate, maxDate } = await findMinMaxExeDate(this.prisma, start_date, end_date)

    // console.log('[DEBUG] allocationManagementNew:eviden minDate : ', minDate);
    // console.log('[DEBUG] allocationManagementNew:eviden maxDate : ', maxDate);
    let totalRecord: number | undefined = undefined
    minDate &&
      (await this.evidenApiAllocationEod(
        {
          start_date: minDate.format('YYYY-MM-DD'),
          end_date: maxDate.format('YYYY-MM-DD'),
          skip: 0,
          limit: 1
        },
        (total_record: number) => {
          totalRecord = total_record
        }
      ))
    const evidenApiAllocationEod =
      (minDate &&
        (await this.evidenApiAllocationEod({
          start_date: minDate.format('YYYY-MM-DD'),
          end_date: maxDate.format('YYYY-MM-DD'),
          skip: totalRecord ? 0 : skip,
          limit: totalRecord ? totalRecord : limit
        }))) ||
      []

    const matchWithExecuteList = evidenApiAllocationEod.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeEodList?.some((executeData: any) => {
        const executeStart = getTodayNowAdd7(executeData?.start_date_date)
        const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
        return executeData.request_number_id == item.request_number && executeStart.isSameOrBefore(itemGasDay, 'day') && executeEnd.isSameOrAfter(itemGasDay, 'day')
      })
    })

    const publishData = matchWithExecuteList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData.execute_timestamp && unpublishData?.gas_day_text === evidenData.gas_day
      })
    })

    // Get the latest execute_timestamp for each unique combination of gas_day
    const latestPublishData = publishData.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, [])

    // console.log('[DEBUG] allocationManagementNew: ---e--');
    const dateArray = extractAndGenerateDateArray(latestPublishData)

    // console.log('[DEBUG] allocationManagementNew: dateArray --->', dateArray)

    // Build active data for all dates
    const activeData = await buildActiveDataForDates(dateArray, this.prisma)

    // Filter based on active records
    const newEOD = latestPublishData.flatMap((fm: any) => {
      const { data: data1, ...fmD } = fm

      // Find active data for this gas_day
      const activeDataForDate = activeData.find((ad) => ad.date === fm.gas_day)

      const nData = data1?.flatMap((dFm: any) => {
        const { data: data2, ...fmD2 } = dFm

        // Validate contract and shipper existence
        const contractValidation = validateContractAndShipper(dFm, activeDataForDate)
        // if (!contractValidation.isValid) {
        //   return [];
        // }

        const nData2 = data2
          // .filter((dFm2: any) => {
          //   return validatePointByType(dFm2, activeDataForDate);
          // })
          .map((dFm2: any) => {
            validatePointByType(dFm2, activeDataForDate)
            return {
              ...fmD,
              ...fmD2,
              ...dFm2,
              group: contractValidation.shipperObj
            }
          })

        return [...nData2]
      })

      return [...nData]
    })

    // Generate dateArrayForIntraday based on actual gas_day values from newEOD
    const dateArrayForIntraday: string[] = []

    if (newEOD && newEOD.length > 0) {
      // Extract all unique gas_day values and convert to dayjs objects for proper date comparison
      const gasDays = [...new Set(newEOD.map((item: any) => item.gas_day))]

      if (gasDays.length > 0) {
        // Convert to dayjs objects for proper date comparison
        const gasDayObjects = gasDays.map((date) => getTodayStartAdd7(date))

        // Find min and max gas_day using dayjs comparison
        const minGasDayObj = gasDayObjects.reduce((min, current) => (current.isBefore(min) ? current : min))
        const maxGasDayObj = gasDayObjects.reduce((max, current) => (current.isAfter(max) ? current : max))

        if (minGasDayObj.isValid() && maxGasDayObj.isValid()) {
          let current = minGasDayObj

          while (current.isSameOrBefore(maxGasDayObj)) {
            dateArrayForIntraday.push(current.format('YYYY-MM-DD'))
            current = current.add(1, 'day')
          }
        }
      }
    }

    // let totalRecord: number | undefined = undefined;
    // minDate && await this.evidenApiAllocationEod({
    //   start_date: minDate.format("YYYY-MM-DD"),
    //   end_date: maxDate.format("YYYY-MM-DD"),
    //   skip: 0,
    //   limit: 1,
    // }, (total_record: number) => {
    //   totalRecord = total_record;
    // });
    // const evidenApiAllocationEod = minDate && await this.evidenApiAllocationEod({
    //   start_date: minDate.format("YYYY-MM-DD"),
    //   end_date: maxDate.format("YYYY-MM-DD"),
    //   skip: totalRecord ? 0 : skip,
    //   limit: totalRecord ? totalRecord : limit,
    // }) || [];

    let intradayEviden = (
      await Promise.all(
        dateArrayForIntraday.map(async (date) => {
          try {
            let intraDayTotalRecord: number | undefined = undefined
            await this.evidenApiAllocationIntraday(
              {
                gas_day: date,
                start_hour: 1,
                end_hour: 24,
                skip: 0,
                limit: 1
              },
              (total_record: number) => {
                intraDayTotalRecord = total_record
              }
            )
            const evidenApiAllocationIntraday = await this.evidenApiAllocationIntraday({
              gas_day: date,
              start_hour: 1,
              end_hour: 24,
              skip: intraDayTotalRecord ? 0 : skip,
              limit: intraDayTotalRecord ? intraDayTotalRecord : limit
            })
            return evidenApiAllocationIntraday
          } catch (error) {
            return []
          }
        })
      )
    ).flat()

    const matchWithExecuteIntradayList = intradayEviden.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeData.gas_hour == item.gas_hour && executeGasDay.isSame(itemGasDay, 'day')
      })
    })

    const publishIntradayData = matchWithExecuteIntradayList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData.execute_timestamp && unpublishData?.gas_day_text === evidenData.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
      })
    })

    // Get the latest execute_timestamp for each unique combination of gas_day
    const latestPublishIntradayData = publishIntradayData.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.gas_hour > acc[existingIndex].gas_hour) {
        acc[existingIndex] = current
      } else if (current.gas_hour == acc[existingIndex].gas_hour && current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, [])

    let allocationMaster = await this.prisma.allocation_management.findMany({
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
          // orderBy: { id: "desc" }
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

    let newAllocation = []
    const resultEodLast: any = Object.values(
      newEOD.reduce((acc, curr) => {
        const key = `${curr.gas_day}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )

    for (let i = 0; i < resultEodLast.length; i++) {
      const findAllocationMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === resultEodLast[i]?.gas_day &&
          f?.shipper_name_text === resultEodLast[i]?.shipper &&
          f?.contract_code_text === resultEodLast[i]?.contract &&
          f?.point_text === resultEodLast[i]?.point &&
          f?.entry_exit_text === resultEodLast[i]?.entry_exit &&
          f?.area_text === resultEodLast[i]?.area &&
          f?.zone_text === resultEodLast[i]?.zone
        )
      })
      // X3
      // contract: 2025-CNF-002
      // ENTRY
      // gas_day: 2025-02-21
      // point_text: LMPT2
      // shipper: NGP-S01-002
      // EAST

      if (!!!findAllocationMaster) {
        newAllocation.push({
          allocation_status_id: 1,
          shipper_name_text: resultEodLast[i]?.shipper,
          gas_day_text: resultEodLast[i]?.gas_day,
          contract_code_text: resultEodLast[i]?.contract,
          point_text: resultEodLast[i]?.point,
          entry_exit_text: resultEodLast[i]?.entry_exit,
          area_text: resultEodLast[i]?.area,
          zone_text: resultEodLast[i]?.zone,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(resultEodLast[i]?.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId)
        })
      }
    }

    if (newAllocation.length > 0) {
      // create
      await this.prisma.allocation_management.createMany({
        data: newAllocation
      })

      allocationMaster = await this.prisma.allocation_management.findMany({
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
            // orderBy: { id: "desc" }
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

    const nEodPorp = resultEodLast.map((eod: any) => {
      const alloc = convertNomFile?.find((f: any) => {
        return f?.gas_day === eod['gas_day'] && f?.group?.id_name === eod['shipper'] && f?.contract_code?.contract_code === eod['contract']
      })

      const pointN = alloc?.['rowData']?.find((f: any) => {
        return f?.query_shipper_nomination_type_id === 1 && f?.data_temp['3'] === eod['point'] && f?.data_temp['9'] === 'MMBTU/D' && f?.area_text === eod['area'] && f?.zone_text === eod['zone']
      })

      let nominationValue = null
      if (alloc?.nomination_type_id && pointN) {
        if (alloc?.nomination_type_id === 1) {
          nominationValue = pointN['data_temp']['38']
        } else {
          const dayOfWeek = Number(getTodayStartAdd7(eod['gas_day']).format('d')) // The day of the week, with Sunday as 0
          nominationValue = pointN['data_temp'][`${14 + dayOfWeek}`]
        }
      }

      const systemAllocation = eod['value']
      const previousAllocationTPAforReview = eod['previous_value']

      const intradayDataByGasDay = latestPublishIntradayData.find((f: any) => {
        return (f?.gasday ?? f.gas_day) === eod['gas_day']
      })
      const { data: intraFil = [], ...intradayByGasDay } = intradayDataByGasDay ?? {}

      const intraFilValue = intraFil
        .filter((f: any) => f?.data?.some((ff: any) => ff?.point === eod?.['point']) && f?.contract === eod['contract'] && f?.shipper === eod['shipper'])
        .map((f: any) => {
          const data =
            f?.data?.find((ff: any) => {
              return ff?.point === eod?.['point'] && ff?.point_type === eod?.point_type && ff?.area === eod?.area && ff?.zone === eod?.zone && ff?.entry_exit === eod?.entry_exit
            }) ?? []
          return {
            ...f,
            data: data
          }
        })
      const { data: dataIntraDay = null, ...nIntraDay } = intraFilValue.at(-1) ?? {}

      const intradayUse = {
        ...nIntraDay,
        ...intradayByGasDay,
        data: dataIntraDay
      }
      const intradaySystem = intradayUse?.data?.value

      // Find active data for this gas_day
      const activeDataForDate = activeData.find((ad) => ad.date === eod['gas_day'])
      let meterName: string[] = []
      if (activeDataForDate?.activeMeteringPoints && isMatch(eod['point_type'], 'NOM')) {
        meterName = activeDataForDate.activeMeteringPoints?.filter((meteringPoint: any) => isMatch(meteringPoint.nomination_point?.nomination_point, eod['point'])).map((meteringPoint: any) => meteringPoint.metered_point_name)
      } else if (activeDataForDate?.activeConceptPoints && isMatch(eod['point_type'], 'CONCEPT')) {
        let conceptPointName = eod['point']
        if (isMatch(eod['point'], 'East_to_BVW10')) {
          conceptPointName = 'BVW10 East'
        } else if (isMatch(eod['point'], 'West_to_BVW10')) {
          conceptPointName = 'BVW10 West'
        } else if (isMatch(eod['point'], 'East_to_RA6')) {
          conceptPointName = 'RA6 EAST'
        } else if (isMatch(eod['point'], 'West_to_RA6')) {
          conceptPointName = 'RA6 WEST'
        }
        meterName = activeDataForDate.activeConceptPoints
          ?.filter((conceptPoint: any) => {
            return conceptPoint.type_concept_point?.name?.toUpperCase()?.includes('METER') && (isMatch(conceptPoint.concept_point, eod['point']) || isMatch(conceptPoint.concept_point, conceptPointName))
          })
          .map((conceptPoint: any) => conceptPoint.concept_point)
      } else if (activeDataForDate?.activeNonTpaPoints && isMatch(eod['point_type'], 'NONTPA')) {
        meterName = activeDataForDate.activeMeteringPoints?.filter((meteringPoint) => isMatch(meteringPoint.non_tpa_point?.non_tpa_point_name, eod['point'])).map((meteringPoint: any) => meteringPoint.metered_point_name)
      } else {
        const meterFil = meterMaster.filter((f: any) => {
          return f?.nomination_point?.nomination_point === eod['point']
        })
        meterName = [...new Set([...meterFil?.map((mF: any) => mF?.metered_point_name)])]
      }

      const entry_exit_obj = entryExitMaster.find((f: any) => {
        return isMatch(f?.name, eod['entry_exit'])
      })

      return {
        ...eod,
        nominationValue,
        systemAllocation,
        previousAllocationTPAforReview,
        intradaySystem,
        // meteringValue,
        meterName,
        entry_exit_obj
      }
    })
    let meterArr = []
    for (let i = 0; i < nEodPorp.length; i++) {
      if (nEodPorp[i]?.meterName.length > 0) {
        const formateMeterG = nEodPorp[i]?.meterName.map((e: any) =>
          JSON.stringify({
            meterPointId: e,
            gasDay: nEodPorp[i]?.gas_day
          })
        )
        meterArr = [...new Set([...meterArr, ...formateMeterG])]
      }
    }
    // const meteredMicroData = await this.meteredMicroService.sendMessage(
    //   JSON.stringify({
    //     case: 'get-last-once',
    //     mode: 'metering',
    //     meter_gas: meterArr?.map((es: any) => JSON.parse(es)) || [],
    //   }),
    //   {
    //     activeData,
    //     prisma: this.prisma
    //   }
    // );

    // let reply =
    //   (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) ||
    //   null;
    // if (!Array.isArray(reply)) {
    //   reply = null
    // }
    // console.log('[DEBUG] allocationManagementNew: reply : ', reply);

    const meterUse = await this.meteringManagementService.getDataLogic(
      {
        share: 'off',
        start_date: start_date,
        end_date: end_date
      },
      true
    )
    // console.log('[DEBUG] allocationManagementNew: ---- meterUse : ', meterUse.map((a) => a.meteringPointId));
    let nEodPorpRes = []
    for (let iMt = 0; iMt < nEodPorp.length; iMt++) {
      const formateMeterG = nEodPorp[iMt]['meterName'].map((e: any) => ({
        meterPointId: e,
        gasDay: nEodPorp[iMt]['gas_day']
      }))

      let matchMeter = 0
      // console.log('[DEBUG] allocationManagementNew: -formateMeterG : ', formateMeterG);
      for (let iM = 0; iM < formateMeterG.length; iM++) {
        // LMPT1
        const matchM = meterUse?.filter((f: any) => {
          return f?.gasDay === formateMeterG[iM]?.gasDay && f?.meteringPointId === formateMeterG[iM]?.meterPointId
        })
        // console.log('[DEBUG] allocationManagementNew: matchM : ', matchM);
        const matchValue = matchM
          // ?.map((nM: any) => parseToNumber(nM?.value?.energy))
          ?.map((nM: any) => parseToNumber(nM?.energy))
          .reduce((total, num) => total + (num ?? 0), 0)
        matchMeter += matchValue

        // if(
        //   formateMeterG[iM]?.meterPointId === "LMPT1"
        //    ||
        //   formateMeterG[iM]?.meterPointId === "LMPT1_1" ||
        //   formateMeterG[iM]?.meterPointId === "LMPT1_2"

        // ){
        // console.log('[DEBUG] allocationManagementNew: * formateMeterG[iM]?.gasDay : ', formateMeterG[iM]?.gasDay);
        // console.log('[DEBUG] allocationManagementNew: * formateMeterG[iM]?.meterPointId : ', formateMeterG[iM]?.meterPointId);
        // console.log('[DEBUG] allocationManagementNew: matchValue : ', matchValue);
        // }
      }
      // console.log('[DEBUG] allocationManagementNew: matchMeter : ', matchMeter);
      // console.log('[DEBUG] allocationManagementNew: - - - - - -');
      const meteringValue = matchMeter

      const aMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === nEodPorp[iMt]?.gas_day &&
          f?.shipper_name_text === nEodPorp[iMt]?.shipper &&
          f?.contract_code_text === nEodPorp[iMt]?.contract &&
          f?.point_text === nEodPorp[iMt]?.point &&
          f?.entry_exit_text === nEodPorp[iMt]?.entry_exit &&
          f?.area_text === nEodPorp[iMt]?.area &&
          f?.zone_text === nEodPorp[iMt]?.zone
        )
      })

      nEodPorpRes.push({
        ...nEodPorp[iMt],
        id: aMaster?.['id'] || null,
        allocation_status: aMaster?.['allocation_status'] || null,
        review_code: aMaster?.['review_code'] || null,
        allocation_management_comment: aMaster?.['allocation_management_comment'] || [],
        allocation_management_shipper_review: aMaster?.['allocation_management_shipper_review'] || [],
        meteringValue
        // aMaster,
      })
    }
    return nEodPorpRes
  }

  async allcationOnceId(payload: any, userId: any) {
    const { idAr, ...nPayload } = payload
    const allocationManagement = await this.allocationManagement2(nPayload, userId)

    return allocationManagement
    // const fil = allocationManagement.filter((f: any) => {
    //   return idAr.includes(f?.id);
    // });

    // return fil;
  }
  async allcationOnceId_(payload: any, userId: any, id_?: any) {
    if (id_) {
      const { idAr, ...nPayload } = payload
      const allocationManagement = await this.allocationManagement2(nPayload, userId)
      const fil = allocationManagement.filter((f: any) => {
        return id_.includes(f?.id)
      })

      return fil
    } else {
      const { idAr, ...nPayload } = payload
      const allocationManagement = await this.allocationManagement2(nPayload, userId)

      return allocationManagement
      // const fil = allocationManagement.filter((f: any) => {
      //   return idAr.includes(f?.id);
      // });

      // return fil;
    }
  }

  async shipperAllocationReview(id: any, payload: any, userId: any) {
    const { shipper_allocation_review, comment, row_data } = payload
    const idN = Number(id)

    const allocation = await this.prisma.allocation_management.findFirst({
      where: {
        id: Number(idN)
      }
    })

    const nowAt = getTodayNowAdd7()

    const toDayReviewCodeStartWith = `${nowAt.tz('Asia/Bangkok').format('YYYYMMDD')}-ALP-`

    if (allocation?.allocation_status_id === 1 && !!!allocation?.review_code) {
      // const allocationCount = await this.prisma.allocation_management.count({
      //   where: {
      //     review_code: {
      //       startsWith: toDayReviewCodeStartWith,
      //     },
      //     // create_date: {
      //     //   gte: todayStart,  // มากกว่าหรือเท่ากับเวลาเริ่มต้นของวันนี้
      //     //   lte: todayEnd,    // น้อยกว่าหรือเท่ากับเวลาสิ้นสุดของวันนี้
      //     // },
      //   },
      // });
      const rows = await this.prisma.allocation_management.groupBy({
        by: ['review_code'],
        where: {
          review_code: {
            startsWith: toDayReviewCodeStartWith,
            not: null
          }
        }
      })

      const allocationCount = rows.length

      const reviewCodeNum = `${toDayReviewCodeStartWith}${(allocationCount > 0 ? allocationCount + 1 : 1).toString().padStart(4, '0')}`
      const update = await this.prisma.allocation_management.updateMany({
        where: {
          id: Number(idN)
        },
        data: {
          review_code: reviewCodeNum,
          allocation_status_id: 2
        }
      })
      if (!!comment) {
        await this.prisma.allocation_management_comment.create({
          data: {
            allocation_status_id: Number(2),
            allocation_management_id: Number(idN),
            remark: comment,
            create_date: nowAt.toDate(),
            create_date_num: nowAt.unix(),
            create_by: Number(userId)
          }
        })
      }

      const shipperAllocationReviewCreate = await this.prisma.allocation_management_shipper_review.create({
        data: {
          allocation_status_id: 2,
          allocation_management_id: Number(idN),
          shipper_allocation_review: shipper_allocation_review,
          create_date: nowAt.toDate(),
          create_date_num: nowAt.unix(),
          create_by: Number(userId)
        },
        include: {
          allocation_status: true,
          allocation_management: true
        }
      })

      const allocationFn = await this.prisma.allocation_management.findFirst({
        where: {
          id: Number(idN)
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
            // orderBy: { id: "desc" }
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

      return allocationFn
    } else {
      const update = await this.prisma.allocation_management.updateMany({
        where: {
          id: Number(idN)
        },
        data: {
          allocation_status_id: 2
        }
      })
      if (!!comment) {
        await this.prisma.allocation_management_comment.create({
          data: {
            allocation_status_id: 2,
            allocation_management_id: Number(idN),
            remark: comment,
            create_date: nowAt.toDate(),
            create_date_num: nowAt.unix(),
            create_by: Number(userId)
          }
        })
      }

      const shipperAllocationReviewCreate = await this.prisma.allocation_management_shipper_review.create({
        data: {
          allocation_status_id: 2,
          allocation_management_id: Number(idN),
          shipper_allocation_review: shipper_allocation_review,
          create_date: nowAt.toDate(),
          create_date_num: nowAt.unix(),
          create_by: Number(userId)
        },
        include: {
          allocation_status: true,
          allocation_management: true
        }
      })

      const allocationFn = await this.prisma.allocation_management.findFirst({
        where: {
          id: Number(idN)
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
            // orderBy: { id: "desc" }
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

      return allocationFn
    }

    // return payload;
  }

  async createByOnce(userId: any) {
    const user = await this.prisma.account.findFirst({
      where: {
        id: Number(userId)
      },
      include: {}
    })

    const nowAt = getTodayNowAdd7()

    return {
      create_date: nowAt.toDate(),
      create_date_num: nowAt.unix(),
      create_by: user
    }
  }

  async allocationManageChangeStatus(payload: any, userId: any) {
    const { status, comment, rowArray } = payload
    const nowAt = getTodayNowAdd7()

    for (let i = 0; i < rowArray.length; i++) {
      const now = dayjs()
      const update = await this.prisma.allocation_management.updateMany({
        where: {
          id: Number(rowArray[i]?.id ?? -1)
        },
        data: {
          allocation_status_id: Number(status),
          update_date: now.toDate(),
          update_date_num: now.unix()
        }
      })

      // execute ทาคุดึงจาก create_date และ update_date ของ allocation_management_shipper_review เลยต้องทำให้มี allocation_management_shipper_review อย่างหนึ่งตัวที่มี update_date ใหม่
      try {
        const findShipperReview = await this.prisma.allocation_management_shipper_review.findFirst({
          where: {
            allocation_management_id: Number(rowArray[i]?.id),
            allocation_status_id: 2
          }
        })

        if (findShipperReview) {
          await this.prisma.allocation_management_shipper_review.updateMany({
            where: {
              id: findShipperReview?.id ?? -1
            },
            data: {
              update_date: now.toDate(),
              update_date_num: now.unix()
            }
          })
        }
      } catch (error) { }

      if (!!comment) {
        await this.prisma.allocation_management_comment.create({
          data: {
            allocation_status_id: Number(status),
            allocation_management_id: Number(rowArray[i]?.id),
            remark: comment,
            create_date: nowAt.toDate(),
            create_date_num: nowAt.unix(),
            create_by: Number(userId),
            reasons: true
          }
        })
      }
    }

    return true
  }

  async allocationManageChangeStatusValidate(payload: any, userId: any) {
    const { status, rowArray } = payload
    const nowAt = getTodayNowAdd7()

    //check only when Accepted
    if (status == 3) {
      const checkSE = await this.prisma.system_parameter.findFirst({
        where: {
          system_parameter_id: 2,
          start_date: {
            lte: nowAt.toDate()
          }
        },
        orderBy: {
          start_date: 'desc'
        }
      })

      const sysT = (!!checkSE?.value && Number(checkSE?.value)) || 0
      // (ABS(Shipper review - Original system allocation) / Original system allocation)*100 > Maximum tolerance %
      let logErr = []
      for (let i = 0; i < rowArray.length; i++) {
        if (rowArray[i]?.allocation_management_shipper_review && Array.isArray(rowArray[i].allocation_management_shipper_review)) {
          rowArray[i].allocation_management_shipper_review.map((review: any) => {
            const reviewValue = parseToNumber(review.shipper_allocation_review)
            if (reviewValue || (reviewValue == 0 && rowArray[i]?.systemAllocation)) {
              const diffPercentage = (Math.abs(reviewValue - rowArray[i]?.systemAllocation) / rowArray[i]?.systemAllocation) * 100
              if (diffPercentage > sysT) {
                logErr.push(`Shipper allocation review ${dayjs(rowArray[i]?.gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY')} - ${rowArray[i]?.point} exceeds allocation tolerance`)
              }
            }
          })
        } else {
          const sR = (!!rowArray[i]?.allocation_management_shipper_review && Number(rowArray[i]?.allocation_management_shipper_review)) || 0
          const calc = Math.abs((sR - rowArray[i]?.systemAllocation) / rowArray[i]?.systemAllocation) * 100 > sysT
          if (!calc) {
            logErr.push(
              `Shipper allocation review ${dayjs(rowArray[i]?.gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY')} - ${rowArray[i]?.point} exceeds allocation tolerance`
              // `Shipper allocation review ${dayjs(rowArray[i]?.gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY')} - ${rowArray[i]?.checkDb?.point_text} exceeds allocation tolerance`,
            )
          }
        }
      }
      if (logErr.length > 0) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `${logErr.map((e: any) => e).join('<br/>')}`
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    return true
  }

  async evidenApiCenter(payload: any, url: any) {
    // const { start_date, end_date, skip, limit } = payload;

    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })

    let data = JSON.stringify(payload)

    let config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      url: `${process.env.IP_EVIDEN}/${url}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN
      },
      httpsAgent: agent,
      data: data
    }

    try {
      const resEviden = await axios.request(config)

      let evidenData = []
      if (resEviden?.status === 200 && !!resEviden?.data) {
        evidenData = resEviden?.data
      }

      return evidenData
    } catch (error) {
      // เช็คว่ามี response หรือไม่
      console.log('[ERROR] evidenApiCenter: Eviden API Error:', error.message)

      // ไม่ให้แตก → return [] แทน
      return []
    }
  }

  async evidenApiCenterPost(payload: any, url: any) {
    // console.log('[DEBUG]: evidenApiCenterPost: payload:', JSON.stringify(payload, null, 2));
    const agent = new https.Agent({
      rejectUnauthorized: false // บอก axios ว่า ไม่ต้อง verify SSL
    })

    let data = JSON.stringify(payload)

    let config = {
      method: `${process.env.METHOD_EVIDEN}`,
      maxBodyLength: Infinity,
      url: `${process.env.IP_EVIDEN}/${url}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.TOKEN_EVIDEN
      },
      httpsAgent: agent,
      data: data
    }
    // console.log('[DEBUG] evidenApiCenterPost: send request')
    const resEviden = await axios.request(config)
    // console.log(`[DEBUG] evidenApiCenterPost: resEviden (${resEviden?.status}): ${JSON.stringify(resEviden?.data, null, 2)}`)
    let evidenData = []
    if (resEviden?.status === 200 && !!resEviden?.data) {
      evidenData = resEviden?.data
    }
    return evidenData
  }

  async getStartDateForEod() {
    // * check update data to find start date
    const lastEodExeucte = await this.repo.findLastOKExecuteEod()
    let tsLastEodDate
    if (lastEodExeucte) {
      tsLastEodDate = new Date(lastEodExeucte.execute_timestamp * 1000)
    } else {
      tsLastEodDate = new Date(0) // 1970-01-01 UTC
    }
    console.log('[INFO] getStartDateForEod: last eod execute: ', dayjs(tsLastEodDate).format('YYYY-MM-DD HH:mm:ss'))
    let start_date = getTodayStartAdd7().toDate()
    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'get-lated-gasday',
        mode: 'metering',
        timestamp: dayjs(tsLastEodDate).format('YYYY-MM-DD HH:mm:ss')
      })
    )
    let meterData: any[] = []
    try {
      meterData = JSON.parse(meteredMicroData?.reply ?? '[]')
    } catch {
      meterData = []
    }

    if (Array.isArray(meterData) && meterData.length > 0) {
      const minGasDay =
        meterData
          .map((r: any) => r?.gasDay)
          .filter(Boolean)
          .map((s: string) => dayjs(s))
          .filter((d) => d.isValid())
          .sort((a, b) => a.valueOf() - b.valueOf())[0] ?? null

      if (minGasDay) {
        const new_start_date = minGasDay.startOf('day').toDate()
        // console.log(`[DEBUG] getStartDateForEod: update start_date from meter: old ${start_date} new ${new_start_date}`);
        start_date = new_start_date
      }
    }

    // check update allocation shipper review
    const updatedReview = await this.repo.findEarliestShipperReviewUpdatedAfter(tsLastEodDate, start_date)

    if (updatedReview) {
      const new_start_date = new Date(updatedReview?.gas_day)
      // console.log(`[DEBUG] getStartDateForEod: update start_date from shipper review: old ${start_date} new ${new_start_date}`)
      start_date = new_start_date
    }
    // check adjustment by shipper
    const updatedAdjDailyImb = await this.repo.findEarliestAdjDailyImbUpdatedAfter(tsLastEodDate, start_date)
    if (updatedAdjDailyImb) {
      const new_start_date = new Date(updatedAdjDailyImb?.gas_day)
      // console.log(`[DEBUG] getStartDateForEod: update start_date from adjust daily imb: old ${start_date} new ${new_start_date}`)
      start_date = new_start_date
    }
    const updatedAdjAccImb = await this.repo.findEarliestAdjAccImbUpdatedAfter(tsLastEodDate, start_date)
    if (updatedAdjAccImb) {
      const new_start_date = new Date(updatedAdjAccImb?.gas_day)
      // console.log(`[DEBUG] getStartDateForEod: update start_date from adjust acc imb: old ${start_date} new ${new_start_date}`)
      start_date = new_start_date
    }
    const updatedVCO = await this.repo.findEarliestVCOUpdatedAfter(tsLastEodDate, start_date)
    if (updatedVCO) {
      const new_start_date = new Date(updatedVCO.gas_day)
      // console.log(`[DEBUG] getStartDateForEod: update start_date from vco: old ${start_date} new ${new_start_date}`)
      start_date = new_start_date
    }
    // verify dam system parameter
    const updatedDam = await this.repo.findEarliestDamParamUpdatedAfter(tsLastEodDate, start_date)
    if (updatedDam) {
      const new_start_date = new Date(updatedDam.start_date)
      // console.log(`[DEBUG] getStartDateForEod: update start_date from dam: old ${start_date} new ${new_start_date}`)
      start_date = new_start_date
    }

    // verify close balance
    const closedBal = await this.repo.findLatestClosedBalancingReport()

    if (closedBal) {
      const closedBalDate = dayjs(closedBal?.date_balance).add(1, 'month').toDate()
      if (start_date) {
        if (start_date < closedBalDate) {
          // console.log(`[DEBUG] getStartDateForEod: compare close balance: start_date ${start_date} < close balance ${closedBalDate}`)
          start_date = closedBalDate
        }
      }
    }

    const min_start_date_str = process.env.MIN_ALLOC_BAL_DATE
    if (min_start_date_str) {
      const min_start_date = dayjs(min_start_date_str, 'DD/MM/YYYY').toDate()
      if (start_date < min_start_date) {
        // console.log(`[DEBUG] getStartDateForEod: [WARN] start_date ${start_date} below min_start_date ${min_start_date}`)
        start_date = min_start_date
      }
    }

    return start_date
  }

  async notifyExecuteEodTimeoutFailed(createEod: any) {
    let message = `The allocation and balancing process for all shippers has`
    const nowAt = getTodayNow()
    const timeoutMin = Math.max(parseToNumber(process.env.ALLOC_EOD_WAIT_TIMEOUT_MIN) ?? 30, 1)

    message = `${message} finished failed with timeout after ${timeoutMin} minutes waiting`
    message = `${message} at period ${getTodayNow(createEod?.start_date).format('DD/MM/YYYY')} to ${getTodayNow(createEod?.end_date).format('DD/MM/YYYY')}.`
    message = `${message} \n(process executed on ${nowAt.format('DD/MM/YYYY HH:mm:ss')}).`

    try {
      await middleNotiInappMenuArr(
        this.prisma,
        'Balancing',
        message,
        [87, 88, 99, 100, 101],
        1,
        'Alloc & Bal'
      )
      await middleNotiInappMenuArr(
        this.prisma,
        'Allocation',
        message,
        [80, 82],
        1,
        'Alloc & Bal'
      )
    } catch (error) {
      console.error('[ERROR] executeData: eod timeout notification:', error?.stack || error)
    }
  }

  private getIntradayExecutionContext(executeEod: any) {
    const executeAt = getTodayNowAdd7(Number(executeEod?.execute_timestamp) * 1000)
    let yesterday = executeAt.subtract(1, 'day').format('YYYY-MM-DD')
    let today = executeAt.format('YYYY-MM-DD')
    let currentHour = executeAt.hour()

    if (currentHour === 0) {
      currentHour = 24
      today = yesterday
      yesterday = executeAt.subtract(2, 'day').format('YYYY-MM-DD')
    }

    return {
      yesterday,
      today,
      currentHour
    }
  }

  private async findLatestPublishedRequestNumber(exeIntraday: any[]) {
    for (let i = 0; i < exeIntraday.length; i++) {
      const exeTime = exeIntraday[i]?.execute_timestamp
      const gh = exeIntraday[i]?.gas_hour
      const gd = exeIntraday[i]?.gas_day
      const is_publish = await this.repo.isPublish(exeTime, gh, gd)
      if (is_publish) {
        return exeIntraday[i].request_number_id
      }
    }
    return null
  }

  async continueIntradayExecutionAfterEod(request_number_id: any, execute_timestamp: any, userId: any = null) {
    const eodRunKey = {
      request_number_id: Number(request_number_id),
      execute_timestamp: Number(execute_timestamp)
    }
    try {
      const triggerEod = await this.prisma.execute_eod.findFirst({
        where: eodRunKey
      })
      if (!triggerEod) {
        console.log(`[WARN] continueIntradayExecutionAfterEod: execute_eod(${request_number_id}, ${execute_timestamp}) not found`)
        return {
          skipped: true,
          intraday: []
        }
      }

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
      const {
        yesterday,
        today
      } = this.getIntradayExecutionContext(triggerEod)
      const now = getTodayNow()

      console.log(`[INFO] continueIntradayExecutionAfterEod: find latest successful request number eod for intraday process`)
      const refEodExeucte1 = await this.repo.findLatestOKEodForDate(today)
      const id_eod_1 = Number(refEodExeucte1?.id)
      const rq_eod_1 = Number(refEodExeucte1?.request_number_id)
      const refEodExeucte2 = await this.repo.findLatestOKEodForDate(yesterday)
      const id_eod_2 = Number(refEodExeucte2?.id)
      const rq_eod_2 = Number(refEodExeucte2?.request_number_id)
      const recalSourceEod = triggerEod?.status === 'OK' ? triggerEod : await this.repo.findLatestOKEodForDate(today)
      const modeZoneBaseInventoryRecalculation =
        await this.repo.findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate()
      const isModeZoneBaseInventoryRecal =
        !!modeZoneBaseInventoryRecalculation?.modeZoneBaseInventory
      const dailyAdjustmentRecalculation =
        await this.repo.findEarliestDailyAdjustmentIntradayRecalculationCandidate()
      const isDailyAdjustmentRecal =
        !!dailyAdjustmentRecalculation?.dailyAdjustment

      let useData = []
      const is_recal = (recalSourceEod?.status === 'OK' && recalSourceEod?.start_date != today) || isModeZoneBaseInventoryRecal || isDailyAdjustmentRecal

      if (isModeZoneBaseInventoryRecal) {
        const modeZoneBaseInventory =
          modeZoneBaseInventoryRecalculation.modeZoneBaseInventory
        const effectiveTime =
          modeZoneBaseInventoryRecalculation
            ?.modeZoneBaseInventoryEffectiveTime
        const latestGasHourBoundary =
          modeZoneBaseInventoryRecalculation
            ?.latestGasHourBoundary
        console.log(
          `[INFO][continueIntradayExecutionAfterEod]: mode_zone_base_inventory recalculation candidate id=${modeZoneBaseInventory.id} start_date=${dayjs(modeZoneBaseInventory.start_date).format('YYYY-MM-DD HH:mm:ss')} effective_time_bkk=${effectiveTime ? dayjs(effectiveTime).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss') : 'null'} latest_gas_hour_boundary_bkk=${latestGasHourBoundary ? dayjs(latestGasHourBoundary).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss') : 'null'} create_date_num=${modeZoneBaseInventory.create_date_num} latest_intraday_execute_timestamp=${modeZoneBaseInventoryRecalculation?.latestIntraday?.execute_timestamp} latest_gas_day=${modeZoneBaseInventoryRecalculation?.latestIntraday?.gas_day} latest_gas_hour=${modeZoneBaseInventoryRecalculation?.latestIntraday?.gas_hour} replay_start_gas_day=${modeZoneBaseInventoryRecalculation?.replayStartGasDay} replay_start_gas_hour=${modeZoneBaseInventoryRecalculation?.replayStartGasHour} qualification_reason=${modeZoneBaseInventoryRecalculation?.modeZoneBaseInventoryEvaluationReason}`
        )
      } else if (modeZoneBaseInventoryRecalculation?.checkedModeZoneBaseInventory) {
        const checkedModeZoneBaseInventory =
          modeZoneBaseInventoryRecalculation.checkedModeZoneBaseInventory
        const checkedEffectiveTime =
          modeZoneBaseInventoryRecalculation
            ?.checkedModeZoneBaseInventoryEffectiveTime
        const latestGasHourBoundary =
          modeZoneBaseInventoryRecalculation
            ?.latestGasHourBoundary
        console.log(
          `[DEBUG][continueIntradayExecutionAfterEod]: mode_zone_base_inventory replay not triggered id=${checkedModeZoneBaseInventory.id} start_date=${dayjs(checkedModeZoneBaseInventory.start_date).format('YYYY-MM-DD HH:mm:ss')} effective_time_bkk=${checkedEffectiveTime ? dayjs(checkedEffectiveTime).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss') : 'null'} latest_gas_hour_boundary_bkk=${latestGasHourBoundary ? dayjs(latestGasHourBoundary).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss') : 'null'} create_date_num=${checkedModeZoneBaseInventory.create_date_num} latest_intraday_execute_timestamp=${modeZoneBaseInventoryRecalculation?.latestIntraday?.execute_timestamp} latest_gas_day=${modeZoneBaseInventoryRecalculation?.latestIntraday?.gas_day} latest_gas_hour=${modeZoneBaseInventoryRecalculation?.latestIntraday?.gas_hour} qualification_reason=${modeZoneBaseInventoryRecalculation?.checkedModeZoneBaseInventoryEvaluationReason}`
        )
      }

      if (isDailyAdjustmentRecal) {
        const dailyAdjustment =
          dailyAdjustmentRecalculation.dailyAdjustment
        const effectiveTime =
          dailyAdjustmentRecalculation
            ?.dailyAdjustmentEffectiveTime
        const latestGasHourBoundary =
          dailyAdjustmentRecalculation
            ?.latestGasHourBoundary
        console.log(
          `[INFO][continueIntradayExecutionAfterEod]: daily_adjustment recalculation candidate id=${dailyAdjustment.id} daily_code=${dailyAdjustment.daily_code} gas_day=${dayjs(dailyAdjustment.gas_day).tz('Asia/Bangkok').format('YYYY-MM-DD')} time=${dailyAdjustment.time} effective_time_bkk=${effectiveTime ? dayjs(effectiveTime).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss') : 'null'} latest_gas_hour_boundary_bkk=${latestGasHourBoundary ? dayjs(latestGasHourBoundary).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss') : 'null'} create_date_num=${dailyAdjustment.create_date_num} latest_intraday_execute_timestamp=${dailyAdjustmentRecalculation?.latestIntraday?.execute_timestamp} latest_gas_day=${dailyAdjustmentRecalculation?.latestIntraday?.gas_day} latest_gas_hour=${dailyAdjustmentRecalculation?.latestIntraday?.gas_hour} replay_start_gas_day=${dailyAdjustmentRecalculation?.replayStartGasDay} replay_start_gas_hour=${dailyAdjustmentRecalculation?.replayStartGasHour} qualification_reason=${dailyAdjustmentRecalculation?.dailyAdjustmentEvaluationReason}`
        )
      } else if (dailyAdjustmentRecalculation?.checkedDailyAdjustment) {
        const checkedDailyAdjustment =
          dailyAdjustmentRecalculation.checkedDailyAdjustment
        const checkedEffectiveTime =
          dailyAdjustmentRecalculation
            ?.checkedDailyAdjustmentEffectiveTime
        const latestGasHourBoundary =
          dailyAdjustmentRecalculation
            ?.latestGasHourBoundary
        console.log(
          `[DEBUG][continueIntradayExecutionAfterEod]: daily_adjustment replay not triggered id=${checkedDailyAdjustment.id} daily_code=${checkedDailyAdjustment.daily_code} gas_day=${dayjs(checkedDailyAdjustment.gas_day).tz('Asia/Bangkok').format('YYYY-MM-DD')} time=${checkedDailyAdjustment.time} effective_time_bkk=${checkedEffectiveTime ? dayjs(checkedEffectiveTime).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss') : 'null'} latest_gas_hour_boundary_bkk=${latestGasHourBoundary ? dayjs(latestGasHourBoundary).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss') : 'null'} create_date_num=${checkedDailyAdjustment.create_date_num} latest_intraday_execute_timestamp=${dailyAdjustmentRecalculation?.latestIntraday?.execute_timestamp} latest_gas_day=${dailyAdjustmentRecalculation?.latestIntraday?.gas_day} latest_gas_hour=${dailyAdjustmentRecalculation?.latestIntraday?.gas_hour} qualification_reason=${dailyAdjustmentRecalculation?.checkedDailyAdjustmentEvaluationReason}`
        )
      }

      console.log(`[DEBUG] continueIntradayExecutionAfterEod: is recal ${is_recal} mode_zone_base_inventory=${isModeZoneBaseInventoryRecal} daily_adjustment=${isDailyAdjustmentRecal}`)
      console.log(`[INFO] continueIntradayExecutionAfterEod: list intraday execute`)
      if (is_recal) {
        const replayStart =
          this.getEarliestIntradayReplayStart([
            isModeZoneBaseInventoryRecal
              ? {
                source: 'mode_zone_base_inventory',
                gasDay:
                  modeZoneBaseInventoryRecalculation?.replayStartGasDay,
                gasHour:
                  modeZoneBaseInventoryRecalculation?.replayStartGasHour
              }
              : null,
            isDailyAdjustmentRecal
              ? {
                source: 'daily_adjustment',
                gasDay:
                  dailyAdjustmentRecalculation?.replayStartGasDay,
                gasHour:
                  dailyAdjustmentRecalculation?.replayStartGasHour
              }
              : null
          ])

        if (replayStart) {
          console.log(
            `[INFO][continueIntradayExecutionAfterEod]: replay start source=${replayStart.source} gas_day=${replayStart.gasDay} gas_hour=${replayStart.gasHour}`
          )
          let request_number_previous_hour = null

          if (replayStart.gasDay === yesterday) {
            const meteredMicroDataYester = await this.meteredMicroService.sendMessage(
              JSON.stringify({
                case: 'get-gashour',
                mode: 'metering',
                gas_day: yesterday
              })
            )
            const parsedYester = (!!meteredMicroDataYester?.reply && JSON.parse(meteredMicroDataYester.reply)) || null
            const rowsYester = Array.isArray(parsedYester) ? parsedYester : []
            console.log(`[INFO] continueIntradayExecutionAfterEod: meterData(array) length ${rowsYester.length} `)
            const hoursYester = [...new Set(rowsYester.map((r) => Number(r?.gasHour)).filter(Number.isFinite))].sort((a, b) => a - b).filter((gasHour) => gasHour >= replayStart.gasHour)
            if (hoursYester.length === 0) {
              console.log(`[WARN] continueIntradayExecutionAfterEod: no yesterday hours matched replay cutoff ${replayStart.gasHour}`)
            } else {
              const exeIntradayYester = await this.repo.findOKIntradayBeforeHourOnDay(yesterday, hoursYester[0])
              request_number_previous_hour = await this.findLatestPublishedRequestNumber(exeIntradayYester)

              for (const iHour of hoursYester) {
                if (!Number.isFinite(id_eod_2)) {
                  console.log(`[WARN] continueIntradayExecutionAfterEod: skip ${yesterday} hour ${iHour}: no successful EOD reference found`)
                  continue
                }
                const createNumberId = await this.repo.createRunNumber('intraday', userId)
                const createIntraday = await this.repo.createExerIntradayLog(createNumberId, id_eod_2, execute_timestamp, request_number_previous_hour, yesterday, iHour)
                if (createIntraday) {
                  request_number_previous_hour = createNumberId
                  useData.push(createIntraday)
                } else {
                  console.log(`[WARN] continueIntradayExecutionAfterEod: skip ${yesterday} hour ${iHour}: createExerIntradayLog returned null`)
                }
              }
            }
          }

          const meteredMicroData = await this.meteredMicroService.sendMessage(
            JSON.stringify({
              case: 'get-gashour',
              mode: 'metering',
              gas_day: today
            })
          )
          const parsed = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData.reply)) || null
          const rows = Array.isArray(parsed) ? parsed : []
          console.log(`[INFO] continueIntradayExecutionAfterEod: meterData(array) length ${rows.length} `)
          const hours = [...new Set(rows.map((r) => Number(r?.gasHour)).filter(Number.isFinite))].sort((a, b) => a - b).filter((gasHour) => replayStart.gasDay !== today || gasHour >= replayStart.gasHour)
          if (hours.length === 0) {
            console.log('[INFO] continueIntradayExecutionAfterEod: no hours returned from metering - skipping intraday')
          }

          if (request_number_previous_hour == null && hours.length > 0) {
            const exeIntradayToday = await this.repo.findOKIntradayBeforeHourOrYesterday(today, yesterday, hours[0])
            request_number_previous_hour = await this.findLatestPublishedRequestNumber(exeIntradayToday)
          }

          for (const iHour of hours) {
            if (!Number.isFinite(id_eod_1)) {
              console.log(`[WARN] continueIntradayExecutionAfterEod: skip hour ${iHour}: no successful EOD reference found`)
              continue
            }
            const createNumberId = await this.repo.createRunNumber('intraday', userId)
            const createIntraday = await this.repo.createExerIntradayLog(createNumberId, id_eod_1, execute_timestamp, request_number_previous_hour, today, iHour)
            if (createIntraday) {
              request_number_previous_hour = createNumberId
              useData.push(createIntraday)
            } else {
              console.log(`[WARN] continueIntradayExecutionAfterEod: skip hour ${iHour}: createExerIntradayLog returned null`)
            }
          }
        } else {
          const meteredMicroDataYester = await this.meteredMicroService.sendMessage(
            JSON.stringify({
              case: 'get-last-gashour',
              mode: 'metering',
              gas_day: yesterday
            })
          )
          const parsedYester = (!!meteredMicroDataYester?.reply && JSON.parse(meteredMicroDataYester.reply)) || null
          const rowsYester = Array.isArray(parsedYester) ? parsedYester : []
          console.log(`[INFO] continueIntradayExecutionAfterEod: meterData(array) length ${rowsYester.length} `)
          const hoursYester = [...new Set(rowsYester.map((r) => Number(r?.gasHour)).filter(Number.isFinite))].sort((a, b) => a - b)
          if (hoursYester.length === 0) {
            console.log('[WARN] continueIntradayExecutionAfterEod: no hours yester returned from metering - skipping intraday')
          }

          const exeIntradayYester = await this.repo.findOKIntradayBeforeHourOnDay(yesterday, hoursYester[0])
          let request_number_previous_hour = await this.findLatestPublishedRequestNumber(exeIntradayYester)

          if (hoursYester.length > 0 && Number.isFinite(id_eod_2)) {
            const createNumberId = await this.repo.createRunNumber('intraday', userId)
            const createIntraday = await this.repo.createExerIntradayLog(createNumberId, id_eod_2, execute_timestamp, request_number_previous_hour, yesterday, 24)
            if (createIntraday) {
              request_number_previous_hour = createNumberId
              useData.push(createIntraday)
            } else {
              console.log(`[WARN] continueIntradayExecutionAfterEod: skip hour 24: createExerIntradayLog returned null`)
            }
          } else if (hoursYester.length > 0) {
            console.log(`[WARN] continueIntradayExecutionAfterEod: skip ${yesterday} hour 24: no successful EOD reference found`)
          }

          const meteredMicroData = await this.meteredMicroService.sendMessage(
            JSON.stringify({
              case: 'get-gashour',
              mode: 'metering',
              gas_day: today
            })
          )
          const parsed = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData.reply)) || null
          const rows = Array.isArray(parsed) ? parsed : []
          console.log(`[INFO] continueIntradayExecutionAfterEod: meterData(array) length ${rows.length} `)
          const hours = [...new Set(rows.map((r) => Number(r?.gasHour)).filter(Number.isFinite))].sort((a, b) => a - b)
          if (hours.length === 0) {
            console.log('[INFO] continueIntradayExecutionAfterEod: no hours returned from metering - skipping intraday')
          }

          for (const iHour of hours) {
            if (!Number.isFinite(id_eod_1)) {
              console.log(`[WARN] continueIntradayExecutionAfterEod: skip hour ${iHour}: no successful EOD reference found`)
              continue
            }
            const createNumberId = await this.repo.createRunNumber('intraday', userId)
            const createIntraday = await this.repo.createExerIntradayLog(createNumberId, id_eod_1, execute_timestamp, request_number_previous_hour, today, iHour)
            if (createIntraday) {
              request_number_previous_hour = createNumberId
              useData.push(createIntraday)
            } else {
              console.log(`[WARN] continueIntradayExecutionAfterEod: skip hour ${iHour}: createExerIntradayLog returned null`)
            }
          }
        }
      } else {
        const meteredMicroData = await this.meteredMicroService.sendMessage(
          JSON.stringify({
            case: 'get-last-gashour',
            mode: 'metering',
            gas_day: today
          })
        )
        const parsed = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData.reply)) || null
        const rows = Array.isArray(parsed) ? parsed : []
        console.log(`[INFO] continueIntradayExecutionAfterEod: meterData(array) length ${rows.length} `)
        const hours = [...new Set(rows.map((r) => Number(r?.gasHour)).filter(Number.isFinite))].sort((a, b) => a - b)
        if (hours.length === 0) {
          console.log('[WARN] continueIntradayExecutionAfterEod: no hours returned from metering - skipping intraday')
        }

        const exeIntradayToday = await this.repo.findOKIntradayBeforeHourOrYesterday(today, yesterday, hours[0])
        let request_number_previous_hour = await this.findLatestPublishedRequestNumber(exeIntradayToday)

        for (const iHour of hours) {
          if (!Number.isFinite(id_eod_1)) {
            console.log(`[WARN] continueIntradayExecutionAfterEod: skip hour ${iHour}: no successful EOD reference found`)
            continue
          }
          const createNumberId = await this.repo.createRunNumber('intraday', userId)
          const createIntraday = await this.repo.createExerIntradayLog(createNumberId, id_eod_1, execute_timestamp, request_number_previous_hour, today, iHour)
          if (createIntraday) {
            request_number_previous_hour = createNumberId
            useData.push(createIntraday)
          } else {
            console.log(`[WARN] continueIntradayExecutionAfterEod: skip hour ${iHour}: createExerIntradayLog returned null`)
          }
        }
      }

      console.log(`[INFO] continueIntradayExecutionAfterEod: execute intraday`)
      for (let i = 0; i < useData.length; i++) {
        const reqEod = useData[i]?.gas_day === today ? rq_eod_1 : rq_eod_2
        const sendIntraday = {
          request_number: useData[i]?.request_number_id,
          execute_timestamp: useData[i]?.execute_timestamp,
          request_number_previous_hour: useData[i]?.request_number_previous_hour,
          request_number_eod: reqEod,
          gas_day: useData[i]?.gas_day,
          gas_hour: useData[i]?.gas_hour
        }
        await this.repo.createLogExecuteIntraday(
          useData[i]?.request_number_id,
          useData[i]?.execute_timestamp,
          useData[i]?.request_number_previous_hour,
          reqEod,
          useData[i]?.gas_day,
          useData[i]?.gas_hour,
          now,
          userId
        )
        await this.evidenApiCenterPost(sendIntraday, 'execute_intraday')
        await sleep(1000)
      }

      return {
        skipped: false,
        intraday: useData
      }
    } catch (error) {
      console.error('[ERROR] continueIntradayExecutionAfterEod:', error?.stack || error)
      throw error
    }
  }

  // ....
  async executeData(payload: any, userId: any) {
    // *Definde parameter for execute
    const execute_timestamp = dayjs().unix()
    const now = getTodayNow()
    const nowAt = getTodayNowAdd7()
    let yesterday = now.subtract(1, 'day').format('YYYY-MM-DD')
    let today = now.format('YYYY-MM-DD')
    let currentHour = nowAt.hour()
    let start_date_eod = await this.getStartDateForEod()
    let end_date_eod = getTodayStartAdd7().toDate()

    if (currentHour === 0) {
      end_date_eod = getTodayStartAdd7().subtract(1, 'day').toDate()
      currentHour = 24
      today = yesterday
      yesterday = now.subtract(2, 'day').format('YYYY-MM-DD')
    }
    if (start_date_eod > end_date_eod) {
      start_date_eod = end_date_eod
    }

    console.log(`[INFO] executeData: lunch execute alloc&bal: ${today} at hour ${currentHour}`)

    const createNumberId = await this.repo.createRunNumber('eod', userId)
    console.log(`[INFO] executeData: create record in execute_eod table`)
    const createEod = await this.repo.createExecuteEod(createNumberId, execute_timestamp, start_date_eod, end_date_eod)

    // *Notic user for waitng for alloc&bal
    try {
      await middleNotiInappMenuArr(
        this.prisma,
        'Balancing',
        `The allocation and balancing process for all shippers and the following period ${dayjs(start_date_eod).format('YYYY-MM-DD')} to ${dayjs(end_date_eod).format('YYYY-MM-DD')} has waiting.`,
        [87, 88, 99, 100, 101], // custom type menus_id | 87 Balancing | 88 Vent/Commissioning/Other Gas | 100 Adjustment Daily Imbalance | 101 Adjust Accumulated Imbalance || 99 Intraday Acc. Imbalance Inventory Adjust
        1,
        'Alloc & Bal' //payload?.menu,
      )
      await middleNotiInappMenuArr(
        this.prisma,
        'Allocation',
        `The allocation and balancing process for all shippers and the following period ${dayjs(start_date_eod).format('YYYY-MM-DD')} to ${dayjs(end_date_eod).format('YYYY-MM-DD')}  has waiting.`,
        [80, 82], // custom type menus_id | 80 Allocation | 82 Allocation Management,
        1,
        'Alloc & Bal' //payload?.menu,
      )
    } catch (error) {
      console.log('[ERROR] executeData: notification ', error)
    }

    // * execute eod
    const sendEod = {
      request_number: createEod?.request_number_id,
      execute_timestamp: createEod?.execute_timestamp,
      start_date: createEod?.start_date,
      end_date: createEod?.end_date
    }
    console.log('[INFO] executeData: create record in log_execute_eod table')
    await this.repo.createLogExecuteEod(createEod?.request_number_id, createEod?.execute_timestamp, createEod?.start_date, createEod?.end_date, nowAt, userId)
    console.log(`[INFO] executeData: execute_eod(${createEod?.request_number_id}): ${createEod?.start_date} - ${createEod?.end_date}`)
    await this.evidenApiCenterPost(sendEod, 'execute_eod')

    console.log(`[INFO] executeData: wait execute_eod(${createEod?.request_number_id}) finish status before intraday`)
    const finishedEod = await this.repo.waitExecuteEodFinished(createEod?.request_number_id, createEod?.execute_timestamp)
    if (finishedEod?.status) {
      console.log(`[INFO] executeData: execute_eod(${createEod?.request_number_id}) finished with status ${finishedEod.status}`)
      return {
        eod: sendEod,
        intraday: []
      }
    } else {
      console.log(`[WARN] executeData: execute_eod(${createEod?.request_number_id}) did not finish before wait timeout; continue intraday with latest successful EOD reference`)
      await this.notifyExecuteEodTimeoutFailed(createEod)
      const intradayResult = await this.continueIntradayExecutionAfterEod(createEod?.request_number_id, createEod?.execute_timestamp, userId)
      return {
        eod: sendEod,
        intraday: intradayResult?.intraday || []
      }
    }
  }

  async versionExe(payload: any, userId: any) {
    const temp = [
      {
        request_number: 813,
        execute_timestamp: 1740072000,
        gas_day: '2025-02-20',
        type: 'eod',
        success: true
      },
      {
        request_number: 818,
        execute_timestamp: 1740097800,
        gas_day: '2025-02-20',
        type: 'eod',
        success: true
      },
      {
        request_number: 348,
        execute_timestamp: 1737318000,
        request_number_previous_hour: 347,
        request_number_eod: 346,
        gas_day: '2025-01-20',
        gas_hour: 3,
        type: 'intraday',
        success: true
      }
    ]

    return temp
  }

  async allcationOnceIdQuery(payload: any, userId: any) {
    const { idAr, ...nPayload } = payload
    const allocationQuery = await this.allocationQuery(nPayload, userId)
    const fil = allocationQuery.filter((f: any) => {
      return idAr.includes(f?.id)
    })

    return fil
  }
  //

  async allocationQueryVersion(payload: any, userId: any) {
    const { start_date, end_date, is_last_version, skip, limit, tab } = payload

    const start = start_date ? getTodayStartAdd7(start_date) : null
    const end = end_date ? getTodayEndAdd7(end_date) : null

    if (!start_date || !end_date || !start.isValid() || !end.isValid()) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: '⛔ Invalid date format',
          error: '⛔ Invalid date format'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    if (end.isBefore(start)) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: '⛔ End date must be after or equal to start date',
          error: '⛔ End date must be after or equal to start date'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const dateArray: string[] = []

    let current = start

    while (current.isSameOrBefore(end)) {
      dateArray.push(current.format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }

    let evidenApiAllocationEod = []
    let intradayEviden = []
    intradayEviden = (
      await Promise.all(
        dateArray.map(async (date) => {
          try {
            let totalRecord: number | undefined = undefined
            await this.evidenApiAllocationIntraday(
              {
                gas_day: date,
                start_hour: 1,
                end_hour: 24,
                skip: 0,
                limit: 1
              },
              (total_record: number) => {
                totalRecord = total_record
              }
            )
            const evidenApiAllocationIntraday = await this.evidenApiAllocationIntraday({
              gas_day: date,
              start_hour: 1,
              end_hour: 24,
              skip: totalRecord ? 0 : skip,
              limit: totalRecord ? totalRecord : limit
            })
            return evidenApiAllocationIntraday
          } catch (error) {
            return []
          }
        })
      )
    ).flat()

    let totalRecord: number | undefined = undefined
    await this.evidenApiAllocationEod(
      {
        start_date,
        end_date,
        skip: 0,
        limit: 1
      },
      (total_record: number) => {
        totalRecord = total_record
      }
    )
    evidenApiAllocationEod = await this.evidenApiAllocationEod({
      start_date,
      end_date,
      skip: totalRecord ? 0 : skip,
      limit: totalRecord ? totalRecord : limit
    })

    const result = []

    evidenApiAllocationEod.map((item: any) => {
      if (result.some((f: any) => f?.execute_timestamp === item?.execute_timestamp)) return
      result.push({
        request_number: item?.request_number,
        execute_timestamp: item?.execute_timestamp,
        gas_day: item?.gas_day,
        type: 'eod',
        success: true
      })
    })

    intradayEviden.map((item: any) => {
      if (result.some((f: any) => f?.execute_timestamp === item?.execute_timestamp)) return
      result.push({
        request_number: item?.request_number,
        execute_timestamp: item?.execute_timestamp,
        request_number_previous_hour: item?.request_number_previous_hour,
        request_number_eod: item?.request_number_eod,
        gas_day: item?.gas_day,
        gas_hour: item?.gas_hour,
        type: 'intraday',
        success: true
      })
    })

    return result
  }

  // กรอง วันที่ใน array ในช่วง min max
  filterDatesInRange(dates: (string | Date)[], minDate: string | Date, maxDate: string | Date) {
    const min = dayjs(minDate).startOf('day')
    const max = dayjs(maxDate).endOf('day') // รวมวันสุดท้าย

    return dates
      .map((d) => dayjs(d)) // แปลงเป็น dayjs
      .filter((dt) => !dt.isBefore(min, 'day') && !dt.isAfter(max, 'day')) // อยู่ในช่วงแบบ inclusive
      .map((dt) => dt.format('YYYY-MM-DD')) // รูปแบบผลลัพธ์
  }

  async publicationCenter(payload?: any, userId?: any) {
    const resData = await this.prisma.publication_center.findMany({
      where: {
        OR: [
          {
            del_flag: null
          },
          {
            del_flag: false
          }
        ]
      }
    })

    return resData
  }

  async publicationCenterGen(payload: any, userId: any) {
    const { execute_timestamp, gas_day, gas_hour } = payload

    const resData = await this.prisma.publication_center.findFirst({
      where: {
        execute_timestamp: execute_timestamp,
        gas_day_text: gas_day,
        gas_hour: gas_hour ? gas_hour : null
      }
    })
    const nowAt = getTodayNowAdd7()

    if (resData) {
      // del_flag
      console.log('[INFO] publicationCenterGen: delete')
      await this.prisma.publication_center.updateMany({
        where: {
          execute_timestamp: execute_timestamp,
          gas_day_text: gas_day,
          gas_hour: gas_hour ? gas_hour : null
        },
        data: {
          update_date: nowAt.toDate(),
          update_date_num: nowAt.unix(),
          update_by: Number(userId),
          del_flag: resData.del_flag != true ? true : null
        }
      })
    } else {
      console.log('[INFO] publicationCenterGen: create')
      // create
      await this.prisma.publication_center.create({
        data: {
          execute_timestamp: execute_timestamp,
          gas_day_text: gas_day,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate(),
          gas_hour: gas_hour ? gas_hour : null,
          create_date: nowAt.toDate(),
          create_date_num: nowAt.unix(),
          create_by: Number(userId),
          del_flag: true
        }
      })
    }

    return payload
  }

  async allocationReportView(payload: any, userId: any) {
    const { start_date, end_date, skip, limit, tab, contract, shipper, gas_day, gas_hour, request_number, execute_timestamp, id } = payload

    const start = getTodayStartAdd7(start_date)
    const end = getTodayEndAdd7(end_date)
    const startDate = start.toDate()
    const endDate = end.toDate()

    if (!start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    // *Query data
    const [entryExitMaster, publicList] = await Promise.all([this.repo.getEntryExit(), this.repo.getPublication(startDate, endDate, true)])
    let allocationReportView = await this.repo.getAllocationReportView(startDate, endDate)

    // *Build lookup
    const entryExitMap = new Map<string, any>(entryExitMaster.map((e: any) => [String(e?.name ?? '').toUpperCase(), e]))

    const deletedPubSet = new Set<string>()
    for (const d of publicList as any[]) {
      deletedPubSet.add(`${d?.execute_timestamp ?? ''}|${d?.gas_day_text ?? ''}|${d?.gas_hour ?? ''}`)
    }

    const makeAlloKey = (x: any) => `${x.gas_day_text}|${x.shipper_name_text}|${x.contract_code_text}|${x.point_text}|${x.entry_exit_text}|${x.area_text}|${x.zone_text}`
    const allocationReportMap = new Map<string, any>()
    for (const a of allocationReportView as any[]) allocationReportMap.set(makeAlloKey(a), a)

    // *request eviden api
    let evidenApi = []
    if (tab === '1' || tab === 1) {
      evidenApi = await this.repo.getEvidenApiAllocationReportNom(start, end, true)
    } else {
      evidenApi = await this.repo.getEvidenApiAllocationIntradayReportNom(start, end)
    }
    const flatEvidenApi = await flatEvidenApiResponse(evidenApi, this.prisma)

    // *process data
    const isMatch = (v: any, t: any) => !t || t === 'undefined' || t === 'null' || `${v}` === `${t}`
    const result: any = Object.values(
      (flatEvidenApi ?? []).reduce((acc: any, curr: any) => {
        if (!(isMatch(curr.contract, contract) && isMatch(curr.shipper, shipper) && isMatch(curr.gas_day, gas_day) && isMatch(curr.gas_hour, gas_hour) && isMatch(curr.request_number, request_number) && isMatch(curr.execute_timestamp, execute_timestamp))) return acc

        const key = `${curr.gas_day}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`

        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }

        return acc
      }, {})
    )

    // *check update new allocation report
    const newAllocation: any[] = []
    const newAllocationKeySet = new Set<string>()

    for (const r of result) {
      const dbKey = `${r.gas_day}|${r.shipper}|${r.contract}|${r.point}|${r.entry_exit}|${r.area}|${r.zone}`
      const existed = allocationReportMap.get(`${r.gas_day}|${r.shipper}|${r.contract}|${r.point}|${r.entry_exit}|${r.area}|${r.zone}`)

      if (!existed && !newAllocationKeySet.has(dbKey)) {
        newAllocationKeySet.add(dbKey)
        newAllocation.push({
          shipper_name_text: r.shipper,
          gas_day_text: r.gas_day,
          contract_code_text: r.contract,
          point_text: r.point,
          entry_exit_text: r.entry_exit,
          area_text: r.area,
          zone_text: r.zone,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(r.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId)
        })
      }
    }

    if (newAllocation.length > 0) {
      await this.repo.createAllocationReportView(newAllocation)
      allocationReportView = await this.repo.getAllocationReportView(startDate, endDate)
    }

    const response = result?.map((record: any) => {
      const values = record?.values ?? []

      // faster than multiple .find(): build tag->value once
      const tagMap = new Map<string, any>()
      for (const v of values) tagMap.set(v?.tag, v?.value)

      const contractCapacity = tagMap.get('contractCapacity') ?? null
      const nominationValue = tagMap.get('nominatedValue') ?? null
      const allocatedValue = tagMap.get('allocatedValue') ?? null

      const entry_exit_obj = entryExitMap.get(String(record?.entry_exit ?? '').toUpperCase()) ?? null
      const entx = String(record?.entry_exit ?? '').toUpperCase() === 'ENTRY' ? 1 : 2

      const findAllocationReport = allocationReportMap.get(`${record?.gas_day}|${record?.shipper}|${record?.contract}|${record?.point}|${record?.entry_exit}|${record?.area}|${record?.zone}`)

      return {
        id: findAllocationReport?.id,
        ...record,
        contractCapacity,
        nominationValue,
        allocatedValue,
        entry_exit_obj
      }
    })

   

    return response
  }

  getMinMaxDatesFromArray(dates: string[]): {
    min: string
    max: string
  } {
    const sorted = dates.map((date) => dayjs(date, 'DD/MM/YYYY')).sort((a, b) => a.unix() - b.unix())

    const min = sorted[0].format('DD/MM/YYYY')
    const max = sorted[sorted.length - 1].format('DD/MM/YYYY')

    return { min, max }
  }

  async genExcelTemplate(payload: any) {
    let { contract_code_name, shipper_code } = payload
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    let numberOfDaysCanReviewAfter = 0
    try {
      const systemParameter: systemParameterWithRelations[] = await this.prisma.system_parameter.findMany({
        where: {
          system_parameter: {
            id: {
              in: [ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW, ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW_DUPLICATE]
            }
          },
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
                    gt: todayStart
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        },
        ...systemParameterPopulate
      })

      const activeSystemParameter = systemParameter.find((parameter) => parameter.start_date <= todayEnd && (parameter.end_date > todayStart || parameter.end_date === null))
      const numberOfDays = parseToNumber(activeSystemParameter?.value)
      if (numberOfDays != null) {
        numberOfDaysCanReviewAfter = numberOfDays
      }
    } catch (error) {
      numberOfDaysCanReviewAfter = 0
    }

    const apiRange = this.getPrev7Dates(numberOfDaysCanReviewAfter)
    const weeklyPrev7 = this.getPrev7DatesMinut1()
    // const weeklyPrev7 = this.getPrev4YearsDates() // test 4 year

    // ของจริงเปิด
    const { min: start_date, max: end_date } = this.getMinMaxDatesFromArray(apiRange)
    // const start_date = '2025-01-01';
    // const end_date = '2025-02-28';

    const evidenApiAllocationEod = await this.evidenApiAllocationEod({
      start_date: dayjs(start_date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
      end_date: dayjs(end_date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
      skip: 0,
      limit: 1000,
      // skip: 100,
      // limit: 100,
      contract: contract_code_name,
      shipper: shipper_code
    })

    const newEOD = evidenApiAllocationEod.flatMap((fm: any) => {
      const { data: data1, ...fmD } = fm

      const nData = data1?.flatMap((dFm: any) => {
        const { data: data2, ...fmD2 } = dFm
        const nData2 = data2.map((dFm2: any) => {
          return {
            ...fmD,
            ...fmD2,
            ...dFm2
          }
        })

        return [...nData2]
      })

      return [...nData]
    })
    console.log('newEOD : ', newEOD);
    const resultEodLast1: any = Object.values(
      newEOD.reduce((acc, curr) => {
        const key = `${curr.gas_day}| ${curr.shipper}| ${curr.contract}| ${curr.point}| ${curr.entry_exit}| ${curr.area}| ${curr.zone} `
        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )
    // console.log('resultEodLast1 : ', resultEodLast1);
    // East_to_BVW10
    // const fresultEodLast1_ = resultEodLast1?.filter((f:any) => f?.point === "East_to_BVW10")
    // console.log('fresultEodLast1_ : ', fresultEodLast1_); // test
    // point_type = 'CONCEPT'

    const eodApi = resultEodLast1.filter((f: any) => {
      return f?.contract === contract_code_name && f?.shipper === shipper_code
    })?.filter((f: any) => {
      if(f?.point_type === "CONCEPT"){
        if(f?.point === "East_to_BVW10" || f?.point === "East_to_RA6" || f?.point === "West_to_BVW10" || f?.point === "West_to_RA6"){
          return true
        }else{
          return false
        }
      }else{
        return true
      }
    })
    // const eodApiFil = eodApi.map(({ zone, area, point, entry_exit }) => ({ zone, area, point, unit: "MMBTU/D", entry_exit }))
    const eodApiFil = Array.from(
      new Map(
        eodApi.map(({ zone, area, point, entry_exit }) => {
          const key = `${zone}| ${area}| ${point}| ${entry_exit} `
          return [
            key,
            {
              zone,
              area,
              point,
              unit: 'MMBTU/D',
              entry_exit
            }
          ]
        })
      ).values()
    )

    return this.genExcelTemplateFinal({
      todayStart,
      todayEnd,
      weeklyPrev7,
      contract_code_name,
      shipper_code,
      eodApi: eodApiFil
    })
  }

  getPrev7Dates(length: number = 7) {
    const today = dayjs()

    // สร้าง array 7 วันย้อนหลัง (รวมวันนี้)
    const weekDates = Array.from({ length: length }, (_, i) => today.add(i - (length - 1), 'day').format('DD/MM/YYYY'))

    return weekDates
  }

  getPrev7DatesMinut1(length: number = 7) {
    const today = dayjs().subtract(1, 'day')

    // สร้าง array 7 วันย้อนหลัง (รวมวันนี้)
    const weekDates = Array.from({ length: length }, (_, i) => today.add(i - (length - 1), 'day').format('DD/MM/YYYY'))

    return weekDates
  }

  getPrev4YearsDates() {
    const endDate = dayjs().subtract(1, "day");
    const startDate = endDate.subtract(4, "year");

    const totalDays = endDate.diff(startDate, "day") + 1;

    return Array.from({ length: totalDays }, (_, i) =>
      startDate.add(i, "day").format("DD/MM/YYYY")
    );
  }

  async componentGenExcelAllocation(data: any, data2: any, data3: any, typeOfNomination: any) {
    // สร้าง workbook และ worksheet
    const workbook = XLSX.utils.book_new() // สร้าง workbook ใหม่
    const worksheet1 = XLSX.utils.aoa_to_sheet(data) // สร้าง sheet จาก array ของ array
    // const worksheet2 = XLSX.utils.aoa_to_sheet(data2); // สร้าง sheet จาก array ของ array
    // const worksheet3 = XLSX.utils.aoa_to_sheet(data3); // สร้าง sheet จาก array ของ array
    XLSX.utils.book_append_sheet(workbook, worksheet1, typeOfNomination) // เพิ่ม sheet ลงใน workbook
    // XLSX.utils.book_append_sheet(workbook, worksheet2, 'Quality'); // เพิ่ม sheet ลงใน workbook
    // XLSX.utils.book_append_sheet(workbook, worksheet3, 'Lists'); // เพิ่ม sheet ลงใน workbook
    const defaultColumnWidth = 20 // กำหนดค่าความกว้างมาตรฐานที่ต้องการ
    const defaultColumnWidthSheet2 = 10 // กำหนดค่าความกว้างมาตรฐานที่ต้องการ

    //   ค้นหาแถวสุดท้ายที่มีข้อมูล
    const worksheet1Keys = Object.keys(worksheet1)
    let lastRowWithData = 0
    for (const key of worksheet1Keys) {
      if (key[0] === '!') continue
      const row = parseInt(key.replace(/[^0-9]/g, ''), 10)
      if (!isNaN(row) && row > lastRowWithData) {
        lastRowWithData = row
      }
    }

    worksheet1Keys.forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')) // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '')

      if (worksheet1[cell] && typeof worksheet1[cell] === 'object' && cell[0] !== '!') {
        worksheet1[cell].z = '@' // ใช้รูปแบบ '@' เพื่อระบุว่าเป็น Text
        worksheet1[cell].t = 's'
        worksheet1['!cols'] = Array(30)
          .fill(null)
          .map((_, index) => ({
            wch: index === 5 ? 25 : defaultColumnWidth // คอลัมน์แรก (A) กว้าง 25, ที่เหลือกว้าง 20
          }))

        //   ถ้า row 2 และเซลล์มีข้อมูล ให้ใส่สีพื้นหลังดำและข้อความสีขาว
        if (rowNumber === 2 && worksheet1[cell].v) {
          worksheet1[cell].s = worksheet1[cell].s || {} // ตรวจสอบว่าเซลล์มี object style หรือไม่
          worksheet1[cell].s.fill = {
            patternType: 'solid', //   เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: '000000'
            } //   สีพื้นหลังดำ (Black)
          }
          worksheet1[cell].s.font = {
            color: {
              rgb: 'FFFFFF'
            }, //   สีข้อความเป็นสีขาว (White)
            bold: true //   ทำให้ตัวอักษรหนา
          }
        }
        //   ถ้า row 4 และเซลล์มีข้อมูล ให้ใส่สีพื้นหลังดำและข้อความสีขาว
        if (rowNumber === 4 && worksheet1[cell].v) {
          worksheet1[cell].s = worksheet1[cell].s || {} // ตรวจสอบว่าเซลล์มี object style หรือไม่
          worksheet1[cell].s.fill = {
            patternType: 'solid', //   เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: '000000'
            } //   สีพื้นหลังดำ (Black)
          }
          worksheet1[cell].s.font = {
            color: {
              rgb: 'FFFFFF'
            }, //   สีข้อความเป็นสีขาว (White)
            bold: true //   ทำให้ตัวอักษรหนา
          }
        }
        // //   ค้นหาแถวสุดท้ายที่มีข้อมูล
        // const lastRowWithData = Math.max(
        //   ...Object.keys(worksheet1)
        //     .map((c) => parseInt(c.replace(/[^0-9]/g, ''), 10))
        //     .filter((n) => !isNaN(n)),
        // );

        //   ตั้งค่าขอบเขต (Border) สำหรับทุกเซลล์ตั้งแต่แถวที่ 5 เป็นต้นไป
        if (rowNumber >= 5) {
          worksheet1[cell].s = worksheet1[cell].s || {}
          worksheet1[cell].s.border = worksheet1[cell].s.border || {}

          //   ใส่เส้นแนวตั้ง (ทุกแถว)
          worksheet1[cell].s.border.left = { style: 'thin' }
          worksheet1[cell].s.border.right = { style: 'thin' }

          //   ใส่เส้นแนวนอนเฉพาะแถวสุดท้ายที่มีข้อมูล
          if (rowNumber === lastRowWithData) {
            worksheet1[cell].s.border.bottom = {
              style: 'thin'
            }
          }
        }
      }
    })

    // http://10.100.101.15:8010/master/upload-template-for-shipper/gen-excel-template
    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    })

    // ส่ง buffer กลับไปเพื่อให้ controller สามารถใช้งานต่อไปได้
    return excelBuffer
  }

  async genExcelTemplateFinal(payload: any) {
    let { todayStart, todayEnd, weeklyPrev7, contract_code_name, shipper_code, eodApi } = payload

    // ***************************

    let eodData = eodApi.flatMap((e: any) => {
      return [[e?.zone || '', e?.area || '', e?.point || '', e?.unit || '', e?.entry_exit || '', ...Array(weeklyPrev7.length).fill('')]]
    })
    console.log('eodData : ', eodData);
    const data = [
      [], // Row 0
      ['SHIPPER ID', 'CONTRACT CODE'], // Row 1
      [`${shipper_code}`, `${contract_code_name}`], // Row 2
      [...headAllo, ...weeklyPrev7], // Row 3
      ...eodData
    ]

    const excelBuffer = await this.componentGenExcelAllocation(data, [], [], 'Allocation Review')

    // ส่ง buffer กลับไปเพื่อให้ controller สามารถใช้งานต่อไปได้
    return {
      excelBuffer,
      nameFile: `Allocation_Review`
    }
  }

  // MMSCFD
  // Only MMBTU/D unit is allowed, other units ignored.
  async uploadFile(grpcTransform: any, file: any, userId: any, req: any, isSaveByIgnoreWaring: boolean) {
    const dataStartAtRow = 5
    const now = getTodayNowAdd7()

    const createByOnce = await this.createByOnce(userId)

    const allocationManage = await this.prisma.allocation_management.findMany({
      where: {
        allocation_status_id: 3
      }
    })

    const convertSheet = JSON.parse(grpcTransform?.jsonDataMultiSheet) || null
    const sheet = convertSheet?.find((f: any) => f?.sheet === 'Allocation Review')?.data || []
    const shipperIdSheet = sheet[1]['0']
    const contractCodeSheet = sheet[1]['1']
    const headSheet = sheet[2]
    if (!headSheet || Object.keys(headSheet).length < 5 || !isMatch(headSheet['0'], 'Zone') || !isMatch(headSheet['1'], 'Area') || !isMatch(headSheet['2'], 'POINT_ID') || !isMatch(headSheet['3'], 'Unit') || !isMatch(headSheet['4'], 'Entry_Exit')) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: 'Missing required columns, Please check the file structure.',
          error: 'Missing required columns, Please check the file structure.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const lastKey = Math.max(...Object.keys(headSheet).map(Number))
    const resultKeyEnd = Object.keys(headSheet)
      .filter((key) => Number(key) >= 5)
      .reduce(
        (acc, key) => {
          acc[key] = headSheet[key]
          return acc
        },
        {} as Record<string, string>
      )

    console.log('resultKeyEnd : ', resultKeyEnd)
    const resultDateKey = Object.entries(resultKeyEnd).map(([key, date]) => ({
      key: Number(key),
      date
    }))


    const numericKeys = Object.keys(headSheet)?.map(Number)?.filter((key) => !Number.isNaN(key))?.sort((a, b) => a - b);
    const maxKey = Math.max(...numericKeys);
    const missingKeys = Array.from(
      { length: maxKey + 1 },
      (_, index) => index
    )?.filter((key) => !numericKeys?.includes(key));
    if(missingKeys?.length > 0){
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Null is Invalid Gas Day Format` // https://app.clickup.com/t/9018502823/86eub6day
        },
        HttpStatus.BAD_REQUEST
      )
    }

    let validateList = []
    let minDate: dayjs.Dayjs = dayjs()
    let maxDate: dayjs.Dayjs = dayjs()
    const dateArr = resultDateKey?.map((e: any) => {
      const eDate = dayjs(e?.date?.trim(), 'DD/MM/YYYY')
      if (!eDate.isValid()) {
        validateList.push(`${e?.date} is invalid gas day format.`)
      } else {
        if (minDate) {
          minDate = eDate.isBefore(minDate) ? eDate : minDate
        } else {
          minDate = eDate
        }

        if (maxDate) {
          maxDate = eDate.isAfter(maxDate) ? eDate : maxDate
        } else {
          maxDate = eDate
        }
      }
      return e?.date
    })

    // console.log('resultDateKey : ', resultDateKey);
    // console.log('dateArr : ', dateArr);
    

    const systemParameter: systemParameterWithRelations[] = await this.prisma.system_parameter.findMany({
      where: {
        system_parameter: {
          id: {
            in: [ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW, ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW_DUPLICATE]
          }
        },
        AND: [
          {
            start_date: {
              lte: maxDate?.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: minDate?.toDate()
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      ...systemParameterPopulate
    })

    // 3 เช็ค วัน ซ้ำ
    const hasDuplicate = new Set(dateArr).size !== dateArr.length
    if (!!hasDuplicate) {
      validateList.push('Date should not overlap.')
    }
    // 4 max วัน ไม่เกิน 31
    if (dateArr.length >= 31) {
      validateList.push('Date should not over max 31 day.')
    }

    // 5 -> lastKey 11
    const valueSheet = sheet.slice(3)

    if (validateList.length > 0) {
      const message = validateList.join('<br/>')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: message,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const allocationCheck = await this.prisma.allocation_management.findMany({
      where: {
        gas_day: {
          gte: minDate?.toDate(),
          lte: maxDate?.toDate()
        },
        contract_code_text: contractCodeSheet
      }
    })

    const { min: start_date, max: end_date } = this.getMinMaxDatesFromArray(dateArr)
    // const start_date = '2025-01-01';
    // const end_date = '2025-02-28';
    const evidenApiAllocationEod = await this.evidenApiAllocationEod({
      start_date: dayjs(start_date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
      end_date: dayjs(end_date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
      skip: 0,
      limit: 1000
    })

    // Extract gas days and generate date array
    const dateArray = extractAndGenerateDateArray(evidenApiAllocationEod)

    // Build active data for all dates
    const activeData = await buildActiveDataForDates(dateArray, this.prisma)

    const newEOD = evidenApiAllocationEod.flatMap((fm: any) => {
      const { data: data1, ...fmD } = fm

      const nData = data1?.flatMap((dFm: any) => {
        const { data: data2, ...fmD2 } = dFm
        const nData2 = data2.map((dFm2: any) => {
          return {
            ...fmD,
            ...fmD2,
            ...dFm2
          }
        })

        return [...nData2]
      })

      return [...nData]
    })
    const resultEodLast1: any = Object.values(
      newEOD.reduce((acc, curr) => {
        const key = `${curr.gas_day}| ${curr.shipper}| ${curr.contract}| ${curr.point}| ${curr.entry_exit}| ${curr.area}| ${curr.zone} `
        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )

    const eodApi = resultEodLast1.filter((f: any) => {
      return f?.contract === contractCodeSheet && f?.shipper === shipperIdSheet
    })

    // 2 s,c ใน วันมีไหม
    const checkGasdayShipperContractCk = eodApi?.find((f: any) => {
      return shipperIdSheet && f?.contract && contractCodeSheet
    })
    

    if (!!!checkGasdayShipperContractCk) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          // error: `Date is not match`,
          error: `Contract Code & Shipper does not match`
          // error: `${ logErr.map((e: any) => e).join(',') } `,
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const checkGasdayShipperContract = eodApi?.find((f: any) => {
      return dateArr.includes(dayjs(f?.gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY')) && f?.shipper && shipperIdSheet && f?.contract && contractCodeSheet
    })
    if (!!!checkGasdayShipperContract) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Date is not match`
          // error: `Contract Code && Shipper does not match`,
          // error: `${ logErr.map((e: any) => e).join(',') } `,
        },
        HttpStatus.BAD_REQUEST
      )
    }

    let logWarning: any = []
    let dataUseDB: any = []
    let warningArr: any = []
    // warning

    // ดึง
    // 1 MMBTU/D
    const checkNotMMBTUD = valueSheet?.find((f: any) => f?.['3'] !== 'MMBTU/D')

    if (checkNotMMBTUD) {
      warningArr.push('Only MMBTU/D unit is allowed, other units ignored.')
    }

    function numberToExcelColumn(col: number): string {
      let result = ''
      let n = col

      while (n > 0) {
        n--
        result = String.fromCharCode(65 + (n % 26)) + result
        n = Math.floor(n / 26)
      }

      return result
    }
    // 5 เช็ค ข้อมูลใน row ว่ามีตรงไหม วันไหนไม่มี warning
    for (let i = 0; i < valueSheet.length; i++) {
      const zone = valueSheet[i]['0'] || ''
      const area = valueSheet[i]['1'] || ''
      const point = valueSheet[i]['2'] || ''
      const unit = valueSheet[i]['3'] || ''
      const entry_exit = valueSheet[i]['4'] ? valueSheet[i]['4']?.toUpperCase() : ''

      if (unit != 'MMBTU/D') {
        continue
      }

      const resultDateValue = Object.entries(valueSheet[i])
        .filter(([key]) => {
          const numKey = parseInt(key, 10)
          if(numKey >= dataStartAtRow){
            if(numKey <= lastKey){
              return true
            }
            else{
              warningArr.push(`Missing or invalid Gas Day in Column ${numberToExcelColumn(numKey + 1)}; not saved.`)
              return false
            }
          }
          return false
        })
        .map(([key, value]) => ({
          key,
          value
        }))
      // console.log('resultDateValue : ', resultDateValue?.length);
      // console.log('Object.entries(valueSheet[i]) : ', Object.entries(valueSheet[i]));
      // console.log('Object.entries(valueSheet[i]) : ', Object.entries(valueSheet[i])?.length - 5);
      // if (Object.entries(valueSheet[i])?.length - 5 !== resultDateValue?.length) {
      //   warningArr.push(`Missing or invalid Gas Day in Column ${numberToExcelColumn(Object.entries(valueSheet[i])?.length)}; not saved.`)
      // }
      if (resultDateValue.length === 0) continue
      for (let iDate = 0; iDate < resultDateValue.length; iDate++) {
        const dateConvertKey = resultDateKey?.find((f: any) => {
          return f?.key === Number(resultDateValue[iDate]['key'])
        })

        const currentDate = dayjs(dateConvertKey?.date, 'DD/MM/YYYY')
        const activeSystemParameter = systemParameter.find((parameter) => parameter.start_date <= currentDate.toDate() && (parameter.end_date >= currentDate.toDate() || parameter.end_date === null))
        const numberOfDaysCanReviewAfter = parseToNumber(activeSystemParameter?.value)
        if (numberOfDaysCanReviewAfter != null) {
          const canReviewAfterDate = now.subtract(numberOfDaysCanReviewAfter, 'day')
          if (currentDate.isBefore(canReviewAfterDate)) {
            const warningMessage = `Date ${dateConvertKey?.date} is before the can review date ${canReviewAfterDate.format('DD/MM/YYYY')} , not saved.`
            if (!warningArr.includes(warningMessage)) {
              warningArr.push(warningMessage)
            }
            continue
          }
        }
        const activeDataForDate = activeData.find((ad) => getTodayNowYYYYMMDDDfaultAdd7(ad.date).format('DD/MM/YYYY') === dateConvertKey?.date)
        const findNomMaster = activeDataForDate?.activeNominationPoints?.find((f: any) => f?.nomination_point === point)
        const activeConceptPoint = activeDataForDate?.activeConceptPoints?.find((f: any) => f?.concept_point === point)
        if (findNomMaster) {
          let isWarning = false
          if (!isMatch(findNomMaster?.zone?.name, zone)) {
            warningArr.push(`Invalid Zone on ${dateConvertKey?.date} in row ${i + dataStartAtRow}; not saved.`)
            isWarning = true
          }
          if (!isMatch(findNomMaster?.area?.name, area)) {
            warningArr.push(`Invalid Area on ${dateConvertKey?.date} in row ${i + dataStartAtRow}; not saved.`)
            isWarning = true
          }
          if (!isMatch(findNomMaster?.entry_exit?.name, entry_exit)) {
            warningArr.push(`Invalid Entry / Exit on ${dateConvertKey?.date} in row ${i + dataStartAtRow}; not saved.`)
            isWarning = true
          }
          if (isWarning) {
            continue
          }
        } else if (!activeConceptPoint) {
          // warningArr.push(`Invalid POINT_ID on ${dateConvertKey?.date} in row ${i + dataStartAtRow}; not saved.`)

          warningArr.push(`Missing or invalid Gas Day in Column ${numberToExcelColumn(5 + 1 + iDate)}; not saved.`)
          continue
        }
        const dateValue = resultDateValue[iDate]['value']
        const eodApiCheck = eodApi?.find((f: any) => {
          return f?.zone === zone && f?.area === area && f?.point === point && f?.entry_exit === entry_exit && dayjs(f?.gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY') === dateConvertKey?.date
        })

        const findAllocationAccept = allocationManage?.find((f: any) => {
          return f?.point_text === eodApiCheck?.point && f?.gas_day_text === eodApiCheck?.gas_day && f?.zone_text === eodApiCheck?.zone && f?.area_text === eodApiCheck?.area && f?.entry_exit_text === eodApiCheck?.entry_exit
        })

        if (eodApiCheck && (findNomMaster || activeConceptPoint) && !findAllocationAccept) {
          console.log('[INFO] uploadFile: มี')
          const notData = {
            shipperIdSheet,
            contractCodeSheet,
            zone,
            area,
            point,
            unit,
            entry_exit,
            gas_day: dayjs(dateConvertKey?.date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
            value: dateValue,
            system_allocation: eodApiCheck.value,
            previous_value: eodApiCheck.previous_value
          }
          dataUseDB.push(notData)
        } else {
          if (eodApiCheck && (findNomMaster || activeConceptPoint) && findAllocationAccept) {
            // https://app.clickup.com/t/86eu48dnq
            warningArr.push(`Point ${eodApiCheck?.point} on ${dateConvertKey?.date} has already been accepted and will not be imported`)
          } else if (eodApiCheck && !findNomMaster && !activeConceptPoint) {
            warningArr.push(`Point ${eodApiCheck?.point} is inactive on ${dateConvertKey?.date} , valid rows saved.`)
          } else {
            const notData = {
              shipperIdSheet,
              contractCodeSheet,
              zone,
              area,
              point,
              unit: valueSheet[i]['3'],
              entry_exit,
              gas_day: dayjs(dateConvertKey?.date, 'DD/MM/YYYY').format('YYYY-MM-DD'),
              value: dateValue,
              note: 'not have eviden'
            }
            logWarning.push(notData)
          }
        }
      }
    }

    let dataDb = []
    if (dataUseDB.length > 0) {
      for (let i = 0; i < dataUseDB.length; i++) {
        const findAllo = allocationCheck?.find((f: any) => {
          return (
            f?.zone_text === dataUseDB[i]?.zone &&
            f?.area_text === dataUseDB[i]?.area &&
            f?.point_text === dataUseDB[i]?.point &&
            f?.entry_exit_text === dataUseDB[i]?.entry_exit &&
            f?.shipper_name_text === dataUseDB[i]?.shipperIdSheet &&
            f?.contract_code_text === dataUseDB[i]?.contractCodeSheet &&
            f?.gas_day_text === dataUseDB[i]?.gas_day
          )
        })
        if (findAllo) {
          if (findAllo?.allocation_status_id === 3) {
            // accept ห้าม update ให้ warning
            const notData = {
              shipperIdSheet,
              contractCodeSheet,
              zone: dataUseDB[i]?.zone,
              area: dataUseDB[i]?.area,
              point: dataUseDB[i]?.point,
              unit: dataUseDB[i]?.unit,
              entry_exit: dataUseDB[i]?.entry_exit,
              gas_day: dataUseDB[i]?.gas_day,
              value: dataUseDB[i]?.value,
              note: 'not have update status accept'
            }
            logWarning.push(notData)
          } else {
            // update status 2
            const notData = {
              id: findAllo?.id,
              shipperIdSheet,
              contractCodeSheet,
              zone: dataUseDB[i]?.zone,
              area: dataUseDB[i]?.area,
              point: dataUseDB[i]?.point,
              unit: dataUseDB[i]?.unit,
              entry_exit: dataUseDB[i]?.entry_exit,
              gas_day: dataUseDB[i]?.gas_day,
              value: dataUseDB[i]?.value,
              note: 'update',
              system_allocation: dataUseDB[i]?.system_allocation,
              previous_value: dataUseDB[i]?.previous_value
            }
            dataDb.push(notData)
          }
        } else {
          // ไม่มี ให้ create & update status 2
          const notData = {
            id: null,
            shipperIdSheet,
            contractCodeSheet,
            zone: dataUseDB[i]?.zone,
            area: dataUseDB[i]?.area,
            point: dataUseDB[i]?.point,
            unit: dataUseDB[i]?.unit,
            entry_exit: dataUseDB[i]?.entry_exit,
            gas_day: dataUseDB[i]?.gas_day,
            value: dataUseDB[i]?.value,
            note: 'create'
          }
          dataDb.push(notData)
        }
      }
    }

    if (warningArr.length == 0 || isSaveByIgnoreWaring) {
      const nowAt = getTodayNowAdd7()
      const toDayReviewCodeStartWith = `${nowAt.tz('Asia/Bangkok').format('YYYYMMDD')}-ALP-`

      // const allocationCount = await this.prisma.allocation_management.count({
      //   where: {
      //     review_code: {
      //       startsWith: toDayReviewCodeStartWith,
      //     },
      //   },
      // });

      const rows = await this.prisma.allocation_management.groupBy({
        by: ['review_code'],
        where: {
          review_code: {
            startsWith: toDayReviewCodeStartWith,
            not: null
          }
        }
      })

      const allocationCount = rows.length

      for (let i = 0; i < dataDb.length; i++) {
        if (dataDb[i]?.note === 'create') {
          // create

          const create = await this.prisma.allocation_management.create({
            data: {
              allocation_status_id: 1,
              shipper_name_text: dataDb[i]?.shipperIdSheet,
              gas_day_text: dataDb[i]?.gas_day,
              contract_code_text: dataDb[i]?.contractCodeSheet,
              point_text: dataDb[i]?.point,
              entry_exit_text: dataDb[i]?.entry_exit,
              area_text: dataDb[i]?.area,
              zone_text: dataDb[i]?.zone,

              gas_day: getTodayNowYYYYMMDDDfaultAdd7(dataDb[i]?.gas_day + 'T00:00:00Z').toDate(),
              create_date: getTodayNowAdd7().toDate(),
              create_date_num: getTodayNowAdd7().unix(),
              create_by: Number(userId)
            }
          })

          const reviewCodeNum = `${toDayReviewCodeStartWith}${(allocationCount > 0 ? allocationCount + 1 : 1).toString().padStart(4, '0')} `
          const shipperAllocationReviewCreate = await this.prisma.allocation_management_shipper_review.create({
            data: {
              allocation_status_id: dataDb[i]?.allocation_status_id,
              allocation_management_id: create?.id,
              shipper_allocation_review: dataDb[i]?.value.replace(/,/g, ''),
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by: Number(userId)
            }
          })
          const update = await this.prisma.allocation_management.updateMany({
            where: {
              id: create?.id ?? -1
            },
            data: {
              review_code: reviewCodeNum,
              allocation_status_id: 2
            }
          })

          // history
          const findAM = await this.prisma.allocation_management.findFirst({
            where: {
              id: create?.id
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
                // orderBy: { id: "desc" }
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
          await this.writeReq(req, `allocation - review`, 'shipper-allocation-review', {
            create: createByOnce,
            shipper_allocation_review: dataDb[i]?.value.replace(/,/g, '') || null,
            systemAllocation: dataDb[i]?.system_allocation || null,
            // intradaySystem: body?.row_data?.intradaySystem || null,
            previousAllocationTPAforReview: dataDb[i]?.previous_value || null,
            ...findAM
          })
        } else {
          const shipperAllocationReviewCreate = await this.prisma.allocation_management_shipper_review.create({
            data: {
              allocation_status_id: 2,
              allocation_management_id: dataDb[i]?.id,
              shipper_allocation_review: dataDb[i]?.value.replace(/,/g, ''),
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by: Number(userId)
            }
          })

          //     const update = await this.prisma.allocation_management.updateMany({
          //   where: {
          //     id: create?.id,
          //   },
          //   data: {
          //     review_code: reviewCodeNum,
          //     allocation_status_id: 2,
          //   },
          // });

          const findAMReview = await this.prisma.allocation_management.findFirst({
            where: {
              id: dataDb[i]?.id
            }
          })
          if (!findAMReview?.review_code) {
            const reviewCodeNum = `${toDayReviewCodeStartWith}${(allocationCount > 0 ? allocationCount + 1 : 1).toString().padStart(4, '0')} `
            const update = await this.prisma.allocation_management.updateMany({
              where: {
                id: dataDb[i]?.id ?? -1
              },
              data: {
                review_code: reviewCodeNum,
                allocation_status_id: 2
              }
            })
          } else {
            const update = await this.prisma.allocation_management.updateMany({
              where: {
                id: dataDb[i]?.id ?? -1
              },
              data: {
                // review_code: reviewCodeNum,
                allocation_status_id: 2
              }
            })
          }

          const findAM = await this.prisma.allocation_management.findFirst({
            where: {
              id: dataDb[i]?.id
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
                // orderBy: { id: "desc" }
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
          await this.writeReq(req, `allocation - review`, 'shipper-allocation-review', {
            create: createByOnce,
            shipper_allocation_review: dataDb[i]?.value.replace(/,/g, '') || null,
            systemAllocation: dataDb[i]?.system_allocation || null,
            // intradaySystem: body?.row_data?.intradaySystem || null,
            previousAllocationTPAforReview: dataDb[i]?.previous_value || null,
            ...findAM
          })
        }
      }
      warningArr = []
    }

    // success
    // 7 update status 2 ที่สำเร็จ
    // value
    const valueSheetMMBTU = valueSheet?.filter((f: any) => f?.['3'] === 'MMBTU/D')

    return {
      warning: [...new Set(warningArr)],
      data: {
        headSheet,
        eodApi,
        resultDateKey,
        valueSheetMMBTU,
        dateArr,
        logWarning,
        // dataUseDB,
        dataDb
      }
    }
  }

  async allocationReportViewGet(payload: any, userId: any) {
    console.time('[RUNTIME] allocationReportViewGet')
    const { start_date, end_date, skip, limit } = payload

    // *Input validation
    const startDate = start_date ? getTodayStartAdd7(start_date) : null
    const endDate = end_date ? getTodayEndAdd7(end_date) : null

    if (!startDate?.isValid() || !endDate?.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (endDate.isBefore(startDate)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    // *Query Necessary Data in parallel
    console.time('[RUNTIME] allocationReportViewGet.Query')
    const [entryExitMaster, allocationReportView, evidenApi] = await Promise.all([this.repo.getEntryExit(), this.repo.getAllocationReportView(startDate.toDate(), endDate.toDate()), this.repo.getEvidenApiAllocationReportNom(startDate, endDate, true)])
    console.timeEnd('[RUNTIME] allocationReportViewGet.Query')

    console.log('[INFO] allocationReportViewGet: evidenApi?.length', evidenApi?.length || 0)

    // *Process Response Eviden API – flatten
    const faltedEvidenApi = await flatEvidenApiResponse(evidenApi, this.prisma)

    // *Choose latest execute_timestamp per key
    console.time('[RUNTIME] allocationReportViewGet.getLastedExecute')
    const latestByKeyMap = faltedEvidenApi.reduce((acc: Record<string, any>, curr: any) => {
      const key = `${curr.gas_day}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
      const existing = acc[key]

      if (!existing || existing.execute_timestamp < curr.execute_timestamp) {
        acc[key] = curr
      }
      return acc
    }, {})

    const result: any[] = Object.values(latestByKeyMap)
    console.timeEnd('[RUNTIME] allocationReportViewGet.getLastedExecute')
    console.log('[INFO] allocationReportViewGet: result count =', result.length)

    // *Build lookup maps to avoid O(N*M) .find() in loops

    // entry_exit lookup (uppercase)
    console.time('[RUNTIME] allocationReportViewGet.buildLookup')
    const entryExitMap = new Map<string, any>(entryExitMaster.map((e: any) => [e?.name?.toUpperCase(), e]))

    // allocation_report_view lookup by composite key
    const allocationReportMap = new Map<string, any>(allocationReportView.map((f: any) => [`${f.gas_day_text}|${f.shipper_name_text}|${f.contract_code_text}|${f.point_text}|${f.entry_exit_text}|${f.area_text}|${f.zone_text}`, f]))
    console.timeEnd('[RUNTIME] allocationReportViewGet.buildLookup')

    // *Build response – purely synchronous (no need Promise.all)
    console.time('[RUNTIME] allocationReportViewGet.buildResponse')
    const response = result.map((allo: any) => {
      const values = allo.values ?? []

      const contractCapacity = values.find((f: any) => f?.tag === 'contractCapacity')?.value ?? null
      const nominationValue = values.find((f: any) => f?.tag === 'nominatedValue')?.value ?? null
      const allocatedValue = values.find((f: any) => f?.tag === 'allocatedValue')?.value ?? null

      if (allocatedValue === null || allocatedValue === undefined) {
        console.log('[WARN] allocationReportViewGet: not found allocate value', allo?.gas_day, ' ', allo?.shipper, ' ', allo?.contract, ' ', allo?.point)
      }

      const entryExitKey = allo.entry_exit?.toUpperCase()
      const entry_exit_obj = entryExitMap.get(entryExitKey)

      const allocationKey = `${allo.gas_day}|${allo.shipper}|${allo.contract}|${allo.point}|${allo.entry_exit}|${allo.area}|${allo.zone}`
      const findAllocationReport = allocationReportMap.get(allocationKey)

      // keep same return shape as before
      return {
        publication: true,
        id: findAllocationReport?.id,
        ...allo,
        contractCapacity,
        nominationValue,
        allocatedValue,
        entry_exit_obj,
        findAllocationReport
      }
    })
    console.timeEnd('[RUNTIME] allocationReportViewGet.buildResponse')

    console.timeEnd('[RUNTIME] allocationReportViewGet')
    return response
  }

  async allocationMonthlyGetData(payload: any, userId: any) {
    console.time('[RUNTIME] allocationMonthlyGetData')
    const { start_date, end_date, skip, limit, shipperId, month, year, version, contractCode } = payload

    const allocationReportViewGet = await this.allocationReportViewGet(
      {
        start_date,
        end_date,
        skip,
        limit
      },
      userId
    )

    const shipperIdFilter = !!shipperId
      ? allocationReportViewGet?.filter((f: any) => {
        return f?.shipper === shipperId
      })
      : allocationReportViewGet
    const monthFilter = !!month
      ? shipperIdFilter?.filter((f: any) => {
        return dayjs(f?.gas_day, 'YYYY-MM-DD').format('MM') === month
      })
      : shipperIdFilter
    const versionFilter = !!version
      ? monthFilter?.filter((f: any) => {
        return f?.execute_timestamp === Number(version)
      })
      : monthFilter
    const contractCodeFilter =
      !!contractCode && contractCode !== 'Summary'
        ? versionFilter?.filter((f: any) => {
          return f?.contract === contractCode
        })
        : versionFilter
    console.log('[INFO] allocationMonthlyGetData: contractCodeFilter.length', contractCodeFilter?.length || 0)
    console.timeEnd('[RUNTIME] allocationMonthlyGetData')
    return contractCodeFilter
  }

  // ...
  async allocationMonthlyReport(payload: any, userId: any, ext?: any) {
    console.time('[RUNTIME] allocationMonthlyReport')
    const { start_date, end_date, skip, limit, shipperId, month, year, version, contractCode } = payload
    // * Prepare Data
    const contractCodeFilter = await this.allocationMonthlyGetData(payload, userId)
    const type_report = !!contractCode && contractCode !== 'Summary' ? contractCode : 'Summary'
    const dates = generateDatesInMonth(Number(year), Number(month))

    // *Process Data
    const groupByContract = (array: any[]) => {
      const grouped: Record<string, any> = {}

      for (const item of array) {
        const contractKey = item.contract
        if (!grouped[contractKey]) {
          grouped[contractKey] = {
            contract: contractKey, // กำหนดค่า contract
            shipperId: item?.group?.id_name,
            shipperName: item?.group?.name,
            data: [] // เตรียม array ว่างไว้
          }
        }
        grouped[contractKey].data.push(item) // push ข้อมูลเข้า array
      }

      const resultGroupByContract: any = Object.values(grouped)
      return resultGroupByContract
    }

    const resultG =
      !!contractCode && contractCode !== 'Summary'
        ? groupByContract(contractCodeFilter)
        : [
          ...groupByContract(contractCodeFilter),
          {
            contract: 'Summary',
            data: contractCodeFilter
          }
        ]
    console.log('[INFO] allocationMonthlyReport: resultG?.length', resultG?.length || 0)

    const resultGArea = resultG?.map((e: any) => {
      const grouped: Record<string, any> = {}
      for (const item of e['data']) {
        const areaKey = item.area
        if (!grouped[areaKey]) {
          grouped[areaKey] = {
            area: areaKey, // กำหนดค่า contract
            data: [] // เตรียม array ว่างไว้
          }
        }
        grouped[areaKey].data.push(item) // push ข้อมูลเข้า array
      }

      const resultGroupByArea: any = Object.values(grouped)

      const dateRow = resultGroupByArea.map((dR: any) => {
        const dateRowData = dR['data'].map((dRData: any) => {
          return {
            gas_day: dRData['gas_day'],
            point: dRData['point'],
            customer_type: dRData['customer_type'],
            value: dRData['allocatedValue']
          }
        })
        const combineGroupedValues = (data: any[]) => {
          const grouped: Record<string, any> = {}

          data.forEach(({ gas_day, point, customer_type, value }) => {
            const key = `${gas_day}|${point}|${customer_type}`
            if (!grouped[key]) {
              grouped[key] = {
                gas_day,
                point,
                customer_type,
                value
              }
            } else {
              grouped[key].value += value
            }
          })

          return Object.values(grouped)
        }
        const resultCB = combineGroupedValues(dateRowData)

        function groupByPointAndCustomerType(resa: any[], headDate: string[]) {
          const grouped: Record<
            string,
            {
              point: string
              customer_type: string
              data: {
                date: string
                value: number
              }[]
            }
          > = {}

          for (const item of resa) {
            const key = `${item.point}|${item.customer_type}`

            if (!grouped[key]) {
              grouped[key] = {
                point: item.point,
                customer_type: item.customer_type,
                data: []
              }
            }
          }

          // สร้าง data array สำหรับแต่ละกลุ่ม โดยไล่ตาม headDate
          for (const key in grouped) {
            const [point, customer_type] = key.split('|')
            const valuesMap = resa
              .filter((r) => r.point === point && r.customer_type === customer_type)
              .reduce((acc: Record<string, number>, curr) => {
                acc[curr.gas_day] = (acc[curr.gas_day] || 0) + curr.value
                return acc
              }, {})

            grouped[key].data = headDate.map((date) => ({
              date,
              value: valuesMap[date] ?? 0
            }))
          }

          return Object.values(grouped)
        }
        const resultCBDate = groupByPointAndCustomerType(resultCB, dates)

        function sumByDate(at: any[]) {
          const dateSumMap: Record<string, number> = {}

          for (const item of at) {
            if (Array.isArray(item.data)) {
              for (const entry of item.data) {
                if (!dateSumMap[entry.date]) {
                  dateSumMap[entry.date] = 0
                }
                dateSumMap[entry.date] += entry.value
              }
            }
          }

          // แปลงกลับเป็น array พร้อมเรียงวัน
          const result = Object.keys(dateSumMap)
            .sort((a, b) => (a > b ? 1 : -1)) // เรียงวันที่
            .map((date) => ({
              date,
              value: dateSumMap[date]
            }))

          return result
        }
        const resultTotal = sumByDate(resultCBDate)

        return {
          ...dR,
          total: resultTotal,
          data: resultCBDate
        }
      })

      return {
        ...e,
        data: dateRow
      }
    })

    console.log('[INFO] allocationMonthlyReport: resultGArea?.length', resultGArea?.length || 0)
    console.timeEnd('[RUNTIME] allocationMonthlyReport')
    const areaShipperData_ =
      (resultGArea?.[resultGArea?.length - 1]?.data || [])?.map((e: any) => ({
        area: e?.area
      })) || []
    const areaShipperData = (areaShipperData_ || [])?.map((e: any) => {
      const shipperArr_ = resultGArea
        ?.filter((f: any) => {
          if (f?.shipperId && f?.shipperName) {
            return f?.data?.find((f_: any) => f_?.area === e?.area)
          } else {
            return false
          }
        })
        ?.map((eShipper: any) => {
          return {
            shipperId: eShipper?.shipperId,
            shipperName: eShipper?.shipperName
          }
        })
      const shipperArrSet = [...new Set(shipperArr_.map((o: any) => JSON.stringify(o)))].map((s: any) => JSON.parse(s))
      const shipperArr = shipperArrSet?.map((s_: any) => {
        const pointArr_ = resultGArea
          ?.filter((f: any) => {
            if (f?.shipperId && f?.shipperName) {
              return (f?.data ?? []).some((d: any) => d?.area === e?.area) && f?.shipperId === s_?.shipperId && f?.shipperName === s_?.shipperName
            } else {
              return false
            }
          })
          ?.map((aD: any) => (aD?.data ?? [])?.filter((d: any) => d?.area === e?.area))
          ?.flat()
          ?.map((m: any) => m?.data)
          ?.flat()

        function mergePointCustomer(arr: any) {
          const groupMap = new Map()

          for (const item of arr ?? []) {
            const point = item?.point ?? ''
            const customer_type = item?.customer_type ?? ''
            const key = `${point}||${customer_type}`

            if (!groupMap.has(key)) {
              groupMap.set(key, {
                point,
                customer_type,
                dateMap: new Map()
              })
            }

            const g = groupMap.get(key)
            for (const d of item?.data ?? []) {
              const date = d?.date
              if (!date) continue

              const val = Number(d?.value ?? 0) || 0
              g.dateMap.set(date, (g.dateMap.get(date) ?? 0) + val)
            }
          }

          return [...groupMap.values()].map((g) => ({
            point: g.point,
            customer_type: g.customer_type,
            data: [...g.dateMap.entries()]
              .map(([date, value]) => ({
                date,
                value
              }))
              .sort((a, b) => a.date.localeCompare(b.date))
          }))
        }

        const pointArr = mergePointCustomer(pointArr_)

        return {
          ...s_,
          data: pointArr || [],
          total:
            dates?.map((h: any) => {
              const date_ = pointArr?.map((d_: any) => d_?.data)?.flat()
              const value_ = (date_?.filter((f_: any) => f_?.date === h) || [])?.reduce((accumulator, currentValue) => accumulator + Number(currentValue?.value ?? 0), 0)

              return {
                date: h,
                value: value_ || 0
              }
            }) || []
        }
      })

      return {
        ...e,
        shipperData: shipperArr || []
      }
    })

    return {
      headDate: dates,
      areaShipperData: areaShipperData,
      data: resultGArea,
      typeReport: type_report
    }
  }

  async allocationMonthlyVersionExe(payload: any, userId: any) {
    const { start_date, end_date, skip, limit, shipperId, month, year, version, contractCode } = payload

    const contractCodeFilter = await this.allocationMonthlyGetData(payload, userId)

    // return contractCodeFilter

    // Group data by shipper, then get the execute_timestamp for each shipper
    const groupedData = contractCodeFilter.reduce((acc: any, item: any) => {
      const key = `${item.shipper} `

      if (!acc[key]) {
        acc[key] = {
          shipper: item.shipper,
          group: item.group,
          data: []
        }
      }

      if (!acc[key].data.some((f: any) => f.request_number === item.request_number)) {
        acc[key].data.push({
          request_number: item.request_number,
          execute_timestamp: item.execute_timestamp
        })
      }

      return acc
    }, {})

    return Object.values(groupedData)
  }
  // shipperId
  async allocationMonthlyReportApproved(payload: any, userId: any, ext?: any) {
    const allocationMonthlyReport = await this.allocationMonthlyReport(payload, userId, ext)

    function getMonthNameFromNumber(monthNumber: string) {
      const month = dayjs(`2025-${monthNumber}-01`) // ใส่วันที่สมมติ เช่น 1 วัน เพื่อให้ dayjs สร้าง
      return month.format('MMMM') // 'MMMM' จะได้ชื่อเดือนเต็ม เช่น June
    }

    const monthText = getMonthNameFromNumber(payload?.month)
    const monthYearFormat = `${monthText} ${payload?.year}`
    const contractCode = !!payload?.contractCode && payload?.contractCode !== 'Summary' ? payload?.contractCode : null
    const typeReport = !!contractCode && contractCode !== 'Summary' ? 'By Contract Code' : 'Summary'

    const newDate = getTodayNowAdd7()

    // const monthStart = newDate.startOf('month').toDate() // วันที่ 1 ของเดือนนี้ เวลา 00:00:00
    // const monthEnd = newDate.endOf('month').toDate() // วันสุดท้ายของเดือนนี้ เวลา 23:59:59

    const monthlyCount = await this.prisma.allocation_monthly_report_approved.count({
      where: {
        // create_date: {
        //   gte: monthStart, // มากกว่าหรือเท่ากับวันที่ 1
        //   lte: monthEnd // น้อยกว่าหรือเท่ากับวันสุดท้าย
        // }
        monthText: {
          equals: monthYearFormat
        }
      }
    })
    const versionCount = monthlyCount > 0 ? monthlyCount + 1 : 1
    const fileRun = `${dayjs(newDate).format('YYYYMMDD')} Monthly Report ${versionCount} (Rev.${versionCount})`
    // const monthlyCountAll = await this.prisma.allocation_monthly_report_approved.count({
    //   where: {}
    // })
    // const version = `V.${monthlyCountAll > 0 ? monthlyCountAll + 1 : 1} `
    const version = `V.${versionCount}`
    // shipperId
    // payload
    const create = await this.prisma.allocation_monthly_report_approved.create({
      data: {
        monthText: monthYearFormat,
        ...(payload?.shipperId && {
          group: {
            connect: {
              id_name: payload?.shipperId
            }
          }
        }),
        contractCode,
        file: fileRun,
        version,
        typeReport,
        jsonData: JSON.stringify(allocationMonthlyReport),
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
      jsonData: JSON.stringify(allocationMonthlyReport)
    }
  }

  async allocationMonthlyReportDownload() {
    const allMonthly = await this.prisma.allocation_monthly_report_approved.findMany({
      where: {},
      include: {
        group: true,
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

  async allocationMonthlyReportDownloadUse(response: any, id: any, userId: any) {
    const allMonthly = await this.prisma.allocation_monthly_report_approved.findFirst({
      where: {
        id: Number(id)
      }
    })

    const dataD = JSON.parse(allMonthly['jsonData'])

    await this.exportFilesService.exportDataToExcelNewMontly(dataD, response, allMonthly['file'], userId, allMonthly)
    // return nAllMonthly
  }

  async curtailmentsAllocation(payload: any, userId: any) {
    const { type } = payload
    const resData = await this.prisma.curtailments_allocation.findMany({
      where: {
        curtailments_allocation_type_id: Number(type)
      },
      include: {
        curtailments_allocation_type: true,
        curtailments_allocation_calc: {
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
      },
      orderBy: {
        id: 'desc'
      }
    })
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const areaMaster = await this.prisma.area.findMany({
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

    const nResData = resData?.map((e: any) => {
      const areaObj = areaMaster?.find((f: any) => {
        return f?.name === e?.area
      })
      const nomination_value = e['curtailments_allocation_calc'].reduce((sum, item) => sum + Number(item['nomination_value']), 0)

      const formatNumberFDecimal = (number: any) => {
        if (isNaN(number)) return number // Handle invalid numbers gracefully

        // Convert number to a fixed 4-decimal format
        const fixedNumber = parseFloat(number).toFixed(4)

        // Add thousand separators
        return fixedNumber.replace(/\B(?=(\d{4})+(?!\d))/g, ',')
      }

      return {
        ...e,
        areaObj,
        nomination_value: nomination_value
      }
    })

    return nResData
  }

  async selectNomination(payload: any, userId: any) {


    const { gasDay, area, ev, nominationPoint, unit, type } = payload
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const gasDayjs = gasDay ? getTodayStartDDMMYYYYAdd7(gasDay).toDate() : todayStart
    const { weekStart: targetWeekStart } = getWeekRange(gasDayjs)
    const { weekEnd: targetWeekEnd } = getWeekRange(gasDayjs) 

    const flagEv = ev === "true" ? true : false

    const hvFromEntryArea = flagEv ? await findHvFromEntryArea({
      prisma: this.prisma,
      targetArea: '',
      gasDate: gasDayjs,
      dataList: [],
    }) : [];
    console.log('hvFromEntryArea : ', hvFromEntryArea);
    // console.log('[east-x3] hvFromEntryArea : ', hvFromEntryArea?.get("east-x3"));

    // const 
    // sumHvMultiplyVi / sumVi

    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

    const areaMaster = await this.prisma.area.findMany({
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
    // console.log('areaMaster : ', areaMaster);
    // console.log('targetWeekStart : ', targetWeekStart);
    // console.log('targetWeekEnd : ', targetWeekEnd);
    const resData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        OR: [
          {
            del_flag: false
          },
          { del_flag: null }
        ],
        query_shipper_nomination_status: {
          id: {
            in: [2, 5]
          }
        },
        gas_day: {
          gte: targetWeekStart,
          lte: targetWeekEnd
        } //!Hot fix
        // id: 47,
        // nomination_type_id: 2,
      },
      include: {
        group: true,
        query_shipper_nomination_status: true,
        contract_code: {
          include: {
            booking_version: {
              include: {
                booking_full_json: true,
                booking_row_json: true,
                booking_full_json_release: true,
                booking_row_json_release: true
              },
              take: 1,
              where: {
                flag_use: true
              },
              orderBy: {
                id: 'desc'
              }
            }
          }
        },
        reserve_balancing_gas_contract: true,
        // submission_comment_query_shipper_nomination_file: true,
        nomination_type: true,
        nomination_version: {
          include: {
            nomination_full_json: true,
            // nomination_full_json_sheet2: true,
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
        // query_shipper_nomination_file_renom: true,
        // query_shipper_nomination_file_url: {
        //   include: {
        //     nomination_version: true,
        //     query_shipper_nomination_status: true,
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
        //     id: 'desc',
        //   },
        // },
        // query_shipper_nomination_file_comment: {
        //   include: {
        //     query_shipper_nomination_type_comment: true,
        //     query_shipper_nomination_status: true,
        //     nomination_version: true,
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
        //     id: 'desc',
        //   },
        // },
      },
      orderBy: {
        id: 'desc'
      }
    })
    // console.log('resData : ', resData);
    const grouped = {}
    for (const curr of resData) {
      const key = `${curr.gas_day}| ${curr.group?.name}| ${curr?.nomination_type?.id} `

      if (!grouped[key]) {
        grouped[key] = {
          gas_day: curr.gas_day,
          shipper_name: curr.group?.name,
          nomination_type: curr?.nomination_type,
          data: []
        }
      }

      grouped[key].data.push({
        ...curr
      })
    }
    // console.log('grouped : ', grouped);
    const resultGroup: any = Object.values(grouped)
    const resultGroupType = resultGroup.map((e: any) => {
      e['data'] = e['data']?.map((eData: any) => {
        eData['nomination_version'] = eData['nomination_version']?.map((eDataNom: any) => {
          eDataNom['nomination_full_json'] = eDataNom['nomination_full_json']?.map((eDataNomJson: any) => {
            eDataNomJson['data_temp'] = JSON.parse(eDataNomJson['data_temp'])
            return {
              ...eDataNomJson
            }
          })
          // eDataNom["nomination_full_json_sheet2"] = eDataNom["nomination_full_json_sheet2"]?.map((eDataNomJson:any) => {
          //   eDataNomJson["data_temp"] = JSON.parse(eDataNomJson["data_temp"])
          //   return { ...eDataNomJson }
          // })
          eDataNom['nomination_row_json'] = eDataNom['nomination_row_json']?.map((eDataNomJson: any) => {
            eDataNomJson['data_temp'] = JSON.parse(eDataNomJson['data_temp'])
            return {
              ...eDataNomJson
            }
          })
          return {
            ...eDataNom
          }
        })
        return {
          ...eData
        }
      })

      const gas_day_text = dayjs(e['gas_day']).format('DD/MM/YYYY')
      const shipper_name = e['shipper_name']
      // const daily = e["data"]?.filter((f:any) => { return f?.nomination_type_id === 1 })
      // const weekly = e["data"]?.filter((f:any) => { return f?.nomination_type_id === 2 })
      // return { shipper_name, gas_day_text, daily, weekly }
      // const daily = e["data"]?.filter((f:any) => { return f?.nomination_type_id === 1 })
      return {
        shipper_name,
        gas_day: gas_day_text,
        gas_day_text,
        dataDW: e['data'],
        nomination_type: e['nomination_type']
      }
    })
    // console.log('resultGroupType : ', resultGroupType);

    const nomFlat = resultGroupType?.flatMap((e: any) => {
      const { dataDW, ...nE } = e
      const nom = dataDW?.map((eD: any) => {
        return {
          ...nE,
          ...eD
        }
      })

      return [...nom]
    })
    // console.log('nomFlat : ', nomFlat);

    const nomJsonRowFlat = nomFlat?.flatMap((e: any) => {
      const { nomination_version, ...nE } = e
      let nomination_version_one = e?.nomination_version[0] || []
      nomination_version_one.nomination_full_json = nomination_version_one.nomination_full_json[0]
      const { nomination_row_json, ...nER } = nomination_version_one

      const nom = nomination_row_json?.map((eD: any) => {
        return {
          contract: nE?.contract_code?.contract_code ?? nE?.reserve_balancing_gas_contract?.res_bal_gas_contract,
          unit: eD['data_temp']['9'],
          point: eD['data_temp']['3'],
          entryExit: eD['data_temp']['10'],
          nomVersionId: nER?.id,
          nomVersionVersion: nER?.version,
          nomVersionFull: nER?.nomination_full_json,
          ...nE,
          ...eD
        }
      })

      return [...nom]
    })
    // console.log('nomJsonRowFlat : ', nomJsonRowFlat);

    const nomData = nomJsonRowFlat?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id === 1
    })
    // console.log('nomData : ', nomData);

    const nomTypeExt = nomData?.flatMap((e: any) => {
      let dataE = []
      if (e['nomination_type_id'] === 2) {
        // weekly
        for (let i = 0; i < daysOfWeek.length; i++) {
          //
          dataE.push({
            ...e,
            total: Number(e['data_temp'][`${14 + i} `]?.trim()?.replace(/,/g, '')) || 0,
            totalType: daysOfWeek[i],
            gasDayUse: e?.nomVersionFull?.data_temp?.headData[`${14 + i} `]
          })
        }
      } else {
        // daily
        dataE.push({
          ...e,
          total: Number(e['data_temp']['38']?.trim()?.replace(/,/g, '')) || 0,
          totalType: 'daily',
          gasDayUse: e?.gas_day_text
        })
      }

      return [...dataE]
    })
    // console.log('nomTypeExt : ', nomTypeExt);

    const nomExt = nomTypeExt?.map((e: any) => {
      const { gasDayUse, contract, shipper_name, zone_text, area_text, unit, point, entryExit, total, totalType, contract_code, reserve_balancing_gas_contract, ...nE } = e
      const entryExitId = entryExit === 'Entry' ? 1 : 2
      const areaObj = areaMaster?.find((f: any) => {
        return f?.name === area_text && f?.entry_exit_id === entryExitId
      })
      return {
        gasDayUse,
        contract,
        shipper_name,
        zone_text,
        area_text,
        unit,
        point,
        entryExit,
        total,
        totalType,
        contract_code,
        reserve_balancing_gas_contract,
        areaObj
      }
    })
    // console.log('nomExt : ', nomExt);
    const pointAll = nomExt
      ?.filter((f: any) => {
        return f?.area_text === area
      })
      ?.map((e: any) => {
        return e?.point
      })
      
      // gasDay, area, nominationPoint, unit, type
      // console.log('pointAll : ', pointAll);
      
      if(flagEv){
      const pointAllNom = await this.prisma.nomination_point.findMany({
        where:{
          nomination_point:{
            in: pointAll
          }
        }
      })
      
      return {
          data: [...new Set(pointAll)],
          nom: pointAllNom || [],
          hvFromEntryArea: hvFromEntryArea
          ? Object.fromEntries(hvFromEntryArea)
          : null,
      }
    }else{
      return [...new Set(pointAll)]
    }
  }

  async curtailmentsAllocationGetMaxCap(payload: any, userId: any) {
    try {
      const { gasDay, area, nominationPoint, unit, type } = payload

      if (!gasDay || !area || !unit || !type) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: 'Missing required fields',
            error: 'Missing required fields'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const gasDayjs = getTodayNowDDMMYYYYAdd7(gasDay)
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

      const targetGasDay = gasDayjs.format('YYYY-MM-DD')
      const activeData = await buildActiveDataForDates([targetGasDay], this.prisma)
      const activeDataForDate = activeData.find((ad) => ad.date === targetGasDay) // activeData[0]

      if (nominationPoint && isMatch(type, '2')) {
        const activeNominationPoint = activeDataForDate?.activeNominationPoints?.find((f: any) => f?.nomination_point === nominationPoint)
        if (!activeNominationPoint) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              key: 'Nomination point not found',
              error: 'Nomination point not found'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        if (isMatch(unit, 'MMBTU/D')) {
          const hv = await this.qualityEvaluationService.findHVByDateAndArea({ gasDay, area }, userId)
          return activeNominationPoint.maximum_capacity * hv
        } else {
          return activeNominationPoint.maximum_capacity
        }
      } else {
        const activeArea = activeDataForDate?.activeAreas?.find((f: any) => f?.name === area)
        if (!activeArea) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              key: 'Area not found',
              error: 'Area not found'
            },
            HttpStatus.BAD_REQUEST
          )
        }

        if (isMatch(unit, 'MMBTU/D')) {
          return activeArea.area_nominal_capacity
        } else {
          const hv = await this.qualityEvaluationService.findHVByDateAndArea({ gasDay, area }, userId)
          return activeArea.area_nominal_capacity / hv
        }
      }
    } catch (error) {
      throw error
    }
  }

  async curtailmentsAllocationCalc(payload: any, userId: any) {
    const { gasDay, area, nominationPoint, unit, type, maxCapacity } = payload
    const gasDayjs = getTodayStartDDMMYYYYAdd7(gasDay)
    const { weekStart: targetWeekStart } = getWeekRange(gasDayjs.toDate())
    const { weekEnd: targetWeekEnd } = getWeekRange(gasDayjs.toDate())

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

    const areaMaster = await this.prisma.area.findMany({
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

    const resData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        OR: [
          {
            del_flag: false
          },
          { del_flag: null }
        ],
        query_shipper_nomination_status: {
          id: {
            in: [2, 5, 1]
          }
        },
        gas_day: {
          gte: targetWeekStart,
          lte: targetWeekEnd
        } //!Hot fix
        // id: 47,
        // nomination_type_id: 2,
      },
      include: {
        group: true,
        query_shipper_nomination_status: true,
        contract_code: {
          include: {
            booking_version: {
              include: {
                booking_full_json: true,
                booking_row_json: true,
                booking_full_json_release: true,
                booking_row_json_release: true
              },
              take: 1,
              where: {
                flag_use: true
              },
              orderBy: {
                id: 'desc'
              }
            }
          }
        },
        reserve_balancing_gas_contract: {
          include: {
            reserve_balancing_gas_contract_detail: {
              include: {
                nomination_point: {
                  include: {
                    area: true,
                    zone: true
                  }
                },
                area: true,
                zone: true,
                entry_exit: true
              }
            }
          }
        },
        // submission_comment_query_shipper_nomination_file: true,
        nomination_type: true,
        nomination_version: {
          include: {
            nomination_full_json: true,
            // nomination_full_json_sheet2: true,
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
        // query_shipper_nomination_file_renom: true,
        // query_shipper_nomination_file_url: {
        //   include: {
        //     nomination_version: true,
        //     query_shipper_nomination_status: true,
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
        //     id: 'desc',
        //   },
        // },
        // query_shipper_nomination_file_comment: {
        //   include: {
        //     query_shipper_nomination_type_comment: true,
        //     query_shipper_nomination_status: true,
        //     nomination_version: true,
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
        //     id: 'desc',
        //   },
        // },
      },
      orderBy: {
        id: 'desc'
      }
    })
    console.log('resData : ',resData);
    const grouped = {}
    for (const curr of resData) {
      const key = `${curr.gas_day}| ${curr.group?.name}| ${curr?.nomination_type?.id} `

      if (!grouped[key]) {
        grouped[key] = {
          gas_day: curr.gas_day,
          shipper_name: curr.group?.name,
          nomination_type: curr?.nomination_type,
          data: []
        }
      }

      grouped[key].data.push({
        ...curr
      })
    }
    const resultGroup: any = Object.values(grouped)
    const resultGroupType = resultGroup.map((e: any) => {
      e['data'] = e['data']?.map((eData: any) => {
        eData['nomination_version'] = eData['nomination_version']?.map((eDataNom: any) => {
          eDataNom['nomination_full_json'] = eDataNom['nomination_full_json']?.map((eDataNomJson: any) => {
            eDataNomJson['data_temp'] = JSON.parse(eDataNomJson['data_temp'])
            return {
              ...eDataNomJson
            }
          })
          // eDataNom["nomination_full_json_sheet2"] = eDataNom["nomination_full_json_sheet2"]?.map((eDataNomJson:any) => {
          //   eDataNomJson["data_temp"] = JSON.parse(eDataNomJson["data_temp"])
          //   return { ...eDataNomJson }
          // })
          eDataNom['nomination_row_json'] = eDataNom['nomination_row_json']?.map((eDataNomJson: any) => {
            eDataNomJson['data_temp'] = JSON.parse(eDataNomJson['data_temp'])
            return {
              ...eDataNomJson
            }
          })
          return {
            ...eDataNom
          }
        })
        return {
          ...eData
        }
      })

      const gas_day_text = dayjs(e['gas_day']).format('DD/MM/YYYY')
      const shipper_name = e['shipper_name']
      // const daily = e["data"]?.filter((f:any) => { return f?.nomination_type_id === 1 })
      // const weekly = e["data"]?.filter((f:any) => { return f?.nomination_type_id === 2 })
      // return { shipper_name, gas_day_text, daily, weekly }
      // const daily = e["data"]?.filter((f:any) => { return f?.nomination_type_id === 1 })
      return {
        shipper_name,
        gas_day: gas_day_text,
        gas_day_text,
        dataDW: e['data'],
        nomination_type: e['nomination_type']
      }
    })

    const nomFlat = resultGroupType?.flatMap((e: any) => {
      const { dataDW, ...nE } = e
      const nom = dataDW?.map((eD: any) => {
        return {
          ...nE,
          ...eD
        }
      })

      return [...nom]
    })

    const nomJsonRowFlat = nomFlat?.flatMap((e: any) => {
      const { nomination_version, ...nE } = e
      let nomination_version_one = e?.nomination_version[0] || []
      nomination_version_one.nomination_full_json = nomination_version_one.nomination_full_json[0]
      const { nomination_row_json, ...nER } = nomination_version_one
      // NONTPA
      const nom = nomination_row_json?.map((eD: any) => {
        if (eD['data_temp']['6'] === 'NONTPA') {
        }
        return {
          contract: nE?.contract_code?.contract_code ?? nE?.reserve_balancing_gas_contract?.res_bal_gas_contract,
          unit: eD['data_temp']['9'],
          point: eD['data_temp']['3'],
          entryExit: eD['data_temp']['10'],
          nomVersionId: nER?.id,
          nomVersionVersion: nER?.version,
          nomVersionFull: nER?.nomination_full_json,
          NONTPA: eD['data_temp']['6'] || null,
          ...nE,
          ...eD
        }
      })

      return [...nom]
    })

    const nomData = nomJsonRowFlat?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id === 1
    })
    const nomTypeExt = nomData?.flatMap((e: any) => {
      let dataE = []
      if (e['nomination_type_id'] === 2) {
        // weekly
        for (let i = 0; i < daysOfWeek.length; i++) {
          //
          
          dataE.push({
            ...e,
            total: Number(e['data_temp'][`${14 + i} `]?.trim()?.replace(/,/g, '')) || 0,
            totalType: daysOfWeek[i],
            gasDayUse: e?.nomVersionFull?.data_temp?.headData[`${14 + i}`],
            HV: Number(e['data_temp']['12']?.trim()?.replace(/,/g, '')) || 0,
            rowId: e?.id
          })
        }
      } else {
        // daily
        dataE.push({
          ...e,
          total: Number(e['data_temp']['38']?.trim()?.replace(/,/g, '')) || 0,
          totalType: 'daily',
          gasDayUse: e?.gas_day_text,
          HV: Number(e['data_temp']['12']?.trim()?.replace(/,/g, '')) || 0,
          rowId: e?.id
        })
      }

      return [...dataE]
    })

    const nomExt = nomTypeExt?.map((e: any) => {
      const { rowId, HV, gasDayUse, contract, shipper_name, zone_text, area_text, unit, point, entryExit, total, totalType, contract_code, reserve_balancing_gas_contract_id, NONTPA, ...nE } = e
      const entryExitId = entryExit === 'Entry' ? 1 : 2
      const areaObj = areaMaster?.find((f: any) => {
        return f?.name === area_text && f?.entry_exit_id === entryExitId
      })
      // term_type_id
      return {
        rowId,
        HV,
        contract,
        gasDayUse,
        shipper_name,
        zone_text,
        area_text,
        unit,
        point,
        entryExit,
        total,
        totalType,
        // contract_code,
        contract_code_id: contract_code?.id,
        reserve_balancing_gas_contract_id: reserve_balancing_gas_contract_id,
        areaObj,
        term: contract_code?.term_type_id === 4 ? 'non-firm' : 'firm',
        NONTPA
      }
    })
    console.log('type : ', type);
    console.log('nomExt : ', nomExt);
    const nomExtFilter =
      type === '1'
        ? nomExt?.filter((f: any) => {
          return f?.area_text === area && f?.gasDayUse === gasDay
        })
        : nomExt?.filter((f: any) => {
          return f?.area_text === area && f?.gasDayUse === gasDay && f?.point === nominationPoint
        })

    const deduplicateByKeys = (data) => {
      const map = new Map()

      for (const item of data) {
        const key = [item.gasDayUse, item.contract, item.shipper_name, item.area_text, item.zone_text, item.point, item.unit].join('|')

        if (!map.has(key)) {
          map.set(key, [])
        }

        map.get(key).push(item)
      }

      const result = []

      for (const [_, group] of map.entries()) {
        if (group.length === 1) {
          result.push(group[0]) // ไม่ซ้ำ
        } else {
          const daily = group.find((g) => g.totalType === 'daily')
          if (daily) result.push(daily) // ซ้ำแต่มี daily
        }
      }

      return result
    }
    console.log('nomExtFilter : ', nomExtFilter);
    const filteredDataDW = deduplicateByKeys(nomExtFilter)
    const groupedArea = {}
    for (const curr of filteredDataDW) {
      const key = `${curr.gasDayUse}| ${curr.shipper_name}| ${curr?.contract}| ${curr?.area_text} `

      if (!groupedArea[key]) {
        groupedArea[key] = {
          gasDayUse: curr.gasDayUse,
          shipper_name: curr.shipper_name,
          contract: curr?.contract,
          area_text: curr?.area_text,
          data: []
        }
      }

      groupedArea[key].data.push({ ...curr })
    }
    const resultGroupArea: any = Object.values(groupedArea)
    const calcHvResultGroupArea = resultGroupArea.map((e: any) => {
      const hvXvi = e['data'].length > 0 ? e['data'].reduce((sum, item) => sum + Number(item['HV']) * Number(item['total']), 0) : null //wi excl
      const viAll = e['data'].length > 0 ? e['data'].reduce((sum, item) => (item['NONTPA'] === 'NONTPA' ? sum - Number(item['total']) : sum + Number(item['total'])), 0) : null //wi excl
      const calcHv = hvXvi / viAll

      // entryExit Entry Exit
      const entry =
        e['data'].length > 0
          ? e['data']?.filter((f: any) => {
            return f?.entryExit === 'Entry'
          })
          : null
      const exit =
        e['data'].length > 0
          ? e['data']?.filter((f: any) => {
            return f?.entryExit === 'Exit'
          })
          : null
      const entryMMBTU =
        entry.filter((f: any) => {
          return f?.unit === 'MMBTU/D'
        }) || null
      const entryMMSCFD =
        entry.filter((f: any) => {
          return f?.unit === 'MMSCFD'
        }) || null
      const exitMMBTU =
        exit.filter((f: any) => {
          return f?.unit === 'MMBTU/D'
        }) || null

      let nominationValue = 0
      if (unit === 'MMBTU/D') {
        let nominationValueEntry = entryMMBTU.reduce((sum, item) => (item['NONTPA'] === 'NONTPA' ? sum - Number(item['total']) : sum + Number(item['total'])), 0)
        let nominationValueExit = exitMMBTU.reduce((sum, item) => (item['NONTPA'] === 'NONTPA' ? sum - Number(item['total']) : sum + Number(item['total'])), 0)
        nominationValue = nominationValueEntry + nominationValueExit
      } else if (unit === 'MMSCFD') {
        let nominationValueEntry = entryMMSCFD.reduce((sum, item) => (item['NONTPA'] === 'NONTPA' ? sum - Number(item['total']) : sum + Number(item['total'])), 0)
        //  let nominationValueExit = calcHv === 0 ? null : exitMMBTU.reduce((sum, item) => sum + Number(item["total"]), 0) / calcHv
        //  nominationValue = nominationValueEntry + nominationValueExit
        nominationValue = nominationValueEntry
      }
      const { data, ...nE } = e
      return {
        calcHv,
        nominationValue: nominationValue,
        maxCapacity: Number(maxCapacity?.trim()?.replace(/,/g, '')) || 0,
        term: data[0]?.term || null,
        ...nE
      }
    })

    const firmValueAll =
      calcHvResultGroupArea
        ?.filter((f: any) => f?.term === 'firm')
        .reduce((sum, item) => {
          const value = Number(item['nominationValue'] ?? 0) // ถ้า null หรือ undefined จะกลายเป็น 0
          return sum + value
        }, 0) || 0
    const nonfirmValueAll =
      calcHvResultGroupArea
        ?.filter((f: any) => f?.term === 'non-firm')
        .reduce((sum, item) => {
          const value = Number(item['nominationValue'] ?? 0) // ถ้า null หรือ undefined จะกลายเป็น 0
          return sum + value
        }, 0) || 0

    console.log('calcHvResultGroupArea : ', calcHvResultGroupArea);

    const calcRemain = calcHvResultGroupArea?.map((e: any) => {
      let remainingCapacity = null

      if (e['term'] === 'firm') {
        const checkFirm = firmValueAll < Number(maxCapacity) ? e['nominationValue'] : Number(maxCapacity) * (e['nominationValue'] / firmValueAll)

        remainingCapacity = checkFirm
      } else {
        const checkNonFirm = firmValueAll < Number(maxCapacity) ? (Number(maxCapacity) - firmValueAll) * (e['nominationValue'] / nonfirmValueAll) : 0
        remainingCapacity = checkNonFirm
      }

      return {
        ...e,
        remainingCapacity
      }
    })

    // gasDay, area, nominationPoint, unit, type
    console.log('calcRemain : ',calcRemain);
    return calcRemain
  }

  async curtailmentsAllocationCalcSave(payload: any, userId: any) {
    const { gasDay, area, nominationPoint, unit, type, maxCapacity } = payload

    const calcRemain = await this.curtailmentsAllocationCalc(payload, userId)
    const newDate = getTodayNowAdd7()
    const curtailCount = await this.prisma.curtailments_allocation.count({
      where: {
        create_date: {
          gte: getTodayStartAdd7().toDate(), // เริ่มต้นวันตามเวลาประเทศไทย
          lte: getTodayEndAdd7().toDate() // สิ้นสุดวันตามเวลาประเทศไทย
        },
        curtailments_allocation_type_id: Number(type)
      }
    })
    const curtailId = type === '1' ? `${dayjs().format('YYYYMMDD')} -CAA - ${String(curtailCount + 1).padStart(4, '0')} ` : `${dayjs().format('YYYYMMDD')} -CAN - ${String(curtailCount + 1).padStart(4, '0')} `

    // gasDay, area, nominationPoint, unit, type
    const dataUse = {
      case_id: curtailId,
      gas_day: getTodayNowDDMMYYYYDfaultAdd7(gasDay).toDate(),
      gas_day_text: gasDay,
      area: area,
      nomination_point: type === '1' ? null : nominationPoint, //type = 1 ไม่ต้องส่งมา
      unit: unit, //MMBTU/D    MMSCFD
      curtailments_allocation_type_id: Number(type),
      max_capacity: maxCapacity,
      data: calcRemain,
      create_date_num: newDate.unix(),
      create_date: newDate.toDate(),
      create_by: Number(userId)
      // create_by_account: {
      //   connect: {
      //     id: Number(userId),
      //   },
      // },
    }
    const { data: datDB, ...ndataUse } = dataUse
    const create = await this.prisma.curtailments_allocation.create({
      data: ndataUse
    })

    for (let i = 0; i < datDB.length; i++) {
      await this.prisma.curtailments_allocation_calc.create({
        data: {
          curtailments_allocation_id: Number(create?.id),
          gas_day: getTodayNowDDMMYYYYDfaultAdd7(datDB[i]?.gasDayUse).toDate(),
          gas_day_text: datDB[i]?.gasDayUse,
          calc_hv: String(datDB[i]?.calcHv),
          nomination_value: String(datDB[i]?.nominationValue),
          max_capacity: String(datDB[i]?.max_capacity),
          term: datDB[i]?.term,
          shipper_name: datDB[i]?.shipper_name,
          contract: datDB[i]?.contract,
          area_text: datDB[i]?.area_text,
          remaining_capacity: String(datDB[i]?.remainingCapacity),
          create_date_num: newDate.unix(),
          create_date: newDate.toDate(),
          create_by: Number(userId)
        }
      })
    }

    return dataUse
  }

  async allocationReportViewSpeed(payload: any, userId: any) {
    const { start_date, end_date, skip, limit, tab, contract, shipper, gas_day, id, evidenApi, areaMaster, zoneMaster, groupMaster, entryExitMaster } = payload

    const start = start_date ? getTodayStartAdd7(start_date) : null
    const end = end_date ? getTodayEndAdd7(end_date) : null

    if (!start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    // Extract gas days and generate date array
    const dateArray = extractAndGenerateDateArray(evidenApi)

    // Build active data for all dates
    const activeData = await buildActiveDataForDates(dateArray, this.prisma)

    const newEOD =
      evidenApi?.flatMap((fm: any) => {
        const { data: data1, ...fmD } = fm

        // Find active data for this gas_day
        const activeDataForDate = activeData.find((ad) => ad.date === fm.gas_day)

        const nData = data1?.flatMap((dFm: any) => {
          const { data: data2, ...fmD2 } = dFm

          // Validate contract and shipper existence
          const contractValidation = validateContractAndShipper(dFm, activeDataForDate)
          // if (!contractValidation.isValid) {
          //   return [];
          // }

          const nData2 = data2
            // .filter((dFm2: any) => {
            //   return validatePointByType(dFm2, activeDataForDate);
            // })
            .map((dFm2: any) => {
              validatePointByType(dFm2, activeDataForDate)
              return {
                ...fmD,
                ...fmD2,
                ...dFm2,
                group: contractValidation.shipperObj
              }
            })

          return [...nData2]
        })

        return [...nData]
      }) || []

    const resultEodLast1: any = Object.values(
      newEOD.reduce((acc, curr) => {
        const key = `${curr.gas_day}| ${curr.shipper}| ${curr.contract}| ${curr.point}| ${curr.entry_exit}| ${curr.area}| ${curr.zone} `
        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )

    //  db

    const resultEodLast = resultEodLast1?.filter((f: any) => {
      return f?.contract === contract && f?.shipper === shipper && f?.gas_day === gas_day
    })

    let allocationReportView = await this.prisma.allocation_report_view.findMany({
      include: {}
    })

    let newAllocation = []

    for (let i = 0; i < resultEodLast.length; i++) {
      const findAllocationReport = allocationReportView.find((f: any) => {
        return (
          f?.allocation_report_id === Number(id) &&
          f?.gas_day_text === resultEodLast[i]?.gas_day &&
          f?.shipper_name_text === resultEodLast[i]?.shipper &&
          f?.contract_code_text === resultEodLast[i]?.contract &&
          f?.point_text === resultEodLast[i]?.point &&
          f?.entry_exit_text === resultEodLast[i]?.entry_exit &&
          f?.area_text === resultEodLast[i]?.area &&
          f?.zone_text === resultEodLast[i]?.zone
        )
      })

      if (!!!findAllocationReport) {
        newAllocation.push({
          allocation_report_id: Number(id),
          shipper_name_text: resultEodLast[i]?.shipper,
          gas_day_text: resultEodLast[i]?.gas_day,
          contract_code_text: resultEodLast[i]?.contract,
          point_text: resultEodLast[i]?.point,
          entry_exit_text: resultEodLast[i]?.entry_exit,
          area_text: resultEodLast[i]?.area,
          zone_text: resultEodLast[i]?.zone,

          gas_day: getTodayNowYYYYMMDDDfaultAdd7(resultEodLast[i]?.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId)
        })
      }
    }

    if (newAllocation.length > 0) {
      // create
      await this.prisma.allocation_report_view.createMany({
        data: newAllocation
      })

      allocationReportView = await this.prisma.allocation_report_view.findMany({
        include: {}
      })
    }

    const newEODF = resultEodLast?.map((eod: any) => {
      const contractCapacity = eod['values']?.find((f: any) => f?.tag === 'contractCapacity')?.value ?? null
      const nominationValue = eod['values']?.find((f: any) => f?.tag === 'nominatedValue')?.value ?? null
      const allocatedValue = eod['values']?.find((f: any) => f?.tag === 'allocatedValue')?.value ?? null
      // const overusage = eod['values']?.find((f:any) => f?.tag === "overusage")?.value ?? null
      // const intradaySystemAllocation = null

      const entry_exit_obj = entryExitMaster.find((f: any) => {
        return f?.name?.toUpperCase() === eod['entry_exit']?.toUpperCase()
      })

      const findAllocationReport = allocationReportView.find((f: any) => {
        return (
          f?.allocation_report_id === Number(id) &&
          f?.gas_day_text === eod?.['gas_day'] &&
          f?.shipper_name_text === eod?.['shipper'] &&
          f?.contract_code_text === eod?.['contract'] &&
          f?.point_text === eod?.['point'] &&
          f?.entry_exit_text === eod?.['entry_exit'] &&
          f?.area_text === eod?.['area'] &&
          f?.zone_text === eod?.['zone']
        )
      })

      const { values, ...nEod } = eod

      return {
        id: findAllocationReport?.id,
        ...eod,
        contractCapacity,
        nominationValue,
        allocatedValue,
        // overusage,
        // intradaySystemAllocation,
        entry_exit_obj
      }
    })
    // contract_point
    // point_type
    return newEODF
  }

  async allocationShipperReport(payload: any, userId: any) {
    const { start_date, end_date, skip, limit, tab, nomination_point_arr, shipper_arr, share } = payload

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const areaMaster = await this.prisma.area.findMany({
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

    const entryExitMaster = await this.prisma.entry_exit.findMany({
      where: {}
    })

    const allocationShipperReport = await this.allocationReport(payload, userId)

    // meter
    const getDataLogic = await this.meteringManagementService.getDataLogicNoCondept(
      {
        share,
        start_date,
        end_date
      },
      true
    )

    // พี่แนนให้เอาตัวกรอก  publication ออกวันที่ 11 ก.ค. 2568
    // const publication = allocationShipperReport?.filter((f: any) => {
    //   return f?.publication === true;
    // });

    let publicationNewVew = []

    let evidenApi = []
    if (tab === '1') {
      let totalRecord: number | undefined = undefined
      await this.evidenApiAllocationContractPointByNom(
        {
          start_date,
          end_date,
          skip: 0,
          limit: 1
        },
        (total_record: number) => {
          totalRecord = total_record
        }
      )
      evidenApi = await this.evidenApiAllocationContractPointByNom({
        start_date,
        end_date,
        skip: totalRecord ? 0 : skip,
        limit: totalRecord ? totalRecord : limit
      })
    } else {
      let totalRecord: number | undefined = undefined
      await this.evidenApiAllocationContractPointIntradayByNom(
        {
          start_date,
          end_date,
          skip: 0,
          limit: 1
        },
        (total_record: number) => {
          totalRecord = total_record
        }
      )
      evidenApi = await this.evidenApiAllocationContractPointIntradayByNom({
        start_date,
        end_date,
        skip: totalRecord ? 0 : skip,
        limit: totalRecord ? totalRecord : limit
      })
    }

    for (let i = 0; i < allocationShipperReport.length; i++) {
      const allocationReportView = await this.allocationReportViewSpeed(
        {
          start_date,
          end_date,
          skip,
          limit,
          tab,
          contract: allocationShipperReport[i]?.contract,
          shipper: allocationShipperReport[i]?.shipper,
          gas_day: allocationShipperReport[i]?.gas_day,
          id: allocationShipperReport[i]?.id,
          evidenApi,
          areaMaster,
          zoneMaster,
          groupMaster,
          entryExitMaster
        },
        userId
      )

      const nomViewPoint = allocationReportView?.map((e: any) => {
        return {
          point: e['point'],
          point_type: e['point_type'],
          allocatedValue: e['values']?.find((f: any) => {
            return f?.tag === 'allocatedValue'
          })?.value
        }
      })

      publicationNewVew.push({
        ...allocationShipperReport[i],
        nomViewPoint: nomViewPoint || []
      })
    }

    const newDataUse = publicationNewVew?.map((e: any) => {
      return {
        id: e['id'] || null,
        request_number: e['request_number'] || null,
        execute_timestamp: e['execute_timestamp'] || null,
        gas_day: e['gas_day'] || null,
        contract: e['contract'] || null,
        shipper_id: e['shipper'] || null,
        shipper_name: e['group']?.['name'] || null,
        contract_point: e['contract_point'] || null,
        area: e['area'] || null,
        zone: e['zone'] || null,
        entry_exit: e['entry_exit'] || null,
        nomViewPoint: e['nomViewPoint'] || null
      }
    })

    const newDataUsePoint = newDataUse?.flatMap((e: any) => {
      const { nomViewPoint, ...nE } = e
      const nomViewPointNew = nomViewPoint?.map((nv: any) => {
        return {
          ...nE,
          ...nv
        }
      })

      return [...nomViewPointNew]
    })

    const filterNom =
      nomination_point_arr.length > 0
        ? newDataUsePoint?.filter((f: any) => {
          return nomination_point_arr.includes(f?.point)
        })
        : newDataUsePoint
    const filterShipper =
      shipper_arr.length > 0
        ? filterNom?.filter((f: any) => {
          return shipper_arr.includes(f?.shipper_id)
        })
        : filterNom

    const groupedByGasday = Object.values(
      filterShipper.reduce((acc, item) => {
        const key = `${item.gas_day} `
        if (!acc[key]) {
          acc[key] = {
            gas_day: item.gas_day,
            data: []
          }
        }
        acc[key].data.push(item)
        return acc
      }, {})
    )

    const newGroupedByGasday = groupedByGasday?.map((e: any) => {
      const { data, ...nE } = e

      const groupedByNompoint = Object.values(
        data.reduce((acc, item) => {
          const key = `${item.point} `
          if (!acc[key]) {
            acc[key] = {
              point: item.point,
              data: []
            }
          }
          acc[key].data.push(item)
          return acc
        }, {})
      )

      const groupedByNompointNew = groupedByNompoint?.map((gbn: any) => {
        const { data: nData, ...nGbn } = gbn

        const grouped = Object.values(
          nData.reduce((acc, curr) => {
            const key = `${curr.shipper_id} `
            if (!acc[key]) {
              acc[key] = {
                gas_day: curr.gas_day,
                shipper_id: curr.shipper_id,
                shipper_name: curr.shipper_name,
                allocatedValue: 0
              }
            }
            acc[key].allocatedValue += curr.allocatedValue
            return acc
          }, {})
        )

        const findGasDay = (getDataLogic?.meter || [])?.filter((f: any) => {
          return f?.gasDay === nE['gas_day'] || f?.gasDay === nE['gasDay']
        })
        const findNomPoint = (getDataLogic?.meterNom || [])?.filter((f: any) => {
          return f?.nomination_point?.nomination_point === nGbn['point']
        })
        let meterValue = null
        if (findNomPoint.length > 0 && findGasDay.length > 0) {
          for (let iNom = 0; iNom < findNomPoint.length; iNom++) {
            const findMeter = findGasDay?.filter((f: any) => {
              return f?.meteringPointId === findNomPoint[iNom]['metered_point_name']
            })
            const findMeterUse = findMeter?.length > 0 ? findMeter[0] : null
            if (findMeterUse) {
              meterValue += findMeterUse?.energy
            }
          }
        }

        return {
          ...nGbn,
          data: grouped,
          total: grouped.reduce((sum, item: any) => sum + (item?.allocatedValue || 0), 0),
          meterValue: meterValue
        }
      })

      return {
        ...nE,
        nomPoint: groupedByNompointNew
      }
    })

    return newGroupedByGasday
  }

  async allocationShipperReportCallOnlyByNomination(payload: any, userId: any) {
    const { start_date, end_date, skip, limit, tab, nomination_point_arr, shipper_arr, share } = payload

    const today = getTodayEndAdd7()
    const start = start_date ? getTodayStartYYYYMMDDDfaultAdd7(start_date) : getTodayStartAdd7()
    const end = end_date ? getTodayEndYYYYMMDDDfaultAdd7(end_date) : getTodayEndAdd7()
    console.time("as1")
    if (!start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    const groupMaster: group[] = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      }
    })

    const contractCodsMaster: contract_code[] = await this.prisma.contract_code.findMany({
      where: {
        AND: [
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
      }
    })

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
        ]
      },
      ...queryShipperNominationFilePopulate
    })

    const nominationPointMaster: nominationPointWithRelations[] = await this.prisma.nomination_point.findMany({
      where: {
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      },
      ...nominationPointPopulate
    })

    const conceptPointMaster: conceptPointWithRelations[] = await this.prisma.concept_point.findMany({
      where: {
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      },
      ...conceptPointPopulate
    })

    const nonTpaPointMaster: nonTpaPointWithRelations[] = await this.prisma.non_tpa_point.findMany({
      where: {
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      },
      ...nonTpaPointPopulate
    })

    const meteringPointMaster: meteringPointWithRelations[] = await this.prisma.metering_point.findMany({
      where: {
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      },
      ...meteringPointPopulate
    })
    console.timeEnd("as1")
    console.time("as2")
    const meteringPointList: meteringPointWithRelations[] = (share === 'on' || share == true) ? await shareShipper(meteringPointMaster, this.prisma, start, end) : meteringPointMaster
    console.timeEnd("as2")
    const activeData: {
      date: string
      activeGroups?: group[]
      activeNominationFiles?: queryShipperNominationFileWithRelations[]
      activeContractCodes?: contract_code[]
      activeNominationPoints?: nominationPointWithRelations[]
      activeConceptPoints?: conceptPointWithRelations[]
      activeNonTpaPoints?: nonTpaPointWithRelations[]
      activeMeteringPoints?: meteringPointWithRelations[]
    }[] = []
    let current = start.clone()
    console.time("as3")
    while (current.isSameOrBefore(end, 'day')) {
      activeData.push({
        date: current.format('YYYY-MM-DD'),
        activeGroups: groupMaster.filter((group) => group.start_date <= current.toDate() && (group.end_date === null || group.end_date >= current.toDate())),
        activeNominationFiles: activeNominationFiles.filter(
          (nominationFile) => (nominationFile.nomination_type.id === 1 && nominationFile.gas_day <= current.toDate()) || (nominationFile.nomination_type.id === 2 && nominationFile.gas_day >= current.startOf('week').toDate() && nominationFile.gas_day <= current.endOf('week').toDate())
        ),
        activeContractCodes: contractCodsMaster.filter(
          (contractCode) =>
            contractCode.contract_start_date <= current.toDate() &&
            (contractCode.terminate_date === null || contractCode.terminate_date >= current.toDate()) &&
            ((contractCode.extend_deadline != null && contractCode.extend_deadline >= current.toDate()) || (contractCode.extend_deadline == null && (contractCode.contract_end_date == null || contractCode.contract_end_date >= current.toDate())))
        ),
        activeNominationPoints: nominationPointMaster.filter((nominationPoint) => nominationPoint.start_date <= current.toDate() && (nominationPoint.end_date === null || nominationPoint.end_date >= current.toDate())),
        activeConceptPoints: conceptPointMaster.filter((conceptPoint) => conceptPoint.start_date <= current.toDate() && (conceptPoint.end_date === null || conceptPoint.end_date >= current.toDate())),
        activeNonTpaPoints: nonTpaPointMaster.filter((nonTpaPoint) => nonTpaPoint.start_date <= current.toDate() && (nonTpaPoint.end_date === null || nonTpaPoint.end_date >= current.toDate())),
        activeMeteringPoints: meteringPointList.filter((meteringPoint) => meteringPoint.start_date <= current.toDate() && (meteringPoint.end_date === null || meteringPoint.end_date >= current.toDate()))
      })
      current = current.add(1, 'day')
    }
    console.timeEnd("as3")
    console.time("as4")
    // meter
    const getDataLogic = await this.meteringManagementService.getDataLogicNoCondept2(
      {
        share,
        start_date,
        end_date
      },
      true,
      meteringPointList
    )
    console.timeEnd("as4") 
    console.time("as5")
    // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
    const { minDate, maxDate } = await findMinMaxExeDate(this.prisma, start_date, end_date)
    let startForEviden = start ?? minDate
    if (!startForEviden || !startForEviden.isValid()) {
      startForEviden = today.startOf('month')
    }
    let endForEviden = end ?? maxDate
    if (!endForEviden || !endForEviden.isValid() || endForEviden.isAfter(today)) {
      endForEviden = today
    }
    console.timeEnd("as5")
    let evidenApi = []
    console.time("as6")
    if (tab === '1') {
     
      let current_ = dayjs(startForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'));
      const end_ = dayjs(endForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'));

      let totalRecord: number | undefined = undefined
      console.time("as6.1 Eviden")
      minDate &&
        (await this.evidenApiAllocationContractPointByNom(
          {
            start_date: current_,
            end_date: end_,
            skip: 0,
            limit: 1
          },
          (total_record: number) => {
            totalRecord = total_record
          }
        ))
      console.timeEnd("as6.1 Eviden")
   
      const executeEodMaxByDay = await this.prisma.execute_eod.groupBy({
        by: ['start_date_date'],
        where: {
          status: {
            equals: 'OK',
            mode: 'insensitive',
          },
          start_date_date: {
            lte: end.toDate(),
          },
          end_date_date: {
            gte: start.toDate(),
          },
        },
        _max: {
          request_number_id: true,
        },
      });

      const executeEodList_ = executeEodMaxByDay.length
        ? await this.prisma.execute_eod.findMany({
            where: {
              OR: executeEodMaxByDay.map((item) => ({
                start_date_date: item.start_date_date,
                request_number_id: item._max.request_number_id!,
              })),
            },
            orderBy: {
              start_date_date: 'asc',
            },
          })
        : [];
      
      let dateArr_: any = [];
      
      while (current_.isSame(end_, "day") || current_.isBefore(end_, "day")) {
        const find_ = executeEodList_?.find((f:any) => f?.start_date === current_.format("YYYY-MM-DD"))
        if(find_){
          dateArr_.push({
            date: current_.format("YYYY-MM-DD"),
            request_number_id: find_?.request_number_id
          });
        }
        current_ = current_.add(1, "day");
      }

      console.log(dateArr_);

      console.time("as6.12 -1 Eviden") 
      let evidenData_ = []
        for (let i = 0; i < dateArr_.length; i++) {
          const evidenData =
            (minDate &&
              (await this.evidenApiAllocationContractPointByNom({
                start_date: dateArr_?.[i]?.date,
                end_date: dateArr_?.[i]?.date,
                skip: totalRecord ? 0 : skip,
                limit: totalRecord ? totalRecord : limit,
                request_number: dateArr_?.[i]?.request_number_id
              }))) ||
            [] 
            evidenData_ = [...evidenData_, ...evidenData]
        }
        console.timeEnd("as6.12 -1 Eviden")
        evidenApi = evidenData_
     
    } else {
      let totalRecord: number | undefined = undefined
      console.log(`minDate.tz('Asia/Bangkok').format('YYYY-MM-DD') : `, minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'));
      console.log(`maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD') : `, maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'));
      console.time("as6.2 Eviden")
      minDate &&
        (await this.evidenApiAllocationContractPointIntradayByNom(
          {
            start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            skip: 0,
            limit: 1
          },
          (total_record: number) => {
            totalRecord = total_record
          }
        ))
      const evidenData =
        (minDate &&
          (await this.evidenApiAllocationContractPointIntradayByNom({
            start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            skip: totalRecord ? 0 : skip,
            limit: totalRecord ? totalRecord : limit
          }))) ||
        []
      console.timeEnd("as6.2 Eviden")
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

      evidenApi = evidenData.filter((item: any) => {
        const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
        return executeIntradayList?.some((executeData: any) => {
          const executeGasDay = getTodayNowAdd7(executeData.gas_day)
          return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day') && executeData.gas_hour == item.gas_hour
        })
      })
    }
    console.timeEnd("as6")

    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: start.toDate()
            }
          },
          {
            gas_day: {
              lte: end.toDate()
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })
    console.time("as7")
    // พี่แนนให้เอาตัวกรอก  publication ออกวันที่ 11 ก.ค. 2568
    const latestByGasDay = evidenApi
      // .filter((item:any)=>{
      //   return !publicationCenterDeletedList?.some((f: any) => {
      //     return (
      //       f?.execute_timestamp === item.execute_timestamp &&
      //       f?.gas_day_text === item.gas_day
      //     );
      //   })
      // })
      .reduce((acc: any, current: any) => {
        const gasDay = current.gas_day

        if (!acc[gasDay] || current.execute_timestamp > acc[gasDay].execute_timestamp) {
          acc[gasDay] = current
        }

        return acc
      }, {})
    // Convert back to array and update the response
    const filteredData = Object.values(latestByGasDay)

    // Filter based on active records
    const filteredEvidenApi = filteredData.flatMap((fm: any) => {
      const { data: data1, ...fmD } = fm

      // Find active data for this gas_day
      const activeDataForDate = activeData.find((ad) => ad.date === fm.gas_day)

      const nData = data1?.flatMap((dFm: any) => {
        const { data: data2, ...fmD2 } = dFm

        // Validate contract and shipper existence
        const contractValidation = validateContractAndShipper(dFm, activeDataForDate)
        // if (!contractValidation.isValid) {
        //   return [];
        // }

        const nData2 = data2
          // .filter((dFm2: any) => {
          //   return validatePointByType(dFm2, activeDataForDate);
          // })
          .map((dFm2: any) => {
            validatePointByType(dFm2, activeDataForDate)
            return {
              ...fmD,
              ...fmD2,
              ...dFm2,
              group: contractValidation.shipperObj
            }
          })

        return [...nData2]
      })

      return [...nData]
    })
    console.timeEnd("as7")
    // พี่แนนให้เอาตัวกรอก  publication ออกวันที่ 11 ก.ค. 2568
    // const publication = filteredEvidenApi?.filter((f: any) => {
    //   return f?.publication === true;
    // });
    // Apply additional filtering based on nomination_point_arr and shipper_arr
    let finalFilteredData = filteredEvidenApi
    console.time("as8")
    // Filter by nomination_point_arr if provided
    // if (nomination_point_arr && nomination_point_arr.length > 0) {
    // }
    if (nomination_point_arr && nomination_point_arr.length > 0) {
      finalFilteredData = finalFilteredData.filter((item: any) => {
        return nomination_point_arr.includes(item.point)
      })
    }
    if (share === 'on' || share == true) {
      finalFilteredData = finalFilteredData.filter((item: any) => meteringPointList.some((meteringPoint: any) => meteringPoint.nomination_point?.nomination_point === item.point))
    }

    // Filter by shipper_arr if provided
    if (shipper_arr && shipper_arr.length > 0) {
      finalFilteredData = finalFilteredData.filter((item: any) => {
        return shipper_arr.includes(item.shipper)
      })
    }
    console.timeEnd("as8")
    console.time("as9")
    // Transform to expected result structure
    const transformedResult = transformToShipperReportStructure(finalFilteredData, getDataLogic, activeData)
    console.timeEnd("as9")
    return transformedResult
  }

  async allocationShipperReportCallOnlyByNominationOld(payload: any, userId: any) {
    const { start_date, end_date, skip, limit, tab, nomination_point_arr, shipper_arr, share } = payload

    const today = getTodayEndAdd7()
    const start = start_date ? getTodayNowYYYYMMDDDfaultAdd7(start_date) : getTodayStartAdd7()
    const end = end_date ? getTodayNowYYYYMMDDDfaultAdd7(end_date) : getTodayStartAdd7()
    console.time("as1")
    if (!start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    const groupMaster: group[] = await this.prisma.group.findMany({
      where: {
        user_type_id: 3,
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      }
    })

    const contractCodsMaster: contract_code[] = await this.prisma.contract_code.findMany({
      where: {
        AND: [
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
      }
    })

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
        ]
      },
      ...queryShipperNominationFilePopulate
    })

    const nominationPointMaster: nominationPointWithRelations[] = await this.prisma.nomination_point.findMany({
      where: {
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      },
      ...nominationPointPopulate
    })

    const conceptPointMaster: conceptPointWithRelations[] = await this.prisma.concept_point.findMany({
      where: {
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      },
      ...conceptPointPopulate
    })

    const nonTpaPointMaster: nonTpaPointWithRelations[] = await this.prisma.non_tpa_point.findMany({
      where: {
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      },
      ...nonTpaPointPopulate
    })

    const meteringPointMaster: meteringPointWithRelations[] = await this.prisma.metering_point.findMany({
      where: {
        OR: [
          {
            end_date: null
          },
          {
            end_date: {
              gt: start.toDate()
            }
          }
        ],
        start_date: {
          lte: end.toDate()
        }
      },
      ...meteringPointPopulate
    })
    console.timeEnd("as1")
    console.time("as2")
    const meteringPointList : meteringPointWithRelations[] = (share === 'on' || share == true) ? await shareShipper(meteringPointMaster, this.prisma, start, end) : meteringPointMaster
    console.timeEnd("as2")
    const activeData: {
      date: string
      activeGroups?: group[]
      activeNominationFiles?: queryShipperNominationFileWithRelations[]
      activeContractCodes?: contract_code[]
      activeNominationPoints?: nominationPointWithRelations[]
      activeConceptPoints?: conceptPointWithRelations[]
      activeNonTpaPoints?: nonTpaPointWithRelations[]
      activeMeteringPoints?: meteringPointWithRelations[]
    }[] = []
    let current = start.clone()
    console.time("as3")
    while (current.isSameOrBefore(end, 'day')) {
      activeData.push({
        date: current.format('YYYY-MM-DD'),
        activeGroups: groupMaster.filter((group) => group.start_date <= current.toDate() && (group.end_date === null || group.end_date >= current.toDate())),
        activeNominationFiles: activeNominationFiles.filter(
          (nominationFile) => (nominationFile.nomination_type.id === 1 && nominationFile.gas_day <= current.toDate()) || (nominationFile.nomination_type.id === 2 && nominationFile.gas_day >= current.startOf('week').toDate() && nominationFile.gas_day <= current.endOf('week').toDate())
        ),
        activeContractCodes: contractCodsMaster.filter(
          (contractCode) =>
            contractCode.contract_start_date <= current.toDate() &&
            (contractCode.terminate_date === null || contractCode.terminate_date >= current.toDate()) &&
            ((contractCode.extend_deadline != null && contractCode.extend_deadline >= current.toDate()) || (contractCode.extend_deadline == null && (contractCode.contract_end_date == null || contractCode.contract_end_date >= current.toDate())))
        ),
        activeNominationPoints: nominationPointMaster.filter((nominationPoint) => nominationPoint.start_date <= current.toDate() && (nominationPoint.end_date === null || nominationPoint.end_date >= current.toDate())),
        activeConceptPoints: conceptPointMaster.filter((conceptPoint) => conceptPoint.start_date <= current.toDate() && (conceptPoint.end_date === null || conceptPoint.end_date >= current.toDate())),
        activeNonTpaPoints: nonTpaPointMaster.filter((nonTpaPoint) => nonTpaPoint.start_date <= current.toDate() && (nonTpaPoint.end_date === null || nonTpaPoint.end_date >= current.toDate())),
        activeMeteringPoints: meteringPointList.filter((meteringPoint) => meteringPoint.start_date <= current.toDate() && (meteringPoint.end_date === null || meteringPoint.end_date >= current.toDate()))
      })
      current = current.add(1, 'day')
    }
    console.timeEnd("as3")
    console.time("as4")
    // meter
    const getDataLogic = await this.meteringManagementService.getDataLogicNoCondept2(
      {
        share,
        start_date,
        end_date
      },
      true,
      meteringPointList
    )
    console.timeEnd("as4") 
    console.time("as5")
    // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
    const { minDate, maxDate } = await findMinMaxExeDate(this.prisma, start_date, end_date)
    let startForEviden = start ?? minDate
    if (!startForEviden || !startForEviden.isValid()) {
      startForEviden = today.startOf('month')
    }
    let endForEviden = end ?? maxDate
    if (!endForEviden || !endForEviden.isValid() || endForEviden.isAfter(today)) {
      endForEviden = today
    }
    console.timeEnd("as5")
    let evidenApi = []
    console.time("as6")
    if (tab === '1') {
      console.log(`startForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD') : `, startForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'));
      console.log(`endForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD') : `, endForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'));
      let totalRecord: number | undefined = undefined
      console.time("as6.1 Eviden")
      minDate &&
        (await this.evidenApiAllocationContractPointByNom(
          {
            start_date: startForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
            end_date: endForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
            skip: 0,
            limit: 1
          },
          (total_record: number) => {
            totalRecord = total_record
          }
        ))
      console.timeEnd("as6.1 Eviden")
      console.time("as6.12 Eviden") 
      const evidenData =
        (minDate &&
          (await this.evidenApiAllocationContractPointByNom({
            start_date: startForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
            end_date: endForEviden?.tz('Asia/Bangkok')?.format('YYYY-MM-DD'),
            skip: totalRecord ? 0 : skip,
            limit: totalRecord ? totalRecord : limit,
          }))) ||
        []
        console.timeEnd("as6.12 Eviden")
        console.log('evidenData : ', evidenData);
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

      evidenApi = evidenData.filter((item: any) => {
        const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
        return executeEodList?.some((executeData: any) => {
          const executeStart = getTodayNowAdd7(executeData?.start_date_date)
          const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
          return executeData.request_number_id == item.request_number && executeStart.isSameOrBefore(itemGasDay, 'day') && executeEnd.isSameOrAfter(itemGasDay, 'day')
        })
      })
      console.log('executeEodList : ', executeEodList);
      console.log('evidenApi : ', evidenApi);
    } else {
      let totalRecord: number | undefined = undefined
      console.log(`minDate.tz('Asia/Bangkok').format('YYYY-MM-DD') : `, minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'));
      console.log(`maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD') : `, maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'));
      console.time("as6.2 Eviden")
      minDate &&
        (await this.evidenApiAllocationContractPointIntradayByNom(
          {
            start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            skip: 0,
            limit: 1
          },
          (total_record: number) => {
            totalRecord = total_record
          }
        ))
      const evidenData =
        (minDate &&
          (await this.evidenApiAllocationContractPointIntradayByNom({
            start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
            skip: totalRecord ? 0 : skip,
            limit: totalRecord ? totalRecord : limit
          }))) ||
        []
      console.timeEnd("as6.2 Eviden")
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

      evidenApi = evidenData.filter((item: any) => {
        const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
        return executeIntradayList?.some((executeData: any) => {
          const executeGasDay = getTodayNowAdd7(executeData.gas_day)
          return executeData.request_number_id == item.request_number && executeGasDay.isSame(itemGasDay, 'day') && executeData.gas_hour == item.gas_hour
        })
      })
    }
    console.timeEnd("as6")

    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: start.toDate()
            }
          },
          {
            gas_day: {
              lte: end.toDate()
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })
    console.time("as7")
    // พี่แนนให้เอาตัวกรอก  publication ออกวันที่ 11 ก.ค. 2568
    const latestByGasDay = evidenApi
      // .filter((item:any)=>{
      //   return !publicationCenterDeletedList?.some((f: any) => {
      //     return (
      //       f?.execute_timestamp === item.execute_timestamp &&
      //       f?.gas_day_text === item.gas_day
      //     );
      //   })
      // })
      .reduce((acc: any, current: any) => {
        const gasDay = current.gas_day

        if (!acc[gasDay] || current.execute_timestamp > acc[gasDay].execute_timestamp) {
          acc[gasDay] = current
        }

        return acc
      }, {})
    // Convert back to array and update the response
    const filteredData = Object.values(latestByGasDay)

    // Filter based on active records
    const filteredEvidenApi = filteredData.flatMap((fm: any) => {
      const { data: data1, ...fmD } = fm

      // Find active data for this gas_day
      const activeDataForDate = activeData.find((ad) => ad.date === fm.gas_day)

      const nData = data1?.flatMap((dFm: any) => {
        const { data: data2, ...fmD2 } = dFm

        // Validate contract and shipper existence
        const contractValidation = validateContractAndShipper(dFm, activeDataForDate)
        // if (!contractValidation.isValid) {
        //   return [];
        // }

        const nData2 = data2
          // .filter((dFm2: any) => {
          //   return validatePointByType(dFm2, activeDataForDate);
          // })
          .map((dFm2: any) => {
            validatePointByType(dFm2, activeDataForDate)
            return {
              ...fmD,
              ...fmD2,
              ...dFm2,
              group: contractValidation.shipperObj
            }
          })

        return [...nData2]
      })

      return [...nData]
    })
    console.timeEnd("as7")
    // พี่แนนให้เอาตัวกรอก  publication ออกวันที่ 11 ก.ค. 2568
    // const publication = filteredEvidenApi?.filter((f: any) => {
    //   return f?.publication === true;
    // });
    // Apply additional filtering based on nomination_point_arr and shipper_arr
    let finalFilteredData = filteredEvidenApi
    console.time("as8")
    // Filter by nomination_point_arr if provided
    // if (nomination_point_arr && nomination_point_arr.length > 0) {
    // }
    if (nomination_point_arr && nomination_point_arr.length > 0) {
      finalFilteredData = finalFilteredData.filter((item: any) => {
        return nomination_point_arr.includes(item.point)
      })
    }
    if (share === 'on' || share == true) {
      finalFilteredData = finalFilteredData.filter((item: any) => meteringPointList.some((meteringPoint: any) => meteringPoint.nomination_point?.nomination_point === item.point))
    }

    // Filter by shipper_arr if provided
    if (shipper_arr && shipper_arr.length > 0) {
      finalFilteredData = finalFilteredData.filter((item: any) => {
        return shipper_arr.includes(item.shipper)
      })
    }
    console.timeEnd("as8")
    console.time("as9")
    // Transform to expected result structure
    const transformedResult = transformToShipperReportStructure(finalFilteredData, getDataLogic, activeData)
    console.timeEnd("as9")
    return transformedResult
  }

  //
  async allocationShipperReportDownload(payload: any, userId: any) {
    const allocationShipperReport = await this.allocationShipperReportCallOnlyByNomination(payload, userId)

    const newDate = getTodayNowAdd7()

    const jsonString = JSON.stringify(allocationShipperReport)

    const create = await this.prisma.allocation_shipper_report_approved.create({
      data: {
        gas_day_from: payload?.start_date,
        gas_day_from_d: getTodayNowAdd7(payload?.start_date).toDate(),
        gas_day_to: payload?.end_date,
        gas_day_to_d: getTodayNowAdd7(payload?.end_date).toDate(),
        file: 'Allocation Summary Shipper Report',
        jsonData: jsonString,
        nomination_point_arr_temp: JSON.stringify(payload?.nomination_point_arr),
        shipper_arr_temp: JSON.stringify(payload?.shipper_arr),
        share_temp: JSON.stringify(payload?.share),
        skip_temp: JSON.stringify(payload?.skip),
        limit_temp: JSON.stringify(payload?.share),
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    return create
  }

  async allocationShipperReportDownloadGet() {
    const resData = await this.prisma.allocation_shipper_report_approved.findMany({
      where: {},
      include: {
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            signature_base_64: true
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
    return resData
  }

  async testMeterOnce() {
    const start = Date.now()

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'getLast',
        mode: 'metering',

        start_date: '2025-01-01',
        end_date: '2025-07-01'
      })
    )

    const end = Date.now()
    const durationMs = end - start

    return {
      durationMs,
      meteredMicroData: meteredMicroData
    }
  }

  // allowcation_management_sent_email
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
      from: `<${process.env.SMTP_USER}> `,
      to: sendEmail,
      subject: subject || '',
      attachments: [
        {
          filename: 'AllocationManagement.xlsx',
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
      html: `<!DOCTYPE html >
      <html lang="en" >
        <head>
        <meta charset="UTF-8" >
          <meta name="viewport" content="width=device-width, initial-scale=1.0" >
            <title>Document </title>
            </head>
            <body >
            <div 
    style="width: 500px; 
    border: 1px solid #D6D6D6;
    height: auto;
    border-radius: 15px;
    margin: 10px auto;
    padding: 15px; "
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
    margin-bottom: 40px; "
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
      ${detail || '-'}
    </div>

      <div style="margin-top: 30px; font-size: 15px;" >
        <div style="text-align: center;" >
          Thank You,
            </div>
            <div style = "text-align: center;" >
              TPA, Systems
              </div>
              </div>
              <div style = "margin-top: 40px; text-align: center; font-size: 14px;" >
                <span>If you did not initiate this request, please contact us immediately at </span>
                  <a href = "#" > support@ptt.com.</a>
                    </div>
                    </div>
                    </body>
                    </html>`
    })

    return info
  }

  async allocationManagementSendEmailGet(userId: any) {
    const resData = await this.prisma.allowcation_management_sent_email?.findFirst({
      where: {},
      orderBy: {
        id: 'desc'
      }
    })

    return resData
  }

  async allocationManagementSendEmail(payload: any, userId: any) {
    const { subject, sendEmail, sendEmailGroup, userType, detail, exportFile, sortedDataId } = payload

    const header = 'Allocation Management'

    const resData = await this.allcationOnceId_(exportFile?.bodys, null, sortedDataId)
    // const resData = await this.allcationOnceId(exportFile?.bodys, null);
    // const resData = sortedData
    // เปลี่ยนเป็น รับจาก fontend

    if (!resData || (Array.isArray(resData) && resData?.length === 0)) {
      const startDate = exportFile?.bodys?.start_date
      const endDate = exportFile?.bodys?.end_date
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Data not found ${startDate ? `Since ${startDate}` : ''} ${endDate && startDate ? `to ${endDate}` : ''}. The email cannot be sent. Please try again later.`
        },
        HttpStatus.BAD_REQUEST
      )
    }

    let aresData = []
    if (userType === 3) {
      // shipper
      // กรอง shipper แยก

      for (let i = 0; i < sendEmailGroup.length; i++) {
        let emails = []
        if (sendEmailGroup[i]?.email) {
          emails.push(sendEmailGroup[i].email)
        }
        const { account } = sendEmailGroup[i]
        for (let iAcc = 0; iAcc < account.length; iAcc++) {
          if (account[iAcc].email) {
            emails.push(account[iAcc].email)
          }
        }

        const findShipper = resData?.filter((f: any) => {
          return f?.group?.id === sendEmailGroup[i]?.id
        })
        if (findShipper.length > 0) {
          // รายการที่ Diff ระหว่าง Shipper Allocation Review และ System Allocation
          const diffGreen = findShipper?.filter((f: any) => {
            const shipperReview = f?.allocation_management_shipper_review?.[0]?.shipper_allocation_review ? Number(f?.allocation_management_shipper_review?.[0]?.shipper_allocation_review) : 0

            return shipperReview !== f?.systemAllocation
          })
          // if (diffGreen.length > 0) {
          const emailText = emails.join(', ')
          aresData.push({
            shipperId: sendEmailGroup[i]?.id, // แยกส่งตามข้อมูล shipper
            userType: userType,
            data: findShipper,
            emailText: emailText
          })
          // }
        }
      }
    } else {
      let emails = []
      // tso อื่นๆ // เอาทุกเมล
      for (let i = 0; i < sendEmailGroup.length; i++) {
        if (sendEmailGroup[i]?.email) {
          emails.push(sendEmailGroup[i].email)
        }
        const { account } = sendEmailGroup[i]
        for (let iAcc = 0; iAcc < account.length; iAcc++) {
          if (account[iAcc].email) {
            emails.push(account[iAcc].email)
          }
        }
      }

      const emailText = emails.join(', ')

      aresData = [
        {
          shipperId: null, // tso ส่งเหมือนกันหมด ไม่ต้องแยกแบบ shipper
          userType: userType,
          data: resData,
          emailText: emailText
        }
      ]
    }
    for (let i = 0; i < aresData.length; i++) {
      const excelBuffer: any = await this.exportFilesService.epAllocationAllocationManagementSentEmailOnly(null, exportFile, userId, aresData[i]?.data, aresData[i]?.userType, aresData[i]?.shipperId)
      // ทำแยกส่งตาม user type
      const info = await this.sendEmailProviderCustom(
        header,
        subject,
        aresData[i]?.emailText, // email []
        detail,
        excelBuffer,
        null
      )
    }

    const newDate = getTodayNowAdd7()
    // return
    const create = await this.prisma.allowcation_management_sent_email.create({
      data: {
        subject: subject || null,
        detail: detail || null,
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by: Number(userId)
      }
    })

    return create

    // return
  }

  // https://app.clickup.com/t/86eu48rpe
  async executeNotiInapp(payload: any) {
    const adminAccountId = parseToNumber(process.env.SYSTEM_ACCOUNT_ID) ?? 1
    const roleMenuAllocationManagementNoticeInapp = await this.prisma.account.findMany({
      where: {
        id: {
          not: adminAccountId
        },
        account_manage: {
          some: {
            account_role: {
              some: {
                role: {
                  menus_config: {
                    some: {
                      menus_id: 82,
                      f_noti_inapp: 1
                    }
                  }
                }
              }
            }
          }
        }
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        telephone: true,
        account_manage: {
          include: {
            account_role: {
              include: {
                role: true
              }
            }
          }
        }
      },
      // where:{
      //   id:{
      //     not: 1
      //   },
      //   menus_config:{
      //     some:{
      //       menus_id: 82,
      //       f_noti_inapp: 1
      //     },
      //   }
      // },
      // include:{
      //   account_role:{
      //     include:{
      //       account_manage:{
      //         include:{
      //           account:true,
      //         },
      //       }
      //     }
      //   },
      //   menus_config:{
      //     include:{
      //       menus:true,
      //     },
      //     where:{
      //       menus_id: 82, //Allocation Management
      //       f_noti_inapp: 1
      //     },
      //   }
      // },
      orderBy: {
        id: 'asc'
      }
    })

    const nAccount = roleMenuAllocationManagementNoticeInapp?.map((e: any) => {
      const { account_manage, ...nE } = e
      const role = account_manage?.[0]?.account_role?.[0]?.role?.name || null
      return {
        ...nE,
        role_name: role || null
      }
    })

    //     EOD
    //  The allocation and balancing process for all shippers and the following period of time: {01/09/2021 to 13/05/2025} {has finished OK} {(process executed on 13/05/2025 09:24:02)}.

    // Intraday
    //  The allocation and balancing process for all shippers and the following time: {01/09/2021} {has finished OK} {(process executed on 13/05/2025 09:24:02)}.

    // Case Error : EOD
    // The allocation and balancing process for all shippers and the following period of time: {01/09/2021 to 13/05/2025} has failed {(process attempted on 13/05/2025 09:24:02)}.

    // Case Error : Intraday
    // The allocation and balancing process for all shippers and the following time: {01/09/2021} has failed {(process attempted on 13/05/2025 09:24:02)}.

    // const message = `The allocation and balancing process for all shippers and the following period of time: {01/09/2021 ? 13/05/2025} {has finished OK} {(process executed on 13/05/2025 09:24:02)}.`

    return nAccount
  }

  async allocationReportViewGet2(payload: any, userId: any) {
    const { start_date, end_date, skip, limit } = payload

    const start = start_date ? getTodayStartAdd7(start_date) : null
    const end = end_date ? getTodayEndAdd7(end_date) : null

    if (!start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

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

    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: start.toDate()
            }
          },
          {
            gas_day: {
              lte: end.toDate()
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })

    // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
    const { minDate, maxDate } = await findMinMaxExeDate(this.prisma, start_date, end_date)

    let totalRecord: number | undefined = undefined
    minDate &&
      (await this.evidenApiAllocationContractPointByNom(
        {
          start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          skip: 0,
          limit: 1
        },
        (total_record: number) => {
          totalRecord = total_record
        }
      ))
    const evidenApi =
      (minDate &&
        (await this.evidenApiAllocationContractPointByNom({
          start_date: minDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          end_date: maxDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          skip: totalRecord ? 0 : skip,
          limit: totalRecord ? totalRecord : limit
        }))) ||
      []

    const entryExitMaster = await this.prisma.entry_exit.findMany({
      where: {}
    })

    const matchWithExecuteList = evidenApi.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeEodList?.some((executeData: any) => {
        const executeStart = getTodayNowAdd7(executeData?.start_date_date)
        const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
        return executeData.request_number_id == item.request_number && executeStart.isSameOrBefore(itemGasDay, 'day') && executeEnd.isSameOrAfter(itemGasDay, 'day')
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

    // Extract gas days and generate date array
    const dateArray = extractAndGenerateDateArray(filteredData)

    // Build active data for all dates
    const activeData = await buildActiveDataForDates(dateArray, this.prisma)

    const newEOD =
      filteredData?.flatMap((fm: any) => {
        const { data: data1, ...fmD } = fm

        // Find active data for this gas_day
        const activeDataForDate = activeData.find((ad) => ad.date === fm.gas_day)

        const nData = data1?.flatMap((dFm: any) => {
          const { data: data2, ...fmD2 } = dFm

          // Validate contract and shipper existence
          const contractValidation = validateContractAndShipper(dFm, activeDataForDate)
          // if (!contractValidation.isValid) {
          //   return [];
          // }

          const nData2 = data2
            // .filter((dFm2: any) => {
            //   return validatePointByType(dFm2, activeDataForDate);
            // })
            .map((dFm2: any) => {
              validatePointByType(dFm2, activeDataForDate)
              return {
                ...fmD,
                ...fmD2,
                ...dFm2,
                group: contractValidation.shipperObj
              }
            })

          return [...nData2]
        })

        return [...nData]
      }) || []

    const resultEodLast: any = Object.values(
      newEOD.reduce((acc, curr) => {
        const key = `${curr.gas_day}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )

    //  db
    // const publicationCenter = await this.publicationCenter();

    let allocationReportView = await this.prisma.allocation_report_view.findMany({
      include: {
        allocation_report: true
      }
    })

    const newEODF = await Promise.all(
      resultEodLast?.map(async (eod: any) => {
        const contractCapacity = eod['values']?.find((f: any) => f?.tag === 'contractCapacity')?.value ?? null
        const nominationValue = eod['values']?.find((f: any) => f?.tag === 'nominatedValue')?.value ?? null
        const allocatedValue = eod['values']?.find((f: any) => f?.tag === 'allocatedValue')?.value ?? null
        // const overusage = eod['values']?.find((f:any) => f?.tag === "overusage")?.value ?? null
        // const intradaySystemAllocation = null

        const entry_exit_obj = entryExitMaster.find((f: any) => {
          return f?.name?.toUpperCase() === eod['entry_exit']?.toUpperCase()
        })

        const findAllocationReport = allocationReportView.find((f: any) => {
          return f?.gas_day_text === eod?.['gas_day'] && f?.shipper_name_text === eod?.['shipper'] && f?.contract_code_text === eod?.['contract'] && f?.point_text === eod?.['point'] && f?.entry_exit_text === eod?.['entry_exit'] && f?.area_text === eod?.['area'] && f?.zone_text === eod?.['zone']
        })

        // let isNotExitInDb = false
        // const findPublication = publicationCenter.find((f: any) => {
        //   return (
        //     f?.execute_timestamp === eod['execute_timestamp'] &&
        //     f?.gas_day_text === eod['gas_day'] &&
        //     (eod['gas_hour'] ? f?.gas_hour === eod['gas_hour'] : f?.gas_hour == null)
        //   );
        // });

        // if (!findPublication) {
        //   const publicationCenter = await this.prisma.publication_center.findMany({
        //     where: {
        //       execute_timestamp: eod['execute_timestamp'],
        //       gas_day_text: eod['gas_day'],
        //       gas_hour: (eod['gas_hour'] ? eod['gas_hour'] : null)
        //     },
        //   })

        //   isNotExitInDb = publicationCenter.length < 1
        // }

        const { values, ...nEod } = eod

        return {
          // publication: !!findPublication || isNotExitInDb,
          publication: true,
          id: findAllocationReport?.id,
          ...eod,
          contractCapacity,
          nominationValue,
          allocatedValue,
          entry_exit_obj,
          findAllocationReport
        }
      })
    )
    // contract_point
    // point_type
    return newEODF
  }

  async allocationManagement2Old(payload: any, userId: any) {
    // ฟังก์ชันนี้รวบรวมข้อมูล allocation จากหลายแหล่ง (EOD, Intraday, Nomination, Metering)
    // เพื่อเตรียมข้อมูลที่ใช้แสดงบน Allocation Management (Tab 2)
    const { start_date, end_date, skip, limit, ignoreDetail } = payload

    // แปลงวันที่ให้เป็น dayjs ที่ timezone +7 พร้อมกันเพื่อใช้เป็นขอบเขตหลักของการดึงข้อมูล
    const startDate = getTodayStartAdd7(start_date == 'undefined' ? undefined : start_date)
    const endDate = getTodayEndAdd7(end_date == 'undefined' ? undefined : end_date)
    console.time("allocationManagement2 s1")
    // ดึง Execute (EOD) ที่อยู่ในช่วงวันที่ เพื่อใช้ตรวจสอบข้อมูลที่เผยแพร่จริง
    const executeEodList = await this.prisma.execute_eod.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        start_date_date: {
          lte: endDate.toDate()
        },
        end_date_date: {
          gte: startDate.toDate()
        }
      }
    })
    console.timeEnd("allocationManagement2 s1")
    console.time("allocationManagement2 s2")
    // ดึง Execute Intraday รายชั่วโมงในช่วงเวลาเดียวกัน
    const executeIntradayList =
      ignoreDetail == true
        ? []
        : await this.prisma.execute_intraday.findMany({
          where: {
            status: {
              equals: 'OK',
              mode: 'insensitive'
            },
            gas_day_date: {
              gte: startDate.toDate(),
              lte: endDate.toDate()
            }
          }
        })
    console.timeEnd("allocationManagement2 s2")
    console.time("allocationManagement2 s3")
    // ดึงรายการที่ถูกยกเลิกการเผยแพร่จาก Publication Center เพื่อใช้ตัดข้อมูลออก
    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: startDate.toDate()
            }
          },
          {
            gas_day: {
              lte: endDate.toDate()
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })

    // เตรียมข้อมูล master สำหรับ entry_exit ทั้งหมด
    const entryExitMaster = await this.prisma.entry_exit.findMany({
      where: {}
    })

    const areaMaster = await this.prisma.area.findMany({
      where: {}
    })

    // ดึง master metering point ที่ active ภายในช่วงวันที่
    const meterMaster = await this.prisma.metering_point.findMany({
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
        nomination_point: true,
        area: {
          select: {
            id: true,
            name: true
          }
        },
        zone: {
          select: {
            id: true,
            name: true
          }
        },
        non_tpa_point: {
          include: {
            nomination_point: {
              include: {
                contract_point_list: {
                  include: {
                    shipper_contract_point: true
                  }
                },
                customer_type: true
              }
            }
          }
        }
      }
    })
    console.timeEnd("allocationManagement2 s3")
    console.time("allocationManagement2 s4")
    // https://app.clickup.com/t/86eu49dch
    const nominationFile = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
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
          },
          {
            query_shipper_nomination_status: {
              id: {
                in: [2, 5]
              }
            }
          },
          {
            OR: [
              // Daily nominations: exact date match
              {
                nomination_type: {
                  id: 1
                },
                gas_day: {
                  gte: startDate.toDate(),
                  lte: endDate.toDate()
                }
              },
              // Weekly nominations: same week
              {
                nomination_type: {
                  id: 2
                },
                gas_day: {
                  gte: startDate.startOf('week').toDate(),
                  lte: endDate.endOf('week').toDate()
                }
              }
            ]
          }
        ]
      },
      include: {
        contract_code: true,
        reserve_balancing_gas_contract: true,
        group: true,
        nomination_version: {
          where: {
            flag_use: true
          },
          include: {
            nomination_full_json: true,
            nomination_row_json: true
          }
        }
      }
    })
    console.timeEnd("allocationManagement2 s4")
    console.time("allocationManagement2 s5")
    const convertNomFile = nominationFile.map((e: any) => {
      // nomination_type_id 1 daily, 2 weekly
      e['gas_day'] = dayjs(e['gas_day']).tz('Asia/Bangkok').format('YYYY-MM-DD')
      e['nomination_version'] = e['nomination_version'].map((nv: any) => {
        nv['nomination_full_json'] = nv['nomination_full_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        nv['nomination_row_json'] = nv['nomination_row_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        return { ...nv }
      })
      let fullData = e['nomination_version'][0]?.['nomination_full_json'][0]
      let rowData = e['nomination_version'][0]?.['nomination_row_json']
      delete e['nomination_version']
      return {
        ...e,
        fullData,
        rowData
      }
    })
    const { minDate, maxDate } = await findMinMaxExeDate(this.prisma, start_date, end_date)

    console.timeEnd("allocationManagement2 s5")
    console.time("allocationManagement2 s6")

    let totalRecord: number | undefined = undefined
    minDate &&
      (await this.evidenApiAllocationEod(
        {
          start_date: minDate.format('YYYY-MM-DD'),
          end_date: maxDate.format('YYYY-MM-DD'),
          skip: 0,
          limit: 1
        },
        (total_record: number) => {
          totalRecord = total_record
        }
      ))
    const evidenApiAllocationEod =
      (minDate &&
        (await this.evidenApiAllocationEod({
          start_date: minDate.format('YYYY-MM-DD'),
          end_date: maxDate.format('YYYY-MM-DD'),
          skip: totalRecord ? 0 : skip,
          limit: totalRecord ? totalRecord : limit
        }))) ||
      []
     console.timeEnd("allocationManagement2 s6")
     console.time("allocationManagement2 s7")

    const matchWithExecuteList = evidenApiAllocationEod.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeEodList?.some((executeData: any) => {
        const executeStart = getTodayNowAdd7(executeData?.start_date_date)
        const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
        return executeData.request_number_id == item.request_number && executeStart.isSameOrBefore(itemGasDay, 'day') && executeEnd.isSameOrAfter(itemGasDay, 'day')
      })
    })
    const publishData = matchWithExecuteList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData.execute_timestamp && unpublishData?.gas_day_text === evidenData.gas_day
      })
    })
    // Get the latest execute_timestamp for each unique combination of gas_day
    const latestPublishData = publishData.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, [])
    console.timeEnd("allocationManagement2 s7")
    console.time("allocationManagement2 s8")
    // เตรียม master ของ group และ concept point ที่ active ตามช่วง gas_day ที่มีข้อมูล
    let groupMaster: group[] = []
    let conceptPointMaster: conceptPointWithRelations[] = []
    if (latestPublishData && latestPublishData.length > 0) {
      // Extract all unique gas_day values and convert to dayjs objects for proper date comparison
      const gasDays = [...new Set(latestPublishData.map((item: any) => item.gas_day))]

      if (gasDays.length > 0) {
        // Convert to dayjs objects for proper date comparison
        const gasDayObjects = gasDays.map((date) => getTodayStartAdd7(date))

        // Find min and max gas_day using dayjs comparison
        const minGasDayObj = gasDayObjects.reduce((min, current) => (current.isBefore(min) ? current : min))
        const maxGasDayObj = gasDayObjects.reduce((max, current) => (current.isAfter(max) ? current : max))

        if (minGasDayObj.isValid() && maxGasDayObj.isValid()) {
          groupMaster = await this.prisma.group.findMany({
            where: {
              user_type_id: 3,
              OR: [
                {
                  end_date: null
                },
                {
                  end_date: {
                    gt: minGasDayObj.toDate()
                  }
                }
              ],
              start_date: {
                lte: maxGasDayObj.toDate()
              }
            }
          })

          conceptPointMaster = await this.prisma.concept_point.findMany({
            where: {
              OR: [
                {
                  end_date: null
                },
                {
                  end_date: {
                    gt: minGasDayObj.toDate()
                  }
                }
              ],
              start_date: {
                lte: maxGasDayObj.toDate()
              }
            },
            ...conceptPointPopulate
          })
        }
      }
    }
    console.timeEnd("allocationManagement2 s8")
    console.time("allocationManagement2 s9")
    // คลี่โครงสร้าง Eviden (ระดับ gas_day → contract → point) ให้อยู่ในรูป flat list พร้อมข้อมูล group
    const newEOD = latestPublishData.flatMap((fm: any) => {
      const { data: data1, ...fmD } = fm

      const gasDayjs = getTodayNowYYYYMMDDDfaultAdd7(fm.gas_day)
      const gasDay = gasDayjs.toDate()

      const nData = data1?.flatMap((dFm: any) => {
        const { data: data2, ...fmD2 } = dFm

        const activeGroup: group = groupMaster.find((group) => group.start_date <= gasDay && (group.end_date === null || group.end_date >= gasDay) && isMatch(group.id_name, dFm.shipper))

        const nData2 = data2.map((dFm2: any) => {
          return {
            ...fmD,
            ...fmD2,
            ...dFm2,
            group: activeGroup
          }
        })

        return [...nData2]
      })

      return [...nData]
    })
    console.timeEnd("allocationManagement2 s9")
    console.time("allocationManagement2 s10")
    // Generate dateArrayForIntraday based on actual gas_day values from newEOD
    const dateArrayForIntraday: string[] = []

    if (newEOD && newEOD.length > 0) {
      // Extract all unique gas_day values and convert to dayjs objects for proper date comparison
      const gasDays = [...new Set(newEOD.map((item: any) => item.gas_day))]

      if (gasDays.length > 0) {
        // Convert to dayjs objects for proper date comparison
        const gasDayObjects = gasDays.map((date) => getTodayStartAdd7(date))

        // Find min and max gas_day using dayjs comparison
        const minGasDayObj = gasDayObjects.reduce((min, current) => (current.isBefore(min) ? current : min))
        const maxGasDayObj = gasDayObjects.reduce((max, current) => (current.isAfter(max) ? current : max))

        if (minGasDayObj.isValid() && maxGasDayObj.isValid()) {
          let current = minGasDayObj

          while (current.isSameOrBefore(maxGasDayObj)) {
            dateArrayForIntraday.push(current.format('YYYY-MM-DD'))
            current = current.add(1, 'day')
          }
        }
      }
    }
    console.timeEnd("allocationManagement2 s10")
    console.time("allocationManagement2 s11")
    let intradayEviden =
      ignoreDetail == true
        ? []
        : (
          await Promise.all(
            dateArrayForIntraday.map(async (date) => {
              try {
                let intraDayTotalRecord: number | undefined = undefined
                await this.evidenApiAllocationIntraday(
                  {
                    gas_day: date,
                    start_hour: 1,
                    end_hour: 24,
                    skip: 0,
                    limit: 1
                  },
                  (total_record: number) => {
                    intraDayTotalRecord = total_record
                  }
                )
                const evidenApiAllocationIntraday = await this.evidenApiAllocationIntraday({
                  gas_day: date,
                  start_hour: 1,
                  end_hour: 24,
                  skip: intraDayTotalRecord ? 0 : skip,
                  limit: intraDayTotalRecord ? intraDayTotalRecord : limit
                })
                return evidenApiAllocationIntraday
              } catch (error) {
                return []
              }
            })
          )
        ).flat()
    
    const matchWithExecuteIntradayList = intradayEviden.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeData.gas_hour == item.gas_hour && executeGasDay.isSame(itemGasDay, 'day')
      })
    })

    const publishIntradayData = matchWithExecuteIntradayList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData.execute_timestamp && unpublishData?.gas_day_text === evidenData.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
      })
    })
    console.timeEnd("allocationManagement2 s11")
    console.time("allocationManagement2 s12")
    // Get the latest execute_timestamp for each unique combination of gas_day
    const latestPublishIntradayData = publishIntradayData.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.gas_hour > acc[existingIndex].gas_hour) {
        acc[existingIndex] = current
      } else if (current.gas_hour == acc[existingIndex].gas_hour && current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, [])
    console.timeEnd("allocationManagement2 s12")
    console.time("allocationManagement2 s13")
    let allocationMaster = await this.prisma.allocation_management.findMany({
      where: {
        gas_day: {
          gte: startDate.toDate(),
          lte: endDate.toDate()
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
          // orderBy: { id: "desc" }
        },
        allocation_management_shipper_review: {
          include: {},
          take: 1,
          orderBy: {
            create_date: 'desc'
          }
        },
        allocation_status: true
      }
    })
    console.timeEnd("allocationManagement2 s13")
    console.time("allocationManagement2 s14")
    let newAllocation = []
    const resultEodLast: any = Object.values(
      newEOD.reduce((acc, curr) => {
        const key = `${curr.gas_day}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )

    for (let i = 0; i < resultEodLast.length; i++) {
      const findAllocationMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === resultEodLast[i]?.gas_day &&
          f?.shipper_name_text === resultEodLast[i]?.shipper &&
          f?.contract_code_text === resultEodLast[i]?.contract &&
          f?.point_text === resultEodLast[i]?.point &&
          f?.entry_exit_text === resultEodLast[i]?.entry_exit &&
          f?.area_text === resultEodLast[i]?.area &&
          f?.zone_text === resultEodLast[i]?.zone
        )
      })

      if (!!!findAllocationMaster) {
        newAllocation.push({
          allocation_status_id: 1,
          shipper_name_text: resultEodLast[i]?.shipper,
          gas_day_text: resultEodLast[i]?.gas_day,
          contract_code_text: resultEodLast[i]?.contract,
          point_text: resultEodLast[i]?.point,
          entry_exit_text: resultEodLast[i]?.entry_exit,
          area_text: resultEodLast[i]?.area,
          zone_text: resultEodLast[i]?.zone,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(resultEodLast[i]?.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId)
        })
      }
    }
    console.timeEnd("allocationManagement2 s14")
    console.time("allocationManagement2 s15")
    if (newAllocation.length > 0) {
      // create
      try {
        await this.prisma.allocation_management.createMany({
          data: newAllocation
        })
      } catch (error) {
        console.log('Create log for allocation management error: ', error)
      }

      allocationMaster = await this.prisma.allocation_management.findMany({
        where: {
          gas_day: {
            gte: startDate.toDate(),
            lte: endDate.toDate()
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
            // orderBy: { id: "desc" }
          },
          allocation_management_shipper_review: {
            include: {},
            take: 1,
            orderBy: {
              create_date: 'desc'
            }
          },
          allocation_status: true
        }
      })
    }
    console.timeEnd("allocationManagement2 s15")
    console.time("allocationManagement2 s16")
    const nEodPorp = resultEodLast.map((eod: any) => {
      // หา nomination ประจำวัน/สัปดาห์ที่ตรงกับ shipper/contract/point
      const dailyNominationList = convertNomFile?.filter((f: any) => {
        return f?.gas_day === eod['gas_day'] && f?.group?.id_name === eod['shipper'] && (f?.contract_code?.contract_code === eod['contract'] || f?.reserve_balancing_gas_contract?.res_bal_gas_contract === eod['contract']) && f?.nomination_type_id == 1
      })

      const weeklyNominationList = convertNomFile?.filter((f: any) => {
        return (
          getTodayNowYYYYMMDDDfaultAdd7(f?.gas_day).isSame(getTodayNowYYYYMMDDDfaultAdd7(eod['gas_day']), 'week') &&
          f?.group?.id_name === eod['shipper'] &&
          (f?.contract_code?.contract_code === eod['contract'] || f?.reserve_balancing_gas_contract?.res_bal_gas_contract === eod['contract']) &&
          f?.nomination_type_id == 2 &&
          !dailyNominationList.some((daily: any) => daily.contract_code_id == f?.contract_code_id)
        )
      })

      const dayOfWeek = Number(getTodayStartAdd7(eod['gas_day']).format('d')) // The day of the week, with Sunday as 0
      let nominationValue: number | null = null
        // รวมค่าจาก nomination ที่ตรงกับเงื่อนไขเพื่อนำไปเทียบกับ allocation
        ;[...dailyNominationList, ...weeklyNominationList].map((nominationFile) => {
          nominationFile.rowData?.map((rowDataItem: any) => {
            if (isMatch(rowDataItem?.data_temp['3'], eod['point']) && isMatch(rowDataItem?.data_temp['9'], 'MMBTU/D') && isMatch(rowDataItem?.area_text, eod['area']) && isMatch(rowDataItem?.zone_text, eod['zone'])) {
              let newNominationValue: number | null = null
              if (nominationFile?.nomination_type_id === 1) {
                newNominationValue = parseToNumber(rowDataItem?.data_temp['38'])
              } else {
                newNominationValue = parseToNumber(rowDataItem?.data_temp[`${14 + dayOfWeek}`])
              }

              if (nominationValue) {
                if (newNominationValue || newNominationValue == 0) {
                  nominationValue += newNominationValue
                }
              } else {
                nominationValue = newNominationValue
              }
            }
          })
        })

      const systemAllocation = eod['value']
      const previousAllocationTPAforReview = eod['previous_value']

      // หา intraday ที่ตรงกับ gas_day เดียวกันเพื่อแสดงค่า system รายชั่วโมง
      const intradayDataByGasDay = latestPublishIntradayData.find((f: any) => {
        return (f?.gasday ?? f.gas_day) === eod['gas_day']
      })
      const { data: intraFil = [], ...intradayByGasDay } = intradayDataByGasDay ?? {}

      const intraFilValue = intraFil
        .filter((f: any) => f?.data?.some((ff: any) => ff?.point === eod?.['point']) && f?.contract === eod['contract'] && f?.shipper === eod['shipper'])
        .map((f: any) => {
          const data =
            f?.data?.find((ff: any) => {
              return ff?.point === eod?.['point'] && ff?.point_type === eod?.point_type && ff?.area === eod?.area && ff?.zone === eod?.zone && ff?.entry_exit === eod?.entry_exit
            }) ?? []
          return {
            ...f,
            data: data
          }
        })
      const { data: dataIntraDay = null, ...nIntraDay } = intraFilValue.at(-1) ?? {}

      const intradayUse = {
        ...nIntraDay,
        ...intradayByGasDay,
        data: dataIntraDay
      }
      const intradaySystem = intradayUse?.data?.value

      // Find active data for this gas_day
      let meterName: string[] = []
      // แม็ป point กับ metering ที่เกี่ยวข้องตามประเภทของ point
      if (meterMaster && isMatch(eod['point_type'], 'NOM')) {
        meterName = meterMaster.filter((meteringPoint: any) => isMatch(meteringPoint.nomination_point?.nomination_point, eod['point'])).map((meteringPoint: any) => meteringPoint.metered_point_name)
      } else if (conceptPointMaster && isMatch(eod['point_type'], 'CONCEPT')) {
        let conceptPointName = eod['point']
        if (isMatch(eod['point'], 'East_to_BVW10')) {
          conceptPointName = 'BVW10 East'
        } else if (isMatch(eod['point'], 'West_to_BVW10')) {
          conceptPointName = 'BVW10 West'
        } else if (isMatch(eod['point'], 'East_to_RA6')) {
          conceptPointName = 'RA6 EAST'
        } else if (isMatch(eod['point'], 'West_to_RA6')) {
          conceptPointName = 'RA6 WEST'
        }
        meterName = conceptPointMaster
          .filter((conceptPoint: any) => {
            return conceptPoint.type_concept_point?.name?.toUpperCase()?.includes('METER') && (isMatch(conceptPoint.concept_point, eod['point']) || isMatch(conceptPoint.concept_point, conceptPointName))
          })
          .map((conceptPoint: any) => conceptPoint.concept_point)
      } else if (meterMaster && isMatch(eod['point_type'], 'NONTPA')) {
        meterName = meterMaster.filter((meteringPoint) => isMatch(meteringPoint.non_tpa_point?.non_tpa_point_name, eod['point'])).map((meteringPoint: any) => meteringPoint.metered_point_name)
      } else {
        const meterFil = meterMaster.filter((f: any) => {
          return f?.nomination_point?.nomination_point === eod['point']
        })
        meterName = [...new Set([...meterFil?.map((mF: any) => mF?.metered_point_name)])]
      }

      const entry_exit_obj = entryExitMaster.find((f: any) => {
        return isMatch(f?.name, eod['entry_exit'])
      })

      const area_obj = areaMaster.find((f: any) => {
        return f?.name === eod['area']
      })

      // kom
      return {
        ...eod,
        nominationValue,
        systemAllocation,
        previousAllocationTPAforReview,
        intradaySystem,
        // meteringValue,
        meterName,
        entry_exit_obj,
        area_obj
      }
    })
    console.timeEnd("allocationManagement2 s16")
    console.time("allocationManagement2 s17")
    let meterArr = []
    for (let i = 0; i < nEodPorp.length; i++) {
      if (nEodPorp[i]?.meterName.length > 0) {
        const formateMeterG = nEodPorp[i]?.meterName.map((e: any) =>
          JSON.stringify({
            meterPointId: e,
            gasDay: nEodPorp[i]?.gas_day
          })
        )
        meterArr = [...new Set([...meterArr, ...formateMeterG])]
      }
    }
    console.timeEnd("allocationManagement2 s17")

    console.time("allocationManagement2 s18") // 1/5/2026-31/5/2026 42s
    // ดึงข้อมูล metering ตามช่วงวันที่และ list meter ที่เกี่ยวข้อง
    const meterUse =
      ignoreDetail == true
        ? []
        : await this.meteringManagementService.getDataLogic2(
          {
            share: 'off',
            start_date: start_date ?? dayjs().format('YYYY-MM-DD'),
            end_date: end_date ?? dayjs().format('YYYY-MM-DD')
          },
          true,
          meterMaster
        )
    console.timeEnd("allocationManagement2 s18")
    

    console.time("allocationManagement2 s19") // 11s
    let nEodPorpRes = []
    for (let iMt = 0; iMt < nEodPorp.length; iMt++) {
      const formateMeterG = nEodPorp[iMt]['meterName'].map((e: any) => ({
        meterPointId: e,
        gasDay: nEodPorp[iMt]['gas_day']
      }))

      // รวมค่าพลังงานจาก metering ทั้งหมดที่ตรงกับ point/gas_day
      let matchMeter = 0
      for (let iM = 0; iM < formateMeterG.length; iM++) {
        const matchM = meterUse?.filter((f: any) => {
          return f?.gasDay === formateMeterG[iM]?.gasDay && f?.meteringPointId === formateMeterG[iM]?.meterPointId
        })

        const matchValue = matchM?.map((nM: any) => parseToNumber(nM?.energy)).reduce((total, num) => total + (num ?? 0), 0)
        matchMeter += matchValue
      }

      const meteringValue = matchMeter

      const aMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === nEodPorp[iMt]?.gas_day &&
          f?.shipper_name_text === nEodPorp[iMt]?.shipper &&
          f?.contract_code_text === nEodPorp[iMt]?.contract &&
          f?.point_text === nEodPorp[iMt]?.point &&
          f?.entry_exit_text === nEodPorp[iMt]?.entry_exit &&
          f?.area_text === nEodPorp[iMt]?.area &&
          f?.zone_text === nEodPorp[iMt]?.zone
        )
      })

      // ผูกข้อมูล allocation จากฐานข้อมูลกับข้อมูลที่สรุปใหม่ และแนบค่า metering
      nEodPorpRes.push({
        ...nEodPorp[iMt],
        id: aMaster?.['id'] || null,
        allocation_status: aMaster?.['allocation_status'] || null,
        review_code: aMaster?.['review_code'] || null,
        allocation_management_comment: aMaster?.['allocation_management_comment'] || [],
        allocation_management_shipper_review: aMaster?.['allocation_management_shipper_review'] || [],
        meteringValue
        // aMaster,
      })
    }
    console.timeEnd("allocationManagement2 s19")

   
    return nEodPorpRes
  }

  async allocationManagement2(payload: any, userId: any) {
    // ฟังก์ชันนี้รวบรวมข้อมูล allocation จากหลายแหล่ง (EOD, Intraday, Nomination, Metering)
    // เพื่อเตรียมข้อมูลที่ใช้แสดงบน Allocation Management (Tab 2)
    const { start_date, end_date, skip, limit, ignoreDetail, share } = payload

    // แปลงวันที่ให้เป็น dayjs ที่ timezone +7 พร้อมกันเพื่อใช้เป็นขอบเขตหลักของการดึงข้อมูล
    const startDate = getTodayStartAdd7(start_date == 'undefined' ? undefined : start_date)
    const endDate = getTodayEndAdd7(end_date == 'undefined' ? undefined : end_date)
    console.time("allocationManagement2 s1")
    // ดึง Execute (EOD) ที่อยู่ในช่วงวันที่ เพื่อใช้ตรวจสอบข้อมูลที่เผยแพร่จริง
    const executeEodList = await this.prisma.execute_eod.findMany({
      where: {
        status: {
          equals: 'OK',
          mode: 'insensitive'
        },
        start_date_date: {
          lte: endDate.toDate()
        },
        end_date_date: {
          gte: startDate.toDate()
        }
      }
    })
    console.timeEnd("allocationManagement2 s1")
    console.time("allocationManagement2 s2")
    // ดึง Execute Intraday รายชั่วโมงในช่วงเวลาเดียวกัน
    const executeIntradayList =
      ignoreDetail == true
        ? []
        : await this.prisma.execute_intraday.findMany({
          where: {
            status: {
              equals: 'OK',
              mode: 'insensitive'
            },
            gas_day_date: {
              gte: startDate.toDate(),
              lte: endDate.toDate()
            }
          }
        })
    console.timeEnd("allocationManagement2 s2")
    console.time("allocationManagement2 s3")
    // ดึงรายการที่ถูกยกเลิกการเผยแพร่จาก Publication Center เพื่อใช้ตัดข้อมูลออก
    const publicationCenterDeletedList = await this.prisma.publication_center.findMany({
      where: {
        AND: [
          {
            gas_day: {
              gte: startDate.toDate()
            }
          },
          {
            gas_day: {
              lte: endDate.toDate()
            }
          },
          {
            del_flag: true
          }
        ]
      }
    })

    // เตรียมข้อมูล master สำหรับ entry_exit ทั้งหมด
    const entryExitMaster = await this.prisma.entry_exit.findMany({
      where: {}
    })

    const areaMaster = await this.prisma.area.findMany({
      where: {}
    })

    // ดึง master metering point ที่ active ภายในช่วงวันที่
    const meterMaster: meteringPointWithRelations[] = await this.prisma.metering_point.findMany({
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
                  gt: startDate.toDate()
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      ...meteringPointPopulate
    })

    const meteringPointList = (share === 'on' || share == true) ? await shareShipper(meterMaster, this.prisma, startDate, endDate.endOf('day')) : meterMaster
    console.timeEnd("allocationManagement2 s3")
    console.time("allocationManagement2 s4")
    // https://app.clickup.com/t/86eu49dch
    const nominationFile = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
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
          },
          {
            query_shipper_nomination_status: {
              id: {
                in: [2, 5]
              }
            }
          },
          {
            OR: [
              // Daily nominations: exact date match
              {
                nomination_type: {
                  id: 1
                },
                gas_day: {
                  gte: startDate.toDate(),
                  lte: endDate.toDate()
                }
              },
              // Weekly nominations: same week
              {
                nomination_type: {
                  id: 2
                },
                gas_day: {
                  gte: startDate.startOf('week').toDate(),
                  lte: endDate.endOf('week').toDate()
                }
              }
            ]
          }
        ]
      },
      include: {
        contract_code: true,
        reserve_balancing_gas_contract: true,
        group: true,
        nomination_version: {
          where: {
            flag_use: true
          },
          include: {
            nomination_full_json: true,
            nomination_row_json: true
          }
        }
      }
    })
    console.timeEnd("allocationManagement2 s4")
    console.time("allocationManagement2 s5")
    const convertNomFile = nominationFile.map((e: any) => {
      // nomination_type_id 1 daily, 2 weekly
      e['gas_day'] = dayjs(e['gas_day']).tz('Asia/Bangkok').format('YYYY-MM-DD')
      e['nomination_version'] = e['nomination_version'].map((nv: any) => {
        nv['nomination_full_json'] = nv['nomination_full_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        nv['nomination_row_json'] = nv['nomination_row_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        return { ...nv }
      })
      let fullData = e['nomination_version'][0]?.['nomination_full_json'][0]
      let rowData = e['nomination_version'][0]?.['nomination_row_json']
      delete e['nomination_version']
      return {
        ...e,
        fullData,
        rowData
      }
    })
    const { minDate, maxDate } = await findMinMaxExeDate(this.prisma, start_date, end_date)

    console.timeEnd("allocationManagement2 s5")

    console.time("allocationManagement2 s6")  // 1/5/2026-31/5/2026 13s -> 0.463s

    let totalRecord: number | undefined = undefined
    minDate &&
      (await this.evidenApiAllocationEod(
        {
          start_date: minDate.format('YYYY-MM-DD'),
          end_date: maxDate.format('YYYY-MM-DD'),
          skip: 0,
          limit: 1
        },
        (total_record: number) => {
          totalRecord = total_record
        }
      ))

    let evidenApiAllocationEod: any[] = [];

    if (minDate && maxDate) {
      const dateList: string[] = [];

      let currentDate = minDate.startOf("day");
      const endDate = maxDate.startOf("day");

      while (
        currentDate.isBefore(endDate, "day") ||
        currentDate.isSame(endDate, "day")
      ) {
        dateList.push(currentDate.format("YYYY-MM-DD"));
        currentDate = currentDate.add(1, "day");
      }

      // เรียกพร้อมกันครั้งละ 5 วัน
      const concurrency = 5;

      for (
        let index = 0;
        index < dateList.length;
        index += concurrency
      ) {
        const dateChunk = dateList.slice(
          index,
          index + concurrency
        );

        const chunkResult = await Promise.all(
          dateChunk.map(async (date) => {
            try {
              const result =
                await this.evidenApiAllocationEod({
                  start_date: date,
                  end_date: date,

                  /*
                  * เมื่อแยกเรียกทีละวัน
                  * ควรเริ่ม skip ที่ 0 ของทุกวัน
                  */
                  skip: 0,

                  /*
                  * ต้องกำหนด limit ให้ครอบคลุมข้อมูลของหนึ่งวัน
                  */
                  limit: totalRecord
                    ? totalRecord
                    : limit
                });

              return Array.isArray(result)
                ? result
                : [];
            } catch (error) {
              console.error(
                `evidenApiAllocationEod error วันที่ ${date}:`,
                error
              );

              return [];
            }
          })
        );

        evidenApiAllocationEod.push(
          ...chunkResult.flat()
        );
      }
    }

     console.timeEnd("allocationManagement2 s6")
    //  console.log('evidenApiAllocationEod : ', evidenApiAllocationEod);
     console.time("allocationManagement2 s7")
    const matchWithExecuteList = evidenApiAllocationEod.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeEodList?.some((executeData: any) => {
        const executeStart = getTodayNowAdd7(executeData?.start_date_date)
        const executeEnd = getTodayNowAdd7(executeData?.end_date_date)
        return executeData.request_number_id == item.request_number && executeStart.isSameOrBefore(itemGasDay, 'day') && executeEnd.isSameOrAfter(itemGasDay, 'day')
      })
    })
    const publishData = matchWithExecuteList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData.execute_timestamp && unpublishData?.gas_day_text === evidenData.gas_day
      })
    })
    // Get the latest execute_timestamp for each unique combination of gas_day
    const latestPublishData = publishData.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, [])
    console.timeEnd("allocationManagement2 s7")
    console.time("allocationManagement2 s8")
    // เตรียม master ของ group และ concept point ที่ active ตามช่วง gas_day ที่มีข้อมูล
    let groupMaster: group[] = []
    let conceptPointMaster: conceptPointWithRelations[] = []
    if (latestPublishData && latestPublishData.length > 0) {
      // Extract all unique gas_day values and convert to dayjs objects for proper date comparison
      const gasDays = [...new Set(latestPublishData.map((item: any) => item.gas_day))]

      if (gasDays.length > 0) {
        // Convert to dayjs objects for proper date comparison
        const gasDayObjects = gasDays.map((date) => getTodayStartAdd7(date))

        // Find min and max gas_day using dayjs comparison
        const minGasDayObj = gasDayObjects.reduce((min, current) => (current.isBefore(min) ? current : min))
        const maxGasDayObj = gasDayObjects.reduce((max, current) => (current.isAfter(max) ? current : max))

        if (minGasDayObj.isValid() && maxGasDayObj.isValid()) {
          groupMaster = await this.prisma.group.findMany({
            where: {
              user_type_id: 3,
              OR: [
                {
                  end_date: null
                },
                {
                  end_date: {
                    gt: minGasDayObj.toDate()
                  }
                }
              ],
              start_date: {
                lte: maxGasDayObj.toDate()
              }
            }
          })

          conceptPointMaster = await this.prisma.concept_point.findMany({
            where: {
              OR: [
                {
                  end_date: null
                },
                {
                  end_date: {
                    gt: minGasDayObj.toDate()
                  }
                }
              ],
              start_date: {
                lte: maxGasDayObj.toDate()
              }
            },
            ...conceptPointPopulate
          })
        }
      }
    }
    console.timeEnd("allocationManagement2 s8")
    console.time("allocationManagement2 s9")
    // คลี่โครงสร้าง Eviden (ระดับ gas_day → contract → point) ให้อยู่ในรูป flat list พร้อมข้อมูล group
    const newEOD = latestPublishData.flatMap((fm: any) => {
      const { data: data1, ...fmD } = fm

      const gasDayjs = getTodayNowYYYYMMDDDfaultAdd7(fm.gas_day)
      const gasDay = gasDayjs.toDate()

      const nData = data1?.flatMap((dFm: any) => {
        const { data: data2, ...fmD2 } = dFm

        const activeGroup: group = groupMaster.find((group) => group.start_date <= gasDay && (group.end_date === null || group.end_date >= gasDay) && isMatch(group.id_name, dFm.shipper))

        const nData2 = data2.map((dFm2: any) => {
          return {
            ...fmD,
            ...fmD2,
            ...dFm2,
            group: activeGroup
          }
        })

        return [...nData2]
      })

      return [...nData]
    })
    console.timeEnd("allocationManagement2 s9")
    console.time("allocationManagement2 s10")
    // Generate dateArrayForIntraday based on actual gas_day values from newEOD
    const dateArrayForIntraday: string[] = []

    if (newEOD && newEOD.length > 0) {
      // Extract all unique gas_day values and convert to dayjs objects for proper date comparison
      const gasDays = [...new Set(newEOD.map((item: any) => item.gas_day))]

      if (gasDays.length > 0) {
        // Convert to dayjs objects for proper date comparison
        const gasDayObjects = gasDays.map((date) => getTodayStartAdd7(date))

        // Find min and max gas_day using dayjs comparison
        const minGasDayObj = gasDayObjects.reduce((min, current) => (current.isBefore(min) ? current : min))
        const maxGasDayObj = gasDayObjects.reduce((max, current) => (current.isAfter(max) ? current : max))

        if (minGasDayObj.isValid() && maxGasDayObj.isValid()) {
          let current = minGasDayObj

          while (current.isSameOrBefore(maxGasDayObj)) {
            dateArrayForIntraday.push(current.format('YYYY-MM-DD'))
            current = current.add(1, 'day')
          }
        }
      }
    }
    console.timeEnd("allocationManagement2 s10")
    
    console.time("allocationManagement2 s11") // 1/5/2026-31/5/2026 5s
    let intradayEviden =
      ignoreDetail == true
        ? []
        : (
          await Promise.all(
            dateArrayForIntraday.map(async (date) => {
              try {
                let intraDayTotalRecord: number | undefined = undefined
                await this.evidenApiAllocationIntraday(
                  {
                    gas_day: date,
                    start_hour: 1,
                    end_hour: 24,
                    skip: 0,
                    limit: 1
                  },
                  (total_record: number) => {
                    intraDayTotalRecord = total_record
                  }
                )
                const evidenApiAllocationIntraday = await this.evidenApiAllocationIntraday({
                  gas_day: date,
                  start_hour: 1,
                  end_hour: 24,
                  skip: intraDayTotalRecord ? 0 : skip,
                  limit: intraDayTotalRecord ? intraDayTotalRecord : limit
                })
                return evidenApiAllocationIntraday
              } catch (error) {
                return []
              }
            })
          )
        ).flat()
    
    const matchWithExecuteIntradayList = intradayEviden.filter((item: any) => {
      const itemGasDay = getTodayNowYYYYMMDDDfaultAdd7(item.gas_day)
      return executeIntradayList?.some((executeData: any) => {
        const executeGasDay = getTodayNowAdd7(executeData.gas_day)
        return executeData.request_number_id == item.request_number && executeData.gas_hour == item.gas_hour && executeGasDay.isSame(itemGasDay, 'day')
      })
    })

    const publishIntradayData = matchWithExecuteIntradayList.filter((evidenData: any) => {
      return !publicationCenterDeletedList?.some((unpublishData: any) => {
        return unpublishData?.execute_timestamp === evidenData.execute_timestamp && unpublishData?.gas_day_text === evidenData.gas_day && unpublishData?.gas_hour === evidenData?.gas_hour
      })
    })
    console.timeEnd("allocationManagement2 s11")
    console.time("allocationManagement2 s12")
    // Get the latest execute_timestamp for each unique combination of gas_day
    const latestPublishIntradayData = publishIntradayData.reduce((acc: any[], current: any) => {
      const existingIndex = acc.findIndex((item) => item.gas_day === current.gas_day)

      if (existingIndex < 0) {
        acc.push(current)
      } else if (current.gas_hour > acc[existingIndex].gas_hour) {
        acc[existingIndex] = current
      } else if (current.gas_hour == acc[existingIndex].gas_hour && current.execute_timestamp > acc[existingIndex].execute_timestamp) {
        acc[existingIndex] = current
      }

      return acc
    }, [])
    console.timeEnd("allocationManagement2 s12")
    console.time("allocationManagement2 s13")
    let allocationMaster = await this.prisma.allocation_management.findMany({
      where: {
        gas_day: {
          gte: startDate.toDate(),
          lte: endDate.toDate()
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
          // orderBy: { id: "desc" }
        },
        allocation_management_shipper_review: {
          include: {},
          take: 1,
          orderBy: {
            create_date: 'desc'
          }
        },
        allocation_status: true
      }
    })
    console.timeEnd("allocationManagement2 s13")
    console.time("allocationManagement2 s14")
    let newAllocation = []
    const resultEodLast: any = Object.values(
      newEOD.reduce((acc, curr) => {
        const key = `${curr.gas_day}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
        if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
          acc[key] = curr
        }
        return acc
      }, {})
    )

    for (let i = 0; i < resultEodLast.length; i++) {
      const findAllocationMaster = allocationMaster.find((f: any) => {
        return (
          f?.gas_day_text === resultEodLast[i]?.gas_day &&
          f?.shipper_name_text === resultEodLast[i]?.shipper &&
          f?.contract_code_text === resultEodLast[i]?.contract &&
          f?.point_text === resultEodLast[i]?.point &&
          f?.entry_exit_text === resultEodLast[i]?.entry_exit &&
          f?.area_text === resultEodLast[i]?.area &&
          f?.zone_text === resultEodLast[i]?.zone
        )
      })

      if (!!!findAllocationMaster) {
        newAllocation.push({
          allocation_status_id: 1,
          shipper_name_text: resultEodLast[i]?.shipper,
          gas_day_text: resultEodLast[i]?.gas_day,
          contract_code_text: resultEodLast[i]?.contract,
          point_text: resultEodLast[i]?.point,
          entry_exit_text: resultEodLast[i]?.entry_exit,
          area_text: resultEodLast[i]?.area,
          zone_text: resultEodLast[i]?.zone,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(resultEodLast[i]?.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId)
        })
      }
    }
    console.timeEnd("allocationManagement2 s14")
    console.time("allocationManagement2 s15")
    if (newAllocation.length > 0) {
      // create
      try {
        await this.prisma.allocation_management.createMany({
          data: newAllocation
        })
      } catch (error) {
        console.log('Create log for allocation management error: ', error)
      }

      allocationMaster = await this.prisma.allocation_management.findMany({
        where: {
          gas_day: {
            gte: startDate.toDate(),
            lte: endDate.toDate()
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
            // orderBy: { id: "desc" }
          },
          allocation_management_shipper_review: {
            include: {},
            take: 1,
            orderBy: {
              create_date: 'desc'
            }
          },
          allocation_status: true
        }
      })
    }
    console.timeEnd("allocationManagement2 s15")
   
    /**
     * ใช้ JSON.stringify ป้องกัน key ชนกัน
     * กรณีข้อมูลมีเครื่องหมาย | หรือเครื่องหมายพิเศษ
     */
    const createKey = (...values: any[]) => JSON.stringify(values);
    console.time("allocationManagement2 s16");  // 1/5/2026-31/5/2026 11s -> 0.463s

    const pushToArrayMap = (
      map: Map<string, any[]>,
      key: string,
      value: any
    ) => {
      const current = map.get(key);

      if (current) {
        current.push(value);
      } else {
        map.set(key, [value]);
      }
    };

    /**
     * ============================================================
     * 1. สร้าง index สำหรับ Nomination
     * ============================================================
     */

    const dailyNominationMap = new Map<string, any[]>();
    const weeklyNominationMap = new Map<string, any[]>();

    const getWeekKey = (date: any) => {
      return getTodayNowYYYYMMDDDfaultAdd7(date)
        .startOf("week")
        .format("YYYY-MM-DD");
    };

    for (const nomination of convertNomFile ?? []) {
      const nominationTypeId = Number(nomination?.nomination_type_id);

      if (nominationTypeId !== 1 && nominationTypeId !== 2) {
        continue;
      }

      const shipper = nomination?.group?.id_name;

      const contractCode =
        nomination?.contract_code?.contract_code;

      const reserveContract =
        nomination?.reserve_balancing_gas_contract
          ?.res_bal_gas_contract;

      /**
       * Nomination หนึ่งตัวอาจตรงได้ทั้ง contract ปกติ
       * และ reserve balancing contract
       */
      const contracts = [
        ...new Set(
          [contractCode, reserveContract].filter(
            (contract) =>
              contract !== null &&
              contract !== undefined
          )
        )
      ];

      for (const contract of contracts) {
        if (nominationTypeId === 1) {
          const key = createKey(
            nomination?.gas_day,
            shipper,
            contract
          );

          pushToArrayMap(
            dailyNominationMap,
            key,
            nomination
          );
        } else {
          const key = createKey(
            getWeekKey(nomination?.gas_day),
            shipper,
            contract
          );

          pushToArrayMap(
            weeklyNominationMap,
            key,
            nomination
          );
        }
      }
    }

    /**
     * ============================================================
     * 2. สร้าง index สำหรับ Intraday
     * ============================================================
     *
     * โค้ดเดิมใช้ .find() หา gas day
     * ดังนั้นถ้ามี gas day ซ้ำ ต้องใช้ข้อมูลตัวแรกเท่านั้น
     */

    const intradayGasDayMap = new Map<string, any>();

    for (const intraday of latestPublishIntradayData ?? []) {
      const gasDay =
        intraday?.gasday ?? intraday?.gas_day;

      if (!intradayGasDayMap.has(gasDay)) {
        intradayGasDayMap.set(gasDay, intraday);
      }
    }

    /**
     * เก็บ intraday record ตัวสุดท้ายตามเงื่อนไข
     *
     * เพราะโค้ดเดิม:
     * filter(...).map(...).at(-1)
     *
     * จึงต้องใช้ตัวสุดท้ายที่ตรงกับ:
     * gasDay + contract + shipper + point
     */
    const intradayLastRecordMap = new Map<string, any>();

    for (const [gasDay, intraday] of intradayGasDayMap) {
      for (const intraItem of intraday?.data ?? []) {
        const pointSet = new Set<any>();

        for (const dataItem of intraItem?.data ?? []) {
          pointSet.add(dataItem?.point);
        }

        for (const point of pointSet) {
          const key = createKey(
            gasDay,
            intraItem?.contract,
            intraItem?.shipper,
            point
          );

          /**
           * set ทับได้เลย เพราะต้องการตัวสุดท้าย
           * ให้เหมือน .at(-1)
           */
          intradayLastRecordMap.set(key, intraItem);
        }
      }
    }

    /**
     * ============================================================
     * 3. สร้าง index สำหรับ Area
     * ============================================================
     *
     * areaMaster เดิมใช้ find แบบ ===
     * ถ้ามีชื่อซ้ำ ต้องเก็บตัวแรก
     */

    const areaMasterMap = new Map<string, any>();

    for (const area of areaMaster ?? []) {
      const key = area?.name;

      if (!areaMasterMap.has(key)) {
        areaMasterMap.set(key, area);
      }
    }

    /**
     * ============================================================
     * 4. Cache สำหรับข้อมูลที่ใช้ isMatch
     * ============================================================
     *
     * เนื่องจาก isMatch อาจไม่ใช่การเปรียบเทียบแบบ ===
     * จึงใช้ cache ตาม point ที่เคยค้นหาแล้ว
     */

    const meterNameCache = new Map<string, string[]>();
    const entryExitCache = new Map<string, any>();
    const nominationValueCache = new Map<string, number | null>();

    const getMeterNames = (
      pointType: any,
      point: any
    ): string[] => {
      const cacheKey = createKey(pointType, point);

      const cached = meterNameCache.get(cacheKey);

      if (cached !== undefined) {
        return cached;
      }

      let meterName: string[] = [];

      if (
        meterMaster &&
        isMatch(pointType, "NOM")
      ) {
        meterName = (meterMaster ?? [])
          .filter((meteringPoint: any) =>
            isMatch(
              meteringPoint?.nomination_point
                ?.nomination_point,
              point
            )
          )
          .map(
            (meteringPoint: any) =>
              meteringPoint?.metered_point_name
          );
      } else if (
        conceptPointMaster &&
        isMatch(pointType, "CONCEPT")
      ) {
        let conceptPointName = point;

        if (isMatch(point, "East_to_BVW10")) {
          conceptPointName = "BVW10 East";
        } else if (isMatch(point, "West_to_BVW10")) {
          conceptPointName = "BVW10 West";
        } else if (isMatch(point, "East_to_RA6")) {
          conceptPointName = "RA6 EAST";
        } else if (isMatch(point, "West_to_RA6")) {
          conceptPointName = "RA6 WEST";
        }

        meterName = (conceptPointMaster ?? [])
          .filter((conceptPoint: any) => {
            return (
              conceptPoint?.type_concept_point?.name
                ?.toUpperCase()
                ?.includes("METER") &&
              (
                isMatch(
                  conceptPoint?.concept_point,
                  point
                ) ||
                isMatch(
                  conceptPoint?.concept_point,
                  conceptPointName
                )
              )
            );
          })
          .map(
            (conceptPoint: any) =>
              conceptPoint?.concept_point
          );
      } else if (
        meterMaster &&
        isMatch(pointType, "NONTPA")
      ) {
        meterName = (meterMaster ?? [])
          .filter((meteringPoint: any) =>
            isMatch(
              meteringPoint?.non_tpa_point
                ?.non_tpa_point_name,
              point
            )
          )
          .map(
            (meteringPoint: any) =>
              meteringPoint?.metered_point_name
          );
      } else {
        const meterSet = new Set<string>();

        for (const meteringPoint of meterMaster ?? []) {
          if (
            meteringPoint?.nomination_point
              ?.nomination_point === point
          ) {
            meterSet.add(
              meteringPoint?.metered_point_name
            );
          }
        }

        meterName = [...meterSet];
      }

      meterNameCache.set(cacheKey, meterName);

      return meterName;
    };

    const getEntryExitObject = (entryExit: any) => {
      if (entryExitCache.has(entryExit)) {
        return entryExitCache.get(entryExit);
      }

      const result = (entryExitMaster ?? []).find(
        (item: any) =>
          isMatch(item?.name, entryExit)
      );

      entryExitCache.set(entryExit, result);

      return result;
    };

    /**
     * ============================================================
     * 5. ฟังก์ชันคำนวณ Nomination
     * ============================================================
     */

    const getNominationValue = (
      eod: any
    ): number | null => {
      /**
       * nominationValue ไม่ได้ใช้ entry_exit และ point_type
       * จึง cache ด้วย field ที่เกี่ยวข้องจริงเท่านั้น
       */
      const cacheKey = createKey(
        eod?.gas_day,
        eod?.shipper,
        eod?.contract,
        eod?.point,
        eod?.area,
        eod?.zone
      );

      if (nominationValueCache.has(cacheKey)) {
        return nominationValueCache.get(cacheKey) ?? null;
      }

      const dailyKey = createKey(
        eod?.gas_day,
        eod?.shipper,
        eod?.contract
      );

      const weeklyKey = createKey(
        getWeekKey(eod?.gas_day),
        eod?.shipper,
        eod?.contract
      );

      const dailyNominationList =
        dailyNominationMap.get(dailyKey) ?? [];

      const weeklyCandidates =
        weeklyNominationMap.get(weeklyKey) ?? [];

      /**
       * รักษาเงื่อนไขเดิม:
       *
       * !dailyNominationList.some(
       *   daily.contract_code_id == weekly.contract_code_id
       * )
       */
      const weeklyNominationList =
        weeklyCandidates.filter((weekly: any) => {
          return !dailyNominationList.some(
            (daily: any) =>
              daily?.contract_code_id ==
              weekly?.contract_code_id
          );
        });

      const dayOfWeek = Number(
        getTodayStartAdd7(eod?.gas_day).format("d")
      );

      let nominationValue: number | null = null;

      const nominationList = [
        ...dailyNominationList,
        ...weeklyNominationList
      ];

      for (const nominationFile of nominationList) {
        for (
          const rowDataItem of nominationFile?.rowData ?? []
        ) {
          const isMatched =
            isMatch(
              rowDataItem?.data_temp?.["3"],
              eod?.point
            ) &&
            isMatch(
              rowDataItem?.data_temp?.["9"],
              "MMBTU/D"
            ) &&
            isMatch(
              rowDataItem?.area_text,
              eod?.area
            ) &&
            isMatch(
              rowDataItem?.zone_text,
              eod?.zone
            );

          if (!isMatched) {
            continue;
          }

          let newNominationValue: number | null = null;

          if (
            Number(nominationFile?.nomination_type_id) === 1
          ) {
            newNominationValue = parseToNumber3Decimal(
              rowDataItem?.data_temp?.["38"]
            );
          } else {
            newNominationValue = parseToNumber3Decimal(
              rowDataItem?.data_temp?.[
                `${14 + dayOfWeek}`
              ]
            );
          }

          /**
           * รักษาพฤติกรรมเดิมทุกกรณี
           *
           * เดิมใช้:
           * if (nominationValue) {
           *   ...
           * } else {
           *   nominationValue = newNominationValue
           * }
           *
           * ดังนั้นกรณี nominationValue เป็น 0
           * จะเข้า else เหมือนเดิม
           */
          if (nominationValue) {
            if (
              newNominationValue ||
              newNominationValue === 0
            ) {
              nominationValue = parseToNumber6Decimal(nominationValue + newNominationValue);
            }
          } else {
            nominationValue = newNominationValue;
          }
        }
      }

      nominationValueCache.set(
        cacheKey,
        nominationValue
      );

      return nominationValue;
    };

    /**
     * ============================================================
     * 6. สร้าง nEodPorp
     * ============================================================
     */

    const eodPorp = (resultEodLast ?? []).map(
      (eod: any) => {
        const nominationValue =
          getNominationValue(eod);

        const systemAllocation = eod?.value;

        const previousAllocationTPAforReview =
          eod?.previous_value;

        /**
         * หา intraday ตัวสุดท้ายที่ตรงกับ
         * gasDay + contract + shipper + point
         */
        const intradayKey = createKey(
          eod?.gas_day,
          eod?.contract,
          eod?.shipper,
          eod?.point
        );

        const lastIntradayRecord =
          intradayLastRecordMap.get(intradayKey);

        /**
         * ใน record ตัวสุดท้าย หา data ที่ตรงรายละเอียดทั้งหมด
         */
        const dataIntraDay =
          lastIntradayRecord?.data?.find(
            (dataItem: any) => {
              return (
                dataItem?.point === eod?.point &&
                dataItem?.point_type ===
                  eod?.point_type &&
                dataItem?.area === eod?.area &&
                dataItem?.zone === eod?.zone &&
                dataItem?.entry_exit ===
                  eod?.entry_exit
              );
            }
          ) ?? null;

        const intradaySystem =
          dataIntraDay?.value;

        const meterName = getMeterNames(
          eod?.point_type,
          eod?.point
        );

        const entry_exit_obj =
          getEntryExitObject(eod?.entry_exit);

        const area_obj =
          areaMasterMap.get(eod?.area);

        return {
          ...eod,
          nominationValue,
          systemAllocation,
          previousAllocationTPAforReview,
          intradaySystem,
          meterName,
          entry_exit_obj,
          area_obj
        };
      }
    );
    const nEodPorp = (share === 'on' || share == true) ? eodPorp.filter((item: any) => meteringPointList.some(meteringPoint => item.meterName.includes(meteringPoint.metered_point_name) || item.meterName.includes(meteringPoint.metered_point_name))) : eodPorp

    console.timeEnd("allocationManagement2 s16");

    console.time("allocationManagement2 s18"); // 1/5/2026-31/5/2026 42s -> 17s

    let meterUse: any[] = [];

    if (ignoreDetail !== true && ignoreDetail != 'true') {
      const startDate = dayjs(
        start_date ?? dayjs().format("YYYY-MM-DD")
      ).startOf("day");

      const endDate = dayjs(
        end_date ?? dayjs().format("YYYY-MM-DD")
      ).startOf("day");

      // สร้าง array วันที่ เช่น
      // ["2026-06-01", "2026-06-02", ..., "2026-06-30"]
      const dateList: string[] = [];

      let currentDate = startDate;

      while (
        currentDate.isBefore(endDate, "day") ||
        currentDate.isSame(endDate, "day")
      ) {
        dateList.push(currentDate.format("YYYY-MM-DD"));
        currentDate = currentDate.add(1, "day");
      }

      // console.log("dateList:", dateList);

      // เรียกทุกวันพร้อมกัน
      const meterUseByDate = await Promise.all(
        dateList.map(async (date) => {
          try {
            const result =
              await this.meteringManagementService.getDataLogic2(
                {
                  share: (share === 'on' || share == true) ?  'on' : "off",
                  start_date: date,
                  end_date: date,
                },
                true,
                meteringPointList
              );

            return Array.isArray(result) ? result : [];
          } catch (error) {
            // console.error(`getDataLogic2 error วันที่ ${date}:`, error);
            return [];
          }
        })
      );

      // รวม array ของทุกวันให้เป็น array เดียว
      meterUse = meterUseByDate.flat();
    }

    console.timeEnd("allocationManagement2 s18");

    console.time("allocationManagement2 s19"); // 1/5/2026-31/5/2026 11s -> 0.095s

    /**
     * ============================================================
     * 1. สรุป Energy จาก meterUse ตาม gasDay + meteringPointId
     * ============================================================
     *
     * จากเดิม:
     * meterUse.filter(...) ทุกครั้งที่วน nEodPorp
     *
     * เปลี่ยนเป็น:
     * สรุปผลไว้ใน Map เพียงครั้งเดียว
     */
    const meterEnergyMap = new Map<string, number>();

    for (const meter of meterUse ?? []) {
      const key = createKey(
        meter?.gasDay,
        meter?.meteringPointId
      );

      const energy = parseToNumber(meter?.energy) ?? 0;
      const currentEnergy = meterEnergyMap.get(key) ?? 0;

      meterEnergyMap.set(
        key,
        currentEnergy + energy
      );
    }

    /**
     * ============================================================
     * 2. สร้าง Map สำหรับ allocationMaster
     * ============================================================
     *
     * ต้องใช้ 7 field ในการจับคู่:
     * - gas_day_text
     * - shipper_name_text
     * - contract_code_text
     * - point_text
     * - entry_exit_text
     * - area_text
     * - zone_text
     */
    const allocationMasterMap = new Map<string, any>();

    for (const allocation of allocationMaster ?? []) {
      const key = createKey(
        allocation?.gas_day_text,
        allocation?.shipper_name_text,
        allocation?.contract_code_text,
        allocation?.point_text,
        allocation?.entry_exit_text,
        allocation?.area_text,
        allocation?.zone_text
      );

      /**
       * ใช้เฉพาะข้อมูลตัวแรก เพื่อให้พฤติกรรมเหมือน Array.find()
       *
       * ถ้ามี key ซ้ำกัน Array.find() เดิมจะคืนตัวแรก
       */
      if (!allocationMasterMap.has(key)) {
        allocationMasterMap.set(key, allocation);
      }
    }

    /**
     * ============================================================
     * 3. สร้างผลลัพธ์ nEodPorpRes
     * ============================================================
     */
    const nEodPorpRes = (nEodPorp ?? []).map((item: any) => {
      /**
       * รวมค่าพลังงานจาก Meter ทุกตัวใน item.meterName
       *
       * ยังคงวน meterName ตามเดิม ดังนั้นถ้า meterName มีค่าซ้ำ
       * ผลลัพธ์ก็จะบวกซ้ำเหมือนโค้ดเดิม
       */
      let meteringValue = 0;
      let meterNameSubValue = []
      for (const meterPointId of item?.meterName ?? []) {
        const meterKey = createKey(
          item?.gas_day,
          meterPointId
        );
        meterNameSubValue.push(meterEnergyMap.get(meterKey) ?? 0)
        meteringValue += meterEnergyMap.get(meterKey) ?? 0;
      }

      const allocationKey = createKey(
        item?.gas_day,
        item?.shipper,
        item?.contract,
        item?.point,
        item?.entry_exit,
        item?.area,
        item?.zone
      );

      const aMaster = allocationMasterMap.get(allocationKey);
      
      return {
        ...item,
        id: aMaster?.id || null,
        allocation_status: aMaster?.allocation_status || null,
        review_code: aMaster?.review_code || null,
        allocation_management_comment:
          aMaster?.allocation_management_comment || [],
        allocation_management_shipper_review:
          aMaster?.allocation_management_shipper_review || [],
        meteringValue,
        meterNameSubValue: meterNameSubValue || []
      };
    });
    console.timeEnd("allocationManagement2 s19");
    
    return nEodPorpRes
  }

  //
  async allocationQuery(payload: any, userId: any) {
    // ฟังก์ชันนี้ใช้ดึงข้อมูล allocation สำหรับหน้า(Daily/Intraday) (Tab 1/2)
    // โดยรวมข้อมูลจาก Eviden (EOD/Intraday), Nomination และ Allocation ในระบบ
    const { start_date, end_date, is_last_version, version, skip, limit, tab } = payload
    console.time('[RUNTIME] allocationQuery')

    // *Input validation
    const startDate = getTodayStartAdd7(start_date)
    const endDate = getTodayEndAdd7(end_date)

    if (!startDate.isValid() || !endDate.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (endDate.isBefore(startDate)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    console.time("allocationQuery s1")
    // *Query Necessary Data
    // เตรียม master entry_exit ไว้ใช้แม็ปข้อมูลในภายหลัง
    const entryExitMaster = await this.repo.getEntryExit()
    const lastestAllocationModeBeforeStartDate: allocationModeRecord = await this.prisma.allocation_mode.findFirst({
      where: {
        start_date: {
          lt: startDate.toDate(),
        },
      },
      orderBy: [
        { start_date: 'desc' },
        { create_date: 'desc' },
      ],
      select: {
        start_date: true,
        create_date: true,
        allocation_mode_type: {
          select: {
            mode: true,
          },
        },
      },
    });
    const allocationModesRaw: allocationModeRecord[] = await this.prisma.allocation_mode.findMany({
      where: {
        start_date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
      orderBy: [
        { start_date: 'asc' },
        { create_date: 'desc' },
      ],
      select: {
        start_date: true,
        create_date: true,
        allocation_mode_type: {
          select: {
            mode: true,
          },
        },
      },
    });
    const allocationModes: allocationModeRecord[] = deduplicateAllocationModesByStartDate(allocationModesRaw);
    const intradayAllocationGasDays: string[] = getIntradayAllocationGasDays(
      [lastestAllocationModeBeforeStartDate,...allocationModes],
      startDate,
      endDate,
    )
    console.timeEnd("allocationQuery s1")
    console.time("allocationQuery s2")
    // โหลดไฟล์ nomination (daily/weekly) ที่ status อยู่ในสถานะใช้งาน
    const nominationFile: queryShipperNominationFileWithRelationsForCal[] = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
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
              gte: startDate.toDate(),
              lte: endDate.toDate()
            }
          },
          // Weekly nominations: same week
          {
            nomination_type: {
              id: 2
            },
            gas_day: {
              gte: startDate.startOf('week').toDate(),
              lte: endDate.endOf('week').toDate()
            }
          }
        ]
      },
      ...queryShipperNominationFilePopulateForCal
    })
    console.timeEnd("allocationQuery s2")
    console.time("allocationQuery s2.1")
    // แปลง nomination JSON ให้อยู่ในรูปแบบใช้งานง่าย (parse data_temp)
    const convertNomFile = nominationFile.map((e: any) => {
      // nomination_type_id 1 daily, 2 weekly
      e['gas_day'] = dayjs(e['gas_day']).format('YYYY-MM-DD')
      e['nomination_version'] = e['nomination_version'].map((nv: any) => {
        nv['nomination_full_json'] = nv['nomination_full_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        nv['nomination_row_json'] = nv['nomination_row_json'].map((nj: any) => {
          nj['data_temp'] = JSON.parse(nj['data_temp'])
          return { ...nj }
        })
        return { ...nv }
      })
      let fullData = e['nomination_version'][0]?.['nomination_full_json'][0]
      let rowData = e['nomination_version'][0]?.['nomination_row_json']
      delete e['nomination_version']
      return {
        ...e,
        fullData,
        rowData
      }
    })

    console.timeEnd("allocationQuery s2.1")
    console.time("allocationQuery s3")

    // ใช้สำหรับตอนทำค่าสะสมรายชั่วโมงหลังจาก adjust แล้ว
    // const nominationFile : queryShipperNominationFileWithRelationsForCal[] =  []
    // const convertNomFile = []

    // สร้างรายการวันภายในช่วงที่เลือก เพื่อใช้เรียก Eviden intraday เมื่อจำเป็น

    // *Reqeust Eviden API
    // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
    let evidenApiAllocation = []
    let intradayEviden = []
    let nomAdjust = []
    const concurrency = 5;
    if (tab === '2') {
      // intraday
      console.time("allocationQuery s3.1")
      const intradayList = await this.repo.getEvidenApiAllocationIntraday(startDate, endDate)
      console.timeEnd("allocationQuery s3.1")
      intradayEviden = intradayList
      evidenApiAllocation = intradayList
      // console.time("allocationQuery s3.2")
      // nomAdjust = await getAdjustNom({
      //   prisma: this.prisma,
      //   startDate: startDate.format('DD/MM/YYYY'),
      //   endDate: endDate.format('DD/MM/YYYY')
      // })
      // console.timeEnd("allocationQuery s3.2")

      console.time("allocationQuery s3.2");

      // let nomAdjust: any[] = [];

      const dateList: string[] = [];

      let currentDate = startDate.startOf("day");
      const lastDate = endDate.startOf("day");

      while (
        currentDate.isBefore(lastDate, "day") ||
        currentDate.isSame(lastDate, "day")
      ) {
        dateList.push(currentDate.format("DD/MM/YYYY"));
        currentDate = currentDate.add(1, "day");
      }

      for (
        let index = 0;
        index < dateList.length;
        index += concurrency
      ) {
        const dateChunk = dateList.slice(
          index,
          index + concurrency
        );

        const chunkResult = await Promise.all(
          dateChunk.map(async (date) => {
            try {
              const result = await getAdjustNom2({
                prisma: this.prisma,
                startDate: date,
                endDate: date
              });

              return Array.isArray(result) ? result : [];
            } catch (error) {
              console.error(
                `getAdjustNom error วันที่ ${date}:`,
                error
              );

              return [];
            }
          })
        );

        nomAdjust.push(...chunkResult.flat());
      }

      console.timeEnd("allocationQuery s3.2");

    } else if (tab === '1') {
      // Daily (EOD)
      evidenApiAllocation = await this.repo.getEvidenApiAllocationEod(startDate, endDate)
      
      for (let index = 0; index < intradayAllocationGasDays.length; index += concurrency) {
        const dateChunk = intradayAllocationGasDays.slice(index, index + concurrency);

        const chunkResult = await Promise.all(
          dateChunk.map(async (date) => {
            try {
              const result = await getAdjustNom2({
                prisma: this.prisma,
                startDate: date,
                endDate: date
              });

              return Array.isArray(result) ? result : [];
            } catch (error) {
              console.error(`getAdjustNom error วันที่ ${date}:`, error);
              return [];
            }
          })
        );

        nomAdjust.push(...chunkResult.flat());
      }
    }
    console.timeEnd("allocationQuery s3")
    console.time("allocationQuery s4")
    console.log('[INFO] allocationQuery: evidenApiAllocation (FINAL) count =', evidenApiAllocation?.length || 0)
    // *Process Response Eviden
    evidenApiAllocation = version ? evidenApiAllocation.filter((item: any) => version.includes(item?.execute_timestamp)) : evidenApiAllocation

    // คลี่โครงสร้าง Eviden ให้อยู่ในรูป flat list พร้อมแนบข้อมูล shipper/group
    evidenApiAllocation = await flatEvidenApiResponse(evidenApiAllocation, this.prisma)

    console.timeEnd("allocationQuery s4")
    console.time("allocationQuery s5")

    // โหลด allocation ในระบบระหว่างช่วงวันที่มาเตรียมประกอบผลลัพธ์
    let allocationMaster = await this.repo.getAllocationManagement(startDate.toDate(), endDate.toDate())
    console.timeEnd("allocationQuery s5")
    console.time("allocationQuery s6")
    // ถ้าเลือก is_last_version จะเลือกเฉพาะ execute ล่าสุดต่อ key หลัก
    const allowConceptPoints = ['East_to_BVW10', 'West_to_BVW10', 'East_to_RA6', 'West_to_RA6']
    const result: any = is_last_version
      ? Object.values(
        evidenApiAllocation.reduce((acc, curr) => {
          if (curr.point_type === 'CONCEPT' && !allowConceptPoints.includes(curr.point)) return acc
          const gas_hour = curr?.gas_hour || 24
          const key = `${curr.gas_day}|${gas_hour}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
          if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
            acc[key] = curr
          }
          return acc
        }, {})
      )
      : Object.values(
        evidenApiAllocation.reduce((acc, curr) => {
          if (curr.point_type === 'CONCEPT' && !allowConceptPoints.includes(curr.point)) return acc
          const gas_hour = curr?.gas_hour || 24
          const key = `${curr.gas_day}|${gas_hour}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}|${curr.execute_timestamp}`
          if (!acc[key]) {
            acc[key] = curr
          }
          return acc
        }, {})
      )
    console.timeEnd("allocationQuery s6")
    console.log('[INFO] allocationQuery: result count =', result?.length || 0)
    // console.time("allocationQuery s7") // ช้ามากๆ หลายนาทีถ้าดึง 1 เดือน ไปใช้โค้ดล่าง
    // // สร้างข้อมูลรายแถว per point พร้อมคำนวณ Nomination และ Intraday ที่เกี่ยวข้อง
    // const resultPorp = result.map((allo: any) => {
    //   let nominationValue: number | null = null
    //   if (tab === '1') {
    //     // nominationValue = getNomValue(convertNomFile, allo);
    //     const dailyNominationList = convertNomFile?.filter((f: any) => {
    //       return f?.gas_day === allo['gas_day'] && f?.group?.id_name === allo['shipper'] && f?.contract_code?.contract_code === allo['contract'] && f?.nomination_type_id == 1
    //     })

    //     const weeklyNominationList = convertNomFile?.filter((f: any) => {
    //       return (
    //         getTodayNowYYYYMMDDDfaultAdd7(f?.gas_day).isSame(getTodayNowYYYYMMDDDfaultAdd7(allo['gas_day']), 'week') &&
    //         f?.group?.id_name === allo['shipper'] &&
    //         f?.contract_code?.contract_code === allo['contract'] &&
    //         f?.nomination_type_id == 2 &&
    //         !dailyNominationList.some((daily: any) => daily.contract_code_id == f?.contract_code_id)
    //       )
    //     })

    //     const dayOfWeek = Number(getTodayStartAdd7(allo['gas_day']).format('d')) // The day of the week, with Sunday as 0
    //       ;[...dailyNominationList, ...weeklyNominationList].map((nominationFile) => {
    //         nominationFile.rowData?.map((rowDataItem: any) => {
    //           if (allo.point_type == 'CONCEPT' && isMatch(rowDataItem?.data_temp['3'], allo['point']) && isMatch(rowDataItem?.data_temp['9'], 'MMBTU/D') && isMatch(rowDataItem?.zone_text, allo['zone'])) {
    //             let newNominationValue: number | null = null
    //             if (nominationFile?.nomination_type_id === 1) {
    //               newNominationValue = parseToNumber(rowDataItem?.data_temp['38'])
    //               if (allo?.gas_hour) {
    //                 let i = 0
    //                 let acc: number | null = null
    //                 do {
    //                   const valuePerHour: number | null = parseToNumber(rowDataItem['data_temp'][`${14 + i}`])
    //                   if (acc) {
    //                     if (valuePerHour) {
    //                       acc = acc + valuePerHour
    //                     }
    //                   } else {
    //                     acc = valuePerHour
    //                   }
    //                   i++
    //                 } while (i < allo?.gas_hour)
    //                 newNominationValue = acc
    //               }
    //             } else {
    //               newNominationValue = parseToNumber(rowDataItem?.data_temp[`${14 + dayOfWeek}`])
    //               if (allo?.gas_hour) {
    //                 newNominationValue = (newNominationValue / 24) * allo?.gas_hour
    //               }
    //             }

    //             if (nominationValue) {
    //               if (newNominationValue || newNominationValue == 0) {
    //                 nominationValue += newNominationValue
    //               }
    //             } else {
    //               nominationValue = newNominationValue
    //             }
    //           }

    //           if (isMatch(rowDataItem?.data_temp['3'], allo['point']) && isMatch(rowDataItem?.data_temp['9'], 'MMBTU/D') && isMatch(rowDataItem?.area_text, allo['area']) && isMatch(rowDataItem?.zone_text, allo['zone'])) {
    //             let newNominationValue: number | null = null
    //             if (nominationFile?.nomination_type_id === 1) {
    //               newNominationValue = parseToNumber(rowDataItem?.data_temp['38'])
    //               if (allo?.gas_hour) {
    //                 let i = 0
    //                 let acc: number | null = null
    //                 do {
    //                   const valuePerHour: number | null = parseToNumber(rowDataItem['data_temp'][`${14 + i}`])
    //                   if (acc) {
    //                     if (valuePerHour) {
    //                       acc = acc + valuePerHour
    //                     }
    //                   } else {
    //                     acc = valuePerHour
    //                   }
    //                   i++
    //                 } while (i < allo?.gas_hour)
    //                 newNominationValue = acc
    //               }
    //             } else {
    //               newNominationValue = parseToNumber(rowDataItem?.data_temp[`${14 + dayOfWeek}`])
    //               if (allo?.gas_hour) {
    //                 newNominationValue = (newNominationValue / 24) * allo?.gas_hour
    //               }
    //             }
    //             if (nominationValue) {
    //               if (newNominationValue || newNominationValue == 0) {
    //                 nominationValue += newNominationValue
    //               }
    //             } else {
    //               nominationValue = newNominationValue
    //             }
    //           }
    //         })

    //         if (!nominationValue && nominationValue != 0 && nominationFile?.nomination_type_id == 1) {
    //           try {
    //             const weeklyThatHaveDailyNomination = convertNomFile?.find((f: any) => {
    //               return (
    //                 getTodayNowYYYYMMDDDfaultAdd7(f?.gas_day).isSame(getTodayNowYYYYMMDDDfaultAdd7(allo['gas_day']), 'week') &&
    //                 f?.group?.id_name === nominationFile?.group?.id_name &&
    //                 f?.contract_code?.contract_code === nominationFile?.contract_code?.contract_code &&
    //                 f?.nomination_type_id == 2 &&
    //                 dailyNominationList.some((daily: any) => daily.contract_code_id == f?.contract_code_id)
    //               )
    //             })

    //             if (weeklyThatHaveDailyNomination) {
    //               const weeklyRowDataItem = weeklyThatHaveDailyNomination.rowData?.find(
    //                 (weeklyRowDataItem: any) =>
    //                   isMatch(weeklyRowDataItem?.data_temp['3'], allo['point']) && isMatch(weeklyRowDataItem?.data_temp['9'], 'MMBTU/D') && (isMatch(weeklyRowDataItem?.area_text, allo['area']) || isMatch('CONCEPT', allo['point_type'])) && isMatch(weeklyRowDataItem?.zone_text, allo['zone'])
    //               )

    //               if (weeklyRowDataItem?.data_temp) {
    //                 let newNominationValue: number | null = null
    //                 newNominationValue = parseToNumber(weeklyRowDataItem?.data_temp[`${14 + dayOfWeek}`])
    //                 if (allo?.gas_hour) {
    //                   newNominationValue = (newNominationValue / 24) * allo?.gas_hour
    //                 }
    //                 if (nominationValue) {
    //                   if (newNominationValue || newNominationValue == 0) {
    //                     nominationValue += newNominationValue
    //                   }
    //                 } else {
    //                   nominationValue = newNominationValue
    //                 }
    //               }
    //             }
    //           } catch (error) { }
    //         }
    //       })
    //   } else {
    //     nominationValue = getAdjustedNomValue({
    //       nomAdjust: nomAdjust,
    //       convertNomFile: convertNomFile,
    //       evidenItem: allo
    //     })
    //   }

    //   const systemAllocation = allo['value']
    //   const previousAllocationTPAforReview = allo['previous_value']

    //   const intraFil =
    //     intradayEviden.find((f: any) => {
    //       return f?.gasday === allo['gas_day']
    //     })?.data || []

    //   const intraFilValue = intraFil.filter((f: any) => {
    //     return f?.data?.filter((ff: any) => {
    //       return (
    //         ff?.contract === allo['contract'] &&
    //         ff?.shipper === allo['shipper'] &&
    //         ff?.data?.filter((fff: any) => {
    //           return fff?.point === allo['data']?.['point']
    //         })
    //       )
    //     })
    //   })

    //   const { data: dataIntraDay = null, ...nIntraDay } = intraFilValue.at(-1) ?? {}
    //   const intradayFind = dataIntraDay?.find((f: any) => {
    //     return f?.contract === allo['contract'] && f?.shipper === allo['shipper']
    //   })
    //   const { data: dataIntradayFind, ...nIntradayFind } = intradayFind ?? {}
    //   const intradayData = dataIntradayFind?.find((f: any) => {
    //     return f?.point === allo['point']
    //   })
    //   const intradayUse = {
    //     ...nIntraDay,
    //     ...nIntradayFind,
    //     data: intradayData
    //   }
    //   const intradaySystem = intradayUse?.data?.value || null

    //   // แนบข้อมูล entry/exit ที่เกี่ยวข้องเพื่อให้ฝั่ง UI ใช้แสดงรายละเอียด
    //   const entry_exit_obj = entryExitMaster.find((f: any) => {
    //     return f?.name?.toUpperCase() === allo['entry_exit']?.toUpperCase()
    //   })

    //   return {
    //     ...allo,
    //     nominationValue,
    //     systemAllocation,
    //     previousAllocationTPAforReview,
    //     intradaySystem,
    //     entry_exit_obj
    //   }
    // })
    // console.timeEnd("allocationQuery s7")

    console.time("allocationQuery s7"); // 1.13m -> 689.253ms

    /**
     * ============================================================
     * 1. Helper สำหรับสร้าง key
     * ============================================================
     */

    const S7_KEY_SEPARATOR = "\u001F";

    const s7KeyValue = (value: any): string => {
      if (value === null || value === undefined) {
        return "";
      }

      return String(value);
    };

    const createIntradayKey = (
      gasDay: any,
      contract: any,
      shipper: any,
      point: any
    ): string => {
      return (
        s7KeyValue(gasDay) +
        S7_KEY_SEPARATOR +
        s7KeyValue(contract) +
        S7_KEY_SEPARATOR +
        s7KeyValue(shipper) +
        S7_KEY_SEPARATOR +
        s7KeyValue(point)
      );
    };

    /**
     * ============================================================
     * 2. สร้าง Context สำหรับ Tab 2
     * ============================================================
     *
     * สร้างครั้งเดียวก่อนวน result
     */

    const adjustedNominationContext =
      (tab === "1" && intradayAllocationGasDays.length < 1)
        ? null
        : createAdjustedNominationContext(
            nomAdjust ?? [],
            convertNomFile ?? []
          );

    /**
     * ============================================================
     * 3. สร้าง Map สำหรับ Entry / Exit
     * ============================================================
     *
     * โค้ดเดิมใช้ find()
     * หากชื่อซ้ำจึงต้องเก็บข้อมูลตัวแรก
     */

    const entryExitMap = new Map<string, any>();

    for (const entryExit of entryExitMaster ?? []) {
      const entryExitKey = String(
        entryExit?.name ?? ""
      ).toUpperCase();

      if (!entryExitMap.has(entryExitKey)) {
        entryExitMap.set(entryExitKey, entryExit);
      }
    }

    /**
     * ============================================================
     * 4. สร้าง Index สำหรับ Intraday
     * ============================================================
     *
     * รักษาพฤติกรรมโค้ดเดิม:
     *
     * const intraFil =
     *   intradayEviden.find(f => f.gasday === allo.gas_day)?.data || []
     *
     * หมายความว่า:
     * - ใช้ intradayEviden ตัวแรกของแต่ละ gasday
     *
     * จากนั้น:
     * const intraFilValue = intraFil.filter(...)
     * const last = intraFilValue.at(-1)
     *
     * callback เดิมคืน array จาก .filter() ซึ่ง array เป็น truthy
     * จึงเท่ากับเลือก outer item ตัวสุดท้ายที่มี data
     */

    const intradaySystemMap = new Map<string, any>();

    const processedIntradayGasDay =
      new Set<string>();

    for (const intradayRecord of intradayEviden ?? []) {
      const gasDay = s7KeyValue(
        intradayRecord?.gasday
      );

      /**
       * เดิมใช้ Array.find()
       * จึงใช้ record แรกของแต่ละ gasday
       */
      if (processedIntradayGasDay.has(gasDay)) {
        continue;
      }

      processedIntradayGasDay.add(gasDay);

      const intraFil =
        intradayRecord?.data ?? [];

      let lastIntraItem: any = undefined;

      /**
       * เลือก outer item ตัวสุดท้ายที่มี data
       */
      for (
        let outerIndex = 0;
        outerIndex < intraFil.length;
        outerIndex++
      ) {
        const outerItem = intraFil[outerIndex];

        if (outerItem?.data) {
          lastIntraItem = outerItem;
        }
      }

      const dataIntraDay =
        lastIntraItem?.data ?? [];

      /**
       * โค้ดเดิมใช้:
       *
       * dataIntraDay.find(
       *   f =>
       *     f.contract === allo.contract &&
       *     f.shipper === allo.shipper
       * )
       *
       * จึงต้องเก็บ contract + shipper ตัวแรก
       */
      const processedContractShipper =
        new Set<string>();

      for (
        let contractIndex = 0;
        contractIndex < dataIntraDay.length;
        contractIndex++
      ) {
        const contractShipperItem =
          dataIntraDay[contractIndex];

        const contract =
          contractShipperItem?.contract;

        const shipper =
          contractShipperItem?.shipper;

        const contractShipperKey =
          s7KeyValue(contract) +
          S7_KEY_SEPARATOR +
          s7KeyValue(shipper);

        if (
          processedContractShipper.has(
            contractShipperKey
          )
        ) {
          continue;
        }

        processedContractShipper.add(
          contractShipperKey
        );

        const pointList =
          contractShipperItem?.data ?? [];

        /**
         * โค้ดเดิมใช้:
         *
         * dataIntradayFind.find(
         *   f => f.point === allo.point
         * )
         *
         * จึงต้องเก็บ point ตัวแรก
         */
        const processedPoint =
          new Set<string>();

        for (
          let pointIndex = 0;
          pointIndex < pointList.length;
          pointIndex++
        ) {
          const pointItem =
            pointList[pointIndex];

          const pointKey =
            s7KeyValue(pointItem?.point);

          if (processedPoint.has(pointKey)) {
            continue;
          }

          processedPoint.add(pointKey);

          const intradayKey =
            createIntradayKey(
              gasDay,
              contract,
              shipper,
              pointItem?.point
            );

          /**
           * รักษาพฤติกรรมเดิม:
           *
           * const intradaySystem =
           *   intradayUse?.data?.value || null
           *
           * ค่า 0 จึงกลายเป็น null เหมือนเดิม
           */
          intradaySystemMap.set(
            intradayKey,
            pointItem?.value || null
          );
        }
      }
    }

    /**
     * ============================================================
     * 5. สร้าง resultPorp
     * ============================================================
     */

    const resultLength =
      result?.length ?? 0;

    const resultPorp =
      new Array(resultLength);

    for (
      let index = 0;
      index < resultLength;
      index++
    ) {
      const allo = result[index];

      let nominationValue:
        | number
        | null = null;

      if (tab === "1") {
        /**
         * Tab 1 ใช้ฟังก์ชันเดิมก่อน
         */
        if(intradayAllocationGasDays.includes(dayjs(allo?.gas_day, 'YYYY-MM-DD').format('DD/MM/YYYY'))) {
          nominationValue = getAdjustedNomValueFast({
            context: adjustedNominationContext!,
            convertNomFile,
            evidenItem: allo,
            allocationMode: 'eod'
          });
        }
        else {
        nominationValue = getNomValue(
          convertNomFile,
          allo
        );
        }
      } else {
        /**
         * Tab 2 ใช้ context/index ที่สร้างครั้งเดียว
         */
        nominationValue =
          getAdjustedNomValueFast({
            context:
              adjustedNominationContext!,
            convertNomFile,
            evidenItem: allo
          });
      }

      const intradayKey =
        createIntradayKey(
          allo?.gas_day,
          allo?.contract,
          allo?.shipper,
          allo?.point
        );

      const intradaySystem =
        intradaySystemMap.has(intradayKey)
          ? intradaySystemMap.get(intradayKey)
          : null;

      const entryExitKey = String(
        allo?.entry_exit ?? ""
      ).toUpperCase();

      const entry_exit_obj =
        entryExitMap.get(entryExitKey);

      resultPorp[index] = {
        ...allo,
        nominationValue,
        systemAllocation: allo?.value,
        previousAllocationTPAforReview:
          allo?.previous_value,
        intradaySystem,
        entry_exit_obj
      };
    }

    /**
     * ============================================================
     * 6. Performance Log
     * ============================================================
     */

    console.log(
      "allocationQuery s7 performance:",
      {
        tab,
        totalRows: resultLength,

        adjustedBaseCache:
          adjustedNominationContext
            ?.targetCache.size ?? 0,

        nomAdjustGasDayIndex:
          adjustedNominationContext
            ?.nomAdjustByGasDay.size ?? 0,

        nomValueBaseCache:
          adjustedNominationContext
            ?.nomValueContext
            ?.baseCache.size ?? 0,

        dailyNominationIndex:
          adjustedNominationContext
            ?.nomValueContext
            ?.dailyNominationMap.size ?? 0,

        weeklyNominationIndex:
          adjustedNominationContext
            ?.nomValueContext
            ?.weeklyNominationMap.size ?? 0,

        intradayIndex:
          intradaySystemMap.size,

        entryExitIndex:
          entryExitMap.size
      }
    );

    console.timeEnd("allocationQuery s7");
    
    // console.time("allocationQuery s8")

    // let response = []
    // for (let iMt = 0; iMt < resultPorp.length; iMt++) {
    //   const aMaster = allocationMaster.find((f: any) => {
    //     return (
    //       f?.gas_day_text === resultPorp[iMt]?.gas_day &&
    //       f?.shipper_name_text === resultPorp[iMt]?.shipper &&
    //       f?.contract_code_text === resultPorp[iMt]?.contract &&
    //       f?.point_text === resultPorp[iMt]?.point &&
    //       f?.entry_exit_text === resultPorp[iMt]?.entry_exit &&
    //       f?.area_text === resultPorp[iMt]?.area &&
    //       f?.zone_text === resultPorp[iMt]?.zone
    //     )
    //   })

    //   response.push({
    //     ...resultPorp[iMt],
    //     id: aMaster?.['id'] || null,
    //     allocation_status: aMaster?.['allocation_status'] || null,
    //     review_code: aMaster?.['review_code'] || null,
    //     allocation_management_comment: aMaster?.['allocation_management_comment'] || [],
    //     allocation_management_shipper_review: aMaster?.['allocation_management_shipper_review'] || []
    //     // aMaster,
    //   })
    // }
    // console.timeEnd("allocationQuery s8")

    console.time("allocationQuery s8");

    const S8_KEY_SEPARATOR = "\u001F";

    const s8KeyValue = (value: any): string => {
      if (value === null || value === undefined) {
        return "";
      }

      return String(value);
    };

    const createAllocationMasterKey = (
      gasDay: any,
      shipper: any,
      contract: any,
      point: any,
      entryExit: any,
      area: any,
      zone: any
    ): string => {
      return (
        s8KeyValue(gasDay) +
        S8_KEY_SEPARATOR +
        s8KeyValue(shipper) +
        S8_KEY_SEPARATOR +
        s8KeyValue(contract) +
        S8_KEY_SEPARATOR +
        s8KeyValue(point) +
        S8_KEY_SEPARATOR +
        s8KeyValue(entryExit) +
        S8_KEY_SEPARATOR +
        s8KeyValue(area) +
        S8_KEY_SEPARATOR +
        s8KeyValue(zone)
      );
    };

    /**
     * ============================================================
     * 1. สร้าง Index ของ allocationMaster
     * ============================================================
     *
     * โค้ดเดิมใช้ allocationMaster.find()
     * ถ้ามีข้อมูล key ซ้ำ จะได้ข้อมูลตัวแรก
     *
     * ดังนั้นห้าม set ทับข้อมูลเดิม
     */
    const allocationMasterMap = new Map<string, any>();

    for (
      let index = 0;
      index < (allocationMaster?.length ?? 0);
      index++
    ) {
      const master = allocationMaster[index];

      const masterKey = createAllocationMasterKey(
        master?.gas_day_text,
        master?.shipper_name_text,
        master?.contract_code_text,
        master?.point_text,
        master?.entry_exit_text,
        master?.area_text,
        master?.zone_text
      );

      /**
       * เก็บตัวแรก เพื่อให้ผลเหมือน Array.find()
       */
      if (!allocationMasterMap.has(masterKey)) {
        allocationMasterMap.set(masterKey, master);
      }
    }

    /**
     * ============================================================
     * 2. สร้าง response
     * ============================================================
     */

    const resultPorpLength = resultPorp?.length ?? 0;
    const response = new Array(resultPorpLength);

    for (
      let index = 0;
      index < resultPorpLength;
      index++
    ) {
      const item = resultPorp[index];

      const itemKey = createAllocationMasterKey(
        item?.gas_day,
        item?.shipper,
        item?.contract,
        item?.point,
        item?.entry_exit,
        item?.area,
        item?.zone
      );

      const aMaster =
        allocationMasterMap.get(itemKey);

      response[index] = {
        ...item,
        id: aMaster?.id || null,
        allocation_status:
          aMaster?.allocation_status || null,
        review_code:
          aMaster?.review_code || null,
        allocation_management_comment:
          aMaster?.allocation_management_comment || [],
        allocation_management_shipper_review:
          aMaster?.allocation_management_shipper_review || []
      };
    }

    console.log("allocationQuery s8 performance:", {
      resultPorpLength,
      allocationMasterLength:
        allocationMaster?.length ?? 0,
      allocationMasterIndex:
        allocationMasterMap.size
    });

    console.timeEnd("allocationQuery s8");

    console.timeEnd('[RUNTIME] allocationQuery')
    return response
  }

  async allocationQueryFromAllocationReport(payload: any, userId: any) {
    // ฟังก์ชันนี้ใช้ดึงข้อมูล allocation สำหรับหน้า(Daily/Intraday) (Tab 1/2)
    // โดยรวมข้อมูลจาก Eviden (EOD/Intraday), Nomination และ Allocation ในระบบ
    const { start_date, end_date, is_last_version, version, skip, limit, tab } = payload
    console.time('[RUNTIME] allocationQuery')

    // *Input validation
    const startDate = getTodayStartAdd7(start_date)
    const endDate = getTodayEndAdd7(end_date)

    if (!startDate.isValid() || !endDate.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (endDate.isBefore(startDate)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    console.time("allocationQuery s1")
    // *Query Necessary Data
    // เตรียม master entry_exit ไว้ใช้แม็ปข้อมูลในภายหลัง
    const entryExitMaster = await this.repo.getEntryExit()
    const lastestAllocationModeBeforeStartDate: allocationModeRecord = await this.prisma.allocation_mode.findFirst({
      where: {
        start_date: {
          lt: startDate.toDate(),
        },
      },
      orderBy: [
        { start_date: 'desc' },
        { create_date: 'desc' },
      ],
      select: {
        start_date: true,
        create_date: true,
        allocation_mode_type: {
          select: {
            mode: true,
          },
        },
      },
    });
    const allocationModesRaw: allocationModeRecord[] = await this.prisma.allocation_mode.findMany({
      where: {
        start_date: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
      orderBy: [
        { start_date: 'asc' },
        { create_date: 'desc' },
      ],
      select: {
        start_date: true,
        create_date: true,
        allocation_mode_type: {
          select: {
            mode: true,
          },
        },
      },
    });
    const allocationModes: allocationModeRecord[] = deduplicateAllocationModesByStartDate(allocationModesRaw);
    const intradayAllocationGasDays: string[] = getIntradayAllocationGasDays(
      [lastestAllocationModeBeforeStartDate,...allocationModes],
      startDate,
      endDate,
    )
    console.timeEnd("allocationQuery s1")
    console.time("allocationQuery s3")

    // สร้างรายการวันภายในช่วงที่เลือก เพื่อใช้เรียก Eviden intraday เมื่อจำเป็น

    // *Reqeust Eviden API
    // ถ้าเรียกไปเกินวันที่มี eviden จะ error ต้องรอเขาแก้ก่อน
    let evidenApiAllocation = []
    let intradayEviden = []
    let evidenApiAllocationReport = []
    const concurrency = 5;
    if (tab === '2') {
      // intraday
      console.time("allocationQuery s3.1")
      const intradayList = await this.repo.getEvidenApiAllocationIntraday(startDate, endDate)
      console.timeEnd("allocationQuery s3.1")
      intradayEviden = intradayList
      evidenApiAllocation = intradayList

      console.time("allocationQuery s3.2");
      evidenApiAllocationReport = await this.repo.getEvidenApiAllocationIntradayReportNom(startDate, endDate)
      console.timeEnd("allocationQuery s3.2");

    } else if (tab === '1') {
      // Daily (EOD)
      evidenApiAllocation = await this.repo.getEvidenApiAllocationEod(startDate, endDate)
      console.time("allocationQuery s3.3");
      evidenApiAllocationReport = await this.repo.getEvidenApiAllocationReportNom(startDate, endDate, true)
      console.timeEnd("allocationQuery s3.3");
      
    }
    console.timeEnd("allocationQuery s3")
    console.time("allocationQuery s4")
    console.log('[INFO] allocationQuery: evidenApiAllocation (FINAL) count =', evidenApiAllocation?.length || 0)
    // *Process Response Eviden
    evidenApiAllocation = version ? evidenApiAllocation.filter((item: any) => version.includes(item?.execute_timestamp)) : evidenApiAllocation

    // คลี่โครงสร้าง Eviden ให้อยู่ในรูป flat list พร้อมแนบข้อมูล shipper/group
    evidenApiAllocation = await flatEvidenApiResponse(evidenApiAllocation, this.prisma)

    console.timeEnd("allocationQuery s4")
    console.time("allocationQuery s5")

    // โหลด allocation ในระบบระหว่างช่วงวันที่มาเตรียมประกอบผลลัพธ์
    let allocationMaster = await this.repo.getAllocationManagement(startDate.toDate(), endDate.toDate())
    console.timeEnd("allocationQuery s5")
    console.time("allocationQuery s6")
    // ถ้าเลือก is_last_version จะเลือกเฉพาะ execute ล่าสุดต่อ key หลัก
    const allowConceptPoints = ['East_to_BVW10', 'West_to_BVW10', 'East_to_RA6', 'West_to_RA6']
    const result: any = is_last_version
      ? Object.values(
        evidenApiAllocation.reduce((acc, curr) => {
          if (curr.point_type === 'CONCEPT' && !allowConceptPoints.includes(curr.point)) return acc
          const gas_hour = curr?.gas_hour || 24
          const key = `${curr.gas_day}|${gas_hour}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
          if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
            acc[key] = curr
          }
          return acc
        }, {})
      )
      : Object.values(
        evidenApiAllocation.reduce((acc, curr) => {
          if (curr.point_type === 'CONCEPT' && !allowConceptPoints.includes(curr.point)) return acc
          const gas_hour = curr?.gas_hour || 24
          const key = `${curr.gas_day}|${gas_hour}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}|${curr.execute_timestamp}`
          if (!acc[key]) {
            acc[key] = curr
          }
          return acc
        }, {})
      )
    console.timeEnd("allocationQuery s6")
    console.log('[INFO] allocationQuery: result count =', result?.length || 0)
    // console.time("allocationQuery s7") // ช้ามากๆ หลายนาทีถ้าดึง 1 เดือน ไปใช้โค้ดล่าง
    // // สร้างข้อมูลรายแถว per point พร้อมคำนวณ Nomination และ Intraday ที่เกี่ยวข้อง
    // const resultPorp = result.map((allo: any) => {
    //   let nominationValue: number | null = null
    //   if (tab === '1') {
    //     // nominationValue = getNomValue(convertNomFile, allo);
    //     const dailyNominationList = convertNomFile?.filter((f: any) => {
    //       return f?.gas_day === allo['gas_day'] && f?.group?.id_name === allo['shipper'] && f?.contract_code?.contract_code === allo['contract'] && f?.nomination_type_id == 1
    //     })

    //     const weeklyNominationList = convertNomFile?.filter((f: any) => {
    //       return (
    //         getTodayNowYYYYMMDDDfaultAdd7(f?.gas_day).isSame(getTodayNowYYYYMMDDDfaultAdd7(allo['gas_day']), 'week') &&
    //         f?.group?.id_name === allo['shipper'] &&
    //         f?.contract_code?.contract_code === allo['contract'] &&
    //         f?.nomination_type_id == 2 &&
    //         !dailyNominationList.some((daily: any) => daily.contract_code_id == f?.contract_code_id)
    //       )
    //     })

    //     const dayOfWeek = Number(getTodayStartAdd7(allo['gas_day']).format('d')) // The day of the week, with Sunday as 0
    //       ;[...dailyNominationList, ...weeklyNominationList].map((nominationFile) => {
    //         nominationFile.rowData?.map((rowDataItem: any) => {
    //           if (allo.point_type == 'CONCEPT' && isMatch(rowDataItem?.data_temp['3'], allo['point']) && isMatch(rowDataItem?.data_temp['9'], 'MMBTU/D') && isMatch(rowDataItem?.zone_text, allo['zone'])) {
    //             let newNominationValue: number | null = null
    //             if (nominationFile?.nomination_type_id === 1) {
    //               newNominationValue = parseToNumber(rowDataItem?.data_temp['38'])
    //               if (allo?.gas_hour) {
    //                 let i = 0
    //                 let acc: number | null = null
    //                 do {
    //                   const valuePerHour: number | null = parseToNumber(rowDataItem['data_temp'][`${14 + i}`])
    //                   if (acc) {
    //                     if (valuePerHour) {
    //                       acc = acc + valuePerHour
    //                     }
    //                   } else {
    //                     acc = valuePerHour
    //                   }
    //                   i++
    //                 } while (i < allo?.gas_hour)
    //                 newNominationValue = acc
    //               }
    //             } else {
    //               newNominationValue = parseToNumber(rowDataItem?.data_temp[`${14 + dayOfWeek}`])
    //               if (allo?.gas_hour) {
    //                 newNominationValue = (newNominationValue / 24) * allo?.gas_hour
    //               }
    //             }

    //             if (nominationValue) {
    //               if (newNominationValue || newNominationValue == 0) {
    //                 nominationValue += newNominationValue
    //               }
    //             } else {
    //               nominationValue = newNominationValue
    //             }
    //           }

    //           if (isMatch(rowDataItem?.data_temp['3'], allo['point']) && isMatch(rowDataItem?.data_temp['9'], 'MMBTU/D') && isMatch(rowDataItem?.area_text, allo['area']) && isMatch(rowDataItem?.zone_text, allo['zone'])) {
    //             let newNominationValue: number | null = null
    //             if (nominationFile?.nomination_type_id === 1) {
    //               newNominationValue = parseToNumber(rowDataItem?.data_temp['38'])
    //               if (allo?.gas_hour) {
    //                 let i = 0
    //                 let acc: number | null = null
    //                 do {
    //                   const valuePerHour: number | null = parseToNumber(rowDataItem['data_temp'][`${14 + i}`])
    //                   if (acc) {
    //                     if (valuePerHour) {
    //                       acc = acc + valuePerHour
    //                     }
    //                   } else {
    //                     acc = valuePerHour
    //                   }
    //                   i++
    //                 } while (i < allo?.gas_hour)
    //                 newNominationValue = acc
    //               }
    //             } else {
    //               newNominationValue = parseToNumber(rowDataItem?.data_temp[`${14 + dayOfWeek}`])
    //               if (allo?.gas_hour) {
    //                 newNominationValue = (newNominationValue / 24) * allo?.gas_hour
    //               }
    //             }
    //             if (nominationValue) {
    //               if (newNominationValue || newNominationValue == 0) {
    //                 nominationValue += newNominationValue
    //               }
    //             } else {
    //               nominationValue = newNominationValue
    //             }
    //           }
    //         })

    //         if (!nominationValue && nominationValue != 0 && nominationFile?.nomination_type_id == 1) {
    //           try {
    //             const weeklyThatHaveDailyNomination = convertNomFile?.find((f: any) => {
    //               return (
    //                 getTodayNowYYYYMMDDDfaultAdd7(f?.gas_day).isSame(getTodayNowYYYYMMDDDfaultAdd7(allo['gas_day']), 'week') &&
    //                 f?.group?.id_name === nominationFile?.group?.id_name &&
    //                 f?.contract_code?.contract_code === nominationFile?.contract_code?.contract_code &&
    //                 f?.nomination_type_id == 2 &&
    //                 dailyNominationList.some((daily: any) => daily.contract_code_id == f?.contract_code_id)
    //               )
    //             })

    //             if (weeklyThatHaveDailyNomination) {
    //               const weeklyRowDataItem = weeklyThatHaveDailyNomination.rowData?.find(
    //                 (weeklyRowDataItem: any) =>
    //                   isMatch(weeklyRowDataItem?.data_temp['3'], allo['point']) && isMatch(weeklyRowDataItem?.data_temp['9'], 'MMBTU/D') && (isMatch(weeklyRowDataItem?.area_text, allo['area']) || isMatch('CONCEPT', allo['point_type'])) && isMatch(weeklyRowDataItem?.zone_text, allo['zone'])
    //               )

    //               if (weeklyRowDataItem?.data_temp) {
    //                 let newNominationValue: number | null = null
    //                 newNominationValue = parseToNumber(weeklyRowDataItem?.data_temp[`${14 + dayOfWeek}`])
    //                 if (allo?.gas_hour) {
    //                   newNominationValue = (newNominationValue / 24) * allo?.gas_hour
    //                 }
    //                 if (nominationValue) {
    //                   if (newNominationValue || newNominationValue == 0) {
    //                     nominationValue += newNominationValue
    //                   }
    //                 } else {
    //                   nominationValue = newNominationValue
    //                 }
    //               }
    //             }
    //           } catch (error) { }
    //         }
    //       })
    //   } else {
    //     nominationValue = getAdjustedNomValue({
    //       nomAdjust: nomAdjust,
    //       convertNomFile: convertNomFile,
    //       evidenItem: allo
    //     })
    //   }

    //   const systemAllocation = allo['value']
    //   const previousAllocationTPAforReview = allo['previous_value']

    //   const intraFil =
    //     intradayEviden.find((f: any) => {
    //       return f?.gasday === allo['gas_day']
    //     })?.data || []

    //   const intraFilValue = intraFil.filter((f: any) => {
    //     return f?.data?.filter((ff: any) => {
    //       return (
    //         ff?.contract === allo['contract'] &&
    //         ff?.shipper === allo['shipper'] &&
    //         ff?.data?.filter((fff: any) => {
    //           return fff?.point === allo['data']?.['point']
    //         })
    //       )
    //     })
    //   })

    //   const { data: dataIntraDay = null, ...nIntraDay } = intraFilValue.at(-1) ?? {}
    //   const intradayFind = dataIntraDay?.find((f: any) => {
    //     return f?.contract === allo['contract'] && f?.shipper === allo['shipper']
    //   })
    //   const { data: dataIntradayFind, ...nIntradayFind } = intradayFind ?? {}
    //   const intradayData = dataIntradayFind?.find((f: any) => {
    //     return f?.point === allo['point']
    //   })
    //   const intradayUse = {
    //     ...nIntraDay,
    //     ...nIntradayFind,
    //     data: intradayData
    //   }
    //   const intradaySystem = intradayUse?.data?.value || null

    //   // แนบข้อมูล entry/exit ที่เกี่ยวข้องเพื่อให้ฝั่ง UI ใช้แสดงรายละเอียด
    //   const entry_exit_obj = entryExitMaster.find((f: any) => {
    //     return f?.name?.toUpperCase() === allo['entry_exit']?.toUpperCase()
    //   })

    //   return {
    //     ...allo,
    //     nominationValue,
    //     systemAllocation,
    //     previousAllocationTPAforReview,
    //     intradaySystem,
    //     entry_exit_obj
    //   }
    // })
    // console.timeEnd("allocationQuery s7")

    console.time("allocationQuery s7"); // 1.13m -> 689.253ms

    /**
     * ============================================================
     * 1. Helper สำหรับสร้าง key
     * ============================================================
     */

    const S7_KEY_SEPARATOR = "\u001F";

    const s7KeyValue = (value: any): string => {
      if (value === null || value === undefined) {
        return "";
      }

      return String(value);
    };

    const createIntradayKey = (
      gasDay: any,
      contract: any,
      shipper: any,
      point: any
    ): string => {
      return (
        s7KeyValue(gasDay) +
        S7_KEY_SEPARATOR +
        s7KeyValue(contract) +
        S7_KEY_SEPARATOR +
        s7KeyValue(shipper) +
        S7_KEY_SEPARATOR +
        s7KeyValue(point)
      );
    };

    /**
     * ============================================================
     * 2. สร้าง Context สำหรับ Tab 2
     * ============================================================
     *
     * สร้างครั้งเดียวก่อนวน result
     */

    /**
     * ============================================================
     * 3. สร้าง Map สำหรับ Entry / Exit
     * ============================================================
     *
     * โค้ดเดิมใช้ find()
     * หากชื่อซ้ำจึงต้องเก็บข้อมูลตัวแรก
     */

    const entryExitMap = new Map<string, any>();

    for (const entryExit of entryExitMaster ?? []) {
      const entryExitKey = String(
        entryExit?.name ?? ""
      ).toUpperCase();

      if (!entryExitMap.has(entryExitKey)) {
        entryExitMap.set(entryExitKey, entryExit);
      }
    }

    /**
     * ============================================================
     * 4. สร้าง Index สำหรับ Intraday
     * ============================================================
     *
     * รักษาพฤติกรรมโค้ดเดิม:
     *
     * const intraFil =
     *   intradayEviden.find(f => f.gasday === allo.gas_day)?.data || []
     *
     * หมายความว่า:
     * - ใช้ intradayEviden ตัวแรกของแต่ละ gasday
     *
     * จากนั้น:
     * const intraFilValue = intraFil.filter(...)
     * const last = intraFilValue.at(-1)
     *
     * callback เดิมคืน array จาก .filter() ซึ่ง array เป็น truthy
     * จึงเท่ากับเลือก outer item ตัวสุดท้ายที่มี data
     */

    const intradaySystemMap = new Map<string, any>();

    const processedIntradayGasDay =
      new Set<string>();

    for (const intradayRecord of intradayEviden ?? []) {
      const gasDay = s7KeyValue(
        intradayRecord?.gasday
      );

      /**
       * เดิมใช้ Array.find()
       * จึงใช้ record แรกของแต่ละ gasday
       */
      if (processedIntradayGasDay.has(gasDay)) {
        continue;
      }

      processedIntradayGasDay.add(gasDay);

      const intraFil =
        intradayRecord?.data ?? [];

      let lastIntraItem: any = undefined;

      /**
       * เลือก outer item ตัวสุดท้ายที่มี data
       */
      for (
        let outerIndex = 0;
        outerIndex < intraFil.length;
        outerIndex++
      ) {
        const outerItem = intraFil[outerIndex];

        if (outerItem?.data) {
          lastIntraItem = outerItem;
        }
      }

      const dataIntraDay =
        lastIntraItem?.data ?? [];

      /**
       * โค้ดเดิมใช้:
       *
       * dataIntraDay.find(
       *   f =>
       *     f.contract === allo.contract &&
       *     f.shipper === allo.shipper
       * )
       *
       * จึงต้องเก็บ contract + shipper ตัวแรก
       */
      const processedContractShipper =
        new Set<string>();

      for (
        let contractIndex = 0;
        contractIndex < dataIntraDay.length;
        contractIndex++
      ) {
        const contractShipperItem =
          dataIntraDay[contractIndex];

        const contract =
          contractShipperItem?.contract;

        const shipper =
          contractShipperItem?.shipper;

        const contractShipperKey =
          s7KeyValue(contract) +
          S7_KEY_SEPARATOR +
          s7KeyValue(shipper);

        if (
          processedContractShipper.has(
            contractShipperKey
          )
        ) {
          continue;
        }

        processedContractShipper.add(
          contractShipperKey
        );

        const pointList =
          contractShipperItem?.data ?? [];

        /**
         * โค้ดเดิมใช้:
         *
         * dataIntradayFind.find(
         *   f => f.point === allo.point
         * )
         *
         * จึงต้องเก็บ point ตัวแรก
         */
        const processedPoint =
          new Set<string>();

        for (
          let pointIndex = 0;
          pointIndex < pointList.length;
          pointIndex++
        ) {
          const pointItem =
            pointList[pointIndex];

          const pointKey =
            s7KeyValue(pointItem?.point);

          if (processedPoint.has(pointKey)) {
            continue;
          }

          processedPoint.add(pointKey);

          const intradayKey =
            createIntradayKey(
              gasDay,
              contract,
              shipper,
              pointItem?.point
            );

          /**
           * รักษาพฤติกรรมเดิม:
           *
           * const intradaySystem =
           *   intradayUse?.data?.value || null
           *
           * ค่า 0 จึงกลายเป็น null เหมือนเดิม
           */
          intradaySystemMap.set(
            intradayKey,
            pointItem?.value || null
          );
        }
      }
    }

    /**
     * ============================================================
     * 5. สร้าง resultPorp
     * ============================================================
     */

    const resultLength =
      result?.length ?? 0;

    const resultPorp =
      new Array(resultLength);

    for (
      let index = 0;
      index < resultLength;
      index++
    ) {
      const allo = result[index];

      let nominationValue:
        | number
        | null = null;

      let contractCapacityValue: number | null = null;
      let allocatedValue: number | null = null;
      

      const alloReportList = evidenApiAllocationReport.filter(alloReport => alloReport.execute_timestamp == allo.execute_timestamp && alloReport.gas_day == allo.gas_day)
      alloReportList.map(alloReport => {
        const sameContractAlloReportDataList = alloReport.data.filter((alloReportData: any) => alloReportData.contract == allo.contract && alloReportData.shipper == allo.shipper)
        sameContractAlloReportDataList.map((alloReportData: any) => {
          const samePointAlloReportDataItemList = alloReportData.data.filter((alloReportDataItem: any) => alloReportDataItem.point == allo.point &&
            alloReportDataItem.zone == allo.zone &&
            alloReportDataItem.area == allo.area &&
            alloReportDataItem.customer_type == allo.customer_type &&
            alloReportDataItem.point_type == allo.point_type &&
            alloReportDataItem.relation_point == allo.relation_point &&
            alloReportDataItem.relation_point_type == allo.relation_point_type &&
            alloReportDataItem.entry_exit == allo.entry_exit
          )
          samePointAlloReportDataItemList.map((alloReportDataItem: any) => {
            const allocatedValueList = alloReportDataItem.values.filter((value: any) => value.tag == 'allocatedValue')
            const nominatedValueList = alloReportDataItem.values.filter((value: any) => value.tag == 'nominatedValue')
            const contractCapacityList = alloReportDataItem.values.filter((value: any) => value.tag == 'contractCapacity')

            allocatedValueList.map((valueItem:any) => {
              if(valueItem.value || valueItem.value == 0) {
                if(allocatedValue){
                  allocatedValue = parseToNumber6Decimal(allocatedValue + valueItem.value)
                }
                else{
                  allocatedValue = valueItem.value
                }
              }
            })

            nominatedValueList.map((valueItem:any) => {
              if(valueItem.value || valueItem.value == 0) {
                if(nominationValue){
                  nominationValue = parseToNumber6Decimal(nominationValue + valueItem.value)
                }
                else{
                  nominationValue = valueItem.value
                }
              }
            })

            contractCapacityList.map((valueItem:any) => {
              if(valueItem.value || valueItem.value == 0) {
                if(contractCapacityValue){
                  contractCapacityValue = parseToNumber6Decimal(contractCapacityValue + valueItem.value)
                }
                else{
                  contractCapacityValue = valueItem.value
                }
              }
            })
          })
        })
      })

      const intradayKey =
        createIntradayKey(
          allo?.gas_day,
          allo?.contract,
          allo?.shipper,
          allo?.point
        );

      const intradaySystem =
        intradaySystemMap.has(intradayKey)
          ? intradaySystemMap.get(intradayKey)
          : null;

      const entryExitKey = String(
        allo?.entry_exit ?? ""
      ).toUpperCase();

      const entry_exit_obj =
        entryExitMap.get(entryExitKey);

      resultPorp[index] = {
        ...allo,
        nominationValue,
        contractCapacityValue,
        allocatedValue,
        usagePercentage: ((allo?.value || allo?.value == 0) && (contractCapacityValue)) ? parseToNumber2Decimal((allo?.value / contractCapacityValue) * 100) : null,
        systemAllocation: allo?.value,
        previousAllocationTPAforReview:
          allo?.previous_value,
        intradaySystem,
        entry_exit_obj
      };
    }

    /**
     * ============================================================
     * 6. Performance Log
     * ============================================================
     */

    console.log(
      "allocationQuery s7 performance:",
      {
        tab,
        totalRows: resultLength,

        intradayIndex:
          intradaySystemMap.size,

        entryExitIndex:
          entryExitMap.size
      }
    );

    console.timeEnd("allocationQuery s7");

    console.time("allocationQuery s8");

    const S8_KEY_SEPARATOR = "\u001F";

    const s8KeyValue = (value: any): string => {
      if (value === null || value === undefined) {
        return "";
      }

      return String(value);
    };

    const createAllocationMasterKey = (
      gasDay: any,
      shipper: any,
      contract: any,
      point: any,
      entryExit: any,
      area: any,
      zone: any
    ): string => {
      return (
        s8KeyValue(gasDay) +
        S8_KEY_SEPARATOR +
        s8KeyValue(shipper) +
        S8_KEY_SEPARATOR +
        s8KeyValue(contract) +
        S8_KEY_SEPARATOR +
        s8KeyValue(point) +
        S8_KEY_SEPARATOR +
        s8KeyValue(entryExit) +
        S8_KEY_SEPARATOR +
        s8KeyValue(area) +
        S8_KEY_SEPARATOR +
        s8KeyValue(zone)
      );
    };

    /**
     * ============================================================
     * 1. สร้าง Index ของ allocationMaster
     * ============================================================
     *
     * โค้ดเดิมใช้ allocationMaster.find()
     * ถ้ามีข้อมูล key ซ้ำ จะได้ข้อมูลตัวแรก
     *
     * ดังนั้นห้าม set ทับข้อมูลเดิม
     */
    const allocationMasterMap = new Map<string, any>();

    for (
      let index = 0;
      index < (allocationMaster?.length ?? 0);
      index++
    ) {
      const master = allocationMaster[index];

      const masterKey = createAllocationMasterKey(
        master?.gas_day_text,
        master?.shipper_name_text,
        master?.contract_code_text,
        master?.point_text,
        master?.entry_exit_text,
        master?.area_text,
        master?.zone_text
      );

      /**
       * เก็บตัวแรก เพื่อให้ผลเหมือน Array.find()
       */
      if (!allocationMasterMap.has(masterKey)) {
        allocationMasterMap.set(masterKey, master);
      }
    }

    /**
     * ============================================================
     * 2. สร้าง response
     * ============================================================
     */

    const resultPorpLength = resultPorp?.length ?? 0;
    const response = new Array(resultPorpLength);

    for (
      let index = 0;
      index < resultPorpLength;
      index++
    ) {
      const item = resultPorp[index];

      const itemKey = createAllocationMasterKey(
        item?.gas_day,
        item?.shipper,
        item?.contract,
        item?.point,
        item?.entry_exit,
        item?.area,
        item?.zone
      );

      const aMaster =
        allocationMasterMap.get(itemKey);

      response[index] = {
        ...item,
        id: aMaster?.id || null,
        allocation_status:
          aMaster?.allocation_status || null,
        review_code:
          aMaster?.review_code || null,
        allocation_management_comment:
          aMaster?.allocation_management_comment || [],
        allocation_management_shipper_review:
          aMaster?.allocation_management_shipper_review || []
      };
    }

    console.log("allocationQuery s8 performance:", {
      resultPorpLength,
      allocationMasterLength:
        allocationMaster?.length ?? 0,
      allocationMasterIndex:
        allocationMasterMap.size
    });

    console.timeEnd("allocationQuery s8");

    console.timeEnd('[RUNTIME] allocationQuery')
    return response
  }

  // allocationReportViewGet
  async allocationReport(payload: any, userId: any) { 
    console.time('[RUNTIME] allocationReport')
    const { start_date, end_date, skip: skip_, limit: limit_, tab: tab_ } = payload
    const tab = String(tab_)
    const start = getTodayStartAdd7(start_date)
    const end = getTodayEndAdd7(end_date)
    const startDate = start.toDate()
    const endDate = end.toDate()

    if (!start.isValid() || !end.isValid()) {
      throw new Error('⛔ Invalid date format')
    }

    if (end.isBefore(start)) {
      throw new Error('⛔ End date must be after or equal to start date')
    }

    // *Query data
    const [entryExitMaster, areaMaster, publicList] = await Promise.all([this.repo.getEntryExit(), this.repo.getArea(startDate, endDate), this.repo.getPublication(startDate, endDate, true)])
    let allocationReport = await this.repo.getAllocationReport(startDate, endDate)
    console.log('__allocationReport : ', allocationReport);
    // *build lookup
    const entryExitMap = new Map<string, any>(entryExitMaster.map((e: any) => [String(e?.name ?? '').toUpperCase(), e]))

    const areaMap = new Map<string, any>()
    for (const a of areaMaster as any[]) {
      const name = String(a?.name ?? '').toUpperCase()
      const entx = String(a?.entry_exit_id ?? '')
      areaMap.set(`${name}|${entx}`, a)
    }

    const deletedPubSet = new Set<string>()
    for (const d of publicList as any[]) {
      deletedPubSet.add(`${d?.execute_timestamp ?? ''}|${d?.gas_day_text ?? ''}|${d?.gas_hour ?? ''}`)
    }

    const makeAlloKey = (x: any) => `${x.gas_day_text}|${x.shipper_name_text}|${x.contract_code_text}|${x.point_text}|${x.entry_exit_text}|${x.area_text}|${x.zone_text}`
    const allocationReportMap = new Map<string, any>()
    for (const a of allocationReport as any[]) allocationReportMap.set(makeAlloKey(a), a)

    // *request eviden api
    let evidenApi = []
    if (tab === '1') {
      evidenApi = await this.repo.getEvidenApiAllocationReportCon(start, end, true)
    } else {
      evidenApi = await this.repo.getEvidenApiAllocationIntradayReportCon(start, end)
    }
    const flatEvidenApi = await flatEvidenApiResponse(evidenApi, this.prisma)
    // *process data
    const result: any =
      tab === '1'
        ? Object.values(
          flatEvidenApi.reduce((acc, curr) => {
            const key = `${curr.gas_day}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}`
            if (!acc[key] || acc[key].execute_timestamp < curr.execute_timestamp) {
              acc[key] = curr
            }
            return acc
          }, {})
        )
        : Object.values(
          flatEvidenApi.reduce((acc, curr) => {
            const key = `${curr.gas_day}|${curr.gas_hour}|${curr.shipper}|${curr.contract}|${curr.point}|${curr.entry_exit}|${curr.area}|${curr.zone}|${curr.execute_timestamp}`
            if (!acc[key]) {
              acc[key] = curr
            }
            return acc
          }, {})
        )

    // *check update new allocation report
    const newAllocation: any[] = []
    const newAllocationKeySet = new Set<string>()

    for (const r of result) {
      const dbKey = `${r.gas_day}|${r.shipper}|${r.contract}|${r.contract_point}|${r.entry_exit}|${r.area}|${r.zone}`
      const existed = allocationReportMap.get(`${r.gas_day}|${r.shipper}|${r.contract}|${r.contract_point}|${r.entry_exit}|${r.area}|${r.zone}`)

      if (!existed && !newAllocationKeySet.has(dbKey)) {
        newAllocationKeySet.add(dbKey)
        newAllocation.push({
          shipper_name_text: r.shipper,
          gas_day_text: r.gas_day,
          contract_code_text: r.contract,
          point_text: r.contract_point,
          entry_exit_text: r.entry_exit,
          area_text: r.area,
          zone_text: r.zone,
          gas_day: getTodayNowYYYYMMDDDfaultAdd7(r.gas_day + 'T00:00:00Z').toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by: Number(userId)
        })
      }
    }

    if (newAllocation.length > 0) {
      await this.repo.createAllocationReport(newAllocation)
      allocationReport = await this.repo.getAllocationReport(startDate, endDate)
    }

    // *build response
    const response = result.map((record: any) => {
      const values = record?.values ?? []

      // faster than multiple .find(): build tag->value once
      const tagMap = new Map<string, any>()
      for (const v of values) tagMap.set(v?.tag, v?.value)

      const contractCapacity = tagMap.get('contractCapacity') ?? null
      const nominationValue = tagMap.get('nominatedValue') ?? null
      const allocatedValue = tagMap.get('allocatedValue') ?? null
      const overusage = tagMap.get('overusage') ?? null
      const intradaySystemAllocation = null

      const entry_exit_obj = entryExitMap.get(String(record?.entry_exit ?? '').toUpperCase()) ?? null

      const entx = String(record?.entry_exit ?? '').toUpperCase() === 'ENTRY' ? 1 : 2
      const area_obj = areaMap.get(`${String(record?.area ?? '').toUpperCase()}|${entx}`) ?? null

      const findAllocationReport = allocationReportMap.get(`${record?.gas_day}|${record?.shipper}|${record?.contract}|${record?.contract_point}|${record?.entry_exit}|${record?.area}|${record?.zone}`)

      // publication check using Set
      let publication = true
      if (tab == '2') {
        const gasHourKey = record?.gas_hour ?? ''
        const deletedKey = `${record?.execute_timestamp ?? ''}|${record?.gas_day ?? ''}|${gasHourKey}`
        publication = !deletedPubSet.has(deletedKey)
      }

      return {
        publication,
        id: findAllocationReport?.id,
        ...record,
        contractCapacity,
        nominationValue,
        allocatedValue,
        overusage,
        intradaySystemAllocation,
        entry_exit_obj,
        area_obj
      }
    })
    console.timeEnd('[RUNTIME] allocationReport')

    // publication
    if (tab === '2') {
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
        const publicationOnly = response?.filter((f: any) => f?.publication === true)
        // Group by gas_day and gas_hour then find max execute_timestamp for each group
        const gasHourGroups = publicationOnly.reduce((acc: any, item: any) => {
          const key = `${item.gas_day}_${item.gas_hour}`
          if (!acc[key]) {
            acc[key] = []
          }
          acc[key].push(item)
          return acc
        }, {})

        // For each gas_day and gas_hour, keep only items with the latest execute_timestamp
        const latestItems: any[] = []
        Object.keys(gasHourGroups).forEach((gasDay) => {
          const items = gasHourGroups[gasDay]
          // Find the maximum execute_timestamp for this gas_day
          const maxTimestamp = Math.max(...items.map((item: any) => item.execute_timestamp))
          // Keep only items with the maximum timestamp
          const latestForGasDay = items.filter((item: any) => item.execute_timestamp === maxTimestamp)
          latestItems.push(...latestForGasDay)
        })

        return latestItems
      }

      // return response

      // https://app.clickup.com/t/9018502823/86extxcvp
      const latestData = Object.values(
        response.reduce((acc: any, item: any) => {
          // const pointKey = item.point_id ?? item.point?.id ?? item.point;
          const pointKey = item.contract_point;

          const key = `${item.gas_day}_${item.gas_hour}_${item.contract}_${pointKey}`;

          if (
            !acc[key] ||
            Number(item.execute_timestamp) > Number(acc[key].execute_timestamp)
          ) {
            acc[key] = item;
          }

          return acc;
        }, {})
      );
      return latestData.sort((a: any, b: any) => {
        if(a.gas_day === b.gas_day) {
          const aGasHour = a.gas_hour
          const bGasHour = b.gas_hour
          return bGasHour - aGasHour
        }
        const aGasDay = getTodayNowYYYYMMDDDfaultAdd7(a.gas_day)
        const bGasDay = getTodayNowYYYYMMDDDfaultAdd7(b.gas_day)
        return bGasDay.diff(aGasDay, 'day')
      })


    } else {
      return response
    }
  }

  async allocationReviewShipperData(payload: any, userId: any) {
    try {
      const todayStart = getTodayStartAdd7()
      const todayEnd = getTodayEndAdd7()
      const systemParameter: systemParameterWithRelations[] = await this.prisma.system_parameter.findMany({
        where: {
          system_parameter: {
            id: {
              in: [ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW, ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW_DUPLICATE]
            }
          },
          AND: [
            {
              start_date: {
                lte: todayEnd?.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gt: todayStart?.toDate()
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        },
        ...systemParameterPopulate
      })

      const now = getTodayNowAdd7()
      let canReviewAfterDate = now
      const activeSystemParameter = systemParameter.find((parameter) => parameter.start_date <= todayEnd.toDate() && (parameter.end_date > todayStart.toDate() || parameter.end_date === null))
      const numberOfDaysCanReviewAfter = parseToNumber(activeSystemParameter?.value)
      if (numberOfDaysCanReviewAfter != null) {
        canReviewAfterDate = now.subtract(numberOfDaysCanReviewAfter, 'day')
      }

      const groups = await this.prisma.group.findMany({
        where: {
          user_type_id: 3,
          contract_code: {
            some: {
              // contract_start_date: { lte: todayEnd.toDate() }, // Started before or on target date
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
                        gt: canReviewAfterDate.toDate()
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
                            gt: canReviewAfterDate.toDate()
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
                                gt: canReviewAfterDate.toDate()
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
          }
        },
        include: {
          contract_code: {
            where: {
              // contract_start_date: { lte: todayEnd.toDate() }, // Started before or on target date
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
                        gt: canReviewAfterDate.toDate()
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
                            gt: canReviewAfterDate.toDate()
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
                                gt: canReviewAfterDate.toDate()
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
              group: true
            }
          }
        },
        orderBy: {
          id: 'desc'
        }
      })

      return groups
    } catch (error) {
      return []
    }
  }
}
