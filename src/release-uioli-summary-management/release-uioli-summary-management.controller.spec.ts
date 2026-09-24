import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ReleaseUioliSummaryManagementController} from './release-uioli-summary-management.controller'
import {ReleaseUioliSummaryManagementService} from './release-uioli-summary-management.service'

describe('ReleaseUioliSummaryManagementController', () => {
  let controller: ReleaseUioliSummaryManagementController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            ReleaseUioliSummaryManagementController
          ],
          providers: [
            ReleaseUioliSummaryManagementService
          ]
        }
      ).compile()

    controller =
      module.get<ReleaseUioliSummaryManagementController>(
        ReleaseUioliSummaryManagementController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
