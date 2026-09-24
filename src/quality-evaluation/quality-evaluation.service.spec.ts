import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {QualityEvaluationService} from './quality-evaluation.service'

describe('QualityEvaluationService', () => {
  let service: QualityEvaluationService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            QualityEvaluationService
          ]
        }
      ).compile()

    service =
      module.get<QualityEvaluationService>(
        QualityEvaluationService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
