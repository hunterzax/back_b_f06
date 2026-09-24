import {Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpException, HttpStatus, Put, UseGuards, Req, HttpCode, UseInterceptors, UploadedFile, BadRequestException, Res} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'

import {BalancingService} from './balancing.service'
import {FileUploadService} from 'src/grpc/file-service.service'
import {FileInterceptor} from '@nestjs/platform-express'
import {CapacityService} from 'src/capacity/capacity.service'
import {PrismaService} from '@prisma/prisma.service'
import {middleNotiInapp} from 'src/common/utils/inapp.util'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

@Controller('balancing')
export class BalancingController {
  constructor(
    private jwtService: JwtService,
    private readonly balancingService: BalancingService,
    private readonly accountManageService: AccountManageService,
    private readonly fileUploadService: FileUploadService,
    private prisma: PrismaService
  ) {}

  @Get('closed-balancing-report')
  closedBalancingReport() {
    return this.balancingService.closedBalancingReport()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('closed-balancing-report-setting')
  async closedBalancingReportSetting(@Body() body: any, @Req() req: any) {
    const {date_balance} = body
    if (!date_balance) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const closedBalancingReportSetting = await this.balancingService.closedBalancingReportSetting(body, req?.user?.sub)
    // const his = await this.balancingService.findOnce(closedBalancingReportSetting?.id);
    // await this.balancingService.writeReq(
    //   req,
    //   `allocation-mode`,
    //   'create',
    //   his,
    // );

    // inapp
    try {
      const message = `Balancing was closed on ${dayjs(date_balance, 'YYYY-MM-DD').format('MM/YYYY')}`
      await middleNotiInapp(
        this.prisma,
        'Balancing',
        `${message}`,
        91, // menus_id | 91 Closed Balancing Report
        1
      )
    } catch (error) {}

    return closedBalancingReportSetting
  }

  @Get('intraday-acc-imbalance-inventory')
  intradayAccImbalanceInventory(@Query() query: any) {
    return this.balancingService.intradayAccImbalanceInventory(query)
  }

  @Get('intraday-acc-imbalance-inventory-comment-once')
  intradayAccImbalanceInventoryCommentOnce(@Query() query: any) {
    return this.balancingService.intradayAccImbalanceInventoryCommentOnce(query)
  }

  @Delete('intraday-acc-imbalance-inventory')
  async intradayAccImbalanceInventoryDelete(@Query() query: any, @Req() req: any) {
    const {gas_day} = query

    const his = await this.balancingService.intradayAccImbalanceInventoryOnce({
      gas_day
    })
    await this.balancingService.writeReq(req, `intraday-acc-imbalance-inventory`, `delete`, his)

    const intradayAccImbalanceInventoryDelete = await this.balancingService.intradayAccImbalanceInventoryDelete(query)

    return intradayAccImbalanceInventoryDelete
  }

  @UseGuards(AuthGuard)
  @Post('intraday-acc-imbalance-inventory')
  async intradayAccImbalanceInventoryCU(@Body() body: any, @Req() req: any) {
    const {zone, gas_day, value, remark} = body
    if (!zone || !gas_day) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const intradayAccImbalanceInventoryCU = await this.balancingService.intradayAccImbalanceInventoryCU(body, req?.user?.sub)
    if (!!remark) {
      const intradayAccImbalanceInventoryCommentCreate = await this.balancingService.intradayAccImbalanceInventoryCommentCreate(body, req?.user?.sub)
    }

    const his = await this.balancingService.intradayAccImbalanceInventoryOnce({
      gas_day
    })
    await this.balancingService.writeReq(req, `intraday-acc-imbalance-inventory`, intradayAccImbalanceInventoryCU?.type, his)
    return intradayAccImbalanceInventoryCU
  }

  @UseGuards(AuthGuard)
  @Post('intraday-acc-imbalance-inventory-comment')
  async intradayAccImbalanceInventoryCommentCreate(@Body() body: any, @Req() req: any) {
    const {gas_day, remark} = body
    if (!gas_day || !remark) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const intradayAccImbalanceInventoryCommentCreate = await this.balancingService.intradayAccImbalanceInventoryCommentCreate(body, req?.user?.sub)

    const his = await this.balancingService.intradayAccImbalanceInventoryOnce({
      gas_day
    })
    await this.balancingService.writeReq(req, `intraday-acc-imbalance-inventory`, intradayAccImbalanceInventoryCommentCreate?.type, his)
    return intradayAccImbalanceInventoryCommentCreate
  }

  @UseGuards(AuthGuard)
  @Get('adjustment-daily-imbalance')
  adjustmentDailyImbalance(@Query() query: any, @Req() req: any) {
    return this.balancingService.adjustmentDailyImbalance(query, req?.user?.sub)
  }

  // adjustment-daily-imbalance-comment
  @UseGuards(AuthGuard)
  @Post('adjustment-daily-imbalance-comment')
  async adjustmentDailyImbalanceCommentCreate(@Body() body: any, @Req() req: any) {
    const {balancing_adjustment_daily_imbalance_id, remark} = body
    if (!balancing_adjustment_daily_imbalance_id || !remark) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const adjustmentDailyImbalanceCommentCreate = await this.balancingService.adjustmentDailyImbalanceCommentCreate(body, req?.user?.sub)

    const his = await this.balancingService.adjustmentDailyImbalanceOnce(
      {
        id: balancing_adjustment_daily_imbalance_id,
        start_date: body?.start_date, // ส่งแบบ หน้าเรียก table
        end_date: body?.start_date, // ส่งแบบ หน้าเรียก table
        skip: body?.skip, // ส่งแบบ หน้าเรียก table
        limit: body?.limit // ส่งแบบ หน้าเรียก table
      },
      req?.user?.sub
    )

    await this.balancingService.writeReq(req, `adjustment-daily-imbalance`, adjustmentDailyImbalanceCommentCreate?.type, his)

    return adjustmentDailyImbalanceCommentCreate
  }

  // adjustment-daily-imbalance-comment-once
  @Get('adjustment-daily-imbalance-comment-once')
  adjustmentDailyImbalanceCommentOnce(@Query() query: any) {
    return this.balancingService.adjustmentDailyImbalanceCommentOnce(query)
  }

  @UseGuards(AuthGuard)
  @Post('adjustment-daily-imbalance/adjust')
  async adjustmentDailyImbalanceAdjustIm(@Body() body: any, @Req() req: any) {
    const {id, adjustImbalance, start_date, end_date, skip, limit} = body
    if (!id || !adjustImbalance || !start_date || !end_date || !skip || !limit) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const adjustmentDailyImbalanceAdjustIm = await this.balancingService.adjustmentDailyImbalanceAdjustIm(body, req?.user?.sub)

    const his = await this.balancingService.adjustmentDailyImbalanceOnce(body, req?.user?.sub)
    await this.balancingService.writeReq(req, `adjustment-daily-imbalance`, 'adjust', his)
    return adjustmentDailyImbalanceAdjustIm
  }

  @UseGuards(AuthGuard)
  @Get('adjust-accumulated-imbalance')
  adjustAccumulatedImbalance(@Query() query: any, @Req() req: any) {
    return this.balancingService.adjustAccumulatedImbalance(query, req?.user?.sub)
  }

  // adjust-accumulated-imbalance-comment
  @UseGuards(AuthGuard)
  @Post('adjust-accumulated-imbalance-comment')
  async adjustAccumulatedImbalanceCommentCreate(@Body() body: any, @Req() req: any) {
    const {balancing_adjust_accumulated_imbalance_id, remark} = body
    if (!balancing_adjust_accumulated_imbalance_id || !remark) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const adjustAccumulatedImbalanceCommentCreate = await this.balancingService.adjustAccumulatedImbalanceCommentCreate(body, req?.user?.sub)

    const his = await this.balancingService.adjustAccumulatedImbalanceOnce(
      {
        id: balancing_adjust_accumulated_imbalance_id,
        start_date: body?.start_date, // ส่งแบบ หน้าเรียก table
        end_date: body?.start_date, // ส่งแบบ หน้าเรียก table
        skip: body?.skip, // ส่งแบบ หน้าเรียก table
        limit: body?.limit // ส่งแบบ หน้าเรียก table
      },
      req?.user?.sub
    )

    await this.balancingService.writeReq(req, `adjust-accumulated-imbalance`, adjustAccumulatedImbalanceCommentCreate?.type, his)

    return adjustAccumulatedImbalanceCommentCreate
  }

  // adjust-accumulated-imbalance-comment-once
  @Get('adjust-accumulated-imbalance-comment-once')
  adjustAccumulatedImbalanceCommentOnce(@Query() query: any) {
    return this.balancingService.adjustAccumulatedImbalanceCommentOnce(query)
  }

  @UseGuards(AuthGuard)
  @Post('adjust-accumulated-imbalance/adjust')
  async adjustAccumulatedImbalanceAdjustIm(@Body() body: any, @Req() req: any) {
    const {id, adjustImbalance} = body
    if (!id || !adjustImbalance) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const adjustAccumulatedImbalanceAdjustIm = await this.balancingService.adjustAccumulatedImbalanceAdjustIm(body, req?.user?.sub)

    const his = await this.balancingService.adjustAccumulatedImbalanceOnce(body, req?.user?.sub)
    await this.balancingService.writeReq(req, `adjust-accumulated-imbalance`, 'adjust', his)
    return adjustAccumulatedImbalanceAdjustIm
  }

  @Get('shipper')
  shipper(@Req() req: any) {
    return this.balancingService.shipper()
  }

  @Get('zone')
  zone(@Req() req: any) {
    return this.balancingService.zone()
  }

  @UseGuards(AuthGuard)
  @Get('vent-commissioning-other-gas')
  ventCommissioningOtherGas(@Req() req: any) {
    return this.balancingService.ventCommissioningOtherGas()
  }

  @UseGuards(AuthGuard)
  @Post('vent-commissioning-other-gas')
  async ventCommissioningOtherGasCreate(@Body() body: any, @Req() req: any) {
    const {gas_day, group_id, zone_id, vent_gas_value_mmbtud, commissioning_gas_value_mmbtud, other_gas_value_mmbtud, remark} = body
    if (!gas_day || !group_id || !zone_id || !vent_gas_value_mmbtud || !commissioning_gas_value_mmbtud || !other_gas_value_mmbtud) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const ventCommissioningOtherGasCreate = await this.balancingService.ventCommissioningOtherGasCreate(body, req?.user?.sub)

    const his = await this.balancingService.ventCommissioningOtherGasOnce(ventCommissioningOtherGasCreate?.id)
    await this.balancingService.writeReq(req, `vent-commissioning-other-gas`, 'create', his)
    return ventCommissioningOtherGasCreate
  }

  @UseGuards(AuthGuard)
  @Put('vent-commissioning-other-gas/:id')
  async ventCommissioningOtherGasUpdate(@Param('id') id: any, @Body() body: any, @Req() req: any) {
    const {gas_day, group_id, zone_id, vent_gas_value_mmbtud, commissioning_gas_value_mmbtud, other_gas_value_mmbtud, remark} = body

    if (!id || !vent_gas_value_mmbtud || !commissioning_gas_value_mmbtud || !other_gas_value_mmbtud) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const ventCommissioningOtherGasUpdate = await this.balancingService.ventCommissioningOtherGasUpdate(Number(id), body, req?.user?.sub)

    const his = await this.balancingService.ventCommissioningOtherGasOnce(Number(id))
    await this.balancingService.writeReq(req, `vent-commissioning-other-gas`, 'edit', his)
    return ventCommissioningOtherGasUpdate
  }

  @UseGuards(AuthGuard)
  @Delete('vent-commissioning-other-gas')
  async ventCommissioningOtherGasDelete(@Body() body: any, @Req() req: any) {
    const {id} = body
    if (!id && id.length <= 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const ventCommissioningOtherGasDelete = await this.balancingService.ventCommissioningOtherGasDelete(id, req?.user?.sub)
    for (let i = 0; i < id.length; i++) {
      const his = await this.balancingService.ventCommissioningOtherGasOnce(Number(id[i]))
      await this.balancingService.writeReq(req, `vent-commissioning-other-gas`, 'delete', his)
    }
    return ventCommissioningOtherGasDelete
  }

  @UseGuards(AuthGuard)
  @Post('vent-commissioning-other-gas/import')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any
    // @Body('comment') comment: string,
    // @Body('tabType') tabType: string,
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && file.mimetype !== 'application/vnd.ms-excel') {
      throw new BadRequestException('Only Excel files (xlsx or xls) are allowed.')
    }

    if (file.buffer.length === 0) {
      throw new Error('Buffer is empty before sending to gRPC')
    }
    // ส่ง buffer ไปยัง gRPC
    const grpcTransform = await this.fileUploadService.uploadFileTempMultiSheet(file.buffer)

    if (!file) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const uploadFile = await this.balancingService.ventCommissioningOtherGasImport(grpcTransform, file, req?.user?.sub)

    for (let i = 0; i < uploadFile.length; i++) {
      const his = await this.balancingService.ventCommissioningOtherGasOnce(Number(uploadFile[i]?.id))
      await this.balancingService.writeReq(req, `vent-commissioning-other-gas`, 'import', his)
    }

    return uploadFile
  }

