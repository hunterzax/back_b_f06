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

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {CapacityService} from 'src/capacity/capacity.service'
import {
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)

@Injectable()
export class BulletinBoardService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  generateMonthArray(
    startDate: string,
    endDate: string,
    fixDay: number
  ): string[] {
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

    let result = []
    let current =
      starts.clone()

    while (
      current.isBefore(
        ends,
        'month'
      ) ||
      current.isSame(
        ends,
        'month'
      )
    ) {
      // กำหนดวันที่เป็น fixDay หรือวันสุดท้ายของเดือนถ้า fixDay ไม่มีในเดือนนั้น
      const dayInMonth =
        current.daysInMonth()
      const dateToAdd =
        current.date(
          Math.min(
            fixDay,
            dayInMonth
          )
        )

      // ตรวจสอบว่าหากวันของเดือนเกิน endDate แล้วให้หยุดการเพิ่มข้อมูล
      if (
        dateToAdd.isAfter(
          ends,
          'day'
        )
      )
        break

      result.push(
        dateToAdd.format(
          'DD/MM/YYYY'
        )
      )
      current = current
        .add(1, 'month')
        .startOf('month')
    }

    return result
  }

  generateDailyArray(
    startDate: string,
    endDate: string
  ): string[] {
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
    let result = []
    let current =
      starts.clone()

    while (
      current.isBefore(
        ends,
        'day'
      ) ||
      current.isSame(
        ends,
        'day'
      )
    ) {
      result.push(
        current.format(
          'DD/MM/YYYY'
        )
      )
      current = current.add(
        1,
        'day'
      ) // เพิ่มทีละวัน
    }
    return result
  }

  adjustStartDate(
    startDate: any,
    fixDay: any
  ) {
    const today = dayjs() // วันที่ปัจจุบัน
    let start = dayjs(
      startDate,
      'DD/MM/YYYY',
      true
    ) // วันที่เริ่มต้นจาก input

    // ตรวจสอบจำนวนวันในเดือนของ startDate
    const daysInMonth =
      start.daysInMonth()
    // ตรวจสอบว่า fixDay อยู่ในเดือนของ startDate หรือไม่
    if (
      fixDay <= daysInMonth
    ) {
      // ตั้งวันที่เป็น fixDay ในเดือนปัจจุบัน
      start =
        start.date(fixDay)

      // ถ้า today เกิน fixDay ให้เลื่อนไปเดือนถัดไป
      // if (today.isAfter(start)) {
      //   start = start.add(1, 'month');
      //   const nextDaysInMonth = start.daysInMonth();
      //   start = start.date(Math.min(fixDay, nextDaysInMonth));
      // }
    } else {
      // ถ้า fixDay ไม่มีในเดือนปัจจุบัน ให้เลื่อนไปวันสุดท้ายของเดือนถัดไป
      start = start.add(
        1,
        'month'
      )
      const nextDaysInMonth =
        start.daysInMonth()
      start = start.date(
        Math.min(
          fixDay,
          nextDaysInMonth
        )
      )
    }

    return start.format(
      'DD/MM/YYYY'
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
      diff = ends.diff(
        starts,
        'day'
      ) // คำนวณต่างกันเป็นจำนวนวัน
    } else if (
      file_period_mode === 2
    ) {
      diff = ends.diff(
        starts,
        'month'
      ) // คำนวณต่างกันเป็นจำนวนเดือน
    } else if (
      file_period_mode === 3
    ) {
      diff = ends.diff(
        starts,
        'year'
      ) // คำนวณต่างกันเป็นจำนวนปี
    } else {
      return false // กรณี mode ไม่ตรงกับเงื่อนไขที่กำหนด
    }

    // ตรวจสอบความแตกต่างว่าอยู่ในช่วง min และ max หรือไม่
    return (
      diff >= min &&
      diff <= max
    )
  }

  async getGroupByIdAccount(
    id: any
  ) {
    const resData =
      await this.prisma.group.findFirst(
        {
          where: {
            account_manage: {
              some: {
                account_id:
                  Number(id)
              }
            }
            // user_type_id: 3
          }
        }
      )
    if (!!!resData) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'not have group'
          // error: 'Only Shipper',
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return {
      ...resData,
      name:
        resData?.user_type_id !==
        3
          ? 'xx'
          : resData?.name,
      id_name:
        resData?.user_type_id !==
        3
          ? 'xx'
          : resData?.id_name
    }
  }

  typeOfContractNumToText(
    type: any
  ) {
    const typeOfContract =
      type === '1'
        ? 'LONG'
        : type === '2'
          ? 'MEDIUM'
          : type === '3'
            ? 'SHORT_FIRM'
            : type === '4'
              ? 'SHORT_NON_FIRM'
              : 'error type'
    return typeOfContract
  }

  checkDateRangeV2(
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
      diff =
        ends.diff(
          starts,
          'day'
        ) + 1 // คำนวณต่างกันเป็นจำนวนวัน
    } else if (
      file_period_mode === 2
    ) {
      // diff = ends.diff(starts, 'month'); // คำนวณต่างกันเป็นจำนวนเดือน
      // diff = ends.endOf('month').diff(starts.startOf('month'), 'month') + 1; // นับเดือนจากต้นเดือนถึงสิ้นเดือน
      diff =
        ends.diff(
          starts,
          'month'
        ) + 1 // นับเดือนจากต้นเดือนถึงสิ้นเดือน
    } else if (
      file_period_mode === 3
    ) {
      diff =
        ends.diff(
          starts,
          'year'
        ) + 1 // คำนวณต่างกันเป็นจำนวนปี
    } else {
      return false // กรณี mode ไม่ตรงกับเงื่อนไขที่กำหนด
    }

    // ตรวจสอบความแตกต่างว่าอยู่ในช่วง min และ max หรือไม่

    return (
      diff >= min &&
      diff <= max
    )
  }

  async createExcelTemplateNewV3(
    payload: any,
    groupInfo: any,
    userId: any
  ) {
    let {
      startDate,
      endDateDate,
      ContractCode,
      type
    } = payload
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()
    const sDate = startDate
      ? getTodayNowDDMMYYYYAdd7(
          startDate
        ).format('DD/MM/YYYY')
      : null
    const eDate = endDateDate
      ? getTodayNowDDMMYYYYAdd7(
          endDateDate
        ).format('DD/MM/YYYY')
      : null
    endDateDate = endDateDate
      ? getTodayNowDDMMYYYYAdd7(
          endDateDate
        )
          .subtract(1, 'day')
          .format(
            'DD/MM/YYYY'
          )
      : null

    const bookingTemplate =
      await this.prisma.booking_template.findFirst(
        {
          where: {
            term_type_id:
              Number(type),
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
    let checkMinMax = false

    checkMinMax =
      this.checkDateRangeV2(
        startDate,
        endDateDate,
        bookingTemplate?.file_period_mode,
        bookingTemplate?.min,
        bookingTemplate?.max
      )

    if (!checkMinMax) {
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

    let resultDate = null

    const modeDayAndMonth =
      bookingTemplate?.term_type_id ===
      4
        ? 1
        : 2 // bookingTemplate?.file_start_date_mode 1, 3 วัน | 2 เดือน แทนตัวนี้

    if (
      modeDayAndMonth === 1
    ) {
      resultDate =
        this.generateDailyArray(
          startDate,
          endDateDate
        )
    } else {
      startDate =
        this.adjustStartDate(
          startDate,
          1
        )
      resultDate =
        this.generateMonthArray(
          startDate,
          endDateDate,
          1
        )
    }

    const typeOfContract =
      this.typeOfContractNumToText(
        type
      )

    const ShipperIDName =
      groupInfo?.id_name || ''

    const capacityDailyBookingArrayMMB =
      [
        'Capacity Daily Booking (MMBTU/d)',
        ...Array(
          resultDate.length -
            1
        ).fill('')
      ]
    const maximumHourBookingMMBArray =
      [
        'Maximum Hour Booking (MMBTU/h)',
        ...Array(
          resultDate.length -
            1
        ).fill('')
      ]
    const capacityDailyBookingMMsArray =
      [
        'Capacity Daily Booking (MMscfd)',
        ...Array(
          resultDate.length -
            1
        ).fill('')
      ]
    const maximumHourBookingMMsArray =
      [
        'Maximum Hour Booking (MMscfh)',
        ...Array(
          resultDate.length -
            1
        ).fill('')
      ]

    const totalCellsInRow6 =
      5 +
      resultDate.length * 4

    const row7 = Array(
      totalCellsInRow6 - 5
    ).fill('')
    const row8 = Array(
      totalCellsInRow6 - 5
    ).fill(0)

    const capacityDailyBookingArrayMMBExit =
      [
        'Capacity Daily Booking (MMBTU/d)',
        ...Array(
          resultDate.length -
            1
        ).fill('')
      ]
    const maximumHourBookingMMBArrayExit =
      [
        'Maximum Hour Booking (MMBTU/h)',
        ...Array(
          resultDate.length -
            1
        ).fill('')
      ]

    const totalCellsInRow12 =
      5 +
      resultDate.length * 2

    const row13 = Array(
      totalCellsInRow12 - 5
    ).fill('')
    const row14 = Array(
      totalCellsInRow12 - 5
    ).fill(0)

    const data = [
      [],
      [
        'Shipper ID',
        'Type of Contract',
        'Contract Code'
      ],
      [
        ShipperIDName,
        typeOfContract,
        ContractCode
      ],
      [],
      [
        'Entry',
        'Period',
        '',
        ...capacityDailyBookingArrayMMB,
        ...maximumHourBookingMMBArray,
        ...capacityDailyBookingMMsArray,
        ...maximumHourBookingMMsArray
      ],
      [
        '',
        'From',
        'To',
        ...resultDate,
        ...resultDate,
        ...resultDate,
        ...resultDate
      ],
      ['', '', ''],
      [
        '',
        sDate,
        eDate,
        ...row7
      ],
      [
        'Sum Entry',
        '',
        '',
        ...row8
      ],
      [],
      [
        'Exit',
        'Period',
        '',
        ...capacityDailyBookingArrayMMBExit,
        ...maximumHourBookingMMBArrayExit
      ],
      [
        '',
        'From',
        'To',
        ...resultDate,
        ...resultDate
      ],
      ['', '', ''],
      [
        '',
        sDate,
        eDate,
        ...row13
      ],
      [
        'Sum Exit',
        '',
        '',
        ...row14
      ]
    ]

    // สร้าง workbook และ worksheet
    const worksheet =
      XLSX.utils.aoa_to_sheet(
        data
      ) // สร้าง sheet จาก array ของ array

    const maxCols = Math.max(
      ...data.map(
        (r) => r.length
      )
    )
    worksheet['!cols'] =
      Array.from(
        {length: maxCols},
        () => ({wch: 20})
      )

    const maxRows =
      data.length
    worksheet['!rows'] =
      Array.from(
        {length: maxRows},
        () => ({hpt: 20})
      )

    const workbook =
      XLSX.utils.book_new() // สร้าง workbook ใหม่
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      typeOfContract
    ) // เพิ่ม sheet ลงใน workbook

    // Merge cells สำหรับ header ที่มีการรวม (merge ข้ามคอลัมน์และแถว)
    worksheet['!merges'] = [
      {
        s: {r: 4, c: 0},
        e: {r: 6, c: 0}
      }, // Merge 'Entry' row header (r:4 to r:5)
      // period
      {
        s: {r: 4, c: 1},
        e: {r: 4, c: 2}
      },
      // form to
      {
        s: {r: 5, c: 1},
        e: {r: 6, c: 1}
      },
      {
        s: {r: 5, c: 2},
        e: {r: 6, c: 2}
      },
      // Entry Merge dynamic สำหรับ capacityDailyBookingArrayMMB
      {
        s: {r: 4, c: 3},
        e: {
          r: 4,
          c:
            3 +
            resultDate.length -
            1
        }
      },
      // Entry Merge dynamic สำหรับ maximumHourBookingMMBArray
      {
        s: {
          r: 4,
          c:
            3 +
            resultDate.length
        },
        e: {
          r: 4,
          c:
            3 +
            resultDate.length *
              2 -
            1
        }
      },
      // Entry Merge dynamic สำหรับ capacityDailyBookingMMsArray
      {
        s: {
          r: 4,
          c:
            3 +
            resultDate.length *
              2
        },
        e: {
          r: 4,
          c:
            3 +
            resultDate.length *
              3 -
            1
        }
      },
      // Entry Merge dynamic สำหรับ maximumHourBookingMMsArray
      {
        s: {
          r: 4,
          c:
            3 +
            resultDate.length *
              3
        },
        e: {
          r: 4,
          c:
            3 +
            resultDate.length *
              4 -
            1
        }
      },
      //------
      // Merge แถวสำหรับ "Zone" ที่รวมหลายแถว
      {
        s: {r: 10, c: 0},
        e: {r: 12, c: 0}
      }, // Merge 'Exit' row header (r:4 to r:5)
      // period
      {
        s: {r: 10, c: 1},
        e: {r: 10, c: 2}
      },
      // form to
      {
        s: {r: 11, c: 1},
        e: {r: 12, c: 1}
      },
      {
        s: {r: 11, c: 2},
        e: {r: 12, c: 2}
      },
      // Entry Merge dynamic สำหรับ capacityDailyBookingArrayMMBExit
      {
        s: {r: 10, c: 3},
        e: {
          r: 10,
          c:
            3 +
            resultDate.length -
            1
        }
      },
      // Entry Merge dynamic สำหรับ maximumHourBookingMMBArrayExit
      {
        s: {
          r: 10,
          c:
            3 +
            resultDate.length
        },
        e: {
          r: 10,
          c:
            3 +
            resultDate.length *
              2 -
            1
        }
      }
    ]

    const resultDateCount =
      resultDate.length

    for (
      let i = 0;
      i < resultDateCount * 4;
      i++
    ) {
      const startColumnIndex =
        3 + i

      worksheet[
        '!merges'
      ].push({
        s: {
          r: 5,
          c: startColumnIndex
        },
        e: {
          r: 6,
          c: startColumnIndex
        }
      })
    }
    for (
      let i = 0;
      i < resultDateCount * 2;
      i++
    ) {
      const startColumnIndex =
        3 + i

      worksheet[
        '!merges'
      ].push({
        s: {
          r: 11,
          c: startColumnIndex
        },
        e: {
          r: 12,
          c: startColumnIndex
        }
      })
    }
    Object.keys(
      worksheet
    ).forEach((cell) => {
      const rowNumber =
        parseInt(
          cell.replace(
            /[^0-9]/g,
            ''
          )
        ) // ดึงเลขแถวออกมา
      const columnLetter =
        cell.replace(
          /[0-9]/g,
          ''
        )

      if (
        worksheet[cell] &&
        typeof worksheet[
          cell
        ] === 'object' &&
        cell[0] !== '!'
      ) {
        worksheet[cell].z =
          '@' // ใช้รูปแบบ '@' เพื่อระบุว่าเป็น Text

        if (
          rowNumber === 3 ||
          rowNumber === 8 ||
          rowNumber === 14
        ) {
          worksheet[cell].s =
            {
              border: {
                top: {
                  style:
                    'thin'
                },
                left: {
                  style:
                    'thin'
                },
                bottom: {
                  style:
                    'thin'
                },
                right: {
                  style:
                    'thin'
                }
              },
              alignment: {
                horizontal:
                  'center',
                vertical:
                  'center',
                wrapText: true
              }
            }

          worksheet[cell].z =
            'General'
        } else if (
          rowNumber === 9 ||
          rowNumber === 15
        ) {
          const columnLetter =
            cell.replace(
              /[0-9]/g,
              ''
            ) // A, B, C, ...

          worksheet[cell].s =
            {
              border: {
                top: {
                  style:
                    'thin'
                },
                left: {
                  style:
                    'thin'
                },
                bottom: {
                  style:
                    'thin'
                },
                right: {
                  style:
                    'thin'
                }
              },
              alignment: {
                horizontal:
                  'center',
                vertical:
                  'center',
                wrapText: true
              },
              font: {
                bold: true
              }
            }
          if (
            columnLetter !==
            'A'
          ) {
            worksheet[
              cell
            ].z = 'General'
          }
        } else {
          worksheet[cell].s =
            {
              border: {
                top: {
                  style:
                    'thin'
                },
                left: {
                  style:
                    'thin'
                },
                bottom: {
                  style:
                    'thin'
                },
                right: {
                  style:
                    'thin'
                }
              },
              alignment: {
                horizontal:
                  'center',
                vertical:
                  'center',
                wrapText: true
              },
              font: {
                bold: true
              }
            }
        }

        const cellDate =
          worksheet[cell].v
            ? worksheet[
                cell
              ].v.toString()
            : ''
        if (
          (rowNumber === 6 ||
            rowNumber ===
              12) &&
          resultDate.includes(
            cellDate
          )
        ) {
          worksheet[cell].s =
            worksheet[cell]
              .s || {}
          worksheet[cell].s =
            {
              fill: {
                patternType:
                  'solid',
                fgColor: {
                  rgb: '92D04F'
                }
              },
              font: {
                color: {
                  rgb: 'FF0000'
                },
                bold: true
              },
              border: {
                top: {
                  style:
                    'thin'
                },
                left: {
                  style:
                    'thin'
                },
                bottom: {
                  style:
                    'thin'
                },
                right: {
                  style:
                    'thin'
                }
              },
              alignment: {
                horizontal:
                  'center',
                vertical:
                  'center',
                wrapText: true
              }
            }
        }
      }
    })

    const excelBuffer =
      XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx'
      })

    const times =
      getTodayNowAdd7().format(
        'YYYYMMDDHHmmss'
      )

    // ส่ง buffer กลับไปเพื่อให้ controller สามารถใช้งานต่อไปได้
    return {
      excelBuffer,
      typeOfContract: `${times}_${typeOfContract}`
    }
  }
}
