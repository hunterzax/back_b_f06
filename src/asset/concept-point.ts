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
  getTodayNowAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import {Prisma} from '@prisma/client'
import {parseToNumber} from 'src/common/utils/number.util'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class AssetConceptPointService {
  constructor(
    private prisma: PrismaService
  ) {}

  entryExit() {
    return this.prisma.entry_exit.findMany(
      {
        include: {
          // zone:true,
          // zone: {
          //   include: {
          //     area: {
          //       include: {
          //         contract_point: true,
          //       },
          //     },
          //   },
          // },
          area: {
            include: {
              zone: true,
              contract_point: true,
              nomination_point: true
            },
            orderBy: {
              id: 'desc'
            }
          },
          customer_type: true
        },
        orderBy: {id: 'asc'}
      }
    )
  }

  async typeConceptPoint() {
    return this.prisma.type_concept_point.findMany(
      {
        include: {
          group_type_concept_point: true
        },
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  async conceptPoint() {
    return this.prisma.concept_point.findMany(
      {
        include: {
          type_concept_point: true,
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
          id: 'asc'
        }
      }
    )
  }

  async conceptPointQuery(
    query: any
  ) {
    try {
      const {
        type_concept_point_id,
        start_date,
        end_date
      } = query

      const andInWhere: Prisma.concept_pointWhereInput[] =
        []

      if (
        type_concept_point_id
      ) {
        const typeID =
          parseToNumber(
            type_concept_point_id
          )
        if (typeID) {
          andInWhere.push({
            type_concept_point_id:
              typeID
          })
        }
      }

      if (start_date) {
        const startDate =
          getTodayStartAdd7(
            start_date
          )
        if (
          startDate.isValid()
        ) {
          andInWhere.push({
            OR: [
              {
                end_date: null
              },
              {
                end_date: {
                  gt: startDate.toDate()
                }
              }
            ]
          })
        }
      }

      if (end_date) {
        const endDate =
          getTodayStartAdd7(
            end_date
          )
        if (
          endDate.isValid()
        ) {
          andInWhere.push({
            start_date: {
              lte: endDate.toDate()
            }
          })
        }
      }

      return this.prisma.concept_point.findMany(
        {
          where: {
            AND: andInWhere
          },
          include: {
            type_concept_point: true
          },
          orderBy: {
            id: 'asc'
          }
        }
      )
    } catch (error) {
      return []
    }
  }

  async conceptPointOnce(
    id: any
  ) {
    return this.prisma.concept_point.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          type_concept_point: true,
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

  async conceptPointCreate(
    payload: any,
    userId: any
  ) {
    const {
      type_concept_point_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const checkSE =
      await this.prisma.concept_point.findMany(
        {
          where: {
            // id: {
            //   not: Number(id),
            // },
            concept_point:
              dataWithout?.concept_point,
            type_concept_point_id:
              Number(
                type_concept_point_id
              )
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
            'Start Date and End Date should not overlap.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const meteringPointCreate =
      await this.prisma.concept_point.create(
        {
          data: {
            ...dataWithout,
            ...(type_concept_point_id !==
              null && {
              type_concept_point:
                {
                  connect: {
                    id: type_concept_point_id
                  }
                }
            }),
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
    return meteringPointCreate
  }

  async conceptPointEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      type_concept_point_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const checkSE =
      await this.prisma.concept_point.findMany(
        {
          where: {
            id: {
              not: Number(id)
            },
            concept_point:
              dataWithout?.concept_point,
            type_concept_point_id:
              Number(
                type_concept_point_id
              )
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
            'Start Date and End Date should not overlap.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const meteringPointCreate =
      await this.prisma.concept_point.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            ...(type_concept_point_id !==
              null && {
              type_concept_point:
                {
                  connect: {
                    id: type_concept_point_id
                  }
                }
            }),
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
            update_by_account:
              {
                connect: {
                  id: Number(
                    userId
                  )
                }
              },
            update_date:
              getTodayNowAdd7().toDate(),
            update_date_num:
              getTodayNowAdd7().unix()
          }
        }
      )
    return meteringPointCreate
  }

  async shipperGroup() {
    return this.prisma.group.findMany(
      {
        where: {
          user_type_id: 3
        },
        include: {
          user_type: true,
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
          id: 'asc'
        }
      }
    )
  }

  async limitConceptPoint() {
    return this.prisma.limit_concept_point.findMany(
      {
        include: {
          concept_point: true,
          group: true,
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
          id: 'asc'
        }
      }
    )
  }

  async limitConceptPointManage(
    payload: any,
    userId: any
  ) {
    const {
      limitData,
      ...dataWithout
    } = payload

    const oldCN =
      await this.limitConceptPoint()
    const oldArr = (
      oldCN || []
    ).map((e: any) => {
      return {
        group_id: e?.group_id,
        concept_point_id:
          e?.concept_point_id
      }
    })
    const newArr = limitData

    // หา Items ที่หายไป (Removed Items)
    const removedItems =
      oldArr.filter(
        (oldItem) => {
          return !newArr.some(
            (newItem) =>
              newItem.group_id ===
                oldItem.group_id &&
              newItem.concept_point_id ===
                oldItem.concept_point_id
          )
        }
      )

    // หา Items ที่มาใหม่ (Added Items)
    const addedItems =
      newArr.filter(
        (newItem) => {
          return !oldArr.some(
            (oldItem) =>
              oldItem.group_id ===
                newItem.group_id &&
              oldItem.concept_point_id ===
                newItem.concept_point_id
          )
        }
      )

    // หา Items ที่ยังคงอยู่ (Unchanged Items)
    // const unchangedItems = oldArr.filter(oldItem => {
    //   return newArr.some(newItem =>
    //     newItem.group_id === oldItem.group_id && newItem.concept_point_id === oldItem.concept_point_id
    //   );
    // });

    await this.prisma.limit_concept_point.deleteMany(
      {
        where: {
          OR: removedItems.map(
            (item) => ({
              group_id:
                item.group_id,
              concept_point_id:
                item.concept_point_id
            })
          )
        }
      }
    )

    for (
      let i = 0;
      i < addedItems.length;
      i++
    ) {
      await this.prisma.limit_concept_point.create(
        {
          data: {
            // ...dataWithout,
            ...(addedItems[i]
              ?.group_id !==
              null && {
              group: {
                connect: {
                  id: addedItems[
                    i
                  ]?.group_id
                }
              }
            }),
            ...(addedItems[i]
              ?.concept_point_id !==
              null && {
              concept_point: {
                connect: {
                  id: addedItems[
                    i
                  ]
                    ?.concept_point_id
                }
              }
            }),
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

    return true
  }
}
