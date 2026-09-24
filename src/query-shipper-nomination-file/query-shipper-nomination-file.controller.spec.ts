import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {QueryShipperNominationFileController} from './query-shipper-nomination-file.controller'
import {QueryShipperNominationFileService} from './query-shipper-nomination-file.service'

describe('QueryShipperNominationFileController', () => {
  let controller: QueryShipperNominationFileController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            QueryShipperNominationFileController
          ],
          providers: [
            QueryShipperNominationFileService
          ]
        }
      ).compile()

    controller =
      module.get<QueryShipperNominationFileController>(
        QueryShipperNominationFileController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
