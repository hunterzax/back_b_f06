import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common'

export interface StatusValidationResult {
  isValid: boolean
  message?: string
}

@Injectable()
export class StatusValidationService {
  private readonly logger = new Logger(StatusValidationService.name)
  /**
   * STEP 7-11: STATUS AND PERMISSION VALIDATION
   * ตรวจสอบสถานะและสิทธิ์ต่างๆ
   *
   * @param shipper_id - ID ของ shipper ที่ตรวจสอบแล้ว
   * @param shipperCompare - ข้อมูล shipper สำหรับเปรียบเทียบ
   * @param contract_code_id - ID ของ contract code ที่ตรวจสอบแล้ว
   * @param contractCodeNameCompare - ข้อมูล contract code สำหรับเปรียบเทียบ
   * @param contractCodeName - ข้อมูล contract code ที่ตรวจสอบแล้ว
   * @param shipper - ข้อมูล shipper ที่ตรวจสอบแล้ว
   * @param gAuserType - ข้อมูล user type
   * @param sheet1 - ข้อมูล sheet หลัก
   * @returns StatusValidationResult - ผลลัพธ์การตรวจสอบ
   */
  async executeStatusValidation(shipper_id: number, shipperCompare: any, contract_code_id: number, contractCodeNameCompare: any, contractCodeName: any, shipper: any, gAuserType: any, sheet1: any, reserveBalancingGasContract?: any): Promise<StatusValidationResult> {
    try {
      // มีเช็คแล้ว
      // // ===== STEP 7: SHIPPER STATUS VALIDATION =====
      // this.validateShipperStatus(shipper_id, shipperCompare)

      // มีเช็คแล้ว
      // // ===== STEP 8: CONTRACT CODE STATUS VALIDATION =====
      // this.validateContractCodeStatus(contract_code_id, contractCodeNameCompare, reserveBalancingGasContract)

      // ===== STEP 9: SHIPPER-CONTRACT RELATIONSHIP VALIDATION =====
      // this.validateShipperContractRelationship(contractCodeName ?? reserveBalancingGasContract, shipper)
      if (contractCodeName) {
        this.validateShipperContractRelationship(contractCodeName, shipper, sheet1, 'contract')
      } else if (reserveBalancingGasContract) {
        this.validateShipperContractRelationship(reserveBalancingGasContract, shipper, sheet1, 'reserv')
      }

      // ===== STEP 10: USER PERMISSION VALIDATION =====
      this.validateUserPermission(gAuserType, sheet1)

      // มีเช็คแล้ว
      // // ===== STEP 11: CONTRACT CODE PRESENCE VALIDATION =====
      // this.validateContractCodePresence(sheet1, contract_code_id ?? reserveBalancingGasContract?.id)

      this.logger.log('STEP 7-11: STATUS AND PERMISSION VALIDATION completed successfully')

      return {
        isValid: true,
        message: 'All validations passed'
      }
    } catch (error) {
      this.logger.error('Error in STEP 7-11: STATUS AND PERMISSION VALIDATION:', error)
      throw error
    }
  }

