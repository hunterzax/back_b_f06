import {Module} from '@nestjs/common'
import {PlanningFileSubmissionTemplateService} from './planning-file-submission-template.service'
import {PlanningFileSubmissionTemplateController} from './planning-file-submission-template.controller'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {GrpcModule} from 'src/grpc/grpc.module'

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
    PlanningFileSubmissionTemplateController
  ],
  providers: [
    PlanningFileSubmissionTemplateService,
    AccountManageService
  ],
  exports: [
    PlanningFileSubmissionTemplateService
  ]
})
export class PlanningFileSubmissionTemplateModule {}
