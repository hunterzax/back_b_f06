import {Module} from '@nestjs/common'
import {UseItOrLoseItService} from './use-it-or-lose-it.service'
import {UseItOrLoseItController} from './use-it-or-lose-it.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {ReleaseCapacitySubmissionService} from 'src/release-capacity-submission/release-capacity-submission.service'

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
    UseItOrLoseItController
  ],
  providers: [
    UseItOrLoseItService,
    AccountManageService,
    ReleaseCapacitySubmissionService
  ],
  exports: [
    UseItOrLoseItService
  ]
})
export class UseItOrLoseItModule {}
