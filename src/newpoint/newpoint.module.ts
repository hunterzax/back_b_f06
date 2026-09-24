import {Module} from '@nestjs/common'
import {NewpointService} from './newpoint.service'
import {NewpointController} from './newpoint.controller'
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
    NewpointController
  ],
  providers: [
    NewpointService,
    AccountManageService
  ],
  exports: [NewpointService]
})
export class NewpointModule {}
