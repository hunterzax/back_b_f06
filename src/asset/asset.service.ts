import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import * as bcrypt from 'bcrypt'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {
  checkStartEndBoom,
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYDfaultAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
import axios from 'axios'
import {
  findMoveEndDatePoints,
  findMoveStartDatePoints,
  getConflictReason,
  shouldAddOldPointToEndDateArray,
  shouldAddOldPointToStartDateArray,
  shouldBlockNewPeriod
} from 'src/common/utils/asset.util'
import {parseToNumber} from 'src/common/utils/number.util'
import {writeReq} from 'src/common/utils/write-req.util'

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
