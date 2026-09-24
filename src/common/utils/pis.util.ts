import axios from 'axios';

type PisQueryParams = Record<string, string | number | boolean>;

export class PIS {
  private pisAccessToken: string = null;

  async getToken(forceRefresh = false) {
    if (this.pisAccessToken && !forceRefresh) {
      console.log(`[INFO][getToken]: reuse PIS access token`);
      return this.pisAccessToken;
    }

    console.log(`[INFO][getToken]: request PIS access token`);
    const body = new URLSearchParams({ grant_type: 'client_credentials' });

    const resData = await axios.request({
      method: 'post',
      maxBodyLength: Infinity,
      url: `${process.env.PIS_SERVICE_AUTH}`,
      auth: {
        username: process.env.PIS_USERNAME,
        password: process.env.PIS_PASSWORD,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: body,
    });

    const accessToken = resData?.data?.access_token;
    if (!accessToken) {
      console.log(`[ERROR][getToken]: missing PIS access token from auth response`);
      throw new Error('Cannot get access_token from PIS');
    }

    this.pisAccessToken = accessToken;
    return this.pisAccessToken;
  }

  async getSearchUnit(params?: PisQueryParams) {
    return this.requestPis('getSearchUnit', `${process.env.PIS_SERVICE_SEARCHUNIT}`, params);
  }

  async getSearchUnitEntries(params?: PisQueryParams) {
    const data = await this.getSearchUnit(params);
    return this.getEntries(data, 'getSearchUnitEntries');
  }

  async getEmployee(params?: PisQueryParams) {
    return this.requestPis('getEmployee', `${process.env.PIS_SERVICE_EMPLOYEE}`, params);
  }

  async getEmployeeEntries(params?: PisQueryParams) {
    const data = await this.getEmployee(params);
    return this.getEntries(data, 'getEmployeeEntries');
  }

  getEntries(data: any, functionName = 'getEntries') {
    const entry = data?.entries?.entry;
    if (!entry) {
      console.log(`[INFO][${functionName}]: PIS response row_count=0`);
      return [];
    }

    const rows = Array.isArray(entry) ? entry : [entry];
    console.log(`[INFO][${functionName}]: PIS response row_count=${rows.length}`);
    return rows;
  }

  private async requestPis(functionName: string, url: string, params?: PisQueryParams) {
    let accessToken = await this.getToken();

    try {
      return await this.sendPisGet(functionName, url, params, accessToken);
    } catch (error: any) {
      if (!this.isUnauthorized(error)) {
        this.logPisError(functionName, url, error);
        throw error;
      }

      console.log(`[WARN][${functionName}]: PIS token unauthorized, refresh and retry`);
      accessToken = await this.getToken(true);

      try {
        return await this.sendPisGet(functionName, url, params, accessToken);
      } catch (retryError: any) {
        if (this.isUnauthorized(retryError)) {
          console.log(`[ERROR][${functionName}]: PIS token unauthorized after retry`);
        } else {
          this.logPisError(functionName, url, retryError);
        }
        throw retryError;
      }
    }
  }

  private async sendPisGet(functionName: string, url: string, params: PisQueryParams | undefined, accessToken: string) {
    console.log(`[INFO][${functionName}]: request PIS endpoint`);
    const resData = await axios.request({
      method: 'get',
      maxBodyLength: Infinity,
      url,
      params,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return resData?.data || null;
  }

  private isUnauthorized(error: any) {
    return error?.response?.status === 401;
  }

  private logPisError(functionName: string, url: string, error: any) {
    const status = error?.response?.status || 'unknown';
    const message = error?.message || 'unknown';
    console.log(`[ERROR][${functionName}]: endpoint=${url} status=${status} message=${message}`);
  }
}
