import {Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, HttpException, HttpStatus, Put, Query, Res} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {TariffService} from './tariff.service'
import {middleNotiInapp} from 'src/common/utils/inapp.util'
import {PrismaService} from '@prisma/prisma.service'

@Controller('tariff')
export class TariffController {
  constructor(
    private readonly tariffService: TariffService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard)
  @Get('tariffChargeReport/tariffType')
  tariffType(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.tariffType()
  }

  @UseGuards(AuthGuard)
  @Get('tariffChargeReport/tariffInvoiceSent')
  tariffInvoiceSent(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.tariffInvoiceSent()
  }

  @UseGuards(AuthGuard)
  @Get('tariffChargeReport/tariffChargeType')
  tariffChargeType(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.tariffChargeType()
  }

  @UseGuards(AuthGuard)
  @Get('tariffChargeReport/shipperMonthActive')
  shipperMonthActive(@Req() req: any, @Query() query: any) {
    const {date} = query
    const userId = req?.user?.sub
    return this.tariffService.shipperMonthActive(date)
  }

  @UseGuards(AuthGuard)
  @Get('tariffChargeReport/tariffChargeReportFindId')
  tariffChargeReportFindId(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.tariffChargeReportFindId(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('tariffChargeReport/tariffChargeReportFindAll')
  tariffChargeReportFindAll(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.tariffChargeReportFindAll(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('tariffChargeReport/chargeFindAll')
  chargeFindAll(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.chargeFindAll(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('tariffChargeReport/chargeView')
  chargeView(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.chargeView(query, userId)
  }

  @UseGuards(AuthGuard)
  @Post('tariffChargeReport/comments')
  async comments(@Body() body: any, @Req() req: any) {
    const {comment, id} = body

    if (!comment || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const comments = await this.tariffService.comments(body, req?.user?.sub)

    await this.tariffService.writeReq(req, `tariff/tariffChargeReport/comments`, 'comment', comments)

    return comments
  }

  @UseGuards(AuthGuard)
  @Post('tariffChargeReport/runtariff')
  async runtariff(@Body() body: any, @Req() req: any) {
    const {month_year, shipper_id} = body

    // try {
    //         await middleNotiInapp(
    //           this.prisma,
    //           'Tariff',
    //           `ทดสอบ noti ครั้งที่ 1`,
    //           103, // menus_id | 103 Tariff Charge Report | 104 Credit/Debit Note
    //           1,
    //         );
    //       } catch (error) {
    //       }

    // return

    if (!month_year || !shipper_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const runtariff = await this.tariffService.runtariff(body, req?.user?.sub)

    // await this.tariffService.writeReq(
    //   req,
    //   `tariff/tariffChargeReport/runtariff`,
    //   'create',
    //   runtariff,
    // );

    return runtariff
  }

  @UseGuards(AuthGuard)
  @Patch('tariffChargeReport/chargeEdit/:id')
  async chargeEdit(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {quantity_operator, amount_operator} = body

    if (!quantity_operator || !amount_operator) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const chargeEdit = await this.tariffService.chargeEdit(id, body, req?.user?.sub)

    // await this.tariffService.writeReq(
    //   req,
    //   `tariff/tariffChargeReport/chargeEdit`,
    //   'edit',
    //   chargeEdit,
    // );

    return chargeEdit
  }

  @UseGuards(AuthGuard)
  @Patch('tariffChargeReport/invoiceSent/:id')
  async invoiceSent(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const invoiceSent = await this.tariffService.invoiceSent(id, body, req?.user?.sub)

    // await this.tariffService.writeReq(
    //   req,
    //   `tariff/tariffChargeReport/invoiceSent`,
    //   'invoice-sent',
    //   invoiceSent,
    // );

    return invoiceSent
  }

  @UseGuards(AuthGuard)
  @Patch('tariffChargeReport/bacCalc/:id/:source')
  async bacCalc(
    @Req() req: any,
    @Param('id') id: any,
    @Param('source')
    source: any
  ) {
    if (!id || !source) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const bacCalc = await this.tariffService.bacCalc(id, source, req?.user?.sub)

    // await this.tariffService.writeReq(
    //   req,
    //   `tariff/tariffChargeReport/bacCalc`,
    //   'bac-calc',
    //   bacCalc,
    // );

    return bacCalc
  }

  // credit/debit note
  @UseGuards(AuthGuard)
  @Get('tariffCreditDebitNote/selectShipper')
  selectShipper(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.selectShipper(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('tariffCreditDebitNote/selectCNDNType')
  selectCNDNType(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.selectCNDNType(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('tariffCreditDebitNote/typeCharge')
  typeCharge(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.typeCharge(query, userId)
  }

  @UseGuards(AuthGuard)
  @Post('tariffCreditDebitNote/selectContract')
  selectContract(@Req() req: any, @Body() body: any) {
    const userId = req?.user?.sub
    return this.tariffService.selectContract(body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('tariffCreditDebitNote/selectTariffId')
  selectTariffId(@Req() req: any, @Body() body: any) {
    const userId = req?.user?.sub
    return this.tariffService.selectTariffId(body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('tariffCreditDebitNote/genData')
  genData(@Req() req: any, @Body() body: any) {
    const userId = req?.user?.sub
    return this.tariffService.genData(body, userId)
  }

  @UseGuards(AuthGuard)
  @Get('tariffCreditDebitNote/findAllTariffCreditDebitNote')
  findAllTariffCreditDebitNote(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.tariffService.findAllTariffCreditDebitNote(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('tariffCreditDebitNote/findTariffCreditDebitNoteDetail/:id')
  findTariffCreditDebitNoteDetail(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.tariffService.findTariffCreditDebitNoteDetail(id, userId)
  }

  @UseGuards(AuthGuard)
  @Post('tariffCreditDebitNote/create')
  async create(@Req() req: any, @Body() body: any) {
    const userId = req?.user?.sub

    const create = await this.tariffService.create(body, userId)
    const findTariffCreditDebitNote = await this.tariffService.findTariffCreditDebitNote(create?.id, userId)

    await this.tariffService.writeReq(req, `tariff/tariffCreditDebitNote`, 'create', {
      ...findTariffCreditDebitNote,
      filter_tariff_id: body?.filter_tariff_id || null
    })
    return findTariffCreditDebitNote
  }

  @UseGuards(AuthGuard)
  @Patch('tariffCreditDebitNote/edit/:id')
  async edit(@Req() req: any, @Body() body: any, @Param('id') id: any) {
    const userId = req?.user?.sub

    const edit = await this.tariffService.edit(id, body, userId)
    const findTariffCreditDebitNote = await this.tariffService.findTariffCreditDebitNote(id, userId)

    await this.tariffService.writeReq(req, `tariff/tariffCreditDebitNote`, 'edit', {
      ...findTariffCreditDebitNote,
      filter_tariff_id: body?.filter_tariff_id || null
    })
    return findTariffCreditDebitNote
  }

  @UseGuards(AuthGuard)
  @Patch('tariffCreditDebitNote/comments')
  async tariffCreditDebitNoteComments(@Body() body: any, @Req() req: any) {
    const {comment, id} = body

    if (!comment || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const tariffCreditDebitNoteComments = await this.tariffService.tariffCreditDebitNoteComments(body, req?.user?.sub)

    await this.tariffService.writeReq(req, `tariff/tariffCreditDebitNote`, 'comment', tariffCreditDebitNoteComments)

    return tariffCreditDebitNoteComments
  }
}
