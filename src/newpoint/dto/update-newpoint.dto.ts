import {PartialType} from '@nestjs/mapped-types'
import {CreateNewpointDto} from './create-newpoint.dto'

export class UpdateNewpointDto extends PartialType(
  CreateNewpointDto
) {}
