import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {PlanningDashboardService} from './planning-dashboard.service'

describe('PlanningDashboardService', () => {
  let service: PlanningDashboardService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            PlanningDashboardService
          ]
        }
      ).compile()

    service =
      module.get<PlanningDashboardService>(
        PlanningDashboardService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
