import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {MeteringManagementService} from './metering-management.service'

describe('MeteringManagementService', () => {
  let service: MeteringManagementService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            MeteringManagementService
          ]
        }
      ).compile()

    service =
      module.get<MeteringManagementService>(
        MeteringManagementService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
