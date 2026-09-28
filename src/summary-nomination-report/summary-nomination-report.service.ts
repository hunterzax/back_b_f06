import {HttpException, HttpStatus, Inject, Injectable, Logger} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as XLSX from 'xlsx-js-style'
// import * as XlsxPopulate from 'xlsx-populate';
import * as fs from 'fs'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {getTodayEndAdd7, getTodayNow, getTodayNowAdd7, getTodayNowDDMMYYYYDfault, getTodayNowDDMMYYYYDfaultAdd7, getTodayStartAdd7, getWeekRange} from 'src/common/utils/date.util'
import * as _ from 'lodash'
import {parseToNumber, parseToNumber3Decimal, parseToNumber4Decimal, parseToNumber6Decimal} from 'src/common/utils/number.util'
import {QualityEvaluationService} from 'src/quality-evaluation/quality-evaluation.service'
import {QualityPlanningService} from 'src/quality-planning/quality-planning.service'
import {Prisma} from '@prisma/client'

import {Mutex} from 'async-mutex'
import { findHvFromEntryArea } from 'src/common/utils/nomination.util'

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)

@Injectable()
export class SummaryNominationReportService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly qualityEvaluationService: QualityEvaluationService,
    private readonly qualityPlanningService: QualityPlanningService
  ) {}

  private readonly logger = new Logger(SummaryNominationReportService.name)
  private readonly mutex = new Mutex()

  formatClean(x: number, maxDp = 3): string {
    if (x == null || Number.isNaN(Number(x))) return ''
    return Number(x)
      .toFixed(maxDp)
      .replace(/\.?0+$/, '') // ตัด 0 ท้าย + จุดทศนิยมถ้าไม่เหลือ
  }

  // ถ้าอยากได้เป็น number (ไม่ใช่ string)
  normalizeNumber(x: number, maxDp = 3): number {
    const s = this.formatClean(x, maxDp)
    return s === '' ? NaN : Number(s)
  }
  normalizeNumber_(x: number, maxDp = 3): number {
    const s = this.formatClean(parseToNumber(x), maxDp)
    return s === '' ? NaN : Number(s)
  }

  fnsupplyRef_(area_text: any, area_data: any) {
    const supplyRef = area_data?.find((f: any) => {
      return f?.name === area_text
    })
    return supplyRef
  }
  fnsupplyRef_entry(area_text: any, nom_: any, area_data: any) {
    const nomAllmmscfDW_ = nom_?.map((fm: any) => fm?.arrNom)?.flat()
    const supplyRef = area_data?.find((f: any) => {
      return f?.name === area_text
    })
    const entry_area_nom_ref = nomAllmmscfDW_?.filter((f: any) => {
      return f?.area_text === supplyRef?.supply_reference_quality_area_by?.name && f?.entry_exit_id === 1
    })
    return entry_area_nom_ref
  }

  fnHvCalc_nomtotal(arr_: any, totalCap = 'totalCap') {
    const ViAllMMSCF = arr_?.reduce((accumulator, currentValue) => accumulator + (parseToNumber(currentValue?.[totalCap]) ?? 0), 0)
    const HVxVi = arr_?.reduce((accumulator, currentValue) => {
      let hv_ = parseToNumber3Decimal(currentValue?.nomination_row_json?.data_temp['12'] ?? 0) ?? 0
      let vi_ = parseToNumber3Decimal(currentValue?.[totalCap]) ?? 0
      const HvxVi = hv_ * vi_
      return accumulator + HvxVi
    }, 0)
    const Hv_calc = HVxVi / ViAllMMSCF
    return Hv_calc
  }
  fnWiCalc_nomtotal(arr_: any, totalCap = 'totalCap') {
    const ViAllMMSCF = arr_?.reduce((accumulator, currentValue) => accumulator + (parseToNumber(currentValue?.[totalCap]) ?? 0), 0)
    const HVxVi = arr_?.reduce((accumulator, currentValue) => {
      let hv_ = parseToNumber3Decimal(currentValue?.nomination_row_json?.data_temp['12'] ?? 0) ?? 0
      let vi_ = parseToNumber3Decimal(currentValue?.[totalCap]) ?? 0
      const HvxVi = hv_ * vi_
      return accumulator + HvxVi
    }, 0)
    const SGxVi = arr_?.reduce((accumulator, currentValue) => {
      let sg_ = parseToNumber4Decimal(currentValue?.nomination_row_json?.data_temp['13'] ?? 0) ?? 0
      let vi_ = parseToNumber3Decimal(currentValue?.[totalCap]) ?? 0
      const HvxVi = sg_ * vi_
      return accumulator + HvxVi
    }, 0)

    const Wi_calc = HVxVi / 0.982596 / Math.sqrt(SGxVi * ViAllMMSCF)
    // return Number.isNaN(Wi_calc) ? 0 : Wi_calc;
    return this.roundTo3(Wi_calc)
  }
  fnSgCalc_nomtotal(arr_: any, totalCap = 'totalCap') {
    const ViAllMMSCF = arr_?.reduce((accumulator, currentValue) => accumulator + (parseToNumber(currentValue?.[totalCap]) ?? 0), 0)
    const SGxVi = arr_?.reduce((accumulator, currentValue) => {
      let sg_ = parseToNumber4Decimal(currentValue?.nomination_row_json?.data_temp['13'] ?? 0) ?? 0
      let vi_ = parseToNumber3Decimal(currentValue?.[totalCap]) ?? 0
      const HvxVi = sg_ * vi_
      return accumulator + HvxVi
    }, 0)

    const Sg_calc = SGxVi / ViAllMMSCF
    return Sg_calc
  }
  w_fnHvCalc_nomtotal(arr_: any, day_:any) {
    const ViAllMMSCF = arr_?.reduce((accumulator, currentValue) => accumulator + (parseToNumber(currentValue?.[day_]) ?? 0), 0)
    
    const HVxVi = arr_?.reduce((accumulator, currentValue) => {
      let hv_ = parseToNumber3Decimal(currentValue?.nomination_row_json?.data_temp['12'] ?? 0) ?? 0
      let vi_ = parseToNumber3Decimal(currentValue?.[day_]) ?? 0
      const HvxVi = hv_ * vi_
      return accumulator + HvxVi
    }, 0)
    const Hv_calc = HVxVi / ViAllMMSCF
    return Hv_calc
  }
  w_fnWiCalc_nomtotal(arr_: any, day_ = "sunday") {
    const ViAllMMSCF = arr_?.reduce((accumulator, currentValue) => accumulator + (parseToNumber(currentValue?.[day_]) ?? 0), 0)
    const HVxVi = arr_?.reduce((accumulator, currentValue) => {
      let hv_ = parseToNumber3Decimal(currentValue?.nomination_row_json?.data_temp['12'] ?? 0) ?? 0
      let vi_ = parseToNumber3Decimal(currentValue?.[day_]) ?? 0
      const HvxVi = hv_ * vi_
      return accumulator + HvxVi
    }, 0)
    const SGxVi = arr_?.reduce((accumulator, currentValue) => {
      let sg_ = parseToNumber4Decimal(currentValue?.nomination_row_json?.data_temp['13'] ?? 0) ?? 0
      let vi_ = parseToNumber3Decimal(currentValue?.[day_]) ?? 0
      const HvxVi = sg_ * vi_
      return accumulator + HvxVi
    }, 0)

    const Wi_calc = HVxVi / 0.982596 / Math.sqrt(SGxVi * ViAllMMSCF)
    // return Number.isNaN(Wi_calc) ? 0 : Wi_calc;
    return Wi_calc
  }
  w_fnSgCalc_nomtotal(arr_: any, day_ = "sunday") {
    const ViAllMMSCF = arr_?.reduce((accumulator, currentValue) => accumulator + (parseToNumber(currentValue?.[day_]) ?? 0), 0)
    const SGxVi = arr_?.reduce((accumulator, currentValue) => {
      let sg_ = parseToNumber4Decimal(currentValue?.nomination_row_json?.data_temp['13'] ?? 0) ?? 0
      let vi_ = parseToNumber3Decimal(currentValue?.[day_]) ?? 0
      const HvxVi = sg_ * vi_
      return accumulator + HvxVi
    }, 0)

    const Sg_calc = SGxVi / ViAllMMSCF
    return Sg_calc
  }

  fnALLNOMUutilization(payload_: any, type_: any, area_data: any, dataMMSCF: any, nomData: any, D_EW_OBJ:any, W_EW_OBJ:any) {
    const effectiveDataMMSCF = dataMMSCF || payload_;
    const result_all = payload_?.map((e: any) => {
      const {area_text, utilization, arrNom, entry_exit_id, totalCap, wi, hv, sg, ...nE} = e
      let calc = 0
      let wi_ = 0
      let hv_ = 0
      let sg_ = 0
      let pointArr = entry_exit_id === 1 ? arrNom : this.fnsupplyRef_entry(e && e?.area_text || "", payload_, area_data)
      // // S_GSP1
      //   if(e?.nomiantion_point === "S_GSP1"){
      //     console.log('S_GSP1 : ', e);
      //   }
      // console.log('[WN_CC4] nominationWeeklyMMSCFD : ', nominationWeeklyMMSCFD?.filter((f:any) => f?.nomination_point === "WN_CC4"));
     

      if (entry_exit_id === 1) {
        if (type_ === 'mmscf') {
          let Hv_calc = this.roundTo3(this.fnHvCalc_nomtotal(pointArr))
          let Wi_calc = this.roundTo3(this.fnWiCalc_nomtotal(pointArr))
          let Sg_calc = this.roundTo4(this.fnSgCalc_nomtotal(pointArr))

          hv_ = Hv_calc
          wi_ = Wi_calc
          sg_ = Sg_calc
          calc = utilization // ถูก
        } else {

          // console.log('[S_GSP1] fDWallwMMBTUDOnce : ', fDWallwMMBTUDOnce?.filter((f:any) => f?.nomination_point === "S_GSP1"));

          const nomPoint = nomData?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point
          })
          const finddataMMSCF = dataMMSCF?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point && f?.entry_exit_id === entry_exit_id
          })
          let Hv_calc = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(finddataMMSCF?.arrNom) : 0) // ถูก
          let Wi_calc = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(finddataMMSCF?.arrNom) : 0) // ถูก
          let Sg_calc = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(finddataMMSCF?.arrNom) : 0) // ถูก
          hv_ = Hv_calc
          wi_ = Wi_calc
          sg_ = Sg_calc
          calc = (totalCap / (Hv_calc * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100

          if(e?.nomination_point === "ZAWTIKA"){
            console.log('[ZAWTIKA] e : ', e);
            console.log('[ZAWTIKA] finddataMMSCF?.arrNom : ', finddataMMSCF?.arrNom);
            console.log('[ZAWTIKA] Hv_calc : ', Hv_calc);
          }

        }
      } else {
        
        if (type_ === 'mmscf') {
          const finddataMMSCF = dataMMSCF?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point && f?.entry_exit_id === entry_exit_id
          })
          const nomPoint = nomData?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point
          })

          if(e?.zone_text === 'EAST-WEST'){
            // let hourDay = {
            //     H1: this.fnCalcMMBTUDtoMMSCFD('H1', hv, arrNom),
            //     H2: this.fnCalcMMBTUDtoMMSCFD('H2', hv, arrNom),
            //     H3: this.fnCalcMMBTUDtoMMSCFD('H3', hv, arrNom),
            //     H4: this.fnCalcMMBTUDtoMMSCFD('H4', hv, arrNom),
            //     H5: this.fnCalcMMBTUDtoMMSCFD('H5', hv, arrNom),
            //     H6: this.fnCalcMMBTUDtoMMSCFD('H6', hv, arrNom),
            //     H7: this.fnCalcMMBTUDtoMMSCFD('H7', hv, arrNom),
            //     H8: this.fnCalcMMBTUDtoMMSCFD('H8', hv, arrNom),
            //     H9: this.fnCalcMMBTUDtoMMSCFD('H9', hv, arrNom),
            //     H10: this.fnCalcMMBTUDtoMMSCFD('H10', hv, arrNom),
            //     H11: this.fnCalcMMBTUDtoMMSCFD('H11', hv, arrNom),
            //     H12: this.fnCalcMMBTUDtoMMSCFD('H12', hv, arrNom),
            //     H13: this.fnCalcMMBTUDtoMMSCFD('H13', hv, arrNom),
            //     H14: this.fnCalcMMBTUDtoMMSCFD('H14', hv, arrNom),
            //     H15: this.fnCalcMMBTUDtoMMSCFD('H15', hv, arrNom),
            //     H16: this.fnCalcMMBTUDtoMMSCFD('H16', hv, arrNom),
            //     H17: this.fnCalcMMBTUDtoMMSCFD('H17', hv, arrNom),
            //     H18: this.fnCalcMMBTUDtoMMSCFD('H18', hv, arrNom),
            //     H19: this.fnCalcMMBTUDtoMMSCFD('H19', hv, arrNom),
            //     H20: this.fnCalcMMBTUDtoMMSCFD('H20', hv, arrNom),
            //     H21: this.fnCalcMMBTUDtoMMSCFD('H21', hv, arrNom),
            //     H22: this.fnCalcMMBTUDtoMMSCFD('H22', hv, arrNom),
            //     H23: this.fnCalcMMBTUDtoMMSCFD('H23', hv, arrNom),
            //     H24: this.fnCalcMMBTUDtoMMSCFD('H24', hv, arrNom)
            //   }
              if(e?.area_text === "E"){

                const fnEastWestE = ({ finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ, nomPoint, value }:any) => {
                  
                  const self_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(pointArr)) // ถูก
                  const self_val_wi = this.roundTo3(this.fnWiCalc_nomtotal(pointArr)) // ถูก
                  const self_val_sg = this.roundTo3(this.fnWiCalc_nomtotal(pointArr)) // ถูก
                  
                  const F2_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data)) || 0)
                  const F2_val_sg = this.roundTo4(this.fnSgCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data)) || 0)
                  // const F2_val_hv = 861.822
                  // const F2_val_sg = 0.6370
                  // East_to_BVW10
                  // East_to_RA6
                  // West_to_BVW10
                  // West_to_RA6
                  let val_hv = this.roundTo3(((day_W_EW_OBJ?.East_to_RA6 * self_val_hv) + (day_W_EW_OBJ?.West_to_RA6 * F2_val_hv)) / (day_W_EW_OBJ?.East_to_RA6 + day_W_EW_OBJ?.West_to_RA6))
                  let val_sg = this.roundTo4(((day_W_EW_OBJ?.East_to_RA6 * self_val_sg)+(day_W_EW_OBJ?.West_to_RA6*F2_val_sg)) / (day_W_EW_OBJ?.East_to_RA6 + day_W_EW_OBJ?.West_to_RA6))
                  let val_wi = this.roundTo3((val_hv / 0.982596) / (Math.sqrt(val_sg)))
                  let val_utilization_calc = this.roundTo2(((value / (val_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100))

                  //  if(e?.nomination_point === "NBK"){
                  //     console.log('[NBK] e : ', e);
                  //     console.log('day_W_EW_OBJ : ', day_W_EW_OBJ);
                  //     console.log('F2_val_hv : ', F2_val_hv);
                  //     console.log('pointArr : ', pointArr);
                  //     console.log('dataMMSCF : ', dataMMSCF);
                  //     console.log('area_data : ', area_data);
                  //     // console.log('[NBK] hv_ : ', hv_);
                  //     // console.log('[NBK] sg_ : ', sg_);
                  //     // console.log('[NBK] wi_ : ', wi_);
                  //     // console.log('[NBK] calc : ', calc);
                  //     // console.log('[NBK] totalCap : ', totalCap);
                  //     console.log('[NBK] self_val_hv : ', self_val_hv);
                  //   }

                  return {
                    val_hv,
                    val_sg,
                    val_wi,
                    val_utilization_calc,
                  }
                }
                let valData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: D_EW_OBJ, nomPoint, value: totalCap })
                // hv_ = 898.723
                hv_ = valData?.val_hv
                sg_ = valData?.val_sg
                wi_ = valData?.val_wi
                calc = valData?.val_utilization_calc

                // ?.nomination_point === "SBK_CC4"
                // if(e?.nomination_point === "NBK"){
                //   console.log('[NBK] e : ', e);
                //   console.log('[NBK] D_EW_OBJ : ', D_EW_OBJ);
                //   console.log('[NBK] W_EW_OBJ : ', W_EW_OBJ);
                //   console.log('[NBK] valData : ', valData);
                //   console.log('- - - -');
                // }
                
                
              }else{
                const fnEastWestF2_G = ({ finddataMMSCF, dataMMSCF, area_data, EW_OBJ, nomPoint, value }:any) => {
                  const self_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(pointArr)) // ถูก
                  const self_val_wi = this.roundTo3(this.fnWiCalc_nomtotal(pointArr)) // ถูก
                  const self_val_sg = this.roundTo3(this.fnWiCalc_nomtotal(pointArr)) // ถูก
              
                  const F2_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data)) || 0)
                  const F2_val_sg = this.roundTo4(this.fnSgCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data)) || 0)
                
                  // East_to_BVW10
                  // East_to_RA6
                  // West_to_BVW10
                  // West_to_RA6
                  let val_hv = this.roundTo3(((EW_OBJ?.East_to_BVW10 * self_val_hv) + (EW_OBJ?.West_to_BVW10 * F2_val_hv)) / (EW_OBJ?.East_to_BVW10 + EW_OBJ?.West_to_BVW10))
                  let val_sg = this.roundTo4(((EW_OBJ?.East_to_BVW10 * self_val_sg)+(EW_OBJ?.West_to_BVW10*F2_val_sg)) / (EW_OBJ?.East_to_BVW10 + EW_OBJ?.West_to_BVW10))
                  let val_wi = this.roundTo3((val_hv / 0.982596) / (Math.sqrt(val_sg)))
                  let val_utilization_calc = this.roundTo2(((value / (val_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100))

                  return {
                    val_hv,
                    val_sg,
                    val_wi,
                    val_utilization_calc,
                  }
                }
                let valData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, EW_OBJ: D_EW_OBJ, nomPoint, value: totalCap })
                // hv_ = 861.822
                hv_ = valData?.val_hv
                sg_ = valData?.val_sg
                wi_ = valData?.val_wi
                calc = valData?.val_utilization_calc

                // if(e?.nomination_point === "BPC"){
                //   console.log('[BPC] hv_ : ', hv_);
                //   console.log('[BPC] sg_ : ', sg_);
                //   console.log('[BPC] wi_ : ', wi_);
                //   console.log('[BPC] calc : ', calc);
                //   console.log('[BPC] totalCap : ', totalCap);
                // }

              }
            }else{
              let Hv_calc = this.roundTo3(this.fnHvCalc_nomtotal(pointArr)) // ถูก
              let Wi_calc = this.roundTo3(this.fnWiCalc_nomtotal(pointArr)) // ถูก
              let Sg_calc = this.roundTo4(this.fnSgCalc_nomtotal(pointArr)) // ถูก

              hv_ = Hv_calc
              wi_ = Wi_calc
              sg_ = Sg_calc
              calc = (totalCap / (Hv_calc * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100


            

            }


             

        } else {
          const finddataMMSCF = dataMMSCF?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point && f?.entry_exit_id === entry_exit_id
          })
          
          const nomPoint = nomData?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point
          })

            if(e?.zone_text === 'EAST-WEST'){
              if(e?.area_text === "E"){

                const fnEastWestE = ({ finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ, nomPoint, value }:any) => {
                  
                  const self_val_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
                  const self_val_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
                  const self_val_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
                  
                  const F2_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data)) || 0)
                  const F2_val_sg = this.roundTo4(this.fnSgCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data)) || 0)
                  // East_to_BVW10
                  // East_to_RA6
                  // West_to_BVW10
                  // West_to_RA6
                  let val_hv = this.roundTo3(((day_W_EW_OBJ?.East_to_RA6 * self_val_hv) + (day_W_EW_OBJ?.West_to_RA6 * F2_val_hv)) / (day_W_EW_OBJ?.East_to_RA6 + day_W_EW_OBJ?.West_to_RA6))
                  let val_sg = this.roundTo4(((day_W_EW_OBJ?.East_to_RA6 * self_val_sg)+(day_W_EW_OBJ?.West_to_RA6*F2_val_sg)) / (day_W_EW_OBJ?.East_to_RA6 + day_W_EW_OBJ?.West_to_RA6))
                  let val_wi = this.roundTo3((val_hv / 0.982596) / (Math.sqrt(val_sg)))
                  let val_utilization_calc = this.roundTo2(((value / (val_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100))
                  
                  return {
                    val_hv,
                    val_sg,
                    val_wi,
                    val_utilization_calc,
                  }
                }
                let valData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: D_EW_OBJ, nomPoint, value: totalCap })
                hv_ = valData?.val_hv
                sg_ = valData?.val_sg
                wi_ = valData?.val_wi
                calc = valData?.val_utilization_calc
                
              }else{
                const fnEastWestF2_G = ({ finddataMMSCF, dataMMSCF, area_data, EW_OBJ, nomPoint, value }:any) => {
                  const self_val_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
                  const self_val_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
                  const self_val_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
              
                  const F2_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data)) || 0)
                  const F2_val_sg = this.roundTo4(this.fnSgCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data)) || 0)
                
                  // East_to_BVW10
                  // East_to_RA6
                  // West_to_BVW10
                  // West_to_RA6
                  let val_hv = this.roundTo3(((EW_OBJ?.East_to_BVW10 * self_val_hv) + (EW_OBJ?.West_to_BVW10 * F2_val_hv)) / (EW_OBJ?.East_to_BVW10 + EW_OBJ?.West_to_BVW10))
                  let val_sg = this.roundTo4(((EW_OBJ?.East_to_BVW10 * self_val_sg)+(EW_OBJ?.West_to_BVW10*F2_val_sg)) / (EW_OBJ?.East_to_BVW10 + EW_OBJ?.West_to_BVW10))
                  let val_wi = this.roundTo3((val_hv / 0.982596) / (Math.sqrt(val_sg)))
                  let val_utilization_calc = this.roundTo2(((value / (val_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100))

                  return {
                    val_hv,
                    val_sg,
                    val_wi,
                    val_utilization_calc,
                  }
                }
                let valData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, EW_OBJ: D_EW_OBJ, nomPoint, value: totalCap })
                hv_ = valData?.val_hv
                sg_ = valData?.val_sg
                wi_ = valData?.val_wi
                calc = valData?.val_utilization_calc

              

              }
            }else{
               let Hv_calc = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
                let Wi_calc = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
                let Sg_calc = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
                hv_ = Hv_calc
                wi_ = Wi_calc
                sg_ = Sg_calc
                calc = (totalCap / (Hv_calc * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100
            }

        }
      }

      return {
        wi: wi_,
        hv: hv_,
        sg: sg_,
        units: e?.unix,
        area_text,
        entry_exit_id,
        utilization: calc,
        arrNom,
        totalCap,
        ...nE
      }
    })
    return result_all
  }

  fnALLNOMUutilizationWeekly(payload_: any, type_: any, area_data: any, dataMMSCF: any, nomData: any, W_EW_OBJ:any) {
    const effectiveDataMMSCF = dataMMSCF || payload_;
    // unix = 'MMSCFD'

    // sunday = 130752.721
    // sunday_utilization = 84.56725

    // monday = 130752.721
    // monday_utilization = 83.229581

    // thursday = 130752.721
    // thursday_utilization = 83.544457

    // tuesday = 130752.721
    // tuesday_utilization = 83.030676

    // wednesday = 130752.721
    // wednesday_utilization = 83.147626

    // friday = 130752.721
    // friday_utilization = 83.911359

    // saturday = 130752.721
    // saturday_utilization = 84.554958

    // return payload_

    const result_all = payload_?.map((e: any) => {
      const {
        area_text,
        utilization,
        arrNom,
        entry_exit_id,
        totalCap,
        wi,
        hv,
        sg,

        sunday_utilization,
        monday_utilization,
        thursday_utilization,
        tuesday_utilization,
        wednesday_utilization,
        friday_utilization,
        saturday_utilization,

        sunday,
        monday,
        thursday,
        tuesday,
        wednesday,
        friday,
        saturday,

        ...nE
      } = e
      // NBK
      let sunday_utilization_calc = 0
      let monday_utilization_calc = 0
      let thursday_utilization_calc = 0
      let tuesday_utilization_calc = 0
      let wednesday_utilization_calc = 0
      let friday_utilization_calc = 0
      let saturday_utilization_calc = 0

      let sunday_wi = 0
      let monday_wi = 0
      let thursday_wi = 0
      let tuesday_wi = 0
      let wednesday_wi = 0
      let friday_wi = 0
      let saturday_wi = 0

      let sunday_hv = 0
      let monday_hv = 0
      let thursday_hv = 0
      let tuesday_hv = 0
      let wednesday_hv = 0
      let friday_hv = 0
      let saturday_hv = 0

      let sunday_sg = 0
      let monday_sg = 0
      let thursday_sg = 0
      let tuesday_sg = 0
      let wednesday_sg = 0
      let friday_sg = 0
      let saturday_sg = 0

      let sunday_;
      let monday_;
      let thursday_;
      let tuesday_;
      let wednesday_;
      let friday_;
      let saturday_;

      // let calc = 0
      let wi_ = 0
      let hv_ = 0
      let sg_ = 0
      let pointArr = entry_exit_id === 1 ? arrNom : this.fnsupplyRef_entry(e && e?.area_text || "", payload_, area_data)

      if (entry_exit_id === 1) {
        if (type_ === 'mmscf') {
           const nomPoint = nomData?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point
          })
          const finddataMMSCF = dataMMSCF?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point && f?.entry_exit_id === entry_exit_id
          })

            sunday_ = sunday
            monday_ = monday
            thursday_ = thursday
            tuesday_ = tuesday
            wednesday_ = wednesday
            friday_ = friday
            saturday_ = saturday


            //  let Hv_calc = this.roundTo3(this.fnHvCalc_nomtotal(pointArr))
            // let Wi_calc = this.roundTo3(this.fnWiCalc_nomtotal(pointArr))
            // let Sg_calc = this.roundTo4(this.fnSgCalc_nomtotal(pointArr))

              // hv_ = Hv_calc
              // wi_ = Wi_calc
              // sg_ = Sg_calc
              // calc = utilization // ถูก

            sunday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, "sunday") : 0) // ถูก
            sunday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, "sunday") : 0) // ถูก
            sunday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, "sunday") : 0) // ถูก
            sunday_utilization_calc = this.roundTo2((sunday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)

  
            monday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, "monday") : 0) // ถูก
            monday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, "monday") : 0) // ถูก
            monday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, "monday") : 0) // ถูก
            monday_utilization_calc = this.roundTo2((monday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            thursday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, "thursday") : 0) // ถูก
            thursday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, "thursday") : 0) // ถูก
            thursday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, "thursday") : 0) // ถูก
            thursday_utilization_calc = this.roundTo2((thursday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            tuesday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, "tuesday") : 0) // ถูก
            tuesday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, "tuesday") : 0) // ถูก
            tuesday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, "tuesday") : 0) // ถูก
            tuesday_utilization_calc = this.roundTo2((tuesday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            wednesday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, 'wednesday') : 0) // ถูก
            wednesday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, 'wednesday') : 0) // ถูก
            wednesday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, 'wednesday') : 0) // ถูก
            wednesday_utilization_calc = this.roundTo2((wednesday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            friday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, 'friday') : 0) // ถูก
            friday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, 'friday') : 0) // ถูก
            friday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, 'friday') : 0) // ถูก
            friday_utilization_calc = this.roundTo2((friday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            saturday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, 'saturday') : 0) // ถูก
            saturday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, 'saturday') : 0) // ถูก
            saturday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, 'saturday') : 0) // ถูก
            saturday_utilization_calc = this.roundTo2((saturday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
         
          // let Hv_calc = this.roundTo3(this.fnHvCalc_nomtotal(pointArr))
          // let Wi_calc = this.roundTo3(this.fnWiCalc_nomtotal(pointArr))
          // let Sg_calc = this.roundTo4(this.fnSgCalc_nomtotal(pointArr))
          // hv_ = Hv_calc
          // wi_ = Wi_calc
          // sg_ = Sg_calc
          // calc = utilization // ถูก
        } else {
          const nomPoint = nomData?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point
          })
          const finddataMMSCF = dataMMSCF?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point && f?.entry_exit_id === entry_exit_id
          })
          sunday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(finddataMMSCF?.arrNom, 'sunday') : 0) // ถูก
          sunday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(finddataMMSCF?.arrNom, 'sunday') : 0) // ถูก
          sunday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(finddataMMSCF?.arrNom, 'sunday') : 0) // ถูก
          sunday_utilization_calc = this.roundTo2((e?.sunday / (sunday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)

          monday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(finddataMMSCF?.arrNom, 'monday') : 0) // ถูก
          monday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(finddataMMSCF?.arrNom, 'monday') : 0) // ถูก
          monday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(finddataMMSCF?.arrNom, 'monday') : 0) // ถูก
          monday_utilization_calc = this.roundTo2((e?.monday / (monday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)

          thursday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(finddataMMSCF?.arrNom, 'thursday') : 0) // ถูก
          thursday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(finddataMMSCF?.arrNom, 'thursday') : 0) // ถูก
          thursday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(finddataMMSCF?.arrNom, 'thursday') : 0) // ถูก
          thursday_utilization_calc = this.roundTo2((e?.thursday / (thursday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)

          tuesday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(finddataMMSCF?.arrNom, 'tuesday') : 0) // ถูก
          tuesday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(finddataMMSCF?.arrNom, 'tuesday') : 0) // ถูก
          tuesday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(finddataMMSCF?.arrNom, 'tuesday') : 0) // ถูก
          tuesday_utilization_calc = this.roundTo2((e?.tuesday / (tuesday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)

          wednesday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(finddataMMSCF?.arrNom, 'wednesday') : 0) // ถูก
          wednesday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(finddataMMSCF?.arrNom, 'wednesday') : 0) // ถูก
          wednesday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(finddataMMSCF?.arrNom, 'wednesday') : 0) // ถูก
          wednesday_utilization_calc = this.roundTo2((e?.wednesday / (wednesday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)

          friday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(finddataMMSCF?.arrNom, 'friday') : 0) // ถูก
          friday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(finddataMMSCF?.arrNom, 'friday') : 0) // ถูก
          friday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(finddataMMSCF?.arrNom, 'friday') : 0) // ถูก
          friday_utilization_calc = this.roundTo2((e?.friday / (friday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)

          saturday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(finddataMMSCF?.arrNom, 'saturday') : 0) // ถูก
          saturday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(finddataMMSCF?.arrNom, 'saturday') : 0) // ถูก
          saturday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(finddataMMSCF?.arrNom, 'saturday') : 0) // ถูก
          saturday_utilization_calc = this.roundTo2((e?.saturday / (saturday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
         
        }
        sunday_ = sunday
        monday_ = monday
        thursday_ = thursday
        tuesday_ = tuesday
        wednesday_ = wednesday
        friday_ = friday
        saturday_ = saturday
      } else {
        
        // SBK_CC4

        if (type_ === 'mmscf') {
          // let Hv_calc = this.roundTo3(this.fnHvCalc_nomtotal(pointArr)) // ถูก
          // let Wi_calc = this.roundTo3(this.fnWiCalc_nomtotal(pointArr)) // ถูก
          // let Sg_calc = this.roundTo4(this.fnSgCalc_nomtotal(pointArr)) // ถูก
          // const nomPoint = nomData?.find((f: any) => {
          //   return f?.nomination_point === e?.nomination_point
          // })
          // hv_ = Hv_calc
          // wi_ = Wi_calc
          // sg_ = Sg_calc
          // calc = (totalCap / (Hv_calc * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100

           const nomPoint = nomData?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point
          })
          const finddataMMSCF = dataMMSCF?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point && f?.entry_exit_id === entry_exit_id
          })

           if(e?.zone_text === 'EAST-WEST'){
            const day_W_EW_OBJ_sunday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(0, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_monday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(1, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_tuesday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(2, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_wednesday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(3, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_thursday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(4, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_friday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(5, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_saturday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(6, "day").format("DD/MM/YYYY"))

            if(e?.area_text === "E"){

              const fnEastWestE = ({ finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ, nomPoint, value, day_ }:any) => {
                const self_val_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, day_) : 0) // ถูก
                const self_val_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, day_) : 0) // ถูก
                const self_val_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, day_) : 0) // ถูก
                
                const F2_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data), day_) || 0)
                const F2_val_sg = this.roundTo4(this.fnSgCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data), day_) || 0)
                // East_to_BVW10
                // East_to_RA6
                // West_to_BVW10
                // West_to_RA6
                let val_hv = this.roundTo3(((day_W_EW_OBJ?.East_to_RA6 * self_val_hv) + (day_W_EW_OBJ?.West_to_RA6 * F2_val_hv)) / (day_W_EW_OBJ?.East_to_RA6 + day_W_EW_OBJ?.West_to_RA6))
                let val_sg = this.roundTo4(((day_W_EW_OBJ?.East_to_RA6 * self_val_sg)+(day_W_EW_OBJ?.West_to_RA6*F2_val_sg)) / (day_W_EW_OBJ?.East_to_RA6 + day_W_EW_OBJ?.West_to_RA6))
                let val_wi = this.roundTo3((val_hv / 0.982596) / (Math.sqrt(val_sg)))
                let val_utilization_calc = this.roundTo2(((value / (val_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100))
                
                return {
                  val_hv,
                  val_sg,
                  val_wi,
                  val_utilization_calc,
                }
              }
              let sundayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_sunday, nomPoint, value: e?.sunday, day_: 'sunday' })
              sunday_hv = sundayData?.val_hv
              sunday_sg = sundayData?.val_sg
              sunday_wi = sundayData?.val_wi
              sunday_utilization_calc = sundayData?.val_utilization_calc
              sunday_ = this.roundTo6(e?.sunday / sunday_hv)
  
              let mondayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_monday, nomPoint, value: e?.monday, day_: 'monday' })
              monday_hv = mondayData?.val_hv
              monday_sg = mondayData?.val_sg
              monday_wi = mondayData?.val_wi
              monday_utilization_calc = mondayData?.val_utilization_calc
              monday_ = this.roundTo6(e?.monday / monday_hv)
  
              let tuesdayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_tuesday, nomPoint, value: e?.tuesday, day_: 'tuesday' })
              tuesday_hv = tuesdayData?.val_hv
              tuesday_sg = tuesdayData?.val_sg
              tuesday_wi = tuesdayData?.val_wi
              tuesday_utilization_calc = tuesdayData?.val_utilization_calc
              tuesday_ = this.roundTo6(e?.tuesday / tuesday_hv)

              let wednesdayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_wednesday, nomPoint, value: e?.wednesday, day_: 'wednesday' })
              wednesday_hv = wednesdayData?.val_hv
              wednesday_sg = wednesdayData?.val_sg
              wednesday_wi = wednesdayData?.val_wi
              wednesday_utilization_calc = wednesdayData?.val_utilization_calc
              wednesday_ = this.roundTo6(e?.wednesday / wednesday_hv)

              let thursdayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_thursday, nomPoint, value: e?.thursday, day_: 'thursday' })
              thursday_hv = thursdayData?.val_hv
              thursday_sg = thursdayData?.val_sg
              thursday_wi = thursdayData?.val_wi
              thursday_utilization_calc = thursdayData?.val_utilization_calc
              thursday_ = this.roundTo6(e?.thursday / thursday_hv)

              let fridayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_friday, nomPoint, value: e?.friday, day_: 'friday' })
              friday_hv = fridayData?.val_hv
              friday_sg = fridayData?.val_sg
              friday_wi = fridayData?.val_wi
              friday_utilization_calc = fridayData?.val_utilization_calc
              friday_ = this.roundTo6(e?.friday / friday_hv)

              let saturdayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_saturday, nomPoint, value: e?.saturday, day_: 'saturday' })
              saturday_hv = saturdayData?.val_hv
              saturday_sg = saturdayData?.val_sg
              saturday_wi = saturdayData?.val_wi
              saturday_utilization_calc = saturdayData?.val_utilization_calc
              saturday_ = this.roundTo6(e?.saturday / saturday_hv)
            }else{
              const fnEastWestF2_G = ({ finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ, nomPoint, value, day_ }:any) => {
                
                const self_val_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, day_) : 0) // ถูก
                const self_val_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, day_) : 0) // ถูก
                const self_val_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, day_) : 0) // ถูก
             
                const F2_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data), day_) || 0)
                const F2_val_sg = this.roundTo4(this.fnSgCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data), day_) || 0)
              
                // East_to_BVW10
                // East_to_RA6
                // West_to_BVW10
                // West_to_RA6
                let val_hv = this.roundTo3(((day_W_EW_OBJ?.East_to_BVW10 * self_val_hv) + (day_W_EW_OBJ?.West_to_BVW10 * F2_val_hv)) / (day_W_EW_OBJ?.East_to_BVW10 + day_W_EW_OBJ?.West_to_BVW10))
                let val_sg = this.roundTo4(((day_W_EW_OBJ?.East_to_BVW10 * self_val_sg)+(day_W_EW_OBJ?.West_to_BVW10*F2_val_sg)) / (day_W_EW_OBJ?.East_to_BVW10 + day_W_EW_OBJ?.West_to_BVW10))
                let val_wi = this.roundTo3((val_hv / 0.982596) / (Math.sqrt(val_sg)))
                let val_utilization_calc = this.roundTo2(((value / (val_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100))

                return {
                  val_hv,
                  val_sg,
                  val_wi,
                  val_utilization_calc,
                }
              }
              let sundayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_sunday, nomPoint, value: e?.sunday, day_: 'sunday' })
              sunday_hv = sundayData?.val_hv
              sunday_sg = sundayData?.val_sg
              sunday_wi = sundayData?.val_wi
              sunday_utilization_calc = sundayData?.val_utilization_calc 
              const sundayCalc = e?.arrNom?.reduce(
                (accumulator, currentValue) => accumulator + this.roundTo6(currentValue?.sunday / sunday_hv),
                0,
              )
              sunday_ = this.roundTo6(sundayCalc)
              // sunday_ = this.roundTo6(e?.sunday / sunday_hv)
             
              let mondayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_monday, nomPoint, value: e?.monday, day_: 'monday' })
              monday_hv = mondayData?.val_hv
              monday_sg = mondayData?.val_sg
              monday_wi = mondayData?.val_wi
              monday_utilization_calc = mondayData?.val_utilization_calc
              const mondayCalc = e?.arrNom?.reduce(
                (accumulator, currentValue) => accumulator + this.roundTo6(currentValue?.monday / monday_hv),
                0,
              )
              monday_ = this.roundTo6(mondayCalc)
              // monday_ = this.roundTo6(e?.monday / monday_hv)

              let tuesdayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_tuesday, nomPoint, value: e?.tuesday, day_: 'tuesday' })
              tuesday_hv = tuesdayData?.val_hv
              tuesday_sg = tuesdayData?.val_sg
              tuesday_wi = tuesdayData?.val_wi
              tuesday_utilization_calc = tuesdayData?.val_utilization_calc
              const tuesdayCalc = e?.arrNom?.reduce(
                (accumulator, currentValue) => accumulator + this.roundTo6(currentValue?.tuesday / tuesday_hv),
                0,
              )
              tuesday_ = this.roundTo6(tuesdayCalc)
              // tuesday_ = this.roundTo6(e?.tuesday / tuesday_hv)

              let wednesdayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_wednesday, nomPoint, value: e?.wednesday, day_: 'wednesday' })
              wednesday_hv = wednesdayData?.val_hv
              wednesday_sg = wednesdayData?.val_sg
              wednesday_wi = wednesdayData?.val_wi
              wednesday_utilization_calc = wednesdayData?.val_utilization_calc
              const wednesdayCalc = e?.arrNom?.reduce(
                (accumulator, currentValue) => accumulator + this.roundTo6(currentValue?.wednesday / wednesday_hv),
                0,
              )
              wednesday_ = this.roundTo6(wednesdayCalc)
              // wednesday_ = this.roundTo6(e?.wednesday / wednesday_hv)
              
              let thursdayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_thursday, nomPoint, value: e?.thursday, day_: 'thursday' })
              thursday_hv = thursdayData?.val_hv
              thursday_sg = thursdayData?.val_sg
              thursday_wi = thursdayData?.val_wi
              thursday_utilization_calc = thursdayData?.val_utilization_calc
              const thursdayCalc = e?.arrNom?.reduce(
                (accumulator, currentValue) => accumulator + this.roundTo6(currentValue?.thursday / thursday_hv),
                0,
              )
              thursday_ = this.roundTo6(thursdayCalc)
              // thursday_ = this.roundTo6(e?.thursday / thursday_hv)

              let fridayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_friday, nomPoint, value: e?.friday, day_: 'friday' })
              friday_hv = fridayData?.val_hv
              friday_sg = fridayData?.val_sg
              friday_wi = fridayData?.val_wi
              friday_utilization_calc = fridayData?.val_utilization_calc
              const fridayCalc = e?.arrNom?.reduce(
                (accumulator, currentValue) => accumulator + this.roundTo6(currentValue?.friday / friday_hv),
                0,
              )
              friday_ = this.roundTo6(fridayCalc)
              // friday_ = this.roundTo6(e?.friday / friday_hv)

              let saturdayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_saturday, nomPoint, value: e?.saturday, day_: 'saturday' })
              saturday_hv = saturdayData?.val_hv
              saturday_sg = saturdayData?.val_sg
              saturday_wi = saturdayData?.val_wi
              saturday_utilization_calc = saturdayData?.val_utilization_calc
              const saturdayCalc = e?.arrNom?.reduce(
                (accumulator, currentValue) => accumulator + this.roundTo6(currentValue?.saturday / saturday_hv),
                0,
              )
              saturday_ = this.roundTo6(saturdayCalc)
              // saturday_ = this.roundTo6(e?.saturday / saturday_hv)
            }

            
            //  if(e?.nomination_point === "SBK_CC4"){
            //    console.log('[SBK_CC4] e : ', e );
            //    console.log('[SBK_CC4] e?.sunday : ', e?.sunday );
            //    console.log('[SBK_CC4] day_W_EW_OBJ_sunday : ', day_W_EW_OBJ_sunday );
            //    console.log('[SBK_CC4] finddataMMSCF : ', finddataMMSCF );
            //   console.log('[SBK_CC4] sunday_utilization : ', sunday_utilization );
            //   console.log('[SBK_CC4] sunday_hv : ', sunday_hv );
            //   console.log('-> : ', (e?.sunday / sunday_hv));
            // }
          }else{

            sunday_ = sunday
            monday_ = monday
            thursday_ = thursday
            tuesday_ = tuesday
            wednesday_ = wednesday
            friday_ = friday
            saturday_ = saturday

            sunday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, "sunday") : 0) // ถูก
            sunday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, "sunday") : 0) // ถูก
            sunday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, "sunday") : 0) // ถูก
            sunday_utilization_calc = this.roundTo2((sunday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)

  
            monday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, "monday") : 0) // ถูก
            monday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, "monday") : 0) // ถูก
            monday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, "monday") : 0) // ถูก
            monday_utilization_calc = this.roundTo2((monday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            thursday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, "thursday") : 0) // ถูก
            thursday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, "thursday") : 0) // ถูก
            thursday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, "thursday") : 0) // ถูก
            thursday_utilization_calc = this.roundTo2((thursday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            tuesday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, "tuesday") : 0) // ถูก
            tuesday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, "tuesday") : 0) // ถูก
            tuesday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, "tuesday") : 0) // ถูก
            tuesday_utilization_calc = this.roundTo2((tuesday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            wednesday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, 'wednesday') : 0) // ถูก
            wednesday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, 'wednesday') : 0) // ถูก
            wednesday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, 'wednesday') : 0) // ถูก
            wednesday_utilization_calc = this.roundTo2((wednesday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            friday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, 'friday') : 0) // ถูก
            friday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, 'friday') : 0) // ถูก
            friday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, 'friday') : 0) // ถูก
            friday_utilization_calc = this.roundTo2((friday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            saturday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(pointArr, 'saturday') : 0) // ถูก
            saturday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(pointArr, 'saturday') : 0) // ถูก
            saturday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(pointArr, 'saturday') : 0) // ถูก
            saturday_utilization_calc = this.roundTo2((saturday / (parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
          }

        } else {
          sunday_ = sunday
          monday_ = monday
          thursday_ = thursday
          tuesday_ = tuesday
          wednesday_ = wednesday
          friday_ = friday
          saturday_ = saturday
          // const finddataMMSCF = dataMMSCF?.find((f: any) => {
          //   return f?.nomination_point === e?.nomination_point && f?.entry_exit_id === entry_exit_id
          // })
          // let Hv_calc = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
          // let Wi_calc = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
          // let Sg_calc = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data)) : 0) // ถูก
          // const nomPoint = nomData?.find((f: any) => {
          //   return f?.nomination_point === e?.nomination_point
          // })

          // hv_ = Hv_calc
          // wi_ = Wi_calc
          // sg_ = Sg_calc
          // calc = (totalCap / (Hv_calc * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100

          const nomPoint = nomData?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point
          })
          const finddataMMSCF = dataMMSCF?.find((f: any) => {
            return f?.nomination_point === e?.nomination_point && f?.entry_exit_id === entry_exit_id
          })

           if(e?.zone_text === 'EAST-WEST'){
            const day_W_EW_OBJ_sunday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(0, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_monday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(1, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_tuesday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(2, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_wednesday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(3, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_thursday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(4, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_friday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(5, "day").format("DD/MM/YYYY"))
            const day_W_EW_OBJ_saturday = W_EW_OBJ?.find((f:any) => f?.gas_day === dayjs(e?.gas_day_text, "DD/MM/YYYY").add(6, "day").format("DD/MM/YYYY"))

            if(e?.area_text === "E"){

              const fnEastWestE = ({ finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ, nomPoint, value, day_ }:any) => {
                const self_val_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), day_) : 0) // ถูก
                const self_val_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), day_) : 0) // ถูก
                const self_val_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), day_) : 0) // ถูก
                
                const F2_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data), day_) || 0)
                const F2_val_sg = this.roundTo4(this.fnSgCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data), day_) || 0)
                // East_to_BVW10
                // East_to_RA6
                // West_to_BVW10
                // West_to_RA6
                let val_hv = this.roundTo3(((day_W_EW_OBJ?.East_to_RA6 * self_val_hv) + (day_W_EW_OBJ?.West_to_RA6 * F2_val_hv)) / (day_W_EW_OBJ?.East_to_RA6 + day_W_EW_OBJ?.West_to_RA6))
                let val_sg = this.roundTo4(((day_W_EW_OBJ?.East_to_RA6 * self_val_sg)+(day_W_EW_OBJ?.West_to_RA6*F2_val_sg)) / (day_W_EW_OBJ?.East_to_RA6 + day_W_EW_OBJ?.West_to_RA6))
                let val_wi = this.roundTo3((val_hv / 0.982596) / (Math.sqrt(val_sg)))
                let val_utilization_calc = this.roundTo2(((value / (val_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100))
                
                return {
                  val_hv,
                  val_sg,
                  val_wi,
                  val_utilization_calc,
                }
              }
              let sundayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_sunday, nomPoint, value: e?.sunday, day_: 'sunday' })
              sunday_hv = sundayData?.val_hv
              sunday_sg = sundayData?.val_sg
              sunday_wi = sundayData?.val_wi
              sunday_utilization_calc = sundayData?.val_utilization_calc
  
              let mondayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_monday, nomPoint, value: e?.monday, day_: 'monday' })
              monday_hv = mondayData?.val_hv
              monday_sg = mondayData?.val_sg
              monday_wi = mondayData?.val_wi
              monday_utilization_calc = mondayData?.val_utilization_calc
  
              let tuesdayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_tuesday, nomPoint, value: e?.tuesday, day_: 'tuesday' })
              tuesday_hv = tuesdayData?.val_hv
              tuesday_sg = tuesdayData?.val_sg
              tuesday_wi = tuesdayData?.val_wi
              tuesday_utilization_calc = tuesdayData?.val_utilization_calc
  
              let wednesdayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_wednesday, nomPoint, value: e?.wednesday, day_: 'wednesday' })
              wednesday_hv = wednesdayData?.val_hv
              wednesday_sg = wednesdayData?.val_sg
              wednesday_wi = wednesdayData?.val_wi
              wednesday_utilization_calc = wednesdayData?.val_utilization_calc
  
              let thursdayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_thursday, nomPoint, value: e?.thursday, day_: 'thursday' })
              thursday_hv = thursdayData?.val_hv
              thursday_sg = thursdayData?.val_sg
              thursday_wi = thursdayData?.val_wi
              thursday_utilization_calc = thursdayData?.val_utilization_calc
  
              let fridayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_friday, nomPoint, value: e?.friday, day_: 'friday' })
              friday_hv = fridayData?.val_hv
              friday_sg = fridayData?.val_sg
              friday_wi = fridayData?.val_wi
              friday_utilization_calc = fridayData?.val_utilization_calc
  
              let saturdayData = fnEastWestE({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_saturday, nomPoint, value: e?.saturday, day_: 'saturday' })
              saturday_hv = saturdayData?.val_hv
              saturday_sg = saturdayData?.val_sg
              saturday_wi = saturdayData?.val_wi
              saturday_utilization_calc = saturdayData?.val_utilization_calc
            }else{
              const fnEastWestF2_G = ({ finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ, nomPoint, value, day_ }:any) => {
                const self_val_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), day_) : 0) // ถูก
                const self_val_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), day_) : 0) // ถูก
                const self_val_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), day_) : 0) // ถูก
             
                const F2_val_hv = this.roundTo3(this.fnHvCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data), day_) || 0)
                const F2_val_sg = this.roundTo4(this.fnSgCalc_nomtotal(this.fnsupplyRef_entry("F2", dataMMSCF, area_data), day_) || 0)
              
                // East_to_BVW10
                // East_to_RA6
                // West_to_BVW10
                // West_to_RA6
                let val_hv = this.roundTo3(((day_W_EW_OBJ?.East_to_BVW10 * self_val_hv) + (day_W_EW_OBJ?.West_to_BVW10 * F2_val_hv)) / (day_W_EW_OBJ?.East_to_BVW10 + day_W_EW_OBJ?.West_to_BVW10))
                let val_sg = this.roundTo4(((day_W_EW_OBJ?.East_to_BVW10 * self_val_sg)+(day_W_EW_OBJ?.West_to_BVW10*F2_val_sg)) / (day_W_EW_OBJ?.East_to_BVW10 + day_W_EW_OBJ?.West_to_BVW10))
                let val_wi = this.roundTo3((val_hv / 0.982596) / (Math.sqrt(val_sg)))
                let val_utilization_calc = this.roundTo2(((value / (val_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100))

                return {
                  val_hv,
                  val_sg,
                  val_wi,
                  val_utilization_calc,
                }
              }
              let sundayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_sunday, nomPoint, value: e?.sunday, day_: 'sunday' })
              sunday_hv = sundayData?.val_hv
              sunday_sg = sundayData?.val_sg
              sunday_wi = sundayData?.val_wi
              sunday_utilization_calc = sundayData?.val_utilization_calc
  
              let mondayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_monday, nomPoint, value: e?.monday, day_: 'monday' })
              monday_hv = mondayData?.val_hv
              monday_sg = mondayData?.val_sg
              monday_wi = mondayData?.val_wi
              monday_utilization_calc = mondayData?.val_utilization_calc
  
              let tuesdayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_tuesday, nomPoint, value: e?.tuesday, day_: 'tuesday' })
              tuesday_hv = tuesdayData?.val_hv
              tuesday_sg = tuesdayData?.val_sg
              tuesday_wi = tuesdayData?.val_wi
              tuesday_utilization_calc = tuesdayData?.val_utilization_calc
  
              let wednesdayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_wednesday, nomPoint, value: e?.wednesday, day_: 'wednesday' })
              wednesday_hv = wednesdayData?.val_hv
              wednesday_sg = wednesdayData?.val_sg
              wednesday_wi = wednesdayData?.val_wi
              wednesday_utilization_calc = wednesdayData?.val_utilization_calc
  
              let thursdayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_thursday, nomPoint, value: e?.thursday, day_: 'thursday' })
              thursday_hv = thursdayData?.val_hv
              thursday_sg = thursdayData?.val_sg
              thursday_wi = thursdayData?.val_wi
              thursday_utilization_calc = thursdayData?.val_utilization_calc
  
              let fridayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_friday, nomPoint, value: e?.friday, day_: 'friday' })
              friday_hv = fridayData?.val_hv
              friday_sg = fridayData?.val_sg
              friday_wi = fridayData?.val_wi
              friday_utilization_calc = fridayData?.val_utilization_calc
  
              let saturdayData = fnEastWestF2_G({finddataMMSCF, dataMMSCF, area_data, day_W_EW_OBJ: day_W_EW_OBJ_saturday, nomPoint, value: e?.saturday, day_: 'saturday' })
              saturday_hv = saturdayData?.val_hv
              saturday_sg = saturdayData?.val_sg
              saturday_wi = saturdayData?.val_wi
              saturday_utilization_calc = saturdayData?.val_utilization_calc

            }
            
          }else{

            sunday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'sunday') : 0) // ถูก
            sunday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'sunday') : 0) // ถูก
            sunday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'sunday') : 0) // ถูก
            sunday_utilization_calc = this.roundTo2((e?.sunday / (sunday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            monday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'monday') : 0) // ถูก
            monday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'monday') : 0) // ถูก
            monday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'monday') : 0) // ถูก
            monday_utilization_calc = this.roundTo2((e?.monday / (monday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            thursday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'thursday') : 0) // ถูก
            thursday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'thursday') : 0) // ถูก
            thursday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'thursday') : 0) // ถูก
            thursday_utilization_calc = this.roundTo2((e?.thursday / (thursday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            tuesday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'tuesday') : 0) // ถูก
            tuesday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'tuesday') : 0) // ถูก
            tuesday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'tuesday') : 0) // ถูก
            tuesday_utilization_calc = this.roundTo2((e?.tuesday / (tuesday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            wednesday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'wednesday') : 0) // ถูก
            wednesday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'wednesday') : 0) // ถูก
            wednesday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'wednesday') : 0) // ถูก
            wednesday_utilization_calc = this.roundTo2((e?.wednesday / (wednesday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            friday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'friday') : 0) // ถูก
            friday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'friday') : 0) // ถูก
            friday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'friday') : 0) // ถูก
            friday_utilization_calc = this.roundTo2((e?.friday / (friday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
  
            saturday_hv = this.roundTo3(finddataMMSCF ? this.fnHvCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'saturday') : 0) // ถูก
            saturday_wi = this.roundTo3(finddataMMSCF ? this.fnWiCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'saturday') : 0) // ถูก
            saturday_sg = this.roundTo4(finddataMMSCF ? this.fnSgCalc_nomtotal(this.fnsupplyRef_entry(finddataMMSCF?.area_text, dataMMSCF, area_data), 'saturday') : 0) // ถูก
            saturday_utilization_calc = this.roundTo2((e?.saturday / (saturday_hv * parseToNumber(nomPoint?.maximum_capacity ?? 0))) * 100)
          }

        }
      }

     

      return {

        sunday: sunday_,
        monday: monday_,
        thursday: thursday_,
        tuesday: tuesday_,
        wednesday: wednesday_,
        friday: friday_,
        saturday: saturday_,

        wi: wi_,
        hv: hv_,
        sg: sg_,
        units: e?.unix,
        area_text,
        entry_exit_id,
        // utilization: calc,
        utilization: utilization,
        arrNom,
        totalCap,

        sunday_utilization: sunday_utilization_calc,
        monday_utilization: monday_utilization_calc,
        tuesday_utilization: tuesday_utilization_calc,
        wednesday_utilization: wednesday_utilization_calc,
        thursday_utilization: thursday_utilization_calc,
        friday_utilization: friday_utilization_calc,
        saturday_utilization: saturday_utilization_calc,


        sunday_hv,
        sunday_wi,
        sunday_sg,

        monday_hv,
        monday_wi,
        monday_sg,
        
        tuesday_hv,
        tuesday_wi,
        tuesday_sg,
        
        wednesday_hv,
        wednesday_wi,
        wednesday_sg,
        
        thursday_hv,
        thursday_wi,
        thursday_sg,

        friday_hv,
        friday_wi,
        friday_sg,

        saturday_hv,
        saturday_wi,
        saturday_sg, 

        ...nE
      }
    })
    return result_all
  }

  // -----

  fnCalcMMBTUDtoMMSCFD(keys: any, hv: any, arrNom: any) {
    const calc_ = arrNom?.reduce((accumulator, currentValue) => this.roundTo6(accumulator + this.roundTo6(parseToNumber6Decimal(currentValue?.[keys] ?? 0) / this.roundTo3(hv))), 0)
    return calc_
  }

  fnDayExitMMSCFNewCalc(hv: any, arrNom: any, nomData: any, nomination_point: any) {
    let hourDay = {
      H1: this.fnCalcMMBTUDtoMMSCFD('H1', hv, arrNom),
      H2: this.fnCalcMMBTUDtoMMSCFD('H2', hv, arrNom),
      H3: this.fnCalcMMBTUDtoMMSCFD('H3', hv, arrNom),
      H4: this.fnCalcMMBTUDtoMMSCFD('H4', hv, arrNom),
      H5: this.fnCalcMMBTUDtoMMSCFD('H5', hv, arrNom),
      H6: this.fnCalcMMBTUDtoMMSCFD('H6', hv, arrNom),
      H7: this.fnCalcMMBTUDtoMMSCFD('H7', hv, arrNom),
      H8: this.fnCalcMMBTUDtoMMSCFD('H8', hv, arrNom),
      H9: this.fnCalcMMBTUDtoMMSCFD('H9', hv, arrNom),
      H10: this.fnCalcMMBTUDtoMMSCFD('H10', hv, arrNom),
      H11: this.fnCalcMMBTUDtoMMSCFD('H11', hv, arrNom),
      H12: this.fnCalcMMBTUDtoMMSCFD('H12', hv, arrNom),
      H13: this.fnCalcMMBTUDtoMMSCFD('H13', hv, arrNom),
      H14: this.fnCalcMMBTUDtoMMSCFD('H14', hv, arrNom),
      H15: this.fnCalcMMBTUDtoMMSCFD('H15', hv, arrNom),
      H16: this.fnCalcMMBTUDtoMMSCFD('H16', hv, arrNom),
      H17: this.fnCalcMMBTUDtoMMSCFD('H17', hv, arrNom),
      H18: this.fnCalcMMBTUDtoMMSCFD('H18', hv, arrNom),
      H19: this.fnCalcMMBTUDtoMMSCFD('H19', hv, arrNom),
      H20: this.fnCalcMMBTUDtoMMSCFD('H20', hv, arrNom),
      H21: this.fnCalcMMBTUDtoMMSCFD('H21', hv, arrNom),
      H22: this.fnCalcMMBTUDtoMMSCFD('H22', hv, arrNom),
      H23: this.fnCalcMMBTUDtoMMSCFD('H23', hv, arrNom),
      H24: this.fnCalcMMBTUDtoMMSCFD('H24', hv, arrNom)
    }
    const CalcTotalNew =
      this.roundTo6(parseToNumber(hourDay?.H1 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H2 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H3 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H4 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H5 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H6 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H7 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H8 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H9 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H10 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H11 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H12 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H13 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H14 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H15 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H16 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H17 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H18 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H19 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H20 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H21 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H22 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H23 ?? 0)) +
      this.roundTo6(parseToNumber(hourDay?.H24 ?? 0))

    if(nomination_point === "NGV-C4"){
      console.log('[NGV-C4] hourDay : ', hourDay);
      console.log('[NGV-C4] CalcTotalNew : ', CalcTotalNew);
    }

      let total = this.roundTo6(CalcTotalNew)
      let totalCap = this.roundTo6(CalcTotalNew)
      // let total = this.normalizeNumber(CalcTotalNew, 6)
      // let totalCap = this.normalizeNumber(CalcTotalNew, 6)
      
    const nomPoint = nomData?.find((f: any) => {
      return f?.nomination_point === nomination_point
    })
    let utilization = (total / parseToNumber(nomPoint?.maximum_capacity ?? 0)) * 100

    return {
      hourDay: hourDay,
      total: total,
      totalCap: totalCap,
      utilization: utilization
    }
  }

  truncateToInt(value: any, digits = 6) {
    const str = String(value ?? 0)
      .replace(/,/g, '')
      .trim()
    if (str === '' || isNaN(Number(str))) return 0

    const isNegative = str.startsWith('-')
    const clean = isNegative ? str.slice(1) : str

    const [intPart = '0', decPart = ''] = clean.split('.')
    const decimal = (decPart + '0'.repeat(digits)).slice(0, digits)

    const result = Number(intPart) * 10 ** digits + Number(decimal)

    return isNegative ? -result : result
  }

  formatFromInt(value: number, digits = 6) {
    const sign = value < 0 ? '-' : ''
    const abs = Math.abs(value)

    const factor = 10 ** digits
    const intPart = Math.floor(abs / factor)
    const decPart = String(abs % factor).padStart(digits, '0')

    return `${sign}${intPart}.${decPart}`
  }

  fnDayNewCalc(hourDay: any, arrNom: any, nomData: any) {
    const totalInt = Array.from({length: 24}, (_, i) => `H${i + 1}`).reduce((sum, key) => {
      return sum + this.truncateToInt(hourDay?.[key] ?? 0, 6)
    }, 0)

    const total = this.formatFromInt(totalInt, 6)

    return {
      total,
      totalCap: total
    }
  }


  // ----

  // ฟังชั่นกลาง ดึง all โดยไม่มีถ้า Daily ดึง Weekly (ไว้ใช้ในอานาคต)
  // EX: allDataWtoD({gas_day_text: "2026-01-01", statusNom:[2, 5]})
  async allDataWtoD(payload: any) {
    const {gas_day_text, statusNom} = payload
    const resData = await this.prisma.query_shipper_nomination_file.findMany({
      where: {
        NOT: {
          contract_code_id: null
        },
        OR: [
          {
            del_flag: false
          },
          {del_flag: null}
        ],
        query_shipper_nomination_status: {
          id: {
            in: statusNom
          }
        }
      },
      include: {
        group: true,
        query_shipper_nomination_status: true,
        contract_code: true,
        // submission_comment_query_shipper_nomination_file: true,
        nomination_type: true,
        nomination_version: {
          include: {
            nomination_full_json: true,
            nomination_full_json_sheet2: true,
            nomination_row_json: {
              include: {
                query_shipper_nomination_type: true
              },
              orderBy: {
                id: 'asc'
              }
            }
          },
          where: {
            flag_use: true
          }
        },
        query_shipper_nomination_file_renom: true
        // query_shipper_nomination_file_url: {
        //   include: {
        //     nomination_version: true,
        //     query_shipper_nomination_status: true,
        //     create_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //     update_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     id: 'desc',
        //   },
        // },
        // query_shipper_nomination_file_comment: {
        //   include: {
        //     query_shipper_nomination_type_comment: true,
        //     query_shipper_nomination_status: true,
        //     nomination_version: true,
        //     create_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //     update_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     id: 'desc',
        //   },
        // },
      },
      orderBy: {
        id: 'desc'
      }
    })
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const areaData = await this.prisma.area.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      include: {
        supply_reference_quality_area_by: {
          include: {
            zone: true
          }
        }
      }
    })

    const nomData = await this.prisma.nomination_point.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gt: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      include: {
        zone: {
          select: {
            name: true
          }
        },
        area: {
          select: {
            name: true
          }
        },
        entry_exit: true
      }
    })
    // const eva = await this.qualityPlanningService.findAllNoIntar();
    const eva = await this.qualityPlanningService.findAllNoIntarWait()

    let dailyWeeklyData = []

    const resDataCv = resData.map((e: any) => {
      const nomination_version = e['nomination_version'].map((nv: any) => {
        const nomination_full_json = nv['nomination_full_json'].map((nfj: any) => {
          nfj['data_temp'] = JSON.parse(nfj['data_temp'])
          return {
            ...nfj
          }
        })
        const nomination_row_json = nv['nomination_row_json'].map((nfj: any) => {
          nfj['data_temp'] = JSON.parse(nfj['data_temp'])
          return {
            ...nfj
          }
        })

        if (nomination_row_json.length > 0) {
          nomination_row_json.map((nx: any) => {
            dailyWeeklyData.push({
              nomination_type_id: e?.nomination_type_id,
              nomination_code: e?.nomination_code,
              gas_day: e?.gas_day,
              gas_day_text: dayjs(e?.gas_day).format('DD/MM/YYYY'),
              contract_code_id: e?.contract_code_id,
              group_id: e?.group_id,
              query_shipper_nomination_file_renom_id: e?.query_shipper_nomination_file_renom_id,
              submitted_timestamp: e?.submitted_timestamp,
              nomination_full_json: nomination_full_json[0],
              nomination_row_json: nx || null,
              unix: nx && nx['data_temp']['9'] || null,
              query_shipper_nomination_type_id: nx && nx?.query_shipper_nomination_type_id || null,
              query_shipper_nomination_type: nx && nx?.query_shipper_nomination_type || null,
              entry_exit_id: nx && nx?.entry_exit_id || null,
              nomination_point: nx && nx['data_temp']['3'] || null,
              area_text: nx && nx['data_temp']['2'] || null,
              zone_text: nx && nx['data_temp']['0'] || null
            })

            return nx
          })
        }

        return {
          ...nv,
          nomination_full_json,
          nomination_row_json
        }
      })

      return {
        ...e,
        nomination_version
      }
    })

    const dailyDataNewD = dailyWeeklyData?.filter((f: any) => f?.gas_day_text === gas_day_text)
    // วันอาทิตย์ของสัปดาห์นี้
    const wsunday = getTodayNowDDMMYYYYDfault(gas_day_text).startOf('week').format('DD/MM/YYYY')
    const dailyDataNewW = dailyWeeklyData?.filter((f: any) => f?.gas_day_text === wsunday)

    const dailyArr = dailyDataNewD.filter((f: any) => {
      return f?.nomination_type_id === 1
    })
    const weeklyArr = dailyDataNewW.filter((f: any) => {
      return f?.nomination_type_id === 2
    })

    const dailyArrNom = dailyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id === 1
    })
    const weeklyArrNom = weeklyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id === 1
    })

    let dailyArrNomMMSCFD = dailyArrNom?.filter((f: any) => {
      return f?.unix === 'MMSCFD'
    })
    let dailyArrNomMMBTUD = dailyArrNom?.filter((f: any) => {
      return f?.unix === 'MMBTU/D'
    })
    let weeklyArrNomMMSCFD = weeklyArrNom?.filter((f: any) => {
      return f?.unix === 'MMSCFD'
    })
    let weeklyArrNomMMBTUD = weeklyArrNom?.filter((f: any) => {
      return f?.unix === 'MMBTU/D'
    })

    // - - - - - -

    let dMMSCFD1 = dailyArrNomMMSCFD.map((e: any) => {
      const hourDay = {
        H1: e['nomination_row_json']?.['data_temp']?.['14'],
        H2: e['nomination_row_json']?.['data_temp']?.['15'],
        H3: e['nomination_row_json']?.['data_temp']?.['16'],
        H4: e['nomination_row_json']?.['data_temp']?.['17'],
        H5: e['nomination_row_json']?.['data_temp']?.['18'],
        H6: e['nomination_row_json']?.['data_temp']?.['19'],
        H7: e['nomination_row_json']?.['data_temp']?.['20'],
        H8: e['nomination_row_json']?.['data_temp']?.['21'],
        H9: e['nomination_row_json']?.['data_temp']?.['22'],
        H10: e['nomination_row_json']?.['data_temp']?.['23'],
        H11: e['nomination_row_json']?.['data_temp']?.['24'],
        H12: e['nomination_row_json']?.['data_temp']?.['25'],
        H13: e['nomination_row_json']?.['data_temp']?.['26'],
        H14: e['nomination_row_json']?.['data_temp']?.['27'],
        H15: e['nomination_row_json']?.['data_temp']?.['28'],
        H16: e['nomination_row_json']?.['data_temp']?.['29'],
        H17: e['nomination_row_json']?.['data_temp']?.['30'],
        H18: e['nomination_row_json']?.['data_temp']?.['31'],
        H19: e['nomination_row_json']?.['data_temp']?.['32'],
        H20: e['nomination_row_json']?.['data_temp']?.['33'],
        H21: e['nomination_row_json']?.['data_temp']?.['34'],
        H22: e['nomination_row_json']?.['data_temp']?.['35'],
        H23: e['nomination_row_json']?.['data_temp']?.['36'],
        H24: e['nomination_row_json']?.['data_temp']?.['37'],
        total: e['nomination_row_json']?.['data_temp']?.['38']
      }

      const calcMMBTUDTotal = (hDay: any) => {
        let H1 = !!hDay?.['H1'] ? parseToNumber(hDay?.['H1']) : 0
        let H2 = !!hDay?.['H2'] ? parseToNumber(hDay?.['H2']) : 0
        let H3 = !!hDay?.['H3'] ? parseToNumber(hDay?.['H3']) : 0
        let H4 = !!hDay?.['H4'] ? parseToNumber(hDay?.['H4']) : 0
        let H5 = !!hDay?.['H5'] ? parseToNumber(hDay?.['H5']) : 0
        let H6 = !!hDay?.['H6'] ? parseToNumber(hDay?.['H6']) : 0
        let H7 = !!hDay?.['H7'] ? parseToNumber(hDay?.['H7']) : 0
        let H8 = !!hDay?.['H8'] ? parseToNumber(hDay?.['H8']) : 0
        let H9 = !!hDay?.['H9'] ? parseToNumber(hDay?.['H9']) : 0
        let H10 = !!hDay?.['H10'] ? parseToNumber(hDay?.['H10']) : 0
        let H11 = !!hDay?.['H11'] ? parseToNumber(hDay?.['H11']) : 0
        let H12 = !!hDay?.['H12'] ? parseToNumber(hDay?.['H12']) : 0
        let H13 = !!hDay?.['H13'] ? parseToNumber(hDay?.['H13']) : 0
        let H14 = !!hDay?.['H14'] ? parseToNumber(hDay?.['H14']) : 0
        let H15 = !!hDay?.['H15'] ? parseToNumber(hDay?.['H15']) : 0
        let H16 = !!hDay?.['H16'] ? parseToNumber(hDay?.['H16']) : 0
        let H17 = !!hDay?.['H17'] ? parseToNumber(hDay?.['H17']) : 0
        let H18 = !!hDay?.['H18'] ? parseToNumber(hDay?.['H18']) : 0
        let H19 = !!hDay?.['H19'] ? parseToNumber(hDay?.['H19']) : 0
        let H20 = !!hDay?.['H20'] ? parseToNumber(hDay?.['H20']) : 0
        let H21 = !!hDay?.['H21'] ? parseToNumber(hDay?.['H21']) : 0
        let H22 = !!hDay?.['H22'] ? parseToNumber(hDay?.['H22']) : 0
        let H23 = !!hDay?.['H23'] ? parseToNumber(hDay?.['H23']) : 0
        let H24 = !!hDay?.['H24'] ? parseToNumber(hDay?.['H24']) : 0

        let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24
        let calcFD = vl || 0
        return calcFD
      }

      let totalCap = calcMMBTUDTotal(hourDay)
      let total = calcMMBTUDTotal(hourDay)

      // let totalCap =
      //   e['nomination_row_json']?.['data_temp']?.['38']?.replace(/,/g, '') ||
      //   null;
      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === e['nomination_point']
      })
      let utilization = (Number(totalCap) / Number(nomPoint?.maximum_capacity ?? 0)) * 100

      return {
        ...e,
        totalCap,
        total,
        utilization,
        ...hourDay
      }
    })

    let dMMBTUD1 = (dailyArrNomMMBTUD || []).map((e: any) => {
      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === e?.nomination_point
      })

      const supplyRef = areaData?.find((f: any) => {
        return f?.name === e?.area_text
      })

      let filDayWFormEva: any =
        e?.entry_exit_id === 1
          ? eva?.newDaily
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day_text)
              ?.filter((f: any) => f?.zone?.name === e?.zone_text)
              ?.filter((f: any) => f?.area?.name === e?.area_text)?.[0] || null
          : eva?.newDaily
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day_text)
              ?.filter((f: any) => f?.zone?.name === supplyRef?.supply_reference_quality_area_by?.zone?.name)
              ?.filter((f: any) => f?.area?.name === supplyRef?.supply_reference_quality_area_by?.name)?.[0] || null

      let hv = filDayWFormEva?.valueBtuScf || 0

      const hourDay = {
        H1: e['nomination_row_json']?.['data_temp']?.['14'],
        H2: e['nomination_row_json']?.['data_temp']?.['15'],
        H3: e['nomination_row_json']?.['data_temp']?.['16'],
        H4: e['nomination_row_json']?.['data_temp']?.['17'],
        H5: e['nomination_row_json']?.['data_temp']?.['18'],
        H6: e['nomination_row_json']?.['data_temp']?.['19'],
        H7: e['nomination_row_json']?.['data_temp']?.['20'],
        H8: e['nomination_row_json']?.['data_temp']?.['21'],
        H9: e['nomination_row_json']?.['data_temp']?.['22'],
        H10: e['nomination_row_json']?.['data_temp']?.['23'],
        H11: e['nomination_row_json']?.['data_temp']?.['24'],
        H12: e['nomination_row_json']?.['data_temp']?.['25'],
        H13: e['nomination_row_json']?.['data_temp']?.['26'],
        H14: e['nomination_row_json']?.['data_temp']?.['27'],
        H15: e['nomination_row_json']?.['data_temp']?.['28'],
        H16: e['nomination_row_json']?.['data_temp']?.['29'],
        H17: e['nomination_row_json']?.['data_temp']?.['30'],
        H18: e['nomination_row_json']?.['data_temp']?.['31'],
        H19: e['nomination_row_json']?.['data_temp']?.['32'],
        H20: e['nomination_row_json']?.['data_temp']?.['33'],
        H21: e['nomination_row_json']?.['data_temp']?.['34'],
        H22: e['nomination_row_json']?.['data_temp']?.['35'],
        H23: e['nomination_row_json']?.['data_temp']?.['36'],
        H24: e['nomination_row_json']?.['data_temp']?.['37'],
        total: e['nomination_row_json']?.['data_temp']?.['38']
      }

      const calcMMBTUDTotal = (hDay: any) => {
        let H1 = !!hDay?.['H1'] ? parseToNumber(hDay?.['H1']) : 0
        let H2 = !!hDay?.['H2'] ? parseToNumber(hDay?.['H2']) : 0
        let H3 = !!hDay?.['H3'] ? parseToNumber(hDay?.['H3']) : 0
        let H4 = !!hDay?.['H4'] ? parseToNumber(hDay?.['H4']) : 0
        let H5 = !!hDay?.['H5'] ? parseToNumber(hDay?.['H5']) : 0
        let H6 = !!hDay?.['H6'] ? parseToNumber(hDay?.['H6']) : 0
        let H7 = !!hDay?.['H7'] ? parseToNumber(hDay?.['H7']) : 0
        let H8 = !!hDay?.['H8'] ? parseToNumber(hDay?.['H8']) : 0
        let H9 = !!hDay?.['H9'] ? parseToNumber(hDay?.['H9']) : 0
        let H10 = !!hDay?.['H10'] ? parseToNumber(hDay?.['H10']) : 0
        let H11 = !!hDay?.['H11'] ? parseToNumber(hDay?.['H11']) : 0
        let H12 = !!hDay?.['H12'] ? parseToNumber(hDay?.['H12']) : 0
        let H13 = !!hDay?.['H13'] ? parseToNumber(hDay?.['H13']) : 0
        let H14 = !!hDay?.['H14'] ? parseToNumber(hDay?.['H14']) : 0
        let H15 = !!hDay?.['H15'] ? parseToNumber(hDay?.['H15']) : 0
        let H16 = !!hDay?.['H16'] ? parseToNumber(hDay?.['H16']) : 0
        let H17 = !!hDay?.['H17'] ? parseToNumber(hDay?.['H17']) : 0
        let H18 = !!hDay?.['H18'] ? parseToNumber(hDay?.['H18']) : 0
        let H19 = !!hDay?.['H19'] ? parseToNumber(hDay?.['H19']) : 0
        let H20 = !!hDay?.['H20'] ? parseToNumber(hDay?.['H20']) : 0
        let H21 = !!hDay?.['H21'] ? parseToNumber(hDay?.['H21']) : 0
        let H22 = !!hDay?.['H22'] ? parseToNumber(hDay?.['H22']) : 0
        let H23 = !!hDay?.['H23'] ? parseToNumber(hDay?.['H23']) : 0
        let H24 = !!hDay?.['H24'] ? parseToNumber(hDay?.['H24']) : 0

        let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24

        let calcFD = vl || 0

        return calcFD
      }

      let totalCap = calcMMBTUDTotal(hourDay)
      let total = calcMMBTUDTotal(hourDay)

      let utilization = hv === 0 ? 0 : (Number(totalCap) / (Number(nomPoint?.maximum_capacity ?? 0) * Number(hv))) * 100

      return {
        ...e,
        totalCap,
        total,
        utilization,
        ...hourDay
      }
    })

    let wMMSCFD1 = weeklyArrNomMMSCFD.map((e: any) => {
      let sundayTotalCap = e['nomination_row_json']?.['data_temp']?.['14']?.replace(/,/g, '') || null
      let mondayTotalCap = e['nomination_row_json']?.['data_temp']?.['15']?.replace(/,/g, '') || null
      let tuesdayTotalCap = e['nomination_row_json']?.['data_temp']?.['16']?.replace(/,/g, '') || null
      let wednesdayTotalCap = e['nomination_row_json']?.['data_temp']?.['17']?.replace(/,/g, '') || null
      let thursdayTotalCap = e['nomination_row_json']?.['data_temp']?.['18']?.replace(/,/g, '') || null
      let fridayTotalCap = e['nomination_row_json']?.['data_temp']?.['19']?.replace(/,/g, '') || null
      let saturdayTotalCap = e['nomination_row_json']?.['data_temp']?.['20']?.replace(/,/g, '') || null
      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === e['nomination_point']
      })

      const calcWeek = (cap: any, maximum_capacity: any) => {
        if (Number.isFinite((parseToNumber3Decimal(cap ?? 0) / Number(maximum_capacity ?? 0)) * 100)) {
          return (parseToNumber3Decimal(cap ?? 0) / Number(maximum_capacity ?? 0)) * 100
        } else {
          return 0
        }
      }

      const dayWeek = {
        gas_day_sunday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(0, 'day').format('DD/MM/YYYY'),
        sunday: e['nomination_row_json']?.['data_temp']?.['14'] || 0,
        sunday_utilization: calcWeek(sundayTotalCap, nomPoint?.maximum_capacity),
        gas_day_monday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(1, 'day').format('DD/MM/YYYY'),
        monday: e['nomination_row_json']?.['data_temp']?.['15'] || 0,
        monday_utilization: calcWeek(mondayTotalCap, nomPoint?.maximum_capacity),
        gas_day_tuesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(2, 'day').format('DD/MM/YYYY'),
        tuesday: e['nomination_row_json']?.['data_temp']?.['16'] || 0,
        tuesday_utilization: calcWeek(tuesdayTotalCap, nomPoint?.maximum_capacity),
        gas_day_wednesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(3, 'day').format('DD/MM/YYYY'),
        wednesday: e['nomination_row_json']?.['data_temp']?.['17'] || 0,
        wednesday_utilization: calcWeek(wednesdayTotalCap, nomPoint?.maximum_capacity),
        gas_day_thursday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(4, 'day').format('DD/MM/YYYY'),
        thursday: e['nomination_row_json']?.['data_temp']?.['18'] || 0,
        thursday_utilization: calcWeek(thursdayTotalCap, nomPoint?.maximum_capacity),
        gas_day_friday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(5, 'day').format('DD/MM/YYYY'),
        friday: e['nomination_row_json']?.['data_temp']?.['19'] || 0,
        friday_utilization: calcWeek(fridayTotalCap, nomPoint?.maximum_capacity),
        gas_day_saturday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(6, 'day').format('DD/MM/YYYY'),
        saturday: e['nomination_row_json']?.['data_temp']?.['20'] || 0,
        saturday_utilization: calcWeek(saturdayTotalCap, nomPoint?.maximum_capacity)
      }

      return {
        ...e,
        ...dayWeek
      }
    })

    let wMMBTUD1 = (weeklyArrNomMMBTUD || []).map((e: any) => {
      let sundayTotalCap = e['nomination_row_json']?.['data_temp']?.['14']?.replace(/,/g, '') || null
      let mondayTotalCap = e['nomination_row_json']?.['data_temp']?.['15']?.replace(/,/g, '') || null
      let tuesdayTotalCap = e['nomination_row_json']?.['data_temp']?.['16']?.replace(/,/g, '') || null
      let wednesdayTotalCap = e['nomination_row_json']?.['data_temp']?.['17']?.replace(/,/g, '') || null
      let thursdayTotalCap = e['nomination_row_json']?.['data_temp']?.['18']?.replace(/,/g, '') || null
      let fridayTotalCap = e['nomination_row_json']?.['data_temp']?.['19']?.replace(/,/g, '') || null
      let saturdayTotalCap = e['nomination_row_json']?.['data_temp']?.['20']?.replace(/,/g, '') || null

      // https://app.clickup.com/t/86etzchey
      let filDayWFormEva =
        eva?.newWeekly
          ?.filter((f: any) => f?.parameter === 'HV')
          ?.filter((f: any) => f?.gasday === e?.gas_day_text)
          ?.filter((f: any) => f?.zone?.name === e?.zone_text)
          ?.filter((f: any) => f?.area?.name === e?.area_text)?.[0] || null

      const findHvsundayHv = filDayWFormEva?.sunday?.value || 0
      // newWeekly?.find((f: any) => {
      //   return (
      //     f?.['sunday']?.date === e?.gas_day_text && f?.parameter === 'HV'
      //   );
      // })?.['saturday']?.['value'] || 0;
      const findHvmondayHv = filDayWFormEva?.monday?.value || 0
      // newWeekly?.find((f: any) => {
      //   return (
      //     f?.['monday']?.date ===
      //       dayjs(e?.gas_day_text, 'DD/MM/YYYY')
      //         .add(1, 'day')
      //         .format('DD/MM/YYYY') && f?.parameter === 'HV'
      //   );
      // })?.['monday']?.['value'] || 0;
      const findHvtuesdayHv = filDayWFormEva?.tuesday?.value || 0
      // newWeekly?.find((f: any) => {
      //   return (
      //     f?.['tuesday']?.date ===
      //       dayjs(e?.gas_day_text, 'DD/MM/YYYY')
      //         .add(2, 'day')
      //         .format('DD/MM/YYYY') && f?.parameter === 'HV'
      //   );
      // })?.['tuesday']?.['value'] || 0;
      const findHvwednesdayHv = filDayWFormEva?.wednesday?.value || 0
      // newWeekly?.find((f: any) => {
      //   return (
      //     f?.['wednesday']?.date ===
      //       dayjs(e?.gas_day_text, 'DD/MM/YYYY')
      //         .add(3, 'day')
      //         .format('DD/MM/YYYY') && f?.parameter === 'HV'
      //   );
      // })?.['wednesday']?.['value'] || 0;
      const findHvthursdayHv = filDayWFormEva?.thursday?.value || 0
      // newWeekly?.find((f: any) => {
      //   return (
      //     f?.['thursday']?.date ===
      //       dayjs(e?.gas_day_text, 'DD/MM/YYYY')
      //         .add(4, 'day')
      //         .format('DD/MM/YYYY') && f?.parameter === 'HV'
      //   );
      // })?.['thursday']?.['value'] || 0;
      const findHvfridayHv = filDayWFormEva?.friday?.value || 0
      // newWeekly?.find((f: any) => {
      //   return (
      //     f?.['friday']?.date ===
      //       dayjs(e?.gas_day_text, 'DD/MM/YYYY')
      //         .add(5, 'day')
      //         .format('DD/MM/YYYY') && f?.parameter === 'HV'
      //   );
      // })?.['friday']?.['value'] || 0;
      const findHvsaturdayHv = filDayWFormEva?.saturday?.value || 0
      // newWeekly?.find((f: any) => {
      //   return (
      //     f?.['saturday']?.date ===
      //       dayjs(e?.gas_day_text, 'DD/MM/YYYY')
      //         .add(6, 'day')
      //         .format('DD/MM/YYYY') && f?.parameter === 'HV'
      //   );
      // })?.['saturday']?.['value'] || 0;

      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === e['nomination_point']
      })

      // hv จาก Eva

      const calcWeek = (cap: any, maximum_capacity: any, cHv: any) => {
        if (Number.isFinite((Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100)) {
          return (Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100
        } else {
          return 0
        }
      }

      const dayWeek = {
        sunday: e['nomination_row_json']?.['data_temp']?.['14'] || 0,
        sunday_utilization: calcWeek(sundayTotalCap, nomPoint?.maximum_capacity, findHvsundayHv),
        monday: e['nomination_row_json']?.['data_temp']?.['15'] || 0,
        monday_utilization: calcWeek(mondayTotalCap, nomPoint?.maximum_capacity, findHvmondayHv),
        tuesday: e['nomination_row_json']?.['data_temp']?.['16'] || 0,
        tuesday_utilization: calcWeek(tuesdayTotalCap, nomPoint?.maximum_capacity, findHvtuesdayHv),
        wednesday: e['nomination_row_json']?.['data_temp']?.['17'] || 0,
        wednesday_utilization: calcWeek(wednesdayTotalCap, nomPoint?.maximum_capacity, findHvwednesdayHv),
        thursday: e['nomination_row_json']?.['data_temp']?.['18'] || 0,
        thursday_utilization: calcWeek(thursdayTotalCap, nomPoint?.maximum_capacity, findHvthursdayHv),
        friday: e['nomination_row_json']?.['data_temp']?.['19'] || 0,
        friday_utilization: calcWeek(fridayTotalCap, nomPoint?.maximum_capacity, findHvfridayHv),
        saturday: e['nomination_row_json']?.['data_temp']?.['20'] || 0,
        saturday_utilization: calcWeek(saturdayTotalCap, nomPoint?.maximum_capacity, findHvsaturdayHv)
      }

      return {
        ...e,
        ...dayWeek
      }
    })

    const groupByKeysALL = (item: any) => `${item?.gas_day_text}${item?.nomination_point}`

    const groupByKeys = (item: any) => `${item?.gas_day_text}${item?.nomination_point}|${item?.nomination_code}`

    const horuss = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11', 'H12', 'H13', 'H14', 'H15', 'H16', 'H17', 'H18', 'H19', 'H20', 'H21', 'H22', 'H23', 'H24']

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

    // let dMMSCFD1_tabnom = [...dMMSCFD1, ...dExitMMBTUDtoMMSCFD1, ]; // D exit MMBTU > MMSCF
    // let wMMSCFD1_tabnom = [...wMMSCFD1, ...wExitMMBTUDtoMMSCFD1, ]; // W exit MMBTU > MMSCF
    let dMMSCFD1_tabnom = [...dMMSCFD1]
    let wMMSCFD1_tabnom = [...wMMSCFD1]

    const fnGroupByKeysALL = (nData: any, DH: any) => {
      return Object.values(
        nData.reduce(
          (acc, item) => {
            const key = groupByKeysALL(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom: [item],
                arrContractId: [item?.contract_code_id]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }
              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrNom'] = [...acc[key]['arrNom'], item]
              acc[key]['arrContractId'] = item && [...acc[key]['arrContractId'], item?.contract_code_id] || acc[key]['arrContractId']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }

    const fnGroupByKeys = (nData: any, DH: any) => {
      return Object.values(
        nData.reduce(
          (acc, item) => {
            const key = groupByKeys(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom: [item],
                arrContractId: [item?.contract_code_id]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }
              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrNom'] = [...acc[key]['arrNom'], item]
              acc[key]['arrContractId'] = item && [...acc[key]['arrContractId'], item?.contract_code_id] || acc[key]['arrContractId']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }

    const fnWtoDPointContract = (week_: any, day_: any) => {
      const toArr_ = (x: any) => (Array.isArray(x) ? x : x == null ? [] : [x])
      const idx_ = new Map<string, Set<string>>()
      for (const e of day_ ?? []) {
        const key = String(e?.gas_day_text).trim()
        const set = idx_.get(key) ?? new Set<string>()
        for (const id of toArr_(e?.arrContractId)) set.add(String(id))
        idx_.set(key, set)
      }

      const result = (week_ ?? []).filter((item) => {
        const set = idx_.get(String(item?.gas_day_text).trim())
        if (!set) return true
        return toArr_(item?.arrContractId).every((id) => !set.has(String(id)))
      })
      return result
    }

    const fnGroupByKeysFinal = (nData: any, DH: any) => {
      return Object.values(
        nData.reduce(
          (acc, item) => {
            const key = groupByKeys(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom_: [item?.arrNom],
                arrContractId_: [item?.arrContractId]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                // normalizeNumber
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }

              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrNom_'] = item && [...acc[key]['arrNom_'], item?.arrNom] || acc[key]['arrNom_']
              acc[key]['arrContractId_'] = item && [...acc[key]['arrContractId_'], item?.arrContractId] || acc[key]['arrContractId_']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }

    const fnGroupByKeysALLFinal = (nData: any, DH: any) => {
      return Object.values(
        nData.reduce(
          (acc, item) => {
            const key = groupByKeysALL(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom_: [item?.arrNom],
                arrContractId_: [item?.arrContractId]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                // normalizeNumber
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }

              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrNom_'] = item && [...acc[key]['arrNom_'], item?.arrNom] || acc[key]['arrNom_']
              acc[key]['arrContractId_'] = item && [...acc[key]['arrContractId_'], item?.arrContractId] || acc[key]['arrContractId_']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }

    // ---------
    const dMMSCFD_tabnom: any = fnGroupByKeysALL(dMMSCFD1_tabnom, horuss)
    const wMMSCFD_tabnom: any = fnGroupByKeys(wMMSCFD1_tabnom, days)
    const allwMMSCFD_tabnom = wMMSCFD_tabnom?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg
      } = all

      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()
      let totalW = null
      let utilizationW = null

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          utilizationW = all && all?.sunday_utilization || 0
          break

        case 1:
          totalW = all && all?.monday || 0
          utilizationW = all && all?.monday_utilization || 0
          break

        case 2:
          totalW = all && all?.tuesday || 0
          utilizationW = all && all?.tuesday_utilization || 0
          break

        case 3:
          totalW = all && all?.wednesday || 0
          utilizationW = all && all?.wednesday_utilization || 0
          break

        case 4:
          totalW = all && all?.thursday || 0
          utilizationW = all && all?.thursday_utilization || 0
          break

        case 5:
          totalW = all && all?.friday || 0
          utilizationW = all && all?.friday_utilization || 0
          break

        case 6:
          totalW = all && all?.saturday || 0
          utilizationW = all && all?.saturday_utilization || 0
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: totalW,
        utilization: utilizationW,
        H1: totalW / 24 || 0,
        H2: totalW / 24 || 0,
        H3: totalW / 24 || 0,
        H4: totalW / 24 || 0,
        H5: totalW / 24 || 0,
        H6: totalW / 24 || 0,
        H7: totalW / 24 || 0,
        H8: totalW / 24 || 0,
        H9: totalW / 24 || 0,
        H10: totalW / 24 || 0,
        H11: totalW / 24 || 0,
        H12: totalW / 24 || 0,
        H13: totalW / 24 || 0,
        H14: totalW / 24 || 0,
        H15: totalW / 24 || 0,
        H16: totalW / 24 || 0,
        H17: totalW / 24 || 0,
        H18: totalW / 24 || 0,
        H19: totalW / 24 || 0,
        H20: totalW / 24 || 0,
        H21: totalW / 24 || 0,
        H22: totalW / 24 || 0,
        H23: totalW / 24 || 0,
        H24: totalW / 24 || 0,
        total: totalW
      }
    })
    const dallwMMSCFD_tabnom: any = fnGroupByKeys(allwMMSCFD_tabnom, horuss)

    const resultallwMMSCFD_tabnom_ = fnWtoDPointContract(dallwMMSCFD_tabnom, dMMSCFD_tabnom)
    const resultallwMMSCFD_tabnom: any = fnGroupByKeysFinal(resultallwMMSCFD_tabnom_, horuss)
    const resultallwMMSCFDOnce: any = fnGroupByKeysALLFinal(resultallwMMSCFD_tabnom, horuss)

    const fDWaMMSCFDcalcOnce = [...dMMSCFD_tabnom, ...resultallwMMSCFDOnce]
    let fDWallMMSCFDOnce = [...fDWaMMSCFDcalcOnce?.filter((f: any) => f?.nomination_type_id === 1)]
    let fDWaMMSCFDWOnce = [...fDWaMMSCFDcalcOnce?.filter((f: any) => f?.nomination_type_id === 2)]

    let addfDWaMMSCFDWOnce = []
    if (fDWallMMSCFDOnce.length > 0) {
      fDWaMMSCFDWOnce?.map((e: any) => {
        const findW = fDWallMMSCFDOnce?.find((f: any) => {
          return f?.gas_day_text === e?.gas_day_text && f?.nomination_point === e?.nomination_point
        })
        if (findW) {
          const {arrContractId, arrNom, total, totalCap, utilization, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...newE} = e
          const nData = {
            ...findW,
            arrContractId: [...arrContractId, ...findW?.arrContractId],
            arrNom: [...arrNom, ...findW?.arrNom],
            total: (total ? parseToNumber(total) : 0) + (findW?.total ? parseToNumber(findW.total) : 0),
            totalCap: (totalCap ? parseToNumber(totalCap) : 0) + (findW?.totalCap ? parseToNumber(findW.totalCap) : 0),
            utilization: parseToNumber((utilization ? parseToNumber(utilization) : 0) + (findW?.utilization ? parseToNumber(findW.utilization) : 0)) ?? 0,
            // this.normalizeNumber_
            H1: parseToNumber(H1) + (parseToNumber(findW?.H1) ? parseToNumber(findW.H1) : 0),
            H2: parseToNumber(H2) + (parseToNumber(findW?.H2) ? parseToNumber(findW.H2) : 0),
            H3: parseToNumber(H3) + (parseToNumber(findW?.H3) ? parseToNumber(findW.H3) : 0),
            H4: parseToNumber(H4) + (parseToNumber(findW?.H4) ? parseToNumber(findW.H4) : 0),
            H5: parseToNumber(H5) + (parseToNumber(findW?.H5) ? parseToNumber(findW.H5) : 0),
            H6: parseToNumber(H6) + (parseToNumber(findW?.H6) ? parseToNumber(findW.H6) : 0),
            H7: parseToNumber(H7) + (parseToNumber(findW?.H7) ? parseToNumber(findW.H7) : 0),
            H8: parseToNumber(H8) + (parseToNumber(findW?.H8) ? parseToNumber(findW.H8) : 0),
            H9: parseToNumber(H9) + (parseToNumber(findW?.H9) ? parseToNumber(findW.H9) : 0),
            H10: parseToNumber(H10) + (parseToNumber(findW?.H10) ? parseToNumber(findW.H10) : 0),
            H11: parseToNumber(H11) + (parseToNumber(findW?.H11) ? parseToNumber(findW.H11) : 0),
            H12: parseToNumber(H12) + (parseToNumber(findW?.H12) ? parseToNumber(findW.H12) : 0),
            H13: parseToNumber(H13) + (parseToNumber(findW?.H13) ? parseToNumber(findW.H13) : 0),
            H14: parseToNumber(H14) + (parseToNumber(findW?.H14) ? parseToNumber(findW.H14) : 0),
            H15: parseToNumber(H15) + (parseToNumber(findW?.H15) ? parseToNumber(findW.H15) : 0),
            H16: parseToNumber(H16) + (parseToNumber(findW?.H16) ? parseToNumber(findW.H16) : 0),
            H17: parseToNumber(H17) + (parseToNumber(findW?.H17) ? parseToNumber(findW.H17) : 0),
            H18: parseToNumber(H18) + (parseToNumber(findW?.H18) ? parseToNumber(findW.H18) : 0),
            H19: parseToNumber(H19) + (parseToNumber(findW?.H19) ? parseToNumber(findW.H19) : 0),
            H20: parseToNumber(H20) + (parseToNumber(findW?.H20) ? parseToNumber(findW.H20) : 0),
            H21: parseToNumber(H21) + (parseToNumber(findW?.H21) ? parseToNumber(findW.H21) : 0),
            H22: parseToNumber(H22) + (parseToNumber(findW?.H22) ? parseToNumber(findW.H22) : 0),
            H23: parseToNumber(H23) + (parseToNumber(findW?.H23) ? parseToNumber(findW.H23) : 0),
            H24: parseToNumber(H24) + (parseToNumber(findW?.H24) ? parseToNumber(findW.H24) : 0)
          }
          fDWallMMSCFDOnce = fDWallMMSCFDOnce?.map((old: any) => {
            if (findW?.gas_day_text === old?.gas_day_text && findW?.nomination_point === old?.nomination_point) {
              return {
                ...nData,
                utilization: parseToNumber(nData?.utilization ?? 0)
              }
            } else {
              return {
                ...old,
                utilization: parseToNumber(old?.utilization ?? 0)
              }
            }
          })
        } else {
          addfDWaMMSCFDWOnce?.push({
            ...e,
            utilization: parseToNumber(e?.utilization ?? 0)
          })
        }
        return e
      })
      fDWallMMSCFDOnce = [...fDWallMMSCFDOnce, ...addfDWaMMSCFDWOnce]
    } else {
      fDWallMMSCFDOnce = fDWaMMSCFDcalcOnce
    }

    // ---------
    const dMMBTUD: any = fnGroupByKeysALL(dMMBTUD1, horuss)
    const wMMBTUD: any = fnGroupByKeys(wMMBTUD1, days)
    const allwMMBTUD = wMMBTUD?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        unix,
        wi,
        hv,
        sg
      } = all

      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()

      let totalW = null
      let utilizationW = null

      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === nomination_point
      })

      const supplyRef = areaData?.find((f: any) => {
        return f?.name === area_text
      })

      let filDayWFormEva =
        entry_exit_id === 1
          ? eva?.newWeekly
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day_text)
              ?.filter((f: any) => f?.zone?.name === zone_text)
              ?.filter((f: any) => f?.area?.name === area_text)?.[0] || null
          : eva?.newWeekly
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day_text)
              ?.filter((f: any) => f?.zone?.name === supplyRef?.supply_reference_quality_area_by?.zone?.name)
              ?.filter((f: any) => f?.area?.name === supplyRef?.supply_reference_quality_area_by?.name)?.[0] || null

      const findHvsundayHv = filDayWFormEva?.sunday?.value || 0
      const findHvmondayHv = filDayWFormEva?.monday?.value || 0
      const findHvtuesdayHv = filDayWFormEva?.tuesday?.value || 0
      const findHvwednesdayHv = filDayWFormEva?.wednesday?.value || 0
      const findHvthursdayHv = filDayWFormEva?.thursday?.value || 0
      const findHvfridayHv = filDayWFormEva?.friday?.value || 0
      const findHvsaturdayHv = filDayWFormEva?.saturday?.value || 0

      const calcWeek = (cap: any, maximum_capacity: any, cHv: any) => {
        if (Number.isFinite((Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100)) {
          return (Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100
        } else {
          return 0
        }
      }

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          utilizationW = calcWeek(all?.sunday, nomPoint?.maximum_capacity, findHvsundayHv)

          break

        case 1:
          totalW = all && all?.monday || 0
          utilizationW = calcWeek(all?.monday, nomPoint?.maximum_capacity, findHvmondayHv)
          // utilizationW = all && all?.monday_utilization || 0;
          break

        case 2:
          totalW = all && all?.tuesday || 0
          utilizationW = calcWeek(all?.tuesday, nomPoint?.maximum_capacity, findHvtuesdayHv)
          // utilizationW = all && all?.tuesday_utilization || 0;
          break

        case 3:
          totalW = all && all?.wednesday || 0
          utilizationW = calcWeek(all?.wednesday, nomPoint?.maximum_capacity, findHvwednesdayHv)
          // utilizationW = all && all?.wednesday_utilization || 0;
          break

        case 4:
          totalW = all && all?.thursday || 0
          utilizationW = calcWeek(all?.thursday, nomPoint?.maximum_capacity, findHvthursdayHv)
          // utilizationW = all && all?.thursday_utilization || 0;
          break

        case 5:
          totalW = all && all?.friday || 0
          utilizationW = calcWeek(all?.friday, nomPoint?.maximum_capacity, findHvfridayHv)
          // utilizationW = all && all?.friday_utilization || 0;
          break

        case 6:
          totalW = all && all?.saturday || 0
          utilizationW = calcWeek(all?.saturday, nomPoint?.maximum_capacity, findHvsaturdayHv)
          // utilizationW = all && all?.saturday_utilization || 0;
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: totalW,
        utilization: utilizationW,
        H1: totalW / 24 || 0,
        H2: totalW / 24 || 0,
        H3: totalW / 24 || 0,
        H4: totalW / 24 || 0,
        H5: totalW / 24 || 0,
        H6: totalW / 24 || 0,
        H7: totalW / 24 || 0,
        H8: totalW / 24 || 0,
        H9: totalW / 24 || 0,
        H10: totalW / 24 || 0,
        H11: totalW / 24 || 0,
        H12: totalW / 24 || 0,
        H13: totalW / 24 || 0,
        H14: totalW / 24 || 0,
        H15: totalW / 24 || 0,
        H16: totalW / 24 || 0,
        H17: totalW / 24 || 0,
        H18: totalW / 24 || 0,
        H19: totalW / 24 || 0,
        H20: totalW / 24 || 0,
        H21: totalW / 24 || 0,
        H22: totalW / 24 || 0,
        H23: totalW / 24 || 0,
        H24: totalW / 24 || 0,
        total: totalW
      }
    })
    const dallwMMBTUD: any = fnGroupByKeys(allwMMBTUD, horuss)

    const resultallwMMBTUD_ = fnWtoDPointContract(dallwMMBTUD, dMMBTUD)
    const resultallwMMBTUDOnce: any = fnGroupByKeysALLFinal(resultallwMMBTUD_, horuss)
    const fDWallwMMBTUDcalcOnce = [...dMMBTUD, ...resultallwMMBTUDOnce]

    let fDWallwMMBTUDOnce = [...fDWallwMMBTUDcalcOnce?.filter((f: any) => f?.nomination_type_id === 1)]
    let fDWallwMMBTUDWOnce = [...fDWallwMMBTUDcalcOnce?.filter((f: any) => f?.nomination_type_id === 2)]
    let addfDWallwMMBTUDDWOnce = []
    if (fDWallwMMBTUDOnce.length > 0) {
      fDWallwMMBTUDWOnce?.map((e: any) => {
        const findW = fDWallwMMBTUDOnce?.find((f: any) => {
          return f?.gas_day_text === e?.gas_day_text && f?.nomination_point === e?.nomination_point
        })

        if (findW) {
          const {arrContractId, arrNom, total, totalCap, utilization, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...newE} = e
          const nData = {
            ...findW,
            arrContractId: [...arrContractId, ...findW?.arrContractId],
            arrNom: [...arrNom, ...findW?.arrNom],
            total: (total ? parseToNumber(total) : 0) + (findW?.total ? parseToNumber(findW.total) : 0),
            totalCap: (totalCap ? parseToNumber(totalCap) : 0) + (findW?.totalCap ? parseToNumber(findW.totalCap) : 0),
            utilization: parseToNumber((utilization ? parseToNumber(utilization) : 0) + (findW?.utilization ? parseToNumber(findW.utilization) : 0)) ?? 0,

            H1: parseToNumber(H1) + (parseToNumber(findW?.H1) ? parseToNumber(findW.H1) : 0),
            H2: parseToNumber(H2) + (parseToNumber(findW?.H2) ? parseToNumber(findW.H2) : 0),
            H3: parseToNumber(H3) + (parseToNumber(findW?.H3) ? parseToNumber(findW.H3) : 0),
            H4: parseToNumber(H4) + (parseToNumber(findW?.H4) ? parseToNumber(findW.H4) : 0),
            H5: parseToNumber(H5) + (parseToNumber(findW?.H5) ? parseToNumber(findW.H5) : 0),
            H6: parseToNumber(H6) + (parseToNumber(findW?.H6) ? parseToNumber(findW.H6) : 0),
            H7: parseToNumber(H7) + (parseToNumber(findW?.H7) ? parseToNumber(findW.H7) : 0),
            H8: parseToNumber(H8) + (parseToNumber(findW?.H8) ? parseToNumber(findW.H8) : 0),
            H9: parseToNumber(H9) + (parseToNumber(findW?.H9) ? parseToNumber(findW.H9) : 0),
            H10: parseToNumber(H10) + (parseToNumber(findW?.H10) ? parseToNumber(findW.H10) : 0),
            H11: parseToNumber(H11) + (parseToNumber(findW?.H11) ? parseToNumber(findW.H11) : 0),
            H12: parseToNumber(H12) + (parseToNumber(findW?.H12) ? parseToNumber(findW.H12) : 0),
            H13: parseToNumber(H13) + (parseToNumber(findW?.H13) ? parseToNumber(findW.H13) : 0),
            H14: parseToNumber(H14) + (parseToNumber(findW?.H14) ? parseToNumber(findW.H14) : 0),
            H15: parseToNumber(H15) + (parseToNumber(findW?.H15) ? parseToNumber(findW.H15) : 0),
            H16: parseToNumber(H16) + (parseToNumber(findW?.H16) ? parseToNumber(findW.H16) : 0),
            H17: parseToNumber(H17) + (parseToNumber(findW?.H17) ? parseToNumber(findW.H17) : 0),
            H18: parseToNumber(H18) + (parseToNumber(findW?.H18) ? parseToNumber(findW.H18) : 0),
            H19: parseToNumber(H19) + (parseToNumber(findW?.H19) ? parseToNumber(findW.H19) : 0),
            H20: parseToNumber(H20) + (parseToNumber(findW?.H20) ? parseToNumber(findW.H20) : 0),
            H21: parseToNumber(H21) + (parseToNumber(findW?.H21) ? parseToNumber(findW.H21) : 0),
            H22: parseToNumber(H22) + (parseToNumber(findW?.H22) ? parseToNumber(findW.H22) : 0),
            H23: parseToNumber(H23) + (parseToNumber(findW?.H23) ? parseToNumber(findW.H23) : 0),
            H24: parseToNumber(H24) + (parseToNumber(findW?.H24) ? parseToNumber(findW.H24) : 0)
          }
          fDWallwMMBTUDOnce = fDWallwMMBTUDOnce?.map((old: any) => {
            if (findW?.gas_day_text === old?.gas_day_text && findW?.nomination_point === old?.nomination_point) {
              return {
                ...nData,
                utilization: parseToNumber(nData?.utilization ?? 0)
              }
            } else {
              return {
                ...old,
                utilization: parseToNumber(old?.utilization ?? 0)
              }
            }
          })
        } else {
          addfDWallwMMBTUDDWOnce?.push({
            ...e,
            utilization: parseToNumber(e?.utilization ?? 0)
          })
        }
        return e
      })

      fDWallwMMBTUDOnce = [...fDWallwMMBTUDOnce, ...addfDWallwMMBTUDDWOnce]
    } else {
      fDWallwMMBTUDOnce = fDWallwMMBTUDcalcOnce
    }

    // ---------

    return {
      MMSCFD: fDWallMMSCFDOnce,
      MMBTUD: fDWallwMMBTUDOnce
    }
  }

  async nomData() {
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const nomData = await this.prisma.nomination_point.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gt: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      select: {
        id: true,
        nomination_point: true,
        maximum_capacity: true,
        area: {
          select: {
            id: true,
            name: true,
            entry_exit_id: true,
            supply_reference_quality_area: true
            // east_area:true,
            // west_area:true,
          }
        },
        zone: {
          select: {
            id: true,
            name: true
          }
        }
        // zone_id:true,
        // area_id:true,
        // entry_exit_id:true,
        // zone: {
        //   select: {
        //     name: true,
        //   },
        // },
        // area: {
        //   select: {
        //     name: true,
        //   },
        // },
        // entry_exit: true,
      }
    })
    return nomData
  }

  area(query: any) {
    const {includeInactive} = query
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const andInWhere: Prisma.areaWhereInput[] = []

    if (includeInactive != 'true') {
      andInWhere.push({
        start_date: {
          lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
        }
      })
      andInWhere.push({
        OR: [
          {end_date: null}, // ถ้า end_date เป็น null
          {
            end_date: {
              gte: todayStart
            }
          } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
        ]
      })
    }

    return this.prisma.area.findMany({
      where: {
        AND: andInWhere
      },
      include: {
        supply_reference_quality_area_by: true,
        zone: true,
        entry_exit: true,
        create_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        update_by_account: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {id: 'desc'}
    })
  }

  // https://app.clickup.com/t/86errdaj8
  // hv
  // EAST-WEST
  // v1.0.90 ต้องกำหนดการคำนวน Convert MMBTU/D ไป MMSCFD สำหรับ Are F2 และ E โดยเฉพาะ
  // let hv
  // // NEW EAST-WEST  <===

  roundTo2(value: any) {
    const num = Number(value)
    if (Number.isNaN(num)) return 0
    return Math.round((num + Number.EPSILON) * 100) / 100
  }

  // roundTo2(value: any) {
  //   const num = Number(value);
  //   if (Number.isNaN(num)) return 0;

  //   return Number(num.toFixed(2));
  // }

  //   roundTo2(value: any) {
  //   const num = Number(value);
  //   if (Number.isNaN(num)) return 0;

  //   const factor = 100;
  //   return Math.round((num + Number.EPSILON) * factor) / factor;
  // }

  roundTo3(value: any) {
    const num = Number(value)
    if (Number.isNaN(num)) return 0
    return Math.round((num + Number.EPSILON) * 1000) / 1000
  }

  roundTo4(value: any) {
    const num = Number(value)
    if (Number.isNaN(num)) return 0
    return Math.round((num + Number.EPSILON) * 10000) / 10000
  }

  roundTo6(value: any) {
    const num = Number(value)
    if (Number.isNaN(num)) return 0
    return Math.round((num + Number.EPSILON) * 1000000) / 1000000
  }

  roundTo9(value: any) {
    const num = Number(value)
    if (Number.isNaN(num)) return 0
    return Math.round((num + Number.EPSILON) * 1000000000) / 1000000000
  }

  async findAll(payload: any) {
    this.logger.log(`findAll called | locked=${this.mutex.isLocked()}`)

    // const hvFromEntryArea = await findHvFromEntryArea({
    //       prisma: this.prisma,
    //       targetArea: '',
    //       gasDate: dayjs("2026-04-08").toDate(),
    //       dataList: [],
    //     });
    // console.log('hvFromEntryArea : ', hvFromEntryArea);

    return this.mutex.runExclusive(async () => {
      this.logger.log(`findAll start`)
      try {
        return await this.processFindAll(payload)
      } catch (error) {
        this.logger.error('findAll error', error?.stack || error)
        throw error
      } finally {
        this.logger.log(`findAll end`)
      }
    })
  }

  async processFindAll(payload: any) {
    console.time('sum G1')
    const {gas_day_text, tab, overTotalCap} = payload
    const toFixedInt = (value: any, digits = 6) => {
      const str = String(value ?? 0)
        .replace(/,/g, '')
        .trim()
      if (str === '' || isNaN(Number(str))) return 0

      const isNegative = str.startsWith('-')
      const clean = isNegative ? str.slice(1) : str

      const [intPart = '0', decPart = ''] = clean.split('.')
      const decimal = (decPart + '0'.repeat(digits)).slice(0, digits)

      const factor = 10 ** digits
      const result = Number(intPart || 0) * factor + Number(decimal || 0)

      return isNegative ? -result : result
    }

    const fromFixedInt = (value: number, digits = 6) => {
      const sign = value < 0 ? '-' : ''
      const abs = Math.abs(value)

      const factor = 10 ** digits
      const intPart = Math.floor(abs / factor)
      const decPart = String(abs % factor).padStart(digits, '0')

      return Number(`${sign}${intPart}.${decPart}`)
    }

    const fmt = 'DD/MM/YYYY'
    const fnDay7 = (start) => {
      return Array.from({length: 7}, (_, i) => dayjs(start, fmt, true).add(i, 'day').format(fmt))
    }
    const {weekStart: targetWeekStart} = getWeekRange(dayjs(gas_day_text, 'DD/MM/YYYY').toDate())

    let whereSM = {}
    if (tab === 'daily') {
      whereSM = {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        gas_day: {
          equals: dayjs(gas_day_text, 'DD/MM/YYYY').toDate()
        },
        OR: [{del_flag: false}, {del_flag: null}],
        nomination_type_id: 1,
        query_shipper_nomination_status: {
          id: {
            in: [1, 2, 5] // https://app.clickup.com/t/86etzcgv1
          }
        }
      }
    } else if (tab === 'weekly') {
      whereSM = {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        gas_day: {
          equals: dayjs(gas_day_text, 'DD/MM/YYYY').toDate()
        },
        OR: [
          {del_flag: false},
          {del_flag: null},
          {
            AND: [
              {
                gas_day: {
                  equals: dayjs(gas_day_text, 'DD/MM/YYYY').subtract(dayjs(gas_day_text, 'DD/MM/YYYY').day(), 'day').toDate()
                }
              },
              {
                nomination_type_id: 2
              }
            ]
          }
        ],
        nomination_type_id: 2,
        query_shipper_nomination_status: {
          id: {
            // in: [2, 5],
            in: [1, 2, 5] // https://app.clickup.com/t/86etzcgv1
          }
        }
      }
    } else {
      whereSM = {
        NOT: {
          contract_code_id: null
        }, // revers bal ไม่แสดง effect
        // gas_day: { equals: dayjs(gas_day_text, 'DD/MM/YYYY').toDate() },
        OR: [
          {
            AND: [
              {
                OR: [
                  {
                    del_flag: false
                  },
                  {
                    del_flag: null
                  }
                ]
              },
              {
                gas_day: {
                  equals: dayjs(gas_day_text, 'DD/MM/YYYY').toDate()
                }
              },
              {
                nomination_type_id: 1
              }
            ]
          },
          {
            AND: [
              {
                OR: [
                  {
                    del_flag: false
                  },
                  {
                    del_flag: null
                  }
                ]
              },
              {
                // gas_day: { gte: targetWeekStart, lte: targetWeekEnd },
                // gas_day: {
                //   equals: dayjs(gas_day_text, 'DD/MM/YYYY')
                //     .subtract(dayjs(gas_day_text, 'DD/MM/YYYY').day(), 'day')
                //     .toDate(),
                // },
                gas_day: {
                  equals: dayjs(gas_day_text, 'DD/MM/YYYY').subtract(dayjs(gas_day_text, 'DD/MM/YYYY').day(), 'day').toDate()
                  // lt: dayjs(gas_day_text, 'DD/MM/YYYY')
                  //   .subtract(dayjs(gas_day_text, 'DD/MM/YYYY').day(), 'day')
                  //   .subtract(1, "day").toDate(),
                }
              },
              {
                nomination_type_id: 2
              }
            ]
          }
        ],
        query_shipper_nomination_status: {
          id: {
            // in: [2, 5],
            in: [1, 2, 5] // https://app.clickup.com/t/86etzcgv1
          }
        }
      }
    }

    const resData = await this.prisma.query_shipper_nomination_file.findMany({
      where: whereSM,
      // where: {
      //   NOT: { contract_code_id: null }, // revers bal ไม่แสดง effect
      //   gas_day: { equals: dayjs(gas_day_text, 'DD/MM/YYYY').toDate() },
      //   OR: [
      //     { del_flag: false },
      //     { del_flag: null },
      //     {
      //       AND: [
      //         {
      //           gas_day: {
      //             equals: dayjs(gas_day_text, 'DD/MM/YYYY')
      //               .subtract(dayjs(gas_day_text, 'DD/MM/YYYY').day(), 'day')
      //               .toDate(),
      //           },
      //         },
      //         { nomination_type_id: 2 },
      //       ],
      //     },
      //   ],
      //   // nomination_type_id: 1,
      //   query_shipper_nomination_status: {
      //     id: {
      //       // in: [2, 5],
      //       in: [1, 2, 5], // https://app.clickup.com/t/86etzcgv1
      //     },
      //   },
      // },
      include: {
        reserve_balancing_gas_contract: {
          include: {
            reserve_balancing_gas_contract_comment: true,
            reserve_balancing_gas_contract_detail: {
              include: {
                nomination_point: {
                  include: {
                    area: true,
                    zone: true
                  }
                },
                area: true,
                zone: true
              }
            },
            reserve_balancing_gas_contract_files: true
          }
        },
        group: true,
        query_shipper_nomination_status: true,
        contract_code: true,
        // submission_comment_query_shipper_nomination_file: true,
        nomination_type: true,
        nomination_version: {
          include: {
            nomination_full_json: true,
            nomination_row_json: {
              include: {
                query_shipper_nomination_type: true
              },
              orderBy: {
                id: 'asc'
              }
            }
          },
          where: {
            flag_use: true
          }
        }
        // query_shipper_nomination_file_renom: true,
        // query_shipper_nomination_file_url: {
        //   include: {
        //     nomination_version: true,
        //     query_shipper_nomination_status: true,
        //     create_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //     update_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     id: 'desc',
        //   },
        // },
        // query_shipper_nomination_file_comment: {
        //   include: {
        //     query_shipper_nomination_type_comment: true,
        //     query_shipper_nomination_status: true,
        //     nomination_version: true,
        //     create_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //     update_by_account: {
        //       select: {
        //         id: true,
        //         email: true,
        //         first_name: true,
        //         last_name: true,
        //       },
        //     },
        //   },
        //   orderBy: {
        //     id: 'desc',
        //   },
        // },
      },
      orderBy: {
        id: 'desc'
      }
    })

    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()

    const areaData = await this.prisma.area.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gte: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      include: {
        supply_reference_quality_area_by: {
          include: {
            zone: true
          }
        },
        owner_area: {
          include: {
            east_area: {
              include: {
                supply_reference_quality_area_by: {
                  include: {
                    zone: true
                  }
                },
                zone: true
              }
            },
            west_area: {
              include: {
                supply_reference_quality_area_by: {
                  include: {
                    zone: true
                  }
                },
                zone: true
              }
            }
          }
        }
      }
    })

    const nomData = await this.prisma.nomination_point.findMany({
      where: {
        AND: [
          {
            start_date: {
              lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
            }
          },
          {
            OR: [
              {
                end_date: null
              }, // ถ้า end_date เป็น null
              {
                end_date: {
                  gt: todayStart
                }
              } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            ]
          }
        ]
      },
      select: {
        nomination_point: true,
        maximum_capacity: true
        // zone_id:true,
        // area_id:true,
        // entry_exit_id:true,
        // zone: {
        //   select: {
        //     name: true,
        //   },
        // },
        // area: {
        //   select: {
        //     name: true,
        //   },
        // },
        // entry_exit: true,
      }
    })
    console.timeEnd('sum G1')
    console.time('sum G2')
    console.time('sum G2.1')
    const eva = await this.qualityPlanningService.findAllNoIntarWait(dayjs(gas_day_text, 'DD/MM/YYYY').format('YYYY-MM-DD'), JSON.parse(JSON.stringify(resData)))
    console.timeEnd('sum G2.1')
    let dailyWeeklyData = []
    console.time('sum G2.2')

    const resDataCv = resData.map((e: any) => {
      const nomination_version = e['nomination_version'].map((nv: any) => {
        const nomination_full_json = nv['nomination_full_json'].map((nfj: any) => {
          nfj['data_temp'] = JSON.parse(nfj['data_temp'])
          return {
            ...nfj
          }
        })
        const nomination_row_json = nv['nomination_row_json'].map((nfj: any) => {
          nfj['data_temp'] = JSON.parse(nfj['data_temp'])
          return {
            ...nfj
          }
        })

        if (nomination_row_json.length > 0) {
          nomination_row_json.map((nx: any) => {
            dailyWeeklyData.push({
              nomination_type_id: e?.nomination_type_id,
              nomination_code: e?.nomination_code,
              gas_day: e?.gas_day,
              gas_day_text: dayjs(e?.gas_day).format('DD/MM/YYYY'),
              contract_code_id: e?.contract_code_id,
              group_id: e?.group_id,
              query_shipper_nomination_file_renom_id: e?.query_shipper_nomination_file_renom_id,
              submitted_timestamp: e?.submitted_timestamp,
              nomination_full_json: nomination_full_json[0],
              nomination_row_json: nx || null,
              unix: nx && nx['data_temp']['9'] || null,
              query_shipper_nomination_type_id: nx && nx?.query_shipper_nomination_type_id || null,
              query_shipper_nomination_type: nx && nx?.query_shipper_nomination_type || null,
              entry_exit_id: nx && nx?.entry_exit_id || null,
              nomination_point: nx && nx['data_temp']['3'] || null,
              area_text: nx && nx['data_temp']['2'] || null,
              zone_text: nx && nx['data_temp']['0'] || null
            })

            return nx
          })
        }

        return {
          ...nv,
          nomination_full_json,
          nomination_row_json
        }
      })

      return {
        ...e,
        nomination_version
      }
    })
    console.timeEnd('sum G2.2')

    console.time('sum G2.3')

    const dailyDataNewD = dailyWeeklyData?.filter((f: any) => f?.gas_day_text === gas_day_text)
    // วันอาทิตย์ของสัปดาห์นี้
    const wsunday = getTodayNowDDMMYYYYDfault(gas_day_text).startOf('week').format('DD/MM/YYYY')

    console.timeEnd('sum G2.3')

    const dailyDataNewW = dailyWeeklyData?.filter((f: any) => f?.gas_day_text === wsunday)
    console.time('sum G2.4')

    const dailyArr = dailyDataNewD.filter((f: any) => {
      return f?.nomination_type_id === 1
    })
    console.timeEnd('sum G2.4')
    console.time('sum G2.5')

    const weeklyArr = dailyDataNewW.filter((f: any) => {
      return f?.nomination_type_id === 2
    })
    console.timeEnd('sum G2.5')

    const adailyArrNom = dailyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id !== 1 && !f?.area_text && !f?.nomination_point
    })
    const aweeklyArrNom = weeklyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id !== 1 && !f?.area_text && !f?.nomination_point
    })

    const adailyArrNomParkUnparkIns = dailyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id !== 1 && !f?.area_text && !f?.nomination_point
    })
    const aweeklyArrNomParkUnparkIns = weeklyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id !== 1 && !f?.area_text && !f?.nomination_point
    })

    const adailyArrNomConcept = dailyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id === 2 && !f?.area_text && f?.nomination_point
    })
    const aweeklyArrNomConcept = weeklyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id === 2 && !f?.area_text && f?.nomination_point
    })
    console.time('sum G2.6')

    const dailyArrNom = dailyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id === 1
    })
    console.timeEnd('sum G2.6')
    console.time('sum G2.7')

    const weeklyArrNom = weeklyArr?.filter((f: any) => {
      return f?.query_shipper_nomination_type_id === 1
    })
    console.timeEnd('sum G2.7')

    let dailyArrNomMMSCFD = dailyArrNom?.filter((f: any) => {
      return f?.unix === 'MMSCFD'
    })
    let dailyArrNomMMBTUD = dailyArrNom?.filter((f: any) => {
      return f?.unix === 'MMBTU/D'
    })
    let weeklyArrNomMMSCFD = weeklyArrNom?.filter((f: any) => {
      return f?.unix === 'MMSCFD'
    })
    let weeklyArrNomMMBTUD = weeklyArrNom?.filter((f: any) => {
      return f?.unix === 'MMBTU/D'
    })

    let puadailyArrNomParkUnparkInsMMSCFD = adailyArrNomParkUnparkIns?.filter((f: any) => {
      return f?.unix === 'MMSCFD'
    })
    let puadailyArrNomParkUnparkInsMMBTUD = adailyArrNomParkUnparkIns?.filter((f: any) => {
      return f?.unix === 'MMBTU/D'
    })
    let puaweeklyArrNomParkUnparkInsMMSCFD = aweeklyArrNomParkUnparkIns?.filter((f: any) => {
      return f?.unix === 'MMSCFD'
    })
    let puaweeklyArrNomParkUnparkInsMMBTUD = aweeklyArrNomParkUnparkIns?.filter((f: any) => {
      return f?.unix === 'MMBTU/D'
    })

    // all concept point
    let conceptadailyArrNomConceptMMSCFD = adailyArrNomConcept?.filter((f: any) => {
      return f?.unix === 'MMSCFD'
    })
    let conceptadailyArrNomConceptMMBTUD_ = adailyArrNomConcept?.filter((f: any) => {
      return f?.unix === 'MMBTU/D'
    })
    let conceptadailyArrNomConceptBTU_SCF = adailyArrNomConcept
      ?.filter((f: any) => {
        return f?.unix === 'BTU/SCF'
      })
      ?.map((e: any) => {
        const {nomination_point, ...nE} = e
        return {
          ...nE,
          nomination_point: nomination_point ? nomination_point : nE?.nomination_row_json?.data_temp?.['4']
        }
      })
    let conceptadailyArrNomConceptMMBTUD = [...conceptadailyArrNomConceptMMBTUD_, ...conceptadailyArrNomConceptBTU_SCF]

    let conceptaweeklyArrNomConceptMMSCFD = aweeklyArrNomConcept?.filter((f: any) => {
      return f?.unix === 'MMSCFD'
    })
    let conceptaweeklyArrNomConceptMMBTUD_ = aweeklyArrNomConcept?.filter((f: any) => {
      return f?.unix === 'MMBTU/D'
    })

    let conceptaweeklyArrNomConceptBTU_SCF = weeklyArr
      ?.filter((f: any) => {
        return f?.unix === 'BTU/SCF'
      })
      ?.map((e: any) => {
        const {nomination_point, ...nE} = e
        return {
          ...nE,
          nomination_point: nomination_point ? nomination_point : nE?.nomination_row_json?.data_temp?.['4']
        }
      })
    let conceptaweeklyArrNomConceptMMBTUD = [...conceptaweeklyArrNomConceptMMBTUD_, ...conceptaweeklyArrNomConceptBTU_SCF]

    // - - - - - -
    console.timeEnd('sum G2')
    console.time('sum G3')

    // this.roundTo6
    let dMMSCFD1 = dailyArrNomMMSCFD.map((e: any) => {
      const hourDay = {
        H1: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['14']),
        H2: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['15']),
        H3: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['16']),
        H4: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['17']),
        H5: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['18']),
        H6: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['19']),
        H7: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['20']),
        H8: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['21']),
        H9: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['22']),
        H10: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['23']),
        H11: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['24']),
        H12: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['25']),
        H13: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['26']),
        H14: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['27']),
        H15: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['28']),
        H16: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['29']),
        H17: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['30']),
        H18: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['31']),
        H19: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['32']),
        H20: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['33']),
        H21: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['34']),
        H22: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['35']),
        H23: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['36']),
        H24: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['37']),
        total: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['38'])
      }

      const calcMMBTUDTotal = (hDay: any) => {
        let H1 = !!hDay?.['H1'] ? parseToNumber(hDay?.['H1']) : 0
        let H2 = !!hDay?.['H2'] ? parseToNumber(hDay?.['H2']) : 0
        let H3 = !!hDay?.['H3'] ? parseToNumber(hDay?.['H3']) : 0
        let H4 = !!hDay?.['H4'] ? parseToNumber(hDay?.['H4']) : 0
        let H5 = !!hDay?.['H5'] ? parseToNumber(hDay?.['H5']) : 0
        let H6 = !!hDay?.['H6'] ? parseToNumber(hDay?.['H6']) : 0
        let H7 = !!hDay?.['H7'] ? parseToNumber(hDay?.['H7']) : 0
        let H8 = !!hDay?.['H8'] ? parseToNumber(hDay?.['H8']) : 0
        let H9 = !!hDay?.['H9'] ? parseToNumber(hDay?.['H9']) : 0
        let H10 = !!hDay?.['H10'] ? parseToNumber(hDay?.['H10']) : 0
        let H11 = !!hDay?.['H11'] ? parseToNumber(hDay?.['H11']) : 0
        let H12 = !!hDay?.['H12'] ? parseToNumber(hDay?.['H12']) : 0
        let H13 = !!hDay?.['H13'] ? parseToNumber(hDay?.['H13']) : 0
        let H14 = !!hDay?.['H14'] ? parseToNumber(hDay?.['H14']) : 0
        let H15 = !!hDay?.['H15'] ? parseToNumber(hDay?.['H15']) : 0
        let H16 = !!hDay?.['H16'] ? parseToNumber(hDay?.['H16']) : 0
        let H17 = !!hDay?.['H17'] ? parseToNumber(hDay?.['H17']) : 0
        let H18 = !!hDay?.['H18'] ? parseToNumber(hDay?.['H18']) : 0
        let H19 = !!hDay?.['H19'] ? parseToNumber(hDay?.['H19']) : 0
        let H20 = !!hDay?.['H20'] ? parseToNumber(hDay?.['H20']) : 0
        let H21 = !!hDay?.['H21'] ? parseToNumber(hDay?.['H21']) : 0
        let H22 = !!hDay?.['H22'] ? parseToNumber(hDay?.['H22']) : 0
        let H23 = !!hDay?.['H23'] ? parseToNumber(hDay?.['H23']) : 0
        let H24 = !!hDay?.['H24'] ? parseToNumber(hDay?.['H24']) : 0

        let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24
        let calcFD = vl || 0
        return calcFD
      }

      let totalCap = this.roundTo6(calcMMBTUDTotal(hourDay))
      let total = this.roundTo6(calcMMBTUDTotal(hourDay))

      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === e['nomination_point']
      })
      let utilization = (Number(totalCap) / Number(nomPoint?.maximum_capacity ?? 0)) * 100

      return {
        ...e,
        totalCap,
        total,
        utilization,
        ...hourDay
      }
    })
    // console.log('conceptadailyArrNomConceptMMBTUD : ', conceptadailyArrNomConceptMMBTUD);
    // console.log('conceptaweeklyArrNomConceptMMBTUD : ', conceptaweeklyArrNomConceptMMBTUD);
    const dayNum_ = dayjs(gas_day_text, "DD/MM/YYYY").day()
    console.log('dayNum_ : ', dayNum_);
    const dContEast_to_BVW10 = conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_BVW10')?.map(item => item.contract_code_id) //  East_to_BVW10
    const wContEast_to_BVW10 = conceptaweeklyArrNomConceptMMBTUD.filter((f_: any) => f_?.nomination_point === 'East_to_BVW10' && !dContEast_to_BVW10.includes(f_?.contract_code_id))?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[14 + dayNum_]) || 0, 0)
    console.log('dContEast_to_BVW10 : ', dContEast_to_BVW10);
    console.log('wContEast_to_BVW10 : ', wContEast_to_BVW10);

    const dContEast_to_RA6 = conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_RA6')?.map(item => item.contract_code_id) //  East_to_RA6
    const wContEast_to_RA6 = conceptaweeklyArrNomConceptMMBTUD.filter((f_: any) => f_?.nomination_point === 'East_to_RA6' && !dContEast_to_RA6.includes(f_?.contract_code_id))?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[14 + dayNum_]) || 0, 0)
    console.log('dContEast_to_RA6 : ', dContEast_to_RA6 , conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_RA6'));
    console.log('wContEast_to_RA6 : ', wContEast_to_RA6);

    const dContWest_to_BVW10 = conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_BVW10')?.map(item => item.contract_code_id) //  West_to_BVW10
    const wContWest_to_BVW10 = conceptaweeklyArrNomConceptMMBTUD.filter((f_: any) => f_?.nomination_point === 'West_to_BVW10' && !dContWest_to_BVW10.includes(f_?.contract_code_id))?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[14 + dayNum_]) || 0, 0)
    console.log('dContWest_to_BVW10 : ', dContWest_to_BVW10 , conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_BVW10'));
    console.log('wContWest_to_BVW10 : ', wContWest_to_BVW10);

    const dContWest_to_RA6 = conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_RA6')?.map(item => item.contract_code_id) //  West_to_RA6
    const wContWest_to_RA6 = conceptaweeklyArrNomConceptMMBTUD.filter((f_: any) => f_?.nomination_point === 'West_to_RA6' && !dContWest_to_RA6.includes(f_?.contract_code_id))?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[14 + dayNum_]) || 0, 0)
    console.log('dContWest_to_RA6 : ', dContWest_to_RA6 , conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_RA6'));
    console.log('wContWest_to_RA6 : ', wContWest_to_RA6);

    const D_EW_OBJ = {
      gas_day: gas_day_text,
      East_to_BVW10: wContEast_to_BVW10 + conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_BVW10')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[38]) || 0, 0),
      East_to_RA6: wContEast_to_RA6 + conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_RA6')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[38]) || 0, 0),
      West_to_BVW10: wContWest_to_BVW10 + conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_BVW10')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[38]) || 0, 0),
      West_to_RA6: wContWest_to_RA6 + conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_RA6')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[38]) || 0, 0)
    }
    // const D_EW_OBJ = {
    //   gas_day: gas_day_text,
    //   East_to_BVW10: conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_BVW10')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[38]) || 0, 0),
    //   East_to_RA6: conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_RA6')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[38]) || 0, 0),
    //   West_to_BVW10: conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_BVW10')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[38]) || 0, 0),
    //   West_to_RA6: conceptadailyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_RA6')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[38]) || 0, 0)
    // }

    const W_EW_OBJ = Array.from({length: 7}, (_, i) => {
      return {
        gas_day: dayjs(gas_day_text, 'DD/MM/YYYY').add(i, 'day').format('DD/MM/YYYY'),
        East_to_BVW10: conceptaweeklyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_BVW10')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[14 + i]) || 0, 0),
        East_to_RA6: conceptaweeklyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'East_to_RA6')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[14 + i]) || 0, 0),
        West_to_BVW10: conceptaweeklyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_BVW10')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[14 + i]) || 0, 0),
        West_to_RA6: conceptaweeklyArrNomConceptMMBTUD?.filter((f_: any) => f_?.nomination_point === 'West_to_RA6')?.reduce((accumulator, currentValue) => accumulator + parseToNumber(currentValue?.nomination_row_json?.data_temp?.[14 + i]) || 0, 0)
      }
    })
    // console.log('- W_EW_OBJ - : ', W_EW_OBJ);

    const safeNumber = (v: any) => {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }

    const dHvArr = Array.from(
      new Map(
        dailyArrNomMMBTUD
          ?.filter((f: any) => f?.zone_text === 'EAST-WEST')
          ?.map((e_: any) => {
            const area_text = e_?.area_text ?? ''
            const entry_exit_id = e_?.entry_exit_id ?? null
            const key = `${area_text}__${entry_exit_id}`

            return [
              key,
              {
                area_text,
                entry_exit_id
              }
            ] as const
          }) ?? []
      ).values()
    )
    const dHvArr_noE = dHvArr?.map((e_: any) => {
      let resCalc = 0

      if (e_?.area_text === 'E') {
        // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
        resCalc = null
      } else {
        // HV_F2 = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
        // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
        // HV_G = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
        const owner_supplyRef = areaData?.find((f: any) => {
          return f?.name === e_?.area_text
        })
        const east_name = owner_supplyRef?.owner_area?.[0]?.east_area?.name
        let east_name_filDayWFormEva =
          eva?.newDaily
            ?.filter((f: any) => f?.parameter === 'HV')
            ?.filter((f: any) => f?.gasday === gas_day_text)
            ?.filter((f: any) => f?.zone?.name === 'EAST')
            ?.filter((f: any) => f?.area?.name === east_name)?.[0] || null

        const west_name = owner_supplyRef?.owner_area?.[0]?.west_area?.name
        let west_name_filDayWFormEva =
          eva?.newDaily
            ?.filter((f: any) => f?.parameter === 'HV')
            ?.filter((f: any) => f?.gasday === gas_day_text)
            ?.filter((f: any) => f?.zone?.name === 'WEST')
            ?.filter((f: any) => f?.area?.name === west_name)?.[0] || null

        let east_name_hv = east_name_filDayWFormEva?.valueBtuScf || 0
        let west_name_hv = west_name_filDayWFormEva?.valueBtuScf || 0

        resCalc = safeNumber(D_EW_OBJ?.East_to_BVW10 * east_name_hv) + (D_EW_OBJ?.West_to_BVW10 * west_name_hv) / (D_EW_OBJ?.East_to_BVW10 + D_EW_OBJ?.West_to_BVW10)
      }

      return {
        area_text: e_?.area_text,
        entry_exit_id: e_?.entry_exit_id,
        resCalc: resCalc
      }
    })
    const dHvArr_ = dHvArr_noE?.map((e_: any) => {
      if (e_?.area_text === 'E') {
        let resCalc = 0
        // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
        const owner_supplyRef = areaData?.find((f: any) => {
          return f?.name === e_?.area_text
        })
        const east_name = owner_supplyRef?.owner_area?.[0]?.east_area?.name
        let east_name_filDayWFormEva =
          eva?.newDaily
            ?.filter((f: any) => f?.parameter === 'HV')
            ?.filter((f: any) => f?.gasday === gas_day_text)
            ?.filter((f: any) => f?.zone?.name === 'EAST')
            ?.filter((f: any) => f?.area?.name === east_name)?.[0] || null

        let east_name_hv = east_name_filDayWFormEva?.valueBtuScf || 0
        const F2_ = dHvArr_noE?.find((f_: any) => f_?.area_text === 'G')?.resCalc || 0 // มีการเปลี่ยนสูตรจาก F2 เป็น G
        resCalc = safeNumber(D_EW_OBJ?.East_to_BVW10 * east_name_hv) + (D_EW_OBJ?.West_to_BVW10 * F2_) / (D_EW_OBJ?.East_to_BVW10 + D_EW_OBJ?.West_to_BVW10)
        return {
          area_text: e_?.area_text,
          entry_exit_id: e_?.entry_exit_id,
          resCalc: resCalc
        }
      } else {
        return e_
      }
    })

    const wHvArr = Array.from(
      new Map(
        weeklyArrNomMMBTUD
          ?.filter((f: any) => f?.zone_text === 'EAST-WEST')
          ?.map((e_: any) => {
            const area_text = e_?.area_text ?? ''
            const entry_exit_id = e_?.entry_exit_id ?? null
            const key = `${area_text}__${entry_exit_id}`

            return [
              key,
              {
                area_text,
                entry_exit_id
              }
            ] as const
          }) ?? []
      ).values()
    )
    const wHvArr_noE = wHvArr?.flatMap((e_: any) => {
      const dayWeek = Array.from({length: 7}, (_, i) => {
        const gas_day = dayjs(gas_day_text, 'DD/MM/YYYY').add(i, 'day').format('DD/MM/YYYY')
        let resCalc = 0

        if (e_?.area_text === 'E') {
          // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
          resCalc = null
        } else {
          // HV_F2 = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
          // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
          // HV_G = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
          const owner_supplyRef = areaData?.find((f: any) => {
            return f?.name === e_?.area_text
          })
          const east_name = owner_supplyRef?.owner_area?.[0]?.east_area?.name
          let east_name_filDayWFormEva =
            eva?.newWeekly
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day)
              ?.filter((f: any) => f?.zone?.name === 'EAST')
              ?.filter((f: any) => f?.area?.name === east_name)?.[0] || null

          const west_name = owner_supplyRef?.owner_area?.[0]?.west_area?.name
          let west_name_filDayWFormEva =
            eva?.newWeekly
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day)
              ?.filter((f: any) => f?.zone?.name === 'WEST')
              ?.filter((f: any) => f?.area?.name === west_name)?.[0] || null

          const weekArr = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

          let east_name_hv = east_name_filDayWFormEva?.[weekArr[i]]?.value || 0
          let west_name_hv = west_name_filDayWFormEva?.[weekArr[i]]?.value || 0
          const fW_EW_OBJ = W_EW_OBJ?.find((f_: any) => f_?.gas_day === gas_day)
          resCalc = safeNumber(fW_EW_OBJ?.East_to_BVW10 * east_name_hv) + (fW_EW_OBJ?.West_to_BVW10 * west_name_hv) / (fW_EW_OBJ?.East_to_BVW10 + fW_EW_OBJ?.West_to_BVW10)
        }

        return {
          gas_day: gas_day,
          area_text: e_?.area_text,
          entry_exit_id: e_?.entry_exit_id,
          resCalc: resCalc
        }
      })

      return dayWeek
    })
    const wHvArr_ = wHvArr_noE?.map((e_: any) => {
      if (e_?.area_text === 'E') {
        let resCalc = 0
        // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
        const owner_supplyRef = areaData?.find((f: any) => {
          return f?.name === e_?.area_text
        })
        const east_name = owner_supplyRef?.owner_area?.[0]?.east_area?.name
        let east_name_filDayWFormEva =
          eva?.newWeekly
            ?.filter((f: any) => f?.parameter === 'HV')
            ?.filter((f: any) => f?.gasday === e_?.gas_day)
            ?.filter((f: any) => f?.zone?.name === 'EAST')
            ?.filter((f: any) => f?.area?.name === east_name)?.[0] || null

        const weekArr = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

        const d = dayjs(e_?.gas_day, 'DD/MM/YYYY', true)
        const dayName = d.isValid() ? weekArr[d.day()] : null
        let east_name_hv = east_name_filDayWFormEva?.[dayName]?.value || 0
        const F2_ = dHvArr_noE?.find((f_: any) => f_?.area_text === 'G')?.resCalc || 0 // มีการเปลี่ยนสูตรจาก F2 เป็น G
        const fW_EW_OBJ = W_EW_OBJ?.find((f_: any) => f_?.gas_day === e_?.gas_day)
        resCalc = safeNumber(fW_EW_OBJ?.East_to_BVW10 * east_name_hv) + (fW_EW_OBJ?.West_to_BVW10 * F2_) / (fW_EW_OBJ?.East_to_BVW10 + fW_EW_OBJ?.West_to_BVW10)
        // console.log('[E] => e_ : ', e_);
        // console.log('[E] => resCalc : ', resCalc);
        // console.log('= = = =');
        return {
          gas_day: e_?.gas_day,
          area_text: e_?.area_text,
          entry_exit_id: e_?.entry_exit_id,
          resCalc: resCalc
        }
      } else {
        return e_
      }
    })

    // this.roundTo3
    let dMMBTUD1 = (dailyArrNomMMBTUD || []).map((e: any) => {
      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === e?.nomination_point
      })

      const supplyRef = areaData?.find((f: any) => {
        return f?.name === e?.area_text
      })

      let filDayWFormEva: any =
        e?.entry_exit_id === 1
          ? eva?.newDaily
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day_text)
              ?.filter((f: any) => f?.zone?.name === e?.zone_text)
              ?.filter((f: any) => f?.area?.name === e?.area_text)?.[0] || null
          : eva?.newDaily
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day_text)
              ?.filter((f: any) => f?.zone?.name === supplyRef?.supply_reference_quality_area_by?.zone?.name)
              ?.filter((f: any) => f?.area?.name === supplyRef?.supply_reference_quality_area_by?.name)?.[0] || null

      // let hv = filDayWFormEva?.valueBtuScf || 0;
      let hv = 0

      // NEW EAST-WEST
      if (e?.zone_text === 'EAST-WEST') {
        const hvEastWest = dHvArr_?.find((f_: any) => f_?.area_text === e?.area_text)
        hv = hvEastWest?.resCalc || 0
      } else {
        hv = filDayWFormEva?.valueBtuScf || 0
      }

      const hourDay = {
        H1: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['14'])),
        H2: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['15'])),
        H3: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['16'])),
        H4: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['17'])),
        H5: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['18'])),
        H6: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['19'])),
        H7: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['20'])),
        H8: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['21'])),
        H9: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['22'])),
        H10: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['23'])),
        H11: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['24'])),
        H12: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['25'])),
        H13: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['26'])),
        H14: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['27'])),
        H15: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['28'])),
        H16: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['29'])),
        H17: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['30'])),
        H18: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['31'])),
        H19: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['32'])),
        H20: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['33'])),
        H21: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['34'])),
        H22: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['35'])),
        H23: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['36'])),
        H24: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['37'])),
        total: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['38']))
      }

      const calcMMBTUDTotal = (hDay: any) => {
        let H1 = !!hDay?.['H1'] ? parseToNumber(hDay?.['H1']) : 0
        let H2 = !!hDay?.['H2'] ? parseToNumber(hDay?.['H2']) : 0
        let H3 = !!hDay?.['H3'] ? parseToNumber(hDay?.['H3']) : 0
        let H4 = !!hDay?.['H4'] ? parseToNumber(hDay?.['H4']) : 0
        let H5 = !!hDay?.['H5'] ? parseToNumber(hDay?.['H5']) : 0
        let H6 = !!hDay?.['H6'] ? parseToNumber(hDay?.['H6']) : 0
        let H7 = !!hDay?.['H7'] ? parseToNumber(hDay?.['H7']) : 0
        let H8 = !!hDay?.['H8'] ? parseToNumber(hDay?.['H8']) : 0
        let H9 = !!hDay?.['H9'] ? parseToNumber(hDay?.['H9']) : 0
        let H10 = !!hDay?.['H10'] ? parseToNumber(hDay?.['H10']) : 0
        let H11 = !!hDay?.['H11'] ? parseToNumber(hDay?.['H11']) : 0
        let H12 = !!hDay?.['H12'] ? parseToNumber(hDay?.['H12']) : 0
        let H13 = !!hDay?.['H13'] ? parseToNumber(hDay?.['H13']) : 0
        let H14 = !!hDay?.['H14'] ? parseToNumber(hDay?.['H14']) : 0
        let H15 = !!hDay?.['H15'] ? parseToNumber(hDay?.['H15']) : 0
        let H16 = !!hDay?.['H16'] ? parseToNumber(hDay?.['H16']) : 0
        let H17 = !!hDay?.['H17'] ? parseToNumber(hDay?.['H17']) : 0
        let H18 = !!hDay?.['H18'] ? parseToNumber(hDay?.['H18']) : 0
        let H19 = !!hDay?.['H19'] ? parseToNumber(hDay?.['H19']) : 0
        let H20 = !!hDay?.['H20'] ? parseToNumber(hDay?.['H20']) : 0
        let H21 = !!hDay?.['H21'] ? parseToNumber(hDay?.['H21']) : 0
        let H22 = !!hDay?.['H22'] ? parseToNumber(hDay?.['H22']) : 0
        let H23 = !!hDay?.['H23'] ? parseToNumber(hDay?.['H23']) : 0
        let H24 = !!hDay?.['H24'] ? parseToNumber(hDay?.['H24']) : 0

        let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24

        let calcFD = vl || 0

        return calcFD
      }

      let totalCap = this.roundTo3(calcMMBTUDTotal(hourDay))
      let total = this.roundTo3(calcMMBTUDTotal(hourDay))

      let utilization = hv === 0 ? 0 : (Number(totalCap) / (Number(nomPoint?.maximum_capacity ?? 0) * Number(hv))) * 100

      return {
        ...e,
        totalCap,
        total,
        utilization,
        ...hourDay
      }
    })

    const dExitMMBTUDtoMMSCFD1_Entry = dMMSCFD1?.map((nMap: any) => nMap?.nomination_point)

    // this.roundTo6
    let dExitMMBTUDtoMMSCFD1 = dailyArrNomMMBTUD
      ?.filter((f: any) => {
        return f?.entry_exit_id === 2 && !dExitMMBTUDtoMMSCFD1_Entry?.includes(f?.nomination_point)
      })
      .map((e: any) => {
        // areaData

        const supplyRef = areaData?.find((f: any) => {
          return f?.name === e?.area_text
        })

        let filDayWFormEva =
          eva?.newDaily
            ?.filter((f: any) => f?.parameter === 'HV')
            ?.filter((f: any) => f?.gasday === e?.gas_day_text)
            ?.filter((f: any) => f?.zone?.name === supplyRef?.supply_reference_quality_area_by?.zone?.name)
            ?.filter((f: any) => f?.area?.name === supplyRef?.supply_reference_quality_area_by?.name)?.[0] || null

        // let hv = filDayWFormEva?.valueBtuScf || 0;
        let hv = 0

        // NEW EAST-WEST
        if (e?.zone_text === 'EAST-WEST') {
          const hvEastWest = dHvArr_?.find((f_: any) => f_?.area_text === e?.area_text)
          hv = hvEastWest?.resCalc || 0
        } else {
          hv = filDayWFormEva?.valueBtuScf || 0
        }

        const nomPoint = nomData?.find((f: any) => {
          return f?.nomination_point === e['nomination_point']
        })

        const calcMMBTUDtoMMSCFD = (key: any) => {
          // let vl = !!e['nomination_row_json']?.['data_temp']?.[key]
          //   ? parseToNumber(e['nomination_row_json']?.['data_temp']?.[key])
          //   : 0;

          // let calcFD = !!vl && hv !== 0 ? vl / hv : 0;

          let calcFD = this.roundTo6(parseToNumber(e['nomination_row_json']?.['data_temp']?.[key]))

          return calcFD
        }

        const hourDay = {
          H1: calcMMBTUDtoMMSCFD('14'),
          H2: calcMMBTUDtoMMSCFD('15'),
          H3: calcMMBTUDtoMMSCFD('16'),
          H4: calcMMBTUDtoMMSCFD('17'),
          H5: calcMMBTUDtoMMSCFD('18'),
          H6: calcMMBTUDtoMMSCFD('19'),
          H7: calcMMBTUDtoMMSCFD('20'),
          H8: calcMMBTUDtoMMSCFD('21'),
          H9: calcMMBTUDtoMMSCFD('22'),
          H10: calcMMBTUDtoMMSCFD('23'),
          H11: calcMMBTUDtoMMSCFD('24'),
          H12: calcMMBTUDtoMMSCFD('25'),
          H13: calcMMBTUDtoMMSCFD('26'),
          H14: calcMMBTUDtoMMSCFD('27'),
          H15: calcMMBTUDtoMMSCFD('28'),
          H16: calcMMBTUDtoMMSCFD('29'),
          H17: calcMMBTUDtoMMSCFD('30'),
          H18: calcMMBTUDtoMMSCFD('31'),
          H19: calcMMBTUDtoMMSCFD('32'),
          H20: calcMMBTUDtoMMSCFD('33'),
          H21: calcMMBTUDtoMMSCFD('34'),
          H22: calcMMBTUDtoMMSCFD('35'),
          H23: calcMMBTUDtoMMSCFD('36'),
          H24: calcMMBTUDtoMMSCFD('37')
        }

        const calcMMBTUDtoMMSCFDTotal = (hDay: any) => {
          let H1 = hourDay?.H1
          let H2 = hourDay?.H2
          let H3 = hourDay?.H3
          let H4 = hourDay?.H4
          let H5 = hourDay?.H5
          let H6 = hourDay?.H6
          let H7 = hourDay?.H7
          let H8 = hourDay?.H8
          let H9 = hourDay?.H9
          let H10 = hourDay?.H10
          let H11 = hourDay?.H11
          let H12 = hourDay?.H12
          let H13 = hourDay?.H13
          let H14 = hourDay?.H14
          let H15 = hourDay?.H15
          let H16 = hourDay?.H16
          let H17 = hourDay?.H17
          let H18 = hourDay?.H18
          let H19 = hourDay?.H19
          let H20 = hourDay?.H20
          let H21 = hourDay?.H21
          let H22 = hourDay?.H22
          let H23 = hourDay?.H23
          let H24 = hourDay?.H24

          let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24

          let calcFD = vl || 0
          return calcFD
        }

        let totalCap = this.roundTo6(calcMMBTUDtoMMSCFDTotal(hourDay))
        let total = this.roundTo6(calcMMBTUDtoMMSCFDTotal(hourDay))

        let utilization = hv === 0 ? 0 : (Number(totalCap) / (Number(nomPoint?.maximum_capacity ?? 0) * Number(hv))) * 100

        return {
          ...e,
          totalCap,
          total,
          utilization,
          ...hourDay,
          unix: 'MMSCFD'
        }
      })

    let dMMSCFD1_tabnom = dExitMMBTUDtoMMSCFD1?.length > 0 ? [...dMMSCFD1, ...dExitMMBTUDtoMMSCFD1] : [...dMMSCFD1] // เพิ่ม
    dMMSCFD1 = [...dMMSCFD1]

    // this.roundTo6
    let wMMSCFD1 = weeklyArrNomMMSCFD.map((e: any) => {
      let sundayTotalCap = this.roundTo6(e['nomination_row_json']?.['data_temp']?.['14']?.replace(/,/g, '') || null)
      let mondayTotalCap = this.roundTo6(e['nomination_row_json']?.['data_temp']?.['15']?.replace(/,/g, '') || null)
      let tuesdayTotalCap = this.roundTo6(e['nomination_row_json']?.['data_temp']?.['16']?.replace(/,/g, '') || null)
      let wednesdayTotalCap = this.roundTo6(e['nomination_row_json']?.['data_temp']?.['17']?.replace(/,/g, '') || null)
      let thursdayTotalCap = this.roundTo6(e['nomination_row_json']?.['data_temp']?.['18']?.replace(/,/g, '') || null)
      let fridayTotalCap = this.roundTo6(e['nomination_row_json']?.['data_temp']?.['19']?.replace(/,/g, '') || null)
      let saturdayTotalCap = this.roundTo6(e['nomination_row_json']?.['data_temp']?.['20']?.replace(/,/g, '') || null)
      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === e['nomination_point']
      })

      // const calcWeek = (cap: any, maximum_capacity: any) => {
      //   const capNum = parseToNumber3Decimal(cap ?? 0);
      //   const maxNum = Number(maximum_capacity ?? 0);

      //   if (!maxNum) return 0;

      //   const result = (capNum / maxNum) * 100;

      //   if (!Number.isFinite(result)) return 0;

      //   return Number((Math.round(Number(result.toFixed(6)) * 1000) / 1000).toFixed(3));
      // };

      const calcWeek = (cap: any, maximum_capacity: any) => {
        const capNum = parseToNumber3Decimal(cap ?? 0)
        const maxNum = Number(maximum_capacity ?? 0)

        if (!maxNum) return 0

        const result = (capNum / maxNum) * 100

        if (!Number.isFinite(result)) return 0

        // เก็บ 6 digit ไว้ก่อน
        return Number(result.toFixed(6))
      }

      // const calcWeek = (cap: any, maximum_capacity: any) => {
      //   const capNum = parseToNumber3Decimal(cap ?? 0);
      //   const maxNum = Number(maximum_capacity ?? 0);

      //   if (!maxNum) return 0;

      //   const result = (capNum / maxNum) * 100;

      //   if (!Number.isFinite(result)) return 0;

      //   const factor = 100;

      //   const truncated =
      //     result < 0
      //       ? Math.ceil(result * factor)
      //       : Math.floor(result * factor);

      //   return truncated / factor;
      // };

      // const calcWeek = (cap: any, maximum_capacity: any) => {
      //   if (Number.isFinite((parseToNumber3Decimal(cap ?? 0) / Number(maximum_capacity ?? 0)) * 100)) {
      //     return (parseToNumber3Decimal(cap ?? 0) / Number(maximum_capacity ?? 0)) * 100
      //   } else {
      //     return 0
      //   }
      // }

      const dayWeek = {
        gas_day_sunday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(0, 'day').format('DD/MM/YYYY'),
        sunday: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['14'] || 0),
        sunday_utilization: calcWeek(sundayTotalCap, nomPoint?.maximum_capacity),
        gas_day_monday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(1, 'day').format('DD/MM/YYYY'),
        monday: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['15'] || 0),
        monday_utilization: calcWeek(mondayTotalCap, nomPoint?.maximum_capacity),
        gas_day_tuesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(2, 'day').format('DD/MM/YYYY'),
        tuesday: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['16'] || 0),
        tuesday_utilization: calcWeek(tuesdayTotalCap, nomPoint?.maximum_capacity),
        gas_day_wednesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(3, 'day').format('DD/MM/YYYY'),
        wednesday: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['17'] || 0),
        wednesday_utilization: calcWeek(wednesdayTotalCap, nomPoint?.maximum_capacity),
        gas_day_thursday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(4, 'day').format('DD/MM/YYYY'),
        thursday: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['18'] || 0),
        thursday_utilization: calcWeek(thursdayTotalCap, nomPoint?.maximum_capacity),
        gas_day_friday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(5, 'day').format('DD/MM/YYYY'),
        friday: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['19'] || 0),
        friday_utilization: calcWeek(fridayTotalCap, nomPoint?.maximum_capacity),
        gas_day_saturday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(6, 'day').format('DD/MM/YYYY'),
        saturday: this.roundTo6(e['nomination_row_json']?.['data_temp']?.['20'] || 0),
        saturday_utilization: calcWeek(saturdayTotalCap, nomPoint?.maximum_capacity)
      }

      return {
        ...e,
        ...dayWeek
      }
    })

    // this.roundTo3
    let wMMBTUD1 = (weeklyArrNomMMBTUD || []).map((e: any) => {
      let sundayTotalCap = this.roundTo3(e['nomination_row_json']?.['data_temp']?.['14']?.replace(/,/g, '') || null)
      let mondayTotalCap = this.roundTo3(e['nomination_row_json']?.['data_temp']?.['15']?.replace(/,/g, '') || null)
      let tuesdayTotalCap = this.roundTo3(e['nomination_row_json']?.['data_temp']?.['16']?.replace(/,/g, '') || null)
      let wednesdayTotalCap = this.roundTo3(e['nomination_row_json']?.['data_temp']?.['17']?.replace(/,/g, '') || null)
      let thursdayTotalCap = this.roundTo3(e['nomination_row_json']?.['data_temp']?.['18']?.replace(/,/g, '') || null)
      let fridayTotalCap = this.roundTo3(e['nomination_row_json']?.['data_temp']?.['19']?.replace(/,/g, '') || null)
      let saturdayTotalCap = this.roundTo3(e['nomination_row_json']?.['data_temp']?.['20']?.replace(/,/g, '') || null)

      // https://app.clickup.com/t/86etzchey
      let filDayWFormEva =
        eva?.newWeekly
          ?.filter((f: any) => f?.parameter === 'HV')
          ?.filter((f: any) => f?.gasday === e?.gas_day_text)
          ?.filter((f: any) => f?.zone?.name === e?.zone_text)
          ?.filter((f: any) => f?.area?.name === e?.area_text)?.[0] || null

      // NEW EAST-WEST

      let findHvsundayHv = 0
      let findHvmondayHv = 0
      let findHvtuesdayHv = 0
      let findHvwednesdayHv = 0
      let findHvthursdayHv = 0
      let findHvfridayHv = 0
      let findHvsaturdayHv = 0

      // if (e?.zone_text === 'EAST-WEST') {
      //   const weeklyCalcFn = (wHvArr_: any, d_: any) => {
      //     return wHvArr_?.find((f_: any) => f_?.area_text === e?.area_text && f_?.gas_day === dayjs(gas_day_text, 'DD/MM/YYYY').add(d_, 'day').format('DD/MM/YYYY'))
      //   }
      //   findHvsundayHv = weeklyCalcFn(wHvArr_, 0)?.resCalc || 0
      //   findHvmondayHv = weeklyCalcFn(wHvArr_, 1)?.resCalc || 0
      //   findHvtuesdayHv = weeklyCalcFn(wHvArr_, 2)?.resCalc || 0
      //   findHvwednesdayHv = weeklyCalcFn(wHvArr_, 3)?.resCalc || 0
      //   findHvthursdayHv = weeklyCalcFn(wHvArr_, 4)?.resCalc || 0
      //   findHvfridayHv = weeklyCalcFn(wHvArr_, 5)?.resCalc || 0
      //   findHvsaturdayHv = weeklyCalcFn(wHvArr_, 6)?.resCalc || 0
       
      // } else {
      //   findHvsundayHv = filDayWFormEva?.sunday?.value || 0
      //   findHvmondayHv = filDayWFormEva?.monday?.value || 0
      //   findHvtuesdayHv = filDayWFormEva?.tuesday?.value || 0
      //   findHvwednesdayHv = filDayWFormEva?.wednesday?.value || 0
      //   findHvthursdayHv = filDayWFormEva?.thursday?.value || 0
      //   findHvfridayHv = filDayWFormEva?.friday?.value || 0
      //   findHvsaturdayHv = filDayWFormEva?.saturday?.value || 0
      // }
      findHvsundayHv = filDayWFormEva?.sunday?.value || 0
      findHvmondayHv = filDayWFormEva?.monday?.value || 0
      findHvtuesdayHv = filDayWFormEva?.tuesday?.value || 0
      findHvwednesdayHv = filDayWFormEva?.wednesday?.value || 0
      findHvthursdayHv = filDayWFormEva?.thursday?.value || 0
      findHvfridayHv = filDayWFormEva?.friday?.value || 0
      findHvsaturdayHv = filDayWFormEva?.saturday?.value || 0

      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === e['nomination_point']
      })

      // hv จาก Eva

      const calcWeek = (cap: any, maximum_capacity: any, cHv: any) => {
        if (Number.isFinite((Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100)) {
          return (Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100
        } else {
          return 0
        }
      }

      const dayWeek = {
        sunday: this.roundTo3(e['nomination_row_json']?.['data_temp']?.['14'] || 0),
        sunday_utilization: calcWeek(sundayTotalCap, nomPoint?.maximum_capacity, findHvsundayHv),
        monday: this.roundTo3(e['nomination_row_json']?.['data_temp']?.['15'] || 0),
        monday_utilization: calcWeek(mondayTotalCap, nomPoint?.maximum_capacity, findHvmondayHv),
        tuesday: this.roundTo3(e['nomination_row_json']?.['data_temp']?.['16'] || 0),
        tuesday_utilization: calcWeek(tuesdayTotalCap, nomPoint?.maximum_capacity, findHvtuesdayHv),
        wednesday: this.roundTo3(e['nomination_row_json']?.['data_temp']?.['17'] || 0),
        wednesday_utilization: calcWeek(wednesdayTotalCap, nomPoint?.maximum_capacity, findHvwednesdayHv),
        thursday: this.roundTo3(e['nomination_row_json']?.['data_temp']?.['18'] || 0),
        thursday_utilization: calcWeek(thursdayTotalCap, nomPoint?.maximum_capacity, findHvthursdayHv),
        friday: this.roundTo3(e['nomination_row_json']?.['data_temp']?.['19'] || 0),
        friday_utilization: calcWeek(fridayTotalCap, nomPoint?.maximum_capacity, findHvfridayHv),
        saturday: this.roundTo3(e['nomination_row_json']?.['data_temp']?.['20'] || 0),
        saturday_utilization: calcWeek(saturdayTotalCap, nomPoint?.maximum_capacity, findHvsaturdayHv)
      }

      return {
        ...e,
        ...dayWeek
      }
    })

    // console.log('[BPK1] wMMBTUD_ : ', wMMBTUD1?.filter((f:any) => f?.nomination_point === "BPK1"));

    const wExitMMBTUDtoMMSCFD1_Entry = wMMSCFD1?.map((nMap: any) => nMap?.nomination_point)

    // this.roundTo6
    let wExitMMBTUDtoMMSCFD1 = weeklyArrNomMMBTUD
      ?.filter((f: any) => {
        return f?.entry_exit_id === 2 && !wExitMMBTUDtoMMSCFD1_Entry?.includes(f?.nomination_point)
      })
      .map((e: any) => {
        const supplyRef = areaData?.find((f: any) => {
          return f?.name === e?.area_text
        })
        let filDayWFormEva =
          eva?.newWeekly
            ?.filter((f: any) => f?.parameter === 'HV')
            ?.filter((f: any) => f?.gasday === e?.gas_day_text)
            ?.filter((f: any) => f?.zone?.name === supplyRef?.supply_reference_quality_area_by?.zone?.name)
            ?.filter((f: any) => f?.area?.name === supplyRef?.supply_reference_quality_area_by?.name)?.[0] || null

        // NEW EAST-WEST

        let findHvsundayHv = 0
        let findHvmondayHv = 0
        let findHvtuesdayHv = 0
        let findHvwednesdayHv = 0
        let findHvthursdayHv = 0
        let findHvfridayHv = 0
        let findHvsaturdayHv = 0

        if (e?.zone_text === 'EAST-WEST') {
          const weeklyCalcFn = (wHvArr_: any, d_: any) => {
            return wHvArr_?.find((f_: any) => f_?.area_text === e?.area_text && f_?.gas_day === dayjs(gas_day_text, 'DD/MM/YYYY').add(d_, 'day').format('DD/MM/YYYY'))
          }
          // findHvsundayHv = weeklyCalcFn(wHvArr_, 0)?.resCalc || 0
          // findHvmondayHv = weeklyCalcFn(wHvArr_, 1)?.resCalc || 0
          // findHvtuesdayHv = weeklyCalcFn(wHvArr_, 2)?.resCalc || 0
          // findHvwednesdayHv = weeklyCalcFn(wHvArr_, 3)?.resCalc || 0
          // findHvthursdayHv = weeklyCalcFn(wHvArr_, 4)?.resCalc || 0
          // findHvfridayHv = weeklyCalcFn(wHvArr_, 5)?.resCalc || 0
          // findHvsaturdayHv = weeklyCalcFn(wHvArr_, 6)?.resCalc || 0
          findHvsundayHv = 1
          findHvmondayHv = 1
          findHvtuesdayHv = 1
          findHvwednesdayHv = 1
          findHvthursdayHv = 1
          findHvfridayHv = 1
          findHvsaturdayHv = 1

        } else {
          findHvsundayHv = filDayWFormEva?.sunday?.value || 0
          findHvmondayHv = filDayWFormEva?.monday?.value || 0
          findHvtuesdayHv = filDayWFormEva?.tuesday?.value || 0
          findHvwednesdayHv = filDayWFormEva?.wednesday?.value || 0
          findHvthursdayHv = filDayWFormEva?.thursday?.value || 0
          findHvfridayHv = filDayWFormEva?.friday?.value || 0
          findHvsaturdayHv = filDayWFormEva?.saturday?.value || 0
        }

        // findHvsundayHv = filDayWFormEva?.sunday?.value || 0
        // findHvmondayHv = filDayWFormEva?.monday?.value || 0
        // findHvtuesdayHv = filDayWFormEva?.tuesday?.value || 0
        // findHvwednesdayHv = filDayWFormEva?.wednesday?.value || 0
        // findHvthursdayHv = filDayWFormEva?.thursday?.value || 0
        // findHvfridayHv = filDayWFormEva?.friday?.value || 0
        // findHvsaturdayHv = filDayWFormEva?.saturday?.value || 0

        const nomPoint = nomData?.find((f: any) => {
          return f?.nomination_point === e['nomination_point']
        })

        const calcMMBTUDtoMMSCFD = (key: any, hv: any) => {
          if (tab === 'weekly') {
            if (e?.entry_exit_id === 1) {
              // let calcFD = this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.[key]) / 24 || 0)
              let calcFD = this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.[key]) || 0)

              return calcFD
            } else {
              let calcFD = e !== null && e !== undefined && this.roundTo6((parseToNumber(e['nomination_row_json']?.['data_temp']?.[key]) || 0) / hv) || null

              return Number.isFinite(calcFD) ? calcFD : null
            }
          } else {
            let calcFD = this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.[key]) / 24 || 0)
            
            return Number.isFinite(calcFD) ? calcFD : null
          }
        }

        const calcWeek = (cap: any, maximum_capacity: any, cHv: any) => {
          if (Number.isFinite((Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100)) {
            // return (Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100
            return Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * 100)
          } else {
            return 0
          }
        }

        const dayWeek = {
          gas_day_sunday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(0, 'day').format('DD/MM/YYYY'),
          sunday: calcMMBTUDtoMMSCFD('14', findHvsundayHv),
          sunday_utilization: calcWeek(calcMMBTUDtoMMSCFD('14', findHvsundayHv), nomPoint?.maximum_capacity, findHvsundayHv),
          monday: calcMMBTUDtoMMSCFD('15', findHvmondayHv),
          monday_utilization: calcWeek(calcMMBTUDtoMMSCFD('15', findHvmondayHv), nomPoint?.maximum_capacity, findHvmondayHv),
          tuesday: calcMMBTUDtoMMSCFD('16', findHvtuesdayHv),
          tuesday_utilization: calcWeek(calcMMBTUDtoMMSCFD('16', findHvtuesdayHv), nomPoint?.maximum_capacity, findHvtuesdayHv),
          wednesday: calcMMBTUDtoMMSCFD('17', findHvwednesdayHv),
          wednesday_utilization: calcWeek(calcMMBTUDtoMMSCFD('17', findHvwednesdayHv), nomPoint?.maximum_capacity, findHvwednesdayHv),
          thursday: calcMMBTUDtoMMSCFD('18', findHvthursdayHv),
          thursday_utilization: calcWeek(calcMMBTUDtoMMSCFD('18', findHvthursdayHv), nomPoint?.maximum_capacity, findHvthursdayHv),
          friday: calcMMBTUDtoMMSCFD('19', findHvfridayHv),
          friday_utilization: calcWeek(calcMMBTUDtoMMSCFD('19', findHvfridayHv), nomPoint?.maximum_capacity, findHvfridayHv),
          saturday: calcMMBTUDtoMMSCFD('20', findHvsaturdayHv),
          saturday_utilization: calcWeek(calcMMBTUDtoMMSCFD('20', findHvsaturdayHv), nomPoint?.maximum_capacity, findHvsaturdayHv)
        }

        return {
          ...e,
          ...dayWeek,
          unix: 'MMSCFD',
          nomPoint_maximum_capacity: nomPoint?.maximum_capacity || null
        }
      })

    let wMMSCFD1_tabnom = [...wMMSCFD1, ...wExitMMBTUDtoMMSCFD1] // เพิ่ม
    
    wMMSCFD1 = [...wMMSCFD1]

    // ----- All park unpark min ins.....

    let pualldMMSCFD1 = puadailyArrNomParkUnparkInsMMSCFD.map((e: any) => {
      let parkUnparkInstructedFlows = e['nomination_row_json']?.['data_temp']?.['5']

      const hourDay = {
        H1: e['nomination_row_json']?.['data_temp']?.['14'],
        H2: e['nomination_row_json']?.['data_temp']?.['15'],
        H3: e['nomination_row_json']?.['data_temp']?.['16'],
        H4: e['nomination_row_json']?.['data_temp']?.['17'],
        H5: e['nomination_row_json']?.['data_temp']?.['18'],
        H6: e['nomination_row_json']?.['data_temp']?.['19'],
        H7: e['nomination_row_json']?.['data_temp']?.['20'],
        H8: e['nomination_row_json']?.['data_temp']?.['21'],
        H9: e['nomination_row_json']?.['data_temp']?.['22'],
        H10: e['nomination_row_json']?.['data_temp']?.['23'],
        H11: e['nomination_row_json']?.['data_temp']?.['24'],
        H12: e['nomination_row_json']?.['data_temp']?.['25'],
        H13: e['nomination_row_json']?.['data_temp']?.['26'],
        H14: e['nomination_row_json']?.['data_temp']?.['27'],
        H15: e['nomination_row_json']?.['data_temp']?.['28'],
        H16: e['nomination_row_json']?.['data_temp']?.['29'],
        H17: e['nomination_row_json']?.['data_temp']?.['30'],
        H18: e['nomination_row_json']?.['data_temp']?.['31'],
        H19: e['nomination_row_json']?.['data_temp']?.['32'],
        H20: e['nomination_row_json']?.['data_temp']?.['33'],
        H21: e['nomination_row_json']?.['data_temp']?.['34'],
        H22: e['nomination_row_json']?.['data_temp']?.['35'],
        H23: e['nomination_row_json']?.['data_temp']?.['36'],
        H24: e['nomination_row_json']?.['data_temp']?.['37']
        // total: e['nomination_row_json']?.['data_temp']?.['38'],
      }

      const calcTotal = (hDay: any) => {
        let H1 = !!hDay?.['H1'] ? parseToNumber(hDay?.['H1']) : 0
        let H2 = !!hDay?.['H2'] ? parseToNumber(hDay?.['H2']) : 0
        let H3 = !!hDay?.['H3'] ? parseToNumber(hDay?.['H3']) : 0
        let H4 = !!hDay?.['H4'] ? parseToNumber(hDay?.['H4']) : 0
        let H5 = !!hDay?.['H5'] ? parseToNumber(hDay?.['H5']) : 0
        let H6 = !!hDay?.['H6'] ? parseToNumber(hDay?.['H6']) : 0
        let H7 = !!hDay?.['H7'] ? parseToNumber(hDay?.['H7']) : 0
        let H8 = !!hDay?.['H8'] ? parseToNumber(hDay?.['H8']) : 0
        let H9 = !!hDay?.['H9'] ? parseToNumber(hDay?.['H9']) : 0
        let H10 = !!hDay?.['H10'] ? parseToNumber(hDay?.['H10']) : 0
        let H11 = !!hDay?.['H11'] ? parseToNumber(hDay?.['H11']) : 0
        let H12 = !!hDay?.['H12'] ? parseToNumber(hDay?.['H12']) : 0
        let H13 = !!hDay?.['H13'] ? parseToNumber(hDay?.['H13']) : 0
        let H14 = !!hDay?.['H14'] ? parseToNumber(hDay?.['H14']) : 0
        let H15 = !!hDay?.['H15'] ? parseToNumber(hDay?.['H15']) : 0
        let H16 = !!hDay?.['H16'] ? parseToNumber(hDay?.['H16']) : 0
        let H17 = !!hDay?.['H17'] ? parseToNumber(hDay?.['H17']) : 0
        let H18 = !!hDay?.['H18'] ? parseToNumber(hDay?.['H18']) : 0
        let H19 = !!hDay?.['H19'] ? parseToNumber(hDay?.['H19']) : 0
        let H20 = !!hDay?.['H20'] ? parseToNumber(hDay?.['H20']) : 0
        let H21 = !!hDay?.['H21'] ? parseToNumber(hDay?.['H21']) : 0
        let H22 = !!hDay?.['H22'] ? parseToNumber(hDay?.['H22']) : 0
        let H23 = !!hDay?.['H23'] ? parseToNumber(hDay?.['H23']) : 0
        let H24 = !!hDay?.['H24'] ? parseToNumber(hDay?.['H24']) : 0

        let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24

        let calcFD = vl || 0
        return calcFD
      }

      let totalCap = calcTotal(hourDay)
      let total = calcTotal(hourDay)

      return {
        parkUnparkInstructedFlows,
        ...e,
        totalCap,
        total,
        ...hourDay
      }
    })
    // this.roundTo3
    let pualldMMBTUD1 = puadailyArrNomParkUnparkInsMMBTUD.map((e: any) => {
      let parkUnparkInstructedFlows = e['nomination_row_json']?.['data_temp']?.['5']

      const hourDay = {
        H1: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['14'])),
        H2: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['15'])),
        H3: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['16'])),
        H4: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['17'])),
        H5: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['18'])),
        H6: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['19'])),
        H7: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['20'])),
        H8: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['21'])),
        H9: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['22'])),
        H10: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['23'])),
        H11: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['24'])),
        H12: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['25'])),
        H13: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['26'])),
        H14: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['27'])),
        H15: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['28'])),
        H16: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['29'])),
        H17: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['30'])),
        H18: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['31'])),
        H19: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['32'])),
        H20: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['33'])),
        H21: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['34'])),
        H22: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['35'])),
        H23: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['36'])),
        H24: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['37']))
      }

      const calcTotal = (hDay: any) => {
        let H1 = this.roundTo3(!!hDay?.['H1'] ? hDay?.['H1'] : 0)
        let H2 = this.roundTo3(!!hDay?.['H2'] ? hDay?.['H2'] : 0)
        let H3 = this.roundTo3(!!hDay?.['H3'] ? hDay?.['H3'] : 0)
        let H4 = this.roundTo3(!!hDay?.['H4'] ? hDay?.['H4'] : 0)
        let H5 = this.roundTo3(!!hDay?.['H5'] ? hDay?.['H5'] : 0)
        let H6 = this.roundTo3(!!hDay?.['H6'] ? hDay?.['H6'] : 0)
        let H7 = this.roundTo3(!!hDay?.['H7'] ? hDay?.['H7'] : 0)
        let H8 = this.roundTo3(!!hDay?.['H8'] ? hDay?.['H8'] : 0)
        let H9 = this.roundTo3(!!hDay?.['H9'] ? hDay?.['H9'] : 0)
        let H10 = this.roundTo3(!!hDay?.['H10'] ? hDay?.['H10'] : 0)
        let H11 = this.roundTo3(!!hDay?.['H11'] ? hDay?.['H11'] : 0)
        let H12 = this.roundTo3(!!hDay?.['H12'] ? hDay?.['H12'] : 0)
        let H13 = this.roundTo3(!!hDay?.['H13'] ? hDay?.['H13'] : 0)
        let H14 = this.roundTo3(!!hDay?.['H14'] ? hDay?.['H14'] : 0)
        let H15 = this.roundTo3(!!hDay?.['H15'] ? hDay?.['H15'] : 0)
        let H16 = this.roundTo3(!!hDay?.['H16'] ? hDay?.['H16'] : 0)
        let H17 = this.roundTo3(!!hDay?.['H17'] ? hDay?.['H17'] : 0)
        let H18 = this.roundTo3(!!hDay?.['H18'] ? hDay?.['H18'] : 0)
        let H19 = this.roundTo3(!!hDay?.['H19'] ? hDay?.['H19'] : 0)
        let H20 = this.roundTo3(!!hDay?.['H20'] ? hDay?.['H20'] : 0)
        let H21 = this.roundTo3(!!hDay?.['H21'] ? hDay?.['H21'] : 0)
        let H22 = this.roundTo3(!!hDay?.['H22'] ? hDay?.['H22'] : 0)
        let H23 = this.roundTo3(!!hDay?.['H23'] ? hDay?.['H23'] : 0)
        let H24 = this.roundTo3(!!hDay?.['H24'] ? hDay?.['H24'] : 0)

        let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24

        let calcFD = vl || 0
        return this.roundTo3(calcFD)
      }

      let totalCap = calcTotal(hourDay)
      let total = calcTotal(hourDay)

      return {
        parkUnparkInstructedFlows,
        ...e,
        totalCap,
        total,
        ...hourDay
      }
    })

    let puallwMMSCFD1 = puaweeklyArrNomParkUnparkInsMMSCFD.map((e: any) => {
      let parkUnparkInstructedFlows = e['nomination_row_json']?.['data_temp']?.['5']

      const dayWeek = {
        gas_day_sunday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(0, 'day').format('DD/MM/YYYY'),
        sunday: e['nomination_row_json']?.['data_temp']?.['14'] || 0,
        gas_day_monday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(1, 'day').format('DD/MM/YYYY'),
        monday: e['nomination_row_json']?.['data_temp']?.['15'] || 0,
        gas_day_tuesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(2, 'day').format('DD/MM/YYYY'),
        tuesday: e['nomination_row_json']?.['data_temp']?.['16'] || 0,
        gas_day_wednesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(3, 'day').format('DD/MM/YYYY'),
        wednesday: e['nomination_row_json']?.['data_temp']?.['17'] || 0,
        gas_day_thursday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(4, 'day').format('DD/MM/YYYY'),
        thursday: e['nomination_row_json']?.['data_temp']?.['18'] || 0,
        gas_day_friday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(5, 'day').format('DD/MM/YYYY'),
        friday: e['nomination_row_json']?.['data_temp']?.['19'] || 0,
        gas_day_saturday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(6, 'day').format('DD/MM/YYYY'),
        saturday: e['nomination_row_json']?.['data_temp']?.['20'] || 0
      }

      return {
        parkUnparkInstructedFlows,
        ...e,
        ...dayWeek
      }
    })

    let puallwMMBTUD1 = puaweeklyArrNomParkUnparkInsMMBTUD.map((e: any) => {
      let parkUnparkInstructedFlows = e['nomination_row_json']?.['data_temp']?.['5']

      const dayWeek = {
        sunday: e['nomination_row_json']?.['data_temp']?.['14'] || 0,
        monday: e['nomination_row_json']?.['data_temp']?.['15'] || 0,
        tuesday: e['nomination_row_json']?.['data_temp']?.['16'] || 0,
        wednesday: e['nomination_row_json']?.['data_temp']?.['17'] || 0,
        thursday: e['nomination_row_json']?.['data_temp']?.['18'] || 0,
        friday: e['nomination_row_json']?.['data_temp']?.['19'] || 0,
        saturday: e['nomination_row_json']?.['data_temp']?.['20'] || 0
      }

      return {
        parkUnparkInstructedFlows,
        ...e,
        ...dayWeek
      }
    })

    // ----- All concept point.....

    let conceptalldMMSCFD1 = conceptadailyArrNomConceptMMSCFD.map((e: any) => {
      let parkUnparkInstructedFlows = e['nomination_row_json']?.['data_temp']?.['5']

      const hourDay = {
        H1: e['nomination_row_json']?.['data_temp']?.['14'],
        H2: e['nomination_row_json']?.['data_temp']?.['15'],
        H3: e['nomination_row_json']?.['data_temp']?.['16'],
        H4: e['nomination_row_json']?.['data_temp']?.['17'],
        H5: e['nomination_row_json']?.['data_temp']?.['18'],
        H6: e['nomination_row_json']?.['data_temp']?.['19'],
        H7: e['nomination_row_json']?.['data_temp']?.['20'],
        H8: e['nomination_row_json']?.['data_temp']?.['21'],
        H9: e['nomination_row_json']?.['data_temp']?.['22'],
        H10: e['nomination_row_json']?.['data_temp']?.['23'],
        H11: e['nomination_row_json']?.['data_temp']?.['24'],
        H12: e['nomination_row_json']?.['data_temp']?.['25'],
        H13: e['nomination_row_json']?.['data_temp']?.['26'],
        H14: e['nomination_row_json']?.['data_temp']?.['27'],
        H15: e['nomination_row_json']?.['data_temp']?.['28'],
        H16: e['nomination_row_json']?.['data_temp']?.['29'],
        H17: e['nomination_row_json']?.['data_temp']?.['30'],
        H18: e['nomination_row_json']?.['data_temp']?.['31'],
        H19: e['nomination_row_json']?.['data_temp']?.['32'],
        H20: e['nomination_row_json']?.['data_temp']?.['33'],
        H21: e['nomination_row_json']?.['data_temp']?.['34'],
        H22: e['nomination_row_json']?.['data_temp']?.['35'],
        H23: e['nomination_row_json']?.['data_temp']?.['36'],
        H24: e['nomination_row_json']?.['data_temp']?.['37']
        // total: e['nomination_row_json']?.['data_temp']?.['38'],
      }

      const calcTotal = (hDay: any) => {
        let H1 = !!hDay?.['H1'] ? parseToNumber(hDay?.['H1']) : 0
        let H2 = !!hDay?.['H2'] ? parseToNumber(hDay?.['H2']) : 0
        let H3 = !!hDay?.['H3'] ? parseToNumber(hDay?.['H3']) : 0
        let H4 = !!hDay?.['H4'] ? parseToNumber(hDay?.['H4']) : 0
        let H5 = !!hDay?.['H5'] ? parseToNumber(hDay?.['H5']) : 0
        let H6 = !!hDay?.['H6'] ? parseToNumber(hDay?.['H6']) : 0
        let H7 = !!hDay?.['H7'] ? parseToNumber(hDay?.['H7']) : 0
        let H8 = !!hDay?.['H8'] ? parseToNumber(hDay?.['H8']) : 0
        let H9 = !!hDay?.['H9'] ? parseToNumber(hDay?.['H9']) : 0
        let H10 = !!hDay?.['H10'] ? parseToNumber(hDay?.['H10']) : 0
        let H11 = !!hDay?.['H11'] ? parseToNumber(hDay?.['H11']) : 0
        let H12 = !!hDay?.['H12'] ? parseToNumber(hDay?.['H12']) : 0
        let H13 = !!hDay?.['H13'] ? parseToNumber(hDay?.['H13']) : 0
        let H14 = !!hDay?.['H14'] ? parseToNumber(hDay?.['H14']) : 0
        let H15 = !!hDay?.['H15'] ? parseToNumber(hDay?.['H15']) : 0
        let H16 = !!hDay?.['H16'] ? parseToNumber(hDay?.['H16']) : 0
        let H17 = !!hDay?.['H17'] ? parseToNumber(hDay?.['H17']) : 0
        let H18 = !!hDay?.['H18'] ? parseToNumber(hDay?.['H18']) : 0
        let H19 = !!hDay?.['H19'] ? parseToNumber(hDay?.['H19']) : 0
        let H20 = !!hDay?.['H20'] ? parseToNumber(hDay?.['H20']) : 0
        let H21 = !!hDay?.['H21'] ? parseToNumber(hDay?.['H21']) : 0
        let H22 = !!hDay?.['H22'] ? parseToNumber(hDay?.['H22']) : 0
        let H23 = !!hDay?.['H23'] ? parseToNumber(hDay?.['H23']) : 0
        let H24 = !!hDay?.['H24'] ? parseToNumber(hDay?.['H24']) : 0

        let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24

        let calcFD = vl || 0
        return calcFD
      }

      let totalCap = calcTotal(hourDay)
      let total = calcTotal(hourDay)

      return {
        parkUnparkInstructedFlows,
        ...e,
        totalCap,
        total,
        ...hourDay
      }
    })

    // this.roundTo3
    let conceptalldMMBTUD1 = conceptadailyArrNomConceptMMBTUD.map((e: any) => {
      let parkUnparkInstructedFlows = e['nomination_row_json']?.['data_temp']?.['5']

      const hourDay = {
        H1: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['14'])),
        H2: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['15'])),
        H3: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['16'])),
        H4: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['17'])),
        H5: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['18'])),
        H6: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['19'])),
        H7: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['20'])),
        H8: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['21'])),
        H9: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['22'])),
        H10: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['23'])),
        H11: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['24'])),
        H12: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['25'])),
        H13: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['26'])),
        H14: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['27'])),
        H15: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['28'])),
        H16: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['29'])),
        H17: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['30'])),
        H18: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['31'])),
        H19: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['32'])),
        H20: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['33'])),
        H21: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['34'])),
        H22: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['35'])),
        H23: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['36'])),
        H24: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['37']))
      }

      const calcTotal = (hDay: any) => {
        let H1 = this.roundTo3(!!hDay?.['H1'] ? hDay?.['H1'] : 0)
        let H2 = this.roundTo3(!!hDay?.['H2'] ? hDay?.['H2'] : 0)
        let H3 = this.roundTo3(!!hDay?.['H3'] ? hDay?.['H3'] : 0)
        let H4 = this.roundTo3(!!hDay?.['H4'] ? hDay?.['H4'] : 0)
        let H5 = this.roundTo3(!!hDay?.['H5'] ? hDay?.['H5'] : 0)
        let H6 = this.roundTo3(!!hDay?.['H6'] ? hDay?.['H6'] : 0)
        let H7 = this.roundTo3(!!hDay?.['H7'] ? hDay?.['H7'] : 0)
        let H8 = this.roundTo3(!!hDay?.['H8'] ? hDay?.['H8'] : 0)
        let H9 = this.roundTo3(!!hDay?.['H9'] ? hDay?.['H9'] : 0)
        let H10 = this.roundTo3(!!hDay?.['H10'] ? hDay?.['H10'] : 0)
        let H11 = this.roundTo3(!!hDay?.['H11'] ? hDay?.['H11'] : 0)
        let H12 = this.roundTo3(!!hDay?.['H12'] ? hDay?.['H12'] : 0)
        let H13 = this.roundTo3(!!hDay?.['H13'] ? hDay?.['H13'] : 0)
        let H14 = this.roundTo3(!!hDay?.['H14'] ? hDay?.['H14'] : 0)
        let H15 = this.roundTo3(!!hDay?.['H15'] ? hDay?.['H15'] : 0)
        let H16 = this.roundTo3(!!hDay?.['H16'] ? hDay?.['H16'] : 0)
        let H17 = this.roundTo3(!!hDay?.['H17'] ? hDay?.['H17'] : 0)
        let H18 = this.roundTo3(!!hDay?.['H18'] ? hDay?.['H18'] : 0)
        let H19 = this.roundTo3(!!hDay?.['H19'] ? hDay?.['H19'] : 0)
        let H20 = this.roundTo3(!!hDay?.['H20'] ? hDay?.['H20'] : 0)
        let H21 = this.roundTo3(!!hDay?.['H21'] ? hDay?.['H21'] : 0)
        let H22 = this.roundTo3(!!hDay?.['H22'] ? hDay?.['H22'] : 0)
        let H23 = this.roundTo3(!!hDay?.['H23'] ? hDay?.['H23'] : 0)
        let H24 = this.roundTo3(!!hDay?.['H24'] ? hDay?.['H24'] : 0)

        let vl = H1 + H2 + H3 + H4 + H5 + H6 + H7 + H8 + H9 + H10 + H11 + H12 + H13 + H14 + H15 + H16 + H17 + H18 + H19 + H20 + H21 + H22 + H23 + H24

        let calcFD = vl || 0
        return this.roundTo3(calcFD)
      }

      let totalCap = calcTotal(hourDay)
      let total = calcTotal(hourDay)

      return {
        parkUnparkInstructedFlows,
        ...e,
        totalCap,
        total,
        ...hourDay
      }
    })

    let conceptallwMMSCFD1 = conceptaweeklyArrNomConceptMMSCFD.map((e: any) => {
      let parkUnparkInstructedFlows = e['nomination_row_json']?.['data_temp']?.['5']

      const dayWeek = {
        gas_day_sunday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(0, 'day').format('DD/MM/YYYY'),
        sunday: e['nomination_row_json']?.['data_temp']?.['14'] || 0,
        gas_day_monday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(1, 'day').format('DD/MM/YYYY'),
        monday: e['nomination_row_json']?.['data_temp']?.['15'] || 0,
        gas_day_tuesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(2, 'day').format('DD/MM/YYYY'),
        tuesday: e['nomination_row_json']?.['data_temp']?.['16'] || 0,
        gas_day_wednesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(3, 'day').format('DD/MM/YYYY'),
        wednesday: e['nomination_row_json']?.['data_temp']?.['17'] || 0,
        gas_day_thursday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(4, 'day').format('DD/MM/YYYY'),
        thursday: e['nomination_row_json']?.['data_temp']?.['18'] || 0,
        gas_day_friday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(5, 'day').format('DD/MM/YYYY'),
        friday: e['nomination_row_json']?.['data_temp']?.['19'] || 0,
        gas_day_saturday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(6, 'day').format('DD/MM/YYYY'),
        saturday: e['nomination_row_json']?.['data_temp']?.['20'] || 0
      }

      return {
        parkUnparkInstructedFlows,
        ...e,
        ...dayWeek
      }
    })

    // this.roundTo3
    let conceptallwMMBTUD1 = conceptaweeklyArrNomConceptMMBTUD.map((e: any) => {
      let parkUnparkInstructedFlows = e['nomination_row_json']?.['data_temp']?.['5']

      const dayWeek = {
        sunday: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['14'] || 0)),
        monday: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['15'] || 0)),
        tuesday: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['16'] || 0)),
        wednesday: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['17'] || 0)),
        thursday: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['18'] || 0)),
        friday: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['19'] || 0)),
        saturday: this.roundTo3(parseToNumber(e['nomination_row_json']?.['data_temp']?.['20'] || 0))
      }

      return {
        parkUnparkInstructedFlows,
        ...e,
        ...dayWeek
      }
    })

    // -----
    console.timeEnd('sum G3')
    console.time('sum G4')

    const groupByKeysALL = (item: any) => `${item?.gas_day_text}${item?.nomination_point}`

    const groupByKeys = (item: any) => `${item?.gas_day_text}${item?.nomination_point}|${item?.nomination_code}`

    const groupByKeysParkUnMin_ = (item: any) => `${item?.gas_day_text}${item?.parkUnparkInstructedFlows}|${item?.nomination_code}|${item?.zone_text}`

    const horuss = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11', 'H12', 'H13', 'H14', 'H15', 'H16', 'H17', 'H18', 'H19', 'H20', 'H21', 'H22', 'H23', 'H24']
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

    // New Final
    const fnGroupByKeysFinal = (nData: any, DH: any) => {
      return Object.values(
        (nData || []).reduce(
          (acc, item) => {
            const key = groupByKeys(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom_: [item?.arrNom],
                arrContractId_: [item?.arrContractId]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                // normalizeNumber
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }

              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrContractId'] = item && [...acc[key]['arrContractId'], ...item?.arrContractId] || acc[key]['arrContractId']
              acc[key]['arrNom'] = item && [...acc[key]['arrNom'], ...item?.arrNom] || acc[key]['arrNom']
              acc[key]['arrNom_'] = item && [...acc[key]['arrNom_'], item?.arrNom] || acc[key]['arrNom_']
              acc[key]['arrContractId_'] = item && [...acc[key]['arrContractId_'], item?.arrContractId] || acc[key]['arrContractId_']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }

    // New Final ..
    const fnGroupByKeysALLFinal = (nData: any, DH: any) => {
      return Object.values(
        (nData || []).reduce(
          (acc, item) => {
            const key = groupByKeysALL(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom_: item?.arrNom && [...item?.arrNom],
                arrContractId_: item?.arrContractId && [...item?.arrContractId]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                // normalizeNumber
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }

              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrContractId'] = item && ((item?.arrContractId && [...acc[key]['arrContractId'], ...item?.arrContractId]) || acc[key]['arrContractId']) || null
              acc[key]['arrNom'] = (item?.arrNom && [...acc[key]['arrNom'], ...item?.arrNom]) || acc[key]['arrNom']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }

    const fnGroupByKeysALL = (nData: any, DH: any) => {
     
      const utilizationKeys = ['utilization', 'sunday_utilization', 'monday_utilization', 'tuesday_utilization', 'wednesday_utilization', 'thursday_utilization', 'friday_utilization', 'saturday_utilization']
    
      const result = Object.values(
        (nData || []).reduce(
          (acc: Record<string, any>, item: any) => {
            const key = groupByKeysALL(item)

            if (!acc[key]) {
              acc[key] = {
                ...item,
                id: key,
                arrNom: [item],
                arrContractId: [item?.contract_code_id]
              }
            } else {
              acc[key]['id'] = key

              for (const nDH of DH) {
                const sumInt = toFixedInt(acc[key][nDH] || 0, 6) + toFixedInt(item[nDH] || 0, 6)

                acc[key][nDH] = fromFixedInt(sumInt, 6)
              }

              acc[key]['totalCap'] = fromFixedInt(toFixedInt(acc[key]['totalCap'] || 0, 6) + toFixedInt(item['totalCap'] || 0, 6), 6)

              acc[key]['total'] = fromFixedInt(toFixedInt(acc[key]['total'] || 0, 6) + toFixedInt(item['total'] || 0, 6), 6)

           
              // รวม utilization แบบ 6 ตำแหน่งก่อน ห้าม round ตรงนี้
              for (const uKey of utilizationKeys) {
                acc[key][uKey] = fromFixedInt(toFixedInt(acc[key][uKey] || 0, 6) + toFixedInt(item[uKey] || 0, 6), 6)
              }

              acc[key]['arrNom'] = [...acc[key]['arrNom'], item]
              acc[key]['arrContractId'] = item && [...acc[key]['arrContractId'], item?.contract_code_id] || acc[key]['arrContractId']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )

      // return result.map((row: any) => {
      //   for (const uKey of utilizationKeys) {
      //     row[uKey] = Number(Number(row[uKey] || 0).toFixed(2))
      //   }

      //   return row
      // })
      return result.map((row: any) => {
        for (const uKey of utilizationKeys) {
          const val = +row[uKey] || 0

          if (uKey === 'utilization') {
            row[uKey] = Number(val.toFixed(6)) // 6 ตำแหน่ง เอาไปคำนวนต่อต้องได้ค่าเต็มก่อน
          } else {
            row[uKey] = Number(val.toFixed(2)) // ตัวอื่น 2 ตำแหน่ง
          }
        }

        return row
      })
    }

    // New
    const fnGroupByKeys = (nData: any, DH: any) => {
      return Object.values(
        (nData || []).reduce(
          (acc, item) => {
            const key = groupByKeys(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom: [item],
                arrContractId: [item?.contract_code_id]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }
              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrNom'] = [...acc[key]['arrNom'], item]
              acc[key]['arrContractId'] = item && [...acc[key]['arrContractId'], item?.contract_code_id] || acc[key]['arrContractId']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }

    // New Final
    const fnGroupByKeysFinalParkUnMin_ = (nData: any, DH: any) => {
      return Object.values(
        (nData || []).reduce(
          (acc, item) => {
            const key = groupByKeysParkUnMin_(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom_: [item?.arrNom],
                arrContractId_: [item?.arrContractId]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                // normalizeNumber
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }

              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrNom_'] = item && [...acc[key]['arrNom_'], item?.arrNom] || acc[key]['arrNom_']
              acc[key]['arrContractId_'] = item && [...acc[key]['arrContractId_'], item?.arrContractId] || acc[key]['arrContractId_']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }
    // New
    const fnGroupByKeysParkUnMin_ = (nData: any, DH: any) => {
      return Object.values(
        (nData || []).reduce(
          (acc, item) => {
            const key = groupByKeysParkUnMin_(item)

            if (!acc[key]) {
              // clone object สำหรับกลุ่มใหม่
              acc[key] = {
                ...item,
                id: key,
                arrNom: [item],
                arrContractId: [item?.contract_code_id]
              }
            } else {
              for (const nDH of DH) {
                // รวมค่า number ในแต่ละวัน (string → number → string)
                acc[key]['id'] = key
                const base = parseToNumber(acc[key][nDH] || '0')
                const current = parseToNumber(item[nDH] || '0')
                acc[key][nDH] = base + current // จัด spacing เหมือนเดิม
              }
              const basetotalCap = parseToNumber(acc[key]['totalCap'] || '0')
              const totalCap = parseToNumber(item['totalCap'] || '0')
              const basetotal = parseToNumber(acc[key]['total'] || '0')
              const total = parseToNumber(item['total'] || '0')
              acc[key]['totalCap'] = basetotalCap + totalCap
              acc[key]['total'] = basetotal + total

              const baseutilization = parseToNumber(acc[key]['utilization'] || '0')
              const utilization = parseToNumber(item['utilization'] || '0')
              acc[key]['utilization'] = (baseutilization ?? 0) + (utilization ?? 0)
              acc[key]['arrNom'] = [...acc[key]['arrNom'], item]
              acc[key]['arrContractId'] = item && [...acc[key]['arrContractId'], item?.contract_code_id] || acc[key]['arrContractId']
            }

            return acc
          },
          {} as Record<string, any>
        )
      )
    }

    // ------

    const fnWtoDPointContract = (week_: any, day_: any) => {
      const toArr_ = (x: any) => (Array.isArray(x) ? x : x == null ? [] : [x])
      const idx_ = new Map<string, Set<string>>()
      for (const e of day_ ?? []) {
        const key = String(e?.gas_day_text).trim()
        const set = idx_.get(key) ?? new Set<string>()
        for (const id of toArr_(e?.arrContractId)) set.add(String(id))
        idx_.set(key, set)
      }

      const result = (week_ ?? []).filter((item) => {
        const set = idx_.get(String(item?.gas_day_text).trim())
        if (!set) return true
        return toArr_(item?.arrContractId).every((id) => !set.has(String(id)))
      })
      return result
    }

    // nom___
    const dMMBTUD: any = fnGroupByKeysALL(dMMBTUD1, horuss)
    const dMMSCFD: any = fnGroupByKeysALL(dMMSCFD1, horuss)

    // console.log('[S_GSP1] dMMSCFD1_tabnom : ', dMMSCFD1_tabnom?.filter((f:any) => f?.nomination_point === "S_GSP1"));
    // tab nom add exit tab MMSCF
    const dMMSCFD_tabnom: any = fnGroupByKeysALL(dMMSCFD1_tabnom, horuss)
    // console.log('[S_GSP1] dMMSCFD_tabnom : ', dMMSCFD_tabnom?.filter((f:any) => f?.nomination_point === "S_GSP1"));
    const dMMBTUDArea: any = fnGroupByKeys(dMMBTUD1, horuss)
    
    // console.log('[BPK1] wMMBTUD_ : ', wMMBTUD1?.filter((f:any) => f?.nomination_point === "BPK1"));
    const wMMBTUD_: any = fnGroupByKeysALL(wMMBTUD1, days) 

  
    const wMMSCFD_tabnom_: any = fnGroupByKeysALL(wMMSCFD1_tabnom, days)
   

    const wMMSCFD: any = fnGroupByKeys(wMMSCFD1, days)
    const wMMBTUD: any = fnGroupByKeys(wMMBTUD1, days)
    const wMMSCFD_tabnom: any = fnGroupByKeys(wMMSCFD1_tabnom, days)
    // ---- New All Park Un Min...
    const pualldMMSCFD: any = fnGroupByKeysParkUnMin_(pualldMMSCFD1, horuss)
    const pualldMMBTUD: any = fnGroupByKeysParkUnMin_(pualldMMBTUD1, horuss)
    const puallwMMSCFD: any = fnGroupByKeysParkUnMin_(puallwMMSCFD1, days)
    const puallwMMBTUD: any = fnGroupByKeysParkUnMin_(puallwMMBTUD1, days)
    // ----------

    const allpuallwMMBTUD = puallwMMBTUD?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg
      } = all
      // parkUnparkInstructedFlows
      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()

      let totalW = null
      let utilizationW = null

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          break

        case 1:
          totalW = all && all?.monday || 0
          break

        case 2:
          totalW = all && all?.tuesday || 0
          break

        case 3:
          totalW = all && all?.wednesday || 0
          break

        case 4:
          totalW = all && all?.thursday || 0
          break

        case 5:
          totalW = all && all?.friday || 0
          break

        case 6:
          totalW = all && all?.saturday || 0
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: totalW,
        utilization: utilizationW,
        H1: totalW / 24 || 0,
        H2: totalW / 24 || 0,
        H3: totalW / 24 || 0,
        H4: totalW / 24 || 0,
        H5: totalW / 24 || 0,
        H6: totalW / 24 || 0,
        H7: totalW / 24 || 0,
        H8: totalW / 24 || 0,
        H9: totalW / 24 || 0,
        H10: totalW / 24 || 0,
        H11: totalW / 24 || 0,
        H12: totalW / 24 || 0,
        H13: totalW / 24 || 0,
        H14: totalW / 24 || 0,
        H15: totalW / 24 || 0,
        H16: totalW / 24 || 0,
        H17: totalW / 24 || 0,
        H18: totalW / 24 || 0,
        H19: totalW / 24 || 0,
        H20: totalW / 24 || 0,
        H21: totalW / 24 || 0,
        H22: totalW / 24 || 0,
        H23: totalW / 24 || 0,
        H24: totalW / 24 || 0,
        total: totalW
      }
    })
    const dallpuallwMMBTUD: any = fnGroupByKeysParkUnMin_(allpuallwMMBTUD, horuss)
    const resultallwMMBTUD_all_ = fnWtoDPointContract(dallpuallwMMBTUD, pualldMMBTUD)
    const resultallwMMBTUD_all: any = fnGroupByKeysFinalParkUnMin_(resultallwMMBTUD_all_, horuss)
    const fDWallwMMBTUDcalc_all = [...pualldMMBTUD, ...resultallwMMBTUD_all]

    const allpuallwMMSCFD = puallwMMSCFD?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg
      } = all
      // parkUnparkInstructedFlows
      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()

      let totalW = null
      let utilizationW = null

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          break

        case 1:
          totalW = all && all?.monday || 0
          break

        case 2:
          totalW = all && all?.tuesday || 0
          break

        case 3:
          totalW = all && all?.wednesday || 0
          break

        case 4:
          totalW = all && all?.thursday || 0
          break

        case 5:
          totalW = all && all?.friday || 0
          break

        case 6:
          totalW = all && all?.saturday || 0
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: totalW,
        utilization: utilizationW,
        H1: totalW / 24 || 0,
        H2: totalW / 24 || 0,
        H3: totalW / 24 || 0,
        H4: totalW / 24 || 0,
        H5: totalW / 24 || 0,
        H6: totalW / 24 || 0,
        H7: totalW / 24 || 0,
        H8: totalW / 24 || 0,
        H9: totalW / 24 || 0,
        H10: totalW / 24 || 0,
        H11: totalW / 24 || 0,
        H12: totalW / 24 || 0,
        H13: totalW / 24 || 0,
        H14: totalW / 24 || 0,
        H15: totalW / 24 || 0,
        H16: totalW / 24 || 0,
        H17: totalW / 24 || 0,
        H18: totalW / 24 || 0,
        H19: totalW / 24 || 0,
        H20: totalW / 24 || 0,
        H21: totalW / 24 || 0,
        H22: totalW / 24 || 0,
        H23: totalW / 24 || 0,
        H24: totalW / 24 || 0,
        total: totalW
      }
    })
    const dallpuallwMMSCFD: any = fnGroupByKeysParkUnMin_(allpuallwMMSCFD, horuss)
    const resultallwMMSCFD_all_ = fnWtoDPointContract(dallpuallwMMSCFD, pualldMMSCFD)
    const resultallwMMSCFD_all: any = fnGroupByKeysFinalParkUnMin_(resultallwMMSCFD_all_, horuss)
    const fDWallwMMSCFDcalc_all = [...pualldMMSCFD, ...resultallwMMSCFD_all]

    // ---- New All Concept point...
    const conceptalldMMBTUD: any = fnGroupByKeys(conceptalldMMBTUD1, horuss)
    const conceptalldMMSCF: any = fnGroupByKeys(conceptalldMMSCFD1, horuss)
    const conceptallwMMBTUD: any = fnGroupByKeys(conceptallwMMBTUD1, days)
    const conceptallwMMSCF: any = fnGroupByKeys(conceptallwMMSCFD1, days)
    // ----------

    const allconceptallwMMBTUD = conceptallwMMBTUD?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg
      } = all
      // parkUnparkInstructedFlows
      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()

      let totalW = null
      let utilizationW = null

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          break

        case 1:
          totalW = all && all?.monday || 0
          break

        case 2:
          totalW = all && all?.tuesday || 0
          break

        case 3:
          totalW = all && all?.wednesday || 0
          break

        case 4:
          totalW = all && all?.thursday || 0
          break

        case 5:
          totalW = all && all?.friday || 0
          break

        case 6:
          totalW = all && all?.saturday || 0
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: this.roundTo3(totalW),
        utilization: utilizationW,
        H1: this.roundTo3(totalW / 24 || 0),
        H2: this.roundTo3(totalW / 24 || 0),
        H3: this.roundTo3(totalW / 24 || 0),
        H4: this.roundTo3(totalW / 24 || 0),
        H5: this.roundTo3(totalW / 24 || 0),
        H6: this.roundTo3(totalW / 24 || 0),
        H7: this.roundTo3(totalW / 24 || 0),
        H8: this.roundTo3(totalW / 24 || 0),
        H9: this.roundTo3(totalW / 24 || 0),
        H10: this.roundTo3(totalW / 24 || 0),
        H11: this.roundTo3(totalW / 24 || 0),
        H12: this.roundTo3(totalW / 24 || 0),
        H13: this.roundTo3(totalW / 24 || 0),
        H14: this.roundTo3(totalW / 24 || 0),
        H15: this.roundTo3(totalW / 24 || 0),
        H16: this.roundTo3(totalW / 24 || 0),
        H17: this.roundTo3(totalW / 24 || 0),
        H18: this.roundTo3(totalW / 24 || 0),
        H19: this.roundTo3(totalW / 24 || 0),
        H20: this.roundTo3(totalW / 24 || 0),
        H21: this.roundTo3(totalW / 24 || 0),
        H22: this.roundTo3(totalW / 24 || 0),
        H23: this.roundTo3(totalW / 24 || 0),
        H24: this.roundTo3(totalW / 24 || 0),
        total: this.roundTo3(totalW)
      }
    })

    const dallconceptallwMMBTUD: any = fnGroupByKeys(allconceptallwMMBTUD, horuss)
    const resultallwMMBTUD_allconcept_ = fnWtoDPointContract(dallconceptallwMMBTUD, conceptalldMMBTUD)
    const resultallwMMBTUD_allconcept: any = fnGroupByKeysFinal(resultallwMMBTUD_allconcept_, horuss)
    const fDWallwMMBTUDcalc_allconcept = [...conceptalldMMBTUD, ...resultallwMMBTUD_allconcept]
    //

    const allconceptallwMMSCF = conceptallwMMSCF?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg
      } = all
      // parkUnparkInstructedFlows
      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()

      let totalW = null
      let utilizationW = null

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          break

        case 1:
          totalW = all && all?.monday || 0
          break

        case 2:
          totalW = all && all?.tuesday || 0
          break

        case 3:
          totalW = all && all?.wednesday || 0
          break

        case 4:
          totalW = all && all?.thursday || 0
          break

        case 5:
          totalW = all && all?.friday || 0
          break

        case 6:
          totalW = all && all?.saturday || 0
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: this.roundTo3(totalW),
        utilization: utilizationW,
        H1: this.roundTo3(totalW / 24 || 0),
        H2: this.roundTo3(totalW / 24 || 0),
        H3: this.roundTo3(totalW / 24 || 0),
        H4: this.roundTo3(totalW / 24 || 0),
        H5: this.roundTo3(totalW / 24 || 0),
        H6: this.roundTo3(totalW / 24 || 0),
        H7: this.roundTo3(totalW / 24 || 0),
        H8: this.roundTo3(totalW / 24 || 0),
        H9: this.roundTo3(totalW / 24 || 0),
        H10: this.roundTo3(totalW / 24 || 0),
        H11: this.roundTo3(totalW / 24 || 0),
        H12: this.roundTo3(totalW / 24 || 0),
        H13: this.roundTo3(totalW / 24 || 0),
        H14: this.roundTo3(totalW / 24 || 0),
        H15: this.roundTo3(totalW / 24 || 0),
        H16: this.roundTo3(totalW / 24 || 0),
        H17: this.roundTo3(totalW / 24 || 0),
        H18: this.roundTo3(totalW / 24 || 0),
        H19: this.roundTo3(totalW / 24 || 0),
        H20: this.roundTo3(totalW / 24 || 0),
        H21: this.roundTo3(totalW / 24 || 0),
        H22: this.roundTo3(totalW / 24 || 0),
        H23: this.roundTo3(totalW / 24 || 0),
        H24: this.roundTo3(totalW / 24 || 0),
        total: this.roundTo3(totalW)
      }
    })

    const dallconceptallwMMSCF: any = fnGroupByKeys(allconceptallwMMSCF, horuss)
    const resultallwMMSCF_allconcept_ = fnWtoDPointContract(dallconceptallwMMSCF, conceptalldMMSCF)
    const resultallwMMSCF_allconcept: any = fnGroupByKeysFinal(resultallwMMSCF_allconcept_, horuss)
    const fDWallwMMSCFcalc_allconcept = [...conceptalldMMSCF, ...resultallwMMSCF_allconcept]

    // ----------

    const allwMMSCFD = wMMSCFD?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg
      } = all

      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()
      let totalW = null
      let utilizationW = null

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          utilizationW = all && all?.sunday_utilization || 0
          break

        case 1:
          totalW = all && all?.monday || 0
          utilizationW = all && all?.monday_utilization || 0
          break

        case 2:
          totalW = all && all?.tuesday || 0
          utilizationW = all && all?.tuesday_utilization || 0
          break

        case 3:
          totalW = all && all?.wednesday || 0
          utilizationW = all && all?.wednesday_utilization || 0
          break

        case 4:
          totalW = all && all?.thursday || 0
          utilizationW = all && all?.thursday_utilization || 0
          break

        case 5:
          totalW = all && all?.friday || 0
          utilizationW = all && all?.friday_utilization || 0
          break

        case 6:
          totalW = all && all?.saturday || 0
          utilizationW = all && all?.saturday_utilization || 0
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: totalW,
        utilization: utilizationW,
        H1: totalW / 24 || 0,
        H2: totalW / 24 || 0,
        H3: totalW / 24 || 0,
        H4: totalW / 24 || 0,
        H5: totalW / 24 || 0,
        H6: totalW / 24 || 0,
        H7: totalW / 24 || 0,
        H8: totalW / 24 || 0,
        H9: totalW / 24 || 0,
        H10: totalW / 24 || 0,
        H11: totalW / 24 || 0,
        H12: totalW / 24 || 0,
        H13: totalW / 24 || 0,
        H14: totalW / 24 || 0,
        H15: totalW / 24 || 0,
        H16: totalW / 24 || 0,
        H17: totalW / 24 || 0,
        H18: totalW / 24 || 0,
        H19: totalW / 24 || 0,
        H20: totalW / 24 || 0,
        H21: totalW / 24 || 0,
        H22: totalW / 24 || 0,
        H23: totalW / 24 || 0,
        H24: totalW / 24 || 0,
        // H1: totalW || 0,
        // H2: totalW || 0,
        // H3: totalW || 0,
        // H4: totalW || 0,
        // H5: totalW || 0,
        // H6: totalW || 0,
        // H7: totalW || 0,
        // H8: totalW || 0,
        // H9: totalW || 0,
        // H10: totalW || 0,
        // H11: totalW || 0,
        // H12: totalW || 0,
        // H13: totalW || 0,
        // H14: totalW || 0,
        // H15: totalW || 0,
        // H16: totalW || 0,
        // H17: totalW || 0,
        // H18: totalW || 0,
        // H19: totalW || 0,
        // H20: totalW || 0,
        // H21: totalW || 0,
        // H22: totalW || 0,
        // H23: totalW || 0,
        // H24: totalW || 0,
        total: totalW
      }
    })

    // this.roundTo3
    const allwMMBTUD = wMMBTUD?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        unix,
        wi,
        hv,
        sg
      } = all

      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()

      let totalW = null
      let utilizationW = null

      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === nomination_point
      })

      const supplyRef = areaData?.find((f: any) => {
        return f?.name === area_text
      })

      let filDayWFormEva =
        entry_exit_id === 1
          ? eva?.newWeekly
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day_text)
              ?.filter((f: any) => f?.zone?.name === zone_text)
              ?.filter((f: any) => f?.area?.name === area_text)?.[0] || null
          : eva?.newWeekly
              ?.filter((f: any) => f?.parameter === 'HV')
              ?.filter((f: any) => f?.gasday === gas_day_text)
              ?.filter((f: any) => f?.zone?.name === supplyRef?.supply_reference_quality_area_by?.zone?.name)
              ?.filter((f: any) => f?.area?.name === supplyRef?.supply_reference_quality_area_by?.name)?.[0] || null

      const findHvsundayHv = filDayWFormEva?.sunday?.value || 0
      const findHvmondayHv = filDayWFormEva?.monday?.value || 0
      const findHvtuesdayHv = filDayWFormEva?.tuesday?.value || 0
      const findHvwednesdayHv = filDayWFormEva?.wednesday?.value || 0
      const findHvthursdayHv = filDayWFormEva?.thursday?.value || 0
      const findHvfridayHv = filDayWFormEva?.friday?.value || 0
      const findHvsaturdayHv = filDayWFormEva?.saturday?.value || 0

      const calcWeek = (cap: any, maximum_capacity: any, cHv: any) => {
        if (Number.isFinite((Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100)) {
          return (Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100
        } else {
          return 0
        }
      }

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          utilizationW = calcWeek(all?.sunday, nomPoint?.maximum_capacity, findHvsundayHv)

          break

        case 1:
          totalW = all && all?.monday || 0
          utilizationW = calcWeek(all?.monday, nomPoint?.maximum_capacity, findHvmondayHv)
          // utilizationW = all && all?.monday_utilization || 0;
          break

        case 2:
          totalW = all && all?.tuesday || 0
          utilizationW = calcWeek(all?.tuesday, nomPoint?.maximum_capacity, findHvtuesdayHv)
          // utilizationW = all && all?.tuesday_utilization || 0;
          break

        case 3:
          totalW = all && all?.wednesday || 0
          utilizationW = calcWeek(all?.wednesday, nomPoint?.maximum_capacity, findHvwednesdayHv)
          // utilizationW = all && all?.wednesday_utilization || 0;
          break

        case 4:
          totalW = all && all?.thursday || 0
          utilizationW = calcWeek(all?.thursday, nomPoint?.maximum_capacity, findHvthursdayHv)
          // utilizationW = all && all?.thursday_utilization || 0;
          break

        case 5:
          totalW = all && all?.friday || 0
          utilizationW = calcWeek(all?.friday, nomPoint?.maximum_capacity, findHvfridayHv)
          // utilizationW = all && all?.friday_utilization || 0;
          break

        case 6:
          totalW = all && all?.saturday || 0
          utilizationW = calcWeek(all?.saturday, nomPoint?.maximum_capacity, findHvsaturdayHv)
          // utilizationW = all && all?.saturday_utilization || 0;
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: this.roundTo3(totalW),
        utilization: utilizationW,
        H1: this.roundTo3(totalW / 24 || 0),
        H2: this.roundTo3(totalW / 24 || 0),
        H3: this.roundTo3(totalW / 24 || 0),
        H4: this.roundTo3(totalW / 24 || 0),
        H5: this.roundTo3(totalW / 24 || 0),
        H6: this.roundTo3(totalW / 24 || 0),
        H7: this.roundTo3(totalW / 24 || 0),
        H8: this.roundTo3(totalW / 24 || 0),
        H9: this.roundTo3(totalW / 24 || 0),
        H10: this.roundTo3(totalW / 24 || 0),
        H11: this.roundTo3(totalW / 24 || 0),
        H12: this.roundTo3(totalW / 24 || 0),
        H13: this.roundTo3(totalW / 24 || 0),
        H14: this.roundTo3(totalW / 24 || 0),
        H15: this.roundTo3(totalW / 24 || 0),
        H16: this.roundTo3(totalW / 24 || 0),
        H17: this.roundTo3(totalW / 24 || 0),
        H18: this.roundTo3(totalW / 24 || 0),
        H19: this.roundTo3(totalW / 24 || 0),
        H20: this.roundTo3(totalW / 24 || 0),
        H21: this.roundTo3(totalW / 24 || 0),
        H22: this.roundTo3(totalW / 24 || 0),
        H23: this.roundTo3(totalW / 24 || 0),
        H24: this.roundTo3(totalW / 24 || 0),
        total: this.roundTo3(totalW)
      }
    })
    // this.roundTo6
    const allwMMSCFD_tabnom = wMMSCFD_tabnom?.map((all: any) => {
      const {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg
      } = all

      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()
      let totalW = null
      let utilizationW = null

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          utilizationW = all && all?.sunday_utilization || 0
          break

        case 1:
          totalW = all && all?.monday || 0
          utilizationW = all && all?.monday_utilization || 0
          break

        case 2:
          totalW = all && all?.tuesday || 0
          utilizationW = all && all?.tuesday_utilization || 0
          break

        case 3:
          totalW = all && all?.wednesday || 0
          utilizationW = all && all?.wednesday_utilization || 0
          break

        case 4:
          totalW = all && all?.thursday || 0
          utilizationW = all && all?.thursday_utilization || 0
          break

        case 5:
          totalW = all && all?.friday || 0
          utilizationW = all && all?.friday_utilization || 0
          break

        case 6:
          totalW = all && all?.saturday || 0
          utilizationW = all && all?.saturday_utilization || 0
          break

        default:
          break
      }

      return {
        nomination_type_id,
        nomination_code,
        contract_code_id,
        group_id,
        query_shipper_nomination_file_renom_id,
        submitted_timestamp,
        nomination_full_json,
        nomination_row_json,
        unix,
        query_shipper_nomination_type_id,
        query_shipper_nomination_type,
        entry_exit_id,
        nomination_point,
        area_text,
        zone_text,
        id,
        parkUnparkInstructedFlows,
        customerType,
        wi,
        hv,
        sg,
        gas_day: getTodayNowDDMMYYYYDfault(gas_day_text).toDate(),
        gas_day_text: gas_day_text,
        totalCap: this.roundTo6(totalW),
        utilization: utilizationW,
        H1: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H2: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H3: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H4: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H5: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H6: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H7: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H8: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H9: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H10: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H11: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H12: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H13: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H14: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H15: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H16: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H17: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H18: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H19: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H20: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H21: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H22: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H23: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        H24: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24 || 0),
        total: this.roundTo6(entry_exit_id === 2 ? totalW : totalW / 24)
      }
    })

    const dallwMMSCFD: any = fnGroupByKeys(allwMMSCFD, horuss)
    const dallwMMBTUD: any = fnGroupByKeys(allwMMBTUD, horuss)

    const dallwMMSCFD_tabnom: any = fnGroupByKeys(allwMMSCFD_tabnom, horuss)

    const wMMBTUDArea: any = fnGroupByKeys(wMMBTUD1, days)

    console.timeEnd('sum G4')
    console.time('sum G5')

    // area___
    const groupByKeysALLArea = (item: any) => `${item?.gas_day_text}-${item?.area_text}`
    const groupByKeysArea = (item: any) => `${item?.gas_day_text}-${item?.area_text}-${item?.contract_code_id}`
    // New__
    const fnGroupByKeysALLArea = (nData: any) => {
      return Object.values(
        nData.reduce((acc, item) => {
          const key = groupByKeysALLArea(item)
          if (!acc[key]) {
            acc[key] = {
              gas_day_text: item.gas_day_text,
              area_text: item.area_text,
              data: []
            }
          }

          acc[key].data.push(item)

          return acc
        }, {})
      )
    }
    // New__
    const fnGroupByKeysArea = (nData: any) => {
      return Object.values(
        nData.reduce((acc, item) => {
          const key = groupByKeysArea(item)
          if (!acc[key]) {
            acc[key] = {
              gas_day_text: item.gas_day_text,
              area_text: item.area_text,
              data: []
            }
          }

          acc[key].data.push(item)

          return acc
        }, {})
      )
    }

    const dArea = fnGroupByKeysALLArea(dMMBTUDArea)
    console.log('[A1] dArea : ', dArea?.filter((f:any) => f?.area_text === "A1"));
    const dAreaFil = (dArea || []).map((e: any) => {
      const fareaData =
        areaData?.find((f: any) => {
          return f?.name === e?.area_text
        })?.area_nominal_capacity || 0
      let totalCap = this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.total || 0), 0) || 0)

      let utilization = Number(fareaData) > 0 ? this.roundTo2(((Number(totalCap) || 0) / Number(fareaData)) * 100) : 0
      // let utilization = (Number(totalCap) / (Number(nomPoint?.maximum_capacity ?? 0) * Number(hv))) * 100;

      const hourDay = {
        H1: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H1 || 0), 0)),
        H2: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H2 || 0), 0)),
        H3: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H3 || 0), 0)),
        H4: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H4 || 0), 0)),
        H5: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H5 || 0), 0)),
        H6: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H6 || 0), 0)),
        H7: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H7 || 0), 0)),
        H8: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H8 || 0), 0)),
        H9: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H9 || 0), 0)),
        H10: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H10 || 0), 0)),
        H11: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H11 || 0), 0)),
        H12: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H12 || 0), 0)),
        H13: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H13 || 0), 0)),
        H14: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H14 || 0), 0)),
        H15: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H15 || 0), 0)),
        H16: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H16 || 0), 0)),
        H17: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H17 || 0), 0)),
        H18: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H18 || 0), 0)),
        H19: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H19 || 0), 0)),
        H20: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H20 || 0), 0)),
        H21: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H21 || 0), 0)),
        H22: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H22 || 0), 0)),
        H23: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H23 || 0), 0)),
        H24: this.roundTo3(e['data']?.reduce((acc, item) => acc + (item?.H24 || 0), 0))
      }

      // delete e["data"]
      const {data, ...nE} = (e || null)
      return {
        ...nE,
        totalCap,
        utilization,
        ...hourDay,
        contract_code_id: data?.[0]?.contract_code_id,
        arrContractId: [...new Set(data?.flatMap((ct: any) => ct?.arrContractId))]
      }
    })

    const wArea_ = fnGroupByKeysALLArea(wMMBTUDArea)

    // this.roundTo3
    const wAreaFil_ = wArea_.map((e: any) => {
      let sundayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(acc + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['14']) || 0)), 0) || 0)
      let mondayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(acc + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['15']) || 0)), 0) || 0)
      let tuesdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(acc + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['16']) || 0)), 0) || 0)
      let wednesdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(acc + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['17']) || 0)), 0) || 0)
      let thursdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(acc + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['18']) || 0)), 0) || 0)
      let fridayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(acc + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['19']) || 0)), 0) || 0)
      let saturdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(acc + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['20']) || 0)), 0) || 0)

      const fareaData =
        areaData?.find((f: any) => {
          return f?.name === e?.area_text
        })?.area_nominal_capacity || 0

      let totalCap = this.roundTo3([sundayTotalCap, mondayTotalCap, tuesdayTotalCap, wednesdayTotalCap, thursdayTotalCap, fridayTotalCap, saturdayTotalCap]?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(item)), 0) || 0)

      // const calcWeek = (cap: any, fArea: any) => {
      //   if (Number.isFinite((Number(cap ?? 0) / Number(fArea)) * 100)) {
      //     return (Number(cap ?? 0) / Number(fArea)) * 100
      //   } else {
      //     return 0
      //   }
      // }

      const calcWeek = (cap: any, fArea: any) => {
       

        const capNum = Number(cap ?? 0);
        const areaNum = Number(fArea ?? 0);

        if (!areaNum) return 0;

        const result = (capNum / areaNum) * 100;

        if (!Number.isFinite(result)) return 0;

        return Number((Math.round(result * 100) / 100).toFixed(2));
      };

      const dayWeek = {
        gas_day_sunday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(0, 'day').format('DD/MM/YYYY'),
        sunday: sundayTotalCap,
        sunday_utilization: calcWeek(sundayTotalCap, fareaData),
        gas_day_monday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(1, 'day').format('DD/MM/YYYY'),
        monday: mondayTotalCap,
        monday_utilization: calcWeek(mondayTotalCap, fareaData),
        gas_day_tuesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(2, 'day').format('DD/MM/YYYY'),
        tuesday: tuesdayTotalCap,
        tuesday_utilization: calcWeek(tuesdayTotalCap, fareaData),
        gas_day_wednesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(3, 'day').format('DD/MM/YYYY'),
        wednesday: wednesdayTotalCap,
        wednesday_utilization: calcWeek(wednesdayTotalCap, fareaData),
        gas_day_thursday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(4, 'day').format('DD/MM/YYYY'),
        thursday: thursdayTotalCap,
        thursday_utilization: calcWeek(thursdayTotalCap, fareaData),
        gas_day_friday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(5, 'day').format('DD/MM/YYYY'),
        friday: fridayTotalCap,
        friday_utilization: calcWeek(fridayTotalCap, fareaData),
        gas_day_saturday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(6, 'day').format('DD/MM/YYYY'),
        saturday: saturdayTotalCap,
        saturday_utilization: calcWeek(saturdayTotalCap, fareaData)
      }

      // delete e["data"]
      const {data, ...nE} = (e || null)
      return {
        ...nE,
        totalCap,
        ...dayWeek,
        contract_code_id: data?.[0]?.contract_code_id,
        nomination_point: data?.[0]?.nomination_point,
        arrContractId: [...new Set(data?.flatMap((ct: any) => ct?.arrContractId))]
      }
    })
    
    // ----
    const wArea = fnGroupByKeysArea(wMMBTUDArea)

    // wednesday

    // 2 2022-CLF-018_Amd004 20260329-WNM-0002
    // 189 2026-CNF-005 20260404-WNM-0001 daily Weekly
    // 22 2026-CSF-002 20260329-WNM-0001

    // daily Weekly
    // this.roundTo3
    const wAreaFil = wArea.map((e: any) => {
      let sundayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3((parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['14']) || 0) / 24)), 0) || 0)
      let mondayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3((parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['15']) || 0) / 24)), 0) || 0)
      let tuesdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3((parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['16']) || 0) / 24)), 0) || 0)
      let wednesdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3((parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['17']) || 0) / 24)), 0) || 0)
      let thursdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3((parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['18']) || 0) / 24)), 0) || 0)
      let fridayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3((parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['19']) || 0) / 24)), 0) || 0)
      let saturdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3((parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['20']) || 0) / 24)), 0) || 0)

      let sundayTotalCap_o = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['14']) || 0)), 0) || 0)
      let mondayTotalCap_o = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['15']) || 0)), 0) || 0)
      let tuesdayTotalCap_o = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['16']) || 0)), 0) || 0)
      let wednesdayTotalCap_o = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['17']) || 0)), 0) || 0)
      let thursdayTotalCap_o = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['18']) || 0)), 0) || 0)
      let fridayTotalCap_o = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['19']) || 0)), 0) || 0)
      let saturdayTotalCap_o = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['20']) || 0)), 0) || 0)

      // let sundayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['14']) || 0)), 0) || 0)
      // let mondayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['15']) || 0)), 0) || 0)
      // let tuesdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['16']) || 0)), 0) || 0)
      // let wednesdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['17']) || 0)), 0) || 0)
      // let thursdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['18']) || 0)), 0) || 0)
      // let fridayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['19']) || 0)), 0) || 0)
      // let saturdayTotalCap = this.roundTo3(e['data']?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.['nomination_row_json']?.['data_temp']?.['20']) || 0)), 0) || 0)

      const fareaData =
        areaData?.find((f: any) => {
          return f?.name === e?.area_text
        })?.area_nominal_capacity || 0

      let totalCap = this.roundTo3([sundayTotalCap, mondayTotalCap, tuesdayTotalCap, wednesdayTotalCap, thursdayTotalCap, fridayTotalCap, saturdayTotalCap]?.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(item)), 0) || 0)

      const calcWeek = (cap: any, fArea: any) => {
        if (Number.isFinite((Number(cap ?? 0) / Number(fArea)) * 100)) {
          return (Number(cap ?? 0) / Number(fArea)) * 100
        } else {
          return 0
        }
      }

      const dayWeek = {
        gas_day_sunday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(0, 'day').format('DD/MM/YYYY'),
        sunday: sundayTotalCap,
        sunday_utilization: calcWeek(sundayTotalCap_o, fareaData),
        gas_day_monday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(1, 'day').format('DD/MM/YYYY'),
        monday: mondayTotalCap,
        monday_utilization: calcWeek(sundayTotalCap_o, fareaData),
        gas_day_tuesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(2, 'day').format('DD/MM/YYYY'),
        tuesday: tuesdayTotalCap,
        tuesday_utilization: calcWeek(tuesdayTotalCap_o, fareaData),
        gas_day_wednesday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(3, 'day').format('DD/MM/YYYY'),
        wednesday: wednesdayTotalCap,
        wednesday_utilization: calcWeek(wednesdayTotalCap_o, fareaData),
        gas_day_thursday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(4, 'day').format('DD/MM/YYYY'),
        thursday: thursdayTotalCap,
        thursday_utilization: calcWeek(thursdayTotalCap_o, fareaData),
        gas_day_friday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(5, 'day').format('DD/MM/YYYY'),
        friday: fridayTotalCap,
        friday_utilization: calcWeek(fridayTotalCap_o, fareaData),
        gas_day_saturday: getTodayNowDDMMYYYYDfault(e && e?.gas_day_text || undefined).add(6, 'day').format('DD/MM/YYYY'),
        saturday: saturdayTotalCap,
        saturday_utilization: calcWeek(saturdayTotalCap_o, fareaData)
      }

      // delete e["data"]
      const {data, ...nE} = (e || null)
      return {
        ...nE,
        totalCap,
        ...dayWeek,
        contract_code_id: data?.[0]?.contract_code_id,
        nomination_point: data?.[0]?.nomination_point,
        arrContractId: [...new Set(data?.flatMap((ct: any) => ct?.arrContractId))]
      }
    })

    // this.roundTo3
    const allAreaFil = wAreaFil.map((all: any) => {
      const checkDy = getTodayNowDDMMYYYYDfault(gas_day_text).day()
      let totalW = null
      let utilizationW = null

      switch (checkDy) {
        case 0:
          totalW = all && all?.sunday || 0
          utilizationW = all && all?.sunday_utilization || 0
          break

        case 1:
          totalW = all && all?.monday || 0
          utilizationW = all && all?.monday_utilization || 0
          break

        case 2:
          totalW = all && all?.tuesday || 0
          utilizationW = all && all?.tuesday_utilization || 0
          break

        case 3:
          totalW = all && all?.wednesday || 0
          utilizationW = all && all?.wednesday_utilization || 0
          break

        case 4:
          totalW = all && all?.thursday || 0
          utilizationW = all && all?.thursday_utilization || 0
          break

        case 5:
          totalW = all && all?.friday || 0
          utilizationW = all && all?.friday_utilization || 0
          break

        case 6:
          totalW = all && all?.saturday || 0
          utilizationW = all && all?.saturday_utilization || 0
          break

        default:
          break
      }

      return {
        gas_day_text: gas_day_text,
        area_text: all?.area_text,
        // arrContractId: [...new Set(data?.flatMap((ct:any) => ct?.arrContractId))]
        arrContractId: all?.arrContractId,
        contract_code_id: all?.contract_code_id,
        nomination_point: all?.nomination_point,
        totalCap: this.roundTo3(totalW) * 24,
        // totalCap: this.roundTo3(totalW), ???
        utilization: utilizationW ?? 0,
        H1: this.roundTo3(totalW || 0),
        H2: this.roundTo3(totalW || 0),
        H3: this.roundTo3(totalW || 0),
        H4: this.roundTo3(totalW || 0),
        H5: this.roundTo3(totalW || 0),
        H6: this.roundTo3(totalW || 0),
        H7: this.roundTo3(totalW || 0),
        H8: this.roundTo3(totalW || 0),
        H9: this.roundTo3(totalW || 0),
        H10: this.roundTo3(totalW || 0),
        H11: this.roundTo3(totalW || 0),
        H12: this.roundTo3(totalW || 0),
        H13: this.roundTo3(totalW || 0),
        H14: this.roundTo3(totalW || 0),
        H15: this.roundTo3(totalW || 0),
        H16: this.roundTo3(totalW || 0),
        H17: this.roundTo3(totalW || 0),
        H18: this.roundTo3(totalW || 0),
        H19: this.roundTo3(totalW || 0),
        H20: this.roundTo3(totalW || 0),
        H21: this.roundTo3(totalW || 0),
        H22: this.roundTo3(totalW || 0),
        H23: this.roundTo3(totalW || 0),
        H24: this.roundTo3(totalW || 0),
        // H1: this.roundTo3(totalW / 24 || 0),
        // H2: this.roundTo3(totalW / 24 || 0),
        // H3: this.roundTo3(totalW / 24 || 0),
        // H4: this.roundTo3(totalW / 24 || 0),
        // H5: this.roundTo3(totalW / 24 || 0),
        // H6: this.roundTo3(totalW / 24 || 0),
        // H7: this.roundTo3(totalW / 24 || 0),
        // H8: this.roundTo3(totalW / 24 || 0),
        // H9: this.roundTo3(totalW / 24 || 0),
        // H10: this.roundTo3(totalW / 24 || 0),
        // H11: this.roundTo3(totalW / 24 || 0),
        // H12: this.roundTo3(totalW / 24 || 0),
        // H13: this.roundTo3(totalW / 24 || 0),
        // H14: this.roundTo3(totalW / 24 || 0),
        // H15: this.roundTo3(totalW / 24 || 0),
        // H16: this.roundTo3(totalW / 24 || 0),
        // H17: this.roundTo3(totalW / 24 || 0),
        // H18: this.roundTo3(totalW / 24 || 0),
        // H19: this.roundTo3(totalW / 24 || 0),
        // H20: this.roundTo3(totalW / 24 || 0),
        // H21: this.roundTo3(totalW / 24 || 0),
        // H22: this.roundTo3(totalW / 24 || 0),
        // H23: this.roundTo3(totalW / 24 || 0),
        // H24: this.roundTo3(totalW / 24 || 0),
        total: this.roundTo3(totalW) * 24
        // total: this.roundTo3(totalW) ???
      }
    })

    // Imb___

    const dImbalanceMMBTUD = dMMBTUDArea.reduce((acc, item) => {
      const key = `${item.gas_day_text}`

      if (!acc[key]) {
        acc[key] = {
          gas_day_text: item.gas_day_text,
          data: []
        }
      }

      acc[key].data.push(item)

      return acc
    }, {})
    const dImbalanceMMBTUDObj = Object.values(dImbalanceMMBTUD)

    const dImbalance = dImbalanceMMBTUDObj.map((e: any) => {
      // { entryExit: 2, text: 'Park' }
      const tpark = adailyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Park'
      })
      const park = tpark.reduce((acc, item) => {
        return acc + (Number(item?.nomination_row_json['data_temp']['38']?.replace(/,/g, '')) || 0)
      }, 0)
      // { entryExit: 1, text: 'Unpark' }
      const tunpark = adailyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Unpark'
      })
      const unpark = tunpark.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp']['38']?.replace(/,/g, '')) || 0), 0)
      // { entryExit: 2, text: 'Min_Inventory_Change' }
      const tchange_min_invent = adailyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Min_Inventory_Change'
      })
      const change_min_invent = tchange_min_invent.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp']['38']?.replace(/,/g, '')) || 0), 0)
      // { entryExit: 2, text: 'Shrinkage_Volume' }
      const tshrinkage = adailyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Shrinkage_Volume'
      })
      const shrinkage = tshrinkage.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp']['38']?.replace(/,/g, '')) || 0), 0)
      // totalEntry - totalExit - change_min_invent - park + unpark - shrinkage
      const entry = e?.data?.filter((f: any) => {
        return f?.unix === 'MMBTU/D' && f?.nomination_row_json?.entry_exit_id === 1
      })
      const tentry = this.roundTo3(entry.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.nomination_row_json['data_temp']['38']) || 0)), 0))
      const exit = e?.data?.filter((f: any) => {
        return f?.unix === 'MMBTU/D' && f?.nomination_row_json?.entry_exit_id === 2
      })
      const texit = this.roundTo3(exit.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.nomination_row_json['data_temp']['38']) || 0)), 0))
      // https://app.clickup.com/t/86ettycre
      const imbalance = this.roundTo3(tentry - texit - change_min_invent - park + unpark - shrinkage)
      // const imbalance = tentry - texit;
      // imbalance / totalEntry
      // const imbalance_percent = imbalance / tentry;
      const imbalance_percent = this.roundTo3((imbalance / tentry) * 100)

      // delete e["data"]
      const {data, ...nE} = (e || null)
      return {
        ...nE,
        park,
        unpark,
        change_min_invent,
        shrinkage,
        imbalance,
        imbalance_percent,
        entryTotal: tentry,
        exitTotal: texit,
        contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
      }
    })

    const wImbalanceMMBTUD_ = wMMBTUDArea.reduce((acc, item) => {
      const key = `${item.gas_day_text}`
      // const key = `${item.gas_day_text}-${item?.contract_code_id}`;

      if (!acc[key]) {
        acc[key] = {
          gas_day_text: item.gas_day_text,
          data: []
        }
      }

      acc[key].data.push(item)

      return acc
    }, {})
    const wImbalanceMMBTUDObj_ = Object.values(wImbalanceMMBTUD_)
    const wImbalance_ = wImbalanceMMBTUDObj_.flatMap((e: any) => {
      const contractArr = e?.data?.map((ct: any) => ct?.contract_code_id) || []
      const findaweeklyArrNom = aweeklyArrNom?.filter((f: any) => contractArr?.includes(f?.contract_code_id))

      const tpark = findaweeklyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Park'
      })
      const park = (index: any) => tpark.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp'][index]?.replace(/,/g, '')) || 0), 0)
      const tunpark = findaweeklyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Unpark'
      })

      const unpark = (index: any) => tunpark.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp'][index]?.replace(/,/g, '')) || 0), 0)
      const tchange_min_invent = findaweeklyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Min_Inventory_Change'
      })
      const change_min_invent = (index: any) => tchange_min_invent.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp'][index]?.replace(/,/g, '')) || 0), 0)
      const tshrinkage = findaweeklyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Shrinkage_Volume'
      })
      const shrinkage = (index: any) => tshrinkage.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp'][index]?.replace(/,/g, '')) || 0), 0)
      // totalEntry - totalExit - change_min_invent - park + unpark - shrinkage
      const entry = e?.data?.filter((f: any) => {
        return f?.unix === 'MMBTU/D' && f?.nomination_row_json?.entry_exit_id === 1
      })

      const tentry = (index: any) => entry.reduce((acc, item) => acc + (parseToNumber(item?.nomination_row_json['data_temp'][index]) || 0), 0)
      const exit = e?.data?.filter((f: any) => {
        return f?.unix === 'MMBTU/D' && f?.nomination_row_json?.entry_exit_id === 2
      })

      const texit = (index: any) => exit.reduce((acc, item) => acc + (parseToNumber(item?.nomination_row_json['data_temp'][index]) || 0), 0)
      // const imbalance = (index: any) => tentry(index) - texit(index);
      const imbalance = (index: any) => this.roundTo3(tentry(index) - texit(index) - change_min_invent(index) - park(index) + unpark(index) - shrinkage(index))
      // imbalance / totalEntry
      // const imbalance_percent = (index: any) => imbalance(index) / tentry(index);
      // https://app.clickup.com/t/86etu0c88

      const imbalance_percent = (index: any) => this.roundTo3((imbalance(index) / tentry(index)) * 100)

      // delete e["data"]
      const {data, ...nE} = (e || null)
      return [
        {
          // ...nE,
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(0, 'day').format('DD/MM/YYYY'),
          park: park('14'),
          unpark: unpark('14'),
          change_min_invent: change_min_invent('14'),
          shrinkage: shrinkage('14'),
          imbalance: imbalance('14'),
          imbalance_percent: imbalance_percent('14'),
          entryTotal: tentry('14'),
          exitTotal: texit('14'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(1, 'day').format('DD/MM/YYYY'),
          park: park('15'),
          unpark: unpark('15'),
          change_min_invent: change_min_invent('15'),
          shrinkage: shrinkage('15'),
          imbalance: imbalance('15'),
          imbalance_percent: imbalance_percent('15'),
          entryTotal: tentry('15'),
          exitTotal: texit('15'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(2, 'day').format('DD/MM/YYYY'),
          park: park('16'),
          unpark: unpark('16'),
          change_min_invent: change_min_invent('16'),
          shrinkage: shrinkage('16'),
          imbalance: imbalance('16'),
          imbalance_percent: imbalance_percent('16'),
          entryTotal: tentry('16'),
          exitTotal: texit('16'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(3, 'day').format('DD/MM/YYYY'),
          park: park('17'),
          unpark: unpark('17'),
          change_min_invent: change_min_invent('17'),
          shrinkage: shrinkage('17'),
          imbalance: imbalance('17'),
          imbalance_percent: imbalance_percent('17'),
          entryTotal: tentry('17'),
          exitTotal: texit('17'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(4, 'day').format('DD/MM/YYYY'),
          park: park('18'),
          unpark: unpark('18'),
          change_min_invent: change_min_invent('18'),
          shrinkage: shrinkage('18'),
          imbalance: imbalance('18'),
          imbalance_percent: imbalance_percent('18'),
          entryTotal: tentry('18'),
          exitTotal: texit('18'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(5, 'day').format('DD/MM/YYYY'),
          park: park('19'),
          unpark: unpark('19'),
          change_min_invent: change_min_invent('19'),
          shrinkage: shrinkage('19'),
          imbalance: imbalance('19'),
          imbalance_percent: imbalance_percent('19'),
          entryTotal: tentry('19'),
          exitTotal: texit('19'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(6, 'day').format('DD/MM/YYYY'),
          park: park('20'),
          unpark: unpark('20'),
          change_min_invent: change_min_invent('20'),
          shrinkage: shrinkage('20'),
          imbalance: imbalance('20'),
          imbalance_percent: imbalance_percent('20'),
          entryTotal: tentry('20'),
          exitTotal: texit('20'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        }
      ]
    })

    const wImbalanceMMBTUD = wMMBTUDArea.reduce((acc, item) => {
      // const key = `${item.gas_day_text}`;
      const key = `${item.gas_day_text}-${item?.contract_code_id}`

      if (!acc[key]) {
        acc[key] = {
          gas_day_text: item.gas_day_text,
          data: []
        }
      }

      acc[key].data.push(item)

      return acc
    }, {})
    const wImbalanceMMBTUDObj = Object.values(wImbalanceMMBTUD)

    const wImbalance = wImbalanceMMBTUDObj.flatMap((e: any) => {
      const contractArr = e?.data?.map((ct: any) => ct?.contract_code_id) || []
      const findaweeklyArrNom = aweeklyArrNom?.filter((f: any) => contractArr?.includes(f?.contract_code_id))

      const tpark = findaweeklyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Park'
      })
      const park = (index: any) => tpark.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp'][index]?.replace(/,/g, '')) || 0), 0)
      const tunpark = findaweeklyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Unpark'
      })

      const unpark = (index: any) => tunpark.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp'][index]?.replace(/,/g, '')) || 0), 0)
      const tchange_min_invent = findaweeklyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Min_Inventory_Change'
      })

      const change_min_invent = (index: any) => {
        return tchange_min_invent.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp'][index]?.replace(/,/g, '')) || 0), 0)
      }
      const tshrinkage = findaweeklyArrNom.filter((f: any) => {
        return f?.nomination_row_json['data_temp']['5'] === 'Shrinkage_Volume'
      })

      const shrinkage = (index: any) => tshrinkage.reduce((acc, item) => acc + (Number(item?.nomination_row_json['data_temp'][index]?.replace(/,/g, '')) || 0), 0)
      // totalEntry - totalExit - change_min_invent - park + unpark - shrinkage
      const entry = e?.data?.filter((f: any) => {
        return f?.unix === 'MMBTU/D' && f?.nomination_row_json?.entry_exit_id === 1
      })

      const tentry = (index: any) => this.roundTo3(entry.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.nomination_row_json['data_temp'][index]) || 0)), 0))
      const exit = e?.data?.filter((f: any) => {
        return f?.unix === 'MMBTU/D' && f?.nomination_row_json?.entry_exit_id === 2
      })

      const texit = (index: any) => this.roundTo3(exit.reduce((acc, item) => this.roundTo3(this.roundTo3(acc) + this.roundTo3(parseToNumber(item?.nomination_row_json['data_temp'][index]) || 0)), 0))
      // const imbalance = (index: any) => tentry(index) - texit(index);
      const imbalance = (index: any) => this.roundTo3(tentry(index) - texit(index) - change_min_invent(index) - park(index) + unpark(index) - shrinkage(index))
      // imbalance / totalEntry
      // const imbalance_percent = (index: any) => imbalance(index) / tentry(index);
      // https://app.clickup.com/t/86etu0c88

      const imbalance_percent = (index: any) => this.roundTo3((imbalance(index) / tentry(index)) * 100)

      // delete e["data"]
      const {data, ...nE} = (e || null)
      return [
        {
          // ...nE,
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(0, 'day').format('DD/MM/YYYY'),
          park: park('14'),
          unpark: unpark('14'),
          change_min_invent: change_min_invent('14'),
          shrinkage: shrinkage('14'),
          imbalance: imbalance('14'),
          imbalance_percent: imbalance_percent('14'),
          entryTotal: tentry('14'),
          exitTotal: texit('14'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(1, 'day').format('DD/MM/YYYY'),
          park: park('15'),
          unpark: unpark('15'),
          change_min_invent: change_min_invent('15'),
          shrinkage: shrinkage('15'),
          imbalance: imbalance('15'),
          imbalance_percent: imbalance_percent('15'),
          entryTotal: tentry('15'),
          exitTotal: texit('15'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(2, 'day').format('DD/MM/YYYY'),
          park: park('16'),
          unpark: unpark('16'),
          change_min_invent: change_min_invent('16'),
          shrinkage: shrinkage('16'),
          imbalance: imbalance('16'),
          imbalance_percent: imbalance_percent('16'),
          entryTotal: tentry('16'),
          exitTotal: texit('16'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(3, 'day').format('DD/MM/YYYY'),
          park: park('17'),
          unpark: unpark('17'),
          change_min_invent: change_min_invent('17'),
          shrinkage: shrinkage('17'),
          imbalance: imbalance('17'),
          imbalance_percent: imbalance_percent('17'),
          entryTotal: tentry('17'),
          exitTotal: texit('17'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(4, 'day').format('DD/MM/YYYY'),
          park: park('18'),
          unpark: unpark('18'),
          change_min_invent: change_min_invent('18'),
          shrinkage: shrinkage('18'),
          imbalance: imbalance('18'),
          imbalance_percent: imbalance_percent('18'),
          entryTotal: tentry('18'),
          exitTotal: texit('18'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(5, 'day').format('DD/MM/YYYY'),
          park: park('19'),
          unpark: unpark('19'),
          change_min_invent: change_min_invent('19'),
          shrinkage: shrinkage('19'),
          imbalance: imbalance('19'),
          imbalance_percent: imbalance_percent('19'),
          entryTotal: tentry('19'),
          exitTotal: texit('19'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        },
        {
          gas_day_text: getTodayNowDDMMYYYYDfault(nE?.gas_day_text).add(6, 'day').format('DD/MM/YYYY'),
          park: park('20'),
          unpark: unpark('20'),
          change_min_invent: change_min_invent('20'),
          shrinkage: shrinkage('20'),
          imbalance: imbalance('20'),
          imbalance_percent: imbalance_percent('20'),
          entryTotal: tentry('20'),
          exitTotal: texit('20'),
          contract_code_id: [...new Set(data?.map((ct: any) => ct?.contract_code_id))]
        }
      ]
    })

    const allImbalance = wImbalance?.filter((f: any) => {
      return f?.gas_day_text === gas_day_text
    })

    console.timeEnd('sum G5')
    console.time('sum G6')

    // total park un .....
    const dTotalParkUnparkMin_ = [...pualldMMSCFD, ...pualldMMBTUD].map((e: any) => {
      e['parkUnparkInstructedFlows'] = e['nomination_row_json']?.['data_temp']?.['5'] || null
      e['customerType'] = e['nomination_row_json']?.['data_temp']?.['6'] || null
      e['unix'] = e['unix'] || null
      // e['unix'] = e['nomination_row_json']?.['data_temp']?.['9'] || null;
      e['wi'] = e['nomination_row_json']?.['data_temp']?.['11'] || null
      e['hv'] = e['nomination_row_json']?.['data_temp']?.['12'] || null
      e['sg'] = e['nomination_row_json']?.['data_temp']?.['13'] || null

      return {...e}
    })

    const groupedDTotalParkUnparkMin_ = dTotalParkUnparkMin_.reduce((acc: any, item: any) => {
      const groupKey = `${item.area_text || 'null'}_${item.zone_text || 'null'}_${item.nomination_point || 'null'}_${item.entry_exit_id || 'null'}_${item.customerType || 'null'}_${item.unix || 'null'}_${item.parkUnparkInstructedFlows || 'null'}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          area_text: item.area_text,
          zone_text: item.zone_text,
          nomination_point: item && item.nomination_point || "",
          entry_exit_id: item.entry_exit_id,
          customerType: item.customerType,
          unix: item.unix,
          parkUnparkInstructedFlows: item.parkUnparkInstructedFlows,
          wi: null,
          hv: null,
          sg: null,
          total: null,
          totalCap: null,
          utilization: null,
          H1: null,
          H2: null,
          H3: null,
          H4: null,
          H5: null,
          H6: null,
          H7: null,
          H8: null,
          H9: null,
          H10: null,
          H11: null,
          H12: null,
          H13: null,
          H14: null,
          H15: null,
          H16: null,
          H17: null,
          H18: null,
          H19: null,
          H20: null,
          H21: null,
          H22: null,
          H23: null,
          H24: null,
          items: []
        }
      }

      // excel  wi 11 hv 12 sg 13

      const _calc_vi_all =
        (item && item?.arrNom || []).reduce((accIn, currIn) => {
          let resultIn = 0
          if (currIn?.nomination_type_id === 1) {
            // day
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
          } else {
            // week
            const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
            const gasDay = fnDay7(gas_day_text)
            const idx0 = gasDay.indexOf(gas_day_text)
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
          }
          return accIn + resultIn
        }, 0) ?? 0

      const _calc_hv_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let hv_ = 0
            let vi_ = 0
            hv_ = parseToNumber(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (hv_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = hv_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_sg_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let vi_ = 0
            let sg_ = 0
            sg_ = parseToNumber(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (sg_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = sg_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_final_hv = _calc_vi_all === 0 && _calc_hv_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_hv_x_vi_all / _calc_vi_all)
      const _calc_final_sg = _calc_vi_all === 0 && _calc_sg_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_sg_x_vi_all / _calc_vi_all)
      const _calc_final_wi = _calc_hv_x_vi_all / 0.982596 / Math.sqrt(_calc_sg_x_vi_all * _calc_vi_all)

      // ---------

      acc[groupKey].wi = _calc_final_wi
      acc[groupKey].hv = _calc_final_hv
      acc[groupKey].sg = _calc_final_sg

      // -------

      // acc[groupKey].wi = acc[groupKey].wi
      //   ? acc[groupKey].wi + (parseToNumber(item.wi) ?? 0)
      //   : parseToNumber(item.wi);
      // acc[groupKey].hv = acc[groupKey].hv
      //   ? acc[groupKey].hv + (parseToNumber(item.hv) ?? 0)
      //   : parseToNumber(item.hv);
      // acc[groupKey].sg = acc[groupKey].sg
      //   ? acc[groupKey].sg + (parseToNumber(item.sg) ?? 0)
      //   : parseToNumber(item.sg);
      acc[groupKey].total = acc[groupKey].total ? acc[groupKey].total + (parseToNumber(item.total) ?? 0) : parseToNumber(item.total)
      acc[groupKey].totalCap = acc[groupKey].totalCap ? acc[groupKey].totalCap + (parseToNumber(item.totalCap) ?? 0) : parseToNumber(item.totalCap)
      acc[groupKey].utilization = acc[groupKey].utilization ? acc[groupKey].utilization + (parseToNumber(item.utilization) ?? 0) : parseToNumber(item.utilization)
      acc[groupKey].H1 = acc[groupKey].H1 ? acc[groupKey].H1 + (parseToNumber(item.H1) ?? 0) : parseToNumber(item.H1)
      acc[groupKey].H2 = acc[groupKey].H2 ? acc[groupKey].H2 + (parseToNumber(item.H2) ?? 0) : parseToNumber(item.H2)
      acc[groupKey].H3 = acc[groupKey].H3 ? acc[groupKey].H3 + (parseToNumber(item.H3) ?? 0) : parseToNumber(item.H3)
      acc[groupKey].H4 = acc[groupKey].H4 ? acc[groupKey].H4 + (parseToNumber(item.H4) ?? 0) : parseToNumber(item.H4)
      acc[groupKey].H5 = acc[groupKey].H5 ? acc[groupKey].H5 + (parseToNumber(item.H5) ?? 0) : parseToNumber(item.H5)
      acc[groupKey].H6 = acc[groupKey].H6 ? acc[groupKey].H6 + (parseToNumber(item.H6) ?? 0) : parseToNumber(item.H6)
      acc[groupKey].H7 = acc[groupKey].H7 ? acc[groupKey].H7 + (parseToNumber(item.H7) ?? 0) : parseToNumber(item.H7)
      acc[groupKey].H8 = acc[groupKey].H8 ? acc[groupKey].H8 + (parseToNumber(item.H8) ?? 0) : parseToNumber(item.H8)
      acc[groupKey].H9 = acc[groupKey].H9 ? acc[groupKey].H9 + (parseToNumber(item.H9) ?? 0) : parseToNumber(item.H9)
      acc[groupKey].H10 = acc[groupKey].H10 ? acc[groupKey].H10 + (parseToNumber(item.H10) ?? 0) : parseToNumber(item.H10)
      acc[groupKey].H11 = acc[groupKey].H11 ? acc[groupKey].H11 + (parseToNumber(item.H11) ?? 0) : parseToNumber(item.H11)
      acc[groupKey].H12 = acc[groupKey].H12 ? acc[groupKey].H12 + (parseToNumber(item.H12) ?? 0) : parseToNumber(item.H12)
      acc[groupKey].H13 = acc[groupKey].H13 ? acc[groupKey].H13 + (parseToNumber(item.H13) ?? 0) : parseToNumber(item.H13)
      acc[groupKey].H14 = acc[groupKey].H14 ? acc[groupKey].H14 + (parseToNumber(item.H14) ?? 0) : parseToNumber(item.H14)
      acc[groupKey].H15 = acc[groupKey].H15 ? acc[groupKey].H15 + (parseToNumber(item.H15) ?? 0) : parseToNumber(item.H15)
      acc[groupKey].H16 = acc[groupKey].H16 ? acc[groupKey].H16 + (parseToNumber(item.H16) ?? 0) : parseToNumber(item.H16)
      acc[groupKey].H17 = acc[groupKey].H17 ? acc[groupKey].H17 + (parseToNumber(item.H17) ?? 0) : parseToNumber(item.H17)
      acc[groupKey].H18 = acc[groupKey].H18 ? acc[groupKey].H18 + (parseToNumber(item.H18) ?? 0) : parseToNumber(item.H18)
      acc[groupKey].H19 = acc[groupKey].H19 ? acc[groupKey].H19 + (parseToNumber(item.H19) ?? 0) : parseToNumber(item.H19)
      acc[groupKey].H20 = acc[groupKey].H20 ? acc[groupKey].H20 + (parseToNumber(item.H20) ?? 0) : parseToNumber(item.H20)
      acc[groupKey].H21 = acc[groupKey].H21 ? acc[groupKey].H21 + (parseToNumber(item.H21) ?? 0) : parseToNumber(item.H21)
      acc[groupKey].H22 = acc[groupKey].H22 ? acc[groupKey].H22 + (parseToNumber(item.H22) ?? 0) : parseToNumber(item.H22)
      acc[groupKey].H23 = acc[groupKey].H23 ? acc[groupKey].H23 + (parseToNumber(item.H23) ?? 0) : parseToNumber(item.H23)
      acc[groupKey].H24 = acc[groupKey].H24 ? acc[groupKey].H24 + (parseToNumber(item.H24) ?? 0) : parseToNumber(item.H24)

      acc[groupKey].items.push(item)
      return acc
    }, {})

    // total concept .....
    const dTotalConcept = [...conceptalldMMSCFD1, ...conceptalldMMBTUD1].map((e: any) => {
      e['parkUnparkInstructedFlows'] = e['nomination_row_json']?.['data_temp']?.['5'] || null
      e['customerType'] = e['nomination_row_json']?.['data_temp']?.['6'] || null
      e['unix'] = e['unix'] || null
      // e['unix'] = e['nomination_row_json']?.['data_temp']?.['9'] || null;
      e['wi'] = e['nomination_row_json']?.['data_temp']?.['11'] || null
      e['hv'] = e['nomination_row_json']?.['data_temp']?.['12'] || null
      e['sg'] = e['nomination_row_json']?.['data_temp']?.['13'] || null

      return {...e}
    })

    const groupedDTotalConcept = dTotalConcept.reduce((acc: any, item: any) => {
      const groupKey = `${item.area_text || 'null'}_${item.zone_text || 'null'}_${item.nomination_point || 'null'}_${item.entry_exit_id || 'null'}_${item.customerType || 'null'}_${item.unix || 'null'}_${item.parkUnparkInstructedFlows || 'null'}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          area_text: item.area_text,
          zone_text: item.zone_text,
          nomination_point: item && item.nomination_point || "",
          entry_exit_id: item.entry_exit_id,
          customerType: item.customerType,
          unix: item.unix,
          parkUnparkInstructedFlows: item.parkUnparkInstructedFlows,
          wi: null,
          hv: null,
          sg: null,
          total: null,
          totalCap: null,
          utilization: null,
          H1: null,
          H2: null,
          H3: null,
          H4: null,
          H5: null,
          H6: null,
          H7: null,
          H8: null,
          H9: null,
          H10: null,
          H11: null,
          H12: null,
          H13: null,
          H14: null,
          H15: null,
          H16: null,
          H17: null,
          H18: null,
          H19: null,
          H20: null,
          H21: null,
          H22: null,
          H23: null,
          H24: null,
          items: []
        }
      }

      // excel  wi 11 hv 12 sg 13

      const _calc_vi_all =
        (item && item?.arrNom || []).reduce((accIn, currIn) => {
          let resultIn = 0
          if (currIn?.nomination_type_id === 1) {
            // day
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
          } else {
            // week
            const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
            const gasDay = fnDay7(gas_day_text)
            const idx0 = gasDay.indexOf(gas_day_text)
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
          }
          return accIn + resultIn
        }, 0) ?? 0

      const _calc_hv_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let hv_ = 0
            let vi_ = 0
            hv_ = parseToNumber(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (hv_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = hv_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_sg_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let vi_ = 0
            let sg_ = 0
            sg_ = parseToNumber(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (sg_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = sg_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_final_hv = _calc_vi_all === 0 && _calc_hv_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_hv_x_vi_all / _calc_vi_all)
      const _calc_final_sg = _calc_vi_all === 0 && _calc_sg_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_sg_x_vi_all / _calc_vi_all)
      const _calc_final_wi = _calc_hv_x_vi_all / 0.982596 / Math.sqrt(_calc_sg_x_vi_all * _calc_vi_all)

      // ---------

      acc[groupKey].wi = _calc_final_wi
      acc[groupKey].hv = _calc_final_hv
      acc[groupKey].sg = _calc_final_sg

      // -------

      // acc[groupKey].wi = acc[groupKey].wi
      //   ? acc[groupKey].wi + (parseToNumber(item.wi) ?? 0)
      //   : parseToNumber(item.wi);
      // acc[groupKey].hv = acc[groupKey].hv
      //   ? acc[groupKey].hv + (parseToNumber(item.hv) ?? 0)
      //   : parseToNumber(item.hv);
      // acc[groupKey].sg = acc[groupKey].sg
      //   ? acc[groupKey].sg + (parseToNumber(item.sg) ?? 0)
      //   : parseToNumber(item.sg);
      acc[groupKey].total = acc[groupKey].total ? acc[groupKey].total + (parseToNumber(item.total) ?? 0) : parseToNumber(item.total)
      acc[groupKey].totalCap = acc[groupKey].totalCap ? acc[groupKey].totalCap + (parseToNumber(item.totalCap) ?? 0) : parseToNumber(item.totalCap)
      acc[groupKey].utilization = acc[groupKey].utilization ? acc[groupKey].utilization + (parseToNumber(item.utilization) ?? 0) : parseToNumber(item.utilization)
      acc[groupKey].H1 = acc[groupKey].H1 ? acc[groupKey].H1 + (parseToNumber(item.H1) ?? 0) : parseToNumber(item.H1)
      acc[groupKey].H2 = acc[groupKey].H2 ? acc[groupKey].H2 + (parseToNumber(item.H2) ?? 0) : parseToNumber(item.H2)
      acc[groupKey].H3 = acc[groupKey].H3 ? acc[groupKey].H3 + (parseToNumber(item.H3) ?? 0) : parseToNumber(item.H3)
      acc[groupKey].H4 = acc[groupKey].H4 ? acc[groupKey].H4 + (parseToNumber(item.H4) ?? 0) : parseToNumber(item.H4)
      acc[groupKey].H5 = acc[groupKey].H5 ? acc[groupKey].H5 + (parseToNumber(item.H5) ?? 0) : parseToNumber(item.H5)
      acc[groupKey].H6 = acc[groupKey].H6 ? acc[groupKey].H6 + (parseToNumber(item.H6) ?? 0) : parseToNumber(item.H6)
      acc[groupKey].H7 = acc[groupKey].H7 ? acc[groupKey].H7 + (parseToNumber(item.H7) ?? 0) : parseToNumber(item.H7)
      acc[groupKey].H8 = acc[groupKey].H8 ? acc[groupKey].H8 + (parseToNumber(item.H8) ?? 0) : parseToNumber(item.H8)
      acc[groupKey].H9 = acc[groupKey].H9 ? acc[groupKey].H9 + (parseToNumber(item.H9) ?? 0) : parseToNumber(item.H9)
      acc[groupKey].H10 = acc[groupKey].H10 ? acc[groupKey].H10 + (parseToNumber(item.H10) ?? 0) : parseToNumber(item.H10)
      acc[groupKey].H11 = acc[groupKey].H11 ? acc[groupKey].H11 + (parseToNumber(item.H11) ?? 0) : parseToNumber(item.H11)
      acc[groupKey].H12 = acc[groupKey].H12 ? acc[groupKey].H12 + (parseToNumber(item.H12) ?? 0) : parseToNumber(item.H12)
      acc[groupKey].H13 = acc[groupKey].H13 ? acc[groupKey].H13 + (parseToNumber(item.H13) ?? 0) : parseToNumber(item.H13)
      acc[groupKey].H14 = acc[groupKey].H14 ? acc[groupKey].H14 + (parseToNumber(item.H14) ?? 0) : parseToNumber(item.H14)
      acc[groupKey].H15 = acc[groupKey].H15 ? acc[groupKey].H15 + (parseToNumber(item.H15) ?? 0) : parseToNumber(item.H15)
      acc[groupKey].H16 = acc[groupKey].H16 ? acc[groupKey].H16 + (parseToNumber(item.H16) ?? 0) : parseToNumber(item.H16)
      acc[groupKey].H17 = acc[groupKey].H17 ? acc[groupKey].H17 + (parseToNumber(item.H17) ?? 0) : parseToNumber(item.H17)
      acc[groupKey].H18 = acc[groupKey].H18 ? acc[groupKey].H18 + (parseToNumber(item.H18) ?? 0) : parseToNumber(item.H18)
      acc[groupKey].H19 = acc[groupKey].H19 ? acc[groupKey].H19 + (parseToNumber(item.H19) ?? 0) : parseToNumber(item.H19)
      acc[groupKey].H20 = acc[groupKey].H20 ? acc[groupKey].H20 + (parseToNumber(item.H20) ?? 0) : parseToNumber(item.H20)
      acc[groupKey].H21 = acc[groupKey].H21 ? acc[groupKey].H21 + (parseToNumber(item.H21) ?? 0) : parseToNumber(item.H21)
      acc[groupKey].H22 = acc[groupKey].H22 ? acc[groupKey].H22 + (parseToNumber(item.H22) ?? 0) : parseToNumber(item.H22)
      acc[groupKey].H23 = acc[groupKey].H23 ? acc[groupKey].H23 + (parseToNumber(item.H23) ?? 0) : parseToNumber(item.H23)
      acc[groupKey].H24 = acc[groupKey].H24 ? acc[groupKey].H24 + (parseToNumber(item.H24) ?? 0) : parseToNumber(item.H24)

      acc[groupKey].items.push(item)
      return acc
    }, {})

    const groupedDTotalArray_ = Object.values({
      ...groupedDTotalParkUnparkMin_,
      ...groupedDTotalConcept
    })

    const dMMSCFD_tabnom_exit = (dMMSCFD_tabnom || [])?.map((e: any) => {
      const {utilization: utilization_, total: total_, totalCap: totalCap_, arrNom, wi, hv, sg, entry_exit_id, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...nE} = e
      let hourDay = {
        H1,
        H2,
        H3,
        H4,
        H5,
        H6,
        H7,
        H8,
        H9,
        H10,
        H11,
        H12,
        H13,
        H14,
        H15,
        H16,
        H17,
        H18,
        H19,
        H20,
        H21,
        H22,
        H23,
        H24
      }
      let total = total_
      let totalCap = totalCap_
      let utilization = utilization_
      let hv_ = hv
      if (entry_exit_id === 2) {
        let supplyRef = this.fnsupplyRef_(e?.area_text, areaData)
        let filDayWFormEva =
          eva?.newDaily
            ?.filter((f: any) => f?.parameter === 'HV')
            ?.filter((f: any) => f?.gasday === e?.gas_day_text)
            ?.filter((f: any) => f?.zone?.name === supplyRef?.supply_reference_quality_area_by?.zone?.name)
            ?.filter((f: any) => f?.area?.name === supplyRef?.supply_reference_quality_area_by?.name)?.[0] || null
        hv_ = filDayWFormEva?.valueBtuScf || 0
        const {hourDay: hourDay_n, total: total_n, totalCap: totalCap_n, utilization: utilization_n} = this.fnDayExitMMSCFNewCalc(hv_, arrNom, nomData, e?.nomination_point)
        hourDay = hourDay_n
        total = total_n
        totalCap = totalCap_n
        utilization = utilization_n
      }
      return {
        hv: hv_,
        utilization,
        total,
        totalCap,
        arrNom,
        wi,
        sg,
        entry_exit_id,
        ...hourDay,
        ...nE
      }
    })

    const groupedDTotalArray = [...dMMBTUD, ...(dMMSCFD_tabnom_exit?.filter((f: any) => f?.entry_exit_id === 1 && f?.unix === 'MMSCFD') || []), ...groupedDTotalArray_]?.map((e: any) => {
      return {
        ...e,
        units: e?.unix
      }
    })

    const wTotal = [...wMMSCFD, ...wMMBTUD].map((e: any) => {
      e['parkUnparkInstructedFlows'] = e?.['nomination_row_json']?.['data_temp']?.['5'] || null
      e['customerType'] = e?.['nomination_row_json']?.['data_temp']?.['6'] || null
      e['unix'] = e['unix'] || null
      // e['unix'] = e?.['nomination_row_json']?.['data_temp']?.['9'] || null;
      e['wi'] = e?.['nomination_row_json']?.['data_temp']?.['11'] || null
      e['hv'] = e?.['nomination_row_json']?.['data_temp']?.['12'] || null
      e['sg'] = e?.['nomination_row_json']?.['data_temp']?.['13'] || null

      return {...e}
    })

    const groupedWTotal_ = wTotal.reduce((acc: any, item: any) => {
      const groupKey = `${item.area_text || 'null'}_${item.zone_text || 'null'}_${item.nomination_point || 'null'}_${item.entry_exit_id || 'null'}_${item.customerType || 'null'}_${item.unix || 'null'}_${item.parkUnparkInstructedFlows || 'null'}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          area_text: item.area_text,
          zone_text: item.zone_text,
          nomination_point: item && item.nomination_point || "",
          entry_exit_id: item.entry_exit_id,
          customerType: item.customerType,
          unix: item.unix,
          parkUnparkInstructedFlows: item.parkUnparkInstructedFlows,
          wi: null,
          hv: null,
          sg: null,
          monday: null,
          monday_utilization: null,
          tuesday: null,
          tuesday_utilization: null,
          wednesday: null,
          wednesday_utilization: null,
          thursday: null,
          thursday_utilization: null,
          friday: null,
          friday_utilization: null,
          saturday: null,
          saturday_utilization: null,
          sunday: null,
          sunday_utilization: null,
          items: []
        }
      }

      const _calc_vi_all =
        (item && item?.arrNom || []).reduce((accIn, currIn) => {
          let resultIn = 0
          if (currIn?.nomination_type_id === 1) {
            // day
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
          } else {
            // week
            const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
            const gasDay = fnDay7(gas_day_text)
            const idx0 = gasDay.indexOf(gas_day_text)
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
          }
          return accIn + resultIn
        }, 0) ?? 0

      const _calc_hv_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let hv_ = 0
            let vi_ = 0
            hv_ = parseToNumber(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (hv_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = hv_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_sg_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let vi_ = 0
            let sg_ = 0
            sg_ = parseToNumber(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (sg_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = sg_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_final_hv = _calc_vi_all === 0 && _calc_hv_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_hv_x_vi_all / _calc_vi_all)
      const _calc_final_sg = _calc_vi_all === 0 && _calc_sg_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_sg_x_vi_all / _calc_vi_all)
      const _calc_final_wi = _calc_hv_x_vi_all / 0.982596 / Math.sqrt(_calc_sg_x_vi_all * _calc_vi_all)

      // ---------

      acc[groupKey].wi = _calc_final_wi
      acc[groupKey].hv = _calc_final_hv
      acc[groupKey].sg = _calc_final_sg

      // -------

      // acc[groupKey].wi = acc[groupKey].wi
      //   ? acc[groupKey].wi + (parseToNumber(item.wi) ?? 0)
      //   : parseToNumber(item.wi);
      // acc[groupKey].hv = acc[groupKey].hv
      //   ? acc[groupKey].hv + (parseToNumber(item.hv) ?? 0)
      //   : parseToNumber(item.hv);
      // acc[groupKey].sg = acc[groupKey].sg
      //   ? acc[groupKey].sg + (parseToNumber(item.sg) ?? 0)
      //   : parseToNumber(item.sg);
      acc[groupKey].monday = acc[groupKey].monday ? acc[groupKey].monday + (parseToNumber(item.monday) ?? 0) : parseToNumber(item.monday)
      acc[groupKey].monday_utilization = acc[groupKey].monday_utilization ? acc[groupKey].monday_utilization + (parseToNumber(item.monday_utilization) ?? 0) : parseToNumber(item.monday_utilization)
      acc[groupKey].tuesday = acc[groupKey].tuesday ? acc[groupKey].tuesday + (parseToNumber(item.tuesday) ?? 0) : parseToNumber(item.tuesday)
      acc[groupKey].tuesday_utilization = acc[groupKey].tuesday_utilization ? acc[groupKey].tuesday_utilization + (parseToNumber(item.tuesday_utilization) ?? 0) : parseToNumber(item.tuesday_utilization)
      acc[groupKey].wednesday = acc[groupKey].wednesday ? acc[groupKey].wednesday + (parseToNumber(item.wednesday) ?? 0) : parseToNumber(item.wednesday)
      acc[groupKey].wednesday_utilization = acc[groupKey].wednesday_utilization ? acc[groupKey].wednesday_utilization + (parseToNumber(item.wednesday_utilization) ?? 0) : parseToNumber(item.wednesday_utilization)
      acc[groupKey].thursday = acc[groupKey].thursday ? acc[groupKey].thursday + (parseToNumber(item.thursday) ?? 0) : parseToNumber(item.thursday)
      acc[groupKey].thursday_utilization = acc[groupKey].thursday_utilization ? acc[groupKey].thursday_utilization + (parseToNumber(item.thursday_utilization) ?? 0) : parseToNumber(item.thursday_utilization)
      acc[groupKey].friday = acc[groupKey].friday ? acc[groupKey].friday + (parseToNumber(item.friday) ?? 0) : parseToNumber(item.friday)
      acc[groupKey].friday_utilization = acc[groupKey].friday_utilization ? acc[groupKey].friday_utilization + (parseToNumber(item.friday_utilization) ?? 0) : parseToNumber(item.friday_utilization)
      acc[groupKey].saturday = acc[groupKey].saturday ? acc[groupKey].saturday + (parseToNumber(item.saturday) ?? 0) : parseToNumber(item.saturday)
      acc[groupKey].saturday_utilization = acc[groupKey].saturday_utilization ? acc[groupKey].saturday_utilization + (parseToNumber(item.saturday_utilization) ?? 0) : parseToNumber(item.saturday_utilization)
      acc[groupKey].sunday = acc[groupKey].sunday ? acc[groupKey].sunday + (parseToNumber(item.sunday) ?? 0) : parseToNumber(item.sunday)
      acc[groupKey].sunday_utilization = acc[groupKey].sunday_utilization ? acc[groupKey].sunday_utilization + (parseToNumber(item.sunday_utilization) ?? 0) : parseToNumber(item.sunday_utilization)

      acc[groupKey].items.push(item)
      return acc
    }, {})
    const groupedWTotal_n = Object.values({
      ...groupedWTotal_
    })
    const groupedWTotal = groupedWTotal_n?.map((e: any) => {
      const {
        utilization: utilization_,
        total: total_,
        totalCap: totalCap_,
        arrNom,
        wi,
        hv,
        sg,
        entry_exit_id,

        sunday,
        sunday_utilization,
        monday,
        monday_utilization,
        tuesday,
        tuesday_utilization,
        wednesday,
        wednesday_utilization,
        thursday,
        thursday_utilization,
        friday,
        friday_utilization,
        saturday,
        saturday_utilization,

        ...nE
      } = e

      let dayWeek = {
        sunday: sunday,
        sunday_utilization: sunday_utilization,
        monday: monday,
        monday_utilization: monday_utilization,
        tuesday: tuesday,
        tuesday_utilization: tuesday_utilization,
        wednesday: wednesday,
        wednesday_utilization: wednesday_utilization,
        thursday: thursday,
        thursday_utilization: thursday_utilization,
        friday: friday,
        friday_utilization: friday_utilization,
        saturday: saturday,
        saturday_utilization: saturday_utilization
      }

      let total = total_
      let totalCap = totalCap_
      let hv_ = hv
      if (entry_exit_id === 2) {
        const supplyRef = areaData?.find((f: any) => {
          return f?.name === e?.area_text
        })
        let filDayWFormEva =
          eva?.newWeekly
            ?.filter((f: any) => f?.parameter === 'HV')
            ?.filter((f: any) => f?.gasday === e?.gas_day_text)
            ?.filter((f: any) => f?.zone?.name === supplyRef?.supply_reference_quality_area_by?.zone?.name)
            ?.filter((f: any) => f?.area?.name === supplyRef?.supply_reference_quality_area_by?.name)?.[0] || null

        const findHvsundayHv = filDayWFormEva?.sunday?.value || 0
        const findHvmondayHv = filDayWFormEva?.monday?.value || 0
        const findHvtuesdayHv = filDayWFormEva?.tuesday?.value || 0
        const findHvwednesdayHv = filDayWFormEva?.wednesday?.value || 0
        const findHvthursdayHv = filDayWFormEva?.thursday?.value || 0
        const findHvfridayHv = filDayWFormEva?.friday?.value || 0
        const findHvsaturdayHv = filDayWFormEva?.saturday?.value || 0

        const nomPoint = nomData?.find((f: any) => {
          return f?.nomination_point === e['nomination_point']
        })

        const calcMMBTUDtoMMSCFD = (key: any, hv: any) => {
          let calcFD = parseToNumber(e['nomination_row_json']?.['data_temp']?.[key]) / 24 / hv || 0
          return calcFD
        }

        const calcWeek = (cap: any, maximum_capacity: any, cHv: any) => {
          if (Number.isFinite((Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100)) {
            return (Number(cap ?? 0) / (Number(maximum_capacity ?? 0) * Number(cHv ?? 0))) * 100
          } else {
            return 0
          }
        }

        const calcWeekTotal = (week_: any) => {
          let r_week_ = (dayWeek?.sunday ?? 0) + (dayWeek?.monday ?? 0) + (dayWeek?.tuesday ?? 0) + (dayWeek?.wednesday ?? 0) + (dayWeek?.thursday ?? 0) + (dayWeek?.friday ?? 0) + (dayWeek?.saturday ?? 0)
          return r_week_
        }

        dayWeek = {
          sunday: calcMMBTUDtoMMSCFD('14', findHvsundayHv),
          sunday_utilization: calcWeek(calcMMBTUDtoMMSCFD('14', findHvsundayHv), nomPoint?.maximum_capacity, findHvsundayHv),
          monday: calcMMBTUDtoMMSCFD('15', findHvmondayHv),
          monday_utilization: calcWeek(calcMMBTUDtoMMSCFD('15', findHvmondayHv), nomPoint?.maximum_capacity, findHvmondayHv),
          tuesday: calcMMBTUDtoMMSCFD('16', findHvtuesdayHv),
          tuesday_utilization: calcWeek(calcMMBTUDtoMMSCFD('16', findHvtuesdayHv), nomPoint?.maximum_capacity, findHvtuesdayHv),
          wednesday: calcMMBTUDtoMMSCFD('17', findHvwednesdayHv),
          wednesday_utilization: calcWeek(calcMMBTUDtoMMSCFD('17', findHvwednesdayHv), nomPoint?.maximum_capacity, findHvwednesdayHv),
          thursday: calcMMBTUDtoMMSCFD('18', findHvthursdayHv),
          thursday_utilization: calcWeek(calcMMBTUDtoMMSCFD('18', findHvthursdayHv), nomPoint?.maximum_capacity, findHvthursdayHv),
          friday: calcMMBTUDtoMMSCFD('19', findHvfridayHv),
          friday_utilization: calcWeek(calcMMBTUDtoMMSCFD('19', findHvfridayHv), nomPoint?.maximum_capacity, findHvfridayHv),
          saturday: calcMMBTUDtoMMSCFD('20', findHvsaturdayHv),
          saturday_utilization: calcWeek(calcMMBTUDtoMMSCFD('20', findHvsaturdayHv), nomPoint?.maximum_capacity, findHvsaturdayHv)
        }

        total = calcWeekTotal(dayWeek)
        totalCap = calcWeekTotal(dayWeek)
      }

      return {
        hv: hv_,
        total,
        totalCap,
        arrNom,
        wi,
        sg,
        entry_exit_id,
        ...dayWeek,
        ...nE
      }
    })

    const wTotalParkUnparkMin_ = [...puallwMMSCFD, ...puallwMMBTUD].map((e: any) => {
      e['parkUnparkInstructedFlows'] = e?.['nomination_row_json']?.['data_temp']?.['5'] || null
      e['customerType'] = e?.['nomination_row_json']?.['data_temp']?.['6'] || null
      e['unix'] = e['unix'] || null
      // e['unix'] = e?.['nomination_row_json']?.['data_temp']?.['9'] || null;
      e['wi'] = e?.['nomination_row_json']?.['data_temp']?.['11'] || null
      e['hv'] = e?.['nomination_row_json']?.['data_temp']?.['12'] || null
      e['sg'] = e?.['nomination_row_json']?.['data_temp']?.['13'] || null

      return {...e}
    })

    const groupedWTotalParkUnparkMin_ = wTotalParkUnparkMin_.reduce((acc: any, item: any) => {
      const groupKey = `${item.area_text || 'null'}_${item.zone_text || 'null'}_${item.nomination_point || 'null'}_${item.entry_exit_id || 'null'}_${item.customerType || 'null'}_${item.unix || 'null'}_${item.parkUnparkInstructedFlows || 'null'}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          area_text: item.area_text,
          zone_text: item.zone_text,
          nomination_point: item && item.nomination_point || "",
          entry_exit_id: item.entry_exit_id,
          customerType: item.customerType,
          unix: item.unix,
          parkUnparkInstructedFlows: item.parkUnparkInstructedFlows,
          wi: null,
          hv: null,
          sg: null,
          monday: null,
          monday_utilization: null,
          tuesday: null,
          tuesday_utilization: null,
          wednesday: null,
          wednesday_utilization: null,
          thursday: null,
          thursday_utilization: null,
          friday: null,
          friday_utilization: null,
          saturday: null,
          saturday_utilization: null,
          sunday: null,
          sunday_utilization: null,
          items: []
        }
      }

      const _calc_vi_all =
        (item && item?.arrNom || []).reduce((accIn, currIn) => {
          let resultIn = 0
          if (currIn?.nomination_type_id === 1) {
            // day
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
          } else {
            // week
            const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
            const gasDay = fnDay7(gas_day_text)
            const idx0 = gasDay.indexOf(gas_day_text)
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
          }
          return accIn + resultIn
        }, 0) ?? 0

      const _calc_hv_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let hv_ = 0
            let vi_ = 0
            hv_ = parseToNumber(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (hv_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = hv_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_sg_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let vi_ = 0
            let sg_ = 0
            sg_ = parseToNumber(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (sg_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = sg_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_final_hv = _calc_vi_all === 0 && _calc_hv_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_hv_x_vi_all / _calc_vi_all)
      const _calc_final_sg = _calc_vi_all === 0 && _calc_sg_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_sg_x_vi_all / _calc_vi_all)
      const _calc_final_wi = _calc_hv_x_vi_all / 0.982596 / Math.sqrt(_calc_sg_x_vi_all * _calc_vi_all)

      // ---------

      acc[groupKey].wi = _calc_final_wi
      acc[groupKey].hv = _calc_final_hv
      acc[groupKey].sg = _calc_final_sg

      // -------

      // acc[groupKey].wi = acc[groupKey].wi
      //   ? acc[groupKey].wi + (parseToNumber(item.wi) ?? 0)
      //   : parseToNumber(item.wi);
      // acc[groupKey].hv = acc[groupKey].hv
      //   ? acc[groupKey].hv + (parseToNumber(item.hv) ?? 0)
      //   : parseToNumber(item.hv);
      // acc[groupKey].sg = acc[groupKey].sg
      //   ? acc[groupKey].sg + (parseToNumber(item.sg) ?? 0)
      //   : parseToNumber(item.sg);
      acc[groupKey].monday = acc[groupKey].monday ? (acc[groupKey].monday || 0) + (parseToNumber(item.monday) ?? 0) : parseToNumber(item.monday)
      acc[groupKey].monday_utilization = acc[groupKey].monday_utilization ? acc[groupKey].monday_utilization + (parseToNumber(item.monday_utilization) ?? 0) : parseToNumber(item.monday_utilization)
      acc[groupKey].tuesday = acc[groupKey].tuesday ? acc[groupKey].tuesday + (parseToNumber(item.tuesday) ?? 0) : parseToNumber(item.tuesday)
      acc[groupKey].tuesday_utilization = acc[groupKey].tuesday_utilization ? acc[groupKey].tuesday_utilization + (parseToNumber(item.tuesday_utilization) ?? 0) : parseToNumber(item.tuesday_utilization)
      acc[groupKey].wednesday = acc[groupKey].wednesday ? acc[groupKey].wednesday + (parseToNumber(item.wednesday) ?? 0) : parseToNumber(item.wednesday)
      acc[groupKey].wednesday_utilization = acc[groupKey].wednesday_utilization ? acc[groupKey].wednesday_utilization + (parseToNumber(item.wednesday_utilization) ?? 0) : parseToNumber(item.wednesday_utilization)
      acc[groupKey].thursday = acc[groupKey].thursday ? acc[groupKey].thursday + (parseToNumber(item.thursday) ?? 0) : parseToNumber(item.thursday)
      acc[groupKey].thursday_utilization = acc[groupKey].thursday_utilization ? acc[groupKey].thursday_utilization + (parseToNumber(item.thursday_utilization) ?? 0) : parseToNumber(item.thursday_utilization)
      acc[groupKey].friday = acc[groupKey].friday ? acc[groupKey].friday + (parseToNumber(item.friday) ?? 0) : parseToNumber(item.friday)
      acc[groupKey].friday_utilization = acc[groupKey].friday_utilization ? acc[groupKey].friday_utilization + (parseToNumber(item.friday_utilization) ?? 0) : parseToNumber(item.friday_utilization)
      acc[groupKey].saturday = acc[groupKey].saturday ? acc[groupKey].saturday + (parseToNumber(item.saturday) ?? 0) : parseToNumber(item.saturday)
      acc[groupKey].saturday_utilization = acc[groupKey].saturday_utilization ? acc[groupKey].saturday_utilization + (parseToNumber(item.saturday_utilization) ?? 0) : parseToNumber(item.saturday_utilization)
      acc[groupKey].sunday = acc[groupKey].sunday ? (acc[groupKey].sunday || 0) + (parseToNumber(item.sunday) ?? 0) : parseToNumber(item.sunday)
      acc[groupKey].sunday_utilization = acc[groupKey].sunday_utilization ? (acc[groupKey].sunday_utilization || 0) + (parseToNumber(item.sunday_utilization) ?? 0) : parseToNumber(item.sunday_utilization)

      acc[groupKey].items.push(item)
      return acc
    }, {})

    const wTotalConcept = [...conceptallwMMSCFD1, ...conceptallwMMBTUD1].map((e: any) => {
      e['parkUnparkInstructedFlows'] = e?.['nomination_row_json']?.['data_temp']?.['5'] || null
      e['customerType'] = e?.['nomination_row_json']?.['data_temp']?.['6'] || null
      e['unix'] = e['unix'] || null
      // e['unix'] = e?.['nomination_row_json']?.['data_temp']?.['9'] || null;
      e['wi'] = e?.['nomination_row_json']?.['data_temp']?.['11'] || null
      e['hv'] = e?.['nomination_row_json']?.['data_temp']?.['12'] || null
      e['sg'] = e?.['nomination_row_json']?.['data_temp']?.['13'] || null

      return {...e}
    })

    const groupedWTotalConcept = wTotalConcept.reduce((acc: any, item: any) => {
      const groupKey = `${item.area_text || 'null'}_${item.zone_text || 'null'}_${item.nomination_point || 'null'}_${item.entry_exit_id || 'null'}_${item.customerType || 'null'}_${item.unix || 'null'}_${item.parkUnparkInstructedFlows || 'null'}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          area_text: item.area_text,
          zone_text: item.zone_text,
          nomination_point: item && item.nomination_point || "",
          entry_exit_id: item.entry_exit_id,
          customerType: item.customerType,
          unix: item.unix,
          parkUnparkInstructedFlows: item.parkUnparkInstructedFlows,
          wi: null,
          hv: null,
          sg: null,
          monday: null,
          monday_utilization: null,
          tuesday: null,
          tuesday_utilization: null,
          wednesday: null,
          wednesday_utilization: null,
          thursday: null,
          thursday_utilization: null,
          friday: null,
          friday_utilization: null,
          saturday: null,
          saturday_utilization: null,
          sunday: null,
          sunday_utilization: null,
          items: []
        }
      }

      const _calc_vi_all =
        (item && item?.arrNom || []).reduce((accIn, currIn) => {
          let resultIn = 0
          if (currIn?.nomination_type_id === 1) {
            // day
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
          } else {
            // week
            const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
            const gasDay = fnDay7(gas_day_text)
            const idx0 = gasDay.indexOf(gas_day_text)
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
          }
          return accIn + resultIn
        }, 0) ?? 0

      const _calc_hv_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let hv_ = 0
            let vi_ = 0
            hv_ = parseToNumber(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (hv_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = hv_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_sg_x_vi_all =
        this.normalizeNumber(
          (item && item?.arrNom || []).reduce((accIn, currIn) => {
            let resultIn = 0
            let vi_ = 0
            let sg_ = 0
            sg_ = parseToNumber(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
            if (currIn?.nomination_type_id === 1) {
              // day
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
            } else {
              // week
              const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
              const gasDay = fnDay7(gas_day_text)
              const idx0 = gasDay.indexOf(gas_day_text)
              vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
            }
            if (sg_ === 0 && vi_ === 0) {
              resultIn = 0
            } else {
              resultIn = sg_ * vi_
            }

            return accIn + resultIn
          }, 0)
        ) ?? 0

      const _calc_final_hv = _calc_vi_all === 0 && _calc_hv_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_hv_x_vi_all / _calc_vi_all)
      const _calc_final_sg = _calc_vi_all === 0 && _calc_sg_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_sg_x_vi_all / _calc_vi_all)
      const _calc_final_wi = _calc_hv_x_vi_all / 0.982596 / Math.sqrt(_calc_sg_x_vi_all * _calc_vi_all)

      // ---------

      acc[groupKey].wi = _calc_final_wi
      acc[groupKey].hv = _calc_final_hv
      acc[groupKey].sg = _calc_final_sg

      // -------

      acc[groupKey].monday = this.roundTo3(acc[groupKey].monday ? acc[groupKey].monday + (parseToNumber(item.monday) ?? 0) : parseToNumber(item.monday))
      acc[groupKey].monday_utilization = acc[groupKey].monday_utilization ? acc[groupKey].monday_utilization + (parseToNumber(item.monday_utilization) ?? 0) : parseToNumber(item.monday_utilization)
      acc[groupKey].tuesday = this.roundTo3(acc[groupKey].tuesday ? acc[groupKey].tuesday + (parseToNumber(item.tuesday) ?? 0) : parseToNumber(item.tuesday))
      acc[groupKey].tuesday_utilization = acc[groupKey].tuesday_utilization ? acc[groupKey].tuesday_utilization + (parseToNumber(item.tuesday_utilization) ?? 0) : parseToNumber(item.tuesday_utilization)
      acc[groupKey].wednesday = this.roundTo3(acc[groupKey].wednesday ? acc[groupKey].wednesday + (parseToNumber(item.wednesday) ?? 0) : parseToNumber(item.wednesday))
      acc[groupKey].wednesday_utilization = acc[groupKey].wednesday_utilization ? acc[groupKey].wednesday_utilization + (parseToNumber(item.wednesday_utilization) ?? 0) : parseToNumber(item.wednesday_utilization)
      acc[groupKey].thursday = this.roundTo3(acc[groupKey].thursday ? acc[groupKey].thursday + (parseToNumber(item.thursday) ?? 0) : parseToNumber(item.thursday))
      acc[groupKey].thursday_utilization = acc[groupKey].thursday_utilization ? acc[groupKey].thursday_utilization + (parseToNumber(item.thursday_utilization) ?? 0) : parseToNumber(item.thursday_utilization)
      acc[groupKey].friday = this.roundTo3(acc[groupKey].friday ? acc[groupKey].friday + (parseToNumber(item.friday) ?? 0) : parseToNumber(item.friday))
      acc[groupKey].friday_utilization = acc[groupKey].friday_utilization ? acc[groupKey].friday_utilization + (parseToNumber(item.friday_utilization) ?? 0) : parseToNumber(item.friday_utilization)
      acc[groupKey].saturday = this.roundTo3(acc[groupKey].saturday ? acc[groupKey].saturday + (parseToNumber(item.saturday) ?? 0) : parseToNumber(item.saturday))
      acc[groupKey].saturday_utilization = acc[groupKey].saturday_utilization ? acc[groupKey].saturday_utilization + (parseToNumber(item.saturday_utilization) ?? 0) : parseToNumber(item.saturday_utilization)
      acc[groupKey].sunday = this.roundTo3(acc[groupKey].sunday ? acc[groupKey].sunday + (parseToNumber(item.sunday) ?? 0) : parseToNumber(item.sunday))
      acc[groupKey].sunday_utilization = acc[groupKey].sunday_utilization ? acc[groupKey].sunday_utilization + (parseToNumber(item.sunday_utilization) ?? 0) : parseToNumber(item.sunday_utilization)

      acc[groupKey].items.push(item)
      return acc
    }, {})

    const groupedWTotalArray_ = Object.values({
      ...groupedWTotalParkUnparkMin_,
      ...groupedWTotalConcept
    })

    const sumFixed6 = (obj: any, keys: string[]) => {
      const totalInt = keys.reduce((sum, key) => {
        return sum + toFixedInt(obj?.[key] ?? 0, 6)
      }, 0)

      return fromFixedInt(totalInt, 6)
    }

   

    const wMMSCFD_tabnom_exit =
      tab === 'weekly'
        ? wMMSCFD_tabnom_?.map((e: any) => {
            if (e?.entry_exit_id === 1) {
              return e
            } else {
              const dayWeek = {
                sunday_utilization: this.roundTo2((e?.sunday / e?.nomPoint_maximum_capacity) * 100),
                monday_utilization: this.roundTo2((e?.monday / e?.nomPoint_maximum_capacity) * 100),
                tuesday_utilization: this.roundTo2((e?.tuesday / e?.nomPoint_maximum_capacity) * 100),
                wednesday_utilization: this.roundTo2((e?.wednesday / e?.nomPoint_maximum_capacity) * 100),
                thursday_utilization: this.roundTo2((e?.thursday / e?.nomPoint_maximum_capacity) * 100),
                friday_utilization: this.roundTo2((e?.friday / e?.nomPoint_maximum_capacity) * 100),
                saturday_utilization: this.roundTo2((e?.saturday / e?.nomPoint_maximum_capacity) * 100)
              }

              return {
                ...e,
                ...dayWeek
              }
            }
          })
        : wMMSCFD_tabnom_

   

        console.timeEnd('sum G6')
   
    console.time('sum G7')

    const resultallwMMSCFD_ = fnWtoDPointContract(dallwMMSCFD, dMMSCFD)
    const resultallwMMSCFD: any = fnGroupByKeysFinal(resultallwMMSCFD_, horuss)
          
    const resultallwMMSCFD_tabnom_ = fnWtoDPointContract(dallwMMSCFD_tabnom, dMMSCFD_tabnom)

    const resultallwMMSCFD_tabnom: any = fnGroupByKeysFinal(resultallwMMSCFD_tabnom_, horuss)

    const resultallwMMSCFDOnce: any = fnGroupByKeysALLFinal(resultallwMMSCFD_tabnom, horuss)

    const fDWaMMSCFDcalc = [...dMMSCFD, ...resultallwMMSCFD]
    const fDWaMMSCFDcalcOnce = [...dMMSCFD_tabnom, ...resultallwMMSCFDOnce]
    
    
    let fDWallMMSCFDOnce = [...fDWaMMSCFDcalcOnce?.filter((f: any) => f?.nomination_type_id === 1)]
    let fDWaMMSCFDWOnce = [...fDWaMMSCFDcalcOnce?.filter((f: any) => f?.nomination_type_id === 2)]
    
   

    let addfDWaMMSCFDWOnce = []
    // this.roundTo3
    if (fDWallMMSCFDOnce.length > 0) {
      fDWaMMSCFDWOnce?.map((e: any) => {
        const findW = fDWallMMSCFDOnce?.find((f: any) => {
          return f?.gas_day_text === e?.gas_day_text && f?.nomination_point === e?.nomination_point
        })
        if (findW) {
          const {arrContractId, arrNom, total, totalCap, utilization, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...newE} = e
          const nData = {
            ...findW,
            arrContractId: [...arrContractId, ...findW?.arrContractId],
            arrNom: [...arrNom, ...findW?.arrNom],
            total: this.roundTo6(total ? parseToNumber(total) : 0) + (findW?.total ? parseToNumber(findW.total) : 0),
            totalCap: this.roundTo6(totalCap ? parseToNumber(totalCap) : 0) + (findW?.totalCap ? parseToNumber(findW.totalCap) : 0),
            utilization: parseToNumber((utilization ? parseToNumber(utilization) : 0) + (findW?.utilization ? parseToNumber(findW.utilization) : 0)) ?? 0, // x ต้องคำนวนใหม่
            // this.normalizeNumber_
            H1: this.roundTo6(parseToNumber(H1) + (parseToNumber(findW?.H1) ? parseToNumber(findW.H1) : 0)),
            H2: this.roundTo6(parseToNumber(H2) + (parseToNumber(findW?.H2) ? parseToNumber(findW.H2) : 0)),
            H3: this.roundTo6(parseToNumber(H3) + (parseToNumber(findW?.H3) ? parseToNumber(findW.H3) : 0)),
            H4: this.roundTo6(parseToNumber(H4) + (parseToNumber(findW?.H4) ? parseToNumber(findW.H4) : 0)),
            H5: this.roundTo6(parseToNumber(H5) + (parseToNumber(findW?.H5) ? parseToNumber(findW.H5) : 0)),
            H6: this.roundTo6(parseToNumber(H6) + (parseToNumber(findW?.H6) ? parseToNumber(findW.H6) : 0)),
            H7: this.roundTo6(parseToNumber(H7) + (parseToNumber(findW?.H7) ? parseToNumber(findW.H7) : 0)),
            H8: this.roundTo6(parseToNumber(H8) + (parseToNumber(findW?.H8) ? parseToNumber(findW.H8) : 0)),
            H9: this.roundTo6(parseToNumber(H9) + (parseToNumber(findW?.H9) ? parseToNumber(findW.H9) : 0)),
            H10: this.roundTo6(parseToNumber(H10) + (parseToNumber(findW?.H10) ? parseToNumber(findW.H10) : 0)),
            H11: this.roundTo6(parseToNumber(H11) + (parseToNumber(findW?.H11) ? parseToNumber(findW.H11) : 0)),
            H12: this.roundTo6(parseToNumber(H12) + (parseToNumber(findW?.H12) ? parseToNumber(findW.H12) : 0)),
            H13: this.roundTo6(parseToNumber(H13) + (parseToNumber(findW?.H13) ? parseToNumber(findW.H13) : 0)),
            H14: this.roundTo6(parseToNumber(H14) + (parseToNumber(findW?.H14) ? parseToNumber(findW.H14) : 0)),
            H15: this.roundTo6(parseToNumber(H15) + (parseToNumber(findW?.H15) ? parseToNumber(findW.H15) : 0)),
            H16: this.roundTo6(parseToNumber(H16) + (parseToNumber(findW?.H16) ? parseToNumber(findW.H16) : 0)),
            H17: this.roundTo6(parseToNumber(H17) + (parseToNumber(findW?.H17) ? parseToNumber(findW.H17) : 0)),
            H18: this.roundTo6(parseToNumber(H18) + (parseToNumber(findW?.H18) ? parseToNumber(findW.H18) : 0)),
            H19: this.roundTo6(parseToNumber(H19) + (parseToNumber(findW?.H19) ? parseToNumber(findW.H19) : 0)),
            H20: this.roundTo6(parseToNumber(H20) + (parseToNumber(findW?.H20) ? parseToNumber(findW.H20) : 0)),
            H21: this.roundTo6(parseToNumber(H21) + (parseToNumber(findW?.H21) ? parseToNumber(findW.H21) : 0)),
            H22: this.roundTo6(parseToNumber(H22) + (parseToNumber(findW?.H22) ? parseToNumber(findW.H22) : 0)),
            H23: this.roundTo6(parseToNumber(H23) + (parseToNumber(findW?.H23) ? parseToNumber(findW.H23) : 0)),
            H24: this.roundTo6(parseToNumber(H24) + (parseToNumber(findW?.H24) ? parseToNumber(findW.H24) : 0))
          }
         
          fDWallMMSCFDOnce = fDWallMMSCFDOnce?.map((old: any) => {
            if (findW?.gas_day_text === old?.gas_day_text && findW?.nomination_point === old?.nomination_point) {
              return {
                ...nData,
                utilization: parseToNumber(nData?.utilization ?? 0)
              }
            } else {
              return {
                ...old,
                utilization: parseToNumber(old?.utilization ?? 0)
              }
            }
          })
        } else {
          addfDWaMMSCFDWOnce?.push({
            ...e,
            utilization: parseToNumber(e?.utilization ?? 0)
          })
        }
        return e
      })
      fDWallMMSCFDOnce = [...fDWallMMSCFDOnce, ...addfDWaMMSCFDWOnce]
    } else {
      fDWallMMSCFDOnce = fDWaMMSCFDcalcOnce
    }

    fDWallMMSCFDOnce = fDWallMMSCFDOnce?.map((e: any) => {
      const {total, totalCap, ...nE} = e
      const CalcTotalNew =
        parseToNumber(nE?.H1 ?? 0) +
        parseToNumber(nE?.H2 ?? 0) +
        parseToNumber(nE?.H3 ?? 0) +
        parseToNumber(nE?.H4 ?? 0) +
        parseToNumber(nE?.H5 ?? 0) +
        parseToNumber(nE?.H6 ?? 0) +
        parseToNumber(nE?.H7 ?? 0) +
        parseToNumber(nE?.H8 ?? 0) +
        parseToNumber(nE?.H9 ?? 0) +
        parseToNumber(nE?.H10 ?? 0) +
        parseToNumber(nE?.H11 ?? 0) +
        parseToNumber(nE?.H12 ?? 0) +
        parseToNumber(nE?.H13 ?? 0) +
        parseToNumber(nE?.H14 ?? 0) +
        parseToNumber(nE?.H15 ?? 0) +
        parseToNumber(nE?.H16 ?? 0) +
        parseToNumber(nE?.H17 ?? 0) +
        parseToNumber(nE?.H18 ?? 0) +
        parseToNumber(nE?.H19 ?? 0) +
        parseToNumber(nE?.H20 ?? 0) +
        parseToNumber(nE?.H21 ?? 0) +
        parseToNumber(nE?.H22 ?? 0) +
        parseToNumber(nE?.H23 ?? 0) +
        parseToNumber(nE?.H24 ?? 0)

      return {
        total: this.normalizeNumber(CalcTotalNew),
        totalCap: this.normalizeNumber(CalcTotalNew),
        ...nE
      }
    })
   
    const UlitAllfDWallMMSCFDOnce_ = this.fnALLNOMUutilization(fDWallMMSCFDOnce, 'mmscf', areaData, null, nomData, D_EW_OBJ, W_EW_OBJ)
    
    const UlitAllfDWallMMSCFDOnce = UlitAllfDWallMMSCFDOnce_?.map((e: any) => {
      const {utilization: utilization_, total: total_, totalCap: totalCap_, arrNom, wi, hv, sg, entry_exit_id, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...nE} = e
      let hourDay = {
        H1,
        H2,
        H3,
        H4,
        H5,
        H6,
        H7,
        H8,
        H9,
        H10,
        H11,
        H12,
        H13,
        H14,
        H15,
        H16,
        H17,
        H18,
        H19,
        H20,
        H21,
        H22,
        H23,
        H24
      }
      let total = total_
      let totalCap = totalCap_
      let utilization = utilization_

      if (entry_exit_id === 2) {
        const {hourDay: hourDay_n, total: total_n, totalCap: totalCap_n, utilization: utilization_n} = this.fnDayExitMMSCFNewCalc(hv, arrNom, nomData, e && e?.nomination_point || "")
 
        hourDay = hourDay_n
        utilization = utilization_n

        total = total_n
        totalCap = totalCap_n
      } else {
        const {total: total_n, totalCap: totalCap_n} = this.fnDayNewCalc(hourDay, arrNom, nomData)

        total = total_n
        totalCap = totalCap_n
      }
      return {
        utilization,
        total,
        totalCap,
        arrNom,
        wi,
        hv,
        sg,
        entry_exit_id,
        ...hourDay,
        ...nE
      }
    })

    console.log('[NGV-C4] UlitAllfDWallMMSCFDOnce : ', UlitAllfDWallMMSCFDOnce?.filter((f:any) => f?.nomination_point === "NGV-C4"));

    let fDWallMMSCFD = [...fDWaMMSCFDcalc?.filter((f: any) => f?.nomination_type_id === 1)]
    let fDWaMMSCFDW = [...fDWaMMSCFDcalc?.filter((f: any) => f?.nomination_type_id === 2)]

    let addfDWaMMSCFDW = []
    if (fDWallMMSCFD.length > 0) {
      fDWaMMSCFDW?.map((e: any) => {
        const findW = fDWallMMSCFD?.find((f: any) => {
          return f?.gas_day_text === e?.gas_day_text && f?.nomination_point === e?.nomination_point
        })
        if (findW) {
          const {arrContractId, arrNom, total, totalCap, utilization, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...newE} = e
          const nData = {
            ...findW,
            arrContractId: [...arrContractId, ...findW?.arrContractId],
            arrNom: [...arrNom, ...findW?.arrNom],
            total: (total ? parseToNumber(total) : 0) + (findW?.total ? parseToNumber(findW.total) : 0),
            totalCap: (totalCap ? parseToNumber(totalCap) : 0) + (findW?.totalCap ? parseToNumber(findW.totalCap) : 0),
            utilization: parseToNumber((utilization ? parseToNumber(utilization) : 0) + (findW?.utilization ? parseToNumber(findW.utilization) : 0)) ?? 0,
            H1: parseToNumber(H1) + (parseToNumber(findW?.H1) ? parseToNumber(findW.H1) : 0),
            H2: parseToNumber(H2) + (parseToNumber(findW?.H2) ? parseToNumber(findW.H2) : 0),
            H3: parseToNumber(H3) + (parseToNumber(findW?.H3) ? parseToNumber(findW.H3) : 0),
            H4: parseToNumber(H4) + (parseToNumber(findW?.H4) ? parseToNumber(findW.H4) : 0),
            H5: parseToNumber(H5) + (parseToNumber(findW?.H5) ? parseToNumber(findW.H5) : 0),
            H6: parseToNumber(H6) + (parseToNumber(findW?.H6) ? parseToNumber(findW.H6) : 0),
            H7: parseToNumber(H7) + (parseToNumber(findW?.H7) ? parseToNumber(findW.H7) : 0),
            H8: parseToNumber(H8) + (parseToNumber(findW?.H8) ? parseToNumber(findW.H8) : 0),
            H9: parseToNumber(H9) + (parseToNumber(findW?.H9) ? parseToNumber(findW.H9) : 0),
            H10: parseToNumber(H10) + (parseToNumber(findW?.H10) ? parseToNumber(findW.H10) : 0),
            H11: parseToNumber(H11) + (parseToNumber(findW?.H11) ? parseToNumber(findW.H11) : 0),
            H12: parseToNumber(H12) + (parseToNumber(findW?.H12) ? parseToNumber(findW.H12) : 0),
            H13: parseToNumber(H13) + (parseToNumber(findW?.H13) ? parseToNumber(findW.H13) : 0),
            H14: parseToNumber(H14) + (parseToNumber(findW?.H14) ? parseToNumber(findW.H14) : 0),
            H15: parseToNumber(H15) + (parseToNumber(findW?.H15) ? parseToNumber(findW.H15) : 0),
            H16: parseToNumber(H16) + (parseToNumber(findW?.H16) ? parseToNumber(findW.H16) : 0),
            H17: parseToNumber(H17) + (parseToNumber(findW?.H17) ? parseToNumber(findW.H17) : 0),
            H18: parseToNumber(H18) + (parseToNumber(findW?.H18) ? parseToNumber(findW.H18) : 0),
            H19: parseToNumber(H19) + (parseToNumber(findW?.H19) ? parseToNumber(findW.H19) : 0),
            H20: parseToNumber(H20) + (parseToNumber(findW?.H20) ? parseToNumber(findW.H20) : 0),
            H21: parseToNumber(H21) + (parseToNumber(findW?.H21) ? parseToNumber(findW.H21) : 0),
            H22: parseToNumber(H22) + (parseToNumber(findW?.H22) ? parseToNumber(findW.H22) : 0),
            H23: parseToNumber(H23) + (parseToNumber(findW?.H23) ? parseToNumber(findW.H23) : 0),
            H24: parseToNumber(H24) + (parseToNumber(findW?.H24) ? parseToNumber(findW.H24) : 0)
          }
          fDWallMMSCFD = fDWallMMSCFD?.map((old: any) => {
            if (findW?.gas_day_text === old?.gas_day_text && findW?.nomination_point === old?.nomination_point) {
              return {
                ...nData,
                utilization: parseToNumber(nData?.utilization ?? 0)
              }
            } else {
              return {
                ...old,
                utilization: parseToNumber(old?.utilization ?? 0)
              }
            }
          })
        } else {
          addfDWaMMSCFDW?.push({
            ...e,
            utilization: parseToNumber(e?.utilization ?? 0)
          })
        }
        return e
      })
      fDWallMMSCFD = [...fDWallMMSCFD, ...addfDWaMMSCFDW]
    } else {
      fDWallMMSCFD = fDWaMMSCFDcalc
    }

    const resultallwMMBTUD_ = fnWtoDPointContract(dallwMMBTUD, dMMBTUD)
    const resultallwMMBTUD: any = fnGroupByKeysFinal(resultallwMMBTUD_, horuss)
    const resultallwMMBTUDOnce: any = fnGroupByKeysALLFinal(resultallwMMBTUD_, horuss)
    const fDWallwMMBTUDcalc = [...dMMBTUD, ...resultallwMMBTUD]
    const fDWallwMMBTUDcalcOnce = [...dMMBTUD, ...resultallwMMBTUDOnce]

    let fDWallwMMBTUDOnce = [...fDWallwMMBTUDcalcOnce?.filter((f: any) => f?.nomination_type_id === 1)]
    let fDWallwMMBTUDWOnce = [...fDWallwMMBTUDcalcOnce?.filter((f: any) => f?.nomination_type_id === 2)]
    let addfDWallwMMBTUDDWOnce = []

    // this.roundTo3
    if (fDWallwMMBTUDOnce.length > 0) {
      fDWallwMMBTUDWOnce?.map((e: any) => {
        const findW = fDWallwMMBTUDOnce?.find((f: any) => {
          return f?.gas_day_text === e?.gas_day_text && f?.nomination_point === e?.nomination_point
        })

        if (findW) {
          const {arrContractId, arrNom, total, totalCap, utilization, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...newE} = e
          const nData = {
            ...findW,
            arrContractId: [...arrContractId, ...findW?.arrContractId],
            arrNom: [...arrNom, ...findW?.arrNom],
            total: this.roundTo3(total ? parseToNumber(total) : 0) + (findW?.total ? parseToNumber(findW.total) : 0),
            totalCap: this.roundTo3(totalCap ? parseToNumber(totalCap) : 0) + (findW?.totalCap ? parseToNumber(findW.totalCap) : 0),
            utilization: parseToNumber((utilization ? parseToNumber(utilization) : 0) + (findW?.utilization ? parseToNumber(findW.utilization) : 0)) ?? 0,

            H1: this.roundTo3(parseToNumber(H1) + (parseToNumber(findW?.H1) ? parseToNumber(findW.H1) : 0)),
            H2: this.roundTo3(parseToNumber(H2) + (parseToNumber(findW?.H2) ? parseToNumber(findW.H2) : 0)),
            H3: this.roundTo3(parseToNumber(H3) + (parseToNumber(findW?.H3) ? parseToNumber(findW.H3) : 0)),
            H4: this.roundTo3(parseToNumber(H4) + (parseToNumber(findW?.H4) ? parseToNumber(findW.H4) : 0)),
            H5: this.roundTo3(parseToNumber(H5) + (parseToNumber(findW?.H5) ? parseToNumber(findW.H5) : 0)),
            H6: this.roundTo3(parseToNumber(H6) + (parseToNumber(findW?.H6) ? parseToNumber(findW.H6) : 0)),
            H7: this.roundTo3(parseToNumber(H7) + (parseToNumber(findW?.H7) ? parseToNumber(findW.H7) : 0)),
            H8: this.roundTo3(parseToNumber(H8) + (parseToNumber(findW?.H8) ? parseToNumber(findW.H8) : 0)),
            H9: this.roundTo3(parseToNumber(H9) + (parseToNumber(findW?.H9) ? parseToNumber(findW.H9) : 0)),
            H10: this.roundTo3(parseToNumber(H10) + (parseToNumber(findW?.H10) ? parseToNumber(findW.H10) : 0)),
            H11: this.roundTo3(parseToNumber(H11) + (parseToNumber(findW?.H11) ? parseToNumber(findW.H11) : 0)),
            H12: this.roundTo3(parseToNumber(H12) + (parseToNumber(findW?.H12) ? parseToNumber(findW.H12) : 0)),
            H13: this.roundTo3(parseToNumber(H13) + (parseToNumber(findW?.H13) ? parseToNumber(findW.H13) : 0)),
            H14: this.roundTo3(parseToNumber(H14) + (parseToNumber(findW?.H14) ? parseToNumber(findW.H14) : 0)),
            H15: this.roundTo3(parseToNumber(H15) + (parseToNumber(findW?.H15) ? parseToNumber(findW.H15) : 0)),
            H16: this.roundTo3(parseToNumber(H16) + (parseToNumber(findW?.H16) ? parseToNumber(findW.H16) : 0)),
            H17: this.roundTo3(parseToNumber(H17) + (parseToNumber(findW?.H17) ? parseToNumber(findW.H17) : 0)),
            H18: this.roundTo3(parseToNumber(H18) + (parseToNumber(findW?.H18) ? parseToNumber(findW.H18) : 0)),
            H19: this.roundTo3(parseToNumber(H19) + (parseToNumber(findW?.H19) ? parseToNumber(findW.H19) : 0)),
            H20: this.roundTo3(parseToNumber(H20) + (parseToNumber(findW?.H20) ? parseToNumber(findW.H20) : 0)),
            H21: this.roundTo3(parseToNumber(H21) + (parseToNumber(findW?.H21) ? parseToNumber(findW.H21) : 0)),
            H22: this.roundTo3(parseToNumber(H22) + (parseToNumber(findW?.H22) ? parseToNumber(findW.H22) : 0)),
            H23: this.roundTo3(parseToNumber(H23) + (parseToNumber(findW?.H23) ? parseToNumber(findW.H23) : 0)),
            H24: this.roundTo3(parseToNumber(H24) + (parseToNumber(findW?.H24) ? parseToNumber(findW.H24) : 0))
          }
          fDWallwMMBTUDOnce = fDWallwMMBTUDOnce?.map((old: any) => {
            if (findW?.gas_day_text === old?.gas_day_text && findW?.nomination_point === old?.nomination_point) {
              return {
                ...nData,
                utilization: parseToNumber(nData?.utilization ?? 0)
              }
            } else {
              return {
                ...old,
                utilization: parseToNumber(old?.utilization ?? 0)
              }
            }
          })
        } else {
          addfDWallwMMBTUDDWOnce?.push({
            ...e,
            utilization: parseToNumber(e?.utilization ?? 0)
          })
        }
        return e
      })

      fDWallwMMBTUDOnce = [...fDWallwMMBTUDOnce, ...addfDWallwMMBTUDDWOnce]
    } else {
      fDWallwMMBTUDOnce = fDWallwMMBTUDcalcOnce
    }
    fDWallwMMBTUDOnce = fDWallwMMBTUDOnce?.map((e: any) => {
      const {total, totalCap, ...nE} = e
      const CalcTotalNew =
        parseToNumber(nE?.H1 ?? 0) +
        parseToNumber(nE?.H2 ?? 0) +
        parseToNumber(nE?.H3 ?? 0) +
        parseToNumber(nE?.H4 ?? 0) +
        parseToNumber(nE?.H5 ?? 0) +
        parseToNumber(nE?.H6 ?? 0) +
        parseToNumber(nE?.H7 ?? 0) +
        parseToNumber(nE?.H8 ?? 0) +
        parseToNumber(nE?.H9 ?? 0) +
        parseToNumber(nE?.H10 ?? 0) +
        parseToNumber(nE?.H11 ?? 0) +
        parseToNumber(nE?.H12 ?? 0) +
        parseToNumber(nE?.H13 ?? 0) +
        parseToNumber(nE?.H14 ?? 0) +
        parseToNumber(nE?.H15 ?? 0) +
        parseToNumber(nE?.H16 ?? 0) +
        parseToNumber(nE?.H17 ?? 0) +
        parseToNumber(nE?.H18 ?? 0) +
        parseToNumber(nE?.H19 ?? 0) +
        parseToNumber(nE?.H20 ?? 0) +
        parseToNumber(nE?.H21 ?? 0) +
        parseToNumber(nE?.H22 ?? 0) +
        parseToNumber(nE?.H23 ?? 0) +
        parseToNumber(nE?.H24 ?? 0)

      return {
        total: this.normalizeNumber(CalcTotalNew),
        totalCap: this.normalizeNumber(CalcTotalNew),
        ...nE
      }
    })
    console.log('[ZAWTIKA] fDWallwMMBTUDOnce : ', fDWallwMMBTUDOnce?.filter((f:any) => f?.nomination_point === "ZAWTIKA"));
    const UlitAllfDWallMMBTUDOnce = this.fnALLNOMUutilization(fDWallwMMBTUDOnce, 'mmbtu', areaData, fDWallMMSCFDOnce, nomData, D_EW_OBJ, W_EW_OBJ)

    console.timeEnd('sum G7')
    console.time('sum G8')

    let fDWallwMMBTUD = [...fDWallwMMBTUDcalc?.filter((f: any) => f?.nomination_type_id === 1)]
    let fDWallwMMBTUDW = [...fDWallwMMBTUDcalc?.filter((f: any) => f?.nomination_type_id === 2)]
    let addfDWallwMMBTUDDW = []
    if (fDWallwMMBTUD.length > 0) {
      fDWallwMMBTUDW?.map((e: any) => {
        const findW = fDWallwMMBTUD?.find((f: any) => {
          return f?.gas_day_text === e?.gas_day_text && f?.nomination_point === e?.nomination_point
        })

        if (findW) {
          const {arrContractId, arrNom, total, totalCap, utilization, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...newE} = e
          const nData = {
            ...findW,
            arrContractId: [...arrContractId, ...findW?.arrContractId],
            arrNom: [...arrNom, ...findW?.arrNom],
            total: (total ? parseToNumber(total) : 0) + (findW?.total ? parseToNumber(findW.total) : 0),
            totalCap: (totalCap ? parseToNumber(totalCap) : 0) + (findW?.totalCap ? parseToNumber(findW.totalCap) : 0),
            utilization: parseToNumber((utilization ? parseToNumber(utilization) : 0) + (findW?.utilization ? parseToNumber(findW.utilization) : 0)) ?? 0,

            H1: parseToNumber(H1) + (parseToNumber(findW?.H1) ? parseToNumber(findW.H1) : 0),
            H2: parseToNumber(H2) + (parseToNumber(findW?.H2) ? parseToNumber(findW.H2) : 0),
            H3: parseToNumber(H3) + (parseToNumber(findW?.H3) ? parseToNumber(findW.H3) : 0),
            H4: parseToNumber(H4) + (parseToNumber(findW?.H4) ? parseToNumber(findW.H4) : 0),
            H5: parseToNumber(H5) + (parseToNumber(findW?.H5) ? parseToNumber(findW.H5) : 0),
            H6: parseToNumber(H6) + (parseToNumber(findW?.H6) ? parseToNumber(findW.H6) : 0),
            H7: parseToNumber(H7) + (parseToNumber(findW?.H7) ? parseToNumber(findW.H7) : 0),
            H8: parseToNumber(H8) + (parseToNumber(findW?.H8) ? parseToNumber(findW.H8) : 0),
            H9: parseToNumber(H9) + (parseToNumber(findW?.H9) ? parseToNumber(findW.H9) : 0),
            H10: parseToNumber(H10) + (parseToNumber(findW?.H10) ? parseToNumber(findW.H10) : 0),
            H11: parseToNumber(H11) + (parseToNumber(findW?.H11) ? parseToNumber(findW.H11) : 0),
            H12: parseToNumber(H12) + (parseToNumber(findW?.H12) ? parseToNumber(findW.H12) : 0),
            H13: parseToNumber(H13) + (parseToNumber(findW?.H13) ? parseToNumber(findW.H13) : 0),
            H14: parseToNumber(H14) + (parseToNumber(findW?.H14) ? parseToNumber(findW.H14) : 0),
            H15: parseToNumber(H15) + (parseToNumber(findW?.H15) ? parseToNumber(findW.H15) : 0),
            H16: parseToNumber(H16) + (parseToNumber(findW?.H16) ? parseToNumber(findW.H16) : 0),
            H17: parseToNumber(H17) + (parseToNumber(findW?.H17) ? parseToNumber(findW.H17) : 0),
            H18: parseToNumber(H18) + (parseToNumber(findW?.H18) ? parseToNumber(findW.H18) : 0),
            H19: parseToNumber(H19) + (parseToNumber(findW?.H19) ? parseToNumber(findW.H19) : 0),
            H20: parseToNumber(H20) + (parseToNumber(findW?.H20) ? parseToNumber(findW.H20) : 0),
            H21: parseToNumber(H21) + (parseToNumber(findW?.H21) ? parseToNumber(findW.H21) : 0),
            H22: parseToNumber(H22) + (parseToNumber(findW?.H22) ? parseToNumber(findW.H22) : 0),
            H23: parseToNumber(H23) + (parseToNumber(findW?.H23) ? parseToNumber(findW.H23) : 0),
            H24: parseToNumber(H24) + (parseToNumber(findW?.H24) ? parseToNumber(findW.H24) : 0)
          }
          fDWallwMMBTUD = fDWallwMMBTUD?.map((old: any) => {
            if (findW?.gas_day_text === old?.gas_day_text && findW?.nomination_point === old?.nomination_point) {
              return {
                ...nData,
                utilization: parseToNumber(nData?.utilization ?? 0)
              }
            } else {
              return {
                ...old,
                utilization: parseToNumber(old?.utilization ?? 0)
              }
            }
          })
        } else {
          addfDWallwMMBTUDDW?.push({
            ...e,
            utilization: parseToNumber(e?.utilization ?? 0)
          })
        }
        return e
      })

      fDWallwMMBTUD = [...fDWallwMMBTUD, ...addfDWallwMMBTUDDW]
    } else {
      fDWallwMMBTUD = fDWallwMMBTUDcalc
    }

    const aTotal = [...fDWallwMMBTUD, ...fDWallMMSCFD].map((e: any) => {
      e['parkUnparkInstructedFlows'] = e['nomination_row_json']?.['data_temp']?.['5'] || null
      e['customerType'] = e['nomination_row_json']?.['data_temp']?.['6'] || null
      e['unix'] = e['unix'] || null
      // e['unix'] = e['nomination_row_json']?.['data_temp']?.['9'] || null;
      e['wi'] = e['nomination_row_json']?.['data_temp']?.['11'] || null
      e['hv'] = e['nomination_row_json']?.['data_temp']?.['12'] || null
      e['sg'] = e['nomination_row_json']?.['data_temp']?.['13'] || null

      return {...e}
    })

    const groupedATotal = aTotal.reduce((acc: any, item: any) => {
      const groupKey = `${item.area_text || 'null'}_${item.zone_text || 'null'}_${item.nomination_point || 'null'}_${item.entry_exit_id || 'null'}_${item.customerType || 'null'}_${item.unix || 'null'}_${item.parkUnparkInstructedFlows || 'null'}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          area_text: item.area_text,
          zone_text: item.zone_text,
          nomination_point: item && item.nomination_point || "",
          entry_exit_id: item.entry_exit_id,
          customerType: item.customerType,
          unix: item.unix,
          parkUnparkInstructedFlows: item.parkUnparkInstructedFlows,
          wi: null,
          hv: null,
          sg: null,
          total: null,
          totalCap: null,
          utilization: null,
          H1: null,
          H2: null,
          H3: null,
          H4: null,
          H5: null,
          H6: null,
          H7: null,
          H8: null,
          H9: null,
          H10: null,
          H11: null,
          H12: null,
          H13: null,
          H14: null,
          H15: null,
          H16: null,
          H17: null,
          H18: null,
          H19: null,
          H20: null,
          H21: null,
          H22: null,
          H23: null,
          H24: null,
          items: []
        }
      }

      // excel  wi 11 hv 12 sg 13

      const _calc_vi_all =
        (item && item?.arrNom || []).reduce((accIn, currIn) => {
          let resultIn = 0
          if (currIn?.nomination_type_id === 1) {
            // day
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
          } else {
            // week
            const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
            const gasDay = fnDay7(gas_day_text)
            const idx0 = gasDay.indexOf(gas_day_text)
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
          }
          return accIn + resultIn
        }, 0) ?? 0

      const _calc_hv_x_vi_all = (item && item?.arrNom || []).reduce((accIn, currIn) => {
        let resultIn = 0
        let hv_ = 0
        let vi_ = 0
        hv_ = parseToNumber(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
        if (currIn?.nomination_type_id === 1) {
          // day
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
          const gasDay = fnDay7(gas_day_text)
          const idx0 = gasDay.indexOf(gas_day_text)
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
        }
        if (hv_ === 0 && vi_ === 0) {
          resultIn = 0
        } else {
          resultIn = hv_ * vi_
        }

        return accIn + resultIn
      }, 0)

      const _calc_sg_x_vi_all = (item && item?.arrNom || []).reduce((accIn, currIn) => {
        let resultIn = 0
        let vi_ = 0
        let sg_ = 0
        sg_ = parseToNumber(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
        if (currIn?.nomination_type_id === 1) {
          // day
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
          const gasDay = fnDay7(gas_day_text)
          const idx0 = gasDay.indexOf(gas_day_text)
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
        }
        if (sg_ === 0 && vi_ === 0) {
          resultIn = 0
        } else {
          resultIn = sg_ * vi_
        }

        return accIn + resultIn
      }, 0)

      const _calc_final_hv = _calc_vi_all === 0 && _calc_hv_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_hv_x_vi_all / _calc_vi_all)
      const _calc_final_sg = _calc_vi_all === 0 && _calc_sg_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_sg_x_vi_all / _calc_vi_all)
      const _calc_final_wi = _calc_hv_x_vi_all / 0.982596 / Math.sqrt(_calc_sg_x_vi_all * _calc_vi_all)

      // ---------

      acc[groupKey].wi = _calc_final_wi
      acc[groupKey].hv = _calc_final_hv
      acc[groupKey].sg = _calc_final_sg

      // -------

      // รอ check concept point & park , unpark , change min

      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === item?.['nomination_point']
      })

      const totalAll = acc[groupKey].total ? acc[groupKey].total + (parseToNumber(item.total) ?? 0) : parseToNumber(item.total)
      if (item?.unix === 'MMBTU/D') {
        // totalAll / (Number(nomPoint?.maximum_capacity ?? 0)) * _calc_final_hv) * 100;
        acc[groupKey].utilization = (totalAll / (Number(nomPoint?.maximum_capacity ?? 0) * _calc_final_hv)) * 100
      } else {
        acc[groupKey].utilization = (totalAll / Number(nomPoint?.maximum_capacity ?? 0)) * 100
      }

      // -------
      acc[groupKey].total = acc[groupKey].total ? acc[groupKey].total + (parseToNumber(item.total) ?? 0) : parseToNumber(item.total)
      acc[groupKey].totalCap = acc[groupKey].totalCap ? acc[groupKey].totalCap + (parseToNumber(item.totalCap) ?? 0) : parseToNumber(item.totalCap)
      // -------

      acc[groupKey].H1 = acc[groupKey].H1 ? acc[groupKey].H1 + (parseToNumber(item.H1) ?? 0) : parseToNumber(item.H1)
      acc[groupKey].H2 = acc[groupKey].H2 ? acc[groupKey].H2 + (parseToNumber(item.H2) ?? 0) : parseToNumber(item.H2)
      acc[groupKey].H3 = acc[groupKey].H3 ? acc[groupKey].H3 + (parseToNumber(item.H3) ?? 0) : parseToNumber(item.H3)
      acc[groupKey].H4 = acc[groupKey].H4 ? acc[groupKey].H4 + (parseToNumber(item.H4) ?? 0) : parseToNumber(item.H4)
      acc[groupKey].H5 = acc[groupKey].H5 ? acc[groupKey].H5 + (parseToNumber(item.H5) ?? 0) : parseToNumber(item.H5)
      acc[groupKey].H6 = acc[groupKey].H6 ? acc[groupKey].H6 + (parseToNumber(item.H6) ?? 0) : parseToNumber(item.H6)
      acc[groupKey].H7 = acc[groupKey].H7 ? acc[groupKey].H7 + (parseToNumber(item.H7) ?? 0) : parseToNumber(item.H7)
      acc[groupKey].H8 = acc[groupKey].H8 ? acc[groupKey].H8 + (parseToNumber(item.H8) ?? 0) : parseToNumber(item.H8)
      acc[groupKey].H9 = acc[groupKey].H9 ? acc[groupKey].H9 + (parseToNumber(item.H9) ?? 0) : parseToNumber(item.H9)
      acc[groupKey].H10 = acc[groupKey].H10 ? acc[groupKey].H10 + (parseToNumber(item.H10) ?? 0) : parseToNumber(item.H10)
      acc[groupKey].H11 = acc[groupKey].H11 ? acc[groupKey].H11 + (parseToNumber(item.H11) ?? 0) : parseToNumber(item.H11)
      acc[groupKey].H12 = acc[groupKey].H12 ? acc[groupKey].H12 + (parseToNumber(item.H12) ?? 0) : parseToNumber(item.H12)
      acc[groupKey].H13 = acc[groupKey].H13 ? acc[groupKey].H13 + (parseToNumber(item.H13) ?? 0) : parseToNumber(item.H13)
      acc[groupKey].H14 = acc[groupKey].H14 ? acc[groupKey].H14 + (parseToNumber(item.H14) ?? 0) : parseToNumber(item.H14)
      acc[groupKey].H15 = acc[groupKey].H15 ? acc[groupKey].H15 + (parseToNumber(item.H15) ?? 0) : parseToNumber(item.H15)
      acc[groupKey].H16 = acc[groupKey].H16 ? acc[groupKey].H16 + (parseToNumber(item.H16) ?? 0) : parseToNumber(item.H16)
      acc[groupKey].H17 = acc[groupKey].H17 ? acc[groupKey].H17 + (parseToNumber(item.H17) ?? 0) : parseToNumber(item.H17)
      acc[groupKey].H18 = acc[groupKey].H18 ? acc[groupKey].H18 + (parseToNumber(item.H18) ?? 0) : parseToNumber(item.H18)
      acc[groupKey].H19 = acc[groupKey].H19 ? acc[groupKey].H19 + (parseToNumber(item.H19) ?? 0) : parseToNumber(item.H19)
      acc[groupKey].H20 = acc[groupKey].H20 ? acc[groupKey].H20 + (parseToNumber(item.H20) ?? 0) : parseToNumber(item.H20)
      acc[groupKey].H21 = acc[groupKey].H21 ? acc[groupKey].H21 + (parseToNumber(item.H21) ?? 0) : parseToNumber(item.H21)
      acc[groupKey].H22 = acc[groupKey].H22 ? acc[groupKey].H22 + (parseToNumber(item.H22) ?? 0) : parseToNumber(item.H22)
      acc[groupKey].H23 = acc[groupKey].H23 ? acc[groupKey].H23 + (parseToNumber(item.H23) ?? 0) : parseToNumber(item.H23)
      acc[groupKey].H24 = acc[groupKey].H24 ? acc[groupKey].H24 + (parseToNumber(item.H24) ?? 0) : parseToNumber(item.H24)

      acc[groupKey].arrNom = item?.arrNom
      acc[groupKey].items.push(item)
      return acc
    }, {})

    const aTotalParkUnparkMin_ = [...fDWallwMMBTUDcalc_all, ...fDWallwMMSCFDcalc_all].map((e: any) => {
      e['parkUnparkInstructedFlows'] = e['nomination_row_json']?.['data_temp']?.['5'] || null
      e['customerType'] = e['nomination_row_json']?.['data_temp']?.['6'] || null
      e['unix'] = e['unix'] || null
      // e['unix'] = e['nomination_row_json']?.['data_temp']?.['9'] || null;
      e['wi'] = e['nomination_row_json']?.['data_temp']?.['11'] || null
      e['hv'] = e['nomination_row_json']?.['data_temp']?.['12'] || null
      e['sg'] = e['nomination_row_json']?.['data_temp']?.['13'] || null

      return {...e}
    })

    const groupedATotalParkUnparkMin_ = aTotalParkUnparkMin_.reduce((acc: any, item: any) => {
      const groupKey = `${item.area_text || 'null'}_${item.zone_text || 'null'}_${item.nomination_point || 'null'}_${item.entry_exit_id || 'null'}_${item.customerType || 'null'}_${item.unix || 'null'}_${item.parkUnparkInstructedFlows || 'null'}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          area_text: item.area_text,
          zone_text: item.zone_text,
          nomination_point: item && item.nomination_point || "",
          entry_exit_id: item.entry_exit_id,
          customerType: item.customerType,
          unix: item.unix,
          parkUnparkInstructedFlows: item.parkUnparkInstructedFlows,
          wi: null,
          hv: null,
          sg: null,
          total: null,
          totalCap: null,
          utilization: null,
          H1: null,
          H2: null,
          H3: null,
          H4: null,
          H5: null,
          H6: null,
          H7: null,
          H8: null,
          H9: null,
          H10: null,
          H11: null,
          H12: null,
          H13: null,
          H14: null,
          H15: null,
          H16: null,
          H17: null,
          H18: null,
          H19: null,
          H20: null,
          H21: null,
          H22: null,
          H23: null,
          H24: null,
          items: []
        }
      }

      // excel  wi 11 hv 12 sg 13

      const _calc_vi_all =
        (item && item?.arrNom || []).reduce((accIn, currIn) => {
          let resultIn = 0
          if (currIn?.nomination_type_id === 1) {
            // day
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
          } else {
            // week
            const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
            const gasDay = fnDay7(gas_day_text)
            const idx0 = gasDay.indexOf(gas_day_text)
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
          }
          return accIn + resultIn
        }, 0) ?? 0

      const _calc_hv_x_vi_all = (item && item?.arrNom || []).reduce((accIn, currIn) => {
        let resultIn = 0
        let hv_ = 0
        let vi_ = 0
        hv_ = parseToNumber(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
        if (currIn?.nomination_type_id === 1) {
          // day
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
          const gasDay = fnDay7(gas_day_text)
          const idx0 = gasDay.indexOf(gas_day_text)
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
        }
        if (hv_ === 0 && vi_ === 0) {
          resultIn = 0
        } else {
          resultIn = hv_ * vi_
        }

        return accIn + resultIn
      }, 0)

      const _calc_sg_x_vi_all = (item && item?.arrNom || []).reduce((accIn, currIn) => {
        let resultIn = 0
        let vi_ = 0
        let sg_ = 0
        sg_ = parseToNumber(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
        if (currIn?.nomination_type_id === 1) {
          // day
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
          const gasDay = fnDay7(gas_day_text)
          const idx0 = gasDay.indexOf(gas_day_text)
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
        }
        if (sg_ === 0 && vi_ === 0) {
          resultIn = 0
        } else {
          resultIn = sg_ * vi_
        }

        return accIn + resultIn
      }, 0)

      const _calc_final_hv = _calc_vi_all === 0 ? null : this.normalizeNumber(_calc_hv_x_vi_all / _calc_vi_all)
      const _calc_final_sg = _calc_vi_all === 0 ? null : this.normalizeNumber(_calc_sg_x_vi_all / _calc_vi_all)
      const _calc_final_wi = _calc_hv_x_vi_all / 0.982596 / Math.sqrt(_calc_sg_x_vi_all * _calc_vi_all)

      // ---------

      acc[groupKey].wi = _calc_final_wi
      acc[groupKey].hv = _calc_final_hv
      acc[groupKey].sg = _calc_final_sg

      // -------

      // รอ check concept point & park , unpark , change min

      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === item?.['nomination_point']
      })

      const totalAll = acc[groupKey].total ? acc[groupKey].total + (parseToNumber(item.total) ?? 0) : parseToNumber(item.total)
      if (item?.unix === 'MMBTU/D') {
        // totalAll / (Number(nomPoint?.maximum_capacity ?? 0)) * _calc_final_hv) * 100;
        acc[groupKey].utilization = (totalAll / (Number(nomPoint?.maximum_capacity ?? 0) * _calc_final_hv)) * 100
      } else {
        acc[groupKey].utilization = (totalAll / Number(nomPoint?.maximum_capacity ?? 0)) * 100
      }

      // -------
      acc[groupKey].total = this.roundTo3(acc[groupKey].total ? acc[groupKey].total + (parseToNumber(item.total) ?? 0) : parseToNumber(item.total))
      acc[groupKey].totalCap = this.roundTo3(acc[groupKey].totalCap ? acc[groupKey].totalCap + (parseToNumber(item.totalCap) ?? 0) : parseToNumber(item.totalCap))
      // -------

      acc[groupKey].H1 = this.roundTo3(acc[groupKey].H1 ? acc[groupKey].H1 + (parseToNumber(item.H1) ?? 0) : parseToNumber(item.H1))
      acc[groupKey].H2 = this.roundTo3(acc[groupKey].H2 ? acc[groupKey].H2 + (parseToNumber(item.H2) ?? 0) : parseToNumber(item.H2))
      acc[groupKey].H3 = this.roundTo3(acc[groupKey].H3 ? acc[groupKey].H3 + (parseToNumber(item.H3) ?? 0) : parseToNumber(item.H3))
      acc[groupKey].H4 = this.roundTo3(acc[groupKey].H4 ? acc[groupKey].H4 + (parseToNumber(item.H4) ?? 0) : parseToNumber(item.H4))
      acc[groupKey].H5 = this.roundTo3(acc[groupKey].H5 ? acc[groupKey].H5 + (parseToNumber(item.H5) ?? 0) : parseToNumber(item.H5))
      acc[groupKey].H6 = this.roundTo3(acc[groupKey].H6 ? acc[groupKey].H6 + (parseToNumber(item.H6) ?? 0) : parseToNumber(item.H6))
      acc[groupKey].H7 = this.roundTo3(acc[groupKey].H7 ? acc[groupKey].H7 + (parseToNumber(item.H7) ?? 0) : parseToNumber(item.H7))
      acc[groupKey].H8 = this.roundTo3(acc[groupKey].H8 ? acc[groupKey].H8 + (parseToNumber(item.H8) ?? 0) : parseToNumber(item.H8))
      acc[groupKey].H9 = this.roundTo3(acc[groupKey].H9 ? acc[groupKey].H9 + (parseToNumber(item.H9) ?? 0) : parseToNumber(item.H9))
      acc[groupKey].H10 = this.roundTo3(acc[groupKey].H10 ? acc[groupKey].H10 + (parseToNumber(item.H10) ?? 0) : parseToNumber(item.H10))
      acc[groupKey].H11 = this.roundTo3(acc[groupKey].H11 ? acc[groupKey].H11 + (parseToNumber(item.H11) ?? 0) : parseToNumber(item.H11))
      acc[groupKey].H12 = this.roundTo3(acc[groupKey].H12 ? acc[groupKey].H12 + (parseToNumber(item.H12) ?? 0) : parseToNumber(item.H12))
      acc[groupKey].H13 = this.roundTo3(acc[groupKey].H13 ? acc[groupKey].H13 + (parseToNumber(item.H13) ?? 0) : parseToNumber(item.H13))
      acc[groupKey].H14 = this.roundTo3(acc[groupKey].H14 ? acc[groupKey].H14 + (parseToNumber(item.H14) ?? 0) : parseToNumber(item.H14))
      acc[groupKey].H15 = this.roundTo3(acc[groupKey].H15 ? acc[groupKey].H15 + (parseToNumber(item.H15) ?? 0) : parseToNumber(item.H15))
      acc[groupKey].H16 = this.roundTo3(acc[groupKey].H16 ? acc[groupKey].H16 + (parseToNumber(item.H16) ?? 0) : parseToNumber(item.H16))
      acc[groupKey].H17 = this.roundTo3(acc[groupKey].H17 ? acc[groupKey].H17 + (parseToNumber(item.H17) ?? 0) : parseToNumber(item.H17))
      acc[groupKey].H18 = this.roundTo3(acc[groupKey].H18 ? acc[groupKey].H18 + (parseToNumber(item.H18) ?? 0) : parseToNumber(item.H18))
      acc[groupKey].H19 = this.roundTo3(acc[groupKey].H19 ? acc[groupKey].H19 + (parseToNumber(item.H19) ?? 0) : parseToNumber(item.H19))
      acc[groupKey].H20 = this.roundTo3(acc[groupKey].H20 ? acc[groupKey].H20 + (parseToNumber(item.H20) ?? 0) : parseToNumber(item.H20))
      acc[groupKey].H21 = this.roundTo3(acc[groupKey].H21 ? acc[groupKey].H21 + (parseToNumber(item.H21) ?? 0) : parseToNumber(item.H21))
      acc[groupKey].H22 = this.roundTo3(acc[groupKey].H22 ? acc[groupKey].H22 + (parseToNumber(item.H22) ?? 0) : parseToNumber(item.H22))
      acc[groupKey].H23 = this.roundTo3(acc[groupKey].H23 ? acc[groupKey].H23 + (parseToNumber(item.H23) ?? 0) : parseToNumber(item.H23))
      acc[groupKey].H24 = this.roundTo3(acc[groupKey].H24 ? acc[groupKey].H24 + (parseToNumber(item.H24) ?? 0) : parseToNumber(item.H24))

      acc[groupKey].items.push(item)
      return acc
    }, {})

    const aTotalConcept = [...fDWallwMMBTUDcalc_allconcept, ...fDWallwMMSCFcalc_allconcept].map((e: any) => {
      e['parkUnparkInstructedFlows'] = e['nomination_row_json']?.['data_temp']?.['5'] || null
      e['customerType'] = e['nomination_row_json']?.['data_temp']?.['6'] || null
      e['unix'] = e['unix'] || null
      // e['unix'] = e['nomination_row_json']?.['data_temp']?.['9'] || null;
      e['wi'] = e['nomination_row_json']?.['data_temp']?.['11'] || null
      e['hv'] = e['nomination_row_json']?.['data_temp']?.['12'] || null
      e['sg'] = e['nomination_row_json']?.['data_temp']?.['13'] || null

      return {...e}
    })

    // this.roundTo3
    const groupedATotalConcept = aTotalConcept.reduce((acc: any, item: any) => {
      const groupKey = `${item.area_text || 'null'}_${item.zone_text || 'null'}_${item.nomination_point || 'null'}_${item.entry_exit_id || 'null'}_${item.customerType || 'null'}_${item.unix || 'null'}_${item.parkUnparkInstructedFlows || 'null'}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          area_text: item.area_text,
          zone_text: item.zone_text,
          nomination_point: item && item.nomination_point || "",
          entry_exit_id: item.entry_exit_id,
          customerType: item.customerType,
          unix: item.unix,
          parkUnparkInstructedFlows: item.parkUnparkInstructedFlows,
          wi: null,
          hv: null,
          sg: null,
          total: null,
          totalCap: null,
          utilization: null,
          H1: null,
          H2: null,
          H3: null,
          H4: null,
          H5: null,
          H6: null,
          H7: null,
          H8: null,
          H9: null,
          H10: null,
          H11: null,
          H12: null,
          H13: null,
          H14: null,
          H15: null,
          H16: null,
          H17: null,
          H18: null,
          H19: null,
          H20: null,
          H21: null,
          H22: null,
          H23: null,
          H24: null,
          items: []
        }
      }

      // excel  wi 11 hv 12 sg 13

      const _calc_vi_all =
        (item && item?.arrNom || []).reduce((accIn, currIn) => {
          let resultIn = 0
          if (currIn?.nomination_type_id === 1) {
            // day
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
          } else {
            // week
            const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
            const gasDay = fnDay7(gas_day_text)
            const idx0 = gasDay.indexOf(gas_day_text)
            resultIn = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
          }
          return accIn + resultIn
        }, 0) ?? 0

      const _calc_hv_x_vi_all = (item && item?.arrNom || []).reduce((accIn, currIn) => {
        let resultIn = 0
        let hv_ = 0
        let vi_ = 0
        hv_ = parseToNumber(currIn?.nomination_row_json?.data_temp['12'] ?? 0)
        if (currIn?.nomination_type_id === 1) {
          // day
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
          const gasDay = fnDay7(gas_day_text)
          const idx0 = gasDay.indexOf(gas_day_text)
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
        }
        if (hv_ === 0 && vi_ === 0) {
          resultIn = 0
        } else {
          resultIn = hv_ * vi_
        }

        return accIn + resultIn
      }, 0)

      const _calc_sg_x_vi_all = (item && item?.arrNom || []).reduce((accIn, currIn) => {
        let resultIn = 0
        let vi_ = 0
        let sg_ = 0
        sg_ = parseToNumber(currIn?.nomination_row_json?.data_temp['13'] ?? 0)
        if (currIn?.nomination_type_id === 1) {
          // day
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp['38'] ?? 0)
        } else {
          // week
          const gas_day_text = currIn?.gas_day_text ? currIn?.gas_day_text : dayjs(currIn?.gas_day).format('DD/MM/YYYY')
          const gasDay = fnDay7(gas_day_text)
          const idx0 = gasDay.indexOf(gas_day_text)
          vi_ = parseToNumber(currIn?.nomination_row_json?.data_temp[idx0 + 14] ?? 0)
        }
        if (sg_ === 0 && vi_ === 0) {
          resultIn = 0
        } else {
          resultIn = sg_ * vi_
        }

        return accIn + resultIn
      }, 0)

      const _calc_final_hv = _calc_vi_all === 0 && _calc_hv_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_hv_x_vi_all / _calc_vi_all)
      const _calc_final_sg = _calc_vi_all === 0 && _calc_sg_x_vi_all === 0 ? 0 : this.normalizeNumber(_calc_sg_x_vi_all / _calc_vi_all)
      const _calc_final_wi = _calc_hv_x_vi_all / 0.982596 / Math.sqrt(_calc_sg_x_vi_all * _calc_vi_all)

      // ---------

      acc[groupKey].wi = _calc_final_wi
      acc[groupKey].hv = _calc_final_hv
      acc[groupKey].sg = _calc_final_sg

      // -------

      // รอ check concept point & park , unpark , change min

      const nomPoint = nomData?.find((f: any) => {
        return f?.nomination_point === item?.['nomination_point']
      })

      acc[groupKey].H1 = acc[groupKey].H1 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H1)) + this.roundTo3(parseToNumber(item.H1) ?? 0)) : this.roundTo3(parseToNumber(item.H1))
      acc[groupKey].H2 = acc[groupKey].H2 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H2)) + this.roundTo3(parseToNumber(item.H2) ?? 0)) : this.roundTo3(parseToNumber(item.H2))
      acc[groupKey].H3 = acc[groupKey].H3 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H3)) + this.roundTo3(parseToNumber(item.H3) ?? 0)) : this.roundTo3(parseToNumber(item.H3))
      acc[groupKey].H4 = acc[groupKey].H4 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H4)) + this.roundTo3(parseToNumber(item.H4) ?? 0)) : this.roundTo3(parseToNumber(item.H4))
      acc[groupKey].H5 = acc[groupKey].H5 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H5)) + this.roundTo3(parseToNumber(item.H5) ?? 0)) : this.roundTo3(parseToNumber(item.H5))
      acc[groupKey].H6 = acc[groupKey].H6 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H6)) + this.roundTo3(parseToNumber(item.H6) ?? 0)) : this.roundTo3(parseToNumber(item.H6))
      acc[groupKey].H7 = acc[groupKey].H7 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H7)) + this.roundTo3(parseToNumber(item.H7) ?? 0)) : this.roundTo3(parseToNumber(item.H7))
      acc[groupKey].H8 = acc[groupKey].H8 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H8)) + this.roundTo3(parseToNumber(item.H8) ?? 0)) : this.roundTo3(parseToNumber(item.H8))
      acc[groupKey].H9 = acc[groupKey].H9 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H9)) + this.roundTo3(parseToNumber(item.H9) ?? 0)) : this.roundTo3(parseToNumber(item.H9))
      acc[groupKey].H10 = acc[groupKey].H10 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H10)) + this.roundTo3(parseToNumber(item.H10) ?? 0)) : this.roundTo3(parseToNumber(item.H10))
      acc[groupKey].H11 = acc[groupKey].H11 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H11)) + this.roundTo3(parseToNumber(item.H11) ?? 0)) : this.roundTo3(parseToNumber(item.H11))
      acc[groupKey].H12 = acc[groupKey].H12 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H12)) + this.roundTo3(parseToNumber(item.H12) ?? 0)) : this.roundTo3(parseToNumber(item.H12))
      acc[groupKey].H13 = acc[groupKey].H13 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H13)) + this.roundTo3(parseToNumber(item.H13) ?? 0)) : this.roundTo3(parseToNumber(item.H13))
      acc[groupKey].H14 = acc[groupKey].H14 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H14)) + this.roundTo3(parseToNumber(item.H14) ?? 0)) : this.roundTo3(parseToNumber(item.H14))
      acc[groupKey].H15 = acc[groupKey].H15 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H15)) + this.roundTo3(parseToNumber(item.H15) ?? 0)) : this.roundTo3(parseToNumber(item.H15))
      acc[groupKey].H16 = acc[groupKey].H16 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H16)) + this.roundTo3(parseToNumber(item.H16) ?? 0)) : this.roundTo3(parseToNumber(item.H16))
      acc[groupKey].H17 = acc[groupKey].H17 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H17)) + this.roundTo3(parseToNumber(item.H17) ?? 0)) : this.roundTo3(parseToNumber(item.H17))
      acc[groupKey].H18 = acc[groupKey].H18 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H18)) + this.roundTo3(parseToNumber(item.H18) ?? 0)) : this.roundTo3(parseToNumber(item.H18))
      acc[groupKey].H19 = acc[groupKey].H19 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H19)) + this.roundTo3(parseToNumber(item.H19) ?? 0)) : this.roundTo3(parseToNumber(item.H19))
      acc[groupKey].H20 = acc[groupKey].H20 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H20)) + this.roundTo3(parseToNumber(item.H20) ?? 0)) : this.roundTo3(parseToNumber(item.H20))
      acc[groupKey].H21 = acc[groupKey].H21 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H21)) + this.roundTo3(parseToNumber(item.H21) ?? 0)) : this.roundTo3(parseToNumber(item.H21))
      acc[groupKey].H22 = acc[groupKey].H22 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H22)) + this.roundTo3(parseToNumber(item.H22) ?? 0)) : this.roundTo3(parseToNumber(item.H22))
      acc[groupKey].H23 = acc[groupKey].H23 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H23)) + this.roundTo3(parseToNumber(item.H23) ?? 0)) : this.roundTo3(parseToNumber(item.H23))
      acc[groupKey].H24 = acc[groupKey].H24 ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].H24)) + this.roundTo3(parseToNumber(item.H24) ?? 0)) : this.roundTo3(parseToNumber(item.H24))

      const total_ = this.roundTo3(
        acc[groupKey].H1 +
          acc[groupKey].H2 +
          acc[groupKey].H3 +
          acc[groupKey].H4 +
          acc[groupKey].H5 +
          acc[groupKey].H6 +
          acc[groupKey].H7 +
          acc[groupKey].H8 +
          acc[groupKey].H9 +
          acc[groupKey].H10 +
          acc[groupKey].H11 +
          acc[groupKey].H12 +
          acc[groupKey].H13 +
          acc[groupKey].H14 +
          acc[groupKey].H15 +
          acc[groupKey].H16 +
          acc[groupKey].H17 +
          acc[groupKey].H18 +
          acc[groupKey].H19 +
          acc[groupKey].H20 +
          acc[groupKey].H21 +
          acc[groupKey].H22 +
          acc[groupKey].H23 +
          acc[groupKey].H24
      )
      // -------
      acc[groupKey].total = total_
      acc[groupKey].totalCap = total_
      // acc[groupKey].total = acc[groupKey].total ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].total)) + this.roundTo3(parseToNumber(item.total) ?? 0)) : this.roundTo3(parseToNumber(item.total))
      // acc[groupKey].totalCap = acc[groupKey].totalCap ? this.roundTo3(this.roundTo3(parseToNumber(acc[groupKey].totalCap)) + this.roundTo3(parseToNumber(item.totalCap) ?? 0)) : this.roundTo3(parseToNumber(item.totalCap))
      // -------

      if (item?.unix === 'MMBTU/D') {
        acc[groupKey].utilization = (total_ / (parseToNumber(nomPoint?.maximum_capacity ?? 0) * _calc_final_hv)) * 100
      } else {
        acc[groupKey].utilization = (total_ / parseToNumber(nomPoint?.maximum_capacity ?? 0)) * 100
      }
      // const totalAll = acc[groupKey].total ? acc[groupKey].total + (parseToNumber(item.total) ?? 0) : parseToNumber(item.total)
      // if (item?.unix === 'MMBTU/D') {
      //   acc[groupKey].utilization = (totalAll / (parseToNumber(nomPoint?.maximum_capacity ?? 0) * _calc_final_hv)) * 100
      // } else {
      //   acc[groupKey].utilization = (totalAll / parseToNumber(nomPoint?.maximum_capacity ?? 0)) * 100
      // }

      acc[groupKey].items.push(item)
      return acc
    }, {})

    const groupedATotalArrayNom = Object.values({
      ...groupedATotal
    })
    const groupedATotalArrayPU = Object.values({
      ...groupedATotalParkUnparkMin_
    })
    console.log(`[Min_Inventory_Change] groupedATotalArrayPU : `, groupedATotalArrayPU?.filter((f:any) => f?.parkUnparkInstructedFlows === "Min_Inventory_Change"));
    const ngroupedATotalArrayPU = groupedATotalArrayPU?.map((e: any) => {
      return {
        ...e,
        units: e?.unix
      }
    })
    const groupedATotalArrayCONCPT = Object.values({
      ...groupedATotalConcept
    })

    const ngroupedATotalArrayCONCPT = groupedATotalArrayCONCPT?.map((e: any) => {
      return {
        ...e,
        units: e?.unix
      }
    })
    // West WI
    // console.log('[NBK] UlitAllfDWallMMSCFDOnce : ', UlitAllfDWallMMSCFDOnce?.filter((f:any) => f?.nomination_point === "NBK"));

    const groupedATotalArray = [...UlitAllfDWallMMBTUDOnce, ...UlitAllfDWallMMSCFDOnce?.filter((f: any) => f?.entry_exit_id === 1 && f?.unix === 'MMSCFD'), ...ngroupedATotalArrayPU, ...ngroupedATotalArrayCONCPT]
    const resultallAreaFil_ = fnWtoDPointContract(allAreaFil, dAreaFil)

    const resultallAreaFil: any = fnGroupByKeysALLFinal(resultallAreaFil_, horuss)

    let addfDWallArea = []
    // console.log('[A1] dAreaFil : ', dAreaFil?.filter((f:any) => f?.area_text === "A1"));
    if (dAreaFil.length > 0) {
      const arf = dAreaFil?.map((e: any) => {
        const findW = resultallAreaFil?.find((f: any) => {
          return f?.gas_day_text === e?.gas_day_text && f?.area_text === e?.area_text
        })
        if (findW) {
          const {totalCap, utilization, H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13, H14, H15, H16, H17, H18, H19, H20, H21, H22, H23, H24, ...newE} = e

          const nData = {
            ...findW,
            totalCap: this.roundTo3(totalCap ? parseToNumber(totalCap) : 0) + (findW?.totalCap ? parseToNumber(findW.totalCap) : 0),
            utilization: parseToNumber((utilization ? parseToNumber(utilization) : 0) + (findW?.utilization ? parseToNumber(findW.utilization) : 0)) ?? 0,
            H1: this.roundTo3(parseToNumber(H1) + (parseToNumber(findW?.H1) ? parseToNumber(findW.H1) : 0)),
            H2: this.roundTo3(parseToNumber(H2) + (parseToNumber(findW?.H2) ? parseToNumber(findW.H2) : 0)),
            H3: this.roundTo3(parseToNumber(H3) + (parseToNumber(findW?.H3) ? parseToNumber(findW.H3) : 0)),
            H4: this.roundTo3(parseToNumber(H4) + (parseToNumber(findW?.H4) ? parseToNumber(findW.H4) : 0)),
            H5: this.roundTo3(parseToNumber(H5) + (parseToNumber(findW?.H5) ? parseToNumber(findW.H5) : 0)),
            H6: this.roundTo3(parseToNumber(H6) + (parseToNumber(findW?.H6) ? parseToNumber(findW.H6) : 0)),
            H7: this.roundTo3(parseToNumber(H7) + (parseToNumber(findW?.H7) ? parseToNumber(findW.H7) : 0)),
            H8: this.roundTo3(parseToNumber(H8) + (parseToNumber(findW?.H8) ? parseToNumber(findW.H8) : 0)),
            H9: this.roundTo3(parseToNumber(H9) + (parseToNumber(findW?.H9) ? parseToNumber(findW.H9) : 0)),
            H10: this.roundTo3(parseToNumber(H10) + (parseToNumber(findW?.H10) ? parseToNumber(findW.H10) : 0)),
            H11: this.roundTo3(parseToNumber(H11) + (parseToNumber(findW?.H11) ? parseToNumber(findW.H11) : 0)),
            H12: this.roundTo3(parseToNumber(H12) + (parseToNumber(findW?.H12) ? parseToNumber(findW.H12) : 0)),
            H13: this.roundTo3(parseToNumber(H13) + (parseToNumber(findW?.H13) ? parseToNumber(findW.H13) : 0)),
            H14: this.roundTo3(parseToNumber(H14) + (parseToNumber(findW?.H14) ? parseToNumber(findW.H14) : 0)),
            H15: this.roundTo3(parseToNumber(H15) + (parseToNumber(findW?.H15) ? parseToNumber(findW.H15) : 0)),
            H16: this.roundTo3(parseToNumber(H16) + (parseToNumber(findW?.H16) ? parseToNumber(findW.H16) : 0)),
            H17: this.roundTo3(parseToNumber(H17) + (parseToNumber(findW?.H17) ? parseToNumber(findW.H17) : 0)),
            H18: this.roundTo3(parseToNumber(H18) + (parseToNumber(findW?.H18) ? parseToNumber(findW.H18) : 0)),
            H19: this.roundTo3(parseToNumber(H19) + (parseToNumber(findW?.H19) ? parseToNumber(findW.H19) : 0)),
            H20: this.roundTo3(parseToNumber(H20) + (parseToNumber(findW?.H20) ? parseToNumber(findW.H20) : 0)),
            H21: this.roundTo3(parseToNumber(H21) + (parseToNumber(findW?.H21) ? parseToNumber(findW.H21) : 0)),
            H22: this.roundTo3(parseToNumber(H22) + (parseToNumber(findW?.H22) ? parseToNumber(findW.H22) : 0)),
            H23: this.roundTo3(parseToNumber(H23) + (parseToNumber(findW?.H23) ? parseToNumber(findW.H23) : 0)),
            H24: this.roundTo3(parseToNumber(H24) + (parseToNumber(findW?.H24) ? parseToNumber(findW.H24) : 0))
          }

          return {
            ...nData,
            utilization: parseToNumber(nData?.utilization ?? 0)
          }
        } else {
          return {
            ...e,
            utilization: parseToNumber(e?.utilization ?? 0)
          }
        }
      })
      addfDWallArea = [
        ...arf,
        ...resultallAreaFil?.filter((f: any) => {
          return !arf?.map((ea: any) => `${ea?.gas_day_text}|${ea?.area_text}`)?.includes(`${f?.gas_day_text}|${f?.area_text}`)
        })
      ]
    } else {
      addfDWallArea = resultallAreaFil
    }

    const toArr = (x: any) => (Array.isArray(x) ? x : x == null ? [] : [x])
    const idx = new Map<string, Set<string>>()
    for (const e of dImbalance ?? []) {
      const key = String(e?.gas_day_text)
      const set = idx.get(key) ?? new Set<string>()
      for (const id of toArr(e?.contract_code_id)) set.add(String(id))
      idx.set(key, set)
    }

    const resultallImbalance = (allImbalance ?? []).filter((item) => {
      const set = idx.get(String(item?.gas_day_text))
      if (!set) return true // ไม่มีข้อมูลวันนั้นใน dImbalance ก็เก็บไว้
      return toArr(item?.contract_code_id).every((id) => !set.has(String(id)))
    })

    const sumresultdImbalance =
      dImbalance?.length === 1
        ? dImbalance[0]
        : dImbalance?.length > 0
          ? {
              change_min_invent: dImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.change_min_invent, 0),
              entryTotal: this.roundTo3(dImbalance?.reduce((accumulator, currentValue) => this.roundTo3(this.roundTo3(accumulator) + this.roundTo3(currentValue?.entryTotal)), 0)),
              exitTotal: this.roundTo3(dImbalance?.reduce((accumulator, currentValue) => this.roundTo3(this.roundTo3(accumulator) + this.roundTo3(currentValue?.exitTotal)), 0)),
              gas_day_text: dImbalance?.[0]?.gas_day_text,
              imbalance: dImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.imbalance, 0),
              imbalance_percent: dImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.imbalance_percent, 0),
              park: dImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.park, 0),
              shrinkage: dImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.shrinkage, 0),
              unpark: dImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.unpark, 0)
            }
          : null

    const sumresultallImbalance =
      resultallImbalance?.length === 1
        ? resultallImbalance[0]
        : resultallImbalance?.length > 0
          ? {
              entryTotal: this.roundTo3(resultallImbalance?.reduce((accumulator, currentValue) => this.roundTo3(this.roundTo3(accumulator) + this.roundTo3(currentValue?.entryTotal)), 0)),
              exitTotal: this.roundTo3(resultallImbalance?.reduce((accumulator, currentValue) => this.roundTo3(this.roundTo3(accumulator) + this.roundTo3(currentValue?.exitTotal)), 0)),
              gas_day_text: resultallImbalance?.[0]?.gas_day_text,
              imbalance: resultallImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.imbalance, 0),
              imbalance_percent: resultallImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.imbalance_percent, 0),
              change_min_invent: resultallImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.change_min_invent, 0),
              park: resultallImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.park, 0),
              shrinkage: resultallImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.shrinkage, 0),
              unpark: resultallImbalance?.reduce((accumulator, currentValue) => accumulator + currentValue?.unpark, 0)
            }
          : null

    let dfDWallImbalanceN = null

    console.timeEnd('sum G8')
    console.time('sum G9')

    if (sumresultdImbalance) {
      sumresultdImbalance.imbalance = this.normalizeNumber(sumresultdImbalance.imbalance)
      let calcImb = sumresultallImbalance
        ? {
            change_min_invent: sumresultdImbalance?.change_min_invent + sumresultallImbalance?.change_min_invent,
            entryTotal: this.roundTo3(sumresultdImbalance?.entryTotal + sumresultallImbalance?.entryTotal),
            exitTotal: this.roundTo3(sumresultdImbalance?.exitTotal + sumresultallImbalance?.exitTotal),
            gas_day_text: sumresultdImbalance?.gas_day_text,
            imbalance: this.normalizeNumber(sumresultdImbalance?.imbalance + sumresultallImbalance?.imbalance),
            imbalance_percent: this.normalizeNumber((this.normalizeNumber(sumresultdImbalance?.imbalance + sumresultallImbalance?.imbalance) / this.normalizeNumber(sumresultdImbalance?.entryTotal + sumresultallImbalance?.entryTotal)) * 100),
            park: sumresultdImbalance?.park + sumresultallImbalance?.park,
            shrinkage: sumresultdImbalance?.shrinkage + sumresultallImbalance?.shrinkage,
            unpark: sumresultdImbalance?.unpark + sumresultallImbalance?.unpark
          }
        : sumresultdImbalance
      dfDWallImbalanceN = [calcImb]
    } else {
      dfDWallImbalanceN = sumresultallImbalance ? [sumresultallImbalance] : null
    }

    console.timeEnd('sum G9')
    console.time('sum G10')

    const nominationDailyMMSCFD = _.orderBy(
      dMMSCFD_tabnom_exit?.map((e: any) => {
        e['utilization'] = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
        return e
      }),
      ['nomination_point'],
      ['desc']
    )?.map((e: any) => {
      const {arrNom, _arrNom, nomination_row_json, nomination_full_json, ...nE} = e
      return {...nE}
    })
    const nominationDailyMMBTUD = _.orderBy(
      dMMBTUD?.map((e: any) => {
        e['utilization'] = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
        return e
      }),
      ['nomination_point'],
      ['desc']
    )?.map((e: any) => {
      const {arrNom, _arrNom, nomination_row_json, nomination_full_json, ...nE} = e
      return {...nE}
    })
     // saturday
    console.log('[IND-E] wMMSCFD_tabnom_exit : ', wMMSCFD_tabnom_exit?.filter((f:any) => f?.nomination_point === "IND-E"));
    // console.log('[RWC2] wMMSCFD_tabnom_exit : ', wMMSCFD_tabnom_exit?.filter((f:any) => f?.nomination_point === "RWC2"));
    const UlitAllfWeeklyMMSCFDOnce = this.fnALLNOMUutilizationWeekly(wMMSCFD_tabnom_exit, 'mmscf', areaData, null, nomData, W_EW_OBJ)
    console.log('[IND-E] UlitAllfWeeklyMMSCFDOnce : ', UlitAllfWeeklyMMSCFDOnce?.filter((f:any) => f?.nomination_point === "IND-E"));
    // console.log('[RWC2] UlitAllfWeeklyMMSCFDOnce : ', UlitAllfWeeklyMMSCFDOnce?.filter((f:any) => f?.nomination_point === "RWC2"));
    // console.log('____UlitAllfWeeklyMMSCFDOnce : ', UlitAllfWeeklyMMSCFDOnce);
    const nominationWeeklyMMSCFD = _.orderBy(
      // wMMSCFD_tabnom_exit?.map((e: any) => {
      UlitAllfWeeklyMMSCFDOnce?.map((e: any) => {
        e['utilization'] = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
        return e
      }),
      ['nomination_point'],
      ['desc']
    )?.map((e: any) => {
      const {arrNom, _arrNom, nomination_row_json, nomination_full_json, ...nE} = e
      return {...nE}
    })
    
    const UlitwMMBTUD_ = this.fnALLNOMUutilizationWeekly(wMMBTUD_, 'mmbtu', areaData, wMMSCFD_tabnom_exit, nomData, W_EW_OBJ)
    // # ปรับ ดึง HV จาก MMSCF wMMSCFD_tabnom_exit
    const nominationWeeklyMMBTUD = _.orderBy(
      // wMMBTUD_?.map((e: any) => {
      UlitwMMBTUD_?.map((e: any) => {
        e['utilization'] = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
        return e
      }),
      ['nomination_point'],
      ['desc']
    )?.map((e: any) => {
      const {arrNom, _arrNom, nomination_row_json, nomination_full_json, ...nE} = e
      return {...nE, customerType: e?.nomination_row_json?.data_temp?.["6"] || null}
    })
    // const UlitAllfDWallMMSCFDOnce_ = this.fnALLNOMUutilizationWeekly(UlitAllfDWallMMSCFDOnce, 'mmscf', areaData, wMMSCFD_tabnom_exit, nomData, W_EW_OBJ)
    // const UlitAllfWeeklyMMSCFDOnce = this.fnALLNOMUutilizationWeekly(wMMSCFD_tabnom_exit, 'mmscf', areaData, null, nomData, W_EW_OBJ)
    // console.log('[SBK_CC4] UlitAllfWeeklyMMSCFDOnce : ', UlitAllfWeeklyMMSCFDOnce?.filter((f:any) => f?.nomination_point === "SBK_CC4"));
    const nominationAllMMSCFD = _.orderBy(
      UlitAllfDWallMMSCFDOnce?.map((e: any) => {
        const util_ = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
        e['utilization'] = util_ !== null && util_ !== '' ? this.roundTo2(util_) : util_
        return e
      }),
      ['nomination_point'],
      ['desc']
    )?.map((e: any) => {
      const {arrNom, _arrNom, nomination_row_json, nomination_full_json, ...nE} = e
      return {...nE, customerType: e?.nomination_row_json?.data_temp?.["6"] || null}
    })
    // console.log('[SBK_CC4] UlitAllfDWallMMSCFDOnce : ', UlitAllfDWallMMSCFDOnce?.filter((f:any) => f?.nomination_point === "SBK_CC4"));
    const nominationAllMMSCFDAll = _.orderBy(
      UlitAllfDWallMMSCFDOnce?.map((e: any) => {
        const util_ = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
        e['utilization'] = util_ !== null && util_ !== '' ? this.roundTo2(util_) : util_
        return e
      }),
      ['nomination_point'],
      ['desc']
    )?.map((e: any) => {
      const {arrNom, _arrNom, nomination_row_json, nomination_full_json, ...nE} = e
      return {...nE, customerType: e?.nomination_row_json?.data_temp?.["6"] || null}
    })

    // this.roundTo2
    const nominationAllMMBTUD = _.orderBy(
      UlitAllfDWallMMBTUDOnce?.map((e: any) => {
        const util_ = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
        e['utilization'] = util_ !== null && util_ !== '' ? this.roundTo2(util_) : util_
        return e
      }),
      ['nomination_point'],
      ['desc']
    )?.map((e: any) => {
      const {arrNom, _arrNom, nomination_row_json, nomination_full_json, ...nE} = e
      return {...nE}
    })

    const areaDailyMMBTUD = dAreaFil?.map((e: any) => {
      e['utilization'] = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
      return e
    })
    const areaDailyImbalance = (sumresultdImbalance && [sumresultdImbalance]) || []
    const areaWeeklyMMBTUD = wAreaFil_?.map((e: any) => {
      e['utilization'] = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
      return e
    })
    const areaWeeklyImbalance = wImbalance_
    // this.roundTo2
    const areaAllMMBTUD = addfDWallArea?.map((e: any) => {
      const util_ = typeof e['utilization'] === 'string' ? parseToNumber(e['utilization']) : e['utilization']
      e['utilization'] = util_ !== null && util_ !== '' ? this.roundTo2(util_) : util_
      return e
    })
    console.log('[A1] areaAllMMBTUD : ', areaAllMMBTUD?.filter((f:any) => f?.area_text === "A1"));

    const areaAllImbalance = dfDWallImbalanceN

    console.timeEnd('sum G10')

    const fnOverTotalCal = (data_: any) => {
      return (data_ || []).filter((item: any) => {
        let find_validate = nomData?.find((nom_: any) => nom_?.nomination_point === item?.nomination_point)
        if (!find_validate?.maximum_capacity) return false
        let validate_total
        if (item?.units == "MMSCFD") { // MMSCF 
            validate_total = find_validate?.maximum_capacity
        } else { // MMBTU
            if(item?.zone_text === "EAST-WEST"){
                validate_total = item?.hv * find_validate?.maximum_capacity
            }else{
                validate_total = find_validate?.maximum_capacity * item?.hv
            }
        }
        let total_cap_validate = validate_total > item?.totalCap
        if(!total_cap_validate){
          return true
        }else{
          return false
        }
      })
    }


    const fnOverTotalCapNomiWeekly = (data_: any) => {
      return (data_ || []).filter((item: any) => {
        const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

        let find_validate = nomData?.find((nom_: any) => nom_?.nomination_point === item?.nomination_point)
        if (!find_validate?.maximum_capacity) return false
        // let validate_total
        if (item?.units == "MMSCFD") { // MMSCF 
            // validate_total = find_validate?.maximum_capacity

            let validate_total_sunday = find_validate?.maximum_capacity
            let validate_total_monday = find_validate?.maximum_capacity
            let validate_total_tuesday = find_validate?.maximum_capacity
            let validate_total_wednesday = find_validate?.maximum_capacity
            let validate_total_thursday = find_validate?.maximum_capacity
            let validate_total_friday = find_validate?.maximum_capacity
            let validate_total_saturday = find_validate?.maximum_capacity
            if(
              (item?.sunday > validate_total_sunday) ||
              (item?.monday > validate_total_monday) ||
              (item?.tuesday > validate_total_tuesday) ||
              (item?.wednesday > validate_total_wednesday) ||
              (item?.thursday > validate_total_thursday) ||
              (item?.friday > validate_total_friday) ||
              (item?.saturday > validate_total_saturday)
            ){
              return true
            }else{
              return false
            }
        } else { // MMBTU
            if(item?.zone_text === "EAST-WEST"){
                let validate_total_sunday = find_validate?.maximum_capacity * item?.sunday_hv
                let validate_total_monday = find_validate?.maximum_capacity * item?.monday_hv
                let validate_total_tuesday = find_validate?.maximum_capacity * item?.tuesday_hv
                let validate_total_wednesday = find_validate?.maximum_capacity * item?.wednesday_hv
                let validate_total_thursday = find_validate?.maximum_capacity * item?.thursday_hv
                let validate_total_friday = find_validate?.maximum_capacity * item?.friday_hv
                let validate_total_saturday = find_validate?.maximum_capacity * item?.saturday_hv
                if(
                  (item?.sunday > validate_total_sunday) ||
                  (item?.monday > validate_total_monday) ||
                  (item?.tuesday > validate_total_tuesday) ||
                  (item?.wednesday > validate_total_wednesday) ||
                  (item?.thursday > validate_total_thursday) ||
                  (item?.friday > validate_total_friday) ||
                  (item?.saturday > validate_total_saturday)
                ){
                  return true
                }else{
                  return false
                }
              }else{
                let validate_total_sunday = find_validate?.maximum_capacity * item?.sunday_hv
                let validate_total_monday = find_validate?.maximum_capacity * item?.monday_hv
                let validate_total_tuesday = find_validate?.maximum_capacity * item?.tuesday_hv
                let validate_total_wednesday = find_validate?.maximum_capacity * item?.wednesday_hv
                let validate_total_thursday = find_validate?.maximum_capacity * item?.thursday_hv
                let validate_total_friday = find_validate?.maximum_capacity * item?.friday_hv
                let validate_total_saturday = find_validate?.maximum_capacity * item?.saturday_hv
                if(
                  (item?.sunday > validate_total_sunday) ||
                  (item?.monday > validate_total_monday) ||
                  (item?.tuesday > validate_total_tuesday) ||
                  (item?.wednesday > validate_total_wednesday) ||
                  (item?.thursday > validate_total_thursday) ||
                  (item?.friday > validate_total_friday) ||
                  (item?.saturday > validate_total_saturday)
                ){
                  return true
                }else{
                  return false
                }
            }
        }
       
      })
    }

    const areaMaster = await this.area({
      includeInactive: true
    })

    const fnOverTotalCapAreaWeekly = (data_: any[]) => {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

      const res_ov = (data_ || []).filter((item: any) => {
        const area_nom_cap = areaMaster?.find((area: any) => area?.name === item?.area_text)

        const limit = area_nom_cap?.area_nominal_capacity
        if (limit == null) return false
        const isOverAnyDay = days.some((d) => {
          const raw = item?.[d]
          const val =
            typeof raw === 'number'
              ? raw
              : parseFloat(
                  String(raw ?? '0')
                    .replace(/,/g, '')
                    .trim()
                ) || 0

          return val > limit
        })

        return isOverAnyDay
      })
      return res_ov
    }

    const fnOverTotalCapArea = (data_: any[]) => {
      const res_ov = (data_ || []).filter((item: any) => {
        const area_nom_cap = areaMaster?.find((area: any) => area?.name === item?.area_text)

        const limit = area_nom_cap?.area_nominal_capacity
        if (limit == null) return false
        const raw = item?.['totalCap']
        const val = typeof raw === 'number' ? raw : parseToNumber(raw) || 0
        const isOverAnyDay = val > limit

        return isOverAnyDay
      })

      return res_ov
    }

    // const groupedWTotalArray = [...wMMBTUD_, ...wMMSCFD_tabnom_exit?.filter((f: any) => f?.entry_exit_id === 1 && f?.unix === 'MMSCFD'), ...groupedWTotalArray_]?.map((e: any) => {
    // const groupedWTotalArray = [...nominationWeeklyMMBTUD, ...nominationWeeklyMMSCFD, ...groupedWTotalArray_]?.map((e: any) => {
    const groupedWTotalArray = [...nominationWeeklyMMBTUD, ...nominationWeeklyMMSCFD?.filter((f: any) => f?.entry_exit_id === 1 && f?.unix === 'MMSCFD'), ...groupedWTotalArray_]?.map((e: any) => {
          const {hv, wi, sg, ...nE} = e
          let hv_ = 0
          let wi_ = 0
          let sg_ = 0
    
                  //  "sunday",
                  // "monday",
                  // "tuesday",
                  // "wednesday",
                  // "thursday",
                  // "friday",
                  // "saturday",
    
    
    
    
    
          let Hv_calc = e ? this.w_fnHvCalc_nomtotal(e?.arrNom, null) : null // ถูก
          let Wi_calc = e ? this.w_fnWiCalc_nomtotal(e?.arrNom, null) : null // ถูก
          let Sg_calc = e ? this.w_fnSgCalc_nomtotal(e?.arrNom, null) : null // ถูก
          hv_ = Hv_calc
          wi_ = Wi_calc
          sg_ = Sg_calc
    
      
    
          return {
            ...nE,
            hv: hv_,
            wi: wi_,
            sg: sg_,
            units: e?.unix
          }
        })

        // RWC2
    // saturday
    console.log('[IND-E] nominationWeeklyMMSCFD : ', nominationWeeklyMMSCFD?.filter((f:any) => f?.nomination_point === "IND-E"));
    // 935.002
    // HV 1015.908

    console.log(`groupedATotalArray : `, groupedATotalArray);
    console.log(`[Min_Inventory_Change] groupedATotalArray : `, groupedATotalArray?.filter((f:any) => f?.parkUnparkInstructedFlows === "Min_Inventory_Change"));
    // console.log(`fnOverTotalCapNomiWeekly(nominationWeeklyMMSCFD) : `, fnOverTotalCapNomiWeekly(nominationWeeklyMMSCFD));
    // Min_Inventory_Change

    if (tab === 'all') {
      const dataType = {
        nomination: {
          daily: {
            MMSCFD: [],
            MMBTUD: []
          },
          weekly: {
            MMSCFD: [],
            MMBTUD: []
          },
          all: {
            MMSCFD: overTotalCap === 'true' ? fnOverTotalCal(nominationAllMMSCFDAll) : nominationAllMMSCFDAll,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCal(nominationAllMMBTUD) : nominationAllMMBTUD
          }
        },
        area: {
          daily: {
            MMBTUD: [],
            Imbalance: []
          },
          weekly: {
            MMBTUD: [],
            Imbalance: []
          },
          all: {
            // MMBTUD: areaAllMMBTUD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCapArea(areaAllMMBTUD) : areaAllMMBTUD,
            Imbalance: areaAllImbalance
          }
        },
        total: {
          daily: [],
          weekly: [],
          // all: groupedATotalArray?.map((e: any) => {
          all: (overTotalCap === 'true' ? fnOverTotalCal(groupedATotalArray) : groupedATotalArray)?.map((e: any) => {
            const {items, ...nE} = e
            return {
              ...nE
            }
          })
        }
      }

      return dataType
    } else if (tab === 'daily') {
      const dataType = {
        nomination: {
          daily: {
            MMSCFD: overTotalCap === 'true' ? fnOverTotalCal(nominationAllMMSCFD) : nominationAllMMSCFD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCal(nominationAllMMBTUD) : nominationAllMMBTUD
            // MMSCFD:
            //   overTotalCap === 'true'
            //     ? fnOverTotalCal(nominationDailyMMSCFD)
            //     : nominationDailyMMSCFD,
            // MMBTUD:
            //   overTotalCap === 'true'
            //     ? fnOverTotalCal(nominationDailyMMBTUD)
            //     : nominationDailyMMBTUD,
          },
          weekly: {
            MMSCFD: [],
            MMBTUD: []
          },
          all: {
            MMSCFD: [],
            MMBTUD: []
          }
        },
        area: {
          daily: {
            // MMBTUD: areaDailyMMBTUD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCapArea(areaAllMMBTUD) : areaAllMMBTUD,
            Imbalance: areaAllImbalance
            // MMBTUD:
            //   overTotalCap === 'true'
            //     ? fnOverTotalCapArea(areaDailyMMBTUD)
            //     : areaDailyMMBTUD,
            // Imbalance: areaDailyImbalance,
          },
          weekly: {
            MMBTUD: [],
            Imbalance: []
          },
          all: {
            MMBTUD: [],
            Imbalance: []
          }
        },
        total: {
          // daily: groupedDTotalArray?.map((e: any) => {
          daily: (overTotalCap === 'true' ? fnOverTotalCal(groupedATotalArray) : groupedATotalArray)?.map((e: any) => {
            const {items, ...nE} = e
            return {
              ...nE
            }
          }),
          weekly: [],
          all: []
        }
        // nomData: nomData,
      }
      return dataType
    } else if (tab === 'weekly') {
      const dataType = {
        nomination: {
          daily: {
            MMSCFD: [],
            MMBTUD: []
          },
          weekly: {
            MMSCFD: overTotalCap === 'true' ? fnOverTotalCapNomiWeekly(nominationWeeklyMMSCFD) : nominationWeeklyMMSCFD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCapNomiWeekly(nominationWeeklyMMBTUD) : nominationWeeklyMMBTUD
          },
          all: {
            MMSCFD: [],
            MMBTUD: []
          }
        },
        area: {
          daily: {
            MMBTUD: [],
            Imbalance: []
          },
          weekly: {
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCapAreaWeekly(areaWeeklyMMBTUD) : areaWeeklyMMBTUD,
            Imbalance: areaWeeklyImbalance
          },
          all: {
            MMBTUD: [],
            Imbalance: []
          }
        },
        total: {
          daily: [],
          weekly: (overTotalCap === 'true' ? fnOverTotalCapNomiWeekly(groupedWTotalArray) : groupedWTotalArray)?.map((e: any) => {
            const {items, ...nE} = e
            return {
              ...nE
            }
          }),
          all: []
        }
        // nomData: nomData,
      }
      console.log('dataType : ', dataType);
      return dataType
    } else {
      const dataType = {
        nomination: {
          daily: {
            MMSCFD: overTotalCap === 'true' ? fnOverTotalCal(nominationDailyMMSCFD) : nominationDailyMMSCFD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCal(nominationDailyMMBTUD) : nominationDailyMMBTUD
          },
          weekly: {
            MMSCFD: overTotalCap === 'true' ? fnOverTotalCapNomiWeekly(nominationWeeklyMMSCFD) : nominationWeeklyMMSCFD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCapNomiWeekly(nominationWeeklyMMBTUD) : nominationWeeklyMMBTUD
          },
          all: {
            MMSCFD: overTotalCap === 'true' ? fnOverTotalCal(nominationAllMMSCFD) : nominationAllMMSCFD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCal(nominationAllMMBTUD) : nominationAllMMBTUD
          }
        },
        area: {
          daily: {
            // MMBTUD: areaDailyMMBTUD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCapArea(areaDailyMMBTUD) : areaDailyMMBTUD,
            Imbalance: areaDailyImbalance
          },
          weekly: {
            // MMBTUD: areaWeeklyMMBTUD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCapArea(areaWeeklyMMBTUD) : areaWeeklyMMBTUD,
            Imbalance: areaWeeklyImbalance
          },
          all: {
            // MMBTUD: areaAllMMBTUD,
            MMBTUD: overTotalCap === 'true' ? fnOverTotalCapArea(areaAllMMBTUD) : areaAllMMBTUD,
            Imbalance: areaAllImbalance
          }
        },
        total: {
          daily: groupedDTotalArray?.map((e: any) => {
            const {items, ...nE} = e
            return {
              ...nE
            }
          }),
          weekly: groupedWTotalArray?.map((e: any) => {
            const {items, ...nE} = e
            return {
              ...nE
            }
          }),
          all: groupedATotalArray?.map((e: any) => {
            const {items, ...nE} = e
            return {
              ...nE
            }
          })
        }
        // nomData: nomData,
      }
      return dataType
    }
  }
}
// nomination_row_json