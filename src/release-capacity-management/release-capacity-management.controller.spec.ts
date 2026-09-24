import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ReleaseCapacityManagementController} from './release-capacity-management.controller'
import {ReleaseCapacityManagementService} from './release-capacity-management.service'

describe('ReleaseCapacityManagementController', () => {
  let controller: ReleaseCapacityManagementController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            ReleaseCapacityManagementController
          ],
          providers: [
            ReleaseCapacityManagementService
          ]
        }
      ).compile()

    controller =
      module.get<ReleaseCapacityManagementController>(
        ReleaseCapacityManagementController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
