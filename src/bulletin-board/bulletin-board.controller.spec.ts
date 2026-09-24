import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {BulletinBoardController} from './bulletin-board.controller'
import {BulletinBoardService} from './bulletin-board.service'

describe('BulletinBoardController', () => {
  let controller: BulletinBoardController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            BulletinBoardController
          ],
          providers: [
            BulletinBoardService
          ]
        }
      ).compile()

    controller =
      module.get<BulletinBoardController>(
        BulletinBoardController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
