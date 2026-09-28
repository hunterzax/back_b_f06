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
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException
} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {PlanningDashboardService} from './planning-dashboard.service'

@Controller(
  'planning-dashboard'
)
export class PlanningDashboardController {
  constructor(
    private readonly planningDashboardService: PlanningDashboardService,
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService
  ) {}

  @UseGuards(AuthGuard)
  @Get('long-term')
  dashboardLong(
    @Query('sheet') sheet: string,
    @Req() req: any
  ) {
    return this.planningDashboardService.dashboardLong(
      {sheet},
      req?.user?.sub
    )
  }

  @UseGuards(AuthGuard)
  @Get('medium-term')
  dashboardMedium(
    @Query('sheet') sheet: string,
    @Req() req: any
  ) {
    return this.planningDashboardService.dashboardMedium(
      {sheet},
      req?.user?.sub
    )
  }

  @UseGuards(AuthGuard)
  @Get('short-term')
  dashboardShort(
    @Query('sheet') sheet: string,
    @Req() req: any
  ) {
    return this.planningDashboardService.dashboardShort(
      {sheet},
      req?.user?.sub
    )
  }
}
