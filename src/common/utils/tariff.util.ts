import {PrismaService} from 'prisma/prisma.service'
import {
  getTodayStartAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getWeekRange,
  getTodayNow
} from './date.util'
import {
  area,
  concept_point,
  contract_code,
  group,
  metering_point,
  nomination_point,
  non_tpa_point,
  Prisma,
  query_shipper_nomination_file,
  zone
} from '@prisma/client'
import {includes} from 'lodash'

import * as dayjs from 'dayjs'
import * as isBetween from 'dayjs/plugin/isBetween'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

dayjs.extend(isBetween)
dayjs.extend(isSameOrBefore)
dayjs.extend(isSameOrAfter)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

export enum TARIFF_SYSTEM_PARAMETER {
  CAPACITY_CHARGE_FEE_ID = 8, //
  ENTRY_LONG_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID = 9,
  ENTRY_MEDIUM_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID = 10,
  ENTRY_SHORT_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID = 11,
  ENTRY_SHORT_TERM_NON_FIRM_CAPACITY_OVER_USE_CHARGE_FEE_ID = 12,
  ENTRY_PER_AREA_CAP_OVER_USE_CHARGE_FEE_ID = 13,
  EXIT_LONG_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID = 14,
  EXIT_LONG_TERM_COMMDOITY_CHARGE_FEE_ID = 15,
  EXIT_MEDIUM_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID = 16,
  EXIT_MEDIUM_TERM_COMMDOITY_CHARGE_FEE_ID = 17,
  EXIT_SHORT_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID = 18,
  EXIT_SHORT_TERM_COMMDOITY_CHARGE_FEE_ID = 19,
  EXIT_SHORT_TERM_NON_FIRM_CAPACITY_OVER_USE_CHARGE_FEE_ID = 20,
  EXIT_SHORT_TERM_NON_FIRM_COMMDOITY_CHARGE_FEE_ID = 21,
  EXIT_PER_AREA_CAP_OVER_USE_CHARGE_FEE_ID = 22,
  LONG_TERM_CAPACITY_CHARGE_FEE_ID = 23,
  MEDIUM_TERM_CAPACITY_CHARGE_FEE_ID = 24,
  SHORT_TERM_CAPACITY_CHARGE_FEE_ID = 25,
  NEGATIVE_BAL_CHARGE_PENALTY_FEE_ID = 26,
  SHORT_TERM_NON_FIRM_CAPACITY_CHARGE_FEE_ID = 27,
  POSITIVE_BAL_CHARGE_PENALTY_FEE_ID = 28,
  ABS_VALUE_ADJ_DAILY_NEGATIVE_IMB_TOLERANCE_ID = 29,
  ENTRY_CAP_OVER_USE_CHARGE_TOLERANCE_ID = 30,
  ENTRY_CAP_OVER_USE_CO_EFF_ID = 40, //
  EXIT_CAP_OVER_USE_CO_EFF_ID = 41, //
  DAMAGE_CHARGE_FEE_ID = 42,
  DAMAGE_CO_EFF_ID = 43, //
  ABS_VALUE_ADJ_DAILY_POSITIVE_IMB_TOLERANCE_ID = 44,
  EXIT_CAP_OVER_USE_CHARGE_TOLERANCE_ID = 45,
  EXIT_COMMDOITY_OVER_USE_FOR_ALL_CONTRACT_TYPE_CHARGE_FEE_ID = 46
}

