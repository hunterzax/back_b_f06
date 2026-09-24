import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ParkingAllocationController} from './parking-allocation.controller'
import {ParkingAllocationService} from './parking-allocation.service'

describe('ParkingAllocationController', () => {
  let controller: ParkingAllocationController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            ParkingAllocationController
          ],
          providers: [
            ParkingAllocationService
          ]
        }
      ).compile()

    controller =
      module.get<ParkingAllocationController>(
        ParkingAllocationController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
