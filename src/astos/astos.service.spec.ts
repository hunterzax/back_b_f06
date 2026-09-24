import {AstosService} from './astos.service'
import {AstosUtils} from './astos.utils'

describe('AstosService', () => {
  let service: AstosService

  beforeEach(() => {
    service = new AstosService(
      {} as any,
      new AstosUtils(),
      {} as any,
      {} as any,
      {} as any,
    )
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })

  const mockLmptAdjustmentScenario = (adjustMinute: number, valueH = 10000) => {
    const day = '2026-05-21'
    const point = 'LMPT1'
    const shippers = {ptt: 'PTT', egat: 'EGAT', hkh: 'HKH'}
    const contracts = {
      ptt: ['2026-CNF-007', '2026-CSF-006', '2022-CLF-018_Amd004'],
      egat: ['2026-CMF-001_Amd01', '2026-CSF-T003_Amd01', '2026-CSF-T009_Amd01'],
      hkh: ['2024-CLF-001_Amd02', '2026-CSF-T002'],
    }
    const values = {
      ptt: [2511.282, 1444.524, 6044.194],
      egat: [2000, 2000, 2000],
      hkh: [2000, 2000],
    }
    const groups = new Map<string, any>()
    const baseIndex = new Map<string, any>()
    const byHourPoint = new Map<string, Set<string>>()

    const addSlot = (
      hour: number,
      shipper: string,
      contract: string,
      value: number,
    ) => {
      const rec = {
        point,
        point_type: 'NOM',
        relation_point_type: 'CONTRACT',
        zone: 'EAST',
        entry_exit: 'ENTRY',
        value,
      }
      groups.set(`${day}|${hour}|${contract}|${shipper}`, {
        gas_day: day,
        gas_hour: hour,
        contract,
        shipper,
        data: [rec],
      })
      const key = `${day}|${hour}|${shipper}|${point}`
      const slot = baseIndex.get(key) ?? {
        total: 0,
        members: [],
      }
      slot.total += value
      slot.members.push({
        shipper,
        contract,
        rec,
      })
      baseIndex.set(key, slot)
    }

    for (const hour of [6, 7, 8]) {
      byHourPoint.set(`${day}|${hour}|${point}`, new Set([shippers.ptt, shippers.egat, shippers.hkh]))
      contracts.ptt.forEach((contract, index) =>
        addSlot(hour, shippers.ptt, contract, values.ptt[index]),
      )
      contracts.egat.forEach((contract, index) =>
        addSlot(hour, shippers.egat, contract, values.egat[index]),
      )
      contracts.hkh.forEach((contract, index) =>
        addSlot(hour, shippers.hkh, contract, values.hkh[index]),
      )
    }

    const shipperPointAdj = new Map<string, any[]>([
      [`ADJ3|${shippers.ptt}|${point}`, [{minute: adjustMinute, valueH}]],
      [`ADJ3|${shippers.egat}|${point}`, [{minute: adjustMinute, valueH}]],
    ])

    jest.spyOn(service, 'prepare_daily_adjustment_data').mockResolvedValue({
      byHourPoint,
      orderedAdjCodes: ['ADJ3'],
      hasAdjKey: new Set(Array.from(shipperPointAdj.keys())),
      baseIndex,
      deviders: new Map<string, number>(),
      shipperPointAdj,
      groups,
    } as any)

    return {contracts, shippers}
  }

  const valueOf = (
    result: {
      gas_hour: number
      contract: string
      data: any[]
    }[],
    contract: string,
    hour: number,
  ) => {
    const group = result.find((item) => item.contract === contract && item.gas_hour === hour)
    return group?.data.find((rec: any) => rec.point === 'LMPT1')?.value
  }

  it('does not activate zero-value participants before their all-zero adjustment', async () => {
    const day = '2026-05-21'
    const point = 'POINT-A'
    const shippers = ['SHIP-A', 'SHIP-B', 'SHIP-C']
    const contracts = ['CONTRACT-A', 'CONTRACT-B', 'CONTRACT-C']
    const groups = new Map<string, any>()
    const baseIndex = new Map<string, any>()
    const byHourPoint = new Map<string, Set<string>>()

    const addSlot = (
      hour: number,
      shipper: string,
      contract: string,
      value: number,
    ) => {
      const rec = {
        point,
        point_type: 'NOM',
        relation_point_type: 'CONTRACT',
        zone: 'ZONE-A',
        entry_exit: 'ENTRY',
        value,
      }
      groups.set(`${day}|${hour}|${contract}|${shipper}`, {
        gas_day: day,
        gas_hour: hour,
        contract,
        shipper,
        data: [rec],
      })
      baseIndex.set(`${day}|${hour}|${shipper}|${point}`, {
        total: value,
        members: [
          {
            shipper,
            contract,
            rec,
          },
        ],
      })
    }

    for (let hour = 1; hour <= 7; hour++) {
      byHourPoint.set(`${day}|${hour}|${point}`, new Set(shippers))
      addSlot(hour, shippers[0], contracts[0], 60)
      addSlot(hour, shippers[1], contracts[1], 0)
      addSlot(hour, shippers[2], contracts[2], 0)
    }

    const shipperPointAdj = new Map<string, any[]>([
      [`ADJ1|${shippers[0]}|${point}`, [{minute: 75, valueH: 1000}]],
      [`ADJ1|${shippers[1]}|${point}`, [{minute: 75, valueH: 1000}]],
      [`ADJ1|${shippers[2]}|${point}`, [{minute: 75, valueH: 1000}]],
      [`ADJ2|${shippers[1]}|${point}`, [{minute: 240, valueH: 200}]],
      [`ADJ2|${shippers[2]}|${point}`, [{minute: 240, valueH: 200}]],
      [`ADJ3|${shippers[0]}|${point}`, [{minute: 390, valueH: 300}]],
      [`ADJ3|${shippers[1]}|${point}`, [{minute: 390, valueH: 300}]],
    ])

    jest.spyOn(service, 'prepare_daily_adjustment_data').mockResolvedValue({
      byHourPoint,
      orderedAdjCodes: ['ADJ1', 'ADJ2', 'ADJ3'],
      hasAdjKey: new Set(Array.from(shipperPointAdj.keys())),
      baseIndex,
      deviders: new Map<string, number>(),
      shipperPointAdj,
      groups,
    } as any)

    const result = await service.daily_adjustment_summary({gas_day: day})
    const valueOf = (shipper: string, hour: number) => {
      const group = result.find(
        (item) => item.shipper === shipper && item.gas_hour === hour,
      )
      return group?.data.find((rec: any) => rec.point === point)?.value
    }

    expect(valueOf(shippers[1], 2)).toBe(0)
    expect(valueOf(shippers[2], 2)).toBe(0)
    expect(valueOf(shippers[1], 4)).toBe(0)
    expect(valueOf(shippers[2], 4)).toBe(0)
    expect(valueOf(shippers[1], 5)).toBe(100)
    expect(valueOf(shippers[2], 5)).toBe(100)
    expect(valueOf(shippers[0], 7)).toBe(636.363)
    expect(valueOf(shippers[1], 7)).toBe(63.637)
    expect(valueOf(shippers[2], 7)).toBe(100)
  })

  it('does not prorate a future adjustment because of floating residuals', async () => {
    const day = '2026-05-22'
    const point = 'LMPT2'
    const shippers = {
      egat: 'NGP-S17-002',
      hkh: 'NGP-S20-005',
    }
    const groups = new Map<string, any>()
    const baseIndex = new Map<string, any>()
    const byHourPoint = new Map<string, Set<string>>()

    const addSlot = (
      hour: number,
      shipper: string,
      contract: string,
      value: number,
    ) => {
      const rec = {
        point,
        point_type: 'NOM',
        relation_point_type: 'CONTRACT',
        zone: 'EAST',
        entry_exit: 'ENTRY',
        value,
      }
      groups.set(`${day}|${hour}|${contract}|${shipper}`, {
        gas_day: day,
        gas_hour: hour,
        contract,
        shipper,
        data: [rec],
      })
      const key = `${day}|${hour}|${shipper}|${point}`
      const slot = baseIndex.get(key) ?? {
        total: 0,
        members: [],
      }
      slot.total += value
      slot.members.push({
        shipper,
        contract,
        rec,
      })
      baseIndex.set(key, slot)
    }

    byHourPoint.set(`${day}|1|${point}`, new Set([shippers.egat, shippers.hkh]))
    addSlot(1, shippers.egat, '2026-CMF-001_Amd01', 7637.108)
    addSlot(1, shippers.egat, '2026-CSF-T014_Amd01', 7637.108)
    addSlot(1, shippers.hkh, '2024-CLF-001_Amd02', 8437)

    const shipperPointAdj = new Map<string, any[]>([
      [`ADJ1|${shippers.egat}|${point}`, [{minute: 90, valueH: 10000}]],
      [`ADJ1|${shippers.hkh}|${point}`, [{minute: 90, valueH: 10000}]],
    ])

    jest.spyOn(service, 'prepare_daily_adjustment_data').mockResolvedValue({
      byHourPoint,
      orderedAdjCodes: ['ADJ1'],
      hasAdjKey: new Set(Array.from(shipperPointAdj.keys())),
      baseIndex,
      deviders: new Map<string, number>(),
      shipperPointAdj,
      groups,
    } as any)

    const result = await service.daily_adjustment_summary({gas_day: day})
    const valueOfContract = (contract: string) => {
      const group = result.find((item) => item.contract === contract)
      return group?.data.find((rec: any) => rec.point === point)?.value
    }

    expect(valueOfContract('2026-CMF-001_Amd01')).toBe(7637.108)
    expect(valueOfContract('2026-CSF-T014_Amd01')).toBe(7637.108)
    expect(valueOfContract('2024-CLF-001_Amd02')).toBe(8437)
  })

  it('prorates a daily adjustment that starts exactly at the hour boundary', async () => {
    const {contracts} = mockLmptAdjustmentScenario(360)

    const result = await service.daily_adjustment_summary({
      gas_day: '2026-05-21',
    })

    expect(valueOf(result, contracts.ptt[0], 7)).toBe(1569.551)
    expect(valueOf(result, contracts.ptt[1], 7)).toBe(902.828)
    expect(valueOf(result, contracts.ptt[2], 7)).toBe(3777.621)
    expect(valueOf(result, contracts.egat[0], 7)).toBe(1250)
    expect(valueOf(result, contracts.egat[1], 7)).toBe(1250)
    expect(valueOf(result, contracts.egat[2], 7)).toBe(1250)
    expect(valueOf(result, contracts.hkh[0], 7)).toBe(2000)
    expect(valueOf(result, contracts.hkh[1], 7)).toBe(2000)
    expect(valueOf(result, contracts.ptt[0], 8)).toBe(1569.551)
    expect(valueOf(result, contracts.ptt[1], 8)).toBe(902.828)
    expect(valueOf(result, contracts.ptt[2], 8)).toBe(3777.621)
    expect(valueOf(result, contracts.egat[0], 8)).toBe(1250)
    expect(valueOf(result, contracts.egat[1], 8)).toBe(1250)
    expect(valueOf(result, contracts.egat[2], 8)).toBe(1250)
    expect(valueOf(result, contracts.hkh[0], 8)).toBe(2000)
    expect(valueOf(result, contracts.hkh[1], 8)).toBe(2000)
  })

  it('applies a zero daily adjustment that starts exactly at the hour boundary', async () => {
    const {contracts} = mockLmptAdjustmentScenario(300, 0)

    const result = await service.daily_adjustment_summary({
      gas_day: '2026-05-21',
    })

    expect(valueOf(result, contracts.ptt[0], 6)).toBe(0)
    expect(valueOf(result, contracts.ptt[1], 6)).toBe(0)
    expect(valueOf(result, contracts.ptt[2], 6)).toBe(0)
    expect(valueOf(result, contracts.egat[0], 6)).toBe(0)
    expect(valueOf(result, contracts.egat[1], 6)).toBe(0)
    expect(valueOf(result, contracts.egat[2], 6)).toBe(0)
    expect(valueOf(result, contracts.hkh[0], 6)).toBe(2000)
    expect(valueOf(result, contracts.hkh[1], 6)).toBe(2000)
    expect(valueOf(result, contracts.ptt[0], 7)).toBe(0)
    expect(valueOf(result, contracts.ptt[1], 7)).toBe(0)
    expect(valueOf(result, contracts.ptt[2], 7)).toBe(0)
    expect(valueOf(result, contracts.egat[0], 7)).toBe(0)
    expect(valueOf(result, contracts.egat[1], 7)).toBe(0)
    expect(valueOf(result, contracts.egat[2], 7)).toBe(0)
    expect(valueOf(result, contracts.hkh[0], 7)).toBe(2000)
    expect(valueOf(result, contracts.hkh[1], 7)).toBe(2000)
  })

  it('does not copy a partial-hour adjustment into the following full hour', async () => {
    const {contracts} = mockLmptAdjustmentScenario(390)

    const result = await service.daily_adjustment_summary({
      gas_day: '2026-05-21',
    })

    expect(valueOf(result, contracts.ptt[0], 7)).toBe(2040.417)
    expect(valueOf(result, contracts.ptt[1], 7)).toBe(1173.676)
    expect(valueOf(result, contracts.ptt[2], 7)).toBe(4910.908)
    expect(valueOf(result, contracts.egat[0], 7)).toBe(1625)
    expect(valueOf(result, contracts.egat[1], 7)).toBe(1625)
    expect(valueOf(result, contracts.egat[2], 7)).toBe(1625)
    expect(valueOf(result, contracts.hkh[0], 7)).toBe(2000)
    expect(valueOf(result, contracts.hkh[1], 7)).toBe(2000)
    expect(valueOf(result, contracts.ptt[0], 8)).toBe(1569.551)
    expect(valueOf(result, contracts.ptt[1], 8)).toBe(902.828)
    expect(valueOf(result, contracts.ptt[2], 8)).toBe(3777.621)
    expect(valueOf(result, contracts.egat[0], 8)).toBe(1250)
    expect(valueOf(result, contracts.egat[1], 8)).toBe(1250)
    expect(valueOf(result, contracts.egat[2], 8)).toBe(1250)
    expect(valueOf(result, contracts.hkh[0], 8)).toBe(2000)
    expect(valueOf(result, contracts.hkh[1], 8)).toBe(2000)
  })

  const mockSingleShipperAdjustmentSequence = (
    orderedAdjCodes: string[],
    events: Record<string, {minute: number; valueH: number}>,
    hours: number[],
    initialValue: number,
    contracts = ['CONTRACT-A'],
  ) => {
    const day = '2026-05-26'
    const point = 'POINT-SEQ'
    const shipper = 'SHIP-A'
    const groups = new Map<string, any>()
    const baseIndex = new Map<string, any>()
    const byHourPoint = new Map<string, Set<string>>()

    for (const hour of hours) {
      byHourPoint.set(`${day}|${hour}|${point}`, new Set([shipper]))
      for (const contract of contracts) {
        const rec = {
          point,
          point_type: 'NOM',
          relation_point_type: 'CONTRACT',
          zone: 'EAST',
          entry_exit: 'ENTRY',
          value: initialValue,
        }
        groups.set(`${day}|${hour}|${contract}|${shipper}`, {
          gas_day: day,
          gas_hour: hour,
          contract,
          shipper,
          data: [rec],
        })
        const key = `${day}|${hour}|${shipper}|${point}`
        const slot = baseIndex.get(key) ?? {
          total: 0,
          members: [],
        }
        slot.total += initialValue
        slot.members.push({
          shipper,
          contract,
          rec,
        })
        baseIndex.set(key, slot)
      }
    }

    const shipperPointAdj = new Map<string, any[]>(
      orderedAdjCodes.map((adjCode) => [
        `${adjCode}|${shipper}|${point}`,
        [events[adjCode]],
      ]),
    )

    jest.spyOn(service, 'prepare_daily_adjustment_data').mockResolvedValue({
      byHourPoint,
      orderedAdjCodes,
      hasAdjKey: new Set(Array.from(shipperPointAdj.keys())),
      baseIndex,
      deviders: new Map<string, number>(),
      shipperPointAdj,
      groups,
    } as any)

    return {day, point}
  }

  it('uses the pre-minute base for same-time adjustments in a partial hour', async () => {
    const {point} = mockSingleShipperAdjustmentSequence(
      ['ADJ1', 'ADJ2'],
      {
        ADJ1: {minute: 585, valueH: 10},
        ADJ2: {minute: 585, valueH: 10601.3},
      },
      [10],
      0,
      ['CONTRACT-A', 'CONTRACT-B'],
    )

    const result = await service.daily_adjustment_summary({
      gas_day: '2026-05-26',
    })
    const values = result
      .filter((item) => item.gas_hour === 10)
      .map((item) => item.data.find((rec: any) => rec.point === point)?.value)

    expect(values).toEqual([1325.163, 1325.163])
  })

  it('does not let a later sequence with an earlier time overwrite an earlier sequence boundary', async () => {
    const {point} = mockSingleShipperAdjustmentSequence(
      ['ADJ1', 'ADJ2'],
      {
        ADJ1: {minute: 720, valueH: 300},
        ADJ2: {minute: 540, valueH: 200},
      },
      [12, 13],
      100,
    )

    const result = await service.daily_adjustment_summary({
      gas_day: '2026-05-26',
    })
    const valueAt = (hour: number) =>
      result
        .find((item) => item.gas_hour === hour)
        ?.data.find((rec: any) => rec.point === point)?.value

    expect(valueAt(12)).toBe(200)
    expect(valueAt(13)).toBe(300)
  })

  it('keeps the existing forward-time sequence behavior', async () => {
    const {point} = mockSingleShipperAdjustmentSequence(
      ['ADJ1', 'ADJ2'],
      {
        ADJ1: {minute: 540, valueH: 200},
        ADJ2: {minute: 720, valueH: 300},
      },
      [12, 13],
      100,
    )

    const result = await service.daily_adjustment_summary({
      gas_day: '2026-05-26',
    })
    const valueAt = (hour: number) =>
      result
        .find((item) => item.gas_hour === hour)
        ?.data.find((rec: any) => rec.point === point)?.value

    expect(valueAt(12)).toBe(200)
    expect(valueAt(13)).toBe(300)
  })

  const mockCrossShipperSegmentScenario = (
    orderedAdjCodes: string[],
    events: Record<string, {minute: number; valueH: number}>,
    hourlyValues: Record<number, Record<string, number>>,
  ) => {
    const day = '2026-05-27'
    const point = 'POINT-CROSS'
    const contractShippers: Record<string, string> = {
      'CONTRACT-A1': 'SHIP-A',
      'CONTRACT-A2': 'SHIP-A',
      'CONTRACT-B1': 'SHIP-B',
    }
    const groups = new Map<string, any>()
    const baseIndex = new Map<string, any>()
    const byHourPoint = new Map<string, Set<string>>()

    for (const [hourRaw, valuesByContract] of Object.entries(hourlyValues)) {
      const hour = Number(hourRaw)
      byHourPoint.set(`${day}|${hour}|${point}`, new Set(['SHIP-A', 'SHIP-B']))
      for (const [contract, value] of Object.entries(valuesByContract)) {
        const shipper = contractShippers[contract]
        const rec = {
          point,
          point_type: 'NOM',
          relation_point_type: 'CONTRACT',
          zone: 'EAST',
          entry_exit: 'ENTRY',
          value,
        }
        groups.set(`${day}|${hour}|${contract}|${shipper}`, {
          gas_day: day,
          gas_hour: hour,
          contract,
          shipper,
          data: [rec],
        })
        const key = `${day}|${hour}|${shipper}|${point}`
        const slot = baseIndex.get(key) ?? {
          total: 0,
          members: [],
        }
        slot.total += value
        slot.members.push({
          shipper,
          contract,
          rec,
        })
        baseIndex.set(key, slot)
      }
    }

    const shipperPointAdj = new Map<string, any[]>()
    for (const adjCode of orderedAdjCodes) {
      for (const shipper of ['SHIP-A', 'SHIP-B']) {
        shipperPointAdj.set(`${adjCode}|${shipper}|${point}`, [
          events[adjCode],
        ])
      }
    }

    jest.spyOn(service, 'prepare_daily_adjustment_data').mockResolvedValue({
      byHourPoint,
      orderedAdjCodes,
      hasAdjKey: new Set(Array.from(shipperPointAdj.keys())),
      baseIndex,
      deviders: new Map<string, number>(),
      shipperPointAdj,
      groups,
    } as any)

    const valueAt = async (contract: string, hour: number) => {
      const result = await service.daily_adjustment_summary({gas_day: day})
      const group = result.find(
        (item) => item.contract === contract && item.gas_hour === hour,
      )
      return group?.data.find((rec: any) => rec.point === point)?.value
    }

    return {day, point, valueAt}
  }

  it('recalculates the same cross-shipper target when the current hour ratio changes', async () => {
    const {day, point} = mockCrossShipperSegmentScenario(
      ['ADJ1'],
      {
        ADJ1: {minute: 0, valueH: 100},
      },
      {
        1: {
          'CONTRACT-A1': 50,
          'CONTRACT-A2': 50,
          'CONTRACT-B1': 100,
        },
        2: {
          'CONTRACT-A1': 80,
          'CONTRACT-A2': 20,
          'CONTRACT-B1': 100,
        },
      },
    )

    const result = await service.daily_adjustment_summary({gas_day: day})
    const valueAt = (contract: string, hour: number) => {
      const group = result.find(
        (item) => item.contract === contract && item.gas_hour === hour,
      )
      return group?.data.find((rec: any) => rec.point === point)?.value
    }

    expect(valueAt('CONTRACT-A1', 1)).toBe(25)
    expect(valueAt('CONTRACT-A2', 1)).toBe(25)
    expect(valueAt('CONTRACT-B1', 1)).toBe(50)
    expect(valueAt('CONTRACT-A1', 2)).toBe(40)
    expect(valueAt('CONTRACT-A2', 2)).toBe(10)
    expect(valueAt('CONTRACT-B1', 2)).toBe(50)
  })

  it('lets a same-time later record replace the earlier record with the pre-minute ratio', async () => {
    const {day, point} = mockCrossShipperSegmentScenario(
      ['ADJ1', 'ADJ2'],
      {
        ADJ1: {minute: 0, valueH: 60},
        ADJ2: {minute: 0, valueH: 120},
      },
      {
        1: {
          'CONTRACT-A1': 50,
          'CONTRACT-A2': 50,
          'CONTRACT-B1': 100,
        },
      },
    )

    const result = await service.daily_adjustment_summary({gas_day: day})
    const valueAt = (contract: string) => {
      const group = result.find((item) => item.contract === contract)
      return group?.data.find((rec: any) => rec.point === point)?.value
    }

    expect(valueAt('CONTRACT-A1')).toBe(30)
    expect(valueAt('CONTRACT-A2')).toBe(30)
    expect(valueAt('CONTRACT-B1')).toBe(60)
  })

  it('blends a boundary hour when a later record has an earlier effective time', async () => {
    const {day, point} = mockCrossShipperSegmentScenario(
      ['ADJ1', 'ADJ2'],
      {
        ADJ1: {minute: 930, valueH: 300},
        ADJ2: {minute: 660, valueH: 200},
      },
      {
        16: {
          'CONTRACT-A1': 50,
          'CONTRACT-A2': 50,
          'CONTRACT-B1': 100,
        },
      },
    )

    const result = await service.daily_adjustment_summary({gas_day: day})
    const valueAt = (contract: string) => {
      const group = result.find((item) => item.contract === contract)
      return group?.data.find((rec: any) => rec.point === point)?.value
    }

    expect(valueAt('CONTRACT-A1')).toBe(62.5)
    expect(valueAt('CONTRACT-A2')).toBe(62.5)
    expect(valueAt('CONTRACT-B1')).toBe(125)
  })

  it('replaces an earlier interval without overwriting a later interval', async () => {
    const {day, point} = mockCrossShipperSegmentScenario(
      ['ADJ1', 'ADJ2', 'ADJ3'],
      {
        ADJ1: {minute: 660, valueH: 200},
        ADJ2: {minute: 930, valueH: 300},
        ADJ3: {minute: 660, valueH: 400},
      },
      {
        16: {
          'CONTRACT-A1': 50,
          'CONTRACT-A2': 50,
          'CONTRACT-B1': 100,
        },
      },
    )

    const result = await service.daily_adjustment_summary({gas_day: day})
    const valueAt = (contract: string) => {
      const group = result.find((item) => item.contract === contract)
      return group?.data.find((rec: any) => rec.point === point)?.value
    }

    expect(valueAt('CONTRACT-A1')).toBe(87.5)
    expect(valueAt('CONTRACT-A2')).toBe(87.5)
    expect(valueAt('CONTRACT-B1')).toBe(175)
  })

  it('uses rounded segment values as the next adjustment ratio state', async () => {
    const {day, point} = mockCrossShipperSegmentScenario(
      ['ADJ1', 'ADJ2'],
      {
        ADJ1: {minute: 0, valueH: 1},
        ADJ2: {minute: 30, valueH: 2},
      },
      {
        1: {
          'CONTRACT-A1': 1,
          'CONTRACT-A2': 1,
          'CONTRACT-B1': 4,
        },
      },
    )

    const result = await service.daily_adjustment_summary({gas_day: day})
    const valueAt = (contract: string) => {
      const group = result.find((item) => item.contract === contract)
      return group?.data.find((rec: any) => rec.point === point)?.value
    }

    expect(valueAt('CONTRACT-A1')).toBe(0.251)
    expect(valueAt('CONTRACT-A2')).toBe(0.251)
    expect(valueAt('CONTRACT-B1')).toBe(1)
  })
})
