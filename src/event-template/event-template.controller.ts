import {Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards, Query, Put} from '@nestjs/common'
import {EventTemplateService} from './event-template.service'
import {PrismaService} from '@prisma/prisma.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {writeReq} from 'src/common/utils/write-req.util'

@Controller('event-template')
export class EventTemplateController {
  constructor(
    private readonly eventTemplateService: EventTemplateService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    return this.eventTemplateService.findAll({userId: req?.user?.sub})
  }

  @UseGuards(AuthGuard)
  @Get('once/:id')
  findOnce(@Req() req: any, @Query() query: any, @Param('id') id: any) {
    return this.eventTemplateService.findOnce({userId: req?.user?.sub, id})
  }

  @UseGuards(AuthGuard)
  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const create = await this.eventTemplateService.create({userId: req?.user?.sub, payload: body})
    const his = await this.eventTemplateService.findOnce(create.id)
    await writeReq(this.prisma, 'DAM', req, `event-template`, 'create', his)

    return create
  }

  @UseGuards(AuthGuard)
  @Put('/:id')
  async update(@Req() req: any, @Body() body: any, @Param('id') id: any) {
    const update = await this.eventTemplateService.update({userId: req?.user?.sub, payload: body, id: id})
    const his = await this.eventTemplateService.findOnce(id)
    await writeReq(this.prisma, 'DAM', req, `event-template`, 'edit', his)

    return update
  }

  @UseGuards(AuthGuard)
  @Delete('/:id')
  async delete(@Req() req: any, @Param('id') id: any) {
    return await this.eventTemplateService.delete({userId: req?.user?.sub, id: id})
  }

  @UseGuards(AuthGuard)
  @Patch('/:id')
  async active(@Req() req: any, @Param('id') id: any) {
    return await this.eventTemplateService.active({userId: req?.user?.sub, id: id})
  }

  @UseGuards(AuthGuard)
  @Get('history/:id')
  findAllHistory(@Req() req: any, @Param('id') id: any) {
    return this.eventTemplateService.findAllHistory({userId: req?.user?.sub, id: id})
  }

  @UseGuards(AuthGuard)
  @Get('doc/:id')
  findDoc(@Req() req: any, @Param('id') id: any) {
    return this.eventTemplateService.findDoc({userId: req?.user?.sub, id: id})
  }
}
