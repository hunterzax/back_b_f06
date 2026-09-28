function loadPis() {
  jest.resetModules();
  process.env.PIS_SERVICE_AUTH = 'https://pis.example.test/oauth2/token';
  process.env.PIS_SERVICE_SEARCHUNIT = 'https://pis.example.test/PTT_PIS/SearchUnit';
  process.env.PIS_SERVICE_EMPLOYEE = 'https://pis.example.test/PTT_PIS/EmployeeDataNoJobGroup';
  process.env.PIS_USERNAME = process.env.TEST_PIS_USERNAME || '';
  process.env.PIS_PASSWORD = process.env.TEST_PIS_PASSWORD || '';

  const mockAxios = { request: jest.fn() };
  jest.doMock('axios', () => ({ __esModule: true, default: mockAxios }));
  const { PIS } = require('./pis.util');
  return { PIS, mockAxios };
}

describe('PIS utility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('axios');
  });

  it('gets token from PIS_SERVICE_AUTH using client credentials', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS, mockAxios } = loadPis();
    mockAxios.request.mockResolvedValueOnce({ data: { access_token: 'pis-token' } });
    const pis = new PIS();

    const token = await pis.getToken();

    const call = mockAxios.request.mock.calls[0][0];
    expect(token).toBe('pis-token');
    expect(call.method).toBe('post');
    expect(call.url).toBe('https://pis.example.test/oauth2/token');
    expect(call.auth).toEqual({ username: process.env.TEST_PIS_USERNAME || '', password: process.env.TEST_PIS_PASSWORD || '' });
    expect(call.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(call.data.toString()).toBe('grant_type=client_credentials');
  });

  it('gets SearchUnit data with a bearer token', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS, mockAxios } = loadPis();
    mockAxios.request
      .mockResolvedValueOnce({ data: { access_token: 'pis-token' } })
      .mockResolvedValueOnce({ data: { data: [{ unitcode: '80000001' }] } });
    const pis = new PIS();

    const result = await pis.getSearchUnit({ SearchUnit: '80000512' });

    const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
    expect(result).toEqual({ data: [{ unitcode: '80000001' }] });
    expect(calls[1].method).toBe('get');
    expect(calls[1].url).toBe('https://pis.example.test/PTT_PIS/SearchUnit');
    expect(calls[1].params).toEqual({ SearchUnit: '80000512' });
    expect(calls[1].headers.Accept).toBe('application/json');
    expect(calls[1].headers.Authorization).toBe('Bearer pis-token');
  });

  it('gets Employee data with a bearer token', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS, mockAxios } = loadPis();
    mockAxios.request
      .mockResolvedValueOnce({ data: { access_token: 'pis-token' } })
      .mockResolvedValueOnce({ data: { entries: { entry: [{ EmailAddress: 'user@pttplc.com' }] } } });
    const pis = new PIS();

    const result = await pis.getEmployee({ EmployeeID: '510071', DepartmentCodeList: '80000111,80000579' });

    const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
    expect(result).toEqual({ entries: { entry: [{ EmailAddress: 'user@pttplc.com' }] } });
    expect(calls[1].method).toBe('get');
    expect(calls[1].url).toBe('https://pis.example.test/PTT_PIS/EmployeeDataNoJobGroup');
    expect(calls[1].params).toEqual({ EmployeeID: '510071', DepartmentCodeList: '80000111,80000579' });
    expect(calls[1].headers.Accept).toBe('application/json');
    expect(calls[1].headers.Authorization).toBe('Bearer pis-token');
  });

  it('normalizes SearchUnit entries into a row array', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS, mockAxios } = loadPis();
    mockAxios.request
      .mockResolvedValueOnce({ data: { access_token: 'pis-token' } })
      .mockResolvedValueOnce({ data: { entries: { entry: { unitcode: '80000520' } } } });
    const pis = new PIS();

    const result = await pis.getSearchUnitEntries({ SearchUnit: '80000520' });

    expect(result).toEqual([{ unitcode: '80000520' }]);
  });

  it('normalizes Employee entries into a row array', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS, mockAxios } = loadPis();
    mockAxios.request
      .mockResolvedValueOnce({ data: { access_token: 'pis-token' } })
      .mockResolvedValueOnce({ data: { entries: { entry: [{ EmailAddress: 'user@pttplc.com' }] } } });
    const pis = new PIS();

    const result = await pis.getEmployeeEntries({ EmployeeID: '510071' });

    expect(result).toEqual([{ EmailAddress: 'user@pttplc.com' }]);
  });

  it('returns an empty row array when PIS response has no entries', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS } = loadPis();
    const pis = new PIS();

    expect(pis.getEntries({}, 'testGetEntries')).toEqual([]);
  });

  it('reuses token across PIS read calls', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS, mockAxios } = loadPis();
    mockAxios.request
      .mockResolvedValueOnce({ data: { access_token: 'pis-token' } })
      .mockResolvedValueOnce({ data: { data: [{ unitcode: '80000001' }] } })
      .mockResolvedValueOnce({ data: { entries: { entry: [{ EmailAddress: 'user@pttplc.com' }] } } });
    const pis = new PIS();

    await pis.getSearchUnit({ SearchUnit: '80000512' });
    await pis.getEmployee({ EmployeeID: '510071' });

    const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
    const authCalls = calls.filter((call: any) => call.url === 'https://pis.example.test/oauth2/token');
    const readCalls = calls.filter((call: any) => call.method === 'get');
    expect(authCalls).toHaveLength(1);
    expect(readCalls).toHaveLength(2);
    expect(readCalls[0].headers.Authorization).toBe('Bearer pis-token');
    expect(readCalls[1].headers.Authorization).toBe('Bearer pis-token');
  });

  it('refreshes token and retries once when PIS read returns HTTP 401', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS, mockAxios } = loadPis();
    mockAxios.request
      .mockResolvedValueOnce({ data: { access_token: 'old-pis-token' } })
      .mockRejectedValueOnce({ response: { status: 401 }, message: 'Unauthorized' })
      .mockResolvedValueOnce({ data: { access_token: 'new-pis-token' } })
      .mockResolvedValueOnce({ data: { entries: { entry: [{ EmailAddress: 'user@pttplc.com' }] } } });
    const pis = new PIS();

    const result = await pis.getEmployee({ EmployeeID: '510071' });

    const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
    const authCalls = calls.filter((call: any) => call.url === 'https://pis.example.test/oauth2/token');
    const employeeCalls = calls.filter((call: any) => call.url === 'https://pis.example.test/PTT_PIS/EmployeeDataNoJobGroup');
    expect(result).toEqual({ entries: { entry: [{ EmailAddress: 'user@pttplc.com' }] } });
    expect(authCalls).toHaveLength(2);
    expect(employeeCalls).toHaveLength(2);
    expect(employeeCalls[0].headers.Authorization).toBe('Bearer old-pis-token');
    expect(employeeCalls[1].headers.Authorization).toBe('Bearer new-pis-token');
  });

  it('does not retry forever when refreshed token also returns HTTP 401', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { PIS, mockAxios } = loadPis();
    const retryError = { response: { status: 401 }, message: 'Unauthorized again' };
    mockAxios.request
      .mockResolvedValueOnce({ data: { access_token: 'old-pis-token' } })
      .mockRejectedValueOnce({ response: { status: 401 }, message: 'Unauthorized' })
      .mockResolvedValueOnce({ data: { access_token: 'new-pis-token' } })
      .mockRejectedValueOnce(retryError);
    const pis = new PIS();

    await expect(pis.getSearchUnit({ SearchUnit: '80000512' })).rejects.toBe(retryError);

    const calls = mockAxios.request.mock.calls.map((call: any[]) => call[0]);
    const authCalls = calls.filter((call: any) => call.url === 'https://pis.example.test/oauth2/token');
    const searchUnitCalls = calls.filter((call: any) => call.url === 'https://pis.example.test/PTT_PIS/SearchUnit');
    expect(authCalls).toHaveLength(2);
    expect(searchUnitCalls).toHaveLength(2);
  });
});
