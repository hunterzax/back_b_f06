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
// import * as XlsxPopulate from 'xlsx-populate';
import * as fs from 'fs'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {
  getTodayEndAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import {parseToNumber} from 'src/common/utils/number.util'
import {isMatch} from 'src/common/utils/allocation.util'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)

@Injectable()
export class MinimumInventorySummaryService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  // "" + 0 => 0
  // "" + "" => ""
  // เลข + เลข => บวกปกติ
  sumKeepEmpty(
    a: any,
    b: any
  ) {
    const isEmptyA = a === ''
    const isEmptyB = (b === '' || b === null)

    if (isEmptyA && isEmptyB)
      return ''
    if (isEmptyA)
      return Number(b || 0)
    if (isEmptyB)
      return Number(a || 0)

    return (
      Number(a) + Number(b)
    )
  }
  // ...
  async findAll(
    payload: any,
    userId: any
  ) {
    const {gas_day} = payload
    const daysOfWeek = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday'
    ]
    // const todayStart =
    //   getTodayStartAdd7().toDate()
    // const todayEnd =
    //   getTodayEndAdd7().toDate()

    const targetDate =
      dayjs(gas_day).startOf(
        'day'
      )
    const nextDate =
      targetDate.add(1, 'day')

    // Calculate previous Sunday for weekly nominations
    const previousSunday =
      targetDate
        .subtract(
          targetDate.day(),
          'day'
        )
        .startOf('day')
    const nextSunday =
      previousSunday.add(
        1,
        'week'
      )

    const nomination_ =
      await this.prisma.query_shipper_nomination_file.findMany(
        {
          where: {
            // NOT: {
            //   contract_code_id:
            //     null
            // }, // revers bal ไม่แสดง effect
            // nomination_type_id: 1,
            query_shipper_nomination_status:
              {
                // id: { in: [2, 5] },
                id: {
                  in: [
                    1, 2, 5
                  ]
                } // https://app.clickup.com/t/86eu09bd5
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
                  // For weekly nominations (type_id = 2), check both current and previous Sunday
                  {
                    AND: [
                      {
                        nomination_type_id: 2
                      },
                      {
                        gas_day:
                          {
                            gte: previousSunday.toDate(),
                            lt: nextSunday.toDate()
                          }
                      },
                      {
                        OR: [
                          {
                            reserve_balancing_gas_contract_id: { not: null }
                          },
                      {
                        contract_code: {
                          contract_start_date: { lt: nextSunday.toDate() }, // Started before or on target date
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
                                { terminate_date: null }, // No terminate date
                                { terminate_date: { gt: targetDate.toDate() } } // Terminate date is after target date
                              ],
                            },
                            // Use extend_deadline if available, otherwise use contract_end_date
                            {
                              OR: [
                                // If extend_deadline exists, use it as end date
                                {
                                  AND: [
                                    { extend_deadline: { not: null } },
                                    { extend_deadline: { gt: targetDate.toDate() } },
                                  ],
                                },
                                // If extend_deadline is null, use contract_end_date
                                {
                                  AND: [
                                    { extend_deadline: null },
                                    {
                                      OR: [
                                        { contract_end_date: null },
                                        { contract_end_date: { gt: targetDate.toDate() } },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        }
                      }
                        ]
                      }
                    ]
                  },
                  // For daily nominations (type_id = 1), check the requested date
                  {
                    AND: [
                      {
                        nomination_type_id: 1
                      },
                      {
                        gas_day:
                          {
                            gte: targetDate.toDate(),
                            lt: nextDate.toDate()
                          }
                      }
                    ]
                  }
                ]
              }
            ]
            // gas_day: {
            //   gte: targetDate.toDate(),
            //   lt: nextDate.toDate(),
            // },
          },
          include: {
            group: {
              select: {
                id: true,
                id_name: true,
                name: true
              }
            },
            contract_code: {
              select: {
                id: true,
                contract_code: true,
                contract_start_date: true,
                contract_end_date: true
              }
            },
            reserve_balancing_gas_contract:
              {
                select: {
                  id: true,
                  res_bal_gas_contract: true
                }
              },
            nomination_type: true,
            nomination_version:
              {
                where: {
                  flag_use: true
                },
                include: {
                  nomination_full_json: true,
                  // nomination_full_json_sheet2:true,
                  nomination_row_json: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

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
    let nomination = []
    if (
      userId &&
      userType?.id === 3
    ) {
      const group_ =
        await this.prisma.group.findFirst(
          {
            where: {
              user_type_id:
                userType?.id,
              account_manage:
                {
                  some: {
                    account_id:
                      Number(
                        userId
                      )
                  }
                }
            },
            select: {
              id: true,
              name: true,
              id_name: true
            }
          }
        )
      nomination =
        nomination_?.filter(
          (f: any) =>
            f?.group_id ===
            group_?.id
        )
    } else {
      nomination = nomination_
    }

    // userId

    const zoneData =
      await this.prisma.zone.findMany(
        {
          where: {
            AND: [
              {
                start_date: {
                  lt: nextDate.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
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
                        gt: targetDate.toDate()
                      }
                  } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          },
          include: {
            zone_master_quality: true
          }
        }
      )

    const newData =
      nomination.flatMap(
        (e: any) => {
          const gas_day =
            dayjs(
              e?.gas_day
            ).format(
              'DD/MM/YYYY'
            )
          const rowJson = e[
            'nomination_version'
          ][0]?.[
            'nomination_row_json'
          ].map((nJ: any) => {
            nJ['data_temp'] =
              JSON.parse(
                nJ[
                  'data_temp'
                ]
              )
            return {...nJ}
          })
          // Min_Inventory_Change
          // Exchange_Mininventory Exchange_Min_Inventory
          const MinInventoryChange =
            rowJson.filter(
              (f: any) => {
                return (
                  f
                    ?.data_temp[
                    '5'
                  ] ===
                  'Min_Inventory_Change'
                )
              }
            )
          const ExchangeMininventory =
            rowJson.filter(
              (f: any) => {
                return (
                  isMatch(
                    f
                      ?.data_temp[
                      '5'
                    ],
                    'Exchange_Mininventory'
                  ) ||
                  isMatch(
                    f
                      ?.data_temp[
                      '5'
                    ],
                    'Exchange_Min_Inventory'
                  )
                )
              }
            )

          const {
            nomination_version,
            ...nE
          } = e
          const {
            nomination_full_json,
            nomination_row_json,
            ...nNomination_version
          } =
            nomination_version[0]

          let MinInventoryChangeUse =
            []
          let ExchangeMininventoryUse =
            []

          if (
            e && e?.nomination_type
              ?.id === 1
          ) {
            MinInventoryChangeUse =
              MinInventoryChange.map(
                (p: any) => {
                  const query_shipper_nomination_file_id =
                    e?.id
                  const nomination_code =
                    e?.nomination_code
                  const group =
                    e?.group
                  const contract_code =
                    e?.contract_code
                  const reserve_balancing_gas_contract =
                    e?.reserve_balancing_gas_contract
                  const nomination_type =
                    e?.nomination_type
                  const version =
                    nNomination_version
                  const zone =
                    p[
                      'data_temp'
                    ]['0']
                  let value =
                    p[
                      'data_temp'
                    ]['38'] ||
                    null
                  value =
                    value
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  if(!value && value != 0){
                    return;
                  }
                  // Check if value is wrapped in parentheses and convert to negative
                  if (
                    value &&
                    value.startsWith(
                      '('
                    ) &&
                    value.endsWith(
                      ')'
                    )
                  ) {
                    value =
                      '-' +
                      value.slice(
                        1,
                        -1
                      ) // Remove parentheses and add negative sign
                  }
                  const nomination_row_json_id =
                    p && p?.id || -1

                  const nomType =
                    'daily'

                  return {
                    nomination_row_json_id,
                    nomination_code,
                    gas_day,
                    gas_day_main:
                      gas_day,
                    zone,
                    query_shipper_nomination_file_id,
                    group,
                    contract_code,
                    reserve_balancing_gas_contract,
                    nomination_type,
                    version,
                    nomination_row_json:
                      p,
                    type: 'Min_Inventory_Change',
                    value: parseToNumber(value) || '',
                    nomType
                  }
                }
              )

            ExchangeMininventoryUse =
              ExchangeMininventory.map(
                (p: any) => {
                  const query_shipper_nomination_file_id =
                    e?.id
                  const nomination_code =
                    e?.nomination_code
                  const group =
                    e?.group
                  const contract_code =
                    e?.contract_code
                  const reserve_balancing_gas_contract =
                    e?.reserve_balancing_gas_contract
                  const nomination_type =
                    e?.nomination_type
                  const version =
                    nNomination_version
                  const zone =
                    p[
                      'data_temp'
                    ]['0']
                  // const value = parseToNumber(p['data_temp']['38']);
                  let value =
                    p[
                      'data_temp'
                    ]['38'] ||
                    null
                  value =
                    value
                      ?.trim()
                      ?.replace(
                        /,/g,
                        ''
                      )
                  if(!value && value != 0){
                    return;
                  }
                  // Check if value is wrapped in parentheses and convert to negative
                  if (
                    value &&
                    value.startsWith(
                      '('
                    ) &&
                    value.endsWith(
                      ')'
                    )
                  ) {
                    value =
                      '-' +
                      value.slice(
                        1,
                        -1
                      ) // Remove parentheses and add negative sign
                  }
                  const nomination_row_json_id =
                    p && p?.id || -1

                  const nomType =
                    'daily'

                  return {
                    nomination_row_json_id,
                    nomination_code,
                    gas_day,
                    gas_day_main:
                      gas_day,
                    zone,
                    query_shipper_nomination_file_id,
                    group,
                    contract_code,
                    reserve_balancing_gas_contract,
                    nomination_type,
                    version,
                    nomination_row_json:
                      p,
                    type: 'Exchange_Min_Inventory',
                    value: parseToNumber(value) || '',
                    nomType
                  }
                }
              )
          } else {
            daysOfWeek.forEach(
              (
                day,
                index
              ) => {
                MinInventoryChange.map(
                  (
                    p: any
                  ) => {
                    const query_shipper_nomination_file_id =
                      e?.id
                    const nomination_code =
                      e?.nomination_code
                    const group =
                      e?.group
                    const contract_code =
                      e?.contract_code
                    const reserve_balancing_gas_contract =
                      e?.reserve_balancing_gas_contract
                    const nomination_type =
                      e?.nomination_type
                    const version =
                      nNomination_version
                    const zone =
                      p[
                        'data_temp'
                      ]['0']
                    let value =
                      p[
                        'data_temp'
                      ][
                        `${14 + index}`
                      ] ||
                      null
                    value =
                      value
                        ?.trim()
                        ?.replace(
                          /,/g,
                          ''
                        )
                    if(!value && value != 0){
                      return;
                    }
                    // Check if value is wrapped in parentheses and convert to negative
                    if (
                      value &&
                      value.startsWith(
                        '('
                      ) &&
                      value.endsWith(
                        ')'
                      )
                    ) {
                      value =
                        '-' +
                        value.slice(
                          1,
                          -1
                        ) // Remove parentheses and add negative sign
                    }
                    const nomination_row_json_id =
                      p && p?.id || -1

                    const nomType =
                      day
                    const startDate =
                      dayjs(
                        gas_day,
                        'DD/MM/YYYY'
                      )

                    MinInventoryChangeUse.push(
                      {
                        nomination_row_json_id,
                        nomination_code,
                        gas_day:
                          startDate
                            .add(
                              index,
                              'day'
                            )
                            .format(
                              'DD/MM/YYYY'
                            ),
                        gas_day_main:
                          gas_day,
                        zone,
                        query_shipper_nomination_file_id,
                        group,
                        contract_code,
                        reserve_balancing_gas_contract,
                        nomination_type,
                        version,
                        nomination_row_json:
                          p,
                        type: 'Min_Inventory_Change',
                        value: parseToNumber(value),
                        nomType
                      }
                    )

                    return {
                      nomination_row_json_id,
                      nomination_code,
                      gas_day:
                        startDate
                          .add(
                            index,
                            'day'
                          )
                          .format(
                            'DD/MM/YYYY'
                          ),
                      zone,
                      query_shipper_nomination_file_id,
                      group,
                      contract_code,
                      reserve_balancing_gas_contract,
                      nomination_type,
                      version,
                      nomination_row_json:
                        p,
                      type: 'Min_Inventory_Change',
                      value: parseToNumber(value) || '',
                      nomType
                    }
                  }
                )

                ExchangeMininventory.map(
                  (
                    p: any
                  ) => {
                    const query_shipper_nomination_file_id =
                      e?.id
                    const nomination_code =
                      e?.nomination_code
                    const group =
                      e?.group
                    const contract_code =
                      e?.contract_code
                    const reserve_balancing_gas_contract =
                      e?.reserve_balancing_gas_contract
                    const nomination_type =
                      e?.nomination_type
                    const version =
                      nNomination_version
                    const zone =
                      p[
                        'data_temp'
                      ]['0']
                    const value =
                      parseToNumber(
                        p[
                          'data_temp'
                        ][
                          `${14 + index}`
                        ]
                      )
                    if(!value && value != 0){
                      return;
                    }
                    const nomination_row_json_id =
                      p && p?.id || -1

                    const nomType =
                      day
                    const startDate =
                      dayjs(
                        gas_day,
                        'DD/MM/YYYY'
                      )

                    ExchangeMininventoryUse.push(
                      {
                        nomination_row_json_id,
                        nomination_code,
                        gas_day:
                          startDate
                            .add(
                              index,
                              'day'
                            )
                            .format(
                              'DD/MM/YYYY'
                            ),
                        gas_day_main:
                          gas_day,
                        zone,
                        query_shipper_nomination_file_id,
                        group,
                        contract_code,
                        reserve_balancing_gas_contract,
                        nomination_type,
                        version,
                        nomination_row_json:
                          p,
                        type: 'Exchange_Min_Inventory',
                        value:
                          value,
                        nomType
                      }
                    )

                    return {
                      nomination_row_json_id,
                      nomination_code,
                      gas_day:
                        startDate
                          .add(
                            index,
                            'day'
                          )
                          .format(
                            'DD/MM/YYYY'
                          ),
                      zone,
                      query_shipper_nomination_file_id,
                      group,
                      contract_code,
                      reserve_balancing_gas_contract,
                      nomination_type,
                      version,
                      nomination_row_json:
                        p,
                      type: 'Exchange_Min_Inventory',
                      value:
                        value,
                      nomType
                    }
                  }
                )
              }
            )
          }

          return [
            ...MinInventoryChangeUse,
            ...ExchangeMininventoryUse
          ]
        }
      )

    // return newData;

    const groupedByZone =
      Object.values(
        newData.reduce(
          (acc, item) => {
            const key =
              item.zone
            if (!acc[key]) {
              acc[key] = {
                zone: key,
                data: []
              }
            }
            acc[
              key
            ].data.push(item)
            return acc
          },
          {}
        )
      )

    const nDelWkeeklyD =
      groupedByZone?.map(
        (e: any) => {
          const {
            data,
            ...nE
          } = e
          let nData = []
          for (
            let iW = 0;
            iW < data.length;
            iW++
          ) {
            if (
              data && data?.[iW] && data?.[iW]
                ?.nomination_type
                ?.id === 1
            ) {
              nData?.push({
                ...data?.[iW]
              })
            } else {
              const find =
                data?.find(
                  (
                    f: any
                  ) => {
                    return (
                      f
                        ?.nomination_type
                        ?.id ===
                        1 &&
                      f?.nomination_code ===
                        data?.[
                          iW
                        ]
                          ?.nomination_code &&
                      f?.gas_day ===
                        data?.[
                          iW
                        ]
                          ?.gas_day &&
                      f?.group
                        ?.name ===
                        data?.[
                          iW
                        ]
                          ?.group
                          ?.name &&
                      (f
                        ?.contract_code
                        ?.contract_code
                        ? f
                            .contract_code
                            .contract_code ===
                          data?.[
                            iW
                          ]
                            ?.contract_code
                            ?.contract_code
                        : f
                            ?.reserve_balancing_gas_contract
                            ?.res_bal_gas_contract ===
                          data?.[
                            iW
                          ]
                            ?.reserve_balancing_gas_contract
                            ?.res_bal_gas_contract)
                    )
                  }
                )
              if (!find) {
                nData?.push({
                  ...data?.[
                    iW
                  ]
                })
              }
            }
          }

          return {
            ...nE,
            data: nData
          }
        }
      )

    const groupNom =
      nDelWkeeklyD.map(
        (e: any) => {
          const {
            data,
            ...eN
          } = e

          const zoneObj =
            zoneData?.find(
              (f: any) => {
                return (
                  f?.name ===
                  eN?.zone
                )
              }
            ) ?? null

          const daily =
            data?.filter(
              (f: any) => {
                return (
                  f
                    ?.nomination_type
                    ?.id === 1
                )
              }
            )
          const weekly =
            data?.filter(
              (f: any) => {
                return (
                  f
                    ?.nomination_type
                    ?.id === 2
                )
              }
            )

          return {
            ...eN,
            zoneObj,
            daily,
            weekly
          }
        }
      )

    const groupCX =
      groupNom?.map(
        (e: any) => {
          const groupedByDaily =
            Object.values(
              e[
                'daily'
              ].reduce(
                (
                  acc,
                  item
                ) => {
                  const key = item && `${item.gas_day}|${item.group?.name}|${item?.contract_code?.contract_code ?? item?.reserve_balancing_gas_contract?.res_bal_gas_contract}` || ""
                  if (
                    !acc[key]
                  ) {
                    acc[key] =
                      {
                        nomination_code:
                          item.nomination_code,
                        gas_day:
                          item.gas_day,
                        gas_day_main:
                          item.gas_day_main,
                        group:
                          item
                            .group
                            ?.name,
                        contract_code:
                          item
                            .contract_code
                            ?.contract_code,
                        reserve_balancing_gas_contract:
                          item
                            .reserve_balancing_gas_contract
                            ?.res_bal_gas_contract,
                        data: []
                      }
                  }
                  // if(item.type === 'Min_Inventory_Change'){
                  //   acc[key].minInven = acc[key].minInven ? acc[key].minInven + item.value : item.value;
                  // }else if(isMatch(item.type, 'Exchange_Mininventory') || isMatch(item.type, 'Exchange_Min_Inventory')){
                  //   acc[key].exchangeMinInven = acc[key].exchangeMinInven ? acc[key].exchangeMinInven + item.value : item.value;
                  // }

                  if (
                    item.type ===
                    'Min_Inventory_Change'
                  ) {
                    acc[
                      key
                    ].minInven =
                      this.sumKeepEmpty(
                        acc[
                          key
                        ]
                          .minInven,
                        item.value
                      )
                  } else if (
                    isMatch(
                      item.type,
                      'Exchange_Min_Inventory'
                    ) ||
                    isMatch(
                      item.type,
                      'Exchange_Mininventory'
                    )
                  ) {
                    acc[
                      key
                    ].exchangeMinInven =
                      this.sumKeepEmpty(
                        acc[
                          key
                        ]
                          .exchangeMinInven,
                        item.value
                      )
                  }

                  acc[
                    key
                  ].data.push(
                    item
                  )
                  return acc
                },
                {}
              )
            )

          const groupedByWeekly =
            Object.values(
              e[
                'weekly'
              ].reduce(
                (
                  acc,
                  item
                ) => {
                  const key = item && `${item.gas_day}|${item.group?.name}|${item?.contract_code?.contract_code ?? item?.reserve_balancing_gas_contract?.res_bal_gas_contract}` || ""
                  if (
                    !acc[key]
                  ) {
                    acc[key] =
                      {
                        nomination_code:
                          item.nomination_code,
                        gas_day:
                          item.gas_day,
                        gas_day_main:
                          item.gas_day_main,
                        group:
                          item
                            .group
                            ?.name,
                        contract_code:
                          item
                            ?.contract_code
                            ?.contract_code,
                        reserve_balancing_gas_contract:
                          item
                            .reserve_balancing_gas_contract
                            ?.res_bal_gas_contract,
                        minInven:
                          '',
                        exchangeMinInven:
                          '',
                        data: []
                      }
                  }

                  const gasDay =
                    dayjs(
                      item.gas_day
                    ).startOf(
                      'day'
                    )
                  const contractStart =
                    dayjs(
                      item
                        ?.contract_code
                        ?.contract_start_date
                    ).startOf(
                      'day'
                    )
                  const contractEnd =
                    dayjs(
                      item
                        ?.contract_code
                        ?.contract_end_date
                    )
                      .subtract(
                        1,
                        'day'
                      )
                      .startOf(
                        'day'
                      )
                  // const inRange = gasDay.isSame(contractStart) || gasDay.isSame(contractEnd) || (gasDay.isAfter(contractStart) && gasDay.isBefore(contractEnd));
                  const inRange = true

                  if (
                    inRange
                  ) {
                    if (
                      item.type ===
                      'Min_Inventory_Change'
                    ) {
                      acc[
                        key
                      ].minInven =
                        this.sumKeepEmpty(
                          acc[
                            key
                          ]
                            .minInven,
                          item.value
                        )
                    } else if (
                      isMatch(
                        item.type,
                        'Exchange_Min_Inventory'
                      ) ||
                      isMatch(
                        item.type,
                        'Exchange_Mininventory'
                      )
                    ) {
                      acc[
                        key
                      ].exchangeMinInven =
                        this.sumKeepEmpty(
                          acc[
                            key
                          ]
                            .exchangeMinInven,
                          item.value
                        )
                    }
                  }
                  acc[
                    key
                  ].data.push(
                    item
                  )
                  return acc
                },
                {}
              )
            )

          const {
            daily,
            weekly,
            ...nE
          } = e

          return {
            ...nE,
            groupedByDaily,
            groupedByWeekly
          }
        }
      )

    const filgroupCX =
      groupCX?.map(
        (e: any) => {
          e[
            'groupedByDaily'
          ] = e[
            'groupedByDaily'
          ]?.filter(
            (f: any) => {
              return (
                f?.gas_day ===
                dayjs(
                  gas_day
                ).format(
                  'DD/MM/YYYY'
                )
              )
            }
          )
          // e["groupedByWeekly"] = e["groupedByWeekly"]?.filter((f:any) => {
          //   return (
          //     f?.gas_day_main === dayjs(gas_day).format("DD/MM/YYYY")
          //   )
          // })
          return {
            ...e
          }
        }
      )

    const groupAll =
      filgroupCX?.map(
        (e: any) => {
          // สร้าง set หรือ map เพื่อใช้ตรวจสอบรายการที่มีอยู่ใน daily
          const dailyKeySet =
            new Set(
              e[
                'groupedByDaily'
              ].map(
                (item) =>
                  `${item.gas_day}|${item.group}|${item.contract_code ?? item.reserve_balancing_gas_contract}`
              )
            )

          // กรอง weekly ให้เหลือเฉพาะที่ไม่อยู่ใน daily
          const notInDaily =
            e[
              'groupedByWeekly'
            ].filter(
              (item) => {
                const key = `${item.gas_day}|${item.group}|${item.contract_code ?? item.reserve_balancing_gas_contract}`
                return !dailyKeySet.has(
                  key
                )
              }
            )

          let groupedByAll = [
            ...e[
              'groupedByDaily'
            ],
            ...notInDaily
          ]

          return {
            ...e,
            groupedByAll
          }
        }
      )

    const filgroupAll =
      groupAll?.map(
        (e: any) => {
          e['groupedByAll'] =
            e[
              'groupedByAll'
            ]?.filter(
              (f: any) => {
                return (
                  f?.gas_day ===
                  dayjs(
                    gas_day
                  ).format(
                    'DD/MM/YYYY'
                  )
                )
              }
            )
          return {
            ...e
          }
        }
      )

    return filgroupAll
  }
}
