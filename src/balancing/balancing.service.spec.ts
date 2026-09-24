import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {BalancingService} from './balancing.service'

describe('BalancingService', () => {
  let service: BalancingService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            BalancingService
          ]
        }
      ).compile()

    service =
      module.get<BalancingService>(
        BalancingService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
