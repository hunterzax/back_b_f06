import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  Put,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Query
} from '@nestjs/common'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {JwtService} from '@nestjs/jwt'
import {FileUploadService} from 'src/grpc/file-service.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {FileInterceptor} from '@nestjs/platform-express'
// import { query, Response } from 'express';

import {DailyAdjustmentService} from './daily-adjustment.service'
import {MeteredMicroService} from 'src/grpc/metered-service.service'
import {
  middleNotiInapp,
  middleNotiInappShipper
} from 'src/common/utils/inapp.util'
import {PrismaService} from '@prisma/prisma.service'
import {writeReq} from 'src/common/utils/write-req.util'

@Controller(
  'daily-adjustment'
)
export class DailyAdjustmentController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService,
    private readonly dailyAdjustmentService: DailyAdjustmentService,
    private readonly meteredMicroService: MeteredMicroService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(
    @Req() req: any,
    @Query() query: any
  ) {
    return this.dailyAdjustmentService.findAll(
      query,
      req?.user?.sub
    )
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('create')
  async create(
    @Req() req: any,
    @Body() body: any
  ) {
    const {} = body

    // if (!) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    const dailyAdjustmentService =
      await this.dailyAdjustmentService.create(
        body,
        req?.user?.sub
      )
    // inapp
    try {
      const shipperData =
        await this.prisma.group.findMany(
          {
            where: {},
            select: {
              id: true,
              name: true
            }
          }
        )
      for (
        let i = 0;
        i <
        body?.shipper_id
          ?.length;
        i++
      ) {
        const nshipperData =
          shipperData?.find(
            (f: any) =>
              f?.id ===
              body
                ?.shipper_id?.[
                i
              ]
          )
        const message = `Daily Adjustment was submitted for ${nshipperData?.name || ''} activate from ${body?.gas_day}:${body?.time} by operator`
        await middleNotiInappShipper(
          this.prisma,
          'Nomination',
          `${message}`,
          68, // menus_id | 68 Daily Adjustment
          1,
          body?.shipper_id?.[
            i
          ]
        )
      }
    } catch (error) {}

    try {
      await writeReq(
        this.prisma,
        'NOMINATION',
        req,
        `daily-adjustment`,
        'create',
        dailyAdjustmentService
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.nomination',
        `Daily Adjustment has been updated. Please refresh the page to see the latest changes.`,
        68, // menus_id | 68 Daily Adjustment
        2
      )
    } catch (error) {
      
    }

    return dailyAdjustmentService
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('update-status/:id')
  async updateStatus(
    @Req() req: any,
    @Body() body: any,
    @Param('id') id: any
  ) {
    const {status} = body

    if (!status) {
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

    const dailyAdjustmentService =
      await this.dailyAdjustmentService.updateStatus(
        id,
        body,
        req?.user?.sub
      )

    // inapp
    try {
      const shipperData =
        await this.prisma.group.findMany(
          {
            where: {},
            select: {
              id: true,
              name: true
            }
          }
        )
      for (
        let i = 0;
        i <
        body?.shipper_id
          ?.length;
        i++
      ) {
        const nshipperData =
          shipperData?.find(
            (f: any) =>
              f?.id ===
              body
                ?.shipper_id?.[
                i
              ]
          )
        const message = `Daily Adjustment was ${status === 2 ? 'approved' : 'rejected'} for ${nshipperData?.name || ''} activate from ${body?.gas_day}:${body?.time} by operator`
        await middleNotiInappShipper(
          this.prisma,
          'Nomination',
          `${message}`,
          68, // menus_id | 68 Daily Adjustment
          1,
          body?.shipper_id?.[
            i
          ]
        )
      }
    } catch (error) {}

    try {
      await writeReq(
        this.prisma,
        'NOMINATION',
        req,
        `daily-adjustment`,
        'update status',
        dailyAdjustmentService
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.nomination',
        `Daily Adjustment has been updated. Please refresh the page to see the latest changes.`,
        68, // menus_id | 68 Daily Adjustment
        2
      )
    } catch (error) {
      
    }

    return dailyAdjustmentService
  }

  @UseGuards(AuthGuard)
  @Get('shipper-data')
  shipperData(
    @Query() query: any,
    @Req() req: any
  ) {
    return this.dailyAdjustmentService.shipperData(
      query,
      req?.user?.sub
    )
  }

  @Get(
    'nomination-point-data'
  )
  nominationPointData(
    @Query() query: any
  ) {
    return this.dailyAdjustmentService.nominationPointData2(
      query
    )
  }

  @UseGuards(AuthGuard)
  @Post(
    'daily-adjustment-summary'
  )
  dailyAdjustmentSummary(
    @Body() body: any,
    @Req() req: any
  ) {
    return this.dailyAdjustmentService.dailyAdjustmentSummary2(
      body,
      req?.user?.sub
    )
  }

  @UseGuards(AuthGuard)
  @Post(
    'daily-adjustment-report-now'
  )
  dailyAdjustmentReportNow(
    @Body() body: any,
    @Req() req: any
  ) {
    return this.dailyAdjustmentService.dailyAdjustmentReportNow2(
      body,
      req?.user?.sub
    )
  }

  @UseGuards(AuthGuard)
  @Post(
    'daily-adjustment-report'
  )
  dailyAdjustmentReport(
    @Body() body: any,
    @Req() req: any
  ) {
    return this.dailyAdjustmentService.dailyAdjustmentReport4(
      body,
      req?.user?.sub
    )
  }
}
