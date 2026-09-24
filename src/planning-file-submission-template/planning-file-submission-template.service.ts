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
import * as XLSX from 'xlsx-js-style'
import * as XlsxPopulate from 'xlsx-populate'
import * as fs from 'fs'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {
  checkStartEndBoom,
  getTodayNowAdd7
} from 'src/common/utils/date.util'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)

@Injectable()
export class PlanningFileSubmissionTemplateService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async useReqs(req: any) {
    const ip =
      req.headers[
        'x-forwarded-for'
      ] || req.ip
    return {
      ip: ip,
      sub: req?.user?.sub,
      first_name:
        req?.user?.first_name,
      last_name:
        req?.user?.last_name,
      username:
        req?.user?.username,
      originalUrl:
        req?.originalUrl
    }
  }

  async writeReq(
    reqUser: any,
    type: any,
    method: any,
    value: any
  ) {
    const usedData = {
      reqUser: !!reqUser
        ? JSON.stringify(
            await this.useReqs(
              reqUser
            )
          )
        : null,
      type: type,
      method: method,
      value:
        JSON.stringify(value),
      id_value: value?.id,
      create_date:
        getTodayNowAdd7().toDate(),
      create_date_num:
        getTodayNowAdd7().unix(),
      module: 'PLANNING',
      ...(!!reqUser?.user
        ?.sub && {
        create_by_account: {
          connect: {
            id: Number(
              reqUser?.user
                ?.sub
            ) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      })
    }
    await this.prisma.history.create(
      {
        data: usedData
      }
    )
    return true
  }

  findOnce(id: any) {
    return this.prisma.planning_file_submission_template.findFirst(
      {
        where: {
          id: Number(id)
        },
        include: {
          term_type: true,
          group: true,
          planning_file_submission_template_nom:
            {
              include: {
                nomination_point: true
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

  findAll() {
    return this.prisma.planning_file_submission_template.findMany(
      {
        include: {
          term_type: true,
          group: true,
          planning_file_submission_template_nom:
            {
              include: {
                nomination_point: true
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

  shipperGroup() {
    return this.prisma.group.findMany(
      {
        select: {
          id: true,
          name: true
        },
        where: {
          user_type_id: 3
        },
        orderBy: {id: 'desc'}
      }
    )
  }

  termType() {
    return this.prisma.term_type.findMany(
      {
        select: {
          id: true,
          name: true
        },
        where: {
          id: {not: 4}
        },
        orderBy: {id: 'asc'}
      }
    )
  }

  nominationPoint() {
    return this.prisma.nomination_point.findMany(
      {
        // select:{
        //   id:true,
        //   name:true,
        // },
        where: {
          // ....
        },
        orderBy: {id: 'asc'}
      }
    )
  }

  async create(
    payload: any,
    userId: any
  ) {
    const {
      term_type_id,
      group_id,
      nomination_point,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const group = !!group_id
      ? {id: group_id}
      : await this.prisma.group.findFirst(
          {
            where: {
              account_manage:
                {
                  some: {
                    account_id:
                      Number(
                        userId
                      )
                  }
                }
            }
          }
        )

    const checkSE =
      await this.prisma.planning_file_submission_template.findMany(
        {
          where: {
            term_type_id:
              term_type_id,
            group_id:
              group?.id
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
      let nowCre =
        getTodayNowAdd7()
      const create =
        await this.prisma.planning_file_submission_template.create(
          {
            data: {
              ...(!!term_type_id && {
                term_type: {
                  connect: {
                    id: term_type_id
                  }
                }
              }),
              group: {
                connect: {
                  id: group?.id
                }
              },
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
                nowCre.toDate(),
              create_date_num:
                nowCre.unix(),
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
      let nomArr: any = []
      for (
        let i = 0;
        i <
        nomination_point.length;
        i++
      ) {
        nomArr.push({
          planning_file_submission_template_id:
            create?.id,
          nomination_point_id:
            nomination_point[
              i
            ],

          create_by:
            Number(userId),
          create_date:
            nowCre.toDate(),
          create_date_num:
            nowCre.unix()
        })
      }
      await this.prisma.planning_file_submission_template_nom.createMany(
        {
          data: nomArr
        }
      )

      return create
    }
  }

  async edit(
    payload: any,
    id: any,
    userId: any
  ) {
    const {
      term_type_id,
      group_id,
      nomination_point,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const group = !!group_id
      ? {id: group_id}
      : await this.prisma.group.findFirst(
          {
            where: {
              account_manage:
                {
                  some: {
                    account_id:
                      Number(
                        userId
                      )
                  }
                }
            }
          }
        )

    const checkSE =
      await this.prisma.planning_file_submission_template.findMany(
        {
          where: {
            id: {
              not: Number(id)
            },
            term_type_id:
              term_type_id,
            group_id:
              group?.id
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
      let nowCre =
        getTodayNowAdd7()
      const create =
        await this.prisma.planning_file_submission_template.update(
          {
            where: {
              id: Number(id)
            },
            data: {
              ...(!!term_type_id && {
                term_type: {
                  connect: {
                    id: term_type_id
                  }
                }
              }),
              group: {
                connect: {
                  id: group?.id
                }
              },
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
                nowCre.toDate(),
              update_date_num:
                nowCre.unix(),
              update_by_account:
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
      await this.prisma.planning_file_submission_template_nom.deleteMany(
        {
          where: {
            planning_file_submission_template_id:
              Number(id)
          }
        }
      )
      let nomArr: any = []
      for (
        let i = 0;
        i <
        nomination_point.length;
        i++
      ) {
        nomArr.push({
          planning_file_submission_template_id:
            create?.id,
          nomination_point_id:
            nomination_point[
              i
            ],
          // ...(!!create?.id && {
          //   planning_file_submission_template: {
          //     connect: {
          //       id: create?.id,
          //     },
          //   },
          // }),
          // nomination_point: {
          //   connect: {
          //     id: nomination_point[i],
          //   },
          // },

          // active: true,
          create_by:
            Number(userId),
          create_date:
            nowCre.toDate(),
          create_date_num:
            nowCre.unix()
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        })
      }
      await this.prisma.planning_file_submission_template_nom.createMany(
        {
          data: nomArr
        }
      )

      return create
    }
  }
}
