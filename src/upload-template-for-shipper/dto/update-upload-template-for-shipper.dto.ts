import {PartialType} from '@nestjs/mapped-types'
import {CreateUploadTemplateForShipperDto} from './create-upload-template-for-shipper.dto'

export class UpdateUploadTemplateForShipperDto extends PartialType(
  CreateUploadTemplateForShipperDto
) {}
