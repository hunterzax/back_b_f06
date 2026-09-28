import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {
  getTodayEndAdd7,
  getTodayEndYYYYMMDDDfaultAdd7,
  getTodayNowAdd7,
  getTodayStartAdd7,
  getTodayStartYYYYMMDDDfaultAdd7
} from 'src/common/utils/date.util'
import {
  findMoveEndDatePoints,
  findMoveStartDatePoints,
  getConflictReason,
  shouldAddOldPointToEndDateArray,
  shouldAddOldPointToStartDateArray,
  shouldBlockNewPeriod
} from 'src/common/utils/asset.util'
import {parseToNumber} from 'src/common/utils/number.util'
import {writeReq} from 'src/common/utils/write-req.util'
import {Prisma, group} from '@prisma/client'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class AssetNominationPointService {
  private readonly logger =
    new Logger(
      AssetNominationPointService.name
    )
  constructor(
    private prisma: PrismaService
  ) {}

  contractPointQuery(
    query: any
  ) {
    try {
      const {
        isActive,
        name,
        nameList
      } = query
      const todayStart =
        getTodayStartAdd7().toDate()
      const todayEnd =
        getTodayEndAdd7().toDate()

      const where = {
        AND: []
      }

      if (isActive == true) {
        where.AND.push({
          OR: [
            {
              contract_point_start_date:
                {
                  lte: todayStart
                }
            }, /// start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            {
              contract_point_end_date:
                {
                  lte: todayStart
                }
            }
          ]
        })
        where.AND.push({
          OR: [
            {
              contract_point_end_date:
                null
            }, // ถ้า end_date เป็น null
            {
              contract_point_end_date:
                {
                  gte: todayEnd
                }
            } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
          ]
        })
      }

      if (name) {
        where.AND.push({
          contract_point: name
        })
      } else if (nameList) {
        where.AND.push({
          contract_point: {
            in: nameList
          }
        })
      }

      return this.prisma.contract_point.findMany(
        {
          where: where,
          include: {
            area: true,
            zone: true,
            entry_exit: true,
            contract_nomination_point:
              {
                include: {
                  nomination_point:
                    {
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
    } catch (error) {
      return []
    }
  }

  async getSetDataByContact(
    contract_code_id: number
  ) {
    const fromTo = 5
    const contractCode =
      await this.prisma.contract_code.findFirst(
        {
          where: {
            id: Number(
              contract_code_id
            )
          },
          include: {
            group: true,
            booking_version: {
              include: {
                booking_full_json: true,
                booking_row_json:
                  {
                    include: {
                      entry_exit: true
                    }
                  }
              },
              take: 1,
              orderBy: {
                id: 'desc'
              }
            }
          }
        }
      )

    if (!contractCode) {
      return {}
    }

    const convertData = (
      contractCode
        ?.booking_version[0]
        ?.booking_row_json ||
      []
    ).map((e: any) => {
      return {
        ...e,
        data_temp: JSON.parse(
          e['data_temp']
        )
      }
    })

    const setData =
      (convertData || []).map(
        (eSum: any) => {
          const result =
            Object.keys(
              eSum[
                'data_temp'
              ]
            )
              .filter(
                (key) =>
                  Number(
                    key
                  ) >=
                  fromTo + 2
              )
              .reduce(
                (
                  acc,
                  key
                ) => {
                  acc[key] =
                    eSum[
                      'data_temp'
                    ][key]
                  return acc
                },
                {}
              )

          // ดึง key ทั้งหมดและจัดเรียง
          const keys =
            Object.keys(
              result
            ).sort(
              (a, b) =>
                Number(a) -
                Number(b)
            )
          // แบ่งเป็น 4 กลุ่ม
          const groups = []
          const groupSize =
            eSum[
              'entry_exit_id'
            ] === 1
              ? Math.ceil(
                  keys.length /
                    4
                )
              : Math.ceil(
                  keys.length /
                    2
                )
          for (
            let i = 0;
            i < keys.length;
            i += groupSize
          ) {
            const group = keys
              .slice(
                i,
                i + groupSize
              )
              .reduce(
                (
                  acc,
                  key
                ) => {
                  acc[key] =
                    result[
                      key
                    ]
                  return acc
                },
                {}
              )
            groups.push(group)
          }

          return {
            id: eSum['id'],
            booking_row_json_id:
              eSum['id'],
            booking_version_id:
              eSum[
                'booking_version_id'
              ],
            entry_exit_id:
              eSum[
                'entry_exit_id'
              ],
            entry_exit:
              eSum[
                'entry_exit'
              ],
            contract_point:
              eSum[
                'contract_point'
              ],
            zone_text:
              eSum[
                'zone_text'
              ],
            area_text:
              eSum[
                'area_text'
              ],
            start_date:
              eSum[
                'data_temp'
              ][fromTo],
            end_date:
              eSum[
                'data_temp'
              ][fromTo + 1]
          }
        }
      )

    return {
      group:
        contractCode?.group,
      contract_code_id:
        contractCode?.id,
      contract_code:
        contractCode?.contract_code,
      setData: setData
    }
  }

  async getSetDataByContactCodeIDList(
    contract_code_id_list: number[]
  ) {
    try {
      const fromTo = 5
      const contractCodeList =
        await this.prisma.contract_code.findMany(
          {
            where: {
              id: {
                in: contract_code_id_list
              }
            },
            include: {
              group: true,
              booking_version:
                {
                  include: {
                    booking_full_json: true,
                    booking_row_json:
                      {
                        include:
                          {
                            entry_exit: true
                          }
                      }
                  },
                  take: 1,
                  orderBy: {
                    id: 'desc'
                  }
                }
            }
          }
        )

      const result =
        contractCodeList.map(
          (contractCode) => {
            const convertData =
              (
                contractCode
                  ?.booking_version[0]
                  ?.booking_row_json ||
                []
              ).map(
                (e: any) => {
                  return {
                    ...e,
                    data_temp:
                      JSON.parse(
                        e[
                          'data_temp'
                        ]
                      )
                  }
                }
              )

            const setData =
              (convertData || []).map(
                (
                  eSum: any
                ) => {
                  const result =
                    Object.keys(
                      eSum[
                        'data_temp'
                      ]
                    )
                      .filter(
                        (
                          key
                        ) =>
                          Number(
                            key
                          ) >=
                          fromTo +
                            2
                      )
                      .reduce(
                        (
                          acc,
                          key
                        ) => {
                          acc[
                            key
                          ] =
                            eSum[
                              'data_temp'
                            ][
                              key
                            ]
                          return acc
                        },
                        {}
                      )

                  // ดึง key ทั้งหมดและจัดเรียง
                  const keys =
                    Object.keys(
                      result
                    ).sort(
                      (
                        a,
                        b
                      ) =>
                        Number(
                          a
                        ) -
                        Number(
                          b
                        )
                    )
                  // แบ่งเป็น 4 กลุ่ม
                  const groups =
                    []
                  const groupSize =
                    eSum[
                      'entry_exit_id'
                    ] === 1
                      ? Math.ceil(
                          keys.length /
                            4
                        )
                      : Math.ceil(
                          keys.length /
                            2
                        )
                  for (
                    let i = 0;
                    i <
                    keys.length;
                    i +=
                      groupSize
                  ) {
                    const group =
                      keys
                        .slice(
                          i,
                          i +
                            groupSize
                        )
                        .reduce(
                          (
                            acc,
                            key
                          ) => {
                            acc[
                              key
                            ] =
                              result[
                                key
                              ]
                            return acc
                          },
                          {}
                        )
                    groups.push(
                      group
                    )
                  }

                  return {
                    id: eSum[
                      'id'
                    ],
                    booking_row_json_id:
                      eSum[
                        'id'
                      ],
                    booking_version_id:
                      eSum[
                        'booking_version_id'
                      ],
                    entry_exit_id:
                      eSum[
                        'entry_exit_id'
                      ],
                    entry_exit:
                      eSum[
                        'entry_exit'
                      ],
                    contract_point:
                      eSum[
                        'contract_point'
                      ],
                    zone_text:
                      eSum[
                        'zone_text'
                      ],
                    area_text:
                      eSum[
                        'area_text'
                      ],
                    start_date:
                      eSum[
                        'data_temp'
                      ][
                        fromTo
                      ],
                    end_date:
                      eSum[
                        'data_temp'
                      ][
                        fromTo +
                          1
                      ]
                  }
                }
              )

            return {
              group:
                contractCode?.group,
              contract_code_id:
                contractCode?.id,
              contract_code:
                contractCode?.contract_code,
              setData: setData
            }
          }
        )

      return result
    } catch (error) {
      this.logger.error(
        'getSetDataByContactCodeIDList error :',
        error
      )
      return []
    }
  }

  async contractCodeWithNominationPointInContract_old() {
    try {
      const contractCode =
        await this.prisma.contract_code.findMany(
          {
            include: {
              group: {
                include: {
                  user_type: true
                }
              }
            },
            where: {
              OR: [
                {
                  status_capacity_request_management_id: 2
                }, // Approved
                {
                  status_capacity_request_management_id: 4
                } // Confirmed
              ]
            }
          }
        )
      const contractCodeWithNominationPoint =
        await Promise.all(
          contractCode.map(
            async (item) => {
              const contractCodeWithSetData =
                await this.getSetDataByContact(
                  item.id
                )
              const nominationPointInContract =
                await Promise.all(
                  (
                    contractCodeWithSetData?.setData ||
                    []
                  ).map(
                    async (
                      setData
                    ) => {
                      const activeContractPoint =
                        await this.contractPointQuery(
                          {
                            isActive: true,
                            name: setData?.contract_point
                          }
                        )
                      if (
                        activeContractPoint &&
                        activeContractPoint.length >
                          0
                      ) {
                        const nominationPoint =
                          await this.prisma.nomination_point.findMany(
                            {
                              where:
                                {
                                  contract_point_list:
                                    {
                                      some: {
                                        id: Number(
                                          activeContractPoint[0]
                                            .id
                                        )
                                        // OR: [
                                        //   {id: Number(activeContractPoint[0].id) },
                                        //   {id: {equals: 2} }
                                        // ]
                                      }
                                    }
                                }
                            }
                          )
                        return {
                          contractPoint:
                            activeContractPoint,
                          nominationPoint
                        }
                      } else {
                        const contractPoint =
                          await this.contractPointQuery(
                            {
                              name: setData?.contract_point
                            }
                          )
                        if (
                          contractPoint &&
                          contractPoint.length >
                            0
                        ) {
                          const nominationPoint =
                            await this.prisma.nomination_point.findMany(
                              {
                                where:
                                  {
                                    contract_point_list:
                                      {
                                        some: {
                                          id: Number(
                                            activeContractPoint[0]
                                              .id
                                          )
                                        }
                                      }
                                  }
                              }
                            )
                          return {
                            contractPoint:
                              contractPoint,
                            nominationPoint
                          }
                        }
                      }
                      return {
                        contractPoint:
                          [],
                        nominationPoint:
                          []
                      }
                    }
                  )
                )
              return {
                ...contractCodeWithSetData,
                nominationPointInContract:
                  nominationPointInContract.filter(
                    (item) =>
                      item
                        .nominationPoint
                        .length >
                      0
                  )
              }
            }
          )
        )
      return contractCodeWithNominationPoint.filter(
        (item) =>
          item
            .nominationPointInContract
            .length > 0
      )
    } catch (error) {
      return []
    }
  }

  async contractCodeWithNominationPointInContract(payload?: {
    startDate?: Date
    endDate?: Date
  }) {
    try {
      const {
        startDate,
        endDate
      } = payload || {}

      const andInWhere: Prisma.contract_codeWhereInput[] =
        [
          {
            OR: [
              {
                status_capacity_request_management_id: 2
              }, // Approved
              {
                status_capacity_request_management_id: 4
              } // Confirmed
            ]
          }
        ]

      if (endDate) {
        andInWhere.push({
          contract_start_date:
            {lte: endDate}
        })
      }

      if (startDate) {
        andInWhere.push(
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
                    gt: startDate
                  }
              } // Terminate date is after target date
            ]
          }
        )
        andInWhere.push(
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
                        gt: startDate
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
                            gt: startDate
                          }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        )
      }

      const contractCode =
        await this.prisma.contract_code.findMany(
          {
            include: {
              group: {
                include: {
                  user_type: true
                }
              }
            },
            where: {
              AND: andInWhere
            }
          }
        )
      const contractCodeWithSetDataList =
        await this.getSetDataByContactCodeIDList(
          contractCode.map(
            (item) => item.id
          )
        )

      const contractPointNameList =
        contractCodeWithSetDataList.flatMap(
          (
            contractCodeWithSetData
          ) =>
            contractCodeWithSetData.setData.map(
              (setDataItem) =>
                setDataItem.contract_point
            )
        )

      const uniqueContractPointNameList =
        [
          ...new Set(
            contractPointNameList
          )
        ]

      const activeContractPointList =
        await this.contractPointQuery(
          {
            isActive: true,
            nameList:
              uniqueContractPointNameList
          }
        )

      const nominationPointList =
        await this.prisma.nomination_point.findMany(
          {
            where: {
              contract_point_list:
                {
                  some: {
                    id: {
                      in: activeContractPointList.map(
                        (
                          activeContractPoint
                        ) =>
                          activeContractPoint.id
                      )
                    }
                    // OR: [
                    //   {id: Number(activeContractPoint[0].id) },
                    //   {id: {equals: 2} }
                    // ]
                  }
                }
            },
            include: {
              contract_point_list: true
            }
          }
        )

      const contractCodeWithNominationPoint =
        await Promise.all(
          contractCode.map(
            async (item) => {
              const contractCodeWithSetData =
                contractCodeWithSetDataList.find(
                  (setData) =>
                    setData.contract_code_id ==
                    item.id
                )
              const nominationPointInContract =
                await Promise.all(
                  (
                    contractCodeWithSetData?.setData ||
                    []
                  ).map(
                    async (
                      setData
                    ) => {
                      const activeContractPoint =
                        activeContractPointList.filter(
                          (
                            contractPoint
                          ) =>
                            contractPoint.contract_point ==
                            setData?.contract_point
                        )
                      if (
                        activeContractPoint &&
                        activeContractPoint.length >
                          0
                      ) {
                        const activeContractPointIDList =
                          activeContractPoint.map(
                            (
                              contractPoint
                            ) =>
                              contractPoint.id
                          )
                        const nominationPoint =
                          nominationPointList.filter(
                            (
                              nominationPoint
                            ) =>
                              nominationPoint.contract_point_list.some(
                                (
                                  contractPoint
                                ) =>
                                  activeContractPointIDList.includes(
                                    contractPoint.id
                                  )
                              )
                          )
                        return {
                          contractPoint:
                            activeContractPoint,
                          nominationPoint
                        }
                      } else {
                        const contractPoint =
                          await this.contractPointQuery(
                            {
                              name: setData?.contract_point
                            }
                          )
                        if (
                          contractPoint &&
                          contractPoint.length >
                            0
                        ) {
                          const nominationPoint =
                            await this.prisma.nomination_point.findMany(
                              {
                                where:
                                  {
                                    contract_point_list:
                                      {
                                        some: {
                                          id: Number(
                                            activeContractPoint[0]
                                              .id
                                          )
                                        }
                                      }
                                  }
                              }
                            )
                          return {
                            contractPoint:
                              contractPoint,
                            nominationPoint
                          }
                        }
                      }
                      return {
                        contractPoint:
                          [],
                        nominationPoint:
                          []
                      }
                    }
                  )
                )

              return {
                ...contractCodeWithSetData,
                nominationPointInContract:
                  nominationPointInContract.filter(
                    (item) =>
                      item
                        .nominationPoint
                        .length >
                      0
                  )
              }
            }
          )
        )
      return contractCodeWithNominationPoint.filter(
        (item) =>
          item
            .nominationPointInContract
            .length > 0
      )
    } catch (error) {
      this.logger.error(
        'contractCodeWithNominationPointInContract error :',
        error
      )
      return []
    }
  }

  nominationPoint(
    query: any
  ) {
    const {includeInactive} =
      query
    //
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()
    const andInWhere: Prisma.nomination_pointWhereInput[] =
      []

    if (
      includeInactive !=
      'true'
    ) {
      andInWhere.push({
        start_date: {
          lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
        }
      })
      andInWhere.push({
        OR: [
          {end_date: null}, // ถ้า end_date เป็น null
          {
            end_date: {
              gte: todayStart
            }
          } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
        ]
      })
    }
    return this.prisma.nomination_point.findMany(
      {
        where: {
          AND: andInWhere
        },
        include: {
          contract_point_list:
            {
              include: {
                zone: true,
                area: true,
                entry_exit: true,
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
                  shipper_contract_point:{
                    select:{
                      group:{
                        select:{
                          id: true,
                          id_name: true,
                          name: true
                        }
                      }
                    }
                  }
              }
            },
          zone: true,
          area: true,
          entry_exit: true,
          customer_type: true,
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
        orderBy: [
          {
            nomination_point: 'asc'
          },
          {
            id: 'desc'
          },
        ]
      }
    )
  }

  async nominationPointContract(
    query: any
  ) {
    const {
      nomination_point_start_date,
      nomination_point_end_date,
      contract_point,
      area
    } = query

    try {
      const andConditionInWhere =
        []
      // if (
      //   !nomination_point_start_date &&
      //   !nomination_point_end_date
      // ) {
      //   const todayStart =
      //     getTodayStartAdd7().toDate()
      //   const todayEnd =
      //     getTodayEndAdd7().toDate()
      //   andConditionInWhere.push(
      //     {
      //       start_date: {
      //         lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
      //       }
      //     }
      //   )
      //   andConditionInWhere.push(
      //     {
      //       OR: [
      //         {
      //           end_date: null
      //         }, // ถ้า end_date เป็น null
      //         {
      //           end_date: {
      //             gte: todayStart
      //           }
      //         } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
      //       ]
      //     }
      //   )
      // } else {
      //   const nomStart =
      //     dayjs(
      //       nomination_point_start_date
      //     ).format(
      //       'YYYY-MM-DD 00:00:00'
      //     )
      //   const nomEnd = dayjs(
      //     nomination_point_end_date
      //   ).format(
      //     'YYYY-MM-DD 23:59:59'
      //   )

      //   let start =
      //     getTodayNowAdd7(
      //       nomStart
      //     ).toDate()
      //   let end =
      //     getTodayNowAdd7(
      //       nomEnd
      //     ).toDate()

      //   if (
      //     nomination_point_end_date
      //   ) {
      //     andConditionInWhere.push(
      //       {
      //         start_date: {
      //           lte: end // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
      //         }
      //       }
      //     )
      //   }
      //   if (
      //     nomination_point_start_date
      //   ) {
      //     andConditionInWhere.push(
      //       {
      //         OR: [
      //           {
      //             end_date:
      //               null
      //           }, // ถ้า end_date เป็น null
      //           {
      //             end_date: {
      //               gte: start
      //             }
      //           } // ถ้า end_date ไม่เป็น null ต้องหลังเริ่มต้นวันนี้
      //         ]
      //       }
      //     )
      //   }
      // }
      if (area) {
        let areaId:
          | number
          | null =
          parseToNumber(area)
        if (areaId) {
          andConditionInWhere.push(
            {
              area_id: areaId
            }
          )
        }
      }
      const resData =
        await this.prisma.nomination_point.findMany(
          {
            where: {
              AND: andConditionInWhere
            },
            include: {
              contract_point_list: true,
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

      let result = resData

      //remove Nomination Point that have same Contract Point in same Contract Code
      if (contract_point) {
        const pointToRemoveList =
          await this.findUsedNominationPointOInContactCode(
            contract_point
          )
        if (
          pointToRemoveList.length >
          0
        ) {
          result = resData.filter(
            (item) => {
              return !pointToRemoveList.some(
                (point) =>
                  point.otherPoint.some(
                    (
                      toRemovePoint
                    ) =>
                      toRemovePoint.nominationPoint.some(
                        (
                          nominationPoint
                        ) => {
                          if (
                            nominationPoint.id ==
                            item.id
                          ) {
                            let currentPointString =
                              ''
                            const currentPointArray =
                              point.currentPoint.map(
                                (
                                  currentPoint
                                ) => {
                                  return currentPoint.contractPoint.map(
                                    (
                                      contractPoint
                                    ) =>
                                      contractPoint.contract_point
                                  )
                                }
                              )
                            const flattedArray =
                              currentPointArray.flat()
                            if (
                              flattedArray.length >
                              1
                            ) {
                              const lastPc =
                                flattedArray.pop()
                              currentPointString =
                                flattedArray.join(
                                  ', '
                                )
                              currentPointString += ` and ${lastPc}`
                            } else {
                              currentPointString =
                                flattedArray.join(
                                  ', '
                                )
                            }
                          }
                          return (
                            nominationPoint.id ==
                            item.id
                          )
                        }
                      )
                  )
              )
            }
          )
        }
      }

      // #region make it unique by nomination_point name
      // Make result unique by nomination_point name,
      // merge their start_date and end_date into an array if the name is duplicated.

      const uniqueMap = new Map();

      result.forEach((item) => {
        const name = item.nomination_point;
        if (!uniqueMap.has(name)) {
          // Clone the item to not reference original object
          uniqueMap.set(name, {
            ...item,
            dates: [{start_date: item.start_date, end_date: item.end_date}]
          });
        } else {
          // If name is duplicated, push start_date and end_date into array
          const existing = uniqueMap.get(name);
          if (item.start_date != null){
            existing.dates.push({start_date: item.start_date, end_date: item.end_date});
          }
        }
      });

      result = Array.from(uniqueMap.values());
      //#endregion

      return result
    } catch (error) {
      this.logger.error(
        'nominationPointContract error :',
        error
      )
      return []
    }
  }

  async validateNominationPointBeforeSave({validateList, contract_nomination_point, nomStartDate, nomEndDate}: {validateList : string[], contract_nomination_point: any[], nomStartDate: dayjs.Dayjs | null, nomEndDate: dayjs.Dayjs | null}) {
    const contractPointIDList = contract_nomination_point.map((point: any) => point.contract_point_id)
    const contractList = await this.prisma.contract_point.findMany({
      where: {
        id: {
          in: contractPointIDList
        }
      }
    })
    contract_nomination_point.map((point: any) => {
      const contractPoint = contractList.find((item: any) => item.id === point?.contract_point_id)
      if(contractPoint){
        const contractPointName = contractPoint?.contract_point
        const startDayjs = contractPoint?.contract_point_start_date ? getTodayNowAdd7(contractPoint.contract_point_start_date) : null
        const endDayjs = contractPoint?.contract_point_end_date ? getTodayNowAdd7(contractPoint.contract_point_end_date) : null
        
        if(startDayjs && startDayjs.isValid()){
          if(nomStartDate && nomStartDate.isValid() && nomStartDate.isBefore(startDayjs) && contractPointName){
            validateList.push(`The Contract point ${contractPointName} start date is after nomination point's start date.`)
          }

          if(nomEndDate && nomEndDate.isValid() && nomEndDate.isBefore(startDayjs) && contractPointName){
            validateList.push(`The Contract point ${contractPointName} start date is after nomination point's end date.`)
          }
        }
  
        if(endDayjs && endDayjs.isValid()){
          if(nomStartDate && nomStartDate.isValid() && nomStartDate.isAfter(endDayjs) && contractPointName){
            validateList.push(`The Contract Point ${contractPointName} end date is earlier than the Nomination Point's start date.`)
          }

          if((!nomEndDate || !nomEndDate.isValid() || nomEndDate.isAfter(endDayjs)) && contractPointName){
            validateList.push(`The Contract point ${contractPointName} end date is earlier than the Nomination Point's end date.`)
          }
        }
      }
    })

    return validateList
  }

  async nominationPointCreate(
    payload: any,
    userId: any,
    prismaTransaction?: any
  ) {
    const {
      start_date,
      end_date,
      contract_point_id,
      contract_nomination_point,
      entry_exit_id,
      zone_id,
      area_id,
      customer_type_id,
      ...dataWithout
    } = payload

    const startDayjs =
      start_date
        ? getTodayStartAdd7(
            start_date
          )
        : null
    const endDayjs = end_date
      ? getTodayStartAdd7(
          end_date
        )
      : null
    const startDate = (startDayjs && startDayjs.isValid()) ? startDayjs.toDate() : null
    const endDate = (endDayjs && endDayjs.isValid()) ? endDayjs.toDate() : null

    let validateList: string[] = []
    const activePoint =
      await (
        prismaTransaction ||
        this.prisma
      ).nomination_point.findMany(
        {
          where: {
            AND: [
              {
                nomination_point:
                  dataWithout?.nomination_point
              },
              {
                OR: [
                  // Case 1: New period starts during an existing period
                  {
                    AND: [
                      {
                        start_date:
                          {
                            lte: startDate
                          }
                      },
                      {
                        OR: [
                          {
                            end_date:
                              null
                          },
                          {
                            end_date:
                              {
                                gt: startDate
                              }
                          }
                        ]
                      }
                    ]
                  },
                  // Case 2: New period ends during an existing period (only if endDate is not null)
                  ...(endDate
                    ? [
                        {
                          AND: [
                            {
                              start_date:
                                {
                                  lt: endDate
                                }
                            },
                            {
                              OR: [
                                {
                                  end_date:
                                    null
                                },
                                {
                                  end_date:
                                    {
                                      gt: endDate
                                    }
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    : [
                        {
                          AND: [
                            {
                              start_date:
                                {
                                  gte: startDate
                                }
                            },
                            {
                              OR: [
                                {
                                  end_date:
                                    null
                                },
                                {
                                  end_date:
                                    {
                                      gt: startDate
                                    }
                                }
                              ]
                            }
                          ]
                        }
                      ]),
                  // Case 3: New period completely contains an existing period (only if endDate is not null)
                  ...(endDate
                    ? [
                        {
                          AND: [
                            {
                              start_date:
                                {
                                  gte: startDate
                                }
                            },
                            {
                              start_date:
                                {
                                  lt: endDate
                                }
                            },
                            {
                              OR: [
                                {
                                  end_date:
                                    null
                                },
                                {
                                  end_date:
                                    {
                                      gt: endDate
                                    }
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    : [])
                ]
              }
            ]
          },
          include: {
            contract_point_list:
              {
                include: {
                  zone: true,
                  area: true,
                  entry_exit: true,
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
            zone: true,
            area: true,
            entry_exit: true,
            customer_type: true,
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
    if (
      activePoint &&
      activePoint.length > 0
    ) {
      validateList =
        activePoint.map(
          (point) => {
            return `${point.nomination_point} already exists at ${dayjs(point.start_date).format('DD/MM/YYYY')}`
          }
        )
    }

    await this.validateNominationPointBeforeSave({validateList, contract_nomination_point, nomStartDate: startDayjs, nomEndDate: endDayjs})

      if (validateList.length > 0) {
      const message =
        validateList.join(
          '<br/>'
        )
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const pairedPoint =
      contract_nomination_point
        .filter((item) =>
          Number(
            item?.contract_point_id
          )
        )
        .map((item) => {
          return {
            id: Number(
              item.contract_point_id
            )
          }
        })
    const nominationPointCreate =
      await (
        prismaTransaction ||
        this.prisma
      ).nomination_point.create(
        {
          data: {
            ...dataWithout,

            contract_point_list:
              {
                connect:
                  pairedPoint
              },
            entry_exit: {
              connect: {
                id:
                  entry_exit_id ||
                  null
              }
            },
            zone: {
              connect: {
                id:
                  zone_id ||
                  null
              }
            },
            area: {
              connect: {
                id:
                  area_id ||
                  null
              }
            },
            customer_type: {
              connect: {
                id:
                  customer_type_id ||
                  null
              }
            },
            // active: true,
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            end_date: end_date
              ? getTodayNowAdd7(
                  end_date
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
    return nominationPointCreate
    // }
  }

  async nominationPointEdit(
    payload: any,
    userId: any,
    id: any,
    prismaTransaction?: any
  ) {
    const {
      start_date,
      end_date,
      contract_point_id,
      contract_nomination_point,
      entry_exit_id,
      zone_id,
      area_id,
      customer_type_id,
      ...dataWithout
    } = payload

    let validateList = []

    const startDayjs =
      start_date
        ? getTodayStartAdd7(
            start_date
          )
        : null
    const endDayjs = end_date
      ? getTodayStartAdd7(
          end_date
        )
      : null
    const startDate = (startDayjs && startDayjs.isValid()) ? startDayjs.toDate() : null
    const endDate = (endDayjs && endDayjs.isValid()) ? endDayjs.toDate() : null

    const activePoint =
      await (
        prismaTransaction ||
        this.prisma
      ).nomination_point.findMany(
        {
          where: {
            AND: [
              {
                id: {
                  not: Number(
                    id
                  )
                } // Exclude current point if editing
              },
              {
                nomination_point:
                  dataWithout?.nomination_point
              },
              {
                OR: [
                  // Case 1: New period starts during an existing period
                  {
                    AND: [
                      {
                        start_date:
                          {
                            lte: startDate
                          }
                      },
                      {
                        OR: [
                          {
                            end_date:
                              null
                          },
                          {
                            end_date:
                              {
                                gt: startDate
                              }
                          }
                        ]
                      }
                    ]
                  },
                  // Case 2: New period ends during an existing period (only if endDate is not null)
                  ...(endDate
                    ? [
                        {
                          AND: [
                            {
                              start_date:
                                {
                                  lt: endDate
                                }
                            },
                            {
                              OR: [
                                {
                                  end_date:
                                    null
                                },
                                {
                                  end_date:
                                    {
                                      gt: endDate
                                    }
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    : [
                        {
                          AND: [
                            {
                              start_date:
                                {
                                  gte: startDate
                                }
                            },
                            {
                              OR: [
                                {
                                  end_date:
                                    null
                                },
                                {
                                  end_date:
                                    {
                                      gt: startDate
                                    }
                                }
                              ]
                            }
                          ]
                        }
                      ]),
                  // Case 3: New period completely contains an existing period (only if endDate is not null)
                  ...(endDate
                    ? [
                        {
                          AND: [
                            {
                              start_date:
                                {
                                  gte: startDate
                                }
                            },
                            {
                              start_date:
                                {
                                  lt: endDate
                                }
                            },
                            {
                              OR: [
                                {
                                  end_date:
                                    null
                                },
                                {
                                  end_date:
                                    {
                                      gt: endDate
                                    }
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    : [])
                ]
              }
            ]
          },
          include: {
            contract_point_list:
              {
                include: {
                  zone: true,
                  area: true,
                  entry_exit: true,
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
            zone: true,
            area: true,
            entry_exit: true,
            customer_type: true,
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
    if (
      activePoint &&
      activePoint.length > 0
    ) {
      validateList =
        activePoint.map(
          (point) => {
            return `${point.nomination_point} already exists at ${getTodayNowAdd7(point.start_date).format('DD/MM/YYYY')} ${point.end_date ? `to ${getTodayNowAdd7(point.end_date).format('DD/MM/YYYY')}` : ''}`
          }
        )
    }

    const pairedPoint =
      contract_nomination_point
        .filter(
          (item) =>
            Number(
              item?.contract_point_id
            ) &&
            Number(
              item?.nomination_point_id
            )
        )
        .map((item) => {
          return {
            // nomination_point: {
            //   connect: {
            //     id: Number(item.nomination_point_id), // Prisma จะใช้ connect แทนการใช้ nomination_point โดยตรง
            //   },
            // },

            id: Number(
              item.contract_point_id
            )
            // contract_point: {
            //   connect: {
            //     id: Number(item.contract_point_id), // Prisma จะใช้ connect แทนการใช้ contract_point โดยตรง
            //   },
            // },

            // where: {
            //   id: Number(item.contract_point_id),
            // },
            // create:{
            //   contract_point: {
            //     connect: {
            //       id: Number(item.contract_point_id), // Prisma จะใช้ connect แทนการใช้ contract_point โดยตรง
            //     },
            //   },
            // }
          }
        })
    if (
      pairedPoint &&
      pairedPoint.length > 0
    ) {
      try {
        const newContractPointIDList =
          pairedPoint.map(
            (item) => item.id
          )
        const contractCodeWithNomination =
          await this.contractCodeWithNominationPointInContract(
            {
              startDate,
              endDate
            }
          )
        const contractCodeThatUseMoreThan1ContractPoint =
          contractCodeWithNomination.filter(
            (conntract) => {
              conntract.nominationPointInContract =
                conntract.nominationPointInContract.filter(
                  (
                    point: any
                  ) =>
                    point.contractPoint.some(
                      (
                        contractPoint: any
                      ) =>
                        newContractPointIDList.includes(
                          Number(
                            contractPoint.id
                          )
                        )
                    )
                )
              return (
                conntract
                  .nominationPointInContract
                  .length > 1
              )
            }
          )
        if (
          contractCodeThatUseMoreThan1ContractPoint.length >
          0
        ) {
          contractCodeThatUseMoreThan1ContractPoint.map(
            (conntract) => {
              const nominationPointInContract =
                conntract.nominationPointInContract.filter(
                  (point) => {
                    point.contractPoint =
                      point.contractPoint.filter(
                        (
                          contractPoint: any
                        ) =>
                          newContractPointIDList.includes(
                            Number(
                              contractPoint.id
                            )
                          )
                      )
                    return (
                      point
                        .contractPoint
                        .length >
                      0
                    )
                  }
                )
              const errorMessage =
                nominationPointInContract.map(
                  (point) => {
                    const contractPointNameList =
                      point.contractPoint.map(
                        (
                          contractPoint
                        ) =>
                          contractPoint.contract_point
                      )
                    let currentPointString =
                      ''
                    if (
                      contractPointNameList.length >
                      1
                    ) {
                      const lastPc =
                        contractPointNameList.pop()
                      currentPointString =
                        contractPointNameList.join(
                          ', '
                        )
                      currentPointString += ` and ${lastPc}`
                    } else {
                      currentPointString =
                        contractPointNameList.join(
                          ', '
                        )
                    }
                    return `Contract ${conntract.contract_code} have used ${currentPointString} Contract Point that have this Nomination Point.`
                  }
                )
              validateList.push(
                ...errorMessage
              )
            }
          )
        }
      } catch (error) {
        validateList =
          validateList
      }
    }

    await this.validateNominationPointBeforeSave({validateList, contract_nomination_point, nomStartDate: startDayjs, nomEndDate: endDayjs})

    if (
      validateList.length > 0
    ) {
      const message =
        validateList.join(
          '<br/>'
        )
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          key: message,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const nominationPointEdit =
      await (
        prismaTransaction ||
        this.prisma
      ).nomination_point.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            // contract_point: {
            //   connect: {
            //     id: contract_point_id || null,
            //   },
            // },
            contract_point_list:
              {
                set: pairedPoint
              },
            entry_exit: {
              connect: {
                id:
                  entry_exit_id ||
                  null
              }
            },
            zone: {
              connect: {
                id:
                  zone_id ||
                  null
              }
            },
            area: {
              connect: {
                id:
                  area_id ||
                  null
              }
            },
            customer_type: {
              connect: {
                id:
                  customer_type_id ||
                  null
              }
            },
            start_date:
              start_date
                ? getTodayStartAdd7(
                    start_date
                  ).toDate()
                : null,
            end_date: end_date
              ? getTodayStartAdd7(
                  end_date
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
          }
        }
      )
    return nominationPointEdit
    // }
  }

  private async updateNominationPointsWithDeduplication(
    points: any[],
    oldPoint: any,
    shouldAddOldPoint: boolean,
    updateData: any,
    prismaTransaction?: any,
    req?: any
  ) {
    if (points.length === 0)
      return

    if (shouldAddOldPoint) {
      points.push(oldPoint)
    }

    // Remove duplicates based on id
    const uniquePoints =
      points.filter(
        (
          point,
          index,
          self
        ) =>
          index ===
          self.findIndex(
            (p) =>
              p.id ===
              point.id
          )
      )

    if (
      uniquePoints.length > 0
    ) {
      await (
        prismaTransaction ||
        this.prisma
      ).nomination_point.updateMany(
        {
          where: {
            id: {
              in: uniquePoints.map(
                (item) =>
                  item.id
              )
            }
          },
          data: updateData
        }
      )
      try {
        Promise.all(
          uniquePoints.map(
            async (item) => {
              const his =
                await this.nominationPointOnce(
                  item.id
                )
              await writeReq(
                this.prisma,
                'DAM',
                req,
                `nomination-point`,
                'period',
                his
              )
            }
          )
        )
      } catch (error) {
        return
      }
    }
  }

  async nominationPointNewPeriod(
    payload: any,
    userId: any,
    prismaTransaction?: any,
    req?: any
  ) {
    const {
      start_date,
      end_date,
      ref_id,
      ...dataWithout
    } = payload

    const oldPoint =
      await this.nominationPointOnce(
        ref_id
      )
    if (!oldPoint) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          key: 'Nomination point did not exists',
          error:
            'Please try again later'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // Validate the new period
    const validation =
      await this.checkNominationPointNewPeriod(
        {
          name: dataWithout?.nomination_point,
          nomination_point_start_date:
            start_date,
          nomination_point_end_date:
            end_date,
          ref_id
        }
      )

    if (!validation.isValid) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            validation.validateList.join(
              '<br/>'
            )
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const startDate =
      getTodayStartAdd7(
        start_date
      ).toDate()
    const endDate = end_date
      ? getTodayStartAdd7(
          end_date
        ).toDate()
      : null

    // Common update data structure
    const updateMetadata = {
      update_by:
        Number(userId),
      update_date:
        getTodayNowAdd7().toDate(),
      update_date_num:
        getTodayNowAdd7().unix()
    }

    // Find and update points that need end date changes
    const moveEndDatePoints =
      await findMoveEndDatePoints(
        this.prisma,
        dataWithout?.nomination_point,
        startDate,
        endDate,
        ref_id,
        'nomination_point'
      )

    await this.updateNominationPointsWithDeduplication(
      moveEndDatePoints,
      oldPoint,
      shouldAddOldPointToEndDateArray(
        oldPoint,
        startDate,
        endDate
      ),
      {
        ...updateMetadata,
        end_date: startDate
      },
      prismaTransaction,
      req
    )

    // Find and update points that need start date changes (only if endDate exists)
    if (endDate) {
      const moveStartDatePoints =
        await findMoveStartDatePoints(
          this.prisma,
          dataWithout?.nomination_point,
          startDate,
          endDate,
          ref_id,
          'nomination_point'
        )

      await this.updateNominationPointsWithDeduplication(
        moveStartDatePoints,
        oldPoint,
        shouldAddOldPointToStartDateArray(
          oldPoint,
          startDate,
          endDate
        ),
        {
          ...updateMetadata,
          start_date: endDate
        },
        prismaTransaction,
        req
      )
    }

    const nominationPointCreate =
      await this.nominationPointCreate(
        payload,
        userId,
        prismaTransaction
      )

    try {
      const his =
        await this.nominationPointOnce(
          nominationPointCreate?.id
        )
      await writeReq(
        this.prisma,
        'DAM',
        req,
        `nomination-point`,
        'period',
        his
      )
    } catch (error) {
      return nominationPointCreate
    }

    return nominationPointCreate
  }

  nominationPointOnce(
    id: any
  ) {
    return this.prisma.nomination_point.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          customer_type: true,
          area: true,
          zone: true,
          entry_exit: true,
          contract_point: true,
          contract_point_list: true,
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

  async findUsedNominationPointOInContactCode(
    contractPointID: number
  ) {
    const contractCodeWithNomination =
      await this.contractCodeWithNominationPointInContract()
    const validationListOnlyThisPoint =
      contractCodeWithNomination.filter(
        (conntract) =>
          conntract.nominationPointInContract.some(
            (point: any) =>
              point.contractPoint.some(
                (
                  contractPoint: any
                ) =>
                  contractPoint.id ==
                  contractPointID
              )
          )
      )
    if (
      validationListOnlyThisPoint.length >
      0
    ) {
      const pointToRemoveList =
        validationListOnlyThisPoint
          .map((item) => {
            const targetIndex =
              item.nominationPointInContract.findIndex(
                (point) =>
                  point.contractPoint.some(
                    (
                      contractPoint: any
                    ) =>
                      contractPoint.id ==
                      contractPointID
                  )
              )
            if (
              targetIndex > -1
            ) {
              const removedPoint =
                item.nominationPointInContract.splice(
                  targetIndex,
                  1
                )
              return {
                contactCode:
                  item.contract_code,
                contactCodeID:
                  item.contract_code_id,
                currentPoint:
                  removedPoint,
                otherPoint:
                  item.nominationPointInContract
              }
            }
            return {
              contactCode:
                item.contract_code,
              contactCodeID:
                item.contract_code_id,
              otherPoint:
                item.nominationPointInContract
            }
          })
          .filter(
            (item) =>
              item.otherPoint
                .length > 0
          )
      return pointToRemoveList
    }
    return []
  }

  private async findConflictingNominationPoints(
    name: string,
    startDate: Date,
    endDate: Date | null,
    ref_id?: number
  ) {
    const existingPoints =
      await this.prisma.nomination_point.findMany(
        {
          where: {
            nomination_point:
              name
          },
          orderBy: {
            start_date: 'asc'
          }
        }
      )

    if (ref_id) {
      const oldPoint =
        await this.nominationPointOnce(
          ref_id
        )
      if (oldPoint) {
        existingPoints.push(
          oldPoint
        )
      }
    }

    const conflicts = []

    for (const existingPoint of existingPoints) {
      // Only treat as conflict if it should actually block the operation
      if (
        shouldBlockNewPeriod(
          startDate,
          endDate,
          existingPoint.start_date,
          existingPoint.end_date
        )
      ) {
        conflicts.push({
          ...existingPoint,
          conflictReason:
            getConflictReason(
              startDate,
              endDate,
              existingPoint.start_date,
              existingPoint.end_date
            )
        })
      }
    }

    return conflicts
  }

  async checkNominationPointNewPeriod(
    payload: any
  ) {
    const {
      name,
      nomination_point_start_date,
      nomination_point_end_date,
      ref_id
    } = payload

    // Validate input
    if (!name) {
      return {
        isValid: false,
        validateList: [
          'Nomination point name is required'
        ],
        nominationPoint: []
      }
    }

    if (
      !nomination_point_start_date
    ) {
      return {
        isValid: false,
        validateList: [
          'Start date is required'
        ],
        nominationPoint: []
      }
    }

    const startDate =
      getTodayNowAdd7(
        nomination_point_start_date
      ).toDate()
    const endDate =
      nomination_point_end_date
        ? getTodayNowAdd7(
            nomination_point_end_date
          ).toDate()
        : null

    // Validate date logic
    if (
      endDate &&
      startDate >= endDate
    ) {
      return {
        isValid: false,
        validateList: [
          'Start date must be before end date'
        ],
        nominationPoint: []
      }
    }

    // Find all conflicting nomination points
    const conflicts =
      await this.findConflictingNominationPoints(
        name,
        startDate,
        endDate,
        ref_id
      )

    // Generate validation messages
    const validateList =
      conflicts.map(
        (conflict) =>
          `${conflict.nomination_point} ${conflict.conflictReason}`
      )

    return {
      isValid:
        conflicts.length ===
        0,
      validateList,
      nominationPoint:
        conflicts
    }
  }

  async nominationPointByShipperOrContract(payload: any, userId: any) {
    const { shipper_id, contract_code, start_date, end_date, is_include_concept_point, is_only_RA6_and_BVW10_concept_point } = payload;
    const isIncludeConceptPoint = is_include_concept_point == 'true' || is_include_concept_point == true;
    const isOnlyRA6AndBVW10ConceptPoint = is_only_RA6_and_BVW10_concept_point == 'true' || is_only_RA6_and_BVW10_concept_point == true;
    const userType = await this.prisma.user_type.findFirst({
      where: {
        account_manage: { some: { account_id: Number(userId) } }
      }
    })

    if(!start_date || !end_date) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: 'Start date and end date are required.'
        },
        HttpStatus.FORBIDDEN
      )
    }
    const startDay = getTodayStartYYYYMMDDDfaultAdd7(start_date);
    const endDay = getTodayEndYYYYMMDDDfaultAdd7(end_date);
    if(!startDay.isValid() || !endDay.isValid()) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: 'Start date and end date are invalid.'
        },
        HttpStatus.FORBIDDEN
      )
    }

    let shipperIdList = shipper_id ? (JSON.parse(shipper_id) || []) : [];
    let contractCodeList = [];
    let group_ : group | null = null
    if (userType?.id === 3) {
      group_ = await this.prisma.group.findFirst({
        where: {
          account_manage: { some: { account_id: Number(userId)} }
        }
      })

      if(group_){
        shipperIdList = [group_.id_name];
      }
    }
    if(contract_code){
      try {
        contractCodeList = JSON.parse(contract_code) || [] 
      } catch (error) {
        contractCodeList = [contract_code];
      }
    }

    const bookingRowJson = await this.prisma.booking_row_json.findMany({
      where: {
        booking_version: {
          flag_use: true,
          contract_code: {
            contract_start_date: { lte: endDay.toDate() }, // Started before or on target date
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
                  { terminate_date: null, }, // No terminate date
                  { terminate_date: { gt: startDay.toDate() } }, // Terminate date is after target date
                ],
              },
              // Use extend_deadline if available, otherwise use contract_end_date
              {
                OR: [
                  // If extend_deadline exists, use it as end date
                  {
                    AND: [
                      { extend_deadline: { not: null } },
                      { extend_deadline: { gt: startDay.toDate() } },
                    ],
                  },
                  // If extend_deadline is null, use contract_end_date
                  {
                    AND: [
                      { extend_deadline: null },
                      {
                        OR: [
                          { contract_end_date: null },
                          { contract_end_date: { gt: startDay.toDate() } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            ...((shipper_id || userType?.id === 3) && { group: { id_name: { in: shipperIdList } } }),
            ...(contract_code && { contract_code: { in: contractCodeList } }),
          },
        },
      },
      select: { contract_point: true },
    });

    const nomData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        query_shipper_nomination_status: {
          id: { in: [2, 5] },
        },
        ...((shipper_id || userType?.id === 3) && { group: { id_name: { in: shipperIdList } } }),
        ...(contract_code && { contract_code: { contract_code: { in: contractCodeList } } }),
        AND: [
          {
            OR: [
              { del_flag: false },
              { del_flag: null },
            ],
          },
          {
            OR: [
              // Daily nominations: exact date match
              {
                nomination_type: { id: 1 },
                gas_day: {
                  gte: startDay.toDate(),
                  lte: endDay.toDate(),
                },
              },
              // Weekly nominations: same week
              {
                nomination_type: { id: 2 },
                gas_day: {
                  gte: startDay.startOf('week').toDate(),
                  lte: endDay.endOf('week').toDate(),
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
            ...( isIncludeConceptPoint ?
              {
                nomination_row_json: true
              }
              : {
            nomination_row_json: {
              where: { query_shipper_nomination_type_id: 1 }
            },
              }
            ),
          },
          where: { flag_use: true },
        },
      },
      orderBy: { id: 'desc' },
    });

    const converData = nomData.map(e => {
      const nomination_version = e.nomination_version.map(eN => {
        const nomination_row_json = eN.nomination_row_json.map(eRj => {
          const data_temp = JSON.parse(eRj.data_temp);
          const nomPoint = (isIncludeConceptPoint ? (data_temp['3'] || data_temp['4'] || data_temp['5']) : data_temp['3']) || '';
          if(eRj.query_shipper_nomination_type_id != 1) {
            console.log(nomPoint, eRj.query_shipper_nomination_type_id)
          }
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

    let nominationPoint : {id: number, nomPoint: string, area_text: string, zone_text: string, entry_exit_id: number, query_shipper_nomination_type_id: number, nomination_version_id: number, contract_code_id: number, nomination_type_id: number, row_id: number, unit: string | null}[] = [];
    for (let i = 0; i < converData.length; i++) {
      for (let i1 = 0; i1 < converData[i]?.nomination_version.length; i1++) {
        for (let i2 = 0; i2 < converData[i]?.nomination_version[i1]?.nomination_row_json.length; i2++) {
          nominationPoint.push({
            id: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.id || -1,
            nomPoint: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.nomPoint || '',
            area_text: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.area_text || '',
            zone_text: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.zone_text || '',
            entry_exit_id: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.entry_exit_id || -1,
            query_shipper_nomination_type_id: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.query_shipper_nomination_type_id || -1,
            nomination_version_id: converData[i]?.nomination_version[i1]?.id || -1,
            contract_code_id: converData[i]?.contract_code_id || -1,
            nomination_type_id: converData[i]?.nomination_type?.id || -1,
            row_id: converData[i]?.id || -1,
            unit: converData[i]?.nomination_version[i1]?.nomination_row_json[i2]?.data_temp['9'] || null,
          });
        }
      }
    }

    const pointNameList = Array.from(new Set((nominationPoint || []).map(e => e.nomPoint)))
    const nominationPointApi = await this.prisma.nomination_point.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                nomination_point: {
                  in: pointNameList,
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
            start_date: { lte: endDay.toDate() }, // start_date must be before or same as gas day
          },
          {
            OR: [
              { end_date: null }, // if end_date is null
              { end_date: { gt: startDay.toDate() } }, // if end_date is not null, must be after gas day
            ],
          },
        ],
      },
      orderBy: { nomination_point: 'asc' },
    });

    if(isIncludeConceptPoint) {
      let conceptPointNameList = pointNameList;
      if(isOnlyRA6AndBVW10ConceptPoint){
        conceptPointNameList = pointNameList.filter(pointName => ['East_to_RA6', 'West_to_RA6', 'East_to_BVW10', 'West_to_BVW10'].includes(pointName));
      }
      const conceptPoint = await this.prisma.concept_point.findMany({
        where: {
          AND: [
            {
              concept_point: {
                in: conceptPointNameList,
              },
            },
            ...(group_
              ? [
                  {
                    limit_concept_point_history: {
                      some: {
                        group_id: group_.id,
                        create_date: { lte: endDay.toDate() },
                        OR: [
                          { deleted_date: null },
                          { deleted_date: { gte: startDay.toDate() } },
                        ],
                      },
                    },
                  },
                ]
              : []),
            {
              start_date: { lte: endDay.toDate() }, // start_date must be before or same as gas day
            },
            {
              OR: [
                { end_date: null }, // if end_date is null
                { end_date: { gt: startDay.toDate() } }, // if end_date is not null, must be after gas day
              ],
            },
          ],
        },
        orderBy: { concept_point: 'asc' },
      })

      return [...nominationPointApi, ...conceptPoint];
    }

    return nominationPointApi;
  }
}
