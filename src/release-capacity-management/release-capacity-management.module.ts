import {Module} from '@nestjs/common'
import {ReleaseCapacityManagementService} from './release-capacity-management.service'
import {ReleaseCapacityManagementController} from './release-capacity-management.controller'
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
    ReleaseCapacityManagementController
  ],
  providers: [
    ReleaseCapacityManagementService,
    AccountManageService,
    ReleaseCapacitySubmissionService
  ],
  exports: [
    ReleaseCapacityManagementService
  ]
})
export class ReleaseCapacityManagementModule {}
