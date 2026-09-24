import {Module} from '@nestjs/common'
import {ReleaseUioliSummaryManagementService} from './release-uioli-summary-management.service'
import {ReleaseUioliSummaryManagementController} from './release-uioli-summary-management.controller'
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
    ReleaseUioliSummaryManagementController
  ],
  providers: [
    ReleaseUioliSummaryManagementService,
    AccountManageService
  ],
  exports: [
    ReleaseUioliSummaryManagementService
  ]
})
export class ReleaseUioliSummaryManagementModule {}
