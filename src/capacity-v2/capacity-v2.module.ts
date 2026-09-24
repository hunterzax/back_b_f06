import { Module } from '@nestjs/common';
import { CapacityV2Service } from './capacity-v2.service';
import { CapacityV2Controller } from './capacity-v2.controller';
import { GrpcModule } from 'src/grpc/grpc.module';
import { AccountManageService } from 'src/account-manage/account-manage.service';
import { PathManagementService } from 'src/path-management/path-management.service';
import { CapacityService } from 'src/capacity/capacity.service';
import { UploadTemplateForShipperService } from 'src/upload-template-for-shipper/upload-template-for-shipper.service';
import { CapacityMiddleService } from './capacity-middle.service';
import { CallReceivedService } from 'src/call-received/call-received.service';

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule
  ],
  controllers: [CapacityV2Controller],
  providers: [CapacityV2Service, AccountManageService, PathManagementService, CapacityService, CapacityMiddleService, UploadTemplateForShipperService, CallReceivedService],
  exports:[CapacityV2Service]
})
export class CapacityV2Module {}
