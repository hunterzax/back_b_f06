import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {NewpointService} from './newpoint.service'

describe('NewpointService', () => {
  let service: NewpointService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            NewpointService
          ]
        }
      ).compile()

    service =
      module.get<NewpointService>(
        NewpointService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
