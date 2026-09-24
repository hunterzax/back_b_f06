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
import * as fs from 'fs'
import * as FormData from 'form-data'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import axios from 'axios'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ReleaseCapacityManagementService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async findAll(userId: any) {
    // const group = await this.prisma.group.findFirst({
    //   where: {
    //     account_manage: {
    //       some: {
    //         account_id: Number(userId),
    //       },
    //     },
    //   },
    // });
    // if (group?.user_type_id === 3 || group?.user_type_id === 2) {
    // shipper
    return this.prisma.release_capacity_submission.findMany(
      {
        // where: {
        //   create_by_account: {
        //     account_manage: {
        //       some: {
        //         group: {
        //           user_type_id: Number(group?.user_type_id),
        //         },
        //       },
        //     },
        //   },
        // },
        include: {
          group: true,
          contract_code: {
            select: {
              id: true,
              contract_code: true
            }
          },
          release_capacity_active:
            {
              include: {
                release_capacity_status: true,
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
            },
          release_capacity_status: true,
          release_capacity_submission_detail:
            {
              include: {
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
            },
          release_capacity_submission_file:
            {
              include: {
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
            },
          create_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          },
          update_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        },
        orderBy: {id: 'desc'}
      }
    )
    // } else {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'มี user_type not condition.',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
  }

  status() {
    return this.prisma.release_capacity_status.findMany(
      {
        orderBy: {id: 'asc'}
      }
    )
  }
}