// Export individual constants for direct import
export const CAPACITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.CAPACITY_CHARGE_FEE_ID
export const ENTRY_LONG_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.ENTRY_LONG_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
export const ENTRY_MEDIUM_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.ENTRY_MEDIUM_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
export const ENTRY_SHORT_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.ENTRY_SHORT_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
export const ENTRY_SHORT_TERM_NON_FIRM_CAPACITY_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.ENTRY_SHORT_TERM_NON_FIRM_CAPACITY_OVER_USE_CHARGE_FEE_ID
export const ENTRY_PER_AREA_CAP_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.ENTRY_PER_AREA_CAP_OVER_USE_CHARGE_FEE_ID
export const EXIT_LONG_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_LONG_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
export const EXIT_LONG_TERM_COMMDOITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_LONG_TERM_COMMDOITY_CHARGE_FEE_ID
export const EXIT_MEDIUM_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_MEDIUM_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
export const EXIT_MEDIUM_TERM_COMMDOITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_MEDIUM_TERM_COMMDOITY_CHARGE_FEE_ID
export const EXIT_SHORT_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_SHORT_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
export const EXIT_SHORT_TERM_COMMDOITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_SHORT_TERM_COMMDOITY_CHARGE_FEE_ID
export const EXIT_SHORT_TERM_NON_FIRM_CAPACITY_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_SHORT_TERM_NON_FIRM_CAPACITY_OVER_USE_CHARGE_FEE_ID
export const EXIT_SHORT_TERM_NON_FIRM_COMMDOITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_SHORT_TERM_NON_FIRM_COMMDOITY_CHARGE_FEE_ID
export const EXIT_PER_AREA_CAP_OVER_USE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_PER_AREA_CAP_OVER_USE_CHARGE_FEE_ID
export const LONG_TERM_CAPACITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.LONG_TERM_CAPACITY_CHARGE_FEE_ID
export const MEDIUM_TERM_CAPACITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.MEDIUM_TERM_CAPACITY_CHARGE_FEE_ID
export const SHORT_TERM_CAPACITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.SHORT_TERM_CAPACITY_CHARGE_FEE_ID
export const NEGATIVE_BAL_CHARGE_PENALTY_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.NEGATIVE_BAL_CHARGE_PENALTY_FEE_ID
export const SHORT_TERM_NON_FIRM_CAPACITY_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.SHORT_TERM_NON_FIRM_CAPACITY_CHARGE_FEE_ID
export const POSITIVE_BAL_CHARGE_PENALTY_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.POSITIVE_BAL_CHARGE_PENALTY_FEE_ID
export const ENTRY_CAP_OVER_USE_CO_EFF_ID =
  TARIFF_SYSTEM_PARAMETER.ENTRY_CAP_OVER_USE_CO_EFF_ID
export const EXIT_CAP_OVER_USE_CO_EFF_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_CAP_OVER_USE_CO_EFF_ID
export const DAMAGE_CO_EFF_ID =
  TARIFF_SYSTEM_PARAMETER.DAMAGE_CO_EFF_ID
export const ABS_VALUE_ADJ_DAILY_NEGATIVE_IMB_TOLERANCE_ID =
  TARIFF_SYSTEM_PARAMETER.ABS_VALUE_ADJ_DAILY_NEGATIVE_IMB_TOLERANCE_ID
export const ENTRY_CAP_OVER_USE_CHARGE_TOLERANCE_ID =
  TARIFF_SYSTEM_PARAMETER.ENTRY_CAP_OVER_USE_CHARGE_TOLERANCE_ID
export const EXIT_CAP_OVER_USE_CHARGE_TOLERANCE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_CAP_OVER_USE_CHARGE_TOLERANCE_ID
export const EXIT_COMMDOITY_OVER_USE_FOR_ALL_CONTRACT_TYPE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.EXIT_COMMDOITY_OVER_USE_FOR_ALL_CONTRACT_TYPE_CHARGE_FEE_ID
export const ABS_VALUE_ADJ_DAILY_POSITIVE_IMB_TOLERANCE_ID =
  TARIFF_SYSTEM_PARAMETER.ABS_VALUE_ADJ_DAILY_POSITIVE_IMB_TOLERANCE_ID
export const DAMAGE_CHARGE_FEE_ID =
  TARIFF_SYSTEM_PARAMETER.DAMAGE_CHARGE_FEE_ID

