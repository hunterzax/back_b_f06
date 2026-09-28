import {
  Injectable,
  NestMiddleware
} from '@nestjs/common'
import {
  Request,
  Response,
  NextFunction
} from 'express'
import * as crypto from 'crypto'

@Injectable()
export class EncryptResponseMiddleware
  implements NestMiddleware
{
  private readonly algorithm =
    'aes-256-cbc'
  private readonly secretKey =
    process.env.NEXT_PUBLIC_RESPONSE_ENCRYPT_KEY2 || '' // ต้อง 32 ตัวอักษร

  encrypt(text: string) {
    const iv =
      crypto.randomBytes(16)
    const cipher =
      crypto.createCipheriv(
        this.algorithm,
        this.secretKey,
        iv
      )
    let encrypted =
      cipher.update(
        text,
        'utf8',
        'base64'
      )
    encrypted += cipher.final(
      'base64'
    )
    return {
      encryptedData:
        encrypted,
      iv: iv.toString(
        'base64'
      )
    }
  }

  use(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    if (
      req.path.includes(
        '/decrypt_'
      )
    ) {
      return next()
    }
    const oldJson = res.json

    res.json = (
      body: any
    ) => {
      const jsonData =
        JSON.stringify(body)
      const {
        encryptedData,
        iv
      } = this.encrypt(
        jsonData
      )
      return oldJson.call(
        res,
        {
          encryptedData,
          iv
        }
      )
    }

    next()
  }
}
