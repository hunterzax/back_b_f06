import {PartialType} from '@nestjs/mapped-types'
import {CreateUseItOrLoseItDto} from './create-use-it-or-lose-it.dto'

export class UpdateUseItOrLoseItDto extends PartialType(
  CreateUseItOrLoseItDto
) {}
