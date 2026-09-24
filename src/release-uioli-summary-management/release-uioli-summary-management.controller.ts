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
  HttpCode,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res
} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {FileInterceptor} from '@nestjs/platform-express'
import {
  Request,
  Response
} from 'express'
import {ReleaseUioliSummaryManagementService} from './release-uioli-summary-management.service'
import {PrismaService} from '@prisma/prisma.service'
import {
  middleNotiInapp,
  middleNotiInappShipper
} from 'src/common/utils/inapp.util'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import axios from 'axios'
import {getTodayNowAdd7} from 'src/common/utils/date.util'
import {getGroupData} from 'src/common/utils/group.util'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Controller(
  'release-uioli-summary-management'
)
export class ReleaseUioliSummaryManagementController {
  constructor(
    private readonly releaseUioliSummaryManagementService: ReleaseUioliSummaryManagementService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(@Req() req: any) {
    const userId =
      req?.user?.sub
    return this.releaseUioliSummaryManagementService.findAll(
      userId
    )
  }

  @UseGuards(AuthGuard)
  @Post('comment')
  async comment(
    @Body() body: any,
    @Req() req: any
  ) {
    const {comments, id} =
      body

    if (!comments || !id) {
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
    const comment =
      await this.releaseUioliSummaryManagementService.comment(
        body,
        req?.user?.sub
      )

    return comment
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('confirm-capacity')
  async confirmCapacity(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      id,
      mmbtu_d,
      mmscfd_d
    } = body

    // if (!id || !mmbtu_d || !mmscfd_d) {
    if (!id) {
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
    const confirmCapacity =
      await this.releaseUioliSummaryManagementService.confirmCapacity(
        body,
        req?.user?.sub
      )

    try {
      const contractData =
        await this.prisma.contract_code.findFirst(
          {
            where: {
              id: Number(
                confirmCapacity?.contractCodeId
              )
            },
            select: {
              contract_code: true,
              group: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        )
      const message = `TSO confirmed the released capacity of UIOLI Released type for ${contractData?.group?.name} Shipper, Contract Code: ${contractData?.contract_code} (Submitted Timestamp: ${(confirmCapacity?.release_summary_confirm_log?.create_date && dayjs(confirmCapacity?.release_summary_confirm_log?.create_date).format('DD/MM/YYYY HH:mm:ss')) || ''})`
      // await middleNotiInapp(
      //       this.prisma,
      //       'Capacity Management',
      //       `${message}`,
      //       58, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management | 51 Path Management | 56 Release Capacity Submission | 57 Use it or Lose it | 58 Release/UIOLI Summary Report
      //       1,
      //     );
      await middleNotiInappShipper(
        this.prisma,
        'Capacity Management',
        `${message}`,
        58,
        1,
        contractData?.group
          ?.id
      )
    } catch (error) {}

    return confirmCapacity
  }
}
