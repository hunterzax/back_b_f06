export {};

const mockGetSearchUnitEntries = jest.fn();

function loadService() {
  jest.resetModules();
  jest.doMock('src/common/utils/pis.util', () => ({
    PIS: jest.fn().mockImplementation(() => ({
      getSearchUnitEntries: mockGetSearchUnitEntries,
    })),
  }), { virtual: true });
  jest.doMock('prisma/prisma.service', () => ({
    PrismaService: class PrismaService { },
  }), { virtual: true });

  const { AccountManageDivisionMasterService } = require('./division-master');
  return AccountManageDivisionMasterService;
}

const makePrisma = () => ({
  division: {
    findMany: jest.fn(),
    upsert: jest.fn().mockResolvedValue({ id: 1 }),
  },
});

const makeService = (prisma: any) => {
  const AccountManageDivisionMasterService = loadService();
  return new AccountManageDivisionMasterService(prisma);
};

const divisionRow = (overrides: any = {}) => ({
  unitcode: '80000520',
  unitname: 'Shift D System Operator Unit',
  unitabbr: 'DIV-D',
  ...overrides,
});

describe('AccountManageDivisionMasterService divisionSync', () => {
  beforeEach(() => {
    mockGetSearchUnitEntries.mockReset();
  });

  it('calls PIS SearchUnit when payload data is not supplied', async () => {
    const prisma = makePrisma();
    mockGetSearchUnitEntries.mockResolvedValueOnce([divisionRow()]);
    const service = makeService(prisma);

    const result = await service.divisionSync({}, 13);

    expect(result).toBe('success');
    expect(mockGetSearchUnitEntries).toHaveBeenCalledTimes(1);
    expect(prisma.division.upsert).toHaveBeenCalledWith({
      where: { division_id: '80000520' },
      update: {
        division_name: 'Shift D System Operator Unit',
        division_short_name: 'DIV-D',
      },
      create: expect.objectContaining({
        division_id: '80000520',
        division_name: 'Shift D System Operator Unit',
        division_short_name: 'DIV-D',
      }),
    });
  });

  it('ignores frontend payload data and always calls PIS SearchUnit', async () => {
    const prisma = makePrisma();
    mockGetSearchUnitEntries.mockResolvedValueOnce([divisionRow({ unitcode: '80000520' })]);
    const service = makeService(prisma);

    await service.divisionSync({ data: [divisionRow({ unitcode: '80000001' })] }, 13);

    expect(mockGetSearchUnitEntries).toHaveBeenCalledTimes(1);
    expect(prisma.division.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { division_id: '80000520' },
    }));
    expect(prisma.division.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { division_id: '80000001' },
    }));
  });

  it('skips empty unitcode rows and upserts valid rows', async () => {
    const prisma = makePrisma();
    mockGetSearchUnitEntries.mockResolvedValueOnce([
      divisionRow({ unitcode: '' }),
      divisionRow({ unitcode: '80000520' }),
    ]);
    const service = makeService(prisma);

    await service.divisionSync({}, 13);

    expect(prisma.division.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.division.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { division_id: '80000520' },
    }));
  });

  it('blocks when PIS SearchUnit returns no division rows', async () => {
    const prisma = makePrisma();
    mockGetSearchUnitEntries.mockResolvedValueOnce([]);
    const service = makeService(prisma);

    await expect(service.divisionSync({}, 13))
      .rejects
      .toMatchObject({
        response: { error: 'Division data is not found in PIS, please contact Admin.' },
      });

    expect(prisma.division.upsert).not.toHaveBeenCalled();
  });

  it('blocks when all division rows have empty unitcode', async () => {
    const prisma = makePrisma();
    mockGetSearchUnitEntries.mockResolvedValueOnce([
      divisionRow({ unitcode: '' }),
      divisionRow({ unitcode: null }),
    ]);
    const service = makeService(prisma);

    await expect(service.divisionSync({}, 13))
      .rejects
      .toMatchObject({
        response: { error: 'Division data is not found in PIS, please contact Admin.' },
      });
  });

  it('blocks when PIS SearchUnit request fails', async () => {
    const prisma = makePrisma();
    mockGetSearchUnitEntries.mockRejectedValueOnce({ response: { status: 500 }, message: 'upstream failed' });
    const service = makeService(prisma);

    await expect(service.divisionSync({}, 13))
      .rejects
      .toMatchObject({
        response: { error: 'Unable to sync division from PIS, please contact Admin.' },
      });
  });
});
