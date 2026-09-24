import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {OtherServiceController} from './other-service.controller'
import {OtherServiceService} from './other-service.service'

describe('OtherServiceController', () => {
  let controller: OtherServiceController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            OtherServiceController
          ],
          providers: [
            OtherServiceService
          ]
        }
      ).compile()

    controller =
      module.get<OtherServiceController>(
        OtherServiceController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
