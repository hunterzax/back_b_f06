import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common'
import {isMatch} from 'src/common/utils/allocation.util'
import {parseToNumber, parseToNumber3Decimal} from 'src/common/utils/number.util'
import {getTodayEndAdd7, getTodayNow, getTodayNowAdd7, getTodayNowDDMMYYYYDfault, getTodayNowDDMMYYYYDfaultAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {PrismaService} from 'prisma/prisma.service'
import {uploadFilsTemp} from 'src/common/utils/uploadFileIn'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Bangkok')

@Injectable()
export class HandleReserveBalancingGasContractService {
  private readonly logger = new Logger(HandleReserveBalancingGasContractService.name)
  constructor(private prisma: PrismaService) {}

  transformColumn(data: any) {
    return data.map((item: any) => ({
      ...item,
      row: Object.fromEntries(item.row.map((value: any, index: number) => [index, value]))
    }))
  }

  transformColumnDF(data: any) {
    return Object.fromEntries(data.map((value: any, index: number) => [index, value]))
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

  async processReserveBalancingGasContract({
    reserveBalancingGasContract,
    getsValue,
    caseData,
    nomination_type_id,
    nominationPoint,
    startDateEx,
    zoneQualityMaster,
    checkEmtry,
    sheet1,
    sheet2,
    fullDataRow,
    fileOriginal,
    userId,
    comment,
    shipper_id,
    startDateExConv,
    checkType,
    renom,
    informationData,
    queryShipperNominationFileService,
    nonTpa
  }: any) {
    // // ===== STEP 27: RESERVE BALANCING GAS CONTRACT DATA PROCESSING =====
    this.logger.log('********* start STEP 27: RESERVE BALANCING GAS CONTRACT DATA PROCESSING *********')
    let checksValue: any = []
    let warningLogHrTemp: any = []
    let warningLogHr: any = []
    let warningLogDay: any = []
    let warningLogDayWeek: any = []
    let warningLogDayWeekTemp: any = []
    let sheet1Quality: any = []
    let sheet2Quality: any = []

    const reserveArr_ = reserveBalancingGasContract?.reserve_balancing_gas_contract_detail || []

    // // ===== STEP 28: DAILY NOMINATION PROCESSING =====

    const fnDayValidateNomCapa = (e: any, reserveArr_: any, nominationPoint: any, valueCapa: any, valueCapaPerDay: any, cI: any, entryExit: any) => {
      let checkNominationPoint = nominationPoint?.find((fnp: any) => {
        return fnp?.nomination_point === e['row'][3]
      })
      const find = reserveArr_.find((f: any) => {
        const isInRange = f?.end_date
          ? getTodayNowDDMMYYYYDfault(startDateEx).isBetween(getTodayNow(f?.start_date), getTodayNow(f?.end_date), 'day', '[]') // [] รวมวันต้น-ท้าย
          : getTodayNowDDMMYYYYDfault(startDateEx).isSameOrAfter(getTodayNow(f?.start_date), 'day')
        return f?.nomination_point?.nomination_point === checkNominationPoint?.nomination_point && f?.entry_exit_id === entryExit && isInRange
      })
      valueCapa = find?.daily_reserve_cap_mmbtu_d // new
      valueCapaPerDay = find?.daily_reserve_cap_mmbtu_d // new

      // ตรวจสอบค่าความจุในช่วงเวลา 24 ชั่วโมง (index 14 ถึง 37)

      Array.from({length: 24}, (_, i) => i + 14).forEach((index) => {
        let currentCapacity = e['row'][index] === '0' || (!!e['row'][index] && parseToNumber(e['row'][index])) || null //excel nom val
        let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null
        if ((valueCapa === null || valueCapaPerDay === null) && !!rIndex) {
          throw new HttpException(
            {
              status: HttpStatus.FORBIDDEN,
              error: 'Nomination Point does not match the Contract Code.'
            },
            HttpStatus.FORBIDDEN
          )
        }

        if (!!e['row'][index]) {
          checkEmtry[cI][index] = true
        }

        if (currentCapacity !== null && !!valueCapa && !!valueCapaPerDay) {
          const finds = warningLogHrTemp?.find((f: any) => {
            return f?.nomination_point === e['row'][3] && f?.hr === index - 14 + 1 && isMatch(f?.unit, e['row'][9])
          })
          if (finds) {
            warningLogHrTemp = warningLogHrTemp?.map((ehr: any) => {
              let neHR = ehr
              if (finds?.hr === neHR?.hr && finds?.nomination_point === ehr?.nomination_point && isMatch(finds.unit, ehr.unit)) {
                neHR.energy = +parseToNumber(currentCapacity)
              }
              return {
                ...neHR
              }
            })
          } else {
            warningLogHrTemp.push({
              nomination_point: e['row'][3],
              hr: index - 14 + 1,
              contractPoint: null,
              value: parseToNumber(valueCapa),
              valueDay: parseToNumber(valueCapaPerDay),
              energy: currentCapacity,
              unit: e['row'][9],
              entryExit: entryExit
            })
          }
        }
      })

      const findZone = zoneQualityMaster.find((f: any) => {
        return f?.name === e['row'][0] && f?.entry_exit_id === entryExit
      })
      // https://app.clickup.com/t/9018502823/86euzxxt1
      const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min;
      const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max;
      const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min;
      const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max;

      // WI
      if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
        e['row'][11] !== null &&
          e['row'][11] !== '' &&
          e['row'][11] !== undefined &&
          sheet1Quality.push(
            `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
          )
      }
      // HV
      if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
        e['row'][12] !== null &&
          e['row'][12] !== '' &&
          e['row'][12] !== undefined &&
          sheet1Quality.push(
            `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
          )
      }
    }

    const fnWeeklyValidateNomCapa = (e: any, reserveArr_: any, nominationPoint: any, valueCapa: any, valueCapaArr: any, cI: any, entryExit: any, weekBook: any, headDay: any) => {
      let checkNominationPoint = nominationPoint?.find((fnp: any) => {
        return fnp?.nomination_point === e['row'][3]
      })

      const nomStartDate = getTodayNowDDMMYYYYDfault(startDateEx)
      const find = reserveArr_.find((f: any) => {
        let isInRange = false
        const startDate = getTodayNow(f?.start_date).tz('Asia/Bangkok')
        const endDate = getTodayNow(f?.end_date).tz('Asia/Bangkok')
        if (f?.end_date) {
          isInRange = nomStartDate.isSameOrAfter(startDate, 'week') && nomStartDate.isSameOrBefore(endDate, 'week')
        } else {
          isInRange = nomStartDate.isSameOrAfter(startDate, 'week')
        }
        return f?.nomination_point?.nomination_point === checkNominationPoint?.nomination_point && f?.entry_exit_id === entryExit && isInRange
      })

      Array.from({length: 7}, (_, i) => i + 14).forEach((index) => {
        if (!!e['row'][index]) {
          checkEmtry[cI][index] = true
        }

        let currentCapacity = ((e['row'][index] === '0' || !!e['row'][index]) && parseToNumber(e['row'][index])) || null //new
        const headDayUse = headDay[index]

        if (!!find) {
          weekBook = false
        }

        valueCapa = find?.daily_reserve_cap_mmbtu_d
        valueCapaArr.push({
          date: headDayUse,
          value: parseToNumber(valueCapa)
        })

        let rIndex = e['row'][index] === '0' || !!e['row'][index] ? e['row'][index] : null

        if (valueCapa === null && !!rIndex) {
          throw new HttpException(
            {
              status: HttpStatus.FORBIDDEN,
              error: 'Nomination Point does not match the Contract Code.'
            },
            HttpStatus.FORBIDDEN
          )
        }

        if (!!!valueCapa && e['row'][index] !== '') {
          throw new HttpException(
            {
              status: HttpStatus.FORBIDDEN,
              error: 'Nomination Point does not match the Contract Code.'
            },
            HttpStatus.FORBIDDEN
          )
        }

        if (currentCapacity !== null && !!valueCapa) {
          const finds = warningLogDayWeekTemp?.find((f: any) => {
            return f?.nomination_point === e['row'][3] && f?.headDayUse === headDayUse && isMatch(f?.unit, e['row'][9])
          })
          if (finds) {
            warningLogDayWeekTemp = warningLogDayWeekTemp?.map((ed: any) => {
              let neD = ed
              if (finds?.headDayUse === neD?.headDayUse && finds?.nomination_point === ed?.nomination_point && isMatch(finds.unit, ed.unit)) {
                neD.energy = +Number(currentCapacity)
              }
              return {
                ...neD
              }
            })
          } else {
            warningLogDayWeekTemp.push({
              nomination_point: e['row'][3],
              headDayUse: headDayUse,
              contractPoint: null,
              value: parseToNumber(valueCapa),
              energy: currentCapacity,
              unit: e['row'][9],
              entryExit: entryExit
            })
          }
        }
      })

      const findZone = zoneQualityMaster.find((f: any) => {
        // return f?.name === e['row'][0] && f?.entry_exit_id === entryExit
        return f?.name === e['row'][0] && f?.entry_exit_id === 2 // https://app.clickup.com/t/9018502823/86ey4naep
      })

      // https://app.clickup.com/t/9018502823/86euzxxt1
      const v2_sat_heating_value_min = findZone?.zone_master_quality[0]?.v2_sat_heating_value_min;
      const v2_sat_heating_value_max = findZone?.zone_master_quality[0]?.v2_sat_heating_value_max;
      const v2_wobbe_index_min = findZone?.zone_master_quality[0]?.v2_wobbe_index_min;
      const v2_wobbe_index_max = findZone?.zone_master_quality[0]?.v2_wobbe_index_max;

      // WI
      if ((parseToNumber(e['row'][11]) < parseToNumber(v2_wobbe_index_min) && v2_wobbe_index_min !== null) || (parseToNumber(e['row'][11]) > parseToNumber(v2_wobbe_index_max) && v2_wobbe_index_max !== null)) {
        e['row'][11] !== null &&
          e['row'][11] !== '' &&
          e['row'][11] !== undefined &&
          sheet1Quality.push(
            `For nomination point ${e['row'][3]}, WI value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][11]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_wobbe_index_max))})`
          )
      }
      // HV
      if ((parseToNumber(e['row'][12]) < parseToNumber(v2_sat_heating_value_min) && v2_sat_heating_value_min !== null) || (parseToNumber(e['row'][12]) > parseToNumber(v2_sat_heating_value_max) && v2_sat_heating_value_max !== null)) {
        e['row'][12] !== null &&
          e['row'][12] !== '' &&
          e['row'][12] !== undefined &&
          sheet1Quality.push(
            `For nomination point ${e['row'][3]}, HV value (${this.formatNumberThreeDecimal(parseToNumber(e['row'][12]))}) is out of zone limits (${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_min))} to ${this.formatNumberThreeDecimal(parseToNumber(v2_sat_heating_value_max))})`
          )
      }
      return weekBook
    }

    const checkDate = (e:any, entryExit:any) => {
        // console.log('reserveArr_ : ', reserveArr_);
        if(nomination_type_id === 1){
          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
            return fnp?.nomination_point === e['row'][3]
          })
          const find = reserveArr_.find((f: any) => {
            const isInRange = f?.end_date
              ? getTodayNowDDMMYYYYDfault(startDateEx).isBetween(getTodayNow(f?.start_date), getTodayNow(f?.end_date), 'day', '[]') // [] รวมวันต้น-ท้าย
              : getTodayNowDDMMYYYYDfault(startDateEx).isSameOrAfter(getTodayNow(f?.start_date), 'day')
            return f?.nomination_point?.nomination_point === checkNominationPoint?.nomination_point && f?.entry_exit_id === entryExit && isInRange
          })
          if(!find){
            throw new HttpException(
                {
                  status: HttpStatus.BAD_REQUEST,
                  error: `Date is not match. [${e?.row?.[3] || e?.row?.[5]}]`,
                },
                HttpStatus.BAD_REQUEST,
              );
          }
        }else{
          let checkNominationPoint = nominationPoint?.find((fnp: any) => {
        return fnp?.nomination_point === e['row'][3]
      })

        const nomStartDate = getTodayNowDDMMYYYYDfault(startDateEx)
        const find = reserveArr_.find((f: any) => {
          let isInRange = false
          const startDate = getTodayNow(f?.start_date).tz('Asia/Bangkok')
          const endDate = getTodayNow(f?.end_date).tz('Asia/Bangkok')
          if (f?.end_date) {
            isInRange = nomStartDate.isSameOrAfter(startDate, 'week') && nomStartDate.isSameOrBefore(endDate, 'week')
          } else {
            isInRange = nomStartDate.isSameOrAfter(startDate, 'week')
          }
          return f?.nomination_point?.nomination_point === checkNominationPoint?.nomination_point && f?.entry_exit_id === entryExit && isInRange
        })
        if(!find){
          throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Date is not match. [${e?.row?.[3] || e?.row?.[5]}]`,
              },
              HttpStatus.BAD_REQUEST,
            );
        }
      }
    }

    if (nomination_type_id === 1) {
      // daily
      checksValue = getsValue.map((e: any, cI: any) => {
        let entryQuality = null
        let overuseQuantity = null
        let overMaximumHourCapacityRight = null
        let valueCapa = 0
        let valueCapaPerDay = 0

        if (e['row'][10] === 'Entry' && e['row'][9] === 'MMBTU/D') {
          checkDate(e, 1)
          fnDayValidateNomCapa(e, reserveArr_, nominationPoint, valueCapa, valueCapaPerDay, cI, 1)
        } else if (e['row'][10] === 'Entry' && isMatch(e['row'][9], 'MMscfd')) {
          //  ---- reserve ไม่มี MMSCF
          throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Reserve Balancing Gas Contgract is NOT SUPPORT MMSCFD`,
              },
              HttpStatus.BAD_REQUEST,
            );
        } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMBTU/D')) {
          // fnDayValidateNomCapa(e, reserveArr_, nominationPoint, valueCapa, valueCapaPerDay, cI, 2)
        } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMscfd')) {
          //  ---- reserve ไม่มี MMSCF
          throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Reserve Balancing Gas Contgract is NOT SUPPORT MMSCFD`,
              },
              HttpStatus.BAD_REQUEST,
            );
        }

        return {
          ...e,
          entryQuality: entryQuality,
          overuseQuantity: overuseQuantity,
          overMaximumHourCapacityRight: overMaximumHourCapacityRight,
          bookValue: {
            date: startDateEx,
            value: parseToNumber(valueCapa)
          },
          unit: e['row'][9],
          entryExitText: e['row'][10],
          zoneText: e['row'][0],
          areaText: e['row'][2],
          contractPointText: e['row'][3]
        }
      })
    } else {
      let weekBook = true
      // weekly
      // if (filePeriodMode === 1 || filePeriodMode === 3) {
      // day
      const headDay = sheet1?.data[3]
      checksValue = getsValue.map((e: any, cI: any) => {
        let entryQuality = null
        let overuseQuantity = null
        let overMaximumHourCapacityRight = null
        let valueCapa = 0
        let valueCapaArr = []

        if (e['row'][10] === 'Entry' && e['row'][9] === 'MMBTU/D') {
          checkDate(e, 1)
          weekBook = fnWeeklyValidateNomCapa(e, reserveArr_, nominationPoint, valueCapa, valueCapaArr, cI, 1, weekBook, headDay)
        } else if (e['row'][10] === 'Entry' && isMatch(e['row'][9], 'MMscfd')) {
          //  ---- reserve ไม่มี MMSCF
          throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Reserve Balancing Gas Contgract is NOT SUPPORT MMSCFD`,
              },
              HttpStatus.BAD_REQUEST,
            );
        } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMBTU/D')) {
          // weekBook = fnWeeklyValidateNomCapa(e, reserveArr_, nominationPoint, valueCapa, valueCapaArr, cI, 2, weekBook, headDay)
        } else if (e['row'][10] === 'Exit' && isMatch(e['row'][9], 'MMscfd')) {
          //  ---- reserve ไม่มี MMSCF
          throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `Reserve Balancing Gas Contgract is NOT SUPPORT MMSCFD`,
              },
              HttpStatus.BAD_REQUEST,
            );
        }

        return {
          ...e,
          entryQuality: entryQuality,
          overuseQuantity: overuseQuantity,
          overMaximumHourCapacityRight: overMaximumHourCapacityRight,
          bookValue: valueCapaArr,
          unit: e['row'][9],
          entryExitText: e['row'][10],
          zoneText: e['row'][0],
          areaText: e['row'][2],
          contractPointText: e['row'][3]
        }
      })

      if (weekBook) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            error: 'Nomination Point does not match the Contract Code.'
          },
          HttpStatus.FORBIDDEN
        )
      }
    }

    let groupedBywarningLogHrTemp: any = Object.values(
      warningLogHrTemp.reduce((acc, item) => {
        // const key = `${item?.hr}|${item?.contractPoint}|${item?.value}|${item?.unit}`;
        const key = `${item?.hr}|${item?.nomination_point}|${item?.value}|${item?.unit}`
        if (!acc[key]) {
          acc[key] = {
            hr: item.hr,
            // contractPoint: item.contractPoint,
            nomination_point: item.nomination_point,
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

    // https://app.clickup.com/t/86eve8pyx
    // for (let ig = 0; ig < groupedBywarningLogHrTemp.length; ig++) {
    //   const energyValues = groupedBywarningLogHrTemp[ig]?.data?.reduce(
    //     (accumulator, currentValue) => accumulator + currentValue?.energy || 0,
    //     0,
    //   );

    //   if (parseToNumber3Decimal(energyValues) > parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) {
    //     if (isMatch(groupedBywarningLogHrTemp[ig]?.unit, 'MMscfd')) {
    //       warningLogHr.push(
    //         // `Nominated max volume ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) ?? ''} for contract point ${groupedBywarningLogHrTemp[ig]?.contractPoint || '-'} and hour ${groupedBywarningLogHrTemp[ig]?.hr || '-'}`,
    //         `Nominated max volume ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) ?? ''} for nomination point ${groupedBywarningLogHrTemp[ig]?.nomination_point || '-'} and hour ${groupedBywarningLogHrTemp[ig]?.hr || '-'}`,
    //       );
    //     }
    //     else {
    //       warningLogHr.push(
    //         // `Nominated max energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) ?? ''} for contract point ${groupedBywarningLogHrTemp[ig]?.contractPoint || '-'} and hour ${groupedBywarningLogHrTemp[ig]?.hr || '-'}`,
    //         `Nominated max energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues) ?? '')} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrTemp[ig]?.value)) ?? ''} for nomination point ${groupedBywarningLogHrTemp[ig]?.nomination_point || '-'} and hour ${groupedBywarningLogHrTemp[ig]?.hr || '-'}`,
    //       );
    //     }
    //   }
    // }

    let groupedBywarningLogTotalTemp: any = Object.values(
      groupedBywarningLogHrTemp.reduce((acc, item) => {
        // const key = `${item?.contractPoint}|${item?.value}|${item?.unit}`;
        const key = `${item?.nomination_point}|${item?.value}|${item?.unit}`
        if (!acc[key]) {
          acc[key] = {
            nomination_point: item.nomination_point,
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
            // `Nominated Total volume ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for contract point ${groupedBywarningLogTotalTemp[ig]?.contractPoint} and gas day ${startDateEx}`,
            `Nominated Total volume ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for nomination point ${groupedBywarningLogTotalTemp[ig]?.nomination_point} and gas day ${startDateEx}`
          )
        } else {
          warningLogDay.push(
            // `Nominated Total energy ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for contract point ${groupedBywarningLogTotalTemp[ig]?.contractPoint} and gas day ${startDateEx}`,
            `Nominated Total energy ${(energyValues && this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) || 0} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogTotalTemp[ig]?.valueDay) ?? '')} for nomination point ${groupedBywarningLogTotalTemp[ig]?.nomination_point} and gas day ${startDateEx}`
          )
        }
      }
    }

    // ------

    let groupedBywarningLogHrWeeklyTemp: any = Object.values(
      warningLogDayWeekTemp.reduce((acc, item) => {
        // const key = `${item?.headDayUse}|${item?.contractPoint}|${item?.value}|${item?.unit}`;
        const key = `${item?.headDayUse}|${item?.nomination_point}|${item?.value}|${item?.unit}`
        if (!acc[key]) {
          acc[key] = {
            headDayUse: item.headDayUse,
            // contractPoint: item.contractPoint,
            nomination_point: item.nomination_point,
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
            // `Nominated Total volume ${(this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for contract point ${groupedBywarningLogHrWeeklyTemp[ig]?.contractPoint
            `Nominated Total volume ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues)) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for nomination point ${
              groupedBywarningLogHrWeeklyTemp[ig]?.nomination_point
            } and gas day ${groupedBywarningLogHrWeeklyTemp[ig]?.headDayUse}`
          )
        } else {
          warningLogDayWeek.push(
            // `Nominated Total energy ${(this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues))) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for contract point ${groupedBywarningLogHrWeeklyTemp[ig]?.contractPoint
            `Nominated Total energy ${this.formatNumberThreeDecimal(parseToNumber3Decimal(energyValues)) ?? ''} exceeds contracted value ${this.formatNumberThreeDecimal(parseToNumber3Decimal(groupedBywarningLogHrWeeklyTemp[ig]?.value) ?? '')} for nomination point ${
              groupedBywarningLogHrWeeklyTemp[ig]?.nomination_point
            } and gas day ${groupedBywarningLogHrWeeklyTemp[ig]?.headDayUse}`
          )
        }
      }
    }

    if (checkEmtry?.filter((f: any) => f === true).length === getsValue.length) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: 'Nomination Point does not match Emtry All.'
        },
        HttpStatus.FORBIDDEN
      )
    }

    // sheet 2 check
    const indexSheetLastValue = sheet2.data.findIndex((row: any) => row.includes('*'))
    let fullShee2Data = []
    for (let i = 0; i < sheet2?.data.length; i++) {
      if (i > 1 && i < indexSheetLastValue) {
        fullShee2Data.push(sheet2?.data[i])
        // CO2 2=>(v2_carbon_dioxide_min, v2_carbon_dioxide_max) Carbon dioxide
        // C1 3=>(v2_methane_min, v2_methane_max) Methane
        // C2 4=>
        // C3 5=>
        // iC4 6=>
        // nC4 7=>
        // iC5 8=>
        // nC5 9=>
        // C6 10=>
        // C7 11=>
        // C2+ 12=>(v2_c2_plus_min, v2_c2_plus_max) C2+
        // N2 13=>(v2_nitrogen_min, v2_nitrogen_max) Nitrogen
        // O2 14=>(v2_oxygen_min, v2_oxygen_max) Oxgen
        // H2S 15=>(v2_hydrogen_sulfide_min, v2_hydrogen_sulfide_max) Hydrogen Sulfide
        // S 16=>(v2_total_sulphur_min, v2_total_sulphur_max) Total Sulphur
        // Hg 17=>(v2_mercury_min, v2_mercury_max) Mercury
      }
    }

    let nominationFullJson = {
      shiperInfo: {
        '0': {
          'SHIPPER ID': sheet1?.data?.[2]?.[0]
        },
        '1': {
          'CONTRACT CODE': sheet1?.data?.[2]?.[1]
        },
        '2': {
          'START DATE': sheet1?.data?.[2]?.[2]
        }
      },
      headData: this.transformColumnDF(sheet1?.data?.[3]),
      valueData: this.transformColumn(fullDataRow).map((e: any) => e?.row),
      typeDoc: {
        columnType: this.transformColumn(caseData?.columnType),
        columnParkUnparkinstructedFlows: this.transformColumn(caseData?.columnParkUnparkinstructedFlows),
        columnWHV: this.transformColumn(caseData?.columnWHV),
        columnPointId: this.transformColumn(caseData?.columnPointId),
        columnPointIdConcept: this.transformColumn(caseData?.columnPointIdConcept),
        columnOther: this.transformColumn(caseData?.columnOther)
      }
    }
    // 1 = columnPointId
    // 2 = columnPointIdConcept
    // 3 = columnType มี NONTPA
    // 4 = columnParkUnparkinstructedFlows
    // 5 = columnWHV

    let nominationRowJson = [
      ...nominationFullJson?.typeDoc?.columnPointId.map((e: any) => {
        return {
          zone_text: e?.row['0'] || null,
          area_text: e?.row['2'] || null,
          entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
          data: e?.row,
          old_index: e?.ix,
          type: 1
        }
      }),
      ...nominationFullJson?.typeDoc?.columnPointIdConcept.map((e: any) => {
        return {
          zone_text: e?.row['0'] || null,
          area_text: e?.row['2'] || null,
          entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
          data: e?.row,
          old_index: e?.ix,
          type: 2
        }
      }),
      ...nominationFullJson?.typeDoc?.columnType.map((e: any) => {
        return {
          zone_text: e?.row['0'] || null,
          area_text: e?.row['2'] || null,
          entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
          data: e?.row,
          old_index: e?.ix,
          type: 3
        }
      }),
      ...nominationFullJson?.typeDoc?.columnParkUnparkinstructedFlows.map((e: any) => {
        return {
          zone_text: e?.row['0'] || null,
          area_text: e?.row['2'] || null,
          entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
          data: e?.row,
          old_index: e?.ix,
          type: 4
        }
      }),
      ...nominationFullJson?.typeDoc?.columnWHV.map((e: any) => {
        return {
          zone_text: e?.row['0'] || null,
          area_text: e?.row['2'] || null,
          entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
          data: e?.row,
          old_index: e?.ix,
          type: 5
        }
      }),
      ...nominationFullJson?.typeDoc?.columnOther.map((e: any) => {
        return {
          zone_text: e?.row['0'] || null,
          area_text: e?.row['2'] || null,
          entry_exit_id: e?.row['1'] === 'Supply' ? 1 : e?.row['1'] === 'Demand' ? 2 : null,
          data: e?.row,
          old_index: e?.ix,
          type: 6
        }
      })
    ]

    let nominationFullJsonSheet2 = {
      headData: this.transformColumnDF(sheet2?.data?.[1]),
      valueData: fullShee2Data.map((e: any) => this.transformColumnDF(e))
    }

    const responseUpFile = await uploadFilsTemp(fileOriginal)
    const nominationCount = await this.prisma.query_shipper_nomination_file.count({
      where: {
        nomination_type_id: nomination_type_id,
        create_date: {
          gte: getTodayStartAdd7().toDate(), // เริ่มต้นวันตามเวลาประเทศไทย
          lte: getTodayEndAdd7().toDate() // สิ้นสุดวันตามเวลาประเทศไทย
        }
        // contract_code_id: null // revers อย่างเดียว
        // AND: [
        //   {
        //     OR: [
        //       { del_flag: false },
        //       { del_flag: null }
        //     ]
        //   }
        // ],
      }
    })

    let nomination_code = `${getTodayNow().format('YYYYMMDD')}-${nomination_type_id === 1 ? 'DNM' : 'WNM'}-${String(nominationCount + 1).padStart(4, '0')}`

    let warningAll = [...sheet1Quality, ...sheet2Quality, ...warningLogHr, ...warningLogDayWeek, ...warningLogDay]

    // startDateExConv, checkType, renom, informationData,
    // // ===== STEP 29: WARNING HANDLING =====
    const finalData = {
      startDateExConv,
      nomination_code: nomination_code,
      dataInfo: {
        shipper_id,
        contract_code_id: null, // ไม่ใช้
        reserve_balancing_gas_contract_id: reserveBalancingGasContract?.id, // สัญญาปลอม
        checkType,
        nomination_type_id,
        files: responseUpFile?.file?.url,
        userId
      },
      nominationFullJson,
      nominationRowJson,
      nominationFullJsonSheet2,
      renom,
      sheet1Quality: sheet1Quality,
      sheet2Quality: sheet2Quality,
      overuseQuantity: warningLogDayWeek.length || warningLogDay.length > 0 ? true : null,
      overMaximumHourCapacityRight: warningLogHr.length > 0 || warningLogDayWeek.length > 0 ? true : null,
      warningLogHr: warningLogHr,
      warningLogDay: warningLogDay,
      warningLogDayWeek: warningLogDayWeek,
      warningAll
    }

    const newDate = getTodayNowAdd7()
    let checkVersion = null
    checkVersion = await this.prisma.query_shipper_nomination_file.findFirst({
      where: {
        // contract_code_id: Number(contract_code_id), // ไม่ใช้
        reserve_balancing_gas_contract_id: Number(reserveBalancingGasContract?.id), // สัญญาปลอม
        nomination_type_id: Number(nomination_type_id),
        gas_day: getTodayNowDDMMYYYYDfaultAdd7(startDateEx).toDate(),
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
        reserve_balancing_gas_contract: true
      }
    })

    // if (checkVersion?.query_shipper_nomination_status_id === 4 && checkVersion?.contract_code?.status_capacity_request_management_id !== 2) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.FORBIDDEN,
    //       error: 'Nomination status Cancelled.',
    //     },
    //     HttpStatus.FORBIDDEN,
    //   );
    // }

    if (nomination_type_id === 1) {
      const nominationData = nominationFullJson?.typeDoc?.columnPointId?.map((e: any) => e?.row)
      const nonTpaData = nominationFullJson?.typeDoc?.columnType?.map((e: any) => e?.row)
      for (let i = 0; i < nonTpaData.length; i++) {
        const nTpa = nonTpaData[i][3]
        const findNom = nonTpa?.find((f: any) => {
          return f?.non_tpa_point_name === nTpa
        })
        const findNomName = findNom?.nomination_point?.nomination_point || null
        const findNomData = nominationData?.find((f: any) => {
          return f[3] === findNomName && f[9] === 'MMBTU/D'
        })
        if (findNomData) {
          if (!!nonTpaData[i]?.[38] && !!findNomData?.[38] && Number(nonTpaData[i]?.[38]) > Number(findNomData?.[38])) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
              },
              HttpStatus.BAD_REQUEST
            )
          }
        } else {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
    } else {
      // weekly
      const nominationData = nominationFullJson?.typeDoc?.columnPointId?.map((e: any) => e?.row)
      const nonTpaData = nominationFullJson?.typeDoc?.columnType?.map((e: any) => e?.row)
      for (let i = 0; i < nonTpaData.length; i++) {
        const nTpa = nonTpaData[i][3]
        const findNom = nonTpa?.find((f: any) => {
          return f?.non_tpa_point_name === nTpa
        })
        const findNomName = findNom?.nomination_point?.nomination_point || null
        const findNomData = nominationData?.find((f: any) => {
          return f[3] === findNomName
        })
        if (findNomData) {
          if (!!nonTpaData[i]?.[14] && !!findNomData?.[14] && Number(nonTpaData[i]?.[14]) > Number(findNomData?.[14])) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
              },
              HttpStatus.BAD_REQUEST
            )
          }
          if (!!nonTpaData[i]?.[15] && !!findNomData?.[15] && Number(nonTpaData[i]?.[15]) > Number(findNomData?.[15])) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
              },
              HttpStatus.BAD_REQUEST
            )
          }
          if (!!nonTpaData[i]?.[16] && !!findNomData?.[16] && Number(nonTpaData[i]?.[16]) > Number(findNomData?.[16])) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
              },
              HttpStatus.BAD_REQUEST
            )
          }
          if (!!nonTpaData[i]?.[17] && !!findNomData?.[17] && Number(nonTpaData[i]?.[17]) > Number(findNomData?.[17])) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
              },
              HttpStatus.BAD_REQUEST
            )
          }
          if (!!nonTpaData[i]?.[18] && !!findNomData?.[18] && Number(nonTpaData[i]?.[18]) > Number(findNomData?.[18])) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
              },
              HttpStatus.BAD_REQUEST
            )
          }
          if (!!nonTpaData[i]?.[19] && !!findNomData?.[19] && Number(nonTpaData[i]?.[19]) > Number(findNomData?.[19])) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
              },
              HttpStatus.BAD_REQUEST
            )
          }
          if (!!nonTpaData[i]?.[20] && !!findNomData?.[20] && Number(nonTpaData[i]?.[20]) > Number(findNomData?.[20])) {
            throw new HttpException(
              {
                status: HttpStatus.BAD_REQUEST,
                error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
              },
              HttpStatus.BAD_REQUEST
            )
          }
        } else {
          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              error: `${findNomData[3]} must be greater than or equal ${nonTpaData[i][3]}`
            },
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }

    // const cut3 = null

    // throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'test. REV',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );

    if (checkVersion) {
      // update
      const queryShipperNominationFile = await this.prisma.query_shipper_nomination_file.update({
        where: {
          id: Number(checkVersion?.id ?? -1)
        },
        data: {
          query_shipper_nomination_file_renom: {
            connect: {
              id: finalData?.renom ? 1 : 2
            }
          },
          entry_quality: finalData?.sheet1Quality.length > 0 ? true : null,
          overuse_quantity: finalData?.overuseQuantity,
          over_maximum_hour_capacity_right: finalData?.overMaximumHourCapacityRight,
          gas_day: getTodayNowDDMMYYYYDfaultAdd7(startDateEx).toDate(),
          update_date_num: newDate.unix(),
          submitted_timestamp: newDate.toDate(),
          update_date: newDate.toDate(),
          update_by_account: {
            connect: {
              id: Number(userId)
            }
          },
          query_shipper_nomination_status: {
            connect: {
              id: 1
            }
          }
        }
      })

      const flaseVersion = await this.prisma.nomination_version.updateMany({
        where: {
          query_shipper_nomination_file_id: Number(checkVersion?.id ?? -1)
        },
        data: {
          flag_use: false
        }
      })

      const nominationVersionCount = await this.prisma.nomination_version.count({
        where: {
          query_shipper_nomination_file_id: queryShipperNominationFile?.id
        }
      })

      // version
      const nominationVersion = await this.prisma.nomination_version.create({
        data: {
          version: `V.${nominationVersionCount + 1}`,
          query_shipper_nomination_file: {
            connect: {
              id: queryShipperNominationFile?.id
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

      // json full
      const fullJson = await this.prisma.nomination_full_json.create({
        data: {
          data_temp: JSON.stringify(nominationFullJson),
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
          data_temp: JSON.stringify(nominationFullJsonSheet2),
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

      // json row
      const rowJson = await this.prisma.nomination_row_json.createMany({
        data: (nominationRowJson || []).map((e: any) => {
          return {
            nomination_version_id: nominationVersion?.id,
            flag_use: true,
            zone_text: e?.zone_text,
            area_text: e?.area_text,
            entry_exit_id: e?.entry_exit_id,
            query_shipper_nomination_type_id: e?.type,
            data_temp: JSON.stringify(e?.data),
            old_index: e?.old_index,
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by: Number(userId)
          }
        })
      })

      // warning
      const submissionFile = await this.prisma.submission_comment_query_shipper_nomination_file.createMany({
        data: (warningAll || []).map((e: any) => {
          return {
            remark: e,
            query_shipper_nomination_file_id: Number(queryShipperNominationFile?.id),
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by: Number(userId)
          }
        })
      })

      // file
      const queryShipperNominationFileUrl = await this.prisma.query_shipper_nomination_file_url.create({
        data: {
          url: finalData?.dataInfo?.files,
          query_shipper_nomination_file: {
            connect: {
              id: queryShipperNominationFile?.id
            }
          },
          nomination_version: {
            connect: {
              id: nominationVersion?.id
            }
          },
          query_shipper_nomination_status: {
            connect: {
              id: queryShipperNominationFile?.query_shipper_nomination_status_id
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
      if (!!comment) {
        await queryShipperNominationFileService.comments(
          {
            reasons: false,
            comment: comment,
            query_shipper_nomination_file_id: Number(checkVersion?.id)
          },
          userId
        )
      }
    } else {
      // ไม่มี create

      await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.query_shipper_nomination_file','id'),
          COALESCE((SELECT MAX(id) FROM public.query_shipper_nomination_file), 0),
          true
        )
      `)
      await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.nomination_version','id'),
          COALESCE((SELECT MAX(id) FROM public.nomination_version), 0),
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
      await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.submission_comment_query_shipper_nomination_file','id'),
          COALESCE((SELECT MAX(id) FROM public.submission_comment_query_shipper_nomination_file), 0),
          true
        )
      `)
      await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.query_shipper_nomination_file_url','id'),
          COALESCE((SELECT MAX(id) FROM public.query_shipper_nomination_file_url), 0),
          true
        )
      `)

      const queryShipperNominationFile = await this.prisma.query_shipper_nomination_file.create({
        data: {
          entry_quality: finalData?.sheet1Quality.length > 0 ? true : null,
          overuse_quantity: finalData?.overuseQuantity,
          over_maximum_hour_capacity_right: finalData?.overMaximumHourCapacityRight,
          nomination_code: nomination_code,
          nomination_type: {
            connect: {
              id: Number(nomination_type_id)
            }
          },
          query_shipper_nomination_status: {
            connect: {
              id: 1
            }
          },
          reserve_balancing_gas_contract: {
            connect: {
              id: Number(reserveBalancingGasContract?.id)
            }
          },
          group: {
            connect: {
              id: Number(shipper_id)
            }
          },
          query_shipper_nomination_file_renom: {
            connect: {
              id: finalData?.renom ? 1 : 2
            }
          },
          gas_day: getTodayNowDDMMYYYYDfaultAdd7(startDateEx).toDate(),
          create_date_num: newDate.unix(),
          submitted_timestamp: newDate.toDate(),
          create_date: newDate.toDate(),
          create_by_account: {
            connect: {
              id: Number(userId)
            }
          }
        }
      })

      // version
      const nominationVersion = await this.prisma.nomination_version.create({
        data: {
          version: 'V.1',
          query_shipper_nomination_file: {
            connect: {
              id: queryShipperNominationFile?.id
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

      const fullJson = await this.prisma.nomination_full_json.create({
        data: {
          data_temp: JSON.stringify(nominationFullJson),
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
          data_temp: JSON.stringify(nominationFullJsonSheet2),
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

      // json row
      const rowJson = await this.prisma.nomination_row_json.createMany({
        data: (nominationRowJson || []).map((e: any) => {
          return {
            nomination_version_id: nominationVersion?.id,
            flag_use: true,
            zone_text: e?.zone_text,
            area_text: e?.area_text,
            entry_exit_id: e?.entry_exit_id,
            query_shipper_nomination_type_id: e?.type,
            data_temp: JSON.stringify(e?.data),
            old_index: e?.old_index,
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by: Number(userId)
          }
        })
      })

      // warning
      const submissionFile = await this.prisma.submission_comment_query_shipper_nomination_file.createMany({
        data: (warningAll || []).map((e: any) => {
          return {
            remark: e,
            query_shipper_nomination_file_id: Number(queryShipperNominationFile?.id),
            create_date_num: newDate.unix(),
            create_date: newDate.toDate(),
            create_by: Number(userId)
          }
        })
      })

      // file
      const queryShipperNominationFileUrl = await this.prisma.query_shipper_nomination_file_url.create({
        data: {
          url: finalData?.dataInfo?.files,
          query_shipper_nomination_file: {
            connect: {
              id: queryShipperNominationFile?.id
            }
          },
          nomination_version: {
            connect: {
              id: nominationVersion?.id
            }
          },
          query_shipper_nomination_status: {
            connect: {
              id: queryShipperNominationFile?.query_shipper_nomination_status_id
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

      if (!!comment) {
        await queryShipperNominationFileService.comments(
          {
            reasons: false,
            comment: comment,
            query_shipper_nomination_file_id: queryShipperNominationFile?.id
          },
          userId
        )
      }
    }

    // ===== STEP 36: RETURN FINAL RESULT =====
    // Return processed data with all validation results and saved information
    return finalData
  }
}
