import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpException,
  HttpStatus,
  Put,
  UseGuards,
  Req,
  HttpCode
} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AllocationModeService} from './allocation-mode.service'
import {writeReq} from 'src/common/utils/write-req.util'
import {PrismaService} from 'prisma/prisma.service'
import {middleNotiInapp} from 'src/common/utils/inapp.util'
import {getTodayNowAdd7} from 'src/common/utils/date.util'

@Controller('allocation-mode')
export class AllocationModeController {
  constructor(
    private prisma: PrismaService,
    private readonly allocationModeService: AllocationModeService
  ) {}

  @Get()
  findAll() {
    return this.allocationModeService.findAll()
  }

  @Get('mode')
  allocationModeType() {
    return this.allocationModeService.allocationModeType()
  }

  @UseGuards(AuthGuard)
  @Post()
  async allocationModeCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      allocation_mode_type_id,
      start_date
    } = body
    if (
      !allocation_mode_type_id ||
      !start_date
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const allocationModeCreate =
      await this.allocationModeService.allocationModeCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.allocationModeService.findOnce(
        allocationModeCreate?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `allocation-mode`,
      'create',
      his
    )
    await middleNotiInapp(
      this.prisma,
      'DAM',
      `${his?.allocation_mode_type?.mode} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')}`,
      1007, // Allocation Mode menus_id
      1
    )
    return allocationModeCreate
  }
}
