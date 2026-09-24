import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {CapacityPublicationService} from './capacity-publication.service'

describe('CapacityPublicationService', () => {
  let service: CapacityPublicationService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            CapacityPublicationService
          ]
        }
      ).compile()

    service =
      module.get<CapacityPublicationService>(
        CapacityPublicationService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
