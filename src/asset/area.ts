import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import * as bcrypt from 'bcrypt'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {
  checkStartEndBoom,
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import axios from 'axios'
import {
  findMoveEndDatePoints,
  findMoveStartDatePoints,
  getConflictReason,
  shouldAddOldPointToEndDateArray,
  shouldAddOldPointToStartDateArray,
  shouldBlockNewPeriod
} from 'src/common/utils/asset.util'
import {parseToNumber} from 'src/common/utils/number.util'
import {writeReq} from 'src/common/utils/write-req.util'
import {Prisma} from '@prisma/client'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class AssetAreaService {
  constructor(
    private prisma: PrismaService
  ) {}

  area(query: any) {
    const {includeInactive} =
      query
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()
    const andInWhere: Prisma.areaWhereInput[] =
      []

    if (
      includeInactive !=
      'true'
    ) {
      andInWhere.push({
        start_date: {
          lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
        }
      })
      andInWhere.push({
        OR: [
          {end_date: null}, // ถ้า end_date เป็น null
          {
            end_date: {
              gte: todayStart
            }
          } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
        ]
      })
    }

    return this.prisma.area.findMany(
      {
        where: {
          AND: andInWhere
        },
        include: {
          supply_reference_quality_area_by: true,
          zone: true,
          entry_exit: true,

          owner_area: {
            include: {
              east_area: true,
              west_area: true
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

  areaEntry() {
    return this.prisma.area.findMany(
      {
        where: {
          // active: true,
          entry_exit_id: 1
        },
        include: {
          supply_reference_quality_area_by: true,
          zone: true,
          entry_exit: true,
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

  areaF2() {
    return this.prisma.area.findFirst(
      {
        // where: { name: { equals: "F2", mode: "insensitive" } },
        where: {
          name: {
            equals: 'G',
            mode: 'insensitive'
          }
        }, // มีการเปลี่ยนสูตรจาก F2 เป็น G
        include: {
          supply_reference_quality_area_by: true,
          zone: true,
          entry_exit: true,
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

  areaOnce(id: any) {
    return this.prisma.area.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          zone: true,
          entry_exit: true,
          supply_reference_quality_area_by: true,
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

  async areaCreate(
    payload: any,
    userId: any
  ) {
    const {
      start_date,
      end_date,
      name,
      zone_id,
      entry_exit_id,
      supply_reference_quality_area,
      west_supply_reference_quality_area,
      east_supply_reference_quality_area,
      owner_area,
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

    const areaCk =
      await this.prisma.area.findFirst(
        {
          where: {
            name: name,
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

    if (areaCk) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'area is already exist'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const zoneCk =
      await this.prisma.zone.findFirst(
        {
          where: {
            id: zone_id
          }
        }
      )
    if (
      zoneCk?.name ===
      'EAST-WEST'
    ) {
      const areaMaster = await this.prisma.$transaction(async (tx) => {
        const newArea = await tx.area.create(
          {
            data: {
              ...dataWithout,
              zone_id:
                zone_id,
              entry_exit_id:
                entry_exit_id,
              supply_reference_quality_area:
                supply_reference_quality_area,
              name: name,
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
              create_by:
                Number(
                  userId
                ),
              create_date_num:
                getTodayNowAdd7().unix()
            }
          }
        )

        await tx.east_west_supply_reference_quality_area.create(
          {
            data: {
              owner_area_id: newArea?.id,
              east_area_id:
                east_supply_reference_quality_area ||
                null,
              west_area_id:
                west_supply_reference_quality_area ||
                null
            }
          }
        )
        
        return newArea
      })

      return areaMaster
    } else {
      // แยก owner_area ออก ไม่งั้นแตก
      const {
        owner_area,
        ...rest
      } = dataWithout

      const areaMaster =
        await this.prisma.area.create(
          {
            data: {
              ...rest,
              zone_id:
                zone_id,
              entry_exit_id:
                entry_exit_id,
              supply_reference_quality_area:
                supply_reference_quality_area,
              name: name,
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
              create_by:
                Number(
                  userId
                ),
              create_date_num:
                getTodayNowAdd7().unix()
            }
          }
        )

      return areaMaster
    }
  }

  async areaUpdate(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      start_date,
      end_date,
      name,
      zone_id,
      entry_exit_id,
      supply_reference_quality_area,
      west_supply_reference_quality_area,
      east_supply_reference_quality_area,
      owner_area,
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

    const areaCk =
      await this.prisma.area.findFirst(
        {
          where: {
            name: name,
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
    if (areaCk) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'area is already exist'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const zoneCk =
      await this.prisma.zone.findFirst(
        {
          where: {
            id: zone_id
          }
        }
      )
    if (
      zoneCk?.name ===
      'EAST-WEST'
    ) {
      const areaMaster =
        await this.prisma.area.update(
          {
            where: {
              id: Number(id)
            },
            data: {
              ...dataWithout,
              zone_id:
                zone_id,
              entry_exit_id:
                entry_exit_id,
              supply_reference_quality_area:
                supply_reference_quality_area,
              name: name,
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
              update_by:
                Number(
                  userId
                ),
              update_date_num:
                getTodayNowAdd7().unix()
            }
          }
        )

      await this.prisma.east_west_supply_reference_quality_area.deleteMany(
        {
          where: {
            owner_area_id:
              Number(id)
          }
        }
      )

      const east_west_supply_reference_quality_area =
        await this.prisma.east_west_supply_reference_quality_area.create(
          {
            data: {
              owner_area_id:
                Number(id),
              east_area_id:
                east_supply_reference_quality_area ||
                null,
              west_area_id:
                west_supply_reference_quality_area ||
                null
            }
          }
        )

      return areaMaster
    } else {
      const areaMaster =
        await this.prisma.area.update(
          {
            where: {
              id: Number(id)
            },
            data: {
              ...dataWithout,
              zone_id:
                zone_id,
              entry_exit_id:
                entry_exit_id,
              supply_reference_quality_area:
                supply_reference_quality_area,
              name: name,
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
              update_by:
                Number(
                  userId
                ),
              update_date_num:
                getTodayNowAdd7().unix()
            }
          }
        )

      return areaMaster
    }
  }
}
