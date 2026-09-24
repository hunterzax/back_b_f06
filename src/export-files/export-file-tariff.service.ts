import {Injectable} from '@nestjs/common'
import {Response} from 'express'
import * as ExcelJS from 'exceljs'
import * as dayjs from 'dayjs'

export interface ImbalanceCapacityReportData {
  date: string
  dayOfWeek: string
  gasEntry: number
  gasExit: number
  fuelGas?: number | null
  balancingGas?: number | null
  changeMinInventory?: number | null
  shrinkageGas?: number | null
  commissioning?: number | null
  gasVent?: number | null
  otherGas?: number | null
  imbalance: number
  imbalancePercentage: number
  imbalanceQuantityOver5Percent?: number | null
}

// Interface for real data format
export interface RealImbalanceData {
  gas_day: string
  entry: number
  exit: number
  fuel_gas: number | null
  balancing_gas: number | null
  change_in_ivent: number | null
  shrinkage: number | null
  commissioning: number | null
  gas_vent: number | null
  other_gas: number | null
  imbalance: number
  imbalance_over_5_percen: number | null
}

export interface ImbalanceCapacityReportParams {
  companyName: string
  shipperName: string
  month: string
  year: string
  reportedBy: {
    name: string
    position: string
    division: string
  }
  manager: {
    name: string
    position: string
    division: string
  }
}

@Injectable()
export class ExportFileTariffService {
  /**
   * Convert real data format to Excel format
   */
  convertRealDataToExcelFormat(realData: any[], params: any): any {
    // Sort data by gas_day (ascending - earliest date first)

    const gDay = `${params.year}-${realData?.[0]?.gas_day && dayjs(realData?.[0]?.gas_day)?.format('MM')}-01`
    const start = dayjs(gDay).startOf('month')
    const end = dayjs(gDay).endOf('month')

    // สร้าง array ของวันทั้งหมดในเดือน
    const daysInMonth = []
    let current = start

    while (current.isBefore(end) || current.isSame(end, 'day')) {
      daysInMonth.push(current.format('YYYY-MM-DD'))
      current = current.add(1, 'day')
    }

    const sortedDaysInMonth = daysInMonth.sort((a: any, b: any) => {
      const dateA = new Date(a)
      const dateB = new Date(b)
      return dateA.getTime() - dateB.getTime()
    })

    const sortedData = realData.sort((a, b) => {
      const dateA = new Date(a.gas_day)
      const dateB = new Date(b.gas_day)
      return dateA.getTime() - dateB.getTime()
    })

    return sortedDaysInMonth.map((itemT) => {
      const item = sortedData?.find((f: any) => f?.gas_day === itemT)

      const gasDay = item ? new Date(item.gas_day) : new Date(itemT)
      const dayOfWeek = gasDay.toLocaleDateString('en-US', {weekday: 'short'})
      const date = gasDay.getDate().toString()

      // Calculate imbalance percentage
      const imbalancePercentage: any = item ? (item.imbalance / item.entry) * 100 : ''

      return {
        date,
        dayOfWeek,
        gasEntry: item ? item.entry : null,
        gasExit: item ? item.exit : null,
        fuelGas: item ? item.fuel_gas : null,
        balancingGas: item ? item.balancing_gas : null,
        changeMinInventory: item ? item.change_in_ivent : null,
        shrinkageGas: item ? item.shrinkage : null,
        commissioning: item ? item.commissioning : null,
        gasVent: item ? item.gas_vent : null,
        otherGas: item ? item.other_gas : null,
        imbalance: item ? item.imbalance : null,
        imbalancePercentage: item ? parseFloat(imbalancePercentage.toFixed(2)) : null,
        imbalanceQuantityOver5Percent: item ? item.imbalance_over_5_percen : null
      }
    })
  }

