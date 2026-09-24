import {PartialType} from '@nestjs/mapped-types'
import {CreateQualityEvaluationDto} from './create-quality-evaluation.dto'

export class UpdateQualityEvaluationDto extends PartialType(
  CreateQualityEvaluationDto
) {}
