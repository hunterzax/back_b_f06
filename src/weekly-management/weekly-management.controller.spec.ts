import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {WeeklyManagementController} from './weekly-management.controller'
import {WeeklyManagementService} from './weekly-management.service'

describe('WeeklyManagementController', () => {
  let controller: WeeklyManagementController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            WeeklyManagementController
          ],
          providers: [
            WeeklyManagementService
          ]
        }
      ).compile()

    controller =
      module.get<WeeklyManagementController>(
        WeeklyManagementController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
