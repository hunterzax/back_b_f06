import {getDayjsFromHHmm, getTodayEndAdd7, getTodayEndYYYYMMDDDfaultAdd7, getTodayNowAdd7, getTodayNowDDMMYYYYHHmmDfaultAdd7, getTodayNowYYYYMMDDDfaultAdd7, getTodayNowYYYYMMDDHHmmssDfaultAdd7, getTodayStartAdd7, getTodayStartYYYYMMDDDfaultAdd7} from './date.util'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import {PrismaService} from 'prisma/prisma.service'
import {HttpException, HttpStatus} from '@nestjs/common'
import {isMatch} from './allocation.util'
import {Prisma} from '@prisma/client'
import {parseToNumber, parseToNumber6Decimal} from './number.util'
import {MeteredMicroService} from 'src/grpc/metered-service.service'
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isSameOrBefore)
dayjs.tz.setDefault('Asia/Bangkok')

// Mapping of property names to their corresponding tags
export const accImbValueMappings = {
  all: 'accImb_or_accImbInv',
  high_max_percentage: 'high_max_percentage',
  high_dd_percentage: 'high_dd_percentage',
  high_red_percentage: 'high_red_percentage',
  high_orange_percentage: 'high_orange_percentage',
  high_alert_percentage: 'high_alert_percentage',
  low_max_percentage: 'low_max_percentage',
  low_dd_percentage: 'low_dd_percentage',
  low_red_percentage: 'low_red_percentage',
  low_orange_percentage: 'low_orange_percentage',
  low_alert_percentage: 'low_alert_percentage',
  high_alert: 'high_alert',
  high_orange: 'high_orange',
  high_red: 'high_red',
  high_dd: 'high_dd',
  high_max: 'high_max',
  baseInv: 'baseInv',
  accImb_or_accImbInv: 'accImb_or_accImbInv',
  accImb_or_accImbInv_percentage: 'accImb_or_accImbInv_percentage',
  low_alert: 'low_alert',
  low_orange: 'low_orange',
  low_red: 'low_red',
  low_dd: 'low_dd',
  low_max: 'low_max'
}

function getLatestModeZone(modeZone: any[], limitTimestamp?: dayjs.Dayjs) {
  const modeZoneBeforeTimestamp = limitTimestamp?.isValid() ? 
    modeZone.filter((item: any) => {
      const createDayjs = dayjs(item.create_date)
      return createDayjs.isValid() ? createDayjs.isSameOrBefore(limitTimestamp) : true
    })
    : modeZone
  return modeZoneBeforeTimestamp.reduce((acc: any[], current: any) => {
    const existingIndex = acc.findIndex((item) => isMatch(item.zone?.name, current.zone?.name))

    if (existingIndex < 0) {
      acc.push(current)
    } else if (current.start_date > acc[existingIndex]?.start_date) {
      acc[existingIndex] = current
    }
    else if (current.start_date == acc[existingIndex]?.start_date && dayjs(current.create_date).isAfter(dayjs(acc[existingIndex]?.create_date))) {
      acc[existingIndex] = current
    }

    return acc
  }, [])
}

