import {
  forwardRef,
  Module
} from '@nestjs/common'
import {BalancingService} from './balancing.service'
import {BalancingController} from './balancing.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
// import { CapacityV2Service } from 'src/capacity-v2/capacity-v2.service';
import {UploadTemplateForShipperModule} from 'src/upload-template-for-shipper/upload-template-for-shipper.module'
import {CapacityService} from 'src/capacity/capacity.service'
import {ExportFilesModule} from 'src/export-files/export-files.module'
import {CapacityMiddleService} from 'src/capacity-v2/capacity-middle.service'
import {CallReceivedService} from 'src/call-received/call-received.service'

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule,
    UploadTemplateForShipperModule,
    forwardRef(
      () => ExportFilesModule
    )
  ],
  providers: [
    BalancingService,
    AccountManageService,
    CapacityService,
    CapacityMiddleService,
    CallReceivedService
  ],
  controllers: [
    BalancingController
  ],
  exports: [BalancingService]
})
export class BalancingModule {}
