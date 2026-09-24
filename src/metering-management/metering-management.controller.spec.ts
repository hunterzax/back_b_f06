import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {MeteringManagementController} from './metering-management.controller'
import {MeteringManagementService} from './metering-management.service'

describe('MeteringManagementController', () => {
  let controller: MeteringManagementController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            MeteringManagementController
          ],
          providers: [
            MeteringManagementService
          ]
        }
      ).compile()

    controller =
      module.get<MeteringManagementController>(
        MeteringManagementController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
