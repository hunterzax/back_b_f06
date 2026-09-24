import {Module} from '@nestjs/common'
import {UploadTemplateForShipperService} from './upload-template-for-shipper.service'
import {UploadTemplateForShipperController} from './upload-template-for-shipper.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
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
    UploadTemplateForShipperController
  ],
  providers: [
    UploadTemplateForShipperService,
    AccountManageService,
    CapacityService
  ],
  exports: [
    UploadTemplateForShipperService
  ]
})
export class UploadTemplateForShipperModule {}
