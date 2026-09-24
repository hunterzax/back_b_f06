import {Module} from '@nestjs/common'
import {PlanningDashboardService} from './planning-dashboard.service'
import {PlanningDashboardController} from './planning-dashboard.controller'
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
    PlanningDashboardController
  ],
  providers: [
    PlanningDashboardService,
    AccountManageService
  ],
  exports: [
    PlanningDashboardService
  ]
})
export class PlanningDashboardModule {}
