import {
  forwardRef,
  Module
} from '@nestjs/common'
import {WaitingListService} from './waiting-list.service'
import {WaitingListController} from './waiting-list.controller'
import {AllocationModule} from 'src/allocation/allocation.module'
import {ExportFilesModule} from 'src/export-files/export-files.module'
import {MeteringManagementService} from 'src/metering-management/metering-management.service'
import {CapacityService} from 'src/capacity/capacity.service'
// import { CapacityV2Service } from 'src/capacity-v2/capacity-v2.service';
import {UploadTemplateForShipperService} from 'src/upload-template-for-shipper/upload-template-for-shipper.service'
import {QualityEvaluationService} from 'src/quality-evaluation/quality-evaluation.service'
import {GrpcModule} from 'src/grpc/grpc.module'
import {EventService} from 'src/event/event.service'
import {QueryShipperNominationFileService} from 'src/query-shipper-nomination-file/query-shipper-nomination-file.service'
import {CapacityMiddleService} from 'src/capacity-v2/capacity-middle.service'

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
    WaitingListController
  ],
  providers: [
    WaitingListService,
    MeteringManagementService,
    CapacityService,
    // CapacityV2Service,
    UploadTemplateForShipperService,
    QualityEvaluationService,
    EventService,
    CapacityMiddleService
  ]
})
export class WaitingListModule {}
