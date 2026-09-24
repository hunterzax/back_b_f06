import {PartialType} from '@nestjs/mapped-types'
import {CreateReleaseUioliSummaryManagementDto} from './create-release-uioli-summary-management.dto'

export class UpdateReleaseUioliSummaryManagementDto extends PartialType(
  CreateReleaseUioliSummaryManagementDto
) {}
