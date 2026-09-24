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

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {
  checkStartEndBoom,
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import { Prisma } from '@prisma/client'
import { matchTypeWithMenu, renameMethod } from 'src/common/utils/export.util'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ParameterAuditLogService {
  constructor(
    private prisma: PrismaService
  ) {}

  auditLogModule() {
    return this.prisma.menus.findMany(
      {
        where: {
          parent: 0
        },
        include: {},
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  async auditLog(
    id: any,
    date: any,
    module: any,
    name: any,
    querySearch: any,
    limit: any,
    offset: any,
    orderAtColumn: any,
    orderBy: any,
    ignoreOffsetAndLimit: boolean = false
  ) {
    let limit_ = limit ? Number(limit) : 100
    let offset_ = offset ? Number(offset) : 0

    if(Number.isNaN(limit_)){
      limit_ = 100
    }
    if(Number.isNaN(offset_)){
      offset_ = 0
    }

    
    const andInWhere: Prisma.historyWhereInput[] = []
    if(date){
      const todayStart = getTodayStartAdd7(date)
      const todayEnd = getTodayEndAdd7(date)

      if(todayStart.isValid()){
        andInWhere.push({
          create_date: {
            lte: todayEnd.toDate(),
            gte: todayStart.toDate()
          }
        })
      }
    }

    if(id){
      andInWhere.push({
        id: Number(id)
      })
    }

    try {
      if(module){
        const moduleList: string[] = `${module}`.split(',')
        .map(s => s.trim())
        .filter(Boolean)

        const moduleWhere: Prisma.historyWhereInput[] = moduleList.map(
          (keyword) => ({
            module: {
              contains: keyword,
              mode: Prisma.QueryMode.insensitive
            }
          })
        )
        andInWhere.push({OR: moduleWhere})
      }
    } catch (error) {
      // moduleList = []
    }

    try {
      if(name){
        const nameList: string[] = `${name}`
          .split(' ')
          .map(s => s.trim())
          .filter(Boolean)

        const nameWhere: Prisma.historyWhereInput[] = nameList.map(
          (keyword) => ({
            OR: [
              {
                create_by_account: {
                  is: {
                    first_name: {
                      contains: keyword,
                      mode: Prisma.QueryMode.insensitive
                    }
                  }
                }
              },
              {
                create_by_account: {
                  is: {
                    last_name: {
                      contains: keyword,
                      mode: Prisma.QueryMode.insensitive
                    }
                  }
                }
              }
            ]
          })
        )

        andInWhere.push(...nameWhere)
      }
    } catch (error) {
      // nameList = []
    }

    const auditWhere = {
      AND: andInWhere,
      // ...(!!date && {
      //   ...dateWhere
      // }),
      // ...(!!id && {
      //   id: Number(id)
      // }),
      // ...(!!module && {
      //   module: {
      //     in: moduleList
      //   }
      // }),
      // ...(!!name && {
      //   AND: nameList.map(
      //     (keyword) => ({
      //       OR: [
      //         {
      //           create_by_account: {
      //             is: {
      //               first_name: {
      //                 contains: String(keyword),
      //                 mode: Prisma.QueryMode.insensitive
      //               }
      //             }
      //           }
      //         },
      //         {
      //           create_by_account: {
      //             is: {
      //               last_name: {
      //                 contains: String(keyword),
      //                 mode: Prisma.QueryMode.insensitive
      //               }
      //             }
      //           }
      //         }
      //       ]
      //     })
      //   )
      // })
    }

    let auditLogCount = 0
    if(!querySearch){
      auditLogCount = await this.prisma.history.count(
        {
          where: auditWhere
        }
      )
    }

    let order : Prisma.historyOrderByWithRelationInput | Prisma.historyOrderByWithRelationInput[] = {
      id: 'desc'
    }

    if((orderBy == 'desc' || orderBy == 'asc')){
      switch(orderAtColumn){
        case 'id':
          order = {
            id: orderBy
          }
          break
        case 'description':
          // ค่า description คำนวณในแอป ไม่มีคอลัมน์ใน DB — sort หลัง query (ดูด้านล่าง)
        case 'create_date':
          order = {
            create_date: orderBy
          }
          break
        case 'module':
          order = {
            module: orderBy
          }
          break

        case 'name':
          order = [
            {
              create_by_account: {
                first_name: orderBy
              }
            },
            {
              create_by_account: {
                last_name: orderBy
              }
            }
          ]
          break
        default:
          break
      }
    }

    const auditSelect : Prisma.historySelect = {
      id: true,
      reqUser: true,
      type: true,
      module: true,
      create_date: true,
      create_date_num: true,
      method: true,
      create_by_account: {
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true
        }
      }
    }

    const sortByDescription =
      orderAtColumn === 'desc' &&
      (orderBy === 'desc' || orderBy === 'asc')

    let auditLog = []

    if (sortByDescription || querySearch) {
      // const today = getTodayEndAdd7().toDate()
      // const last3Months = getTodayNowAdd7().subtract(1, 'month').startOf('month').toDate()
      // if(!date){
      //   auditWhere.AND.push({
      //     create_date: {
      //       gte: last3Months,
      //       lte: today
      //     }
      //   })
      // }

      let rows = await this.prisma.history.findMany({
        where: auditWhere,
        select: auditSelect,
        orderBy: order,
        skip: 0,
        take: 25000,
      })

      if(querySearch){
        const filteredRows = rows.filter(row => {
          const description = this.auditDescriptionText(row.method, row.type)
          const actionDate = dayjs(row.create_date).format('DD/MM/YYYY HH:mm')
          const fullName = `${row.create_by_account?.first_name ?? ''} ${row.create_by_account?.last_name ?? ''}`
          return description.toLowerCase().includes(querySearch.toLowerCase())
          || actionDate.toLowerCase().includes(querySearch.toLowerCase())
          || fullName.toLowerCase().includes(querySearch.toLowerCase())
          || row.method.toLowerCase().includes(querySearch.toLowerCase())
          || `${row.id}`.toLowerCase().includes(querySearch.toLowerCase())
        })
        auditLogCount = filteredRows.length
        rows = filteredRows
      }


      const direction = orderBy === 'asc' ? 1 : -1
      rows.sort((a, b) => {
        const da = this.auditDescriptionText(a.method, a.type)
        const db = this.auditDescriptionText(b.method, b.type)
        return da.localeCompare(db, undefined, { sensitivity: 'base' }) * direction
      })
      if(!ignoreOffsetAndLimit){
        auditLog = rows.slice(offset_, offset_ + limit_)
      } else {
        auditLog = rows
      }
    } else {
      auditLog = await this.prisma.history.findMany({
        ...(ignoreOffsetAndLimit ? {} : {
          skip: offset_,
          take: limit_,
        }),
        where: auditWhere,
        select: auditSelect,
        orderBy: order
      })
    }

    return {
      data: auditLog,
      total: auditLogCount
    }
  }

  /** ข้อความเดียวกับที่ frontend ใช้แสดง description (ใช้ sort ใน memory เมื่อไม่มีคอลัมน์ใน DB) */
  auditDescriptionText(method: any, type: any): string {
    const left = renameMethod(method, type)
    const right = matchTypeWithMenu(type)
    return `${left} ${right}`.trim()
  }
}
