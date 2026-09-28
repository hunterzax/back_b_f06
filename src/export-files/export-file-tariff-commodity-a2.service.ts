import {Injectable} from '@nestjs/common'
import {Response} from 'express'
import * as ExcelJS from 'exceljs'
import {PrismaService} from 'prisma/prisma.service'
import {
  getTodayEndAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'

export interface GasDeliveryData {
  fid: string
  name: string
  volumeMMSCF: number | null
  energyMMBTU: number | null
  region: string | null
  group: string
  zone: string
}

export interface GasDeliveryParams {
  zone: string
  month: string
  year: string
}

@Injectable()
export class ExportFileTariffCommodityA2Service {
  constructor(
    private prisma: PrismaService
  ) {}

  dcimal3 = (number: any) => {
    let numbers = number ?? 0
    if (isNaN(numbers))
      return numbers

    if (numbers == 0) {
      return '0.000' // special case for zero
    }

    const fixedNumber =
      parseFloat(
        numbers
      ).toFixed(3) // Keep 4 decimal places
    const [
      intPart,
      decimalPart
    ] = fixedNumber.split('.')

    const withCommas =
      intPart?.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ','
      )

    return `${withCommas}.${decimalPart}`
  }

  /**
   * Export Gas Delivery Report to Excel
   */
  async exportGasDeliveryReport(
    data: GasDeliveryData[],
    params: GasDeliveryParams,
    response: Response
  ): Promise<void> {
    try {
      const workbook =
        new ExcelJS.Workbook()
      const worksheet =
        workbook.addWorksheet(
          'Gas Delivery Report'
        )

      // Set column widths
      worksheet.columns = [
        {width: 12}, // FID
        {width: 50}, // NAME
        {width: 18}, // Volume (MMSCF)
        {width: 18}, // Energy (MMBTU)
        // {width: 12}, // Region
        {width: 12}, // Group
        {width: 12} // Zone
      ]

      const todayStart =
        getTodayStartAdd7().toDate()
      const todayEnd =
        getTodayEndAdd7().toDate()

      const nominationMaster =
        await this.prisma.nomination_point.findMany(
          {
            where: {
              AND: [
                {
                  start_date:
                    {
                      lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
                    }
                },
                {
                  OR: [
                    {
                      end_date:
                        null
                    }, // ถ้า end_date เป็น null
                    {
                      end_date:
                        {
                          gt: todayStart
                        }
                    } //  // https://app.clickup.com/t/86etzcgr9 //end_date ให้  - 1 (end จริง คือไม่ได้)
                  ]
                }
              ]
            },
            include: {
              customer_type: true
            }
          }
        )

      const ndata = data?.map(
        (e: any) => {
          const find =
            nominationMaster?.find(
              (f: any) =>
                f?.nomination_point ===
                e?.point
            )
          // let energy = e?.calcNotRound && this.dcimal3(e?.calcNotRound) || "-"
          let energy =
            (e?.calcNotRound &&
              Number(
                e?.calcNotRound
              ).toFixed(0)) ||
            0
          let name =
            find?.description ||
            '-'
          let group = find?.customer_type?.name || '-'
          return {
            ...e,
            name:
              name,
            energy:
              energy,
            group:
              group
          }
        }
      )

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
        ndata
      )

      // Total Row
      this.addTotalRow(
        worksheet,
        ndata
      )

      // Set response headers
      const fileName = `Gas_Delivery_Report_${params.zone}_${params.month}_${params.year}.xlsx`
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
        `Failed to export Gas Delivery Report: ${error.message}`
      )
    }
  }

  private addHeaderSection(
    worksheet: ExcelJS.Worksheet,
    params: GasDeliveryParams
  ): void {
    // Title
    const titleCell =
      worksheet.getCell('A1')
    // titleCell.value = `Gas Delivery Report for ${params.zone}`;
    titleCell.value = `Gas Delivery Report for Zone 3`
    // titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = {
      horizontal: 'left'
    }

    const titleCell2 =
      worksheet.getCell('A2')
    titleCell2.value = `Month ${params.month} Year ${params.year}`
    // titleCell2.font = { bold: true, size: 14 };
    titleCell2.alignment = {
      horizontal: 'left'
    }

    // Merge cells for title
    worksheet.mergeCells(
      'A1:G1'
    )

    // Empty rows
    worksheet.getRow(
      3
    ).height = 10
  }

  private addTableHeader(
    worksheet: ExcelJS.Worksheet
  ): void {
    const headerRow =
      worksheet.getRow(4)

    const headers = [
      {
        cell: 'A4',
        value: 'FID'
      },
      {
        cell: 'B4',
        value: 'NAME'
      },
      {
        cell: 'C4',
        value:
          'Volume (MMSCF)'
      },
      {
        cell: 'D4',
        value:
          'Energy (MMBTU)'
      },
      // {
      //   cell: 'E4',
      //   value: 'Region'
      // },
      {
        // cell: 'F4',
        cell: 'E4',
        value: 'Group'
      },
      {
        // cell: 'G4',
        cell: 'F4',
        value: 'Zone'
      }
    ]

    headers.forEach(
      ({cell, value}) => {
        const headerCell =
          worksheet.getCell(
            cell
          )
        headerCell.value =
          value
        headerCell.font = {
          bold: true,
          size: 10
        }
        headerCell.alignment =
          {
            horizontal:
              'center',
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
      }
    )

    headerRow.height = 25
  }

  private addDataRows(
    worksheet: ExcelJS.Worksheet,
    data: GasDeliveryData[]
  ): void {
    data.forEach(
      (
        rowData: any,
        index
      ) => {
        const row =
          worksheet.getRow(
            index + 5
          ) // Start from row 5 (after header)

        // FID (Column A)
        const fidCell =
          row.getCell(1)
        fidCell.value =
          rowData?.point
        fidCell.alignment = {
          horizontal: 'left'
        }
        fidCell.border =
          this.getBorderStyle()

        // NAME (Column B) Description ใน DAM > Nomination Point
        const nameCell =
          row.getCell(2)
        nameCell.value =
          rowData?.name
        nameCell.alignment = {
          horizontal: 'left'
        }
        nameCell.border =
          this.getBorderStyle()

        // Volume (MMSCF) (Column C)
        const volumeCell =
          row.getCell(3)
        volumeCell.value = ''
        // if (rowData.volumeMMSCF !== null) {
        //   volumeCell.value = rowData.volumeMMSCF;
        //   volumeCell.numFmt = '#,##0.000000';
        volumeCell.alignment =
          {
            horizontal:
              'right'
          }
        // } else {
        //   volumeCell.value = '-';
        //   volumeCell.alignment = { horizontal: 'center' };
        // }
        volumeCell.border =
          this.getBorderStyle()

        // Energy (MMBTU) (Column D) ค่ามาจากหน้า Detail Column Allocate Exit Quantity แล้ว round ค่าที่นี้
        const energyCell =
          row.getCell(4)
        if (
          rowData?.energy !==
          null
        ) {
          energyCell.value =
            Number(
              rowData?.energy
            )
          energyCell.numFmt =
            '#,##0'
          energyCell.alignment =
            {
              horizontal:
                'right'
            }
        } else {
          energyCell.value =
            '-'
          energyCell.alignment =
            {
              horizontal:
                'center'
            }
        }
        energyCell.border =
          this.getBorderStyle()

        // Region (Column E)
        // const regionCell =
        //   row.getCell(5)
        // regionCell.value = ''
        // // regionCell.value = rowData.region || '';
        // regionCell.alignment =
        //   {
        //     horizontal:
        //       'center'
        //   }
        // regionCell.border =
        //   this.getBorderStyle()

        // Group (Column F) Customer Type ของ nom Point
        const groupCell =
          row.getCell(5)
          // row.getCell(6)
        groupCell.value =
          rowData?.group
        groupCell.alignment =
          {
            horizontal:
              'center'
          }
        groupCell.border =
          this.getBorderStyle()

        // Zone (Column G)
        const zoneCell =
          row.getCell(6)
          // row.getCell(7)
        zoneCell.value =
          'Zone 3'
        // zoneCell.value = rowData.zone;
        zoneCell.alignment = {
          horizontal: 'center'
        }
        zoneCell.border =
          this.getBorderStyle()

        row.height = 20
      }
    )
  }

  private addTotalRow(
    worksheet: ExcelJS.Worksheet,
    data: any[]
  ): void {
    const totalRowIndex =
      data.length + 5 // After data rows
    const totalRow =
      worksheet.getRow(
        totalRowIndex
      )

    // Calculate totals
    const totalVolume =
      data.reduce(
        (sum, row) =>
          sum +
          (row.volumeMMSCF ||
            0),
        0
      )
    const totalEnergy =
      data.reduce(
        (sum, row) =>
          sum +
          ((row.energy !==
            '-' &&
            Number(
              row.energy
            )) ||
            0),
        0
      )

    // Total label (Column A)
    const totalLabelCell =
      totalRow.getCell(1)
    // totalLabelCell.value = `รวมปริมาณก๊าซ ${data[0]?.zone || 'Zone'}`;
    totalLabelCell.value = `รวมปริมาณก๊าซ Zone 3`
    totalLabelCell.font = {
      bold: true
    }
    totalLabelCell.alignment =
      {horizontal: 'left'}
    totalLabelCell.border =
      this.getBorderStyle()

    // Empty cell for NAME (Column B)
    const emptyNameCell =
      totalRow.getCell(2)
    emptyNameCell.value = ''
    emptyNameCell.border =
      this.getBorderStyle()

    // Total Volume (Column C)
    const totalVolumeCell =
      totalRow.getCell(3)
    totalVolumeCell.value = ''
    // totalVolumeCell.value = totalVolume;
    // totalVolumeCell.numFmt = '#,##0.000000';
    // totalVolumeCell.font = { bold: true };
    totalVolumeCell.alignment =
      {horizontal: 'right'}
    totalVolumeCell.border =
      this.getBorderStyle()

    // Total Energy (Column D) sum energy
    const totalEnergyCell =
      totalRow.getCell(4)
    totalEnergyCell.value =
      totalEnergy
    totalEnergyCell.numFmt =
      '#,##0'
    totalEnergyCell.font = {
      bold: true
    }
    totalEnergyCell.alignment =
      {horizontal: 'right'}
    totalEnergyCell.border =
      this.getBorderStyle()

    // Empty cells for Region, Group, Zone (Columns E, F, G)
    // const emptyRegionCell =
    //   totalRow.getCell(5)
    // emptyRegionCell.value = ''
    // emptyRegionCell.border =
    //   this.getBorderStyle()

    const emptyGroupCell =
      totalRow.getCell(5)
      // totalRow.getCell(6)
    emptyGroupCell.value = ''
    emptyGroupCell.border =
      this.getBorderStyle()

    const emptyZoneCell =
      totalRow.getCell(6)
      // totalRow.getCell(7)
    emptyZoneCell.value = ''
    emptyZoneCell.border =
      this.getBorderStyle()

    // Highlight total row with yellow background
    totalRow.eachCell(
      (cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: 'FFFFFF00'
          } // Yellow background
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
  generateSampleData(): GasDeliveryData[] {
    return [
      {
        fid: 'RES-OC',
        name: 'Fuel gas OC residence',
        volumeMMSCF: null,
        energyMMBTU: null,
        region: '6',
        group: 'IND',
        zone: 'Zone 3'
      },
      {
        fid: 'BCP_1',
        name: 'บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)',
        volumeMMSCF: 708.14184,
        energyMMBTU: 708654,
        region: '6',
        group: 'IND',
        zone: 'Zone 3'
      },
      {
        fid: 'BCP_2',
        name: 'บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)',
        volumeMMSCF: 74.354173,
        energyMMBTU: 74429,
        region: '6',
        group: 'IND',
        zone: 'Zone 3'
      },
      {
        fid: 'BCP_CO',
        name: 'บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)',
        volumeMMSCF: 161.493453,
        energyMMBTU: 161655,
        region: '6',
        group: 'IND',
        zone: 'Zone 3'
      },
      {
        fid: 'SMIC',
        name: 'บริษัท สุนทร เมทัล จํากัด',
        volumeMMSCF: 11.959713,
        energyMMBTU: 10441,
        region: '6',
        group: 'IND',
        zone: 'Zone 3'
      },
      {
        fid: 'AIR POG',
        name: 'Air PO6 Office building',
        volumeMMSCF: null,
        energyMMBTU: null,
        region: '6',
        group: 'IND',
        zone: 'Zone 3'
      },
      {
        fid: 'NGR_CMPL',
        name: 'Commissioning stent OGP_ISU',
        volumeMMSCF: 0.000108,
        energyMMBTU: 10,
        region: '',
        group: 'NGR',
        zone: 'Zone 3'
      },
      {
        fid: 'NGV_VENT',
        name: 'โครงการเปลี่ยน Underground valve ของนิคมฯสหพัฒน์ บริเวณห่อ RC044023',
        volumeMMSCF: 0.037055,
        energyMMBTU: 37,
        region: '1',
        group: 'NGV',
        zone: 'Zone 3'
      }
    ]
  }
}
