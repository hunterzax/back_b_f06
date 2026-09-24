import {PartialType} from '@nestjs/mapped-types'
import {CreateReleaseCapacitySubmissionDto} from './create-release-capacity-submission.dto'

export class UpdateReleaseCapacitySubmissionDto extends PartialType(
  CreateReleaseCapacitySubmissionDto
) {}
