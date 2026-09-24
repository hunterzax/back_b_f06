import { forwardRef, Module } from '@nestjs/common'
import {DailyAdjustmentService} from './daily-adjustment.service'
import {DailyAdjustmentController} from './daily-adjustment.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {AstosModule} from 'src/astos/astos.module'

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule,
    forwardRef(() => AstosModule)
  ],
  controllers: [
    DailyAdjustmentController
  ],
  providers: [
    DailyAdjustmentService,
    AccountManageService
  ],
  exports: [
    DailyAdjustmentService
  ]
})
export class DailyAdjustmentModule {}
