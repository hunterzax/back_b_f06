import {PrismaService} from 'prisma/prisma.service'
import {getTodayStartAdd7, getTodayNowYYYYMMDDDfaultAdd7, getWeekRange, getTodayNowDDMMYYYYAdd7, timeToMinutes, getDayjsFromHHmm} from './date.util'
import {contract_code, group, zone} from '@prisma/client'
import {
  activeData,
  allocationModeRecord,
  areaPopulate,
  areaWithRelations,
  conceptPointPopulate,
  conceptPointWithRelations,
  meteringPointPopulate,
  meteringPointWithRelations,
  nominationPointPopulate,
  nominationPointWithRelations,
  nonTpaPointPopulate,
  nonTpaPointWithRelations,
  queryShipperNominationFilePopulate,
  queryShipperNominationFileWithRelations
} from '@type/prisma.type'
import {parseToNumber, parseToNumber3Decimal, parseToNumber8Decimal} from './number.util'
import * as dayjs from 'dayjs'

export enum ALLOCATION_SYSTEM_PARAMETER {
  ONSHORE_MAXIMUM_ALLOCATION_TOLERANCE_PERCENTAGE = 2,
  ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW = 3,
  ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW_DUPLICATE = 4,
  PARK_DEFAULT_VALUE_EAST_MMBTU_D = 32,
  PARK_DEFAULT_VALUE_EAST_WEST_MMBTU_D = 34
}

// Export individual constants for direct import
export const ONSHORE_MAXIMUM_ALLOCATION_TOLERANCE_PERCENTAGE = ALLOCATION_SYSTEM_PARAMETER.ONSHORE_MAXIMUM_ALLOCATION_TOLERANCE_PERCENTAGE
export const ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW = ALLOCATION_SYSTEM_PARAMETER.ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW
export const ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW_DUPLICATE = ALLOCATION_SYSTEM_PARAMETER.ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW_DUPLICATE
export const PARK_DEFAULT_VALUE_EAST_MMBTU_D = ALLOCATION_SYSTEM_PARAMETER.PARK_DEFAULT_VALUE_EAST_MMBTU_D
export const PARK_DEFAULT_VALUE_EAST_WEST_MMBTU_D = ALLOCATION_SYSTEM_PARAMETER.PARK_DEFAULT_VALUE_EAST_WEST_MMBTU_D

export function isMatch(a: string, b: string) {
  return a?.trim()?.toUpperCase() === b?.trim()?.toUpperCase()
}

export function hasValue(val: string) {
  return val && val.trim() !== ''
}

export function validateField(itemValue: string, pointValue: string, activeList: any[], activeKey: string) {
  return !hasValue(itemValue) || (isMatch(pointValue, itemValue) && activeList?.some((item) => isMatch(item[activeKey], itemValue)))
}

/**
 * Extracts unique gas_day values from evidenApi and generates complete date array
 */
export function extractAndGenerateDateArray(evidenApi: any[]): string[] {
  const dateArray: string[] = []

  if (evidenApi && evidenApi.length > 0) {
    // Extract all unique gas_day values and convert to dayjs objects for proper date comparison
    const gasDays = [...new Set(evidenApi.map((item: any) => item.gas_day))]

    if (gasDays.length > 0) {
      // Convert to dayjs objects for proper date comparison
      const gasDayObjects = gasDays.map((date) => getTodayStartAdd7(date))

      // Find min and max gas_day using dayjs comparison
      const minGasDayObj = gasDayObjects.reduce((min, current) => (current.isBefore(min) ? current : min))
      const maxGasDayObj = gasDayObjects.reduce((max, current) => (current.isAfter(max) ? current : max))

      if (minGasDayObj.isValid() && maxGasDayObj.isValid()) {
        let current = minGasDayObj

        while (current.isSameOrBefore(maxGasDayObj)) {
          dateArray.push(current.format('YYYY-MM-DD'))
          current = current.add(1, 'day')
        }
      }
    }
  }

  return dateArray
}

/**
 * Builds activeData for each date by querying all necessary tables
 */
export async function buildActiveDataForDates(
  dateArray: string[],
  prisma: PrismaService
): Promise<
  activeData[]
