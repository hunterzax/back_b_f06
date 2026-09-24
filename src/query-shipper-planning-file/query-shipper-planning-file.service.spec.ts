import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {QueryShipperPlanningFileService} from './query-shipper-planning-file.service'

describe('QueryShipperPlanningFileService', () => {
  let service: QueryShipperPlanningFileService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            QueryShipperPlanningFileService
          ]
        }
      ).compile()

    service =
      module.get<QueryShipperPlanningFileService>(
        QueryShipperPlanningFileService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
