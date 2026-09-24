import {PartialType} from '@nestjs/mapped-types'
import {CreateQueryShipperPlanningFileDto} from './create-query-shipper-planning-file.dto'

export class UpdateQueryShipperPlanningFileDto extends PartialType(
  CreateQueryShipperPlanningFileDto
) {}
