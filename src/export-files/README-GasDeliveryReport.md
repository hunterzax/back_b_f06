# Gas Delivery Report Export Service

## Overview

Service สำหรับ export Excel file ตาม format ของ Gas Delivery Report

## Files Created

- `export-file-tariff-commodity-a2.service.ts` - Main service สำหรับ export Excel
- Updated `dto/export-file-tariff.dto.ts` - เพิ่ม DTOs สำหรับ Gas Delivery Report
- Updated `entities/export-file-tariff.entity.ts` - เพิ่ม Entities สำหรับ Gas Delivery Report
- Updated `export-files.module.ts` - เพิ่ม a2 service
- Updated `export-files.controller.ts` - เพิ่ม endpoints

## API Endpoints

### 1. Export Gas Delivery Report

```
POST /master/export-files/tariff/gas-delivery-report
```

**Request Body:**

```json
{
  "data": [
    {
      "fid": "BCP_1",
      "name": "บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)",
      "volumeMMSCF": 708.14184,
      "energyMMBTU": 708654,
      "region": "6",
      "group": "IND",
      "zone": "Zone 3"
    },
    {
      "fid": "RES-OC",
      "name": "Fuel gas OC residence",
      "volumeMMSCF": null,
      "energyMMBTU": null,
      "region": "6",
      "group": "IND",
      "zone": "Zone 3"
    }
  ],
  "zone": "Zone 3",
  "month": "April",
  "year": "2024"
}
```

### 2. Generate Sample Report

```
POST /master/export-files/tariff/gas-delivery-report/sample
```

**Request Body:**

```json
{
  "zone": "Zone 3",
  "month": "April",
  "year": "2024"
}
```

## Excel Format Features

### Header Section

- **Title**: "Gas Delivery Report for {Zone} Month {Month} Year {Year}" (Bold, Center-aligned, Merged across columns A-G)

### Table Structure

- **7 columns with proper headers** (A-G)
- **Column A**: FID
- **Column B**: NAME
- **Column C**: Volume (MMSCF)
- **Column D**: Energy (MMBTU)
- **Column E**: Region
- **Column F**: Group
- **Column G**: Zone
- Column widths optimized for content
- Border styling for all cells
- **Gray background** for headers

### Data Formatting

- **Volume (MMSCF)**: Numbers with 6 decimal places, right-aligned, or "-" for null values
- **Energy (MMBTU)**: Numbers with comma separator, right-aligned, or "-" for null values
- **FID**: Left-aligned text
- **NAME**: Left-aligned text
- **Region, Group, Zone**: Center-aligned text
- Empty cells show as empty string

### Total Row

- **Total row**: Calculates totals for Volume and Energy with yellow background highlight
- **Total Volume (MMSCF)**: Sum of all Volume values with 6 decimal places
- **Total Energy (MMBTU)**: Sum of all Energy values with comma separator
- **Total label**: "รวมปริมาณก๊าซ {Zone}" (Total Gas Volume {Zone})

## Usage Example

```typescript
// In your service or controller
import {ExportFileTariffCommodityA2Service} from './export-file-tariff-commodity-a2.service'

// Example: Export with real data
const gasDeliveryData = [
  {
    fid: 'BCP_1',
    name: 'บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)',
    volumeMMSCF: 708.14184,
    energyMMBTU: 708654,
    region: '6',
    group: 'IND',
    zone: 'Zone 3'
  }
]

await this.exportFileTariffCommodityA2Service.exportGasDeliveryReport(
  gasDeliveryData,
  {
    zone: 'Zone 3',
    month: 'April',
    year: '2024'
  },
  response
)

// Example: Generate sample data
const sampleData =
  this.exportFileTariffCommodityA2Service.generateSampleData()

await this.exportFileTariffCommodityA2Service.exportGasDeliveryReport(
  sampleData,
  {
    zone: 'Zone 3',
    month: 'April',
    year: '2024'
  },
  response
)
```

## cURL Examples

### Export Gas Delivery Report

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/gas-delivery-report \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "fid": "BCP_1",
        "name": "บริษัท บางจาก คอร์ปอเรชั่น จำกัด (มหาชน)",
        "volumeMMSCF": 708.141840,
        "energyMMBTU": 708654,
        "region": "6",
        "group": "IND",
        "zone": "Zone 3"
      }
    ],
    "zone": "Zone 3",
    "month": "April",
    "year": "2024"
  }' \
  --output "gas_delivery_report.xlsx"
```

### Generate Sample Report

```bash
curl -k -X POST https://localhost:4001/master/export-files/tariff/gas-delivery-report/sample \
  -H "Content-Type: application/json" \
  -d '{
    "zone": "Zone 3",
    "month": "April",
    "year": "2024"
  }' \
  --output "sample_gas_delivery_report.xlsx"
```

## Sample Data Structure

The service includes sample data that matches the format shown in the image:

```typescript
{
  fid: 'RES-OC',
  name: 'Fuel gas OC residence',
  volumeMMSCF: null,
  energyMMBTU: null,
  region: '6',
  group: 'IND',
  zone: 'Zone 3'
}
```

## Dependencies

- `exceljs` - สำหรับสร้าง Excel files
- `class-validator` - สำหรับ validation
- `class-transformer` - สำหรับ transformation

## Notes

- Service ใช้ ExcelJS library สำหรับสร้าง Excel files
- รองรับ merged cells และ styling
- ไฟล์ที่ export จะมีชื่อตาม format: `Gas_Delivery_Report_{Zone}_{Month}_{Year}.xlsx`
- ข้อมูลจะถูกจัดรูปแบบตามมาตรฐานของ Gas Delivery Report
- รองรับ null values สำหรับ Volume และ Energy (แสดงเป็น "-")
- Total row มี yellow background highlight