  /**
   * STEP 7: SHIPPER STATUS VALIDATION
   * ตรวจสอบสถานะ shipper
   *
   * @param shipper_id - ID ของ shipper ที่ตรวจสอบแล้ว
   * @param shipperCompare - ข้อมูล shipper สำหรับเปรียบเทียบ
   * @throws HttpException if shipper status is invalid
   */
  private validateShipperStatus(shipper_id: number, shipperCompare: any) {
    // Check if shipper exists but is inactive
    if (!!!shipper_id && !!shipperCompare?.id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Shipper is inactivated.'
        },
        HttpStatus.BAD_REQUEST
      )
    } else if (!!!shipperCompare?.id) {
      // Check if shipper doesn't exist at all
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Shipper ID is inactive.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    this.logger.log('STEP 7: Shipper status validation passed')
  }

  /**
   * STEP 8: CONTRACT CODE STATUS VALIDATION
   * ตรวจสอบสถานะ contract code
   *
   * @param contract_code_id - ID ของ contract code ที่ตรวจสอบแล้ว
   * @param contractCodeNameCompare - ข้อมูล contract code สำหรับเปรียบเทียบ
   * @throws HttpException if contract code status is invalid
   */
  private validateContractCodeStatus(contract_code_id: number, contractCodeNameCompare: any, reserveBalancingGasContract: any) {
    // Check if contract code exists but is inactive

    if (!!!contract_code_id && !!contractCodeNameCompare?.id && !!!reserveBalancingGasContract?.id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code is inactivated.'
        },
        HttpStatus.BAD_REQUEST
      )
    } else if (!!!contractCodeNameCompare?.id && !!!reserveBalancingGasContract?.id) {
      // Check if contract code doesn't exist at all
      this.logger.log('HttpException 1')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code is incorrect.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    this.logger.log('STEP 8: Contract code status validation passed')
  }

  /**
   * STEP 9: SHIPPER-CONTRACT RELATIONSHIP VALIDATION
   * ตรวจสอบความสัมพันธ์ระหว่าง shipper และ contract
   *
   * @param contractCodeName - ข้อมูล contract code ที่ตรวจสอบแล้ว
   * @param shipper - ข้อมูล shipper ที่ตรวจสอบแล้ว
   * @throws HttpException if relationship is invalid
   */
  private validateShipperContractRelationship(contractCodeName: any, shipper: any, sheet1: any, type: any) {
    // Ensure contract code belongs to the specified shipper
    let messageError = []
    if (contractCodeName?.group?.name !== shipper?.name) {
      this.logger.log('HttpException 2')
      messageError.push('Contract Code is incorrect.')
      // throw new HttpException(
      //   {
      //     status: HttpStatus.BAD_REQUEST,
      //     error: 'Contract Code is incorrect.'
      //   },
      //   HttpStatus.BAD_REQUEST
      // )
    }

    if (type === 'contract') {
      if (contractCodeName?.contract_code !== sheet1?.data[1][1]) {
        messageError.push('Contract Code does not match')
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: 'Contract Code does not match'
        //   },
        //   HttpStatus.BAD_REQUEST
        // )
      } else if (contractCodeName?.group?.id_name !== sheet1?.data[1][0]) {
        messageError.push('Shipper ID does not match')
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: 'Shipper ID does not match'
        //   },
        //   HttpStatus.BAD_REQUEST
        // )
      }
    } else if (type === 'reserv') {
      if (contractCodeName?.res_bal_gas_contract !== sheet1?.data[1][1]) {
        messageError.push('Contract Code does not match')
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: 'Contract Code does not match'
        //   },
        //   HttpStatus.BAD_REQUEST
        // )
      } else if (contractCodeName?.group?.id_name !== sheet1?.data[1][0]) {
        messageError.push('Shipper ID does not match')
        // throw new HttpException(
        //   {
        //     status: HttpStatus.BAD_REQUEST,
        //     error: 'Shipper ID does not match'
        //   },
        //   HttpStatus.BAD_REQUEST
        // )
      }
    }
    this.logger.log('STEP 9: Shipper-contract relationship validation passed')
    if (messageError?.length > 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: messageError?.join('<br/>')
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  /**
   * STEP 10: USER PERMISSION VALIDATION
   * ตรวจสอบสิทธิ์ผู้ใช้
   *
   * @param gAuserType - ข้อมูล user type
   * @param sheet1 - ข้อมูล sheet หลัก
   * @throws HttpException if user permission is invalid
   */
  private validateUserPermission(gAuserType: any, sheet1: any) {
    // Check if user type 3 (shipper user) can only upload for their own shipper
    if (gAuserType?.user_type_id === 3) {
      if (gAuserType?.id_name !== sheet1?.data[1][0]) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Shipper is not matched.' // https://app.clickup.com/t/86etzcgux
          },
          HttpStatus.BAD_REQUEST
        )
      }
    }

    this.logger.log('STEP 10: User permission validation passed')
  }

  /**
   * STEP 11: CONTRACT CODE PRESENCE VALIDATION
   * ตรวจสอบการมีอยู่ของ contract code
   *
   * @param sheet1 - ข้อมูล sheet หลัก
   * @param contract_code_id - ID ของ contract code ที่ตรวจสอบแล้ว
   * @throws HttpException if contract code presence is invalid
   */
  private validateContractCodePresence(sheet1: any, contract_code_id: number) {
    // Check if contract code field is not empty

    if (!!!sheet1?.data[1][1]) {
      this.logger.log('HttpException 3')

      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code is incorrect.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // Check if contract code ID is valid
    if (!!!contract_code_id) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Contract Code does not match.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    this.logger.log('STEP 11: Contract code presence validation passed')
  }
}
