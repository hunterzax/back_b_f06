import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {AllocationModeService} from './allocation-mode.service'

describe('AllocationModeService', () => {
  let service: AllocationModeService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            AllocationModeService
          ]
        }
      ).compile()

    service =
      module.get<AllocationModeService>(
        AllocationModeService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
