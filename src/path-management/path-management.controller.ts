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
  BadRequestException
} from '@nestjs/common'
import {AuthGuard} from 'src/auth/auth.guard'
import {JwtService} from '@nestjs/jwt'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {PathManagementService} from './path-management.service'
import {CreatePathManagementDto} from './dto/create-path-management.dto'
import {UpdatePathManagementDto} from './dto/update-path-management.dto'
import {middleNotiInapp} from 'src/common/utils/inapp.util'
import {PrismaService} from '@prisma/prisma.service'

@Controller('path-management')
export class PathManagementController {
  constructor(
    private readonly pathManagementService: PathManagementService,
    private readonly accountManageService: AccountManageService,
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  @Get()
  pathManagement() {
    return this.pathManagementService.pathManagement()
  }

  @Get('path-management/:id')
  pathManagementOnce(
    @Param('id') id: any
  ) {
    return this.pathManagementService.pathManagementOnceFull(
      id
    )
  }

  @Get('group-paths')
  groupPath() {
    return this.pathManagementService.groupPath()
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Post(
    'path-management-create'
  )
  async pathManagementCreate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {start_date} = body

    if (!start_date) {
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
    const pathManagementCreate =
      await this.pathManagementService.pathManagementCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.pathManagementService.pathManagementOnce(
        pathManagementCreate?.id
      )
    await this.pathManagementService.writeReq(
      req,
      `path-management`,
      'create',
      his
    )

    try {
      // inapp

      const message = `Path Management has been created the new version ${pathManagementCreate?.version}`
      await middleNotiInapp(
        this.prisma,
        'Capacity Management',
        `${message}`,
        51, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management | 51 Path Management
        1
      )
    } catch (error) {}

    return pathManagementCreate
  }

  @UseGuards(AuthGuard)
  @Post(
    'path-management-duplicate'
  )
  async pathManagementDuplicate(
    @Body() body: any,
    @Req() req: any
  ) {
    const {start_date} = body

    if (!start_date) {
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
    const pathManagementDuplicate =
      await this.pathManagementService.pathManagementCreate(
        body,
        req?.user?.sub
      )
    const his =
      await this.pathManagementService.pathManagementOnce(
        pathManagementDuplicate?.id
      )
    await this.pathManagementService.writeReq(
      req,
      `path-management`,
      'duplicate',
      his
    )

    return pathManagementDuplicate
  }

  // ok inapp
  @UseGuards(AuthGuard)
  @Put(
    'path-management-edit/:id'
  )
  async pathManagementEdit(
    @Body() body: any,
    @Req() req: any,
    @Param('id') id: any
  ) {
    const {start_date} = body

    if (!start_date) {
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
    const {mode, data} =
      await this.pathManagementService.pathManagementEdit(
        body,
        req?.user?.sub,
        id
      )
    const his =
      await this.pathManagementService.pathManagementOnce(
        id
      )
    await this.pathManagementService.writeReq(
      req,
      `path-management`,
      mode === 1
        ? 'edit'
        : mode === 2
          ? 'duplicate-new'
          : null,
      his
    )

    try {
      // inapp
      const message = `Path Management version ${his?.version} has been updated`
      await middleNotiInapp(
        this.prisma,
        'Capacity Management',
        `${message}`,
        51, // menus_id | 52 Bulletin Board | 50 Capacity Contract Management | 51 Path Management
        1
      )
    } catch (error) {}

    return data
  }

  @Get(
    'path-management-log/:id'
  )
  pathManagementLog(
    @Param('id') id: any
  ) {
    return this.pathManagementService.pathManagementLog(
      id
    )
  }
}
