type timeShowDataType = {
  time: string;
  value: number | null;
  valueMmscfd: number | null;
  valuePerHour: number | null;
  valueMmscfh: number | null;
  heatingValueFromNomList?: {sumHvMultiplyVi: number, sumVi: number, eachHour?: Map<number, {sumVi: number, sumHvMultiplyVi: number, sumSgMultiplyVi: number}>}[];
  heatingValueFromAdjust: number | null;
  volumeFromAdjust: number | null;
  energyFromAdjust?: number | null;
  isAdjust?: boolean;
}

type adjustNomDataType = {
  gas_day: string;
  group_id: number;
  shipper_name: string;
  shipper_id_name: string;
  contract: string;
  contract_code_id: number;
  nomination_id?: number;
  nomination_code?: string;
  zone_text: string;
  area_text: string;
  unit?: string;
  point: string;
  entryExit: string;
  wi?: number | null;
  hv?: number | null;
  sg?: number | null;
  total: number;
  totalMmscfd?: number | null;
  totalType: string;
  nomination_type_id?: number;
  timeShow: timeShowDataType[];
  sumActiveValuePerHour?: number | null;
  sumActiveValueMmscfh?: number | null;
}

type areaHvDataType = {
  // point: string;
  zone_text: string;
  area_text: string;
  entryExit: string;
  sumVi: number | null;
  sumHvMultiplyVi: number | null;
  sumSgMultiplyVi: number | null;
  eachHour?: Map<
    number,
    {
      sumVi: number | null;
      sumHvMultiplyVi: number | null;
      sumSgMultiplyVi: number | null;
    }
  > | null;
}

type bvw10Ra6ViAggregateType = {
  sumVi: number | null;
  eachHour: Map<number, { sumVi: number | null }>;
};


type balanceReportDataType = {
  "Entry Point": number | null;
  "Exit": number | null;
  "Entry - Exit": number | null;
  "Fuel Gas": number | null;
  "Balancing Gas": number | null;
  "Change Min Inventory": number | null;
  "Shrinkagate": number | null;
  "Commissioning": number | null;
  "Gas Vent": number | null;
  "Other Gas": number | null;
  "Imbalance": number | null;
  "ImbalancePercen": number | null;
  "Acc. Imbqalance": number | null;
  "Min Inventory": number | null;
  "Instructed Flow": number | null
}