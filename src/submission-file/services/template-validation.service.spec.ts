import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {
  HttpException,
  HttpStatus
} from '@nestjs/common'
import {TemplateValidationService} from './template-validation.service'
import {PrismaService} from '../../../prisma/prisma.service'

describe('TemplateValidationService', () => {
  let service: TemplateValidationService
  let prismaService: PrismaService

  const mockPrismaService = {
    upload_template_for_shipper:
      {
        findFirst: jest.fn()
      },
    contract_code: {
      findFirst: jest.fn()
    },
    new_nomination_deadline: {
      findFirst: jest.fn()
    }
  }

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            TemplateValidationService,
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
      module.get<TemplateValidationService>(
        TemplateValidationService
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

  describe('executeTemplateValidation', () => {
    const mockTemplate = {
      id: 1,
      group_id: 1,
      contract_code_id: 1,
      nomination_type_id: 1,
      del_flag: false
    }

    const mockContractCode = {
      id: 1,
      status_capacity_request_management_id: 2, // Approved
      group: {
        id: 1,
        name: 'Test Shipper'
      },
      booking_version: []
    }

    const mockDeadline = {
      id: 1,
      process_type_id: 1,
      user_type_id: 1,
      nomination_type_id: 1
    }

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
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '01/01/2024',
          '02/01/2024',
          '03/01/2024',
          '04/01/2024',
          '05/01/2024',
          '06/01/2024',
          '07/01/2024'
        ]
      ]
    }

    const mockUserType = {
      user_type_id: 1,
      id_name: 'SHIPPER001'
    }

    it('should validate all templates successfully', async () => {
      mockPrismaService.upload_template_for_shipper.findFirst.mockResolvedValue(
        mockTemplate
      )
      mockPrismaService.contract_code.findFirst.mockResolvedValue(
        mockContractCode
      )
      mockPrismaService.new_nomination_deadline.findFirst
        .mockResolvedValueOnce(
          mockDeadline
        ) // First call for submission
        .mockResolvedValueOnce(
          mockDeadline
        ) // Second call for renomination

      const result =
        await service.executeTemplateValidation(
          1, // shipper_id
          1, // contract_code_id
          1, // nomination_type_id (Daily)
          mockUserType, // gAuserType
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          '01/01/2024', // startDateEx
          mockSheet1 // sheet1
        )

      expect(
        result
      ).toBeDefined()
      expect(
        result.isValid
      ).toBe(true)
      expect(
        result.checkTemplate
      ).toEqual(mockTemplate)
      expect(
        result.contractCode
      ).toEqual(
        mockContractCode
      )
    })

    it('should throw error when template is not found', async () => {
      mockPrismaService.upload_template_for_shipper.findFirst.mockResolvedValue(
        null
      )

      await expect(
        service.executeTemplateValidation(
          1, // shipper_id
          1, // contract_code_id
          1, // nomination_type_id
          mockUserType, // gAuserType
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          '01/01/2024', // startDateEx
          mockSheet1 // sheet1
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

    it('should throw error when contract capacity is rejected', async () => {
      mockPrismaService.upload_template_for_shipper.findFirst.mockResolvedValue(
        mockTemplate
      )
      const rejectedContractCode =
        {
          ...mockContractCode,
          status_capacity_request_management_id: 3 // Rejected
        }
      mockPrismaService.contract_code.findFirst.mockResolvedValue(
        rejectedContractCode
      )

      await expect(
        service.executeTemplateValidation(
          1, // shipper_id
          1, // contract_code_id
          1, // nomination_type_id
          mockUserType, // gAuserType
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          '01/01/2024', // startDateEx
          mockSheet1 // sheet1
        )
      ).rejects.toThrow(
        new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'Nomination upload not allowed : Capacity Right is rejected.'
          },
          HttpStatus.BAD_REQUEST
        )
      )
    })

    it('should throw error when contract is terminated', async () => {
      mockPrismaService.upload_template_for_shipper.findFirst.mockResolvedValue(
        mockTemplate
      )
      const terminatedContractCode =
        {
          ...mockContractCode,
          status_capacity_request_management_id: 5 // Terminated
        }
      mockPrismaService.contract_code.findFirst.mockResolvedValue(
        terminatedContractCode
      )

      await expect(
        service.executeTemplateValidation(
          1, // shipper_id
          1, // contract_code_id
          1, // nomination_type_id
          mockUserType, // gAuserType
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          '01/01/2024', // startDateEx
          mockSheet1 // sheet1
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

    it('should throw error when deadline is missing', async () => {
      mockPrismaService.upload_template_for_shipper.findFirst.mockResolvedValue(
        mockTemplate
      )
      mockPrismaService.contract_code.findFirst.mockResolvedValue(
        mockContractCode
      )
      mockPrismaService.new_nomination_deadline.findFirst.mockResolvedValue(
        null
      )

      await expect(
        service.executeTemplateValidation(
          1, // shipper_id
          1, // contract_code_id
          1, // nomination_type_id
          mockUserType, // gAuserType
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          '01/01/2024', // startDateEx
          mockSheet1 // sheet1
        )
      ).rejects.toThrow(
        new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'Deadline is missing. Please configure it before proceeding.'
          },
          HttpStatus.BAD_REQUEST
        )
      )
    })

    it('should throw error when weekly nomination does not start from Sunday', async () => {
      mockPrismaService.upload_template_for_shipper.findFirst.mockResolvedValue(
        mockTemplate
      )
      mockPrismaService.contract_code.findFirst.mockResolvedValue(
        mockContractCode
      )
      mockPrismaService.new_nomination_deadline.findFirst
        .mockResolvedValueOnce(
          mockDeadline
        )
        .mockResolvedValueOnce(
          mockDeadline
        )

      // Monday date (not Sunday)
      const mondaySheet = {
        data: [
          [
            'SHIPPER ID',
            'CONTRACT CODE',
            'START DATE'
          ],
          [
            'SHIPPER001',
            'CONTRACT001',
            '02/01/2024'
          ], // Monday
          [
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '02/01/2024',
            '03/01/2024',
            '04/01/2024',
            '05/01/2024',
            '06/01/2024',
            '07/01/2024',
            '08/01/2024'
          ]
        ]
      }

      await expect(
        service.executeTemplateValidation(
          1, // shipper_id
          1, // contract_code_id
          2, // nomination_type_id (Weekly)
          mockUserType, // gAuserType
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          '02/01/2024', // startDateEx (Monday)
          mondaySheet // sheet1
        )
      ).rejects.toThrow(
        new HttpException(
          {
            status:
              HttpStatus.BAD_REQUEST,
            error:
              'The date in the template must start from Sunday.'
          },
          HttpStatus.BAD_REQUEST
        )
      )
    })

    it('should handle database error', async () => {
      const error = new Error(
        'Database connection failed'
      )
      mockPrismaService.upload_template_for_shipper.findFirst.mockRejectedValue(
        error
      )

      await expect(
        service.executeTemplateValidation(
          1, // shipper_id
          1, // contract_code_id
          1, // nomination_type_id
          mockUserType, // gAuserType
          new Date(
            '2024-01-01'
          ), // todayStart
          new Date(
            '2024-01-02'
          ), // todayEnd
          '01/01/2024', // startDateEx
          mockSheet1 // sheet1
        )
      ).rejects.toThrow(
        'Database connection failed'
      )
    })
  })
})
