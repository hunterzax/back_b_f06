import {PartialType} from '@nestjs/mapped-types'
import {CreateAccountManageDto} from './create-account-manage.dto'

export class UpdateAccountManageDto extends PartialType(
  CreateAccountManageDto
) {}
