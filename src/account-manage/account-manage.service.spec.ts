const mockAuthAD = jest.fn();
const mockSyncLoginUserRoleInBackground = jest.fn();
const mockSyncUserRole = jest.fn();
const mockGetEmployeeEntries = jest.fn();

function loadService() {
  jest.resetModules();

  jest.doMock('src/common/utils/caa.util', () => ({
    CAA: jest.fn().mockImplementation(() => ({
      authAD: mockAuthAD,
      syncLoginUserRoleInBackground: mockSyncLoginUserRoleInBackground,
      syncUserRole: mockSyncUserRole,
    })),
  }), { virtual: true });
  jest.doMock('src/common/utils/pis.util', () => ({
    PIS: jest.fn().mockImplementation(() => ({
      getEmployeeEntries: mockGetEmployeeEntries,
    })),
  }), { virtual: true });
  jest.doMock('prisma/prisma.service', () => ({
    PrismaService: class PrismaService { },
  }), { virtual: true });
  jest.doMock('src/grpc/email-service.service', () => ({
    EmailClientService: class EmailClientService { },
  }), { virtual: true });
  jest.doMock('src/common/utils/date.util', () => {
    const dayjs = require('dayjs');
    return {
      getTodayEndAdd7: (date?: any) => dayjs(date || '2026-06-06T23:59:59.000Z'),
      getTodayNowAdd7: () => dayjs('2026-06-06T12:00:00.000Z'),
      getTodayStart: () => dayjs('2026-06-06T00:00:00.000Z'),
      getTodayStartAdd7: (date?: any) => dayjs(date || '2026-06-06T00:00:00.000Z'),
    };
  }, { virtual: true });
  jest.doMock('src/common/utils/write-req.util', () => ({
    writeReq: jest.fn(),
  }), { virtual: true });
  jest.doMock('src/common/utils/account.util', () => ({
    generatePassword: jest.fn(),
    genPass: jest.fn(),
    genTokenReset: jest.fn(),
  }), { virtual: true });

  const { AccountManageService } = require('./account-manage.service');
  return AccountManageService;
}

