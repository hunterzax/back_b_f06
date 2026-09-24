import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {SummaryNominationReportController} from './summary-nomination-report.controller'
import {SummaryNominationReportService} from './summary-nomination-report.service'

describe('SummaryNominationReportController', () => {
  let controller: SummaryNominationReportController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            SummaryNominationReportController
          ],
          providers: [
            SummaryNominationReportService
          ]
        }
      ).compile()

    controller =
      module.get<SummaryNominationReportController>(
        SummaryNominationReportController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
