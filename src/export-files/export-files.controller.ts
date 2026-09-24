import {ExportFilesService} from './export-files.service'
import {ExportFileTariffService} from './export-file-tariff.service'
import {ExportFileTariffCommodityService} from './export-file-tariff-commodity.service'
import {ExportFileTariffCommodityA2Service} from './export-file-tariff-commodity-a2.service'
import {ExportFileTariffCommodityBService} from './export-file-tariff-commodity-b.service'
import {Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpException, HttpStatus, Put, UseGuards, Req, HttpCode, Res} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {Response} from 'express' // นำเข้าจาก express
import {
  ExportImbalanceCapacityReportDto,
  ExportRealImbalanceCapacityReportDto,
  GenerateSampleReportDto,
  ExportGasAllocationReportDto,
  GenerateGasAllocationSampleDto,
  ExportGasAllocationMultiSheetReportDto,
  GenerateGasAllocationMultiSheetSampleDto,
  ExportGasAllocationMultiSheetRealDataDto,
  ExportGasDeliveryReportDto,
  GenerateGasDeliverySampleDto,
  ExportCommodityChargeReportDto,
  GenerateCommodityChargeSampleDto
} from './dto/export-file-tariff.dto'
import {TariffService} from 'src/tariff/tariff.service'

@Controller('export-files')
export class ExportFilesController {
  [x: string]: any
  constructor(
    private readonly exportFilesService: ExportFilesService,
    private readonly exportFileTariffService: ExportFileTariffService,
    private readonly exportFileTariffCommodityService: ExportFileTariffCommodityService,
    private readonly exportFileTariffCommodityA2Service: ExportFileTariffCommodityA2Service,
    private readonly exportFileTariffCommodityBService: ExportFileTariffCommodityBService,
    private readonly accountManageService: AccountManageService,
    private readonly tariffService: TariffService,
    private jwtService: JwtService
  ) {}

