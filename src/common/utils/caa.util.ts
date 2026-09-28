import axios from 'axios';
import { HttpException, HttpStatus } from '@nestjs/common';

const caa_credentail = {
  "project_code": process.env.CAA_PROJECT_CODE,
  "project_pwd": process.env.CAA_PROJECT_PWD,
  "host": process.env.CAA_HOST
}

const ad_credentail = {
  "name": process.env.AD_NAME,
  "tenant": process.env.AD_TENANT,
  "tenant_name": process.env.AD_TENANT_NAME || process.env.AD_NAME,
  "client_id": process.env.AD_CLIENT_ID,
  "app_display_name": process.env.AD_APP_DISPLAY_NAME || process.env.AD_NAME,
  "secret": process.env.AD_SECRET,
}

const b2c_credentail = {
  "name": process.env.B2C_NAME,
  "tenant": process.env.B2C_TENANT,
  "tenant_name": process.env.B2C_TENANT_NAME || process.env.B2C_NAME,
  "client_id": process.env.B2C_CLIENT_ID,
  "app_display_name": process.env.B2C_APP_DISPLAY_NAME || process.env.B2C_NAME,
  "secret": process.env.B2C_SECRET,
  "policy": process.env.B2C_SIGNIN_POLICY,
}

const caa_bypass = process.env.CAA_BYPASS === 'true';
const caa_system_user = process.env.CAA_SYSTEM_USER || 'tpasystem@pttplc.com';
const message_caa_fail =
  "Centralized Authentication failed:";
const message_caa_sync =
  "Your account is being synchronized with Centralized Authentication. Please wait 2–3 minutes and try again.";

type AztDoServiceParameter = {
  k: string;
  v: any;
}

type AztDoServiceOptions = {
  accessToken?: string;
  appUser?: string;
  reqTransactionId?: string;
  stateName?: string;
  extraXml?: string;
  timeout?: number;
}

type CaaRoleUser = {
  user_id: string;
  user_name: string;
  tenant_id: string;
  tenant_name: string;
  client_id: string;
  app_display_name: string;
  full_name: string;
}

type CaaAuthType = 'AD' | 'B2C';

export class CAA {
  private caaAccessToken: string = null;

  /*
  */
  // *export function
  async authAD(access_token: string, email: string, roleName: string, by: string = caa_system_user) {
    console.log(`[INFO][authAD]: processing ....`);

    const params = {
      authType: 'AD' as CaaAuthType, accessToken: access_token, email: email, roleName: roleName, by: by,
    }
    if (!caa_bypass) {
      await this.syncLoginUserRole(params);
    }
    else {
      this.syncLoginUserRoleInBackground(params);
      this.sleep(1000); // * wait for 1 second to let background task start, to increase the chance that CA&A validation is called after syncLoginUserRole, which can be helpful for testing purpose when we want to verify the behavior of CA&A validation without bypass
    }

    const endpoint = 'auth/ad'
    const encryptData = this.encryptBase64({
      tenant_id: ad_credentail.tenant,
      client_id: ad_credentail.client_id,
      access_token: access_token
    });

    const data = {
      "function_id": "F100011", //!Fix value of this function always be "F100011"
      "app_user": `${caa_credentail.project_code}`,
      "req_transaction_id": `${this.getRandomnumber()}`,
      "state_name": "", //no descrition
      "req_parameters": [
        {
          "k": "data",
          "v": encryptData
        }
      ],
      "extra_xml": ""
    }

    if (caa_bypass) {
      console.log(`[DEBUG][authAD]: access_token=${access_token}`);
      const isValidWithoutCAA = await this.validateTokenWithoutCAA(access_token, false);
      console.log(`[INFO][authAD]: bypass validate token from CA&A ${isValidWithoutCAA}`);
      this.runBackground('authAD', async () => {
        await this.validateADWithCAA(endpoint, data);
      });
      return isValidWithoutCAA;
    }

    try {
      return await this.validateADWithCAA(endpoint, data);
    }
    catch (error) {
      console.log('[ERROR][authAD]: CA&A validation failed', error);
      return false
    }
  }

