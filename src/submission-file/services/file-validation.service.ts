import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus
} from '@nestjs/common'

@Injectable()
export class FileValidationService {
  /**
   * Validate file type - only allow Excel files
   * @param file - Uploaded file object
   * @throws BadRequestException if file type is invalid
   */
  validateFileType(
    file: Express.Multer.File
  ): void {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (
      file.mimetype !==
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      file.mimetype !==
        'application/vnd.ms-excel'
    ) {
      throw new BadRequestException(
        'Only Excel files (xlsx or xls) are allowed.'
      )
    }
  }

  /**
   * Validate file size - limit to 10MB
   * @param file - Uploaded file object
   * @throws BadRequestException if file size exceeds limit
   */
  validateFileSize(
    file: Express.Multer.File
  ): void {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    const MAX_FILE_SIZE =
      10 * 1024 * 1024 // 10MB

    if (
      file.buffer.length >
      MAX_FILE_SIZE
    ) {
      throw new BadRequestException(
        'File size over limit. Maximum allowed size is 10MB.'
      )
    }
  }

  /**
   * Validate file buffer is not empty
   * @param file - Uploaded file object
   * @throws Error if buffer is empty
   */
  validateFileBuffer(
    file: Express.Multer.File
  ): void {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (
      file.buffer.length === 0
    ) {
      throw new Error(
        'Buffer is empty before sending to gRPC'
      )
    }
  }

  /**
   * Validate file existence
   * @param file - Uploaded file object
   * @throws HttpException if file doesn't exist
   */
  validateFileExistence(
    file: Express.Multer.File
  ): void {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    if (!file) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Missing required fields'
        },
        HttpStatus.BAD_REQUEST
      )
    }
  }

  /**
   * Validate file structure and determine nomination type
   * @param jsonDataMultiSheet - Parsed multi-sheet JSON data
   * @param expectedTabType - Expected tab type from request
   * @returns nomination type ID (1 for Daily, 2 for Weekly)
   * @throws HttpException if file template doesn't match
   */
  validateFileStructure(
    jsonDataMultiSheet: string,
    expectedTabType: string
  ): number {
    const findData =
      JSON.parse(
        jsonDataMultiSheet
      )

    // Determine nomination type from sheet names
    const checkType =
      findData.reduce(
        (
          acc: string | null,
          f: any
        ) => {
          if (
            f?.sheet ===
            'Daily Nomination'
          )
            return 'Daily Nomination'
          if (
            f?.sheet ===
            'Weekly Nomination'
          )
            return 'Weekly Nomination'
          return acc
        },
        null
      )

    // Map sheet type to nomination type ID
    const nomination_type_id =
      checkType ===
      'Daily Nomination'
        ? 1
        : checkType ===
            'Weekly Nomination'
          ? 2
          : null

    // Validate that file type matches the expected tabType
    if (
      nomination_type_id !=
      Number(expectedTabType)
    ) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'File template does not match the required format.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    return nomination_type_id
  }

  /**
   * Complete file validation - runs all file validations
   * @param file - Uploaded file object
   * @param jsonDataMultiSheet - Parsed multi-sheet JSON data
   * @param expectedTabType - Expected tab type from request
   * @returns nomination type ID
   */
  validateFile(
    file: Express.Multer.File,
    jsonDataMultiSheet: string,
    expectedTabType: string
  ): number {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    this.validateFileExistence(
      file
    )
    this.validateFileType(
      file
    )
    this.validateFileBuffer(
      file
    )
    this.validateFileSize(
      file
    )

    return this.validateFileStructure(
      jsonDataMultiSheet,
      expectedTabType
    )
  }
}
