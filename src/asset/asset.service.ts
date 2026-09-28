import {
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class AssetService {
  constructor(
    private prisma: PrismaService
  ) {}
}
