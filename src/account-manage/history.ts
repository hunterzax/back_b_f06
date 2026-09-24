import {Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

@Injectable()
export class AccountManageHistoryService {
  constructor(
    private prisma: PrismaService
  ) {}

  async history(
    payload: any,
    id: any
  ) {
    const newObjs =
      payload?.method ===
      'all'
        ? {
            type: payload?.type,
            id_value:
              Number(id)
          }
        : {
            ...payload,
            id_value:
              Number(id)
          }
    const history =
      await this.prisma.history.findMany(
        {
          where: {...newObjs},
          orderBy: {
            id: 'desc'
          }
        }
      )
    const newHistory =
      await history.map(
        (e: any) => {
          e['reqUser'] =
            JSON.parse(
              e['reqUser']
            ) || null
          e['value'] =
            JSON.parse(
              e['value']
            ) || null
          return e
        }
      )
    return history
  }
}
