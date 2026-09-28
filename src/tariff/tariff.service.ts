import {forwardRef, HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {JwtService} from '@nestjs/jwt'
import * as fs from 'fs'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as buddhistEra from 'dayjs/plugin/buddhistEra'
import {Response} from 'express'
import * as pdfMake from 'pdfmake/build/pdfmake'
import {vfs, logoPtt, used, notUsed, checkBoxCheck, checkBox} from '../fonts/vfs_fonts'
import * as isBetween from 'dayjs/plugin/isBetween'
import {getTodayEndAdd7, getTodayEndDDMMYYYYDfaultAdd7, getTodayEndYYYYMMDDDfaultAdd7, getTodayNow, getTodayNowAdd7, getTodayNowYYYYMMDDDfaultAdd7, getTodayStartAdd7, getTodayStartDDMMYYYYDfaultAdd7, getTodayStartYYYYMMDDDfaultAdd7, getYearEndAdd7, getYearStartAdd7} from 'src/common/utils/date.util'
import * as archiver from 'archiver'
import * as nodemailer from 'nodemailer'
import JSZip from 'jszip'
import {AllocationService} from 'src/allocation/allocation.service'
import {ExportFilesService} from 'src/export-files/export-files.service'
import {BalancingService} from 'src/balancing/balancing.service'
import axios from 'axios'
import {
  ABS_VALUE_ADJ_DAILY_NEGATIVE_IMB_TOLERANCE_ID,
  ABS_VALUE_ADJ_DAILY_POSITIVE_IMB_TOLERANCE_ID,
  DAMAGE_CHARGE_FEE_ID,
  DAMAGE_CO_EFF_ID,
  ENTRY_CAP_OVER_USE_CHARGE_TOLERANCE_ID,
  ENTRY_CAP_OVER_USE_CO_EFF_ID,
  EXIT_CAP_OVER_USE_CHARGE_TOLERANCE_ID,
  EXIT_CAP_OVER_USE_CO_EFF_ID,
  EXIT_COMMDOITY_OVER_USE_FOR_ALL_CONTRACT_TYPE_CHARGE_FEE_ID,
  getCapacityChargeFeeSystemParameterIDByTermTypeID,
  getEntryCapacityOveruseChargeFeeSystemParameterIDByTermTypeID,
  getExitCapacityOveruseChargeFeeSystemParameterIDByTermTypeID,
  getExitCommodityChargeFeeSystemParameterIDByTermTypeID,
  getLatestSystemParameterValue,
  NEGATIVE_BAL_CHARGE_PENALTY_FEE_ID,
  POSITIVE_BAL_CHARGE_PENALTY_FEE_ID,
  systemParameterPopulate,
  systemParameterWithRelations,
  TARIFF_SYSTEM_PARAMETER
} from 'src/common/utils/tariff.util'
import {parseToNumber} from 'src/common/utils/number.util'
import {middleNotiInapp} from 'src/common/utils/inapp.util'
import {AllocationRepository} from 'src/allocation/allocation.repository'

dayjs.extend(isBetween)
dayjs.extend(isSameOrBefore)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(buddhistEra)
dayjs.tz.setDefault('Asia/Bangkok')

@Injectable()
export class TariffService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => AllocationService))
    private readonly allocationService: AllocationService,
    @Inject(forwardRef(() => ExportFilesService))
    private readonly exportFilesService: ExportFilesService,
    private readonly balancingService: BalancingService,
    private readonly repo: AllocationRepository
  ) {}

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
      module: 'TARIFF',
      ...(!!reqUser?.user?.sub && {
        create_by_account: {
          connect: {
            id: Number(reqUser?.user?.sub)
          }
        }
      })
    }
    await this.prisma.history.create({
      data: usedData
    })
    return true
  }

  async tariffType() {
    const results = await this.prisma.tariff_type.findMany({
      orderBy: {
        id: 'asc'
      }
    })

    return results
  }

  async tariffInvoiceSent() {
    const results = await this.prisma.tariff_invoice_sent.findMany({
      orderBy: {
        id: 'asc'
      }
    })
    return results
  }

  async shipperMonthActive(date: any) {
    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(date).toDate()
    const todayEnd = getTodayNowAdd7().toDate()
    const results = await this.prisma.group.findMany({
      where: {
        AND: [
          {
            start_date: {
              gte: todayStart // start_date มากกว่านหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: todayEnd
                }
              } // ถ้า end_date ไม่เป็น null มากกว่าหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ],
        id: {
          not: 1
        },
        status: true,
        user_type_id: 3
      },
      orderBy: {
        id: 'asc'
      }
    })
    return results
  }

  async tariffChargeType() {
    // const results = await this.prisma.tariff_type_charge.findMany({
    //   orderBy: {
    //     id: 'asc',
    //   },
    // });
    const order = [1, 2, 5, 6, 3, 4, 7]
    const orderIdx = new Map(order.map((v, i) => [v, i]))

    const results = await this.prisma.tariff_type_charge.findMany()
    results.sort((a, b) => (orderIdx.get(a.id) ?? 999) - (orderIdx.get(b.id) ?? 999))
    return results
  }

  async tariffChargeReportFindId(payload: any, userId: any) {
    const {month_year_charge, shipper_id} = payload

    const base = month_year_charge && dayjs(month_year_charge).tz('Asia/Bangkok')
    const monthStart = base && base.startOf('month').toDate()
    const nextMonthStart = base && base.startOf('month').add(1, 'month').toDate()

    const results = await this.prisma.tariff.findMany({
      where: {
        ...(shipper_id && {
          tariff_invoice_sent_id: 1,
          shipper_id: Number(shipper_id)
        }),
        ...(month_year_charge && {
          month_year_charge: {
            gte: monthStart,
            lt: nextMonthStart
          }
        })
      },
      select: {
        id: true,
        tariff_id: true,
        shipper_id: true,
        month_year_charge: true,
        tariff_invoice_sent: true,
        tariff_invoice_sent_id: true
      },
      orderBy: {
        id: 'desc'
      }
    })
    return results
  }

  async chargeEdit(id: any, payload: any, userId: any) {
    const {quantity_operator, amount_operator} = payload

    const nowAt = getTodayNowAdd7()

    const result = await this.prisma.$transaction(
      async (prisma) => {
        const result = await prisma.tariff_charge.update({
          where: {
            id: Number(id ?? -1)
          },
          data: {
            quantity_operator: quantity_operator || null,
            amount_operator: amount_operator || null,
            update_date: nowAt.toDate(),
            update_date_num: nowAt.unix(),
            update_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        await prisma.tariff.updateMany({
          where: {
            tariff_charge: {
              some: {
                id: result.tariff_id
              }
            },
            tariff_type_id: 1
          },
          data: {
            tariff_type_id: 2
          }
        })

        return result
      },
      {
        timeout: 60000, // เพิ่มเป็น 1 นาที
        maxWait: 60000 // รอให้ transaction พร้อม
      }
    )

    return result
  }

  async invoiceSent(id: any, payload: any, userId: any) {
    const nowAt = getTodayNowAdd7()

    const resultCkSelf = await this.prisma.tariff.findFirst({
      where: {
        id: Number(id)
      },
      select: {
        id: true,
        month_year_charge: true,
        shipper_id: true
      }
    })

    if (!resultCkSelf?.month_year_charge) return []

    const base = dayjs(resultCkSelf.month_year_charge).tz('Asia/Bangkok') // ให้ชัวร์เรื่องโซนเวลา
    const monthStart = base.startOf('month').toDate()
    const nextMonthStart = base.startOf('month').add(1, 'month').toDate()

    const resultCk = await this.prisma.tariff.findMany({
      where: {
        id: {
          not: Number(id)
        },
        shipper_id: resultCkSelf && resultCkSelf?.shipper_id || -1,
        month_year_charge: {
          gte: monthStart,
          lt: nextMonthStart // ใช้ lt แทน lte endOf('month') เพื่อกันเศษวินาที
        }
      }
    })
    const idArr = resultCk?.map((e: any) => e?.id) || []

    const result = await this.prisma.tariff.update({
      where: {
        id: Number(id ?? -1)
      },
      data: {
        tariff_invoice_sent: {
          connect: {
            id: Number(1)
          }
        },
        update_date: nowAt.toDate(),
        update_date_num: nowAt.unix(),
        update_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    await this.prisma.tariff.updateMany({
      where: {
        id: {
          in: idArr
        }
      },
      data: {
        tariff_invoice_sent_id: 2
      }
    })
    return result
  }

  toArray(input: any): any[] {
    if (input == null) return []
    if (Array.isArray(input)) return input

    if (typeof input === 'string') {
      const s = input.trim()
      if (s === '') return []

      // ลอง parse JSON ก่อน (เช่น '["a","b"]', '123', 'true', 'null')
      try {
        const parsed = JSON.parse(s)
        return Array.isArray(parsed) ? parsed : parsed == null ? [] : [parsed]
      } catch {
        // ไม่ใช่ JSON → รองรับ comma-separated เช่น 'a,b,c'
        if (s.includes(',')) {
          return s
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        }
        return [s] // สตริงเดี่ยว
      }
    }

    // กรณี object/number/boolean
    return [input]
  }

  async tariffChargeReportFindAll(payload: any, userId: any) {
    const {month_year_charge, id, limit, offset} = payload
    const limit_ = Number(limit)
    const offset_ = Number(offset)

    const group = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      },
      select: {
        id: true,
        user_type: {
          select: {
            id: true
          }
        }
      }
    })
    const userTypeId = group?.user_type?.id
    const groupId = group?.id

    const todayStartMY = (month_year_charge && getTodayStartYYYYMMDDDfaultAdd7(month_year_charge).toDate()) || null
    // const ids = (id && Number(id)) || null;

    const where = {
      ...(userTypeId === 3 && {
        tariff_invoice_sent_id: 1,
        shipper_id: groupId
      }),
      ...(todayStartMY && {
        month_year_charge: todayStartMY
      }),
      ...(this.toArray(id).length > 0 && {
        id: {
          in: this.toArray(id)
        }
      })
    }
    const results = await this.prisma.tariff.findMany({
      where: where,
      skip: Number(offset_),
      take: Number(limit_),
      include: {
        shipper: {
          select: {
            id: true,
            name: true,
            id_name: true
          }
        },
        tariff_type: true,
        tariff_comment: {
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
        tariff_invoice_sent: true,
        tariff_type_ab: true,
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
    const count = await this.prisma.tariff.count({
      where: where
    })

    // คอลัมน์ Amount Operator (Bath) มาจากค่า Quantity Operator x Fee
    // ในกรณีที่เป็น Type Damage
    // Charge จะเป็น Quantity Operator x Coefficient x Fee
    //  | ทศนิยม 2 ตำแหน่ง

    // คอลัมน์ Amount Compare (Bath)
    // ถ้ามีค่า amount operator เอาค่านี้ขึ้นก่อน
    // ถ้าไม่มี operator ค่อยมาเอา amount
    // ยึด operator เป็นหลัก

    // คอลัมน์ Difference
    // คอลัมน์ Amount Operator - คอลัมน์ Amount Compare

    return {
      total: count,
      data: results
    }
  }

  async chargeFindAll(payload: any, userId: any) {
    const {id, contractCode, comodity, limit, offset} = payload
    const limit_ = Number(limit)
    const offset_ = Number(offset)
    const contractCodeArr = (contractCode && JSON.parse(contractCode)) || []

    const group = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      },
      select: {
        id: true,
        user_type: {
          select: {
            id: true
          }
        }
      }
    })
    const userTypeId = group?.user_type?.id
    const groupId = group?.id

    const results = await this.prisma.tariff_charge.findMany({
      where: {
        // ...(userTypeId === 3 && {
        //   shipper_id: groupId,
        // }),
        ...(contractCodeArr.length > 0 && {
          contract_code: {
            id: {
              in: contractCodeArr
            }
          }
        }),
        ...(comodity && {
          OR: [
            {
              comonity_type: Number(comodity)
            },
            {
              comonity_type: null
            }
          ]
        }),
        tariff_id: Number(id)
      },
      skip: Number(offset_),
      take: Number(limit_),
      include: {
        tariff_type_charge: true,
        contract_code: true,
        term_type: true,
        tariff: {
          include: {
            shipper: {
              select: {
                id: true,
                name: true,
                id_name: true
              }
            },
            tariff_type: true,
            tariff_comment: {
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
            tariff_compare: {
              include: {
                compare_with: true
              },
              orderBy: {
                create_date: 'desc'
              },
              take: 1
            },
            tariff_invoice_sent: true,
            tariff_type_ab: true
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
        tariff_type_charge_id: 'asc'
      }
    })
    const count = await this.prisma.tariff_charge.count({
      where: {
        ...(contractCodeArr.length > 0 && {
          contract_code: {
            id: {
              in: contractCodeArr
            }
          }
        }),
        ...(comodity && {
          OR: [
            {
              comonity_type: Number(comodity)
            },
            {
              comonity_type: null
            }
          ]
        }),
        tariff_id: Number(id)
      }
    })
    return {
      total: count,
      data: results
    }
  }

  async chargeView(payload: any, userId: any) {
    const {id} = payload

    const results = await this.prisma.tariff_view_date.findMany({
      where: {
        tariff_charge_id: Number(id)
      },
      include: {
        tariff_charge: {
          include: {
            contract_code: true,
            tariff: {
              include: {
                shipper: true
              }
            },
            tariff_type_charge: true
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

    if (results?.length > 0) {
      const resultsFinal = results?.map((e: any) => {
        const {temps, ...nE} = e
        const data = (temps && JSON.parse(temps)) || []
        return {
          ...nE,
          data
        }
      })

      return resultsFinal
    } else {
      const result = await this.prisma.tariff_charge.findFirst({
        where: {
          id: Number(id)
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

      return [
        {
          tariff_charge: result
        }
      ]
    }
  }

  async comments(payload: any, userId: any) {
    const {id, comment} = payload
    const nowAt = getTodayNowAdd7()

    const result = await this.prisma.tariff_comment.create({
      data: {
        tariff: {
          connect: {
            id: Number(id)
          }
        },
        comment: comment || null,
        create_date: nowAt.toDate(),
        create_date_num: nowAt.unix(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    await this.prisma.tariff.updateMany({
      where: {
        id: Number(id ?? -1)
      },
      data: {
        update_date: nowAt.toDate(),
        update_date_num: nowAt.unix(),
        update_by: Number(userId)
      }
    })

    return result
  }

  async runtariff(payload: any, userId: any) {
    const {month_year, shipper_id} = payload
    const todayStart = getYearStartAdd7().toDate()
    const todayEnd = getYearEndAdd7().toDate()

    const shipperMaster = await this.prisma.group.findFirst({
      where: {
        id: Number(shipper_id)
      },
      select: {
        id: true,
        id_name: true,
        name: true
      }
    })

    try {
      const nowAt = getTodayNowAdd7()
      const formateDDMMYYYY = dayjs(month_year, 'YYYY-MM-DD').format('DD/MM/YYYY')

      let monthStartDayjs: dayjs.Dayjs | null = dayjs(month_year, 'YYYY-MM-DD') // https://app.clickup.com/t/86evh20g6
      let monthEndDayjs: dayjs.Dayjs | null = dayjs(month_year, 'YYYY-MM-DD') // https://app.clickup.com/t/86evh20g6

      try {
        const base = getTodayNowAdd7(month_year)
        if (base.isValid()) {
          monthStartDayjs = base.startOf('month')
          monthEndDayjs = base.endOf('month')
        }
      } catch (error) {}
      const monthStart = monthStartDayjs?.tz('Asia/Bangkok')?.format('YYYY-MM-DD') ?? ''

      const endDayjs = nowAt?.format('MM/YYYY') === dayjs(month_year, 'YYYY-MM-DD')?.format('MM/YYYY') ? nowAt.endOf('day') : monthEndDayjs?.tz('Asia/Bangkok')
      const monthEnd = endDayjs?.format('YYYY-MM-DD') ?? ''
      // 1 System คือยังไม่มีการ Edit
      // 2 Manual คือ มีการ edit ค่าแล้ว
      // 20241021-TAR-0002-A (13:08:45)
      // 20241021-TAR-0002-B (13:08:45)
      // Tariff ID-A คำนวณค่าแต่ละรายการโดยยังไม่ปัดทศนิยมแบบ Round และจะปัดทศนิยมครั้งเดียวที่ผลรวม
      // Tariff ID-B การคำนวณค่าแต่ละรายการ ให้ปัดทศนิยมแบบ Round ได้เลย และปัดทศนิยมอีกครั้งเมื่อแสดงผลรวม

      // term_type_id 1, 2, 3 M | 4 D
      // file_period_mode

      // Create array of all TARIFF_SYSTEM_PARAMETER enum values dynamically
      const tariffSystemParameterIds = Object.values(TARIFF_SYSTEM_PARAMETER).filter((value) => typeof value === 'number') as number[]

      const systemParameter: systemParameterWithRelations[] = await this.prisma.system_parameter.findMany({
        where: {
          system_parameter: {
            id: {
              in: tariffSystemParameterIds
            }
          },
          AND: [
            {
              start_date: {
                lte: endDayjs?.toDate() ?? todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gte: monthStartDayjs?.toDate() ?? todayStart
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        },
        ...systemParameterPopulate
      })

      //
      let entryCapOverCoEff = getLatestSystemParameterValue(systemParameter, [ENTRY_CAP_OVER_USE_CO_EFF_ID])
      let exitCapOverCoEff = getLatestSystemParameterValue(systemParameter, [EXIT_CAP_OVER_USE_CO_EFF_ID])
      let damageCoEff = getLatestSystemParameterValue(systemParameter, [DAMAGE_CO_EFF_ID])
      exitCapOverCoEff = exitCapOverCoEff ? String(exitCapOverCoEff) : null
      entryCapOverCoEff = entryCapOverCoEff ? String(entryCapOverCoEff) : null
      damageCoEff = damageCoEff ? String(damageCoEff) : null
      const comodityFeeShipper = getLatestSystemParameterValue(systemParameter, [EXIT_COMMDOITY_OVER_USE_FOR_ALL_CONTRACT_TYPE_CHARGE_FEE_ID])
      const imbalancesPenaltyPositiveFee = getLatestSystemParameterValue(systemParameter, [POSITIVE_BAL_CHARGE_PENALTY_FEE_ID])
      const imbalancesPenaltyNegativeFee = getLatestSystemParameterValue(systemParameter, [NEGATIVE_BAL_CHARGE_PENALTY_FEE_ID])
      const damageChargeFee = getLatestSystemParameterValue(systemParameter, [DAMAGE_CHARGE_FEE_ID])
      const toleranceP = getLatestSystemParameterValue(systemParameter, [ABS_VALUE_ADJ_DAILY_POSITIVE_IMB_TOLERANCE_ID])
      const toleranceN = getLatestSystemParameterValue(systemParameter, [ABS_VALUE_ADJ_DAILY_NEGATIVE_IMB_TOLERANCE_ID])
      const toleranceEntryCapOverUse = getLatestSystemParameterValue(systemParameter, [ENTRY_CAP_OVER_USE_CHARGE_TOLERANCE_ID])
      const toleranceExitCapOverUse = getLatestSystemParameterValue(systemParameter, [EXIT_CAP_OVER_USE_CHARGE_TOLERANCE_ID])

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

      const tariffData = {
        shipper: {
          connect: {
            id: Number(shipper_id)
          }
        },
        month_year_charge: getTodayNowAdd7(month_year).toDate(),
        tariff_type: {
          connect: {
            id: Number(1)
          }
        },
        tariff_invoice_sent: {
          connect: {
            id: Number(2)
          }
        },
        create_date: nowAt.toDate(),
        create_date_num: nowAt.unix(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }

      // contract
      const contract_code = await this.prisma.contract_code.findMany({
        where: {
          AND: [
            {
              group_id: shipper_id
            },
            {
              contract_start_date: {
                lte: endDayjs?.toDate() ?? todayEnd
              }
            }, // Started before or on target date
            // Not rejected
            {
              status_capacity_request_management: {
                NOT: {
                  id: 3
                  // name: {
                  //   equals: 'Rejected',
                  //   mode: 'insensitive',
                  // },
                }
              }
            },
            {
              status_capacity_request_management_process: {
                id: {
                  notIn: [2, 3]
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
                    gt: monthStartDayjs?.toDate() ?? todayStart
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
                        gt: monthStartDayjs?.toDate() ?? todayStart
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
                            gt: monthStartDayjs?.toDate() ?? todayStart
                          }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
          // group_id: shipper_id,
          // status_capacity_request_management_id: 2,
          // status_capacity_request_management_process_id: 1,
          // AND: [
          //   {
          //     contract_start_date: {
          //       lte: todayStartMY, // start_date มากกว่านหรือเท่ากับสิ้นสุดวันนี้
          //     },
          //   },
          //   {
          //     OR: [
          //       { contract_end_date: null }, // ถ้า end_date เป็น null
          //       { contract_end_date: { gte: todayEndMY } }, // ถ้า end_date ไม่เป็น null น้อยกว่าหรือเท่ากับเริ่มต้นวันนี้
          //     ],
          //   },
          // ],
        },
        include: {
          term_type: true,
          booking_version: {
            where: {
              flag_use: true
            },
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
              }
            },
            take: 1,
            orderBy: {
              id: 'desc'
            }
          }
        }
      })

      const parseDay = (value: any, format?: string) => {
        if (!value) return null

        const d = format ? dayjs(value, format).startOf('day') : dayjs(value).startOf('day')

        return d.isValid() ? d : null
      }

      const getBookingDaysInMonth = ({monthYear, startDate, contractEndDate, terminateDate}: {monthYear: string; startDate?: string | null; contractEndDate?: string | null; terminateDate?: string | null}) => {
        const monthStart = dayjs(monthYear, 'YYYY-MM-DD').startOf('month')
        const monthEnd = dayjs(monthYear, 'YYYY-MM-DD').endOf('month')

        // วันที่เริ่มจาก excel เช่น 13/06/2026
        const start = parseDay(startDate, 'DD/MM/YYYY') || monthStart

        const contractEnd = parseDay(contractEndDate)
        const terminate = parseDay(terminateDate)

        let calcStart = start.isBefore(monthStart, 'day') ? monthStart : start
        let calcEnd = monthEnd

        // contract_end_date ถ้าอยู่ก่อนสิ้นเดือน ให้ใช้เป็นวันจบ
        if (contractEnd && contractEnd.isBefore(calcEnd, 'day')) {
          calcEnd = contractEnd
        }

        // terminate_date = วันนั้นไม่ใช้ก๊าซแล้ว ต้องลบ 1 วัน
        if (terminate && terminate.isBefore(calcEnd, 'day')) {
          calcEnd = terminate.subtract(1, 'day')
        }

        if (calcEnd.isAfter(monthEnd, 'day')) {
          calcEnd = monthEnd
        }

        if (calcEnd.isBefore(calcStart, 'day')) return 0

        return calcEnd.diff(calcStart, 'day') + 1
      }

      console.log('contract_code : ', contract_code);
      const contract_code_final = contract_code.map((e) => {
        const {booking_version, ...nE} = e
        const booking_version_use = booking_version?.[0]
        const booking_full_json_use =
          booking_version_use?.booking_full_json_release?.length > 0
            ? booking_version_use?.booking_full_json_release?.[0]?.data_temp && JSON.parse(booking_version_use?.booking_full_json_release?.[0]?.data_temp)
            : (booking_version_use?.booking_full_json?.[0]?.data_temp && JSON.parse(booking_version_use?.booking_full_json?.[0]?.data_temp)) || null

        // const foundDate = Object.entries(booking_full_json_use?.headerEntry?.["Capacity Daily Booking (MMBTU/d)"] || {}).find(([_, v]:any) => v.key === "7")?.[0];

        const entryDailyBooking = booking_full_json_use?.['headerEntry']?.['Capacity Daily Booking (MMBTU/d)']
        const keyHead = entryDailyBooking?.[formateDDMMYYYY]?.['key']

        let shortTermNonFirmKeyHead = []
        if (e && e?.term_type_id === 4) {
          const today = dayjs().startOf('day')
          const filteredentryDailyBooking = Object.fromEntries(
            Object.entries(entryDailyBooking).filter(([dateStr]) => {
              const d = dayjs(dateStr, 'DD/MM/YYYY').startOf('day')
              if (!d.isValid()) return false
              return d.isBefore(today) || d.isSame(today)
            })
          )
          const formateMMYYYY = getTodayStartYYYYMMDDDfaultAdd7(month_year).tz('Asia/Bangkok').format('MM/YYYY')
          shortTermNonFirmKeyHead = Object.keys(filteredentryDailyBooking)
            .filter((key: any) => key.includes(`/${formateMMYYYY}`))
            .map((key: any) => filteredentryDailyBooking[key]?.['key'])
        }

        const booking_row_json_use = (booking_version_use?.booking_full_json_release?.length > 0 ? booking_version_use?.booking_row_json_release : booking_version_use?.booking_row_json || [])?.map((brj: any) => {
          const {data_temp, id, zone_text, area_text, entry_exit_id, ...nBrj} = brj
          const row_json_use = (data_temp && JSON.parse(data_temp)) || null
          const useData = {
            key: keyHead || null,
            contractPoint: row_json_use?.[0] || null,
            capacityMMBTUValue: row_json_use?.[keyHead] || null
          }

          let shortTermNonFirmUseData = []
          if (e && e?.term_type_id === 4) {
            if (shortTermNonFirmKeyHead.length > 0) {
              
              let capacityMMBTUValue: number | null = null
              shortTermNonFirmUseData = shortTermNonFirmKeyHead.map((key: any) => {
                // const foundDate = Object.entries(booking_full_json_use?.headerEntry?.['Capacity Daily Booking (MMBTU/d)'] || {}).find(([_, v]: any) => v.key === key)?.[0]
                // const isDateEnd = dayjs(e?.terminate_date || e?.extend_deadline || e?.contract_end_date).isBefore(dayjs(), 'day')
                // const nDay = isDateEnd ? dayjs(e?.terminate_date || e?.extend_deadline || e?.contract_end_date) : dayjs()
                // const isPast = dayjs(foundDate, 'DD/MM/YYYY').isBefore(nDay, 'day')
                const endDate = dayjs(
                  e?.terminate_date ||
                  e?.extend_deadline ||
                  e?.contract_end_date
                )

                const foundDate = Object.entries(
                  booking_full_json_use?.headerEntry?.['Capacity Daily Booking (MMBTU/d)'] || {}
                ).find(([_, v]: any) => v.key === key)?.[0]

                const isDateEnd = endDate.isBefore(dayjs(), 'day')

                const nDay = isDateEnd ? endDate : dayjs()

                const foundDay = dayjs(foundDate, 'DD/MM/YYYY')

                const isPast = isDateEnd
                  ? foundDay.isBefore(nDay, 'day')
                  : foundDay.isSameOrBefore(nDay, 'day')

                const value = row_json_use?.[key] || null
                // if(e?.contract_code === "2026-CNF-N003"){
                // if(e?.contract_code === "2026-CNF-N005"){
                //   console.log('e?.contract_code : ', e?.contract_code);
                //   console.log('nDay : ', nDay);
                //   console.log('foundDate : ', foundDate);
                //   console.log('isPast : ', isPast);
                //   // capacityMMBTUValue
                //   console.log('- - - -');
                // }
                if (value) {
                  let valueNumber: number | null = parseToNumber(value)
                  if (valueNumber) {
                    if (capacityMMBTUValue) {
                      capacityMMBTUValue = capacityMMBTUValue + (isPast ? valueNumber : 0)
                    } else {
                      capacityMMBTUValue = valueNumber
                    }
                  }
                }

                return {
                  key,
                  capacityMMBTUValue: value
                }
              })
              useData.capacityMMBTUValue = capacityMMBTUValue
            } else {
              useData.capacityMMBTUValue = 0
            }
          } else {
            const foundDateM = Object.entries(booking_full_json_use?.headerEntry?.['Capacity Daily Booking (MMBTU/d)'] || {}).find(([_, v]: any) => v.key === useData?.key)?.[0]
            const startExcelRow = row_json_use['5']
            const endExcelRow = row_json_use['6']
            const headerDayjs = dayjs(foundDateM, 'DD/MM/YYYY').startOf('day')
            const periodFromDayjs = dayjs(startExcelRow, 'DD/MM/YYYY').startOf('day')
            const periodToDayjs = dayjs(endExcelRow, 'DD/MM/YYYY').startOf('day')
            const contractStartDate = dayjs(e?.contract_start_date).startOf('day')
            const contractEndDate = dayjs(e?.terminate_date || e?.extend_deadline || e?.contract_end_date)
            
            const validStartDates = [contractStartDate, monthStartDayjs, periodFromDayjs, headerDayjs].filter((d) => d.isValid())
            const startDate_ = validStartDates.length > 0 ? validStartDates.reduce((max, current) => (current.isAfter(max, 'day') ? current : max)) : null

            const maxEndDate = endDayjs.clone().add(1, 'day').startOf('day')
            const validDates = [contractEndDate, maxEndDate, periodToDayjs].filter((d) => d.isValid())
            const endDate_ = validDates.length > 0 ? validDates.reduce((min, current) => (current.isBefore(min, 'day') ? current : min)) : null

            const diffDaysM = endDate_ && startDate_ ? endDate_.diff(startDate_, 'day') : 0

            const value = parseToNumber(useData.capacityMMBTUValue) * diffDaysM
            useData.capacityMMBTUValue = value

            // const startExcelRow = row_json_use?.['5']
            // const diffDays = getBookingDaysInMonth({
            //   monthYear: month_year,
            //   startDate: startExcelRow,
            //   contractEndDate: e?.contract_end_date,
            //   terminateDate: e?.terminate_date,
            // })

            // useData.capacityMMBTUValue = parseToNumber(useData.capacityMMBTUValue) * diffDays

            // if(e?.contract_code === '2026-CSF-009'){
            //   console.log('- - - -');
            //   console.log('diffDaysM : ', diffDaysM);
            //   console.log('e : ', e);
            //   console.log('endDate_ : ', endDate_);
            //   // console.log('foundDateM : ', foundDateM);
            //   // console.log('--');
            //   // console.log('row_json_use : ', row_json_use);
            //   // console.log('value : ', value);
            //   // console.log('useData.capacityMMBTUValue : ', useData.capacityMMBTUValue);
            //   // console.log('diffDaysM : ', diffDaysM);
            //   console.log('- - - -');
            // }
          }

          return {
            id,
            zone_text,
            area_text,
            entry_exit_id,
            ...useData,
            shortTermNonFirmUseData,
            areaObj:
              areaMaster?.find((f: any) => {
                return f?.entry_exit_id === entry_exit_id && f?.name === area_text
              }) || null,
            zoneObj:
              zoneMaster?.find((f: any) => {
                return f?.entry_exit_id === entry_exit_id && f?.name === zone_text
              }) || null
          }
        })
        // terminate_date
        return {
          ...nE,
          booking_version_id: booking_version?.[0]?.id || null,
          keyHead: keyHead,
          booking_row_json_use
        }
      })

      // console.log('_contract_code_final : ', contract_code_final)
      // // 50,000.000 + 50,000.000 + 85,000.000 + 85,000.000 + 85,000.000 + 85,000.000 + 80,000.000 + 80,000.000

      // return // test

      const allocationReportViewGet = await this.allocationService.allocationReportViewGet(
        {
          start_date: monthStart,
          end_date: monthEnd,
          skip: 0,
          limit: 10000
        },
        userId
      )

      const allocationReportViewGetB = await this.allocationService.allocationReport(
        {
          start_date: monthStart,
          end_date: monthEnd,
          skip: '0',
          limit: '100',
          tab: '1'
        },
        userId
      )

      const allocationReportViewGetPublic = allocationReportViewGet
        ?.filter((f: any) => {
          return f?.publication && f?.shipper === shipperMaster?.id_name && contract_code?.some((e: any) => e?.contract_code == f?.contract)
        })
        ?.map((e: any) => {
          const contract = contract_code?.find((f: any) => f?.contract_code === e?.contract)
          return {
            contract_code_id: contract?.id,
            term_type: contract?.term_type,
            ...e
          }
        })

      const allocationReportViewGetPublicB = allocationReportViewGetB
        ?.filter((f: any) => {
          return f?.publication && f?.shipper === shipperMaster?.id_name && contract_code?.some((e: any) => e?.contract_code == f?.contract)
        })
        ?.map((e: any) => {
          const contract = contract_code?.find((f: any) => f?.contract_code === e?.contract)
          return {
            contract_code_id: contract?.id,
            term_type: contract?.term_type,
            ...e
          }
        })

      // console.log('allocationReportViewGetPublic2 : ', allocationReportViewGetPublic2);

      const allocationReportViewGetPublicNoFuel = allocationReportViewGetPublic?.filter((f: any) => f?.customer_type !== 'Fuel')
      const Fuel = allocationReportViewGetPublic?.filter((f: any) => f?.customer_type === 'Fuel')
      const allocationReportViewGetPublicExit = allocationReportViewGetPublicNoFuel?.filter((f: any) => f?.entry_exit === 'EXIT')

      const allocationReportViewGetPublicNoFuelB = allocationReportViewGetPublicB?.filter((f: any) => f?.customer_type !== 'Fuel')
      const FuelB = allocationReportViewGetPublicB?.filter((f: any) => f?.customer_type === 'Fuel')
      const allocationReportViewGetPublicExitB = allocationReportViewGetPublicNoFuelB?.filter((f: any) => f?.entry_exit === 'EXIT')

      const contractGrouped = {}
      for (const curr of allocationReportViewGetPublicExit) {
        const key = `${curr.contract}`
        if (!contractGrouped[key]) {
          contractGrouped[key] = {
            contract_code_id: curr.contract_code_id || null,
            contract: curr.contract || null,
            term_type_id: curr.term_type?.id || null,
            term_type: curr.term_type?.name || null,
            data: []
          }
        }
        contractGrouped[key].data.push({...curr})
      }

      const contractGroupedB = {}
      for (const curr of allocationReportViewGetPublicExitB) {
        const key = `${curr.contract}`
        if (!contractGroupedB[key]) {
          contractGroupedB[key] = {
            contract_code_id: curr.contract_code_id || null,
            contract: curr.contract || null,
            term_type_id: curr.term_type?.id || null,
            term_type: curr.term_type?.name || null,
            data: []
          }
        }
        contractGroupedB[key].data.push({...curr})
      }

      const finalContract: any = Object.values(contractGrouped)?.filter((f: any) => f?.term_type_id !== null) // Comodity by contract
      const finalContractB: any = Object.values(contractGroupedB)?.filter((f: any) => f?.term_type_id !== null) // Comodity by contract

      const termGrouped = {}
      for (const curr of allocationReportViewGetPublicExit) {
        const key = `${curr.term_type?.id}`
        if (!termGrouped[key]) {
          termGrouped[key] = {
            id: null,
            contract: null,
            term_type_id: curr.term_type?.id || null,
            term_type: curr.term_type?.name || null,
            data: []
          }
        }
        termGrouped[key].data.push({...curr})
      }
      const finalTerm: any = Object.values(termGrouped)?.filter((f: any) => f?.term_type_id !== null) // Comodity by shipper

      const termGroupedB = {}
      for (const curr of allocationReportViewGetPublicExitB) {
        const key = `${curr.term_type?.id}`
        if (!termGroupedB[key]) {
          termGroupedB[key] = {
            id: null,
            contract: null,
            term_type_id: curr.term_type?.id || null,
            term_type: curr.term_type?.name || null,
            data: []
          }
        }
        termGroupedB[key].data.push({...curr})
      }
      const finalTermB: any = Object.values(termGroupedB)?.filter((f: any) => f?.term_type_id !== null) // Comodity by shipper

      // A : SUM((Point A (Exit) ค่าทั้งเดือน = 3100.3770 ~ 3100 ) + (Point B (Exit) ค่าทั้งเดือน = 3100.7000 ~ 3101 ) + (Point C (Exit) ค่าทั้งเดือน = 3100.7000 ~ 3101 )) -> 9302
      const groupDatas = (arr: any, keys: any) => {
        const nGrouped = {}
        for (const curr of arr) {
          const key = `${curr[keys]}`
          if (!nGrouped[key]) {
            nGrouped[key] = {
              [keys]: curr[keys],
              data: []
            }
          }
          nGrouped[key].data.push({
            ...curr
          })
        }
        const resultData = Object.values(nGrouped)
        return resultData
      }

      // ใช้ nominatedValue ตามพีบีมบอก | key ที่เหลือ allocatedValue, contractCapacity เผื่อเปลี่ยน
      const comodityByContractA = finalContract?.map((e: any) => {
        const {id, contract_code_id, contract, term_type_id, term_type, data} = e
        const nom = groupDatas(data, 'point')
        const value = nom?.map((n: any) => {
          const dValue = n?.['data']
            ?.map((dV: any) => {
              return (
                // dV?.values?.find((f: any) => f?.tag === 'nominatedValue') // allocatedValue หรือ nominatedValue
                dV?.values?.find((f: any) => f?.tag === 'allocatedValue')?.value ?? 0 // allocatedValue หรือ nominatedValue // https://app.clickup.com/t/86euzxxkm
              )
            })
            ?.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
          return {
            point: n?.point,
            customer_type: n?.customer_type,
            calc: Math.round(dValue ?? 0),
            calcNotRound: dValue ?? 0,
            tempDateArr: n?.['data'] || []
          }
        })

        const quantity = value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calc, 0)

        const totalNotRound = value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calcNotRound, 0)

        return {
          id: id || null,
          contract_code_id: contract_code_id || null,
          contract: contract || null,
          term_type_id: term_type_id || null,
          term_type: term_type || null,
          value: value ?? 0,
          quantity: quantity ?? 0,
          totalNotRound: totalNotRound ?? 0,
          type: 'comodityByContract'
        }
      })
      const comodityByShipperA = finalTerm?.map((e: any) => {
        const {id, contract, term_type_id, term_type, data} = e
        const nom = groupDatas(data, 'point')
        const value = nom?.map((n: any) => {
          const dValue = n?.['data']
            ?.map((dV: any) => {
              return (
                // dV?.values?.find((f: any) => f?.tag === 'nominatedValue')
                dV?.values?.find((f: any) => f?.tag === 'allocatedValue')?.value ?? 0 // // allocatedValue หรือ nominatedValue // https://app.clickup.com/t/86euzxxkm
              )
            })
            ?.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
          return {
            point: n?.point,
            customer_type: n?.customer_type,
            calc: Math.round(dValue ?? 0),
            calcNotRound: dValue ?? 0,
            tempDateArr: n?.['data'] || []
          }
        })

        const quantity = value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calc, 0)

        const totalNotRound = value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calcNotRound, 0)

        return {
          id: id || null,
          contract: contract || null,
          term_type_id: term_type_id || null,
          term_type: term_type || null,
          value: value ?? 0,
          quantity: quantity ?? 0,
          totalNotRound: totalNotRound ?? 0,
          type: 'comodityByShipper'
        }
      })
      const comodityA = [...comodityByContractA, ...comodityByShipperA]

      // B : SUM( Gas Day 01-05-2025((Point A (Exit) sum ค่ารายวัน = 100.0121) + (Point B (Exit) sum ค่ารายวัน = 100.0226) + (Point C (Exit) sum ค่ารายวัน = 100.0226) ( -> 300.0573 ~ 300) ) + Gas Day วันต่อไป .... )
      const comodityByContractB = finalContractB?.map((e: any) => {
        const {id, contract_code_id, contract, term_type_id, term_type, data} = e
        const dayGroup = groupDatas(data, 'gas_day')
        // gas_day
        const day = dayGroup?.map((dG: any) => {
          const {contract, term_type_id, term_type, data: dataDay} = dG
          const nom = groupDatas(dataDay, 'point')
          const value = nom?.map((n: any) => {
            const dValue = n?.['data']
              ?.map((dV: any) => {
                return (
                  // dV?.values?.find((f: any) => f?.tag === 'nominatedValue')
                  dV?.values?.find((f: any) => f?.tag === 'allocatedValue')?.value ?? 0 // allocatedValue หรือ nominatedValue // https://app.clickup.com/t/86euzxxkm
                )
              })
              ?.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
            return {
              point: n?.point,
              customer_type: n?.customer_type,
              calc: dValue ?? 0,
              calcNotRound: dValue ?? 0,
              tempDateArr: n?.['data'] || []
            }
          })

          // const totalRoundRound = Math.round(value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calc, 0))
          const r4 = (d_: any) => Math.round(d_ * 10000) / 10000

          const totalRoundRound = Math.round((value?.reduce((accumulator, currentValue) => accumulator + r4(currentValue?.calc ?? 0), 0) ?? 0) * 10000) / 10000

          const totalNotRound = value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calcNotRound, 0)

          if (dG?.gas_day === '2026-06-01' && e?.contract === '2026-CNF-008') {
            console.log('e : ', e)
            console.log('dG : ', dG)
            console.log('value : ', value)
            console.log('nom : ', nom)
            console.log('totalRoundRound : ', totalRoundRound)
            console.log('totalNotRound : ', totalNotRound)

            const t_ExitT = value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calc, 0)
            console.log('t_ExitT : ', t_ExitT)
            console.log('--------')
          }

          return {
            gas_day: dG && dG?.gas_day || null,
            value: value ?? 0,
            totalRoundRound: totalRoundRound || 0,
            totalNotRound: totalNotRound ?? 0
          }
        })

        const quantity = day?.reduce((accumulator, currentValue) => accumulator + currentValue?.totalRoundRound, 0)
        const totalNotRound = day?.reduce((accumulator, currentValue) => accumulator + currentValue?.totalNotRound, 0)

        return {
          id: id || null,
          contract_code_id: contract_code_id || null,
          contract: contract || null,
          term_type_id: term_type_id || null,
          term_type: term_type || null,
          day,
          quantity: quantity ?? 0,
          totalRound: Math.round(totalNotRound ?? 0),
          totalNotRound: totalNotRound ?? 0,
          type: 'comodityByContract'
        }
      })
      const comodityByShipperB = finalTermB?.map((e: any) => {
        const {id, contract, term_type_id, term_type, data} = e
        const dayGroup = groupDatas(data, 'gas_day')
        const day = dayGroup?.map((dG: any) => {
          const {contract, term_type_id, term_type, data: dataDay} = dG
          const nom = groupDatas(dataDay, 'point')
          const value = nom?.map((n: any) => {
            const dValue = n?.['data']
              ?.map((dV: any) => {
                return (
                  // dV?.values?.find((f: any) => f?.tag === 'nominatedValue')
                  dV?.values?.find((f: any) => f?.tag === 'allocatedValue')?.value ?? 0 // // allocatedValue หรือ nominatedValue // https://app.clickup.com/t/86euzxxkm
                )
              })
              ?.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
            return {
              point: n?.point,
              customer_type: n?.customer_type,
              calc: dValue ?? 0,
              calcNotRound: dValue ?? 0,
              tempDateArr: n?.['data'] || []
            }
          })

          const totalRoundRound = Math.round(value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calc, 0))

          const totalNotRound = value?.reduce((accumulator, currentValue) => accumulator + currentValue?.calcNotRound, 0)
          return {
            gas_day: dG && dG?.gas_day || null,
            value: value ?? 0,
            totalRoundRound: totalRoundRound || 0,
            totalNotRound: totalNotRound ?? 0
          }
        })

        const quantity = day?.reduce((accumulator, currentValue) => accumulator + currentValue?.totalRoundRound, 0)
        const totalNotRound = day?.reduce((accumulator, currentValue) => accumulator + currentValue?.totalNotRound, 0)

        // const toleranceP =
        //       systemParameter?.find((f: any) => {
        //         const idSP = 44;
        //         return f?.system_parameter_id === idSP;
        //       })?.value || null;

        return {
          id: id || null,
          contract: contract || null,
          term_type_id: term_type_id || null,
          term_type: term_type || null,
          day,
          quantity: quantity ?? 0,
          totalRound: Math.round(totalNotRound ?? 0),
          totalNotRound: totalNotRound ?? 0,
          type: 'comodityByShipper'
        }
      })
      const comodityB = [...comodityByContractB, ...comodityByShipperB]
      // console.log('comodityB : ', comodityB);
      // console.log('comodityByContractB : ', comodityByContractB);
      // console.log('comodityByShipperB : ', comodityByShipperB);

      // totalNotRound 1106501.8736
      // totalRoundRound 1106502
      // gas_day '2026-06-01'
      // '2026-CNF-008' 144

      const balancReport: any = await this.balancingService.balancReport(
        {
          start_date: monthStart,
          end_date: monthEnd,
          skip: 0,
          limit: 10000
        },
        userId
      )

      const balancReportArr = balancReport?.data || []
      const balancReportClean = balancReportArr
        ?.filter((e: any) => e?.shipper_data?.some((shipperData: any) => shipperData?.shipper === shipperMaster?.id_name))
        ?.map((e: any) => {
          const {request_number, execute_timestamp, gas_day, shipper_data, values, ...nE} = e

          const shipperData = shipper_data?.filter((f: any) => f?.shipper === shipperMaster?.id_name) || []
          const shipperDataObj = shipperData.length > 0 ? shipperData[0] : null // row ฟ้า

          const findTag = (keyArr: any) => {
            const valTag = keyArr
              ?.map((ka: any) => {
                const findValues = shipperDataObj?.['values']?.find((f: any) => f?.tag === ka)?.value
                return findValues
              })
              ?.filter((f: any) => !!f)
            const cK = (!valTag || valTag?.length === 0) ? null : valTag.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
            return cK
          }
          const aip = shipperDataObj && shipperDataObj?.['values']?.find((f: any) => f?.tag === 'aip')?.value || null // row ฟ้า
          const ain = shipperDataObj && shipperDataObj?.['values']?.find((f: any) => f?.tag === 'ain')?.value || null // row ฟ้า

          const getFuel = Fuel?.find((f: any) => f?.gas_day === gas_day)?.values?.find((f: any) => f?.tag === 'nominatedValue')?.value || null
          const entryValue = findTag(['total_entry_east', 'total_entry_west', 'total_entry_east-west']) ?? null // Entry =  Total Entry ของ row สีฟ้า (sum ทุก zone รวมกัน)

          const exitValue = findTag(['total_exit_east', 'total_exit_west', 'total_exit_east-west']) ?? null

          // # สูตรเก่า
          // const positive =
          //   aip !== null && toleranceP !== null && entryValue !== null
          //     ? aip - Number(toleranceP) - entryValue
          //     : null;

          // const negative =
          //   ain !== null && toleranceN !== null && entryValue !== null
          //     ? ain - Number(toleranceN) - entryValue
          //     : null;

          // # สูตรใหม่ abs(AINbalance) − [(Tolerance/100) × Entry]
          const positive = Math.abs(aip) - (Number(toleranceP) / 100) * entryValue

          const negative = Math.abs(ain) - (Number(toleranceN) / 100) * entryValue
          // getFuel
          return {
            gas_day,
            entry: entryValue,
            exit: exitValue,
            fuel_gas: getFuel || null,
            balancing_gas: findTag(['reserveBal_east', 'reserveBal_west']),
            change_in_ivent: findTag(['minInventoryChange_east', 'minInventoryChange_west', 'minInventoryChange_east-west']),
            shrinkage: findTag(['shrinkage_east', 'shrinkage_west', 'shrinkage_east-west']),
            commissioning: findTag(['commissioningGas_east', 'commissioningGas_west']),
            gas_vent: findTag(['ventGas_east', 'ventGas_west']),
            other_gas: findTag(['otherGas_east', 'otherGas_west']),
            imbalance: findTag(['dailyImb_east', 'dailyImb_west']),
            imbalance_over_5_percen: null,
            positive: Number.isFinite(positive) ? positive : 0,
            negative: Number.isFinite(negative) ? negative : 0,
            caseaip: aip,
            caseain: ain
          }
        })

      const positive = balancReportClean
        ?.map((e: any) => {
          const {imbalance_over_5_percen, positive, negative, caseaip, caseain, ...nE} = e
          if (caseaip) {
            return {
              ...nE,
              // imbalance_over_5_percen: positive !== null ? (positive <= 0 ? 0 : positive) : null,
              // imbalance_over_5_percen: positive,
              // imbalance_over_5_percen: positive,
              imbalance_over_5_percen: positive > 0 ? positive : 0
            }
          } else {
            return null
          }
        })
        ?.filter((f: any) => f !== null)
      const negative = balancReportClean
        ?.map((e: any) => {
          const {imbalance_over_5_percen, positive, negative, caseaip, caseain, ...nE} = e
          // if((caseaip !== null && caseain !== null) || (caseaip === null && caseain)){
          if (caseaip === null && caseain) {
            return {
              ...nE,
              // imbalance_over_5_percen: negative !== null ? (negative <= 0 ? 0 : negative) : null,
              // imbalance_over_5_percen: negative,
              imbalance_over_5_percen: negative > 0 ? negative : 0
            }
          } else {
            return null
          }
        })
        ?.filter((f: any) => f !== null)

      // a & b
      const imbalancesPenaltyPositive = {
        id: null,
        contract: null,
        term_type_id: null,
        term_type: null,
        quantity: positive
          ?.map((f: any) => f?.imbalance_over_5_percen)
          ?.filter((f: any) => f !== null)
          ?.reduce((accumulator, currentValue) => accumulator + currentValue, 0),
        data: positive
      }

      // a & b
      const imbalancesPenaltyNegative = {
        id: null,
        contract: null,
        term_type_id: null,
        term_type: null,
        quantity: negative
          ?.map((f: any) => f?.imbalance_over_5_percen)
          ?.filter((f: any) => f !== null)
          ?.reduce((accumulator, currentValue) => accumulator + currentValue, 0),
        data: negative
      }

      // return

      // !! New
      // abs(AINbalance) − [(Tolerance/100) × Entry]
      // เอาค่ามาจาก AIN(Negative) or AIP (Positive) ของเมนู Balance Report ตรง row ฟ้า
      // Tolerance = DAM > System Parameter
      // Entry =  Total Entry ของ row สีฟ้า (sum ทุก zone รวมกัน)

      // -------

      // AIP Positive
      // aip − Tolerance × Entry
      // เอาค่ามาจาก AIP ของเมนู Balance Report ตรง row ฟ้า shipper_data
      // Tolerance = DAM > System Parameter
      // Entry =  Total Entry ของ row สีฟ้า (sum ทุก zone รวมกัน)

      // ถ้าค่าที่คำนวณ > 0 เป็นค่าเดิม
      // ถ้า <=0 ให้แสดงเป็น 0

      // AIN Negative
      // ain − Tolerance × Entry
      // เอาค่ามาจาก AIP ของเมนู Balance Report ตรง row ฟ้า shipper_data
      // Tolerance = DAM > System Parameter
      // Entry =  Total Entry ของ row สีฟ้า (sum ทุก zone รวมกัน)

      // ถ้าค่าที่คำนวณ > 0 เป็นค่าเดิม
      // ถ้า <=0 ให้แสดงเป็น 0

      // return {
      //   // Fuel,
      //   imbalancesPenaltyPositive,
      //   imbalancesPenaltyNegative,
      // }

      // allocationReport
      const allocationReport = await this.allocationService.allocationReport(
        {
          start_date: monthStart,
          end_date: monthEnd,
          skip: 0,
          limit: 10000,
          tab: '1'
        },
        userId
      )
      const allocationReportViewGetPublicOveruse = allocationReport
        ?.filter((f: any) => {
          return f?.publication && f?.shipper === shipperMaster?.id_name && contract_code?.map((e: any) => e?.contract_code)?.includes(f?.contract)
        })
        ?.map((e: any) => {
          const {id, ...nE} = e
          return {
            id: contract_code?.find((f: any) => f?.contract_code === e?.contract)?.id || null,
            term_type: contract_code?.find((f: any) => f?.contract_code === e?.contract)?.term_type || null,
            ...nE
          }
        })
        ?.filter((f: any) => f?.term_type !== null)

      const allocationReportViewGetPublicOveruseEntry = allocationReportViewGetPublicOveruse?.filter((f: any) => f?.entry_exit === 'ENTRY')
      const allocationReportViewGetPublicOveruseExit = allocationReportViewGetPublicOveruse?.filter((f: any) => f?.entry_exit === 'EXIT')

      const groupContractOveruse = (val: any) => {
        const contractGroupedOveruse = {}
        for (const curr of val) {
          const key = `${curr.contract}`
          if (!contractGroupedOveruse[key]) {
            contractGroupedOveruse[key] = {
              id: curr.id || null,
              contract: curr.contract || null,
              term_type_id: curr.term_type?.id || null,
              term_type: curr.term_type?.name || null,
              data: []
            }
          }
          contractGroupedOveruse[key].data.push({
            ...curr
          })
        }
        const results: any = Object.values(contractGroupedOveruse)?.filter((f: any) => f?.term_type_id !== null)

        return results
      }
      const finalContractOveruseEntry = groupContractOveruse(allocationReportViewGetPublicOveruseEntry)
      const finalContractOveruseExit = groupContractOveruse(allocationReportViewGetPublicOveruseExit)

      const groupOveruse = (val: any) => {
        const nGrouped = {}
        for (const curr of val) {
          const key = `${curr?.area}`
          if (!nGrouped[key]) {
            nGrouped[key] = {
              area: curr?.area,
              area_obj: curr?.area_obj,
              entry_exit: curr?.entry_exit,
              entry_exit_obj: curr?.entry_exit_obj,
              zone: curr?.zone,
              data: []
            }
          }
          nGrouped[key].data.push({
            ...curr
          })
        }
        const overuse = Object.values(nGrouped)
        return overuse
      }

      const overuseCalcTag = (arr: any, keys: any) => {
        return arr?.filter((f: any) => f[keys] !== null && f[keys] !== undefined)?.reduce((accumulator, currentValue) => accumulator + currentValue?.[keys], 0) ?? 0
      }

      const fnOveruse = (arrs: any, tolerance?: string) => {
        const resultData = arrs?.map((v: any) => {
          const {data: dataMain, ...nV} = v
          const overuseGroup = groupOveruse(dataMain)
          const overuseUse = overuseGroup?.map((e: any) => {
            const {data, ...nE} = (e || null)
            const bookQuantity = overuseCalcTag(data, 'contractCapacity')
            const allocationQuantity = overuseCalcTag(data, 'allocatedValue')
            const overuse = overuseCalcTag(data, 'overusage')
            const overuseTariffTolerance = tolerance ? overuse - (Number(tolerance) / 100) * bookQuantity : NaN
            return {
              ...nE,
              bookQuantity: bookQuantity ?? 0,
              allocationQuantity: allocationQuantity ?? 0,
              overuse: !tolerance || (Number.isFinite(overuseTariffTolerance) && overuseTariffTolerance > 0) ? (overuse ?? 0) : 0,
              tempDateArr: data
            }
          })

          const quantity = overuseUse?.reduce((accumulator, currentValue) => accumulator + currentValue?.overuse, 0) ?? 0

          return {
            ...nV,
            data: overuseUse || [],
            quantity: quantity ?? 0
          }
        })

        return resultData
      }
      const contractOveruseEntry = fnOveruse(finalContractOveruseEntry, toleranceEntryCapOverUse)
      const contractOveruseExit = fnOveruse(finalContractOveruseExit, toleranceExitCapOverUse)

      // booking_row_json_use
      // terminate_date
      // console.log('contract_code_final : ', contract_code_final);

      // return //test
      const result = await this.prisma.$transaction(
        async (prisma) => {
          const tariffNumberCount =
            (await prisma.tariff.count({
              where: {
                create_date: {
                  gte: todayStart,
                  lte: todayEnd
                }
              }
            })) / 2

          // create tariff a
          const tariffA = await prisma.tariff.create({
            data: {
              tariff_id: `${nowAt.format('YYYYMMDD')}-TAR-${(tariffNumberCount > 0 ? tariffNumberCount + 1 : 1).toString().padStart(4, '0')}-A (${nowAt.format('HH:mm:ss')})`,
              ...tariffData,
              tariff_type_ab: {
                connect: {
                  id: Number(1) // a, b
                }
              }
            }
          })

          // create tariff b
          const tariffB = await prisma.tariff.create({
            data: {
              tariff_id: `${nowAt.format('YYYYMMDD')}-TAR-${(tariffNumberCount > 0 ? tariffNumberCount + 1 : 1).toString().padStart(4, '0')}-B (${nowAt.format('HH:mm:ss')})`,
              ...tariffData,
              tariff_type_ab: {
                connect: {
                  id: Number(2) // a, b
                }
              }
            }
          })

          // กำลังทำ *** run tariff ในวันที่มีสัญญาที่สิ้นสุดไปแล้วตั้งแต่เมื่อวาน ระบบยังคิดค่า demand charge ของสัญญานั้น ถึงวันที่ run tariff อยู่ (เช็ค Gas day 28/11/2025)
          // 1 Capacity Charge -> Demand Charge (Td)
          const tariffCapacityCharge = contract_code_final?.flatMap((e: any) => {
            // แสดงเฉพาะค่า Entry รวมทุก area (booking)
            const quantity = e?.booking_row_json_use
              ?.filter((f: any) => {
                return f?.entry_exit_id === 1
              })
              .reduce((accumulator, currentValue) => accumulator + (currentValue?.capacityMMBTUValue ? parseToNumber(currentValue?.capacityMMBTUValue) : 0), 0)
            // มาจาก DAM > System Parameter | ต้องสามารถ แยก Fee ตาม Type
            const idSP = getCapacityChargeFeeSystemParameterIDByTermTypeID(e?.term_type_id)
            const fee = getLatestSystemParameterValue(systemParameter, [idSP])

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              fee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) * Number(fee ?? 0)
                  Math.round(parseToNumber(quantity ?? 0)) * Number(fee ?? 0)
                : null

            const tariffChargeDataA = {
              tariff: {
                connect: {
                  id: Number(tariffA?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(1) // 1 Capacity Charge
                }
              },
              contract_code: {
                connect: {
                  id: Number(e?.id)
                }
              },
              term_type: {
                connect: {
                  id: Number(e?.term_type_id)
                }
              },
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: null,
              fee: fee ? String(fee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
            const tariffChargeDataB = {
              tariff: {
                connect: {
                  id: Number(tariffB?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(1) // 1 Capacity Charge
                }
              },
              contract_code: {
                connect: {
                  id: Number(e?.id)
                }
              },
              term_type: {
                connect: {
                  id: Number(e?.term_type_id)
                }
              },
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: null,
              fee: fee ? String(fee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
            return [tariffChargeDataA, tariffChargeDataB]
          })

          // -------

          // 2 Commodity Charge
          const comodityDataA = comodityA?.map((e: any) => {
            const quantity = e?.quantity
            // มาจาก DAM > System Parameter | ต้องสามารถ แยก Fee ตาม Type
            const idSP = getExitCommodityChargeFeeSystemParameterIDByTermTypeID(e?.term_type_id)
            const feeDefault = getLatestSystemParameterValue(systemParameter, [idSP])

            const fee = e?.type === 'comodityByContract' ? feeDefault : comodityFeeShipper

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              fee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) * Number(fee ?? 0)
                  Math.round(parseToNumber(quantity ?? 0)) * Number(fee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffA?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(2) // 1 Capacity Charge
                }
              },
              ...(e?.contract_code_id && {
                contract_code: {
                  connect: {
                    id: Number(e?.contract_code_id)
                  }
                }
              }),
              term_type: {
                connect: {
                  id: Number(e?.term_type_id)
                }
              },
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: null,
              fee: fee ? String(fee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              comonity_type: e?.type === 'comodityByContract' ? 1 : 2,
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })
          const comodityDataB = comodityB?.map((e: any) => {
            const quantity = e?.quantity
            // มาจาก DAM > System Parameter | ต้องสามารถ แยก Fee ตาม Type
            const idSP = getExitCommodityChargeFeeSystemParameterIDByTermTypeID(e?.term_type_id)
            const feeDefault = getLatestSystemParameterValue(systemParameter, [idSP])

            const fee = e?.type === 'comodityByContract' ? feeDefault : comodityFeeShipper

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              fee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) * Number(fee ?? 0)
                  Math.round(parseToNumber(quantity ?? 0)) * Number(fee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffB?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(2) // 1 Capacity Charge
                }
              },
              ...(e?.contract_code_id && {
                contract_code: {
                  connect: {
                    id: Number(e?.contract_code_id)
                  }
                }
              }),
              term_type: {
                connect: {
                  id: Number(e?.term_type_id)
                }
              },
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: null,
              fee: fee ? String(fee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              comonity_type: e?.type === 'comodityByContract' ? 1 : 2,
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })

          // -------

          // 3 Imbalances Penalty Charge (Positive)
          const imbalancesPenaltyPositiveA = [imbalancesPenaltyPositive]?.map((e: any) => {
            const quantity = e?.quantity

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              imbalancesPenaltyPositiveFee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) *
                  Math.round(parseToNumber(quantity ?? 0)) * Number(imbalancesPenaltyPositiveFee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffA?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(3) // 3
                }
              },
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: null,
              fee: imbalancesPenaltyPositiveFee ? String(imbalancesPenaltyPositiveFee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })
          const imbalancesPenaltyPositiveB = [imbalancesPenaltyPositive]?.map((e: any) => {
            const quantity = e?.quantity

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount = imbalancesPenaltyPositiveFee !== null || quantity !== null ? Number(quantity ?? 0) * Number(imbalancesPenaltyPositiveFee ?? 0) : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffB?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(3) // 3
                }
              },
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: null,
              fee: imbalancesPenaltyPositiveFee ? String(imbalancesPenaltyPositiveFee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })

          // -------

          // 4 Imbalances Penalty Charge (Negative)
          const imbalancesPenaltyNegativeA = [imbalancesPenaltyNegative]?.map((e: any) => {
            const quantity = e?.quantity

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              imbalancesPenaltyNegativeFee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) *
                  Math.round(parseToNumber(quantity ?? 0)) * Number(imbalancesPenaltyNegativeFee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffA?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(4) // 4
                }
              },
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: null,
              fee: imbalancesPenaltyNegativeFee ? String(imbalancesPenaltyNegativeFee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })
          const imbalancesPenaltyNegativeB = [imbalancesPenaltyNegative]?.map((e: any) => {
            const quantity = e?.quantity

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              imbalancesPenaltyNegativeFee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) *
                  Math.round(parseToNumber(quantity ?? 0)) * Number(imbalancesPenaltyNegativeFee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffB?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(4) // 4
                }
              },
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: null,
              fee: imbalancesPenaltyNegativeFee ? String(imbalancesPenaltyNegativeFee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })

          // -------

          // 5 Capacity Overuse Charge (Entry)
          const contractOveruseEntryA = contractOveruseEntry?.map((e: any) => {
            const quantity = e?.quantity
            // มาจาก DAM > System Parameter | ต้องสามารถ แยก Fee ตาม Type
            const idSP = getEntryCapacityOveruseChargeFeeSystemParameterIDByTermTypeID(e?.term_type_id)
            const fee = getLatestSystemParameterValue(systemParameter, [idSP])

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              fee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) * Number(fee ?? 0)
                  Math.round(parseToNumber(quantity ?? 0)) * Number(fee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffA?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(5)
                }
              },
              ...(e?.id && {
                contract_code: {
                  connect: {
                    id: Number(e?.id)
                  }
                }
              }),
              ...(e?.term_type_id && {
                term_type: {
                  connect: {
                    id: Number(e?.term_type_id)
                  }
                }
              }),
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: entryCapOverCoEff,
              fee: fee ? String(fee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })
          const contractOveruseExitA = contractOveruseExit?.map((e: any) => {
            const quantity = e?.quantity
            // มาจาก DAM > System Parameter | ต้องสามารถ แยก Fee ตาม Type
            const idSP = getExitCapacityOveruseChargeFeeSystemParameterIDByTermTypeID(e?.term_type_id)
            const fee = getLatestSystemParameterValue(systemParameter, [idSP])

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              fee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) * Number(fee ?? 0)
                  Math.round(parseToNumber(quantity ?? 0)) * Number(fee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffA?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(6)
                }
              },
              ...(e?.id && {
                contract_code: {
                  connect: {
                    id: Number(e?.id)
                  }
                }
              }),
              ...(e?.term_type_id && {
                term_type: {
                  connect: {
                    id: Number(e?.term_type_id)
                  }
                }
              }),
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: exitCapOverCoEff,
              fee: fee ? String(fee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })

          // -------

          // 6 Capacity Overuse Charge (Exit)
          const contractOveruseEntryB = contractOveruseEntry?.map((e: any) => {
            const quantity = e?.quantity
            // มาจาก DAM > System Parameter | ต้องสามารถ แยก Fee ตาม Type
            const idSP = getEntryCapacityOveruseChargeFeeSystemParameterIDByTermTypeID(e?.term_type_id)
            const fee = getLatestSystemParameterValue(systemParameter, [idSP])

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              fee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) * Number(fee ?? 0)
                  Math.round(parseToNumber(quantity ?? 0)) * Number(fee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffB?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(5)
                }
              },
              ...(e?.id && {
                contract_code: {
                  connect: {
                    id: Number(e?.id)
                  }
                }
              }),
              ...(e?.term_type_id && {
                term_type: {
                  connect: {
                    id: Number(e?.term_type_id)
                  }
                }
              }),
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: entryCapOverCoEff,
              fee: fee ? String(fee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })
          const contractOveruseExitB = contractOveruseExit?.map((e: any) => {
            const quantity = e?.quantity
            // มาจาก DAM > System Parameter | ต้องสามารถ แยก Fee ตาม Type
            const idSP = getExitCapacityOveruseChargeFeeSystemParameterIDByTermTypeID(e?.term_type_id)
            const fee = getLatestSystemParameterValue(systemParameter, [idSP])

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              fee !== null || quantity !== null
                ? // ? Number(quantity ?? 0) * Number(fee ?? 0)
                  Math.round(parseToNumber(quantity ?? 0)) * Number(fee ?? 0)
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffB?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(6)
                }
              },
              ...(e?.id && {
                contract_code: {
                  connect: {
                    id: Number(e?.id)
                  }
                }
              }),
              ...(e?.term_type_id && {
                term_type: {
                  connect: {
                    id: Number(e?.term_type_id)
                  }
                }
              }),
              quantity_operator: null,
              quantity: quantity || quantity === 0 ? String(quantity) : null,
              unit: 'MMBTU',
              co_efficient: exitCapOverCoEff,
              fee: fee ? String(fee) : null,
              amount: amount ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              },
              tariff_view_date: {
                create: {
                  temps: JSON.stringify(e),
                  create_date: nowAt.toDate(),
                  create_date_num: nowAt.unix(),
                  create_by_account: {
                    connect: {
                      id: Number(userId)
                    }
                  }
                }
              }
            }
          })

          // -------

          // 7 Damage Charge
          const damageChageA = [null].map(() => {
            // const quantity = null

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              damageChargeFee !== null
                // ? Math.round(parseToNumber(quantity ?? 0)) * Number(damageChargeFee ?? 0)
                ? 0
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffA?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(7) // 1 Capacity Charge
                }
              },
              quantity_operator: null,
              quantity: null,
              unit: 'AU',
              co_efficient: damageCoEff,
              fee: damageChargeFee ? String(damageChargeFee) : null,
              amount: (amount || amount === 0) ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              }
            }
          })
          const damageChageB = [null].map(() => {
            // const quantity = null

            // Quantity x Fee | ทศนิยม 2 ตำแหน่ง
            const amount =
              damageChargeFee !== null
                // ? Math.round(parseToNumber(quantity ?? 0)) * Number(damageChargeFee ?? 0)
                ? 0
                : null

            return {
              tariff: {
                connect: {
                  id: Number(tariffB?.id)
                }
              },
              tariff_type_charge: {
                connect: {
                  id: Number(7) // 1 Capacity Charge
                }
              },
              quantity_operator: null,
              quantity: null,
              unit: 'AU',
              co_efficient: damageCoEff,
              fee: damageChargeFee ? String(damageChargeFee) : null,
              amount: (amount || amount === 0) ? String(amount) : null,
              amount_operator: null,
              amount_compare: null,
              difference: null,
              create_date: nowAt.toDate(),
              create_date_num: nowAt.unix(),
              create_by_account: {
                connect: {
                  id: Number(userId)
                }
              }
            }
          })

          // -------

          const chargeDatas = [
            ...tariffCapacityCharge,
            ...comodityDataA,
            ...comodityDataB,
            ...imbalancesPenaltyPositiveA,
            ...imbalancesPenaltyPositiveB,
            ...imbalancesPenaltyNegativeA,
            ...imbalancesPenaltyNegativeB,
            ...contractOveruseEntryA,
            ...contractOveruseExitA,
            ...contractOveruseEntryB,
            ...contractOveruseExitB,
            ...damageChageA,
            ...damageChageB
          ]

          for (let i = 0; i < chargeDatas.length; i++) {
            await prisma.tariff_charge.create({
              data: chargeDatas[i]
            })
          }

          return {
            tariffA,
            tariffB
          }
        },
        {
          timeout: 60000, // เพิ่มเป็น 1 นาที
          maxWait: 60000 // รอให้ transaction พร้อม
        }
      )

      try {
        await middleNotiInapp(
          this.prisma,
          'Tariff',
          `Charge Calculation for shipper ${shipperMaster?.name || '-'} and ${dayjs(month_year, 'YYYY-MM-DD').format('MMMM')}/${dayjs(month_year, 'YYYY-MM-DD').format('YYYY')} has finished OK.`,
          103, // menus_id | 103 Tariff Charge Report | 104 Credit/Debit Note
          1
        )
      } catch (error) {}
      return result
    } catch (error) {
      try {
        await middleNotiInapp(
          this.prisma,
          'Tariff',
          `Charge Calculation for shipper ${shipperMaster?.name || '-'} and ${dayjs(month_year, 'YYYY-MM-DD').format('MMMM')}/${dayjs(month_year, 'YYYY-MM-DD').format('YYYY')} has failed.`,
          103, // menus_id | 103 Tariff Charge Report | 104 Credit/Debit Note
          1
        )
      } catch (error) {}
    }
  }

  // amount = amount_operator -> amount_compare
  // ถ้ามีค่า amount operator เอาค่านี้ขึ้นก่อน
  // ถ้าไม่มี ค่อยมาเอา amount
  // ยึด operator เป็นหลัก

  // difference = amount_operator - amount_compare
  // เอา amount operator- amount compare
  // ถ้าไม่มี operator ก็ใช้ amount
  async bacCalc(id: any, source: any, userId: any) {
    const ids = Number(id)
    const nowAt = getTodayNowAdd7()

    const findTariffUse = async (ids: any, tx: any) => {
      const results = await tx.tariff.findFirst({
        where: {
          id: Number(ids)
        },
        include: {
          tariff_charge: true
        }
      })
      return results
    }
    const findTariff = await findTariffUse(ids, this.prisma)
    const targetTariff = await findTariffUse(source, this.prisma)

    const tariff_id = targetTariff?.id
    const tariff_charge = targetTariff?.tariff_charge.map((e: any) => {
      const compareTariffCharge = findTariff?.tariff_charge.find((tariffChange: any) => tariffChange.tariff_type_charge_id === e.tariff_type_charge_id && tariffChange.contract_code_id === e.contract_code_id && tariffChange.term_type_id === e.term_type_id)
      const compareAmount = parseToNumber(compareTariffCharge?.amount_operator ?? compareTariffCharge?.amount)

      const {id, amount, amount_operator} = e
      let amountCompareCalc = null
      let differenceCalc = null
      const sourceAmount = parseToNumber(amount_operator ?? amount)
      if (sourceAmount || compareAmount) {
        amountCompareCalc = compareAmount ?? 0
        differenceCalc = (sourceAmount ?? 0) - (compareAmount ?? 0)
      }

      return {
        id: id || null,
        amount_compare: amountCompareCalc !== null ? String(amountCompareCalc) : null,
        difference: differenceCalc !== null ? String(differenceCalc) : null
      }
    })

    const updateUse = {
      update_date: nowAt.toDate(),
      update_date_num: nowAt.unix(),
      update_by: Number(userId)
    }
    const result = await this.prisma.$transaction(
      async (prisma) => {
        for (let i = 0; i < tariff_charge.length; i++) {
          const {id: idC, ...tariffCharge} = tariff_charge[i]
          await prisma.tariff_charge.updateMany({
            where: {
              id: Number(idC ?? -1)
            },
            data: {
              ...tariffCharge,
              ...updateUse
            }
          })
        }
        await prisma.tariff.updateMany({
          where: {
            id: Number(tariff_id ?? -1)
          },
          data: {
            ...updateUse
          }
        })

        await prisma.tariff_compare.create({
          data: {
            tariff: {
              connect: {
                id: Number(tariff_id)
              }
            },
            compare_with: {
              connect: {
                id: Number(findTariff?.id)
              }
            },
            create_date: nowAt.toDate(),
            create_date_num: nowAt.unix(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        const updatedTariff = await findTariffUse(tariff_id, prisma)
        return updatedTariff
      },
      {
        timeout: 60000, // เพิ่มเป็น 1 นาที
        maxWait: 60000 // รอให้ transaction พร้อม
      }
    )

    return result
  }

  // creadit/debit note

  async selectShipper(payload: any, userId: any) {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const results = await this.prisma.group.findMany({
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
        ],
        id: {
          not: 1
        },
        status: true,
        user_type_id: 3
      },
      orderBy: {
        id: 'asc'
      }
    })
    return results
  }

  async selectCNDNType(payload: any, userId: any) {
    const results = await this.prisma.tariff_credit_debit_note_type.findMany({
      orderBy: {
        id: 'asc'
      }
    })
    return results
  }

  async typeCharge(payload: any, userId: any) {
    // const results = await this.prisma.tariff_type_charge.findMany({
    //   orderBy: {
    //     id: 'asc',
    //   },
    // });
    const order = [1, 2, 5, 6, 3, 4, 7]
    const orderIdx = new Map(order.map((v, i) => [v, i]))

    const results = await this.prisma.tariff_type_charge.findMany()
    results.sort((a, b) => (orderIdx.get(a.id) ?? 999) - (orderIdx.get(b.id) ?? 999))
    return results
  }

  async selectContractOLD(payload: any, userId: any) {
    const {month_year, shipper_id, type_charge_id} = payload
    const todayStartMY = getTodayStartYYYYMMDDDfaultAdd7(month_year).toDate()
    const todayEndMY = getTodayNowAdd7(month_year).endOf('month').toDate()
    const contract_code = await this.prisma.contract_code.findMany({
      where: {
        AND: [
          {
            group_id: shipper_id
          },
          {
            status_capacity_request_management_id: {
              //Approved , Terminated
              in: [2, 5]
            }
          },
          {
            contract_start_date: {
              lte: todayEndMY
            }
          }, // Started before or on target date
          // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
          {
            OR: [
              {
                terminate_date: null
              }, // No terminate date
              {
                terminate_date: {
                  gt: todayStartMY
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
                      gt: todayStartMY
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
                          gt: todayStartMY
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
        term_type: true,
        booking_version: {
          include: {
            booking_row_json: true,
            booking_full_json: true
            // booking_row_json_release: true,
            // booking_full_json_release: true,
          },
          take: 1,
          orderBy: {
            id: 'desc'
          }
        }
      }
    })
    return contract_code
  }

  async selectContract(payload: any, userId: any) {
    const {month_year, shipper_id, type_charge_id} = payload

    // month_year รูปแบบอะไรก็ได้ที่ dayjs รับ: '2025-10', '2025-10-09', Date, ฯลฯ
    const monthStart = dayjs(month_year).startOf('month').toDate() // 2025-10-01 00:00
    const nextMonthStart = dayjs(month_year).add(1, 'month').startOf('month').toDate() // 2025-11-01 00:00

    const contract_code = await this.prisma.contract_code.findMany({
      where: {
        AND: [
          {
            group_id: shipper_id
          },
          {
            status_capacity_request_management_id: {in: [2, 5]} // Approved, Terminated
          },

          // เริ่มสัญญาก่อน "ต้นเดือนถัดไป" => มีผลในเดือนนี้แน่ ๆ
          {
            contract_start_date: {
              lte: nextMonthStart
            } as any
          },

          // ถ้ามีวันยกเลิก ต้อง "ไม่ก่อน" ต้นเดือนนี้ (ยังมีผลในเดือนนี้)
          {
            OR: [
              {
                terminate_date: null
              },
              {
                terminate_date: {
                  gt: monthStart
                } as any
              }
            ]
          },

          // ใช้ extend_deadline ถ้ามี; ถ้าไม่มีให้ใช้ contract_end_date
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
                      gt: monthStart
                    } as any
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
                          gt: monthStart
                        } as any
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
        term_type: true,
        booking_version: {
          include: {
            booking_row_json: true,
            booking_full_json: true
          },
          take: 1,
          orderBy: {
            id: 'desc'
          }
        }
      }
    })

    return contract_code
  }

  async selectTariffId(payload: any, userId: any) {
    const {month_year, shipper_id, type_charge_id} = payload
    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(month_year).toDate()
    const todayEnd = getTodayEndYYYYMMDDDfaultAdd7(month_year).toDate()

    const results = await this.prisma.tariff.findMany({
      where: {
        shipper_id: shipper_id,
        AND: [
          {
            month_year_charge: {
              lte: todayEnd
            }
          },
          {
            month_year_charge: {
              gte: todayStart
            }
          }
        ]
      },
      include: {}
    })
    return results
  }

  async genData(payload: any, userId: any) {
    const {month_year, shipper_id, tariff_type_charge_id, type_id} = payload
    const todayStart = getTodayStartYYYYMMDDDfaultAdd7(month_year).toDate()
    const todayEnd = getTodayEndYYYYMMDDDfaultAdd7(month_year).toDate()

    const results = await this.prisma.tariff_charge.findMany({
      where: {
        tariff_type_charge_id: Number(tariff_type_charge_id),
        tariff: {
          shipper_id: shipper_id,
          ...(type_id && {
            id: Number(type_id)
          }),
          AND: [
            {
              month_year_charge: {
                lte: todayEnd
              }
            },
            {
              month_year_charge: {
                gte: todayStart
              }
            }
          ]
        }
      },
      select: {
        id: true,
        tariff_id: true,
        tariff: true,
        quantity: true,
        unit: true,
        fee: true,
        amount: true,
        contract_code: {
          select: {
            id: true,
            contract_code: true
          }
        },
        term_type: true
      }
    })
    return results
  }

  async findTariffCreditDebitNote(id: any, userId: any) {
    const results = await this.prisma.tariff_credit_debit_note.findFirst({
      where: {
        id: Number(id)
      },
      include: {
        shipper: true,
        tariff_type_charge: true,
        tariff_credit_debit_note_type: true,
        tariff_credit_debit_note_detail: {
          include: {
            contract_code: true,
            term_type: true,
            tariff_credit_debit_note: true
          }
        },
        tariff_credit_debit_note_comment: {
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
    return results
  }

  async findTariffCreditDebitNoteDetail(id: any, userId: any) {
    const results = await this.prisma.tariff_credit_debit_note_detail.findFirst({
      where: {
        id: Number(id)
      },
      include: {
        tariff_credit_debit_note: true,
        contract_code: true,
        term_type: true,
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
    return results
  }

  async findAllTariffCreditDebitNote(payload: any, userId: any) {
    const {shipper_id, month_year_charge, cndn_id, tariff_credit_debit_note_type_id, tariff_type_charge_id, limit, offset} = payload

    const limit_ = Number(limit)
    const offset_ = Number(offset)

    const group = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      },
      select: {
        id: true,
        user_type: {
          select: {
            id: true
          }
        }
      }
    })
    const userTypeId = group?.user_type?.id
    const groupId = group?.id

    const todayStartMY = (month_year_charge && getTodayStartYYYYMMDDDfaultAdd7(month_year_charge).toDate()) || null

    const results = await this.prisma.tariff_credit_debit_note.findMany({
      where: {
        ...(userTypeId === 3
          ? {
              shipper_id: groupId
            }
          : this.toArray(shipper_id).length > 0 && {
              shipper_id: {
                in: this.toArray(shipper_id)
              }
            }),
        ...(todayStartMY && {
          month_year_charge: todayStartMY
        }),
        ...(tariff_credit_debit_note_type_id && {
          tariff_credit_debit_note_type_id: Number(tariff_credit_debit_note_type_id)
        }),
        ...(tariff_type_charge_id && {
          tariff_type_charge_id: Number(tariff_type_charge_id)
        }),
        cndn_id: {
          contains: cndn_id
        }
        // cndn_id,
      },
      skip: Number(offset_),
      take: Number(limit_),
      include: {
        shipper: true,
        tariff_type_charge: true,
        tariff_credit_debit_note_type: true,
        tariff_credit_debit_note_detail: {
          include: {
            contract_code: true,
            term_type: true,
            tariff_credit_debit_note: true
          }
        },
        tariff_credit_debit_note_comment: {
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

    const count = await this.prisma.tariff_credit_debit_note.count({
      where: {
        // ...(userTypeId === 3
        //   ? {
        //       shipper_id: groupId,
        //     }
        //   : !!shipper_id
        //     ? {
        //         shipper_id: Number(shipper_id),
        //       }
        //     : {}),
        ...(userTypeId === 3
          ? {
              shipper_id: groupId
            }
          : this.toArray(shipper_id).length > 0 && {
              shipper_id: {
                in: this.toArray(shipper_id)
              }
            }),
        ...(todayStartMY && {
          month_year_charge: todayStartMY
        }),
        ...(tariff_credit_debit_note_type_id && {
          tariff_credit_debit_note_type_id: Number(tariff_credit_debit_note_type_id)
        }),
        ...(tariff_type_charge_id && {
          tariff_type_charge_id: Number(tariff_type_charge_id)
        }),
        cndn_id: {
          contains: cndn_id
        }
        // cndn_id,
      }
    })
    return {
      total: count,
      data: results
    }
  }

  async create(payload: any, userId: any) {
    const {shipper_id, month_year_charge, cndn_id, tariff_credit_debit_note_type_id, tariff_type_charge_id, detail, comments} = payload

    const nowAt = getTodayNowAdd7()
    const shipperName = await this.prisma.group.findFirst({
      where: {
        id: Number(shipper_id)
      },
      select: {name: true}
    })
    // try {

    const ck = await this.prisma.tariff_credit_debit_note.findFirst({
      where: {
        cndn_id: cndn_id
      }
    })
    if (!!ck) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'The CNDN ID is duplicated.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const result = await this.prisma.$transaction(
      async (prisma) => {
        const createTariffCredibitDebitNote = await prisma.tariff_credit_debit_note.create({
          data: {
            shipper: {
              connect: {
                id: Number(shipper_id)
              }
            },
            month_year_charge: getTodayNowAdd7(month_year_charge).toDate(),
            cndn_id: cndn_id,
            tariff_credit_debit_note_type: {
              connect: {
                id: Number(tariff_credit_debit_note_type_id)
              }
            },
            tariff_type_charge: {
              connect: {
                id: Number(tariff_type_charge_id)
              }
            },
            create_date: nowAt.toDate(),
            create_date_num: nowAt.unix(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          }
        })

        if (detail.length > 0) {
          for (let i = 0; i < detail.length; i++) {
            await prisma.tariff_credit_debit_note_detail.create({
              data: {
                tariff_credit_debit_note: {
                  connect: {
                    id: Number(createTariffCredibitDebitNote?.id)
                  }
                },
                term_type: {
                  connect: {
                    id: Number(detail[i]?.term_type)
                  }
                },
                contract_code: {
                  connect: {
                    id: Number(detail[i]?.contract_code_id)
                  }
                },
                quantity: detail[i]?.quantity || null,
                unit: detail[i]?.unit || null,
                fee: detail[i]?.fee || null,
                amount: detail[i]?.amount || null,

                create_date: nowAt.toDate(),
                create_date_num: nowAt.unix(),
                create_by_account: {
                  connect: {
                    id: Number(userId)
                  }
                }
              }
            })
          }
        }

        if (comments.length > 0) {
          for (let i = 0; i < comments.length; i++) {
            await prisma.tariff_credit_debit_note_comment.create({
              data: {
                tariff_credit_debit_note: {
                  connect: {
                    id: Number(createTariffCredibitDebitNote?.id)
                  }
                },
                comment: comments[i]?.comment || null,
                create_date: nowAt.toDate(),
                create_date_num: nowAt.unix(),
                create_by_account: {
                  connect: {
                    id: Number(userId)
                  }
                }
              }
            })
          }
        }

        return createTariffCredibitDebitNote
      },
      {
        timeout: 60000, // เพิ่มเป็น 1 นาที
        maxWait: 60000 // รอให้ transaction พร้อม
      }
    )

    const findOne = await this.findTariffCreditDebitNote(result?.id, userId)
    try {
      const type = tariff_credit_debit_note_type_id === 1 ? 'Credit Note' : 'Dedit Note'
      const message = `${type} was created for Shipper ${shipperName?.name || '-'} on ${getTodayNowAdd7(month_year_charge).format('MMM')}/${getTodayNowAdd7(month_year_charge).format('YYYY')} (CNDN ID: ${cndn_id})`
      await middleNotiInapp(
        this.prisma,
        'Tariff',
        message,
        104, // menus_id | 103 Tariff Charge Report | 104 Credit/Debit Note
        1
      )
    } catch (error) {}

    return findOne
  }

  async edit(id: any, payload: any, userId: any) {
    const {cndn_id, detail, comments} = payload

    const nowAt = getTodayNowAdd7()

    const ck = await this.prisma.tariff_credit_debit_note.findFirst({
      where: {
        id: {
          not: Number(id)
        },
        cndn_id: cndn_id
      }
    })
    if (!!ck) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'The CNDN ID is duplicated.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const result = await this.prisma.$transaction(
      async (prisma) => {
        const update = await prisma.tariff_credit_debit_note.updateMany({
          where: {
            id: Number(id ?? -1)
          },
          data: {
            cndn_id: cndn_id,
            update_date: nowAt.toDate(),
            update_date_num: nowAt.unix(),
            update_by: Number(userId)
          }
        })

        await prisma.tariff_credit_debit_note_detail.deleteMany({
          where: {
            tariff_credit_debit_note_id: Number(id)
          }
        })
        if (detail.length > 0) {
          for (let i = 0; i < detail.length; i++) {
            await prisma.tariff_credit_debit_note_detail.create({
              data: {
                tariff_credit_debit_note: {
                  connect: {
                    id: Number(id)
                  }
                },
                ...(detail[i]?.term_type && {
                  term_type: {
                    connect: {
                      id: Number(detail[i]?.term_type)
                    }
                  }
                }),
                ...(detail[i]?.contract_code_id && {
                  contract_code: {
                    connect: {
                      id: Number(detail[i]?.contract_code_id)
                    }
                  }
                }),
                quantity: detail[i]?.quantity || null,
                unit: detail[i]?.unit || null,
                fee: detail[i]?.fee || null,
                amount: detail[i]?.amount || null,

                create_date: nowAt.toDate(),
                create_date_num: nowAt.unix(),
                create_by_account: {
                  connect: {
                    id: Number(userId)
                  }
                }
              }
            })
          }
        }

        if (comments.length > 0) {
          for (let i = 0; i < comments.length; i++) {
            await prisma.tariff_credit_debit_note_comment.create({
              data: {
                tariff_credit_debit_note: {
                  connect: {
                    id: Number(id)
                  }
                },
                comment: comments[i]?.comment || null,
                create_date: nowAt.toDate(),
                create_date_num: nowAt.unix(),
                create_by_account: {
                  connect: {
                    id: Number(userId)
                  }
                }
              }
            })
          }
        }

        return {
          id: Number(id)
        }
      },
      {
        timeout: 60000, // เพิ่มเป็น 1 นาที
        maxWait: 60000 // รอให้ transaction พร้อม
      }
    )

    const findOne = await this.findTariffCreditDebitNote(result?.id, userId)

    return findOne
  }

  async tariffCreditDebitNoteComments(payload: any, userId: any) {
    const {id, comment} = payload
    const nowAt = getTodayNowAdd7()

    const result = await this.prisma.tariff_credit_debit_note_comment.create({
      data: {
        tariff_credit_debit_note: {
          connect: {
            id: Number(id)
          }
        },
        comment: comment || null,
        create_date: nowAt.toDate(),
        create_date_num: nowAt.unix(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })
    return result
  }
}
