import {PartialType} from '@nestjs/mapped-types'
import {CreateSubmissionFileDto} from './create-submission-file.dto'

export class UpdateSubmissionFileDto extends PartialType(
  CreateSubmissionFileDto
) {}
