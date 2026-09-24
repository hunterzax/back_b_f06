import {forwardRef, Module} from '@nestjs/common'
import {QualityPlanningService} from './quality-planning.service'
import {QualityPlanningController} from './quality-planning.controller'
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
    QualityPlanningController
  ],
  providers: [
    QualityPlanningService,
    AccountManageService
  ],
  exports: [
    QualityPlanningService
  ]
})
export class QualityPlanningModule {}
