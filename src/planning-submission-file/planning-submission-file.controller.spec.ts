import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {PlanningSubmissionFileController} from './planning-submission-file.controller'
import {PlanningSubmissionFileService} from './planning-submission-file.service'

describe('PlanningSubmissionFileController', () => {
  let controller: PlanningSubmissionFileController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            PlanningSubmissionFileController
          ],
          providers: [
            PlanningSubmissionFileService
          ]
        }
      ).compile()

    controller =
      module.get<PlanningSubmissionFileController>(
        PlanningSubmissionFileController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
