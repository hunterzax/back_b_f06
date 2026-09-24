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
import {getTodayNowAdd7} from 'src/common/utils/date.util'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class AssetCustomerTypeService {
  constructor(
    private prisma: PrismaService
  ) {}

  customerType() {
    return this.prisma.customer_type.findMany(
      {
        include: {
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
        orderBy: {
          id: 'desc'
        }
      }
    )
  }

  customerTypeOnce(id: any) {
    return this.prisma.customer_type.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
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

  async customerTypeCreate(
    payload: any,
    userId: any
  ) {
    // try {
    const {
      entry_exit_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const ckseviden =
      await this.prisma.customer_type.findFirst(
        {
          where: {
            customer_Type_id_default:
              dataWithout?.name,
            entry_exit_id:
              Number(
                entry_exit_id
              )
          }
        }
      )

    if (!!ckseviden) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'customer type id is already exist'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const cks =
      await this.prisma.customer_type.findFirst(
        {
          where: {
            name: dataWithout?.name,
            entry_exit_id:
              Number(
                entry_exit_id
              )
          }
        }
      )

    if (!!cks) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'customer type is already exist'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const nominationPointCreate =
      await this.prisma.customer_type.create(
        {
          data: {
            ...dataWithout,
            entry_exit: {
              connect: {
                id:
                  entry_exit_id ||
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
              },
            customer_Type_id_default:
              dataWithout?.name ||
              null
          }
        }
      )
    return nominationPointCreate
    // } catch (error) {
    //   if (error.code === 'P2002' && error.meta?.target.includes('name')) {
    //     throw new HttpException(
    //       {
    //         status: HttpStatus.BAD_REQUEST,
    //         key: 'name',
    //         error:
    //           'contract type name already exists. Please choose another name.',
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
}
