import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpException, HttpStatus, Put, UseGuards, Req, HttpCode } from '@nestjs/common'
import { AccountManageService } from './account-manage.service'
import { CreateAccountManageDto } from './dto/create-account-manage.dto'
import { UpdateAccountManageDto } from './dto/update-account-manage.dto'
import { AuthGuard } from 'src/auth/auth.guard'
import { JwtService } from '@nestjs/jwt'
import { writeReq } from 'src/common/utils/write-req.util'
import { PrismaService } from 'prisma/prisma.service'
import { AccountManageSystemLoginService } from './system-login'
import { AccountManageBankMasterService } from './bank-master'
import { AccountManageHistoryService } from './history'
import { AccountManageUserTypeService } from './user-type'
import { AccountManageGroupMasterService } from './group-master'
import { AccountManageAreaContractService } from './area-contract'
import { AccountManageDivisionMasterService } from './division-master'
import { AccountManageRoleMasterService } from './role-master'
import { AccountManageTandCService } from './tandc'
import { checkPreDate, nPassword } from 'src/common/utils/account.util'
import { middleNotiInapp, providerNotiInapp } from 'src/common/utils/inapp.util'
import { getTodayNowAdd7 } from 'src/common/utils/date.util'
import { CAA } from 'src/common/utils/caa.util';

@Controller('account-manage')
export class AccountManageController {
  constructor(
    private prisma: PrismaService,
    private readonly accountManageService: AccountManageService,
    private readonly accountManageSystemLoginService: AccountManageSystemLoginService,
    private readonly accountManageBankMasterService: AccountManageBankMasterService,
    private readonly accountManageHistoryService: AccountManageHistoryService,
    private readonly accountManageUserTypeService: AccountManageUserTypeService,
    private readonly accountManageGroupMasterService: AccountManageGroupMasterService,
    private readonly accountManageAreaContractService: AccountManageAreaContractService,
    private readonly accountManageDivisionMasterService: AccountManageDivisionMasterService,
    private readonly accountManageRoleMasterService: AccountManageRoleMasterService,
    private readonly accountManageTandCService: AccountManageTandCService
  ) { }

