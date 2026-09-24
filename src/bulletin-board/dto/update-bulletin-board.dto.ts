import {PartialType} from '@nestjs/mapped-types'
import {CreateBulletinBoardDto} from './create-bulletin-board.dto'

export class UpdateBulletinBoardDto extends PartialType(
  CreateBulletinBoardDto
) {}
