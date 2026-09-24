import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {CapacityDashboardController} from './capacity-dashboard.controller'
import {CapacityDashboardService} from './capacity-dashboard.service'

describe('CapacityDashboardController', () => {
  let controller: CapacityDashboardController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            CapacityDashboardController
          ],
          providers: [
            CapacityDashboardService
          ]
        }
      ).compile()

    controller =
      module.get<CapacityDashboardController>(
        CapacityDashboardController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
