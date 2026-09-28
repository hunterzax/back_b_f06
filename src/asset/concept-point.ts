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
  getTodayStartAdd7,
  getWeekRange
} from 'src/common/utils/date.util'
import {Prisma} from '@prisma/client'
import {parseToNumber} from 'src/common/utils/number.util'
import * as _ from 'lodash'
import { limitConceptPointHistoryPopulate, limitConceptPointHistoryRecord, queryShipperNominationFilePopulateForCal, queryShipperNominationFileWithRelationsForCal } from '@type/prisma.type'
import { isMatch } from 'src/common/utils/allocation.util'

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
          concept_point: {
            include: {
              type_concept_point: true
            }
          },
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

    const now = getTodayNowAdd7()
    const oldCN = await this.limitConceptPoint()
    const oldArr = oldCN.map(e => {
      return {
        create_date: e.create_date,
        group_name: e.group?.name || '',
        group_id_name: e.group?.id_name || '',
        group_id: e.group_id,
        concept_point_name: e.concept_point?.concept_point || '',
        concept_point_id: e.concept_point_id
      }
    })
    const newArr = limitData

    // หา Items ที่หายไป (Removed Items)
    let removedItems =
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

    const theOldestRemovedCreateDateRaw = removedItems.reduce((acc: Date | undefined, item) => {
      if (!acc || item.create_date < acc) {
        return item.create_date
      }
      return acc
    }, undefined)

    const theOldestRemovedCreateDate = theOldestRemovedCreateDateRaw
      ? getTodayStartAdd7(theOldestRemovedCreateDateRaw).toDate()
      : undefined

    if(theOldestRemovedCreateDate) {
      // หาช่วงสัปดาห์ที่ครอบคลุมวันที่เริ่มต้นและสิ้นสุด (สำหรับดึงข้อมูล weekly nomination)
      const { weekStart: targetWeekStart } = getWeekRange(theOldestRemovedCreateDate);
      const { weekEnd: targetWeekEnd } = getWeekRange(now.toDate());
  
      // ดึงข้อมูล nomination files ทั้งแบบรายวัน (type 1) และรายสัปดาห์ (type 2)
      const nominationData: queryShipperNominationFileWithRelationsForCal[] = await this.prisma.query_shipper_nomination_file.findMany({
        where: {
          AND: [
            {
              OR: [
                {
                  // nomination รายวัน (type 1) ที่อยู่ในช่วงวันที่ที่เลือก
                  nomination_type: { id: 1 },
                  gas_day: {
                    gte: theOldestRemovedCreateDate,
                    lte: now.endOf('day').toDate(),
                  },
                },
                {
                  // nomination รายสัปดาห์ (type 2) ที่อยู่ในช่วงสัปดาห์ที่ครอบคลุมวันที่เลือก
                  nomination_type: { id: 2 },
                  gas_day: {
                    gte: targetWeekStart,
                    lte: targetWeekEnd,
                  },
                },
              ],
            },
            // เฉพาะรายการที่ไม่ถูกลบ
            {
              OR: [
                {
                  del_flag: false,
                },
                {
                  del_flag: null,
                },
              ],
            },
            // เฉพาะ status 1 (Waiting For Response), 2 (Approved) และ 5 (Approved by System)
            {
              query_shipper_nomination_status: {
                id: {
                  in: [1, 2, 5],
                },
              },
            },
          ],
        },
        ...queryShipperNominationFilePopulateForCal,
        orderBy: [
          {
            nomination_type_id: 'asc',
          },
          { id: 'desc' },
        ],
      });

      const cannotDeleteItems = removedItems.filter(item => {
        const nomFilesByGroupAndCreateDate = nominationData.filter(nominationFile => {
          return nominationFile.group_id === item.group_id && nominationFile.gas_day >= item.create_date
        })

        const hasPointInNomFiles = nomFilesByGroupAndCreateDate.some((nominationFile) => {
          return nominationFile.nomination_version.some((nominationVersion) => {
            return nominationVersion.nomination_row_json.some((nominationRowJson) => {
              // แปลง JSON string เป็น object
              const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp);
  
              // อ่านข้อมูลจาก JSON ตามตำแหน่งที่กำหนด
              const point = nominationRowJsonDataTemp['3'] || nominationRowJsonDataTemp['4'] || nominationRowJsonDataTemp['5'];

              return isMatch(point, item.concept_point_name)
            });
          });
        })

        return hasPointInNomFiles
      })

      // removedItems = removedItems.filter(item => !cannotDeleteItems.includes(item))
      if(cannotDeleteItems.length > 0) {
        const validateList = cannotDeleteItems.map(item => {
          return `Cannot edit or delete: ${item.concept_point_name} is currently in use by Nomination files.`
        })
        const message = validateList.join('<br/>')
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: message,
            error: message
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

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

    return await this.prisma.$transaction(async (tx) => {
    await tx.limit_concept_point.deleteMany(
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
      await tx.limit_concept_point_history.updateMany(
        {
          where: {
            OR: removedItems.map(
              (item) => ({
                group_id: item.group_id,
                concept_point_id: item.concept_point_id,
                deleted_date: null
              })
            )
          },
          data: {
            deleted_date: now.toDate(),
            update_date: now.toDate(),
            update_date_num: now.unix(),
            update_by: Number(userId)
          }
        }
      )

    for (
      let i = 0;
      i < addedItems.length;
      i++
    ) {
        const data = {
          ...(addedItems[i]?.group_id !== null && {
            group: {
              connect: { id: addedItems[i]?.group_id }
            }
          }),
          ...(addedItems[i]?.concept_point_id !== null && {
            concept_point: {
              connect: { id: addedItems[i]?.concept_point_id }
            }
          }),
          create_date: now.toDate(),
          create_date_num: now.unix(),
          create_by_account: {
              connect: { id: Number(userId) }
          }
        }

        await tx.limit_concept_point.create({data: data})

        await tx.limit_concept_point_history.create({data: data})
    }

    return true
    })
  }

  async limitConceptPointHistory(
    {
      limit = 100,
      offset = 0,
      q = '',
      groupId,
      conceptPointId,
      startDate,
      endDate,
      orderByName,
      orderBy,
      ignorePagination = false
    } : {
      limit: number
      offset: number
      q?: string
      groupId?: any
      conceptPointId?: any
      startDate?: any
      endDate?: any
      orderByName?: any
      orderBy?: any
      ignorePagination?: boolean
    }
  ) {
    const startDate_ = startDate ? getTodayNowAdd7(startDate).toDate() : null
    const endDate_ = endDate ? getTodayNowAdd7(endDate).toDate() : null

    const toNumArr = (s?: string) =>
      String(s ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '')
        .map(Number)
        .filter(Number.isFinite)

    type SortDir = 'asc' | 'desc'
    const sortDir: SortDir = orderBy === 'asc' ? 'asc' : 'desc'
    const sortNullsLast = (dir: SortDir = sortDir): Prisma.SortOrderInput => ({
      sort: dir,
      nulls: 'last'
    })

    /**
     * รองรับคีย์:
     * - concept_point / concept_point_concept_point -> concept_point.concept_point
     * - type_concept_point-> concept_point.type_concept_point.name
     * - group_name        -> group.name
     * - company_name      -> group.company_name
     * - id_name           -> group.id_name
     * - deleted_date      -> deleted_date
     * - create_date       -> create_date
     * - update_date       -> update_date
     * - create_by_account -> create_by_account.first_name
     * - update_by_account -> update_by_account.first_name
     * - id                -> id
     */
    const buildOrderBy = (): Prisma.limit_concept_point_historyOrderByWithRelationInput[] => {
      const secondary: Prisma.limit_concept_point_historyOrderByWithRelationInput = { id: 'desc' }

      switch (orderByName) {
        case 'create_date':
          return [{ create_date: sortNullsLast() }, secondary]
        case 'update_date':
          return [{ update_date: sortNullsLast() }, secondary]
        case 'deleted_date':
          return [{ deleted_date: sortNullsLast() }, secondary]
        case 'id':
          return [{ id: sortDir }]
        case 'concept_point':
        case 'concept_point_concept_point':
          return [{ concept_point: { concept_point: sortNullsLast() } }, secondary]
        case 'group_name':
          return [{ group: { name: sortNullsLast() } }, secondary]
        case 'company_name':
          return [{ group: { company_name: sortNullsLast() } }, secondary]
        case 'id_name':
          return [{ group: { id_name: sortNullsLast() } }, secondary]
        case 'type_concept_point':
          return [{ concept_point: { type_concept_point: { name: sortNullsLast() } } }, secondary]
        case 'create_by':
        case 'create_by_account':
          return [
            { create_by_account: { first_name: sortNullsLast() } },
            { create_by_account: { last_name: sortNullsLast() } },
            secondary
          ]
        case 'deleted_by':
        case 'update_by':
        case 'update_by_account':
          return [
            { update_by_account: { first_name: sortNullsLast() } },
            { update_by_account: { last_name: sortNullsLast() } },
            secondary
          ]
        default:
          return [
            { group: { name: sortNullsLast() } },
            { concept_point: { concept_point: sortNullsLast() } },
            { create_date: sortNullsLast('desc') }
          ]
      }
    }

    const qTrim = q?.trim()
    const qParts = qTrim ? qTrim.split(/\s+/).filter(Boolean) : []

    const qDateFragmentRaw = qTrim ? qTrim.match(/[0-9/]+/)?.[0] : undefined
    const qDateFragment = qDateFragmentRaw && /^[0-9/]{2,}$/.test(qDateFragmentRaw) ? qDateFragmentRaw : undefined
    const qDateLike = qDateFragment && (/^\d{1,2}\/\d{0,2}(\/\d{0,4})?$/.test(qDateFragment) && !qDateFragment.startsWith('/') ? `${qDateFragment}%` : `%${qDateFragment}%`)

    let dateMatchedIds: number[] = []
    if (qDateLike) {
      const rows = await this.prisma.$queryRaw<{ id: number }[]>(
        Prisma.sql`
          SELECT "id"
          FROM "public"."limit_concept_point_history" h
          WHERE
            (
              h."create_date" IS NOT NULL
              AND to_char(((h."create_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'DD/MM/YYYY HH24:MI:SS') ILIKE ${qDateLike}
            )
            OR
            (
              h."update_date" IS NOT NULL
              AND to_char(((h."update_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'DD/MM/YYYY HH24:MI:SS') ILIKE ${qDateLike}
            )
            OR
            (
              h."deleted_date" IS NOT NULL
              AND to_char(((h."deleted_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'DD/MM/YYYY HH24:MI:SS') ILIKE ${qDateLike}
            )
        `
      )
      dateMatchedIds = _.uniq(rows.map((r) => r.id))
    }

    const escapeSearch = (value: string) => {
      return value
        .trim()
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
    }

    const search = q ? escapeSearch(q) : undefined

    const where: Prisma.limit_concept_point_historyWhereInput = {
      ...(q
        ? {
            OR: [
              {
                concept_point: {
                  concept_point: {
                    contains: search,
                    mode: 'insensitive'
                  }
                }
              },
              // {
              //   concept_point: {
              //     type_concept_point: {
              //       name: {
              //         contains: search,
              //         mode: 'insensitive'
              //       }
              //     }
              //   }
              // },
              {
                group: {
                  name: {
                    contains: search,
                    mode: 'insensitive'
                  }
                }
              },
              // {
              //   group: {
              //     company_name: {
              //       contains: search,
              //       mode: 'insensitive'
              //     }
              //   }
              // },
              // {
              //   group: {
              //     id_name: {
              //       contains: search,
              //       mode: 'insensitive'
              //     }
              //   }
              // },
              ...(qParts.length >= 2
                ? [
                    {
                      create_by_account: {
                        AND: qParts.map((token) => ({
                          OR: [
                            {
                              first_name: {
                                contains: token,
                                mode: 'insensitive'
                              }
                            },
                            {
                              last_name: {
                                contains: token,
                                mode: 'insensitive'
                              }
                            }
                          ]
                        }))
                      }
                    },
                    {
                      update_by_account: {
                        AND: qParts.map((token) => ({
                          OR: [
                            {
                              first_name: {
                                contains: token,
                                mode: 'insensitive'
                              }
                            },
                            {
                              last_name: {
                                contains: token,
                                mode: 'insensitive'
                              }
                            }
                          ]
                        }))
                      }
                    }
                  ]
                : []),
              ...(dateMatchedIds.length > 0
                ? [
                    {
                      id: {
                        in: dateMatchedIds
                      }
                    }
                  ]
                : []),
              {
                create_by_account: {
                  first_name: {
                    contains: search,
                    mode: 'insensitive'
                  }
                }
              },
              {
                create_by_account: {
                  last_name: {
                    contains: search,
                    mode: 'insensitive'
                  }
                }
              },
              {
                update_by_account: {
                  first_name: {
                    contains: search,
                    mode: 'insensitive'
                  }
                }
              },
              {
                update_by_account: {
                  last_name: {
                    contains: search,
                    mode: 'insensitive'
                  }
                }
              }
            ]
          }
        : {}),
      ...(groupId && {
        group_id: {
          in: toNumArr(groupId)
        }
      }),
      ...(conceptPointId && {
        concept_point_id: {
          in: toNumArr(conceptPointId)
        }
      }),
      ...(endDate && {
        create_date: {
          gte: endDate_
        }
      }),
      ...(startDate && {
        OR: [
          {
            deleted_date: null
          },
          {
            deleted_date: {
              lte: startDate_
            }
          }
        ]
      })
    }

    const count: number = await this.prisma.limit_concept_point_history.count({
      where: where
    })
    const history : limitConceptPointHistoryRecord[] = await this.prisma.limit_concept_point_history.findMany({
      where: where,
      ...limitConceptPointHistoryPopulate,
      skip: ignorePagination ? undefined : Number(offset),
      take: ignorePagination ? undefined : Number(limit),
      orderBy: buildOrderBy()
    })

    return {
      total: count,
      data: history,
      limit: Number(limit),
      offset: Number(offset)
    }
  }
}
