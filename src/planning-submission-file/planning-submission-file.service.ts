import {HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as XLSX from 'xlsx-js-style'
import * as XlsxPopulate from 'xlsx-populate'
import * as fs from 'fs'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {CapacityService} from 'src/capacity/capacity.service'
import 'dayjs/locale/th' // นำเข้า locale ภาษาไทย
import {getTodayEndAdd7, getTodayNowAdd7, getTodayNowDDMMYYYYAdd7, getTodayNowDDMMYYYYDfaultAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'
import {uploadFilsTemp} from 'src/common/utils/uploadFileIn'
import {parseToNumber} from 'src/common/utils/number.util'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

@Injectable()
export class PlanningSubmissionFileService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private readonly capacityService: CapacityService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  generateMonthArray(startDate: string, endDate: string, fixDay: number): string[] {
    const starts = startDate ? getTodayNowDDMMYYYYAdd7(startDate) : null
    const ends = endDate ? getTodayNowDDMMYYYYAdd7(endDate) : null
    let result = []
    let current = starts.clone()

    while (current.isBefore(ends, 'month') || current.isSame(ends, 'month')) {
      // กำหนดวันที่เป็น fixDay หรือวันสุดท้ายของเดือนถ้า fixDay ไม่มีในเดือนนั้น
      const dayInMonth = current.daysInMonth()
      const dateToAdd = current.date(Math.min(fixDay, dayInMonth))

      // ตรวจสอบว่าหากวันของเดือนเกิน endDate แล้วให้หยุดการเพิ่มข้อมูล
      if (dateToAdd.isAfter(ends, 'day')) break

      result.push(dateToAdd.format('DD/MM/YYYY'))
      current = current.add(1, 'month').startOf('month')
    }

    return result
  }

  generateDailyArray(startDate: string, endDate: string): string[] {
    const starts = startDate ? getTodayNowDDMMYYYYAdd7(startDate) : null
    const ends = endDate ? getTodayNowDDMMYYYYAdd7(endDate) : null
    let result = []
    let current = starts.clone()

    while (current.isBefore(ends, 'day') || current.isSame(ends, 'day')) {
      result.push(current.format('DD/MM/YYYY'))
      current = current.add(1, 'day') // เพิ่มทีละวัน
    }
    return result
  }

  adjustStartDate(startDate: any, fixDay: any) {
    const today = dayjs() // วันที่ปัจจุบัน
    let start = dayjs(startDate, 'DD/MM/YYYY', true) // วันที่เริ่มต้นจาก input

    // ตรวจสอบจำนวนวันในเดือนของ startDate
    const daysInMonth = start.daysInMonth()
    // ตรวจสอบว่า fixDay อยู่ในเดือนของ startDate หรือไม่
    if (fixDay <= daysInMonth) {
      // ตั้งวันที่เป็น fixDay ในเดือนปัจจุบัน
      start = start.date(fixDay)

      // ถ้า today เกิน fixDay ให้เลื่อนไปเดือนถัดไป
      // if (today.isAfter(start)) {
      //   start = start.add(1, 'month');
      //   const nextDaysInMonth = start.daysInMonth();
      //   start = start.date(Math.min(fixDay, nextDaysInMonth));
      // }
    } else {
      // ถ้า fixDay ไม่มีในเดือนปัจจุบัน ให้เลื่อนไปวันสุดท้ายของเดือนถัดไป
      start = start.add(1, 'month')
      const nextDaysInMonth = start.daysInMonth()
      start = start.date(Math.min(fixDay, nextDaysInMonth))
    }

    return start.format('DD/MM/YYYY')
  }

  checkDateRange(startDate: string, endDate: string, file_period_mode: number, min: number, max: number): boolean {
    const starts = startDate ? getTodayNowDDMMYYYYAdd7(startDate) : null
    const ends = endDate ? getTodayNowDDMMYYYYAdd7(endDate) : null

    let diff

    // คำนวณความแตกต่างตามโหมดที่กำหนด
    if (file_period_mode === 1) {
      diff = ends.diff(starts, 'day') // คำนวณต่างกันเป็นจำนวนวัน
    } else if (file_period_mode === 2) {
      diff = ends.diff(starts, 'month') // คำนวณต่างกันเป็นจำนวนเดือน
    } else if (file_period_mode === 3) {
      diff = ends.diff(starts, 'year') // คำนวณต่างกันเป็นจำนวนปี
    } else {
      return false // กรณี mode ไม่ตรงกับเงื่อนไขที่กำหนด
    }

    // ตรวจสอบความแตกต่างว่าอยู่ในช่วง min และ max หรือไม่
    return diff >= min && diff <= max
  }

  generateDatesLong(sDate: string) {
    const startDate = dayjs(sDate, 'DD/MM/YYYY')
    const result: string[] = []

    // เพิ่มวันที่เป็นรายเดือนใน 5 ปีแรก
    for (let i = 0; i < 5 * 12; i++) {
      // 5 ปี = 60 เดือน
      result.push(startDate.add(i, 'month').format('DD/MM/YYYY'))
    }

    // เพิ่มปีในช่วงถัดไป (จากปี 6 ถึงปี 20)
    for (let i = 0; i <= 14; i++) {
      result.push(
        startDate
          .add(5 + i, 'year')
          .year()
          .toString()
      )
    }

    return result
  }

  generateDatesMedium(sDate: string) {
    const startDate = dayjs(sDate, 'DD/MM/YYYY')
    const result: string[] = []

    // เพิ่มวันที่เป็นรายเดือนใน 2 ปี
    for (let i = 0; i < 2 * 12; i++) {
      // 2 ปี = 24 เดือน
      result.push(startDate.add(i, 'month').format('DD/MM/YYYY'))
    }

    return result
  }

  generateDatesShort(sDate: string) {
    const startDate = dayjs(sDate, 'DD/MM/YYYY')
    const result: string[] = []

    // เพิ่มวันที่เป็นรายวันใน 4 เดือน
    const endDate = startDate.add(4, 'month') // เพิ่มเวลา 4 เดือน

    let currentDate = startDate
    while (currentDate.isBefore(endDate)) {
      result.push(currentDate.format('DD/MM/YYYY'))
      currentDate = currentDate.add(1, 'day') // เพิ่มวันทีละวัน
    }

    return result
  }

  columnIndexToLetter(index) {
    let letter = ''
    let tempIndex = index
    while (tempIndex >= 0) {
      letter = String.fromCharCode((tempIndex % 26) + 65) + letter
      tempIndex = Math.floor(tempIndex / 26) - 1
    }
    return letter
  }

  columnLetterToIndex(columnLetter) {
    let index = 0
    for (let i = 0; i < columnLetter.length; i++) {
      index = index * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1)
    }
    return index
  }

  // Date is NOT match.
  // Planning template date not match
  //
  async createExcelTemplate(payload: any, groupInfo: any, userId: any) {
    let {startDate, endDateDate, ContractCode, type, shipper_id} = payload

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const sDate = startDate ? getTodayNowDDMMYYYYAdd7(startDate).format('DD/MM/YYYY') : null

    const groups = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      }
    })

    const gId = !!shipper_id && shipper_id !== 'null' ? Number(shipper_id) : groups?.id
    const planningTemplate = await this.prisma.planning_file_submission_template.findFirst({
      where: {
        term_type_id: Number(type),
        group_id: Number(gId),
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ],
        planning_file_submission_template_nom: {
          some: {
            nomination_point: {
              // area:{
              AND: [
                {
                  start_date: {
                    lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: todayStart
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
              // }
            }
          }
        }
      },
      include: {
        term_type: true,
        group: true,
        planning_file_submission_template_nom: {
          include: {
            nomination_point: {
              include: {
                area: true,
                metering_point: {
                  include: {
                    customer_type: true
                  }
                },
                customer_type: true
              }
            }
          }
        }
      },
      orderBy: {
        start_date: 'desc'
      }
    })
    if (!!!planningTemplate) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'planning template Shipper not match'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const nowAt = getTodayNowAdd7()
    if (type === '1') {
      const planningDeadline = await this.prisma.planning_deadline.findFirst({
        where: {
          term_type_id: Number(type),
          AND: [
            {
              start_date: {
                lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gte: todayStart
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        }
      })

      if (!!!planningDeadline) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Date is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      // คำนวณปีและเดือนปัจจุบัน
      const nowAt = getTodayNowAdd7()
      const nowYear = nowAt.year() // ปีปัจจุบัน (เช่น 2025)
      const nowYearPlus = nowAt.year() + 1 // ปีปัจจุบัน (เช่น 2025)
      const inputYear = getTodayNowDDMMYYYYAdd7(startDate).year()

      const plusNowAt = dayjs(nowAt).add(Number(planningDeadline?.before_month), 'month')

      // inputYear + 1 <= วันปัจจุบัน + BFM ตก เอาปี
      if (Number(inputYear) <= Number(plusNowAt.year())) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Date is NOT valid based on the conditions.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    } else {
      const planningDeadline = await this.prisma.planning_deadline.findFirst({
        where: {
          term_type_id: Number(type),
          AND: [
            {
              start_date: {
                lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gte: todayStart
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        }
      })
      if (!!!planningDeadline) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Date is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const startDateObj = getTodayNowDDMMYYYYAdd7(startDate) // แปลง startDate เป็น Day.js
      const nowAtBMObj = getTodayNowAdd7(nowAt).add(Number(planningDeadline?.before_month), 'month')
      // ดึงค่าเดือนและปี
      const startYearMonth = startDateObj.format('YYYYMM') // รูปแบบ "YYYYMM"
      const nowYearMonth = nowAtBMObj.format('YYYYMM') // รูปแบบ "YYYYMM"
      const nextYearMonth = nowAtBMObj.add(1, 'month').format('YYYYMM') //   เดือนถัดไป (YYYYMM)

      const isStartDateValidM1 = startYearMonth >= nextYearMonth //   startDate ต้องอยู่เดือนถัดไปเป็นอย่างน้อย

      const isStartDateValid = startYearMonth > nowYearMonth || (startYearMonth === nowYearMonth && nowAtBMObj.date() < planningDeadline?.day) //   เช็คว่าวันปัจจุบันต้องไม่เกิน 23
      const isStartDateValid_Day = startYearMonth > nowYearMonth || (startYearMonth === nowYearMonth && nowAtBMObj.date() === planningDeadline?.day) // วันเวลา
      // const isStartDateValid = startYearMonth > nowYearMonth || (startYearMonth === nowYearMonth && nowAtBMObj.date() < 20); //   เช็คว่าวันปัจจุบันต้องไม่เกิน 23
      // const isStartDateValid_Day = startYearMonth > nowYearMonth || (startYearMonth === nowYearMonth && nowAtBMObj.date() === 20) // วันเวลา

      if (!isStartDateValid || isStartDateValidM1) {
        if (isStartDateValid_Day) {
          // วันเท่าเช็คเวลาต่อ
          const now = dayjs()
          const target = now.hour(planningDeadline?.hour).minute(planningDeadline?.minute).second(0).millisecond(0)
          const isNowAfter = now.isAfter(target)
          if (isNowAfter) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Date is NOT match.'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        } else {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Date is NOT match.'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }

    const dateArr = type === '1' ? this.generateDatesLong(sDate) : type === '2' ? this.generateDatesMedium(sDate) : type === '3' ? this.generateDatesShort(sDate) : null

    let entry = planningTemplate?.planning_file_submission_template_nom.filter((f: any) => {
      return f?.nomination_point?.entry_exit_id === 1
    })
    let exit = planningTemplate?.planning_file_submission_template_nom.filter((f: any) => {
      return f?.nomination_point?.entry_exit_id === 2
    })

    let setEntry = entry.flatMap((e: any) => {
      return [
        ['', 'Entry', e?.nomination_point?.nomination_point || '', e?.nomination_point?.customer_type?.name || '', e?.nomination_point?.area?.name || '', 'MMscfd', ...dateArr.map(() => '')],
        ['', 'Entry', e?.nomination_point?.nomination_point || '', e?.nomination_point?.customer_type?.name || '', e?.nomination_point?.area?.name || '', 'MMBtud', ...dateArr.map(() => '')]
      ]
    })
    let setExit = exit.flatMap((e: any) => {
      return [['', 'Exit', e?.nomination_point?.nomination_point || '', e?.nomination_point?.customer_type?.name || '', e?.nomination_point?.area?.name || '', 'MMBtud', ...dateArr.map(() => '')]]
    })
    // Planning template date not match

    const typeOfContract =
      type === '1'
        ? 'Long Term'
        : type === '2'
          ? 'Medium Term'
          : type === '3'
            ? 'Short Term'
            : // : type === '4'
              //   ? 'SHORT_NON_FIRM TERM'
              'error type'
    const ShipperName = groupInfo?.name || ''

    const getColumnLetter = (colIndex) => {
      let letter = ''
      while (colIndex >= 0) {
        letter = String.fromCharCode((colIndex % 26) + 65) + letter
        colIndex = Math.floor(colIndex / 26) - 1
      }
      return letter
    }
    const startColumnIndex = 6 // G = column index 6 (0-based index)

    const headerEntry = [
      null,
      'Entry',
      'Total',
      '',
      '',
      'MMBtud',
      ...dateArr.map((_, index) => {
        const colLetter = getColumnLetter(startColumnIndex + index) // หาคอลัมน์จาก index
        return {
          f: `=SUMIFS(${colLetter}$8:${colLetter}$${setEntry.length + setExit.length + 7},$F$8:$F$${setEntry.length + setExit.length + 7},$F4,$B$8:$B$${setEntry.length + setExit.length + 7},$B4)`
        } // ใช้สูตร dynamic ไล่ตาม column
      })
      // ...dateArr.map(() => { return ""}),
      // setEntry
    ] // ตัวอย่างของ header
    // =SUMIFS(G$8:G$42,$F$8:$F$42,$F4,$B$8:$B$42,$B4)
    // =SUMIFS(G$8:G$42,$F$8:$F$42,$F5,$B$8:$B$42,$B5)

    // =SUMIFS(G$7:G$108,$F$7:$F$108,$F3,$B$7:$B$108,$B3)
    // =SUMIFS(G$7:G$108,$F$7:$F$108,$F4,$B$7:$B$108,$B4)
    const headerExit = [
      null,
      'Exit',
      'Total',
      '',
      '',
      'MMBtud',
      // ...dateArr.map(() => ''),
      ...dateArr.map((_, index) => {
        const colLetter = getColumnLetter(startColumnIndex + index) // หาคอลัมน์จาก index
        return {
          f: `=SUMIFS(${colLetter}$8:${colLetter}$${setEntry.length + setExit.length + 7},$F$8:$F$${setEntry.length + setExit.length + 7},$F5,$B$8:$B$${setEntry.length + setExit.length + 7},$B5)`
        } // ใช้สูตร dynamic ไล่ตาม column
      })
    ] // ตัวอย่างของ header
    const headDate = [
      null,
      null,
      null,
      null,
      null,
      null,
      // ...dateArr.map((_, index) => ({ f: `=G4=G5` })),
      ...dateArr.map((_, index) => {
        const colLetter = getColumnLetter(startColumnIndex + index) // หาคอลัมน์จาก index
        return {
          f: `=${colLetter}4=${colLetter}5`
        } // ใช้สูตร dynamic ไล่ตาม column
      })
    ]
    const headTitle = ['New Point', 'Point Type', 'Nomination Point', 'Customer Type', 'Area', 'Unit', ...dateArr]

    // 1 ปี
    // 2, 3 เดือน
    const titleDateStart = type === '1' ? dayjs(sDate, 'DD/MM/YYYY').format('YYYY') : dayjs(sDate, 'DD/MM/YYYY').locale('th').format('MMM YYYY')
    const titleDateEnd = type === '1' ? dayjs(sDate, 'DD/MM/YYYY').add(19, 'year').format('YYYY') : type === '2' ? dayjs(sDate, 'DD/MM/YYYY').add(23, 'month').locale('th').format('MMM YYYY') : dayjs(sDate, 'DD/MM/YYYY').add(3, 'month').locale('th').format('MMM YYYY')
    const textType = type === '1' ? 'ยาว' : type === '2' ? 'กลาง' : 'สั้น'
    const textDate = type === '1' ? 'ปี' : 'เดือน'
    const sheetNameLT = ['ค่าต่ำสุด Planning 20 ปี (LT)', 'ค่าปกติ Planning 20 ปี (LT)', 'ค่าสูงสุด Planning 20 ปี (LT)']
    const sheetNameMT = ['ค่าต่ำสุด Planning 2 ปี (MT)', 'ค่าปกติ Planning 2 ปี (MT)', 'ค่าสูงสุด Planning 2 ปี (MT)']
    const sheetNameST = ['ค่าต่ำสุด Planning 4 เดือน (ST)', 'ค่าปกติ Planning 4 เดือน (ST)', 'ค่าสูงสุด Planning 4 เดือน (ST)']
    const data = [
      [], // Row 0
      [`แผนความต้องการใช้ระบบส่งก๊าซระยะ${textType} ค่าต่ำ ${textDate} ${titleDateStart}-${titleDateEnd}`], // Row 1
      ['Planning Plan', typeOfContract], // Row 2
      headerEntry,
      headerExit,
      headDate,
      headTitle,
      ...setEntry,
      ...setExit
    ]
    const data2 = [
      [], // Row 0
      [`แผนความต้องการใช้ระบบส่งก๊าซระยะ${textType} ค่าปกติ ${textDate} ${titleDateStart}-${titleDateEnd}`], // Row 1
      ['Planning Plan', typeOfContract], // Row 2
      headerEntry,
      headerExit,
      headDate,
      headTitle,
      ...setEntry,
      ...setExit
    ]
    const data3 = [
      [], // Row 0
      [`แผนความต้องการใช้ระบบส่งก๊าซระยะ${textType} ค่าสูง ${textDate} ${titleDateStart}-${titleDateEnd}`], // Row 1
      ['Planning Plan', typeOfContract], // Row 2
      headerEntry,
      headerExit,
      headDate,
      headTitle,
      ...setEntry,
      ...setExit
    ]

    // สร้าง workbook และ worksheet
    const workbook = XLSX.utils.book_new() // สร้าง workbook ใหม่
    const worksheet = XLSX.utils.aoa_to_sheet(data) // สร้าง sheet จาก array ของ array
    const worksheet2 = XLSX.utils.aoa_to_sheet(data2) // สร้าง sheet จาก array ของ array
    const worksheet3 = XLSX.utils.aoa_to_sheet(data3) // สร้าง sheet จาก array ของ array
    XLSX.utils.book_append_sheet(workbook, worksheet, type === '1' ? sheetNameLT[0] : type === '2' ? sheetNameMT[0] : type === '3' ? sheetNameST[0] : '-') // เพิ่ม sheet ลงใน workbook
    XLSX.utils.book_append_sheet(workbook, worksheet2, type === '1' ? sheetNameLT[1] : type === '2' ? sheetNameMT[1] : type === '3' ? sheetNameST[1] : '-') // เพิ่ม sheet ลงใน workbook
    XLSX.utils.book_append_sheet(workbook, worksheet3, type === '1' ? sheetNameLT[2] : type === '2' ? sheetNameMT[2] : type === '3' ? sheetNameST[2] : '-') // เพิ่ม sheet ลงใน workbook

    const lastColumnIndex = headDate.length - 1 // ดัชนีของคอลัมน์สุดท้าย
    const lastColumnLetter = this.columnIndexToLetter(lastColumnIndex) // ฟังก์ชันแปลงดัชนีเป็นชื่อคอลัมน์

    worksheet['!merges'] = worksheet['!merges'] || [] // ตรวจสอบว่ามีการตั้งค่า merge หรือยัง
    worksheet['!merges'].push({
      s: {r: 1, c: 0}, // เริ่มที่แถว 2 (index 1) คอลัมน์ A (index 0)
      e: {r: 1, c: 18} // สิ้นสุดที่แถว 2 (index 1) คอลัมน์ Q (index 16)
    })
    worksheet2['!merges'] = worksheet2['!merges'] || [] // ตรวจสอบว่ามีการตั้งค่า merge หรือยัง
    worksheet2['!merges'].push({
      s: {r: 1, c: 0}, // เริ่มที่แถว 2 (index 1) คอลัมน์ A (index 0)
      e: {r: 1, c: 18} // สิ้นสุดที่แถว 2 (index 1) คอลัมน์ Q (index 16)
    })
    worksheet3['!merges'] = worksheet3['!merges'] || [] // ตรวจสอบว่ามีการตั้งค่า merge หรือยัง
    worksheet3['!merges'].push({
      s: {r: 1, c: 0}, // เริ่มที่แถว 2 (index 1) คอลัมน์ A (index 0)
      e: {r: 1, c: 18} // สิ้นสุดที่แถว 2 (index 1) คอลัมน์ Q (index 16)
    })

    // // 🔹 กำหนดความสูงแถว
    // worksheet['!rows'] = worksheet['!rows'] || [];
    // worksheet['!rows'][1] = { hpt: 100 }; // กำหนดความสูงของแถวที่ 2 เป็น 80pt

    Object.keys(worksheet).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')) // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '')
      const columnLetterIndex = this.columnLetterToIndex(columnLetter) // แปลงคอลัมน์เป็นดัชนี
      const lastColumnIndex = this.columnLetterToIndex(lastColumnLetter) // แปลงคอลัมน์สุดท้ายเป็นดัชนี

      if (worksheet[cell] && typeof worksheet[cell] === 'object' && cell[0] !== '!') {
        worksheet[cell].z = '@' // ใช้รูปแบบ '@' เพื่อระบุว่าเป็น Text
        worksheet[cell].s = worksheet[cell].s || {} // สร้าง object s ถ้ายังไม่มี

        // //   ถ้ามีสูตร `f` ไม่ต้องกำหนด `t = "n"`
        // if (worksheet[cell].f) {
        //   worksheet[cell].z = "0.00";  // ให้ Excel แสดงผลเป็นตัวเลข 2 ตำแหน่งทศนิยม
        // }
        // //   ถ้าไม่มีสูตรแต่เป็นตัวเลข ต้องกำหนด `t = "n"`
        // else if (
        //   (rowNumber === 4 || rowNumber === 5) &&
        //   columnLetterIndex >= this.columnLetterToIndex('G') &&
        //   worksheet[cell].v !== undefined &&
        //   worksheet[cell].v !== null
        // ) {
        //   worksheet[cell].v = Number(worksheet[cell].v);
        //   worksheet[cell].t = "n";
        //   worksheet[cell].z = "0.00";
        // }

        //   **ทำเฉพาะ Row 4 และ 5 เท่านั้น**
        // if (
        //   (rowNumber === 4 || rowNumber === 5) &&
        //   columnLetterIndex >= this.columnLetterToIndex('G')
        // ) {
        //   //   ถ้าไม่มีสูตร (`f`) แต่มีค่า (`v`) ให้เป็น Number
        //   if (!worksheet[cell].f && worksheet[cell].v !== undefined && worksheet[cell].v !== null) {
        //     worksheet[cell].v = Number(worksheet[cell].v);
        //     worksheet[cell].t = "n";
        //     worksheet[cell].z = "0.00"; // แสดงผลเป็นเลข 2 ตำแหน่งทศนิยม
        //   }
        // }

        // การเพิ่มการจัดตำแหน่ง (alignment)
        worksheet[cell].s.alignment = {
          wrapText: true, // การตัดข้อความหากข้อความยาว
          indent: 2 // การเยื้องข้อความเล็กน้อย (เพิ่ม space ด้านซ้าย)
        }

        // กำหนดสไตล์ให้กับเซลล์ A2 (เพราะเป็นจุดเริ่มของ Merge)
        if (rowNumber === 2) {
          worksheet['A2'].s = {
            alignment: {
              horizontal: 'left', // จัดข้อความกลางแนวนอน
              vertical: 'center' // จัดข้อความกลางแนวตั้ง
            },
            font: {
              bold: true, // ทำให้ตัวหนังสือหนา
              sz: 36, // ขนาดตัวอักษร (14px)
              color: {
                rgb: '000000'
              } // สีตัวอักษร (สีขาว)
            },
            fill: {
              patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
              fgColor: {
                rgb: 'FEFF00'
              } // สีพื้นหลัง (เทาเข้ม #FEFF00)
            }
          }
        }

        if (rowNumber >= 2) {
          // เพิ่มความสูงให้กับทุกแถวตั้งแต่แถวที่ 1 เป็นต้นไป
          worksheet['!rows'] = worksheet['!rows'] || []
          worksheet['!rows'][rowNumber - 1] = {hpt: 30} // ความสูงแถว (เปลี่ยนค่าตามต้องการ)
        }

        // 🔹 กำหนดความสูงแถว
        worksheet['!rows'] = worksheet['!rows'] || []
        worksheet['!rows'][1] = {hpt: 60} // กำหนดความสูงของแถวที่ 2 เป็น 80pt

        if (columnLetter === 'A' || columnLetter === 'B' || columnLetter === 'C' || columnLetter === 'D' || columnLetter === 'E' || columnLetter === 'F') {
          worksheet['!cols'] = worksheet['!cols'] || []
          worksheet['!cols'][0] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet['!cols'][1] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet['!cols'][2] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet['!cols'][3] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet['!cols'][4] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet['!cols'][5] = {wch: 20} // ความกว้างของคอลัมน์ A
        }

        if (rowNumber === 3 || rowNumber === 4 || rowNumber === 5 || rowNumber === 6) {
          worksheet[cell].s = {
            border: {
              top: {
                style: 'thin'
              },
              left: {
                style: 'thin'
              },
              bottom: {
                style: 'thin'
              },
              right: {
                style: 'thin'
              }
            },
            alignment: {
              horizontal: 'center', // จัดกลางแนวนอน
              vertical: 'center' // จัดกลางแนวตั้ง
            },
            font: {
              bold: true // ทำให้ข้อความในเซลล์เป็นตัวหนา
            }
          }
        }

        if (rowNumber === 7 + setEntry.length || rowNumber === 7 + setEntry.length + setExit.length) {
          worksheet[cell].s = worksheet[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
          worksheet[cell].s.border = worksheet[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
          worksheet[cell].s.border.bottom = {style: 'thin'}
        }

        if (rowNumber >= 7 && rowNumber <= 7 + (setEntry.length + setExit.length)) {
          if (['A', 'B', 'F'].includes(columnLetter)) {
            worksheet[cell].s = worksheet[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
            worksheet[cell].s.border = worksheet[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
            worksheet[cell].s.border.right = {style: 'thin'} // เพิ่มขอบขวาแบบ thin
          }

          //   ตั้งแต่ G ขึ้นไป ให้เป็นตัวเลข
          if (rowNumber > 7 && columnLetterIndex >= this.columnLetterToIndex('G')) {
            // if (worksheet[cell].v !== undefined && worksheet[cell].v !== null) {
            //   worksheet[cell].v = !!Number(worksheet[cell].v) ? Math.round(Number(worksheet[cell].v)) : worksheet[cell].v; // 🔹 บังคับให้เก็บเป็นจำนวนเต็ม

            // }
            worksheet[cell].t = 'n' // บอก Excel ว่านี่คือตัวเลข
            worksheet[cell].z = 'General' // ตั้งค่าการแสดงผล
            // worksheet[cell].z = "0";  // ตั้งค่าการแสดงผลเป็นตัวเลขจำนวนเต็ม
            // worksheet[cell].z = "0.00";  // ตั้งค่าการแสดงผลเป็นตัวเลขทศนิยม 2
          }

          // เพิ่มขอบขวาสำหรับคอลัมน์สุดท้าย (ที่คำนวณได้จาก header)
          if (columnLetter === lastColumnLetter) {
            worksheet[cell].s = worksheet[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
            worksheet[cell].s.border = worksheet[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
            worksheet[cell].s.border.right = {style: 'thin'} // เพิ่มขอบขวาสำหรับคอลัมน์สุดท้าย
          }

          worksheet[cell].s.alignment = {
            horizontal: 'center', // จัดกลางแนวนอน
            vertical: 'center' // จัดกลางแนวตั้ง
          }

          // เพิ่ม
        }

        if (rowNumber === 3 && ['B'].includes(columnLetter)) {
          worksheet[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: 'FEFF00'
            } // สีพื้นหลัง #FEFF00
          }

          worksheet[cell].s.font = {
            bold: true // ทำให้ข้อความตัวหนา
          }
        }

        if (rowNumber === 7 && ['A', 'B', 'C', 'D', 'E', 'F'].includes(columnLetter)) {
          worksheet[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: '44546A'
            } // สีพื้นหลัง #44546A
          }

          worksheet[cell].s.font = {
            color: {
              rgb: 'FFFFFF'
            }, // สีข้อความเป็นสีขาว (#FFFFFF)
            bold: true // ทำให้ข้อความตัวหนา
          }
        } else if (rowNumber === 7 && columnLetterIndex >= this.columnLetterToIndex('G') && columnLetterIndex <= lastColumnIndex) {
          worksheet[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: 'FEFF00'
            } // สีพื้นหลัง #FEFF00 (สีเหลือง)
          }

          worksheet[cell].s.font = {
            color: {
              rgb: '000000'
            }, // สีข้อความเป็นสีดำ (#000000)
            bold: true // ทำให้ข้อความตัวหนา
          }
        }

        // if (
        //   rowNumber === 6 &&
        //   columnLetterIndex >= this.columnLetterToIndex('G') &&
        //   columnLetterIndex <= lastColumnIndex
        // ) {
        //   worksheet[cell].s.fill = {
        //     patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
        //     fgColor: { rgb: 'C6EFCE' }, // สีพื้นหลัง #C6EFCE (สีเหลือง)
        //   };

        //   worksheet[cell].s.font = {
        //     color: { rgb: '277D27' }, // สีข้อความเป็นสีดำ (#277D27)
        //     bold: true, // ทำให้ข้อความตัวหนา
        //   };
        // }

        if (rowNumber > 7 && columnLetter == 'C') {
          worksheet[cell].s.alignment.horizontal = 'left' // จัดข้อความชิดซ้าย
          worksheet[cell].s.alignment.vertical = 'center' // จัดกลางแนวตั้ง
        }
      }

      //   เช็คว่าอยู่ที่ C4 หรือ C5
      if (columnLetter === 'C' && (rowNumber === 4 || rowNumber === 5)) {
        worksheet[cell].s.alignment = {
          horizontal: 'left', //   จัดข้อความชิดซ้าย
          vertical: 'center' //   จัดกลางแนวตั้ง
        }
      }
    })

    Object.keys(worksheet2).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')) // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '')
      const columnLetterIndex = this.columnLetterToIndex(columnLetter) // แปลงคอลัมน์เป็นดัชนี
      const lastColumnIndex = this.columnLetterToIndex(lastColumnLetter) // แปลงคอลัมน์สุดท้ายเป็นดัชนี

      if (worksheet2[cell] && typeof worksheet2[cell] === 'object' && cell[0] !== '!') {
        worksheet2[cell].z = '@' // ใช้รูปแบบ '@' เพื่อระบุว่าเป็น Text
        worksheet2[cell].s = worksheet2[cell].s || {} // สร้าง object s ถ้ายังไม่มี
        // การเพิ่มการจัดตำแหน่ง (alignment)
        worksheet2[cell].s.alignment = {
          wrapText: true, // การตัดข้อความหากข้อความยาว
          indent: 2 // การเยื้องข้อความเล็กน้อย (เพิ่ม space ด้านซ้าย)
        }

        // กำหนดสไตล์ให้กับเซลล์ A2 (เพราะเป็นจุดเริ่มของ Merge)
        if (rowNumber === 2) {
          worksheet2['A2'].s = {
            alignment: {
              horizontal: 'left', // จัดข้อความกลางแนวนอน
              vertical: 'center' // จัดข้อความกลางแนวตั้ง
            },
            font: {
              bold: true, // ทำให้ตัวหนังสือหนา
              sz: 36, // ขนาดตัวอักษร (14px)
              color: {
                rgb: '000000'
              } // สีตัวอักษร (สีขาว)
            },
            fill: {
              patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
              fgColor: {
                rgb: 'FEFF00'
              } // สีพื้นหลัง (เทาเข้ม #FEFF00)
            }
          }
        }

        if (rowNumber >= 2) {
          // เพิ่มความสูงให้กับทุกแถวตั้งแต่แถวที่ 1 เป็นต้นไป
          worksheet2['!rows'] = worksheet2['!rows'] || []
          worksheet2['!rows'][rowNumber - 1] = {hpt: 30} // ความสูงแถว (เปลี่ยนค่าตามต้องการ)
        }

        // 🔹 กำหนดความสูงแถว
        worksheet2['!rows'] = worksheet2['!rows'] || []
        worksheet2['!rows'][1] = {hpt: 60} // กำหนดความสูงของแถวที่ 2 เป็น 80pt

        if (columnLetter === 'A' || columnLetter === 'B' || columnLetter === 'C' || columnLetter === 'D' || columnLetter === 'E' || columnLetter === 'F') {
          worksheet2['!cols'] = worksheet2['!cols'] || []
          worksheet2['!cols'][0] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet2['!cols'][1] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet2['!cols'][2] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet2['!cols'][3] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet2['!cols'][4] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet2['!cols'][5] = {wch: 20} // ความกว้างของคอลัมน์ A
        }

        if (rowNumber === 3 || rowNumber === 4 || rowNumber === 5 || rowNumber === 6) {
          worksheet2[cell].s = {
            border: {
              top: {
                style: 'thin'
              },
              left: {
                style: 'thin'
              },
              bottom: {
                style: 'thin'
              },
              right: {
                style: 'thin'
              }
            },
            alignment: {
              horizontal: 'center', // จัดกลางแนวนอน
              vertical: 'center' // จัดกลางแนวตั้ง
            },
            font: {
              bold: true // ทำให้ข้อความในเซลล์เป็นตัวหนา
            }
          }
        }

        // ['C'].forEach((col) => {
        //   const cell = `${col}${7}`;
        //   worksheet2[cell].s = {
        //     border: {
        //       top: { style: 'thin' },
        //       left: { style: 'thin' },
        //       bottom: { style: 'thin' },
        //       right: { style: 'thin' },
        //     },
        //     alignment: {
        //       horizontal: 'left', // จัดข้อความชิดซ้าย
        //       vertical: 'center', // จัดกลางแนวตั้ง
        //     },
        //     font: {
        //       bold: true, // ทำให้ตัวหนังสือหนา
        //     },
        //   };
        //   worksheet2[cell].s.fill = {
        //     patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
        //     fgColor: { rgb: '44546A' }, // สีพื้นหลัง #44546A
        //   };

        //   worksheet2[cell].s.font = {
        //     color: { rgb: 'FFFFFF' }, // สีข้อความเป็นสีขาว (#FFFFFF)
        //     bold: true, // ทำให้ข้อความตัวหนา
        //   };
        // });

        if (rowNumber === 7 + setEntry.length || rowNumber === 7 + setEntry.length + setExit.length) {
          worksheet2[cell].s = worksheet2[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
          worksheet2[cell].s.border = worksheet2[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
          worksheet2[cell].s.border.bottom = {style: 'thin'}
        }

        if (rowNumber >= 7 && rowNumber <= 7 + (setEntry.length + setExit.length)) {
          if (['A', 'B', 'F'].includes(columnLetter)) {
            worksheet2[cell].s = worksheet2[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
            worksheet2[cell].s.border = worksheet2[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
            worksheet2[cell].s.border.right = {style: 'thin'} // เพิ่มขอบขวาแบบ thin
          }

          //   ตั้งแต่ G ขึ้นไป ให้เป็นตัวเลข
          if (rowNumber > 7 && columnLetterIndex >= this.columnLetterToIndex('G')) {
            // if (worksheet2[cell].v !== undefined && worksheet2[cell].v !== null) {
            //   worksheet2[cell].v = Number(worksheet2[cell].v).toFixed(0); // 🔹 บังคับให้เก็บค่าจริงเป็น 0 ตำแหน่ง
            // }
            worksheet2[cell].t = 'n' // บอก Excel ว่านี่คือตัวเลข
            worksheet2[cell].z = 'General' // ตั้งค่าการแสดงผล
            // worksheet2[cell].z = "0";  // ตั้งค่าการแสดงผลเป็นตัวเลขจำนวนเต็ม
          }

          // เพิ่มขอบขวาสำหรับคอลัมน์สุดท้าย (ที่คำนวณได้จาก header)
          if (columnLetter === lastColumnLetter) {
            worksheet2[cell].s = worksheet2[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
            worksheet2[cell].s.border = worksheet2[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
            worksheet2[cell].s.border.right = {style: 'thin'} // เพิ่มขอบขวาสำหรับคอลัมน์สุดท้าย
          }

          worksheet2[cell].s.alignment = {
            horizontal: 'center', // จัดกลางแนวนอน
            vertical: 'center' // จัดกลางแนวตั้ง
          }
        }

        if (rowNumber === 3 && ['B'].includes(columnLetter)) {
          worksheet2[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: 'FEFF00'
            } // สีพื้นหลัง #FEFF00
          }

          worksheet2[cell].s.font = {
            bold: true // ทำให้ข้อความตัวหนา
          }
        }

        if (rowNumber === 7 && ['A', 'B', 'C', 'D', 'E', 'F'].includes(columnLetter)) {
          worksheet2[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: '44546A'
            } // สีพื้นหลัง #44546A
          }

          worksheet2[cell].s.font = {
            color: {
              rgb: 'FFFFFF'
            }, // สีข้อความเป็นสีขาว (#FFFFFF)
            bold: true // ทำให้ข้อความตัวหนา
          }
        } else if (rowNumber === 7 && columnLetterIndex >= this.columnLetterToIndex('G') && columnLetterIndex <= lastColumnIndex) {
          worksheet2[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: 'FEFF00'
            } // สีพื้นหลัง #FEFF00 (สีเหลือง)
          }

          worksheet2[cell].s.font = {
            color: {
              rgb: '000000'
            }, // สีข้อความเป็นสีดำ (#000000)
            bold: true // ทำให้ข้อความตัวหนา
          }
        }

        // if (
        //   rowNumber === 6 &&
        //   columnLetterIndex >= this.columnLetterToIndex('G') &&
        //   columnLetterIndex <= lastColumnIndex
        // ) {
        //   worksheet2[cell].s.fill = {
        //     patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
        //     fgColor: { rgb: 'C6EFCE' }, // สีพื้นหลัง #C6EFCE (สีเหลือง)
        //   };

        //   worksheet2[cell].s.font = {
        //     color: { rgb: '277D27' }, // สีข้อความเป็นสีดำ (#277D27)
        //     bold: true, // ทำให้ข้อความตัวหนา
        //   };
        // }

        if (rowNumber > 7 && columnLetter == 'C') {
          worksheet2[cell].s.alignment.horizontal = 'left' // จัดข้อความชิดซ้าย
          worksheet2[cell].s.alignment.vertical = 'center' // จัดกลางแนวตั้ง
        }
      }

      //   เช็คว่าอยู่ที่ C4 หรือ C5
      if (columnLetter === 'C' && (rowNumber === 4 || rowNumber === 5)) {
        worksheet2[cell].s.alignment = {
          horizontal: 'left', //   จัดข้อความชิดซ้าย
          vertical: 'center' //   จัดกลางแนวตั้ง
        }
      }
    })

    Object.keys(worksheet3).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')) // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '')
      const columnLetterIndex = this.columnLetterToIndex(columnLetter) // แปลงคอลัมน์เป็นดัชนี
      const lastColumnIndex = this.columnLetterToIndex(lastColumnLetter) // แปลงคอลัมน์สุดท้ายเป็นดัชนี

      if (worksheet3[cell] && typeof worksheet3[cell] === 'object' && cell[0] !== '!') {
        worksheet3[cell].z = '@' // ใช้รูปแบบ '@' เพื่อระบุว่าเป็น Text
        worksheet3[cell].s = worksheet3[cell].s || {} // สร้าง object s ถ้ายังไม่มี
        // การเพิ่มการจัดตำแหน่ง (alignment)
        worksheet3[cell].s.alignment = {
          wrapText: true, // การตัดข้อความหากข้อความยาว
          indent: 2 // การเยื้องข้อความเล็กน้อย (เพิ่ม space ด้านซ้าย)
        }

        // กำหนดสไตล์ให้กับเซลล์ A2 (เพราะเป็นจุดเริ่มของ Merge)
        if (rowNumber === 2) {
          worksheet3['A2'].s = {
            alignment: {
              horizontal: 'left', // จัดข้อความกลางแนวนอน
              vertical: 'center' // จัดข้อความกลางแนวตั้ง
            },
            font: {
              bold: true, // ทำให้ตัวหนังสือหนา
              sz: 36, // ขนาดตัวอักษร (14px)
              color: {
                rgb: '000000'
              } // สีตัวอักษร (สีขาว)
            },
            fill: {
              patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
              fgColor: {
                rgb: 'FEFF00'
              } // สีพื้นหลัง (เทาเข้ม #FEFF00)
            }
          }
        }

        if (rowNumber >= 2) {
          // เพิ่มความสูงให้กับทุกแถวตั้งแต่แถวที่ 1 เป็นต้นไป
          worksheet3['!rows'] = worksheet3['!rows'] || []
          worksheet3['!rows'][rowNumber - 1] = {hpt: 30} // ความสูงแถว (เปลี่ยนค่าตามต้องการ)
        }

        // 🔹 กำหนดความสูงแถว
        worksheet3['!rows'] = worksheet3['!rows'] || []
        worksheet3['!rows'][1] = {hpt: 60} // กำหนดความสูงของแถวที่ 2 เป็น 80pt

        if (columnLetter === 'A' || columnLetter === 'B' || columnLetter === 'C' || columnLetter === 'D' || columnLetter === 'E' || columnLetter === 'F') {
          worksheet3['!cols'] = worksheet3['!cols'] || []
          worksheet3['!cols'][0] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet3['!cols'][1] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet3['!cols'][2] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet3['!cols'][3] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet3['!cols'][4] = {wch: 20} // ความกว้างของคอลัมน์ A
          worksheet3['!cols'][5] = {wch: 20} // ความกว้างของคอลัมน์ A
        }

        if (rowNumber === 3 || rowNumber === 4 || rowNumber === 5 || rowNumber === 6) {
          worksheet3[cell].s = {
            border: {
              top: {
                style: 'thin'
              },
              left: {
                style: 'thin'
              },
              bottom: {
                style: 'thin'
              },
              right: {
                style: 'thin'
              }
            },
            alignment: {
              horizontal: 'center', // จัดกลางแนวนอน
              vertical: 'center' // จัดกลางแนวตั้ง
            },
            font: {
              bold: true // ทำให้ข้อความในเซลล์เป็นตัวหนา
            }
          }
        }

        // ['C'].forEach((col) => {
        //   const cell = `${col}${7}`;
        //   worksheet3[cell].s = {
        //     border: {
        //       top: { style: 'thin' },
        //       left: { style: 'thin' },
        //       bottom: { style: 'thin' },
        //       right: { style: 'thin' },
        //     },
        //     alignment: {
        //       horizontal: 'left', // จัดข้อความชิดซ้าย
        //       vertical: 'center', // จัดกลางแนวตั้ง
        //     },
        //     font: {
        //       bold: true, // ทำให้ตัวหนังสือหนา
        //     },
        //   };
        //   worksheet3[cell].s.fill = {
        //     patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
        //     fgColor: { rgb: '44546A' }, // สีพื้นหลัง #44546A
        //   };

        //   worksheet3[cell].s.font = {
        //     color: { rgb: 'FFFFFF' }, // สีข้อความเป็นสีขาว (#FFFFFF)
        //     bold: true, // ทำให้ข้อความตัวหนา
        //   };
        // });

        if (rowNumber === 7 + setEntry.length || rowNumber === 7 + setEntry.length + setExit.length) {
          worksheet3[cell].s = worksheet3[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
          worksheet3[cell].s.border = worksheet3[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
          worksheet3[cell].s.border.bottom = {style: 'thin'}
        }

        if (rowNumber >= 7 && rowNumber <= 7 + (setEntry.length + setExit.length)) {
          if (['A', 'B', 'F'].includes(columnLetter)) {
            worksheet3[cell].s = worksheet3[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
            worksheet3[cell].s.border = worksheet3[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
            worksheet3[cell].s.border.right = {style: 'thin'} // เพิ่มขอบขวาแบบ thin
          }

          //   ตั้งแต่ G ขึ้นไป ให้เป็นตัวเลข
          if (rowNumber > 7 && columnLetterIndex >= this.columnLetterToIndex('G')) {
            // if (worksheet3[cell].v !== undefined && worksheet3[cell].v !== null) {
            //   worksheet3[cell].v = Number(worksheet3[cell].v).toFixed(0); // 🔹 บังคับให้เก็บค่าจริงเป็น 0 ตำแหน่ง
            // }
            worksheet3[cell].t = 'n' // บอก Excel ว่านี่คือตัวเลข
            worksheet3[cell].z = 'General' // ตั้งค่าการแสดงผล
            // worksheet3[cell].z = "0";  // ตั้งค่าการแสดงผลเป็นตัวเลขจำนวนเต็ม
          }

          // เพิ่มขอบขวาสำหรับคอลัมน์สุดท้าย (ที่คำนวณได้จาก header)
          if (columnLetter === lastColumnLetter) {
            worksheet3[cell].s = worksheet3[cell].s || {} // ตรวจสอบว่าเซลล์นั้นมีการตั้งค่าก่อนหน้านี้หรือไม่
            worksheet3[cell].s.border = worksheet3[cell].s.border || {} // สร้าง object สำหรับ border ถ้าไม่มี
            worksheet3[cell].s.border.right = {style: 'thin'} // เพิ่มขอบขวาสำหรับคอลัมน์สุดท้าย
          }

          worksheet3[cell].s.alignment = {
            horizontal: 'center', // จัดกลางแนวนอน
            vertical: 'center' // จัดกลางแนวตั้ง
          }
        }

        if (rowNumber === 3 && ['B'].includes(columnLetter)) {
          worksheet3[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: 'FEFF00'
            } // สีพื้นหลัง #FEFF00
          }

          worksheet3[cell].s.font = {
            bold: true // ทำให้ข้อความตัวหนา
          }
        }

        if (rowNumber === 7 && ['A', 'B', 'C', 'D', 'E', 'F'].includes(columnLetter)) {
          worksheet3[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: '44546A'
            } // สีพื้นหลัง #44546A
          }

          worksheet3[cell].s.font = {
            color: {
              rgb: 'FFFFFF'
            }, // สีข้อความเป็นสีขาว (#FFFFFF)
            bold: true // ทำให้ข้อความตัวหนา
          }
        } else if (rowNumber === 7 && columnLetterIndex >= this.columnLetterToIndex('G') && columnLetterIndex <= lastColumnIndex) {
          worksheet3[cell].s.fill = {
            patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: 'FEFF00'
            } // สีพื้นหลัง #FEFF00 (สีเหลือง)
          }

          worksheet3[cell].s.font = {
            color: {
              rgb: '000000'
            }, // สีข้อความเป็นสีดำ (#000000)
            bold: true // ทำให้ข้อความตัวหนา
          }
        }

        // if (
        //   rowNumber === 6 &&
        //   columnLetterIndex >= this.columnLetterToIndex('G') &&
        //   columnLetterIndex <= lastColumnIndex
        // ) {
        //   worksheet3[cell].s.fill = {
        //     patternType: 'solid', // เติมสีพื้นหลังแบบทึบ
        //     fgColor: { rgb: 'C6EFCE' }, // สีพื้นหลัง #C6EFCE (สีเหลือง)
        //   };

        //   worksheet3[cell].s.font = {
        //     color: { rgb: '277D27' }, // สีข้อความเป็นสีดำ (#277D27)
        //     bold: true, // ทำให้ข้อความตัวหนา
        //   };
        // }

        if (rowNumber > 7 && columnLetter == 'C') {
          worksheet3[cell].s.alignment.horizontal = 'left' // จัดข้อความชิดซ้าย
          worksheet3[cell].s.alignment.vertical = 'center' // จัดกลางแนวตั้ง
        }
      }

      //   เช็คว่าอยู่ที่ C4 หรือ C5
      if (columnLetter === 'C' && (rowNumber === 4 || rowNumber === 5)) {
        worksheet3[cell].s.alignment = {
          horizontal: 'left', //   จัดข้อความชิดซ้าย
          vertical: 'center' //   จัดกลางแนวตั้ง
        }
      }
    })

    // เขียน workbook เป็นไฟล์ Excel (ในรูปแบบ buffer)
    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    })

    const times = getTodayNowAdd7().format('YYYYMMDDHHmmss')

    // ส่ง buffer กลับไปเพื่อให้ controller สามารถใช้งานต่อไปได้
    return {
      excelBuffer,
      typeOfContract: `${times}_${typeOfContract}`
    }
  }

  async fileQueryFileShipper(url: any, query_shipper_planning_files_id: any, userId: any) {
    return await this.prisma.query_shipper_planning_files_file.create({
      data: {
        url: url,
        query_shipper_planning_files_id: Number(query_shipper_planning_files_id),
        create_by: Number(userId),
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix()
      }
    })
  }

  async fileNewpoint(url: any, newpoint_id: any, userId: any) {
    return await this.prisma.newpoint_file.create({
      data: {
        url: url,
        newpoint_id: Number(newpoint_id),
        create_by: Number(userId),
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix()
      }
    })
  }

  findLastValidIndex(sheet: any) {
    for (let i = sheet.length - 1; i >= 6; i--) {
      if (sheet[i]['1'] === 'Entry' || sheet[i]['1'] === 'Exit') {
        return i // ตำแหน่งสุดท้ายที่เป็น Entry หรือ Exit
      }
    }
    return -1 // ถ้าไม่เจอเลย
  }

  compareSheets(sheet1: any, sheet2: any, sheet3: any) {
    const endIndex1 = this.findLastValidIndex(sheet1)
    const endIndex2 = this.findLastValidIndex(sheet2)
    const endIndex3 = this.findLastValidIndex(sheet3)

    const maxIndex = Math.max(endIndex1, endIndex2, endIndex3) // ใช้ตำแหน่งใหญ่ที่สุด

    // ถ้าไม่มี Entry หรือ Exit ในทั้ง 3 sheet
    if (maxIndex === -1) {
      return false
    }

    for (let i = 6; i <= maxIndex; i++) {
      for (let key = 0; key <= 5; key++) {
        const keyStr = key.toString()
        const val1 = sheet1[i]?.[keyStr] || ''
        const val2 = sheet2[i]?.[keyStr] || ''
        const val3 = sheet3[i]?.[keyStr] || ''

        if (val1 !== val2 || val1 !== val3) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: `Inconsistent data detected across sheets. Columns A-F must have matching information in all three sheets before uploading.`
            },
            HttpStatus.BAD_REQUEST
          )
          // return false; // ถ้าไม่เหมือนกัน return false ทันที
        }
      }
    }
    return true // ถ้าเหมือนกันทั้งหมด return true
  }

  // เทียบ total calc row
  checkValuesEntryOrExit(resultDateUse, filterMMBTU) {
    // ตรวจสอบแต่ละ key
    for (const key in resultDateUse) {
      let sum = 0 // เริ่มต้น sum ให้เป็น 0

      // ลูปผ่าน filterMMBTU เพื่อหาค่าที่ตรงกันและบวกค่า
      for (const item of filterMMBTU) {
        if (item[key] && item[key].value) {
          let valueCt = Number(item[key].value.replace(/,/g, '')) // ลบ comma และแปลงเป็นตัวเลข
          sum += valueCt // บวกค่า value
        }
      }

      let valueDt = Number(resultDateUse[key].replace(/,/g, '')) // ลบ comma และแปลงเป็นตัวเลข
      // เปรียบเทียบผลลัพธ์การบวกกับค่าใน resultDateEntryUse
      if (sum.toFixed(3) !== valueDt.toFixed(3)) {
        return true // ส่ง true หากค่าผลลัพธ์ไม่ตรงกัน
      }
    }

    return false // ถ้าทุกค่าไม่ขัดแย้งส่ง false
  }

  calculateTotalEntryOrExitTotal(updatedValueExit, resultArr, keys) {
    return resultArr.map((dayData) => {
      // คำนวณ total สำหรับ key ที่ตรงกัน
      const exitTotal = dayData.key.reduce((total, key) => {
        updatedValueExit.forEach((item) => {
          if (item[key] && item[key][keys] === dayData[keys] && item[key].value) {
            total += parseInt(item[key].value) // บวกค่า value
          }
        })
        return total
      }, 0)

      return {
        [keys]: dayData[keys],
        exitTotal: exitTotal
      }
    })
  }

  // ผสมข้อมูล
  mergeDataEntryExit(updatedValueExit, resultArr, prefix) {
    return updatedValueExit.map((item) => {
      resultArr.forEach((data) => {
        data.key.forEach((key) => {
          // if (item[key]) {
            item[key] = {
              [prefix]: data[prefix],
              value: (item[key] || item[key] == 0) ? item[key] : ''
            }
          // }
        })
      })
      return item
    })
  }

  groupPrefixDate(data, prefix) {
    const groupedByDay = Object.keys(data).reduce((acc, key) => {
      const dateValue = data[key]
      let keyDate

      keyDate = dateValue

      // ถ้ายังไม่มีปีนี้ในอาร์เรย์ acc ก็สร้างกลุ่มใหม่
      if (!acc[keyDate]) {
        acc[keyDate] = {
          [prefix]: keyDate,
          key: []
        }
      }

      // เพิ่ม key เข้าไปในกลุ่มปีที่ตรงกัน
      acc[keyDate].key.push(key)

      return acc
    }, {})

    return Object.values(groupedByDay)
  }

  areObjectsEqual(obj1, obj2) {
    // ตรวจสอบว่ามี key เท่ากันหรือไม่

    let keys1 = Object.keys(obj1)
    let keys2 = Object.keys(obj2)

    if (keys1.length !== keys2.length) {
      return true // ถ้า key ไม่เท่ากัน return false
    }

    // ตรวจสอบว่าทุก key มีค่าตรงกันหรือไม่
    for (let key of keys1) {
      if (!keys2.includes(key) || obj1[key] !== obj2[key]) {
        return true // ถ้ามี key ที่ไม่มีในอีก object หรือค่าต่างกัน return false
      }
    }

    return false // ถ้าทุกอย่างตรงกัน return true
  }

  // parseNumericStrict(e[keyValue], {
  //                     capacityKey,
  //                     dateKey,
  //                     ePointName: entryPointName,
  //                     stamp: dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm'),
  //                   })

  parseNumericStrict(v: unknown) {
    // รับ number ตรง ๆ
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `Invalid number (NaN/Infinity)`
            // error: `Invalid number (NaN/Infinity) for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          },
          HttpStatus.BAD_REQUEST
        )
      }
      return v
    }

    // รับ string ที่มี comma ได้ เช่น "1,000.000"
    if (typeof v === 'string') {
      const s = v.trim()

      const cleaned = s.replace(/,/g, '') // ตัด comma ออก
      // เคร่งครัด: อนุญาตเครื่องหมาย +/-, เลข, จุดทศนิยมครั้งเดียว
      if (!/^[-+]?\d*(\.\d+)?$/.test(cleaned)) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            // error: `Non-numeric value "${v}" for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
            error: `Non-numeric value "${v}"`
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const n = Number(cleaned)
      if (!Number.isFinite(n)) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            // error: `Invalid number "${v}" for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
            error: `Invalid number "${v}"`
          },
          HttpStatus.BAD_REQUEST
        )
      }
      return n
    }

    // ชนิดอื่น ๆ ไม่รับ
    throw new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: `Unsupported type for ${v}`
      },
      HttpStatus.BAD_REQUEST
    )
  }

  // deadline
  // planningDeadline // ปกติ
  async uploadElsx(payload: any, file: any, shipper_id: any, userId: any, startDate: any, typeS: any) {
    const {jsonDataMultiSheet, jsonData} = payload

    let warningZero = false
    const rowDataStartAt = 6
    const columnDataStartAt = 6

    // Total Entry & Total Exit equals zero.
    let newDataAll = JSON.parse(jsonDataMultiSheet)

    const sheetNameLT = ['ค่าต่ำสุด Planning 20 ปี (LT)', 'ค่าปกติ Planning 20 ปี (LT)', 'ค่าสูงสุด Planning 20 ปี (LT)']
    const sheetNameMT = ['ค่าต่ำสุด Planning 2 ปี (MT)', 'ค่าปกติ Planning 2 ปี (MT)', 'ค่าสูงสุด Planning 2 ปี (MT)']
    const sheetNameST = ['ค่าต่ำสุด Planning 4 เดือน (ST)', 'ค่าปกติ Planning 4 เดือน (ST)', 'ค่าสูงสุด Planning 4 เดือน (ST)']

    // typeS 1 l 2 m 3 s
    const useErr = typeS === '1' ? sheetNameLT : typeS === '2' ? sheetNameMT : typeS === '3' ? sheetNameST : []

    const f1 = newDataAll?.find((f: any) => f?.sheet?.includes('ค่าต่ำสุด Planning')) // https://app.clickup.com/t/9018502823/86ev16ngb
    const f2 = newDataAll?.find((f: any) => f?.sheet?.includes('ค่าปกติ Planning')) // https://app.clickup.com/t/9018502823/86ev16ngb
    const f3 = newDataAll?.find((f: any) => f?.sheet?.includes('ค่าสูงสุด Planning')) // https://app.clickup.com/t/9018502823/86ev16ngb

    let newData1 = f1?.data //sheet1 ต่ำ
    let newData = f2?.data //sheet2 ปกติ
    let newData3 = f3?.data //sheet2 สูง

    if (!!!newData1 || !!!newData || !!!newData3) {
      if (!!!newData1) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `Missing required sheet: "${useErr?.[0]}"`
          },
          HttpStatus.BAD_REQUEST
        )
      }
      if (!!!newData) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `Missing required sheet: "${useErr?.[1]}"`
          },
          HttpStatus.BAD_REQUEST
        )
      }
      if (!!!newData3) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `Missing required sheet: "${useErr?.[2]}"`
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    const numberToExcelColumn = (num: number) => {
      let col = '';
      let n = num + 1; // เพราะ Excel เริ่มที่ 1 (A=1)

      while (n > 0) {
        let rem = (n - 1) % 26;
        col = String.fromCharCode(65 + rem) + col;
        n = Math.floor((n - 1) / 26);
      }

      return col;
    };
    const validateList = newData?.reduce((acc: string[], data: any, index: number) => {
      if (index >= rowDataStartAt && !data['0'] && !data['1'] && !data['2'] && !data['3'] && !data['4'] && !data['5']) {
        // acc.push(`Missing data at row ${index + 2}`) // json ที่แปลงมาจาก excel ไม่สามารถนับบันทัดค่าว่างได้
        const result_ = Object.fromEntries(
          Object.entries(data).map(([k, v]) => [
            numberToExcelColumn(Number(k)),
            v
          ])
        );
        acc.push(`The value on column ${JSON.stringify(result_)} is out of the required range.`)
      }
      return acc
    }, [])

    if (validateList.length > 0) {
      const message = validateList.join('<br/>')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const isHasValue = newData.some((item: any, index: number) => {
      if (index >= rowDataStartAt) {
        return Object.keys(newData[index])
          .filter((key) => parseInt(key) >= columnDataStartAt)
          .some((key) => parseToNumber(newData[index][key]) != null)
      }
    })

    let newData1Name = f1?.sheet //sheet1 ค่าต่ำสุด
    let newDataName = f2?.sheet //sheet2 ค่าปกติ
    let newData3Name = f3?.sheet //sheet2 ค่าสูงสุด

    // let newData1 = newDataAll[0]?.data; //sheet1 ต่ำ
    // let newData = newDataAll[1]?.data; //sheet2 ปกติ
    // let newData3 = newDataAll[2]?.data; //sheet2 สูง

    // let newData1Name = newDataAll[0]?.sheet; //sheet1 ค่าต่ำสุด
    // let newDataName = newDataAll[1]?.sheet; //sheet2 ค่าปกติ
    // let newData3Name = newDataAll[2]?.sheet; //sheet2 ค่าสูงสุด

    // Missing required sheet: "ค่าปกติ Planning 4 เดือน (ST)"

    // const isMatchNewData1Name = newData1Name?.includes('ค่าต่ำสุด')
    // const isMatchNewDataName = newDataName?.includes('ค่าปกติ')
    // const isMatchNewData3Name = newData3Name?.includes('ค่าสูงสุด')
    // if (isMatchNewData1Name === undefined || isMatchNewDataName === undefined || isMatchNewData3Name === undefined) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Lack of some sheet'
    //     },
    //     HttpStatus.BAD_REQUEST
    //   )
    // }

    // const isEqual = this.compareSheets(newData1, newData, newData3)

    // if (!isEqual || !isMatchNewData1Name || !isMatchNewDataName || !isMatchNewData3Name) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Lack of some sheet'
    //     },
    //     HttpStatus.BAD_REQUEST
    //   )
    // }

    const type = newData[1]?.['1']
    // sheet 2 use
    let currentEntryTotal = newData[2]
    let currentExitTotal = newData[3]
    let currentDate = newData[5]
    console.log('currentDate ; ', currentDate);
    console.log('startDate ; ', startDate);

    // sheet 1
    let currentEntryTotal1 = newData1[2]
    let currentExitTotal1 = newData1[3]
    let currentDate1 = newData1[5]
    // sheet 3
    let currentEntryTotal3 = newData3[2]
    let currentExitTotal3 = newData3[3]
    let currentDate3 = newData3[5]

    const typeOfContract = type === 'Long Term' ? 1 : type === 'Medium Term' ? 2 : type === 'Short Term' ? 3 : type === 'SHORT_NON_FIRM TERM' ? 4 : null

    if (typeOfContract === 1) {
      // sheetNameLT
      const find_L = sheetNameLT?.find((f: any) => {
        return f === newData1Name
      })
      const find_M = sheetNameLT?.find((f: any) => {
        return f === newDataName
      })
      const find_H = sheetNameLT?.find((f: any) => {
        return f === newData3Name
      })
      if (!find_L || !find_M || !find_H) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Lack of some sheet'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    } else if (typeOfContract === 2) {
      // sheetNameMT
      const find_L = sheetNameMT?.find((f: any) => {
        return f === newData1Name
      })
      const find_M = sheetNameMT?.find((f: any) => {
        return f === newDataName
      })
      const find_H = sheetNameMT?.find((f: any) => {
        return f === newData3Name
      })
      if (!find_L || !find_M || !find_H) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Lack of some sheet'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    } else if (typeOfContract === 3) {
      // sheetNameST
      const find_L = sheetNameST?.find((f: any) => {
        return f === newData1Name
      })
      const find_M = sheetNameST?.find((f: any) => {
        return f === newDataName
      })
      const find_H = sheetNameST?.find((f: any) => {
        return f === newData3Name
      })

      if (!find_L || !find_M || !find_H) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Lack of some sheet'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const planningDeadline = await this.prisma.planning_deadline.findFirst({
      where: {
        term_type_id: Number(typeOfContract),
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      }
    })

    if (!!!planningDeadline) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Date is NOT match.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // sheet 2 use
    const resultDate = Object.keys(currentDate)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentDate[key]
        return obj
      }, {})
    const resultDateEntry = Object.keys(currentEntryTotal)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentEntryTotal[key]
        return obj
      }, {})
    const resultDateExit = Object.keys(currentExitTotal)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentExitTotal[key]
        return obj
      }, {})

    // sheet 1
    const resultDate1 = Object.keys(currentDate1)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentDate1[key]
        return obj
      }, {})
    const resultDateEntry1 = Object.keys(currentEntryTotal1)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentEntryTotal1[key]
        return obj
      }, {})
    const resultDateExit1 = Object.keys(currentExitTotal1)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentExitTotal1[key]
        return obj
      }, {})

    // sheet 3
    const resultDate3 = Object.keys(currentDate3)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentDate3[key]
        return obj
      }, {})
    const resultDateEntry3 = Object.keys(currentEntryTotal3)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentEntryTotal3[key]
        return obj
      }, {})
    const resultDateExit3 = Object.keys(currentExitTotal3)
      .filter((key) => parseInt(key) >= columnDataStartAt)
      .reduce((obj, key) => {
        obj[key] = currentExitTotal3[key]
        return obj
      }, {})

    const nowAt = getTodayNowAdd7().toDate()

    const nowAtBMMMYYYY = getTodayNowAdd7().add(Number(planningDeadline?.before_month), 'month').format('MM/YYYY')
    if(!dayjs(startDate, "DD/MM/YYYY").isSame(dayjs(Object.values(resultDate)?.[0] as string, "DD/MM/YYYY"), 'month')){
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          // error: 'Date is NOT match.'
          error: `The first date in the file (${Object.values(resultDate)?.[0] as string}) must be in the same month as ${startDate}.`
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // ฟังก์ชันแปลง DD/MM/YYYY เป็น dayjs
    const parseDayMonthYear = (str) => {
      const [day, month, year] = str.split('/') // แก้ให้รองรับ DD/MM/YYYY
      return dayjs(`${year}-${month}-${day}`) // ใช้รูปแบบที่ถูกต้อง
    }

    // แปลงค่าปัจจุบันเป็น dayjs (แก้ให้แยก MM และ YYYY ให้ถูกต้อง)
    const [nowMonth, nowYear] = nowAtBMMMYYYY.split('/')
    const nowDate = dayjs(`${nowYear}-${nowMonth}-01`)

    // ฟังก์ชันที่เช็คว่ามีค่าที่น้อยกว่า nowAtBMMMYYYY หรือไม่
    // startDate :  01/02/2026
    const hasOlderDate = Object.values(resultDate).some((date) => parseDayMonthYear(date).isBefore(nowDate, 'month'))
    const hasOlderDateEqa = Object.values(resultDate).some((date) => parseDayMonthYear(date).isSame(nowDate, 'month'))
  
    // console.log('Object.values(resultDate)?.[0] : ', Object.values(resultDate)?.[0]);
    // console.log('startDate : ', startDate);
    // console.log('hasOlderDate : ', hasOlderDate);
    // console.log('hasOlderDate : ', hasOlderDate);

    // planningDeadline?.day
    let checkEqu = true
    if (hasOlderDateEqa) {
      const currentDay = dayjs(nowAt).date() // ดึงวันที่ปัจจุบัน (1-31)
      const isMatch = (planningDeadline?.day ?? Infinity) <= currentDay //true ถ้า deadline <= วันที่ปัจจุบัน
      checkEqu = !isMatch
    }
    console.log('checkEqu : ', checkEqu);
    if (hasOlderDate && checkEqu) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Date is NOT match.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // const hasOlderDate = Object.values(resultDate).some((date: any) => {
    //   const fileMonth = parseDayMonthYear(date).format('YYYY-MM')
    //   const targetMonth = nowDate.format('YYYY-MM')

    //   return fileMonth < targetMonth
    // })

    // console.log('resultDate : ', resultDate)
    // console.log('nowDate : ', nowDate.format('YYYY-MM'))
    // console.log('hasOlderDate : ', hasOlderDate)

    // const hasOlderDateEqa = Object.values(resultDate).some((date: any) => {
    //   const fileMonth = parseDayMonthYear(date).format('YYYY-MM')
    //   const targetMonth = nowDate.format('YYYY-MM')

    //   return fileMonth === targetMonth
    // })

    // console.log('hasOlderDateEqa : ', hasOlderDateEqa)

    // let checkEqu = true

    // if (hasOlderDateEqa) {
    //   const currentDay = dayjs(nowAt).date()
    //   const isMatch = (planningDeadline?.day ?? Infinity) <= currentDay
    //   checkEqu = !isMatch
    // }

    // console.log('checkEqu : ', checkEqu)

    // if (hasOlderDate && checkEqu) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Date is NOT match.'
    //     },
    //     HttpStatus.BAD_REQUEST
    //   )
    // }

    // ฟังก์ชันที่เช็คว่ามีค่าที่ตรงกับ nowAtBMMMYYYY หรือไม่
    const hasExactDate = Object.values(resultDate).some((date) => parseDayMonthYear(date).isSame(nowDate, 'month'))

    if (hasExactDate) {
      const targetTimeString = `${planningDeadline?.day} ${planningDeadline?.hour}:${planningDeadline?.minute}`
      const [monthDay, time] = targetTimeString.split(' ')
      const [hour, minute] = time.split(':')
      const now = dayjs()

      // แปลงเป็น dayjs object
      const targetTime = dayjs().month(now.month()).date(parseInt(monthDay)).hour(parseInt(hour)).minute(parseInt(minute)).second(0)

      // ตรวจสอบว่าเวลาปัจจุบันเกินเป้าหมายหรือไม่
      const isPast = now.isAfter(targetTime)

      if (isPast) {
        // planning deadline
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Date is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    // sheet 2 use
    const maxDateKey = Math.max(...Object.keys(currentDate).map((key) => parseInt(key)))
    // sheet 1
    const maxDateKey1 = Math.max(...Object.keys(currentDate1).map((key) => parseInt(key)))
    // sheet 3
    const maxDateKey3 = Math.max(...Object.keys(currentDate3).map((key) => parseInt(key)))

    // sheet 2 use
    const indexStartEntrys = newData.slice(4).findIndex((item) => item['1'] === 'Entry')

    const indexStartExits = newData.slice(4).findIndex((item) => item['1'] === 'Exit')

    const indexStartEntry = indexStartEntrys !== -1 ? indexStartEntrys : 0
    const indexStartExit = indexStartExits !== -1 ? indexStartExits : 0
    let resultStartIndexEntry = indexStartEntry !== 0 ? 4 + indexStartEntry : 0
    let resultStartIndexExit = indexStartExit !== 0 ? 4 + indexStartEntry + Math.abs(indexStartExit - indexStartEntry) : 0

    const valueEntry = resultStartIndexEntry !== 0 ? newData.slice(resultStartIndexEntry, resultStartIndexExit !== 0 ? resultStartIndexExit : newData.length) : []

    const valueExit = resultStartIndexEntry !== 0 ? newData.slice(resultStartIndexExit, newData.length) : []

    const cellsFrom6 = (row: any) =>
      Array.isArray(row)
        ? row.slice(columnDataStartAt)
        : Object.keys(row)
            .filter((k) => Number(k) >= columnDataStartAt)
            .map((k) => (row as any)[k])
    let warningRowZero = false
    const ckWarningEn = (valueEntry ?? []).some((row) =>
      cellsFrom6(row).some((cell) => {
        if (cell === '0') {
          warningRowZero = true
        }
        this.parseNumericStrict(cell)

        return String(cell).trim() === '0'
      })
    )
    const ckWarningEx = (valueExit ?? []).some((row) =>
      cellsFrom6(row).some((cell) => {
        if (cell === '0') {
          warningRowZero = true
        }
        this.parseNumericStrict(cell)

        return String(cell).trim() === '0'
      })
    )

    // sheet 1
    const indexStartEntrys1 = newData1.slice(4).findIndex((item) => item['1'] === 'Entry')

    const indexStartExits1 = newData1.slice(4).findIndex((item) => item['1'] === 'Exit')

    const indexStartEntry1 = indexStartEntrys1 !== -1 ? indexStartEntrys1 : 0
    const indexStartExit1 = indexStartExits1 !== -1 ? indexStartExits1 : 0
    let resultStartIndexEntry1 = indexStartEntry1 !== 0 ? 4 + indexStartEntry1 : 0
    let resultStartIndexExit1 = indexStartExit1 !== 0 ? 4 + indexStartEntry1 + Math.abs(indexStartExit1 - indexStartEntry1) : 0

    const valueEntry1 = resultStartIndexEntry1 !== 0 ? newData1.slice(resultStartIndexEntry1, resultStartIndexExit1 !== 0 ? resultStartIndexExit1 : newData1.length) : []

    const valueExit1 = resultStartIndexEntry1 !== 0 ? newData1.slice(resultStartIndexExit1, newData1.length) : []

    // sheet 3
    const indexStartEntrys3 = newData3.slice(4).findIndex((item) => item['1'] === 'Entry')

    const indexStartExits3 = newData3.slice(4).findIndex((item) => item['1'] === 'Exit')

    const indexStartEntry3 = indexStartEntrys3 !== -1 ? indexStartEntrys3 : 0
    const indexStartExit3 = indexStartExits3 !== -1 ? indexStartExits3 : 0
    let resultStartIndexEntry3 = indexStartEntry3 !== 0 ? 4 + indexStartEntry3 : 0
    let resultStartIndexExit3 = indexStartExit3 !== 0 ? 4 + indexStartEntry3 + Math.abs(indexStartExit3 - indexStartEntry3) : 0

    const valueEntry3 = resultStartIndexEntry3 !== 0 ? newData3.slice(resultStartIndexEntry3, resultStartIndexExit3 !== 0 ? resultStartIndexExit3 : newData3.length) : []

    const valueExit3 = resultStartIndexEntry3 !== 0 ? newData3.slice(resultStartIndexExit3, newData3.length) : []

    const fillMissingKeysEntryOrExit = (data, prefix) => {
      return data.map((item, ix) => {
        for (let i = 0; i <= prefix; i++) {
          if (!item[i]) {
            // item[i] = i > 4 ? '0' : '' // เติมค่า 0 หาก key ไม่ได้มีอยู่
            item[i] = ''
          }
        }
        return item
      })
    }

    // sheet 2 use
    const updatedValueEntry = fillMissingKeysEntryOrExit(valueEntry, maxDateKey)
    const updatedValueExit = fillMissingKeysEntryOrExit(valueExit, maxDateKey)
    // sheet 1
    const updatedValueEntry1 = fillMissingKeysEntryOrExit(valueEntry1, maxDateKey1)
    const updatedValueExit1 = fillMissingKeysEntryOrExit(valueExit1, maxDateKey1)
    // sheet 3
    const updatedValueEntry3 = fillMissingKeysEntryOrExit(valueEntry3, maxDateKey3)
    const updatedValueExit3 = fillMissingKeysEntryOrExit(valueExit3, maxDateKey3)

    // ฟังก์ชันเพิ่ม key ที่ขาดไปตั้งแต่ 6 ถึง maxDateKey
    const addMissingKeysEntryOrExit = (data, mKey) => {
      for (let i = 6; i <= mKey; i++) {
        if (!data[i]) {
          data[i] = '0' // ถ้าไม่มี key นี้อยู่ในออบเจ็กต์ ให้เพิ่ม key และกำหนดค่าเป็น '0'
        }
      }
      return data
    }

    // sheet 2 use
    const resultDateEntryUse = addMissingKeysEntryOrExit(resultDateEntry, maxDateKey)
    const resultDateExitUse = addMissingKeysEntryOrExit(resultDateExit, maxDateKey)
    // sheet 1
    const resultDateEntryUse1 = addMissingKeysEntryOrExit(resultDateEntry1, maxDateKey1)
    const resultDateExitUse1 = addMissingKeysEntryOrExit(resultDateExit1, maxDateKey1)
    // sheet 3
    const resultDateEntryUse3 = addMissingKeysEntryOrExit(resultDateEntry3, maxDateKey1)
    const resultDateExitUse3 = addMissingKeysEntryOrExit(resultDateExit3, maxDateKey1)

    const hasZeroEntry = Object.values(resultDateEntryUse).some((value) => value === '0')

    const hasZeroExit = Object.values(resultDateExitUse).some((value) => value === '0')

    if (hasZeroEntry || hasZeroExit) {
      warningZero = true
    }

    // return null
    // ******************************************************

    const groupCreateFind = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      }
    })

    // https://app.clickup.com/t/86ert2k18
    // const newArrHead = Object.values(newData[4])?.slice(6); // ของเดิม BANK พี่เห็น newData[4] มันเริ่มที่ 6 อยู่แล้ว พอ slice ไปมันก็ทำให้ newArrHead.length ไม่มีทางตรงกับ dateArr.length
    const newArrHead = Object.values(newData[4]) // คมมาเยือน ถ้าผิดขออภัย
    // console.log('newData[4] : ', newData[4]);
    const sDate = startDate ? getTodayNowDDMMYYYYAdd7(startDate).format('DD/MM/YYYY') : null
    const dateArr = typeS === '1' ? this.generateDatesLong(sDate) : typeS === '2' ? this.generateDatesMedium(sDate) : typeS === '3' ? this.generateDatesShort(sDate) : null
  
    
    if (String(typeOfContract) !== typeS) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Template Date is NOT match'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    if (newArrHead.length !== dateArr.length) {
      // https://app.clickup.com/t/86ev16ngc
      let msgReturn = ''
      switch (typeS) {
        case '1': // long term
          msgReturn = 'Invalid Long Term Planning File: Please ensure the file includes 60 months of monthly data and 15 years of yearly data.'
          break
        case '2': // med term
          msgReturn = 'Invalid Medium Term Planning File: Please ensure the file includes 24 months of monthly data.'
          break
        case '3': // short term
          msgReturn = 'Invalid Short Term Planning File: Please ensure the file include 4 months of daily data.'
          break
        default:
          msgReturn = 'Invalid Planning File: Please ensure the file is valid template.'
          break
      }

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: msgReturn
          // error: 'Template Date is NOT match',
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      // const isEqual = newArrHead.every((value, index) => value === dateArr[index]); // every นี้ไม่มีทางเท่ากันอยู่แล้วเพราะ array newArrHead มีแต่ TRUE ส่วน dateArr มีแต่วันที่
      const isEqual = newArrHead.every((value) => value === 'TRUE' || value === '1')

      if (isEqual) {
      } else {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            // error: 'Template Date is NOT match',
            error: 'Total Entry & Total Exit is NOT match' // กรณีที่เคส Entry ไม่เท่ากัน Exit ระบบแสดง Error message ผิด https://app.clickup.com/t/86ev16nhd
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }
    // return

    // throw new HttpException(
    //       {
    //         status: HttpStatus.BAD_REQUEST,
    //         error: 'ok.',
    //       },
    //       HttpStatus.BAD_REQUEST,
    //     );

    if (type === 'Long Term') {
      // sheet 2 use
      const resultArr = this.groupPrefixDate(resultDate, 'year')

      const updatedDataEntry = this.mergeDataEntryExit(updatedValueEntry, resultArr, 'year')
      const updatedDataExit = this.mergeDataEntryExit(updatedValueExit, resultArr, 'year')

      const filterEntryMMBTU = updatedDataEntry.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry = this.checkValuesEntryOrExit(resultDateEntryUse, filterEntryMMBTU)
      const resultCkExit = this.checkValuesEntryOrExit(resultDateExitUse, updatedDataExit)

      const resultTotal = this.areObjectsEqual(resultDateEntryUse, resultDateExitUse)

      // Total Entry & Total Exit equals zero.

      if (resultCkEntry || resultCkExit || resultTotal) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const hasGreaterThanZero = Object.values(resultDateExitUse).some((value: any) => parseFloat(value) > 0)

      if (!hasGreaterThanZero && !isHasValue) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            // error: 'Total Entry & Total Exit equals zero.'
            error: "Upload Failed: sheet 'Normal' tab cannot be empty."
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // sheet 1
      const resultArr1 = this.groupPrefixDate(resultDate1, 'year')

      const updatedDataEntry1 = this.mergeDataEntryExit(updatedValueEntry1, resultArr1, 'year')
      const updatedDataExit1 = this.mergeDataEntryExit(updatedValueExit1, resultArr1, 'year')

      const filterEntryMMBTU1 = updatedDataEntry1.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry1 = this.checkValuesEntryOrExit(resultDateEntryUse1, filterEntryMMBTU1)
      const resultCkExit1 = this.checkValuesEntryOrExit(resultDateExitUse1, updatedDataExit1)

      const resultTotal1 = this.areObjectsEqual(resultDateEntryUse1, resultDateExitUse1)

      if (resultCkEntry1 || resultCkExit1 || resultTotal1) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // sheet 3
      const resultArr3 = this.groupPrefixDate(resultDate3, 'year')

      const updatedDataEntry3 = this.mergeDataEntryExit(updatedValueEntry3, resultArr3, 'year')
      const updatedDataExit3 = this.mergeDataEntryExit(updatedValueExit3, resultArr3, 'year')

      const filterEntryMMBTU3 = updatedDataEntry3.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry3 = this.checkValuesEntryOrExit(resultDateEntryUse3, filterEntryMMBTU3)
      const resultCkExit3 = this.checkValuesEntryOrExit(resultDateExitUse3, updatedDataExit3)

      const resultTotal3 = this.areObjectsEqual(resultDateEntryUse3, resultDateExitUse3)

      if (resultCkEntry3 || resultCkExit3 || resultTotal3) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // ------------

      const totalResultYearEntryTotal = this.calculateTotalEntryOrExitTotal(filterEntryMMBTU, resultArr, 'year')

      const totalResultYearExitTotal = this.calculateTotalEntryOrExitTotal(updatedDataExit, resultArr, 'year')

      const dataEntry = filterEntryMMBTU.map((e: any) => {
        return {
          new_point: e['0'],
          point_type: e['1'],
          nomination_point: e['2'],
          customer: e['3'],
          area: e['4'],
          unit: e['5'],
          data: JSON.stringify(e)
        }
      })
      const dataExit = updatedDataExit.map((e: any) => {
        return {
          new_point: e['0'],
          point_type: e['1'],
          nomination_point: e['2'],
          customer: e['3'],
          area: e['4'],
          unit: e['5'],
          data: JSON.stringify(e)
        }
      })

      // check text
      let newPoint = []
      for (let i = 0; i < filterEntryMMBTU.length; i++) {
        const new_point = !!filterEntryMMBTU[i]?.['0'] ? filterEntryMMBTU[i]?.['0'].toUpperCase() : ''
        const point_type = filterEntryMMBTU[i]?.['1']
        const nomination_point = filterEntryMMBTU[i]?.['2']
        const customer = filterEntryMMBTU[i]?.['3']
        const area = filterEntryMMBTU[i]?.['4']
        const unit = filterEntryMMBTU[i]?.['5']

        const entryRow = {
          new_point,
          point_type,
          nomination_point,
          customer,
          area,
          unit
        }

        if (entryRow?.new_point === 'Y') {
          // new  แบบไม่สน
          newPoint.push(entryRow)
        } else {
          const nominationPoint = await this.prisma.nomination_point.findFirst({
            where: {
              nomination_point: entryRow?.nomination_point,
              area: {
                name: entryRow?.area
              },
              entry_exit_id: 1,
              AND: [
                {
                  start_date: {
                    lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: todayStart
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
            },
            select: {
              nomination_point: true,
              area: {
                select: {
                  name: true
                }
              }
            }
          })
          if (nominationPoint) {
            // ถ้ามี เช็คตัวอื่นๆ ว่าถูกไหมไม่ถูก ไม่ให้เอาเข้าระบบ
            if (nominationPoint?.area?.name !== entryRow?.area) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'value not match'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            // ถ้าไม่มีมี new  แบบไม่สน
            newPoint.push(entryRow)
          }
        }
      }

      for (let i = 0; i < updatedDataExit.length; i++) {
        const new_point = !!updatedDataExit[i]?.['0'] ? updatedDataExit[i]?.['0'].toUpperCase() : ''
        const point_type = updatedDataExit[i]?.['1']
        const nomination_point = updatedDataExit[i]?.['2']
        const customer = updatedDataExit[i]?.['3']
        const area = updatedDataExit[i]?.['4']
        const unit = updatedDataExit[i]?.['5']
        if (point_type !== 'Exit') {
          continue
        }
        const exitRow = {
          new_point,
          point_type,
          nomination_point,
          customer,
          area,
          unit
        }

        if (exitRow?.new_point === 'Y') {
          // new  แบบไม่สน
          newPoint.push(exitRow)
        } else {
          const nominationPoint = await this.prisma.nomination_point.findFirst({
            where: {
              nomination_point: exitRow?.nomination_point,
              area: {
                name: exitRow?.area
              },
              entry_exit_id: 2,
              AND: [
                {
                  start_date: {
                    lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: todayStart
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
            },
            select: {
              nomination_point: true,
              area: {
                select: {
                  name: true
                }
              }
            }
          })
          if (nominationPoint) {
            // ถ้ามี เช็คตัวอื่นๆ ว่าถูกไหมไม่ถูก ไม่ให้เอาเข้าระบบ
            if (nominationPoint?.area?.name !== exitRow?.area) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'value not match'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            // ถ้าไม่มีมี new  แบบไม่สน
            newPoint.push(exitRow)
          }
        }
      }

      // เพิ่มปี และตั้งวันที่เป็นวันที่ 1 มกราคม
      const nextYearDate = dayjs(`${Number(resultDate[`${maxDateKey}`]) + 1}-01-01`)

      // แสดงผลในรูปแบบ "DD/MM/YYYY"
      const formattedDate = nextYearDate.format('DD/MM/YYYY')
      // type

      const fmDate = getTodayStartAdd7().toDate()

      const planningCode = await this.prisma.query_shipper_planning_files.count({
        where: {
          term_type_id: 1,
          create_date: {
            gte: todayStart, // มากกว่าหรือเท่ากับเวลาเริ่มต้นของวันนี้
            lte: todayEnd // น้อยกว่าหรือเท่ากับเวลาสิ้นสุดของวันนี้
          }
        }
      })
      const runNum = planningCode + 1
      const runNumFormate = runNum > 999 ? runNum : runNum > 99 ? '0' + runNum : runNum > 9 ? '00' + runNum : '000' + runNum

      const groupId = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              // account_id: resDataYear?.shipperId
              account_id: Number(userId)
            }
          }
        },
        select: {
          id: true
        }
      })

      const resDataYear = {
        planningCode: `${dayjs(fmDate).format('YYYYMMDD')}-LT-${runNumFormate}`,
        temp: newData,
        valueEntry: dataEntry,
        valueExit: dataExit,
        totalResultYearEntryTotal,
        totalResultYearExitTotal,
        newPoint: newPoint,
        startDate: resultDate['6'],
        endDate: formattedDate,
        shipperId: !!shipper_id ? Number(shipper_id) : groupId?.id,
        file,
        typeId: 1
      }

      const nowCre = getTodayNowAdd7()

      const createPlanningCode = await this.prisma.query_shipper_planning_files.create({
        data: {
          planning_code: resDataYear?.planningCode,
          group: {
            connect: {
              id: !!shipper_id ? Number(shipper_id) : groupId?.id
            }
          },
          term_type: {
            connect: {
              id: resDataYear?.typeId
            }
          },
          start_date: getTodayNowDDMMYYYYDfaultAdd7(resDataYear?.startDate).toDate(),
          end_date: getTodayNowDDMMYYYYDfaultAdd7(resDataYear?.endDate).toDate(),
          shipper_file_submission_date: nowCre.toDate(),
          create_date: nowCre.toDate(),
          create_date_num: nowCre.unix(),
          // create_by: Number(userId),
          create_by_account: {
            connect: {
              id: Number(userId)
            }
          }
        }
      })

      const responseUpFile = await uploadFilsTemp(file)
      await this.fileQueryFileShipper(responseUpFile?.file?.url, createPlanningCode?.id, userId)
      const pEntryExit = []
      if (resDataYear?.valueEntry.length > 0) {
        for (let i = 0; i < resDataYear?.valueEntry.length; i++) {
          pEntryExit.push({
            query_shipper_planning_files_id: createPlanningCode?.id,
            value: resDataYear?.valueEntry[i]?.data || null,
            temp_new_point: resDataYear?.valueEntry[i]?.new_point || null,
            temp_point_type: resDataYear?.valueEntry[i]?.point_type || null,
            temp_nomination_point: resDataYear?.valueEntry[i]?.nomination_point || null,
            temp_customer: resDataYear?.valueEntry[i]?.customer || null,
            temp_area: resDataYear?.valueEntry[i]?.area || null,
            temp_unit: resDataYear?.valueEntry[i]?.unit || null,
            entry_exit_id: 1,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
      }
      if (resDataYear?.valueExit.length > 0) {
        for (let i = 0; i < resDataYear?.valueExit.length; i++) {
          pEntryExit.push({
            query_shipper_planning_files_id: createPlanningCode?.id,
            value: resDataYear?.valueExit[i]?.data || null,
            temp_new_point: resDataYear?.valueExit[i]?.new_point || null,
            temp_point_type: resDataYear?.valueExit[i]?.point_type || null,
            temp_nomination_point: resDataYear?.valueExit[i]?.nomination_point || null,
            temp_customer: resDataYear?.valueExit[i]?.customer || null,
            temp_area: resDataYear?.valueExit[i]?.area || null,
            temp_unit: resDataYear?.valueExit[i]?.unit || null,
            entry_exit_id: 2,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
      }
      if (resDataYear?.valueEntry.length > 0 || resDataYear?.valueExit.length > 0) {
        await this.prisma.query_shipper_planning_files_temp_row.createMany({
          data: pEntryExit
        })
      }
      await this.prisma.query_shipper_planning_files_temp_long.create({
        data: {
          query_shipper_planning_files_id: Number(createPlanningCode?.id),
          temp_full: JSON.stringify(resDataYear?.temp),
          temp_total_entry: JSON.stringify(resDataYear?.totalResultYearEntryTotal),
          temp_total_exit: JSON.stringify(resDataYear?.totalResultYearExitTotal),
          create_by: Number(userId),
          create_date: nowCre.toDate(),
          create_date_num: nowCre.unix()
        }
      })
      // dateArr
      if (resDataYear?.newPoint.length > 0) {
        const newpointData = await this.prisma.newpoint.create({
          data: {
            planning_code: resDataYear?.planningCode,
            group: {
              connect: {
                // id: groupId?.id,
                // id: groupCreateFind?.id,
                id: !!shipper_id ? Number(shipper_id) : groupId?.id
              }
            },
            query_shipper_planning_files: {
              connect: {
                id: createPlanningCode?.id
              }
            },
            term_type: {
              connect: {
                id: resDataYear?.typeId
              }
            },
            start_date: getTodayNowDDMMYYYYDfaultAdd7(resDataYear?.startDate).toDate(),
            end_date: getTodayNowDDMMYYYYDfaultAdd7(resDataYear?.endDate).toDate(),
            shipper_file_submission_date: nowCre.toDate(),
            // create_by: Number(userId),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            },
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          }
        })
        await this.fileNewpoint(responseUpFile?.file?.url, newpointData?.id, userId)
        const newpointArr = []
        for (let i = 0; i < resDataYear?.newPoint.length; i++) {
          newpointArr.push({
            newpoint_id: newpointData?.id,
            point: resDataYear?.newPoint[i]?.nomination_point || null,
            temp_new_point: resDataYear?.newPoint[i]?.new_point || null,
            temp_point_type: resDataYear?.newPoint[i]?.point_type || null,
            temp_nomination_point: resDataYear?.newPoint[i]?.nomination_point || null,
            temp_customer: resDataYear?.newPoint[i]?.customer || null,
            temp_area: resDataYear?.newPoint[i]?.area || null,
            temp_unit: resDataYear?.newPoint[i]?.unit || null,
            entry_exit_id: resDataYear?.newPoint[i]?.point_type === 'Entry' ? 1 : 2,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
        await this.prisma.newpoint_detail.createMany({
          data: newpointArr
        })
      }

      return {
        data: resDataYear,
        warning: warningZero,
        warningRowZero: warningRowZero
      }
    } else if (type === 'Medium Term') {
      // sheet 2 use
      const resultArr = this.groupPrefixDate(resultDate, 'month')

      const updatedDataEntry = this.mergeDataEntryExit(updatedValueEntry, resultArr, 'month')
      const updatedDataExit = this.mergeDataEntryExit(updatedValueExit, resultArr, 'month')

      const filterEntryMMBTU = updatedDataEntry.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry = this.checkValuesEntryOrExit(resultDateEntryUse, filterEntryMMBTU)
      const resultCkExit = this.checkValuesEntryOrExit(resultDateExitUse, updatedDataExit)

      const resultTotal = this.areObjectsEqual(resultDateEntryUse, resultDateExitUse)

      if (resultCkEntry || resultCkExit || resultTotal) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const hasGreaterThanZero = Object.values(resultDateExitUse).some((value: any) => parseFloat(value) > 0)

      if (!hasGreaterThanZero && !isHasValue) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            // error: 'Total Entry & Total Exit equals zero.'
            error: "Upload Failed: sheet 'Normal' tab cannot be empty."
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // sheet 1
      const resultArr1 = this.groupPrefixDate(resultDate1, 'month')

      const updatedDataEntry1 = this.mergeDataEntryExit(updatedValueEntry1, resultArr1, 'month')
      const updatedDataExit1 = this.mergeDataEntryExit(updatedValueExit1, resultArr1, 'month')

      const filterEntryMMBTU1 = updatedDataEntry1.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry1 = this.checkValuesEntryOrExit(resultDateEntryUse1, filterEntryMMBTU1)
      const resultCkExit1 = this.checkValuesEntryOrExit(resultDateExitUse1, updatedDataExit1)

      const resultTotal1 = this.areObjectsEqual(resultDateEntryUse1, resultDateExitUse1)

      if (resultCkEntry1 || resultCkExit1 || resultTotal1) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // sheet 3
      const resultArr3 = this.groupPrefixDate(resultDate3, 'month')

      const updatedDataEntry3 = this.mergeDataEntryExit(updatedValueEntry3, resultArr3, 'month')
      const updatedDataExit3 = this.mergeDataEntryExit(updatedValueExit3, resultArr3, 'month')

      const filterEntryMMBTU3 = updatedDataEntry3.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry3 = this.checkValuesEntryOrExit(resultDateEntryUse3, filterEntryMMBTU3)
      const resultCkExit3 = this.checkValuesEntryOrExit(resultDateExitUse3, updatedDataExit3)

      const resultTotal3 = this.areObjectsEqual(resultDateEntryUse3, resultDateExitUse3)

      if (resultCkEntry3 || resultCkExit3 || resultTotal3) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // ------------

      const totalResultMonthEntryTotal = this.calculateTotalEntryOrExitTotal(filterEntryMMBTU, resultArr, 'month')

      const totalResultMonthExitTotal = this.calculateTotalEntryOrExitTotal(updatedDataExit, resultArr, 'month')

      const dataEntry = filterEntryMMBTU.map((e: any) => {
        return {
          new_point: e['0'],
          point_type: e['1'],
          nomination_point: e['2'],
          customer: e['3'],
          area: e['4'],
          unit: e['5'],
          data: JSON.stringify(e)
        }
      })
      const dataExit = updatedDataExit.map((e: any) => {
        return {
          new_point: e['0'],
          point_type: e['1'],
          nomination_point: e['2'],
          customer: e['3'],
          area: e['4'],
          unit: e['5'],
          data: JSON.stringify(e)
        }
      })

      // check text
      let newPoint = []
      for (let i = 0; i < filterEntryMMBTU.length; i++) {
        const new_point = !!filterEntryMMBTU[i]?.['0'] ? filterEntryMMBTU[i]?.['0'].toUpperCase() : ''
        const point_type = filterEntryMMBTU[i]?.['1']
        const nomination_point = filterEntryMMBTU[i]?.['2']
        const customer = filterEntryMMBTU[i]?.['3']
        const area = filterEntryMMBTU[i]?.['4']
        const unit = filterEntryMMBTU[i]?.['5']

        const entryRow = {
          new_point,
          point_type,
          nomination_point,
          customer,
          area,
          unit
        }

        if (entryRow?.new_point === 'Y') {
          // new  แบบไม่สน
          newPoint.push(entryRow)
        } else {
          const nominationPoint = await this.prisma.nomination_point.findFirst({
            where: {
              nomination_point: entryRow?.nomination_point,
              area: {
                name: entryRow?.area
              },
              entry_exit_id: 1,
              AND: [
                {
                  start_date: {
                    lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: todayStart
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
            },
            select: {
              nomination_point: true,
              area: {
                select: {
                  name: true
                }
              }
            }
          })
          if (nominationPoint) {
            // ถ้ามี เช็คตัวอื่นๆ ว่าถูกไหมไม่ถูก ไม่ให้เอาเข้าระบบ
            if (nominationPoint?.area?.name !== entryRow?.area) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'value not match'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            // ถ้าไม่มีมี new  แบบไม่สน
            newPoint.push(entryRow)
          }
        }
      }

      for (let i = 0; i < updatedDataExit.length; i++) {
        const new_point = !!updatedDataExit[i]?.['0'] ? updatedDataExit[i]?.['0'].toUpperCase() : ''
        const point_type = updatedDataExit[i]?.['1']
        const nomination_point = updatedDataExit[i]?.['2']
        const customer = updatedDataExit[i]?.['3']
        const area = updatedDataExit[i]?.['4']
        const unit = updatedDataExit[i]?.['5']
        if (point_type !== 'Exit') {
          continue
        }

        const exitRow = {
          new_point,
          point_type,
          nomination_point,
          customer,
          area,
          unit
        }

        if (exitRow?.new_point === 'Y') {
          // new  แบบไม่สน
          newPoint.push(exitRow)
        } else {
          const nominationPoint = await this.prisma.nomination_point.findFirst({
            where: {
              nomination_point: exitRow?.nomination_point,
              area: {
                name: exitRow?.area
              },
              entry_exit_id: 2,
              AND: [
                {
                  start_date: {
                    lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: todayStart
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
            },
            include: {
              area: true
            }
          })
          if (nominationPoint) {
            // ถ้ามี เช็คตัวอื่นๆ ว่าถูกไหมไม่ถูก ไม่ให้เอาเข้าระบบ
            if (nominationPoint?.area?.name !== exitRow?.area) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'value not match'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            // ถ้าไม่มีมี new  แบบไม่สน
            newPoint.push(exitRow)
          }
        }
      }
      const currentDate = dayjs(resultDate[`${maxDateKey}`], 'DD/MM/YYYY')

      // เพิ่มเดือนและตั้งวันที่เป็นวันที่ 1 ของเดือนถัดไป
      const nextMonthDate = currentDate.add(1, 'month').startOf('month')

      // แสดงผลในรูปแบบ "DD/MM/YYYY"
      const formattedDate = nextMonthDate.format('DD/MM/YYYY')

      const fmDate = getTodayStartAdd7().toDate()

      const planningCode = await this.prisma.query_shipper_planning_files.count({
        where: {
          term_type_id: 2,
          create_date: {
            gte: todayStart, // มากกว่าหรือเท่ากับเวลาเริ่มต้นของวันนี้
            lte: todayEnd // น้อยกว่าหรือเท่ากับเวลาสิ้นสุดของวันนี้
          }
        }
      })
      const runNum = planningCode + 1
      const runNumFormate = runNum > 999 ? runNum : runNum > 99 ? '0' + runNum : runNum > 9 ? '00' + runNum : '000' + runNum

      const groupId = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              // account_id: resDataMonth?.shipperId
              account_id: Number(userId)
            }
          }
        },
        select: {
          id: true
        }
      })

      const resDataMonth = {
        planningCode: `${dayjs(fmDate).format('YYYYMMDD')}-MT-${runNumFormate}`,
        temp: newData,
        valueEntry: dataEntry,
        valueExit: dataExit,
        totalResultMonthEntryTotal,
        totalResultMonthExitTotal,
        newPoint: newPoint,
        startDate: resultDate['6'],
        endDate: formattedDate,
        shipperId: !!shipper_id ? Number(shipper_id) : groupId?.id,
        file,
        typeId: 2
      }

      const nowCre = getTodayNowAdd7()

      const createPlanningCode = await this.prisma.query_shipper_planning_files.create({
        data: {
          planning_code: resDataMonth?.planningCode,
          group: {
            connect: {
              id: !!shipper_id ? Number(shipper_id) : groupId?.id
            }
          },
          term_type: {
            connect: {
              id: resDataMonth?.typeId
            }
          },
          start_date: getTodayNowDDMMYYYYDfaultAdd7(resDataMonth?.startDate).toDate(),
          end_date: getTodayNowDDMMYYYYDfaultAdd7(resDataMonth?.endDate).toDate(),
          shipper_file_submission_date: nowCre.toDate(),
          // create_by: Number(userId),
          create_by_account: {
            connect: {
              id: Number(userId)
            }
          },
          create_date: nowCre.toDate(),
          create_date_num: nowCre.unix()
        }
      })

      const responseUpFile = await uploadFilsTemp(file)
      await this.fileQueryFileShipper(responseUpFile?.file?.url, createPlanningCode?.id, userId)
      const pEntryExit = []
      if (resDataMonth?.valueEntry.length > 0) {
        for (let i = 0; i < resDataMonth?.valueEntry.length; i++) {
          pEntryExit.push({
            query_shipper_planning_files_id: createPlanningCode?.id,
            value: resDataMonth?.valueEntry[i]?.data || null,
            temp_new_point: resDataMonth?.valueEntry[i]?.new_point || null,
            temp_point_type: resDataMonth?.valueEntry[i]?.point_type || null,
            temp_nomination_point: resDataMonth?.valueEntry[i]?.nomination_point || null,
            temp_customer: resDataMonth?.valueEntry[i]?.customer || null,
            temp_area: resDataMonth?.valueEntry[i]?.area || null,
            temp_unit: resDataMonth?.valueEntry[i]?.unit || null,
            entry_exit_id: 1,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
      }
      if (resDataMonth?.valueExit.length > 0) {
        for (let i = 0; i < resDataMonth?.valueExit.length; i++) {
          pEntryExit.push({
            query_shipper_planning_files_id: createPlanningCode?.id,
            value: resDataMonth?.valueExit[i]?.data || null,
            temp_new_point: resDataMonth?.valueExit[i]?.new_point || null,
            temp_point_type: resDataMonth?.valueExit[i]?.point_type || null,
            temp_nomination_point: resDataMonth?.valueExit[i]?.nomination_point || null,
            temp_customer: resDataMonth?.valueExit[i]?.customer || null,
            temp_area: resDataMonth?.valueExit[i]?.area || null,
            temp_unit: resDataMonth?.valueExit[i]?.unit || null,
            entry_exit_id: 2,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
      }
      if (resDataMonth?.valueEntry.length > 0 || resDataMonth?.valueExit.length > 0) {
        await this.prisma.query_shipper_planning_files_temp_row.createMany({
          data: pEntryExit
        })
      }
      await this.prisma.query_shipper_planning_files_temp_medium.create({
        data: {
          query_shipper_planning_files_id: Number(createPlanningCode?.id),
          temp_full: JSON.stringify(resDataMonth?.temp),
          temp_total_entry: JSON.stringify(resDataMonth?.totalResultMonthEntryTotal),
          temp_total_exit: JSON.stringify(resDataMonth?.totalResultMonthExitTotal),
          create_by: Number(userId),
          create_date: nowCre.toDate(),
          create_date_num: nowCre.unix()
        }
      })

      if (resDataMonth?.newPoint.length > 0) {
        const newpointData = await this.prisma.newpoint.create({
          data: {
            planning_code: resDataMonth?.planningCode,
            group: {
              connect: {
                // id: groupId?.id,
                // id: groupCreateFind?.id,
                id: !!shipper_id ? Number(shipper_id) : groupId?.id
              }
            },
            query_shipper_planning_files: {
              connect: {
                id: createPlanningCode?.id
              }
            },
            term_type: {
              connect: {
                id: resDataMonth?.typeId
              }
            },
            start_date: getTodayNowDDMMYYYYDfaultAdd7(resDataMonth?.startDate).toDate(),
            end_date: getTodayNowDDMMYYYYDfaultAdd7(resDataMonth?.endDate).toDate(),
            shipper_file_submission_date: nowCre.toDate(),
            // create_by: Number(userId),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            },
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          }
        })
        await this.fileNewpoint(responseUpFile?.file?.url, newpointData?.id, userId)
        const newpointArr = []
        for (let i = 0; i < resDataMonth?.newPoint.length; i++) {
          newpointArr.push({
            newpoint_id: newpointData?.id,
            point: resDataMonth?.newPoint[i]?.nomination_point || null,
            temp_new_point: resDataMonth?.newPoint[i]?.new_point || null,
            temp_point_type: resDataMonth?.newPoint[i]?.point_type || null,
            temp_nomination_point: resDataMonth?.newPoint[i]?.nomination_point || null,
            temp_customer: resDataMonth?.newPoint[i]?.customer || null,
            temp_area: resDataMonth?.newPoint[i]?.area || null,
            temp_unit: resDataMonth?.newPoint[i]?.unit || null,
            entry_exit_id: resDataMonth?.newPoint[i]?.point_type === 'Entry' ? 1 : 2,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
        await this.prisma.newpoint_detail.createMany({
          data: newpointArr
        })
      }

      return {
        data: resDataMonth,
        warning: warningZero,
        warningRowZero: warningRowZero
      }
    } else if (type === 'Short Term') {
      // sheet 2 use
      const resultArr = this.groupPrefixDate(resultDate, 'day')

      const updatedDataEntry = this.mergeDataEntryExit(updatedValueEntry, resultArr, 'day')
      const updatedDataExit = this.mergeDataEntryExit(updatedValueExit, resultArr, 'day')

      const filterEntryMMBTU = updatedDataEntry.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry = this.checkValuesEntryOrExit(resultDateEntryUse, filterEntryMMBTU)
      const resultCkExit = this.checkValuesEntryOrExit(resultDateExitUse, updatedDataExit)

      const resultTotal = this.areObjectsEqual(resultDateEntryUse, resultDateExitUse)

      if (resultCkEntry || resultCkExit || resultTotal) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const hasGreaterThanZero = Object.values(resultDateExitUse).some((value: any) => parseFloat(value) > 0)

      if (!hasGreaterThanZero && !isHasValue) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            // error: 'Total Entry & Total Exit equals zero.'
            error: "Upload Failed: sheet 'Normal' tab cannot be empty."
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // sheet 1
      const resultArr1 = this.groupPrefixDate(resultDate1, 'day')

      const updatedDataEntry1 = this.mergeDataEntryExit(updatedValueEntry1, resultArr1, 'day')
      const updatedDataExit1 = this.mergeDataEntryExit(updatedValueExit1, resultArr1, 'day')

      const filterEntryMMBTU1 = updatedDataEntry1.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry1 = this.checkValuesEntryOrExit(resultDateEntryUse1, filterEntryMMBTU1)
      const resultCkExit1 = this.checkValuesEntryOrExit(resultDateExitUse1, updatedDataExit1)

      const resultTotal1 = this.areObjectsEqual(resultDateEntryUse1, resultDateExitUse1)

      if (resultCkEntry1 || resultCkExit1 || resultTotal1) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // sheet 3
      const resultArr3 = this.groupPrefixDate(resultDate3, 'day')

      const updatedDataEntry3 = this.mergeDataEntryExit(updatedValueEntry3, resultArr3, 'day')
      const updatedDataExit3 = this.mergeDataEntryExit(updatedValueExit3, resultArr3, 'day')

      const filterEntryMMBTU3 = updatedDataEntry3.filter((f: any) => {
        return f['5'] === 'MMBtud'
      })

      const resultCkEntry3 = this.checkValuesEntryOrExit(resultDateEntryUse3, filterEntryMMBTU3)
      const resultCkExit3 = this.checkValuesEntryOrExit(resultDateExitUse3, updatedDataExit3)

      const resultTotal3 = this.areObjectsEqual(resultDateEntryUse3, resultDateExitUse3)

      if (resultCkEntry3 || resultCkExit3 || resultTotal3) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Total Entry & Total Exit is NOT match.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      // ------------

      const totalResultDayEntryTotal = this.calculateTotalEntryOrExitTotal(filterEntryMMBTU, resultArr, 'day')

      const totalResultDayExitTotal = this.calculateTotalEntryOrExitTotal(updatedDataExit, resultArr, 'day')

      const dataEntry = filterEntryMMBTU.map((e: any) => {
        return {
          new_point: e['0'],
          point_type: e['1'],
          nomination_point: e['2'],
          customer: e['3'],
          area: e['4'],
          unit: e['5'],
          data: JSON.stringify(e)
        }
      })

      const dataExit = updatedDataExit.map((e: any) => {
        return {
          new_point: e['0'],
          point_type: e['1'],
          nomination_point: e['2'],
          customer: e['3'],
          area: e['4'],
          unit: e['5'],
          data: JSON.stringify(e)
        }
      })

      // check text
      let newPoint = []
      for (let i = 0; i < filterEntryMMBTU.length; i++) {
        const new_point = !!filterEntryMMBTU[i]?.['0'] ? filterEntryMMBTU[i]?.['0'].toUpperCase() : ''
        const point_type = filterEntryMMBTU[i]?.['1']
        const nomination_point = filterEntryMMBTU[i]?.['2']
        const customer = filterEntryMMBTU[i]?.['3']
        const area = filterEntryMMBTU[i]?.['4']
        const unit = filterEntryMMBTU[i]?.['5']

        const entryRow = {
          new_point,
          point_type,
          nomination_point,
          customer,
          area,
          unit
        }

        if (entryRow?.new_point === 'Y') {
          // new  แบบไม่สน
          newPoint.push(entryRow)
        } else {
          const nominationPoint = await this.prisma.nomination_point.findFirst({
            where: {
              nomination_point: entryRow?.nomination_point,
              area: {
                name: entryRow?.area
              },
              entry_exit_id: 1,
              AND: [
                {
                  start_date: {
                    lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: todayStart
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
            },
            select: {
              nomination_point: true,
              area: {
                select: {
                  name: true
                }
              }
            }
          })
          if (nominationPoint) {
            // ถ้ามี เช็คตัวอื่นๆ ว่าถูกไหมไม่ถูก ไม่ให้เอาเข้าระบบ
            if (nominationPoint?.area?.name !== entryRow?.area) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'value not match'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            // ถ้าไม่มีมี new  แบบไม่สน
            newPoint.push(entryRow)
          }
        }
      }

      for (let i = 0; i < updatedDataExit.length; i++) {
        const new_point = !!updatedDataExit[i]?.['0'] ? updatedDataExit[i]?.['0'].toUpperCase() : ''
        const point_type = updatedDataExit[i]?.['1']
        const nomination_point = updatedDataExit[i]?.['2']
        const customer = updatedDataExit[i]?.['3']
        const area = updatedDataExit[i]?.['4']
        const unit = updatedDataExit[i]?.['5']
        if (point_type !== 'Exit') {
          continue
        }
        const exitRow = {
          new_point,
          point_type,
          nomination_point,
          customer,
          area,
          unit
        }

        if (exitRow?.new_point === 'Y') {
          // new  แบบไม่สน
          newPoint.push(exitRow)
        } else {
          const nominationPoint = await this.prisma.nomination_point.findFirst({
            where: {
              nomination_point: exitRow?.nomination_point,
              area: {
                name: exitRow?.area
              },
              entry_exit_id: 2,
              AND: [
                {
                  start_date: {
                    lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  }
                },
                {
                  OR: [
                    {
                      end_date: null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date: {
                        gte: todayStart
                      }
                    } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  ]
                }
              ]
            },
            select: {
              nomination_point: true,
              area: {
                select: {
                  name: true
                }
              }
            }
          })
          if (nominationPoint) {
            // ถ้ามี เช็คตัวอื่นๆ ว่าถูกไหมไม่ถูก ไม่ให้เอาเข้าระบบ
            if (nominationPoint?.area?.name !== exitRow?.area) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: 'Nomination Point does not match the existing Area in the system. Please verify and try again.'
                },
                HttpStatus.BAD_REQUEST
              )
            }
          } else {
            // ถ้าไม่มีมี new  แบบไม่สน
            newPoint.push(exitRow)
          }
        }
      }

      const currentDate = dayjs(resultDate[`${maxDateKey}`], 'DD/MM/YYYY')

      // เพิ่ม 1 วัน
      const nextDay = currentDate.add(1, 'day')

      // แสดงผลในรูปแบบ "DD/MM/YYYY"
      const formattedDate = nextDay.format('DD/MM/YYYY')

      const fmDate = getTodayStartAdd7().toDate()

      const planningCode = await this.prisma.query_shipper_planning_files.count({
        where: {
          term_type_id: 3,
          create_date: {
            gte: todayStart, // มากกว่าหรือเท่ากับเวลาเริ่มต้นของวันนี้
            lte: todayEnd // น้อยกว่าหรือเท่ากับเวลาสิ้นสุดของวันนี้
          }
        }
      })
      const runNum = planningCode + 1
      const runNumFormate = runNum > 999 ? runNum : runNum > 99 ? '0' + runNum : runNum > 9 ? '00' + runNum : '000' + runNum

      const groupId = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              // account_id: resDataDay?.shipperId
              account_id: Number(userId)
            }
          }
        },
        select: {
          id: true
        }
      })

      const resDataDay = {
        planningCode: `${dayjs(fmDate).format('YYYYMMDD')}-ST-${runNumFormate}`,
        temp: newData,
        valueEntry: dataEntry,
        valueExit: dataExit,
        totalResultDayEntryTotal,
        totalResultDayExitTotal,
        newPoint: newPoint,
        startDate: resultDate['6'],
        endDate: formattedDate,
        shipperId: !!shipper_id ? Number(shipper_id) : groupId?.id,
        file,
        typeId: 3
      }

      const nowCre = getTodayNowAdd7()

      const createPlanningCode = await this.prisma.query_shipper_planning_files.create({
        data: {
          planning_code: resDataDay?.planningCode,
          group: {
            connect: {
              id: !!shipper_id ? Number(shipper_id) : groupId?.id
            }
          },
          term_type: {
            connect: {
              id: resDataDay?.typeId
            }
          },
          start_date: getTodayNowDDMMYYYYDfaultAdd7(resDataDay?.startDate).toDate(),
          end_date: getTodayNowDDMMYYYYDfaultAdd7(resDataDay?.endDate).toDate(),
          shipper_file_submission_date: nowCre.toDate(),
          // create_by: Number(userId),
          create_by_account: {
            connect: {
              id: Number(userId)
            }
          },
          create_date: nowCre.toDate(),
          create_date_num: nowCre.unix()
        }
      })

      const responseUpFile = await uploadFilsTemp(file)
      await this.fileQueryFileShipper(responseUpFile?.file?.url, createPlanningCode?.id, userId)
      const pEntryExit = []
      if (resDataDay?.valueEntry.length > 0) {
        for (let i = 0; i < resDataDay?.valueEntry.length; i++) {
          pEntryExit.push({
            query_shipper_planning_files_id: createPlanningCode?.id,
            value: resDataDay?.valueEntry[i]?.data || null,
            temp_new_point: resDataDay?.valueEntry[i]?.new_point || null,
            temp_point_type: resDataDay?.valueEntry[i]?.point_type || null,
            temp_nomination_point: resDataDay?.valueEntry[i]?.nomination_point || null,
            temp_customer: resDataDay?.valueEntry[i]?.customer || null,
            temp_area: resDataDay?.valueEntry[i]?.area || null,
            temp_unit: resDataDay?.valueEntry[i]?.unit || null,
            entry_exit_id: 1,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
      }
      if (resDataDay?.valueExit.length > 0) {
        for (let i = 0; i < resDataDay?.valueExit.length; i++) {
          pEntryExit.push({
            query_shipper_planning_files_id: createPlanningCode?.id,
            value: resDataDay?.valueExit[i]?.data || null,
            temp_new_point: resDataDay?.valueExit[i]?.new_point || null,
            temp_point_type: resDataDay?.valueExit[i]?.point_type || null,
            temp_nomination_point: resDataDay?.valueExit[i]?.nomination_point || null,
            temp_customer: resDataDay?.valueExit[i]?.customer || null,
            temp_area: resDataDay?.valueExit[i]?.area || null,
            temp_unit: resDataDay?.valueExit[i]?.unit || null,
            entry_exit_id: 2,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
      }
      if (resDataDay?.valueEntry.length > 0 || resDataDay?.valueExit.length > 0) {
        await this.prisma.query_shipper_planning_files_temp_row.createMany({
          data: pEntryExit
        })
      }
      await this.prisma.query_shipper_planning_files_temp_short.create({
        data: {
          query_shipper_planning_files_id: Number(createPlanningCode?.id),
          temp_full: JSON.stringify(resDataDay?.temp),
          temp_total_entry: JSON.stringify(resDataDay?.totalResultDayEntryTotal),
          temp_total_exit: JSON.stringify(resDataDay?.totalResultDayExitTotal),
          create_by: Number(userId),
          create_date: nowCre.toDate(),
          create_date_num: nowCre.unix()
        }
      })

      if (resDataDay?.newPoint.length > 0) {
        const newpointData = await this.prisma.newpoint.create({
          data: {
            planning_code: resDataDay?.planningCode,
            group: {
              connect: {
                // id: groupId?.id,
                // id: groupCreateFind?.id,
                id: !!shipper_id ? Number(shipper_id) : groupId?.id
              }
            },
            query_shipper_planning_files: {
              connect: {
                id: createPlanningCode?.id
              }
            },
            term_type: {
              connect: {
                id: resDataDay?.typeId
              }
            },
            start_date: getTodayNowDDMMYYYYDfaultAdd7(resDataDay?.startDate).toDate(),
            end_date: getTodayNowDDMMYYYYDfaultAdd7(resDataDay?.endDate).toDate(),
            shipper_file_submission_date: nowCre.toDate(),
            // create_by: Number(userId),
            create_by_account: {
              connect: {
                id: Number(userId)
              }
            },
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          }
        })
        await this.fileNewpoint(responseUpFile?.file?.url, newpointData?.id, userId)
        const newpointArr = []
        for (let i = 0; i < resDataDay?.newPoint.length; i++) {
          newpointArr.push({
            newpoint_id: newpointData?.id,
            point: resDataDay?.newPoint[i]?.nomination_point || null,
            temp_new_point: resDataDay?.newPoint[i]?.new_point || null,
            temp_point_type: resDataDay?.newPoint[i]?.point_type || null,
            temp_nomination_point: resDataDay?.newPoint[i]?.nomination_point || null,
            temp_customer: resDataDay?.newPoint[i]?.customer || null,
            temp_area: resDataDay?.newPoint[i]?.area || null,
            temp_unit: resDataDay?.newPoint[i]?.unit || null,
            entry_exit_id: resDataDay?.newPoint[i]?.point_type === 'Entry' ? 1 : 2,
            create_by: Number(userId),
            create_date: nowCre.toDate(),
            create_date_num: nowCre.unix()
          })
        }
        await this.prisma.newpoint_detail.createMany({
          data: newpointArr
        })
      }

      return {
        data: resDataDay,
        warning: warningZero,
        warningRowZero: warningRowZero
      }
    } else {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'term type not match'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  async planningDeadlineUse(id: any) {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const planningDeadline = await this.prisma.planning_deadline.findFirst({
      where: {
        term_type_id: Number(id),

        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      }
    })

    if (!!!planningDeadline) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Date is NOT match.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return planningDeadline
  }
}
