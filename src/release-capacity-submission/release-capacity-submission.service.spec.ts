import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ReleaseCapacitySubmissionService} from './release-capacity-submission.service'

describe('ReleaseCapacitySubmissionService', () => {
  let service: ReleaseCapacitySubmissionService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            ReleaseCapacitySubmissionService
          ]
        }
      ).compile()

    service =
      module.get<ReleaseCapacitySubmissionService>(
        ReleaseCapacitySubmissionService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
