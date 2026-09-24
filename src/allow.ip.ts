import {
  Injectable,
  NestMiddleware,
  ForbiddenException
} from '@nestjs/common'
import {
  Request,
  Response,
  NextFunction
} from 'express'

@Injectable()
export class IpWhitelistMiddleware
  implements NestMiddleware
{
  use(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const allowedIp =
      process.env.IP_URL // IP ที่อนุญาต
    // const allowedIp = '10.100.101.15'; // IP ที่อนุญาต
    // const allowedIp = '10.100.101.44'; // IP ที่อนุญาต
    // const allowedIp = '34.143.225.94'; // IP ที่อนุญาต
    // const allowedIp = '34.124.186.120'; // IP ที่อนุญาต

    // ตรวจสอบ IP จาก 'X-Forwarded-For' หรือ req.ip
    const clientIp =
      (
        req.headers[
          'x-forwarded-for'
        ] as string
      )?.split(',')[0] ||
      req.ip ||
      req.connection
        .remoteAddress

    // เปรียบเทียบ IP ที่ได้รับกับ IP ที่อนุญาต
    if (
      clientIp === allowedIp
    ) {
      next()
    } else {
      throw new ForbiddenException(
        'Access denied'
      )
    }
  }
}
