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
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {getTodayEndAdd7, getTodayEndDDMMYYYYDfaultAdd7, getTodayNow, getTodayNowAdd7, getTodayNowDDMMYYYYDfaultAdd7, getTodayNowYYYYMMDDDfaultAdd7, getTodayStartAdd7, getTodayStartDDMMYYYYDfaultAdd7} from 'src/common/utils/date.util'
import {Prisma} from '@prisma/client'
import {parseToNumber, parseToNumber3Decimal} from 'src/common/utils/number.util'
import {isMatch} from 'src/common/utils/allocation.util'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

const headNomSheet3 = [
  [], // Row 0
  ['Supply/Demand'], // Row 1
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

@Injectable()
export class QueryShipperNominationFileService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService

    // SubmissionFileRefactoredService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async submission_comment_query_shipper_nomination_file(id: any, userId?: any) {
   
    const versionId = await this.prisma.nomination_version.findFirst({
      where: {
        query_shipper_nomination_file_id: Number(id),
        flag_use: true
      }
    })
    

    // // ไม่รอบรับข้อมูลเก่า nom version & ใช้ร่วมกับ edit ข้างใน
    const resData = await this.prisma.submission_comment_query_shipper_nomination_file.findMany({
      where: {
        create_date: versionId?.create_date,
        query_shipper_nomination_file: {
          nomination_version: {
            some: {
              id: versionId?.id
            }
          }
        }
      },
      include: {
        nomination_version: true
      },
      orderBy: {
        id: 'desc'
      }
    })

    return resData
  }

  async submission_comment_query_shipper_nomination_file_version(id: any, userId?: any) {

    const versionIdArr = await this.prisma.nomination_version.findMany({
      where: {
        query_shipper_nomination_file_id: Number(id),
        // flag_use: true
      },
      orderBy:{
        create_date:"desc"
      }
    })
    let versionSubmission = []
    for (let i_ = 0; i_ < (versionIdArr || []).length; i_++) {
      const resDataArr = await this.prisma.submission_comment_query_shipper_nomination_file.findMany({
        where: {
          create_date: versionIdArr[i_]?.create_date,
          query_shipper_nomination_file: {
            nomination_version: {
              some: {
                id: versionIdArr[i_]?.id
              }
            }
          }
        },
        include: {
          nomination_version: true
        },
        orderBy: {
          id: 'desc'
        }
      })
      versionSubmission.push({
        ...versionIdArr?.[i_],
        submiss: resDataArr || []
      })
    }
    return versionSubmission
  }

  async query_shipper_nomination_file_url(id: any, userId?: any) {
    const resData = await this.prisma.query_shipper_nomination_file_url.findMany({
      where: {
        query_shipper_nomination_file_id: Number(id)
      },
      include: {
        nomination_version: true,
        query_shipper_nomination_status: true,
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

  async query_shipper_nomination_file_comment(id: any, userId?: any) {
    const resData = await this.prisma.query_shipper_nomination_file_comment.findMany({
      where: {
        del_flag: null,
        query_shipper_nomination_file_id: Number(id)
      },
      include: {
        nomination_version: true,
        query_shipper_nomination_status: true,
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

  async query_shipper_nomination_file_comment_delete(id: any, userId?: any) {
    const resData = await this.prisma.query_shipper_nomination_file_comment.updateMany({
      where: {
        id: Number(id)
      },
      data:{
        del_flag: true, 
      },
    })
    return resData
  }

  // เอาไว้ map file url กับเส้นหลัก --> findAll
  // หน้าบ้านใช้
  async getFileName() {
    try {
      const resData = await this.prisma.query_shipper_nomination_file.findMany({
        where: {
          OR: [
            {
              del_flag: false
            },
            {
              del_flag: null
            }
          ]
        },
        include: {
          query_shipper_nomination_file_url: {
            include: {
              nomination_version: true,
              query_shipper_nomination_status: true
            },
            orderBy: {
              id: 'desc'
            }
          }
        },
        orderBy: {
          id: 'desc'
        }
      })

      return resData
    } catch (error) {
      return []
    }
  }

  async findAllChunked(andInWhere: any[]) {
    const batchSize = 50 // ลอง 20, 50, 100
    let cursorId: number | null = null
    let hasMore = true

    const finalResults: any[] = []

    while (hasMore) {
      // 1) ดึงเฉพาะ id ก่อน
      const idsBatch = await this.prisma.query_shipper_nomination_file.findMany({
        where: {
          AND: andInWhere
        },
        select: {
          id: true
        },
        orderBy: {
          id: 'desc'
        },
        take: batchSize,
        ...(cursorId
          ? {
              cursor: {
                id: cursorId
              },
              skip: 1
            }
          : {})
      })

      if (idsBatch.length === 0) {
        hasMore = false
        break
      }

      const ids = idsBatch.map((i) => i.id)

      // 2) ดึงข้อมูลเต็มของ batch นี้
      const rows = await this.prisma.query_shipper_nomination_file.findMany({
        where: {
          id: {in: ids}
        },
        include: {
          group: true,
          query_shipper_nomination_status: true,
          reserve_balancing_gas_contract: {
            include: {
              reserve_balancing_gas_contract_comment: true,
              reserve_balancing_gas_contract_detail: {
                include: {
                  nomination_point: {
                    include: {
                      area: true,
                      zone: true
                    }
                  },
                  area: true,
                  zone: true
                }
              },
              reserve_balancing_gas_contract_files: true
            }
          },
          contract_code: {
            include: {
              booking_version: {
                select: {
                  booking_row_json: {
                    select: {
                      zone_text: true,
                      area_text: true,
                      entry_exit_id: true,
                      entry_exit: true,
                      contract_point: true
                    }
                  },
                  booking_row_json_release: {
                    select: {
                      zone_text: true,
                      area_text: true,
                      entry_exit_id: true,
                      entry_exit: true,
                      contract_point: true
                    }
                  }
                },
                take: 1,
                where: {
                  flag_use: true
                },
                orderBy: {
                  id: 'desc'
                }
              }
            }
          },
          _count: {
            select: {
              // submission_comment_query_shipper_nomination_file: {
              //   where:{
              //     nomination_version: {
              //       is: { flag_use: true },
              //     },
              //   }
              // },
              query_shipper_nomination_file_url: true,
              query_shipper_nomination_file_comment: true
            }
          },
          nomination_type: true,
          nomination_version: {
            include: {
              nomination_full_json: true,
              nomination_full_json_sheet2: true,
              nomination_row_json: {
                include: {
                  query_shipper_nomination_type: true
                },
                orderBy: {
                  id: 'asc'
                }
              }
            },
            where: {
              flag_use: true
            }
          },
          query_shipper_nomination_file_renom: true,

          submission_comment_query_shipper_nomination_file: {
            take: 1,
            orderBy: [
              {
                create_date: 'desc'
              },
              {
                id: 'desc'
              }
            ],
            select: {
              create_date: true
            }
          }
        },
        orderBy: {
          id: 'desc'
        }
      })

      // 3) รักษาลำดับให้ตรงกับ idsBatch
      const rowsMap = new Map(rows.map((r) => [r.id, r]))
      const orderedRows = ids.map((id) => rowsMap.get(id)).filter(Boolean)

      finalResults.push(...orderedRows)

      // 4) cursor ไปต่อ
      cursorId = idsBatch[idsBatch.length - 1].id

      if (idsBatch.length < batchSize) {
        hasMore = false
      }
    }

    return finalResults
  }

  async findAll(query?: any, userId?: any) {
    const andInWhere: Prisma.query_shipper_nomination_fileWhereInput[] = [
      {
        OR: [{del_flag: false}, {del_flag: null}]
      }
    ]

    if (query?.nomination_type_id && parseToNumber(query?.nomination_type_id)) {
      andInWhere.push({
        nomination_type_id: parseToNumber(query.nomination_type_id)
      })
    }

    if (query?.gas_day) {
      const gasDay = getTodayNowYYYYMMDDDfaultAdd7(query.gas_day)
      if (gasDay.isValid()) {
        andInWhere.push({
          gas_day: gasDay.toDate()
        })
      }
    }

    const resData_ = await this.findAllChunked(andInWhere)
    // const resData_ = await this.prisma.query_shipper_nomination_file.findMany({
    //   where: {
    //     // NOT: { contract_code_id: null }, // revers bal ไม่แสดง effect
    //     AND: andInWhere,
    //   },
    //   include: {
    //     group: true,
    //     query_shipper_nomination_status: true,
    //     reserve_balancing_gas_contract: {
    //       include: {
    //         reserve_balancing_gas_contract_comment: true,
    //         reserve_balancing_gas_contract_detail: {
    //           include: {
    //             nomination_point: {
    //               include: {
    //                 area: true,
    //                 zone: true,
    //               },
    //             },
    //             area: true,
    //             zone: true,
    //           },
    //         },
    //         reserve_balancing_gas_contract_files: true,
    //       },
    //     },
    //     contract_code: {
    //       include: {
    //         booking_version: {
    //           select: {
    //             booking_row_json: {
    //               select: {
    //                 zone_text: true,
    //                 area_text: true,
    //                 entry_exit_id: true,
    //                 entry_exit: true,
    //                 contract_point: true,
    //               },
    //             },
    //             booking_row_json_release: {
    //               select: {
    //                 zone_text: true,
    //                 area_text: true,
    //                 entry_exit_id: true,
    //                 entry_exit: true,
    //                 contract_point: true,
    //               },
    //             },
    //           },
    //           take: 1,
    //           where: {
    //             flag_use: true,
    //           },
    //           orderBy: {
    //             id: 'desc',
    //           },
    //         },
    //       },
    //     },
    //     _count: {
    //       select: {
    //         // submission_comment_query_shipper_nomination_file: {
    //         //   where:{
    //         //     nomination_version: {
    //         //       is: { flag_use: true },
    //         //     },
    //         //   }
    //         // },
    //         query_shipper_nomination_file_url: true,
    //         query_shipper_nomination_file_comment: true,
    //       },
    //     },
    //     nomination_type: true,
    //     nomination_version: {
    //       include: {
    //         nomination_full_json: true,
    //         nomination_full_json_sheet2: true,
    //         nomination_row_json: {
    //           include: {
    //             query_shipper_nomination_type: true,
    //           },
    //           orderBy: {
    //             id: 'asc',
    //           },
    //         },
    //       },
    //       where: {
    //         flag_use: true,
    //       },
    //     },
    //     query_shipper_nomination_file_renom: true,

    //     submission_comment_query_shipper_nomination_file: {
    //       take: 1,
    //       orderBy: [
    //         { create_date: "desc" },
    //         { id: "desc" },
    //       ],
    //       select: {
    //         create_date: true,
    //       },
    //     },

    //   },
    //   orderBy: {
    //     id: 'desc',
    //   },
    // });

    const orPairs = resData_
      .map((f) => {
        // const latestDate = f.submission_comment_query_shipper_nomination_file?.[0]?.create_date;
        const latestDate = f?.nomination_version?.[0]?.create_date
        if (!latestDate) return null

        return {
          query_shipper_nomination_file_id: f.id,
          create_date: latestDate
        }
      })
      .filter(Boolean) as Array<{
      query_shipper_nomination_file_id: number
      create_date: Date
    }>

    const latestCounts = orPairs.length
      ? await this.prisma.submission_comment_query_shipper_nomination_file.groupBy({
          by: ['query_shipper_nomination_file_id'],
          where: {
            OR: orPairs
          },
          _count: {
            _all: true
          }
        })
      : []

    const latestCountMap = new Map(latestCounts.map((x) => [x.query_shipper_nomination_file_id, x._count._all]))

    const resData = resData_.map((f) => ({
      ...f,
      _count: {
        ...f._count,
        submission_comment_query_shipper_nomination_file: latestCountMap.get(f.id) ?? 0
      }
    }))

    const nominationPointList = await this.prisma.nomination_point.findMany({
      include: {
        contract_point_list: true
      }
    })

    const todayNow = getTodayNow()
    const startOfToday = getTodayStartAdd7()
    // Initialize empty array for deadline list
    let deadlineList = []
    try {
      // Get current date in UTC+7 timezone
      const todayStart = startOfToday.toDate()

      // Define base conditions for nomination deadline query
      const andInWhere: Prisma.new_nomination_deadlineWhereInput[] = [
        {
          start_date: {
            lte: todayStart // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          }
        },
        {
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: todayStart
              }
            } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
          ]
        },
        {
          OR: [
            {
              process_type: {
                name: 'Management'
              }
            },
            {
              process_type: {
                id: 2
              }
            },
            {
              process_type: {
                name: 'Validity response of renomination'
              }
            },
            {
              process_type: {
                id: 4
              }
            }
          ]
        }
      ]
      // Get user's account management info including user type
      const accountManage = await this.prisma.account_manage.findFirst({
        where: {
          account_id: Number(userId)
        },
        include: {
          user_type: true
        }
      })

      // Add user type filter if user is not admin (type 1)
      if (accountManage?.user_type_id && accountManage?.user_type_id != 1) {
        andInWhere.push({
          user_type_id: accountManage?.user_type_id
        })
      }

      // Fetch nomination deadlines with process type info
      deadlineList = await this.prisma.new_nomination_deadline.findMany({
        where: {
          AND: andInWhere
        },
        include: {
          process_type: true
        }
      })
    } catch (error) {
      // If any error occurs, set empty array as fallback
      deadlineList = []
    }

    const nresData = resData?.map((e) => {
      let disabledFlag = e?.contract_code?.status_capacity_request_management_id === 3 || e?.contract_code?.status_capacity_request_management_id === 5 ? true : false

      const contractPointList = (e && e.contract_code?.booking_version?.[0]?.booking_row_json || []).map((bookingRowJson) => bookingRowJson.contract_point)
      let endDate = e.gas_day
      if (e.nomination_type_id == 2) {
        endDate = getTodayNowAdd7(e.gas_day).endOf('week').toDate()
      }
      const activeNominationPointList = nominationPointList.filter((nominationPoint) => {
        return nominationPoint.start_date <= endDate && (nominationPoint.end_date === null || nominationPoint.end_date >= e.gas_day)
      })

      // if(disabledFlag == false){
      //   // Find matching nomination deadline based on:
      //   // 1. Same nomination type
      //   // 2. Process type based on whether it's a renomination or not
      //   const deadlineListByType = deadlineList.filter(deadline => {
      //     return e.nomination_type_id == deadline.nomination_type_id &&
      //     (
      //       e.query_shipper_nomination_file_renom ?
      //         // For renomination: check process type 4 or 'Validity response of renomination'
      //         (deadline.process_type.id == 4 ||  deadline.process_type.name == 'Validity response of renomination')
      //         :
      //         // For normal nomination: check process type 2 or 'Management'
      //         (deadline.process_type.id == 2 ||  deadline.process_type.name == 'Management')
      //     )
      //   })
      //   // Find the object with minimum values using cascading comparison
      //   const nomDeadline = deadlineListByType.length < 1 ?
      //     undefined
      //   :
      //     deadlineListByType.reduce((min, current) => {
      //       if (current.before_gas_day < min.before_gas_day) {
      //         return current;
      //       } else if (current.before_gas_day === min.before_gas_day) {
      //         if (current.hour > min.hour) {
      //           return current;
      //         } else if (current.hour === min.hour) {
      //           if (current.minute > min.minute) {
      //             return current;
      //           }
      //         }
      //       }
      //       return min;
      //     }, deadlineListByType[0]);

      //   // Check if nomination deadline exists
      //   if(nomDeadline){
      //     // Parse the gas day into a dayjs object
      //     const gasDay = dayjs(e.gas_day)
      //     if(gasDay.isValid()){
      //       // Determine the time unit (week or day) based on whether it's a renomination
      //       const unit = 'day' //e.query_shipper_nomination_file_renom ? 'week' : 'day'
      //       // Calculate the deadline date by subtracting the specified time before gas day
      //       const deadlineDate = gasDay.subtract(nomDeadline.before_gas_day, unit)
      //       // Check if the deadline is before today's start - if so, disable the nomination
      //       if(deadlineDate.isBefore(startOfToday)){
      //         disabledFlag = true
      //       }
      //       // If deadline is today, check the specific time
      //       else if(deadlineDate.isSame(startOfToday)){
      //         // Disable if current hour is past the deadline hour
      //         if(todayNow.hour() > nomDeadline.hour){
      //           disabledFlag = true
      //         }
      //         // If same hour, check minutes
      //         else if(todayNow.hour() == nomDeadline.hour && todayNow.minute() > nomDeadline.minute){
      //           disabledFlag = true
      //         }
      //       }
      //     }
      //   }
      // }

      const nominationVersionWithContractPointList = e.nomination_version.map((nomination_version) => {
        const nominationRowJsonWithContractPointList = nomination_version.nomination_row_json.map((nomination_row_json) => {
          if (nomination_row_json.zone_text && nomination_row_json.area_text) {
            // is nom point
            const dataTemp = JSON.parse(nomination_row_json.data_temp)
            const targetContractPointList = activeNominationPointList
              .filter((nominationPoint) => nominationPoint.nomination_point == dataTemp['3'])
              .map((nominationPoint) => {
                const contractPointOfNomPointList = nominationPoint.contract_point_list.filter((contractPoint) => contractPointList?.includes(contractPoint.contract_point))

                return contractPointOfNomPointList
              })
              .flat() // Flatten the nested array to 1 level
              .filter((item, index, self) => index === self.findIndex((obj) => obj.id === item.id)) // Remove duplicates by id

            return {
              ...nomination_row_json,
              contract_point_list: targetContractPointList
            }
          }
          return nomination_row_json
        })

        nomination_version.nomination_row_json = nominationRowJsonWithContractPointList
        return nomination_version
      })

      let latestSubmittedTimestamp: Date | undefined = e && e?.submitted_timestamp || undefined
      try {
        e.nomination_version
        if (e?.nomination_version && e.nomination_version.length > 0 && e.nomination_version[0]?.create_date) {
          latestSubmittedTimestamp = e.nomination_version[0].create_date
        }
      } catch (error) {
        latestSubmittedTimestamp = e?.submitted_timestamp
      }

      e.nomination_version = nominationVersionWithContractPointList

      return {
        ...e,
        disabledFlag,
        latestSubmittedTimestamp
      }
    })

    return nresData
  }

  // ปรับ performance
  async findAllV2(body?: any, userId?: any) {
    // body?.shipper_id_arr
    // body?.contract_id_arr
    // body?.status_id_arr
    // body?.search
    // "search": "" // shipper name (group?.name) | contract code (contract_code?.contract_code)

    const limit_ = body?.limit ? Number(body?.limit) : 10
    const offset_ = body?.offset ? Number(body?.offset) : 0

    const andInWhere: Prisma.query_shipper_nomination_fileWhereInput[] = [
      {
        OR: [{del_flag: false}, {del_flag: null}]
      }
    ]

    if (body?.nomination_type_id && parseToNumber(body?.nomination_type_id)) {
      andInWhere.push({
        nomination_type_id: parseToNumber(body.nomination_type_id)
      })
    }

    if (body?.gas_day) {
      const gasDay = getTodayNowYYYYMMDDDfaultAdd7(body?.gas_day)
      if (gasDay.isValid()) {
        andInWhere.push({
          gas_day: gasDay.toDate()
        })
      }
    }
    if (body?.gas_day_from || body?.gas_day_to) {
      const gasDayFrom = getTodayNowYYYYMMDDDfaultAdd7(body?.gas_day_from)
      const gasDayTo = getTodayNowYYYYMMDDDfaultAdd7(body?.gas_day_to)

      if (gasDayFrom.isValid() && gasDayTo.isValid()) {
        andInWhere.push({
          gas_day: {
            gte: gasDayFrom.toDate(),
            lte: gasDayTo.toDate()
          }
        })
      } else if (gasDayFrom.isValid()) {
        andInWhere.push({
          gas_day: {
            gte: gasDayFrom.toDate()
          }
        })
      }
    }

    if (body?.shipper_id_arr?.length > 0) {
      andInWhere.push({
        group: {
          id: {
            in: body?.shipper_id_arr
          }
        }
      })
    }

    if (body?.contract_id_arr?.length > 0) {
      andInWhere.push({
        contract_code: {
          id: {
            in: body?.contract_id_arr
          }
        }
      })
    }

    if (body?.contract_code_arr?.length > 0) {
      andInWhere.push({
        OR: [
          {
            contract_code: {
              contract_code: {
                in: body?.contract_code_arr
              }
            }
          },
          {
            reserve_balancing_gas_contract: {
              res_bal_gas_contract: {
                in: body?.contract_code_arr
              }
            }
          }
        ]
      })
    }

    if (body?.status_id_arr?.length > 0) {
      andInWhere.push({
        query_shipper_nomination_status: {
          id: {
            in: body?.status_id_arr
          }
        }
      })
    }

    if (body?.search) {
      andInWhere.push({
        OR: [
          {
            group: {
              name: {
                contains: body?.search,
                mode: 'insensitive'
              }
            }
          },
          {
            contract_code: {
              contract_code: {
                contains: body?.search,
                mode: 'insensitive'
              }
            }
          }
        ]
      })
    }

    const count_ = await this.prisma.query_shipper_nomination_file.count({
      where: {
        // NOT: { contract_code_id: null }, // revers bal ไม่แสดง effect
        AND: andInWhere
      }
    })

    const resData_ = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        // NOT: { contract_code_id: null }, // revers bal ไม่แสดง effect
        AND: andInWhere
      },
      include: {
        group: true,
        query_shipper_nomination_status: true,
        reserve_balancing_gas_contract: {
          include: {
            reserve_balancing_gas_contract_comment: true,
            reserve_balancing_gas_contract_detail: {
              include: {
                nomination_point: {
                  include: {
                    area: true,
                    zone: true
                  }
                },
                area: true,
                zone: true
              }
            },
            reserve_balancing_gas_contract_files: true
          }
        },
        contract_code: {
          include: {
            booking_version: {
              select: {
                booking_row_json: {
                  select: {
                    zone_text: true,
                    area_text: true,
                    entry_exit_id: true,
                    entry_exit: true,
                    contract_point: true
                  }
                },
                booking_row_json_release: {
                  select: {
                    zone_text: true,
                    area_text: true,
                    entry_exit_id: true,
                    entry_exit: true,
                    contract_point: true
                  }
                }
              },
              take: 1,
              where: {
                flag_use: true
              },
              orderBy: {
                id: 'desc'
              }
            }
          }
        },
        _count: {
          select: {
            // submission_comment_query_shipper_nomination_file: {
            //   where:{
            //     nomination_version: {
            //       is: { flag_use: true },
            //     },
            //   }
            // },
            query_shipper_nomination_file_url: true,
            query_shipper_nomination_file_comment: true
          }
        },
        nomination_type: true,
        nomination_version: {
          include: {
            nomination_full_json: true,
            nomination_full_json_sheet2: true,
            nomination_row_json: {
              include: {
                query_shipper_nomination_type: true
              },
              orderBy: {
                id: 'asc'
              }
            }
          },
          where: {
            flag_use: true
          }
        },
        query_shipper_nomination_file_renom: true,

        submission_comment_query_shipper_nomination_file: {
          take: 1,
          orderBy: [
            {
              create_date: 'desc'
            },
            {id: 'desc'}
          ],
          select: {
            create_date: true
          }
        },
        query_shipper_nomination_file_comment:{
          select:{
            id:true
          },
          where:{
            del_flag: null
          }
        }
      },
      orderBy: {
        id: 'desc'
      },
      skip: Number(offset_),
      take: Number(limit_)
    })

    const orPairs = resData_
      .map((f) => {
        // const latestDate = f.submission_comment_query_shipper_nomination_file?.[0]?.create_date;
        const latestDate = f?.nomination_version?.[0]?.create_date
        if (!latestDate) return null

        return {
          query_shipper_nomination_file_id: f.id,
          create_date: latestDate
        }
      })
      .filter(Boolean) as Array<{
      query_shipper_nomination_file_id: number
      create_date: Date
    }>

    const latestCounts = orPairs.length
      ? await this.prisma.submission_comment_query_shipper_nomination_file.groupBy({
          by: ['query_shipper_nomination_file_id'],
          where: {
            OR: orPairs
          },
          _count: {
            _all: true
          }
        })
      : []

    const latestCountMap = new Map(latestCounts.map((x) => [x.query_shipper_nomination_file_id, x._count._all]))

    const resData = resData_.map((f) => ({
      ...f,
      _count: {
        ...f._count,
        submission_comment_query_shipper_nomination_file: latestCountMap.get(f.id) ?? 0
      }
    }))

    const nominationPointList = await this.prisma.nomination_point.findMany({
      include: {
        contract_point_list: true
      }
    })

    const todayNow = getTodayNow()
    const startOfToday = getTodayStartAdd7()
    // Initialize empty array for deadline list
    let deadlineList = []
    try {
      // Get current date in UTC+7 timezone
      const todayStart = startOfToday.toDate()

      // Define base conditions for nomination deadline body
      const andInWhere: Prisma.new_nomination_deadlineWhereInput[] = [
        {
          start_date: {
            lte: todayStart // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          }
        },
        {
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: todayStart
              }
            } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
          ]
        },
        {
          OR: [
            {
              process_type: {
                name: 'Management'
              }
            },
            {
              process_type: {
                id: 2
              }
            },
            {
              process_type: {
                name: 'Validity response of renomination'
              }
            },
            {
              process_type: {
                id: 4
              }
            }
          ]
        }
      ]
      // Get user's account management info including user type
      const accountManage = await this.prisma.account_manage.findFirst({
        where: {
          account_id: Number(userId)
        },
        include: {
          user_type: true
        }
      })

      // Add user type filter if user is not admin (type 1)
      if (accountManage?.user_type_id && accountManage?.user_type_id != 1) {
        andInWhere.push({
          user_type_id: accountManage?.user_type_id
        })
      }

      // Fetch nomination deadlines with process type info
      deadlineList = await this.prisma.new_nomination_deadline.findMany({
        where: {
          AND: andInWhere
        },
        include: {
          process_type: true
        }
      })
    } catch (error) {
      // If any error occurs, set empty array as fallback
      deadlineList = []
    }

    const nresData = resData?.map((e) => {
      let disabledFlag = e?.contract_code?.status_capacity_request_management_id === 3 || e?.contract_code?.status_capacity_request_management_id === 5 ? true : false

      const contractPointList = (e && e.contract_code?.booking_version?.[0]?.booking_row_json || []).map((bookingRowJson) => bookingRowJson.contract_point)
      let endDate = e.gas_day
      if (e.nomination_type_id == 2) {
        endDate = getTodayNowAdd7(e.gas_day).endOf('week').toDate()
      }
      const activeNominationPointList = nominationPointList.filter((nominationPoint) => {
        return nominationPoint.start_date <= endDate && (nominationPoint.end_date === null || nominationPoint.end_date >= e.gas_day)
      })


      const nominationVersionWithContractPointList = e.nomination_version.map((nomination_version) => {
        const nominationRowJsonWithContractPointList = nomination_version.nomination_row_json.map((nomination_row_json) => {
          if (nomination_row_json.zone_text && nomination_row_json.area_text) {
            // is nom point
            const dataTemp = JSON.parse(nomination_row_json.data_temp)
            const targetContractPointList = activeNominationPointList
              .filter((nominationPoint) => nominationPoint.nomination_point == dataTemp['3'])
              .map((nominationPoint) => {
                const contractPointOfNomPointList = nominationPoint.contract_point_list.filter((contractPoint) => contractPointList?.includes(contractPoint.contract_point))

                return contractPointOfNomPointList
              })
              .flat() // Flatten the nested array to 1 level
              .filter((item, index, self) => index === self.findIndex((obj) => obj.id === item.id)) // Remove duplicates by id

            return {
              ...nomination_row_json,
              contract_point_list: targetContractPointList
            }
          }
          return nomination_row_json
        })

        nomination_version.nomination_row_json = nominationRowJsonWithContractPointList
        return nomination_version
      })

      let latestSubmittedTimestamp: Date | undefined = e && e?.submitted_timestamp || undefined
      try {
        e.nomination_version
        if (e?.nomination_version && e.nomination_version.length > 0 && e.nomination_version[0]?.create_date) {
          latestSubmittedTimestamp = e.nomination_version[0].create_date
        }
      } catch (error) {
        latestSubmittedTimestamp = e?.submitted_timestamp
      }

      e.nomination_version = nominationVersionWithContractPointList

      return {
        ...e,
        disabledFlag,
        latestSubmittedTimestamp
      }
    })

    return {
      data: nresData,
      total: count_
    }
  }

  typeOfContractTextToNum(typeOfContract: any) {
    const typeOfContractText = typeOfContract === 'LONG' ? 1 : typeOfContract === 'MEDIUM' ? 2 : typeOfContract === 'SHORT_FIRM' ? 3 : typeOfContract === 'SHORT_NON_FIRM' ? 4 : null
    return typeOfContractText
  }

  async status() {
    const resData = await this.prisma.query_shipper_nomination_status.findMany({
      orderBy: {
        id: 'asc'
      }
    })

    return resData
  }

  async comments(payload: any, userId: any) {
    const {reasons, comment, query_shipper_nomination_file_id} = payload
    const newDate = getTodayNowAdd7()
    const queryShipperNominationFile = await this.prisma.query_shipper_nomination_file.findFirst({
      where: {
        id: Number(query_shipper_nomination_file_id),
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
        nomination_version: {
          where: {
            flag_use: true
          },
          orderBy: {
            id: 'desc'
          }
        },
        query_shipper_nomination_file_url: {
          orderBy: {
            id: 'desc'
          }
        }
      }
    })

    const versionId = queryShipperNominationFile?.nomination_version[0]?.id
    const status = queryShipperNominationFile?.query_shipper_nomination_status_id

    const userType = await this.prisma.user_type.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      }
    })

    const create = await this.prisma.query_shipper_nomination_file_comment.create({
      data: {
        remark: comment,
        query_shipper_nomination_file: {
          connect: {
            id: queryShipperNominationFile?.id
          }
        },
        query_shipper_nomination_type_comment: {
          connect: {
            id: !!reasons ? 3 : userType?.id === 3 ? 1 : 2
          }
        },
        query_shipper_nomination_status: {
          connect: {
            id: status
          }
        },
        nomination_version: {
          connect: {
            id: versionId
          }
        },
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    await this.prisma.query_shipper_nomination_file_url.updateMany({
      where: {
        id: queryShipperNominationFile?.query_shipper_nomination_file_url[0]?.id ?? -1
      },
      data: {
        query_shipper_nomination_status_id: Number(status)
      }
    })

    return create
  }

  ckDateInfoNomDailyAndWeeklyNew(nowAts: any, startDateExConv: any, nominationDeadlineSubmission: any, nominationDeadlineReceptionOfRenomination: any, type: any) {
    // READ THIS BRO
    // ความหมายของ Deadline แต่ละตัว
    // 1. Submission > Before Gas Day 2 เวลา 10:00 หมายถึงว่า ในไฟล์ระบุ Gas Day เป็น 05/11/2026 เพราะฉะนั้น deadline ที่สามารถจะเอาไฟล์ Nom นี้เข้าระบบได้ คือวันที่ 03/11/2026 ภายในเวลา 10.00 (เมื่อ Upload เข้าไปแล้วที่ Column Renomination จะเป็น NO)
    // 2. Reception of renomination > Before Gas Day 2 เวลา 23:00 หมายถึงว่า ในไฟล์ระบุ Gas Day เป็น 05/11/2026 เพราะฉะนั้น deadline ที่สามารถจะเอาไฟล์ Nom นี้เข้าระบบได้ คือวันที่ 03/11/2026 ภายในเวลา 23.00 (Column Renomination เป็น YES) ถ้าพ้นวันที่และเวลาของตัวนี้ไปแล้ว จะไม่สามารถเอาไฟล์ Nom เข้าระบบได้อีกเลย

    // error: 'Start Date is over submission deadline.', // https://app.clickup.com/t/86etzcgxn
    const allowedDate = nowAts
      // .add(nominationDeadlineSubmission?.before_gas_day, 'day') // เดิมโรงงาน
      .subtract(nominationDeadlineSubmission?.before_gas_day, 'day')
      .set('hour', nominationDeadlineSubmission?.hour)
      .set('minute', nominationDeadlineSubmission?.minute)
      .startOf('minute')

    // เขียนฟังก์ชั่นเช็คเวลา nominationDeadlineSubmission ว่า
    /**
     * คำนวณ upload ได้ไม่ได้
     * - today < baseDate => false
     * - today > baseDate => true
     * - today == baseDate => now > deadlineTime ? true : false
     */
    // --------- kom ---------
    // CASE ไม่มีทั้งคู่
    if (!nominationDeadlineSubmission && !nominationDeadlineReceptionOfRenomination) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Start Date is over submission deadline.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const gd = (dayjs.isDayjs(startDateExConv) ? startDateExConv : dayjs(startDateExConv)).add(7, 'hour')
    // วันเดดไลน์ = gas_day - before_gas_day (เวลา 00:00)
    const deadline_submission = gd.subtract(nominationDeadlineSubmission?.before_gas_day ?? 0, 'day').startOf('day')

    const todayDate = dayjs().startOf('day')

    // CASE - ไม่ถึงวัน submission deadline
    if (todayDate.isBefore(deadline_submission)) {
      // ยังไม่ถึงวัน deadline_submission → อนุญาต
      return false
    }
    // ถ้าปัจจุบันตรงกับ submission เดดไลน์ เช็คเวลา
    if (todayDate.isSame(deadline_submission)) {
      const deadlineTime = deadline_submission
        .hour(nominationDeadlineSubmission?.hour ?? 0)
        .minute(nominationDeadlineSubmission?.minute ?? 0)
        .second(0)
        .millisecond(0)

      // เลยเวลาเดดไลน์แล้วหรือยัง
      const is_it_in_time_deadline = dayjs().isAfter(deadlineTime) // เลยเวลามาหรือยัง
      if (!is_it_in_time_deadline) {
        // ยังไม่เลย ผ่านได้
        return false
      } else {
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: 'Start Date is over submission deadline.',
        //   },
        //   HttpStatus.BAD_REQUEST,
        // );

        // CASE เลยวัน deadline ไปแล้ว → ให้เช็ค renom นะวัยรุ่น
        if (!nominationDeadlineReceptionOfRenomination) {
          // CASE - ไม่มี renom
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Start Date is over submission deadline.'
            },
            HttpStatus.BAD_REQUEST
          )
        } else {
          // CASE - มี renom
          const renom_deadline_submission = gd.subtract(nominationDeadlineReceptionOfRenomination?.before_gas_day ?? 0, 'day').startOf('day')

          if (todayDate.isBefore(renom_deadline_submission)) {
            // ยังไม่ถึงวัน renom deadline → อนุญาต
            return true
          }

          // CASE - เช็คเวลา renom deadline
          const renomDeadlineTime = renom_deadline_submission
            .hour(nominationDeadlineReceptionOfRenomination?.hour ?? 0)
            .minute(nominationDeadlineReceptionOfRenomination?.minute ?? 0)
            .second(0)
            .millisecond(0)

          const is_it_in_time_renom_deadline = dayjs().isAfter(renomDeadlineTime) // เลยเวลามาหรือยัง
          if (!is_it_in_time_renom_deadline) {
            // CASE - ยังไม่เลยเวลา renom deadline ผ่านได้
            return true
          } else {
            // CASE - เลยเวลา renom deadline
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: 'Start Date is over Reception of renomination deadline.'
              },
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }
    } else {
      // CASE เลยวัน deadline ไปแล้ว → ให้เช็ค renom นะวัยรุ่น
      if (!nominationDeadlineReceptionOfRenomination) {
        // CASE - ไม่มี renom
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Start Date is over submission deadline.'
          },
          HttpStatus.BAD_REQUEST
        )
      } else {
        // CASE - มี renom
        const renom_deadline_submission = gd.subtract(nominationDeadlineReceptionOfRenomination?.before_gas_day ?? 0, 'day').startOf('day')

        if (todayDate.isBefore(renom_deadline_submission)) {
          // ยังไม่ถึงวัน renom deadline → อนุญาต
          return true
        }

        // CASE - เช็คเวลา renom deadline
        const renomDeadlineTime = renom_deadline_submission
          .hour(nominationDeadlineReceptionOfRenomination?.hour ?? 0)
          .minute(nominationDeadlineReceptionOfRenomination?.minute ?? 0)
          .second(0)
          .millisecond(0)

        const is_it_in_time_renom_deadline = dayjs().isAfter(renomDeadlineTime) // เลยเวลามาหรือยัง
        if (!is_it_in_time_renom_deadline) {
          // CASE - ยังไม่เลยเวลา renom deadline ผ่านได้
          return true
        } else {
          // CASE - เลยเวลา renom deadline
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: 'Start Date is over Reception of renomination deadline.'
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }
  }

  formatNumberThreeDecimal(number: any) {
    // คืนค่าตามเดิมถ้าไม่ใช่ตัวเลข ไม่ปัดเศษ
    const n = Number(number)
    if (!Number.isFinite(n)) return number

    const sign = n < 0 ? '-' : ''
    const abs = Math.abs(n)

    // ตัดทศนิยมให้เหลือ 3 ตำแหน่ง (ไม่ปัด)
    const truncated = Math.floor(abs * 1000) / 1000

    // แยกส่วนจำนวนเต็ม/ทศนิยมแล้วจัดรูปแบบ
    const [i, d = ''] = truncated.toString().split('.')
    const intWithComma = i?.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const dec = d.padEnd(3, '0') // ให้ครบ 3 หลักเสมอ

    return `${sign}${intWithComma}.${dec}`
  }

  findExactMatchingKeyDDMMYYYY(startDateExConv: any, headerEntry: any): string | null {
    const targetDate = startDateExConv.format('DD/MM/YYYY') // Format target date consistently

    // Search through all header entries for exact date match
    for (const date in headerEntry) {
      if (date === targetDate) {
        return headerEntry[date].key // Return key if exact date match
      }
    }

    return null // No exact match found
  }

  findMatchingKeyMMYYYY(startDateExConv: any, headerEntry: any): string | null {
    const targetMonth = startDateExConv.month() // Target month (0 = January)
    const targetYear = startDateExConv.year() // Target year

    // Search through all header entries for month/year match
    for (const date in headerEntry) {
      const currentDate = dayjs(date, 'DD/MM/YYYY')
      const currentMonth = currentDate.month()
      const currentYear = currentDate.year()

      if (currentMonth === targetMonth && currentYear === targetYear) {
        return headerEntry[date].key // Return key if month/year match
      }
    }

    return null // No match found
  }

  async editRowJSON(id: any, payload: any, userId: any) {
    await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.nomination_version','id'),
          COALESCE((SELECT MAX(id) FROM public.nomination_version), 0),
          true
        )
      `)
    await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.submission_comment_query_shipper_nomination_file','id'),
          COALESCE((SELECT MAX(id) FROM public.submission_comment_query_shipper_nomination_file), 0),
          true
        )
      `)
    await this.prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('public.nomination_full_json','id'),
        COALESCE((SELECT MAX(id) FROM public.nomination_full_json), 0),
        true
      )
    `)
    await this.prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('public.nomination_full_json_sheet2','id'),
        COALESCE((SELECT MAX(id) FROM public.nomination_full_json_sheet2), 0),
        true
      )
    `)
    await this.prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('public.nomination_row_json','id'),
        COALESCE((SELECT MAX(id) FROM public.nomination_row_json), 0),
        true
      )
    `)

    const {rowChange} = payload
    const newDate = getTodayNowAdd7()
    const idN = Number(id)
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const nowAts = getTodayNowAdd7()
    let warningAll: any = []
    let sheet1Quality: any = []
    let warningLogHr: any = []
    let warningLogHrTemp: any = []
    let warningLogDayWeek: any = []
    let warningLogDayWeekTemp: any = []
    let warningLogDay: any = []

    const zoneQualityMaster = await this.prisma.zone.findMany({
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
      },
      include: {
        zone_master_quality: true,
        contract_point: true
      }
    })

    const versionNom = await this.prisma.nomination_version.findFirst({
      where: {
        id: idN
      },
      include: {
        nomination_full_json: true,
        nomination_full_json_sheet2: true,
        nomination_row_json: true,
        query_shipper_nomination_file: {
          include: {
            nomination_type: true
          }
        }
      }
    })

    const nominationPoint = await this.prisma.nomination_point.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: versionNom?.query_shipper_nomination_file?.gas_day // Point start date must be before or equal to file end date
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // If end_date is null (no end date)
              {
                end_date: {
                  gt: versionNom?.query_shipper_nomination_file?.gas_day
                }
              } // If end_date exists, must be after file start date
            ]
          }
        ]
      },
      orderBy: {
        end_date: 'desc'
      },
      include: {
        contract_point_list: {
          include: {
            area: true, // Include area information
            zone: true, // Include zone information
            entry_exit: true // Include entry/exit information
          }
        },
        area: true, // Include area information
        zone: true, // Include zone information
        entry_exit: true // Include entry/exit information
      }
    })

    const rowCk = await this.prisma.nomination_row_json.findMany({
      where: {
        id: {
          in: rowChange?.map((e_: any) => e_?.id)
        }
      }
    })
    const preWarningNomType_ = rowCk?.filter((f: any) => f?.query_shipper_nomination_type_id === 1)
    const preWarningNomType = preWarningNomType_?.map((e: any) => {
      const {data_temp, ...nE} = e
      const find = rowChange?.find((f: any) => f?.id === e?.id)
      return {
        ...nE,
        data_temp: find?.data_temp || data_temp
      }
    })
    // const preWarningConceptType = rowCk?.filter((f:any) => f?.query_shipper_nomination_type_id === 1)
    // query_shipper_nomination_type_id 1 nom
    // query_shipper_nomination_type_id 2 concept

    // ...warningLogHr,
    // ...warningLogDayWeek,
    // ...warningLogDay,

    // warning WI[11] HV[12]
    for (let i = 0; i < preWarningNomType.length; i++) {
      const data_temp = JSON.parse(preWarningNomType?.[i]?.data_temp)

      

      // 9 = 'MMSCFD'
      // 10 ='Entry'
      if (data_temp?.[10]?.toUpperCase() === 'ENTRY' && data_temp?.[9]?.toUpperCase() === 'MMSCFD') {
        // entry
        const findZone = zoneQualityMaster.find((f: any) => {
          // return f?.name === data_temp?.[0] && f?.entry_exit_id === 1
          return f?.name === data_temp?.[0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
        })
        const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min;
        const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max;
        const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min;
        const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max;
        // WI
        if ((parseToNumber(data_temp?.[11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(data_temp?.[11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
          const val_ = parseToNumber(data_temp?.[11])
          const validNumbers = Number.isFinite(val_)
          // console.log('data_temp?.[3] : ', data_temp?.[3]);
          // console.log('parseToNumber(data_temp?.[11]) : ', parseToNumber(data_temp?.[11]));
          // console.log('parseToNumber(v2_wobbe_index_min) : ', parseToNumber(v2_wobbe_index_min));
          // console.log('- - - - : ', validNumbers);
          if (validNumbers) {
            sheet1Quality.push(
              `For nomination point ${data_temp?.[3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(data_temp?.[11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
            )
          }
        }
        // HV
        if ((parseToNumber(data_temp?.[12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(data_temp?.[12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
          const val_ = parseToNumber(data_temp?.[12])
          const validNumbers = Number.isFinite(val_)
          if (validNumbers) {
            sheet1Quality.push(
              `For nomination point ${data_temp?.[3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(data_temp?.[12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
            )
          }
        }
      } else {
        // // exit
        // no
      }
    }

    const contractCode = await this.prisma.contract_code.findFirst({
      where: {
        id: versionNom?.query_shipper_nomination_file?.contract_code_id
      },
      include: {
        group: true,
        booking_version: {
          include: {
            booking_full_json_release: true,
            booking_row_json_release: true,
            booking_full_json: true,
            booking_row_json: true
          },
          take: 1,
          orderBy: {
            id: 'desc'
          }
        }
      }
    })

    const bookingFullJson = JSON.parse(contractCode?.booking_version[0]?.booking_full_json_release[0]?.data_temp || contractCode?.booking_version[0]?.booking_full_json[0]?.data_temp)
    const headerEntryCDBMMBTUD = bookingFullJson?.headerEntry['Capacity Daily Booking (MMBTU/d)']
    delete headerEntryCDBMMBTUD['key']
    const headerEntryCDBMMscfd = bookingFullJson?.headerEntry['Capacity Daily Booking (MMscfd)']
    delete headerEntryCDBMMscfd['key']
    const headerExitCDBMMBTUD = bookingFullJson?.headerExit['Capacity Daily Booking (MMBTU/d)']
    delete headerExitCDBMMBTUD['key']
    const headerEntryCDBMMBTUH = bookingFullJson?.headerEntry['Maximum Hour Booking (MMBTU/h)']
    delete headerEntryCDBMMBTUH['key']
    const headerEntryCDBMMscfh = bookingFullJson?.headerEntry['Maximum Hour Booking (MMscfh)']
    delete headerEntryCDBMMscfh['key']
    const headerExitCDBMMBTUH = bookingFullJson?.headerExit['Maximum Hour Booking (MMBTU/h)']
    delete headerExitCDBMMBTUH['key']

    const entryValue = bookingFullJson?.entryValue
    const exitValue = bookingFullJson?.exitValue

    // warning Nom Capacity
    if (versionNom?.query_shipper_nomination_file?.nomination_type_id === 1) {
      // daily
      let resultEntryExitUse: any = null
      let resultEntryExitUseMMscfh: any = null
      let resultEntryExitUsePerDay: any = null
      let resultEntryExitUseMMscfd: any = null
      if (contractCode?.term_type_id === 4) {
        resultEntryExitUse = this.findExactMatchingKeyDDMMYYYY(dayjs(versionNom?.query_shipper_nomination_file?.gas_day), headerEntryCDBMMBTUH)
        resultEntryExitUseMMscfh = this.findExactMatchingKeyDDMMYYYY(dayjs(versionNom?.query_shipper_nomination_file?.gas_day), headerEntryCDBMMscfh)
        resultEntryExitUsePerDay = this.findExactMatchingKeyDDMMYYYY(dayjs(versionNom?.query_shipper_nomination_file?.gas_day), headerEntryCDBMMBTUD)
        resultEntryExitUseMMscfd = this.findExactMatchingKeyDDMMYYYY(dayjs(versionNom?.query_shipper_nomination_file?.gas_day), headerEntryCDBMMscfd)
      } else {
        resultEntryExitUse = this.findMatchingKeyMMYYYY(dayjs(versionNom?.query_shipper_nomination_file?.gas_day), headerEntryCDBMMBTUH)
        resultEntryExitUseMMscfh = this.findMatchingKeyMMYYYY(dayjs(versionNom?.query_shipper_nomination_file?.gas_day), headerEntryCDBMMscfh)
        resultEntryExitUsePerDay = this.findMatchingKeyMMYYYY(dayjs(versionNom?.query_shipper_nomination_file?.gas_day), headerEntryCDBMMBTUD)
        resultEntryExitUseMMscfd = this.findMatchingKeyMMYYYY(dayjs(versionNom?.query_shipper_nomination_file?.gas_day), headerEntryCDBMMscfd)
      }

      for (let i = 0; i < preWarningNomType.length; i++) {
        const data_temp = JSON.parse(preWarningNomType?.[i]?.data_temp)

        if (data_temp?.[10]?.toUpperCase() === 'ENTRY' && data_temp?.[9]?.toUpperCase() === 'MMBTU/D') {
          let valueCapa = 0
          let valueCapaPerDay = 0

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === data_temp?.[3]
          })

          const find = (entryValue || []).find((f: any) => {
            return (
              f['0'] ===
              checkNominationPoint?.contract_point_list.find((cl: any) => {
                return cl?.contract_point === f['0']
              })?.contract_point
            )
          })
          valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null
          valueCapaPerDay = find[resultEntryExitUsePerDay] === '0' || !!find[resultEntryExitUsePerDay] ? find[resultEntryExitUsePerDay] : null
          const contract_point = checkNominationPoint?.contract_point_list.find((cl: any) => {
            return cl?.contract_point === find['0']
          })?.contract_point

          Array.from({length: 24}, (_, i) => i + 14).forEach((index) => {
            const finds = warningLogHrTemp?.find((f: any) => {
              return f?.nomination_point === data_temp?.[3] && f?.hr === index - 14 + 1 && f?.contractPoint === contract_point && isMatch(f?.unit, data_temp?.[9])
            })

            if (finds) {
              warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                let neHR = ehr
                if (neHR && finds?.hr === neHR?.hr && finds?.contractPoint === neHR?.contractPoint && finds?.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                  neHR.energy = +parseToNumber3Decimal(data_temp?.[index] ?? 0)
                }
                return {
                  ...neHR
                }
              })
            } else {
              warningLogHrTemp.push({
                ix: i,
                hr: index - 14 + 1,
                nomVal: parseToNumber(data_temp?.[index] ?? 0),
                gasDay: dayjs(versionNom?.query_shipper_nomination_file?.gas_day).format('DD/MM/YYYY'),
                contractPoint: contract_point,
                value: parseToNumber(valueCapa),
                valueDay: parseToNumber(valueCapaPerDay),
                energy: parseToNumber(data_temp?.[index] ?? 0),
                unit: data_temp?.[9]
              })
            }
            // if((parseToNumber3Decimal(data_temp?.[index]) ?? 0) > parseToNumber3Decimal(valueCapa)){
            //   warningLogHr.push(`Nominated max energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(data_temp?.[index]) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(valueCapa)) ?? ''} for contract point ${contract_point || '-'} and hour ${index - 14 + 1}`);
            // }
          })
        } else if (data_temp?.[10]?.toUpperCase() === 'ENTRY' && data_temp?.[9]?.toUpperCase() === 'MMSCFD') {
          let valueCapa = 0
          let valueCapaPerDay = 0

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === data_temp?.[3]
          })

          const find = (entryValue || []).find((f: any) => {
            return (
              f['0'] ===
              checkNominationPoint?.contract_point_list.find((cl: any) => {
                return cl?.contract_point === f['0']
              })?.contract_point
            )
          })
          valueCapa = find[resultEntryExitUseMMscfh] === '0' || !!find[resultEntryExitUseMMscfh] ? find[resultEntryExitUseMMscfh] : null
          valueCapaPerDay = find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null
          const contract_point = checkNominationPoint?.contract_point_list.find((cl: any) => {
            return cl?.contract_point === find['0']
          })?.contract_point

          Array.from({length: 24}, (_, i) => i + 14).forEach((index) => {
            const finds = warningLogHrTemp?.find((f: any) => {
              return f?.nomination_point === data_temp?.[3] && f?.hr === index - 14 + 1 && f?.contractPoint === contract_point && isMatch(f?.unit, data_temp?.[9])
            })

            if (finds) {
              warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                let neHR = ehr
                if (neHR && finds?.hr === neHR?.hr && finds?.contractPoint === neHR?.contractPoint && finds?.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                  neHR.energy = +parseToNumber3Decimal(data_temp?.[index] ?? 0)
                }
                return {
                  ...neHR
                }
              })
            } else {
              warningLogHrTemp.push({
                ix: i,
                hr: index - 14 + 1,
                nomVal: parseToNumber(data_temp?.[index] ?? 0),
                gasDay: dayjs(versionNom?.query_shipper_nomination_file?.gas_day).format('DD/MM/YYYY'),
                contractPoint: contract_point,
                value: parseToNumber(valueCapa),
                valueDay: parseToNumber(valueCapaPerDay),
                energy: parseToNumber(data_temp?.[index] ?? 0),
                unit: data_temp?.[9]
              })
            }
            // if((parseToNumber3Decimal(data_temp?.[index]) ?? 0) > parseToNumber3Decimal(valueCapa)){
            //   warningLogHr.push(`Nominated max energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(data_temp?.[index]) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(valueCapa)) ?? ''} for contract point ${contract_point || '-'} and hour ${index - 14 + 1}`);
            // }
          })
        } else if (data_temp?.[10]?.toUpperCase() === 'EXIT' && data_temp?.[9]?.toUpperCase() === 'MMBTU/D') {
          let valueCapa = 0
          let valueCapaPerDay = 0

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === data_temp?.[3]
          })

          const find = (exitValue || []).find((f: any) => {
            return (
              f['0'] ===
              checkNominationPoint?.contract_point_list.find((cl: any) => {
                return cl?.contract_point === f['0']
              })?.contract_point
            )
          })
          valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null
          valueCapaPerDay = find[resultEntryExitUsePerDay] === '0' || !!find[resultEntryExitUsePerDay] ? find[resultEntryExitUsePerDay] : null
          const contract_point = checkNominationPoint?.contract_point_list.find((cl: any) => {
            return cl?.contract_point === find['0']
          })?.contract_point

          Array.from({length: 24}, (_, i) => i + 14).forEach((index) => {
            const finds = warningLogHrTemp?.find((f: any) => {
              return f?.nomination_point === data_temp?.[3] && f?.hr === index - 14 + 1 && f?.contractPoint === contract_point && isMatch(f?.unit, data_temp?.[9])
            })

            if (finds) {
              warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                let neHR = ehr
                if (neHR && finds?.hr === neHR?.hr && finds?.contractPoint === neHR?.contractPoint && finds?.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                  neHR.energy = +parseToNumber3Decimal(data_temp?.[index] ?? 0)
                }
                return {
                  ...neHR
                }
              })
            } else {
              warningLogHrTemp.push({
                ix: i,
                hr: index - 14 + 1,
                nomVal: parseToNumber(data_temp?.[index] ?? 0),
                gasDay: dayjs(versionNom?.query_shipper_nomination_file?.gas_day).format('DD/MM/YYYY'),
                contractPoint: contract_point,
                value: parseToNumber(valueCapa),
                valueDay: parseToNumber(valueCapaPerDay),
                energy: parseToNumber(data_temp?.[index] ?? 0),
                unit: data_temp?.[9]
              })
            }
            // if((parseToNumber3Decimal(data_temp?.[index]) ?? 0) > parseToNumber3Decimal(valueCapa)){
            //   warningLogHr.push(`Nominated max energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(data_temp?.[index]) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(valueCapa)) ?? ''} for contract point ${contract_point || '-'} and hour ${index - 14 + 1}`);
            // }
          })
        } else if (data_temp?.[10]?.toUpperCase() === 'EXIT' && data_temp?.[9]?.toUpperCase() === 'MMSCFD') {
          let valueCapa = 0
          let valueCapaPerDay = 0

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === data_temp?.[3]
          })

          const find = (exitValue || []).find((f: any) => {
            return (
              f['0'] ===
              checkNominationPoint?.contract_point_list.find((cl: any) => {
                return cl?.contract_point === f['0']
              })?.contract_point
            )
          })
          valueCapa = find[resultEntryExitUseMMscfh] === '0' || !!find[resultEntryExitUseMMscfh] ? find[resultEntryExitUseMMscfh] : null
          valueCapaPerDay = find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null
          const contract_point = checkNominationPoint?.contract_point_list.find((cl: any) => {
            return cl?.contract_point === find['0']
          })?.contract_point
          Array.from({length: 24}, (_, i) => i + 14).forEach((index) => {
            const finds = warningLogHrTemp?.find((f: any) => {
              return f?.nomination_point === data_temp?.[3] && f?.hr === index - 14 + 1 && f?.contractPoint === contract_point && isMatch(f?.unit, data_temp?.[9])
            })

            if (finds) {
              warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
                let neHR = ehr
                if (neHR && finds?.hr === neHR?.hr && finds?.contractPoint === neHR?.contractPoint && finds?.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                  neHR.energy = +parseToNumber3Decimal(data_temp?.[index] ?? 0)
                }
                return {
                  ...neHR
                }
              })
            } else {
              warningLogHrTemp.push({
                ix: i,
                hr: index - 14 + 1,
                nomVal: parseToNumber(data_temp?.[index] ?? 0),
                gasDay: dayjs(versionNom?.query_shipper_nomination_file?.gas_day).format('DD/MM/YYYY'),
                contractPoint: contract_point,
                value: parseToNumber(valueCapa),
                valueDay: parseToNumber(valueCapaPerDay),
                energy: parseToNumber(data_temp?.[index] ?? 0),
                unit: data_temp?.[9]
              })
            }
         
          })
        }
      }
    
    } else {
      // weekly

      // warningLogDayWeek.push(`Nominated Total volume ${(this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for contract point ${groupedBywarningLogHrWeeklyTemp[ig]?.contractPoint} and gas day ${groupedBywarningLogHrWeeklyTemp[ig]?.headDayUse}`);
      // warningLogDay.push(`Nominated Total energy ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for contract point ${groupedBywarningLogTotalTemp[ig]?.contractPoint} and gas day ${startDateEx}`);
      const headDay = dayjs(versionNom?.query_shipper_nomination_file?.gas_day).format('DD/MM/YYYY')
      for (let i = 0; i < preWarningNomType.length; i++) {
        const data_temp = JSON.parse(preWarningNomType?.[i]?.data_temp)
        if (data_temp?.[10]?.toUpperCase() === 'ENTRY' && data_temp?.[9]?.toUpperCase() === 'MMBTU/D') {
          let valueCapa = 0

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === data_temp?.[3]
          })

          const find = (entryValue || []).find((f: any) => {
            return (
              f['0'] ===
              checkNominationPoint?.contract_point_list.find((cl: any) => {
                return cl?.contract_point === f['0']
              })?.contract_point
            )
          })

          Array.from({length: 7}, (_, i) => i + 14).forEach((index) => {
            const contract_point = checkNominationPoint?.contract_point_list.find((cl: any) => {
              return cl?.contract_point === find['0']
            })?.contract_point
            let currentCapacity = (data_temp?.[index] === '0' || !!data_temp?.[index]) ? Number(data_temp?.[index]?.trim()?.replace(/,/g, '')) : null
            const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDay).add(index - 14, 'day')
            let resultEntryExitUse: any = null
            if (contractCode?.term_type_id === 4) {
              resultEntryExitUse = this.findExactMatchingKeyDDMMYYYY(headDayUseConv, headerEntryCDBMMBTUD)
            } else {
              resultEntryExitUse = this.findMatchingKeyMMYYYY(headDayUseConv, headerEntryCDBMMBTUD)
            }
            valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null

            const finds = warningLogDayWeekTemp?.find((f: any) => {
              return f?.nomination_point === data_temp?.[3] && f?.headDayUse === dayjs(headDayUseConv).format('DD/MM/YYYY') && f?.contractPoint === contract_point && isMatch(f?.unit, data_temp?.[9])
            })
            if (finds) {
              warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                let neD = ed
                if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                  neD.energy = +parseToNumber(currentCapacity)
                }
                return {
                  ...neD
                }
              })
            } else {
              warningLogDayWeekTemp.push({
                nomination_point: data_temp?.[3],
                headDayUse: dayjs(headDayUseConv).format('DD/MM/YYYY'),
                contractPoint: contract_point,
                value: parseToNumber(valueCapa),
                energy: currentCapacity,
                unit: data_temp?.[9]
              })
            }
          })
        } else if (data_temp?.[10]?.toUpperCase() === 'ENTRY' && data_temp?.[9]?.toUpperCase() === 'MMSCFD') {
          let valueCapa = 0

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === data_temp?.[3]
          })

          const find = (entryValue || []).find((f: any) => {
            return (
              f['0'] ===
              checkNominationPoint?.contract_point_list.find((cl: any) => {
                return cl?.contract_point === f['0']
              })?.contract_point
            )
          })

          Array.from({length: 7}, (_, i) => i + 14).forEach((index) => {
            const contract_point = checkNominationPoint?.contract_point_list.find((cl: any) => {
              return cl?.contract_point === find['0']
            })?.contract_point
            let currentCapacity = (data_temp?.[index] === '0' || !!data_temp?.[index]) ? Number(data_temp?.[index]?.trim()?.replace(/,/g, '')) : null
            const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDay).add(index - 14, 'day')
            let resultEntryExitUseMMscfd: any = null
            if (contractCode?.term_type_id === 4) {
              resultEntryExitUseMMscfd = this.findExactMatchingKeyDDMMYYYY(headDayUseConv, headerEntryCDBMMscfd)
            } else {
              resultEntryExitUseMMscfd = this.findMatchingKeyMMYYYY(headDayUseConv, headerEntryCDBMMscfd)
            }
            valueCapa = find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null

            const finds = warningLogDayWeekTemp?.find((f: any) => {
              return f?.nomination_point === data_temp?.[3] && f?.headDayUse === dayjs(headDayUseConv).format('DD/MM/YYYY') && f?.contractPoint === contract_point && isMatch(f?.unit, data_temp?.[9])
            })
            if (finds) {
              warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                let neD = ed
                if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                  neD.energy = +parseToNumber(currentCapacity)
                }
                return {
                  ...neD
                }
              })
            } else {
              warningLogDayWeekTemp.push({
                nomination_point: data_temp?.[3],
                headDayUse: dayjs(headDayUseConv).format('DD/MM/YYYY'),
                contractPoint: contract_point,
                value: parseToNumber(valueCapa),
                energy: currentCapacity,
                unit: data_temp?.[9]
              })
            }
          })
        } else if (data_temp?.[10]?.toUpperCase() === 'EXIT' && data_temp?.[9]?.toUpperCase() === 'MMBTU/D') {
          let valueCapa = 0

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === data_temp?.[3]
          })

          const find = (exitValue || []).find((f: any) => {
            return (
              f['0'] ===
              checkNominationPoint?.contract_point_list.find((cl: any) => {
                return cl?.contract_point === f['0']
              })?.contract_point
            )
          })

          Array.from({length: 7}, (_, i) => i + 14).forEach((index) => {
            const contract_point = checkNominationPoint?.contract_point_list.find((cl: any) => {
              return cl?.contract_point === find['0']
            })?.contract_point
            let currentCapacity = (data_temp?.[index] === '0' || !!data_temp?.[index]) ? Number(data_temp?.[index]?.trim()?.replace(/,/g, '')) : null
            const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDay).add(index - 14, 'day')
            let resultEntryExitUse: any = null
            if (contractCode?.term_type_id === 4) {
              resultEntryExitUse = this.findExactMatchingKeyDDMMYYYY(headDayUseConv, headerEntryCDBMMBTUD)
            } else {
              resultEntryExitUse = this.findMatchingKeyMMYYYY(headDayUseConv, headerEntryCDBMMBTUD)
            }
            valueCapa = find[resultEntryExitUse] === '0' || !!find[resultEntryExitUse] ? find[resultEntryExitUse] : null

            const finds = warningLogDayWeekTemp?.find((f: any) => {
              return f?.nomination_point === data_temp?.[3] && f?.headDayUse === dayjs(headDayUseConv).format('DD/MM/YYYY') && f?.contractPoint === contract_point && isMatch(f?.unit, data_temp?.[9])
            })
            if (finds) {
              warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                let neD = ed
                if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                  neD.energy = +parseToNumber(currentCapacity)
                }
                return {
                  ...neD
                }
              })
            } else {
              warningLogDayWeekTemp.push({
                nomination_point: data_temp?.[3],
                headDayUse: dayjs(headDayUseConv).format('DD/MM/YYYY'),
                contractPoint: contract_point,
                value: parseToNumber(valueCapa),
                energy: currentCapacity,
                unit: data_temp?.[9]
              })
            }
          })
        } else if (data_temp?.[10]?.toUpperCase() === 'EXIT' && data_temp?.[9]?.toUpperCase() === 'MMSCFD') {
          let valueCapa = 0

          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === data_temp?.[3]
          })

          const find = (exitValue || []).find((f: any) => {
            return (
              f['0'] ===
              checkNominationPoint?.contract_point_list.find((cl: any) => {
                return cl?.contract_point === f['0']
              })?.contract_point
            )
          })

          Array.from({length: 7}, (_, i) => i + 14).forEach((index) => {
            const contract_point = checkNominationPoint?.contract_point_list.find((cl: any) => {
              return cl?.contract_point === find['0']
            })?.contract_point
            let currentCapacity = (data_temp?.[index] === '0' || !!data_temp?.[index]) ? Number(data_temp?.[index]?.trim()?.replace(/,/g, '')) : null
            const headDayUseConv = getTodayNowDDMMYYYYDfaultAdd7(headDay).add(index - 14, 'day')
            let resultEntryExitUseMMscfd: any = null
            if (contractCode?.term_type_id === 4) {
              resultEntryExitUseMMscfd = this.findExactMatchingKeyDDMMYYYY(headDayUseConv, headerEntryCDBMMscfd)
            } else {
              resultEntryExitUseMMscfd = this.findMatchingKeyMMYYYY(headDayUseConv, headerEntryCDBMMscfd)
            }
            valueCapa = find[resultEntryExitUseMMscfd] === '0' || !!find[resultEntryExitUseMMscfd] ? find[resultEntryExitUseMMscfd] : null

            const finds = warningLogDayWeekTemp?.find((f: any) => {
              return f?.nomination_point === data_temp?.[3] && f?.headDayUse === dayjs(headDayUseConv).format('DD/MM/YYYY') && f?.contractPoint === contract_point && isMatch(f?.unit, data_temp?.[9])
            })
            if (finds) {
              warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
                let neD = ed
                if (finds && neD && finds?.headDayUse === neD?.headDayUse && finds?.contractPoint === neD?.contractPoint && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                  neD.energy = +parseToNumber(currentCapacity)
                }
                return {
                  ...neD
                }
              })
            } else {
              warningLogDayWeekTemp.push({
                nomination_point: data_temp?.[3],
                headDayUse: dayjs(headDayUseConv).format('DD/MM/YYYY'),
                contractPoint: contract_point,
                value: parseToNumber(valueCapa),
                energy: currentCapacity,
                unit: data_temp?.[9]
              })
            }
          })
        }
      }

    }

    const startDateEx = dayjs(versionNom?.query_shipper_nomination_file?.gas_day).format('DD/MM/YYYY')

    let groupedBywarningLogHrTemp: any = Object.values(
      warningLogHrTemp.reduce((acc, item) => {
        const key = item && `${item?.hr}|${item?.contractPoint}|${item?.value}|${item?.unit}` || ""
        if (!acc[key]) {
          acc[key] = {
            hr: item && item.hr || null,
            contractPoint: item && item.contractPoint || null,
            value: item.value,
            valueDay: item.valueDay,
            unit: item.unit,
            data: []
          }
        }
        acc[key].data.push(item)
        return acc
      }, {})
    )

    for (let ig = 0; ig < groupedBywarningLogHrTemp.length; ig++) {
      const energyValues = groupedBywarningLogHrTemp[ig]?.data?.reduce((accumulator, currentValue) => accumulator + currentValue?.energy || 0, 0)

      if (parseToNumber3Decimal(energyValues) > parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) {
        if (isMatch(groupedBywarningLogHrTemp[ig]?.unit, 'MMscfd')) {
          warningLogHr.push(
            `Nominated max volume ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) ?? ''} for contract point ${groupedBywarningLogHrTemp[ig]?.contractPoint || '-'} and hour ${groupedBywarningLogHrTemp[ig]?.hr || '-'}`
          )
        } else {
          warningLogHr.push(
            `Nominated max energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) ?? ''} for contract point ${groupedBywarningLogHrTemp[ig]?.contractPoint || '-'} and hour ${groupedBywarningLogHrTemp[ig]?.hr || '-'}`
          )
        }
      }
    }

    let groupedBywarningLogTotalTemp: any = Object.values(
      groupedBywarningLogHrTemp.reduce((acc, item) => {
        const key = `${item?.contractPoint}|${item?.value}|${item?.unit}`
        if (!acc[key]) {
          acc[key] = {
            contractPoint: item && item.contractPoint || null,
            value: item.value,
            valueDay: item.valueDay,
            unit: item.unit,
            data: []
          }
        }
        acc[key].data.push(item)
        return acc
      }, {})
    )

    for (let ig = 0; ig < groupedBywarningLogTotalTemp.length; ig++) {
      const energyValues = groupedBywarningLogTotalTemp[ig]?.data?.reduce((accumulator, currentValue) => accumulator + currentValue?.data?.reduce((accumulator, currentValue) => accumulator + currentValue?.energy || 0, 0) || 0, 0)
      if (parseToNumber3Decimal(energyValues) > parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay)) {
        if (isMatch(groupedBywarningLogTotalTemp[ig]?.unit, 'MMscfd')) {
          warningLogDay.push(
            `Nominated Total volume ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for contract point ${groupedBywarningLogTotalTemp[ig]?.contractPoint} and gas day ${startDateEx}`
          )
        } else {
          warningLogDay.push(
            `Nominated Total energy ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for contract point ${groupedBywarningLogTotalTemp[ig]?.contractPoint} and gas day ${startDateEx}`
          )
        }
      }
    }

    let groupedBywarningLogHrWeeklyTemp: any = Object.values(
      warningLogDayWeekTemp.reduce((acc, item) => {
        const key = `${item?.headDayUse}|${item?.contractPoint}|${item?.value}|${item?.unit}`
        if (!acc[key]) {
          acc[key] = {
            headDayUse: item.headDayUse,
            contractPoint: item && item.contractPoint || null,
            value: item.value,
            unit: item.unit,
            data: []
          }
        }
        acc[key].data.push(item)
        return acc
      }, {})
    )

    for (let ig = 0; ig < groupedBywarningLogHrWeeklyTemp.length; ig++) {
      const energyValues = groupedBywarningLogHrWeeklyTemp[ig]?.data?.reduce((accumulator, currentValue) => accumulator + currentValue?.energy || 0, 0)

      if (parseToNumber3Decimal(energyValues) > parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value)) {
        if (isMatch(groupedBywarningLogHrWeeklyTemp[ig]?.unit, 'MMscfd')) {
          warningLogDayWeek.push(
            `Nominated Total volume ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues)) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for contract point ${
              groupedBywarningLogHrWeeklyTemp[ig]?.contractPoint
            } and gas day ${groupedBywarningLogHrWeeklyTemp[ig]?.headDayUse}`
          )
        } else {
          warningLogDayWeek.push(
            `Nominated Total energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues)) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for contract point ${
              groupedBywarningLogHrWeeklyTemp[ig]?.contractPoint
            } and gas day ${groupedBywarningLogHrWeeklyTemp[ig]?.headDayUse}`
          )
        }
      }
    }

    warningAll = [...sheet1Quality, ...warningLogHr, ...warningLogDay, ...warningLogDayWeek]
    // console.log('warningAll : ', warningAll);
    // return

    const userType = await this.prisma.user_type.findFirst({
      where: {
        account_manage: {
          some: {
            account_id: Number(userId)
          }
        }
      }
    })

    const nominationDeadlineSubmission = await this.prisma.new_nomination_deadline.findFirst({
      where: {
        process_type_id: 1, // Process type: Submission
        user_type_id: userType?.id == 1 ? 2 : userType?.id, // User type specific deadline
        nomination_type_id: Number(versionNom?.query_shipper_nomination_file?.nomination_type_id), // Daily or Weekly nomination
        AND: [
          {
            start_date: {
              lte: todayEnd // Deadline start must be before or equal to today end
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // If end_date is null (no end date)
              {
                end_date: {
                  gte: todayStart
                }
              } // If end_date exists, must be after or equal to today start
            ]
          }
        ]
      }
    })

    const nominationDeadlineReceptionOfRenomination = await this.prisma.new_nomination_deadline.findFirst({
      where: {
        process_type_id: 3, // Process type: Reception of Renomination
        user_type_id: userType?.id == 1 ? 2 : userType?.id, // User type specific deadline
        nomination_type_id: Number(versionNom?.query_shipper_nomination_file?.nomination_type_id), // Daily or Weekly nomination
        AND: [
          {
            start_date: {
              lte: todayEnd // Deadline start must be before or equal to today end
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // If end_date is null (no end date)
              {
                end_date: {
                  gte: todayStart
                }
              } // If end_date exists, must be after or equal to today start
            ]
          }
        ]
      }
    })

    let renom = await this.ckDateInfoNomDailyAndWeeklyNew(
      getTodayNow(),
      // dayjs(versionNom?.query_shipper_nomination_file?.gas_day).format("DD/MM/YYYY"), // startDateExConv, //DD/MM/YYYY
      dayjs(versionNom?.query_shipper_nomination_file?.gas_day).toDate(), // startDateExConv, //DD/MM/YYYY
      nominationDeadlineSubmission,
      nominationDeadlineReceptionOfRenomination,
      Number(versionNom?.query_shipper_nomination_file?.nomination_type_id) //1,
    )
    // return renom

    const convertArrinObj = rowChange.map((e: any) => {
      return {
        ...e,
        data_temp: JSON.parse(e['data_temp'])
      }
    })

    let fullJsonOld = await versionNom?.nomination_full_json.map((e: any) => ({
      ...e,
      data_temp: JSON.parse(e['data_temp'])
    }))[0]

    fullJsonOld.data_temp.valueData = fullJsonOld.data_temp.valueData?.map((e: any, ix: any) => {
      const findIx = rowChange?.find((f: any) => {
        return f?.old_index === ix
      })
      if (findIx) {
        return JSON.parse(findIx?.data_temp)
      } else {
        return e
      }
    })

    Object.keys(fullJsonOld.data_temp.typeDoc || {}).forEach((key) => {
      fullJsonOld.data_temp.typeDoc[key] = fullJsonOld.data_temp.typeDoc[key]?.map((tD: any) => {
        const findTD = rowChange?.find((f: any) => {
          return f?.old_index === tD?.ix
        })
        if (findTD) {
          return {
            ...tD,
            row: JSON.parse(findTD?.data_temp)
          }
        } else {
          return tD
        }
      })
    })

    const rowJsonData = versionNom?.nomination_row_json?.map((e: any) => {
      const findIx = rowChange?.find((f: any) => {
        return f?.old_index === e?.old_index
      })
      if (findIx) {
        return {
          ...e,
          data_temp: findIx?.data_temp
        }
      } else {
        return e
      }
    })

    let resultData = {
      row: rowJsonData,
      fullId: fullJsonOld?.id,
      full: fullJsonOld && fullJsonOld.data_temp || null
    }

    // return resultData;

    const flaseVersion = await this.prisma.nomination_version.updateMany({
      where: {
        query_shipper_nomination_file_id: Number(versionNom?.query_shipper_nomination_file_id)
      },
      data: {
        flag_use: false
      }
    })

    const nominationVersionCount = await this.prisma.nomination_version.count({
      where: {
        query_shipper_nomination_file_id: versionNom?.query_shipper_nomination_file_id
      }
    })

    // version
    const nominationVersion = await this.prisma.nomination_version.create({
      data: {
        version: `V.${nominationVersionCount + 1}`,
        query_shipper_nomination_file: {
          connect: {
            id: versionNom?.query_shipper_nomination_file_id
          }
        },
        flag_use: true,
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    const nom = await this.prisma.query_shipper_nomination_file.update({
      where: {
        id: versionNom?.query_shipper_nomination_file_id
      },
      data: {
        query_shipper_nomination_status_id: 1,
        query_shipper_nomination_file_renom_id: renom ? 1 : 2
      }
    })

    // warning
    const submissionFile = await this.prisma.submission_comment_query_shipper_nomination_file.createMany({
      data: (warningAll || []).map((e: any) => {
        return {
          remark: e,
          query_shipper_nomination_file_id: Number(versionNom?.query_shipper_nomination_file_id),
          create_date_num: newDate.unix(),
          create_date: newDate.toDate(),
          create_by: Number(userId),

          nomination_version_id: nominationVersion?.id
        }
      })
    })

    // row
    for (let i = 0; i < resultData?.row.length; i++) {
      await this.prisma.nomination_row_json.update({
        where: {
          id: Number(resultData?.row[i]?.id ?? -1)
        },
        data: {
          data_temp: resultData?.row[i]['data_temp']
        }
      })
    }

    const fullNew = {
      ...resultData?.full,
      valueData: resultData?.row?.map((e: any) => JSON.parse(e?.data_temp))
    }
    console.log('fullNew : ', fullNew)
    console.log('resultData?.full : ', resultData?.full)

    // json full
    const fullJson = await this.prisma.nomination_full_json.create({
      data: {
        data_temp: JSON.stringify(fullNew),
        // data_temp: JSON.stringify(resultData?.full),
        nomination_version: {
          connect: {
            id: nominationVersion?.id
          }
        },
        flag_use: true,
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    // json full sheet2
    const fullJson2 = await this.prisma.nomination_full_json_sheet2.create({
      data: {
        data_temp: versionNom?.nomination_full_json_sheet2[0]?.data_temp,
        nomination_version: {
          connect: {
            id: nominationVersion?.id
          }
        },
        flag_use: true,
        create_date_num: newDate.unix(),
        create_date: newDate.toDate(),
        create_by_account: {
          connect: {
            id: Number(userId)
          }
        }
      }
    })

    console.log('resultData : ', resultData)

  

    // json row
    const rowJson = await this.prisma.nomination_row_json.createMany({
      data: (resultData?.row || []).map((e: any) => {
        let objDT = JSON.parse(e['data_temp'])
        const findRow = (versionNom?.nomination_row_json || []).find((f: any) => {
          return f?.id === e?.id
        })
        return {
          nomination_version_id: nominationVersion?.id,
          flag_use: true,
          zone_text: objDT[0],
          area_text: objDT[2],
          entry_exit_id: findRow?.entry_exit_id,
          query_shipper_nomination_type_id: findRow?.query_shipper_nomination_type_id,
          data_temp: e['data_temp'],
          old_index: e && e?.old_index || null,
          create_date_num: newDate.unix(),
          create_date: newDate.toDate(),
          create_by: Number(userId)
        }
      })
    })

    return resultData
  }

  async gKeyDataMMYYYY(gasDayMonth: any, data: any) {
    // ค้นหา key ที่มีเดือนและปีตรงกับ gasDayMonth
    const foundKey = Object.keys(data).find((dateStr) => {
      const monthYear = dayjs(dateStr, 'DD/MM/YYYY').format('MM YYYY') // แปลงเป็นรูปแบบเดียวกัน
      return monthYear === gasDayMonth
    })
    // ส่งค่ากลับเป็น key ถ้าพบ
    return foundKey ? data[foundKey].key : null
  }

  async gKeyDataDDMMYYYY(gasDayMonth: any, data: any) {
    // ค้นหา key ที่มีเดือนและปีตรงกับ gasDayMonth
    const foundKey = Object.keys(data).find((dateStr) => {
      const daymonthYear = dayjs(dateStr, 'DD/MM/YYYY').format('DDMMYYYY') // แปลงเป็นรูปแบบเดียวกัน
      return daymonthYear === gasDayMonth
    })
    // ส่งค่ากลับเป็น key ถ้าพบ
    return foundKey ? data[foundKey].key : null
  }

  transformData(data: any) {
    return data.reduce((acc, item) => {
      const key = Object.keys(item)[0] // ดึง key เช่น "0", "1", "2"
      acc[key] = item[key] // นำค่า object มาใส่ใน acc
      return acc
    }, {})
  }

  async versionValidate(payload: any, userId: any) {
    const {nomination_type_id, contract_code_id, nomination_version_id} = payload

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const bookingVersion = await this.prisma.booking_version.findFirst({
      where: {
        contract_code_id: contract_code_id,
        flag_use: true
      },
      include: {
        booking_row_json: true,
        booking_full_json: true,
        contract_code: {
          select: {
            term_type_id: true
          }
        }
      }
    })

    const nominationVersion = await this.prisma.nomination_version.findFirst({
      where: {
        id: Number(nomination_version_id),
        query_shipper_nomination_file: {
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
      },
      include: {
        nomination_row_json: true,
        nomination_full_json: true,
        query_shipper_nomination_file: true
      }
    })

    const gasDay = nominationVersion?.query_shipper_nomination_file?.gas_day

    const areaMaster = await this.prisma.area.findMany({
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
        zone: {
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
      },
      include: {
        zone: {
          include: {
            zone_master_quality: true
          }
        }
      }
    })

    const nomList = await this.prisma.nomination_point.findMany({
      where: {},
      include: {
        contract_point_list: true
      }
    })

    const bookingFull = JSON.parse(bookingVersion?.booking_full_json[0]?.data_temp)
    const typeTerm = bookingFull?.shipperInfo['1']?.['Type of Contract']
    const typeM = this.typeOfContractTextToNum(typeTerm) === 4 ? 2 : 1 // 1 month, 2 day
    const cMMBTUD = bookingFull?.headerEntry['Capacity Daily Booking (MMBTU/d)']
    delete cMMBTUD['key']
    const cMMSCFD = bookingFull?.headerEntry['Capacity Daily Booking (MMscfd)']
    delete cMMSCFD['key']
    const mMMBTUH = bookingFull?.headerEntry['Maximum Hour Booking (MMBTU/h)']
    delete mMMBTUH['key']
    const mMMSCFH = bookingFull?.headerEntry['Maximum Hour Booking (MMscfh)']
    delete mMMSCFH['key']
    const bookingRow = bookingVersion?.booking_row_json.map((e: any) => {
      e['data_temp'] = JSON.parse(e['data_temp'])
      return {...e}
    })

    const headData = nominationVersion && JSON.parse(nominationVersion.nomination_full_json[0]?.data_temp)?.headData || null
    const objArr = Object.keys(headData)

    const rowData = nominationVersion.nomination_row_json.map((e: any) => {
      let objTemp = JSON.parse(e['data_temp'])
      const objConvert = objArr.map((ob: any) => {
        return {
          [ob]: {
            header: headData[ob],
            value: objTemp[ob]
          }
        }
      })
      const newObj = this.transformData(objConvert)

      return {
        ...e,
        newObj
      }
    })

    // const gasDayMonth = "06 2025"
    const gasDayjs = dayjs(gasDay)
    const gasDayMonth = gasDayjs.format('MM YYYY')
    const gasDayMonthFull = dayjs(gasDay).format('DDMMYYYY')

    const nomRowData = await Promise.all(
      rowData.map(async (e: any) => {
        const zone = e['newObj'][0]?.value
        const area = e['newObj'][2]?.value
        const point = e['newObj'][3]?.value
        const unit = e['newObj'][9]?.value
        const entry_exit_id = e['newObj'][10]?.value === 'Entry' ? 1 : 2
        // entry_exit_id
        const contractPointList =
          nomList.find((f: any) => {
            return f?.nomination_point === point && f?.entry_exit_id === entry_exit_id && dayjs(f?.start_date).isSameOrBefore(gasDayjs, 'day') && (f?.end_date ? dayjs(f?.end_date).isAfter(gasDayjs, 'day') : true)
          })?.contract_point_list || [] // contract_point_list มีมากกว่า 1
        const rowBook =
          bookingRow.find((f: any) => {
            return f?.contract_point === contractPointList.find((ff: any) => ff?.contract_point === f?.contract_point)?.contract_point
          }) || null

        const findZoneMaster = areaMaster.find((f: any) => {
          // return f?.name === area && f?.zone?.name === zone;
          return f?.name === area && f?.zone?.name === zone && f?.entry_exit_id === entry_exit_id
        })
        const findZoneMasterExit = areaMaster.find((f: any) => {
          // return f?.name === area && f?.zone?.name === zone;
          return f?.zone?.name === zone && f?.entry_exit_id === 2
        })

        

        // WI
        e['newObj'][11].min = findZoneMasterExit?.zone?.zone_master_quality[0]?.v2_wobbe_index_min !== null ? findZoneMasterExit?.zone?.zone_master_quality[0]?.v2_wobbe_index_min : null
        e['newObj'][11].max = findZoneMasterExit?.zone?.zone_master_quality[0]?.v2_wobbe_index_max !== null ? findZoneMasterExit?.zone?.zone_master_quality[0]?.v2_wobbe_index_max : null

        // HV
        e['newObj'][12].min = findZoneMasterExit?.zone?.zone_master_quality[0]?.v2_sat_heating_value_min !== null ? findZoneMasterExit?.zone?.zone_master_quality[0]?.v2_sat_heating_value_min : null
        e['newObj'][12].max = findZoneMasterExit?.zone?.zone_master_quality[0]?.v2_sat_heating_value_max !== null ? findZoneMasterExit?.zone?.zone_master_quality[0]?.v2_sat_heating_value_max : null

        // SG ไม่มี

        let gKeyDataMMYYYYcMMBTUD = null
        let gKeyDataMMYYYYmMMBTUH = null
        let gKeyDataMMYYYYmMMSCFH = null
        let gKeyDataMMYYYYmMMSCFD = null
        if (bookingVersion?.contract_code?.term_type_id === 4) {
          // short term non-firm
          gKeyDataMMYYYYcMMBTUD = await this.gKeyDataDDMMYYYY(gasDayMonthFull, cMMBTUD)
          gKeyDataMMYYYYmMMBTUH = await this.gKeyDataDDMMYYYY(gasDayMonthFull, mMMBTUH)
          gKeyDataMMYYYYmMMSCFH = await this.gKeyDataDDMMYYYY(gasDayMonthFull, mMMSCFH)
          gKeyDataMMYYYYmMMSCFD = await this.gKeyDataDDMMYYYY(gasDayMonthFull, cMMSCFD)
        } else {
          gKeyDataMMYYYYcMMBTUD = await this.gKeyDataMMYYYY(gasDayMonth, cMMBTUD)
          gKeyDataMMYYYYmMMBTUH = await this.gKeyDataMMYYYY(gasDayMonth, mMMBTUH)
          gKeyDataMMYYYYmMMSCFH = await this.gKeyDataMMYYYY(gasDayMonth, mMMSCFH)
          gKeyDataMMYYYYmMMSCFD = await this.gKeyDataMMYYYY(gasDayMonth, cMMSCFD)
        }

        // nomination_type_id // 1 day, 2 week

        if (e['query_shipper_nomination_type_id'] === 1) {
          // เอาออกทีหลัง
          // columnPointId
          // MMSCFD
          // MMBTU/D
          // entry_exit_id
          if (e['entry_exit_id'] === 1) {
            if (nomination_type_id === 1) {
              // day
              if (unit === 'MMBTU/D') {
                const valueBook = (!!gKeyDataMMYYYYmMMBTUH && rowBook?.data_temp[gKeyDataMMYYYYmMMBTUH]) || null
                const valueBookDay = (!!gKeyDataMMYYYYcMMBTUD && rowBook?.data_temp[gKeyDataMMYYYYcMMBTUD]) || null
                for (let iNo = 14; iNo <= 38; iNo++) {
                  e['newObj'][iNo].valueBook = valueBook
                  e['newObj'][iNo].valueBookDay = valueBookDay
                }
              } else if (unit === 'MMSCFD') {
                const valueBook = (!!gKeyDataMMYYYYmMMSCFH && rowBook?.data_temp[gKeyDataMMYYYYmMMSCFH]) || null
                // const valueBookDay =
                //   (!!gKeyDataMMYYYYcMMBTUD &&
                //     rowBook?.data_temp[gKeyDataMMYYYYcMMBTUD]) ||
                //   null;
                const valueBookDay =
                  (!!gKeyDataMMYYYYmMMSCFD &&
                    //rowBook?.data_temp[gKeyDataMMYYYYcMMBTUD])
                    rowBook?.data_temp[gKeyDataMMYYYYmMMSCFD]) ||
                  //Zax
                  null
                for (let iNo = 14; iNo <= 38; iNo++) {
                  e['newObj'][iNo].valueBook = valueBook
                  e['newObj'][iNo].valueBookDay = valueBookDay
                }
              }
            } else {
              // week
              if (unit === 'MMBTU/D') {
                const valueBook = (!!gKeyDataMMYYYYcMMBTUD && rowBook?.data_temp[gKeyDataMMYYYYcMMBTUD]) || (rowBook?.data_temp[14] || null)
                console.log('rowBook?.data_temp : ', rowBook?.data_temp);
                console.log('gKeyDataMMYYYYcMMBTUD : ', gKeyDataMMYYYYcMMBTUD);
                console.log('valueBook : ', valueBook);
                console.log('- - - -');
                for (let iNo = 14; iNo < 21; iNo++) {
                  e['newObj'][iNo].valueBook = valueBook
                }
              } else if (unit === 'MMSCFD') {
                const valueBook = (!!gKeyDataMMYYYYmMMSCFD && rowBook?.data_temp[gKeyDataMMYYYYmMMSCFD]) || (rowBook?.data_temp[14] || null)
                console.log('valueBook : ', valueBook);

                for (let iNo = 14; iNo < 21; iNo++) {
                  e['newObj'][iNo].valueBook = valueBook
                }
              }
            }
          } else {
            if (nomination_type_id === 1) {
              // day
              if (unit === 'MMBTU/D') {
                const valueBook = (!!gKeyDataMMYYYYmMMBTUH && rowBook?.data_temp[gKeyDataMMYYYYmMMBTUH]) || null
                const valueBookDay = (!!gKeyDataMMYYYYcMMBTUD && rowBook?.data_temp[gKeyDataMMYYYYcMMBTUD]) || null
                for (let iNo = 14; iNo <= 38; iNo++) {
                  e['newObj'][iNo].valueBook = valueBook
                  e['newObj'][iNo].valueBookDay = valueBookDay
                }
              }
            } else {
              // week
              if (unit === 'MMBTU/D') {
                const valueBook = (!!gKeyDataMMYYYYcMMBTUD && rowBook?.data_temp[gKeyDataMMYYYYcMMBTUD]) || (rowBook?.data_temp[14] || null)
                for (let iNo = 14; iNo < 21; iNo++) {
                  e['newObj'][iNo].valueBook = valueBook
                }
              }
            }
          }
        } else if (e['query_shipper_nomination_type_id'] === 2) {
          // เอาออกทีหลัง
          // columnPointIdConcept
          // MMSCFD
          // MMBTU/D
        } else if (e['query_shipper_nomination_type_id'] === 3) {
          // เอาออกทีหลัง
          // columnType
          // MMSCFD
          // MMBTU/D
        } else if (e['query_shipper_nomination_type_id'] === 4) {
          // เอาออกทีหลัง
          // columnParkUnparkinstructedFlows
          // MMSCFD
          // MMBTU/D
        } else if (e['query_shipper_nomination_type_id'] === 5) {
          // เอาออกทีหลัง
          // columnWHV
          // MMSCFD
          // MMBTU/D
        }

        return {...e}
      })
    )

    return nomRowData
  }

  async autoGen(id: any, payload: any, userId: any) {}

  async updateStatus(payload: any, userId: any) {
    const {id, status, comment} = payload
    const nowAt = getTodayNowAdd7()

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const nominationDeadlineManage = await this.prisma.new_nomination_deadline.findMany({
      where: {
        // before_gas_day

        process_type_id: 2,
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

    const dwManage = await this.prisma.query_shipper_nomination_file?.findMany({
      where: {},
      include: {}
    })

    for (let i = 0; i < id.length; i++) {
      const findId = dwManage?.find((f: any) => {
        return f?.id === Number(id[i])
      })
      const deadlineManage = nominationDeadlineManage?.find((f: any) => {
        return f?.nomination_type_id === findId?.nomination_type_id
      })
      // const before_gas_day = deadlineManage?.before_gas_day && Number(deadlineManage?.before_gas_day) || 0
      // if(before_gas_day > 0){
      //   const target = dayjs(findId?.gas_day); // เป้าหมาย
      //   const isOneDayBefore = nowAt.isSame(target.subtract(before_gas_day, 'day'), 'day');
      //   if(!!isOneDayBefore){
      //     throw new HttpException(
      //       {
      //         status: HttpStatus.BAD_REQUEST,
      //         error: 'Gas Day Missing required fields Nomination Deadline',
      //       },
      //       HttpStatus.BAD_REQUEST,
      //     );
      //   }
      // }

      const queryNom = await this.prisma.query_shipper_nomination_file.update({
        where: {
          id: Number(id[i])
        },
        data: {
          query_shipper_nomination_status_id: Number(status)
        }
      })

      this.comments(
        {
          reasons: true, // ใส่ false ตลอด
          comment: comment,
          query_shipper_nomination_file_id: id[i]
        },
        userId
      )
    }

    return `Success.`
  }

  async shipperNominationReportOld(query?: {gasDay?: string; tab?: string}) {
    const targetDate = getTodayStartAdd7(query?.gasDay)
    const todayStart = getTodayStartAdd7(query?.gasDay).toDate()
    const todayEnd = getTodayEndAdd7(query?.gasDay).toDate()

    const previousSunday = targetDate.subtract(targetDate.day(), 'day').startOf('day')
    const nextSunday = previousSunday.add(1, 'day')

    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

    const contractCodeMasterDB = await this.prisma.contract_code.findMany({
      where: {
        OR: [
          {
            status_capacity_request_management: {
              id: {
                in: [2]
              }
            }
          },
          {
            AND: [
              {
                status_capacity_request_management: {
                  id: {
                    in: [5]
                  }
                }
              },
              {
                contract_start_date: {
                  lte: todayStart
                }
              },
              {
                terminate_date: {
                  gt: todayStart
                }
              }
            ]
          }
        ]
      },
      include: {
        booking_version: {
          include: {
            booking_full_json: true,
            booking_row_json: true,
            booking_full_json_release: true,
            booking_row_json_release: true
          },
          take: 1,
          where: {
            flag_use: true
          },
          orderBy: {
            id: 'desc'
          }
        }
      }
    })
    console.log('contractCodeMasterDB : ', contractCodeMasterDB);
    // 2027-CSF-N006

    // 2026-CSF-N233
    // 2026-CNF-N111
    // dataRow


    // booking_full_json_release
    // 153

    const areaMaster = await this.prisma.area.findMany({
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
      },
      select: {
        id: true,
        name: true,
        area_nominal_capacity: true,
        color: true,
        entry_exit_id: true,
        zone_id: true
      }
    })

    const zoneMaster = await this.prisma.zone.findMany({
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
      },
      select: {
        id: true,
        name: true,
        color: true,
        entry_exit_id: true
      }
    })

    const resData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
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
          },
          {
            query_shipper_nomination_status: {
              id: {
                in: [2, 5]
              }
            }
          },
          {
            OR: [
              {
                AND: [
                  {
                    nomination_type_id: 2
                  },
                  {
                    gas_day: {
                      gte: previousSunday.toDate(),
                      lt: nextSunday.toDate()
                    }
                  }
                ]
              },
              {
                AND: [
                  {
                    nomination_type_id: 1
                  },
                  {
                    gas_day: {
                      gte: todayStart,
                      lte: todayEnd
                    }
                  }
                ]
              }
            ]
          },
          {
            OR: [
              {
                contract_code: {
                  status_capacity_request_management_id: 2
                }
              },
              {
                contract_code: {
                  status_capacity_request_management_id: 5,
                  contract_start_date: {
                    lte: todayStart
                  },
                  terminate_date: {
                    gt: todayStart
                  }
                }
              }
            ]
          }
        ]
      },
      include: {
        reserve_balancing_gas_contract: {
          include: {
            reserve_balancing_gas_contract_comment: true,
            reserve_balancing_gas_contract_detail: {
              include: {
                nomination_point: {
                  include: {
                    area: true,
                    zone: true
                  }
                },
                area: true,
                zone: true
              }
            },
            reserve_balancing_gas_contract_files: true
          }
        },
        group: true,
        query_shipper_nomination_status: true,
        contract_code: true,
        // submission_comment_query_shipper_nomination_file: true,
        nomination_type: true,
        nomination_version: {
          include: {
            nomination_full_json: true,
            // nomination_full_json_sheet2: true,
            nomination_row_json: {
              include: {
                query_shipper_nomination_type: true
              },
              orderBy: {
                id: 'asc'
              }
            }
          },
          where: {
            flag_use: true
          }
        }
        // query_shipper_nomination_file_renom: true,
        // query_shipper_nomination_file_url: {
        //   include: {
        //     nomination_version: true,
        //     query_shipper_nomination_status: true,
        //     create_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //     update_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     id: 'desc',
        //   },
        // },
        // query_shipper_nomination_file_comment: {
        //   include: {
        //     query_shipper_nomination_type_comment: true,
        //     query_shipper_nomination_status: true,
        //     nomination_version: true,
        //     create_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //     update_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     id: 'desc',
        //   },
        // },
      },
      orderBy: {
        id: 'desc'
      }
    })
    // console.log('resData : ', resData);
    let nomList = resData
    if (query?.tab == '0') {
      // กรอง nomination แบบรายวันสำหรับวันที่กำลังประมวลผล
      const dailyNominationList = resData.filter((nominationFile) => nominationFile.nomination_type_id == 1)

      // กรอง nomination แบบรายสัปดาห์สำหรับสัปดาห์ที่กำลังประมวลผล
      // ข้ามถ้ามี daily nomination สำหรับ contract เดียวกันแล้ว (daily nomination มีลำดับความสำคัญสูงกว่า)
      const weeklyNominationList = resData.filter((nominationFile) => nominationFile.nomination_type_id == 2 && !dailyNominationList.some((daily) => daily.contract_code_id == nominationFile.contract_code_id))

      nomList = [...dailyNominationList, ...weeklyNominationList]
    }
    const contractCodeMaster = contractCodeMasterDB?.map((e: any) => {
      const {booking_version, ...nE} = e
      const d_booking_version = booking_version?.map((eBv: any) => {
        const {booking_full_json, booking_row_json, ...neBv} = eBv
        const d_booking_full_json = booking_full_json?.map((eFj: any) => {
          const {data_temp, ...neFj} = eFj
          return {
            ...neFj,
            data_temp: JSON.parse(data_temp)
          }
        })
        const d_booking_row_json = booking_row_json?.map((eFj: any) => {
          const {data_temp, ...neFj} = eFj
          return {
            ...neFj,
            data_temp: JSON.parse(data_temp)
          }
        })

        return {
          ...neBv,
          booking_full_json: d_booking_full_json,
          booking_row_json: d_booking_row_json
        }
      })

      return {
        ...nE,
        booking_version: d_booking_version
      }
    })
    console.log('contractCodeMaster : ', contractCodeMaster);
    console.log('[154] contractCodeMaster : ', contractCodeMaster?.filter((f:any) => f?.id === 154)); // 2026-CNF-N111
    console.log('[167] contractCodeMaster : ', contractCodeMaster?.filter((f:any) => f?.id === 167)); // 2026-CSF-N233

    const grouped = {}
    for (const curr of nomList) {
      if(!curr){
        continue;
      }
      const key = curr && `${curr.gas_day}|${curr.group?.name}|${curr?.nomination_type?.id}` || ""

      if (!grouped[key]) {
        grouped[key] = {
          gas_day: curr.gas_day,
          shipper_name: curr.group?.name,
          nomination_type: curr?.nomination_type,
          data: []
        }
      }

      grouped[key].data.push({
        ...curr
      })
    }

    const resultGroup: any = Object.values(grouped)

    const resultGroupType = resultGroup.map((e: any) => {
      e['data'] = e['data']?.map((eData: any) => {
        eData['nomination_version'] = eData['nomination_version']?.map((eDataNom: any) => {
          eDataNom['nomination_full_json'] = eDataNom['nomination_full_json']?.map((eDataNomJson: any) => {
            eDataNomJson['data_temp'] = JSON.parse(eDataNomJson['data_temp'])
            return {
              ...eDataNomJson
            }
          })
          eDataNom['nomination_row_json'] = eDataNom['nomination_row_json']?.map((eDataNomJson: any) => {
            eDataNomJson['data_temp'] = JSON.parse(eDataNomJson['data_temp'])
            return {
              ...eDataNomJson
            }
          })
          return {
            ...eDataNom
          }
        })
        return {
          ...eData
        }
      })

      const gas_day_text = dayjs(e['gas_day']).format('DD/MM/YYYY')
      const shipper_name = e['shipper_name']

      return {
        shipper_name,
        gas_day: gas_day_text,
        gas_day_text,
        dataDW: e['data'],
        nomination_type: e['nomination_type']
      }
    })
    console.log('resultGroupType : ', resultGroupType);
    console.time('resultGroupKeyAddArea')
    const resultGroupKeyAddArea = resultGroupType.map((e: any, ix: number) => {
      const {dataDW, ...eData} = e
      const nomination_type_id = eData?.nomination_type?.id
      const dwData = dataDW.flatMap((fM: any) => {
        const {nomination_version, ...dFm} = fM
        let d_nomination_version = nomination_version.flatMap((fnomination_version: any) => {
          const {nomination_row_json, nomination_full_json, ...dfnomination_version} = fnomination_version

          const row = nomination_row_json
            ?.filter((f: any) => f?.query_shipper_nomination_type_id === 1)
            .map((mFM: any) => {
              return {
                gas_day: e['gas_day'],
                nom: {
                  ...dFm
                },
                contract_code_id: dFm?.contract_code_id,
                version: {
                  ...dfnomination_version
                },
                headData: nomination_full_json[0]?.data_temp?.headData,
                entry_exit_text: mFM['data_temp']['10'],
                ...mFM
              }
            })

          const rowFilType = row?.filter((f: any) => {
            return f?.query_shipper_nomination_type_id === 1 || f?.query_shipper_nomination_type_id === 2
          })

          const rowFilType1MMBTUandMMSCFD = rowFilType

          return [...rowFilType1MMBTUandMMSCFD]
        })

        return [...d_nomination_version]
      })

      const dwDataConcept = dataDW.flatMap((fM: any) => {
        const {nomination_version, ...dFm} = fM
        let d_nomination_version = nomination_version.flatMap((fnomination_version: any) => {
          const {nomination_row_json, nomination_full_json, ...dfnomination_version} = fnomination_version
          const row = nomination_row_json
            .filter((f: any) => f?.query_shipper_nomination_type_id != 1)
            .map((mFM: any) => {
              return {
                nom: {
                  ...dFm
                },
                contract_code_id: dFm?.contract_code_id,
                version: {
                  ...dfnomination_version
                },
                headData: nomination_full_json[0]?.data_temp?.headData,
                entry_exit_text: mFM['data_temp']['10'],
                ...mFM
              }
            })

          const rowFilType = row?.filter((f: any) => {
            return f?.query_shipper_nomination_type_id != 1
          })

          const rowFilType1All = rowFilType

          return [...rowFilType1All]
        })

        return [...d_nomination_version]
      })

      const groupedDatas = {}
      for (const curr of dwData) {
        if(!curr){
          continue;
        }
        const key = `${curr.area_text}|${curr.zone_text}`

        if (!groupedDatas[key]) {
          groupedDatas[key] = {
            gas_day: curr.gas_day,
            area_text: curr.area_text,
            zone_text: curr.zone_text,
            data: [],
            contract_code_id_arr: []
          }
        }

        groupedDatas[key].data.push({
          ...curr
        })
        groupedDatas[key].contract_code_id_arr = curr && Array.from(new Set([...groupedDatas[key].contract_code_id_arr, curr?.contract_code_id])) || []
      }
      const resultGroupArea: any = Object.values(groupedDatas)
      const booking_version = resultGroupArea?.flatMap((cd: any) => {
        const contractCodeDataId = cd?.contract_code_id_arr?.map((cta: any) => {
          const findCt = contractCodeMaster?.find((f: any) => {
            return f?.id === cta
          })
          return findCt
        })
        const contractCodeDataIdFM = contractCodeDataId?.flatMap((cdFM: any) => {
          // booking_row_json_release
          // const bjr = cdFM?.['booking_version'][0]?.['booking_row_json']?.map((cdj: any) => ({
          const bjr = (cdFM?.['booking_version'][0]?.['booking_row_json_release']?.length ? cdFM?.['booking_version'][0]?.['booking_row_json_release'] : cdFM?.['booking_version'][0]?.['booking_row_json'])?.map((cdj: any) => ({
            ...cdj,
            area_text: cdj?.area_text,
            contract_code_id_arr: [cdFM?.id],
            data: [],
            gas_day: cd?.gas_day,
            zone_text: cdj?.zone_text
          }))
          return [...bjr]
        })
        return [...contractCodeDataIdFM]
      })
      let resultGroupAreaMatch = [...resultGroupArea]
      for (let iB = 0; iB < booking_version.length; iB++) {
        const findS = resultGroupAreaMatch?.find((f: any) => {
          return f?.area_text === booking_version[iB]?.area_text && f?.zone_text === booking_version[iB]?.zone_text
        })
        if (!!!findS) {
          resultGroupAreaMatch.push({
            ...booking_version[iB]
          })
        }
      }
      const resultGroupAreaExt = resultGroupAreaMatch?.map((rEx: any) => {
        const {data, ...nrEx} = rEx

        const azData = data?.map((az: any) => {
          const zoneObj = zoneMaster.find((f: any) => {
            return f?.name === az?.zone_text
          })
          const areaObj = areaMaster.find((f: any) => {
            return f?.name === az?.area_text
          })

          return {
            zoneObj,
            areaObj,
            ...az
          }
        })
        const nominaionPoint = azData?.filter((f: any) => {
          return f?.query_shipper_nomination_type_id === 1
        })
        const nomGroupedZone = {}
        for (const curr of nominaionPoint) {
          const key = `${curr.zone_text}`

          if (!nomGroupedZone[key]) {
            nomGroupedZone[key] = {
              zone_text: curr.zone_text,
              zone: []
            }
          }

          nomGroupedZone[key].zone.push({...curr})
        }
        const nominaionPointZone: any = Object.values(nomGroupedZone)
        const dwDataConceptZone = dwDataConcept?.filter((f: any) => {
          return f?.zone_text === rEx?.zone_text
        })

        const conceptPoint = dwDataConceptZone
        const conceptGroupedZone = {}
        for (const curr of conceptPoint) {
          const key = `${curr.zone_text}`

          if (!conceptGroupedZone[key]) {
            conceptGroupedZone[key] = {
              zone_text: curr.zone_text,
              zone: []
            }
          }

          conceptGroupedZone[key].zone.push({...curr})
        }
        const conceptPointZone: any = Object.values(conceptGroupedZone)
        const contractCodeData = nrEx?.contract_code_id_arr?.map((cta: any) => {
          const findCt = contractCodeMaster?.find((f: any) => {
            return f?.id === cta
          })
          return findCt
        })
        let capacityRightMMBTUDOnce = (area: any, date: any) => {
          const matchVersionCode = contractCodeData
            ?.flatMap((ccd: any) => {
              const ccdVersion = ccd?.booking_version?.map((ccdV: any) => {
                const dateOne = ccd?.term_type_id === 4 ? dayjs(date, 'DD/MM/YYYY').format('DD/MM/YYYY') : dayjs(date, 'DD/MM/YYYY').format('01/MM/YYYY')

                // Tab Weekly: ค่า Capacity Right (MMBTU/D) ต้องการปรับให้ดึงมาจากแถบ Summary Capacity Right ใน Capacity Management Detail - ไม่มีข้อ clickup
                const row_release_or_not_header = ccdV?.booking_full_json_release?.[0] ?? ccdV?.booking_full_json?.[0]
                const row_release_or_not_ = ccdV?.booking_row_json_release?.length ? ccdV.booking_row_json_release : (ccdV?.booking_row_json ?? [])
               
                const data_temp_r = typeof row_release_or_not_header?.data_temp === 'string' ? JSON.parse(row_release_or_not_header?.data_temp) : row_release_or_not_header?.data_temp
                const keyDate = data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key ? data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key : data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.key || null

                const fArea = row_release_or_not_?.filter((f: any) => {
                  return f?.area_text === area
                })
                let calcContract = 0
                if (!!keyDate) {
                  calcContract = fArea?.reduce((accumulator, currentValue) => {
                    const data_temp_ = typeof currentValue?.['data_temp'] === 'string' ? JSON.parse(currentValue?.['data_temp']) : currentValue?.['data_temp']
                    return accumulator + (parseToNumber(data_temp_?.[keyDate]) || 0)
                  }, 0)
                }
                return calcContract
              })

              return [...ccdVersion]
            })
            .reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue), 0)

          return matchVersionCode
        }

        const nomCalc = (nom: any, nomType: any) => {
          if (nomType === 1) {
            // daily
            let calcData = 0
            for (let iCal = 0; iCal < nom.length; iCal++) {
              for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
                // MMSCFD
                // MMBTU/D
                if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                  const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                  calcData = calcData + valueDT
                }
              }
            }
            return calcData
          } else {
            // weekly ทำที่ weeklyDay
            return 0
          }
        }

        let capacityRightMMBTUD = nomination_type_id === 1 && capacityRightMMBTUDOnce(nrEx?.area_text, nrEx?.gas_day)
        let nominatedValueMMBTUD = nomination_type_id === 1 && nomCalc(nominaionPointZone, nomination_type_id)
        let overusageMMBTUD = nomination_type_id === 1 && nomCalc(nominaionPointZone, nomination_type_id) - capacityRightMMBTUDOnce(nrEx?.area_text, nrEx?.gas_day) > 0 ? nomCalc(nominaionPointZone, nomination_type_id) - capacityRightMMBTUDOnce(nrEx?.area_text, nrEx?.gas_day) : 0

        const zoneObj = zoneMaster.find((f: any) => {
          return f?.name === nrEx?.zone_text
        })
        const areaObj = areaMaster.find((f: any) => {
          return f?.name === nrEx?.area_text
        })

        const startDate = dayjs(eData?.gas_day_text, 'DD/MM/YYYY')
        const weeklyDay: any = {}

        daysOfWeek.forEach((day, index) => {
          const nomCalcWeek = (gasDay: any, nom: any, nomType: any) => {
            if (nomType === 2) {
              let calcData = 0
              for (let iCal = 0; iCal < nom.length; iCal++) {
                for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
                  const foundEntry = Object.entries(nom[iCal]?.zone[iCalZone]?.headData || {}).find(([key, value]) => {
                    return value?.toString().trim() === gasDay.toString().trim()
                  })
                  const headDataDTKey = foundEntry ? foundEntry[0] : undefined
                  if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                    const valueDT = !!headDataDTKey ? Number(nom[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) : 0
                    calcData = calcData + valueDT
                  }
                }
              }

              return calcData
            }
          }
          const capacityRightMMBTUDWeek = capacityRightMMBTUDOnce(nrEx?.area_text, startDate.add(index, 'day').format('DD/MM/YYYY'))
          const nominatedValueMMBTUDWeek = nomCalcWeek(startDate.add(index, 'day').format('DD/MM/YYYY'), nominaionPointZone, nomination_type_id)
          const overusageMMBTUDWeek = nominatedValueMMBTUDWeek - capacityRightMMBTUDWeek > 0 ? nominatedValueMMBTUDWeek - capacityRightMMBTUDWeek : 0
          // 1227840.24
          console.log('_nominatedValueMMBTUDWeek : ', nominatedValueMMBTUDWeek); 
          weeklyDay[day] = {
            gas_day_text: startDate.add(index, 'day').format('DD/MM/YYYY'),
            capacityRightMMBTUD: capacityRightMMBTUDWeek,
            nominatedValueMMBTUD: nominatedValueMMBTUDWeek,
            overusageMMBTUD: overusageMMBTUDWeek
          }
        })

        const overusageMMBTUDDaily = overusageMMBTUD
        return {
          gas_day: eData?.gas_day_text,
          shipper_name: eData?.shipper_name,
          ...nrEx,
          zoneObj,
          areaObj,
          nominaionPointZone,
          conceptPointZone,
          capacityRightMMBTUD,
          nominatedValueMMBTUD,
          overusageMMBTUD: overusageMMBTUDDaily,
          weeklyDay
        }
      })
      console.log('..');

      const contractAll = [...new Set(resultGroupAreaExt?.map((rg: any) => rg?.contract_code_id_arr).flat())]
      const contractCodeData = contractAll?.map((cta: any) => {
        const findCt = contractCodeMaster?.find((f: any) => {
          return f?.id === cta
        })
        return findCt
      })
      // console.log('contractCodeData_ : ', contractCodeData);

      let capacityRightMMBTUD = (date: any, noms: any) => {
        const areaBJR = noms?.map((brj: any) => brj?.area_text)
        const matchVersionCode = contractCodeData
          ?.flatMap((ccd: any) => {
            const ccdVersion = ccd?.booking_version?.map((ccdV: any) => {
              const dateOne = ccd?.term_type_id === 4 ? dayjs(date, 'DD/MM/YYYY').format('DD/MM/YYYY') : dayjs(date, 'DD/MM/YYYY').format('01/MM/YYYY')

            
              // Tab Daily: ค่า Capacity Right (MMBTU/D) ต้องการปรับให้ดึงมาจากแถบ Summary Capacity Right ใน Capacity Management Detail - ไม่มีข้อ clickup
              const row_release_or_not_header = ccdV?.booking_full_json_release?.[0] ?? ccdV?.booking_full_json?.[0]
              const row_release_or_not_ = ccdV?.booking_row_json_release?.length ? ccdV.booking_row_json_release : (ccdV?.booking_row_json ?? [])
              const data_temp_r = typeof row_release_or_not_header?.data_temp === 'string' ? JSON.parse(row_release_or_not_header?.data_temp) : row_release_or_not_header?.data_temp
              const keyDate = data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key ? data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key : data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.key || null
              const brjExit = row_release_or_not_?.filter((f: any) => areaBJR.includes(f?.area_text))
            
              let calcContract = 0
              if (!!keyDate) {
                calcContract = brjExit.reduce((accumulator, currentValue) => {
                  const data_temp_ = typeof currentValue?.['data_temp'] === 'string' ? JSON.parse(currentValue?.['data_temp']) : currentValue?.['data_temp']
                  return accumulator + (parseToNumber(data_temp_?.[keyDate]) || 0)
                }, 0)
              }
              return calcContract
            })

            return [...ccdVersion]
          })
          .reduce((accumulator, currentValue) => accumulator + currentValue, 0)

        return matchVersionCode
      }

      const nomCalc = (noms: any, nomType: any) => {
        const nom = [...noms.map((eNo: any) => eNo?.nominaionPointZone)].flat()
        if (nomType === 1) {
          // daily
          let calcData = 0
          for (let iCal = 0; iCal < nom.length; iCal++) {
            for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
              if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                calcData = calcData + valueDT
              }
            }
          }
          return calcData
        } else {
          // weekly ทำที่ weeklyDay
          return 0
        }
      }
      const imbalanceMMBTUDCalc = (noms: any, nomType: any) => {
        const nom = [...noms.map((eNo: any) => eNo?.nominaionPointZone)].flat()
        const concept = [...noms.map((eNo: any) => eNo?.conceptPointZone)].flat()
        // nom?.nomination_type_id
        // Park
        // Unpark
        // Min_Inventory_Change
        // Shrinkage_Volume
        // entry - exit - Min_Inventory_Change - Park + Unpark - Shrinkage_Volume
        if (nomType === 1) {
          let calcData = 0
          let nomEntry = 0
          let nomExit = 0
          let Park = 0
          let Unpark = 0
          let MinInventoryChange = 0
          let ShrinkageVolume = 0
          for (let iCal = 0; iCal < nom.length; iCal++) {
            for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
              if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                if (nom[iCal]?.zone[iCalZone]?.entry_exit_text === 'Entry') {
                  const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                  nomEntry = nomEntry + valueDT
                } else {
                  const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                  nomExit = nomExit + valueDT
                }
              }
            }
          }

          for (let iCal = 0; iCal < concept.length; iCal++) {
            for (let iCalZone = 0; iCalZone < concept[iCal]?.zone.length; iCalZone++) {
              if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Park') {
                const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                Park = Park + valueDT
              } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Unpark') {
                const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                Unpark = Unpark + valueDT
              } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Min_Inventory_Change') {
                const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                MinInventoryChange = MinInventoryChange + valueDT
              } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Shrinkage_Volume') {
                const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                ShrinkageVolume = ShrinkageVolume + valueDT
              }
            }
          }

          calcData = nomEntry - nomExit

          return calcData
        } else {
          // weekly ทำที่ weeklyDay
          return 0
        }
      }

      const startDate = dayjs(eData?.gas_day_text, 'DD/MM/YYYY')
      // สร้าง object
      const weeklyDay: any = {}

      daysOfWeek.forEach((day, index) => {
        let capacityRightMMBTUDWeek = (date: any, noms: any) => {
          const areaBJR = noms?.map((brj: any) => brj?.area_text)
          const matchVersionCode = contractCodeData
            ?.flatMap((ccd: any) => {
              const ccdVersion = ccd?.booking_version?.map((ccdV: any) => {
                const dateOne = dayjs(date, 'DD/MM/YYYY').format('01/MM/YYYY')

                // Tab Daily: ค่า Capacity Right (MMBTU/D) ต้องการปรับให้ดึงมาจากแถบ Summary Capacity Right ใน Capacity Management Detail - ไม่มีข้อ clickup
                const row_release_or_not_header = ccdV?.booking_full_json_release?.[0] ?? ccdV?.booking_full_json?.[0]
                const row_release_or_not_ = ccdV?.booking_row_json_release?.length ? ccdV.booking_row_json_release : (ccdV?.booking_row_json ?? [])
                const data_temp_r = typeof row_release_or_not_header?.data_temp === 'string' ? JSON.parse(row_release_or_not_header?.data_temp) : row_release_or_not_header?.data_temp

                const keyDate = data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key ? data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key : data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.key || null
                const brjExit = row_release_or_not_?.filter((f: any) => areaBJR.includes(f?.area_text))

                let calcContract = 0
                if (!!keyDate) {
                  calcContract = brjExit.reduce((accumulator, currentValue) => {
                    const data_temp_ = typeof currentValue?.['data_temp'] === 'string' ? JSON.parse(currentValue?.['data_temp']) : currentValue?.['data_temp']
                    return accumulator + (parseToNumber(data_temp_?.[keyDate]) || 0)
                  }, 0)
                }
                return calcContract
              })

              return [...ccdVersion]
            })
            .reduce((accumulator, currentValue) => {
              return accumulator + currentValue
            }, 0)

          return matchVersionCode
        }

        // const nomCalcWeek = (gasDay: any, noms: any, nomType: any) => {
        //   if (nomType === 2) {
        //     const nom = [...noms.map((eNo: any) => eNo?.nominaionPointZone)].flat()
        //     let calcData = 0
        //     for (let iCal = 0; iCal < nom.length; iCal++) {
        //       for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
        //         const foundEntry = Object.entries(nom[iCal]?.zone[iCalZone]?.headData || {}).find(([key, value]) => {
        //           return value?.toString().trim() === gasDay.toString().trim()
        //         })
        //         const headDataDTKey = foundEntry ? foundEntry[0] : undefined
        //         if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
        //           const valueDT = !!headDataDTKey ? Number(nom[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) : 0
        //           calcData = calcData + valueDT
        //         }
        //       }
        //     }
        //     return calcData
        //   }
        // }
        const nomCalcWeek = (gasDay: any, noms: any, nomType: any) => {
          if (nomType === 2) {
            const nom = [
              ...noms.map((eNo: any) => eNo?.nominaionPointZone)
            ].flat()

            let calcData = 0
            let hasValue = false

            for (let iCal = 0; iCal < nom.length; iCal++) {
              for (
                let iCalZone = 0;
                iCalZone < (nom[iCal]?.zone?.length || 0);
                iCalZone++
              ) {
                const foundEntry = Object.entries(
                  nom[iCal]?.zone[iCalZone]?.headData || {}
                ).find(([key, value]) => {
                  return (
                    value?.toString().trim() ===
                    gasDay?.toString().trim()
                  )
                })

                const headDataDTKey = foundEntry
                  ? foundEntry[0]
                  : undefined

                if (
                  nom[iCal]?.zone[iCalZone]?.data_temp?.['9'] === 'MMBTU/D'
                ) {
                  if (headDataDTKey) {
                    const rawValue =
                      nom[iCal]?.zone[iCalZone]?.data_temp?.[headDataDTKey]

                    // ไม่มีค่า
                    if (
                      rawValue === null ||
                      rawValue === undefined ||
                      String(rawValue).trim() === ''
                    ) {
                      continue
                    }

                    // มีค่า รวมถึง 0 / "0" / "0.000"
                    const valueDT = Number(
                      String(rawValue).replace(/,/g, '')
                    )

                    if (!Number.isNaN(valueDT)) {
                      calcData += valueDT
                      hasValue = true
                    }
                  }
                }
              }
            }

            // ไม่มีค่าทุกตัว = null
            // มี 0 อย่างน้อย 1 ตัว = 0
            // มีค่าปกติ = ผลรวม
            return hasValue ? calcData : null
          }

          return null
        }

        const imbalanceMMBTUDCalcWeek = (gasDay: any, noms: any, nomType: any) => {
          const nom = [...noms.map((eNo: any) => eNo?.nominaionPointZone)].flat()
          const concept = [...noms.map((eNo: any) => eNo?.conceptPointZone)].flat()
          // nom?.nomination_type_id
          // Park
          // Unpark
          // Min_Inventory_Change
          // Shrinkage_Volume
          // entry - exit - Min_Inventory_Change - Park + Unpark - Shrinkage_Volume
          if (nomType === 2) {
            let calcData = 0
            let nomEntry = 0
            let nomExit = 0
            let Park = 0
            let Unpark = 0
            let MinInventoryChange = 0
            let ShrinkageVolume = 0
            for (let iCal = 0; iCal < nom.length; iCal++) {
              for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
                const foundEntry = Object.entries(nom[iCal]?.zone[iCalZone]?.headData || {}).find(([key, value]) => {
                  return value?.toString().trim() === gasDay.toString().trim()
                })
                const headDataDTKey = foundEntry ? foundEntry[0] : undefined
                if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                  if (nom[iCal]?.zone[iCalZone]?.entry_exit_text === 'Entry') {
                    const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                    nomEntry = nomEntry + valueDT
                  } else {
                    const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                    nomExit = nomExit + valueDT
                  }
                }
              }
            }

            for (let iCal = 0; iCal < concept.length; iCal++) {
              for (let iCalZone = 0; iCalZone < concept[iCal]?.zone.length; iCalZone++) {
                const foundEntry = Object.entries(nom[iCal]?.zone[iCalZone]?.headData || {}).find(([key, value]) => {
                  return value?.toString().trim() === gasDay.toString().trim()
                })
                const headDataDTKey = foundEntry ? foundEntry[0] : undefined

                if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Park') {
                  const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                  Park = Park + valueDT
                } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Unpark') {
                  const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                  Unpark = Unpark + valueDT
                } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Min_Inventory_Change') {
                  const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                  MinInventoryChange = MinInventoryChange + valueDT
                } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Shrinkage_Volume') {
                  const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                  ShrinkageVolume = ShrinkageVolume + valueDT
                }
              }
            }

            calcData = nomEntry - nomExit
            return calcData || 0
          } else {
            return 0
          }
        }

        const capacityRightMMBTUD = capacityRightMMBTUDWeek(startDate.add(index, 'day').format('DD/MM/YYYY'), resultGroupAreaExt)
        const imbalanceMMBTUD = imbalanceMMBTUDCalcWeek(startDate.add(index, 'day').format('DD/MM/YYYY'), resultGroupAreaExt, nomination_type_id)
        const nominatedValueMMBTUD = nomCalcWeek(startDate.add(index, 'day').format('DD/MM/YYYY'), resultGroupAreaExt, nomination_type_id)
        const overusageMMBTUDWeeklySum = resultGroupAreaExt.reduce((accumulator, currentValue) => accumulator + Number(currentValue?.weeklyDay[day]?.overusageMMBTUD || 0), 0)

        weeklyDay[day] = {
          gas_day_text: startDate.add(index, 'day').format('DD/MM/YYYY'),
          capacityRightMMBTUD: capacityRightMMBTUD,
          nominatedValueMMBTUD: nominatedValueMMBTUD,
          overusageMMBTUD: overusageMMBTUDWeeklySum,
          imbalanceMMBTUD: imbalanceMMBTUD
        }
      })
      // overusageMMBTUD
      const capacityRightMMBTUDDaily = capacityRightMMBTUD(eData?.gas_day_text, resultGroupAreaExt)
      const nominatedValueMMBTUDDaily = nomCalc(resultGroupAreaExt, nomination_type_id)
      const overusageMMBTUDDaily = resultGroupAreaExt.reduce((accumulator, currentValue) => accumulator + Number(currentValue?.overusageMMBTUD || 0), 0)

      const imbalanceMMBTUDDaily = imbalanceMMBTUDCalc(resultGroupAreaExt, nomination_type_id)
      return {
        id: ix + 1,
        dataRow: resultGroupAreaExt,
        ...eData,
        contractAll,
        capacityRightMMBTUD: capacityRightMMBTUDDaily,
        nominatedValueMMBTUD: nominatedValueMMBTUDDaily,
        overusageMMBTUD: overusageMMBTUDDaily,
        imbalanceMMBTUD: imbalanceMMBTUDDaily,
        weeklyDay
      }
    })
    console.timeEnd('resultGroupKeyAddArea')
    console.log('resultGroupKeyAddArea : ', resultGroupKeyAddArea);
    return resultGroupKeyAddArea
  }

  // roundTo3 = (value: any) => {
  //   const num = Number(value)
  //   if (Number.isNaN(num)) return 0
  //   return Math.round((num + Number.EPSILON) * 1000) / 1000
  // }

  // แก้ใหม่เป็น Capacity Right เอาทุก area ในค่า book มาแสดงโดยไม่สน Nom
  // capacityRightMMBTUD
  
  roundTo3(value: number) {
    const factor = 1000;
    const scaled = value * factor;

    return Math.round(
      scaled + Number.EPSILON * Math.abs(scaled)
    ) / factor;
  }
  
  async shipperNominationReport(query?: {gasDay?: string; tab?: string}) {
    const targetDate = getTodayStartAdd7(query?.gasDay)
    const todayStart = getTodayStartAdd7(query?.gasDay).toDate()
    const todayEnd = getTodayEndAdd7(query?.gasDay).toDate()

    const previousSunday = targetDate.subtract(targetDate.day(), 'day').startOf('day')
    const nextSunday = previousSunday.add(1, 'day')

    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

    const contractCodeMasterDB = await this.prisma.contract_code.findMany({
      where: {
        OR: [
          {
            status_capacity_request_management: {
              id: {
                in: [2]
              }
            }
          },
          {
            AND: [
              {
                status_capacity_request_management: {
                  id: {
                    in: [5]
                  }
                }
              },
              {
                contract_start_date: {
                  lte: todayStart
                }
              },
              {
                terminate_date: {
                  gt: todayStart
                }
              }
            ]
          }
        ]
      },
      include: {
        booking_version: {
          include: {
            booking_full_json: true,
            booking_row_json: true,
            booking_full_json_release: {
              where:{
                flag_use: true
              },
            },
            booking_row_json_release: {
              where:{
                flag_use: true
              },
            }
          },
          take: 1,
          where: {
            flag_use: true
          },
          orderBy: {
            id: 'desc'
          }
        }
      }
    })
    console.log('contractCodeMasterDB : ', contractCodeMasterDB);
    // 2027-CSF-N006

    // 2026-CSF-N233
    // 2026-CNF-N111
    // dataRow


    // booking_full_json_release
    // 153

    const areaMaster = await this.prisma.area.findMany({
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
      },
      select: {
        id: true,
        name: true,
        area_nominal_capacity: true,
        color: true,
        entry_exit_id: true,
        zone_id: true
      }
    })

    const zoneMaster = await this.prisma.zone.findMany({
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
      },
      select: {
        id: true,
        name: true,
        color: true,
        entry_exit_id: true
      }
    })

    const resData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
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
          },
          {
            query_shipper_nomination_status: {
              id: {
                in: [2, 5]
              }
            }
          },
          {
            OR: [
              {
                AND: [
                  {
                    nomination_type_id: 2
                  },
                  {
                    gas_day: {
                      gte: previousSunday.toDate(),
                      lt: nextSunday.toDate()
                    }
                  }
                ]
              },
              {
                AND: [
                  {
                    nomination_type_id: 1
                  },
                  {
                    gas_day: {
                      gte: todayStart,
                      lte: todayEnd
                    }
                  }
                ]
              }
            ]
          },
          {
            OR: [
              {
                contract_code: {
                  status_capacity_request_management_id: 2
                }
              },
              {
                contract_code: {
                  status_capacity_request_management_id: 5,
                  contract_start_date: {
                    lte: todayStart
                  },
                  terminate_date: {
                    gt: todayStart
                  }
                }
              }
            ]
          }
        ]
      },
      include: {
        reserve_balancing_gas_contract: {
          include: {
            reserve_balancing_gas_contract_comment: true,
            reserve_balancing_gas_contract_detail: {
              include: {
                nomination_point: {
                  include: {
                    area: true,
                    zone: true
                  }
                },
                area: true,
                zone: true
              }
            },
            reserve_balancing_gas_contract_files: true
          }
        },
        group: true,
        query_shipper_nomination_status: true,
        contract_code: true,
        // submission_comment_query_shipper_nomination_file: true,
        nomination_type: true,
        nomination_version: {
          include: {
            nomination_full_json: true,
            // nomination_full_json_sheet2: true,
            nomination_row_json: {
              include: {
                query_shipper_nomination_type: true
              },
              orderBy: {
                id: 'asc'
              }
            }
          },
          where: {
            flag_use: true
          }
        }
        // query_shipper_nomination_file_renom: true,
        // query_shipper_nomination_file_url: {
        //   include: {
        //     nomination_version: true,
        //     query_shipper_nomination_status: true,
        //     create_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //     update_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     id: 'desc',
        //   },
        // },
        // query_shipper_nomination_file_comment: {
        //   include: {
        //     query_shipper_nomination_type_comment: true,
        //     query_shipper_nomination_status: true,
        //     nomination_version: true,
        //     create_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //     update_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     id: 'desc',
        //   },
        // },
      },
      orderBy: {
        id: 'desc'
      }
    })
    // console.log('resData : ', resData);
    let nomList = resData
    if (query?.tab == '0') {
      // กรอง nomination แบบรายวันสำหรับวันที่กำลังประมวลผล
      const dailyNominationList = resData.filter((nominationFile) => nominationFile.nomination_type_id == 1)

      // กรอง nomination แบบรายสัปดาห์สำหรับสัปดาห์ที่กำลังประมวลผล
      // ข้ามถ้ามี daily nomination สำหรับ contract เดียวกันแล้ว (daily nomination มีลำดับความสำคัญสูงกว่า)
      const weeklyNominationList = resData.filter((nominationFile) => nominationFile.nomination_type_id == 2 && !dailyNominationList.some((daily) => daily.contract_code_id == nominationFile.contract_code_id))
      // contract_code?.contract_start_date
      const start_weeklyNominationList = weeklyNominationList?.filter((f:any) =>{
        return (
          dayjs(f?.contract_code?.contract_start_date).isSameOrBefore(targetDate)
        )
      })
      nomList = [...dailyNominationList, ...start_weeklyNominationList]
    }
    const contractCodeMaster = contractCodeMasterDB?.map((e: any) => {
      const {booking_version, ...nE} = e
      const d_booking_version = booking_version?.map((eBv: any) => {
        const {booking_full_json, booking_row_json, ...neBv} = eBv
        const d_booking_full_json = booking_full_json?.map((eFj: any) => {
          const {data_temp, ...neFj} = eFj
          return {
            ...neFj,
            data_temp: JSON.parse(data_temp)
          }
        })
        const d_booking_row_json = booking_row_json?.map((eFj: any) => {
          const {data_temp, ...neFj} = eFj
          return {
            ...neFj,
            data_temp: JSON.parse(data_temp)
          }
        })

        return {
          ...neBv,
          booking_full_json: d_booking_full_json,
          booking_row_json: d_booking_row_json
        }
      })

      return {
        ...nE,
        booking_version: d_booking_version
      }
    })
    // 2026-CSF-010 2022-CLF-018_Amd004
    // 2026-CNF-011 2026-CNF-N001

    // [170, 169, 2, 185]
    // console.log('## nomList : ', nomList);
    // console.log('contractCodeMaster : ', contractCodeMaster);
    // console.log('[2] contractCodeMaster : ', contractCodeMaster?.filter((f:any) => f?.id === 2)); // 2022-CLF-018_Amd004 1753185.000
    // console.log('[147] contractCodeMaster : ', contractCodeMaster?.filter((f:any) => f?.id === 147)); // 2026-CNF-009 694565
    console.log('[185] contractCodeMaster : ', contractCodeMaster?.filter((f:any) => f?.id === 185)); // 2026-CNF-N001
    // weeklyDay
    // capacityRightMMBTUD
    // 2, 147, 142
    
    // 170, 169

    // X1 3,905,275.000
    // X1 2776750
    // 2791790
    // 1113485 ????

    // 11,528,102.000

    const grouped = {}
    for (const curr of nomList) {
      if(!curr){
        continue;
      }
      const key = curr && `${curr.gas_day}|${curr.group?.name}|${curr?.nomination_type?.id}` || ""

      if (!grouped[key]) {
        grouped[key] = {
          gas_day: curr.gas_day,
          shipper_name: curr.group?.name,
          nomination_type: curr?.nomination_type,
          data: []
        }
      }

      grouped[key].data.push({
        ...curr
      })
    }

    const resultGroup: any = Object.values(grouped)
    
    const resultGroupType = resultGroup.map((e: any) => {
      e['data'] = e['data']?.map((eData: any) => {
        eData['nomination_version'] = eData['nomination_version']?.map((eDataNom: any) => {
          eDataNom['nomination_full_json'] = eDataNom['nomination_full_json']?.map((eDataNomJson: any) => {
            eDataNomJson['data_temp'] = JSON.parse(eDataNomJson['data_temp'])
            return {
              ...eDataNomJson
            }
          })
          eDataNom['nomination_row_json'] = eDataNom['nomination_row_json']?.map((eDataNomJson: any) => {
            eDataNomJson['data_temp'] = JSON.parse(eDataNomJson['data_temp'])
            return {
              ...eDataNomJson
            }
          })
          return {
            ...eDataNom
          }
        })
        return {
          ...eData
        }
      })

      const gas_day_text = dayjs(e['gas_day']).format('DD/MM/YYYY')
      const shipper_name = e['shipper_name']

      return {
        shipper_name,
        gas_day: gas_day_text,
        gas_day_text,
        dataDW: e['data'],
        nomination_type: e['nomination_type']
      }
    })
    // console.log('resultGroupType : ', resultGroupType);
    console.time('resultGroupKeyAddArea')
    const resultGroupKeyAddArea = resultGroupType.map((e: any, ix: number) => {
      const {dataDW, ...eData} = e
      const nomination_type_id = eData?.nomination_type?.id
      const dwData = dataDW.flatMap((fM: any) => {
        const {nomination_version, ...dFm} = fM
        let d_nomination_version = nomination_version.flatMap((fnomination_version: any) => {
          const {nomination_row_json, nomination_full_json, ...dfnomination_version} = fnomination_version

          const row = nomination_row_json
            ?.filter((f: any) => f?.query_shipper_nomination_type_id === 1)
            .map((mFM: any) => {
              return {
                gas_day: e['gas_day'],
                nom: {
                  ...dFm
                },
                contract_code_id: dFm?.contract_code_id,
                version: {
                  ...dfnomination_version
                },
                headData: nomination_full_json[0]?.data_temp?.headData,
                entry_exit_text: mFM['data_temp']['10'],
                ...mFM
              }
            })

          const rowFilType = row?.filter((f: any) => {
            return f?.query_shipper_nomination_type_id === 1 || f?.query_shipper_nomination_type_id === 2
          })

          const rowFilType1MMBTUandMMSCFD = rowFilType

          return [...rowFilType1MMBTUandMMSCFD]
        })

        return [...d_nomination_version]
      })

      const dwDataConcept = dataDW.flatMap((fM: any) => {
        const {nomination_version, ...dFm} = fM
        let d_nomination_version = nomination_version.flatMap((fnomination_version: any) => {
          const {nomination_row_json, nomination_full_json, ...dfnomination_version} = fnomination_version
          const row = nomination_row_json
            .filter((f: any) => f?.query_shipper_nomination_type_id != 1)
            .map((mFM: any) => {
              return {
                nom: {
                  ...dFm
                },
                contract_code_id: dFm?.contract_code_id,
                version: {
                  ...dfnomination_version
                },
                headData: nomination_full_json[0]?.data_temp?.headData,
                entry_exit_text: mFM['data_temp']['10'],
                ...mFM
              }
            })

          const rowFilType = row?.filter((f: any) => {
            return f?.query_shipper_nomination_type_id != 1
          })

          const rowFilType1All = rowFilType

          return [...rowFilType1All]
        })

        return [...d_nomination_version]
      })

      const groupedDatas = {}
      for (const curr of dwData) {
        if(!curr){
          continue;
        }
        const key = `${curr.area_text}|${curr.zone_text}`

        if (!groupedDatas[key]) {
          groupedDatas[key] = {
            gas_day: curr.gas_day,
            area_text: curr.area_text,
            zone_text: curr.zone_text,
            data: [],
            contract_code_id_arr: []
          }
        }

        groupedDatas[key].data.push({
          ...curr
        })
        groupedDatas[key].contract_code_id_arr = curr && Array.from(new Set([...groupedDatas[key].contract_code_id_arr, curr?.contract_code_id])) || []
      }
      const resultGroupArea: any = Object.values(groupedDatas)
      const booking_version = resultGroupArea?.flatMap((cd: any) => {
        const contractCodeDataId = cd?.contract_code_id_arr?.map((cta: any) => {
          const findCt = contractCodeMaster?.find((f: any) => {
            return f?.id === cta
          })
          return findCt
        })
        const contractCodeDataIdFM = contractCodeDataId?.flatMap((cdFM: any) => {
          // booking_row_json_release
          // const bjr = cdFM?.['booking_version'][0]?.['booking_row_json']?.map((cdj: any) => ({
          const bjr = (cdFM?.['booking_version'][0]?.['booking_row_json_release']?.length ? cdFM?.['booking_version'][0]?.['booking_row_json_release'] : cdFM?.['booking_version'][0]?.['booking_row_json'])?.map((cdj: any) => ({
            ...cdj,
            area_text: cdj?.area_text,
            contract_code_id_arr: [cdFM?.id],
            data: [],
            gas_day: cd?.gas_day,
            zone_text: cdj?.zone_text
          }))
          return [...bjr]
        })
        return [...contractCodeDataIdFM]
      })
      let resultGroupAreaMatch = [...resultGroupArea]
      for (let iB = 0; iB < booking_version.length; iB++) {
        const findS = resultGroupAreaMatch?.find((f: any) => {
          return f?.area_text === booking_version[iB]?.area_text && f?.zone_text === booking_version[iB]?.zone_text
        })
        if (!!!findS) {
          resultGroupAreaMatch.push({
            ...booking_version[iB]
          })
        }
      }
      const resultGroupAreaExt = resultGroupAreaMatch?.map((rEx: any) => {
        const {data, ...nrEx} = rEx

        const azData = data?.map((az: any) => {
          const zoneObj = zoneMaster.find((f: any) => {
            return f?.name === az?.zone_text
          })
          const areaObj = areaMaster.find((f: any) => {
            return f?.name === az?.area_text
          })

          return {
            zoneObj,
            areaObj,
            ...az
          }
        })
        const nominaionPoint = azData?.filter((f: any) => {
          return f?.query_shipper_nomination_type_id === 1
        })
        const nomGroupedZone = {}
        for (const curr of nominaionPoint) {
          const key = `${curr.zone_text}`

          if (!nomGroupedZone[key]) {
            nomGroupedZone[key] = {
              zone_text: curr.zone_text,
              zone: []
            }
          }

          nomGroupedZone[key].zone.push({...curr})
        }
        const nominaionPointZone: any = Object.values(nomGroupedZone)
        const dwDataConceptZone = dwDataConcept?.filter((f: any) => {
          return f?.zone_text === rEx?.zone_text
        })

        const conceptPoint = dwDataConceptZone
        const conceptGroupedZone = {}
        for (const curr of conceptPoint) {
          const key = `${curr.zone_text}`

          if (!conceptGroupedZone[key]) {
            conceptGroupedZone[key] = {
              zone_text: curr.zone_text,
              zone: []
            }
          }

          conceptGroupedZone[key].zone.push({...curr})
        }
        const conceptPointZone: any = Object.values(conceptGroupedZone)
        // dataDW
        const all_contract_code_id_arr = dataDW?.map((id_:any) => id_?.contract_code_id)

        // const contractCodeData = nrEx?.contract_code_id_arr?.map((cta: any) => {
        const contractCodeData = all_contract_code_id_arr?.map((cta: any) => {
          const findCt = contractCodeMaster?.find((f: any) => {
            return f?.id === cta
          })
          return findCt
        })
        // console.log('-> contractCodeData : ', contractCodeData);
        let capacityRightMMBTUDOnce = (area: any, date: any) => {
          const matchVersionCode = contractCodeData
            ?.flatMap((ccd: any) => {
              const ccdVersion = ccd?.booking_version?.map((ccdV: any) => {
                const dateOne = ccd?.term_type_id === 4 ? dayjs(date, 'DD/MM/YYYY').format('DD/MM/YYYY') : dayjs(date, 'DD/MM/YYYY').format('01/MM/YYYY')

                // Tab Weekly: ค่า Capacity Right (MMBTU/D) ต้องการปรับให้ดึงมาจากแถบ Summary Capacity Right ใน Capacity Management Detail - ไม่มีข้อ clickup
                const row_release_or_not_header = ccdV?.booking_full_json_release?.[0] ?? ccdV?.booking_full_json?.[0]
                const row_release_or_not_ = ccdV?.booking_row_json_release?.length ? ccdV.booking_row_json_release : (ccdV?.booking_row_json ?? [])
               
                const data_temp_r = typeof row_release_or_not_header?.data_temp === 'string' ? JSON.parse(row_release_or_not_header?.data_temp) : row_release_or_not_header?.data_temp
                const keyDate = data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key ? data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key : data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.key || null

                const fArea = row_release_or_not_?.filter((f: any) => {
                  return f?.area_text === area
                })
                let calcContract = 0
                if (!!keyDate) {
                  calcContract = fArea?.reduce((accumulator, currentValue) => {
                    const data_temp_ = typeof currentValue?.['data_temp'] === 'string' ? JSON.parse(currentValue?.['data_temp']) : currentValue?.['data_temp']
                    return accumulator + (parseToNumber(data_temp_?.[keyDate]) || 0)
                  }, 0)
                }

                // if(date === "23/08/2026"){
                //   console.log('fArea : ', fArea);
                //   console.log('calcContract : ', calcContract);
                // }
                return calcContract
              })

              return [...ccdVersion]
            })
            .reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue), 0)

          return matchVersionCode
        }

        const nomCalc = (nom: any, nomType: any) => {
          if (nomType === 1) {
            // daily
            let calcData = 0
            for (let iCal = 0; iCal < nom.length; iCal++) {
              for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
                // MMSCFD
                // MMBTU/D
                if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                  const valueDT = this.roundTo3(parseToNumber(nom[iCal]?.zone[iCalZone]?.data_temp['38']))

                  calcData = calcData + valueDT
                }
              }
            }
            return calcData
          } else {
            // weekly ทำที่ weeklyDay
            return 0
          }
        }

        let capacityRightMMBTUD = nomination_type_id === 1 && capacityRightMMBTUDOnce(nrEx?.area_text, nrEx?.gas_day)
        // if(nrEx?.area_text === "X1"){
        //   console.log('@@ nrEx?.area_text : ', nrEx?.area_text);
        //   console.log('capacityRightMMBTUD : ', capacityRightMMBTUD);
        //   console.log('- - - -');
        // }
        let nominatedValueMMBTUD = nomination_type_id === 1 &&  (nominaionPointZone.length === 0 ? null : nomCalc(nominaionPointZone, nomination_type_id))
       
        let overusageMMBTUD = nomination_type_id === 1 && nomCalc(nominaionPointZone, nomination_type_id) - capacityRightMMBTUDOnce(nrEx?.area_text, nrEx?.gas_day) > 0 ? nomCalc(nominaionPointZone, nomination_type_id) - capacityRightMMBTUDOnce(nrEx?.area_text, nrEx?.gas_day) : 0

        const zoneObj = zoneMaster.find((f: any) => {
          return f?.name === nrEx?.zone_text
        })
        const areaObj = areaMaster.find((f: any) => {
          return f?.name === nrEx?.area_text
        })

        const startDate = dayjs(eData?.gas_day_text, 'DD/MM/YYYY')
        const weeklyDay: any = {}

        daysOfWeek.forEach((day, index) => {
        
          const nomCalcWeek = (gasDay: any, nom: any, nomType: any) => {
            if (nomType === 2) {
              let calcData = 0
              let hasValue = false

              for (let iCal = 0; iCal < (nom?.length || 0); iCal++) {
                for (
                  let iCalZone = 0;
                  iCalZone < (nom[iCal]?.zone?.length || 0);
                  iCalZone++
                ) {
                  const zoneData = nom[iCal]?.zone[iCalZone]

                  const foundEntry = Object.entries(
                    zoneData?.headData || {}
                  ).find(([key, value]) => {
                    return (
                      value?.toString().trim() ===
                      gasDay?.toString().trim()
                    )
                  })

                  const headDataDTKey = foundEntry
                    ? foundEntry[0]
                    : undefined

                  if (zoneData?.data_temp?.['9'] === 'MMBTU/D') {
                    if (headDataDTKey) {
                      const rawValue =
                        zoneData?.data_temp?.[headDataDTKey]

                      // ไม่มีข้อมูลจริง
                      if (
                        rawValue === null ||
                        rawValue === undefined ||
                        String(rawValue).trim() === ''
                      ) {
                        continue
                      }

                      // มีข้อมูลแล้ว แม้ค่าเป็น 0
                      const parsedValue = parseToNumber(rawValue)

                      if (
                        parsedValue !== null &&
                        parsedValue !== undefined &&
                        !Number.isNaN(Number(parsedValue))
                      ) {
                        const valueDT = (parsedValue)
                        // calcData = calcData + (this.roundTo3(valueDT / 24) * 24)
                        // calcData = calcData + this.roundTo3(
                        //   this.roundTo3(valueDT / 24) * 24
                        // );
                        calcData = calcData + this.roundTo3(this.roundTo3(valueDT / 24) * 24);
                        // if(startDate.add(index, 'day').format('DD/MM/YYYY') === "09/09/2026"){
                        //   console.log('calcData : ', calcData);
                        //   console.log('this.roundTo3(valueDT / 24) : ', this.roundTo3(valueDT / 24));
                        //   console.log('(valueDT / 24) : ', (valueDT / 24));
                        //   console.log('(valueDT / 24) * 24 : ', (valueDT / 24) * 24);
                        //   console.log('this.roundTo3((valueDT / 24) * 24) : ', this.roundTo3((valueDT / 24) * 24));
                        //   console.log('# calcData + this.roundTo3((valueDT / 24) * 24) : ', calcData);
                        // //   if(this.roundTo3(
                        // //   this.roundTo3(valueDT / 24) * 24
                        // // // ) === 6940.584){
                        // // ) === 6940.584){
                        // //     console.log('###### : ', zoneData?.data_temp?.[headDataDTKey]);
                        // //     console.log('headDataDTKey : ', headDataDTKey);
                        // //     console.log('zoneData : ', zoneData);
                        // //     console.log('valueDT : ', valueDT);
                        // //     console.log('(valueDT / 24) : ', (valueDT / 24));
                        // //     console.log('this.roundTo3(valueDT / 24) : ', this.roundTo3(valueDT / 24)); 
                        // //     console.log('this.roundTo3(valueDT / 24) * 24 : ', this.roundTo3(valueDT / 24) * 24);
                        // //     console.log(this.roundTo3(this.roundTo3(valueDT / 24) * 24));


                        // //   }
                        // }
                        // calcData += valueDT
                        hasValue = true
                      }
                    }
                  }
                }
              }

              // console.log('- - - -');

              // ไม่มีข้อมูลทุกจุด -> null
              // มีข้อมูลเป็น 0 -> 0
              // มีข้อมูลอื่น -> ผลรวม
              return hasValue
                ? this.roundTo3(calcData)
                : null
            }

            return null
          }
          const capacityRightMMBTUDWeek = capacityRightMMBTUDOnce(nrEx?.area_text, startDate.add(index, 'day').format('DD/MM/YYYY'))
          const nominatedValueMMBTUDWeek = nomCalcWeek(startDate.add(index, 'day').format('DD/MM/YYYY'), nominaionPointZone, nomination_type_id)
          const overusageMMBTUDWeek = nominatedValueMMBTUDWeek === null ? null : (nominatedValueMMBTUDWeek - capacityRightMMBTUDWeek > 0 ? nominatedValueMMBTUDWeek - capacityRightMMBTUDWeek : 0)

          weeklyDay[day] = {
            gas_day_text: startDate.add(index, 'day').format('DD/MM/YYYY'),
            capacityRightMMBTUD: capacityRightMMBTUDWeek,
            nominatedValueMMBTUD: nominatedValueMMBTUDWeek,
            overusageMMBTUD: overusageMMBTUDWeek
          }
        })
   
        const overusageMMBTUDDaily = overusageMMBTUD
        return {
          gas_day: eData?.gas_day_text,
          shipper_name: eData?.shipper_name,
          ...nrEx,
          zoneObj,
          areaObj,
          nominaionPointZone,
          conceptPointZone,
          capacityRightMMBTUD,
          nominatedValueMMBTUD: nominatedValueMMBTUD,
          overusageMMBTUD: overusageMMBTUDDaily,
          weeklyDay
        }
      })

      const contractAll = [...new Set(resultGroupAreaExt?.map((rg: any) => rg?.contract_code_id_arr).flat())]

      const contractCodeData = contractAll?.map((cta: any) => {
        const findCt = contractCodeMaster?.find((f: any) => {
          return f?.id === cta
        })
        return findCt
      })

      let capacityRightMMBTUD = (date: any, noms: any) => {
        const areaBJR = noms?.map((brj: any) => brj?.area_text)
        const matchVersionCode = contractCodeData
          ?.flatMap((ccd: any) => {
            const ccdVersion = ccd?.booking_version?.map((ccdV: any) => {
              const dateOne = ccd?.term_type_id === 4 ? dayjs(date, 'DD/MM/YYYY').format('DD/MM/YYYY') : dayjs(date, 'DD/MM/YYYY').format('01/MM/YYYY')

            
              // Tab Daily: ค่า Capacity Right (MMBTU/D) ต้องการปรับให้ดึงมาจากแถบ Summary Capacity Right ใน Capacity Management Detail - ไม่มีข้อ clickup
              const row_release_or_not_header = ccdV?.booking_full_json_release?.[0] ?? ccdV?.booking_full_json?.[0]
              const row_release_or_not_ = ccdV?.booking_row_json_release?.length ? ccdV.booking_row_json_release : (ccdV?.booking_row_json ?? [])
              const data_temp_r = typeof row_release_or_not_header?.data_temp === 'string' ? JSON.parse(row_release_or_not_header?.data_temp) : row_release_or_not_header?.data_temp
              const keyDate = data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key ? data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key : data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.key || null
              const brjExit = row_release_or_not_?.filter((f: any) => areaBJR.includes(f?.area_text))
            
              let calcContract = 0
              if (!!keyDate) {
                calcContract = brjExit.reduce((accumulator, currentValue) => {
                  const data_temp_ = typeof currentValue?.['data_temp'] === 'string' ? JSON.parse(currentValue?.['data_temp']) : currentValue?.['data_temp']
                  return accumulator + (parseToNumber(data_temp_?.[keyDate]) || 0)
                }, 0)
              }
              return calcContract
            })

            return [...ccdVersion]
          })
          .reduce((accumulator, currentValue) => accumulator + currentValue, 0)

        return matchVersionCode
      }

      const nomCalc = (noms: any, nomType: any) => {
        const nom = [...noms.map((eNo: any) => eNo?.nominaionPointZone)].flat()
        if (nomType === 1) {
          // daily
          let calcData = 0
          for (let iCal = 0; iCal < nom.length; iCal++) {
            for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
              if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                calcData = calcData + valueDT
              }
            }
          }
          return calcData
        } else {
          // weekly ทำที่ weeklyDay
          return null
        }
      }
      const imbalanceMMBTUDCalc = (noms: any, nomType: any) => {
        const nom = [...noms.map((eNo: any) => eNo?.nominaionPointZone)].flat()
        const concept = [...noms.map((eNo: any) => eNo?.conceptPointZone)].flat()
        // nom?.nomination_type_id
        // Park
        // Unpark
        // Min_Inventory_Change
        // Shrinkage_Volume
        // entry - exit - Min_Inventory_Change - Park + Unpark - Shrinkage_Volume
        if (nomType === 1) {
          let calcData = 0
          let nomEntry = 0
          let nomExit = 0
          let Park = 0
          let Unpark = 0
          let MinInventoryChange = 0
          let ShrinkageVolume = 0
          for (let iCal = 0; iCal < nom.length; iCal++) {
            for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
              if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                if (nom[iCal]?.zone[iCalZone]?.entry_exit_text === 'Entry') {
                  const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                  nomEntry = nomEntry + valueDT
                } else {
                  const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                  nomExit = nomExit + valueDT
                }
              }
            }
          }

          for (let iCal = 0; iCal < concept.length; iCal++) {
            for (let iCalZone = 0; iCalZone < concept[iCal]?.zone.length; iCalZone++) {
              if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Park') {
                const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                Park = Park + valueDT
              } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Unpark') {
                const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                Unpark = Unpark + valueDT
              } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Min_Inventory_Change') {
                const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                MinInventoryChange = MinInventoryChange + valueDT
              } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Shrinkage_Volume') {
                const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp['38']?.replace(/,/g, ''))
                ShrinkageVolume = ShrinkageVolume + valueDT
              }
            }
          }

          calcData = nomEntry - nomExit

          return calcData
        } else {
          // weekly ทำที่ weeklyDay
          return null
        }
      }

      const startDate = dayjs(eData?.gas_day_text, 'DD/MM/YYYY')
      // สร้าง object
      const weeklyDay: any = {}

      daysOfWeek.forEach((day, index) => {
        let capacityRightMMBTUDWeek = (date: any, noms: any) => {
          const areaBJR = noms?.map((brj: any) => brj?.area_text)
          const matchVersionCode = contractCodeData
            ?.flatMap((ccd: any) => {
              const ccdVersion = ccd?.booking_version?.map((ccdV: any) => {

                const dateOne = ccd?.term_type_id === 4 ? dayjs(date, 'DD/MM/YYYY').format('DD/MM/YYYY') : dayjs(date, 'DD/MM/YYYY').format('01/MM/YYYY')

                const row_release_or_not_header = ccdV?.booking_full_json_release?.[0] ?? ccdV?.booking_full_json?.[0]
                const row_release_or_not_ = ccdV?.booking_row_json_release?.length ? ccdV.booking_row_json_release : (ccdV?.booking_row_json ?? [])
                const data_temp_r = typeof row_release_or_not_header?.data_temp === 'string' ? JSON.parse(row_release_or_not_header?.data_temp) : row_release_or_not_header?.data_temp

                const keyDate = data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key ? data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.[dateOne]?.key : data_temp_r?.headerExit?.['Capacity Daily Booking (MMBTU/d)']?.key || null
                const brjExit = row_release_or_not_?.filter((f: any) => areaBJR.includes(f?.area_text))

                let calcContract = 0
                if (!!keyDate) {
                  calcContract = brjExit.reduce((accumulator, currentValue) => {
                    const data_temp_ = typeof currentValue?.['data_temp'] === 'string' ? JSON.parse(currentValue?.['data_temp']) : currentValue?.['data_temp']
                    return accumulator + (parseToNumber(data_temp_?.[keyDate]) || 0)
                  }, 0)
                }
                return calcContract
              })

              return [...ccdVersion]
            })
            .reduce((accumulator, currentValue) => {
              return accumulator + currentValue
            }, 0)

          return matchVersionCode
        }
      
        // const nomCalcWeek = (gasDay: any, noms: any, nomType: any) => {
        //   if (nomType === 2) {
        //     const nom = [
        //       ...noms.map((eNo: any) => eNo?.nominaionPointZone)
        //     ].flat()

        //     let calcData = 0
        //     let hasValue = false

        //     for (let iCal = 0; iCal < nom.length; iCal++) {
        //       for (
        //         let iCalZone = 0;
        //         iCalZone < (nom[iCal]?.zone?.length || 0);
        //         iCalZone++
        //       ) {
        //         const foundEntry = Object.entries(
        //           nom[iCal]?.zone[iCalZone]?.headData || {}
        //         ).find(([key, value]) => {
        //           return (
        //             value?.toString().trim() ===
        //             gasDay?.toString().trim()
        //           )
        //         })

        //         const headDataDTKey = foundEntry
        //           ? foundEntry[0]
        //           : undefined

        //         if (
        //           nom[iCal]?.zone[iCalZone]?.data_temp?.['9'] ===
        //           'MMBTU/D'
        //         ) {
        //           if (headDataDTKey) {
        //             const rawValue =
        //               nom[iCal]?.zone[iCalZone]?.data_temp?.[
        //                 headDataDTKey
        //               ]

        //             // null / undefined / '' = ไม่มีค่า
        //             // 0 / '0' / '0.000' = มีค่า
        //             if (
        //               rawValue !== null &&
        //               rawValue !== undefined &&
        //               String(rawValue).trim() !== ''
        //             ) {
        //               const valueDT = Number(String(rawValue).replace(/,/g, ''))

        //               if (!Number.isNaN(valueDT)) {
        //                 // console.log('valueDT : ', valueDT);
        //                 // if(gasDay === "02/08/2026" && eData?.shipper_name === "PTT"){
        //                 //   console.log(`Area [${nom[iCal]?.zone[iCalZone]?.area_text}] : ${valueDT}`);
        //                 //   console.log('__ : ', calcData += valueDT);
        //                 // }
        //                 calcData += valueDT
        //                 hasValue = true
        //               }
        //             }
        //           }
        //         }
        //       }
        //     }

        //     return hasValue ? calcData : null
        //   }

        //   return null
        // }
      
        const nomCalcWeek = (gasDay: any, noms: any, nomType: any) => {
          if (nomType === 2) {
            // const nom = [
            //   ...noms.map((eNo: any) => eNo?.nominaionPointZone)
            // ].flat()

            // let calcData = 0
            // let hasValue = false

            // for (let iCal = 0; iCal < nom.length; iCal++) {
            //   for (
            //     let iCalZone = 0;
            //     iCalZone < (nom[iCal]?.zone?.length || 0);
            //     iCalZone++
            //   ) {
            //     const foundEntry = Object.entries(
            //       nom[iCal]?.zone[iCalZone]?.headData || {}
            //     ).find(([key, value]) => {
            //       return (
            //         value?.toString().trim() ===
            //         gasDay?.toString().trim()
            //       )
            //     })

            //     const headDataDTKey = foundEntry
            //       ? foundEntry[0]
            //       : undefined

            //     if (
            //       nom[iCal]?.zone[iCalZone]?.data_temp?.['9'] ===
            //       'MMBTU/D'
            //     ) {
            //       if (headDataDTKey) {
            //         const rawValue =
            //           nom[iCal]?.zone[iCalZone]?.data_temp?.[
            //             headDataDTKey
            //           ]

            //         // null / undefined / '' = ไม่มีค่า
            //         // 0 / '0' / '0.000' = มีค่า
            //         if (
            //           rawValue !== null &&
            //           rawValue !== undefined &&
            //           String(rawValue).trim() !== ''
            //         ) {
            //           const valueDT = Number(String(rawValue).replace(/,/g, ''))

            //           if (!Number.isNaN(valueDT)) {
            //             // console.log('valueDT : ', valueDT);
            //             // if(gasDay === "02/08/2026" && eData?.shipper_name === "PTT"){
            //             //   console.log(`Area [${nom[iCal]?.zone[iCalZone]?.area_text}] : ${valueDT}`);
            //             //   console.log('__ : ', calcData += valueDT);
            //             // }
            //             calcData += valueDT
            //             hasValue = true
            //           }
            //         }
            //       }
            //     }
            //   }
            // }

            // return hasValue ? calcData : null
            const day_ = dayjs(gasDay, "DD/MM/YYYY").format("dddd").toLowerCase();
            let calcData = null
            let hasValue = false
            for (let iCal = 0; iCal < noms.length; iCal++) {
              const val = noms?.[iCal]?.weeklyDay?.[day_]?.nominatedValueMMBTUD
              if(val !== null || val !== undefined){
                hasValue = true
                // console.log('val : ', val);
                calcData = (calcData ?? 0) + val 
                // console.log('_ : ', calcData);
              }
            }
          
            return hasValue ? calcData : null
          }

          return null
        }
        // 2758259.3109999998
        // 3770960.1359999995

        const imbalanceMMBTUDCalcWeek = (gasDay: any, noms: any, nomType: any) => {
          const nom = [...noms.map((eNo: any) => eNo?.nominaionPointZone)].flat()
          const concept = [...noms.map((eNo: any) => eNo?.conceptPointZone)].flat()
          // nom?.nomination_type_id
          // Park
          // Unpark
          // Min_Inventory_Change
          // Shrinkage_Volume
          // entry - exit - Min_Inventory_Change - Park + Unpark - Shrinkage_Volume
          if (nomType === 2) {
            let calcData = 0
            let nomEntry = 0
            let nomExit = 0
            let Park = 0
            let Unpark = 0
            let MinInventoryChange = 0
            let ShrinkageVolume = 0
            for (let iCal = 0; iCal < nom.length; iCal++) {
              for (let iCalZone = 0; iCalZone < nom[iCal]?.zone.length; iCalZone++) {
                const foundEntry = Object.entries(nom[iCal]?.zone[iCalZone]?.headData || {}).find(([key, value]) => {
                  return value?.toString().trim() === gasDay.toString().trim()
                })
                const headDataDTKey = foundEntry ? foundEntry[0] : undefined
                if (nom[iCal]?.zone[iCalZone]?.data_temp['9'] === 'MMBTU/D') {
                  if (nom[iCal]?.zone[iCalZone]?.entry_exit_text === 'Entry') {
                    const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                    nomEntry = nomEntry + valueDT
                  } else {
                    const valueDT = Number(nom[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                    nomExit = nomExit + valueDT
                  }
                }
              }
            }

            for (let iCal = 0; iCal < concept.length; iCal++) {
              for (let iCalZone = 0; iCalZone < concept[iCal]?.zone.length; iCalZone++) {
                const foundEntry = Object.entries(nom[iCal]?.zone[iCalZone]?.headData || {}).find(([key, value]) => {
                  return value?.toString().trim() === gasDay.toString().trim()
                })
                const headDataDTKey = foundEntry ? foundEntry[0] : undefined

                if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Park') {
                  const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                  Park = Park + valueDT
                } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Unpark') {
                  const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                  Unpark = Unpark + valueDT
                } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Min_Inventory_Change') {
                  const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                  MinInventoryChange = MinInventoryChange + valueDT
                } else if (concept[iCal]?.zone[iCalZone]?.data_temp['5'] === 'Shrinkage_Volume') {
                  const valueDT = Number(concept[iCal]?.zone[iCalZone]?.data_temp[headDataDTKey]?.replace(/,/g, '')) || 0
                  ShrinkageVolume = ShrinkageVolume + valueDT
                }
              }
            }

            calcData = nomEntry - nomExit
            return calcData || 0
          } else {
            return 0
          }
        }

        const capacityRightMMBTUD = capacityRightMMBTUDWeek(startDate.add(index, 'day').format('DD/MM/YYYY'), resultGroupAreaExt)
        const imbalanceMMBTUD = imbalanceMMBTUDCalcWeek(startDate.add(index, 'day').format('DD/MM/YYYY'), resultGroupAreaExt, nomination_type_id)
        const nominatedValueMMBTUD = nomCalcWeek(startDate.add(index, 'day').format('DD/MM/YYYY'), resultGroupAreaExt, nomination_type_id)
       
        // console.log(startDate.add(index, 'day').format('DD/MM/YYYY'));
        // console.log('- resultGroupAreaExt : ', resultGroupAreaExt);
        // console.log('- nominatedValueMMBTUD : ', nominatedValueMMBTUD);
        const overusageMMBTUDWeeklySum = resultGroupAreaExt.reduce((accumulator, currentValue) => accumulator + Number(currentValue?.weeklyDay[day]?.overusageMMBTUD || 0), 0)

        weeklyDay[day] = {
          gas_day_text: startDate.add(index, 'day').format('DD/MM/YYYY'),
          capacityRightMMBTUD: capacityRightMMBTUD,
          nominatedValueMMBTUD: nominatedValueMMBTUD,
          overusageMMBTUD: overusageMMBTUDWeeklySum,
          imbalanceMMBTUD: imbalanceMMBTUD
        }
      })
     
      const capacityRightMMBTUDDaily = capacityRightMMBTUD(eData?.gas_day_text, resultGroupAreaExt)
      const nominatedValueMMBTUDDaily = nomCalc(resultGroupAreaExt, nomination_type_id)
      const overusageMMBTUDDaily = resultGroupAreaExt.reduce((accumulator, currentValue) => accumulator + Number(currentValue?.overusageMMBTUD || 0), 0)

      const imbalanceMMBTUDDaily = imbalanceMMBTUDCalc(resultGroupAreaExt, nomination_type_id)
      return {
        id: ix + 1,
        dataRow: resultGroupAreaExt,
        ...eData,
        contractAll,
        capacityRightMMBTUD: capacityRightMMBTUDDaily,
        nominatedValueMMBTUD: nominatedValueMMBTUDDaily,
        overusageMMBTUD: overusageMMBTUDDaily,
        imbalanceMMBTUD: imbalanceMMBTUDDaily,
        weeklyDay
      }
    })
    console.timeEnd('resultGroupKeyAddArea')
    // console.log('resultGroupKeyAddArea : ', resultGroupKeyAddArea);

    // 53,000.000 > 86000
    // nominatedValueMMBTUD

    return resultGroupKeyAddArea
  }

  // #
  async exportFileNom(response: any, payload: any, userId: any) {
    const queryShipperNominationFile = await this.prisma.query_shipper_nomination_file.findFirst({
      where: {
        id: Number(payload?.id)
      },
      include: {
        nomination_version: {
          where: {
            flag_use: true
          },
          include: {
            nomination_full_json: true,
            nomination_full_json_sheet2: true
          }
        }
      }
    })
    const nomination_full_json = queryShipperNominationFile?.nomination_version?.[0]?.nomination_full_json
    const nomination_full_json_sheet2 = queryShipperNominationFile?.nomination_version?.[0]?.nomination_full_json_sheet2
    const dataTempJull = JSON.parse(nomination_full_json?.[0]?.data_temp || null)
    const dataTempJullSheet2 = JSON.parse(nomination_full_json_sheet2?.[0]?.data_temp || null)

    const fnAOtoAA = (data_: any) => {
      return (data_ || []).map((item: any) =>
        Object.keys(item)
          .sort((a, b) => +a - +b)
          .map((key) => item[key])
      )
    }
    console.log('dataTempJull : ', dataTempJull)

    const sheet1Head = Object.keys(dataTempJull?.headData)
      ?.sort((a, b) => +a - +b)
      ?.map((key) => dataTempJull?.headData[key])
    const sheet1Value = fnAOtoAA(dataTempJull?.valueData)
    const sheet2Head = Object.keys(dataTempJullSheet2?.headData)
      ?.sort((a, b) => +a - +b)
      ?.map((key) => dataTempJullSheet2?.headData[key])
    const sheet2Value = fnAOtoAA(dataTempJullSheet2?.valueData)
    // console.log('sheet1Value : ', sheet1Value);
    // const east = sheet1Value?.filter((f:any) => f?.[0] === "EAST")
    const data = [
      [], // Row 0
      ['SHIPPER ID', 'CONTRACT CODE', 'START DATE'], // Row 1
      [`${dataTempJull?.shiperInfo?.[0]?.['SHIPPER ID']}`, `${dataTempJull?.shiperInfo?.[1]?.['CONTRACT CODE']}`, `${dataTempJull?.shiperInfo?.[2]?.['START DATE']}`], // Row 2
      sheet1Head, // Row 3
      ...sheet1Value
    ]
    const data2 = [
      [], // Row 0
      sheet2Head, // Row 1,
      ...sheet2Value,
      ['*'],
      ['ห้ามลบดอกจันด้านบน']
    ]
    const data3 = headNomSheet3

    const excelBuffer = await this.componentGenExcelNom(data, data2, data3, queryShipperNominationFile?.nomination_type_id === 1 ? 'Daily Nomination' : 'Weekly Nomination')

    response.setHeader('Content-Disposition', `attachment; filename="${queryShipperNominationFile?.nomination_code}.xlsx"`)
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response.send(excelBuffer)
  }

  async componentGenExcelNom(data: any, data2: any, data3: any, typeOfNomination: any) {
    // สร้าง workbook และ worksheet
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
            worksheet1[cell].s.border.bottom = {style: 'thin'}
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
            worksheet2[cell].s.border.bottom = {style: 'thin'}
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
}
