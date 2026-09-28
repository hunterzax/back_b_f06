import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common'
import { TemplateValidationService } from './template-validation.service'

export interface FileTypeValidationResult {
  findData: any[]
  checkType: string | null
  nomination_type_id: number | null
  sheet1:any, sheet2:any, sheet3:any, startDateEx:any
}

@Injectable()
export class FileTypeValidationService {
  private readonly logger = new Logger(FileTypeValidationService.name)
    constructor(
      private readonly templateValidationService: TemplateValidationService
    ) {}
  
    /**
   * STEP 3: EXTRACT SHEET DATA
   * ดึงข้อมูลจาก sheet ต่างๆ
   *
   * @param findData - ข้อมูลจาก file ที่ parse แล้ว
   * @param checkType - ประเภทของ nomination (Daily/Weekly)
   * @returns Object containing sheet1, sheet2, sheet3
   */
  private extractSheetData(findData: any[], checkType: string) {
    // Find the main nomination sheet (Daily or Weekly)
    const sheet1 = findData.find((f: any) => {
      return f?.sheet === checkType
    })

    // Find the Quality sheet
    const sheet2 = findData.find((f: any) => {
      return f?.sheet === 'Quality'
    })

    if (!sheet2) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'File template does not match the required format.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    // Find the Lists sheet
    const sheet3 = findData.find((f: any) => {
      return f?.sheet === 'Lists'
    })

    console.log('STEP 3: Sheet data extracted')

    return {
      sheet1,
      sheet2,
      sheet3
    }
  }
  /**
   * STEP 2: FILE TYPE VALIDATION - ตรวจสอบประเภทไฟล์ (Daily/Weekly)
   * @param file - ไฟล์ที่ส่งมาจาก gRPC
   * @param tabType - ประเภทที่คาดหวัง (1 = Daily, 2 = Weekly)
   * @returns FileTypeValidationResult - ผลลัพธ์การตรวจสอบ
   */
  async executeFileTypeValidation(file: any, tabType: number, headNom:any, headNomSheet2:any): Promise<FileTypeValidationResult> {
    try {
      // Parse the multi-sheet JSON data from gRPC
      const findData = JSON.parse(file?.jsonDataMultiSheet)

      // Determine nomination type from sheet names
      const checkType = findData.reduce((acc: string | null, f: any) => {
        if (f?.sheet === 'Daily Nomination') return 'Daily Nomination'
        if (f?.sheet === 'Weekly Nomination') return 'Weekly Nomination'
        return acc
      }, null)

      // Map sheet type to nomination type ID
      const nomination_type_id = checkType === 'Daily Nomination' ? 1 : checkType === 'Weekly Nomination' ? 2 : null
     
      // Validate that file type matches the expected tabType
      if (nomination_type_id != tabType) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Nomination Type is not match' // V.106 Add New Template Manual เคส Type ไม่ตรง (เลือก weekly  ปรับ Error Message https://app.clickup.com/t/86euzxxc2

          },
          HttpStatus.BAD_REQUEST
        )
      }

      // ===== STEP 3: EXTRACT SHEET DATA =====
      // ดึงข้อมูลจาก sheet ต่างๆ
      this.logger.log('STEP 3')
      const {sheet1, sheet2, sheet3} = this.extractSheetData(findData, checkType)

      // check หัว 0-13 14++++
      const isEqual = headNom.every((val, index) => val === sheet1?.data[2][index])
  
      if (!!!isEqual) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'File template does not match the required format.'
          },
          HttpStatus.BAD_REQUEST
        )
      }
      const isEqualSheet2 = headNomSheet2.every((val, index) => val === sheet2?.data[0][index])
  
      if (!!!isEqualSheet2) {
        console.log('headNomSheet2 : ', headNomSheet2);
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'File template does not match the required format.'
          },
          HttpStatus.BAD_REQUEST
        )
      }

      this.logger.log('STEP 3: FILE TYPE VALIDATION completed successfully')
      const startDateEx = sheet1?.data[1][2]
      this.templateValidationService.validateWeeklyDailyNominationDate(nomination_type_id, startDateEx, sheet1)

      return {
        sheet1, sheet2, sheet3,
        findData,
        checkType,
        nomination_type_id,
        startDateEx,
      }
    } catch (error) {
      this.logger.error('Error in STEP 3: FILE TYPE VALIDATION:', error)
      throw error
    }
  }
}
