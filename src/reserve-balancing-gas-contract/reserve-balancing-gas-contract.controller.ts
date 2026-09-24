import {ReserveBalancingGasContractService} from './reserve-balancing-gas-contract.service'
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
import {
  middleNotiInapp,
  middleNotiInappShipper
} from 'src/common/utils/inapp.util'
import {PrismaService} from '@prisma/prisma.service'

@Controller(
  'reserve-balancing-gas-contract'
)
export class ReserveBalancingGasContractController {
  constructor(
    private readonly reserveBalancingGasContractService: ReserveBalancingGasContractService,
    private prisma: PrismaService
  ) {}

  @Get()
  findAll() {
    return this.reserveBalancingGasContractService.findAll()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('create')
  async create(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      res_bal_gas_contract,
      group_id
    } = body

    if (
      !res_bal_gas_contract ||
      !group_id
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
    const create =
      await this.reserveBalancingGasContractService.create(
        body,
        req?.user?.sub
      )

    // inapp
    try {
      const shipperData =
        await this.prisma.group.findFirst(
          {
            where: {
              id: Number(
                group_id
              )
            },
            select: {
              name: true
            }
          }
        )
      const message = `Reserve Balancing Gas Contracts has been created for ${shipperData?.name} Shipper (Reserve Bal. Contracts Code: ${res_bal_gas_contract})`
      // await middleNotiInapp(
      //       this.prisma,
      //       'Capacity Management',
      //       `${message}`,
      //       59, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management | 51 Path Management | 56 Release Capacity Submission | 57 Use it or Lose it | 58 Release/UIOLI Summary Report | 60 Release Capacity Management | 59 Reserve Balancing Gas Contracts
      //       1,
      //     );
      await middleNotiInappShipper(
        this.prisma,
        'Capacity Management',
        `${message}`,
        59,
        1,
        group_id
      )
    } catch (error) {}

    return create
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('edit/:id')
  async edit(
    @Body() body: any,
    @Req() req: any,
    @Param('id') id: any
  ) {
    const {
      res_bal_gas_contract,
      group_id
    } = body

    if (
      !res_bal_gas_contract ||
      !group_id ||
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
    const edit =
      await this.reserveBalancingGasContractService.edit(
        body,
        id,
        req?.user?.sub
      )

    // inapp
    try {
      const shipperData =
        await this.prisma.group.findFirst(
          {
            where: {
              id: Number(
                group_id
              )
            },
            select: {
              name: true
            }
          }
        )
      const message = `Reserve Balancing Gas Contracts has been edited for ${shipperData?.name} Shipper (Reserve Bal. Contracts Code: ${res_bal_gas_contract})`
      await middleNotiInapp(
        this.prisma,
        'Capacity Management',
        `${message}`,
        59, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management | 51 Path Management | 56 Release Capacity Submission | 57 Use it or Lose it | 58 Release/UIOLI Summary Report | 60 Release Capacity Management | 59 Reserve Balancing Gas Contracts
        1
      )
      await middleNotiInappShipper(
        this.prisma,
        'Capacity Management',
        `${message}`,
        59,
        1,
        group_id
      )
    } catch (error) {}

    return edit
  }

  @UseGuards(AuthGuard)
  @Post('comment')
  async comment(
    @Body() body: any,
    @Req() req: any
  ) {
    const {comment, id} = body

    if (!comment || !id) {
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
      await this.reserveBalancingGasContractService.comment(
        body,
        req?.user?.sub
      )

    return comments
  }

  @UseGuards(AuthGuard)
  @Post('file')
  async file(
    @Body() body: any,
    @Req() req: any
  ) {
    const {url, id} = body

    if (!url || !id) {
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
    const file =
      await this.reserveBalancingGasContractService.files(
        body,
        req?.user?.sub
      )

    return file
  }
}
