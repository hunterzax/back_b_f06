import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {UseItOrLoseItService} from './use-it-or-lose-it.service'

describe('UseItOrLoseItService', () => {
  let service: UseItOrLoseItService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            UseItOrLoseItService
          ]
        }
      ).compile()

    service =
      module.get<UseItOrLoseItService>(
        UseItOrLoseItService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
