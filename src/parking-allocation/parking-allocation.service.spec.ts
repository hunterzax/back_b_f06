import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ParkingAllocationService} from './parking-allocation.service'

describe('ParkingAllocationService', () => {
  let service: ParkingAllocationService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            ParkingAllocationService
          ]
        }
      ).compile()

    service =
      module.get<ParkingAllocationService>(
        ParkingAllocationService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