export function groupAndFilterLatestData(resData: any[], baseReply: any[], accumReply: any[], meteringPointList: any[]) {
  // Create a map to store grouped data
  const groupedMap = new Map()
  console.log('resData : ', resData);

  // Process resData (intraday_base_inentory)
  if (resData && Array.isArray(resData)) {
    resData.forEach((item) => {
      const gasDay = item.gas_day_text
      let gasHour = item.gas_hour || null
      let timestamp = item.timestamp
      if (gasHour) {
        const gasHourInDateFormat = getDayjsFromHHmm(`${gasHour}`.trim())
        if (gasHourInDateFormat.isValid()) {
          gasHour = gasHourInDateFormat.format('H')
        }
      }
      if (timestamp) {
        const timestampInOldFormat = dayjs(timestamp.trim(), 'DD/MM/YYYY HH:mm')
        if (timestampInOldFormat.isValid()) {
          timestamp = timestampInOldFormat.format('YYYY-MM-DD HH:mm:ss')
        }
      }
      const itemTimestamp = getTimestampValue(timestamp)
      const zone = item.zone_text
      const mode = item.mode
      const key = `${gasDay}_${gasHour || 'null'}|${zone}|${mode}|${itemTimestamp}`

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          gasDay,
          gasHour,
          zone,
          mode,
          resData: null,
          baseReply: null,
          latestTimestamp: timestamp
        })
      }
      const group = groupedMap.get(key)

      if (baseReply && Array.isArray(baseReply)) {
        const baseReplyList = baseReply.filter((baseItem) => baseItem.gasDay == gasDay && baseItem.gasHour == gasHour && baseItem.zone == zone && baseItem.mode == mode)

        const latestBaseReply =
          baseReplyList.length > 0
            ? baseReplyList.reduce((latest, baseItem) => {
                const baseTimestamp = getTimestampValue(baseItem.insert_timestamp)
                if (baseTimestamp <= itemTimestamp && (!latest || baseTimestamp > getTimestampValue(latest.insert_timestamp))) {
                  return baseItem
                }
                return latest
              }, null)
            : null

        if (latestBaseReply) {
          group.baseReply = item
        }
      }

      group.resData = item
    })
  }

  // Process baseReply (tpa_metering.base_inventory)
  if (baseReply && Array.isArray(baseReply)) {
    baseReply.forEach((item) => {
      const gasDay = item.gasDay
      const gasHour = item.gasHour || null
      const insertTimestamp = item.insert_timestamp
      const itemTimestamp = getTimestampValue(item.insert_timestamp)
      const zone = item.zone
      const mode = item.mode
      const active_mode = item.activate || false
      const key = `${gasDay}_${gasHour || 'null'}|${zone}|${mode}|${itemTimestamp}|${active_mode}`
      // console.log('- : ', key);
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          gasDay,
          gasHour,
          zone,
          mode,
          resData: null,
          baseReply: null,
          latestTimestamp: insertTimestamp
        })
      }

      const group = groupedMap.get(key)

      if (resData && Array.isArray(resData)) {
        const resDataList = resData.filter((resItem) => {
          let resGasHour = resItem.gas_hour ?? null
          if (resGasHour) {
            const gasHourInDateFormat = getDayjsFromHHmm(`${resGasHour}`.trim())
            if (gasHourInDateFormat.isValid()) {
              resGasHour = gasHourInDateFormat.format('H')
            }
          }
          return resItem.gas_day_text == gasDay && resGasHour == `${gasHour}` && resItem.zone_text == zone && resItem.mode == mode
          // return resItem.gas_day_text == gasDay && resGasHour == `${gasHour}` && resItem.zone_text == zone
        })

        const itemTimestamp = getTimestampValue(insertTimestamp)
        const latestResData =
          resDataList.length > 0
            ? resDataList.reduce((latest, resItem) => {
                let timestamp = latest.timestamp
                if (timestamp) {
                  const timestampInOldFormat = dayjs(timestamp.trim(), 'DD/MM/YYYY HH:mm')
                  if (timestampInOldFormat.isValid()) {
                    timestamp = timestampInOldFormat.format('YYYY-MM-DD HH:mm:ss')
                  }
                }
                const resTimestamp = getTimestampValue(resItem.timestamp)
                if (resTimestamp <= itemTimestamp && (!latest || resTimestamp > getTimestampValue(timestamp))) {
                  return resItem
                }
                return latest
              }, null)
            : null

        if (latestResData) {
          group.resData = item
        }
      }
      group.baseReply = item
    })
  }

  // Convert grouped data to the desired format
  let heatingValueOFOIF: any = {}
  meteringPointList.map((item: any) => {
    if (item.hv_type_id == 2 && item.group?.id_name) {
      heatingValueOFOIF[`heatingValue_OFOIF_${item.group.id_name}`] = item.meterData?.heatingValue
    } else {
      //if(item.hv_type_id == 1) {
      heatingValueOFOIF.heatingValue_OFOIF_system = item.meterData?.heatingValue
    }
  })
  console.log('groupedMap : ', groupedMap);
  const result = Array.from(groupedMap.values()).map((group) => {
    const resDataItem = group.resData
    const baseReplyItem = group.baseReply
    const active_mode = group.resData?.active_mode || group.baseReply?.active_mode
    // const accumReplyItem = group.accumReply;
    const accumReplyInGasDay = accumReply.filter((item: any) => item.gasDay === group.gasDay && compareTimestamps(group.latestTimestamp, item.insert_timestamp) >= 0)
    const accumReplyItem =
      accumReplyInGasDay.length > 0
        ? accumReplyInGasDay.reduce((latest, current) => {
            return compareTimestamps(current.insert_timestamp, latest.insert_timestamp) > 0 ? current : latest
          })
        : null

    // Create the result object based on the desired format
    return {
      active_mode: active_mode || false,
      gas_day_text_DDMMYY: getTodayNowYYYYMMDDDfaultAdd7(group && group?.gasDay || undefined).format('DD/MM/YYYY'),
      id: resDataItem?.id || null,
      gas_day: resDataItem?.gas_day || getTodayNowYYYYMMDDDfaultAdd7(baseReplyItem?.gasDay).toISOString() || null,
      gas_day_text: group.gasDay || null,
      // gas_hour: group.gasHour || null,
      gas_hour: group.gasHour ? `${`${group.gasHour}`.padStart(2, '0')}:00` : null,
      timestamp: group.latestTimestamp || null,
      zone_text: group.zone || null,
      mode: group.mode || null,
      hv: resDataItem?.hv || baseReplyItem?.hv || null,
      base_inventory_value: resDataItem?.base_inventory_value || baseReplyItem?.base_inventory || null,
      high_difficult_day: resDataItem?.high_difficult_day || baseReplyItem?.high_threshold_dd || null,
      high_red: resDataItem?.high_red || baseReplyItem?.high_threshold_red || null,
      high_orange: resDataItem?.high_orange || baseReplyItem?.high_threshold_orange || null,
      high_max: resDataItem?.high_max || baseReplyItem?.high_threshold_max || null,
      alert_high: resDataItem?.alert_high || baseReplyItem?.high_threshold_alert || null,
      alert_low: resDataItem?.alert_low || baseReplyItem?.low_threshold_alert || null,
      low_orange: resDataItem?.low_orange || baseReplyItem?.low_threshold_orange || null,
      low_red: resDataItem?.low_red || baseReplyItem?.low_threshold_red || null,
      low_difficult_day: resDataItem?.low_difficult_day || baseReplyItem?.low_threshold_dd || null,
      low_max: resDataItem?.low_max || baseReplyItem?.low_threshold_max || null,
      totalInv: group && (group?.zone?.trim()?.toUpperCase() === 'EAST' ? accumReplyItem?.east_value || null : group?.zone?.trim()?.toUpperCase() === 'WEST' ? accumReplyItem?.west_value || null : null) || null,
      del_flag: resDataItem?.del_flag || null,
      active: resDataItem?.active || null,
      create_date: resDataItem?.create_date || null,
      update_date: resDataItem?.update_date || null,
      create_date_num: resDataItem?.create_date_num || null,
      update_date_num: resDataItem?.update_date_num || null,
      create_by: resDataItem?.create_by || null,
      update_by: resDataItem?.update_by || null,
      create_by_account: resDataItem?.create_by_account || null,
      update_by_account: resDataItem?.update_by_account || null,
      zoneObj: resDataItem?.zoneObj || null,
      // Add baseReply and accumReply data if needed
      baseReply: baseReplyItem,
      // accumReply: accumReplyItem
      ...heatingValueOFOIF
    }
  })

  // Sort by gas_day_text and gas_hour
  return result.sort((a, b) => {
    if (a.gas_day_text !== b.gas_day_text) {
      return new Date(a.gas_day_text).getTime() - new Date(b.gas_day_text).getTime()
    }
    if (a.gas_hour !== b.gas_hour) {
      return String(a.gas_hour || '').localeCompare(String(b.gas_hour || ''))
    }
    return 0
  })
}


