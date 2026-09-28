import {Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpException, HttpStatus, Put, UseGuards, Req, HttpCode} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {ParameterService} from './parameter.service'
import {writeReq} from 'src/common/utils/write-req.util'
import {PrismaService} from 'prisma/prisma.service'
import {ParameterNominationDeadlineService} from './nomination-deadline'
import {ParameterPlanningDeadlineService} from './planning-deadline'
import {ParameterAnnouncementService} from './announcement'
import {ParameterSystemParameterService} from './system-parameter'
import {ParameterEmailNotificationManagementService} from './email-notification-management'
import {ParameterUserGuideService} from './user-guide'
import {ParameterAuditLogService} from './audit-log'
import {ParameterCapacityPublicationRemarkService} from './capacity-publication-remark'
import {ParameterSetupBackgroundService} from './setup-background'
import {ParameterTermAndConditionService} from './term-and-condition'
import {ParameterCheckingConditionService} from './checking-condition'
import {ParameterBookingTemplateService} from './booking-template'
import {ParameterConfigModeZoneBaseInventoryService} from './config-mode-zone-base-inventory'
import {ParameterModeZoneBaseInventoryService} from './mode-zone-base-inventory'
import {ParameterEmailGroupForEventService} from './email-group-for-event'
import {getTodayNowAdd7} from 'src/common/utils/date.util'
import {middleNotiInapp} from 'src/common/utils/inapp.util'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

@Controller('parameter')
export class ParameterController {
  constructor(
    private prisma: PrismaService,
    private readonly parameterService: ParameterService,
    private readonly parameterNominationDeadlineService: ParameterNominationDeadlineService,
    private readonly parameterPlanningDeadlineService: ParameterPlanningDeadlineService,
    private readonly parameterAnnouncementService: ParameterAnnouncementService,
    private readonly parameterSystemParameterService: ParameterSystemParameterService,
    private readonly parameterEmailNotificationManagementService: ParameterEmailNotificationManagementService,
    private readonly parameterUserGuideService: ParameterUserGuideService,
    private readonly parameterAuditLogService: ParameterAuditLogService,
    private readonly parameterCapacityPublicationRemarkService: ParameterCapacityPublicationRemarkService,
    private readonly parameterSetupBackgroundService: ParameterSetupBackgroundService,
    private readonly parameterTermAndConditionService: ParameterTermAndConditionService,
    private readonly parameterCheckingConditionService: ParameterCheckingConditionService,
    private readonly parameterBookingTemplateService: ParameterBookingTemplateService,
    private readonly parameterConfigModeZoneBaseInventoryService: ParameterConfigModeZoneBaseInventoryService,
    private readonly parameterModeZoneBaseInventoryService: ParameterModeZoneBaseInventoryService,
    private readonly parameterEmailGroupForEventService: ParameterEmailGroupForEventService
  ) {}

  @Get('term-type')
  termType() {
    return this.parameterService.termType()
  }

  // nomination-deadline

  @Get('nomination-type')
  nominationType() {
    return this.parameterNominationDeadlineService.nominationType()
  }

  @UseGuards(AuthGuard)
  @Get('process-type')
  async processtype(@Req() req: any) {
    return this.parameterNominationDeadlineService.processtype()
  }

  @Get('nomination-deadline')
  nominationDeadline() {
    return this.parameterNominationDeadlineService.nominationDeadline()
  }

