import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx-js-style';
import * as fs from 'fs';
import * as FormData from 'form-data';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

import * as isBetween from 'dayjs/plugin/isBetween'; // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'; // นำเข้า plugin isSameOrBefore
import axios from 'axios';
import { PathManagementService } from 'src/path-management/path-management.service';
import { Prisma } from '@prisma/client';
import { UploadTemplateForShipperService } from 'src/upload-template-for-shipper/upload-template-for-shipper.service';
import { FileUploadService } from 'src/grpc/file-service.service';
import {
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayNowDDMMYYYYDfault,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayStartAdd7,
} from 'src/common/utils/date.util';
import { uploadFilsTemp } from 'src/common/utils/uploadFileIn';
import { parseToNumber } from 'src/common/utils/number.util';
dayjs.extend(isSameOrBefore); // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween); // เปิดใช้งาน plugin isBetween
dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class CapacityMiddleService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private readonly uploadTemplateForShipperService: UploadTemplateForShipperService,
    private readonly fileUploadService: FileUploadService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) { }

  genMD(startDate: string, endDate: string, mode: number): boolean {
    const starts = startDate ? getTodayNowDDMMYYYYAdd7(startDate) : null;
    const ends = endDate ? getTodayNowDDMMYYYYAdd7(endDate) : null;
    let diff;
    // คำนวณความแตกต่างตามโหมดที่กำหนด
    if (mode === 1) {
      diff = (ends || dayjs()).diff((starts || dayjs()), 'day') + 1; // คำนวณต่างกันเป็นจำนวนวัน
    } else if (mode === 2) {
      
      diff = (ends || dayjs()).diff((starts || dayjs()), 'month') + 1; // นับเดือนจากต้นเดือนถึงสิ้นเดือน
      
    }
    return diff;
  }

  checkDateRange(
    startDate: string,
    endDate: string,
    file_period_mode: number,
    min: number,
    max: number,
  ): boolean {
    const starts = startDate ? getTodayNowDDMMYYYYAdd7(startDate) : null;
    const ends = endDate ? getTodayNowDDMMYYYYAdd7(endDate) : null;
    let diff;


    // คำนวณความแตกต่างตามโหมดที่กำหนด
    if (file_period_mode === 1) {
      diff = (ends || dayjs()).diff((starts || dayjs()), 'day'); // คำนวณต่างกันเป็นจำนวนวัน
    } else if (file_period_mode === 2) {
      diff = (ends || dayjs()).endOf('month').diff((starts || dayjs()).startOf('month'), 'month'); // นับเดือนจากต้นเดือนถึงสิ้นเดือน
    } else if (file_period_mode === 3) {
      diff = (ends || dayjs()).diff((starts || dayjs()), 'year'); // คำนวณต่างกันเป็นจำนวนปี
    } else {
      return false; // กรณี mode ไม่ตรงกับเงื่อนไขที่กำหนด
    }
    // ตรวจสอบความแตกต่างว่าอยู่ในช่วง min และ max หรือไม่
    return diff >= min && diff <= max;
  }

  async getContractPointByName(name: any, group: any) {
    const todayStart = getTodayStartAdd7().toDate();
    const todayEnd = getTodayEndAdd7().toDate();

    return await this.prisma.contract_point.findFirst({
      select: {
        id: true,
        contract_point: true,
        area: {
          select: {
            id: true,
            name: true,
          },
          where: {
            AND: [
              {
                start_date: {
                  lte: todayEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                },
              },
              {
                OR: [
                  { end_date: null }, // ถ้า end_date เป็น null
                  { end_date: { gte: todayStart } }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                ],
              },
            ],
          },
        },
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      where: {
        contract_point: name,
        AND: [
          {
            contract_point_start_date: {
              lte: todayEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            },
          },
          {
            OR: [
              { contract_point_end_date: null }, // ถ้า end_date เป็น null
              { contract_point_end_date: { gte: todayStart } }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ],
          },
        ],
      },
    });
  }

  generateExpectedDates = (start, end, mode, fixday, todayday) => {
    const dates = [];
    let current = dayjs(start, 'DD/MM/YYYY');
    const endDay = dayjs(end, 'DD/MM/YYYY').subtract(1, 'day');

    if (mode === 1) {
      while (current.isBefore(endDay) || current.isSame(endDay)) {
        dates.push(current.format('DD/MM/YYYY'));
        current = current.add(1, 'day');
      }
    } else if (mode === 2) {
      while (current.isBefore(endDay) || current.isSame(endDay)) {
        let targetDate = current.date(fixday);
        if (targetDate.month() !== current.month()) {
          targetDate = targetDate.endOf('month'); // ใช้วันสุดท้ายของเดือนหาก fixday ไม่มีในเดือนนั้น
        }
        dates.push(targetDate.format('DD/MM/YYYY'));
        current = current.add(1, 'month');
      }
    } else if (mode === 3) {
      current = current.add(todayday, 'day');
      while (current.isBefore(endDay) || current.isSame(endDay)) {
        dates.push(current.format('DD/MM/YYYY'));
        current = current.add(1, 'day');
      }
    }

    return dates;
  };

  validateDateEntries = (data, mode, fixday, todayday, minDate, maxDate) => {
    const start = data.start;
    const end = data.end;
    const result = { start, end, date: {} };

    for (const key in data.date) {
      const expectedDates = this.generateExpectedDates(
        minDate,
        maxDate,
        mode,
        fixday,
        todayday,
      );
      const actualDates = data.date[key];

      const isLengthMatching = actualDates.length === expectedDates.length;
      const areDatesMatching = actualDates.every((date) => {
        return expectedDates.includes(date);
      });

      const validationResult = isLengthMatching && areDatesMatching;

      result.date[key] = mode === 2 ? true : validationResult;
    }

    return result;
  };

  extractValidationResults = (result: any) => {
    return Object.values(result);
  };

  async getGroupByName(name: any) {
    return await this.prisma.group.findFirst({
      where: {
        name: name,
        user_type_id: 3,
      },
      include: {
        shipper_contract_point: {
          include: {
            contract_point: true,
          },
        },
      },
    });
  }

  async getGroupByIDName(id_name: any) {
    return await this.prisma.group.findFirst({
      where: {
        id_name: id_name,
        user_type_id: 3,
      },
      include: {
        shipper_contract_point: {
          include: {
            contract_point: true,
          },
        },
      },
    });
  }

  typeOfContractNumToText(type: any) {
    const typeOfContract =
      type === '1'
        ? 'LONG'
        : type === '2'
          ? 'MEDIUM'
          : type === '3'
            ? 'SHORT_FIRM'
            : type === '4'
              ? 'SHORT_NON_FIRM'
              : 'error type';
    return typeOfContract;
  }

  typeOfContractTextToNum(typeOfContract: any) {
    const typeOfContractText =
      typeOfContract === 'LONG'
        ? 1
        : typeOfContract === 'MEDIUM'
          ? 2
          : typeOfContract === 'SHORT_FIRM'
            ? 3
            : typeOfContract === 'SHORT_NON_FIRM'
              ? 4
              : null;
    return typeOfContractText;
  }

  mapKeyOldWithValue(arg1: any, headerEntry: any, rowValueOld: any) {
    const result: any = {};

    for (const [key, value] of Object.entries(arg1)) {
      const { main, key: date } = value as { main: string; key: string }; // ระบุโครงสร้างของ value
      let keyOld = null;

      if (headerEntry[main] && headerEntry[main][date]) {
        keyOld = headerEntry[main][date].key; // ดึงค่า keyOld
      }

      result[key] = {
        ...(value as { main: string; key: string }), // ระบุว่าคุณกำลังคัดลอกออบเจ็กต์
        keyOld,
        value: keyOld && rowValueOld[keyOld] ? rowValueOld[keyOld] : null,
      };
    }

    return result;
  }

  mapKeyOldWithClosestValue(arg1: any, headerEntry: any, rowValueOld: any) {
    const result: any = {};

    // Helper function: หา keyOld ที่ใกล้เคียงที่สุด
    const findClosestKeyOld = (
      main: string,
      targetDate: string,
    ): string | null => {
      if (!headerEntry[main]) return null;

      let closestDate: string | null = null;
      let closestKey: string | null = null;

      for (const [date, entry] of Object.entries(headerEntry[main])) {
        if (entry && typeof entry === 'object' && 'key' in entry) {
          const entryKey = (entry as { key: string }).key;

          // เปรียบเทียบความต่างของวันที่โดยใช้ dayjs
          const currentDiff = Math.abs(
            dayjs(date, 'DD/MM/YYYY').diff(
              dayjs(targetDate, 'DD/MM/YYYY'),
              'day',
            ),
          );
          const closestDiff = closestDate
            ? Math.abs(
              dayjs(closestDate, 'DD/MM/YYYY').diff(
                dayjs(targetDate, 'DD/MM/YYYY'),
                'day',
              ),
            )
            : Infinity;

          if (currentDiff < closestDiff) {
            closestDate = date;
            closestKey = entryKey;
          }
        }
      }

      return closestKey;
    };

    // วนลูปแต่ละ key ใน arg1
    for (const [key, value] of Object.entries(arg1)) {
      if (
        value &&
        typeof value === 'object' &&
        'main' in value &&
        'key' in value
      ) {
        const {
          main,
          key: date,
          value: existingValue,
        } = value as {
          main: string;
          key: string;
          value: any;
        };

        let keyOld = null;

        // ตรวจสอบว่า main และวันที่มีอยู่ใน headerEntry หรือไม่
        if (headerEntry[main] && headerEntry[main][date]) {
          keyOld = headerEntry[main][date].key; // ดึง keyOld จาก headerEntry ถ้าตรง
        } else if (!existingValue) {
          // ถ้าไม่มี value ให้หา keyOld ที่ใกล้เคียงที่สุด
          keyOld = findClosestKeyOld(main, date);
        }

        // เพิ่มข้อมูลลงใน result
        result[key] =
          keyOld && rowValueOld[keyOld] ? rowValueOld[keyOld] : null;
      }
    }

    return result;
  }

  mapKeyOldWithClosestValueNew(arg1: any, headerEntry: any, rowValueOld: any) {
    const result: any = {};

    // Helper function: หา keyOld ที่ใกล้เคียงที่สุด
    const findClosestKeyOld = (
      main: string,
      targetDate: string,
    ): string | null => {
      if (!headerEntry[main]) return null;

      let closestDate: string | null = null;
      let closestKey: string | null = null;

      for (const [date, entry] of Object.entries(headerEntry[main])) {
        if (entry && typeof entry === 'object' && 'key' in entry) {
          const entryKey = (entry as { key: string }).key;

          // เปรียบเทียบความต่างของวันที่โดยใช้ dayjs
          const currentDiff = Math.abs(
            dayjs(date, 'DD/MM/YYYY').diff(
              dayjs(targetDate, 'DD/MM/YYYY'),
              'day',
            ),
          );
          const closestDiff = closestDate
            ? Math.abs(
                dayjs(closestDate, 'DD/MM/YYYY').diff(
                  dayjs(targetDate, 'DD/MM/YYYY'),
                  'day',
                ),
              )
            : Infinity;

          if (currentDiff < closestDiff) {
            closestDate = date;
            closestKey = entryKey;
          }
        }
      }

      return closestKey;
    };

    // วนลูปแต่ละ key ใน arg1
    for (const [key, value] of Object.entries(arg1)) {
      if (
        value &&
        typeof value === 'object' &&
        'main' in value &&
        'key' in value
      ) {
        const {
          main,
          key: date,
          value: existingValue,
        } = value as {
          main: string;
          key: string;
          value: any;
        };

        let keyOld = null;

        // ตรวจสอบว่า main และวันที่มีอยู่ใน headerEntry หรือไม่
        if (headerEntry[main] && headerEntry[main][date]) {
          keyOld = headerEntry[main][date].key; // ดึง keyOld จาก headerEntry ถ้าตรง
        } else if (!existingValue) {
          // ถ้าไม่มี value ให้หา keyOld ที่ใกล้เคียงที่สุด
          keyOld = findClosestKeyOld(main, date);
        }

        // เพิ่มข้อมูลลงใน result
        result[key] =
          keyOld && rowValueOld[keyOld] ? rowValueOld[keyOld] : null;
      }
    }

    return result;
  }

  generateDailyArray(startDate: string, endDate: string): string[] {
    const starts = startDate ? getTodayNowDDMMYYYYAdd7(startDate) : null;
    const ends = endDate ? getTodayNowDDMMYYYYAdd7(endDate) : null;
    let result = [];
    let current = (starts || dayjs()).clone();

    while (current.isBefore(ends, 'day') || current.isSame(ends, 'day')) {
      result.push(current.format('DD/MM/YYYY'));
      current = current.add(1, 'day'); // เพิ่มทีละวัน
    }
    return result;
  }

  generateMonthlyArrayNew(startDate: string, endDate: string): string[] {
    // สมมติ getTodayNowDDMMYYYYAdd7 คืนค่าเป็น dayjs()
    const start = startDate ? getTodayNowDDMMYYYYAdd7(startDate).startOf('month') : null;
    const end   = endDate   ? getTodayNowDDMMYYYYAdd7(endDate).startOf('month')   : null;

    if (!start || !end) return [];

    const res: string[] = [];
    let cur = start.clone();

    // เอาเดือนตั้งแต่ start (รวม) จนถึงก่อน end (ไม่รวม)
    while (cur.isBefore(end, 'month')) {
      res.push(cur.format('DD/MM/YYYY')); // จะได้ "01/MM/YYYY"
      cur = cur.add(1, 'month');
    }
    return res;
  }


  adjustStartDate(startDate: any, fixDay: any) {
    const today = dayjs(); // วันที่ปัจจุบัน
    let start = dayjs(startDate, 'DD/MM/YYYY', true); // วันที่เริ่มต้นจาก input

    // ตรวจสอบจำนวนวันในเดือนของ startDate
    const daysInMonth = start.daysInMonth();
    // ตรวจสอบว่า fixDay อยู่ในเดือนของ startDate หรือไม่
    if (fixDay <= daysInMonth) {
      // ตั้งวันที่เป็น fixDay ในเดือนปัจจุบัน
      start = start.date(fixDay);
    } else {
      // ถ้า fixDay ไม่มีในเดือนปัจจุบัน ให้เลื่อนไปวันสุดท้ายของเดือนถัดไป
      start = start.add(1, 'month');
      const nextDaysInMonth = start.daysInMonth();
      start = start.date(Math.min(fixDay, nextDaysInMonth));
    }

    return start.format('DD/MM/YYYY');
  }

  generateMonthArray(
    startDate: string,
    endDate: string,
    fixDay: number,
  ): string[] {
    const starts = startDate ? getTodayNowDDMMYYYYAdd7(startDate) : null;
    const ends = endDate ? getTodayNowDDMMYYYYAdd7(endDate) : null;
    let result = [];
    let current = (starts || dayjs()).clone();

    while (current.isBefore(ends, 'month') || current.isSame(ends, 'month')) {
      // กำหนดวันที่เป็น fixDay หรือวันสุดท้ายของเดือนถ้า fixDay ไม่มีในเดือนนั้น
      const dayInMonth = current.daysInMonth();
      const dateToAdd = current.date(Math.min(fixDay, dayInMonth));

      // ตรวจสอบว่าหากวันของเดือนเกิน endDate แล้วให้หยุดการเพิ่มข้อมูล
      if (dateToAdd.isAfter(ends, 'day')) break;

      result.push(dateToAdd.format('DD/MM/YYYY'));
      current = current.add(1, 'month').startOf('month');
    }

    return result;
  }

  generateDateKeyMapNew(dates: string[], startKey: number) {
    let dateKeyMap: any = {};
    dates.forEach((date, index) => {
      dateKeyMap[date] = { key: String(startKey + index) };
      // dateKeyMap[date] = { key: startKey + index };
    });
    return dateKeyMap;
  }

  transformToKeyArrayHValue(data: any) {
    const result: { [key: number]: { main: string; key: string } } = {};

    for (const [main, dates] of Object.entries(data)) {
      for (const [date, value] of Object.entries(dates)) {
        // ตรวจสอบว่า value มี property 'key'
        if (value && typeof value === 'object' && 'key' in value) {
          const { key } = value as { key: number }; // Type Assertion แบบปลอดภัย
          result[key] = {
            main,
            key: date,
          };
        }
      }
    }

    return result;
  }

  sumKeysNew(entryValue: any[], startKey: number) {
    const result: { [key: string]: number } = {};

    entryValue.forEach((entry) => {
      for (const [key, value] of Object.entries(entry)) {
        const numericKey = Number(key); // แปลง key เป็นตัวเลข
        if (numericKey >= startKey) {
          // ถ้า key >= startKey ให้บวกค่า
          // result[key] = (result[key] || 0) + Number(value); // บวกค่าถ้ามีอยู่แล้ว หรือเริ่มต้นที่ 0
          result[key] = Math.round((result[key] || 0) + parseToNumber(value) * 1000) / 1000;
        }
      }
    });


    return result;
  }
  
  sumKeys(entryValue: any[], startKey: number) {
    const result: { [key: string]: number } = {};

    entryValue.forEach((entry) => {
      for (const [key, value] of Object.entries(entry)) {
        const numericKey = Number(key); // แปลง key เป็นตัวเลข
        if (numericKey >= startKey) {
          // ถ้า key >= startKey ให้บวกค่า
          // result[key] = (result[key] || 0) + parseToNumber(value); // บวกค่าถ้ามีอยู่แล้ว หรือเริ่มต้นที่ 0
          result[key] = Math.round((parseToNumber(result[key] || 0) + parseToNumber(value)) * 1000) / 1000; // บวกค่าถ้ามีอยู่แล้ว หรือเริ่มต้นที่ 0
        }
      }
    });

    return result;
  }

  async fileCapacityBooking(url: any, contract_code_id: any, userId: any) {
    return await this.prisma.file_capacity_request_management.create({
      data: {
        url: url,
        contract_code_id: Number(contract_code_id),
        create_by: Number(userId),
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
      },
    });
  }

  validateEndDate = ({
    configStart,
    configEnd,
    file_period_mode,
    shadow_time,
    startdate,
    endDate,
    shadow_period,
  }) => {
    const configEndDate = dayjs(configEnd, 'DD/MM/YYYY'); // วันที่ configEnd
    const configStartDate = dayjs(configStart, 'DD/MM/YYYY'); // วันที่ configStart
    const unit = file_period_mode === 2 ? 'month' : 'day'; // ใช้ file_period_mode กำหนดหน่วย
    const shadowDate = configEndDate.subtract(shadow_time, unit); // คำนวณ shadowDate
    const endDateParsed = dayjs(endDate, 'DD/MM/YYYY').subtract(1, 'day'); // แปลง endDate
    const shadowPeriod = configEndDate.add(shadow_period, unit); // คำนวณ shadowDate

    // เงื่อนไขที่ 1: endDate เท่ากับ configEnd และไม่เกิน shadowPeriod
    if (
      endDateParsed.isSame(configEndDate, 'day') ||
      endDateParsed.isBefore(shadowPeriod, 'day')
    ) {
      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'ไม่ตรงกับ เงื่อนไข shadow time or shadow period',
      //   },
      //   HttpStatus.BAD_REQUEST,
      // );
      return true;
    }

    // เงื่อนไขที่ : endDate ต้องไม่หลัง configEnd
    if (!endDateParsed.isBefore(configEndDate)) {
      
      return false;
    }

    // เงื่อนไขที่ : endDate ต้องอยู่ระหว่าง shadowDate ถึง configEnd
    if (endDateParsed.isSameOrAfter(shadowDate, 'day')) {
      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'ไม่ตรงกับ เงื่อนไข shadow time or shadow period',
      //   },
      //   HttpStatus.BAD_REQUEST,
      // );
      return false;
    }

    // เงื่อนไขที่ : endDate อยู่ก่อน shadowDate แต่ต้องไม่น้อยกว่า configStart
    if (endDateParsed.isSameOrAfter(configStartDate, 'day')) {
      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'ไม่ตรงกับ เงื่อนไข shadow time or shadow period',
      //   },
      //   HttpStatus.BAD_REQUEST,
      // );
      return true;
    }

    // นอกเหนือจากนี้
    return false;
  };
  
  // แบบเก่า
  transformDataArrNew(data: any[]): string[][] {
    // ค้นหาคีย์สูงสุดใน data เพื่อกำหนดความยาวสูงสุด
    const maxKeys = data.reduce((max, obj) => {
      const keys = Object.keys(obj).map(Number).filter(key => Number.isFinite(key));
      return Math.max(max, ...keys);
    }, 0);

    // แปลงข้อมูลเป็น array ของ array
    return data.map((entry) => {
      const row: string[] = [];
      for (let i = 0; i <= maxKeys; i++) {
        row[i] = entry[i] || ''; // ใส่ "" หากไม่มี key
      }
      return row;
    });
  }
  
  // แบบใหม่
  transformDataArrNew_(data: any[], type:any): any {
    // type 1 เก่า 2 ใหม่
    // ค้นหาคีย์สูงสุดใน data เพื่อกำหนดความยาวสูงสุด
    const maxKeys = data.reduce((max, obj) => {
      const keys = Object.keys(obj).map(Number).filter(key => Number.isFinite(key));
      return Math.max(max, ...keys);
    }, 0);
    
    const data_ = data.map((entry) => {
      const row: string[] = [];
      for (let i = 0; i <= maxKeys; i++) {
        row[i] = entry[i] || ''; // ใส่ "" หากไม่มี key
      }
      if(type === 1){
        return row?.filter((_, idx) => idx < 1 || idx > 4);
      }else{

        return row;
      }
    });
    return  data_
  }

  extendDates(data_, shadowPeriod, type, temp) {
    // console.log('###### extendDates data : ', data_);
    // console.log('###### temp : ', temp);
    // temp?.valueEx?.data
    // [{date: '2026-11-19', value: 60000}]
    const data = data_?.length > 0 ? data_ : temp?.valueEx?.data // https://app.clickup.com/t/9018502823/86euzxxkq
    // const data = data_
    const clonedData = JSON.parse(JSON.stringify(data));
    // console.log('data[data.length - 1] : ', data[data.length - 1]);
    // console.log('data[data.length - 1].date : ', data[data.length - 1]?.date);
    // หาวันที่มากที่สุดในข้อมูลเดิม
    // const maxDate = dayjs(data[data.length - 1].date);
    const maxDate = data ? ((/^\d{2}\/\d{2}\/\d{4}$/.test(data[data.length - 1].date))
    ? dayjs(data[data.length - 1].date, 'DD/MM/YYYY', true)
    : dayjs(data[data.length - 1].date)) : dayjs()
    // หาค่า value ของวันที่มากที่สุด
    const maxValue = data[data.length - 1].value;
    // console.log('maxDate : ', maxDate);
    // console.log('maxValue : ', maxValue);
    // console.log('type : ', type);
    // console.log('shadowPeriod : ', shadowPeriod);
    // if (Number(type) === 1) {
    //     console.log('1');
        
    //     let newDate = maxDate;
    //     console.log('1.1');
    //     let i = 1;
    //     // while (newDate.isSameOrBefore(newMax)) {
    //   console.log('1.2');
    //   while (newDate.isBefore(Number(shadowPeriod))) {
    //     newDate = maxDate.add(i, 'day');
    //     clonedData.push({
    //       date: newDate.format('YYYY-MM-DD'),
    //       value: maxValue,
    //     });
    //     i++;
    //     console.log('2');
    //   }

    //   return clonedData; // คืนค่า clonedData ที่แก้ไขแล้ว
    // }
     if (Number(type) === 1) {
      console.log('1');
      const period = Number(shadowPeriod);
        for (let i = 1; i <= period; i++) {
          const newDate = maxDate.add(i, 'day');
          clonedData.push({
            date: newDate.format('YYYY-MM-DD'),
            value: maxValue,
          });
          // console.log('newDate : ', newDate.format('YYYY-MM-DD'));
        }
        return clonedData;
    }else {
      const newMax = maxDate.add(shadowPeriod, 'month');
      let newDate = maxDate;
      let i = 1;
      // while (newDate.isSameOrBefore(newMax)) {
      while (newDate.isBefore(newMax)) {
        newDate = maxDate.add(i, 'day');
        clonedData.push({
          date: newDate.format('YYYY-MM-DD'),
          value: maxValue,
        });
        i++;
      }

      return clonedData; // คืนค่า clonedData ที่แก้ไขแล้ว
    }
  }

  async uploadDateCapacityDate(updates: any) {
    
    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.capacity_publication_date.updateMany({
          where: { id: update.where.id },
          data: update.data,
        }),
      ),
    );

    return true;
  }

  // ....
  pickByDate(arr: any, dateStr: any /* 'DD/MM/YYYY' */) {
    const target = dayjs(dateStr, 'DD/MM/YYYY', true).startOf('day');
    if (!target.isValid()) throw new Error('Invalid date');

    let best = null;
    let bestTs = -Infinity;
    const targetTs = target.valueOf();

    for (const item of arr) {
      if (!item?.start_date) continue;
      const s = dayjs(item.start_date).startOf('day');
      if (!s.isValid()) continue;

      const ts = s.valueOf();

      // เจอวันตรงกัน เป๊ะ ก็จบเลย
      if (ts === targetTs) return item;

      // เก็บตัวที่ไม่เกินวันเป้า และ "ล่าสุด" (ค่า ts มากที่สุดแต่ < เป้า)
      if (ts < targetTs && ts > bestTs) {
        bestTs = ts;
        best = item;
      }
    }

    return best; // อาจเป็น null ถ้าไม่มีตัวที่ <= วันเป้า
  }

  findNearestAfter(configs: any, startDate: any) {
    const target = dayjs(startDate).startOf('day');

    // คัดเฉพาะที่มากกว่า แล้วเรียงจากน้อยไปมาก เอาตัวแรก
    const next = configs
      .filter((c) => dayjs(c.start_date).startOf('day').isAfter(target)) // เงื่อนไข "มากกว่า"
      .sort((a, b) => dayjs(a.start_date).diff(dayjs(b.start_date)))[0];

    return next ?? null; // ถ้าไม่มีที่มากกว่าเลย ให้ได้ null
  }

  async middleBooking(id: any, plus: boolean, specificVersionId: number | null = null, newTerminateDate?: any, extendStart?:any, extendEnd?:any) {
    const todayStart = getTodayStartAdd7().toDate();
    const todayEnd = getTodayEndAdd7().toDate();
    const nowDates = getTodayNowAdd7().toDate();

    let specificVersion = undefined;
    if(specificVersionId){
      specificVersion = await this.prisma.booking_version.findFirst({
        where: {
          // contract_code_id: Number(specificVersionId),
          id: Number(specificVersionId),
        },
        include: {
          booking_row_json: true,
          booking_full_json: true,
          contract_code: true,
        },
      });
    }

    const contractCodePeriod = await this.prisma.contract_code.findFirst({
      where: { id: Number(id) },
      select: { 
        contract_start_date:true,
        contract_end_date: true,
        terminate_date: true,
        shadow_period: true,
        booking_version:{
            where: {
              contract_code_id: Number(id),
              flag_use: true,
            },
            include: {
              booking_row_json: true,
              booking_full_json: true,
            },
            orderBy: { id: 'desc' },
        },
       },
    });
    const contractPointAPI = await this.prisma.contract_point.findMany({
      where: {
        AND: [
          {
            contract_point_start_date: {
              lte: todayEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            },
          },
          {
            OR: [
              { contract_point_end_date: null }, // ถ้า end_date เป็น null
              { contract_point_end_date: { gte: todayStart } }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ],
          },
        ],
      },
      include: {
        area: {
          select: {
            id: true,
            name: true,
            area_nominal_capacity: true,
          },
        },
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    const areaDataArr = await this.prisma.area.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            },
          },
          {
            OR: [
              { end_date: null }, // ถ้า end_date เป็น null
              { end_date: { gte: todayStart } }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        area_nominal_capacity: true,
        entry_exit_id: true,
      },
    });
    const pathManagementArr = await this.prisma.path_management.findMany({
      where: {},
      include: {
        path_management_config: {
          include: {
            config_master_path: {
              include: {
                revised_capacity_path: {
                  include: {
                    area: true,
                  },
                },
                revised_capacity_path_edges: true,
              },
            },
          },
          where: {
            flag_use: true,
          },
        },
      },
      orderBy: {
        start_date: 'asc',
      },
    });
    // contractCodePeriod?.contract_start_date

    console.time('middleBooking G2');
    const npathManagementArr = pathManagementArr?.map((p: any) => {
      const { path_management_config, ...nP } = p;
      const npath_management_config = path_management_config.map((e: any) => {
        return {
          ...e,
          temps: JSON.parse(e['temps']),
        };
      });
      const npathConfig = npath_management_config.map((e: any) => {
        const findId = e?.temps?.revised_capacity_path?.find((f: any) => {
          return f?.area?.entry_exit_id === 1;
        });

        const findExit = e?.temps?.revised_capacity_path?.map((tp: any) => {
          return {
            ...tp,
            source_id:
              e?.temps?.revised_capacity_path_edges?.find(
                (f: any) => f?.target_id === tp?.area?.id,
              )?.source_id || null,
          };
        });
        return {
          ...e,
          entryId: findId?.area?.id,
          entryName: findId?.area?.name,
          findExit,
        };
      });

      return {
        ...nP,
        path_management_config: npath_management_config,
        pathConfig: npathConfig || [],
      };
    });
    console.timeEnd('middleBooking G2');


    console.time('middleBooking G3');

    // const hasNoConfig =
    // !npathManagementArr ||
    // npathManagementArr.length === 0 ||
    // npathManagementArr.every(
    //   (item: any) =>
    //     !item.path_management_config || item.path_management_config.length === 0,
    // );

    // if (hasNoConfig) {
    if (npathManagementArr.length <= 0) { 
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Default Capacity Path not found. Please set the default capacity path before confirming or approving.
`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    console.timeEnd('middleBooking G3');

    console.time('middleBooking G3.1');
    // const getData = await this.bookingVersion(Number(id));
    const getData = specificVersion ?? contractCodePeriod?.booking_version?.[0]
    console.timeEnd('middleBooking G3.1');
    
    console.time('middleBooking G4');
    const dataRow = getData && getData['booking_row_json'] || [];
    const dataFull = getData && JSON.parse(getData['booking_full_json'][0]?.data_temp);
    const tempType = dataFull && dataFull?.shipperInfo['1']['Type of Contract'];
    const contractType = this.typeOfContractTextToNum(tempType);
    const { bookingTemplate, modeDayAndMonth, file_period_mode } =
      await this.bookingTemplate(Number(contractType));
    const dailyBooking =
      dataFull && dataFull['headerEntry']['Capacity Daily Booking (MMBTU/d)'];
    let shipperName = dataFull && dataFull?.shipperInfo[0]['Shipper Name'] || null;
    const getGroupByName = await this.getGroupByName(shipperName);
    console.timeEnd('middleBooking G4');

    console.time('middleBooking G5');
    const nkeys = Object.keys(dailyBooking)
      .filter((date) => dailyBooking[date]?.key) // กรองเฉพาะที่เป็นวันที่และมี key
      .map((date) => ({
        key: Number(dailyBooking[date].key), // แปลง key เป็นตัวเลข
        date: date, // ใช้ date เป็นค่า
      }))
      .sort((a, b) => a.key - b.key); // เรียงลำดับตาม key
    console.timeEnd('middleBooking G5');

    console.time('middleBooking G6');
    // contractCodePeriod?.contract_start_date
    const keys = nkeys?.map((d: any, ixs:any) => {
      const config = this.pickByDate(npathManagementArr, ixs === 0 ? dayjs(contractCodePeriod?.contract_start_date).format("DD/MM/YYYY") : d?.date);
      const fNextConfig = this.findNearestAfter(
        npathManagementArr,
        config?.start_date,
      )?.start_date;
      const nconfig = { ...config, stopDate: fNextConfig || null };
      return {
        ...d,
        config: nconfig,
      };
    });
    console.timeEnd('middleBooking G6');

    console.time('middleBooking G7');
    const entryUse = dataRow.filter((f: any) => {
      return f?.entry_exit_id === 1;
    });

    const exitUse = dataRow.filter((f: any) => {
      return f?.entry_exit_id === 2;
    });
    console.timeEnd('middleBooking G7');

    let entryData: any = [];
    let exitData: any = [];

    console.time('middleBooking G8');
    for (let i = 0; i < entryUse.length; i++) {
      const contractPoint = contractPointAPI.find((fNe: any) => {
        return fNe?.contract_point === JSON.parse(entryUse[i]?.data_temp)['0'];
      });
      if (
        !!!contractPoint?.contract_point ||
        !!!contractPoint?.zone?.name ||
        !!!contractPoint?.area?.name
      ) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Point is NOT match.',
          },
          HttpStatus.BAD_REQUEST,
        );
      } else {
        const fSP = getGroupByName?.shipper_contract_point.find((fSp: any) => {
          return (
            fSp?.contract_point?.contract_point ===
            contractPoint?.contract_point
          );
        });
        if (!!!fSP) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Point is NOT match.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        entryUse[i].data_temp = JSON.parse(entryUse[i].data_temp);
        entryData.push({
          contract_point: contractPoint?.contract_point,
          entry_exit_id: contractPoint?.entry_exit_id,
          zone_id: contractPoint?.zone?.id,
          zone: contractPoint?.zone?.name,
          area_id: contractPoint?.area?.id,
          area: contractPoint?.area?.name,
          area_nominal_capacity: contractPoint?.area?.area_nominal_capacity,
          entryUse: entryUse[i],
          // exitUse: entryUse[i],
        });
        // exitData.push({
        //   contract_point: contractPoint?.contract_point,
        //   entry_exit_id: contractPoint?.entry_exit_id,
        //   zone_id: contractPoint?.zone?.id,
        //   zone: contractPoint?.zone?.name,
        //   area_id: contractPoint?.area?.id,
        //   area: contractPoint?.area?.name,
        //   area_nominal_capacity: contractPoint?.area?.area_nominal_capacity,
        //   exitUse: entryUse[i],
        // });
      }
    }
  

    for (let i = 0; i < exitUse.length; i++) {
      const contractPoint = contractPointAPI.find((fNe: any) => {
        return fNe?.contract_point === JSON.parse(exitUse[i]?.data_temp)['0'];
      });

      if (
        !!!contractPoint?.contract_point ||
        !!!contractPoint?.zone?.name ||
        !!!contractPoint?.area?.name
      ) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Point is NOT match.',
          },
          HttpStatus.BAD_REQUEST,
        );
      } else {
        const fSP = getGroupByName?.shipper_contract_point.find((fSp: any) => {
          return (
            fSp?.contract_point?.contract_point ===
            contractPoint?.contract_point
          );
        });
        if (!!!fSP) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Point is NOT match.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        exitUse[i].data_temp = JSON.parse(exitUse[i].data_temp);
        exitData.push({
          contract_point: contractPoint?.contract_point,
          entry_exit_id: contractPoint?.entry_exit_id,
          zone_id: contractPoint?.zone?.id,
          zone: contractPoint?.zone?.name,
          area_id: contractPoint?.area?.id,
          area: contractPoint?.area?.name,
          area_nominal_capacity: contractPoint?.area?.area_nominal_capacity,
          exitUse: exitUse[i],
        });
      }
    }
    console.timeEnd('middleBooking G8');

    console.time('middleBooking G9');
    const terminateDate = newTerminateDate && dayjs(newTerminateDate).isValid() ? dayjs(newTerminateDate).toDate() : undefined
    const resultNewDataEntry = this.generateValueExtend(
      keys,
      dataFull?.entryValue,
      file_period_mode,
      (extendEnd ? dayjs(extendEnd, 'DD/MM/YYYY').toDate() : contractCodePeriod.contract_end_date),
      (terminateDate || null)
      // (terminateDate || dayjs().toDate())
    );

    const resultNewDataExit = this.generateValueExtend(
      keys,
      dataFull?.exitValue,
      file_period_mode,
      (extendEnd ? dayjs(extendEnd, 'DD/MM/YYYY').toDate() : contractCodePeriod.contract_end_date),
      (terminateDate || null)
      // (terminateDate || dayjs().toDate())
    ); 
    console.timeEnd('middleBooking G9');

    // console.log('- - -');
    // console.log('keys : ', keys);
    // console.log('dataFull : ', dataFull);
    // console.log('contractCodePeriod : ', contractCodePeriod);
    // console.log('terminateDate : ', terminateDate);
    // console.log('newTerminateDate : ', newTerminateDate);
    // console.log('- - -');
    // console.log('entryData : ', entryData);
    // console.log('resultNewDataEntry : ', resultNewDataEntry);
    // console.log('- - -');
    // console.log('exitData : ', exitData);
    // console.log('resultNewDataExit : ', resultNewDataExit);
    // console.log('- - -');

    console.time('middleBooking G10');
    const nmatchData = [...entryData, ...exitData].map((ex: any, ix: any) => {
      const valueEx = [...resultNewDataEntry, ...resultNewDataExit]?.find(
        (f: any) => f?.contractPoint === ex?.contract_point,
      );
      return { ...ex, valueEx: valueEx };
    });
    console.timeEnd('middleBooking G10');
    console.time('middleBooking G11');
    let pnmatchData = nmatchData?.map((nd: any) => {
      const {
        area,
        area_id,
        area_nominal_capacity,
        contract_point,
        entry_exit_id,
        zone,
        zone_id,
        valueEx,
      } = nd;
      const ncg = valueEx?.data?.map((ng: any) => {
        const nconfig = ng?.config?.pathConfig?.find((fn: any) => {
          return fn?.exit_name_temp === area;
        });

        return {
          date: ng?.date,
          key: ng?.key,
          value: ng?.value,
          pathConfig: {
            id: ng?.config?.id,
            version: ng?.config?.version,
            start_date: ng?.config?.start_date,
            stopDate: ng?.config?.stopDate,
            config_master_path_id: nconfig?.config_master_path_id,
            config_master_path: nconfig?.config_master_path,
            findExit: nconfig?.findExit,
            path_id: nconfig?.id,
          },
        };
      });
      return {
        area,
        area_id,
        area_nominal_capacity,
        contract_point,
        entry_exit_id,
        zone,
        zone_id,
        configPathDate: ncg || [],
      };
    });
    console.timeEnd('middleBooking G11');
    

    let logWarning = [];

    console.time('middleBooking G12');
  
    const { setDataUse, logWarnings } = await this.setDataUsed(
      nmatchData || [],
      areaDataArr,
      [],
      contractCodePeriod,
      modeDayAndMonth,
      logWarning,
      plus,
    );
    console.timeEnd('middleBooking G12');

    let tsetDataUse = []
    if(terminateDate){
      tsetDataUse = setDataUse?.map((sd:any) => {
        const { resCalcNew, ...nSd } = sd
        const nresCalcNew = resCalcNew?.map((rCn:any) => {
          const { calcNew, ...nRCn } = rCn
          const fcalcNew = calcNew?.filter((f:any) => {
            return (
              dayjs(f?.date, "YYYY-MM-DD").isSameOrAfter(dayjs(terminateDate).format("YYYY-MM-DD"))
            )
          })
          return {
            ...nRCn,
            calcNew: fcalcNew
          }
        })

        return {
          ...nSd,
          resCalcNew: nresCalcNew
        }
      })

    }else{
      tsetDataUse = setDataUse
    }

    return {
      pnmatchData,
      setDataUse: tsetDataUse,
      logWarnings,
      oldsetDataUse: setDataUse
    };
  }

  async bookingTemplate(contractType: any) {
    const todayStart = getTodayStartAdd7().toDate();
    const todayEnd = getTodayEndAdd7().toDate();
    const bookingTemplate = await this.prisma.booking_template.findFirst({
      where: {
        term_type_id: Number(contractType),
        AND: [
          {
            start_date: {
              lte: todayEnd,
            },
          },
          {
            OR: [{ end_date: null }, { end_date: { gte: todayStart } }],
          },
        ],
      },
      include: {
        term_type: true,
      },
    });

    if (!!!bookingTemplate) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'booking template date not match',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const modeDayAndMonth = bookingTemplate?.term_type_id === 4 ? 1 : 2;
    const file_period_mode = bookingTemplate?.file_period_mode; // 1 = วัน, 2 = เดือน, 3 = ปี

    return {
      bookingTemplate,
      modeDayAndMonth,
      file_period_mode,
    };
  }

  async bookingVersion(id: any) {
    const getData = await this.prisma.booking_version.findFirst({
      where: {
        contract_code_id: Number(id),
        flag_use: true,
      },
      include: {
        booking_row_json: true,
        booking_full_json: true,
      },
      orderBy: { id: 'desc' },
    });
    return getData;
  }

  generateValueExtend(keys: any, exitValue: any, file_period_mode: any, contract_end_date?: Date, terminate_date?: Date) {
    const contractEndDate = contract_end_date ? dayjs(contract_end_date) : undefined;
    // const terminateDate = terminate_date ? dayjs(terminate_date) : dayjs();
    const terminateDate = terminate_date ? dayjs(terminate_date) : null;
    const res_ = exitValue.map((values: any) => {
      const fromData = values['5'];
      const endData = values['6'];

      const data = (keys || [])?.filter((f_:any) => f_ !== null)?.map((keyItem: any) => ({
        key: keyItem.key,
        date: keyItem.date,      // 'DD/MM/YYYY'
        config: keyItem?.config,
        value: values[keyItem.key]
          ? parseFloat(String(values[keyItem.key]).trim().replace(/,/g, ''))
          : null,
      }));

      // ใช้ Map เพื่อกันวันที่ซ้ำ (ให้ “ค่าจากคีย์ท้ายสุด” ทับของเดิม)
      const valueByDate = new Map<string, number | null>();

      for (let i = 0; i < data.length; i++) {
        const current = data[i];
        const next = data[i + 1] || { date: endData }; // ถ้าเป็นคีย์สุดท้าย

        let startDate = dayjs(current.date, 'DD/MM/YYYY');
        let endDate = dayjs(next.date, 'DD/MM/YYYY');

        // --- แก้ boundary ให้ชัด ---
        if (file_period_mode === 1 || file_period_mode === 2) {
          // รายวัน / รายเดือน -> ปิดช่วงแบบ exclusive ของวันเริ่มคีย์ถัดไป
          endDate = endDate.subtract(1, 'day');
        } else if (file_period_mode === 3) {
          if (next.key) {
            // รายปี แต่ไม่ใช่คีย์สุดท้าย -> ก็ต้อง exclusive เหมือนกัน
            endDate = endDate.subtract(1, 'day');
          } else {
            // คีย์สุดท้ายในรายปี -> ไปจนถึง endData (รวมวัน)
            endDate = dayjs(endData, 'DD/MM/YYYY');
          }
        }

        const fromDay = dayjs(fromData, 'DD/MM/YYYY');

        if(contractEndDate && (startDate.isAfter(contractEndDate) || startDate.isSame(contractEndDate))) {
          continue;
        }

        while (startDate.isBefore(endDate) || startDate.isSame(endDate)) {
          if (startDate.isSameOrAfter(fromDay)) {
            const iso = startDate.format('YYYY-MM-DD');
            // ค่าท้ายสุดจะทับของเดิมโดยอัตโนมัติ (กันเบิ้ล)
            if(terminateDate && (startDate.isAfter(terminateDate) || startDate.isSame(terminateDate))) {
              valueByDate.set(iso, 0);
            }
            else{
              valueByDate.set(iso, current.value);
            }
          }
          // เดินวันละ 1 เสมอ
          startDate = startDate.add(1, 'day');
        }
      }

      // แปลงกลับเป็นอาเรย์ (ลำดับจะคงตามการ insert; ถ้าต้องการเรียงชัวร์ก็ sort อีกชั้น)
      const valueExtend = Array.from(valueByDate.entries()).map(([date, value]) => ({ date, value }));

      return {
        contractPoint: values['0'],
        endData,
        data,
        valueExtend,
      };
    });
    return res_
  }
 

  generateValueExtendFnET(keys: any, exitValue: any, file_period_mode: any) {
    const result = exitValue.map((values) => {
      // const endData = values['34']; // ค่าที่ต้องใช้ใน key สุดท้าย
      const endData = values['6']; // ค่าที่ต้องใช้ใน key สุดท้าย
      const data = (keys || [])?.filter((f_:any) => f_ !== null)?.map((keyItem) => ({
        key: keyItem.key,
        date: keyItem.date,
        config: keyItem?.config,
        value: values[keyItem.key] || null, // แมตช์ค่า value ตาม key
      }));

      const valueExtend = [];
      for (let i = 0; i < data.length; i++) {
        const current = data[i];
        const next = data[i + 1] || { date: endData }; // ใช้ endData หากเป็น key สุดท้าย

        let startDate = dayjs(current.date, 'DD/MM/YYYY'); // แปลงวันที่จาก DD/MM/YYYY เป็น dayjs object
        let endDate = dayjs(next.date, 'DD/MM/YYYY');

        // Adjust endDate based on file_period_mode
        if (file_period_mode === 1 || file_period_mode === 2) {
          endDate = endDate.subtract(1, 'day'); // Exclude next key's date for days/months
        } else if (file_period_mode === 3 && !next.key) {
          endDate = endDate.subtract(1, 'day');
          // if (next.key) {
          //   // รายปี แต่ไม่ใช่คีย์สุดท้าย -> ก็ต้อง exclusive เหมือนกัน
          // } else {
          //   // คีย์สุดท้ายในรายปี -> ไปจนถึง endData (รวมวัน)
          //   endDate = dayjs(endData, 'DD/MM/YYYY');
          // }
        }

        while (startDate.isBefore(endDate) || startDate.isSame(endDate)) {
          // Push each date into valueExtend
          valueExtend.push({
            date: startDate.format('YYYY-MM-DD'), // แปลงกลับเป็น YYYY-MM-DD
            value: current.value,
          });

          if (
            file_period_mode === 1 ||
            file_period_mode === 2 ||
            file_period_mode === 3
          ) {
            startDate = startDate.add(1, 'day'); // เพิ่มวันทีละ 1
          }
        }
      }

      return {
        contractPoint: values['0'],
        endData: endData,
        data: data,
        valueExtend: valueExtend,
      };
    });

    return result;
  }

  findActiveConfig(configs, dateStr /* 'DD/MM/YYYY' */, areaName: any) {
    const target = dayjs(dateStr, 'DD/MM/YYYY', true).startOf('day');
    if (!target.isValid()) throw new Error('Invalid date string');

    const matches = configs.filter((c) => {
      const start = dayjs(c?.config?.start_date).startOf('day');
      const stop = c?.config?.stopDate
        ? dayjs(c?.config?.stopDate).startOf('day')
        : null;

      // รวม start, ตัด stop
      const meetLower = target.isSame(start) || target.isAfter(start);
      const meetUpper = !stop || target.isBefore(stop);
      return meetLower && meetUpper;
    });
    const fmatches = matches?.filter((f: any) => {
      return f?.areaData?.find((fa: any) => fa?.name === areaName);
    });

    if (fmatches.length === 0) return null;

    return {
      matches: fmatches,
      a: fmatches.sort((a, b) =>
        dayjs(b.start_date).diff(dayjs(a.start_date)),
      )[0],
    };
  }

  isDateMatching(targetDate: any, dbDate: any) {
    return dbDate.find((entry) => {
      return dayjs(entry.date_day).format('YYYY-MM-DD') === targetDate;
    });
  }

  // old ...
  async processGenPublicData(setDataUse: any, plus?:any) {
    

    for (let upi = 0; upi < setDataUse.length; upi++) {
      for (let fCp = 0; fCp < setDataUse[upi]?.resCalcNew.length; fCp++) {
        let fCapacityPublication: any = await this.prisma.capacity_publication.findFirst({
            where: {
              area_id: Number(setDataUse[upi]?.resCalcNew[fCp]?.area_id),
            },
            select: {
              id: true,
              capacity_publication_date: true,
              area: true,
            },
          });
       
        if (!!fCapacityPublication) {
          fCapacityPublication._dateMap = new Map();
          fCapacityPublication?.capacity_publication_date.forEach((entry) => {
            fCapacityPublication._dateMap.set(
              dayjs(entry.date_day).format('YYYY-MM-DD'),
              entry,
            );
          });
        
          const batchUpdates = setDataUse[upi]?.resCalcNew[fCp]?.calcNew.map(
            (calc) => {
              const ckDateMatch = fCapacityPublication._dateMap.get(
                dayjs(calc.date).format('YYYY-MM-DD'),
              );
              // if(dayjs(calc.date).format('YYYY-MM-DD') === "2026-01-01"){
              // }

              if (ckDateMatch) {

                let updateDataDC = { ...ckDateMatch };
                if (parseToNumber(ckDateMatch?.value_adjust_use) && ckDateMatch?.value_adjust_use !== null) {
                  updateDataDC.value_adjust_use = plus ? String(parseToNumber(ckDateMatch?.value_adjust_use ?? 0) + parseToNumber(calc.value_adjust_use)) : String(parseToNumber(ckDateMatch?.value_adjust_use ?? 0) - parseToNumber(calc.value));
                } else if (parseToNumber(ckDateMatch?.value_adjust && ckDateMatch?.value_adjust !== null)) {
                  updateDataDC.value_adjust = plus ? String(parseToNumber(ckDateMatch?.value_adjust ?? 0) + parseToNumber(calc.value_adjust)) : String(parseToNumber(ckDateMatch?.value_adjust ?? 0) - parseToNumber(calc.value));
                } else if (parseToNumber(ckDateMatch?.value) && ckDateMatch?.value !== null) {
                  updateDataDC.value = plus ? String(parseToNumber(ckDateMatch?.value ?? 0) + parseToNumber(calc.value)) : String(parseToNumber(ckDateMatch?.value ?? 0) - parseToNumber(calc.value));
                } else {
                  updateDataDC.value = String(calc.cals);
                }

                return {
                  where: { id: Number(ckDateMatch.id) },
                  data: updateDataDC,
                };
              } else {
                const date_day = /^\d{2}\/\d{2}\/\d{4}$/.test(calc.date)
                ? dayjs(calc.date, 'DD/MM/YYYY', true).toDate()
                : dayjs(calc.date).toDate();
                return {
                  capacity_publication_id: fCapacityPublication && fCapacityPublication?.id || -1,  
                  value: String(calc.cals),
                  date_day: date_day,
                };
              }
            },
          );

          const updates = batchUpdates.filter((update) =>
            update.hasOwnProperty('where'),
          );
          const icpdData = batchUpdates.filter((insert) =>
            insert.hasOwnProperty('capacity_publication_id'),
          );

          if (updates.length > 0) {
            await this.prisma.capacity_publication_date.deleteMany({
              where: {
                id: {
                  in: updates.map((dc: any) => dc?.where?.id),
                },
              },
            });
            // ลบ top-level id และ id ที่ฝังอยู่ใน data
            const rows = (updates || [])
              .map((u: any) => {
                const { where, data } = u ?? {};
                if (!data) return null;

                // ตัด id (ทุก variation) ออกจาก data
                const { id, Id, ID, _id, ...rest } = data;
                return rest;
              })
              .filter(Boolean);
            await this.prisma.capacity_publication_date.createMany({
              data: rows,
              // skipDuplicates: true,
            });
          }
          // console.log('icpdData : ', icpdData);
          if (icpdData.length > 0) {
            await this.prisma.capacity_publication_date.createMany({
              data: icpdData,
            });
          }
        } else {
          const createCP = await this.prisma.capacity_publication.create({
            data: {
              area: {
                connect: {
                  id: setDataUse[upi]?.resCalcNew[fCp]?.area_id,
                },
              },
              entry_exit: {
                connect: {
                  id: setDataUse[upi]?.resCalcNew[fCp]?.entry_exit_id,
                },
              },
            },
          });
          let icpdData = [];
          for (
            let iCpD = 0;
            iCpD < setDataUse[upi]?.resCalcNew[fCp]?.calcNew?.length;
            iCpD++
          ) {

            const date_day = /^\d{2}\/\d{2}\/\d{4}$/.test(setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.date)
            ? dayjs(setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.date, 'DD/MM/YYYY', true).toDate()
            : dayjs(setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.date).toDate();

            icpdData.push({
              capacity_publication_id: createCP?.id,
              value: String(
                setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.cals,
              ),
              date_day: date_day,
              // date_day: getTodayNowAdd7(
              //   setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.date,
              // ).toDate(),
            });
          }

          await this.prisma.capacity_publication_date.createMany({
            data: icpdData,
          });
        }
      }

    }

  }

  // new
  async processGenPublicData_(setDataUse: any, plus?: boolean) {
  // ========== helpers ==========
  const BATCH = 5000; // ปรับตามขนาด payload
  const sign = plus ? 1 : -1;

  // แปลง Date/String -> 'YYYY-MM-DD' (ไม่ใช้ dayjs ในฮอตพาธ)
  const toISODate = (d: any): string => {
    if (!d) return '';
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const s = String(d);
    // รองรับ 'YYYY-MM-DD...' อยู่แล้ว
    if (s.length >= 10 && s[4] === '-' && s[7] === '-') return s.slice(0, 10);
    // กันเคสอื่น ๆ (เช่น 'YYYY/MM/DD')
    return s.replace(/\//g, '-').slice(0, 10);
  };

  // parse number จากค่าใด ๆ; ถ้าไม่ใช่ finite → null (ให้เช็คแบบเดียวกับ parseToNumber ที่คุณใช้)
  const pn = (v: any): number | null => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
      const n = Number(v.replace(/,/g, '').trim());
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  // ========== 1) สร้างตารางงานจาก setDataUse ==========
  type Job = {
    area_id: number;
    entry_exit_id: number;
    rows: Array<{
      date: string;                // 'YYYY-MM-DD'
      cals: number;                // number
      value?: any;                 // อะไรก็ได้ (ตามอินพุตเดิม)
      value_adjust?: any;
      value_adjust_use?: any;
    }>;
  };

  const jobs: Job[] = [];
  for (const item of (setDataUse ?? [])) {
    for (const r of (item?.resCalcNew ?? [])) {
      const area_id = Number(r?.area_id);
      const entry_exit_id = Number(r?.entry_exit_id);
      if (!Number.isFinite(area_id) || !Number.isFinite(entry_exit_id)) continue;

      const rows = (r?.calcNew ?? []).map((c: any) => ({
        date: toISODate(c?.date), // คงรูปแบบ 'YYYY-MM-DD'
        cals: Number(c?.cals) || 0,
        value: c?.value,
        value_adjust: c?.value_adjust,
        value_adjust_use: c?.value_adjust_use,
      }));

      jobs.push({ area_id, entry_exit_id, rows });
    }
  }
  if (jobs.length === 0) return;

  // รวม area ทั้งหมดที่ต้องใช้
  const areaIds = Array.from(new Set(jobs.map(j => j.area_id)));

  // ========== 2) ทำงานทั้งหมดใน Transaction ==========
  await this.prisma.$transaction(async (tx) => {
    // 2.1 ดึง publication ของทุก area ที่มีแล้ว “ครั้งเดียว”
    const existingPubs = await tx.capacity_publication.findMany({
      where: { area_id: { in: areaIds } },
      select: {
        id: true,
        area_id: true,
        entry_exit_id: true,
        capacity_publication_date: {
          select: {
            id: true,
            date_day: true,
            value: true,
            value_adjust: true,
            value_adjust_use: true,
          },
        },
      },
    });

    // map area_id -> publication object (พร้อม dateMap)
    type PubRec = {
      id: number;
      area_id: number;
      entry_exit_id: number;
      dateMap: Map<string, {
        id: number;
        value: any;
        value_adjust: any;
        value_adjust_use: any;
      }>;
    };

    const pubByArea = new Map<number, PubRec>();
    for (const p of existingPubs) {
      const m = new Map<string, any>();
      for (const e of (p.capacity_publication_date ?? [])) {
        m.set(toISODate(e.date_day), {
          id: e.id,
          value: e.value,
          value_adjust: e.value_adjust,
          value_adjust_use: e.value_adjust_use,
        });
      }
      pubByArea.set(p.area_id, {
        id: p.id,
        area_id: p.area_id,
        entry_exit_id: p.entry_exit_id,
        dateMap: m,
      });
    }

    // 2.2 สร้าง publication ที่ยังไม่มี (ราย-รายการ; createMany ใช้ relation ไม่ได้)
    for (const j of jobs) {
      if (!pubByArea.has(j.area_id)) {
        const created = await tx.capacity_publication.create({
          data: {
            area: { connect: { id: j.area_id } },
            entry_exit: { connect: { id: j.entry_exit_id } },
          },
          select: { id: true, area_id: true, entry_exit_id: true },
        });
        pubByArea.set(j.area_id, {
          id: created.id,
          area_id: created.area_id,
          entry_exit_id: created.entry_exit_id,
          dateMap: new Map(),
        });
      }
    }

    // 2.3 วนคำนวณทุกรายการในหน่วยความจำ → แยก “toDeleteIds” และ “toCreateRows”
    const toDeleteIds: number[] = [];
    const toCreateRows: Array<{
      capacity_publication_id: number;
      date_day: Date;   // เหมือนเดิม: แปลงผ่าน getTodayNowAdd7(...).toDate()
      value?: string | null;
      value_adjust?: string | null;
      value_adjust_use?: string | null;
    }> = [];

    for (const j of jobs) {
      const pub = pubByArea.get(j.area_id)!;
      const dateMap = pub.dateMap;

      for (const r of j.rows) {
        const prev = dateMap.get(r.date); // {id, value, value_adjust, value_adjust_use} | undefined

        if (prev) {
          // ----- UPDATE แบบเดิม: ลบแล้วสร้างใหม่ -----
          // สร้างสำเนาค่าเดิม แล้วปรับตาม precedence เดิม
          let next_value: any = prev.value;
          let next_value_adj: any = prev.value_adjust;
          let next_value_adj_use: any = prev.value_adjust_use;

          const has_use = pn(prev.value_adjust_use) !== null && prev.value_adjust_use !== null;
          const has_adj = pn(prev.value_adjust) !== null && prev.value_adjust !== null;
          const has_val = pn(prev.value) !== null && prev.value !== null;

          if (has_use) {
            const base = pn(prev.value_adjust_use) ?? 0;
            const delta = pn(r.value_adjust_use);
            // ตามโค้ดเดิม: บวกใช้ value_adjust_use, ลบใช้ calc.value
            const deltaMinus = pn(r.value);
            const newVal = base + sign * (sign === 1
              ? (delta ?? 0)
              : (deltaMinus ?? 0));
            next_value_adj_use = String(newVal);

          } else if (has_adj) {
            const base = pn(prev.value_adjust) ?? 0;
            const delta = pn(r.value_adjust);
            const deltaMinus = pn(r.value);
            const newVal = base + sign * (sign === 1
              ? (delta ?? 0)
              : (deltaMinus ?? 0));
            next_value_adj = String(newVal);

          } else if (has_val) {
            const base = pn(prev.value) ?? 0;
            const delta = pn(r.value);
            const newVal = base + sign * (delta ?? 0);
            next_value = String(newVal);

          } else {
            // เดิม: ถ้าไม่มีค่าเดิมเลย → ตั้งเป็น cals
            next_value = String(r.cals);
          }

          toDeleteIds.push(prev.id);
          toCreateRows.push({
            capacity_publication_id: pub.id,
            date_day: getTodayNowAdd7(r.date).toDate(), // คงพฤติกรรมเดิม
            value: next_value ?? null,
            value_adjust: next_value_adj ?? null,
            value_adjust_use: next_value_adj_use ?? null,
          });

        } else {
          // ----- INSERT ใหม่ -----
          toCreateRows.push({
            capacity_publication_id: pub.id,
            value: String(r.cals),            // เดิมใช้ cals ลง value
            value_adjust: null,
            value_adjust_use: null,
            date_day: getTodayNowAdd7(r.date).toDate(), // คงพฤติกรรมเดิม
          });
        }
      }
    }

    // 2.4 ยิง DB แบบแบตช์ (เหมือนเดิมแต่เร็วขึ้น)
    if (toDeleteIds.length) {
      // ทำเป็นก้อน ๆ เผื่อรายการใหญ่มาก
      const CHUNK = 50_000; // ปรับได้
      for (let i = 0; i < toDeleteIds.length; i += CHUNK) {
        const ids = toDeleteIds.slice(i, i + CHUNK);
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL synchronous_commit = OFF`);
          // ส่งอาร์เรย์เป็นพารามิเตอร์เดียว (ไม่ชน 32767)
          await tx.$executeRaw`
            DELETE FROM public.capacity_publication_date
            WHERE id = ANY(${ids}::int[])
          `;
        }, { timeout: 60_000, maxWait: 20_000 });
      }
    }

    // createMany แบ่ง batch ป้องกัน payload ใหญ่
    for (let i = 0; i < toCreateRows.length; i += BATCH) {
      await tx.capacity_publication_date.createMany({
        data: toCreateRows.slice(i, i + BATCH),
        // ไม่เปิด skipDuplicates เพราะเราเพิ่งลบ id เก่าทิ้ง
      });
    }
  },{
    timeout: 60_000, // เพิ่มจากดีฟอลต์ 5000 ms
    maxWait: 20_000, // เผื่อคิวล็อก/โหลดสูง
  }); // end transaction
}


  async capacityPublicationWarning(id: any, logWarning: any, userId: any) {
    await this.prisma.capacity_publication_warning.createMany({
      data: (logWarning || []).map((ew: any) => {
        return {
          remark: ew,
          contract_code_id: Number(id),
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        };
      }),
    });
  }

  // แบบใหม่ไว
  // ดึงเร็ว
