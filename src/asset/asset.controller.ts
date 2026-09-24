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
  HttpCode
} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {AssetService} from './asset.service'
import {writeReq} from 'src/common/utils/write-req.util'
import {PrismaService} from 'prisma/prisma.service'
import {AssetZoneService} from './zone'
import {AssetAreaService} from './area'
import {AssetConfigMasterPathService} from './config-master-path'
import {AssetContractPointService} from './contract-point'
import {AssetNominationPointService} from './nomination-point'
import {AssetCustomerTypeService} from './customer-type'
import {AssetNonTpaPointService} from './non-tpa-point'
import {AssetMeteringPointService} from './metering-point'
import {AssetConceptPointService} from './concept-point'
import {middleNotiInapp} from 'src/common/utils/inapp.util'
import {getTodayNowAdd7} from 'src/common/utils/date.util'

@Controller('asset')
export class AssetController {
  constructor(
    private prisma: PrismaService,
    private readonly assetService: AssetService,
    private readonly assetZoneService: AssetZoneService,
    private readonly assetAreaService: AssetAreaService,
    private readonly assetConfigMasterPathService: AssetConfigMasterPathService,
    private readonly assetContractPointService: AssetContractPointService,
    private readonly assetNominationPointService: AssetNominationPointService,
    private readonly assetCustomerTypeService: AssetCustomerTypeService,
    private readonly assetNonTpaPointService: AssetNonTpaPointService,
    private readonly assetMeteringPointService: AssetMeteringPointService,
    private readonly assetConceptPointService: AssetConceptPointService
  ) {}

  // zone

  @UseGuards(AuthGuard)
  @Get('zone')
  zone(@Req() req: any) {
    return this.assetZoneService.zone()
  }

  @UseGuards(AuthGuard)
  @Post('zone-master-create')
  async zoneMasterCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {name} = body

