import {PartialType} from '@nestjs/mapped-types'
import {CreateAstoDto} from './create-asto.dto'

export class UpdateAstoDto extends PartialType(
  CreateAstoDto
) {}
