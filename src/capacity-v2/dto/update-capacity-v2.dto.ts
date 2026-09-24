import { PartialType } from '@nestjs/mapped-types';
import { CreateCapacityV2Dto } from './create-capacity-v2.dto';

export class UpdateCapacityV2Dto extends PartialType(CreateCapacityV2Dto) {}
