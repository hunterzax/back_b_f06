import {PartialType} from '@nestjs/mapped-types'
import {CreatePlanningDashboardDto} from './create-planning-dashboard.dto'

export class UpdatePlanningDashboardDto extends PartialType(
  CreatePlanningDashboardDto
) {}
