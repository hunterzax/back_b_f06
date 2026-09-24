import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query
} from '@nestjs/common'
import {CapacityDashboardService} from './capacity-dashboard.service'
import {CreateCapacityDashboardDto} from './dto/create-capacity-dashboard.dto'
import {UpdateCapacityDashboardDto} from './dto/update-capacity-dashboard.dto'

@Controller(
  'capacity-dashboard'
)
export class CapacityDashboardController {
  constructor(
    private readonly capacityDashboardService: CapacityDashboardService
  ) {}

  @Get('status-process')
  async statusProcess(
    @Query() query: any
  ) {
    return await this.capacityDashboardService.statusProcess(
      query
    )
  }

  @Get('area-data-graph')
  async areaDataGraph(
    @Query() query: any
  ) {
    return await this.capacityDashboardService.areaDataGraph(
      query
    )
  }
}
