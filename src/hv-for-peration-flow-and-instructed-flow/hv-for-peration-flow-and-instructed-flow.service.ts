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

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import {Response} from 'express'
import * as XLSX from 'xlsx-js-style'

import axios from 'axios'
import * as https from 'https'
import {
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayNowDDMMYYYYHHmmDfaultAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import {CreateHvForPerationFlowAndInstructedFlowDto} from './dto/create-hv-for-peration-flow-and-instructed-flow.dto'
import {Prisma} from '@prisma/client'

dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class HvForPerationFlowAndInstructedFlowService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // private readonly capacityV2Service: CapacityV2Service,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
    // private readonly meteredMicroService: MeteredMicroService,
    // private readonly capacityService: CapacityService,
  ) {}

  async findOnce(id: any) {
    return this.prisma.hv_for_peration_flow_and_instructed_flow.findFirst(
      {
        where: {
          id: Number(id)
        },
        include: {
          group: true,
          hv_type: true,
          metering_point: true,
          concept_point: true,
          meter_concept_type: true,
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
      }
    )
  }

  async findAll() {
    try {
      const check =
        await this.prisma.meter_concept_type.findMany(
          {}
        )
      if (
        check?.length === 0
      ) {
        await this.prisma.meter_concept_type.createMany(
          {
            data: [
              {
                id: 1,
                name: 'Meter Point'
              },
              {
                id: 2,
                name: 'Concept Point'
              }
            ]
          }
        )
      }
    } catch (error) {}

    return this.prisma.hv_for_peration_flow_and_instructed_flow.findMany(
      {
        include: {
          group: true,
          hv_type: true,
          metering_point: true,
          concept_point: true,
          meter_concept_type: true,
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
      }
    )
  }

  //
  async create(
    payload: any,
    userId: any
  ) {
    const {
      hv_type_id,
      group_id,
      metering_point_id,
      meter_concept_type_id,
      concept_point_id,
      start_date
    } = payload

    const where: Prisma.hv_for_peration_flow_and_instructed_flowWhereInput =
      {
        metering_point_id:
          metering_point_id,
        hv_type_id:
          hv_type_id,
        concept_point_id:
          concept_point_id,
        meter_concept_type_id:
          meter_concept_type_id
        // id: {
        //   not: Number(id),
        // },
      }

    if (hv_type_id == 1) {
      where.group_id = null
    } else if (group_id) {
      where.group_id =
        group_id
    }

    // https://app.clickup.com/t/86etwefn5
    const checkSE =
      await this.prisma.hv_for_peration_flow_and_instructed_flow.findMany(
        {
          where: where
        }
      )

    let flagSE = false
    if (checkSE.length > 0) {
      for (
        let i = 0;
        i < checkSE.length;
        i++
      ) {
        if (
          dayjs(
            checkSE[i]
              ?.start_date
          ).isSame(
            dayjs(start_date)
          )
        ) {
          //https://app.clickup.com/t/86etwefn5
          flagSE = true
          break
        }
        // if (dayjs(checkSE[i]?.start_date).isSameOrAfter(dayjs(start_date))) {
        //   flagSE = true;
        //   break;
        // }
      }
    } else {
      flagSE = false
    }

    if (flagSE) {
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

    const created =
      await this.prisma.hv_for_peration_flow_and_instructed_flow.create(
        {
          data: {
            ...(group_id &&
              hv_type_id ===
                2 && {
                group: {
                  connect: {
                    id: group_id
                  }
                }
              }),
            hv_type: {
              connect: {
                id: hv_type_id
              }
            },
            ...(metering_point_id
              ? {
                  metering_point:
                    {
                      connect:
                        {
                          id: metering_point_id
                        }
                    }
                }
              : {}),
            ...(concept_point_id
              ? {
                  concept_point:
                    {
                      connect:
                        {
                          id: concept_point_id
                        }
                    }
                }
              : {}),
            ...(meter_concept_type_id
              ? {
                  meter_concept_type:
                    {
                      connect:
                        {
                          id: meter_concept_type_id
                        }
                    }
                }
              : {}),
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
          }
        }
      )

    return created
  }

  //
  async edit(
    id: any,
    payload: any,
    userId: any
  ) {
    const {
      hv_type_id,
      group_id,
      metering_point_id,
      meter_concept_type_id,
      concept_point_id,
      start_date
    } = payload

    const where: Prisma.hv_for_peration_flow_and_instructed_flowWhereInput =
      {
        id: {
          not: Number(id)
        },
        concept_point_id:
          concept_point_id,
        meter_concept_type_id:
          meter_concept_type_id,
        metering_point_id:
          metering_point_id,
        hv_type_id: hv_type_id
      }

    if (hv_type_id == 1) {
      where.group_id = null
    } else if (group_id) {
      where.group_id =
        group_id
    }

    const checkSE =
      await this.prisma.hv_for_peration_flow_and_instructed_flow.findMany(
        {
          where: where
        }
      )

    let flagSE = false
    if (checkSE.length > 0) {
      for (
        let i = 0;
        i < checkSE.length;
        i++
      ) {
        if (
          dayjs(
            checkSE[i]
              ?.start_date
          ).isSameOrAfter(
            dayjs(start_date)
          )
        ) {
          flagSE = true
          break
        }
      }
    } else {
      flagSE = false
    }

    if (flagSE) {
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

    const updated =
      await this.prisma.hv_for_peration_flow_and_instructed_flow.updateMany(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...(group_id &&
            hv_type_id === 1
              ? {
                  group_id:
                    null
                }
              : {
                  group_id:
                    group_id
                }),
            hv_type_id:
              hv_type_id,
            meter_concept_type_id:
              meter_concept_type_id ||
              null,
            concept_point_id:
              concept_point_id ||
              null,
            metering_point_id:
              metering_point_id ||
              null,
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            update_date:
              getTodayNowAdd7().toDate(),
            update_date_num:
              getTodayNowAdd7().unix(),
            update_by:
              Number(userId)
          }
        }
      )

    return updated
  }

  async hvType() {
    const resData =
      await this.prisma.hv_type.findMany(
        {}
      )
    return resData
  }

  async meteringPoint() {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()
    const resData =
      await this.prisma.metering_point.findMany(
        {
          where: {
            AND: [
              {
                start_date: {
                  lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                }
              },
              {
                OR: [
                  {
                    end_date:
                      null
                  }, // ถ้า end_date เป็น null
                  {
                    end_date:
                      {
                        gte: todayStart
                      }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          },
          include: {
            zone: true,
            nomination_point: true
          }
        }
      )
    return resData
  }

  async conceptPointTypeMeter() {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()
    const resData =
      await this.prisma.concept_point.findMany(
        {
          where: {
            AND: [
              {
                start_date: {
                  lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                }
              },
              {
                OR: [
                  {
                    end_date:
                      null
                  }, // ถ้า end_date เป็น null
                  {
                    end_date:
                      {
                        gte: todayStart
                      }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ],
            type_concept_point_id: 4
          }
          // include: {
          //   nomination_point: true,
          // },
        }
      )
    return resData
  }

  async meterConceptType() {
    const resData =
      await this.prisma.meter_concept_type.findMany(
        {
          orderBy: {
            id: 'asc'
          }
        }
      )
    return resData
  }
}
