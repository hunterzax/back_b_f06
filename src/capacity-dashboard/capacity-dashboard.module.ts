import {Module} from '@nestjs/common'
import {CapacityDashboardService} from './capacity-dashboard.service'
import {CapacityDashboardController} from './capacity-dashboard.controller'
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
  controllers: [
    CapacityDashboardController
  ],
  providers: [
    CapacityDashboardService,
    AccountManageService
  ],
  exports: [
    CapacityDashboardService
  ]
})
export class CapacityDashboardModule {}
