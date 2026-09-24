import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Put,
  Req,
  Get,
  Query,
  UseGuards
} from '@nestjs/common'
import {AstosService} from './astos.service'
import {AstosGuard} from './astos.guard'
import {AuthGuard} from 'src/auth/auth.guard'

@Controller('astos')
export class AstosController {
  constructor(
    private readonly astosService: AstosService
  ) {}

  // @UseGuards(AstosGuard)
  @Put(
    'execute_updateStatus_intraday'
  )
  execute_updateStatus_intraday(
    @Body() body: any
  ) {
    const {
      request_number,
      execute_timestamp,
      finish_timestamp,
      status,
      msg
    } = body

    if (
      !request_number ||
      !execute_timestamp ||
      !finish_timestamp ||
      !status
    ) {
      throw new HttpException(
        {
          status_code: 400,
          error:
            'Bad Request',
          message:
            'Invalid input data'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return this.astosService.execute_updateStatus_intraday(
      body
    )
  }

  // @UseGuards(AstosGuard)
  @Put(
    'execute_updateStatus_eod'
  )
  execute_updateStatus_eod(
    @Body() body: any
  ) {
    const {
      request_number,
      execute_timestamp,
      finish_timestamp,
      status,
      msg
    } = body

    if (
      !request_number ||
      !execute_timestamp ||
      !finish_timestamp ||
      !status
    ) {
      throw new HttpException(
        {
          status_code: 400,
          error:
            'Bad Request',
          message:
            'Invalid input data'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return this.astosService.execute_updateStatus_eod(
      body
    )
  }

  // @UseGuards(AstosGuard)
  @Post('eviden_contract')
  async eviden_contract(
    @Req() req: any,
    @Body() body: any
  ) {
    const eviden_contract =
      await this.astosService.eviden_contract(
        body
      )
    return eviden_contract
  }

  // @UseGuards(AstosGuard)
  @Post(
    'eviden_contract_capacity'
  )
  async eviden_contract_capacity(
    @Req() req: any,
    @Body() body: any
  ) {
    const eviden_contract_capacity =
      await this.astosService.eviden_contract_capacity(
        body
      )
    return eviden_contract_capacity
  }

  // @UseGuards(AstosGuard)
  @Post(
    'eviden_nomination_eod'
  )
  async eviden_nomination_eod(
    @Req() req: any,
    @Body() body: any
  ) {
    const eviden_nomination_eod =
      await this.astosService.eviden_nomination_eod(
        body
      )
    return eviden_nomination_eod
  }
  // @UseGuards(AstosGuard)
  @Post('eviden_revbal_eod')
  async eviden_revbal_eod(
    @Req() req: any,
    @Body() body: any
  ) {
    const eviden_revbal_eod =
      await this.astosService.eviden_revbal_eod(
        body
      )
    return eviden_revbal_eod
  }

  // @UseGuards(AstosGuard)
  @Post(
    'eviden_nomination_intraday'
  )
  async eviden_nomination_intraday(
    @Req() req: any,
    @Body() body: any
  ) {
    const eviden_nomination_intraday =
      await this.astosService.eviden_nomination_intraday(
        body
      )
    return eviden_nomination_intraday
  }

  @UseGuards(AuthGuard)
  @Get(
    'test_daily_adjustment_summary'
  )
  async test_daily_adjustment_summary(
    @Query() query: any
  ) {
    const data =
      await this.astosService.daily_adjustment_summary(
        {
          ...query,
          daily_adjustment_summary_unit:
            query?.unit
        }
      )
    return {
      total_record:
        data.length,
      status_code: 200,
      data
    }
  }
  // @UseGuards(AstosGuard)
  @Post(
    'eviden_revbal_intraday'
  )
  async eviden_revbal_intraday(
    @Req() req: any,
    @Body() body: any
  ) {
    const eviden_revbal_intraday =
      await this.astosService.eviden_revbal_intraday(
        body
      )
    return eviden_revbal_intraday
  }

  @Post(
    'balance_adjusment_by_system'
  )
  async balance_adjusment_by_system(
    @Req() req: any,
    @Body() body: any
  ) {
    const balance_adjusment_by_system =
      await this.astosService.balance_adjusment_by_system(
        body
      )
    return balance_adjusment_by_system
  }

  @Post(
    'balance_adjusment_by_shipper'
  )
  async balance_adjusment_by_shipper(
    @Req() req: any,
    @Body() body: any
  ) {
    const balance_adjusment_by_shipper =
      await this.astosService.balance_adjusment_by_shipper(
        body
      )
    return balance_adjusment_by_shipper
  }

  @Post(
    'balance_intraday_base_inventory'
  )
  async balance_intraday_base_inventory(
    @Req() req: any,
    @Body() body: any
  ) {
    const balance_intraday_base_inventory =
      await this.astosService.balance_intraday_base_inventory(
        body
      )
    return balance_intraday_base_inventory
  }
}
