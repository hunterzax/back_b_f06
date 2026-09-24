import {UseItOrLoseItService} from './use-it-or-lose-it.service'
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
import {PrismaService} from '@prisma/prisma.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {middleNotiInapp} from 'src/common/utils/inapp.util'

@Controller(
  'use-it-or-lose-it'
)
export class UseItOrLoseItController {
  constructor(
    private readonly useItOrLoseItService: UseItOrLoseItService,
    private prisma: PrismaService
  ) {}

  @Get()
  findAll(
    @Query() query: any
  ) {
    // return this.useItOrLoseItService.findAll2(query);
    return this.useItOrLoseItService.findAll4(
      query
    )
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('release')
  async release(
    @Body() body: any,
    @Req() req: any
  ) {
    const {
      contract_code_id,
      group_id,
      data
    } = body

    if (
      !contract_code_id ||
      !group_id ||
      !data ||
      data.length === 0
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
    const release =
      await this.useItOrLoseItService.release(
        body,
        req?.user?.sub
      )

    // inapp
    try {
      const contractData =
        await this.prisma.contract_code.findFirst(
          {
            where: {
              id: Number(
                contract_code_id
              )
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
          }
        )
      const message = `The UIOLI for ${contractData?.group?.name} Shipper, Contract Code: ${contractData?.contract_code} has been created`
      await middleNotiInapp(
        this.prisma,
        'Capacity Management',
        `${message}`,
        57, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management | 51 Path Management | 56 Release Capacity Submission | 57 Use it or Lose it
        1
      )
    } catch (error) {}

    return release
  }
}
