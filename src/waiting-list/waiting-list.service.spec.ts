import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {WaitingListService} from './waiting-list.service'

describe('WaitingListService', () => {
  let service: WaitingListService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            WaitingListService
          ]
        }
      ).compile()

    service =
      module.get<WaitingListService>(
        WaitingListService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
