import {PartialType} from '@nestjs/mapped-types'
import {CreateQueryShipperNominationFileDto} from './create-query-shipper-nomination-file.dto'

export class UpdateQueryShipperNominationFileDto extends PartialType(
  CreateQueryShipperNominationFileDto
) {}