export function getTimestampValue(timestamp: any): number {
  // Handle different timestamp formats
  if (typeof timestamp === 'number') {
    return timestamp
  }
  if (typeof timestamp === 'string') {
    const dayjsTimestamp = dayjs(timestamp, 'YYYY-MM-DD HH:mm:ss')
    if (dayjsTimestamp.isValid()) {
      return dayjsTimestamp.valueOf()
    }

    // Try to parse as date string
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      return date.getTime()
    }
    // Try to parse as number string
    const num = parseFloat(timestamp)
    if (!isNaN(num)) {
      return num
    }
  }
  return 0
}

export function compareTimestamps(timestamp1: any, timestamp2: any): number {
  const val1 = getTimestampValue(timestamp1)
  const val2 = getTimestampValue(timestamp2)

  return val1 - val2
}

// export function formatDateDDMMYY(dateString: string): string {
//   if (!dateString) return '';

//   try {
//     const date = new Date(dateString);
//     if (isNaN(date.getTime())) return '';

//     const day = date.getDate().toString().padStart(2, '0');
//     const month = (date.getMonth() + 1).toString().padStart(2, '0');
//     const year = date.getFullYear().toString().slice(-2);

//     return `${day}/${month}/${year}`;
//   } catch (error) {
//     return '';
//   }
// }

export function getGasHourValue(gasHour: any): number {
  if (!gasHour) return 0
  if (typeof gasHour === 'number') {
    return gasHour
  }
  if (typeof gasHour === 'string') {
    // Try to parse as HH:MM format
    const parts = gasHour.split(':')
    if (parts.length === 2) {
      const hours = parseInt(parts[0], 10)
      const minutes = parseInt(parts[1], 10)
      if (!isNaN(hours) && !isNaN(minutes)) {
        return hours * 60 + minutes // Convert to minutes for comparison
      }
    }
    // Try to parse as number string
    const num = parseFloat(gasHour)
    if (!isNaN(num)) {
      return num
    }
  }
  return 0
}

