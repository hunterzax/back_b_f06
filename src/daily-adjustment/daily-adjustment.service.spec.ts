import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {DailyAdjustmentService} from './daily-adjustment.service'

describe('DailyAdjustmentService', () => {
  let service: DailyAdjustmentService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            DailyAdjustmentService
          ]
        }
      ).compile()

    service =
      module.get<DailyAdjustmentService>(
        DailyAdjustmentService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
