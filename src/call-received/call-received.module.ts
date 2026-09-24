import {Module} from '@nestjs/common'
import {CallReceivedService} from './call-received.service'
import {CallReceivedController} from './call-received.controller'
import { AccountManageModule } from 'src/account-manage/account-manage.module'

@Module({
  imports: [
    AccountManageModule
  ],
  controllers: [
    CallReceivedController
  ],
  providers: [
    CallReceivedService
  ],
  exports: [
    CallReceivedService
  ]
})
export class CallReceivedModule {}
