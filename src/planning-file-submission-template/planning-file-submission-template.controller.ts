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
import {PlanningFileSubmissionTemplateService} from './planning-file-submission-template.service'
import {FileInterceptor} from '@nestjs/platform-express'
import {
  Request,
  Response
} from 'express'
import {FileUploadService} from 'src/grpc/file-service.service'

interface MulterFile {
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}

@Controller(
  'planning-file-submission-template'
)
export class PlanningFileSubmissionTemplateController {
  constructor(
    private readonly planningFileSubmissionTemplateService: PlanningFileSubmissionTemplateService,
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService
  ) {}

  @Get()
  findAll() {
    return this.planningFileSubmissionTemplateService.findAll()
  }

  @Get('shipper-group')
  shipperGroup() {
    return this.planningFileSubmissionTemplateService.shipperGroup()
  }

  @Get('term-type-notnon')
  termType() {
    return this.planningFileSubmissionTemplateService.termType()
  }

  @Get('nomination-point')
  nominationPoint() {
    return this.planningFileSubmissionTemplateService.nominationPoint()
  }

  @UseGuards(AuthGuard)
  @Post()
  async create(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      term_type_id,
      nomination_point,
      start_date,
      end_date
    } = body

    if (
      !term_type_id ||
      !nomination_point ||
      nomination_point.length ===
        0 ||
      !start_date
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const create =
      await this.planningFileSubmissionTemplateService.create(
        body,
        req?.user?.sub
      )

    const his = await this.planningFileSubmissionTemplateService.findOnce(
      create?.id,
    );
    await this.planningFileSubmissionTemplateService.writeReq(
      req,
      `planning-file-submission-template`,
      'create',
      his,
    );

    return create
  }

  @UseGuards(AuthGuard)
  @Put('edit/:id')
  async edit(
    @Body() body: any,
    @Req() req: any,
    @Param('id') id: any
  ) {
    const {
      term_type_id,
      nomination_point,
      start_date,
      end_date
    } = body

    if (
      !id ||
      !term_type_id ||
      !nomination_point ||
      nomination_point.length ===
        0 ||
      !start_date
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const edit =
      await this.planningFileSubmissionTemplateService.edit(
        body,
        id,
        req?.user?.sub
      )
    const his =
      await this.planningFileSubmissionTemplateService.findOnce(
        id
      )
    await this.planningFileSubmissionTemplateService.writeReq(
      req,
      `planning-file-submission-template`,
      'edit',
      his
    )

    return edit
  }
}
