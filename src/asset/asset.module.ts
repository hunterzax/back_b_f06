import {Module} from '@nestjs/common'
import {AssetService} from './asset.service'
import {AssetController} from './asset.controller'
import {AccountManageModule} from 'src/account-manage/account-manage.module'
import {AccountManageService} from 'src/account-manage/account-manage.service'
import {JwtModule} from '@nestjs/jwt'
import {jwtConstants} from 'src/auth/constants'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AssetZoneService} from './zone'
import {AssetAreaService} from './area'
import {AssetConfigMasterPathService} from './config-master-path'
import {AssetContractPointService} from './contract-point'
import {AssetNominationPointService} from './nomination-point'
import {AssetCustomerTypeService} from './customer-type'
import {AssetNonTpaPointService} from './non-tpa-point'
import {AssetMeteringPointService} from './metering-point'
import {AssetConceptPointService} from './concept-point'

@Module({
  imports: [GrpcModule],
  providers: [
    AssetService,
    AccountManageService,
    AssetZoneService,
    AssetAreaService,
    AssetConfigMasterPathService,
    AssetContractPointService,
    AssetNominationPointService,
    AssetCustomerTypeService,
    AssetNonTpaPointService,
    AssetMeteringPointService,
    AssetConceptPointService
  ],
  controllers: [
    AssetController
  ],
  exports: [AssetService]
})
export class AssetModule {}
