import {HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {checkStartEndBoom, getTodayEndAdd7, getTodayNowAdd7, getTodayNowYYYYMMDDHHmmssDfaultAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'
import axios from 'axios'
import { MeteredMicroService } from 'src/grpc/metered-service.service'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ParameterModeZoneBaseInventoryService {
  constructor(
    private prisma: PrismaService,
    private readonly meteredMicroService: MeteredMicroService
  ) {}

  async modeZoneUse() {
    const bookingTemplate = await this.prisma.zone.findMany({
      select: {
        id: true,
        name: true,
        color: true,
        config_mode_zone_base_inventory: {
          select: {
            id: true,
            mode: true
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
      orderBy: {
        id: 'desc'
      }
    })
    return bookingTemplate
  }

  async changeModeZoneBaseInventoryOnce(id: any) {
    const bookingTemplate = await this.prisma.mode_zone_base_inventory.findUnique({
      where: {
        id: Number(id)
      },
      include: {
        zone: true,
        mode: true,
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
      }
    })
    return bookingTemplate
  }

  async changeModeZoneBaseInventory() {
    const bookingTemplate = await this.prisma.mode_zone_base_inventory.findMany({
      where: {
        OR: [
          { active: null },
          { active: true }
        ],
      },
      include: {
        zone: true,
        mode: true,
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
      orderBy: {
        id: 'desc'
      }
    })
    return bookingTemplate
  }

  async changeModeZoneBaseInventoryCreate(payload: any, userId: any) {
    const {start_date, zone_id, mode_id, ...dataWithout} = payload

    const changeModeZoneBaseInventoryCreate = await this.prisma.mode_zone_base_inventory.create({
      data: {
        ...dataWithout,
        ...(zone_id !== null && {
          zone: {
            connect: {
              id: zone_id
            }
          }
        }),
        ...(mode_id !== null && {
          mode: {
            connect: {
              id: mode_id
            }
          }
        }),
        start_date: start_date ? getTodayNowAdd7(start_date).toDate() : null,
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      },
      include: {
        zone: true,
        mode: true
      }
    })
    return changeModeZoneBaseInventoryCreate
  }

  async changeModeZoneBaseInventoryCreateText(payload: any, userId: any) {
    const {start_date, zone_text, mode_text, ...dataWithout} = payload
    // {
    //     "mode_text": "Run KCS",
    //     "zone_text": "East",
    //     "start_date": "2026-08-13 03:00:00"
    // }
    const modeData = await this.prisma.config_mode_zone_base_inventory.findFirst({
      where: {
        mode: {
          equals: mode_text,
          mode: 'insensitive'
        },
        zone: {
          name: {
            equals: zone_text,
            mode: 'insensitive'
          }
        },
      },
    })

    if(modeData){
      const newStartDate = getTodayNowYYYYMMDDHHmmssDfaultAdd7(start_date)
      const nextHourStartDate = newStartDate.isSame(newStartDate.startOf('hour')) ? newStartDate.add(1, 'hour').startOf('hour') : newStartDate.add(1, 'hour').startOf('hour').add(1, 'millisecond')

      const modeZoneList = await this.prisma.mode_zone_base_inventory.findMany({
        where: {
          zone: {
            name: {
              equals: zone_text,
              mode: 'insensitive'
            }
          },
          start_date: {
            lte: newStartDate.toDate()
          }
        },
        include: {
          zone: {
            select: {
              id: true,
              name: true
            }
          },
          mode: {
            select: {
              id: true,
              mode: true
            }
          }
        }
      })

      const nextHourModeZone = await this.prisma.mode_zone_base_inventory.findFirst({
        where: {
          zone: {
            name: {
              equals: zone_text,
              mode: 'insensitive'
            }
          },
          start_date: {
            gte: nextHourStartDate.toDate(),
            lte: nextHourStartDate.endOf('hour').toDate()
          }
        }
      })

      const activeModeZone =
        modeZoneList && modeZoneList.length > 0
          ? modeZoneList.reduce((prev: any, curr: any) => {
              const prevDiff = Math.abs(newStartDate.diff(dayjs(prev.start_date)))
              const currDiff = Math.abs(newStartDate.diff(dayjs(curr.start_date)))
              if(currDiff == prevDiff){
                return dayjs(curr.create_date).isAfter(dayjs(prev.create_date)) ? curr : prev
              }
              return currDiff < prevDiff ? curr : prev
            })
          : null

      const createdModeZone = await this.prisma.$transaction(async (tx) => {
        const changeModeZoneBaseInventoryCreate = await tx.mode_zone_base_inventory.create({
          data: {
            ...dataWithout,
            ...(zone_text !== null && {
              zone: {
                connect: {
                  id: modeData?.zone_id
                }
              }
            }),
            ...(mode_text !== null && {
              mode: {
                connect: {
                  id: modeData?.id
                }
              }
            }),
            start_date: getTodayNowAdd7(start_date).toDate(),
            create_date: getTodayNowAdd7().toDate(),
            create_date_num: getTodayNowAdd7().unix(),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            }
          },
          include: {
            zone: true,
            mode: true
          }
        })

        if(!nextHourModeZone && activeModeZone){
          await tx.mode_zone_base_inventory.create({
            data: {
              ...(activeModeZone.zone_id !== null && {
                zone: {
                  connect: {
                    id: activeModeZone?.zone_id
                  }
                }
              }),
              ...(activeModeZone.mode_id !== null && {
                mode: {
                  connect: {
                    id: activeModeZone.mode_id
                  }
                }
              }),
              start_date: nextHourStartDate.toDate(),
              create_date: activeModeZone.create_date,
              create_date_num: activeModeZone.create_date_num,
              ...(activeModeZone.create_by !== null && {
                create_by_account: {
                  connect: {
                    id: activeModeZone.create_by
                  }
                }
              }),
              active : false
            }
          })
        }
        return changeModeZoneBaseInventoryCreate
      })

      try {
        let gasDay = newStartDate.format('YYYY-MM-DD')
        let gasHour = newStartDate.hour()
        if(newStartDate.isSame(newStartDate.startOf('day'))){
          gasDay = newStartDate.subtract(1, 'day').format('YYYY-MM-DD')
          gasHour = 24
        }
        else{
          if(!newStartDate.isSame(newStartDate.startOf('hour'))){
            gasHour = gasHour + 1
          }
  
          if(gasHour > 24){
            gasDay = newStartDate.add(1, 'day').format('YYYY-MM-DD')
            gasHour = gasHour - 24
          }
        }

        const meteredMicroData = await this.meteredMicroService.sendMessage(
          JSON.stringify({
            case: 'update-active-base-inventory',
            mode: 'metering',
            zone: zone_text,
            modeText: mode_text,
            gasDay: gasDay,
            gasHour: gasHour
          })
        )
        const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null
        // console.log('changeModeZoneBaseInventoryCreateText Meter Service data : ', dataConvert);
      } catch (error) {
        console.log('changeModeZoneBaseInventoryCreateText Meter Service error : ', error);
      }

      return createdModeZone
    }else{
      return null
    }
  }
}
