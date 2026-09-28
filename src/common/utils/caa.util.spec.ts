const encodeBase64 = (value: any) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64');
const decodeBase64 = (value: string) => Buffer.from(value, 'base64').toString('utf8');
const makeToken = (payload: any) => `${encodeBase64({ alg: 'none' })}.${encodeBase64(payload)}.sig`;
const userRoleData = (roleName: string) => [{ user_id: 'azure-oid', status: 'ACTIVE', role: { id: 'role-id', name: roleName, status: 'ACTIVE' } }];
const caaUserData = (email: string, id: string = 'azure-oid') => ({ value: [{ id, mail: email, displayName: 'Example User' }] });
const adminAccount = (email: string, roleName: any = 'TSO Admin', modeAccountId: number = 1) => ({
    email,
    account_manage: [{
        mode_account_id: modeAccountId,
        account_role: [{ role: { name: roleName, active: true } }],
    }],
});
const flushBackground = () => new Promise((resolve) => setImmediate(resolve));

function loadCaa() {
    jest.resetModules();
    process.env.CAA_PROJECT_CODE = 'CL6600001-TES';
    process.env.CAA_PROJECT_PWD = process.env.TEST_CAA_PWD || '';
    process.env.CAA_HOST = 'https://caa.example.test';
    process.env.AD_NAME = 'AD-CL6600001-TES-NON-PRD';
    process.env.AD_TENANT = 'ad-tenant-id';
    process.env.AD_TENANT_NAME = 'ad-tenant-name';
    process.env.AD_CLIENT_ID = 'ad-client-id';
    process.env.AD_APP_DISPLAY_NAME = 'ad-app';
    process.env.B2C_NAME = 'B2C-CL6600001-TES-NON-PRD';
    process.env.B2C_TENANT = 'b2c-tenant-id';
    process.env.B2C_TENANT_NAME = 'b2c-tenant-name';
    process.env.B2C_CLIENT_ID = 'b2c-client-id';
    process.env.B2C_APP_DISPLAY_NAME = 'b2c-app';
    process.env.CAA_BYPASS = 'false';
    process.env.CAA_SYSTEM_USER = 'tpasystem@pttplc.com';

    const mockAxios = { request: jest.fn() };
    jest.doMock('axios', () => ({ __esModule: true, default: mockAxios }));
    const { CAA } = require('./caa.util');
    return { CAA, mockAxios };
}

describe('CAA authB2C', () => {
    afterEach(() => {
        jest.dontMock('axios');
    });

    it('does not refresh CA&A JWT when B2C auth uses caller token and CA&A returns expired code', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request.mockResolvedValueOnce({ data: { RespCode: '447', RespDesc: 'Invalid token or expired', Namespace: 'AZT' } });
        const caa = new CAA();

        const result = await caa.authB2C('b2c-user-token');

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        expect(result).toBe(false);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('https://caa.example.test/auth/b2c/b2c-client-id');
        expect(calls[0].headers.Authorization).toBe('Bearer b2c-user-token');
        expect(calls.map((call: any) => call.url)).not.toContain('https://caa.example.test/auth/getJWT');
    });
});

