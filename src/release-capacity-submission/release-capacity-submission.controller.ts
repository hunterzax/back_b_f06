import {Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpException, HttpStatus, Put, UseGuards, Req, HttpCode, UseInterceptors, UploadedFile, BadRequestException, Res} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {FileInterceptor} from '@nestjs/platform-express'
import {Request, Response} from 'express'

import {ReleaseCapacitySubmissionService} from './release-capacity-submission.service'
import {emailGetpermissionEmail, emailNotificationDAM, sendEmailProviderCustomDocs} from 'src/common/utils/email'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import {middleNotiInapp, middleNotiInappShipper} from 'src/common/utils/inapp.util'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Asia/Bangkok')

@Controller('release-capacity-submission')
export class ReleaseCapacitySubmissionController {
  constructor(
    private readonly releaseCapacitySubmissionService: ReleaseCapacitySubmissionService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard)
  @Get('contract-code')
  contractCode(@Req() req: any) {
    // @Req() req: any,
    return this.releaseCapacitySubmissionService.contractCode(req?.user?.sub)
  }

  @Get()
  findAll(
    // @Req() req: any,
    @Query() query: any
  ) {
    const {contract_code_id} = query

    if (!contract_code_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return this.releaseCapacitySubmissionService.getRelease(query)
    // ถ้าจะเปิด getReleaseGroupByEntryAreaAndDate ไปเปิด region หาทุก exit ในทุก entry ที่ frontend ด้วย
    // return this.releaseCapacitySubmissionService.getReleaseGroupByEntryAreaAndDate(query);
  }

  // @UseGuards(AuthGuard)
  @Get('document-file/:id')
  documentFile(
    // @Req() req: any,
    @Param('id') id: any
  ) {
    return this.releaseCapacitySubmissionService.documentFile(id)
  }

  @UseGuards(AuthGuard)
  @Post('document-file-create')
  async documentFileCreate(@Body() body: any, @Req() req: any) {
    const {contract_code_id, url} = body

    if (!contract_code_id || !url) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const documentFileCreate = await this.releaseCapacitySubmissionService.documentFileCreate(body, req?.user?.sub)

    return documentFileCreate
  }

  @UseGuards(AuthGuard)
  @Put('document-file-inactive')
  async documentFileInactive(@Body() body: any, @Req() req: any) {
    const {id} = body

    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const documentFileInactive = await this.releaseCapacitySubmissionService.documentFileInactive(body, req?.user?.sub)

    return documentFileInactive
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('submission')
  async submission(@Body() body: any, @Req() req: any) {
    const {contract_code_id, data} = body

    if (!contract_code_id || !data || data.length === 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const submission = await this.releaseCapacitySubmissionService.submissionV2(body, req?.user?.sub)

    const contractCode = await this.prisma.contract_code.findFirst({
      where: {
        id: Number(contract_code_id)
      },
      include: {
        term_type: true
      }
    })
    try {
      const header = `Submit Release Capacity`
      const emailNotificationData = await emailNotificationDAM(this.prisma, 2) // emailNotificationData?.subject subject: emailNotificationData?.subject || "", detail: emailNotificationData?.detail || "",
      const shipperEmailArr = await emailGetpermissionEmail(this.prisma, 49)
      const originalData = {
        cc: null,
        header: header,
        sendEmail: shipperEmailArr,
        subject: emailNotificationData?.subject || '',
        detail: emailNotificationData?.detail || '',
        excelBuffer: null,
        tagHTMLDetail: `
        <div>
          <ul>
            <li>Requested Code: ${submission?.requested_code || ''}</li>
            <li>Contract Code: ${contractCode?.contract_code || ''}</li>
            <li>Contract Type: ${contractCode?.term_type?.name || ''}</li>
            <li>Release Date: ${(submission?.submission_time && dayjs(submission?.submission_time).format('YYYY-MM-DD')) || ''}</li>
            ${data?.map((e: any) => {
              return `
                  <li>Point: ${e?.temp_contract_point || ''} Capacity: (${e?.total_release_mmbtu_d ? `${e?.total_release_mmbtu_d} MMBTU` : '- MMBTU'})|(${e?.total_release_mmscfd ? `${e?.total_release_mmscfd} MMSCF` : '- MMSCF'})</li>
                  `
            })}
          </ul>
        </div>
            `,
        filename: 'emergency_difficult_day_document.pdf',
        contentType: 'application/pdf'
      }
      await sendEmailProviderCustomDocs(originalData)
    } catch (error) {}

    // inapp
    try {
      const contractData = await this.prisma.contract_code.findFirst({
        where: {
          id: Number(contract_code_id)
        },
        select: {
          contract_code: true,
          group: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
      const message = `The release capacity for ${contractData?.group?.name} Shipper, Contract Code: ${contractData?.contract_code} has been submitted`
      // await middleNotiInapp(
      //       this.prisma,
      //       'Capacity Management',
      //       `${message}`,
      //       56, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management | 51 Path Management | 56 Release Capacity Submission
      //       1,
      //     );
      await middleNotiInappShipper(this.prisma, 'Capacity Management', `${message}`, 56, 1, contractData?.group?.id)
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.booking',
        `Release Capacity has been updated. Please refresh the page to see the latest changes.`,
        50, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management
        2
      )
    } catch (error) {}

    return submission
  }

  @Get('approved-release-capacity-submission-detail')
  getApprovedReleaseCapacitySubmissionDetail(
    // @Req() req: any,
    @Query() query: any
  ) {
    const {contract_code_id} = query

    if (!contract_code_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return this.releaseCapacitySubmissionService.getApprovedReleaseCapacitySubmissionDetail(contract_code_id)
  }
}
