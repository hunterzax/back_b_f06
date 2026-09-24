import {PartialType} from '@nestjs/mapped-types'
import {CreateBalancingDto} from './create-balancing.dto'

export class UpdateBalancingDto extends PartialType(
  CreateBalancingDto
) {}
