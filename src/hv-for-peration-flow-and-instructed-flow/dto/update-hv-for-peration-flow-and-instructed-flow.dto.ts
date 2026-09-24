import {PartialType} from '@nestjs/mapped-types'
import {CreateHvForPerationFlowAndInstructedFlowDto} from './create-hv-for-peration-flow-and-instructed-flow.dto'

export class UpdateHvForPerationFlowAndInstructedFlowDto extends PartialType(
  CreateHvForPerationFlowAndInstructedFlowDto
) {}
