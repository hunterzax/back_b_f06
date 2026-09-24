import {PartialType} from '@nestjs/mapped-types'
import {CreateCapacityPublicationDto} from './create-capacity-publication.dto'

export class UpdateCapacityPublicationDto extends PartialType(
  CreateCapacityPublicationDto
) {}
