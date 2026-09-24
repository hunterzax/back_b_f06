import {PartialType} from '@nestjs/mapped-types'
import {CreateReleaseCapacityManagementDto} from './create-release-capacity-management.dto'

export class UpdateReleaseCapacityManagementDto extends PartialType(
  CreateReleaseCapacityManagementDto
) {}
