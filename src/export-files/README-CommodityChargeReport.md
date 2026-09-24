# Daily Overview: Commodity Charge Export Service

## Overview

Service สำหรับ export Excel file ตาม format ของ Daily Overview: Commodity Charge

## Files Created

- `export-file-tariff-commodity-b.service.ts` - Main service สำหรับ export Excel
- Updated `dto/export-file-tariff.dto.ts` - เพิ่ม DTOs สำหรับ Commodity Charge Report
- Updated `entities/export-file-tariff.entity.ts` - เพิ่ม Entities สำหรับ Commodity Charge Report
- Updated `export-files.module.ts` - เพิ่ม b service
- Updated `export-files.controller.ts` - เพิ่ม endpoints

## API Endpoints

### 1. Export Daily Overview: Commodity Charge

```
POST /master/export-files/tariff/commodity-charge-report
```

**Request Body:**

```json
{
  "data": [
    {
      "gasDay": "01/07/2025",
      "dailyAllocatedExitValue": 181343
    },
    {
      "gasDay": "02/07/2025",
      "dailyAllocatedExitValue": 181343
    }
  ],
  "month": "October",
  "year": "2024",
  "tariffId": "20241021-TAR-0001-B (13:08:45)",
  "shipperName": "PTT",
  "contractCode": "2022-CLF-018"
}
```

### 2. Generate Sample Report

```
POST /master/export-files/tariff/commodity-charge-report/sample
```

**Request Body:**

```json
{
  "month": "October",
  "year": "2024",
  "tariffId": "20241021-TAR-0001-B (13:08:45)",
  "shipperName": "PTT",
  "contractCode": "2022-CLF-018"
}
```

## Excel Format Features

### Header Section

- **Title**: "Daily Overview : Commodity Charge" (Bold, Blue color, Left-aligned)
- **Header Information Row**:
  - **Month/Year**: "October 2024" (Bold, Left-aligned)
  - **Tariff ID**: "20241021-TAR-0001-B (13:08:45)" (Bold, Left-aligned)
  - **Shipper Name**: "PTT" (Bold, Left-aligned)
  - **Contract Code**: "2022-CLF-018" (Bold, Left-aligned)

### Table Structure

- **3 columns with proper headers** (A-C)
- **Column A**: Gas Day
- **Column B**: Daily Allocated Exit Value (MMBTU)
- **Column C**: Detail (empty column for spacing)
- Column widths optimized for content
- Border styling for all cells
- **Gray background** for headers

### Data Formatting

- **Gas Day**: Center-aligned text (DD/MM/YYYY format)
- **Daily Allocated Exit Value**: Numbers with comma separator, right-aligned
- **Detail**: Empty column with border styling

### Total Row

- **Total row**: Calculates total for Daily Allocated Exit Value with light yellow background
- **Total Value**: Sum of all Daily Allocated Exit Value with comma separator
- **Total label**: "Total" (Center-aligned, Bold)

## Usage Example

```typescript
// In your service or controller
import {ExportFileTariffCommodityBService} from './export-file-tariff-commodity-b.service'

// Example: Export with real data
const commodityChargeData = [
  {
    gasDay: '01/07/2025',
    dailyAllocatedExitValue: 181343
  },
  {
    gasDay: '02/07/2025',
    dailyAllocatedExitValue: 181343
  }
]

await this.exportFileTariffCommodityBService.exportCommodityChargeReport(
  commodityChargeData,
  {
    month: 'October',
    year: '2024',
    tariffId:
      '20241021-TAR-0001-B (13:08:45)',
    shipperName: 'PTT',
    contractCode:
      '2022-CLF-018'
  },
  response
)

// Example: Generate sample data
const sampleData =
  this.exportFileTariffCommodityBService.generateSampleData()

await this.exportFileTariffCommodityBService.exportCommodityChargeReport(
  sampleData,
  {
    month: 'October',
    year: '2024',
    tariffId:
      '20241021-TAR-0001-B (13:08:45)',
    shipperName: 'PTT',
    contractCode:
      '2022-CLF-018'
  },
  response
)
```

## cURL Examples

### Export Daily Overview: Commodity Charge

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/commodity-charge-report \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "gasDay": "01/07/2025",
        "dailyAllocatedExitValue": 181343
      },
      {
        "gasDay": "02/07/2025",
        "dailyAllocatedExitValue": 181343
      }
    ],
    "month": "October",
    "year": "2024",
    "tariffId": "20241021-TAR-0001-B (13:08:45)",
    "shipperName": "PTT",
    "contractCode": "2022-CLF-018"
  }' \
  --output "commodity_charge_report.xlsx"
```

### Generate Sample Report

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/commodity-charge-report/sample \
  -H "Content-Type: application/json" \
  -d '{
    "month": "October",
    "year": "2024",
    "tariffId": "20241021-TAR-0001-B (13:08:45)",
    "shipperName": "PTT",
    "contractCode": "2022-CLF-018"
  }' \
  --output "sample_commodity_charge_report.xlsx"
```

## Sample Data Structure

The service includes sample data that matches the format shown in the image:

```typescript
{
  gasDay: '01/07/2025',
  dailyAllocatedExitValue: 181343
}
```

## Dependencies

- `exceljs` - สำหรับสร้าง Excel files
- `class-validator` - สำหรับ validation
- `class-transformer` - สำหรับ transformation

## Notes

- Service ใช้ ExcelJS library สำหรับสร้าง Excel files
- รองรับ merged cells และ styling
- ไฟล์ที่ export จะมีชื่อตาม format: `Daily_Overview_Commodity_Charge_{Month}_{Year}.xlsx`
- ข้อมูลจะถูกจัดรูปแบบตามมาตรฐานของ Daily Overview: Commodity Charge
- Total row มี light yellow background highlight
- ไม่รวมปุ่ม "Export" และ "Details..." ตามที่ระบุ
