import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {UseItOrLoseItController} from './use-it-or-lose-it.controller'
import {UseItOrLoseItService} from './use-it-or-lose-it.service'

describe('UseItOrLoseItController', () => {
  let controller: UseItOrLoseItController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            UseItOrLoseItController
          ],
          providers: [
            UseItOrLoseItService
          ]
        }
      ).compile()

    controller =
      module.get<UseItOrLoseItController>(
        UseItOrLoseItController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
