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
export class ParameterCheckingConditionService {
  constructor(private prisma: PrismaService) {}

  async checkingCondition() {
    const checkingCondition = await this.prisma.check_condition.findMany({
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
    return checkingCondition
  }

  async checkingConditionOnce(id: any) {
    const checkingConditionOnce = await this.prisma.check_condition.findUnique({
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
    return checkingConditionOnce
  }

  async checkingConditionCreate(payload: any, userId: any) {
    const {start_date, end_date, ...dataWithout} = payload

    //
    const startDate = start_date ? getTodayNowAdd7(start_date).toDate() : null
    const endDate = end_date ? getTodayNowAdd7(end_date).toDate() : null

    // เจอ overlap ทั้งๆที่วันที่ไม่ทับกัน เลยเปลี่ยนมาใช้ where date แทน checkStartEndBoom ก่อนเพราะรีบเอาขึ้นไป FAT
    // เพราะ checkStartEndBoom เป็นฟังก์ชันกลางถ้าแก้ต้องไปทดสอบหลายที่ซึ่งใช้เวลานาน
    // มีใช้ where แทนเหมือนกันใน nominationDeadlineCreate กับ nominationDeadlineEdit
    const checkSE = await this.prisma.check_condition.findMany({
      where: {
        OR: [
          {
            AND: [
              {
                start_date: {
                  lte: startDate
                }
              },
              {
                OR: [
                  {
                    end_date: null
                  },
                  {
                    end_date: {
                      gt: startDate
                    }
                  }
                ]
              }
            ]
          },
          {
            AND: [
              {
                start_date: {
                  gte: startDate
                }
              },
              ...(endDate
                ? [
                    {
                      start_date: {
                        lt: endDate
                      }
                    }
                  ]
                : [])
            ]
          }
        ]
      }
    })

    const flagSE = checkSE.length > 0

    if (flagSE) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      // return null
      const checkingCondition = await this.prisma.check_condition.findMany({})
      const checkingConditionCreate = await this.prisma.check_condition.create({
        data: {
          ...dataWithout,
          // active: true,
          version: String(checkingCondition.length + 1 < 10 ? `000${checkingCondition.length + 1}` : checkingCondition.length + 1 < 100 ? `00${checkingCondition.length + 1}` : checkingCondition.length + 1 < 1000 ? `0${checkingCondition.length + 1}` : checkingCondition.length + 1),
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
      return checkingConditionCreate
    }
  }

  async checkingConditionEdit(payload: any, userId: any, id: any) {
    const {start_date, end_date, ...dataWithout} = payload

    const startDate = start_date ? getTodayNowAdd7(start_date).toDate() : null
    const endDate = end_date ? getTodayNowAdd7(end_date).toDate() : null

    // เจอ overlap ทั้งๆที่วันที่ไม่ทับกัน เลยเปลี่ยนมาใช้ where date แทน checkStartEndBoom ก่อนเพราะรีบเอาขึ้นไป FAT
    // เพราะ checkStartEndBoom เป็นฟังก์ชันกลางถ้าแก้ต้องไปทดสอบหลายที่ซึ่งใช้เวลานาน
    // มีใช้ where แทนเหมือนกันใน nominationDeadlineCreate กับ nominationDeadlineEdit
    const checkSE = await this.prisma.check_condition.findMany({
      where: {
        id: {
          not: Number(id)
        },
        // start_date: start_date ? getTodayNowAdd7(start_date).toDate() : null,
        // end_date: end_date ? getTodayNowAdd7(end_date).toDate() : null,
        OR: [
          {
            AND: [
              {
                start_date: {
                  lte: startDate
                }
              },
              {
                OR: [
                  {
                    end_date: null
                  },
                  {
                    end_date: {
                      gt: startDate
                    }
                  }
                ]
              }
            ]
          },
          {
            AND: [
              {
                start_date: {
                  gte: startDate
                }
              },
              ...(endDate
                ? [
                    {
                      start_date: {
                        lt: endDate
                      }
                    }
                  ]
                : [])
            ]
          }
        ]
      }
    })

    const flagSE = checkSE.length > 0

    // let flagSE = false;

    // if (checkSE.length > 0) {
    //   for (let i = 0; i < checkSE.length; i++) {
    //     const isOverlap = await checkStartEndBoom(
    //       checkSE[i]?.start_date,
    //       checkSE[i]?.end_date,
    //       start_date,
    //       end_date,
    //     );
    //     if (isOverlap) {
    //       flagSE = true;
    //       break;
    //     }
    //   }
    // } else {
    //   flagSE = false;
    // }

    if (flagSE) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const checkingConditionEdit = await this.prisma.check_condition.update({
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
      return checkingConditionEdit
    }
  }
}
