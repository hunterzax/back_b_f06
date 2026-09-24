import {Module} from '@nestjs/common'
import {ParameterService} from './parameter.service'
import {ParameterController} from './parameter.controller'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
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

@Module({
  imports: [GrpcModule],
  controllers: [
    ParameterController
  ],
  providers: [
    ParameterService,
    AccountManageService,
    ParameterNominationDeadlineService,
    ParameterPlanningDeadlineService,
    ParameterAnnouncementService,
    ParameterSystemParameterService,
    ParameterEmailNotificationManagementService,
    ParameterUserGuideService,
    ParameterAuditLogService,
    ParameterCapacityPublicationRemarkService,
    ParameterSetupBackgroundService,
    ParameterTermAndConditionService,
    ParameterCheckingConditionService,
    ParameterBookingTemplateService,
    ParameterConfigModeZoneBaseInventoryService,
    ParameterModeZoneBaseInventoryService,
    ParameterEmailGroupForEventService
  ],
  exports: [ParameterService]
})
export class ParameterModule {}
