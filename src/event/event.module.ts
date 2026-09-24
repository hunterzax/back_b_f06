import {Module} from '@nestjs/common'
import {EventService} from './event.service'
import {EventController} from './event.controller'
import {GrpcModule} from 'src/grpc/grpc.module'

@Module({
  imports: [GrpcModule],
  controllers: [
    EventController
  ],
  providers: [EventService],
  exports: [EventService]
})
export class EventModule {}
