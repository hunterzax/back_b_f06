import {PartialType} from '@nestjs/mapped-types'
import {CreateWeeklyManagementDto} from './create-weekly-management.dto'

export class UpdateWeeklyManagementDto extends PartialType(
  CreateWeeklyManagementDto
) {}
