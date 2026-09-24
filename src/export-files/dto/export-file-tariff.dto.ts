import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsObject,
  IsBoolean
} from 'class-validator'
import {Type} from 'class-transformer'

export class ImbalanceCapacityReportDataDto {
  @IsString()
  date: string

  @IsString()
  dayOfWeek: string

  @IsNumber()
  gasEntry: number

  @IsNumber()
  gasExit: number

  @IsOptional()
  @IsNumber()
  fuelGas?: number | null

  @IsOptional()
  @IsNumber()
  balancingGas?: number | null

  @IsOptional()
  @IsNumber()
  changeMinInventory?:
    | number
    | null

  @IsOptional()
  @IsNumber()
  shrinkageGas?: number | null

  @IsOptional()
  @IsNumber()
  commissioning?:
    | number
    | null

  @IsOptional()
  @IsNumber()
  gasVent?: number | null

  @IsOptional()
  @IsNumber()
  otherGas?: number | null

  @IsNumber()
  imbalance: number

  @IsNumber()
  imbalancePercentage: number

  @IsOptional()
  @IsNumber()
  imbalanceQuantityOver5Percent?:
    | number
    | null
}

export class ReportedByDto {
  @IsString()
  name: string

  @IsString()
  position: string

  @IsString()
  division: string
}

export class ExportImbalanceCapacityReportDto {
  @IsNumber()
  id: number

  @IsArray()
  @ValidateNested({
    each: true
  })
  @Type(
    () =>
      ImbalanceCapacityReportDataDto
  )
  data: ImbalanceCapacityReportDataDto[]

  @IsString()
  companyName: string

  @IsString()
  shipperName: string

  @IsString()
  month: string

  @IsString()
  year: string

  @ValidateNested()
  @Type(() => ReportedByDto)
  reportedBy: ReportedByDto

  @ValidateNested()
  @Type(() => ReportedByDto)
  manager: ReportedByDto
}

export class RealImbalanceDataDto {
  @IsString()
  gas_day: string

  @IsNumber()
  entry: number

  @IsNumber()
  exit: number

  @IsOptional()
  @IsNumber()
  fuel_gas?: number | null

  @IsOptional()
  @IsNumber()
  balancing_gas?:
    | number
    | null

  @IsOptional()
  @IsNumber()
  change_in_ivent?:
    | number
    | null

  @IsOptional()
  @IsNumber()
  shrinkage?: number | null

  @IsOptional()
  @IsNumber()
  commissioning?:
    | number
    | null

  @IsOptional()
  @IsNumber()
  gas_vent?: number | null

  @IsOptional()
  @IsNumber()
  other_gas?: number | null

  @IsNumber()
  imbalance: number

  @IsOptional()
  @IsNumber()
  imbalance_over_5_percen?:
    | number
    | null
}

export class ExportRealImbalanceCapacityReportDto {
  @IsNumber()
  id: number

  @IsArray()
  @ValidateNested({
    each: true
  })
  @Type(
    () => RealImbalanceDataDto
  )
  data: RealImbalanceDataDto[]

  @IsString()
  companyName: string

  @IsString()
  shipperName: string

  @IsString()
  month: string

  @IsString()
  year: string

  @ValidateNested()
  @Type(() => ReportedByDto)
  reportedBy: ReportedByDto

  @ValidateNested()
  @Type(() => ReportedByDto)
  manager: ReportedByDto
}

export class GenerateSampleReportDto {
  @IsString()
  companyName: string

  @IsString()
  shipperName: string

  @IsString()
  month: string

  @IsString()
  year: string

  @ValidateNested()
  @Type(() => ReportedByDto)
  reportedBy: ReportedByDto

  @ValidateNested()
  @Type(() => ReportedByDto)
  manager: ReportedByDto
}

// DTOs for Gas Allocation (Commodity) Report
export class GasAllocationDataDto {
  @IsNumber()
  date: number

  @IsNumber()
  finalAllocation: number

  @IsNumber()
  statementOfGasDelivered: number

  @IsNumber()
  gasAllocation: number

  @IsNumber()
  satStdVolAllocation: number

  @IsOptional()
  @IsString()
  remark?: string
}

export class ExportGasAllocationReportDto {
  @IsArray()
  @ValidateNested({
    each: true
  })
  @Type(
    () => GasAllocationDataDto
  )
  data: GasAllocationDataDto[]

  @IsString()
  gasMeteringStation: string

  @IsString()
  shipperName: string

  @IsString()
  month: string

  @IsString()
  year: string
}

export class GenerateGasAllocationSampleDto {
  @IsString()
  gasMeteringStation: string

  @IsString()
  shipperName: string

  @IsString()
  month: string

  @IsString()
  year: string
}

