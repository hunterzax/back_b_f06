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
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {BulletinBoardService} from './bulletin-board.service'
import {Response} from 'express'
import {
  emailGetpermissionEmail,
  emailNotificationDAM,
  sendEmailProviderCustomDocs
} from 'src/common/utils/email'
import {PrismaService} from 'prisma/prisma.service'

@Controller('bulletin-board')
export class BulletinBoardController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private readonly bulletinBoardService: BulletinBoardService,
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  async createExcelTemplateV2(
    @Res() res: Response,
    @Req() req: any,
    @Query() query: any
  ) {
    const {
      startDate,
      endDateDate,
      ContractCode,
      type
    } = query
    if (
      !startDate ||
      !endDateDate ||
      !ContractCode ||
      !type
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
    const getGroup =
      await this.bulletinBoardService.getGroupByIdAccount(
        idAccount
      )
    const {
      id,
      id_name,
      name
    } = getGroup

    const {
      excelBuffer,
      typeOfContract
    } =
      await this.bulletinBoardService.createExcelTemplateNewV3(
        query,
        {id, id_name, name},
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
    res.send(excelBuffer)
  }
}
