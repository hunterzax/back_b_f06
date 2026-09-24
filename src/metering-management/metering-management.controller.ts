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
import {FileInterceptor} from '@nestjs/platform-express'
import {Response} from 'express'
import {MeteringManagementService} from './metering-management.service'
import {MeteredMicroService} from 'src/grpc/metered-service.service'
import {FileUploadService} from 'src/grpc/file-service.service'

@Controller(
  'metering-management'
)
export class MeteringManagementController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly meteringManagementService: MeteringManagementService,
    private readonly meteredMicroService: MeteredMicroService,
    private readonly fileUploadService: FileUploadService
  ) {}

  @Get('all-id')
  allId() {
    return this.meteringManagementService.allId()
  }

  @Get('test')
  async test(
    @Query() query: any
  ) {
    return this.meteringManagementService.test(
      query
    )
  }

  @Get('getRetrievingID')
  async getRetrievingID(
    @Query() query: any
  ) {
    return this.meteringManagementService.getRetrievingID(
      query,
      true
    )
  }

  @Get(
    'getDataByRetrievingID'
  )
  async getDataByRetrievingID(
    @Query() query: any
  ) {
    return this.meteringManagementService.getDataByRetrievingID(
      query,
      true
    )
  }

  //
  @UseGuards(AuthGuard)
  @Get('getData')
  async getData(
    @Query() query: any,
    @Req() req: any
  ) {
    return this.meteringManagementService.getDataLogic(
      query,
      true,
      req?.user?.sub
    )
  }

  @Get('retrieving-number')
  retrievingNumber(
    @Query() query: any
  ) {
    return this.meteringManagementService.retrievingNumber()
  }

  @Get('metering-retrieving')
  meteringRetrieving(
    @Query() query: any
  ) {
    // return this.meteringManagementService.meteringRetrieving();
    const {
      limit,
      offset,
      startDate,
      endDate,
      metered_run_number_id
    } = query

    return this.meteringManagementService.meteringRetrievingLimit(
      limit,
      offset,
      startDate,
      endDate,
      metered_run_number_id
    )
  }

  @Get(
    'metering-retrieving-data-check'
  )
  meteringRetrievingMasterCheck(
    @Query() query: any
  ) {
    // return this.meteringManagementService.meteringRetrieving();
    const {
      limit,
      offset,
      startDate,
      endDate,
      metered_run_number_id
    } = query

    // return this.meteringManagementService.meteringRetrievingMasterCheckLimit(limit, offset, metered_run_number_id);
    return this.meteringManagementService.meteringRetrievingMasterCheckLimit2(
      limit,
      offset,
      startDate,
      endDate,
      metered_run_number_id
    )
  }

  @Get('metering-checking')
  meteringChecking(
    @Query() query
  ) {
    // return this.meteringManagementService.meteringChecking(query);
    return this.meteringManagementService.meteringChecking2(
      query
    )
  }

  @Get('last-retrieving')
  lastRetrieving() {
    return this.meteringManagementService.lastRetrieving()
  }

  @UseGuards(AuthGuard)
  @Post(
    'metering-retrieving/check-data'
  )
  checkData(
    @Body() body: any,
    @Req() req: any
  ) {
    // return this.meteringManagementService.checkData();
    return this.meteringManagementService.checkData2()
  }

  @UseGuards(AuthGuard)
  @Post('execution')
  procressMetered(
    @Body() body: any,
    @Req() req: any
  ) {
    // return this.meteringManagementService.procressMetered(body, req?.user?.sub);
    return this.meteringManagementService.procressMetered2(
      body,
      req?.user?.sub
    )
  }

  @UseGuards(AuthGuard)
  @Post(
    'update-execute-status'
  )
  updateExecuteStatus(
    @Body() body: any,
    @Req() req: any
  ) {
    return this.meteringManagementService.updateExecuteStatus(
      body,
      req?.user?.sub
    )
  }

  // @UseGuards(AuthGuard)
  @Get('download-template')
  async createExcelTemplate(
    @Res() res: Response,
    // @Req() req:any,
    @Query() query: any
  ) {
    const {gasDay} = query
    if (!gasDay) {
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
    // http://10.100.101.15:8010/master/metering-management/download-template?gasDay=2025-03-24

    const {
      excelBuffer,
      nameFile
    } =
      await this.meteringManagementService.genExcelTemplateFinalMeter(
        query
      )

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${nameFile}.xlsx`
    )

    // ส่ง buffer กลับใน response
    res.send(excelBuffer)
  }

  // @UseGuards(AuthGuard)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file')
  )
  async uploadFile(
    @UploadedFile()
    file: Express.Multer.File
    // @Req() req: any,
    // @Body('comment') comment: string,
    // @Body('tabType') tabType: string,
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (
      file.mimetype !==
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      file.mimetype !==
        'application/vnd.ms-excel'
    ) {
      throw new BadRequestException(
        'Only Excel files (xlsx or xls) are allowed.'
      )
    }

    if (
      file.buffer.length === 0
    ) {
      throw new Error(
        'Buffer is empty before sending to gRPC'
      )
    }
    // ส่ง buffer ไปยัง gRPC
    const grpcTransform: any =
      await this.fileUploadService.uploadFileTempMultiSheet(
        file.buffer
      )

    // return JSON.parse(grpcTransform?.jsonDataMultiSheet)

    if (!file) {
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

    // const uploadFile =
    //   await this.meteringManagementService.uploadFile(
    //     grpcTransform,
    //     file,
    //     // req?.user?.sub,
    //   );
    const uploadFile =
      await this.meteringManagementService.uploadFile2(
        grpcTransform,
        file
      )

    return uploadFile
  }
}
