import {
  forwardRef,
  Module
} from '@nestjs/common'
import {ParkingAllocationService} from './parking-allocation.service'
import {ParkingAllocationController} from './parking-allocation.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {BalancingService} from 'src/balancing/balancing.service'
import {CapacityMiddleService} from 'src/capacity-v2/capacity-middle.service'
import {UploadTemplateForShipperModule} from 'src/upload-template-for-shipper/upload-template-for-shipper.module'
import {ExportFilesModule} from 'src/export-files/export-files.module'

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
  controllers: [
    ParkingAllocationController
  ],
  providers: [
    ParkingAllocationService,
    BalancingService,
    // CapacityV2Service,
    CapacityMiddleService
  ],
  exports: [
    ParkingAllocationService
  ]
})
export class ParkingAllocationModule {}
