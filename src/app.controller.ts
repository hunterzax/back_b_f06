import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  OnModuleInit,
  Post,
  Res
} from '@nestjs/common'
import {AppService} from './app.service'
import {
  ClientGrpc,
  GrpcMethod
} from '@nestjs/microservices'
import {Observable} from 'rxjs'
import {Response} from 'express'
import * as crypto from 'crypto'

@Controller()
export class AppController
  implements OnModuleInit
{
  constructor(
    private readonly appService: AppService
  ) {}

  onModuleInit() {}

  @Post('decrypt_')
  decrypt(
    @Body()
    body: {
      encryptedData: string
      iv: string
    }
  ) {
    try {
      const algorithm =
        'aes-256-gcm'
      const secretKey = process.env.RESPONSE_ENCRYPT_KEY2 || ''

      const key = Buffer.from(
        secretKey,
        'utf8'
      )
      const iv = Buffer.from(
        body.iv,
        'base64'
      )
      const encryptedText =
        Buffer.from(
          body.encryptedData,
          'base64'
        )

      const decipher =
        crypto.createDecipheriv(
          algorithm,
          key,
          iv
        )

      const decrypted =
        Buffer.concat([
          decipher.update(
            encryptedText
          ),
          decipher.final()
        ]).toString('utf8')

      return JSON.parse(
        decrypted
      )
    } catch (error: any) {
      throw new BadRequestException(
        {
          success: false,
          message:
            'Decrypt failed',
          error:
            error?.message
        }
      )
    }
  }
}
