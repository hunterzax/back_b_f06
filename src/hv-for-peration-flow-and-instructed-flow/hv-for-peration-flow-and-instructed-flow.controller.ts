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
  Put
} from '@nestjs/common'
import {HvForPerationFlowAndInstructedFlowService} from './hv-for-peration-flow-and-instructed-flow.service'
import {CreateHvForPerationFlowAndInstructedFlowDto} from './dto/create-hv-for-peration-flow-and-instructed-flow.dto'
import {UpdateHvForPerationFlowAndInstructedFlowDto} from './dto/update-hv-for-peration-flow-and-instructed-flow.dto'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {writeReq} from 'src/common/utils/write-req.util'
import {PrismaService} from 'prisma/prisma.service'
import {middleNotiInapp} from 'src/common/utils/inapp.util'
import {getTodayNowAdd7} from 'src/common/utils/date.util'

@Controller(
  'hv-for-peration-flow-and-instructed-flow'
)
export class HvForPerationFlowAndInstructedFlowController {
  constructor(
    private prisma: PrismaService,
    private readonly hvForPerationFlowAndInstructedFlowService: HvForPerationFlowAndInstructedFlowService
  ) {}

  // @UseGuards(AuthGuard)
  @Get('hv-type')
  hvType() {
    return this.hvForPerationFlowAndInstructedFlowService.hvType()
  }

  // @UseGuards(AuthGuard)
  @Get('metering-point')
  meteringPoint() {
    return this.hvForPerationFlowAndInstructedFlowService.meteringPoint()
  }

  // @UseGuards(AuthGuard)
  @Get(
    'metering-concept-type'
  )
  meterConceptType() {
    return this.hvForPerationFlowAndInstructedFlowService.meterConceptType()
  }

  // New
  @Get('concept-point')
  conceptPointTypeMeter() {
    return this.hvForPerationFlowAndInstructedFlowService.conceptPointTypeMeter()
  }

  @UseGuards(AuthGuard)
  @Get()
  findAll() {
    return this.hvForPerationFlowAndInstructedFlowService.findAll()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post()
  async create(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      hv_type_id,
      group_id,
      meter_concept_type_id,
      start_date
    } = body

    if (
      !hv_type_id ||
      !meter_concept_type_id ||
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
    const hvForPerationFlowAndInstructedFlowService =
      await this.hvForPerationFlowAndInstructedFlowService.create(
        body,
        req?.user?.sub
      )
    const his =
      await this.hvForPerationFlowAndInstructedFlowService.findOnce(
        hvForPerationFlowAndInstructedFlowService?.id
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `hv-for-peration-flow-and-instructed-flow`,
      'create',
      his
    )

    // inapp
    try {
      const message = `Operation Flow and Intructed Flow HV was created for ${his?.hv_type?.type} active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        1008, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow
        1
      )
    } catch (error) {}

    return hvForPerationFlowAndInstructedFlowService
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('/:id')
  async edit(
    @Body() body: any,
    @Req() req: any,
    @Param('id') id: any
  ) {
    const {
      hv_type_id,
      group_id,
      meter_concept_type_id,
      start_date
    } = body

    if (
      !hv_type_id ||
      !meter_concept_type_id ||
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
    const hvForPerationFlowAndInstructedFlowService =
      await this.hvForPerationFlowAndInstructedFlowService.edit(
        id,
        body,
        req?.user?.sub
      )
    const his =
      await this.hvForPerationFlowAndInstructedFlowService.findOnce(
        Number(id)
      )
    await writeReq(
      this.prisma,
      'DAM',
      req,
      `hv-for-peration-flow-and-instructed-flow`,
      'edit',
      his
    )

    // inapp
    try {
      const message = `Operation Flow and Intructed Flow HV was edited for ${his?.hv_type?.type} active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')}`
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `${message}`,
        1008, // menus_id | 7 T&C | 40 Capacity Publication Remarks | 36 user guide | 79 metering checking condition | 1008 HV for Operation Flow and Instructed Flow
        1
      )
    } catch (error) {}

    return hvForPerationFlowAndInstructedFlowService
  }
}
