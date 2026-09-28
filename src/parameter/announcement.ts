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
export class ParameterAnnouncementService {
  constructor(private prisma: PrismaService) {}

  announcement() {
    return this.prisma.announcement.findMany({
      where: {
        del_flag: null
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
  }

  announcementOnce(id: any) {
    return this.prisma.announcement.findUnique({
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
      }
    })
  }

  async announcementCreate(payload: any, userId: any) {
    const {start_date, end_date, ...dataWithout} = payload

    const checkSE = await this.prisma.announcement.findMany({
      where: {
        del_flag: null,
        topic: dataWithout?.topic
        // user_type_id: user_type_id,
        // nomination_type_id: nomination_type_id,
        // process_type_id: process_type_id,
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
          error: 'This topic has already been used during the selected period.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const announcementCreate = await this.prisma.announcement.create({
      data: {
        ...dataWithout,
        // active: true,
        status: dataWithout?.status === null ? true : dataWithout?.status,
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
    return announcementCreate
  }

  async announcementEdit(payload: any, userId: any, id: any) {
    const {start_date, end_date, ...dataWithout} = payload

    const checkSE = await this.prisma.announcement.findMany({
      where: {
        del_flag: null,
        topic: dataWithout?.topic,
        id: {
          not: Number(id)
        }
        // user_type_id: user_type_id,
        // nomination_type_id: nomination_type_id,
        // process_type_id: process_type_id,
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
    }

    const announcementEdit = await this.prisma.announcement.update({
      where: {
        id: Number(id)
      },
      data: {
        ...dataWithout,
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
    return announcementEdit
  }

  async announcementDelete(payload: any, userId: any, id: any) {

    const announcementDelete = await this.prisma.announcement.update({
      where: {
        id: Number(id)
      },
      data: {
        del_flag: true,
        update_date: getTodayNowAdd7().toDate(),
        update_by_account: {
          connect: {
            id: Number(userId)
          }
        },
        update_date_num: getTodayNowAdd7().unix()
      }
    })
    return announcementDelete
  }

  async announcementStatus(payload: any, userId: any, id: any) {
    const {status, ...dataWithout} = payload

    const announcementEdit = await this.prisma.announcement.update({
      where: {
        id: Number(id)
      },
      data: {
        status: status,
        update_date: getTodayNowAdd7().toDate(),
        update_by_account: {
          connect: {
            id: Number(userId)
          }
        },
        update_date_num: getTodayNowAdd7().unix()
      }
    })
    return announcementEdit
  }

  announcementUse() {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    return this.prisma.announcement.findMany({
      where: {
        del_flag: null,
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
          },
          {
            status: true
          }
        ]
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
        create_date: 'desc'
      }
    })
  }
}
