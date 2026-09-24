import {Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

@Injectable()
export class AccountManageUserTypeService {
  constructor(
    private prisma: PrismaService
  ) {}

  async userType() {
    const userType =
      await this.prisma.user_type.findMany()
    return userType
  }

  async userTypeN() {
    const userTypeN =
      await this.prisma.user_type.findMany(
        {
          where: {
            id: {not: 1}
          },
          orderBy: {
            id: 'asc'
          }
        }
      )
    return userTypeN
  }

  async accountUserType(
    userId: any
  ) {
    try {
      const accountUserType =
        await this.prisma.user_type.findMany(
          {
            where: {
              account_manage:
                {
                  some: {
                    account: {
                      id: Number(
                        userId
                      )
                    }
                  }
                }
            },
            orderBy: {
              id: 'asc'
            }
          }
        )

      return accountUserType
    } catch (error) {
      return []
    }
  }
}
