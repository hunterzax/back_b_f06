import {PrismaService} from 'prisma/prisma.service'
import {getTodayNowAdd7} from './date.util'
import {Prisma} from '@prisma/client'

const getGroupbyUserIdPopulate =
  {
    select: {
      id: true,
      user_type: {
        select: {
          id: true
        }
      }
    }
  }
type queryGroupByUserIdWithRelations =
  Prisma.groupGetPayload<
    typeof getGroupbyUserIdPopulate
  >

export async function getGroupByUserId(
  prisma: PrismaService,
  userId: any,
  atDate?: any
): Promise<
  queryGroupByUserIdWithRelations[]
> {
  try {
    const date =
      getTodayNowAdd7(
        atDate
      ).toDate()
    const group: queryGroupByUserIdWithRelations[] =
      await prisma.group.findMany(
        {
          where: {
            OR: [
              {
                end_date: null
              }, // No end date means still active
              {
                end_date: {
                  gt: date
                }
              } // End date is after target date
            ],
            start_date: {
              lte: date
            }, // Start date is before or on target date
            account_manage: {
              some: {
                account_id:
                  Number(
                    userId
                  )
              }
            }
          },
          ...getGroupbyUserIdPopulate
        }
      )

    return group
  } catch (error) {
    return []
  }
}

export async function getGroupData(
  prisma: PrismaService,
  userId: any,
  atDate?: any
) {
  try {
    const group: queryGroupByUserIdWithRelations[] =
      await getGroupByUserId(
        prisma,
        userId,
        atDate
      )

    if (
      group.some(
        (group) =>
          group.user_type
            .id === 1
      )
    ) {
      // ผู้ดูแลระบบ
      return {
        group: group.filter(
          (group) =>
            group.user_type
              .id === 1
        ),
        isShipper: false,
        isTSO: false,
        isOther: false,
        isAdmin: true
      }
    } else if (
      group.some(
        (group) =>
          group.user_type
            .id === 2
      )
    ) {
      // TSO
      return {
        group: group.filter(
          (group) =>
            group.user_type
              .id === 2
        ),
        isShipper: false,
        isTSO: true,
        isOther: false,
        isAdmin: false
      }
    } else if (
      group.some(
        (group) =>
          group.user_type
            .id === 3
      )
    ) {
      // Shipper
      return {
        group: group.filter(
          (group) =>
            group.user_type
              .id === 3
        ),
        isShipper: true,
        isTSO: false,
        isOther: false,
        isAdmin: false
      }
    } else {
      // Other
      return {
        group: group.filter(
          (group) =>
            group.user_type
              .id === 4
        ),
        isShipper: false,
        isTSO: false,
        isOther: true,
        isAdmin: false
      }
    }
  } catch (error) {
    return {
      isShipper: false,
      isTSO: false,
      isOther: false,
      isAdmin: false
    }
  }
}
