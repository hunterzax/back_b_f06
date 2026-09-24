import {Module} from '@nestjs/common'
import {QueryShipperPlanningFileService} from './query-shipper-planning-file.service'
import {QueryShipperPlanningFileController} from './query-shipper-planning-file.controller'
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
    QueryShipperPlanningFileController
  ],
  providers: [
    QueryShipperPlanningFileService,
    AccountManageService
  ],
  exports: [
    QueryShipperPlanningFileService
  ]
})
export class QueryShipperPlanningFileModule {}
