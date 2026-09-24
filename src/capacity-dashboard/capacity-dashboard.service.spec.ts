import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {CapacityDashboardService} from './capacity-dashboard.service'

describe('CapacityDashboardService', () => {
  let service: CapacityDashboardService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            CapacityDashboardService
          ]
        }
      ).compile()

    service =
      module.get<CapacityDashboardService>(
        CapacityDashboardService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
