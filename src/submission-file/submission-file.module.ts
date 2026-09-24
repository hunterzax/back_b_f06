import {Module} from '@nestjs/common'
import {SubmissionFileController} from './submission-file.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {CapacityService} from 'src/capacity/capacity.service'
import {UploadTemplateForShipperService} from 'src/upload-template-for-shipper/upload-template-for-shipper.service'
import {QueryShipperNominationFileService} from 'src/query-shipper-nomination-file/query-shipper-nomination-file.service'
import {CapacityMiddleService} from 'src/capacity-v2/capacity-middle.service'
import {SubmissionFileRefactoredService} from './submission-file-refactored.service'
import {ServicesModule} from './services/services.module'

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule,
    ServicesModule
  ],
  controllers: [
    SubmissionFileController
  ],
  providers: [
    SubmissionFileRefactoredService,
    AccountManageService,
    CapacityService,
    UploadTemplateForShipperService,
    QueryShipperNominationFileService,
    CapacityMiddleService
  ],
  exports: [
    SubmissionFileRefactoredService
  ]
})
export class SubmissionFileModule {}