  // http://10.100.101.15:8010/master/balancing/vent-commissioning-other-gas/template
  // @UseGuards(AuthGuard)
  @Get('vent-commissioning-other-gas/template')
  async ventCommissioningOtherGasTemplate(
    @Res() res: any,
    // @Req() req: any,
    @Query() query: any
  ) {
    return await this.balancingService.ventCommissioningOtherGasTemplate(res)
  }

  // ---

  // @UseGuards(AuthGuard)
  @Post('intraday-base-inentory')
  intradayBaseInentory(@Body() body: any, @Req() req: any) {
    return this.balancingService.intradayBaseInentoryFromWebService(body, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('intraday-base-inentory-shipper')
  intradayBaseInentoryShipper(@Body() body: any, @Req() req: any) {
    // return this.balancingService.intradayBaseInentoryShipper(
    //   body,
    //   req?.user?.sub,
    // );
    return this.balancingService.intradayBaseInentoryShipper2(body, req?.user?.sub)
  }

  // http://10.100.101.15:8010/master/balancing/intraday-base-inentory/template
  // @UseGuards(AuthGuard)
  @Get('intraday-base-inentory/template')
  async intradayBaseInentoryTemplate(
    @Res() res: any,
    // @Req() req: any,
    @Query() query: any
  ) {
    return await this.balancingService.intradayBaseInentoryTemplate(res)
  }

  // heatingValue_base

  @UseGuards(AuthGuard)
  @Post('intraday-base-inentory/import')
  @UseInterceptors(FileInterceptor('file'))
  async intradayBaseInentoryTemplateUploadFile(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any
    // @Body('comment') comment: string,
    // @Body('tabType') tabType: string,
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && file.mimetype !== 'application/vnd.ms-excel') {
      throw new BadRequestException('Only Excel files (xlsx or xls) are allowed.')
    }

    if (file.buffer.length === 0) {
      throw new Error('Buffer is empty before sending to gRPC')
    }
    // ส่ง buffer ไปยัง gRPC
    const grpcTransform = await this.fileUploadService.uploadFileTempMultiSheet(file.buffer)

    if (!file) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const uploadFile = await this.balancingService.intradayBaseInentoryImport(grpcTransform, file, req?.user?.sub)

    // for (let i = 0; i < uploadFile.length; i++) {

    //   const his = await this.balancingService.ventCommissioningOtherGasOnce(Number(uploadFile[i]?.id));
    //   await this.balancingService.writeReq(
    //     req,
    //     `vent-commissioning-other-gas`,
    //     "import",
    //     his,
    //   );
    // }

    return uploadFile
  }

  // balancReport
  @UseGuards(AuthGuard)
  @Post('balance-report')
  async balancReport(@Body() body: any, @Req() req: any) {
    // const { zone, gas_day, value, remark  } = body;
    // if (!zone || !gas_day) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    const balancReport = await this.balancingService.balancReport(body, req?.user?.sub)

    // const his = await this.balancingService.intradayAccImbalanceInventoryOnce({gas_day});
    // await this.balancingService.writeReq(
    //   req,
    //   `intraday-acc-imbalance-inventory`,
    //   balancReport?.type,
    //   his,
    // );
    return balancReport
  }

  // balance_intraday_acc_imb_inventory
  @UseGuards(AuthGuard)
  @Post('intraday-acc-imbalance-inventory-original')
  async intradayAccImbalanceInventoryOriginal(@Body() body: any, @Req() req: any) {
    // const { zone, gas_day, value, remark  } = body;
    // if (!zone || !gas_day) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    // const intradayAccImbalanceInventoryOriginal = await this.balancingService.intradayAccImbalanceInventoryOriginal(body, req?.user?.sub)
    const intradayAccImbalanceInventoryOriginal = await this.balancingService.intradayAccImbalanceInventoryOriginal2(body, req?.user?.sub)

    // const his = await this.balancingService.intradayAccImbalanceInventoryOriginalOnce({gas_day});
    // await this.balancingService.writeReq(
    //   req,
    //   `intraday-acc-imbalance-inventory-original`,
    //   intradayAccImbalanceInventoryOriginal?.type,
    //   his,
    // );
    return intradayAccImbalanceInventoryOriginal
  }

  @UseGuards(AuthGuard)
  @Post('instructed-operation-flow-shippers')
  instructedOperationFlowShippers(@Body() body: any, @Req() req: any) {
    return this.balancingService.instructedOperationFlowShippers(body, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('instructed-operation-flow-shippers-upload')
  @UseInterceptors(FileInterceptor('file'))
  async instructedOperationFlowShippersUpload(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any,
    @Body('id') id: string
    // @Body('contract_code_id') contract_code_id: string,
    // @Body('nomination_type_id') nomination_type_id: string,
    // @Body('comment') comment: string,
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    // file.buffer,

    // if (!shipper_id || !contract_code_id || !nomination_type_id || !file) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    const instructedOperationFlowShippersUpload = await this.balancingService.instructedOperationFlowShippersUpload(file, req?.user?.sub, id)
    // const his = await this.uploadTemplateForShipperService.findOnce(id);
    // await this.uploadTemplateForShipperService.writeReq(
    //   req,
    //   `upload-template-for-shipper`,
    //   message, //create | edit
    //   his,
    // );

    return instructedOperationFlowShippersUpload
  }

  @UseGuards(AuthGuard)
  @Put('instructed-operation-flow-shippers-comment/:id')
  instructedOperationFlowShippersComment(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    return this.balancingService.instructedOperationFlowShippersComment(body, id, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Put('instructed-operation-flow-shippers/:id')
  async instructedOperationFlowShippersEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const resData = await this.balancingService.instructedOperationFlowShippersEdit(body, id, req?.user?.sub)

    const his = await this.balancingService.instructedOperationFlowShippersOnce(id)
    await this.balancingService.writeReq(
      req,
      `instructed-operation-flow-shippers`,
      'edit', //create | edit
      his
    )

    return resData
  }

  @UseGuards(AuthGuard)
  @Post('balance-intraday-dashboard')
  balanceIntradayDashboard(@Body() body: any, @Req() req: any) {
    return this.balancingService.balanceIntradayDashboard(body, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('balance-intraday-dashboard/user-type')
  balanceIntradayDashboardSendEmailGetUserType(@Req() req: any) {
    return this.balancingService.balanceIntradayDashboardSendEmailGetUserType(req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('balance-intraday-dashboard/send-email')
  balanceIntradayDashboardSendEmailGet(@Req() req: any) {
    return this.balancingService.balanceIntradayDashboardSendEmailGet(req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('balance-intraday-dashboard/send-email')
  async balanceIntradayDashboardSendEmail(@Body() body: any, @Req() req: any) {

    // return body
    const balancingService = await this.balancingService.balanceIntradayDashboardSendEmail(body, req?.user?.sub)

    return balancingService
  }
  // intraday_dashboard_sent_email

  @UseGuards(AuthGuard)
  @Post('intraday-balancing-report')
  async intradayBalancingReport(@Body() body: any, @Req() req: any) {
    // const { zone, gas_day, value, remark  } = body;
    // if (!zone || !gas_day) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    const intradayBalancingReport =
      // await this.balancingService.intradayBalancingReport(body, req?.user?.sub);
      await this.balancingService.intradayBalancingReport2(body, req?.user?.sub)

    // const his = await this.balancingService.intradayAccImbalanceInventoryOnce({gas_day});
    // await this.balancingService.writeReq(
    //   req,
    //   `intraday-acc-imbalance-inventory`,
    //   intradayBalancingReport?.type,
    //   his,
    // );
    return intradayBalancingReport
  }

  @UseGuards(AuthGuard)
  @Post('system-acc-imbalance-inventory')
  async systemAccImbalanceInventory(@Body() body: any, @Req() req: any) {
    // const { zone, gas_day, value, remark  } = body;
    // if (!zone || !gas_day) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    const systemAccImbalanceInventory =
      // await this.balancingService.systemAccImbalanceInventory(body, req?.user?.sub);
      // await this.balancingService.systemAccImbalanceInventory2(body, req?.user?.sub)
      await this.balancingService.systemAccImbalanceInventory3(body, req?.user?.sub)

    // const his = await this.balancingService.intradayAccImbalanceInventoryOnce({gas_day});
    // await this.balancingService.writeReq(
    //   req,
    //   `intraday-acc-imbalance-inventory`,
    //   systemAccImbalanceInventory?.type,
    //   his,
    // );
    return systemAccImbalanceInventory
  }

  @UseGuards(AuthGuard)
  @Post('intraday-acc-imbalance-dashboard')
  async intradayAccImbalanceDashboard(@Body() body: any, @Req() req: any) {
    // const { zone, gas_day, value, remark  } = body;
    // if (!zone || !gas_day) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    const intradayAccImbalanceDashboard =
      // await this.balancingService.intradayAccImbalanceDashboard(body, req?.user?.sub);
      // await this.balancingService.intradayAccImbalanceDashboard2(body, req?.user?.sub)
      await this.balancingService.intradayAccImbalanceDashboard3(body, req?.user?.sub)

    // const his = await this.balancingService.intradayAccImbalanceInventoryOnce({gas_day});
    // await this.balancingService.writeReq(
    //   req,
    //   `intraday-acc-imbalance-inventory`,
    //   intradayAccImbalanceDashboard?.type,
    //   his,
    // );
    return intradayAccImbalanceDashboard
  }

  // https://app.clickup.com/t/86eu4md5p
  @UseGuards(AuthGuard)
  @Get('balancing-monthly-report')
  balancingMonthlyReport(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit, shipperId, month, year, version, contractCode} = query

    if (!month || !year) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return this.balancingService.balancingMonthlyReport(query, req?.user?.sub)
  }

  //ok inapp
  @UseGuards(AuthGuard)
  @Get('balancing-monthly-report-approved')
  async balancingMonthlyReportApproved(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit, shipperId, month, year, version, contractCode} = query

    if (!month || !year) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const balancingService = await this.balancingService.balancingMonthlyReportApproved(query, req?.user?.sub)

    // inapp
    try {
      const message = `Approved Balancing Monthly Report on ${dayjs(month, 'MM').format('MMM')}`
      await middleNotiInapp(
        this.prisma,
        'Balancing',
        `${message}`,
        1018, // menus_id | 91 Closed Balancing Report | 1018 Monthly Report
        1
      )
    } catch (error) {}

    return balancingService
  }

  @UseGuards(AuthGuard)
  @Get('balancing-monthly-report-download')
  balancingMonthlyReportDownload(@Req() req: any) {
    return this.balancingService.balancingMonthlyReportDownload()
  }

  @UseGuards(AuthGuard)
  @Patch('balancing-monthly-report-download/:id')
  balancingMonthlyReportDownloadUse(@Res() res: Response, @Param('id') id: any, @Req() req: any) {
    return this.balancingService.balancingMonthlyReportDownloadUse(res, id, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('last-retrieving-new')
  lastRetrievingNew(@Req() req: any) {
    return this.balancingService.lastRetrievingNew()
  }
}