const makePrisma = () => ({
  division: { findFirst: jest.fn() },
  account: { findFirst: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  account_manage: { upsert: jest.fn(), update: jest.fn() },
  account_role: { upsert: jest.fn() },
  role: { findFirst: jest.fn() },
  t_and_c: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
  login_logs: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  $executeRawUnsafe: jest.fn().mockResolvedValue(null),
});

const makeService = (prisma: any) => {
  const AccountManageService = loadService();
  return new AccountManageService(
    { signAsync: jest.fn().mockResolvedValue('local-jwt') },
    prisma,
    {},
  );
};

const pisEmployee = (overrides: any = {}) => ({
  EmailAddress: 'user@pttplc.com',
  EmployeeId: '510071',
  EmployeeNameENG: 'USER EXAMPLE',
  DepartmentCode: '80000520',
  Mobile: '0811111111',
  ...overrides,
});
const group = (id = 14) => ({
  id,
  user_type_id: 2,
  role_default: [{ role_id: 7 }],
});
const activeAccount = (overrides: any = {}) => ({
  id: 13,
  email: 'user@pttplc.com',
  password: process.env.TEST_ACCOUNT_PASSWORD || '',
  active: true,
  status: true,
  start_date: new Date('2020-01-01T00:00:00.000Z'),
  end_date: null,
  first_name: 'OLD',
  last_name: 'USER',
  account_manage: [{
    id: 36,
    group_id: 14,
    division_id: 111,
    mode_account_id: 1,
    account_role: [{ role: { name: 'TSO Operator', active: true } }],
  }],
  account_password_check: [],
  ...overrides,
});

const syncAccount = (overrides: any = {}) => ({
  id: 13,
  email: 'user@pttplc.com',
  account_manage: [{
    id: 36,
    group_id: 14,
    division_id: 111,
    account_role: [{ role: { name: 'Old Role' } }],
  }],
  ...overrides,
});

describe('AccountManageService conSyncAccount', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    mockAuthAD.mockReset().mockResolvedValue(true);
    mockSyncLoginUserRoleInBackground.mockReset();
    mockSyncUserRole.mockReset().mockResolvedValue(true);
    mockGetEmployeeEntries.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('loops existing local accounts and syncs PIS then CA&A through utilities', async () => {
    const prisma = makePrisma();
    prisma.account.findMany.mockResolvedValueOnce([
      syncAccount({ id: 13, email: 'user1@pttplc.com' }),
      syncAccount({ id: 14, email: 'user2@pttplc.com', account_manage: [{ ...syncAccount().account_manage[0], id: 37 }] }),
    ]);
    mockGetEmployeeEntries
      .mockResolvedValueOnce([pisEmployee({ EmailAddress: 'user1@pttplc.com', EmployeeId: '510071' })])
      .mockResolvedValueOnce([pisEmployee({ EmailAddress: 'user2@pttplc.com', EmployeeId: '510072' })]);
    prisma.division.findFirst
      .mockResolvedValueOnce({ id: 222, division_id: '80000520', group: group(14) })
      .mockResolvedValueOnce({ id: 223, division_id: '80000520', group: group(15) });
    prisma.account.update.mockResolvedValue({});
    prisma.account_manage.update.mockResolvedValue({});
    prisma.account_role.upsert.mockResolvedValue({});
    prisma.role.findFirst
      .mockResolvedValueOnce({ name: 'PIS Role One' })
      .mockResolvedValueOnce({ name: 'PIS Role Two' });
    const service = makeService(prisma);

    await service.conSyncAccount();

    expect(prisma.account.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: { not: null } },
      orderBy: { id: 'asc' },
    }));
    expect(mockGetEmployeeEntries).toHaveBeenNthCalledWith(1, { EmployeeID: 'user1' });
    expect(mockGetEmployeeEntries).toHaveBeenNthCalledWith(2, { EmployeeID: 'user2' });
    expect(prisma.account.update).toHaveBeenCalledTimes(2);
    expect(prisma.account_manage.update).toHaveBeenCalledTimes(2);
    expect(prisma.account_role.upsert).toHaveBeenCalledTimes(2);
    expect(mockSyncUserRole).toHaveBeenNthCalledWith(1, expect.objectContaining({
      email: 'user1@pttplc.com',
      roleName: 'PIS Role One',
      by: 'user1@pttplc.com',
    }));
    expect(mockSyncUserRole).toHaveBeenNthCalledWith(2, expect.objectContaining({
      email: 'user2@pttplc.com',
      roleName: 'PIS Role Two',
      by: 'user2@pttplc.com',
    }));
  });

  it('uses configured sleep between accounts without sleeping before the first account', async () => {
    process.env.CON_SYNC_ACCOUNT_SLEEP_MS = '25';
    const prisma = makePrisma();
    prisma.account.findMany.mockResolvedValueOnce([
      syncAccount({ id: 13, email: 'user1@pttplc.com' }),
      syncAccount({ id: 14, email: 'user2@pttplc.com', account_manage: [{ ...syncAccount().account_manage[0], id: 37 }] }),
    ]);
    mockGetEmployeeEntries.mockResolvedValue([pisEmployee()]);
    prisma.division.findFirst.mockResolvedValue({ id: 222, division_id: '80000520', group: group(14) });
    prisma.account.update.mockResolvedValue({});
    prisma.account_manage.update.mockResolvedValue({});
    prisma.account_role.upsert.mockResolvedValue({});
    prisma.role.findFirst.mockResolvedValue({ name: 'PIS Role' });
    const service = makeService(prisma);
    const sleepSpy = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

    await service.conSyncAccount();

    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy).toHaveBeenCalledWith(25);
  });

  it('still attempts CA&A sync for an account when PIS sync fails', async () => {
    const prisma = makePrisma();
    prisma.account.findMany.mockResolvedValueOnce([
      syncAccount({ id: 13, email: 'user1@pttplc.com' }),
    ]);
    mockGetEmployeeEntries.mockRejectedValueOnce(new Error('PIS unavailable'));
    const service = makeService(prisma);

    await service.conSyncAccount();

    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(mockSyncUserRole).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user1@pttplc.com',
      roleName: 'Old Role',
      by: 'user1@pttplc.com',
    }));
  });
});

