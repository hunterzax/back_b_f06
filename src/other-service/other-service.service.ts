import {
  Inject,
  Injectable
} from '@nestjs/common'
import {CreateOtherServiceDto} from './dto/create-other-service.dto'
import {UpdateOtherServiceDto} from './dto/update-other-service.dto'
import {JwtService} from '@nestjs/jwt'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {add} from 'lodash'
import {getTodayNowAdd7} from 'src/common/utils/date.util'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class OtherServiceService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async convert(
    file: any,
    userId: any
  ) {
    const jsonData =
      JSON.parse(
        file.buffer.toString(
          'utf-8'
        )
      )

    const nowDateAt =
      getTodayNowAdd7().toDate()

    const nowDateNumAt =
      getTodayNowAdd7().unix()

    await this.prisma.area_data_kml_full.create(
      {
        data: {
          temps:
            JSON.stringify(
              jsonData
            ),
          create_date:
            nowDateAt,
          // create_by: Number(userId),
          create_date_num:
            nowDateNumAt,
          create_by_account: {
            connect: {
              id: Number(
                userId
              )
            }
          }
        }
      }
    )
    //  ไม่ชัวว่า name จะ unique เลยไม่ใช้ upsert
    await Promise.all(
      jsonData?.ground_overlays.map(
        async (overlay) => {
          const existing =
            await this.prisma.area_data_kml_row.findFirst(
              {
                where: {
                  original_name:
                    overlay.name
                }
              }
            )

          if (existing) {
            return this.prisma.area_data_kml_row.update(
              {
                where: {
                  id: existing.id
                }, // ใช้ `id` เพราะเป็น Primary Key
                data: {
                  original_by_document:
                    jsonData?.document,
                  original_id:
                    overlay.id,
                  original_name:
                    overlay.name,
                  original_icon:
                    overlay.icon,
                  original_url:
                    overlay.url,
                  original_lat_lon_box:
                    JSON.stringify(
                      overlay.lat_lon_box
                    ),
                  update_date:
                    nowDateAt,
                  // create_by: Number(userId),
                  update_date_num:
                    nowDateNumAt,
                  update_by_account:
                    {
                      connect:
                        {
                          id: Number(
                            userId
                          )
                        }
                    }
                }
              }
            )
          } else {
            return this.prisma.area_data_kml_row.create(
              {
                data: {
                  original_by_document:
                    jsonData?.document,
                  original_id:
                    overlay.id,
                  original_name:
                    overlay.name,
                  original_icon:
                    overlay.icon,
                  original_url:
                    overlay.url,
                  original_lat_lon_box:
                    JSON.stringify(
                      overlay.lat_lon_box
                    ),
                  create_date:
                    nowDateAt,
                  // create_by: Number(userId),
                  create_date_num:
                    nowDateNumAt,
                  create_by_account:
                    {
                      connect:
                        {
                          id: Number(
                            userId
                          )
                        }
                    }
                }
              }
            )
          }
        }
      )
    )

    return jsonData
  }

  async getAreaLineMap() {
    const areaLineMap =
      await this.prisma.area_data_kml_row.findMany(
        {
          select: {
            original_by_document: true,
            original_id: true,
            original_name: true,
            original_icon: true,
            original_url: true,
            original_lat_lon_box: true
          }
        }
      )
    const newData =
      await areaLineMap.map(
        (e: any) => {
          e['area_split'] =
            e[
              'original_name'
            ].split(' ')[1] ||
            e['original_name']
          e[
            'original_lat_lon_box'
          ] =
            JSON.parse(
              e[
                'original_lat_lon_box'
              ]
            ) || null
          ;((e['bounds'] =
            !!e[
              'original_lat_lon_box'
            ]
              ? [
                  e[
                    'original_lat_lon_box'
                  ]?.north,
                  e[
                    'original_lat_lon_box'
                  ]?.south,
                  e[
                    'original_lat_lon_box'
                  ]?.east,
                  e[
                    'original_lat_lon_box'
                  ]?.west
                ]
              : []),
            (e['rotation'] =
              !!e[
                'original_lat_lon_box'
              ]
                ? e[
                    'original_lat_lon_box'
                  ]?.rotation
                : null))
          return {...e}
        }
      )
    return newData
  }
}
