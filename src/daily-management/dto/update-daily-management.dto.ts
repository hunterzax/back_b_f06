import {PartialType} from '@nestjs/mapped-types'
import {CreateDailyManagementDto} from './create-daily-management.dto'

export class UpdateDailyManagementDto extends PartialType(
  CreateDailyManagementDto
) {}
