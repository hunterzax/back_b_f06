import { group } from '@prisma/client'
import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { PrismaService } from 'prisma/prisma.service'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { EmailClientService } from 'src/grpc/email-service.service'
import { getTodayEndAdd7, getTodayNowAdd7, getTodayStart, getTodayStartAdd7 } from 'src/common/utils/date.util'
import { writeReq } from 'src/common/utils/write-req.util'
import { CAA } from 'src/common/utils/caa.util'
import { PIS } from 'src/common/utils/pis.util';
import { generatePassword, genPass, genTokenReset } from 'src/common/utils/account.util'
import { Prisma } from '@prisma/client'

import * as _ from 'lodash';

// import axios from 'axios';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { start } from 'repl';
import { waitForDebugger } from 'inspector';
import { buildUserIdLiteralIlikePattern, escapePostgresIlikeContains, getMatchingModeAccountNames } from 'src/common/utils/query.util'

dayjs.extend(utc);
dayjs.extend(timezone);

const PIS_INFORMATION_NOT_FOUND = 'Your information is not found in PIS, please contact Admin.';
const PIS_DIVISION_NOT_FOUND = 'Your division is not found in PIS, please contact Admin.';
const PIS_DIVISION_NOT_ALLOWED = 'Your division is not allowed to access TPA system, please contact Admin.';
const PIS_VERIFY_FAILED = 'Unable to verify PIS information, please contact Admin.';

