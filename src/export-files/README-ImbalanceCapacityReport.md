# Imbalance Capacity Report Export Service

## Overview

Service สำหรับ export Excel file ตาม format ของ Imbalance Capacity Report ของ PTT Public Company Limited

## Files Created

- `export-file-tariff.service.ts` - Main service สำหรับ export Excel
- `dto/export-file-tariff.dto.ts` - Data Transfer Objects
- `entities/export-file-tariff.entity.ts` - Type definitions
- Updated `export-files.module.ts` - เพิ่ม service ใหม่
- Updated `export-files.controller.ts` - เพิ่ม endpoints

## API Endpoints

### 1. Export Imbalance Capacity Report (Custom Format)

```
POST /master/export-files/tariff/imbalance-capacity-report
```

### 2. Export Real Imbalance Capacity Report (Real Data Format)

```
POST /master/export-files/tariff/imbalance-capacity-report/real
```

**Request Body for Real Data Format:**

```json
{
  "data": [
    {
      "gas_day": "2025-01-31",
      "entry": 99940.42777,
      "exit": 100001.69609,
      "fuel_gas": null,
      "balancing_gas": null,
      "change_in_ivent": 1000,
      "shrinkage": null,
      "commissioning": null,
      "gas_vent": null,
      "other_gas": null,
      "imbalance": 390.8034414,
      "imbalance_over_5_percen": 290531.20323
    },
    {
      "gas_day": "2025-01-30",
      "entry": 99940.42777,
      "exit": 100001.69609,
      "fuel_gas": null,
      "balancing_gas": null,
      "change_in_ivent": 1000,
      "shrinkage": null,
      "commissioning": null,
      "gas_vent": null,
      "other_gas": null,
      "imbalance": 732.75645237,
      "imbalance_over_5_percen": 632280.50531
    }
  ],
  "companyName": "PTT Public Company Limited",
  "shipperName": "EGAT Shipper",
  "month": "Jan",
  "year": "2025",
  "reportedBy": {
    "name": "Ms.Wipada Yenyin",
    "position": "Senior Engineer",
    "division": "Transmission Contracts & Regulatory Management Division"
  },
  "manager": {
    "name": "Ms. Tanatchaporn",
    "position": "Manager of",
    "division": "Transmission Contracts & Regulatory Management Division"
  }
}
```

**Request Body for Custom Format:**

```json
{
  "data": [
    {
      "date": "1",
      "dayOfWeek": "Mon",
      "gasEntry": 150000.0,
      "gasExit": 160000.0,
      "fuelGas": null,
      "balancingGas": null,
      "changeMinInventory": -250.0,
      "shrinkageGas": null,
      "commissioning": null,
      "gasVent": null,
      "otherGas": null,
      "imbalance": 10000.0,
      "imbalancePercentage": 6.67,
      "imbalanceQuantityOver5Percent": 10000.0
    }
  ],
  "companyName": "PTT Public Company Limited",
  "shipperName": "EGAT Shipper",
  "month": "Apr",
  "year": "2024",
  "reportedBy": {
    "name": "Ms.Wipada Yenyin",
    "position": "Senior Engineer",
    "division": "Transmission Contracts & Regulatory Management Division"
  },
  "manager": {
    "name": "Ms. Tanatchaporn",
    "position": "Manager of",
    "division": "Transmission Contracts & Regulatory Management Division"
  }
}
```

### 3. Generate Sample Report

```
POST /master/export-files/tariff/imbalance-capacity-report/sample
```

**Request Body:**

```json
{
  "companyName": "PTT Public Company Limited",
  "shipperName": "EGAT Shipper",
  "month": "Apr",
  "year": "2024",
  "reportedBy": {
    "name": "Ms.Wipada Yenyin",
    "position": "Senior Engineer",
    "division": "Transmission Contracts & Regulatory Management Division"
  },
  "manager": {
    "name": "Ms. Tanatchaporn",
    "position": "Manager of",
    "division": "Transmission Contracts & Regulatory Management Division"
  }
}
```

## Excel Format Features

### Header Section

- Company Name (Bold, Center)
- Report Title with Shipper Name (Bold, Center)
- Period (Month Year) (Bold, Center)

### Table Structure

- **14 columns with proper headers** (A-N)
- **Column A-B: Date (merged A5:B5)**
  - **Column A: DayOfWeek sub-header**
  - **Column B: Date (วันที่) sub-header**
- **Columns C-N: Data columns** (Gas Entry, Gas Exit, etc.)
- Column widths optimized for content
- Border styling for all cells
- **2 header rows with gray background**

### Data Formatting

- Numbers with 4 decimal places
- Negative numbers in parentheses
- **Excel percentage format for Imbalance % column** (0.00% format)
- **Light red background highlighting for imbalance % over ±5%**
- **Dark red text for highlighted cells**
- Empty cells show as "-"
- **Data automatically sorted by gas_day (earliest date first)**

### Conditional Formatting