export function compareGasHour(gasHour1: any, gasHour2: any): number {
  // Handle different gas hour formats

  const val1 = getGasHourValue(gasHour1)
  const val2 = getGasHourValue(gasHour2)

  return val1 - val2
}

export async function findMinMaxExeDate(prisma: PrismaService, start_date: any, end_date: any) {
  try {
    const now = dayjs()
    const todayStartf = start_date == 'undefined' ? getTodayStartAdd7() : getTodayStartYYYYMMDDDfaultAdd7(start_date)
    const todayEndf = end_date == 'undefined' ? getTodayEndAdd7() : getTodayEndYYYYMMDDDfaultAdd7(end_date)

    if(todayStartf.isValid() && todayStartf.isAfter(now, 'day')) {
      return {
        minDate: null,
        maxDate: null
      }
    }

    const executeEod = await prisma.execute_eod.findMany({
      where: {
        AND: [
          {
            start_date_date: {
              lte: todayEndf.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date_date: {
                  gte: todayStartf.toDate()
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ],
        status: 'OK'
      }
    })
    // execute_timestamp

    const nexecuteEod = executeEod
      ?.flatMap((e: any) => {
        const {start_date_date, end_date_date} = e
        return [start_date_date, end_date_date]
      })
      ?.filter((f: any) => !!f)

    const parsed = nexecuteEod.map((d) => dayjs(d)).filter((d) => d.isValid())

    const minDateFromExe = dayjs.min(parsed)!
    const maxDateFromExe = dayjs.max(parsed)!

    const minDate = minDateFromExe ? dayjs.max([minDateFromExe, todayStartf]) : dayjs.min([now, todayStartf])
    const maxDate = maxDateFromExe ? dayjs.min([maxDateFromExe, todayEndf]) : dayjs.min([now.endOf('day'), todayEndf])

    return {
      minDate,
      maxDate
    }
  } catch (error) {
    return {
      minDate: null,
      maxDate: null
    }
  }
}

// Helper function to extract value by tag
export function getValueByTag(thisHourData: any, tag: string) {
  return thisHourData?.values?.find((f: any) => f?.tag === tag)?.value ?? null
}

export async function getIntradayBaseInentoryFromWebService(prisma: PrismaService, meteredMicroService: MeteredMicroService, payload: any, userId: any) {
  const {gas_day, zone, mode, active_mode, latest_daily_version, latest_hourly_version, timestamp, start_hour, end_hour, skip, limit} = payload

  if (!skip && !limit) {
    throw new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: 'Invalid input data.'
      },
      HttpStatus.BAD_REQUEST
    )
  }

  try {
    if (!Number.isInteger(skip) || skip < 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'skip must be a positive number.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  } catch (error) {
    throw new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: 'skip must be a positive number.'
      },
      HttpStatus.BAD_REQUEST
    )
  }

  try {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'limit must be a positive number.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  } catch (error) {
    throw new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: 'limit must be a positive number.'
      },
      HttpStatus.BAD_REQUEST
    )
  }

  let startHour = 1
  let endHour = 24
  if (start_hour) {
    try {
      startHour = Number(start_hour)
      if (!Number.isInteger(startHour)) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Hours must be valid numbers.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      if (startHour < 1 || startHour > 24) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Start hour must be between 1 and 24.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Hours must be valid numbers.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  if (end_hour) {
    try {
      endHour = Number(end_hour)
      if (!Number.isInteger(endHour)) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Hours must be valid numbers.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      if (endHour < 1 || endHour > 24) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'End hour must be between 1 and 24.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Hours must be valid numbers.'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  if (startHour > endHour) {
    throw new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: 'End hour must be greater than start hour.'
      },
      HttpStatus.BAD_REQUEST
    )
  }

  const gasDayStart = getTodayStartYYYYMMDDDfaultAdd7(gas_day).toDate()
  const gasDayEnd = getTodayEndYYYYMMDDDfaultAdd7(gas_day).toDate()
  const todayModeZone = await prisma.mode_zone_base_inventory.findMany({
    where: {
      start_date: {
        gte: gasDayStart,
        lte: gasDayEnd
      }
    },
    include: {
      zone: true,
      mode: true,
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
    orderBy: [
      {
      start_date: 'desc',
    },
    {create_date: 'desc',}
    ],
    
  })

  let lastetModeBeforeToday = []

  const modeZone = await prisma.mode_zone_base_inventory.findMany({
    where: {
      start_date: {
        lt: gasDayStart
      }
    },
    include: {
      zone: true,
      mode: true,
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
    orderBy: [
      {
      start_date: 'desc',
    },
    {create_date: 'desc',}
    ],
  })
  console.log('modeZone : ', modeZone);
  lastetModeBeforeToday = modeZone.reduce((acc: any[], current: any) => {
    const existingIndex = acc.findIndex((item) => isMatch(item.zone?.name, current.zone?.name))

    if (existingIndex < 0) {
      acc.push(current)
    } else if (current.start_date > acc[existingIndex]?.start_date) {
      acc[existingIndex] = current
    }
    else if (current.start_date == acc[existingIndex]?.start_date && dayjs(current.create_date).isAfter(dayjs(acc[existingIndex]?.create_date))) {
      acc[existingIndex] = current
    }

    return acc
  }, [])
  console.log('lastetModeBeforeToday : ', lastetModeBeforeToday);
  const meteredMicroData = await meteredMicroService.sendMessage(
    JSON.stringify({
      case: 'getLast',
      mode: 'metering',

      start_date: gas_day,
      end_date: gas_day
    })
  )
  const meterReply = (!!meteredMicroData?.reply && JSON.parse(meteredMicroData?.reply)) || null

  let meteringPointList = []
  if (meterReply && Array.isArray(meterReply)) {
    const hvMeterRaw = await prisma.hv_for_peration_flow_and_instructed_flow.findMany({
      where: {
        start_date: {
          lte: getTodayNowYYYYMMDDDfaultAdd7(gas_day).toDate()
        }
      },
      include: {
        group: true,
        hv_type: true,
        metering_point: true,
        concept_point: true
      },
      orderBy: {
        start_date: 'desc'
      }
    })

    // Get the latest record for each group_id where start_date is same or before gas_day
    const hvMeter = hvMeterRaw.reduce((acc, record) => {
      const groupId = record.group_id
      if (!acc[groupId] || dayjs(record.start_date).isAfter(dayjs(acc[groupId].start_date))) {
        acc[groupId] = record
      }
      return acc
    }, {})
    // Get unique meteringPoint from hvMeter
    const hvMeterValues = Object.values(hvMeter)
    meteringPointList = hvMeterValues.map((item: any) => {
      const meterObj = meterReply.find((meterData: any) => (item.metering_point?.metered_point_name || item.concept_point?.concept_point) == meterData.meteringPointId)
      return {
        ...item,
        meterData: meterObj
      }
    })
  }
  const baseMicroData = await meteredMicroService.sendMessage(
    JSON.stringify({
      case: 'get-base-inventory',
      mode: 'metering',
      gas_day: gas_day
      // start_date: gas_day,
      // end_date: gas_day,
    })
  )
  let baseReply = (!!baseMicroData?.reply && JSON.parse(baseMicroData?.reply)) || null
  if (!Array.isArray(baseReply)) {
    baseReply = []
  }
    console.log('baseReply : ', baseReply);
    console.log('baseReply : ', baseReply?.filter((f:any) => f?.zone === "East" && f?.activate));

  const accumMicroData = await meteredMicroService.sendMessage(
    JSON.stringify({
      case: 'get-accum-inventory',
      mode: 'metering',
      gas_day: gas_day
      // start_date: gas_day,
      // end_date: gas_day,
    })
  )

  let accumReply = (!!accumMicroData?.reply && JSON.parse(accumMicroData?.reply)) || null
  if (!Array.isArray(accumReply)) {
    accumReply = []
  }

  // generate gasHour every minute from 00:00 to 23:59 in format HH:MM between startHour and endHour
  const gasHourList: string[] = []
  const gasHourOnlyHourList: string[] = []
  for (let i = startHour - 1; i < endHour; i++) {
    gasHourOnlyHourList.push(`${i + 1}`)
    for (let j = 0; j < 60; j++) {
      gasHourList.push(`${String(i).padStart(2, '0')}:${String(j).padStart(2, '0')}`)
    }
  }

  const andInWhere: Prisma.intraday_base_inentoryWhereInput[] = [
    {
      OR: [
        {
          gas_hour: {
            in: gasHourList
          }
        },
        {
          gas_hour: {
            in: gasHourOnlyHourList
          }
        }
      ]
    }
  ]
  if (gas_day) {
    baseReply = baseReply?.filter((item: any) => item.gasDay === gas_day)
    accumReply = accumReply?.filter((item: any) => item.gasDay === gas_day)
    andInWhere.push({
      gas_day_text: gas_day
    })
  }
  if (zone) {
    baseReply = baseReply?.filter((item: any) => isMatch(item.zone, zone))
    andInWhere.push({
      zone_text: {
        equals: zone || "-1",
        mode: 'insensitive'
      }
    })
  }

  if (mode) {
    baseReply = baseReply?.filter((item: any) => isMatch(item.mode, mode))
    andInWhere.push({
      mode: {
        equals: mode,
        mode: 'insensitive'
      }
    })
  }



  let resData = await prisma.intraday_base_inentory.findMany({
    where: {
      AND: andInWhere
    },
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
  })
 
    const filteredData = []
    
    for (const item of (baseReply || [])) {
      const modeOfThisHourAndZone = todayModeZone.filter((modeZone: any) => {
        const gasHour = parseToNumber(
          dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')
        )

        return (
          gasHour == item.gasHour &&
          isMatch(modeZone && modeZone?.zone?.name || null, item.zone)
        )
      })

      let activeMode = undefined

      if (modeOfThisHourAndZone.length > 0) {
        // มี mode ของ gasHour + zone นี้ -> ใช้ logic เดิม
        modeOfThisHourAndZone.sort((a: any, b: any) => {
          const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))

          if (startDateDiff !== 0) {
            return startDateDiff
          }

          return dayjs(b.create_date).diff(dayjs(a.create_date))
        })

        activeMode = modeOfThisHourAndZone[0]
      } else {
        // ==========================================
        // ไม่มี Mode ของ Gas Hour นี้
        // ถ้า activate เดิมเป็น true ให้คง true ไว้
        // ==========================================
        if (item?.activate === true) {
          filteredData.push({
            ...item,
            active_mode: true,
            activate: true,
          })

          continue
        }

        // activate เดิมไม่ใช่ true
        // ค่อยหา mode ก่อนหน้าเหมือน logic เดิม
        const todayModeOfZoneBeforeThisHour = todayModeZone.filter(
          (modeZone: any) => {
            const gasHour =
              parseToNumber(
                dayjs(modeZone.start_date)
                  .tz('Asia/Bangkok')
                  .format('H')
              ) + 1

            return (
              gasHour < item.gasHour &&
              isMatch(modeZone && modeZone?.zone?.name || null, item.zone)
            )
          }
        )

        if (todayModeOfZoneBeforeThisHour.length > 0) {
          todayModeOfZoneBeforeThisHour.sort((a: any, b: any) => {
            return dayjs(b.start_date).diff(dayjs(a.start_date))
          })

          activeMode = todayModeOfZoneBeforeThisHour[0]
        } else {
          activeMode = lastetModeBeforeToday.find((f: any) =>
            isMatch(f?.zone?.name, item.zone)
          )
        }
      }

      // มี Mode -> ตรวจ mode ตามเงื่อนไขเดิม
      if (isMatch(activeMode?.mode?.mode, item.mode)) {
        filteredData.push({
          ...item,
          active_mode: true,
          activate: true,
        })
      }
    }

    // console.log('1.1baseReply : ', baseReply);
    // console.log('1.1baseReply : ', baseReply?.filter((f:any) => f?.zone === "East" && f?.activate));
    // console.log('1.filteredData : ', filteredData?.filter((f:any) => f?.zone === "East"));

    baseReply = (baseReply || []).map((e:any) => {

      return {
        ...e,
        // active_mode: !!filteredData?.find((f:any) => f?.["_id"]?.["$oid"] === e?.["_id"]?.["$oid"])
        active_mode: (!!filteredData?.find((f:any) => f?.["_id"]?.["$oid"] === e?.["_id"]?.["$oid"])) && (e.activate == true || e.activate == 'true'),
        activate: (!!filteredData?.find((f:any) => f?.["_id"]?.["$oid"] === e?.["_id"]?.["$oid"])) && (e.activate == true || e.activate == 'true'),
      }
    })

    //  console.log('- active_mode 2baseReply : ', baseReply?.filter((f:any) => f?.zone === "East" && f?.active_mode));
    // console.log('- activate 2baseReply : ', baseReply?.filter((f:any) => f?.zone === "East" && f?.activate));

    const filteredResData = []
    for (const item of resData) {
      const itemGasHour = getGasHourValue(item.gas_hour)
      const modeOfThisHourAndZone = todayModeZone.filter((modeZone: any) => {
        const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H'))
        return gasHour == itemGasHour && isMatch(modeZone?.zone?.name, item.zone_text)
      })

      let activeMode = undefined
      if (modeOfThisHourAndZone.length > 0) {
        // if must prorate do it here
        // just get the lastet for now
        modeOfThisHourAndZone.sort((a: any, b: any) => {
          const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
          if (startDateDiff !== 0) {
            return startDateDiff
          }
          return dayjs(b.create_date).diff(dayjs(a.create_date))
        })
        activeMode = modeOfThisHourAndZone[0]
      } else {
        let todayModeOfZoneBeforeThisHour = todayModeZone.filter((modeZone: any) => {
          const gasHour = parseToNumber(dayjs(modeZone.start_date).tz('Asia/Bangkok').format('H')) + 1
          return gasHour < itemGasHour && isMatch(modeZone?.zone?.name, item.zone_text)
        })

        if (todayModeOfZoneBeforeThisHour.length > 0) {
          todayModeOfZoneBeforeThisHour.sort((a: any, b: any) => {
            const startDateDiff = dayjs(b.start_date).diff(dayjs(a.start_date))
            if (startDateDiff !== 0) {
              return startDateDiff
            }
            return dayjs(b.create_date).diff(dayjs(a.create_date))
          })
          activeMode = todayModeOfZoneBeforeThisHour[0]
        } else {
          activeMode = lastetModeBeforeToday.find((f: any) => isMatch(f?.zone?.name, item.zone_text))
        }
      }

      if (isMatch(activeMode?.mode?.mode, item.mode)) {
        filteredResData.push(item)
      }
    }
    resData = (resData || [])?.map((e:any) => {

      return {
        ...e,
        active_mode: !!filteredData?.find((f:any) => f?.id === e?.id),
        activate: !!filteredData?.find((f:any) => f?.id === e?.id)
      }
    })
  // }

//  console.log('2baseReply : ', baseReply);
//     console.log('active_mode 2baseReply : ', baseReply?.filter((f:any) => f?.zone === "East" && f?.active_mode));
//     console.log('activate 2baseReply : ', baseReply?.filter((f:any) => f?.zone === "East" && f?.activate));
  let groupedData = groupAndFilterLatestData(resData, baseReply, accumReply, meteringPointList)
 
  // console.log('resData : ', resData);
  // console.log('baseReply : ', baseReply);
  // console.log('accumReply : ', accumReply);
  // console.log('meteringPointList : ', meteringPointList);

  // console.log('groupedData : ', groupedData);
  // console.log('groupedData : ', groupedData?.filter((f:any) => f?.zone === "East"));
  // console.log('groupedData : ', groupedData?.filter((f:any) => f?.zone === "East" && f?.active_mode));

  if (timestamp) {
    groupedData = groupedData.filter((item: any) => getTimestampValue(item.timestamp) == getTimestampValue(timestamp))
  }

  if (latest_hourly_version) {
    // Group by gas_day_text and gas_hour, then get the latest timestamp for each group
    const groupedByHour = new Map()
    groupedData.forEach((item: any) => {
      const key = `${item.gas_day_text}_${item.gas_hour || 'null'}_${item.zone_text?.toUpperCase() || 'null'}_${item.mode?.toUpperCase() || 'null'}`
      if (!groupedByHour.has(key) || compareTimestamps(item.timestamp, groupedByHour.get(key).timestamp) > 0) {
        groupedByHour.set(key, item)
      }
    })

    groupedData = Array.from(groupedByHour.values())
  }

  if (latest_daily_version) {
    // First, group by gas_day_text, zone_text, and mode to get the latest gas_hour for each group
    const groupedByLatestHour = new Map()
    groupedData.forEach((item: any) => {
      const key = `${item.gas_day_text}_${item.zone_text?.toUpperCase() || 'null'}_${item.mode?.toUpperCase() || 'null'}`

      if (!groupedByLatestHour.has(key) || compareGasHour(item.gas_hour, groupedByLatestHour.get(key).gas_hour) > 0) {
        groupedByLatestHour.set(key, item)
      }
    })

    // Then, from the latest gas_hour records, get the latest timestamp for each group
    const groupedByDay = new Map()
    Array.from(groupedByLatestHour.values()).forEach((item: any) => {
      const key = `${item.gas_day_text}_${item.zone_text?.toUpperCase() || 'null'}_${item.mode?.toUpperCase() || 'null'}`

      if (!groupedByDay.has(key) || compareTimestamps(item.timestamp, groupedByDay.get(key).timestamp) > 0) {
        groupedByDay.set(key, item)
      }
    })
    groupedData = Array.from(groupedByDay.values())
  }
  // console.log('groupedData : ', groupedData);

  // active_mode


  
  const fgroupedData = active_mode ? groupedData?.filter((f:any) => f?.active_mode) :  groupedData

  return {
    total_record: fgroupedData.length,
    status_code: 200,
    data: limit > 0 ? fgroupedData.slice(skip, skip + limit) : fgroupedData
  }
}

export function getBalanceReportAccumulatedData(accumData: balanceReportDataType, data: balanceReportDataType) {
  const entryPoint = parseToNumber6Decimal(data['Entry Point'])
  const exit = parseToNumber6Decimal(data['Exit'])
  const entryExit = parseToNumber6Decimal(data['Entry - Exit'])
  const fuelGas = parseToNumber6Decimal(data['Fuel Gas'])
  const balancingGas = parseToNumber6Decimal(data['Balancing Gas'])
  const changeMinInventory = parseToNumber6Decimal(data['Change Min Inventory'])
  const shrinkagate = parseToNumber6Decimal(data['Shrinkagate'])
  const commissioning = parseToNumber6Decimal(data['Commissioning'])
  const gasVent = parseToNumber6Decimal(data['Gas Vent'])
  const otherGas = parseToNumber6Decimal(data['Other Gas'])
  const imbalance = parseToNumber6Decimal(data['Imbalance'])
  const imbalancePercen = parseToNumber6Decimal(data['ImbalancePercen'])
  const accImbqalance = parseToNumber6Decimal(data['Acc. Imbqalance'])
  const minInventory = parseToNumber6Decimal(data['Min Inventory'])
  const instructedFlow = parseToNumber6Decimal(data['Instructed Flow'])

  if (entryPoint) {
    if (accumData['Entry Point']) {
      accumData['Entry Point'] = parseToNumber6Decimal(accumData['Entry Point'] + entryPoint)
    } else {
      accumData['Entry Point'] = entryPoint
    }
  }

  if (exit) {
    if (accumData['Exit']) {
      accumData['Exit'] = parseToNumber6Decimal(accumData['Exit'] + exit)
    } else {
      accumData['Exit'] = exit
    }
  }

  if (entryExit) {
    if (accumData['Entry - Exit']) {
      accumData['Entry - Exit'] = parseToNumber6Decimal(accumData['Entry - Exit'] + entryExit)
    } else {
      accumData['Entry - Exit'] = entryExit
    }
  }

  if (fuelGas) {
    if (accumData['Fuel Gas']) {
      accumData['Fuel Gas'] = parseToNumber6Decimal(accumData['Fuel Gas'] + fuelGas)
    } else {
      accumData['Fuel Gas'] = fuelGas
    }
  }

  if (balancingGas) {
    if (accumData['Balancing Gas']) {
      accumData['Balancing Gas'] = parseToNumber6Decimal(accumData['Balancing Gas'] + balancingGas)
    } else {
      accumData['Balancing Gas'] = balancingGas
    }
  }

  if (changeMinInventory) {
    if (accumData['Change Min Inventory']) {
      accumData['Change Min Inventory'] = parseToNumber6Decimal(accumData['Change Min Inventory'] + changeMinInventory)
    } else {
      accumData['Change Min Inventory'] = changeMinInventory
    }
  }

  if (shrinkagate) {
    if (accumData['Shrinkagate']) {
      accumData['Shrinkagate'] = parseToNumber6Decimal(accumData['Shrinkagate'] + shrinkagate)
    } else {
      accumData['Shrinkagate'] = shrinkagate
    }
  }

  if (commissioning) {
    if (accumData['Commissioning']) {
      accumData['Commissioning'] = parseToNumber6Decimal(accumData['Commissioning'] + commissioning)
    } else {
      accumData['Commissioning'] = commissioning
    }
  }

  if (gasVent) {
    if (accumData['Gas Vent']) {
      accumData['Gas Vent'] = parseToNumber6Decimal(accumData['Gas Vent'] + gasVent)
    } else {
      accumData['Gas Vent'] = gasVent
    }
  }

  if (otherGas) {
    if (accumData['Other Gas']) {
      accumData['Other Gas'] = parseToNumber6Decimal(accumData['Other Gas'] + otherGas)
    } else {
      accumData['Other Gas'] = otherGas
    }
  }

  if (imbalance) {
    if (accumData['Imbalance']) {
      accumData['Imbalance'] = parseToNumber6Decimal(accumData['Imbalance'] + imbalance)
    } else {
      accumData['Imbalance'] = imbalance
    }
  }

  if (imbalancePercen) {
    if (accumData['ImbalancePercen']) {
      accumData['ImbalancePercen'] = parseToNumber6Decimal(accumData['ImbalancePercen'] + imbalancePercen)
    } else {
      accumData['ImbalancePercen'] = imbalancePercen
    }
  }

  if (accImbqalance) {
    if (accumData['Acc. Imbqalance']) {
      accumData['Acc. Imbqalance'] = parseToNumber6Decimal(accumData['Acc. Imbqalance'] + accImbqalance)
    } else {
      accumData['Acc. Imbqalance'] = accImbqalance
    }
  }

  if (minInventory) {
    if (accumData['Min Inventory']) {
      accumData['Min Inventory'] = parseToNumber6Decimal(accumData['Min Inventory'] + minInventory)
    } else {
      accumData['Min Inventory'] = minInventory
    }
  }

  if (instructedFlow) {
    if (accumData['Instructed Flow']) {
      accumData['Instructed Flow'] = parseToNumber6Decimal(accumData['Instructed Flow'] + instructedFlow)
    } else {
      accumData['Instructed Flow'] = instructedFlow
    }
  }

  return accumData
}