@Injectable()
export class AccountManageService {
  private readonly logger = new Logger(AccountManageService.name)

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private readonly emailClientService: EmailClientService
  ) { }

  async conSyncAccount() {
    const accounts = await this.prisma.account.findMany({
      // where: {
      //   email: { not: null },
      // },
      select: {
        id: true,
        email: true,
        account_manage: {
          select: {
            id: true,
            group_id: true,
            division_id: true,
            account_role: {
              select: {
                role: { select: { name: true } },
              },
              take: 1,
            },
          },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
    });

    const caa = new CAA();
    const sleepMs = this.getConSyncAccountSleepMs();
    let pisSynced = 0;
    let caaSynced = 0;
    let pisFailed = 0;
    let caaFailed = 0;

    console.log(`[INFO][conSyncAccount]: start account_count=${accounts.length} sleep_ms=${sleepMs}`);
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const email = this.normalizeEmail(account?.email);
      if (!email) {
        console.log(`[WARN][conSyncAccount]: skip account_id=${account?.id} reason=missing_email`);
        continue;
      }

      if (i > 0 && sleepMs > 0) {
        await this.sleep(sleepMs);
      }

      console.log(`[INFO][conSyncAccount]: process ${i + 1}/${accounts.length} account_id=${account.id} email=${email}`);
      let roleName = account?.account_manage?.[0]?.account_role?.[0]?.role?.name;
      let pisUpdated = false;
      let caaUpdated = false;

      if ('pttlc.com' !== email.split('@')[1]) {
        try {
          const pisResult = await this.syncExistingAccountWithPis(account, email);
          pisUpdated = pisResult.synced;
          roleName = pisResult.roleName || roleName;
          if (pisUpdated) pisSynced++;
        } catch (error: any) {
          pisFailed++;
          const message = error?.message || error?.response?.statusText || 'unknown';
          console.log(`[ERROR][conSyncAccount]: PIS sync failed account_id=${account.id} email=${email} message=${message}`);
        }
      }


      try {
        caaUpdated = await caa.syncUserRole({
          account,
          email,
          roleName,
          by: email,
        });
        if (caaUpdated) caaSynced++;
      } catch (error: any) {
        caaFailed++;
        const message = error?.message || error?.response?.statusText || 'unknown';
        console.log(`[ERROR][conSyncAccount]: CA&A sync failed account_id=${account.id} email=${email} message=${message}`);
      }

      console.log(`[INFO][conSyncAccount]: done account_id=${account.id} email=${email} pis_synced=${pisUpdated} caa_synced=${caaUpdated}`);
    }

    console.log(`[INFO][conSyncAccount]: finish account_count=${accounts.length} pis_synced=${pisSynced} pis_failed=${pisFailed} caa_synced=${caaSynced} caa_failed=${caaFailed}`);
  }

  private async syncExistingAccountWithPis(account: any, email: string) {
    const ssoContext = await this.resolveInternalSsoPisContext({ email });
    const group = ssoContext.group;
    const localDivisionId = ssoContext.localDivisionId;
    const user = ssoContext.user;
    const accountManageId = account?.account_manage?.[0]?.id;
    const roleId = group?.role_default?.[0]?.role_id;

    if (!accountManageId) {
      console.log(`[WARN][syncExistingAccountWithPis]: skip account_id=${account?.id} email=${email} reason=missing_account_manage`);
      return { synced: false, roleName: null };
    }
    if (!roleId) {
      console.log(`[WARN][syncExistingAccountWithPis]: skip account_id=${account?.id} email=${email} reason=missing_group_default_role`);
      return { synced: false, roleName: null };
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        active: true,
        status: true,
        first_name: user?.first_name,
        last_name: user?.last_name,
        telephone: user?.telephone,
        user_id: user?.employe_id ? `PTT-${user?.employe_id}` : null,
        type_account_id: 2,
        update_date: getTodayNowAdd7().toDate(),
        update_date_num: getTodayNowAdd7().unix(),
      },
    });

    await this.prisma.account_manage.update({
      where: { id: accountManageId },
      data: {
        mode_account_id: 1,
        division_id: localDivisionId,
        user_type_id: group?.user_type_id,
        group_id: group?.id,
        update_date: getTodayNowAdd7().toDate(),
        update_date_num: getTodayNowAdd7().unix(),
      },
    });

    await this.prisma.account_role.upsert({
      where: { account_manage_id: accountManageId },
      create: {
        account_manage_id: accountManageId,
        role_id: roleId,
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
      },
      update: {
        role_id: roleId,
        update_date: getTodayNowAdd7().toDate(),
        update_date_num: getTodayNowAdd7().unix(),
      },
    });

    console.log(`[INFO][syncExistingAccountWithPis]: synced account_id=${account.id} email=${email} division_id=${localDivisionId || null} group_id=${group?.id || null} role_id=${roleId}`);
    return {
      synced: true,
      roleName: await this.getRoleNameById(roleId),
    };
  }

  private async getRoleNameById(roleId: any) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId },
      select: { name: true },
    });
    return role?.name || null;
  }

  private getConSyncAccountSleepMs() {
    const sleepMs = Number(process.env.CON_SYNC_ACCOUNT_SLEEP_MS || 0);
    return Number.isFinite(sleepMs) && sleepMs > 0 ? sleepMs : 0;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async accountSSO_internal(payload: any) {
    const { access_token } = payload
    const inputEmail = this.normalizeEmail(payload?.email);
    /*
    STEP
     1 Resolve PIS employee, division, and local group
     2 Validate account
     3 Upsert account group, division, role
     3.1 If no account then create base PIS
     3.2 Else update account base PIS
     4  Verify access_token from sso && Sync with CA&A
     5 Prepare Response
    */
    console.log(`[INFO][accountSSO_internal] input parameter: has_access_token=${!!access_token}`);
    console.log(`[INFO][accountSSO_internal] input parameter: email=${inputEmail}`);

    if (!inputEmail) {
      console.log(`[ERROR][accountSSO_internal] Missing Email`);
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'email is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // *1 Resolve PIS employee, division, and local group
    const ssoContext = await this.resolveInternalSsoPisContext({
      email: inputEmail,
    });
    const email = ssoContext.email;
    const user = ssoContext.user;
    const group = ssoContext.group;
    const localDivisionId = ssoContext.localDivisionId;

    // *2 Validate account
    let account = await this.basic_validate_account(email, 'AD');
    const og_group_id = account ? account?.account_manage?.[0]?.group_id : null;
    const og_division_id = account ? account?.account_manage?.[0]?.division_id : null;

    // *3 Update group, division, role base on PIS division
    // upsert if group or division was change or account not exist
    try {
      if (og_group_id !== group?.id || og_division_id !== localDivisionId) {
        const baseAccountData = {
          email: email,
          active: true,
          status: true,
          first_name: user?.first_name,
          last_name: user?.last_name,
          telephone: user?.telephone,
          user_id: user?.employe_id ? `PTT-${user?.employe_id}` : null,
          type_account_id: 2, // 1 manual, 2 PTT, 3 TPA WEB
        };
        let createData: any = { ...baseAccountData };
        let updateData: any = { ...baseAccountData };
        createData.start_date = getTodayStart().toDate();
        createData.create_date = getTodayNowAdd7().toDate();
        createData.create_date_num = getTodayNowAdd7().unix();
        updateData.update_date = getTodayNowAdd7().toDate();
        updateData.update_date_num = getTodayNowAdd7().unix();
        account = await this.prisma.account.upsert({
          where: { email: email },
          create: createData,
          update: updateData
        })

        const baseAccountManageData = {
          account_id: account?.id,
          mode_account_id: 1, // 1 SSO, 2 LOCAL
          division_id: localDivisionId,
          user_type_id: group?.user_type_id,
          group_id: group?.id
        }
        createData = { ...baseAccountManageData }
        updateData = { ...baseAccountManageData }
        createData.create_date = getTodayNowAdd7().toDate()
        createData.create_date_num = getTodayNowAdd7().unix()
        updateData.update_date = getTodayNowAdd7().toDate()
        updateData.update_date_num = getTodayNowAdd7().unix()

        const account_manage = await this.prisma.account_manage.upsert({
          where: { account_id: account.id },
          create: createData,
          update: updateData
        })

        const baseAccountRoleData = {
          account_manage_id: account_manage?.id,
          role_id: group?.role_default?.[0]?.role_id
        }
        createData = { ...baseAccountRoleData }
        updateData = { ...baseAccountRoleData }
        createData.create_date = getTodayNowAdd7().toDate()
        createData.create_date_num = getTodayNowAdd7().unix()
        updateData.update_date = getTodayNowAdd7().toDate()
        updateData.update_date_num = getTodayNowAdd7().unix()

        await this.prisma.account_role.upsert({
          where: { account_manage_id: account_manage.id },
          create: createData,
          update: updateData
        })
        account = await this.basic_validate_account(email, 'AD')
      }
    }
    catch (error) {
      console.log(`[ERROR][accountSSO_internal] upsert account error: ${error}`)
    }

    // *4 Verify access_token from sso && sync with CA&A
    console.log(`[INFO][accountSSO_internal] authAD start`);
    const caa = new CAA();
    const isTokenValid = await caa.authAD(access_token,
      account?.email || email,
      account?.account_manage?.[0]?.account_role?.[0]?.role?.name,
      account?.email || email
    );
    console.log(`[INFO][accountSSO_internal] authAD result=${isTokenValid}`);

    if (!isTokenValid) {
      throw new HttpException(
        { status: HttpStatus.UNAUTHORIZED, error: 'Fail Veirify Token, please try again' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // *5 Prepare Response
    // gen token
    const token = await this.genToken({
      sub: account?.id,
      first_name: account?.first_name,
      last_name: account?.last_name,
      username: account?.email,
      type: 'access'
    })

    // get t&c
    // const tac = await this.tAndCOn()
    const tac = null;

    // create log
    const json_log = JSON.stringify({ account: account, tac: tac, token: token });
    await this.loginLogs(account?.id, 'internal_sso', json_log);



    return { account: account, tac: tac, token: token };
  }

  private async resolveInternalSsoPisContext(params: {
    email: string;
  }) {
    const { email } = params;

    const pis = new PIS();
    let employeeRows = [];
    try {
      const lookupParams = this.buildPisEmployeeLookupParams(email);
      console.log(`[INFO][resolveInternalSsoPisContext]: request PIS employee email=${email} field=${lookupParams.field} value=${lookupParams.value}`);
      employeeRows = await pis.getEmployeeEntries({ [lookupParams.field]: lookupParams.value });
      console.log(`[INFO][resolveInternalSsoPisContext]: PIS employee row_count=${employeeRows.length} email=${email}`);
    } catch (error: any) {
      const status = error?.response?.status || 'unknown';
      const message = error?.message || 'unknown';
      console.log(`[ERROR][resolveInternalSsoPisContext]: PIS employee request failed email=${email} status=${status} message=${message}`);
      if (this.isProductionLikeEnvironment()) {
        throw this.pisBadRequest(PIS_VERIFY_FAILED);
      }
    }

    const employee = this.selectPisEmployee(employeeRows, email);
    if (!employee) {
      if (this.isNonProductionPisFallbackAllowed(email)) {
        return this.resolveNonProductionPisFallback(email, null, 'employee_not_found');
      }
      throw this.pisBadRequest(PIS_INFORMATION_NOT_FOUND);
    }

    const pisEmail = this.getPisText(employee, ['EmailAddress']);
    const responseEmail = pisEmail ? this.normalizeEmail(pisEmail) : email;
    const departmentCode = this.getPisText(employee, ['DepartmentCode']);
    console.log(`[INFO][resolveInternalSsoPisContext]: selected PIS employee email=${email} employee_id=${this.getPisEmployeeId(employee) || null} department_code=${departmentCode || null}`);
    if (!departmentCode) {
      if (this.isNonProductionPisFallbackAllowed(email)) {
        return this.resolveNonProductionPisFallback(email, this.mapPisEmployeeToInternalUser(employee, email), 'division_not_found');
      }
      throw this.pisBadRequest(PIS_DIVISION_NOT_FOUND);
    }

    const divisionContext = await this.findAllowedGroupByDivisionId(departmentCode);
    if (!divisionContext) {
      console.log(`[ERROR][resolveInternalSsoPisContext]: not found allowed group for PIS department_code=${departmentCode} email=${email}`);
      throw this.pisBadRequest(PIS_DIVISION_NOT_ALLOWED);
    }

    console.log(`[INFO][resolveInternalSsoPisContext]: resolved PIS division email=${email} department_code=${departmentCode} local_division_id=${divisionContext.localDivisionId} group_id=${divisionContext.group?.id}`);
    return {
      email: responseEmail,
      user: this.mapPisEmployeeToInternalUser(employee, responseEmail),
      group: divisionContext.group,
      localDivisionId: divisionContext.localDivisionId,
    };
  }

  private async resolveNonProductionPisFallback(email: string, user: any, reason: string) {
    console.log(`[WARN][resolveNonProductionPisFallback]: allow fallback email=${email} reason=${reason}`);
    const existingGroup = await this.findExistingAccountGroup(email);
    if (existingGroup) {
      console.log(`[INFO][resolveNonProductionPisFallback]: use existing local group email=${email} group_id=${existingGroup?.id}`);
      return {
        email,
        user: user || { email },
        group: existingGroup,
        localDivisionId: null,
      };
    }

    const fallbackGroupKey = process.env.PIS_NONPROD_FALLBACK_GROUP_ID_NAME || process.env.PIS_NONPROD_FALLBACK_GROUP_NAME || process.env.PIS_NONPROD_FALLBACK_GROUP;
    if (!fallbackGroupKey) {
      console.log(`[ERROR][resolveNonProductionPisFallback]: missing fallback group env email=${email}`);
      throw this.pisBadRequest(PIS_VERIFY_FAILED);
    }

    const fallbackGroup = await this.findGroupByNameOrIdName(fallbackGroupKey);
    if (!fallbackGroup) {
      console.log(`[ERROR][resolveNonProductionPisFallback]: fallback group not found email=${email} group=${fallbackGroupKey}`);
      throw this.pisBadRequest(PIS_VERIFY_FAILED);
    }

    console.log(`[INFO][resolveNonProductionPisFallback]: use env fallback group email=${email} group_id=${fallbackGroup?.id}`);
    return {
      email,
      user: user || { email },
      group: fallbackGroup,
      localDivisionId: null,
    };
  }

  private buildPisEmployeeLookupParams(email: string) {
    if (this.isProductionLikeEnvironment()) {
      return {
        field: 'EmployeeID',
        value: email?.replace('@pttplc.com', ''),
      };
    }

    return {
      field: 'Email',
      value: email,
    };
  }

  private async findAllowedGroupByDivisionId(divisionId: string) {
    const division = await this.prisma.division.findFirst({
      where: { division_id: divisionId },
      select: {
        id: true,
        division_id: true,
        group: {
          select: this.accountSsoGroupSelect(),
        },
      },
    });

    if (!division?.group) {
      return null;
    }

    return {
      group: division.group,
      localDivisionId: division.id,
    };
  }

  private async findExistingAccountGroup(email: string) {
    const account = await this.prisma.account.findFirst({
      where: { email },
      select: {
        account_manage: {
          select: {
            group: {
              select: this.accountSsoGroupSelect(),
            },
          },
          take: 1,
        },
      },
    });

    return account?.account_manage?.[0]?.group || null;
  }

  private async findGroupByNameOrIdName(groupKey: string) {
    return this.prisma.group.findFirst({
      where: {
        OR: [
          { id_name: groupKey },
          { name: groupKey },
        ],
      },
      select: this.accountSsoGroupSelect(),
    });
  }

  private accountSsoGroupSelect() {
    return {
      id: true,
      user_type_id: true,
      role_default: { select: { role_id: true } },
    };
  }

  private selectPisEmployee(employeeRows: any[], email: string) {
    if (employeeRows.length === 0) {
      console.log(`[WARN][selectPisEmployee]: no PIS employee rows email=${email}`);
      return null;
    }

    if (employeeRows.length === 1) {
      return employeeRows[0];
    }

    const exactMatches = employeeRows.filter((employee: any) => this.normalizeEmail(this.getPisEmployeeEmail(employee)) === email);
    console.log(`[WARN][selectPisEmployee]: multiple PIS employee rows email=${email} row_count=${employeeRows.length} exact_match_count=${exactMatches.length} employee_ids=${this.listPisEmployeeIds(employeeRows)}`);

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    return null;
  }

  private mapPisEmployeeToInternalUser(employee: any, email: string) {
    const employeeName = this.getPisText(employee, ['EmployeeNameENG']);
    const nameParts = employeeName?.split(/\s+/).filter(Boolean) || [];
    return {
      email,
      employe_id: this.getPisEmployeeId(employee),
      first_name: nameParts[0] || null,
      last_name: nameParts.slice(1).join(' ') || null,
      telephone: this.getPisText(employee, ['Mobile', 'OfficeTel', 'HomeTel']),
    };
  }

  private getPisEmployeeEmail(employee: any) {
    return this.getPisText(employee, ['EmailAddress', 'Email', 'email']);
  }

  private getPisEmployeeId(employee: any) {
    return this.getPisText(employee, ['EmployeeId', 'EmployeeID']);
  }

  private getPisText(source: any, keys: string[]) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && `${value}`.trim() !== '') {
        return `${value}`.trim();
      }
    }
    return null;
  }

  private listPisEmployeeIds(employeeRows: any[]) {
    return employeeRows.map((employee: any) => {
      const employeeId = this.getPisEmployeeId(employee) || 'unknown';
      const email = this.getPisEmployeeEmail(employee) || 'unknown';
      return `${employeeId}:${email}`;
    }).join(',');
  }

  private isNonProductionPisFallbackAllowed(email: string) {
    if (this.isProductionLikeEnvironment()) {
      return false;
    }

    const whitelist = (process.env.PIS_NONPROD_FALLBACK_EMAIL_WHITELIST || '')
      .split(/[,\s;]+/)
      .map((item) => this.normalizeEmail(item))
      .filter(Boolean);

    const allowed = whitelist.includes(email);
    console.log(`[INFO][isNonProductionPisFallbackAllowed]: email=${email} allowed=${allowed}`);
    return allowed;
  }

  private isProductionLikeEnvironment() {
    const env = process.env.NODE_ENV ?? 'development';
    return ['production'].includes(env);
  }

  private normalizeEmail(email: string) {
    return email ? `${email}`.trim().toLowerCase() : null;
  }

  private pisBadRequest(message: string) {
    return new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  async accountSSO_external(payload: any) {
    /*
    STEP
    1 Validate account
    2 Verify access_token from sso & sync role to CA&A
    3 Prepare Response
    */

    const { access_token, email } = payload

    console.log(`[INFO][accountSSO_external] input parameter: access_token=${access_token}`);
    console.log(`[INFO][accountSSO_external] input parameter: email=${email}`);


    // * 2 Validate account
    if (!email) {
      this.logger.log(`[ERROR][accountSSO_external] Missing Email`)
      throw new HttpException({ status: HttpStatus.BAD_REQUEST, error: 'email is required' }, HttpStatus.BAD_REQUEST)
    }

    const account = await this.basic_validate_account(email, 'B2C');

    // * 2 Verify access_token from sso & sync role to CA&A
    console.log(`[INFO][accountSSO_external] authB2C start`);
    const caa = new CAA();
    const isTokenValid = await caa.authB2C(access_token, email, account?.account_manage?.[0]?.account_role?.[0]?.role?.name);
    console.log(`[INFO][accountSSO_external] authB2C result=${isTokenValid}`);

    if (!isTokenValid) {
      throw new HttpException(
        { status: HttpStatus.UNAUTHORIZED, error: 'Fail Veirify Token, please try again' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // * 3 Prepare Response
    // gen token
    const token = await this.genToken({
      sub: account?.id,
      first_name: account?.first_name,
      last_name: account?.last_name,
      username: account?.email,
      type: 'access'
    })

    // get t&c
    const tac = await this.tAndCOn()

    // create log
    const json_log = JSON.stringify({ account: account, tac: tac, token: token });
    await this.loginLogs(account?.id, 'external_sso', json_log);

    caa.syncLoginUserRoleInBackground({
      authType: 'B2C',
      accessToken: access_token,
      email: account?.email || email,
      roleName: account?.account_manage?.[0]?.account_role?.[0]?.role?.name,
      by: account?.email || email,
    });

    return { account: account, tac: tac, token: token }
  }

  private async basic_validate_account(email: string, login_mode: string): Promise<any> {
    //
    /*
     STEP
     1 Is account exist 
     2 Is account active
     3 Is account Login MODE
  
     parameter
     login_mode: AD, B2C, LOCAL
    */

    const emailLower = email?.toLowerCase()

    const account = await this.prisma.account.findFirst({
      where: {
        email: emailLower
      },
      include: {
        account_manage: {
          include: {
            user_type: true,
            mode_account: true,
            division: true,
            group: {
              include: {
                division: true
              }
            },
            account_role: {
              include: {
                role: {
                  where: {
                    active: true
                  },
                  include: {
                    menus_config: {
                      include: {
                        menus: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        account_password_check: {
          orderBy: {
            create_date: 'asc'
          }
        }
      }
    })

    // 1 Is account exist
    if (!account && login_mode !== 'AD') {
      this.logger.log(`[ERROR][accountSSO_external] In valid login_mode`)
      throw new HttpException(
        {
          status: HttpStatus.UNAUTHORIZED,
          error: `Not found ${emailLower} in system, please contract admin.`
        },
        HttpStatus.UNAUTHORIZED
      )
    } else if (!account && login_mode === 'AD') {
      // create account for AD
      return null
    }
    const { password, ...account_without_pwd } = account || {}

    // 2 Is account active
    const nowAt = getTodayNowAdd7()
    const startDate = getTodayStartAdd7(account?.start_date).toDate()
    const endDate = account?.end_date ? getTodayEndAdd7(account?.end_date).toDate() : null
    const isInRange = nowAt.isAfter(startDate) && (endDate === null || nowAt.isBefore(dayjs(endDate)))
    if (!isInRange || !account?.status) {
      throw new HttpException(
        {
          status: HttpStatus.UNAUTHORIZED,
          key: `your user is inactivated, please contact administrator`,
          error: `your user is inactivated, please contact administrator`
        },
        HttpStatus.UNAUTHORIZED
      )
    }

    // 3 Is correct login mode
    // mode_account_id 1 sso | 2 local
    let mode = 1
    if (['AD', 'B2C'].includes(login_mode)) {
      mode = 2
    }
    if (account?.account_manage?.[0]?.mode_account_id === mode) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Your account in local login mode, please contract admin.`
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return account_without_pwd
  }

  async tAndCOn() {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const tAndCOn = await this.prisma.t_and_c.findFirst({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      orderBy: {
        create_date: 'desc'
      }
    })
    return tAndCOn
  }

  async loginLogs(id: any, event: any, temps: any) {
    /*
  
    temps = JSON.stringify({account: account,tac: tac,token: token});
    */

    await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.login_logs','id'),
          COALESCE((SELECT MAX(id) FROM public.login_logs), 0),
          true
        )
      `)
    const loginLogs = await this.prisma.login_logs.create({
      data: {
        event: event,
        account_id: Number(id),
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
        temps: temps
      }
    })
    return loginLogs
  }

  async loginCheckCount(email: any, count: any) {
    const acc = await this.prisma.account.findFirst({
      where: {
        email: email
      }
    })

    if (!!acc && count === 3) {
      // เพิ่ม 15 นาทีจากเวลาปัจจุบัน
      const nowPlus15Minutes = getTodayNowAdd7().add(15, 'minute').toDate()

      const updateLogDate = await this.prisma.account.updateMany({
        where: {
          email: email
        },
        data: {
          log_date: nowPlus15Minutes
        }
      })
    }

    return {
      data: {
        email: email,
        check: !!acc,
        message: 'check = true (มีจริง), false (ไม่มี) | count = 3 จะโดน log 15 นาที',
        count: count
      }
    }
  }

  async checkModeLogin(email) {
    const acc = await this.prisma.account.findFirst({
      where: {
        email: email
      },
      include: {
        account_manage: true
      }
    })
    return acc?.account_manage?.[0]?.mode_account_id
  }

  async checkLogDate(email: any) {
    // log_date
    const nowDates = getTodayNowAdd7().toDate()

    const acc = await this.prisma.account.findFirst({
      where: {
        email: email
      }
    })
    // เช็คเวลาปุ่จจับนว่าเกิน log_date ยัง
    if (!!acc) {
      // logDate: 2024-12-24T15:13:02.509Z
      const logDate = acc?.log_date
      // ตรวจสอบว่า logDate เกินเวลาปัจจุบันหรือยัง
      if (logDate === null || (logDate && dayjs(nowDates).isAfter(logDate))) {
        return true // logDate เกินเวลาปัจจุบัน
      } else {
        throw new HttpException(
          {
            status: HttpStatus.SERVICE_UNAVAILABLE,
            error: `login ไม่ได้จนถึงเวลา ${dayjs(logDate).format('YYYY-MM-DD HH:mm:ss')}`,
            data: {
              logDate: dayjs(logDate).format('HH:mm:ss')
            }
          },
          HttpStatus.SERVICE_UNAVAILABLE
        )
      }
    } else {
      console.log('process.env.NODE_ENV : ', process.env.NODE_ENV);
      if(process.env.NODE_ENV === 'development') return true;
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: 'Invalid username or password.',
          data: false
        },
        HttpStatus.FORBIDDEN
      )
    }

    // return;
  }

  async accountLocal(id: any) {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    try {
      const roleExp = await this.prisma.role.findFirst({
        where: {
          account_role: {
            some: {
              account_manage: {
                account_id: Number(id)
              }
            }
          }
        }
      })
      const isInRangeRole = dayjs(todayStart).isBetween(dayjs(roleExp?.start_date), dayjs(roleExp?.end_date), null, '[]')
      if (!isInRangeRole) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            key: null,
            error: 2
          },
          HttpStatus.FORBIDDEN
        )
      }

      const groupExp = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(id)
            }
          }
        }
      })
      const isInRangeGroup = dayjs(todayStart).isBetween(dayjs(groupExp?.start_date), dayjs(groupExp?.end_date), null, '[]')
      if (!isInRangeGroup) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            key: null,
            error: 3
          },
          HttpStatus.FORBIDDEN
        )
      }

      const account = await this.prisma.account.findUnique({
        where: {
          id: Number(id),
          account_manage: {
            some: {
              account_role: {
                some: {
                  role: {
                    AND: [
                      {
                        start_date: {
                          lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                        }
                      },
                      {
                        OR: [
                          {
                            end_date: null
                          }, // ถ้า end_date เป็น null
                          {
                            end_date: {
                              gte: todayStart
                            }
                          } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                        ]
                      }
                    ]
                  }
                }
              },
              mode_account_id: 2,
              group: {
                AND: [
                  {
                    start_date: {
                      lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                    }
                  },
                  {
                    OR: [
                      {
                        end_date: null
                      }, // ถ้า end_date เป็น null
                      {
                        end_date: {
                          gte: todayStart
                        }
                      } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
                    ]
                  }
                ]
              }
            }
          },
          AND: [
            {
              start_date: {
                lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gte: todayStart
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        },

        include: {
          account_manage: {
            include: {
              user_type: {
                // include: {
                //   column_table_config: {
                //     include: {
                //       column_table: true,
                //       column_field: true,
                //     },
                //   },
                // },
              },
              mode_account: true,
              division: true,
              group: {
                include: {
                  division: true
                }
              },
              account_role: {
                include: {
                  role: {
                    where: {
                      active: true
                    },
                    include: {
                      menus_config: {
                        include: {
                          menus: true
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          account_password_check: {
            orderBy: {
              create_date: 'asc'
            }
          }
        }
      })

      if (account?.account_password_check.length > 0) {
        const dateCk = account?.account_password_check[account?.account_password_check.length - 1]?.create_date
        const isMoreThan90Days = dayjs(getTodayNowAdd7().toDate()).diff(dayjs(dateCk), 'day') > 90
        if (isMoreThan90Days) {
          throw new HttpException(
            {
              status: HttpStatus.FORBIDDEN,
              key: null,
              error: 1
            },
            HttpStatus.FORBIDDEN
          )
        }
      }

      const { password, ...newAccount } = account
      return newAccount
    } catch (error) {
      if (error?.response?.error === 1) {
        const account = await this.prisma.account.findUnique({
          where: {
            id: Number(id)
          }
        })
        throw new HttpException(
          {
            status: HttpStatus.PRECONDITION_FAILED,
            key: null,
            // error: `Password was expired`,
            error: `Your password has expired. Please update it, as passwords must be changed every 90 days for security purposes.`,
            token: await this.genToken({
              sub: account?.id,
              first_name: account?.first_name,
              last_name: account?.last_name,
              username: account?.email,
              type: 'access'
            })
            // error: `account more 90 day`,
          },
          HttpStatus.PRECONDITION_FAILED
        )
      } else if (error?.response?.error === 2) {
        throw new HttpException(
          {
            status: HttpStatus.PRECONDITION_FAILED,
            key: null,
            error: `account role expired`
          },
          HttpStatus.PRECONDITION_FAILED
        )
      } else if (error?.response?.error === 3) {
        throw new HttpException(
          {
            status: HttpStatus.PRECONDITION_FAILED,
            key: null,
            error: `account group expired`
          },
          HttpStatus.PRECONDITION_FAILED
        )
      } else {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            key: null,
            error: `Can not log in, please contact Admin`
          },
          HttpStatus.FORBIDDEN
        )
      }
    }
  }

  async accountLocalOnce(id: any) {
    const account = await this.prisma.account.findUnique({
      where: {
        id: Number(id)
      },
      include: {
        account_manage: {
          include: {
            user_type: {
              // include: {
              //   column_table_config: {
              //     include: {
              //       column_table: true,
              //       column_field: true,
              //     },
              //   },
              // },
            },
            mode_account: true,
            division: true,

            group: {
              include: {
                division: true,
                division_group_show: {
                  include: {
                    division: true,
                  },
                },
              }
            },
            account_role: {
              include: {
                role: {
                  where: {
                    active: true
                  },
                  include: {
                    menus_config: {
                      include: {
                        menus: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
        // account_password_check: true,
      }
    })

    const { password, password_gen_origin, password_gen_flag, ...newAccount } = account
    return newAccount
  }

  async accountLocalGetSure(id: any) {
    try {
      const account = await this.prisma.account.findUnique({
        where: {
          id: Number(id)
        },
        include: {
          account_manage: {
            include: {
              user_type: {
                include: {
                  column_table_config: {
                    include: {
                      column_table: true,
                      column_field: true
                    }
                  }
                }
              },
              mode_account: true,
              division: true,
              group: {
                include: {
                  division: true
                }
              },
              account_role: {
                include: {
                  role: {
                    where: {
                      active: true
                    },
                    include: {
                      menus_config: {
                        include: {
                          menus: true
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          account_reason: {
            include: {
              create_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },
              update_by_account: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              }
            }
          },
          type_account: true,
          created_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          },
          updated_by_account: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          },
          login_logs: {
            select: {
              id: true,
              create_date: true
            },
            orderBy: {
              id: 'desc' // เรียง login_logs ตาม id ในลำดับที่ลดลง
            },
            take: 1
          }
        }
        // include: {
        //   account_manage: {
        //     include: {
        //       user_type: {
        //         // include: {
        //         //   column_table_config: {
        //         //     include: {
        //         //       column_table: true,
        //         //       column_field: true,
        //         //     },
        //         //   },
        //         // },
        //       },
        //       mode_account: true,
        //       division: true,
        //       group: {
        //         include: {
        //           division: true,
        //         },
        //       },
        //       account_role: {
        //         include: {
        //           role: {
        //             where: {
        //               active: true,
        //             },
        //             include: {
        //               menus_config: {
        //                 include: {
        //                   menus: true,
        //                 },
        //               },
        //             },
        //           },
        //         },
        //       },
        //     },
        //   },
        //   account_password_check: true,
        //   account_reason: {
        //     include: {
        //       create_by_account: {
        //         select: {
        //           id: true,
        //           email: true,
        //           first_name: true,
        //           last_name: true,
        //         },
        //       },
        //       update_by_account: {
        //         select: {
        //           id: true,
        //           email: true,
        //           first_name: true,
        //           last_name: true,
        //         },
        //       },
        //     },
        //   },
        //   type_account: true,
        //   created_by_account: {
        //     select: {
        //       id: true,
        //       email: true,
        //       first_name: true,
        //       last_name: true,
        //     },
        //   },
        //   updated_by_account: {
        //     select: {
        //       id: true,
        //       email: true,
        //       first_name: true,
        //       last_name: true,
        //     },
        //   },
        // },
      })

      const { password, ...newAccount } = account
      return newAccount
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          key: null,
          error: `account not match`
        },
        HttpStatus.FORBIDDEN
      )
    }
  }

  async clearLoginSession(email: string[]) {
    return await this.prisma.account.updateMany({
      where: {
        email: {
          in: email
        }
      },
      data: {
        log_date: null,
        login_flag: null,
        listen_login_date: null
      }
    })
  }

  async columnConfigAccount(id: any) {
    try {
      const account = await this.prisma.account_manage.findFirst({
        where: {
          account_id: Number(id)
          // account_manage: {
          //   some: {
          //     mode_account_id: 2,
          //   },
          // },
        },
        include: {
          user_type: {
            include: {
              column_table_config: {
                include: {
                  column_table: true,
                  column_field: true
                }
              }
            }
          },
          mode_account: true,
          division: true,
          group: {
            include: {
              division: true
            }
          },
          account_role: {
            include: {
              role: {
                where: {
                  active: true
                },
                include: {
                  menus_config: {
                    include: {
                      menus: true
                    }
                  }
                }
              }
            }
          }
        }
      })

      return account
    } catch (error) {
      if (error?.response?.error === 1) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            key: null,
            // error: `Password was expired`,
            error: `Your password has expired. Please update it, as passwords must be changed every 90 days for security purposes.`
            // error: `account more 90 day`,
          },
          HttpStatus.FORBIDDEN
        )
      } else {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            key: null,
            error: `Can not log in, please contact Admin`
          },
          HttpStatus.FORBIDDEN
        )
      }
    }
  }

  async addPass(account_id: any, password: any, passwordHash: any) {
    const check = await this.prisma.account_password_check.findMany({
      where: {
        account_id: Number(account_id)
      },
      orderBy: {
        create_date: 'asc'
      }
    })
    let flagCheck = false
    await Promise.all(
      check.map(async (item) => {
        const isMatch = await bcrypt.compare(password, item?.password)
        if (isMatch) {
          flagCheck = true
        }
        return item
      })
    )

    if (flagCheck) {
      return true
    } else {
      if (check.length >= 30) {
        await this.prisma.account_password_check.delete({
          where: {
            id: check[0]?.id ?? -1
          }
        })
      }

      await this.prisma.account_password_check.create({
        data: {
          account_id: Number(account_id),
          password: passwordHash,
          create_date: getTodayNowAdd7().toDate()
        }
      })
      return false
    }
  }

  //
  async accountReasonCreate(payload: any, userId: any) {
    const { account_id, id, ...withPayload } = payload

    // await this.prisma.$executeRawUnsafe(`
    //   SELECT setval(
    //     pg_get_serial_sequence('public.account_reason','id'),
    //     COALESCE((SELECT MAX(id) FROM public.account_reason), 0),
    //     true
    //   )
    // `);

    // ถ้าใช้อันข้างบนมันติด error
    // `ERROR: setval: value 0 is out of bounds for sequence "account_reason_id_seq" (1..2147483647)`
    await this.prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('public.account_reason','id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM public.account_reason), 1), 1),
        true
      )
    `)

    const reasonCreate = await this.prisma.account_reason.create({
      data: {
        ...withPayload,
        account: {
          connect: {
            id: Number(account_id)
          }
        },
        // ...(account_id !== null && {
        //   account: {
        //     connect: {
        //       id: account_id,
        //     },
        //   },
        // }),
        active: true,
        create_date: getTodayNowAdd7().toDate(),
        create_date_num: getTodayNowAdd7().unix(),
        create_by_account: {
          connect: {
            id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          }
        }
      }
    })
    await this.prisma.account.update({
      where: {
        id: Number(payload?.account_id ?? -1)
      },
      data: {
        status: payload?.status,
        update_date: getTodayNowAdd7().toDate(),
        update_by: Number(userId),
        update_date_num: getTodayNowAdd7().unix()
      }
    })

    return reasonCreate
  }

  async accountLocalGenPassword(id: any, userId: any) {
    const nowAt30 = getTodayNowAdd7().add(30, 'minute').toDate()

    const pass = generatePassword(10)
    const hashPassword = await genPass(pass)
    const passwords = {
      password: hashPassword?.hash
    }

    const account = await this.prisma.account.update({
      where: {
        id: Number(id)
      },
      data: {
        ...passwords,
        password_gen_origin: pass,
        password_gen_flag: true,
        update_date: getTodayNowAdd7().toDate(),
        update_by: Number(userId),
        update_date_num: getTodayNowAdd7().unix(),
        pass_gen_date: nowAt30,
        login_flag: null, //new https://app.clickup.com/t/86ernzz09
        listen_login_date: null //new https://app.clickup.com/t/86ernzz09
      }
    })
    return account
  }

  // async account() {
  //   const account = await this.prisma.account.findMany({
  //     where: {
  //       id: { not: 1 },
  //       account_manage: {
  //         some: {
  //           account_role: {
  //             some: {
  //               role: {
  //                 id: { not: 1 },
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },
  //     include: {
  //       account_manage: {
  //         include: {
  //           user_type: {
  //             include: {
  //               column_table_config: {
  //                 include: {
  //                   column_table: true,
  //                   column_field: true,
  //                 },
  //               },
  //             },
  //           },
  //           mode_account: true,
  //           division: true,
  //           group: {
  //             include: {
  //               division: true,
  //             },
  //           },
  //           account_role: {
  //             include: {
  //               role: {
  //                 where: {
  //                   active: true,
  //                 },
  //                 include: {
  //                   menus_config: {
  //                     include: {
  //                       menus: true,
  //                     },
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       },
  //       account_reason: {
  //         include: {
  //           create_by_account: {
  //             select: {
  //               id: true,
  //               email: true,
  //               first_name: true,
  //               last_name: true,
  //             },
  //           },
  //           update_by_account: {
  //             select: {
  //               id: true,
  //               email: true,
  //               first_name: true,
  //               last_name: true,
  //             },
  //           },
  //         },
  //       },
  //       type_account: true,
  //       created_by_account: {
  //         select: {
  //           id: true,
  //           email: true,
  //           first_name: true,
  //           last_name: true,
  //         },
  //       },
  //       updated_by_account: {
  //         select: {
  //           id: true,
  //           email: true,
  //           first_name: true,
  //           last_name: true,
  //         },
  //       },
  //       login_logs: {
  //         select: {
  //           id: true,
  //           create_date: true,
  //         },
  //         orderBy: {
  //           id: 'desc', // เรียง login_logs ตาม id ในลำดับที่ลดลง
  //         },
  //         take: 1,
  //       },
  //     },
  //     orderBy: {
  //       id: 'asc',
  //     },
  //   });
  //   return account;
  // }

  async emailOnly() {
    const account = await this.prisma.account.findMany({
      where: {
        id: { not: 1 }
      },
      select: {
        id: true,
        email: true,
        account_manage: {
          select: {
            group_id: true
          }
        }
      },
      orderBy: {
        id: 'asc'
      }
    })

    return account
  }

  async account(limit: number = 100, offset: number = 0, q: string, userId: string, firstName: string, userType: any, startDate: any, endDate: any, type: any, loginMode: any, orderByName: any, orderBy: any) {
    const startDate_ = startDate ? getTodayNowAdd7(startDate).toDate() : null
    const endDate_ = endDate ? getTodayNowAdd7(endDate).toDate() : null

    const toNumArr = (s?: string) =>
      String(s ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '')
        .map(Number)

    type SortDir = 'asc' | 'desc'

    /**
     * รองรับคีย์:
     * - login_mode        -> MIN(account_manage[].mode_account_id)
     * - user_id           -> account.user_id
     * - company_name      -> จาก account_manage[].group.company_name (เอาตัวแรกที่ไม่ว่าง)
     * - user_type         -> จาก account_manage[].user_type.name (ถ้าไม่มี name ใช้ id แทน)
     * - division_name     -> จาก account_manage[].division.division_name (ตัวแรกที่ไม่ว่าง)
     * - first_name        -> account.first_name
     * - last_name         -> account.last_name
     * - type              -> account.type_account_id (หรือ type_account.id ถ้าต้องการ)
     * - role_default      -> ชื่อ role ตัวแรกจาก account_manage[].account_role[].role (active=true)
     * - telephone         -> account.telephone
     * - email             -> account.email
     * - start_date        -> account.start_date
     * - end_date          -> account.end_date
     * - updated_by_account-> updated_by_account.first_name
     * - last_login        -> login_logs[0].create_date (timestamp)
     * - (fallback) id     -> account.id
     */
    function orderAndPaginateAccounts(
      rows: any[],
      {
        sortBy = 'id',
        sortDir = 'desc',
        offset = 0,
        limit = 20,
      }: {
        sortBy?: string
        sortDir?: SortDir
        offset?: number
        limit?: number
      }
    ) {
      // helper: ดึงค่าแรกที่ “ไม่ว่าง” จาก array ของ path
      const firstNonEmpty = <T>(xs: T[], pick: (x: T) => any) => {
        for (const x of xs || []) {
          const v = pick(x)
          if (v !== undefined && v !== null && v !== '') return v
        }
        return undefined
      }

      // เตรียม key สำหรับ sort ล่วงหน้า (เร็ว/เสถียร + handle null/empty)
      const prepared = rows.map((r) => {
        const ams = r?.account_manage ?? []

        const loginModeMin = (() => {
          const nums = ams.map((am: any) => Number(am?.mode_account_id)).filter(Number.isFinite) as number[]
          if (nums.length === 0) return Infinity // ไม่มีค่า → ไปท้ายตอน asc
          return Math.min(...nums)
        })()

        const divisionName = firstNonEmpty(ams, (am: any) => am?.division?.division_name) ?? ''
        const companyName = firstNonEmpty(ams, (am: any) => am?.group?.company_name) ?? ''
        const userTypeNameOrId = firstNonEmpty(ams, (am: any) => am?.user_type?.name ?? am?.user_type?.id) ?? ''

        const roleDefaultName = (() => {
          for (const am of ams) {
            const ars = am?.account_role ?? []
            for (const ar of ars) {
              const role = ar?.role
              if (!role) continue
              // คุณ filter active:true ตั้งแต่ query แล้ว
              return role?.name ?? role?.id ?? ''
            }
          }
          return ''
        })()

        const lastLoginTs = (() => {
          const d = r?.login_logs?.[0]?.create_date ? new Date(r.login_logs[0].create_date).getTime() : -Infinity // ไม่มี → ไปท้ายตอน desc
          return d
        })()

        const updatedByFirstName = r?.updated_by_account?.first_name ?? ''

        return {
          _sort: {
            id: r?.id ?? 0,
            user_id: r?.user_id ?? '',
            email: r?.email ?? '',
            first_name: r?.first_name ?? '',
            last_name: r?.last_name ?? '',
            telephone: r?.telephone ?? '',
            start_date: r?.start_date ? new Date(r.start_date).getTime() : -Infinity,
            end_date: r?.end_date ? new Date(r.end_date).getTime() : Infinity,
            type: r?.type_account_id ?? r?.type_account?.id ?? -Infinity,

            // จาก relation
            login_mode_min: loginModeMin,
            division_name: divisionName,
            company_name: companyName,
            user_type: userTypeNameOrId,
            role_default: roleDefaultName,
            last_login_ts: lastLoginTs,

            // updated by
            updated_by_first_name: updatedByFirstName
          },
          _data: r
        }
      })

      // map ชื่อคีย์ที่ client ส่ง → คีย์จริงใน _sort
      const keyMap: Record<string, keyof (typeof prepared)[number]['_sort']> = {
        login_mode: 'login_mode_min',
        user_id: 'user_id',
        company_name: 'company_name',
        user_type: 'user_type',
        division_name: 'division_name',
        first_name: 'first_name',
        last_name: 'last_name',
        type: 'type',
        role_default: 'role_default',
        telephone: 'telephone',
        email: 'email',
        start_date: 'start_date',
        end_date: 'end_date',
        updated_by_account: 'updated_by_first_name',
        last_login: 'last_login_ts',
        id: 'id'
      }

      const sortKey = keyMap[sortBy] ?? 'id'

      // tie-breakers: ให้ผลลัพธ์นิ่งขึ้น (id desc ต่อท้าย)
      const iteratees = [(x: any) => x._sort[sortKey], (x: any) => x._sort.id * -1]
      const dirs: SortDir[] = [sortDir, 'desc']

      const ordered = _.orderBy(prepared, iteratees as any, dirs as any)
      const paged = ordered.slice(offset, offset + limit).map((x) => x._data)
      return paged
    }

    const modeAccount = await this.prisma.mode_account.findMany({
      select: {
        name: true
      }
    })

    // console.time("acc")
    const qTrim = q?.trim()
    const qParts = qTrim ? qTrim.split(/\s+/).filter(Boolean) : []
    const matchingModeAccountNames = getMatchingModeAccountNames(
      qTrim,
      modeAccount.map((m) => m.name)
    )

    const qEscape = escapePostgresIlikeContains(qTrim)

    // รองรับค้นหาวันที่แบบ "12/11/2025", "/11/", "2025" ฯลฯ
    // - ถ้าเป็น fragment เช่น "/11/" หรือ "2025" จะค้นหาแบบ contains (%...%)
    // - ถ้าเป็น prefix ที่เหมือน dd/mm(/yyyy) จะค้นหาแบบ prefix (...%)
    const qDateFragmentRaw = qTrim ? qTrim.match(/[0-9/]+/)?.[0] : undefined
    const qDateFragment = qDateFragmentRaw && /^[0-9/]{2,}$/.test(qDateFragmentRaw) ? qDateFragmentRaw : undefined
    const qDateLike = qDateFragment && (/^\d{1,2}\/\d{0,2}(\/\d{0,4})?$/.test(qDateFragment) && !qDateFragment.startsWith('/') ? `${qDateFragment}%` : `%${qDateFragment}%`)

    // รองรับค้นหา start_date / end_date ด้วยรูปแบบ DD/MM/YYYY (เวลาไทย) และ prefix เช่น 12/1
    // รวมเป็น query เดียวเพื่อลดจำนวน prisma access
    let dateMatchedIds: number[] = []
    if (qDateLike) {
      const rows = await this.prisma.$queryRaw<{ id: number }[]>(
        Prisma.sql`
            SELECT "id"
            FROM "public"."account" a
            WHERE
              (
                a."start_date" IS NOT NULL
                AND to_char(((a."start_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'DD/MM/YYYY') ILIKE ${qDateLike}
              )
              OR
              (
                a."end_date" IS NOT NULL
                AND to_char(((a."end_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'DD/MM/YYYY') ILIKE ${qDateLike}
              )
              OR
              (
                a."update_date" IS NOT NULL
                AND to_char(((a."update_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'DD/MM/YYYY HH24:MI:SS') ILIKE ${qDateLike}
              )
              OR
              (
                EXISTS (
                  SELECT 1
                  FROM "public"."login_logs" ll
                  WHERE ll."account_id" = a."id"
                    AND ll."id" = (
                      SELECT MAX(ll2."id")
                      FROM "public"."login_logs" ll2
                      WHERE ll2."account_id" = a."id"
                    )
                    AND ll."create_date" IS NOT NULL
                    AND to_char(((ll."create_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok'), 'DD/MM/YYYY HH24:MI') ILIKE ${qDateLike}
                )
              )
          `
      )
      dateMatchedIds = _.uniq(rows.map((r) => r.id))
    }

    console.log('q : ', q);

    const escapeSearch = (value: string) => {
      return value
        .trim()
        .replace(/\\/g, '\\\\') // escape backslash ก่อน
        .replace(/%/g, '\\%')   // % ต้องเป็น %
        .replace(/_/g, '\\_')   // _ ต้องเป็น _
    }

    const search = q ? escapeSearch(q) : undefined

    const account = await this.prisma.account.findMany({
      where: {
        id: { not: 1 },
        account_manage: {
          some: {
            account_role: {
              some: {
                role: {
                  id: {
                    not: 1
                  }
                }
              }
            }
          }
        },
        ...(q
          ? {
              OR: [
                {
                  user_id: {
                    contains: search,
                    mode: 'insensitive'
                  }
                },
                {
                  email: {
                    contains: search,
                    mode: 'insensitive'
                  }
                },
                {
                  first_name: {
                    contains: search,
                    mode: 'insensitive'
                  }
                },
                {
                  last_name: {
                    contains: search,
                    mode: 'insensitive'
                  }
                },
                {
                  telephone: {
                    contains: search,
                    mode: 'insensitive'
                  }
                },
                {
                  type_account: {
                    name: {
                      contains: search,
                      mode: 'insensitive'
                    }
                  }
                },
                {
                  account_manage: {
                    some: {
                      account_role: {
                        some: {
                          role: {
                            name: {
                              contains: search,
                              mode: 'insensitive'
                            }
                          }
                        }
                      }
                    }
                  }
                },
                {
                  account_manage: {
                    some: {
                      division: {
                        division_name: {
                          contains: search,
                          mode: 'insensitive'
                        }
                      }
                    }
                  }
                },
                {
                  account_manage: {
                    some: {
                      group: {
                        name: {
                          contains: search,
                          mode: 'insensitive'
                        }
                      }
                    }
                  }
                },
                ...(matchingModeAccountNames.length > 0
                  ? [
                      {
                        account_manage: {
                          some: {
                            mode_account: {
                              name: {
                                in: matchingModeAccountNames,
                                mode: 'insensitive'
                              }
                            }
                          }
                        }
                      }
                    ]
                  : [
                      {
                        account_manage: {
                          some: {
                            mode_account: {
                              name: {
                                contains: search,
                                mode: 'insensitive'
                              }
                            }
                          }
                        }
                      }
                    ]),
                ...(qParts.length >= 2
                  ? [
                      {
                        updated_by_account: {
                          // dynamic token search:
                          // ทุกคำใน q ต้อง match ใน first_name หรือ last_name อย่างน้อยหนึ่งฟิลด์
                          AND: qParts.map((token) => ({
                            OR: [
                              {
                                first_name: {
                                  contains: token,
                                  mode: 'insensitive'
                                }
                              },
                              {
                                last_name: {
                                  contains: token,
                                  mode: 'insensitive'
                                }
                              }
                            ]
                          }))
                        }
                      }
                    ]
                  : []),
                ...(dateMatchedIds.length > 0
                  ? [
                      {
                        id: {
                          in: dateMatchedIds
                        }
                      }
                    ]
                  : []),
                {
                  updated_by_account: {
                    first_name: {
                      contains: search,
                      mode: 'insensitive'
                    }
                  }
                },
                {
                  updated_by_account: {
                    last_name: {
                      contains: search,
                      mode: 'insensitive'
                    }
                  }
                }
              ]
            }
          : {}),
        ...(type && {
          type_account: {
            id: {
              in: toNumArr(type)
            }
          }
        }),
        ...(loginMode && {
          account_manage: {
            some: {
              mode_account_id: Number(loginMode)
            }
          }
        }),
        ...(userId && {
          user_id: {
            contains: userId,
            mode: 'insensitive'
          }
        }),
        ...(firstName && {
          first_name: {
            contains: firstName,
            mode: 'insensitive'
          }
        }),
        ...(userType && {
          account_manage: {
            some: {
              user_type: {
                id: {
                  in: toNumArr(userType)
                }
              }
            }
          }
        }),
        ...(startDate && {
          start_date: {
            gte: startDate_
          }
        }),
        ...(endDate && {
          OR: [
            {
              end_date: null
            },
            {
              end_date: {
                lte: endDate_
              }
            }
          ]
        })
      },
      select: {
        id: true,
        email: true,
        active: true,
        status: true,
        start_date: true,
        end_date: true,
        detail: true,
        address: true,
        first_name: true,
        last_name: true,
        telephone: true,
        user_id: true,
        password_gen_origin: true,
        password_gen_flag: true,
        type_account_id: true,
        profile_url: true,
        create_date: true,
        update_date: true,
        account_manage: {
          include: {
            user_type: {
              include: {
                column_table_config: {
                  include: {
                    column_table: true,
                    column_field: true
                  }
                }
              }
            },
            mode_account: true,
            division: {
              select: {
                division_name: true,
                division_id: true,
                id: true,
                division_short_name: true
              }
            },
            group: {
              select: {
                id: true,
                id_name: true,
                name: true,
                company_name: true,
                division: {
                  select: {
                    division_name: true,
                    division_id: true,
                    id: true,
                    division_short_name: true
                  }
                }
              }
            },
            account_role: {
              select: {
                id: true,
                role_id: true,
                role: {
                  where: {
                    active: true
                  },
                  select: {
                    id: true,
                    name: true,
                    user_type_id: true
                    // menus_config: {
                    //   include: {
                    //     menus: true,
                    //   },
                    // },
                  }
                }
              }
            }
          }
        },
        account_reason: {
          select: {
            id: true,
            reason: true,
            status: true,
            active: true,
            account_id: true,
            create_date: true,
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          }
        },
        type_account: {
          select: {
            id: true,
            name: true,
            color: true
          }
        },
        created_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        updated_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        login_logs: {
          select: {
            id: true,
            create_date: true
          },
          orderBy: {
            id: 'desc' // เรียง login_logs ตาม id ในลำดับที่ลดลง
          },
          take: 1
        }
      }
      // skip: Number(offset),
      // take: Number(limit),
      // orderBy: { id: 'desc' },
      // orderBy: { account_manage: { _min: { mode_account_id: "asc" } } },
      // take: 1
    });
    // console.timeEnd("acc")

    const page = orderAndPaginateAccounts(account, {
      sortBy: orderByName, // หรือ 'last_login' / 'email' / 'id' ...
      sortDir: orderBy,
      offset: Number(offset),
      limit: Number(limit)
    })

    // const count = await this.prisma.account.count({
    //   where: {
    //     id: { not: 1 },
    //     account_manage: {
    //       some: {
    //         account_role: {
    //           some: {
    //             role: {
    //               id: { not: 1 },
    //             },
    //           },
    //         },
    //       },
    //     },
    //      ...(q
    //   ? {
    //       OR: [
    //         { email: { contains: q, mode: 'insensitive' } },
    //         { first_name: { contains: q, mode: 'insensitive' } },
    //         { last_name: { contains: q, mode: 'insensitive' } },
    //         { telephone: { contains: q, mode: 'insensitive' } },
    //         {
    //           account_manage: {
    //             some: {
    //               account_role: {
    //                 some: { role: { name: { contains: q, mode: 'insensitive' } } },
    //               },
    //             },
    //           },
    //         },
    //         {
    //           account_manage: {
    //             some: { division: { division_name: { contains: q, mode: 'insensitive' } } },
    //           },
    //         },
    //         {
    //           account_manage: {
    //             some: { group: { name: { contains: q, mode: 'insensitive' } } },
    //           },
    //         },
    //       ],
    //     }
    //   : {}),
    //   ...(type && {
    //       type_account:{
    //         id:{
    //           in: toNumArr(type)
    //         }
    //       }
    //     }),
    //   ...(loginMode && {
    //     account_manage:{
    //         some:{
    //           mode_account_id: Number(loginMode)
    //         }
    //       }
    //     }),
    //   ...(userId && {
    //       user_id: {
    //         contains: userId,
    //         mode: 'insensitive'
    //       }
    //     }),
    //   ...(firstName && {
    //       first_name: {
    //         contains: firstName,
    //         mode: 'insensitive'
    //       }
    //     }),
    //   ...(userType && {
    //       account_manage:{
    //         some:{
    //           group:{
    //             id:{
    //               in: toNumArr(userType)
    //             }
    //           }
    //         }
    //       }
    //     }),
    //   ...(startDate && {
    //       start_date:{
    //         gte: startDate_
    //       }
    //     }),
    //   ...(endDate && {
    //         OR: [
    //           { end_date: null },
    //           { end_date: { lte: endDate_ } },
    //         ],
    //       })
    //   },
    //   orderBy: { id: 'desc' },
    //   // orderBy: {
    //   //   id: 'asc',
    //   // },
    // });
    // return {
    //   total: count,
    //   data: account,
    //   limit: Number(limit),
    //   offset: Number(offset),
    // };

    return {
      total: account?.length,
      data: page,
      limit: Number(limit),
      offset: Number(offset)
    }
  }

  async checkUserId(user_id: any) {
    const account = await this.prisma.account.findFirst({
      where: {
        user_id: user_id
      }
    })
    return !!account
  }

  async checkUserIdUse(user_id: any, id: any) {
    const account = await this.prisma.account.findFirst({
      where: {
        user_id: user_id,
        id: {
          not: Number(id)
        }
      }
    })
    return !!account
  }

  //
  async registerAaccount(payload: any, userId: any) {
    try {
      const { account_manage, role_manage, start_date, end_date, ...dataWithout } = payload

      await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.account','id'),
          COALESCE((SELECT MAX(id) FROM public.account), 0),
          true
        )
      `)
      await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.account_manage','id'),
          COALESCE((SELECT MAX(id) FROM public.account_manage), 0),
          true
        )
      `)
      await this.prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('public.account_role','id'),
          COALESCE((SELECT MAX(id) FROM public.account_role), 0),
          true
        )
      `)

      const pass = generatePassword(10)
      const hashPassword = await genPass(pass)
      const nowAt30 = getTodayNowAdd7().add(30, 'minute').toDate()

      const account = await this.prisma.account.create({
        data: {
          ...dataWithout,
          password: account_manage?.mode_account_id === 2 ? hashPassword?.hash : null,
          active: true,
          password_gen_origin: account_manage?.mode_account_id === 2 ? pass : null,
          password_gen_flag: account_manage?.mode_account_id === 2 ? true : null,
          pass_gen_date: nowAt30,
          type_account_id: 1,
          start_date: start_date ? getTodayNowAdd7(start_date).toDate() : null,
          end_date: end_date ? getTodayNowAdd7(end_date).toDate() : null,
          create_date: getTodayNowAdd7().toDate(),
          create_by: Number(userId),
          // create_by_account: {
          //   connect: {
          //     id: Number(userId),
          //   },
          // },
          create_date_num: getTodayNowAdd7().unix()
        }
      })
      const accountManage = await this.prisma.account_manage.create({
        data: {
          account_id: account?.id,
          ...account_manage
        }
      })

      if (role_manage.length > 0) {
        for (let i = 0; i < role_manage.length; i++) {
          const res_create_account_role = await this.prisma.account_role.create({
            data: {
              account_manage_id: accountManage?.id,
              role_id: role_manage[i]?.id
            }
          })
        }
      }

      return {
        data: account,
        passwordGen: pass
      }
    } catch (error) {
      if ((error.code === 'P2002' && error.meta?.target.includes('email')) || error.meta?.target.includes('user_id')) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: !!error.meta?.target.includes('id_name') ? 'id_name' : 'email',
            error: `account ${!!error.meta?.target.includes('id_name') ? 'id_name' : 'email'} already exists. Please choose another ${!!error.meta?.target.includes('id_name') ? 'id_name' : 'email'}`
          },
          HttpStatus.BAD_REQUEST
        )
      }
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal server error'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  //
  async editAccount(id: any, payload: any, userId: any, req: any) {
    try {
      const { account_manage, role_manage, start_date, end_date, status, ...dataWithout } = payload

      await this.prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('public.account_manage','id'),
        COALESCE((SELECT MAX(id) FROM public.account_manage), 0),
        true
      )
    `)
      await this.prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('public.account_role','id'),
        COALESCE((SELECT MAX(id) FROM public.account_role), 0),
        true
      )
    `)
      await this.prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('public.account','id'),
        COALESCE((SELECT MAX(id) FROM public.account), 0),
        true
      )
    `)

      const findAcc = await this.prisma.account.findUnique({
        include: {
          account_manage: {
            include: {
              account_role: true
            }
          }
        },
        where: {
          id: Number(id)
        }
      })
      let pass = null
      let account = null
      if (account_manage?.mode_account_id === 1 || findAcc?.account_manage[0]?.mode_account_id === account_manage?.mode_account_id) {
        const password_gen_flag =
          account_manage?.mode_account_id === 1
            ? {}
            : {
              password_gen_flag: null
            }

        account = await this.prisma.account.update({
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            status: status,
            ...password_gen_flag,
            start_date: start_date ? getTodayNowAdd7(start_date).toDate() : null,
            end_date: end_date ? getTodayNowAdd7(end_date).toDate() : null,
            update_date: getTodayNowAdd7().toDate(),
            update_by: Number(userId),
            update_date_num: getTodayNowAdd7().unix()
          }
        })
        // คมมาเยือน
        // Atomicity (ทำให้สำเร็จพร้อมกันหรือย้อนกลับทั้งชุด): ถ้าลบสำเร็จแต่สร้างล้มเหลว (เช่น constraint ชน, network ตัด) จะเกิดสถานะผิดพลาด (ข้อมูลหายไปเลย). ห่อใน transaction → ถ้ามีข้อผิดพลาด จะ rollback คำสั่ง
        // Delete children first to satisfy FK constraints (account_role -> account_manage)
        await this.prisma.$transaction(async (tx) => {
          const existingAccountManage = await tx.account_manage.findMany({
            where: {
              account_id: account?.id ?? -1
            },
            select: {
              id: true
            }
          })

          const existingAccountManageIds = existingAccountManage.map((e: any) => e?.id)

          if (existingAccountManageIds.length > 0) {
            await tx.account_role.deleteMany({
              where: {
                account_manage_id: {
                  in: existingAccountManageIds
                }
              }
            })
          }

          await tx.account_manage.deleteMany({
            where: {
              account_id: account?.id ?? -1
            }
          })
        })

        const accountManage = await this.prisma.account_manage.create({
          data: {
            account_id: account?.id,
            ...account_manage
          }
        })

        // return null
        if (role_manage.length > 0) {
          for (let i = 0; i < role_manage.length; i++) {
            await this.prisma.account_role.create({
              data: {
                account_manage_id: accountManage?.id,
                role_id: role_manage[i]?.id
              }
            })
          }
        }

        // ขอย้ายมาล่างสุด
        // await this.prisma.account_role.deleteMany({
        //   where: { account_manage_id: null },
        // });

        // await this.prisma.$transaction([
        //   this.prisma.account_role.deleteMany({ where: { account_manage_id: null }, }),
        // ]);
      } else {
        pass = generatePassword(10)
        const hashPassword = await genPass(pass)
        const passwords = {
          password: hashPassword?.hash
        }
        const nowAt30 = getTodayNowAdd7().add(30, 'minute').toDate()

        account = await this.prisma.account.update({
          where: {
            id: Number(id)
          },
          data: {
            ...dataWithout,
            ...passwords,
            password_gen_origin: pass,
            password_gen_flag: true,
            pass_gen_date: nowAt30,
            start_date: start_date ? getTodayNowAdd7(start_date).toDate() : null,
            end_date: end_date ? getTodayNowAdd7(end_date).toDate() : null,
            update_date: getTodayNowAdd7().toDate(),
            update_by: Number(userId),
            update_date_num: getTodayNowAdd7().unix()
          }
        })
        // Delete children first to satisfy FK constraints (account_role -> account_manage)
        await this.prisma.$transaction(async (tx) => {
          const existingAccountManage = await tx.account_manage.findMany({
            where: {
              account_id: account?.id ?? -1
            },
            select: {
              id: true
            }
          })

          const existingAccountManageIds = existingAccountManage.map((e: any) => e?.id)

          if (existingAccountManageIds.length > 0) {
            await tx.account_role.deleteMany({
              where: {
                account_manage_id: {
                  in: existingAccountManageIds
                }
              }
            })
          }

          await tx.account_manage.deleteMany({
            where: {
              account_id: account?.id ?? -1
            }
          })

          // Keep existing behavior: cleanup orphaned rows, but do it inside the same transaction
          try {
          await tx.account_role.deleteMany({
            where: {
              account_manage_id: null
            }
          })
          } catch (error) {
            this.logger.log('editAccount clear account_role null error: ', error)
          }
        })
        const accountManage = await this.prisma.account_manage.create({
          data: {
            account_id: account?.id,
            ...account_manage
          }
        })
        if (role_manage.length > 0) {
          for (let i = 0; i < role_manage.length; i++) {
            await this.prisma.account_role.create({
              data: {
                account_manage_id: accountManage?.id,
                role_id: role_manage[i]?.id
              }
            })
          }
        }
      }
      const roleOld = (findAcc?.account_manage[0]?.account_role || []).map((e: any) => e?.role_id)
      const roleNew = (payload?.role_manage || []).map((e: any) => e?.id)

      // (หายไป)
      const removedItems = roleOld.filter((item: any) => {
        return !roleNew.includes(item)
      })
      const unchangedItems = roleOld.filter((item: any) => {
        return roleNew.includes(item)
      })
      // (มาใหม่)
      // const addedItems = roleNew.filter((item:any) => { return !roleOld.includes(item) });

      if (findAcc?.account_manage[0]?.mode_account_id !== account_manage?.mode_account_id || removedItems.length > 0) {
        for (let i = 0; i < removedItems.length; i++) {
          await this.prisma.system_login_account.deleteMany({
            where: {
              account_id: Number(id),
              system_login: {
                role_id: removedItems[i]
              }
            }
          })
        }
        for (let i = 0; i < removedItems.length; i++) {
          const systemLoginOneRole = await this.systemLoginOneRole(removedItems[i])
          await writeReq(this.prisma, 'DAM', req, 'systemLogin', 'changeFromAccount', systemLoginOneRole)
        }

        for (let i = 0; i < unchangedItems.length; i++) {
          if (findAcc?.account_manage[0]?.mode_account_id !== account_manage?.mode_account_id) {
            const systemLoginOneRole = await this.systemLoginOneRole(unchangedItems[i])
            await writeReq(this.prisma, 'DAM', req, 'systemLogin', 'changeFromAccount', systemLoginOneRole)
          }
        }
      }
      return {
        data: {
          id: account?.id
        },
        passwordGen: pass
      }
    } catch (error) {
      if ((error.code === 'P2002' && error.meta?.target?.includes('email')) || error.meta?.target?.includes('user_id')) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: !!error.meta?.target?.includes('id_name') ? 'id_name' : 'email',
            error: `account ${!!error.meta?.target?.includes('id_name') ? 'id_name' : 'email'} already exists. Please choose another ${!!error.meta?.target?.includes('id_name') ? 'id_name' : 'email'}`
          },
          HttpStatus.BAD_REQUEST
        )
      }
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal server error'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async convertUrlToBase64(url: any, type: any) {
    const axios = require('axios')
    let data = JSON.stringify({
      url: url,
      format: type?.toUpperCase() || ''
    })

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `http://${process.env.IP_URL}:${process.env.KONG_PORT}/files/convert-to-base64/`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: data
    }

    const response = await axios.request(config)
    return response?.data?.base64
  }

  async signature(id: any, payload: any, userId: any, req: any) {
    try {
      const { signature, mimetype } = payload

      const base64s = await this.convertUrlToBase64(signature, mimetype)

      const signatures = await this.prisma.account.update({
        where: {
          id: Number(id)
        },
        data: {
          signature: signature,
          signature_base_64: base64s,
          update_date: getTodayNowAdd7().toDate(),
          update_by: Number(userId),
          update_date_num: getTodayNowAdd7().unix()
        }
      })
      return signatures
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

  async systemLoginOneRole(id: any) {
    const systemLogin = await this.prisma.system_login.findFirst({
      include: {
        role: true,
        mode_account: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        system_login_account: {
          include: {
            account: {
              select: {
                id: true,
                email: true,
                status: true,
                password_gen_flag: true,
                password_gen_origin: true
              }
            },
            create_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            update_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            }
          }
        }
      },
      where: {
        role_id: Number(id)
      }
    })
    return systemLogin
  }

  async forgotPassword(email: any) {
    const account = await this.prisma.account.findUnique({
      where: {
        email: email.toLowerCase()
      }
    })
    const token = await genTokenReset(this.jwtService, account?.id, account?.email)

    if (!!!account?.email) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: null,
          error: `error`,
          message: 'error'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const resMail = await this.emailClientService.sendEmail(account?.email, 'forgot-password', `${process.env.WEBS}/en/reset-password?ref=${token}`)
      return resMail
    }
  }

  async getLink(email: any) {
    const account = await this.prisma.account.findUnique({
      where: {
        email: email
      }
    })
    const token = await genTokenReset(this.jwtService, account?.id, account?.email)

    if (!!!account?.email) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: null,
          error: `error`,
          message: 'error'
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      return {
        link: `${process.env.WEBS}/en/reset-password?ref=${token}`
      }
    }
  }

  async resetPassword(ref: any, passwords: any) {
    const decoded = this.jwtService.decode(ref)
    if (decoded?.sub) {
      const password = await genPass(passwords)
      const addPass = await this.addPass(decoded?.sub, passwords, password?.hash)

      if (addPass) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: `Cannot reuse a previous password. Please choose a new password that has not been used in the last 30 times`,
            error: `error`
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const account = await this.prisma.account.update({
        where: {
          id: Number(decoded?.sub ?? -1)
        },
        data: {
          password: password?.hash,
          password_gen_flag: false,
          login_flag: null,
          listen_login_date: null
        }
      })
      return {
        id: Number(decoded?.sub),
        account: account
      }
    } else {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: null,
          error: `error`
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  async checkPassword(ref: any, passwords: any) {
    const decoded = this.jwtService.decode(ref)
    if (decoded?.sub) {
      const password = await genPass(passwords)
      const addPass = await this.addPass(decoded?.sub, passwords, password?.hash)

      if (addPass) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: `password ซ้ำ`,
            error: `error`
          },
          HttpStatus.BAD_REQUEST
        )
      } else {
        return true
      }
    } else {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: null,
          error: `error`
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  async genToken(payload: any) {
    return await this.jwtService.signAsync(payload)
  }

  async findAccountDate({ username, pass }) {
    const user: any = await this.prisma.account.findUnique({
      where: {
        email: username
      }
    })
    if(process.env.NODE_ENV === 'development') return true;
    const isMatch = await bcrypt.compare(pass, user?.password)
    if (!isMatch) {
      throw new UnauthorizedException()
    } else {
      const nowAt = getTodayNowAdd7()

      const startDate = getTodayStartAdd7(user?.start_date).toDate()
      const endDate = user?.end_date ? getTodayEndAdd7(user?.end_date).toDate() : null

      // ตรวจสอบเงื่อนไข
      const isInRange = nowAt.isAfter(startDate) && (endDate === null || nowAt.isBefore(dayjs(endDate)))

      if (!isInRange) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            key: `your user is inactivated, please contact administrator`,
            error: `your user is inactivated, please contact administrator`
          },
          HttpStatus.BAD_REQUEST
        )
      }
      return true
    }
  }

  async findAccountLoginFlag({ username, pass }) {
    const user: any = await this.prisma.account.findUnique({
      where: {
        email: username
      },
      include: {
        account_manage: {
          include: {
            account_role: {
              include: {
                role: true
              }
            }
          }
        }
      }
    })

    const env = process.env.NODE_ENV ?? 'development'
    const pttEnv = ['production', 'pre-production', 'dr']
    if (!!user?.login_flag) {
      // Only allow super admin bypass in non-production environments
      if (pttEnv.includes(env)) {
        const isSuperAdmin = user?.account_manage?.some((item: any) => item?.account_role?.some((account_role: any) => account_role?.role?.name == 'Super Admin Default' || account_role?.role?.id == 1))

        if (isSuperAdmin) {
          return true
        }
      }

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: `Your account already logged-in in another device.`,
          error: `Your account already logged-in in another device.`
        },
        HttpStatus.BAD_REQUEST
      )
    }
    return true
  }

  async findAccountLoginFlagUpdateActive({ username }) {
    const nowAt = getTodayNowAdd7().toDate()

    await this.prisma.account.update({
      where: {
        email: username
      },
      data: {
        login_flag: true,
        listen_login_date: nowAt
      }
    })
    return true
  }

  async updateLogoutFlag(userId: any) {
    await this.prisma.account.update({
      where: {
        id: Number(userId)
      },
      data: {
        login_flag: null,
        listen_login_date: null
      }
    })
    return true
  }

  async updateLogoutFlagEmail(email: any) {
    await this.prisma.account.updateMany({
      where: {
        email: email
      },
      data: {
        login_flag: null,
        listen_login_date: null
      }
    })
    return true
  }

  async updateFlagTaC(userId: any) {
    const nowAt = getTodayNowAdd7().toDate()

    await this.prisma.account.update({
      where: {
        id: Number(userId)
      },
      data: {
        login_flag: true,
        listen_login_date: nowAt
      }
    })
    return true
  }

  async updateLoginListen(userId: any) {
    const ck = await this.prisma.account.findFirst({
      where: {
        id: Number(userId)
      }
    })
    if (ck.listen_login_date === null) {
      return false
    } else {
      const nowAt = getTodayNowAdd7().toDate()

      await this.prisma.account.update({
        where: {
          id: Number(userId)
        },
        data: {
          login_flag: true,
          listen_login_date: nowAt
        }
      })
      return true
    }
  }

  async findAccount({ username, pass }) {
    const user: any = await this.prisma.account.findUnique({
      where: {
        email: username
      }
    })
    // tpasystem.pttplc.com
    if(process.env.NODE_ENV === 'development') return user;
    const isMatch = await bcrypt.compare(pass, user?.password)
    if (!isMatch) {
      throw new UnauthorizedException()
    }
    return user
  }

  async ckGen30Pass(user: any) {
    if (user?.password_gen_flag) {
      const nowAt = getTodayNowAdd7()
      const passGenDate = getTodayNowAdd7(user?.pass_gen_date)
      const isPassGenDateBeforeNow = passGenDate.isBefore(nowAt)

      return isPassGenDateBeforeNow
    } else {
      return false
    }
  }

  async notiread(userId: any) {
    return this.prisma.noti_inapp_read.findMany({
      where: {
        create_by: Number(userId)
      }
    })
  }

  async notireadActive(payload: any, userId: any) {
    const { data } = payload
    const account = await this.prisma.account.findFirst({
      where: {
        id: Number(userId)
      }
    })
    for (let i = 0; i < data.length; i++) {
      await this.prisma.noti_inapp_read.create({
        data: {
          email: account?.email,
          id_noti: Number(data[i]),
          create_by: Number(userId),
          create_date: dayjs().toDate()
        }
      })
    }
    return true
  }
}
