import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {CapacityPublicationController} from './capacity-publication.controller'
import {CapacityPublicationService} from './capacity-publication.service'

describe('CapacityPublicationController', () => {
  let controller: CapacityPublicationController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            CapacityPublicationController
          ],
          providers: [
            CapacityPublicationService
          ]
        }
      ).compile()

    controller =
      module.get<CapacityPublicationController>(
        CapacityPublicationController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
