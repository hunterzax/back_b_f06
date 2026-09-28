import {Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, HttpException, HttpStatus, Put, UseInterceptors, UploadedFile, BadRequestException, Res, Query} from '@nestjs/common'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {JwtService} from '@nestjs/jwt'
import {FileUploadService} from 'src/grpc/file-service.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {FileInterceptor} from '@nestjs/platform-express'
import {Response} from 'express'

import {QueryShipperNominationFileService} from './query-shipper-nomination-file.service'

@Controller('query-shipper-nomination-file')
export class QueryShipperNominationFileController {
  constructor(
    private readonly queryShipperNominationFileService: QueryShipperNominationFileService,
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(@Query() query: any, @Req() req: any) {
    return this.queryShipperNominationFileService.findAll(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('v2')
  findAllV2(@Body() body: any, @Req() req: any) {
    const {} = body
    return this.queryShipperNominationFileService.findAllV2(body, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('get-file-name')
  get_file_name(@Req() req: any) {
    return this.queryShipperNominationFileService.getFileName()
  }

  @UseGuards(AuthGuard)
  @Get('submission_comment_query_shipper_nomination_file/:id')
  submission_comment_query_shipper_nomination_file(@Req() req: any, @Param('id') id: any) {
    return this.queryShipperNominationFileService.submission_comment_query_shipper_nomination_file(id, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('submission_comment_query_shipper_nomination_file_version/:id')
  submission_comment_query_shipper_nomination_file_version(@Req() req: any, @Param('id') id: any) {
    return this.queryShipperNominationFileService.submission_comment_query_shipper_nomination_file_version(id, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('query_shipper_nomination_file_url/:id')
  query_shipper_nomination_file_url(@Req() req: any, @Param('id') id: any) {
    return this.queryShipperNominationFileService.query_shipper_nomination_file_url(id, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('query_shipper_nomination_file_comment/:id')
  query_shipper_nomination_file_comment(@Req() req: any, @Param('id') id: any) {
    return this.queryShipperNominationFileService.query_shipper_nomination_file_comment(id, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Delete('query_shipper_nomination_file_comment/:id')
  query_shipper_nomination_file_comment_delete(@Req() req: any, @Param('id') id: any) {
    return this.queryShipperNominationFileService.query_shipper_nomination_file_comment_delete(id, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('status')
  status(@Req() req: any) {
    return this.queryShipperNominationFileService.status()
  }

  @UseGuards(AuthGuard)
  @Get('shipper-nomination-report')
  shipperNominationReport(
    @Req() req: any,
    @Query('gasDay')
    gasDay?: string,
    @Query('tab') tab?: string
  ) {
    return this.queryShipperNominationFileService.shipperNominationReport({gasDay, tab})
  }
}
