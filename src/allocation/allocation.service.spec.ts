jest.mock('prisma/prisma.service', () => ({
  PrismaService: class PrismaService {}
}), {virtual: true})
jest.mock('src/grpc/metered-service.service', () => ({
  MeteredMicroService: class MeteredMicroService {}
}), {virtual: true})
jest.mock('src/export-files/export-files.service', () => ({
  ExportFilesService: class ExportFilesService {}
}), {virtual: true})
jest.mock('src/metering-management/metering-management.service', () => ({
  MeteringManagementService: class MeteringManagementService {}
}), {virtual: true})
jest.mock('src/capacity/capacity.service', () => ({
  CapacityService: class CapacityService {}
}), {virtual: true})
jest.mock('src/grpc/file-service.service', () => ({
  FileUploadService: class FileUploadService {}
}), {virtual: true})
jest.mock('src/quality-evaluation/quality-evaluation.service', () => ({
  QualityEvaluationService: class QualityEvaluationService {}
}), {virtual: true})
jest.mock('src/common/utils/date.util', () => ({
  getTodayEndAdd7: jest.fn(),
  getTodayEndYYYYMMDDDfaultAdd7: jest.fn(),
  getTodayNow: () => require('dayjs')(),
  getTodayNowAdd7: (date?: any) => require('dayjs')(date),
  getTodayNowDDMMYYYYAdd7: jest.fn(),
  getTodayNowDDMMYYYYDfaultAdd7: jest.fn(),
  getTodayNowYYYYMMDDDfaultAdd7: jest.fn(),
  getTodayStartAdd7: jest.fn(),
  getTodayStartYYYYMMDDDfaultAdd7: jest.fn(),
  getTodayStartDDMMYYYYAdd7: jest.fn(),
  getWeekRange: jest.fn(),
  generateDatesInMonth: jest.fn(),
  timeToMinutes: jest.fn()
}), {virtual: true})
jest.mock('src/common/utils/allocation.util', () => ({
  isMatch: jest.fn(),
  extractAndGenerateDateArray: jest.fn(),
  buildActiveDataForDates: jest.fn(),
  validateContractAndShipper: jest.fn(),
  validatePointByType: jest.fn(),
  transformToShipperReportStructure: jest.fn(),
  ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW: 0,
  ONSHORE_NUMBER_OF_DAYS_AFTER_ALLOCATION_WHEN_SHIPPER_CAN_CREATE_ALLOCATION_REVIEW_DUPLICATE: 0,
  flatEvidenApiResponse: jest.fn(),
  getNomValue: jest.fn(),
  getAdjustedNomValue: jest.fn()
}), {virtual: true})
jest.mock('src/common/utils/balancing.util', () => ({
  findMinMaxExeDate: jest.fn()
}), {virtual: true})
jest.mock('src/common/utils/number.util', () => ({
  parseToNumber: (value: any) => Number(value)
}), {virtual: true})
jest.mock('src/common/utils/tariff.util', () => ({
  systemParameterPopulate: {},
  systemParameterWithRelations: {}
}), {virtual: true})
jest.mock('src/common/utils/inapp.util', () => ({
  middleNotiInapp: jest.fn(),
  middleNotiInappMenuArr: []
}), {virtual: true})
jest.mock('@type/prisma.type', () => ({
  conceptPointPopulate: {},
  conceptPointWithRelations: {},
  meteringPointPopulate: {},
  meteringPointWithRelations: {},
  nominationPointPopulate: {},
  nominationPointWithRelations: {},
  nonTpaPointPopulate: {},
  nonTpaPointWithRelations: {},
  queryShipperNominationFilePopulate: {},
  queryShipperNominationFilePopulateForCal: {},
  queryShipperNominationFileWithRelations: {},
  queryShipperNominationFileWithRelationsForCal: {}
}), {virtual: true})
jest.mock('src/common/utils/nomination.util', () => ({
  findHvFromEntryArea: jest.fn(),
  getAdjustNom: jest.fn()
}), {virtual: true})
jest.mock('src/common/utils/meter.util', () => ({
  shareShipper: jest.fn(),
  parseGasHoursFromRows: jest.fn()
}), {virtual: true})
jest.mock('src/common/utils/async.util', () => ({
  sleep: () => Promise.resolve()
}), {virtual: true})

