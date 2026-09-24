import {Module} from '@nestjs/common'
import {MinimumInventorySummaryService} from './minimum-inventory-summary.service'
import {MinimumInventorySummaryController} from './minimum-inventory-summary.controller'
import {GrpcModule} from 'src/grpc/grpc.module'

@Module({
  imports: [GrpcModule],
  controllers: [
    MinimumInventorySummaryController
  ],
  providers: [
    MinimumInventorySummaryService
  ],
  exports: [
    MinimumInventorySummaryService
  ]
})
export class MinimumInventorySummaryModule {}
