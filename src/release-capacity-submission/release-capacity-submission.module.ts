import {Module} from '@nestjs/common'
import {ReleaseCapacitySubmissionService} from './release-capacity-submission.service'
import {ReleaseCapacitySubmissionController} from './release-capacity-submission.controller'
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
    ReleaseCapacitySubmissionController
  ],
  providers: [
    ReleaseCapacitySubmissionService,
    AccountManageService
  ],
  exports: [
    ReleaseCapacitySubmissionService
  ]
})
export class ReleaseCapacitySubmissionModule {}