describe('CAA syncLoginUserRole', () => {
    afterEach(() => {
        jest.dontMock('axios');
    });

    it('stops when access token has no Azure oid', async () => {
        const { CAA, mockAxios } = loadCaa();
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ sub: 'subject-only' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        expect(result).toBe(false);
        expect(mockAxios.request).not.toHaveBeenCalled();
    });

    it('stops when getUser fails before role lookup', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockRejectedValueOnce(new Error('getUser failed'));
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const urls = mockAxios.request.mock.calls.map((call: any[]) => call[0].url);
        expect(result).toBe(false);
        expect(urls).toContain('https://caa.example.test/user/getUser');
        expect(urls).not.toContain('https://caa.example.test/role/getQueryRole');
        expect(urls).not.toContain('https://caa.example.test/azt/doservice');
    });

    it('stops when CA&A role lookup does not find the local role', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: { mail: 'user@example.com', displayName: 'Example User' } }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([]) } });
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const urls = mockAxios.request.mock.calls.map((call: any[]) => call[0].url);
        expect(result).toBe(false);
        expect(urls).toContain('https://caa.example.test/role/getQueryRole');
        expect(urls).not.toContain('https://caa.example.test/azt/doservice');
    });

    it('stops when clear user roles fails before assigning role', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: { mail: 'user@example.com', displayName: 'Example User' } }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('Other Role')) } })
            .mockResolvedValueOnce({ data: { result_code: '0', result_desc: 'clear failed', response_message: encodeBase64('FAIL'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const doserviceCalls = mockAxios.request.mock.calls.map((call: any[]) => call[0]).filter((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        expect(result).toBe(false);
        expect(doserviceCalls).toHaveLength(1);
        expect(doserviceCalls[0].data.function_id).toBe('F100048');
    });

    it('skips clear and assign when getUserRole already matches the local role', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: { mail: 'user@example.com', displayName: 'Example User' } }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('TSO Admin')) } });
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        expect(result).toBe(true);
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/user/getUserRole');
        expect(calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice')).toHaveLength(0);
    });

    it('calls getUserRole, F100048 clear, and F100049 assign when CA&A role differs', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: { mail: 'user@example.com', displayName: 'Example User' } }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('Other Role')) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'B2C',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const doserviceCalls = calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        const jwtCalls = calls.filter((call: any) => call.url === 'https://caa.example.test/auth/getJWT');
        expect(result).toBe(true);
        expect(jwtCalls).toHaveLength(1);
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/user/getUser');
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/role/getQueryRole');
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/user/getUserRole');
        expect(doserviceCalls.map((call: any) => call.data.function_id)).toEqual(['F100048', 'F100049']);
        expect(Buffer.from(doserviceCalls[0].data.req_parameters[0].v, 'base64').toString('utf8')).toBe('user@example.com');
        expect(Buffer.from(doserviceCalls[1].data.req_parameters[0].v, 'base64').toString('utf8')).toBe('tpasystem@pttplc.com');
        expect(doserviceCalls[1].data.req_parameters).toHaveLength(2);
    });

    it('clears and assigns when getUserRole verification fails', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: { mail: 'user@example.com', displayName: 'Example User' } }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockRejectedValueOnce(new Error('getUserRole failed'))
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const doserviceCalls = calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        expect(result).toBe(true);
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/user/getUserRole');
        expect(doserviceCalls.map((call: any) => call.data.function_id)).toEqual(['F100048', 'F100049']);
    });

    it('refreshes CA&A token once when role lookup returns normalized expired code', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_OLD_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: { mail: 'user@example.com', displayName: 'Example User' } }) } })
            .mockResolvedValueOnce({ data: { respCode: '447', respDesc: 'Invalid token or expired', namespace: 'AZT' } })
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_NEW_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('Other Role')) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const jwtCalls = calls.filter((call: any) => call.url === 'https://caa.example.test/auth/getJWT');
        const roleCalls = calls.filter((call: any) => call.url === 'https://caa.example.test/role/getQueryRole');
        expect(result).toBe(true);
        expect(jwtCalls).toHaveLength(2);
        expect(roleCalls).toHaveLength(2);
        expect(roleCalls[0].headers.Authorization).toBe('Bearer old-caa-jwt');
        expect(roleCalls[1].headers.Authorization).toBe('Bearer new-caa-jwt');
    });

    it('stops when refreshed CA&A token still returns expired code', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_OLD_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: { mail: 'user@example.com', displayName: 'Example User' } }) } })
            .mockResolvedValueOnce({ data: { respCode: '447', respDesc: 'Invalid token or expired', namespace: 'AZT' } })
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_NEW_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '447', RespDesc: 'Invalid token or expired', Namespace: 'AZT' } });
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        expect(result).toBe(false);
        expect(calls.filter((call: any) => call.url === 'https://caa.example.test/auth/getJWT')).toHaveLength(2);
        expect(calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice')).toHaveLength(0);
    });

    it('refreshes CA&A token when F100048 clear returns expired code', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_OLD_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: { mail: 'user@example.com', displayName: 'Example User' } }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('Other Role')) } })
            .mockResolvedValueOnce({ data: { respCode: '447', respDesc: 'Invalid token or expired', namespace: 'AZT' } })
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_NEW_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.syncLoginUserRole({
            authType: 'AD',
            accessToken: makeToken({ oid: 'azure-oid' }),
            email: 'user@example.com',
            roleName: 'TSO Admin',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const doserviceCalls = calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        expect(result).toBe(true);
        expect(calls.filter((call: any) => call.url === 'https://caa.example.test/auth/getJWT')).toHaveLength(2);
        expect(doserviceCalls.map((call: any) => call.data.function_id)).toEqual(['F100048', 'F100048', 'F100049']);
        expect(doserviceCalls[0].headers.Authorization).toBe('Bearer old-caa-jwt');
        expect(doserviceCalls[1].headers.Authorization).toBe('Bearer new-caa-jwt');
        expect(doserviceCalls[2].headers.Authorization).toBe('Bearer new-caa-jwt');
    });
});

