import {Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpException, HttpStatus, Put, UseGuards, Req, HttpCode, Res, UseInterceptors, UploadedFile, BadRequestException, OnModuleInit, Inject} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'

import {AllocationService} from './allocation.service'
import {CapacityService} from 'src/capacity/capacity.service'
import {FileInterceptor} from '@nestjs/platform-express'
import {FileUploadService} from 'src/grpc/file-service.service'
import {Observable, ReplaySubject, Subject} from 'rxjs'
import {ClientGrpc, GrpcMethod, GrpcStreamMethod} from '@nestjs/microservices'
import {uploadFilsTemp} from 'src/common/utils/uploadFileIn'
import {MeteringManagementService} from 'src/metering-management/metering-management.service'
import {getTodayStartAdd7} from 'src/common/utils/date.util'
import {parseToNumber} from 'src/common/utils/number.util'
import {middleNotiInapp, middleNotiInappShipper, middleNotiInappShipperMulti} from 'src/common/utils/inapp.util'
import {PrismaService} from 'prisma/prisma.service'
import {emailGetpermissionEmail, emailGetpermissionEmailByGroupName, emailNotificationDAM, sendEmailProviderCustomDocs} from 'src/common/utils/email'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

interface ExampleService {
  getData(data: {param: string}): Observable<{
    data: string
  }>
  sendData?(data: {param: string}): Observable<{
    data: string
  }>
}

