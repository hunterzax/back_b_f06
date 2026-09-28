import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {getTodayNowAdd7} from 'src/common/utils/date.util'
import { Prisma } from '@prisma/client'

dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class AllocationModeService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  findOnce(id: any) {
    return this.prisma.allocation_mode.findFirst(
      {
        where: {
          id: Number(id)
        },
        include: {
          allocation_mode_type: true,
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

  async findAll() {
    const data = await this.prisma.allocation_mode.findMany(
      {
        where: {},
        include: {
          allocation_mode_type: true,
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
        orderBy: [
          {start_date: 'desc'},
        ]
      }
    )

    data.sort((a, b) => {
      const dateA = a.update_date ?? a.create_date;
      const dateB = b.update_date ?? b.create_date;
      if (a.start_date.getTime() !== b.start_date.getTime()) {
        return b.start_date.getTime() - a.start_date.getTime();
      }
      return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
    });

    data.map((item, index) => {
      if(index > 0) {
        item.end_date = data[index - 1].start_date
      }
      else{
        item.end_date = null
      }
      return item
    })

    return data
  }

  allocationModeType() {
    return this.prisma.allocation_mode_type.findMany(
      {
        orderBy: {id: 'asc'}
      }
    )
  }

  async allocationModeCreate(
    payload: any,
    userId: any
  ) {
    const {
      allocation_mode_type_id,
      start_date
    } = payload

    const checkSE =
      await this.prisma.allocation_mode.findMany(
        {
          where: {
            // id: {
            //   not: Number(id),
            // },
            // allocation_mode_type_id: 1,
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
        if (
          dayjs(
            checkSE[i]
              ?.start_date
          ).isAfter(
            dayjs(start_date)
          )
        ) {
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
            'Start Date should not overlap.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const create =
      await this.prisma.allocation_mode.create(
        {
          data: {
            allocation_mode_type:
              {
                connect: {
                  id:
                    allocation_mode_type_id ||
                    null
                }
              },
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
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

    return create
  }
}
