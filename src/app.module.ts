import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from '@nestjs/common'
import {AppController} from './app.controller'
import {AppService} from './app.service'
import {
  ConfigModule,
  ConfigService
} from '@nestjs/config'
import {CacheModule} from '@nestjs/cache-manager'
import * as redisStore from 'cache-manager-redis-store'
import {PrismaService} from 'prisma/prisma.service'
import {
  ClientsModule,
  Transport
} from '@nestjs/microservices'
import {AuthModule} from './auth/auth.module'
import * as path from 'path'
import {IpWhitelistMiddleware} from './allow.ip'
import {AccountManageModule} from './account-manage/account-manage.module'
import {AssetModule} from './asset/asset.module'
import {GrpcModule} from './grpc/grpc.module'
import {AstosModule} from './astos/astos.module'
import {ParameterModule} from './parameter/parameter.module'
import {ExportFilesModule} from './export-files/export-files.module'
import {CapacityModule} from './capacity/capacity.module'
import {PathManagementModule} from './path-management/path-management.module'
import {BulletinBoardModule} from './bulletin-board/bulletin-board.module'
import {CapacityPublicationModule} from './capacity-publication/capacity-publication.module'
import {ReleaseCapacitySubmissionModule} from './release-capacity-submission/release-capacity-submission.module'
import {ReleaseCapacityManagementModule} from './release-capacity-management/release-capacity-management.module'
import {UseItOrLoseItModule} from './use-it-or-lose-it/use-it-or-lose-it.module'
import {ReleaseUioliSummaryManagementModule} from './release-uioli-summary-management/release-uioli-summary-management.module'
import {ReserveBalancingGasContractModule} from './reserve-balancing-gas-contract/reserve-balancing-gas-contract.module'
import {PlanningFileSubmissionTemplateModule} from './planning-file-submission-template/planning-file-submission-template.module'
import {PlanningSubmissionFileModule} from './planning-submission-file/planning-submission-file.module'
import {QueryShipperPlanningFileModule} from './query-shipper-planning-file/query-shipper-planning-file.module'
import {NewpointModule} from './newpoint/newpoint.module'
import {PlanningDashboardModule} from './planning-dashboard/planning-dashboard.module'
import {OtherServiceModule} from './other-service/other-service.module'
import {CapacityDashboardModule} from './capacity-dashboard/capacity-dashboard.module'
import {UploadTemplateForShipperModule} from './upload-template-for-shipper/upload-template-for-shipper.module'
import {SubmissionFileModule} from './submission-file/submission-file.module'
import {CapacityV2Module} from './capacity-v2/capacity-v2.module'
import {EncryptResponseMiddleware} from './encrypt-response.middleware'
import {MeteringManagementModule} from './metering-management/metering-management.module'
import {QueryShipperNominationFileModule} from './query-shipper-nomination-file/query-shipper-nomination-file.module'
import {DailyManagementModule} from './daily-management/daily-management.module'
import {WeeklyManagementModule} from './weekly-management/weekly-management.module'
import {DailyAdjustmentModule} from './daily-adjustment/daily-adjustment.module'
import {QualityPlanningModule} from './quality-planning/quality-planning.module'
import {QualityEvaluationModule} from './quality-evaluation/quality-evaluation.module'
import {AllocationModeModule} from './allocation-mode/allocation-mode.module'
import {PrismaModule} from 'prisma/prisma.module'
import {AllocationModule} from './allocation/allocation.module'
import {BalancingModule} from './balancing/balancing.module'
import {SummaryNominationReportModule} from './summary-nomination-report/summary-nomination-report.module'
import {NominationDashboardModule} from './nomination-dashboard/nomination-dashboard.module'
import {ParkingAllocationModule} from './parking-allocation/parking-allocation.module'
import {MinimumInventorySummaryModule} from './minimum-inventory-summary/minimum-inventory-summary.module'
import {HvForPerationFlowAndInstructedFlowModule} from './hv-for-peration-flow-and-instructed-flow/hv-for-peration-flow-and-instructed-flow.module'
import {EventModule} from './event/event.module'
import {TariffModule} from './tariff/tariff.module'
import {WaitingListModule} from './waiting-list/waiting-list.module'
import {CallReceivedModule} from './call-received/call-received.module'
import {SeedService} from '@prisma/seed.service'

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    // CacheModule.registerAsync({
    //   isGlobal: true,
    //   inject: [ConfigService],
    //   useFactory: (configService: ConfigService) => ({
    //     store: redisStore,
    //     host: configService.get<string>('REDIS_HOST'),
    //     port: configService.get<number>('REDIS_PORT'),
    //     username: configService.get<string>('REDIS_USERNAME', ''),
    //     password: configService.get<string>('REDIS_PASSWORD'),
    //     db: 1,
    //     no_ready_check: true,
    //   }),
    // }),
    // ClientsModule.register([
    //   {
    //     name: 'Go_EMAIL',
    //     transport: Transport.GRPC,
    //     options: {
    //       package: 'email',
    //       protoPath: path.join(__dirname, '../email.proto'),
    //       url: 'localhost:5051',
    //     },
    //   },
    //   // {
    //   //   name: 'GO_SERVICE',
    //   //   transport: Transport.GRPC,
    //   //   options: {
    //   //     package: 'example',
    //   //     protoPath: path.join(__dirname, '../example.proto'),
    //   //     url: 'localhost:50052',
    //   //   },
    //   // },
    //   // {
    //   //   name: 'FASTAPI_CALCULATE_SERVICE',
    //   //   transport: Transport.GRPC,
    //   //   options: {
    //   //     package: 'example',
    //   //     protoPath: path.join(__dirname, '../example.proto'),
    //   //     url: 'localhost:50053',
    //   //   },
    //   // },
    // ]),
    AuthModule,
    AccountManageModule,
    AssetModule,
    GrpcModule,
    AstosModule,
    ParameterModule,
    CapacityModule,
    PathManagementModule,
    BulletinBoardModule,
    CapacityPublicationModule,
    ReleaseCapacitySubmissionModule,
    ReleaseCapacityManagementModule,
    UseItOrLoseItModule,
    ReleaseUioliSummaryManagementModule,
    ReserveBalancingGasContractModule,
    PlanningFileSubmissionTemplateModule,
    PlanningSubmissionFileModule,
    QueryShipperPlanningFileModule,
    NewpointModule,
    PlanningDashboardModule,
    OtherServiceModule,
    CapacityDashboardModule,
    UploadTemplateForShipperModule,
    SubmissionFileModule,
    CapacityV2Module,
    MeteringManagementModule,
    QueryShipperNominationFileModule,
    DailyManagementModule,
    WeeklyManagementModule,
    DailyAdjustmentModule,
    QualityPlanningModule,
    QualityEvaluationModule,
    AllocationModeModule,
    PrismaModule,
    // PostgresModule,
    // PostgresExampleModule,
    AllocationModule,
    BalancingModule,
    SummaryNominationReportModule,
    NominationDashboardModule,
    ParkingAllocationModule,
    MinimumInventorySummaryModule,
    HvForPerationFlowAndInstructedFlowModule,
    EventModule,
    TariffModule,
    ExportFilesModule,
    WaitingListModule,
    CallReceivedModule
  ],
  controllers: [
    AppController
  ],
  providers: [
    AppService,
    SeedService
  ]
})
// export class AppModule {}
export class AppModule
  implements NestModule
{
  configure(
    consumer: MiddlewareConsumer
  ) {
    consumer
      .apply(
        // IpWhitelistMiddleware,
        String(
          process.env
            .RESPONSE_ENCRYPT_MODE
        ).toLowerCase() ===
          'true' &&
          EncryptResponseMiddleware
      )
      // .exclude(
      //   { path: 'upload-template-for-shipper', method: RequestMethod.ALL }, // ยกเว้น
      // )
      .forRoutes({
        path: '*',
        method:
          RequestMethod.ALL
      })
  }
}
// export class AppModule implements NestModule {
//   configure(consumer: MiddlewareConsumer) {
//     consumer
//       .apply(IpWhitelistMiddleware)
//       .forRoutes({ path: '*', method: RequestMethod.ALL });
//   }
// }