@Controller('allocation')
export class AllocationController implements OnModuleInit {
  private exampleService: ExampleService
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly accountManageService: AccountManageService,
    private readonly fileUploadService: FileUploadService,
    private readonly meteringManagementService: MeteringManagementService,
    @Inject('EXAMPLE_SERVICE')
    private readonly client: ClientGrpc
  ) {}

  onModuleInit() {
    this.exampleService = this.client.getService<ExampleService>('ExampleService')
  }

  @GrpcMethod('ExampleService')
  sendData(data: {param: string}): {data: string} {
    if (data?.param == 'execute allo&bal') {
      const today = getTodayStartAdd7().tz('Asia/Bangkok').format('YYYY-MM-DD')
      this.meteringManagementService
        .procressMetered2(
          {
            startDate: today,
            endDate: today
          },
          null
        )
        .then((res: any) => {
          const executeData = this.allocationService.executeData(
            {
              menu: 'Automatic execution'
            },
            null
          )
        })
        .catch((err: any) => {
          const executeData = this.allocationService.executeData(
            {
              menu: 'Automatic execution'
            },
            null
          )
        })
      return {
        data: 'Executed'
      }
    } else if (data?.param?.includes('update_execute_status')) {
      let payload = null
      try {
        payload = JSON.parse(data.param.replace('update_execute_status:', ''))
      } catch (error) {
        payload = null
      }
      const updateExecuteStatus = this.meteringManagementService.updateExecuteStatus(payload, null)
      return {
        data: 'Update Execute Status'
      }
    } else {
      return {
        data: 'Failed. Please try again.'
      }
    }
  }

  @GrpcStreamMethod('ExampleService')
  getData(data: {param: string}): {data: string} {
    return {
      data: 'Failed. Please try again.'
    }
  }

  @Get('execute-meter-allo-bal')
  executeAlloAndBal(@Query() query: any) {
    const {nDaysAgo, lookbackPeriod} = query
    const today = getTodayStartAdd7()
    let maxExecuteDate = today
    let minExecuteDate = today
    if (nDaysAgo) {
      maxExecuteDate = today.subtract(parseToNumber(nDaysAgo) ?? 0, 'day')
    }
    if (lookbackPeriod) {
      minExecuteDate = maxExecuteDate.subtract(parseToNumber(lookbackPeriod) ?? 0, 'day')
    }

    this.meteringManagementService
      .procressMetered2(
        {
          startDate: minExecuteDate.tz('Asia/Bangkok').format('YYYY-MM-DD'),
          endDate: maxExecuteDate.tz('Asia/Bangkok').format('YYYY-MM-DD')
        },
        null
      )
      .then((res: any) => {
        const executeData = this.allocationService.executeData(
          {
            menu: 'Automatic execution'
          },
          null
        )
      })
      .catch((err: any) => {
        const executeData = this.allocationService.executeData(
          {
            menu: 'Automatic execution'
          },
          null
        )
      })
    return {data: 'Executed'}
  }

  // @UseGuards(AuthGuard)
  @Get('allocation-status')
  allocationStatusMaster() {
    return this.allocationService.allocationStatusMaster()
  }

  @UseGuards(AuthGuard)
  @Get('allocation-review')
  allocationReview(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit} = query

    // return this.allocationService.allocationManagement(query, req?.user?.sub);
    // return this.allocationService.allocationManagementNewReview(
    return this.allocationService.allocationManagement2(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('allocation-review-shipper-data')
  allocationReviewShipperData(@Query() query: any, @Req() req: any) {
    return this.allocationService.allocationReviewShipperData(query, req?.user?.sub)
  }

  // {{API_URL}}/master/allocation/allocation-management?start_date=2025-01-01&end_date=2025-02-28&skip=100&limit=100
  @UseGuards(AuthGuard)
  @Get('allocation-management')
  allocationManagement(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit} = query

    // return this.allocationService.allocationManagementNew(
    //   query,
    //   req?.user?.sub,
    // );
    return this.allocationService.allocationManagement2(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Patch('shipper-allocation-review/:id')
  async shipperAllocationReview(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {shipper_allocation_review, comment, row_data} = body

    if (!id || !shipper_allocation_review || !row_data) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const shipperAllocationReview = await this.allocationService.shipperAllocationReview(id, body, req?.user?.sub)
    const createByOnce = await this.allocationService.createByOnce(req?.user?.sub)

    // const his = await this.allocationService.findOnce(id);
    // create/update date

    //  "systemAllocation": 43805.7405,
    // "intradaySystem": 43805.741,
    // "previousAllocationTPAforReview": 43805.7405,

    const {id: ids, ...TempDatas} = shipperAllocationReview

    try {
      const allocation = await this.prisma.allocation_management.findFirst({
        where: {
          id: Number(id)
        },
        select: {
          review_code: true,
          gas_day_text: true,
          shipper_name_text: true,
          contract_code_text: true
        }
      })

      const group_ = await this.prisma.group.findFirst({
        where: {
          id_name: allocation?.shipper_name_text
        },
        select: {
          id: true,
          name: true
        }
      })
      if (group_ && allocation) {
        const message = `The allocation for ${allocation?.gas_day_text}, ${allocation?.contract_code_text} has been reviewed by shipper  (Review Code: ${allocation?.review_code}).`
        await middleNotiInappShipper(
          this.prisma,
          'Allocation',
          message,
          81, // menus_id Allocation 80 | Allocation Review 81 | Allocation Query 83 | Allocation Report 84 | Curtailments Allocation Report 85 | Allocation Monthly Report 86 | Vent/Commissioning/Other Gas 88
          1,
          group_?.id
        )
      }
    } catch (error) {}

    try {
      await this.allocationService.writeReq(req, `allocation-review`, 'shipper-allocation-review', {
        id: Number(id),
        create: createByOnce,
        // ...body,
        shipper_allocation_review: body?.shipper_allocation_review || null,
        comment: body?.comment || null,
        systemAllocation: body?.row_data?.systemAllocation || null,
        intradaySystem: body?.row_data?.intradaySystem || null,
        previousAllocationTPAforReview: body?.row_data?.previousAllocationTPAforReview || null,
        ...TempDatas
        // "allocation_status": {
        //     "id": 2,
        //     "name": "Shipper Reviewed",
        //     "color": "#D0E5FD"
        // },
      })
      await this.allocationService.writeReq(req, `allocation-manage`, 'shipper-allocation-review', {
        id: Number(id),
        create: createByOnce,
        // ...body,
        shipper_allocation_review: body?.shipper_allocation_review || null,
        comment: body?.comment || null,
        systemAllocation: body?.row_data?.systemAllocation || null,
        intradaySystem: body?.row_data?.intradaySystem || null,
        previousAllocationTPAforReview: body?.row_data?.previousAllocationTPAforReview || null,
        ...TempDatas
        // "allocation_status": {
        //     "id": 2,
        //     "name": "Shipper Reviewed",
        //     "color": "#D0E5FD"
        // },
      })
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.allocation',
        `Allocation has been updated. Please refresh the page to see the latest changes.`,
        81, // menus_id Allocation 80 | Allocation Review 81 | Allocation Query 83 | Allocation Report 84 | Curtailments Allocation Report 85 | Allocation Monthly Report 86 | Vent/Commissioning/Other Gas 88
        2
      )
    } catch (error) {
    }

    return shipperAllocationReview
  }

  @UseGuards(AuthGuard)
  @Patch('allocation-manage-change-status')
  async allocationManageChangeStatus(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {status, comment, rowArray} = body

    if (!status || !rowArray) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const allocationManageChangeStatus = await this.allocationService.allocationManageChangeStatus(body, req?.user?.sub)
    const createByOnce = await this.allocationService.createByOnce(req?.user?.sub)
    // const his = await this.allocationService.findOnce(id);
    // create/update date

    // req?.user?.sub

    const findStatus = await this.allocationStatusMaster()
    const fn = findStatus?.find((f: any) => f?.id === status)

    const contractCode = await this.prisma.contract_code.findMany({
      select: {
        contract_code: true,
        term_type_id: true,
        term_type: {
          select: {
            name: true
          }
        }
      }
    })

    for (let i = 0; i < rowArray.length; i++) {
      await this.allocationService.writeReq(req, `allocation-manage`, 'change-status', {
        status: fn?.id,
        comment,
        create: createByOnce,
        ...rowArray[i],
        allocation_status: fn
      })
      await this.allocationService.writeReq(req, `allocation-review`, 'shipper-allocation-review', {
        status: fn?.id,
        comment,
        create: createByOnce,
        ...rowArray[i],
        allocation_status: fn
      })

      try {
        const fcontractCode = contractCode?.find((f: any) => f?.contract_code === rowArray[i]?.contract)
        const header = status === 3 ? `TSO accepts the shipper` : `TSO rejects the shipper`
        const statusInapp = status === 3 ? `accepted` : `rejected`
        const emailNotificationData = await emailNotificationDAM(this.prisma, status === 3 ? 18 : 19) // emailNotificationData?.subject subject: emailNotificationData?.subject || "", detail: emailNotificationData?.detail || "",
        // const shipperEmailArr = await emailGetpermissionEmail(this.prisma, 44)
        const shipperEmailArr = await emailGetpermissionEmailByGroupName(this.prisma, 80, rowArray[i]?.shipper_name_text || rowArray[i]?.shipper)
        const originalData = {
          cc: null,
          header: header,
          sendEmail: shipperEmailArr,
          subject: emailNotificationData?.subject || '',
          detail: emailNotificationData?.detail || '',
          excelBuffer: null,
          tagHTMLDetail: `
           <div>
             <ul>
               <li>Contract Code: ${rowArray[i]?.contract_code_text || '-'}</li>
               <li>Contract type: ${fcontractCode?.term_type?.name || '-'}</li>
               <li>Gas Day: ${rowArray[i]?.gas_day || '-'}</li>
               <li>Allocation Reviewed: ${rowArray[i]?.review_code || '-'}</li>
             </ul>
           </div>
               `,
          filename: 'emergency_difficult_day_document.pdf',
          contentType: 'application/pdf'
        }
        await sendEmailProviderCustomDocs(originalData)
        //  statusInapp

        const shipperId = await this.prisma.group.findFirst({
          where: {
            id_name: rowArray[i]?.shipper_name_text || rowArray[i]?.shipper
          },
          select: {
            id: true
          }
        })
        const message = `Reviewed Allocation was ${statusInapp} for ${rowArray[i]?.shipper_name_text || rowArray[i]?.shipper}:${rowArray[i]?.contract} on ${rowArray[i]?.gas_day} by operator`
        await middleNotiInappShipper(
          this.prisma,
          'Allocation',
          message,
          80, // menus_id Allocation 80 | Allocation Review 81 | Allocation Query 83 | Allocation Report 84 | Curtailments Allocation Report 85 | Allocation Monthly Report 86 | Vent/Commissioning/Other Gas 88
          1,
          shipperId?.id
        )
      } catch (error) {}

      // inapp
      // try {
      //   const zoneText = doc8Edit?.event_doc_ofo_gas_tranmiss ?
      //                                                 doc8Edit?.event_doc_ofo_gas_tranmiss?.name == "Onshore East" ? 'East'
      //                                                     : doc8Edit?.event_doc_ofo_gas_tranmiss?.name == "Onshore West" ? 'West'
      //                                                         : doc8Edit?.event_doc_ofo_gas_tranmiss?.name == "Onshore East - West" ? 'East - West'
      //                                                             : 'Other'
      //                                                 : ''
      //     // tso create
      //     const message = `TSO updated the OF/IF Doc 8 of ${doc8Edit?.event_doc_ofo_type?.name_en} ${zoneText} Zone on ${dayjs(doc8Edit?.event_date).format("DD/MM/YYYY")} (Event code: ${doc8Edit?.event_nember}).`
      //     await middleNotiInappShipperMulti(
      //       this.prisma,
      //       'Event',
      //       message,
      //       1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //       1,
      //       doc8Edit?.event_document_ofo?.filter((f:any) => f?.user_type_id === 3 && f?.event_doc_master_id === 8)?.map((e:any) => e?.group_id)
      //     );

      // } catch (error) { }
    }

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.allocation',
        `Allocation has been updated. Please refresh the page to see the latest changes.`,
        80, // menus_id Allocation 80 | Allocation Review 81 | Allocation Query 83 | Allocation Report 84 | Curtailments Allocation Report 85 | Allocation Monthly Report 86 | Vent/Commissioning/Other Gas 88
        2
      )
    } catch (error) {
    }

    return allocationManageChangeStatus
  }

  @UseGuards(AuthGuard)
  @Patch('allocation-manage-change-status-validate')
  async allocationManageChangeStatusValidate(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const {status, comment, rowArray} = body

    if (!status || !rowArray) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const changeStatusValidate = await this.allocationService.allocationManageChangeStatusValidate(body, req?.user?.sub)

    return changeStatusValidate
  }

  @UseGuards(AuthGuard)
  @Post('execute-data')
  async executeData(@Body() body: any, @Req() req: any) {
    const {} = body

    const executeData = await this.allocationService.executeData(body, req?.user?.sub)

    return executeData
  }

  // versionExe
  @UseGuards(AuthGuard)
  @Get('version-exe')
  versionExe(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit} = query

    return this.allocationService.versionExe(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('allocation-query')
  allocationQuery(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit} = query

    // return this.allocationService.allocationQuery(query, req?.user?.sub)
    return this.allocationService.allocationQueryFromAllocationReport(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('allocation-query-version')
  allocationQueryVersion(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit} = query

    return this.allocationService.allocationQueryVersion(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('allocation-report')
  allocationReport(@Query() query: any, @Req() req: any) {
    return this.allocationService.allocationReport(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('allocation-report-view')
  allocationReportView(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit} = query

    return this.allocationService.allocationReportView(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('publication-center')
  publicationCenter(@Query() query: any, @Req() req: any) {
    return this.allocationService.publicationCenter(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('publication-center')
  async publicationCenterGen(@Body() body: any, @Req() req: any) {
    const {execute_timestamp, gas_day} = body

    if (!execute_timestamp || !gas_day) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const publicationCenterGen = await this.allocationService.publicationCenterGen(body, req?.user?.sub)
    // const createByOnce = await this.allocationService.createByOnce(req?.user?.sub);

    // const his = await this.allocationService.findOnce(id);
    // create/update date
    // await this.allocationService.writeReq(
    //   req,
    //   `allocation-review`,
    //   'shipper-allocation-review',
    //   { id: Number(id),  create:createByOnce, ...body },
    // );

    return publicationCenterGen
  }

  // template
  // http://10.100.101.15:8010/master/allocation/gen-excel-template-url?contract_code_name=2016-CLF-001&shipper_code=NGP-S01-001
  @Get('gen-excel-template-url')
  async genExcelTemplateUrl(@Res() res: any, @Req() req: any, @Query() query: any) {
    const {contract_code_name, shipper_code} = query

    const {excelBuffer, nameFile} = await this.allocationService.genExcelTemplate({
      contract_code_name,
      shipper_code
    })

    // res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // res.setHeader('Content-Disposition', `attachment; filename=${nameFile}.xlsx`);
    // res.send(excelBuffer);

    //   2. อัปโหลดไฟล์ไปยัง API อัปโหลด
    const uploadResponse = await uploadFilsTemp({
      buffer: excelBuffer,
      originalname: `${nameFile}.xlsx`
    })

    return res.json(uploadResponse)
  }

  // allocation-review-import
  @UseGuards(AuthGuard)
  @Post('allocation-review-import')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any,
    // @Body('comment') comment: string,
    // @Body('tabType') tabType: string,
    @Query() query: any
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && file.mimetype !== 'application/vnd.ms-excel') {
      throw new BadRequestException('Only Excel files (xlsx or xls) are allowed.')
    }

    if (file.buffer.length === 0) {
      throw new Error('Buffer is empty before sending to gRPC')
    }
    // ส่ง buffer ไปยัง gRPC
    const grpcTransform:any = await this.fileUploadService.uploadFileTempMultiSheet(file.buffer)
    // console.log('grpcTransform : ', grpcTransform);
    // console.log('grpcTransform : ', JSON.parse(grpcTransform?.jsonDataMultiSheet));
    // return null

    if (!file) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const {ignore} = query

    const uploadFile = await this.allocationService.uploadFile(grpcTransform, file, req?.user?.sub, req, ignore?.trim()?.toLowerCase() === 'true')

    try {
      const group_ = await this.prisma.group.findFirst({
        where: {
          id_name: uploadFile?.data?.dataDb?.[0]?.shipperIdSheet
        },
        select: {
          id: true,
          name: true
        }
      })
      if (group_ && uploadFile?.data?.dataDb?.length > 0) {
        const message = `The allocation for ${uploadFile?.data?.dateArr?.[0]} to ${uploadFile?.data?.dateArr?.[uploadFile?.data?.dateArr?.length - 1]}, ${uploadFile?.data?.dataDb?.[0]?.contractCodeSheet} has been reviewed by shipper.`
        await middleNotiInappShipper(
          this.prisma,
          'Allocation',
          message,
          81, // menus_id Allocation 80 | Allocation Review 81 | Allocation Query 83 | Allocation Report 84 | Curtailments Allocation Report 85 | Allocation Monthly Report 86 | Vent/Commissioning/Other Gas 88
          1,
          group_?.id
        )
      }
    } catch (error) {}

    try {
      if (uploadFile?.warning?.length === 0) {
        const createByOnce = await this.allocationService.createByOnce(req?.user?.sub)

        const findStatus = await this.allocationStatusMaster()

        for (let i = 0; i < uploadFile?.data?.dataDb.length; i++) {
          const findId = await this.prisma.allocation_management?.findFirst({
            where: {
              id: uploadFile?.data?.dataDb[i]?.id
            }
          })
          const fn = findStatus?.find((f: any) => f?.id === findId?.allocation_status_id)

          await this.allocationService.writeReq(
            req,
            `allocation-manage`,
            'shipper-allocation-review-upload',
            {
              shipper_allocation_review: parseToNumber(uploadFile?.data?.dataDb[i]?.value),
              systemAllocation: uploadFile?.data?.dataDb[i]?.system_allocation,
              previousAllocationTPAforReview: uploadFile?.data?.dataDb[i]?.previous_value,
              status: fn?.id,
              create: createByOnce,
              ...uploadFile?.data?.dataDb[i],
              allocation_status: fn
            }
            // { status: fn?.id, comment, create: createByOnce, ...rowArray[i], allocation_status: fn },
          )
          await this.allocationService.writeReq(
            req,
            `allocation-review`,
            'shipper-allocation-review-upload',
            {
              shipper_allocation_review: parseToNumber(uploadFile?.data?.dataDb[i]?.value),
              systemAllocation: uploadFile?.data?.dataDb[i]?.system_allocation,
              previousAllocationTPAforReview: uploadFile?.data?.dataDb[i]?.previous_value,
              status: fn?.id,
              create: createByOnce,
              ...uploadFile?.data?.dataDb[i],
              allocation_status: fn
            }
            // { status: fn?.id, comment, create: createByOnce, ...rowArray[i], allocation_status: fn },
          )
        }
      }
    } catch (error) {}

    return uploadFile
  }

  @UseGuards(AuthGuard)
  @Get('monthly-report-version-exe')
  allocationMonthlyVersionExe(@Query() query: any, @Req() req: any) {
    const {shipperId, month, year} = query

    if (!month || !year) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return this.allocationService.allocationMonthlyVersionExe(query, req?.user?.sub)
  }

  // ...
  @UseGuards(AuthGuard)
  @Get('allocation-monthly-report')
  allocationMonthlyReport(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit, shipperId, month, year, version, contractCode} = query

    if (!month || !year) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return this.allocationService.allocationMonthlyReport(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('allocation-monthly-report-approved')
  async allocationMonthlyReportApproved(@Query() query: any, @Req() req: any) {
    const {start_date, end_date, skip, limit, shipperId, month, year, version, contractCode} = query

    if (!month || !year) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const allocationService = await this.allocationService.allocationMonthlyReportApproved(query, req?.user?.sub)

    // inapp
    try {
      const userType = await this.prisma.user_type.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub)
            }
          }
        },
        select: {
          id: true
        }
      })
      const message = userType?.id === 3 ? `Approved Allocation Shipper Report from Gas Day ${dayjs(month, 'MM').format('MMM')}` : `Approved Allocation Monthly Report on ${dayjs(month, 'MM').format('MMM')} for {All contract, Contract Code: xxx}`
      // const message = `Approved Balancing Monthly Report on ${dayjs(month, "MM").format("MMM")}`
      await middleNotiInapp(
        this.prisma,
        'Allocation',
        `${message}`,
        86, // menus_id | 86 Allocation Monthly Report
        1
      )
    } catch (error) {}

    return allocationService
  }

  @UseGuards(AuthGuard)
  @Get('allocation-monthly-report-download')
  allocationMonthlyReportDownload(@Req() req: any) {
    return this.allocationService.allocationMonthlyReportDownload()
  }

  @UseGuards(AuthGuard)
  @Patch('allocation-monthly-report-download/:id')
  allocationMonthlyReportDownloadUse(@Res() res: Response, @Param('id') id: any, @Req() req: any) {
    return this.allocationService.allocationMonthlyReportDownloadUse(res, id, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('curtailments-allocation')
  curtailmentsAllocation(@Query() query: any, @Req() req: any) {
    return this.allocationService.curtailmentsAllocation(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('curtailments-allocation-get-max-cap')
  curtailmentsAllocationGetMaxCap(@Query() query: any, @Req() req: any) {
    return this.allocationService.curtailmentsAllocationGetMaxCap(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('curtailments-allocation-calc')
  curtailmentsAllocationCalc(@Query() query: any, @Req() req: any) {
    return this.allocationService.curtailmentsAllocationCalc(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('select-nomination')
  selectNomination(@Query() query: any, @Req() req: any) {
    return this.allocationService.selectNomination(query, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('curtailments-allocation-calc-save')
  async curtailmentsAllocationCalcSave(@Body() body: any, @Req() req: any) {
    const {gasDay, area, nominationPoint, unit, type, maxCapacity} = body

    if (!gasDay || !area || !type || !maxCapacity || !unit) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const curtailmentsAllocationCalcSave = await this.allocationService.curtailmentsAllocationCalcSave(body, req?.user?.sub)
    // const createByOnce = await this.allocationService.createByOnce(req?.user?.sub);

    // const his = await this.allocationService.findOnce(id);
    // create/update date
    // await this.allocationService.writeReq(
    //   req,
    //   `allocation-review`,
    //   'shipper-allocation-review',
    //   { id: Number(id),  create:createByOnce, ...body },
    // );

    return curtailmentsAllocationCalcSave
  }

  @UseGuards(AuthGuard)
  @Post('allocation-shipper-report')
  allocationShipperReport(@Body() body: any, @Req() req: any) {
    const {start_date, end_date, skip, limit, nomination_point_arr, shipper_arr, share} = body

    return this.allocationService.allocationShipperReportCallOnlyByNomination({...body, tab: '1'}, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('allocation-shipper-report-download')
  allocationShipperReportDownload(@Body() body: any, @Req() req: any) {
    const {start_date, end_date, skip, limit, nomination_point_arr, shipper_arr, share} = body

    return this.allocationService.allocationShipperReportDownload({...body, tab: '1'}, req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('allocation-shipper-report-download-get')
  allocationShipperReportDownloadGet(@Query() query: any, @Req() req: any) {
    return this.allocationService.allocationShipperReportDownloadGet()
  }

  // test
  @Get('testMeterOnce')
  testMeterOnce() {
    return this.allocationService.testMeterOnce()
  }

  @UseGuards(AuthGuard)
  @Get('allocation-management/send-email')
  allocationManagementSendEmailGet(@Req() req: any) {
    return this.allocationService.allocationManagementSendEmailGet(req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('allocation-management/send-email')
  allocationManagementSendEmail(@Body() body: any, @Req() req: any) {
    return this.allocationService.allocationManagementSendEmail(body, req?.user?.sub)
  }

  // @UseGuards(AuthGuard)
  @Post('execute-noti-inapp')
  executeNotiInapp(@Body() body: any, @Req() req: any) {
    return this.allocationService.executeNotiInapp(
      body
      // req?.user?.sub,
    )
  }
}
