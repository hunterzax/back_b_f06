import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {UploadTemplateForShipperService} from './upload-template-for-shipper.service'

describe('UploadTemplateForShipperService', () => {
  let service: UploadTemplateForShipperService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            UploadTemplateForShipperService
          ]
        }
      ).compile()

    service =
      module.get<UploadTemplateForShipperService>(
        UploadTemplateForShipperService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
