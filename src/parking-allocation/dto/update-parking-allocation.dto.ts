import {PartialType} from '@nestjs/mapped-types'
import {CreateParkingAllocationDto} from './create-parking-allocation.dto'

export class UpdateParkingAllocationDto extends PartialType(
  CreateParkingAllocationDto
) {}
