import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {
  checkStartEndBoom,
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ParameterBookingTemplateService {
  constructor(
    private prisma: PrismaService
  ) {}

  async bookingTemplate() {
    const bookingTemplate =
      await this.prisma.booking_template.findMany(
        {
          include: {
            term_type: true,
            create_by_account:
              {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },
            update_by_account:
              {
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
        }
      )
    return bookingTemplate
  }

  async bookingTemplateOnce(
    id: any
  ) {
    const bookingTemplateOnce =
      await this.prisma.booking_template.findUnique(
        {
          where: {
            id: Number(id)
          },
          include: {
            term_type: true,
            create_by_account:
              {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },
            update_by_account:
              {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              }
          }
        }
      )
    return bookingTemplateOnce
  }

  async bookingTemplateCreate(
    payload: any,
    userId: any
  ) {
    const {
      start_date,
      end_date,
      term_type_id,
      file_period,
      ...dataWithout
    } = payload

    const startDate =
      start_date
        ? getTodayNowAdd7(
            start_date
          ).toDate()
        : null
    const endDate = end_date
      ? getTodayNowAdd7(
          end_date
        ).toDate()
      : null

    // เจอสร้าง overlap ทับกันได้ เลยเปลี่ยนมาใช้ where date แทน checkStartEndBoom ก่อน
    // เพราะ checkStartEndBoom เป็นฟังก์ชันกลางถ้าแก้ต้องไปทดสอบหลายที่ซึ่งใช้เวลานาน
    // มีใช้ where แทนเหมือนกันใน nominationDeadlineCreate, nominationDeadlineEdit , checkingConditionCreate กับ checkingConditionEdit
    const checkSE =
      await this.prisma.booking_template.findMany(
        {
          where: {
            term_type_id:
              term_type_id,
            OR: [
              {
                AND: [
                  {
                    start_date:
                      {
                        lte: startDate
                      }
                  },
                  {
                    OR: [
                      {
                        end_date:
                          null
                      },
                      {
                        end_date:
                          {
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
                    start_date:
                      {
                        gte: startDate
                      }
                  },
                  ...(endDate
                    ? [
                        {
                          start_date:
                            {
                              lt: endDate
                            }
                        }
                      ]
                    : [])
                ]
              }
            ]
          }
        }
      )

    const flagSE =
      checkSE.length > 0

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
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const bookingTemplateCreate =
        await this.prisma.booking_template.create(
          {
            data: {
              ...dataWithout,
              ...(term_type_id !==
                null && {
                term_type: {
                  connect: {
                    id: term_type_id
                  }
                }
              }),
              // active: true,
              start_date:
                start_date
                  ? getTodayNowAdd7(
                      start_date
                    ).toDate()
                  : null,
              end_date:
                end_date
                  ? getTodayNowAdd7(
                      end_date
                    ).toDate()
                  : null,
              create_date:
                getTodayNowAdd7().toDate(),
              create_date_num:
                getTodayNowAdd7().unix(),
              create_by_account:
                {
                  connect: {
                    id: Number(
                      userId
                    ) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                  }
                }
            }
          }
        )
      return bookingTemplateCreate
    }
  }

  async bookingTemplateEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      start_date,
      end_date,
      term_type_id,
      file_period,
      ...dataWithout
    } = payload

    const startDate =
      start_date
        ? getTodayNowAdd7(
            start_date
          ).toDate()
        : null
    const endDate = end_date
      ? getTodayNowAdd7(
          end_date
        ).toDate()
      : null

    // เจอสร้าง overlap ทับกันได้ เลยเปลี่ยนมาใช้ where date แทน checkStartEndBoom ก่อน
    // เพราะ checkStartEndBoom เป็นฟังก์ชันกลางถ้าแก้ต้องไปทดสอบหลายที่ซึ่งใช้เวลานาน
    // มีใช้ where แทนเหมือนกันใน nominationDeadlineCreate, nominationDeadlineEdit , checkingConditionCreate กับ checkingConditionEdit
    const checkSE =
      await this.prisma.booking_template.findMany(
        {
          where: {
            id: {
              not: Number(id)
            },
            term_type_id:
              term_type_id,
            OR: [
              {
                AND: [
                  {
                    start_date:
                      {
                        lte: startDate
                      }
                  },
                  {
                    OR: [
                      {
                        end_date:
                          null
                      },
                      {
                        end_date:
                          {
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
                    start_date:
                      {
                        gte: startDate
                      }
                  },
                  ...(endDate
                    ? [
                        {
                          start_date:
                            {
                              lt: endDate
                            }
                        }
                      ]
                    : [])
                ]
              }
            ]
          }
        }
      )

    const flagSE =
      checkSE.length > 0

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
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const bookingTemplateEdit =
        await this.prisma.booking_template.update(
          {
            where: {
              id: Number(id)
            },
            data: {
              ...dataWithout,
              ...(term_type_id !==
                null && {
                term_type: {
                  connect: {
                    id: term_type_id
                  }
                }
              }),
              start_date:
                start_date
                  ? getTodayNowAdd7(
                      start_date
                    ).toDate()
                  : null,
              end_date:
                end_date
                  ? getTodayNowAdd7(
                      end_date
                    ).toDate()
                  : null,
              update_date:
                getTodayNowAdd7().toDate(),
              update_by_account:
                {
                  connect: {
                    id: Number(
                      userId
                    )
                  }
                },
              update_date_num:
                getTodayNowAdd7().unix()
            }
          }
        )
      return bookingTemplateEdit
    }
  }
}
