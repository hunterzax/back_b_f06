import {PartialType} from '@nestjs/mapped-types'
import {CreateCapacityDashboardDto} from './create-capacity-dashboard.dto'

export class UpdateCapacityDashboardDto extends PartialType(
  CreateCapacityDashboardDto
) {}