describe('CAA syncUserRole', () => {
    afterEach(() => {
        jest.dontMock('axios');
    });

    it('@pttplc.com account uses AD user lookup and syncs changed role', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(caaUserData('user@pttplc.com')) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('Other Role')) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.syncUserRole({
            account: adminAccount('user@pttplc.com'),
            by: 'requester@pttplc.com',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const userCall = calls.find((call: any) => call.url === 'https://caa.example.test/user/listuser');
        const doserviceCalls = calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        expect(result).toBe(true);
        expect(userCall.data.tenant_id).toBe('ad-tenant-id');
        expect(userCall.data.client_id).toBe('ad-client-id');
        expect(userCall.data.filter).toBe("?$filter=mail eq 'user@pttplc.com' and accountEnabled eq true&$select=displayName,mail,id");
        expect(doserviceCalls.map((call: any) => call.data.function_id)).toEqual(['F100048', 'F100049']);
        expect(decodeBase64(doserviceCalls[0].data.req_parameters[0].v)).toBe('requester@pttplc.com');
        expect(decodeBase64(doserviceCalls[1].data.req_parameters[0].v)).toBe('requester@pttplc.com');
        expect(JSON.parse(decodeBase64(doserviceCalls[1].data.req_parameters[1].v))).toEqual({
            user_id: 'azure-oid',
            tenant_id: 'ad-tenant-id',
            client_id: 'ad-client-id',
            project_code: 'CL6600001-TES',
            role_list: ['role-id'],
        });
    });

    it('non-PTT account uses B2C user lookup', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(caaUserData('user@example.com')) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('Other Role')) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.syncUserRole({
            account: adminAccount('user@example.com'),
            by: 'requester@pttplc.com',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const userCall = calls.find((call: any) => call.url === 'https://caa.example.test/user/listuser');
        const assignCall = calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice')[1];
        const assignData = JSON.parse(decodeBase64(assignCall.data.req_parameters[1].v));
        expect(result).toBe(true);
        expect(userCall.data.tenant_id).toBe('b2c-tenant-id');
        expect(userCall.data.client_id).toBe('b2c-client-id');
        expect(assignData.tenant_id).toBe('b2c-tenant-id');
        expect(assignData.client_id).toBe('b2c-client-id');
    });

    it('local-login mode still triggers sync', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(caaUserData('local@example.com')) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('Other Role')) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.syncUserRole({
            account: adminAccount('local@example.com', 'TSO Admin', 2),
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        expect(result).toBe(true);
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/user/listuser');
        expect(calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice').map((call: any) => call.data.function_id)).toEqual(['F100048', 'F100049']);
    });

    it('stops when local role is missing before CA&A calls', async () => {
        const { CAA, mockAxios } = loadCaa();
        const caa = new CAA();

        const result = await caa.syncUserRole({
            account: adminAccount('user@pttplc.com', null),
        });

        expect(result).toBe(false);
        expect(mockAxios.request).not.toHaveBeenCalled();
    });

    it('stops when user lookup does not find CA&A user', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64({ value: [] }) } });
        const caa = new CAA();

        const result = await caa.syncUserRole({
            account: adminAccount('missing@pttplc.com'),
        });

        const urls = mockAxios.request.mock.calls.map((call: any[]) => call[0].url);
        expect(result).toBe(false);
        expect(urls).toContain('https://caa.example.test/user/listuser');
        expect(urls).not.toContain('https://caa.example.test/role/getQueryRole');
        expect(urls).not.toContain('https://caa.example.test/azt/doservice');
    });

    it('stops when CA&A role lookup misses before clear and assign', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(caaUserData('user@pttplc.com')) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([]) } });
        const caa = new CAA();

        const result = await caa.syncUserRole({
            account: adminAccount('user@pttplc.com'),
        });

        const urls = mockAxios.request.mock.calls.map((call: any[]) => call[0].url);
        expect(result).toBe(false);
        expect(urls).toContain('https://caa.example.test/role/getQueryRole');
        expect(urls).not.toContain('https://caa.example.test/azt/doservice');
    });

    it('skips clear and assign when current CA&A role matches local role', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(caaUserData('user@pttplc.com')) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'role-id', name: 'TSO Admin', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64(userRoleData('TSO Admin')) } });
        const caa = new CAA();

        const result = await caa.syncUserRole({
            account: adminAccount('user@pttplc.com'),
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        expect(result).toBe(true);
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/user/getUserRole');
        expect(calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice')).toHaveLength(0);
    });

    it('syncUserRoleInBackground does not throw on CA&A failure', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockRejectedValueOnce(new Error('user lookup failed'));
        const caa = new CAA();

        expect(() => caa.syncUserRoleInBackground({ account: adminAccount('user@pttplc.com') })).not.toThrow();
        await flushBackground();

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/user/listuser');
        expect(calls.map((call: any) => call.url)).not.toContain('https://caa.example.test/azt/doservice');
    });
});