  @UseGuards(AuthGuard)
  @Post('nomination-deadline-create')
  async nominationDeadlineCreate(@Body() body: any, @Req() req: any) {
    const {before_gas_day, user_type_id, nomination_type_id, process_type_id, start_date} = body

    if (
      // !before_gas_day ||
      !user_type_id ||
      !nomination_type_id ||
      !process_type_id ||
      !start_date
    ) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const nominationDeadlineCreate = await this.parameterNominationDeadlineService.nominationDeadlineCreate(body, req?.user?.sub)

    const his = await this.parameterNominationDeadlineService.nominationDeadlineOnce(nominationDeadlineCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `nomination-deadline`, 'create', his)
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Nomination Deadline ${his?.nomination_type?.name} was created for ${his?.process_type?.name} ${his?.user_type?.name} active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        31, // Nomination Deadline menus_id
        1
      )
    } catch (error) {}

    return nominationDeadlineCreate
  }

  @UseGuards(AuthGuard)
  @Put('nomination-deadline-edit/:id')
  async nominationDeadlineEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {before_gas_day, user_type_id, nomination_type_id, process_type_id, start_date} = body

    if (
      // !before_gas_day ||
      !user_type_id ||
      !nomination_type_id ||
      !process_type_id ||
      !start_date ||
      !id
    ) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const nominationDeadlineEdit = await this.parameterNominationDeadlineService.nominationDeadlineEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterNominationDeadlineService.nominationDeadlineOnce(id)
    await writeReq(this.prisma, 'DAM', req, `nomination-deadline`, 'edit', his)
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Nomination Deadline ${his?.nomination_type?.name} was edited for ${his?.process_type?.name} ${his?.user_type?.name} active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        31, // Nomination Deadline menus_id
        1
      )
    } catch (error) {}

    return nominationDeadlineEdit
  }

  // planning-deadline

  @Get('planning-deadline')
  planningDeadline() {
    return this.parameterPlanningDeadlineService.planningDeadline()
  }

  @UseGuards(AuthGuard)
  @Post('planning-deadline-create')
  async planningDeadlineCreate(@Body() body: any, @Req() req: any) {
    const {term_type_id, start_date} = body

    if (!term_type_id || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const planningDeadlineCreate = await this.parameterPlanningDeadlineService.planningDeadlineCreate(body, req?.user?.sub)
    const his = await this.parameterPlanningDeadlineService.planningDeadlineOnce(planningDeadlineCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `planning-deadline`, 'create', his)
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Planning Deadline ${his?.term_type?.name} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        32, // Planning Deadline menus_id
        1
      )
    } catch (error) {}

    return planningDeadlineCreate
  }

  @UseGuards(AuthGuard)
  @Put('planning-deadline-edit/:id')
  async planningDeadlineEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {term_type_id, start_date} = body

    if (!term_type_id || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const planningDeadlineEdit = await this.parameterPlanningDeadlineService.planningDeadlineEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterPlanningDeadlineService.planningDeadlineOnce(id)
    await writeReq(this.prisma, 'DAM', req, `planning-deadline`, 'edit', his)
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Planning Deadline ${his?.term_type?.name} was edited`,
        32, // Planning Deadline menus_id
        1
      )
    } catch (error) {}

    return planningDeadlineEdit
  }

  // announcement

  @Get('announcement')
  announcement() {
    return this.parameterAnnouncementService.announcement()
  }

  @UseGuards(AuthGuard)
  @Post('announcement-create')
  async announcementCreate(@Body() body: any, @Req() req: any) {
    const {topic, detail, start_date, end_date} = body

    if (!topic || !detail || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const announcementCreate = await this.parameterAnnouncementService.announcementCreate(body, req?.user?.sub)
    const his = await this.parameterAnnouncementService.announcementOnce(announcementCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `announcement`, 'create', his)

    return announcementCreate
  }

  @UseGuards(AuthGuard)
  @Put('announcement-edit/:id')
  async announcementEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {topic, detail, start_date, end_date} = body

    if (!topic || !detail || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const announcementEdit = await this.parameterAnnouncementService.announcementEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterAnnouncementService.announcementOnce(id)
    await writeReq(this.prisma, 'DAM', req, `announcement`, 'edit', his)

    return announcementEdit
  }

  @UseGuards(AuthGuard)
  @Delete('announcement-delete/:id')
  async announcementDelete(@Body() body: any, @Param('id') id: any, @Req() req: any) {

    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const announcementDelete = await this.parameterAnnouncementService.announcementDelete(body, (req?.user?.sub || -1), id)
    const his = await this.parameterAnnouncementService.announcementOnce(id)
    await writeReq(this.prisma, 'DAM', req, `announcement`, 'delete', his)

    return announcementDelete
  }

  @UseGuards(AuthGuard)
  @Put('announcement-status/:id')
  async announcementStatus(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const announcementStatus = await this.parameterAnnouncementService.announcementStatus(body, (req?.user?.sub || -1), id)
    const his = await this.parameterAnnouncementService.announcementOnce(id)
    await writeReq(this.prisma, 'DAM', req, `announcement`, 'status', his)

    return announcementStatus
  }

  @Get('announcement-use')
  announcementUse() {
    return this.parameterAnnouncementService.announcementUse()
  }

  // system-parameter

  @Get('sub-system-parameter')
  subSystemParameter() {
    return this.parameterSystemParameterService.subSystemParameter()
  }

  @UseGuards(AuthGuard)
  @Get('system-parameter')
  systemParameter() {
    return this.parameterSystemParameterService.systemParameter()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('system-parameter-create')
  async systemParameterCreate(@Body() body: any, @Req() req: any) {
    const {menus_id, system_parameter_id, value, start_date} = body

    if (!menus_id || !system_parameter_id || !value || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const systemParameterCreate = await this.parameterSystemParameterService.systemParameterCreate(body, req?.user?.sub)
    const his = await this.parameterSystemParameterService.systemParameterOnce(systemParameterCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `system-parameter`, 'create', his)

    // inapp
    try {
      const message = `System Parameter ${his?.menus?.name} was created for ${his?.system_parameter?.name} active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        34, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter
        1
      )
    } catch (error) {}

    return systemParameterCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('system-parameter-edit/:id')
  async systemParameterEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {menus_id, system_parameter_id, value, start_date} = body

    if (!menus_id || !system_parameter_id || !value || !start_date || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const systemParameterEdit = await this.parameterSystemParameterService.systemParameterEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterSystemParameterService.systemParameterOnce(id)
    await writeReq(this.prisma, 'DAM', req, `system-parameter`, 'edit', his)

    // inapp
    try {
      const message = `System Parameter ${his?.menus?.name} was edited for ${his?.system_parameter?.name} active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        34, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter
        1
      )
    } catch (error) {}

    return systemParameterEdit
  }

  // email-notification-management

  @Get('sub-email-notification-management')
  subEmailNotificationManagement() {
    return this.parameterEmailNotificationManagementService.subEmailNotificationManagement()
  }

  @Get('email-notification-management')
  emailNotificationManagement() {
    return this.parameterEmailNotificationManagementService.emailNotificationManagement()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('email-notification-management-create')
  async emailNotificationManagementCreate(@Body() body: any, @Req() req: any) {
    const {menus_id, activity_id, subject, detail} = body

    if (!menus_id || !activity_id || !subject || !detail) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const emailNotificationManagementCreate = await this.parameterEmailNotificationManagementService.emailNotificationManagementCreate(body, req?.user?.sub)
    const his = await this.parameterEmailNotificationManagementService.emailNotificationManagementOnce(emailNotificationManagementCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `email-notification-management`, 'create', his)

    // inapp
    try {
      const message = `Email Notification ${his?.menus?.name} was created for ${his?.activity?.name}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        35, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter | 35 Email Management
        1
      )
    } catch (error) {}

    return emailNotificationManagementCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('email-notification-management-edit/:id')
  async emailNotificationManagementEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {menus_id, activity_id, subject, detail} = body

    if (!menus_id || !activity_id || !subject || !detail || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const emailNotificationManagementEdit = await this.parameterEmailNotificationManagementService.emailNotificationManagementEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterEmailNotificationManagementService.emailNotificationManagementOnce(id)
    await writeReq(this.prisma, 'DAM', req, `email-notification-management`, 'edit', his)

    // inapp
    try {
      const message = `Email Notification ${his?.menus?.name} was edited for ${his?.activity?.name}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        35, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter | 35 Email Management
        1
      )
    } catch (error) {}

    return emailNotificationManagementEdit
  }

  @UseGuards(AuthGuard)
  @Patch('email-notification-management-active/:id')
  async emailNotificationManagementActive(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {active} = body

    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const emailNotificationManagementActive = await this.parameterEmailNotificationManagementService.emailNotificationManagementActive(body, (req?.user?.sub || -1), id)
    const his = await this.parameterEmailNotificationManagementService.emailNotificationManagementOnce(id)
    await writeReq(this.prisma, 'DAM', req, `email-notification-management`, `${active ? 'active' : 'inactive'}`, his)

    return emailNotificationManagementActive
  }

  // user-guide

  @Get('user-guide-role-all')
  userGuideRoleAll() {
    return this.parameterUserGuideService.userGuideRoleAll()
  }

  @UseGuards(AuthGuard)
  @Get('user-guide')
  userGuide(@Req() req: any) {
    return this.parameterUserGuideService.userGuide(req?.user?.sub)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('user-guide-create')
  async userGuideCreate(@Body() body: any, @Req() req: any) {
    const {document_name, file, description} = body

    if (!document_name || !file) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const userGuideCreate = await this.parameterUserGuideService.userGuideCreate(body, req?.user?.sub)
    const his = await this.parameterUserGuideService.userGuideOnce(userGuideCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `user-guide`, 'create', his)

    // inapp
    try {
      const message = `User Guide ${his?.document_name} was created`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        36, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide
        1
      )
    } catch (error) {}

    return userGuideCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('user-guide-edit/:id')
  async userGuideEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {document_name, file, description} = body

    // v2.0.98 Add/Edit เอา Required Description ออก https://app.clickup.com/t/86euzxxnm
    // if (!document_name || !file || !description || !id) {
    if (!document_name || !file || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const userGuideEdit = await this.parameterUserGuideService.userGuideEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterUserGuideService.userGuideOnce(id)
    await writeReq(this.prisma, 'DAM', req, `user-guide`, 'edit', his)

    // inapp
    try {
      const message = `User Guide ${his?.document_name} was edited`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        36, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide
        1
      )
    } catch (error) {}

    return userGuideEdit
  }

  // audit-log

  @Get('audit-log-module')
  auditLogModule() {
    return this.parameterAuditLogService.auditLogModule()
  }

  @Get('audit-log')
  auditLog(@Query() query: any) {
    const {id, date, module, name, q, limit, offset, orderAtColumn, orderBy} = query
    return this.parameterAuditLogService.auditLog(id, date, module, name, q, limit, offset, orderAtColumn, orderBy)
  }

  // capacity-publication-remark

  @Get('capacity-publication-remark')
  capacityPublicationRemark() {
    return this.parameterCapacityPublicationRemarkService.capacityPublicationRemark()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('capacity-publication-remark-create')
  async capacityPublicationRemarkCreate(@Body() body: any, @Req() req: any) {
    const {remark, start_date} = body

    if (!remark || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const capacityPublicationRemarkCreate = await this.parameterCapacityPublicationRemarkService.capacityPublicationRemarkCreate(body, req?.user?.sub)
    const his = await this.parameterCapacityPublicationRemarkService.capacityPublicationRemarkOnce(capacityPublicationRemarkCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `capacity-publication-remark`, 'create', his)

    // inapp
    try {
      const message = `Capacity Publication Remarks was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        40, // menus_id | 7 T&C | 40 Capacity Publication Remarks
        1
      )
    } catch (error) {}

    return capacityPublicationRemarkCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('capacity-publication-remark-edit/:id')
  async capacityPublicationRemarkEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {remark, start_date} = body

    if (!remark || !start_date || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const capacityPublicationRemarkEdit = await this.parameterCapacityPublicationRemarkService.capacityPublicationRemarkEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterCapacityPublicationRemarkService.capacityPublicationRemarkOnce(id)
    await writeReq(this.prisma, 'DAM', req, `capacity-publication-remark`, 'edit', his)

    // inapp
    try {
      const message = `Capacity Publication Remarks was edited active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        40, // menus_id | 7 T&C | 40 Capacity Publication Remarks
        1
      )
    } catch (error) {}

    return capacityPublicationRemarkEdit
  }

  @Get('capacity-publication-remark-use')
  capacityPublicationRemarkUse() {
    return this.parameterCapacityPublicationRemarkService.capacityPublicationRemarkUse()
  }

  // setup-background

  @Get('setup-background')
  setupBackground() {
    return this.parameterSetupBackgroundService.setupBackground()
  }

  @Get('test')
  test() {
    try {
      // inapp
      middleNotiInapp(
        this.prisma,
        'waitinglist.booking',
        `Capacity Request Management's has been updated. Please refresh the page to see the latest changes.`,
        50, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management
        2
      )
    } catch (error) {}
  }

  @UseGuards(AuthGuard)
  @Post('setup-background-create')
  async setupBackgroundCreate(@Body() body: any, @Req() req: any) {
    const {url} = body

    if (!url) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const setupBackgroundCreate = await this.parameterSetupBackgroundService.setupBackgroundCreate(body, req?.user?.sub)
    const his = await this.parameterSetupBackgroundService.setupBackgroundOnce(setupBackgroundCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `setup-background`, 'create', his)

    return setupBackgroundCreate
  }

  @UseGuards(AuthGuard)
  @Put('setup-background-edit/:id')
  async setupBackgroundEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {url} = body

    if (!url || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const setupBackgroundEdit = await this.parameterSetupBackgroundService.setupBackgroundEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterSetupBackgroundService.setupBackgroundOnce(setupBackgroundEdit?.id)
    await writeReq(this.prisma, 'DAM', req, `setup-background`, 'edit', his)

    return setupBackgroundEdit
  }

  @UseGuards(AuthGuard)
  @Delete('setup-background-delete/:id')
  async setupBackgroundDelete(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const setupBackgroundDelete = await this.parameterSetupBackgroundService.setupBackgroundDelete(body, (req?.user?.sub || -1), id)
    const his = await this.parameterSetupBackgroundService.setupBackgroundOnce(setupBackgroundDelete?.id)
    await writeReq(this.prisma, 'DAM', req, `setup-background`, 'delete', his)

    return setupBackgroundDelete
  }

  @UseGuards(AuthGuard)
  @Patch('setup-background-active/:id')
  async setupBackgroundActive(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {active} = body

    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const setupBackgroundActive = await this.parameterSetupBackgroundService.setupBackgroundActive(body, (req?.user?.sub || -1), id)
    const his = await this.parameterSetupBackgroundService.setupBackgroundOnce(setupBackgroundActive?.id)
    await writeReq(this.prisma, 'DAM', req, `setup-background`, `${active ? 'active' : 'inactive'}`, his)

    return setupBackgroundActive
  }

  // term-and-condition

  @Get('term-and-condition')
  termAndCondition() {
    return this.parameterTermAndConditionService.termAndCondition()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('term-and-condition-create')
  async termAndConditionCreate(@Body() body: any, @Req() req: any) {
    const {topic, url, start_date} = body

    if (!topic || !url || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const termAndConditionCreate = await this.parameterTermAndConditionService.termAndConditionCreate(body, req?.user?.sub)
    const his = await this.parameterTermAndConditionService.termAndConditionOnce(termAndConditionCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `term-and-condition`, 'create', his)

    // inapp
    try {
      const message = `Terms & Condition was created active from ${start_date} to ${body && body?.end_date || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        7, // menus_id | 7 T&C
        1
      )
    } catch (error) {}

    return termAndConditionCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('term-and-condition-edit/:id')
  async termAndConditionEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {topic, url, start_date} = body

    if (!topic || !url || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const termAndConditionEdit = await this.parameterTermAndConditionService.termAndConditionEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterTermAndConditionService.termAndConditionOnce(id)
    await writeReq(this.prisma, 'DAM', req, `term-and-condition`, 'edit', his)

    // inapp
    try {
      const message = `Terms & Condition was edited active from ${start_date} to ${body && body?.end_date || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        7, // menus_id | 7 T&C
        1
      )
    } catch (error) {}

    return termAndConditionEdit
  }

  // checking-condition

  @Get('checking-condition')
  checkingCondition() {
    return this.parameterCheckingConditionService.checkingCondition()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('checking-condition-create')
  async checkingConditionCreate(@Body() body: any, @Req() req: any) {
    const {start_date} = body

    if (!start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const checkingConditionCreate = await this.parameterCheckingConditionService.checkingConditionCreate(body, req?.user?.sub)
    const his = await this.parameterCheckingConditionService.checkingConditionOnce(checkingConditionCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `checking-condition`, 'create', his)

    // inapp
    try {
      const message = `Metering Checking Condition ${his?.version} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        79, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition
        1
      )
    } catch (error) {}

    return checkingConditionCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('checking-condition-edit/:id')
  async checkingConditionEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {start_date} = body

    if (!start_date || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const checkingConditionEdit = await this.parameterCheckingConditionService.checkingConditionEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterCheckingConditionService.checkingConditionOnce(id)
    await writeReq(this.prisma, 'DAM', req, `checking-condition`, 'edit', his)

    // inapp
    try {
      const message = `Metering Checking Condition ${his?.version} was edited active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        79, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition
        1
      )
    } catch (error) {}

    return checkingConditionEdit
  }

  // booking-template

  @Get('booking-template')
  bookingTemplate() {
    return this.parameterBookingTemplateService.bookingTemplate()
  }

  @UseGuards(AuthGuard)
  @Post('booking-template-create')
  async bookingTemplateCreate(@Body() body: any, @Req() req: any) {
    const {term_type_id, start_date} = body

    if (!term_type_id || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const bookingTemplateCreate = await this.parameterBookingTemplateService.bookingTemplateCreate(body, req?.user?.sub)
    const his = await this.parameterBookingTemplateService.bookingTemplateOnce(bookingTemplateCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `booking-template`, 'create', his)
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Capacity Right Template ${his?.term_type?.name} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        42, // capacity right template menus_id
        1
      )
    } catch (error) {}

    return bookingTemplateCreate
  }

  @UseGuards(AuthGuard)
  @Put('booking-template-edit/:id')
  async bookingTemplateEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {term_type_id, start_date} = body

    if (!term_type_id || !start_date || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const bookingTemplateEdit = await this.parameterBookingTemplateService.bookingTemplateEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterBookingTemplateService.bookingTemplateOnce(id)
    await writeReq(this.prisma, 'DAM', req, `booking-template`, 'edit', his)
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Capacity Right Template ${his?.term_type?.name} was edited`,
        42, // capacity right template menus_id
        1
      )
    } catch (error) {}

    return bookingTemplateEdit
  }

  // config-mode-zone-base-inventory

  @Get('config-mode-zone-base-inventory')
  configModeZoneBaseInventory() {
    return this.parameterConfigModeZoneBaseInventoryService.configModeZoneBaseInventory()
  }

  @UseGuards(AuthGuard)
  @Post('config-mode-zone-base-inventory-create')
  async configModeZoneBaseInventoryCreate(@Body() body: any, @Req() req: any) {
    const {zone_id, start_date} = body

    if (!zone_id || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const configModeZoneBaseInventoryCreate = await this.parameterConfigModeZoneBaseInventoryService.configModeZoneBaseInventoryCreate(body, req?.user?.sub)
    const his = await this.parameterConfigModeZoneBaseInventoryService.configModeZoneBaseInventoryOnce(configModeZoneBaseInventoryCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `config-mode-zone-base-inventory`, 'create', his)

    return configModeZoneBaseInventoryCreate
  }

  @UseGuards(AuthGuard)
  @Put('config-mode-zone-base-inventory-edit/:id')
  async configModeZoneBaseInventoryEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {zone_id, start_date} = body

    if (!zone_id || !start_date || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const configModeZoneBaseInventoryEdit = await this.parameterConfigModeZoneBaseInventoryService.configModeZoneBaseInventoryEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterConfigModeZoneBaseInventoryService.configModeZoneBaseInventoryOnce(id)
    await writeReq(this.prisma, 'DAM', req, `config-mode-zone-base-inventory`, 'edit', his)

    return configModeZoneBaseInventoryEdit
  }

  // mode-zone-base-inventory

  @Get('mode-zone-use')
  modeZoneUse() {
    return this.parameterModeZoneBaseInventoryService.modeZoneUse()
  }

  @Get('mode-zone-base-inventory')
  changeModeZoneBaseInventory() {
    return this.parameterModeZoneBaseInventoryService.changeModeZoneBaseInventory()
  }

  @UseGuards(AuthGuard)
  @Post('mode-zone-base-inventory-create')
  async changeModeZoneBaseInventoryCreate(@Body() body: any, @Req() req: any) {
    const {zone_id, mode_id, start_date} = body

    if (!zone_id || !mode_id || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const changeModeZoneBaseInventoryCreate = await this.parameterModeZoneBaseInventoryService.changeModeZoneBaseInventoryCreate(body, req?.user?.sub)
    const his = await this.parameterModeZoneBaseInventoryService.changeModeZoneBaseInventoryOnce(changeModeZoneBaseInventoryCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `mode-zone-base-inventory-create`, 'create', his)

    try {
      // const contractCode = await this.prisma.contract_code.findFirst({ where: { id: Number(uploadFile?.dataInfo?.contract_code_id) } })
      // const shipper = await this.prisma.group.findFirst({ where: { id: Number(uploadFile?.dataInfo?.shipper_id) } })
      const message = `Mode/Zone Base Inventory for ${changeModeZoneBaseInventoryCreate?.zone?.name} Zone was changed to ${changeModeZoneBaseInventoryCreate?.mode?.mode} Mode. Active on ${dayjs(changeModeZoneBaseInventoryCreate?.start_date).format('DD/MM/YYYY')} and time ${dayjs(changeModeZoneBaseInventoryCreate?.start_date).format('HH:mm')}`
      await middleNotiInapp(
        this.prisma,
        'Balancing',
        message,
        87, // Balancing menus_id
        1
      )
    } catch (error) {}

    return changeModeZoneBaseInventoryCreate
  }

  @UseGuards(AuthGuard)
  @Post('mode-zone-base-inventory-create-text')
  async changeModeZoneBaseInventoryCreateText(@Body() body: any, @Req() req: any) {
    const {zone_text, mode_text, start_date} = body

    if (!zone_text || !mode_text || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const changeModeZoneBaseInventoryCreateText = await this.parameterModeZoneBaseInventoryService.changeModeZoneBaseInventoryCreateText(body, req?.user?.sub)
    // const his =
    //   await this.parameterModeZoneBaseInventoryService.changeModeZoneBaseInventoryOnce(
    //     changeModeZoneBaseInventoryCreateText?.id
    //   )
    // await writeReq(
    //   this.prisma,
    //   'DAM',
    //   req,
    //   `mode-zone-base-inventory-create`,
    //   'create',
    //   his
    // )

    // try {
    //   const message = `Mode/Zone Base Inventory for ${changeModeZoneBaseInventoryCreateText?.zone?.name} Zone was changed to ${changeModeZoneBaseInventoryCreateText?.mode?.mode} Mode. Active on ${dayjs(changeModeZoneBaseInventoryCreateText?.start_date).format('DD/MM/YYYY')} and time ${dayjs(changeModeZoneBaseInventoryCreateText?.start_date).format('HH:mm')}`
    //   await middleNotiInapp(
    //     this.prisma,
    //     'Balancing',
    //     message,
    //     87, // Balancing menus_id
    //     1
    //   )
    // } catch (error) {}

    return changeModeZoneBaseInventoryCreateText
  }

  // email-group-for-event

  @Get('email-group-for-event')
  emailGroupForEvent() {
    return this.parameterEmailGroupForEventService.emailGroupForEvent()
  }

  @UseGuards(AuthGuard)
  @Post('email-group-for-event-create')
  async emailGroupForEventCreate(@Body() body: any, @Req() req: any) {
    const {name, email} = body

    if (!name || !email) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const emailGroupForEventCreate = await this.parameterEmailGroupForEventService.emailGroupForEventCreate(body, req?.user?.sub)
    const his = await this.parameterEmailGroupForEventService.emailGroupForEventOnce(emailGroupForEventCreate?.id)
    await writeReq(this.prisma, 'DAM', req, `email-group-for-event`, 'create', his)
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Email Group For Event ${his?.name} was created`,
        1006, // Email Group For Event menus_id
        1
      )
    } catch (error) {}

    return emailGroupForEventCreate
  }

  @UseGuards(AuthGuard)
  @Put('email-group-for-event-edit/:id')
  async emailGroupForEventEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {name, email} = body

    if (!name || !email) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const emailGroupForEventEdit = await this.parameterEmailGroupForEventService.emailGroupForEventEdit(body, (req?.user?.sub || -1), id)
    const his = await this.parameterEmailGroupForEventService.emailGroupForEventOnce(id)
    await writeReq(this.prisma, 'DAM', req, `email-group-for-event`, 'edit', his)
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Email Group For Event ${his?.name} was edited`,
        1006, // Email Group For Event menus_id
        1
      )
    } catch (error) {}

    return emailGroupForEventEdit
  }
}
