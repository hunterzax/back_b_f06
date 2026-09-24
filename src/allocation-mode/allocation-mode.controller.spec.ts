import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {AllocationModeController} from './allocation-mode.controller'
import {AllocationModeService} from './allocation-mode.service'

describe('AllocationModeController', () => {
  let controller: AllocationModeController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            AllocationModeController
          ],
          providers: [
            AllocationModeService
          ]
        }
      ).compile()

    controller =
      module.get<AllocationModeController>(
        AllocationModeController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
