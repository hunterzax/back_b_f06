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
export class ParameterEmailGroupForEventService {
  constructor(
    private prisma: PrismaService
  ) {}

  async emailGroupForEvent() {
    const emailGroupForEvent =
      await this.prisma.edit_email_group_for_event.findMany(
        {
          include: {
            edit_email_group_for_event_match: true,
            group: true,
            user_type: true,
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
    return emailGroupForEvent
  }

  async emailGroupForEventOnce(
    id: any
  ) {
    const emailGroupForEvent =
      await this.prisma.edit_email_group_for_event.findUnique(
        {
          where: {
            id: Number(id)
          },
          include: {
            group: true,
            user_type: true,
            edit_email_group_for_event_match: true,
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
    return emailGroupForEvent
  }

  async emailGroupForEventCreate(
    payload: any,
    userId: any
  ) {
    const {
      email,
      user_type_id,
      group_id,
      ...dataWithout
    } = payload

    const checkF =
      await this.prisma.edit_email_group_for_event.findFirst(
        {
          where: {
            name: dataWithout?.name
          }
        }
      )
    if (checkF) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          // error: 'มี name ซ้ำ.',
          error:
            'This name already exists.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const emailGroupForEventCreate =
      await this.prisma.edit_email_group_for_event.create(
        {
          data: {
            ...dataWithout,
            user_type: {
              connect: {
                id: user_type_id
              }
            },
            group: {
              connect: {
                id: group_id
              }
            },
            // active: true,
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
    for (
      let i = 0;
      i < email.length;
      i++
    ) {
      await this.prisma.edit_email_group_for_event_match.create(
        {
          data: {
            email: email[i],
            ...(emailGroupForEventCreate?.id !==
              null && {
              edit_email_group_for_event:
                {
                  connect: {
                    id: emailGroupForEventCreate?.id
                  }
                }
            }),
            // active: true,
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
    }
    return emailGroupForEventCreate
  }

  async emailGroupForEventEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      email,
      user_type_id,
      group_id,
      ...dataWithout
    } = payload

    const checkF =
      await this.prisma.edit_email_group_for_event.findFirst(
        {
          where: {
            id: {
              not: Number(id)
            },
            name: dataWithout?.name
          }
        }
      )
    if (checkF) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          // error: 'มี name ซ้ำ.',
          error:
            'This name already exists.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const emailGroupForEventEdit =
      await this.prisma.edit_email_group_for_event.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            user_type: {
              connect: {
                id: user_type_id
              }
            },
            group: {
              connect: {
                id: group_id
              }
            },
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

    await this.prisma.edit_email_group_for_event_match.deleteMany(
      {
        where: {
          edit_email_group_for_event_id:
            Number(id)
        }
      }
    )

    for (
      let i = 0;
      i < email.length;
      i++
    ) {
      await this.prisma.edit_email_group_for_event_match.create(
        {
          data: {
            email: email[i],
            ...(id !==
              null && {
              edit_email_group_for_event:
                {
                  connect: {
                    id: Number(
                      id
                    )
                  }
                }
            }),
            // active: true,
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
    }
    return emailGroupForEventEdit
  }
}
