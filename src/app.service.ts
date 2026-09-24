import {Cache} from 'cache-manager'
import {
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {Response} from 'express'
import axios from 'axios'

@Injectable()
export class AppService {
  constructor(
    private prisma: PrismaService
  ) {}
}
