import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {PlanningDashboardController} from './planning-dashboard.controller'
import {PlanningDashboardService} from './planning-dashboard.service'

describe('PlanningDashboardController', () => {
  let controller: PlanningDashboardController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            PlanningDashboardController
          ],
          providers: [
            PlanningDashboardService
          ]
        }
      ).compile()

    controller =
      module.get<PlanningDashboardController>(
        PlanningDashboardController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
