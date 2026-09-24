import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {PlanningSubmissionFileService} from './planning-submission-file.service'

describe('PlanningSubmissionFileService', () => {
  let service: PlanningSubmissionFileService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            PlanningSubmissionFileService
          ]
        }
      ).compile()

    service =
      module.get<PlanningSubmissionFileService>(
        PlanningSubmissionFileService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
