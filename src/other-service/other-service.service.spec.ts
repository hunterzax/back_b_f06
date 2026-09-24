import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {OtherServiceService} from './other-service.service'

describe('OtherServiceService', () => {
  let service: OtherServiceService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            OtherServiceService
          ]
        }
      ).compile()

    service =
      module.get<OtherServiceService>(
        OtherServiceService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
