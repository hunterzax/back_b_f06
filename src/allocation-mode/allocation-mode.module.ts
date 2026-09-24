import {Module} from '@nestjs/common'
import {AllocationModeService} from './allocation-mode.service'
import {AllocationModeController} from './allocation-mode.controller'
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
  providers: [
    AllocationModeService,
    AccountManageService
  ],
  controllers: [
    AllocationModeController
  ],
  exports: [
    AllocationModeService
  ]
})
export class AllocationModeModule {}