import { AllocationService } from './allocation.service'

describe('AllocationService continueIntradayExecutionAfterEod', () => {
  let service: AllocationService
  let prisma: any
  let repo: any
  let meteredMicroService: any

  beforeEach(() => {
    prisma = {
      execute_eod: {
        findFirst: jest.fn()
      }
    }
    repo = {
      findLatestOKEodForDate: jest.fn(),
      findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate: jest.fn(),
      findEarliestDailyAdjustmentIntradayRecalculationCandidate: jest.fn(),
      findOKIntradayBeforeHourOnDay: jest.fn(),
      findOKIntradayBeforeHourOrYesterday: jest.fn(),
      createRunNumber: jest.fn(),
      createExerIntradayLog: jest.fn(),
      createLogExecuteIntraday: jest.fn()
    }
    meteredMicroService = {
      sendMessage: jest.fn()
    }

    service = new AllocationService(
      {} as any,
      prisma,
      meteredMicroService,
      {} as any,
      {} as any,
      {} as any,
      repo,
      {} as any
    )
  })

  it('replays only the same-day metering hours at or after the mode-change gas hour', async () => {
    prisma.execute_eod.findFirst.mockResolvedValue({
      status: 'OK',
      start_date: '2026-06-23'
    })
    repo.findLatestOKEodForDate
      .mockResolvedValueOnce({
        id: 101,
        request_number_id: 1001
      })
      .mockResolvedValueOnce({
        id: 100,
        request_number_id: 1000
      })
    repo.findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate.mockResolvedValue({
      modeZoneBaseInventory: {
        id: 14,
        start_date: new Date('2026-06-22T20:00:00.000Z'),
        create_date_num: 1782187812
      },
      modeZoneBaseInventoryEffectiveTime:
        new Date('2026-06-22T20:00:00.000Z'),
      replayStartGasDay:
        '2026-06-23',
      replayStartGasHour:
        6,
      modeZoneBaseInventoryEvaluationReason:
        'effective_time_before_latest_gas_hour_boundary',
      checkedModeZoneBaseInventory: {
        id: 14,
        start_date: new Date('2026-06-22T20:00:00.000Z'),
        create_date_num: 1782187812
      },
      checkedModeZoneBaseInventoryEffectiveTime:
        new Date('2026-06-22T20:00:00.000Z'),
      checkedModeZoneBaseInventoryEvaluationReason:
        'effective_time_before_latest_gas_hour_boundary',
      latestIntraday: {
        execute_timestamp: 1782182054,
        gas_day: '2026-06-23',
        gas_hour: 9
      },
      latestGasHourBoundary:
        new Date('2026-06-23T02:00:00.000Z')
    })
    repo.findEarliestDailyAdjustmentIntradayRecalculationCandidate.mockResolvedValue({
      dailyAdjustment: null,
      dailyAdjustmentEffectiveTime: null,
      dailyAdjustmentEvaluationReason: null,
      checkedDailyAdjustment: null,
      checkedDailyAdjustmentEffectiveTime: null,
      checkedDailyAdjustmentEvaluationReason:
        'no_recent_daily_adjustment_found',
      latestIntraday: {
        execute_timestamp: 1782182054,
        gas_day: '2026-06-23',
        gas_hour: 9
      },
      latestGasHourBoundary:
        new Date('2026-06-23T02:00:00.000Z')
    })
    repo.findOKIntradayBeforeHourOrYesterday.mockResolvedValue([])
    repo.createRunNumber
      .mockResolvedValueOnce(2001)
      .mockResolvedValueOnce(2002)
      .mockResolvedValueOnce(2003)
    repo.createExerIntradayLog.mockResolvedValue(null)
    meteredMicroService.sendMessage
      .mockResolvedValue({
        reply: JSON.stringify([
          {gasHour: 3},
          {gasHour: 6},
          {gasHour: 9},
          {gasHour: 12}
        ])
      })

    jest.spyOn<any, any>(
      service as any,
      'getIntradayExecutionContext'
    ).mockReturnValue({
      yesterday: '2026-06-22',
      today: '2026-06-23',
      currentHour: 10
    })
    jest.spyOn<any, any>(
      service as any,
      'findLatestPublishedRequestNumber'
    ).mockResolvedValue(null)

    await service.continueIntradayExecutionAfterEod(
      12673,
      1782187956
    )

    expect(
      meteredMicroService.sendMessage
    ).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(
        meteredMicroService.sendMessage.mock.calls[0][0]
      )
    ).toEqual({
      case: 'get-gashour',
      mode: 'metering',
      gas_day: '2026-06-23'
    })
    expect(
      repo.findOKIntradayBeforeHourOnDay
    ).not.toHaveBeenCalled()
    expect(
      repo.createExerIntradayLog.mock.calls.map(
        (call: any[]) => call[5]
      )
    ).toEqual([6, 9, 12])
  })

  it('rounds a same-day replay cutoff up to the next available metering hour', async () => {
    prisma.execute_eod.findFirst.mockResolvedValue({
      status: 'OK',
      start_date: '2026-06-23'
    })
    repo.findLatestOKEodForDate
      .mockResolvedValueOnce({
        id: 101,
        request_number_id: 1001
      })
      .mockResolvedValueOnce({
        id: 100,
        request_number_id: 1000
      })
    repo.findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate.mockResolvedValue({
      modeZoneBaseInventory: {
        id: 14,
        start_date: new Date('2026-06-22T20:15:00.000Z'),
        create_date_num: 1782187812
      },
      modeZoneBaseInventoryEffectiveTime:
        new Date('2026-06-22T20:15:00.000Z'),
      replayStartGasDay:
        '2026-06-23',
      replayStartGasHour:
        7,
      modeZoneBaseInventoryEvaluationReason:
        'effective_time_before_latest_gas_hour_boundary',
      checkedModeZoneBaseInventory: {
        id: 14,
        start_date: new Date('2026-06-22T20:15:00.000Z'),
        create_date_num: 1782187812
      },
      checkedModeZoneBaseInventoryEffectiveTime:
        new Date('2026-06-22T20:15:00.000Z'),
      checkedModeZoneBaseInventoryEvaluationReason:
        'effective_time_before_latest_gas_hour_boundary',
      latestIntraday: {
        execute_timestamp: 1782182054,
        gas_day: '2026-06-23',
        gas_hour: 9
      },
      latestGasHourBoundary:
        new Date('2026-06-23T02:00:00.000Z')
    })
    repo.findEarliestDailyAdjustmentIntradayRecalculationCandidate.mockResolvedValue({
      dailyAdjustment: null,
      dailyAdjustmentEffectiveTime: null,
      replayStartGasDay: null,
      replayStartGasHour: null,
      dailyAdjustmentEvaluationReason: null,
      checkedDailyAdjustment: null,
      checkedDailyAdjustmentEffectiveTime: null,
      checkedDailyAdjustmentEvaluationReason:
        'no_recent_daily_adjustment_found',
      latestIntraday: {
        execute_timestamp: 1782182054,
        gas_day: '2026-06-23',
        gas_hour: 9
      },
      latestGasHourBoundary:
        new Date('2026-06-23T02:00:00.000Z')
    })
    repo.findOKIntradayBeforeHourOrYesterday.mockResolvedValue([])
    repo.createRunNumber
      .mockResolvedValueOnce(2001)
      .mockResolvedValueOnce(2002)
    repo.createExerIntradayLog.mockResolvedValue(null)
    meteredMicroService.sendMessage
      .mockResolvedValue({
        reply: JSON.stringify([
          {gasHour: 3},
          {gasHour: 6},
          {gasHour: 9},
          {gasHour: 12}
        ])
      })

    jest.spyOn<any, any>(
      service as any,
      'getIntradayExecutionContext'
    ).mockReturnValue({
      yesterday: '2026-06-22',
      today: '2026-06-23',
      currentHour: 10
    })
    jest.spyOn<any, any>(
      service as any,
      'findLatestPublishedRequestNumber'
    ).mockResolvedValue(null)

    await service.continueIntradayExecutionAfterEod(
      12673,
      1782187956
    )

    expect(
      repo.createExerIntradayLog.mock.calls.map(
        (call: any[]) => call[5]
      )
    ).toEqual([9, 12])
  })

  it('uses the latest-hour metering branch when neither replay trigger qualifies', async () => {
    prisma.execute_eod.findFirst.mockResolvedValue({
      status: 'OK',
      start_date: '2026-06-23'
    })
    repo.findLatestOKEodForDate.mockResolvedValue(null)
    repo.findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate.mockResolvedValue({
      modeZoneBaseInventory: null,
      modeZoneBaseInventoryEffectiveTime: null,
      modeZoneBaseInventoryEvaluationReason: null,
      checkedModeZoneBaseInventory: {
        id: 14,
        start_date: new Date('2026-06-23T02:00:00.000Z'),
        create_date_num: 1782187812
      },
      checkedModeZoneBaseInventoryEffectiveTime:
        new Date('2026-06-23T02:00:00.000Z'),
      checkedModeZoneBaseInventoryEvaluationReason:
        'effective_time_not_before_latest_gas_hour_boundary',
      latestIntraday: {
        execute_timestamp: 1782182054,
        gas_day: '2026-06-23',
        gas_hour: 9
      },
      latestGasHourBoundary:
        new Date('2026-06-23T02:00:00.000Z')
    })
    repo.findEarliestDailyAdjustmentIntradayRecalculationCandidate.mockResolvedValue({
      dailyAdjustment: null,
      dailyAdjustmentEffectiveTime: null,
      dailyAdjustmentEvaluationReason: null,
      checkedDailyAdjustment: {
        id: 33,
        daily_code: 'DA-33',
        gas_day: new Date('2026-06-23T00:00:00.000Z'),
        time: '09:00',
        create_date_num: 1782187813
      },
      checkedDailyAdjustmentEffectiveTime:
        new Date('2026-06-23T02:00:00.000Z'),
      checkedDailyAdjustmentEvaluationReason:
        'effective_time_not_before_latest_gas_hour_boundary',
      latestIntraday: {
        execute_timestamp: 1782182054,
        gas_day: '2026-06-23',
        gas_hour: 9
      },
      latestGasHourBoundary:
        new Date('2026-06-23T02:00:00.000Z')
    })
    repo.findOKIntradayBeforeHourOrYesterday.mockResolvedValue([])
    meteredMicroService.sendMessage.mockResolvedValue({
      reply: JSON.stringify([
        {gasHour: 9}
      ])
    })

    jest.spyOn<any, any>(
      service as any,
      'getIntradayExecutionContext'
    ).mockReturnValue({
      yesterday: '2026-06-22',
      today: '2026-06-23',
      currentHour: 10
    })

    await service.continueIntradayExecutionAfterEod(
      12673,
      1782187956
    )

    expect(
      meteredMicroService.sendMessage
    ).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(
        meteredMicroService.sendMessage.mock.calls[0][0]
      )
    ).toEqual({
      case: 'get-last-gashour',
      mode: 'metering',
      gas_day: '2026-06-23'
    })
  })
})
