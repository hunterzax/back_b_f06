import {Module} from '@nestjs/common'
import {QueryShipperNominationFileService} from './query-shipper-nomination-file.service'
import {QueryShipperNominationFileController} from './query-shipper-nomination-file.controller'
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
    QueryShipperNominationFileController
  ],
  providers: [
    QueryShipperNominationFileService,
    AccountManageService
  ],
  exports: [
    QueryShipperNominationFileService
  ]
})
export class QueryShipperNominationFileModule {}