  async authB2C(access_token: string, email: string, roleName: string, by: string = caa_system_user) {
    console.log(`[INFO][authB2C]: processing ....`);
    const params = {
      authType: 'B2C' as CaaAuthType, accessToken: access_token, email: email, roleName: roleName, by: by,
    }
    if (!caa_bypass) {
      await this.syncLoginUserRole(params);
    }
    else {
      this.syncLoginUserRoleInBackground(params);
      this.sleep(1000);
    }
    const endpoint = `auth/b2c/${b2c_credentail.client_id}`
    const encryptData = this.encryptBase64({
      tenant_id: b2c_credentail.tenant,
      client_id: b2c_credentail.client_id,
      validated_claims: "", //!Parameter name that system use, always blank.
      object_id: "" //!Parameter name that system use, always blank.
    });

    const data = {
      "function_id": "F100011", //Fix value of this function always be "F100011"
      "app_user": `${caa_credentail.project_code}`,
      "req_transaction_id": `${this.getRandomnumber()}`,
      "state_name": "", //no descrition
      "req_parameters": [
        {
          "k": "data",
          "v": encryptData
        }
      ],
      "extra_xml": ""
    }

    if (caa_bypass) {
      console.log(`[DEBUG][authB2C]: access_token=${access_token}`);
      let isValidWithoutCAA = await this.validateTokenWithoutCAA(access_token, true);
      // ! temporary bypass Azure B2C do not send any token
      if (access_token === "") {
        isValidWithoutCAA = true;
      }

      console.log(`[INFO][authB2C]: bypass validate token from CA&A ${isValidWithoutCAA}`);
      this.runBackground('authB2C', async () => {
        await this.validateB2CWithCAA(endpoint, data, access_token);
      });
      return isValidWithoutCAA;
    }

    try {
      return await this.validateB2CWithCAA(endpoint, data, access_token);
    }
    catch (error) {
      console.log('[ERROR][authB2C]: CA&A validation failed', error);
      return false
    }
  }

  async createRole(params: {
    name: string;
    by: string;
    description?: string;
    roleType?: string;
    menu?: any;
    userRoles?: any[];
    status?: string;
    reqTransactionId?: string;
    extraXml?: string;
  }) {
    const data = {
      "name": params.name,
      "project_code": caa_credentail.project_code,
      "role_type": params.roleType || 'SPECIAL',
      "description": params.description || '',
      "menu": params.menu || '',
      "user_roles": params.userRoles || [],
      "status": params.status || 'ACTIVE',
      "created_by": params.by,
    }

    return this.requestAztDoService('F100032', [
      { "k": "by", "v": params.by },
      { "k": "data", "v": data },
    ], {
      reqTransactionId: params.reqTransactionId,
      extraXml: params.extraXml,
      timeout: 20000,
    });
  }

  createRoleInBackground(params: {
    name: string;
    by?: string;
    extraXml?: string;
  }) {
    const by = params.by || caa_system_user;
    this.runBackground('createRoleInBackground', async () => {
      const response = await this.createRole({
        name: params.name,
        by: by,
        extraXml: params.extraXml || 'test no extra xml',
      });
      if (this.getResponseCode(response) !== '1') {
        console.log(`[ERROR][createRoleInBackground]: create role fail name=${params.name} code=${this.getResponseCode(response)} desc=${this.getResponseDesc(response)}`);
        return;
      }
      console.log(`[INFO][createRoleInBackground]: created role name=${params.name}`);
    });
  }

  async updateRole(params: {
    roleId: string;
    name: string;
    by: string;
    description?: string;
    roleType?: string;
    menu?: any;
    status?: string;
    reqTransactionId?: string;
  }) {
    const data = {
      "id": params.roleId,
      "name": params.name,
      "role_type": params.roleType || 'SPECIAL',
      "description": params.description || '',
      "menu": params.menu || '',
      "status": params.status || 'ACTIVE',
      "updated_by": params.by,
    }

    return this.requestAztDoService('F100039', [
      { "k": "by", "v": params.by },
      { "k": "data", "v": data },
    ], {
      reqTransactionId: params.reqTransactionId,
      timeout: 20000,
    });
  }

