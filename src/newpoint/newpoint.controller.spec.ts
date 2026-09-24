import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {NewpointController} from './newpoint.controller'
import {NewpointService} from './newpoint.service'

describe('NewpointController', () => {
  let controller: NewpointController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            NewpointController
          ],
          providers: [
            NewpointService
          ]
        }
      ).compile()

    controller =
      module.get<NewpointController>(
        NewpointController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
