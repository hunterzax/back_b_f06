import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {BalancingController} from './balancing.controller'
import {BalancingService} from './balancing.service'

describe('BalancingController', () => {
  let controller: BalancingController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            BalancingController
          ],
          providers: [
            BalancingService
          ]
        }
      ).compile()

    controller =
      module.get<BalancingController>(
        BalancingController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
