import {Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
@Injectable()
export class AccountManageBankMasterService {
  constructor(
    private prisma: PrismaService
  ) {}

  async bankingMaster() {
    const bankings =
      await this.prisma.bank_master.findMany(
        {}
      )
    return bankings
  }
}
