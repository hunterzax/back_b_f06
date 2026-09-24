import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ReserveBalancingGasContractService} from './reserve-balancing-gas-contract.service'

describe('ReserveBalancingGasContractService', () => {
  let service: ReserveBalancingGasContractService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            ReserveBalancingGasContractService
          ]
        }
      ).compile()

    service =
      module.get<ReserveBalancingGasContractService>(
        ReserveBalancingGasContractService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
