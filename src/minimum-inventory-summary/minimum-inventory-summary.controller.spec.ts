import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {MinimumInventorySummaryController} from './minimum-inventory-summary.controller'
import {MinimumInventorySummaryService} from './minimum-inventory-summary.service'

describe('MinimumInventorySummaryController', () => {
  let controller: MinimumInventorySummaryController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            MinimumInventorySummaryController
          ],
          providers: [
            MinimumInventorySummaryService
          ]
        }
      ).compile()

    controller =
      module.get<MinimumInventorySummaryController>(
        MinimumInventorySummaryController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
