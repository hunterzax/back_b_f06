import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {EmailClientService} from 'src/grpc/email-service.service'
import {
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import {writeReq} from 'src/common/utils/write-req.util'

dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class AccountManageTandCService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private readonly emailClientService: EmailClientService
  ) {}

  async accountLocalTandC(
    userId: any
  ) {
    const nowAt =
      getTodayNowAdd7().toDate()

    const tacNow =
      await this.tAndCOn()

    const account =
      await this.prisma.account.update(
        {
          where: {
            id: Number(userId)
          },
          data: {
            f_t_and_c: true,
            login_flag: true,
            listen_login_date:
              nowAt,
            t_a_c_url:
              tacNow?.url
          }
        }
      )

    return account
  }

  async tAndCOn() {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()
    const tAndCOn =
      await this.prisma.t_and_c.findFirst(
        {
          where: {
            AND: [
              {
                start_date: {
                  lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                }
              },
              {
                OR: [
                  {
                    end_date:
                      null
                  }, // ถ้า end_date เป็น null
                  {
                    end_date:
                      {
                        gte: todayStart
                      }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          },
          orderBy: {
            create_date:
              'desc'
          }
        }
      )
    return tAndCOn
  }

  async tAndC() {
    const roleMaster =
      await this.prisma.t_and_c.findMany(
        {
          where: {
            active: true
          },
          orderBy: {
            id: 'asc'
          }
        }
      )
    return roleMaster
  }

  async tAndCOne(id: any) {
    const roleMaster =
      await this.prisma.t_and_c.findFirst(
        {
          where: {
            id: Number(id)
          },
          orderBy: {
            id: 'asc'
          }
        }
      )
    return roleMaster
  }

  async tAndCCreact(
    payload: any
  ) {
    try {
      const tAndCCreact =
        await this.prisma.t_and_c.create(
          {
            data: {
              ...payload,
              active: true,
              used: false
            }
          }
        )
      return tAndCCreact
    } catch (error) {
      if (
        error.code ===
          'P2002' &&
        error.meta?.target.includes(
          'name'
        )
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            key: 'name',
            error:
              't_and_c name already exists. Please choose another name.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      throw new HttpException(
        {
          status:
            HttpStatus.INTERNAL_SERVER_ERROR,
          error:
            'Internal server error'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async tAndCUse(id: any) {
    try {
      const tAndCUse =
        await this.prisma.t_and_c.update(
          {
            where: {
              id: Number(id)
            },
            data: {used: true}
          }
        )

      await this.prisma.t_and_c.updateMany(
        {
          where: {
            id: {
              not: Number(id)
            }
          },
          data: {used: false}
        }
      )

      return tAndCUse
    } catch (error) {
      if (
        error.code ===
          'P2002' &&
        error.meta?.target.includes(
          'name'
        )
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            key: 'name',
            error:
              't_and_c name already exists. Please choose another name.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      throw new HttpException(
        {
          status:
            HttpStatus.INTERNAL_SERVER_ERROR,
          error:
            'Internal server error'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
