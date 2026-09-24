import {Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query} from '@nestjs/common'
import {WaitingListService} from './waiting-list.service'
import {AuthGuard} from 'src/auth/auth.guard'

@Controller('waiting-list')
export class WaitingListController {
  constructor(private readonly waitingListService: WaitingListService) {}

  @UseGuards(AuthGuard)
  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findAll(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get("v2")
  findAllV2(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findAllV2(query, userId)
  }

  

  @UseGuards(AuthGuard)
  @Get('allocation-review')
  findAllocationReview(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findAllocationReview(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('allocation-management')
  findAllocationManagement(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findAllocationManagement(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('offspec-gas')
  findOffspecGas(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findOffspecGas(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('emer')
  findEmer(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findEmer(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('ofo')
  findOfo(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findOfo(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('nomination')
  findNomination(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findNomination(query, userId)
  }

  // daily adjustment
  @UseGuards(AuthGuard)
  @Get('nomination-adjustment')
  findNominationAdjustment(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findNominationAdjustment(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('contract')
  findContract(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findContract(query, userId)
  }

  @UseGuards(AuthGuard)
  @Get('release-capacity-management')
  findContractReleaseCapacity(@Req() req: any, @Query() query: any) {
    const userId = req?.user?.sub
    return this.waitingListService.findContractReleaseCapacity(query, userId)
  }
}
