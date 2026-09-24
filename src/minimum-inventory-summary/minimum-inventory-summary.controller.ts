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
import {JwtService} from '@nestjs/jwt'
import {FileUploadService} from 'src/grpc/file-service.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {FileInterceptor} from '@nestjs/platform-express'
import {Response} from 'express'
import {MinimumInventorySummaryService} from './minimum-inventory-summary.service'

@Controller(
  'minimum-inventory-summary'
)
export class MinimumInventorySummaryController {
  constructor(
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService,
    private readonly minimumInventorySummaryService: MinimumInventorySummaryService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(
    @Query() query: any,
    @Req() req: any
  ) {
    return this.minimumInventorySummaryService.findAll(
      query,
      req?.user?.sub
    )
  }
}
