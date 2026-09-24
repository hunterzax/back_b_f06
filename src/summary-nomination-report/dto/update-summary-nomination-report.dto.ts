import {PartialType} from '@nestjs/mapped-types'
import {CreateSummaryNominationReportDto} from './create-summary-nomination-report.dto'

export class UpdateSummaryNominationReportDto extends PartialType(
  CreateSummaryNominationReportDto
) {}