> {
  if (dateArray.length === 0) {
    return []
  }
  // Find min and max dates from dateArray

  const min = dateArray?.reduce((min, current) => {
    const minDayjs = getTodayNowYYYYMMDDDfaultAdd7(min + 'T00:00:00Z')
    const currentDayjs = getTodayNowYYYYMMDDDfaultAdd7(current + 'T00:00:00Z')
    return currentDayjs.isBefore(minDayjs) ? current : min
  })
  const max = dateArray?.reduce((max, current) => {
    const maxDayjs = getTodayNowYYYYMMDDDfaultAdd7(max + 'T00:00:00Z')
    const currentDayjs = getTodayNowYYYYMMDDDfaultAdd7(current + 'T00:00:00Z')
    return currentDayjs.isAfter(maxDayjs) ? current : max
  })

  const minDate = getTodayNowYYYYMMDDDfaultAdd7(min + 'T00:00:00Z').toDate()

  const maxDate = getTodayNowYYYYMMDDDfaultAdd7(max + 'T00:00:00Z').toDate()

  const areaMaster: areaWithRelations[] = await prisma.area.findMany({
    where: {
      OR: [
        {end_date: null}, // No end date means still active
        {
          end_date: {
            gt: minDate
          }
        } // End date is after target date
      ],
      start_date: {
        lte: maxDate
      } // Start date is before or on target date
    },
    ...areaPopulate
  })

  const zoneMaster: zone[] = await prisma.zone.findMany({
    where: {
      OR: [
        {end_date: null},
        {
          end_date: {
            gt: minDate
          }
        }
      ],
      start_date: {
        lte: maxDate
      }
    }
  })

  const groupMaster: group[] = await prisma.group.findMany({
    where: {
      user_type_id: 3,
      OR: [
        {end_date: null},
        {
          end_date: {
            gt: minDate
          }
        }
      ],
      start_date: {
        lte: maxDate
      }
    }
  })

  const contractCodsMaster: contract_code[] = await prisma.contract_code.findMany({
    where: {
      AND: [
        {
          contract_start_date: {lte: maxDate}
        }, // Started before or on target date
        // Not rejected
        {
          status_capacity_request_management: {
            NOT: {
              name: {
                equals: 'Rejected',
                mode: 'insensitive'
              }
            }
          }
        },
        // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
        {
          OR: [
            {
              terminate_date: null
            }, // No terminate date
            {
              terminate_date: {
                gt: minDate
              }
            } // Terminate date is after target date
          ]
        },
        // Use extend_deadline if available, otherwise use contract_end_date
        {
          OR: [
            // If extend_deadline exists, use it as end date
            {
              AND: [
                {
                  extend_deadline: {
                    not: null
                  }
                },
                {
                  extend_deadline: {
                    gt: minDate
                  }
                }
              ]
            },
            // If extend_deadline is null, use contract_end_date
            {
              AND: [
                {
                  extend_deadline: null
                },
                {
                  OR: [
                    {
                      contract_end_date: null
                    },
                    {
                      contract_end_date: {
                        gt: minDate
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  })

  const nominationPointMaster: nominationPointWithRelations[] = await prisma.nomination_point.findMany({
    where: {
      OR: [
        {end_date: null},
        {
          end_date: {
            gt: minDate
          }
        }
      ],
      start_date: {
        lte: maxDate
      }
    },
    ...nominationPointPopulate
  })

  const conceptPointMaster: conceptPointWithRelations[] = await prisma.concept_point.findMany({
    where: {
      OR: [
        {end_date: null},
        {
          end_date: {
            gt: minDate
          }
        }
      ],
      start_date: {
        lte: maxDate
      }
    },
    ...conceptPointPopulate
  })

  const nonTpaPointMaster: nonTpaPointWithRelations[] = await prisma.non_tpa_point.findMany({
    where: {
      OR: [
        {end_date: null},
        {
          end_date: {
            gt: minDate
          }
        }
      ],
      start_date: {
        lte: maxDate
      }
    },
    ...nonTpaPointPopulate
  })

  const meteringPointMaster: meteringPointWithRelations[] = await prisma.metering_point.findMany({
    where: {
      OR: [
        {end_date: null},
        {
          end_date: {
            gt: minDate
          }
        }
      ],
      start_date: {
        lte: maxDate
      }
    },
    ...meteringPointPopulate
  })

  return await Promise.all(
    dateArray.map(async (date) => {
      try {
        const targetDate = getTodayNowYYYYMMDDDfaultAdd7(date + 'T00:00:00Z').toDate()

        // Find active areas at this date
        const activeAreas: areaWithRelations[] = areaMaster.filter((area) => area.start_date <= targetDate && (area.end_date === null || area.end_date >= targetDate))

        // Find active zones at this date
        const activeZones: zone[] = zoneMaster.filter((zone) => zone.start_date <= targetDate && (zone.end_date === null || zone.end_date >= targetDate))

        // Find active groups at this date
        const activeGroups: group[] = groupMaster.filter((group) => group.start_date <= targetDate && (group.end_date === null || group.end_date >= targetDate))

        const {weekStart: targetWeekStart, weekEnd: targetWeekEnd} = getWeekRange(targetDate)

        const activeNominationFiles: queryShipperNominationFileWithRelations[] = await prisma.query_shipper_nomination_file.findMany({
          where: {
            AND: [
              // Not rejected ot cancelled
              {
                query_shipper_nomination_status: {
                  id: {
                    notIn: [3, 5]
                  }
                }
              },
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
                OR: [
                  // Daily nominations: exact date match
                  {
                    nomination_type: {
                      id: 1
                    },
                    gas_day: targetDate
                  },
                  // Weekly nominations: same week
                  {
                    nomination_type: {
                      id: 2
                    },
                    gas_day: {
                      gte: targetWeekStart,
                      lte: targetWeekEnd
                    }
                  }
                ]
              }
            ]
          },
          ...queryShipperNominationFilePopulate
        })

        // Find active contract_code at this date
        const activeContractCodes: contract_code[] = contractCodsMaster.filter(
          (contractCode) =>
            contractCode.contract_start_date <= targetDate &&
            (contractCode.terminate_date === null || contractCode.terminate_date >= targetDate) &&
            ((contractCode.extend_deadline != null && contractCode.extend_deadline >= targetDate) || (contractCode.extend_deadline == null && (contractCode.contract_end_date == null || contractCode.contract_end_date >= targetDate)))
        )

        // Find active nomination_point at this date
        const activeNominationPoints: nominationPointWithRelations[] = nominationPointMaster.filter((nominationPoint) => nominationPoint.start_date <= targetDate && (nominationPoint.end_date === null || nominationPoint.end_date >= targetDate))

        // Find active concept_point at this date
        const activeConceptPoints: conceptPointWithRelations[] = conceptPointMaster

        // Find active non_tpa_point at this date
        const activeNonTpaPoints: nonTpaPointWithRelations[] = nonTpaPointMaster.filter((nonTpaPoint) => nonTpaPoint.start_date <= targetDate && (nonTpaPoint.end_date === null || nonTpaPoint.end_date >= targetDate))

        // Find active metering_point at this date
        const activeMeteringPoints: meteringPointWithRelations[] = meteringPointMaster.filter((meteringPoint) => meteringPoint.start_date <= targetDate && (meteringPoint.end_date === null || meteringPoint.end_date >= targetDate))

        return {
          date,
          activeAreas,
          activeZones,
          activeGroups,
          activeNominationFiles,
          activeContractCodes,
          activeNominationPoints,
          activeConceptPoints,
          activeNonTpaPoints,
          activeMeteringPoints
        }
      } catch (error) {
        // console.error(`Error finding active records for ${date}:`, error);
        return {
          date
        }
      }
    })
  )
}

/**
 * Validates contract and shipper existence in active records
 */
export function validateContractAndShipper(
  dFm: any,
  activeDataForDate: any
): {
  isValid: boolean
  shipperObj?: any
} {
  if (!activeDataForDate) {
    return {isValid: false}
  }

  const contractExistsInNominationFiles = activeDataForDate.activeNominationFiles?.some((nom: any) => isMatch(nom.contract_code?.contract_code, dFm.contract)) || false

  const contractExistsInContractCodes = activeDataForDate.activeContractCodes?.some((contract: any) => isMatch(contract.contract_code, dFm.contract)) || false

  // Find the actual shipper group object
  const foundShipperGroup = activeDataForDate.activeGroups?.find((group: any) => isMatch(group.id_name, dFm.shipper))

  // Skip this contract/shipper combination if either doesn't exist in active records
  if (!contractExistsInNominationFiles || !contractExistsInContractCodes || !foundShipperGroup) {
    return {
      isValid: false,
      shipperObj: foundShipperGroup
    }
  }

  return {
    isValid: true,
    shipperObj: foundShipperGroup
  }
}

/**
 * Validates NOM point type and attaches area/zone objects
 */
export function validateNomPoint(dFm2: any, activeDataForDate: any): boolean {
  // Find nomination point
  const nominationPoint = activeDataForDate?.activeNominationPoints?.find((nomPoint: any) => isMatch(nomPoint.nomination_point, dFm2.point))
  if (!nominationPoint) return false

  // Find and validate area
  if (hasValue(dFm2.area)) {
    if (!isMatch(nominationPoint.area?.name, dFm2.area)) return false
    const foundArea = activeDataForDate?.activeAreas?.find((activeArea: any) => isMatch(activeArea.name, dFm2.area))
    if (!foundArea) return false
    dFm2.area_obj = foundArea
  }

  // Find and validate zone
  if (hasValue(dFm2.zone)) {
    if (!isMatch(nominationPoint.zone?.name, dFm2.zone)) return false
    const foundZone = activeDataForDate?.activeZones?.find((activeZone: any) => isMatch(activeZone.name, dFm2.zone))
    if (!foundZone) return false
    dFm2.zone_obj = foundZone
  }

  return true
  // // Validate area and zone, and relation_point
  // return validateField(dFm2.area, nonTpaPoint.area?.name, activeDataForDate?.activeAreas, 'name') &&
  // validateField(dFm2.zone, nonTpaPoint.zone?.name, activeDataForDate?.activeZones, 'name')
  // // && (!hasValue(dFm2.relation_point_type) ||
  // // (isMatch(dFm2.relation_point_type, 'NOM') &&
  // //  activeDataForDate?.activeNominationPoints?.some((np: any) => isMatch(np.nomination_point, dFm2.relation_point))));
}

/**
 * Validates NONTPA point type and attaches area/zone objects
 */
export function validateNonTpaPoint(dFm2: any, activeDataForDate: any): boolean {
  // Find non TPA point
  const nonTpaPoint = activeDataForDate?.activeNonTpaPoints?.find((ntpPoint: any) => isMatch(ntpPoint.non_tpa_point_name, dFm2.point))
  if (!nonTpaPoint) return false

  // Find and validate area
  if (hasValue(dFm2.area)) {
    if (!isMatch(nonTpaPoint.area?.name, dFm2.area)) return false
    const foundArea = activeDataForDate?.activeAreas?.find((activeArea: any) => isMatch(activeArea.name, dFm2.area))
    if (!foundArea) return false
    dFm2.area_obj = foundArea
  }

  // Find and validate zone
  if (hasValue(dFm2.zone)) {
    if (!isMatch(nonTpaPoint.zone?.name, dFm2.zone)) return false
    const foundZone = activeDataForDate?.activeZones?.find((activeZone: any) => isMatch(activeZone.name, dFm2.zone))
    if (!foundZone) return false
    dFm2.zone_obj = foundZone
  }

  return true
  // // Validate area and zone, and relation_point
  // return validateField(dFm2.area, nonTpaPoint.area?.name, activeDataForDate?.activeAreas, 'name') &&
  // validateField(dFm2.zone, nonTpaPoint.zone?.name, activeDataForDate?.activeZones, 'name')
  // // && (!hasValue(dFm2.relation_point_type) ||
  // // (isMatch(dFm2.relation_point_type, 'NOM') &&
  // //   activeDataForDate?.activeNominationPoints?.some((np: any) => isMatch(np.nomination_point, dFm2.relation_point))));
}

/**
 * Validates CONCEPT point type
 */
export function validateConceptPoint(dFm2: any, activeDataForDate: any): boolean {
  // Find concept point
  const conceptPoint = activeDataForDate?.activeConceptPoints?.find((cpPoint: any) => isMatch(cpPoint.concept_point, dFm2.point))
  return !!conceptPoint
}

/**
 * Validates point based on point_type and attaches area/zone objects
 */
export function validatePointByType(dFm2: any, activeDataForDate: any): boolean {
  if (!activeDataForDate) return true

  switch (dFm2.point_type?.trim()?.toUpperCase()) {
    case 'NOM':
      return validateNomPoint(dFm2, activeDataForDate)
    case 'NONTPA':
      return validateNonTpaPoint(dFm2, activeDataForDate)
    case 'CONCEPT':
      return validateConceptPoint(dFm2, activeDataForDate)
    default:
      return true
  }
}

/**
 * Helper method to group data by specific fields
 */
export function groupDataByFields(data: any[], fields: string[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {}

  data.forEach((item) => {
    // Create a unique key from the specified fields
    const key = fields.map((field) => item[field] || '').join('|')

    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(item)
  })

  return grouped
}

export function transformToShipperReportStructureOld(filteredData: any[], getDataLogic?: any, activeData?: any): any[] {
  // Group by gas_day
  const groupedByGasDay = filteredData.reduce((acc, item) => {
    const gasDay = item.gas_day
    if (!acc[gasDay]) {
      acc[gasDay] = []
    }
    acc[gasDay].push(item)
    return acc
  }, {})

  // Transform each gas_day group
  const result = Object.entries(groupedByGasDay).map(([gasDay, items]: [string, any[]]) => {
    // Group by point
    const groupedByPoint = items.reduce((acc, item) => {
      const point = item.point
      if (!acc[point]) {
        acc[point] = []
      }
      acc[point].push(item)
      return acc
    }, {})

    // Transform each point group
    const nomPoint = Object.entries(groupedByPoint).map(([point, pointItems]: [string, any[]]) => {
      // Group by shipper to aggregate allocated values
      const groupedByShipper = pointItems.reduce((acc, item) => {
        // Find allocatedValue from the values array
        const allocatedValueObj = item.values?.find((v: any) => v.tag === 'allocatedValue')
        const allocatedValue = allocatedValueObj ? allocatedValueObj.value : 0

        const shipperId = item.shipper
        const shipperName = item.group?.name || item.shipper

        if (!acc[shipperId]) {
          acc[shipperId] = {
            gas_day: gasDay,
            shipper_id: shipperId,
            shipper_name: shipperName,
            allocatedValue: 0
          }
        }
        acc[shipperId].allocatedValue += allocatedValue
        return acc
      }, {})

      const data = Object.values(groupedByShipper)
      const total = data.reduce((sum: number, item: any) => sum + item.allocatedValue, 0)

      // Calculate meter value for this point and gas_day
      let meterValue = null
      if (getDataLogic?.meter) {
        // Find metering points that match this nomination point
        const activeDataForDate = activeData?.find((item: any) => isMatch(item.date, gasDay))
        const activeMeterRelateToNom = activeDataForDate?.activeMeteringPoints?.filter((meteringPoint: any) => isMatch(meteringPoint.nomination_point?.nomination_point, point))
        const activeMeterRelateToNonTpa = activeDataForDate?.activeMeteringPoints?.filter((meteringPoint: any) => isMatch(meteringPoint.non_tpa_point_name, point) || isMatch(meteringPoint.nomination_point?.nomination_point, point))
        // const matchingMeterPoints = getDataLogic.meterNom?.filter((meterPoint: any) => {
        //   const nominationPointName = meterPoint?.nomination_point?.nomination_point ||
        //                             meterPoint?.non_tpa_point?.nomination_point?.nomination_point;
        //   return isMatch(nominationPointName, point);
        // }) || [];

        // Calculate total meter value for this point on this gas_day
        let totalMeterValue = 0
        activeMeterRelateToNom.forEach((meterPoint: any) => {
          const meterPointName = meterPoint.metered_point_name

          // Find meter readings for this meter point on this gas_day
          const meterReadings = getDataLogic.meter.filter((reading: any) => {
            return isMatch(meterPointName, reading.meteringPointId) && (isMatch(gasDay, reading.gasDay) || isMatch(gasDay, reading.gas_day))
          })

          // Sum the energy values for this meter point
          meterReadings.forEach((reading: any) => {
            const energy = reading.value?.energy || reading.energy || 0
            totalMeterValue += Number(energy) || 0
          })
        })

        let totalMeterValueNonTpa = 0
        activeMeterRelateToNonTpa.forEach((meterPoint: any) => {
          const meterPointName = meterPoint.metered_point_name

          // Find meter readings for this meter point on this gas_day
          const meterReadings = getDataLogic.meter.filter((reading: any) => {
            return isMatch(meterPointName, reading.meteringPointId) && isMatch(gasDay, reading.gas_day)
          })

          // Sum the energy values for this meter point
          meterReadings.forEach((reading: any) => {
            const energy = reading.value?.energy || reading.energy || 0
            totalMeterValueNonTpa += Number(energy) || 0
          })
        })

        meterValue = totalMeterValue > 0 ? totalMeterValue : null
        // if(meterValue && totalMeterValueNonTpa > 0){
        //   meterValue = meterValue - totalMeterValueNonTpa;
        // }
      }

      return {
        point,
        data,
        total,
        meterValue
      }
    })

    return {
      gas_day: gasDay,
      nomPoint
    }
  })

  // Sort by gas_day descending
  return result.sort((a, b) => b.gas_day.localeCompare(a.gas_day))
}

export function transformToShipperReportStructure(filteredData: any[], getDataLogic?: any, activeData?: any): any[] {
  const keyOf = (value: any) =>
    String(value ?? '')
      .trim()
      .toLowerCase()

  const mapKey = (...values: any[]) => values.map(keyOf).join('__')

  /**
   * meterEnergyMap
   * key = meteringPointId + gasDay
   * value = sum energy
   */
  const meterEnergyMap = new Map<string, number>()

  if (getDataLogic?.meter?.length) {
    for (const reading of getDataLogic.meter) {
      const meterPointKey = keyOf(reading.meteringPointId)

      if (!meterPointKey) continue

      const energy = Number(reading.value?.energy || reading.energy || 0) || 0

      /**
       * เดิมเช็คทั้ง reading.gasDay และ reading.gas_day ด้วย OR
       * ถ้าสองค่าเหมือนกัน ต้องนับแค่ครั้งเดียว
       */
      const gasDayKeys = new Set([reading.gasDay, reading.gas_day].map(keyOf).filter(Boolean))

      for (const gasDayKey of gasDayKeys) {
        const key = `${meterPointKey}__${gasDayKey}`
        meterEnergyMap.set(key, (meterEnergyMap.get(key) ?? 0) + energy)
      }
    }
  }

  /**
   * activeNomMap
   * key = activeData.date + nomination_point
   * value = activeMeteringPoints[]
   */
  const activeNomMap = new Map<string, any[]>()

  if (activeData?.length) {
    for (const active of activeData) {
      const activeDate = active.date

      for (const meteringPoint of active.activeMeteringPoints ?? []) {
        const nominationPoint = meteringPoint.nomination_point?.nomination_point

        const key = mapKey(activeDate, nominationPoint)

        if (!activeNomMap.has(key)) {
          activeNomMap.set(key, [])
        }

        activeNomMap.get(key)!.push(meteringPoint)
      }
    }
  }

  /**
   * Group: gas_day -> point -> shipper
   */
  const groupedMap = new Map<any, Map<any, Map<any, any>>>()

  for (const item of filteredData) {
    const gasDay = item.gas_day
    const point = item.point
    const shipperId = item.shipper
    const shipperName = item.group?.name || item.shipper

    const allocatedValueObj = item.values?.find((v: any) => v.tag === 'allocatedValue')

    const allocatedValue = allocatedValueObj ? allocatedValueObj.value : 0

    if (!groupedMap.has(gasDay)) {
      groupedMap.set(gasDay, new Map())
    }

    const pointMap = groupedMap.get(gasDay)!

    if (!pointMap.has(point)) {
      pointMap.set(point, new Map())
    }

    const shipperMap = pointMap.get(point)!

    if (!shipperMap.has(shipperId)) {
      shipperMap.set(shipperId, {
        gas_day: gasDay,
        shipper_id: shipperId,
        shipper_name: shipperName,
        allocatedValue: 0
      })
    }

    shipperMap.get(shipperId).allocatedValue += allocatedValue
  }

  const result = Array.from(groupedMap.entries()).map(([gasDay, pointMap]) => {
    const nomPoint = Array.from(pointMap.entries()).map(([point, shipperMap]) => {
      const data = Array.from(shipperMap.values())

      const total = data.reduce((sum: number, item: any) => sum + item.allocatedValue, 0)

      let meterValue = null

      if (getDataLogic?.meter) {
        const activeMeterRelateToNom = activeNomMap.get(mapKey(gasDay, point)) ?? []

        let totalMeterValue = 0

        for (const meterPoint of activeMeterRelateToNom) {
          const meterPointName = meterPoint.metered_point_name

          const energy = meterEnergyMap.get(mapKey(meterPointName, gasDay)) ?? 0

          totalMeterValue += energy
        }

        meterValue = totalMeterValue > 0 ? totalMeterValue : null
      }

      return {
        point,
        data,
        total,
        meterValue
      }
    })

    return {
      gas_day: gasDay,
      nomPoint
    }
  })

  return result.sort((a, b) => b.gas_day.localeCompare(a.gas_day))
}

/**
 * Helper method to group allcation review data to allcation management structure
 */
export function groupDataAlloManage(data: any[]) {
  try {
    const priorityMap: any = {
      2: 1, // Highest priority
      3: 2,
      4: 3,
      5: 4,
      1: 5 // Lowest priority
    }

    const grouped: any = data.reduce(
      (acc, item) => {
        const key = `${item.gas_day}-${item.point}`

        if (!acc[key]) {
          acc[key] = {
            // id: generateRandomId(),
            id: item?.point + '_' + item.gas_day,
            gas_day: item.gas_day,
            point_text: item?.point,
            entry_exit: item?.entry_exit_obj?.name,

            nomination_value: 0,
            system_allocation: 0,
            intraday_system: 0,
            previous_allocation_tpa_for_review: 0,
            shipper_allocation_review: 0,
            metering_value: 0,

            data: [],
            priorityStatus: item?.allocation_status?.id ?? 999
          }
        }

        acc[key].data.push(item)

        // Sum
        acc[key].nominationValue += Number(item?.nominationValue ?? 0)
        acc[key].systemAllocation += Number(item?.systemAllocation ?? 0)
        acc[key].intradaySystem += Number(item?.intradaySystem ?? 0)
        acc[key].previousAllocationTPAforReview += Number(item?.previousAllocationTPAforReview ?? 0)
        // acc[key].metering_value += Number(item?.meteringValue ?? 0);
        acc[key].meteringValue = Number(item?.meteringValue ?? 0)

        const shipperReview = item?.allocation_management_shipper_review?.[0]?.shipper_allocation_review ?? item?.shipperAllocationReview ?? 0
        acc[key].shipperAllocationReview += Number(shipperReview)

        // Update priority status if item has higher priority
        const currentPriority = priorityMap[acc[key].priorityStatus] ?? 999
        const itemPriority = priorityMap[item.allocation_status?.id] ?? 999

        if (itemPriority < currentPriority) {
          acc[key].priorityStatus = item.allocation_status?.id
        }

        return acc
      },
      {} as Record<string, any>
    )

    return Object.values(grouped)
  } catch (error) {
    return []
  }
}

export async function flatEvidenApiResponse(evidenApiResponse, prisma: PrismaService) {
  console.time('[RUNTIME] flatEvidenApiResponse')
  const dateArrayFromService = extractAndGenerateDateArray(evidenApiResponse)
  const activeData = await buildActiveDataForDates(dateArrayFromService, prisma)
  const response =
    evidenApiResponse?.flatMap((fm: any) => {
      const {data: data1, ...fmD} = fm

      // Find active data for this gas_day
      const activeDataForDate = activeData.find((ad) => ad.date === fm.gas_day)

      const nData = data1?.flatMap((dFm: any) => {
        const {data: data2, ...fmD2} = dFm

        const contractValidation = validateContractAndShipper(dFm, activeDataForDate)
        const nData2 = data2.map((dFm2: any) => {
          validatePointByType(dFm2, activeDataForDate)
          return {
            ...fmD,
            ...fmD2,
            ...dFm2,
            group: contractValidation.shipperObj
          }
        })

        return [...nData2]
      })

      return [...nData]
    }) || []
  console.log('[INFO] flatEvidenApiResponse: response.length', response?.length || 0)
  console.timeEnd('[RUNTIME] flatEvidenApiResponse')
  return response
}

/**
 * คำนวณค่า Nomination Value จากไฟล์ nomination ที่ตรงกับ evidenItem
 * @param convertNomFile - ไฟล์ nomination ที่ผ่านการแปลงแล้ว (parse JSON แล้ว)
 * @param evidenItem - ข้อมูล Eviden ที่ต้องการหาค่า nomination
 * @returns ค่า nomination ที่คำนวณได้ (number | null)
 */
export function getNomValue(convertNomFile: any[], evidenItem: any) {
  let nominationValue: number | null = null

  try {
    // กรอง Daily Nomination ที่ตรงกับ gas_day, shipper, contract
    const dailyNominationList = convertNomFile?.filter((f: any) => {
      return f?.gas_day === evidenItem['gas_day'] && f?.group?.id_name === evidenItem['shipper'] && f?.contract_code?.contract_code === evidenItem['contract'] && f?.nomination_type_id == 1
    })

    // กรอง Weekly Nomination ที่อยู่ในสัปดาห์เดียวกันกับ gas_day และตรงกับ shipper, contract
    // และต้องไม่มี Daily Nomination ของ contract เดียวกันอยู่แล้ว (เพื่อหลีกเลี่ยงการนับซ้ำ)
    const weeklyNominationList = convertNomFile?.filter((f: any) => {
      return (
        getTodayNowYYYYMMDDDfaultAdd7(f?.gas_day).isSame(getTodayNowYYYYMMDDDfaultAdd7(evidenItem['gas_day']), 'week') &&
        f?.group?.id_name === evidenItem['shipper'] &&
        f?.contract_code?.contract_code === evidenItem['contract'] &&
        f?.nomination_type_id == 2 &&
        !dailyNominationList.some((daily: any) => daily.contract_code_id == f?.contract_code_id)
      )
    })

    // หาวันในสัปดาห์ (0 = Sunday, 1 = Monday, ..., 6 = Saturday) เพื่อใช้ดึงค่าจาก Weekly Nomination
    const dayOfWeek = Number(getTodayStartAdd7(evidenItem['gas_day']).format('d')) // The day of the week, with Sunday = 0

    // วนลูปผ่าน Daily และ Weekly Nomination ที่กรองได้
    ;[...dailyNominationList, ...weeklyNominationList].map((nominationFile) => {
      nominationFile.rowData?.map((rowDataItem: any) => {
        // ตรวจสอบว่า row นี้ตรงกับ point, area, zone ของ evidenItem หรือไม่
        // สำหรับ CONCEPT point จะใช้ column 5 แทน column 3 และไม่ต้องเช็ค area
        if (
          (isMatch(rowDataItem?.data_temp['3'], evidenItem['point']) || (isMatch('CONCEPT', evidenItem['point_type']) && isMatch(rowDataItem?.data_temp['5'], evidenItem['point']))) &&
          isMatch(rowDataItem?.data_temp['9'], 'MMBTU/D') && // ต้องเป็นหน่วย MMBTU/D
          (isMatch(rowDataItem?.area_text, evidenItem['area']) || isMatch('CONCEPT', evidenItem['point_type'])) && // CONCEPT ไม่ต้องเช็ค area
          isMatch(rowDataItem?.zone_text, evidenItem['zone'])
        ) {
          let newNominationValue: number | null = null

          // สำหรับ Daily Nomination (nomination_type_id = 1)
          if (nominationFile?.nomination_type_id === 1) {
            // ดึงค่ารายวันจาก column 38
            newNominationValue = parseToNumber(rowDataItem?.data_temp['38'])

            // ถ้ามี gas_hour ให้คำนวณค่ารวมจากรายชั่วโมง (column 14, 15, 16, ...)
            if (evidenItem?.gas_hour) {
              let i = 0
              let acc: number | null = null
              // รวมค่ารายชั่วโมงตั้งแต่ชั่วโมงที่ 0 ถึง gas_hour-1
              do {
                const valuePerHour: number | null = parseToNumber(rowDataItem['data_temp'][`${14 + i}`])
                if (acc) {
                  if (valuePerHour) {
                    acc = acc + valuePerHour
                  }
                } else {
                  acc = valuePerHour
                }
                i++
              } while (i < evidenItem?.gas_hour)
              // ใช้ค่ารวมรายชั่วโมงแทนค่ารายวัน
              newNominationValue = acc
            }
          }
          // สำหรับ Weekly Nomination (nomination_type_id = 2)
          else {
            // ดึงค่าตามวันในสัปดาห์จาก column 14+dayOfWeek (14=Sunday, 15=Monday, ..., 20=Saturday)
            newNominationValue = parseToNumber(rowDataItem?.data_temp[`${14 + dayOfWeek}`])

            // ถ้ามี gas_hour ให้คำนวณค่าแบบ prorated (แบ่งตามสัดส่วนชั่วโมง)
            if (evidenItem?.gas_hour) {
              // newNominationValue = (newNominationValue / 24) * evidenItem?.gas_hour
              newNominationValue = Math.round((newNominationValue / 24) * evidenItem?.gas_hour * 10000) / 10000 // https://app.clickup.com/t/86evj8e72
            }
          }

          // รวมค่า nomination จากหลายไฟล์/หลาย row เข้าด้วยกัน
          if (nominationValue) {
            if (newNominationValue || newNominationValue == 0) {
              nominationValue += newNominationValue
            }
          } else {
            nominationValue = newNominationValue
          }
        }
      })

      if (!nominationValue && nominationValue != 0 && nominationFile?.nomination_type_id == 1) {
        try {
          const weeklyThatHaveDailyNomination = convertNomFile?.find((f: any) => {
            return (
              getTodayNowYYYYMMDDDfaultAdd7(f?.gas_day).isSame(getTodayNowYYYYMMDDDfaultAdd7(evidenItem['gas_day']), 'week') &&
              f?.group?.id_name === nominationFile?.group?.id_name &&
              f?.contract_code?.contract_code === nominationFile?.contract_code?.contract_code &&
              f?.nomination_type_id == 2 &&
              dailyNominationList.some((daily: any) => daily.contract_code_id == f?.contract_code_id)
            )
          })

          if (weeklyThatHaveDailyNomination) {
            const weeklyRowDataItem = weeklyThatHaveDailyNomination.rowData?.find(
              (weeklyRowDataItem: any) =>
                isMatch(weeklyRowDataItem?.data_temp['3'], evidenItem['point']) &&
                isMatch(weeklyRowDataItem?.data_temp['9'], 'MMBTU/D') &&
                (isMatch(weeklyRowDataItem?.area_text, evidenItem['area']) || isMatch('CONCEPT', evidenItem['point_type'])) &&
                isMatch(weeklyRowDataItem?.zone_text, evidenItem['zone'])
            )

            if (weeklyRowDataItem?.data_temp) {
              let newNominationValue: number | null = null
              newNominationValue = parseToNumber(weeklyRowDataItem?.data_temp[`${14 + dayOfWeek}`])
              if (evidenItem?.gas_hour) {
                newNominationValue = (newNominationValue / 24) * evidenItem?.gas_hour
              }
              if (nominationValue) {
                if (newNominationValue || newNominationValue == 0) {
                  nominationValue += newNominationValue
                }
              } else {
                nominationValue = newNominationValue
              }
            }
          }
        } catch (error) {}
      }
    })

    return nominationValue
  } catch (error) {
    return nominationValue
  }
}

/**
 * คำนวณค่า Nomination Value ที่ผ่านการปรับแล้ว (Adjusted Nomination)
 * ถ้ามีข้อมูล nomAdjust ที่ตรงกับเงื่อนไข จะคำนวณจาก timeShow แบบ prorated ตามชั่วโมง
 * ถ้าไม่มี nomAdjust จะใช้ค่า nomination ปกติจาก getNomValue แทน
 *
 * @param nomAdjust - ข้อมูล Daily Adjustment ที่มีการปรับค่า nomination แล้ว
 * @param convertNomFile - ไฟล์ nomination ที่ผ่านการแปลงแล้ว (parse JSON แล้ว)
 * @param evidenItem - ข้อมูล Eviden ที่ต้องการหาค่า nomination
 * @returns ค่า nomination ที่คำนวณได้ (number | null)
 */

export function getAdjustedNomValue({nomAdjust, convertNomFile, evidenItem}: {nomAdjust: any[]; convertNomFile: any[]; evidenItem: any}) {
  let nominationValue: number | null = null
  try {
    // กรอง nomAdjust ที่ตรงกับ point, area, zone, entry_exit, contract, shipper, gas_day
    const targetNomAdjustList = nomAdjust.filter(
      (nomAdjustItem: any) =>
        isMatch(nomAdjustItem?.point, evidenItem['point']) &&
        isMatch(nomAdjustItem?.area_text, evidenItem['area']) &&
        isMatch(nomAdjustItem?.zone_text, evidenItem['zone']) &&
        isMatch(nomAdjustItem?.entryExit, evidenItem['entry_exit']) &&
        isMatch(nomAdjustItem?.contract, evidenItem['contract']) &&
        isMatch(nomAdjustItem?.shipper_id_name, evidenItem['shipper']) &&
        isMatch(getTodayNowDDMMYYYYAdd7(nomAdjustItem?.gas_day).format('YYYY-MM-DD'), evidenItem['gas_day'])
    )

    // ถ้ามี nomAdjust ที่ตรงกับเงื่อนไข ให้คำนวณจาก timeShow
    if (targetNomAdjustList.length > 0) {
      targetNomAdjustList.map((nomAdjustItem: any) => {
        // วนลูปผ่านทุกชั่วโมงตั้งแต่ 0 ถึง gas_hour-1
        for (let i = 0; i < parseToNumber(evidenItem['gas_hour'] ?? 0); i++) {
          // กรอง timeShow ที่อยู่ในชั่วโมง i และเรียงตามเวลาใหม่ไปเก่า (descending)
          const thisHourTimeShow = nomAdjustItem.timeShow
            .filter((timeShowItem: any) => (parseToNumber(getDayjsFromHHmm(timeShowItem.time).format('H')) ?? 25) == i)
            .sort((a: any, b: any) => {
              return timeToMinutes(b.time) - timeToMinutes(a.time) // เรียงจากเวลาใหม่ไปเก่า
            })

          // คำนวณค่า prorated สำหรับชั่วโมงนี้
          let thisHourProratedValue = 0
          let maxMinutes = 60 // เริ่มจาก 60 นาที (สิ้นสุดชั่วโมง)

          // วนลูปผ่าน timeShow ที่อยู่ในชั่วโมงนี้ (เรียงจากใหม่ไปเก่า)
          thisHourTimeShow.map((timeShowItem: any) => {
            const adjustMinutes = parseToNumber(getDayjsFromHHmm(timeShowItem.time).format('m')) ?? 0

            // ถ้าเวลาปรับยังไม่ถึง maxMinutes (ยังมีช่วงเวลาที่ต้องใช้ค่า timeShowItem นี้)
            if (maxMinutes > adjustMinutes) {
              // คำนวณช่วงเวลาที่ใช้ค่า timeShowItem นี้ (จาก maxMinutes ถึง adjustMinutes)
              const usedMinutes = maxMinutes - adjustMinutes
              // อัพเดท maxMinutes เป็น adjustMinutes เพื่อใช้คำนวณ timeShowItem ถัดไป
              maxMinutes = adjustMinutes
              // คำนวณค่า per minute จาก valuePerHour
              const valuePerMinute = timeShowItem.valuePerHour / 60
              // เพิ่มค่า prorated สำหรับช่วงเวลานี้
              thisHourProratedValue += valuePerMinute * usedMinutes
            }
          })

          // รวมค่า prorated ของชั่วโมงนี้เข้ากับ nominationValue
          if (nominationValue) {
            nominationValue += thisHourProratedValue
          } else {
            nominationValue = thisHourProratedValue
          }
        }
      })
    }
    // ถ้าไม่มี nomAdjust ที่ตรงกับเงื่อนไข ให้ใช้ค่า nomination ปกติ
    else {
      nominationValue = getNomValue(convertNomFile, evidenItem)
    }
    return nominationValue
  } catch (error) {
    return nominationValue
  }
}

// ....................................................................................................................................................

type NominationFileRowsCache = Map<string, any[]>;

type NominationBaseCacheItem = {
  dailyNominationList: any[];
  weeklyNominationList: any[];
  allWeeklyNominationList: any[];
  dailyContractIdSet: Set<any>;
  dayOfWeek: number;
  resultByGasHour: Map<string, number | null>;
};

export type NomValueFastContext = {
  dailyNominationMap: Map<string, any[]>;
  weeklyNominationMap: Map<string, any[]>;

  weekKeyCache: Map<string, string>;
  dayOfWeekCache: Map<string, number>;

  /**
   * Cache row ที่ตรงกับ point / pointType / area / zone
   * แยกตาม nominationFile
   */
  nominationRowsCache: WeakMap<
    object,
    NominationFileRowsCache
  >;

  /**
   * Cacheผลรวมรายชั่วโมง Daily ของแต่ละ row
   */
  dailyHourlyCumulativeCache: WeakMap<
    object,
    Array<number | null>
  >;

  /**
   * Cacheข้อมูลพื้นฐาน โดยไม่รวม gas_hour
   */
  baseCache: Map<string, NominationBaseCacheItem>;
};

const NOM_KEY_SEPARATOR = "\u001F";

const nomKeyValue = (value: any): string => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

const createNomKey = (...values: any[]): string => {
  let key = "";

  for (let index = 0; index < values.length; index++) {
    if (index > 0) {
      key += NOM_KEY_SEPARATOR;
    }

    key += nomKeyValue(values[index]);
  }

  return key;
};

const pushNominationMap = (
  map: Map<string, any[]>,
  key: string,
  value: any
): void => {
  const current = map.get(key);

  if (current) {
    current.push(value);
  } else {
    map.set(key, [value]);
  }
};

/**
 * สร้าง Context เพียงครั้งเดียวก่อน loop result
 */
export function createNomValueFastContext(
  convertNomFile: any[]
): NomValueFastContext {
  const context: NomValueFastContext = {
    dailyNominationMap: new Map(),
    weeklyNominationMap: new Map(),

    weekKeyCache: new Map(),
    dayOfWeekCache: new Map(),

    nominationRowsCache: new WeakMap(),
    dailyHourlyCumulativeCache: new WeakMap(),

    baseCache: new Map()
  };

  const getWeekKey = (date: any): string => {
    const dateKey = nomKeyValue(date);

    const cached =
      context.weekKeyCache.get(dateKey);

    if (cached !== undefined) {
      return cached;
    }

    const weekKey =
      getTodayNowYYYYMMDDDfaultAdd7(date)
        .startOf("week")
        .format("YYYY-MM-DD");

    context.weekKeyCache.set(
      dateKey,
      weekKey
    );

    return weekKey;
  };

  /**
   * วน convertNomFile เพียงรอบเดียว
   */
  for (const nominationFile of convertNomFile ?? []) {
    const nominationTypeId = Number(
      nominationFile?.nomination_type_id
    );

    if (
      nominationTypeId !== 1 &&
      nominationTypeId !== 2
    ) {
      continue;
    }

    const shipper =
      nominationFile?.group?.id_name;

    const contract =
      nominationFile?.contract_code
        ?.contract_code;

    if (nominationTypeId === 1) {
      const dailyKey = createNomKey(
        nominationFile?.gas_day,
        shipper,
        contract
      );

      pushNominationMap(
        context.dailyNominationMap,
        dailyKey,
        nominationFile
      );
    } else {
      const weeklyKey = createNomKey(
        getWeekKey(nominationFile?.gas_day),
        shipper,
        contract
      );

      pushNominationMap(
        context.weeklyNominationMap,
        weeklyKey,
        nominationFile
      );
    }
  }

  return context;
}

/**
 * รักษาวิธีบวก nominationValue เหมือนโค้ดเดิม
 */
const addNomValueLikeOriginal = (
  currentValue: number | null,
  newValue: number | null
): number | null => {
  if (currentValue) {
    if (newValue || newValue === 0) {
      return currentValue + newValue;
    }

    return currentValue;
  }

  return newValue;
};

/**
 * หาวันในสัปดาห์ พร้อม cache
 */
const getNomDayOfWeek = (
  context: NomValueFastContext,
  gasDay: any
): number => {
  const dateKey = nomKeyValue(gasDay);

  const cached =
    context.dayOfWeekCache.get(dateKey);

  if (cached !== undefined) {
    return cached;
  }

  const dayOfWeek = Number(
    getTodayStartAdd7(gasDay).format("d")
  );

  context.dayOfWeekCache.set(
    dateKey,
    dayOfWeek
  );

  return dayOfWeek;
};

/**
 * หา week key พร้อม cache
 */
const getNomWeekKey = (
  context: NomValueFastContext,
  gasDay: any
): string => {
  const dateKey = nomKeyValue(gasDay);

  const cached =
    context.weekKeyCache.get(dateKey);

  if (cached !== undefined) {
    return cached;
  }

  const weekKey =
    getTodayNowYYYYMMDDDfaultAdd7(gasDay)
      .startOf("week")
      .format("YYYY-MM-DD");

  context.weekKeyCache.set(
    dateKey,
    weekKey
  );

  return weekKey;
};

/**
 * Cacheผลรวม Daily รายชั่วโมง
 *
 * index 1 = ชั่วโมงแรก
 * index 2 = ชั่วโมงแรก + ชั่วโมงสอง
 * ...
 * index 24 = รวม 24 ชั่วโมง
 *
 * วิธีบวกยังรักษา truthy/falsy แบบโค้ดเดิม
 */
const getDailyHourlyCumulative = (
  context: NomValueFastContext,
  rowDataItem: any
): Array<number | null> => {
  const cached =
    context.dailyHourlyCumulativeCache.get(
      rowDataItem
    );

  if (cached) {
    return cached;
  }

  const cumulative =
    new Array<number | null>(25).fill(null);

  let acc: number | null = null;

  for (let hour = 1; hour <= 24; hour++) {
    const valuePerHour: number | null =
      parseToNumber(
        rowDataItem?.data_temp?.[
          `${13 + hour}`
        ]
      );

    /**
     * รักษาพฤติกรรมเดิม:
     *
     * if (acc) {
     *   if (valuePerHour) {
     *     acc = acc + valuePerHour
     *   }
     * } else {
     *   acc = valuePerHour
     * }
     */
    if (acc) {
      if (valuePerHour) {
        acc += valuePerHour;
      }
    } else {
      acc = valuePerHour;
    }

    cumulative[hour] = acc;
  }

  context.dailyHourlyCumulativeCache.set(
    rowDataItem,
    cumulative
  );

  return cumulative;
};

/**
 * สร้าง key สำหรับเงื่อนไข row
 */
const createNominationRowKey = (
  evidenItem: any
): string => {
  return createNomKey(
    evidenItem?.point,
    evidenItem?.point_type,
    evidenItem?.area,
    evidenItem?.zone
  );
};

/**
 * หา row ที่ตรงกับเงื่อนไขหลัก พร้อม cache
 *
 * ใช้ isMatch เหมือนเดิมทั้งหมด
 */
const getMatchedNominationRows = (
  context: NomValueFastContext,
  nominationFile: any,
  evidenItem: any
): any[] => {
  let fileCache =
    context.nominationRowsCache.get(
      nominationFile
    );

  if (!fileCache) {
    fileCache = new Map();

    context.nominationRowsCache.set(
      nominationFile,
      fileCache
    );
  }

  const rowKey =
    createNominationRowKey(evidenItem);

  const cached = fileCache.get(rowKey);

  if (cached !== undefined) {
    return cached;
  }

  const matchedRows: any[] = [];

  const isConcept = isMatch(
    "CONCEPT",
    evidenItem?.point_type
  );

  for (
    const rowDataItem of nominationFile?.rowData ?? []
  ) {
    const pointMatched =
      isMatch(
        rowDataItem?.data_temp?.["3"],
        evidenItem?.point
      ) ||
      (
        isConcept &&
        isMatch(
          rowDataItem?.data_temp?.["5"],
          evidenItem?.point
        )
      );

    if (!pointMatched) {
      continue;
    }

    if (
      !isMatch(
        rowDataItem?.data_temp?.["9"],
        "MMBTU/D"
      )
    ) {
      continue;
    }

    if (
      !(
        isMatch(
          rowDataItem?.area_text,
          evidenItem?.area
        ) ||
        isConcept
      )
    ) {
      continue;
    }

    if (
      !isMatch(
        rowDataItem?.zone_text,
        evidenItem?.zone
      )
    ) {
      continue;
    }

    matchedRows.push(rowDataItem);
  }

  fileCache.set(
    rowKey,
    matchedRows
  );

  return matchedRows;
};

/**
 * หา fallback Weekly row
 *
 * จุดสำคัญ:
 * โค้ด fallback เดิมตรวจเฉพาะ column 3
 * ไม่ได้ตรวจ column 5 สำหรับ CONCEPT
 */
const getFallbackWeeklyRow = (
  context: NomValueFastContext,
  nominationFile: any,
  evidenItem: any
): any | undefined => {
  let fileCache =
    context.nominationRowsCache.get(
      nominationFile
    );

  if (!fileCache) {
    fileCache = new Map();

    context.nominationRowsCache.set(
      nominationFile,
      fileCache
    );
  }

  const fallbackKey =
    "FALLBACK" +
    NOM_KEY_SEPARATOR +
    createNominationRowKey(evidenItem);

  const cached = fileCache.get(fallbackKey);

  if (cached !== undefined) {
    return cached[0];
  }

  const isConcept = isMatch(
    "CONCEPT",
    evidenItem?.point_type
  );

  let result: any = undefined;

  for (
    const rowDataItem of nominationFile?.rowData ?? []
  ) {
    if (
      isMatch(
        rowDataItem?.data_temp?.["3"],
        evidenItem?.point
      ) &&
      isMatch(
        rowDataItem?.data_temp?.["9"],
        "MMBTU/D"
      ) &&
      (
        isMatch(
          rowDataItem?.area_text,
          evidenItem?.area
        ) ||
        isConcept
      ) &&
      isMatch(
        rowDataItem?.zone_text,
        evidenItem?.zone
      )
    ) {
      result = rowDataItem;
      break;
    }
  }

  fileCache.set(
    fallbackKey,
    result ? [result] : []
  );

  return result;
};

/**
 * Key ไม่รวม gas_hour
 *
 * ข้อมูลพื้นฐานชุดเดียวกันที่ต่างเฉพาะ gas_hour
 * จะใช้ Daily/Weekly list และ matched rows ร่วมกัน
 */
const createNomBaseKey = (
  evidenItem: any
): string => {
  return createNomKey(
    evidenItem?.gas_day,
    evidenItem?.shipper,
    evidenItem?.contract,
    evidenItem?.point,
    evidenItem?.point_type,
    evidenItem?.area,
    evidenItem?.zone
  );
};

/**
 * เวอร์ชันเร็ว ใช้แทน getNomValue เดิม
 */
export function getNomValueFast({
  context,
  evidenItem
}: {
  context: NomValueFastContext;
  evidenItem: any;
}): number | null {
  let nominationValue: number | null = null;

  try {
    const baseKey =
      createNomBaseKey(evidenItem);

    let baseData =
      context.baseCache.get(baseKey);

    if (!baseData) {
      const dailyKey = createNomKey(
        evidenItem?.gas_day,
        evidenItem?.shipper,
        evidenItem?.contract
      );

      const weeklyKey = createNomKey(
        getNomWeekKey(
          context,
          evidenItem?.gas_day
        ),
        evidenItem?.shipper,
        evidenItem?.contract
      );

      const dailyNominationList =
        context.dailyNominationMap.get(
          dailyKey
        ) ?? [];

      const allWeeklyNominationList =
        context.weeklyNominationMap.get(
          weeklyKey
        ) ?? [];

      const dailyContractIdSet =
        new Set<any>();

      for (const daily of dailyNominationList) {
        dailyContractIdSet.add(
          daily?.contract_code_id
        );
      }

      const weeklyNominationList: any[] = [];

      for (
        const weekly of allWeeklyNominationList
      ) {
        if (
          !dailyContractIdSet.has(
            weekly?.contract_code_id
          )
        ) {
          weeklyNominationList.push(weekly);
        }
      }

      baseData = {
        dailyNominationList,
        weeklyNominationList,
        allWeeklyNominationList,
        dailyContractIdSet,
        dayOfWeek: getNomDayOfWeek(
          context,
          evidenItem?.gas_day
        ),
        resultByGasHour: new Map()
      };

      context.baseCache.set(
        baseKey,
        baseData
      );
    }

    const gasHourRaw =
      evidenItem?.gas_hour;

    /**
     * ใช้ string เป็น cache key เพื่อแยก:
     * undefined, null, "", 0, "0"
     *
     * แม้ค่าที่คำนวณอาจเหมือนกัน แต่เพื่อรักษาพฤติกรรม
     * ของเงื่อนไข if (evidenItem?.gas_hour)
     */
    const gasHourCacheKey =
      `${typeof gasHourRaw}:${String(gasHourRaw)}`;

    if (
      baseData.resultByGasHour.has(
        gasHourCacheKey
      )
    ) {
      return (
        baseData.resultByGasHour.get(
          gasHourCacheKey
        ) ?? null
      );
    }

    const nominationList = [
      ...baseData.dailyNominationList,
      ...baseData.weeklyNominationList
    ];

    for (const nominationFile of nominationList) {
      const matchedRows =
        getMatchedNominationRows(
          context,
          nominationFile,
          evidenItem
        );

      for (const rowDataItem of matchedRows) {
        let newNominationValue:
          | number
          | null = null;

        if (
          nominationFile?.nomination_type_id === 1
        ) {
          newNominationValue =
            parseToNumber(
              rowDataItem?.data_temp?.["38"]
            );

          if (evidenItem?.gas_hour) {
            const numericGasHour =
              Number(evidenItem.gas_hour);

            /**
             * do...while เดิมจะทำอย่างน้อย 1 รอบ
             *
             * gas_hour ปกติควรเป็น 1-24
             */
            let hourCount =
              Number.isFinite(numericGasHour)
                ? Math.ceil(numericGasHour)
                : 1;

            if (hourCount < 1) {
              hourCount = 1;
            }

            /**
             * ปกติไม่เกิน 24
             * ถ้ามากกว่า 24 จะคำนวณต่อแบบเดิมด้านล่าง
             */
            if (hourCount <= 24) {
              newNominationValue =
                getDailyHourlyCumulative(
                  context,
                  rowDataItem
                )[hourCount] ?? null;
            } else {
              let index = 0;
              let acc: number | null = null;

              do {
                const valuePerHour:
                  | number
                  | null = parseToNumber(
                    rowDataItem?.data_temp?.[
                      `${14 + index}`
                    ]
                  );

                if (acc) {
                  if (valuePerHour) {
                    acc += valuePerHour;
                  }
                } else {
                  acc = valuePerHour;
                }

                index++;
              } while (
                index < numericGasHour
              );

              newNominationValue = acc;
            }
          }
        } else {
          newNominationValue =
            parseToNumber(
              rowDataItem?.data_temp?.[
                `${14 + baseData.dayOfWeek}`
              ]
            );

          if (evidenItem?.gas_hour) {
            /**
             * รักษาการ round 4 ตำแหน่ง
             * ตามเส้นหลักของฟังก์ชันเดิม
             */
            newNominationValue =
              Math.round(
                (
                  (newNominationValue / 24) *
                  evidenItem.gas_hour
                ) * 10000
              ) / 10000;
          }
        }

        nominationValue =
          addNomValueLikeOriginal(
            nominationValue,
            newNominationValue
          );
      }

      /**
       * Fallback จาก Daily ไป Weekly
       */
      if (
        !nominationValue &&
        nominationValue !== 0 &&
        nominationFile?.nomination_type_id == 1
      ) {
        try {
          let weeklyThatHaveDailyNomination:
            any = undefined;

          /**
           * เดิม find จาก convertNomFile ทั้งก้อน
           *
           * ตอนนี้ allWeeklyNominationList ถูกจัดกลุ่ม
           * week + shipper + contract และคงลำดับเดิม
           */
          for (
            const weekly of
              baseData.allWeeklyNominationList
          ) {
            if (
              weekly?.group?.id_name ===
                nominationFile?.group?.id_name &&
              weekly?.contract_code?.contract_code ===
                nominationFile?.contract_code
                  ?.contract_code &&
              weekly?.nomination_type_id == 2 &&
              baseData.dailyContractIdSet.has(
                weekly?.contract_code_id
              )
            ) {
              weeklyThatHaveDailyNomination =
                weekly;

              break;
            }
          }

          if (weeklyThatHaveDailyNomination) {
            const weeklyRowDataItem =
              getFallbackWeeklyRow(
                context,
                weeklyThatHaveDailyNomination,
                evidenItem
              );

            if (weeklyRowDataItem?.data_temp) {
              let newNominationValue:
                | number
                | null = parseToNumber(
                  weeklyRowDataItem?.data_temp?.[
                    `${14 + baseData.dayOfWeek}`
                  ]
                );

              if (evidenItem?.gas_hour) {
                /**
                 * Fallback เดิมไม่ได้ round 4 ตำแหน่ง
                 * จึงไม่ round ตรงนี้
                 */
                newNominationValue =
                  (newNominationValue / 24) *
                  evidenItem.gas_hour;
              }

              nominationValue =
                addNomValueLikeOriginal(
                  nominationValue,
                  newNominationValue
                );
            }
          }
        } catch (error) {
          // รักษาพฤติกรรมเดิม
        }
      }
    }

    baseData.resultByGasHour.set(
      gasHourCacheKey,
      nominationValue
    );

    return nominationValue;
  } catch (error) {
    return nominationValue;
  }
}

// ....

type PreparedNomAdjustItem = {
  original: any;
  gasDay: string;
  proratedByHour: number[];
};

type AdjustedNominationBaseCache = {
  targetList: PreparedNomAdjustItem[];
  resultByGasHour: Map<number, number | null>;
};

export type AdjustedNominationContext = {
  nomAdjustByGasDay: Map<
    string,
    PreparedNomAdjustItem[]
  >;

  targetCache: Map<
    string,
    AdjustedNominationBaseCache
  >;

  nomValueContext: NomValueFastContext;
};

const ADJUSTED_KEY_SEPARATOR = "\u001F";

const adjustedKeyValue = (value: any): string => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

/**
 * Key สำหรับค้นหา Adjust Nomination
 * ไม่รวม gas_hour
 */
const createAdjustedBaseKey = (
  evidenItem: any
): string => {
  return [
    evidenItem?.gas_day,
    evidenItem?.point,
    evidenItem?.area,
    evidenItem?.zone,
    evidenItem?.entry_exit,
    evidenItem?.contract,
    evidenItem?.shipper
  ]
    .map(adjustedKeyValue)
    .join(ADJUSTED_KEY_SEPARATOR);
};

/**
 * Key สำหรับ fallback getNomValue
 *
 * ต้องใส่ field ที่ getNomValue ใช้ทั้งหมด
 */
const createFallbackNomValueKey = (
  evidenItem: any
): string => {
  return [
    evidenItem?.gas_day,
    evidenItem?.point,
    evidenItem?.point_type,
    evidenItem?.area,
    evidenItem?.zone,
    evidenItem?.entry_exit,
    evidenItem?.contract,
    evidenItem?.shipper,
    evidenItem?.gas_hour
  ]
    .map(adjustedKeyValue)
    .join(ADJUSTED_KEY_SEPARATOR);
};

const prepareProratedByHour = (
  timeShow: any[]
): number[] => {
  const proratedByHour =
    new Array<number>(24).fill(0);

  const timeShowByHour =
    new Map<number, any[]>();

  for (const timeShowItem of timeShow ?? []) {
    const time = getDayjsFromHHmm(
      timeShowItem?.time
    );

    const hour =
      parseToNumber(time.format("H")) ?? 25;

    if (hour < 0 || hour > 23) {
      continue;
    }

    const preparedItem = {
      original: timeShowItem,
      minute:
        parseToNumber(time.format("m")) ?? 0,
      minutesOfDay: timeToMinutes(
        timeShowItem?.time
      )
    };

    const current =
      timeShowByHour.get(hour);

    if (current) {
      current.push(preparedItem);
    } else {
      timeShowByHour.set(hour, [
        preparedItem
      ]);
    }
  }

  for (let hour = 0; hour < 24; hour++) {
    const hourItems =
      timeShowByHour.get(hour) ?? [];

    hourItems.sort(
      (a: any, b: any) =>
        b.minutesOfDay - a.minutesOfDay
    );

    let thisHourProratedValue = 0;
    let maxMinutes = 60;

    for (const item of hourItems) {
      const adjustMinutes = item.minute;

      if (maxMinutes > adjustMinutes) {
        const usedMinutes =
          maxMinutes - adjustMinutes;

        maxMinutes = adjustMinutes;

        const valuePerMinute =
          item.original?.valuePerHour / 60;

        thisHourProratedValue = parseToNumber8Decimal(
          (thisHourProratedValue ?? 0) + (valuePerMinute * usedMinutes)
        );
      }
    }

    proratedByHour[hour] =
      thisHourProratedValue;
  }

  return proratedByHour;
};

export function createAdjustedNominationContext(
  nomAdjust: any[],
  convertNomFile: any[]
): AdjustedNominationContext {
  const nomAdjustByGasDay = new Map<
    string,
    PreparedNomAdjustItem[]
  >();

  for (const nomAdjustItem of nomAdjust ?? []) {
    const gasDay =
      getTodayNowDDMMYYYYAdd7(
        nomAdjustItem?.gas_day
      ).format("YYYY-MM-DD");

    const preparedItem: PreparedNomAdjustItem = {
      original: nomAdjustItem,
      gasDay,
      proratedByHour:
        prepareProratedByHour(
          nomAdjustItem?.timeShow ?? []
        )
    };

    const current =
      nomAdjustByGasDay.get(gasDay);

    if (current) {
      current.push(preparedItem);
    } else {
      nomAdjustByGasDay.set(
        gasDay,
        [preparedItem]
      );
    }
  }

  return {
    nomAdjustByGasDay,
    targetCache: new Map(),

    /**
     * Index convertNomFile เพียงครั้งเดียว
     */
    nomValueContext:
      createNomValueFastContext(
        convertNomFile ?? []
      )
  };
}

export function getAdjustedNomValueFast({
  context,
  convertNomFile,
  evidenItem,
  allocationMode
}: {
  context: AdjustedNominationContext;
  convertNomFile: any[];
  evidenItem: any;
  allocationMode?: 'eod' | 'intraday';
}): number | null {
  let nominationValue: number | null = null;

  try {
    const baseKey =
      createAdjustedBaseKey(evidenItem);

    let cachedTarget =
      context.targetCache.get(baseKey);

    if (!cachedTarget) {
      const gasDay = adjustedKeyValue(
        evidenItem?.gas_day
      );

      const candidates =
        context.nomAdjustByGasDay.get(gasDay) ??
        [];

      const targetList:
        PreparedNomAdjustItem[] = [];

      for (const preparedItem of candidates) {
        const item = preparedItem.original;

        if (
          isMatch(
            item?.point,
            evidenItem?.point
          ) &&
          isMatch(
            item?.area_text,
            evidenItem?.area
          ) &&
          isMatch(
            item?.zone_text,
            evidenItem?.zone
          ) &&
          isMatch(
            item?.entryExit,
            evidenItem?.entry_exit
          ) &&
          isMatch(
            item?.contract,
            evidenItem?.contract
          ) &&
          isMatch(
            item?.shipper_id_name,
            evidenItem?.shipper
          ) &&
          isMatch(
            preparedItem.gasDay,
            evidenItem?.gas_day
          )
        ) {
          targetList.push(preparedItem);
        }
      }

      cachedTarget = {
        targetList,
        resultByGasHour: new Map()
      };

      context.targetCache.set(
        baseKey,
        cachedTarget
      );
    }

    /**
     * ไม่มี Adjust Nomination
     */
    if (cachedTarget.targetList.length === 0) {
      return getNomValueFast({
        context: context.nomValueContext,
        evidenItem
      });
    }

    const rawGasHour = allocationMode == 'eod' ?
      24
      :
      parseToNumber(
        evidenItem?.gas_hour ?? 0
      );

    const gasHour =
      rawGasHour &&
      Number.isFinite(rawGasHour)
        ? Math.ceil(rawGasHour)
        : 0;

    if (gasHour <= 0) {
      return null;
    }

    if (
      cachedTarget.resultByGasHour.has(
        gasHour
      )
    ) {
      return (
        cachedTarget.resultByGasHour.get(
          gasHour
        ) ?? null
      );
    }

    const maximumHour =
      Math.min(gasHour, 24);

    for (const preparedItem of cachedTarget.targetList) {
      for (
        let hour = 0;
        hour < maximumHour;
        hour++
      ) {
        const proratedValue = parseToNumber3Decimal(preparedItem.proratedByHour[hour] ?? 0);

        if (nominationValue) {
          nominationValue = parseToNumber3Decimal(nominationValue + proratedValue);
        } else {
          nominationValue = proratedValue;
        }
      }
    }

    cachedTarget.resultByGasHour.set(
      gasHour,
      nominationValue
    );

    return nominationValue;
  } catch (error) {
    return nominationValue;
  }
}

/** ถ้า start_date ซ้ำกัน ใช้ record ที่มี create_date ใหม่กว่า (ต้อง sort create_date desc ก่อน) */
export function deduplicateAllocationModesByStartDate(
  modes: allocationModeRecord[],
): allocationModeRecord[] {
  const seen = new Set<string>()
  const result: allocationModeRecord[] = []
  for (const mode of modes) {
    const key = mode.start_date.toISOString()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(mode)
    }
  }
  return result
}

/** หา mode ที่มีผลในวัน gas day นั้น (ใช้ start_date ล่าสุดที่ <= วันนั้น) */
export function getAllocationModeForGasDay(
  modes: allocationModeRecord[],
  gasDay: Parameters<typeof getTodayStartAdd7>[0],
  defaultMode = 'Daily Allocation Mode',
): string {
  const dayDate = getTodayStartAdd7(gasDay).toDate()
  let mode = defaultMode
  for (const record of modes) {
    if (record.start_date <= dayDate) {
      mode = record.allocation_mode_type?.mode ?? mode
    } else {
      break
    }
  }
  return mode
}

/** คืน array ของ gas day (YYYY-MM-DD) ในช่วงที่ allocation mode เป็น Intraday */
export function getIntradayAllocationGasDays(
  modes: allocationModeRecord[],
  startDate: dayjs.Dayjs,
  endDate: dayjs.Dayjs,
): string[] {
  const intradayDays: string[] = []
  let currentDate = startDate.clone()

  while (currentDate.isBefore(endDate, 'day') || currentDate.isSame(endDate, 'day')) {
    if (getAllocationModeForGasDay(modes, currentDate).toLowerCase().includes('intraday')) {
      intradayDays.push(currentDate.format('DD/MM/YYYY'))
    }
    currentDate = currentDate.add(1, 'day')
  }
  return intradayDays
}