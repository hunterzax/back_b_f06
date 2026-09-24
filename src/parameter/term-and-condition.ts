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
export class ParameterTermAndConditionService {
  constructor(
    private prisma: PrismaService
  ) {}

  async termAndCondition() {
    const termAndCondition =
      await this.prisma.t_and_c.findMany(
        {
          include: {
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
    return termAndCondition
  }

  async termAndConditionOnce(
    id: any
  ) {
    const termAndCondition =
      await this.prisma.t_and_c.findUnique(
        {
          where: {
            id: Number(id)
          },
          include: {
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
    return termAndCondition
  }

  async termAndConditionCreate(
    payload: any,
    userId: any
  ) {
    const {
      start_date,
      end_date,
      ...dataWithout
    } = payload

    // ---

    const checkSE =
      await this.prisma.t_and_c.findMany(
        {
          // where: {
          //   id: {
          //     not: Number(id),
          //   },
          // },
        }
      )
    let flagSE = false

    if (checkSE.length > 0) {
      for (
        let i = 0;
        i < checkSE.length;
        i++
      ) {
        const isOverlap =
          await checkStartEndBoom(
            checkSE[i]
              ?.start_date,
            checkSE[i]
              ?.end_date,
            start_date,
            end_date
          )
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
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const termAndConditionCreate =
        await this.prisma.t_and_c.create(
          {
            data: {
              ...dataWithout,
              active: true,
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
      return termAndConditionCreate
    }
  }

  async termAndConditionEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const checkSE =
      await this.prisma.t_and_c.findMany(
        {
          where: {
            id: {
              not: Number(id)
            }
          }
        }
      )
    let flagSE = false

    if (checkSE.length > 0) {
      for (
        let i = 0;
        i < checkSE.length;
        i++
      ) {
        const isOverlap =
          await checkStartEndBoom(
            checkSE[i]
              ?.start_date,
            checkSE[i]
              ?.end_date,
            start_date,
            end_date
          )
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
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const termAndConditionEdit =
        await this.prisma.t_and_c.update(
          {
            where: {
              id: Number(id)
            },
            data: {
              ...dataWithout,
              active: true,
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
      return termAndConditionEdit
    }
  }
}
