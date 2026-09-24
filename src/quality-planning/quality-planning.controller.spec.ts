import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {QualityPlanningController} from './quality-planning.controller'
import {QualityPlanningService} from './quality-planning.service'

describe('QualityPlanningController', () => {
  let controller: QualityPlanningController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            QualityPlanningController
          ],
          providers: [
            QualityPlanningService
          ]
        }
      ).compile()

    controller =
      module.get<QualityPlanningController>(
        QualityPlanningController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