  @HttpCode(200)
  @Post('account-local')
  async accountLocal(@Body() body: any) {
    let { email, password } = body
    email = email.toLowerCase()
    const env = process.env.NODE_ENV ?? 'development'
    const pttdcEnv = ['production', 'pre-production']
    const checkModeLogin = await this.accountManageService.checkModeLogin(email)

    if (checkModeLogin === 1) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: 'Invalid login mode. Please contact your administrator.'
        },
        HttpStatus.FORBIDDEN
      )
    } else {
      const checkLogDate = await this.accountManageService.checkLogDate(email)

      await this.accountManageService.findAccountDate({
        username: email,
        pass: password
      })

      await this.accountManageService.findAccountLoginFlag({
        username: email,
        pass: password
      })

      const user = await this.accountManageService.findAccount({
        username: email,
        pass: password
      })
      const ckGen30Pass = await this.accountManageService.ckGen30Pass(user)
      if (!!ckGen30Pass) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            // error: 'your password is expired, please contact administrator',
            error: 'temporary password expired , please contract admin.'
          },
          HttpStatus.FORBIDDEN
        )
      }
      const account = await this.accountManageService.accountLocal(user?.id) 

      if (!account) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            error: 'Can not log in, please contact Admin'
          },
          HttpStatus.FORBIDDEN
        )
      }
      if (account && account?.active == false) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            error: 'Missing InActive'
          },
          HttpStatus.FORBIDDEN
        )
      } else if (account && !account?.status) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            error: 'your user is inactivated, please contact administrator'
          },
          HttpStatus.FORBIDDEN
        )
      } else {
        if (!account?.start_date) {
          throw new HttpException(
            {
              status: HttpStatus.FORBIDDEN,
              error: 'Missing start_date time not work'
            },
            HttpStatus.FORBIDDEN
          )
        } else {
          const checkStartDate = await checkPreDate(account?.start_date)
          const checkEndDate = await checkPreDate(account?.end_date)
          if (checkStartDate && account?.end_date) {
            if (checkEndDate) {
              throw new HttpException(
                {
                  status: HttpStatus.FORBIDDEN,
                  error: 'Missing end_date expired'
                },
                HttpStatus.FORBIDDEN
              )
            }
          } else if (!checkStartDate) {
            throw new HttpException(
              {
                status: HttpStatus.FORBIDDEN,
                error: 'Missing start_date time not work'
              },
              HttpStatus.FORBIDDEN
            )
          }
        }
      }
      if (env !== 'dr') {
        await this.accountManageService.loginLogs(
          user?.id,
          'login',
          JSON.stringify({
            account: account,
            tac: await this.accountManageTandCService.tAndCOn(),
            token: await this.accountManageService.genToken({
              sub: user?.id,
              first_name: user?.first_name,
              last_name: user?.last_name,
              username: email,
              type: 'access'
            })
          })
        )
      }
      if (env !== 'dr') {
        if (!!account?.f_t_and_c && !!!account?.password_gen_flag) {
          await this.accountManageService.findAccountLoginFlagUpdateActive({
            username: email
          })
        }
      }

      if (pttdcEnv.includes(env)) {
        await providerNotiInapp('login', 'clear login', [email], 1, 1, this.prisma)
      }
      return {
        account: account,
        tac: await this.accountManageTandCService.tAndCOn(),
        token: await this.accountManageService.genToken({
          sub: user?.id,
          first_name: user?.first_name,
          last_name: user?.last_name,
          username: email,
          type: 'access'
        })
      }
    }
  }

  // login sso 1 condition
  // @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post('accountSSO-internal')
  async accountSSO_internal(@Body() body: any) {
    const { } = body
    // tso
    const resData = await this.accountManageService.accountSSO_internal(body)

    return resData
  }

  // login sso 1 condition
  // @UseGuards(AuthGuard)
  @HttpCode(200)
  @Post('accountSSO-external')
  async accountSSO_external(@Body() body: any) {
    const { } = body
    // tso
    const resData = await this.accountManageService.accountSSO_external(body)

    return resData
  }

  @HttpCode(200)
  @Post('clear-login-session')
  async clearLoginSession(@Body() body: any) {
    const { email } = body
    if (!email) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageService.clearLoginSession(email)
  }

  @HttpCode(200)
  @Get('npassword')
  async nPassword(@Req() req: any) {
    const account = await nPassword()

    return account
  }

  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Get('account-local-once')
  async accountLocalOnce(@Req() req: any) {
    const account = await this.accountManageService.accountLocalOnce(req?.user?.sub)

    return {
      account: account
    }
  }

  @HttpCode(200)
  @Get('syncCAAmaster')
  async conSyncAccount() {
    const conSyncAccount = await this.accountManageService.conSyncAccount()
    return conSyncAccount
  }

  @UseGuards(AuthGuard)
  @Get('update-flag-logout')
  updateLogoutFlag(@Req() req: any) {
    return this.accountManageService.updateLogoutFlag(req?.user?.sub)
  }

  // @UseGuards(AuthGuard)
  @Post('update-flag-logout-email')
  updateLogoutFlagEmail(@Req() req: any, @Body() body: any) {
    return this.accountManageService.updateLogoutFlagEmail(body?.email)
  }

  @UseGuards(AuthGuard)
  @Get('update-flag-tac')
  updateFlagTaC(@Req() req: any) {
    return this.accountManageService.updateFlagTaC(req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Get('update-login-listen')
  updateLoginListen(@Req() req: any) {
    return this.accountManageService.updateLoginListen(req?.user?.sub)
  }

  @HttpCode(200)
  @Post('login-check-count')
  async loginCheckCount(@Body() body: any) {
    const { email, count } = body

    const checkLogDate = await this.accountManageService.loginCheckCount(email, count)
    return checkLogDate
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  logOut(@Req() req: any) {
    return this.accountManageService.loginLogs((req?.user?.sub || -1), 'logout', null)
  }

  @Get('column-config-account/:id')
  columnConfigAccount(@Param('id') id: any) {
    return this.accountManageService.columnConfigAccount(id)
  }

  @Get('emailOnly')
  emailOnly() {
    return this.accountManageService.emailOnly()
  }

  @Get('account')
  account(@Query() query: any) {
    const { limit, offset, q, userId, firstName, userType, startDate, endDate, type, loginMode, orderByName, orderBy } = query
    return this.accountManageService.account(Number(limit ?? 100), Number(offset ?? 0), q || '', userId, firstName || '', userType || '', startDate || '', endDate || '', type || '', loginMode || '', orderByName || '', orderBy || '')
  }

  @UseGuards(AuthGuard)
  @Post('account-register')
  async registerAaccount(@Body() body: any, @Req() req: any) {
    let { email, user_id } = body
    if (!email) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    email = email.toLowerCase()
    if (!!user_id) {
      const checkUserId = await this.accountManageService.checkUserId(user_id)
      if (checkUserId) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'User Id already exist.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }
    const register = await this.accountManageService.registerAaccount(body, req?.user?.sub)
    const account = await this.accountManageService.accountLocalGetSure(register?.data?.id)

    const res_history = await writeReq(this.prisma, 'DAM', req, `account`, 'create', account);

    const caa = new CAA();
    caa.syncUserRoleInBackground({
      account: account,
      by: req?.user?.username,
    });

    return register
  }

  @UseGuards(AuthGuard)
  @Put('account-edit/:id')
  async editAaccount(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { user_id } = body

    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    if (!!user_id) {
      const checkUserId = await this.accountManageService.checkUserIdUse(user_id, id)
      if (checkUserId) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'User Id already exist.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }
    const editAccount = await this.accountManageService.editAccount(id, body, (req?.user?.sub || -1), req)

    const account = await this.accountManageService.accountLocalGetSure(
      editAccount?.data?.id,
    );
    await writeReq(this.prisma, 'DAM', req, `account`, 'edit', account);

    const caa = new CAA();
    caa.syncUserRoleInBackground({
      account: account,
      by: req?.user?.username,
    });

    return editAccount
  }

  @UseGuards(AuthGuard)
  @Patch('signature/:id')
  async signature(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { signature, mimetype } = body

    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const editAccount = await this.accountManageService.signature(id, body, (req?.user?.sub || -1), req)
    const account = await this.accountManageService.accountLocalGetSure(editAccount?.id)

    await writeReq(this.prisma, 'DAM', req, `account`, 'signature', account)

    return editAccount
  }

  @UseGuards(AuthGuard)
  @Post('account-reason-create')
  async accountReasonCreate(@Body() body: any, @Req() req: any) {
    const { account_id, status, reason } = body
    if (!account_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const reasons = await this.accountManageService.accountReasonCreate(body, req?.user?.sub)

    const account = await this.accountManageService.accountLocalGetSure(Number(account_id))

    await writeReq(this.prisma, 'DAM', req, `account`, 'reason-account', account)
    return reasons
  }

  @UseGuards(AuthGuard)
  @Patch('account-local-gen-password/:id')
  async accountLocalGenPassword(@Param('id') id: any, @Req() req: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const editAccount: any = this.accountManageService.accountLocalGenPassword(id, req?.user?.sub)
    const account = await this.accountManageService.accountLocalGetSure(id)
    // const account = await this.accountManageService.accountLocal(id);
    await writeReq(this.prisma, 'DAM', req, `account`, 'reset', account)
    const { password, ...newEditAccount } = await editAccount

    return newEditAccount
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: any) {
    const { email } = body
    if (!email) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageService.forgotPassword(email)
  }

  @Post('get-link')
  getLink(@Body() body: any) {
    const { email } = body
    if (!email) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageService.getLink(email)
  }

  @Post('reset-password')
  async resetPassword(@Body() body: any) {
    const { password, ref } = body
    if (!ref || !password) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const accManage = await this.accountManageService.resetPassword(ref, password)
    const systemLoginOne = await this.accountManageSystemLoginService.systemLoginOne(accManage?.id)
    if (systemLoginOne) {
      await writeReq(this.prisma, 'DAM', null, 'system-login', 'reset', systemLoginOne)
    }
    return accManage?.account
  }

  @Post('check-password')
  async checkPassword(@Body() body: any) {
    const { password, ref } = body
    if (!ref || !password) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const accManage = await this.accountManageService.checkPassword(ref, password)

    return accManage
  }

  // system-login

  @Get('system-login')
  systemLogin() {
    return this.accountManageSystemLoginService.systemLogin()
  }

  @UseGuards(AuthGuard)
  @Get('system-login-role')
  systemLoginRole() {
    return this.accountManageSystemLoginService.systemLoginRole()
  }

  @UseGuards(AuthGuard)
  @Get('system-login-role-use/:id')
  systemLoginRoleUse(@Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageSystemLoginService.systemLoginRoleUse(id)
  }

  @UseGuards(AuthGuard)
  @Post('system-logi-config')
  async systemLoginConfig(@Body() body: any, @Req() req: any) {
    const { role_id, mode_account_id } = body
    if (!role_id || !mode_account_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const systemLoginConfig = await this.accountManageSystemLoginService.systemLoginConfig(body, req?.user?.sub)
    const systemLoginOne = await this.accountManageSystemLoginService.systemLoginOne(systemLoginConfig?.data?.id)
    await writeReq(this.prisma, 'DAM', req, 'system-login', 'create', systemLoginOne)

    return systemLoginConfig
  }

  @UseGuards(AuthGuard)
  @Put('system-logi-config-edit/:id')
  async systemLoginConfigEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { mode_account_id } = body
    if (!mode_account_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const systemLoginConfig = await this.accountManageSystemLoginService.systemLoginConfigEdit(id, body, (req?.user?.sub || -1), req)
    const systemLoginOne = await this.accountManageSystemLoginService.systemLoginOne(systemLoginConfig?.data?.id)
    await writeReq(this.prisma, 'DAM', req, 'system-login', 'edit', systemLoginOne)

    return systemLoginConfig
  }

  // banking-master

  @UseGuards(AuthGuard)
  @Get('banking-master')
  bankingMaster() {
    return this.accountManageBankMasterService.bankingMaster()
  }

  // history

  @UseGuards(AuthGuard)
  @Get('history')
  history(@Query() query: any) {
    const { type, method, id_value } = query
    if (!type || !method || !id_value) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageHistoryService.history(query, id_value)
  }

  // user-type

  @UseGuards(AuthGuard)
  @Get('user-type')
  userType() {
    return this.accountManageUserTypeService.userType()
  }

  @UseGuards(AuthGuard)
  @Get('user-type-n')
  userTypeN() {
    return this.accountManageUserTypeService.userTypeN()
  }

  @UseGuards(AuthGuard)
  @Get('account-user-type')
  accountUserType(@Req() req: any) {
    if (!req?.user?.sub) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageUserTypeService.accountUserType(req?.user?.sub)
  }

  // group-master

  @UseGuards(AuthGuard)
  @Get('group-master')
  groupMaster(@Query() query: any) {
    const { user_type } = query
    if (!user_type) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageGroupMasterService.groupMaster(user_type)
  }

  @UseGuards(AuthGuard)
  @Post('group-create')
  async groupMasterCreate(@Body() body: any, @Req() req: any) {
    const { id_name, name, user_type_id } = body
    if (!id_name || !name || !user_type_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const group = await this.accountManageGroupMasterService.groupMasterCreate(body, req?.user?.sub)
    const his = await this.accountManageGroupMasterService.groupMasterOne(group?.id)
    await writeReq(this.prisma, 'DAM', req, `group-${user_type_id}`, 'create', his)
    return group
  }

  @UseGuards(AuthGuard)
  @Put('group-update/:id')
  async groupMasterEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { name, user_type_id } = body
    if (!id || !name || !user_type_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const group = await this.accountManageGroupMasterService.groupMasterEdit(id, body, req?.user?.sub)
    // const his =
    //   await this.accountManageGroupMasterService.groupMasterOne(
    //     id
    //   )
    // await writeReq(
    //   this.prisma,
    //   'DAM',
    //   req,
    //   `group-${user_type_id}`,
    //   'edit',
    //   his
    // )
    return group
  }

  @UseGuards(AuthGuard)
  @Put('group-status/:id')
  async groupMasterStatus(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { name, user_type_id } = body
    if (!id || !name || !user_type_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const group = await this.accountManageGroupMasterService.groupMasterStatus(id, body, req?.user?.sub)
    const his = await this.accountManageGroupMasterService.groupMasterOne(id)
    await writeReq(this.prisma, 'DAM', req, `group-${user_type_id}`, 'status', his)
    return group
  }

  @UseGuards(AuthGuard)
  @Patch('group-status/:id')
  async groupMasterStatusPa(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { status, user_type_id } = body
    if (!id || !user_type_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const group = await this.accountManageGroupMasterService.groupMasterStatus(id, { status: status }, req?.user?.sub)
    const his = await this.accountManageGroupMasterService.groupMasterOne(id)
    await writeReq(this.prisma, 'DAM', req, `group-${user_type_id}`, 'status', his)
    return group
  }

  @UseGuards(AuthGuard)
  @Put('shipper-contract-point/:id')
  async shipperContractPoint(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const shipperContractPoint = await this.accountManageGroupMasterService.shipperContractPoint(id, body, req?.user?.sub)
    const his = await this.accountManageGroupMasterService.groupMasterOne(id)
    await writeReq(this.prisma, 'DAM', req, `shipper-contract-point`, 'manage', his)
    return shipperContractPoint
  }

  // area-contract

  @UseGuards(AuthGuard)
  @Get('area-contract')
  areaContract(@Query() query: any) {
    return this.accountManageAreaContractService.areaContract()
  }

  // division-master

  @UseGuards(AuthGuard)
  @Get('division-master')
  divisionMaster() {
    return this.accountManageDivisionMasterService.divisionMaster()
  }

  @UseGuards(AuthGuard)
  @Post('division-sync')
  async divisionSync(@Body() body: any, @Req() req: any) {
    const { } = body

    const divisionSync = await this.accountManageDivisionMasterService.divisionSync(body, req?.user?.sub)

    // const roleOne = await this.accountManageDivisionMasterService.roleMasterOnce(
    //   role?.id,
    // );
    // await writeReq(this.prisma, 'DAM', req, 'division', 'sync', roleOne);

    // Division was synced at {sync_time}
    try {
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Division was synced at ${getTodayNowAdd7().format('YYYY-MM-DD')}`,
        15, // menus_id | 15 Division Master
        1
      )
    } catch (error) { }

    return divisionSync
  }

  @UseGuards(AuthGuard)
  @Get('division-not-use')
  divisionNotUse() {
    return this.accountManageDivisionMasterService.divisionNotUse()
  }

  @UseGuards(AuthGuard)
  @Get('division-not-use-way-edit/:id')
  divisionNotUseWayEdit(@Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageDivisionMasterService.divisionNotUseWayEdit(id)
  }

  // role-master

  @UseGuards(AuthGuard)
  @Get('role-master')
  roleMaster() {
    return this.accountManageRoleMasterService.roleMaster()
  }

  @UseGuards(AuthGuard)
  @Post('role-master-create')
  async roleMasterCreate(@Body() body: any, @Req() req: any) {
    const { name, user_type_id, start_date, end_date } = body
    if (!name || !user_type_id || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const role = await this.accountManageRoleMasterService.roleMasterCreate(body, req?.user?.sub)

    const roleOne = await this.accountManageRoleMasterService.roleMasterOnce(role?.id)
    await writeReq(this.prisma, 'DAM', req, 'role', 'create', roleOne)

    const caa = new CAA();
    caa.createRoleInBackground({
      name: name,
      by: req?.user?.username,
      extraXml: 'test no extra xml',
    });

    return role;
  }

  @UseGuards(AuthGuard)
  @Put('role-master-edit/:id')
  async roleMasterEdit(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { name, user_type_id, start_date, description } = (body || {})
    if (!name || !user_type_id || !start_date) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const roleBefore = await this.accountManageRoleMasterService.roleMasterOnce(Number(id));
    const role = await this.accountManageRoleMasterService.roleMasterEdit(
      id,
      body,
      (req?.user?.sub || -1),
    );
    const roleOne = await this.accountManageRoleMasterService.roleMasterOnce(
      Number(id),
    );
    await writeReq(this.prisma, 'DAM', req, 'role', 'edit', roleOne);

    const caa = new CAA();
    caa.updateRoleInBackground({
      oldName: roleBefore?.name || role?.nameOld,
      name: name,
      by: req?.user?.username,
      description: description || '',
    });

    return role
  }

  @UseGuards(AuthGuard)
  @Patch('role-master-duplicate/:id')
  async roleMasterDuplicate(@Body() body: any, @Param('id') id: any, @Req() req: any) {
    const { name, user_type_id, start_date, end_date } = body
    if (!name || !user_type_id || !start_date || !id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const role = await this.accountManageRoleMasterService.roleMasterDuplicate(id, body, req?.user?.sub)
    const roleOne = await this.accountManageRoleMasterService.roleMasterOnce(Number(id))
    await writeReq(this.prisma, 'DAM', req, 'role', 'duplicate', roleOne)

    return role
  }

  @UseGuards(AuthGuard)
  @Post('role-active-permission')
  async roleActivePermission(@Body() body: any, @Req() req: any) {
    if (!body?.id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const roleActivePermission = await this.accountManageRoleMasterService.roleActivePermission(body, req?.user?.sub)
    try {
      const roleOne = await this.accountManageRoleMasterService.roleMasterOnceWithRolePermission(roleActivePermission.role_id)
      await writeReq(this.prisma, 'DAM', req, 'role', 'update permission', roleOne)
    } catch (error) {
      console.error('Write audit log for role active permission failed:', error)
      return roleActivePermission
    }
    return roleActivePermission
  }

  @Post('role-active-permission/bulk-table')
  async roleActivePermissionBulkTable(
    @Body()
    body: {
      ids: number[]
      fields: string[] // รายชื่อฟิลด์จะเป็น f_* + b_manage
      value: boolean // true=เปิดทั้งหมด, false=ปิดทั้งหมด
      skipDisabled?: boolean // ข้ามค่าที่เป็น 2 ไอ้ที่เป็น disable
    }
  ) {
    return this.accountManageRoleMasterService.roleActivePermissionBulkTable(body)
  }

  @UseGuards(AuthGuard)
  @Get('role-menu-permission')
  roleMenuPermission(@Query() query: any) {
    if (!query?.id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return this.accountManageRoleMasterService.roleMenuPermission(query?.id)
  }

  // tandc

  @UseGuards(AuthGuard)
  @Post('account-local-tandc')
  async accountLocalTandC(@Body() body: any, @Req() req: any) {
    const tac = await this.accountManageTandCService.tAndCOn()
    const account = await this.accountManageTandCService.accountLocalTandC(req?.user?.sub)
    await writeReq(this.prisma, 'DAM', req, `term-and-condition`, 'accept', {
      id: (req?.user?.sub || -1),
      ...req?.user,
      tac: tac
    })
    return account
  }

  @UseGuards(AuthGuard)
  @Get('tandc-master')
  tAndC() {
    return this.accountManageTandCService.tAndC()
  }

  @UseGuards(AuthGuard)
  @Post('tandc-master-create')
  async tAndCCreact(@Body() body: any) {
    const { url, version } = body
    if (!url || !version) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
    const create = await this.accountManageTandCService.tAndCCreact(body)
    const his = await this.accountManageTandCService.tAndCOne(create?.id)
    await middleNotiInapp(
      this.prisma,
      'DAM',
      `Terms & Condition was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
      39, // Terms & Condition menus_id
      1
    )

    return this.accountManageTandCService.tAndCCreact(body)
  }

  @UseGuards(AuthGuard)
  @Put('tandc-master-use/:id')
  async tAndCUse(@Param('id') id: any) {
    if (!id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    try {
      const up = await this.accountManageTandCService.tAndCUse(id)
      const his = await this.accountManageTandCService.tAndCOne(id)
      await middleNotiInapp(
        this.prisma,
        'DAM',
        `Terms & Condition was created active from ${getTodayNowAdd7(his?.start_date).format('YYYY-MM-DD')} to ${(his?.end_date && getTodayNowAdd7(his?.end_date).format('YYYY-MM-DD')) || '-'}`,
        39, // Terms & Condition menus_id
        1
      )
      return up
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal server error'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @UseGuards(AuthGuard)
  @Get('noti-read')
  notiread(@Req() req: any) {
    return this.accountManageService.notiread(req?.user?.sub)
  }

  @UseGuards(AuthGuard)
  @Post('noti-read')
  notireadActive(@Req() req: any, @Body() body: any) {
    return this.accountManageService.notireadActive(body, req?.user?.sub)
  }
}
