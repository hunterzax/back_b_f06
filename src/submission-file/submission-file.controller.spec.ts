import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {SubmissionFileController} from './submission-file.controller'
import {SubmissionFileRefactoredService} from './submission-file-refactored.service'

describe('SubmissionFileController', () => {
  let controller: SubmissionFileController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            SubmissionFileController
          ],
          providers: [
            SubmissionFileRefactoredService
          ]
        }
      ).compile()

    controller =
      module.get<SubmissionFileController>(
        SubmissionFileController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
