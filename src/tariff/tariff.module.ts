import {
  forwardRef,
  Module
} from '@nestjs/common'
import {TariffService} from './tariff.service'
import {TariffController} from './tariff.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AllocationModule} from 'src/allocation/allocation.module'
import {MeteringManagementService} from 'src/metering-management/metering-management.service'
import {ExportFilesModule} from 'src/export-files/export-files.module'
import {CapacityService} from 'src/capacity/capacity.service'
import {BalancingService} from 'src/balancing/balancing.service'
// import { CapacityV2Service } from 'src/capacity-v2/capacity-v2.service';
import {UploadTemplateForShipperService} from 'src/upload-template-for-shipper/upload-template-for-shipper.service'
import {QualityEvaluationService} from 'src/quality-evaluation/quality-evaluation.service'
import {CapacityMiddleService} from 'src/capacity-v2/capacity-middle.service'
import { AllocationRepository } from 'src/allocation/allocation.repository'

@Module({
  imports: [
    GrpcModule,
    forwardRef(
      () => ExportFilesModule
    ),
    forwardRef(
      () => AllocationModule
    )
  ],
  controllers: [
    TariffController
  ],
  providers: [
    TariffService,
    MeteringManagementService,
    CapacityService,
    BalancingService,
    // CapacityV2Service,
    UploadTemplateForShipperService,
    QualityEvaluationService,
    CapacityMiddleService,
    AllocationRepository
  ],
  exports: [TariffService]
})
export class TariffModule {}
