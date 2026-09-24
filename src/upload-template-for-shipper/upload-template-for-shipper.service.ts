import {HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common'
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
// import { CapacityService } from 'src/capacity/capacity.service';
import {getTodayEndAdd7, getTodayNowAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'
import {uploadFilsTemp} from 'src/common/utils/uploadFileIn'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

const headNom = ['Zone', 'Supply/Demand', 'Area', 'POINT_ID', 'WI/HV', 'Park/UnparkInstructed Flows', 'Type', 'Area_Code', 'Subarea_Code', 'Unit', 'Entry_Exit', 'WI', 'HV', 'SG']
const headNomSheet2 = ['Zone', 'Point', 'CO2', 'C1', 'C2', 'C3', 'iC4', 'nC4', 'iC5', 'nC5', 'C6', 'C7', 'C2+', 'N2', 'O2', 'H2S', 'S', 'Hg']

const headNomSheet3 = [
  [],
  ['Supply/Demand'],
  ['Supply'],
  ['Demand'],
  [],
  [],
  [],
  ['WI/HV'],
  ['East WI'],
  ['East HV'],
  ['East-West WI'],
  ['East-West HV'],
  ['West WI'],
  ['West HV'],
  [],
  [],
  ['Park/Unpark-Instructed Flows'],
  ['Unpark'],
  ['Instructed_Entry'],
  ['Park'],
  ['Instructed_Exit'],
  ['Shrinkage_Volume'],
  ['Min_Inventory_Change'],
  ['Exchange_Min_Inventory'],
  [],
  [],
  ['Type'],
  ['Sales GSP'],
  ['Bypass Gas'],
  ['Common Header'],
  ['Super Header'],
  ['LNG'],
  ['W-SUPPLY'],
  ['Other'],
  ['SPP'],
  ['IND'],
  ['NGV'],
  ['NGD'],
  ['FUEL'],
  ['EGAT'],
  ['IPP'],
  [],
  [],
  [],
  ['Unit'],
  ['MMBTU/D'],
  ['MMSCFD'],
  ['MMSCFH'],
  ['%'],
  ['BTU/SCF'],
  ['Unitless'],
  ['%.MOL'],
  ['PPM.VOL'],
  ['PPM.VOL.DEG'],
  ['microG.M3'],
  ['PPM.WEIGHT'],
  ['LB.MMSCF'],
  ['DEG.F'],
  ['MJ/m3'],
  [],
  [],
  [],
  [],
  ['Entry_Exit'],
  ['Entry'],
  ['Exit'],
  [],
  [],
  ['Quality Parameters'],
  ['CO2'],
  ['C1'],
  ['C2'],
  ['C3'],
  ['iC4'],
  ['nC4'],
  ['iC5'],
  ['nC5'],
  ['C6'],
  ['C7'],
  ['C2+'],
  ['N2'],
  ['O2'],
  ['H2S'],
  ['S'],
  ['Hg'],
  ['Total'],
  ['LHV dry'],
  ['LHV sat'],
  ['HHV dry'],
  ['HHV sat (Btu/scf)'],
  ['SG'],
  ['WI : HHVdry/sqrt(SG)'],
  ['WI : MJ/m3']
]

const daily = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', 'Total']

@Injectable()
export class UploadTemplateForShipperService {
  constructor(
    // private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async useReqs(req: any) {
    const ip = req.headers['x-forwarded-for'] || req.ip
    return {
      ip: ip,
      sub: req?.user?.sub,
      first_name: req?.user?.first_name,
      last_name: req?.user?.last_name,
      username: req?.user?.username,
      originalUrl: req?.originalUrl
    }
  }

  async writeReq(reqUser: any, type: any, method: any, value: any) {
    const usedData = {
      reqUser: !!reqUser ? JSON.stringify(await this.useReqs(reqUser)) : null,
      type: type,
      method: method,
      value: JSON.stringify(value),
      id_value: value?.id,
      create_date: getTodayNowAdd7().toDate(),
      create_date_num: getTodayNowAdd7().unix(),
      module: 'NOMINATION',
      ...(!!reqUser?.user?.sub && {
        ...(!!reqUser?.user?.sub && {
          create_by_account: {
            connect: {
              id: Number(reqUser?.user?.sub) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            }
          }
        })
      })
    }

    await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.history', 'id'),
          COALESCE((SELECT MAX(id) FROM public.history), 0),
          true
        )
        `)
    await this.prisma.history.create({
      data: usedData
    })
    return true
  }

  async findAll() {
    const resData = await this.prisma.upload_template_for_shipper.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                del_flag: false
              },
              {
                del_flag: null
              }
            ]
          }
        ]
      },
      include: {
        nomination_type: true,
        group: true,
        contract_code: true,
        upload_template_for_shipper_comment: {
          include: {
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
        },
        upload_template_for_shipper_file: {
          include: {
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
    return resData
  }

  async findOnce(id: any) {
    const resData = await this.prisma.upload_template_for_shipper.findFirst({
      where: {
        id: Number(id),
        AND: [
          {
            OR: [
              {
                del_flag: false
              },
              {
                del_flag: null
              }
            ]
          }
        ]
      },
      include: {
        nomination_type: true,
        group: true,
        contract_code: true,
        upload_template_for_shipper_comment: {
          include: {
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
        },
        upload_template_for_shipper_file: {
          include: {
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
      }
    })
    return resData
  }

  async shipperContractApproved() {
    const resData = await this.prisma.group.findMany({
      where: {
        user_type_id: 3
      },
      include: {
        contract_code: {
          include: {
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
          where: {
            status_capacity_request_management_id: 2
          },
          orderBy: {
            id: 'desc'
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
    return resData
  }

  objToArr(obj: any) {
    // หา max index ที่มีอยู่
    const maxIndex = Math.max(...Object.keys(obj).map(Number))

    // สร้าง array พร้อมเติมค่า ''
    const arr = Array.from(
      {
        length: maxIndex + 1
      },
      (_, i) => obj[i] || ''
    )
    return arr
  }

  truncateArrayHeadSheet1(arr: any) {
    return arr.slice(0, 14) // ตัดให้เหลือแค่ index 0-13
  }
  truncateArrayHeadSheet2(arr: any) {
    return arr.slice(0, 18) // ตัดให้เหลือแค่ index 0-13
  }

  async componentGenExcelNom(data: any, data2: any, data3: any, typeOfNomination: any) {
    // สร้าง workbook และ worksheet
    console.log('data : ', data);
    console.log('data[data.length - 1] : ', data[data.length - 1]);
    const workbook = XLSX.utils.book_new() // สร้าง workbook ใหม่
    const worksheet1 = XLSX.utils.aoa_to_sheet([...data, data[data.length - 1].map((e: any) => '')]) // สร้าง sheet จาก array ของ array
    const worksheet2 = XLSX.utils.aoa_to_sheet(data2) // สร้าง sheet จาก array ของ array
    const worksheet3 = XLSX.utils.aoa_to_sheet(data3) // สร้าง sheet จาก array ของ array
    XLSX.utils.book_append_sheet(workbook, worksheet1, typeOfNomination) // เพิ่ม sheet ลงใน workbook
    XLSX.utils.book_append_sheet(workbook, worksheet2, 'Quality') // เพิ่ม sheet ลงใน workbook
    XLSX.utils.book_append_sheet(workbook, worksheet3, 'Lists') // เพิ่ม sheet ลงใน workbook
    const defaultColumnWidth = 20 // กำหนดค่าความกว้างมาตรฐานที่ต้องการ
    const defaultColumnWidthSheet2 = 10 // กำหนดค่าความกว้างมาตรฐานที่ต้องการ

    const columnLetterToNumber = (letter: string): number => {
      let number = 0
      for (let i = 0; i < letter.length; i++) {
        number = number * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1)
      }
      return number
    }

    Object.keys(worksheet1).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')) // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '')

      if (worksheet1[cell] && typeof worksheet1[cell] === 'object' && cell[0] !== '!') {
        const colIndex = columnLetterToNumber(columnLetter)
        if (colIndex < 15) {
          // < 15 หมายถึงก่อน column 'O'
          worksheet1[cell].z = '@' // รูปแบบ text
          worksheet1[cell].t = 's' // type = string
        }

        // worksheet1[cell].z = '@'; // ใช้รูปแบบ '@' เพื่อระบุว่าเป็น Text
        // worksheet1[cell].t = 's';
        worksheet1['!cols'] = Array(30)
          .fill(null)
          .map((_, index) => ({
            wch: index === 5 ? 25 : defaultColumnWidth // คอลัมน์แรก (A) กว้าง 25, ที่เหลือกว้าง 20
          }))

        //   ถ้า row 2 และเซลล์มีข้อมูล ให้ใส่สีพื้นหลังดำและข้อความสีขาว
        if (rowNumber === 2 && worksheet1[cell].v) {
          worksheet1[cell].s = worksheet1[cell].s || {} // ตรวจสอบว่าเซลล์มี object style หรือไม่
          worksheet1[cell].s.fill = {
            patternType: 'solid', //   เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: '000000'
            } //   สีพื้นหลังดำ (Black)
          }
          worksheet1[cell].s.font = {
            color: {
              rgb: 'FFFFFF'
            }, //   สีข้อความเป็นสีขาว (White)
            bold: true //   ทำให้ตัวอักษรหนา
          }
        }
        //   ถ้า row 4 และเซลล์มีข้อมูล ให้ใส่สีพื้นหลังดำและข้อความสีขาว
        if (rowNumber === 4 && worksheet1[cell].v) {
          worksheet1[cell].s = worksheet1[cell].s || {} // ตรวจสอบว่าเซลล์มี object style หรือไม่
          worksheet1[cell].s.fill = {
            patternType: 'solid', //   เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: '000000'
            } //   สีพื้นหลังดำ (Black)
          }
          worksheet1[cell].s.font = {
            color: {
              rgb: 'FFFFFF'
            }, //   สีข้อความเป็นสีขาว (White)
            bold: true //   ทำให้ตัวอักษรหนา
          }
        }
        //   ค้นหาแถวสุดท้ายที่มีข้อมูล
        const lastRowWithData = Math.max(
          ...Object.keys(worksheet1)
            .map((c) => parseInt(c.replace(/[^0-9]/g, ''), 10))
            .filter((n) => !isNaN(n))
        )
        //   ตั้งค่าขอบเขต (Border) สำหรับทุกเซลล์ตั้งแต่แถวที่ 5 เป็นต้นไป
        if (rowNumber >= 5) {
          worksheet1[cell].s = worksheet1[cell].s || {}
          worksheet1[cell].s.border = worksheet1[cell].s.border || {}

          //   ใส่เส้นแนวตั้ง (ทุกแถว)
          worksheet1[cell].s.border.left = {
            style: 'thin'
          }
          worksheet1[cell].s.border.right = {
            style: 'thin'
          }

          //   ใส่เส้นแนวนอนเฉพาะแถวสุดท้ายที่มีข้อมูล
          if (rowNumber === lastRowWithData) {
            worksheet1[cell].s.border.bottom = {
              style: 'thin'
            }
          }
        }
      }
    })
    Object.keys(worksheet2).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')) // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '') // ดึงตัวอักษรของคอลัมน์

      if (worksheet2[cell] && typeof worksheet2[cell] === 'object' && cell[0] !== '!') {
        worksheet2[cell].t = 's' //   บังคับให้เป็น String
        // worksheet2[cell].f = undefined; //   ลบสูตรออกไป (ถ้ามี)
        worksheet2[cell].z = '@' //   บังคับเป็น Text Format

        //   กำหนดความกว้างของคอลัมน์
        worksheet2['!cols'] = Array(30)
          .fill(null)
          .map(() => ({
            wch: defaultColumnWidthSheet2
          }))

        //   ถ้า row 2 และเซลล์มีข้อมูล ให้ใส่สีพื้นหลังดำและข้อความสีขาว
        if (rowNumber === 2 && worksheet2[cell].v) {
          worksheet2[cell].s = worksheet2[cell].s || {} // ตรวจสอบว่าเซลล์มี object style หรือไม่
          worksheet2[cell].s.fill = {
            patternType: 'solid', //   เติมสีพื้นหลังแบบทึบ
            fgColor: {
              rgb: '000000'
            } //   สีพื้นหลังดำ (Black)
          }
          worksheet2[cell].s.font = {
            color: {
              rgb: 'FFFFFF'
            }, //   สีข้อความเป็นสีขาว (White)
            bold: true //   ทำให้ตัวอักษรหนา
          }
        }

        //   ค้นหาแถวสุดท้ายที่มีข้อมูล
        const lastRowWithData = Math.max(
          ...Object.keys(worksheet2)
            .map((c) => parseInt(c.replace(/[^0-9]/g, ''), 10))
            .filter((n) => !isNaN(n))
        )

        //   ตั้งค่าขอบเขต (Border) สำหรับทุกเซลล์ตั้งแต่แถวที่ 2 เป็นต้นไป
        if (rowNumber >= 2 && rowNumber <= lastRowWithData - 2) {
          worksheet2[cell].s = worksheet2[cell].s || {}
          worksheet2[cell].s.border = worksheet2[cell].s.border || {}

          //   ใส่เส้นแนวตั้ง (ทุกแถว)
          worksheet2[cell].s.border.left = {
            style: 'thin'
          }
          worksheet2[cell].s.border.right = {
            style: 'thin'
          }

          //   ใส่เส้นแนวนอนเฉพาะแถวสุดท้ายที่มีข้อมูล
          if (rowNumber === lastRowWithData - 2) {
            worksheet2[cell].s.border.bottom = {
              style: 'thin'
            }
          }
        }

        if (rowNumber === lastRowWithData) {
          worksheet2[cell].s = worksheet2[cell].s || {} // ตรวจสอบว่าเซลล์มี object style หรือไม่
          worksheet2[cell].s.font = {
            color: {
              rgb: 'FF0000'
            }, //   สีข้อความเป็นสีขาว (White)
            bold: true, //   ทำให้ตัวอักษรหนา
            underline: true //   ใส่เส้นใต้ข้อความ
          }
        }

        //   กำหนดขอบเขตของชีตให้ Excel มองเห็นเซลล์ทั้งหมด
        worksheet2['!ref'] = `A1:Z${lastRowWithData}`
      }
    })
    Object.keys(worksheet3).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')) // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '') // ดึงตัวอักษรของคอลัมน์

      if (worksheet3[cell] && typeof worksheet3[cell] === 'object' && cell[0] !== '!') {
        worksheet3[cell].t = 's' //   บังคับให้เป็น String
        worksheet3[cell].z = '@' //   บังคับเป็น Text Format

        //   ใส่ตัวหนาในแถวที่กำหนด
        if ([2, 8, 17, 27, 45, 64, 69].includes(rowNumber)) {
          worksheet3[cell].s = worksheet3[cell].s || {}
          worksheet3[cell].s.font = worksheet3[cell].s.font || {}
          worksheet3[cell].s.font.bold = true //   ทำให้ตัวอักษรเป็นตัวหนา
        }
      }
    })

    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    })
    // ส่ง buffer กลับไปเพื่อให้ controller สามารถใช้งานต่อไปได้
    return excelBuffer
  }

  async createTemplatesOld(file: any, fileOriginal: any, payload: any, userId: any) {
    const {shipper_id, contract_code_id, nomination_type_id, comment} = payload

    const findData = JSON.parse(file?.jsonDataMultiSheet)
    const checkType = findData.reduce((acc: string | null, f: any) => {
      if (f?.sheet === 'Daily Nomination') return 'Daily Nomination'
      if (f?.sheet === 'Weekly Nomination') return 'Weekly Nomination'
      return acc
    }, null)

    const checkTemplate = await this.prisma.upload_template_for_shipper.findFirst({
      where: {
        group_id: Number(shipper_id),
        contract_code_id: Number(contract_code_id),
        nomination_type_id: Number(nomination_type_id)
      }
    })
    let sheet1 = findData.find((f: any) => {
      return f?.sheet === checkType
    })
    let sheet2 = findData.find((f: any) => {
      return f?.sheet === 'Quality'
    })
    let sheet3 = findData.find((f: any) => {
      return f?.sheet === 'Lists'
    })

    if (!!checkType && !!sheet2) {
      const contractCode = await this.prisma.contract_code.findFirst({
        where: {
          id: Number(contract_code_id),
          group_id: Number(shipper_id)
          // contract_code: sheet1?.data[1][1],
          // group:{
          //   name: sheet1?.data[1][0]
          // },
        },
        include: {
          group: true,
          booking_version: {
            include: {
              booking_row_json: true
            }
          }
        }
      })

      const weekly = this.getNextSundayDates()

      if (contractCode?.contract_code !== sheet1?.data[1][1] && contractCode?.group?.id_name !== sheet1?.data[1][0]) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'contract code ไม่ตรง & shipper id ไม่ตรง'
          },
          HttpStatus.BAD_REQUEST
        )
      } else if (contractCode?.contract_code !== sheet1?.data[1][1]) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'contract code ไม่ตรง'
          },
          HttpStatus.BAD_REQUEST
        )
      } else if (contractCode?.group?.id_name !== sheet1?.data[1][0]) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'shipper id ไม่ตรง'
          },
          HttpStatus.BAD_REQUEST
        )
      } else {
        // check หัว
        // 0-13 14++++
        const isEqual = headNom.every((val, index) => val === sheet1?.data[2][index])

        if (!!!isEqual) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Head Sheet 1 ไม่ตรง'
            },
            HttpStatus.BAD_REQUEST
          )
        }
        const isEqualSheet2 = headNomSheet2.every((val, index) => val === sheet2?.data[0][index])

        if (!!!isEqualSheet2) {
          if (!!!isEqualSheet2) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Head Sheet 2 ไม่ตรง'
              },
              HttpStatus.BAD_REQUEST
            )
          }

          if (checkType === 'Daily Nomination') {
            if (Number(nomination_type_id) !== 1) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  // error: 'nomination type ไม่ตรง',
                  // error: 'File template does not match the document type.',
                  error: 'Nomination Type is not match' // V.106 Add New Template Manual เคส Type ไม่ตรง (เลือก weekly  ปรับ Error Message https://app.clickup.com/t/86euzxxc2
                },
                HttpStatus.BAD_REQUEST
              )
            }
            // 'Daily Nomination'
            sheet1 = {
              ...sheet1,
              data: [[], this.objToArr(sheet1?.data[0]), this.objToArr(sheet1?.data[1]), [...this.truncateArrayHeadSheet1(this.objToArr(sheet1?.data[2])), ...daily], ...sheet1?.data.slice(3).map((e: any) => this.truncateArrayHeadSheet1(this.objToArr(e)))]
            }
            sheet2 = {
              ...sheet2,
              data: [[], [...this.truncateArrayHeadSheet2(this.objToArr(sheet2.data[0]))], ...sheet2?.data.slice(1).map((e: any) => this.truncateArrayHeadSheet2(this.objToArr(e)))]
            }
            sheet3 = {
              ...sheet3,
              data: headNomSheet3
            }
          } else {
            if (Number(nomination_type_id) !== 2) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  // error: 'nomination type ไม่ตรง',
                  // error: 'File template does not match the document type.',
                  error: 'Nomination Type is not match' // V.106 Add New Template Manual เคส Type ไม่ตรง (เลือก weekly  ปรับ Error Message https://app.clickup.com/t/86euzxxc2
                },
                HttpStatus.BAD_REQUEST
              )
            }
            // 'Weekly Nomination'
            sheet1 = {
              ...sheet1,
              data: [[], this.objToArr(sheet1?.data[0]), this.objToArr(sheet1?.data[1]), [...this.truncateArrayHeadSheet1(this.objToArr(sheet1?.data[2])), ...weekly], ...sheet1?.data.slice(3).map((e: any) => this.truncateArrayHeadSheet1(this.objToArr(e)))]
            }
            sheet2 = {
              ...sheet2,
              data: [[], [...this.truncateArrayHeadSheet2(this.objToArr(sheet2.data[0]))], ...sheet2?.data.slice(1).map((e: any) => this.truncateArrayHeadSheet2(this.objToArr(e)))]
            }
            sheet3 = {
              ...sheet3,
              data: headNomSheet3
            }
          }
        }
      }
    } else {
      if (!!checkType && !!sheet2) {
        if (!!checkType && !!sheet2) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'type ไม่ตรง & ไม่พบ Sheet 2'
            },
            HttpStatus.BAD_REQUEST
          )
        }
        if (!!checkType) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'type ไม่ตรง'
            },
            HttpStatus.BAD_REQUEST
          )
        } else {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'ไม่พบ Sheet 2'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }

    const excelBuffer = await this.componentGenExcelNom(sheet1?.data, sheet2?.data, sheet3?.data, checkType)
    const uploadResponse = await uploadFilsTemp({
      buffer: excelBuffer,
      originalname: `${fileOriginal?.originalname} `
    })

    if (!!checkTemplate) {
      // มี ให้ update
      // contract_code_id
      const uploadTemplateId = await this.prisma.upload_template_for_shipper.findFirst({
        where: {
          nomination_type_id: Number(nomination_type_id),
          contract_code_id: Number(contract_code_id),
          group_id: Number(shipper_id)
        }
      })
      const update = await this.prisma.upload_template_for_shipper.updateMany({
        where: {
          id: Number(uploadTemplateId?.id ?? -1)
        },
        data: {
          update_date: dayjs(dayjs().tz('Asia/Bangkok').format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')).tz('Asia/Bangkok').toDate(),
          update_date_num: Math.floor(Date.now() / 1000),
          update_by: Number(userId)
          // update_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }
      })
      if (!!uploadTemplateId) {
        if (file) {
          await this.prisma.upload_template_for_shipper_file.create({
            data: {
              ...(!!uploadTemplateId?.id && {
                upload_template_for_shipper: {
                  connect: {
                    id: Number(uploadTemplateId?.id)
                  }
                }
              }),
              url: uploadResponse?.file?.url,
              create_date: dayjs(dayjs().tz('Asia/Bangkok').format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')).tz('Asia/Bangkok').toDate(),
              // create_by: Number(userId),
              create_date_num: Math.floor(Date.now() / 1000),
              create_by_account: {
                connect: {
                  id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                }
              }
            }
          })
        }

        if (comment) {
          await this.prisma.upload_template_for_shipper_comment.create({
            data: {
              ...(!!uploadTemplateId?.id && {
                upload_template_for_shipper: {
                  connect: {
                    id: Number(uploadTemplateId?.id)
                  }
                }
              }),
              comment: comment,
              create_date: dayjs(dayjs().tz('Asia/Bangkok').format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')).tz('Asia/Bangkok').toDate(),
              // create_by: Number(userId),
              create_date_num: Math.floor(Date.now() / 1000),
              create_by_account: {
                connect: {
                  id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                }
              }
            }
          })
        }
      }

      return {
        id: uploadTemplateId?.id,
        message: `edit`
      }
    } else {
      // ไม่มีสร้างใหม่
      const create = await this.prisma.upload_template_for_shipper.create({
        data: {
          ...(!!shipper_id && {
            group: {
              connect: {
                id: Number(shipper_id)
              }
            }
          }),
          ...(!!contract_code_id && {
            contract_code: {
              connect: {
                id: Number(contract_code_id)
              }
            }
          }),
          ...(!!nomination_type_id && {
            nomination_type: {
              connect: {
                id: Number(nomination_type_id)
              }
            }
          }),
          create_date: dayjs(dayjs().tz('Asia/Bangkok').format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')).tz('Asia/Bangkok').toDate(),
          // create_by: Number(userId),
          create_date_num: Math.floor(Date.now() / 1000),
          create_by_account: {
            connect: {
              id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            }
          }
        }
      })
      if (!!create) {
        if (file) {
          await this.prisma.upload_template_for_shipper_file.create({
            data: {
              ...(!!create?.id && {
                upload_template_for_shipper: {
                  connect: {
                    id: Number(create?.id)
                  }
                }
              }),
              url: uploadResponse?.file?.url,
              create_date: dayjs(dayjs().tz('Asia/Bangkok').format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')).tz('Asia/Bangkok').toDate(),
              // create_by: Number(userId),
              create_date_num: Math.floor(Date.now() / 1000),
              create_by_account: {
                connect: {
                  id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                }
              }
            }
          })
        }

        if (comment) {
          await this.prisma.upload_template_for_shipper_comment.create({
            data: {
              ...(!!create?.id && {
                upload_template_for_shipper: {
                  connect: {
                    id: Number(create?.id)
                  }
                }
              }),
              comment: comment,
              create_date: dayjs(dayjs().tz('Asia/Bangkok').format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')).tz('Asia/Bangkok').toDate(),
              // create_by: Number(userId),
              create_date_num: Math.floor(Date.now() / 1000),
              create_by_account: {
                connect: {
                  id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                }
              }
            }
          })
        }
      }

      return {
        id: create?.id,
        message: `create`
      }
    }
  }

  async createTemplates(file: any, fileOriginal: any, payload: any, userId: any, req: any, idEdit?: any) {
    const {shipper_id, contract_code_id, nomination_type_id, comment} = payload

    if (idEdit) {
      const ckCT = await this.prisma.upload_template_for_shipper.findFirst({
        where: {
          id: idEdit
        }
      })
      if (ckCT?.group_id !== Number(shipper_id)) {
        console.log('1');
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Shipper ID does not match the system-generated template'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      if (ckCT?.contract_code_id !== Number(contract_code_id)) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Contract Code is incorrect' // V.106 Add New Template Manual เคส Contract Code ไม่ตรง ปรับ Error Mesage https://app.clickup.com/t/86euzxxga
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    const checkTemplate = await this.prisma.upload_template_for_shipper.findFirst({
      where: {
        group_id: Number(shipper_id),
        contract_code_id: Number(contract_code_id),
        nomination_type_id: Number(nomination_type_id),
        AND: [
          {
            OR: [
              {
                del_flag: false
              },
              {
                del_flag: null
              }
            ]
          }
        ]
      }
    })

    let uploadResponse: any = null
    if (file) {
      const findData = JSON.parse(file?.jsonDataMultiSheet)
      const checkType = findData.reduce((acc: string | null, f: any) => {
        if (f?.sheet === 'Daily Nomination') return 'Daily Nomination'
        if (f?.sheet === 'Weekly Nomination') return 'Weekly Nomination'
        return acc
      }, null)

      let sheet1 = findData.find((f: any) => {
        return f?.sheet === checkType
      })
      let sheet2 = findData.find((f: any) => {
        return f?.sheet === 'Quality'
      })
      let sheet3 = findData.find((f: any) => {
        return f?.sheet === 'Lists'
      })

      if (!!checkType && !!sheet2) {
        const contractCode = await this.prisma.contract_code.findFirst({
          where: {
            id: Number(contract_code_id),
            group_id: Number(shipper_id)
            // contract_code: sheet1?.data[1][1],
            // group:{
            //   name: sheet1?.data[1][0]
            // },
          },
          include: {
            group: true,
            booking_version: {
              include: {
                booking_row_json: true
              }
            }
          }
        })

        const weekly = this.getNextSundayDates()

        //   if(ckCT?.contract_code_id !== Number(contract_code_id)){
        //   throw new HttpException(
        //       {
        //         status: HttpStatus.BAD_REQUEST,
        //         error: 'The column headers in Sheet 1 do not match Contract Code the required template structure',
        //       },
        //       HttpStatus.BAD_REQUEST,
        //     );
        // }
        // if(ckCT?.group_id !== Number(shipper_id)){
        //   throw new HttpException(
        //       {
        //         status: HttpStatus.BAD_REQUEST,
        //         error: 'Shipper ID does not match the system-generated template',
        //       },
        //       HttpStatus.BAD_REQUEST,
        //     );
        // }
        //   if(ckCT?.contract_code_id !== Number(contract_code_id)){
        //   throw new HttpException(
        //       {
        //         status: HttpStatus.BAD_REQUEST,
        //         error: 'The column headers in Sheet 1 do not match Contract Code the required template structure',
        //       },
        //       HttpStatus.BAD_REQUEST,
        //     );
        // }
        // if(ckCT?.group_id !== Number(shipper_id)){
        //   throw new HttpException(
        //       {
        //         status: HttpStatus.BAD_REQUEST,
        //         error: 'Shipper ID does not match the system-generated template',
        //       },
        //       HttpStatus.BAD_REQUEST,
        //     );
        // }
        if (contractCode?.group?.id_name !== sheet1?.data[1][0]) {
          console.log('2');
          // console.log('contractCode : ', contractCode);
          // console.log('sheet1 : ', sheet1);
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Shipper ID does not match the system-generated template'
            },
            HttpStatus.BAD_REQUEST
          )
        } else if (contractCode?.contract_code !== sheet1?.data[1][1]) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              // error: 'The column headers in Sheet 1 do not match Contract Code the required template structure', // เดิมโรงงาน
              // error: 'Contract Code does not match',
              error: 'Contract Code is incorrect' // V.106 Add New Template Manual เคส Contract Code ไม่ตรง ปรับ Error Mesage https://app.clickup.com/t/86euzxxga
            },
            HttpStatus.BAD_REQUEST
          )
        } else {
          // check หัว
          // 0-13 14++++
          const isEqual = headNom.every((val, index) => val === sheet1?.data[2][index])

          if (!!!isEqual) {
            // https://app.clickup.com/t/86etzch5n

            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                // error: 'The column headers in Sheet 1 do not match the required template structure.',
                // error: 'The column headers in Sheet 1 do not match the required template structure.',
                error: `The column headers in Sheet ${checkType} do not match the required template structure.` // V.106 Add/Edit : Error case ที่ structure ผิด ให้ระบุชื่อ sheet ไปเลย ว่า sheet ไหนผิด https://app.clickup.com/t/86euzxxh4
              },
              HttpStatus.BAD_REQUEST
            )
          }
          const isEqualSheet2 = headNomSheet2.every((val, index) => val === sheet2?.data[0][index])

          if (!!!isEqualSheet2) {
            if (!!!isEqualSheet2) {
              throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  // error: 'The column headers in Sheet 2 do not match the required template structure.',
                  error: 'The column headers in Sheet Quality do not match the required template structure.' // V.106 Add/Edit : Error case ที่ structure ผิด ให้ระบุชื่อ sheet ไปเลย ว่า sheet ไหนผิด https://app.clickup.com/t/86euzxxh4
                },
                HttpStatus.BAD_REQUEST
              )
            }

            if (checkType === 'Daily Nomination') {
              if (Number(nomination_type_id) !== 1) {
                throw new HttpException(
                  {
                    status: HttpStatus.BAD_REQUEST,
                    // error: 'nomination type ไม่ตรง',
                    // error: 'File template does not match the document type.',
                    error: 'Nomination Type is not match' // V.106 Add New Template Manual เคส Type ไม่ตรง (เลือก weekly  ปรับ Error Message https://app.clickup.com/t/86euzxxc2
                  },
                  HttpStatus.BAD_REQUEST
                )
              }
              // 'Daily Nomination'
              sheet1 = {
                ...sheet1,
                data: [[], this.objToArr(sheet1?.data[0]), this.objToArr(sheet1?.data[1]), [...this.truncateArrayHeadSheet1(this.objToArr(sheet1?.data[2])), ...daily], ...sheet1?.data.slice(3).map((e: any) => this.truncateArrayHeadSheet1(this.objToArr(e)))]
              }
              sheet2 = {
                ...sheet2,
                data: [[], [...this.truncateArrayHeadSheet2(this.objToArr(sheet2.data[0]))], ...sheet2?.data.slice(1).map((e: any) => this.truncateArrayHeadSheet2(this.objToArr(e)))]
              }
              sheet3 = {
                ...sheet3,
                data: headNomSheet3
              }
            } else {
              if (Number(nomination_type_id) !== 2) {
                throw new HttpException(
                  {
                    status: HttpStatus.BAD_REQUEST,
                    // error: 'nomination type ไม่ตรง',
                    // error: 'File template does not match the document type.',
                    error: 'Nomination Type is not match' // V.106 Add New Template Manual เคส Type ไม่ตรง (เลือก weekly  ปรับ Error Message https://app.clickup.com/t/86euzxxc2
                  },
                  HttpStatus.BAD_REQUEST
                )
              }
              // 'Weekly Nomination'
              sheet1 = {
                ...sheet1,
                data: [[], this.objToArr(sheet1?.data[0]), this.objToArr(sheet1?.data[1]), [...this.truncateArrayHeadSheet1(this.objToArr(sheet1?.data[2])), ...weekly], ...sheet1?.data.slice(3).map((e: any) => this.truncateArrayHeadSheet1(this.objToArr(e)))]
              }
              sheet2 = {
                ...sheet2,
                data: [[], [...this.truncateArrayHeadSheet2(this.objToArr(sheet2.data[0]))], ...sheet2?.data.slice(1).map((e: any) => this.truncateArrayHeadSheet2(this.objToArr(e)))]
              }
              sheet3 = {
                ...sheet3,
                data: headNomSheet3
              }
            }
          }
        }
      } else {
        if (!!checkType) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              // error: 'The uploaded file must contain 1 sheets.',
              error: 'The uploaded file must contain 2 sheets.' // https://app.clickup.com/t/86etzcgzt
            },
            HttpStatus.BAD_REQUEST
          )
        } else {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'The uploaded file must contain 2 sheets.'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // const excelBuffer = await this.componentGenExcelNom(sheet1?.data, sheet2?.data, sheet3?.data, checkType)
      
      // https://app.clickup.com/t/86ex4r7eq
      uploadResponse = await uploadFilsTemp({
        // buffer: excelBuffer,
        buffer: fileOriginal?.buffer,
        originalname: `${fileOriginal?.originalname}`
      })
      console.log('uploadResponse : ', uploadResponse);
    }

    if (!!checkTemplate) {
      // มี ให้ update
      const uploadTemplateId = await this.prisma.upload_template_for_shipper.findFirst({
        where: {
          nomination_type_id: Number(nomination_type_id),
          contract_code_id: Number(contract_code_id),
          group_id: Number(shipper_id),

          AND: [
            {
              OR: [
                {
                  del_flag: false
                },
                {
                  del_flag: null
                }
              ]
            }
          ]
        }
      })

      const update = await this.prisma.upload_template_for_shipper.updateMany({
        where: {
          id: Number(uploadTemplateId?.id ?? -1)
        },
        data: {
          update_date: getTodayNowAdd7().toDate(),
          update_date_num: getTodayNowAdd7().unix(),
          update_by: Number(userId)
          // update_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }
      })
      if (!!uploadTemplateId) {
        if (file) {
          if (!!comment && comment !== 'null') {
            await this.prisma.upload_template_for_shipper_comment.create({
              data: {
                ...(!!uploadTemplateId?.id && {
                  upload_template_for_shipper: {
                    connect: {
                      id: Number(uploadTemplateId?.id)
                    }
                  }
                }),
                comment: comment,
                create_date: getTodayNowAdd7().toDate(),
                create_date_num: getTodayNowAdd7().unix(),
                create_by_account: {
                  connect: {
                    id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                  }
                }
              }
            })
          }
          await this.prisma.upload_template_for_shipper_file.create({
            data: {
              ...(!!uploadTemplateId?.id && {
                upload_template_for_shipper: {
                  connect: {
                    id: Number(uploadTemplateId?.id)
                  }
                }
              }),
              url: uploadResponse?.file?.url,
              create_date: new Date(),
              // create_date: dayjs(
              //   dayjs().tz('Asia/Bangkok').format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
              // )
              //   .tz('Asia/Bangkok')
              //   .toDate(),
              // create_by: Number(userId),
              create_date_num: Math.floor(Date.now() / 1000),
              create_by_account: {
                connect: {
                  id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                }
              }
            }
          })
        } else {
          await this.regenerate([Number(uploadTemplateId?.id)], userId, req, comment ?? 'Auto-Generated')
        }
      }

      return {
        id: uploadTemplateId?.id,
        message: `edit`
      }
    } else {
      // ไม่มีสร้างใหม่
      const create = await this.prisma.upload_template_for_shipper.create({
        data: {
          ...(!!shipper_id && {
            group: {
              connect: {
                id: Number(shipper_id)
              }
            }
          }),
          ...(!!contract_code_id && {
            contract_code: {
              connect: {
                id: Number(contract_code_id)
              }
            }
          }),
          ...(!!nomination_type_id && {
            nomination_type: {
              connect: {
                id: Number(nomination_type_id)
              }
            }
          }),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            }
          }
        }
      })
      if (!!create) {
        if (file) {
          if (!!comment && comment !== 'null') {
            await this.prisma.upload_template_for_shipper_comment.create({
              data: {
                ...(!!create?.id && {
                  upload_template_for_shipper: {
                    connect: {
                      id: Number(create?.id)
                    }
                  }
                }),
                comment: comment,
                create_date: getTodayNowAdd7().toDate(),
                create_date_num: getTodayNowAdd7().unix(),
                create_by_account: {
                  connect: {
                    id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                  }
                }
              }
            })
          }
          await this.prisma.upload_template_for_shipper_file.create({
            data: {
              ...(!!create?.id && {
                upload_template_for_shipper: {
                  connect: {
                    id: Number(create?.id)
                  }
                }
              }),
              url: uploadResponse?.file?.url,
              create_date: new Date(),
              // create_date: dayjs(
              //   dayjs().tz('Asia/Bangkok').format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
              // )
              //   .tz('Asia/Bangkok')
              //   .toDate(),
              // create_by: Number(userId),
              create_date_num: Math.floor(Date.now() / 1000),
              create_by_account: {
                connect: {
                  id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                }
              }
            }
          })
        } else {
          await this.regenerate([Number(create?.id)], userId, req, comment ?? 'Auto-Generated')
        }
      }

      return {
        id: create?.id,
        message: `create`
      }
    }
  }

  async editComment(payload: any, userId: any, req: any) {
    const {shipper_id, contract_code_id, nomination_type_id, comment} = payload

    // const findData = JSON.parse(file?.jsonDataMultiSheet);
    // const checkType = findData.reduce((acc: string | null, f: any) => {
    //   if (f?.sheet === 'Daily Nomination') return 'Daily Nomination';
    //   if (f?.sheet === 'Weekly Nomination') return 'Weekly Nomination';
    //   return acc;
    // }, null);

    const checkTemplate = await this.prisma.upload_template_for_shipper.findFirst({
      where: {
        group_id: Number(shipper_id),
        contract_code_id: Number(contract_code_id),
        nomination_type_id: Number(nomination_type_id),
        AND: [
          {
            OR: [
              {
                del_flag: false
              },
              {
                del_flag: null
              }
            ]
          }
        ]
      }
    })

    if (!!checkTemplate) {
      // มี ให้ update
      await this.prisma.upload_template_for_shipper_comment.create({
        data: {
          ...(!!checkTemplate?.id && {
            upload_template_for_shipper: {
              connect: {
                id: Number(checkTemplate?.id)
              }
            }
          }),
          comment: comment,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            }
          }
        }
      })

      return {
        id: checkTemplate?.id,
        message: `edit`
      }
    } else {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Nomination Point no date'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  async regenerate(id: any, userId: any, req: any, comment?: string) {
    const dataById = await this.prisma.upload_template_for_shipper.findMany({
      where: {
        id: {
          in: id
        },
        AND: [
          {
            OR: [
              {
                del_flag: false
              },
              {
                del_flag: null
              }
            ]
          }
        ]
      },
      include: {
        contract_code: {
          include: {
            booking_version: {
              include: {
                booking_row_json: true
              },
              where: {
                flag_use: true
              },
              orderBy: {
                id: 'desc'
              },
              take: 1
            },
            group: true
          }
        }
      }
    })

    const contractCodeArr = await this.prisma.contract_code.findMany({
      include: {
        booking_version: {
          include: {
            booking_row_json: true
          },
          orderBy: {
            id: 'desc'
          },
          take: 1
        },
        group: true
      }
      // orderBy: { id: 'desc', },
      // take: 1,
    })

    const weekly = this.getNextSundayDates()
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    // contractCode?.group?.id
    const conceptPoint = await this.prisma.concept_point.findMany({
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
        // limit_concept_point: {
        //   some: {
        //     group_id: Number(contractCode?.group?.id),
        //   },
        // },
      },
      include: {
        limit_concept_point: {
          include: {
            group: true
          }
        },
        type_concept_point: true
      }
    })

    let resultData: any = []
    for (let i = 0; i < dataById.length; i++) {
      let type = String(dataById[i]?.nomination_type_id)
      const typeOfNomination = String(type) === '1' ? 'Daily Nomination' : String(type) === '2' ? 'Weekly Nomination' : 'error type'

      //   กรองข้อมูลโดยใช้ .filter()
      const filteredConceptPoint = conceptPoint.filter((cp) => cp.limit_concept_point.some((lcp) => lcp.group.id === Number(dataById[i]?.contract_code?.group?.id)))

      const {excelBuffer} = await this.genExcelTemplateFinal({
        contract_code_id: dataById[i]?.contract_code?.id,
        type,
        todayStart,
        todayEnd,
        contractCode: dataById[i]?.contract_code,
        conceptPoint: filteredConceptPoint,
        typeOfNomination,
        weekly
      })

      const uploadResponse = await uploadFilsTemp({
        buffer: excelBuffer,
        originalname: `${typeOfNomination}.xlsx`
      })

      resultData.push({
        idMaster: dataById[i]?.id,
        url: uploadResponse?.file?.url || null
      })
    }

    for (let i = 0; i < resultData.length; i++) {
      const update = await this.prisma.upload_template_for_shipper.updateMany({
        where: {
          id: Number(resultData[i]?.idMaster ?? -1)
        },
        data: {
          update_date: getTodayNowAdd7().toDate(),
          update_date_num: getTodayNowAdd7().unix(),
          update_by: Number(userId)
        }
      })
      if (update.count > 0 && resultData[i]?.url) {
        const qn = await this.prisma.upload_template_for_shipper_file.create({
          data: {
            upload_template_for_shipper: {
              connect: {
                id: Number(resultData[i]?.idMaster)
              }
            },
            url: resultData[i]?.url,
            create_date: getTodayNowAdd7().toDate(),
            create_date_num: getTodayNowAdd7().unix(),
            create_by_account: {
              connect: {
                id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
              }
            }
          }
        })

        // comment
        await this.prisma.upload_template_for_shipper_comment.create({
          data: {
            ...(!!resultData[i]?.idMaster && {
              upload_template_for_shipper: {
                connect: {
                  id: Number(resultData[i]?.idMaster)
                }
              }
            }),
            comment: comment ?? 'Re-Generated',
            create_date: getTodayNowAdd7().toDate(),
            create_date_num: getTodayNowAdd7().unix(),
            create_by_account: {
              connect: {
                id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
              }
            }
          }
        })

        const his = await this.findOnce(resultData[i]?.idMaster)
        await this.writeReq(req, `upload-template-for-shipper`, 'regenerate', his)
      }
    }

    return resultData
  }

  getNextSundayDates() {
    const today = dayjs()
    const todayDay = today.day() // วันในสัปดาห์ (0 = อาทิตย์, 1 = จันทร์, ..., 6 = เสาร์)

    // หาอาทิตย์หน้า เริ่มวันอาทิต
    const startDate = today.add(7 - todayDay, 'day')

    // สร้าง array 7 วัน
    const weekDates = Array.from(
      {
        length: 7
      },
      (_, i) => startDate.add(i, 'day').format('DD/MM/YYYY')
    )

    return weekDates
  }

  async genExcelTemplate(payload: any) {
    let {contract_code_id, types} = payload
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const typeOfNomination = String(types) === '1' ? 'Daily Nomination' : String(types) === '2' ? 'Weekly Nomination' : 'error type'

    const contractCode = await this.prisma.contract_code.findFirst({
      where: {
        id: Number(contract_code_id)
      },
      include: {
        booking_version: {
          include: {
            booking_row_json: true
          },
          where: {
            flag_use: true
          },
          orderBy: {
            id: 'desc'
          },
          take: 1
        },
        group: true
      }
      // orderBy: { id: 'desc', },
      // take: 1,
    })

    const conceptPoint = await this.prisma.concept_point.findMany({
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
        limit_concept_point: {
          some: {
            group_id: Number(contractCode?.group?.id)
          }
        }
      },
      include: {
        limit_concept_point: {
          include: {
            group: true
          }
        },
        type_concept_point: true
      }
    })

    const filteredConceptPoint = conceptPoint.filter((cp) => cp.limit_concept_point.some((lcp) => lcp.group.id === Number(contractCode?.group?.id)))

    let type = String(types)
    const weekly = this.getNextSundayDates()
    return this.genExcelTemplateFinal({
      contract_code_id,
      type,
      todayStart,
      todayEnd,
      contractCode,
      conceptPoint: filteredConceptPoint,
      typeOfNomination,
      weekly
    })
  }

  async genExcelTemplateFinal(payload: any) {
    let {contract_code_id, type, todayStart, todayEnd, contractCode, conceptPoint, typeOfNomination, weekly} = payload

    // phase 1
    const entryContract = contractCode?.booking_version[0]?.booking_row_json.filter((f: any) => {
      return f?.entry_exit_id === 1
    })
    const exitContract = contractCode?.booking_version[0]?.booking_row_json.filter((f: any) => {
      return f?.entry_exit_id === 2
    })

    const contractPoint = await this.prisma.contract_point.findMany({
      where: {
        AND: [
          {
            contract_point_start_date: {
              lte: todayEnd
            }
          },
          {
            OR: [
              {
                contract_point_end_date: null
              },
              {
                contract_point_end_date: {
                  gt: todayStart
                }
              }
            ]
          }
        ]
      },
      include: {
        nomination_point_list: {
          include: {
            non_tpa_point: {
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
                        end_date: null
                      }, // ถ้า end_date เป็น null
                      // { end_date: { gte: getTodayStartAdd7().subtract(1, "day").toDate() } }, // https://app.clickup.com/t/86etzcgr9 //end_date ให้  - 1 (end จริง คือไม่ได้)
                      {
                        end_date: {
                          gt: todayStart
                        }
                      } //  // https://app.clickup.com/t/86etzcgr9 //end_date ให้  - 1 (end จริง คือไม่ได้)
                      // { end_date: { gte: todayStart } }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                    ]
                  }
                ]
              }
            },
            customer_type: true,
            area: true,
            zone: true,
            entry_exit: true
          },
          where: {
            AND: [
              {
                start_date: {
                  lte: todayEnd
                }
              },
              {
                OR: [
                  {
                    end_date: null
                  },
                  {
                    end_date: {
                      gt: todayStart
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    })

    let nomEntry = entryContract.flatMap((e: any) => {
      const findCP = contractPoint.find((f: any) => {
        return f?.contract_point === e?.contract_point
      })
      return findCP?.nomination_point_list || []
    })
    let nomExit = exitContract.flatMap((e: any) => {
      const findCP = contractPoint.find((f: any) => {
        return f?.contract_point === e?.contract_point
      })
      return findCP?.nomination_point_list || []
    })

    let nomAll = [...new Set([...nomEntry, ...nomExit].map((e: any) => e?.zone?.name))]

    const tempFixTemplate = {
      entryEastWI: ['EAST', 'Supply', '', '', 'East WI', '', '', '', '', 'BTU/SCF', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      entryEastHV: ['EAST', 'Supply', '', '', 'East HV', '', '', '', '', 'BTU/SCF', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      entryWestWI: ['WEST', 'Supply', '', '', 'West WI', '', '', '', '', 'BTU/SCF', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      entryWestHV: ['WEST', 'Supply', '', '', 'West HV', '', '', '', '', 'BTU/SCF', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      entryUnpark: ['', 'Supply', '', '', '', 'Unpark', '', '', '', 'MMBTU/D', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      entryInstructedEntry: ['', 'Supply', '', '', '', 'Instructed_Entry', '', '', '', 'MMBTU/D', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      exitPark: ['', 'Demand', '', '', '', 'Park', '', '', '', 'MMBTU/D', 'Exit', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      exitInstructedExit: ['', 'Demand', '', '', '', 'Instructed_Exit', '', '', '', 'MMBTU/D', 'Exit', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      exitShrinkageVolume: ['', 'Demand', '', '', '', 'Shrinkage_Volume', '', '', '', 'MMBTU/D', 'Exit', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      exitMinInventoryChange: ['', 'Demand', '', '', '', 'Min_Inventory_Change', '', '', '', 'MMBTU/D', 'Exit', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      exitExchangeMininventory: ['', 'Demand', '', '', '', 'Exchange_Min_Inventory', '', '', '', 'MMBTU/D', 'Exit', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      // exitEastToRA6: [
      //   "EAST",
      //   'Demand',
      //   "D",
      //   "East_to_RA6",
      //   "",
      //   '',
      //   'D To E',
      //   'D',
      //   '',
      //   'MMBTU/D',
      //   'Exit',
      //   '',
      //   '',
      //   '',
      //   ...(type === '1'
      //     ? Array(daily.length).fill('')
      //     : Array(weekly.length).fill('')),
      // ],
      // exitEastToBVW10: [
      //   "EAST",
      //   'Demand',
      //   "H",
      //   "East_to_BVW10",
      //   "",
      //   '',
      //   'H To F2',
      //   'H',
      //   '',
      //   'MMBTU/D',
      //   'Exit',
      //   '',
      //   '',
      //   '',
      //   ...(type === '1'
      //     ? Array(daily.length).fill('')
      //     : Array(weekly.length).fill('')),
      // ],
      // exitWestToRA6: [
      //   "WEST",
      //   'Demand',
      //   "F1",
      //   "West_to_RA6",
      //   "",
      //   '',
      //   'F1 To E',
      //   'F1',
      //   '',
      //   'MMBTU/D',
      //   'Exit',
      //   '',
      //   '',
      //   '',
      //   ...(type === '1'
      //     ? Array(daily.length).fill('')
      //     : Array(weekly.length).fill('')),
      // ],
      // exitWestToBVW10: [
      //   "WEST",
      //   'Demand',
      //   "F1",
      //   "West_to_BVW10",
      //   "",
      //   '',
      //   'F1 To F2',
      //   'F1',
      //   '',
      //   'MMBTU/D',
      //   'Exit',
      //   '',
      //   '',
      //   '',
      //   ...(type === '1'
      //     ? Array(daily.length).fill('')
      //     : Array(weekly.length).fill('')),
      // ],
      entryEmtry: ['', 'Supply', '', '', '', '', '', '', '', 'MMBTU/D', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      exitEmtry: ['', 'Demand', '', '', '', '', '', '', '', 'MMBTU/D', 'Exit', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],

      // exitEastNonTpa: [
      //   "",
      //   '',
      //   "",
      //   "T2_IPG",
      //   "",
      //   '',
      //   'NONTPA',
      //   '',
      //   '',
      //   'MMBTU/D',
      //   '',
      //   '',
      //   '',
      //   '',
      //   ...(type === '1'
      //     ? Array(daily.length).fill('')
      //     : Array(weekly.length).fill('')),
      // ],
      // exitOtherNonTpa: [
      //   "",
      //   '',
      //   "",
      //   "XXX",
      //   "",
      //   '',
      //   'NONTPA',
      //   '',
      //   '',
      //   'MMBTU/D',
      //   '',
      //   '',
      //   '',
      //   '',
      //   ...(type === '1'
      //     ? Array(daily.length).fill('')
      //     : Array(weekly.length).fill('')),
      // ],
      tNonTpa: ['', '', '', '', '', '', 'NONTPA', '', '', 'MMBTU/D', '', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],

      entryEastWestWI: ['EAST-WEST', 'Supply', '', '', 'East-West WI', '', '', '', '', 'BTU/SCF', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
      entryEastWestHV: ['EAST-WEST', 'Supply', '', '', 'East-West HV', '', '', '', '', 'BTU/SCF', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))]
    }

    const templateFixNom = [
      {
        zone: 'ALL',
        type: 3,
        entryExit: 1,
        text: 'Unpark'
      },
      {
        zone: 'ALL',
        type: 3,
        entryExit: 1,
        text: 'Instructed_Entry'
      },
      {
        zone: 'ALL',
        type: 3,
        entryExit: 2,
        text: 'Park'
      },
      {
        zone: 'ALL',
        type: 3,
        entryExit: 2,
        text: 'Instructed_Exit'
      },
      {
        zone: 'ALL',
        type: 3,
        entryExit: 2,
        text: 'Shrinkage_Volume'
      },
      {
        zone: 'ALL',
        type: 3,
        entryExit: 2,
        text: 'Min_Inventory_Change'
      },
      {
        zone: 'ALL',
        type: 3,
        entryExit: 2,
        text: 'Exchange_Min_Inventory'
      },
      {
        zone: 'ALL',
        type: 2,
        entryExit: 2,
        text: 'SOTD_Park'
      },
      {
        zone: 'ALL',
        type: 2,
        entryExit: 2,
        text: 'EOTD_Park'
      },

      {
        zone: 'EAST',
        type: 2,
        entryExit: 1,
        text: 'Common to Super Header'
      },
      {
        zone: 'EAST',
        type: 2,
        entryExit: 1,
        text: 'Common to FTP Header'
      },
      {
        zone: 'EAST',
        type: 2,
        entryExit: 1,
        text: 'Super to FTP Header'
      },
      {
        zone: 'EAST',
        type: 2,
        entryExit: 1,
        text: 'PTT LNG Total'
      },
      {
        zone: 'EAST',
        type: 2,
        entryExit: 1,
        text: 'Total_OS_123_Area_R'
      },
      {
        zone: 'EAST',
        type: 2,
        entryExit: 1,
        text: 'Total_OS_4'
      },
      {
        zone: 'EAST',
        type: 2,
        entryExit: 1,
        text: 'Total_Onshore_P_IF'
      },
      {
        zone: 'EAST',
        type: 2,
        entryExit: 2,
        text: 'East_to_RA6'
      }, // ไฮไลแดง
      {
        zone: 'EAST',
        type: 2,
        entryExit: 2,
        text: 'East_to_BVW10'
      }, // ไฮไลแดง
      {
        zone: 'EAST',
        type: 2,
        entryExit: 2,
        text: 'Total_OS_East_Exit_P_IF'
      },

      {
        zone: 'WEST',
        type: 2,
        entryExit: 1,
        text: 'Total_OS_West'
      },
      {
        zone: 'WEST',
        type: 2,
        entryExit: 1,
        text: 'Total_OS_West_P_IF'
      },
      {
        zone: 'WEST',
        type: 2,
        entryExit: 2,
        text: 'West_to_RA6'
      }, // ไฮไลแดง
      {
        zone: 'WEST',
        type: 2,
        entryExit: 2,
        text: 'West_to_BVW10'
      }, // ไฮไลแดง
      {
        zone: 'WEST',
        type: 2,
        entryExit: 2,
        text: 'Total_OS_West_Exit_P_IF'
      },

      {
        zone: 'EAST-WEST',
        type: 2,
        entryExit: 1,
        text: 'East'
      },
      {
        zone: 'EAST-WEST',
        type: 2,
        entryExit: 1,
        text: 'West'
      },
      {
        zone: 'EAST-WEST',
        type: 2,
        entryExit: 1,
        text: 'Total_Mix_Supply'
      },
      {
        zone: 'EAST-WEST',
        type: 2,
        entryExit: 1,
        text: 'Total_OS_East_West'
      },
      {
        zone: 'EAST-WEST',
        type: 2,
        entryExit: 1,
        text: 'Total_OS_East_West_P_IF'
      },
      {
        zone: 'EAST-WEST',
        type: 2,
        entryExit: 2,
        text: 'Total_OS_East_West_Exit_P_IF'
      }
    ]

    // nomEntry
    // nomExit
    // e?.nomination_point

    const nominationMas = await this.prisma.nomination_point.findMany({
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
                end_date: null
              }, // ถ้า end_date เป็น null
              // { end_date: { gte: getTodayStartAdd7().subtract(1, "day").toDate() } }, // https://app.clickup.com/t/86etzcgr9 //end_date ให้  - 1 (end จริง คือไม่ได้)
              {
                end_date: {
                  gt: todayStart
                }
              } //  // https://app.clickup.com/t/86etzcgr9 //end_date ให้  - 1 (end จริง คือไม่ได้)
              // { end_date: { gte: todayStart } }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      include: {
        non_tpa_point: {
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
                    end_date: null
                  }, // ถ้า end_date เป็น null
                  // { end_date: { gte: getTodayStartAdd7().subtract(1, "day").toDate() } }, // https://app.clickup.com/t/86etzcgr9 //end_date ให้  - 1 (end จริง คือไม่ได้)
                  {
                    end_date: {
                      gt: todayStart
                    }
                  } //  // https://app.clickup.com/t/86etzcgr9 //end_date ให้  - 1 (end จริง คือไม่ได้)
                  // { end_date: { gte: todayStart } }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ]
              }
            ]
          }
        }
      }
    })

    // concept_point
    for (let i = 0; i < nomEntry.length; i++) {
      const findExp = nominationMas.find((f: any) => f?.nomination_point === nomEntry[i]?.nomination_point)
      if (!!!findExp) {
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: 'Nomination Point expired date',
        //   },
        //   HttpStatus.BAD_REQUEST,
        // );
        nomEntry.splice(i, 1)
        i-- //   อย่าลืมลด index หลังลบ
      }
    }
    for (let i = 0; i < nomExit.length; i++) {
      const findExp = nominationMas.find((f: any) => f?.nomination_point === nomExit[i]?.nomination_point)
      if (!!!findExp) {
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: 'Nomination Point expired date',
        //   },
        //   HttpStatus.BAD_REQUEST,
        // );
        nomExit.splice(i, 1)
        i-- //   อย่าลืมลด index หลังลบ
      }
    }

    // // NONTPA non_tpa_point non_tpa_point_name
    let setEntry = nomEntry.flatMap((e: any) => {
      return [
        [e?.zone?.name, 'Supply', e?.area?.name, e?.nomination_point, '', '', e?.customer_type?.name, '', '', 'MMSCFD', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))],
        [e?.zone?.name, 'Supply', e?.area?.name, e?.nomination_point, '', '', e?.customer_type?.name, '', '', 'MMBTU/D', 'Entry', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))]
      ]
    })
    let setExit = nomExit.flatMap((e: any) => {
      return [[e?.zone?.name, 'Demand', e?.area?.name, e?.nomination_point, '', '', e?.customer_type?.name, '', '', 'MMBTU/D', 'Exit', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))]]
    })
    let setEntrySheet2 = nomEntry.flatMap((e: any) => {
      return [[e?.zone?.name, e?.nomination_point, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']]
    })
    let setExitSheet2 = nomExit.flatMap((e: any) => {
      return [[e?.zone?.name, e?.nomination_point, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']]
    })

    let setAlls = nomAll.flatMap((e: any) => {
      // entry
      const damTextTyAll2 = conceptPoint
        .filter((f: any) => {
          return f?.type_concept_point_id === 2
        })
        .map((t: any) => t?.concept_point)
      const damTextTyAll3 = conceptPoint
        .filter((f: any) => {
          return f?.type_concept_point_id === 3
        })
        .map((t: any) => t?.concept_point)
      let allArr = []
      let filNomEntry = setEntry.filter((f: any) => {
        return f[0] === e
      })
      allArr = [...allArr, ...filNomEntry]

      if (e === 'EAST') {
        const textTyEastEntry2 = templateFixNom
          .filter((f: any) => {
            return f?.zone === 'EAST' && f?.entryExit === 1 && f?.type === 2
          })
          .map((t: any) => t?.text)
        const matchedDamTextTyEastEntry2 = textTyEastEntry2.filter((name) => damTextTyAll2.includes(name)) //ตรงกัน
        let dMatchedDamTextTyEastEntry2 = matchedDamTextTyEastEntry2.map((dM: any) => {
          let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
          tExit[0] = e
          tExit[3] = dM
          return tExit
        })
        allArr = [...allArr, ...dMatchedDamTextTyEastEntry2]
      } else if (e === 'WEST') {
        const textTyWestEntry2 = templateFixNom
          .filter((f: any) => {
            return f?.zone === 'WEST' && f?.entryExit === 1 && f?.type === 2
          })
          .map((t: any) => t?.text)
        const matchedDamTextTyWestEntry2 = textTyWestEntry2.filter((name) => damTextTyAll2.includes(name)) //ตรงกัน
        let dMatchedDamTextTyWestEntry2 = matchedDamTextTyWestEntry2.map((dM: any) => {
          let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
          tExit[0] = e
          tExit[3] = dM
          return tExit
        })
        allArr = [...allArr, ...dMatchedDamTextTyWestEntry2]
      } else if (e === 'EAST-WEST') {
        const textTyEastWestEntry2 = templateFixNom
          .filter((f: any) => {
            return f?.zone === 'EAST-WEST' && f?.entryExit === 1 && f?.type === 2
          })
          .map((t: any) => t?.text)
        const matchedDamTextTyEastWestEntry2 = textTyEastWestEntry2.filter((name) => damTextTyAll2.includes(name)) //ตรงกัน
        let dMatchedDamTextTyEastWestEntry2 = matchedDamTextTyEastWestEntry2.map((dM: any) => {
          let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
          tExit[0] = e
          tExit[3] = dM
          return tExit
        })
        allArr = [...allArr, ...dMatchedDamTextTyEastWestEntry2]
      }

      const textTyAllEntry2 = templateFixNom
        .filter((f: any) => {
          return f?.zone === 'ALL' && f?.entryExit === 1 && f?.type === 2
        })
        .map((t: any) => t?.text)
      const matchedDamTextTyAllEntry2 = textTyAllEntry2.filter((name) => damTextTyAll2.includes(name)) //ตรงกัน
      let dMatchedDamTextTyAllEntry2 = matchedDamTextTyAllEntry2.map((dM: any) => {
        let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
        tExit[0] = e
        tExit[3] = dM
        return tExit
      })
      allArr = [...allArr, ...dMatchedDamTextTyAllEntry2]

      if (e === 'EAST') {
        allArr = [...allArr, tempFixTemplate?.entryEastWI, tempFixTemplate?.entryEastHV]
      } else if (e === 'WEST') {
        allArr = [...allArr, tempFixTemplate?.entryWestWI, tempFixTemplate?.entryWestHV]
      } else if (e === 'EAST-WEST') {
        allArr = [...allArr, tempFixTemplate?.entryEastWestWI, tempFixTemplate?.entryEastWestHV]
      }

      const textTyAllEntry3 = templateFixNom
        .filter((f: any) => {
          return f?.zone === 'ALL' && f?.entryExit === 1 && f?.type === 3
        })
        .map((t: any) => t?.text)
      const matchedDamTextTyAllEntry3 = textTyAllEntry3.filter((name) => damTextTyAll3.includes(name)) //ตรงกัน
      let dMatchedDamTextTyAllEntry3 = matchedDamTextTyAllEntry3.map((dM: any) => {
        let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
        tExit[0] = e
        tExit[5] = dM
        return tExit
      })

      allArr = [...allArr, ...dMatchedDamTextTyAllEntry3]

      // filNomEntry [3] NONTPA
      // nominationMas.find((f:any) => f?.nomination_point === nomEntry[i]?.nomination_point )
      const nonTpaEntry = nomEntry?.filter((f: any) => {
        return f?.non_tpa_point?.length > 0
      })
      for (let iNonTpa = 0; iNonTpa < nonTpaEntry.length; iNonTpa++) {
        if (nonTpaEntry[iNonTpa]?.zone?.name === e) {
          for (let iDataNonTpa = 0; iDataNonTpa < nonTpaEntry[iNonTpa]?.non_tpa_point.length; iDataNonTpa++) {
            let non = JSON.parse(JSON.stringify(tempFixTemplate?.tNonTpa || []))
            non[0] = e
            const nonTpaName = nonTpaEntry[iNonTpa]?.non_tpa_point[iDataNonTpa]?.non_tpa_point_name
            non[3] = nonTpaName
            // allArr = [...allArr, non]
            allArr.push(non)
          }
        }
      }

      //
      //

      // -------------------------
      // -------------------------

      // exit
      let filNomExit = setExit.filter((f: any) => {
        return f[0] === e
      })
      allArr = [...allArr, ...filNomExit]

      // if(e === "EAST"){ //ไฮไลท์แดง
      //   allArr = [...allArr, tempFixTemplate?.exitEastToRA6, tempFixTemplate?.exitEastToBVW10]
      // }else if(e === "WEST"){
      //   allArr = [...allArr, tempFixTemplate?.exitWestToRA6, tempFixTemplate?.exitWestToBVW10]
      // }
      // if(e === "EAST"){ //ไฮไลท์แดง
      //   allArr = [...allArr, tempFixTemplate?.exitEastToRA6, tempFixTemplate?.exitEastToBVW10]
      // }else if(e === "WEST"){
      //   allArr = [...allArr, tempFixTemplate?.exitWestToRA6, tempFixTemplate?.exitWestToBVW10]
      // }

      if (e === 'EAST') {
        const textTyEastExit2 = templateFixNom
          .filter((f: any) => {
            return f?.zone === 'EAST' && f?.entryExit === 2 && f?.type === 2
          })
          .map((t: any) => t?.text)
        const matchedDamTextTyEastExit2 = textTyEastExit2.filter((name) => damTextTyAll2.includes(name)) //ตรงกัน
        let dMatchedDamTextTyEastExit2 = matchedDamTextTyEastExit2.map((dM: any) => {
          let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
          tExit[0] = e
          tExit[3] = dM
          return tExit
        })
        allArr = [...allArr, ...dMatchedDamTextTyEastExit2]
      } else if (e === 'WEST') {
        const textTyWestExit2 = templateFixNom
          .filter((f: any) => {
            return f?.zone === 'WEST' && f?.entryExit === 2 && f?.type === 2
          })
          .map((t: any) => t?.text)
        const matchedDamTextTyWestExit2 = textTyWestExit2.filter((name) => damTextTyAll2.includes(name)) //ตรงกัน
        let dMatchedDamTextTyWestExit2 = matchedDamTextTyWestExit2.map((dM: any) => {
          let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
          tExit[0] = e
          tExit[3] = dM
          return tExit
        })
        allArr = [...allArr, ...dMatchedDamTextTyWestExit2]
      } else if (e === 'EAST-WEST') {
        const textTyEastWestExit2 = templateFixNom
          .filter((f: any) => {
            return f?.zone === 'EAST-WEST' && f?.entryExit === 2 && f?.type === 2
          })
          .map((t: any) => t?.text)
        const matchedDamTextTyEastWestExit2 = textTyEastWestExit2.filter((name) => damTextTyAll2.includes(name)) //ตรงกัน
        let dMatchedDamTextTyEastWestExit2 = matchedDamTextTyEastWestExit2.map((dM: any) => {
          let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
          tExit[0] = e
          tExit[3] = dM
          return tExit
        })
        allArr = [...allArr, ...dMatchedDamTextTyEastWestExit2]
      }

      const textTyAllExit2 = templateFixNom
        .filter((f: any) => {
          return f?.zone === 'ALL' && f?.entryExit === 2 && f?.type === 2
        })
        .map((t: any) => t?.text)
      const matchedDamTextTyAllExit2 = textTyAllExit2.filter((name) => damTextTyAll2.includes(name)) //ตรงกัน
      // const notInTextTy2 = damTextTyAll2.filter(damName => textTyAllExit2.every(text => !damName.includes(text))); //ที่ไม่มี
      let dMatchedDamTextTyAllExit2 = matchedDamTextTyAllExit2.map((dM: any) => {
        let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
        tExit[0] = e
        tExit[3] = dM
        return tExit
      })
      allArr = [...allArr, ...dMatchedDamTextTyAllExit2]

      const textTyAllExit3 = templateFixNom
        .filter((f: any) => {
          return f?.zone === 'ALL' && f?.entryExit === 2 && f?.type === 3
        })
        .map((t: any) => t?.text)
      const matchedDamTextTyAllExit3 = textTyAllExit3.filter((name) => damTextTyAll3.includes(name)) //ตรงกัน
      let dMatchedDamTextTyAllExit3 = matchedDamTextTyAllExit3.map((dM: any) => {
        let tExit = JSON.parse(JSON.stringify(tempFixTemplate?.exitEmtry || []))
        tExit[0] = e
        tExit[5] = dM
        return tExit
      })

      allArr = [...allArr, ...dMatchedDamTextTyAllExit3]
      // exitEastNonTpa
      // exitOtherNonTpa
      // filNomExit [3] NONTPA
      // tNonTpa

      const nonTpaExit = nomExit?.filter((f: any) => {
        return f?.non_tpa_point?.length > 0
      })
      for (let iNonTpa = 0; iNonTpa < nonTpaExit.length; iNonTpa++) {
        if (nonTpaExit[iNonTpa]?.zone?.name === e) {
          for (let iDataNonTpa = 0; iDataNonTpa < nonTpaExit[iNonTpa]?.non_tpa_point?.length; iDataNonTpa++) {
            let non = JSON.parse(JSON.stringify(tempFixTemplate?.tNonTpa || []))
            non[0] = e
            const nonTpaName = nonTpaExit[iNonTpa]?.non_tpa_point[iDataNonTpa]?.non_tpa_point_name
            non[3] = nonTpaName
            // allArr = [...allArr, non]
            allArr.push(non)
          }
        }
      }
      return allArr
    })

    // phase 2 ข้อ 7
    const nominationPhysicalGasConcepts = conceptPoint
      .filter((f: any) => {
        return f?.type_concept_point?.id === 2
      })
      .map((t: any) => t?.concept_point)
    const gasQualityRelatedConcepts = conceptPoint
      .filter((f: any) => {
        return f?.type_concept_point?.id === 1
      })
      .map((t: any) => t?.concept_point)
      ?.filter((f: any) => {
        return !['East-West WI', 'East-West HV', 'West WI', 'West HV', 'East WI', 'East HV'].includes(f)
      })
    const otherConcepts = conceptPoint
      .filter((f: any) => {
        return f?.type_concept_point?.id === 3
      })
      .map((t: any) => t?.concept_point)

    const AllType1 = templateFixNom
      .filter((f: any) => {
        return f?.type === 1
      })
      .map((t: any) => t?.text)
    const notInTextTy1 = gasQualityRelatedConcepts.filter((damName) => AllType1.every((text) => !damName.includes(text))) //ที่ไม่มี
    const AllType2 = templateFixNom
      .filter((f: any) => {
        return f?.type === 2
      })
      .map((t: any) => t?.text)
    const notInTextTy2 = nominationPhysicalGasConcepts.filter((damName) => AllType2.every((text) => !damName.includes(text))) //ที่ไม่มี
    const AllType3 = templateFixNom
      .filter((f: any) => {
        return f?.type === 3
      })
      .map((t: any) => t?.text)
    const notInTextTy3 = otherConcepts.filter((damName) => AllType3.every((text) => !damName.includes(text))) //ที่ไม่มี

    let setNominationPhysicalGasConcepts = notInTextTy2.flatMap((e: any) => {
      return [['', '', '', e, '', '', '', '', '', '', '', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))]]
    })

    let setGasQualityRelatedConcepts = notInTextTy1.flatMap((e: any) => {
      return [['', '', '', '', e, '', '', '', '', '', '', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))]]
    })

    let setotherConcepts = notInTextTy3.flatMap((e: any) => {
      return [['', '', '', '', '', e, '', '', '', '', '', '', '', '', ...(type === '1' ? Array(daily.length).fill('') : Array(weekly.length).fill(''))]]
    })

    const calcSetAlls =
      type === '1'
        ? setAlls?.map((e: any, ix: any) => {
            //https://app.clickup.com/t/86euzxxgg
            e[e.length - 1] = ''
            // e[e.length - 1] = {
            //   f: `= SUM(O${ ix + 5}:AL${ ix + 5 })`,
            // };
            return e
          })
        : setAlls
    const calcSetNominationPhysicalGasConcepts =
      type === '1'
        ? setNominationPhysicalGasConcepts?.map((e: any, ix: any) => {
            //https://app.clickup.com/t/86euzxxgg
            e[e.length - 1] = ''
            // e[e.length - 1] = {
            //   f: `= SUM(O${ ix + 5 + (calcSetAlls.length + 1)}: AL${ ix + 5 + (calcSetAlls.length + 1)})`,
            // };
            return e
          })
        : setNominationPhysicalGasConcepts
    const calcSetGasQualityRelatedConcepts =
      type === '1'
        ? setGasQualityRelatedConcepts?.map((e: any, ix: any) => {
            //https://app.clickup.com/t/86euzxxgg
            e[e.length - 1] = ''
            // e[e.length - 1] = {
            //   f: `= SUM(O${ ix + 5 + (calcSetAlls.length + 1) + (calcSetNominationPhysicalGasConcepts.length + 1)}: AL${ ix + 5 + (calcSetAlls.length + 1) + (calcSetNominationPhysicalGasConcepts.length + 1)})`,
            // };
            return e
          })
        : setGasQualityRelatedConcepts
    const calcSetotherConcepts =
      type === '1'
        ? setotherConcepts?.map((e: any, ix: any) => {
            //https://app.clickup.com/t/86euzxxgg
            e[e.length - 1] = ''
            // e[e.length - 1] = {
            //   f: `= SUM(O${ ix + 5 + (calcSetAlls.length + 1) + (calcSetNominationPhysicalGasConcepts.length + 1) + (calcSetGasQualityRelatedConcepts.length + 1)}: AL${ ix + 5 + (calcSetAlls.length + 1) + (calcSetNominationPhysicalGasConcepts.length + 1) + (calcSetGasQualityRelatedConcepts.length + 1)})`,
            // };
            return e
          })
        : setotherConcepts

    const data = [
      [], // Row 0
      ['SHIPPER ID', 'CONTRACT CODE', 'START DATE'], // Row 1
      [`${contractCode?.group?.id_name}`, `${contractCode?.contract_code}`, 'DD/MM/YYYY'], // Row 2
      [...headNom, ...(type === '1' ? daily : type === '2' ? weekly : [])], // Row 3
      // ...setEntry,
      // ...setExit,
      // ...setAlls,
      ...calcSetAlls,

      ...calcSetNominationPhysicalGasConcepts,
      ...calcSetGasQualityRelatedConcepts,
      ...calcSetotherConcepts
    ]
    const data2 = [
      [], // Row 0
      headNomSheet2, // Row 1,
      ...setEntrySheet2,
      // ...setExitSheet2,
      ['*'],
      ['ห้ามลบดอกจันด้านบน']
    ]
    const data3 = headNomSheet3

    const excelBuffer = await this.componentGenExcelNom(data, data2, data3, typeOfNomination)

    // ส่ง buffer กลับไปเพื่อให้ controller สามารถใช้งานต่อไปได้
    return {
      excelBuffer,
      typeOfNomination: `${typeOfNomination} `
    }
  }
}
