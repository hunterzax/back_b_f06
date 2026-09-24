import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {SubmissionFileRefactoredService} from './submission-file-refactored.service'

describe('SubmissionFileRefactoredService', () => {
  let service: SubmissionFileRefactoredService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            SubmissionFileRefactoredService
          ]
        }
      ).compile()

    service =
      module.get<SubmissionFileRefactoredService>(
        SubmissionFileRefactoredService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
