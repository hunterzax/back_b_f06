import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {CallReceivedService} from './call-received.service'

describe('CallReceivedService', () => {
  let service: CallReceivedService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            CallReceivedService
          ]
        }
      ).compile()

    service =
      module.get<CallReceivedService>(
        CallReceivedService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
