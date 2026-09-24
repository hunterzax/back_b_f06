import {PartialType} from '@nestjs/mapped-types'
import {CreateReserveBalancingGasContractDto} from './create-reserve-balancing-gas-contract.dto'

export class UpdateReserveBalancingGasContractDto extends PartialType(
  CreateReserveBalancingGasContractDto
) {}
