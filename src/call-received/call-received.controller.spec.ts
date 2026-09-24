import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {CallReceivedController} from './call-received.controller'
import {CallReceivedService} from './call-received.service'

describe('CallReceivedController', () => {
  let controller: CallReceivedController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            CallReceivedController
          ],
          providers: [
            CallReceivedService
          ]
        }
      ).compile()

    controller =
      module.get<CallReceivedController>(
        CallReceivedController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
