import {PartialType} from '@nestjs/mapped-types'
import {CreateDailyAdjustmentDto} from './create-daily-adjustment.dto'

export class UpdateDailyAdjustmentDto extends PartialType(
  CreateDailyAdjustmentDto
) {}
