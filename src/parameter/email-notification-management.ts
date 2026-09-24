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
export class ParameterEmailNotificationManagementService {
  constructor(
    private prisma: PrismaService
  ) {}

  // email notification management
  subEmailNotificationManagement() {
    return this.prisma.menus.findMany(
      {
        where: {
          flag_email_notimanagement: true
        },
        include: {
          sub_email_notification_management: true
        },
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  emailNotificationManagement() {
    return this.prisma.email_notification_management.findMany(
      {
        include: {
          menus: true,
          activity: true,
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
      }
    )
  }

  emailNotificationManagementOnce(
    id: any
  ) {
    return this.prisma.email_notification_management.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          menus: true,
          activity: true,
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

  async emailNotificationManagementCreate(
    payload: any,
    userId: any
  ) {
    const {
      menus_id,
      activity_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const checkENM =
      await this.prisma.email_notification_management.findFirst(
        {
          where: {
            menus_id:
              menus_id,
            activity_id:
              activity_id
          }
        }
      )

    if (checkENM) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'activity_id ซ้ำในระบบ'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const emailNotificationManagementCreate =
      await this.prisma.email_notification_management.create(
        {
          data: {
            ...dataWithout,
            ...(menus_id !==
              null && {
              menus: {
                connect: {
                  id: menus_id
                }
              }
            }),
            ...(activity_id !==
              null && {
              activity: {
                connect: {
                  id: activity_id
                }
              }
            }),
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
    return emailNotificationManagementCreate
  }

  async emailNotificationManagementEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      menus_id,
      activity_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const checkENM =
      await this.prisma.email_notification_management.findFirst(
        {
          where: {
            id: {
              not: Number(id)
            },
            menus_id:
              menus_id,
            activity_id:
              activity_id
          }
        }
      )

    if (checkENM) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'activity_id ซ้ำในระบบ'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const emailNotificationManagementCreate =
      await this.prisma.email_notification_management.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            ...(menus_id !==
              null && {
              menus: {
                connect: {
                  id: menus_id
                }
              }
            }),
            ...(activity_id !==
              null && {
              activity: {
                connect: {
                  id: activity_id
                }
              }
            }),
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
    return emailNotificationManagementCreate
  }

  async emailNotificationManagementActive(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      active,
      ...dataWithout
    } = payload

    const emailNotificationManagementActive =
      await this.prisma.email_notification_management.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            active: active,
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
    return emailNotificationManagementActive
  }
}