  /**
   * Export Imbalance Capacity Report to Excel
   */
  async exportImbalanceCapacityReport(data: ImbalanceCapacityReportData[], params: ImbalanceCapacityReportParams, response: Response): Promise<void> {
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Imbalance Capacity Report')

      // Set column widths
      worksheet.columns = [
        {width: 8}, // DayOfWeek
        {width: 8}, // Date (วันที่)
        {width: 18}, // Gas Entry
        {width: 18}, // Gas Exit
        {width: 15}, // Fuel Gas
        {width: 18}, // Balancing Gas
        {width: 20}, // Change Min Inventory
        {width: 18}, // Shrinkage Gas
        {width: 15}, // Commissioning
        {width: 12}, // Gas Vent
        {width: 12}, // Other Gas
        {width: 18}, // Imbalance
        {width: 15}, // Imbalance %
        {width: 25} // Imbalance Quantity over ±5%
      ]

      // Header Section
      this.addHeaderSection(worksheet, params)

      // Table Header
      this.addTableHeader(worksheet)

      // Data Rows
      this.addDataRows(worksheet, data)

      // Total Row
      this.addTotalRow(worksheet, data)

      // Footer Section
      this.addFooterSection(worksheet, params, data)

      // Set response headers
      response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      response.setHeader('Content-Disposition', `attachment; filename="Imbalance_Capacity_Report_${params.shipperName}_${params.month}_${params.year}.xlsx"`)

      // Write to response
      await workbook.xlsx.write(response)
      response.end()
    } catch (error) {
      throw new Error(`Failed to export Imbalance Capacity Report: ${error.message}`)
    }
  }

  private addHeaderSection(worksheet: ExcelJS.Worksheet, params: ImbalanceCapacityReportParams): void {
    // Company Name
    worksheet.mergeCells('A1:M1')
    const companyCell = worksheet.getCell('A1')
    companyCell.value = params.companyName
    companyCell.font = {
      size: 14,
      bold: true
    }
    companyCell.alignment = {
      horizontal: 'left'
    }

    // Report Title
    worksheet.mergeCells('A2:M2')
    const titleCell = worksheet.getCell('A2')
    titleCell.value = `Imbalance Capacity Report (From Billing Data): ${params.shipperName}`
    titleCell.font = {
      size: 12,
      bold: true
    }
    titleCell.alignment = {
      horizontal: 'left'
    }

    // Period
    worksheet.mergeCells('A3:M3')
    const periodCell = worksheet.getCell('A3')
    periodCell.value = `Month ${params.month} Year ${params.year}`
    periodCell.font = {
      size: 12,
      bold: true
    }
    periodCell.alignment = {
      horizontal: 'left'
    }

    // Empty row
    worksheet.getRow(4).height = 20
  }

  private addTableHeader(worksheet: ExcelJS.Worksheet): void {
    // First header row (row 5)
    const headerRow1 = worksheet.getRow(5)

    // Merge Date column (A5:B5)
    worksheet.mergeCells('A5:B5')
    const dateCell = worksheet.getCell('A5')
    dateCell.value = 'Date'
    dateCell.font = {
      bold: true,
      size: 10
    }
    dateCell.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    }
    dateCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FFE0E0E0'
      }
    }
    dateCell.border = {
      top: {style: 'thin'},
      left: {style: 'thin'},
      bottom: {style: 'thin'},
      right: {style: 'thin'}
    }

    // Add remaining headers starting from column C
    const headers = [
      'Gas Entry (MMBTU)',
      'Gas Exit (MMBTU)',
      'Fuel Gas (MMBTU)',
      'Balancing Gas (MMBTU)',
      'Change Min Inventory (MMBTU)',
      'Shrinkage Gas (MMBTU)',
      'Commissioning (MMBTU)',
      'Gas Vent (MMBTU)',
      'Other Gas (MMBTU)',
      'Imbalance (MMBTU)',
      'Imbalance (%)',
      'Imbalance Quantity over ±5% (MMBTU)'
    ]

    headers.forEach((header, index) => {
      const cell = headerRow1.getCell(index + 3) // Start from column C
      cell.value = header
      cell.font = {
        bold: true,
        size: 10
      }
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle'
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: 'FFE0E0E0'
        }
      }
      cell.border = {
        top: {
          style: 'thin'
        },
        left: {
          style: 'thin'
        },
        bottom: {
          style: 'thin'
        },
        right: {
          style: 'thin'
        }
      }
    })

    // Second header row (row 6) - Sub-headers for Date column
    // const headerRow2 = worksheet.getRow(6);
    // // DayOfWeek sub-header (Column A)
    // const dayOfWeekCell = headerRow2.getCell(1);
    // dayOfWeekCell.value = 'DayOfWeek';
    // dayOfWeekCell.font = { bold: true, size: 9 };
    // dayOfWeekCell.alignment = { horizontal: 'center', vertical: 'middle' };
    // dayOfWeekCell.fill = {
    //   type: 'pattern',
    //   pattern: 'solid',
    //   fgColor: { argb: 'FFE0E0E0' },
    // };
    // dayOfWeekCell.border = {
    //   top: { style: 'thin' },
    //   left: { style: 'thin' },
    //   bottom: { style: 'thin' },
    //   right: { style: 'thin' },
    // };

    // // Date sub-header (Column B)
    // const dateSubCell = headerRow2.getCell(2);
    // dateSubCell.value = 'Date (วันที่)';
    // dateSubCell.font = { bold: true, size: 9 };
    // dateSubCell.alignment = { horizontal: 'center', vertical: 'middle' };
    // dateSubCell.fill = {
    //   type: 'pattern',
    //   pattern: 'solid',
    //   fgColor: { argb: 'FFE0E0E0' },
    // };
    // dateSubCell.border = {
    //   top: { style: 'thin' },
    //   left: { style: 'thin' },
    //   bottom: { style: 'thin' },
    //   right: { style: 'thin' },
    // };

    // // Merge remaining columns in row 6 to match row 5
    // headers.forEach((header, index) => {
    //   const cell = headerRow2.getCell(index + 3); // Start from column C
    //   cell.value = header;
    //   cell.font = { bold: true, size: 10 };
    //   cell.alignment = { horizontal: 'center', vertical: 'middle' };
    //   cell.fill = {
    //     type: 'pattern',
    //     pattern: 'solid',
    //     fgColor: { argb: 'FFE0E0E0' },
    //   };
    //   cell.border = {
    //     top: { style: 'thin' },
    //     left: { style: 'thin' },
    //     bottom: { style: 'thin' },
    //     right: { style: 'thin' },
    //   };
    // });

    headerRow1.height = 25
    // headerRow2.height = 20;
  }

  private addDataRows(worksheet: ExcelJS.Worksheet, data: ImbalanceCapacityReportData[]): void {
    data.forEach((rowData, index) => {
      const row = worksheet.getRow(index + 6) // Start from row 7 (after 2 header rows)

      // DayOfWeek (Column A)
      const dayOfWeekCell = row.getCell(1)
      dayOfWeekCell.value = rowData.dayOfWeek
      dayOfWeekCell.alignment = {
        horizontal: 'center'
      }
      dayOfWeekCell.border = this.getBorderStyle()

      // Date (Column B)
      const dateCell = row.getCell(2)
      dateCell.value = rowData.date
      dateCell.alignment = {
        horizontal: 'center'
      }
      dateCell.border = this.getBorderStyle()

      // Gas Entry (Column C)
      const gasEntryCell = row.getCell(3)
      gasEntryCell.value = (rowData.gasEntry && rowData.gasEntry) || '-'
      if (rowData.gasEntry) {
        gasEntryCell.numFmt = '#,##0.0000'
      }
      gasEntryCell.alignment = {
        horizontal: 'right'
      }
      gasEntryCell.border = this.getBorderStyle()

      // Gas Exit (Column D)
      const gasExitCell = row.getCell(4)
      gasExitCell.value = (rowData.gasExit && rowData.gasExit) || '-'
      if (rowData.gasExit) {
        gasExitCell.numFmt = '#,##0.0000'
      }
      gasExitCell.alignment = {
        horizontal: 'right'
      }
      gasExitCell.border = this.getBorderStyle()

      // Fuel Gas (Column E)
      const fuelGasCell = row.getCell(5)
      console.log('rowData.fuelGas : ', rowData.fuelGas);
      fuelGasCell.value = rowData.fuelGas !== null ? rowData.fuelGas : '-'
      if (rowData.fuelGas !== null) {
        fuelGasCell.numFmt = '#,##0.0000'
        fuelGasCell.alignment = {
          horizontal: 'right'
        }
      } else {
        fuelGasCell.alignment = {
          horizontal: 'center'
        }
      }
      fuelGasCell.border = this.getBorderStyle()

      // Balancing Gas (Column F)
      const balancingGasCell = row.getCell(6)
      balancingGasCell.value = rowData.balancingGas !== null ? rowData.balancingGas : '-'
      if (rowData.balancingGas !== null) {
        balancingGasCell.numFmt = '#,##0.0000'
      } else {
        // balancingGasCell.alignment = { horizontal: 'center' };
      }
      balancingGasCell.alignment = {
        horizontal: 'right'
      }
      balancingGasCell.border = this.getBorderStyle()

      // Change Min Inventory (Column G)
      const changeMinInventoryCell = row.getCell(7)
      if (rowData.changeMinInventory !== null) {
        changeMinInventoryCell.value = rowData.changeMinInventory
        changeMinInventoryCell.numFmt = '(#,##0.0000)'
      } else {
        changeMinInventoryCell.value = '-'
        // changeMinInventoryCell.alignment = { horizontal: 'center' };
      }
      changeMinInventoryCell.alignment = {
        horizontal: 'right'
      }
      changeMinInventoryCell.border = this.getBorderStyle()

      // Shrinkage Gas (Column H)
      const shrinkageGasCell = row.getCell(8)
      shrinkageGasCell.value = rowData.shrinkageGas !== null ? rowData.shrinkageGas : '-'
      if (rowData.shrinkageGas !== null) {
        shrinkageGasCell.numFmt = '#,##0.0000'
      } else {
        // shrinkageGasCell.alignment = { horizontal: 'center' };
      }
      shrinkageGasCell.alignment = {
        horizontal: 'right'
      }
      shrinkageGasCell.border = this.getBorderStyle()

      // Commissioning (Column I)
      const commissioningCell = row.getCell(9)
      commissioningCell.value = rowData.commissioning !== null ? rowData.commissioning : '-'
      if (rowData.commissioning !== null) {
        commissioningCell.numFmt = '#,##0.0000'
      } else {
        // commissioningCell.alignment = { horizontal: 'center' };
      }
      commissioningCell.alignment = {
        horizontal: 'right'
      }
      commissioningCell.border = this.getBorderStyle()

      // Gas Vent (Column J)
      const gasVentCell = row.getCell(10)
      gasVentCell.value = rowData.gasVent !== null ? rowData.gasVent : '-'
      if (rowData.gasVent !== null) {
        gasVentCell.numFmt = '#,##0.0000'
      } else {
        // gasVentCell.alignment = { horizontal: 'center' };
      }
      gasVentCell.alignment = {
        horizontal: 'right'
      }
      gasVentCell.border = this.getBorderStyle()

      // Other Gas (Column K)
      const otherGasCell = row.getCell(11)
      otherGasCell.value = rowData.otherGas !== null ? rowData.otherGas : '-'
      if (rowData.otherGas !== null) {
        otherGasCell.numFmt = '#,##0.0000'
      } else {
        // otherGasCell.alignment = { horizontal: 'center' };
      }
      otherGasCell.alignment = {
        horizontal: 'right'
      }
      otherGasCell.border = this.getBorderStyle()

      // Imbalance (Column L)
      const imbalanceCell = row.getCell(12)
      imbalanceCell.value = rowData.imbalance !== null ? rowData.imbalance : '-'
      if (rowData.imbalance !== null) {
        if (rowData.imbalance < 0) {
          imbalanceCell.numFmt = '(#,##0.0000)'
        } else {
          imbalanceCell.numFmt = '#,##0.0000'
        }
      }
      imbalanceCell.alignment = {
        horizontal: 'right'
      }
      imbalanceCell.border = this.getBorderStyle()

      // Imbalance % (Column M)
      const imbalancePercentCell = row.getCell(13)
      imbalancePercentCell.value = rowData.imbalancePercentage / 100 // Convert to decimal for Excel percentage format
      imbalancePercentCell.numFmt = '0.00%' // Excel percentage format
      imbalancePercentCell.alignment = {
        horizontal: 'right'
      }
      imbalancePercentCell.border = this.getBorderStyle()

      // Note: Highlighting is now handled in Column N section based on imbalanceQuantityOver5Percent > 0

      // Imbalance Quantity over ±5% (Column N)
      const imbalanceQuantityCell = row.getCell(14)
      if (rowData.imbalanceQuantityOver5Percent !== null) {
        imbalanceQuantityCell.value = rowData.imbalanceQuantityOver5Percent
        imbalanceQuantityCell.numFmt = '#,##0.0000'
        imbalanceQuantityCell.alignment = {
          horizontal: 'right'
        }

        // Highlight red if value > 0 (new condition)
        if (rowData.imbalanceQuantityOver5Percent > 0) {
          imbalanceQuantityCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
              argb: 'FFFFCCCC'
            } // Light red background
          }
          imbalanceQuantityCell.font = {
            color: {
              argb: 'FFCC0000'
            }
          } // Dark red text

          // Also highlight Column M (Imbalance %) in the same row
          const imbalancePercentCell = row.getCell(13)
          imbalancePercentCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
              argb: 'FFFFCCCC'
            } // Light red background
          }
          imbalancePercentCell.font = {
            color: {
              argb: 'FFCC0000'
            }
          } // Dark red text
        }
      } else {
        imbalanceQuantityCell.value = 0
        imbalanceQuantityCell.numFmt = '#,##0.0000'
      }
      imbalanceQuantityCell.border = this.getBorderStyle()

      row.height = 20
    })
  }

  private addTotalRow(worksheet: ExcelJS.Worksheet, data: ImbalanceCapacityReportData[]): void {
    const totalRowIndex = data.length + 6 // Adjusted for 2 header rows
    const totalRow = worksheet.getRow(totalRowIndex)

    // Calculate totals
    const totalGasEntry = data.reduce((sum, row) => sum + row.gasEntry, 0)
    const totalGasExit = data.reduce((sum, row) => sum + row.gasExit, 0)
    const totalFuelGas = data.reduce((sum, row) => sum + row.fuelGas, 0) // new
    console.log('totalFuelGas : ', totalFuelGas);
    const totalChangeMinInventory = data.reduce((sum, row) => sum + (row.changeMinInventory || 0), 0)
    const totalImbalance = data.reduce((sum, row) => sum + row.imbalance, 0)
    const totalImbalanceQuantityOver5Percent = data.reduce((sum, row) => sum + (row.imbalanceQuantityOver5Percent || 0), 0)
    const totalImbalancePercentage = data.reduce((sum, row) => sum + row.imbalancePercentage, 0) // new

    // Total label (Column A)
    worksheet.mergeCells(`A${totalRowIndex}:B${totalRowIndex}`)
    const totalLabelCell = totalRow.getCell(1)
    totalLabelCell.value = 'Total (MMBTU)'
    totalLabelCell.font = {
      bold: true
    }
    totalLabelCell.alignment = {horizontal: 'left'}
    totalLabelCell.border = this.getBorderStyle()

    // // Empty cell for column B (Date)
    // const emptyCellBTotal = totalRow.getCell(2);
    // emptyCellBTotal.value = '';
    // emptyCellBTotal.border = this.getBorderStyle();

    // Total Gas Entry (Column C)
    const totalGasEntryCell = totalRow.getCell(3)
    totalGasEntryCell.value = totalGasEntry
    totalGasEntryCell.numFmt = '#,##0.0000'
    totalGasEntryCell.font = {
      bold: true
    }
    totalGasEntryCell.alignment = {horizontal: 'right'}
    totalGasEntryCell.border = this.getBorderStyle()

    // Total Gas Exit (Column D)
    const totalGasExitCell = totalRow.getCell(4)
    totalGasExitCell.value = totalGasExit
    totalGasExitCell.numFmt = '#,##0.0000'
    totalGasExitCell.font = {
      bold: true
    }
    totalGasExitCell.alignment = {horizontal: 'right'}
    totalGasExitCell.border = this.getBorderStyle()
    console.log('totalFuelGas : ', totalFuelGas);
    // Total Gas Exit (Column E) New
    const totalFuelGasCell = totalRow.getCell(5)
    totalFuelGasCell.value = totalFuelGas
    totalFuelGasCell.numFmt = '#,##0.0000'
    totalFuelGasCell.font = {
      bold: true
    }
    totalFuelGasCell.alignment = {horizontal: 'right'}
    totalFuelGasCell.border = this.getBorderStyle()
    console.log('totalImbalancePercentage : ', totalImbalancePercentage);
    // Total Gas Exit (Column M) New
    // const totalImbalancePercentageCell = totalRow.getCell(5)
    // totalImbalancePercentageCell.value = totalImbalancePercentage
    // totalImbalancePercentageCell.numFmt = '#,##0.0000'
    // totalImbalancePercentageCell.font = {bold: true}
    // totalImbalancePercentageCell.alignment = {horizontal: 'right'}
    // totalImbalancePercentageCell.border = this.getBorderStyle()

    // // Empty cells for columns E-F
    // for (let i = 5; i <= 6; i++) {
    // Empty cells for columns F
    for (let i = 6; i <= 6; i++) {
      const cell = totalRow.getCell(i)
      cell.value = '-'
      cell.alignment = {
        horizontal: 'right'
      }
      cell.border = this.getBorderStyle()
    }

    //   const gasVentCell = row.getCell(10);
    //   gasVentCell.value = rowData.gasVent !== null ? rowData.gasVent : '-';
    //   if (rowData.gasVent !== null) {
    //     gasVentCell.numFmt = '#,##0.0000';
    //     gasVentCell.alignment = { horizontal: 'right' };
    //   } else {
    //     gasVentCell.alignment = { horizontal: 'center' };
    //   }
    //   gasVentCell.border = this.getBorderStyle();

    // Total Change Min Inventory (Column G)
    const totalChangeMinInventoryCell = totalRow.getCell(7)
    if (totalChangeMinInventory !== 0) {
      totalChangeMinInventoryCell.value = totalChangeMinInventory
      totalChangeMinInventoryCell.numFmt = '(#,##0.0000)'
      totalChangeMinInventoryCell.font = {bold: true}
    } else {
      totalChangeMinInventoryCell.value = '-'
      // totalChangeMinInventoryCell.alignment = { horizontal: 'center' };
    }
    totalChangeMinInventoryCell.alignment = {horizontal: 'right'}
    totalChangeMinInventoryCell.border = this.getBorderStyle()

    // Empty cells for columns H-K
    for (let i = 8; i <= 11; i++) {
      const cell = totalRow.getCell(i)
      cell.value = '-'
      cell.alignment = {
        horizontal: 'right'
      }
      cell.border = this.getBorderStyle()
    }

    // Total Imbalance (Column L)
    const totalImbalanceCell = totalRow.getCell(12)
    totalImbalanceCell.value = totalImbalance
    if (totalImbalance < 0) {
      totalImbalanceCell.numFmt = '(#,##0.0000)'
    } else {
      totalImbalanceCell.numFmt = '#,##0.0000'
    }
    totalImbalanceCell.font = {bold: true}
    totalImbalanceCell.alignment = {horizontal: 'right'}
    totalImbalanceCell.border = this.getBorderStyle()

    // Total Imbalance (Column M) New
    const emptyCellM = totalRow.getCell(13)
    // if (totalImbalancePercentage) {
    //   emptyCellM.value = totalImbalancePercentage / 100;
    //   emptyCellM.numFmt = '0.00%'; // Excel percentage format
    //   emptyCellM.font = { bold: true };
    //   emptyCellM.alignment = { horizontal: 'right' };
    // } else {
    emptyCellM.value = '-'
    emptyCellM.alignment = {
      horizontal: 'right'
    }
    // }
    emptyCellM.border = this.getBorderStyle()

    // const emptyCellM = totalRow.getCell(13);
    // emptyCellM.value = '-';
    // emptyCellM.alignment = { horizontal: 'center' };
    // emptyCellM.border = this.getBorderStyle();

    // Total Imbalance Quantity over ±5% (Column N)
    const totalImbalanceQuantityCell = totalRow.getCell(14)
    // if (totalImbalanceQuantityOver5Percent !== 0) {
    totalImbalanceQuantityCell.value = totalImbalanceQuantityOver5Percent
    totalImbalanceQuantityCell.numFmt = '#,##0.0000'
    // totalImbalanceQuantityCell.font = { bold: true };
    totalImbalanceQuantityCell.alignment = {horizontal: 'right'}
    // } else {
    //   totalImbalanceQuantityCell.value = '-';
    //   totalImbalanceQuantityCell.alignment = { horizontal: 'center' };
    // }
    totalImbalanceQuantityCell.border = this.getBorderStyle()

    totalRow.height = 25

    // // Add "Total MMBTU" row
    // const totalMMBTURowIndex = totalRowIndex + 1;
    // const totalMMBTURow = worksheet.getRow(totalMMBTURowIndex);

    // // Total MMBTU label
    // const totalMMBTULabelCell = totalMMBTURow.getCell(1);
    // totalMMBTULabelCell.value = 'Total MMBTU';
    // totalMMBTULabelCell.font = { bold: true };
    // totalMMBTULabelCell.alignment = { horizontal: 'left' };
    // totalMMBTULabelCell.border = this.getBorderStyle();

    // // Empty cell for column B (Date)
    // const emptyCellBMMBTU = totalMMBTURow.getCell(2);
    // emptyCellBMMBTU.value = '';
    // emptyCellBMMBTU.border = this.getBorderStyle();

    // // Total MMBTU value (sum of Gas Entry + Gas Exit) - Column C
    // const totalMMBTUValue = totalGasEntry + totalGasExit;
    // const totalMMBTUValueCell = totalMMBTURow.getCell(3);
    // totalMMBTUValueCell.value = totalMMBTUValue;
    // totalMMBTUValueCell.numFmt = '#,##0.0000';
    // totalMMBTUValueCell.font = { bold: true };
    // totalMMBTUValueCell.alignment = { horizontal: 'right' };
    // totalMMBTUValueCell.border = this.getBorderStyle();

    // // Empty cells for remaining columns
    // for (let i = 4; i <= 14; i++) {
    //   const cell = totalMMBTURow.getCell(i);
    //   cell.value = '';
    //   cell.border = this.getBorderStyle();
    // }

    // totalMMBTURow.height = 25;

    // Add "ประมาณความไม่สมดุลเกินเกณฑ์ ±5%" row
    const thresholdRowIndex = totalRowIndex + 1
    const thresholdRow = worksheet.getRow(thresholdRowIndex)

    // Threshold label
    const thresholdLabelCell = thresholdRow.getCell(11)
    thresholdLabelCell.value = 'ประมาณความไม่สมดุลเกินเกณฑ์ ±5%'
    // thresholdLabelCell.font = { bold: true };
    thresholdLabelCell.alignment = {horizontal: 'left'}
    // thresholdLabelCell.border = this.getBorderStyle();

    // Empty cell for column B (Date)
    const emptyCellBThreshold = thresholdRow.getCell(2)
    emptyCellBThreshold.value = ''
    // emptyCellBThreshold.border = this.getBorderStyle();

    // Threshold value (rounded total from Imbalance Quantity over ±5% column) - Column C
    const thresholdValue = Math.round(totalImbalanceQuantityOver5Percent)
    const thresholdValueCell = thresholdRow.getCell(13)
    thresholdValueCell.value = thresholdValue
    thresholdValueCell.numFmt = '#,##0'
    thresholdValueCell.font = {bold: true}
    thresholdValueCell.alignment = {horizontal: 'right'}
    // thresholdValueCell.border = this.getBorderStyle();

    // Empty cell for column N (Imbalance Quantity over ±5% (MMBTU))
    const emptyCellNThreshold = thresholdRow.getCell(14)
    emptyCellNThreshold.value = 'MMBTU'

    // Empty cells for remaining columns
    // for (let i = 4; i <= 14; i++) {
    //   const cell = thresholdRow.getCell(i);
    //   cell.value = '';
    // cell.border = this.getBorderStyle();
    // }

    thresholdRow.height = 25
  }

  private addFooterSection(worksheet: ExcelJS.Worksheet, params: ImbalanceCapacityReportParams, data: ImbalanceCapacityReportData[]): void {
    const startRow = data.length + 10 // Adjusted for new rows (Total MMBTU + threshold row)

    // Value legend with red text
    const valueRow = worksheet.getRow(startRow)
    const valueCell = valueRow.getCell(1)
    valueCell.value = 'Value'
    valueCell.font = {
      size: 10,
      color: {
        argb: 'FFFF0000'
      }
    } // Red text
    valueCell.alignment = {
      horizontal: 'center'
    }

    // const valuegRow = worksheet.getRow(startRow);
    const valuegCell = valueRow.getCell(2)
    valuegCell.value = '='
    valuegCell.alignment = {
      horizontal: 'center'
    }

    // const valuegRow = worksheet.getRow(startRow);
    const valueRemarkCell = valueRow.getCell(3)
    valueRemarkCell.value = 'ปริมาณความไม่สมดุลทางบวกและทางลบเกินเกณฑ์ ±5%'

    // Reported By sections
    const reportedByStartRow = startRow + 4

    // Left side - Reported By
    const reportedByRow = worksheet.getRow(reportedByStartRow)
    const reportedByCell = reportedByRow.getCell(1)
    reportedByCell.value = 'Reported By'
    reportedByCell.font = {
      size: 10,
      bold: true
    }

    const reportedByNameRow = worksheet.getRow(reportedByStartRow + 1)
    const reportedByNameCell = reportedByNameRow.getCell(1)
    reportedByNameCell.value = `(${params.reportedBy.name})`
    reportedByNameCell.font = {size: 10}

    const reportedByPositionRow = worksheet.getRow(reportedByStartRow + 2)
    const reportedByPositionCell = reportedByPositionRow.getCell(1)
    reportedByPositionCell.value = `${params.reportedBy.position} of`
    reportedByPositionCell.font = {size: 10}

    const reportedByDivisionRow = worksheet.getRow(reportedByStartRow + 3)
    const reportedByDivisionCell = reportedByDivisionRow.getCell(1)
    reportedByDivisionCell.value = params.reportedBy.division
    reportedByDivisionCell.font = {size: 10}

    // Right side - Manager
    const managerRow = worksheet.getRow(reportedByStartRow)
    const managerCell = managerRow.getCell(7)
    managerCell.value = 'Reported By'
    managerCell.font = {
      size: 10,
      bold: true
    }

    const managerNameRow = worksheet.getRow(reportedByStartRow + 1)
    const managerNameCell = managerNameRow.getCell(7)
    managerNameCell.value = `(${params.manager.name})`
    managerNameCell.font = {
      size: 10
    }

    const managerPositionRow = worksheet.getRow(reportedByStartRow + 2)
    const managerPositionCell = managerPositionRow.getCell(7)
    managerPositionCell.value = `${params.manager.position} of`
    managerPositionCell.font = {size: 10}

    const managerDivisionRow = worksheet.getRow(reportedByStartRow + 3)
    const managerDivisionCell = managerDivisionRow.getCell(7)
    managerDivisionCell.value = params.manager.division
    managerDivisionCell.font = {size: 10}
  }

  private getBorderStyle(): Partial<ExcelJS.Borders> {
    return {
      top: {style: 'thin'},
      left: {style: 'thin'},
      bottom: {style: 'thin'},
      right: {style: 'thin'}
    }
  }

  /**
   * Export Real Imbalance Capacity Report to Excel
   */
  async exportRealImbalanceCapacityReport(realData: RealImbalanceData[], params: ImbalanceCapacityReportParams, response: Response): Promise<void> {
    try {
      // Convert real data to Excel format
      //
      const excelData = this.convertRealDataToExcelFormat(realData, params)
      // Use existing export method
      await this.exportImbalanceCapacityReport(excelData, params, response)
    } catch (error) {
      throw new Error(`Failed to export Real Imbalance Capacity Report: ${error.message}`)
    }
  }

  /**
   * Generate sample data for testing
   */
  generateSampleData(): ImbalanceCapacityReportData[] {
    const data: ImbalanceCapacityReportData[] = []
    const daysInMonth = 30

    // Sample data similar to the image
    const sampleData = [
      {
        gasEntry: 187978.6864,
        gasExit: 186447.18,
        imbalance: 1531.5064,
        imbalancePercent: 0.81
      },
      {
        gasEntry: 205774.7206,
        gasExit: 202696.69,
        imbalance: 3078.0306,
        imbalancePercent: 1.5
      },
      {
        gasEntry: 198543.21,
        gasExit: 201234.56,
        imbalance: -2691.35,
        imbalancePercent: -1.36
      },
      {
        gasEntry: 192345.67,
        gasExit: 189876.54,
        imbalance: 2469.13,
        imbalancePercent: 5.28
      },
      {
        gasEntry: 201234.56,
        gasExit: 198765.43,
        imbalance: 2469.13,
        imbalancePercent: 1.23
      },
      {
        gasEntry: 195678.9,
        gasExit: 192345.67,
        imbalance: 3333.23,
        imbalancePercent: 1.7
      },
      {
        gasEntry: 189876.54,
        gasExit: 187654.32,
        imbalance: 2222.22,
        imbalancePercent: 1.17
      },
      {
        gasEntry: 203456.78,
        gasExit: 201234.56,
        imbalance: 2222.22,
        imbalancePercent: 1.09
      },
      {
        gasEntry: 197654.32,
        gasExit: 195432.1,
        imbalance: 2222.22,
        imbalancePercent: 1.12
      },
      {
        gasEntry: 191234.56,
        gasExit: 188765.43,
        imbalance: 2469.13,
        imbalancePercent: 1.29
      },
      {
        gasEntry: 205678.9,
        gasExit: 202345.67,
        imbalance: 3333.23,
        imbalancePercent: 1.62
      },
      {
        gasEntry: 199876.54,
        gasExit: 197654.32,
        imbalance: 2222.22,
        imbalancePercent: 1.11
      },
      {
        gasEntry: 193456.78,
        gasExit: 191234.56,
        imbalance: 2222.22,
        imbalancePercent: 1.15
      },
      {
        gasEntry: 207654.32,
        gasExit: 204432.1,
        imbalance: 3222.22,
        imbalancePercent: 1.55
      },
      {
        gasEntry: 201234.56,
        gasExit: 198765.43,
        imbalance: 2469.13,
        imbalancePercent: 1.23
      },
      {
        gasEntry: 195678.9,
        gasExit: 192345.67,
        imbalance: 3333.23,
        imbalancePercent: 1.7
      },
      {
        gasEntry: 189876.54,
        gasExit: 187654.32,
        imbalance: 2222.22,
        imbalancePercent: 1.17
      },
      {
        gasEntry: 203456.78,
        gasExit: 201234.56,
        imbalance: 2222.22,
        imbalancePercent: 1.09
      },
      {
        gasEntry: 197654.32,
        gasExit: 195432.1,
        imbalance: 2222.22,
        imbalancePercent: 1.12
      },
      {
        gasEntry: 191234.56,
        gasExit: 188765.43,
        imbalance: 2469.13,
        imbalancePercent: 1.29
      },
      {
        gasEntry: 205678.9,
        gasExit: 202345.67,
        imbalance: 3333.23,
        imbalancePercent: 1.62
      },
      {
        gasEntry: 199876.54,
        gasExit: 197654.32,
        imbalance: 2222.22,
        imbalancePercent: 1.11
      },
      {
        gasEntry: 193456.78,
        gasExit: 191234.56,
        imbalance: 2222.22,
        imbalancePercent: 1.15
      },
      {
        gasEntry: 207654.32,
        gasExit: 204432.1,
        imbalance: 3222.22,
        imbalancePercent: 1.55
      },
      {
        gasEntry: 201234.56,
        gasExit: 198765.43,
        imbalance: 2469.13,
        imbalancePercent: 1.23
      },
      {
        gasEntry: 195678.9,
        gasExit: 192345.67,
        imbalance: 3333.23,
        imbalancePercent: 1.7
      },
      {
        gasEntry: 189876.54,
        gasExit: 187654.32,
        imbalance: 2222.22,
        imbalancePercent: 1.17
      },
      {
        gasEntry: 203456.78,
        gasExit: 201234.56,
        imbalance: 2222.22,
        imbalancePercent: 1.09
      },
      {
        gasEntry: 197654.32,
        gasExit: 195432.1,
        imbalance: 2222.22,
        imbalancePercent: 1.12
      },
      {
        gasEntry: 191234.56,
        gasExit: 188765.43,
        imbalance: 2469.13,
        imbalancePercent: 1.29
      }
    ]

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(2024, 3, day) // April 2024
      const dayOfWeek = date.toLocaleDateString('en-US', {weekday: 'short'})

      const sample = sampleData[day - 1] || sampleData[0]
      const imbalance = sample.imbalance
      const imbalancePercentage = sample.imbalancePercent

      data.push({
        date: day.toString(),
        dayOfWeek,
        gasEntry: sample.gasEntry,
        gasExit: sample.gasExit,
        fuelGas: null,
        balancingGas: null,
        changeMinInventory: day === 1 ? -250.0 : null,
        shrinkageGas: null,
        commissioning: null,
        gasVent: null,
        otherGas: null,
        imbalance: imbalance,
        imbalancePercentage: imbalancePercentage,
        imbalanceQuantityOver5Percent: Math.abs(imbalancePercentage) > 5 ? Math.abs(imbalance) : null
      })
    }

    return data
  }
}
