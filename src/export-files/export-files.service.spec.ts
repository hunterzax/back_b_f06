import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {ExportFilesService} from './export-files.service'

describe('ExportFilesService', () => {
  let service: ExportFilesService

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          providers: [
            ExportFilesService
          ]
        }
      ).compile()

    service =
      module.get<ExportFilesService>(
        ExportFilesService
      )
  })

  it('should be defined', () => {
    expect(
      service
    ).toBeDefined()
  })
})
