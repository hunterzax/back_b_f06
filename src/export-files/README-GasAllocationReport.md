# Statement of Gas Allocation Export Service

## Overview

Service สำหรับ export Excel file ตาม format ของ Statement of Gas Allocation ของ Gas Metering Station

## Files Created

- `export-file-tariff-commodity.service.ts` - Main service สำหรับ export Excel
- Updated `dto/export-file-tariff.dto.ts` - เพิ่ม DTOs สำหรับ Gas Allocation
- Updated `entities/export-file-tariff.entity.ts` - เพิ่ม Entities สำหรับ Gas Allocation
- Updated `export-files.module.ts` - เพิ่ม commodity service
- Updated `export-files.controller.ts` - เพิ่ม endpoints

## API Endpoints

### 1. Export Statement of Gas Allocation (Single Sheet)

```
POST /master/export-files/tariff/gas-allocation-report
```

**Request Body:**

```json
{
  "data": [
    {
      "date": 1,
      "finalAllocation": 186447.18,
      "statementOfGasDelivered": 273040.79,
      "gasAllocation": 186447.18,
      "satStdVolAllocation": 186.233115,
      "remark": ""
    },
    {
      "date": 2,
      "finalAllocation": 186447.18,
      "statementOfGasDelivered": 273040.79,
      "gasAllocation": 186447.18,
      "satStdVolAllocation": 186.233115,
      "remark": ""
    }
  ],
  "gasMeteringStation": "BPK1",
  "shipperName": "EGAT Shipper",
  "month": "April",
  "year": "2024"
}
```

### 2. Generate Sample Report (Single Sheet)

```
POST /master/export-files/tariff/gas-allocation-report/sample
```

**Request Body:**

```json
{
  "gasMeteringStation": "BPK1",
  "shipperName": "EGAT Shipper",
  "month": "April",
  "year": "2024"
}
```

### 3. Export Statement of Gas Allocation (Multiple Sheets) ⭐ NEW

```
POST /master/export-files/tariff/gas-allocation-report/multisheet
```

**Request Body:**

```json
{
  "pointData": [
    {
      "point": "RPCL",
      "calc": 1865897,
      "calcNotRound": 1865897.1299999997,
      "tempDateArr": [
        {
          "date": 1,
          "finalAllocation": 186447.18,
          "statementOfGasDelivered": 273040.79,
          "gasAllocation": 186447.18,
          "satStdVolAllocation": 186.233115,
          "remark": ""
        }
      ]
    },
    {
      "point": "IND-A1",
      "calc": 311292,
      "calcNotRound": 311291.9249999998,
      "tempDateArr": [
        {
          "date": 1,
          "finalAllocation": 186447.18,
          "statementOfGasDelivered": 273040.79,
          "gasAllocation": 186447.18,
          "satStdVolAllocation": 186.233115,
          "remark": ""
        }
      ]
    }
  ],
  "gasMeteringStation": "BPK1",
  "shipperName": "EGAT Shipper",
  "month": "April",
  "year": "2024",
  "startDate": "2024-04-01",
  "endDate": "2024-04-30"
}
```

### 4. Generate Sample Report (Multiple Sheets) ⭐ NEW

```
POST /master/export-files/tariff/gas-allocation-report/multisheet/sample
```

**Request Body:**

```json
{
  "gasMeteringStation": "BPK1",
  "shipperName": "EGAT Shipper",
  "month": "April",
  "year": "2024",
  "startDate": "2024-04-01",
  "endDate": "2024-04-30"
}
```

### 5. Export Statement of Gas Allocation with Real Data (Multiple Sheets) ⭐ NEW

```
POST /master/export-files/tariff/gas-allocation-report/multisheet/real
```

**Request Body:**

```json
{
  "realData": [
    {
      "contract_code_id": 271,
      "term_type": {
        "id": 1,
        "name": "Long Term",
        "color": "#FFDDCE"
      },
      "publication": true,
      "request_number": 19541,
      "execute_timestamp": 1754482212,
      "gas_day": "2025-01-31",
      "contract": "2016-CLF-001",
      "shipper": "NGP-S16-001",
      "point": "RPCL",
      "point_type": "NOM",
      "customer_type": "IPP",
      "relation_point": "EXIT-F2-PTT",
      "relation_point_type": "CONTRACT",
      "area": "F2",
      "zone": "EAST-WEST",
      "entry_exit": "EXIT",
      "values": [
        {
          "tag": "allocatedValue",
          "value": 59220.482
        },
        {
          "tag": "nominatedValue",
          "value": 60190.23
        },
        {
          "tag": "contractCapacity",
          "value": 30000
        }
      ],
      "contractCapacity": 30000,
      "nominationValue": 60190.23,
      "allocatedValue": 59220.482
    }
  ],
  "gasMeteringStation": "BPK1",
  "shipperName": "EGAT Shipper",
  "month": "April",
  "year": "2024",
  "startDate": "2024-04-01",
  "endDate": "2024-04-30"
}
```

## Excel Format Features

### Header Section

