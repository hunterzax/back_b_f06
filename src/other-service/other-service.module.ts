import {Module} from '@nestjs/common'
import {OtherServiceService} from './other-service.service'
import {OtherServiceController} from './other-service.controller'
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
    OtherServiceController
  ],
  providers: [
    OtherServiceService,
    AccountManageService
  ],
  exports: [
    OtherServiceService
  ]
})
export class OtherServiceModule {}