async capacityPublicationDateAll_() {
  // 1) ดึง parent
  const parents = await this.prisma.capacity_publication.findMany({
    select: { id: true, area_id: true },
    orderBy: { id: 'asc' },
  });

  if (parents.length === 0) return [];

  const parentIds = parents.map(p => p.id);

  // 2) ดึงลูกทั้งหมดของ parent เหล่านี้ แบบไหลเป็น batch ด้วย cursor
  const byParent = new Map<number, any[]>();
  let cursorId: number | undefined = undefined;
  // const TAKE = 10_000; // ปรับได้ตามเมม/ขนาดข้อมูลจริง
  const PID_CHUNK = 20_000;    // ขนาดชุด parent_ids ต่อรอบ
  const TAKE = 8_000; // ปรับได้ตามเมม/ขนาดข้อมูลจริง

  while (true) {
    const batch = await this.prisma.capacity_publication_date.findMany({
      where: { capacity_publication_id: { in: parentIds } },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      take: TAKE,
      orderBy: { id: 'asc' }, // สำคัญเพื่อให้ cursor ทำงานเสถียร
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      const k = row.capacity_publication_id; 
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(row);
    }

    cursorId = batch[batch.length - 1].id;
  }

  // 3) ประกบลูกกลับเข้า parent ให้ได้ shape เดิม
  const cp_ = parents.map(p => ({
    id: p.id,
    area_id: p.area_id,
    capacity_publication_date: byParent.get(p.id) ?? [],
  }));

  return cp_;
}

async capacityPublicationDateAll() {
  // 1) ดึง parent
  const parents = await this.prisma.capacity_publication.findMany({
    select: { id: true, area_id: true },
    orderBy: { id: 'asc' },
  });
  if (parents.length === 0) return [];

  const parentIds = parents.map(p => p.id);

  // 2) เตรียมโครง map สำหรับประกบลูกกลับ
  const byParent = new Map<number, any[]>();
  for (const p of parents) byParent.set(p.id, []);

  // ======= เร่งความเร็ว: ดึงลูกด้วย $queryRaw + ANY(array) + chunk =======
  const PID_CHUNK = 20_000;    // ขนาดชุด parent_ids ต่อรอบ
  const TAKE      = 8_000;     // ขนาด page ต่อการ fetch (ลอง 8k ก่อน ถ้าช้าค่อย 5k)

  // (แนะนำ) ตรวจว่ามีดัชนีนี้แล้วหรือยัง: (ทำครั้งเดียวใน DB)
  // CREATE INDEX IF NOT EXISTS idx_cpd_pubid_id ON public.capacity_publication_date (capacity_publication_id, id);

  for (let i = 0; i < parentIds.length; i += PID_CHUNK) {
    const idsChunk = parentIds.slice(i, i + PID_CHUNK);

    let lastId = 0;
    // ไหลแบบเพจด้วย id > lastId เพื่อหลบ OFFSET
    while (true) {
      // ดึงเฉพาะคอลัมน์ที่ใช้จริง
      const batch: Array<{
        id: number;
        capacity_publication_id: number;
        date_day: Date;
        value: any;
        value_adjust: any;
        value_adjust_use: any;
      }> = await this.prisma.$queryRaw`
        SELECT id, capacity_publication_id, date_day, value, value_adjust, value_adjust_use
        FROM public.capacity_publication_date
        WHERE capacity_publication_id = ANY(${idsChunk}::int[])
          AND id > ${lastId}
        ORDER BY id ASC
        LIMIT ${TAKE}
      `;

      if (batch.length === 0) break;

      // เติมลง map
      for (const row of batch) {
        const arr = byParent.get(row.capacity_publication_id)!;
        arr.push(row);
      }

      lastId = batch[batch.length - 1].id;
    }
  }

  // 3) ประกบลูกกลับเข้า parent ให้ได้ shape เดิม
  const cp_ = parents.map(p => ({
    id: p.id,
    area_id: p.area_id,
    capacity_publication_date: byParent.get(p.id) ?? [],
  }));

  return cp_;
}

async capacityPublicationDateAllID(areaId:any) {
    // 1) ดึง parent ตัวเดียวตาม area_id
  const parent = await this.prisma.capacity_publication.findFirst({
    where: { area_id: Number(areaId) },
    select: { id: true, area_id: true },
  });
  if (!parent) {
    // ไม่พบ ก็คืน shape ว่างแบบเดิม
    return {
      id: null,
      area_id: Number(areaId),
      capacity_publication_date: [],
    };
  }

  // 2) ดึงลูกแบบเพจ ด้วย $queryRaw + keyset (ไม่มี OFFSET)
  const TAKE = 8_000; // 5k–12k แล้วแต่เครื่อง; 8k เป็นจุดเริ่มที่ดี
  const rows: Array<{
    id: number;
    capacity_publication_id: number;
    date_day: Date;
    value: any;
    value_adjust: any;
    value_adjust_use: any;
  }> = [];

  let lastId = 0;
  while (true) {
    const batch: typeof rows = await this.prisma.$queryRaw`
      SELECT id, capacity_publication_id, date_day, value, value_adjust, value_adjust_use
      FROM public.capacity_publication_date
      WHERE capacity_publication_id = ${parent.id}
        AND id > ${lastId}
      ORDER BY id ASC
      LIMIT ${TAKE}
    `;

    if (batch.length === 0) break;

    rows.push(...batch);
    lastId = batch[batch.length - 1].id;
  }

  // 3) คืนค่า shape เดิม
  return {
    id: parent.id,
    area_id: parent.area_id,
    capacity_publication_date: rows,
  };
}


  // แบบเก่าเช้า 
  async capacityPublicationDateAll_old() {
    const cp_ = await this.prisma.capacity_publication.findMany({
      select: {
        id: true,
        capacity_publication_date: true,
        area_id: true,
      },
    });
    return cp_
  }

  // *
  async setDataUsed(
    nmatchData: any,
    areaDataArr: any,
    fCPn: any,
    contractCodePeriod: any,
    modeDayAndMonth: any,
    logWarning: any,
    plus?: boolean,
  ) {
    // ใช้ได้ทั้ง Date และ string (เช่น 'YYYY-MM-DD')
    const toYYYYMM = (dt: Date | string | number): string => {
      if (dt instanceof Date) {
        const y = dt.getUTCFullYear();
        const m = dt.getUTCMonth() + 1; // 0-11
        return `${y}-${m < 10 ? '0' + m : m}`;
      }
      if (typeof dt === 'string') {
        // ถ้าเป็น 'YYYY-MM-DD...' ก็หั่นได้เลย
        if (dt.length >= 7 && dt[4] === '-') return dt.slice(0, 7);
        // กรณีอื่น แปลงเป็น Date แล้วใช้ UTC getter
        const d = new Date(dt);
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;
        return `${y}-${m < 10 ? '0' + m : m}`;
      }
      if (typeof dt === 'number') {
        const d = new Date(dt);
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;
        return `${y}-${m < 10 ? '0' + m : m}`;
      }
      return '';
    };

    // entry_exit_id 1 area_id
    console.time('setDataUsed G1');
    // let nsetDataUseZero = await Promise.all(
      // capacityPublicationDateAllID
    // let onsetDataUseZero = nmatchData.map((sets: any, iset: number) => {
    let onsetDataUseZero = []
      for (let iset = 0; iset < nmatchData.length; iset++) {
        let sets = nmatchData[iset]
        
      let resCalcNew: any = [];

      if (sets?.entry_exit_id === 1) {
        // 1) PRE-INDEX (ทำครั้งเดียวต่อการเรียก; ถ้าเรียกบ่อยให้ย้ายไป cache ภายนอก)
        const areaById: Map<number, any> = new Map(
          (areaDataArr ?? []).map((a: any) => [Number(a?.id), a]),
        );

        // const pubByAreaDate: Map<number, Map<string, any>> = (() => {
        //   const m = new Map<number, Map<string, any>>();
        //   for (const r of fCPn ?? []) {
        //     const aid = Number(r?.area_id);
        //     let mm = m.get(aid);
        //     if (!mm) {
        //       mm = new Map<string, any>();
        //       m.set(aid, mm);
        //     }
        //     for (const d of r?.capacity_publication_date ?? []) {
        //       // ถ้ามีซ้ำวันเดียวกัน ให้ “อันหลังทับอันก่อน” = latest-of-day
        //       mm.set(dayjs(d?.date_day).format('YYYY-MM-DD'), d);
        //     }
        //   }
        //   return m;
        // })();

        const monthKeyFromYYYYMMDD = (s: string) => s?.slice(0, 7) as string; // 'YYYY-MM'

        const pubByAreaMonth = new Map<number, Map<string, any>>();
        const r = await this.capacityPublicationDateAllID(sets?.area_id)
        // for (const r of fCPn ?? []) {
          const aId = Number(r?.area_id);
          if (!pubByAreaMonth.has(aId)) pubByAreaMonth.set(aId, new Map());
          const mm = pubByAreaMonth.get(aId)!;

          for (const d of r?.capacity_publication_date ?? []) {
            // const mk = monthKeyFromYYYYMMDD(dayjs(d?.date_day).format('YYYY-MM')); // d.date = 'YYYY-MM-DD'
            const mk = toYYYYMM(d?.date_day);
            mm.set(mk, d); // อันหลังทับอันหน้า = เทียบเท่า "ล่าสุดในเดือน"
          }

        // }

        const matchAdjust = (areaId: number, mk: string) => pubByAreaMonth.get(areaId)?.get(mk) ?? null;

        console.time('setDataUsed G1 Entry');

        // iset

        // 2) หา area ตรง ๆ แบบ O(1) (เดิม filter แล้วลูป ทั้งที่มีแค่ id เดียว)
        const area = areaById.get(Number(sets?.area_id));
        if (area) {
          const areaId = Number(area?.id);
          const areaCap = Number(area?.area_nominal_capacity) || 0;
          const entryExitId = area?.entry_exit_id;

          // 3) คำนวณช่วงเวลา “ครั้งเดียว” และเตรียม number ไว้เลย
          const resultPeriodAdd =
            this.extendDates(
              sets?.valueEx?.valueExtend,
              contractCodePeriod?.shadow_period,
              modeDayAndMonth,
              sets
            ) ?? [];
          
          const periods = resultPeriodAdd.map((p: any) => ({
            ...p,
            mk: monthKeyFromYYYYMMDD(p?.date), // 'YYYY-MM' จาก 'YYYY-MM-DD'
            valueN: Number(p?.value) || 0, // แปลงเป็น number ไว้เลย
          }));

          const dateEndExcel = sets?.valueEx?.valueExtend[sets?.valueEx?.valueExtend.length - 1]?.date
          // เตรียมอาร์เรย์ผลลัพธ์ล่วงหน้า (ลด push/spread)
          const calcNew: any[] = new Array(periods.length);
          let prevVal: number | undefined;

          for (let i = 0; i < periods.length; i++) {
            const rp = periods[i];
            const isoDate = rp?.date as string; // 'YYYY-MM-DD'
            const v = Number(rp?.value) || 0;

            // 4) ปรับตามประกาศแบบ O(1)
            // const m = matchAdjustDate(areaId, isoDate);
            const m = matchAdjust(areaId, rp?.mk);
          
            let mainCalc = areaCap;
            let adjust: number | null = null;
            let adjustType: string | null = null;

            if (m) {
              if (m?.value_adjust_use != null && parseToNumber(m?.value_adjust_use)) {
                adjustType = 'value_adjust_use';
                mainCalc = parseToNumber(m.value_adjust_use);
                adjust = mainCalc;
              } else if (m?.value_adjust != null && parseToNumber(m?.value_adjust)) {
                adjustType = 'value_adjust';
                mainCalc = parseToNumber(m.value_adjust);
                adjust = mainCalc;
              } else if (m?.value != null && parseToNumber(m?.value)) {
                adjustType = 'value';
                mainCalc = parseToNumber(m.value);
                adjust = mainCalc;
              }
              // else: คง areaCap
            }


            const cals = plus ? mainCalc + v : mainCalc - v;

            const ck_comparea = i === 0 ? true : v === (prevVal ?? v);
            prevVal = v;

              calcNew[i] = {
                date: isoDate,
                value: rp?.value, // เก็บค่าเดิมไว้ถ้าต้องการชนิดเดิม
                cals,
                ck_comparea,
                adjust,
                adjustType,
                config: null,
              };
          }

          

          // 5) push ผลรวม (ไม่ต้องวน setArrAreaData อีก เพราะหา area ตรง ๆ แล้ว)
          resCalcNew.push({
            area_nominal_capacity: areaCap,
            area_id: areaId,
            area_name: area?.name,
            calcNew,
            entry_exit_id: entryExitId,
            exitTemp: { id: sets?.exit_id_temp, name: sets?.exit_name_temp },
          });
        }

        console.timeEnd('setDataUsed G1 Entry');
      } else {
        console.time('setDataUsed G1 Exit');

        console.time('setDataUsed G1 Exit area');
        const pathAreaUsed1 = sets?.valueEx?.data?.map((vE: any) => {
          const npathConfig = vE?.config?.path_management_config?.find(
            (f: any) => {
              return f?.exit_name_temp === sets?.area;
            },
          );
          return {
            ...vE,
            ...npathConfig,
          };
        });

        const pathAreaUsed = pathAreaUsed1?.map((setsF: any) => {
          const path = setsF?.config_master_path?.revised_capacity_path?.map(
            (cmp: any) => {
              return cmp?.area?.id;
            },
          );

          if(!path){
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Default Capacity Path not found. Please set the default capacity path before confirming or approving.
      `,
              },
              HttpStatus.BAD_REQUEST,
            );
          }

          const i = path.indexOf(setsF?.exit_id_temp);
          const uptoUsed = i >= 0 ? path.slice(0, i + 1)?.slice(1) : [];

          const areaData = areaDataArr?.filter((f: any) => {
            return uptoUsed?.includes(f?.id);
          });

          return {
            ...setsF,
            path: path,
            pathUsed: uptoUsed,
            areaData: areaData || [],
          };
        });
        console.timeEnd('setDataUsed G1 Exit area');
        
        
        console.time('setDataUsed G1 Exit areaAr Loop');
        // 0) helpers: คีย์เดือนจากสตริงวันที่ (เลี่ยง dayjs ในลูป)
        const monthKeyFromYYYYMMDD = (s: string) => s?.slice(0, 7) as string; // 'YYYY-MM'
        const monthKeyFromDDMMYYYY = (s: string) => {
          if (!s) return '';
          const [dd, mm, yyyy] = s.split('/');
          return `${yyyy}-${mm}`;
        };

        // 1) PRE-INDEX: ประกาศปรับ (capacity_publication_date) ต่อ area ต่อเดือน
        //    โครงสร้าง: Map<areaId, Map<'YYYY-MM', pubRecord>>
        // const r = await this.capacityPublicationDateAllID(sets?.area_id)
        // setArrAreaData

        // const pubByAreaMonth = new Map<number, Map<string, any>>();
        // for (const r of fCPn ?? []) {
        //   const aId = Number(r?.area_id);

        //   if (!pubByAreaMonth.has(aId)) pubByAreaMonth.set(aId, new Map());
        //   const mm = pubByAreaMonth.get(aId)!;

        //   for (const d of r?.capacity_publication_date ?? []) {
        //     // NOTE: ถ้าเดิม isDateMatching มีเงื่อนไขพิเศษ (เช่น เลือกอันล่าสุดในเดือน)
        //     // ให้ปรับ logic ที่นี่ ตอน set ค่าใน monthMap
        //     const mk = monthKeyFromYYYYMMDD(dayjs(d?.date_day).format('YYYY-MM')); // d.date = 'YYYY-MM-DD'
        //     mm.set(mk, d); // อันหลังทับอันหน้า = เทียบเท่า "ล่าสุดในเดือน"
        //   }
        // }
        // const matchAdjust = (areaId: number, mk: string) => pubByAreaMonth.get(areaId)?.get(mk) ?? null;

        // pubByAreaMonth ใช้เป็น cache ด้วย
          const pubByAreaMonth = new Map<number, Map<string, any>>();

          // แก้เฉพาะตรงนี้พอ
          const matchAdjust = async (areaId: number, mk: string) => {
            // มีในแคชแล้ว → ใช้เลย
            let mm = pubByAreaMonth.get(areaId);
            if (!mm) {
              // ดึงจาก DB เฉพาะ area นี้ครั้งแรก แล้ว build map รายเดือน
              const r = await this.capacityPublicationDateAllID(areaId);
              mm = new Map<string, any>();
              for (const d of r?.capacity_publication_date ?? []) {
                const key = d && toYYYYMM(d?.date_day) || ""; // 'YYYY-MM'
                
                // เก็บ "รายการล่าสุดของเดือน"
                const prev = mm.get(key);
                if (!prev || new Date(d.date_day) > new Date(prev.date_day)) {
                  mm.set(key, d);
                }
              }
              pubByAreaMonth.set(areaId, mm); // cache
            }
            return mm.get(mk) ?? null;
          };

        // 2) PRE-INDEX: คอนฟิก path รายเดือน + ชุดชื่อพื้นที่รายเดือน (แทน findActiveConfig / findConfigDate)
        const pconfigByMonth = new Map<string, any>();
        const areaNameSetByMonth = new Map<string, Set<string>>();

        for (const pu of pathAreaUsed ?? []) {
          const mk = monthKeyFromDDMMYYYY(pu?.date); // pu.date = 'DD/MM/YYYY'
          pconfigByMonth.set(mk, pu);

          let nameSet = areaNameSetByMonth.get(mk);
          if (!nameSet) {
            nameSet = new Set<string>();
            areaNameSetByMonth.set(mk, nameSet);
          }
          for (const a of pu?.areaData ?? []) {
            if (a?.name) nameSet.add(a.name);
          }
        }

        // 3) รวมพื้นที่ที่จะใช้ (unique ตาม id) จาก pathAreaUsed
        const uniqAreasById = new Map<number, any>();
        for (const pu of pathAreaUsed ?? []) {
          for (const a of pu?.areaData ?? []) {
            if (a?.id != null) uniqAreasById.set(Number(a.id), a);
          }
        }
        const setArrAreaData: any[] = Array.from(uniqAreasById.values());

        // 4) คำนวณงวด/ช่วงเวลา ครั้งเดียวต่อ sets + เตรียมคีย์เดือน/ตัวเลขไว้ล่วงหน้า
        const resultPeriodAdd =
          this.extendDates(
            sets?.valueEx?.valueExtend,
            contractCodePeriod?.shadow_period,
            modeDayAndMonth,
            sets
          ) ?? [];

          // const dateEndExcel = monthKeyFromYYYYMMDD(sets?.valueEx?.valueExtend[sets?.valueEx?.valueExtend.length - 1]?.date)
          const dateEndExcel = sets?.valueEx?.valueExtend[sets?.valueEx?.valueExtend.length - 1]?.date

        const periods = resultPeriodAdd.map((p: any) => ({
          ...p,
          mk: monthKeyFromYYYYMMDD(p?.date), // 'YYYY-MM' จาก 'YYYY-MM-DD'
          valueN: Number(p?.value) || 0, // แปลงเป็น number ไว้เลย
        }));

        // 5) main loop (ทดแทนลูปเดิมทั้งหมด)
        const lastPathCfg =
          pathAreaUsed && pathAreaUsed.length > 0
            ? pathAreaUsed[pathAreaUsed.length - 1]
            : null;

        for (let ical = 0; ical < setArrAreaData.length; ical++) {
          const area = setArrAreaData[ical];
          const areaId = Number(area?.id);
          const areaCap = Number(area?.area_nominal_capacity) || 0;

          const calcNew: any[] = [];
          let prevVal: number | undefined;

          for (let i = 0; i < periods.length; i++) {
            const pd = periods[i];

            // แทน findActiveConfig + ckArea + findConfigDate ด้วย lookup O(1)
            const nameSet = areaNameSetByMonth.get(pd.mk);
            if (!nameSet || !nameSet.has(area?.name)) continue; // เดือนนี้ไม่มีพื้นที่นี้ในคอนฟิก → ข้าม

            // ปรับตามประกาศ (แทน isDateMatching ในลูป)...
            const m = await matchAdjust(areaId, pd.mk);
           
            let mainCalc = areaCap;
            let adjust: number | null = null;
            let adjustType: string | null = null;

            if (m) {
              // if(m?.value_adjust_use === "NaN"){

              // }
              if (parseToNumber(m?.value_adjust_use) != null) {
                // if(m?.value_adjust_use === "NaN"){
                // }
                adjustType = 'value_adjust_use';
                mainCalc = parseToNumber(m.value_adjust_use);
                adjust = mainCalc;
              } else if (m?.value_adjust != null && parseToNumber(m?.value_adjust)) {
                // if(m?.value_adjust_use === "NaN"){
                // }
                adjustType = 'value_adjust';
                mainCalc = parseToNumber(m.value_adjust);
                adjust = mainCalc;
              } else if (m?.value != null && parseToNumber(m?.value)) {
                //  if(m?.value_adjust_use === "NaN"){
                // }
                adjustType = 'value';
                mainCalc = parseToNumber(m.value);
                adjust = mainCalc;
              }
            }

            // calc ...
            const cals = plus ? mainCalc + pd.valueN : mainCalc - pd.valueN;

            if (cals <= 0) {
              logWarning.push(
                `${pd.date} | ${mainCalc} - ${pd.valueN} => calc 0 น้อยกว่า`,
              );
            }

            //  if(m?.value_adjust_use === "NaN"){
            //     }

            // if(i <= 2){
            // }
            const ck_comparea =
              i === 0 ? true : pd.valueN === (prevVal ?? pd.valueN);
            prevVal = pd.valueN;

            // แทน findPconfig ด้วยคอนฟิกรายเดือน O(1) + fallback อันท้ายสุด
            const cfg = pconfigByMonth.get(pd.mk) ?? lastPathCfg;
            // date
            if(dayjs(dateEndExcel).isSameOrAfter(dayjs(pd?.date))){
              calcNew.push({
                ...pd,
                cals,
                ck_comparea,
                adjust,
                adjustType,
                config: cfg,
              });
            }
          }

          resCalcNew.push({
            area_nominal_capacity: areaCap,
            area_id: areaId,
            area_name: area?.name,
            calcNew,
            entry_exit_id: area?.entry_exit_id,
            exitTemp: {
              id: sets?.exit_id_temp,
              name: sets?.exit_name_temp,
            },
          });

        }

        // ===== END FAST VERSION =====

        console.timeEnd('setDataUsed G1 Exit areaAr Loop');

        console.timeEnd('setDataUsed G1 Exit');
      }

      onsetDataUseZero.push({ ...sets, resCalcNew: resCalcNew })
    }

    //   return { ...sets, resCalcNew: resCalcNew };
    // });

    console.timeEnd('setDataUsed G1');




    function dateRange(start: string, end: string, datas:any) {
      const s = dayjs(start).add(1, "day");
      const e = dayjs(end);
      const out: string[] = [];
      for (let d = s; !d.isAfter(e); d = d.add(1, "day")) {
        out.push({ ...datas, date:d.format("YYYY-MM-DD"),});
      }
      return out;
    }
    const nsetDataUseZero = onsetDataUseZero?.map((e:any) => {
      if(e?.entry_exit_id === 2){
        const dateEndExcel = e?.valueEx?.valueExtend[e?.valueEx?.valueExtend.length - 1]?.date
        const resultPeriodAdd = this.extendDates(
          e?.valueEx?.valueExtend,
          contractCodePeriod?.shadow_period,
          modeDayAndMonth,
          e
        ) ?? [];
        const extenDateEnd = resultPeriodAdd && resultPeriodAdd[resultPeriodAdd?.length - 1]?.date || null
        const { resCalcNew, ...nE } = e
        const _resCalcNew = resCalcNew?.map((eresCalcNew:any) => {

          const lastCalcEnd = eresCalcNew?.["calcNew"][eresCalcNew?.["calcNew"]?.length - 1]
          if(lastCalcEnd?.date === dateEndExcel && extenDateEnd){
            const { calcNew, ...meresCalcNew } = (eresCalcNew || null)
            const daysExitExtend = dateRange(dateEndExcel, extenDateEnd, lastCalcEnd);
            let ncalcNew = [ ...calcNew, ...daysExitExtend, ]
            // 
            return {
              ...meresCalcNew,
              calcNew: ncalcNew
            }
          }else{

            return eresCalcNew
          }
        })
        return {
          ...nE,
          resCalcNew: _resCalcNew,
        }
      }else{
        return e
      }
    })




    const resCalcNewMap = new Map();

    console.time('setDataUsed G2');
    for (const item of nsetDataUseZero) {
      const areaMap = new Map();
      for (const res of item.resCalcNew) {
        areaMap.set(res.area_name, res.calcNew);
      }
      resCalcNewMap.set(item.id, areaMap);
    }
    console.timeEnd('setDataUsed G2');


    console.time('setDataUsed G3');
    const setDataUse = nsetDataUseZero.map((sd) => {
      const resCalcNewPala = sd.resCalcNew.map((sdc) => {
        let calcNewFinal = sdc.calcNew.map((c) => ({ ...c }));

        for (const [otherId, otherAreaMap] of resCalcNewMap) {
          if (otherId === sd.id) continue;

          const otherCalcNewArr = otherAreaMap.get(sdc.area_name);
          if (!otherCalcNewArr) continue;

          const otherCalcNewByDate = new Map();
          for (const item of otherCalcNewArr) {
            otherCalcNewByDate.set(item.date, item.value);
          }

          for (const c of calcNewFinal) {
            if (otherCalcNewByDate.has(c.date)) {
              c.cals = plus
                ? Number(c.cals || 0) +
                Number(otherCalcNewByDate.get(c.date) || 0)
                : Number(c.cals || 0) -
                Number(otherCalcNewByDate.get(c.date) || 0);
            }
          }
        }

        return { ...sdc, calcNew: calcNewFinal };
      });

      return { ...sd, resCalcNew: resCalcNewPala };
    });
    console.timeEnd('setDataUsed G3');

    console.log('setDataUse : ', setDataUse);
    return {
      setDataUse,
      logWarnings: logWarning,
    };
  }

  async genPathDetail(setDataUse: any, pnmatchData: any, id: any, userId: any) {
    
    console.time('path detail G1');
    const versionLastUse = await this.prisma.booking_version.findFirst({
      where: {
        flag_use: true,
        contract_code_id: Number(id),
      },
    });
    console.timeEnd('path detail G1');

    let pathData = [];

  const _fnvPrime64 = 0x100000001b3n;
  const _fnvOffset64 = 0xcbf29ce484222325n;
  const _buf8 = new ArrayBuffer(8);
  const _dv8 = new DataView(_buf8);

  function assignNestedPeriods(data: any[]) {
  console.time('path detail G2.1');
  const monthKeyFromISO = (s: string) => (s ? s.slice(0, 7) : '');
  const monthKeyFromDDMY = (s: string) => {
    if (!s) return '';
    const dd = s.slice(0, 2), mm = s.slice(3, 5), yyyy = s.slice(6, 10);
    return `${yyyy}-${mm}`;
  };

  // ใช้ path_id เป็นหลัก (กันเคสหลาย path อยู่ใต้ master เดียวกัน)
  const getPathKey = (pc: any) =>
    String(pc?.path_id ?? pc?.config_master_path_id ?? '');

  // กันซ้ำรายการ path ต่อ period
  const pushedByPeriod = new Map<number, Set<string>>();
  const pushPathOnce = (period: number, pc: any, makeSlim: (pc:any)=>any) => {
    const key = getPathKey(pc);
    if (!key) return;
    let set = pushedByPeriod.get(period);
    if (!set) { set = new Set<string>(); pushedByPeriod.set(period, set); }
    if (set.has(key)) return;
    set.add(key);
    pathData.push({ period, pathConfig: makeSlim(pc) });
  };

  // ทำ slim
  const makeSlim = (pc: any) => {
    const out: any = { ...pc };
    if (Array.isArray(pc?.findExit)) {
      out.findExit = pc.findExit.map((pF: any) => ({
        id: pF?.id,
        config_master_path_id: pF?.config_master_path_id,
        revised_capacity_path_type_id: pF?.revised_capacity_path_type_id,
        source_id: pF?.source_id ?? null,
        area: {
          id: pF?.area?.id,
          name: pF?.area?.name,
          area_nominal_capacity: pF?.area?.area_nominal_capacity,
          zone_id: pF?.area?.zone_id,
          entry_exit_id: pF?.area?.entry_exit_id,
          supply_reference_quality_area: pF?.area?.supply_reference_quality_area,
          color: pF?.area?.color,
        },
      }));
    }
    delete out.config_master_path;
    return out;
  };

  // === base period per month (จาก path version) ===
  const monthPeriodBase = new Map<string, number>();
  const prevSigByArea = new Map<string, string>();
  let basePeriodCounter = 0;
  console.timeEnd('path detail G2.1');

  console.time('path detail G2.2');
  // รวมเดือนจาก pnmatchData
  const monthSet = new Set<string>();
  for (const a of (pnmatchData ?? [])) {
    for (const c of a?.configPathDate ?? []) {
      const mk = monthKeyFromDDMY(c?.date);
      if (mk) monthSet.add(mk);
    }
  }
  const monthsSorted = Array.from(monthSet).sort(); // 'YYYY-MM'
  console.timeEnd('path detail G2.2');

  // ---------- พรีอินเด็กซ์ configPathDate เป็น Map<area, Map<YYYY-MM, c>> ----------
  console.time('path detail G2.2.preindex');
  const areaMonthConf = new Map<string, Map<string, any>>();
  for (const a of (pnmatchData ?? [])) {
    const areaName = a?.area;
    let m = areaMonthConf.get(areaName);
    if (!m) { m = new Map(); areaMonthConf.set(areaName, m); }
    for (const c of (a?.configPathDate ?? [])) {
      const mk = monthKeyFromDDMY(c?.date);
      if (mk) m.set(mk, c); // อันหลังทับอันหน้า (ถือเป็นค่า effective ในเดือนนั้น)
    }
  }
  console.timeEnd('path detail G2.2.preindex');

  console.time('path detail G2.3');
  // ★★ baseline period 0 จากเดือนแรก (ไม่นับ path ซ้ำ) ★★
  const firstMonth = monthsSorted[0];
  if (firstMonth) {
    for (const a of (pnmatchData ?? [])) {
      const areaName = a?.area;
      const c = areaMonthConf.get(areaName)?.get(firstMonth);
      if (!c) continue;
      const pc = c?.pathConfig;

      const sig = [(pc?.path_id ?? ''), (pc?.value ?? ''), (c?.value ?? '')].join('|');
      prevSigByArea.set(areaName, sig);

      if (pc && (pc?.path_id != null || pc?.config_master_path_id != null)) {
        pushPathOnce(0, pc, makeSlim);
      }
    }
    monthPeriodBase.set(firstMonth, 0);
  }
  console.timeEnd('path detail G2.3');

  console.time('path detail G2.4');
  // เดินเดือนถัดไปเพื่อหา basePeriodCounter (เปลี่ยน version)
  for (let i = 1; i < monthsSorted.length; i++) {
    const mk = monthsSorted[i];
    let changedThisMonth = false;

    for (const a of (pnmatchData ?? [])) {
      const areaName = a?.area;
      const c = areaMonthConf.get(areaName)?.get(mk);
      if (!c) continue;
      const pc = c?.pathConfig;
      const sig = [(pc?.path_id ?? ''), (pc?.value ?? ''), (c?.value ?? '')].join('|');

      if (sig !== prevSigByArea.get(areaName)) {
        changedThisMonth = true;
      }
    }

    if (changedThisMonth) {
      basePeriodCounter++;

      for (const a of (pnmatchData ?? [])) {
        const areaName = a?.area;
        const c = areaMonthConf.get(areaName)?.get(mk);
        if (!c) continue;
        const pc = c?.pathConfig;
        const sig = [(pc?.path_id ?? ''), (pc?.value ?? ''), (c?.value ?? '')].join('|');
        prevSigByArea.set(areaName, sig);

        if (pc && (pc?.path_id != null || pc?.config_master_path_id != null)) {
          pushPathOnce(basePeriodCounter, pc, makeSlim);
        }
      }
    }
    monthPeriodBase.set(mk, basePeriodCounter);
  }
  console.timeEnd('path detail G2.4');

  console.time('path detail G2.5');
  // ===== รวมวันที่จริงทั้งหมด =====
  const allDates = new Set<string>();
  for (const row of data ?? []) {
    for (const res of row?.resCalcNew ?? []) {
      for (const c of res?.calcNew ?? []) if (c?.date) allDates.add(c.date);
    }
  }
  console.timeEnd('path detail G2.5');

  console.time('path detail G2.6');
  const datesAsc = Array.from(allDates).sort(); // 'YYYY-MM-DD' (เทียบสตริงถูกตามเวลา)

  // >>> carry-forward base period ให้ครบทุกเดือนที่มีข้อมูลจริง <<<
  const monthsFromDates = Array.from(new Set(datesAsc.map(d => d.slice(0, 7)))).sort();
  let carry = 0;
  for (const mk of monthsFromDates) {
    if (monthPeriodBase.has(mk)) {
      carry = monthPeriodBase.get(mk)!;
    }
    monthPeriodBase.set(mk, carry);
  }
  console.timeEnd('path detail G2.6');

  // -------------------- PREINDEX สำหรับช่วงรายวัน (G2.7) --------------------
  // แฮช FNV-1a 64-bit บนบิต float64 (เร็ว/ชนต่ำ)
  const _fnvPrime64 = 0x100000001b3n;
  const _fnvOffset64 = 0xcbf29ce484222325n;
  const _buf8_ = new ArrayBuffer(8);
  const _dv8_ = new DataView(_buf8_);
  function hashInit64(): bigint { return _fnvOffset64; }
  function hashMixFloat64(h: bigint, x: number): bigint {
    _dv8_.setFloat64(0, x, false); // big-endian
    const hi = BigInt(_dv8_.getUint32(0, false));
    const lo = BigInt(_dv8_.getUint32(4, false));
    h ^= hi; h = (h * _fnvPrime64) & 0xffffffffffffffffn;
    h ^= lo; h = (h * _fnvPrime64) & 0xffffffffffffffffn;
    return h;
  }

  console.time('path detail G2.6.preindex-res');
  type ResPack = {
    arr: any[];
    idxByDate: Map<string, number>;
    nums: Float64Array;        // ตัวเลขของ arr[i] (parse ครั้งเดียว)
    alignedIdx: Int32Array;    // index ของ arr สำหรับ datesAsc[j] (ถ้าไม่มี = -1)
    alignedNums: Float64Array; // ค่าตัวเลขตาม datesAsc[j] (ถ้าไม่มี = 0)
  };

  const resPacks: ResPack[] = [];
  for (const row of (data ?? [])) {
    for (const res of (row?.resCalcNew ?? [])) {
      const arr = res?.calcNew ?? [];
      const idxByDate = new Map<string, number>();
      const nums = new Float64Array(arr.length);

      for (let i = 0; i < arr.length; i++) {
        const ci = arr[i];
        idxByDate.set(ci?.date, i);
        // แปลงเป็นเลขครั้งเดียว (เทียบเท่า getNum) — ระวังรูปแบบเดิม
        const raw = (ci?.cals ?? ci?.value ?? 0);
        const n = (typeof raw === 'number')
          ? (Number.isFinite(raw) ? raw : 0)
          : Number(String(raw).replace(/,/g, '').trim()) || 0;
        nums[i] = n;
      }

      resPacks.push({
        arr, idxByDate, nums,
        alignedIdx: new Int32Array(datesAsc.length),
        alignedNums: new Float64Array(datesAsc.length),
      });
    }
  }

  // ทำ alignment ต่อวันครั้งเดียว (รักษา format 'YYYY-MM-DD' เดิมไว้)
  for (let j = 0; j < datesAsc.length; j++) {
    const d = datesAsc[j];
    for (let p = 0; p < resPacks.length; p++) {
      const pack = resPacks[p];
      const idx = pack.idxByDate.get(d) ?? -1;
      pack.alignedIdx[j] = idx;
      pack.alignedNums[j] = (idx >= 0 ? pack.nums[idx] : 0);
    }
  }
  console.timeEnd('path detail G2.6.preindex-res');

  // ------------------------- ช่วงรายวัน (G2.7 เร็วขึ้น) -------------------------
  console.time('path detail G2.7');
  let lastSignatureHash: bigint | null = null; // แทน string signature
  let curPeriod = 0;
  let curMonth = '';

  for (let j = 0; j < datesAsc.length; j++) {
    const d = datesAsc[j];
    const mk = monthKeyFromISO(d);
    const baseForMonth = monthPeriodBase.get(mk)!;

    if (mk !== curMonth) {
      curMonth = mk;
      curPeriod = baseForMonth;
      lastSignatureHash = null; // reset เมื่อเปลี่ยนเดือน
    }

    // แฮช incremental จากค่าของทุก res ในวัน d (ไม่ต้องสร้าง sigParts)
    let h = hashInit64();
    for (let p = 0; p < resPacks.length; p++) {
      h = hashMixFloat64(h, resPacks[p].alignedNums[j]);
    }

    if (lastSignatureHash !== null && h !== lastSignatureHash) {
      curPeriod += 1;
    }
    lastSignatureHash = h;

    // อัปเดต period กลับเข้า calcNew โดยไม่ใช้ findIndex (อ้างด้วย alignedIdx)
    for (let p = 0; p < resPacks.length; p++) {
      const idx = resPacks[p].alignedIdx[j];
      if (idx >= 0) {
        // คงพฤติกรรมเดิม (immutable)
        resPacks[p].arr[idx] = { ...resPacks[p].arr[idx], period: curPeriod };

        // ถ้าอนุญาตมิวเทต จะไวกว่า:
        // resPacks[p].arr[idx].period = curPeriod;
      }
    }
  }
  console.timeEnd('path detail G2.7');

  return data;
}

// path_temp_json
    
    console.time('path detail G2');
    const resultC = assignNestedPeriods(setDataUse);
    console.timeEnd('path detail G2');


    const nowDate = getTodayNowAdd7().toDate();

    console.time('path detail G3');
    await this.prisma.capacity_detail.updateMany({
      where: {
        contract_code_id: Number(id),
      },
      data: {
        flag_use: false,
      },
    });
    console.timeEnd('path detail G3');

    console.time('path detail G4');
    const capacityDetail = await this.prisma.capacity_detail.create({
      data: {
        contract_code: {
          connect: {
            id: Number(id),
          },
        },
        booking_version: {
          connect: {
            id: Number(versionLastUse?.id),
          },
        },
        flag_use: true,
        mode_temp: 'APPROVED',
        create_date: nowDate,
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          },
        },
      },
    });
    console.timeEnd('path detail G4');


    console.time('path detail G5');
    // แบ่งตาม path period
    const batchCapacityDetailPoint = resultC.map(
      ({ resCalcNew, paths, ...newResultC }) => ({
        capacity_detail_id: Number(capacityDetail?.id),
        area_id: Number(newResultC?.area_id),
        create_by: Number(userId),
        // path_temp: JSON.stringify(paths),
        path_temp_json: pathData,
        // path_temp: JSON.stringify(pathData),
        // temp: JSON.stringify(newResultC),
        create_date: nowDate,
        create_date_num: getTodayNowAdd7().unix(),
      }),
    );
    console.timeEnd('path detail G5');

    console.time('path detail G6');
    const savedPoints = await this.prisma.capacity_detail_point.createMany({
      data: batchCapacityDetailPoint,
      skipDuplicates: true, // ป้องกันการ Insert ซ้ำ
    });
    console.timeEnd('path detail G6');

    console.time('path detail G7');
    const savedPoints1 = await this.prisma.capacity_detail_point.findMany({
      where: {
        capacity_detail_id: Number(capacityDetail?.id),
      },
      orderBy: {
        id: 'desc', // ดึง ID ล่าสุดที่ถูก Insert
      },
    });
    console.timeEnd('path detail G7');

    console.time('path detail G8');
    const savedPointMap = new Map(
      savedPoints1.map((sp) => [sp.capacity_detail_id, sp.id]),
    );
    console.timeEnd('path detail G8');

    console.time('path detail G9');
    let pointDate: any = [];
    resultC.forEach(({ resCalcNew }, index) => {
      const savePointId = savedPointMap.get(capacityDetail?.id); // ใช้ ID ที่ได้จาก createMany()

      resCalcNew.forEach(({ calcNew, ...newResCalcNew }) => {
        
        calcNew.forEach((calc) => {
          const date = /^\d{2}\/\d{2}\/\d{4}$/.test(calc.date)
          ? dayjs(calc.date, 'DD/MM/YYYY', true).toDate()
          : dayjs(calc.date).toDate();
          pointDate.push({
            capacity_detail_point_id: Number(savePointId),
            area_id: Number(newResCalcNew?.area_id),
            value: calc.value ? String(calc.value) : '0',
            cals: calc.cals ? String(calc.cals) : '0',
            adjust: calc.adjust ? String(calc.adjust) : '0',
            adjust_type: calc.adjustType ? String(calc.adjustType) : null,
            ck_comparea: calc.ck_comparea,
            period: Number(calc.period),
            area_nominal_capacity: String(newResCalcNew?.area_nominal_capacity),
            // date: getTodayNowAdd7(calc.date).toDate(),
            date: date,

            create_date: nowDate,
            create_by: Number(userId),
            create_date_num: getTodayNowAdd7().unix(),
            path_id: calc && Number(calc?.config?.id) || -1,
          });
        });
      });
    });
    console.timeEnd('path detail G9');

    console.time('path detail G10');
    if (pointDate.length > 0) {
      await this.prisma.capacity_detail_point_date.createMany({
        data: pointDate,
      });
    }
    console.timeEnd('path detail G10');
  }

  async capacityRequestManagementDownload(id: any) {
    const bookingVersion = await this.prisma.booking_version.findUnique({
      where: { id: Number(id) },
      include: {
        booking_full_json: true,
        booking_row_json: true,
      },
    });
    let newBK: any = bookingVersion;
    if(!newBK){
      throw new Error('bookingVersion not value')
    }
    newBK['booking_full_json'] = await (newBK && newBK?.booking_full_json || [])?.map(
      (e: any) => {
        const data_temp = JSON.parse(e['data_temp']);
        return { ...e, data_temp: data_temp };
      },
    );
    newBK['booking_row_json'] = await (newBK && newBK?.booking_row_json)?.map((e: any) => {
      const data_temp = JSON.parse(e['data_temp']);
      return { ...e, data_temp: data_temp };
    });

    const shipperInfo =
      newBK['booking_full_json'][0]['data_temp']['shipperInfo'];

    const ShipperName = Object.keys(shipperInfo)
      .map((key) => {
        return shipperInfo[key]['Shipper Name'];
      })
      .find((item) => item !== undefined);
    const typeOfContract: any = Object.keys(shipperInfo)
      .map((key) => {
        return shipperInfo[key]['Type of Contract'];
      })
      .find((item) => item !== undefined);
    const ContractCode = Object.keys(shipperInfo)
      .map((key) => {
        return shipperInfo[key]['Contract Code'];
      })
      .find((item) => item !== undefined);

    // headerEntry
    const headerEntryInfo1 =
      newBK['booking_full_json'][0]['data_temp']['headerEntry'][
      'Capacity Daily Booking (MMBTU/d)'
      ];

    const headerEntryArr1 = Object.keys(headerEntryInfo1)
      .filter((key) => key !== 'key')
      .map((key) => {
        return key;
      })
      .sort((a, b) => {
        return (
          dayjs(a, 'DD/MM/YYYY').toDate().getTime() -
          dayjs(b, 'DD/MM/YYYY').toDate().getTime()
        );
      });
    const headerEntryInfo2 =
      newBK['booking_full_json'][0]['data_temp']['headerEntry'][
      'Maximum Hour Booking (MMBTU/h)'
      ];
    const headerEntryArr2 = Object.keys(headerEntryInfo2)
      .filter((key) => key !== 'key')
      .map((key) => {
        return key;
      })
      .sort((a, b) => {
        return (
          dayjs(a, 'DD/MM/YYYY').toDate().getTime() -
          dayjs(b, 'DD/MM/YYYY').toDate().getTime()
        );
      });
    const headerEntryInfo3 =
      newBK['booking_full_json'][0]['data_temp']['headerEntry'][
      'Capacity Daily Booking (MMscfd)'
      ];
    const headerEntryArr3 = Object.keys(headerEntryInfo3)
      .filter((key) => key !== 'key')
      .map((key) => {
        return key;
      })
      .sort((a, b) => {
        return (
          dayjs(a, 'DD/MM/YYYY').toDate().getTime() -
          dayjs(b, 'DD/MM/YYYY').toDate().getTime()
        );
      });
    const headerEntryInfo4 =
      newBK['booking_full_json'][0]['data_temp']['headerEntry'][
      'Maximum Hour Booking (MMscfh)'
      ];
    const headerEntryArr4 = Object.keys(headerEntryInfo4)
      .filter((key) => key !== 'key')
      .map((key) => {
        return key;
      })
      .sort((a, b) => {
        return (
          dayjs(a, 'DD/MM/YYYY').toDate().getTime() -
          dayjs(b, 'DD/MM/YYYY').toDate().getTime()
        );
      });

    const capacityDailyBookingArrayMMB = [
      'Capacity Daily Booking (MMBTU/d)',
      ...Array(headerEntryArr1.length - 1).fill(''),
    ];
    const maximumHourBookingMMBArray = [
      'Maximum Hour Booking (MMBTU/h)',
      ...Array(headerEntryArr2.length - 1).fill(''),
    ];
    const capacityDailyBookingMMsArray = [
      'Capacity Daily Booking (MMscfd)',
      ...Array(headerEntryArr3.length - 1).fill(''),
    ];
    const maximumHourBookingMMsArray = [
      'Maximum Hour Booking (MMscfh)',
      ...Array(headerEntryArr4.length - 1).fill(''),
    ];

    const headerExitInfo1 =
      newBK['booking_full_json'][0]['data_temp']['headerExit'][
      'Capacity Daily Booking (MMBTU/d)'
      ];
    const headerExitArr1 = Object.keys(headerExitInfo1)
      .filter((key) => key !== 'key')
      .map((key) => {
        return key;
      })
      .sort((a, b) => {
        return (
          dayjs(a, 'DD/MM/YYYY').toDate().getTime() -
          dayjs(b, 'DD/MM/YYYY').toDate().getTime()
        );
      });
    const headerExitInfo2 =
      newBK['booking_full_json'][0]['data_temp']['headerExit'][
      'Capacity Daily Booking (MMBTU/d)'
      ];
    const headerExitArr2 = Object.keys(headerExitInfo2)
      .filter((key) => key !== 'key')
      .map((key) => {
        return key;
      })
      .sort((a, b) => {
        return (
          dayjs(a, 'DD/MM/YYYY').toDate().getTime() -
          dayjs(b, 'DD/MM/YYYY').toDate().getTime()
        );
      });

    const capacityDailyBookingArrayMMBExit = [
      'Capacity Daily Booking (MMBTU/d)',
      ...Array(headerExitArr1.length - 1).fill(''),
    ];
    const maximumHourBookingMMBArrayExit = [
      'Maximum Hour Booking (MMBTU/h)',
      ...Array(headerExitArr2.length - 1).fill(''),
    ];

    const entryValue = newBK['booking_full_json'][0]['data_temp']['entryValue'];
    const newEntry = this.transformDataArrNew(entryValue);
    const exitValue = newBK['booking_full_json'][0]['data_temp']['exitValue'];
    const newExit = this.transformDataArrNew(exitValue);
    const sumEntry = newBK['booking_full_json'][0]['data_temp']['sumEntries'];
    const filteredDataSumEntry = Object.fromEntries(
      Object.entries(sumEntry).filter(([key]) => key !== '0'),
    );
    // สร้างอาร์เรย์ที่ตำแหน่ง 0 เป็น "Sum Entry"
    const maxIndexEntry = Math.max(
      ...Object.keys(filteredDataSumEntry).map(Number),
    ); // หาค่าคีย์สูงสุด
    const arrayResultEntry = Array.from(
      { length: maxIndexEntry + 1 },
      (_, i) => (i === 0 ? 'Sum Entry' : filteredDataSumEntry[i] || ''),
    );

    const sumExit = newBK['booking_full_json'][0]['data_temp']['sumExits'];
    const filteredDataSumExit = Object.fromEntries(
      Object.entries(sumExit).filter(([key]) => key !== '0'),
    );
    // สร้างอาร์เรย์ที่ตำแหน่ง 0 เป็น "Sum Exit"
    const maxIndexExit = Math.max(
      ...Object.keys(filteredDataSumExit).map(Number),
    ); // หาค่าคีย์สูงสุด
    const arrayResultExit = Array.from({ length: maxIndexExit + 1 }, (_, i) =>
      i === 0 ? 'Sum Exit' : filteredDataSumExit[i] || '',
    );

    const data = [
      [], // Row 0
      ['Shipper Name', 'Type of Contract', 'Contract Code'], // Row 1
      [ShipperName, typeOfContract, ContractCode], // Row 2
      [], // Row 3 (empty row)
      [
        'Entry',
        null,
        null,
        null,
        null,
        'Period',
        '',
        ...capacityDailyBookingArrayMMB,
        ...maximumHourBookingMMBArray,
        ...capacityDailyBookingMMsArray,
        ...maximumHourBookingMMsArray,
      ],
      [
        '',
        'Pressure Range',
        '',
        'Temperature Range',
        '',
        'From',
        'To',
        ...headerEntryArr1,
        ...headerEntryArr2,
        ...headerEntryArr3,
        ...headerEntryArr4,
      ],
      ['', 'Min', 'Max', 'Min', 'Max', '', ''],
      ...newEntry,
      arrayResultEntry,
      [],
      [
        'Exit',
        null,
        null,
        null,
        null,
        'Period',
        '',
        ...capacityDailyBookingArrayMMBExit,
        ...maximumHourBookingMMBArrayExit,
      ],
      [
        '',
        'Pressure Range',
        '',
        'Temperature Range',
        '',
        'From',
        'To',
        ...headerExitArr1,
        ...headerExitArr2,
      ],
      ['', 'Min', 'Max', 'Min', 'Max', '', ''],
      ...newExit,
      arrayResultExit,
    ];

    // สร้าง workbook และ worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data); // สร้าง sheet จาก array ของ array
    const workbook = XLSX.utils.book_new(); // สร้าง workbook ใหม่
    XLSX.utils.book_append_sheet(workbook, worksheet, typeOfContract); // เพิ่ม sheet ลงใน workbook

    // Merge cells สำหรับ header ที่มีการรวม (merge ข้ามคอลัมน์และแถว)
    worksheet['!merges'] = [
      // Merge คอลัมน์สำหรับ "Pressure Range" และ "Temperature Range"
      { s: { r: 5, c: 1 }, e: { r: 5, c: 2 } }, // Merge 'Pressure Range' header (c:6 to c:7)
      { s: { r: 5, c: 3 }, e: { r: 5, c: 4 } }, // Merge 'Temperature Range' header (c:8 to c:9)

      // Merge แถวสำหรับ "Zone" ที่รวมหลายแถว
      { s: { r: 4, c: 0 }, e: { r: 6, c: 0 } }, // Merge 'Entry' row header (r:4 to r:5)

      // period
      { s: { r: 4, c: 5 }, e: { r: 4, c: 6 } },
      // form to
      { s: { r: 5, c: 5 }, e: { r: 6, c: 5 } },
      { s: { r: 5, c: 6 }, e: { r: 6, c: 6 } },

      // Entry Merge dynamic สำหรับ capacityDailyBookingArrayMMB
      { s: { r: 4, c: 7 }, e: { r: 4, c: 7 + headerEntryArr1.length - 1 } },

      // Entry Merge dynamic สำหรับ maximumHourBookingMMBArray
      {
        s: { r: 4, c: 7 + headerEntryArr1.length },
        e: { r: 4, c: 7 + headerEntryArr1.length * 2 - 1 },
      },

      // Entry Merge dynamic สำหรับ capacityDailyBookingMMsArray
      {
        s: { r: 4, c: 7 + headerEntryArr1.length * 2 },
        e: { r: 4, c: 7 + headerEntryArr1.length * 3 - 1 },
      },

      // Entry Merge dynamic สำหรับ maximumHourBookingMMsArray
      {
        s: { r: 4, c: 7 + headerEntryArr1.length * 3 },
        e: { r: 4, c: 7 + headerEntryArr1.length * 4 - 1 },
      },

      //------
      {
        s: { r: 11 + (newEntry.length - 1), c: 1 },
        e: { r: 11 + (newEntry.length - 1), c: 2 },
      }, // Merge 'Pressure Range' header (c:6 to c:7)
      {
        s: { r: 11 + (newEntry.length - 1), c: 3 },
        e: { r: 11 + (newEntry.length - 1), c: 4 },
      }, // Merge 'Temperature Range' header (c:8 to c:9)

      {
        s: { r: 10 + (newEntry.length - 1), c: 0 },
        e: { r: 12 + (newEntry.length - 1), c: 0 },
      }, // Merge 'Entry' row header (r:4 to r:5)

      {
        s: { r: 10 + (newEntry.length - 1), c: 5 },
        e: { r: 10 + (newEntry.length - 1), c: 6 },
      },
      // // form to
      {
        s: { r: 11 + (newEntry.length - 1), c: 5 },
        e: { r: 12 + (newEntry.length - 1), c: 5 },
      },
      {
        s: { r: 11 + (newEntry.length - 1), c: 6 },
        e: { r: 12 + (newEntry.length - 1), c: 6 },
      },
      // Entry Merge dynamic สำหรับ capacityDailyBookingArrayMMBExit
      {
        s: { r: 10 + (newEntry.length - 1), c: 7 },
        e: {
          r: 10 + (newEntry.length - 1),
          c: 7 + headerEntryArr1.length - 1,
        },
      },
      // Entry Merge dynamic สำหรับ maximumHourBookingMMBArrayExit
      {
        s: { r: 10 + (newEntry.length - 1), c: 7 + headerEntryArr1.length },
        e: {
          r: 10 + (newEntry.length - 1),
          c: 7 + headerEntryArr1.length * 2 - 1,
        },
      },
    ];


    // Merge cells สำหรับ resultDate กับ row อันล่าง
    const resultDateCount = headerEntryArr1.length;

    for (let i = 0; i < resultDateCount * 4; i++) {
      const startColumnIndex = 7 + i;

      worksheet['!merges'].push({
        s: { r: 5, c: startColumnIndex }, // จุดเริ่มต้นการ merge จากแถวที่ 5
        e: { r: 6, c: startColumnIndex }, // จุดสิ้นสุดการ merge ในแถวที่ 6
      });
    }
    for (let i = 0; i < resultDateCount * 2; i++) {
      const startColumnIndex = 7 + i;

      worksheet['!merges'].push({
        s: { r: 11 + (newEntry.length - 1), c: startColumnIndex }, // จุดเริ่มต้นการ merge จากแถวที่ 11
        e: { r: 12 + (newEntry.length - 1), c: startColumnIndex }, // จุดสิ้นสุดการ merge ในแถวที่ 12
      });
    }

    Object.keys(worksheet).forEach((cell) => {
      const rowNumber = parseInt(cell.replace(/[^0-9]/g, '')); // ดึงเลขแถวออกมา
      const columnLetter = cell.replace(/[0-9]/g, '');

      if (
        worksheet[cell] &&
        typeof worksheet[cell] === 'object' &&
        cell[0] !== '!'
      ) {
        worksheet[cell].z = '@'; // ใช้รูปแบบ '@' เพื่อระบุว่าเป็น Text
        worksheet[cell].s = worksheet[cell].s || {}; // สร้าง object s ถ้ายังไม่มี
        // ถ้าเป็นแถวที่ 3, 8, หรือ 14 จะไม่ใช้ตัวหนา
        if (rowNumber === 3 || rowNumber === 8 || rowNumber === 14) {
          worksheet[cell].s = {
            border: {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            },
            alignment: {
              horizontal: 'center', // จัดกลางแนวนอน
              vertical: 'center', // จัดกลางแนวตั้ง
              wrapText: true,
            },
          };
        } else {
          // สำหรับแถวอื่น ๆ ใช้สไตล์ตัวหนา
          worksheet[cell].s = {
            border: {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            },
            alignment: {
              horizontal: 'center', // จัดกลางแนวนอน
              vertical: 'center', // จัดกลางแนวตั้ง
              wrapText: true,
            },
            font: {
              bold: true, // ทำให้ข้อความในเซลล์เป็นตัวหนา
            },
          };
        }

        if (
          rowNumber === 6 &&
          columnLetter.charCodeAt(0) >= 'B'.charCodeAt(0) &&
          columnLetter.charCodeAt(0) <= 'E'.charCodeAt(0)
        ) {
          worksheet[cell].s.font = {
            color: { rgb: 'FF0000' },
            bold: true,
          };
        }

        if (rowNumber === 6 && columnLetter >= 'AA' && columnLetter <= 'AG') {
          worksheet[cell].s.font = {
            color: { rgb: 'FF0000' }, // เปลี่ยนสีข้อความเป็นสีแดง
            bold: true,
          };
        }

        if (
          rowNumber === 7 &&
          columnLetter.charCodeAt(0) >= 'B'.charCodeAt(0) &&
          columnLetter.charCodeAt(0) <= 'E'.charCodeAt(0)
        ) {
          worksheet[cell].s.font = {
            color: { rgb: 'FF0000' }, // เปลี่ยนสีข้อความเป็นสีแดง
            bold: true,
          };
        }

        if (rowNumber === 7 && columnLetter >= 'AA' && columnLetter <= 'AG') {
          worksheet[cell].s.font = {
            color: { rgb: 'FF0000' },
            bold: true,
          };
        }

        if (
          rowNumber === 12 &&
          columnLetter.charCodeAt(0) >= 'B'.charCodeAt(0) &&
          columnLetter.charCodeAt(0) <= 'E'.charCodeAt(0)
        ) {
          worksheet[cell].s.font = {
            color: { rgb: 'FF0000' },
            bold: true,
          };
        }

        if (
          rowNumber === 13 &&
          columnLetter.charCodeAt(0) >= 'B'.charCodeAt(0) &&
          columnLetter.charCodeAt(0) <= 'E'.charCodeAt(0)
        ) {
          worksheet[cell].s.font = {
            color: { rgb: 'FF0000' },
            bold: true,
          };
        }

        // แปลงค่า worksheet[cell].v เป็นสตริงในรูปแบบ 'DD/MM/YYYY'
        const cellDate = worksheet[cell].v ? worksheet[cell].v.toString() : '';
        if (
          (rowNumber === 6 || rowNumber === 12) &&
          headerEntryArr1.includes(cellDate)
        ) {
          worksheet[cell].s = worksheet[cell].s || {};
          worksheet[cell].s = {
            fill: {
              patternType: 'solid',
              fgColor: { rgb: '92D04F' },
            },
            font: {
              color: { rgb: 'FF0000' },
              bold: true,
            },
            border: {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            },
            alignment: {
              horizontal: 'center',
              vertical: 'center',
              wrapText: true,
            },
          };
        }
      }
    });

    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });

    const times = getTodayNowAdd7().format('YYYYMMDDHHmmss');

    return {
      excelBuffer,
      typeOfContract: `${ContractCode}_${bookingVersion?.version}_${times}`,
    };
  }
}
