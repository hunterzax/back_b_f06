import {Module} from '@nestjs/common'
import {MeteringManagementService} from './metering-management.service'
import {MeteringManagementController} from './metering-management.controller'
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
    MeteringManagementController
  ],
  providers: [
    MeteringManagementService,
    AccountManageService
  ],
  exports: [
    MeteringManagementService
  ]
})
export class MeteringManagementModule {}
