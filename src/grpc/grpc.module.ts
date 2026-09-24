import {Module} from '@nestjs/common'
import {EmailClientService} from './email-service.service'
import {
  ClientsModule,
  Transport
} from '@nestjs/microservices'
import * as path from 'path'
import {FileUploadService} from './file-service.service'
import {TranfClientService} from './tranf-service.service'
import {MeteredMicroService} from './metered-service.service'
import {ConfigModule} from '@nestjs/config'

@Module({
  imports: [
    // ConfigModule,
    ClientsModule.register([
      {
        name: 'Go_EMAIL',
        transport:
          Transport.GRPC,
        options: {
          package: 'email',
          protoPath:
            path.join(
              __dirname,
              '../../email.proto'
            ),
          url: `${process.env.IP_URL}:5051`
          // url: '10.100.101.15:5051',
          // url: '10.100.101.44:5051',
          // url: '34.143.225.94:5051',
        }
      },
      {
        name: 'FILE_SERVICE',
        transport:
          Transport.GRPC,
        options: {
          package:
            'fileService',
          protoPath:
            path.join(
              __dirname,
              '../../file_service.proto'
            ),
          url: `${process.env.IP_URL}:5013`,
          // url: '34.87.62.61:5013',
          // url: `localhost:5013`,
          // url: '10.100.88.48:5013',
          // url: '10.100.101.44:5013',
          // url: '10.100.101.15:5013',
          // url: '10.100.96.215:5013',
          loader: {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            arrays: true,
            objects: true
          }
        }
      },
      {
        name: 'TRANF_SERVICE',
        transport:
          Transport.GRPC,
        options: {
          package:
            'tranfService',
          protoPath:
            path.join(
              __dirname,
              '../../tranf.proto'
            ),
          url: `${process.env.IP_URL}:50061`,
          // url: '10.100.101.15:50061',
          // url: '10.100.101.44:50061',
          // url: '34.143.225.94:50061',
          // url: '10.100.97.250:50061',
          // url: '10.100.98.188:5013',
          loader: {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            arrays: true,
            objects: true
          },
          maxSendMessageLength:
            50 * 1024 * 1024, // 50 MB
          maxReceiveMessageLength:
            50 * 1024 * 1024 // 50 MB
        }
      },
      {
        name: 'METERED_SERVICE',
        transport:
          Transport.GRPC,
        options: {
          package:
            'meteredService',
          protoPath:
            path.join(
              __dirname,
              '../../metered_service.proto'
            ),
          // url: `10.100.91.76:5016`,
          // url: `10.209.12.28:5016`,
          // url: `100.71.14.254:5016`,
          url: `${process.env.IP_URL}:5016`,
          // url: `10.104.239.210:5016`,
          // url: `localhost:5016`,
          // url: '10.100.92.151:5016',
          // url: '10.100.101.44:5016',
          // url: '34.87.62.61:5016',
          // url: '10.100.101.44:5016',
          // url: '10.100.93.1:5016',
          // url: '35.186.153.193:5016',
          loader: {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            arrays: true,
            objects: true
          },
          // maxReceiveMessageLength: 100 * 1024 * 1024, // 100MB
          // maxSendMessageLength: 100 * 1024 * 1024, // 100MB
          maxReceiveMessageLength:
            500 * 1024 * 1024, // 500MB
          maxSendMessageLength:
            500 * 1024 * 1024 // 500MB
        }
      }
      // {
      //   name: 'GO_SERVICE',
      //   transport: Transport.GRPC,
      //   options: {
      //     package: 'example',
      //     protoPath: path.join(__dirname, '../example.proto'),
      //     url: 'localhost:50052',
      //   },
      // },
      // {
      //   name: 'FASTAPI_CALCULATE_SERVICE',
      //   transport: Transport.GRPC,
      //   options: {
      //     package: 'example',
      //     protoPath: path.join(__dirname, '../example.proto'),
      //     url: 'localhost:50053',
      //   },
      // },
      // 50054 use at src/allocation/allocation.module.ts
    ])
  ],
  controllers: [],
  providers: [
    EmailClientService,
    FileUploadService,
    TranfClientService,
    MeteredMicroService
  ],
  exports: [
    EmailClientService,
    FileUploadService,
    TranfClientService,
    MeteredMicroService
  ]
})
export class GrpcModule {}
