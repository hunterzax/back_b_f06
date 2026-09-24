import {Injectable} from '@nestjs/common'
import {Response} from 'express'
import * as ExcelJS from 'exceljs'

export interface CommodityChargeData {
  gasDay: string // Format: DD/MM/YYYY
  dailyAllocatedExitValue: number // MMBTU
}

export interface CommodityChargeParams {
  month: string
  year: string
  tariffId: string
  shipperName: string
  contractCode: string
}

@Injectable()
export class ExportFileTariffCommodityBService {
  /**
   * Export Daily Overview: Commodity Charge to Excel
   */
  async exportCommodityChargeReport(
    data: CommodityChargeData[],
    params: CommodityChargeParams,
    response: Response
  ): Promise<void> {
    try {
      const workbook =
        new ExcelJS.Workbook()
      const worksheet =
        workbook.addWorksheet(
          'Daily Overview - Commodity Charge'
        )

      // Set column widths
      worksheet.columns = [
        {width: 15}, // Gas Day
        {width: 35} // Daily Allocated Exit Value (MMBTU)
      ]

      // Header Section
      this.addHeaderSection(
        worksheet,
        params
      )

      // Table Header
      this.addTableHeader(
        worksheet
      )

      // Data Rows
      this.addDataRows(
        worksheet,
        data
      )

      // Total Row
      this.addTotalRow(
        worksheet,
        data
      )

      // Set response headers
      const fileName = `Daily_Overview_Commodity_Charge_${params.month}_${params.year}.xlsx`
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      )

      // Write to response
      await workbook.xlsx.write(
        response
      )
      response.end()
    } catch (error) {
      throw new Error(
        `Failed to export Daily Overview: Commodity Charge: ${error.message}`
      )
    }
  }

  private addHeaderSection(
    worksheet: ExcelJS.Worksheet,
    params: CommodityChargeParams
  ): void {
    // Title
    const titleCell =
      worksheet.getCell('A1')
    titleCell.value =
      'Daily Overview : Commodity Charge'
    titleCell.font = {
      bold: true,
      size: 16,
      color: {
        argb: 'FF0000FF'
      }
    } // Blue color
    titleCell.alignment = {
      horizontal: 'left'
    }

    // Header information row
    const headerRow =
      worksheet.getRow(3)

    // Month/Year
    const monthYearCell =
      headerRow.getCell(1)
    monthYearCell.value = `${params.month} ${params.year}`
    monthYearCell.font = {
      bold: true,
      size: 12
    }
    monthYearCell.alignment =
      {horizontal: 'left'}

    // Tariff ID
    const tariffIdCell =
      headerRow.getCell(2)
    tariffIdCell.value =
      params.tariffId
    tariffIdCell.font = {
      bold: true,
      size: 12
    }
    tariffIdCell.alignment = {
      horizontal: 'left'
    }

    // Shipper Name
    const shipperNameCell =
      headerRow.getCell(3)
    shipperNameCell.value =
      params.shipperName
    shipperNameCell.font = {
      bold: true,
      size: 12
    }
    shipperNameCell.alignment =
      {horizontal: 'left'}

    // Contract Code
    const contractCodeCell =
      headerRow.getCell(4)
    contractCodeCell.value =
      params.contractCode
    contractCodeCell.font = {
      bold: true,
      size: 12
    }
    contractCodeCell.alignment =
      {horizontal: 'left'}

    // Empty rows for spacing
    worksheet.getRow(
      4
    ).height = 10
    worksheet.getRow(
      5
    ).height = 10
  }

  private addTableHeader(
    worksheet: ExcelJS.Worksheet
  ): void {
    const headerRow =
      worksheet.getRow(6)

    // Gas Day header
    const gasDayHeaderCell =
      headerRow.getCell(1)
    gasDayHeaderCell.value =
      'Gas Day'
    gasDayHeaderCell.font = {
      bold: true,
      size: 11
    }
    gasDayHeaderCell.alignment =
      {
        horizontal: 'center',
        vertical: 'middle'
      }
    gasDayHeaderCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FFE0E0E0'
      }
    }
    gasDayHeaderCell.border =
      {
        top: {
          style:
            'thin' as const
        },
        left: {
          style:
            'thin' as const
        },
        bottom: {
          style:
            'thin' as const
        },
        right: {
          style:
            'thin' as const
        }
      }

    // Daily Allocated Exit Value header
    const allocatedValueHeaderCell =
      headerRow.getCell(2)
    allocatedValueHeaderCell.value =
      'Daily Allocated Exit Value (MMBTU)'
    allocatedValueHeaderCell.font =
      {bold: true, size: 11}
    allocatedValueHeaderCell.alignment =
      {
        horizontal: 'center',
        vertical: 'middle'
      }
    allocatedValueHeaderCell.fill =
      {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: 'FFE0E0E0'
        }
      }
    allocatedValueHeaderCell.border =
      {
        top: {
          style:
            'thin' as const
        },
        left: {
          style:
            'thin' as const
        },
        bottom: {
          style:
            'thin' as const
        },
        right: {
          style:
            'thin' as const
        }
      }

    headerRow.height = 25
  }

  // เติมทศนิยม 4 ตำแหน่ง new
  formatNumberFDecimal(
    number: any
  ) {
    // if (isNaN(number)) return number; // Handle invalid numbers gracefully

    // // Convert number to a fixed 3-decimal format
    // const fixedNumber = Number(number).toFixed(3);

    // // Add thousand separators
    // return fixedNumber.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // คืนค่าตามเดิมถ้าไม่ใช่ตัวเลข ไม่ปัดเศษ
    const n = Number(number)
    if (!Number.isFinite(n))
      return number

    const sign =
      n < 0 ? '-' : ''
    const abs = Math.abs(n)

    // ตัดทศนิยมให้เหลือ 3 ตำแหน่ง (ไม่ปัด)
    const truncated =
      Math.floor(
        abs * 10000
      ) / 10000

    // แยกส่วนจำนวนเต็ม/ทศนิยมแล้วจัดรูปแบบ
    const [i, d = ''] =
      truncated
        .toString()
        .split('.')
    const intWithComma =
      i?.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ','
      )
    const dec = d.padEnd(
      4,
      '0'
    ) // ให้ครบ 3 หลักเสมอ

    return `${sign}${intWithComma}.${dec}`
  }

  private addDataRows(
    worksheet: ExcelJS.Worksheet,
    data: CommodityChargeData[]
  ): void {
    data.forEach(
      (rowData, index) => {
        const row =
          worksheet.getRow(
            index + 7
          ) // Start from row 7 (after header)

        // Gas Day (Column A)
        const gasDayCell =
          row.getCell(1)
        gasDayCell.value =
          rowData.gasDay
        gasDayCell.alignment =
          {
            horizontal:
              'center'
          }
        gasDayCell.border =
          this.getBorderStyle()

        // Daily Allocated Exit Value (Column B)
        const allocatedValueCell =
          row.getCell(2)
        allocatedValueCell.value =
          rowData.dailyAllocatedExitValue
        allocatedValueCell.numFmt =
          '#,##0'
        allocatedValueCell.alignment =
          {
            horizontal:
              'right'
          }
        allocatedValueCell.border =
          this.getBorderStyle()

        row.height = 20
      }
    )
  }

  private addTotalRow(
    worksheet: ExcelJS.Worksheet,
    data: CommodityChargeData[]
  ): void {
    const totalRowIndex =
      data.length + 7 // After data rows
    const totalRow =
      worksheet.getRow(
        totalRowIndex
      )

    // Calculate total
    const totalValue =
      data.reduce(
        (sum, row) =>
          sum +
          row.dailyAllocatedExitValue,
        0
      )

    // Total label (Column A)
    const totalLabelCell =
      totalRow.getCell(1)
    totalLabelCell.value =
      'Total'
    totalLabelCell.font = {
      bold: true
    }
    totalLabelCell.alignment =
      {horizontal: 'center'}
    totalLabelCell.border =
      this.getBorderStyle()

    // Total value (Column B)
    const totalValueCell =
      totalRow.getCell(2)
    totalValueCell.value =
      totalValue
    totalValueCell.numFmt =
      '#,##0'
    totalValueCell.font = {
      bold: true
    }
    totalValueCell.alignment =
      {horizontal: 'right'}
    totalValueCell.border =
      this.getBorderStyle()

    // Highlight total row with light yellow background
    totalRow.eachCell(
      (cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: 'FFFFFFE0'
          } // Light yellow background
        }
      }
    )

    totalRow.height = 25
  }

  private getBorderStyle() {
    return {
      top: {
        style: 'thin' as const
      },
      left: {
        style: 'thin' as const
      },
      bottom: {
        style: 'thin' as const
      },
      right: {
        style: 'thin' as const
      }
    }
  }

  /**
   * Generate sample data for testing
   */
  generateSampleData(): CommodityChargeData[] {
    return [
      {
        gasDay: '01/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '02/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '03/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '04/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '05/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '06/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '07/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '08/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '09/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '10/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '11/07/2025',
        dailyAllocatedExitValue: 181343
      },
      {
        gasDay: '12/07/2025',
        dailyAllocatedExitValue: 181343
      }
    ]
  }
}
