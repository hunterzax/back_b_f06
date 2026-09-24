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

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)

@Injectable()
export class NewpointService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async findAll(userId: any) {
    const resData =
      await this.prisma.newpoint.findMany(
        {
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
            newpoint_file: {
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
            newpoint_detail: {
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
