import { Test, TestingModule } from '@nestjs/testing';
import { CapacityV2Controller } from './capacity-v2.controller';
import { CapacityV2Service } from './capacity-v2.service';

describe('CapacityV2Controller', () => {
  let controller: CapacityV2Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CapacityV2Controller],
      providers: [CapacityV2Service],
    }).compile();

    controller = module.get<CapacityV2Controller>(CapacityV2Controller);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
