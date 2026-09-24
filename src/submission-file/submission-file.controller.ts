import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  Put,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  Query
} from '@nestjs/common'
import {JwtService} from '@nestjs/jwt'
import {FileUploadService} from 'src/grpc/file-service.service'
import {AuthGuard} from 'src/auth/auth.guard'
import {FileInterceptor} from '@nestjs/platform-express'
import {Response} from 'express'
import {SubmissionFileRefactoredService} from './submission-file-refactored.service'
import {PrismaService} from 'prisma/prisma.service'
import {
  middleNotiInapp,
  middleNotiInappShipper
} from 'src/common/utils/inapp.util'

import * as XLSX from 'xlsx-js-style'


// function validateExcelHasNoFormula(fileBuffer: Buffer): void {
//   let workbook: XLSX.WorkBook;

//   try {
//     workbook = XLSX.read(fileBuffer, {
//       type: 'buffer',

//       // สำคัญ: ให้เก็บข้อมูลสูตรไว้ใน cell.f
//       cellFormula: true,
//       cellText: false,
//       cellDates: true,
//     });
//   } catch (error) {
//     throw new BadRequestException('Invalid or corrupted Excel file.');
//   }

//   const formulaCells: Array<{
//     sheet: string;
//     cell: string;
//     formula: string;
//   }> = [];

//   for (const sheetName of workbook.SheetNames) {
//     const worksheet = workbook.Sheets[sheetName];

//     if (!worksheet) continue;

//     for (const cellAddress of Object.keys(worksheet)) {
//       // ข้าม metadata เช่น !ref, !merges, !cols
//       if (cellAddress.startsWith('!')) continue;

//       const cell = worksheet[cellAddress];

//       // cell.f คือสูตร เช่น SUM(A1:A10)
//       if (typeof cell?.f === 'string' && cell.f.trim() !== '') {
//         formulaCells.push({
//           sheet: sheetName,
//           cell: cellAddress,
//           formula: cell.f,
//         });
//       }
//     }
//   }

//   if (formulaCells.length > 0) {
//     const preview = formulaCells
//       .slice(0, 5)
//       .map(
//         (item) =>
//           `${item.sheet}!${item.cell} = ${item.formula}`,
//       )
//       .join(', ');
   
//     throw new HttpException(
//       {
//         status: HttpStatus.BAD_REQUEST,
//         error: `Excel file contains formulas. Please replace formulas with values before uploading. Found ${formulaCells.length} formula cell(s): ${preview}`
//       },
//       HttpStatus.BAD_REQUEST
//     )
//   }
// }

function validateExcelHasNoFormula(fileBuffer: Buffer): void {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellFormula: true,
      cellText: false,
      cellDates: true,
    });
  } catch (error) {
    throw new BadRequestException('Invalid or corrupted Excel file.');
  }

  const formulaCells: Array<{
    sheet: string;
    cell: string;
    formula: string;
  }> = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) continue;

    for (const cellAddress of Object.keys(worksheet)) {
      if (cellAddress.startsWith('!')) continue;

      const cell = worksheet[cellAddress];

      if (typeof cell?.f === 'string' && cell.f.trim() !== '') {
        // const normalizedFormula = cell.f
        //   .trim()
        //   .replace(/^=/, '')
        //   .trim()
        //   .toUpperCase();

        // // อนุญาตเฉพาะสูตร SUM(...)
        // if (normalizedFormula.startsWith('SUM(')) {
        //   continue;
        // }

        formulaCells.push({
          sheet: sheetName,
          cell: cellAddress,
          formula: cell.f,
        });
      }
    }
  }

  if (formulaCells.length > 0) {
    const preview = formulaCells
      .slice(0, 5)
      .map((item) => `${item.sheet}!${item.cell} = ${item.formula}`)
      .join(', ');

    throw new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error:
          `Excel file contains unsupported formulas. ` +
          `Please replace formulas with values before uploading. ` +
          `Found ${formulaCells.length} formula cell(s): ${preview}`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

@Controller('submission-file')
export class SubmissionFileController {
  constructor(
    private jwtService: JwtService,
    private readonly fileUploadService: FileUploadService,
    private readonly submissionFileRefactoredService: SubmissionFileRefactoredService,
    private prisma: PrismaService
  ) {}

  /**
   * Upload nomination file endpoint
   * Expected file format: ['SHIPPER ID', 'CONTRACT CODE', 'START DATE']
   *
   * @param file - Excel file (xlsx or xls)
   * @param req - Request object containing user information
   * @param comment - Optional comment for the submission
   * @param tabType - Type of nomination (1 = Daily, 2 = Weekly)
   * @returns Upload result with validation status
   */
  @UseGuards(AuthGuard) // Require authentication
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file')
  ) // Handle file upload
  async uploadFile(
    @UploadedFile()
    file: Express.Multer.File,
    @Req() req: any,
    @Body('comment')
    comment: string,
    @Body('tabType')
    tabType: string
  ) {
    file = {
      ...file,
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8')
    }
    
    // Validate file type - only allow Excel files
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

    // Check if file buffer is not empty
    if (
      file.buffer.length === 0
    ) {
      throw new Error(
        'Buffer is empty before sending to gRPC'
      )
    }

    // Validate file size - limit to 10MB (10 * 1024 * 1024 bytes)
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

    validateExcelHasNoFormula(file.buffer)

    // Send file buffer to gRPC service for processing
    const grpcTransform: any =
      await this.fileUploadService.uploadFileTempMultiSheet(
        file.buffer
      )
    // console.log('file : ', file);
    // return JSON.parse(grpcTransform?.jsonDataMultiSheet)

    // Validate file existence
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

    const uploadFile =
      await this.submissionFileRefactoredService.uploadFile(
        grpcTransform, // Processed file data from gRPC
        file, // Original file object
        req?.user?.sub, // User ID from JWT token
        comment, // Optional comment
        tabType // Nomination type
      )

    // return uploadFile // test

    try {
      const contractCode =
        await this.prisma.contract_code.findFirst(
          {
            where: {
              id: Number(
                uploadFile
                  ?.dataInfo
                  ?.contract_code_id
              )
            }
          }
        )
      const shipper =
        await this.prisma.group.findFirst(
          {
            where: {
              id: Number(
                uploadFile
                  ?.dataInfo
                  ?.shipper_id
              )
            }
          }
        )
      const start_date_text =
        uploadFile?.startDateExConv
          .tz('Asia/Bangkok')
          .format(
            'DD/MM/YYYY'
          )
      const warning =
        uploadFile?.warningAll
          ?.length > 0
          ? 'with warning'
          : ''
      const nom_type =
        tabType === '1'
          ? 'Daily'
          : 'Weekly'
      const message = `${nom_type} Nomination was submitted for ${shipper?.name}:${contractCode?.contract_code} activate from ${start_date_text} ${warning}`
      await middleNotiInappShipper(
        this.prisma,
        'Nomination',
        message,
        // 61, // nomination menus_id
        63, // 63 Submission File
        1,
        Number(
          uploadFile?.dataInfo
            ?.shipper_id
        )
      )
    } catch (error) {}

    // tell frontend to refresh waitinglist
    try {
      middleNotiInapp(
        this.prisma,
        'waitinglist.nomination',
        `Nomination file has been updated. Please refresh the page to see the latest changes.`,
        63, // 63 Submission File
        2
      )
    } catch (error) {
      
    }

    return uploadFile
  }
}
