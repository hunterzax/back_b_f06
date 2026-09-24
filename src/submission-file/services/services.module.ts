import {Module} from '@nestjs/common'
import {PrismaService} from '../../../prisma/prisma.service'
import {FileValidationService} from './file-validation.service'
import {InitialSetupService} from './initial-setup.service'
import {FileTypeValidationService} from './file-type-validation.service'
import {SheetDataExtractionService} from './sheet-data-extraction.service'
import {StatusValidationService} from './status-validation.service'
import {TemplateValidationService} from './template-validation.service'
import {DataProcessingService} from './data-processing.service'
import {DailyNominationService} from './daily-nomination.service'
import {HandleReserveBalancingGasContractService} from './handle-reserve-balancing-gas-contract-service'
import {UploadTemplateForShipperService} from '../../upload-template-for-shipper/upload-template-for-shipper.service'

@Module({
  providers: [
    FileValidationService,
    InitialSetupService,
    FileTypeValidationService,
    SheetDataExtractionService,
    StatusValidationService,
    TemplateValidationService,
    DataProcessingService,
    DailyNominationService,
    HandleReserveBalancingGasContractService,
    PrismaService,
    UploadTemplateForShipperService
  ],
  exports: [
    FileValidationService,
    InitialSetupService,
    FileTypeValidationService,
    SheetDataExtractionService,
    StatusValidationService,
    TemplateValidationService,
    DataProcessingService,
    DailyNominationService,
    HandleReserveBalancingGasContractService
  ]
})
export class ServicesModule {}
