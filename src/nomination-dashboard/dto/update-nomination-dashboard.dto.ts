import {PartialType} from '@nestjs/mapped-types'
import {CreateNominationDashboardDto} from './create-nomination-dashboard.dto'

export class UpdateNominationDashboardDto extends PartialType(
  CreateNominationDashboardDto
) {}
