import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {HvForPerationFlowAndInstructedFlowController} from './hv-for-peration-flow-and-instructed-flow.controller'
import {HvForPerationFlowAndInstructedFlowService} from './hv-for-peration-flow-and-instructed-flow.service'

describe('HvForPerationFlowAndInstructedFlowController', () => {
  let controller: HvForPerationFlowAndInstructedFlowController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            HvForPerationFlowAndInstructedFlowController
          ],
          providers: [
            HvForPerationFlowAndInstructedFlowService
          ]
        }
      ).compile()

    controller =
      module.get<HvForPerationFlowAndInstructedFlowController>(
        HvForPerationFlowAndInstructedFlowController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
