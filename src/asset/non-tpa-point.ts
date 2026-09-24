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
  getTodayNowAdd7
} from 'src/common/utils/date.util'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class AssetNonTpaPointService {
  constructor(
    private prisma: PrismaService
  ) {}

  nonTpaPoint() {
    return this.prisma.non_tpa_point.findMany(
      {
        include: {
          area: true,
          nomination_point: true,
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

  nonTpaPointOnce(id: any) {
    return this.prisma.non_tpa_point.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          area: true,
          nomination_point: true,
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

  async nonTpaPointCreate(
    payload: any,
    userId: any
  ) {
    // try {
    const {
      area_id,
      nomination_point_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    //

    const checkSE =
      await this.prisma.non_tpa_point.findMany(
        {
          where: {
            // id: {
            //   not: Number(id),
            // },
            non_tpa_point_name:
              dataWithout?.non_tpa_point_name
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
            'Non-TPA point name already exitsts. Please choose another Non-TPA point name.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const nonTpaPointCreate =
      await this.prisma.non_tpa_point.create(
        {
          data: {
            ...dataWithout,
            area: {
              connect: {
                id:
                  area_id ||
                  null
              }
            },
            nomination_point:
              {
                connect: {
                  id:
                    nomination_point_id ||
                    null
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
    return nonTpaPointCreate
    // } catch (error) {
    //   if (
    //     error.code === 'P2002' &&
    //     error.meta?.target.includes('non_tpa_point_name')
    //   ) {
    //     throw new HttpException(
    //       {
    //         status: HttpStatus.BAD_REQUEST,
    //         key: 'non_tpa_point_name',
    //         error:
    //           'Non-TPA point name already exitsts. Please choose another Non-TPA point name.',
    //       },
    //       HttpStatus.BAD_REQUEST,
    //     );
    //   }
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.INTERNAL_SERVER_ERROR,
    //       error: 'Internal server error',
    //     },
    //     HttpStatus.INTERNAL_SERVER_ERROR,
    //   );
    // }
  }

  async nonTpaPointEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      area_id,
      nomination_point_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const checkSE =
      await this.prisma.non_tpa_point.findMany(
        {
          where: {
            id: {
              not: Number(id)
            },
            non_tpa_point_name:
              dataWithout?.non_tpa_point_name
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
            'Non-TPA point name already exitsts. Please choose another Non-TPA point name.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const nominationPointEdit =
      await this.prisma.non_tpa_point.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            area: {
              connect: {
                id:
                  area_id ||
                  null
              }
            },
            nomination_point:
              {
                connect: {
                  id:
                    nomination_point_id ||
                    null
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
    return nominationPointEdit
  }
}
