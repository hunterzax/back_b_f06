import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {DailyManagementService} from './daily-management.service'

describe('DailyManagementService', () => {
  let service: DailyManagementService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            DailyManagementService
          ]
        }
      ).compile()

    service =
      module.get<DailyManagementService>(
        DailyManagementService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
