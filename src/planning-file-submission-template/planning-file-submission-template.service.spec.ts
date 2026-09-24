import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {PlanningFileSubmissionTemplateService} from './planning-file-submission-template.service'

describe('PlanningFileSubmissionTemplateService', () => {
  let service: PlanningFileSubmissionTemplateService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            PlanningFileSubmissionTemplateService
          ]
        }
      ).compile()

    service =
      module.get<PlanningFileSubmissionTemplateService>(
        PlanningFileSubmissionTemplateService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
