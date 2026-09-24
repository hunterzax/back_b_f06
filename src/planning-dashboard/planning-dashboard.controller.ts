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
    @Req() req: any
  ) {
    return this.planningDashboardService.dashboardLong(
      req?.user?.sub
    )
  }

  @UseGuards(AuthGuard)
  @Get('medium-term')
  dashboardMedium(
    @Req() req: any
  ) {
    return this.planningDashboardService.dashboardMedium(
      req?.user?.sub
    )
  }

  @UseGuards(AuthGuard)
  @Get('short-term')
  dashboardShort(
    @Req() req: any
  ) {
    return this.planningDashboardService.dashboardShort(
      req?.user?.sub
    )
  }
}
