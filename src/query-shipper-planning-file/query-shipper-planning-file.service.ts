import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as XLSX from 'xlsx-js-style'
import * as XlsxPopulate from 'xlsx-populate'
import * as fs from 'fs'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {CapacityService} from 'src/capacity/capacity.service'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)

@Injectable()
export class QueryShipperPlanningFileService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async findAll(userId: any) {
    const userType =
      await this.prisma.user_type.findFirst(
        {
          where: {
            account_manage: {
              some: {
                account_id:
                  Number(
                    userId
                  )
              }
            }
          }
        }
      )
    const group =
      await this.prisma.group.findFirst(
        {
          where: {
            account_manage: {
              some: {
                account_id:
                  Number(
                    userId
                  )
              }
            }
          }
        }
      )
    const resData =
      await this.prisma.query_shipper_planning_files.findMany(
        {
          where: {
            ...(Number(
              userType?.id
            ) === 3 && {
              group_id:
                group?.id
            })
            // ...(
            //   Number(userId) === 3 && {
            //     create_by_account:{
            //       account_manage:{
            //         some:{
            //           user_type_id:  userType?.id
            //         }
            //       }
            //     }
            //   }
            // ),
          },
          include: {
            term_type: true,
            group: {
              select: {
                id: true,
                id_name: true,
                name: true,
                company_name: true
              }
            },
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
              },
            query_shipper_planning_files_file:
              {
                include: {
                  create_by_account:
                    {
                      select:
                        {
                          id: true,
                          email: true,
                          first_name: true,
                          last_name: true
                        }
                    },
                  update_by_account:
                    {
                      select:
                        {
                          id: true,
                          email: true,
                          first_name: true,
                          last_name: true
                        }
                    }
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    return resData
  }
}
