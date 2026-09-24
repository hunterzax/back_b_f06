import {Module} from '@nestjs/common'
import {BulletinBoardService} from './bulletin-board.service'
import {BulletinBoardController} from './bulletin-board.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {CapacityService} from 'src/capacity/capacity.service'

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
    BulletinBoardController
  ],
  providers: [
    BulletinBoardService,
    AccountManageService,
    CapacityService
  ],
  exports: [
    BulletinBoardService
  ]
})
export class BulletinBoardModule {}
