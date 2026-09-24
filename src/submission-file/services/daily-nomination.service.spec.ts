import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {
  HttpException,
  HttpStatus
} from '@nestjs/common'
import {DailyNominationService} from './daily-nomination.service'
import {PrismaService} from '../../../prisma/prisma.service'

describe('DailyNominationService', () => {
  let service: DailyNominationService
  let prismaService: PrismaService

  const mockPrismaService = {
    zone: {
      findMany: jest.fn()
    }
  }

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            DailyNominationService,
            {
              provide:
                PrismaService,
              useValue:
                mockPrismaService
            }
          ]
        }
      ).compile()

    service =
      module.get<DailyNominationService>(
        DailyNominationService
      )
    prismaService =
      module.get<PrismaService>(
        PrismaService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })

  describe('executeDailyNomination', () => {
    const mockSheet1 = {
      data: [
        [
          'SHIPPER ID',
          'CONTRACT CODE',
          'START DATE'
        ],
        [
          'SHIPPER001',
          'CONTRACT001',
          '01/01/2024'
        ],
        [
          '1',
          '2',
          '3',
          '4',
          '5',
          '6',
          '7',
          '8',
          '9',
          '10',
          '11',
          '12',
          '13',
          '14',
          '15',
          '16',
          '17',
          '18',
          '19',
          '20',
          '21',
          '22',
          '23',
          '24'
        ]
      ]
    }

    const mockContractCode = {
      booking_version: [
        {
          booking_full_json: [
            {
              data_temp:
                JSON.stringify(
                  {
                    headerEntry:
                      {
                        'Capacity Daily Booking (MMBTU/d)':
                          {
                            key: 'test',
                            value: 100
                          },
                        'Maximum Hour Booking (MMBTU/h)':
                          {
                            key: 'test',
                            value: 50
                          }
                      },
                    headerExit:
                      {
                        'Capacity Daily Booking (MMBTU/d)':
                          {
                            key: 'test',
                            value: 100
                          },
                        'Maximum Hour Booking (MMBTU/h)':
                          {
                            key: 'test',
                            value: 50
                          }
                      },
                    entryValue:
                      {
                        test: 100
                      },
                    exitValue:
                      {
                        test: 100
                      }
                  }
                )
            }
          ]
        }
      ],
      file_period_mode: 1
    }

    const mockDeadline = {
      id: 1,
      process_type_id: 1,
      user_type_id: 1,
      nomination_type_id: 1
    }

    const mockZoneQualityMaster =
      [
        {
          id: 1,
          name: 'Test Zone',
          start_date:
            new Date(
              '2024-01-01'
            ),
          end_date: new Date(
            '2024-12-31'
          )
        }
      ]

    it('should process daily nomination successfully', async () => {
      mockPrismaService.zone.findMany.mockResolvedValue(
        mockZoneQualityMaster
      )

      const result =
        await service.executeDailyNomination(
          'Daily Nomination', // checkType
          1, // nomination_type_id
          '01/01/2024', // startDateExConv
          mockDeadline, // nominationDeadlineSubmission
          mockDeadline, // nominationDeadlineReceptionOfRenomination
          mockSheet1, // sheet1
          mockContractCode, // contractCode
          new Date(
            '2024-01-02'
          ), // todayEnd
          false // flagEmtry
        )

      expect(
        result
      ).toBeDefined()
      expect(
        result.isValid
      ).toBe(true)
      expect(
        result.renom
      ).toBeDefined()
      expect(
        result.sheet1
      ).toBeDefined()
      expect(
        result.flagEmtry
      ).toBe(false)
      expect(
        result.bookingFullJson
      ).toBeDefined()
      expect(
        result.headerEntryCDBMMBTUD
      ).toBeDefined()
      expect(
        result.headerExitCDBMMBTUD
      ).toBeDefined()
      expect(
        result.headerEntryCDBMMBTUH
      ).toBeDefined()
      expect(
        result.headerExitCDBMMBTUH
      ).toBeDefined()
      expect(
        result.entryValue
      ).toBeDefined()
      expect(
        result.exitValue
      ).toBeDefined()
      expect(
        result.filePeriodMode
      ).toBe(1)
      expect(
        result.zoneQualityMaster
      ).toEqual(
        mockZoneQualityMaster
      )
    })

    it('should throw error when nomination type does not match', async () => {
      await expect(
        service.executeDailyNomination(
          'Daily Nomination', // checkType
          2, // nomination_type_id (wrong type)
          '01/01/2024', // startDateExConv
          mockDeadline, // nominationDeadlineSubmission
          mockDeadline, // nominationDeadlineReceptionOfRenomination
          mockSheet1, // sheet1
          mockContractCode, // contractCode
          new Date(
            '2024-01-02'
          ), // todayEnd
          false // flagEmtry
        )
      ).rejects.toThrow(
        new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'File template does not match the required format.'
          },
          HttpStatus.BAD_REQUEST
        )
      )
    })

    it('should throw error when file is empty', async () => {
      await expect(
        service.executeDailyNomination(
          'Daily Nomination', // checkType
          1, // nomination_type_id
          '01/01/2024', // startDateExConv
          mockDeadline, // nominationDeadlineSubmission
          mockDeadline, // nominationDeadlineReceptionOfRenomination
          mockSheet1, // sheet1
          mockContractCode, // contractCode
          new Date(
            '2024-01-02'
          ), // todayEnd
          true // flagEmtry (empty file)
        )
      ).rejects.toThrow(
        new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'Invalid File : Values are missing. Please provide at least one valid entry'
          },
          HttpStatus.BAD_REQUEST
        )
      )
    })

    it('should handle non-daily nomination', async () => {
      const result =
        await service.executeDailyNomination(
          'Weekly Nomination', // checkType
          2, // nomination_type_id
          '01/01/2024', // startDateExConv
          mockDeadline, // nominationDeadlineSubmission
          mockDeadline, // nominationDeadlineReceptionOfRenomination
          mockSheet1, // sheet1
          mockContractCode, // contractCode
          new Date(
            '2024-01-02'
          ), // todayEnd
          false // flagEmtry
        )

      expect(
        result
      ).toBeDefined()
      expect(
        result.isValid
      ).toBe(true)
      expect(
        result.renom
      ).toBeNull()
      expect(
        result.bookingFullJson
      ).toBeNull()
      expect(
        result.message
      ).toBe(
        'Non-daily nomination, skipping daily processing'
      )
    })

    it('should handle database error', async () => {
      const error = new Error(
        'Database connection failed'
      )
      mockPrismaService.zone.findMany.mockRejectedValue(
        error
      )

      await expect(
        service.executeDailyNomination(
          'Daily Nomination', // checkType
          1, // nomination_type_id
          '01/01/2024', // startDateExConv
          mockDeadline, // nominationDeadlineSubmission
          mockDeadline, // nominationDeadlineReceptionOfRenomination
          mockSheet1, // sheet1
          mockContractCode, // contractCode
          new Date(
            '2024-01-02'
          ), // todayEnd
          false // flagEmtry
        )
      ).rejects.toThrow(
        'Database connection failed'
      )
    })

    it('should handle missing booking data', async () => {
      const contractCodeWithoutBooking =
        {
          booking_version: [],
          file_period_mode: 1
        }

      await expect(
        service.executeDailyNomination(
          'Daily Nomination', // checkType
          1, // nomination_type_id
          '01/01/2024', // startDateExConv
          mockDeadline, // nominationDeadlineSubmission
          mockDeadline, // nominationDeadlineReceptionOfRenomination
          mockSheet1, // sheet1
          contractCodeWithoutBooking, // contractCode
          new Date(
            '2024-01-02'
          ), // todayEnd
          false // flagEmtry
        )
      ).rejects.toThrow()
    })

    it('should handle invalid JSON in booking data', async () => {
      const contractCodeWithInvalidJson =
        {
          booking_version: [
            {
              booking_full_json:
                [
                  {
                    data_temp:
                      'invalid json'
                  }
                ]
            }
          ],
          file_period_mode: 1
        }

      await expect(
        service.executeDailyNomination(
          'Daily Nomination', // checkType
          1, // nomination_type_id
          '01/01/2024', // startDateExConv
          mockDeadline, // nominationDeadlineSubmission
          mockDeadline, // nominationDeadlineReceptionOfRenomination
          mockSheet1, // sheet1
          contractCodeWithInvalidJson, // contractCode
          new Date(
            '2024-01-02'
          ), // todayEnd
          false // flagEmtry
        )
      ).rejects.toThrow()
    })
  })
})