  updateRoleInBackground(params: {
    oldName?: string;
    name: string;
    by?: string;
    description?: string;
  }) {
    const by = params.by || caa_system_user;
    this.runBackground('updateRoleInBackground', async () => {
      const roleName = params.oldName || params.name;
      const roleResponse = await this.getRoleByName(roleName);
      const role = this.findCaaRole(roleResponse?.Data, roleName);

      if (this.getResponseCode(roleResponse) !== '1' && this.getResponseCode(roleResponse) !== '10000002') { // *10000002 == data not found, which means role not exist, can treat as need to create new role  
        console.log(`[ERROR][updateRoleInBackground]: get role fail name=${roleName} code=${this.getResponseCode(roleResponse)} desc=${this.getResponseDesc(roleResponse)}`);
        return;
      }

      if (this.getResponseCode(roleResponse) == '1' && role?.id) {
        const response = await this.updateRole({
          roleId: role.id,
          name: params.name,
          by: by,
          description: params.description || '',
        });
        if (this.getResponseCode(response) !== '1') {
          console.log(`[ERROR][updateRoleInBackground]: update role fail name=${params.name} code=${this.getResponseCode(response)} desc=${this.getResponseDesc(response)}`);
          return;
        }
      }
      else if (this.getResponseCode(roleResponse) === '10000002') { // *10000002 == data not found, which means role not exist, can create new role    
        const createResponse = await this.createRole({
          name: params.name,
          by: by,
          description: params.description || '',
        });
        if (this.getResponseCode(createResponse) !== '1') {
          console.log(`[ERROR][updateRoleInBackground]: create role fail name=${params.name} code=${this.getResponseCode(createResponse)} desc=${this.getResponseDesc(createResponse)}`);
          return;
        }
      }
      console.log(`[INFO][updateRoleInBackground]: updated role oldName=${roleName} name=${params.name}`);
    });
  }

  async updateOrAssignUserToRole(params: {
    roleId: string;
    by: string;
    name?: string;
    description?: string;
    roleType?: string;
    menu?: any;
    status?: string;
    userRole?: CaaRoleUser;
    accessToken?: string;
    reqTransactionId?: string;
  }) {
    if (params.userRole) {
      const data = {
        "role_id": params.roleId,
        "user_role": params.userRole,
        "updated_by": params.by,
      }

      return this.requestAztDoService('F100038', [
        { "k": "by", "v": params.by },
        { "k": "data", "v": data },
      ], {
        accessToken: params.accessToken,
        reqTransactionId: params.reqTransactionId,
        timeout: 20000,
      });
    }

    if (!params.name) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'name is required when updating a CA&A role' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const data = {
      "id": params.roleId,
      "name": params.name,
      "role_type": params.roleType || 'SPECIAL',
      "description": params.description || '',
      "menu": params.menu || '',
      "status": params.status || 'ACTIVE',
      "updated_by": params.by,
    }

    return this.requestAztDoService('F100039', [
      { "k": "by", "v": params.by },
      { "k": "data", "v": data },
    ], {
      accessToken: params.accessToken,
      reqTransactionId: params.reqTransactionId,
      timeout: 20000,
    });
  }

  async clearUserRoles(params: {
    userId: string;
    by: string;
    accessToken?: string;
    reqTransactionId?: string;
  }) {
    const data = {
      "user_id": params.userId,
      "project_code": caa_credentail.project_code,
    }

    return this.requestAztDoService('F100048', [
      { "k": "by", "v": params.by },
      { "k": "data", "v": data },
    ], {
      accessToken: params.accessToken,
      reqTransactionId: params.reqTransactionId,
      timeout: 20000,
    });
  }

  async assignRolesToUser(params: {
    userId: string;
    tenantId: string;
    clientId: string;
    roleList: string[];
    by: string;
    accessToken?: string;
    reqTransactionId?: string;
  }) {
    const data = {
      "user_id": params.userId,
      "tenant_id": params.tenantId,
      "client_id": params.clientId,
      "project_code": caa_credentail.project_code,
      "role_list": params.roleList,
    }

    return this.requestAztDoService('F100049', [
      { "k": "by", "v": params.by },
      { "k": "data", "v": data },
    ], {
      accessToken: params.accessToken,
      reqTransactionId: params.reqTransactionId,
      timeout: 20000,
    });
  }

  syncLoginUserRoleInBackground(params: {
    authType: CaaAuthType;
    accessToken: string;
    email: string;
    roleName: string;
    by?: string;
  }) {
    this.runBackground('syncLoginUserRole', async () => {
      await this.syncLoginUserRole(params);
    });
  }

  syncUserRoleInBackground(params: {
    account?: any;
    email?: string;
    roleName?: string;
    by?: string;
  }) {
    this.runBackground('syncUserRole', async () => {
      await this.syncUserRole(params);
    });
  }

