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
import {Response} from 'express'
import {NominationDashboardService} from './nomination-dashboard.service'

@Controller(
  'nomination-dashboard'
)
export class NominationDashboardController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService,
    private readonly nominationDashboardService: NominationDashboardService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(
    @Query() query: any,
    @Req() req: any
  ) {
    return this.nominationDashboardService.findAll(
      query,
      req?.user?.sub
    )
  }
}
