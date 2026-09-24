import {
  forwardRef,
  Module
} from '@nestjs/common'
import {AllocationService} from './allocation.service'
import {AllocationController} from './allocation.controller'
import {AllocationRepository} from './allocation.repository'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {CapacityService} from 'src/capacity/capacity.service'
import {ExportFilesModule} from 'src/export-files/export-files.module'
import {MeteringManagementService} from 'src/metering-management/metering-management.service'
import {QualityEvaluationService} from 'src/quality-evaluation/quality-evaluation.service'
import {
  ClientsModule,
  Transport
} from '@nestjs/microservices'
import * as path from 'path'

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule,
    forwardRef(
      () => ExportFilesModule
    ),
    ClientsModule.register([
      {
        name: 'EXAMPLE_SERVICE',
        transport:
          Transport.GRPC,
        options: {
          package: 'example',
          protoPath:
            path.join(
              __dirname,
              '../../example.proto'
            ),
          url: '0.0.0.0:50054'
          // onLoadPackageDefinition: (pkg, server) => {
          //   new ReflectionService(pkg).addToServer(server);
          // },
        }
      }
    ])
  ],
  providers: [
    AllocationService,
    AllocationRepository,
    AccountManageService,
    CapacityService,
    MeteringManagementService,
    QualityEvaluationService
  ],
  controllers: [
    AllocationController
  ],
  exports: [AllocationService]
})
export class AllocationModule {}
