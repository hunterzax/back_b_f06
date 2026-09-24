import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {HvForPerationFlowAndInstructedFlowService} from './hv-for-peration-flow-and-instructed-flow.service'

describe('HvForPerationFlowAndInstructedFlowService', () => {
  let service: HvForPerationFlowAndInstructedFlowService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            HvForPerationFlowAndInstructedFlowService
          ]
        }
      ).compile()

    service =
      module.get<HvForPerationFlowAndInstructedFlowService>(
        HvForPerationFlowAndInstructedFlowService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