    if (!name) {
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
    const zoneMaster =
      await this.assetZoneService.zoneMasterCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetZoneService.zoneMasterOnce(
        zoneMaster?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `zone`,
      'create',
      his
    )

    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.name} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        20, // zone menus_id
        1
      )
    } catch (error) {}

    return zoneMaster
  }

  @UseGuards(AuthGuard)
  @Put(
    'zone-master-update/:id'
  )
  async zoneMasterUpdate(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    if (!id) {
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
    const zoneMaster =
      await this.assetZoneService.zoneMasterUpdate(
        body,
        req?.user?.sub,
        id
      )

    const his =
      await this.assetZoneService.zoneMasterOnce(
        zoneMaster?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `zone`,
      'edit',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.name} was edited`,
        20, // zone menus_id
        1
      )
    } catch (error) {}

    return zoneMaster
  }

  @UseGuards(AuthGuard)
  @Put(
    'zone-master-quality-update/:id'
  )
  async zoneMasterQualityUpdate(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    if (!id) {
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
    const zoneMasterQuality =
      await this.assetZoneService.zoneMasterQualityUpdate(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.assetZoneService.zoneMasterOnce(
        id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `zone-quality`,
      'edit',
      his
    )
    return zoneMasterQuality
  }

  // area

  @UseGuards(AuthGuard)
  @Get('area')
  area(
    @Req() req: any,
    @Query() query: any
  ) {
    return this.assetAreaService.area(
      query
    )
  }

  @UseGuards(AuthGuard)
  @Get('area-entry')
  areaEntry(@Req() req: any) {
    return this.assetAreaService.areaEntry()
  }

  @UseGuards(AuthGuard)
  @Get('area-f2')
  areaF2(@Req() req: any) {
    return this.assetAreaService.areaF2()
  }

  @UseGuards(AuthGuard)
  @Post('area-create')
  async areaCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {name} = body

    if (!name) {
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
    const area =
      await this.assetAreaService.areaCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetAreaService.areaOnce(
        area?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `area`,
      'create',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.name} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        21, // area menus_id
        1
      )
    } catch (error) {}

    return area
  }

  @UseGuards(AuthGuard)
  @Put('area-update/:id')
  async areaUpdate(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    if (!id) {
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
    const area =
      await this.assetAreaService.areaUpdate(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.assetAreaService.areaOnce(
        area?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `area`,
      'edit',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.name} was edited`,
        21, // area menus_id
        1
      )
    } catch (error) {}

    return area
  }

  // config-master-path

  @UseGuards(AuthGuard)
  @Get('config-master-path')
  configMasterPath(
    @Req() req: any
  ) {
    return this.assetConfigMasterPathService.configMasterPath()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post(
    'config-master-path-create'
  )
  async configMasterPathCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {nodes, edges} =
      body

    if (
      !edges ||
      !nodes ||
      edges.length <= 0 ||
      nodes.length <= 0
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
    const configMasterPathCreate =
      await this.assetConfigMasterPathService.configMasterPathCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetConfigMasterPathService.configMasterPathOnce(
        configMasterPathCreate?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `config-master-path`,
      'create',
      his
    )

    // inapp
    try {
      const message = `${his?.path_no} was created`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        22, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter | 35 Email Management | 25 non tpa point | 22 Config Master Path
        1
      )
    } catch (error) {}

    return configMasterPathCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Patch(
    'config-master-path-status/:id'
  )
  async configMasterPathStatus(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    if (!id) {
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
    const configMasterPathStatus =
      await this.assetConfigMasterPathService.configMasterPathStatus(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.assetConfigMasterPathService.configMasterPathOnce(
        id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `config-master-path`,
      'status',
      his
    )

    // inapp
    try {
      const message = `${his?.path_no} was ${his?.active ? 'Actived' : 'inactived'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        22, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter | 35 Email Management | 25 non tpa point | 22 Config Master Path
        1
      )
    } catch (error) {}

    return configMasterPathStatus
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put(
    'config-master-path-edit/:id'
  )
  async configMasterPathEdit(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    if (!id) {
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
    const configMasterPathEdit =
      await this.assetConfigMasterPathService.configMasterPathEdit(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.assetConfigMasterPathService.configMasterPathOnce(
        id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `config-master-path`,
      'edit',
      his
    )

    // inapp
    try {
      const message = `${his?.path_no} was ${his?.active ? 'Actived' : 'inactived'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        22, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter | 35 Email Management | 25 non tpa point | 22 Config Master Path
        1
      )
    } catch (error) {}

    return configMasterPathEdit
  }

  // contract-point

  @UseGuards(AuthGuard)
  @Get('contract-point')
  contractPoint(
    @Req() req: any
  ) {
    return this.assetContractPointService.contractPoint()
  }

  @UseGuards(AuthGuard)
  @Post(
    'contract-point-create'
  )
  async contractPointCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {contract_point} =
      body

    if (!contract_point) {
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
    const contractPointCreate =
      await this.assetContractPointService.contractPointCreate(
        body,
        req?.user?.sub,
        req
      )
    const his =
      await this.assetContractPointService.contractPointOnce(
        contractPointCreate?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `contract-point`,
      'create',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.contract_point} was created active from ${getTodayNowAdd7(his?.contract_point_start_date).format('YYYY-MM-DD')} to ${(his?.contract_point_end_date && getTodayNowAdd7(his?.contract_point_end_date).format('YYYY-MM-DD')) || '-'}`,
        23, // contract point menus_id
        1
      )
    } catch (error) {}

    return contractPointCreate
  }

  @UseGuards(AuthGuard)
  @Put(
    'contract-point-edit/:id'
  )
  async contractPointEdit(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    const {contract_point} =
      body

    if (!contract_point) {
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
    const contractPointEdit =
      await this.assetContractPointService.contractPointEdit(
        body,
        req?.user?.sub,
        id,
        req
      )
    const his =
      await this.assetContractPointService.contractPointOnce(
        id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `contract-point`,
      'edit',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.contract_point} was edited`,
        23, // contract point menus_id
        1
      )
    } catch (error) {}

    return contractPointEdit
  }

  // nomination-point

  @UseGuards(AuthGuard)
  @Get(
    'contract-code-for-point-and-nomination'
  )
  contractCodeWithNominationPointInContract(
    @Req() req: any
  ) {
    return this.assetNominationPointService.contractCodeWithNominationPointInContract()
  }

  @UseGuards(AuthGuard)
  @Get(
    'nomination-point-contract'
  )
  nominationPointContract(
    @Req() req: any,
    @Query() query: any
  ) {
    return this.assetNominationPointService.nominationPointContract(
      query
    )
  }

  @UseGuards(AuthGuard)
  @Get('nomination-point')
  nominationPoint(
    @Req() req: any,
    @Query() query: any
  ) {
    return this.assetNominationPointService.nominationPoint(
      query
    )
  }

  @UseGuards(AuthGuard)
  @Post(
    'nomination-point-create'
  )
  async nominationPointCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      nomination_point,
      entry_exit_id,
      zone_id,
      area_id,
      contract_nomination_point,
      maximum_capacity,
      start_date,
      customer_type_id
    } = body
    if (
      !nomination_point ||
      !entry_exit_id ||
      !zone_id ||
      !area_id ||
      !contract_nomination_point ||
      !maximum_capacity ||
      !start_date ||
      !customer_type_id
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error: `The new period's start date overlaps with an existing Nom Point.`
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const nominationPointCreate =
      await this.assetNominationPointService.nominationPointCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetNominationPointService.nominationPointOnce(
        nominationPointCreate?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `nomination-point`,
      'create',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.nomination_point} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        24, // nomination point menus_id
        1
      )
    } catch (error) {}

    return nominationPointCreate
  }

  @UseGuards(AuthGuard)
  @Put(
    'nomination-point-edit/:id'
  )
  async nominationPointEdit(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    const {nomination_point} =
      body

    if (
      !nomination_point ||
      !id
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error: `The new period's start date overlaps with an existing Nom Point.`
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const nominationPointEdit =
      await this.assetNominationPointService.nominationPointEdit(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.assetNominationPointService.nominationPointOnce(
        id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `nomination-point`,
      'edit',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.nomination_point} was edited`,
        24, // nomination point menus_id
        1
      )
    } catch (error) {}

    return nominationPointEdit
  }

  @UseGuards(AuthGuard)
  @Post(
    'nomination-point-new-period'
  )
  async nominationPointNewPeriod(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      nomination_point,
      entry_exit_id,
      zone_id,
      area_id,
      contract_nomination_point,
      maximum_capacity,
      start_date,
      customer_type_id
    } = body
    if (
      !nomination_point ||
      !entry_exit_id ||
      !zone_id ||
      !area_id ||
      !contract_nomination_point ||
      !maximum_capacity ||
      !start_date ||
      !customer_type_id
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error: `The new period's start date overlaps with an existing Nom Point.`
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const nominationPointCreate =
      await this.assetNominationPointService.nominationPointNewPeriod(
        body,
        req?.user?.sub,
        undefined,
        req
      )

    return nominationPointCreate
  }

  @UseGuards(AuthGuard)
  @Post(
    'nomination-point-new-period-check'
  )
  async nominationPointNewPeriodCheck(
    @Body() body: any
  ) {
    const {
      nomination_point,
      start_date,
      end_date
    } = body
    if (
      !nomination_point ||
      !start_date
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error: `Missing required fields`
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const nominationPointCreate =
      await this.assetNominationPointService.checkNominationPointNewPeriod(
        {
          name: nomination_point,
          nomination_point_start_date:
            start_date,
          nomination_point_end_date:
            end_date
        }
      )
    return nominationPointCreate
  }

  // customer-type

  @UseGuards(AuthGuard)
  @Get('customer-type')
  customerType(
    @Req() req: any
  ) {
    return this.assetCustomerTypeService.customerType()
  }

  @UseGuards(AuthGuard)
  @Post(
    'customer-type-create'
  )
  async customerTypeCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      name,
      entry_exit_id
    } = body

    if (
      !name ||
      !entry_exit_id
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
    const customerTypeCreate =
      await this.assetCustomerTypeService.customerTypeCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetCustomerTypeService.customerTypeOnce(
        customerTypeCreate?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `customer-type`,
      'create',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.name} was created active from ${getTodayNowAdd7(his?.create_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        1002, // custom type menus_id
        1
      )
    } catch (error) {}

    return customerTypeCreate
  }

  // non-tpa-point

  @UseGuards(AuthGuard)
  @Get('non-tpa-point')
  nonTpaPoint(
    @Req() req: any
  ) {
    return this.assetNonTpaPointService.nonTpaPoint()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post(
    'non-tpa-point-create'
  )
  async nonTpaPointCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      non_tpa_point_name,
      nomination_point_id,
      area_id,
      start_date,
      ref_id
    } = body

    if (
      !non_tpa_point_name ||
      !nomination_point_id ||
      !area_id ||
      !start_date
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
    const nonTpaPointCreate =
      await this.assetNonTpaPointService.nonTpaPointCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetNonTpaPointService.nonTpaPointOnce(
        nonTpaPointCreate?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `non-tpa-point`,
      ref_id
        ? 'period'
        : 'create',
      his
    )

    // inapp
    try {
      const message = `${his?.non_tpa_point_name} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        25, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter | 35 Email Management | 25 non tpa point
        1
      )
    } catch (error) {}

    return nonTpaPointCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put(
    'non-tpa-point-edit/:id'
  )
  async nonTpaPointEdit(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    const {
      non_tpa_point_name,
      nomination_point_id,
      area_id,
      start_date
    } = body

    if (
      !non_tpa_point_name ||
      !nomination_point_id ||
      !area_id ||
      !start_date ||
      !id
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
    const nonTpaPointEdit =
      await this.assetNonTpaPointService.nonTpaPointEdit(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.assetNonTpaPointService.nonTpaPointOnce(
        id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `non-tpa-point`,
      'edit',
      his
    )

    // inapp
    try {
      const message = `${his?.non_tpa_point_name} was edited`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        25, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow | 34 System Parameter | 35 Email Management | 25 non tpa point
        1
      )
    } catch (error) {}

    return nonTpaPointEdit
  }

  // metering-point

  @UseGuards(AuthGuard)
  @Get(
    'nomination-point-non-tpa-point'
  )
  nominationPointNonTpaPoint(
    @Req() req: any
  ) {
    return this.assetMeteringPointService.nominationPointNonTpaPoint()
  }

  @UseGuards(AuthGuard)
  @Get('metering-point')
  meteringPoint(
    @Req() req: any
  ) {
    return this.assetMeteringPointService.meteringPoint()
  }

  @UseGuards(AuthGuard)
  @Post(
    'metering-point-create'
  )
  async meteringPointCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      metered_point_name,
      point_type_id,
      ref_id,
      start_date
    } = body

    if (
      !metered_point_name ||
      !point_type_id ||
      !start_date
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
    const meteringPointCreate =
      await this.assetMeteringPointService.meteringPointCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetMeteringPointService.meteringPointOnce(
        meteringPointCreate?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `metering-point`,
      ref_id
        ? 'period'
        : 'create',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.metered_point_name} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        26, // metered point menus_id
        1
      )
    } catch (error) {}

    return meteringPointCreate
  }

  @UseGuards(AuthGuard)
  @Put(
    'metering-point-edit/:id'
  )
  async meteringPointEdit(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    const {
      metered_point_name,
      point_type_id,
      start_date
    } = body

    if (
      !metered_point_name ||
      !point_type_id ||
      !start_date ||
      !id
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
    const meteringPointEdit =
      await this.assetMeteringPointService.meteringPointEdit(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.assetMeteringPointService.meteringPointOnce(
        id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `metering-point`,
      'edit',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.metered_point_name} was edited`,
        26, // metered point menus_id
        1
      )
    } catch (error) {}

    return meteringPointEdit
  }

  @UseGuards(AuthGuard)
  @Post(
    'metering-point-new-period'
  )
  async meteringPointNewPeriod(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      metered_point_name,
      point_type_id,
      ref_id,
      start_date
    } = body

    if (
      !metered_point_name ||
      !point_type_id ||
      !start_date
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
    const meteringPointCreate =
      await this.assetMeteringPointService.meteringPointNewPeriod(
        body,
        req?.user?.sub
      )
    // const his =
    //   await this.assetMeteringPointService.meteringPointOnce(
    //     meteringPointCreate?.id
    //   )
    // await writeReq(
    //   this.prisma,
    //   'DAM',
    //   req,
    //   `metering-point`,
    //   'period',
    //   his
    // )

    return meteringPointCreate
  }

  // concept-point

  @UseGuards(AuthGuard)
  @Get('entry-exit')
  entryExit(@Req() req: any) {
    return this.assetConceptPointService.entryExit()
  }

  @UseGuards(AuthGuard)
  @Get('type-concept-point')
  typeConceptPoint(
    @Req() req: any
  ) {
    return this.assetConceptPointService.typeConceptPoint()
  }

  @UseGuards(AuthGuard)
  @Get('concept-point')
  conceptPoint(
    @Req() req: any
  ) {
    return this.assetConceptPointService.conceptPoint()
  }

  @UseGuards(AuthGuard)
  @Get('concept-point-query')
  conceptPointQuery(
    @Req() req: any,
    @Query() query: any
  ) {
    return this.assetConceptPointService.conceptPointQuery(
      query
    )
  }

  @UseGuards(AuthGuard)
  @Post(
    'concept-point-create'
  )
  async conceptPointCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      concept_point,
      type_concept_point_id,
      start_date
    } = body

    if (
      !concept_point ||
      !type_concept_point_id ||
      !start_date
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
    const conceptPointCreate =
      await this.assetConceptPointService.conceptPointCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetConceptPointService.conceptPointOnce(
        conceptPointCreate?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `concept-point`,
      'create',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.concept_point} was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        27, // concept point menus_id
        1
      )
    } catch (error) {}

    return conceptPointCreate
  }

  @UseGuards(AuthGuard)
  @Put(
    'concept-point-edit/:id'
  )
  async conceptPointEdit(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any
  ) {
    const {
      concept_point,
      type_concept_point_id,
      start_date
    } = body

    if (
      !concept_point ||
      !type_concept_point_id ||
      !start_date ||
      !id
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
    const conceptPointEdit =
      await this.assetConceptPointService.conceptPointEdit(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.assetConceptPointService.conceptPointOnce(
        id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `concept-point`,
      'edit',
      his
    )
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${his?.concept_point} was edited`,
        27, // concept point menus_id
        1
      )
    } catch (error) {}

    return conceptPointEdit
  }

  @UseGuards(AuthGuard)
  @Get('limit-concept-point')
  limitConceptPoint(
    @Req() req: any
  ) {
    return this.assetConceptPointService.limitConceptPoint()
  }

  @UseGuards(AuthGuard)
  @Get('shipper-group')
  shipperGroup(
    @Req() req: any
  ) {
    return this.assetConceptPointService.shipperGroup()
  }

  @UseGuards(AuthGuard)
  @Post(
    'limit-concept-point-manage'
  )
  async limitConceptPointManage(
    @Body() body: any,
    @Req() req: any
  ) {
    const limitConceptPointManage =
      await this.assetConceptPointService.limitConceptPointManage(
        body,
        req?.user?.sub
      )
    const his =
      await this.assetConceptPointService.limitConceptPoint()
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `limit-concept-point`,
      'manage',
      his
    )

    return limitConceptPointManage
  }

  @UseGuards(AuthGuard)
  @Get(
    'web-config-access-token'
  )
  async webConfigGetAccessToken(
    @Req() req: any
  ) {
    const accessToken =
      await this.assetMeteringPointService.webConfigGetAccessToken(
        req?.user?.username ??
          '',
        req?.user?.sub
      )

    return accessToken
  }
}