- **Single Sheet**: Gas Metering Station (Bold, Left-aligned)
- **Multiple Sheets**: Gas Metering Station = Point Name (RPCL, IND-A1, etc.) (Bold, Left-aligned)
- Statement of Gas Allocation title with Shipper Name (Bold, Left-aligned)
- Month and Year (Bold, Left-aligned)

### Table Structure

- **6 columns with proper headers** (A-F)
- **Column A**: Date (1-30)
- **Column B**: Final Allocation (MMBTU)
- **Column C**: Statement of Gas Delivered (MMBTU)
- **Column D**: Gas Allocation (MMBTU)
- **Column E**: Sat. Std. Vol. Allocation (MMSCF)
- **Column F**: Remark
- Column widths optimized for content
- Border styling for all cells
- **2 header rows with gray background**

### Data Formatting

- Numbers with 4 decimal places for MMBTU columns
- Numbers with 6 decimal places for MMSCF column
- Right-aligned numbers
- Center-aligned dates
- Left-aligned remarks
- Empty cells show as empty string

### Table Headers

- **Main header**: "GAS ENERGY (MMBTU)" merged across columns B-D
- **Individual headers**: Each column has its own header
- **Merged cells**: Date, Sat. Std. Vol. Allocation, and Remark columns span 2 rows

### Total Row

- **Total row**: Calculates totals for all numeric columns with bold formatting
- **Total Final Allocation**: Sum of all Final Allocation values
- **Total Statement of Gas Delivered**: Sum of all Statement of Gas Delivered values
- **Total Gas Allocation**: Sum of all Gas Allocation values
- **Total Sat. Std. Vol. Allocation**: Sum of all Sat. Std. Vol. Allocation values

### Footer Section

- **Total Gas Energy for Commodity Charge (MMBTU)**: Shows rounded total from Final Allocation column
- **Integer format**: No decimal places for the footer total

## Usage Example

```typescript
// In your service or controller
import {ExportFileTariffCommodityService} from './export-file-tariff-commodity.service'

// Example: Export with real data
const gasAllocationData = [
  {
    date: 1,
    finalAllocation: 186447.18,
    statementOfGasDelivered: 273040.79,
    gasAllocation: 186447.18,
    satStdVolAllocation: 186.233115,
    remark: ''
  }
]

await this.exportFileTariffCommodityService.exportStatementOfGasAllocation(
  gasAllocationData,
  {
    gasMeteringStation:
      'BPK1',
    shipperName:
      'EGAT Shipper',
    month: 'April',
    year: '2024'
  },
  response
)

// Example: Generate sample data
const sampleData =
  this.exportFileTariffCommodityService.generateSampleData()

await this.exportFileTariffCommodityService.exportStatementOfGasAllocation(
  sampleData,
  {
    gasMeteringStation:
      'BPK1',
    shipperName:
      'EGAT Shipper',
    month: 'April',
    year: '2024'
  },
  response
)
```

## cURL Examples

### Export Gas Allocation Report (Single Sheet)

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/gas-allocation-report \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "date": 1,
        "finalAllocation": 186447.1800,
        "statementOfGasDelivered": 273040.7900,
        "gasAllocation": 186447.1800,
        "satStdVolAllocation": 186.233115,
        "remark": ""
      }
    ],
    "gasMeteringStation": "BPK1",
    "shipperName": "EGAT Shipper",
    "month": "April",
    "year": "2024"
  }' \
  --output "gas_allocation_report.xlsx"
```

### Generate Sample Report (Single Sheet)

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/gas-allocation-report/sample \
  -H "Content-Type: application/json" \
  -d '{
    "gasMeteringStation": "BPK1",
    "shipperName": "EGAT Shipper",
    "month": "April",
    "year": "2024"
  }' \
  --output "sample_gas_allocation_report.xlsx"
```

### Export Gas Allocation Report (Multiple Sheets) ⭐ NEW

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/gas-allocation-report/multisheet \
  -H "Content-Type: application/json" \
  -d '{
    "pointData": [
      {
        "point": "RPCL",
        "calc": 1865897,
        "calcNotRound": 1865897.1299999997,
        "tempDateArr": [
          {
            "date": 1,
            "finalAllocation": 186447.1800,
            "statementOfGasDelivered": 273040.7900,
            "gasAllocation": 186447.1800,
            "satStdVolAllocation": 186.233115,
            "remark": ""
          }
        ]
      },
      {
        "point": "IND-A1",
        "calc": 311292,
        "calcNotRound": 311291.9249999998,
        "tempDateArr": [
          {
            "date": 1,
            "finalAllocation": 186447.1800,
            "statementOfGasDelivered": 273040.7900,
            "gasAllocation": 186447.1800,
            "satStdVolAllocation": 186.233115,
            "remark": ""
          }
        ]
      }
    ],
    "gasMeteringStation": "BPK1",
    "shipperName": "EGAT Shipper",
    "month": "April",
    "year": "2024",
    "startDate": "2024-04-01",
    "endDate": "2024-04-30"
  }' \
  --output "gas_allocation_multisheet_report.xlsx"
