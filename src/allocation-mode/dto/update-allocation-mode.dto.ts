import {PartialType} from '@nestjs/mapped-types'
import {CreateAllocationModeDto} from './create-allocation-mode.dto'

export class UpdateAllocationModeDto extends PartialType(
  CreateAllocationModeDto
) {}
