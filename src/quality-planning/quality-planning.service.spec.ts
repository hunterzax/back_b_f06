import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {QualityPlanningService} from './quality-planning.service'

describe('QualityPlanningService', () => {
  let service: QualityPlanningService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            QualityPlanningService
          ]
        }
      ).compile()

    service =
      module.get<QualityPlanningService>(
        QualityPlanningService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
