import {Module} from '@nestjs/common'
import {AccountManageService} from './account-manage.service'
import {AccountManageController} from './account-manage.controller'
import {JwtModule} from '@nestjs/jwt'
import {jwtConstants} from 'src/auth/constants'
import {EmailClientService} from 'src/grpc/email-service.service'
import {GrpcModule} from 'src/grpc/grpc.module'
import {AccountManageSystemLoginService} from './system-login'
import {AccountManageBankMasterService} from './bank-master'
import {AccountManageHistoryService} from './history'
import {AccountManageUserTypeService} from './user-type'
import {AccountManageGroupMasterService} from './group-master'
import {AccountManageAreaContractService} from './area-contract'
import {AccountManageDivisionMasterService} from './division-master'
import {AccountManageRoleMasterService} from './role-master'
import {AccountManageTandCService} from './tandc'

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret:
        jwtConstants.secret,
      signOptions: {
        expiresIn: '86400s'
      }
    }),
    GrpcModule
  ],
  controllers: [
    AccountManageController
  ],
  providers: [
    AccountManageService,
    AccountManageSystemLoginService,
    AccountManageBankMasterService,
    AccountManageHistoryService,
    AccountManageUserTypeService,
    AccountManageGroupMasterService,
    AccountManageAreaContractService,
    AccountManageDivisionMasterService,
    AccountManageRoleMasterService,
    AccountManageTandCService
  ],
  exports: [
    AccountManageService
  ]
})
export class AccountManageModule {}
