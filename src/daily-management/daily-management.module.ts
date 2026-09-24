import {Module} from '@nestjs/common'
import {DailyManagementService} from './daily-management.service'
import {DailyManagementController} from './daily-management.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {QueryShipperNominationFileService} from 'src/query-shipper-nomination-file/query-shipper-nomination-file.service'

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
    DailyManagementController
  ],
  providers: [
    DailyManagementService,
    AccountManageService,
    QueryShipperNominationFileService
  ],
  exports: [
    DailyManagementService
  ]
})
export class DailyManagementModule {}
