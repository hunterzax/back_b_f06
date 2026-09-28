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
  getTodayNowAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ParameterSystemParameterService {
  constructor(
    private prisma: PrismaService
  ) {}

  subSystemParameter() {
    return this.prisma.menus.findMany(
      {
        where: {
          flag_system_parameter: true
        },
        include: {
          sub_system_parameter: true
        },
        orderBy: {
          id: 'asc'
        }
      }
    )
  }

  systemParameter() {
    const nowDates =
      getTodayNowAdd7().toDate()

    return this.prisma.system_parameter.findMany(
      {
        // where: {
        //   start_date: {
        //     lt: (nowDates && getTodayNowAdd7(nowDates).toDate()) || null,
        //   },
        // },
        include: {
          menus: true,
          system_parameter: true,
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

  systemParameterOnce(
    id: any
  ) {
    return this.prisma.system_parameter.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          menus: true,
          system_parameter: true,
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

  async systemParameterCreate(
    payload: any,
    userId: any
  ) {
    const {
      menus_id,
      system_parameter_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const startDayjs = start_date ? getTodayStartAdd7(start_date) : getTodayStartAdd7()
    const endDayjs = end_date ? getTodayEndAdd7(end_date) : null

    const checkSE =
      await this.prisma.system_parameter.findMany(
        {
          where: {
            AND: [
              {
                start_date: endDayjs && (endDayjs?.isValid() ? { lt: endDayjs.toDate() } : { lte: startDayjs.toDate() }) || { lte: startDayjs.toDate() },
              },
              {
                OR: [
                  { end_date : null},
                  { end_date : { gt: startDayjs.toDate() } }
                ],
              },
              {
            menus_id:
              menus_id,
              },
              {
            system_parameter_id:
              system_parameter_id
              },
            ]
          }
        }
      )
    let flagSE = false
    let isAutoEndExist = false
    const activeAndNoEnd = checkSE.filter(item => item.end_date === null && item.start_date <= startDayjs.toDate())

    // if (checkSE.length > 0) {
    //   for (
    //     let i = 0;
    //     i < checkSE.length;
    //     i++
    //   ) {
    //     const isOverlap =
    //       await checkStartEndBoom(
    //         checkSE[i]
    //           ?.start_date,
    //         checkSE[i]
    //           ?.end_date,
    //         start_date,
    //         end_date
    //       )
    //     if (isOverlap) {
    //       flagSE = true
    //       break
    //     }
    //   }
    // } else {
    //   flagSE = false
    // }

    if (checkSE.length > 0) {
      if(activeAndNoEnd.length == checkSE.length) {
        flagSE = false
        isAutoEndExist = true
      }
      else{
        flagSE = true
      }
    }
    else{
      flagSE = false
    }

    if (flagSE) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      let value =
        dataWithout?.value
      const validation =
        await this.systemParameterValidate(
          system_parameter_id,
          dataWithout?.value
        )

      if (
        !validation.isValid
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              validation.validateList.join(
                '<br/>'
              )
          },
          HttpStatus.BAD_REQUEST
        )
      }
      // else if(validation.convertedTimes){
      //   value = validation.convertedTimes
      // }

      const result = await this.prisma.$transaction(async (tx) => {
        if(isAutoEndExist){
          const updateResult = await tx.system_parameter.updateMany({
            where: {
              id: {
                in: activeAndNoEnd.map(item => item.id)
              }
            },
            data: {
              end_date: startDayjs.toDate(),
              update_date: getTodayNowAdd7().toDate(),
              update_by: Number(userId),
              update_date_num: getTodayNowAdd7().unix()
            }
          })
        }
      const systemParameterCreate =
          await tx.system_parameter.create(
          {
            data: {
              ...dataWithout,
              value: value,
              ...(menus_id !==
                null && {
                menus: {
                  connect: {
                    id: menus_id
                  }
                }
              }),
              ...(system_parameter_id !==
                null && {
                system_parameter:
                  {
                    connect: {
                      id: system_parameter_id
                    }
                  }
              }),
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
      return systemParameterCreate
      })
      return result
    }
  }

  async systemParameterEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      menus_id,
      system_parameter_id,
      start_date,
      end_date,
      ...dataWithout
    } = payload

    const startDayjs = start_date ? getTodayStartAdd7(start_date) : getTodayStartAdd7()
    const endDayjs = end_date ? getTodayEndAdd7(end_date) : null

    const checkSE =
      await this.prisma.system_parameter.findMany(
        {
          where: {
            AND: [
              {
            id: {
              not: Number(id)
            },
              },
              {
                start_date: endDayjs && (endDayjs?.isValid() ? { lt: endDayjs.toDate() } : { lte: startDayjs.toDate() }) || { lte: startDayjs.toDate() },
              },
              {
                OR: [
                  { end_date : null},
                  { end_date : { gt: startDayjs.toDate() } }
                ],
              },
              {
            menus_id:
              menus_id,
              },
              {
            system_parameter_id:
              system_parameter_id
              },
            ]
          }
        }
      )
    let flagSE = false
    let isAutoEndExist = false
    const activeAndNoEnd = checkSE.filter(item => item.end_date === null && item.start_date <= startDayjs.toDate())

    // if (checkSE.length > 0) {
    //   for (
    //     let i = 0;
    //     i < checkSE.length;
    //     i++
    //   ) {
    //     const isOverlap =
    //       await checkStartEndBoom(
    //         checkSE[i]
    //           ?.start_date,
    //         checkSE[i]
    //           ?.end_date,
    //         start_date,
    //         end_date
    //       )
    //     if (isOverlap) {
    //       flagSE = true
    //       break
    //     }
    //   }
    // } else {
    //   flagSE = false
    // }

    if (checkSE.length > 0) {
      if(activeAndNoEnd.length == checkSE.length) {
        flagSE = false
        isAutoEndExist = true
      }
      else{
        flagSE = true
      }
    }
    else{
      flagSE = false
    }

    if (flagSE) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Start Date and End Date should not overlap'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      let value =
        dataWithout?.value
      const validation =
        await this.systemParameterValidate(
          system_parameter_id,
          dataWithout?.value
        )

      if (
        !validation.isValid
      ) {
        throw new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              validation.validateList.join(
                '<br/>'
              )
          },
          HttpStatus.BAD_REQUEST
        )
      }
      // else if(validation.convertedTimes){
      //   value = validation.convertedTimes
      // }

      const result = await this.prisma.$transaction(async (tx) => {
        if(isAutoEndExist){
          const updateResult = await tx.system_parameter.updateMany({
            where: {
              id: {
                in: activeAndNoEnd.map(item => item.id)
              }
            },
            data: {
              end_date: startDayjs.toDate(),
              update_date: getTodayNowAdd7().toDate(),
              update_by: Number(userId),
              update_date_num: getTodayNowAdd7().unix()
            }
          })
        }
      const systemParameterEdit =
          await tx.system_parameter.update(
          {
            where: {
              id: Number(id)
            },
            data: {
              ...dataWithout,
              value: value,
              ...(menus_id !==
                null && {
                menus: {
                  connect: {
                    id: menus_id
                  }
                }
              }),
              ...(system_parameter_id !==
                null && {
                system_parameter:
                  {
                    connect: {
                      id: system_parameter_id
                    }
                  }
              }),
              // active: true,
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
      return systemParameterEdit
      })
      return result
    }
  }

  async systemParameterValidate(
    system_parameter_id: any,
    value: any
  ) {
    try {
      const subSystemParameter =
        await this.prisma.sub_system_parameter.findFirst(
          {
            where: {
              id: system_parameter_id
            }
          }
        )
      switch (
        subSystemParameter?.name?.toLowerCase()
      ) {
        case 'automatic execution of intraday balances (03:15am, 06:15am, 09:15am, 12:15pm, 15:15pm, 18:15pm, 21:15pm and 00:15am)': {
          // #region validate hour, minute, nDaysAgo and lookbackPeriod
          const splitItems: string[] =
            value
              ?.split(',')
              .map(
                (
                  item: string
                ) =>
                  item.trim()
              )
              .filter(
                (
                  item: string
                ) =>
                  item.length >
                  0
              )

          if (
            splitItems.length ==
            4
          ) {
            const validateList: string[] =
              []
            for (
              let i = 0;
              i <
              splitItems.length;
              i++
            ) {
              switch (i) {
                case 0:
                  try {
                    const hour =
                      Number(
                        splitItems[
                          i
                        ]
                      )
                    if (
                      Number.isNaN(
                        hour
                      )
                    ) {
                      validateList.push(
                        'Hour must be a number'
                      )
                    } else if (
                      !Number.isInteger(
                        hour
                      )
                    ) {
                      validateList.push(
                        'Hour must be an integer'
                      )
                    } else if (
                      hour < 0
                    ) {
                      validateList.push(
                        'Hour must be greater than 0'
                      )
                    }
                  } catch (error) {
                    validateList.push(
                      'Invalid hour'
                    )
                  }
                  break
                case 1:
                  try {
                    const minute =
                      Number(
                        splitItems[
                          i
                        ]
                      )
                    if (
                      Number.isNaN(
                        minute
                      )
                    ) {
                      validateList.push(
                        'Invalid minute'
                      )
                    } else if (
                      !Number.isInteger(
                        minute
                      )
                    ) {
                      validateList.push(
                        'Minute must be an integer'
                      )
                    } else if (
                      minute <
                        0 ||
                      minute >
                        59
                    ) {
                      validateList.push(
                        'Minute must be between 0 and 59'
                      )
                    }
                  } catch (error) {
                    validateList.push(
                      'Invalid minute'
                    )
                  }
                  break
                case 2:
                  try {
                    const lookbackPeriod =
                      Number(
                        splitItems[
                          i
                        ]
                      )
                    if (
                      Number.isNaN(
                        lookbackPeriod
                      )
                    ) {
                      validateList.push(
                        'Invalid LP'
                      )
                    } else if (
                      !Number.isInteger(
                        lookbackPeriod
                      )
                    ) {
                      validateList.push(
                        'LP must be an integer'
                      )
                    } else if (
                      lookbackPeriod <
                      0
                    ) {
                      validateList.push(
                        'LP must be greater than 0'
                      )
                    }
                  } catch (error) {
                    validateList.push(
                      'Invalid LP'
                    )
                  }
                  break
                case 3:
                  try {
                    const nDaysAgo =
                      Number(
                        splitItems[
                          i
                        ]
                      )
                    if (
                      Number.isNaN(
                        nDaysAgo
                      )
                    ) {
                      validateList.push(
                        'Invalid ND'
                      )
                    } else if (
                      !Number.isInteger(
                        nDaysAgo
                      )
                    ) {
                      validateList.push(
                        'ND must be an integer'
                      )
                    } else if (
                      nDaysAgo <
                      0
                    ) {
                      validateList.push(
                        'ND must be greater than 0'
                      )
                    }
                  } catch (error) {
                    validateList.push(
                      'Invalid ND'
                    )
                  }
                default:
                  break
              }
            }
            if (
              validateList.length >
              0
            ) {
              return {
                isValid: false,
                validateList:
                  validateList
              }
            } else {
              return {
                isValid: true,
                validateList:
                  []
              }
            }
          } else {
            return {
              isValid: false,
              validateList: [
                'Invalid format, please enter 4 items'
              ]
            }
          }
          // #endregion validate hour, minute, nDaysAgo and lookbackPeriod
        }

        case 'automatic execution of commercial balances (daily at 04:30am, 07:30am and 00:30am)': {
          // #region validate and convert time
          const splitItems: string[] =
            value
              ?.split(/,|and/)
              .map(
                (
                  item: string
                ) =>
                  item.trim()
              )
              .filter(
                (
                  item: string
                ) =>
                  item.length >
                  0
              )

          const validateAndConvertTime =
            (
              timeStr: string
            ) => {
              // Remove any extra spaces and convert to lowercase for AM/PM detection
              const cleanTime =
                timeStr
                  .trim()
                  .toLowerCase()

              // Check for AM/PM format (e.g., "04:30am", "12:15pm")
              const ampmRegex =
                /^(\d{1,2}):(\d{2})(am|pm)$/i
              const ampmMatch =
                cleanTime.match(
                  ampmRegex
                )

              if (ampmMatch) {
                let hours =
                  parseInt(
                    ampmMatch[1]
                  )
                const minutes =
                  parseInt(
                    ampmMatch[2]
                  )
                const period =
                  ampmMatch[3].toLowerCase()

                // Validate minutes
                if (
                  minutes <
                    0 ||
                  minutes > 59
                ) {
                  return {
                    isValid: false,
                    time24:
                      null,
                    error: `Invalid minutes: ${minutes} at ${timeStr}`
                  }
                }

                // Validate hours for AM/PM format (allow 0 for midnight: 00:xx AM)
                if (
                  hours < 0 ||
                  hours > 12
                ) {
                  return {
                    isValid: false,
                    time24:
                      null,
                    error: `Invalid hours for AM/PM format: ${hours} at ${timeStr}`
                  }
                }

                // Convert to 24-hour format
                if (
                  period ===
                  'am'
                ) {
                  if (
                    hours ===
                    12
                  )
                    hours = 0 // 12 AM = 00:xx
                  // hours === 0 stays 0 (00 AM = 00:xx, alternative midnight format)
                } else {
                  // pm
                  if (
                    hours !==
                    12
                  )
                    hours += 12 // 1 PM = 13:xx, but 12 PM = 12:xx
                }

                const time24 = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
                return {
                  isValid: true,
                  time24,
                  error: null
                }
              }

              // Check for 24-hour format (e.g., "04:30", "23:15")
              const hour24Regex =
                /^(\d{1,2}):(\d{2})$/
              const hour24Match =
                cleanTime.match(
                  hour24Regex
                )

              if (
                hour24Match
              ) {
                const hours =
                  parseInt(
                    hour24Match[1]
                  )
                const minutes =
                  parseInt(
                    hour24Match[2]
                  )

                // Validate hours and minutes for 24-hour format
                if (
                  hours < 0 ||
                  hours > 23
                ) {
                  return {
                    isValid: false,
                    time24:
                      null,
                    error: `Invalid hours for 24-hour format: ${hours} at ${timeStr}`
                  }
                }

                if (
                  minutes <
                    0 ||
                  minutes > 59
                ) {
                  return {
                    isValid: false,
                    time24:
                      null,
                    error: `Invalid minutes: ${minutes} at ${timeStr}`
                  }
                }

                const time24 = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
                return {
                  isValid: true,
                  time24,
                  error: null
                }
              }

              return {
                isValid: false,
                time24: null,
                error: `Invalid time format: ${timeStr}`
              }
            }

          const validationResults =
            splitItems.map(
              (item) =>
                validateAndConvertTime(
                  item
                )
            )
          const invalidTimes =
            validationResults.filter(
              (result) =>
                !result.isValid
            )

          if (
            invalidTimes.length >
            0
          ) {
            return {
              isValid: false,
              validateList:
                invalidTimes.map(
                  (result) =>
                    result.error
                )
            }
          }

          const convertedTimes =
            validationResults
              .map(
                (result) =>
                  result.time24
              )
              .join(', ')

          return {
            isValid: true,
            validateList: [],
            convertedTimes // Optional: return the converted times if needed
          }
          // #endregion  validate and convert time
        }
        default:
          return {
            isValid: true,
            validateList: []
          }
      }
    } catch (error) {
      return {
        isValid: false,
        validateList: [
          error?.message
        ]
      }
    }
  }
}
