import {Module} from '@nestjs/common'
import {PlanningSubmissionFileService} from './planning-submission-file.service'
import {PlanningSubmissionFileController} from './planning-submission-file.controller'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {GrpcModule} from 'src/grpc/grpc.module'
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
    PlanningSubmissionFileController
  ],
  providers: [
    PlanningSubmissionFileService,
    AccountManageService,
    CapacityService
  ],
  exports: [
    PlanningSubmissionFileService
  ]
})
export class PlanningSubmissionFileModule {}
