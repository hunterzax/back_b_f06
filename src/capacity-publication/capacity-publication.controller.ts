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
import {CapacityPublicationService} from './capacity-publication.service'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {FileInterceptor} from '@nestjs/platform-express'
import {
  Request,
  Response
} from 'express'
import {middleNotiInapp} from 'src/common/utils/inapp.util'
import {PrismaService} from '@prisma/prisma.service'

@Controller(
  'capacity-publication'
)
export class CapacityPublicationController {
  constructor(
    private readonly accountManageService: AccountManageService,
    private readonly capacityPublicationService: CapacityPublicationService,
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  @Get()
  findAll() {
    return this.capacityPublicationService.findAll()
  }

  @Get('demo')
  demo() {
    return this.capacityPublicationService.demo()
  }

  @Get('zone')
  zoneFind() {
    return this.capacityPublicationService.zoneFind()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('detail')
  async detailCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    // const { start_date } = body;

    // if (!start_date) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    const detailCreate =
      await this.capacityPublicationService.detailCreate(
        body,
        req?.user?.sub
      )

    // inapp
    try {
      const areaData =
        await this.prisma.area.findFirst(
          {
            where: {
              id: Number(
                body?.area_id
              )
            },
            include: {
              zone: true
            }
          }
        )
      const message = `Available Capacity of ${areaData?.zone?.name} Zone, Area ${areaData?.name} has been adjusted from start date ${body?.start_date} to end date ${body?.end_date || '-'}`
      await middleNotiInapp(
        this.prisma,
        'Capacity Management',
        `${message}`,
        54, // menus_id | 54 Capacity Publication
        1
      )
    } catch (error) {}

    return detailCreate
  }

  @Get('show-detail')
  showDetail() {
    return this.capacityPublicationService.showDetail()
  }

  @Get('daily')
  getDays(
    @Query() query: any
  ) {
    const {date} = query
    // return this.capacityPublicationService.getDays(date);
    return this.capacityPublicationService.getDays2(
      date
    )
  }

  @Get('monthly')
  getMonthly(
    @Query() query: any
  ) {
    const {
      startMonth,
      endMonth
    } = query
    // return this.capacityPublicationService.getMonthly(startMonth, endMonth);
    return this.capacityPublicationService.getMonthly2(
      startMonth,
      endMonth
    )
  }

  @Get('yearly')
  getYearly(
    @Query() query: any
  ) {
    const {
      startYear,
      endYear
    } = query
    // return this.capacityPublicationService.getYearly(startYear, endYear);
    return this.capacityPublicationService.getYearly2(
      startYear,
      endYear
    )
  }
}
