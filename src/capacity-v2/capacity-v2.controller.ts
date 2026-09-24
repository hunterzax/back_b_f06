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
  Res,
} from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { JwtService } from '@nestjs/jwt';
import { CapacityV2Service } from './capacity-v2.service';

import { AccountManageService } from 'src/account-manage/account-manage.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { FileUploadService } from 'src/grpc/file-service.service';
import { PathManagementService } from 'src/path-management/path-management.service';
import { emailGetpermissionEmail, emailNotificationDAM, sendEmailProviderCustomDocs } from 'src/common/utils/email';
import { PrismaService } from 'prisma/prisma.service';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

import * as isBetween from 'dayjs/plugin/isBetween'; // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'; // นำเข้า plugin isSameOrBefore
import { middleNotiInapp, middleNotiInappShipper } from 'src/common/utils/inapp.util';
import { getTodayNowAdd7 } from 'src/common/utils/date.util';
dayjs.extend(isSameOrBefore); // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween); // เปิดใช้งาน plugin isBetween
dayjs.extend(utc);
dayjs.extend(timezone);

interface MulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@Controller('capacity')
export class CapacityV2Controller {
  constructor(
    private readonly accountManageService: AccountManageService,
    private readonly capacityV2Service: CapacityV2Service,
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService,
    private readonly pathManagementService: PathManagementService,
    private prisma: PrismaService,
  ) {}
  //

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('path-capacity-request-management/upload-tranform-check')
  @UseInterceptors(FileInterceptor('file'))
  async checkAV(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (
      file.mimetype !==
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      file.mimetype !== 'application/vnd.ms-excel'
    ) {
      throw new BadRequestException(
        'Only Excel files (xlsx or xls) are allowed.',
      );
    }

    if (file.buffer.length === 0) {
      throw new Error('Buffer is empty before sending to gRPC');
    }
    const grpcTransform = await this.fileUploadService.UploadFileJSON(file.buffer); // รูปแบบ buff แบบนี้
    const fnJSONtoOBJBook = await this.capacityV2Service.fnJSONtoOBJBook(grpcTransform)
    const grpcTransformBUFF = await this.fileUploadService.UploadFileJSONBook(fnJSONtoOBJBook); // ไม่ได้
    
    const authHeader = req.headers['authorization'];
    const token = authHeader.split(' ')[1];

    let isShipperID = false
    let shipperNameOrID : string | undefined = undefined
    try {
      const resultTranform = (await JSON.parse(grpcTransform?.json_data)) || null;
      isShipperID = resultTranform?.[0]?.[0] === "Shipper ID"
      shipperNameOrID = resultTranform?.[1]?.[0]
    } catch (error) {
      isShipperID = false
      shipperNameOrID = undefined
    }

    const resData = await this.capacityV2Service.checkAV(
        grpcTransformBUFF,
        req?.user?.sub,
        file,
        token,
        isShipperID ? shipperNameOrID : undefined
      );

    return resData;
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('path-capacity-request-management/upload-tranform')
  @UseInterceptors(FileInterceptor('file'))
  async pathDetailCapacityRequestManagementTranform(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (
      file.mimetype !==
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      file.mimetype !== 'application/vnd.ms-excel'
    ) {
      throw new BadRequestException(
        'Only Excel files (xlsx or xls) are allowed.',
      );
    }

    if (file.buffer.length === 0) {
      throw new Error('Buffer is empty before sending to gRPC');
    }
    // old
    // const grpcTransform = await this.fileUploadService.uploadFile(file.buffer);
    // return (await JSON.parse(grpcTransform?.json_data))

    const grpcTransform = await this.fileUploadService.UploadFileJSON(file.buffer); // รูปแบบ buff แบบนี้
    const fnJSONtoOBJBook = await this.capacityV2Service.fnJSONtoOBJBook(grpcTransform)
    const grpcTransformBUFF = await this.fileUploadService.UploadFileJSONBook(fnJSONtoOBJBook); // ไม่ได้
    
    const authHeader = req.headers['authorization'];
    const token = authHeader.split(' ')[1];

    let isShipperID = false
    let shipperNameOrID : string | undefined = undefined
    try {
      const resultTranform = (await JSON.parse(grpcTransform?.json_data)) || null;
      isShipperID = resultTranform?.[0]?.[0] === "Shipper ID"
      shipperNameOrID = resultTranform?.[1]?.[0]
    } catch (error) {
      isShipperID = false
      shipperNameOrID = undefined
    }

    const resData =
      await this.capacityV2Service.pathDetailCapacityRequestManagementTranformNewVersion(
        grpcTransformBUFF,
        req?.user?.sub,
        file,
        token,
        isShipperID ? shipperNameOrID : undefined
      );

    // return

    const his = await this.capacityV2Service.capacityRequestManagementOnce(
      resData?.id,
    );

    try {
      
      const header = `Submit เอกสาร Contract`
      const emailNotificationData = await emailNotificationDAM(this.prisma, 1); // emailNotificationData?.subject subject: emailNotificationData?.subject || "", detail: emailNotificationData?.detail || "",
      const shipperEmailArr = await emailGetpermissionEmail(this.prisma, 49)
      const originalData = {
        cc: null,
        header: header,
        sendEmail: shipperEmailArr,
        subject: emailNotificationData?.subject || "", 
        detail: emailNotificationData?.detail || "",
        excelBuffer: null,
        tagHTMLDetail: `
        <div>
          <ul>
            <li>Contract Code: ${his?.[0]?.contract_code || ''}</li>
            <li>Contract Type: ${his?.[0]?.term_type?.name || ''}</li>
            <li>Contract Start Date: ${his?.[0]?.contract_start_date && dayjs(his?.[0]?.contract_start_date).format("YYYY-MM-DD") || ''}</li>
            <li>Contract End Date: ${his?.[0]?.contract_end_date && dayjs(his?.[0]?.contract_end_date).format("YYYY-MM-DD") || ''}</li>
          </ul>
        </div>
        `,
        filename: 'emergency_difficult_day_document.pdf',
        contentType: 'application/pdf',
      };
      await sendEmailProviderCustomDocs(originalData);

    } catch (error) {
      
    }

    try {
       // inapp
       const userType = await this.prisma.user_type.findFirst({
        where:{
          account_manage:{
            some:{
              account_id: Number(req?.user?.sub)
            }
          }
        },
        select:{
          id: true,
        }
       })
       const message = userType?.id === 3 ? `Shipper ${his?.[0]?.group?.name || ''} submitted the contract ${his?.[0]?.term_type?.name || ''} with Contract Code: ${his?.[0]?.contract_code || ''}`
       : `TSO submitted the contract ${his?.[0]?.term_type?.name || ''} for ${his?.[0]?.group?.name || ''} Shipper with Contract Code: ${his?.[0]?.contract_code || ''}`
      await middleNotiInappShipper(
            this.prisma,
            'Capacity Management',
            `${message}`,
            52, // Bulletin Board menus_id
            1, 
            his?.[0]?.group?.id,
          );
      // await middleNotiInapp(
      //       this.prisma,
      //       'Capacity Management',
      //       `${message}`,
      //       52, // Bulletin Board menus_id
      //       1, 
      //     );

    } catch (error) {
      
    }

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.booking',
        `Capacity Request Management's has been updated. Please refresh the page to see the latest changes.`,
        50, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management
        2
      )
    } catch (error) {
      
    }


