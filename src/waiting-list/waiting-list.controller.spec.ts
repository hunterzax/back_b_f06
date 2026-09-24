import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {WaitingListController} from './waiting-list.controller'
import {WaitingListService} from './waiting-list.service'

describe('WaitingListController', () => {
  let controller: WaitingListController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            WaitingListController
          ],
          providers: [
            WaitingListService
          ]
        }
      ).compile()

    controller =
      module.get<WaitingListController>(
        WaitingListController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
