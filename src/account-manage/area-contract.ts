import {Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
@Injectable()
export class AccountManageAreaContractService {
  constructor(
    private prisma: PrismaService
  ) {}

  async areaContract() {
    const areaContract =
      await this.prisma.area.findMany(
        {
          include: {
            contract_point: true,
            create_by_account:
              {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },
            update_by_account:
              {
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
    return areaContract
  }
}
