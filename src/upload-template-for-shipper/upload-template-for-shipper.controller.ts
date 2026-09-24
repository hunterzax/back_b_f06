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
import {UploadTemplateForShipperService} from './upload-template-for-shipper.service'
import {FileUploadService} from 'src/grpc/file-service.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {FileInterceptor} from '@nestjs/platform-express'
import {Response} from 'express'
import {uploadFilsTemp} from 'src/common/utils/uploadFileIn'
import {PrismaService} from 'prisma/prisma.service'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {middleNotiInappShipper} from 'src/common/utils/inapp.util'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

@Controller(
  'upload-template-for-shipper'
)
export class UploadTemplateForShipperController {
  constructor(
    private readonly uploadTemplateForShipperService: UploadTemplateForShipperService,
    private readonly fileUploadService: FileUploadService,
    private prisma: PrismaService
  ) {}

  @Get()
  findAll() {
    return this.uploadTemplateForShipperService.findAll()
  }

  @Get(
    'shipper-contract-approved'
  )
  shipperContractApproved() {
    return this.uploadTemplateForShipperService.shipperContractApproved()
  }

  @UseGuards(AuthGuard)
  @Post('create')
  @UseInterceptors(
    FileInterceptor('file')
  )
  async createTemplates(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any,
    @Body('shipper_id')
    shipper_id: string,
    @Body('contract_code_id')
    contract_code_id: string,
    @Body(
      'nomination_type_id'
    )
    nomination_type_id: string,
    @Body('comment')
    comment: string
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (
      !!!file &&
      !!comment
    ) {
      const {id, message} =
        await this.uploadTemplateForShipperService.editComment(
          {
            shipper_id,
            contract_code_id,
            nomination_type_id,
            comment
          },
          req?.user?.sub,
          req
        )
      const his =
        await this.uploadTemplateForShipperService.findOnce(
          id
        )
      //
      await this.uploadTemplateForShipperService.writeReq(
        req,
        `upload-template-for-shipper`,
        message, //create | edit
        his
      )

      try {
        const nom =
          await this.prisma.upload_template_for_shipper?.findFirst(
            {
              where: {
                id: Number(id)
              },
              select: {
                id: true,
                group_id: true,
                nomination_type:
                  {
                    select: {
                      name: true
                    }
                  },
                contract_code:
                  {
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
        const message = `${nom?.nomination_type?.name} Template was editted for ${nom?.group?.name}:${nom?.contract_code?.contract_code}`
        await middleNotiInappShipper(
          this.prisma,
          'Nomination',
          message,
          // 61, // nomination menus_id
          71, // Upload template for shipper
          1,
          Number(
            nom?.group_id
          )
        )
      } catch (error) {}

      return {id, message}
    } else {
      if (
        file.mimetype !==
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
        file.mimetype !==
          'application/vnd.ms-excel'
      ) {
        throw new BadRequestException(
          'Only Excel files (xlsx or xls) are allowed.'
        )
      }

      if (
        file.buffer.length ===
        0
      ) {
        throw new Error(
          'Buffer is empty before sending to gRPC'
        )
      }
      const grpcTransform =
        await this.fileUploadService.uploadFileTempMultiSheet(
          file.buffer
        )

      if (
        !shipper_id ||
        !contract_code_id ||
        !nomination_type_id ||
        !file
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

      const {id, message} =
        await this.uploadTemplateForShipperService.createTemplates(
          grpcTransform,
          file,
          {
            shipper_id,
            contract_code_id,
            nomination_type_id,
            comment
          },
          req?.user?.sub,
          req
        )
      const his =
        await this.uploadTemplateForShipperService.findOnce(
          id
        )

      try {
        const nom =
          await this.prisma.upload_template_for_shipper?.findFirst(
            {
              where: {
                id: Number(id)
              },
              select: {
                id: true,
                group_id: true,
                nomination_type:
                  {
                    select: {
                      name: true
                    }
                  },
                contract_code:
                  {
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
        const message = `${nom?.nomination_type?.name} Template was created for ${nom?.group?.name}:${nom?.contract_code?.contract_code}`
        await middleNotiInappShipper(
          this.prisma,
          'Nomination',
          message,
          // 61, // nomination menus_id
          71, // Upload template for shipper
          1,
          Number(
            nom?.group_id
          )
        )
      } catch (error) {}

      return {id, message}
    }
  }

  @UseGuards(AuthGuard)
  @Post('edit/:id')
  @UseInterceptors(
    FileInterceptor('file')
  )
  async editTemplates(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any,
    @Body('shipper_id')
    shipper_id: string,
    @Body('contract_code_id')
    contract_code_id: string,
    @Body(
      'nomination_type_id'
    )
    nomination_type_id: string,
    @Body('comment')
    comment: string,
    @Param('id') id: any
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    // chect edit

    //     shipper_id
    // 62
    // contract_code_id
    // 15
    // nomination_type_id
    // 1
    const ids =
      (id && Number(id)) ||
      null

    if (
      !!!file &&
      !!comment
    ) {
      const {id, message} =
        await this.uploadTemplateForShipperService.editComment(
          {
            shipper_id,
            contract_code_id,
            nomination_type_id,
            comment
          },
          req?.user?.sub,
          req
        )
      const his =
        await this.uploadTemplateForShipperService.findOnce(
          id
        )
      //

      await this.uploadTemplateForShipperService.writeReq(
        req,
        `upload-template-for-shipper`,
        message, //create | edit
        his
      )

      try {
        const nom =
          await this.prisma.upload_template_for_shipper?.findFirst(
            {
              where: {
                id: Number(id)
              },
              select: {
                id: true,
                group_id: true,
                nomination_type:
                  {
                    select: {
                      name: true
                    }
                  },
                contract_code:
                  {
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
        const message = `${nom?.nomination_type?.name} Template was editted for ${nom?.group?.name}:${nom?.contract_code?.contract_code}`
        await middleNotiInappShipper(
          this.prisma,
          'Nomination',
          message,
          // 61, // nomination menus_id
          71, // Upload template for shipper
          1,
          Number(
            nom?.group_id
          )
        )
      } catch (error) {}

      return {id, message}
    } else {
      if (
        file.mimetype !==
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
        file.mimetype !==
          'application/vnd.ms-excel'
      ) {
        throw new BadRequestException(
          'Only Excel files (xlsx or xls) are allowed.'
        )
      }

      if (
        file.buffer.length ===
        0
      ) {
        throw new Error(
          'Buffer is empty before sending to gRPC'
        )
      }
      const grpcTransform =
        await this.fileUploadService.uploadFileTempMultiSheet(
          file.buffer
        )

      if (
        !shipper_id ||
        !contract_code_id ||
        !nomination_type_id ||
        !file ||
        !ids
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

      const {id, message} =
        await this.uploadTemplateForShipperService.createTemplates(
          grpcTransform,
          file,
          {
            shipper_id,
            contract_code_id,
            nomination_type_id,
            comment
          },
          req?.user?.sub,
          req,
          ids
        )
      const his =
        await this.uploadTemplateForShipperService.findOnce(
          id
        )

      // history
      await this.uploadTemplateForShipperService.writeReq(
        req,
        `upload-template-for-shipper`,
        message, //create | edit
        his
      )

      try {
        const nom =
          await this.prisma.upload_template_for_shipper?.findFirst(
            {
              where: {
                id: Number(id)
              },
              select: {
                id: true,
                group_id: true,
                nomination_type:
                  {
                    select: {
                      name: true
                    }
                  },
                contract_code:
                  {
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
        const message = `${nom?.nomination_type?.name} Template was editted for ${nom?.group?.name}:${nom?.contract_code?.contract_code}`
        await middleNotiInappShipper(
          this.prisma,
          'Nomination',
          message,
          // 61, // nomination menus_id
          71, // Upload template for shipper
          1,
          Number(
            nom?.group_id
          )
        )
      } catch (error) {}

      return {id, message}
    }
  }

  @UseGuards(AuthGuard)
  @Post('regenerate')
  async regenerate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {id} = body

    if (
      !id ||
      id.length <= 0
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
    const regenerate =
      await this.uploadTemplateForShipperService.regenerate(
        id,
        req?.user?.sub,
        req
      )

    try {
      const nom =
        await this.prisma.upload_template_for_shipper?.findMany(
          {
            where: {
              id: {
                in: id
              }
            },
            select: {
              id: true,
              group_id: true,
              nomination_type:
                {
                  select: {
                    name: true
                  }
                },
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
      for (
        let i = 0;
        i < nom.length;
        i++
      ) {
        const message = `${nom[i]?.nomination_type?.name} Template was re-generated for ${nom[i]?.group?.name}:${nom[i]?.contract_code?.contract_code}`
        await middleNotiInappShipper(
          this.prisma,
          'Nomination',
          message,
          // 61, // nomination menus_id
          71, // Upload template for shipper
          1,
          Number(
            nom[i]?.group_id
          )
        )
      }
    } catch (error) {}

    return regenerate
  }

  @Get(
    'gen-excel-template-url'
  )
  async genExcelTemplateUrl(
    @Res() res: Response,
    @Req() req: any,
    @Query() query: any
  ) {
    const {id, type} = query
    let contract_code_id =
      Number(id) //78
    let types = type //1 daily 2 weekly

    const {
      excelBuffer,
      typeOfNomination
    } =
      await this.uploadTemplateForShipperService.genExcelTemplate(
        {
          contract_code_id,
          types
        }
      )

    const uploadResponse =
      await uploadFilsTemp({
        buffer: excelBuffer,
        originalname: `${typeOfNomination}.xlsx`
      })

    return res.json(
      uploadResponse
    )
  }
}
