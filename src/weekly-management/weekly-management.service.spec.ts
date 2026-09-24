import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {WeeklyManagementService} from './weekly-management.service'

describe('WeeklyManagementService', () => {
  let service: WeeklyManagementService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            WeeklyManagementService
          ]
        }
      ).compile()

    service =
      module.get<WeeklyManagementService>(
        WeeklyManagementService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
