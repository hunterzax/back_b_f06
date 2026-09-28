import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {MeteredMicroService} from 'src/grpc/metered-service.service'
import {
  getTodayEndAdd7,
  getTodayEndYYYYMMDDDfaultAdd7,
  getTodayNow,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayStartAdd7,
  getTodayStartYYYYMMDDDfaultAdd7,
  getWeekRange,
  timeToMinutes
} from 'src/common/utils/date.util'
import {AstosService} from 'src/astos/astos.service'
import {
  divideTo3Decimal,
  divideTo8Decimal,
  parseToNumber,
  parseToNumber3Decimal,
  parseToNumber6Decimal,
  parseToNumber8Decimal
} from 'src/common/utils/number.util'
import {isMatch} from 'src/common/utils/allocation.util'
import {
  getAdjustNom2,
  getNominationPointListFromActiveContractCode,
  readNomFromJsonAs3Decimal,
  sumValueByTimeShow,
  sumValueMmscfAfterGrouped
} from 'src/common/utils/nomination.util'
import { meteringPointPopulate } from '@type/prisma.type'
import {Prisma} from '@prisma/client'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

@Injectable()
export class DailyAdjustmentService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly meteredMicroService: MeteredMicroService,
    @Inject(forwardRef(() => AstosService))
    private readonly astosService: AstosService
  ) {}

  async shipperData(
    payload: any,
    userId: any
  ) {
    const {gas_day, excludeReverseBal, month, start_date, end_date} = payload
    let start =
      getTodayStartAdd7()
    let end =
      getTodayEndAdd7()
    let starOfWeek = start.startOf('week')
    let endOfWeek = end.endOf('week')
  
    if (gas_day) {
      const startOfGasday =
        getTodayStartYYYYMMDDDfaultAdd7(
          gas_day
        )
      const endOfGasday =
        getTodayEndYYYYMMDDDfaultAdd7(
          gas_day
        )
      if (
        startOfGasday.isValid()
      ) {
        start = startOfGasday
        starOfWeek = startOfGasday.startOf('week')
      }
      if (
        endOfGasday.isValid()
      ) {
        end = endOfGasday
        endOfWeek = endOfGasday.endOf('week')
      }
    }
    else if(month) {
      const startOfMonth = getTodayNowYYYYMMDDDfaultAdd7(month).startOf('month')
      const endOfMonth = getTodayNowYYYYMMDDDfaultAdd7(month).endOf('month')
      if (startOfMonth.isValid()) {
        start = startOfMonth
        starOfWeek = startOfMonth
      }
      if (endOfMonth.isValid()) {
        end = endOfMonth
        endOfWeek = endOfMonth
      }
    }
    else {
      const startOfGasday = getTodayStartYYYYMMDDDfaultAdd7(start_date)
      const endOfGasday = getTodayEndYYYYMMDDDfaultAdd7(end_date)
      if (startOfGasday.isValid()) {
        start = startOfGasday
        starOfWeek = startOfGasday.startOf('week')
      }
      if (endOfGasday.isValid()) {
        end = endOfGasday
        endOfWeek = endOfGasday.endOf('week')
      }
    }
    // const { weekStart: targetWeekStart } = getWeekRange(start.toDate());
    // const { weekEnd: targetWeekEnd } = getWeekRange(end.toDate());

    // const statusShow = [2, 5];

    const group = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      },
      select: {
        id: true,
        user_type: {
          select: {
            id: true
          }
        }
      }
    })
    const userTypeId = group?.user_type?.id
    const groupId = group?.id
    
    const groups =
      await this.prisma.group.findMany(
        {
          where: {
            user_type_id: 3,
            ...(userTypeId === 3 && {
              id: groupId
            }),
            // query_shipper_nomination_file: {
            //   some: {
            //     query_shipper_nomination_status: {
            //       id: { in: statusShow },
            //     },
            //     AND: [
            //       {
            //         OR: [{ del_flag: false }, { del_flag: null }],
            //       },
            //     ],
            //   },
            // },
            OR: [
              ...(
                (excludeReverseBal == false || excludeReverseBal == 'false') ?
                [] :
                [
                  {
                    reserve_balancing_gas_contract: {
                      some: {
                        reserve_balancing_gas_contract_detail: {
                          some: {
                            start_date: {
                              lte: end.toDate()
                            },
                            OR: [
                              {
                                end_date: null
                              },
                              {
                                end_date: {
                                  gt: start.toDate()
                                }
                              }
                            ]
                          }
                        }
                      }
                    }
                  }
                ]
              ),
              {
            contract_code: {
              some: {
                contract_start_date:
                  {
                    lte: end.toDate()
                  }, // Started before or on target date
                AND: [
                  // Not rejected
                  {
                    status_capacity_request_management:
                      {
                        NOT: {
                          name: {
                            equals:
                              'Rejected',
                            mode: 'insensitive'
                          }
                        }
                      }
                  },
                  // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
                  {
                    OR: [
                      {
                        terminate_date:
                          null
                      }, // No terminate date
                      {
                        terminate_date:
                          {
                            gt: start.toDate()
                          }
                      } // Terminate date is after target date
                    ]
                  },
                  // Use extend_deadline if available, otherwise use contract_end_date
                  {
                    OR: [
                      // If extend_deadline exists, use it as end date
                      {
                        AND: [
                          {
                            extend_deadline:
                              {
                                not: null
                              }
                          },
                          {
                            extend_deadline:
                              {
                                gt: start.toDate()
                              }
                          }
                        ]
                      },
                      // If extend_deadline is null, use contract_end_date
                      {
                        AND: [
                          {
                            extend_deadline:
                              null
                          },
                          {
                            OR: [
                              {
                                contract_end_date:
                                  null
                              },
                              {
                                contract_end_date:
                                  {
                                    gt: start.toDate()
                                  }
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
              }
            ]
          },
          include: {
            // query_shipper_nomination_file: {
            //   include: {
            //     nomination_type: true,
            //     nomination_version: {
            //       include: {
            //         nomination_row_json: true,
            //       },
            //       where: {
            //         flag_use: true,
            //       },
            //       orderBy: {
            //         id: 'desc',
            //       },
            //     },
            //   },
            //   where: {
            //     gas_day: { gte: targetWeekStart, lte: targetWeekEnd }
            //   }
            // },
            contract_code: {
              include: {
                group: true,
                booking_version:
                  {
                    select: {
                      booking_row_json: true,
                      booking_row_json_release: {
                        select: {
                          zone_text: true,
                          area_text: true,
                          entry_exit_id: true,
                          entry_exit: true,
                          contract_point: true
                        }
                      }
                    },
                    take: 1,
                    where: {
                      flag_use: true
                    },
                    orderBy: {
                      id: 'desc'
                    }
                  }
              },
              where: {
                contract_start_date:
                  {
                    lte: endOfWeek.toDate()
                  }, // Started before or on target date
                AND: [
                  // Not rejected
                  {
                    status_capacity_request_management:
                      {
                        NOT: {
                          name: {
                            equals:
                              'Rejected',
                            mode: 'insensitive'
                          }
                        }
                      }
                  },
                  // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
                  {
                    OR: [
                      {
                        terminate_date:
                          null
                      }, // No terminate date
                      {
                        terminate_date:
                          {
                            gt: starOfWeek.toDate()
                          }
                      } // Terminate date is after target date
                    ]
                  },
                  // Use extend_deadline if available, otherwise use contract_end_date
                  {
                    OR: [
                      // If extend_deadline exists, use it as end date
                      {
                        AND: [
                          {
                            extend_deadline:
                              {
                                not: null
                              }
                          },
                          {
                            extend_deadline:
                              {
                                gt: starOfWeek.toDate()
                              }
                          }
                        ]
                      },
                      // If extend_deadline is null, use contract_end_date
                      {
                        AND: [
                          {
                            extend_deadline:
                              null
                          },
                          {
                            OR: [
                              {
                                contract_end_date:
                                  null
                              },
                              {
                                contract_end_date:
                                  {
                                    gt: starOfWeek.toDate()
                                  }
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            },
            reserve_balancing_gas_contract: {
              include: {
                group: true,
                reserve_balancing_gas_contract_comment: true,
                reserve_balancing_gas_contract_detail: {
                  include: {
                    nomination_point: {
                      include: {
                        area: true,
                        zone: true
                      }
                    },
                    area: true,
                    zone: true
                  }
                },
                reserve_balancing_gas_contract_files: true
              },
              where: {
                reserve_balancing_gas_contract_detail: {
                  some: {
                    start_date: {
                      lte: end.toDate()
                    },
                    OR: [
                      {
                        end_date: null
                      },
                      {
                        end_date: {
                          gt: starOfWeek.toDate()
                        }
                      }
                    ]
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

    // //   Filter ข้อมูล query_shipper_nomination_file ให้ตรงเงื่อนไข
    // const filStatus = groups.map((group) => ({
    //   ...group,
    //   query_shipper_nomination_file: group.query_shipper_nomination_file.filter(
    //     (file) => statusShow.includes(file.query_shipper_nomination_status_id),
    //   ),
    // }));
    const filStatus = groups

    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()
    const area =
      await this.prisma.area.findMany(
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
            zone: true
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    const nomData =
      filStatus.map(
        (e: any) => {
          // const query_shipper_nomination_file = e[
          //   'query_shipper_nomination_file'
          // ].map((eq: any) => {
          //   const nomination_version = eq['nomination_version'].map((ev: any) => {
          //     const nomination_row_json = ev['nomination_row_json'].map(
          //       (erj: any) => {
          //         const area_text = erj['area_text'];
          //         const zone_text = erj['zone_text'];
          //         const entry_exit_id = erj['entry_exit_id'];
          //         const findArea = area.find((f: any) => {
          //           return (
          //             f?.name === area_text &&
          //             f?.entry_exit_id === entry_exit_id &&
          //             f?.zone?.name === zone_text
          //           );
          //         });
          //         const areaId = (!!findArea && findArea?.id) || null;

          //         return { ...erj, areaId };
          //       },
          //     );

          //     return { ...ev, nomination_row_json };
          //   });

          //   return { ...eq, nomination_version };
          // });

          // return { ...e, query_shipper_nomination_file };

          const contract_code =
            e[
              'contract_code'
            ].map(
              (eq: any) => {
                const booking_version =
                  eq[
                    'booking_version'
                  ].map(
                    (
                      ev: any
                    ) => {
                      const booking_row_json =
                        ev[
                          'booking_row_json'
                        ].map(
                          (
                            erj: any
                          ) => {
                            const area_text =
                              erj[
                                'area_text'
                              ]
                            const zone_text =
                              erj[
                                'zone_text'
                              ]
                            const entry_exit_id =
                              erj[
                                'entry_exit_id'
                              ]
                            const findArea =
                              area.find(
                                (
                                  f: any
                                ) => {
                                  return (
                                    f?.name ===
                                      area_text &&
                                    f?.entry_exit_id === entry_exit_id &&
                                    f
                                      ?.zone
                                      ?.name ===
                                      zone_text
                                  )
                                }
                              )
                            const areaId =
                              (!!findArea &&
                                findArea?.id) ||
                              null

                            return {
                              ...erj,
                              areaId
                            }
                          }
                        )

                      return {
                        ...ev,
                        booking_row_json
                      }
                    }
                  )

                return {
                  ...eq,
                  booking_version
                }
              }
            )

          return {
            ...e,
            contract_code
          }
        }
      )

    return nomData
  }

  async nominationPointData(
    payload: any
  ) {
    const {
      shipper_id,
      entry_exit_id,
      area_id,
      gas_day,
      time
    } = payload
    const gasDayDate =
      new Date(gas_day)
    const gasDay =
      getTodayNowAdd7(gas_day)
    const yesterday =
      gasDay.isSameOrAfter(
        dayjs()
      )
        ? dayjs()
            .startOf('day')
            .subtract(
              1,
              'day'
            )
        : gasDay.subtract(
            1,
            'day'
          )

    const areaData =
      await this.prisma.area.findMany(
        {
          where: {
            id: {
              in: (
                JSON.parse(
                  area_id
                ) || []
              ).map(
                (e: any) =>
                  Number(e)
              )
            }
          },
          select: {
            id: true,
            name: true
          }
        }
      )

    const bookingRowJson =
      await this.prisma.booking_row_json.findMany(
        {
          where: {
            booking_version: {
              flag_use: true,
              contract_code: {
                contract_start_date:
                  {
                    lte: gasDayDate
                  }, // Started before or on target date
                AND: [
                  // Not rejected
                  {
                    status_capacity_request_management:
                      {
                        NOT: {
                          name: {
                            equals:
                              'Rejected',
                            mode: 'insensitive'
                          }
                        }
                      }
                  },
                  // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
                  {
                    OR: [
                      {
                        terminate_date:
                          null
                      }, // No terminate date
                      {
                        terminate_date:
                          {
                            gt: gasDayDate
                          }
                      } // Terminate date is after target date
                    ]
                  },
                  // Use extend_deadline if available, otherwise use contract_end_date
                  {
                    OR: [
                      // If extend_deadline exists, use it as end date
                      {
                        AND: [
                          {
                            extend_deadline:
                              {
                                not: null
                              }
                          },
                          {
                            extend_deadline:
                              {
                                gt: gasDayDate
                              }
                          }
                        ]
                      },
                      // If extend_deadline is null, use contract_end_date
                      {
                        AND: [
                          {
                            extend_deadline:
                              null
                          },
                          {
                            OR: [
                              {
                                contract_end_date:
                                  null
                              },
                              {
                                contract_end_date:
                                  {
                                    gt: gasDayDate
                                  }
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ],
                group_id: {
                  in: (
                    JSON.parse(
                      shipper_id
                    ) || []
                  ).map(
                    (
                      e: any
                    ) =>
                      Number(
                        e
                      )
                  )
                }
              }
            }
          },
          select: {
            contract_point: true
          }
        }
      )

    const meteringPointMaster =
      await this.prisma.metering_point.findMany(
        {
          where: {
            OR: [
              {
                end_date: null
              },
              {
                end_date: {
                  gt: yesterday.toDate()
                }
              }
            ],
            start_date: {
              lte: gasDay.toDate()
            }
          },
          ...meteringPointPopulate
        }
      )

    const nomData =
      await this.prisma.query_shipper_nomination_file.findMany(
        {
          where: {
            NOT: {
              contract_code_id:
                null
            }, // revers bal ไม่แสดง effect
            query_shipper_nomination_status:
              {
                id: {
                  in: [2, 5]
                }
              },
            group: {
              id: {
                in: (
                  JSON.parse(
                    shipper_id
                  ) || []
                ).map(
                  (e: any) =>
                    Number(e)
                )
              }
            },
            AND: [
              {
                OR: [
                  {
                    del_flag: false
                  },
                  {
                    del_flag:
                      null
                  }
                ]
              },
              {
                OR: [
                  // Daily nominations: exact date match
                  {
                    nomination_type:
                      {
                        id: 1
                      },
                    gas_day: {
                      gte: gasDay.toDate(),
                      lte: gasDay.toDate()
                    }
                  },
                  // Weekly nominations: same week
                  {
                    nomination_type:
                      {
                        id: 2
                      },
                    gas_day: {
                      gte: gasDay
                        .startOf(
                          'week'
                        )
                        .toDate(),
                      lte: gasDay
                        .endOf(
                          'week'
                        )
                        .toDate()
                    }
                  }
                ]
              }
            ]
          },
          include: {
            nomination_type: true,
            query_shipper_nomination_status: true,
            nomination_version:
              {
                include: {
                  // nomination_full_json:true,
                  nomination_row_json:
                    {
                      where: {
                        query_shipper_nomination_type_id: 1
                      }
                    }
                },
                where: {
                  flag_use: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    const converData =
      nomData.map(
        (e: any) => {
          const nomination_version =
            e[
              'nomination_version'
            ].map(
              (eN: any) => {
                const nomination_row_json =
                  eN[
                    'nomination_row_json'
                  ].map(
                    (
                      eRj: any
                    ) => {
                      const data_temp =
                        JSON.parse(
                          eRj[
                            'data_temp'
                          ]
                        )
                      const nomPoint =
                        data_temp[
                          '3'
                        ]
                      return {
                        ...eRj,
                        data_temp,
                        nomPoint
                      }
                    }
                  )

                return {
                  ...eN,
                  nomination_row_json
                }
              }
            )

          return {
            ...e,
            nomination_version
          }
        }
      )

    let nominationPoint = []
    for (
      let i = 0;
      i < converData.length;
      i++
    ) {
      for (
        let i1 = 0;
        i1 <
        converData[i]
          ?.nomination_version
          .length;
        i1++
      ) {
        for (
          let i2 = 0;
          i2 <
          converData[i]
            ?.nomination_version[
            i1
          ]
            ?.nomination_row_json
            .length;
          i2++
        ) {
          nominationPoint.push(
            {
              id: converData[
                i
              ]
                ?.nomination_version[
                i1
              ]
                ?.nomination_row_json[
                i2
              ]?.id,
              nomPoint:
                converData[i]
                  ?.nomination_version[
                  i1
                ]
                  ?.nomination_row_json[
                  i2
                ]?.nomPoint,
              area_text:
                converData[i]
                  ?.nomination_version[
                  i1
                ]
                  ?.nomination_row_json[
                  i2
                ]?.area_text,
              zone_text:
                converData[i]
                  ?.nomination_version[
                  i1
                ]
                  ?.nomination_row_json[
                  i2
                ]?.zone_text,
              entry_exit_id:
                converData[i]
                  ?.nomination_version[
                  i1
                ]
                  ?.nomination_row_json[
                  i2
                ]
                  ?.entry_exit_id,
              query_shipper_nomination_type_id:
                converData[i]
                  ?.nomination_version[
                  i1
                ]
                  ?.nomination_row_json[
                  i2
                ]
                  ?.query_shipper_nomination_type_id,
              nomination_version_id:
                converData[i]
                  ?.nomination_version[
                  i1
                ]?.id,
              contract_code_id:
                converData[i]
                  ?.contract_code_id,
              nomination_type_id:
                converData[i]
                  ?.nomination_type
                  ?.id,
              row_id:
                converData[i]
                  ?.id,
              unit:
                converData[i]
                  ?.nomination_version[
                  i1
                ]
                  ?.nomination_row_json[
                  i2
                ]?.data_temp[
                  '9'
                ] || null
            }
          )
        }
      }
    }

    const nominationPointApi =
      await this.prisma.nomination_point.findMany(
        {
          where: {
            AND: [
              {
                OR: [
                  {
                    nomination_point:
                      {
                        in:
                          (
                            nominationPoint ||
                            []
                          ).map(
                            (
                              e: any
                            ) =>
                              e?.nomPoint
                          ) ||
                          []
                      }
                  },
                  {
                    contract_point_list:
                      {
                        some: {
                          contract_point:
                            {
                              in: Array.from(
                                new Set(
                                  bookingRowJson.map(
                                    (
                                      e: any
                                    ) =>
                                      e.contract_point
                                  )
                                )
                              )
                            }
                        }
                      }
                  }
                ]
              },
              {
                OR: [
                  {
                    area: {
                      id: {
                        in:
                          (
                            areaData ||
                            []
                          ).map(
                            (
                              e: any
                            ) =>
                              e?.id
                          ) ||
                          []
                      }
                    }
                  },
                  {
                    area: {
                      name: {
                        in:
                          (
                            areaData ||
                            []
                          ).map(
                            (
                              e: any
                            ) =>
                              e?.name
                          ) ||
                          []
                      }
                    }
                  }
                ]
              },
              {
                entry_exit_id:
                  Number(
                    entry_exit_id
                  )
              },
              {
                start_date: {
                  lte: gasDayDate // start_date must be before or same as gas day
                }
              },
              {
                OR: [
                  {
                    end_date:
                      null
                  }, // if end_date is null
                  {
                    end_date:
                      {
                        gt: gasDayDate
                      }
                  } // if end_date is not null, must be after gas day
                ]
              }
            ]
          },
          include: {
            metering_point: true,
            contract_point_list: true
          }
        }
      )

    // Extract gas days and generate date array
    const gasDayDateString =
      gasDayDate
        .toISOString()
        .split('T')[0]
    const dateArray: string[] =
      [gasDayDateString]

    // Build active data for all dates
    let activeData: any[] = []
    try {
      // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
      let current =
        yesterday.clone()
      while (
        current.isSameOrBefore(
          gasDay,
          'day'
        )
      ) {
        dateArray.push(
          current.format(
            'YYYY-MM-DD'
          )
        )
        activeData.push({
          date: current.format(
            'YYYY-MM-DD'
          ),
          activeMeteringPoints:
            meteringPointMaster.filter(
              (
                meteringPoint
              ) =>
                meteringPoint.start_date <=
                  current.toDate() &&
                (meteringPoint.end_date ===
                  null ||
                  meteringPoint.end_date >=
                    current.toDate())
            )
        })
        current = current.add(
          1,
          'day'
        )
      }
    } catch (error) {
      activeData = undefined
    }

    const meteredMicroData =
      await this.meteredMicroService.sendMessage(
        JSON.stringify({
          case: 'getLast',
          mode: 'metering',
          // meter มีแต่ค่าวันนี้ ไม่มีค่าวันก่อนหน้า ดึงเมื่อวานเผื่อวันนี้ไม่มีค่า
          start_date:
            yesterday
              .tz(
                'Asia/Bangkok'
              )
              .format(
                'YYYY-MM-DD'
              ),
          end_date:
            gasDayDateString
          // start_date: "2025-03-08",
          // end_date:"2025-03-10"
        }),
        {
          activeData,
          prisma: this.prisma
        }
      )
    const dataConvert =
      (!!meteredMicroData?.reply &&
        JSON.parse(
          meteredMicroData?.reply
        )) ||
      null

    // Filter to keep only the latest entry per meteringPointId based on gasDay and gasHour
    // const dataConvertFiltered = (dataConvert ?? []).reduce((acc: any[], item: any) => {
    const dataConvertFiltered =
      (
        Array.isArray(
          dataConvert
        )
          ? dataConvert
          : []
      ).reduce(
        (
          acc: any[],
          item: any
        ) => {
          const existingIndex =
            acc.findIndex(
              (existing) =>
                existing.meteringPointId ===
                item.meteringPointId
            )

          if (
            existingIndex ===
            -1
          ) {
            // First occurrence of this meteringPointId
            acc.push(item)
          } else {
            // Compare with existing entry
            const existing =
              acc[
                existingIndex
              ]
            const existingDate =
              new Date(
                existing.gasDay
              )
            const itemDate =
              new Date(
                item.gasDay
              )

            // Compare dates first, then gasHour
            if (
              itemDate >
                existingDate ||
              (itemDate.getTime() ===
                existingDate.getTime() &&
                item.gasHour >
                  existing.gasHour)
            ) {
              // Replace with newer entry
              acc[
                existingIndex
              ] = item
            }
          }

          return acc
        },
        []
      )

    const resData =
      nominationPointApi.map(
        (e: any) => {
          let meterMaster =
            e?.metering_point?.map(
              (es: any) =>
                es?.metered_point_name
            )
          const resultCon =
            dataConvertFiltered.filter(
              (item) =>
                meterMaster.includes(
                  item.meteringPointId
                )
            )
          const totalHeatingValue =
            resultCon.length >
            0
              ? resultCon.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.heatingValue *
                      item.volume,
                  0
                )
              : null

          const volumeSum =
            resultCon.length >
            0
              ? resultCon.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.volume,
                  0
                )
              : null

          let sumHVall =
            resultCon.length >
            0
              ? Number(
                  (
                    totalHeatingValue /
                    volumeSum
                  ).toFixed(3)
                )
              : null

          const heating_value =
            sumHVall
          const valumeMMSCFD =
            null
          const valumeMMSCFH =
            null
          const valumeMMSCFD2 =
            null
          const valumeMMSCFH2 =
            null
          return {
            ...e,
            calc: {
              heating_value,
              valumeMMSCFD,
              valumeMMSCFH,
              valumeMMSCFD2,
              valumeMMSCFH2
            }
          }
        }
      )

    return {
      gas_day: gas_day,
      nom: resData
    }
  }

  async nominationPointData2(payload: any) {
    const { shipper_id, entry_exit_id, area_id, gas_day, time } = payload;
    const gasDayDate = new Date(gas_day);
    const gasDay = getTodayNowAdd7(gas_day);
    const yesterday = gasDay.isSameOrAfter(dayjs()) ? dayjs().startOf('day').subtract(1, 'day') : gasDay.subtract(1, 'day');

    const areaData = await this.prisma.area.findMany({
      where: {
        id: {
          in: (JSON.parse(area_id) || []).map((e: any) => Number(e)),
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const bookingRowJson = await this.prisma.booking_row_json.findMany({
      where: {
        booking_version: {
          flag_use: true,
          contract_code: {
            contract_start_date: {
              lte: gasDayDate,
            }, // Started before or on target date
            AND: [
              // Not rejected
              {
                status_capacity_request_management: {
                  NOT: {
                    name: {
                      equals: 'Rejected',
                      mode: 'insensitive',
                    },
                  },
                },
              },
              // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
              {
                OR: [
                  {
                    terminate_date: null,
                  }, // No terminate date
                  {
                    terminate_date: {
                      gt: gasDayDate,
                    },
                  }, // Terminate date is after target date
                ],
              },
              // Use extend_deadline if available, otherwise use contract_end_date
              {
                OR: [
                  // If extend_deadline exists, use it as end date
                  {
                    AND: [
                      {
                        extend_deadline: {
                          not: null,
                        },
                      },
                      {
                        extend_deadline: {
                          gt: gasDayDate,
                        },
                      },
                    ],
                  },
                  // If extend_deadline is null, use contract_end_date
                  {
                    AND: [
                      {
                        extend_deadline: null,
                      },
                      {
                        OR: [
                          {
                            contract_end_date: null,
                          },
                          {
                            contract_end_date: {
                              gt: gasDayDate,
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            group_id: {
              in: (JSON.parse(shipper_id) || []).map((e: any) => Number(e)),
            },
          },
        },
      },
      select: {
        contract_point: true,
      },
    });

    const nomData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        // NOT: {
        //   contract_code_id: null,
        // }, // revers bal ไม่แสดง effect
        query_shipper_nomination_status: {
          id: {
            in: [2, 5],
          },
        },
        group: {
          id: {
            in: (JSON.parse(shipper_id) || []).map((e: any) => Number(e)),
          },
        },
        AND: [
          {
            OR: [
              {
                del_flag: false,
              },
              {
                del_flag: null,
              },
            ],
          },
          {
            OR: [
              // Daily nominations: exact date match
              {
                nomination_type: {
                  id: 1,
                },
                gas_day: {
                  gte: gasDay.toDate(),
                  lte: gasDay.toDate(),
                },
              },
              // Weekly nominations: same week
              {
                nomination_type: {
                  id: 2,
                },
                gas_day: {
                  gte: gasDay.startOf('week').toDate(),
                  lte: gasDay.endOf('week').toDate(),
                },
              },
            ],
          },
        ],
      },
      include: {
        nomination_type: true,
        query_shipper_nomination_status: true,
        nomination_version: {
          include: {
            // nomination_full_json:true,
            nomination_row_json: {
              where: {
                query_shipper_nomination_type_id: 1,
              },
            },
          },
          where: {
            flag_use: true,
          },
        },
      },
      orderBy: {
        id: 'desc',
      },
    });

    const converData = nomData.map((e: any) => {
      const nomination_version = e['nomination_version'].map((eN: any) => {
        const nomination_row_json = eN['nomination_row_json'].map((eRj: any) => {
          const data_temp = JSON.parse(eRj['data_temp']);
          const nomPoint = data_temp['3'];
          return {
            ...eRj,
            data_temp,
            nomPoint,
          };
        });

        return {
          ...eN,
          nomination_row_json,
        };
      });

      return {
        ...e,
        nomination_version,
      };
    });

    let nominationPoint = [];
    for (let i = 0; i < converData.length; i++) {
      for (let i1 = 0; i1 < converData[i]?.nomination_version.length; i1++) {
        for (let i2 = 0; i2 < converData[i]?.nomination_version[i1]?.nomination_row_json.length; i2++) {
          nominationPoint.push({
            id: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.id,
            nomPoint: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.nomPoint,
            area_text: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.area_text,
            zone_text: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.zone_text,
            entry_exit_id: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.entry_exit_id,
            query_shipper_nomination_type_id: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.query_shipper_nomination_type_id,
            nomination_version_id: converData[i]?.nomination_version[i1]?.id,
            contract_code_id: converData[i]?.contract_code_id,
            nomination_type_id: converData[i]?.nomination_type?.id,
            row_id: converData[i]?.id,
            unit: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.data_temp['9'] || null,
          });
        }
      }
    }

    const nominationPointApi = await this.prisma.nomination_point.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                nomination_point: {
                  in: (nominationPoint || []).map((e: any) => e?.nomPoint) || [],
                },
              },
              {
                contract_point_list: {
                  some: {
                    contract_point: {
                      in: Array.from(new Set(bookingRowJson.map((e: any) => e.contract_point))),
                    },
                  },
                },
              },
            ],
          },
          {
            OR: [
              {
                area: {
                  id: {
                    in: (areaData || []).map((e: any) => e?.id) || [],
                  },
                },
              },
              {
                area: {
                  name: {
                    in: (areaData || []).map((e: any) => e?.name) || [],
                  },
                },
              },
            ],
          },
          {
            entry_exit_id: Number(entry_exit_id),
          },
          {
            start_date: { lte: gasDayDate }, // start_date must be before or same as gas day
          },
          {
            OR: [
              { end_date: null }, // if end_date is null
              { end_date: { gt: gasDayDate } }, // if end_date is not null, must be after gas day
            ],
          },
        ],
      },
      include: {
        metering_point: true,
        contract_point_list: true,
      },
    });

    const meteringPointMaster = await this.prisma.metering_point.findMany({
      where: {
        OR: [
          {
            end_date: null,
          },
          {
            end_date: {
              gt: yesterday.toDate(),
            },
          },
        ],
        start_date: {
          lte: gasDay.toDate(),
        },
      },
      ...meteringPointPopulate,
    });

    // Extract gas days and generate date array
    const gasDayDateString = gasDayDate.toISOString().split('T')[0];
    const dateArray: string[] = [gasDayDateString];

    // Build active data for all dates
    let activeData: any[] = [];
    try {
      // Fill dateArray with all dates between getMeterFrom and getMeterTo (inclusive) in YYYY-MM-DD format
      let current = yesterday.clone();
      while (current.isSameOrBefore(gasDay, 'day')) {
        dateArray.push(current && current.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'))
        activeData.push({
          date: current.format('YYYY-MM-DD'),
          activeMeteringPoints: meteringPointMaster.filter((meteringPoint) => meteringPoint.start_date <= current.toDate() && (meteringPoint.end_date === null || meteringPoint.end_date > current.toDate())),
        });
        current = current.add(1, 'day');
      }
    } catch (error) {
      activeData = undefined;
    }

    const meteredMicroData = await this.meteredMicroService.sendMessage(
      JSON.stringify({
        case: 'getLast',
        mode: 'metering',
        // meter มีแต่ค่าวันนี้ ไม่มีค่าวันก่อนหน้า ดึงเมื่อวานเผื่อวันนี้ไม่มีค่า
        start_date: yesterday.tz('Asia/Bangkok').format('YYYY-MM-DD'),
        end_date: gasDayDateString,
        // start_date: "2025-03-08",
        // end_date:"2025-03-10"
      }),
      {
        activeData,
        prisma: this.prisma,
      },
    );
    const dataConvert = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null;

    // Filter to keep only the latest entry per meteringPointId based on gasDay and gasHour
    // const dataConvertFiltered = (dataConvert ?? []).reduce((acc: any[], item: any) => {
    const dataConvertFiltered = (Array.isArray(dataConvert) ? dataConvert : []).reduce((acc: any[], item: any) => {
      const existingIndex = acc.findIndex((existing) => existing.meteringPointId === item.meteringPointId);

      if (existingIndex === -1) {
        // First occurrence of this meteringPointId
        acc.push(item);
      } else {
        // Compare with existing entry
        const existing = acc[existingIndex];
        const existingDate = new Date(existing.gasDay);
        const itemDate = new Date(item.gasDay);

        // Compare dates first, then gasHour
        if (itemDate > existingDate || (itemDate.getTime() === existingDate.getTime() && item.gasHour > existing.gasHour)) {
          // Replace with newer entry
          acc[existingIndex] = item;
        }
      }

      return acc;
    }, []);

    const resData = nominationPointApi.map(e => {
      const activeMeterPointOfNomPoint = []
      activeData.filter(item => item.date == gasDay.format('YYYY-MM-DD')).map(item => {
        const targetList = item.activeMeteringPoints.filter((activeMeteringPoint: any) => 
          activeMeteringPoint.nomination_point?.nomination_point === e?.nomination_point
          && !activeMeterPointOfNomPoint.some((existPoint: any) => existPoint.id === activeMeteringPoint.id)
        )
        activeMeterPointOfNomPoint.push(...targetList)
      });
      const meterPointNameList = activeMeterPointOfNomPoint.map((es: any) => es?.metered_point_name);
      const meterPointMeteredIdList = activeMeterPointOfNomPoint.map((es: any) => es?.metered_id);
      const resultCon = dataConvertFiltered.filter((item: any) => meterPointNameList.includes(item.meteringPointId) || meterPointMeteredIdList.includes(item.meteringPointId));
      const totalHeatingValue = resultCon.length > 0 ? 
      resultCon.reduce((sum: number, item: any) => {
        if(item.heatingValue && item.volume) {
          return parseToNumber8Decimal(sum + parseToNumber8Decimal(item.heatingValue * item.volume))
        }
        return sum
      }, 0)
      : null;

      const volumeSum = resultCon.length > 0 ? resultCon.reduce((sum: number, item: any) => {
        if(item.volume) {
          return parseToNumber8Decimal(sum + item.volume)
        }
        return sum
      }, 0)
      : null;

      let sumHVall = resultCon.length > 0 ? divideTo8Decimal(totalHeatingValue, volumeSum) : null;
      

      const heating_value = sumHVall;
      const valumeMMSCFD = null;
      const valumeMMSCFH = null;
      const valumeMMSCFD2 = null;
      const valumeMMSCFH2 = null;
      return {
        ...e,
        calc: {
          heating_value,
          valumeMMSCFD,
          valumeMMSCFH,
          valumeMMSCFD2,
          valumeMMSCFH2,
        },
      };
    });

    return {
      gas_day: gas_day,
      nom: resData,
    };
  }

  async findAll(
    payload: any,
    userId: any
  ) {
    const {gas_day} = payload
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

    let limit:
      | number
      | undefined = undefined
    const where: Prisma.daily_adjustmentWhereInput =
      {}
    if (gas_day) {
      const gasDay =
        getTodayNowYYYYMMDDDfaultAdd7(
          gas_day
        )
      if (gasDay.isValid()) {
        where.gas_day =
          gasDay.toDate()
      } else {
        limit = 1000
      }
    } else {
      limit = 1000
    }
    if (userType?.id === 3) {
      const shipper =
        await this.prisma.group.findFirst(
          {
            where: {
              account_manage:
                {
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
        await this.prisma.daily_adjustment.findMany(
          {
            where: {
              daily_adjustment_group:
                {
                  some: {
                    group_id:
                      Number(
                        shipper?.id
                      )
                  }
                }
            },
            include: {
              daily_adjustment_group:
                {
                  include: {
                    group: {
                      include:
                        {
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
                  }
                },
              daily_adjustment_nom:
                {
                  include: {
                    nomination_point: true
                  }
                },
              daily_adjustment_status: true,
              daily_adjustment_reason:
                {
                  include: {
                    daily_adjustment_status: true,
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
                }
            },
            orderBy: {
              id: 'desc'
            },
            take: limit
          }
        )

      return resData
    } else {
      const resData =
        await this.prisma.daily_adjustment.findMany(
          {
            where: {},
            include: {
              daily_adjustment_group:
                {
                  include: {
                    group: {
                      include:
                        {
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
                  }
                },
              daily_adjustment_nom:
                {
                  include: {
                    nomination_point: true
                  }
                },
              daily_adjustment_status: true,
              daily_adjustment_reason:
                {
                  include: {
                    daily_adjustment_status: true,
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
                }
            },
            orderBy: {
              id: 'desc'
            },
            take: limit
          }
        )

      return resData
    }
  }

  async create(
    payload: any,
    userId: any
  ) {
    const {
      gas_day,
      time,
      shipper_id,
      area_id,
      entry_exit_id,
      nom
    } = payload

    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()

    // const userType =
    //   await this.prisma.user_type.findFirst(
    //     {
    //       where: {
    //         account_manage: {
    //           some: {
    //             account_id:
    //               Number(
    //                 userId
    //               )
    //           }
    //         }
    //       }
    //     }
    //   )

    const nominationPoint =
      await this.prisma.nomination_point.findMany(
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
          select: {
            id: true,
            nomination_point: true,
            area: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      )

    // check area nom https://app.clickup.com/t/86eth5yx8
    for (
      let i = 0;
      i < nom.length;
      i++
    ) {
      const findNomArea =
        nominationPoint?.find(
          (f: any) => {
            return (
              f?.nomination_point ===
              nom[i]
                ?.nomination_point
              // && f?.area?.id === area_id
            )
          }
        )
      if (!!!findNomArea) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'Area Missing Nomination Point'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    const dailyAdjustmentCount =
      await this.prisma.daily_adjustment.count(
        {
          where: {
            create_date: {
              gte: getTodayStartAdd7().toDate(), // เริ่มต้นวันตามเวลาประเทศไทย
              lte: getTodayEndAdd7().toDate() // สิ้นสุดวันตามเวลาประเทศไทย
            }
          }
        }
      )

    const numDaily = `${dayjs().format('YYYYMMDD')}-DA-${String(dailyAdjustmentCount + 1).padStart(4, '0')}`

    this.prisma.$transaction(
      async (tx) => {
        const dailyAdjustment =
          await tx.daily_adjustment.create(
            {
              data: {
                daily_code:
                  numDaily,
                daily_adjustment_status:
                  {
                    connect: {
                      // id: userType?.id === 3 || userType?.id === 4 ? 1 : 2
                      id: 1
                    }
                  },
                // area: {
                //   connect: {
                //     id: area_id,
                //   },
                // },
                entry_exit: {
                  connect: {
                    id: entry_exit_id
                  }
                },
                gas_day:
                  getTodayNowYYYYMMDDDfaultAdd7(
                    gas_day
                  ).toDate(),
                time: time,
                create_date:
                  getTodayNowAdd7().toDate(),
                create_date_num:
                  getTodayNowAdd7().unix(),
                create_by_account:
                  {
                    connect: {
                      id: Number(
                        userId
                      )
                    }
                  }
              }
            }
          )

        let dataShipper = []
        for (
          let i = 0;
          i <
          shipper_id.length;
          i++
        ) {
          dataShipper.push({
            daily_adjustment_id:
              dailyAdjustment?.id,
            group_id: Number(
              shipper_id[i]
            )
          })
        }
        await tx.daily_adjustment_group.createMany(
          {
            data: dataShipper
          }
        )

        let dataNom = []
        for (
          let i = 0;
          i < nom.length;
          i++
        ) {
          dataNom.push({
            daily_adjustment_id:
              dailyAdjustment?.id,
            nomination_point_id:
              nom[i]
                ?.nomination_point_id,
            heating_value:
              (!!nom[i]
                ?.heating_value &&
                String(
                  nom[i]
                    ?.heating_value
                )) ||
              null,
            valume_mmscfd:
              nom[i]
                ?.valumeMMSCFD,
            valume_mmscfh:
              nom[i]
                ?.valumeMMSCFH,
            valume_mmscfd2:
              nom[i]
                ?.valumeMMSCFD2,
            valume_mmscfh2:
              nom[i]
                ?.valumeMMSCFH2,
            create_date:
              getTodayNowAdd7().toDate(),
            create_date_num:
              getTodayNowAdd7().unix(),
            create_by:
              Number(userId)
          })
        }
        await tx.daily_adjustment_nom.createMany(
          {
            data: dataNom
          }
        )
      }
    )

    return payload
  }

  async updateStatus(
    id: any,
    payload: any,
    userId: any
  ) {
    const {status, reason} =
      payload
    const dailyAdjustment =
      await this.prisma.daily_adjustment.updateMany(
        {
          where: {
            id: Number(id)
          },
          data: {
            daily_adjustment_status_id:
              status,
            update_date:
              getTodayNowAdd7().toDate(),
            update_date_num:
              getTodayNowAdd7().unix(),
            update_by:
              Number(userId)
          }
        }
      )

    if (reason) {
      await this.prisma.daily_adjustment_reason.create(
        {
          data: {
            reason: reason,
            daily_adjustment:
              {
                connect: {
                  id: Number(
                    id
                  )
                }
              },
            daily_adjustment_status:
              {
                connect: {
                  id: status
                }
              },
            create_date:
              getTodayNowAdd7().toDate(),
            create_date_num:
              getTodayNowAdd7().unix(),
            create_by_account:
              {
                connect: {
                  id: Number(
                    userId
                  )
                }
              }
          }
        }
      )
    }

    return dailyAdjustment
  }

  // https://app.clickup.com/t/86eth5ywz
  async dailyAdjustmentSummary(
    payload: any,
    userId: any
  ) {
    const {
      checkAdjustment,
      startDate,
      endDate,
      contractCode
    } = payload

    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()
    const daysOfWeek = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday'
    ]

    const areaMaster =
      await this.prisma.area.findMany(
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
          }
        }
      )

    const entryExitMaster =
      await this.prisma.entry_exit.findMany(
        {
          where: {}
        }
      )

    const dailyAdjust =
      await this.prisma.daily_adjustment.findMany(
        {
          where: {
            daily_adjustment_status_id: 2
          },
          include: {
            area: true,
            entry_exit: true,
            daily_adjustment_group:
              {
                include: {
                  group: {
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
                }
              },
            daily_adjustment_nom:
              {
                include: {
                  nomination_point: true
                }
              },
            daily_adjustment_status: true
          },
          orderBy: {
            id: 'asc'
          }
        }
      )

    const nominationData =
      await this.prisma.query_shipper_nomination_file.findMany(
        {
          where: {
            NOT: {
              contract_code_id:
                null
            }, // revers bal ไม่แสดง effect
            OR: [
              {
                del_flag: false
              },
              {del_flag: null}
            ],
            query_shipper_nomination_status:
              {
                id: {
                  in: [2, 5]
                }
              }
          },
          include: {
            group: true,
            query_shipper_nomination_status: true,
            contract_code: true,
            nomination_type: true,
            nomination_version:
              {
                include: {
                  nomination_full_json: true,
                  nomination_full_json_sheet2: true,
                  nomination_row_json:
                    {
                      include:
                        {
                          query_shipper_nomination_type: true
                        },
                      orderBy:
                        {
                          id: 'asc'
                        }
                    }
                },
                where: {
                  flag_use: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    const grouped = {}
    for (const curr of nominationData) {
      const key = curr && `${curr.gas_day}|${curr.group?.name}|${curr?.nomination_type?.id}` || ""

      if (!grouped[key]) {
        grouped[key] = {
          gas_day:
            curr.gas_day,
          shipper_name:
            curr.group?.name,
          nomination_type:
            curr?.nomination_type,
          data: []
        }
      }

      grouped[key].data.push({
        ...curr
      })
    }
    const resultGroup: any =
      Object.values(grouped)
    const resultGroupType =
      resultGroup.map(
        (e: any) => {
          e['data'] = e[
            'data'
          ]?.map(
            (eData: any) => {
              eData[
                'nomination_version'
              ] = eData[
                'nomination_version'
              ]?.map(
                (
                  eDataNom: any
                ) => {
                  eDataNom[
                    'nomination_full_json'
                  ] =
                    eDataNom[
                      'nomination_full_json'
                    ]?.map(
                      (
                        eDataNomJson: any
                      ) => {
                        eDataNomJson[
                          'data_temp'
                        ] =
                          JSON.parse(
                            eDataNomJson[
                              'data_temp'
                            ]
                          )
                        return {
                          ...eDataNomJson
                        }
                      }
                    )

                  eDataNom[
                    'nomination_row_json'
                  ] =
                    eDataNom[
                      'nomination_row_json'
                    ]?.map(
                      (
                        eDataNomJson: any
                      ) => {
                        eDataNomJson[
                          'data_temp'
                        ] =
                          JSON.parse(
                            eDataNomJson[
                              'data_temp'
                            ]
                          )
                        return {
                          ...eDataNomJson
                        }
                      }
                    )
                  return {
                    ...eDataNom
                  }
                }
              )
              return {
                ...eData
              }
            }
          )

          const gas_day_text =
            dayjs(
              e['gas_day']
            ).format(
              'DD/MM/YYYY'
            )
          const shipper_name =
            e['shipper_name']

          return {
            shipper_name,
            gas_day:
              gas_day_text,
            gas_day_text,
            dataDW: e['data'],
            nomination_type:
              e[
                'nomination_type'
              ]
          }
        }
      )
    const nomFlat =
      resultGroupType?.flatMap(
        (e: any) => {
          const {
            dataDW,
            ...nE
          } = e
          const nom =
            dataDW?.map(
              (eD: any) => {
                return {
                  ...nE,
                  ...eD
                }
              }
            )

          return [...nom]
        }
      )

    const nomJsonRowFlat =
      nomFlat?.flatMap(
        (e: any) => {
          const {
            nomination_version,
            ...nE
          } = e
          let nomination_version_one =
            e
              ?.nomination_version[0] ||
            []
          nomination_version_one.nomination_full_json =
            nomination_version_one.nomination_full_json[0]
          const {
            nomination_row_json,
            ...nER
          } =
            nomination_version_one

          const nom =
            nomination_row_json?.map(
              (eD: any) => {
                return {
                  nomination_code:
                    nE
                      ?.contract_code
                      ?.contract_code,
                  contract:
                    nE
                      ?.contract_code
                      ?.contract_code,
                  unit: eD[
                    'data_temp'
                  ]['9'],
                  point:
                    eD[
                      'data_temp'
                    ]['3'],
                  entryExit:
                    eD[
                      'data_temp'
                    ]['10'],
                  nomVersionId:
                    nER?.id,
                  nomVersionVersion:
                    nER?.version,
                  nomVersionFull:
                    nER?.nomination_full_json,
                  ...nE,
                  ...eD
                }
              }
            )

          return [...nom]
        }
      )

    const nomData =
      nomJsonRowFlat?.filter(
        (f: any) => {
          return (
            f?.query_shipper_nomination_type_id ===
            1
          )
        }
      )
    const nomTypeExt =
      nomData?.flatMap(
        (e: any) => {
          let dataE = []
          if (
            e[
              'nomination_type_id'
            ] === 2
          ) {
            // weekly
            for (
              let i = 0;
              i <
              daysOfWeek.length;
              i++
            ) {
              //
              dataE.push({
                ...e,
                total:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) || 0,
                totalType:
                  daysOfWeek[
                    i
                  ],
                gasDayUse:
                  e && (e
                    ?.nomVersionFull
                    ?.data_temp
                    ?.headData[
                    `${14 + i}`
                  ]) || "",
                HV:
                  Number(
                    e[
                      'data_temp'
                    ]['12']
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) || 0,
                rowId: e?.id,
                H1:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H2:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H3:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H4:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H5:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H6:
                  (Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) /
                    24) |
                  0,
                H7:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H8:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H9:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H10:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H11:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H12:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H13:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H14:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H15:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H16:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H17:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H18:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H19:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H20:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H21:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H22:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H23:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0,
                H24:
                  Number(
                    e[
                      'data_temp'
                    ][
                      `${14 + i}`
                    ]
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  ) / 24 || 0
              })
            }
          } else {
            // daily
            dataE.push({
              ...e,
              total:
                Number(
                  e[
                    'data_temp'
                  ]['38']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              totalType:
                'daily',
              gasDayUse:
                e?.gas_day_text,
              HV:
                Number(
                  e[
                    'data_temp'
                  ]['12']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              rowId: e?.id,
              H1:
                Number(
                  e[
                    'data_temp'
                  ]['14']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H2:
                Number(
                  e[
                    'data_temp'
                  ]['15']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H3:
                Number(
                  e[
                    'data_temp'
                  ]['16']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H4:
                Number(
                  e[
                    'data_temp'
                  ]['17']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H5:
                Number(
                  e[
                    'data_temp'
                  ]['18']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H6:
                Number(
                  e[
                    'data_temp'
                  ]['19']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H7:
                Number(
                  e[
                    'data_temp'
                  ]['20']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H8:
                Number(
                  e[
                    'data_temp'
                  ]['21']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H9:
                Number(
                  e[
                    'data_temp'
                  ]['22']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H10:
                Number(
                  e[
                    'data_temp'
                  ]['23']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H11:
                Number(
                  e[
                    'data_temp'
                  ]['24']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H12:
                Number(
                  e[
                    'data_temp'
                  ]['25']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H13:
                Number(
                  e[
                    'data_temp'
                  ]['26']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H14:
                Number(
                  e[
                    'data_temp'
                  ]['27']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H15:
                Number(
                  e[
                    'data_temp'
                  ]['28']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H16:
                Number(
                  e[
                    'data_temp'
                  ]['29']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H17:
                Number(
                  e[
                    'data_temp'
                  ]['30']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H18:
                Number(
                  e[
                    'data_temp'
                  ]['31']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H19:
                Number(
                  e[
                    'data_temp'
                  ]['32']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H20:
                Number(
                  e[
                    'data_temp'
                  ]['33']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H21:
                Number(
                  e[
                    'data_temp'
                  ]['34']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H22:
                Number(
                  e[
                    'data_temp'
                  ]['35']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H23:
                Number(
                  e[
                    'data_temp'
                  ]['36']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0,
              H24:
                Number(
                  e[
                    'data_temp'
                  ]['37']
                    ?.trim()
                    ?.replace(
                      /,/g,
                      ''
                    )
                ) || 0
            })
          }

          return [...dataE]
        }
      )

    const nomExt =
      nomTypeExt?.map(
        (e: any) => {
          const {
            rowId,
            nomination_code,
            HV,
            gasDayUse,
            contract,
            shipper_name,
            zone_text,
            area_text,
            unit,
            point,
            entryExit,
            total,
            totalType,
            contract_code,
            nomination_type_id,
            H1,
            H2,
            H3,
            H4,
            H5,
            H6,
            H7,
            H8,
            H9,
            H10,
            H11,
            H12,
            H13,
            H14,
            H15,
            H16,
            H17,
            H18,
            H19,
            H20,
            H21,
            H22,
            H23,
            H24,
            ...nE
          } = e
          const entryExitId =
            entryExit ===
            'Entry'
              ? 1
              : 2
          const areaObj =
            areaMaster?.find(
              (f: any) => {
                return (
                  f?.name ===
                    area_text &&
                  f?.entry_exit_id ===
                    entryExitId
                )
              }
            )
          const entryExitObj =
            entryExitMaster?.find(
              (f: any) => {
                return (
                  f?.id ===
                  entryExitId
                )
              }
            )

          return {
            rowId,
            nomination_code,
            HV,
            contract,
            gasDayUse,
            shipper_name,
            zone_text,
            area_text,
            unit,
            point,
            entryExit,
            total,
            totalType,
            // contract_code,
            contract_code_id:
              contract_code?.id,
            areaObj,
            entryExitObj,
            term:
              contract_code?.term_type_id ===
              4
                ? 'non-firm'
                : 'firm',
            nomination_type_id,
            H1,
            H2,
            H3,
            H4,
            H5,
            H6,
            H7,
            H8,
            H9,
            H10,
            H11,
            H12,
            H13,
            H14,
            H15,
            H16,
            H17,
            H18,
            H19,
            H20,
            H21,
            H22,
            H23,
            H24
          }
        }
      )
    // MMSCFD

    // nomExtFilter

    // const deduplicateByKeys = (data) => {
    //   const map = new Map();

    //   for (const item of data) {
    //     const key = [
    //       item.gasDayUse,
    //       item.contract,
    //       item.shipper_name,
    //       item.area_text,
    //       item.zone_text,
    //       item.point,
    //       item.unit,
    //     ].join('|');

    //     if (!map.has(key)) {
    //       map.set(key, []);
    //     }

    //     map.get(key).push(item);
    //   }

    //   const result = [];

    //   for (const [_, group] of map.entries()) {
    //     if (group.length === 1) {
    //       result.push(group[0]); // ไม่ซ้ำ
    //     } else {
    //       const daily = group.find((g) => g.totalType === 'daily');
    //       if (daily) result.push(daily); // ซ้ำแต่มี daily
    //     }
    //   }

    //   return result;
    // };

    const deduplicateByKeys =
      (data) => {
        const map = new Map()

        for (const item of data) {
          const key = [
            item.gasDayUse,
            item.contract,
            item.shipper_name,
            item.area_text,
            item.zone_text,
            item.point,
            item.unit,
            item.nomination_type_id,
            item.nomination_code
          ].join('|')

          if (!map.has(key)) {
            map.set(key, [])
          }

          map
            .get(key)
            .push(item)
        }
        const result = []

        for (const [
          _,
          group
        ] of map.entries()) {
          if (
            group.length === 1
          ) {
            result.push(
              group[0]
            ) // ไม่ซ้ำ
          } else {
            const daily =
              group.find(
                (g) =>
                  g.totalType ===
                  'daily'
              )
            if (daily)
              result.push(
                daily
              ) // ซ้ำแต่มี daily
          }
        }

        return result
      }

    const filteredDataDW =
      deduplicateByKeys(
        nomExt
      )
    // unit

    const noMMSCFD =
      filteredDataDW?.filter(
        (f: any) => {
          // return f?.unit === 'MMSCFD';
          return (
            f?.unit !==
            'MMSCFD'
          )
        }
      )
    const calcAdjustFind =
      noMMSCFD?.flatMap(
        (e: any) => {
          const dailyAdjustFind =
            dailyAdjust
              ?.filter(
                (f: any) => {
                  return (
                    f[
                      'daily_adjustment_group'
                    ]
                      ?.map(
                        (
                          dag: any
                        ) =>
                          dag
                            ?.group
                            ?.name
                      )
                      ?.includes(
                        e[
                          'shipper_name'
                        ]
                      ) &&
                    (f && f?.area?.name) ===
                      e[
                        'area_text'
                      ] &&
                    dayjs(
                      f?.gas_day
                    ).format(
                      'DD/MM/YYYY'
                    ) ===
                      e[
                        'gasDayUse'
                      ]
                  )
                }
              )
              ?.flatMap(
                (np: any) => [
                  ...np?.daily_adjustment_nom.map(
                    (
                      t: any
                    ) => {
                      return {
                        timeUse:
                          np?.time,
                        gas_day:
                          dayjs(
                            np?.gas_day
                          ).format(
                            'DD/MM/YYYY'
                          ),
                        ...t
                      }
                    }
                  )
                ]
              )
          const dailyAdjustFindPoint =
            dailyAdjustFind?.filter(
              (f: any) => {
                return (
                  f
                    ?.nomination_point
                    ?.nomination_point ===
                  e['point']
                )
              }
            )

          if (
            dailyAdjustFindPoint?.length >
            0
          ) {
            const adjustData =
              dailyAdjustFindPoint?.map(
                (da: any) => {
                  return {
                    // ...da,
                    create_date:
                      da?.create_date,
                    timeUse:
                      da?.timeUse,
                    gas_day:
                      da?.gas_day,
                    heating_value:
                      da?.heating_value,
                    hour:
                      Number(
                        da?.timeUse.split(
                          ':'
                        )[0]
                      ) ??
                      null,
                    minute:
                      Number(
                        da?.timeUse.split(
                          ':'
                        )[1]
                      ) ??
                      null,
                    hourTime: `H${Number(da?.timeUse.split(':')[0]) + 1}`,
                    adjustH:
                      !!da?.valume_mmscfh2
                        ? Number(
                            da?.valume_mmscfh2
                          )
                        : Number(
                            da?.valume_mmscfd2
                          ) /
                          24,
                    djustHFlag:
                      !!da?.valume_mmscfh2
                  }
                }
              )

            return [
              {
                dailyAdjustFindPoint:
                  adjustData,
                adjustment:
                  'YES',
                ...e
              },
              {
                dailyAdjustFindPoint:
                  [],
                adjustment:
                  'NO',
                ...e
              }
            ]
          } else {
            return [
              {
                dailyAdjustFindPoint:
                  [],
                adjustment:
                  'NO',
                ...e
              }
            ]
          }
        }
      )

    const filContract =
      contractCode === null ||
      contractCode === '' ||
      (Array.isArray(
        contractCode
      ) &&
        contractCode.length ==
          0)
        ? calcAdjustFind
        : Array.isArray(
              contractCode
            )
          ? calcAdjustFind?.filter(
              (f: any) => {
                return contractCode?.includes(
                  f?.contract
                )
              }
            )
          : calcAdjustFind?.filter(
              (f: any) => {
                return (
                  f?.contract === contractCode
                )
              }
            )

    const startDateArr =
      dayjs(
        startDate,
        'DD/MM/YYYY'
      )
    const endDateArr = dayjs(
      endDate,
      'DD/MM/YYYY'
    )

    const filteredDate =
      filContract.filter(
        (item) => {
          const gasDay =
            dayjs(
              item.gasDayUse,
              'DD/MM/YYYY'
            )
          return (
            gasDay.isSameOrAfter(
              startDateArr
            ) &&
            gasDay.isSameOrBefore(
              endDateArr
            )
          )
        }
      )

    const filCheckAdjustment =
      checkAdjustment
        ? filteredDate?.filter(
            (f: any) => {
              return (
                f?.adjustment ===
                'YES'
              )
            }
          )
        : filteredDate

    const hourTime = [
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'H7',
      'H8',
      'H9',
      'H10',
      'H11',
      'H12',
      'H13',
      'H14',
      'H15',
      'H16',
      'H17',
      'H18',
      'H19',
      'H20',
      'H21',
      'H22',
      'H23',
      'H24'
    ]

    const calcAdjust =
      filCheckAdjustment?.map(
        (e: any) => {
          if (
            e[
              'adjustment'
            ] === 'YES'
          ) {
            const adjustedHours =
              {...e}

            for (
              let hI = 0;
              hI <
              hourTime.length;
              hI++
            ) {
              const currentHour =
                hourTime[hI]

              const findH = e[
                'dailyAdjustFindPoint'
              ]?.filter(
                (f: any) => {
                  return (
                    f?.hourTime ===
                    currentHour
                  )
                }
              )

              if (
                findH.length >
                0
              ) {
                let sumAllH =
                  {}
                const fil =
                  filCheckAdjustment?.filter(
                    (
                      f: any
                    ) =>
                      f?.adjustment ===
                        'YES' &&
                      f?.shipper_name ===
                        e?.shipper_name &&
                      f?.gasDayUse ===
                        e?.gasDayUse &&
                      f?.area_text ===
                        e?.area_text &&
                      f?.contract ===
                        e?.contract
                  )
                for (const hour of hourTime) {
                  sumAllH[
                    hour
                  ] = fil
                    ?.map(
                      (
                        sH: any
                      ) =>
                        Number(
                          sH[
                            hour
                          ]
                        ) || 0
                    )
                    .reduce(
                      (
                        acc,
                        val
                      ) =>
                        acc +
                        val,
                      0
                    )
                }

                const originalPointRowH =
                  Number(
                    e[
                      currentHour
                    ]
                  ) ?? 0
                const sumAllPointRowH =
                  Number(
                    sumAllH[
                      currentHour
                    ]
                  ) ?? 0
                let calcResult = 0
                let adjustValue = 0

                if (
                  findH.length >
                  1
                ) {
                  const sorted =
                    [
                      ...findH
                    ].sort(
                      (
                        a,
                        b
                      ) => {
                        if (
                          a.minute !==
                          b.minute
                        )
                          return (
                            a.minute -
                            b.minute
                          )
                        return dayjs(
                          a.create_date
                        ).isBefore(
                          dayjs(
                            b.create_date
                          )
                        )
                          ? -1
                          : 1
                      }
                    )

                  let minuteSum = 0
                  let oldMinute = 0
                  for (const item of sorted) {
                    adjustValue =
                      Number(
                        item?.adjustH
                      ) ?? 0
                    let calcStep1 = 0
                    if (
                      sumAllPointRowH !==
                      0
                    ) {
                      calcStep1 =
                        (originalPointRowH /
                          sumAllPointRowH) *
                        adjustValue
                    }
                    const calcStep2 =
                      item && (calcStep1 *
                      ((item.minute -
                        oldMinute) /
                        60)) || 0
                    oldMinute =
                      item && item.minute || 0
                    minuteSum +=
                      calcStep2
                  }
                  calcResult =
                    minuteSum
                } else {
                  adjustValue =
                    Number(
                      findH[0]
                        ?.adjustH
                    ) ?? 0
                  let calcStep1 = 0
                  if (
                    sumAllPointRowH !==
                    0
                  ) {
                    calcStep1 =
                      (originalPointRowH /
                        sumAllPointRowH) *
                      adjustValue
                  }

                  if (
                    findH[0]
                      ?.minute !==
                    0
                  ) {
                    const calcStep2 =
                      (calcStep1 /
                        60) *
                      (60 -
                        findH[0]
                          .minute)
                    const calcStep3 =
                      calcStep2 +
                      (sumAllPointRowH /
                        60) *
                        findH[0]
                          .minute
                    calcResult =
                      calcStep3
                  } else {
                    calcResult =
                      calcStep1
                  }
                }

                adjustedHours[
                  currentHour
                ] = isNaN(
                  calcResult
                )
                  ? 0
                  : calcResult

                for (
                  let j =
                    hI + 1;
                  j <
                  hourTime.length;
                  j++
                ) {
                  adjustedHours[
                    hourTime[
                      j
                    ]
                  ] =
                    adjustValue
                }

                break
              }
            }

            const totalH1ToH24Adjust =
              hourTime.reduce(
                (
                  sum,
                  hour
                ) => {
                  return (
                    sum +
                    (Number(
                      adjustedHours[
                        hour
                      ]
                    ) || 0)
                  )
                },
                0
              )

            return {
              ...adjustedHours,
              totalH1ToH24Adjust
            }
          }

          // กรณีไม่มี adjustment ให้คำนวณผลรวมจากค่าเดิม
          const totalH1ToH24Adjust =
            hourTime.reduce(
              (sum, hour) => {
                return (
                  sum +
                  (Number(
                    e[hour]
                  ) || 0)
                )
              },
              0
            )

          return {
            ...e,
            totalH1ToH24Adjust
          }
        }
      )

    return calcAdjust
  }

  /**
   * สร้างสรุปการปรับแต่งรายวัน (Daily Adjustment Summary)
   * รวบรวมข้อมูล nomination และ adjustment ตามช่วงวันที่ที่กำหนด
   * แสดงข้อมูลทั้งแบบเดิมและแบบที่ปรับแต่งแล้ว
   *
   * @param payload - ข้อมูลที่ส่งมา { checkAdjustment, startDate, endDate, contractCode }
   * @param userId - ID ของผู้ใช้
   * @returns รายการข้อมูลการ nomination และปรับแต่งแบบสรุป
   */
  async dailyAdjustmentSummary2(payload: any, userId: any) {
    const { checkAdjustment, startDate, endDate, contractCode } = payload;

    // แปลงวันที่เริ่มต้นและสิ้นสุดเป็น Dayjs object และ Date object
    const startDayjs = getTodayNowDDMMYYYYAdd7(startDate);
    const endDayjs = getTodayNowDDMMYYYYAdd7(endDate);
    const todayStart = startDayjs.toDate();
    const todayEnd = endDayjs.toDate();

    // ดึงข้อมูลพื้นที่ (Area) ที่ใช้งานอยู่ในช่วงวันที่ที่กำหนด
    const areaMaster = await this.prisma.area.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            },
          },
          {
            OR: [
              {
                end_date: null,
              }, // ถ้า end_date เป็น null (ยังใช้งานอยู่)
              {
                end_date: {
                  gte: todayStart,
                },
              }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ],
          },
        ],
      },
    });

    // ดึงข้อมูล Entry/Exit ทั้งหมด
    const entryExitMaster = await this.prisma.entry_exit.findMany({
      where: {},
    });

    // คำนวณช่วงสัปดาห์สำหรับการ nomination ประเภทสัปดาห์
    const { weekStart: targetWeekStart } = getWeekRange(todayStart);
    const { weekEnd: targetWeekEnd } = getWeekRange(todayEnd);

    // ดึงข้อมูลการเสนอราคา (nomination) ทั้งรายวันและรายสัปดาห์
    const nominationData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        // NOT: {
        //   contract_code_id: null,
        // }, // revers bal ไม่แสดง effect
        AND: [
          {
            OR: [
              // การเสนอราคารายวัน: ตรงกับวันที่ที่กำหนด
              {
                nomination_type: {
                  id: 1,
                },
                gas_day: {
                  gte: todayStart,
                  lte: todayEnd,
                },
              },
              // การเสนอราคารายสัปดาห์: อยู่ในสัปดาห์เดียวกัน
              {
                nomination_type: {
                  id: 2,
                },
                gas_day: {
                  gte: targetWeekStart,
                  lte: targetWeekEnd,
                },
              },
            ],
          },
          // กรองเฉพาะข้อมูลที่ไม่ได้ถูกลบ
          {
            OR: [
              {
                del_flag: false,
              },
              {
                del_flag: null,
              },
            ],
          },
          // กรองเฉพาะสถานะที่ได้รับการอนุมัติ (id: 2, 5)
          {
            query_shipper_nomination_status: {
              id: {
                in: [2, 5],
              },
            },
          },
        ],
      },
      include: {
        group: true,
        query_shipper_nomination_status: true,
        contract_code: true,
        reserve_balancing_gas_contract: true,
        nomination_type: true,
        nomination_version: {
          include: {
            nomination_full_json: true,
            nomination_full_json_sheet2: true,
            nomination_row_json: {
              include: {
                query_shipper_nomination_type: true,
              },
              orderBy: {
                id: 'asc',
              },
            },
          },
          where: {
            flag_use: true,
          },
        },
      },
      orderBy: {
        id: 'desc',
      },
    });

    const groupList = await this.prisma.group.findMany({
      where: {
        start_date: {
          lte: todayEnd,
        },
        OR: [
          {
            end_date: { gte: todayStart, }
          },
          { end_date: null }
        ]
      },
      select: {
        id: true,
        id_name: true,
        name: true,
        company_name: true,
      }
    })

    // เริ่มต้นตัวแปรสำหรับเก็บผลลัพธ์
    let result = [];
    let currentDate = endDayjs.clone();

    // วนลูปผ่านแต่ละวันจากวันที่สิ้นสุดไปยังวันที่เริ่มต้น
    while (currentDate.isSameOrAfter(startDayjs)) {
      // ดึงข้อมูลการปรับแต่งสำหรับวันที่ปัจจุบันจาก ASTOS service
      const adjustList = await this.astosService.daily_adjustment_summary({
        gas_day: currentDate.format('YYYY-MM-DD'),
        start_hour: 1,
        end_hour: 24,
        skip: 0,
        limit: 0,
      });

      let onlyActiveContractNominationList = nominationData.filter(nominationFile => {
        if(nominationFile.contract_code){
        const contractStartDate = dayjs(nominationFile.contract_code?.contract_start_date);
        const contractEndDate = dayjs(nominationFile.contract_code?.terminate_date || nominationFile.contract_code?.extend_deadline || nominationFile.contract_code?.contract_end_date);
        return currentDate.isSameOrAfter(contractStartDate) && currentDate.isBefore(contractEndDate);
        }
        else{
          return true
        }
      })

      // กรองข้อมูลการเสนอราคารายวันสำหรับวันที่ปัจจุบัน
      const dailyNominationList = onlyActiveContractNominationList.filter((nominationFile) => dayjs(nominationFile.gas_day).isSame(currentDate, 'day') && nominationFile.nomination_type_id == 1);

      // กรองข้อมูลการเสนอราคารายสัปดาห์สำหรับสัปดาห์ปัจจุบัน
      // และไม่ซ้ำกับข้อมูลรายวันที่มีสัญญาเดียวกัน
      const weeklyNominationList = onlyActiveContractNominationList.filter((nominationFile) => {
        return dayjs(nominationFile.gas_day).isSame(currentDate, 'week') && nominationFile.nomination_type_id == 2;
        // && !dailyNominationList.some(daily =>
        //   nominationFile.contract_code_id ?
        //     daily.contract_code_id == nominationFile.contract_code_id
        //     :
        //     daily.reserve_balancing_gas_contract_id == nominationFile.reserve_balancing_gas_contract_id
        // )
      });

      // ประมวลผลข้อมูลการ nomination รายวัน
      dailyNominationList.map((dailyNomination) => {
        // กรองข้อมูลการปรับแต่งที่ตรงกับสัญญาและผู้ใช้
        const adjustListOfContract =
          adjustList?.filter((adjust: any) => {
            return adjust.gas_day === currentDate.format('YYYY-MM-DD') && (adjust.contract === dailyNomination.contract_code?.contract_code || adjust.contract === dailyNomination.reserve_balancing_gas_contract?.res_bal_gas_contract) && adjust.shipper === dailyNomination.group?.id_name;
          }) ?? [];

        const dailyNominationVersion = dailyNomination.nomination_version.map((nominationVersion) => {
          // ประมวลผลข้อมูลในแต่ละแถวของการ nomination
          nominationVersion.nomination_row_json.map((nominationRowJson) => {
            // แปลงข้อมูล JSON เป็น object
            const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp);

            // ดึงข้อมูลจาก JSON ตาม index
            const zone = nominationRowJsonDataTemp['0'];
            const area = nominationRowJsonDataTemp['2'];
            const point = nominationRowJsonDataTemp['3'];
            const unit = nominationRowJsonDataTemp['9'];
            const entryExit = nominationRowJsonDataTemp['10'];
            const hv = parseToNumber(nominationRowJsonDataTemp['12']);
            const total = readNomFromJsonAs3Decimal(nominationRowJsonDataTemp, '38');

            // ตรวจสอบเงื่อนไข: ต้องเป็นหน่วย MMBTU/D และมีโซนและพื้นที่ (เป็น nomination point)
            if (unit !== 'MMBTU/D' || !zone || !area) {
              return;
            }

            const entryExitId = entryExit === 'Entry' ? 1 : 2;
            const entryExitObj = entryExitMaster?.find((f: any) => {
              return f?.id === entryExitId;
            });

            const areaObj = areaMaster.find((area: any) => {
              const startDate = dayjs(area.start_date).tz('Asia/Bangkok');
              const endDate = area.end_date ? dayjs(area.end_date).tz('Asia/Bangkok') : null;
              return area?.name === nominationRowJson.area_text && startDate.isSameOrBefore(currentDate) && (endDate == null || endDate.isAfter(currentDate));
            });

            // "dailyAdjustFindPoint": [
            //     {
            //         "create_date": "2025-09-04T11:06:21.811Z",
            //         "timeUse": "18:30",
            //         "gas_day": "04/09/2025",
            //         "heating_value": "1047.52",
            //         "hour": 18,
            //         "minute": 30,
            //         "hourTime": "H19",
            //         "adjustH": 26188,
            //         "djustHFlag": true
            //     }
            // ],

            // สร้างข้อมูลพื้นฐานสำหรับแต่ละแถว
            const baseAttribute = {
              rowId: nominationRowJson.id,
              nomination_code: dailyNomination.nomination_code,
              HV: hv,
              contract: dailyNomination.contract_code?.contract_code || dailyNomination.reserve_balancing_gas_contract?.res_bal_gas_contract,
              gasDayUse: currentDate.format('DD/MM/YYYY'),
              shipper_name: dailyNomination.group?.name,
              shipper_id_name: dailyNomination.group?.id_name,
              zone_text: nominationRowJson.zone_text,
              area_text: nominationRowJson.area_text,
              unit: unit,
              point: point,
              entryExit: entryExit,
              total: total,
              totalType: 'daily',
              contract_code_id: dailyNomination.contract_code?.id,
              reserve_balancing_gas_contract_id: dailyNomination.reserve_balancing_gas_contract?.id,
              areaObj: areaObj,
              entryExitObj: entryExitObj,
              term: dailyNomination.contract_code?.term_type_id === 4 ? 'non-firm' : 'firm',
              nomination_type_id: dailyNomination.nomination_type_id,
            };

            // สร้าง object สำหรับข้อมูลเดิม (ไม่มีการปรับแต่ง)
            const originalNom: any = {
              adjustment: 'NO',
            };

            // สร้าง object สำหรับข้อมูลที่ปรับแต่งแล้ว
            const adjustedNom: any = {
              adjustment: 'YES',
            };

            const dailyAdjustFindPoint: any[] = []; // เก็บรายละเอียดการปรับแต่ง
            let sumAllHourlyValue: number | undefined = undefined; // รวมค่าทั้งหมดแบบเดิม
            let sumAllHourlyAdjustValue: number | undefined = undefined; // รวมค่าทั้งหมดแบบปรับแต่ง
            const h1KeyMinus1 = 13; //h1 = 14 (index ใน JSON)

            // วนลูปประมวลผลข้อมูลรายชั่วโมง (H1-H24)
            for (let i = 1; i <= 24; i++) {
              // ดึงค่าปริมาณรายชั่วโมงจาก JSON
              const hourlyValue = readNomFromJsonAs3Decimal(nominationRowJsonDataTemp, `${h1KeyMinus1 + i}`);
              originalNom[`H${i}`] = hourlyValue; // เก็บค่าเดิม
              let isSumAdjust = false; // ตรวจสอบว่ามีการปรับแต่งหรือไม่

              // ตรวจสอบการปรับแต่งสำหรับชั่วโมงนี้
              adjustListOfContract.map((adjust: any) => {
                const data = (
                  adjust.data?.filter((adjustData: any) => {
                    const adjustValue3Decimal = adjustData.value == null ? null : parseFloat(adjustData.value.toFixed(3));
                    // ตรวจสอบเงื่อนไขการปรับแต่ง: จุด, พื้นที่, โซน, เข้า/ออก, ชั่วโมง, และค่าต่างจากเดิม
                    return adjustData.point === point && adjustData.area == nominationRowJson.area_text && adjustData.zone == nominationRowJson.zone_text && isMatch(adjustData.entry_exit, entryExit) && adjust.gas_hour === i && adjustValue3Decimal != hourlyValue;
                  }) ?? []
                ).map((adjustData: any) => {
                  const adjustValue8Decimal = adjustData.value == null ? null : parseToNumber8Decimal(adjustData.value);
                  isSumAdjust = true;
                  if (adjustValue8Decimal != null) {
                    if (sumAllHourlyAdjustValue) {
                      sumAllHourlyAdjustValue = parseToNumber8Decimal(sumAllHourlyAdjustValue + adjustValue8Decimal);
                    } else {
                      sumAllHourlyAdjustValue = adjustValue8Decimal;
                    }
                    adjustedNom[`H${i}`] = adjustValue8Decimal;
                  }
                  return {
                    // "create_date": "2025-09-04T11:06:21.811Z",
                    // "timeUse": "18:30",
                    // "gas_day": "04/09/2025",
                    // "heating_value": "1047.52",
                    // "hour": 18,
                    // "minute": 30,
                    hourTime: `H${adjust.gas_hour}`,
                    // "adjustH": 26188,
                    // "djustHFlag": true
                    valueAfterAdjust: adjustValue8Decimal,
                  };
                });
                dailyAdjustFindPoint.push(...data);
                return data;
              });

              if (!isSumAdjust) {
                adjustedNom[`H${i}`] = hourlyValue;
              }

              if (hourlyValue != null) {
                if (sumAllHourlyValue) {
                  sumAllHourlyValue = parseToNumber8Decimal(sumAllHourlyValue + hourlyValue);
                } else {
                  sumAllHourlyValue = hourlyValue;
                }

                if (!isSumAdjust) {
                  if (sumAllHourlyAdjustValue) {
                    sumAllHourlyAdjustValue = parseToNumber8Decimal(sumAllHourlyAdjustValue + hourlyValue);
                  } else {
                    sumAllHourlyAdjustValue = hourlyValue;
                  }
                }
              }
            }

            result.push({
              dailyAdjustFindPoint: [],
              ...baseAttribute,
              ...originalNom,
              totalH1ToH24Adjust: sumAllHourlyValue,
            });

            if (dailyAdjustFindPoint.length > 0) {
              result.push({
                dailyAdjustFindPoint: dailyAdjustFindPoint,
                ...baseAttribute,
                ...adjustedNom,
                totalH1ToH24Adjust: sumAllHourlyAdjustValue,
              });
            }
          });
        });
      });

      weeklyNominationList.map((weeklyNomination) => {
        const adjustListOfContract =
          adjustList?.filter((adjust: any) => {
            return adjust.gas_day === currentDate.format('YYYY-MM-DD') && (adjust.contract === weeklyNomination.contract_code?.contract_code || adjust.contract === weeklyNomination.reserve_balancing_gas_contract?.res_bal_gas_contract) && adjust.shipper === weeklyNomination.group?.id_name;
          }) ?? [];

        const weeklyNominationVersion = weeklyNomination.nomination_version.map((nominationVersion) => {
          // nominationVersion.nomination_full_json.map(nominationFullJson => {
          //   const nominationFullJsonDataTemp = JSON.parse(nominationFullJson.data_temp)
          //   return { ...nominationFullJsonDataTemp }
          // })

          nominationVersion.nomination_row_json.map((nominationRowJson) => {
            const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp);

            const zone = nominationRowJsonDataTemp['0'];
            const area = nominationRowJsonDataTemp['2'];
            const point = nominationRowJsonDataTemp['3'];
            const unit = nominationRowJsonDataTemp['9'];
            const entryExit = nominationRowJsonDataTemp['10'];
            const hv = parseToNumber(nominationRowJsonDataTemp['12']);

            if (unit !== 'MMBTU/D' || !zone || !area) {
              return;
            }
            if (
              result.some((f: any) => {
                return (
                  f?.point === point &&
                  f?.zone_text === nominationRowJson.zone_text &&
                  f?.area_text === nominationRowJson.area_text &&
                  f?.entryExit === entryExit &&
                  f?.gasDayUse === currentDate.format('DD/MM/YYYY') &&
                  f?.shipper_name === weeklyNomination.group?.name &&
                  (
                    f?.contract_code_id === weeklyNomination.contract_code?.id ||
                    (weeklyNomination.reserve_balancing_gas_contract?.id && f?.reserve_balancing_gas_contract_id === weeklyNomination.reserve_balancing_gas_contract?.id)
                  ) &&
                  f?.totalType === 'daily' &&
                  (f?.nomination_type_id === 1 || f?.nomination_type_id === '1')
                );
              })
            ) {
              return;
            }

            const entryExitId = entryExit === 'Entry' ? 1 : 2;
            const entryExitObj = entryExitMaster?.find((f: any) => {
              return f?.id === entryExitId;
            });

            const areaObj = areaMaster.find((area: any) => {
              const startDate = dayjs(area.start_date).tz('Asia/Bangkok');
              const endDate = area.end_date ? dayjs(area.end_date).tz('Asia/Bangkok') : null;
              return area?.name === nominationRowJson.area_text && startDate.isSameOrBefore(currentDate) && (endDate == null || endDate.isAfter(currentDate));
            });

            const dayOfWeek = Number(currentDate.format('d')); // The day of the week, with Sunday as 0
            const thisDayValue3Decimal = readNomFromJsonAs3Decimal(nominationRowJsonDataTemp, `${14 + dayOfWeek}`);
            const hourlyValue = divideTo3Decimal(thisDayValue3Decimal, 24);

            const baseAttribute = {
              rowId: nominationRowJson.id,
              nomination_code: weeklyNomination.nomination_code,
              HV: hv,
              contract: weeklyNomination.contract_code?.contract_code || weeklyNomination.reserve_balancing_gas_contract?.res_bal_gas_contract,
              gasDayUse: currentDate.format('DD/MM/YYYY'),
              shipper_name: weeklyNomination.group?.name,
              shipper_id_name: weeklyNomination.group?.id_name,
              zone_text: nominationRowJson.zone_text,
              area_text: nominationRowJson.area_text,
              unit: unit,
              point: point,
              entryExit: entryExit,
              total: thisDayValue3Decimal,
              totalType: currentDate.format('dddd'),
              contract_code_id: weeklyNomination.contract_code?.id,
              reserve_balancing_gas_contract_id: weeklyNomination.reserve_balancing_gas_contract?.id,
              areaObj: areaObj,
              entryExitObj: entryExitObj,
              term: weeklyNomination.contract_code?.term_type_id === 4 ? 'non-firm' : 'firm',
              nomination_type_id: weeklyNomination.nomination_type_id,
            };

            const originalNom: any = {
              adjustment: 'NO',
              H1: hourlyValue,
              H2: hourlyValue,
              H3: hourlyValue,
              H4: hourlyValue,
              H5: hourlyValue,
              H6: hourlyValue,
              H7: hourlyValue,
              H8: hourlyValue,
              H9: hourlyValue,
              H10: hourlyValue,
              H11: hourlyValue,
              H12: hourlyValue,
              H13: hourlyValue,
              H14: hourlyValue,
              H15: hourlyValue,
              H16: hourlyValue,
              H17: hourlyValue,
              H18: hourlyValue,
              H19: hourlyValue,
              H20: hourlyValue,
              H21: hourlyValue,
              H22: hourlyValue,
              H23: hourlyValue,
              H24: hourlyValue,
              totalH1ToH24Adjust: parseToNumber3Decimal(hourlyValue * 24),
            };

            const adjustedNom: any = {
              adjustment: 'YES',
            };

            // "dailyAdjustFindPoint": [
            //     {
            //         "create_date": "2025-09-04T11:06:21.811Z",
            //         "timeUse": "18:30",
            //         "gas_day": "04/09/2025",
            //         "heating_value": "1047.52",
            //         "hour": 18,
            //         "minute": 30,
            //         "hourTime": "H19",
            //         "adjustH": 26188,
            //         "djustHFlag": true
            //     }
            // ],
            let sumAllHourlyAdjustValue: number | undefined = undefined;
            const dailyAdjustFindPoint: any[] = [];
            adjustListOfContract.map((adjust: any) => {
              const gasHour = `H${adjust.gas_hour}`;
              const data = (
                adjust.data?.filter((adjustData: any) => {
                  const adjustValue8Decimal = adjustData.value == null ? null : parseToNumber8Decimal(adjustData.value); //parseFloat(adjustData.value.toFixed(3));
                  if(adjustData.point === point && adjustData.area == nominationRowJson.area_text && adjustData.zone == nominationRowJson.zone_text && isMatch(adjustData.entry_exit, entryExit)){
                    if(adjustValue8Decimal != hourlyValue){
                      return true;
                    }
                    // else{
                    //   if (sumAllHourlyAdjustValue) {
                    //     sumAllHourlyAdjustValue += adjustValue8Decimal;
                    //   } else {
                    //     sumAllHourlyAdjustValue = adjustValue8Decimal;
                    //   }
                    // }
                  }
                  // return adjustData.point === point && adjustData.area == nominationRowJson.area_text && adjustData.zone == nominationRowJson.zone_text && isMatch(adjustData.entry_exit, entryExit) && adjustValue3Decimal != hourlyValue;
                  return false;
                }) ?? []
              ).map((adjustData: any) => {
                // const adjustValue3Decimal = adjustData.value == null ? null : parseFloat(adjustData.value.toFixed(3));
                const adjustValue8Decimal = adjustData.value == null ? null : parseToNumber8Decimal(adjustData.value);
                if (adjustValue8Decimal != null) {
                  if (sumAllHourlyAdjustValue) {
                    sumAllHourlyAdjustValue = parseToNumber8Decimal(sumAllHourlyAdjustValue + adjustValue8Decimal);
                  } else {
                    sumAllHourlyAdjustValue = adjustValue8Decimal;
                  }
                  adjustedNom[gasHour] = adjustValue8Decimal;
                }
                return {
                  // "create_date": "2025-09-04T11:06:21.811Z",
                  // "timeUse": "18:30",
                  // "gas_day": "04/09/2025",
                  // "heating_value": "1047.52",
                  // "hour": 18,
                  // "minute": 30,
                  hourTime: gasHour,
                  // "adjustH": 26188,
                  // "djustHFlag": true
                  valueAfterAdjust: adjustValue8Decimal,
                };
              });

              if (!adjustedNom[gasHour] && adjustedNom[gasHour] != 0) {
                adjustedNom[gasHour] = hourlyValue;
                if (hourlyValue != null) {
                  if (sumAllHourlyAdjustValue) {
                    sumAllHourlyAdjustValue = parseToNumber8Decimal(sumAllHourlyAdjustValue + hourlyValue);
                  } else {
                    sumAllHourlyAdjustValue = hourlyValue;
                  }
                }
              }
              dailyAdjustFindPoint.push(...data);
              return data;
            });

            result.push({
              dailyAdjustFindPoint: [],
              ...baseAttribute,
              ...originalNom,
            });

            if (dailyAdjustFindPoint.length > 0) {
              result.push({
                dailyAdjustFindPoint: dailyAdjustFindPoint,
                ...baseAttribute,
                ...adjustedNom,
                totalH1ToH24Adjust: sumAllHourlyAdjustValue,
              });
            }
          });
        });
      });

      // หา point ที่มีใน adjust แต่ไม่มีใน result
      const flatMapAdjustList = adjustList.flatMap((adjust) =>
        adjust.data.flatMap((data) => {
          const shipperName = groupList.find((group) => group.id_name == adjust.shipper)?.name;
          const entryExitObj = entryExitMaster.find((entryExit) => isMatch(entryExit.name, data.entry_exit));
          return {
            gas_day: adjust.gas_day,
            gas_hour: adjust.gas_hour,
            contract: adjust.contract,
            shipper: shipperName || adjust.shipper,
            shipper_id_name: adjust.shipper,
            point: data.point,
            point_type: data.point_type,
            customer_type: data.customer_type,
            relation_point: data.relation_point,
            relation_point_type: data.relation_point_type,
            entry_exit: data.entry_exit,
            zone: data.zone,
            area: data.area,
            value: data.value,
            entryExitObj: entryExitObj,
          };
        }),
      );
      const adjustListOfNoNom =
        flatMapAdjustList?.filter((adjust) => {
          return adjust.gas_day == currentDate.format('YYYY-MM-DD') &&
            adjust.point_type == 'NOM' &&
            !result.some((f: any) => f?.point == adjust.point
            && f?.shipper_id_name === adjust.shipper_id_name
          )
            // && adjust.contract === dailyNomination.contract_code?.contract_code
            // && adjust.shipper === dailyNomination.group?.id_name
        }) ?? [];

      // Group adjustListOfNoNom by contract, shipper, area, zone, and point
      const groupedAdjustListOfNoNom = adjustListOfNoNom.reduce(
        (acc, adjust) => {
          const key = [adjust.contract ?? '', adjust.shipper_id_name ?? '', adjust.area ?? '', adjust.zone ?? '', adjust.point ?? ''].join('|');
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(adjust);
          return acc;
        },
        {} as Record<string, typeof adjustListOfNoNom>,
      );

      for (const [key, groupedAdjustList] of Object.entries(groupedAdjustListOfNoNom)) {
        // สามารถใช้ key และ group เพื่อประมวลผลข้อมูลได้ในแต่ละ group
        let firstInGroup:
          | {
              gas_day: string;
              gas_hour: number;
              contract: string;
              shipper: string;
              shipper_id_name: string;
              point: any;
              point_type: any;
              customer_type: any;
              relation_point: any;
              relation_point_type: any;
              entry_exit: any;
              zone: any;
              area: any;
              value: any;
              entryExitObj: any;
            }
          | undefined = undefined;
        let sumAllHourlyAdjustValue: number | undefined = undefined;
        const dailyAdjustFindPoint: any[] = [];
        const adjustedNom: any = {
          adjustment: groupedAdjustList.some((adjust) => adjust.value) ? 'YES' : 'NO',
        };
        
        groupedAdjustList.map((adjust) => {
          if (!firstInGroup) {
            firstInGroup = adjust;
          }
          const gasHour = `H${adjust.gas_hour}`;

          // const adjustValue3Decimal = adjust.value == null ? null : parseFloat(adjust.value.toFixed(3));
          const adjustValue8Decimal = adjust.value == null ? null : parseToNumber8Decimal(adjust.value);
          if (adjustValue8Decimal != null) {
            if (sumAllHourlyAdjustValue) {
              sumAllHourlyAdjustValue = parseToNumber8Decimal(sumAllHourlyAdjustValue + adjustValue8Decimal);
            } else {
              sumAllHourlyAdjustValue = adjustValue8Decimal;
            }
            adjustedNom[gasHour] = adjustValue8Decimal;

            if(adjustValue8Decimal){
              dailyAdjustFindPoint.push({
                // "create_date": "2025-09-04T11:06:21.811Z",
                // "timeUse": "18:30",
                // "gas_day": "04/09/2025",
                // "heating_value": "1047.52",
                // "hour": 18,
                // "minute": 30,
                hourTime: gasHour,
                // "adjustH": 26188,
                // "djustHFlag": true
                valueAfterAdjust: adjustValue8Decimal,
              });
            }
          }
        });

        const baseAttribute = {
          rowId: undefined,
          nomination_code: undefined,
          HV: undefined,
          contract: firstInGroup?.contract,
          gasDayUse: currentDate.format('DD/MM/YYYY'),
          shipper_name: firstInGroup?.shipper,
          shipper_id_name: firstInGroup?.shipper_id_name,
          zone_text: firstInGroup?.zone,
          area_text: firstInGroup?.area,
          unit: 'MMBTU/D',
          point: firstInGroup?.point,
          entryExit: firstInGroup?.entry_exit,
          total: undefined,
          totalType: currentDate.format('dddd'),
          contract_code_id: undefined,
          areaObj: undefined,
          entryExitObj: firstInGroup?.entryExitObj,
          term: undefined,
          nomination_type_id: undefined,
        };

        result.push({
          dailyAdjustFindPoint: dailyAdjustFindPoint,
          ...baseAttribute,
          ...adjustedNom,
          totalH1ToH24Adjust: sumAllHourlyAdjustValue,
        });
      }

      // ลดวันที่ลง 1 วันเพื่อประมวลผลวันถัดไป
      currentDate = currentDate.subtract(1, 'day');
    }

    const mustShowNominationPointList = await getNominationPointListFromActiveContractCode({
      prisma: this.prisma,
      todayStart,
      todayEnd,
    });

    currentDate = endDayjs.clone();
    while (currentDate.isSameOrAfter(startDayjs)) {
      for (const nominationPoint of mustShowNominationPointList) {
        if(currentDate.isBefore(dayjs(nominationPoint.contract_start_date)) || currentDate.isSameOrAfter(dayjs(nominationPoint.contract_end_date))){
          continue;
        }
        let existPointIndex = result.findIndex((f: any) => {
          return (
            f?.point === nominationPoint.nomination_point &&
            isMatch(f?.zone_text, nominationPoint.zone_text) &&
            isMatch(f?.area_text, nominationPoint.area_text) &&
            isMatch(f?.entryExit, nominationPoint.entry_exit?.name) &&
            f?.gasDayUse === currentDate.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
            f?.shipper_name === nominationPoint.group_name &&
            (f?.contract_code_id === nominationPoint.contract_code_id || f?.contract === nominationPoint.contract_code)
          );
        });

        if (existPointIndex < 0) {
          result.push({
            dailyAdjustFindPoint: [],
            // "rowId": nominationRowJson.id,
            nomination_code: nominationPoint.nomination_code,
            // "HV": hv,
            contract: nominationPoint.contract_code,
            gasDayUse: currentDate.format('DD/MM/YYYY'),
            shipper_name: nominationPoint.group_name,
            zone_text: nominationPoint.zone_text,
            area_text: nominationPoint.area_text,
            unit: 'MMBTU/D',
            point: nominationPoint.nomination_point,
            entryExit: nominationPoint.entry_exit?.name,
            total: 0,
            totalType: nominationPoint.nomination_type_id == 1 ? 'daily' : currentDate.format('dddd'),
            contract_code_id: nominationPoint.contract_code_id,
            areaObj: nominationPoint.area,
            entryExitObj: nominationPoint.entry_exit,
            term: nominationPoint.term_type_id === 4 ? 'non-firm' : 'firm',
            nomination_type_id: nominationPoint.nomination_type_id,
            adjustment: 'NO',
            H1: 0,
            H2: 0,
            H3: 0,
            H4: 0,
            H5: 0,
            H6: 0,
            H7: 0,
            H8: 0,
            H9: 0,
            H10: 0,
            H11: 0,
            H12: 0,
            H13: 0,
            H14: 0,
            H15: 0,
            H16: 0,
            H17: 0,
            H18: 0,
            H19: 0,
            H20: 0,
            H21: 0,
            H22: 0,
            H23: 0,
            H24: 0,
            totalH1ToH24Adjust: 0,
          });
        }
      }

      // ไปวันก่อนหน้า
      currentDate = currentDate.subtract(1, 'day');
    }

    // กรองผลลัพธ์ตามเงื่อนไขที่กำหนด
    if (checkAdjustment == true) {
      // กรองเฉพาะข้อมูลที่มีการปรับแต่ง
      result = result.filter((f: any) => {
        return f?.adjustment === 'YES';
      });
    }

    if (contractCode) {
      if (Array.isArray(contractCode) && contractCode.length > 0) {
        // กรองตามรหัสสัญญาหลายตัว (array)
        result = result.filter((f: any) => {
          return contractCode.includes(f?.contract);
        });
      } else {
        // กรองตามรหัสสัญญาเดียว
        result = result.filter((f: any) => {
          return f?.contract === contractCode;
        });
      }
    }

    // Sort groupByNomPoint by gas_day, point, and shipper_name
    result.sort((a: any, b: any) => {
      // First sort by gas_day
      const dateA = dayjs(a.gasDayUse, 'DD/MM/YYYY');
      const dateB = dayjs(b.gasDayUse, 'DD/MM/YYYY');
      if (!dateA.isSame(dateB)) {
        return dateA.isBefore(dateB) ? 1 : -1;
      }

      // Then sort by point
      if (a.point !== b.point) {
        return a.point.localeCompare(b.point);
      }

      // Finally sort by shipper_name
      return a.shipper_name.localeCompare(b.shipper_name);
    });

    return result;
  }

  async dailyAdjustmentReportNow2(
    payload: any,
    userId: any
  ) {
    const now =
      getTodayNow().tz(
        'Asia/Bangkok'
      )
    const today = now.format(
      'DD/MM/YYYY'
    )
    const nowTime =
      now.format('HH:mm')
    const nowMinutes =
      timeToMinutes(nowTime)
    const wholeDayData =
      await this.dailyAdjustmentReport4(
        {
          startDate: today,
          endDate: today
        },
        userId
      )

    // Get all unique times from all timeShow arrays across wholeDayData
    const uniqueTimes =
      Array.from(
        new Set(
          wholeDayData.flatMap(
            (data: any) =>
              data.timeShow.map(
                (
                  timeShow: any
                ) =>
                  timeShow.time
              )
          )
        )
      ).sort(
        (a, b) =>
          timeToMinutes(a) -
          timeToMinutes(b)
      )

    // Filter times up to current time
    const uniqueTimesUpToNow =
      uniqueTimes.filter(
        (time) =>
          timeToMinutes(
            time
          ) <= nowMinutes
      )

    const result =
      wholeDayData
        .map((data: any) => {
          const timeShow =
            data.timeShow.filter(
              (
                timeShow: any
              ) => {
                const timeShowMinutes =
                  timeToMinutes(
                    timeShow.time
                  )
                return (
                  timeShowMinutes <=
                  nowMinutes
                )
              }
            )

          const missingTimes =
            uniqueTimesUpToNow.filter(
              (time: any) => {
                return !timeShow.some(
                  (
                    timeShow: any
                  ) =>
                    timeShow.time === time
                )
              }
            )

          // Add missing times to timeShow with value from latest entry before missing time
          missingTimes.map(
            (
              missingTime: any
            ) => {
              // Find the latest timeShow before the missing time
              const beforeMissingTimeList =
                timeShow
                  .filter(
                    (
                      ts: any
                    ) =>
                      timeToMinutes(
                        ts.time
                      ) <
                      timeToMinutes(
                        missingTime
                      )
                  )
                  .sort(
                    (
                      a: any,
                      b: any
                    ) =>
                      timeToMinutes(
                        b.time
                      ) -
                      timeToMinutes(
                        a.time
                      )
                  )
              let latestBeforeMissing: any =
                null
              if (
                beforeMissingTimeList.length >
                0
              ) {
                latestBeforeMissing =
                  beforeMissingTimeList[0]
              }

              // Use the value from latest entry before missing time
              timeShow.push({
                time: missingTime,
                value:
                  latestBeforeMissing?.value,
                valueMmscfd:
                  latestBeforeMissing?.valueMmscfd,
                heatingValueFromMeter:
                  latestBeforeMissing?.heatingValueFromMeter,
                heatingValueFromAdjust:
                  latestBeforeMissing?.heatingValueFromAdjust,
                volumeFromMeter:
                  latestBeforeMissing?.volumeFromMeter,
                volumeFromAdjust:
                  latestBeforeMissing?.volumeFromAdjust
              })
            }
          )

          // Sort timeShow by time
          timeShow.sort(
            (
              a: any,
              b: any
            ) =>
              timeToMinutes(
                b.time
              ) -
              timeToMinutes(
                a.time
              )
          )

          return {
            point: data.point,
            shipper_name:
              data.shipper_name,
            timeShow:
              timeShow.length >
              0
                ? timeShow[0]
                : {
                    time: nowTime,
                    value:
                      null
                  },
            zone_text:
              data && data?.zone_text || null,
            gas_day:
              data && data?.gas_day || null,
            entry_exit_name:
              data && data?.entry_exit_name || null,
            area_text:
              data && data?.area_text || null
          }
        })
        .sort(
          (a: any, b: any) =>
            a.point - b.point
        )

    return result
  }

  /**
   * สร้างรายงาน Daily Adjustment Report แบบละเอียด
   * @param payload - ข้อมูล payload ที่มี startDate และ endDate
   * @param userId - ID ของผู้ใช้
   * @returns รายงานที่จัดกลุ่มตาม nomination point พร้อมข้อมูลรายชั่วโมง
   */
  async dailyAdjustmentReport4(
    payload: any,
    userId: any
  ) {
    const {
      startDate,
      endDate
    } = payload
    const result =
      await getAdjustNom2({
        prisma: this.prisma,
        startDate,
        endDate
      })

    // รวมผลลัพธ์ตาม nomination point (รวม contract ต่างๆ ของ shipper เดียวกัน ที่มี point, zone, area, entry/exit, gas_day เดียวกัน)
    const groupByNomPoint : groupedAdjustNomDataType[] = []
    for (const item of result) {
      // หาว่ามี point นี้ใน groupByNomPoint แล้วหรือยัง
      const existPointIndex =
        groupByNomPoint.findIndex(
          (f: any) => {
            return (
              f?.point ===
                item.point &&
              f?.zone_text ===
                item.zone_text &&
              f?.area_text ===
                item.area_text &&
              f?.entry_exit_name ===
                item.entryExit &&
              f?.gas_day ===
                item.gas_day &&
              f?.shipper_name ===
                item.shipper_name
            )
          }
        )

      // ถ้ายังไม่มี point นี้ ให้สร้างใหม่
      if (
        existPointIndex < 0
      ) {
        sumValueByTimeShow(
          item.timeShow
        )
        groupByNomPoint.push({
          gas_day:
            item.gas_day,
          shipper_name:
            item.shipper_name,
          zone_text:
            item.zone_text,
          area_text:
            item.area_text,
          point: item.point,
          entry_exit_name:
            item.entryExit,
          timeShow:
            item.timeShow
        })
      } else {
        // ถ้ามี point นี้แล้ว ให้รวมค่า timeShow เข้าไป
        const existPoint =
          groupByNomPoint[
            existPointIndex
          ]
        for (const timeShow of item.timeShow) {
          const timeShowIndex =
            existPoint.timeShow.findIndex(
              (
                existTimeShow: any
              ) =>
                existTimeShow.time === timeShow.time
            )
          if (
            timeShowIndex >= 0
          ) {
            // ถ้ามีเวลานี้แล้ว ให้บวกค่าเข้าไป
            let timeShowValue = parseToNumber3Decimal(existPoint.timeShow[timeShowIndex].value)
            let timeShowValueMmscfd = parseToNumber6Decimal(existPoint.timeShow[timeShowIndex].valueMmscfd)
            let timeShowValuePerHour = parseToNumber3Decimal(existPoint.timeShow[timeShowIndex].valuePerHour)
            let timeShowValueMmscfh = parseToNumber6Decimal(existPoint.timeShow[timeShowIndex].valueMmscfh)
            if (
              timeShowValue !=
              null
            ) {
              if (
                timeShow.value !=
                null
              ) {
                timeShowValue = parseToNumber3Decimal(timeShowValue + parseToNumber3Decimal(timeShow.value))
              }
            } else {
              timeShowValue =
                timeShow.value
            }
            if (
              timeShowValueMmscfd !=
              null
            ) {
              if (
                timeShow.valueMmscfd !=
                null
              ) {
                timeShowValueMmscfd = parseToNumber6Decimal(timeShowValueMmscfd + parseToNumber6Decimal(timeShow.valueMmscfd))
              }
            } else {
              timeShowValueMmscfd =
                timeShow.valueMmscfd
            }
            if (
              timeShowValuePerHour !=
              null
            ) {
              if (
                timeShow.valuePerHour !=
                null
              ) {
                timeShowValuePerHour = parseToNumber3Decimal(timeShowValuePerHour + parseToNumber3Decimal(timeShow.valuePerHour))
              }
            } else {
              timeShowValuePerHour =
                timeShow.valuePerHour
            }
            if (
              timeShowValueMmscfh !=
              null
            ) {
              if (
                timeShow.valueMmscfh !=
                null
              ) {
                timeShowValueMmscfh = parseToNumber6Decimal(timeShowValueMmscfh + parseToNumber6Decimal(timeShow.valueMmscfh))
              }
            } else {
              timeShowValueMmscfh =
                timeShow.valueMmscfh
            }
            groupByNomPoint[
              existPointIndex
            ].timeShow[
              timeShowIndex
            ].value =
              parseToNumber6Decimal(
                timeShowValue
              ) ??
              timeShowValue
            groupByNomPoint[
              existPointIndex
            ].timeShow[
              timeShowIndex
            ].valueMmscfd =
              parseToNumber6Decimal(
                timeShowValueMmscfd
              ) ??
              timeShowValueMmscfd
            groupByNomPoint[
              existPointIndex
            ].timeShow[
              timeShowIndex
            ].valuePerHour =
              parseToNumber6Decimal(
                timeShowValuePerHour
              ) ??
              timeShowValuePerHour
            groupByNomPoint[
              existPointIndex
            ].timeShow[
              timeShowIndex
            ].valueMmscfh =
              parseToNumber6Decimal(
                timeShowValueMmscfh
              ) ??
              timeShowValueMmscfh
          } else {
            // ถ้ายังไม่มีเวลานี้ ให้เพิ่มเข้าไป
            groupByNomPoint[
              existPointIndex
            ].timeShow.push(
              timeShow
            )
            groupByNomPoint[
              existPointIndex
            ].timeShow.sort(
              (
                a: any,
                b: any
              ) => {
                return (
                  timeToMinutes(
                    a.time
                  ) -
                  timeToMinutes(
                    b.time
                  )
                )
              }
            )
          }
        }

        sumValueByTimeShow(
          groupByNomPoint[
            existPointIndex
          ].timeShow
        )
      }
    }

    sumValueMmscfAfterGrouped(groupByNomPoint)

    // Sort groupByNomPoint by gas_day, point, and shipper_name
    groupByNomPoint.sort(
      (a: any, b: any) => {
        // First sort by gas_day
        const dateA = dayjs(
          a.gas_day,
          'DD/MM/YYYY'
        )
        const dateB = dayjs(
          b.gas_day,
          'DD/MM/YYYY'
        )
        if (
          !dateA.isSame(dateB)
        ) {
          return dateA.isBefore(
            dateB
          )
            ? 1
            : -1
        }

        // Then sort by point
        if (
          a.point !== b.point
        ) {
          return a.point.localeCompare(
            b.point
          )
        }

        // Finally sort by shipper_name
        return a.shipper_name.localeCompare(
          b.shipper_name
        )
      }
    )

    // คืนค่าผลลัพธ์ที่จัดกลุ่มตาม nomination point แล้ว
    return groupByNomPoint
  }
}
