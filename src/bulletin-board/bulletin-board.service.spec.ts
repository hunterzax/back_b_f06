import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {BulletinBoardService} from './bulletin-board.service'

describe('BulletinBoardService', () => {
  let service: BulletinBoardService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            BulletinBoardService
          ]
        }
      ).compile()

    service =
      module.get<BulletinBoardService>(
        BulletinBoardService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
