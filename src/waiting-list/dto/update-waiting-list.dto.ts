import {PartialType} from '@nestjs/mapped-types'
import {CreateWaitingListDto} from './create-waiting-list.dto'

export class UpdateWaitingListDto extends PartialType(
  CreateWaitingListDto
) {}
