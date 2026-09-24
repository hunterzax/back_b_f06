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

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

interface MulterFile {
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}
import {PlanningSubmissionFileService} from './planning-submission-file.service'
import {
  emailGetpermissionEmail,
  emailNotificationDAM,
  sendEmailProviderCustomDocs
} from 'src/common/utils/email'
import {PrismaService} from 'prisma/prisma.service'

@Controller(
  'planning-submission-file'
)
export class PlanningSubmissionFileController {
  constructor(
    private readonly planningSubmissionFileService: PlanningSubmissionFileService,
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService,
    private prisma: PrismaService
  ) {}

  //
  @UseGuards(AuthGuard)
  @Get('download')
  async createExcelTemplate(
    @Res() res: Response,
    @Req() req: any,
    @Query() query: any
  ) {
    const {startDate, type} =
      query
    if (
      !startDate ||
      !type ||
      !req?.user?.sub
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

    const idAccount =
      req?.user?.sub
    // const idAccount = 38
    // const getGroup = await this.planningSubmissionFileService.getGroupByIdAccount(idAccount)
    // const { id, id_name, name } = getGroup
    // const {excelBuffer, typeOfContract} = await this.planningSubmissionFileService.createExcelTemplate(query,{id, id_name, name},idAccount);
    const {
      excelBuffer,
      typeOfContract
    } =
      await this.planningSubmissionFileService.createExcelTemplate(
        query,
        null,
        idAccount
      )

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${typeOfContract}.xlsx`
    )

    // ส่ง buffer กลับใน response
    res.send(excelBuffer)
  }

  @UseGuards(AuthGuard)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file')
  )
  async importTemplate(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any,
    // @Body('terminateDate') terminateDate: string,
    @Body('shipper_id')
    shipper_id: string,
    @Body('startDate')
    startDate: string,
    @Body('type') type: string
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

    // const grpcTransform = await this.fileUploadService.uploadFileTemp(file.buffer);
    // const authHeader = req.headers['authorization'];
    // const token = authHeader.split(' ')[1]; // คำสั่งนี้จะแยก "Bearer <token>" ออกมาเป็น <token>
    const resData =
      await this.planningSubmissionFileService.uploadElsx(
        grpcTransform,
        file,
        shipper_id,
        req?.user?.sub,
        startDate,
        type
      )

    try {
      const header = `Submit Planning`
      const emailNotificationData =
        await emailNotificationDAM(
          this.prisma,
          5
        ) // emailNotificationData?.subject subject: emailNotificationData?.subject || "", detail: emailNotificationData?.detail || "",
      const shipperEmailArr =
        await emailGetpermissionEmail(
          this.prisma,
          44
        )
      const originalData = {
        cc: null,
        header: header,
        sendEmail:
          shipperEmailArr,
        subject:
          emailNotificationData?.subject ||
          '',
        detail:
          emailNotificationData?.detail ||
          '',
        excelBuffer: null,
        tagHTMLDetail: `
        <div>
          <ul>
            <li>Planning Code: ${resData?.data?.planningCode || ''}</li>
            <li>Planning Term: ${resData?.data?.typeId === 1 ? 'Long Term' : resData?.data?.typeId === 2 ? 'Medium Term' : resData?.data?.typeId === 3 ? 'Short Term' : ''}</li>
            <li>Planning Start Date: ${resData?.data?.startDate || ''}</li>
            <li>Planning End Date: ${resData?.data?.endDate || ''}</li>
          </ul>
        </div>
            `,
        filename:
          'emergency_difficult_day_document.pdf',
        contentType:
          'application/pdf'
      }
      await sendEmailProviderCustomDocs(
        originalData
      )
    } catch (error) {}

    return resData
  }

  // planning-deadline-use
  @Get(
    'planning-deadline-use/:id'
  )
  planningDeadlineUse(
    @Param('id') id: any
  ) {
    return this.planningSubmissionFileService.planningDeadlineUse(
      id
    )
  }
}