export const systemParameterPopulate =
  {
    include: {
      system_parameter: true
    }
  }
export type systemParameterWithRelations =
  Prisma.system_parameterGetPayload<
    typeof systemParameterPopulate
  >

export function getLatestSystemParameterValue(
  systemParameterList: systemParameterWithRelations[],
  subSystemParameterIDList: number[]
) {
  try {
    const nowAt =
      getTodayNow()

    // Get entryCapOverCoEff with latest start_date logic
    const targetSystemParameterList =
      systemParameterList.filter(
        (f: any) =>
          subSystemParameterIDList.includes(
            f?.system_parameter_id
          )
      ) || []

    if (
      targetSystemParameterList.length >
      0
    ) {
      let filteredParams =
        targetSystemParameterList

      const acitveSystemParameter =
        targetSystemParameterList.filter(
          (param: any) =>
            param.start_date <=
              nowAt &&
            (param.end_date >=
              nowAt ||
              param.end_date ===
                null)
        )

      if (
        acitveSystemParameter.length >
        0
      ) {
        filteredParams =
          acitveSystemParameter
      }

      if (
        filteredParams.length >
        0
      ) {
        // Get the latest start_date
        const latestParam =
          filteredParams.reduce(
            (
              latest: any,
              current: any
            ) => {
              const latestStartDate =
                dayjs(
                  latest.start_date
                )
              const currentStartDate =
                dayjs(
                  current.start_date
                )
              return currentStartDate.isAfter(
                latestStartDate
              )
                ? current
                : latest
            }
          )

        return latestParam.value
      }
    }

    return null
  } catch (error) {
    return null
  }
}

export function getCapacityChargeFeeSystemParameterIDByTermTypeID(
  term_type_id: number
) {
  switch (term_type_id) {
    case 1:
      return LONG_TERM_CAPACITY_CHARGE_FEE_ID
    case 2:
      return MEDIUM_TERM_CAPACITY_CHARGE_FEE_ID
    case 3:
      return SHORT_TERM_CAPACITY_CHARGE_FEE_ID
    case 4:
      return SHORT_TERM_NON_FIRM_CAPACITY_CHARGE_FEE_ID
    default:
      return null
  }
}

export function getEntryCapacityOveruseChargeFeeSystemParameterIDByTermTypeID(
  term_type_id: number
) {
  switch (term_type_id) {
    case 1:
      return ENTRY_LONG_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
    case 2:
      return ENTRY_MEDIUM_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
    case 3:
      return ENTRY_SHORT_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
    case 4:
      return ENTRY_SHORT_TERM_NON_FIRM_CAPACITY_OVER_USE_CHARGE_FEE_ID
    default:
      return null
  }
}

export function getExitCapacityOveruseChargeFeeSystemParameterIDByTermTypeID(
  term_type_id: number
) {
  switch (term_type_id) {
    case 1:
      return EXIT_LONG_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
    case 2:
      return EXIT_MEDIUM_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
    case 3:
      return EXIT_SHORT_TERM_CAPACITY_OVER_USE_CHARGE_FEE_ID
    case 4:
      return EXIT_SHORT_TERM_NON_FIRM_CAPACITY_OVER_USE_CHARGE_FEE_ID
    default:
      return null
  }
}

export function getExitCommodityChargeFeeSystemParameterIDByTermTypeID(
  term_type_id: number
) {
  switch (term_type_id) {
    case 1:
      return EXIT_LONG_TERM_COMMDOITY_CHARGE_FEE_ID
    case 2:
      return EXIT_MEDIUM_TERM_COMMDOITY_CHARGE_FEE_ID
    case 3:
      return EXIT_SHORT_TERM_COMMDOITY_CHARGE_FEE_ID
    case 4:
      return EXIT_SHORT_TERM_NON_FIRM_COMMDOITY_CHARGE_FEE_ID
    default:
      return null
  }
}
