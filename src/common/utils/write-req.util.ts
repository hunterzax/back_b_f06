import {PrismaService} from 'prisma/prisma.service'
import {getTodayNowAdd7} from './date.util'

export async function useReqs(
  req: any
) {
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

export async function writeReq(
  prisma: PrismaService,
  module: any,
  reqUser: any,
  type: any,
  method: any,
  value: any
) {
  const usedData = {
    reqUser: !!reqUser
      ? JSON.stringify(
          await useReqs(
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
    module: module, //'DAM'
    ...(!!reqUser?.user
      ?.sub && {
      create_by_account: {
        connect: {
          id: Number(
            reqUser?.user?.sub
          )
        }
      }
    })
  }
  await prisma.history.create(
    {
      data: usedData
    }
  )
  return true
}
