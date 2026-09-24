import {HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {checkStartEndBoom, getTodayEndAdd7, getTodayNowAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ParameterPlanningDeadlineService {
  constructor(private prisma: PrismaService) {}

  planningDeadline() {
    return this.prisma.planning_deadline.findMany({
      include: {
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
      },
      orderBy: {
        id: 'desc'
      }
    })
  }

  planningDeadlineOnce(id: any) {
    return this.prisma.planning_deadline.findUnique({
      where: {
        id: Number(id)
      },
      include: {
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
  }

  async planningDeadlineCreate(payload: any, userId: any) {
    const {term_type_id, start_date, end_date, ...dataWithout} = payload

    const checkSE = await this.prisma.planning_deadline.findMany({
      where: {
        term_type_id: term_type_id
      }
    })
    let flagSE = false

    if (checkSE.length > 0) {
      for (let i = 0; i < checkSE.length; i++) {
        const isOverlap = await checkStartEndBoom(checkSE[i]?.start_date, checkSE[i]?.end_date, start_date, end_date)
        if (isOverlap) {
          flagSE = true
          break
        }
      }
    } else {
      flagSE = false
    }

    if (flagSE) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const planningDeadlineCreate = await this.prisma.planning_deadline.create({
        data: {
          ...dataWithout,
          ...(term_type_id !== null && {
            term_type: {
              connect: {
                id: term_type_id
              }
            }
          }),
          // active: true,
          start_date: start_date ? getTodayNowAdd7(start_date).toDate() : null,
          end_date: end_date ? getTodayNowAdd7(end_date).toDate() : null,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            }
          }
        }
      })
      return planningDeadlineCreate
    }
  }

  async planningDeadlineEdit(payload: any, userId: any, id: any) {
    const {term_type_id, start_date, end_date, ...dataWithout} = payload

    const checkSE = await this.prisma.planning_deadline.findMany({
      where: {
        id: {
          not: Number(id)
        },
        term_type_id: term_type_id
      }
    })
    let flagSE = false
    if (checkSE.length > 0) {
      for (let i = 0; i < checkSE.length; i++) {
        const isOverlap = await checkStartEndBoom(checkSE[i]?.start_date, checkSE[i]?.end_date, start_date, end_date)
        if (isOverlap) {
          flagSE = true
          break
        }
      }
    } else {
      flagSE = false
    }

    if (flagSE) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const planningDeadlineEdit = await this.prisma.planning_deadline.update({
        where: {
          id: Number(id)
        },
        data: {
          ...dataWithout,
          ...(term_type_id !== null && {
            term_type: {
              connect: {
                id: term_type_id
              }
            }
          }),
          // active: true,
          start_date: start_date ? getTodayNowAdd7(start_date).toDate() : null,
          end_date: end_date ? getTodayNowAdd7(end_date).toDate() : null,
          update_date: getTodayNowAdd7().toDate(),
          update_by_account: {
            connect: {
              id: Number(userId)
            }
          },
          update_date_num: getTodayNowAdd7().unix()
        }
      })
      return planningDeadlineEdit
    }
  }
}
