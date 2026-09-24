import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'

jest.mock('prisma/prisma.service', () => ({
  PrismaService: class PrismaService {}
}), {virtual: true})
jest.mock('src/common/utils/number.util', () => ({
  parseToNumber: (value: any) => Number(value)
}), {virtual: true})
jest.mock('src/common/utils/async.util', () => ({
  sleep: () => Promise.resolve()
}), {virtual: true})
jest.mock('src/common/utils/date.util', () => ({
  getTodayNowAdd7: (date?: any) => require('dayjs')(date)
}), {virtual: true})

import {AllocationRepository} from './allocation.repository'

dayjs.extend(utc)

describe('AllocationRepository intraday recalculation helpers', () => {
  let prisma: any
  let repository: AllocationRepository

  beforeEach(() => {
    prisma = {
      execute_intraday: {
        findFirst: jest.fn()
      },
      mode_zone_base_inventory: {
        findMany: jest.fn()
      },
      daily_adjustment: {
        findMany: jest.fn()
      }
    }
    repository = new AllocationRepository(prisma)
  })

  it('maps gas hour 24 to the next Thai midnight boundary', () => {
    const boundary =
      repository.getThaiGasHourBoundary(
        '2026-06-18',
        24
      )

    expect(
      dayjs(boundary).utc().format('YYYY-MM-DD HH:mm:ss')
    ).toBe('2026-06-18 17:00:00')
  })

  it('derives the same replay gas hour for exact-hour effective times', () => {
    expect(
      repository.getReplayStartGasDayAndHour(
        new Date('2026-06-18T23:00:00.000Z')
      )
    ).toEqual({
      gasDay: '2026-06-19',
      gasHour: 6
    })
  })

  it('rounds replay start up to the next gas hour for non-exact effective times', () => {
    expect(
      repository.getReplayStartGasDayAndHour(
        new Date('2026-06-18T23:15:00.000Z')
      )
    ).toEqual({
      gasDay: '2026-06-19',
      gasHour: 7
    })
  })

  it('maps exact Thai midnight replay starts to the previous gas day hour 24', () => {
    expect(
      repository.getReplayStartGasDayAndHour(
        new Date('2026-06-18T17:00:00.000Z')
      )
    ).toEqual({
      gasDay: '2026-06-18',
      gasHour: 24
    })
  })

  it('accepts a candidate created after the latest execute timestamp with a start date before the latest Thai gas hour', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      create_date_num: 1001,
      start_date: new Date('2026-06-18T02:59:59.000Z')
    }

    expect(
      repository.isModeZoneBaseInventoryIntradayRecalculationCandidate(
        candidate,
        latestIntraday
      )
    ).toBe(true)
  })

  it('rejects a candidate created at or before the latest execute timestamp', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      create_date_num: 1000,
      start_date: new Date('2026-06-18T02:59:59.000Z')
    }

    expect(
      repository.isModeZoneBaseInventoryIntradayRecalculationCandidate(
        candidate,
        latestIntraday
      )
    ).toBe(false)
  })

  it('rejects a candidate whose start date is exactly the latest Thai gas hour boundary', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      create_date_num: 1001,
      start_date: new Date('2026-06-18T03:00:00.000Z')
    }

    expect(
      repository.isModeZoneBaseInventoryIntradayRecalculationCandidate(
        candidate,
        latestIntraday
      )
    ).toBe(false)
  })

  it('rejects a candidate whose start date is after the latest Thai gas hour boundary', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      create_date_num: 1001,
      start_date: new Date('2026-06-18T03:00:01.000Z')
    }

    expect(
      repository.isModeZoneBaseInventoryIntradayRecalculationCandidate(
        candidate,
        latestIntraday
      )
    ).toBe(false)
  })

  it('accepts an approved daily adjustment created after the latest execute timestamp with an effective time before the latest Thai gas hour', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      create_date_num: 1001,
      gas_day: new Date('2026-06-18T00:00:00.000Z'),
      time: '09:30'
    }

    expect(
      repository.isDailyAdjustmentIntradayRecalculationCandidate(
        candidate,
        latestIntraday
      )
    ).toBe(true)
  })

  it('rejects a daily adjustment created at or before the latest execute timestamp', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      create_date_num: 1000,
      gas_day: new Date('2026-06-18T00:00:00.000Z'),
      time: '09:30'
    }

    expect(
      repository.isDailyAdjustmentIntradayRecalculationCandidate(
        candidate,
        latestIntraday
      )
    ).toBe(false)
  })

  it('rejects a daily adjustment whose effective time is not before the latest Thai gas hour boundary', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      create_date_num: 1001,
      gas_day: new Date('2026-06-18T00:00:00.000Z'),
      time: '10:00'
    }

    expect(
      repository.isDailyAdjustmentIntradayRecalculationCandidate(
        candidate,
        latestIntraday
      )
    ).toBe(false)
  })

  it('rejects a daily adjustment whose effective time is after the latest Thai gas hour boundary', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      create_date_num: 1001,
      gas_day: new Date('2026-06-18T00:00:00.000Z'),
      time: '10:30'
    }

    expect(
      repository.isDailyAdjustmentIntradayRecalculationCandidate(
        candidate,
        latestIntraday
      )
    ).toBe(false)
  })

  it('rejects daily adjustments with missing or invalid effective-time inputs', () => {
    const latestIntraday = {
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }

    for (const candidate of [
      {
        create_date_num: 1001,
        gas_day: null,
        time: '09:30'
      },
      {
        create_date_num: 1001,
        gas_day: new Date('2026-06-18T00:00:00.000Z'),
        time: null
      },
      {
        create_date_num: 1001,
        gas_day: new Date('2026-06-18T00:00:00.000Z'),
        time: '24:00'
      }
    ]) {
      expect(
        repository.isDailyAdjustmentIntradayRecalculationCandidate(
          candidate,
          latestIntraday
        )
      ).toBe(false)
    }
  })

  it('queries and returns the earliest valid approved daily-adjustment candidate after the latest OK intraday timestamp', async () => {
    const latestIntraday = {
      id: 1,
      request_number_id: 200,
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const laterCandidate = {
      id: 12,
      daily_code: '20260618-DA-0002',
      gas_day: new Date('2026-06-18T00:00:00.000Z'),
      time: '09:30',
      create_date: new Date('2026-06-18T02:10:00.000Z'),
      create_date_num: 1002
    }
    const earliestCandidate = {
      id: 11,
      daily_code: '20260618-DA-0001',
      gas_day: new Date('2026-06-18T00:00:00.000Z'),
      time: '08:45',
      create_date: new Date('2026-06-18T02:15:00.000Z'),
      create_date_num: 1003
    }
    const boundaryCandidate = {
      id: 13,
      daily_code: '20260618-DA-0003',
      gas_day: new Date('2026-06-18T00:00:00.000Z'),
      time: '10:00',
      create_date: new Date('2026-06-18T02:20:00.000Z'),
      create_date_num: 1004
    }

    prisma.execute_intraday.findFirst.mockResolvedValue(
      latestIntraday
    )
    prisma.daily_adjustment.findMany.mockResolvedValue([
      laterCandidate,
      boundaryCandidate,
      earliestCandidate
    ])

    const result =
      await repository.findEarliestDailyAdjustmentIntradayRecalculationCandidate()

    expect(
      prisma.daily_adjustment.findMany
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          daily_adjustment_status: {
            name: 'Approved'
          },
          create_date_num: {
            gt: latestIntraday.execute_timestamp
          },
          gas_day: {
            not: null
          },
          time: {
            not: null
          }
        },
        orderBy: [
          {create_date: 'asc'},
          {id: 'asc'}
        ]
      })
    )
    expect(result).toEqual({
      dailyAdjustment:
        earliestCandidate,
      dailyAdjustmentEffectiveTime:
        repository.getDailyAdjustmentEffectiveTime(
          earliestCandidate
        ),
      replayStartGasDay:
        '2026-06-18',
      replayStartGasHour:
        9,
      dailyAdjustmentEvaluationReason:
        'effective_time_before_latest_gas_hour_boundary',
      checkedDailyAdjustment:
        laterCandidate,
      checkedDailyAdjustmentEffectiveTime:
        repository.getDailyAdjustmentEffectiveTime(
          laterCandidate
        ),
      checkedDailyAdjustmentEvaluationReason:
        'effective_time_before_latest_gas_hour_boundary',
      latestIntraday,
      latestGasHourBoundary:
        repository.getThaiGasHourBoundary(
          latestIntraday.gas_day,
          latestIntraday.gas_hour
        )
    })
  })

  it('does not query daily adjustments when there is no latest OK intraday row', async () => {
    prisma.execute_intraday.findFirst.mockResolvedValue(
      null
    )

    await expect(
      repository.findEarliestDailyAdjustmentIntradayRecalculationCandidate()
    ).resolves.toBeNull()
    expect(
      prisma.daily_adjustment.findMany
    ).not.toHaveBeenCalled()
  })

  it('queries the earliest valid mode-zone base-inventory candidate before the latest OK intraday boundary', async () => {
    const latestIntraday = {
      id: 1,
      request_number_id: 200,
      execute_timestamp: 1000,
      gas_day: '2026-06-18',
      gas_hour: 10
    }
    const candidate = {
      id: 9,
      create_date_num: 1001,
      start_date: new Date('2026-06-18T02:45:00.000Z'),
      create_date: new Date('2026-06-18T03:05:00.000Z'),
      zone: {
        name: 'EAST'
      },
      mode: {
        mode: 'NORMAL'
      }
    }
    const boundaryCandidate = {
      id: 10,
      create_date_num: 1002,
      start_date: new Date('2026-06-18T03:00:00.000Z'),
      create_date: new Date('2026-06-18T03:10:00.000Z'),
      zone: {
        name: 'WEST'
      },
      mode: {
        mode: 'BASE 2'
      }
    }

    prisma.execute_intraday.findFirst.mockResolvedValue(
      latestIntraday
    )
    prisma.mode_zone_base_inventory.findMany.mockResolvedValue([
      candidate,
      boundaryCandidate
    ])

    const result =
      await repository.findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate()

    expect(
      prisma.execute_intraday.findFirst
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            equals: 'OK',
            mode: 'insensitive'
          }
        }),
        orderBy: [
          {gas_day: 'desc'},
          {gas_hour: 'desc'},
          {execute_timestamp: 'desc'}
        ]
      })
    )
    expect(
      prisma.mode_zone_base_inventory.findMany
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          create_date_num: {
            gt: latestIntraday.execute_timestamp
          },
          start_date: {
            not: null
          }
        },
        orderBy: [
          {start_date: 'asc'},
          {create_date: 'asc'},
          {id: 'asc'}
        ]
      })
    )
    expect(result).toEqual({
      modeZoneBaseInventory:
        candidate,
      modeZoneBaseInventoryEffectiveTime:
        repository.getModeZoneBaseInventoryEffectiveTime(
          candidate
        ),
      replayStartGasDay:
        '2026-06-18',
      replayStartGasHour:
        10,
      modeZoneBaseInventoryEvaluationReason:
        'effective_time_before_latest_gas_hour_boundary',
      checkedModeZoneBaseInventory:
        candidate,
      checkedModeZoneBaseInventoryEffectiveTime:
        repository.getModeZoneBaseInventoryEffectiveTime(
          candidate
        ),
      checkedModeZoneBaseInventoryEvaluationReason:
        'effective_time_before_latest_gas_hour_boundary',
      latestIntraday,
      latestGasHourBoundary:
        repository.getThaiGasHourBoundary(
          latestIntraday.gas_day,
          latestIntraday.gas_hour
        )
    })
  })

  it('does not query mode-zone base inventory when there is no latest OK intraday row', async () => {
    prisma.execute_intraday.findFirst.mockResolvedValue(
      null
    )

    await expect(
      repository.findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate()
    ).resolves.toBeNull()
    expect(
      prisma.mode_zone_base_inventory.findMany
    ).not.toHaveBeenCalled()
  })

  it('returns the reported replay candidate when the new mode-zone row became effective before the latest executed boundary', async () => {
    const latestIntraday = {
      id: 7873,
      request_number_id: 12672,
      execute_timestamp: 1782182054,
      gas_day: '2026-06-23',
      gas_hour: 9
    }
    const reportedCandidate = {
      id: 14,
      create_date_num: 1782187812,
      start_date: new Date('2026-06-22T20:00:00.000Z'),
      create_date: new Date('2026-06-22T21:10:12.860Z'),
      zone: {
        name: 'EAST'
      },
      mode: {
        mode: 'Base 2'
      }
    }

    prisma.execute_intraday.findFirst.mockResolvedValue(
      latestIntraday
    )
    prisma.mode_zone_base_inventory.findMany.mockResolvedValue([
      reportedCandidate
    ])

    const result =
      await repository.findEarliestModeZoneBaseInventoryIntradayRecalculationCandidate()

    expect(result?.modeZoneBaseInventory).toEqual(
      reportedCandidate
    )
    expect(
      dayjs(result?.modeZoneBaseInventoryEffectiveTime)
        .utc()
        .format('YYYY-MM-DD HH:mm:ss')
    ).toBe('2026-06-22 20:00:00')
    expect(result?.replayStartGasDay).toBe(
      '2026-06-23'
    )
    expect(result?.replayStartGasHour).toBe(3)
  })
})
