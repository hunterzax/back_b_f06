import {PartialType} from '@nestjs/mapped-types'
import {CreateQualityPlanningDto} from './create-quality-planning.dto'

export class UpdateQualityPlanningDto extends PartialType(
  CreateQualityPlanningDto
) {}
