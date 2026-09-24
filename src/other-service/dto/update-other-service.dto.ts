import {PartialType} from '@nestjs/mapped-types'
import {CreateOtherServiceDto} from './create-other-service.dto'

export class UpdateOtherServiceDto extends PartialType(
  CreateOtherServiceDto
) {}
