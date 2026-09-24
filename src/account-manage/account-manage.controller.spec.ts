import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {AccountManageController} from './account-manage.controller'
import {AccountManageService} from './account-manage.service'

describe('AccountManageController', () => {
  let controller: AccountManageController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            AccountManageController
          ],
          providers: [
            AccountManageService
          ]
        }
      ).compile()

    controller =
      module.get<AccountManageController>(
        AccountManageController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
