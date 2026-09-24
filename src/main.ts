import {
  BaseExceptionFilter,
  HttpAdapterHost,
  NestFactory,
} from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, VersioningType } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as morgan from 'morgan';
import * as bodyParser from 'body-parser';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import './instrument.js';
import * as Sentry from '@sentry/nestjs';
import * as compression from 'compression';

import * as express from "express";
import { attachGotifyWsProxy } from './ws-gotify-proxy';
import { SeedService } from '@prisma/seed.service';

async function bootstrap() {

  // Resolve SSL paths based on environment
  const env = process.env.NODE_ENV ?? 'development';
  const isDev = env === 'development';
  const pttEnv = ['production', 'pre-production', 'dr'];
  const sslKeyPath = isDev
    ? path.resolve(process.cwd(), 'src', 'ssl', 'ssl_private.key')
    : path.resolve(__dirname, process.env.SSL_KEY_PATH);

  const sslCertPath = isDev
    ? path.resolve(process.cwd(), 'src', 'ssl', 'ssl.crt')
    : path.resolve(__dirname, process.env.SSL_CERT_PATH);

  if (!fs.existsSync(sslKeyPath) || !fs.existsSync(sslCertPath)) {
    throw new Error(`SSL files not found. Make sure the following files exist:
    - ${sslKeyPath}
    - ${sslCertPath}`);
  }
  const httpsOptions = {
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath),
  };
  const app = await NestFactory.create(AppModule, {
    httpsOptions,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'example',
      protoPath: path.join(__dirname, '../example.proto'),
      url: '0.0.0.0:50051',
    },
  });

  const configService = app.get(ConfigService);
  const port = configService.get<string>('PORT');
  const logger = new Logger('Bootstrap');
  const { httpAdapter } = app.get(HttpAdapterHost);
  // Sentry.setupNestErrorHandler(app, new BaseExceptionFilter(httpAdapter));
  app.useGlobalFilters(new BaseExceptionFilter(httpAdapter));


  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.enableCors({
    origin: [
      `http://${process.env.IP_URL}`,
      `http://${process.env.KONG_IP}`,
      `${process.env.WEBS}`,
      `${process.env.TPA_WEB}`,
    ],
    credentials: true,
  });

  // app.use((req, res, next) => {
  //   next();
  // });

  // ไม่ต้องเอาขึ้น ไป UAT/PRD
  if (!pttEnv.includes(env)) {
    app.setGlobalPrefix('master');
  }
  const imgDir = path.join(process.cwd(), "public", "img");
  app.use("/img", express.static(imgDir));
  app.use(compression());
  app.use(morgan('tiny'));
  app.use(bodyParser.json({ limit: '500mb' }));
  app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));
  app.use((req, res, next) => {
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=600, max=100');
    next();
  });

  // #แบบ hook ให้ font ใช้ websocket ผ่าน back
  try {
    const server = app.getHttpServer();
    attachGotifyWsProxy(server);
  } catch (error) { }

  await app.startAllMicroservices();
  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: ${port}`);

  // try {
  //   if (pttEnv.includes(env)) {
  //     logger.log(`---Seed Auto---`);
  //     const seedService = app.get(SeedService);
  //     await seedService.run()
  //     logger.log(`--- Seed Auto Success ---`);
  //   }
  // } catch (error) {
  //   logger.error('Seed Auto Error:', error);
  // }
}
bootstrap();