- **Imbalance Quantity over ±5% (Column N) highlighted with light red background and dark red text when value > 0**
- **Imbalance % (Column M) also highlighted in same row when Imbalance Quantity over ±5% > 0**
- Both columns use light red background (#FFFFCCCC) and dark red text (#FFCC0000)

### Total Rows

- **Total row**: Calculates totals for relevant columns with bold formatting
- **Total MMBTU row**: Shows sum of Gas Entry + Gas Exit
- **ประมาณความไม่สมดุลเกินเกณฑ์ ±5% row**: Shows rounded total from Imbalance Quantity over ±5% column

### Footer Section

- **"Value" text in red color**
- Thai text for threshold information
- **Structured Reported By sections** (left and right aligned):
  - "Reported By" (bold)
  - Name in parentheses
  - Position with "of"
  - Division name
- Total imbalance quantity over ±5% in MMBTU

## Usage Example

```typescript
// In your service or controller
import {ExportFileTariffService} from './export-file-tariff.service'

// Example 1: Export with real data format
const realData = [
  {
    gas_day: '2025-01-31',
    entry: 99940.42777,
    exit: 100001.69609,
    fuel_gas: null,
    balancing_gas: null,
    change_in_ivent: 1000,
    shrinkage: null,
    commissioning: null,
    gas_vent: null,
    other_gas: null,
    imbalance: 390.8034414,
    imbalance_over_5_percen: 290531.20323
  }
]

await this.exportFileTariffService.exportRealImbalanceCapacityReport(
  realData,
  {
    companyName:
      'PTT Public Company Limited',
    shipperName:
      'EGAT Shipper',
    month: 'Jan',
    year: '2025',
    reportedBy: {
      name: 'Ms.Wipada Yenyin',
      position:
        'Senior Engineer',
      division:
        'Transmission Contracts & Regulatory Management Division'
    },
    manager: {
      name: 'Ms. Tanatchaporn',
      position: 'Manager of',
      division:
        'Transmission Contracts & Regulatory Management Division'
    }
  },
  response
)

// Example 2: Export with custom format
const customData =
  this.exportFileTariffService.generateSampleData()

await this.exportFileTariffService.exportImbalanceCapacityReport(
  customData,
  {
    companyName:
      'PTT Public Company Limited',
    shipperName:
      'EGAT Shipper',
    month: 'Apr',
    year: '2024',
    reportedBy: {
      name: 'Ms.Wipada Yenyin',
      position:
        'Senior Engineer',
      division:
        'Transmission Contracts & Regulatory Management Division'
    },
    manager: {
      name: 'Ms. Tanatchaporn',
      position: 'Manager of',
      division:
        'Transmission Contracts & Regulatory Management Division'
    }
  },
  response
)
```

## cURL Examples

### Export Real Data Format

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/imbalance-capacity-report/real \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "gas_day": "2025-01-31",
        "entry": 99940.42777,
        "exit": 100001.69609,
        "fuel_gas": null,
        "balancing_gas": null,
        "change_in_ivent": 1000,
        "shrinkage": null,
        "commissioning": null,
        "gas_vent": null,
        "other_gas": null,
        "imbalance": 390.8034414,
        "imbalance_over_5_percen": 290531.20323
      }
    ],
    "companyName": "PTT Public Company Limited",
    "shipperName": "EGAT Shipper",
    "month": "Jan",
    "year": "2025",
    "reportedBy": {
      "name": "Ms.Wipada Yenyin",
      "position": "Senior Engineer",
      "division": "Transmission Contracts & Regulatory Management Division"
    },
    "manager": {
      "name": "Ms. Tanatchaporn",
      "position": "Manager of",
      "division": "Transmission Contracts & Regulatory Management Division"
    }
  }' \
  --output "real_imbalance_report.xlsx"
```

### Generate Sample Report

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/imbalance-capacity-report/sample \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "PTT Public Company Limited",
    "shipperName": "EGAT Shipper",
    "month": "Jan",
    "year": "2025",
    "reportedBy": {
      "name": "Ms.Wipada Yenyin",
      "position": "Senior Engineer",
      "division": "Transmission Contracts & Regulatory Management Division"
    },
    "manager": {
      "name": "Ms. Tanatchaporn",
      "position": "Manager of",
      "division": "Transmission Contracts & Regulatory Management Division"
    }
  }' \
  --output "sample_imbalance_report.xlsx"
```

## Dependencies

- `exceljs` - สำหรับสร้าง Excel files
- `dayjs` - สำหรับจัดการวันที่
- `class-validator` - สำหรับ validation
- `class-transformer` - สำหรับ transformation

## Notes

- Service ใช้ ExcelJS library สำหรับสร้าง Excel files
- รองรับ conditional formatting และ styling
- ไฟล์ที่ export จะมีชื่อตาม format: `Imbalance_Capacity_Report_{ShipperName}_{Month}_{Year}.xlsx`
- รองรับ HTTPS response streaming
