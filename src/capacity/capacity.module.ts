import {Module} from '@nestjs/common'
import {CapacityService} from './capacity.service'
import {CapacityController} from './capacity.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {PathManagementService} from 'src/path-management/path-management.service'

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
    CapacityController
  ],
  providers: [
    CapacityService,
    AccountManageService
  ],
  exports: [CapacityService]
})
export class CapacityModule {}
