import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {SummaryNominationReportService} from './summary-nomination-report.service'

describe('SummaryNominationReportService', () => {
  let service: SummaryNominationReportService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            SummaryNominationReportService
          ]
        }
      ).compile()

    service =
      module.get<SummaryNominationReportService>(
        SummaryNominationReportService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
