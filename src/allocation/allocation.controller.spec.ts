import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {AllocationController} from './allocation.controller'
import {AllocationService} from './allocation.service'

describe('AllocationController', () => {
  let controller: AllocationController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            AllocationController
          ],
          providers: [
            AllocationService
          ]
        }
      ).compile()

    controller =
      module.get<AllocationController>(
        AllocationController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