```

### Generate Sample Report (Multiple Sheets) ⭐ NEW

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/gas-allocation-report/multisheet/sample \
  -H "Content-Type: application/json" \
  -d '{
    "gasMeteringStation": "BPK1",
    "shipperName": "EGAT Shipper",
    "month": "April",
    "year": "2024",
    "startDate": "2024-04-01",
    "endDate": "2024-04-30"
  }' \
  --output "sample_gas_allocation_multisheet_report.xlsx"
```

### Export Gas Allocation Report with Real Data (Multiple Sheets) ⭐ NEW

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/gas-allocation-report/multisheet/real \
  -H "Content-Type: application/json" \
  -d '{
    "realData": [
      {
        "contract_code_id": 271,
        "term_type": {
          "id": 1,
          "name": "Long Term",
          "color": "#FFDDCE"
        },
        "publication": true,
        "request_number": 19541,
        "execute_timestamp": 1754482212,
        "gas_day": "2025-01-31",
        "contract": "2016-CLF-001",
        "shipper": "NGP-S16-001",
        "point": "RPCL",
        "point_type": "NOM",
        "customer_type": "IPP",
        "relation_point": "EXIT-F2-PTT",
        "relation_point_type": "CONTRACT",
        "area": "F2",
        "zone": "EAST-WEST",
        "entry_exit": "EXIT",
        "values": [
          {
            "tag": "allocatedValue",
            "value": 59220.482
          },
          {
            "tag": "nominatedValue",
            "value": 60190.23
          },
          {
            "tag": "contractCapacity",
            "value": 30000
          }
        ],
        "contractCapacity": 30000,
        "nominationValue": 60190.23,
        "allocatedValue": 59220.482
      }
    ],
    "gasMeteringStation": "BPK1",
    "shipperName": "EGAT Shipper",
    "month": "April",
    "year": "2024",
    "startDate": "2024-04-01",
    "endDate": "2024-04-30"
  }' \
  --output "real_gas_allocation_multisheet_report.xlsx"
```

## Dependencies

- `exceljs` - สำหรับสร้าง Excel files
- `class-validator` - สำหรับ validation
- `class-transformer` - สำหรับ transformation

## Multiple Sheets Features ⭐ NEW

### Key Features

- **Multiple Sheets**: สร้าง sheet แยกตาม point (RPCL, IND-A1, etc.)
- **Point-based Data**: แต่ละ sheet แสดงข้อมูลจาก `tempDateArr` ของ point นั้น
- **Same Format**: ทุก sheet ใช้ format เดียวกันกับ single sheet
- **Date Range**: รองรับ `startDate` และ `endDate` สำหรับ gas_day range
- **Calculated Totals**: แต่ละ point มี `calc` และ `calcNotRound` values

### Sheet Structure

- **Sheet Name**: ใช้ชื่อ point เป็น sheet name (RPCL, IND-A1)
- **Gas Metering Station**: ใช้ชื่อ point เป็น gasMeteringStation ใน header ของแต่ละ sheet
- **Data Source**: ข้อมูลมาจาก `tempDateArr` ของแต่ละ point
- **Format Consistency**: ทุก sheet มี format เดียวกัน
- **Independent Totals**: แต่ละ sheet คำนวณ total แยกกัน

### Data Flow

1. **Input**: Array ของ `GasAllocationPointData` objects หรือ `RealGasAllocationData` objects
2. **Processing**:
   - **Real Data**: แปลงข้อมูลจริงผ่าน `convertRealDataToExcelFormat()` method
   - **Sample Data**: ใช้ข้อมูลตัวอย่างที่สร้างขึ้น
   - Loop ผ่านแต่ละ point และสร้าง sheet
3. **Output**: Excel file พร้อม multiple sheets

### Real Data Mapping ⭐ NEW

- **Input Format**: ข้อมูลจริงจาก API ที่มีโครงสร้างซับซ้อน
- **Mapping Process**:
  - `gas_day` → `date` (extract day of month)
  - `allocatedValue` → `finalAllocation` และ `gasAllocation`
  - `nominationValue` → `statementOfGasDelivered`
  - `allocatedValue` → `satStdVolAllocation` (with conversion factor)
  - `point` → sheet name และ gasMeteringStation
- **Data Grouping**: จัดกลุ่มข้อมูลตาม `point`
- **Date Sorting**: เรียงลำดับตาม `gas_day` (earliest first)

## Notes

- Service ใช้ ExcelJS library สำหรับสร้าง Excel files
- รองรับ merged cells และ styling
- **Single Sheet**: ไฟล์ที่ export จะมีชื่อตาม format: `Statement_of_Gas_Allocation_{ShipperName}_{Month}_{Year}.xlsx`
- **Multiple Sheets**: ไฟล์ที่ export จะมีชื่อตาม format: `Statement_of_Gas_Allocation_MultiSheet_{ShipperName}_{Month}_{Year}.xlsx`
- ข้อมูลจะถูกจัดรูปแบบตามมาตรฐานของ Gas Metering Station
- **Multiple Sheets**: รองรับการสร้าง sheet หลายๆ sheet ในไฟล์เดียวตาม point
