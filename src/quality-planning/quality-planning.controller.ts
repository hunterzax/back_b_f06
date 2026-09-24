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
import {AuthGuard} from 'src/auth/auth.guard'
import {Response} from 'express'
import {QualityPlanningService} from './quality-planning.service'

@Controller(
  'quality-planning'
)
export class QualityPlanningController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly qualityPlanningService: QualityPlanningService
  ) {}

  // @Get("test")
  // test() {
  //   return this.qualityPlanningService.test();
  // }

  @Get()
  findAll(
    @Query('gasDay')
    gasDay?: string,
    @Query('tab') tab?: string
  ) {
    return this.qualityPlanningService.findAll(
      {gasDay, tab}
    )
  }
}
