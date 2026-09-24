import {
  forwardRef,
  Module
} from '@nestjs/common'
import {ExportFilesService} from './export-files.service'
import {ExportFilesController} from './export-files.controller'
import {ExportFileTariffService} from './export-file-tariff.service'
import {ExportFileTariffCommodityService} from './export-file-tariff-commodity.service'
import {ExportFileTariffCommodityA2Service} from './export-file-tariff-commodity-a2.service'
import {ExportFileTariffCommodityBService} from './export-file-tariff-commodity-b.service'
import {GrpcModule} from 'src/grpc/grpc.module'
// import Modules ที่ต้องการใช้ Service ด้วย
import {AccountManageModule} from 'src/account-manage/account-manage.module'
import {CapacityModule} from 'src/capacity/capacity.module'
import {AllocationModule} from 'src/allocation/allocation.module'
import {PathManagementModule} from 'src/path-management/path-management.module'
import {UploadTemplateForShipperModule} from 'src/upload-template-for-shipper/upload-template-for-shipper.module'
import {MeteringManagementModule} from 'src/metering-management/metering-management.module'
import {QualityEvaluationModule} from 'src/quality-evaluation/quality-evaluation.module'
import {QualityPlanningModule} from 'src/quality-planning/quality-planning.module'
import {SummaryNominationReportModule} from 'src/summary-nomination-report/summary-nomination-report.module'
import {NominationDashboardModule} from 'src/nomination-dashboard/nomination-dashboard.module'
import {ParkingAllocationModule} from 'src/parking-allocation/parking-allocation.module'
import {BalancingModule} from 'src/balancing/balancing.module'
import {ReleaseCapacitySubmissionModule} from 'src/release-capacity-submission/release-capacity-submission.module'
import {UseItOrLoseItModule} from 'src/use-it-or-lose-it/use-it-or-lose-it.module'
import {CapacityPublicationModule} from 'src/capacity-publication/capacity-publication.module'
import {AllocationModeModule} from 'src/allocation-mode/allocation-mode.module'
import {QueryShipperNominationFileModule} from 'src/query-shipper-nomination-file/query-shipper-nomination-file.module'
import {DailyAdjustmentModule} from 'src/daily-adjustment/daily-adjustment.module'
import {EventModule} from 'src/event/event.module'
import {TariffModule} from 'src/tariff/tariff.module'
import {MeteringManagementService} from 'src/metering-management/metering-management.service'
import { ParameterAuditLogService } from 'src/parameter/audit-log'

@Module({
  imports: [
    GrpcModule,
    AccountManageModule,
    CapacityModule,
    forwardRef(
      () => AllocationModule
    ),
    PathManagementModule,
    UploadTemplateForShipperModule,
    MeteringManagementModule,
    QualityEvaluationModule,
    QualityPlanningModule,
    SummaryNominationReportModule,
    NominationDashboardModule,
    forwardRef(() => ParkingAllocationModule),
    forwardRef(
      () => BalancingModule
    ),
    ReleaseCapacitySubmissionModule,
    UseItOrLoseItModule,
    CapacityPublicationModule,
    AllocationModeModule,
    QueryShipperNominationFileModule,
    forwardRef(() => DailyAdjustmentModule),
    EventModule,
    forwardRef(() => TariffModule)
  ],
  controllers: [
    ExportFilesController
  ],
  providers: [
    ExportFilesService,
    ExportFileTariffService,
    ExportFileTariffCommodityService,
    ExportFileTariffCommodityA2Service,
    ExportFileTariffCommodityBService,
    MeteringManagementService,
    ParameterAuditLogService
  ], // เพิ่ม ExportFileTariffService, ExportFileTariffCommodityService, ExportFileTariffCommodityA2Service และ ExportFileTariffCommodityBService
  exports: [
    ExportFilesService,
    ExportFileTariffService,
    ExportFileTariffCommodityService,
    ExportFileTariffCommodityA2Service,
    ExportFileTariffCommodityBService,
    ParameterAuditLogService
  ] // export ExportFileTariffService, ExportFileTariffCommodityService, ExportFileTariffCommodityA2Service และ ExportFileTariffCommodityBService ด้วย
})
export class ExportFilesModule {}
