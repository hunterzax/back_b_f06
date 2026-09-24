import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {QualityEvaluationController} from './quality-evaluation.controller'
import {QualityEvaluationService} from './quality-evaluation.service'

describe('QualityEvaluationController', () => {
  let controller: QualityEvaluationController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            QualityEvaluationController
          ],
          providers: [
            QualityEvaluationService
          ]
        }
      ).compile()

    controller =
      module.get<QualityEvaluationController>(
        QualityEvaluationController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
