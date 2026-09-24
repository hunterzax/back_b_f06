import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {PlanningFileSubmissionTemplateController} from './planning-file-submission-template.controller'
import {PlanningFileSubmissionTemplateService} from './planning-file-submission-template.service'

describe('PlanningFileSubmissionTemplateController', () => {
  let controller: PlanningFileSubmissionTemplateController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            PlanningFileSubmissionTemplateController
          ],
          providers: [
            PlanningFileSubmissionTemplateService
          ]
        }
      ).compile()

    controller =
      module.get<PlanningFileSubmissionTemplateController>(
        PlanningFileSubmissionTemplateController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
