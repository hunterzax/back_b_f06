import {PartialType} from '@nestjs/mapped-types'
import {CreateMinimumInventorySummaryDto} from './create-minimum-inventory-summary.dto'

export class UpdateMinimumInventorySummaryDto extends PartialType(
  CreateMinimumInventorySummaryDto
) {}
