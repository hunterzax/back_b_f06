import {Module} from '@nestjs/common'
import {CapacityPublicationService} from './capacity-publication.service'
import {CapacityPublicationController} from './capacity-publication.controller'
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
    CapacityPublicationController
  ],
  providers: [
    CapacityPublicationService,
    AccountManageService
  ],
  exports: [
    CapacityPublicationService
  ]
})
export class CapacityPublicationModule {}
