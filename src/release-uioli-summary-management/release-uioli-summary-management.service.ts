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
import {getTodayNowAdd7} from 'src/common/utils/date.util'
import {getGroupData} from 'src/common/utils/group.util'
import { parseToNumber3Decimal } from 'src/common/utils/number.util'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ReleaseUioliSummaryManagementService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async findAll(userId: any) {
    const {group, isShipper} =
      await getGroupData(
        this.prisma,
        userId
      )
    const resData =
      await this.prisma.release_summary.findMany(
        {
          where: {
            ...(isShipper && {
              group_id: {
                in: group.map(
                  (f: any) =>
                    f?.id
                )
              }
            })
          },
          include: {
            release_summary_comment:
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
            group: true,
            contract_code: true,
            release_type: true,
            release_summary_detail:
              {
                include: {
                  entry_exit: true,
                  booking_row_json: true,
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
          }
        }
      )
    return resData
  }

  async comment(
    payload: any,
    userId: any
  ) {
    const {id, comments} =
      payload

    const dateCre =
      getTodayNowAdd7()

    const resData =
      await this.prisma.release_summary_comment.create(
        {
          data: {
            ...(!!id && {
              release_summary:
                {
                  connect: {
                    id: Number(
                      id
                    )
                  }
                }
            }),
            comments:
              comments,
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
          }
        }
      )

    return resData
  }
  


  // เพิ่ม structure เก็บจำนวน release
  async confirmCapacity(payload: any, userId: any) {
    const resData = await this.prisma.release_summary.findFirst({
      where: {
        id: Number(payload?.id),
      },
      include: {
        release_summary_comment: {
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
        group: true,
        contract_code: true,
        release_type: true,
        release_summary_detail: {
          include: {
            entry_exit: true,
            // booking_row_json:true,
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
      },
    });
    const contractCodeId = resData?.contract_code?.id;

    const booking = await this.prisma.booking_version.findFirst({
      where: {
        flag_use: true,
        contract_code_id: Number(contractCodeId),
      },
      include: {
        booking_full_json: true,
        booking_row_json: true,
        booking_row_json_release: {
          where: {
            flag_use: true,
          },
        },
        booking_full_json_release: {
          where: {
            flag_use: true,
          },
        },
      },
      take: 1,
      orderBy: {
        id: 'desc',
      },
    });

    let fullJson = (booking?.booking_full_json_release.length > 0 ? booking?.booking_full_json_release : booking?.booking_full_json).map((e: any) => {
      e['data_temp'] = JSON.parse(e['data_temp']);
      return e;
    });

    let fullRow = (booking?.booking_row_json_release.length > 0 ? booking?.booking_row_json_release : booking?.booking_row_json).map((e: any) => {
      e['data_temp'] = JSON.parse(e['data_temp']);
      return e;
    });
    // const valuesKey = 35;
    const valuesKey = 7;
    let nRowJson = fullRow.map((e: any) => {
      const maxKey = Math.max(...Object.keys(e.data_temp).map(Number).filter(key => Number.isFinite(key))); // .filter(key => Number.isFinite(key) | "entryValue": [{"undefined": "" }], "exitValue": [{"undefined": "" }]
      const numGroups = Number(e?.entry_exit_id) === 1 ? 4 : 2; // แบ่งเป็น 4 , 2 ช่วง
      // คำนวณขนาดของแต่ละช่วง
      const rangeSize = Math.ceil((maxKey - valuesKey + 1) / numGroups);

      const ranges = [];
      for (let i = 0; i < numGroups; i++) {
        const start = valuesKey + i * rangeSize;
        let end = start + rangeSize - 1;

        // จำกัดค่าของ end ไม่ให้เกิน maxKey
        if (end > maxKey) end = maxKey;

        ranges.push([start, end]);

        // ถ้า end ถึง maxKey แล้วให้หยุด
        if (end === maxKey) break;
      }

      const startDateR = dayjs(payload?.releaseStartCalc, 'DD/MM/YYYY');
      const endDateR = dayjs(payload?.releaseEndCalc, 'DD/MM/YYYY');

      for (let key = valuesKey; key <= maxKey; key++) {
        let isInRange = false;

        if (e.data_temp[key] !== undefined) {
          if (Number(e?.entry_exit_id) === 1) {
            const entryMMBTUD = ranges[0];
            const entryMMMSCFD = ranges[2];
            const isInRangeMMBTU = Number(key) >= entryMMBTUD[0] && Number(key) <= entryMMBTUD[1];
            const isInRangeMMSCF = Number(key) >= entryMMMSCFD[0] && Number(key) <= entryMMMSCFD[1];

            if (
              isInRangeMMBTU &&
              !!payload?.contract_point_entry_exit.find((ff: any) => {
                return ff === e['contract_point'];
              })
            ) {
              let hentMMBTU = fullJson[0]?.data_temp?.headerEntry['Capacity Daily Booking (MMBTU/d)'];
              Object.entries(hentMMBTU).forEach(([dateStr, obj]: any) => {
                const currentDate = dayjs(dateStr, 'DD/MM/YYYY'); // แปลงวันที่จาก hentMMBTU
                if (
                  String(obj.key) === String(key) &&
                  dayjs(currentDate).isBetween(startDateR, endDateR, 'month', '[]')
                  // currentDate.isSameOrAfter(startDateR)
                  // &&
                  // currentDate.isSameOrBefore(endDateR)
                ) {
                  isInRange = true;
                }
              });
              //
              if (isInRange) {
                e.data_temp[key] = parseToNumber3Decimal(
                  (
                    (
                      !!Number(String(e.data_temp[key])?.replace(/,/g, ''))
                      && Number(String(e.data_temp[key])?.replace(/,/g, ''))
                    ) || 0
                  ) - (
                    (
                      !!Number(payload?.mmbtu_d?.replace(/,/g, ''))
                      && Number(payload?.mmbtu_d?.replace(/,/g, ''))
                    ) || 0
                  )
                );
                if (Number(e.data_temp[key]) <= 0) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: 'Could not Confirm Capacity over than Capacity Right.',
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                } else {
                  e.data_temp[key] = e.data_temp[key];
                }
              } else {
                e.data_temp[key] = e.data_temp[key];
              }
            } else if (
              isInRangeMMSCF &&
              !!payload?.contract_point_entry_exit.find((ff: any) => {
                return ff === e['contract_point'];
              })
            ) {
              let hentMMSCF = fullJson[0]?.data_temp?.headerEntry['Capacity Daily Booking (MMscfd)'];
              Object.entries(hentMMSCF).forEach(([dateStr, obj]: any) => {
                const currentDate = dayjs(dateStr, 'DD/MM/YYYY'); // แปลงวันที่จาก hentMMBTU
                if (
                  String(obj.key) === String(key) &&
                  dayjs(currentDate).isBetween(startDateR, endDateR, 'month', '[]')
                  // currentDate.isSameOrAfter(startDateR)
                  // &&
                  // currentDate.isSameOrBefore(endDateR)
                ) {
                  isInRange = true;
                }
              });
              if (isInRange) {
                e.data_temp[key] = parseToNumber3Decimal(
                  (
                    (
                      !!Number(String(e.data_temp[key])?.replace(/,/g, ''))
                    && Number(String(e.data_temp[key])?.replace(/,/g, ''))
                    ) || 0
                  ) - (
                    (
                      !!Number(payload?.mmscfd_d?.replace(/,/g, ''))
                      && Number(payload?.mmscfd_d?.replace(/,/g, ''))
                    ) || 0
                  )
                );
                if (Number(e.data_temp[key]) <= 0) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: 'Could not Confirm Capacity over than Capacity Right.',
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                } else {
                  e.data_temp[key] = e.data_temp[key];
                }
              } else {
                e.data_temp[key] = e.data_temp[key];
              }
            } else {
              e.data_temp[key] = e.data_temp[key];
            }
          } else {
            const entryMMBTUD = ranges[0];
            const isInRangeMMBTU = Number(key) >= entryMMBTUD[0] && Number(key) <= entryMMBTUD[1];
            if (
              isInRangeMMBTU &&
              !!payload?.contract_point_entry_exit.find((ff: any) => {
                return ff === e['contract_point'];
              })
            ) {
              let heexMMBTU = fullJson[0]?.data_temp?.headerEntry['Capacity Daily Booking (MMBTU/d)'];
              Object.entries(heexMMBTU).forEach(([dateStr, obj]: any) => {
                const currentDate = dayjs(dateStr, 'DD/MM/YYYY'); // แปลงวันที่จาก hentMMBTU
                if (
                  String(obj.key) === String(key) &&
                  dayjs(currentDate).isBetween(startDateR, endDateR, 'month', '[]')
                  // currentDate.isSameOrAfter(startDateR)
                  // &&
                  // currentDate.isSameOrBefore(endDateR)
                ) {
                  isInRange = true;
                }
              });
              //
              if (isInRange) {
                e.data_temp[key] = parseToNumber3Decimal(
                  (
                    (
                      !!Number(String(e.data_temp[key])?.replace(/,/g, ''))
                      && Number(String(e.data_temp[key])?.replace(/,/g, ''))
                    ) || 0
                  ) - (
                    (
                      !!Number(payload?.mmbtu_d?.replace(/,/g, ''))
                      && Number(payload?.mmbtu_d?.replace(/,/g, ''))
                    ) || 0
                  )
                );
                if (Number(e.data_temp[key]) <= 0) {
                  throw new HttpException(
                    {
                      status: HttpStatus.BAD_REQUEST,
                      error: 'Could not Confirm Capacity over than Capacity Right.',
                    },
                    HttpStatus.BAD_REQUEST,
                  );
                } else {
                  e.data_temp[key] = e.data_temp[key];
                }
              } else {
                e.data_temp[key] = e.data_temp[key];
              }
            } else {
              e.data_temp[key] = e.data_temp[key];
            }
          }
        }
      }
      e['data_temp'] = JSON.stringify(e['data_temp']);
      delete e['id'];

      e['create_date'] = getTodayNowAdd7().toDate();
      e['create_by'] = Number(userId);
      e['create_date_num'] = getTodayNowAdd7().unix();
      // e['create_by_account'] = {
      //   connect: {
      //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
      //   },
      // }

      return e;
    });
    //  e.data_temp[key].replace
    let nFullJson = fullJson.map((e: any) => {
      const entryValueArray = nRowJson
        .filter((ff: any) => {
          return ff?.entry_exit_id === 1;
        })
        .map((ef: any) => JSON.parse(ef?.data_temp));
      const exitValueArray = nRowJson
        .filter((ff: any) => {
          return ff?.entry_exit_id === 2;
        })
        .map((ef: any) => JSON.parse(ef?.data_temp));

      e['data_temp']['entryValue'] = entryValueArray;
      e['data_temp']['exitValue'] = exitValueArray;

      // ขั้นที่สอง: เตรียม `sumEntries` และ `sumExits`
      const sumEntries: {
        [key: string]: number | string;
      } = {
        '0': 'Sum Entry',
      };
      const sumExits: {
        [key: string]: number | string;
      } = {
        '0': 'Sum Exit',
      };

      // รวมค่าใน entryValue
      if (Array.isArray(entryValueArray)) {
        entryValueArray.forEach((entryObj: any) => {
          const maxKeyEntry = Math.max(...Object.keys(entryObj || {}).map(Number).filter(key => Number.isFinite(key))); // .filter(key => Number.isFinite(key) | "entryValue": [{"undefined": "" }], "exitValue": [{"undefined": "" }]

          // for (let key = 35; key <= maxKeyEntry; key++) {
          for (let key = 7; key <= maxKeyEntry; key++) {
            const entryValue = parseToNumber3Decimal(entryObj[key]) || 0;

            // รวมค่าใน sumEntries
            if (!sumEntries[key]) {
              sumEntries[key] = entryValue;
            } else {
              sumEntries[key] = parseToNumber3Decimal(parseToNumber3Decimal(sumEntries[key]) + entryValue);
            }
          }
        });
      }

      // รวมค่าใน exitValue
      if (Array.isArray(exitValueArray)) {
        exitValueArray.forEach((exitObj: any) => {
          const maxKeyExit = Math.max(...Object.keys(exitObj || {}).map(Number).filter(key => Number.isFinite(key))); // .filter(key => Number.isFinite(key) | "entryValue": [{"undefined": "" }], "exitValue": [{"undefined": "" }]

          // for (let key = 35; key <= maxKeyExit; key++) {
          for (let key = 7; key <= maxKeyExit; key++) {
            const exitValue = parseToNumber3Decimal(exitObj[key]) || 0;

            // รวมค่าใน sumExits
            if (!sumExits[key]) {
              sumExits[key] = exitValue;
            } else {
              sumExits[key] = parseToNumber3Decimal(parseToNumber3Decimal(sumExits[key]) + exitValue);
            }
          }
        });
      }

      // ใส่ผลรวมใน `data_temp`
      e.data_temp.sumEntries = sumEntries;
      e.data_temp.sumExits = sumExits;

      e['data_temp'] = JSON.stringify(e['data_temp']);
      delete e['id'];

      e['flag_use'] = true;

      e['create_date'] = getTodayNowAdd7().toDate();
      e['create_by'] = Number(userId);
      e['create_date_num'] = getTodayNowAdd7().unix();
      // e['create_by_account'] = {
      //   connect: {
      //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
      //   },
      // }

      return e;
    });

    if (nFullJson.length > 0) {
      await this.prisma.booking_full_json_release.updateMany({
        where: {
          booking_version_id: Number(booking?.id ?? -1),
        },
        data: {
          flag_use: false,
        },
      });
      await this.prisma.booking_full_json_release.create({
        data: nFullJson[0],
      });
    }

    if (nRowJson.length > 0) {
      await this.prisma.booking_row_json_release.updateMany({
        where: {
          booking_version_id: Number(booking?.id ?? -1),
        },
        data: {
          flag_use: false,
        },
      });
      await this.prisma.booking_row_json_release.createMany({
        data: nRowJson,
      });
    }

    const release_summary_confirm_log = await this.prisma.release_summary_confirm_log.create({
      data: {
        release_summary: {
          connect: {
            id: Number(payload?.id),
          },
        },
        mmbtu_d: payload?.mmbtu_d,
        mmscfd_d: payload?.mmscfd_d,
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          },
        },
      },
    });

    return {
      payload,
      contractCodeId,
      booking,
      resData,
      nRowJson,
      nFullJson,
      release_summary_confirm_log,
    };
  }
}