  async syncUserRole(params: {
    account?: any;
    email?: string;
    roleName?: string;
    by?: string;
  }): Promise<boolean> {
    const email = (params.email || params.account?.email || '').toLowerCase();
    const roleName = params.roleName || this.getAccountRoleName(params.account);
    const by = params.by || caa_system_user;

    if (!email) {
      console.log(`[ERROR][syncUserRole]: missing email`);
      return false;
    }
    if (!roleName) {
      console.log(`[ERROR][syncUserRole]: missing local role name email=${email}`);
      return false;
    }

    try {
      const authType = this.getAuthTypeByEmail(email);
      const identity = this.getIdentityCredential(authType);
      const userResponse = await this.getUserByEmail(email, identity);
      const user = this.findCaaUser(userResponse?.Data, email);
      if (this.getResponseCode(userResponse) !== '1' || !user?.id) {
        console.log(`[ERROR][syncUserRole]: not found CA&A user email=${email} authType=${authType} code=${this.getResponseCode(userResponse)} desc=${this.getResponseDesc(userResponse)}`);
        return false;
      }

      const roleResponse = await this.getRoleByName(roleName);
      const role = this.findCaaRole(roleResponse?.Data, roleName);
      if (this.getResponseCode(roleResponse) !== '1' || !role?.id) {
        console.log(`[ERROR][syncUserRole]: not found CA&A role name=${roleName} email=${email} code=${this.getResponseCode(roleResponse)}`);
        return false;
      }

      const shouldSync = await this.shouldSyncLoginUserRole(user.id, roleName);
      if (!shouldSync) {
        console.log(`[INFO][syncUserRole]: role already synced role=${roleName} email=${email}`);
        return true;
      }

      const clearResponse = await this.clearUserRoles({
        userId: user.id,
        by: by,
      });
      if (this.getResponseCode(clearResponse) !== '1' && this.getResponseCode(clearResponse) !== '10000002') { // *10000002 == data not found, which means user has no role, can ignore this error and continue to assign role
        console.log(`[ERROR][syncUserRole]: clear user roles fail role=${roleName} email=${email} code=${this.getResponseCode(clearResponse)} desc=${this.getResponseDesc(clearResponse)}`);
        return false;
      }

      const assignResponse = await this.assignRolesToUser({
        userId: user.id,
        tenantId: identity.tenant_id,
        clientId: identity.client_id,
        roleList: [role.id],
        by: by,
      });
      if (this.getResponseCode(assignResponse) !== '1') {
        console.log(`[ERROR][syncUserRole]: assign user to role fail role=${roleName} email=${email} code=${this.getResponseCode(assignResponse)} desc=${this.getResponseDesc(assignResponse)}`);
        return false;
      }

      console.log(`[INFO][syncUserRole]: synced role=${roleName} email=${email}`);
      return true;
    }
    catch (error: any) {
      const message = error?.message || error?.response?.statusText;
      console.log(`[ERROR][syncUserRole]: sync failed email=${email} message=${message}`);
      return false;
    }
  }

