export interface ImbalanceCapacityReportData {
  date: string
  dayOfWeek: string
  gasEntry: number
  gasExit: number
  fuelGas?: number | null
  balancingGas?: number | null
  changeMinInventory?:
    | number
    | null
  shrinkageGas?: number | null
  commissioning?:
    | number
    | null
  gasVent?: number | null
  otherGas?: number | null
  imbalance: number
  imbalancePercentage: number
  imbalanceQuantityOver5Percent?:
    | number
    | null
}

export interface ReportedBy {
  name: string
  position: string
  division: string
}

export interface ImbalanceCapacityReportParams {
  companyName: string
  shipperName: string
  month: string
  year: string
  reportedBy: ReportedBy
  manager: ReportedBy
}

// Entities for Gas Allocation (Commodity) Report
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

// Entities for Multiple Sheets Gas Allocation Report
export interface GasAllocationPointData {
  point: string
  calc: number
  calcNotRound: number
  tempDateArr: GasAllocationData[]
}

export interface GasAllocationMultiSheetParams {
  gasMeteringStation: string
  shipperName: string
  month: string
  year: string
  startDate: string // gas_day start date
  endDate: string // gas_day end date
}

// Entities for Gas Delivery Report (A2)
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

// Entities for Daily Overview: Commodity Charge (B)
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

export interface ImbalanceCapacityReportSummary {
  totalGasEntry: number
  totalGasExit: number
  totalChangeMinInventory: number
  totalImbalance: number
  totalImbalanceQuantityOver5Percent: number
  daysWithImbalanceOver5Percent: number
  averageImbalancePercentage: number
}

export interface ExportFileTariffResponse {
  success: boolean
  message: string
  fileName?: string
  fileSize?: number
  downloadUrl?: string
}
