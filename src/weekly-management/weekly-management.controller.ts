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
import {FileUploadService} from 'src/grpc/file-service.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {FileInterceptor} from '@nestjs/platform-express'
import {Response} from 'express'
import {WeeklyManagementService} from './weekly-management.service'
import {QueryShipperNominationFileService} from 'src/query-shipper-nomination-file/query-shipper-nomination-file.service'
import {
  middleNotiInapp,
  middleNotiInappShipper,
  middleNotiInappTSOonly
} from 'src/common/utils/inapp.util'
import {PrismaService} from 'prisma/prisma.service'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {
  emailGetpermissionEmail,
  emailNotificationDAM,
  sendEmailProviderCustomDocs
} from 'src/common/utils/email'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

@Controller(
  'weekly-management'
)
export class WeeklyManagementController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService,
    private readonly weeklyManagementService: WeeklyManagementService,
    private readonly queryShipperNominationFileService: QueryShipperNominationFileService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard)
  @Post('comment')
  async comments(
    @Req() req: any,
    @Body() body: any
  ) {
    const {
      comment,
      query_shipper_nomination_file_id
    } = body

    if (
      !comment ||
      !query_shipper_nomination_file_id
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

    const comments =
      await this.queryShipperNominationFileService.comments(
        body,
        req?.user?.sub
      )

    try {
      const nom =
        await this.prisma.query_shipper_nomination_file?.findFirst(
          {
            where: {
              id: Number(
                query_shipper_nomination_file_id
              )
            },
            select: {
              id: true,
              group_id: true,
              gas_day: true,
              contract_code: {
                select: {
                  contract_code: true
                }
              },
              group: {
                select: {
                  name: true
                }
              }
            }
          }
        )
      const message = `Daily Nomination was commentted for ${nom?.group?.name}:${nom?.contract_code?.contract_code} activate from ${dayjs(nom?.gas_day).format('DD/MM/YYYY')}`
      await middleNotiInappShipper(
        this.prisma,
        'Nomination',
        message,
        // 61, // nomination menus_id
        66, // 66 Weekly Management
        1,
        Number(nom?.group_id)
      )
    } catch (error) {}

    return comments
  }

  @UseGuards(AuthGuard)
  @Post('edit-row/:id')
  async editRowJSON(
    @Req() req: any,
    @Body() body: any,
    @Param('id') id: any
  ) {
    const {rowChange} = body

    if (
      !id ||
      !rowChange ||
      rowChange.length <= 0
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

    const editRowJSON =
      await this.queryShipperNominationFileService.editRowJSON(
        id,
        body,
        req?.user?.sub
      )

    try {
      const nom =
        await this.prisma.query_shipper_nomination_file?.findFirst(
          {
            where: {
              nomination_version:
                {
                  some: {
                    id: Number(
                      id
                    )
                  }
                }
            },
            select: {
              id: true,
              group_id: true,
              gas_day: true,
              contract_code: {
                select: {
                  contract_code: true
                }
              },
              group: {
                select: {
                  name: true
                }
              }
            }
          })
            const message = `Weekly Nomination was editted for ${nom?.group?.name}:${nom?.contract_code?.contract_code} activate from ${dayjs(nom?.gas_day).format("DD/MM/YYYY")}`
            // await middleNotiInappShipper(
            await middleNotiInappTSOonly(
              this.prisma,
              'Nomination',
              message,
              // 61, // nomination menus_id
              66, // 66 Weekly Management
              1,
              // Number(nom?.group_id)
            );
          } catch (error) {
          }

          // tell frontend to refresh waitinglist
          try {
            middleNotiInapp(
              this.prisma,
              'waitinglist.nomination',
              `Nomination file has been updated. Please refresh the page to see the latest changes.`,
              66, // 66 Weekly Management
              2
            )
          } catch (error) {
          }

    return editRowJSON
  }

  @UseGuards(AuthGuard)
  @Post('version-validate')
  versionValidate(
    @Req() req: any,
    @Body() body: any
  ) {
    const {
      nomination_type_id,
      contract_code_id,
      nomination_version_id
    } = body

    if (
      !nomination_type_id ||
      !contract_code_id ||
      !nomination_version_id
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

    return this.queryShipperNominationFileService.versionValidate(
      body,
      req?.user?.sub
    )
  }

  @UseGuards(AuthGuard)
  @Post('update-status')
  async updateStatus(
    @Req() req: any,
    @Body() body: any
  ) {
    const {id, status} = body

    if (
      !id ||
      id.length <= 0 ||
      !status
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

    const updateStatus =
      this.queryShipperNominationFileService.updateStatus(
        body,
        req?.user?.sub
      )

    const nom =
      await this.prisma.query_shipper_nomination_file?.findMany(
        {
          where: {
            id: {
              in: id
            }
          },
          select: {
            id: true,
            group_id: true,
            gas_day: true,
            contract_code: {
              select: {
                contract_code: true,
                term_type: {
                  select: {
                    name: true
                  }
                }
              }
            },
            group: {
              select: {
                name: true
              }
            }
          }
        }
      )
    // inapp
    try {
          for (let i = 0; i < id.length; i++) {
            const fnom = nom?.find((f:any) => f?.id === id[i])
            const message = `Weekly Nomination was ${status === 2 ? "approved" : "rejected"} for ${fnom?.group?.name}:${fnom?.contract_code?.contract_code} activate from ${dayjs(fnom?.gas_day).format("DD/MM/YYYY")} by operator`
            await middleNotiInappShipper(
              this.prisma,
              'Nomination',
              message,
              // 61, // 61 Nomination
              66, // 66 Weekly Management
              1,
              Number(fnom?.group_id)
            );
          }
          } catch (error) {}

    // email
    try {
      for (
        let i = 0;
        i < id.length;
        i++
      ) {
        const fnom =
          nom?.find(
            (f: any) =>
              f?.id === id[i]
          )

        const header =
          status === 2
            ? `TSO accepts the shipper`
            : `TSO rejects the shipper`
        const emailNotificationData =
          await emailNotificationDAM(
            this.prisma,
            status === 2
              ? 10
              : 12
          ) // emailNotificationData?.subject subject: emailNotificationData?.subject || "", detail: emailNotificationData?.detail || "",
        const shipperEmailArr =
          await emailGetpermissionEmail(
            this.prisma,
            61
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
                      <li>Contract Code: ${fnom?.contract_code?.contract_code || ''}</li>
                      <li>Contract Type: ${fnom?.contract_code?.term_type?.name || ''}</li>
                      <li>Gas Day: ${fnom?.gas_day && dayjs(fnom?.gas_day).format("DD/MM/YYYY") || ''}</li>
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
      }
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.nomination',
        `Nomination file has been updated. Please refresh the page to see the latest changes.`,
        66, // 66 Weekly Management
        2
      )
    } catch (error) {
    }

    return updateStatus
  }

  @UseGuards(AuthGuard)
  @Post('export-file-nom')
  exportFileNom(
    @Res() res: Response,
    @Body() Body: any,
    @Req() req: any
  ) {
    return this.queryShipperNominationFileService.exportFileNom(
      res,
      Body,
      req?.user?.sub
    )
  }
}
