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
export class ParameterSetupBackgroundService {
  constructor(
    private prisma: PrismaService
  ) {}

  setupBackground() {
    return this.prisma.setup_background.findMany(
      {
        where:{
          del_flag: null,
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
      }
    )
  }

  setupBackgroundOnce(
    id: any
  ) {
    return this.prisma.setup_background.findUnique(
      {
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
      }
    )
  }
  

  async setupBackgroundCreate(
    payload: any,
    userId: any
  ) {
    const {...dataWithout} =
      payload

    await this.prisma.setup_background.updateMany(
      {
        data: {
          active: false
        }
      }
    )

    const setupBackgroundCreate =
      await this.prisma.setup_background.create(
        {
          data: {
            ...dataWithout,
            active: true,
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
    return setupBackgroundCreate
  }

  async setupBackgroundEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {...dataWithout} =
      payload

    const setupBackgroundEdit =
      await this.prisma.setup_background.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            // active: true,
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
    return setupBackgroundEdit
  }

  async setupBackgroundDelete(
    payload: any,
    userId: any,
    id: any
  ) {

    const setupBackgroundDelete =
      await this.prisma.setup_background.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            del_flag: true,
            // active: true,
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
    return setupBackgroundDelete
  }

  async setupBackgroundActive(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      active,
      ...dataWithout
    } = payload

    if (active) {
      await this.prisma.setup_background.updateMany(
        {
          data: {
            active: false
          }
        }
      )
    }

    const setupBackgroundEdit =
      await this.prisma.setup_background.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            // ...dataWithout,
            active: active,
            // active: true,
            update_date:
              getTodayNowAdd7().toDate(),
            // update_by: Number(userId),
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
    return setupBackgroundEdit
  }
}
