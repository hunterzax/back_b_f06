import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {QueryShipperNominationFileService} from './query-shipper-nomination-file.service'

describe('QueryShipperNominationFileService', () => {
  let service: QueryShipperNominationFileService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            QueryShipperNominationFileService
          ]
        }
      ).compile()

    service =
      module.get<QueryShipperNominationFileService>(
        QueryShipperNominationFileService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