    await this.pathManagementService.writeReq(
      req,
      `capacity-management`,
      `${resData?.event}`,
      his,
    );

    return resData;
  }

  // tpa website
  @UseGuards(AuthGuard)
  @Get('sync-data-with-tpa-website')
  async syncDataWithTPAWebsite(@Req() req: any) {
    // return this.capacityV2Service.syncDataWithTPAWebsite(req?.user?.sub);
    return this.capacityV2Service.syncDataWithTPAWebsite(req?.user?.sub);
  }
  // whenAddNewContract
  @Post('when-add-new-contract')
  async whenAddNewContract(@Body() body: any, @Req() req: any) {
    try {
          await this.prisma.log_tpa_website.create({
            data: {
            reqUser: !!req ? JSON.stringify(await this.capacityV2Service.useReqs(req)) : null,
            type: 'EXTERNAL-CONTRACT-REQUEST',
            value: body,
            create_date: getTodayNowAdd7().toDate(),
            create_date_num: getTodayNowAdd7().unix(),
            ...(!!req?.user?.sub && {
              create_by_account: {
                connect: {
                  id: Number(req?.user?.sub), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                },
              },
            }),
          },
          });

    const whenAddNewContract = await this.capacityV2Service.whenAddNewContract(
      body,
      process.env.SYSTEM_ACCOUNT_ID ?? 1,
      null,
      // grpcTransform,
      // req?.user?.sub,
      // file,
    );

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.booking',
        `Capacity Request Management's has been updated. Please refresh the page to see the latest changes.`,
        50, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management
        2
      )
    } catch (error) {
      
    }
    // return whenAddNewContract;
    
      // success
      return {
        status: {
          code: `S`,
          ...whenAddNewContract,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          status: {
            code: `E`,
            message: error?.response?.error
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Patch('update-status-capacity-request-management/:id')
  async updateStatusCapacityRequestManagement(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any,
  ) {
    const {
      status_capacity_request_management_id,
      terminate_date,
      shadow_time,
      shadow_period,
      reject_reasons,
    } = body;

    if (!id || !status_capacity_request_management_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (status_capacity_request_management_id === 2) {
      if (!shadow_period && shadow_period != 0) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Missing required fields',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (status_capacity_request_management_id === 3) {
      if (!reject_reasons) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Missing required fields',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (status_capacity_request_management_id === 5) {
      if (!terminate_date) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Missing required fields',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    
    let bools = true
    if(status_capacity_request_management_id === 2){
      const ckOldVersion = await this.capacityV2Service.ckOldVersion(id)
      bools = ckOldVersion
    }
    const updateStatusCapacityRequestManagement =
      await this.capacityV2Service.updateStatusCapacityRequestManagement(
        id,
        body,
        req?.user?.sub,
        req,
        bools
      );


    try {
      const his = await this.capacityV2Service.capacityRequestManagementOnce(
        id,
      );
      await this.pathManagementService.writeReq(
        req,
        `capacity-management`,
        'update status',
        his,
      );
    }
    catch (error) {
    }

    try {
       // inapp
       const contractData =
        await this.prisma.contract_code.findFirst({
          where: { id: Number(id) },
          select: {
            contract_code:true,
            booking_version:{
              where:{
                flag_use:true,
              },
              select:{
                version:true,
              }
            },
            group:{
              select:{
                id: true,
                name:true
              }
            }
          },
        });
       const statusText = status_capacity_request_management_id === 2 ? "accepted" : status_capacity_request_management_id === 3 ? "rejected" : status_capacity_request_management_id === 4 ? "confirmeded" : status_capacity_request_management_id === 5 ? "terminated" : "-"
      const message = `The Contract code ${contractData?.contract_code} version ${contractData?.booking_version?.[0]?.version} for ${contractData?.group?.name} Shipper has been ${statusText}`
     
      await middleNotiInappShipper(
            this.prisma,
            'Capacity Management',
            `${message}`,
            50, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management
            1,
            contractData?.group?.id
          );

    } catch (error) {
      
    }

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.booking',
        `Capacity Request Management's has been updated. Please refresh the page to see the latest changes.`,
        50, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management
        2
      )
    } catch (error) {
      
    }

    return updateStatusCapacityRequestManagement;
  }

  @UseGuards(AuthGuard)
  @Patch('extend-capacity-request-management/:id')
  async extendCapacityRequestManagement(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any,
  ) {
    const {
      shadow_time,
      shadow_period,
      contract_start_date,
      contract_end_date,
      // original_contract_end_date, // มันจะกลายเป็น new contract start date เคสที่กด extend หลังจากสัญญา active
    } = body;

    if (
      !id ||
      // !shadow_time ||
      // !shadow_period ||
      !contract_start_date ||
      !contract_end_date
    ) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const extendCapacityRequestManagement =
      await this.capacityV2Service.extendCapacityRequestManagement(
        id,
        body,
        req?.user?.sub,
        req,
      );

    // test ปิดก่อนเด่ียวมาเปิด
    // // inapp
    // try {
    //    const contractData = await this.prisma.contract_code.findFirst({
    //       where: {
    //         booking_version:{
    //           some:{
    //             id: Number(id),
    //           }
    //         }
    //       },
    //      include:{
    //       group:true
    //      }
    //     });
     
    //   const message = `The Contract code ${contractData?.contract_code} for ${contractData?.group?.name} Shipper has been ${extendCapacityRequestManagement?.mode_ ? "extended and generated as the new Contract Code" : "updated to version"}`
    //   await middleNotiInappShipper(
    //         this.prisma,
    //         'Capacity Management',
    //         `${message}`,
    //         49, // Bulletin Board menus_id
    //         1, 
    //         contractData?.group?.id,
    //       );

    // } catch (error) {
      
    // }

    // // tell frontend to refresh waitinglist
    // try {
    //   middleNotiInapp(
    //     this.prisma,
    //     'waitinglist.booking',
    //     `Capacity Request Management's has been updated. Please refresh the page to see the latest changes.`,
    //     50, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management
    //     2
    //   )
    // } catch (error) {
      
    // }

    return extendCapacityRequestManagement;
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('edit-version/:id')
  async editVersion(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { booking_full_json, booking_row_json } = body;
    if (
      !id ||
      !booking_full_json ||
      booking_full_json.length === 0 ||
      !booking_row_json ||
      booking_row_json.length === 0
    ) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const editVersion = await this.capacityV2Service.editVersion(
      body,
      id,
      req?.user?.sub,
    );

    // inapp
    try {
       const contractData = await this.prisma.contract_code.findFirst({
          where: {
            booking_version:{
              some:{
                id: Number(id),
              }
            }
          },
         include:{
          group:true
         }
        });
     
      const message = `The Contract code ${contractData?.contract_code} for ${contractData?.group?.name} Shipper has been amended and generated as the new Contract Code`
      // await middleNotiInapp(
      //       this.prisma,
      //       'Capacity Management',
      //       `${message}`,
      //       49, // menus_id | 49 Capacity Contract Management
      //       1,
      //     );
      await middleNotiInappShipper(
            this.prisma,
            'Capacity Management',
            `${message}`,
            49, // Bulletin Board menus_id
            1, 
            contractData?.group?.id,
          );

    } catch (error) {
      
    }

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.booking',
        `Capacity Request Management's has been updated. Please refresh the page to see the latest changes.`,
        50, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management
        2
      )
    } catch (error) {
      
    }

    return editVersion;
  }

  // @UseGuards(AuthGuard)
  @Get('capacity-request-management-download/:id')
  async capacityRequestManagementDownload(
    @Param('id') id: any,
    @Res() res: Response,
    //  @Req() req: any
  ) {
    const { excelBuffer, typeOfContract } =
      await this.capacityV2Service.capacityRequestManagementDownload(id);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${typeOfContract}.xlsx`,
    );

    // ส่ง buffer กลับใน response
    res.send(excelBuffer);
  }

  @Get('capacity-request-management-download-summary/:id')
  async capacityRequestManagementDownloadSummary(
    @Param('id') id: any,
    @Res() res: Response,
    //  @Req() req: any
  ) {
    const { excelBuffer, typeOfContract } =
      await this.capacityV2Service.capacityRequestManagementDownloadSummary(id);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${typeOfContract}.xlsx`,
    );

    // ส่ง buffer กลับใน response
    res.send(excelBuffer);
  }

  @UseGuards(AuthGuard)
  @Get('capacity-detail-period')
  getPeriod(@Query() query: any) {
    const { id } = query;
    return this.capacityV2Service.getPeriod(id);
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('duplicate-version/:id')
  async duplicateVersion(
    @Body() body: any,
    @Param('id') id: any,
    @Req() req: any,
  ) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const duplicateVersion = await this.capacityV2Service.duplicateVersion(
      id,
      req?.user?.sub,
    );

    // inapp
    try {
       const contractData = await this.prisma.contract_code.findFirst({
          where: {
            booking_version:{
              some:{
                id: Number(id),
              }
            }
          },
         include:{
          group:true
         }
        });
     
      const message = `The Contract code ${contractData?.contract_code} for ${contractData?.group?.name} Shipper has been updated to version`
      // await middleNotiInapp(
      //       this.prisma,
      //       'Capacity Management',
      //       `${message}`,
      //       49, // menus_id | 49 Capacity Contract Management
      //       1,
      //     );
      await middleNotiInappShipper(
            this.prisma,
            'Capacity Management',
            `${message}`,
            49, // Bulletin Board menus_id
            1, 
            contractData?.group?.id,
          );

    } catch (error) {
      
    }

    return duplicateVersion;
  }

  @UseGuards(AuthGuard)
  @Get('lastest-code-by-year')
  getLastestCodeByYear(@Query() query: any, @Req() req: any) {
    return this.capacityV2Service.getLastestCodeByYear(query, req?.user?.sub);
  }
}
