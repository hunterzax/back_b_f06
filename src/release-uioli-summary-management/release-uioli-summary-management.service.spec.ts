import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ReleaseUioliSummaryManagementService} from './release-uioli-summary-management.service'

describe('ReleaseUioliSummaryManagementService', () => {
  let service: ReleaseUioliSummaryManagementService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            ReleaseUioliSummaryManagementService
          ]
        }
      ).compile()

    service =
      module.get<ReleaseUioliSummaryManagementService>(
        ReleaseUioliSummaryManagementService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