  async syncLoginUserRole(params: {
    authType: CaaAuthType;
    accessToken: string;
    email: string;
    roleName: string;
    by?: string;
  }): Promise<boolean> {
    console.log(`[INFO][syncLoginUserRole]: processing .... email=${params.email} roleName=${params.roleName}`);
    const decodedToken = this.decodeAccessToken(params.accessToken);
    const oid = decodedToken?.payload?.oid;

    if (!oid) {
      console.log(`[ERROR][syncLoginUserRole]: missing Azure oid email=${params.email}`);
      return false;
    }
    if (!params.roleName) {
      console.log(`[ERROR][syncLoginUserRole]: missing local role name email=${params.email}`);
      return false;
    }

    try {
      const identity = this.getIdentityCredential(params.authType);
      const userResponse = await this.requestCaaRest('post', 'user/getUser', {
        "tenant_id": identity.tenant_id,
        "client_id": identity.client_id,
        "user_id": oid,
        "filter": "",
      });

      if (this.getResponseCode(userResponse) !== '1' || !userResponse?.Data) {
        console.log(`[ERROR][syncLoginUserRole]: getUser fail email=${params.email} code=${this.getResponseCode(userResponse)} desc=${this.getResponseDesc(userResponse)}`);
        return false;
      }

      const roleResponse = await this.getRoleByName(params.roleName);

      const role = this.findCaaRole(roleResponse?.Data, params.roleName);
      if (this.getResponseCode(roleResponse) !== '1' || !role?.id) {
        console.log(`[ERROR][syncLoginUserRole]: not found CA&A role name=${params.roleName} email=${params.email} code=${this.getResponseCode(roleResponse)}`);
        return false;
      }

      const by = params.by || params.email;
      const shouldSync = await this.shouldSyncLoginUserRole(oid, params.roleName);
      if (!shouldSync) {
        console.log(`[INFO][syncLoginUserRole]: role already synced role=${params.roleName} email=${params.email}`);
        return true;
      }

      const clearResponse = await this.clearUserRoles({
        userId: oid,
        by: by,
      });
      if (this.getResponseCode(clearResponse) !== '1' && this.getResponseCode(clearResponse) !== '10000002') { // *10000002 == data not found, which means user has no role, can ignore this error and continue to assign role
        console.log(`[ERROR][syncLoginUserRole]: clear user roles fail role=${params.roleName} email=${params.email} code=${this.getResponseCode(clearResponse)} desc=${this.getResponseDesc(clearResponse)}`);
        return false;
      }

      const assignResponse = await this.assignRolesToUser({
        userId: oid,
        tenantId: identity.tenant_id,
        clientId: identity.client_id,
        roleList: [role.id],
        by: caa_system_user,
      });
      if (this.getResponseCode(assignResponse) !== '1') {
        console.log(`[ERROR][syncLoginUserRole]: assign user to role fail role=${params.roleName} email=${params.email} code=${this.getResponseCode(assignResponse)} desc=${this.getResponseDesc(assignResponse)}`);
        return false;
      }

      console.log(`[INFO][syncLoginUserRole]: synced role=${params.roleName} email=${params.email}`);
      return true;
    }
    catch (error: any) {
      const message = error?.message || error?.response?.statusText;
      console.log(`[ERROR][syncLoginUserRole]: sync failed email=${params.email} message=${message}`);
      return false;
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async shouldSyncLoginUserRole(userId: string, roleName: string) {
    try {
      const userRoleResponse = await this.requestCaaRest('post', 'user/getUserRole', {
        "project_code": caa_credentail.project_code,
        "cmdb_id": "",
        "user_id": userId,
        "status": "ACTIVE",
      });

      if (this.getResponseCode(userRoleResponse) !== '1' && this.getResponseCode(userRoleResponse) !== '10000002') { // *10000002 == data not found, which means user has no role, can treat as need to sync
        console.log(`[ERROR][shouldSyncLoginUserRole]: getUserRole fail userId=${userId} code=${this.getResponseCode(userRoleResponse)} desc=${this.getResponseDesc(userRoleResponse)}`);
        return true;
      }

      return !this.isSameActiveUserRole(userRoleResponse?.Data, roleName);
    }
    catch (error: any) {
      const message = error?.message || error?.response?.statusText;
      console.log(`[ERROR][shouldSyncLoginUserRole]: getUserRole error userId=${userId} message=${message}`);
      return true;
    }
  }

  private async validateTokenWithoutCAA(access_token: string, isB2C: boolean): Promise<boolean> {
    const decodedToken = this.decodeAccessToken(access_token);

    try {
      const playload = JSON.stringify(decodedToken?.payload)
      const credentail = isB2C ? b2c_credentail : ad_credentail;
      console.log(`[DEBUG][validateTokenWithoutCAA]: ${playload}`);

      const check1 = playload.includes(credentail.tenant);
      const check2 = playload.includes(credentail.name);
      const check3 = isB2C ? playload.includes(b2c_credentail.policy) : true;

      if (!check1) {
        console.log('[ERROR][validateTokenWithoutCAA]: token does not contain tenant')
      }
      if (!check2) {
        console.log('[ERROR][validateTokenWithoutCAA]: token does not contain project name')
      }
      if (!check3) {
        console.log('[ERROR][validateTokenWithoutCAA]: token does not contain b2c policy')
      }
      const isValid = check1 && check2 && check3
      if (isValid) {
        console.log('[INFO][validateTokenWithoutCAA]: pass token validation')
      }

      return isValid
    }
    catch (error) {
      console.log('[ERROR][validateTokenWithoutCAA]: unexpected error', error);
      return false
    }
  }

  // *private function
  private async validateADWithCAA(endpoint: string, data: any): Promise<boolean> {
    const res: any = await this.nonSecureRequest('post', endpoint, data, 20000)
    if (res?.result_code === '10111003') {
      console.log(`[ERROR][validateADWithCAA]: ${res?.result_code}: ${res?.result_desc}`)
      throw new HttpException(
        { status: HttpStatus.CONFLICT, error: message_caa_sync },
        HttpStatus.CONFLICT,
      );
    }
    if (res?.result_code !== '1') {
      console.log(`[ERROR][validateADWithCAA]: ${res?.result_code}: ${res?.result_desc}`)
      throw new HttpException(
        { status: HttpStatus.UNAUTHORIZED, error: `${message_caa_fail} "${res?.result_desc ?? 'Unknown error'}"` },
        HttpStatus.UNAUTHORIZED,
      );
    }

    console.info(`[INFO][validateADWithCAA]: CA&A pass token validation`);
    return true
  }

  private async validateB2CWithCAA(endpoint: string, data: any, access_token: string): Promise<boolean> {
    const res: any = await this.secureRequest('post', endpoint, data, access_token, 20000, true)
    if (res?.result_code === '10111003') {
      console.log(`[ERROR][validateB2CWithCAA]: ${res?.result_code}: ${res?.result_desc}`)
      throw new HttpException(
        { status: HttpStatus.CONFLICT, error: message_caa_sync },
        HttpStatus.CONFLICT,
      );
    }
    else if (res?.result_code !== '1') {
      console.log(`[ERROR][validateB2CWithCAA]: ${res?.result_code}: ${res?.result_desc}`)
      throw new HttpException(
        { status: HttpStatus.UNAUTHORIZED, error: `${message_caa_fail} "${res?.result_desc ?? 'Unknown error'}"` },
        HttpStatus.UNAUTHORIZED,
      );
    }

    console.info(`[INFO][validateB2CWithCAA]: CA&A pass token validation`);
    return true
  }

  private async runBackground(label: string, task: () => Promise<void>) {
    try {
      await task();
    }
    catch (error: any) {
      const status = error?.response?.status || error?.status;
      const message = error?.message || error?.response?.statusText;
      console.log(`[ERROR][${label}]: background CA&A validation failed status=${status} message=${message}`);
    }
  }

  private async nonSecureRequest(method: string, endpoint: string, data: any, timeout: number = 20000) {
    /*
    step connect ca&a
    1. request endpoint
    1.1 decode base64 to get response
    */
    try {
      const res = await axios.request({
        method: method,
        maxBodyLength: Infinity,
        url: `${caa_credentail.host}/${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: timeout,
        data: data
      })

      return res.data; //ยัง encrypt อยู่
    }
    catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const message = error?.message;

      console.log(
        `[ERROR][nonSecureRequest]: endpoint=${endpoint} status=${status} message=${message}`
      );

      if (data) {
        console.log(`[ERROR][nonSecureRequest]: data=${JSON.stringify(data)}`);
      }

      throw new Error(`CA&A error endpoint=${endpoint} status=${status} message=${message}`);
    }
  }

  private async requestCaaRest(method: string, endpoint: string, data: any, timeout: number = 20000, accessToken: string = null) {
    const response = await this.secureRequest(method, endpoint, data, accessToken, timeout);
    return this.decodeCaaRestResponse(response);
  }

  private async requestAztDoService(functionId: string, parameters: AztDoServiceParameter[], options: AztDoServiceOptions = {}) {
    const payload = {
      "function_id": functionId,
      "app_user": options.appUser || caa_credentail.project_code,
      "req_transaction_id": options.reqTransactionId || this.getRandomnumber(),
      "state_name": options.stateName || '',
      "req_parameters": parameters.map((parameter) => ({
        "k": parameter.k,
        "v": this.encryptBase64(parameter.v),
      })),
      "extra_xml": options.extraXml || '',
    }

    console.log(`[INFO][requestAztDoService]: function_id=${functionId} transaction_id=${payload.req_transaction_id}`);
    const data = await this.secureRequest('post', 'azt/doservice', payload, options.accessToken ?? null, options.timeout || 20000);
    return this.decodeAztDoServiceResponse(data);
  }

  private async getCaaAccessToken(forceRefresh = false) {
    if (this.caaAccessToken && !forceRefresh) return this.caaAccessToken;

    const resJwt = await axios.request({
      method: 'post',
      maxBodyLength: Infinity,
      url: `${caa_credentail.host}/auth/getJWT`,
      auth: {
        username: caa_credentail.project_code,
        password: caa_credentail.project_pwd,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 20000
    })
    // console.log(`[DEBUG][getCaaAccessToken]: encoded response, expires_in=${resJwt.data?.Data}`);
    const decodeResJwt = this.decodeBase64JsonK(resJwt.data?.Data);
    // console.log(`[DEBUG][getCaaAccessToken]: decoded response, expires_in=${decodeResJwt}`);
    if (!decodeResJwt?.access_token) {
      console.log(`[ERROR][getCaaAccessToken]: input parameter: host=${caa_credentail.host}, user=${caa_credentail.project_code}`)
      throw new Error('Cannot get access_token from CA&A');
    }
    this.caaAccessToken = decodeResJwt?.access_token;
    return this.caaAccessToken;
  }

  private async secureRequest(method: string, endpoint: string, data: any, token: string = null, timeout: number = 20000, skipCaaTokenRetry: boolean = false) {
    /*
    step connect ca&a
    1. getJwt
    1.1  decode base64 to get access token
    2. request endpoint with access token
    2.1. decode base64 to get response
    */
    let access_token = token ?? '';
    try {
      // *1. getJwt
      if (token === null || token === undefined) {
        access_token = await this.getCaaAccessToken();
      }

      // *2. request endpoint with access token
      let response = await this.sendSecureRequest(method, endpoint, data, access_token, timeout);
      if (skipCaaTokenRetry || !this.isCaaTokenExpired(response)) return response;

      console.log(`[INFO][secureRequest]: CA&A token expired, refresh and retry`);
      access_token = await this.getCaaAccessToken(true);
      response = await this.sendSecureRequest(method, endpoint, data, access_token, timeout);
      if (this.isCaaTokenExpired(response)) {
        console.log(`[ERROR][secureRequest]: CA&A token expired after retry`);
      }
      return response;
    }
    catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const message = error?.message;

      console.log(
        `[ERROR][secureRequest]: endpoint=${endpoint} status=${status} message=${message}`
      );

      if (data) {
        console.log(`[ERROR][secureRequest]: data=${JSON.stringify(data)}`);
      }

      throw new Error(`CA&A error endpoint=${endpoint} status=${status} message=${message}`);
    }
  }

  private async getRoleByName(roleName: string) {

    const param = {
      "project_code": caa_credentail.project_code,
      "cmdb_id": "",
      "name": roleName,
      "type": "",
      "menu_id": "",
      "description": "",
      "created_by": "",
      "updated_by": "",
      "updated_at_from": "",
      "updated_at_to": "",
      "created_at_from": "",
      "created_at_to": "",
      "status": "ACTIVE",
    }

    let response = await this.requestCaaRest('post', 'role/getQueryRole', param);
    if (this.getResponseCode(response) === '10000002') {
      console.log(`[INFO][getRoleByName]: role not found name=${roleName}, then create new role`);
      response = await this.createRole({
        name: roleName,
        by: caa_system_user,
        description: `Auto created role for ${roleName}`,
      });

      await this.sleep(2000); // *wait for a while to make sure the new role is created before query again
      response = await this.requestCaaRest('post', 'role/getQueryRole', param);
    }

    return response;
  }

  private async getUserByEmail(email: string, identity: any) {
    const escapedEmail = email.replace(/'/g, "''");
    return this.requestCaaRest('post', 'user/listuser', {
      "tenant_id": identity.tenant_id,
      "client_id": identity.client_id,
      "filter": this.encryptBase64(`?$filter=mail eq '${escapedEmail}' and accountEnabled eq true&$select=displayName,mail,id`),
    });
  }

  private async sendSecureRequest(method: string, endpoint: string, data: any, accessToken: string, timeout: number = 20000) {
    const res = await axios.request({
      method: method,
      maxBodyLength: Infinity,
      url: `${caa_credentail.host}/${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        // 'Token': accessToken,
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: timeout,
      data: data
    })

    return res.data; //ยัง encrypt อยู่
  }

  private getRandomnumber() {
    const now = new Date();
    const pad = (value: number, length: number = 2) => value.toString().padStart(length, '0');
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`
  }

  private decodeAccessToken(token: string) {
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = this.decodeBase64JsonK(parts[0]);
    const payload = this.decodeBase64JsonK(parts[1]);

    return { header, payload };
  }

  private decodeBase64JsonK(data: any) {
    if (typeof data !== "string" || !data.trim()) return null;

    // 1) normalize URL-safe base64 & add padding
    let b64 = data.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    b64 += pad;

    // 2) base64 -> binary string (browser) หรือ utf8 (Node)
    let binary;
    if (typeof atob === "function") {
      binary = atob(b64);
    } else {
      // Node/SSR
      return this.parsePossiblyDoubleEncoded(Buffer.from(b64, "base64").toString("utf8"));
    }

    // 3) binary -> utf8 string (แก้ปัญหา UTF-8)
    const utf8 = decodeURIComponent(
      Array.prototype.map
        .call(binary, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    // 4) parse อัตโนมัติ เผื่อ double-encoded
    return this.parsePossiblyDoubleEncoded(utf8);
  }

  private parsePossiblyDoubleEncoded(s: any) {
    let v = s.trim();
    for (let i = 0; i < 3; i++) {
      if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v);
          v = parsed;
        } catch {
          break; // ไม่ใช่ JSON แล้ว
        }
      } else {
        break; // กลายเป็น object/array แล้ว
      }
    }
    return v;
  }

  private normalizeResponseKeys(response: any) {
    if (!response || typeof response !== 'object') return {};

    return Object.keys(response).reduce((result: any, key: string) => {
      result[key.toLowerCase()] = response[key];
      return result;
    }, {});
  }

  private getResponseCode(response: any) {
    const normalized = this.normalizeResponseKeys(response);
    return String(normalized.respcode || normalized.result_code || normalized.resultcode || '');
  }

  private getResponseDesc(response: any) {
    const normalized = this.normalizeResponseKeys(response);
    return normalized.respdesc || normalized.result_desc || normalized.resultdesc || '';
  }

  private isCaaTokenExpired(response: any) {
    return this.getResponseCode(response) === '447';
  }

  private decodeCaaRestResponse(data: any) {
    if (!data) return data;

    const result = { ...data };
    if (typeof result.RespMessage === 'string') {
      result.RespMessage = this.decodeBase64JsonK(result.RespMessage);
    }
    if (typeof result.Data === 'string') {
      result.Data = this.decodeBase64JsonK(result.Data);
    }

    return result;
  }

  private getIdentityCredential(authType: CaaAuthType) {
    const credential = authType === 'B2C' ? b2c_credentail : ad_credentail;
    return {
      tenant_id: credential.tenant,
      tenant_name: credential.tenant_name,
      client_id: credential.client_id,
      app_display_name: credential.app_display_name,
    }
  }

  private getAuthTypeByEmail(email: string): CaaAuthType {
    const emailLower = email?.toLowerCase();
    return emailLower.endsWith('@pttplc.com') ||
      emailLower.endsWith('@pttplctest01.onmicrosoft.com') ? 'AD' : 'B2C';
  }

  private getAccountRoleName(account: any) {
    return account?.account_manage?.[0]?.account_role?.[0]?.role?.name;
  }

  private findCaaRole(data: any, roleName: string) {
    const roleList = Array.isArray(data) ? data : [];
    return roleList.find((role: any) => role?.name === roleName && (!role?.status || role?.status === 'ACTIVE'));
  }

  private findCaaUser(data: any, email: string) {
    const userList = Array.isArray(data?.value) ? data.value : Array.isArray(data) ? data : [];
    return userList.find((user: any) => [user?.mail, user?.email, user?.userPrincipalName].some((value: any) => value?.toLowerCase() === email));
  }

  private isSameActiveUserRole(data: any, roleName: string) {
    const roleList = Array.isArray(data) ? data : [];
    const activeRoles = roleList.filter((item: any) => item?.status === 'ACTIVE' && item?.role?.status === 'ACTIVE');
    return activeRoles.length === 1 && activeRoles[0]?.role?.name === roleName;
  }

  private decodeAztDoServiceResponse(data: any) {
    if (!data) return data;

    const result = { ...data };
    if (typeof result.response_message === 'string') {
      result.response_message = this.decodeBase64JsonK(result.response_message);
    }
    if (Array.isArray(result.resp_parameters)) {
      result.resp_parameters = result.resp_parameters.map((parameter: any) => {
        const decodedParameter = { ...parameter };
        if (typeof decodedParameter.value === 'string') {
          decodedParameter.value = this.decodeBase64JsonK(decodedParameter.value);
        }
        if (typeof decodedParameter.v === 'string') {
          decodedParameter.v = this.decodeBase64JsonK(decodedParameter.v);
        }
        return decodedParameter;
      });
    }

    return result;
  }

  private encryptBase64(data: any) {
    const value = typeof data === 'string' ? data : JSON.stringify(data ?? '');
    return Buffer.from(value, 'utf8').toString('base64');
  }

}
