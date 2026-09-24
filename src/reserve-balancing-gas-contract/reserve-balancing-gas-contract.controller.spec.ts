import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ReserveBalancingGasContractController} from './reserve-balancing-gas-contract.controller'
import {ReserveBalancingGasContractService} from './reserve-balancing-gas-contract.service'

describe('ReserveBalancingGasContractController', () => {
  let controller: ReserveBalancingGasContractController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            ReserveBalancingGasContractController
          ],
          providers: [
            ReserveBalancingGasContractService
          ]
        }
      ).compile()

    controller =
      module.get<ReserveBalancingGasContractController>(
        ReserveBalancingGasContractController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
