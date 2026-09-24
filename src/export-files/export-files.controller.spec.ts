import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ExportFilesController} from './export-files.controller'
import {ExportFilesService} from './export-files.service'

describe('ExportFilesController', () => {
  let controller: ExportFilesController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            ExportFilesController
          ],
          providers: [
            ExportFilesService
          ]
        }
      ).compile()

    controller =
      module.get<ExportFilesController>(
        ExportFilesController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
