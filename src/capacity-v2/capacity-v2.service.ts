import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx-js-style';
import * as fs from 'fs';
import * as FormData from 'form-data';

import { Response } from 'express';

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
  excelSerialToDate,
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayNowDDMMYYYYDfault,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayNowYYYYMMDDHHmmssDfaultAdd7,
  getTodayStartAdd7,
  getTodayStartDDMMYYYYAdd7,
} from 'src/common/utils/date.util';
import { uploadFilsTemp } from 'src/common/utils/uploadFileIn';
import { CapacityMiddleService } from './capacity-middle.service';
import { isMatch } from 'src/common/utils/allocation.util';
import { parseToNumber, parseToNumber3Decimal, parseToNumber6Decimal } from 'src/common/utils/number.util';
import { CallReceivedService } from 'src/call-received/call-received.service';
import { middleNotiInapp } from 'src/common/utils/inapp.util';
dayjs.extend(isSameOrBefore); // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween); // เปิดใช้งาน plugin isBetween
dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class CapacityV2Service {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private readonly uploadTemplateForShipperService: UploadTemplateForShipperService,
    private readonly fileUploadService: FileUploadService,
    private readonly capacityMiddleService: CapacityMiddleService,
    private readonly callReceivedService: CallReceivedService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) { }

  async capacityRequestManagementOnce(id: any) {
    const resData = await this.prisma.contract_code.findMany({
      where: {
        id: Number(id),
      },
      include: {
        type_account: true,
        term_type: true,
        ref_contract_code_by: true,
        group: true,
        submission_comment_capacity_request_management: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
        status_capacity_request_management_process: true,
        status_capacity_request_management: true,
        file_capacity_request_management: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
        extend_contract_capacity_request_management: true,
        book_capacity_request_management: {
          include: {
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
          },
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
          },
        },
        booking_version: {
          include: {
            booking_version_comment: {
              include: {
                create_by_account: {
                  select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                  },
                },
                update_by_account: {
                  select: {
                    id: true,
                    email: true,
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
            booking_full_json: true,
            booking_row_json: true,
            booking_full_json_release: true,
            booking_row_json_release: true,
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
              },
            },
            status_capacity_request_management: true,
            type_account: true,
          },
          orderBy: {
            id: 'desc',
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    return resData;
  }

  isMoreThan3Decimals(num: any) {
    if (typeof num !== 'number' || isNaN(num)) return false;
    const parts = num.toString().split('.');
    if (parts.length === 2 && parts[1].length > 3) {
      return true; // เกิน 3 ตำแหน่ง
    }
    return false;
  }

  async fnJSONtoOBJBook(payload: any) {
    const resultTranform = (await JSON.parse(payload?.json_data)) || null;

    const fnIndex_ = (val_: any, key_: any) => val_.findIndex((row: any) => row?.[0] === key_)
    const fnValue_ = (val_: any, key_: any) => val_.find((row: any) => row?.[0] === key_)
    const shiftKeysFrom = (obj: any, startKey = 3, offset = 4) => {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => {
          const n = Number(k);
          if (Number.isFinite(n) && n >= startKey) return [String(n + offset), v];
          return [k, v];
        })
      );
    }
    const getValueArrKey = (obj: any, from: any, to: any) => Object.entries(obj)
      .filter(([k]) => {
        const n = Number(k);
        return Number.isFinite(n) && n >= from && n <= to;
      })
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => v);

    const checkShipperIDorName = resultTranform?.[0]?.[0] === "Shipper Name" ? 1 : resultTranform?.[0]?.[0] === "Shipper ID" ? 2 : null

    const entryValueIndex = fnIndex_(resultTranform, "Entry");
    const exitValueIndex = fnIndex_(resultTranform, "Exit");
    const sumEntriesIndex = fnIndex_(resultTranform, "Sum Entry");
    const sumEntriesValue = fnValue_(resultTranform, "Sum Entry");
    const sumExitsIndex = fnIndex_(resultTranform, "Sum Exit");
    const sumExitsValue = fnValue_(resultTranform, "Sum Exit");

    const keyHeadInfo = checkShipperIDorName === 2 ? {
      0: "Shipper Name",
      1: "Type of Contract",
      2: "Contract Code"
    } : resultTranform[0]
    const keyValueInfo = checkShipperIDorName === 2 ? {
      0: (await this.capacityMiddleService.getGroupByIDName(resultTranform?.[1]?.[0]))?.name,
      1: resultTranform?.[1]?.[1],
      2: resultTranform?.[1]?.[2]
    } : resultTranform[1]
    const keyHeadMinMax: any = {
      1: "Pressure Range",
      3: "Temperature Range"
    }
    const keyMinMax: any = { 1: "Min", 2: "Max", 3: "Min", 4: "Max" }

    const session1 = [
      keyHeadInfo,
      keyValueInfo,
    ]

    const session2Head = getValueArrKey(resultTranform, entryValueIndex, entryValueIndex + 1)
    const session2Head_ = checkShipperIDorName === 2 ? session2Head?.map((item: any, ix: number) => {
      return ix === 1 ? { ...keyHeadMinMax, ...shiftKeysFrom(item, 1, 4) } : shiftKeysFrom(item, 1, 4)
    }) : session2Head
    const session2Val = getValueArrKey(resultTranform, checkShipperIDorName === 2 ? entryValueIndex + 2 : entryValueIndex + 3, sumEntriesIndex - 1)
    const session2Val_ = checkShipperIDorName === 2 ? session2Val?.map((item: any) => {
      return shiftKeysFrom(item, 1, 4)
    }) : session2Val
    const session2Sum = [checkShipperIDorName === 2 ? shiftKeysFrom(sumEntriesValue, 3, 4) : sumEntriesValue]

    const session3Head = getValueArrKey(resultTranform, exitValueIndex, exitValueIndex + 1)
    const session3Head_ = checkShipperIDorName === 2 ? session3Head?.map((item: any, ix: number) => {
      return ix === 1 ? { ...keyHeadMinMax, ...shiftKeysFrom(item, 1, 4) } : shiftKeysFrom(item, 1, 4)
    }) : session3Head
    const session3Val = getValueArrKey(resultTranform, checkShipperIDorName === 2 ? exitValueIndex + 2 : exitValueIndex + 3, sumExitsIndex - 1)
    const session3Val_ = checkShipperIDorName === 2 ? session3Val?.map((item: any) => {
      return shiftKeysFrom(item, 1, 4)
    }) : session3Val
    const session3Sum = [checkShipperIDorName === 2 ? shiftKeysFrom(sumExitsValue, 3, 4) : sumExitsValue]

    const finalDataJSON = [
      ...session1, // ok
      ...session2Head_, // ok
      ...([keyMinMax]), // ok
      ...session2Val_, // ok
      ...session2Sum, // ok
      ...session3Head_, // ok
      ...([keyMinMax]), // ok
      ...session3Val_, // ok
      ...session3Sum, // ok
    ]
    return finalDataJSON
  }

  async getLastestCodeByYear(payload: any, userId: any) {
    const year = payload?.year

    if (!!!year) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Year is required.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existContractCodeByYear = await this.prisma.contract_code.findMany({
      where: {
        contract_code: {
          contains: year,
        },
      },
    })

    // หาเลข code (ส่วนท้ายหลัง '-') ที่มีค่ามากที่สุดใน contract_code ที่มีปีนี้
    // รูปแบบที่คาดหวัง: <prefix>-<year>-<codeNumber>
    let maxCode: number | null = null
    let maxContractCode: string | null = null
    if (existContractCodeByYear.length > 0) {
      existContractCodeByYear.forEach(contractCodeItem => {
        const raw = contractCodeItem?.contract_code ?? ''
        const contractCodeItemSplit = raw.split('-')
        if (contractCodeItemSplit.length === 3) {
          const contractCodeItemCode = contractCodeItemSplit[2]
          const code = parseToNumber(contractCodeItemCode)
          if (code || code === 0) {
            if (maxCode === null || code > maxCode) {
              maxCode = code
              maxContractCode = raw
            }
          }
        }
      })
    }

    if (maxCode !== null) {
      const nextCode = `${maxCode + 1}`.padStart(3, '0')
      return {
        year,
        nextCode,
        maxContractCode,
      }
    }


    throw new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: 'Contract Code not found. Please verify and try again.',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  textNull_(val_:any){
    return val_ === "" || val_ == null ? "Null" : val_
  }

  async checkAV(
    data: any,
    userId: any,
    file: any,
    token: any,
    newShipperIdName?: string
  ) {

    const resultTranform = (await JSON.parse(data?.json_data)) || null;
    const headerEntry = resultTranform?.headerEntry || {};
    const entryValue = resultTranform?.entryValue || [];
    const headerExit = resultTranform?.headerExit || {};
    const exitValue = resultTranform?.exitValue || [];
    const sumEntries = resultTranform?.sumEntries || {};
    const sumExits = resultTranform?.sumExits || {};

    const keyEntryFrom = resultTranform?.['headerEntry']?.['Period']?.['From']?.['key'];
    const keyEntryTo = resultTranform?.['headerEntry']?.['Period']?.['To']?.['key'];
    const keyExitFrom = resultTranform?.['headerExit']?.['Period']?.['From']?.['key'];
    const keyExitTo = resultTranform?.['headerExit']?.['Period']?.['To']?.['key'];

    // add missing value by key
    Object.values(headerEntry).forEach((capacityDates: any) => {
      Object.keys(capacityDates).forEach((dateKeyString: any) => {
        const keyValue = capacityDates[dateKeyString]?.['key'];
        entryValue.forEach((entry: any) => {
          if (!Object.keys(entry).includes(keyValue)){
            entry[keyValue] = '';
          }
        })
      })
    })

    Object.values(headerExit).forEach((capacityDates: any) => {
      Object.keys(capacityDates).forEach((dateKeyString: any) => {
        const keyValue = capacityDates[dateKeyString]?.['key'];
        exitValue.forEach((entry: any) => {
          if (!Object.keys(entry).includes(keyValue)){
            entry[keyValue] = '';
          }
        })
      })
    })

    let typeSuccess = 1; // 1 success , 2 warning

    let shipperName = null;
    let shipperIdName = null;
    let typeOfContract = null;
    let contractCode = null;

    Object.values(resultTranform?.shipperInfo).forEach((info: any) => {
      if (info['Shipper Name']) {
        shipperName = info['Shipper Name'];
        info['Shipper ID Name'] = newShipperIdName
      }
      if (info['Shipper ID Name']) {
        shipperIdName = info['Shipper ID Name'];
      }
      if (info['Type of Contract']) {
        typeOfContract = info['Type of Contract'];
      }
      if (info['Contract Code']) {
        contractCode = info['Contract Code'] || '';
      }
    });

    if (!!!typeOfContract) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Type of Contract cannot be blank.', // https://app.clickup.com/t/86ev67ym1
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const typeOfContractText = this.capacityMiddleService.typeOfContractTextToNum(typeOfContract);

    const getGroupByName = shipperIdName ?
      await this.capacityMiddleService.getGroupByIDName(shipperIdName)
      :
      await this.capacityMiddleService.getGroupByName(shipperName);

    if (!!!getGroupByName) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Shipper Info does not match the value.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const contractPointSp = getGroupByName?.shipper_contract_point.map(
      (cp: any) => {
        return {
          contract_point: cp?.contract_point?.contract_point,
          entry_exit_id: cp?.contract_point?.entry_exit_id,
        };
      },
    );

    if (!!!typeOfContractText) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Type Term Name is NOT match',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!!!contractCode) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code not found. Please verify and try again.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    else {
      const contractCodeSplit = contractCode.split('-')
      if (contractCodeSplit.length == 3) {
        const year = contractCodeSplit[0]
        // const term = contractCodeSplit[1]
        const code = contractCodeSplit[2]
        const existContractCodeByYear = await this.prisma.contract_code.findMany({
          where: {
            contract_code: {
              contains: year,
            },
          },
        })
        if (existContractCodeByYear.length > 0) {
          const isExistContractCode = existContractCodeByYear.some(contractCodeItem => {
            const contractCodeItemSplit = contractCodeItem.contract_code.split('-')
            if (contractCodeItemSplit.length == 3) {
              const contractCodeItemCode = contractCodeItemSplit[2]
              return contractCodeItemCode == code && contractCodeItem.contract_code != contractCode
            }
          })
          if (isExistContractCode) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Contract Code ${code} already exists in ${year}.`,
              },
              HttpStatus.BAD_REQUEST,
            );
          }
        }
      }
    }

    const ckUserTypeGroup = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId),
          },
        },
      },
      include: {
        user_type: true,
      },
    });

    if (ckUserTypeGroup?.user_type_id === 3) {
      if (shipperIdName ? ckUserTypeGroup?.id_name !== shipperIdName : ckUserTypeGroup?.name !== shipperName) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Contract code does not match the shipper.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (entryValue.length === 0 && exitValue.length === 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'The Capacity Booking must be defined',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    else{
      const isEntryHaveValue = entryValue.some((entry: any) => {
        return Object.entries(entry).some(([key, value]) => {
          if(Number(key) > Number(keyEntryTo)){
            return !!value;
          }
          else{
            return false;
          }
        })
      })
      const isExitHaveValue = exitValue.some((exit: any) => {
        return Object.entries(exit).some(([key, value]) => {
          if(Number(key) > Number(keyExitTo)){
            return !!value;
          }
          else{
            return false;
          }
        })
      })
      if(!isEntryHaveValue && !isExitHaveValue){
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'The Capacity Booking must be defined',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const requiredEntry = [
      "Capacity Daily Booking (MMBTU/d)",
      "Capacity Daily Booking (MMscfd)",
      "Maximum Hour Booking (MMBTU/h)",
      "Maximum Hour Booking (MMscfh)",
      "Entry",
      "Period",
    ];

    const requiredExit = [
      "Capacity Daily Booking (MMBTU/d)",
      "Maximum Hour Booking (MMBTU/h)",
      "Exit",
      "Period",
    ];

    const missingEntry = requiredEntry.filter(k => !headerEntry?.[k]);
    const missingExit = requiredExit.filter(k => !headerExit?.[k]);
    const missing = [...missingEntry.map(k => `Entry.${k}`), ...missingExit.map(k => `Exit.${k}`)];

    if (missing.length > 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Template Is Not Match. [${missing.join(', ')}]`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const todayStart = getTodayStartAdd7().toDate();
    const todayEnd = getTodayEndAdd7().toDate();

    const bookingTemplate = await this.prisma.booking_template.findFirst({
      where: {
        term_type_id: Number(typeOfContractText),
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

    const checkValueSum = {
      entry: {
        'Capacity Daily Booking (MMBTU/d)': [],
        'Maximum Hour Booking (MMBTU/h)': [],
        'Capacity Daily Booking (MMscfd)': [],
        'Maximum Hour Booking (MMscfh)': [],
      },
      exit: {
        'Capacity Daily Booking (MMBTU/d)': [],
        'Maximum Hour Booking (MMBTU/h)': [],
      },
    };

    const entryCompareNotMatch = [];
    const exitCompareNotMatch = [];

    const compareEntryExit = {
      'Capacity Daily Booking (MMBTU/d)': [],
      'Maximum Hour Booking (MMBTU/h)': [],
    };

    for (const key in checkValueSum.entry) {
      if (headerEntry[key]) {
        Object.keys(headerEntry[key]).forEach((date) => {
          if (date !== 'key') {
            const entryKey = headerEntry[key][date]?.key;
            let sum = 0;
            entryValue.forEach((entry) => {
              if (entry[entryKey] !== undefined) {
                if (this.isMoreThan3Decimals(parseToNumber(entry[entryKey] ?? 0))) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: `${entry[0]} | ${key} | ${date} | The value must contain 3 decimal places.`,
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                }
                sum = parseToNumber3Decimal(sum + (Math.floor(parseToNumber(entry[entryKey] ?? 0) * 1000) / 1000));
              }
            });
            checkValueSum.entry[key].push({
              key: entryKey,
              sum,
              headerKey: date,
            });
          }
        });
      }
    }

    for (const key in checkValueSum.exit) {
      if (headerExit[key]) {
        Object.keys(headerExit[key]).forEach((date) => {
          if (date !== 'key') {
            const exitKey = headerExit[key][date]?.key;
            let sum = 0;

            exitValue.forEach((exit) => {
              if (exit[exitKey] !== undefined) {

                if (this.isMoreThan3Decimals(parseToNumber(exit[exitKey] ?? 0))) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: `${exit[0]} | ${key} | ${date} | The value must contain 3 decimal places.`,
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                }
                sum = parseToNumber3Decimal(sum + (Math.floor(parseToNumber(exit[exitKey] ?? 0) * 1000) / 1000));
              }
            });
            checkValueSum.exit[key].push({
              key: exitKey,
              sum,
              headerKey: date,
            });
          }
        });
      }
    }

    for (const key in checkValueSum.entry) {
      // if (!isMatch(key, 'Capacity Daily Booking (MMBTU/d)')) {
      if (key.includes('Hour')) {
        continue;
      }
      checkValueSum.entry[key].forEach((entryItem) => {
        let { key: entryKey, sum: calculatedSum, headerKey } = entryItem;
        const expectedSum = Number(sumEntries[entryKey]?.replace(/,/g, '')) || 0;

        if (String(calculatedSum) !== String(expectedSum)) {
          if (String(calculatedSum.toFixed(3)) !== String(expectedSum)) {
            const diff = Math.abs(calculatedSum - expectedSum);
            if (diff > 0.001 + Number.EPSILON) {
              entryCompareNotMatch.push({
                headerKey, // This will be the date, such as "01/11/2024"
                key: entryKey,
                description: key,
                calculatedSum: calculatedSum,
                expectedSum,
                status: 'Mismatch',
              });
            }
          }
        }
      });
    }

    for (const key in checkValueSum.exit) {
      // if (!isMatch(key, 'Capacity Daily Booking (MMBTU/d)')) {
      if (key.includes('Hour')) {
        continue;
      }
      checkValueSum.exit[key].forEach((exitItem) => {
        let { key: exitKey, sum: calculatedSum, headerKey } = exitItem;
        const expectedSum = Number(sumExits[exitKey]?.replace(/,/g, '')) || 0;

        if (String(calculatedSum) !== String(expectedSum)) {
          if (String(calculatedSum.toFixed(3)) !== String(expectedSum)) {
            const diff = Math.abs(calculatedSum - expectedSum);
            if (diff > 0.001 + Number.EPSILON) {
              exitCompareNotMatch.push({
                headerKey, // This will be the date, such as "01/11/2024"
                key: exitKey,
                description: key,
                calculatedSum: calculatedSum,
                expectedSum,
                status: 'Mismatch',
              });
            }
          }
        }
      });
    }

    for (const key of [
      'Capacity Daily Booking (MMBTU/d)',
      // 'Maximum Hour Booking (MMBTU/h)',
    ]) {
      checkValueSum.entry[key].forEach((entryItem) => {
        const { key: entryKey, sum: entrySum, headerKey } = entryItem;
        const exitItem = checkValueSum.exit[key].find(
          (exit) => exit.key === entryKey,
        );

        if (exitItem) {
          const exitSum = exitItem.sum;
          if (entrySum !== exitSum) {
            compareEntryExit[key].push({
              description: key,
              headerKey, // This will be the date, such as "01/11/2024"
              key: entryKey,
              entrySum,
              exitSum,
              status: 'Mismatch',
            });
          }
        } else {
          compareEntryExit[key].push({
            description: key,
            headerKey,
            key: entryKey,
            entrySum,
            exitSum: null, // Indicate no matching exit sum found
            status: 'Mismatch (No Matching Exit)',
          });
        }
      });
    }

    for (const key of ['Maximum Hour Booking (MMBTU/h)']) {
      checkValueSum.entry[key].forEach((entryItem) => {
        const { key: entryKey, headerKey } = entryItem;
        const entrySum = sumEntries[entryKey]
        const exitSum = sumExits[entryKey]

        if ((entrySum || entrySum == 0)) {
          if ((exitSum || exitSum == 0)) {
            if (entrySum !== exitSum) {
              compareEntryExit[key].push({
                description: key,
                headerKey, // This will be the date, such as "01/11/2024"
                key: entryKey,
                entrySum,
                exitSum,
                status: 'Mismatch',
              });
            }
          } else {
            compareEntryExit[key].push({
              description: key,
              headerKey,
              key: entryKey,
              entrySum,
              exitSum, // Indicate no matching exit sum found
              status: 'Mismatch (No Matching Exit)',
            });
          }
        }
      });
    }

    const keyEntryPoint = 0;
    const keyExitPoint = 0;
    const warningData = [];
    let notApproved = false;
    const newData = getTodayNowAdd7().format('YYYY/MM/DD HH:mm');

    let dEntryA: any = null;
    let dExitA: any = null;

    const dateStartAll: any = [];
    const dateEndAll: any = [];

    const modeDayAndMonth = bookingTemplate?.term_type_id === 4 ? 1 : 2;

    let resultContractCode: any;
    if (contractCode.includes('_Amd')) {
      const match = contractCode.match(/(.*)(_Amd.*)/);
      resultContractCode = [match[1], match[2]];
    } else {
      resultContractCode = [contractCode];
    }
    let contract_code = resultContractCode[0];

    const checkContractCode = await this.prisma.contract_code.findFirst({
      select: {
        id: true,
        contract_code: true,
        status_capacity_request_management: true,
        file_period_mode: true,
        fixdayday: true,
        todayday: true,
        group: {
          select: {
            name: true,
            id_name: true,
          },
        },
        term_type_id: true,
      },
      where: {
        contract_code: contract_code,
      },
    });
    if (checkContractCode) {
      if (checkContractCode?.term_type_id !== typeOfContractText) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error:
              'The Contract Code has been applied across different Contract types',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    function parseNumericStrict(v: unknown, ctx: { capacityKey: string; dateKey: string; ePointName: string; stamp: string }) {
      // รับ number ตรง ๆ
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Invalid number (NaN/Infinity) for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }
        return v;
      }

      if (typeof v === 'string') {
        const s = v.trim();

        const cleaned = s.replace(/,/g, '');
        if (!/^[-+]?\d*(\.\d+)?$/.test(cleaned)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Non-numeric value "${v}" for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }

        const n = Number(cleaned);
        if (!Number.isFinite(n)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Invalid number "${v}" for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }
        return n;
      }

      // ชนิดอื่น ๆ ไม่รับ
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        error: `Unsupported type for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
      }, HttpStatus.BAD_REQUEST);
    }

    const contractPointsMaster = await this.prisma.contract_point.findMany({
      where: {
        // contract_point: e['0'],
        // entry_exit_id: 1,
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
        area: true,
        zone: true,
      },
    });

    const newEntry = await Promise.all(
      entryValue.map(async (e: any, i: any) => {
        const entryPointName = e[keyEntryPoint];
        let newStartDayPlus = dayjs(todayStart);
        let useStart = dayjs(e[keyEntryFrom], 'DD/MM/YYYY');
        let useEnd = dayjs(e[keyEntryTo], 'DD/MM/YYYY');

        try {
          if (!useStart.isValid()) {
            // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
            const excelSerialDate = parseToNumber(e[keyEntryFrom])
            if (excelSerialDate) {
              // It's an Excel serial date
              const jsDate = excelSerialToDate(excelSerialDate);
              useStart = dayjs(jsDate);
              e[keyEntryFrom] = dayjs(jsDate).format('DD/MM/YYYY');
            }
          }
          if (!useEnd.isValid()) {
            // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
            const excelSerialDate = parseToNumber(e[keyEntryTo])
            if (excelSerialDate) {
              // It's an Excel serial date
              const jsDate = excelSerialToDate(excelSerialDate);
              useEnd = dayjs(jsDate);
              e[keyEntryTo] = dayjs(jsDate).format('DD/MM/YYYY');
            }
          }
        } catch (error) {
        }

        if (!useStart.isValid() || !useEnd.isValid()) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Missing Period From or Period To value.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        let isCheckMoreDate = useStart.isAfter(newStartDayPlus);
        let checkMinMax = false;
        if(process.env.NODE_ENV !== 'development'){

          if (!isCheckMoreDate) { // kom ปิดเพื่อเทส upload
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error:
                  'Period From date in the template must be later than today.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
  
          if (useStart.isSameOrAfter(useEnd)) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: "The 'Period To' date must not be earlier than the 'Period From' date.",
              },
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        checkMinMax = this.capacityMiddleService.checkDateRange(
          e[keyEntryFrom],
          e[keyEntryTo],
          // modeDayAndMonth,
          bookingTemplate?.file_period_mode,
          bookingTemplate?.min,
          bookingTemplate?.max,
        );

        if (!checkMinMax) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Date is NOT match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        const headerEntryDate = resultTranform?.['headerEntry'];
        const keysGreaterThanEntryTo = Object.keys(e).filter(
          (key) => Number(key) > Number(keyEntryTo),
        );


        for (let is = 0; is < keysGreaterThanEntryTo.length; is++) {
          if (headerEntryDate) {
            Object.keys(headerEntryDate).forEach((capacityKey) => {
              const capacityDates = headerEntryDate[capacityKey];
              Object.keys(capacityDates).forEach((dateKeyString) => {
                let dateKey = dateKeyString;
                if (!dayjs(dateKeyString, 'DD/MM/YYYY').isValid()) {
                  try {
                    // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
                    const excelSerialDate = parseToNumber(dateKeyString)
                    if (excelSerialDate) {
                      // It's an Excel serial date
                      const jsDate = excelSerialToDate(excelSerialDate);
                      dateKey = dayjs(jsDate).format('DD/MM/YYYY');
                      const tempData = headerEntryDate[capacityKey][dateKeyString]
                      delete resultTranform?.['headerEntry'][capacityKey][dateKeyString]
                      delete headerEntryDate[capacityKey][dateKeyString]
                      resultTranform['headerEntry'][capacityKey][dateKey] = tempData
                      headerEntryDate[capacityKey][dateKey] = tempData
                    }
                  } catch (error) {
                  }
                }

                const keyValue = capacityDates[dateKey]?.['key'];
                if (keysGreaterThanEntryTo[is] === keyValue) {
                  dateStartAll.push(e[keyEntryFrom]);
                  dateEndAll.push(e[keyEntryTo]);

                  const isInRangeZero = dayjs(dateKey, 'DD/MM/YYYY').isBetween(
                    dayjs(e[keyEntryFrom], 'DD/MM/YYYY'),
                    dayjs(e[keyEntryTo], 'DD/MM/YYYY'),
                    'month',
                    '[]',
                  );

                  if (
                    modeDayAndMonth === 2 &&
                    dayjs(dateKey, 'DD/MM/YYYY').format('DD') !== '01'
                  ) {
                    throw new HttpException(
                      {
                        status: HttpStatus.BAD_REQUEST,
                        error: 'Date is NOT match',
                      },
                      HttpStatus.BAD_REQUEST,
                    );
                  }

                  if (!isInRangeZero || e[keyValue] < 0) {
                    throw new HttpException(
                      {
                        status: HttpStatus.BAD_REQUEST,
                        error: 'Date is NOT match.',
                      },
                      HttpStatus.BAD_REQUEST,
                    );
                  }
                  
                  const s = String(e[keyValue]).trim();
                  if (s === '') {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${entryPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  const checkNoNum = parseNumericStrict(e[keyValue], {
                    capacityKey,
                    dateKey,
                    ePointName: entryPointName,
                    stamp: dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm'),
                  });


                  if (Number(e[keyValue]) === 0) {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${entryPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  if (!dEntryA) {
                    dEntryA = {};
                  }

                  if (!dEntryA[i]) {
                    dEntryA[i] = {
                      start: e[keyEntryFrom],
                      end: e[keyEntryTo],
                      date: { [capacityKey]: [] },
                    };
                  }

                  dEntryA = {
                    ...dEntryA,
                    [i]: {
                      start: e[keyEntryFrom],
                      end: e[keyEntryTo],
                      date: {
                        ...dEntryA[i]['date'],
                        [capacityKey]: [
                          ...(dEntryA[i]['date'][capacityKey] || []),
                          dateKey,
                        ],
                      },
                    },
                  };
                }
              });
            });
          }
        }

        const getContractPointByName =
          await this.capacityMiddleService.getContractPointByName(
            entryPointName,
            getGroupByName?.id || null,
          );

        if (!!!getContractPointByName) {
          notApproved = true;
          warningData.push(
            `Entry Point: ${entryPointName} not match system ${newData}`,
          );
        } else {
          const findCPS = contractPointSp.find((fCPS: any) => {
            return fCPS?.contract_point === entryPointName;
          });
          if (findCPS?.entry_exit_id === 2) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Contract Point is NOT match.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
          if (!!!findCPS) {
            typeSuccess = 2;
            notApproved = true;
            warningData.push(
              `Entry Point: ${entryPointName} not match system ${newData}`,
            );
          }
        }

        const contractPoints = contractPointsMaster?.find((f: any) => {
          return (
            f?.contract_point === e['0'] &&
            f?.entry_exit_id === 1
          )
        }) || null

        if (!entryPointName) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error:
                'Contract Point cannot be blank.', // https://app.clickup.com/t/86ev67nfc
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        return {
          data: e,
          contract_point: e['0'],
          area: contractPoints?.area?.name || null,
          zone: contractPoints?.zone?.name || null,
          contractPointName: entryPointName || null,
        };
      }),
    );

    const newExit = await Promise.all(
      exitValue.map(async (e: any, i: any) => {
        const exitPointName = e[keyExitPoint];
        let newStartDayPlus = dayjs(todayStart);
        let useStart = dayjs(e[keyExitFrom], 'DD/MM/YYYY');
        let useEnd = dayjs(e[keyExitTo], 'DD/MM/YYYY');

        try {
          if (!useStart.isValid()) {
            // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
            const excelSerialDate = parseToNumber(e[keyEntryFrom])
            if (excelSerialDate) {
              // It's an Excel serial date
              const jsDate = excelSerialToDate(excelSerialDate);
              useStart = dayjs(jsDate);
              e[keyEntryFrom] = dayjs(jsDate).format('DD/MM/YYYY');
            }
          }
          if (!useEnd.isValid()) {
            // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
            const excelSerialDate = parseToNumber(e[keyEntryTo])
            if (excelSerialDate) {
              // It's an Excel serial date
              const jsDate = excelSerialToDate(excelSerialDate);
              useEnd = dayjs(jsDate);
              e[keyEntryTo] = dayjs(jsDate).format('DD/MM/YYYY');
            }
          }
        } catch (error) {
        }

        if (!useStart.isValid() || !useEnd.isValid()) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Missing Period From or Period To value.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        let isCheckMoreDate = useStart.isAfter(newStartDayPlus);
        let checkMinMax = false;
        if(process.env.NODE_ENV !== 'development'){

          if (!isCheckMoreDate) {  // kom ปิดเพื่อเทส upload
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error:
                  'Period From date in the template must be later than today.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
  
          if (useStart.isSameOrAfter(useEnd)) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: "The 'Period To' date must not be earlier than the 'Period From' date.",
              },
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        checkMinMax = this.capacityMiddleService.checkDateRange(
          useStart.format('DD/MM/YYYY'), //e[keyExitFrom],
          e[keyExitTo],
          // modeDayAndMonth,
          bookingTemplate?.file_period_mode,
          bookingTemplate?.min,
          bookingTemplate?.max,
        );
        if (!checkMinMax) {

          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Date is NOT match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        const headerExitDate = resultTranform?.['headerExit'];
        const keysGreaterThanExitTo = Object.keys(e).filter(
          (key) => Number(key) > Number(keyExitTo),
        );
        for (let is = 0; is < keysGreaterThanExitTo.length; is++) {
          if (headerExitDate) {
            Object.keys(headerExitDate).forEach((capacityKey) => {
              const capacityDates = headerExitDate[capacityKey];
              Object.keys(capacityDates).forEach((dateKeyString) => {
                let dateKey = dateKeyString;
                if (!dayjs(dateKeyString, 'DD/MM/YYYY').isValid()) {
                  try {
                    // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
                    const excelSerialDate = parseToNumber(dateKeyString)
                    if (excelSerialDate) {
                      // It's an Excel serial date
                      const jsDate = excelSerialToDate(excelSerialDate);
                      dateKey = dayjs(jsDate).format('DD/MM/YYYY');
                      const tempData = headerExitDate[capacityKey][dateKeyString]
                      delete resultTranform?.['headerExit'][capacityKey][dateKeyString]
                      delete headerExitDate[capacityKey][dateKeyString]
                      resultTranform['headerExit'][capacityKey][dateKey] = tempData
                      headerExitDate[capacityKey][dateKey] = tempData
                    }
                  } catch (error) {
                  }
                }

                const keyValue = capacityDates[dateKey]?.['key'];
                if (keysGreaterThanExitTo[is] === keyValue) {
                  dateStartAll.push(e[keyEntryFrom]);
                  dateEndAll.push(e[keyEntryTo]);

                  const isInRangeZero = dayjs(dateKey, 'DD/MM/YYYY').isBetween(
                    dayjs(e[keyEntryFrom], 'DD/MM/YYYY'),
                    dayjs(e[keyEntryTo], 'DD/MM/YYYY'),
                    'month',
                    '[]',
                  );

                  if (
                    modeDayAndMonth === 2 &&
                    dayjs(dateKey, 'DD/MM/YYYY').format('DD') !== '01'
                  ) {
                    throw new HttpException(
                      {
                        status: HttpStatus.BAD_REQUEST,
                        error: 'Date is NOT match',
                      },
                      HttpStatus.BAD_REQUEST,
                    );
                  }

                  const s = String(e[keyValue]).trim();
                  if (s === '') {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${exitPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  const checkNoNum = parseNumericStrict(e[keyValue], {
                    capacityKey,
                    dateKey,
                    ePointName: exitPointName,
                    stamp: dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm'),
                  });

                  if (Number(e[keyValue]) === 0) {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${exitPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  if (!dExitA) {
                    dExitA = {};
                  }

                  if (!dExitA[i]) {
                    dExitA[i] = {
                      start: e[keyExitFrom],
                      end: e[keyExitTo],
                      date: { [capacityKey]: [] },
                    };
                  }

                  dExitA = {
                    ...dExitA,
                    [i]: {
                      start: e[keyExitFrom],
                      end: e[keyExitTo],
                      date: {
                        ...dExitA[i]['date'],
                        [capacityKey]: [
                          ...(dExitA[i]['date'][capacityKey] || []),
                          dateKey,
                        ],
                      },
                    },
                  };
                }
              });
            });
          }
        }

        const getContractPointByName =
          await this.capacityMiddleService.getContractPointByName(
            exitPointName,
            getGroupByName?.id || null,
          );
        if (!!!getContractPointByName) {
          notApproved = true;
          warningData.push(
            `Exit Point: ${exitPointName} not match system ${newData}`,
          );
        } else {
          const findCPS = contractPointSp.find((fCPS: any) => {
            return fCPS?.contract_point === exitPointName;
          });
          if (findCPS?.entry_exit_id === 1) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Contract Point is NOT match.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
          if (!!!findCPS) {
            typeSuccess = 2;
            notApproved = true;
            warningData.push(
              `Exit Point: ${exitPointName} not match system ${newData}`,
            );
          }
        }

        const contractPoints = contractPointsMaster?.find((f: any) => {
          return (
            f?.contract_point === e['0'] &&
            f?.entry_exit_id === 2
          )
        }) || null

        if (!exitPointName) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error:
                'Contract Point cannot be blank.', // https://app.clickup.com/t/86ev67nfc
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        return {
          data: e,
          contract_point: e['0'],
          area: contractPoints?.area?.name || null,
          zone: contractPoints?.zone?.name || null,
          contractPointName: exitPointName || null,
        };
      }),
    );

    const minDate = dateStartAll.reduce((min, current) => {
      return dayjs(current, 'DD/MM/YYYY').isBefore(dayjs(min, 'DD/MM/YYYY'))
        ? current
        : min;
    }, dateStartAll[0]);
    const maxDate = dateEndAll.reduce((max, current) => {
      return dayjs(current, 'DD/MM/YYYY').isAfter(dayjs(max, 'DD/MM/YYYY'))
        ? current
        : max;
    }, dateEndAll[0]);

    if (checkContractCode) {
      if (shipperIdName ? shipperIdName !== checkContractCode?.group?.id_name : shipperName !== checkContractCode?.group?.name) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Shipper Name Is NOT MATCH',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (typeOfContractText !== checkContractCode?.term_type_id) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Term Type ไม่เหมือนของเดิม',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const dEntryArray = Object.values(dEntryA);
      for (let i = 0; i < dEntryArray.length; i++) {
        const calcCheckEntry =
          await this.capacityMiddleService.validateDateEntries(
            dEntryArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );

        const objCalcEntry =
          this.capacityMiddleService.extractValidationResults(
            calcCheckEntry?.date,
          );
        const findCalcEntry = objCalcEntry.filter((f: any) => {
          return f === false;
        });

        if (findCalcEntry.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Period Capacity Right is NOT Match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      const dExitArray = Object.values(dExitA);
      for (let i = 0; i < dExitArray.length; i++) {
        const calcCheckExit =
          await this.capacityMiddleService.validateDateEntries(
            dExitArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcExit = this.capacityMiddleService.extractValidationResults(
          calcCheckExit?.date,
        );
        const findCalcExit = objCalcExit.filter((f: any) => {
          return f === false;
        });
        if (findCalcExit.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'format date Exit มีวันที่/จำนวนไม่ถูกต้อง',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    } else {
      if (!!!dEntryA || !!!dExitA) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'The Capacity Booking must be defined.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const dEntryArray = Object.values(dEntryA);
      for (let i = 0; i < dEntryArray.length; i++) {
        const calcCheckEntry =
          await this.capacityMiddleService.validateDateEntries(
            dEntryArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcEntry =
          this.capacityMiddleService.extractValidationResults(
            calcCheckEntry?.date,
          );
        const findCalcEntry = objCalcEntry.filter((f: any) => {
          return f === false;
        });

        if (findCalcEntry.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Period Capacity Right is NOT Match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      const dExitArray = Object.values(dExitA);
      for (let i = 0; i < dExitArray.length; i++) {
        const calcCheckExit =
          await this.capacityMiddleService.validateDateEntries(
            dExitArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcExit = this.capacityMiddleService.extractValidationResults(
          calcCheckExit?.date,
        );
        const findCalcExit = objCalcExit.filter((f: any) => {
          return f === false;
        });
        if (findCalcExit.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'format date Exit มีวันที่/จำนวนไม่ถูกต้อง',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }

    if (entryCompareNotMatch.length > 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Entry & Total Exit is NOT match.',
          data: entryCompareNotMatch,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (exitCompareNotMatch.length > 0) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Entry & Total Exit is NOT match.',
          data: exitCompareNotMatch,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      compareEntryExit['Capacity Daily Booking (MMBTU/d)'].length > 0 ||
      compareEntryExit['Maximum Hour Booking (MMBTU/h)'].length > 0
    ) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Entry & Total Exit is NOT match.',
          data: compareEntryExit,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const checkContractCodeCheckLast = !!checkContractCode?.id
      ? await this.prisma.contract_code.findFirst({
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
          contract_code: true
        },
        where: {
          ref_contract_code_by_main_id: checkContractCode?.id,
        },
        orderBy: {
          id: 'desc',
        },
      })
      : null;

    if (
      checkContractCodeCheckLast?.status_capacity_request_management_process_id ===
      4 ||
      checkContractCodeCheckLast?.status_capacity_request_management_id === 5
    ) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code End | Terminate',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let versionFlag = false;
    let amdFlag = false;
    let newCreate = false;

    const nowDate = getTodayNowAdd7().toDate();

    const hasContractStarted =
      dayjs(nowDate).isAfter(
        dayjs(checkContractCodeCheckLast?.contract_start_date),
      ) ||
      dayjs(nowDate).isSame(
        dayjs(checkContractCodeCheckLast?.contract_start_date),
      );
    let amdVersion: any = null;
    if (
      hasContractStarted &&
      checkContractCodeCheckLast?.status_capacity_request_management_id === 2
    ) {
      // ขึ้น _Amd01++
      const checkContractCodeCheckLength =
        await this.prisma.contract_code.count({
          where: {
            ref_contract_code_by_main_id: checkContractCode?.id,
          },
        });
      amdVersion =
        '_Amd' +
        String(
          checkContractCodeCheckLength > 9
            ? checkContractCodeCheckLength
            : '0' + checkContractCodeCheckLength,
        );
      contract_code = contract_code + amdVersion;
      amdFlag = true;
    } else if (
      !hasContractStarted &&
      checkContractCodeCheckLast?.status_capacity_request_management_id === 2
    ) {
      versionFlag = true;
    } else {
      if (checkContractCodeCheckLast) {
        versionFlag = true;
      } else {
        newCreate = true;
      }
    }

    const shipperId = await this.prisma.group.findFirst({
      select: {
        id: true,
        user_type_id: true,
      },
      where: {
        name: shipperName,
      },
    });
    const ckUserType = await this.prisma.user_type.findFirst({
      where: {
        group: {
          some: {
            account_manage: {
              some: {
                account_id: Number(userId),
              },
            },
          },
        },
      },
    });

    let idTemp = null;
    let tyTmp = null;

    const ckAreaDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.area);
    const hasDuplicate = new Set(ckAreaDup).size !== ckAreaDup.length;

    const ckPointDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.contract_point);
    const hasDuplicatePoint = new Set(ckPointDup).size !== ckPointDup.length;

    if (hasDuplicatePoint) {
      let ctPoint = []
      for (let i_ = 0; i_ < ckPointDup.length; i_++) {
        const contractPoint = await this.prisma.contract_point.findFirst({
          where:{
            contract_point: ckPointDup?.[i_]
          },
          select:{ contract_point:true },
        })
        if(!contractPoint){
          ctPoint.push(ckPointDup?.[i_])
        }
      }
      if(ctPoint?.length > 0){
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `${ctPoint?.join(", ")} is not exit in TPA System`, // https://app.clickup.com/t/9018502823/86ey937n6
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Duplicate Contract Point found.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (hasDuplicate) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Only one Contract Point is allowed per Area.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (newCreate) {
      return {
        message: `Create`
      }
    } else {
      if (versionFlag) {
        if (checkContractCodeCheckLast?.status_capacity_request_management_process_id === 1) {

          return {
            message: `Amd`,
            contractCode: contract_code
          }
        } else {

          return {
            message: `Version`,
            contractCode: checkContractCodeCheckLast?.contract_code
            // contractCode: contract_code
          }
        }
      } else if (amdFlag) {
        // แสดงชื่อสัญญาเดิม
        return {
          message: `Amd`,
          contractCode: checkContractCodeCheckLast?.contract_code || contract_code
          // contractCode: contract_code
        }
      } else {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'error เงื่อนไข',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

  }

  async pathDetailCapacityRequestManagementTranformNewVersion(
    data: any,
    userId: any,
    file: any,
    token: any,
    newShipperIdName?: string
  ) {

    const resultTranform = (await JSON.parse(data?.json_data)) || null;
    const headerEntry = resultTranform?.headerEntry || {};
    const entryValue = resultTranform?.entryValue || [];
    const headerExit = resultTranform?.headerExit || {};
    const exitValue = resultTranform?.exitValue || [];
    const sumEntries = resultTranform?.sumEntries || {};
    const sumExits = resultTranform?.sumExits || {};

    const keyEntryFrom = resultTranform?.['headerEntry']?.['Period']?.['From']?.['key'];
    const keyEntryTo = resultTranform?.['headerEntry']?.['Period']?.['To']?.['key'];
    const keyExitFrom = resultTranform?.['headerExit']?.['Period']?.['From']?.['key'];
    const keyExitTo = resultTranform?.['headerExit']?.['Period']?.['To']?.['key'];

    // add missing value by key
    Object.values(headerEntry).forEach((capacityDates: any) => {
      Object.keys(capacityDates).forEach((dateKeyString: any) => {
        const keyValue = capacityDates[dateKeyString]?.['key'];
        entryValue.forEach((entry: any) => {
          if (!Object.keys(entry).includes(keyValue)){
            entry[keyValue] = '';
          }
        })
      })
    })

    Object.values(headerExit).forEach((capacityDates: any) => {
      Object.keys(capacityDates).forEach((dateKeyString: any) => {
        const keyValue = capacityDates[dateKeyString]?.['key'];
        exitValue.forEach((entry: any) => {
          if (!Object.keys(entry).includes(keyValue)){
            entry[keyValue] = '';
          }
        })
      })
    })

    let typeSuccess = 1; // 1 success , 2 warning

    let shipperName = null;
    let shipperIdName = null;
    let typeOfContract = null;
    let contractCode = null;

    Object.values(resultTranform?.shipperInfo).forEach((info: any) => {
      if (info['Shipper Name']) {
        shipperName = info['Shipper Name'];
        info['Shipper ID Name'] = newShipperIdName
      }
      if (info['Shipper ID Name']) {
        shipperIdName = info['Shipper ID Name'];
      }
      if (info['Type of Contract']) {
        typeOfContract = info['Type of Contract'];
      }
      if (info['Contract Code']) {
        contractCode = info['Contract Code'] || '';
      }
    });

    if (!!!typeOfContract) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Type of Contract cannot be blank.', // https://app.clickup.com/t/86ev67ym1
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const typeOfContractText = this.capacityMiddleService.typeOfContractTextToNum(typeOfContract);

    const getGroupByName = shipperIdName ? await this.capacityMiddleService.getGroupByIDName(shipperIdName) : await this.capacityMiddleService.getGroupByName(shipperName);

    if (!!!getGroupByName) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Shipper Info does not match the value.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const contractPointSp = getGroupByName?.shipper_contract_point.map(
      (cp: any) => {
        return {
          contract_point: cp?.contract_point?.contract_point,
          entry_exit_id: cp?.contract_point?.entry_exit_id,
        };
      },
    );

    if (!!!typeOfContractText) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Type Term Name is NOT match',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!!!contractCode) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code not found. Please verify and try again.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const ckUserTypeGroup = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId),
          },
        },
      },
      include: {
        user_type: true,
      },
    });

    if (ckUserTypeGroup?.user_type_id === 3) {
      if (shipperIdName ? ckUserTypeGroup?.id_name !== shipperIdName : ckUserTypeGroup?.name !== shipperName) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Contract code does not match the shipper.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (entryValue.length === 0 && exitValue.length === 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'The Capacity Booking must be defined',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    else{
      const isEntryHaveValue = entryValue.some((entry: any) => {
        return Object.entries(entry).some(([key, value]) => {
          if(Number(key) > Number(keyEntryTo)){
            return !!value;
          }
          else{
            return false;
          }
        })
      })
      const isExitHaveValue = exitValue.some((exit: any) => {
        return Object.entries(exit).some(([key, value]) => {
          if(Number(key) > Number(keyExitTo)){
            return !!value;
          }
          else{
            return false;
          }
        })
      })
      if(!isEntryHaveValue && !isExitHaveValue){
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'The Capacity Booking must be defined',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const requiredEntry = [
      "Capacity Daily Booking (MMBTU/d)",
      "Capacity Daily Booking (MMscfd)",
      "Maximum Hour Booking (MMBTU/h)",
      "Maximum Hour Booking (MMscfh)",
      "Entry",
      "Period",
    ];

    const requiredExit = [
      "Capacity Daily Booking (MMBTU/d)",
      "Maximum Hour Booking (MMBTU/h)",
      "Exit",
      "Period",
    ];

    const missingEntry = requiredEntry.filter(k => !headerEntry?.[k]);
    const missingExit = requiredExit.filter(k => !headerExit?.[k]);
    const missing = [...missingEntry.map(k => `Entry.${k}`), ...missingExit.map(k => `Exit.${k}`)];

    if (missing.length > 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Template Is Not Match. [${missing.join(', ')}]`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const todayStart = getTodayStartAdd7().toDate();
    const todayEnd = getTodayEndAdd7().toDate();

    const bookingTemplate = await this.prisma.booking_template.findFirst({
      where: {
        term_type_id: Number(typeOfContractText),
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

    const checkValueSum = {
      entry: {
        'Capacity Daily Booking (MMBTU/d)': [],
        'Maximum Hour Booking (MMBTU/h)': [],
        'Capacity Daily Booking (MMscfd)': [],
        'Maximum Hour Booking (MMscfh)': [],
      },
      exit: {
        'Capacity Daily Booking (MMBTU/d)': [],
        'Maximum Hour Booking (MMBTU/h)': [],
      },
    };

    const entryCompareNotMatch = [];
    const exitCompareNotMatch = [];

    const compareEntryExit = {
      'Capacity Daily Booking (MMBTU/d)': [],
      'Maximum Hour Booking (MMBTU/h)': [],
    };

    for (const key in checkValueSum.entry) {
      if (headerEntry[key]) {
        Object.keys(headerEntry[key]).forEach((date) => {
          if (date !== 'key') {
            const entryKey = headerEntry[key][date]?.key;
            let sum = 0;
            entryValue.forEach((entry) => {
              if (entry[entryKey] !== undefined) {
                if (this.isMoreThan3Decimals(parseToNumber(entry[entryKey] ?? 0))) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: `${entry[0]} | ${key} | ${date} | The value must contain 3 decimal places.`,
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                }
                sum = parseToNumber3Decimal(sum + (Math.floor(parseToNumber(entry[entryKey] ?? 0) * 1000) / 1000));
              }
            });
            checkValueSum.entry[key].push({
              key: entryKey,
              sum,
              headerKey: date,
            });
          }
        });
      }
    }

    for (const key in checkValueSum.exit) {
      if (headerExit[key]) {
        Object.keys(headerExit[key]).forEach((date) => {
          if (date !== 'key') {
            const exitKey = headerExit[key][date]?.key;
            let sum = 0;

            exitValue.forEach((exit) => {
              if (exit[exitKey] !== undefined) {

                if (this.isMoreThan3Decimals(parseToNumber(exit[exitKey] ?? 0))) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: `${exit[0]} | ${key} | ${date} | The value must contain 3 decimal places.`,
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                }
                sum = parseToNumber3Decimal(sum + (Math.floor(parseToNumber(exit[exitKey] ?? 0) * 1000) / 1000));
              }
            });
            checkValueSum.exit[key].push({
              key: exitKey,
              sum,
              headerKey: date,
            });
          }
        });
      }
    }

    for (const key in checkValueSum.entry) {
      // if (!isMatch(key, 'Capacity Daily Booking (MMBTU/d)')) {
      if (key.includes('Hour')) {
        continue;
      }
      checkValueSum.entry[key].forEach((entryItem) => {
        let { key: entryKey, sum: calculatedSum, headerKey } = entryItem;
        const expectedSum = Number(sumEntries[entryKey]?.replace(/,/g, '')) || 0;

        if (String(calculatedSum) !== String(expectedSum)) {
          if (String(calculatedSum.toFixed(3)) !== String(expectedSum)) {
            const diff = Math.abs(calculatedSum - expectedSum);
            if (diff > 0.001 + Number.EPSILON) {
              entryCompareNotMatch.push({
                headerKey, // This will be the date, such as "01/11/2024"
                key: entryKey,
                description: key,
                calculatedSum: calculatedSum,
                expectedSum,
                status: 'Mismatch',
              });
            }
          }
        }
      });
    }

    for (const key in checkValueSum.exit) {
      // if (!isMatch(key, 'Capacity Daily Booking (MMBTU/d)')) {
      if (key.includes('Hour')) {
        continue;
      }
      checkValueSum.exit[key].forEach((exitItem) => {
        let { key: exitKey, sum: calculatedSum, headerKey } = exitItem;
        const expectedSum = Number(sumExits[exitKey]?.replace(/,/g, '')) || 0;

        if (String(calculatedSum) !== String(expectedSum)) {
          if (String(calculatedSum.toFixed(3)) !== String(expectedSum)) {
            const diff = Math.abs(calculatedSum - expectedSum);
            if (diff > 0.001 + Number.EPSILON) {
              exitCompareNotMatch.push({
                headerKey, // This will be the date, such as "01/11/2024"
                key: exitKey,
                description: key,
                calculatedSum: calculatedSum,
                expectedSum,
                status: 'Mismatch',
              });
            }
          }
        }
      });
    }

    for (const key of [
      'Capacity Daily Booking (MMBTU/d)',
      // 'Maximum Hour Booking (MMBTU/h)',
    ]) {
      checkValueSum.entry[key].forEach((entryItem) => {
        const { key: entryKey, sum: entrySum, headerKey } = entryItem;
        const exitItem = checkValueSum.exit[key].find(
          (exit) => exit.key === entryKey,
        );

        if (exitItem) {
          const exitSum = exitItem.sum;
          if (entrySum !== exitSum) {
            compareEntryExit[key].push({
              description: key,
              headerKey, // This will be the date, such as "01/11/2024"
              key: entryKey,
              entrySum,
              exitSum,
              status: 'Mismatch',
            });
          }
        } else {
          compareEntryExit[key].push({
            description: key,
            headerKey,
            key: entryKey,
            entrySum,
            exitSum: null, // Indicate no matching exit sum found
            status: 'Mismatch (No Matching Exit)',
          });
        }
      });
    }

    for (const key of ['Maximum Hour Booking (MMBTU/h)']) {
      checkValueSum.entry[key].forEach((entryItem) => {
        const { key: entryKey, headerKey } = entryItem;
        const entrySum = sumEntries[entryKey]
        const exitSum = sumExits[entryKey]
        if ((entrySum || entrySum == 0)) {
          if ((exitSum || exitSum == 0)) {
            if (entrySum !== exitSum) {
              compareEntryExit[key].push({
                description: key,
                headerKey, // This will be the date, such as "01/11/2024"
                key: entryKey,
                entrySum,
                exitSum,
                status: 'Mismatch',
              });
            }
          } else {
            compareEntryExit[key].push({
              description: key,
              headerKey,
              key: entryKey,
              entrySum,
              exitSum, // Indicate no matching exit sum found
              status: 'Mismatch (No Matching Exit)',
            });
          }
        }
      });
    }

    const keyEntryPoint = 0;
    const keyExitPoint = 0;
    const warningData = [];
    let notApproved = false;
    const newData = getTodayNowAdd7().format('YYYY/MM/DD HH:mm');

    let dEntryA: any = null;
    let dExitA: any = null;

    const dateStartAll: any = [];
    const dateEndAll: any = [];

    const modeDayAndMonth = bookingTemplate?.term_type_id === 4 ? 1 : 2;

    let resultContractCode: any;
    if (contractCode.includes('_Amd')) {
      const match = contractCode.match(/(.*)(_Amd.*)/);
      resultContractCode = [match[1], match[2]];
    } else {
      resultContractCode = [contractCode];
    }
    let contract_code = resultContractCode[0];

    const checkContractCode = await this.prisma.contract_code.findFirst({
      select: {
        id: true,
        contract_code: true,
        status_capacity_request_management: true,
        file_period_mode: true,
        fixdayday: true,
        todayday: true,
        group: {
          select: {
            name: true,
            id_name: true,
          },
        },
        term_type_id: true,
      },
      where: {
        contract_code: contract_code,
      },
    });
    if (checkContractCode) {
      if (checkContractCode?.term_type_id !== typeOfContractText) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error:
              'The Contract Code has been applied across different Contract types',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    function parseNumericStrict(v: unknown, ctx: { capacityKey: string; dateKey: string; ePointName: string; stamp: string }) {
      // รับ number ตรง ๆ
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Invalid number (NaN/Infinity) for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }
        return v;
      }

      if (typeof v === 'string') {
        const s = v.trim();

        const cleaned = s.replace(/,/g, '');
        if (!/^[-+]?\d*(\.\d+)?$/.test(cleaned)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Non-numeric value "${v}" for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }

        const n = Number(cleaned);
        if (!Number.isFinite(n)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Invalid number "${v}" for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }
        return n;
      }

      // ชนิดอื่น ๆ ไม่รับ
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        error: `Unsupported type for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
      }, HttpStatus.BAD_REQUEST);
    }

    const contractPointsMaster = await this.prisma.contract_point.findMany({
      where: {
        // contract_point: e['0'],
        // entry_exit_id: 1,
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
        area: true,
        zone: true,
      },
    });

    const newEntry = await Promise.all(
      entryValue.map(async (e: any, i: any) => {
        const entryPointName = e[keyEntryPoint];
        let newStartDayPlus = dayjs(todayStart);
        let useStart = dayjs(e[keyEntryFrom], 'DD/MM/YYYY');
        let useEnd = dayjs(e[keyEntryTo], 'DD/MM/YYYY');

        try {
          if (!useStart.isValid()) {
            // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
            const excelSerialDate = parseToNumber(e[keyEntryFrom])
            if (excelSerialDate) {
              // It's an Excel serial date
              const jsDate = excelSerialToDate(excelSerialDate);
              useStart = dayjs(jsDate);
              e[keyEntryFrom] = dayjs(jsDate).format('DD/MM/YYYY');
            }
          }
          if (!useEnd.isValid()) {
            // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
            const excelSerialDate = parseToNumber(e[keyEntryTo])
            if (excelSerialDate) {
              // It's an Excel serial date
              const jsDate = excelSerialToDate(excelSerialDate);
              useEnd = dayjs(jsDate);
              e[keyEntryTo] = dayjs(jsDate).format('DD/MM/YYYY');
            }
          }
        } catch (error) {
        }

        if (!useStart.isValid() || !useEnd.isValid()) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Missing Period From or Period To value.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        let isCheckMoreDate = useStart.isAfter(newStartDayPlus);
        let checkMinMax = false;
        if(process.env.NODE_ENV !== 'development'){

          if (!isCheckMoreDate) { // kom ปิดเพื่อเทส upload
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error:
                  'Period From date in the template must be later than today.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
  
          if (useStart.isSameOrAfter(useEnd)) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: "The 'Period To' date must not be earlier than the 'Period From' date.",
              },
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        checkMinMax = this.capacityMiddleService.checkDateRange(
          e[keyEntryFrom],
          e[keyEntryTo],
          // modeDayAndMonth,
          bookingTemplate?.file_period_mode,
          bookingTemplate?.min,
          bookingTemplate?.max,
        );

        if (!checkMinMax) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Date is NOT match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        const headerEntryDate = resultTranform?.['headerEntry'];
        const keysGreaterThanEntryTo = Object.keys(e).filter(
          (key) => Number(key) > Number(keyEntryTo),
        );


        for (let is = 0; is < keysGreaterThanEntryTo.length; is++) {
          if (headerEntryDate) {
            Object.keys(headerEntryDate).forEach((capacityKey) => {
              const capacityDates = headerEntryDate[capacityKey];
              Object.keys(capacityDates).forEach((dateKeyString) => {
                let dateKey = dateKeyString;
                if (!dayjs(dateKeyString, 'DD/MM/YYYY').isValid()) {
                  try {
                    // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
                    const excelSerialDate = parseToNumber(dateKeyString)
                    if (excelSerialDate) {
                      // It's an Excel serial date
                      const jsDate = excelSerialToDate(excelSerialDate);
                      dateKey = dayjs(jsDate).format('DD/MM/YYYY');
                      const tempData = headerEntryDate[capacityKey][dateKeyString]
                      delete resultTranform?.['headerEntry'][capacityKey][dateKeyString]
                      delete headerEntryDate[capacityKey][dateKeyString]
                      resultTranform['headerEntry'][capacityKey][dateKey] = tempData
                      headerEntryDate[capacityKey][dateKey] = tempData
                    }
                  } catch (error) {
                  }
                }

                const keyValue = capacityDates[dateKey]?.['key'];
                if (keysGreaterThanEntryTo[is] === keyValue) {
                  dateStartAll.push(e[keyEntryFrom]);
                  dateEndAll.push(e[keyEntryTo]);

                  const isInRangeZero = dayjs(dateKey, 'DD/MM/YYYY').isBetween(
                    dayjs(e[keyEntryFrom], 'DD/MM/YYYY'),
                    dayjs(e[keyEntryTo], 'DD/MM/YYYY'),
                    'month',
                    '[]',
                  );

                  if (
                    modeDayAndMonth === 2 &&
                    dayjs(dateKey, 'DD/MM/YYYY').format('DD') !== '01'
                  ) {
                    throw new HttpException(
                      {
                        status: HttpStatus.BAD_REQUEST,
                        error: 'Date is NOT match',
                      },
                      HttpStatus.BAD_REQUEST,
                    );
                  }

                  if (!isInRangeZero || e[keyValue] < 0) {
                    throw new HttpException(
                      {
                        status: HttpStatus.BAD_REQUEST,
                        error: 'Date is NOT match.',
                      },
                      HttpStatus.BAD_REQUEST,
                    );
                  }

                  const s = String(e[keyValue]).trim();
                  if (s === '') {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${entryPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  const checkNoNum = parseNumericStrict(e[keyValue], {
                    capacityKey,
                    dateKey,
                    ePointName: entryPointName,
                    stamp: dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm'),
                  });


                  if (Number(e[keyValue]) === 0) {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${entryPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  if (!dEntryA) {
                    dEntryA = {};
                  }

                  if (!dEntryA[i]) {
                    dEntryA[i] = {
                      start: e[keyEntryFrom],
                      end: e[keyEntryTo],
                      date: { [capacityKey]: [] },
                    };
                  }

                  dEntryA = {
                    ...dEntryA,
                    [i]: {
                      start: e[keyEntryFrom],
                      end: e[keyEntryTo],
                      date: {
                        ...dEntryA[i]['date'],
                        [capacityKey]: [
                          ...(dEntryA[i]['date'][capacityKey] || []),
                          dateKey,
                        ],
                      },
                    },
                  };
                }
              });
            });
          }
        }

        const getContractPointByName =
          await this.capacityMiddleService.getContractPointByName(
            entryPointName,
            getGroupByName?.id || null,
          );

        if (!!!getContractPointByName) {
          notApproved = true;
          warningData.push(
            `Entry Point: ${entryPointName} not match system ${newData}`,
          );
        } else {
          const findCPS = contractPointSp.find((fCPS: any) => {
            return fCPS?.contract_point === entryPointName;
          });
          if (findCPS?.entry_exit_id === 2) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Contract Point is NOT match.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
          if (!!!findCPS) {
            typeSuccess = 2;
            notApproved = true;
            warningData.push(
              `Entry Point: ${entryPointName} not match system ${newData}`,
            );
          }
        }

        const contractPoints = contractPointsMaster?.find((f: any) => {
          return (
            f?.contract_point === e['0'] &&
            f?.entry_exit_id === 1
          )
        }) || null

        if (!entryPointName) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error:
                'Contract Point cannot be blank.', // https://app.clickup.com/t/86ev67nfc
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        return {
          data: e,
          contract_point: e['0'],
          area: contractPoints?.area?.name || null,
          zone: contractPoints?.zone?.name || null,
          contractPointName: entryPointName || null,
        };
      }),
    );

    const newExit = await Promise.all(
      exitValue.map(async (e: any, i: any) => {
        const exitPointName = e[keyExitPoint];
        let newStartDayPlus = dayjs(todayStart);
        let useStart = dayjs(e[keyExitFrom], 'DD/MM/YYYY');
        let useEnd = dayjs(e[keyExitTo], 'DD/MM/YYYY');

        try {
          if (!useStart.isValid()) {
            // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
            const excelSerialDate = parseToNumber(e[keyEntryFrom])
            if (excelSerialDate) {
              // It's an Excel serial date
              const jsDate = excelSerialToDate(excelSerialDate);
              useStart = dayjs(jsDate);
              e[keyEntryFrom] = dayjs(jsDate).format('DD/MM/YYYY');
            }
          }
          if (!useEnd.isValid()) {
            // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
            const excelSerialDate = parseToNumber(e[keyEntryTo])
            if (excelSerialDate) {
              // It's an Excel serial date
              const jsDate = excelSerialToDate(excelSerialDate);
              useEnd = dayjs(jsDate);
              e[keyEntryTo] = dayjs(jsDate).format('DD/MM/YYYY');
            }
          }
        } catch (error) {
        }

        if (!useStart.isValid() || !useEnd.isValid()) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Missing Period From or Period To value.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        let isCheckMoreDate = useStart.isAfter(newStartDayPlus);
        let checkMinMax = false;
        if(process.env.NODE_ENV !== 'development'){

          if (!isCheckMoreDate) {  // kom ปิดเพื่อเทส upload
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error:
                  'Period From date in the template must be later than today.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
  
          if (useStart.isSameOrAfter(useEnd)) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: "The 'Period To' date must not be earlier than the 'Period From' date.",
              },
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        checkMinMax = this.capacityMiddleService.checkDateRange(
          useStart.format('DD/MM/YYYY'), //e[keyExitFrom],
          e[keyExitTo],
          // modeDayAndMonth,
          bookingTemplate?.file_period_mode,
          bookingTemplate?.min,
          bookingTemplate?.max,
        );
        if (!checkMinMax) {

          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Date is NOT match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        const headerExitDate = resultTranform?.['headerExit'];
        const keysGreaterThanExitTo = Object.keys(e).filter(
          (key) => Number(key) > Number(keyExitTo),
        );
        for (let is = 0; is < keysGreaterThanExitTo.length; is++) {
          if (headerExitDate) {
            Object.keys(headerExitDate).forEach((capacityKey) => {
              const capacityDates = headerExitDate[capacityKey];
              Object.keys(capacityDates).forEach((dateKeyString) => {
                let dateKey = dateKeyString;
                if (!dayjs(dateKeyString, 'DD/MM/YYYY').isValid()) {
                  try {
                    // ตรวจสอบว่าเป็นวันที่ Excel serial date หรือไม่
                    const excelSerialDate = parseToNumber(dateKeyString)
                    if (excelSerialDate) {
                      // It's an Excel serial date
                      const jsDate = excelSerialToDate(excelSerialDate);
                      dateKey = dayjs(jsDate).format('DD/MM/YYYY');
                      const tempData = headerExitDate[capacityKey][dateKeyString]
                      delete resultTranform?.['headerExit'][capacityKey][dateKeyString]
                      delete headerExitDate[capacityKey][dateKeyString]
                      resultTranform['headerExit'][capacityKey][dateKey] = tempData
                      headerExitDate[capacityKey][dateKey] = tempData
                    }
                  } catch (error) {
                  }
                }

                const keyValue = capacityDates[dateKey]?.['key'];
                if (keysGreaterThanExitTo[is] === keyValue) {
                  dateStartAll.push(e[keyEntryFrom]);
                  dateEndAll.push(e[keyEntryTo]);

                  const isInRangeZero = dayjs(dateKey, 'DD/MM/YYYY').isBetween(
                    dayjs(e[keyEntryFrom], 'DD/MM/YYYY'),
                    dayjs(e[keyEntryTo], 'DD/MM/YYYY'),
                    'month',
                    '[]',
                  );

                  if (
                    modeDayAndMonth === 2 &&
                    dayjs(dateKey, 'DD/MM/YYYY').format('DD') !== '01'
                  ) {
                    throw new HttpException(
                      {
                        status: HttpStatus.BAD_REQUEST,
                        error: 'Date is NOT match',
                      },
                      HttpStatus.BAD_REQUEST,
                    );
                  }

                  const s = String(e[keyValue]).trim();
                  if (s === '') {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${exitPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  const checkNoNum = parseNumericStrict(e[keyValue], {
                    capacityKey,
                    dateKey,
                    ePointName: exitPointName,
                    stamp: dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm'),
                  });

                  if (Number(e[keyValue]) === 0) {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${exitPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  if (!dExitA) {
                    dExitA = {};
                  }

                  if (!dExitA[i]) {
                    dExitA[i] = {
                      start: e[keyExitFrom],
                      end: e[keyExitTo],
                      date: { [capacityKey]: [] },
                    };
                  }

                  dExitA = {
                    ...dExitA,
                    [i]: {
                      start: e[keyExitFrom],
                      end: e[keyExitTo],
                      date: {
                        ...dExitA[i]['date'],
                        [capacityKey]: [
                          ...(dExitA[i]['date'][capacityKey] || []),
                          dateKey,
                        ],
                      },
                    },
                  };
                }
              });
            });
          }
        }

        const getContractPointByName =
          await this.capacityMiddleService.getContractPointByName(
            exitPointName,
            getGroupByName?.id || null,
          );
        if (!!!getContractPointByName) {
          notApproved = true;
          warningData.push(
            `Exit Point: ${exitPointName} not match system ${newData}`,
          );
        } else {
          const findCPS = contractPointSp.find((fCPS: any) => {
            return fCPS?.contract_point === exitPointName;
          });
          if (findCPS?.entry_exit_id === 1) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Contract Point is NOT match.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
          if (!!!findCPS) {
            typeSuccess = 2;
            notApproved = true;
            warningData.push(
              `Exit Point: ${exitPointName} not match system ${newData}`,
            );
          }
        }

        const contractPoints = contractPointsMaster?.find((f: any) => {
          return (
            f?.contract_point === e['0'] &&
            f?.entry_exit_id === 2
          )
        }) || null

        if (!exitPointName) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error:
                'Contract Point cannot be blank.', // https://app.clickup.com/t/86ev67nfc
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        return {
          data: e,
          contract_point: e['0'],
          area: contractPoints?.area?.name || null,
          zone: contractPoints?.zone?.name || null,
          contractPointName: exitPointName || null,
        };
      }),
    );

    const minDate = dateStartAll.reduce((min, current) => {
      return dayjs(current, 'DD/MM/YYYY').isBefore(dayjs(min, 'DD/MM/YYYY'))
        ? current
        : min;
    }, dateStartAll[0]);
    const maxDate = dateEndAll.reduce((max, current) => {
      return dayjs(current, 'DD/MM/YYYY').isAfter(dayjs(max, 'DD/MM/YYYY'))
        ? current
        : max;
    }, dateEndAll[0]);

    if (checkContractCode) {
      if (shipperIdName ? shipperIdName !== checkContractCode?.group?.id_name : shipperName !== checkContractCode?.group?.name) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Shipper Name Is NOT MATCH',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (typeOfContractText !== checkContractCode?.term_type_id) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Term Type ไม่เหมือนของเดิม',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const dEntryArray = Object.values(dEntryA);
      for (let i = 0; i < dEntryArray.length; i++) {
        const calcCheckEntry =
          await this.capacityMiddleService.validateDateEntries(
            dEntryArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );

        const objCalcEntry =
          this.capacityMiddleService.extractValidationResults(
            calcCheckEntry?.date,
          );
        const findCalcEntry = objCalcEntry.filter((f: any) => {
          return f === false;
        });

        if (findCalcEntry.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Period Capacity Right is NOT Match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      const dExitArray = Object.values(dExitA);
      for (let i = 0; i < dExitArray.length; i++) {
        const calcCheckExit =
          await this.capacityMiddleService.validateDateEntries(
            dExitArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcExit = this.capacityMiddleService.extractValidationResults(
          calcCheckExit?.date,
        );
        const findCalcExit = objCalcExit.filter((f: any) => {
          return f === false;
        });
        if (findCalcExit.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'format date Exit มีวันที่/จำนวนไม่ถูกต้อง',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    } else {
      if (!!!dEntryA || !!!dExitA) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'The Capacity Booking must be defined.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const dEntryArray = Object.values(dEntryA);
      for (let i = 0; i < dEntryArray.length; i++) {
        const calcCheckEntry =
          await this.capacityMiddleService.validateDateEntries(
            dEntryArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcEntry =
          this.capacityMiddleService.extractValidationResults(
            calcCheckEntry?.date,
          );
        const findCalcEntry = objCalcEntry.filter((f: any) => {
          return f === false;
        });

        if (findCalcEntry.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Period Capacity Right is NOT Match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      const dExitArray = Object.values(dExitA);
      for (let i = 0; i < dExitArray.length; i++) {
        const calcCheckExit =
          await this.capacityMiddleService.validateDateEntries(
            dExitArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcExit = this.capacityMiddleService.extractValidationResults(
          calcCheckExit?.date,
        );
        const findCalcExit = objCalcExit.filter((f: any) => {
          return f === false;
        });
        if (findCalcExit.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'format date Exit มีวันที่/จำนวนไม่ถูกต้อง',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }

    if (entryCompareNotMatch.length > 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Entry & Total Exit is NOT match.',
          data: entryCompareNotMatch,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (exitCompareNotMatch.length > 0) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Entry & Total Exit is NOT match.',
          data: exitCompareNotMatch,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      compareEntryExit['Capacity Daily Booking (MMBTU/d)'].length > 0 ||
      compareEntryExit['Maximum Hour Booking (MMBTU/h)'].length > 0
    ) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Entry & Total Exit is NOT match.',
          data: compareEntryExit,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const checkContractCodeCheckLast = !!checkContractCode?.id
      ? await this.prisma.contract_code.findFirst({
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
        },
        where: {
          ref_contract_code_by_main_id: checkContractCode?.id,
        },
        orderBy: {
          id: 'desc',
        },
      })
      : null;

    if (
      checkContractCodeCheckLast?.status_capacity_request_management_process_id ===
      4 ||
      checkContractCodeCheckLast?.status_capacity_request_management_id === 5
    ) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code End | Terminate',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let versionFlag = false;
    let amdFlag = false;
    let newCreate = false;

    const nowDate = getTodayNowAdd7().toDate();

    const hasContractStarted =
      dayjs(nowDate).isAfter(
        dayjs(checkContractCodeCheckLast?.contract_start_date),
      ) ||
      dayjs(nowDate).isSame(
        dayjs(checkContractCodeCheckLast?.contract_start_date),
      );
    let amdVersion: any = null;
    if (
      hasContractStarted &&
      checkContractCodeCheckLast?.status_capacity_request_management_id === 2
    ) {
      // ขึ้น _Amd01++
      const checkContractCodeCheckLength =
        await this.prisma.contract_code.count({
          where: {
            ref_contract_code_by_main_id: checkContractCode?.id,
          },
        });
      amdVersion =
        '_Amd' +
        String(
          checkContractCodeCheckLength > 9
            ? checkContractCodeCheckLength
            : '0' + checkContractCodeCheckLength,
        );
      contract_code = contract_code + amdVersion;
      amdFlag = true;
    } else if (
      !hasContractStarted &&
      checkContractCodeCheckLast?.status_capacity_request_management_id === 2
    ) {
      versionFlag = true;
    } else {
      if (checkContractCodeCheckLast) {
        versionFlag = true;
      } else {
        newCreate = true;
      }
    }

    const shipperWhere = shipperIdName ? { id_name: shipperIdName } : { name: shipperName }
    const shipperId = await this.prisma.group.findFirst({
      select: {
        id: true,
        user_type_id: true,
      },
      where: shipperWhere,
    });
    const ckUserType = await this.prisma.user_type.findFirst({
      where: {
        group: {
          some: {
            account_manage: {
              some: {
                account_id: Number(userId),
              },
            },
          },
        },
      },
    });

    let idTemp = null;
    let tyTmp = null;

    const ckAreaDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.area);
    const hasDuplicate = new Set(ckAreaDup).size !== ckAreaDup.length;

    const ckPointDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.contract_point);
    const hasDuplicatePoint = new Set(ckPointDup).size !== ckPointDup.length;

    if (hasDuplicatePoint) {
      let ctPoint = []
      for (let i_ = 0; i_ < ckPointDup.length; i_++) {
        const contractPoint = await this.prisma.contract_point.findFirst({
          where:{
            contract_point: ckPointDup?.[i_]
          },
          select:{ contract_point:true },
        })
        if(!contractPoint){
          ctPoint.push(ckPointDup?.[i_])
        }
      }
      if(ctPoint?.length > 0){
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `${ctPoint?.join(", ")} is not exit in TPA System`, // https://app.clickup.com/t/9018502823/86ey937n6
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Duplicate Contract Point found.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (hasDuplicate) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Only one Contract Point is allowed per Area.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    // return 

    if (newCreate) {
      const shadowPeriod = this.capacityMiddleService.genMD(
        minDate,
        dayjs(maxDate, 'DD/MM/YYYY').subtract(1, 'day').format('DD/MM/YYYY'),
        modeDayAndMonth,
      );

      const createContractCode = await this.prisma.contract_code.create({
        data: {
          contract_code: contract_code,
          ...(!!typeOfContractText && {
            term_type: {
              connect: {
                id: typeOfContractText,
              },
            },
          }),
          ...(!!shipperId?.id && {
            group: {
              connect: {
                id: shipperId?.id,
              },
            },
          }),
          status_capacity_request_management_process: {
            connect: {
              id: 3,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: 1,
            },
          },
          type_account: {
            connect: {
              id: 1,
            },
          },
          ...(!!checkContractCodeCheckLast?.ref_contract_code_by_main_id && {
            ref_contract_code_by_main: {
              connect: {
                id: checkContractCodeCheckLast?.ref_contract_code_by_main_id,
              },
            },
          }),
          ...(!!checkContractCodeCheckLast?.id && {
            ref_contract_code_by: {
              connect: {
                id: checkContractCodeCheckLast?.id,
              },
            },
          }),
          // shadow_period: bookingTemplate?.shadow_period,
          shadow_period: (!!shadowPeriod && Number(shadowPeriod)) || null,
          shadow_time: bookingTemplate?.shadow_time,
          file_period_mode: bookingTemplate?.file_period_mode,
          fixdayday: bookingTemplate?.fixdayday,
          todayday: bookingTemplate?.todayday,
          contract_start_date: minDate
            ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
            : null,
          contract_end_date: maxDate
            ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
            : null,
          submitted_timestamp: getTodayNowAdd7().toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
        },
      });
      idTemp = createContractCode?.id;
      tyTmp = 'created';
      await this.prisma.contract_code.update({
        where: {
          id: createContractCode?.id ?? -1,
        },
        data: {
          ref_contract_code_by_main_id: createContractCode?.id,
        },
      });

      const versId = await this.prisma.booking_version.create({
        data: {
          version: `v.1`,
          ...(!!createContractCode?.id && {
            contract_code: {
              connect: {
                id: createContractCode?.id,
              },
            },
          }),
          flag_use: true,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
          submitted_timestamp: getTodayNowAdd7().toDate(),
          type_account: {
            connect: {
              id: 1,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: 1,
            },
          },
          contract_start_date: minDate
            ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
            : null,
          contract_end_date: maxDate
            ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
            : null,
        },
      });

      await this.prisma.booking_full_json.create({
        data: {
          ...(!!versId?.id && {
            booking_version: {
              connect: {
                id: versId?.id,
              },
            },
          }),
          data_temp: JSON.stringify(resultTranform),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
        },
      });

      let mapDataRowJson = [];
      for (let i = 0; i < newEntry.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 1,

          zone_text: newEntry[i]?.zone,
          area_text: newEntry[i]?.area,
          contract_point: newEntry[i]?.contract_point,
          flag_use: true,
          data_temp: JSON.stringify(newEntry[i]?.data),
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }
      for (let i = 0; i < newExit.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 2,

          zone_text: newExit[i]?.zone,
          area_text: newExit[i]?.area,
          contract_point: newExit[i]?.contract_point,
          flag_use: true,
          data_temp: JSON.stringify(newExit[i]?.data),
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }

      await this.prisma.booking_row_json.createMany({
        data: mapDataRowJson,
      });

      await this.prisma.submission_comment_capacity_request_management.createMany(
        {
          data: (warningData || []).map((ew: any) => {
            return {
              remark: ew,
              contract_code_id: createContractCode?.id,
              create_by: Number(userId),
              create_date: getTodayNowAdd7().toDate(),
              create_date_num: getTodayNowAdd7().unix(),
            };
          }),
        },
      );

      const responseUpFile = await uploadFilsTemp(file);
      await this.capacityMiddleService.fileCapacityBooking(
        responseUpFile?.file?.url,
        createContractCode?.id,
        userId,
      );
      // warningData.length <= 0
      // เช็ค contract point ผิด/ไม่ถูกไม่ให้ tso เปลี่ยนเป็น approved
      if ((ckUserType?.id === 1 || ckUserType?.id === 2) && !notApproved) {
        if (typeSuccess === 1) {
          try {
            await this.updateStatusCapacityRequestManagement(
              createContractCode?.id,
              {
                status_capacity_request_management_id: 2,
                terminate_date: null, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
              },
              userId,
              null,
            );
          } catch (error) {
            console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
          }
        }
      }
    } else {
      if (versionFlag) {
        const shadowPeriod = this.capacityMiddleService.genMD(
          minDate,
          dayjs(maxDate, 'DD/MM/YYYY').subtract(1, 'day').format('DD/MM/YYYY'),
          modeDayAndMonth,
        );
        await this.prisma.contract_code.update({
          where: {
            id: checkContractCodeCheckLast?.id ?? -1,
          },
          data: {
            ...(!!checkContractCodeCheckLast?.status_capacity_request_management_id && {
              status_capacity_request_management: {
                connect: {
                  id: 1,
                  // checkContractCodeCheckLast?.status_capacity_request_management_id ===
                  // 3
                  //   ? 1
                  //   : checkContractCodeCheckLast?.status_capacity_request_management_id,
                },
              },
            }),
            ...(!!checkContractCodeCheckLast?.status_capacity_request_management_id && {
              status_capacity_request_management_process: {
                connect: {
                  id: 3,
                  // checkContractCodeCheckLast?.status_capacity_request_management_id ===
                  // 3
                  //   ? 3
                  //   : checkContractCodeCheckLast?.status_capacity_request_management_process_id,
                },
              },
            }),

            file_period_mode: bookingTemplate?.file_period_mode,
            fixdayday: bookingTemplate?.fixdayday,
            todayday: bookingTemplate?.todayday,
            contract_start_date: minDate
              ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
              : null,
            contract_end_date: maxDate
              ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
              : null,
            submitted_timestamp: getTodayNowAdd7().toDate(),
            type_account: {
              connect: {
                id: 1,
              },
            },
            update_date: getTodayNowAdd7().toDate(),
            update_date_num: getTodayNowAdd7().unix(),
            update_by_account: {
              connect: {
                id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
              },
            },
            shadow_period: !!shadowPeriod ? Number(shadowPeriod) : 0,
          },
        });

        idTemp = checkContractCodeCheckLast?.id;
        tyTmp = 'version';

        await this.prisma.booking_version.updateMany({
          where: {
            contract_code_id: checkContractCodeCheckLast?.id ?? -1,
          },
          data: {
            flag_use: false,
          },
        });

        const checkContractCodeCheckLength =
          await this.prisma.booking_version.count({
            where: {
              contract_code_id: checkContractCodeCheckLast?.id,
            },
          });

        const versId = await this.prisma.booking_version.create({
          data: {
            version: `v.${checkContractCodeCheckLength + 1}`,
            ...(!!checkContractCodeCheckLast?.id && {
              contract_code: {
                connect: {
                  id: checkContractCodeCheckLast?.id,
                },
              },
            }),
            flag_use: true,
            create_date: getTodayNowAdd7().toDate(),
            create_date_num: getTodayNowAdd7().unix(),
            create_by_account: {
              connect: {
                id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
              },
            },
            submitted_timestamp: getTodayNowAdd7().toDate(),
            type_account: {
              connect: {
                id: 1,
              },
            },
            ...(!!checkContractCodeCheckLast?.status_capacity_request_management_id && {
              status_capacity_request_management: {
                connect: {
                  id:
                    checkContractCodeCheckLast?.status_capacity_request_management_id ===
                      3
                      ? 1
                      : (checkContractCodeCheckLast?.status_capacity_request_management_id == 2 || checkContractCodeCheckLast?.status_capacity_request_management_id == 4) &&
                        ((ckUserType?.id != 1 && ckUserType?.id != 2) ||
                          notApproved ||
                          typeSuccess !== 1)
                        ? 1
                        : checkContractCodeCheckLast?.status_capacity_request_management_id,
                },
              },
            }),
            contract_start_date: minDate
              ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
              : null,
            contract_end_date: maxDate
              ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
              : null,
          },
        });

        await this.prisma.booking_full_json.create({
          data: {
            ...(!!versId?.id && {
              booking_version: {
                connect: {
                  id: versId?.id,
                },
              },
            }),
            data_temp: JSON.stringify(resultTranform),
            create_date: getTodayNowAdd7().toDate(),
            create_date_num: getTodayNowAdd7().unix(),
            create_by_account: {
              connect: {
                id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
              },
            },
          },
        });

        let mapDataRowJson = [];
        for (let i = 0; i < newEntry.length; i++) {
          mapDataRowJson.push({
            booking_version_id: versId?.id,
            entry_exit_id: 1,

            zone_text: newEntry[i]?.zone,
            area_text: newEntry[i]?.area,
            contract_point: newEntry[i]?.contract_point,
            flag_use: true,
            data_temp: JSON.stringify(newEntry[i]?.data),
            create_by: Number(userId),
            create_date: getTodayNowAdd7().toDate(),
            create_date_num: getTodayNowAdd7().unix(),
          });
        }
        for (let i = 0; i < newExit.length; i++) {
          mapDataRowJson.push({
            booking_version_id: versId?.id,
            entry_exit_id: 2,

            zone_text: newExit[i]?.zone,
            area_text: newExit[i]?.area,
            contract_point: newExit[i]?.contract_point,
            flag_use: true,
            data_temp: JSON.stringify(newExit[i]?.data),
            create_by: Number(userId),
            create_date: getTodayNowAdd7().toDate(),
            create_date_num: getTodayNowAdd7().unix(),
          });
        }
        await this.prisma.booking_row_json.createMany({
          data: mapDataRowJson,
        });

        await this.prisma.submission_comment_capacity_request_management.createMany(
          {
            data: (warningData || []).map((ew: any) => {
              return {
                remark: ew,
                contract_code_id: checkContractCodeCheckLast?.id,
                create_date: getTodayNowAdd7().toDate(),
                create_by: Number(userId),
                create_date_num: getTodayNowAdd7().unix(),
              };
            }),
          },
        );

        const responseUpFile = await uploadFilsTemp(file);
        await this.capacityMiddleService.fileCapacityBooking(
          responseUpFile?.file?.url,
          checkContractCodeCheckLast?.id,
          userId,
        );

        if ((ckUserType?.id === 1 || ckUserType?.id === 2) && !notApproved) {
          if (typeSuccess === 1) {
            try {
              await this.updateStatusCapacityRequestManagement(
                checkContractCodeCheckLast?.id,
                {
                  status_capacity_request_management_id: 2,
                  terminate_date: null, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
                  // shadow_time: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                  // shadow_period: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                  // reject_reasons: null, //"comment.." //status_capacity_request_management_id 3 ต้องมี ไม่ 3 ให้ null
                },
                userId,
                null,
                true,
              );
            } catch (error) {
              console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
            }
          }
        }
      } else if (amdFlag) {
        const shadowPeriod = this.capacityMiddleService.genMD(
          minDate,
          dayjs(maxDate, 'DD/MM/YYYY').subtract(1, 'day').format('DD/MM/YYYY'),
          modeDayAndMonth,
        );
        const extendContractLast =
          await this.prisma.extend_contract_capacity_request_management.findFirst(
            {
              where: {
                contract_code_id: checkContractCodeCheckLast?.id,
              },
              orderBy: {
                id: 'desc',
              },
            },
          );
        const configStart = !!extendContractLast
          ? dayjs(extendContractLast?.start_date).format('DD/MM/YYYY')
          : dayjs(minDate, 'DD/MM/YYYY').format('DD/MM/YYYY');
        const configEnd = !!extendContractLast
          ? dayjs(extendContractLast?.end_date).format('DD/MM/YYYY')
          : dayjs(maxDate, 'DD/MM/YYYY').format('DD/MM/YYYY');

        const resCk = await this.capacityMiddleService.validateEndDate({
          configStart: configStart,
          configEnd: configEnd,
          file_period_mode: bookingTemplate?.file_period_mode,
          shadow_time: checkContractCodeCheckLast?.shadow_time,
          startdate: minDate,
          endDate: maxDate,
          shadow_period: checkContractCodeCheckLast?.shadow_period,
        });

        if (resCk) {

          const createContractCodeAmd = await this.prisma.contract_code.create({
            data: {
              contract_code: contract_code,
              ...(!!typeOfContractText && {
                term_type: {
                  connect: {
                    id: typeOfContractText,
                  },
                },
              }),
              ...(!!shipperId?.id && {
                group: {
                  connect: {
                    id: shipperId?.id,
                  },
                },
              }),
              status_capacity_request_management_process: {
                connect: {
                  id: dayjs(minDate, 'DD/MM/YYYY').isSameOrBefore(
                    dayjs(),
                    'day',
                  )
                    ? 1
                    : 2,
                },
              },
              status_capacity_request_management: {
                connect: {
                  id: 2,
                },
              },
              type_account: {
                connect: {
                  id: 1,
                },
              },
              ...(!!checkContractCodeCheckLast?.ref_contract_code_by_main_id && {
                ref_contract_code_by_main: {
                  connect: {
                    id: checkContractCodeCheckLast?.ref_contract_code_by_main_id,
                  },
                },
              }),
              ...(!!checkContractCodeCheckLast?.id && {
                ref_contract_code_by: {
                  connect: {
                    id: checkContractCodeCheckLast?.id,
                  },
                },
              }),
              // shadow_period: checkContractCodeCheckLast?.shadow_period,
              shadow_period: !!shadowPeriod ? Number(shadowPeriod) : 0,
              shadow_time: checkContractCodeCheckLast?.shadow_time,
              file_period_mode: bookingTemplate?.file_period_mode,
              fixdayday: bookingTemplate?.fixdayday,
              todayday: bookingTemplate?.todayday,
              contract_start_date: minDate
                ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
                : null,
              contract_end_date: maxDate
                ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
                : null,
              submitted_timestamp: getTodayNowAdd7().toDate(),
              create_date: getTodayNowAdd7().toDate(),
              create_date_num: getTodayNowAdd7().unix(),
              create_by_account: {
                connect: {
                  id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                },
              },
            },
          });

          idTemp = createContractCodeAmd?.id;
          tyTmp = 'amd';

          await this.prisma.contract_code.update({
            where: {
              id: createContractCodeAmd?.id ?? -1,
            },
            data: {
              ref_contract_code_by_main_id:
                checkContractCodeCheckLast?.ref_contract_code_by_main_id,
              ref_contract_code_by_id: checkContractCodeCheckLast?.id,
            },
          });

          const versId = await this.prisma.booking_version.create({
            data: {
              version: `v.1`,
              ...(!!createContractCodeAmd?.id && {
                contract_code: {
                  connect: {
                    id: createContractCodeAmd?.id,
                  },
                },
              }),
              flag_use: true,
              create_date: getTodayNowAdd7().toDate(),
              create_date_num: getTodayNowAdd7().unix(),
              create_by_account: {
                connect: {
                  id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                },
              },
              submitted_timestamp: getTodayNowAdd7().toDate(),
              type_account: {
                connect: {
                  id: 1,
                },
              },
              status_capacity_request_management: {
                connect: {
                  id: 2,
                },
              },
              contract_start_date: minDate
                ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
                : null,
              contract_end_date: maxDate
                ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
                : null,
            },
          });

          await this.prisma.booking_full_json.create({
            data: {
              ...(!!versId?.id && {
                booking_version: {
                  connect: {
                    id: versId?.id,
                  },
                },
              }),
              data_temp: JSON.stringify(resultTranform),
              create_date: getTodayNowAdd7().toDate(),
              create_date_num: getTodayNowAdd7().unix(),
              create_by_account: {
                connect: {
                  id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                },
              },
            },
          });

          let mapDataRowJson = [];
          for (let i = 0; i < newEntry.length; i++) {
            mapDataRowJson.push({
              booking_version_id: versId?.id,
              entry_exit_id: 1,

              zone_text: newEntry[i]?.zone,
              area_text: newEntry[i]?.area,
              contract_point: newEntry[i]?.contract_point,
              flag_use: true,
              data_temp: JSON.stringify(newEntry[i]?.data),
              create_by: Number(userId),
              create_date: getTodayNowAdd7().toDate(),
              create_date_num: getTodayNowAdd7().unix(),
            });
          }
          for (let i = 0; i < newExit.length; i++) {
            mapDataRowJson.push({
              booking_version_id: versId?.id,
              entry_exit_id: 2,

              zone_text: newExit[i]?.zone,
              area_text: newExit[i]?.area,
              contract_point: newExit[i]?.contract_point,
              flag_use: true,
              data_temp: JSON.stringify(newExit[i]?.data),
              create_by: Number(userId),
              create_date: getTodayNowAdd7().toDate(),
              create_date_num: getTodayNowAdd7().unix(),
            });
          }

          await this.prisma.booking_row_json.createMany({
            data: mapDataRowJson,
          });

          await this.prisma.submission_comment_capacity_request_management.createMany(
            {
              data: (warningData || []).map((ew: any) => {
                return {
                  remark: ew,
                  contract_code_id: checkContractCodeCheckLast?.id,
                  create_date: getTodayNowAdd7().toDate(),
                  create_by: Number(userId),
                  create_date_num: getTodayNowAdd7().unix(),
                };
              }),
            },
          );
          const responseUpFile = await uploadFilsTemp(file);
          await this.capacityMiddleService.fileCapacityBooking(
            responseUpFile?.file?.url,
            createContractCodeAmd?.id,
            userId,
          );

          try {
            //terminate เก่า
            // ยังไม่ได้รองรับจากปุ่ม amd เพิ่ม field termidate
            // ละเว้น Error: Cannot read properties of null (reading 'booking_row_json')
            let newTerminateDate = null;
            if (minDate) {
              const terminateDate = getTodayNowDDMMYYYYDfaultAdd7(minDate);
              const contractStartDate = getTodayNowDDMMYYYYDfaultAdd7(
                checkContractCodeCheckLast.contract_start_date,
              );
              const contractEndDate = getTodayNowDDMMYYYYDfaultAdd7(
                checkContractCodeCheckLast.contract_end_date,
              );
              if (terminateDate.isBefore(contractStartDate, 'day')) {
                newTerminateDate = contractStartDate.toDate();
              } else if (terminateDate.isAfter(contractEndDate, 'day')) {
                newTerminateDate = contractEndDate.toDate();
              } else {
                newTerminateDate = terminateDate.toDate();
              }
            }
            await this.updateStatusCapacityRequestManagement(
              checkContractCodeCheckLast?.id,
              {
                status_capacity_request_management_id: 5,
                terminate_date: newTerminateDate,

                // shadow_time: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                // shadow_period: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                // reject_reasons: null, //"comment.." //status_capacity_request_management_id 3 ต้องมี ไม่ 3 ให้ null
              },
              userId,
              null,
            );
          } catch (error) {
            console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
          }

          try {
            await this.updateStatusCapacityRequestManagement(
              createContractCodeAmd?.id,
              {
                status_capacity_request_management_id: 2,
                terminate_date: null, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
                // shadow_time: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                // shadow_period: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                // reject_reasons: null, //"comment.." //status_capacity_request_management_id 3 ต้องมี ไม่ 3 ให้ null
              },
              userId,
              null,
            );
          } catch (error) {
            console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
          }
        } else {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Date mismatch: Fails shadow time/period check.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      } else {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'error เงื่อนไข',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return {
      id: idTemp,
      event: tyTmp,
      type: warningData?.length > 0 ? 2 : typeSuccess,
      warningData: warningData,
      remarkWarningData: `warningData.length > 0 คือมี warning`,
      message:
        warningData?.length > 0 ? `Blank Or 0 value detected in the template.` :
          typeSuccess === 1
            ? 'Success.'
            : 'Zone, Area or Contract point is NOT match.',
      remark: `type 1 = Success, 2 = Warning`,
    };
  }

  async useReqs(req: any) {
    const ip = req.headers['x-forwarded-for'] || req.ip;
    return {
      ip: ip,
      sub: req?.user?.sub,
      first_name: req?.user?.first_name,
      last_name: req?.user?.last_name,
      username: req?.user?.username,
      originalUrl: req?.originalUrl,
    };
  }

  async whenAddNewContract(
    data: any,
    userId: any, // null
    file: any, // null
    callBackForApprove?: (body: {
      id: any,
      payload: any,
      userId: any,
      req: any,
      isRestorePreviousVersionValue: boolean
    }) => void, // null
  ) {
    // contractPoints
    let contractPointFlag = false

    const dateStr = data?.contractStartDate;
    let dataContractStartDate = getTodayNowDDMMYYYYDfaultAdd7(dateStr);
    // ตรวจสอบว่า data?.contractStartDate เป็น ISOformat หรือไม่
    const isFormatValid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dateStr);
    if (isFormatValid) {
      dataContractStartDate = getTodayNowAdd7(dateStr);
    }
    const isFuture = dataContractStartDate.isAfter(dayjs()); // true = อยู่ในอนาคต
    if (!isFuture) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Start Date Must Be Longer Than The Present Date.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let ct_type = null
    if (isMatch(data?.termType, 'long')) {
      ct_type = 'LONG'
    } else if (isMatch(data?.termType, 'medium')) {
      ct_type = 'MEDIUM'
    } else if (isMatch(data?.termType, 'short') || isMatch(data?.termType, 'SHORT_FIRM')) {
      ct_type = 'SHORT_FIRM'
    } else if (data?.termType === "short non-firm" || isMatch(data?.termType, 'SHORT_NON_FIRM')) {
      ct_type = 'SHORT_NON_FIRM'
    } else {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `contract type not support ${data?.termType} : ["long", "medium", "short", "short non-firm"]`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const shipperData = await this.prisma.group.findFirst({
      where: {
        id_name: String(data?.shipperNo)
      },
    })
    // if(!shipperData){
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Shipper Info does not have system.',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    // if(shipperData?.id_name === shipperData?.company_name){
    //   throw new HttpException(
    //       {
    //         status: HttpStatus.BAD_REQUEST,
    //         error: 'This Shipper Name and Company Name combination already exists. Please choose another.',
    //       },
    //       HttpStatus.BAD_REQUEST,
    //     );
    // }


    // data?.dataTemp?.entryValue
    // data?.dataTemp?.exitValue

    const entryValueLikeOriginalVersion: any[] = (data?.dataTemp?.entryValue && Array.isArray(data.dataTemp.entryValue) ? data.dataTemp.entryValue : []).filter((e: any) => !isMatch(e?.["contractPoint"], "sumEntry"));
    const exitValueLikeOriginalVersion: any[] = (data?.dataTemp?.exitValue && Array.isArray(data.dataTemp.exitValue) ? data.dataTemp.exitValue : []).filter((e: any) => !isMatch(e?.["contractPoint"], "sumExit"));
    // -----

    const entry_head_1 = entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.reduce((acc, cur, idx) => {
      // idx + 7 ตามที่ใช้กันอยู่
      if(!acc[cur.date]) {
      acc[cur.date] = {
        key: String(idx + 7),
      };
      }
      return acc;
    }, {} as Record<string, { key: string }>);

    const entry_head_2 = entryValueLikeOriginalVersion[0]?.["MaximumHourBooking(MMBTU/h)"]?.reduce((acc, cur, idx) => {
      // idx + 7 ตามที่ใช้กันอยู่
      if(!acc[cur.date]) {
      acc[cur.date] = {
        key: String(idx + 7 + (entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0)),
      };
      }
      return acc;
    }, {} as Record<string, { key: string }>);

    const entry_head_3 = entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMscfd)"]?.reduce((acc, cur, idx) => {
      // idx + 7 ตามที่ใช้กันอยู่
      if(!acc[cur.date]) {
      acc[cur.date] = {
        key: String(idx + 7 + (entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (entryValueLikeOriginalVersion[0]?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0)),
      };
      }
      return acc;
    }, {} as Record<string, { key: string }>);

    const entry_head_4 = entryValueLikeOriginalVersion[0]?.["MaximumHourBooking(MMscfh)"]?.reduce((acc, cur, idx) => {
      // idx + 7 ตามที่ใช้กันอยู่
      if(!acc[cur.date]) {
      acc[cur.date] = {
        key: String(idx + 7 + (entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (entryValueLikeOriginalVersion[0]?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0) + (entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMscfd)"]?.length ?? 0)),
      };
      }
      return acc;
    }, {} as Record<string, { key: string }>);

    // -----

    const exit_head_1 = exitValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.reduce((acc, cur, idx) => {
      // idx + 7 ตามที่ใช้กันอยู่
      if(!acc[cur.date]) {
      acc[cur.date] = {
        key: String(idx + 7),
      };
      }
      return acc;
    }, {} as Record<string, { key: string }>);

    const exit_head_2 = exitValueLikeOriginalVersion[0]?.["MaximumHourBooking(MMBTU/h)"]?.reduce((acc, cur, idx) => {
      // idx + 7 ตามที่ใช้กันอยู่
      if(!acc[cur.date]) {
      acc[cur.date] = {
        key: String(idx + 7 + (exitValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0)),
      };
      }
      return acc;
    }, {} as Record<string, { key: string }>);


    let isOriginalEntryVersion = true;
    let entry_sum_1: { [k: string]: string } = {};
    let entry_sum_2: { [k: string]: string } = {};
    let entry_sum_3: { [k: string]: string } = {};
    let entry_sum_4: { [k: string]: string } = {};

    if ((data?.dataTemp?.entryValue || []).some((e: any) => isMatch(e?.["contractPoint"], "sumEntry"))) {
      isOriginalEntryVersion = false;
      try {
        entry_head_1
        const onlySumEntryValueList = (data?.dataTemp?.entryValue || []).filter((e: any) => isMatch(e?.["contractPoint"], "sumEntry"));
        entry_sum_1 = Object.fromEntries(
          Object.entries(onlySumEntryValueList.reduce((acc, entry) => {
            const arr = entry?.["CapacityDailyBooking(MMBTU/d)"] || [];

            arr.forEach((cur, idx) => {
              const existKey = entry_head_1[cur.date]?.key
              const key = idx + 7; // key ที่เคยใช้ใน acc
              const val = parseToNumber(cur.value) || 0;

              // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
              if(existKey){
                acc[existKey] = parseToNumber6Decimal((acc[existKey] || 0) + val);
              }
              else {
              acc[key] = (acc[key] || 0) + val;
              }
            });

            return acc;
          }, {})).map(([k, v]) => [k, String(v)])
        );
        entry_sum_2 = Object.fromEntries(
          Object.entries(onlySumEntryValueList.reduce((acc, entry) => {
            const arr = entry?.["MaximumHourBooking(MMBTU/h)"] || [];

            arr.forEach((cur, idx) => {
              const existKey = entry_head_2[cur.date]?.key
              const key = idx + 7 + (onlySumEntryValueList[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0); // key ที่เคยใช้ใน acc
              const val = parseToNumber(cur.value) || 0;

              // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
              if(existKey){
                acc[existKey] = parseToNumber6Decimal((acc[existKey] || 0) + val);
              }
              else {
              acc[key] = (acc[key] || 0) + val;
              }
            });

            return acc;
          }, {})).map(([k, v]) => [k, String(v)])
        );
        entry_sum_3 = Object.fromEntries(
          Object.entries(onlySumEntryValueList.reduce((acc, entry) => {
            const arr = entry?.["CapacityDailyBooking(MMscfd)"] || [];

            arr.forEach((cur, idx) => {
              const existKey = entry_head_3[cur.date]?.key
              const key = idx + 7 + (onlySumEntryValueList[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (onlySumEntryValueList[0]?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0); // key ที่เคยใช้ใน acc
              const val = parseToNumber(cur.value) || 0;

              // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
              if(existKey){
                acc[existKey] = parseToNumber6Decimal((acc[existKey] || 0) + val);
              }
              else {
              acc[key] = (acc[key] || 0) + val;
              }
            });

            return acc;
          }, {})).map(([k, v]) => [k, String(v)])
        );
        entry_sum_4 = Object.fromEntries(
          Object.entries(onlySumEntryValueList.reduce((acc, entry) => {
            const arr = entry?.["MaximumHourBooking(MMscfh)"] || [];

            arr.forEach((cur, idx) => {
              const existKey = entry_head_4[cur.date]?.key
              const key = idx + 7 + (onlySumEntryValueList[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (onlySumEntryValueList[0]?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0) + (onlySumEntryValueList[0]?.["CapacityDailyBooking(MMscfd)"]?.length ?? 0); // key ที่เคยใช้ใน acc
              const val = parseToNumber(cur.value) || 0;

              // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
              if(existKey){
                acc[existKey] = parseToNumber6Decimal((acc[existKey] || 0) + val);
              }
              else {
              acc[key] = (acc[key] || 0) + val;
              }
            });

            return acc;
          }, {})).map(([k, v]) => [k, String(v)])
        );
      }
      catch (error) {
        isOriginalEntryVersion = true;
      }
    }

    if (isOriginalEntryVersion) {
      entry_sum_1 = Object.fromEntries(
        Object.entries((data?.dataTemp?.entryValue || []).reduce((acc, entry) => {
          const arr = entry?.["CapacityDailyBooking(MMBTU/d)"] || [];

          arr.forEach((cur, idx) => {
            const key = idx + 7; // key ที่เคยใช้ใน acc
            const val = parseToNumber(cur.value) || 0;

            // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
            acc[key] = (acc[key] || 0) + val;
          });

          return acc;
        }, {})).map(([k, v]) => [k, String(v)])
      );
      entry_sum_2 = Object.fromEntries(
        Object.entries((data?.dataTemp?.entryValue || []).reduce((acc, entry) => {
          const arr = entry?.["MaximumHourBooking(MMBTU/h)"] || [];

          arr.forEach((cur, idx) => {
            const key = idx + 7 + ((data?.dataTemp?.entryValue || [])?.[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0); // key ที่เคยใช้ใน acc
            const val = parseToNumber(cur.value) || 0;

            // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
            acc[key] = (acc[key] || 0) + val;
          });

          return acc;
        }, {})).map(([k, v]) => [k, String(v)])
      );
      entry_sum_3 = Object.fromEntries(
        Object.entries((data?.dataTemp?.entryValue || []).reduce((acc, entry) => {
          const arr = entry?.["CapacityDailyBooking(MMscfd)"] || [];

          arr.forEach((cur, idx) => {
            const key = idx + 7 + ((data?.dataTemp?.entryValue || [])?.[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + ((data?.dataTemp?.entryValue || [])?.[0]?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0); // key ที่เคยใช้ใน acc
            const val = parseToNumber(cur.value) || 0;

            // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
            acc[key] = (acc[key] || 0) + val;
          });

          return acc;
        }, {})).map(([k, v]) => [k, String(v)])
      );
      entry_sum_4 = Object.fromEntries(
        Object.entries((data?.dataTemp?.entryValue || []).reduce((acc, entry) => {
          const arr = entry?.["MaximumHourBooking(MMscfh)"] || [];

          arr.forEach((cur, idx) => {
            const key = idx + 7 + ((data?.dataTemp?.entryValue || [])?.[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + ((data?.dataTemp?.entryValue || [])?.[0]?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0) + ((data?.dataTemp?.entryValue || [])?.[0]?.["CapacityDailyBooking(MMscfd)"]?.length ?? 0); // key ที่เคยใช้ใน acc
            const val = parseToNumber(cur.value) || 0;

            // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
            acc[key] = (acc[key] || 0) + val;
          });

          return acc;
        }, {})).map(([k, v]) => [k, String(v)])
      );
    }


    // -----

    let isOriginalExitVersion = true;
    let exit_sum_1: { [k: string]: string } = {};
    let exit_sum_2: { [k: string]: string } = {};

    if ((data?.dataTemp?.exitValue || []).some((e: any) => isMatch(e?.["contractPoint"], "sumExit"))) {
      isOriginalExitVersion = false;
      try {
        const onlySumExitValueList = (data?.dataTemp?.exitValue || []).filter((e: any) => isMatch(e?.["contractPoint"], "sumExit"));
        exit_sum_1 = Object.fromEntries(
          Object.entries(onlySumExitValueList.reduce((acc: { [x: string]: any; }, entry: any) => {
            const arr = entry?.["CapacityDailyBooking(MMBTU/d)"] || [];

            arr.forEach((cur: any, idx: number) => {
              const existKey = exit_head_1[cur.date]?.key
              const key = idx + 7; // key ที่เคยใช้ใน acc
              const val = parseToNumber(cur.value) || 0;

              // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
              if(existKey){
                acc[existKey] = parseToNumber6Decimal((acc[existKey] || 0) + val);
              }
              else {
              acc[key] = (acc[key] || 0) + val;
              }
            });

            return acc;
          }, {})).map(([k, v]) => [k, String(v)])
        );
        exit_sum_2 = Object.fromEntries(
          Object.entries(onlySumExitValueList.reduce((acc, entry) => {
            const arr = entry?.["MaximumHourBooking(MMBTU/h)"] || [];

            arr.forEach((cur, idx) => {
              const existKey = exit_head_2[cur.date]?.key
              const key = idx + 7 + (onlySumExitValueList[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0); // key ที่เคยใช้ใน acc
              const val = parseToNumber(cur.value) || 0;

              // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
              if(existKey){
                acc[existKey] = parseToNumber6Decimal((acc[existKey] || 0) + val);
              }
              else {
              acc[key] = (acc[key] || 0) + val;
              }
            });

            return acc;
          }, {})).map(([k, v]) => [k, String(v)])
        );
      }
      catch (error) {
        isOriginalExitVersion = true;
      }
    }

    if (isOriginalExitVersion) {
      exit_sum_1 = Object.fromEntries(
        Object.entries((data?.dataTemp?.exitValue || []).reduce((acc, entry) => {
          const arr = entry?.["CapacityDailyBooking(MMBTU/d)"] || [];

          arr.forEach((cur, idx) => {
            const key = idx + 7; // key ที่เคยใช้ใน acc
            const val = parseToNumber(cur.value) || 0;

            // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
            acc[key] = (acc[key] || 0) + val;
          });

          return acc;
        }, {})).map(([k, v]) => [k, String(v)])
      );
      exit_sum_2 = Object.fromEntries(
        Object.entries((data?.dataTemp?.exitValue || []).reduce((acc, entry) => {
          const arr = entry?.["MaximumHourBooking(MMBTU/h)"] || [];

          arr.forEach((cur, idx) => {
            const key = idx + 7 + ((data?.dataTemp?.exitValue || [])?.[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0); // key ที่เคยใช้ใน acc
            const val = parseToNumber(cur.value) || 0;

            // ถ้ามี key อยู่แล้วก็เอามาบวกเพิ่ม
            acc[key] = (acc[key] || 0) + val;
          });

          return acc;
        }, {})).map(([k, v]) => [k, String(v)])
      );
    }

    try {
      (entry_head_1 as any).key = String(7);
      (entry_head_2 as any).key = String(7 + (entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0));
      (entry_head_3 as any).key = String(7 + (entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (entryValueLikeOriginalVersion[0]?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0));
      (entry_head_4 as any).key = String(7 + (entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (entryValueLikeOriginalVersion[0]?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0) + (entryValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMscfd)"]?.length ?? 0));
      (exit_head_1 as any).key = String(7);
      (exit_head_2 as any).key = String(7 + (exitValueLikeOriginalVersion[0]?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0));
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Entry or Exit data is missing.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    // -----

    let tpawebsiteData = {
      entryValue: entryValueLikeOriginalVersion.map((e: any) => {

        const head_1 = e?.["CapacityDailyBooking(MMBTU/d)"]?.reduce((acc, cur, idx) => {
          const key = idx + 7
          const existKey = entry_head_1[cur.date]?.key
          if(existKey) {
            const keyNumber = parseToNumber3Decimal(existKey)
            if(keyNumber && key > keyNumber  && acc[keyNumber]) {
              const existValue = parseToNumber6Decimal(acc[keyNumber])
              const currentValue = parseToNumber6Decimal(cur.value)
              if((existValue || existValue== 0) && (currentValue || currentValue == 0)) {
                acc[keyNumber] = (existValue + currentValue).toFixed(3);
              }
              else{
                acc[key] = cur.value;
              }
            }
            else {
              acc[key] = cur.value;
            }
          }
          else {
          acc[idx + 7] = cur.value;
          }
          return acc;
        }, {});
        const head_2 = e?.["MaximumHourBooking(MMBTU/h)"]?.reduce((acc, cur, idx) => {
          const key = idx + 7 + (e?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0)
          const existKey = entry_head_2[cur.date]?.key
          if(existKey) {
            const keyNumber = parseToNumber3Decimal(existKey)
            if(keyNumber && key > keyNumber  && acc[keyNumber]) {
              const existValue = parseToNumber6Decimal(acc[keyNumber])
              const currentValue = parseToNumber6Decimal(cur.value)
              if((existValue || existValue== 0) && (currentValue || currentValue == 0)) {
                acc[keyNumber] = (existValue + currentValue).toFixed(3);
              }
              else{
                acc[key] = cur.value;
              }
            }
            else {
              acc[key] = cur.value;
            }
          }
          else {
          acc[idx + 7 + (e?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0)] = cur.value;
          }
          return acc;
        }, {});
        const head_3 = e?.["CapacityDailyBooking(MMscfd)"]?.reduce((acc, cur, idx) => {
          const key = idx + 7 + (e?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (e?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0)
          const existKey = entry_head_3[cur.date]?.key
          if(existKey) {
            const keyNumber = parseToNumber3Decimal(existKey)
            if(keyNumber && key > keyNumber  && acc[keyNumber]) {
              const existValue = parseToNumber6Decimal(acc[keyNumber])
              const currentValue = parseToNumber6Decimal(cur.value)
              if((existValue || existValue== 0) && (currentValue || currentValue == 0)) {
                acc[keyNumber] = (existValue + currentValue).toFixed(3);
              }
              else{
                acc[key] = cur.value;
              }
            }
            else {
              acc[key] = cur.value;
            }
          }
          else {
          acc[idx + 7 + (e?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (e?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0)] = cur.value;
          }
          return acc;
        }, {});
        const head_4 = e?.["MaximumHourBooking(MMscfh)"]?.reduce((acc, cur, idx) => {
          const key = idx + 7 + (e?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (e?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0) + (e?.["CapacityDailyBooking(MMscfd)"]?.length ?? 0)
          const existKey = entry_head_4[cur.date]?.key
          if(existKey) {
            const keyNumber = parseToNumber3Decimal(existKey)
            if(keyNumber && key > keyNumber  && acc[keyNumber]) {
              const existValue = parseToNumber6Decimal(acc[keyNumber])
              const currentValue = parseToNumber6Decimal(cur.value)
              if((existValue || existValue== 0) && (currentValue || currentValue == 0)) {
                acc[keyNumber] = (existValue + currentValue).toFixed(3);
              }
              else{
                acc[key] = cur.value;
              }
            }
            else {
              acc[key] = cur.value;
            }
          }
          else {
          acc[idx + 7 + (e?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0) + (e?.["MaximumHourBooking(MMBTU/h)"]?.length ?? 0) + (e?.["CapacityDailyBooking(MMscfd)"]?.length ?? 0)] = cur.value;
          }
          return acc;
        }, {});

        let periodTo = e?.PeriodTo ?? ''
        const periodToDayjs = getTodayNowDDMMYYYYDfaultAdd7(e?.PeriodTo)
        if (periodToDayjs.isValid()) {
          periodTo = periodToDayjs.startOf('day').add(1, 'day').tz('Asia/Bangkok').format('DD/MM/YYYY')
        }

        let entryPointName = e?.contractPoint || "";
        if (String(process.env.IS_CONTRACT_POINT_BY_SHIPPER).toLowerCase() === "true" && shipperData?.name) {
          const hasCheck = e?.contractPoint.endsWith(`-${shipperData?.name}`)
          entryPointName = hasCheck ? (e?.contractPoint || "") : `${e?.contractPoint || ""}-${shipperData?.name}`;
        }

        let setData = {
          "0": entryPointName,
          "1": e?.PressureRangeMin || "",
          "2": e?.PressureRangeMax || "",
          "3": e?.temperatureRangeMin || "",
          "4": e?.temperatureRangeMax || "",
          "5": e?.PeriodFrom || "",
          "6": periodTo,
          // "6": e?.PeriodTo || "",
          ...head_1,
          ...head_2,
          ...head_3,
          ...head_4,
        }

        return setData
      }), // success.
      exitValue: exitValueLikeOriginalVersion.map((e: any) => {

        const head_1 = e?.["CapacityDailyBooking(MMBTU/d)"]?.reduce((acc, cur, idx) => {
          const key = idx + 7
          const existKey = exit_head_1[cur.date]?.key
          if(existKey) {
            const keyNumber = parseToNumber3Decimal(existKey)
            if(keyNumber && key > keyNumber  && acc[keyNumber]) {
              const existValue = parseToNumber6Decimal(acc[keyNumber])
              const currentValue = parseToNumber6Decimal(cur.value)
              if((existValue || existValue== 0) && (currentValue || currentValue == 0)) {
                acc[keyNumber] = (existValue + currentValue).toFixed(3);
              }
              else{
                acc[key] = cur.value;
              }
            }
            else {
              acc[key] = cur.value;
            }
          }
          else {
          acc[idx + 7] = cur.value;
          }
          return acc;
        }, {});
        const head_2 = e?.["MaximumHourBooking(MMBTU/h)"]?.reduce((acc, cur, idx) => {
          const key = idx + 7 + (e?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0)
          const existKey = exit_head_2[cur.date]?.key
          if(existKey) {
            const keyNumber = parseToNumber3Decimal(existKey)
            if(keyNumber && key > keyNumber  && acc[keyNumber]) {
              const existValue = parseToNumber6Decimal(acc[keyNumber])
              const currentValue = parseToNumber6Decimal(cur.value)
              if((existValue || existValue== 0) && (currentValue || currentValue == 0)) {
                acc[keyNumber] = (existValue + currentValue).toFixed(3);
              }
              else{
                acc[key] = cur.value;
              }
            }
            else {
              acc[key] = cur.value;
            }
          }
          else {
          acc[idx + 7 + (e?.["CapacityDailyBooking(MMBTU/d)"]?.length ?? 0)] = cur.value;
          }
          return acc;
        }, {});

        let periodTo = e?.PeriodTo ?? ''
        const periodToDayjs = getTodayNowDDMMYYYYDfaultAdd7(e?.PeriodTo)
        if (periodToDayjs.isValid()) {
          periodTo = periodToDayjs.startOf('day').add(1, 'day').tz('Asia/Bangkok').format('DD/MM/YYYY')
        }

        let exitPointName = e?.contractPoint || "";
        if (String(process.env.IS_CONTRACT_POINT_BY_SHIPPER).toLowerCase() === "true" && shipperData?.name) {
          const hasCheck = e?.contractPoint.endsWith(`-${shipperData?.name}`)
          exitPointName = hasCheck ? (e?.contractPoint || "") : `${e?.contractPoint || ""}-${shipperData?.name}`;
        }

        let setData = {
          "0": exitPointName,
          "1": e?.PressureRangeMin || "",
          "2": e?.PressureRangeMax || "",
          "3": e?.temperatureRangeMin || "",
          "4": e?.temperatureRangeMax || "",
          "5": e?.PeriodFrom || "",
          "6": periodTo,
          // "6": e?.PeriodTo || "",
          ...head_1,
          ...head_2,
        }

        return setData
      }), // success.
      headerEntry: {
        "Entry": {
          "Pressure Range": {
            "Max": {
              "key": "2"
            },
            "Min": {
              "key": "1"
            },
            "key": "1"
          },
          "Temperature Range": {
            "Max": {
              "key": "4"
            },
            "Min": {
              "key": "3"
            },
            "key": "3"
          },
          "key": "0"
        }, // success.
        "Period": {
          "From": {
            "key": "5"
          },
          "To": {
            "key": "6"
          },
          "key": "5"
        }, // success.
        "Capacity Daily Booking (MMBTU/d)": entry_head_1 || {}, // success.
        "Maximum Hour Booking (MMBTU/h)": entry_head_2 || {}, // success.
        "Capacity Daily Booking (MMscfd)": entry_head_3 || {}, // success.
        "Maximum Hour Booking (MMscfh)": entry_head_4 || {}, // success.
      }, // success.
      headerExit: {
        "Exit": {
          "Pressure Range": {
            "Max": {
              "key": "2"
            },
            "Min": {
              "key": "1"
            },
            "key": "1"
          },
          "Temperature Range": {
            "Max": {
              "key": "4"
            },
            "Min": {
              "key": "3"
            },
            "key": "3"
          },
          "key": "0"
        }, // success.
        "Period": {
          "From": {
            "key": "5"
          },
          "To": {
            "key": "6"
          },
          "key": "5"
        }, // success.
        "Capacity Daily Booking (MMBTU/d)": exit_head_1 || {}, // success.
        "Maximum Hour Booking (MMBTU/h)": exit_head_2 || {}, // success.
      }, // success.
      shipperInfo: {
        "0": {
          // "Shipper Name": shipperData?.name // เปิดตอนใช้จริง
          "Shipper Name": shipperData?.name || data?.shipperName, // ปิดตอนใช้จริง
          "Shipper ID Name": data?.shipperNo
        },
        "1": {
          "Type of Contract": ct_type
        },
        "2": {
          "Contract Code": data?.contractNo
        }
      }, // success.
      sumEntries: {
        "0": "Sum Entry",
        ...entry_sum_1,
        ...entry_sum_2,
        ...entry_sum_3,
        ...entry_sum_4,
      }, // success.
      sumExits: {
        "0": "Sum Exit",
        ...exit_sum_1,
        ...exit_sum_2,
      }, // success.
    }


    const resultTranform = tpawebsiteData;
    const headerEntry = resultTranform?.headerEntry || {};
    const entryValue = resultTranform?.entryValue || [];
    const headerExit = resultTranform?.headerExit || {};
    const exitValue = resultTranform?.exitValue || [];
    const sumEntries = resultTranform?.sumEntries || {};
    const sumExits = resultTranform?.sumExits || {};

    const refContractNo = data?.RefContractNo
    // !!refContractNo ถ้ามี เช็คว่ามีในระบบไหม ถ้ามี คืนค่า ไม่มี ปล่อยผ่าน 

    // return resultTranform

    let typeSuccess = 1; // 1 success , 2 warning

    let shipperName = null;
    let shipperIdName = null;
    let typeOfContract = null;
    let contractCode = null;

    Object.values(resultTranform?.shipperInfo).forEach((info: any) => {
      if (info['Shipper Name']) {
        shipperName = info['Shipper Name'];
        shipperIdName = info['Shipper ID Name'];
      }
      if (info['Type of Contract']) {
        typeOfContract = info['Type of Contract'];
      }
      if (info['Contract Code']) {
        contractCode = info['Contract Code'] || '';
      }
    });

    if (!!!typeOfContract) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Type of Contract cannot be blank.', // https://app.clickup.com/t/86ev67ym1
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const typeOfContractText =
      this.capacityMiddleService.typeOfContractTextToNum(typeOfContract);

    const getGroupByName = shipperIdName ?
      await this.capacityMiddleService.getGroupByIDName(shipperIdName)
      :
      await this.capacityMiddleService.getGroupByName(shipperName);

    if (!!!getGroupByName) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Shipper Info does not match the value.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const contractPointSp = getGroupByName?.shipper_contract_point.map(
      (cp: any) => {
        return {
          contract_point: cp?.contract_point?.contract_point,
          entry_exit_id: cp?.contract_point?.entry_exit_id,
        };
      },
    );

    if (!!!typeOfContractText) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Type Term Name is NOT match',
          // error: 'Contract code does not match the term.',
          // error: 'Contract Code is missing in the template.',
          // error: 'Type of Contract not found.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!!!contractCode) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code not found. Please verify and try again.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const ckUserTypeGroup = await this.prisma.group.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId),
          },
        },
      },
      include: {
        user_type: true,
      },
    });


    // contractPointFlag

    if (ckUserTypeGroup?.user_type_id === 3) {
      if (shipperIdName ? ckUserTypeGroup?.id_name !== shipperIdName : ckUserTypeGroup?.name !== shipperName) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Contract code does not match the shipper.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (entryValue.length === 0 && exitValue.length === 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'The Capacity Booking must be defined',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const requiredEntry = [
      "Capacity Daily Booking (MMBTU/d)",
      "Capacity Daily Booking (MMscfd)",
      "Maximum Hour Booking (MMBTU/h)",
      "Maximum Hour Booking (MMscfh)",
      "Entry",
      "Period",
    ];

    const requiredExit = [
      "Capacity Daily Booking (MMBTU/d)",
      "Maximum Hour Booking (MMBTU/h)",
      "Exit",
      "Period",
    ];

    const missingEntry = requiredEntry.filter(k => !headerEntry?.[k]);
    const missingExit = requiredExit.filter(k => !headerExit?.[k]);

    const missing = [
      ...missingEntry.map(k => `Entry.${k}`),
      ...missingExit.map(k => `Exit.${k}`),
    ];

    if (missing.length > 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Template Is Not Match. [${missing.join(', ')}]`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const todayStart = getTodayStartAdd7().toDate();
    const todayEnd = getTodayEndAdd7().toDate();

    const bookingTemplate = await this.prisma.booking_template.findFirst({
      where: {
        term_type_id: Number(typeOfContractText),
        // start_date: {
        //   lte: todayEnd,
        // },
        // end_date: {
        //   gte: todayStart,
        // },
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

    const checkValueSum = {
      entry: {
        'Capacity Daily Booking (MMBTU/d)': [],
        'Maximum Hour Booking (MMBTU/h)': [],
        'Capacity Daily Booking (MMscfd)': [],
        'Maximum Hour Booking (MMscfh)': [],
      },
      exit: {
        'Capacity Daily Booking (MMBTU/d)': [],
        'Maximum Hour Booking (MMBTU/h)': [],
      },
    };

    const entryCompareNotMatch = [];
    const exitCompareNotMatch = [];

    const compareEntryExit = {
      'Capacity Daily Booking (MMBTU/d)': [],
      'Maximum Hour Booking (MMBTU/h)': [],
    };

    // Populate checkValueSum.entry
    for (const key in checkValueSum.entry) {
      if (headerEntry[key]) {
        Object.keys(headerEntry[key]).forEach((date) => {
          if (date !== 'key') {
            const entryKey = headerEntry[key][date]?.key;
            let sum = 0;
            entryValue.forEach((entry) => {
              if (entry[entryKey] !== undefined) {
                if (this.isMoreThan3Decimals(parseToNumber(entry[entryKey] ?? 0))) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: `${entry[0]} | ${key} | ${date} | The value must contain 3 decimal places.`,
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                }
                sum = parseToNumber3Decimal(sum + (Math.floor(parseToNumber(entry[entryKey] ?? 0) * 1000) / 1000));
              }
            });
            checkValueSum.entry[key].push({
              key: entryKey,
              sum,
              headerKey: date,
            });
          }
        });
      }
    }
    // Populate checkValueSum.exit
    for (const key in checkValueSum.exit) {
      if (headerExit[key]) {
        Object.keys(headerExit[key]).forEach((date) => {
          if (date !== 'key') {
            const exitKey = headerExit[key][date]?.key;
            let sum = 0;

            exitValue.forEach((exit) => {
              if (exit[exitKey] !== undefined) {

                if (this.isMoreThan3Decimals(parseToNumber(exit[exitKey] ?? 0))) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: `${exit[0]} | ${key} | ${date} | The value must contain 3 decimal places.`,
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                }
                sum = parseToNumber3Decimal(sum + (Math.floor(parseToNumber(exit[exitKey] ?? 0) * 1000) / 1000));
              }
            });
            checkValueSum.exit[key].push({
              key: exitKey,
              sum,
              headerKey: date,
            });
          }
        });
      }
    }

    // Compare checkValueSum.entry with sumEntries
    for (const key in checkValueSum.entry) {
      // if (!isMatch(key, 'Capacity Daily Booking (MMBTU/d)')) {
      if (key.includes('Hour')) {
        continue;
      }
      checkValueSum.entry[key].forEach((entryItem) => {
        let { key: entryKey, sum: calculatedSum, headerKey } = entryItem;
        const expectedSum = Number(sumEntries[entryKey]?.replace(/,/g, '')) || 0;

        if (String(calculatedSum) !== String(expectedSum)) {
          if (String(calculatedSum.toFixed(3)) !== String(expectedSum)) {
            const diff = Math.abs(Math.round((calculatedSum - expectedSum) * 1000000) / 1000000);
            if ((diff > 0.001 + Number.EPSILON) || diff == 0.001) {
              entryCompareNotMatch.push({
                headerKey, // This will be the date, such as "01/11/2024"
                key: entryKey,
                description: key,
                calculatedSum: calculatedSum,
                expectedSum,
                status: 'Mismatch',
              });
            }
          }
        }
      });
    }

    // Compare checkValueSum.exit with sumExits
    for (const key in checkValueSum.exit) {
      // if (!isMatch(key, 'Capacity Daily Booking (MMBTU/d)')) {
      if (key.includes('Hour')) {
        continue;
      }
      checkValueSum.exit[key].forEach((exitItem) => {
        let { key: exitKey, sum: calculatedSum, headerKey } = exitItem;
        const expectedSum = Number(sumExits[exitKey]?.replace(/,/g, '')) || 0;

        if (String(calculatedSum) !== String(expectedSum)) {
          if (String(calculatedSum.toFixed(3)) !== String(expectedSum)) {
            const diff = Math.abs(calculatedSum - expectedSum);
            if (diff > 0.001 + Number.EPSILON) {
              exitCompareNotMatch.push({
                headerKey, // This will be the date, such as "01/11/2024"
                key: exitKey,
                description: key,
                calculatedSum: calculatedSum,
                expectedSum,
                status: 'Mismatch',
              });
            }
          }
        }
      });
    }

    // for (const key of [
    //   'Capacity Daily Booking (MMBTU/d)',
    //   'Maximum Hour Booking (MMBTU/h)',
    // ]) {
    //   checkValueSum.entry[key].forEach((entryItem) => {
    //     const { key: entryKey, sum: entrySum, headerKey } = entryItem;
    //     const exitItem = checkValueSum.exit[key].find(
    //       (exit) => exit.key === entryKey,
    //     );

    //     if (exitItem) {
    //       const exitSum = exitItem.sum;
    //       if (entrySum !== exitSum) {
    //         compareEntryExit[key].push({
    //           description: key,
    //           headerKey, // This will be the date, such as "01/11/2024"
    //           key: entryKey,
    //           entrySum,
    //           exitSum,
    //           status: 'Mismatch',
    //         });
    //       }
    //     } else {
    //       compareEntryExit[key].push({
    //         description: key,
    //         headerKey,
    //         key: entryKey,
    //         entrySum,
    //         exitSum: null, // Indicate no matching exit sum found
    //         status: 'Mismatch (No Matching Exit)',
    //       });
    //     }
    //   });
    // }

    for (const key of ['Capacity Daily Booking (MMBTU/d)', 'Maximum Hour Booking (MMBTU/h)']) {
      checkValueSum.entry[key].forEach((entryItem) => {
        const { key: entryKey, headerKey } = entryItem;
        const entrySum = sumEntries[entryKey]
        const exitSum = sumExits[entryKey]

        if ((entrySum || entrySum == 0)) {
          if ((exitSum || exitSum == 0)) {
            if (entrySum !== exitSum) {
              compareEntryExit[key].push({
                description: key,
                headerKey, // This will be the date, such as "01/11/2024"
                key: entryKey,
                entrySum,
                exitSum,
                status: 'Mismatch',
              });
            }
          } else {
            compareEntryExit[key].push({
              description: key,
              headerKey,
              key: entryKey,
              entrySum,
              exitSum, // Indicate no matching exit sum found
              status: 'Mismatch (No Matching Exit)',
            });
          }
        }
      });
    }

    // for (const key of [
    //   'Capacity Daily Booking (MMBTU/d)',
    //   'Maximum Hour Booking (MMBTU/h)',
    // ]) {
    //   checkValueSum.entry[key].forEach((entryItem) => {
    //     const { key: entryKey, sum: entrySum, headerKey } = entryItem;
    //     const exitItem = checkValueSum.exit[key].find(
    //       (exit) => exit.key === entryKey,
    //     );

    //     if (exitItem) {
    //       const exitSum = exitItem.sum;
    //       if (entrySum !== exitSum) {
    //         compareEntryExit[key].push({
    //           description: key,
    //           headerKey, // This will be the date, such as "01/11/2024"
    //           key: entryKey,
    //           entrySum,
    //           exitSum,
    //           status: 'Mismatch',
    //         });
    //       }
    //     } else {
    //       // If no matching exit item found, consider it a mismatch
    //       compareEntryExit[key].push({
    //         description: key,
    //         headerKey,
    //         key: entryKey,
    //         entrySum,
    //         exitSum: null, // Indicate no matching exit sum found
    //         status: 'Mismatch (No Matching Exit)',
    //       });
    //     }
    //   });
    // }

    const keyEntryPoint = 0;
    const keyExitPoint = 0;
    const warningData = [];
    let notApproved = false;
    const newData = getTodayNowAdd7().format('YYYY/MM/DD HH:mm');

    let dEntryA: any = null;
    let dExitA: any = null;

    const keyEntryFrom = resultTranform?.['headerEntry']?.['Period']?.['From']?.['key'];
    const keyEntryTo = resultTranform?.['headerEntry']?.['Period']?.['To']?.['key'];
    const keyExitFrom = resultTranform?.['headerExit']?.['Period']?.['From']?.['key'];
    const keyExitTo = resultTranform?.['headerExit']?.['Period']?.['To']?.['key'];

    const dateStartAll: any = [];
    const dateEndAll: any = [];

    const modeDayAndMonth = bookingTemplate?.term_type_id === 4 ? 1 : 2;

    // let resultContractCode: any;
    // if (contractCode.includes('_Amd')) {
    //   const match = contractCode.match(/(.*)(_Amd.*)/);
    //   resultContractCode = [match[1], match[2]];
    // } else {
    //   resultContractCode = [contractCode];
    // }
    // let contract_code = resultContractCode[0];
    let contract_code = contractCode;

    const checkContractCode = await this.prisma.contract_code.findFirst({
      select: {
        id: true,
        contract_code: true,
        contract_start_date: true,
        status_capacity_request_management: true,
        file_period_mode: true,
        fixdayday: true,
        todayday: true,
        group: {
          select: {
            name: true,
            id_name: true,
          },
        },
        term_type_id: true,
      },
      where: {
        contract_code: contract_code,
      },
    });
    if (checkContractCode) {
      // ck type
      if (checkContractCode?.term_type_id !== typeOfContractText) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error:
              'The Contract Code has been applied across different Contract types',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    function parseNumericStrict(v: unknown, ctx: { capacityKey: string; dateKey: string; ePointName: string; stamp: string }) {
      // รับ number ตรง ๆ
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Invalid number (NaN/Infinity) for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }
        return v;
      }

      // รับ string ที่มี comma ได้ เช่น "1,000.000"
      if (typeof v === 'string') {
        const s = v.trim();
        // if (s === '') {
        //   throw new HttpException({
        //     status: HttpStatus.BAD_REQUEST,
        //     error: `Empty value for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
        //   }, HttpStatus.BAD_REQUEST);
        // }

        const cleaned = s.replace(/,/g, ''); // ตัด comma ออก
        // เคร่งครัด: อนุญาตเครื่องหมาย +/-, เลข, จุดทศนิยมครั้งเดียว
        if (!/^[-+]?\d*(\.\d+)?$/.test(cleaned)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Non-numeric value "${v}" for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }

        const n = Number(cleaned);
        if (!Number.isFinite(n)) {
          throw new HttpException({
            status: HttpStatus.BAD_REQUEST,
            error: `Invalid number "${v}" for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
          }, HttpStatus.BAD_REQUEST);
        }
        return n;
      }

      // ชนิดอื่น ๆ ไม่รับ
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        error: `Unsupported type for ${ctx.capacityKey} at [Date: ${ctx.dateKey}] in ${ctx.ePointName} ${ctx.stamp}`,
      }, HttpStatus.BAD_REQUEST);
    }

    const newEntry = await Promise.all(
      entryValue.map(async (e: any, i: any) => {
        let entryPointName = e[keyEntryPoint];

        if (String(process.env.IS_CONTRACT_POINT_BY_SHIPPER).toLowerCase() === "true" && shipperData?.name) {
          const hasCheck = e[keyEntryPoint].endsWith(`-${shipperData?.name}`)
          entryPointName = hasCheck ? e[keyEntryPoint] : e[keyEntryPoint] + `-${shipperData?.name}`;
        }

        let newStartDayPlus = dayjs(todayStart);
        let useStart = dayjs(e[keyEntryFrom], 'DD/MM/YYYY');
        const useEnd = dayjs(e[keyEntryTo], 'DD/MM/YYYY');

        if (!useStart.isValid() || !useEnd.isValid()) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Missing Period From or Period To value.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        let isCheckMoreDate = useStart.isAfter(newStartDayPlus);
        let checkMinMax = false;
        // if (!isCheckMoreDate) { // kom ปิดเพื่อเทส upload
        //   throw new HttpException(
        //     {
        //       status: HttpStatus.BAD_REQUEST,
        //       error:
        //         'Period From date in the template must be later than today.',
        //     },
        //     HttpStatus.BAD_REQUEST,
        //   );
        // }

        if (useStart.isSameOrAfter(useEnd)) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: "The 'Period To' date must not be earlier than the 'Period From' date.",
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        checkMinMax = this.capacityMiddleService.checkDateRange(
          e[keyEntryFrom],
          e[keyEntryTo],
          // modeDayAndMonth,
          bookingTemplate?.file_period_mode,
          bookingTemplate?.min,
          bookingTemplate?.max,
        );

        // if (!checkMinMax) {
        //   throw new HttpException(
        //     {
        //       status: HttpStatus.BAD_REQUEST,
        //       error: 'Date is NOT match',
        //     },
        //     HttpStatus.BAD_REQUEST,
        //   );
        // }

        const headerEntryDate = resultTranform?.['headerEntry'];
        const keysGreaterThanEntryTo = Object.keys(e).filter(
          (key) => Number(key) > Number(keyEntryTo),
        );


        for (let is = 0; is < keysGreaterThanEntryTo.length; is++) {
          if (headerEntryDate) {
            Object.keys(headerEntryDate).forEach((capacityKey) => {
              const capacityDates = headerEntryDate[capacityKey];
              Object.keys(capacityDates).forEach((dateKey) => {
                const keyValue = capacityDates[dateKey]?.['key'];
                if (keysGreaterThanEntryTo[is] === keyValue) {
                  dateStartAll.push(e[keyEntryFrom]);
                  dateEndAll.push(e[keyEntryTo]);

                  const isInRangeZero = dayjs(dateKey, 'DD/MM/YYYY').isBetween(
                    dayjs(e[keyEntryFrom], 'DD/MM/YYYY'),
                    dayjs(e[keyEntryTo], 'DD/MM/YYYY'),
                    'month',
                    '[]',
                  );

                  // if (
                  //   modeDayAndMonth === 2 &&
                  //   dayjs(dateKey, 'DD/MM/YYYY').format('DD') !== '01'
                  // ) {
                  //   throw new HttpException(
                  //     {
                  //       status: HttpStatus.BAD_REQUEST,
                  //       error: 'Date is NOT match',
                  //     },
                  //     HttpStatus.BAD_REQUEST,
                  //   );
                  // }

                  if (!isInRangeZero || e[keyValue] < 0) {
                    throw new HttpException(
                      {
                        status: HttpStatus.BAD_REQUEST,
                        error: 'Date is NOT match.',
                      },
                      HttpStatus.BAD_REQUEST,
                    );
                  }

                  const s = String(e[keyValue]).trim();
                  if (s === '') {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${entryPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  const checkNoNum = parseNumericStrict(e[keyValue], {
                    capacityKey,
                    dateKey,
                    ePointName: entryPointName,
                    stamp: dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm'),
                  });


                  if (Number(e[keyValue]) === 0) {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${entryPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  if (!dEntryA) {
                    dEntryA = {};
                  }

                  if (!dEntryA[i]) {
                    dEntryA[i] = {
                      start: e[keyEntryFrom],
                      end: e[keyEntryTo],
                      date: { [capacityKey]: [] },
                    };
                  }

                  dEntryA = {
                    ...dEntryA,
                    [i]: {
                      start: e[keyEntryFrom],
                      end: e[keyEntryTo],
                      date: {
                        ...dEntryA[i]['date'],
                        [capacityKey]: [
                          ...(dEntryA[i]['date'][capacityKey] || []),
                          dateKey,
                        ],
                      },
                    },
                  };
                }
              });
            });
          }
        }

        const getContractPointByName =
          await this.capacityMiddleService.getContractPointByName(
            entryPointName,
            getGroupByName?.id || null,
          );

        if (!!!getContractPointByName) {
          notApproved = true;
          warningData.push(
            `Entry Point: ${entryPointName} not match system ${newData}`,
          );
        } else {
          const findCPS = contractPointSp.find((fCPS: any) => {
            return fCPS?.contract_point === entryPointName;
          });
          if (findCPS?.entry_exit_id === 2) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Contract Point is NOT match.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
          if (!!!findCPS) {
            typeSuccess = 2;
            notApproved = true;
            warningData.push(
              `Entry Point: ${entryPointName} not match system ${newData}`,
            );
          }
        }

        const contractPoints = await this.prisma.contract_point.findFirst({
          where: {
            contract_point: entryPointName,
            entry_exit_id: 1,
            //
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
            area: true,
            zone: true,
          },
        });
        if (!contractPoints) {
          contractPointFlag = true
        }

        if (!entryPointName) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error:
                'Contract Point cannot be blank.', // https://app.clickup.com/t/86ev67nfc
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        return {
          data: e,
          contract_point: entryPointName,
          area: contractPoints?.area?.name || null,
          zone: contractPoints?.zone?.name || null,
          contractPointName: entryPointName || null,
        };
      }),
    );

    const newExit = await Promise.all(
      exitValue.map(async (e: any, i: any) => {
        let exitPointName = e[keyExitPoint]

        if (String(process.env.IS_CONTRACT_POINT_BY_SHIPPER).toLowerCase() === "true" && shipperData?.name) {
          const hasCheck = e[keyExitPoint].endsWith(`-${shipperData?.name}`)
          exitPointName = hasCheck ? e[keyExitPoint] : e[keyExitPoint] + `-${shipperData?.name}`;
        }

        let newStartDayPlus = dayjs(todayStart);
        let useStart = dayjs(e[keyExitFrom], 'DD/MM/YYYY');
        const useEnd = dayjs(e[keyExitTo], 'DD/MM/YYYY');

        if (!useStart.isValid() || !useEnd.isValid()) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Missing Period From or Period To value.',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        let isCheckMoreDate = useStart.isAfter(newStartDayPlus);
        let checkMinMax = false;

        // if (!isCheckMoreDate) {  // kom ปิดเพื่อเทส upload
        //   throw new HttpException(
        //     {
        //       status: HttpStatus.BAD_REQUEST,
        //       error:
        //         'Period From date in the template must be later than today.',
        //     },
        //     HttpStatus.BAD_REQUEST,
        //   );
        // }

        if (useStart.isSameOrAfter(useEnd)) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: "The 'Period To' date must not be earlier than the 'Period From' date.",
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        checkMinMax = this.capacityMiddleService.checkDateRange(
          e[keyExitFrom],
          e[keyExitTo],
          // modeDayAndMonth,
          bookingTemplate?.file_period_mode,
          bookingTemplate?.min,
          bookingTemplate?.max,
        );
        // if (!checkMinMax) {

        //   throw new HttpException(
        //     {
        //       status: HttpStatus.BAD_REQUEST,
        //       error: 'Date is NOT match',
        //     },
        //     HttpStatus.BAD_REQUEST,
        //   );
        // }

        const headerExitDate = resultTranform?.['headerExit'];
        const keysGreaterThanExitTo = Object.keys(e).filter(
          (key) => Number(key) > Number(keyExitTo),
        );
        for (let is = 0; is < keysGreaterThanExitTo.length; is++) {
          if (headerExitDate) {
            Object.keys(headerExitDate).forEach((capacityKey) => {
              const capacityDates = headerExitDate[capacityKey];
              Object.keys(capacityDates).forEach((dateKey) => {
                const keyValue = capacityDates[dateKey]?.['key'];
                if (keysGreaterThanExitTo[is] === keyValue) {
                  dateStartAll.push(e[keyEntryFrom]);
                  dateEndAll.push(e[keyEntryTo]);

                  const isInRangeZero = dayjs(dateKey, 'DD/MM/YYYY').isBetween(
                    dayjs(e[keyEntryFrom], 'DD/MM/YYYY'),
                    dayjs(e[keyEntryTo], 'DD/MM/YYYY'),
                    'month',
                    '[]',
                  );

                  // if (
                  //   modeDayAndMonth === 2 &&
                  //   dayjs(dateKey, 'DD/MM/YYYY').format('DD') !== '01'
                  // ) {
                  //   throw new HttpException(
                  //     {
                  //       status: HttpStatus.BAD_REQUEST,
                  //       error: 'Date is NOT match',
                  //     },
                  //     HttpStatus.BAD_REQUEST,
                  //   );
                  // }

                  const s = String(e[keyValue]).trim();
                  if (s === '') {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${exitPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  const checkNoNum = parseNumericStrict(e[keyValue], {
                    capacityKey,
                    dateKey,
                    ePointName: exitPointName,
                    stamp: dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm'),
                  });

                  if (Number(e[keyValue]) === 0) {
                    warningData.push(
                      `${capacityKey} for [Date : ${dateKey}] is ${this.textNull_(e[keyValue])} at ${exitPointName} ${dayjs(newData, 'YYYY/MM/DD HH:mm').format('DD/MM/YYYY HH:mm')}`,
                    );
                  }

                  if (!dExitA) {
                    dExitA = {};
                  }

                  if (!dExitA[i]) {
                    dExitA[i] = {
                      start: e[keyExitFrom],
                      end: e[keyExitTo],
                      date: { [capacityKey]: [] },
                    };
                  }

                  dExitA = {
                    ...dExitA,
                    [i]: {
                      start: e[keyExitFrom],
                      end: e[keyExitTo],
                      date: {
                        ...dExitA[i]['date'],
                        [capacityKey]: [
                          ...(dExitA[i]['date'][capacityKey] || []),
                          dateKey,
                        ],
                      },
                    },
                  };
                }
              });
            });
          }
        }

        const getContractPointByName =
          await this.capacityMiddleService.getContractPointByName(
            exitPointName,
            getGroupByName?.id || null,
          );
        if (!!!getContractPointByName) {
          notApproved = true;
          warningData.push(
            `Exit Point: ${exitPointName} not match system ${newData}`,
          );
        } else {
          const findCPS = contractPointSp.find((fCPS: any) => {
            return fCPS?.contract_point === exitPointName;
          });
          if (findCPS?.entry_exit_id === 1) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Contract Point is NOT match.',
              },
              HttpStatus.BAD_REQUEST,
            );
          }
          if (!!!findCPS) {
            typeSuccess = 2;
            notApproved = true;
            warningData.push(
              `Exit Point: ${exitPointName} not match system ${newData}`,
            );
          }
        }

        const contractPoints = await this.prisma.contract_point.findFirst({
          where: {
            contract_point: exitPointName,
            entry_exit_id: 2,
            //
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
            area: true,
            zone: true,
          },
        });

        if (!contractPoints) {
          contractPointFlag = true
        }

        if (!exitPointName) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error:
                'Contract Point cannot be blank.', // https://app.clickup.com/t/86ev67nfc
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        return {
          data: e,
          contract_point: exitPointName,
          area: contractPoints?.area?.name || null,
          zone: contractPoints?.zone?.name || null,
          contractPointName: exitPointName || null,
        };
      }),
    );


    const minDate = dateStartAll.reduce((min, current) => {
      return dayjs(current, 'DD/MM/YYYY').isBefore(dayjs(min, 'DD/MM/YYYY'))
        ? current
        : min;
    }, dateStartAll[0]);
    const maxDate = dateEndAll.reduce((max, current) => {
      return dayjs(current, 'DD/MM/YYYY').isAfter(dayjs(max, 'DD/MM/YYYY'))
        ? current
        : max;
    }, dateEndAll[0]);

    // const contractStartDate = getTodayNowAdd7(data?.contractStartDate);
    // const contractEndDate = getTodayNowAdd7(data?.contractEndDate);

    // if(!dayjs(minDate, 'DD/MM/YYYY').isSame(contractStartDate, 'day')){
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Period Capacity Right is NOT Match with contractStartDate',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    // if(!dayjs(maxDate, 'DD/MM/YYYY').isSame(contractEndDate, 'day')){
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Period Capacity Right is NOT Match with contractEndDate',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    if (checkContractCode) {
      // มี
      if (shipperIdName ? shipperIdName !== checkContractCode?.group?.id_name : shipperName !== checkContractCode?.group?.name) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            // error: `ไม่สามารถใช้ Contract Code: ${contractCode} ถูกใช้งานแล้ว`,
            error: 'Shipper Name Is NOT MATCH',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (typeOfContractText !== checkContractCode?.term_type_id) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Term Type ไม่เหมือนของเดิม',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      const dEntryArray = Object.values(dEntryA);
      for (let i = 0; i < dEntryArray.length; i++) {
        const calcCheckEntry =
          await this.capacityMiddleService.validateDateEntries(
            dEntryArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );

        const objCalcEntry =
          this.capacityMiddleService.extractValidationResults(
            calcCheckEntry?.date,
          );
        const findCalcEntry = objCalcEntry.filter((f: any) => {
          return f === false;
        });

        if (findCalcEntry.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Period Capacity Right is NOT Match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      const dExitArray = Object.values(dExitA);
      for (let i = 0; i < dExitArray.length; i++) {
        const calcCheckExit =
          await this.capacityMiddleService.validateDateEntries(
            dExitArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcExit = this.capacityMiddleService.extractValidationResults(
          calcCheckExit?.date,
        );
        const findCalcExit = objCalcExit.filter((f: any) => {
          return f === false;
        });
        if (findCalcExit.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'format date Exit มีวันที่/จำนวนไม่ถูกต้อง',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    } else {
      if (!!!dEntryA || !!!dExitA) {
        // https://app.clickup.com/t/86eujxj3q
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'The Capacity Booking must be defined.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const dEntryArray = Object.values(dEntryA);
      for (let i = 0; i < dEntryArray.length; i++) {
        const calcCheckEntry =
          await this.capacityMiddleService.validateDateEntries(
            dEntryArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcEntry =
          this.capacityMiddleService.extractValidationResults(
            calcCheckEntry?.date,
          );
        const findCalcEntry = objCalcEntry.filter((f: any) => {
          return f === false;
        });

        if (findCalcEntry.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Period Capacity Right is NOT Match',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
      const dExitArray = Object.values(dExitA);
      for (let i = 0; i < dExitArray.length; i++) {
        const calcCheckExit =
          await this.capacityMiddleService.validateDateEntries(
            dExitArray[i],
            // bookingTemplate?.file_period_mode,
            modeDayAndMonth,
            bookingTemplate?.fixdayday,
            bookingTemplate?.todayday,
            minDate,
            maxDate,
          );
        const objCalcExit = this.capacityMiddleService.extractValidationResults(
          calcCheckExit?.date,
        );
        const findCalcExit = objCalcExit.filter((f: any) => {
          return f === false;
        });
        if (findCalcExit.length > 0) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'format date Exit มีวันที่/จำนวนไม่ถูกต้อง',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }

    if (entryCompareNotMatch.length > 0) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Entry is NOT match.',
          data: entryCompareNotMatch,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (exitCompareNotMatch.length > 0) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Exit is NOT match.',
          data: exitCompareNotMatch,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (compareEntryExit['Capacity Daily Booking (MMBTU/d)'].length > 0 || compareEntryExit['Maximum Hour Booking (MMBTU/h)'].length > 0) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Total Entry & Total Exit is NOT match.',
          data: compareEntryExit,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const checkContractCodeCheckLast = !!checkContractCode?.id
      ? await this.prisma.contract_code.findFirst({
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
          contract_code: true
        },
        where: {
          ref_contract_code_by_main_id: checkContractCode?.id,
        },
        orderBy: {
          id: 'desc',
        },
      })
      : null;

    if (checkContractCodeCheckLast?.status_capacity_request_management_process_id === 4 || checkContractCodeCheckLast?.status_capacity_request_management_id === 5) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code End | Terminate',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let newCreate = false;
    let versionFlag = false;

    const nowDate = getTodayNowAdd7().toDate();

    const hasContractStarted = dayjs(nowDate).isAfter(dayjs(checkContractCodeCheckLast?.contract_start_date)) || dayjs(nowDate).isSame(dayjs(checkContractCodeCheckLast?.contract_start_date));
    if (hasContractStarted && checkContractCodeCheckLast?.status_capacity_request_management_id === 2) {
      // ขึ้น _Amd01++ แบบปกติ
      versionFlag = true;
    } else if (!hasContractStarted && checkContractCodeCheckLast?.status_capacity_request_management_id === 2) {
      versionFlag = true;
    } else {
      if (checkContractCodeCheckLast) {
        versionFlag = true;
      } else {
        newCreate = true;
      }
    }

    const shipperWhere = shipperIdName ? { id_name: shipperIdName } : { name: shipperName }
    const shipperId = await this.prisma.group.findFirst({
      select: {
        id: true,
        user_type_id: true,
      },
      where: shipperWhere,
    });
    const ckUserType = await this.prisma.user_type.findFirst({
      where: {
        group: {
          some: {
            account_manage: {
              some: {
                account_id: Number(userId),
              },
            },
          },
        },
      },
    });

    let idTemp = null;
    let tyTmp = null;

    // const ckAreaDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.area);
    // const hasDuplicate = new Set(ckAreaDup).size !== ckAreaDup.length;

    // const ckAreaDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.area)?.filter((v: any) => v !== null && v !== undefined);

    // const hasDuplicate = new Set(ckAreaDup).size !== ckAreaDup.length;
    // if (hasDuplicate) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Duplicate Contract Point found.',
    //       // error: 'Area is Contract Point Duplicate.',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    const ckAreaDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.area)?.filter((v: any) => v !== null && v !== undefined);
    const hasDuplicate = new Set(ckAreaDup).size !== ckAreaDup.length;

    const ckPointDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.contract_point)?.filter((v: any) => v !== null && v !== undefined);
    const hasDuplicatePoint = new Set(ckPointDup).size !== ckPointDup.length;

    if (hasDuplicatePoint) {
      let ctPoint = []
      for (let i_ = 0; i_ < ckPointDup.length; i_++) {
        const contractPoint = await this.prisma.contract_point.findFirst({
          where:{
            contract_point: ckPointDup?.[i_]
          },
          select:{ contract_point:true },
        })
        if(!contractPoint){
          ctPoint.push(ckPointDup?.[i_])
        }
      }
      if(ctPoint?.length > 0){
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `${ctPoint?.join(", ")} is not exit in TPA System`, // https://app.clickup.com/t/9018502823/86ey937n6
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Duplicate Contract Point found.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (hasDuplicate) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Only one Contract Point is allowed per Area.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }


    let statusCapacityRequestManagementId = 2;
    let newTerminateDate = null;
    // if (
    //   isMatch(data?.active, "Active") ||
    //   isMatch(data?.active, "Waiting Contract") ||
    //   isMatch(data?.active, "Send Contract")
    // ) {
    //   statusCapacityRequestManagementId = 4 // Confirmed
    // }
    // else if (isMatch(data?.active, "Completed")) {
    //   statusCapacityRequestManagementId = 2 // Approved
    // }
    if (
      isMatch(data?.active, "Active") ||
      isMatch(data?.active, "Waiting Contract") ||
      isMatch(data?.active, "Send Contract") ||
      isMatch(data?.active, "Completed")
    ) {
      statusCapacityRequestManagementId = 2 // Approved
    }
    else if (isMatch(data?.active, "Inactive")) {
      if (checkContractCodeCheckLast?.status_capacity_request_management_id == 5 || checkContractCodeCheckLast?.status_capacity_request_management_id == 3) {
        statusCapacityRequestManagementId = checkContractCodeCheckLast?.status_capacity_request_management_id
      }
      else {
        if (checkContractCodeCheckLast?.contract_start_date > new Date()) {
          statusCapacityRequestManagementId = 5 //Terminated
          newTerminateDate = getTodayStartAdd7().toDate()
        }
        else {
          statusCapacityRequestManagementId = 3 // Rejected
        }
      }
    }


    // เพิ่มเงื่อนไข contract point ไม่มีใน dam ไม่ให้ approved
    // if (newCreate || refContractNo){

    // }else{

    // }
    // Duplicate Contract Point found.

    if (newCreate || (refContractNo && checkContractCodeCheckLast?.contract_code != contract_code)) {
      let ckContract = null
      if (refContractNo) {
        ckContract = await this.prisma.contract_code.findFirst({
          where: {
            contract_code: refContractNo
          },
        })
        if (!!ckContract) {
          const ckContractOld = await this.prisma.contract_code.findFirst({
            where: {
              contract_code: contract_code
            },
          })
          if (ckContractOld) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Contract Code Name Have System`,
              },
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        if (!!ckContract && ckContract?.status_capacity_request_management_id !== 2) {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: `Contract Code Ref Status Not Approved`,
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const shadowPeriod = this.capacityMiddleService.genMD(
        minDate,
        dayjs(maxDate, 'DD/MM/YYYY').subtract(1, 'day').format('DD/MM/YYYY'),
        modeDayAndMonth,
      );

      const createContractCode = await this.prisma.contract_code.create({
        data: {
          contract_code: contract_code,
          ...(!!typeOfContractText && {
            term_type: {
              connect: {
                id: typeOfContractText,
              },
            },
          }),
          ...(!!shipperId?.id && {
            group: {
              connect: {
                id: shipperId?.id,
              },
            },
          }),
          status_capacity_request_management_process: {
            connect: {
              id: 3,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: 1,
            },
          },
          type_account: {
            connect: {
              id: 3,
            },
          },
          ...(!!checkContractCodeCheckLast?.ref_contract_code_by_main_id && {
            ref_contract_code_by_main: {
              connect: {
                id: checkContractCodeCheckLast?.ref_contract_code_by_main_id,
              },
            },
          }),
          ...(!!checkContractCodeCheckLast?.id && {
            ref_contract_code_by: {
              connect: {
                id: checkContractCodeCheckLast?.id,
              },
            },
          }),
          // shadow_period: bookingTemplate?.shadow_period,
          shadow_period: (!!shadowPeriod && Number(shadowPeriod)) || null,
          shadow_time: bookingTemplate?.shadow_time,
          file_period_mode: bookingTemplate?.file_period_mode,
          fixdayday: bookingTemplate?.fixdayday,
          todayday: bookingTemplate?.todayday,
          contract_start_date: minDate
            ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
            : null,
          contract_end_date: maxDate
            ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
            : null,
          submitted_timestamp: getTodayNowAdd7().toDate(),
          // create_date: getTodayNowAdd7().toDate(),
          // create_date_num: getTodayNowAdd7().unix(),
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        },
      });
      idTemp = createContractCode?.id;
      tyTmp = 'created';
      await this.prisma.contract_code.update({
        where: {
          id: createContractCode?.id ?? -1,
        },
        data: {
          ref_contract_code_by_main_id: createContractCode?.id,
        },
      });

      const versId = await this.prisma.booking_version.create({
        data: {
          version: `v.1`,
          ...(!!createContractCode?.id && {
            contract_code: {
              connect: {
                id: createContractCode?.id,
              },
            },
          }),
          flag_use: true,
          // create_date: getTodayNowAdd7().toDate(),
          // create_date_num: getTodayNowAdd7().unix(),
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
          submitted_timestamp: getTodayNowAdd7().toDate(),
          type_account: {
            connect: {
              id: 3,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: 1,
            },
          },
          contract_start_date: minDate
            ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
            : null,
          contract_end_date: maxDate
            ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
            : null,
        },
      });

      await this.prisma.booking_full_json.create({
        data: {
          ...(!!versId?.id && {
            booking_version: {
              connect: {
                id: versId?.id,
              },
            },
          }),
          data_temp: JSON.stringify(resultTranform),
          // create_date: getTodayNowAdd7().toDate(),
          // create_date_num: getTodayNowAdd7().unix(),
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        },
      });

      let mapDataRowJson = [];
      for (let i = 0; i < newEntry.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 1,

          zone_text: newEntry[i]?.zone,
          area_text: newEntry[i]?.area,
          contract_point: newEntry[i]?.contract_point,
          flag_use: true,
          data_temp: JSON.stringify(newEntry[i]?.data),
          // create_by: Number(userId),
          // create_date: getTodayNowAdd7().toDate(),
          // create_date_num: getTodayNowAdd7().unix(),
        });
      }
      for (let i = 0; i < newExit.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 2,

          zone_text: newExit[i]?.zone,
          area_text: newExit[i]?.area,
          contract_point: newExit[i]?.contract_point,
          flag_use: true,
          data_temp: JSON.stringify(newExit[i]?.data),
          // create_by: Number(userId),
          // create_date: getTodayNowAdd7().toDate(),
          // create_date_num: getTodayNowAdd7().unix(),
        });
      }

      await this.prisma.booking_row_json.createMany({
        data: mapDataRowJson,
      });

      await this.prisma.submission_comment_capacity_request_management.createMany(
        {
          data: (warningData || []).map((ew: any) => {
            return {
              remark: ew,
              contract_code_id: createContractCode?.id,
              // create_by: Number(userId),
              // create_date: getTodayNowAdd7().toDate(),
              // create_date_num: getTodayNowAdd7().unix(),
            };
          }),
        },
      );

      // const responseUpFile = await uploadFilsTemp(file);
      // await this.capacityMiddleService.fileCapacityBooking(
      //   responseUpFile?.file?.url,
      //   createContractCode?.id,
      //   userId,
      // );
      // warningData.length <= 0
      // เช็ค contract point ผิด/ไม่ถูกไม่ให้ tso เปลี่ยนเป็น approved
      if (typeSuccess === 1) {

        // RefContractNo เช็คว่ามีในระบบไหม ถ้ามีให้ terminate ไม่มีปล่อยผ่าน
        if (refContractNo) {
          try {
            if (ckContract?.status_capacity_request_management_id === 2) {
              await this.updateStatusCapacityRequestManagement(
                ckContract?.id,
                {
                  status_capacity_request_management_id: 5,
                  terminate_date: newTerminateDate
                    ? newTerminateDate
                    : minDate
                      ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
                      : getTodayStartAdd7().toDate(), // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
                  // shadow_time: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                  // shadow_period: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                  // reject_reasons: null, //"comment.." //status_capacity_request_management_id 3 ต้องมี ไม่ 3 ให้ null
                },
                userId,
                null,
                true,
              );
            }

          } catch (error) {
            console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
          }
        }

        // เพิ่มเงื่อนไข contract point ไม่มีใน dam ไม่ให้ approved
        try {
          if (callBackForApprove != undefined) {
            callBackForApprove({
              id: createContractCode?.id,
              payload: {
                status_capacity_request_management_id: statusCapacityRequestManagementId, //2,
                terminate_date: null, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
              },
              userId: userId,
              req: null,
              isRestorePreviousVersionValue: false,
            })
          }
          else {
            await this.updateStatusCapacityRequestManagement(
              createContractCode?.id,
              {
                status_capacity_request_management_id: statusCapacityRequestManagementId, //2,
                terminate_date: null, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
              },
              userId,
              null,
            );
          }
        } catch (error) {
          console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
        }
      }
    } else {
      const hasContractStarted_ = dayjs(dayjs(checkContractCodeCheckLast?.contract_start_date)).isAfter(nowDate);
      if (!hasContractStarted_) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Contract Code Start | RefContractNo Not Empty',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (versionFlag) {
        const shadowPeriod = this.capacityMiddleService.genMD(
          minDate,
          dayjs(maxDate, 'DD/MM/YYYY').subtract(1, 'day').format('DD/MM/YYYY'),
          modeDayAndMonth,
        );
        await this.prisma.contract_code.update({
          where: {
            id: checkContractCodeCheckLast?.id ?? -1,
          },
          data: {
            ...(!!checkContractCodeCheckLast?.status_capacity_request_management_id && {
              status_capacity_request_management: {
                connect: {
                  id: 1,
                  // checkContractCodeCheckLast?.status_capacity_request_management_id ===
                  // 3
                  //   ? 1
                  //   : checkContractCodeCheckLast?.status_capacity_request_management_id,
                },
              },
            }),
            ...(!!checkContractCodeCheckLast?.status_capacity_request_management_id && {
              status_capacity_request_management_process: {
                connect: {
                  id: 3,
                  // checkContractCodeCheckLast?.status_capacity_request_management_id ===
                  // 3
                  //   ? 3
                  //   : checkContractCodeCheckLast?.status_capacity_request_management_process_id,
                },
              },
            }),

            file_period_mode: bookingTemplate?.file_period_mode,
            fixdayday: bookingTemplate?.fixdayday,
            todayday: bookingTemplate?.todayday,
            contract_start_date: minDate
              ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
              : null,
            contract_end_date: maxDate
              ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
              : null,
            submitted_timestamp: getTodayNowAdd7().toDate(),
            // update_date: getTodayNowAdd7().toDate(),
            // update_date_num: getTodayNowAdd7().unix(),
            // update_by_account: {
            //   connect: {
            //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            //   },
            // },
            shadow_period: !!shadowPeriod ? Number(shadowPeriod) : 0,
          },
        });

        idTemp = checkContractCodeCheckLast?.id;
        tyTmp = 'version';

        await this.prisma.booking_version.updateMany({
          where: {
            contract_code_id: checkContractCodeCheckLast?.id ?? -1,
          },
          data: {
            flag_use: false,
          },
        });

        const checkContractCodeCheckLength =
          await this.prisma.booking_version.count({
            where: {
              contract_code_id: checkContractCodeCheckLast?.id,
            },
          });

        const versId = await this.prisma.booking_version.create({
          data: {
            version: `v.${checkContractCodeCheckLength + 1}`,
            ...(!!checkContractCodeCheckLast?.id && {
              contract_code: {
                connect: {
                  id: checkContractCodeCheckLast?.id,
                },
              },
            }),
            flag_use: true,
            // create_date: getTodayNowAdd7().toDate(),
            // create_date_num: getTodayNowAdd7().unix(),
            // create_by_account: {
            //   connect: {
            //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            //   },
            // },
            submitted_timestamp: getTodayNowAdd7().toDate(),
            type_account: {
              connect: {
                id: 3,
              },
            },
            ...(!!checkContractCodeCheckLast?.status_capacity_request_management_id && {
              status_capacity_request_management: {
                connect: {
                  id:
                    checkContractCodeCheckLast?.status_capacity_request_management_id ===
                      3
                      ? 1
                      : (checkContractCodeCheckLast?.status_capacity_request_management_id == 2 || checkContractCodeCheckLast?.status_capacity_request_management_id == 4) &&
                        ((ckUserType?.id != 1 && ckUserType?.id != 2) ||
                          notApproved ||
                          typeSuccess !== 1)
                        ? 1
                        : checkContractCodeCheckLast?.status_capacity_request_management_id,
                },
              },
            }),
            contract_start_date: minDate
              ? getTodayNowDDMMYYYYDfaultAdd7(minDate).toDate()
              : null,
            contract_end_date: maxDate
              ? getTodayNowDDMMYYYYDfaultAdd7(maxDate).toDate()
              : null,
          },
        });

        await this.prisma.booking_full_json.create({
          data: {
            ...(!!versId?.id && {
              booking_version: {
                connect: {
                  id: versId?.id,
                },
              },
            }),
            data_temp: JSON.stringify(resultTranform),
            // create_date: getTodayNowAdd7().toDate(),
            // create_date_num: getTodayNowAdd7().unix(),
            // create_by_account: {
            //   connect: {
            //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            //   },
            // },
          },
        });

        let mapDataRowJson = [];
        for (let i = 0; i < newEntry.length; i++) {
          mapDataRowJson.push({
            booking_version_id: versId?.id,
            entry_exit_id: 1,

            zone_text: newEntry[i]?.zone,
            area_text: newEntry[i]?.area,
            contract_point: newEntry[i]?.contract_point,
            flag_use: true,
            data_temp: JSON.stringify(newEntry[i]?.data),
            // create_by: Number(userId),
            // create_date: getTodayNowAdd7().toDate(),
            // create_date_num: getTodayNowAdd7().unix(),
          });
        }

        for (let i = 0; i < newExit.length; i++) {
          mapDataRowJson.push({
            booking_version_id: versId?.id,
            entry_exit_id: 2,

            zone_text: newExit[i]?.zone,
            area_text: newExit[i]?.area,
            contract_point: newExit[i]?.contract_point,
            flag_use: true,
            data_temp: JSON.stringify(newExit[i]?.data),
            // create_by: Number(userId),
            // create_date: getTodayNowAdd7().toDate(),
            // create_date_num: getTodayNowAdd7().unix(),
          });
        }

        await this.prisma.booking_row_json.createMany({
          data: mapDataRowJson,
        });

        await this.prisma.submission_comment_capacity_request_management.createMany(
          {
            data: (warningData || []).map((ew: any) => {
              return {
                remark: ew,
                contract_code_id: checkContractCodeCheckLast?.id,
                // create_date: getTodayNowAdd7().toDate(),
                // create_by: Number(userId),
                // create_date_num: getTodayNowAdd7().unix(),
              };
            }),
          },
        );

        // const responseUpFile = await uploadFilsTemp(file);
        // await this.capacityMiddleService.fileCapacityBooking(
        //   responseUpFile?.file?.url,
        //   checkContractCodeCheckLast?.id,
        //   userId,
        // );

        // เพิ่มเงื่อนไข contract point ไม่มีใน dam ไม่ให้ approved
        if (typeSuccess === 1) {
          try {
            if (callBackForApprove != undefined) {
              callBackForApprove({
                id: checkContractCodeCheckLast?.id,
                payload: {
                  status_capacity_request_management_id: statusCapacityRequestManagementId, // 2,
                  terminate_date: newTerminateDate, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
                  // shadow_time: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                  // shadow_period: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                  // reject_reasons: null, //"comment.." //status_capacity_request_management_id 3 ต้องมี ไม่ 3 ให้ null
                },
                userId: userId,
                req: null,
                isRestorePreviousVersionValue: true,
              })
            }
            else {
              await this.updateStatusCapacityRequestManagement(
                checkContractCodeCheckLast?.id,
                {
                  status_capacity_request_management_id: statusCapacityRequestManagementId, // 2,
                  terminate_date: newTerminateDate, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
                  // shadow_time: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                  // shadow_period: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
                  // reject_reasons: null, //"comment.." //status_capacity_request_management_id 3 ต้องมี ไม่ 3 ให้ null
                },
                userId,
                null,
                true,
              );
            }
          } catch (error) {
            console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
          }
        }
      } else {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'error เงื่อนไข',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return {
      id: idTemp,
      event: tyTmp,
      type: warningData?.length > 0 ? 2 : typeSuccess,
      warningData: warningData,
      remarkWarningData: `warningData.length > 0 คือมี warning`,
      message:
        warningData?.length > 0 ? `Blank Or 0 value detected in the template.` :
          typeSuccess === 1
            ? 'Success.'
            : 'Zone, Area or Contract point is NOT match.',
      remark: `type 1 = Success, 2 = Warning`,
    };
  }

  /**
   * Function หลักสำหรับ sync ข้อมูลจาก TPA Website (Shipper และ Contract)
   * ทำงานโดย:
   * 1. ขอ access token จาก TPA Website API
   * 2. ดึงข้อมูล Shipper ทั้งหมดจาก TPA Website
   * 3. ดึงข้อมูล Contract ทั้งหมดจาก TPA Website
   * 4. Sync ข้อมูลเข้าสู่ระบบ
   * 
   * @param userId - ID ของ user ที่ทำการ sync
   * @returns ข้อความสำเร็จหรือ throw error
   */
  async syncDataWithTPAWebsite(userId: any) {
    const authUrl = process.env.TPA_WEBSITE_SERVICE_AUTH ?? 'https://pttapi-dev.pttplc.com/oauth2';
    const urlContract = process.env.TPA_WEBSITE_SERVICE_CON ?? 'https://pttapigw-dev.pttplc.com/PTT_TPAWEB';

    try {
      // ขอ access token จาก TPA Website โดยใช้ Basic Auth (username/password เป็น base64)
      const body = new URLSearchParams({ grant_type: 'client_credentials' });

      const responseToken = await axios.post(
        `${authUrl}`,
        body,
        {
          auth: {
            username: process.env.TPA_WEBSITE_USERNAME ?? '5R7zJZt_VFmf0hIAqTU4ZRKFa1sa',
            password: process.env.TPA_WEBSITE_PASSWORD ?? 'y0xcNclXHmOAyIbtzfdHGOEeKb8a',
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // ถ้าได้ access token แล้ว ให้เริ่ม sync ข้อมูล
      if (responseToken?.data?.access_token) {
        // Sync Shipper ทั้งหมดจาก TPA Website (ไม่ระบุ query parameters = ดึงทั้งหมด)
        this.getShipperFromTPAWebsiteByQuery({
          userId: userId,
          accessToken: responseToken.data.access_token,
        })

        // ดึง Contract List ทั้งหมดจาก TPA Website
        // let page = 1;
        // let totalPage = 0;
        // let errorList: string[] = [];
        // let approveList: {
        //   id: any,
        //   payload: any,
        //   userId: any,
        //   req: any,
        //   isRestorePreviousVersionValue: boolean
        // }[] = [];
        // let totalSyncPage = 1;
        // do {

        //   const responseContactList = await axios.get(`${urlContract}?bookingNo&shipperCode&contractNo&termType&contractStartDate&contractEndDate&fromDate&toDate&pageNo=${page}`,
        //     // const responseContactList = await axios.get(`${url}/GetContractList`,
        //     {
        //       headers: {
        //         'Authorization': `Bearer ${responseToken.data.access_token}`,
        //       },
        //     }
        //   )

        //   if (totalPage == 0 && responseContactList?.data?.response?.pageCount) {
        //     totalPage = parseToNumber(responseContactList.data.response.pageCount) ?? 1;
        //   }

        //   // ถ้ามี contract ให้ sync เข้าสู่ระบบ
        //   if (responseContactList?.data?.contract && Array.isArray(responseContactList?.data?.contract)) {
        //     this.syncContractFromTPAWebsite({ contractList: responseContactList.data.contract, userId: userId, accessToken: responseToken.data.access_token }).then(result => {
        //       totalSyncPage++;
        //       if (result?.errorList && Array.isArray(result?.errorList)) {
        //         errorList.push(...result.errorList);
        //       }

        //       if (result?.approveList && Array.isArray(result?.approveList)) {
        //         approveList.push(...result.approveList);
        //       }

        //       if (totalSyncPage >= totalPage) {
        //         if (errorList.length > 0) {
        //           // ถ้ามี error ให้ส่ง notification ไปยัง in-app notification
        //           try {
        //             const message = errorList.join('\n');
        //             middleNotiInapp(
        //               this.prisma,
        //               'Capacity Management',
        //               message,
        //               50, // Capacity Contract Management menus_id
        //               1,
        //             );
        //           } catch (error) {

        //           }

        //         }

        //         if (approveList.length > 0) {
        //           this.approveSyncContractFromTPAWebsite(approveList);
        //         }
        //       }

        //     });
        //   }
        //   // else{

        //   // }
        //   page++;
        // } while (page < totalPage);

        return {
          isSuccess: true,
          message: 'Sync data from TPA Website success.',
        }
      }
      else {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Could not get token from TPA Website.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      throw new HttpException(
        {
          status: error?.status ?? HttpStatus.BAD_REQUEST,
          error: error
        },
        error?.status ?? HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * ดึงข้อมูล Shipper จาก TPA Website ตาม query parameters ที่ระบุ
   * และ sync เข้าสู่ระบบ
   * 
   * @param shipperCode - รหัส shipper (optional)
   * @param shipperName - ชื่อ shipper (optional)
   * @param status - สถานะ shipper (optional)
   * @param fromDate - วันที่เริ่มต้น (optional)
   * @param toDate - วันที่สิ้นสุด (optional)
   * @param userId - ID ของ user ที่ทำการ sync
   * @param accessToken - Access token จาก TPA Website
   */
  async getShipperFromTPAWebsiteByQuery({ shipperCode, shipperName, status, fromDate, toDate, userId, accessToken }: { shipperCode?: string, shipperName?: string, status?: string, fromDate?: string, toDate?: string, userId: any, accessToken: string }) {
    const url = process.env.TPA_WEBSITE_SERVICE_SH ?? 'https://pttapigw-dev.pttplc.com/PTT_TPAWEB/ShipperList/1.0.0/GetShipperList';
    let page = 1;
    let totalPage = 0;
    let errorList: string[] = [];

    do {
      // เรียก API GetShipperList พร้อม query parameters (ถ้าไม่ระบุจะส่งค่าว่าง = ดึงทั้งหมด)
      const responseShipperList = await axios.get(`${url}?shipperCode=${shipperCode ?? ''}&shipperName=${shipperName ?? ''}&status=${status ?? ''}&fromDate=${fromDate ?? ''}&toDate=${toDate ?? ''}&pageNo=${page}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (totalPage == 0 && responseShipperList?.data?.response?.pageCount) {
        totalPage = parseToNumber(responseShipperList.data.response.pageCount) ?? 1;
      }

      // ถ้ามีข้อมูล shipper ให้ sync เข้าสู่ระบบ
      if (responseShipperList?.data?.shipper && Array.isArray(responseShipperList?.data?.shipper)) {
        await this.syncShipperFromTPAWebsite(responseShipperList.data.shipper, userId).then(result => {
          if (result?.errorList && Array.isArray(result?.errorList)) {
            errorList.push(...result.errorList);
          }
        });
      }
      // else{

      // }
      page++;
    } while (page < totalPage);


    if (errorList.length > 0) {
      // // ถ้ามี error ให้ส่ง notification ไปยัง in-app notification
      // try {
      //   const message = errorList.join('\n');
      //   middleNotiInapp(
      //     this.prisma,
      //     'DAM',
      //     message,
      //     12, // Shipper menus_id
      //     1,
      //   );
      // } catch (error) {

      // }

    }
  }

  /**
   * Sync ข้อมูล Shipper และ User จาก TPA Website เข้าสู่ระบบ
   * วนลูปผ่าน shipperList และ user ในแต่ละ shipper เพื่อสร้าง/อัพเดทข้อมูล
   * 
   * @param shipperList - รายการ shipper จาก TPA Website
   * @param userId - ID ของ user ที่ทำการ sync
   */
  async syncShipperFromTPAWebsite(shipperList: any[], userId: any) {
    let errorList: string[] = [];
    // วนลูปผ่าน shipper แต่ละรายการ
    for (const shipper of shipperList) {
      // เช็คว่า shipper มี user หรือไม่
      if (shipper.user && Array.isArray(shipper.user)) {
        // แปลงวันที่ของ shipper ให้เป็นรูปแบบ YYYY-MM-DD
        const shipperCreateDate = getTodayNowDDMMYYYYDfaultAdd7(shipper.createDate).format('YYYY-MM-DD');
        const shipperUpdateDate = getTodayNowDDMMYYYYDfaultAdd7(shipper.modifyDate).format('YYYY-MM-DD');
        let shipperStartDate = getTodayStartAdd7().format('YYYY-MM-DD');
        if (shipper.startDate) {
          // ตรวจสอบว่า shipper.startDate เป็น format 'YYYY-MM-DD HH:mm:ss' หรือไม่
          const isFormatValid = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(shipper.startDate);
          if (!isFormatValid) {
            shipperStartDate = getTodayNowDDMMYYYYDfaultAdd7(shipper.startDate).format('YYYY-MM-DD');
          }
          else {
            shipperStartDate = getTodayNowYYYYMMDDHHmmssDfaultAdd7(shipper.startDate).format('YYYY-MM-DD');
          }
        }
        let shipperEndDate: string | undefined = undefined;
        if (shipper.endDate) {
          // ตรวจสอบว่า user.endDate เป็น format 'YYYY-MM-DD HH:mm:ss' หรือไม่
          const isFormatValid = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(shipper.endDate);
          if (!isFormatValid) {
            shipperEndDate = getTodayNowDDMMYYYYDfaultAdd7(shipper.endDate).format('YYYY-MM-DD');
          }
          else {
            shipperEndDate = getTodayNowYYYYMMDDHHmmssDfaultAdd7(shipper.endDate).format('YYYY-MM-DD');
          }
        }

        // วนลูปผ่าน user แต่ละคนใน shipper
        for (const user of shipper.user) {
          try {
            // แปลงวันที่ของ user ให้เป็นรูปแบบ YYYY-MM-DD
            const userCreateDate = getTodayNowDDMMYYYYDfaultAdd7(user.createDate).format('YYYY-MM-DD');
            const userUpdateDate = getTodayNowDDMMYYYYDfaultAdd7(user.modifyDate).format('YYYY-MM-DD');

            let userStartDate = getTodayStartAdd7().format('YYYY-MM-DD');
            if (user.startDate) {
              // ตรวจสอบว่า user.startDate เป็น format 'YYYY-MM-DD HH:mm:ss' หรือไม่
              const isFormatValid = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(user.startDate);
              if (!isFormatValid) {
                userStartDate = getTodayNowDDMMYYYYDfaultAdd7(user.startDate).format('YYYY-MM-DD');
              }
              else {
                userStartDate = getTodayNowYYYYMMDDHHmmssDfaultAdd7(user.startDate).format('YYYY-MM-DD');
              }
            }
            let userEndDate: string | undefined = undefined;
            if (user.endDate) {
              // ตรวจสอบว่า user.endDate เป็น format 'YYYY-MM-DD HH:mm:ss' หรือไม่
              const isFormatValid = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(user.endDate);
              if (!isFormatValid) {
                userEndDate = getTodayNowDDMMYYYYDfaultAdd7(user.endDate).format('YYYY-MM-DD');
              }
              else {
                userEndDate = getTodayNowYYYYMMDDHHmmssDfaultAdd7(user.endDate).format('YYYY-MM-DD');
              }
            }

            // เรียก service เพื่อสร้าง/อัพเดท shipper และ user
            await this.callReceivedService.whenAddNewShipper({
              ...user,
              createDate: userCreateDate,
              modifyDate: userUpdateDate,
              startDate: userStartDate,
              endDate: userEndDate,
              ignoreAction: true,
              shipper: {
                shipperId: shipper.shipperId,
                ShipperCode: shipper.shipperCode ?? shipper.ShipperCode,
                shipperName: shipper.shipperName,
                address: shipper.address,
                telephone: shipper.telephone,
                fax: shipper.fax,
                ercLicense: shipper.ercLicense,
                ercLicenseExpiryDate: shipper.ercLicenseExpiryDate,
                sapId: shipper.sapId,
                action: shipper.actionCreate,
                status: shipper.status,
                createDate: shipperCreateDate,
                modifyDate: shipperUpdateDate,
                startDate: shipperStartDate,
                endDate: shipperEndDate,
              },
            }, userId)
          } catch (error) {
            4
            // Log error แต่ไม่ throw เพื่อให้ sync shipper อื่น ๆ ต่อได้
            if (error?.message) {
              errorList.push(`Could not sync shipper ${user.email ?? user.userId} from TPAWebsite due to ${error?.message}`);
            }
          }
          // หน่วงเวลา 300ms เพื่อป้องกัน Prisma "too many access" error
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }
    return {
      errorList: errorList
    }
  }

  /**
   * Sync ข้อมูล Contract จาก TPA Website เข้าสู่ระบบ
   * วนลูปผ่าน contractList เพื่อสร้าง/อัพเดท contract
   * ถ้าเกิด error เกี่ยวกับ Shipper จะพยายาม sync shipper ก่อนแล้วลองใหม่
   * 
   * @param contractList - รายการ contract จาก TPA Website
   * @param userId - ID ของ user ที่ทำการ sync
   * @param accessToken - Access token จาก TPA Website (ใช้สำหรับ sync shipper ถ้าจำเป็น)
   * @returns รายการ error ที่เกิดขึ้นระหว่าง sync (ถ้ามี)
   */
  async syncContractFromTPAWebsite({ contractList, userId, accessToken }: { contractList: any[], userId: any, accessToken: string }) {
    let errorList: string[] = [];
    let approveList: {
      id: any,
      payload: any,
      userId: any,
      req: any,
      isRestorePreviousVersionValue: boolean
    }[] = [];

    // วนลูปผ่าน contract แต่ละรายการ
    for (const contract of contractList) {
      // แปลงวันที่ของ contract ให้เป็นรูปแบบ YYYY-MM-DD
      const contractCreateDate = getTodayNowDDMMYYYYDfaultAdd7(contract.createDate).format('YYYY-MM-DD');
      const contractUpdateDate = getTodayNowDDMMYYYYDfaultAdd7(contract.modifyDate).format('YYYY-MM-DD');
      const contractStartDate = (contract.contractStartDate ? getTodayNowDDMMYYYYDfaultAdd7(contract.contractStartDate) : getTodayStartAdd7()).format('YYYY-MM-DD');
      const contractEndDate = contract.contractEndDate ? getTodayNowDDMMYYYYDfaultAdd7(contract.contractEndDate).format('YYYY-MM-DD') : undefined;

      // เตรียม body สำหรับสร้าง/อัพเดท contract
      const body = {
        ...contract,
        createDate: contractCreateDate,
        modifyDate: contractUpdateDate,
        contractStartDate: contractStartDate,
        contractEndDate: contractEndDate,
        createDate_num: contract.createDateNum,
        updateDate_num: contract.updateDateNum,
      }

      try {
        // พยายามสร้าง/อัพเดท contract
        await this.whenAddNewContract(
          body,
          parseToNumber(userId) ?? parseToNumber(process.env.SYSTEM_ACCOUNT_ID) ?? 1,
          null,
          (body) => {
            approveList.push(body);
          }
        )

        // หน่วงเวลา 300ms เพื่อป้องกัน Prisma "too many access" error
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        // ถ้า error เกี่ยวกับ Shipper ไม่ตรงกัน ให้ sync shipper ก่อนแล้วลองใหม่
        if (error?.response?.error == 'Shipper Info does not match the value.') {
          // Sync shipper จาก TPA Website ก่อน
          await this.getShipperFromTPAWebsiteByQuery({
            shipperCode: contract.shipperCode,
            shipperName: contract.shipperName,
            userId: userId,
            accessToken: accessToken,
          })

          // ลองสร้าง/อัพเดท contract อีกครั้งหลังจาก sync shipper แล้ว
          try {
            await this.whenAddNewContract(
              body,
              parseToNumber(userId) ?? parseToNumber(process.env.SYSTEM_ACCOUNT_ID) ?? 1,
              null,
              (body: any) => {
                approveList.push(body);
              }
            )
          }
          catch (error) {
            // ถ้ายัง error อยู่ ให้เก็บ error ไว้ใน errorList
            if (error?.response?.error) {
              errorList.push(`Could not sync contract ${contract.contractNo} from TPAWebsite due to ${error?.response?.error}`);
            }
          }
        }
        else {
          // ถ้า error อื่น ๆ ให้เก็บ error ไว้ใน errorList
          if (error?.response?.error) {
            errorList.push(`Could not sync contract ${contract.contractNo} from TPAWebsite due to ${error?.response?.error}`);
          }
        }
      }
    }

    return {
      errorList: errorList,
      approveList: approveList
    }
  }

  async approveSyncContractFromTPAWebsite(approveList: {
    id: any,
    payload: any,
    userId: any,
    req: any,
    isRestorePreviousVersionValue: boolean
  }[]) {
    for (const approve of approveList) {
      await this.updateStatusCapacityRequestManagement(
        approve.id,
        approve.payload,
        approve.userId,
        approve.req,
        approve.isRestorePreviousVersionValue,
      );
    }
  }
  //#endregion TPA Website

  async restorePreviousVersion(id: any, terminateDate?: any, userId?: any) {
    const specificVersion = await this.prisma.booking_version.findFirst({
      where: {
        contract_code_id: Number(id),
        // flag_use: false,
        // status_capacity_request_management_id: 2,
      },
      include: {
        contract_code: true,
      },
      orderBy: { id: 'desc' },
    });
    if (specificVersion) {
      // specificVersion?.contract_code?.terminate_date
      // terminate_date
      const { pnmatchData, setDataUse, logWarnings, oldsetDataUse } =
        await this.capacityMiddleService.middleBooking(
          id,
          true,
          specificVersion.id,
        );

      // @@@
      let tsetDataUse = []
      if (terminateDate) {
        tsetDataUse = setDataUse?.map((sd: any) => {
          const { resCalcNew, ...nSd } = sd
          const nresCalcNew = resCalcNew?.map((rCn: any) => {
            const { calcNew, ...nRCn } = rCn
            const fcalcNew = calcNew?.filter((f: any) => {
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

      } else {
        tsetDataUse = setDataUse
      }

      await this.capacityMiddleService.processGenPublicData(tsetDataUse, true);

      // await this.capacityMiddleService.processGenPublicData(setDataUse, true);
    }
  }

  async ckOldVersion(id: any) {
    const check = await this.prisma.booking_version.findFirst({
      where: {
        contract_code_id: Number(id),
        flag_use: false,
      },
      orderBy: { id: 'desc' },
    });
    return check?.status_capacity_request_management_id === 2 ? true : null
  }

  // update status... มีแผนจะปรับ performance อีก
  async updateStatusCapacityRequestManagement(
    id: any,
    payload: any,
    userId: any,
    req: any,
    isRestorePreviousVersionValue: boolean = false,
  ) {
    const {
      status_capacity_request_management_id,
      terminate_date,
      shadow_time,
      shadow_period,
      reject_reasons,
    } = payload;
    let useData: any = null;
    // const todayStart = getTodayStartAdd7().toDate();
    // const todayEnd = getTodayEndAdd7().toDate();

    console.time('status');
    if (status_capacity_request_management_id === 2) {
      useData = {
        ...(status_capacity_request_management_id !== null && {
          status_capacity_request_management: {
            connect: {
              id: status_capacity_request_management_id,
            },
          },
        }),
        // shadow_time: shadow_time,
        // shadow_period: shadow_period,
        status_capacity_request_management_process: {
          connect: {
            id: 2,
          },
        },
      };
    } else if (status_capacity_request_management_id === 3) {
      useData = {
        ...(status_capacity_request_management_id !== null && {
          status_capacity_request_management: {
            connect: {
              id: status_capacity_request_management_id,
            },
          },
        }),
        reject_reasons: reject_reasons,
        status_capacity_request_management_process: {
          connect: {
            id: 5,
          },
        },
      };
    } else if (status_capacity_request_management_id === 5) {
      let newTerminateDate = null;
      const terminateDay = getTodayNowAdd7(terminate_date).startOf('day');
      const todayDay = getTodayNowAdd7().startOf('day');

      const isTerminateTodayOrBefore = terminateDay.isSameOrBefore(
        todayDay,
        'day',
      );
      const checkContractCodeCheckLast =
        await this.prisma.contract_code.findFirst({
          where: { id: Number(id) },
          select: {
            contract_start_date: true,
            contract_end_date: true,
          },
        });
      const contractStartDate = getTodayNowDDMMYYYYDfaultAdd7(
        checkContractCodeCheckLast.contract_start_date,
      );
      const contractEndDate = getTodayNowDDMMYYYYDfaultAdd7(
        checkContractCodeCheckLast.contract_end_date,
      );
      if (terminateDay.isBefore(contractStartDate, 'day')) {
        newTerminateDate = contractStartDate.toDate();
      } else if (terminateDay.isAfter(contractEndDate, 'day')) {
        newTerminateDate = contractEndDate.toDate();
      } else {
        newTerminateDate = terminateDay.toDate();
      }
      useData = {
        ...(status_capacity_request_management_id !== null && {
          status_capacity_request_management: {
            connect: {
              id: status_capacity_request_management_id,
            },
          },
        }),
        terminate_date: terminate_date ? newTerminateDate : null,

        status_capacity_request_management_process: {
          connect: {
            id: isTerminateTodayOrBefore ? 4 : 1,
            // id: 4,
          },
        },
      };
    } else if (status_capacity_request_management_id === 4) {
      useData = {
        ...(status_capacity_request_management_id !== null && {
          status_capacity_request_management: {
            connect: {
              id: status_capacity_request_management_id,
            },
          },
        }),
      };
    } else {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'status is not match',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    console.timeEnd('status');


    if (
      status_capacity_request_management_id === 2 ||
      status_capacity_request_management_id === 4
    ) {
      console.time('middleBooking process...');

      if (
        status_capacity_request_management_id === 2 &&
        isRestorePreviousVersionValue == true
      ) {
        // คืนค่าเก่า
        await this.restorePreviousVersion(id);
      }
      const { pnmatchData, setDataUse, logWarnings } =
        await this.capacityMiddleService.middleBooking(id, false);

      console.timeEnd('middleBooking process...');

      console.time('public date.');
      if (status_capacity_request_management_id === 2) {
        await this.capacityMiddleService.processGenPublicData(
          setDataUse,
          false,
        );
      }
      console.timeEnd('public date.');

      console.time('create warning');
      if (logWarnings.length > 0) {
        await this.capacityMiddleService.capacityPublicationWarning(
          id,
          logWarnings,
          userId,
        );
      }
      console.timeEnd('create warning');

      console.time('path detail');
      if (
        status_capacity_request_management_id === 2 ||
        status_capacity_request_management_id === 4
      ) {
        await this.capacityMiddleService.genPathDetail(
          setDataUse,
          pnmatchData,
          id,
          userId,
        );
      }
      console.timeEnd('path detail');
    } else if (status_capacity_request_management_id === 5) {
      // terminate ------
      const contractCodePeriod = await this.prisma.contract_code.findFirst({
        where: { id: Number(id) },
        select: {
          shadow_period: true,
          status_capacity_request_management_id: true,
        },
      });
      if (contractCodePeriod?.status_capacity_request_management_id === 2) {
        // คืนค่าเก่า
        // terminate_date 

        await this.restorePreviousVersion(id, terminate_date, userId);

        // คิดค่าใหม่
        const { pnmatchData, setDataUse, logWarnings, oldsetDataUse } =
          await this.capacityMiddleService.middleBooking(
            id,
            // true,
            false,
            undefined,
            terminate_date,
          );

        console.time('public date');
        // await this.capacityMiddleService.processGenPublicData(setDataUse, true);
        await this.capacityMiddleService.processGenPublicData(setDataUse, false);
        console.timeEnd('public date');

        console.time('path detail');
        await this.capacityMiddleService.genPathDetail(
          oldsetDataUse,
          pnmatchData,
          id,
          userId,
        );
        console.timeEnd('path detail');
      }

      // เคสที่ Terminated Contract แล้ว ไฟล์ Nom ที่ Submission เข้ามาก่อนหน้ายังไม่ถูก Cancelled

      // https://app.clickup.com/t/86ev7bp71
      // dayjs(terminateDate).format("YYYY-MM-DD")
      // if(dayjs(terminate_date).isSameOrBefore(dayjs(), 'day')){
      //   await this.prisma.upload_template_for_shipper.updateMany({
      //     where: {
      //       contract_code_id: Number(id),
      //     },
      //     data: {
      //       del_flag: true, //รอปรับ
      //     },
      //   });

      // ถูกทำเป็น cancel
      await this.prisma.query_shipper_nomination_file.updateMany({
        where: {
          contract_code_id: Number(id),
          OR: [
            // Daily nominations: exact date match
            {
              nomination_type: {
                id: 1,
              },
              gas_day: {
                gte: dayjs(terminate_date).startOf('day').toDate()
              },
            },
            // Weekly nominations: same week
            {
              nomination_type: {
                id: 2,
              },
              gas_day: {
                gte: dayjs(terminate_date).startOf('week').toDate()
              },
            },
          ]
        },
        data: {
          query_shipper_nomination_status_id: 4,
        },
      });
      // }

    } else if (status_capacity_request_management_id === 3) {
      // reject ------
      const contractCodePeriod = await this.prisma.contract_code.findFirst({
        where: { id: Number(id) },
        select: {
          shadow_period: true,
          status_capacity_request_management_id: true,
        },
      });

      if (contractCodePeriod?.status_capacity_request_management_id === 2) {
        const { pnmatchData, setDataUse, logWarnings } =
          await this.capacityMiddleService.middleBooking(id, true);

        for (let upi = 0; upi < setDataUse.length; upi++) {
          for (let fCp = 0; fCp < setDataUse[upi]?.resCalcNew.length; fCp++) {
            const fCapacityPublication =
              await this.prisma.capacity_publication.findFirst({
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
              const dateMap = new Map();
              fCapacityPublication?.capacity_publication_date.forEach(
                (entry) => {
                  dateMap.set(
                    dayjs(entry.date_day).format('YYYY-MM-DD'),
                    entry,
                  );
                },
              );
              const batchUpdates = setDataUse[upi]?.resCalcNew[
                fCp
              ]?.calcNew.map((calc) => {
                const ckDateMatch = dateMap.get(
                  dayjs(calc.date).format('YYYY-MM-DD'),
                );

                if (ckDateMatch) {
                  let updateData = {};
                  let updateDataDC = {};
                  if (ckDateMatch?.value_adjust_use !== null && parseToNumber(ckDateMatch?.value_adjust_use)) {
                    updateData = {
                      value_adjust_use: String(calc.cals),
                    };
                    updateDataDC = {
                      ...ckDateMatch,
                      value_adjust_use: String(calc.cals),
                    };

                  } else if (ckDateMatch?.value_adjust !== null && parseToNumber(ckDateMatch?.value_adjust)) {
                    updateData = {
                      value_adjust_use: String(calc.cals),
                    };
                    updateDataDC = {
                      ...ckDateMatch,
                      value_adjust_use: String(calc.cals),
                    };

                  } else if (ckDateMatch?.value !== null && parseToNumber(ckDateMatch?.value)) {
                    updateData = {
                      value: String(calc.cals),
                    };
                    updateDataDC = {
                      ...ckDateMatch,
                      value: String(calc.cals),
                    };
                    // updateDataDC = {
                    //   value: String(
                    //     setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.cals,
                    //   ),
                    // };
                  } else {
                    updateData = {
                      value: String(calc.cals),
                    };
                    updateDataDC = {
                      ...ckDateMatch,
                      value: String(calc.cals),
                    };
                    // updateDataDC = {
                    //   ...ckDateMatch,
                    //   value: String(
                    //     setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.cals,
                    //   ),
                    // };
                  }

                  return {
                    where: { id: Number(ckDateMatch.id) },
                    data: updateDataDC,
                  };
                } else {
                  return {
                    capacity_publication_id: fCapacityPublication?.id,
                    value: String(calc.cals),
                    date_day: getTodayNowAdd7(calc.date).toDate(),
                  };
                }
              });

              const updates = batchUpdates.filter((update) =>
                update.hasOwnProperty('where'),
              );
              const icpdData = batchUpdates.filter((insert) =>
                insert.hasOwnProperty('capacity_publication_id'),
              );

              // if (updates.length > 0) {
              //   await this.uploadDateCapacityDate(updates);
              //   // await this.prisma.$transaction(
              //   //   updates.map((update) =>
              //   //     this.prisma.capacity_publication_date.update(update),
              //   //   ),
              //   // );
              // }
              if (updates.length > 0) {
                await this.prisma.capacity_publication_date.deleteMany({
                  where: {
                    id: {
                      in: updates.map((dc: any) => dc?.where?.id),
                    },
                  },
                });
                await this.prisma.capacity_publication_date.createMany({
                  data: updates?.map((cps: any) => cps?.data),
                });
              }

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
                icpdData.push({
                  capacity_publication_id: createCP?.id,
                  value: String(
                    setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.cals,
                  ),
                  date_day: getTodayNowAdd7(
                    setDataUse[upi]?.resCalcNew[fCp]?.calcNew[iCpD]?.date,
                  ).toDate(),
                });
              }

              await this.prisma.capacity_publication_date.createMany({
                data: icpdData,
              });
            }
          }
        }
      }

      await this.prisma.upload_template_for_shipper.updateMany({
        where: {
          contract_code_id: Number(id),
        },
        data: {
          del_flag: true,
        },
      });

      // ถูกทำเป็น cancel
      await this.prisma.query_shipper_nomination_file.updateMany({
        where: {
          contract_code_id: Number(id),
        },
        data: {
          query_shipper_nomination_status_id: 4,
        },
      });
    }


    const resData = await this.prisma.contract_code.update({
      where: {
        id: Number(id),
      },
      data: {
        ...useData,
        update_by_account: {
          connect: {
            id: Number(userId),
          },
        },
        update_date: getTodayNowAdd7().toDate(),
        update_date_num: getTodayNowAdd7().unix(),
      },
    });

    const { status_capacity_request_management } = useData;

    const bookingVersionLast = await this.prisma.booking_version.findFirst({
      where: {
        contract_code_id: Number(id),
        flag_use: true,
      },
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    await this.prisma.booking_version.update({
      where: {
        id: Number(bookingVersionLast?.id ?? -1),
        flag_use: true,
      },
      data: {
        status_capacity_request_management,
        // submitted_timestamp: getTodayNowAdd7().toDate(), // https://sharing.clickup.com/9018502823/t/h/86ev7ybnu/8U25RU2JQU87T0M
        update_date: getTodayNowAdd7().toDate(),
        update_by_account: {
          connect: {
            id: Number(userId),
          },
        },
        update_date_num: getTodayNowAdd7().unix(),
      },
    });


    // nom
    try {
      if (status_capacity_request_management_id === 2) {
        let contract_code_id = Number(id);
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

        const dataFull = JSON.parse(getData['booking_full_json'][0]?.data_temp);
        let shipperName = dataFull?.shipperInfo[0]['Shipper Name'] || null;
        let shipperIdName = dataFull?.shipperInfo[0]['Shipper ID Name'] || null;
        const getGroupByName = shipperIdName ?
          await this.capacityMiddleService.getGroupByIDName(shipperIdName)
          :
          await this.capacityMiddleService.getGroupByName(shipperName);

        const daily = await this.uploadTemplateForShipperService.createTemplates(
          // grpcTransformDay,
          // { originalname: `${typeOfNominationDay}.xlsx` },
          null,
          null,
          {
            shipper_id: getGroupByName?.id,
            contract_code_id,
            nomination_type_id: 1,
            comment: 'Auto-Generated', // https://app.clickup.com/t/86etzch64
            // comment: 'Autogen', // https://app.clickup.com/t/86etzcgvx
          },
          userId,
          req,
        );

        const hisDaily = await this.uploadTemplateForShipperService.findOnce(
          daily?.id,
        );
        await this.uploadTemplateForShipperService.writeReq(
          req,
          `upload-template-for-shipper`,
          daily?.message, //create | edit
          hisDaily,
        );

        const weekly = await this.uploadTemplateForShipperService.createTemplates(
          // grpcTransformWeek,
          // { originalname: `${typeOfNominationWeek}.xlsx` },
          null,
          null,
          {
            shipper_id: getGroupByName?.id,
            contract_code_id,
            nomination_type_id: 2,
            comment: 'Auto-Generated', // https://app.clickup.com/t/86etzch64
            // comment: 'Autogen', // https://app.clickup.com/t/86etzcgvx
          },
          userId,
          req,
        );

        const hisWeekly = await this.uploadTemplateForShipperService.findOnce(
          weekly?.id,
        );
        await this.uploadTemplateForShipperService.writeReq(
          req,
          `upload-template-for-shipper`,
          weekly?.message, //create | edit
          hisWeekly,
        );
      }
    } catch (error) {

    }

    return resData;
  }

  async updateStatusCapForExtendCaseAmendOnlyBro(
    id: any,
    payload: any,
    userId: any,
    req: any,
    isRestorePreviousVersionValue: boolean = false,
  ) {
    const {
      status_capacity_request_management_id,
      terminate_date,
      shadow_time,
      shadow_period,
      reject_reasons,
    } = payload;

    let useData: any = null;

    console.time('status');

    // terminate
    if (status_capacity_request_management_id === 5) {
      const terminateDay = getTodayNowAdd7(terminate_date).startOf('day');
      const todayDay = getTodayNowAdd7().startOf('day');
      const isTerminateTodayOrBefore = terminateDay.isSameOrBefore(todayDay, 'day');

      const checkContractCodeCheckLast =
        await this.prisma.contract_code.findFirst({
          where: { id: Number(id) },
          select: {
            contract_start_date: true,
            contract_end_date: true,
          },
        });

      useData = {
        ...(status_capacity_request_management_id !== null && {
          status_capacity_request_management: {
            connect: {
              id: status_capacity_request_management_id, // ตัวที่มาจาก params
            },
          },
        }),
        terminate_date: terminate_date ? terminate_date.toDate() : null,

        status_capacity_request_management_process: {
          connect: {
            id: isTerminateTodayOrBefore ? 4 : 1, // 4 = End, 1 == Active
            // id: 4,
          },
        },
      };
    } else {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'status is not match',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    console.timeEnd('status');


    if (status_capacity_request_management_id === 5) {
      // terminate ------
      const contractCodePeriod = await this.prisma.contract_code.findFirst({
        where: { id: Number(id) },
        select: {
          shadow_period: true,
          status_capacity_request_management_id: true,
        },
      });
      if (contractCodePeriod?.status_capacity_request_management_id === 2) { // 2 == approve
        // คืนค่าเก่า
        // terminate_date 

        await this.restorePreviousVersion(id, terminate_date, userId);

        // คิดค่าใหม่
        const { pnmatchData, setDataUse, logWarnings, oldsetDataUse } =
          await this.capacityMiddleService.middleBooking(
            id,
            false,
            undefined,
            terminate_date,
          );

        console.time('public date');
        // await this.capacityMiddleService.processGenPublicData(setDataUse, true);
        await this.capacityMiddleService.processGenPublicData(setDataUse, false);
        console.timeEnd('public date');

        console.time('path detail');
        await this.capacityMiddleService.genPathDetail(
          oldsetDataUse,
          pnmatchData,
          id,
          userId,
        );
        console.timeEnd('path detail');
      }

      // เคสที่ Terminated Contract แล้ว ไฟล์ Nom ที่ Submission เข้ามาก่อนหน้ายังไม่ถูก Cancelled

      // https://app.clickup.com/t/86ev7bp71
      // dayjs(terminateDate).format("YYYY-MM-DD")
      // if(dayjs(terminate_date).isSameOrBefore(dayjs(), 'day')){
      //   await this.prisma.upload_template_for_shipper.updateMany({
      //     where: {
      //       contract_code_id: Number(id),
      //     },
      //     data: {
      //       del_flag: true, //รอปรับ
      //     },
      //   });
      // ถูกทำเป็น cancel
      await this.prisma.query_shipper_nomination_file.updateMany({
        where: {
          contract_code_id: Number(id),
          gas_day: {
            gte: dayjs(terminate_date).startOf('day').toDate()
          }
        },
        data: {
          query_shipper_nomination_status_id: 4,
        },
      });
      // }

    }


    // terminate_date
    const resData = await this.prisma.contract_code.update({
      where: {
        id: Number(id),
      },
      data: {
        ...useData,
        update_by_account: {
          connect: {
            id: Number(userId),
          },
        },
        update_date: getTodayNowAdd7().toDate(),
        update_date_num: getTodayNowAdd7().unix(),
      },
    });

    const { status_capacity_request_management } = useData;

    const bookingVersionLast = await this.prisma.booking_version.findFirst({
      where: {
        contract_code_id: Number(id),
        flag_use: true,
      },
      orderBy: {
        id: 'desc',
      },
      take: 1,
    });

    await this.prisma.booking_version.update({
      where: {
        id: Number(bookingVersionLast?.id ?? -1),
        flag_use: true,
      },
      data: {
        status_capacity_request_management,
        // submitted_timestamp: getTodayNowAdd7().toDate(), // https://sharing.clickup.com/9018502823/t/h/86ev7ybnu/8U25RU2JQU87T0M
        update_date: getTodayNowAdd7().toDate(),
        update_by_account: {
          connect: {
            id: Number(userId),
          },
        },
        update_date_num: getTodayNowAdd7().unix(),
      },
    });

    return resData;
  }

  makeFillWithLast(arr: string[], count: number) {
    const last = arr.length ? arr[arr.length - 1] : "0";
    const arr_ = Array.from({ length: count }, () => last)
    return arr_
  };

  makeFillWithFirst(arr: string[], count: number) {
    const first = arr.length ? arr[0] : "0";
    const arr_ = Array.from({ length: count }, () => first)
    return arr_
  };

  // ---------- KOM V.3 ----------
  trimRowByHeaderChange = (
    oldHeaders: string[],
    newHeaders: string[],
    mode: "FROM" | "TO",
    data: any[],
    entryExit: number
  ) => {
    console.log('[trimRowByHeaderChange] oldHeaders : ', oldHeaders);
    console.log('[trimRowByHeaderChange] newHeaders : ', newHeaders);
    console.log('[trimRowByHeaderChange] mode : ', mode);
    console.log('[trimRowByHeaderChange] data : ', data);
    console.log('[trimRowByHeaderChange] entryExit : ', entryExit);
    console.log('- - - -');

    const groups = entryExit === 1 ? 4 : 2;
    const oldLength = oldHeaders.length;
    const newLength = newHeaders.length;
    const META_COUNT = 7;

    if (newLength <= 0) return data.map((r) => ({ ...r }));

    return data.map((row) => {
      const newRow: any = {};

      // copy meta 0..6
      for (let i = 0; i < META_COUNT; i++) {
        newRow[i] = row[i];
      }
      console.log('[] _ newRow : ', newRow);
      const resultValues: any[] = [];

      for (let g = 0; g < groups; g++) {
        const startKey = META_COUNT + g * oldLength;
        const endKey = startKey + oldLength - 1;

        // เก็บค่าที่มีจริงใน group นี้
        const existingValues: any[] = [];
        for (let key = startKey; key <= endKey; key++) {
          if (row[key] !== undefined) {
            existingValues.push(row[key]);
          }
        }

        let kept: any[] = [];

        if (mode === "FROM") {
          // กลุ่มแรกเอาหัว กลุ่มถัดไปเอาท้าย เพื่อให้ตรง output ที่ต้องการ
          if(oldLength > newLength) {
              const diff = oldLength - newLength;
              kept = existingValues.slice(diff);
          }
          else{
              // กลุ่มแรกเอาหัว กลุ่มถัดไปเอาท้าย เพื่อให้ตรง output ที่ต้องการ
              if (g === 0) {
                  kept = existingValues.slice(0, newLength);
              } else {
                  kept = existingValues.slice(-newLength);
              }
          }
        } else {
          // TO: กลุ่มแรกเอาท้าย กลุ่มถัดไปเอาหัว
          if (g === 0) {
            kept = existingValues.slice(-newLength);
          } else {
            kept = existingValues.slice(0, newLength);
          }
        }

        resultValues.push(...kept);
      }

      resultValues.forEach((val, idx) => {
        newRow[META_COUNT + idx] = val;
      });

      return newRow;
    });
  };


  getMonthCountDiff = (newHeaders: string[], oldHeaders: string[], direction: 'FROM' | 'TO') => {

    // return Math.abs(newHeaders.length - oldHeaders?.length)
    let count = 0;

    if (direction === 'FROM') {
      for (const date of newHeaders) {
        if (!oldHeaders.includes(date)) count++;
        else break;
      }
    } else {
      // นับเฉพาะค่าที่ "อยู่ใน newHeaders แต่ไม่อยู่ใน oldHeaders"
      const addedFromEnd = newHeaders.filter(h => !oldHeaders.includes(h));
      count = addedFromEnd.length;

    }

    return count;
  };

  countAfter6 = (obj: Record<string, any>) => Object.keys(obj).filter(k => Number(k) > 6).length;

  normalizeRowToHeaders(
    row: Record<string, any>,
    newHeaders: number,
    {
      groups = 4,
      metaCount = 7,
      cutMode = "TO" as "TO" | "FROM",
    } = {}
  ) {
    // 1) คัดลอกเมตา 0..6
    const out: Record<string, any> = {};
    for (let i = 0; i < metaCount; i++) out[i] = row[i];

    // 2) ดึงค่า (คีย์ 7 ขึ้นไป) ตามลำดับคีย์
    const valueKeys = Object.keys(row)
      .map(Number)
      .filter((k) => k >= metaCount)
      .sort((a, b) => a - b);

    const values = valueKeys.map((k) => row[String(k)]);

    // 3) ถ้าจำนวนตรงแล้ว ใส่กลับและจบ
    if (values.length === newHeaders) {
      values.forEach((v, i) => (out[metaCount + i] = v));
      return out;
    }

    // helper: กระจายขนาดกลุ่มแบบสมดุล (แจกเศษให้กลุ่มต้น ๆ)
    const splitSizes = (total: number, parts: number) => {
      const base = Math.floor(total / parts);
      const rem = total % parts;
      return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
    };

    // 4) ผ่าค่าปัจจุบันเป็น groups กลุ่ม (สมดุล)
    const curSizes = splitSizes(values.length, groups);
    const chunks: any[][] = [];
    let off = 0;
    for (let g = 0; g < groups; g++) {
      const sz = curSizes[g];
      chunks.push(values.slice(off, off + sz));
      off += sz;
    }

    // 5) ขนาดกลุ่มเป้าหมายจาก newHeaders
    const tgtSizes = splitSizes(newHeaders, groups);

    // 6) สร้างกลุ่มใหม่ตามเป้า: ถ้าน้อย → เติม, ถ้าเกิน → ตัด
    const rebuilt = chunks.map((chunk, i) => {
      const need = tgtSizes[i];
      if (chunk.length === need) return chunk.slice();

      if (chunk.length < need) {
        // เติมท้ายด้วยค่าก่อนหน้า (ถ้ากลุ่มว่างให้เติม "" หรือ 0 ตามที่ต้องการ)
        const last = chunk.length > 0 ? chunk[chunk.length - 1] : "";
        return chunk.concat(Array.from({ length: need - chunk.length }, () => last));
      } else {
        // เกิน → ตัดตามทิศทาง
        const cut = chunk.length - need;
        return cutMode === "FROM"
          ? chunk.slice(cut)        // ตัดหัว
          : chunk.slice(0, need);   // ตัดท้าย (ค่าเริ่มต้น)
      }
    });

    // 7) ใส่กลับเป็นคีย์ 7.. ให้ครบ newHeaders
    const flat = rebuilt.flat().slice(0, newHeaders);
    flat.forEach((v, i) => (out[metaCount + i] = v));
    return out;
  }

  findHeaderExpansion(oldHeaders: string[], newHeaders: string[]) {
    const oldFirst = oldHeaders[0];
    const oldLast = oldHeaders[oldHeaders.length - 1];

    const startIndexInNew = newHeaders.indexOf(oldFirst);
    const endIndexInNew = newHeaders.indexOf(oldLast);

    if (startIndexInNew === -1 || endIndexInNew === -1) {
      return {
        prependCount: 0,
        appendCount: 0,
        matched: false,
      };
    }

    return {
      prependCount: startIndexInNew,
      appendCount: newHeaders.length - endIndexInNew - 1,
      matched: true,
    };
  }

  updateRow(mode: 'FROM' | 'TO', new_header: any, old_header: any, example_data: any, entryExit: number) {
    if (mode !== 'FROM' && mode !== 'TO') return;

    const newHeaders = new_header;
    const oldHeaders = old_header;
    const addedMonths = this.getMonthCountDiff(newHeaders, oldHeaders, mode);
    console.log('addedMonths : ', addedMonths);
    if (addedMonths === 0) {

      const groups = entryExit === 1 ? 4 : 2;

      // case นี้คือลดช่วงเวลา period from, to
      const updatedExampleData = this.trimRowByHeaderChange(
        oldHeaders,
        newHeaders,
        mode, // 'FROM' หรือ 'TO'
        example_data,
        entryExit
      );
      console.log('updatedExampleData : ', updatedExampleData);
      const count_row_key = this.countAfter6(updatedExampleData[0]); // 12

      let resultArray: any = updatedExampleData

      if (newHeaders.length * groups !== count_row_key) {

        resultArray = updatedExampleData.map(r => this.normalizeRowToHeaders(r, newHeaders.length * groups, { groups: groups, metaCount: 7, cutMode: "TO" }));
      }

      return resultArray

    } else {
      // case นี้เพิ่มช่วงเวลา period from, to

      const groups = entryExit === 1 ? 4 : 2;
      const keysPerGroup = oldHeaders.length;
      const newKeysPerGroup = newHeaders.length;
      const keysToAddPerGroup = newKeysPerGroup - keysPerGroup;

      // // เอาไว้หาว่าจะเพิ่มข้างหน้า หรือหลัง ตั้งใจจะเอามาใช้แทน FROM, TO ใน updateRow
      // const { prependCount, appendCount, matched } = this.findHeaderExpansion(oldHeaders, newHeaders);

      // console.log('example_data : ', example_data);
      // เติมค่าสุดท้ายของ row ลงคีย์ใหม่
      const updatedData = example_data.map((row: any) => {
        const newRow: any = {};

        // คัดลอก key 0-6
        for (let i = 0; i <= 6; i++) {
          newRow[i] = row[i];
        }

        // ดึงข้อมูลเป็น 4 กลุ่ม
        const groupData: string[][] = Array.from({ length: groups }, () => []);
        const actualValueCount = this.countAfter6(row);

        const actualKeysPerGroup = Math.floor(actualValueCount / groups);

        let baseKey = 7;
        for (let g = 0; g < groups; g++) {
          for (let i = 0; i < keysPerGroup; i++) {
            const key = String(baseKey++);
            groupData[g].push(row[key] ?? "0");
          }
        }

        if (mode === 'FROM') {
          // เติมค่าตัวสุดท้ายไว้ "ด้านหน้า" ของแต่ละกลุ่ม
          for (let g = 0; g < groups; g++) {
            const fill = this.makeFillWithFirst(groupData[g], keysToAddPerGroup); // เอาค่าของตัวแรกมาใส่ ที่จะย้อนหลังวัน
            groupData[g] = [...fill, ...groupData[g]];
          }
        } else if (mode === 'TO') {
          // เติมค่าตัวสุดท้ายไว้ "ด้านหลัง" ของแต่ละกลุ่ม
          for (let g = 0; g < groups; g++) {
            const fill = this.makeFillWithLast(groupData[g], keysToAddPerGroup); // เอาค่าของตัวสุดท้ายมาใส่ ที่จะเพิ่มวัน
            groupData[g] = [...groupData[g], ...fill];
          }
        }

        // แปลงกลับเป็น flat key/value

        let newKeyIndex = 7;
        for (const group of groupData) {
          for (const val of group) {
            newRow[newKeyIndex++] = val;
          }
        }
        return newRow;
      });
      // console.log('updatedData : ', updatedData);
      // safe guard กันเหนียว
      const count_row_key = this.countAfter6(updatedData[0]); // 12
      // console.log('count_row_key : ', count_row_key);
      let resultArray: any = updatedData
      if (newHeaders.length * groups !== count_row_key) {
        // resultArray = updatedData.map((r: any) => this.normalizeRowToHeaders(r, newHeaders.length * groups, { groups: groups, metaCount: 7, cutMode: "TO" }));
        resultArray = updatedData.map((r: any) => this.normalizeRowToHeaders(r, newHeaders.length * groups, { groups: groups, metaCount: 7, cutMode: mode }));
      }
      // console.log('resultArray : ', resultArray);
      // console.log('- - - -');
      return resultArray
    }

  };

  async fnExtendDateJSONNew(payload: any) {
    const {
      bookingTemplate,
      jsonFull,
      new_contract_start_date,
      new_contract_end_date,
      startDate,
      endDateDate,
    } = payload
    let oresultDate = []
    let nresultDateStep1 = []
    let nresultDate = []
    let ostartDate = null
    let nstartDateStep1 = null
    let nstartDate = null
    if (bookingTemplate?.term_type_id === 4) {
      ostartDate = dayjs(startDate, 'DD/MM/YYYY', true)
        .add(bookingTemplate?.todayday, 'day')
        .format('DD/MM/YYYY');
      oresultDate = this.capacityMiddleService.generateDailyArray(
        startDate,
        endDateDate,
      );
      // 
      nstartDateStep1 = dayjs(new_contract_start_date, 'DD/MM/YYYY', true)
        .add(bookingTemplate?.todayday, 'day')
        .format('DD/MM/YYYY');
      nresultDateStep1 = this.capacityMiddleService.generateDailyArray(
        new_contract_start_date,
        endDateDate,
      );
      // 
      nstartDate = dayjs(new_contract_start_date, 'DD/MM/YYYY', true)
        .add(bookingTemplate?.todayday, 'day')
        .format('DD/MM/YYYY');
      nresultDate = this.capacityMiddleService.generateDailyArray(
        new_contract_start_date,
        new_contract_end_date,
      );
    } else {
      ostartDate = startDate
      oresultDate = this.capacityMiddleService.generateMonthArray(
        startDate,
        endDateDate,
        1,
      );
      // 
      nstartDateStep1 = new_contract_start_date
      nresultDateStep1 = this.capacityMiddleService.generateMonthArray(
        new_contract_start_date,
        endDateDate,
        1,
      );
      // 
      nstartDate = new_contract_start_date
      nresultDate = this.capacityMiddleService.generateMonthArray(
        new_contract_start_date,
        new_contract_end_date,
        1,
      );
    }


    // oldHeaders = [ "01/05/2025", "01/06/2025", "01/07/2025","01/08/2025"]
    // newHeaders = ["01/07/2025", "01/08/2025"]
    const oldHeaders = oresultDate
    const newHeadersStep1 = nresultDateStep1
    const newHeaders = nresultDate
    const entryOld = jsonFull?.data_temp?.entryValue
    const exitOld = jsonFull?.data_temp?.exitValue

    const updateRowEntryFROM = this.updateRow("FROM", newHeadersStep1, oldHeaders, entryOld, 1)
    const updateRowEntryTO = this.updateRow("TO", newHeadersStep1, oldHeaders, updateRowEntryFROM, 1)

    const updateRowExitFROM = this.updateRow("FROM", newHeadersStep1, oldHeaders, exitOld, 2)
    const updateRowExitTO = this.updateRow("TO", newHeadersStep1, oldHeaders, updateRowExitFROM, 2)

    function datesToIndexedObject(dates: string[], start: number) {
      // เรียงวันที่จากน้อยไปมาก
      const sorted = [...dates].sort((a, b) => {
        const [da, ma, ya] = a.split('/').map(Number);
        const [db, mb, yb] = b.split('/').map(Number);
        // สร้างเป็น time value เพื่อเทียบ
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
      });

      // แปลงเป็น object โดย key เริ่มที่ 1
      const out: any = {};
      sorted.forEach((d, i) => (out[d] = { key: String(i + start) }));
      out.key = String(start)
      return out;
    }

    // ปรับวัน updateRowEntryTO, updateRowExitTO
    const entryValue = updateRowEntryTO?.map((e: any) => {
      e["5"] = new_contract_start_date
      e["6"] = new_contract_end_date
      return {
        ...e,
      }
    })
    const exitValue = updateRowExitTO?.map((e: any) => {
      e["5"] = new_contract_start_date
      e["6"] = new_contract_end_date
      return {
        ...e,
      }
    })

    const data_temp = {
      shipperInfo: jsonFull?.data_temp?.shipperInfo,
      headerEntry: {
        ["Entry"]: jsonFull?.data_temp?.headerEntry?.["Entry"],
        ["Period"]: jsonFull?.data_temp?.headerEntry?.["Period"],
        ["Capacity Daily Booking (MMBTU/d)"]: datesToIndexedObject(newHeaders, 7), // เสร็จ
        ["Maximum Hour Booking (MMBTU/h)"]: datesToIndexedObject(newHeaders, 7 + newHeaders?.length), // เสร็จ
        ["Capacity Daily Booking (MMscfd)"]: datesToIndexedObject(newHeaders, 7 + (newHeaders?.length * 2)), // เสร็จ
        ["Maximum Hour Booking (MMscfh)"]: datesToIndexedObject(newHeaders, 7 + (newHeaders?.length * 3)), // เสร็จ
      },
      headerExit: {
        ["Exit"]: jsonFull?.data_temp?.headerExit?.["Exit"],
        ["Period"]: jsonFull?.data_temp?.headerExit?.["Period"],
        ["Capacity Daily Booking (MMBTU/d)"]: datesToIndexedObject(newHeaders, 7), // เสร็จ
        ["Maximum Hour Booking (MMBTU/h)"]: datesToIndexedObject(newHeaders, 7 + newHeaders?.length), // เสร็จ
      },
      entryValue: entryValue, // เสร็จ
      exitValue: exitValue, // เสร็จ
      sumEntries: {
        '0': 'Sum Entry', ...this.capacityMiddleService.sumKeys(
          entryValue,
          7,
        )
      }, // เสร็จ
      sumExits: {
        '0': 'Sum Exit', ...this.capacityMiddleService.sumKeys(
          exitValue,
          7,
        )
      }, // เสร็จ
    }

    return {
      nstartDate,
      nresultDate,
      new_data_temp: data_temp,
    }
  }

  fillEachGroupWithLastValue = (
    data: Record<string, any>[],
    type: "entry" | "exit"
  ) => {
    const groups = type === "entry" ? 4 : 2;
    const META_COUNT = 7;

    return data.map((row) => {
      const newRow: Record<string, any> = {};

      // คัดลอก meta 0..6
      for (let i = 0; i < META_COUNT; i++) {
        newRow[i] = row[i];
      }

      // ดึง key ตั้งแต่ 7 เป็นต้นไป
      const valueKeys = Object.keys(row).map(Number).filter((k) => k >= META_COUNT).sort((a, b) => a - b);

      const values = valueKeys.map((k) => row[k]);

      const keysPerGroup = values.length / groups;

      if (!Number.isInteger(keysPerGroup)) {
        // key หารไม่ลงตัว
        return data
      }

      let writeKey = META_COUNT;

      for (let g = 0; g < groups; g++) {
        const start = g * keysPerGroup;
        const end = start + keysPerGroup;
        const chunk = values.slice(start, end);

        const lastValue = chunk.length ? chunk[chunk.length - 1] : "0";

        for (let i = 0; i < chunk.length; i++) {
          newRow[writeKey++] = lastValue;
        }
      }

      return newRow;
    });
  };

  async fnExtendDateJSONNewForExtend(payload: any) {
    const { bookingTemplate, jsonFull, new_contract_start_date, new_contract_end_date, startDate, endDateDate, new_contract_end_date_key_six } = payload
    let oresultDate = []
    let nresultDateStep1 = []
    let nresultDate = []
    let ostartDate = null
    let nstartDateStep1 = null
    let nstartDate = null

    if (bookingTemplate?.term_type_id === 4) {
      ostartDate = dayjs(startDate, 'DD/MM/YYYY', true).add(bookingTemplate?.todayday, 'day').format('DD/MM/YYYY');
      oresultDate = this.capacityMiddleService.generateDailyArray(startDate, dayjs(endDateDate, "DD/MM/YYYY").subtract(1, "day").format("DD/MM/YYYY"));

      nstartDateStep1 = dayjs(new_contract_start_date, 'DD/MM/YYYY', true).add(bookingTemplate?.todayday, 'day').format('DD/MM/YYYY');
      // nresultDateStep1 = this.capacityMiddleService.generateDailyArray(new_contract_start_date, endDateDate); // เดิมโรงงาน
      nresultDateStep1 = this.capacityMiddleService.generateDailyArray(new_contract_start_date, new_contract_end_date);

      nstartDate = dayjs(new_contract_start_date, 'DD/MM/YYYY', true).add(bookingTemplate?.todayday, 'day').format('DD/MM/YYYY');
      nresultDate = this.capacityMiddleService.generateDailyArray(new_contract_start_date, new_contract_end_date);
    } else {
      ostartDate = startDate
      oresultDate = this.capacityMiddleService.generateMonthArray(startDate, endDateDate, 1);
      nstartDateStep1 = new_contract_start_date
      // nresultDateStep1 = this.capacityMiddleService.generateMonthArray(new_contract_start_date, endDateDate, 1); // เดิมโรงงาน
      nresultDateStep1 = this.capacityMiddleService.generateMonthArray(new_contract_start_date, new_contract_end_date, 1);
      // 
      nstartDate = new_contract_start_date
      nresultDate = this.capacityMiddleService.generateMonthArray(new_contract_start_date, new_contract_end_date, 1); // เดิมโรงงาน
    }

    // ต้องเป็นยังงี้
    // old contract start date == 20/02/2026
    // new contract end date == 01/04/2026

    // 🔥 new_contract_start_date 01/05/2026
    // 🔥 new_contract_end_date_key_six 01/07/2026
    // 🔥 startDate 01/05/2026
    // 🔥 endDateDate 01/06/2026

    const oldHeaders = oresultDate
    const newHeadersStep1 = nresultDateStep1
    const newHeaders = nresultDate
    const entryOld = jsonFull?.data_temp?.entryValue
    const exitOld = jsonFull?.data_temp?.exitValue
    // console.log('newHeaders : ', newHeaders);
    // console.log('oldHeaders : ', oldHeaders);
    // console.log('entryOld : ', newHeaders);

    // ----- เดิมโรงงาน 1
    // const updateRowEntryFROM = this.updateRow("FROM", newHeadersStep1, entryOld, entryOld, 1)
    // const updateRowEntryTO = this.updateRow("TO", newHeaders, newHeadersStep1, updateRowEntryFROM, 1)
    // const updateRowExitFROM = this.updateRow("FROM", newHeadersStep1, oldHeaders, exitOld, 2)
    // const updateRowExitTO = this.updateRow("TO", newHeaders, newHeadersStep1, updateRowExitFROM, 2)


    // ----- เดิมโรงงาน 2 - ที่ใช้ปัจจุบัน
    const updateRowEntryFROM = this.updateRow("FROM", newHeaders, oldHeaders, entryOld, 1)
    const updateRowExitFROM = this.updateRow("FROM", newHeaders, oldHeaders, exitOld, 2)

    const resultEntry = this.fillEachGroupWithLastValue(updateRowEntryFROM, "entry");
    const resultExit = this.fillEachGroupWithLastValue(updateRowExitFROM, "exit");
    // console.log('updateRowEntryFROM : ', updateRowEntryFROM);
    // console.log('resultEntry : ', resultEntry);

    // updateRowEntryFROM
    // updateRowExitFROM
    // resultEntry
    // resultExit
    // ----------------------------------------

    function datesToIndexedObject(dates: string[], start: number) {
      // เรียงวันที่จากน้อยไปมาก
      const sorted = [...dates].sort((a, b) => {
        const [da, ma, ya] = a.split('/').map(Number);
        const [db, mb, yb] = b.split('/').map(Number);
        // สร้างเป็น time value เพื่อเทียบ
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
      });

      // แปลงเป็น object โดย key เริ่มที่ 1
      const out: any = {};
      sorted.forEach((d, i) => (out[d] = { key: String(i + start) }));
      out.key = String(start)
      return out;
    }

    // ปรับวัน updateRowEntryTO, updateRowExitTO
    // const entryValue = updateRowEntryTO?.map((e: any) => {
    // const entryValue = updateRowEntryFROM?.map((e: any) => {
    const entryValue = resultEntry?.map((e: any) => {
      e["5"] = new_contract_start_date // เดิมโรงงาน
      e["6"] = new_contract_end_date_key_six // เดิมโรงงาน

      return {
        ...e,
      }
    })

    // const exitValue = updateRowExitTO?.map((e: any) => {
    // const exitValue = updateRowExitFROM?.map((e: any) => {
    const exitValue = resultExit?.map((e: any) => {
      e["5"] = new_contract_start_date // เดิมโรงงาน
      e["6"] = new_contract_end_date_key_six // เดิมโรงงาน

      return {
        ...e,
      }
    })

    const data_temp = {
      shipperInfo: jsonFull?.data_temp?.shipperInfo,
      headerEntry: {
        ["Entry"]: jsonFull?.data_temp?.headerEntry?.["Entry"],
        ["Period"]: jsonFull?.data_temp?.headerEntry?.["Period"],
        ["Capacity Daily Booking (MMBTU/d)"]: datesToIndexedObject(newHeaders, 7), // เสร็จ
        ["Maximum Hour Booking (MMBTU/h)"]: datesToIndexedObject(newHeaders, 7 + newHeaders?.length), // เสร็จ
        ["Capacity Daily Booking (MMscfd)"]: datesToIndexedObject(newHeaders, 7 + (newHeaders?.length * 2)), // เสร็จ
        ["Maximum Hour Booking (MMscfh)"]: datesToIndexedObject(newHeaders, 7 + (newHeaders?.length * 3)), // เสร็จ
      },
      headerExit: {
        ["Exit"]: jsonFull?.data_temp?.headerExit?.["Exit"],
        ["Period"]: jsonFull?.data_temp?.headerExit?.["Period"],
        ["Capacity Daily Booking (MMBTU/d)"]: datesToIndexedObject(newHeaders, 7), // เสร็จ
        ["Maximum Hour Booking (MMBTU/h)"]: datesToIndexedObject(newHeaders, 7 + newHeaders?.length), // เสร็จ
      },
      entryValue: entryValue, // เสร็จ
      exitValue: exitValue, // เสร็จ
      sumEntries: {
        '0': 'Sum Entry', ...this.capacityMiddleService.sumKeys(
          entryValue,
          7,
        )
      }, // เสร็จ
      sumExits: {
        '0': 'Sum Exit', ...this.capacityMiddleService.sumKeys(
          exitValue,
          7,
        )
      }, // เสร็จ
    }

    return {
      nstartDate,
      nresultDate,
      new_data_temp: data_temp,
    }
  }

  async extendCapacityRequestManagement(
    id: any,
    payload: any,
    userId: any,
    req: any,
  ) {
    const {
      shadow_time,
      shadow_period,
      contract_start_date,
      contract_end_date,
      original_contract_end_date,  // มันจะกลายเป็น new contract start date เคสที่กด extend หลังจากสัญญา active
    } = payload;


    // ================== READ ME BRO ====================
    // พี่แนนผมอยากขอ Firm Extend ในกรณี ที่ Contract Active แล้วครับ ว่าเข้าใจถูกมั้ย
    // 1.เงื่อนไขการขยายเวลา ยึดตาม Period ของ Original Contract ไม่ใช่ New Shadow Period
    // 2.End Date จะกดไปต่อได้ โดยนับตาม End Date ที่ Default มา

    // ยกตัวอย่างเช่น
    // Contract Start : 01/01/2025
    // Contract End : 31/03/2025
    // Shadow Period : 3 เดือน

    // End Date ที่จะสามารถขยายได้ จะต้องนับจาก 03/2025 > 04/2025 > 05/2025 > 06/2025
    // จากนั้น สัญญาจะเป็น Amend โดย Contract Start Date ของตัวใหม่จะเท่ากับ วันที่ 31/03/2025 ซึ่งเป็นวันที่ End ของ Contract แรก 
    // ซึ่งทั้งหมดทั้งมวลไม่เกี่ยวกับ Min / Max ที่ Set ใน Capacity Right Template
    // ====================================================

    const todayStartDayjs = getTodayStartAdd7()
    const todayStart = getTodayStartAdd7().toDate();
    const todayEnd = getTodayEndAdd7().toDate();

    const contractCode = await this.prisma.contract_code.findFirst({
      where: { id: Number(id) },
    });

    const jsonFull = await this.prisma.booking_full_json.findFirst({
      where: {
        booking_version: {
          contract_code_id: Number(id),
          flag_use: true,
        },
      },
    });
    jsonFull['data_temp'] = JSON.parse(jsonFull['data_temp']);

    let resultDate = null;
    let startDate = contract_start_date;
    let endDateDate = contract_end_date;
    let flagAmd = false;
    let contract_code: any = null;

    const nowDate = getTodayNowAdd7().toDate();
    const hasContractStarted =
      dayjs(nowDate).isAfter(dayjs(contractCode?.contract_start_date)) ||
      dayjs(nowDate).isSame(dayjs(contractCode?.contract_start_date));

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

        const findExit = e?.temps?.revised_capacity_path?.map((f: any) => {
          return f;
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


    let mode_ = true
    if (
      contractCode?.status_capacity_request_management_id === 2 &&
      hasContractStarted
    ) { // active ไปแล้วเป็น amend เว่ยวัยรุ่น
      // amd
      mode_ = true
      flagAmd = true;
      const checkContractCodeCheckLength =
        await this.prisma.contract_code.count({
          where: {
            ref_contract_code_by_main_id:
              contractCode?.ref_contract_code_by_main_id,
          },
        });
      let amdVersion =
        '_Amd' +
        String(
          checkContractCodeCheckLength > 9
            ? checkContractCodeCheckLength
            : '0' + checkContractCodeCheckLength,
        );
      const newContractAmdStart = dayjs().tz('Asia/Bangkok').format('DD/MM/YYYY')
      let resultContractCode: any;
      if (contractCode?.contract_code.includes('_Amd')) {
        const match = contractCode?.contract_code.match(/(.*)(_Amd.*)/);
        resultContractCode = [match[1], match[2]];
      } else {
        resultContractCode = [contractCode?.contract_code];
      }

      const bookingTemplate = await this.prisma.booking_template.findFirst({
        where: {
          // file_period_mode: contractCode?.file_period_mode,
          term_type_id: contractCode?.term_type_id,
          // start_date: {
          //   lte: todayEnd,
          // },
          // end_date: {
          //   gte: todayStart,
          // },
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

      if (getTodayNowDDMMYYYYAdd7(contract_start_date).isSameOrAfter(getTodayNowDDMMYYYYAdd7(contract_end_date))) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: "The 'Period To' date must not be earlier than the 'Period From' date.",
          },
          HttpStatus.BAD_REQUEST,
        );
      }

    
        

      contract_code = resultContractCode[0] + amdVersion;




      // -------------- case create row ------------
      // -------------------------------------------
      // ถ้าเป็นวันที่ 1 มันจะต้องลบไป 1 วัน ไม่งั้นในตารางจะแสดงเดือนเกิน
      const raw = dayjs(contract_end_date, 'DD/MM/YYYY');
      const d = dayjs(raw, "YYYY-MM-DD", true); // parse แบบ strict
      const isFirstOfMonth = d.date() === 1;

      let newContractEndDate = contract_end_date
      // ถ้าเป็น short term non firm ให้ -1 day
      if (contractCode?.term_type_id == 4) {
        newContractEndDate = d.subtract(1, "day").format("DD/MM/YYYY");
      } else {
        // เช็คว่า dataWithoutId.contract_end_date เป็นวันที่ 1 ของเดือนหรือไม่ ถ้าใช่ให้ลบ 1 วัน
        newContractEndDate = (isFirstOfMonth ? d.subtract(1, "day") : d).format("DD/MM/YYYY");
      }

      // ------------------------------------------

      const fnExtendDateJSONNew = await this.fnExtendDateJSONNewForExtend({
        bookingTemplate: bookingTemplate,
        jsonFull: jsonFull,
        // new_contract_start_date: contract_start_date, // เดิมโรงงาน
        new_contract_start_date: dayjs(contractCode?.contract_end_date).format("DD/MM/YYYY"),
        // new_contract_end_date: contract_end_date,
        new_contract_end_date: newContractEndDate,
        new_contract_end_date_key_six: contract_end_date, // เอาไปลง period TO key [6]
        startDate: dayjs(contractCode?.contract_start_date).format("DD/MM/YYYY"),
        endDateDate: dayjs(contractCode?.contract_end_date).format("DD/MM/YYYY"),
      })
      startDate = fnExtendDateJSONNew?.nstartDate
      resultDate = fnExtendDateJSONNew?.nresultDate

      let data_temp: any = fnExtendDateJSONNew?.new_data_temp;

      let newEntry = data_temp['entryValue'];
      let newExit = data_temp['exitValue'];

      console.log('id : ', id);
      console.log('payload : ', payload);
      console.log('fnExtendDateJSONNew : ', fnExtendDateJSONNew);

      // throw new HttpException(
      //     {
      //       status: HttpStatus.BAD_REQUEST,
      //       error: `test...`,
      //     },
      //     HttpStatus.BAD_REQUEST,
      //   );

      const createContractCodeAmd = await this.prisma.contract_code.create({
        data: {
          contract_code: contract_code,
          ...(!!contractCode?.term_type_id && {
            term_type: {
              connect: {
                id: contractCode?.term_type_id,
              },
            },
          }),
          ...(!!contractCode?.group_id && {
            group: {
              connect: {
                id: contractCode?.group_id,
              },
            },
          }),
          status_capacity_request_management_process: {
            connect: {
              id: 1,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: 2,
            },
          },
          type_account: {
            connect: {
              id: contractCode?.type_account_id,
            },
          },
          ...(!!contractCode?.ref_contract_code_by_main_id && {
            ref_contract_code_by_main: {
              connect: {
                id: contractCode?.ref_contract_code_by_main_id,
              },
            },
          }),
          ...(!!contractCode?.id && {
            ref_contract_code_by: {
              connect: {
                id: contractCode?.id,
              },
            },
          }),
          shadow_period: parseToNumber(shadow_period) || 0,
          shadow_time: parseToNumber(shadow_time) || 0,
          file_period_mode: bookingTemplate?.file_period_mode,
          fixdayday: bookingTemplate?.fixdayday,
          todayday: bookingTemplate?.todayday,
          contract_start_date: contract_start_date
            ? getTodayStartAdd7(contractCode?.contract_end_date).toDate()//getTodayNowDDMMYYYYDfaultAdd7(contract_start_date).toDate()
            : null,
          contract_end_date: contract_end_date
            ? getTodayNowDDMMYYYYDfaultAdd7(contract_end_date).toDate()
            : null,

          submitted_timestamp: getTodayNowAdd7().toDate(),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
        },
      });

      await this.prisma.extend_contract_capacity_request_management.create({
        data: {
          shadow_time: contractCode?.shadow_time || 0,
          shadow_period: contractCode?.shadow_period || 0,
          new_shadow_time: parseToNumber(shadow_period) || 0,
          new_shadow_period: parseToNumber(shadow_period) || 0,
          // start_date: contract_start_date // เดิมโรงงาน
          //   ? getTodayNowDDMMYYYYDfaultAdd7(contract_start_date).toDate()
          //   : null,
          start_date: original_contract_end_date
            ? getTodayNowDDMMYYYYDfaultAdd7(original_contract_end_date).toDate()
            : null,
          end_date: contract_end_date
            ? getTodayNowDDMMYYYYDfaultAdd7(contract_end_date).toDate()
            : null,

          contract_code_id: createContractCodeAmd?.id,
          temp_submitted_timestamp: getTodayNowAdd7().toDate(),
          file_period_mode: contractCode?.file_period_mode,
        },
      });

      await this.prisma.booking_version.updateMany({
        where: {
          contract_code_id: createContractCodeAmd?.id ?? -1,
        },
        data: {
          flag_use: false,
        },
      });

      const checkContractCodeCheckLength1 =
        await this.prisma.booking_version.count({
          where: {
            contract_code_id: createContractCodeAmd?.id ?? -1,
          },
        });

      const versId = await this.prisma.booking_version.create({
        data: {
          version: `v.${checkContractCodeCheckLength1 + 1}`,
          ...(!!createContractCodeAmd?.id && {
            contract_code: {
              connect: {
                id: createContractCodeAmd?.id,
              },
            },
          }),
          flag_use: true,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
          submitted_timestamp: getTodayNowAdd7().toDate(),
          type_account: {
            connect: {
              id: 1,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: 2,
            },
          },
          contract_start_date: createContractCodeAmd?.contract_start_date,
          contract_end_date: createContractCodeAmd?.contract_end_date,
        },
      });

      await this.prisma.booking_full_json.create({
        data: {
          ...(!!versId?.id && {
            // new create ..
            booking_version: {
              connect: {
                id: versId?.id,
              },
            },
          }),
          data_temp: JSON.stringify(data_temp),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
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

      let mapDataRowJson = [];
      for (let i = 0; i < newEntry.length; i++) {
        const contractPoint = contractPointAPI.find((fNe: any) => {
          // return fNe?.contract_point === newExit[i]['0'];
          return fNe?.contract_point === newEntry[i]['0'];
        });

        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 1,

          zone_text: contractPoint?.zone?.name,
          area_text: contractPoint?.area?.name,
          // contract_point: newExit[i]['0'],
          contract_point: newEntry[i]['0'],
          flag_use: true,
          // data_temp: JSON.stringify(newExit[i]),
          data_temp: JSON.stringify(newEntry[i]),
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }
      for (let i = 0; i < newExit.length; i++) {
        const contractPoint = contractPointAPI.find((fNe: any) => {
          return fNe?.contract_point === newExit[i]['0'];
        });

        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 2,

          zone_text: contractPoint?.zone?.name,
          area_text: contractPoint?.area?.name,
          contract_point: newExit[i]['0'],
          flag_use: true,
          data_temp: JSON.stringify(newExit[i]),
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }

      await this.prisma.booking_row_json.createMany({
        data: mapDataRowJson,
      });

      const contractCodeToGetEndDate =
        await this.prisma.contract_code.findFirst({
          where: {
            id: Number(id),
          },
        });
      const contractStartDate = getTodayNowDDMMYYYYDfaultAdd7(
        contractCodeToGetEndDate.contract_start_date,
      );
      const contractEndDate = getTodayNowDDMMYYYYDfaultAdd7(
        contractCodeToGetEndDate.contract_end_date,
      );

      // case ลง terminate_date สัญญาหลัก
      const newTerminateDate = dayjs(nowDate);
      let terminateDate = dayjs(nowDate).format('YYYY-MM-DD');

      if (newTerminateDate.isBefore(contractStartDate, 'day')) {
        terminateDate = contractStartDate.format('YYYY-MM-DD');
      } else if (newTerminateDate.isAfter(contractEndDate, 'day')) {
        terminateDate = contractEndDate.format('YYYY-MM-DD');
      } else {
        terminateDate = newTerminateDate.format('YYYY-MM-DD');
      }

      terminateDate = dayjs(contractCode?.contract_end_date).format('YYYY-MM-DD')

      // ละเว้น Error:
      try {
        //terminate เก่า

        // เดิมโรงงาน
        await this.updateStatusCapacityRequestManagement(
          Number(id),
          {
            status_capacity_request_management_id: 5,

            terminate_date: terminateDate
              ? getTodayNowAdd7(terminateDate)
              : null,
          },
          userId,
          null,
        );

        // ใหม่ออลนิว ไม่ใช้ ของเดิมดีอยู่แล้ว
        // await this.updateStatusCapForExtendCaseAmendOnlyBro(
        //   Number(id),
        //   {
        //     status_capacity_request_management_id: 5, // terminate
        //     terminate_date: terminateDate // วัน terminate มันต้องเป็นวัน end_date เดิม
        //       ? getTodayNowAdd7(terminateDate)
        //       : null,
        //   },
        //   userId,
        //   null,
        // );
      } catch (error) {
        console.warn('⚠️ amd 1 ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
      }

      try {
        await this.updateStatusCapacityRequestManagement(
          createContractCodeAmd?.id,
          {
            status_capacity_request_management_id: 2,
            terminate_date: null, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
            ref_contract_code_by_main_id:
              contractCode?.ref_contract_code_by_main_id,
            ref_contract_code_by_id: contractCode?.id,
          },
          userId,
          null,
        );
      } catch (error) {

        console.warn('⚠️ amd 2 ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
      }
    } else { // ยังไม่ active
      throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `test... ยังไม่ active`,
          },
          HttpStatus.BAD_REQUEST,
        );

      mode_ = false
      flagAmd = false;
      contract_code = contractCode?.contract_code;
      if (contractCode.status_capacity_request_management_id === 2) {
        await this.restorePreviousVersion(id);
      }
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
      const { bookingTemplate, modeDayAndMonth, file_period_mode } =
        await this.capacityMiddleService.bookingTemplate(
          Number(contractCode?.term_type_id),
        );

      if (getTodayNowDDMMYYYYAdd7(contract_start_date).isSameOrAfter(getTodayNowDDMMYYYYAdd7(contract_end_date))) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: "The 'Period To' date must not be earlier than the 'Period From' date.",
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // let checkMinMax = false;

      // checkMinMax = this.capacityMiddleService.checkDateRange(
      //   contract_start_date,
      //   contract_end_date,
      //   bookingTemplate?.file_period_mode,
      //   bookingTemplate?.min,
      //   // Number(shadow_period),
      //   bookingTemplate?.max,
      // );

      // if (!checkMinMax) {
      //   let errorMessage = 'Date is NOT match';
      //   // if(bookingTemplate?.term_type?.name && bookingTemplate?.min && shadow_period && bookingTemplate?.file_period_mode){
      //   if (bookingTemplate?.term_type?.name && bookingTemplate?.min && bookingTemplate?.max && bookingTemplate?.file_period_mode) {
      //     const periodMode = bookingTemplate?.file_period_mode === 1 ? 'day' : bookingTemplate?.file_period_mode === 2 ? 'month' : bookingTemplate?.file_period_mode === 3 ? 'year' : '';
      //     let maxPeriodMode = periodMode
      //     let minPeriodMode = periodMode
      //     if (periodMode) {
      //       // if(shadow_period > 1){
      //       if (bookingTemplate.max > 1) {
      //         maxPeriodMode = `${periodMode}s`
      //       }
      //       if (bookingTemplate.min > 1) {
      //         minPeriodMode = `${periodMode}s`
      //       }
      //     }
      //     errorMessage = `${bookingTemplate?.term_type?.name ?? 'This contract'} can not be shorter than ${bookingTemplate?.min} ${minPeriodMode} and longer than ${bookingTemplate?.max} ${maxPeriodMode}.`
      //     // errorMessage = `${bookingTemplate?.term_type?.name ?? 'This contract'} can not be shorter than ${bookingTemplate?.min} ${minPeriodMode} and longer than ${shadow_period} ${maxPeriodMode}.`
      //   }

      //   throw new HttpException(
      //     {
      //       status: HttpStatus.BAD_REQUEST,
      //       error: errorMessage,
      //     },
      //     HttpStatus.BAD_REQUEST,
      //   );
      // }

      // -------------- case create row ------------
      // -------------------------------------------
      // ถ้าเป็นวันที่ 1 มันจะต้องลบไป 1 วัน ไม่งั้นในตารางจะแสดงเดือนเกิน
      const raw = dayjs(contract_end_date, 'DD/MM/YYYY');
      const d = dayjs(raw, "YYYY-MM-DD", true); // parse แบบ strict
      const isFirstOfMonth = d.date() === 1;

      let newContractEndDate = contract_end_date
      // ถ้าเป็น short term non firm ให้ -1 day
      if (contractCode?.term_type_id == 4) {
        newContractEndDate = d.subtract(1, "day").format("DD/MM/YYYY");
      } else {
        // เช็คว่า dataWithoutId.contract_end_date เป็นวันที่ 1 ของเดือนหรือไม่ ถ้าใช่ให้ลบ 1 วัน
        newContractEndDate = (isFirstOfMonth ? d.subtract(1, "day") : d).format("DD/MM/YYYY");
      }

      // ------------------------------------------
      // ------------------------------------------


      const fnExtendDateJSONNew = await this.fnExtendDateJSONNewForExtend({
        bookingTemplate: bookingTemplate,
        jsonFull: jsonFull,
        new_contract_start_date: contract_start_date,
        // new_contract_end_date: contract_end_date,
        new_contract_end_date: newContractEndDate,
        new_contract_end_date_key_six: contract_end_date, // เอาไปลง period TO key [6]
        startDate: dayjs(contractCode?.contract_start_date).format("DD/MM/YYYY"),
        endDateDate: dayjs(contractCode?.contract_end_date).format("DD/MM/YYYY"),
      })
      startDate = fnExtendDateJSONNew?.nstartDate
      resultDate = fnExtendDateJSONNew?.nresultDate
      // fnExtendDateJSONNew?.new_data_temp

      // return fnExtendDateJSONNew

      await this.prisma.extend_contract_capacity_request_management.create({
        data: {
          shadow_time: contractCode?.shadow_time || 0,
          shadow_period: contractCode?.shadow_period || 0,
          new_shadow_time: parseToNumber(shadow_period) || 0,
          new_shadow_period: parseToNumber(shadow_period) || 0,
          start_date: contract_start_date
            ? getTodayNowDDMMYYYYDfaultAdd7(contract_start_date).toDate()
            : null,
          end_date: contract_end_date
            ? getTodayNowDDMMYYYYDfaultAdd7(contract_end_date).toDate()
            : null,
          contract_code_id: contractCode?.id,
          temp_submitted_timestamp: getTodayNowAdd7().toDate(),
          file_period_mode: contractCode?.file_period_mode,
        },
      });

      let data_temp: any = fnExtendDateJSONNew?.new_data_temp;

      let newEntry = data_temp['entryValue'];
      let newExit = data_temp['exitValue'];


      // เพิ่ม version ------------------------------------------

      await this.prisma.booking_version.updateMany({
        where: {
          contract_code_id: contractCode?.id ?? -1,
        },
        data: {
          flag_use: false,
        },
      });

      const checkContractCodeCheckLength =
        await this.prisma.booking_version.count({
          where: {
            contract_code_id: contractCode?.id,
          },
        });

      const versId = await this.prisma.booking_version.create({
        data: {
          version: `v.${checkContractCodeCheckLength + 1}`,
          ...(!!contractCode?.id && {
            // new create ..
            contract_code: {
              connect: {
                id: contractCode?.id,
              },
            },
          }),
          flag_use: true,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
          submitted_timestamp: getTodayNowAdd7().toDate(),
          type_account: {
            connect: {
              id: contractCode?.type_account_id,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: contractCode?.status_capacity_request_management_id,
            },
          },
          contract_start_date: contract_start_date
            ? getTodayNowDDMMYYYYDfaultAdd7(contract_start_date).toDate()
            : null,
          contract_end_date: contract_end_date
            ? getTodayNowDDMMYYYYDfaultAdd7(contract_end_date).toDate()
            : null,
        },
      });

      await this.prisma.booking_full_json.create({
        data: {
          ...(!!versId?.id && {
            booking_version: {
              connect: {
                id: versId?.id,
              },
            },
          }),
          data_temp: JSON.stringify(data_temp),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
        },
      });

      let mapDataRowJson = [];

      for (let i = 0; i < newEntry.length; i++) {
        const contractPoint = contractPointAPI.find((fNe: any) => {
          // return fNe?.contract_point === newExit[i]['0'];
          return fNe?.contract_point === newEntry[i]['0'];
        });

        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 1,

          zone_text: contractPoint?.zone?.name,
          area_text: contractPoint?.area?.name,
          // contract_point: newExit[i]['0'],
          contract_point: newEntry[i]['0'],
          flag_use: true,
          // data_temp: JSON.stringify(newExit[i]),
          data_temp: JSON.stringify(newEntry[i]),
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }
      for (let i = 0; i < newExit.length; i++) {
        const contractPoint = contractPointAPI.find((fNe: any) => {
          return fNe?.contract_point === newExit[i]['0'];
        });

        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 2,

          zone_text: contractPoint?.zone?.name,
          area_text: contractPoint?.area?.name,
          contract_point: newExit[i]['0'],
          flag_use: true,
          data_temp: JSON.stringify(newExit[i]),
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }

      await this.prisma.booking_row_json.createMany({
        data: mapDataRowJson,
      });

      const csd = contract_start_date ? getTodayNowDDMMYYYYDfaultAdd7(contract_start_date) : null
      const newContractStartDate = csd != null && csd.isValid() ? csd.toDate() : contractCode?.contract_start_date

      await this.prisma.contract_code.updateMany({
        where: {
          id: Number(contractCode?.id ?? -1),
        },
        data: {
          contract_start_date: newContractStartDate,
          // contract_end_date: contract_end_date // เดิมโรงงาน
          //   ? getTodayNowDDMMYYYYDfaultAdd7(contract_end_date).toDate()
          //   : null,
          extend_deadline: contract_end_date ? getTodayNowDDMMYYYYDfaultAdd7(contract_end_date).toDate() : null,
          status_capacity_request_management_process_id: contractCode.status_capacity_request_management_id == 2 && todayStartDayjs.isSameOrAfter(csd) ? 1 : contractCode.status_capacity_request_management_process_id,
          shadow_period: parseToNumber(shadow_period) || 0, // update shadow_period ใหม่เข้าไปด้วย
          shadow_time: parseToNumber(shadow_time) || 0, // update shadow_time ใหม่เข้าไปด้วย
        },
      });

      // extend_deadline

      // ปรับใหม่ ------------------------------------------
      // valueExtend

      if (contractCode?.status_capacity_request_management_id === 2) {
        const { pnmatchData, setDataUse, logWarnings } =
          await this.capacityMiddleService.middleBooking(id, false);

        await this.capacityMiddleService.processGenPublicData(
          setDataUse,
          false,
        );

        console.time('path detail');
        await this.capacityMiddleService.genPathDetail(
          setDataUse,
          pnmatchData,
          id,
          userId,
        );
        console.timeEnd('path detail');
      }
    }

    return {
      message: 'Success',
      mode_: mode_
    };
  }

  async editVersion(payload: any, id: any, userId: any) {
    const {
      flagFromTo,
      booking_full_json,
      booking_row_json,
      terminateDate,
      fromDate,
      toDate,
    } = payload;
    const bookingVersion = await this.prisma.booking_version.findFirst({
      where: {
        id: Number(id),
      },
      include: {
        contract_code: true,
        booking_full_json: true,
        booking_row_json: true,
      },
    });

    const startDate = bookingVersion?.contract_code?.contract_start_date;
    const status =
      bookingVersion?.contract_code?.status_capacity_request_management_id;

    const nowDate = getTodayNowAdd7().toDate();

    const hasContractStarted =
      getTodayNowAdd7(nowDate).isAfter(getTodayNowAdd7(startDate)) ||
      getTodayNowAdd7(nowDate).isSame(getTodayNowAdd7(startDate));

    const modeDayAndMonth =
      bookingVersion?.contract_code?.term_type_id === 4 ? 1 : 2;
    const shadowPeriod = this.capacityMiddleService.genMD(
      fromDate,
      getTodayNowDDMMYYYYDfaultAdd7(toDate)
        .subtract(1, 'day')
        .format('DD/MM/YYYY'),
      modeDayAndMonth,
    );

    let newEntry = booking_row_json.filter((f: any) => {
      return f?.entry_exit_id === 1;
    });

    let newExit = booking_row_json.filter((f: any) => {
      return f?.entry_exit_id === 2;
    });
    // return payload
    // ------

    // area_text

    // https://app.clickup.com/t/86erqt8g5
    // const ckAreaDup = [...newEntry, ...newExit]?.map(
    //   (ar: any) => ar?.area_text,
    // );
    // const hasDuplicate = new Set(ckAreaDup).size !== ckAreaDup.length;
    // if (hasDuplicate) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Duplicate Contract Point found.',
    //       // error: 'Area is Contract Point Duplicate.',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    const ckAreaDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.area_text);
    const hasDuplicate = new Set(ckAreaDup).size !== ckAreaDup.length;

    const ckPointDup = [...newEntry, ...newExit]?.map((ar: any) => ar?.contract_point);
    const hasDuplicatePoint = new Set(ckPointDup).size !== ckPointDup.length;

    if (hasDuplicatePoint) {
      let ctPoint = []
      for (let i_ = 0; i_ < ckPointDup.length; i_++) {
        const contractPoint = await this.prisma.contract_point.findFirst({
          where:{
            contract_point: ckPointDup?.[i_]
          },
          select:{ contract_point:true },
        })
        if(!contractPoint){
          ctPoint.push(ckPointDup?.[i_])
        }
      }
      if(ctPoint?.length > 0){
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: `${ctPoint?.join(", ")} is not exit in TPA System`, // https://app.clickup.com/t/9018502823/86ey937n6
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Duplicate Contract Point found.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (hasDuplicate) {

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Only one Contract Point is allowed per Area.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (status === 2 && hasContractStarted) {
      let contract_code: any = null;
      let amdVersion: any = null;
      // amd
      const contractCode = await this.prisma.contract_code.findFirst({
        where: {
          id: bookingVersion?.contract_code?.ref_contract_code_by_main_id,
        },
        select: { contract_code: true },
      });
      const checkContractCodeCheckLength =
        await this.prisma.contract_code.count({
          where: {
            ref_contract_code_by_main_id: bookingVersion?.contract_code?.ref_contract_code_by_main_id,
          },
        });
      amdVersion =
        '_Amd' +
        String(
          checkContractCodeCheckLength > 9
            ? checkContractCodeCheckLength
            : '0' + checkContractCodeCheckLength,
        );
      contract_code = contractCode?.contract_code + amdVersion;

      const oldStatusID = bookingVersion?.contract_code?.status_capacity_request_management_id
      let statusCapacityRequestManagementProcessID = 1 // Active
      switch (oldStatusID) {
        case 1: // Saved
        case 4: // Confirmed
          statusCapacityRequestManagementProcessID = 3; // Waiting For Approval
          break;
        case 3: // Rejected
        case 5: // Terminated
          statusCapacityRequestManagementProcessID = 5; //Close
          break;
        default: // Approved
          if (fromDate) {
            const today = getTodayStartAdd7()
            const contractStartDate = getTodayStartDDMMYYYYAdd7(fromDate)
            if (contractStartDate.isAfter(today)) {
              statusCapacityRequestManagementProcessID = 2; // Waiting For Start Date
            } else {
              statusCapacityRequestManagementProcessID = 1; // Active
            }
          }
          else {
            statusCapacityRequestManagementProcessID = 2; // Waiting For Start Date
          }
          break;
      }

      const createContractCodeAmd = await this.prisma.contract_code.create({
        data: {
          contract_code: contract_code,
          ...(!!bookingVersion?.contract_code?.term_type_id && {
            term_type: {
              connect: {
                id: bookingVersion?.contract_code?.term_type_id,
              },
            },
          }),
          ...(!!bookingVersion?.contract_code?.group_id && {
            group: {
              connect: {
                id: bookingVersion?.contract_code?.group_id,
              },
            },
          }),
          status_capacity_request_management_process: {
            connect: {
              id: statusCapacityRequestManagementProcessID,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: oldStatusID,
            },
          },
          type_account: {
            connect: {
              id: bookingVersion?.contract_code?.type_account_id,
            },
          },
          ...(!!bookingVersion?.contract_code?.ref_contract_code_by_main_id && {
            ref_contract_code_by_main: {
              connect: {
                id: bookingVersion?.contract_code?.ref_contract_code_by_main_id,
              },
            },
          }),
          ...(!!bookingVersion?.contract_code?.id && {
            ref_contract_code_by: {
              connect: {
                id: bookingVersion?.contract_code?.id,
              },
            },
          }),
          // shadow_period: bookingVersion?.contract_code?.shadow_period,
          shadow_period: !!shadowPeriod ? Number(shadowPeriod) : 0,
          shadow_time: bookingVersion?.contract_code?.shadow_time,
          file_period_mode: bookingVersion?.contract_code?.file_period_mode,
          fixdayday: bookingVersion?.contract_code?.fixdayday,
          todayday: bookingVersion?.contract_code?.todayday,
          contract_start_date: fromDate
            ? getTodayNowDDMMYYYYDfault(fromDate).toDate()
            : null,
          contract_end_date: toDate
            ? getTodayNowDDMMYYYYDfault(toDate).toDate()
            : null,

          submitted_timestamp: nowDate,
          create_date: nowDate,
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
        },
      });
      try {
        //terminate เก่า
        // ยังไม่ได้รองรับจากปุ่ม amd เพิ่ม field termidate
        await this.updateStatusCapacityRequestManagement(
          bookingVersion?.contract_code?.id,
          {
            status_capacity_request_management_id: 5,
            terminate_date: terminateDate
              ? getTodayNowAdd7(terminateDate).toDate()
              : null,

            // shadow_time: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
            // shadow_period: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
            // reject_reasons: null, //"comment.." //status_capacity_request_management_id 3 ต้องมี ไม่ 3 ให้ null
          },
          userId,
          null,
        );
      } catch (error) {
        console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
      }

      const versId = await this.prisma.booking_version.create({
        data: {
          version: `v.1`,
          ...(!!createContractCodeAmd?.id && {
            contract_code: {
              connect: {
                id: createContractCodeAmd?.id,
              },
            },
          }),
          flag_use: true,
          create_date: nowDate,
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
          submitted_timestamp: getTodayNowAdd7().toDate(),
          type_account: {
            connect: {
              id: createContractCodeAmd?.type_account_id,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: createContractCodeAmd?.status_capacity_request_management_id,
            },
          },
          contract_start_date: fromDate
            ? getTodayNowDDMMYYYYDfault(fromDate).toDate()
            : null,
          contract_end_date: toDate
            ? getTodayNowDDMMYYYYDfault(toDate).toDate()
            : null,
        },
      });

      await this.prisma.booking_full_json.create({
        data: {
          ...(!!versId?.id && {
            booking_version: {
              connect: {
                id: versId?.id,
              },
            },
          }),
          data_temp: booking_full_json[0]?.data_temp,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
        },
      });

      let mapDataRowJson = [];

      for (let i = 0; i < newEntry.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 1,

          zone_text: newEntry[i]?.zone_text,
          area_text: newEntry[i]?.area_text,
          contract_point: newEntry[i]?.contract_point,
          flag_use: true,
          data_temp: newEntry[i]?.data_temp,
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }

      for (let i = 0; i < newExit.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 2,

          zone_text: newExit[i]?.zone_text,
          area_text: newExit[i]?.area_text,
          contract_point: newExit[i]?.contract_point,
          flag_use: true,
          data_temp: newExit[i]?.data_temp,
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }
      await this.prisma.booking_row_json.createMany({
        data: mapDataRowJson,
      });

      try {
        await this.updateStatusCapacityRequestManagement(
          createContractCodeAmd?.id,
          {
            status_capacity_request_management_id: 2,
            terminate_date: null, // "2024-12-14", //status_capacity_request_management_id 5 ต้องมี ไม่ 5 ให้ null
            // shadow_time: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
            // shadow_period: null, //status_capacity_request_management_id 2 ต้องมี ไม่ 2 ให้ null
            // reject_reasons: null, //"comment.." //status_capacity_request_management_id 3 ต้องมี ไม่ 3 ให้ null
          },
          userId,
          null,
        );
      } catch (error) {
        console.warn('⚠️ ละเว้น Error:', error.message); // แสดงเฉพาะ Warning แต่ไม่ให้โปรแกรมหยุด
      }

      // path detail
    } else {
      // getTodayNowYYYYMMDDDfaultAdd7
      // if (flagFromTo) {

      await this.prisma.contract_code.updateMany({
        where: {
          id: bookingVersion?.contract_code?.id ?? -1,
        },
        data: {
          shadow_period: !!shadowPeriod ? Number(shadowPeriod) : 0,
          contract_start_date: fromDate
            ? getTodayNowDDMMYYYYDfault(fromDate).toDate()
            : null,
          contract_end_date: toDate
            ? getTodayNowDDMMYYYYDfault(toDate).toDate()
            : null,
        },
      });

      await this.prisma.booking_version.updateMany({
        where: {
          contract_code_id: bookingVersion?.contract_code?.id ?? -1,
        },
        data: {
          flag_use: false,
        },
      });

      const checkContractCodeCheckLength =
        await this.prisma.booking_version.count({
          where: {
            contract_code_id: bookingVersion?.contract_code?.id,
          },
        });

      const versId = await this.prisma.booking_version.create({
        data: {
          version: `v.${checkContractCodeCheckLength + 1}`,
          ...(!!bookingVersion?.contract_code?.id && {
            // new create ..
            contract_code: {
              connect: {
                id: bookingVersion?.contract_code?.id,
              },
            },
          }),
          flag_use: true,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
          submitted_timestamp: getTodayNowAdd7().toDate(),
          type_account: {
            connect: {
              id: bookingVersion?.contract_code?.type_account_id,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: bookingVersion?.contract_code
                ?.status_capacity_request_management_id,
            },
          },
          contract_start_date: fromDate
            ? getTodayNowDDMMYYYYDfault(fromDate).toDate()
            : null,
          contract_end_date: toDate
            ? getTodayNowDDMMYYYYDfault(toDate).toDate()
            : null,
        },
      });

      await this.prisma.booking_full_json.create({
        data: {
          ...(!!versId?.id && {
            // new create ..
            booking_version: {
              connect: {
                id: versId?.id,
              },
            },
          }),
          data_temp: booking_full_json[0]?.data_temp,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
        },
      });

      let mapDataRowJson = [];

      for (let i = 0; i < newEntry.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 1,

          zone_text: newEntry[i]?.zone_text,
          area_text: newEntry[i]?.area_text,
          contract_point: newEntry[i]?.contract_point,
          flag_use: true,
          data_temp: newEntry[i]?.data_temp,
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }

      for (let i = 0; i < newExit.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 2,

          zone_text: newExit[i]?.zone_text,
          area_text: newExit[i]?.area_text,
          contract_point: newExit[i]?.contract_point,
          flag_use: true,
          data_temp: newExit[i]?.data_temp,
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }
      await this.prisma.booking_row_json.createMany({
        data: mapDataRowJson,
      });

      if (status === 2) {
        // คืนค่า
        const specificVersion = await this.prisma.booking_version.findFirst({
          where: {
            contract_code_id: Number(bookingVersion?.contract_code?.id),
            flag_use: false,
            status_capacity_request_management_id: 2,
          },
          include: {
            contract_code: true,
          },
          orderBy: { id: 'desc' },
        });
        const { setDataUse: resetDataUse } =
          await this.capacityMiddleService.middleBooking(
            bookingVersion?.contract_code?.id,
            true,
            specificVersion.id,
          );
        await this.capacityMiddleService.processGenPublicData(resetDataUse, true);


        const { pnmatchData, setDataUse, logWarnings } =
          await this.capacityMiddleService.middleBooking(bookingVersion?.contract_code?.id, false);
        await this.capacityMiddleService.processGenPublicData(
          setDataUse,
          false,
        );
        console.time('path detail');
        await this.capacityMiddleService.genPathDetail(
          setDataUse,
          pnmatchData,
          bookingVersion?.contract_code?.id,
          userId,
        );
        console.timeEnd('path detail');

      }

    }

    return bookingVersion;
  }

  async capacityRequestManagementDownload(id: any) {
    const bookingVersion = await this.prisma.booking_version.findUnique({
      where: { id: Number(id) },
      include: {
        booking_full_json: true,
        booking_row_json: true,
        contract_code: {
          select: {
            contract_code: true,
            group: {
              select: {
                id: true,
                id_name: true,
                name: true
              }
            }
          }
        }
      },
    });
    let newBK: any = null;

    newBK = bookingVersion;

    newBK['booking_full_json'] = await newBK?.booking_full_json.map(
      (e: any) => {
        const data_temp = JSON.parse(e['data_temp']);
        return { ...e, data_temp: data_temp };
      },
    );
    newBK['booking_row_json'] = await newBK?.booking_row_json.map((e: any) => {
      const data_temp = JSON.parse(e['data_temp']);
      return { ...e, data_temp: data_temp };
    });

    const shipperInfo =
      newBK['booking_full_json'][0]['data_temp']['shipperInfo'];

    // const ShipperName = Object.keys(shipperInfo)
    //   .map((key) => {
    //     return shipperInfo[key]['Shipper Name'];
    //   })
    //   .find((item) => item !== undefined);
    const ShipperCheck = Object.keys(shipperInfo).map((key) => {
      return shipperInfo[key]['Shipper Name'];
    }).find((item) => item !== undefined);
    const ShipperCheck_ = !!ShipperCheck ? 1 : 2 // 1 แบบเก่า 2 แบบใหม่
    const ShipperName = newBK?.contract_code?.group?.name
    const ShipperIDName = newBK?.contract_code?.group?.id_name

    const typeOfContract: any = Object.keys(shipperInfo)
      .map((key) => {
        return shipperInfo[key]['Type of Contract'];
      })
      .find((item) => item !== undefined);

    // const ContractCode = Object.keys(shipperInfo)
    //   .map((key) => {
    //     return shipperInfo[key]['Contract Code'];
    //   })
    //   .find((item) => item !== undefined);

    const ContractCode = newBK?.contract_code?.contract_code

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

    // const find_use = newBK['booking_full_json_release'].find((item:any) => item.flag_use == true)

    const entryValue = newBK['booking_full_json'][0]['data_temp']['entryValue'];
    // const entryValue = find_use['data_temp']['entryValue'];
    // const newEntry = this.capacityMiddleService.transformDataArrNew(entryValue);
    const newEntry = this.capacityMiddleService.transformDataArrNew_(entryValue, ShipperCheck_);
    const exitValue = newBK['booking_full_json'][0]['data_temp']['exitValue'];
    // const exitValue = find_use['data_temp']['exitValue'];
    // const newExit = this.capacityMiddleService.transformDataArrNew(exitValue);
    const newExit = this.capacityMiddleService.transformDataArrNew_(exitValue, ShipperCheck_);
    const sumEntry = newBK['booking_full_json'][0]['data_temp']['sumEntries'];
    // const sumEntry = find_use['data_temp']['sumEntries'];
    const filteredDataSumEntry = Object.fromEntries(
      Object.entries(sumEntry).filter(([key]) => key !== '0'),
    );
    // สร้างอาร์เรย์ที่ตำแหน่ง 0 เป็น "Sum Entry"
    const maxIndexEntry = Math.max(
      ...Object.keys(filteredDataSumEntry).map(Number),
    ); // หาค่าคีย์สูงสุด
    const arrayResultEntry_ = Array.from(
      { length: maxIndexEntry + 1 },
      (_, i) => (i === 0 ? 'Sum Entry' : filteredDataSumEntry[i] || ''),
    );
    const arrayResultEntry = ShipperCheck_ === 1 ? arrayResultEntry_?.filter((_, idx) => idx < 1 || idx > 4) : arrayResultEntry_

    const sumExit = newBK['booking_full_json'][0]['data_temp']['sumExits'];
    // const sumExit = find_use['data_temp']['sumExits'];

    const filteredDataSumExit = Object.fromEntries(
      Object.entries(sumExit).filter(([key]) => key !== '0'),
    );
    // สร้างอาร์เรย์ที่ตำแหน่ง 0 เป็น "Sum Exit"
    const maxIndexExit = Math.max(
      ...Object.keys(filteredDataSumExit).map(Number),
    ); // หาค่าคีย์สูงสุด
    const arrayResultExit_ = Array.from({ length: maxIndexExit + 1 }, (_, i) =>
      i === 0 ? 'Sum Exit' : filteredDataSumExit[i] || '',
    );
    const arrayResultExit = ShipperCheck_ === 1 ? arrayResultExit_?.filter((_, idx) => idx < 1 || idx > 4) : arrayResultExit_

    return await this.downloadCenterStyleXlsx({
      ShipperIDName,
      ShipperName,
      typeOfContract,
      ContractCode,
      capacityDailyBookingArrayMMB,
      maximumHourBookingMMBArray,
      capacityDailyBookingMMsArray,
      maximumHourBookingMMsArray,
      headerEntryArr1,
      headerEntryArr2,
      headerEntryArr3,
      headerEntryArr4,
      newEntry,
      arrayResultEntry,
      capacityDailyBookingArrayMMBExit,
      maximumHourBookingMMBArrayExit,
      headerExitArr1,
      headerExitArr2,
      newExit,
      arrayResultExit,
      bookingVersion,
    })
  }

  async capacityRequestManagementDownloadSummary(id: any) {
    const bookingVersion = await this.prisma.booking_version.findUnique({
      where: { id: Number(id) },
      include: {
        booking_full_json_release: true,
        booking_row_json_release: true,
        booking_full_json: true,
        booking_row_json: true,
        contract_code: {
          select: {
            contract_code: true,
            group: {
              select: {
                id: true,
                id_name: true,
                name: true
              }
            }
          }
        }
      },
    });
    let newBK: any = null;

    newBK = bookingVersion;

    if (newBK['booking_full_json_release']?.length === 0) {
      return await this.capacityRequestManagementDownload(id)
    } else {

      newBK['booking_full_json_release'] = await newBK?.booking_full_json_release.map(
        (e: any) => {
          const data_temp = JSON.parse(e['data_temp']);
          return { ...e, data_temp: data_temp };
        },
      );
      newBK['booking_row_json_release'] = await newBK?.booking_row_json_release.map((e: any) => {
        const data_temp = JSON.parse(e['data_temp']);
        return { ...e, data_temp: data_temp };
      });
      const shipperInfo =
        newBK['booking_full_json_release'][0]['data_temp']['shipperInfo'];

      // const ShipperName = Object.keys(shipperInfo)
      //   .map((key) => {
      //     return shipperInfo[key]['Shipper Name'];
      //   })
      //   .find((item) => item !== undefined);
      const ShipperCheck = Object.keys(shipperInfo).map((key) => {
        return shipperInfo[key]['Shipper Name'];
      }).find((item) => item !== undefined);
      const ShipperCheck_ = !!ShipperCheck ? 1 : 2 // 1 แบบเก่า 2 แบบใหม่
      const ShipperName = newBK?.contract_code?.group?.name
      const ShipperIDName = newBK?.contract_code?.group?.id_name

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
        newBK['booking_full_json_release'][0]['data_temp']['headerEntry'][
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
        newBK['booking_full_json_release'][0]['data_temp']['headerEntry'][
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
        newBK['booking_full_json_release'][0]['data_temp']['headerEntry'][
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
        newBK['booking_full_json_release'][0]['data_temp']['headerEntry'][
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
        newBK['booking_full_json_release'][0]['data_temp']['headerExit'][
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
        newBK['booking_full_json_release'][0]['data_temp']['headerExit'][
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

      const find_use = newBK['booking_full_json_release'].find((item: any) => item.flag_use == true)

      const entryValue = find_use['data_temp']['entryValue'];
      // const newEntry = this.capacityMiddleService.transformDataArrNew(entryValue);
      const newEntry = this.capacityMiddleService.transformDataArrNew_(entryValue, ShipperCheck_);
      const exitValue = find_use['data_temp']['exitValue'];
      // const newExit = this.capacityMiddleService.transformDataArrNew(exitValue);
      const newExit = this.capacityMiddleService.transformDataArrNew_(exitValue, ShipperCheck_);
      const sumEntry = find_use['data_temp']['sumEntries'];
      const filteredDataSumEntry = Object.fromEntries(
        Object.entries(sumEntry).filter(([key]) => key !== '0'),
      );
      // สร้างอาร์เรย์ที่ตำแหน่ง 0 เป็น "Sum Entry"
      const maxIndexEntry = Math.max(
        ...Object.keys(filteredDataSumEntry).map(Number),
      ); // หาค่าคีย์สูงสุด
      const arrayResultEntry_ = Array.from(
        { length: maxIndexEntry + 1 },
        (_, i) => (i === 0 ? 'Sum Entry' : filteredDataSumEntry[i] || ''),
      );
      const arrayResultEntry = ShipperCheck_ === 1 ? arrayResultEntry_?.filter((_, idx) => idx < 1 || idx > 4) : arrayResultEntry_

      const sumExit = find_use['data_temp']['sumExits'];
      const filteredDataSumExit = Object.fromEntries(
        Object.entries(sumExit).filter(([key]) => key !== '0'),
      );
      // สร้างอาร์เรย์ที่ตำแหน่ง 0 เป็น "Sum Exit"
      const maxIndexExit = Math.max(
        ...Object.keys(filteredDataSumExit).map(Number),
      ); // หาค่าคีย์สูงสุด
      const arrayResultExit_ = Array.from({ length: maxIndexExit + 1 }, (_, i) =>
        i === 0 ? 'Sum Exit' : filteredDataSumExit[i] || '',
      );
      const arrayResultExit = ShipperCheck_ === 1 ? arrayResultExit_?.filter((_, idx) => idx < 1 || idx > 4) : arrayResultExit_

      return await this.downloadCenterStyleXlsx({
        ShipperIDName,
        ShipperName,
        typeOfContract,
        ContractCode,
        capacityDailyBookingArrayMMB,
        maximumHourBookingMMBArray,
        capacityDailyBookingMMsArray,
        maximumHourBookingMMsArray,
        headerEntryArr1,
        headerEntryArr2,
        headerEntryArr3,
        headerEntryArr4,
        newEntry,
        arrayResultEntry,
        capacityDailyBookingArrayMMBExit,
        maximumHourBookingMMBArrayExit,
        headerExitArr1,
        headerExitArr2,
        newExit,
        arrayResultExit,
        bookingVersion,
      })
    }

  }

  formatNumberThreeDecimal(number: any) {
    const n = Number(number);
    if (!Number.isFinite(n)) return number;

    const factor = 1000;
    const adjusted = Math.trunc((n + (n >= 0 ? 1e-10 : -1e-10)) * factor) / factor;

    const sign = adjusted < 0 ? "-" : "";
    const abs = Math.abs(adjusted);

    const [i, d = ""] = abs.toString().split(".");
    const intWithComma = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const dec = d.padEnd(3, "0");

    return `${sign}${intWithComma}.${dec}`;
  }

  formatArrayResult = (arr: any[]) => {
    return arr.map((item) => {
      if (item === null || item === undefined || item === "") return item;

      const num = Number(String(item).replace(/,/g, "").trim());

      if (!Number.isFinite(num)) return item;

      return this.formatNumberThreeDecimal(num);
    });
  };

  formatNestedArrayThreeDecimal = (arr: any[]): any[] => {
    return arr.map((item) => {
      if (Array.isArray(item)) {
        return item.map((subItem) => {
          if (subItem === null || subItem === undefined || subItem === "") return subItem;

          const num = Number(String(subItem).replace(/,/g, "").trim());
          return Number.isFinite(num) ? this.formatNumberThreeDecimal(num) : subItem;
        });
      }

      if (item === null || item === undefined || item === "") return item;

      const num = Number(String(item).replace(/,/g, "").trim());
      return Number.isFinite(num) ? this.formatNumberThreeDecimal(num) : item;
    });
  };

  async downloadCenterStyleXlsx({
    ShipperIDName,
    ShipperName,
    typeOfContract,
    ContractCode,
    capacityDailyBookingArrayMMB,
    maximumHourBookingMMBArray,
    capacityDailyBookingMMsArray,
    maximumHourBookingMMsArray,
    headerEntryArr1,
    headerEntryArr2,
    headerEntryArr3,
    headerEntryArr4,
    newEntry,
    arrayResultEntry,
    capacityDailyBookingArrayMMBExit,
    maximumHourBookingMMBArrayExit,
    headerExitArr1,
    headerExitArr2,
    newExit,
    arrayResultExit,
    bookingVersion,
  }: any) {

    // log ดูพวกนี้
    // newEntry
    // newExit
    // arrayResultEntry
    // arrayResultExit

    // (อ่านคอมเม้นนะ) R3 : v1.0.90 ใน detail ควรที่จะมี comment และ export เหมือนใน capacity management https://app.clickup.com/t/86errdagj 
    newEntry = this.formatNestedArrayThreeDecimal(newEntry);
    newExit = this.formatNestedArrayThreeDecimal(newExit);
    arrayResultEntry = this.formatArrayResult(arrayResultEntry)
    arrayResultExit = this.formatArrayResult(arrayResultExit)

    const data = [
      [], // Row 0
      // ['Shipper Name', 'Type of Contract', 'Contract Code'], // Row 1
      // [ShipperName, typeOfContract, ContractCode], // Row 2
      ['Shipper ID', 'Type of Contract', 'Contract Code'],
      [ShipperIDName, typeOfContract, ContractCode],
      [], // Row 3 (empty row)
      [
        'Entry',
        // null,
        // null,
        // null,
        // null,
        'Period',
        '',
        ...capacityDailyBookingArrayMMB,
        ...maximumHourBookingMMBArray,
        ...capacityDailyBookingMMsArray,
        ...maximumHourBookingMMsArray,
      ],
      [
        '',
        // 'Pressure Range',
        // '',
        // 'Temperature Range',
        // '',
        'From',
        'To',
        ...headerEntryArr1,
        ...headerEntryArr2,
        ...headerEntryArr3,
        ...headerEntryArr4,
      ],
      // ['', 'Min', 'Max', 'Min', 'Max', '', ''],
      ['', '', ''],
      ...newEntry,
      arrayResultEntry,
      [],
      [
        'Exit',
        // null,
        // null,
        // null,
        // null,
        'Period',
        '',
        ...capacityDailyBookingArrayMMBExit,
        ...maximumHourBookingMMBArrayExit,
      ],
      [
        '',
        // 'Pressure Range',
        // '',
        // 'Temperature Range',
        // '',
        'From',
        'To',
        ...headerExitArr1,
        ...headerExitArr2,
      ],
      // ['', 'Min', 'Max', 'Min', 'Max', '', ''],
      ['', '', ''],
      ...newExit,
      arrayResultExit,
    ];

    // สร้าง workbook และ worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data); // สร้าง sheet จาก array ของ array
    const workbook = XLSX.utils.book_new(); // สร้าง workbook ใหม่
    XLSX.utils.book_append_sheet(workbook, worksheet, typeOfContract); // เพิ่ม sheet ลงใน workbook

    // Merge cells สำหรับ header ที่มีการรวม (merge ข้ามคอลัมน์และแถว)
    worksheet['!merges'] = [

      { s: { r: 4, c: 0 }, e: { r: 6, c: 0 } }, // Merge 'Entry' row header (r:4 to r:5)

      // period
      { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } },
      // form to
      { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },
      { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } },

      // Entry Merge dynamic สำหรับ capacityDailyBookingArrayMMB
      { s: { r: 4, c: 3 }, e: { r: 4, c: 3 + headerEntryArr1.length - 1 } },

      // Entry Merge dynamic สำหรับ maximumHourBookingMMBArray
      {
        s: { r: 4, c: 3 + headerEntryArr1.length },
        e: { r: 4, c: 3 + headerEntryArr1.length * 2 - 1 },
      },

      // Entry Merge dynamic สำหรับ capacityDailyBookingMMsArray
      {
        s: { r: 4, c: 3 + headerEntryArr1.length * 2 },
        e: { r: 4, c: 3 + headerEntryArr1.length * 3 - 1 },
      },

      // Entry Merge dynamic สำหรับ maximumHourBookingMMsArray
      {
        s: { r: 4, c: 3 + headerEntryArr1.length * 3 },
        e: { r: 4, c: 3 + headerEntryArr1.length * 4 - 1 },
      },

      //------

      {
        s: { r: 10 + (newEntry.length - 1), c: 0 },
        e: { r: 12 + (newEntry.length - 1), c: 0 },
      }, // Merge 'Entry' row header (r:4 to r:5)

      {
        s: { r: 10 + (newEntry.length - 1), c: 1 },
        e: { r: 10 + (newEntry.length - 1), c: 2 },
      },
      // // form to
      {
        s: { r: 11 + (newEntry.length - 1), c: 1 },
        e: { r: 12 + (newEntry.length - 1), c: 1 },
      },
      {
        s: { r: 11 + (newEntry.length - 1), c: 2 },
        e: { r: 12 + (newEntry.length - 1), c: 2 },
      },
      // Entry Merge dynamic สำหรับ capacityDailyBookingArrayMMBExit
      {
        s: { r: 10 + (newEntry.length - 1), c: 3 },
        e: {
          r: 10 + (newEntry.length - 1),
          c: 3 + headerEntryArr1.length - 1,
        },
      },
      // Entry Merge dynamic สำหรับ maximumHourBookingMMBArrayExit
      {
        s: { r: 10 + (newEntry.length - 1), c: 3 + headerEntryArr1.length },
        e: {
          r: 10 + (newEntry.length - 1),
          c: 3 + headerEntryArr1.length * 2 - 1,
        },
      },
    ];

    // Merge cells สำหรับ resultDate กับ row อันล่าง
    const resultDateCount = headerEntryArr1.length;

    for (let i = 0; i < resultDateCount * 4; i++) {
      const startColumnIndex = 3 + i;

      worksheet['!merges'].push({
        s: { r: 5, c: startColumnIndex }, // จุดเริ่มต้นการ merge จากแถวที่ 5
        e: { r: 6, c: startColumnIndex }, // จุดสิ้นสุดการ merge ในแถวที่ 6
      });
    }
    for (let i = 0; i < resultDateCount * 2; i++) {
      const startColumnIndex = 3 + i;

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
        const inRange = rowNumber >= 8 && rowNumber <= (8 + newEntry.length - 1)
        const inRangeExit = rowNumber >= (14 + newEntry.length - 1) && rowNumber <= ((14 + newEntry.length - 1) + newExit.length - 1)
        if (rowNumber === 3 || inRange || inRangeExit) {
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

        if (rowNumber === 6 && columnLetter >= 'AA' && columnLetter <= 'AG') {
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

        if (rowNumber === (12 + newEntry.length - 1) && columnLetter >= 'AA' && columnLetter <= 'AG') {
          worksheet[cell].s.font = {
            color: { rgb: 'FF0000' }, // เปลี่ยนสีข้อความเป็นสีแดง
            bold: true,
          };
        }

        if (rowNumber === (13 + newEntry.length - 1) && columnLetter >= 'AA' && columnLetter <= 'AG') {
          worksheet[cell].s.font = {
            color: { rgb: 'FF0000' },
            bold: true,
          };
        }

        // แปลงค่า worksheet[cell].v เป็นสตริงในรูปแบบ 'DD/MM/YYYY'
        const cellDate = worksheet[cell].v ? worksheet[cell].v.toString() : '';
        if (
          (rowNumber === 6 || rowNumber === (12 + newEntry.length - 1)) &&
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

  async duplicateVersion(id: any, userId: any) {
    const bookingVersion = await this.prisma.booking_version.findFirst({
      where: {
        id: Number(id),
      },
      include: {
        contract_code: true,
        booking_full_json: true,
        booking_row_json: true,
      },
    });

    const startDate = bookingVersion?.contract_code?.contract_start_date;
    const status =
      bookingVersion?.contract_code?.status_capacity_request_management_id;

    const nowDate = getTodayNowAdd7().toDate();

    const hasContractStarted =
      dayjs(nowDate).isAfter(dayjs(startDate)) ||
      dayjs(nowDate).isSame(dayjs(startDate));

    if (status === 2 && hasContractStarted) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          // error: 'สัญญาเริ่มไปแล้ว duplicate ไม่ได้',
          error: 'Cannot duplicate Contract already active.',
        },
        HttpStatus.BAD_REQUEST,
      );
    } else {
      await this.prisma.booking_version.updateMany({
        where: {
          contract_code_id: bookingVersion?.contract_code?.id ?? -1,
        },
        data: {
          flag_use: false,
        },
      });

      const checkContractCodeCheckLength =
        await this.prisma.booking_version.count({
          where: {
            contract_code_id: bookingVersion?.contract_code?.id,
          },
        });

      const versId = await this.prisma.booking_version.create({
        data: {
          version: `v.${checkContractCodeCheckLength + 1}`,
          ...(!!bookingVersion?.contract_code?.id && {
            // new create ..
            contract_code: {
              connect: {
                id: bookingVersion?.contract_code?.id,
              },
            },
          }),
          flag_use: true,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
          submitted_timestamp: getTodayNowAdd7().toDate(),
          type_account: {
            connect: {
              id: bookingVersion?.contract_code?.type_account_id,
            },
          },
          status_capacity_request_management: {
            connect: {
              id: bookingVersion?.contract_code
                ?.status_capacity_request_management_id,
            },
          },
          contract_start_date:
            bookingVersion?.contract_code?.contract_start_date,
          contract_end_date: bookingVersion?.contract_code?.contract_end_date,
        },
      });

      await this.prisma.contract_code.update({
        where: {
          id: bookingVersion?.contract_code?.id ?? -1,
        },
        data: {
          submitted_timestamp: getTodayNowAdd7().toDate(),
        },
      });

      await this.prisma.booking_full_json.create({
        data: {
          ...(!!versId?.id && {
            // new create ..
            booking_version: {
              connect: {
                id: versId?.id,
              },
            },
          }),
          data_temp: bookingVersion?.booking_full_json[0]?.data_temp,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            },
          },
        },
      });

      let mapDataRowJson = [];
      let newEntry = bookingVersion?.booking_row_json.filter((f: any) => {
        return f?.entry_exit_id === 1;
      });
      for (let i = 0; i < newEntry.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 1,

          zone_text: newEntry[i]?.zone_text,
          area_text: newEntry[i]?.area_text,
          contract_point: newEntry[i]?.contract_point,
          flag_use: true,
          data_temp: newEntry[i]?.data_temp,
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }
      let newExit = bookingVersion?.booking_row_json.filter((f: any) => {
        return f?.entry_exit_id === 2;
      });
      for (let i = 0; i < newExit.length; i++) {
        mapDataRowJson.push({
          booking_version_id: versId?.id,
          entry_exit_id: 2,

          zone_text: newExit[i]?.zone_text,
          area_text: newExit[i]?.area_text,
          contract_point: newExit[i]?.contract_point,
          flag_use: true,
          data_temp: newExit[i]?.data_temp,
          create_by: Number(userId),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
        });
      }
      await this.prisma.booking_row_json.createMany({
        data: mapDataRowJson,
      });
    }

    return bookingVersion;
  }

  async getPeriod(id: any) {
    // const pageSize = 1000; // หรือปรับตามเหมาะสม
    // const pageSize = 2000; // หรือปรับตามเหมาะสม
    const pageSize = 8000; // หรือปรับตามเหมาะสม
    // const minPageSize = 1000;
    // const maxPageSize = 20000;
    let resData = [];
    // let skip = 0;
    let hasMore = true;
    let lastId: number | undefined = undefined;

    const baseWhere = {
      period: { not: null },
      capacity_detail_point: {
        capacity_detail: {
          flag_use: true,
          contract_code_id: Number(id),
        },
      },
    };

    const baseSelect = {
      path_id: true,
      id: true,
      date: true,
      period: true,
      area_id: true,
      value: true,
      ck_comparea: true,
      ckCompare: true,
      adjust: true,
      adjust_type: true,
      area_nominal_capacity: true,
      cals: true,
      release: true,
      capacity_detail_point_id: true,
      area: {
        select: {
          id: true,
          name: true,
          color: true,
          entry_exit: {
            select: {
              name: true,
            },
          },
        },
      },
      capacity_detail_point: {
        select: {
          id: true,
          // path_temp: true,
          // path_temp_json: true,
          capacity_detail_id: true,
          area_id: true,
          area: {
            select: {
              id: true,
              name: true,
              color: true,
              entry_exit: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    }


    console.time('start');
    while (hasMore) {
      const batch = await this.prisma.capacity_detail_point_date.findMany({
        where: baseWhere,
        select: baseSelect,
        orderBy: {
          id: 'asc',
        },
        take: pageSize,
        ...(lastId && {
          cursor: { id: lastId },
          skip: 1,       // ข้ามตัวที่ใช้เป็น cursor
        }),
      });

      resData.push(...batch);

      if (batch.length < pageSize) {
        hasMore = false;
      } else {
        lastId = batch[batch.length - 1].id;
      }
    }
    console.timeEnd('start');

    const pathManage = await this.prisma.capacity_detail_point.findFirst({
      where: {
        capacity_detail: {
          flag_use: true,
          contract_code_id: Number(id),
        },
        capacity_detail_point_date: {
          some: {
            period: {
              not: null
            },
          },
        },
        // capacity_detail_point_date: {
        //   some: {
        //     period: { not: null },
        //     capacity_detail_point: {
        //       capacity_detail: {
        //         flag_use: true,
        //         contract_code_id: Number(id),
        //       },
        //     },
        //   },
        // },
      },
    });

    const booking_full_json = await this.prisma.booking_full_json.findFirst({
      where: {
        booking_version: {
          flag_use: true,
          contract_code_id: Number(id),
        }
      },
      orderBy: {
        create_date: 'desc',
      },
      include: {
        booking_version: {
          select: {
            contract_code: {
              select: {
                term_type: true,
                term_type_id: true
              }
            }
          }
        }
      }
    })

    const bookingFull = JSON.parse(booking_full_json?.data_temp ?? '{}')

    const booking_row_json = await this.prisma.booking_row_json.findMany({
      where: {
        booking_version: {
          flag_use: true,
          contract_code_id: Number(id),
        },
        flag_use: true
      }
    })


    if (resData.length > 0) {
      let newResData = resData.map((e: any) => {
        return { ...e };
      });

      const groupByPeriod = (data) => {
        return data.reduce((acc, curr) => {
          // หา period ที่มีอยู่ใน acc หรือสร้างใหม่ถ้าไม่มี
          const periodGroup = acc.find((group) => group.period === curr.period);
          if (periodGroup) {
            periodGroup.data.push(curr);
          } else {
            acc.push({
              period: curr.period,
              data: [curr],
            });
          }
          return acc;
        }, []);
      };

      // เรียกใช้ฟังก์ชัน
      const resultPeriod = groupByPeriod(newResData);

      const addStartDate = (data) => {
        return data.map((group) => {
          // หาวันที่ที่น้อยที่สุดใน group.data โดยใช้ dayjs
          const startDate = group.data
            .map((item) => dayjs(item.date)) // แปลง date เป็น dayjs object
            .sort((a, b) => a.valueOf() - b.valueOf())[0]; // เรียงตามเวลาที่น้อยสุด

          return {
            ...group,
            startDate: startDate.format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'), // แปลงเป็น ISO string
          };
        });
      };

      // เรียกใช้งานฟังก์ชัน
      const resultStartDate = addStartDate(resultPeriod);

      // ฟังก์ชันเพิ่ม endDate โดยดูจาก startDate ของ period ถัดไป
      const addEndDates = (data) => {
        return data.map((group, index, array) => {
          const nextGroup = array[index + 1]; // หา period ถัดไป
          const endDate = nextGroup
            ? dayjs(nextGroup.startDate)
              .subtract(1, 'day')
              .format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')
            : group.data
              .map((item) => dayjs(item.date)) // ใช้วันที่จาก group.data
              .sort((a, b) => b.valueOf() - a.valueOf())[0] // เรียงตามวันที่มากสุด
              .format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'); // แปลงเป็น ISO string
          return {
            ...group,
            endDate, // ใส่ endDate ที่หาได้
          };
        });
      };

      // เรียกใช้ฟังก์ชัน
      const resultEndDate = addEndDates(resultStartDate);

      // ฟังก์ชัน group data ตาม area_id
      const groupDataByArea = (data) => {
        return data.map((group) => {
          const startDate = dayjs(group.startDate, 'YYYY-MM-DDTHH:mm:ss.SSS[Z]')
          const endDate = dayjs(group.endDate, 'YYYY-MM-DDTHH:mm:ss.SSS[Z]')
          // ใช้ reduce จัดกลุ่มข้อมูลภายใน data ตาม area_id
          const groupedByArea = group.data.reduce((acc, item) => {
            const key = item.area_id;
            if (!acc[key]) {
              const isShortTermNonFirm = booking_full_json?.booking_version?.contract_code?.term_type_id == 4
              const dateArray: string[] = [];
              let current = startDate;
              if (isShortTermNonFirm) {
                while (current.isSameOrBefore(endDate)) {
                  dateArray.push(current.tz('Asia/Bangkok').format('DD/MM/YYYY'));
                  current = current.add(1, 'day');
                }
              }
              else {
                current = startDate.startOf('month');
                while (current.isSameOrBefore(endDate)) {
                  dateArray.push(current.tz('Asia/Bangkok').format('DD/MM/YYYY'));
                  current = current.add(1, 'month');
                }
              }

              let bookingValueList = []
              if (isMatch(item.area?.entry_exit?.name, 'Entry') && bookingFull?.headerEntry?.['Capacity Daily Booking (MMBTU/d)'] && bookingFull?.entryValue && Array.isArray(bookingFull?.entryValue)) {
                const header = bookingFull?.headerEntry?.['Capacity Daily Booking (MMBTU/d)']
                Object.keys(header)
                  .filter(key => dateArray.includes(key))
                  .map(key => bookingValueList.push({
                    date: key,
                    key: header[key].key,
                    value: null
                  }))


                booking_row_json.filter(row => {
                  return row.entry_exit_id == 1 && isMatch(row.area_text, item.area?.name)
                }).map(row => {
                  const dataTemp = JSON.parse(row.data_temp)
                  bookingValueList = bookingValueList.map((bookingValue: any) => {
                    const value = parseToNumber(dataTemp[bookingValue.key])
                    if (bookingValue.value != null && value != null) {
                      bookingValue.value = bookingValue.value + value
                    }
                    else {
                      bookingValue.value = value
                    }
                    return bookingValue
                  })
                })
              }
              else if (isMatch(item.area?.entry_exit?.name, 'Exit') && bookingFull?.headerExit?.['Capacity Daily Booking (MMBTU/d)'] && bookingFull?.exitValue && Array.isArray(bookingFull?.exitValue)) {
                const header = bookingFull?.headerExit?.['Capacity Daily Booking (MMBTU/d)']
                Object.keys(header)
                  .filter(key => dateArray.includes(key))
                  .map(key => bookingValueList.push({
                    date: key,
                    key: header[key].key,
                    value: null
                  }))

                booking_row_json.filter(row => {
                  return row.entry_exit_id == 2 && isMatch(row.area_text, item.area?.name)
                }).map(row => {
                  const dataTemp = JSON.parse(row.data_temp)
                  bookingValueList = bookingValueList.map((bookingValue: any) => {
                    const value = parseToNumber(dataTemp[bookingValue.key])
                    if (bookingValue.value != null && value != null) {
                      bookingValue.value = bookingValue.value + value
                    }
                    else {
                      bookingValue.value = value
                    }
                    return bookingValue
                  })
                })
              }

              acc[key] = {
                area_id: key,
                area: item.area,
                capacityRight: Math.max(...bookingValueList.map(booking => booking.value || 0)),
                dataGroupArea: [],
              };
            }
            acc[key].dataGroupArea.push(item);
            return acc;
          }, {});
          // แปลง object กลับเป็น array
          return {
            ...group,
            data: Object.values(groupedByArea),
          };
        });
      };

      // เรียกใช้ฟังก์ชัน
      const resultAreaGroup = groupDataByArea(resultEndDate);

      // ฟังก์ชันจัดกลุ่มตาม capacity_detail_point_id
      const groupByCapacityDetailPointId = (data) => {
        return data.map((group) => ({
          ...group,
          data: group.data.map((areaGroup) => ({
            ...areaGroup,
            dataGroupArea: Object.values(
              areaGroup.dataGroupArea.reduce((acc, item) => {
                const key = item.capacity_detail_point_id;
                if (!acc[key]) {
                  acc[key] = {
                    capacity_detail_point: item?.capacity_detail_point,
                    capacity_detail_point_id: key,
                    data: [],
                  };
                }
                acc[key].data.push(item);
                return acc;
              }, {}),
            ),
          })),
        }));
      };

      const resultGroupPoint = groupByCapacityDetailPointId(resultAreaGroup);
      // return resultGroupPoint;
      return {
        data: resultGroupPoint,
        pathManage: pathManage,
      };
    } else {
      return [];
    }
  }

}
