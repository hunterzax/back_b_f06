import {Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, HttpException, HttpStatus, Put, Query, Res} from '@nestjs/common'
import {EventService} from './event.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {middleNotiInapp, middleNotiInappShipper, middleNotiInappShipperMulti, middleNotiInappTSOonly} from 'src/common/utils/inapp.util'
import {PrismaService} from 'prisma/prisma.service'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {emailGetpermissionEmail, emailNotificationDAM, sendEmailProviderCustomDocs} from 'src/common/utils/email'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)

@Controller('event')
export class EventController {
  constructor(
    private readonly eventService: EventService,
    private prisma: PrismaService
  ) {}

  @Get('event-status')
  eventStatus() {
    return this.eventService.eventStatus()
  }

  @Get('event-doc-status')
  eventDocStatus() {
    return this.eventService.eventDocStatus()
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas')
  offspecGasAll(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.eventService.offspecGasAll(query, userId)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Patch('offspec-gas/:id')
  async updateStatus(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_status_id} = body

    if (!id || !event_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const updateStatus = await this.eventService.updateStatus(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas`, 'update-status', updateStatus)

    // inapp
    try {
      const message = `Off-Spec Gas on ${dayjs(updateStatus?.event_date).format('DD/MM/YYYY')} has been validated and closed by TSO (Event code: ${updateStatus?.event_nember}).`
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        updateStatus?.event_document?.filter((f: any) => f?.user_type_id === 3)?.map((e: any) => e?.group_id)
      )

      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return updateStatus
  }

  // doc 1

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc1/pdf/:id')
  doc1PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc1PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc1/:id')
  doc1Find(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc1Find(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc1/history/:id')
  doc1History(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc1History(id, userId)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('offspec-gas/doc1')
  async doc1Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const changeModeZoneBaseInventoryCreate = await this.eventService.doc1Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas/doc1`, 'create', changeModeZoneBaseInventoryCreate)
    // inapp
    try {
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub)
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const message = `Shipper ${shipperData?.name} reported Off-Spec Gas Doc 1 at ${changeModeZoneBaseInventoryCreate?.document1?.input_delivery_point_at_the_scene || ''} Quality Point on ${dayjs(changeModeZoneBaseInventoryCreate?.event_date).format('DD/MM/YYYY')} (Event code: ${changeModeZoneBaseInventoryCreate?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        Number(shipperData?.id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return changeModeZoneBaseInventoryCreate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('offspec-gas/doc1/:id')
  async doc1Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const changeModeZoneBaseInventoryAction = await this.eventService.doc1Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas/doc1`, 'action', changeModeZoneBaseInventoryAction)

    // inapp
    try {
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(changeModeZoneBaseInventoryAction?.create_by) // shipper create
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const message = `TSO ${messageStatus} the Off-Spec Gas Doc 1 at ${changeModeZoneBaseInventoryAction?.document1?.input_delivery_point_at_the_scene || ''} Quality Point on ${dayjs(changeModeZoneBaseInventoryAction?.event_date).format('DD/MM/YYYY')} (Event code: ${changeModeZoneBaseInventoryAction?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        Number(shipperData?.id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return changeModeZoneBaseInventoryAction
  }

  // doc 2

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc2/ref-doc-use')
  doc2RefDocUsed(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc2RefDocUsed(userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc2/email-group-for-event')
  doc2EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc2EmailGroupForEvent(userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc2/shipper')
  doc2Shipper(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc2Shipper(userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc2/pdf/:id')
  doc2PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    // const userId = 99988; //tso 56
    // const userId = 99989; //shipper doc 57
    // const userId = 76; //shipper doc 58
    // const userId = 63;
    return this.eventService.doc2PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc2/pdf/tsoview/:id')
  doc2PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {userId, shipperId} = query
    const userIds = Number(userId)
    const shipperIds = Number(shipperId)
    // const userId = null
    // const userId = req?.user?.sub;
    // const userId = 99988; //tso 79
    // const userId = 0; //shipper doc 78
    return this.eventService.doc2PDF(id, userIds, res, shipperIds)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc2/:id')
  doc2Find(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc2Find(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc2/history/:id')
  doc2History(@Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {tso} = query
    const userId = req?.user?.sub
    //  tso ส่ง id runnumber
    return this.eventService.doc2History(id, userId, tso)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('offspec-gas/doc2')
  async doc2Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc2Create = await this.eventService.doc2Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas/doc2`, 'create', doc2Create)

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
      if (userType?.id === 3) {
        // shipper create
        const shipperData = await this.prisma.group.findFirst({
          where: {
            account_manage: {
              some: {
                account_id: Number(req?.user?.sub)
              }
            }
          },
          select: {
            id: true,
            name: true,
            company_name: true
          }
        })
        // const messageStatus = event_doc_status_id === 3 ? "accepted" : event_doc_status_id === 4 ? "rejected" : event_doc_status_id === 5 ? "acknowledged" : "-"
        const message = `Shipper ${shipperData?.name} created the Off-Spec Gas Doc 2 at ${doc2Create?.document1?.doc2_input_delivery_point_at_the_scene || ''} Quality Point on ${dayjs(doc2Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc2Create?.event_nember}).`
        await middleNotiInappShipper(
          this.prisma,
          'Event',
          message,
          107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
          1,
          Number(shipperData?.id)
        )
      } else {
        // tso create
        const message = `TSO created the Off-Spec Gas Doc 2 at ${doc2Create?.document1?.doc2_input_delivery_point_at_the_scene || ''} Quality Point on ${dayjs(doc2Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc2Create?.event_nember}).`
        // middleNotiInappShipperMulti
        // doc2Create?.document2?.map((e:any) => e?.group_id)
        await middleNotiInappShipperMulti(
          this.prisma,
          'Event',
          message,
          107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
          1,
          doc2Create?.event_document?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 2)?.map((e: any) => e?.group_id)
        )
        // await middleNotiInappTSOonly(
        //   this.prisma,
        //   'Event',
        //   message,
        //   107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        //   1,
        // );
        // shipper add
      }
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc2Create
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('offspec-gas/doc2/edit/:id')
  async doc2Edit(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc2Edit = await this.eventService.doc2Edit(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas/doc2`, 'edit', doc2Edit)

    // inapp
    try {
      const message = `TSO updated the Off-Spec Gas Doc 2 at ${doc2Edit?.document1?.doc2_input_delivery_point_at_the_scene || ''} Quality Point on ${dayjs(doc2Edit?.event_date).format('DD/MM/YYYY')} (Event code: ${doc2Edit?.event_nember}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc2Edit?.event_document?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 2)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc2Edit
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('offspec-gas/doc2/:id')
  async doc2Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const actions = await this.eventService.doc2Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas/doc3`, 'action', actions)

    // inapp
    try {
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub) // shipper action
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const message = `Shipper ${shipperData?.name} ${messageStatus} the Off-Spec Gas Doc 2 at ${actions?.document1?.doc2_input_delivery_point_at_the_scene || ''} Quality Point on ${dayjs(actions?.event_date).format('DD/MM/YYYY')} (Event code: ${actions?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        shipperData?.id
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return actions
  }

  // doc 3

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc3/ref-doc-use')
  doc3RefDocUsed(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc3RefDocUsed(userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc3/ref-doc-use-all')
  doc3RefDocUsedAll(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc3RefDocUsedAll(userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc3/email-group-for-event')
  doc3EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc3EmailGroupForEvent(userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc3/shipper')
  doc3Shipper(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc3Shipper(userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc3/pdf/:id')
  doc3PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    // const userId = 99988; //tso 79
    // const userId = 99989; //shipper doc 78
    return this.eventService.doc3PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc3/pdf/tsoview/:id')
  doc3PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {shipperId} = query
    // const userId = Number(shipperId);
    const userId = req?.user?.sub
    // const userId = 99988; //tso 79
    // const userId = 99989; //shipper doc 78
    return this.eventService.doc3PDF(id, userId, res, (shipperId && Number(shipperId)) || null)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc3/:id')
  doc3Find(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc3Find(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas/doc3/history/:id')
  doc3History(@Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {tso} = query
    const userId = req?.user?.sub
    return this.eventService.doc3History(id, userId, tso)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('offspec-gas/doc3')
  async doc3Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc3Create = await this.eventService.doc3Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas/doc3`, 'create', doc3Create)

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
      if (userType?.id === 3) {
        
        const shipperData = await this.prisma.group.findFirst({
          where: {
            account_manage: {
              some: {
                account_id: Number(req?.user?.sub)
              }
            }
          },
          select: {
            id: true,
            name: true,
            company_name: true
          }
        })
        const message = `Shipper ${shipperData?.name} created the Off-Spec Gas Doc 3 on ${dayjs(doc3Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc3Create?.event_nember}).`
        await middleNotiInappShipper(
          this.prisma,
          'Event',
          message,
          107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
          1,
          Number(shipperData?.id)
        )
      } else {
        const message = `TSO created the Off-Spec Gas Doc 3 on ${dayjs(doc3Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc3Create?.event_nember}).`
        await middleNotiInappShipperMulti(
          this.prisma,
          'Event',
          message,
          107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
          1,
          doc3Create?.event_document?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 3)?.map((e: any) => e?.group_id)
        )
      }
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc3Create
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('offspec-gas/doc3/edit/:id')
  async doc3Edit(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc3Edit = await this.eventService.doc3Edit(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas/doc3`, 'edit', doc3Edit)

    // inapp
    try {
      const message = `TSO updated the Off-Spec Gas Doc 3 on ${dayjs(doc3Edit?.event_date).format('DD/MM/YYYY')} (Event code: ${doc3Edit?.event_nember}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc3Edit?.event_document?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 3)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc3Edit
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('offspec-gas/doc3/:id')
  async doc3Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const actions = await this.eventService.doc3Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `offspec-gas/doc3`, 'action', actions)

    // inapp
    try {
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub) // shipper action
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const message = `Shipper ${shipperData?.name} ${messageStatus} the Off-Spec Gas Doc 3 on ${dayjs(actions?.event_date).format('DD/MM/YYYY')} (Event code: ${actions?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        shipperData?.id
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return actions
  }

  // emer

  @Get('emer/event-type')
  emerEventType() {
    return this.eventService.emerEventType()
  }

  @Get('emer/event-termission')
  emerEventTermission() {
    return this.eventService.emerEventTermission()
  }

  @Get('emer/event-status')
  emerEventStatus() {
    return this.eventService.emerEventStatus()
  }

  @Get('emer/event-doc-status')
  emerEventDocStatus() {
    return this.eventService.emerEventDocStatus()
  }

  @UseGuards(AuthGuard)
  @Get('emer')
  emerAll(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.eventService.emerAll(query, userId)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Patch('emer/:id')
  async emerUpdateStatus(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_status_id} = body

    if (!id || !event_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const updateStatus = await this.eventService.emerUpdateStatus(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emergency-difficult-day`, 'update-status', updateStatus)

    // inapp
    try {
      const zoneText = updateStatus?.event_doc_emer_gas_tranmiss
        ? updateStatus?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : updateStatus?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : updateStatus?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      const message = `The ${updateStatus?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(updateStatus?.event_date).format('DD/MM/YYYY')} has been validated and closed by TSO (Event code: ${updateStatus?.event_nember}).`
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        updateStatus?.event_document?.filter((f: any) => f?.user_type_id === 3)?.map((e: any) => e?.group_id)
      )

      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return updateStatus
  }

  // doc 3.9
  // gen
  @UseGuards(AuthGuard)
  @Post('emer/generatedoc39and4')
  async generatedoc39and4(@Body() body: any, @Req() req: any) {
    // const { event_date } = body;

    // if (!event_date) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    const generatedoc39and4 = await this.eventService.generatedoc39and4(body, req?.user?.sub)

    // await this.eventService.writeReq(req, `emer/doc39`, 'create', generatedoc39and4);


    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return generatedoc39and4
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc39/email-group-for-event')
  doc39EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc39EmailGroupForEvent(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc39/shipper')
  doc39Shipper(@Req() req: any) {
    const userId = req?.user?.sub
    // const userId = 63;
    return this.eventService.doc39Shipper(userId)
  }

  // http://10.100.101.15:8010/master/event/emer/doc39/pdf/30
  @UseGuards(AuthGuard)
  @Get('emer/doc39/pdf/:id')
  doc39PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    // const userId = 99988; //tso 56
    // const userId = 99989; //shipper doc 57
    // const userId = 76; //shipper doc 58
    // const userId = 63;
    return this.eventService.doc39PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc39/pdf/tsoview/:id')
  doc39PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {userId, shipperId} = query
    const userIds = Number(userId)
    const shipperIds = Number(shipperId)
    // const userId = null
    // const userId = req?.user?.sub;
    // const userId = 99988; //tso 79
    // const userId = 0; //shipper doc 78
    return this.eventService.doc39PDF(id, userIds, res, shipperIds)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc39/:id')
  doc39Find(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc39Find(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc39/history/:id')
  doc39History(@Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {tso} = query
    const userId = req?.user?.sub
    //  tso ส่ง id runnumber
    return this.eventService.doc39History(id, userId, tso)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('emer/doc39')
  async doc39Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc39Create = await this.eventService.doc39Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc39`, 'create', doc39Create)

    // inapp
    try {
      const zoneText = doc39Create?.event_doc_emer_gas_tranmiss
        ? doc39Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc39Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc39Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      // tso create
      const message = `TSO created the Incident report Doc 3.9 of ${doc39Create?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(doc39Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc39Create?.event_nember}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc39Create?.event_document_emer?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 309)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc39Create
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('emer/doc39/edit/:id')
  async doc39Edit(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc39Edit = await this.eventService.doc39Edit(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc39`, 'edit', doc39Edit)

    // inapp
    try {
      const zoneText = doc39Edit?.event_doc_emer_gas_tranmiss
        ? doc39Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc39Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc39Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      // tso create
      const message = `TSO updated the Incident report Doc 3.9 of ${doc39Edit?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(doc39Edit?.event_date).format('DD/MM/YYYY')} (Event code: ${doc39Edit?.event_nember}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc39Edit?.event_document_emer?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 309)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc39Edit
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('emer/doc39/:id')
  async doc39Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const actions = await this.eventService.doc39Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc3`, 'action', actions)

    // inapp
    try {
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub) // shipper action
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const zoneText = actions?.event_doc_emer_gas_tranmiss
        ? actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      const message = `Shipper ${shipperData?.name} ${messageStatus} the Incident report Doc 3.9 of ${actions?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(actions?.event_date).format('DD/MM/YYYY')} (Event code: ${actions?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        shipperData?.id
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return actions
  }

  // old
  @UseGuards(AuthGuard)
  @Get('emer/doc4/ref-doc-use')
  doc4RefDocUsed(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41RefDocUsed(userId)
  }

  // old
  @UseGuards(AuthGuard)
  @Get('emer/doc4/order')
  doc4Order(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41Order(userId)
  }

  // old
  @UseGuards(AuthGuard)
  @Get('emer/doc4/email-group-for-event')
  doc4EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41EmailGroupForEvent(userId)
  }

  //old
  @UseGuards(AuthGuard)
  @Get('emer/doc4/shipper')
  doc4Shipper(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41Shipper(userId)
  }

  //old
  @UseGuards(AuthGuard)
  @Get('emer/doc4/pdf/:id')
  doc4PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    //  const userId = 99988; //tso 56
    // const userId = 99989; //shipper doc 57
    // const userId = 76; //shipper doc 58
    // const userId = 63;
    return this.eventService.doc41PDF(id, userId, res)
  }

  // old
  @UseGuards(AuthGuard)
  @Get('emer/doc4/pdf/tsoview/:id')
  doc4PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {userId, shipperId} = query
    const userIds = Number(userId)
    const shipperIds = Number(shipperId)
    return this.eventService.doc41PDF(id, userIds, res, shipperIds)
  }

  // old
  @UseGuards(AuthGuard)
  @Get('emer/doc4/version/:id')
  doc4FindVersion(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41FindVersion(id, userId)
  }

  // old
  @UseGuards(AuthGuard)
  @Get('emer/doc4/version/doc/:id')
  doc4FindDoc(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41FindDoc(id, userId)
  }

  // old
  @UseGuards(AuthGuard)
  @Post('emer/doc4')
  async doc4Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc4Create = await this.eventService.doc41Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc4`, 'create', doc4Create)

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc4Create
  }

  // old
  @UseGuards(AuthGuard)
  @Put('emer/doc4/:id')
  async doc4Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const changeModeZoneBaseInventoryAction = await this.eventService.doc41Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc4`, 'action', changeModeZoneBaseInventoryAction)

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return changeModeZoneBaseInventoryAction
  }

  // doc 5

  @UseGuards(AuthGuard)
  @Get('emer/doc5/ref-doc-use')
  doc5RefDocUsed(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc5RefDocUsed(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc5/email-group-for-event')
  doc5EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc5EmailGroupForEvent(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc5/shipper')
  doc5Shipper(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc5Shipper(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc5/pdf/:id')
  doc5PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc5PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc5/pdf/tsoview/:id')
  doc5PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {userId, shipperId} = query
    const userIds = Number(userId)
    const shipperIds = Number(shipperId)
    // const userId = null
    // const userId = req?.user?.sub;
    // const userId = 99988; //tso 79
    // const userId = 0; //shipper doc 78
    return this.eventService.doc5PDF(id, userIds, res, shipperIds)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc5/:id')
  doc5Find(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc5Find(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc5/history/:id')
  doc5History(@Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {tso} = query
    const userId = req?.user?.sub
    //  tso ส่ง id runnumber
    return this.eventService.doc5History(id, userId, tso)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('emer/doc5')
  async doc5Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc5Create = await this.eventService.doc5Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc5`, 'create', doc5Create)

    // inapp
    try {
      const zoneText = doc5Create?.event_doc_emer_gas_tranmiss
        ? doc5Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc5Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc5Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      // tso create
      const message = `TSO created the Recovery report Doc 5 of ${doc5Create?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(doc5Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc5Create?.event_nember}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc5Create?.event_document_emer?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 5)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc5Create
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('emer/doc5/edit/:id')
  async doc5Edit(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc39Edit = await this.eventService.doc5Edit(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc5`, 'edit', doc39Edit)

    // inapp
    try {
      const zoneText = doc39Edit?.event_doc_emer_gas_tranmiss
        ? doc39Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc39Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc39Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      const message = `TSO updated the Recovery report Doc 5 of ${doc39Edit?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(doc39Edit?.event_date).format('DD/MM/YYYY')} (Event code: ${doc39Edit?.event_nember}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc39Edit?.event_document_emer?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 5)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc39Edit
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('emer/doc5/:id')
  async doc5Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const actions = await this.eventService.doc5Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc5`, 'action', actions)

    // inapp
    try {
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub) // shipper action
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const zoneText = actions?.event_doc_emer_gas_tranmiss
        ? actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      const message = `Shipper ${shipperData?.name} ${messageStatus} the Recovery report Doc 5 of ${actions?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(actions?.event_date).format('DD/MM/YYYY')} (Event code: ${actions?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        shipperData?.id
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return actions
  }

  // doc 6

  @UseGuards(AuthGuard)
  @Get('emer/doc6/ref-doc-use')
  doc6RefDocUsed(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc6RefDocUsed(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc6/email-group-for-event')
  doc6EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc6EmailGroupForEvent(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc6/nompoint')
  doc6Nompoint(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc6Nompoint(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc6/pdf/:id')
  doc6PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc6PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc6/pdf/tsoview/:id')
  doc6PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {userId, shipperId} = query
    const userIds = Number(userId)
    const shipperIds = Number(shipperId)
    // const userId = null
    // const userId = req?.user?.sub;
    // const userId = 99988; //tso 79
    // const userId = 0; //shipper doc 78
    return this.eventService.doc6PDF(id, userIds, res, shipperIds)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc6/:id')
  doc6Find(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc6Find(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc6/history/:id')
  doc6History(@Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {tso} = query
    const userId = req?.user?.sub
    //  tso ส่ง id runnumber
    return this.eventService.doc6History(id, userId, tso)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('emer/doc6')
  async doc6Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc6Create = await this.eventService.doc6Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc6`, 'create', doc6Create)
    // inapp
    try {
      const zoneText = doc6Create?.event_doc_emer_gas_tranmiss
        ? doc6Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc6Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc6Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      // tso create
      const message = `TSO created the Adjustment Report Doc 6 of ${doc6Create?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(doc6Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc6Create?.event_nember}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc6Create?.event_document_emer?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 6)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc6Create
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('emer/doc6/edit/:id')
  async doc6Edit(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc6Edit = await this.eventService.doc6Edit(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc6`, 'edit', doc6Edit)

    // inapp
    try {
      const zoneText = doc6Edit?.event_doc_emer_gas_tranmiss
        ? doc6Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc6Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc6Edit?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      // tso create
      const message = `TSO updated the Adjustment Report Doc 6 of ${doc6Edit?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(doc6Edit?.event_date).format('DD/MM/YYYY')} (Event code: ${doc6Edit?.event_nember}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc6Edit?.event_document_emer?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 6)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc6Edit
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('emer/doc6/:id')
  async doc6Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const actions = await this.eventService.doc6Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc6`, 'action', actions)

    // inapp
    try {
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub) // shipper action
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const zoneText = actions?.event_doc_emer_gas_tranmiss
        ? actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      const message = `Shipper ${shipperData?.name} ${messageStatus} the Adjustment Report Doc 6 of ${actions?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(actions?.event_date).format('DD/MM/YYYY')} (Event code: ${actions?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        shipperData?.id
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return actions
  }

  // ofo

  @Get('ofo/event-type')
  ofoEventType() {
    return this.eventService.ofoEventType()
  }

  @Get('ofo/event-termission')
  ofoEventTermission() {
    return this.eventService.ofoEventTermission()
  }

  @Get('ofo/event-status')
  ofoEventStatus() {
    return this.eventService.emerEventStatus()
  }

  @Get('ofo/event-doc-status')
  ofoEventDocStatus() {
    return this.eventService.emerEventDocStatus()
  }

  @UseGuards(AuthGuard)
  @Get('ofo')
  ofoAll(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.eventService.ofoAll(query, userId)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Patch('ofo/:id')
  async ofoUpdateStatus(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_status_id} = body

    if (!id || !event_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const updateStatus = await this.eventService.ofoUpdateStatus(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `ofo`, 'update-status', updateStatus)

    // inapp
    try {
      const zoneText = updateStatus?.event_doc_ofo_gas_tranmiss
        ? updateStatus?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : updateStatus?.event_doc_ofo_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : updateStatus?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      const message = `The ${updateStatus?.event_doc_ofo_type?.name_en} ${zoneText} Zone on ${dayjs(updateStatus?.event_date).format('DD/MM/YYYY')} has been validated and closed by TSO (Event code: ${updateStatus?.event_nember}).`
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        updateStatus?.event_document_ofo?.filter((f: any) => f?.user_type_id === 3)?.map((e: any) => e?.group_id)
      )

      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   107, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return updateStatus
  }

  // doc 7
  // event/ofo/doc7/updateRef
  @UseGuards(AuthGuard)
  @Put('ofo/doc7/updateRef')
  async doc7updateRef(@Body() body: any, @Req() req: any) {
    const doc7updateRef = await this.eventService.doc7updateRef(body, req?.user?.sub)

    // await this.eventService.writeReq(req, `emer/doc7`, 'create', doc7updateRef);

    return doc7updateRef
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/ref-master')
  doc7RefMaster(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc7RefMaster(userId)
  }

  // gen 7
  @UseGuards(AuthGuard)
  @Post('ofo/generatedoc7')
  async generatedoc7(@Body() body: any, @Req() req: any) {
    // const { event_date } = body;

    // if (!event_date) {
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.BAD_REQUEST,
    //       error: 'Missing required fields',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    const generatedoc7 = await this.eventService.generatedoc7(body, req?.user?.sub)

    // await this.eventService.writeReq(req, `emer/doc39`, 'create', generatedoc7);


    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }
    return generatedoc7
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/ref-doc-use')
  doc7RefDocUsed(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc7RefDocUsed(userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/email-group-for-event')
  doc7EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc7EmailGroupForEvent(userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/nompoint')
  doc7Nompoint(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc7Nompoint(userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/order')
  doc7Order(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc7Order(userId)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('ofo/doc7')
  async doc7Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc7Create = await this.eventService.doc7Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc7`, body?.id_runnumber ? 'edit' : 'create', doc7Create)
    // inapp
    try {
      const zoneText = doc7Create?.event_doc_ofo_gas_tranmiss
        ? doc7Create?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc7Create?.event_doc_ofo_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc7Create?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      // tso create
      const message = `TSO ${body?.id_runnumber ? 'updated' : 'created'} the OF/IF Doc 7 of ${doc7Create?.event_doc_ofo_type?.name_en} ${zoneText} Zone on ${dayjs(doc7Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc7Create?.event_nember}).`
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc7Create?.event_document_ofo?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 7)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc7Create
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/version/:id')
  doc7FindVersion(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc7FindVersion(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/version/doc/:id')
  doc7FindDoc(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc7FindDoc(id, userId)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('ofo/doc7/:id')
  async doc7Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const actions = await this.eventService.doc7Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `ofo/doc7`, 'action', actions)

    // inapp
    try {
      const zoneText = actions?.event_doc_ofo_gas_tranmiss
        ? actions?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : actions?.event_doc_ofo_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : actions?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub) // shipper action
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const message = `Shipper ${shipperData?.name} ${messageStatus} the OF/IF Doc 7 of ${actions?.event_doc_ofo_type?.name_en} ${zoneText} Zone on ${dayjs(actions?.event_date).format('DD/MM/YYYY')} (Event code: ${actions?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        shipperData?.id
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return actions
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/pdf/:id')
  doc7PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    // const userId = 99988;
    // const userId = 73;
    return this.eventService.doc7PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc7/pdf/tsoview/:id')
  doc7PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {userId, shipperId} = query
    const userIds = Number(userId)
    const shipperIds = Number(shipperId)
    return this.eventService.doc7PDF(id, userIds, res, shipperIds)
  }

  // doc 8

  @UseGuards(AuthGuard)
  @Get('ofo/doc8/ref-doc-use')
  doc8RefDocUsed(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc8RefDocUsed(userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc8/email-group-for-event')
  doc8EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc8EmailGroupForEvent(userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc8/shipper')
  doc8Shipper(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc8Shipper(userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc8/pdf/:id')
  doc8PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc8PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc8/pdf/tsoview/:id')
  doc8PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {userId, shipperId} = query
    const userIds = Number(userId)
    const shipperIds = Number(shipperId)
    return this.eventService.doc8PDF(id, userIds, res, shipperIds)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc8/:id')
  doc8Find(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc8Find(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo/doc8/history/:id')
  doc8History(@Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {tso} = query
    const userId = req?.user?.sub
    //  tso ส่ง id runnumber
    return this.eventService.doc8History(id, userId, tso)
  }

  @UseGuards(AuthGuard)
  @Post('ofo/doc8')
  async doc8Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc8Create = await this.eventService.doc8Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `ofo/doc8`, 'create', doc8Create)

    // inapp
    try {
      const zoneText = doc8Create?.event_doc_ofo_gas_tranmiss
        ? doc8Create?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc8Create?.event_doc_ofo_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc8Create?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      // tso create
      const message = `TSO created the OF/IF Doc 8 of ${doc8Create?.event_doc_ofo_type?.name_en} ${zoneText} Zone on ${dayjs(doc8Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc8Create?.event_nember}).`
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc8Create?.event_document_ofo?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 8)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc8Create
  }

  @UseGuards(AuthGuard)
  @Post('ofo/doc8/edit/:id')
  async doc8Edit(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc8Edit = await this.eventService.doc8Edit(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `ofo/doc8`, 'edit', doc8Edit)

    // inapp
    try {
      const zoneText = doc8Edit?.event_doc_ofo_gas_tranmiss
        ? doc8Edit?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc8Edit?.event_doc_ofo_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc8Edit?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      // tso create
      const message = `TSO updated the OF/IF Doc 8 of ${doc8Edit?.event_doc_ofo_type?.name_en} ${zoneText} Zone on ${dayjs(doc8Edit?.event_date).format('DD/MM/YYYY')} (Event code: ${doc8Edit?.event_nember}).`
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc8Edit?.event_document_ofo?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 8)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc8Edit
  }

  @UseGuards(AuthGuard)
  @Post('ofo/doc8/findDoc7')
  async doc8findDoc7(@Body() body: any, @Req() req: any) {

    const doc8findDoc7 = await this.eventService.doc8findDoc7(body, req?.user?.sub)

    return doc8findDoc7
  }




  // ok inapp
  @UseGuards(AuthGuard)
  @Put('ofo/doc8/:id')
  async doc8Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const actions = await this.eventService.doc8Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `ofo/doc8`, 'action', actions)

    // inapp
    try {
      const zoneText = actions?.event_doc_ofo_gas_tranmiss
        ? actions?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : actions?.event_doc_ofo_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : actions?.event_doc_ofo_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub) // shipper action
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const message = `Shipper ${shipperData?.name} ${messageStatus} the OF/IF Doc 8 of ${actions?.event_doc_ofo_type?.name_en} ${zoneText} Zone on ${dayjs(actions?.event_date).format('DD/MM/YYYY')} (Event code: ${actions?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        shipperData?.id
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        1013, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return actions
  }

  // doc 41

  @UseGuards(AuthGuard)
  @Get('emer/doc41/shipper')
  doc44Shipper(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41Shipper(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc41/ref-doc-use')
  doc41RefDocUsed(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41RefDocUsed(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc41/email-group-for-event')
  doc41EmailGroupForEvent(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41EmailGroupForEvent(userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc41/order')
  doc41Order(@Req() req: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41Order(userId)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post('emer/doc41')
  async doc41Create(@Body() body: any, @Req() req: any) {
    const {event_date} = body

    if (!event_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const doc41Create = await this.eventService.doc41Create(body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc41`, body?.id_documents ? 'edit' : 'create', doc41Create)

    // inapp
    try {
      const modeVersion = body?.id_documents ? 'updated' : 'created'
      const zoneText = doc41Create?.event_doc_emer_gas_tranmiss
        ? doc41Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : doc41Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : doc41Create?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''

      const message = `TSO ${modeVersion} the Incident report Doc 4 of ${doc41Create?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(doc41Create?.event_date).format('DD/MM/YYYY')} (Event code: ${doc41Create?.event_nember}${body?.id_documents && `, version ${doc41Create?.document41?.[0]?.version_text || ''}`}).`
      // await middleNotiInappTSOonly(
      //   this.prisma,
      //   'Event',
      //   message,
      //   106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
      //   1,
      // );
      await middleNotiInappShipperMulti(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        doc41Create?.event_document_emer?.filter((f: any) => f?.user_type_id === 3 && f?.event_doc_master_id === 41)?.map((e: any) => e?.group_id)
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return doc41Create
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc41/version/:id')
  doc41FindVersion(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41FindVersion(id, userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc41/version/doc/:id')
  doc41FindDoc(@Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    return this.eventService.doc41FindDoc(id, userId)
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put('emer/doc41/:id')
  async doc41Action(@Body() body: any, @Req() req: any, @Param('id') id: any) {
    const {event_doc_status_id} = body

    if (!id || !event_doc_status_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const actions = await this.eventService.doc41Action(id, body, req?.user?.sub)

    await this.eventService.writeReq(req, `emer/doc41`, 'action', actions)
    // inapp
    try {
      const shipperData = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(req?.user?.sub) // shipper action
            }
          }
        },
        select: {
          id: true,
          name: true,
          company_name: true
        }
      })
      const messageStatus = event_doc_status_id === 3 ? 'accepted' : event_doc_status_id === 4 ? 'rejected' : event_doc_status_id === 5 ? 'acknowledged' : '-'
      const zoneText = actions?.event_doc_emer_gas_tranmiss
        ? actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore East'
          ? 'East'
          : actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore West'
            ? 'West'
            : actions?.event_doc_emer_gas_tranmiss?.name == 'Onshore East - West'
              ? 'East - West'
              : 'Other'
        : ''

      // const message = `Shipper ${shipperData?.name} ${messageStatus} the Incident report Doc 4 of ${actions?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(actions?.event_date).format("DD/MM/YYYY")} (Event code: ${actions?.event_nember}${body?.id_documents && `, version ${actions?.document41?.[0]?.version_text || ""}`}).`
      const message = `Shipper ${shipperData?.name} ${messageStatus} the Incident report Doc 4 of ${actions?.event_doc_emer_type?.name_en} ${zoneText} Zone on ${dayjs(actions?.event_date).format('DD/MM/YYYY')} (Event code: ${actions?.event_nember}).`
      await middleNotiInappShipper(
        this.prisma,
        'Event',
        message,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        1,
        shipperData?.id
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.event',
        `Event has been updated. Please refresh the page to see the latest changes.`,
        106, // menus_id event 105 | (doc 1 2 3) Off-spec Gas 107 | (doc 3.9 4 5 6) Emergency/Difficult Day 106 | (doc 7 8) OFO 1013
        2
      )
    } catch (error) {
    }

    return actions
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc41/pdf/:id')
  doc41PDF(@Res() res: Response, @Req() req: any, @Param('id') id: any) {
    const userId = req?.user?.sub
    // const userId = 99988;
    return this.eventService.doc41PDF(id, userId, res)
  }

  @UseGuards(AuthGuard)
  @Get('emer/doc41/pdf/tsoview/:id')
  doc41PDFtsoView(@Res() res: Response, @Req() req: any, @Param('id') id: any, @Query() query: any) {
    const {userId, shipperId} = query
    const userIds = Number(userId)
    const shipperIds = Number(shipperId)
    return this.eventService.doc41PDF(id, userIds, res, shipperIds)
  }
}
