import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {UploadTemplateForShipperController} from './upload-template-for-shipper.controller'
import {UploadTemplateForShipperService} from './upload-template-for-shipper.service'

describe('UploadTemplateForShipperController', () => {
  let controller: UploadTemplateForShipperController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            UploadTemplateForShipperController
          ],
          providers: [
            UploadTemplateForShipperService
          ]
        }
      ).compile()

    controller =
      module.get<UploadTemplateForShipperController>(
        UploadTemplateForShipperController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
