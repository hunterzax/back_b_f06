import {PartialType} from '@nestjs/mapped-types'
import {CreatePathManagementDto} from './create-path-management.dto'

export class UpdatePathManagementDto extends PartialType(
  CreatePathManagementDto
) {}
