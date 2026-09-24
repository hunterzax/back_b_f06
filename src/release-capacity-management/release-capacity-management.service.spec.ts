import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ReleaseCapacityManagementService} from './release-capacity-management.service'

describe('ReleaseCapacityManagementService', () => {
  let service: ReleaseCapacityManagementService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            ReleaseCapacityManagementService
          ]
        }
      ).compile()

    service =
      module.get<ReleaseCapacityManagementService>(
        ReleaseCapacityManagementService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
