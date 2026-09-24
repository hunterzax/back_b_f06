import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {QueryShipperPlanningFileController} from './query-shipper-planning-file.controller'
import {QueryShipperPlanningFileService} from './query-shipper-planning-file.service'

describe('QueryShipperPlanningFileController', () => {
  let controller: QueryShipperPlanningFileController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            QueryShipperPlanningFileController
          ],
          providers: [
            QueryShipperPlanningFileService
          ]
        }
      ).compile()

    controller =
      module.get<QueryShipperPlanningFileController>(
        QueryShipperPlanningFileController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