describe('AccountManageService internal SSO PIS handoff', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    mockAuthAD.mockReset().mockResolvedValue(true);
    mockSyncLoginUserRoleInBackground.mockReset();
    mockSyncUserRole.mockReset().mockResolvedValue(true);
    mockGetEmployeeEntries.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('blocks production login when PIS employee is not found', async () => {
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([]);
    const service = makeService(prisma);

    await expect(service.accountSSO_internal({ access_token: 'ad-token', email: 'user@pttplc.com' }))
      .rejects
      .toMatchObject({
        response: { error: 'Your information is not found in PIS, please contact Admin.' },
      });

    expect(mockGetEmployeeEntries).toHaveBeenCalledWith({ EmployeeID: 'user' });
    expect(prisma.account.upsert).not.toHaveBeenCalled();
  });

  it('uses Email lookup in non-production without requiring fallback whitelist', async () => {
    process.env.NODE_ENV = 'development';
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([pisEmployee()]);
    prisma.division.findFirst.mockResolvedValueOnce({ id: 222, division_id: '80000520', group: group(14) });
    prisma.account.findFirst
      .mockResolvedValueOnce(activeAccount({ account_manage: [{ ...activeAccount().account_manage[0], division_id: 222 }] }));
    const service = makeService(prisma);

    await service.accountSSO_internal({ access_token: 'ad-token', email: 'user@pttplc.com' });

    expect(mockGetEmployeeEntries).toHaveBeenCalledWith({ Email: 'user@pttplc.com' });
    expect(prisma.account.upsert).not.toHaveBeenCalled();
  });

  it('blocks production login when PIS employee has no division', async () => {
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([pisEmployee({ DepartmentCode: null })]);
    const service = makeService(prisma);

    await expect(service.accountSSO_internal({ access_token: 'ad-token', email: 'user@pttplc.com' }))
      .rejects
      .toMatchObject({
        response: { error: 'Your division is not found in PIS, please contact Admin.' },
      });

    expect(prisma.division.findFirst).not.toHaveBeenCalled();
  });

  it('blocks production login when PIS division has no local allowed group', async () => {
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([pisEmployee()]);
    prisma.division.findFirst.mockResolvedValueOnce({ id: 222, division_id: '80000520', group: null });
    const service = makeService(prisma);

    await expect(service.accountSSO_internal({ access_token: 'ad-token', email: 'user@pttplc.com' }))
      .rejects
      .toMatchObject({
        response: { error: 'Your division is not allowed to access TPA system, please contact Admin.' },
      });

    expect(prisma.division.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { division_id: '80000520' },
    }));
  });

  it('selects exact email when PIS returns multiple employees', async () => {
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([
      pisEmployee({ EmailAddress: 'other@pttplc.com', EmployeeId: '100001' }),
      pisEmployee({ EmailAddress: 'user@pttplc.com', EmployeeId: '510071' }),
    ]);
    prisma.division.findFirst.mockResolvedValueOnce({ id: 222, division_id: '80000520', group: group(14) });
    prisma.account.findFirst
      .mockResolvedValueOnce(activeAccount())
      .mockResolvedValueOnce(activeAccount({ first_name: 'USER', last_name: 'EXAMPLE', account_manage: [{ ...activeAccount().account_manage[0], division_id: 222 }] }));
    prisma.account.upsert.mockResolvedValueOnce({ id: 13, email: 'user@pttplc.com' });
    prisma.account_manage.upsert.mockResolvedValueOnce({ id: 36 });
    prisma.account_role.upsert.mockResolvedValueOnce({ id: 10 });
    const service = makeService(prisma);

    await service.accountSSO_internal({ access_token: 'ad-token', email: 'user@pttplc.com' });

    expect(prisma.account.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ user_id: 'PTT-510071' }),
    }));
  });

  it('uses PIS EmailAddress as local account email when PIS returns it', async () => {
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([pisEmployee({ EmailAddress: 'pis-user@pttplc.com' })]);
    prisma.division.findFirst.mockResolvedValueOnce({ id: 222, division_id: '80000520', group: group(14) });
    prisma.account.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeAccount({ email: 'pis-user@pttplc.com', first_name: 'USER', last_name: 'EXAMPLE', account_manage: [{ ...activeAccount().account_manage[0], division_id: 222 }] }));
    prisma.account.upsert.mockResolvedValueOnce({ id: 13, email: 'pis-user@pttplc.com' });
    prisma.account_manage.upsert.mockResolvedValueOnce({ id: 36 });
    prisma.account_role.upsert.mockResolvedValueOnce({ id: 10 });
    const service = makeService(prisma);

    await service.accountSSO_internal({ access_token: 'ad-token', email: 'azure-user@pttplc.com' });

    expect(mockGetEmployeeEntries).toHaveBeenCalledWith({ EmployeeID: 'azure-user' });
    expect(prisma.account.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'pis-user@pttplc.com' },
      create: expect.objectContaining({ email: 'pis-user@pttplc.com' }),
      update: expect.objectContaining({ email: 'pis-user@pttplc.com' }),
    }));
  });

  it('updates stale local division when PIS division is valid even if group is unchanged', async () => {
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([pisEmployee()]);
    prisma.division.findFirst.mockResolvedValueOnce({ id: 222, division_id: '80000520', group: group(14) });
    prisma.account.findFirst
      .mockResolvedValueOnce(activeAccount({ account_manage: [{ ...activeAccount().account_manage[0], group_id: 14, division_id: 111 }] }))
      .mockResolvedValueOnce(activeAccount({ account_manage: [{ ...activeAccount().account_manage[0], group_id: 14, division_id: 222 }] }));
    prisma.account.upsert.mockResolvedValueOnce({ id: 13, email: 'user@pttplc.com' });
    prisma.account_manage.upsert.mockResolvedValueOnce({ id: 36 });
    prisma.account_role.upsert.mockResolvedValueOnce({ id: 10 });
    const service = makeService(prisma);

    await service.accountSSO_internal({ access_token: 'ad-token', email: 'user@pttplc.com' });

    expect(prisma.account_manage.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        division_id: 222,
        group_id: 14,
      }),
    }));
  });

  it('allows non-production whitelist fallback with existing local group and null division', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PIS_NONPROD_FALLBACK_EMAIL_WHITELIST = 'user@pttplc.com';
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([]);
    prisma.account.findFirst
      .mockResolvedValueOnce({ account_manage: [{ group: group(14) }] })
      .mockResolvedValueOnce(activeAccount({ account_manage: [{ ...activeAccount().account_manage[0], division_id: null, group_id: 14 }] }));
    const service = makeService(prisma);

    const result = await service.accountSSO_internal({ access_token: 'ad-token', email: 'user@pttplc.com' });

    expect(result.token).toBe('local-jwt');
    expect(prisma.account.upsert).not.toHaveBeenCalled();
  });

  it('blocks non-production whitelist fallback when fallback group env is missing and no existing group is found', async () => {
    process.env.NODE_ENV = 'development';
    process.env.PIS_NONPROD_FALLBACK_EMAIL_WHITELIST = 'user@pttplc.com';
    const prisma = makePrisma();
    mockGetEmployeeEntries.mockResolvedValueOnce([]);
    prisma.account.findFirst.mockResolvedValueOnce({ account_manage: [] });
    const service = makeService(prisma);

    await expect(service.accountSSO_internal({ access_token: 'ad-token', email: 'user@pttplc.com' }))
      .rejects
      .toMatchObject({
        response: { error: 'Unable to verify PIS information, please contact Admin.' },
      });
  });

  it('rejects legacy user/division payload when top-level email is not sent', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await expect(service.accountSSO_internal({
      access_token: 'ad-token',
      user: { email: 'user@pttplc.com', first_name: 'USER', last_name: 'EXAMPLE', employe_id: '510071' },
      division: { division_id: '80000520', division_short_name: 'DIV' },
    }))
      .rejects
      .toMatchObject({
        response: { error: 'email is required' },
      });

    expect(mockGetEmployeeEntries).not.toHaveBeenCalled();
    expect(prisma.division.findFirst).not.toHaveBeenCalled();
  });
});
