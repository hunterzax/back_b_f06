import {Module} from '@nestjs/common'
import {HvForPerationFlowAndInstructedFlowService} from './hv-for-peration-flow-and-instructed-flow.service'
import {HvForPerationFlowAndInstructedFlowController} from './hv-for-peration-flow-and-instructed-flow.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule
  ],
  // providers: [BalancingService, AccountManageService, CapacityV2Service, CapacityService],
  controllers: [
    HvForPerationFlowAndInstructedFlowController
  ],
  providers: [
    HvForPerationFlowAndInstructedFlowService,
    AccountManageService
  ],
  exports: [
    HvForPerationFlowAndInstructedFlowService
  ]
})
export class HvForPerationFlowAndInstructedFlowModule {}
