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
import axios from 'axios'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ParameterConfigModeZoneBaseInventoryService {
  constructor(
    private prisma: PrismaService
  ) {}

  termType() {
    return this.prisma.term_type.findMany(
      {
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  async configModeZoneBaseInventory() {
    const bookingTemplate =
      await this.prisma.config_mode_zone_base_inventory.findMany(
        {
          include: {
            zone: true,
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
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    return bookingTemplate
  }

  async configModeZoneBaseInventoryOnce(
    id: any
  ) {
    const bookingTemplate =
      await this.prisma.config_mode_zone_base_inventory.findUnique(
        {
          where: {
            id: Number(id)
          },
          include: {
            zone: true,
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
      )
    return bookingTemplate
  }

  async configModeZoneBaseInventoryCreate(
    payload: any,
    userId: any
  ) {
    const {
      start_date,
      zone_id,
      ...dataWithout
    } = payload

    const checkF =
      await this.prisma.config_mode_zone_base_inventory.findFirst(
        {
          where: {
            zone_id: zone_id,
            mode: dataWithout?.mode,
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null
          }
        }
      )
    if (checkF) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date should not overlap.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const configModeZoneBaseInventoryCreate =
      await this.prisma.config_mode_zone_base_inventory.create(
        {
          data: {
            ...dataWithout,
            ...(zone_id !==
              null && {
              zone: {
                connect: {
                  id: zone_id
                }
              }
            }),
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            create_date:
              getTodayNowAdd7().toDate(),
            create_date_num:
              getTodayNowAdd7().unix(),
            create_by_account:
              {
                connect: {
                  id: Number(
                    userId
                  ) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                }
              }
          },
          include: {
            zone: true
          }
        }
      )

    this.updateModeZoneBaseInventoryToWebSerive(
      configModeZoneBaseInventoryCreate
    )

    return configModeZoneBaseInventoryCreate
  }

  async configModeZoneBaseInventoryEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      start_date,
      zone_id,
      ...dataWithout
    } = payload

    const zone =
      await this.prisma.zone.findUnique(
        {
          where: {
            id: zone_id
          }
        }
      )

    const checkF =
      await this.prisma.config_mode_zone_base_inventory.findFirst(
        {
          where: {
            id: {
              not: Number(id)
            },
            OR: [
              {
                zone: {
                  id: zone_id
                }
              },
              {
                zone: {
                  name: zone?.name
                }
              }
            ],
            mode: dataWithout?.mode,
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null
          }
        }
      )
    if (checkF) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date should not overlap.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const oldData =
      await this.prisma.config_mode_zone_base_inventory.findFirst(
        {
          where: {
            id: Number(id)
          },
          include: {
            zone: true
          }
        }
      )

    const configModeZoneBaseInventoryEdit =
      await this.prisma.config_mode_zone_base_inventory.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            ...(zone_id !==
              null && {
              zone: {
                connect: {
                  id: zone_id
                }
              }
            }),
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            update_date:
              getTodayNowAdd7().toDate(),
            update_by_account:
              {
                connect: {
                  id: Number(
                    userId
                  )
                }
              },
            update_date_num:
              getTodayNowAdd7().unix()
          },
          include: {
            zone: true
          }
        }
      )

    this.updateModeZoneBaseInventoryToWebSerive(
      configModeZoneBaseInventoryEdit,
      oldData
    )

    return configModeZoneBaseInventoryEdit
  }

  async updateModeZoneBaseInventoryToWebSerive(
    newData: any,
    oldData?: any
  ) {
    try {
      const webSeriveAuth =
        await axios.post(
          `${process.env.METER_WEBSERVICE}/user/login`,
          {
            username:
              process.env
                .METER_WEBSERVICE_USERNAME,
            password:
              process.env
                .METER_WEBSERVICE_PASSWORD
          }
        )
      if (
        webSeriveAuth?.data
          ?.access_token
      ) {
        const webSeriveToken =
          webSeriveAuth.data
            .access_token
        const body = {
          ZONE: newData?.zone
            ?.name,
          MODE: newData?.mode,
          DATE_START:
            getTodayNowAdd7(
              newData?.start_date
            )
              .tz(
                'Asia/Bangkok'
              )
              .format(
                'YYYY-MM-DD'
              ),
          BASE_HV:
            newData?.hv,
          BASE: newData?.base_inventory_value,
          ALERT_HIGH:
            newData?.alert_high,
          HIGH_RED:
            newData?.high_red,
          HIGH_ORANGE:
            newData?.high_orange,
          HIGH_DD:
            newData?.high_difficult_day,
          HIGH_MAX:
            newData?.high_max,
          ALERT_LOW:
            newData?.alert_low,
          LOW_ORANGE:
            newData?.low_orange,
          LOW_RED:
            newData?.low_red,
          LOW_DD:
            newData?.low_difficult_day,
          LOW_MAX:
            newData?.low_max
        }
        if (
          oldData?.zone
            ?.name &&
          oldData?.mode &&
          oldData?.start_date
        ) {
          const webSeriveUpdate =
            await this.putToWebSerive(
              webSeriveToken,
              oldData.zone
                .name,
              oldData.mode,
              dayjs(
                oldData.start_date
              )
                .tz(
                  'Asia/Bangkok'
                )
                .format(
                  'YYYY-MM-DD'
                ),
              body
            )
          return webSeriveUpdate
        } else {
          const webSeriveCreate =
            await this.postToWebSerive(
              webSeriveToken,
              body
            )
          return webSeriveCreate
        }
      } else {
        return {
          status: false,
          error:
            'Web service token not found'
        }
      }
    } catch (error) {
      return {
        status: false,
        error: error
      }
    }
  }

  async postToWebSerive(
    webSeriveToken: string,
    body: any
  ) {
    try {
      const webSeriveUpdate =
        await axios.post(
          `${process.env.METER_WEBSERVICE}/invent/create?access_token=${webSeriveToken}`,
          body
        )
      return {
        status: true,
        data: webSeriveUpdate
      }
    } catch (error) {
      return {
        status: false,
        error: error
      }
    }
  }

  async putToWebSerive(
    webSeriveToken: string,
    zone: string,
    mode: string,
    start_date: string,
    body: any
  ) {
    try {
      const webSeriveUpdate =
        await axios.put(
          `${process.env.METER_WEBSERVICE}/invent/update/${zone}/${mode}/${start_date}?access_token=${webSeriveToken}`,
          body
        )
      return {
        status: true,
        data: webSeriveUpdate
      }
    } catch (error) {
      return {
        status: false,
        error: error
      }
    }
  }
}
