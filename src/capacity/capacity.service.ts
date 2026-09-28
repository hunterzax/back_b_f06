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
import {PathManagementService} from 'src/path-management/path-management.service'
import {
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import {uploadFilsTemp} from 'src/common/utils/uploadFileIn'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class CapacityService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  objToArray(obj: any) {
    return Object.keys(
      obj
    ).map((key) => ({
      key: key, // ใช้คีย์เดิม
      value: obj[key] // ค่าเดิมของอ็อบเจ็กต์
    }))
  }

  async capacityRequestManagement() {
    const todayStart =
      getTodayStartAdd7()
    const todayEnd =
      getTodayEndAdd7()
    const resData =
      await this.prisma.contract_code.findMany(
        {
          include: {
            type_account: true,
            term_type: true,
            ref_contract_code_by: true,
            group: true,
            submission_comment_capacity_request_management:
              {
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
              },
            status_capacity_request_management_process: true,
            status_capacity_request_management: true,
            file_capacity_request_management:
              {
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
              },
            extend_contract_capacity_request_management: true,
            book_capacity_request_management:
              {
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
            booking_version: {
              include: {
                booking_version_comment:
                  {
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
                  },
                booking_full_json: true,
                booking_row_json: true,
                booking_full_json_release: true,
                booking_row_json_release: true,
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
                status_capacity_request_management: true,
                type_account: true
              },
              orderBy: {
                id: 'desc'
              }
            }
          },
          orderBy: {
            id: 'desc'
          }
          // where:{
          //       AND: [
          //     {
          //       status_capacity_request_management_id: {
          //         in: [1, 2, 4]
          //       },
          //     },
          //     {
          //       contract_start_date: {
          //         lte: todayEnd.toDate(), // start_date ต้องก่อน
          //       },
          //     },
          //     // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
          //     {
          //       OR: [
          //         { terminate_date: null }, // No terminate date
          //         { terminate_date: { gt: todayStart.toDate() } }, // Terminate date is after target date
          //       ],
          //     },
          //     // Use extend_deadline if available, otherwise use contract_end_date
          //     {
          //       OR: [
          //         // If extend_deadline exists, use it as end date
          //         {
          //           AND: [
          //             { extend_deadline: { not: null } },
          //             { extend_deadline: { gt: todayStart.toDate() } },
          //           ],
          //         },
          //         // If extend_deadline is null, use contract_end_date
          //         {
          //           AND: [
          //             { extend_deadline: null },
          //             {
          //               OR: [
          //                 { contract_end_date: null },
          //                 { contract_end_date: { gt: todayStart.toDate() } },
          //               ],
          //             },
          //           ],
          //         },
          //       ],
          //     },
          //   ]
          // },
        }
      )

    return resData
  }

  async capacityRequestManagementChart() {
    const todayStart =
      getTodayStartAdd7()
    const todayEnd =
      getTodayEndAdd7()
    const resData =
      await this.prisma.contract_code.findMany(
        {
          select: {
           id: true,
           contract_code: true,
           group: true,
           contract_start_date:true,
           contract_end_date:true
          
          },
          orderBy: {
            id: 'desc'
          }
          // where:{
          //       AND: [
          //     {
          //       status_capacity_request_management_id: {
          //         in: [1, 2, 4]
          //       },
          //     },
          //     {
          //       contract_start_date: {
          //         lte: todayEnd.toDate(), // start_date ต้องก่อน
          //       },
          //     },
          //     // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
          //     {
          //       OR: [
          //         { terminate_date: null }, // No terminate date
          //         { terminate_date: { gt: todayStart.toDate() } }, // Terminate date is after target date
          //       ],
          //     },
          //     // Use extend_deadline if available, otherwise use contract_end_date
          //     {
          //       OR: [
          //         // If extend_deadline exists, use it as end date
          //         {
          //           AND: [
          //             { extend_deadline: { not: null } },
          //             { extend_deadline: { gt: todayStart.toDate() } },
          //           ],
          //         },
          //         // If extend_deadline is null, use contract_end_date
          //         {
          //           AND: [
          //             { extend_deadline: null },
          //             {
          //               OR: [
          //                 { contract_end_date: null },
          //                 { contract_end_date: { gt: todayStart.toDate() } },
          //               ],
          //             },
          //           ],
          //         },
          //       ],
          //     },
          //   ]
          // },
        }
      )

    return resData
  }

  termType() {
    return this.prisma.term_type.findMany(
      {
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  typeAccount() {
    return this.prisma.type_account.findMany(
      {
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  statusCapacityRequestManagement() {
    return this.prisma.status_capacity_request_management.findMany(
      {
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  statusCapacityRequestManagementProcess() {
    return this.prisma.status_capacity_request_management_process.findMany(
      {
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  checkDateRange(
    startDate: string,
    endDate: string,
    file_period_mode: number,
    min: number,
    max: number
  ): boolean {
    const starts = startDate
      ? getTodayNowDDMMYYYYAdd7(
          startDate
        )
      : null
    const ends = endDate
      ? getTodayNowDDMMYYYYAdd7(
          endDate
        )
      : null
    let diff

    // คำนวณความแตกต่างตามโหมดที่กำหนด
    if (
      file_period_mode === 1
    ) {
      diff = (ends || dayjs()).diff(
        (starts || dayjs()),
        'day'
      ) // คำนวณต่างกันเป็นจำนวนวัน
    } else if (
      file_period_mode === 2
    ) {
      
      diff = (ends || dayjs())
        .endOf('month')
        .diff(
          (starts || dayjs()).startOf(
            'month'
          ),
          'month'
        ) // นับเดือนจากต้นเดือนถึงสิ้นเดือน
    } else if (
      file_period_mode === 3
    ) {
      diff = (ends || dayjs()).diff(
        starts,
        'year'
      ) // คำนวณต่างกันเป็นจำนวนปี
    } else {
      return false // กรณี mode ไม่ตรงกับเงื่อนไขที่กำหนด
    }

    return (
      diff >= min &&
      diff <= max
    )
  }

  async getGroupByName(
    name: any
  ) {
    return await this.prisma.group.findFirst(
      {
        where: {
          name: name,
          user_type_id: 3
        }
      }
    )
  }

  async getContractPointByName(
    name: any,
    group: any
  ) {
    // group เช็ค กับ shipper อีกที
    return await this.prisma.contract_point.findFirst(
      {
        select: {
          id: true,
          contract_point: true,
          area: {
            select: {
              id: true,
              name: true
            }
          },
          zone: {
            select: {
              id: true,
              name: true
            }
          }
        },
        where: {
          contract_point: name
        }
      }
    )
  }

  generateExpectedDates = (
    start,
    end,
    mode,
    fixday,
    todayday
  ) => {
    const dates = []
    let current = dayjs(
      start,
      'DD/MM/YYYY'
    )
    const endDay = dayjs(
      end,
      'DD/MM/YYYY'
    )

    if (mode === 1) {
      while (
        current.isBefore(
          endDay
        ) ||
        current.isSame(endDay)
      ) {
        dates.push(
          current.format(
            'DD/MM/YYYY'
          )
        )
        current = current.add(
          1,
          'day'
        )
      }
    } else if (mode === 2) {
      while (
        current.isBefore(
          endDay
        ) ||
        current.isSame(endDay)
      ) {
        let targetDate =
          current.date(fixday)
        if (
          targetDate.month() !==
          current.month()
        ) {
          targetDate =
            targetDate.endOf(
              'month'
            ) // ใช้วันสุดท้ายของเดือนหาก fixday ไม่มีในเดือนนั้น
        }
        dates.push(
          targetDate.format(
            'DD/MM/YYYY'
          )
        )
        current = current.add(
          1,
          'month'
        )
      }
    } else if (mode === 3) {
      current = current.add(
        todayday,
        'day'
      )
      while (
        current.isBefore(
          endDay
        ) ||
        current.isSame(endDay)
      ) {
        dates.push(
          current.format(
            'DD/MM/YYYY'
          )
        )
        current = current.add(
          1,
          'day'
        )
      }
    }

    return dates
  }

  validateDateEntries = (
    data,
    mode,
    fixday,
    todayday,
    minDate,
    maxDate
  ) => {
    const start = data.start
    const end = data.end

    const result = {
      start,
      end,
      date: {}
    }

    for (const key in data.date) {
      const expectedDates =
        this.generateExpectedDates(
          minDate,
          maxDate,
          mode,
          fixday,
          todayday
        )
      const actualDates =
        data.date[key]
      // เช็คว่าจำนวนวันที่ตรงกันและว่ามีวันที่ตรงกันทั้งหมด
      const isLengthMatching =
        actualDates.length ===
        expectedDates.length
      const areDatesMatching =
        actualDates.every(
          (date) => {
            return expectedDates.includes(
              date
            )
          }
        )

      // // หาเฉพาะวันที่ที่มีใน actualDates แต่ไม่มีใน expectedDates
      // const unmatchedFromActual = actualDates.filter(date => !expectedDates.includes(date));

      // // หาเฉพาะวันที่ที่มีใน expectedDates แต่ไม่มีใน actualDates
      // const unmatchedFromExpected = expectedDates.filter(date => !actualDates.includes(date));

      // แสดงผล
      const validationResult =
        isLengthMatching &&
        areDatesMatching

      result.date[key] =
        mode === 2
          ? true
          : validationResult
    }

    return result
  }

  extractValidationResults = (
    result: any
  ) => {
    return Object.values(
      result
    )
  }

  validateEndDate = ({
    configStart,
    configEnd,
    file_period_mode,
    shadow_time,
    startdate,
    endDate,
    shadow_period
  }) => {
    const configEndDate =
      dayjs(
        configEnd,
        'DD/MM/YYYY'
      ) // วันที่ configEnd
    const configStartDate =
      dayjs(
        configStart,
        'DD/MM/YYYY'
      ) // วันที่ configStart
    const unit =
      file_period_mode === 2
        ? 'month'
        : 'day' // ใช้ file_period_mode กำหนดหน่วย
    const shadowDate =
      configEndDate.subtract(
        shadow_time,
        unit
      ) // คำนวณ shadowDate
    const endDateParsed =
      dayjs(
        endDate,
        'DD/MM/YYYY'
      ) // แปลง endDate
    const shadowPeriod =
      configEndDate.add(
        shadow_period,
        unit
      ) // คำนวณ shadowDate

    // เงื่อนไขที่ 1: endDate เท่ากับ configEnd และไม่เกิน shadowPeriod
    if (
      endDateParsed.isSame(
        configEndDate,
        'day'
      ) ||
      endDateParsed.isSameOrBefore(
        shadowPeriod,
        'day'
      )
    ) {
      return true
    }

    // เงื่อนไขที่ : endDate ต้องไม่หลัง configEnd
    if (
      !endDateParsed.isBefore(
        configEndDate.add(
          1,
          'day'
        )
      )
    ) {
      return false
    }

    // เงื่อนไขที่ : endDate ต้องอยู่ระหว่าง shadowDate ถึง configEnd
    if (
      endDateParsed.isSameOrAfter(
        shadowDate,
        'day'
      )
    ) {
      return false
    }

    // เงื่อนไขที่ : endDate อยู่ก่อน shadowDate แต่ต้องไม่น้อยกว่า configStart
    if (
      endDateParsed.isSameOrAfter(
        configStartDate,
        'day'
      )
    ) {
      return true
    }

    // นอกเหนือจากนี้
    return false
  }

  async fileCapacityBooking(
    url: any,
    contract_code_id: any,
    userId: any
  ) {
    return await this.prisma.file_capacity_request_management.create(
      {
        data: {
          url: url,
          contract_code_id:
            Number(
              contract_code_id
            ),
          create_by:
            Number(userId),
          create_date:
            getTodayNowAdd7().toDate(),
          create_date_num:
            getTodayNowAdd7().unix()
        }
      }
    )
  }

  async importTemplate(
    data: any,
    userId: any,
    file: any,
    token: any,
    id: any,
    terminateDate: any,
    amd: any
  ) {
    const resultTranform =
      (await JSON.parse(
        data?.json_data
      )) || null
    const headerEntry =
      resultTranform?.headerEntry ||
      {}
    const entryValue =
      resultTranform?.entryValue ||
      []
    const headerExit =
      resultTranform?.headerExit ||
      {}
    const exitValue =
      resultTranform?.exitValue ||
      []
    const sumEntries =
      resultTranform?.sumEntries ||
      {}
    const sumExits =
      resultTranform?.sumExits ||
      {}

    let shipperName = null
    let typeOfContract = null
    let contractCode = null

    Object.values(
      resultTranform?.shipperInfo
    ).forEach((info: any) => {
      if (
        info['Shipper Name']
      ) {
        shipperName =
          info['Shipper Name']
      }
      if (
        info[
          'Type of Contract'
        ]
      ) {
        typeOfContract =
          info[
            'Type of Contract'
          ]
      }
      if (
        info['Contract Code']
      ) {
        contractCode =
          info[
            'Contract Code'
          ]
      }
    })

    let resultContractCode: any
    if (
      contractCode.includes(
        '_Amd'
      )
    ) {
      const match =
        contractCode.match(
          /(.*)(_Amd.*)/
        )
      resultContractCode = [
        match[1],
        match[2]
      ]
    } else {
      resultContractCode = [
        contractCode
      ]
    }

    const typeOfContractText =
      typeOfContract ===
      'LONG'
        ? 1
        : typeOfContract ===
            'MEDIUM'
          ? 2
          : typeOfContract ===
              'SHORT_FIRM'
            ? 3
            : typeOfContract ===
                'SHORT_NON_FIRM'
              ? 4
              : null

    const checkHead =
      await this.prisma.contract_code.findFirst(
        {
          where: {
            id: Number(id),
            ref_contract_code_by_main:
              {
                contract_code:
                  resultContractCode[0]
              },
            group: {
              name: shipperName
            },
            term_type_id:
              typeOfContractText
          }
        }
      )

    if (!checkHead) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Shipper Info does not match the value.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const getGroupByName =
      await this.getGroupByName(
        shipperName
      )

    if (
      !!!getGroupByName ||
      !!!typeOfContractText ||
      !!!contractCode
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Shipper Info does not match the value.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()

    const bookingTemplate =
      await this.prisma.booking_template.findFirst(
        {
          where: {
            term_type_id:
              Number(
                typeOfContractText
              ),
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

    if (!!!bookingTemplate) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'booking template date not match'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const checkValueSum = {
      entry: {
        'Capacity Daily Booking (MMBTU/d)':
          [],
        'Maximum Hour Booking (MMBTU/h)':
          [],
        'Capacity Daily Booking (MMscfd)':
          [],
        'Maximum Hour Booking (MMscfh)':
          []
      },
      exit: {
        'Capacity Daily Booking (MMBTU/d)':
          [],
        'Maximum Hour Booking (MMBTU/h)':
          []
      }
    }

    const entryCompareNotMatch =
      []
    const exitCompareNotMatch =
      []

    const compareEntryExit = {
      'Capacity Daily Booking (MMBTU/d)':
        [],
      'Maximum Hour Booking (MMBTU/h)':
        []
    }

    // Populate checkValueSum.entry
    for (const key in checkValueSum.entry) {
      if (headerEntry[key]) {
        Object.keys(
          headerEntry[key]
        ).forEach((date) => {
          if (
            date !== 'key'
          ) {
            const entryKey =
              headerEntry[
                key
              ][date]?.key
            let sum = 0
            entryValue.forEach(
              (entry) => {
                if (
                  entry[
                    entryKey
                  ] !==
                  undefined
                ) {
                  sum +=
                    parseFloat(
                      entry[
                        entryKey
                      ]
                    ) || 0
                }
              }
            )
            checkValueSum.entry[
              key
            ].push({
              key: entryKey,
              sum,
              headerKey: date
            })
          }
        })
      }
    }

    // Populate checkValueSum.exit
    for (const key in checkValueSum.exit) {
      if (headerExit[key]) {
        Object.keys(
          headerExit[key]
        ).forEach((date) => {
          if (
            date !== 'key'
          ) {
            const exitKey =
              headerExit[key][
                date
              ]?.key
            let sum = 0
            exitValue.forEach(
              (exit) => {
                if (
                  exit[
                    exitKey
                  ] !==
                  undefined
                ) {
                  sum +=
                    parseFloat(
                      exit[
                        exitKey
                      ]
                    ) || 0
                }
              }
            )
            checkValueSum.exit[
              key
            ].push({
              key: exitKey,
              sum,
              headerKey: date
            })
          }
        })
      }
    }

    // Compare checkValueSum.entry with sumEntries
    for (const key in checkValueSum.entry) {
      checkValueSum.entry[
        key
      ].forEach(
        (entryItem) => {
          const {
            key: entryKey,
            sum: calculatedSum,
            headerKey
          } = entryItem
          const expectedSum =
            parseFloat(
              sumEntries[
                entryKey
              ]
            ) || 0

          if (
            calculatedSum !==
            expectedSum
          ) {
            entryCompareNotMatch.push(
              {
                headerKey, // This will be the date, such as "01/11/2024"
                key: entryKey,
                description:
                  key,
                calculatedSum,
                expectedSum,
                status:
                  'Mismatch'
              }
            )
          }
        }
      )
    }

    // Compare checkValueSum.exit with sumExits
    for (const key in checkValueSum.exit) {
      checkValueSum.exit[
        key
      ].forEach(
        (exitItem) => {
          const {
            key: exitKey,
            sum: calculatedSum,
            headerKey
          } = exitItem
          const expectedSum =
            parseFloat(
              sumExits[
                exitKey
              ]
            ) || 0

          if (
            calculatedSum !==
            expectedSum
          ) {
            exitCompareNotMatch.push(
              {
                headerKey, // This will be the date, such as "01/11/2024"
                key: exitKey,
                description:
                  key,
                calculatedSum,
                expectedSum,
                status:
                  'Mismatch'
              }
            )
          }
        }
      )
    }

    // Compare each entry item with its corresponding exit item in compareEntryExit
    for (const key of [
      'Capacity Daily Booking (MMBTU/d)',
      'Maximum Hour Booking (MMBTU/h)'
    ]) {
      checkValueSum.entry[
        key
      ].forEach(
        (entryItem) => {
          const {
            key: entryKey,
            sum: entrySum,
            headerKey
          } = entryItem
          const exitItem =
            checkValueSum.exit[
              key
            ].find(
              (exit) =>
                exit.key ===
                entryKey
            )

          if (exitItem) {
            const exitSum =
              exitItem.sum
            if (
              entrySum !==
              exitSum
            ) {
              compareEntryExit[
                key
              ].push({
                description:
                  key,
                headerKey, // This will be the date, such as "01/11/2024"
                key: entryKey,
                entrySum,
                exitSum,
                status:
                  'Mismatch'
              })
            }
          } else {
            // If no matching exit item found, consider it a mismatch
            compareEntryExit[
              key
            ].push({
              description:
                key,
              headerKey,
              key: entryKey,
              entrySum,
              exitSum: null, // Indicate no matching exit sum found
              status:
                'Mismatch (No Matching Exit)'
            })
          }
        }
      )
    }

    const keyEntryPoint =
      resultTranform?.[
        'headerEntry'
      ]?.['Entry']?.[
        'Entry Point'
      ]?.['key']
    const keyExitPoint =
      resultTranform?.[
        'headerExit'
      ]?.['Exit']?.[
        'Entry Point'
      ]?.['key']
    const warningData = []
    const newData =
      getTodayNowAdd7().format(
        'YYYY/MM/DD HH:mm'
      )

    let dEntryA: any = null

    let dExitA: any = null

    const keyEntryFrom =
      resultTranform?.[
        'headerEntry'
      ]?.['Period']?.[
        'From'
      ]?.['key']
    const keyEntryTo =
      resultTranform?.[
        'headerEntry'
      ]?.['Period']?.['To']?.[
        'key'
      ]
    const keyExitFrom =
      resultTranform?.[
        'headerExit'
      ]?.['Period']?.[
        'From'
      ]?.['key']
    const keyExitTo =
      resultTranform?.[
        'headerExit'
      ]?.['Period']?.['To']?.[
        'key'
      ]

    const dateStartAll: any =
      []
    const dateEndAll: any = []

    const newEntry =
      await Promise.all(
        entryValue.map(
          async (
            e: any,
            i: any
          ) => {
            const entryPointName =
              e[keyEntryPoint]

            // let newStartDayPlus = dayjs(todayStart).add(1, 'day');
            // let newStartDayPlus = dayjs(todayStart).add(1, 'day');
            let newStartDayPlus =
              dayjs(
                todayStart
              )
            let useStart =
              dayjs(
                e[
                  keyEntryFrom
                ],
                'DD/MM/YYYY'
              )

            let isCheckMoreDate =
              useStart.isAfter(
                newStartDayPlus
              )
            let checkMinMax = false

            if (
              !isCheckMoreDate &&
              amd === 'on'
            ) {
              throw new HttpException(
                {
                  status:
                    HttpStatus.BAD_REQUEST,
                  error:
                    'Period From date in the template must be later than today.'
                },
                HttpStatus.BAD_REQUEST
              )
            }

            checkMinMax =
              this.checkDateRange(
                e[
                  keyEntryFrom
                ],
                e[keyEntryTo],
                bookingTemplate?.file_period_mode,
                bookingTemplate?.min,
                bookingTemplate?.max
              )

            if (
              !checkMinMax
            ) {
              throw new HttpException(
                {
                  status:
                    HttpStatus.BAD_REQUEST,
                  error:
                    'Date is NOT match'
                },
                HttpStatus.BAD_REQUEST
              )
            }

            const headerEntryDate =
              resultTranform?.[
                'headerEntry'
              ]
            const keysGreaterThanEntryTo =
              Object.keys(
                e
              ).filter(
                (key) =>
                  Number(
                    key
                  ) >
                  Number(
                    keyEntryTo
                  )
              )
            for (
              let is = 0;
              is <
              keysGreaterThanEntryTo.length;
              is++
            ) {
              if (
                headerEntryDate
              ) {
                Object.keys(
                  headerEntryDate
                ).forEach(
                  (
                    capacityKey
                  ) => {
                    const capacityDates =
                      headerEntryDate[
                        capacityKey
                      ]
                    Object.keys(
                      capacityDates
                    ).forEach(
                      (
                        dateKey
                      ) => {
                        const keyValue =
                          capacityDates[
                            dateKey
                          ]?.[
                            'key'
                          ]
                        if (
                          keysGreaterThanEntryTo[
                            is
                          ] ===
                          keyValue
                        ) {
                          const dateToCheckCk =
                            dayjs(
                              e[
                                dateKey
                              ],
                              'DD/MM/YYYY'
                            )
                          const startDateCk =
                            dayjs(
                              e[
                                keyEntryFrom
                              ],
                              'DD/MM/YYYY'
                            )
                          const endDateCk =
                            dayjs(
                              e[
                                keyEntryTo
                              ],
                              'DD/MM/YYYY'
                            )
                          dateStartAll.push(
                            e[
                              keyEntryFrom
                            ]
                          )
                          dateEndAll.push(
                            e[
                              keyEntryTo
                            ]
                          )

                          const isInRangeZero =
                            dayjs(
                              dateKey,
                              'DD/MM/YYYY'
                            ).isBetween(
                              dayjs(
                                e[
                                  keyEntryFrom
                                ],
                                'DD/MM/YYYY'
                              ),
                              dayjs(
                                e[
                                  keyEntryTo
                                ],
                                'DD/MM/YYYY'
                              ),
                              'day',
                              '[]'
                            )

                          // เงื่อนไขตรวจสอบความถูกต้อง
                          let resultZero: boolean
                          // if (isInRangeZero && e[keyValue] > 0) {
                          //   // อยู่ในช่วง และ value > 0 = ถูกต้อง
                          //   resultZero = true;
                          // } else if (!isInRangeZero && e[keyValue] === 0) {
                          //   // ไม่อยู่ในช่วง และ value === 0 = ถูกต้อง
                          //   resultZero = true;
                          // } else {
                          //   // นอกเหนือจากนี้ = ผิด
                          //   resultZero = false;
                          // }
                          if (
                            !isInRangeZero &&
                            e[
                              keyValue
                            ] ===
                              0
                          ) {
                            resultZero = true
                          } else if (
                            !isInRangeZero
                          ) {
                            resultZero = false
                          } else {
                            resultZero = true
                          }
                          if (
                            !resultZero
                          ) {
                            throw new HttpException(
                              {
                                status:
                                  HttpStatus.BAD_REQUEST,
                                error:
                                  'Date is NOT match.'
                              },
                              HttpStatus.BAD_REQUEST
                            )
                          }

                          const isInRange =
                            dateToCheckCk.isBetween(
                              startDateCk,
                              endDateCk,
                              null,
                              '[]'
                            )

                          if (
                            isInRange
                          ) {
                            if (
                              Number(
                                e[
                                  keyValue
                                ]
                              ) <=
                              0
                            ) {
                              if (
                                !isCheckMoreDate
                              ) {
                                warningData.push(
                                  `${capacityKey} [date : [${dateKey}] value : ${e[keyValue]}] Entry Point: ${entryPointName} not match system ${newData}`
                                )
                              }
                            }
                          } else {
                            if (
                              Number(
                                e[
                                  keyValue
                                ]
                              ) !==
                              0
                            ) {
                              warningData.push(
                                `${capacityKey} [date : [${dateKey}] value : ${e[keyValue]}] Entry Point: ${entryPointName} not match system ${newData}`
                              )
                            }
                          }
                          if (
                            !dEntryA
                          ) {
                            dEntryA =
                              {}
                          }

                          if (
                            !dEntryA[
                              i
                            ]
                          ) {
                            dEntryA[
                              i
                            ] =
                              {
                                start:
                                  e[
                                    keyEntryFrom
                                  ],
                                end: e[
                                  keyEntryTo
                                ],
                                date: {
                                  [capacityKey]:
                                    []
                                }
                              }
                          }

                          dEntryA =
                            {
                              ...dEntryA,
                              [i]: {
                                start:
                                  e[
                                    keyEntryFrom
                                  ],
                                end: e[
                                  keyEntryTo
                                ],
                                date: {
                                  ...dEntryA[
                                    i
                                  ][
                                    'date'
                                  ],
                                  [capacityKey]:
                                    [
                                      ...(dEntryA[
                                        i
                                      ][
                                        'date'
                                      ][
                                        capacityKey
                                      ] ||
                                        []),
                                      dateKey
                                    ]
                                }
                              }
                            }
                        }
                      }
                    )
                  }
                )
              }
            }

            const getContractPointByName =
              await this.getContractPointByName(
                entryPointName,
                getGroupByName?.id ||
                  null
              )
            if (
              !!!getContractPointByName
            ) {
              warningData.push(
                `Entry Point: ${entryPointName} not match system ${newData}`
              )
            }
            const contractPoints =
              await this.prisma.contract_point.findFirst(
                {
                  where: {
                    contract_point:
                      e['0'],
                    entry_exit_id: 1
                  },
                  include: {
                    area: true,
                    zone: true
                  }
                }
              )

            return {
              data: e,

              contract_point:
                e['0'],
              area:
                contractPoints
                  ?.area
                  ?.name ||
                null,
              zone:
                contractPoints
                  ?.zone
                  ?.name ||
                null,
              // area: e['1'] || null,
              // zone: e['0'] || null,
              contractPointName:
                entryPointName ||
                null
            }
          }
        )
      )

    const newExit =
      await Promise.all(
        exitValue.map(
          async (
            e: any,
            i: any
          ) => {
            const exitPointName =
              e[keyExitPoint]

            // let newStartDayPlus = dayjs(todayStart).add(1, 'day');
            // let newStartDayPlus = dayjs(todayStart).add(1, 'day');
            let newStartDayPlus =
              dayjs(
                todayStart
              )
            let useStart =
              dayjs(
                e[
                  keyExitFrom
                ],
                'DD/MM/YYYY'
              )
            let isCheckMoreDate =
              useStart.isAfter(
                newStartDayPlus
              )
            let checkMinMax = false

            if (
              !isCheckMoreDate &&
              amd === 'on'
            ) {
              throw new HttpException(
                {
                  status:
                    HttpStatus.BAD_REQUEST,
                  error:
                    'Period From date in the template must be later than today.'
                },
                HttpStatus.BAD_REQUEST
              )
            }

            checkMinMax =
              this.checkDateRange(
                e[
                  keyExitFrom
                ],
                e[keyExitTo],
                bookingTemplate?.file_period_mode,
                bookingTemplate?.min,
                bookingTemplate?.max
              )
            if (
              !checkMinMax
            ) {
              throw new HttpException(
                {
                  status:
                    HttpStatus.BAD_REQUEST,
                  error:
                    'Date is NOT match'
                },
                HttpStatus.BAD_REQUEST
              )
            }

            const headerExitDate =
              resultTranform?.[
                'headerExit'
              ]
            const keysGreaterThanExitTo =
              Object.keys(
                e
              ).filter(
                (key) =>
                  Number(
                    key
                  ) >
                  Number(
                    keyExitTo
                  )
              )
            for (
              let is = 0;
              is <
              keysGreaterThanExitTo.length;
              is++
            ) {
              if (
                headerExitDate
              ) {
                Object.keys(
                  headerExitDate
                ).forEach(
                  (
                    capacityKey
                  ) => {
                    const capacityDates =
                      headerExitDate[
                        capacityKey
                      ]
                    Object.keys(
                      capacityDates
                    ).forEach(
                      (
                        dateKey
                      ) => {
                        const keyValue =
                          capacityDates[
                            dateKey
                          ]?.[
                            'key'
                          ]
                        if (
                          keysGreaterThanExitTo[
                            is
                          ] ===
                          keyValue
                        ) {
                          const dateToCheckCk =
                            dayjs(
                              e[
                                dateKey
                              ],
                              'DD/MM/YYYY'
                            )
                          const startDateCk =
                            dayjs(
                              e[
                                keyExitFrom
                              ],
                              'DD/MM/YYYY'
                            )
                          const endDateCk =
                            dayjs(
                              e[
                                keyExitTo
                              ],
                              'DD/MM/YYYY'
                            )
                          dateStartAll.push(
                            e[
                              keyEntryFrom
                            ]
                          )
                          dateEndAll.push(
                            e[
                              keyEntryTo
                            ]
                          )
                          const isInRange =
                            dateToCheckCk.isBetween(
                              startDateCk,
                              endDateCk,
                              null,
                              '[]'
                            )
                          if (
                            isInRange
                          ) {
                            if (
                              Number(
                                e[
                                  keyValue
                                ]
                              ) <=
                              0
                            ) {
                              if (
                                !isCheckMoreDate
                              ) {
                                warningData.push(
                                  `${capacityKey} [date : [${dateKey}] value : ${e[keyValue]}] Exit Point: ${exitPointName} not match system ${newData}`
                                )
                              }
                            }
                          } else {
                            if (
                              Number(
                                e[
                                  keyValue
                                ]
                              ) !==
                              0
                            ) {
                              warningData.push(
                                `${capacityKey} [date : [${dateKey}] value : ${e[keyValue]}] Exit Point: ${exitPointName} not match system ${newData}`
                              )
                            }
                          }
                          if (
                            !dExitA
                          ) {
                            dExitA =
                              {}
                          }

                          if (
                            !dExitA[
                              i
                            ]
                          ) {
                            dExitA[
                              i
                            ] =
                              {
                                start:
                                  e[
                                    keyExitFrom
                                  ],
                                end: e[
                                  keyExitTo
                                ],
                                date: {
                                  [capacityKey]:
                                    []
                                }
                              }
                          }

                          dExitA =
                            {
                              ...dExitA,
                              [i]: {
                                start:
                                  e[
                                    keyExitFrom
                                  ],
                                end: e[
                                  keyExitTo
                                ],
                                date: {
                                  ...dExitA[
                                    i
                                  ][
                                    'date'
                                  ],
                                  [capacityKey]:
                                    [
                                      ...(dExitA[
                                        i
                                      ][
                                        'date'
                                      ][
                                        capacityKey
                                      ] ||
                                        []),
                                      dateKey
                                    ]
                                }
                              }
                            }
                        }
                      }
                    )
                  }
                )
              }
            }

            const getContractPointByName =
              await this.getContractPointByName(
                exitPointName,
                getGroupByName?.id ||
                  null
              )
            if (
              !!!getContractPointByName
            ) {
              warningData.push(
                `Exit Point: ${exitPointName} not match system ${newData}`
              )
            }
            const contractPoints =
              await this.prisma.contract_point.findFirst(
                {
                  where: {
                    contract_point:
                      e['0'],
                    entry_exit_id: 1
                  },
                  include: {
                    area: true,
                    zone: true
                  }
                }
              )

            return {
              data: e,

              contract_point:
                e['0'],
              area:
                contractPoints
                  ?.area
                  ?.name ||
                null,
              zone:
                contractPoints
                  ?.zone
                  ?.name ||
                null,
              // area: e['1'] || null,
              // zone: e['0'] || null,
              contractPointName:
                exitPointName ||
                null
            }
          }
        )
      )

    const minDate =
      dateStartAll.reduce(
        (min, current) => {
          return dayjs(
            current,
            'DD/MM/YYYY'
          ).isBefore(
            dayjs(
              min,
              'DD/MM/YYYY'
            )
          )
            ? current
            : min
        },
        dateStartAll[0]
      )
    const maxDate =
      dateEndAll.reduce(
        (max, current) => {
          return dayjs(
            current,
            'DD/MM/YYYY'
          ).isAfter(
            dayjs(
              max,
              'DD/MM/YYYY'
            )
          )
            ? current
            : max
        },
        dateEndAll[0]
      )

    const checkContractCode =
      await this.prisma.contract_code.findFirst(
        {
          select: {
            id: true,
            contract_code: true,
            status_capacity_request_management: true,
            file_period_mode: true,
            fixdayday: true,
            todayday: true,
            group: {
              select: {
                name: true
              }
            },
            term_type_id: true
          },
          where: {
            contract_code:
              contractCode
          }
        }
      )

    if (checkContractCode) {
      // มี
      if (
        shipperName !==
        checkContractCode
          ?.group?.name
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'ShipperName ไม่เหมือนของเดิม'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      if (
        typeOfContractText !==
        checkContractCode?.term_type_id
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'Term Type ไม่เหมือนของเดิม'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      if (
        checkContractCode?.file_period_mode !==
          bookingTemplate?.file_period_mode &&
        checkContractCode?.file_period_mode ===
          2
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'format date ไม่เหมือนของเดิม'
          },
          HttpStatus.BAD_REQUEST
        )
      } else if (
        bookingTemplate?.file_period_mode ===
          2 &&
        (checkContractCode?.file_period_mode ===
          1 ||
          checkContractCode?.file_period_mode ===
            3)
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'format date ไม่เหมือนของเดิม'
          },
          HttpStatus.BAD_REQUEST
        )
      } else {
        const dEntryArray =
          Object.values(
            dEntryA
          )
        for (
          let i = 0;
          i <
          dEntryArray.length;
          i++
        ) {
          const calcCheckEntry =
            await this.validateDateEntries(
              dEntryArray[i],
              bookingTemplate?.file_period_mode,
              bookingTemplate?.fixdayday,
              bookingTemplate?.todayday,
              minDate,
              maxDate
            )
          const objCalcEntry =
            this.extractValidationResults(
              calcCheckEntry?.date
            )
          const findCalcEntry =
            objCalcEntry.filter(
              (f: any) => {
                return (
                  f === false
                )
              }
            )

          if (
            findCalcEntry.length >
            0
          ) {
            throw new HttpException(
              {
                status:
                  HttpStatus.BAD_REQUEST,
                error:
                  'format date Entry มีวันที่/จำนวนไม่ถูกต้อง'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        }
        const dExitArray =
          Object.values(
            dExitA
          )
        for (
          let i = 0;
          i <
          dExitArray.length;
          i++
        ) {
          const calcCheckExit =
            await this.validateDateEntries(
              dExitArray[i],
              bookingTemplate?.file_period_mode,
              bookingTemplate?.fixdayday,
              bookingTemplate?.todayday,
              minDate,
              maxDate
            )
          const objCalcExit =
            this.extractValidationResults(
              calcCheckExit?.date
            )
          const findCalcExit =
            objCalcExit.filter(
              (f: any) => {
                return (
                  f === false
                )
              }
            )
          if (
            findCalcExit.length >
            0
          ) {
            throw new HttpException(
              {
                status:
                  HttpStatus.BAD_REQUEST,
                error:
                  'format date Exit มีวันที่/จำนวนไม่ถูกต้อง'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }
    } else {
      // ไม่มี
      const dEntryArray =
        Object.values(dEntryA)
      for (
        let i = 0;
        i <
        dEntryArray.length;
        i++
      ) {
        const calcCheckEntry =
          await this.validateDateEntries(
            dEntryArray[i],
            bookingTemplate?.file_period_mode,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate
          )
        const objCalcEntry =
          this.extractValidationResults(
            calcCheckEntry?.date
          )
        const findCalcEntry =
          objCalcEntry.filter(
            (f: any) => {
              return (
                f === false
              )
            }
          )

        if (
          findCalcEntry.length >
          0
        ) {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                'format date Entry มีวันที่/จำนวนไม่ถูกต้อง'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
      const dExitArray =
        Object.values(dExitA)
      for (
        let i = 0;
        i < dExitArray.length;
        i++
      ) {
        const calcCheckExit =
          await this.validateDateEntries(
            dExitArray[i],
            bookingTemplate?.file_period_mode,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate
          )
        const objCalcExit =
          this.extractValidationResults(
            calcCheckExit?.date
          )
        const findCalcExit =
          objCalcExit.filter(
            (f: any) => {
              return (
                f === false
              )
            }
          )
        if (
          findCalcExit.length >
          0
        ) {
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                'format date Exit มีวันที่/จำนวนไม่ถูกต้อง'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }

    if (
      entryCompareNotMatch.length >
      0
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Total Entry & Total Exit is NOT match.',
          data: entryCompareNotMatch
        },
        HttpStatus.BAD_REQUEST
      )
    }
    if (
      exitCompareNotMatch.length >
      0
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Total Entry & Total Exit is NOT match.',
          data: exitCompareNotMatch
        },
        HttpStatus.BAD_REQUEST
      )
    }
    if (
      compareEntryExit[
        'Capacity Daily Booking (MMBTU/d)'
      ].length > 0 ||
      compareEntryExit[
        'Maximum Hour Booking (MMBTU/h)'
      ].length > 0
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Total Entry & Total Exit is NOT match.',
          data: compareEntryExit
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const checkContractCodeCheckLast =
      await this.prisma.contract_code.findFirst(
        {
          select: {
            id: true,
            status_capacity_request_management_id: true,
            contract_start_date: true,
            contract_end_date: true,
            terminate_date: true,
            status_capacity_request_management_process_id: true,
            ref_contract_code_by_main_id: true,
            ref_contract_code_by_id: true,
            shadow_period: true,
            shadow_time: true,
            type_account_id: true
          },
          where: {
            ref_contract_code_by_main_id:
              checkContractCode?.id
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    if (
      checkContractCodeCheckLast?.status_capacity_request_management_process_id ===
        4 ||
      checkContractCodeCheckLast?.status_capacity_request_management_id ===
        5
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Contract Code End | Terminate'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    let versionFlag = false
    let amdFlag = false
    let newCreate = false
    let contract_code =
      resultContractCode[0]
    const nowDate =
      getTodayNowAdd7().toDate()

    const hasContractStarted =
      dayjs(nowDate).isAfter(
        dayjs(
          checkContractCodeCheckLast?.contract_start_date
        )
      ) ||
      dayjs(nowDate).isSame(
        dayjs(
          checkContractCodeCheckLast?.contract_start_date
        )
      )
    let amdVersion: any = null
    if (
      hasContractStarted &&
      checkContractCodeCheckLast?.status_capacity_request_management_id ===
        2
    ) {
      const checkContractCodeCheckLength =
        await this.prisma.contract_code.count(
          {
            where: {
              ref_contract_code_by_main_id:
                checkContractCode?.id
            }
          }
        )
      amdVersion =
        '_Amd' +
        String(
          checkContractCodeCheckLength >
            9
            ? checkContractCodeCheckLength
            : '0' +
                checkContractCodeCheckLength
        )
      contract_code =
        contract_code +
        amdVersion
      amdFlag = true
    } else if (
      !hasContractStarted &&
      checkContractCodeCheckLast?.status_capacity_request_management_id ===
        2
    ) {
      versionFlag = true
    } else {
      if (
        checkContractCodeCheckLast
      ) {
        versionFlag = true
      } else {
        newCreate = true
      }
    }

    const shipperId =
      await this.prisma.group.findFirst(
        {
          select: {
            id: true
          },
          where: {
            name: shipperName
          }
        }
      )

    if (newCreate) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'error เงื่อนไข ไม่ตรง'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      // https://app.clickup.com/t/86erqt8g5
      const ckAreaDup = [
        ...newEntry,
        ...newExit
      ]?.map(
        (ar: any) => ar?.area
      )
      const hasDuplicate =
        new Set(ckAreaDup)
          .size !==
        ckAreaDup.length
      if (hasDuplicate) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'Area is Contract Point Duplicate.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      if (
        versionFlag &&
        amd === 'off'
      ) {
        await this.prisma.contract_code.update(
          {
            where: {
              id: Number(id)
            },
            data: {
              contract_start_date:
                minDate
                  ? getTodayNowDDMMYYYYDfaultAdd7(
                      minDate
                    ).toDate()
                  : null,
              contract_end_date:
                maxDate
                  ? getTodayNowDDMMYYYYDfaultAdd7(
                      maxDate
                    ).toDate()
                  : null,
              submitted_timestamp:
                getTodayNowAdd7().toDate(),
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

        await this.prisma.booking_version.updateMany(
          {
            where: {
              contract_code_id:
                Number(id)
            },
            data: {
              flag_use: false
            }
          }
        )

        const checkContractCodeCheckLength =
          await this.prisma.booking_version.count(
            {
              where: {
                contract_code_id:
                  Number(id)
              }
            }
          )

        const versId =
          await this.prisma.booking_version.create(
            {
              data: {
                version: `v.${checkContractCodeCheckLength + 1}`,
                ...(!!checkContractCodeCheckLast?.id && {
                  contract_code:
                    {
                      connect:
                        {
                          id: checkContractCodeCheckLast?.id
                        }
                    }
                }),
                flag_use: true,
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
                  },
                submitted_timestamp:
                  getTodayNowAdd7().toDate(),
                type_account:
                  {
                    connect: {
                      id: checkContractCodeCheckLast?.type_account_id
                    }
                  },
                status_capacity_request_management:
                  {
                    connect: {
                      id: checkContractCodeCheckLast?.status_capacity_request_management_id
                    }
                  }
              }
            }
          )

        await this.prisma.booking_full_json.create(
          {
            data: {
              ...(!!versId?.id && {
                booking_version:
                  {
                    connect: {
                      id: versId?.id
                    }
                  }
              }),
              data_temp:
                JSON.stringify(
                  resultTranform
                ),
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

        let mapDataRowJson =
          []
        for (
          let i = 0;
          i < newEntry.length;
          i++
        ) {
          mapDataRowJson.push(
            {
              booking_version_id:
                versId?.id,
              entry_exit_id: 1,

              zone_text:
                newEntry[i]
                  ?.zone,
              area_text:
                newEntry[i]
                  ?.area,
              contract_point:
                newEntry[i]
                  ?.contract_point,
              flag_use: true,
              data_temp:
                JSON.stringify(
                  newEntry[i]
                    ?.data
                ),
              create_by:
                Number(
                  userId
                ),
              create_date:
                getTodayNowAdd7().toDate(),
              create_date_num:
                getTodayNowAdd7().unix()
            }
          )
        }
        for (
          let i = 0;
          i < newExit.length;
          i++
        ) {
          mapDataRowJson.push(
            {
              booking_version_id:
                versId?.id,
              entry_exit_id: 2,

              zone_text:
                newExit[i]
                  ?.zone,
              area_text:
                newExit[i]
                  ?.area,
              contract_point:
                newExit[i]
                  ?.contract_point,
              flag_use: true,
              data_temp:
                JSON.stringify(
                  newExit[i]
                    ?.data
                ),
              create_by:
                Number(
                  userId
                ),
              create_date:
                getTodayNowAdd7().toDate(),
              create_date_num:
                getTodayNowAdd7().unix()
            }
          )
        }

        await this.prisma.booking_row_json.createMany(
          {
            data: mapDataRowJson
          }
        )

        const responseUpFile =
          await uploadFilsTemp(
            file
          )
        await this.fileCapacityBooking(
          responseUpFile?.file
            ?.url,
          checkContractCodeCheckLast?.id,
          userId
        )
      } else if (
        amdFlag &&
        amd === 'on'
      ) {
        const extendContractLast =
          await this.prisma.extend_contract_capacity_request_management.findFirst(
            {
              where: {
                contract_code_id:
                  checkContractCodeCheckLast?.id
              },
              orderBy: {
                id: 'desc'
              }
            }
          )
        const configStart =
          dayjs(
            extendContractLast?.start_date
          ).format(
            'DD/MM/YYYY'
          )
        const configEnd =
          dayjs(
            extendContractLast?.end_date
          ).format(
            'DD/MM/YYYY'
          )

        const resCk =
          await this.validateEndDate(
            {
              configStart:
                configStart,
              configEnd:
                configEnd,
              file_period_mode:
                bookingTemplate?.file_period_mode,
              shadow_time:
                checkContractCodeCheckLast?.shadow_time,
              startdate:
                minDate,
              endDate:
                maxDate,
              shadow_period:
                checkContractCodeCheckLast?.shadow_period
            }
          )

        if (resCk) {
          if (
            minDate !==
            terminateDate
          ) {
            throw new HttpException(
              {
                status:
                  HttpStatus.BAD_REQUEST,
                error:
                  'terminateDate ไม่สอดคล้อง',
                data: compareEntryExit
              },
              HttpStatus.BAD_REQUEST
            )
          }

          const createContractCodeAmd =
            await this.prisma.contract_code.create(
              {
                data: {
                  contract_code:
                    contract_code,
                  ...(!!typeOfContractText && {
                    term_type:
                      {
                        connect:
                          {
                            id: typeOfContractText
                          }
                      }
                  }),
                  ...(!!shipperId?.id && {
                    group: {
                      connect:
                        {
                          id: shipperId?.id
                        }
                    }
                  }),
                  status_capacity_request_management_process:
                    {
                      connect:
                        {
                          id: 1
                        }
                    },
                  status_capacity_request_management:
                    {
                      connect:
                        {
                          id: 2
                        }
                    },
                  type_account:
                    {
                      connect:
                        {
                          id: 1
                        }
                    },
                  ...(!!checkContractCodeCheckLast?.ref_contract_code_by_main_id && {
                    ref_contract_code_by_main:
                      {
                        connect:
                          {
                            id: checkContractCodeCheckLast?.ref_contract_code_by_main_id
                          }
                      }
                  }),
                  ...(!!checkContractCodeCheckLast?.id && {
                    ref_contract_code_by:
                      {
                        connect:
                          {
                            id: checkContractCodeCheckLast?.id
                          }
                      }
                  }),
                  shadow_period:
                    checkContractCodeCheckLast?.shadow_period,
                  shadow_time:
                    checkContractCodeCheckLast?.shadow_time,
                  file_period_mode:
                    bookingTemplate?.file_period_mode,
                  fixdayday:
                    bookingTemplate?.fixdayday,
                  todayday:
                    bookingTemplate?.todayday,
                  contract_start_date:
                    minDate
                      ? getTodayNowDDMMYYYYDfaultAdd7(
                          minDate
                        ).toDate()
                      : null,
                  contract_end_date:
                    maxDate
                      ? getTodayNowDDMMYYYYDfaultAdd7(
                          maxDate
                        ).toDate()
                      : null,
                  submitted_timestamp:
                    getTodayNowAdd7().toDate(),
                  create_date:
                    getTodayNowAdd7().toDate(),
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

          await this.prisma.contract_code.update(
            {
              where: {
                id:
                  createContractCodeAmd?.id ??
                  -1
              },
              data: {
                ref_contract_code_by_main_id:
                  checkContractCodeCheckLast?.ref_contract_code_by_main_id,
                ref_contract_code_by_id:
                  checkContractCodeCheckLast?.id
              }
            }
          )

          const versId =
            await this.prisma.booking_version.create(
              {
                data: {
                  version: `v.1`,
                  ...(!!createContractCodeAmd?.id && {
                    // new create ..
                    contract_code:
                      {
                        connect:
                          {
                            id: createContractCodeAmd?.id
                          }
                      }
                  }),
                  flag_use: true,
                  create_date:
                    getTodayNowAdd7().toDate(),
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
                    },
                  submitted_timestamp:
                    getTodayNowAdd7().toDate(),
                  type_account:
                    {
                      connect:
                        {
                          id: createContractCodeAmd?.type_account_id
                        }
                    },
                  status_capacity_request_management:
                    {
                      connect:
                        {
                          id: createContractCodeAmd?.status_capacity_request_management_id
                        }
                    }
                }
              }
            )

          await this.prisma.booking_full_json.create(
            {
              data: {
                ...(!!versId?.id && {
                  booking_version:
                    {
                      connect:
                        {
                          id: versId?.id
                        }
                    }
                }),
                data_temp:
                  JSON.stringify(
                    resultTranform
                  ),
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

          let mapDataRowJson =
            []
          for (
            let i = 0;
            i <
            newEntry.length;
            i++
          ) {
            const checkZAC =
              await this.prisma.contract_point.findFirst(
                {
                  where: {
                    contract_point:
                      newEntry[
                        i
                      ]
                        ?.contract_point,
                    area: {
                      name:
                        newEntry[
                          i
                        ]
                          ?.area ||
                        ''
                    },
                    zone: {
                      name:
                        newEntry[
                          i
                        ]
                          ?.zone ||
                        ''
                    },
                    entry_exit_id: 1
                  }
                }
              )
            if (!checkZAC) {
              throw new HttpException(
                {
                  status:
                    HttpStatus.BAD_REQUEST,
                  error:
                    'zone & area & contract point ไม่สอดคล้อง'
                },
                HttpStatus.BAD_REQUEST
              )
            }
            mapDataRowJson.push(
              {
                booking_version_id:
                  versId?.id,
                entry_exit_id: 1,
                zone_text:
                  newEntry[i]
                    ?.zone,
                area_text:
                  newEntry[i]
                    ?.area,
                contract_point:
                  newEntry[i]
                    ?.contract_point,
                flag_use: true,
                data_temp:
                  JSON.stringify(
                    newEntry[
                      i
                    ]?.data
                  ),
                create_by:
                  Number(
                    userId
                  ),
                create_date:
                  getTodayNowAdd7().toDate(),
                create_date_num:
                  getTodayNowAdd7().unix()
              }
            )
          }
          for (
            let i = 0;
            i <
            newExit.length;
            i++
          ) {
            const checkZAC =
              await this.prisma.contract_point.findFirst(
                {
                  where: {
                    contract_point:
                      newExit[
                        i
                      ]
                        ?.contract_point,
                    area: {
                      name:
                        newExit[
                          i
                        ]
                          ?.area ||
                        ''
                    },
                    zone: {
                      name:
                        newExit[
                          i
                        ]
                          ?.zone ||
                        ''
                    },
                    entry_exit_id: 2
                  }
                }
              )
            if (!checkZAC) {
              throw new HttpException(
                {
                  status:
                    HttpStatus.BAD_REQUEST,
                  error:
                    'zone & area & contract point ไม่สอดคล้อง'
                },
                HttpStatus.BAD_REQUEST
              )
            }

            mapDataRowJson.push(
              {
                booking_version_id:
                  versId?.id,
                entry_exit_id: 2,
                zone_text:
                  newExit[i]
                    ?.zone,
                area_text:
                  newExit[i]
                    ?.area,
                contract_point:
                  newExit[i]
                    ?.contract_point,
                flag_use: true,
                data_temp:
                  JSON.stringify(
                    newExit[i]
                      ?.data
                  ),
                create_by:
                  Number(
                    userId
                  ),
                create_date:
                  getTodayNowAdd7().toDate(),
                create_date_num:
                  getTodayNowAdd7().unix()
              }
            )
          }

          await this.prisma.booking_row_json.createMany(
            {
              data: mapDataRowJson
            }
          )

          const responseUpFile =
            await uploadFilsTemp(
              file
            )
          await this.fileCapacityBooking(
            responseUpFile
              ?.file?.url,
            checkContractCodeCheckLast?.id,
            userId
          )

          await this.prisma.contract_code.updateMany(
            {
              where: {
                id: Number(
                  checkContractCodeCheckLast?.id ??
                    -1
                )
              },
              data: {
                status_capacity_request_management_id: 5
              }
            }
          )
        } else {
          // ไม่ได้
          throw new HttpException(
            {
              status:
                HttpStatus.BAD_REQUEST,
              error:
                'ไม่ตรงกับ เงื่อนไข shadow time or shadow period'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      } else {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'error เงื่อนไข'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    return {
      message: 'Success.'
    }
  }

  async commentVersion(
    payload: any,
    id: any,
    userId: any
  ) {
    const {comment} = payload
    const dateCre =
      getTodayNowAdd7()

    const createCommentVersion =
      await this.prisma.booking_version_comment.create(
        {
          data: {
            ...(!!id && {
              booking_version:
                {
                  connect: {
                    id: Number(
                      id
                    )
                  }
                }
            }),
            comment: comment,
            create_date:
              dateCre.toDate(),
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
    return createCommentVersion
  }

  async groupPath() {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()

    const configPath =
      await this.prisma.config_master_path.findMany(
        {
          include: {
            revised_capacity_path:
              {
                include: {
                  area: true
                },
                orderBy: {
                  area_id:
                    'desc'
                }
              },
            revised_capacity_path_edges: true
          },
          where: {
            active: true,
            revised_capacity_path:
              {
                some: {
                  area: {
                    AND: [
                      {
                        start_date:
                          {
                            lte: todayEnd // วันที่เริ่มต้นน้อยกว่าหรือเท่ากับวันนี้
                          }
                      },
                      {
                        OR: [
                          {
                            end_date:
                              {
                                gte: todayStart // วันที่สิ้นสุดมากกว่าหรือเท่ากับวันนี้
                              }
                          },
                          {
                            end_date:
                              null // หรือไม่มี end_date (null)
                          }
                        ]
                      }
                    ]
                  }
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    let exitArrId: any = []
    const pathConfigs =
      configPath.map(
        (e: any) => {
          for (
            let iex = 0;
            iex <
            e
              ?.revised_capacity_path
              .length;
            iex++
          ) {
            if (
              e
                ?.revised_capacity_path[
                iex
              ]?.area
                ?.entry_exit_id ===
              2
            ) {
              const area =
                e
                  ?.revised_capacity_path[
                  iex
                ]?.area
              if (
                !exitArrId.find(
                  (item) =>
                    item.id ===
                    area?.id
                )
              ) {
                exitArrId.push(
                  area
                )
              }
            }
          }

          return e
        }
      )

    const exitArrResult =
      exitArrId.map(
        (e: any) => {
          // pathConfigs
          // revised_capacity_path
          // area?.id
          const filId =
            pathConfigs?.filter(
              (f: any) => {
                const filData =
                  f?.revised_capacity_path?.find(
                    (
                      fs: any
                    ) => {
                      return (
                        fs
                          ?.area
                          ?.id ===
                        e?.id
                      )
                    }
                  )
                return !!filData
              }
            )

          return {
            ...e,
            pathConfigs: filId
          }
        }
      )

    const newData = (
      exitArrResult || []
    ).filter((item) => {
      const startDate =
        item.start_date
          ? new Date(
              item.start_date
            )
          : null
      const endDate =
        item.end_date
          ? new Date(
              item.end_date
            )
          : null

      //   กรอง start_date: เอาเฉพาะที่ start_date <= วันนี้
      const isStartDateValid =
        startDate &&
        startDate <=
          todayStart

      //   กรอง end_date:
      //  - ถ้ามีค่า → ต้อง >= วันนี้
      //  - ถ้าเป็น null → ให้ผ่าน
      const isEndDateValid =
        !endDate ||
        endDate >= todayStart

      return (
        isStartDateValid &&
        isEndDateValid
      )
    })

    return newData || []
  }

  async pureContract(payload: any, userId: any) {
    let group_id = null
    if (userId) {
      const userType = await this.prisma.user_type?.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(userId)
            }
          }
        }
      })
      if (userType?.id === 3) {
        const group_ = await this.prisma.group?.findFirst({
          where: {
            account_manage: {
              some: {
                account_id: Number(userId)
              }
            }
          },
          include:{
            shipper_contract_point:{
              include:{
                contract_point:{
                  include:{
                    nomination_point_list:{
                      include:{
                        metering_point:true,
                      },
                    },
                  }
                }
              },
            },
          },
        })
        group_id = group_?.id
      }
    }
    // const contractCode = await this.prisma.contract_code.findMany({})
    const contractCode =
      await this.prisma.contract_code.findMany(
        {
          where: {
            ...(group_id && {
              group_id: group_id
            })
          },
          include: {
            group: true
          }
        }
      )
    const reserveBalancingGasContract = await this.prisma.reserve_balancing_gas_contract.findMany(
      {
        where: {
          ...(group_id && {
            group_id: group_id
          })
        },
        include: {
          group: true,
          reserve_balancing_gas_contract_detail: true
        }
      }
    )

    const formattedReserveBalancingGasContract = reserveBalancingGasContract.map(({reserve_balancing_gas_contract_detail, ...rest}) => {
      let reserveStartDate : Date | null = null
      let reserveEndDate : Date | null = null
      reserve_balancing_gas_contract_detail.map(detail => {
        if(detail.start_date){
          if(reserveStartDate){
            if(detail.start_date < reserveStartDate){
              reserveStartDate = detail.start_date
            }
          }
          else{
            reserveStartDate = detail.start_date
          }
        }
        
        if(detail.end_date){
          if(reserveEndDate){
            if(detail.end_date > reserveEndDate){
              reserveEndDate = detail.end_date
            }
          }
          else{
            reserveEndDate = detail.end_date
          }
        }
      })
      return {
        ...rest,
        contract_code: rest.res_bal_gas_contract,
        contract_start_date: reserveStartDate,
        contract_end_date: reserveEndDate
      }
    });

    return [...contractCode, ...formattedReserveBalancingGasContract]
  }

  async pureContractRefNom(payload: any, userId: any) {
    // nomination_type_id
    let group_id = null
    if (userId) {
      const userType = await this.prisma.user_type?.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(userId)
            }
          }
        }
      })
      if (userType?.id === 3) {
        const group_ = await this.prisma.group?.findFirst({
          where: {
            account_manage: {
              some: {
                account_id: Number(userId)
              }
            }
          },
          include:{
            shipper_contract_point:{
              include:{
                contract_point:{
                  include:{
                    nomination_point_list:{
                      include:{
                        metering_point:true,
                      },
                    },
                  }
                }
              },
            },
          },
        })
        group_id = group_?.id
      }
    }
    // const contractCode = await this.prisma.contract_code.findMany({})
    const contractCode =
      await this.prisma.contract_code.findMany(
        {
          where: {
            ...(group_id && {
              group_id: group_id
            }),
            query_shipper_nomination_file: {
              some: {}
            },

            
          },
          include: {
            group: true
          }
        }
      )
    const reserveBalancingGasContract = await this.prisma.reserve_balancing_gas_contract.findMany(
      {
        where: {
          ...(group_id && {
            group_id: group_id
          })
        },
        include: {
          group: true,
          reserve_balancing_gas_contract_detail: true
        }
      }
    )

    const formattedReserveBalancingGasContract = reserveBalancingGasContract.map(({reserve_balancing_gas_contract_detail, ...rest}) => {
      let reserveStartDate : Date | null = null
      let reserveEndDate : Date | null = null
      reserve_balancing_gas_contract_detail.map(detail => {
        if(detail.start_date){
          if(reserveStartDate){
            if(detail.start_date < reserveStartDate){
              reserveStartDate = detail.start_date
            }
          }
          else{
            reserveStartDate = detail.start_date
          }
        }
        
        if(detail.end_date){
          if(reserveEndDate){
            if(detail.end_date > reserveEndDate){
              reserveEndDate = detail.end_date
            }
          }
          else{
            reserveEndDate = detail.end_date
          }
        }
      })
      return {
        ...rest,
        contract_code: rest.res_bal_gas_contract,
        contract_start_date: reserveStartDate,
        contract_end_date: reserveEndDate
      }
    });

    return [...contractCode, ...formattedReserveBalancingGasContract]
  }
}
