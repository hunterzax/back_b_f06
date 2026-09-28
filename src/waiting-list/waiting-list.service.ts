import {Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {AllocationService} from 'src/allocation/allocation.service'
import {getTodayEndYYYYMMDDDfaultAdd7, getTodayNowAdd7, getTodayStartYYYYMMDDDfaultAdd7} from 'src/common/utils/date.util'
import {groupDataAlloManage} from 'src/common/utils/allocation.util'
import {EventService} from 'src/event/event.service'
import {
  countWaitingDocuments,
  FINISHED_STATUS_IDS,
  getAllocationDateRange,
  getEventDateRange,
  CAPACITY_CONTRACT,
  RELEASE_CAPACITY,
  NOMINATION,
  NOMINATION_ADJUSTMENT,
  ALLOCATION_REVIEW,
  ALLOCATION_MANAGEMENT,
  EVENT_OFFSPEC_GAS,
  EVENT_EMERGENCY_DIFFICULT_DAY,
  EVENT_OF_IF,
  WAITING_LIST_TARGET_MENUS,
  NOMINATION_DAILY_MANAGEMENT,
  NOMINATION_QUERY,
  NOMINATION_WEEKLY_MANAGEMENT,
  CAPACITY_CONTRACT_MANAGEMENT,
  CAPACITY_CONTRACT_LIST,
  CAPACITY_CONTRACT_MANAGEMENT_SAVED,
  CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED,
  CAPACITY_CONTRACT_LIST_SAVED,
  CAPACITY_CONTRACT_LIST_CONFIRMED,
  EVENT_OFFSPEC_GAS_ACKNOWLEDGE,
  EVENT_EMERGENCY_DIFFICULT_DAY_ACKNOWLEDGE,
  EVENT_OF_IF_ACKNOWLEDGE,
} from 'src/common/utils/waiting-list.util'
import {Prisma} from '@prisma/client'
import {getGroupData} from 'src/common/utils/group.util'

@Injectable()
export class WaitingListService {
  constructor(
    private prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly eventService: EventService
  ) {}

  // Helper method to get event data with pagination
  private async getEventData(eventMethod: 'offspecGasAll' | 'emerAll' | 'ofoAll', eventDateFrom: string, eventDateTo: string, userId: any) {
    let total = 1
    let result: any = {}

    for (let i = 0; i < 2; i++) {
      result = await this.eventService[eventMethod](
        {
          eventCode: '',
          // eventDateFrom,
          // eventDateTo,
          EventStatus: '1',
          offset: '0',
          limit: `${total}`
        },
        userId
      )
      total = result?.total ?? 1
    }

    return result
  }

  async getMenuConfigsByUserIdAndMenuId(userId: any, menuId: number[], atDate?: any) {
    try {
      const date = getTodayNowAdd7(atDate).toDate()
      const menuConfigs = await this.prisma.menus_config.findMany({
        where: {
          menus_id: {
            in: menuId
          },
          role: {
            account_role: {
              some: {
                account_manage: {
                  account_id: Number(userId)
                }
              }
            },
            start_date: {
              lte: date
            },
            OR: [
              {
                end_date: null
              },
              {
                end_date: {
                  gt: date
                }
              }
            ]
          },
          // f_view: 1,
          b_manage: true
        },
        include: {
          menus: true
        }
      })

      return menuConfigs
    } catch (error) {
      return []
    }
  }

  async getWaitingListMenu({userId, targetMenus, atDate}: {userId: any; targetMenus: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    try {
      let menu: WAITING_LIST_TARGET_MENUS[] = []

      if (targetMenus.includes(CAPACITY_CONTRACT)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [50], atDate)).length > 0) {
          menu.push(CAPACITY_CONTRACT_MANAGEMENT)
          menu.push(CAPACITY_CONTRACT_MANAGEMENT_SAVED)
          menu.push(CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED)
        }
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [53], atDate)).length > 0) {
          menu.push(CAPACITY_CONTRACT_LIST)
          menu.push(CAPACITY_CONTRACT_LIST_SAVED)
          menu.push(CAPACITY_CONTRACT_LIST_CONFIRMED)
        }
      }

      if (targetMenus.includes(RELEASE_CAPACITY)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [60], atDate)).length > 0) {
          menu.push(RELEASE_CAPACITY)
        }
      }

      if (targetMenus.includes(NOMINATION)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [64], atDate)).length > 0) {
          menu.push(NOMINATION_QUERY)
        }
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [65], atDate)).length > 0) {
          menu.push(NOMINATION_DAILY_MANAGEMENT)
        }
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [66], atDate)).length > 0) {
          menu.push(NOMINATION_WEEKLY_MANAGEMENT)
        }
      }

      if (targetMenus.includes(NOMINATION_ADJUSTMENT)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [66], atDate)).length > 0) {
          menu.push(NOMINATION_ADJUSTMENT)
        }
      }

      if (targetMenus.includes(ALLOCATION_REVIEW)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [81], atDate)).length > 0) {
          menu.push(ALLOCATION_REVIEW)
        }
      }

      if (targetMenus.includes(ALLOCATION_MANAGEMENT)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [82], atDate)).length > 0) {
          menu.push(ALLOCATION_MANAGEMENT)
        }
      }

      if (targetMenus.includes(EVENT_OFFSPEC_GAS)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [107], atDate)).length > 0) {
          menu.push(EVENT_OFFSPEC_GAS)
        }
      }

      if (targetMenus.includes(EVENT_EMERGENCY_DIFFICULT_DAY)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [106], atDate)).length > 0) {
          menu.push(EVENT_EMERGENCY_DIFFICULT_DAY)
        }
      }

      if (targetMenus.includes(EVENT_OF_IF)) {
        if ((await this.getMenuConfigsByUserIdAndMenuId(userId, [1013], atDate)).length > 0) {
          menu.push(EVENT_OF_IF)
        }
      }

      return menu
    } catch (error) {
      return []
    }
  }

  async getAllocationFromAllocationService(userId: any, shipper: string[], startDate?: string, endDate?: string) {
    try {
      let result = await this.allocationService.allocationManagementFromAllocationReport(
        {
          start_date: startDate,
          end_date: endDate,
          skip: 0,
          limit: 0,
          ignoreDetail: true
        },
        userId
      )

      if (shipper.length > 0) {
        result = result.filter((f: any) => shipper.includes(f?.shipper))
      }

      return result
    } catch (error) {
      return []
    }
  }

  async getAllocationReviewData({userId, shipper, startDate, endDate, data, menu, atDate}: {userId: any; shipper: string[]; startDate?: string; endDate?: string; data?: any[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    if (menu.includes(ALLOCATION_REVIEW)) {
      const {startDate: start, endDate: end} = getAllocationDateRange(atDate, startDate, endDate)
      console.log('userId : ', userId);
      try {
        // const result = data || await this.getAllocationFromAllocationService(
        //   userId,
        //   shipper,
        //   startDate ?? start,
        //   endDate ?? end,
        // );

        const startD = getTodayStartYYYYMMDDDfaultAdd7(start).toDate()
        const endD = getTodayEndYYYYMMDDDfaultAdd7(end).toDate()

        const group_ = await this.prisma.group.findFirst({
          where:{
            account_manage:{
              some:{
                account_id: Number(userId)
              }
            },
          },
        })

        const remainingTasks = (group_?.user_type_id === 3 || group_?.user_type_id === 4) ? 
        await this.prisma.allocation_management.count({
          where: {
            gas_day: {
              gte: startD,
              lte: endD
            },
            allocation_status_id: 2,
            shipper_name_text: group_?.id_name
          }
        }) : 
        await this.prisma.allocation_management.count({
          where: {
            gas_day: {
              gte: startD,
              lte: endD
            },
            allocation_status_id: 2,
            
          }
        })

        return {
          startDate: start,
          endDate: end,
          // remainingTasks: result.filter((f: any) => f?.allocation_status?.id === 2).length,
          remainingTasks: remainingTasks,
          status: 'Shipper Reviewed',
          menuId: 81
        }
      } catch (error) {
        return {
          startDate: start,
          endDate: end,
          remainingTasks: 0,
          status: 'Shipper Reviewed',
          menuId: 81
        }
      }
    } else {
      return undefined
    }
  }

  async getAllocationManagementData({userId, shipper, startDate, endDate, data, menu, atDate}: {userId: any; shipper: string[]; startDate?: string; endDate?: string; data?: any[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    if (menu.includes(ALLOCATION_MANAGEMENT)) {
      const {startDate: start, endDate: end} = getAllocationDateRange(atDate, startDate, endDate)

      try {
        let result = data || (await this.getAllocationFromAllocationService(userId, shipper, startDate ?? start, endDate ?? end))
        result = groupDataAlloManage(result)

        return {
          startDate: start,
          endDate: end,
          remainingTasks: result.filter((f: any) => f?.priorityStatus === 2).length,
          status: 'Shipper Reviewed',
          menuId: 82
        }
      } catch (error) {
        return {
          startDate: start,
          endDate: end,
          remainingTasks: 0,
          status: 'Shipper Reviewed',
          menuId: 82
        }
      }
    } else {
      return undefined
      // return {
      //     startDate: null,
      //     endDate: null,
      //     remainingTasks: 0,
      //     status: 'Shipper Reviewed'
      //   };
    }
  }

  async getAllocationManagementDataV2({userId, shipper, startDate, endDate, data, menu, atDate}: {userId: any; shipper: string[]; startDate?: string; endDate?: string; data?: any[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    if (menu.includes(ALLOCATION_MANAGEMENT)) {
      const {startDate: start, endDate: end} = getAllocationDateRange(atDate, startDate, endDate)

      try {
        const startD = getTodayStartYYYYMMDDDfaultAdd7(start).toDate()
        const endD = getTodayEndYYYYMMDDDfaultAdd7(end).toDate()

        const group_ = await this.prisma.group.findFirst({
          where:{
            account_manage:{
              some:{
                account_id: Number(userId)
              }
            },
          },
        })

        const allocationNanagement = (group_?.user_type_id === 3 || group_?.user_type_id === 4) ? 
        await this.prisma.allocation_management.findMany({
          where: {
            gas_day: {
              gte: startD,
              lte: endD
            },
            shipper_name_text: group_?.id_name
          }
        }) : 
        await this.prisma.allocation_management.findMany({
          where: {
            gas_day: {
              gte: startD,
              lte: endD
            },
          }
        })

        const formatAllocationManagement = allocationNanagement.map(item => {
          return {
            gas_day: item.gas_day_text,
            point: item.point_text,
            entry_exit_obj: {
              name: item.entry_exit_text
            },
            allocation_status: {
              name: item.allocation_status_id
            },
          }
        })

        const result = groupDataAlloManage(formatAllocationManagement)

        return {
          startDate: start,
          endDate: end,
          remainingTasks: result.filter((f: any) => f?.priorityStatus === 2).length,
          status: 'Shipper Reviewed',
          menuId: 82
        }
      } catch (error) {
        return {
          startDate: start,
          endDate: end,
          remainingTasks: 0,
          status: 'Shipper Reviewed',
          menuId: 82
        }
      }
    } else {
      return undefined
    }
  }

  async getOffspecGasData({userId, shipper, tso, menu, atDate}: {userId: any; shipper: number[]; tso: number[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    if (menu.includes(EVENT_OFFSPEC_GAS)) {
      const {eventDateFrom, eventDateTo} = getEventDateRange(atDate)

      try {
        const result = await this.getEventData('offspecGasAll', eventDateFrom, eventDateTo, userId)

        let count = 0

        result?.data?.forEach((item: any) => {
          // Document1 - TSO specific
          if (item?.document1 && !FINISHED_STATUS_IDS.includes(item.document1?.event_doc_status?.id)) {
            count += countWaitingDocuments([item.document1], tso)
          }

          // Document2 - Shipper specific
          count += countWaitingDocuments(item?.document2, shipper)

          // Document3 - Shipper specific
          count += countWaitingDocuments(item?.document3, shipper)
        })

        return {
          // startDate: eventDateFrom,
          // endDate: eventDateTo,
          remainingTasks: count,
          status: 'Opened',
          menuId: 107
        }
      } catch (error) {
        return {
          // startDate: eventDateFrom,
          // endDate: eventDateTo,
          remainingTasks: 0,
          status: 'Opened',
          menuId: 107
        }
      }
    } else {
      return undefined
    }
  }

  async getEmerData({userId, shipper, tso, menu, atDate}: {userId: any; shipper: number[]; tso: number[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    const {eventDateFrom, eventDateTo} = getEventDateRange(atDate)

    if (menu.includes(EVENT_EMERGENCY_DIFFICULT_DAY)) {
      try {
        const result = await this.getEventData('emerAll', eventDateFrom, eventDateTo, userId)

        let count = 0

        result?.data?.forEach((item: any) => {
          // Document39 - Shipper specific
          count += countWaitingDocuments(item?.document39, shipper)

          // Document41 - Shipper specific
          count += countWaitingDocuments(item?.document41, shipper)

          // Document5 - Shipper specific
          count += countWaitingDocuments(item?.document5, shipper)

          // Document6 - Shipper specific
          count += countWaitingDocuments(item?.document6, shipper)
        })

        return {
          // startDate: eventDateFrom,
          // endDate: eventDateTo,
          remainingTasks: count,
          status: 'Opened',
          menuId: 106
        }
      } catch (error) {
        return {
          // startDate: eventDateFrom,
          // endDate: eventDateTo,
          remainingTasks: 0,
          status: 'Opened',
          menuId: 106
        }
      }
    } else {
      return undefined
    }
  }

  async getOfoData({userId, shipper, tso, menu, atDate}: {userId: any; shipper: number[]; tso: number[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    const {eventDateFrom, eventDateTo} = getEventDateRange(atDate)

    if (menu.includes(EVENT_OF_IF)) {
      try {
        const result = await this.getEventData('ofoAll', eventDateFrom, eventDateTo, userId)

        let count = 0

        result?.data?.forEach((item: any) => {
          // Document7 - Shipper specific
          count += countWaitingDocuments(item?.document7, shipper)

          // Document8 - Shipper specific
          count += countWaitingDocuments(item?.document8, shipper)
        })

        return {
          // startDate: eventDateFrom,
          // endDate: eventDateTo,
          remainingTasks: count,
          status: 'Opened',
          menuId: 1013
        }
      } catch (error) {
        return {
          // startDate: eventDateFrom,
          // endDate: eventDateTo,
          remainingTasks: 0,
          status: 'Opened',
          menuId: 1013
        }
      }
    } else {
      return undefined
    }
  }
  
  // เสร็จ
  async getOffspecGasDataAcknowledge({userId, shipper, tso, menu, atDate}: {userId: any; shipper: number[]; tso: number[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    if (menu.includes(EVENT_OFFSPEC_GAS)) {
     
      try {
        let count = 0
         const group_ = await this.prisma.group.findFirst({
          where:{
            account_manage:{
              some:{
                account_id: Number(userId)
              }
            }
          },
        })
        const wl = (group_?.user_type_id === 1 || group_?.user_type_id === 2) ? await this.prisma.event_runnumber.findMany({
          where:{

          },
          include:{
            event_document: true,
          },
        }) : await this.prisma.event_runnumber.findMany({
          where:{

          },
          include:{
            event_document: {
              where:{
                group_id: group_?.id
              }
            },
          },
        })

        const wlDoc = wl?.map((e:any) => {
          const doc1 = e?.event_document?.filter((f:any) => f?.event_doc_master_id === 1)?.find((f:any) => f?.event_doc_status_id === 2) ? true : false // event_doc_status_id 2 รอ Acknownlet
          const doc2 = e?.event_document?.filter((f:any) => f?.event_doc_master_id === 2)?.find((f:any) => f?.event_doc_status_id === 2 && (f?.user_type_id === 3 || f?.user_type_id === 4)) ? true : false // event_doc_status_id 2 รอ Acknownlet
          const doc3 = e?.event_document?.filter((f:any) => f?.event_doc_master_id === 3)?.find((f:any) => f?.event_doc_status_id === 2 && (f?.user_type_id === 3 || f?.user_type_id === 4)) ? true : false // event_doc_status_id 2 รอ Acknownlet
          // มี doc ไหน true ให้นับ 1 ทั้ง event number
          return (doc1 || doc2 || doc3) ? true : false
        })

        count = wlDoc?.filter((f:any) => f)?.length

        return {
          remainingTasks: count,
          status: 'Acknowledge',
          menuId: 107
        }
      } catch (error) {
        return {
          remainingTasks: 0,
          status: 'Acknowledge',
          menuId: 107
        }
      }
    } else {
      return undefined
    }
  }

  // เสร็จ
  async getEmerDataAcknowledge({userId, shipper, tso, menu, atDate}: {userId: any; shipper: number[]; tso: number[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
   
    if (menu.includes(EVENT_EMERGENCY_DIFFICULT_DAY)) {
      try {
        let count = 0
         const group_ = await this.prisma.group.findFirst({
          where:{
            account_manage:{
              some:{
                account_id: Number(userId)
              }
            }
          },
        })
        const wl = (group_?.user_type_id === 1 || group_?.user_type_id === 2) ? await this.prisma.event_runnumber_emer.findMany({
          where:{

          },
          include:{
            event_document_emer: true,
          },
        }) : await this.prisma.event_runnumber_emer.findMany({
          where:{

          },
          include:{
            event_document_emer: {
              where:{
                group_id: group_?.id,
              }
            },
          },
        })
      
        const wlDoc = wl?.map((e:any) => {
          const doc39 = e?.event_document_emer?.filter((f:any) => f?.event_doc_master_id === 309)?.find((f:any) => f?.event_doc_status_id === 2 && (f?.user_type_id === 3 || f?.user_type_id === 4)) ? true : false // event_doc_status_id 2 รอ Acknownlet
          const doc41 = e?.event_document_emer?.filter((f:any) => f?.event_doc_master_id === 41)?.find((f:any) => f?.event_doc_status_id === 2 && (f?.user_type_id === 3 || f?.user_type_id === 4)) ? true : false // event_doc_status_id 2 รอ Acknownlet
          const doc5 = e?.event_document_emer?.filter((f:any) => f?.event_doc_master_id === 5)?.find((f:any) => f?.event_doc_status_id === 2 && (f?.user_type_id === 3 || f?.user_type_id === 4)) ? true : false // event_doc_status_id 2 รอ Acknownlet
          const doc6 = e?.event_document_emer?.filter((f:any) => f?.event_doc_master_id === 6)?.find((f:any) => f?.event_doc_status_id === 2 && (f?.user_type_id === 3 || f?.user_type_id === 4)) ? true : false // event_doc_status_id 2 รอ Acknownlet
          // มี doc ไหน true ให้นับ 1 ทั้ง event number
          return (doc39 || doc41 || doc5 || doc6) ? true : false
        })
        count = wlDoc?.filter((f:any) => f)?.length
        return {
          remainingTasks: count,
          status: 'Acknowledge',
          menuId: 106
        }
      } catch (error) {
        return {
          remainingTasks: 0,
          status: 'Acknowledge',
          menuId: 106
        }
      }
    } else {
      return undefined
    }
  }

  // เสร็จ
  async getOfoDataAcknowledge({userId, shipper, tso, menu, atDate}: {userId: any; shipper: number[]; tso: number[]; menu: WAITING_LIST_TARGET_MENUS[]; atDate?: any}) {
    
    if (menu.includes(EVENT_OF_IF)) {
      try {
        let count = 0
        const group_ = await this.prisma.group.findFirst({
          where:{
            account_manage:{
              some:{
                account_id: Number(userId)
              }
            }
          },
        })
        const wl = (group_?.user_type_id === 1 || group_?.user_type_id === 2) ? await this.prisma.event_runnumber_ofo.findMany({
          where:{

          },
          include:{
            event_document_ofo: true,
          },
        }) : await this.prisma.event_runnumber_ofo.findMany({
          where:{

          },
          include:{
            event_document_ofo: {
              where:{
                group_id: group_?.id
              }
            },
          },
        })
        const wlDoc = wl?.map((e:any) => {
          const doc7 = e?.event_document_ofo?.filter((f:any) => f?.event_doc_master_id === 7)?.find((f:any) => f?.event_doc_status_id === 2 && (f?.user_type_id === 3 || f?.user_type_id === 4)) ? true : false // event_doc_status_id 2 รอ Acknownlet
          const doc8 = e?.event_document_ofo?.filter((f:any) => f?.event_doc_master_id === 8)?.find((f:any) => f?.event_doc_status_id === 2 && (f?.user_type_id === 3 || f?.user_type_id === 4)) ? true : false // event_doc_status_id 2 รอ Acknownlet
          // มี doc ไหน true ให้นับ 1 ทั้ง event number
          return (doc7 || doc8) ? true : false
        })

        count = wlDoc?.filter((f:any) => f)?.length

        return {
          remainingTasks: count,
          status: 'Acknowledge',
          menuId: 1013
        }
      } catch (error) {
        return {
          remainingTasks: 0,
          status: 'Acknowledge',
          menuId: 1013
        }
      }
    } else {
      return undefined
    }
  }

  async getNominationData(
    shipper: number[],
    menu: WAITING_LIST_TARGET_MENUS[]
    // atDate?: any
  ) {
    if (menu.includes(NOMINATION_QUERY) || menu.includes(NOMINATION_DAILY_MANAGEMENT) || menu.includes(NOMINATION_WEEKLY_MANAGEMENT)) {
      const returnObj = {}
      returnObj['Daily Query Shipper Nomination File'] = undefined
      returnObj['Weekly Query Shipper Nomination File'] = undefined
      returnObj[NOMINATION_DAILY_MANAGEMENT] = undefined
      returnObj[NOMINATION_WEEKLY_MANAGEMENT] = undefined

      try {
        // const date = getTodayNowAdd7(atDate).toDate();
        // const { weekStart: targetWeekStart, weekEnd: targetWeekEnd } = getWeekRange(date);
        const andInWhere: Prisma.query_shipper_nomination_fileWhereInput[] = [
          // Waiting For Response
          {
            query_shipper_nomination_status: {
              id: 1
            }
          },
          {
            OR: [
              {
                del_flag: false
              },
              {
                del_flag: null
              }
            ]
          }
          // {
          //   OR: [
          //     // Daily nominations: exact date match
          //     {
          //       nomination_type: {
          //         id: 1,
          //       },
          //       gas_day: date,
          //     },
          //     // Weekly nominations: same week
          //     {
          //       nomination_type: {
          //         id: 2,
          //       },
          //       gas_day: {
          //         gte: targetWeekStart,
          //         lte: targetWeekEnd,
          //       },
          //     },
          //   ],
          // },
        ]
        if (shipper.length > 0) {
          andInWhere.push({
            group_id: {
              in: shipper
            }
          })
        }
        const result = await this.prisma.query_shipper_nomination_file.findMany({
          where: {
            NOT: {
              contract_code_id: null
            },
            AND: andInWhere
          }
        })

        const daily = result.filter((f: any) => f?.nomination_type_id === 1).length
        const weekly = result.filter((f: any) => f?.nomination_type_id === 2).length

        if (menu.includes(NOMINATION_QUERY)) {
          returnObj['Daily Query Shipper Nomination File'] = {
            remainingTasks: daily,
            status: 'Waiting For Response',
            menuId: 64
          }
          returnObj['Weekly Query Shipper Nomination File'] = {
            remainingTasks: weekly,
            status: 'Waiting For Response',
            menuId: 64
          }
        }
        if (menu.includes(NOMINATION_DAILY_MANAGEMENT)) {
          returnObj[NOMINATION_DAILY_MANAGEMENT] = {
            remainingTasks: daily,
            status: 'Waiting For Response',
            menuId: 65
          }
        }
        if (menu.includes(NOMINATION_WEEKLY_MANAGEMENT)) {
          returnObj[NOMINATION_WEEKLY_MANAGEMENT] = {
            remainingTasks: weekly,
            status: 'Waiting For Response',
            menuId: 66
          }
        }
      } catch (error) {
        if (menu.includes(NOMINATION_QUERY)) {
          returnObj['Daily Query Shipper Nomination File'] = {
            remainingTasks: 0,
            status: 'Waiting For Response',
            menuId: 64
          }
          returnObj['Weekly Query Shipper Nomination File'] = {
            remainingTasks: 0,
            status: 'Waiting For Response',
            menuId: 64
          }
        }
        if (menu.includes(NOMINATION_DAILY_MANAGEMENT)) {
          returnObj[NOMINATION_DAILY_MANAGEMENT] = {
            remainingTasks: 0,
            status: 'Waiting For Response',
            menuId: 65
          }
        }
        if (menu.includes(NOMINATION_WEEKLY_MANAGEMENT)) {
          returnObj[NOMINATION_WEEKLY_MANAGEMENT] = {
            remainingTasks: 0,
            status: 'Waiting For Response',
            menuId: 66
          }
        }
      }

      return returnObj
    } else {
      return undefined
    }
  }

  async getNominationAdjustmentData(
    shipper: number[],
    menu: WAITING_LIST_TARGET_MENUS[]
    // atDate?: any
  ) {
    if (menu.includes(NOMINATION_ADJUSTMENT)) {
      try {
        // const date = getTodayNowAdd7(atDate).toDate();
        const andInWhere: Prisma.daily_adjustmentWhereInput[] = [
          // Submitted
          {
            daily_adjustment_status_id: 1
          }
        ]
        if (shipper.length > 0) {
          andInWhere.push({
            daily_adjustment_group: {
              some: {
                group_id: {
                  in: shipper
                }
              }
            }
          })
        }
        const result = await this.prisma.daily_adjustment.count({
          where: {
            AND: andInWhere
          }
        })

        return {
          remainingTasks: result,
          status: 'Submitted',
          menuId: 68
        }
      } catch (error) {
        return {
          remainingTasks: 0,
          status: 'Submitted',
          menuId: 68
        }
      }
    } else {
      return undefined
    }
  }

  async getContractData(
    shipper: number[],
    menu: WAITING_LIST_TARGET_MENUS[]
    // atDate?: any
  ) {
    if (menu.includes(CAPACITY_CONTRACT_MANAGEMENT) || menu.includes(CAPACITY_CONTRACT_MANAGEMENT_SAVED) || menu.includes(CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED) || menu.includes(CAPACITY_CONTRACT_LIST) || menu.includes(CAPACITY_CONTRACT_LIST_SAVED) || menu.includes(CAPACITY_CONTRACT_LIST_CONFIRMED)) {
      const returnObj = {}
      returnObj[CAPACITY_CONTRACT_MANAGEMENT] = undefined
      returnObj[CAPACITY_CONTRACT_MANAGEMENT_SAVED] = undefined
      returnObj[CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED] = undefined
      returnObj[CAPACITY_CONTRACT_LIST] = undefined
      returnObj[CAPACITY_CONTRACT_LIST_SAVED] = undefined
      returnObj[CAPACITY_CONTRACT_LIST_CONFIRMED] = undefined

      try {
        // const date = getTodayNowAdd7(atDate).toDate();
        const andInWhere: Prisma.contract_codeWhereInput[] = [
          // Waiting For Approval
          // {
          //   status_capacity_request_management_process_id: 3
          // }
        ]
        if (shipper.length > 0) {
          andInWhere.push({
            group_id: {
              in: shipper
            }
          })
        }

        const result = await this.prisma.contract_code.count({
          where: {
            AND: [...andInWhere,   {
              status_capacity_request_management_process_id: 3
            }]
          }
        })

        const resultSaved = await this.prisma.contract_code.count({
          where: {
            AND: [...andInWhere,   {
              status_capacity_request_management_id: 1
            }]
          }
        })
        const resultConfirmed = await this.prisma.contract_code.count({
          where: {
            AND: [...andInWhere,   {
              status_capacity_request_management_id: 4
            }]
          }
        })

        if (menu.includes(CAPACITY_CONTRACT_LIST)) {
          returnObj[CAPACITY_CONTRACT_LIST] = {
            remainingTasks: result,
            status: 'Waiting For Approval',
            menuId: 53
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_LIST_SAVED)) {
          returnObj[CAPACITY_CONTRACT_LIST_SAVED] = {
            remainingTasks: resultSaved,
            status: 'Saved',
            menuId: 53
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_LIST_CONFIRMED)) {
          returnObj[CAPACITY_CONTRACT_LIST_CONFIRMED] = {
            remainingTasks: resultConfirmed,
            status: 'Confirmed',
            menuId: 53
          }
        }

        if (menu.includes(CAPACITY_CONTRACT_MANAGEMENT)) {
          returnObj[CAPACITY_CONTRACT_MANAGEMENT] = {
            remainingTasks: result,
            status: 'Waiting For Approval',
            menuId: 50
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_MANAGEMENT_SAVED)) {
          returnObj[CAPACITY_CONTRACT_MANAGEMENT_SAVED] = {
            remainingTasks: resultSaved,
            status: 'Saved',
            menuId: 50
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED)) {
          returnObj[CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED] = {
            remainingTasks: resultConfirmed,
            status: 'Confirmed',
            menuId: 50
          }
        }
      } catch (error) {
        if (menu.includes(CAPACITY_CONTRACT_LIST)) {
          returnObj[CAPACITY_CONTRACT_LIST] = {
            remainingTasks: 0,
            status: 'Waiting For Approval',
            menuId: 53
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_LIST_SAVED)) {
          returnObj[CAPACITY_CONTRACT_LIST_SAVED] = {
            remainingTasks: 0,
            status: 'Saved',
            menuId: 53
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_LIST_CONFIRMED)) {
          returnObj[CAPACITY_CONTRACT_LIST_CONFIRMED] = {
            remainingTasks: 0,
            status: 'Confirmed',
            menuId: 53
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_MANAGEMENT)) {
          returnObj[CAPACITY_CONTRACT_MANAGEMENT] = {
            remainingTasks: 0,
            status: 'Waiting For Approval',
            menuId: 50
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_MANAGEMENT)) {
          returnObj[CAPACITY_CONTRACT_MANAGEMENT] = {
            remainingTasks: 0,
            status: 'Saved',
            menuId: 50
          }
        }
        if (menu.includes(CAPACITY_CONTRACT_MANAGEMENT)) {
          returnObj[CAPACITY_CONTRACT_MANAGEMENT] = {
            remainingTasks: 0,
            status: 'Confirmed',
            menuId: 50
          }
        }
      }

      return returnObj
    } else {
      return undefined
    }
  }

  async getContractReleaseCapacityData(
    shipper: number[],
    menu: WAITING_LIST_TARGET_MENUS[]
    // atDate?: any
  ) {
    if (menu.includes(RELEASE_CAPACITY)) {
      try {
        // const date = getTodayNowAdd7(atDate).toDate();
        const andInWhere: Prisma.release_capacity_submissionWhereInput[] = [
          // Submitted
          {
            release_capacity_status_id: 1
          }
        ]
        if (shipper.length > 0) {
          andInWhere.push({
            group_id: {
              in: shipper
            }
          })
        }

        const result = await this.prisma.release_capacity_submission.count({
          where: {
            AND: andInWhere
          }
        })

        return {
          remainingTasks: result,
          status: 'Submitted',
          menuId: 60
        }
      } catch (error) {
        return {
          remainingTasks: 0,
          status: 'Submitted',
          menuId: 60
        }
      }
    } else {
      return undefined
    }
  }

  async findAllocationReview(payload: any, userId: any) {
    const {atDate} = payload
    const {group, isAdmin} = await getGroupData(this.prisma, userId)
    const shipper = isAdmin ? [] : group.map((f: any) => f?.id_name)

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [ALLOCATION_REVIEW]
    })

    return await this.getAllocationReviewData({
      userId,
      shipper,
      menu,
      atDate
    })
  }

  async findAllocationManagement(payload: any, userId: any) {
    const {atDate} = payload
    const {group, isAdmin} = await getGroupData(this.prisma, userId)
    const shipper = isAdmin ? [] : group.map((f: any) => f?.id_name)

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [ALLOCATION_MANAGEMENT]
    })

    return await this.getAllocationManagementDataV2({
      userId,
      shipper,
      menu,
      atDate
    })
  }

  async findOffspecGas(payload: any, userId: any) {
    const {atDate} = payload
    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)
    const shipper = group.map((f: any) => f?.id)
    const tso = isTSO ? group.map((f: any) => f?.id) : isAdmin ? [] : [-1]

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [EVENT_OFFSPEC_GAS]
    })

    return await this.getOffspecGasData({
      userId,
      shipper,
      tso,
      menu,
      atDate
    })
  }

  async findEmer(payload: any, userId: any) {
    const {atDate} = payload
    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)
    const shipper = group.map((f: any) => f?.id)
    const tso = isTSO ? group.map((f: any) => f?.id) : isAdmin ? [] : [-1]

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [EVENT_EMERGENCY_DIFFICULT_DAY]
    })

    return await this.getEmerData({
      userId,
      shipper,
      tso,
      menu,
      atDate
    })
  }

  async findOfo(payload: any, userId: any) {
    const {atDate} = payload
    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)
    const shipper = group.map((f: any) => f?.id)
    const tso = isTSO ? group.map((f: any) => f?.id) : isAdmin ? [] : [-1]

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [EVENT_OF_IF]
    })

    return await this.getOfoData({
      userId,
      shipper,
      tso,
      menu,
      atDate
    })
  }

  async findNomination(payload: any, userId: any) {
    // const { atDate } = payload;
    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)
    const shipper = isAdmin || isTSO ? [] : group.map((f: any) => f?.id)

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [NOMINATION]
    })

    return await this.getNominationData(shipper, menu)
  }

  async findNominationAdjustment(payload: any, userId: any) {
    // const { atDate } = payload;
    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)
    const shipper = isAdmin || isTSO ? [] : group.map((f: any) => f?.id)

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [NOMINATION_ADJUSTMENT]
    })

    return await this.getNominationAdjustmentData(shipper, menu)
  }

  async findContract(payload: any, userId: any) {
    // const { atDate } = payload;
    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)
    const shipper = isAdmin || isTSO ? [] : group.map((f: any) => f?.id)

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [CAPACITY_CONTRACT]
    })

    return await this.getContractData(shipper, menu)
  }

  async findContractReleaseCapacity(payload: any, userId: any) {
    // const { atDate } = payload;
    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)
    const shipper = isAdmin || isTSO ? [] : group.map((f: any) => f?.id)

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [RELEASE_CAPACITY]
    })

    return await this.getContractReleaseCapacityData(shipper, menu)
  }
  
  async findAll(payload: any, userId: any) {
    const {atDate} = payload
    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)

    const shipper = isAdmin || isTSO ? [] : group.map((f: any) => f?.id)

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId,
      targetMenus: [CAPACITY_CONTRACT, RELEASE_CAPACITY, NOMINATION, NOMINATION_ADJUSTMENT, ALLOCATION_REVIEW, ALLOCATION_MANAGEMENT, EVENT_OFFSPEC_GAS, EVENT_EMERGENCY_DIFFICULT_DAY, EVENT_OF_IF],
      atDate
    })

    //#region contract
    const contract = await this.getContractData(shipper, menu)
    const contractReleaseCapacity = await this.getContractReleaseCapacityData(shipper, menu)
    //#endregion nomination

    //#region nomination
    const nomination = await this.getNominationData(shipper, menu)
    const nominationAdjustment = await this.getNominationAdjustmentData(shipper, menu)
    //#endregion nomination

    //#region allocation
    const {startDate: alloStartDate, endDate: alloEndDate} = getAllocationDateRange(atDate)
    const alloShipper = isAdmin || isTSO ? [] : group.map((f: any) => f?.id_name)
    const alloData = await this.getAllocationFromAllocationService(userId, alloShipper, alloStartDate, alloEndDate)

    const alloPayload = {
      userId,
      shipper: alloShipper,
      data: alloData,
      startDate: alloStartDate,
      endDate: alloEndDate,
      menu
    }

    const allocationReview = await this.getAllocationReviewData(alloPayload)
    const allocationManagement = await this.getAllocationManagementDataV2(alloPayload)
    //#endregion allocation

    //#region event
    const eventShipper = group.map((f: any) => f?.id)
    const eventTso = isTSO ? group.map((f: any) => f?.id) : isAdmin ? [] : [-1]

    const eventPayload = {
      userId,
      shipper: eventShipper,
      tso: eventTso,
      menu,
      atDate
    }

    // const offspecGas = await this.getOffspecGasData(eventPayload)
    // const emergencyDifficultDay = await this.getEmerData(eventPayload)
    // const ofo = await this.getOfoData(eventPayload)

    const offspecGas_acknowledge = await this.getOffspecGasDataAcknowledge(eventPayload)
    const emergencyDifficultDay_acknowledge = await this.getEmerDataAcknowledge(eventPayload)
    const ofo_acknowledge = await this.getOfoDataAcknowledge(eventPayload)
    //#endregion event

    return {
      ...contract,
      [RELEASE_CAPACITY]: contractReleaseCapacity,
      ...nomination,
      [NOMINATION_ADJUSTMENT]: nominationAdjustment,
      [ALLOCATION_REVIEW]: allocationReview,
      [ALLOCATION_MANAGEMENT]: allocationManagement,
      // [EVENT_OFFSPEC_GAS]: offspecGas,
      // [EVENT_EMERGENCY_DIFFICULT_DAY]: emergencyDifficultDay,
      // [EVENT_OF_IF]: ofo,

      [EVENT_OFFSPEC_GAS_ACKNOWLEDGE]: offspecGas_acknowledge, //
      [EVENT_EMERGENCY_DIFFICULT_DAY_ACKNOWLEDGE]: emergencyDifficultDay_acknowledge, //
      [EVENT_OF_IF_ACKNOWLEDGE]: ofo_acknowledge //
    }
  }
  
  async findAllV2(payload: any, userId: any) {
    // Capacity Contract List
    // Capacity Contract List (Confirmed)
    // Capacity Contract List (Saved)
    // Capacity Contract Management
    // Capacity Contract Management (Confirmed)
    // Capacity Contract Management (Saved)
    // Daily Adjustment
    // Daily Management
    // Daily Query Shipper Nomination File
    // Emergency/Difficult Day
    // Emergency/Difficult Day (Acknowledge)
    // OFO/IF
    // OFO/IF (Acknowledge)
    // Offspec Gas
    // Offspec Gas (Acknowledge)
    // Release Capacity Management
    // Weekly Management
    // Weekly Query Shipper Nomination File
    // Allocation Review
    // Allocation Management

    const {atDate, menuName} = payload
    // menuName "Capacity Management"
    // menuName "Allocation"
    // menuName "Nominations"
    // menuName "Event"

    const {group, isAdmin, isTSO} = await getGroupData(this.prisma, userId)

    const shipper = isAdmin || isTSO ? [] : group.map((f: any) => f?.id)

    const menu: WAITING_LIST_TARGET_MENUS[] = await this.getWaitingListMenu({
      userId, 
      targetMenus: [CAPACITY_CONTRACT, RELEASE_CAPACITY, NOMINATION, NOMINATION_ADJUSTMENT, ALLOCATION_REVIEW, ALLOCATION_MANAGEMENT, EVENT_OFFSPEC_GAS, EVENT_EMERGENCY_DIFFICULT_DAY, EVENT_OF_IF],
      atDate
    })

    if(menuName === "Capacity Management"){
      //#region contract
      const contract = await this.getContractData(shipper, menu)
      const contractReleaseCapacity = await this.getContractReleaseCapacityData(shipper, menu)
      //#endregion contract
      return {
        ...contract,
        [RELEASE_CAPACITY]: contractReleaseCapacity,
      }
    }else if(menuName === "Allocation"){
      //#region allocation
      const {startDate: alloStartDate, endDate: alloEndDate} = getAllocationDateRange(atDate)
      const alloShipper = isAdmin || isTSO ? [] : group.map((f: any) => f?.id_name)
      // const alloData = await this.getAllocationFromAllocationService(userId, alloShipper, alloStartDate, alloEndDate)
  
      const alloPayload = {
        userId,
        shipper: alloShipper,
        // data: alloData,
        startDate: alloStartDate,
        endDate: alloEndDate,
        menu
      }
  
      const allocationReview = await this.getAllocationReviewData(alloPayload)
      const allocationManagement = await this.getAllocationManagementDataV2(alloPayload)
      //#endregion allocation
      
    
      return {
        [ALLOCATION_REVIEW]: allocationReview,
        [ALLOCATION_MANAGEMENT]: allocationManagement,
      }

    }else if(menuName === "Nominations"){
      //#region nomination
      const nomination = await this.getNominationData(shipper, menu)
      const nominationAdjustment = await this.getNominationAdjustmentData(shipper, menu)
      //#endregion nomination

      return {
        ...nomination,
        [NOMINATION_ADJUSTMENT]: nominationAdjustment,
      }

    }else if(menuName === "Event"){
      //#region event
      const eventShipper = group.map((f: any) => f?.id)
      const eventTso = isTSO ? group.map((f: any) => f?.id) : isAdmin ? [] : [-1]
  
      const eventPayload = {
        userId,
        shipper: eventShipper,
        tso: eventTso,
        menu,
        atDate
      }
  
      const offspecGas_acknowledge = await this.getOffspecGasDataAcknowledge(eventPayload)
      const emergencyDifficultDay_acknowledge = await this.getEmerDataAcknowledge(eventPayload)
      const ofo_acknowledge = await this.getOfoDataAcknowledge(eventPayload)
      //#endregion event

      return {
     
        [EVENT_OFFSPEC_GAS_ACKNOWLEDGE]: offspecGas_acknowledge, //
        [EVENT_EMERGENCY_DIFFICULT_DAY_ACKNOWLEDGE]: emergencyDifficultDay_acknowledge, //
        [EVENT_OF_IF_ACKNOWLEDGE]: ofo_acknowledge //
      }

    }else{
      return {}
    }


  }
}