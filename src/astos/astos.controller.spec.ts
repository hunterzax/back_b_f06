import {
  Test,
  TestingModule
} from '@nestjs/testing'
import {AstosController} from './astos.controller'
import {AstosService} from './astos.service'

describe('AstosController', () => {
  let controller: AstosController

  beforeEach(async () => {
    const module: TestingModule =
      await Test.createTestingModule(
        {
          controllers: [
            AstosController
          ],
          providers: [
            AstosService
          ]
        }
      ).compile()

    controller =
      module.get<AstosController>(
        AstosController
      )
  })

  it('should be defined', () => {
    expect(
      controller
    ).toBeDefined()
  })
})
