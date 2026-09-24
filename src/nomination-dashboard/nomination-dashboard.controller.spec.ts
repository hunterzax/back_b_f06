import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {NominationDashboardController} from './nomination-dashboard.controller'
import {NominationDashboardService} from './nomination-dashboard.service'

describe('NominationDashboardController', () => {
  let controller: NominationDashboardController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            NominationDashboardController
          ],
          providers: [
            NominationDashboardService
          ]
        }
      ).compile()

    controller =
      module.get<NominationDashboardController>(
        NominationDashboardController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
