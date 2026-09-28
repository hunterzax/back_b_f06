import {PrismaService} from 'prisma/prisma.service'
import {getTodayStartAdd7, getTodayNowYYYYMMDDDfaultAdd7, getWeekRange, getTodayNowAdd7} from './date.util'
import {area, concept_point, contract_code, group, metering_point, nomination_point, non_tpa_point, Prisma, query_shipper_nomination_file, zone} from '@prisma/client'
import {includes} from 'lodash'

export const FINISHED_STATUS_IDS = [3, 4, 5, 6] // Accepted, Rejected, Acknowledge, Generated

export enum WAITING_LIST_TARGET_MENUS {
  CAPACITY_CONTRACT = 'Capacity Contract',
  CAPACITY_CONTRACT_MANAGEMENT = 'Capacity Contract Management',
  CAPACITY_CONTRACT_MANAGEMENT_SAVED = 'Capacity Contract Management (Saved)',
  CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED = 'Capacity Contract Management (Confirmed)',
  CAPACITY_CONTRACT_LIST = 'Capacity Contract List',
  CAPACITY_CONTRACT_LIST_SAVED = 'Capacity Contract List (Saved)',
  CAPACITY_CONTRACT_LIST_CONFIRMED = 'Capacity Contract List (Confirmed)',
  RELEASE_CAPACITY = 'Release Capacity Management',
  NOMINATION = 'Nomination',
  NOMINATION_QUERY = 'Query Shipper Nomination File',
  NOMINATION_DAILY_MANAGEMENT = 'Daily Management',
  NOMINATION_WEEKLY_MANAGEMENT = 'Weekly Management',
  NOMINATION_ADJUSTMENT = 'Daily Adjustment',
  ALLOCATION_REVIEW = 'Allocation Review',
  ALLOCATION_MANAGEMENT = 'Allocation Management',
  EVENT_OFFSPEC_GAS = 'Offspec Gas',
  EVENT_EMERGENCY_DIFFICULT_DAY = 'Emergency/Difficult Day',
  EVENT_OF_IF = 'OFO/IF',
  EVENT_OFFSPEC_GAS_ACKNOWLEDGE = 'Offspec Gas (Acknowledge)',
  EVENT_EMERGENCY_DIFFICULT_DAY_ACKNOWLEDGE = 'Emergency/Difficult Day (Acknowledge)',
  EVENT_OF_IF_ACKNOWLEDGE = 'OFO/IF (Acknowledge)'
}

// Export individual constants for direct import
export const CAPACITY_CONTRACT = WAITING_LIST_TARGET_MENUS.CAPACITY_CONTRACT
export const CAPACITY_CONTRACT_MANAGEMENT = WAITING_LIST_TARGET_MENUS.CAPACITY_CONTRACT_MANAGEMENT
export const CAPACITY_CONTRACT_MANAGEMENT_SAVED = WAITING_LIST_TARGET_MENUS.CAPACITY_CONTRACT_MANAGEMENT_SAVED
export const CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED = WAITING_LIST_TARGET_MENUS.CAPACITY_CONTRACT_MANAGEMENT_CONFIRMED
export const CAPACITY_CONTRACT_LIST = WAITING_LIST_TARGET_MENUS.CAPACITY_CONTRACT_LIST
export const CAPACITY_CONTRACT_LIST_SAVED = WAITING_LIST_TARGET_MENUS.CAPACITY_CONTRACT_LIST_SAVED
export const CAPACITY_CONTRACT_LIST_CONFIRMED = WAITING_LIST_TARGET_MENUS.CAPACITY_CONTRACT_LIST_CONFIRMED
export const RELEASE_CAPACITY = WAITING_LIST_TARGET_MENUS.RELEASE_CAPACITY
export const NOMINATION = WAITING_LIST_TARGET_MENUS.NOMINATION
export const NOMINATION_QUERY = WAITING_LIST_TARGET_MENUS.NOMINATION_QUERY
export const NOMINATION_DAILY_MANAGEMENT = WAITING_LIST_TARGET_MENUS.NOMINATION_DAILY_MANAGEMENT
export const NOMINATION_WEEKLY_MANAGEMENT = WAITING_LIST_TARGET_MENUS.NOMINATION_WEEKLY_MANAGEMENT
export const NOMINATION_ADJUSTMENT = WAITING_LIST_TARGET_MENUS.NOMINATION_ADJUSTMENT
export const ALLOCATION_REVIEW = WAITING_LIST_TARGET_MENUS.ALLOCATION_REVIEW
export const ALLOCATION_MANAGEMENT = WAITING_LIST_TARGET_MENUS.ALLOCATION_MANAGEMENT
export const EVENT_OFFSPEC_GAS = WAITING_LIST_TARGET_MENUS.EVENT_OFFSPEC_GAS
export const EVENT_EMERGENCY_DIFFICULT_DAY = WAITING_LIST_TARGET_MENUS.EVENT_EMERGENCY_DIFFICULT_DAY
export const EVENT_OF_IF = WAITING_LIST_TARGET_MENUS.EVENT_OF_IF

export const EVENT_OFFSPEC_GAS_ACKNOWLEDGE = WAITING_LIST_TARGET_MENUS.EVENT_OFFSPEC_GAS_ACKNOWLEDGE
export const EVENT_EMERGENCY_DIFFICULT_DAY_ACKNOWLEDGE = WAITING_LIST_TARGET_MENUS.EVENT_EMERGENCY_DIFFICULT_DAY_ACKNOWLEDGE
export const EVENT_OF_IF_ACKNOWLEDGE = WAITING_LIST_TARGET_MENUS.EVENT_OF_IF_ACKNOWLEDGE

// Helper method to get date range for events
export function getEventDateRange(atDate?: any) {
  const date = getTodayNowAdd7(atDate)
  const eventDateFrom = date.subtract(1, 'month').format('YYYY-MM-DD')
  const eventDateTo = date.add(1, 'year').endOf('year').format('YYYY-MM-DD')
  return {
    eventDateFrom,
    eventDateTo
  }
}

// Helper method to get allocation date range
export function getAllocationDateRange(atDate?: any, startDate?: string, endDate?: string) {
  const date = getTodayNowAdd7(atDate)
  const start = startDate || date.startOf('year').tz('Asia/Bangkok').format('YYYY-MM-DD')
  const end = endDate || date.endOf('day').tz('Asia/Bangkok').format('YYYY-MM-DD')
  return {
    startDate: start,
    endDate: end
  }
}

// Helper method to count waiting documents
export function countWaitingDocuments(documents: any[], groupIdList: number[]): number {
  if (!documents || documents.length === 0) return 0

  const waitingDocs = documents.filter((doc) => !FINISHED_STATUS_IDS.includes(doc?.event_doc_status?.id))

  if (groupIdList.length < 1) return waitingDocs.length

  return waitingDocs.filter((doc) => groupIdList.includes(doc?.group_id)).length
}
