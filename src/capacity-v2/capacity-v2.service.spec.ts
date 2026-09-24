import { Test, TestingModule } from '@nestjs/testing';
import { CapacityV2Service } from './capacity-v2.service';

describe('CapacityV2Service', () => {
  let service: CapacityV2Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CapacityV2Service],
    }).compile();

    service = module.get<CapacityV2Service>(CapacityV2Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
