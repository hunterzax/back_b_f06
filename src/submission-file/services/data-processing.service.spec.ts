import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {
  HttpException,
  HttpStatus
} from '@nestjs/common'
import {DataProcessingService} from './data-processing.service'
import {PrismaService} from '../../../prisma/prisma.service'

describe('DataProcessingService', () => {
  let service: DataProcessingService
  let prismaService: PrismaService

  const mockPrismaService = {
    nomination_point: {
      findMany: jest.fn()
    },
    non_tpa_point: {
      findMany: jest.fn()
    },
    concept_point: {
      findMany: jest.fn()
    }
  }

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            DataProcessingService,
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
      module.get<DataProcessingService>(
        DataProcessingService
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

  describe('executeDataProcessing', () => {
    const mockSheet2 = {
      data: [
        ['Quality', 'Data'],
        ['Value1', 'Value2']
      ]
    }

    const mockNominationPoint =
      [
        {
          id: 1,
          name: 'Test Point',
          start_date:
            new Date(
              '2024-01-01'
            ),
          end_date: new Date(
            '2024-12-31'
          ),
          area: {
            id: 1,
            name: 'Test Area'
          },
          zone: {
            id: 1,
            name: 'Test Zone'
          },
          entry_exit: {
            id: 1,
            name: 'Entry'
          }
        }
      ]

    const mockNonTpa = [
      {
        id: 1,
        name: 'Test Non-TPA',
        start_date: new Date(
          '2024-01-01'
        ),
        end_date: new Date(
          '2024-12-31'
        ),
        nomination_point:
          mockNominationPoint[0]
      }
    ]

    const mockConceptPoint = [
      {
        id: 1,
        name: 'Test Concept',
        start_date: new Date(
          '2024-01-01'
        ),
        end_date: new Date(
          '2024-12-31'
        ),
        limit_concept_point:
          [],
        type_concept_point: {
          id: 1,
          name: 'Test Type'
        }
      }
    ]

    it('should process data successfully', async () => {
      mockPrismaService.nomination_point.findMany.mockResolvedValue(
        mockNominationPoint
      )
      mockPrismaService.non_tpa_point.findMany.mockResolvedValue(
        mockNonTpa
      )
      mockPrismaService.concept_point.findMany.mockResolvedValue(
        mockConceptPoint
      )

      const result =
        await service.executeDataProcessing(
          '01/01/2024', // startDateEx
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          mockSheet2 // sheet2
        )

      expect(
        result
      ).toBeDefined()
      expect(
        result.startDateExConv
      ).toBeDefined()
      expect(
        result.renom
      ).toBeNull()
      expect(
        result.getsValue
      ).toEqual([])
      expect(
        result.getsValueNotMatch
      ).toEqual([])
      expect(
        result.getsValuePark
      ).toEqual([])
      expect(
        result.getsValueSheet2
      ).toEqual([])
      expect(
        result.caseData
      ).toBeDefined()
      expect(
        result.informationData
      ).toBeDefined()
      expect(
        result.fullDataRow
      ).toEqual([])
      expect(
        result.flagEmtry
      ).toBe(true)
      expect(
        result.overuseQuantity
      ).toBe(false)
      expect(
        result.overMaximumHourCapacityRight
      ).toBe(false)
      expect(
        result.nominationPoint
      ).toEqual(
        mockNominationPoint
      )
      expect(
        result.nonTpa
      ).toEqual(mockNonTpa)
      expect(
        result.conceptPoint
      ).toEqual(
        mockConceptPoint
      )
      expect(
        result.isEqualSheet2
      ).toBe(true)
    })

    it('should throw error when quality sheet is invalid', async () => {
      const invalidSheet2 =
        null

      await expect(
        service.executeDataProcessing(
          '01/01/2024', // startDateEx
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          invalidSheet2 // sheet2
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

    it('should throw error when quality sheet has no data', async () => {
      const emptySheet2 = {
        data: []
      }

      await expect(
        service.executeDataProcessing(
          '01/01/2024', // startDateEx
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          emptySheet2 // sheet2
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

    it('should handle database error for nomination points', async () => {
      const error = new Error(
        'Database connection failed'
      )
      mockPrismaService.nomination_point.findMany.mockRejectedValue(
        error
      )

      await expect(
        service.executeDataProcessing(
          '01/01/2024', // startDateEx
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          mockSheet2 // sheet2
        )
      ).rejects.toThrow(
        'Database connection failed'
      )
    })

    it('should handle database error for non-TPA points', async () => {
      mockPrismaService.nomination_point.findMany.mockResolvedValue(
        mockNominationPoint
      )
      const error = new Error(
        'Database connection failed'
      )
      mockPrismaService.non_tpa_point.findMany.mockRejectedValue(
        error
      )

      await expect(
        service.executeDataProcessing(
          '01/01/2024', // startDateEx
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          mockSheet2 // sheet2
        )
      ).rejects.toThrow(
        'Database connection failed'
      )
    })

    it('should handle database error for concept points', async () => {
      mockPrismaService.nomination_point.findMany.mockResolvedValue(
        mockNominationPoint
      )
      mockPrismaService.non_tpa_point.findMany.mockResolvedValue(
        mockNonTpa
      )
      const error = new Error(
        'Database connection failed'
      )
      mockPrismaService.concept_point.findMany.mockRejectedValue(
        error
      )

      await expect(
        service.executeDataProcessing(
          '01/01/2024', // startDateEx
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          mockSheet2 // sheet2
        )
      ).rejects.toThrow(
        'Database connection failed'
      )
    })

    it('should handle empty results from database', async () => {
      mockPrismaService.nomination_point.findMany.mockResolvedValue(
        []
      )
      mockPrismaService.non_tpa_point.findMany.mockResolvedValue(
        []
      )
      mockPrismaService.concept_point.findMany.mockResolvedValue(
        []
      )

      const result =
        await service.executeDataProcessing(
          '01/01/2024', // startDateEx
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          mockSheet2 // sheet2
        )

      expect(
        result
      ).toBeDefined()
      expect(
        result.nominationPoint
      ).toEqual([])
      expect(
        result.nonTpa
      ).toEqual([])
      expect(
        result.conceptPoint
      ).toEqual([])
    })
  })
})
