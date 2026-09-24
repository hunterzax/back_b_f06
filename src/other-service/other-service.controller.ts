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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res
} from '@nestjs/common'
import {OtherServiceService} from './other-service.service'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {FileInterceptor} from '@nestjs/platform-express'
import {
  Request,
  Response
} from 'express'
import {FileUploadService} from 'src/grpc/file-service.service'
import {AuthGuard} from 'src/auth/auth.guard'

interface MulterFile {
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}

@Controller('other-service')
export class OtherServiceController {
  constructor(
    private readonly otherServiceService: OtherServiceService,
    private readonly fileUploadService: FileUploadService
  ) {}

  @UseGuards(AuthGuard)
  @Post('upload-json-by-kml')
  @UseInterceptors(
    FileInterceptor('file')
  )
  async pathDetailCapacityRequestManagementTranform(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (!file) {
      throw new BadRequestException(
        'No file uploaded'
      )
    }

    // ตรวจสอบว่าไฟล์เป็น JSON
    if (
      file.mimetype !==
      'application/json'
    ) {
      throw new BadRequestException(
        'Only JSON files are allowed'
      )
    }
    const resDate =
      await this.otherServiceService.convert(
        file,
        req?.user?.sub
      )
    return resDate
  }

  @Get('area-line-map')
  async getAreaLineMap() {
    const resDate =
      await this.otherServiceService.getAreaLineMap()
    return resDate
  }
}
