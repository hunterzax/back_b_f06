import {Module} from '@nestjs/common'
import {NominationDashboardService} from './nomination-dashboard.service'
import {NominationDashboardController} from './nomination-dashboard.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {QualityEvaluationService} from 'src/quality-evaluation/quality-evaluation.service'
import {SummaryNominationReportModule} from 'src/summary-nomination-report/summary-nomination-report.module'
import {QualityPlanningModule} from 'src/quality-planning/quality-planning.module'
import {QueryShipperNominationFileService} from 'src/query-shipper-nomination-file/query-shipper-nomination-file.service'
import { MinimumInventorySummaryService } from 'src/minimum-inventory-summary/minimum-inventory-summary.service'

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule,
    QualityPlanningModule,
    SummaryNominationReportModule
  ],
  controllers: [
    NominationDashboardController
  ],
  providers: [
    NominationDashboardService,
    AccountManageService,
    QualityEvaluationService,
    QueryShipperNominationFileService,
    MinimumInventorySummaryService
  ],
  exports: [
    NominationDashboardService
  ]
})
export class NominationDashboardModule {}
