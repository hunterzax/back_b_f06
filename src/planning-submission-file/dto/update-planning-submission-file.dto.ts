import {PartialType} from '@nestjs/mapped-types'
import {CreatePlanningSubmissionFileDto} from './create-planning-submission-file.dto'

export class UpdatePlanningSubmissionFileDto extends PartialType(
  CreatePlanningSubmissionFileDto
) {}
