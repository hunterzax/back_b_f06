import {Module} from '@nestjs/common'
import {ReserveBalancingGasContractService} from './reserve-balancing-gas-contract.service'
import {ReserveBalancingGasContractController} from './reserve-balancing-gas-contract.controller'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {GrpcModule} from 'src/grpc/grpc.module'

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule
  ],
  controllers: [
    ReserveBalancingGasContractController
  ],
  providers: [
    ReserveBalancingGasContractService,
    AccountManageService
  ],
  exports: [
    ReserveBalancingGasContractService
  ]
})
export class ReserveBalancingGasContractModule {}