  ////## DAM
  //## Administration > Group
  @Post('dam/tso-group')
  epDamTsoGroup(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamTsoGroup(res, Body)
  }
  @Post('dam/shipers-group')
  epDamShippersGroup(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamShippersGroup(res, Body)
  }
  @Post('dam/other-group')
  epDamOtherGroup(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamOtherGroup(res, Body)
  }
  // User
  @Post('dam/users')
  epDamUsers(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamUsers(res, Body)
  }
  // Roles
  @Post('dam/roles')
  epDamRoles(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamRoles(res, Body)
  }
  // Login Management Tool
  @Post('dam/login-management-tool')
  epDamLoginManagementTool(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamLoginManagementTool(res, Body)
  }
  // Division
  @Post('dam/division')
  epDamDivision(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamDivision(res, Body)
  }
  // Division
  @Post('dam/audit-log')
  epDamAuditLog(@Res() res: Response, @Body() Body: any, @Query() query: any) {
    return this.exportFilesService.epDamAuditLog(res, Body, query)
  }
  //## */ Parameters > Master Data
  @Post('dam/zone')
  epDamZone(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamZone(res, Body)
  }
  @Post('dam/area')
  epDamArea(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamArea(res, Body)
  }
  @Post('dam/customer-type')
  epDamCustomer(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamCustomer(res, Body)
  }
  @Post('dam/contract-point')
  epDamContractPoint(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamContractPoint(res, Body)
  }
  @Post('dam/nomination-point')
  epDamNominationPoint(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamNominationPoint(res, Body)
  }
  @Post('dam/metered-point')
  epDamMeteredPoint(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamMeteredPoint(res, Body)
  }
  @Post('dam/concept-point')
  epDamConceptPoint(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamConceptPoint(res, Body)
  }
  @Post('dam/non-tpa-point')
  epDamNonTpaPoint(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamNonTpaPoint(res, Body)
  }
  @Post('dam/config-master-path')
  epDamConfigMasterPath(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamConfigMasterPath(res, Body)
  }
  @Post('dam/mode-base-zone-inventory')
  epDamModeBaseZoneInventory(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamModeBaseZoneInventory(res, Body)
  }
  //## */ Parameters > System Parameter
  @Post('dam/capacity-right-template')
  epDamCapacityRightTemplate(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamCapacityRightTemplate(res, Body)
  }
  @Post('dam/planning-deadline')
  epDamPlanningDeadline(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamPlanningDeadline(res, Body)
  }
  @Post('dam/nomination-deadline')
  epDamNominationDeadline(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamNominationDeadline(res, Body)
  }
  @Post('dam/email-notification-management')
  epDamEmailNotificationManagement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamEmailNotificationManagement(res, Body)
  }
  @Post('dam/email-group-for-event')
  epDamEmailGroupForEvent(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamEmailGroupForEvent(res, Body)
  }
  @Post('dam/system-parameter')
  epDamSystemParameter(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamSystemParameter(res, Body)
  }
  // @Post('dam/hv-for-operation-flow-and-instructed-flow')
  // epDamhvForOperationFlowAndInstructedFlow(@Res() res: Response, @Body() Body: any) {
  //   return this.exportFilesService.epDamhvForOperationFlowAndInstructedFlow(res, Body);
  // }
  @Post('dam/config-mode-zone-base-inventory')
  epDamConfigModeZoneBaseInventory(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamConfigModeZoneBaseInventory(res, Body)
  }
  //## */ Parameters > UX/UI
  @Post('dam/user-guide')
  epDamUserGuide(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamUserGuide(res, Body)
  }
  @Post('dam/metering-checking-condition')
  epDamMeteringCheckingCondition(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamMeteringCheckingCondition(res, Body)
  }
  @Post('dam/capacity-publication-remarks')
  epDamCapacityPublicationRemarks(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamCapacityPublicationRemarks(res, Body)
  }
  @Post('dam/announcement')
  epDamAnnouncement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamAnnouncement(res, Body)
  }
  @Post('dam/terms-and-conditions')
  epDamTermsAndConditions(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamTermsAndConditions(res, Body)
  }
  @Post('dam/allocation-mode')
  epDamAllocationMode(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamAllocationMode(res, Body)
  }
  @Post('dam/hv-for-peration-flow-and-instructed-flow')
  epDamhvForPerationFlowAndInstructedFlow(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epDamhvForPerationFlowAndInstructedFlow(res, Body)
  }

  ////## Capacity
  //## Capacity > Capacity
  @Post('capacity/capacity-publication-year')
  epCapacityPublicationYear(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityPublicationYear(res, Body)
  }
  @Post('capacity/capacity-publication-month')
  epCapacityPublicationMonth(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityPublicationMonth(res, Body)
  }
  @Post('capacity/capacity-publication-day')
  epCapacityPublicationDay(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityPublicationDay(res, Body)
  }
  @Post('capacity/capacity-publication-detail')
  epCapacityPublicationDetail(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityPublicationDetail(res, Body)
  }
  @Post('capacity/capacity-contract-management')
  epCapacityCapacityContractManagement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityCapacityContractManagement(res, Body)
  }
  @Post('capacity/capacity-contract-list')
  epCapacityCapacityContractList(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityCapacityContractList(res, Body)
  }
  //## Capacity > Release
  @Post('capacity/release-capacity-submission')
  epCapacityReleaseCapacitySubmission(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityReleaseCapacitySubmission(res, Body)
  }
  @Post('capacity/release-capacity-management')
  epCapacityReleaseCapacityManagement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityReleaseCapacityManagement(res, Body)
  }
  @Post('capacity/release-capacity-management/detail')
  epCapacityReleaseCapacityManagementDetail(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityReleaseCapacityManagementDetail(res, Body)
  }
  @Post('capacity/release-uioli-summary')
  epCapacityReleaseUIOLISummary(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityReleaseUIOLISummary(res, Body)
  }
  @Post('capacity/use-it-or-lose-it')
  epCapacityUseItOrLoseIt(@Res() res: Response, @Body() Body: any) {
    // return this.exportFilesService.epCapacityUseItOrLoseIt(res, Body);
    return this.exportFilesService.epCapacityUseItOrLoseIt2(res, Body)
  }

  @Post('capacity/reserve-balancing-gas-contracts')
  epCapacityReserveBalancingGasContracts(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityReserveBalancingGasContracts(res, Body)
  }
  @Post('capacity/path-management')
  epCapacityPathManagement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityPathManagement(res, Body)
  }
  @Post('capacity/view-path-management')
  epCapacityViewPathManagement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epCapacityViewPathManagement(res, Body)
  }

  ////## Planning
  @Post('planning/planning-file-submission-template')
  epPlanningPlanningFileSubmissionTemplate(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epPlanningPlanningFileSubmissionTemplate(res, Body)
  }
  @Post('planning/query-shippers-planning-files')
  epPlanningQueryShippersPlanningFiles(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epPlanningQueryShippersPlanningFiles(res, Body)
  }
  @Post('planning/new-point')
  epPlanningNewPoint(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epPlanningNewPoint(res, Body)
  }

  ////## Nomination
  @Post('nomination/upload-template-for-shipper')
  epNominationUploadTemplateForShipper(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationUploadTemplateForShipper(res, Body)
  }
  @Post('nomination/query-shipper-nomination-file')
  epNominationQueryShipperNominationFile(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationQueryShipperNominationFile(res, Body)
  }
  @Post('nomination/daily-management')
  epNominationDailyManagement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationDailyManagement(res, Body)
  }
  @Post('nomination/weekly-management')
  epNominationWeeklyManagement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationWeeklyManagement(res, Body)
  }
  @Post('nomination/daily-adjustment')
  epNominationDailyAdjustment(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationDailyAdjustment(res, Body)
  }
  @Post('nomination/quality-evaluation')
  epNominationQualityEvaluation(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationQualityEvaluation(res, Body)
  }
  @Post('nomination/quality-planning')
  epNominationQualityPlanning(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationQualityPlanning(res, Body)
  }
  @Post('nomination/summary-nomination-report')
  epNominationSummaryNominationReport(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationSummaryNominationReport(res, Body)
  }
  @UseGuards(AuthGuard)
  @Post('nomination/nomination-dashboard')
  epNominationNominationDashboard(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epNominationNominationDashboard(res, Body, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('nomination/parking-allocation')
  epNominationParkingAllocation(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epNominationParkingAllocation(res, Body, req?.user?.sub)
  }
  @Post('nomination/shipper-nomination-report')
  epNominationShipperNominationReport(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epNominationShipperNominationReport(res, Body)
  }

  @UseGuards(AuthGuard)
  @Post('nomination/daily-adjustment-summary')
  epNominationDailyAdjustmentSummary(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epNominationDailyAdjustmentSummary(res, Body, req?.user?.sub)
  }

  ////## Metering
  @Post('metering/metering-management')
  epMeretingMeteringManagement(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epMeretingMeteringManagement(res, Body)
  }
  @Post('metering/metering-retrieving/retrieving')
  epMeretingMeteringRetrievingRetrieving(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epMeretingMeteringRetrievingRetrieving(res, Body)
  }
  @Post('metering/metering-retrieving/metering-data-check')
  epMeretingMeteringRetrievingMeteringDataCheck(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epMeretingMeteringRetrievingMeteringDataCheck(res, Body)
  }
  @Post('metering/metering-data-check')
  epMeretingMeteringMeteringChecking(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epMeretingMeteringMeteringChecking(res, Body)
  }

  ////## Allocation
  @UseGuards(AuthGuard)
  @Post('allocation/allocation-review')
  epAllocationAllocationReview(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epAllocationAllocationReview(res, Body, req?.user?.sub)
  }
  @UseGuards(AuthGuard)
  @Post('allocation/allocation-management')
  epAllocationAllocationManagement(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epAllocationAllocationManagement(res, Body, req?.user?.sub)
  }
  @UseGuards(AuthGuard)
  @Post('allocation/allocation-query')
  epAllocationAllocationQuery(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epAllocationAllocationQuery(res, Body, req?.user?.sub)
  }
  @UseGuards(AuthGuard)
  @Post('allocation/allocation-report')
  epAllocationAllocationReport(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epAllocationAllocationReport(res, Body, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('allocation/allocation-monthly-report')
  epAllocationAllocationMonthlyReport(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epAllocationAllocationMonthlyReport(res, Body, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('allocation/allocation-monthly-report-download')
  epAllocationAllocationMonthlyReportDownload(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.epAllocationAllocationMonthlyReportDownload(res, Body, req?.user?.sub)
  }
  @Post('allocation/curtailments-allocation')
  epAllocationCurtailmentsAllocation(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epAllocationCurtailmentsAllocation(res, Body)
  }
  // curtailmentsAllocation

  ////## Balancing
  @Post('balancing/intraday-acc-imbalance-inventory-adjust')
  epBalancingIntradatAccImbalanceInventoryAdjust(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epBalancingIntradatAccImbalanceInventoryAdjust(res, Body)
  }
  @Post('balancing/adjustment-daily-imbalance')
  epBalancingAdjustmentDailyImbalance(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epBalancingAdjustmentDailyImbalance(res, Body)
  }
  @Post('balancing/adjust-accumulated-imbalance')
  epBalancingAdjustAccumulatedImbalance(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epBalancingAdjustAccumulatedImbalance(res, Body)
  }
  @Post('balancing/vent-commissioning-other-gas')
  epBalancingVentCommissioningOtherGas(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epBalancingVentCommissioningOtherGas(res, Body)
  }

  @Post('balancing/balance-report')
  epBalancingBalanceReport(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epBalancingBalanceReport(res, Body)
  }

  @Post('balancing/intraday-acc-imbalance-inventory-original')
  epBalancingIntradayAccImbalanceInventoryOriginal(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epBalancingIntradayAccImbalanceInventoryOriginal(res, Body)
  }

  // ***** ทำสี hind/show แล้ว
  @UseGuards(AuthGuard)
  @Post('balancing/balance-intraday-dashboard')
  balanceIntradayDashboard(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99999
    return this.exportFilesService.balanceIntradayDashboard(res, Body, userId)
  }

  @Post('balancing/intraday-base-inentory')
  epBalancingIntradayBaseInentory(@Res() res: Response, @Body() Body: any) {
    return this.exportFilesService.epBalancingIntradayBaseInentory(res, Body)
  }

  @UseGuards(AuthGuard)
  @Post('balancing/intraday-base-inentory-shipper')
  epBalancingIntradayBaseInentoryShipper(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub

    return this.exportFilesService.epBalancingIntradayBaseInentoryShipper(res, Body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('balancing/instructed-operation-flow-shippers')
  epBalancinginstructedOperationFlowShippers(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99999
    return this.exportFilesService.epBalancinginstructedOperationFlowShippers(res, Body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('balancing/intraday-balancing-report')
  epBalancingIntradayBalancingReport(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99999
    return this.exportFilesService.epBalancingIntradayBalancingReport(res, Body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('balancing/intraday-acc-imbalance-dashboard')
  intradayAccImbalanceDashboard(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99999
    return this.exportFilesService.intradayAccImbalanceDashboard(res, Body, userId)
  }
  @UseGuards(AuthGuard)
  @Post('balancing/balancing-monthly-report')
  epBalancingMonthlyReport(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99999
    return this.exportFilesService.epBalancingMonthlyReport(res, Body, userId)
  }

  // excel old
  @UseGuards(AuthGuard)
  @Post('balancing/balancing-monthly-report-download')
  balancingMonthlyReportDownload(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    return this.exportFilesService.balancingMonthlyReportDownload(res, Body, req?.user?.sub)
  }

  // Event
  @UseGuards(AuthGuard)
  @Post('event/offspec-gas')
  offspecGas(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.offspecGas(res, Body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('event/emergency-difficult-day')
  emergencyDifficultDay(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.emergencyDifficultDay(res, Body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('event/ofo')
  ofo(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.ofo(res, Body, userId)
  }

  // Tariff
  @UseGuards(AuthGuard)
  @Post('tariff/tariff-charge-report')
  tariffChargeReport(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.tariffChargeReport(res, Body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('tariff/tariff-credit-debit-note')
  tariffCreditDebitNote(@Res() res: Response, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.tariffCreditDebitNote(res, Body, userId)
  }

  // view tariff-charge-report
  @UseGuards(AuthGuard)
  @Post('tariff/tariff-charge-report/capacity-charge/:id')
  tariffChargeReportCapacityCharge(@Res() res: Response, @Param('id') id: any, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.tariffChargeReportCapacityCharge(res, id, Body, userId)
  }

  @UseGuards(AuthGuard)
  @Post('tariff/tariff-charge-report/capacity-overuse-charge-entry-exit/:id')
  tariffChargeReportCapacityOveruseChargeEntryExit(@Res() res: Response, @Param('id') id: any, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.tariffChargeReportCapacityOveruseChargeEntryExit(res, id, Body, userId)
  }

  // ....
  // @UseGuards(AuthGuard)
  @Post('tariff/tariff-charge-report/commodity-charge-a-external/:id')
  tariffChargeReportCommodityChargeExternalA(@Res() res: Response, @Param('id') id: any, @Body() Body: any, @Req() req: any) {
    // const userId = req?.user?.sub
    // const userId = 99989 //sp
    const userId = 99988 //tso
    return this.exportFilesService.tariffChargeReportCommodityChargeExternalA(res, id, Body, userId)
  }

  // ....
  @UseGuards(AuthGuard)
  @Post('tariff/tariff-charge-report/commodity-charge-a-internal/:id')
  tariffChargeReportCommodityChargeInternalA(@Res() res: Response, @Param('id') id: any, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.tariffChargeReportCommodityChargeInternalA(res, id, Body, userId)
  }

  // ....
  @UseGuards(AuthGuard)
  @Post('tariff/tariff-charge-report/commodity-charge-b/:id')
  tariffChargeReportCommodityChargeB(@Res() res: Response, @Param('id') id: any, @Body() Body: any, @Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 99989 //sp
    // const userId = 99988 //tso
    return this.exportFilesService.tariffChargeReportCommodityChargeB(res, id, Body, userId)
  }

  // ===== Imbalance Capacity Report Endpoints =====

  /**
   * Export Imbalance Capacity Report to Excel
   * POST /export-files/tariff/imbalance-capacity-report
   */
  // @UseGuards(AuthGuard)
  // https://10.100.91.151:4001/export-files/tariff/imbalance-capacity-report
  // https://app.clickup.com/t/86euzxxud
  @Post('tariff/imbalance-capacity-report')
  // @Get('tariff/imbalance-capacity-report')
  async exportImbalanceCapacityReport(
    @Res() res: Response,
    @Query() query: any,
    @Body()
    body: ExportImbalanceCapacityReportDto
  ) {
    try {
      // const body = {
      //     id: '370',
      //     companyName: 'PTT Public Company Limited',
      //     shipperName: 'EGAT Shipper',
      //     month: 'Apr',
      //     year: '2024',
      //     reportedBy: {
      //       name: 'Ms.Wipada Yenyin',
      //       position: 'Senior Engineer',
      //       division: 'Transmission Contracts & Regulatory Management Division',
      //     },
      //     manager: {
      //       name: 'Ms. Tanatchaporn',
      //       position: 'Manager of',
      //       division: 'Transmission Contracts & Regulatory Management Division',
      //     },
      //   }
      const id = body.id //370;//req?.user?.sub;
      const userId = 0 //req?.user?.sub;
      const Data = await this.tariffService.chargeView({id: id}, userId)

      const realData = Data[0].data.data

      await this.exportFileTariffService.exportRealImbalanceCapacityReport(
        realData as any,
        {
          companyName: body.companyName,
          shipperName: body.shipperName,
          month: body.month,
          year: body.year,
          reportedBy: body.reportedBy,
          manager: body.manager
        },
        res
      )
    } catch (error) {
      throw new HttpException(`Failed to export Imbalance Capacity Report: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /**
   * Generate sample Imbalance Capacity Report data
   * POST /export-files/tariff/imbalance-capacity-report/sample
   */
  @Post('tariff/imbalance-capacity-report/sample')
  async generateSampleImbalanceCapacityReport(
    @Res() res: Response,
    @Body()
    body: GenerateSampleReportDto
  ) {
    try {
      const sampleData = this.exportFileTariffService.generateSampleData()
      await this.exportFileTariffService.exportImbalanceCapacityReport(
        sampleData,
        {
          companyName: body.companyName,
          shipperName: body.shipperName,
          month: body.month,
          year: body.year,
          reportedBy: body.reportedBy,
          manager: body.manager
        },
        res
      )
    } catch (error) {
      throw new HttpException(`Failed to generate sample Imbalance Capacity Report: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  // Gas Allocation (Commodity) Report Endpoints
  /**
   * Generate sample Gas Allocation Report data
   * POST /export-files/tariff/gas-allocation-report/sample
   */
  @Post('tariff/gas-allocation-report/sample')
  async generateSampleGasAllocationReport(
    @Res() res: Response,
    @Body()
    body: GenerateGasAllocationSampleDto
  ) {
    try {
      const sampleData = this.exportFileTariffCommodityService.generateSampleData()

      await this.exportFileTariffCommodityService.exportStatementOfGasAllocation(
        sampleData,
        {
          gasMeteringStation: body.gasMeteringStation,
          shipperName: body.shipperName,
          month: body.month,
          year: body.year
        },
        res
      )
    } catch (error) {
      throw new HttpException(`Failed to generate sample Gas Allocation Report: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  // Gas Allocation Multi-Sheet Report Endpoints

  /**
   * Export Statement of Gas Allocation to Excel with Multiple Sheets
   * POST /export-files/tariff/gas-allocation-report/multisheet
   */
  // external A
  @UseGuards(AuthGuard) // https://app.clickup.com/t/86euzxxut
  @Post('tariff/gas-allocation-report/multisheet-type-a')
  async exportGasAllocationMultiSheetReport(
    @Res() res: Response,
    @Query() query: any,
    @Body()
    body: ExportGasAllocationMultiSheetReportDto,
    @Req() req: any
  ) {
    try {
      const userId = req?.user?.sub
      const data = await this.tariffService.chargeView({id: body.id}, userId)
      const sheetData = data[0].data.value
      // console.log('data : ', data);
      await this.exportFileTariffCommodityService.exportStatementOfGasAllocationMultiSheet(
        sheetData as any,
        {
          gasMeteringStation: body.gasMeteringStation,
          shipperName: body.shipperName,
          month: body.month,
          year: body.year,
          startDate: body.startDate,
          endDate: body.endDate,
          timestamp: data[0]?.create_date_num
        },
        res
      )
    } catch (error) {
      throw new HttpException(`Failed to export Gas Allocation Multi-Sheet Report: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /**
   * Generate sample Gas Allocation Multi-Sheet Report data
   * POST /export-files/tariff/gas-allocation-report/multisheet/sample
   */
  // @Post('tariff/gas-allocation-report/multisheet/sample')
  // async generateSampleGasAllocationMultiSheetReport(
  //   @Res() res: Response,
  //   @Body()
  //   body: GenerateGasAllocationMultiSheetSampleDto
  // ) {
  //   try {
  //     const sampleData = this.exportFileTariffCommodityService.generateSampleMultiSheetData()

  //     await this.exportFileTariffCommodityService.exportStatementOfGasAllocationMultiSheet(
  //       sampleData,
  //       {
  //         gasMeteringStation: body.gasMeteringStation,
  //         shipperName: body.shipperName,
  //         month: body.month,
  //         year: body.year,
  //         startDate: body.startDate,
  //         endDate: body.endDate
  //       },
  //       res
  //     )
  //   } catch (error) {
  //     throw new HttpException(`Failed to generate sample Gas Allocation Multi-Sheet Report: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
  //   }
  // }

  // Gas Delivery Report (A2) Endpoints

  /**
   * Export Gas Delivery Report to Excel
   * POST /tariff/gas-allocation-report/multisheet-type-a2
   */
  // internal A
  @UseGuards(AuthGuard)
  @Post('tariff/gas-allocation-report/multisheet-type-a2')
  async exportGasDeliveryReport(@Res() res: Response, @Body() body: any, @Req() req: any) {
    try {
      const userId = req?.user?.sub
      const data = await this.tariffService.chargeView({id: body.id}, userId)

      await this.exportFileTariffCommodityA2Service.exportGasDeliveryReport(
        data?.[0]?.data?.value || ([] as any),
        {
          zone: body.zone,
          month: body.month,
          year: body.year
        },
        res
      )
    } catch (error) {
      throw new HttpException(`Failed to export Gas Delivery Report: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /**
   * Generate sample Gas Delivery Report data
   * POST /export-files/tariff/gas-delivery-report/sample
   */
  @Post('tariff/gas-delivery-report/sample')
  async generateSampleGasDeliveryReport(
    @Res() res: Response,
    @Body()
    body: GenerateGasDeliverySampleDto
  ) {
    try {
      const sampleData = this.exportFileTariffCommodityA2Service.generateSampleData()

      await this.exportFileTariffCommodityA2Service.exportGasDeliveryReport(
        sampleData,
        {
          zone: body.zone,
          month: body.month,
          year: body.year
        },
        res
      )
    } catch (error) {
      throw new HttpException(`Failed to generate sample Gas Delivery Report: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  // Daily Overview: Commodity Charge (B) Endpoints

  /**
   * Export Daily Overview: Commodity Charge to Excel
   * POST /export-files/tariff/commodity-charge-report
   */
  @Post('tariff/commodity-charge-report-type-b')
  async exportCommodityChargeReport(
    @Res() res: Response,
    @Body()
    body: ExportCommodityChargeReportDto
  ) {
    try {
      const id = body.id //req?.user?.sub;
      const userId = 0 //req?.user?.sub;
      const data = await this.tariffService.chargeView({id: id}, userId)

      const sheetData = data[0].data.value
      await this.exportFileTariffCommodityBService.exportCommodityChargeReport(
        sheetData as any,
        {
          month: body.month,
          year: body.year,
          tariffId: body.tariffId,
          shipperName: body.shipperName,
          contractCode: body.contractCode
        },
        res
      )
    } catch (error) {
      throw new HttpException(`Failed to export Daily Overview: Commodity Charge: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /**
   * Generate sample Daily Overview: Commodity Charge data
   * POST /export-files/tariff/commodity-charge-report/sample
   */
  @Post('tariff/commodity-charge-report/sample')
  async generateSampleCommodityChargeReport(
    @Res() res: Response,
    @Body()
    body: GenerateCommodityChargeSampleDto
  ) {
    try {
      const sampleData = this.exportFileTariffCommodityBService.generateSampleData()

      await this.exportFileTariffCommodityBService.exportCommodityChargeReport(
        sampleData,
        {
          month: body.month,
          year: body.year,
          tariffId: body.tariffId,
          shipperName: body.shipperName,
          contractCode: body.contractCode
        },
        res
      )
    } catch (error) {
      throw new HttpException(`Failed to generate sample Daily Overview: Commodity Charge: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
