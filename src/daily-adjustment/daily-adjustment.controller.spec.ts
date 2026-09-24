import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {DailyAdjustmentController} from './daily-adjustment.controller'
import {DailyAdjustmentService} from './daily-adjustment.service'

describe('DailyAdjustmentController', () => {
  let controller: DailyAdjustmentController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            DailyAdjustmentController
          ],
          providers: [
            DailyAdjustmentService
          ]
        }
      ).compile()

    controller =
      module.get<DailyAdjustmentController>(
        DailyAdjustmentController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
