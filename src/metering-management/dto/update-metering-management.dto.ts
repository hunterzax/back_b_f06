import {PartialType} from '@nestjs/mapped-types'
import {CreateMeteringManagementDto} from './create-metering-management.dto'

export class UpdateMeteringManagementDto extends PartialType(
  CreateMeteringManagementDto
) {}
