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

import {SummaryNominationReportService} from './summary-nomination-report.service'

@Controller(
  'summary-nomination-report'
)
export class SummaryNominationReportController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService,
    private readonly summaryNominationReportService: SummaryNominationReportService
  ) {}

  @Get()
  findAll(
    @Query() query: any
  ) {
    return this.summaryNominationReportService.findAll(
      query
    )
  }

  @Get('nomData')
  nomData() {
    return this.summaryNominationReportService.nomData()
  }
}
