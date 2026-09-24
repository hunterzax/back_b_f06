import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {MinimumInventorySummaryService} from './minimum-inventory-summary.service'

describe('MinimumInventorySummaryService', () => {
  let service: MinimumInventorySummaryService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            MinimumInventorySummaryService
          ]
        }
      ).compile()

    service =
      module.get<MinimumInventorySummaryService>(
        MinimumInventorySummaryService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
