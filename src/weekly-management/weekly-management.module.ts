import {Module} from '@nestjs/common'
import {WeeklyManagementService} from './weekly-management.service'
import {WeeklyManagementController} from './weekly-management.controller'
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
    WeeklyManagementController
  ],
  providers: [
    WeeklyManagementService,
    AccountManageService,
    QueryShipperNominationFileService
  ],
  exports: [
    WeeklyManagementService
  ]
})
export class WeeklyManagementModule {}
