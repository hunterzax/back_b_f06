import {Module} from '@nestjs/common'
import {PathManagementService} from './path-management.service'
import {PathManagementController} from './path-management.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {CapacityService} from 'src/capacity/capacity.service'

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
    PathManagementController
  ],
  providers: [
    PathManagementService,
    AccountManageService,
    CapacityService
  ],
  exports: [
    PathManagementService
  ]
})
export class PathManagementModule {}
