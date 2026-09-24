import {Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req} from '@nestjs/common'
import {CallReceivedService} from './call-received.service'
import {PrismaService} from '@prisma/prisma.service'
import {getTodayNowAdd7} from 'src/common/utils/date.util'

@Controller('call-received')
export class CallReceivedController {
  constructor(
    private readonly callReceivedService: CallReceivedService,
    private prisma: PrismaService
  ) {}

  // @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('when-add-new-shipper')
  async whenAddNewShipper(@Body() body: any, @Req() req: any) {
    try {
      const {email, userId, firstName, lastName, action, shipper} = body

      await this.prisma.log_tpa_website.create({
        data: {
          reqUser: !!req ? JSON.stringify(await this.callReceivedService.useReqs(req)) : null,
          type: 'EXTERNAL-SHIPPER-REQUEST',
          value: body,
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          ...(!!req?.user?.sub && {
            create_by_account: {
              connect: {
                id: Number(req?.user?.sub) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
              }
            }
          })
        }
      })

      let errorList = []
      if (!email) {
        errorList.push('Missing email.')
      }
      if (!firstName) {
        errorList.push('Missing firstName.')
      }
      if (!lastName) {
        errorList.push('Missing lastName.')
      }
      if (!action) {
        errorList.push('Missing action.')
      }
      if (!shipper) {
        errorList.push('Missing shipper.')
      }
      if (!shipper?.ShipperCode) {
        errorList.push("Missing shipper's ShipperCode.")
      }
      if (!shipper?.shipperName) {
        errorList.push("Missing shipper's shipperName.")
      }
      if (!shipper?.action) {
        errorList.push("Missing shipper's action.")
      }
      if (errorList.length > 0) {
        throw new HttpException(
          {
            status: {
              code: `E`,
              message: errorList.join(', '),
              errorList: errorList
            }
          },
          HttpStatus.BAD_REQUEST
        )
      }
      // if (
      //   !email ||
      //   // !userId ||
      //   !firstName ||
      //   !lastName ||
      //   !action ||
      //   !shipper ||
      //   !shipper?.ShipperCode ||
      //   !shipper?.shipperName ||
      //   !shipper?.action
      // ) {
      //   throw new HttpException(
      //     {
      //       status: {
      //         code: `E`,
      //         message: `Missing required fields`,
      //       },
      //     },
      //     HttpStatus.BAD_REQUEST,
      //   );
      // }
      // const resData = await this.callReceivedService.whenAddNewShipper(body);
      const resData = await this.callReceivedService.whenAddNewShipper({
        ...body,
        ignoreAction: true
      })
      // success
      return {
        status: {
          code: `S`,
          message: ``
        }
      }
    } catch (error) {
      throw new HttpException(
        {
          status: {
            code: `E`,
            message: error?.response?.status?.message,
            error: error
          }
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }
}
