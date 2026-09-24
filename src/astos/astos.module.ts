// src/astos/astos.module.ts
import {forwardRef, Module} from '@nestjs/common'
import {JwtModule} from '@nestjs/jwt'
import {AstosService} from './astos.service'
import {AstosController} from './astos.controller'
import {AstosRepository} from './astos.repository'
import {AstosUtils} from './astos.utils'
import {GrpcModule} from 'src/grpc/grpc.module'
import {PrismaModule} from 'prisma/prisma.module'
import {AllocationModule} from 'src/allocation/allocation.module'
@Module({
  imports: [
    GrpcModule,
    PrismaModule,
    forwardRef(() => AllocationModule),
    JwtModule.register({})
  ],
  controllers: [
    AstosController
  ],
  providers: [
    AstosService,
    AstosRepository,
    AstosUtils
  ],
  exports: [AstosService]
})
export class AstosModule {}