describe('CAA createRole', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.dontMock('axios');
    });

    it('sends F100032 role create payload with actor email and timestamp transaction id', async () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 5, 4, 11, 3, 25, 144));
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.createRole({
            name: 'taku-001',
            by: 'actual-user@pttplc.com',
            extraXml: 'test no extra xml',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const doserviceCall = calls.find((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        const by = decodeBase64(doserviceCall.data.req_parameters[0].v);
        const data = JSON.parse(decodeBase64(doserviceCall.data.req_parameters[1].v));
        expect(result.result_code).toBe('1');
        expect(doserviceCall.data.function_id).toBe('F100032');
        expect(doserviceCall.data.req_transaction_id).toBe('04062026110325144');
        expect(doserviceCall.data.req_transaction_id).toMatch(/^\d{17}$/);
        expect(doserviceCall.data.extra_xml).toBe('test no extra xml');
        expect(by).toBe('actual-user@pttplc.com');
        expect(data).toEqual({
            name: 'taku-001',
            project_code: 'CL6600001-TES',
            role_type: 'SPECIAL',
            description: '',
            menu: '',
            user_roles: [],
            status: 'ACTIVE',
            created_by: 'actual-user@pttplc.com',
        });
    });

    it('createRoleInBackground catches CA&A failure and does not throw', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockRejectedValueOnce(new Error('create role failed'));
        const caa = new CAA();

        expect(() => caa.createRoleInBackground({ name: 'taku-001' })).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const doserviceCall = calls.find((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        expect(doserviceCall.data.function_id).toBe('F100032');
        expect(decodeBase64(doserviceCall.data.req_parameters[0].v)).toBe('tpasystem@pttplc.com');
    });
});

describe('CAA updateRole', () => {
    afterEach(() => {
        jest.dontMock('axios');
    });

    it('sends F100039 role update payload with actor email', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        const result = await caa.updateRole({
            roleId: '0808db45-cbb6-4edb-b5c3-ef3fec6189d1',
            name: 'TSO บค Operator',
            by: 'actual-user@pttplc.com',
            description: 'Updated description',
            reqTransactionId: '05062026110325144',
        });

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const doserviceCall = calls.find((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        const by = decodeBase64(doserviceCall.data.req_parameters[0].v);
        const data = JSON.parse(decodeBase64(doserviceCall.data.req_parameters[1].v));
        expect(result.result_code).toBe('1');
        expect(doserviceCall.data.function_id).toBe('F100039');
        expect(doserviceCall.data.req_transaction_id).toBe('05062026110325144');
        expect(by).toBe('actual-user@pttplc.com');
        expect(data).toEqual({
            id: '0808db45-cbb6-4edb-b5c3-ef3fec6189d1',
            name: 'TSO บค Operator',
            role_type: 'SPECIAL',
            description: 'Updated description',
            menu: '',
            status: 'ACTIVE',
            updated_by: 'actual-user@pttplc.com',
        });
    });

    it('updateRoleInBackground stops before F100039 when CA&A role lookup misses', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([]) } });
        const caa = new CAA();

        expect(() => caa.updateRoleInBackground({ oldName: 'Old Role', name: 'New Role', by: 'actual-user@pttplc.com' })).not.toThrow();
        await flushBackground();

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        expect(calls.map((call: any) => call.url)).toContain('https://caa.example.test/role/getQueryRole');
        expect(calls.filter((call: any) => call.url === 'https://caa.example.test/azt/doservice')).toHaveLength(0);
    });

    it('updateRoleInBackground looks up old name and sends F100039 with fallback actor', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'caa-role-id', name: 'Old Role', status: 'ACTIVE' }]) } })
            .mockResolvedValueOnce({ data: { result_code: '1', response_message: encodeBase64('SUCCESS'), resp_parameters: [] } });
        const caa = new CAA();

        expect(() => caa.updateRoleInBackground({ oldName: 'Old Role', name: 'New Role' })).not.toThrow();
        await flushBackground();

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const roleCall = calls.find((call: any) => call.url === 'https://caa.example.test/role/getQueryRole');
        const doserviceCall = calls.find((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        const roleLookupData = roleCall.data;
        const by = decodeBase64(doserviceCall.data.req_parameters[0].v);
        const data = JSON.parse(decodeBase64(doserviceCall.data.req_parameters[1].v));
        expect(roleLookupData.name).toBe('Old Role');
        expect(doserviceCall.data.function_id).toBe('F100039');
        expect(by).toBe('tpasystem@pttplc.com');
        expect(data.id).toBe('caa-role-id');
        expect(data.name).toBe('New Role');
        expect(data.updated_by).toBe('tpasystem@pttplc.com');
    });

    it('updateRoleInBackground catches CA&A update failure and does not throw', async () => {
        const { CAA, mockAxios } = loadCaa();
        mockAxios.request
            .mockResolvedValueOnce({ data: { Data: encodeBase64({ access_token: process.env.TEST_CAA_TOKEN || '' }) } })
            .mockResolvedValueOnce({ data: { RespCode: '1', Data: encodeBase64([{ id: 'caa-role-id', name: 'Old Role', status: 'ACTIVE' }]) } })
            .mockRejectedValueOnce(new Error('update role failed'));
        const caa = new CAA();

        expect(() => caa.updateRoleInBackground({ oldName: 'Old Role', name: 'New Role', by: 'actual-user@pttplc.com' })).not.toThrow();
        await flushBackground();

        const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
        const doserviceCall = calls.find((call: any) => call.url === 'https://caa.example.test/azt/doservice');
        expect(doserviceCall.data.function_id).toBe('F100039');
        expect(decodeBase64(doserviceCall.data.req_parameters[0].v)).toBe('actual-user@pttplc.com');
    });
});
