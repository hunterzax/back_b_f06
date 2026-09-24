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
import {TranfClientService} from 'src/grpc/tranf-service.service'
import {
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class CapacityPublicationService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly tranfService: TranfClientService
  ) {}

  generateData(data: any) {
    const startDate = dayjs(
      `2024-12-01`
    ) // 01/01/yyyy
    const endDate = dayjs(
      `2024-12-30`
    ) // 10 ปีข้างหน้า

    return data.map(
      (item) => {
        const dayData = []
        let currentDate =
          startDate

        while (
          currentDate.isBefore(
            endDate
          )
        ) {
          const formattedDate =
            currentDate.format(
              'YYYY-MM-DD'
            ) // dd/MM/yyyy
          let valueAd =
            item.area_nominal_capacity
          if (
            item
              ?.capacity_publication
              .length > 0
          ) {
            const finds =
              item?.capacity_publication[0]?.capacity_publication_date.find(
                (f: any) => {
                  return (
                    dayjs(
                      f?.date_day
                    ).format(
                      'YYYY-MM-DD'
                    ) ===
                    formattedDate
                  )
                }
              )
            if (!!finds) {
              if (
                !!finds?.value_adjust_use
              ) {
                valueAd =
                  finds?.value_adjust_use
              } else if (
                !!finds?.value_adjust
              ) {
                valueAd =
                  finds?.value_adjust
              } else if (
                !!finds?.value
              ) {
                valueAd =
                  finds?.value
              }
            }
          }
          dayData.push({
            [formattedDate]: {
              area_nominal_capacity:
                Number(
                  valueAd
                )
            }
          })
          currentDate =
            currentDate.add(
              1,
              'day'
            ) // เพิ่มวันทีละ 1 วัน
        }

        return {
          ...item,
          day_data: dayData
        }
      }
    )
  }

  async findAll() {
    const areaAll =
      await this.prisma.area.findMany(
        {
          include: {
            entry_exit: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            zone: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            capacity_publication:
              {
                select: {
                  id: true,
                  zone_id: true,
                  area_id: true,
                  capacity_publication_date: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    // return areaAll
    // area_nominal_capacity
    const resDay =
      await this.generateData(
        areaAll
      )

    return resDay
  }

  async demo() {
    const areaAll =
      await this.prisma.area.findMany(
        {
          include: {
            entry_exit: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            zone: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            capacity_publication:
              {
                select: {
                  id: true,
                  zone_id: true,
                  area_id: true,
                  capacity_publication_date: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    // return areaAll
    const grpcPython =
      await this.tranfService
        .sendTranfPython({
          query:
            JSON.stringify(
              areaAll
            )
        })
        .toPromise()
    return grpcPython
    // area_nominal_capacity
    // const resDay = await this.generateData(areaAll);

    // return resDay;
  }

  async detailCreate(
    payload: any,
    userId: any
  ) {
    const {
      area_id,
      avaliable_capacitor_d,
      start_date,
      end_date
    } = payload
    const ckArea =
      await this.prisma.capacity_publication.findFirst(
        {
          where: {
            area_id:
              Number(area_id)
          }
        }
      )
    // ฟังก์ชันสร้าง array ของวันที่
    function getDatesArray(
      start,
      end
    ) {
      const dates = []
      let currentDate = start // dayjs object เริ่มต้น

      while (
        currentDate.isBefore(
          end
        ) ||
        currentDate.isSame(
          end,
          'day'
        )
      ) {
        dates.push(
          currentDate.format(
            'YYYY-MM-DD'
          )
        )
        currentDate =
          currentDate.add(
            1,
            'day'
          ) // ต้องใช้ currentDate = currentDate.add() เพราะ add() คืนค่าใหม่
      }

      return dates
    }

    // เรียกใช้งานฟังก์ชัน
    const datesArray =
      getDatesArray(
        dayjs(start_date),
        dayjs(end_date)
      )

    if (!!ckArea) {
      await this.prisma.capacity_publication_detail.create(
        {
          data: {
            area: {
              connect: {
                id: Number(
                  area_id
                )
              }
            },
            avaliable_capacity_mmbtu_d:
              String(
                avaliable_capacitor_d
              ),
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

      let datesArrayData =
        datesArray.map(
          (e: any) => {
            return {
              capacity_publication_id:
                ckArea?.id,
              date_day:
                getTodayNowAdd7(
                  e
                ).toDate(),
              value_adjust:
                String(
                  avaliable_capacitor_d
                ),
              value_adjust_use:
                String(
                  avaliable_capacitor_d
                )
            }
          }
        )

      await Promise.all(
        datesArrayData.map(
          async (
            data: any
          ) => {
            // ตรวจสอบว่าข้อมูลมีอยู่หรือไม่
            const existingRecord =
              await this.prisma.capacity_publication_date.findFirst(
                {
                  where: {
                    capacity_publication_id:
                      data.capacity_publication_id,
                    date_day:
                      data.date_day
                  }
                }
              )

            if (
              existingRecord
            ) {
              // ถ้ามีข้อมูลอยู่แล้ว ทำการอัปเดต
              await this.prisma.capacity_publication_date.updateMany(
                {
                  where: {
                    capacity_publication_id:
                      data.capacity_publication_id,
                    date_day:
                      data.date_day
                  },
                  data: {
                    value_adjust:
                      data.value_adjust,
                    value_adjust_use:
                      data.value_adjust_use
                  }
                }
              )
            } else {
              // ถ้าไม่มีข้อมูล ทำการสร้างใหม่
              await this.prisma.capacity_publication_date.create(
                {
                  data: {
                    capacity_publication_id:
                      data.capacity_publication_id,
                    date_day:
                      data.date_day,
                    value_adjust:
                      data.value_adjust,
                    value_adjust_use:
                      data.value_adjust_use
                  }
                }
              )
            }
          }
        )
      )
    } else {
      // create
      const findArea =
        await this.prisma.area.findFirst(
          {
            where: {
              id: Number(
                area_id
              )
            },
            select: {
              id: true,
              entry_exit_id: true
            }
          }
        )
      if (!!!findArea) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'area not have system'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      const createCPArea =
        await this.prisma.capacity_publication.create(
          {
            data: {
              area: {
                connect: {
                  id: findArea?.id
                }
              },
              entry_exit: {
                connect: {
                  id: findArea?.entry_exit_id
                }
              }
            }
          }
        )

      await this.prisma.capacity_publication_detail.create(
        {
          data: {
            area: {
              connect: {
                id: Number(
                  area_id
                )
              }
            },
            avaliable_capacity_mmbtu_d:
              String(
                avaliable_capacitor_d
              ),
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

      let datesArrayData =
        datesArray.map(
          (e: any) => {
            return {
              capacity_publication_id:
                createCPArea?.id,
              date_day:
                getTodayNowAdd7(
                  e
                ).toDate(),
              value_adjust:
                String(
                  avaliable_capacitor_d
                ),
              value_adjust_use:
                String(
                  avaliable_capacitor_d
                )
            }
          }
        )

      await Promise.all(
        datesArrayData.map(
          async (
            data: any
          ) => {
            // ตรวจสอบว่าข้อมูลมีอยู่หรือไม่
            const existingRecord =
              await this.prisma.capacity_publication_date.findFirst(
                {
                  where: {
                    capacity_publication_id:
                      data.capacity_publication_id,
                    date_day:
                      data.date_day
                  }
                }
              )

            if (
              existingRecord
            ) {
              // ถ้ามีข้อมูลอยู่แล้ว ทำการอัปเดต
              await this.prisma.capacity_publication_date.updateMany(
                {
                  where: {
                    capacity_publication_id:
                      data.capacity_publication_id,
                    date_day:
                      data.date_day
                  },
                  data: {
                    value_adjust:
                      data.value_adjust,
                    value_adjust_use:
                      data.value_adjust_use
                  }
                }
              )
            } else {
              // ถ้าไม่มีข้อมูล ทำการสร้างใหม่
              await this.prisma.capacity_publication_date.create(
                {
                  data: {
                    capacity_publication_id:
                      data.capacity_publication_id,
                    date_day:
                      data.date_day,
                    value_adjust:
                      data.value_adjust,
                    value_adjust_use:
                      data.value_adjust_use
                  }
                }
              )
            }
          }
        )
      )
    }

    return payload
  }

  async zoneFind() {
    const resData =
      await this.prisma.zone.findMany(
        {
          include: {
            area: true
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    return resData
  }

  async showDetail() {
    const resData =
      await this.prisma.capacity_publication_detail.findMany(
        {
          include: {
            area: {
              include: {
                zone: true
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

  generateDataDay(
    data: any,
    date: any
  ) {
    const startDate =
      dayjs(date).startOf(
        'month'
      ) // วันแรกของเดือน
    const endDate =
      dayjs(date).endOf(
        'month'
      ) // วันสุดท้ายของเดือน

    return data.map(
      (item) => {
        const dayData: {
          [key: string]: {
            area_nominal_capacity: number
          }
        } = {}

        const daysInMonth =
          Array.from(
            {
              length:
                endDate.date()
            },
            (_, i) =>
              startDate.add(
                i,
                'day'
              )
          )

        daysInMonth.forEach(
          (currentDate) => {
            const formattedDate =
              currentDate.format(
                'YYYY-MM-DD'
              ) // รูปแบบวันที่
            let valueAd =
              item.area_nominal_capacity

            if (
              item
                ?.capacity_publication
                .length > 0
            ) {
              const finds =
                item?.capacity_publication[0]?.capacity_publication_date.find(
                  (f: any) =>
                    dayjs(
                      f?.date_day
                    ).format(
                      'YYYY-MM-DD'
                    ) ===
                    formattedDate
                )

              if (!!finds) {
                if (
                  !!finds?.value_adjust_use
                ) {
                  valueAd =
                    finds?.value_adjust_use
                } else if (
                  !!finds?.value_adjust
                ) {
                  valueAd =
                    finds?.value_adjust
                } else {
                  valueAd =
                    finds?.value
                }
                // valueAd = finds?.value;
              }
            }

            dayData[
              formattedDate
            ] = {
              area_nominal_capacity:
                Number(
                  valueAd
                )
            }
          }
        )

        // แปลง dayData ให้เป็น array ของ object
        const formattedDayData =
          Object.keys(
            dayData
          ).map((dayKey) => ({
            [dayKey]:
              dayData[dayKey]
          }))

        return {
          ...item,
          day_data:
            formattedDayData
        }
      }
    )
  }

  async getDays(date: any) {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()

    const areaAll =
      await this.prisma.area.findMany(
        {
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
          },
          include: {
            entry_exit: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            zone: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            capacity_publication:
              {
                select: {
                  id: true,
                  zone_id: true,
                  area_id: true,
                  capacity_publication_date: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    // return areaAll
    // area_nominal_capacity
    const resDay =
      await this.generateDataDay(
        areaAll,
        date
      )

    return resDay
  }

  generateDataMonthly(
    data: any,
    startMonth: any,
    endMonth: any
  ) {
    // สร้างช่วงเดือน
    const months = []
    let currentMonth = dayjs(
      startMonth
    ).startOf('month')
    const lastMonth = dayjs(
      endMonth
    ).endOf('month')

    while (
      currentMonth.isBefore(
        lastMonth
      ) ||
      currentMonth.isSame(
        lastMonth,
        'month'
      )
    ) {
      months.push(
        currentMonth.format(
          'YYYY-MM'
        )
      )
      currentMonth =
        currentMonth.add(
          1,
          'month'
        )
    }

    return data.map(
      (item) => {
        const monthData: {
          [key: string]: {
            area_nominal_capacity: number
          }
        } = {}

        months.forEach(
          (monthKey) => {
            let valueAd =
              item.area_nominal_capacity

            if (
              item
                ?.capacity_publication
                .length > 0
            ) {
              // ดึงค่าทั้งหมดในเดือนนั้น
              const valuesInMonth =
                item.capacity_publication[0]?.capacity_publication_date
                  .filter(
                    (
                      f: any
                    ) =>
                      dayjs(
                        f?.date_day
                      ).format(
                        'YYYY-MM'
                      ) ===
                      monthKey
                  )
                  .map(
                    (
                      f: any
                    ) => {
                      if (
                        f?.value_adjust_use
                      )
                        return Number(
                          f?.value_adjust_use
                        )
                      if (
                        f?.value_adjust
                      )
                        return Number(
                          f?.value_adjust
                        )
                      if (
                        f?.value
                      )
                        return Number(
                          f?.value
                        )
                      return null
                    }
                  )
                  .filter(
                    (
                      value: any
                    ) =>
                      value !==
                      null
                  ) // กรองค่า null ออก

              // หาค่าที่น้อยที่สุดในเดือนนั้น (ถ้ามี)
              if (
                valuesInMonth.length >
                0
              ) {
                valueAd =
                  Math.min(
                    ...valuesInMonth
                  )
              }
            }

            // บันทึกค่าในเดือนนั้น
            monthData[
              monthKey
            ] = {
              area_nominal_capacity:
                valueAd
            }
          }
        )

        // แปลง monthData ให้เป็น array ของ object
        const formattedMonthData =
          Object.keys(
            monthData
          ).map(
            (monthKey) => ({
              [monthKey]:
                monthData[
                  monthKey
                ]
            })
          )

        return {
          ...item,
          month_data:
            formattedMonthData
        }
      }
    )
  }

  async getMonthly(
    startMonth: any,
    endMonth: any
  ) {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()

    const areaAll =
      await this.prisma.area.findMany(
        {
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
          },
          include: {
            entry_exit: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            zone: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            capacity_publication:
              {
                select: {
                  id: true,
                  zone_id: true,
                  area_id: true,
                  capacity_publication_date: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    const resDay =
      await this.generateDataMonthly(
        areaAll,
        startMonth,
        endMonth
      )

    return resDay
  }

  generateDataYearly(
    data: any,
    startYear: number,
    endYear: number
  ) {
    // สร้าง array ของปี เช่น [2024, 2025, ..., 2034]
    const years = Array.from(
      {
        length:
          endYear -
          startYear +
          1
      },
      (_, i) => startYear + i
    )

    return data.map(
      (item) => {
        const yearData: {
          [key: string]: {
            area_nominal_capacity: number
          }
        } = {}

        years.forEach(
          (year) => {
            const yearKey = `${year}`
            let valueAd =
              item.area_nominal_capacity

            if (
              item
                ?.capacity_publication
                .length > 0
            ) {
              // ดึงค่าทั้งหมดในปีนั้น
              const valuesInYear =
                item.capacity_publication[0]?.capacity_publication_date
                  .filter(
                    (
                      f: any
                    ) =>
                      dayjs(
                        f?.date_day
                      ).year() ===
                      year
                  )
                  .map(
                    (
                      f: any
                    ) => {
                      if (
                        f?.value_adjust_use
                      )
                        return Number(
                          f?.value_adjust_use
                        )
                      if (
                        f?.value_adjust
                      )
                        return Number(
                          f?.value_adjust
                        )
                      if (
                        f?.value
                      )
                        return Number(
                          f?.value
                        )
                      return null
                    }
                  )
                  .filter(
                    (
                      value: any
                    ) =>
                      value !==
                      null
                  ) // กรองค่า null ออก

              // หาค่าที่น้อยที่สุดในปีนั้น (ถ้ามี)
              if (
                valuesInYear.length >
                0
              ) {
                valueAd =
                  Math.min(
                    ...valuesInYear
                  )
              }
            }

            // บันทึกค่าในปีนั้น
            yearData[
              yearKey
            ] = {
              area_nominal_capacity:
                valueAd
            }
          }
        )

        // แปลง yearData ให้เป็น array ของ object
        const formattedYearData =
          Object.keys(
            yearData
          ).map(
            (yearKey) => ({
              [yearKey]:
                yearData[
                  yearKey
                ]
            })
          )

        return {
          ...item,
          year_data:
            formattedYearData
        }
      }
    )
  }

  async getYearly(
    startYear: any,
    endYear: any
  ) {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()

    const areaAll =
      await this.prisma.area.findMany(
        {
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
          },
          include: {
            entry_exit: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            zone: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            capacity_publication:
              {
                select: {
                  id: true,
                  zone_id: true,
                  area_id: true,
                  capacity_publication_date: true
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    const resDay =
      await this.generateDataYearly(
        areaAll,
        Number(startYear),
        Number(endYear)
      )

    return resDay
  }

  generateDataDay2(
    data: any,
    date: any,
    isClearData: boolean = false
  ) {
    const startDate =
      dayjs(date).startOf(
        'month'
      ) // วันแรกของเดือน
    const endDate =
      dayjs(date).endOf(
        'month'
      ) // วันสุดท้ายของเดือน

    //group area by name
    const groupArea =
      data.reduce(
        (
          acc: any,
          item: any
        ) => {
          const key = `${item.name}_${item.entry_exit_id}_${item.zone_id}`
          if (!acc[key]) {
            acc[key] = []
          }
          acc[key].push(item)
          return acc
        },
        {}
      )

    // get lastest object by start_date
    const latestByArea =
      Object.entries(
        groupArea
      ).reduce(
        (
          acc: any,
          [key, items]: [
            string,
            any[]
          ]
        ) => {
          // Sort items by start_date in descending order and take the first one
          const latest = [
            ...items
          ].sort(
            (a, b) =>
              dayjs(
                b.start_date
              ).valueOf() -
              dayjs(
                a.start_date
              ).valueOf()
          )[0]

          acc[key] = latest
          return acc
        },
        {}
      )

    // Convert back to array
    const areaList =
      Object.values(
        latestByArea
      )

    return areaList
      .sort(
        (a: any, b: any) =>
          a.name.localeCompare(
            b.name
          )
      )
      .map((item: any) => {
        const dayData: {
          [key: string]: {
            area_nominal_capacity: number
          }
        } = {}

        const daysInMonth =
          Array.from(
            {
              length:
                endDate.date()
            },
            (_, i) =>
              startDate.add(
                i,
                'day'
              )
          )

        daysInMonth.forEach(
          (currentDate) => {
            const formattedDate =
              currentDate.format(
                'YYYY-MM-DD'
              ) // รูปแบบวันที่
            const activeArea =
              data.find(
                (
                  areaData: any
                ) => {
                  return (
                    item.name ==
                      areaData.name &&
                    areaData.start_date <=
                      currentDate.toDate() &&
                    (areaData.end_date ===
                      null ||
                      areaData.end_date >
                        currentDate.toDate())
                  )
                }
              )

            let valueAd =
              activeArea?.area_nominal_capacity

            data
              .filter(
                (
                  areaData: any
                ) => {
                  return (
                    item.name ==
                      areaData.name &&
                    areaData.start_date <=
                      currentDate.toDate() &&
                    (areaData.end_date ===
                      null ||
                      areaData.end_date >
                        currentDate.toDate())
                  )
                }
              )
              .map(
                (
                  areaData: any
                ) => {
                  if (
                    areaData
                      ?.capacity_publication
                      .length >
                    0
                  ) {
                    const finds =
                      areaData.capacity_publication[0]?.capacity_publication_date.find(
                        (
                          f: any
                        ) =>
                          dayjs(
                            f?.date_day
                          ).format(
                            'YYYY-MM-DD'
                          ) ===
                          formattedDate
                      )

                    if (
                      !!finds
                    ) {
                      if (
                        !!finds?.value_adjust_use &&
                        !Number.isNaN(
                          finds?.value_adjust_use
                        ) &&
                        finds?.value_adjust_use !=
                          'NaN'
                      ) {
                        valueAd =
                          finds?.value_adjust_use
                      } else if (
                        !!finds?.value_adjust &&
                        !Number.isNaN(
                          finds?.value_adjust
                        ) &&
                        finds?.value_adjust !=
                          'NaN'
                      ) {
                        valueAd =
                          finds?.value_adjust
                      } else {
                        valueAd =
                          finds?.value
                      }
                    }
                  }
                }
              )

            dayData[
              formattedDate
            ] = {
              area_nominal_capacity:
                Number(
                  valueAd
                )
            }
          }
        )

        // แปลง dayData ให้เป็น array ของ object
        const formattedDayData =
          Object.keys(
            dayData
          ).map((dayKey) => ({
            [dayKey]:
              dayData[dayKey]
          }))

        if (isClearData) {
          const {
            capacity_publication,
            ...rest
          } = item

          return {
            ...rest,
            day_data:
              formattedDayData
          }
        } else {
          return {
            ...item,
            day_data:
              formattedDayData
          }
        }
      })
  }

  async getDays2(date: any) {
    const todayStart =
      getTodayNowYYYYMMDDDfaultAdd7(
        date
      )
        .startOf('month')
        .toDate()
    const todayEnd =
      getTodayNowYYYYMMDDDfaultAdd7(
        date
      )
        .endOf('month')
        .toDate()

    const areaAll =
      await this.prisma.area.findMany(
        {
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
          },
          include: {
            entry_exit: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            zone: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            capacity_publication:
              {
                select: {
                  id: true,
                  zone_id: true,
                  area_id: true,
                  capacity_publication_date:
                    {
                      where: {
                        date_day:
                          {
                            gte: todayStart,
                            lte: todayEnd
                          }
                      }
                    }
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    if (
      areaAll.length === 0
    ) {
      return []
    }

    const resDay =
      await this.generateDataDay2(
        areaAll,
        date
      )

    return resDay
  }

  generateDataMonthly2(
    data: any,
    startMonth: any,
    endMonth: any
  ) {
    // สร้างช่วงเดือน
    const months = []
    let currentMonth = dayjs(
      startMonth
    ).startOf('month')
    const lastMonth = dayjs(
      endMonth
    ).endOf('month')

    //group area by name
    const groupArea =
      data.reduce(
        (
          acc: any,
          item: any
        ) => {
          const key = `${item.name}_${item.entry_exit_id}_${item.zone_id}`
          if (!acc[key]) {
            acc[key] = []
          }
          acc[key].push(item)
          return acc
        },
        {}
      )

    // get lastest object by start_date
    const latestByArea =
      Object.entries(
        groupArea
      ).reduce(
        (
          acc: any,
          [key, items]: [
            string,
            any[]
          ]
        ) => {
          // Sort items by start_date in descending order and take the first one
          const latest = [
            ...items
          ].sort(
            (a, b) =>
              dayjs(
                b.start_date
              ).valueOf() -
              dayjs(
                a.start_date
              ).valueOf()
          )[0]

          acc[key] = latest
          return acc
        },
        {}
      )

    // Convert back to array
    const areaList =
      Object.values(
        latestByArea
      )

    while (
      currentMonth.isBefore(
        lastMonth
      ) ||
      currentMonth.isSame(
        lastMonth,
        'month'
      )
    ) {
      months.push(
        currentMonth.format(
          'YYYY-MM'
        )
      )
      currentMonth =
        currentMonth.add(
          1,
          'month'
        )
    }

    // เรียงลำดับ area list ตามชื่อและแปลงข้อมูลแต่ละ area
    return areaList
      .sort(
        (a: any, b: any) =>
          a.name.localeCompare(
            b.name
          )
      )
      .map((item: any) => {
        // สร้าง object สำหรับเก็บข้อมูล capacity ของแต่ละเดือน
        const monthData: {
          [key: string]: {
            area_nominal_capacity: number
          }
        } = {}

        // วนลูปผ่านแต่ละเดือนที่ต้องการประมวลผล
        months.forEach(
          (monthKey) => {
            // หาวันแรกและวันสุดท้ายของเดือน
            const startOfMonth =
              dayjs(
                monthKey,
                'YYYY-MM'
              ).startOf(
                'month'
              )
            const endOfMonth =
              dayjs(
                monthKey,
                'YYYY-MM'
              ).endOf('month')
            // กรองข้อมูล area ที่มีช่วงวันที่ทับซ้อนกับเดือนที่กำลังประมวลผล
            // เงื่อนไข: ชื่อ area ตรงกัน และ start_date <= สิ้นเดือน และ (ไม่มี end_date หรือ end_date > ต้นเดือน)
            const activeAreaList =
              data.filter(
                (
                  areaData: any
                ) => {
                  return (
                    item.name ==
                      areaData.name &&
                    areaData.start_date <=
                      endOfMonth.toDate() &&
                    (areaData.end_date ===
                      null ||
                      areaData.end_date >
                        startOfMonth.toDate())
                  )
                }
              )
            // หาค่า area_nominal_capacity ต่ำสุดจาก activeAreaList (ถ้ามี)
            let valueAd =
              activeAreaList.length >
              0
                ? Math.min(
                    ...activeAreaList.map(
                      (
                        areaData: any
                      ) =>
                        areaData.area_nominal_capacity
                    )
                  )
                : null

            // สร้างข้อมูลรายวันสำหรับเดือนนี้ (ใช้ timezone Asia/Bangkok)
            const dataEachDayByArea =
              this.generateDataDay2(
                activeAreaList,
                startOfMonth
                  .tz(
                    'Asia/Bangkok'
                  )
                  .format(
                    'YYYY-MM-DD'
                  )
              )

            // วนลูปผ่านข้อมูลแต่ละวัน
            dataEachDayByArea.map(
              (
                dataEachDay: any
              ) => {
                // ดึงค่า area_nominal_capacity จากข้อมูลรายวัน
                // โดยใช้ flatMap เพื่อแปลง nested array และกรองเฉพาะค่าที่มี area_nominal_capacity
                const areaNominalCapacity =
                  dataEachDay.day_data.flatMap(
                    (
                      dayData: any
                    ) =>
                      Object.values(
                        dayData
                      )
                        .filter(
                          (
                            dayValue: any
                          ) =>
                            dayValue.area_nominal_capacity
                        )
                        .map(
                          (
                            dayValue: any
                          ) =>
                            dayValue.area_nominal_capacity
                        )
                  )
                // ถ้ามีข้อมูล capacity
                if (
                  areaNominalCapacity.length >
                  0
                ) {
                  // หาค่าต่ำสุดของ area_nominal_capacity ในวันนั้น
                  const minAreaNominalCapacity =
                    Math.min(
                      ...areaNominalCapacity
                    )
                  // ถ้าค่าต่ำสุดที่พบน้อยกว่าค่าปัจจุบัน ให้อัพเดท valueAd
                  if (
                    minAreaNominalCapacity <
                    valueAd
                  ) {
                    valueAd =
                      minAreaNominalCapacity
                  }
                }
              }
            )

            // บันทึกค่าในเดือนนั้น
            monthData[
              monthKey
            ] = {
              area_nominal_capacity:
                valueAd
            }
          }
        )

        // แปลง monthData ให้เป็น array ของ object
        const formattedMonthData =
          Object.keys(
            monthData
          ).map(
            (monthKey) => ({
              [monthKey]:
                monthData[
                  monthKey
                ]
            })
          )

        return {
          ...item,
          month_data:
            formattedMonthData
        }
      })
  }

  async getMonthly2(
    startMonth: any,
    endMonth: any
  ) {
    const todayStart = dayjs(
      startMonth,
      'YYYY-MM'
    )
      .startOf('month')
      .toDate()
    const todayEnd = dayjs(
      endMonth,
      'YYYY-MM'
    )
      .endOf('month')
      .toDate()

    const areaAll =
      await this.prisma.area.findMany(
        {
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
          },
          include: {
            entry_exit: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            zone: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            capacity_publication:
              {
                select: {
                  id: true,
                  zone_id: true,
                  area_id: true,
                  capacity_publication_date:
                    {
                      where: {
                        date_day:
                          {
                            gte: todayStart,
                            lte: todayEnd
                          }
                      }
                    }
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    const resDay =
      await this.generateDataMonthly2(
        areaAll,
        startMonth,
        endMonth
      )

    return resDay
  }

  generateDataYearly2Slow(
    data: any,
    startYear: number,
    endYear: number
  ) {
    // สร้าง array ของปี เช่น [2024, 2025, ..., 2034]
    const years = Array.from(
      {
        length:
          endYear -
          startYear +
          1
      },
      (_, i) => startYear + i
    )

    //group area by name
    const groupArea =
      data.reduce(
        (
          acc: any,
          item: any
        ) => {
          const key = `${item.name}_${item.entry_exit_id}_${item.zone_id}`
          if (!acc[key]) {
            acc[key] = []
          }
          acc[key].push(item)
          return acc
        },
        {}
      )

    // get lastest object by start_date
    const latestByArea =
      Object.entries(
        groupArea
      ).reduce(
        (
          acc: any,
          [key, items]: [
            string,
            any[]
          ]
        ) => {
          // Sort items by start_date in descending order and take the first one
          const latest = [
            ...items
          ].sort(
            (a, b) =>
              dayjs(
                b.start_date
              ).valueOf() -
              dayjs(
                a.start_date
              ).valueOf()
          )[0]

          acc[key] = latest
          return acc
        },
        {}
      )

    // Convert back to array
    const areaList =
      Object.values(
        latestByArea
      )

    // เรียงลำดับ area list ตามชื่อและแปลงข้อมูลแต่ละ area
    return areaList
      .sort(
        (a: any, b: any) =>
          a.name.localeCompare(
            b.name
          )
      )
      .map((item: any) => {
        // สร้าง object สำหรับเก็บข้อมูล capacity ของแต่ละปี
        const yearData: {
          [key: string]: {
            area_nominal_capacity: number
          }
        } = {}

        // วนลูปผ่านแต่ละปีที่ต้องการประมวลผล
        years.forEach(
          (year) => {
            const yearKey = `${year}`
            // หาวันแรกและวันสุดท้ายของปี
            const startOfYear =
              dayjs(
                yearKey,
                'YYYY'
              ).startOf(
                'year'
              )
            const endOfYear =
              dayjs(
                yearKey,
                'YYYY'
              ).endOf('year')

            // กรองข้อมูล area ที่มีช่วงวันที่ทับซ้อนกับปีที่กำลังประมวลผล
            // เงื่อนไข: ชื่อ area ตรงกัน และ start_date <= สิ้นปี และ (ไม่มี end_date หรือ end_date > ต้นปี)
            const activeAreaList =
              data.filter(
                (
                  areaData: any
                ) => {
                  return (
                    item.name ==
                      areaData.name &&
                    areaData.start_date <=
                      endOfYear.toDate() &&
                    (areaData.end_date ===
                      null ||
                      areaData.end_date >
                        startOfYear.toDate())
                  )
                }
              )
            // หาค่า area_nominal_capacity ต่ำสุดจาก activeAreaList (ถ้ามี)
            let valueAd =
              activeAreaList.length >
              0
                ? Math.min(
                    ...activeAreaList.map(
                      (
                        areaData: any
                      ) =>
                        areaData.area_nominal_capacity
                    )
                  )
                : null

            // วนลูปผ่าน 12 เดือนของปี
            Array.from(
              {length: 12},
              (_, i) => {
                const month =
                  i + 1
                // สร้าง key ของเดือนในรูปแบบ YYYY-MM-01
                const monthKey = `${year}-${month.toString().padStart(2, '0')}-01`
                // สร้างข้อมูลรายวันสำหรับเดือนนี้
                const dataEachDayByArea =
                  this.generateDataDay2(
                    activeAreaList,
                    monthKey,
                    true
                  )

                // วนลูปผ่านข้อมูลแต่ละวัน
                dataEachDayByArea.map(
                  (
                    dataEachDay: any
                  ) => {
                    // ดึงค่า area_nominal_capacity จากข้อมูลรายวัน
                    // โดยใช้ flatMap เพื่อแปลง nested array และกรองเฉพาะค่าที่มี area_nominal_capacity
                    const areaNominalCapacity =
                      dataEachDay.day_data.flatMap(
                        (
                          dayData: any
                        ) =>
                          Object.values(
                            dayData
                          )
                            .filter(
                              (
                                dayValue: any
                              ) =>
                                dayValue.area_nominal_capacity
                            )
                            .map(
                              (
                                dayValue: any
                              ) =>
                                dayValue.area_nominal_capacity
                            )
                      )
                    // ถ้ามีข้อมูล capacity
                    if (
                      areaNominalCapacity.length >
                      0
                    ) {
                      // หาค่าต่ำสุดของ area_nominal_capacity ในวันนั้น
                      const minAreaNominalCapacity =
                        Math.min(
                          ...areaNominalCapacity
                        )
                      // ถ้าค่าต่ำสุดที่พบน้อยกว่าค่าปัจจุบัน ให้อัพเดท valueAd
                      if (
                        minAreaNominalCapacity <
                        valueAd
                      ) {
                        valueAd =
                          minAreaNominalCapacity
                      }
                    }
                  }
                )
              }
            )

            // บันทึกค่าในปีนั้น
            yearData[
              yearKey
            ] = {
              area_nominal_capacity:
                valueAd
            }
          }
        )

        // แปลง yearData ให้เป็น array ของ object
        const formattedYearData =
          Object.keys(
            yearData
          ).map(
            (yearKey) => ({
              [yearKey]:
                yearData[
                  yearKey
                ]
            })
          )

        return {
          ...item,
          year_data:
            formattedYearData
        }
      })
  }

  generateDataYearly2(
    data: any,
    startYear: number,
    endYear: number
  ) {
    // สร้าง array ของปี เช่น [2024, 2025, ..., 2034]
    const years = Array.from(
      {
        length:
          endYear -
          startYear +
          1
      },
      (_, i) => startYear + i
    )

    //group area by name
    const groupArea =
      data.reduce(
        (
          acc: any,
          item: any
        ) => {
          const key = `${item.name}_${item.entry_exit_id}_${item.zone_id}`
          if (!acc[key]) {
            acc[key] = []
          }
          acc[key].push(item)
          return acc
        },
        {}
      )

    // get lastest object by start_date
    const latestByArea =
      Object.entries(
        groupArea
      ).reduce(
        (
          acc: any,
          [key, items]: [
            string,
            any[]
          ]
        ) => {
          // Sort items by start_date in descending order and take the first one
          const latest = [
            ...items
          ].sort(
            (a, b) =>
              dayjs(
                b.start_date
              ).valueOf() -
              dayjs(
                a.start_date
              ).valueOf()
          )[0]

          acc[key] = latest
          return acc
        },
        {}
      )

    // Convert back to array
    const areaList =
      Object.values(
        latestByArea
      )

    // เรียงลำดับ area list ตามชื่อและแปลงข้อมูลแต่ละ area
    return areaList
      .sort(
        (a: any, b: any) =>
          a.name.localeCompare(
            b.name
          )
      )
      .map((item: any) => {
        const yearData: {
          [key: string]: {
            area_nominal_capacity: number
          }
        } = {}

        years.forEach(
          (year) => {
            const yearKey = `${year}`
            // หาวันแรกและวันสุดท้ายของปี
            const startOfYear =
              dayjs(
                yearKey,
                'YYYY'
              ).startOf(
                'year'
              )
            const endOfYear =
              dayjs(
                yearKey,
                'YYYY'
              ).endOf('year')

            // กรองข้อมูล area ที่มีช่วงวันที่ทับซ้อนกับปีที่กำลังประมวลผล
            // เงื่อนไข: ชื่อ area ตรงกัน และ start_date <= สิ้นปี และ (ไม่มี end_date หรือ end_date > ต้นปี)
            const activeAreaList =
              data.filter(
                (
                  areaData: any
                ) => {
                  return (
                    item.name ==
                      areaData.name &&
                    areaData.start_date <=
                      endOfYear.toDate() &&
                    (areaData.end_date ===
                      null ||
                      areaData.end_date >
                        startOfYear.toDate())
                  )
                }
              )
            // หาค่า area_nominal_capacity ต่ำสุดจาก activeAreaList (ถ้ามี)
            let valueAd =
              activeAreaList.length >
              0
                ? Math.min(
                    ...activeAreaList.map(
                      (
                        areaData: any
                      ) =>
                        areaData.area_nominal_capacity
                    )
                  )
                : null

            data
              .filter(
                (
                  areaData: any
                ) => {
                  return (
                    item.name ==
                      areaData.name &&
                    areaData.start_date <=
                      endOfYear.toDate() &&
                    (areaData.end_date ===
                      null ||
                      areaData.end_date >
                        startOfYear.toDate())
                  )
                }
              )
              .map(
                (
                  areaData: any
                ) => {
                  if (
                    areaData
                      ?.capacity_publication
                      .length >
                    0
                  ) {
                    // ดึงค่าทั้งหมดในปีนั้น
                    const valuesInYear =
                      item.capacity_publication[0]?.capacity_publication_date
                        .filter(
                          (
                            f: any
                          ) =>
                            dayjs(
                              f?.date_day
                            ).year() ===
                            year
                        )
                        .map(
                          (
                            f: any
                          ) => {
                            if (
                              f?.value_adjust_use &&
                              !Number.isNaN(
                                f?.value_adjust_use
                              ) &&
                              f?.value_adjust_use !=
                                'NaN'
                            )
                              return Number(
                                f?.value_adjust_use
                              )
                            if (
                              f?.value_adjust &&
                              !Number.isNaN(
                                f?.value_adjust
                              ) &&
                              f?.value_adjust !=
                                'NaN'
                            )
                              return Number(
                                f?.value_adjust
                              )
                            if (
                              f?.value
                            )
                              return Number(
                                f?.value
                              )
                            return null
                          }
                        )
                        .filter(
                          (
                            value: any
                          ) =>
                            value !==
                            null
                        ) // กรองค่า null ออก

                    // หาค่าที่น้อยที่สุดในปีนั้น (ถ้ามี)
                    if (
                      valuesInYear.length >
                      0
                    ) {
                      valueAd =
                        Math.min(
                          ...valuesInYear
                        )
                    }
                  }
                }
              )

            // บันทึกค่าในปีนั้น
            yearData[
              yearKey
            ] = {
              area_nominal_capacity:
                valueAd
            }
          }
        )

        // แปลง yearData ให้เป็น array ของ object
        const formattedYearData =
          Object.keys(
            yearData
          ).map(
            (yearKey) => ({
              [yearKey]:
                yearData[
                  yearKey
                ]
            })
          )

        return {
          ...item,
          year_data:
            formattedYearData
        }
      })
  }

  async getYearly2(
    startYear: any,
    endYear: any
  ) {
    const todayStart = dayjs(
      startYear,
      'YYYY'
    )
      .startOf('year')
      .toDate()
    const todayEnd = dayjs(
      endYear,
      'YYYY'
    )
      .endOf('year')
      .toDate()

    const areaAll =
      await this.prisma.area.findMany(
        {
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
          },
          include: {
            entry_exit: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            zone: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
            capacity_publication:
              {
                select: {
                  id: true,
                  zone_id: true,
                  area_id: true,
                  capacity_publication_date:
                    {
                      where: {
                        date_day:
                          {
                            gte: todayStart,
                            lte: todayEnd
                          }
                      }
                    }
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    const resDay =
      await this.generateDataYearly2(
        areaAll,
        Number(startYear),
        Number(endYear)
      )

    return resDay
  }
}
