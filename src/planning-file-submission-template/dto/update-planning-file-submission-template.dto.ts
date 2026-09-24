import {PartialType} from '@nestjs/mapped-types'
import {CreatePlanningFileSubmissionTemplateDto} from './create-planning-file-submission-template.dto'

export class UpdatePlanningFileSubmissionTemplateDto extends PartialType(
  CreatePlanningFileSubmissionTemplateDto
) {}
