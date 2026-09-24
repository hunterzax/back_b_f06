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
import {FileInterceptor} from '@nestjs/platform-express'
import {
  Request,
  Response
} from 'express'

import {ReleaseCapacityManagementService} from './release-capacity-management.service'
import {ReleaseCapacitySubmissionService} from 'src/release-capacity-submission/release-capacity-submission.service'
import {
  emailGetpermissionEmail,
  emailNotificationDAM,
  sendEmailProviderCustomDocs
} from 'src/common/utils/email'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import {PrismaService} from 'prisma/prisma.service'
import {
  middleNotiInapp,
  middleNotiInappShipper
} from 'src/common/utils/inapp.util'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Controller(
  'release-capacity-management'
)
export class ReleaseCapacityManagementController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private readonly releaseCapacityManagementService: ReleaseCapacityManagementService,
    private readonly releaseCapacitySubmissionService: ReleaseCapacitySubmissionService,
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(@Req() req: any) {
    return this.releaseCapacityManagementService.findAll(
      req?.user?.sub
    )
  }

  @Get('status')
  status() {
    return this.releaseCapacityManagementService.status()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Patch('status/:id')
  async changeStatus(
    @Body() body: any,
    @Req() req: any,
    @Param('id') id: any
  ) {
    const {status} = body
    if (!status) {
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

    const releaseCapacitySubmissionService =
      await this.releaseCapacitySubmissionService.changeStatus(
        body,
        id,
        req?.user?.sub
      )

    const submission =
      await this.prisma.release_capacity_submission?.findFirst(
        {
          where: {
            id: Number(id)
          },
          include: {
            contract_code: {
              include: {
                term_type: true,
                group: true
              }
            },
            release_capacity_submission_detail: true
          }
        }
      )
    try {
      const header =
        Number(status) === 2
          ? `Accepted Release Capacity Requested`
          : `Rejected Release Capacity Requested`
      const emailNotificationData =
        await emailNotificationDAM(
          this.prisma,
          Number(status) === 2
            ? 3
            : 4
        ) // emailNotificationData?.subject subject: emailNotificationData?.subject || "", detail: emailNotificationData?.detail || "",
      const shipperEmailArr =
        await emailGetpermissionEmail(
          this.prisma,
          49
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
            <li>Requested Code: ${submission?.requested_code || ''}</li>
            <li>Contract Code: ${submission?.contract_code?.contract_code || ''}</li>
            <li>Contract Type: ${submission?.contract_code?.term_type?.name || ''}</li>
            <li>Release Date: ${(submission?.submission_time && dayjs(submission?.submission_time).format('YYYY-MM-DD')) || ''}</li>
            ${submission?.release_capacity_submission_detail?.map(
              (e: any) => {
                return `
                  <li>Point: ${e?.temp_contract_point || ''} Capacity: (${e?.total_release_mmbtu_d ? `${e?.total_release_mmbtu_d} MMBTU` : '- MMBTU'})|(${e?.total_release_mmscfd ? `${e?.total_release_mmscfd} MMSCF` : '- MMSCF'})</li>
                  `
              }
            )}
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

    // inapp
    try {
      const message = `TSO ${status === 2 ? 'approved' : 'rejected'} the released capacity for ${submission?.contract_code?.group?.name} Shipper, Contract Code: ${submission?.contract_code?.contract_code} (Requested Code: ${submission?.requested_code})`
      // await middleNotiInapp(
      //       this.prisma,
      //       'Capacity Management',
      //       `${message}`,
      //       60, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management | 51 Path Management | 56 Release Capacity Submission | 57 Use it or Lose it | 58 Release/UIOLI Summary Report | 60 Release Capacity Management
      //       1,
      //     );
      await middleNotiInappShipper(
        this.prisma,
        'Capacity Management',
        `${message}`,
        60,
        1,
        submission
          ?.contract_code
          ?.group?.id
      )
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
    } catch (error) {
      
    }

    return releaseCapacitySubmissionService
  }
}
