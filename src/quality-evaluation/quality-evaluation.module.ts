import {Module} from '@nestjs/common'
import {QualityEvaluationService} from './quality-evaluation.service'
import {QualityEvaluationController} from './quality-evaluation.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'

@Module({
  imports: [
    // JwtModule.register({
    //   global: true,
    //   secret: jwtConstants.secret,
    //   signOptions: { expiresIn: '300000s' },
    // }),
    GrpcModule
  ],
  controllers: [
    QualityEvaluationController
  ],
  providers: [
    QualityEvaluationService,
    AccountManageService
  ],
  exports: [
    QualityEvaluationService
  ]
})
export class QualityEvaluationModule {}
