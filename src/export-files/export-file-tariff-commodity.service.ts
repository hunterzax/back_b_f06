import {Injectable} from '@nestjs/common'
import {Response} from 'express'
import * as ExcelJS from 'exceljs'
import * as dayjs from 'dayjs'
import {MeteringManagementService} from 'src/metering-management/metering-management.service'
import {PrismaService} from 'prisma/prisma.service'
import {getTodayEndAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'

export interface GasAllocationData {
  date: number
  finalAllocation: number
  statementOfGasDelivered: number
  gasAllocation: number
  satStdVolAllocation: number
  remark?: string
}

export interface GasAllocationParams {
  gasMeteringStation: string
  shipperName: string
  month: string
  year: string
}

// New interfaces for multiple sheets support
export interface GasAllocationPointData {
  point: string
  calc: number
  calcNotRound: number
  tempDateArr: GasAllocationData[]
}

// Real data interfaces for mapping
export interface RealGasAllocationData {
  contract_code_id: number
  term_type: {
    id: number
    name: string
    color: string
  }
  publication: boolean
  id?: number
  request_number: number
  execute_timestamp: number
  gas_day: string
  contract: string
  shipper: string
  point: string
  point_type: string
  customer_type: string
  relation_point: string
  relation_point_type: string
  area: string
  zone: string
  entry_exit: string
  values: Array<{
    tag: string
    value: number
  }>
  area_obj: {
    id: number
    name: string
    create_date: string
    update_date: string | null
    create_date_num: number
    update_date_num: number | null
    create_by: number
    update_by: number | null
    active: boolean
    start_date: string
    end_date: string | null
    description: string
    area_nominal_capacity: number
    zone_id: number
    entry_exit_id: number
    color: string
    supply_reference_quality_area: number
  }
  zone_obj: {
    id: number
    name: string
    color: string
    create_date: string
    update_date: string
    create_date_num: number
    update_date_num: number
    create_by: number
    update_by: number
    description: string
    start_date: string
    end_date: string | null
    entry_exit_id: number
    sensitive: string | null
  }
  group?: {
    id: number
    id_name: string
    name: string
    company_name: string
    user_type_id: number
    telephone: string | null
    email: string | null
    address: string | null
    bank_no: string | null
    start_date: string
    end_date: string
    status: boolean
    active: boolean
    create_date: string
    update_date: string
    bank_master_id: string | null
    create_by: number
    update_by: number
    time_num: string | null
    create_date_num: number
    update_date_num: number
  }
  contractCapacity: number
  nominationValue: number
  allocatedValue: number
  entry_exit_obj: {
    id: number
    name: string
    color: string
    create_date: string | null
    update_date: string | null
    create_date_num: number | null
    update_date_num: number | null
    create_by: number | null
    update_by: number | null
  }
  findAllocationReport?: any
}

export interface GasAllocationMultiSheetParams {
  gasMeteringStation: string
  shipperName: string
  month: string
  year: string
  startDate: string // gas_day start date
  endDate: string // gas_day end date
}

@Injectable()
export class ExportFileTariffCommodityService {
  constructor(
    private readonly meteringManagementService: MeteringManagementService,
    private prisma: PrismaService
  ) {}
  /**
   * Export Statement of Gas Allocation to Excel with Real Data (Multiple Sheets)
   */
  // async exportStatementOfGasAllocationMultiSheetWithRealData(realData: RealGasAllocationData[], params: GasAllocationMultiSheetParams, response: Response): Promise<void> {
  //   try {
  //     // Convert real data to Excel format
  //     const pointData = this.convertRealDataToExcelFormat(realData)

  //     // Use existing multi-sheet export method
  //     await this.exportStatementOfGasAllocationMultiSheet(pointData, params, response)
  //   } catch (error) {
  //     throw new Error(`Failed to export Statement of Gas Allocation with Real Data: ${error.message}`)
  //   }
  // }

  /**
   * Export Statement of Gas Allocation to Excel with Multiple Sheets
   */

  async exportStatementOfGasAllocationMultiSheet(pointData: GasAllocationPointData[], params: any, response: Response): Promise<void> {
    try {
      // const sumWithInitial = array.reduce(
      //   (accumulator, currentValue) => accumulator + currentValue,
      //   initialValue,
      // );

      // month = '10'
      // year = '2025'
      const m = params?.month.padStart(2, '0')
      const startD = `${params?.year}-${m}-01`
      const lastDay = new Date(Number(params?.year), Number(params?.month), 0).getDate() // วันสุดท้ายของเดือน
      const endD = `${params?.year}-${m}-${String(lastDay).padStart(2, '0')}`

      // gasDay = '2025-10-01'
      // meteringPointId = 'T2_IPG'

      // const meterUse = await this.meteringManagementService.getDataLogic(
      //   {
      //     share: 'off',
      //     start_date: startD,
      //     end_date: endD
      //   },
      //   true
      // ) 
      const meterUse = await this.meteringManagementService.getDataLogicBeforeTimestamp(
        {
          share: 'off',
          start_date: startD,
          end_date: endD,
          timestamp: params?.timestamp
        },
        true
      ) 

      const totals = pointData?.reduce(
        (acc: any, cur: any) => {
          acc.calc += cur.calc || 0
          acc.calcNotRound += cur.calcNotRound || 0
          return acc
        },
        {
          calc: 0,
          calcNotRound: 0
        }
      )

      // pointData
      const workbook = new ExcelJS.Workbook()

      // pointInfo.tempDateArr
      // gas_day

      // หาวันแรกและวันสุดท้ายของเดือนเดียวกัน
      // // data
      const gDay = `${params.year}-${params.month}-01`
      const start = dayjs(gDay).startOf('month')
      const end = dayjs(gDay).endOf('month')

      // สร้าง array ของวันทั้งหมดในเดือน
      const daysInMonth = []
      let current = start

      while (current.isBefore(end) || current.isSame(end, 'day')) {
        daysInMonth.push(current.format('YYYY-MM-DD'))
        current = current.add(1, 'day')
      }
      const pointNames: string[] = pointData.map(pointInfo => pointInfo?.point)
      const activeMeteringPoint = await this.prisma.metering_point.findMany({
        where: {
          AND: [
            {
              nomination_point: {
                nomination_point: {
                  in: pointNames
                }
              }
            },
            {
              start_date: {
                lte: end.toDate() // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gte: start.toDate()
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        },
        include: {
          nomination_point: {
            select: {
              nomination_point: true
            }
          }
        }
      })
      // Create a sheet for each point
      for (const pointInfo of pointData) {
        const worksheet = workbook.addWorksheet(pointInfo.point)

        // pointInfo?.point

        const meteringPointOfThisNomPoint = activeMeteringPoint?.filter((f: any) => f?.nomination_point?.nomination_point === pointInfo?.point)
        // metering_point
        const meterD = meteringPointOfThisNomPoint?.length > 0 ? meterUse?.filter((f: any) => meteringPointOfThisNomPoint?.map((np: any) => np?.metered_point_name)?.includes(f?.meteringPointId)) : []

        // Set column widths
        worksheet.columns = [
          {width: 8}, // Date
          {width: 18}, // Final Allocation
          {width: 25}, // Statement of Gas Delivered
          {width: 18}, // Gas Allocation
          {width: 30}, // Sat. Std. Vol. Allocation (MMSCF)
          {width: 15} // Remark
        ]

        // Header Section - Use point name as gasMeteringStation
        this.addHeaderSection(worksheet, {
          gasMeteringStation: pointInfo?.point || '',
          shipperName: params.shipperName || '',
          month: params.month,
          year: params.year
        })

        // Table Header
        this.addTableHeader(worksheet)

        // Data Rows
        this.addDataRows(worksheet, pointInfo.tempDateArr, daysInMonth, meterD)

        // Total Row
        this.addTotalRow(worksheet, pointInfo.tempDateArr, daysInMonth, meterD)

        // Footer Section - Use point name as gasMeteringStation
        this.addFooterSection(
          worksheet,
          {
            gasMeteringStation: pointInfo.point,
            shipperName: params.shipperName,
            month: params.month,
            year: params.year
          },
          pointInfo.tempDateArr,
          totals?.calc,
          daysInMonth
        )
      }

      // Set response headers
      const fileName = `Statement_of_Gas_Allocation_MultiSheet_${params.shipperName}_${params.month}_${params.year}.xlsx`
      response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

      // Write to response
      await workbook.xlsx.write(response)
      response.end()
    } catch (error) {
      throw new Error(`Failed to export Statement of Gas Allocation Multi-Sheet: ${error.message}`)
    }
  }

  /**
   * Export Statement of Gas Allocation to Excel (Single Sheet)
   */
  async exportStatementOfGasAllocation(data: GasAllocationData[], params: GasAllocationParams, response: Response): Promise<void> {
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Statement of Gas Allocation')
      // Set column widths
      worksheet.columns = [
        {width: 8}, // Date
        {width: 18}, // Final Allocation
        {width: 25}, // Statement of Gas Delivered
        {width: 18}, // Gas Allocation
        {width: 30}, // Sat. Std. Vol. Allocation (MMSCF)
        {width: 15} // Remark
      ]

      // Header Section
      this.addHeaderSection(worksheet, params)

      // Table Header
      this.addTableHeader(worksheet)

      // Data Rows
      this.addDataRows(worksheet, data, [])

      // Total Row
      this.addTotalRow(worksheet, data)

      // Footer Section
      this.addFooterSection(worksheet, params, data)

      // Set response headers
      const fileName = `Statement_of_Gas_Allocation_${params.shipperName}_${params.month}_${params.year}.xlsx`
      response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

      // Write to response
      await workbook.xlsx.write(response)
      response.end()
    } catch (error) {
      throw new Error(`Failed to export Statement of Gas Allocation: ${error.message}`)
    }
  }

  private addHeaderSection(worksheet: ExcelJS.Worksheet, params: GasAllocationParams): void {
    // Gas Metering Station
    const stationCell = worksheet.getCell('A1')
    // stationCell.value = `Gas Metering Station: ${params.gasMeteringStation}`
    stationCell.value = `Nomination Point: ${params.gasMeteringStation}` // https://app.clickup.com/t/9018502823/86euzxxuf
    stationCell.font = {
      bold: true,
      size: 12
    }
    stationCell.alignment = {
      horizontal: 'left'
    }

    // Statement of Gas Allocation title
    const titleCell = worksheet.getCell('A2')
    titleCell.value = `Statement of Gas Allocation for: ${params?.shipperName || '-'}`
    titleCell.font = {
      bold: true,
      size: 12
    }
    titleCell.alignment = {
      horizontal: 'left'
    }

    // Month and Year
    const monthCell = worksheet.getCell('A3')
    monthCell.value = `Month: ${dayjs(params.month, 'MM').format('MMMM')} ${params.year}`
    monthCell.font = {
      bold: true,
      size: 12
    }
    monthCell.alignment = {
      horizontal: 'left'
    }

    // Empty row
    worksheet.getRow(4).height = 20
  }

  private addTableHeader(worksheet: ExcelJS.Worksheet): void {
    const headerRow = worksheet.getRow(5)

    // Main header - GAS ENERGY (MMBTU) - merged across columns B-D
    worksheet.mergeCells('B5:D5')
    const mainHeaderCell = worksheet.getCell('B5')
    mainHeaderCell.value = 'GAS ENERGY (MMBTU)'
    mainHeaderCell.font = {
      bold: true,
      size: 10
    }
    mainHeaderCell.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    }
    mainHeaderCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FFE0E0E0'
      }
    }
    mainHeaderCell.border = {
      top: {style: 'thin'},
      left: {style: 'thin'},
      bottom: {style: 'thin'},
      right: {style: 'thin'}
    }

    // Individual column headers
    const headers = [
      {
        cell: 'A5',
        value: 'Date'
      },
      {
        cell: 'B6',
        value: 'Final Allocation'
      },
      {
        cell: 'C6',
        value: 'Statement of Gas Delivered'
      },
      {
        cell: 'D6',
        value: 'Gas Allocation'
      },
      {
        cell: 'E5',
        value: 'Sat. Std. Vol. Allocation (MMSCF)'
      },
      {
        cell: 'F5',
        value: 'Remark'
      }
    ]

    headers.forEach(({cell, value}) => {
      const headerCell = worksheet.getCell(cell)
      headerCell.value = value
      headerCell.font = {
        bold: true,
        size: 10
      }
      headerCell.alignment = {
        horizontal: 'center',
        vertical: 'middle'
      }
      headerCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: 'FFE0E0E0'
        }
      }
      headerCell.border = {
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

    // Merge cells for multi-row headers
    worksheet.mergeCells('A5:A6') // Date column
    worksheet.mergeCells('E5:E6') // Sat. Std. Vol. Allocation column
    worksheet.mergeCells('F5:F6') // Remark column

    headerRow.height = 25
    worksheet.getRow(6).height = 25
  }

  private addDataRows(worksheet: ExcelJS.Worksheet, data: GasAllocationData[], daysInMonth: any, meterUse?: any): void {
    // gasDay
    // energy

    // Sort data by gas_day (ascending - earliest date first)
    const sortedData = data.sort((a: any, b: any) => {
      const dateA = new Date(a.gas_day)
      const dateB = new Date(b.gas_day)
      return dateA.getTime() - dateB.getTime()
    })
    const sortedDaysInMonth = daysInMonth.sort((a: any, b: any) => {
      const dateA = new Date(a)
      const dateB = new Date(b)
      return dateA.getTime() - dateB.getTime()
    })
    // console.log('sortedDaysInMonth : ', sortedDaysInMonth);
    sortedDaysInMonth.forEach((rowDataDay: any, index) => {
      const rowData: any = sortedData?.find((f: any) => f?.gas_day === rowDataDay) || null
      const row = worksheet.getRow(index + 7) // Start from row 7 (after 2 header rows)
      if (rowData) {
        // Date (Column A)
        const dateCell = row.getCell(1)
        // Extract day from gas_day (e.g., "2025-01-09" -> 9)
        const gasDay = new Date(rowData?.gas_day)
        const dayOfMonth = gasDay.getDate()
        dateCell.value = dayOfMonth
        dateCell.alignment = {
          horizontal: 'center'
        }
        dateCell.border = this.getBorderStyle()

        // Final Allocation (Column B)
        const finalAllocationCell = row.getCell(2)
        finalAllocationCell.value = rowData.allocatedValue
        finalAllocationCell.numFmt = '#,##0.0000'
        finalAllocationCell.alignment = {
          horizontal: 'right'
        }
        finalAllocationCell.border = this.getBorderStyle()

        // Statement of Gas Delivered (Column C)
        const statementCell = row.getCell(3)
        // const findMeter = meterUse?.find((f:any) => f?.gasDay === rowData?.gas_day)?.energy && Number(meterUse?.find((f:any) => f?.gasDay === rowData?.gas_day)?.energy ?? 0) ? Number(Number(meterUse?.find((f:any) => f?.gasDay === rowData?.gas_day)?.energy ?? 0)) : rowData.nominationValue
        // const findMeterA = meterUse?.filter((f:any) => f?.gasDay === rowData?.gas_day).length > 0
        // ? meterUse?.filter((f:any) => f?.gasDay === rowData?.gas_day)
        // : rowData.nominationValue
        const findMeterA = meterUse?.filter((f: any) => f?.gasDay === rowData?.gas_day)
        const findMeterA1 = findMeterA?.reduce((accumulator, currentValue) => accumulator + Number(currentValue?.energy ?? 0), 0) || 0
        const findMeter = findMeterA1 ? findMeterA1 : rowData.nominationValue
        // energy
        // statementCell.value = rowData.nominationValue;
        statementCell.value = findMeter
        // // gasDay
        // // energy

        // meterUse
        statementCell.numFmt = '#,##0.0000'
        statementCell.alignment = {
          horizontal: 'right'
        }
        statementCell.border = this.getBorderStyle()

        // Gas Allocation (Column D)
        const gasAllocationCell = row.getCell(4)
        gasAllocationCell.value = rowData.allocatedValue
        gasAllocationCell.numFmt = '#,##0.0000'
        gasAllocationCell.alignment = {
          horizontal: 'right'
        }
        gasAllocationCell.border = this.getBorderStyle()
      } else {
        const dateCell = row.getCell(1)
        // Extract day from gas_day (e.g., "2025-01-09" -> 9)
        const gasDay = new Date(rowDataDay)
        const dayOfMonth = gasDay.getDate()
        dateCell.value = dayOfMonth
        dateCell.alignment = {
          horizontal: 'center'
        }
        dateCell.border = this.getBorderStyle()

        // Final Allocation (Column B)
        const finalAllocationCell = row.getCell(2)
        finalAllocationCell.value = '-'
        finalAllocationCell.alignment = {
          horizontal: 'right'
        }
        finalAllocationCell.border = this.getBorderStyle()

        // Statement of Gas Delivered (Column C)
        const statementCell = row.getCell(3)
        statementCell.value = '-'
        statementCell.alignment = {
          horizontal: 'right'
        }
        statementCell.border = this.getBorderStyle()

        // Gas Allocation (Column D)
        const gasAllocationCell = row.getCell(4)
        gasAllocationCell.value = '-'
        gasAllocationCell.alignment = {
          horizontal: 'right'
        }
        gasAllocationCell.border = this.getBorderStyle()
      }

      // Sat. Std. Vol. Allocation (Column E)
      const satStdVolCell = row.getCell(5)
      satStdVolCell.value = rowData?.satStdVolAllocation
      satStdVolCell.numFmt = '#,##0.000000'
      satStdVolCell.alignment = {
        horizontal: 'right'
      }
      satStdVolCell.border = this.getBorderStyle()

      // Remark (Column F)
      const remarkCell = row.getCell(6)
      remarkCell.value = rowData?.remark || ''
      remarkCell.alignment = {horizontal: 'left'}
      remarkCell.border = this.getBorderStyle()

      row.height = 20
    })
  }

  private addTotalRow(worksheet: ExcelJS.Worksheet, data: GasAllocationData[], daysInMonth?: any, meterUse?: any): void {
    const totalRowIndex = daysInMonth.length + 7 // After data rows
    const totalRow = worksheet.getRow(totalRowIndex)

    // Sort data by gas_day (ascending - earliest date first) for consistent totals
    const sortedData = data.sort((a: any, b: any) => {
      const dateA = new Date(a.gas_day)
      const dateB = new Date(b.gas_day)
      return dateA.getTime() - dateB.getTime()
    })

    // Calculate totals from sorted data
    const totalFinalAllocation = sortedData.reduce((sum, row: any) => sum + (row.allocatedValue || 0), 0)

    const totalStatementOfGasDelivered = sortedData.reduce((sum, row: any) => {
      // const findMeter = meterUse?.find((f:any) => f?.gasDay === row?.gas_day)?.energy && Number(meterUse?.find((f:any) => f?.gasDay === row?.gas_day)?.energy ?? 0) ? Number(Number(meterUse?.find((f:any) => f?.gasDay === row?.gas_day)?.energy ?? 0)) : row.nominationValue
      const findMeterA = meterUse?.filter((f: any) => f?.gasDay === row?.gas_day)
      const findMeterA1 = findMeterA?.reduce((accumulator, currentValue) => accumulator + Number(currentValue?.energy ?? 0), 0) || 0
      const findMeter = findMeterA1 ? findMeterA1 : row.nominationValue
      const calcs = sum + (findMeter || 0)
      // const calcs = sum + (row.nominationValue || 0)
      return calcs
    }, 0) // https://app.clickup.com/t/86euzxxut
    const totalGasAllocation = sortedData.reduce((sum, row: any) => sum + (row.allocatedValue || 0), 0)
    // const totalSatStdVolAllocation = sortedData.reduce((sum, row: any) => sum + (row.allocatedValue || 0) * 1.0, 0); // https://app.clickup.com/t/86euzxxut

    // Total label (Column A)
    const totalLabelCell = totalRow.getCell(1)
    totalLabelCell.value = 'Total'
    totalLabelCell.font = {
      bold: true
    }
    totalLabelCell.alignment = {horizontal: 'left'}
    totalLabelCell.border = this.getBorderStyle()

    // Total Final Allocation (Column B)
    const totalFinalAllocationCell = totalRow.getCell(2)
    totalFinalAllocationCell.value = totalFinalAllocation
    totalFinalAllocationCell.numFmt = '#,##0.0000'
    totalFinalAllocationCell.font = {bold: true}
    totalFinalAllocationCell.alignment = {horizontal: 'right'}
    totalFinalAllocationCell.border = this.getBorderStyle()

    // Total Statement of Gas Delivered (Column C)
    const totalStatementCell = totalRow.getCell(3)
    totalStatementCell.value = totalStatementOfGasDelivered
    totalStatementCell.numFmt = '#,##0.0000'
    totalStatementCell.font = {bold: true}
    totalStatementCell.alignment = {horizontal: 'right'}
    totalStatementCell.border = this.getBorderStyle()

    // Total Gas Allocation (Column D)
    const totalGasAllocationCell = totalRow.getCell(4)
    totalGasAllocationCell.value = totalGasAllocation
    totalGasAllocationCell.numFmt = '#,##0.0000'
    totalGasAllocationCell.font = {bold: true}
    totalGasAllocationCell.alignment = {horizontal: 'right'}
    totalGasAllocationCell.border = this.getBorderStyle()

    // Total Sat. Std. Vol. Allocation (Column E)
    const totalSatStdVolCell = totalRow.getCell(5)
    totalSatStdVolCell.value = '' // https://app.clickup.com/t/86euzxxut
    // totalSatStdVolCell.value = totalSatStdVolAllocation;
    // totalSatStdVolCell.numFmt = '#,##0.000000';
    // totalSatStdVolCell.font = { bold: true };
    // totalSatStdVolCell.alignment = { horizontal: 'right' };
    totalSatStdVolCell.border = this.getBorderStyle()

    // Empty cell for Remark (Column F)
    const emptyRemarkCell = totalRow.getCell(6)
    emptyRemarkCell.value = ''
    emptyRemarkCell.border = this.getBorderStyle()

    totalRow.height = 25
  }

  private addFooterSection(worksheet: ExcelJS.Worksheet, params: GasAllocationParams, data: GasAllocationData[], totals?: any, daysInMonth?: any): void {
    const startRow = daysInMonth.length + 9 // After total row + empty row

    // Total Gas Energy for Commodity Charge
    const totalGasEnergyRow = worksheet.getRow(startRow)
    const totalGasEnergyLabelCell = totalGasEnergyRow.getCell(1)
    totalGasEnergyLabelCell.value = 'Total Gas Energy for Commodity Charge (MMBTU)'
    totalGasEnergyLabelCell.font = {size: 10}
    totalGasEnergyLabelCell.alignment = {horizontal: 'left'}

    // Sort data by gas_day (ascending - earliest date first) for consistent totals
    const sortedData = data.sort((a: any, b: any) => {
      const dateA = new Date(a.gas_day)
      const dateB = new Date(b.gas_day)
      return dateA.getTime() - dateB.getTime()
    })

    // Calculate total (rounded to integer) from sorted data
    const totalFinalAllocation = sortedData.reduce((sum, row: any) => sum + (row.allocatedValue || 0), 0)
    const roundedTotal = Math.round(totalFinalAllocation)

    // sawetchote@nueamek.com
    // const roundedTotal = totals;

    const totalGasEnergyValueCell = totalGasEnergyRow.getCell(2)
    totalGasEnergyValueCell.value = roundedTotal
    totalGasEnergyValueCell.numFmt = '#,##0'
    totalGasEnergyValueCell.font = {size: 10}
    totalGasEnergyValueCell.alignment = {horizontal: 'right'}
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
   * Generate sample data for testing (Single Sheet)
   */
  generateSampleData(): GasAllocationData[] {
    const data: GasAllocationData[] = []
    const daysInMonth = 30

    for (let i = 1; i <= daysInMonth; i++) {
      data.push({
        date: i,
        finalAllocation: 186447.18 + (Math.random() * 1000 - 500),
        statementOfGasDelivered: 273040.79 + (Math.random() * 1000 - 500),
        gasAllocation: 186447.18 + (Math.random() * 1000 - 500),
        satStdVolAllocation: 186.233115 + (Math.random() * 10 - 5),
        remark: ''
      })
    }

    return data
  }

  /**
   * Generate sample data for multiple sheets testing
   */
  generateSampleMultiSheetData(): GasAllocationPointData[] {
    const points = ['RPCL', 'IND-A1']
    const result: GasAllocationPointData[] = []

    for (const point of points) {
      const tempDateArr: GasAllocationData[] = []
      const daysInMonth = 30

      for (let i = 1; i <= daysInMonth; i++) {
        tempDateArr.push({
          date: i,
          finalAllocation: 186447.18 + (Math.random() * 1000 - 500),
          statementOfGasDelivered: 273040.79 + (Math.random() * 1000 - 500),
          gasAllocation: 186447.18 + (Math.random() * 1000 - 500),
          satStdVolAllocation: 186.233115 + (Math.random() * 10 - 5),
          remark: ''
        })
      }

      // Calculate totals
      const calc = tempDateArr.reduce((sum, item) => sum + item.finalAllocation, 0)
      const calcNotRound = tempDateArr.reduce((sum, item) => sum + item.finalAllocation, 0)

      result.push({
        point,
        calc: Math.round(calc),
        calcNotRound,
        tempDateArr
      })
    }

    return result
  }

  /**
   * Convert real data to Excel format for multiple sheets
   */
  convertRealDataToExcelFormat(realData: RealGasAllocationData[]): GasAllocationPointData[] {
    // Group data by point
    const groupedData = new Map<string, RealGasAllocationData[]>()

    realData.forEach((item) => {
      const point = item.point
      if (!groupedData.has(point)) {
        groupedData.set(point, [])
      }
      groupedData.get(point)!.push(item)
    })

    const result: GasAllocationPointData[] = []

    // Process each point
    groupedData.forEach((pointData, point) => {
      // Sort by gas_day (ascending - earliest date first)
      const sortedData = pointData.sort((a, b) => {
        const dateA = new Date(a.gas_day)
        const dateB = new Date(b.gas_day)
        return dateA.getTime() - dateB.getTime()
      })

      // Convert to Excel format
      const tempDateArr: GasAllocationData[] = sortedData.map((item, index) => {
        // Extract day from gas_day (e.g., "2025-01-31" -> 31)
        const gasDay = new Date(item.gas_day)
        const dayOfMonth = gasDay.getDate()

        return {
          date: dayOfMonth,
          finalAllocation: item.allocatedValue || 0,
          statementOfGasDelivered: item.nominationValue || 0,
          gasAllocation: item.allocatedValue || 0,
          satStdVolAllocation: this.calculateSatStdVolAllocation(item.allocatedValue || 0),
          remark: '' // Can be customized based on business logic
        }
      })

      // Calculate totals
      const calc = tempDateArr.reduce((sum, item) => sum + item.finalAllocation, 0)
      const calcNotRound = tempDateArr.reduce((sum, item) => sum + item.finalAllocation, 0)

      result.push({
        point,
        calc: Math.round(calc),
        calcNotRound,
        tempDateArr
      })
    })

    return result
  }

  /**
   * Calculate Sat. Std. Vol. Allocation (MMSCF) from MMBTU
   * This is a conversion factor - adjust based on your business requirements
   */
  private calculateSatStdVolAllocation(allocatedValue: number): number {
    // Example conversion: 1 MMBTU ≈ 1.0 MMSCF (adjust as needed)
    // You may need to apply specific conversion factors based on gas composition
    return allocatedValue * 1.0
  }
}
