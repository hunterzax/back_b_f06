import {
  CanActivate,
  ExecutionContext,
  Injectable
} from '@nestjs/common'
import {JwtService} from '@nestjs/jwt'
import {Request} from 'express'
import axios from 'axios'

@Injectable()
export class AstosGuard
  implements CanActivate
{
  constructor(
    private jwtService: JwtService
  ) {}

  async getPublicKey(): Promise<
    string | null
  > {
    try {
      const response =
        await axios.get(
          'https://10.100.101.15:9011/api/jwt/public-key'
        )
      const publicKey =
        Object.values(
          response.data
            .publicKeys
        )[0] as string // แคสต์ publicKey ให้เป็น string
      return publicKey
    } catch (error) {
      console.error(
        'Error fetching public key:',
        error.message
      )
      return null
    }
  }

  async verifyToken(
    token: string
  ): Promise<any> {
    const publicKey =
      await this.getPublicKey()
    if (!publicKey) {
      console.error(
        'Public Key not available.'
      )
      return false
    }

    try {
      const decoded =
        this.jwtService.verify(
          token,
          {
            secret: publicKey,
            algorithms: [
              'RS256'
            ]
          }
        )
      return decoded
    } catch (err) {
      console.error(
        'Token verification failed:',
        err.message
      )
      return false
    }
  }

  async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const request: Request =
      context
        .switchToHttp()
        .getRequest()
    const authHeader =
      request.headers[
        'authorization'
      ]
    if (!authHeader) {
      console.error(
        'Authorization header is missing'
      )
      return false
    }

    const token =
      authHeader.split(' ')[1] // ดึง token จาก header

    const decoded =
      await this.verifyToken(
        token
      )

    if (!decoded) {
      console.error(
        'Token verification failed'
      )
      return false
    }
    request['user'] = decoded // ใส่ข้อมูล user ลงใน request object
    return true
  }
}
