import { Module } from '@nestjs/common';
import { EventTemplateService } from './event-template.service';
import { EventTemplateController } from './event-template.controller';
import { GrpcModule } from 'src/grpc/grpc.module';

@Module({
  imports: [GrpcModule],
  controllers: [EventTemplateController],
  providers: [EventTemplateService],
    exports: [EventTemplateService]
  
})
export class EventTemplateModule {}
