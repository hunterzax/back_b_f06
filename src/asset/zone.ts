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
import {
  checkStartEndBoom,
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import { Prisma } from '@prisma/client'
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class AssetZoneService {
  constructor(
    private prisma: PrismaService
  ) {}

  zone(payload: any) {
    const { entry_exit_id, onlyActive, start_date, end_date } = payload
    const startDate = start_date ? getTodayNowYYYYMMDDDfaultAdd7(start_date) : getTodayStartAdd7()
    const endDate = end_date ? getTodayNowYYYYMMDDDfaultAdd7(end_date) : undefined
    let where : Prisma.zoneWhereInput = {}
    if(entry_exit_id){
      const entryExitIdNum = Number(entry_exit_id)
      if(isNaN(entryExitIdNum)){
        const entryExitIdObject = JSON.parse(entry_exit_id)
        if(Array.isArray(entryExitIdObject)){
          where.entry_exit_id = {
            in: entryExitIdObject
          }
        }
      }
      else{
        where.entry_exit_id = entryExitIdNum
      }
    }

    if (onlyActive === true || onlyActive === 'true') {
      if(where){
        where.start_date = {
          lte: (endDate || startDate || getTodayStartAdd7()).toDate()
        }
        where.OR = [
          { end_date: null },
          { end_date: { gte: startDate.toDate() } }
        ]
      }
      else{
        where = {
          start_date: {
            lte: (endDate || startDate || getTodayStartAdd7()).toDate()
          },
          OR: [
            { end_date: null },
            { end_date: { gte: startDate.toDate() } }
          ]
        }
      }
    }

    return this.prisma.zone.findMany(
      {
        where: where,
        include: {
          entry_exit: true,
          zone_master_quality: true,
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
        orderBy: {id: 'asc'}
      }
    )
  }

  zoneMaster() {
    return this.prisma.zone.findMany(
      {
        where: {
          // active: true,
        },
        include: {
          zone_master_quality: true,
          entry_exit: {
            select: {
              id: true,
              name: true,
              color: true
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
        orderBy: {id: 'desc'}
      }
    )
  }

  zoneMasterOnce(id: any) {
    return this.prisma.zone.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          zone_master_quality: true,
          entry_exit: {
            select: {
              id: true,
              name: true,
              color: true
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
      }
    )
  }

  async zoneMasterCreate(
    payload: any,
    userId: any
  ) {
    const {
      start_date,
      end_date,
      entry_exit_id,
      ...dataWithout
    } = payload

    // const check = await this.prisma.zone.findFirst({
    //   where: {
    //     name: dataWithout?.name,
    //     entry_exit_id: Number(entry_exit_id),
    //   },
    // });

    // if (check) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'zone already exist',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    const startDate =
      getTodayNowYYYYMMDDDfaultAdd7(
        start_date
      ).toDate() // YYYY-MM-DD
    const endDate = end_date
      ? getTodayNowYYYYMMDDDfaultAdd7(
          end_date
        ).toDate()
      : null // YYYY-MM-DD
    const checkSE =
      await this.prisma.zone.count(
        {
          where: {
            name: dataWithout?.name,
            entry_exit_id:
              Number(
                entry_exit_id
              ),
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
    const check = checkSE > 0

    if (check) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'zone already exist'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const zone =
      await this.prisma.zone.create(
        {
          data: {
            ...dataWithout,
            entry_exit: {
              connect: {
                id: entry_exit_id // Prisma จะใช้ connect แทนการใช้ entry_exit_id โดยตรง
              }
            },
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            end_date: end_date
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
    await this.prisma.zone_master_quality.create(
      {
        data: {
          active: true,
          zone_id: zone?.id,
          create_date:
            getTodayNowAdd7().toDate(),
          create_by:
            Number(userId),
          create_date_num:
            getTodayNowAdd7().unix()
        }
      }
    )
    return zone
  }

  async zoneMasterUpdate(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      start_date,
      end_date,
      ...dataWithout
    } = payload

    // const check = await this.prisma.zone.findFirst({
    //   where: {
    //     name: dataWithout?.name,
    //     entry_exit_id: Number(dataWithout?.entry_exit_id),
    //     id: { not: Number(id) },
    //   },
    // });

    const startDate =
      getTodayNowYYYYMMDDDfaultAdd7(
        start_date
      ).toDate() // YYYY-MM-DD
    const endDate = end_date
      ? getTodayNowYYYYMMDDDfaultAdd7(
          end_date
        ).toDate()
      : null // YYYY-MM-DD
    const checkSE =
      await this.prisma.zone.count(
        {
          where: {
            name: dataWithout?.name,
            entry_exit_id:
              Number(
                dataWithout?.entry_exit_id
              ),
            id: {
              not: Number(id)
            },
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
    const check = checkSE > 0

    if (check) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'zone already exist'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    if (end_date) {
      const endDate =
        getTodayNowAdd7(
          end_date
        ).toDate()
      const areaThatStillActive =
        await this.prisma.area.findMany(
          {
            where: {
              AND: [
                {
                  zone_id:
                    Number(id)
                },
                {
                  OR: [
                    {
                      end_date:
                        {
                          gte: endDate
                        }
                    },
                    {
                      end_date:
                        null
                    }
                  ]
                }
              ]
            }
          }
        )

      if (
        areaThatStillActive.length >
        0
      ) {
        const validateList =
          areaThatStillActive.map(
            (area: any) =>
              `${area?.name || ''} still active at ${dayjs(endDate).format('DD/MM/YYYY') || ''}`
          )
        const message =
          validateList.join(
            '<br/>'
          )
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            key: message,
            error: message
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    const zoneMaster =
      await this.prisma.zone.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            end_date: end_date
              ? getTodayNowAdd7(
                  end_date
                ).toDate()
              : null,
            update_by:
              Number(userId),
            update_date:
              getTodayNowAdd7().toDate(),
            update_date_num:
              getTodayNowAdd7().unix()
          }
        }
      )
    return zoneMaster
  }

  zoneMasterQualityUpdate(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      start_date,
      end_date,
      ...dataWithout
    } = payload

    return this.prisma.zone_master_quality.updateMany(
      {
        where: {
          zone_id: Number(id)
        },
        data: {
          ...dataWithout,
          update_date:
            getTodayNowAdd7().toDate(),
          update_by:
            Number(userId),
          update_date_num:
            getTodayNowAdd7().unix()
        }
      }
    )
  }
}
