import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {
  checkStartEndBoom,
  getTodayEndAdd7,
  getTodayEndYYYYMMDDDfaultAdd7,
  getTodayNowAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'

import axios from 'axios'
import {Prisma} from '@prisma/client'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class ParameterNominationDeadlineService {
  constructor(
    private prisma: PrismaService
  ) {}

  nominationType() {
    return this.prisma.nomination_type.findMany(
      {
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  processtype() {
    return this.prisma.process_type.findMany(
      {
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  nominationDeadline() {
    return this.prisma.new_nomination_deadline.findMany(
      {
        include: {
          user_type: true,
          nomination_type: true,
          process_type: true,
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
      }
    )
  }

  nominationDeadlineOnce(
    id: any
  ) {
    return this.prisma.new_nomination_deadline.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          user_type: true,
          nomination_type: true,
          process_type: true,
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
      }
    )
  }

  async validateProcessTypeInOrder({
    user_type_id,
    nomination_type_id,
    process_type_id,
    start_date,
    end_date,
    hour,
    minute,
    before_gas_day,
    exclude_id
  }: {
    user_type_id: number
    nomination_type_id: number
    process_type_id: number
    start_date: any // YYYY-MM-DD
    end_date: any
    hour: any
    minute: any
    before_gas_day: any
    exclude_id?: number
  }) {
    const startDate =
      getTodayEndYYYYMMDDDfaultAdd7(
        start_date
      )

    const andInWhere: Prisma.new_nomination_deadlineWhereInput[] =
      [
        {
          user_type_id:
            user_type_id
        },
        {
          nomination_type_id:
            nomination_type_id
        },
        {
          start_date: {
            lte: startDate.toDate()
          }
        },
        {
          OR: [
            {
              end_date: null
            },
            {
              end_date: {
                gt: startDate.toDate()
              }
            }
          ]
        }
      ]

    if (exclude_id) {
      andInWhere.push({
        id: {
          not: exclude_id
        }
      })
    }
    const childrenNominationDeadline =
      await this.prisma.new_nomination_deadline.findMany(
        {
          where: {
            AND: andInWhere,
            process_type_id: {
              gt: process_type_id
            }
          }
        }
      )

    if (process_type_id > 1) {
      const parentProcessTypeID =
        process_type_id - 1

      // 1.Submission
      // 2.Management
      // 3.Reception Of Renomination
      // 4.Validate Response of renomination

      // หาตัวที่ seq ก่อนหน้า
      const parentNominationDeadline =
        await this.prisma.new_nomination_deadline.findMany(
          {
            where: {
              AND: andInWhere,
              process_type_id: {
                lte: parentProcessTypeID
              }
            }
          }
        )

      if (
        parentNominationDeadline.length >
        0
      ) {
        // เช็ควัน
        // เทียบวัน before gas day
        // หาค่า before_gas_day ที่น้อยที่สุดจาก parent nomination deadlines
        // เพื่อให้แน่ใจว่า child deadline จะต้องมี before_gas_day <= parent
        let minBeforeGasDay =
          parentNominationDeadline.reduce(
            (min, item) => {
              if (
                item.before_gas_day !==
                  null &&
                item.before_gas_day !==
                  undefined
              ) {
                return Math.min(
                  min,
                  item.before_gas_day
                )
              }
              return min
            },
            Number.POSITIVE_INFINITY
          )
        // ถ้าไม่พบค่า before_gas_day ใน parent ให้ใช้ 0 เป็นค่า default
        if (
          minBeforeGasDay ===
          Number.POSITIVE_INFINITY
        ) {
          minBeforeGasDay = 0
        }

        // ตรวจสอบว่า before_gas_day ของ child ต้อง <= minBeforeGasDay ของ parent
        if (
          before_gas_day >
          minBeforeGasDay
        ) {
          return {
            isValid: false,
            // message: `Before Gas Day must be less than ${minBeforeGasDay}.` // ของเดิมบีม
            message: `Please enter a Before Gas Day value below ${minBeforeGasDay} day(s). The previous process type is configured to ${minBeforeGasDay}` // สร้าง process type ถัดไปแล้ว set b4 gas day มากกว่าตัวก่อนหน้า
          }
        }
        // ถ้า before_gas_day เท่ากับ minBeforeGasDay ให้เช็ค hour และ minute ต่อ
        else if (
          before_gas_day ===
          minBeforeGasDay
        ) {
          // กรอง parent deadlines ที่มี before_gas_day เท่ากับ minBeforeGasDay
          let parentNominationDeadlineByBeforeGasDay =
            parentNominationDeadline.filter(
              (item) =>
                item.before_gas_day ===
                minBeforeGasDay
            )
          // ถ้าไม่พบ ให้ใช้ parent deadlines ทั้งหมด
          if (
            parentNominationDeadlineByBeforeGasDay.length ==
            0
          ) {
            parentNominationDeadlineByBeforeGasDay =
              parentNominationDeadline
          }

          // หาค่า hour ที่มากที่สุดจาก parent deadlines ที่ผ่านการกรองแล้ว
          // เพื่อให้แน่ใจว่า child deadline จะต้องมี hour >= parent เมื่อ before_gas_day เท่ากัน
          let maxHour =
            parentNominationDeadlineByBeforeGasDay.reduce(
              (max, item) => {
                if (
                  item.hour !==
                    null &&
                  item.hour !==
                    undefined
                ) {
                  return Math.max(
                    max,
                    item.hour
                  )
                }
                return max
              },
              Number.NEGATIVE_INFINITY
            )
          // ถ้าไม่พบค่า hour ใน parent ให้ใช้ 0 เป็นค่า default
          if (
            maxHour ===
            Number.NEGATIVE_INFINITY
          ) {
            maxHour = 0
          }

          // ------- ย้ายมาจาก else if ข้างล่างง เพราะจะเอาชื่อ process type ไปใช้กับ response -------
          // กรอง parent deadlines ที่มี hour เท่ากับ maxHour
          let parentNominationDeadlineByHour =
            parentNominationDeadlineByBeforeGasDay.filter(
              (item) =>
                item.hour ===
                maxHour
            )

          const findParentProcessType =
            await this.prisma.process_type.findUnique(
              {
                where: {
                  id: parentNominationDeadlineByHour && parentNominationDeadlineByHour?.[0]
                    ?.process_type_id || -1
                }
              }
            )

          // ถ้าไม่พบ ให้ใช้ parent deadlines ที่กรองจาก before_gas_day แล้ว
          if (
            parentNominationDeadlineByHour && parentNominationDeadlineByHour.length ==
            0
          ) {
            parentNominationDeadlineByHour =
              parentNominationDeadlineByBeforeGasDay
          }

          // หาค่า minute ที่มากที่สุดจาก parent deadlines ที่ผ่านการกรองแล้ว
          // เพื่อให้แน่ใจว่า child deadline จะต้องมี minute >= parent เมื่อ before_gas_day และ hour เท่ากัน
          let maxMinute =
            parentNominationDeadlineByHour.reduce(
              (max, item) => {
                if (
                  item.minute !==
                    null &&
                  item.minute !==
                    undefined
                ) {
                  return Math.max(
                    max,
                    item.minute
                  )
                }
                return max
              },
              Number.NEGATIVE_INFINITY
            )
          // ----------------------------------------


          // https://app.clickup.com/t/9018502823/86euzxxp8
          if(parentNominationDeadlineByHour && !(parentNominationDeadlineByHour?.[0]?.process_type_id === 2 && parentNominationDeadlineByHour?.[0]?.user_type_id === 3)){

            // ตรวจสอบว่า hour ของ child ต้อง >= maxHour ของ parent
            if (
              hour < maxHour
            ) {
              const formatMinute =
                String(
                  maxMinute
                ).padStart(
                  2,
                  '0'
                )
                console.log('case er 1');
              return {
                isValid: false,
                // message: `Hour must be more than ${maxHour}.` // ของเดิมบีม
                // message: `Time must be ${maxHour}:${formatMinute} or after.` // ไม่มี clickup กันส่งมา ---> 3. Nomination Deadline เคสที่แก้ไขข้อมูล แล้วเวลามันข้ามลำดับกัน ยังแสดงไม่ถูก เคสนี้คือ ข้อมูลมี submission 15.15 อยู่ แล้วกันแก้ Management มาเป็น 15.10 ซึ่งมันต้องแก้ไม่ได้ถูกแล้ว แต่ error มันบอกแค่ว่า more than 15 ซึ่งมันต้องมีบอกนาทีด้วยเช่น Hour must be 15:30 or later.
                message: `Time must be ${maxHour}:${formatMinute} or after. because ${findParentProcessType?.name} time is ${maxHour}:${formatMinute}` // ไม่มี clickup กันส่งมา ---> 3. Nomination Deadline เคสที่แก้ไขข้อมูล แล้วเวลามันข้ามลำดับกัน ยังแสดงไม่ถูก เคสนี้คือ ข้อมูลมี submission 15.15 อยู่ แล้วกันแก้ Management มาเป็น 15.10 ซึ่งมันต้องแก้ไม่ได้ถูกแล้ว แต่ error มันบอกแค่ว่า more than 15 ซึ่งมันต้องมีบอกนาทีด้วยเช่น Hour must be 15:30 or later.
              }
            }
            // ถ้า hour เท่ากับ maxHour ให้เช็ค minute ต่อ
            else if (
              hour === maxHour
            ) {
              
  
              // ถ้าไม่พบค่า minute ใน parent ให้ใช้ 0 เป็นค่า default
              if (
                maxMinute ===
                Number.NEGATIVE_INFINITY
              ) {
                maxMinute = 0
              }
              const formatMinute =
                String(
                  maxMinute
                ).padStart(
                  2,
                  '0'
                )
  
              // ตรวจสอบว่า minute ของ child ต้อง >= maxMinute ของ parent
              if (
                minute <
                maxMinute
              ) {
                console.log('case er 2');
                return {
                  isValid: false,
                  // message: `Minute must be more than ${maxMinute}.` // ของเดิมบีม
                  // message: `Time must be ${maxHour}:${formatMinute} or after.` // ไม่มี clickup กันส่งมา ---> 3. Nomination Deadline เคสที่แก้ไขข้อมูล แล้วเวลามันข้ามลำดับกัน ยังแสดงไม่ถูก เคสนี้คือ ข้อมูลมี submission 15.15 อยู่ แล้วกันแก้ Management มาเป็น 15.10 ซึ่งมันต้องแก้ไม่ได้ถูกแล้ว แต่ error มันบอกแค่ว่า more than 15 ซึ่งมันต้องมีบอกนาทีด้วยเช่น Hour must be 15:30 or later.
                  message: `Time must be ${maxHour}:${formatMinute} or after. \n because ${findParentProcessType?.name} time is ${maxHour}:${formatMinute}` // ไม่มี clickup กันส่งมา ---> 3. Nomination Deadline เคสที่แก้ไขข้อมูล แล้วเวลามันข้ามลำดับกัน ยังแสดงไม่ถูก เคสนี้คือ ข้อมูลมี submission 15.15 อยู่ แล้วกันแก้ Management มาเป็น 15.10 ซึ่งมันต้องแก้ไม่ได้ถูกแล้ว แต่ error มันบอกแค่ว่า more than 15 ซึ่งมันต้องมีบอกนาทีด้วยเช่น Hour must be 15:30 or later.
                }
              }
            }
          }

        }
      } else {
        const parentProcessType =
          await this.prisma.process_type.findUnique(
            {
              where: {
                id: parentProcessTypeID
              }
            }
          )

        // หาตัวที่ seq ก่อนหน้า
        const parentNominationDeadline =
          await this.prisma.new_nomination_deadline.findMany(
            {
              where: {
                process_type_id:
                  parentProcessTypeID,
                user_type_id:
                  user_type_id,
                nomination_type_id:
                  nomination_type_id
              }
            }
          )

        const endDateParent =
          parentNominationDeadline?.[0]
            ?.end_date // อาจเป็น string/Date
        const formattedEndDateParent =
          endDateParent
            ? dayjs(
                endDateParent
              )
                .tz(
                  'Asia/Bangkok'
                )
                .format(
                  'DD/MM/YYYY'
                )
            : ''
        
        // https://app.clickup.com/t/9018502823/86euzxxp8
        if(!(parentNominationDeadline?.[0]?.process_type_id === 2 && parentNominationDeadline?.[0]?.user_type_id === 3)){
          return {
            isValid: false,
            // message: `Please add ${parentProcessType?.name || ''} that active before ${startDate.tz('Asia/Bangkok').format('DD/MM/YYYY')} before doing this again.` // ของเดิมบีม
            message: `Please Add ${parentProcessType?.name || ''} that active ${formattedEndDateParent} or later before doing this again.`
          }
        }
      }
    }

    // ตรวจสอบ children nomination deadlines (process_type_id > process_type_id ปัจจุบัน)
    // เพื่อให้แน่ใจว่า parent deadline จะต้องมากกว่า/เท่ากับ children deadlines
    if (
      childrenNominationDeadline.length >
      0
    ) {
      // หาค่า before_gas_day ที่มากที่สุดจาก children nomination deadlines
      // เพื่อให้แน่ใจว่า parent deadline จะต้องมี before_gas_day >= children
      let maxBeforeGasDay =
        childrenNominationDeadline.reduce(
          (max, item) => {
            if (
              item.before_gas_day !==
                null &&
              item.before_gas_day !==
                undefined
            ) {
              return Math.max(
                max,
                item.before_gas_day
              )
            }
            return max
          },
          Number.NEGATIVE_INFINITY
        )
      // ถ้าไม่พบค่า before_gas_day ใน children ให้ใช้ 0 เป็นค่า default
      if (
        maxBeforeGasDay ===
        Number.NEGATIVE_INFINITY
      ) {
        maxBeforeGasDay = 0
      }

      // ตรวจสอบว่า before_gas_day ของ parent ต้อง >= maxBeforeGasDay ของ children
      if (
        before_gas_day <
        maxBeforeGasDay
      ) {
        return {
          isValid: false,
          message: `Before Gas Day must be more than ${maxBeforeGasDay}.` // ของเดิมบีม
          // message: `Before Gas Day must be more than ${maxBeforeGasDay} or greater because Submission is set to 1 day before the Gas Day.`
        }
      }
      // ถ้า before_gas_day เท่ากับ maxBeforeGasDay ให้เช็ค hour และ minute ต่อ
      else if (
        before_gas_day ===
        maxBeforeGasDay
      ) {
        // กรอง children deadlines ที่มี before_gas_day เท่ากับ maxBeforeGasDay
        let childrenNominationDeadlineByBeforeGasDay =
          childrenNominationDeadline.filter(
            (item) =>
              item.before_gas_day ===
              maxBeforeGasDay
          )
        // ถ้าไม่พบ ให้ใช้ children deadlines ทั้งหมด
        if (
          childrenNominationDeadlineByBeforeGasDay.length ==
          0
        ) {
          childrenNominationDeadlineByBeforeGasDay =
            childrenNominationDeadline
        }

        // หาค่า hour ที่น้อยที่สุดจาก children deadlines ที่ผ่านการกรองแล้ว
        // เพื่อให้แน่ใจว่า parent deadline จะต้องมี hour <= children เมื่อ before_gas_day เท่ากัน
        let minHour =
          childrenNominationDeadlineByBeforeGasDay.reduce(
            (min, item) => {
              if (
                item.hour !==
                  null &&
                item.hour !==
                  undefined
              ) {
                return Math.min(
                  min,
                  item.hour
                )
              }
              return min
            },
            Number.POSITIVE_INFINITY
          )
        // ถ้าไม่พบค่า hour ใน children ให้ใช้ 0 เป็นค่า default
        if (
          minHour ===
          Number.POSITIVE_INFINITY
        ) {
          minHour = 0
        }

        // ตรวจสอบว่า hour ของ parent ต้อง <= minHour ของ children
        if (hour > minHour) {
          return {
            isValid: false,
            message: `Hour must be less than ${minHour}.`
          }
        }
        // ถ้า hour เท่ากับ minHour ให้เช็ค minute ต่อ
        else if (
          hour === minHour
        ) {
          // กรอง children deadlines ที่มี hour เท่ากับ minHour
          let childrenNominationDeadlineByHour =
            childrenNominationDeadlineByBeforeGasDay.filter(
              (item) =>
                item.hour ===
                minHour
            )
          // ถ้าไม่พบ ให้ใช้ children deadlines ที่กรองจาก before_gas_day แล้ว
          if (
            childrenNominationDeadlineByHour.length ==
            0
          ) {
            childrenNominationDeadlineByHour =
              childrenNominationDeadlineByBeforeGasDay
          }

          // หาค่า minute ที่น้อยที่สุดจาก children deadlines ที่ผ่านการกรองแล้ว
          // เพื่อให้แน่ใจว่า parent deadline จะต้องมี minute <= children เมื่อ before_gas_day และ hour เท่ากัน
          let minMinute =
            childrenNominationDeadlineByHour.reduce(
              (min, item) => {
                if (
                  item.minute !==
                    null &&
                  item.minute !==
                    undefined
                ) {
                  return Math.min(
                    min,
                    item.minute
                  )
                }
                return min
              },
              Number.POSITIVE_INFINITY
            )
          // ถ้าไม่พบค่า minute ใน children ให้ใช้ 0 เป็นค่า default
          if (
            minMinute ===
            Number.POSITIVE_INFINITY
          ) {
            minMinute = 0
          }

          // ตรวจสอบว่า minute ของ parent ต้อง <= minMinute ของ children
          if (
            minute > minMinute
          ) {
            return {
              isValid: false,
              message: `Minute must be less than ${minMinute}.`
            }
          }
        }
      }
    }

    return {
      isValid: true,
      message:
        'Process Type In Order.'
    }
  }

  async nominationDeadlineCreate(
    payload: any,
    userId: any
  ) {
    const {
      user_type_id,
      nomination_type_id,
      process_type_id,
      start_date,
      end_date,
      hour,
      minute,
      before_gas_day,
      ...dataWithout
    } = payload

    // เจอ overlap ทั้งๆที่วันที่ไม่ทับกัน เลยเปลี่ยนมาใช้ where date แทน checkStartEndBoom ก่อนเพราะรีบเอาขึ้นไป FAT
    // เพราะ checkStartEndBoom เป็นฟังก์ชันกลางถ้าแก้ต้องไปทดสอบหลายที่ซึ่งใช้เวลานาน
    // มีใช้ where แทนเหมือนกันใน checkingConditionCreate กับ checkingConditionEdit
    const startDate =
      getTodayNowYYYYMMDDDfaultAdd7(
        start_date
      ).toDate() // YYYY-MM-DD
    const endDate = end_date
      ? getTodayNowYYYYMMDDDfaultAdd7(
          end_date
        ).toDate()
      : null // YYYY-MM-DD
    const checkSE =
      await this.prisma.new_nomination_deadline.count(
        {
          where: {
            user_type_id:
              user_type_id,
            nomination_type_id:
              nomination_type_id,
            process_type_id:
              process_type_id,
            OR: [
              {
                AND: [
                  {
                    start_date:
                      {
                        lte: startDate
                      }
                  },
                  {
                    OR: [
                      {
                        end_date:
                          null
                      },
                      {
                        end_date:
                          {
                            gt: startDate
                          }
                      }
                    ]
                  }
                ]
              },
              {
                AND: [
                  {
                    start_date:
                      {
                        gte: startDate
                      }
                  },
                  ...(endDate
                    ? [
                        {
                          start_date:
                            {
                              lt: endDate
                            }
                        }
                      ]
                    : [])
                ]
              }
            ]
          }
        }
      )
    const flagSE = checkSE > 0

    // let flagSE = false;

    // if (checkSE.length > 0) {
    //   for (let i = 0; i < checkSE.length; i++) {
    //     const isOverlap = await checkStartEndBoom(
    //       checkSE[i]?.start_date,
    //       checkSE[i]?.end_date,
    //       start_date,
    //       end_date,
    //     );
    //     if (isOverlap) {
    //       flagSE = true;
    //       break;
    //     }
    //   }
    // } else {
    //   flagSE = false;
    // }

    if (flagSE) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date and End Date should not overlap.'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const validateProcessTypeInOrder =
        await this.validateProcessTypeInOrder(
          {
            user_type_id:
              user_type_id,
            nomination_type_id:
              nomination_type_id,
            process_type_id:
              process_type_id,
            start_date:
              start_date,
            end_date:
              end_date,
            hour: hour,
            minute: minute,
            before_gas_day:
              before_gas_day
          }
        )

      if (
        !validateProcessTypeInOrder.isValid
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              validateProcessTypeInOrder.message
          },
          HttpStatus.BAD_REQUEST
        )
      }
      const nominationDeadlineCreate =
        await this.prisma.new_nomination_deadline.create(
          {
            data: {
              ...dataWithout,
              ...(user_type_id !==
                null && {
                user_type: {
                  connect: {
                    id: user_type_id
                  }
                }
              }),
              ...(nomination_type_id !==
                null && {
                nomination_type:
                  {
                    connect: {
                      id: nomination_type_id
                    }
                  }
              }),
              ...(process_type_id !==
                null && {
                process_type:
                  {
                    connect: {
                      id: process_type_id
                    }
                  }
              }),
              // active: true,
              hour: hour,
              minute: minute,
              before_gas_day:
                before_gas_day,
              start_date:
                start_date
                  ? getTodayNowAdd7(
                      start_date
                    ).toDate()
                  : null,
              end_date:
                end_date
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
      return nominationDeadlineCreate
    }
  }

  async nominationDeadlineEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      user_type_id,
      nomination_type_id,
      process_type_id,
      start_date,
      end_date,
      hour,
      minute,
      before_gas_day,
      ...dataWithout
    } = payload

    // เจอ overlap ทั้งๆที่วันที่ไม่ทับกัน เลยเปลี่ยนมาใช้ where date แทน checkStartEndBoom ก่อนเพราะรีบเอาขึ้นไป FAT
    // เพราะ checkStartEndBoom เป็นฟังก์ชันกลางถ้าแก้ต้องไปทดสอบหลายที่ซึ่งใช้เวลานาน
    // มีใช้ where แทนเหมือนกันใน checkingConditionCreate กับ checkingConditionEdit
    const startDate =
      getTodayNowYYYYMMDDDfaultAdd7(
        start_date
      ).toDate() // YYYY-MM-DD
    const endDate = end_date
      ? getTodayNowYYYYMMDDDfaultAdd7(
          end_date
        ).toDate()
      : null // YYYY-MM-DD
    const checkSE =
      await this.prisma.new_nomination_deadline.count(
        {
          where: {
            id: {
              not: Number(id)
            },
            user_type_id:
              user_type_id,
            nomination_type_id:
              nomination_type_id,
            process_type_id:
              process_type_id,
            OR: [
              {
                AND: [
                  {
                    start_date:
                      {
                        lte: startDate
                      }
                  },
                  {
                    OR: [
                      {
                        end_date:
                          null
                      },
                      {
                        end_date:
                          {
                            gt: startDate
                          }
                      }
                    ]
                  }
                ]
              },
              {
                AND: [
                  {
                    start_date:
                      {
                        gte: startDate
                      }
                  },
                  ...(endDate
                    ? [
                        {
                          start_date:
                            {
                              lt: endDate
                            }
                        }
                      ]
                    : [])
                ]
              }
            ]
          }
        }
      )
    const flagSE = checkSE > 0

    // let flagSE = false;

    // if (checkSE.length > 0) {
    //   for (let i = 0; i < checkSE.length; i++) {
    //     const isOverlap = await checkStartEndBoom(
    //       checkSE[i]?.start_date,
    //       checkSE[i]?.end_date,
    //       start_date,
    //       end_date,
    //     );
    //     if (isOverlap) {
    //       flagSE = true;
    //       break;
    //     }
    //   }
    // } else {
    //   flagSE = false;
    // }

    if (flagSE) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date and End Date should not overlap.'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const validateProcessTypeInOrder =
        await this.validateProcessTypeInOrder(
          {
            user_type_id:
              user_type_id,
            nomination_type_id:
              nomination_type_id,
            process_type_id:
              process_type_id,
            start_date:
              start_date,
            end_date:
              end_date,
            hour: hour,
            minute: minute,
            before_gas_day:
              before_gas_day,
            exclude_id:
              Number(id)
          }
        )

      if (
        !validateProcessTypeInOrder.isValid
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              validateProcessTypeInOrder.message
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const nominationDeadlineEdit =
        await this.prisma.new_nomination_deadline.update(
          {
            where: {
              id: Number(id)
            },
            data: {
              ...dataWithout,
              ...(user_type_id !==
                null && {
                user_type: {
                  connect: {
                    id: user_type_id
                  }
                }
              }),
              ...(nomination_type_id !==
                null && {
                nomination_type:
                  {
                    connect: {
                      id: nomination_type_id
                    }
                  }
              }),
              ...(process_type_id !==
                null && {
                process_type:
                  {
                    connect: {
                      id: process_type_id
                    }
                  }
              }),
              // active: true,
              hour: hour,
              minute: minute,
              before_gas_day:
                before_gas_day,
              start_date:
                start_date
                  ? getTodayNowAdd7(
                      start_date
                    ).toDate()
                  : null,
              end_date:
                end_date
                  ? getTodayNowAdd7(
                      end_date
                    ).toDate()
                  : null,
              update_date:
                getTodayNowAdd7().toDate(),
              update_by_account:
                {
                  connect: {
                    id: Number(
                      userId
                    )
                  }
                },
              update_date_num:
                getTodayNowAdd7().unix()
            }
          }
        )
      return nominationDeadlineEdit
    }
  }
}
