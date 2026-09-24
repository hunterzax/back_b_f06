import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {NominationDashboardService} from './nomination-dashboard.service'

describe('NominationDashboardService', () => {
  let service: NominationDashboardService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            NominationDashboardService
          ]
        }
      ).compile()

    service =
      module.get<NominationDashboardService>(
        NominationDashboardService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
