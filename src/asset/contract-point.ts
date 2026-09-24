import {HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {checkStartEndBoom, getTodayEndAdd7, getTodayNowAdd7, getTodayNowDDMMYYYYDfaultAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'
import {AssetNominationPointService} from './nomination-point'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Bangkok')

@Injectable()
export class AssetContractPointService {
  constructor(
    private prisma: PrismaService,
    private readonly assetNominationPointService: AssetNominationPointService
  ) {}

  contractPoint() {
    return this.prisma.contract_point.findMany({
      include: {
        area: true,
        zone: true,
        entry_exit: true,
        nomination_point_list: {
          include: {
            contract_point_list: true,
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
  }

  contractPointOnce(id: any) {
    return this.prisma.contract_point.findUnique({
      where: {
        id: Number(id)
      },
      include: {
        area: true,
        zone: true,
        entry_exit: true,
        nomination_point_list: {
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
  }

  async contractPointCreate(payload: any, userId: any, req?: any) {
    const {contract_point_start_date, contract_point_end_date, entry_exit_id, zone_id, area_id, contract_nomination_point, nomination_point_start_date, nomination_point_end_date, ...dataWithout} = payload

    let validateList = []
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const startDayjs = contract_point_start_date ? getTodayNowAdd7(contract_point_start_date) : null
    const endDayjs = contract_point_end_date ? getTodayNowAdd7(contract_point_end_date) : null
    const startDate = (startDayjs && startDayjs.isValid()) ? startDayjs.toDate() : null
    const endDate = (endDayjs && endDayjs.isValid()) ? endDayjs.toDate() : null

    if (!!dataWithout?.contract_point) {
      const ckName = await this.prisma.contract_point.findFirst({
        where: {
          AND: [
            {
              contract_point: dataWithout?.contract_point
            },
            {
              OR: [
                {
                  contract_point_start_date: {
                    lte: startDate || todayStart
                  }
                }, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                {
                  contract_point_end_date: {
                    lte: startDate || todayStart
                  }
                }
              ]
            },
            {
              OR: [
                {
                  contract_point_end_date: null
                }, // ถ้า end_date เป็น null
                {
                  contract_point_end_date: {
                    gt: startDate || todayStart
                  }
                }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                {
                  contract_point_end_date: {
                    gt: endDate || todayEnd
                  }
                }
              ]
            }
          ]
        }
      })
      if (!!ckName) {
        const message = `This Contract point has already been used.`
        validateList.push(message)
      }
    }
    // contract_point_end_date
    contract_nomination_point.forEach((item: any) => {
      if(item.start_date){
        const itemStartDate = getTodayNowAdd7(item.start_date)
        if(itemStartDate.isBefore(startDayjs) || (endDayjs && !endDayjs.isValid() && itemStartDate.isAfter(endDayjs))){
          const message = `${item?.nomination_point ? item?.nomination_point : 'Nomination point'} date is not in the contract point period.`
          if(!validateList.includes(message)){
            validateList.push(message)
          }
        }
      }
      
      if(item.end_date){
        
        const itemEndDate = getTodayNowAdd7(item.end_date)
        if(itemEndDate.isBefore(startDayjs) || (endDayjs && !endDayjs.isValid() && itemEndDate.isAfter(endDayjs))){
          const message = `${item?.nomination_point ? item?.nomination_point : 'Nomination point'} date is not in the contract point period.`
          if(!validateList.includes(message)){
            validateList.push(message)
          }
        }
      }else{
        if(!!contract_point_end_date){ // https://app.clickup.com/t/9018502823/86euzxxpr
          const message = `${item?.nomination_point ? item?.nomination_point : 'Nomination point'} date is not in the contract point period.`
          if(!validateList.includes(message)){
            validateList.push(message)
          }
        }
      }
    })

    let pairedPoint = contract_nomination_point.filter((item) => Number(item?.id))
    let newPairPoint = contract_nomination_point.filter((item) => !item?.id && Number(item?.ref_id))
    if (pairedPoint && newPairPoint && pairedPoint.length + newPairPoint.length > 0) {
      try {
        const newNominationPointIDList = pairedPoint.map((item) => item.id)
        const newNominationPointRefIDList = newPairPoint.map((item) => item.ref_id)
        const combinedNominationPointList = [...new Set([...newNominationPointIDList, ...newNominationPointRefIDList])]

        // #region หา nomination point ที่มี area ไม่ตรงกับ contract point
        const nominationWithDiffArea = await this.prisma.nomination_point.findMany({
          where: {
            id: {
              in: combinedNominationPointList
            },
            area: {
              isNot: {
                id: area_id
              }
            }
          },
          include: {
            zone: true,
            area: true
          }
        })

        if (nominationWithDiffArea.length > 0) {
          const message = `Area is not correct.`
          validateList.push(message)
        }
        // #endregion

        // #region หาสัญญาที่มีหลาย contract point ที่ใช้ nomination point ร่วมกัน
        const ckNominationPointList = await this.prisma.contract_point.findMany({
          where: {
            AND: [
              {
                nomination_point_list: {
                  some: {
                    id: {
                      in: combinedNominationPointList
                    }
                  }
                }
              },
              {
                OR: [
                  {
                    contract_point_start_date: {
                      lte: startDate || todayStart
                    }
                  }, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  {
                    contract_point_end_date: {
                      lte: startDate || todayStart
                    }
                  }
                ]
              },
              {
                OR: [
                  {
                    contract_point_end_date: null
                  }, // ถ้า end_date เป็น null
                  {
                    contract_point_end_date: {
                      gt: startDate || todayStart
                    }
                  }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  {
                    contract_point_end_date: {
                      gt: endDate || todayEnd
                    }
                  }
                ]
              }
            ]
          }
        })

        if (!!ckNominationPointList && ckNominationPointList.length > 0) {
          const contractIDList = ckNominationPointList.map((item) => item.id)
          const contractCodeWithNomination = await this.assetNominationPointService.contractCodeWithNominationPointInContract()
          const contractCodeThatUseMoreThan1ContractPoint = contractCodeWithNomination.filter((conntract) => {
            conntract.nominationPointInContract = conntract.nominationPointInContract.filter((point: any) => point.contractPoint.some((contractPoint: any) => contractIDList.includes(Number(contractPoint.id))))
            return conntract.nominationPointInContract.length > 1
          })
          if (contractCodeThatUseMoreThan1ContractPoint.length > 0) {
            contractCodeThatUseMoreThan1ContractPoint.map((conntract) => {
              const nominationPointInContract = conntract.nominationPointInContract.filter((point) => {
                point.contractPoint = point.contractPoint.filter((contractPoint: any) => contractIDList.includes(Number(contractPoint.id)))
                return point.contractPoint.length > 0
              })
              const errorMessage = nominationPointInContract.map((point) => {
                return point.contractPoint.map((contractPoint) => {
                  const sameNominationPoint = point.nominationPoint.filter((nominationPoint) => combinedNominationPointList.includes(nominationPoint.id)).map((nominationPoint) => nominationPoint.nomination_point)
                  let currentPointString = ''
                  if (sameNominationPoint.length > 1) {
                    const lastPc = sameNominationPoint.pop()
                    let currentPointString = sameNominationPoint.join(', ')
                    currentPointString += ` and ${lastPc}`
                  } else {
                    currentPointString = sameNominationPoint.join(', ')
                  }
                  return `Contract ${conntract.contract_code} have used both this point and ${contractPoint.contract_point} that have same ${currentPointString} Nomination Point.`
                })
              })
              validateList.push(...errorMessage.flat())
            })
          }
        }
        // #endregion
      } catch (error) {
        validateList = validateList
      }
    }

    if (validateList.length > 0) {
      const message = validateList.join('<br/>')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: message,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      // #region new period
      const newPoints = contract_nomination_point.filter((point) => !point.id && point.ref_id)
      for (const point of newPoints) {
        let refPoint: any
        if (point.ref_id) {
          // If there's a ref_id, get the reference point
          refPoint = await this.prisma.nomination_point.findUnique({
            where: {
              id: point.ref_id
            },
            include: {
              area: true,
              zone: true,
              entry_exit: true,
              customer_type: true,
              contract_point_list: true
            }
          })
        }

        if (refPoint) {
          const startDate = point.start_date || nomination_point_start_date ? getTodayNowAdd7(point.start_date || nomination_point_start_date).toDate() : null
          const endDate = point.end_date || nomination_point_end_date ? getTodayNowAdd7(point.end_date || nomination_point_end_date).toDate() : null

          const sameNominationPoint = await this.prisma.nomination_point.findFirst({
            where: {
              AND: [
                {
                  nomination_point: refPoint.nomination_point
                },
                {
                  start_date: {
                    equals: startDate
                  }
                },
                {
                  end_date: {
                    equals: endDate
                  }
                }
              ]
            },
            include: {
              area: true,
              zone: true,
              entry_exit: true,
              customer_type: true,
              contract_point_list: true
            }
          })

          if (sameNominationPoint) {
            pairedPoint.push({
              id: sameNominationPoint.id
            })
          } else {
            try {
              const newNomPoint = await this.assetNominationPointService.nominationPointNewPeriod(
                {
                  ref_id: point.id || point.ref_id,
                  start_date: point.start_date || nomination_point_start_date,
                  end_date: point.end_date || nomination_point_end_date,
                  contract_nomination_point: refPoint.contract_point_list.map((item) => ({
                    nomination_point_id: null,
                    contract_point_id: item.id
                  })),
                  entry_exit_id: refPoint.entry_exit.id,
                  zone_id: refPoint.zone.id,
                  area_id: refPoint.area.id,
                  customer_type_id: refPoint.customer_type.id,
                  nomination_point: refPoint.nomination_point,
                  description: refPoint.description,
                  maximum_capacity: refPoint.maximum_capacity
                },
                userId,
                undefined,
                req
              )

              if (newNomPoint && newNomPoint.id) {
                pairedPoint.push({
                  id: newNomPoint.id
                })
              }
            } catch (error) {
              if (error.response.error) {
                validateList.push(error.response.error)
              } else {
                validateList.push(`Nomination point with ${point.ref_id ? 'ref_id' : 'id'} ${point.ref_id || point.id} new period failed`)
              }
            }
          }
        } else {
          validateList.push(`Nomination point with ${point.ref_id ? 'ref_id' : 'id'} ${point.ref_id || point.id} not found`)
        }
      }
      // #endregion

      if (validateList.length > 0) {
        const message = validateList.join('<br/>')
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: message,
            error: message
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    const configMasterPathCreate = await this.prisma.contract_point.create({
      data: {
        ...dataWithout,
        nomination_point_list: {
          connect: pairedPoint
        },
        entry_exit: {
          connect: {
            id: entry_exit_id || null
          }
        },
        zone: {
          connect: {
            id: zone_id || null
          }
        },
        area: {
          connect: {
            id: area_id || null
          }
        },
        // active: true,
        contract_point_start_date: startDate,
        contract_point_end_date: endDate,
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      },
      include:{
        area:true,
        zone:true
      },
    })

    const contract_point_ = configMasterPathCreate?.contract_point
    const area_ = configMasterPathCreate?.area?.name
    const zone_ = configMasterPathCreate?.zone?.name
    const bookRowNull = await this.prisma.booking_row_json.findMany({
      where:{
        contract_point: contract_point_,
        area_text: null,
      },
    })
    if(bookRowNull?.length > 0){
      await this.prisma.booking_row_json.updateMany({
        where:{
          id:{
            in: bookRowNull?.map((e:any) => e?.id)
          }
        },
        data:{
          area_text: area_,
          zone_text: zone_,
        },
      })
    }
    // Entry-X1-บริษัทซอฟท์ไทย แอพลิเคชั่น จำกัด
    return configMasterPathCreate
  }

  async contractPointEdit(payload: any, userId: any, id: any, req?: any) {
    const {contract_point_start_date, contract_point_end_date, entry_exit_id, zone_id, area_id, contract_nomination_point, nomination_point_start_date, nomination_point_end_date, ...dataWithout} = payload

    let validateList = []
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const startDayjs = contract_point_start_date ? getTodayNowAdd7(contract_point_start_date) : null
    const endDayjs = contract_point_end_date ? getTodayNowAdd7(contract_point_end_date) : null
    const startDate = (startDayjs && startDayjs.isValid()) ? startDayjs.toDate() : null
    const endDate = (endDayjs && endDayjs.isValid()) ? endDayjs.toDate() : null

    if (!!dataWithout?.contract_point) {
      const ckName = await this.prisma.contract_point.findFirst({
        where: {
          AND: [
            {
              id: {
                not: Number(id)
              }
            },
            {
              contract_point: dataWithout?.contract_point
            },
            {
              OR: [
                {
                  contract_point_start_date: {
                    lte: startDate || todayStart
                  }
                }, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                {
                  contract_point_end_date: {
                    lte: startDate || todayStart
                  }
                }
              ]
            },
            {
              OR: [
                {
                  contract_point_end_date: null
                }, // ถ้า end_date เป็น null
                {
                  contract_point_end_date: {
                    gt: startDate || todayStart
                  }
                }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                {
                  contract_point_end_date: {
                    gt: endDate || todayEnd
                  }
                }
              ]
            }
          ]
        }
      })
      if (!!ckName) {
        const message = `This Contract point has already been used.`
        validateList.push(message)
      }
    }

    contract_nomination_point.forEach((item: any) => {
      if(item.start_date){
        const itemStartDate = getTodayNowAdd7(item.start_date)
        if(itemStartDate.isBefore(startDayjs) || (endDayjs && !endDayjs.isValid() && itemStartDate.isAfter(endDayjs))){
          const message = `${item?.nomination_point ? item?.nomination_point : 'Nomination point'} date is not in the contract point period.`
          if(!validateList.includes(message)){
            validateList.push(message)
          }
        }
      }
      
      if(item.end_date){
        const itemEndDate = getTodayNowAdd7(item.end_date)
        if(itemEndDate.isBefore(startDayjs) || (endDayjs && !endDayjs.isValid() && itemEndDate.isAfter(endDayjs))){
          const message = `${item?.nomination_point ? item?.nomination_point : 'Nomination point'} date is not in the contract point period.`
          if(!validateList.includes(message)){
            validateList.push(message)
          }
        }
      }else{
        if(!!contract_point_end_date){ // https://app.clickup.com/t/9018502823/86euzxxpr
          const message = `${item?.nomination_point ? item?.nomination_point : 'Nomination point'} date is not in the contract point period.`
          if(!validateList.includes(message)){
            validateList.push(message)
          }
        }
      }
    })

    let pairedPoint = contract_nomination_point.filter((item) => Number(item?.id))
    let newPairPoint = contract_nomination_point.filter((item) => !item?.id && Number(item?.ref_id))
    if (pairedPoint && newPairPoint && pairedPoint.length + newPairPoint.length > 0) {
      try {
        const newNominationPointIDList = pairedPoint.map((item) => item.id)
        const newNominationPointRefIDList = newPairPoint.map((item) => item.ref_id)
        const combinedNominationPointList = [...new Set([...newNominationPointIDList, ...newNominationPointRefIDList])]

        // #region หา nomination point ที่มี area ไม่ตรงกับ contract point
        const nominationWithDiffArea = await this.prisma.nomination_point.findMany({
          where: {
            id: {
              in: combinedNominationPointList
            },
            area: {
              isNot: {
                id: area_id
              }
            }
          },
          include: {
            zone: true,
            area: true
          }
        })

        if (nominationWithDiffArea.length > 0) {
          const message = `Area is not correct.`
          validateList.push(message)
        }
        // #endregion

        // #region หาสัญญาที่มีหลาย contract point ที่ใช้ nomination point ร่วมกัน
        const ckNominationPointList = await this.prisma.contract_point.findMany({
          where: {
            AND: [
              {
                id: {
                  not: Number(id)
                }
              },
              {
                nomination_point_list: {
                  some: {
                    id: {
                      in: combinedNominationPointList
                    }
                  }
                }
              },
              {
                OR: [
                  {
                    contract_point_start_date: {
                      lte: startDate || todayStart
                    }
                  }, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                  {
                    contract_point_end_date: {
                      lte: startDate || todayStart
                    }
                  }
                ]
              },
              {
                OR: [
                  {
                    contract_point_end_date: null
                  }, // ถ้า end_date เป็น null
                  {
                    contract_point_end_date: {
                      gt: startDate || todayStart
                    }
                  }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                  {
                    contract_point_end_date: {
                      gt: endDate || todayEnd
                    }
                  }
                ]
              }
            ]
          }
        })

        if (!!ckNominationPointList && ckNominationPointList.length > 0) {
          const contractIDList = ckNominationPointList.map((item) => item.id)
          contractIDList.push(Number(id))
          const contractCodeWithNomination = await this.assetNominationPointService.contractCodeWithNominationPointInContract()
          const contractCodeThatUseMoreThan1ContractPoint = contractCodeWithNomination.filter((conntract) => {
            conntract.nominationPointInContract = conntract.nominationPointInContract.filter((point: any) => point.contractPoint.some((contractPoint: any) => contractIDList.includes(Number(contractPoint.id))))
            return conntract.nominationPointInContract.length > 1
          })
          if (contractCodeThatUseMoreThan1ContractPoint.length > 0) {
            contractIDList.pop()
            contractCodeThatUseMoreThan1ContractPoint.map((conntract) => {
              const nominationPointInContract = conntract.nominationPointInContract.filter((point) => {
                point.contractPoint = point.contractPoint.filter((contractPoint: any) => contractIDList.includes(Number(contractPoint.id)))
                return point.contractPoint.length > 0
              })
              const errorMessage = nominationPointInContract.map((point) => {
                return point.contractPoint.map((contractPoint) => {
                  const sameNominationPoint = point.nominationPoint.filter((nominationPoint) => combinedNominationPointList.includes(nominationPoint.id)).map((nominationPoint) => nominationPoint.nomination_point)
                  let currentPointString = ''
                  if (sameNominationPoint.length > 1) {
                    const lastPc = sameNominationPoint.pop()
                    let currentPointString = sameNominationPoint.join(', ')
                    currentPointString += ` and ${lastPc}`
                  } else {
                    currentPointString = sameNominationPoint.join(', ')
                  }
                  return `Contract ${conntract.contract_code} have used both this point and ${contractPoint.contract_point} that have same ${currentPointString} Nomination Point.`
                })
              })
              validateList.push(...errorMessage.flat())
            })
          }
        }
        // #endregion
      } catch (error) {
        validateList = validateList
      }
    }

    // #region หา nomination point ที่อยู่นอกช่วงเวลาของ contract point
    // const cP = await this.prisma.contract_point.findFirst({
    //   where:{
    //     id: Number(id)
    //   },
    //   include:{
    //     nomination_point_list: {
    //       where:{
    //         id:{
    //           in: (payload?.contract_nomination_point || [])?.map((e:any) => e?.id)
    //         }
    //       }
    //     }
    //   }
    // })
    // const fCP = await this.prisma.nomination_point.findMany({
    //   where:{
    //     id:{
    //       in: (payload?.contract_nomination_point || [])?.map((e:any) => e?.id)
    //     },
    //     contract_point_list:{
    //       some:{
    //         id: Number(id)
    //       }
    //     },
    //     start_date:{
    //       gte: dayjs(payload?.contract_point_start_date, "YYYY-MM-DD").toDate(),
    //     },
    //     ...(payload?.contract_point_end_date && { end_date: {
    //       lte: dayjs(payload?.contract_point_end_date, "YYYY-MM-DD").toDate()
    //     }})
    //   }
    // })
    // if(cP?.nomination_point_list?.length > 0 && (cP?.nomination_point_list?.length !== fCP?.length)){
    //   validateList.push(`This Contract point data not match list.`)
    // }
    try{
      const newNominationPointIDList = pairedPoint.map((item: any) => item.id)
      const newNominationPointRefIDList = newPairPoint.map((item: any) => item.ref_id)
      const combinedNominationPointList = [...new Set([...newNominationPointIDList, ...newNominationPointRefIDList])]
      const nominationPointList = await this.prisma.nomination_point.findMany({
        where: {
          id: {
            in: combinedNominationPointList
          }
        },
        select: {
          id: true,
          nomination_point: true
        }
      })
  
      contract_nomination_point.map((nomination_point: any) => {
        const nominationPointName = nominationPointList.find((item: any) => item.id === nomination_point?.id)?.nomination_point
        const nomStartDate = nomination_point?.start_date ? getTodayNowAdd7(nomination_point.start_date) : null
        const nomEndDate = nomination_point?.end_date ? getTodayNowAdd7(nomination_point.end_date) : null
  
        if(startDayjs && startDayjs.isValid()){
          if(nomStartDate && nomStartDate.isValid() && nomStartDate.isBefore(startDayjs) && nominationPointName){
            validateList.push(`The Nomination point ${nominationPointName} start date is before contract point's start date.`)
          }

          if(nomEndDate && nomEndDate.isValid() && nomEndDate.isBefore(startDayjs) && nominationPointName){
            validateList.push(`The Nomination point ${nominationPointName} end date is before contract point's start date.`)
          }
        }
  
        if(endDayjs && endDayjs.isValid()){
          if(nomStartDate && nomStartDate.isValid() && nomStartDate.isAfter(endDayjs) && nominationPointName){
            validateList.push(`The Nomination point ${nominationPointName} start date is after contract point's end date.`)
          }

          if((!nomEndDate || !nomEndDate.isValid() || nomEndDate.isAfter(endDayjs)) && nominationPointName){
            validateList.push(`The Nomination point ${nominationPointName} end date is after contract point's end date.`)
          }
        }
      })
    }
    catch(error){
      validateList = validateList
    }
    // #endregion

    if (validateList.length > 0) {
      const message = validateList.join('<br/>')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: message,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const original = await this.contractPointOnce(id)

      if (original && original.id) {
        // Get existing nomination points from original
        const originalPointIDList = original.nomination_point_list.map((point) => point.id)

        // Separate points into existing and new ones
        const existingPoints = contract_nomination_point.filter((point) => point.id && originalPointIDList.includes(point.id))

        const newPoints = contract_nomination_point.filter((point) => (!point.id && point.ref_id) || (point.id && !originalPointIDList.includes(point.id)))

        await this.prisma.$transaction(
          async (tx) => {
            // Handle existing points
            for (const point of existingPoints) {
              const nominationPoint = await tx.nomination_point.findUnique({
                where: {
                  id: point.id
                },
                include: {
                  area: true,
                  zone: true,
                  entry_exit: true,
                  customer_type: true,
                  contract_point_list: true
                }
              })

              const newStartDate = getTodayNowAdd7(point.start_date)
              const newEndDate = getTodayNowAdd7(point.end_date)
              const oldStartDate = getTodayNowAdd7(nominationPoint.start_date)
              const oldEndDate = getTodayNowAdd7(nominationPoint.end_date)
              if (!newStartDate.isSame(oldStartDate) || !(newEndDate.isSame(oldEndDate) || (!newEndDate.isValid() && !oldEndDate.isValid()))) {
                await this.assetNominationPointService.nominationPointEdit(
                  {
                    start_date: point.start_date,
                    end_date: point.end_date,
                    nomination_point: nominationPoint.nomination_point,
                    description: nominationPoint.description,
                    maximum_capacity: nominationPoint.maximum_capacity,
                    entry_exit_id: nominationPoint.entry_exit_id,
                    zone_id: nominationPoint.zone_id,
                    area_id: nominationPoint.area_id,
                    customer_type_id: nominationPoint.customer_type_id,
                    contract_nomination_point: nominationPoint.contract_point_list.map((item) => ({
                      nomination_point_id: point.id,
                      contract_point_id: item.id
                    }))
                  },
                  userId,
                  point.id,
                  tx
                )
              }
            }

            // Handle new points
            for (const point of newPoints) {
              let refPoint: any
              if (point.ref_id) {
                // If there's a ref_id, get the reference point
                refPoint = await tx.nomination_point.findUnique({
                  where: {
                    id: point.ref_id
                  },
                  include: {
                    area: true,
                    zone: true,
                    entry_exit: true,
                    customer_type: true,
                    contract_point_list: true
                  }
                })
              } else if (point.id) {
                // If there's an id but not in original list, get that point
                refPoint = await tx.nomination_point.findUnique({
                  where: {
                    id: point.id
                  },
                  include: {
                    area: true,
                    zone: true,
                    entry_exit: true,
                    customer_type: true,
                    contract_point_list: true
                  }
                })
              }

              if (refPoint) {
                const startDate = point.start_date || nomination_point_start_date ? getTodayNowAdd7(point.start_date || nomination_point_start_date).toDate() : null
                const endDate = point.end_date || nomination_point_end_date ? getTodayNowAdd7(point.end_date || nomination_point_end_date).toDate() : null

                const sameNominationPoint = await tx.nomination_point.findFirst({
                  where: {
                    AND: [
                      {
                        nomination_point: refPoint.nomination_point
                      },
                      {
                        start_date: {
                          equals: startDate
                        }
                      },
                      {
                        end_date: {
                          equals: endDate
                        }
                      }
                    ]
                  },
                  include: {
                    area: true,
                    zone: true,
                    entry_exit: true,
                    customer_type: true,
                    contract_point_list: true
                  }
                })

                if (sameNominationPoint) {
                  pairedPoint.push({
                    id: sameNominationPoint.id
                  })
                } else {
                  const newNomPoint = await this.assetNominationPointService.nominationPointNewPeriod(
                    {
                      ref_id: point.id || point.ref_id,
                      start_date: point.start_date || nomination_point_start_date,
                      end_date: point.end_date || nomination_point_end_date,
                      contract_nomination_point: refPoint.contract_point_list.map((item) => ({
                        nomination_point_id: null,
                        contract_point_id: item.id
                      })),
                      entry_exit_id: refPoint.entry_exit.id,
                      zone_id: refPoint.zone.id,
                      area_id: refPoint.area.id,
                      customer_type_id: refPoint.customer_type.id,
                      nomination_point: refPoint.nomination_point,
                      description: refPoint.description,
                      maximum_capacity: refPoint.maximum_capacity
                    },
                    userId,
                    tx,
                    req
                  )

                  if (newNomPoint && newNomPoint.id) {
                    pairedPoint.push({
                      id: newNomPoint.id
                    })
                  }
                }
              } else {
                validateList.push(`Nomination point with ${point.ref_id ? 'ref_id' : 'id'} ${point.ref_id || point.id} not found`)
              }
            }
          },
          {
            maxWait: 5000, // Max ms to wait for an available connection (default: 2000ms)
            timeout: 10000 // Max ms the transaction can run before being rolled back (default: 5000ms)
            // isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, // Optional: set isolation level
          }
        )
      } else {
        const message = `This Contract point data not found.`
        validateList.push(message)
      }

      if (validateList.length > 0) {
        const message = validateList.join('<br/>')
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: message,
            error: message
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    const configMasterPathEdit = await this.prisma.contract_point.update({
      where: {
        id: Number(id)
      },
      data: {
        ...dataWithout,
        nomination_point_list: {
          set: pairedPoint.map((item: any) => {
            return {
              id: Number(item.id)
            }
          })
        },
        entry_exit: {
          connect: {
            id: entry_exit_id || null
          }
        },
        zone: {
          connect: {
            id: zone_id || null
          }
        },
        area: {
          connect: {
            id: area_id || null
          }
        },
        // active: true,
        contract_point_start_date: startDate,
        contract_point_end_date: endDate,
        update_by_account: {
          connect: {
            id: Number(userId)
          }
        },
        update_date: getTodayNowAdd7().toDate(),
        update_date_num: getTodayNowAdd7().unix()
      }
    })
    const configMasterPathFind = await this.prisma.contract_point.findFirst({
      where:{
        id: Number(id)
      },
      include:{
        area:true,
        zone:true
      },
    })
    const contract_point_ = configMasterPathFind?.contract_point
    const area_ = configMasterPathFind?.area?.name
    const zone_ = configMasterPathFind?.zone?.name
    const bookRowNull = await this.prisma.booking_row_json.findMany({
      where:{
        contract_point: contract_point_,
        area_text: null,
      },
    })
    if(bookRowNull?.length > 0){
      await this.prisma.booking_row_json.updateMany({
        where:{
          id:{
            in: bookRowNull?.map((e:any) => e?.id)
          }
        },
        data:{
          area_text: area_,
          zone_text: zone_,
        },
      })
    }
    // Entry-X1-บริษัทซอฟท์ไทย แอพลิเคชั่น จำกัด

    return configMasterPathEdit
  }
}