// DTOs for Multiple Sheets Gas Allocation Report
export class GasAllocationPointDataDto {
  @IsString()
  point: string

  @IsNumber()
  calc: number

  @IsNumber()
  calcNotRound: number

  @IsArray()
  @ValidateNested({
    each: true
  })
  @Type(
    () => GasAllocationDataDto
  )
  tempDateArr: GasAllocationDataDto[]
}

export class ExportGasAllocationMultiSheetReportDto {
  @IsNumber()
  id: number

  @IsArray()
  @ValidateNested({
    each: true
  })
  @Type(
    () =>
      GasAllocationPointDataDto
  )
  pointData: GasAllocationPointDataDto[]

  @IsString()
  gasMeteringStation: string

  @IsString()
  shipperName: string

  @IsString()
  month: string

  @IsString()
  year: string

  @IsString()
  startDate: string

  @IsString()
  endDate: string
}

export class GenerateGasAllocationMultiSheetSampleDto {
  @IsString()
  gasMeteringStation: string

  @IsString()
  shipperName: string

  @IsString()
  month: string

  @IsString()
  year: string

  @IsString()
  startDate: string

  @IsString()
  endDate: string
}

// DTOs for Real Data Gas Allocation Report
export class RealGasAllocationDataDto {
  @IsNumber()
  contract_code_id: number

  @IsObject()
  term_type: {
    id: number
    name: string
    color: string
  }

  @IsBoolean()
  publication: boolean

  @IsOptional()
  @IsNumber()
  id?: number

  @IsNumber()
  request_number: number

  @IsNumber()
  execute_timestamp: number

  @IsString()
  gas_day: string

  @IsString()
  contract: string

  @IsString()
  shipper: string

  @IsString()
  point: string

  @IsString()
  point_type: string

  @IsString()
  customer_type: string

  @IsString()
  relation_point: string

  @IsString()
  relation_point_type: string

  @IsString()
  area: string

  @IsString()
  zone: string

  @IsString()
  entry_exit: string

  @IsArray()
  values: Array<{
    tag: string
    value: number
  }>

  @IsObject()
  area_obj: any

  @IsObject()
  zone_obj: any

  @IsOptional()
  @IsObject()
  group?: any

  @IsNumber()
  contractCapacity: number

  @IsNumber()
  nominationValue: number

  @IsNumber()
  allocatedValue: number

  @IsObject()
  entry_exit_obj: any

  @IsOptional()
  @IsObject()
  findAllocationReport?: any
}

export class ExportGasAllocationMultiSheetRealDataDto {
  @IsArray()
  @ValidateNested({
    each: true
  })
  @Type(
    () =>
      RealGasAllocationDataDto
  )
  realData: RealGasAllocationDataDto[]

  @IsString()
  gasMeteringStation: string

  @IsString()
  shipperName: string

  @IsString()
  month: string

  @IsString()
  year: string

  @IsString()
  startDate: string

  @IsString()
  endDate: string
}

// DTOs for Gas Delivery Report (A2)
export class GasDeliveryDataDto {
  @IsString()
  fid: string

  @IsString()
  name: string

  @IsOptional()
  @IsNumber()
  volumeMMSCF?: number | null

  @IsOptional()
  @IsNumber()
  energyMMBTU?: number | null

  @IsOptional()
  @IsString()
  region?: string | null

  @IsString()
  group: string

  @IsString()
  zone: string
}

export class ExportGasDeliveryReportDto {
  @IsArray()
  @ValidateNested({
    each: true
  })
  @Type(
    () => GasDeliveryDataDto
  )
  data: GasDeliveryDataDto[]

  @IsString()
  zone: string

  @IsString()
  month: string

  @IsString()
  year: string
}

export class GenerateGasDeliverySampleDto {
  @IsString()
  zone: string

  @IsString()
  month: string

  @IsString()
  year: string
}

// DTOs for Daily Overview: Commodity Charge (B)
export class CommodityChargeDataDto {
  @IsString()
  gasDay: string

  @IsNumber()
  dailyAllocatedExitValue: number
}

export class ExportCommodityChargeReportDto {
  @IsNumber()
  id: number

  @IsArray()
  @ValidateNested({
    each: true
  })
  @Type(
    () =>
      CommodityChargeDataDto
  )
  data: CommodityChargeDataDto[]

  @IsString()
  month: string

  @IsString()
  year: string

  @IsString()
  tariffId: string

  @IsString()
  shipperName: string

  @IsString()
  contractCode: string
}

export class GenerateCommodityChargeSampleDto {
  @IsString()
  month: string

  @IsString()
  year: string

  @IsString()
  tariffId: string

  @IsString()
  shipperName: string

  @IsString()
  contractCode: string
}
