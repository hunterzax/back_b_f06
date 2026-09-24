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
import {
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayStartDDMMYYYYAdd7
} from 'src/common/utils/date.util'
import {
  Prisma,
  PrismaClient
} from '@prisma/client'
import {DefaultArgs} from '@prisma/client/runtime/library'
import {isMatch} from 'src/common/utils/allocation.util'
import {getBookingValueWithPath} from 'src/common/utils/booking.util'
import {parseToNumber} from 'src/common/utils/number.util'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class ReleaseCapacitySubmissionService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  contractCode() {
    return this.prisma.contract_code.findMany(
      {
        include: {
          group: {
            include: {
              user_type: true
            }
          }
        },
        where: {
          status_capacity_request_management_id: 2
        }
      }
    )
  }

  deepEqual(obj1, obj2) {
    if (obj1 === obj2)
      return true
    if (
      typeof obj1 !==
        'object' ||
      typeof obj2 !==
        'object' ||
      obj1 === null ||
      obj2 === null
    ) {
      return false
    }

    const keys1 =
      Object.keys(obj1)
    const keys2 =
      Object.keys(obj2)

    if (
      keys1.length !==
      keys2.length
    )
      return false

    return keys1.every(
      (key) =>
        this.deepEqual(
          obj1[key],
          obj2[key]
        )
    )
  }

  arraysContainSameElements(
    arr1,
    arr2
  ) {
    if (
      arr1.length !==
      arr2.length
    )
      return false

    // เปรียบเทียบทุก element โดยไม่สนใจลำดับ
    return arr1.every(
      (item1) =>
        arr2.some((item2) =>
          this.deepEqual(
            item1,
            item2
          )
        )
    )
  }

  // ----- getRelease old
  async findAll(
    payload: any
  ) {
    const {contract_code_id} =
      payload
    const contractCode =
      await this.prisma.contract_code.findFirst(
        {
          where: {
            id: Number(
              contract_code_id
            )
            // status_capacity_request_management_id: 2
          },
          include: {
            group: true,
            booking_version: {
              include: {
                // booking_full_json:true,
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
      return []
    }

    const useData =
      contractCode
        ?.booking_version[0]
        ?.booking_row_json
    const convertData =
      useData?.map(
        (e: any) => {
          return {
            ...e,
            data_temp:
              JSON.parse(
                e['data_temp']
              )
          }
        }
      )

    const nowDates =
      getTodayNowAdd7().toDate()

    //
    const pathManagement =
      await this.prisma.path_management.findFirst(
        {
          where: {
            start_date: {
              lt: nowDates
                ? getTodayNowAdd7(
                    nowDates
                  ).toDate()
                : null
            }
          },
          include: {
            path_management_config: true
          },
          orderBy: {
            start_date: 'desc'
          }
        }
      )
    const pathEntryExit =
      pathManagement[
        'path_management_config'
      ]?.map((e: any) => {
        return {
          ...e,
          temps: JSON.parse(
            e['temps']
          )
        }
      })
    const findEntry =
      pathEntryExit?.map(
        (e: any) => {
          const findId =
            e?.temps?.revised_capacity_path?.find(
              (f: any) => {
                return (
                  f?.area
                    ?.entry_exit_id ===
                  1
                )
              }
            )
          const findExit =
            e?.temps?.revised_capacity_path?.filter(
              (f: any) => {
                return (
                  f?.area
                    ?.entry_exit_id ===
                  2
                )
              }
            )

          return {
            ...e,
            entryId:
              findId?.area
                ?.id,
            entryName:
              findId?.area
                ?.name,
            findExit,
            full: e?.temps
              ?.revised_capacity_path
          }
        }
      )

    const dataRow =
      convertData
    const entryUse =
      dataRow.filter(
        (f: any) => {
          return (
            f?.entry_exit_id ===
            1
          )
        }
      )
    const exitUse =
      dataRow.filter(
        (f: any) => {
          return (
            f?.entry_exit_id ===
            2
          )
        }
      )

    const compareArrEntry = []

    // const fromTo = 33;
    const fromTo = 5

    const setData =
      convertData?.map(
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

          // รวม value ทั้งหมด
          const sumSFCContractedMMBTU =
            Object.values(
              groups[0]
            ).reduce(
              (
                total: any,
                value: any
              ) =>
                total +
                Number(value),
              0
            ) || null
          const sumSFCMaximumMMBTU =
            Object.values(
              groups[1]
            ).reduce(
              (
                total: any,
                value: any
              ) =>
                total +
                Number(value),
              0
            ) || null
          const sumSFCContractedMmscfd =
            (eSum[
              'entry_exit_id'
            ] === 1 &&
              Object.values(
                groups[2]
              ).reduce(
                (
                  total: any,
                  value: any
                ) =>
                  total +
                  Number(
                    value
                  ),
                0
              )) ||
            null
          const sumSFCMaximumMmscfd =
            (eSum[
              'entry_exit_id'
            ] === 1 &&
              Object.values(
                groups[3]
              ).reduce(
                (
                  total: any,
                  value: any
                ) =>
                  total +
                  Number(
                    value
                  ),
                0
              )) ||
            null

          return {
            id: eSum['id'],
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
              ][fromTo + 1],
            contracted_mmbtu_d:
              sumSFCContractedMMBTU,
            maximum_mmbtu:
              sumSFCMaximumMMBTU,
            contracted_mmscfd:
              eSum[
                'entry_exit_id'
              ] === 1
                ? sumSFCContractedMmscfd
                : null,
            maximum_mmscfd:
              eSum[
                'entry_exit_id'
              ] === 1
                ? sumSFCMaximumMmscfd
                : null
          }
        }
      )

    const newRes =
      await Promise.all(
        exitUse?.map(
          async (e: any) => {
            const pathMatch =
              e
            let exitData =
              setData.find(
                (f: any) => {
                  return (
                    f?.area_text ===
                    e[
                      'area_text'
                    ]
                  )
                }
              )
            let entData =
              setData.find(
                (f: any) => {
                  return (
                    f?.[
                      'entry_exit_id'
                    ] === 1
                  )
                }
              )

            const pathMatchEntry =
              entryUse.find(
                (f: any) => {
                  return (
                    f?.area_text ===
                    entData[
                      'area_text'
                    ]
                  )
                }
              )
            const filETs =
              findEntry?.find(
                (f: any) => {
                  return (
                    f?.exit_name_temp ===
                    exitData?.area_text
                  )
                }
              )

            const contP =
              await this.prisma.area.findFirst(
                {
                  where: {
                    name: filETs?.entryName
                  },
                  select: {
                    name: true,
                    entry_exit: true,
                    area_nominal_capacity: true,
                    contract_point:
                      {
                        select:
                          {
                            contract_point: true,
                            zone: {
                              select:
                                {
                                  name: true
                                }
                            }
                          }
                      }
                  }
                }
              )

            let entryData: any =
              {
                ...entData
              }

            return {
              pathMatch,
              pathMatchExit:
                pathMatch,
              pathMatchEntry:
                pathMatchEntry,
              entryData,
              exitData,
              path: filETs
            }
          }
        )
      )

    return {
      group:
        contractCode?.group,
      contract_code_id:
        contractCode?.id,
      contract_code:
        contractCode?.contract_code,
      data: newRes,
      setData: setData,
      // newRes: newRes,
      findEntry: findEntry
    }
  }

  async getRelease(
    payload: any
  ) {
    // const fromTo = 33;
    const fromTo = 5
    const nowDates =
      getTodayNowAdd7().toDate()
    const {contract_code_id} =
      payload

    if (
      !contract_code_id ||
      contract_code_id ===
        'undefined'
    ) {
      return {
        group: undefined,
        contract_code_id:
          undefined,
        contract_code:
          undefined,
        data: [],
        setData: [],
        findEntry: []
      }
    }

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
      return {
        group: undefined,
        contract_code_id:
          undefined,
        contract_code:
          undefined,
        data: [],
        setData: [],
        findEntry: []
      }
    }

    const pathManagement =
      await this.prisma.path_management.findFirst(
        {
          where: {
            start_date: {
              lt: nowDates
                ? getTodayNowAdd7(
                    nowDates
                  ).toDate()
                : null
            }
          },
          include: {
            path_management_config: true
          },
          orderBy: {
            start_date: 'desc'
          }
        }
      )

    const pathEntryExit =
      pathManagement[
        'path_management_config'
      ]?.map((e: any) => {
        return {
          ...e,
          temps: JSON.parse(
            e['temps']
          )
        }
      })

    const findEntry =
      pathEntryExit?.map(
        (e: any) => {
          const findId =
            e?.temps?.revised_capacity_path?.find(
              (f: any) => {
                return (
                  f?.area
                    ?.entry_exit_id ===
                  1
                )
              }
            )
          const findExit =
            e?.temps?.revised_capacity_path?.filter(
              (f: any) => {
                return (
                  f?.area
                    ?.entry_exit_id ===
                  2
                )
              }
            )

          return {
            ...e,
            entryId:
              findId?.area
                ?.id,
            entryName:
              findId?.area
                ?.name,
            findExit,
            full: e?.temps
              ?.revised_capacity_path
          }
        }
      )

    const convertDataFull =
      contractCode
        ?.booking_version[0]
        ?.booking_full_json[0]
    convertDataFull[
      'data_temp'
    ] = JSON.parse(
      contractCode
        ?.booking_version[0]
        ?.booking_full_json[0][
        'data_temp'
      ]
    )

    const convertData = (
      contractCode
        ?.booking_version[0]
        ?.booking_row_json ||
      []
    )?.map((e: any) => {
      return {
        ...e,
        data_temp: JSON.parse(
          e['data_temp']
        )
      }
    })

    const endDate =
      getTodayNowAdd7(
        contractCode?.terminate_date ??
          contractCode?.extend_deadline ??
          contractCode?.contract_end_date
      )

    const headMMBTU =
      convertDataFull[
        'data_temp'
      ]['headerEntry'][
        'Capacity Daily Booking (MMBTU/d)'
      ]
    const headMMSCFD =
      convertDataFull[
        'data_temp'
      ]['headerEntry'][
        'Capacity Daily Booking (MMscfd)'
      ]
    const headMMBTUH =
      convertDataFull[
        'data_temp'
      ]['headerEntry'][
        'Maximum Hour Booking (MMBTU/h)'
      ]
    const headMMSCFH =
      convertDataFull[
        'data_temp'
      ]['headerEntry'][
        'Maximum Hour Booking (MMscfh)'
      ]

    const keysMMBTU =
      Object.keys(headMMBTU)
        .filter((date) => {
          const dateJs =
            getTodayNowDDMMYYYYAdd7(
              date
            )
          if (
            dateJs.isValid()
          ) {
            return (
              headMMBTU[date]
                ?.key &&
              dateJs.isSameOrBefore(
                endDate
              )
            )
          } else {
            return headMMBTU[
              date
            ]?.key
          }
        }) // กรองเฉพาะที่เป็นวันที่และมี key
        ?.map((date) => ({
          key: Number(
            headMMBTU[date]
              .key
          ), // แปลง key เป็นตัวเลข
          date: date // ใช้ date เป็นค่า
        }))
        .sort(
          (a, b) =>
            a.key - b.key
        ) // เรียงลำดับตาม key
    const keysMMBTH =
      Object.keys(headMMBTUH)
        .filter((date) => {
          const dateJs =
            getTodayNowDDMMYYYYAdd7(
              date
            )
          if (
            dateJs.isValid()
          ) {
            return (
              headMMBTUH[date]
                ?.key &&
              dateJs.isSameOrBefore(
                endDate
              )
            )
          } else {
            return headMMBTUH[
              date
            ]?.key
          }
        }) // กรองเฉพาะที่เป็นวันที่และมี key
        ?.map((date) => ({
          key: Number(
            headMMBTUH[date]
              .key
          ), // แปลง key เป็นตัวเลข
          date: date // ใช้ date เป็นค่า
        }))
        .sort(
          (a, b) =>
            a.key - b.key
        ) // เรียงลำดับตาม key
    const keysMMSCFD =
      Object.keys(headMMSCFD)
        .filter((date) => {
          const dateJs =
            getTodayNowDDMMYYYYAdd7(
              date
            )
          if (
            dateJs.isValid()
          ) {
            return (
              headMMSCFD[date]
                ?.key &&
              dateJs.isSameOrBefore(
                endDate
              )
            )
          } else {
            return headMMSCFD[
              date
            ]?.key
          }
        }) // กรองเฉพาะที่เป็นวันที่และมี key
        ?.map((date) => ({
          key: Number(
            headMMSCFD[date]
              .key
          ), // แปลง key เป็นตัวเลข
          date: date // ใช้ date เป็นค่า
        }))
        .sort(
          (a, b) =>
            a.key - b.key
        ) // เรียงลำดับตาม key
    const keysMMSCFH =
      Object.keys(headMMSCFH)
        .filter((date) => {
          const dateJs =
            getTodayNowDDMMYYYYAdd7(
              date
            )
          if (
            dateJs.isValid()
          ) {
            return (
              headMMSCFH[date]
                ?.key &&
              dateJs.isSameOrBefore(
                endDate
              )
            )
          } else {
            return headMMSCFH[
              date
            ]?.key
          }
        }) // กรองเฉพาะที่เป็นวันที่และมี key
        ?.map((date) => ({
          key: Number(
            headMMSCFH[date]
              .key
          ), // แปลง key เป็นตัวเลข
          date: date // ใช้ date เป็นค่า
        }))
        .sort(
          (a, b) =>
            a.key - b.key
        ) // เรียงลำดับตาม key

    const dataRow =
      convertData

    const entryUse =
      dataRow.filter(
        (f: any) => {
          return (
            f?.entry_exit_id ===
            1
          )
        }
      )

    const exitUse =
      dataRow.filter(
        (f: any) => {
          return (
            f?.entry_exit_id ===
            2
          )
        }
      )

    const setData =
      convertData?.map(
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
          // รวม value ทั้งหมด
          const sumSFCContractedMMBTU =
            Object.values(
              groups[0]
            ).reduce(
              (
                total: any,
                value: any
              ) =>
                total +
                Number(value),
              0
            ) || null
          const sumSFCMaximumMMBTU =
            Object.values(
              groups[1]
            ).reduce(
              (
                total: any,
                value: any
              ) =>
                total +
                Number(value),
              0
            ) || null
          const sumSFCContractedMmscfd =
            (eSum[
              'entry_exit_id'
            ] === 1 &&
              Object.values(
                groups[2]
              ).reduce(
                (
                  total: any,
                  value: any
                ) =>
                  total +
                  Number(
                    value
                  ),
                0
              )) ||
            null
          const sumSFCMaximumMmscfd =
            (eSum[
              'entry_exit_id'
            ] === 1 &&
              Object.values(
                groups[3]
              ).reduce(
                (
                  total: any,
                  value: any
                ) =>
                  total +
                  Number(
                    value
                  ),
                0
              )) ||
            null

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
              ][fromTo + 1],
            contracted_mmbtu_d:
              sumSFCContractedMMBTU,
            maximum_mmbtu:
              sumSFCMaximumMMBTU,
            contracted_mmscfd:
              eSum[
                'entry_exit_id'
              ] === 1
                ? sumSFCContractedMmscfd
                : null,
            maximum_mmscfd:
              eSum[
                'entry_exit_id'
              ] === 1
                ? sumSFCMaximumMmscfd
                : null,
            contracted_mmbtu_d_array:
              keysMMBTU?.map(
                (
                  ks: any,
                  kix: number
                ) => {
                  let st =
                    kix === 0
                      ? eSum[
                          'data_temp'
                        ][
                          fromTo
                        ]
                      : keysMMBTU[
                          kix
                        ]
                          ?.date
                  let edDayjs =
                    kix ===
                    keysMMBTU.length -
                      1
                      ? dayjs(
                          eSum[
                            'data_temp'
                          ][
                            fromTo +
                              1
                          ],
                          'DD/MM/YYYY'
                        )
                      : keysMMBTU.length >
                          0
                        ? dayjs(
                            keysMMBTU[
                              kix +
                                1
                            ]
                              ?.date,
                            'DD/MM/YYYY'
                          ).subtract(
                            1,
                            'day'
                          )
                        : dayjs(
                            eSum[
                              'data_temp'
                            ][
                              fromTo +
                                1
                            ],
                            'DD/MM/YYYY'
                          ).subtract(
                            1,
                            'day'
                          )
                  if (
                    edDayjs.isAfter(
                      endDate
                    )
                  ) {
                    edDayjs =
                      endDate.subtract(
                        1,
                        'day'
                      )
                  }
                  const ed =
                    edDayjs.format(
                      'DD/MM/YYYY'
                    )
                  return {
                    ...ks,
                    value:
                      (!!result[
                        ks[
                          'key'
                        ]
                      ] &&
                        Number(
                          result[
                            ks[
                              'key'
                            ]
                          ].replace(
                            /,/g,
                            ''
                          )
                        )) ||
                      null,
                    start_date:
                      st,
                    end_date:
                      ed
                  }
                }
              ) || [],
            maximum_mmbtu_array:
              keysMMBTH?.map(
                (
                  ks: any,
                  kix: number
                ) => {
                  let st =
                    kix === 0
                      ? eSum[
                          'data_temp'
                        ][
                          fromTo
                        ]
                      : keysMMBTH[
                          kix
                        ]
                          ?.date
                  let edDayjs =
                    kix ===
                    keysMMBTH.length -
                      1
                      ? dayjs(
                          eSum[
                            'data_temp'
                          ][
                            fromTo +
                              1
                          ],
                          'DD/MM/YYYY'
                        )
                      : keysMMBTH.length >
                          0
                        ? dayjs(
                            keysMMBTH[
                              kix +
                                1
                            ]
                              ?.date,
                            'DD/MM/YYYY'
                          ).subtract(
                            1,
                            'day'
                          )
                        : dayjs(
                            eSum[
                              'data_temp'
                            ][
                              fromTo +
                                1
                            ],
                            'DD/MM/YYYY'
                          ).subtract(
                            1,
                            'day'
                          )
                  if (
                    edDayjs.isAfter(
                      endDate
                    )
                  ) {
                    edDayjs =
                      endDate.subtract(
                        1,
                        'day'
                      )
                  }
                  const ed =
                    edDayjs.format(
                      'DD/MM/YYYY'
                    )
                  return {
                    ...ks,
                    value:
                      (!!result[
                        ks[
                          'key'
                        ]
                      ] &&
                        Number(
                          result[
                            ks[
                              'key'
                            ]
                          ].replace(
                            /,/g,
                            ''
                          )
                        )) ||
                      null,
                    start_date:
                      st,
                    end_date:
                      ed
                  }
                }
              ) || [],
            contracted_mmscfd_array:
              eSum[
                'entry_exit_id'
              ] === 1
                ? keysMMSCFD?.map(
                    (
                      ks: any,
                      kix: number
                    ) => {
                      let st =
                        kix ===
                        0
                          ? eSum[
                              'data_temp'
                            ][
                              fromTo
                            ]
                          : keysMMSCFD[
                              kix
                            ]
                              ?.date
                      let edDayjs =
                        kix ===
                        keysMMSCFD.length -
                          1
                          ? dayjs(
                              eSum[
                                'data_temp'
                              ][
                                fromTo +
                                  1
                              ],
                              'DD/MM/YYYY'
                            )
                          : keysMMSCFD.length >
                              0
                            ? dayjs(
                                keysMMSCFD[
                                  kix +
                                    1
                                ]
                                  ?.date,
                                'DD/MM/YYYY'
                              ).subtract(
                                1,
                                'day'
                              )
                            : dayjs(
                                eSum[
                                  'data_temp'
                                ][
                                  fromTo +
                                    1
                                ],
                                'DD/MM/YYYY'
                              ).subtract(
                                1,
                                'day'
                              )
                      if (
                        edDayjs.isAfter(
                          endDate
                        )
                      ) {
                        edDayjs =
                          endDate.subtract(
                            1,
                            'day'
                          )
                      }
                      const ed =
                        edDayjs.format(
                          'DD/MM/YYYY'
                        )
                      return {
                        ...ks,
                        value:
                          (!!result[
                            ks[
                              'key'
                            ]
                          ] &&
                            Number(
                              result[
                                ks[
                                  'key'
                                ]
                              ].replace(
                                /,/g,
                                ''
                              )
                            )) ||
                          null,
                        start_date:
                          st,
                        end_date:
                          ed
                      }
                    }
                  )
                : [],
            maximum_mmscfd_array:
              eSum[
                'entry_exit_id'
              ] === 1
                ? keysMMSCFH?.map(
                    (
                      ks: any,
                      kix: number
                    ) => {
                      let st =
                        kix ===
                        0
                          ? eSum[
                              'data_temp'
                            ][
                              fromTo
                            ]
                          : keysMMSCFH[
                              kix
                            ]
                              ?.date
                      let edDayjs =
                        kix ===
                        keysMMSCFH.length -
                          1
                          ? dayjs(
                              eSum[
                                'data_temp'
                              ][
                                fromTo +
                                  1
                              ],
                              'DD/MM/YYYY'
                            )
                          : keysMMSCFH.length >
                              0
                            ? dayjs(
                                keysMMSCFH[
                                  kix +
                                    1
                                ]
                                  ?.date,
                                'DD/MM/YYYY'
                              ).subtract(
                                1,
                                'day'
                              )
                            : dayjs(
                                eSum[
                                  'data_temp'
                                ][
                                  fromTo +
                                    1
                                ],
                                'DD/MM/YYYY'
                              ).subtract(
                                1,
                                'day'
                              )
                      if (
                        edDayjs.isAfter(
                          endDate
                        )
                      ) {
                        edDayjs =
                          endDate.subtract(
                            1,
                            'day'
                          )
                      }
                      const ed =
                        edDayjs.format(
                          'DD/MM/YYYY'
                        )
                      return {
                        ...ks,
                        value:
                          (!!result[
                            ks[
                              'key'
                            ]
                          ] &&
                            Number(
                              result[
                                ks[
                                  'key'
                                ]
                              ].replace(
                                /,/g,
                                ''
                              )
                            )) ||
                          null,
                        start_date:
                          st,
                        end_date:
                          ed
                      }
                    }
                  )
                : []
          }
        }
      )

    const result: any[] = []
    const newRes =
      await Promise.all(
        exitUse?.map(
          async (e: any) => {
            const pathMatch =
              e
            let exitData =
              setData.find(
                (f: any) => {
                  return (
                    f?.area_text ===
                    e[
                      'area_text'
                    ]
                  )
                }
              )

            const filETs =
              findEntry?.find(
                (f: any) => {
                  return (
                    f?.exit_name_temp ===
                    exitData?.area_text
                  )
                }
              )

            let entryDataArrUse =
              setData.filter(
                (f: any) => {
                  return (
                    f?.[
                      'entry_exit_id'
                    ] === 1
                  )
                }
              )

            entryDataArrUse?.map(
              (entData) => {
                const pathMatchEntry =
                  entryUse.find(
                    (
                      f: any
                    ) => {
                      return (
                        f?.area_text ===
                        entData[
                          'area_text'
                        ]
                      )
                    }
                  )

                let entryData: any =
                  {
                    ...entData
                  }

                result.push({
                  pathMatch,
                  pathMatchExit:
                    pathMatch,
                  pathMatchEntry:
                    pathMatchEntry,
                  entryData,
                  //
                  exitData,
                  pathMatchExitUse:
                    pathMatch,
                  entryDataArrUse:
                    entryDataArrUse?.map(
                      (
                        eDa: any
                      ) => {
                        const pathMatchEntry =
                          entryUse.find(
                            (
                              f: any
                            ) => {
                              return (
                                f?.area_text ===
                                eDa[
                                  'area_text'
                                ]
                              )
                            }
                          )
                        return {
                          ...eDa,
                          pathMatchEntry:
                            pathMatchEntry
                        }
                      }
                    ),
                  path: filETs
                })

                return {
                  pathMatch,
                  pathMatchExit:
                    pathMatch,
                  pathMatchEntry:
                    pathMatchEntry,
                  entryData,
                  //
                  exitData,
                  pathMatchExitUse:
                    pathMatch,
                  entryDataArrUse:
                    entryDataArrUse?.map(
                      (
                        eDa: any
                      ) => {
                        const pathMatchEntry =
                          entryUse.find(
                            (
                              f: any
                            ) => {
                              return (
                                f?.area_text ===
                                eDa[
                                  'area_text'
                                ]
                              )
                            }
                          )
                        return {
                          ...eDa,
                          pathMatchEntry:
                            pathMatchEntry
                        }
                      }
                    ),
                  path: filETs
                }
              }
            )
          }
        )
      )

    return {
      group:
        contractCode?.group,
      contract_code_id:
        contractCode?.id,
      contract_code:
        contractCode?.contract_code,
      data: result,
      setData: setData,
      // newRes: newRes,
      findEntry: findEntry
      // convertDataFull,
      // convertData
    }
  }

  /**
   * ดึงข้อมูลการปลดปล่อยความจุ (release capacity) จัดกลุ่มตามพื้นที่เข้าและวันที่
   *
   * @param payload - ข้อมูลที่ส่งมา ประกอบด้วย contract_code_id
   * @returns ข้อมูลการปลดปล่อยความจุที่จัดกลุ่มแล้ว
   */
  async getReleaseGroupByEntryAreaAndDate(
    payload: any
  ) {
    const {contract_code_id} =
      payload

    // ค้นหาข้อมูลสัญญาจากฐานข้อมูล พร้อมข้อมูลที่เกี่ยวข้อง
    const contractCode =
      await this.prisma.contract_code.findFirst(
        {
          where: {
            id: Number(
              contract_code_id
            )
          },
          include: {
            group: true, // ข้อมูลกลุ่ม
            booking_version: {
              include: {
                booking_full_json: true, // ข้อมูลการจองแบบเต็ม
                booking_row_json:
                  {
                    include: {
                      entry_exit: true // ข้อมูลจุดเข้า-ออก
                    }
                  }
              },
              take: 1, // เอาแค่เวอร์ชันล่าสุด
              orderBy: {
                id: 'desc'
              } // เรียงตาม id จากมากไปน้อย
            }
          }
        }
      )

    // หากไม่พบข้อมูลสัญญา ให้คืนค่าอาร์เรย์ว่าง
    if (!contractCode) {
      return []
    }

    // กำหนดวันที่สิ้นสุดสัญญา โดยใช้ลำดับความสำคัญ:
    // 1. terminate_date (วันที่ยกเลิก)
    // 2. extend_deadline (วันที่ขยาย)
    // 3. contract_end_date (วันที่สิ้นสุดสัญญา)
    const contractCodeEndDate =
      contractCode?.terminate_date ??
      contractCode?.extend_deadline ??
      contractCode?.contract_end_date

    // ค้นหาข้อมูลการจัดการเส้นทางที่เริ่มต้นก่อนวันที่สิ้นสุดสัญญา
    const pathManagementList =
      await this.prisma.path_management.findMany(
        {
          where: {
            start_date: {
              lt: contractCodeEndDate // น้อยกว่าวันที่สิ้นสุดสัญญา
            }
          },
          include: {
            path_management_config: true // ข้อมูลการกำหนดค่าเส้นทาง
          },
          orderBy: {
            start_date: 'desc' // เรียงตามวันที่เริ่มต้นจากมากไปน้อย
          }
        }
      )

    // แปลงข้อมูลการจองแบบเต็มจาก JSON string เป็น object
    const convertDataFull =
      contractCode
        ?.booking_version[0]
        ?.booking_full_json[0]
    convertDataFull[
      'data_temp'
    ] = JSON.parse(
      contractCode
        ?.booking_version[0]
        ?.booking_full_json[0][
        'data_temp'
      ]
    )

    // แปลงข้อมูลการจองแบบแถวจาก JSON string เป็น object
    const convertData = (
      contractCode
        ?.booking_version[0]
        ?.booking_row_json ||
      []
    )?.map((e: any) => {
      return {
        ...e,
        data_temp: JSON.parse(
          e['data_temp']
        )
      }
    })

    // จัดกลุ่มจุดเข้าและออกตามโซนเดียวกัน
    const groupByEntryAreaWithSameZone =
      {}
    const usedExitIdList: number[] =
      [] // เก็บ ID ของจุดออกที่ใช้แล้ว

    // วนลูปผ่านจุดเข้า (entry_exit_id = 1) เพื่อหาจุดออกที่เกี่ยวข้อง
    convertData
      .filter((f: any) => {
        return (
          f?.entry_exit_id ===
          1
        )
      })
      ?.map(
        (entryPoint: any) => {
          const entryZone =
            entryPoint.zone_text // โซนของจุดเข้า
          const key = `${entryPoint.contract_point}_${entryZone}` // สร้าง key สำหรับจัดกลุ่ม

          // หาจุดออกที่อยู่ในโซนเดียวกัน
          let exitPoint =
            convertData.filter(
              (f: any) => {
                return (
                  isMatch(
                    f?.zone_text,
                    entryZone
                  ) &&
                  f?.[
                    'entry_exit_id'
                  ] === 2
                )
              }
            )

          // หากเป็นโซน East หรือ West ให้รวมจุดออกในโซน East-West ด้วย
          if (
            isMatch(
              entryZone,
              'East'
            ) ||
            isMatch(
              entryZone,
              'West'
            )
          ) {
            exitPoint =
              exitPoint.concat(
                convertData.filter(
                  (
                    f: any
                  ) => {
                    return (
                      isMatch(
                        f?.zone_text,
                        'East-West'
                      ) &&
                      f?.[
                        'entry_exit_id'
                      ] === 2
                    )
                  }
                )
              )
          }

          // เรียงลำดับจุดออกตามชื่อ contract_point
          exitPoint.sort(
            (a, b) =>
              a.contract_point.localeCompare(
                b.contract_point
              )
          )

          // เก็บ ID ของจุดออกที่ใช้แล้ว
          usedExitIdList.push(
            ...exitPoint?.map(
              (f: any) => f.id
            )
          )

          // สร้างหรืออัปเดตกลุ่มข้อมูล
          if (
            !groupByEntryAreaWithSameZone[
              key
            ]
          ) {
            groupByEntryAreaWithSameZone[
              key
            ] = [
              entryPoint,
              ...exitPoint
            ]
          } else {
            groupByEntryAreaWithSameZone[
              key
            ] = [
              ...groupByEntryAreaWithSameZone[
                key
              ],
              entryPoint,
              ...exitPoint
            ].sort((a, b) => {
              // เรียงลำดับตาม entry_exit_id ก่อน แล้วตาม contract_point
              if (
                a.entry_exit_id !==
                b.entry_exit_id
              ) {
                return (
                  a.entry_exit_id -
                  b.entry_exit_id
                )
              }
              return a.contract_point.localeCompare(
                b.contract_point
              )
            })
          }

          return [
            entryPoint,
            ...exitPoint
          ]
        }
      )

    // จัดการจุดออกที่ยังไม่ได้ใช้ (ไม่ได้จับคู่กับจุดเข้า)
    let unUsedExitPointList =
      convertData.filter(
        (f: any) => {
          return (
            f?.entry_exit_id ===
              2 &&
            !usedExitIdList.includes(
              f.id
            )
          )
        }
      )

    // วนลูปจนกว่าจะจัดการจุดออกที่ไม่ได้ใช้ทั้งหมด
    while (
      unUsedExitPointList.length >
      0
    ) {
      unUsedExitPointList?.map(
        (exitPoint: any) => {
          const exitZone =
            exitPoint.zone_text
          const key = `Zone_${exitZone}` // สร้าง key สำหรับจุดออกที่ไม่ได้ใช้

          // หาจุดออกทั้งหมดในโซนเดียวกัน
          let pointList =
            unUsedExitPointList.filter(
              (f: any) =>
                isMatch(
                  f?.zone_text,
                  exitZone
                )
            )

          // หากเป็นโซน East หรือ West ให้รวมจุดออกในโซน East-West ด้วย
          if (
            isMatch(
              exitZone,
              'East'
            ) ||
            isMatch(
              exitZone,
              'West'
            )
          ) {
            pointList =
              pointList.concat(
                unUsedExitPointList.filter(
                  (f: any) =>
                    isMatch(
                      f?.zone_text,
                      'East-West'
                    )
                )
              )
          }

          // เรียงลำดับตามชื่อ contract_point
          pointList.sort(
            (a, b) =>
              a.contract_point.localeCompare(
                b.contract_point
              )
          )

          // เก็บ ID ของจุดออกที่ใช้แล้ว
          usedExitIdList.push(
            ...pointList?.map(
              (f: any) => f.id
            )
          )

          // อัปเดตรายการจุดออกที่ไม่ได้ใช้
          unUsedExitPointList =
            convertData.filter(
              (f: any) => {
                return (
                  f?.entry_exit_id ===
                    2 &&
                  !usedExitIdList.includes(
                    f.id
                  )
                )
              }
            )

          // สร้างหรืออัปเดตกลุ่มข้อมูลสำหรับจุดออกที่ไม่ได้ใช้
          if (
            !groupByEntryAreaWithSameZone[
              key
            ]
          ) {
            groupByEntryAreaWithSameZone[
              key
            ] = pointList
          } else {
            groupByEntryAreaWithSameZone[
              key
            ] = [
              ...groupByEntryAreaWithSameZone[
                key
              ],
              ...pointList
            ].sort((a, b) =>
              a.contract_point.localeCompare(
                b.contract_point
              )
            )
          }

          return pointList
        }
      )
    }

    // คำนวณค่าการจองพร้อมเส้นทางสำหรับทุกวันในระยะเวลาสัญญา
    const bookingValueWithPath =
      await getBookingValueWithPath(
        {
          prisma: this.prisma,
          startDate:
            getTodayNowAdd7(
              contractCode.contract_start_date
            ),
          endDate:
            getTodayNowAdd7(
              contractCodeEndDate
            ),
          bookingFullJson:
            convertDataFull
        }
      )

    // จัดกลุ่มข้อมูลตามวันที่และสร้าง groupkey สำหรับการจัดกลุ่ม
    let groupByDate = {}
    Object.keys(
      bookingValueWithPath
    )?.map((date) => {
      const valueForEachDay =
        bookingValueWithPath[
          date
        ] // ค่าการจองสำหรับวันนั้น

      Object.keys(
        groupByEntryAreaWithSameZone
      ).map((key) => {
        const pointList =
          groupByEntryAreaWithSameZone[
            key
          ] // รายการจุดในกลุ่ม
        let groupkey = '' // key สำหรับจัดกลุ่มข้อมูล

        // สร้างข้อมูลสำหรับแต่ละจุดในกลุ่ม
        const eachGroupValue =
          pointList.map(
            (point: any) => {
              // หาค่าการจองที่ตรงกับพื้นที่ของจุดนี้
              const valueOfArea =
                valueForEachDay.find(
                  (item) => {
                    return isMatch(
                      item
                        .area
                        .name,
                      point.area_text
                    )
                  }
                )

              // สร้าง groupkey จากข้อมูลต่างๆ เพื่อใช้ในการจัดกลุ่ม
              groupkey += `${point.id}_${point.contract_point}_${point.zone_text}_${point.area_text}_${point.entry_exit_id}_${valueOfArea.mmbtud}_${valueOfArea.mmscfd}_${valueOfArea.pathConfig?.id}`

              return {
                // mmbtuh: valueOfArea.mmbtuh, // ค่า MMBTU/h (ถูก comment ออก)
                // mmscfh: valueOfArea.mmscfh, // ค่า MMscfh (ถูก comment ออก)
                booking_row_json_id:
                  point.id, // ID ของ booking row
                pathMatch:
                  point, // ข้อมูลจุดที่จับคู่
                temp_contract_point:
                  point.contract_point, // ชื่อจุดสัญญา
                temp_zone:
                  point.zone_text, // โซน
                temp_area:
                  point.area_text, // พื้นที่
                total_contracted_mmbtu_d:
                  valueOfArea.originalMmbtud, // ค่า MMBTU/d เดิม ใช้ valueOfArea.mmbtud ถ้าจะเอาค่าที่คิดตาม path
                total_contracted_mmscfd:
                  valueOfArea.originalMmscfd, // ค่า MMscfd เดิม ใช้ valueOfArea.mmscfd ถ้าจะเอาค่าที่คิดตาม path
                temp_date:
                  date, // วันที่
                entry_exit_id:
                  point.entry_exit_id, // ID ประเภทจุด (เข้า/ออก)
                entry_exit:
                  point.entry_exit, // ข้อมูลประเภทจุด
                path: valueOfArea.pathConfig // ข้อมูลการกำหนดค่าเส้นทาง
              }
            }
          )

        // จัดกลุ่มข้อมูลตาม groupkey
        if (
          !groupByDate[
            groupkey
          ]
        ) {
          groupByDate[
            groupkey
          ] = [eachGroupValue]
        } else {
          groupByDate[
            groupkey
          ].push(
            eachGroupValue
          )
        }
      })
    })

    // หาวันที่เริ่มต้นและสิ้นสุดสำหรับแต่ละ groupkey
    const data = []
    Object.keys(
      groupByDate
    )?.map((groupkey) => {
      const groupData =
        groupByDate[groupkey]

      // ตรวจสอบว่าข้อมูลเป็นอาร์เรย์และไม่ว่าง
      if (
        !Array.isArray(
          groupData
        ) ||
        groupData.length === 0
      ) {
        return groupData
      }

      // ดึงวันที่ทั้งหมดจากข้อมูลกลุ่มและแปลงเป็นอาร์เรย์แบน
      const tempDates =
        groupData
          ?.map((data: any) =>
            data?.map(
              (item: any) =>
                item.temp_date
            )
          )
          .flat()
      let defaultDate: dayjs.Dayjs | null =
        null

      // กำหนดวันที่เริ่มต้นสำหรับการเปรียบเทียบ
      if (
        tempDates.length > 0
      ) {
        defaultDate =
          getTodayNowDDMMYYYYAdd7(
            tempDates[0]
          )
      }

      // หาวันที่เริ่มต้นและสิ้นสุดจากรายการวันที่ทั้งหมด
      const minDate =
        tempDates.reduce(
          (
            min: dayjs.Dayjs,
            current: dayjs.Dayjs | null
          ) =>
            getTodayNowDDMMYYYYAdd7(
              current
            ) < min
              ? getTodayNowDDMMYYYYAdd7(
                  current
                )
              : min,
          defaultDate
        )
      const maxDate =
        tempDates.reduce(
          (
            max: dayjs.Dayjs,
            current: dayjs.Dayjs | null
          ) =>
            getTodayNowDDMMYYYYAdd7(
              current
            ) > max
              ? getTodayNowDDMMYYYYAdd7(
                  current
                )
              : max,
          defaultDate
        )

      // สร้างข้อมูลสำหรับแต่ละเดือนระหว่างวันที่เริ่มต้นและสิ้นสุด
      if (
        minDate &&
        maxDate
      ) {
        let currentMonth =
          minDate.startOf(
            'month'
          ) // เริ่มต้นที่เดือนของวันที่เริ่มต้น
        const endMonth =
          maxDate.endOf(
            'month'
          ) // สิ้นสุดที่เดือนของวันที่สิ้นสุด

        // วนลูปผ่านทุกเดือนระหว่าง minDate และ maxDate
        while (
          currentMonth.isBefore(
            endMonth
          ) ||
          currentMonth.isSame(
            endMonth,
            'month'
          )
        ) {
          const startOfMonth =
            currentMonth.startOf(
              'month'
            ) // วันที่ 1 ของเดือน
          const endOfMonth =
            currentMonth.endOf(
              'month'
            ) // วันที่สุดท้ายของเดือน

          // กำหนดวันที่เริ่มต้นและสิ้นสุดของเดือน โดยพิจารณาจาก minDate และ maxDate
          const monthStart =
            minDate.isSame(
              currentMonth,
              'month'
            ) &&
            minDate.isAfter(
              startOfMonth
            )
              ? minDate
              : startOfMonth
          const monthEnd =
            maxDate.isSame(
              currentMonth,
              'month'
            ) &&
            maxDate.isBefore(
              endOfMonth
            )
              ? maxDate
              : endOfMonth

          // สร้างข้อมูลสำหรับเดือนนี้
          data.push(
            groupData[0]?.map(
              (item: any) => {
                return {
                  ...item,
                  temp_start_date:
                    monthStart
                      ?.tz(
                        'Asia/Bangkok'
                      )
                      ?.format(
                        'DD/MM/YYYY'
                      ) ??
                    item.temp_date, // วันที่เริ่มต้นของเดือน
                  temp_end_date:
                    monthEnd
                      ?.tz(
                        'Asia/Bangkok'
                      )
                      ?.format(
                        'DD/MM/YYYY'
                      ) ??
                    item.temp_date, // วันที่สิ้นสุดของเดือน
                  temp_from_date:
                    monthEnd
                      ?.tz(
                        'Asia/Bangkok'
                      )
                      ?.format(
                        'DD/MM/YYYY'
                      ) ??
                    item.temp_date, // วันที่จาก (ใช้ค่าเดียวกับ temp_end_date)
                  temp_to_date:
                    monthEnd
                      ?.tz(
                        'Asia/Bangkok'
                      )
                      ?.format(
                        'DD/MM/YYYY'
                      ) ??
                    item.temp_date, // วันที่ถึง (ใช้ค่าเดียวกับ temp_end_date)
                  temp_date:
                    startOfMonth
                      .tz(
                        'Asia/Bangkok'
                      )
                      ?.format(
                        'DD/MM/YYYY'
                      ) ??
                    item.temp_date // วันที่ของเดือน (วันที่ 1)
                }
              }
            )
          )

          currentMonth =
            currentMonth.add(
              1,
              'month'
            ) // ไปยังเดือนถัดไป
        }
      } else {
        // หากไม่สามารถกำหนดวันที่ได้ ให้ใช้วันที่เดิม
        data.push(
          groupData[0]?.map(
            (data: any) => {
              data.temp_start_date =
                data.temp_date
              data.temp_end_date =
                data.temp_date
              return data
            }
          )
        )
      }
    })

    // เรียงลำดับข้อมูลที่ซ้อนกันตาม temp_start_date แล้วตาม temp_contract_point
    const sortedData =
      data.sort((a, b) => {
        try {
          // ดึงรายการแรกจากแต่ละอาร์เรย์ที่ซ้อนกันเพื่อเปรียบเทียบ
          const firstItemA =
            a[0]
          const firstItemB =
            b[0]

          // เรียงลำดับตาม temp_start_date ก่อน
          const dateA =
            getTodayNowDDMMYYYYAdd7(
              firstItemA.temp_start_date
            )
          const dateB =
            getTodayNowDDMMYYYYAdd7(
              firstItemB.temp_start_date
            )

          if (
            dateA.isBefore(
              dateB
            )
          )
            return -1
          if (
            dateA.isAfter(
              dateB
            )
          )
            return 1

          // หากวันที่เท่ากัน ให้เรียงลำดับตาม temp_contract_point
          return firstItemA.temp_contract_point.localeCompare(
            firstItemB.temp_contract_point
          )
        } catch (error) {
          return 0 // หากเกิดข้อผิดพลาด ให้คืนค่า 0 (ไม่เปลี่ยนแปลงลำดับ)
        }
      })

    // คืนค่าผลลัพธ์ที่ประกอบด้วยข้อมูลต่างๆ
    return {
      group:
        contractCode?.group, // ข้อมูลกลุ่ม
      contract_code_id:
        contractCode?.id, // ID ของรหัสสัญญา
      contract_code:
        contractCode?.contract_code, // รหัสสัญญา
      data: sortedData, // ข้อมูลที่เรียงลำดับแล้ว
      // setData: setData, // ข้อมูลที่ตั้งค่า (ถูก comment ออก)
      // findEntry: findEntry // ข้อมูลการหาจุดเข้า (ถูก comment ออก)
      groupByEntryAreaWithSameZone, // ข้อมูลที่จัดกลุ่มตามพื้นที่เข้าและโซนเดียวกัน
      pathManagementList // รายการการจัดการเส้นทาง
    }
  }

  // -----

  async createSubmission(
    contract_code_id: any,
    group_id: any,
    data: any,
    userId: any,
    status: any
  ) {
    const dateCre =
      getTodayNowAdd7()

    const counts =
      await this.prisma.release_capacity_submission.count()
    const runNum = counts + 1
    const runNumFormate =
      runNum > 999
        ? runNum
        : runNum > 99
          ? '0' + runNum
          : runNum > 9
            ? '00' + runNum
            : '000' + runNum

    const nowAt =
      getTodayNowAdd7().toDate()
    const fRQ = `${dayjs(nowAt).format('YYMMDD')}-RQ-${runNumFormate}`

    const submissionId =
      await this.prisma.release_capacity_submission.create(
        {
          data: {
            ...(contract_code_id !==
              null && {
              contract_code: {
                connect: {
                  id: Number(
                    contract_code_id
                  )
                }
              }
            }),
            ...(group_id !==
              null && {
              group: {
                connect: {
                  id: Number(
                    group_id
                  )
                }
              }
            }),
            ...(status !==
              null && {
              release_capacity_status:
                {
                  connect: {
                    id: Number(
                      status
                    )
                  }
                }
            }),
            // active: true,
            requested_code:
              fRQ,
            submission_time:
              dateCre.toDate(),
            create_date:
              dateCre.toDate(),
            // create_by: Number(userId),
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
            contract_code: {
              include: {
                term_type: true
              }
            }
          }
        }
      )

    const newData =
      await data?.map(
        (e: any) => {
          const {
            entry_exit_id,
            booking_row_json_id,
            temp_start_date, // แก้
            temp_end_date, // แก้
            total_contracted_mmbtu_d,
            total_release_mmbtu_d,
            pathMatch,
            path,
            total_contracted_mmscfd,
            total_release_mmscfd,
            temp_date, // new
            temp_from_date, // new
            temp_to_date, // new

            entry_exit,
            ...newE
          } = e

          return {
            ...newE,

            temp_date:
              temp_date, // new
            temp_from_date:
              temp_from_date, // new
            temp_to_date:
              temp_to_date, // new

            total_contracted_mmbtu_d:
              (!!total_contracted_mmbtu_d &&
                String(
                  total_contracted_mmbtu_d
                )) ||
              null,
            total_release_mmbtu_d:
              (!!total_release_mmbtu_d &&
                String(
                  total_release_mmbtu_d
                )) ||
              null,
            path_management_config_temp:
              !!e
                ? JSON.stringify(
                    e
                  )
                : null,
            release_capacity_submission_id:
              Number(
                submissionId?.id
              ),
            entry_exit_id:
              Number(
                entry_exit_id
              ),
            booking_row_json_id:
              Number(
                pathMatch?.id
              ),
            path_management_config_id:
              !!path?.id
                ? Number(
                    path?.id
                  )
                : null,
            total_contracted_mmscfd:
              (!!total_contracted_mmscfd &&
                String(
                  total_contracted_mmscfd
                )) ||
              null,
            total_release_mmscfd:
              (!!total_release_mmscfd &&
                String(
                  total_release_mmscfd
                )) ||
              null,
            temp_start_date:
              temp_start_date
                ? getTodayNowDDMMYYYYDfaultAdd7(
                    temp_start_date
                  ).toDate()
                : null,
            temp_end_date:
              temp_end_date
                ? getTodayNowDDMMYYYYDfaultAdd7(
                    temp_end_date
                  ).toDate()
                : null,

            create_date:
              dateCre.toDate(),
            create_by:
              Number(userId),
            create_date_num:
              getTodayNowAdd7().unix()
            // create_by_account: {
            //   connect: {
            //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            //   },
            // },
          }
        }
      )
    await this.prisma.release_capacity_submission_detail.createMany(
      {
        data: newData
      }
    )

    return submissionId
  }

  async submissionFileCreate(
    payload: any,
    userId: any
  ) {
    const {id, url} = payload

    const dateCre =
      getTodayNowAdd7()
    let urlArr = []
    for (
      let i = 0;
      i < url.length;
      i++
    ) {
      urlArr.push({
        // ...(id !== null && {
        //   release_capacity_submission: {
        //     connect: {
        //       id: Number(id),
        //     },
        //   },
        // }),
        release_capacity_submission_id:
          Number(id),
        url: url[i],
        create_date:
          dateCre.toDate(),
        create_by:
          Number(userId),
        create_date_num:
          getTodayNowAdd7().unix()
        // create_by_account: {
        //   connect: {
        //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
        //   },
        // },
      })
    }

    return await this.prisma.release_capacity_submission_file.createMany(
      {
        data: urlArr
      }
    )
  }

  // pub & path detail
  async changeStatus(
    payload: any,
    id: any,
    userId: any
  ) {
    const {status, reasons} =
      payload

    if (status === 2) {
      const result =
        await this.prisma.$transaction(
          async (prisma) => {
            const getRelease =
              await prisma.release_capacity_submission.findFirst(
                {
                  where: {
                    id: Number(
                      id
                    )
                  },
                  include: {
                    contract_code: true,
                    group: true,
                    release_capacity_submission_detail: true
                  }
                }
              )
            const {
              contract_code_id,
              group_id,
              release_capacity_submission_detail,
              submission_time
            } = getRelease

            const dateCre =
              getTodayNowAdd7()

            const summary =
              await prisma.release_summary.create(
                {
                  data: {
                    ...(contract_code_id !==
                      null && {
                      contract_code:
                        {
                          connect:
                            {
                              id: Number(
                                contract_code_id
                              )
                            }
                        }
                    }),
                    ...(group_id !==
                      null && {
                      group: {
                        connect:
                          {
                            id: Number(
                              group_id
                            )
                          }
                      }
                    }),
                    release_type:
                      {
                        connect:
                          {
                            id: 2
                          }
                      },
                    submitted_timestamp:
                      submission_time,
                    create_date:
                      dateCre.toDate(),
                    // create_by: Number(userId),
                    create_date_num:
                      getTodayNowAdd7().unix(),
                    create_by_account:
                      {
                        connect:
                          {
                            id: Number(
                              userId
                            ) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                          }
                      }
                  }
                }
              )
            let dataArr: any =
              []

            for (
              let i = 0;
              i <
              release_capacity_submission_detail.length;
              i++
            ) {
              dataArr.push({
                release_summary_id:
                  summary?.id,
                booking_row_json_id:
                  Number(
                    release_capacity_submission_detail[
                      i
                    ]
                      ?.booking_row_json_id
                  ),
                path_management_config_temp:
                  release_capacity_submission_detail[
                    i
                  ]
                    ?.path_management_config_temp,
                path_management_config_id:
                  Number(
                    release_capacity_submission_detail[
                      i
                    ]
                      ?.path_management_config_id
                  ),
                entry_exit_id:
                  Number(
                    release_capacity_submission_detail[
                      i
                    ]
                      ?.entry_exit_id
                  ),
                // ...(!!release_capacity_submission_detail[i]?.id && {
                //   booking_row_json: {
                //     connect: {
                //       id: Number(release_capacity_submission_detail[i]?.id),
                //     },
                //   },
                // }),
                // ...(!!release_capacity_submission_detail[i]?.entry_exit_id && {
                //   entry_exit: {
                //     connect: {
                //       id: Number(release_capacity_submission_detail[i]?.entry_exit_id),
                //     },
                //   },
                // }),
                temp_contract_point:
                  release_capacity_submission_detail[
                    i
                  ]
                    ?.temp_contract_point,
                temp_area:
                  release_capacity_submission_detail[
                    i
                  ]
                    ?.temp_area,
                temp_zone:
                  release_capacity_submission_detail[
                    i
                  ]
                    ?.temp_zone,
                total_contracted_mmbtu_d:
                  (release_capacity_submission_detail[
                    i
                  ]
                    ?.total_contracted_mmbtu_d &&
                    String(
                      release_capacity_submission_detail[
                        i
                      ]
                        ?.total_contracted_mmbtu_d
                    )) ||
                  null,
                total_release_mmbtu_d:
                  (release_capacity_submission_detail[
                    i
                  ]
                    ?.total_release_mmbtu_d &&
                    String(
                      release_capacity_submission_detail[
                        i
                      ]
                        ?.total_release_mmbtu_d
                    )) ||
                  null,
                total_contracted_mmscfd:
                  (release_capacity_submission_detail[
                    i
                  ]
                    ?.total_contracted_mmscfd &&
                    String(
                      release_capacity_submission_detail[
                        i
                      ]
                        ?.total_contracted_mmscfd
                    )) ||
                  null,
                total_release_mmscfd:
                  (release_capacity_submission_detail[
                    i
                  ]
                    ?.total_release_mmscfd &&
                    String(
                      release_capacity_submission_detail[
                        i
                      ]
                        ?.total_release_mmscfd
                    )) ||
                  null,
                release_start_date:
                  release_capacity_submission_detail[
                    i
                  ]
                    ?.temp_start_date ||
                  null,
                release_end_date:
                  release_capacity_submission_detail[
                    i
                  ]
                    ?.temp_end_date ||
                  null,
                create_date:
                  dateCre.toDate(),
                create_by:
                  Number(
                    userId
                  ),
                create_date_num:
                  getTodayNowAdd7().unix()
                // create_by_account: {
                //   connect: {
                //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                //   },
                // },
              })
            }
            // release_summary_detail
            // release_capacity_submission_detail[i]?.total_release_mmbtu_d
            // release_capacity_submission_detail[i]?.total_release_mmscfd
            await prisma.release_summary_detail.createMany(
              {
                data: dataArr
              }
            )

            const releaseDa =
              await prisma.release_capacity_submission.findFirst(
                {
                  where: {
                    id: Number(
                      id
                    )
                  },
                  include: {
                    release_capacity_submission_detail:
                      {
                        include:
                          {
                            path_management_config: true
                          }
                      }
                  }
                }
              )

            releaseDa[
              'release_capacity_submission_detail'
            ] = releaseDa[
              'release_capacity_submission_detail'
            ]?.map(
              (e: any) => {
                e[
                  'path_management_config_temp'
                ] =
                  JSON.parse(
                    e[
                      'path_management_config_temp'
                    ]
                  )
                e[
                  'path_management_config'
                ]['temps'] =
                  JSON.parse(
                    e[
                      'path_management_config'
                    ]['temps']
                  )
                return e
              }
            )
            // ..........

            // return null

            const strl =
              await this.stampRelease(
                releaseDa?.release_capacity_submission_detail?.map(
                  (ns: any) =>
                    ns[
                      'path_management_config_temp'
                    ]
                ) || [],
                releaseDa?.contract_code_id,
                prisma
              )

            // return null

            await prisma.release_capacity_submission.updateMany(
              {
                where: {
                  id: Number(
                    id ?? -1
                  )
                },
                data: {
                  release_capacity_status_id:
                    Number(
                      strl
                    ),
                  update_date:
                    getTodayNowAdd7().toDate(),
                  update_by:
                    Number(
                      userId
                    ),
                  update_date_num:
                    getTodayNowAdd7().unix()
                }
              }
            )
            if (strl === 1) {
              throw new HttpException(
                {
                  status:
                    HttpStatus.BAD_REQUEST,
                  error:
                    'Release Value Alert: The Release value must not exceed the Contract value.'
                },
                HttpStatus.BAD_REQUEST
              )
            }

            return await prisma.release_capacity_submission.findFirst(
              {
                where: {
                  id: Number(
                    id
                  )
                }
              }
            )
          },
          {
            timeout: 600000, // เพิ่มเป็น 1 นาที
            maxWait: 600000 // รอให้ transaction พร้อม
          }
        )
      // -----
    } else if (status === 3) {
      await this.prisma.release_capacity_submission.updateMany(
        {
          where: {
            id: Number(
              id ?? -1
            )
          },
          data: {
            release_capacity_status_id:
              Number(status),
            update_date:
              getTodayNowAdd7().toDate(),
            update_by:
              Number(userId),
            update_date_num:
              getTodayNowAdd7().unix()
          }
        }
      )
    }

    const statusData =
      await this.prisma.release_capacity_active.create(
        {
          data: {
            reasons: reasons,
            release_capacity_submission_id:
              Number(id),
            release_capacity_status_id:
              status,
            create_by:
              Number(userId),
            create_date:
              getTodayNowAdd7().toDate(),
            create_date_num:
              getTodayNowAdd7().unix()
            // create_by_account: {
            //   connect: {
            //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            //   },
            // },
          }
        }
      )

    return statusData
  }

  pickByDate(
    arr: any,
    dateStr: any /* 'DD/MM/YYYY' */
  ) {
    const target = dayjs(
      dateStr,
      'DD/MM/YYYY',
      true
    ).startOf('day')
    if (!target.isValid())
      throw new Error(
        'Invalid date'
      )

    let best = null
    let bestTs = -Infinity
    const targetTs =
      target.valueOf()

    for (const item of arr) {
      if (!item?.start_date)
        continue
      const s = dayjs(
        item.start_date
      ).startOf('day')
      if (!s.isValid())
        continue

      const ts = s.valueOf()

      // เจอวันตรงกัน เป๊ะ ก็จบเลย
      if (ts === targetTs)
        return item

      // เก็บตัวที่ไม่เกินวันเป้า และ "ล่าสุด" (ค่า ts มากที่สุดแต่ < เป้า)
      if (
        ts < targetTs &&
        ts > bestTs
      ) {
        bestTs = ts
        best = item
      }
    }
    return best // อาจเป็น null ถ้าไม่มีตัวที่ <= วันเป้า
  }

  getMinMaxDates<
    T extends {date: string}
  >(
    rows: T[],
    fmt = 'DD/MM/YYYY'
  ) {
    let minD: dayjs.Dayjs | null =
      null
    let maxD: dayjs.Dayjs | null =
      null
    let minIdx = -1
    let maxIdx = -1

    rows.forEach((row, i) => {
      const d = dayjs(
        row.date,
        fmt,
        true
      )
      if (!d.isValid()) return // ข้ามถ้าวันผิดรูปแบบ
      if (
        minD === null ||
        d.isBefore(minD)
      ) {
        minD = d
        minIdx = i
      }
      if (
        maxD === null ||
        d.isAfter(maxD)
      ) {
        maxD = d
        maxIdx = i
      }
    })

    return {
      min: minD
        ? minD.format(fmt)
        : null,
      max: maxD
        ? maxD.format(fmt)
        : null
    }
  }

  async stampRelease(
    data: any,
    contract_code_id: any,
    prisma?: Omit<
      PrismaClient<
        Prisma.PrismaClientOptions,
        Prisma.LogLevel,
        DefaultArgs
      >,
      | '$connect'
      | '$disconnect'
      | '$on'
      | '$transaction'
      | '$use'
      | '$extends'
    >
  ) {
    const capaDetail = await (
      prisma ?? this.prisma
    ).capacity_detail.findFirst(
      {
        where: {
          contract_code_id:
            Number(
              contract_code_id
            ),
          flag_use: true
        },
        include: {
          capacity_detail_point:
            {
              select: {
                path_temp: true,
                area: true,
                id: true,
                path_temp_json: true,
                capacity_detail_point_date:
                  {
                    include: {
                      area: {
                        select:
                          {
                            id: true,
                            name: true
                          }
                      }
                    }
                  }
              }
            }
        },
        orderBy: {id: 'desc'}
      }
    )

    const pathManagementArr =
      await this.prisma.path_management.findMany(
        {
          where: {},
          include: {
            path_management_config:
              {
                include: {
                  config_master_path:
                    {
                      include:
                        {
                          revised_capacity_path:
                            {
                              include:
                                {
                                  area: true
                                }
                            },
                          revised_capacity_path_edges: true
                        }
                    }
                },
                where: {
                  flag_use: true
                }
              }
          },
          orderBy: {
            start_date: 'asc'
          }
        }
      )

    const npathManagementArr =
      pathManagementArr?.map(
        (p: any) => {
          const {
            path_management_config,
            ...nP
          } = p
          const npath_management_config =
            path_management_config.map(
              (e: any) => {
                return {
                  ...e,
                  temps:
                    JSON.parse(
                      e[
                        'temps'
                      ]
                    )
                }
              }
            )
          const npathConfig =
            npath_management_config.map(
              (e: any) => {
                const findId =
                  e?.temps?.revised_capacity_path?.find(
                    (
                      f: any
                    ) => {
                      return (
                        f
                          ?.area
                          ?.entry_exit_id ===
                        1
                      )
                    }
                  )

                const findExit =
                  e?.temps?.revised_capacity_path?.map(
                    (
                      tp: any
                    ) => {
                      return {
                        ...tp,
                        source_id:
                          e?.temps?.revised_capacity_path_edges?.find(
                            (
                              f: any
                            ) =>
                              f?.target_id ===
                              tp
                                ?.area
                                ?.id
                          )
                            ?.source_id ||
                          null
                      }
                    }
                  )
                return {
                  ...e,
                  entryId:
                    findId
                      ?.area
                      ?.id,
                  entryName:
                    findId
                      ?.area
                      ?.name,
                  findExit
                }
              }
            )

          return {
            ...nP,
            path_management_config:
              npath_management_config,
            pathConfig:
              npathConfig ||
              []
          }
        }
      )

    const pathIdMaster =
      await this.prisma.path_management_config.findMany(
        {
          where: {},
          select: {
            id: true,
            exit_name_temp: true,
            exit_id_temp: true
          }
        }
      )

    const fPub =
      capaDetail?.capacity_detail_point?.find(
        (f: any) =>
          f
            ?.capacity_detail_point_date
            .length > 0
      )
    const capacity_detail_point_date =
      fPub?.capacity_detail_point_date ||
      []
    const path_temp_json: any =
      fPub?.path_temp_json ||
      []

    function genDateRangeDDMMYYYY(
      startStr: string,
      endStr: string
    ): string[] {
      const fmt = 'DD/MM/YYYY'
      const start = dayjs(
        startStr,
        fmt,
        true
      )
      const end = dayjs(
        endStr,
        fmt,
        true
      )

      if (
        !start.isValid() ||
        !end.isValid()
      )
        return []
      const out: string[] = []
      for (
        let d = start;
        d.isSameOrBefore(
          end,
          'day'
        );
        d = d.add(1, 'day')
      ) {
        out.push(
          d.format(fmt)
        )
      }
      return out
    }
    const nCapacityPointDate =
      capacity_detail_point_date?.map(
        (e: any) => {
          return {
            ...e,
            dateFormate:
              dayjs(
                e?.date
              ).format(
                'DD/MM/YYYY'
              )
          }
        }
      )

    let nDateArr = []
    for (
      let i = 0;
      i < data.length;
      i++
    ) {
      const dates =
        genDateRangeDDMMYYYY(
          data[i]
            ?.temp_start_date,
          data[i]
            ?.temp_end_date
        )

      let nDates =
        dates?.flatMap(
          (e: any) => {
            let dataA = []
            if (
              data[i]
                ?.entry_exit_id ===
              1
            ) {
              const nCapacityPointDateFind =
                nCapacityPointDate?.find(
                  (
                    f: any
                  ) => {
                    return (
                      f?.dateFormate ===
                        e &&
                      f?.area
                        ?.name ===
                        data[
                          i
                        ]
                          ?.temp_area
                    )
                  }
                )
              dataA.push({
                contract_code_id:
                  contract_code_id,
                date: e,
                entry_exit_id:
                  data[i]
                    ?.entry_exit_id,
                temp_zone:
                  data[i]
                    ?.temp_zone,
                temp_area:
                  data[i]
                    ?.temp_area,
                temp_contract_point:
                  data[i]
                    ?.temp_contract_point,
                booking_row_json_id:
                  data[i]
                    ?.booking_row_json_id,
                total_release_mmbtu_d:
                  data[i]
                    ?.total_release_mmbtu_d ||
                  null,
                total_release_mmscfd:
                  data[i]
                    ?.total_release_mmscfd ||
                  null,
                capacityPointDate:
                  nCapacityPointDateFind ||
                  null
              })
            } else {
              const exitMainA =
                pathIdMaster?.filter(
                  (
                    f: any
                  ) => {
                    return (
                      f?.exit_name_temp ===
                        data[
                          i
                        ]
                          ?.temp_area &&
                      path_temp_json
                        ?.map(
                          (
                            pj: any
                          ) =>
                            pj
                              ?.pathConfig
                              ?.path_id
                        )
                        ?.includes(
                          f?.id
                        )
                    )
                  }
                )

              for (
                let ix = 0;
                ix <
                exitMainA.length;
                ix++
              ) {
                const areaPathA =
                  path_temp_json?.filter(
                    (
                      f: any
                    ) =>
                      f
                        ?.pathConfig
                        ?.path_id ===
                      exitMainA[
                        ix
                      ]?.id
                  ) || []
                for (
                  let ip = 0;
                  ip <
                  areaPathA.length;
                  ip++
                ) {
                  let arrArea =
                    []
                  arrArea.push(
                    areaPathA[
                      ip
                    ]?.pathConfig?.findExit?.find(
                      (
                        f: any
                      ) =>
                        f?.source_id ===
                        null
                    )
                  )
                  for (
                    let ix = 0;
                    ix <
                    areaPathA[
                      ip
                    ]
                      ?.pathConfig
                      ?.findExit
                      ?.length;
                    ix++
                  ) {
                    const find =
                      areaPathA[
                        ip
                      ]?.pathConfig?.findExit?.find(
                        (
                          f: any
                        ) =>
                          f?.source_id ===
                          arrArea?.[
                            arrArea?.length -
                              1
                          ]
                            ?.area
                            ?.id
                      )
                    if (
                      find
                    ) {
                      arrArea.push(
                        find
                      )
                    }
                  }

                  const areaArrExit =
                    (
                      arrArea ||
                      []
                    )?.filter(
                      (
                        f: any
                      ) =>
                        f?.source_id !==
                        null
                    )
                  const nAreaExit =
                    areaArrExit?.map(
                      (
                        aE: any
                      ) => {
                        return {
                          path_id:
                            exitMainA[
                              ix
                            ]
                              ?.id,
                          area_name:
                            aE
                              ?.area
                              ?.name,
                          area_id:
                            aE
                              ?.area
                              ?.id
                        }
                      }
                    )
                  let dataA0 =
                    nAreaExit?.map(
                      (
                        nAe: any
                      ) => {
                        const nCapacityPointDateFind =
                          nCapacityPointDate?.find(
                            (
                              f: any
                            ) => {
                              return (
                                f?.dateFormate ===
                                  e &&
                                f?.area_id ===
                                  nAe?.area_id &&
                                f?.path_id ===
                                  nAe?.path_id
                              )
                            }
                          )

                        return {
                          ...nAe,
                          contract_code_id:
                            contract_code_id,
                          date: e,
                          entry_exit_id: 2,
                          temp_zone:
                            data[
                              i
                            ]
                              ?.temp_zone,
                          temp_area:
                            data[
                              i
                            ]
                              ?.temp_area,
                          temp_contract_point:
                            data[
                              i
                            ]
                              ?.temp_contract_point,
                          booking_row_json_id:
                            data[
                              i
                            ]
                              ?.booking_row_json_id,
                          total_release_mmbtu_d:
                            data[
                              i
                            ]
                              ?.total_release_mmbtu_d ||
                            null,
                          total_release_mmscfd:
                            data[
                              i
                            ]
                              ?.total_release_mmscfd ||
                            null,
                          capacityPointDate:
                            nCapacityPointDateFind ||
                            null
                        }
                      }
                    )

                  dataA = [
                    ...dataA,
                    ...dataA0?.filter(
                      (
                        f: any
                      ) =>
                        f?.capacityPointDate !==
                        null
                    )
                  ]
                }
              }
            }

            return [...dataA]
          }
        )
      nDateArr = [
        ...nDateArr,
        ...nDates
      ]
    }
    // เอาไปลง path detail ได้ release total_release_mmbtu_d
    const usePathDetail =
      nDateArr?.map(
        (pDetail: any) => {
          return {
            id: pDetail
              ?.capacityPointDate
              ?.id,
            release_old:
              (pDetail
                ?.capacityPointDate
                ?.release &&
                Number(
                  pDetail
                    ?.capacityPointDate
                    ?.release
                )) ||
              null,
            release:
              pDetail?.total_release_mmbtu_d // total_release_mmscfd
          }
        }
      )
    const groupedId = {}
    for (const curr of usePathDetail) {
      const key = `${curr.id}`

      if (!groupedId[key]) {
        groupedId[key] = {
          id: curr.id,
          release_old:
            curr.release_old,
          data: []
        }
      }

      groupedId[
        key
      ].data.push({...curr})
    }
    const resultGroupId: any =
      Object.values(groupedId)

    const nresultGroupId =
      resultGroupId?.map(
        (iGp: any) => {
          const sumNew =
            Math.max(
              ...iGp?.data
                ?.filter(
                  (f: any) =>
                    f?.release !==
                    null
                )
                ?.map(
                  (tt: any) =>
                    tt?.release
                )
            )
          const calcSumRelease =
            iGp?.release_old !==
            null
              ? Number(
                  iGp?.release_old
                ) +
                Number(sumNew)
              : Number(sumNew)
          return {
            id: iGp?.id,
            release:
              calcSumRelease // total_release_mmscfd
          }
        }
      )
    for (
      let iPd = 0;
      iPd <
      nresultGroupId.length;
      iPd++
    ) {
      if (
        nresultGroupId[iPd]
          ?.release
      ) {
        await this.prisma.capacity_detail_point_date.updateMany(
          {
            where: {
              id: Number(
                nresultGroupId[
                  iPd
                ]?.id ?? -1
              )
            },
            data: {
              release:
                (nresultGroupId[
                  iPd
                ]?.release &&
                  String(
                    nresultGroupId[
                      iPd
                    ]?.release
                  )) ||
                null
            }
          }
        )
      }
    }

    // ทำดาต้าไปลง capa publica จัดกลุ่ม area แล้ว เอาค่าไปลง
    const groupedPubArea = {}
    for (const curr of nDateArr) {
      const key = `${curr.capacityPointDate?.area?.id}`

      if (
        !groupedPubArea[key]
      ) {
        groupedPubArea[key] =
          {
            id_area:
              curr
                .capacityPointDate
                ?.area?.id,
            area: curr
              .capacityPointDate
              ?.area?.name,
            data: []
          }
      }

      groupedPubArea[
        key
      ].data.push({...curr})
    }
    const resultGroupPubArea: any =
      Object.values(
        groupedPubArea
      )
    const nresultGroupPubArea =
      resultGroupPubArea?.map(
        (nG: any) => {
          const {
            area,
            id_area,
            data: dataN,
            ...nnG
          } = nG
          const groupedPubAreaDate =
            {}
          for (const curr of dataN) {
            const key = `${curr.date}`

            if (
              !groupedPubAreaDate[
                key
              ]
            ) {
              groupedPubAreaDate[
                key
              ] = {
                date: curr.date,
                data: []
              }
            }

            groupedPubAreaDate[
              key
            ].data.push({
              ...curr
            })
          }
          const resultGroupPubAreaDate: any =
            Object.values(
              groupedPubAreaDate
            )
          const nresultGroupPubAreaDate =
            (
              resultGroupPubAreaDate ||
              []
            )?.map(
              (ad: any) => {
                const {
                  date,
                  data: dataDate,
                  ...nAd
                } = ad

                const val =
                  Math.max(
                    ...dataDate?.map(
                      (
                        tt: any
                      ) =>
                        tt?.total_release_mmbtu_d
                    )
                  )
                return {
                  date: date,
                  val: val
                }
              }
            )

          return {
            area: area,
            id_area: id_area,
            date:
              nresultGroupPubAreaDate ||
              []
          }
        }
      )
    const areaArId =
      nresultGroupPubArea?.map(
        (ar: any) =>
          ar?.id_area
      )
    const fUsePub =
      nresultGroupPubArea?.flatMap(
        (fm: any) => {
          const fDate =
            fm?.date?.map(
              (fmd: any) => {
                return {
                  area: fm?.area,
                  id_area:
                    fm?.id_area,
                  ...fmd
                }
              }
            )
          return [...fDate]
        }
      )

    const {min, max} =
      this.getMinMaxDates(
        fUsePub
      )

    const capaPublich =
      await (
        prisma ?? this.prisma
      ).capacity_publication_date.findMany(
        {
          where: {
            capacity_publication:
              {
                area: {
                  id: {
                    in: areaArId
                  }
                }
              },
            date_day: {
              lte: dayjs(
                max,
                'DD/MM/YYYY'
              ).toDate(),
              gte: dayjs(
                min,
                'DD/MM/YYYY'
              ).toDate()
            }
          },
          include: {
            capacity_publication:
              {
                include: {
                  area: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    const ncapaPublich =
      capaPublich
        ?.map((nc: any) => {
          const fcapacity_publication =
            fUsePub?.find(
              (f: any) => {
                return (
                  f?.id_area ===
                    nc
                      ?.capacity_publication
                      ?.area_id &&
                  f?.date ===
                    dayjs(
                      nc?.date_day
                    ).format(
                      'DD/MM/YYYY'
                    )
                )
              }
            )
          return {
            id: nc?.id,
            old_value:
              nc?.value,
            old_value_adjust:
              nc?.value_adjust,
            old_value_adjust_use:
              nc?.value_adjust_use,
            value:
              parseToNumber(
                nc?.value
              )
                ? String(
                    parseToNumber(
                      nc?.value
                    ) +
                      (fcapacity_publication?.val ||
                        0)
                  )
                : String(
                    0 +
                      (fcapacity_publication?.val ||
                        0)
                  ),
            value_adjust_use:
              parseToNumber(
                nc?.value_adjust_use
              )
                ? String(
                    (parseToNumber(
                      nc?.value_adjust_use
                    ) || 0) +
                      parseToNumber(
                        fcapacity_publication?.val ||
                          0
                      )
                  )
                : String(
                    ((nc?.value &&
                      parseToNumber(
                        nc?.value
                      )) ||
                      0) +
                      (fcapacity_publication?.val ||
                        0)
                  ),
            fcapacity_publication:
              fcapacity_publication ||
              null
          }
        })
        ?.filter(
          (f: any) =>
            f?.fcapacity_publication !==
            null
        )

    for (
      let iPd = 0;
      iPd <
      ncapaPublich.length;
      iPd++
    ) {
      await this.prisma.capacity_publication_date.updateMany(
        {
          where: {
            id: Number(
              ncapaPublich[
                iPd
              ]?.id ?? -1
            )
          },
          data: {
            value:
              (ncapaPublich[
                iPd
              ]?.value &&
                String(
                  ncapaPublich[
                    iPd
                  ]?.value
                )) ||
              null,
            value_adjust_use:
              (ncapaPublich[
                iPd
              ]
                ?.value_adjust_use &&
                parseToNumber(
                  ncapaPublich[
                    iPd
                  ]
                    ?.value_adjust_use
                ) &&
                String(
                  ncapaPublich[
                    iPd
                  ]
                    ?.value_adjust_use
                )) ||
              null
          }
        }
      )
    }

    // ret 1 เกิน 2 ไม่เกิน

    return 2
  }

  async submission(
    payload: any,
    userId: any
  ) {
    const {
      contract_code_id,
      group_id,
      data,
      url
    } = payload
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
    if (
      group?.user_type_id ===
      3
    ) {
      // shipper
      const submiss =
        await this.createSubmission(
          contract_code_id,
          group_id,
          data,
          userId,
          1
        )
      url !== null &&
        url.length > 0 &&
        (await this.submissionFileCreate(
          {
            id: submiss?.id,
            url: url
          },
          userId
        ))
      await this.changeStatus(
        1,
        submiss?.id,
        userId
      )
      // submissionFileCreate
      return submiss
    } else if (
      group?.user_type_id ===
      2
    ) {
      // tso approved
      const submiss =
        await this.createSubmission(
          contract_code_id,
          group_id,
          data,
          userId,
          2
        )
      url !== null &&
        url.length > 0 &&
        (await this.submissionFileCreate(
          {
            id: submiss?.id,
            url: url
          },
          userId
        ))
      await this.changeStatus(
        2,
        submiss?.id,
        userId
      )
      return submiss
    } else {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'มี user_type not condition.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  // ....
  async submissionV2(
    payload: any,
    userId: any
  ) {
    const {
      contract_code_id,
      group_id,
      data,
      url
    } = payload
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

    // return null
    if (
      group?.user_type_id ===
        3 ||
      group?.user_type_id ===
        1
    ) {
      // shipper
      const submiss =
        await this.createSubmission(
          contract_code_id,
          group_id,
          data,
          userId,
          1
        )
      url !== null &&
        url.length > 0 &&
        (await this.submissionFileCreate(
          {
            id: submiss?.id,
            url: url
          },
          userId
        ))
      await this.changeStatus(
        {
          status: 1,
          reasons: null
        },
        submiss?.id,
        userId
      )
      return submiss
    } else if (
      group?.user_type_id ===
      2
    ) {
      // tso approved
      const submiss =
        await this.createSubmission(
          contract_code_id,
          group_id,
          data,
          userId,
          2
        )
      url !== null &&
        url.length > 0 &&
        (await this.submissionFileCreate(
          {
            id: submiss?.id,
            url: url
          },
          userId
        ))
      await this.changeStatus(
        {
          status: 2,
          reasons: null
        },
        submiss?.id,
        userId
      )

      return submiss
    } else {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'มี user_type not condition.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  async documentFile(
    id: any
  ) {
    const resData =
      await this.prisma.release_capacity_submission_file_document.findMany(
        {
          where: {
            active: true,
            contract_code_id:
              Number(id)
          },
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
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    return resData
  }

  async documentFileCreate(
    payload: any,
    userId: any
  ) {
    const {
      contract_code_id,
      url
    } = payload
    const resData =
      await this.prisma.release_capacity_submission_file_document.create(
        {
          data: {
            contract_code: {
              connect: {
                id: Number(
                  contract_code_id
                )
              }
            },
            active: true,
            // contract_code_id: Number(contract_code_id),
            url: url,
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

    return resData
  }

  async documentFileInactive(
    payload: any,
    userId: any
  ) {
    const {id} = payload
    const resData =
      await this.prisma.release_capacity_submission_file_document.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            active: null,
            update_date:
              getTodayNowAdd7().toDate(),
            update_date_num:
              getTodayNowAdd7().unix(),
            update_by_account:
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

    return resData
  }

  async getApprovedReleaseCapacitySubmissionDetail(
    contract_code_id: any
  ) {
    try {
      // Validate and convert contract_code_id to number
      const contractId =
        parseInt(
          contract_code_id
        )
      if (isNaN(contractId)) {
        return []
      }

      const resData =
        await this.prisma.release_capacity_submission_detail.findMany(
          {
            where: {
              release_capacity_submission:
                {
                  contract_code_id:
                    contractId,
                  release_capacity_status_id: 2
                }
            }
          }
        )
      return resData
    } catch (error) {
      return []
    }
  }
}
