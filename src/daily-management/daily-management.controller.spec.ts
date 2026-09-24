import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {DailyManagementController} from './daily-management.controller'
import {DailyManagementService} from './daily-management.service'

describe('DailyManagementController', () => {
  let controller: DailyManagementController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            DailyManagementController
          ],
          providers: [
            DailyManagementService
          ]
        }
      ).compile()

    controller =
      module.get<DailyManagementController>(
        DailyManagementController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
