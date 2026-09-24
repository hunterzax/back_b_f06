import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ReleaseCapacitySubmissionController} from './release-capacity-submission.controller'
import {ReleaseCapacitySubmissionService} from './release-capacity-submission.service'

describe('ReleaseCapacitySubmissionController', () => {
  let controller: ReleaseCapacitySubmissionController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            ReleaseCapacitySubmissionController
          ],
          providers: [
            ReleaseCapacitySubmissionService
          ]
        }
      ).compile()

    controller =
      module.get<ReleaseCapacitySubmissionController>(
        ReleaseCapacitySubmissionController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
