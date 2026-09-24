import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {PathManagementService} from './path-management.service'

describe('PathManagementService', () => {
  let service: PathManagementService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            PathManagementService
          ]
        }
      ).compile()

    service =
      module.get<PathManagementService>(
        PathManagementService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
