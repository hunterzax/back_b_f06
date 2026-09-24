import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {PathManagementController} from './path-management.controller'
import {PathManagementService} from './path-management.service'

describe('PathManagementController', () => {
  let controller: PathManagementController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            PathManagementController
          ],
          providers: [
            PathManagementService
          ]
        }
      ).compile()

    controller =
      module.get<PathManagementController>(
        PathManagementController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
