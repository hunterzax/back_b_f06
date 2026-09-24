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
import {FileInterceptor} from '@nestjs/platform-express'
import {
  Request,
  Response
} from 'express'
import {FileUploadService} from 'src/grpc/file-service.service'
import {QueryShipperPlanningFileService} from './query-shipper-planning-file.service'

@Controller(
  'query-shipper-planning-file'
)
export class QueryShipperPlanningFileController {
  constructor(
    private readonly queryShipperPlanningFileService: QueryShipperPlanningFileService,
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(@Req() req: any) {
    return this.queryShipperPlanningFileService.findAll(
      req?.user?.sub
    )
  }
}
