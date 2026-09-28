import {
  areaWithRelationsForCal,
  queryShipperNominationFilePopulateForCal,
  queryShipperNominationFileWithRelationsForCal
} from '@type/prisma.type'
import {
  getTodayEndDDMMYYYYAdd7,
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7,
  getTodayNowDDMMYYYYDfault,
  getTodayStartDDMMYYYYAdd7,
  getWeekRange,
  timeToMinutes
} from './date.util'
import {
  divideTo3Decimal,
  divideTo6Decimal,
  divideTo8Decimal,
  parseToNumber3Decimal,
  parseToNumber4Decimal,
  parseToNumber6Decimal
} from './number.util'

import * as dayjs from 'dayjs'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as timezone from 'dayjs/plugin/timezone'
import {isMatch} from './allocation.util'
import {PrismaService} from '@prisma/prisma.service'

dayjs.extend(timezone)
dayjs.extend(isSameOrAfter)

/**
 * อ่านค่าจาก JSON ของ nomination แล้วแปลงเป็นตัวเลขทศนิยม 3 ตำแหน่ง
 * @param nominationRowJsonDataTemp - ข้อมูล JSON ของ nomination_row_json
 * @param key - key ของคอลัมน์ที่ต้องการดึงค่า
 * @returns ค่าที่แปลงแล้วเป็น number (3 ทศนิยม) หรือ null ถ้าแปลงไม่ได้
 */
export function readNomFromJsonAs3Decimal(
  nominationRowJsonDataTemp: any,
  key: string
) {
  return parseToNumber3Decimal(
    nominationRowJsonDataTemp[
      key
    ]
  )
}

/**
 * อ่านค่าจาก JSON ของ nomination แล้วแปลงเป็นตัวเลขทศนิยม 4 ตำแหน่ง
 * @param nominationRowJsonDataTemp - ข้อมูล JSON ของ nomination_row_json
 * @param key - key ของคอลัมน์ที่ต้องการดึงค่า
 * @returns ค่าที่แปลงแล้วเป็น number (4 ทศนิยม) หรือ null ถ้าแปลงไม่ได้
 */
export function readNomFromJsonAs4Decimal(
  nominationRowJsonDataTemp: any,
  key: string
) {
  return parseToNumber4Decimal(
    nominationRowJsonDataTemp[
      key
    ]
  )
}

/**
 * อ่านค่าจาก JSON ของ nomination แล้วแปลงเป็นตัวเลขทศนิยม 6 ตำแหน่ง
 * @param nominationRowJsonDataTemp - ข้อมูล JSON ของ nomination_row_json
 * @param key - key ของคอลัมน์ที่ต้องการดึงค่า
 * @returns ค่าที่แปลงแล้วเป็น number (6 ทศนิยม) หรือ null ถ้าแปลงไม่ได้
 */
export function readNomFromJsonAs6Decimal(nominationRowJsonDataTemp: any, key: string) {
  return parseToNumber6Decimal(nominationRowJsonDataTemp[key])
}

function createBvw10Ra6ViAggregate(): bvw10Ra6ViAggregateType {
  const eachHour = new Map<number, { sumVi: number | null }>();
  for (let i = 0; i < 24; i++) {
    eachHour.set(i, { sumVi: null });
  }
  return { sumVi: null, eachHour };
}


const matchBvw10Ra6Point = (name: string, zone: string) =>
  (point: string) =>
    point.includes(name) && point.includes(zone);

function aggregateHistoryBvw10Ra6Vi(
  historyList: (adjustNomDataType & { nominationRowJsonDataTemp: any })[],
  pointFilter: (pointLower: string) => boolean,
  h1Key: number,
  dayOfWeek: number,
): bvw10Ra6ViAggregateType {
  return historyList
    .filter((item) => pointFilter(item.point.trim().toLowerCase()))
    .reduce((accumulator, currentValue) => {
      const vi = readNomFromJsonAs6Decimal(currentValue.nominationRowJsonDataTemp, currentValue.nomination_type_id == 2 ? `${h1Key + dayOfWeek}` : '38');
      if (vi != null) {
        if (accumulator.sumVi != null) {
          accumulator.sumVi = parseToNumber6Decimal(accumulator.sumVi + vi);
        } else {
          accumulator.sumVi = vi;
        }
      }

      const viEachHourUniform = (currentValue.nomination_type_id == 2) ? (vi == null ? null : vi / 24) : null;

      accumulator.eachHour.forEach((eachHourItem, key) => {
        const viEachHour = (viEachHourUniform != null)
            ? viEachHourUniform
            : readNomFromJsonAs6Decimal(currentValue.nominationRowJsonDataTemp, `${h1Key + key}`);
        if (viEachHour != null) {
          if (eachHourItem.sumVi != null) {
            eachHourItem.sumVi = parseToNumber6Decimal(eachHourItem.sumVi + viEachHour);
          } else {
            eachHourItem.sumVi = viEachHour;
          }
        }
      });

      return accumulator;
    }, createBvw10Ra6ViAggregate());
}

/**
 * คำนวณค่า Heating Value และค่าอื่น ๆ จาก Entry Area ของ nomination
 * @param prisma - PrismaService สำหรับดึงข้อมูลจากฐานข้อมูล
 * @param targetArea - ชื่อ Area ที่ต้องการคำนวณ
 * @param gasDate - วันที่ gas day ที่ต้องการคำนวณ
 * @param dataList - รายการ nomination ที่เตรียมมาแล้ว (ใช้ซ้ำเพื่อลดการ query)
 * @returns Map ที่เก็บผลรวม Vi, HV*Vi, SG*Vi ตามคู่ zone-area ของ Entry point
 */
export async function findHvFromEntryArea({ prisma, targetArea, gasDate, dataList }: { prisma: PrismaService; targetArea: string; gasDate: Date; dataList: queryShipperNominationFileWithRelationsForCal[] }) {
  // หาช่วงสัปดาห์ที่ครอบคลุมวันที่เริ่มต้นและสิ้นสุด (สำหรับดึงข้อมูล weekly nomination)
  const { weekStart: targetWeekStart } = getWeekRange(gasDate);
  const { weekEnd: targetWeekEnd } = getWeekRange(gasDate);
  const gasDayjs = dayjs(gasDate);
  const dayOfWeek = Number(dayjs(gasDate).tz('Asia/Bangkok').format('d')); // วันในสัปดาห์ (0 = Sunday, 6 = Saturday)

  let targetDataList = dataList;
  // ดึงข้อมูล nomination files ทั้งแบบรายวัน (type 1) และรายสัปดาห์ (type 2)
  if (dataList.length == 0) {
    const nominationData: queryShipperNominationFileWithRelationsForCal[] = await prisma.query_shipper_nomination_file.findMany({
      where: {
        // NOT: {
        //   contract_code_id: null,
        // }, // revers bal ไม่แสดง effect
        AND: [
          {
            OR: [
              {
                // nomination รายวัน (type 1) ที่อยู่ในช่วงวันที่ที่เลือก
                nomination_type: { id: 1 },
                gas_day: gasDate,
              },
              {
                // nomination รายสัปดาห์ (type 2) ที่อยู่ในช่วงสัปดาห์ที่ครอบคลุมวันที่เลือก
                nomination_type: { id: 2 },
                gas_day: {
                  gte: targetWeekStart,
                  lte: targetWeekEnd,
                },
              },
            ],
          },
          // เฉพาะรายการที่ไม่ถูกลบ
          {
            OR: [
              {
                del_flag: false,
              },
              {
                del_flag: null,
              },
            ],
          },
          // เฉพาะ status 2 (Approved) และ 5 (Approved by System)
          {
            query_shipper_nomination_status: {
              id: {
                in: [2, 5],
              },
            },
          },
        ],
      },
      ...queryShipperNominationFilePopulateForCal,
      orderBy: [
        {
          nomination_type_id: 'asc',
        },
        { id: 'desc' },
      ],
    });

    // // กรอง nomination แบบรายวันสำหรับวันที่กำลังประมวลผล
    // const dailyNominationList = nominationData.filter(
    //   nominationFile =>
    //     nominationFile.nomination_type_id == 1
    // );

    // // กรอง nomination แบบรายสัปดาห์สำหรับสัปดาห์ที่กำลังประมวลผล
    // // ข้ามถ้ามี daily nomination สำหรับ contract เดียวกันแล้ว (daily nomination มีลำดับความสำคัญสูงกว่า)
    // const weeklyNominationList = nominationData.filter(
    //   nominationFile =>
    //     nominationFile.nomination_type_id == 2
    //     && !dailyNominationList.some(daily => daily.contract_code_id == nominationFile.contract_code_id)
    // );

    // targetDataList = [...dailyNominationList, ...weeklyNominationList];

    targetDataList = nominationData;
  }

  const areaMaster: areaWithRelationsForCal[] = await prisma.area.findMany({
    where: {
      ...(
        targetArea ?
        {
          name: {
            equals: targetArea,
            mode: 'insensitive'
          }
        } :
        {
          zone: {
            name: {
              equals: 'EAST-WEST',
              mode: 'insensitive'
            }
          }
        }
      ),
      AND: [
        {
          start_date: {
            lte: targetWeekEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
        },
        {
          OR: [
            {
              end_date: null,
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gte: targetWeekStart,
              },
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
          ],
        },
      ],
    },
    include: {
      zone: {
        select: {
          id: true,
          name: true,
        },
      },
      entry_exit: {
        select: {
          id: true,
          name: true,
        },
      },
      supply_reference_quality_area_by: {
        select: {
          id: true,
          name: true,
          start_date: true,
          end_date: true,
        },
      },
      owner_area: {
        include: {
          east_area: {
            select: {
              id: true,
              name: true,
              start_date: true,
              end_date: true,
            }
          },
          west_area: {
            select: {
              id: true,
              name: true,
              start_date: true,
              end_date: true,
            }
          }
        }
      },
    },
    orderBy: {
      id: 'desc',
    },
  });
  const bvw10AndRa6List = await prisma.concept_point.findMany({
    where: {
      OR: [
        {
          concept_point: {
            contains: 'BVW10',
            mode: 'insensitive'
          }
        },
        {
          concept_point: {
            contains: 'RA6',
            mode: 'insensitive'
          }
        }
      ],
      type_concept_point_id: 2 // Nomination Physical gas concepts
    }
  })
  
  let eastWestList: any[] = [];
  const historyBvw10AndRa6List: (adjustNomDataType & {
    nominationRowJsonDataTemp: any;
  })[] = [];

  const historyList: adjustNomDataType[] = [];
  const result = new Map<
    string,
    areaHvDataType
  >();

  const h1Key = 14;
  targetDataList.map((nominationFile) => {
    nominationFile.nomination_version.map((nominationVersion) => {
      nominationVersion.nomination_row_json.map((nominationRowJson) => {
        // แปลง JSON string เป็น object
        const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp);

        // อ่านข้อมูลจาก JSON ตามตำแหน่งที่กำหนด
        const zone = nominationRowJsonDataTemp['0'];
        const area = nominationRowJsonDataTemp['2'];
        const point = nominationRowJsonDataTemp['3'];
        const unit = nominationRowJsonDataTemp['9'];
        const entryExit = nominationRowJsonDataTemp['10'];
        const wi = parseToNumber6Decimal(nominationRowJsonDataTemp['11']);
        const hv = parseToNumber6Decimal(nominationRowJsonDataTemp['12']);
        const sg = parseToNumber6Decimal(nominationRowJsonDataTemp['13']);

        // zone East-West มีวิธีคิดแยกต่างหาก
        if(isMatch(zone, 'EAST-WEST')){
          if(!eastWestList.some((item: any) => isMatch(item.zone, zone) && isMatch(item.area, area) && isMatch(item.point, point) && isMatch(item.entryExit, entryExit))){
            eastWestList.push({
              zone: zone,
              area: area,
              point: point,
              entryExit: entryExit,
              hv: hv,
              sg: sg,
            });
          }
        }

        if(bvw10AndRa6List.some(conceptPoint => isMatch(conceptPoint.concept_point, point)) && (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H'))){
          if (
            nominationFile.nomination_type_id == 2 &&
            historyBvw10AndRa6List.some((f) => {
              return (
                f?.point === point &&
                f?.zone_text === nominationRowJson.zone_text &&
                f?.area_text === nominationRowJson.area_text &&
                f?.entryExit === entryExit &&
                f?.gas_day === gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
                f?.shipper_id_name === nominationFile.group?.id_name &&
                f?.contract_code_id === nominationFile.contract_code_id &&
                f?.totalType === 'daily' &&
                f?.nomination_type_id === 1
              );
            })
          ) {
            return;
          }
          else{
            historyBvw10AndRa6List.push({
              gas_day: gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY'),
              group_id: nominationFile.group_id,
              shipper_name: nominationFile.group?.name,
              shipper_id_name: nominationFile.group?.id_name,
              contract: nominationFile.contract_code?.contract_code || nominationFile.reserve_balancing_gas_contract?.res_bal_gas_contract,
              contract_code_id: nominationFile.contract_code_id,
              reserve_balancing_gas_contract_id: nominationFile.reserve_balancing_gas_contract_id,
              nomination_id: nominationFile.id,
              nomination_code: nominationFile.nomination_code,
              zone_text: nominationRowJson.zone_text,
              area_text: nominationRowJson.area_text,
              // "unit": unit,
              point: point,
              entryExit: entryExit,
              total: 0,
              totalMmscfd: null,
              totalType: nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
              nomination_type_id: nominationFile.nomination_type_id,
              timeShow: [],
              nominationRowJsonDataTemp: nominationRowJsonDataTemp,
            });
          }
        }

        // ข้ามถ้าไม่มีข้อมูล zone, area (ต้องเป็น nomination point)
        // ข้ามถ้าไม่ใช่ entry (ต้องเป็น entry)
        if (!zone || !area || (targetArea && !isMatch(area, targetArea)) || !isMatch(entryExit, 'Entry') || !isMatch(unit, 'MMSCFD')) {
          return;
        }
        if (
          nominationFile.nomination_type_id == 2 &&
          historyList.some((f) => {
            return (
              f?.point === point &&
              f?.zone_text === nominationRowJson.zone_text &&
              f?.area_text === nominationRowJson.area_text &&
              f?.entryExit === entryExit &&
              f?.gas_day === gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
              f?.shipper_id_name === nominationFile.group?.id_name &&
              f?.contract_code_id === nominationFile.contract_code_id &&
              f?.totalType === 'daily' &&
              f?.nomination_type_id === 1
            );
          })
        ) {
          return;
        } else {
          // หาว่ามี point นี้ใน historyList แล้วหรือยัง (เช็คตาม point, zone, area, entryExit, gas_day, group, contract, nomination)
          let existPointIndex = historyList.findIndex((f: any) => {
            return (
              f?.point === point &&
              f?.zone_text === nominationRowJson.zone_text &&
              f?.area_text === nominationRowJson.area_text &&
              f?.entryExit === entryExit &&
              f?.gas_day === gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
              f?.group_id === nominationFile.group_id &&
              f?.contract_code_id === nominationFile.contract_code_id &&
              f?.nomination_id === nominationFile.id
            );
          });

          // ถ้ายังไม่มี point นี้ใน result ให้สร้างใหม่
          if (existPointIndex < 0) {
            historyList.push({
              gas_day: gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY'),
              group_id: nominationFile.group_id,
              shipper_name: nominationFile.group?.name,
              shipper_id_name: nominationFile.group?.id_name,
              contract: nominationFile.contract_code?.contract_code || nominationFile.reserve_balancing_gas_contract?.res_bal_gas_contract,
              contract_code_id: nominationFile.contract_code_id,
              reserve_balancing_gas_contract_id: nominationFile.reserve_balancing_gas_contract_id,
              nomination_id: nominationFile.id,
              nomination_code: nominationFile.nomination_code,
              zone_text: nominationRowJson.zone_text,
              area_text: nominationRowJson.area_text,
              // "unit": unit,
              point: point,
              entryExit: entryExit,
              total: 0,
              totalMmscfd: null,
              totalType: nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
              nomination_type_id: nominationFile.nomination_type_id,
              timeShow: [],
            });
          }
        }

        // ดึงค่าตามวันในสัปดาห์ (Sunday = 0, Monday = 1, ..., Saturday = 6)
        const vi = readNomFromJsonAs6Decimal(nominationRowJsonDataTemp, nominationFile.nomination_type_id == 2 ? `${h1Key + dayOfWeek}` : '38');

        const key = `${`${zone}`.trim().toLowerCase()}-${`${area}`.trim().toLowerCase()}`;

        if (result.has(key)) {
          const exist = result.get(key);
          if (exist.sumVi != null) {
            if (vi != null) {
              exist.sumVi = parseToNumber6Decimal(exist.sumVi + vi);
            }
          } else {
            exist.sumVi = vi;
          }

          if (exist.sumHvMultiplyVi != null) {
            if (hv != null || vi != null) {
              exist.sumHvMultiplyVi = parseToNumber6Decimal(exist.sumHvMultiplyVi + parseToNumber6Decimal((hv ?? 0) * (vi ?? 0)));
            }
          } else {
            exist.sumHvMultiplyVi = (hv == null && vi == null) ? null : parseToNumber6Decimal((hv ?? 0) * (vi ?? 0));
          }

          if (exist.sumSgMultiplyVi != null) {
            if (sg != null || vi != null) {
              exist.sumSgMultiplyVi = parseToNumber6Decimal(exist.sumSgMultiplyVi + parseToNumber6Decimal((sg ?? 0) * (vi ?? 0)));
            }
          } else {
            exist.sumSgMultiplyVi = (sg == null && vi == null) ? null : parseToNumber6Decimal((sg ?? 0) * (vi ?? 0));
          }

          exist.eachHour?.forEach((eachHourItem, key) => {
            const viEachHour = nominationFile.nomination_type_id == 2 ? (vi == null ? null : divideTo6Decimal(vi, 24)) : readNomFromJsonAs6Decimal(nominationRowJsonDataTemp, `${h1Key + key}`);

            if (eachHourItem.sumVi != null) {
              if (viEachHour != null) {
                eachHourItem.sumVi = parseToNumber6Decimal(eachHourItem.sumVi + viEachHour);
              }
            } else {
              eachHourItem.sumVi = viEachHour;
            }

            if (eachHourItem.sumHvMultiplyVi != null) {
              if (hv != null || viEachHour != null) {
                eachHourItem.sumHvMultiplyVi = parseToNumber6Decimal(eachHourItem.sumHvMultiplyVi + parseToNumber6Decimal((hv ?? 0) * (viEachHour ?? 0)));
              }
            } else {
              eachHourItem.sumHvMultiplyVi = (hv == null && viEachHour == null) ? null : parseToNumber6Decimal((hv ?? 0) * (viEachHour ?? 0));
            }

            if (eachHourItem.sumSgMultiplyVi != null) {
              if (sg != null || viEachHour != null) {
                eachHourItem.sumSgMultiplyVi = parseToNumber6Decimal(eachHourItem.sumSgMultiplyVi + parseToNumber6Decimal((sg ?? 0) * (viEachHour ?? 0)));
              }
            } else {
              eachHourItem.sumSgMultiplyVi = (sg == null && viEachHour == null) ? null : parseToNumber6Decimal((sg ?? 0) * (viEachHour ?? 0));
            }
          });

          result.set(key, exist);
        } else {
          const eachHour = new Map<number, { sumVi: number | null, sumHvMultiplyVi: number | null, sumSgMultiplyVi: number | null }>();
          if(nominationFile.nomination_type_id == 2){
            const viEachHour = vi == null ? null : divideTo6Decimal(vi, 24);
            for (let i = 0; i < 24; i++) {
              eachHour.set(i, {
                sumVi: viEachHour,
                sumHvMultiplyVi: (hv == null && viEachHour == null) ? null : parseToNumber6Decimal((hv ?? 0) * (viEachHour ?? 0)),
                sumSgMultiplyVi: (sg == null && viEachHour == null) ? null : parseToNumber6Decimal((sg ?? 0) * (viEachHour ?? 0)),
              });
            }
          }
          else{
            for (let i = 0; i < 24; i++) {
              const viEachHour = readNomFromJsonAs6Decimal(nominationRowJsonDataTemp, `${h1Key + i}`);
              eachHour.set(i, {
                sumVi: viEachHour,
                sumHvMultiplyVi: (hv == null && viEachHour == null) ? null : parseToNumber6Decimal((hv ?? 0) * (viEachHour ?? 0)),
                sumSgMultiplyVi: (sg == null && viEachHour == null) ? null : parseToNumber6Decimal((sg ?? 0) * (viEachHour ?? 0)),
              });
            }
          }

          result.set(key, {
            zone_text: zone,
            area_text: area,
            entryExit: entryExit,
            sumVi: vi,
            sumHvMultiplyVi: (hv == null && vi == null) ? null : parseToNumber6Decimal((hv ?? 0) * (vi ?? 0)),
            sumSgMultiplyVi: (sg == null && vi == null) ? null : parseToNumber6Decimal((sg ?? 0) * (vi ?? 0)),
            eachHour: eachHour,
          });
        }
      });
    });
  });

  // zone East-West มีวิธีคิดแยกต่างหาก
  if(eastWestList.length > 0){
    try {
      const eastToBvw10Value = aggregateHistoryBvw10Ra6Vi(
        historyBvw10AndRa6List,
        matchBvw10Ra6Point('bvw10', 'east'),
        h1Key,
        dayOfWeek,
      );
      const westToBvw10Value = aggregateHistoryBvw10Ra6Vi(
        historyBvw10AndRa6List,
        matchBvw10Ra6Point('bvw10', 'west'),
        h1Key,
        dayOfWeek,
      );
      const eastToRa6Value = aggregateHistoryBvw10Ra6Vi(
        historyBvw10AndRa6List,
        matchBvw10Ra6Point('ra6', 'east'),
        h1Key,
        dayOfWeek,
      );
      const westToRa6Value = aggregateHistoryBvw10Ra6Vi(
        historyBvw10AndRa6List,
        matchBvw10Ra6Point('ra6', 'west'),
        h1Key,
        dayOfWeek,
      );
  
      eastWestList.sort((a: any, b: any) => {
        const aIsE = isMatch(a.area, 'e');
        const bIsE = isMatch(b.area, 'e');
        if (aIsE && !bIsE) return 1;
        if (!aIsE && bIsE) return -1;
        return a.area.localeCompare(b.area);
      });
  
      eastWestList.map((item: any) => {
        const zone = item.zone;
        const area = item.area;
        // const point = item.point;
        const entryExit = item.entryExit;
        // const hv = item.hv;
        // const sg = item.sg;
  
        const areaEastList = areaMaster.find((areaObj: any) => isMatch(areaObj.name, area) && isMatch(areaObj.zone.name, zone) && isMatch(areaObj.entry_exit.name, entryExit))?.owner_area?.map(ownerArea => ownerArea.east_area);
        const areaWestList = areaMaster.find((areaObj: any) => isMatch(areaObj.name, area) && isMatch(areaObj.zone.name, zone) && isMatch(areaObj.entry_exit.name, entryExit))?.owner_area?.map(ownerArea => ownerArea.west_area);
        // HV_F2 = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
        // HV_G = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
        // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
        let eastData : areaHvDataType | null = null;
        (areaEastList || []).map(areaEast => {
          const key = `east-${`${areaEast.name}`.trim().toLowerCase()}`;
          const exist = result.get(key);
          if(eastData){
            const vi = exist.sumVi
            const sumHvMultiplyVi = exist.sumHvMultiplyVi
            const sumSgMultiplyVi = exist.sumSgMultiplyVi
            const eachHour = exist.eachHour
            if (eastData.sumVi != null) {
              if (vi != null) {
                eastData.sumVi = parseToNumber6Decimal(eastData.sumVi + vi);
              }
            } else {
              eastData.sumVi = exist.sumVi;
            }

            if (eastData.sumHvMultiplyVi != null) {
              if (sumHvMultiplyVi != null) {
                eastData.sumHvMultiplyVi = parseToNumber6Decimal(eastData.sumHvMultiplyVi + sumHvMultiplyVi);
              }
            } else {
              eastData.sumHvMultiplyVi = sumHvMultiplyVi;
            }

            if (eastData.sumSgMultiplyVi != null) {
              if (sumSgMultiplyVi != null) {
                eastData.sumSgMultiplyVi = parseToNumber6Decimal(eastData.sumSgMultiplyVi + sumSgMultiplyVi);
              }
            } else {
              eastData.sumSgMultiplyVi = sumSgMultiplyVi;
            }

            eastData.eachHour?.forEach((eachHourItem, key) => {
              const viEachHour = eachHour.get(key)?.sumVi
              const sumHvMultiplyViEachHour = eachHour.get(key)?.sumHvMultiplyVi
              const sumSgMultiplyViEachHour = eachHour.get(key)?.sumSgMultiplyVi

              if (eachHourItem.sumVi != null) {
                if (viEachHour != null) {
                  eachHourItem.sumVi = parseToNumber6Decimal(eachHourItem.sumVi + viEachHour);
                }
              } else {
                eachHourItem.sumVi = viEachHour;
              }

              if (eachHourItem.sumHvMultiplyVi != null) {
                if (sumHvMultiplyViEachHour != null) {
                  eachHourItem.sumHvMultiplyVi = parseToNumber6Decimal(eachHourItem.sumHvMultiplyVi + sumHvMultiplyViEachHour);
                }
              } else {
                eachHourItem.sumHvMultiplyVi = sumHvMultiplyViEachHour;
              }

              if (eachHourItem.sumSgMultiplyVi != null) {
                if (sumSgMultiplyViEachHour != null) {
                  eachHourItem.sumSgMultiplyVi = parseToNumber6Decimal(eachHourItem.sumSgMultiplyVi + sumSgMultiplyViEachHour);
                }
              } else {
                eachHourItem.sumSgMultiplyVi = sumSgMultiplyViEachHour;
              }
            });
          }
          else{
            eastData = exist
          }
        })

        switch(area.toLowerCase()){
          case 'e': {
            const westData = result.get('east-west-f2')

            const eastHv = (eastData?.sumHvMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumHvMultiplyVi / eastData?.sumVi);
            const westHv = (westData?.sumHvMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumHvMultiplyVi / westData?.sumVi);
            const eastSg = (eastData?.sumSgMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumSgMultiplyVi / eastData?.sumVi);
            const westSg = (westData?.sumSgMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumSgMultiplyVi / westData?.sumVi);
            const sumVi = (eastToRa6Value.sumVi == null && westToRa6Value.sumVi == null) ? null : parseToNumber6Decimal((eastToRa6Value.sumVi || 0) + (westToRa6Value.sumVi || 0));
            const sumHvMultiplyVi = (
              (eastHv == null && eastToRa6Value.sumVi == null) || 
              (westHv == null && westToRa6Value.sumVi == null)
            ) ? null
            : parseToNumber6Decimal(((eastToRa6Value.sumVi || 0) * (eastHv || 0)) + ((westToRa6Value.sumVi || 0) * (westHv || 0)));
  
            const sumSgMultiplyVi = (
              (eastSg == null && eastToRa6Value.sumVi == null) || 
              (westSg == null && westToRa6Value.sumVi == null)
            ) ? null
            : parseToNumber6Decimal(((eastToRa6Value.sumVi || 0) * (eastSg || 0)) + ((westToRa6Value.sumVi || 0) * (westSg || 0)));


            const eachHour = new Map<number, { sumVi: number | null, sumHvMultiplyVi: number | null, sumSgMultiplyVi: number | null }>();
            for (let i = 0; i < 24; i++) {
              const eastEachHour = eastData?.eachHour?.get(i);
              const westEachHour = westData?.eachHour?.get(i);
              const eastToRa6EachHour = eastToRa6Value.eachHour?.get(i);
              const westToRa6EachHour = westToRa6Value.eachHour?.get(i);
              const eastHvEachHour = (eastEachHour?.sumHvMultiplyVi == null || eastEachHour?.sumVi == null) ? null : (eastEachHour?.sumHvMultiplyVi / eastEachHour?.sumVi);
              const westHvEachHour = (westEachHour?.sumHvMultiplyVi == null || westEachHour?.sumVi == null) ? null : (westEachHour?.sumHvMultiplyVi / westEachHour?.sumVi);
              const eastSgEachHour = (eastEachHour?.sumSgMultiplyVi == null || eastEachHour?.sumVi == null) ? null : (eastEachHour?.sumSgMultiplyVi / eastEachHour?.sumVi);
              const westSgEachHour = (westEachHour?.sumSgMultiplyVi == null || westEachHour?.sumVi == null) ? null : (westEachHour?.sumSgMultiplyVi / westEachHour?.sumVi);
              const sumViEachHour = (eastToRa6EachHour?.sumVi == null && westToRa6EachHour?.sumVi == null) ? null : parseToNumber6Decimal((eastToRa6EachHour?.sumVi || 0) + (westToRa6EachHour?.sumVi || 0));
              const sumHvMultiplyViEachHour = (
                (eastHvEachHour == null && eastToRa6EachHour?.sumVi == null) || 
                (westHvEachHour == null && westToRa6EachHour?.sumVi == null)
              ) ? null
              : parseToNumber6Decimal(((eastToRa6EachHour?.sumVi || 0) * (eastHvEachHour || 0)) + ((westToRa6EachHour?.sumVi || 0) * (westHvEachHour || 0)));
    
              const sumSgMultiplyViEachHour = (
                (eastSgEachHour == null && eastToRa6EachHour?.sumVi == null) || 
                (westSgEachHour == null && westToRa6EachHour?.sumVi == null)
              ) ? null
              : parseToNumber6Decimal(((eastToRa6EachHour?.sumVi || 0) * (eastSgEachHour || 0)) + ((westToRa6EachHour?.sumVi || 0) * (westSgEachHour || 0)));
              eachHour.set(i, {
                sumVi: sumViEachHour,
                sumHvMultiplyVi: sumHvMultiplyViEachHour,
                sumSgMultiplyVi: sumSgMultiplyViEachHour,
              });
            }
  
            const key = `${`${zone}`.trim().toLowerCase()}-${`${area}`.trim().toLowerCase()}`;
            result.set(key, {
              zone_text: zone,
              area_text: area,
              entryExit: entryExit,
              sumVi: sumVi,
              sumHvMultiplyVi: sumHvMultiplyVi,
              sumSgMultiplyVi: sumSgMultiplyVi,
              eachHour: eachHour,
            });

            break;
          }
          default:
            let westData : areaHvDataType | null = null;
            (areaWestList || []).map(areaWest => {
              const key = `west-${`${areaWest.name}`.trim().toLowerCase()}`;
              const exist = result.get(key);
              if(westData){
                const vi = exist.sumVi
                const sumHvMultiplyVi = exist.sumHvMultiplyVi
                const sumSgMultiplyVi = exist.sumSgMultiplyVi
                const eachHour = exist.eachHour
                if (westData.sumVi != null) {
                  if (vi != null) {
                    westData.sumVi = parseToNumber6Decimal(westData.sumVi + vi);
                  }
                } else {
                  westData.sumVi = exist.sumVi;
                }
                
                if (westData.sumHvMultiplyVi != null) {
                  if (sumHvMultiplyVi != null) {
                    westData.sumHvMultiplyVi = parseToNumber6Decimal(westData.sumHvMultiplyVi + sumHvMultiplyVi);
                  }
                } else {
                  westData.sumHvMultiplyVi = sumHvMultiplyVi;
                }
                
                if (westData.sumSgMultiplyVi != null) {
                  if (sumSgMultiplyVi != null) {
                    westData.sumSgMultiplyVi = parseToNumber6Decimal(westData.sumSgMultiplyVi + sumSgMultiplyVi);
                  }
                } else {
                  westData.sumSgMultiplyVi = sumSgMultiplyVi;
                }
                
                westData.eachHour?.forEach((eachHourItem, key) => {
                  const viEachHour = eachHour.get(key)?.sumVi
                  const sumHvMultiplyViEachHour = eachHour.get(key)?.sumHvMultiplyVi
                  const sumSgMultiplyViEachHour = eachHour.get(key)?.sumSgMultiplyVi
  
                  if (eachHourItem.sumVi != null) {
                    if (viEachHour != null) {
                      eachHourItem.sumVi = parseToNumber6Decimal(eachHourItem.sumVi + viEachHour);
                    }
                  } else {
                    eachHourItem.sumVi = viEachHour;
                  }
  
                  if (eachHourItem.sumHvMultiplyVi != null) {
                    if (sumHvMultiplyViEachHour != null) {
                      eachHourItem.sumHvMultiplyVi = parseToNumber6Decimal(eachHourItem.sumHvMultiplyVi + sumHvMultiplyViEachHour);
                    }
                  } else {
                    eachHourItem.sumHvMultiplyVi = sumHvMultiplyViEachHour;
                  }
  
                  if (eachHourItem.sumSgMultiplyVi != null) {
                    if (sumSgMultiplyViEachHour != null) {
                      eachHourItem.sumSgMultiplyVi = parseToNumber6Decimal(eachHourItem.sumSgMultiplyVi + sumSgMultiplyViEachHour);
                    }
                  } else {
                    eachHourItem.sumSgMultiplyVi = sumSgMultiplyViEachHour;
                  }
                });
              }
              else{
                westData = exist
              }
            })
  
            const eastHv = (eastData?.sumHvMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumHvMultiplyVi / eastData?.sumVi);
            const westHv = (westData?.sumHvMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumHvMultiplyVi / westData?.sumVi);
            const eastSg = (eastData?.sumSgMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumSgMultiplyVi / eastData?.sumVi);
            const westSg = (westData?.sumSgMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumSgMultiplyVi / westData?.sumVi);
            const sumVi = (eastToBvw10Value.sumVi == null && westToBvw10Value.sumVi == null) ? null : parseToNumber6Decimal((eastToBvw10Value.sumVi || 0) + (westToBvw10Value.sumVi || 0));
            const sumHvMultiplyVi = (
              (eastHv == null && eastToBvw10Value.sumVi == null) || 
              (westHv == null && westToBvw10Value.sumVi == null)
            ) ? null
            : parseToNumber6Decimal(((eastToBvw10Value.sumVi || 0) * (eastHv || 0)) + ((westToBvw10Value.sumVi || 0) * (westHv || 0)));
  
            const sumSgMultiplyVi = (
              (eastSg == null && eastToBvw10Value.sumVi == null) || 
              (westSg == null && westToBvw10Value.sumVi == null)
            ) ? null
            : parseToNumber6Decimal(((eastToBvw10Value.sumVi || 0) * (eastSg || 0)) + ((westToBvw10Value.sumVi || 0) * (westSg || 0)));


            const eachHour = new Map<number, { sumVi: number | null, sumHvMultiplyVi: number | null, sumSgMultiplyVi: number | null }>();
            for (let i = 0; i < 24; i++) {
              const eastEachHour = eastData?.eachHour?.get(i);
              const westEachHour = westData?.eachHour?.get(i);
              const eastToBvw10EachHour = eastToBvw10Value.eachHour?.get(i);
              const westToBvw10EachHour = westToBvw10Value.eachHour?.get(i);
              const eastHvEachHour = (eastEachHour?.sumHvMultiplyVi == null || eastEachHour?.sumVi == null) ? null : (eastEachHour?.sumHvMultiplyVi / eastEachHour?.sumVi);
              const westHvEachHour = (westEachHour?.sumHvMultiplyVi == null || westEachHour?.sumVi == null) ? null : (westEachHour?.sumHvMultiplyVi / westEachHour?.sumVi);
              const eastSgEachHour = (eastEachHour?.sumSgMultiplyVi == null || eastEachHour?.sumVi == null) ? null : (eastEachHour?.sumSgMultiplyVi / eastEachHour?.sumVi);
              const westSgEachHour = (westEachHour?.sumSgMultiplyVi == null || westEachHour?.sumVi == null) ? null : (westEachHour?.sumSgMultiplyVi / westEachHour?.sumVi);
              const sumViEachHour = (eastToBvw10EachHour?.sumVi == null && westToBvw10EachHour?.sumVi == null) ? null : parseToNumber6Decimal((eastToBvw10EachHour?.sumVi || 0) + (westToBvw10EachHour?.sumVi || 0));
              const sumHvMultiplyViEachHour = (
                (eastHvEachHour == null && eastToBvw10EachHour?.sumVi == null) || 
                (westHvEachHour == null && westToBvw10EachHour?.sumVi == null)
              ) ? null
              : parseToNumber6Decimal(((eastToBvw10EachHour?.sumVi || 0) * (eastHvEachHour || 0)) + ((westToBvw10EachHour?.sumVi || 0) * (westHvEachHour || 0)));
    
              const sumSgMultiplyViEachHour = (
                (eastSgEachHour == null && eastToBvw10EachHour?.sumVi == null) || 
                (westSgEachHour == null && westToBvw10EachHour?.sumVi == null)
              ) ? null
              : parseToNumber6Decimal(((eastToBvw10EachHour?.sumVi || 0) * (eastSgEachHour || 0)) + ((westToBvw10EachHour?.sumVi || 0) * (westSgEachHour || 0)));
              eachHour.set(i, {
                sumVi: sumViEachHour,
                sumHvMultiplyVi: sumHvMultiplyViEachHour,
                sumSgMultiplyVi: sumSgMultiplyViEachHour,
              });
            }
  
            const key = `${`${zone}`.trim().toLowerCase()}-${`${area}`.trim().toLowerCase()}`;
            result.set(key, {
              zone_text: zone,
              area_text: area,
              entryExit: entryExit,
              sumVi: sumVi,
              sumHvMultiplyVi: sumHvMultiplyVi,
              sumSgMultiplyVi: sumSgMultiplyVi,
              eachHour: eachHour,
            });
            break;
        }
      })
    } catch (error) {
      console.log('find hv for east-west area error', error);
    }
  }

  return result;
}

// https://app.clickup.com/t/9018502823/86eve8pzk
export async function findHvFromEntryArea2({ prisma, targetArea, gasDate, dataList }: { prisma: PrismaService; targetArea: string; gasDate: Date; dataList: queryShipperNominationFileWithRelationsForCal[] }) {
  // หาช่วงสัปดาห์ที่ครอบคลุมวันที่เริ่มต้นและสิ้นสุด (สำหรับดึงข้อมูล weekly nomination)
  const { weekStart: targetWeekStart } = getWeekRange(gasDate);
  const { weekEnd: targetWeekEnd } = getWeekRange(gasDate);
  const gasDayjs = dayjs(gasDate);
  const dayOfWeek = Number(dayjs(gasDate).tz('Asia/Bangkok').format('d')); // วันในสัปดาห์ (0 = Sunday, 6 = Saturday)

  let targetDataList = dataList;
  // ดึงข้อมูล nomination files ทั้งแบบรายวัน (type 1) และรายสัปดาห์ (type 2)
  if (dataList.length == 0) {
    const nominationData: queryShipperNominationFileWithRelationsForCal[] = await prisma.query_shipper_nomination_file.findMany({
      where: {
        // NOT: {
        //   contract_code_id: null,
        // }, // revers bal ไม่แสดง effect
        AND: [
          {
            OR: [
              {
                // nomination รายวัน (type 1) ที่อยู่ในช่วงวันที่ที่เลือก
                nomination_type: { id: 1 },
                gas_day: gasDate,
              },
              {
                // nomination รายสัปดาห์ (type 2) ที่อยู่ในช่วงสัปดาห์ที่ครอบคลุมวันที่เลือก
                nomination_type: { id: 2 },
                gas_day: {
                  gte: targetWeekStart,
                  lte: targetWeekEnd,
                },
              },
            ],
          },
          // เฉพาะรายการที่ไม่ถูกลบ
          {
            OR: [
              {
                del_flag: false,
              },
              {
                del_flag: null,
              },
            ],
          },
          // เฉพาะ status 2 (Approved) และ 5 (Approved by System)
          {
            query_shipper_nomination_status: {
              id: {
                in: [2, 5],
              },
            },
          },
        ],
      },
      ...queryShipperNominationFilePopulateForCal,
      orderBy: [
        {
          nomination_type_id: 'asc',
        },
        { id: 'desc' },
      ],
    });

    // // กรอง nomination แบบรายวันสำหรับวันที่กำลังประมวลผล
    // const dailyNominationList = nominationData.filter(
    //   nominationFile =>
    //     nominationFile.nomination_type_id == 1
    // );

    // // กรอง nomination แบบรายสัปดาห์สำหรับสัปดาห์ที่กำลังประมวลผล
    // // ข้ามถ้ามี daily nomination สำหรับ contract เดียวกันแล้ว (daily nomination มีลำดับความสำคัญสูงกว่า)
    // const weeklyNominationList = nominationData.filter(
    //   nominationFile =>
    //     nominationFile.nomination_type_id == 2
    //     && !dailyNominationList.some(daily => daily.contract_code_id == nominationFile.contract_code_id)
    // );

    // targetDataList = [...dailyNominationList, ...weeklyNominationList];

    targetDataList = nominationData;
  }
  console.log('targetDataList : ', targetDataList);
  // 1/9/2026
  // 20260831-DNM-0002 2026-CNF-N001
  // 20260831-DNM-0001 2026-CSF-010
  // 20260828-WNM-0005 2024-CLF-001_Amd02
  // 20260828-WNM-0004 2026-CNF-011
  // 20260828-WNM-0003 2026-CNF-012
  // 20260828-WNM-0002 2026-CSF-010
  // 20260828-WNM-0001 2026-CMF-001
  // 20260827-WNM-0001 2022-CLF-018_Amd004

  // X3
  // 20260828-WNM-0004 2026-CNF-011
  // 20260828-WNM-0003 2026-CNF-012
  // 20260827-WNM-0001 2022-CLF-018_Amd004

  // X3
  // HV 1,072.327
  // WI 1,400.280
  // SG 0.6074

  // Y
  // 20260828-WNM-0004 2026-CNF-011
  // 20260828-WNM-0003 2026-CNF-012
  // 20260827-WNM-0001 2022-CLF-018_Amd004

  // Y
  // SG 0.6356


  const areaMaster: areaWithRelationsForCal[] = await prisma.area.findMany({
    where: {
      ...(
        targetArea ?
        {
          name: {
            equals: targetArea,
            mode: 'insensitive'
          }
        } :
        {
          zone: {
            name: {
              equals: 'EAST-WEST',
              mode: 'insensitive'
            }
          }
        }
      ),
      AND: [
        {
          start_date: {
            lte: targetWeekEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
        },
        {
          OR: [
            {
              end_date: null,
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gte: targetWeekStart,
              },
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
          ],
        },
      ],
    },
    include: {
      zone: {
        select: {
          id: true,
          name: true,
        },
      },
      entry_exit: {
        select: {
          id: true,
          name: true,
        },
      },
      supply_reference_quality_area_by: {
        select: {
          id: true,
          name: true,
          start_date: true,
          end_date: true,
        },
      },
      owner_area: {
        include: {
          east_area: {
            select: {
              id: true,
              name: true,
              start_date: true,
              end_date: true,
            }
          },
          west_area: {
            select: {
              id: true,
              name: true,
              start_date: true,
              end_date: true,
            }
          }
        }
      },
    },
    orderBy: {
      id: 'desc',
    },
  });
  const bvw10AndRa6List = await prisma.concept_point.findMany({
    where: {
      OR: [
        {
          concept_point: {
            contains: 'BVW10',
            mode: 'insensitive'
          }
        },
        {
          concept_point: {
            contains: 'RA6',
            mode: 'insensitive'
          }
        }
      ],
      type_concept_point_id: 2 // Nomination Physical gas concepts
    }
  })
  
  let eastWestList: any[] = [];
  const historyBvw10AndRa6List: (adjustNomDataType & {
    nominationRowJsonDataTemp: any;
  })[] = [];

  const historyList: adjustNomDataType[] = [];
  const result = new Map<
    string,
    areaHvDataType
  >();

  const h1Key = 14;
  targetDataList.map((nominationFile) => {
    nominationFile.nomination_version.map((nominationVersion) => {
      nominationVersion.nomination_row_json.map((nominationRowJson) => {
        // แปลง JSON string เป็น object
        const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp);

        // อ่านข้อมูลจาก JSON ตามตำแหน่งที่กำหนด
        const zone = nominationRowJsonDataTemp['0'];
        const area = nominationRowJsonDataTemp['2'];
        const point = nominationRowJsonDataTemp['3'];
        const unit = nominationRowJsonDataTemp['9'];
        const entryExit = nominationRowJsonDataTemp['10'];
        const wi = parseToNumber6Decimal(nominationRowJsonDataTemp['11']);
        const hv = parseToNumber6Decimal(nominationRowJsonDataTemp['12']);
        const sg = parseToNumber6Decimal(nominationRowJsonDataTemp['13']); 

        

        // zone East-West มีวิธีคิดแยกต่างหาก
        if(isMatch(zone, 'EAST-WEST')){
          if(!eastWestList.some((item: any) => isMatch(item.zone, zone) && isMatch(item.area, area) && isMatch(item.point, point) && isMatch(item.entryExit, entryExit))){
            eastWestList.push({
              zone: zone,
              area: area,
              point: point,
              entryExit: entryExit,
              hv: hv,
              sg: sg,
            });
          }
        }

        if(bvw10AndRa6List.some(conceptPoint => isMatch(conceptPoint.concept_point, point)) && (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H'))){
          if (
            nominationFile.nomination_type_id == 2 &&
            historyBvw10AndRa6List.some((f) => {
              return (
                f?.point === point &&
                f?.zone_text === nominationRowJson.zone_text &&
                f?.area_text === nominationRowJson.area_text &&
                f?.entryExit === entryExit &&
                f?.gas_day === gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
                f?.shipper_id_name === nominationFile.group?.id_name &&
                f?.contract_code_id === nominationFile.contract_code_id &&
                f?.totalType === 'daily' &&
                f?.nomination_type_id === 1
              );
            })
          ) {
            return;
          }
          else{
            historyBvw10AndRa6List.push({
              gas_day: gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY'),
              group_id: nominationFile.group_id,
              shipper_name: nominationFile.group?.name,
              shipper_id_name: nominationFile.group?.id_name,
              contract: nominationFile.contract_code?.contract_code || nominationFile.reserve_balancing_gas_contract?.res_bal_gas_contract,
              contract_code_id: nominationFile.contract_code_id,
              reserve_balancing_gas_contract_id: nominationFile.reserve_balancing_gas_contract_id,
              nomination_id: nominationFile.id,
              nomination_code: nominationFile.nomination_code,
              zone_text: nominationRowJson.zone_text,
              area_text: nominationRowJson.area_text,
              // "unit": unit,
              point: point,
              entryExit: entryExit,
              total: 0,
              totalMmscfd: null,
              totalType: nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
              nomination_type_id: nominationFile.nomination_type_id,
              timeShow: [],
              nominationRowJsonDataTemp: nominationRowJsonDataTemp,
            });
          }
        }

        // ข้ามถ้าไม่มีข้อมูล zone, area (ต้องเป็น nomination point)
        // ข้ามถ้าไม่ใช่ entry (ต้องเป็น entry)
        if (!zone || !area || (targetArea && !isMatch(area, targetArea)) || !isMatch(entryExit, 'Entry') || !isMatch(unit, 'MMSCFD')) {
          return;
        }
        if (
          nominationFile.nomination_type_id == 2 &&
          historyList.some((f) => {
            return (
              f?.point === point &&
              f?.zone_text === nominationRowJson.zone_text &&
              f?.area_text === nominationRowJson.area_text &&
              f?.entryExit === entryExit &&
              f?.gas_day === gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
              f?.shipper_id_name === nominationFile.group?.id_name &&
              f?.contract_code_id === nominationFile.contract_code_id &&
              f?.totalType === 'daily' &&
              f?.nomination_type_id === 1
            );
          })
        ) {
          return;
        } else {
          // หาว่ามี point นี้ใน historyList แล้วหรือยัง (เช็คตาม point, zone, area, entryExit, gas_day, group, contract, nomination)
          let existPointIndex = historyList.findIndex((f: any) => {
            return (
              f?.point === point &&
              f?.zone_text === nominationRowJson.zone_text &&
              f?.area_text === nominationRowJson.area_text &&
              f?.entryExit === entryExit &&
              f?.gas_day === gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
              f?.group_id === nominationFile.group_id &&
              f?.contract_code_id === nominationFile.contract_code_id &&
              f?.nomination_id === nominationFile.id
            );
          });

          // ถ้ายังไม่มี point นี้ใน result ให้สร้างใหม่
          if (existPointIndex < 0) {
            historyList.push({
              gas_day: gasDayjs.tz('Asia/Bangkok').format('DD/MM/YYYY'),
              group_id: nominationFile.group_id,
              shipper_name: nominationFile.group?.name,
              shipper_id_name: nominationFile.group?.id_name,
              contract: nominationFile.contract_code?.contract_code || nominationFile.reserve_balancing_gas_contract?.res_bal_gas_contract,
              contract_code_id: nominationFile.contract_code_id,
              reserve_balancing_gas_contract_id: nominationFile.reserve_balancing_gas_contract_id,
              nomination_id: nominationFile.id,
              nomination_code: nominationFile.nomination_code,
              zone_text: nominationRowJson.zone_text,
              area_text: nominationRowJson.area_text,
              // "unit": unit,
              point: point,
              entryExit: entryExit,
              total: 0,
              totalMmscfd: null,
              totalType: nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
              nomination_type_id: nominationFile.nomination_type_id,
              timeShow: [],
            });
          }
        }

        // ดึงค่าตามวันในสัปดาห์ (Sunday = 0, Monday = 1, ..., Saturday = 6)
        const vi = readNomFromJsonAs6Decimal(nominationRowJsonDataTemp, nominationFile.nomination_type_id == 2 ? `${h1Key + dayOfWeek}` : '38');

        const key = `${`${zone}`.trim().toLowerCase()}-${`${area}`.trim().toLowerCase()}`;

        if (result.has(key)) {
          const exist = result.get(key);
          if(area === "X3" && unit === "MMSCFD"){
            console.log('0@ exist : ', exist);
            console.log('0@ vi : ', vi);
          }

          if (exist.sumVi != null) {
            if (vi != null) {
              exist.sumVi = parseToNumber6Decimal(exist.sumVi + vi);
            }
          } else {
            exist.sumVi = vi;
          }

          if (exist.sumHvMultiplyVi != null) {
            if (hv != null || vi != null) {
              exist.sumHvMultiplyVi = parseToNumber6Decimal(exist.sumHvMultiplyVi + parseToNumber6Decimal((hv ?? 0) * (vi ?? 0)));
            }
          } else {
            exist.sumHvMultiplyVi = (hv == null && vi == null) ? null : parseToNumber6Decimal((hv ?? 0) * (vi ?? 0));
          }

          if (exist.sumSgMultiplyVi != null) {
            if (sg != null || vi != null) {
              exist.sumSgMultiplyVi = parseToNumber6Decimal(exist.sumSgMultiplyVi + parseToNumber6Decimal((sg ?? 0) * (vi ?? 0)));
            }
          } else {
            exist.sumSgMultiplyVi = (sg == null && vi == null) ? null : parseToNumber6Decimal((sg ?? 0) * (vi ?? 0));
          }

          exist.eachHour?.forEach((eachHourItem, key) => {
            const viEachHour = readNomFromJsonAs6Decimal(nominationRowJsonDataTemp, `${h1Key + key}`);

            if (eachHourItem.sumVi != null) {
              if (viEachHour != null) {
                eachHourItem.sumVi = parseToNumber6Decimal(eachHourItem.sumVi + viEachHour);
              }
            } else {
              eachHourItem.sumVi = viEachHour;
            }

            if (eachHourItem.sumHvMultiplyVi != null) {
              if (hv != null || viEachHour != null) {
                eachHourItem.sumHvMultiplyVi = parseToNumber6Decimal(eachHourItem.sumHvMultiplyVi + parseToNumber6Decimal((hv ?? 0) * (viEachHour ?? 0)));
              }
            } else {
              eachHourItem.sumHvMultiplyVi = (hv == null && viEachHour == null) ? null : parseToNumber6Decimal((hv ?? 0) * (viEachHour ?? 0));
            }

            if (eachHourItem.sumSgMultiplyVi != null) {
              if (sg != null || viEachHour != null) {
                eachHourItem.sumSgMultiplyVi = parseToNumber6Decimal(eachHourItem.sumSgMultiplyVi + parseToNumber6Decimal((sg ?? 0) * (viEachHour ?? 0)));
              }
            } else {
              eachHourItem.sumSgMultiplyVi = (sg == null && viEachHour == null) ? null : parseToNumber6Decimal((sg ?? 0) * (viEachHour ?? 0));
            }
          });

          result.set(key, exist);
        } else {
          const eachHour = new Map<number, { sumVi: number | null, sumHvMultiplyVi: number | null, sumSgMultiplyVi: number | null }>();
          if(nominationFile.nomination_type_id == 2){
            const viEachHour = vi == null ? null : (vi / 24);
            if(area === "X3" && unit === "MMSCFD"){
                console.log('W 1@ viEachHour : ', viEachHour);
              }
            for (let i = 0; i < 24; i++) {
              eachHour.set(i, {
                sumVi: viEachHour,
                sumHvMultiplyVi: (hv == null && viEachHour == null) ? null : parseToNumber6Decimal((hv ?? 0) * (viEachHour ?? 0)),
                sumSgMultiplyVi: (sg == null && viEachHour == null) ? null : parseToNumber6Decimal((sg ?? 0) * (viEachHour ?? 0)),
              });
            }
          }
          else{
            for (let i = 0; i < 24; i++) {
              const viEachHour = readNomFromJsonAs6Decimal(nominationRowJsonDataTemp, `${h1Key + i}`);
              if(area === "X3" && unit === "MMSCFD"){
                console.log('D 2@ viEachHour : ', viEachHour);
              }
              eachHour.set(i, {
                sumVi: viEachHour,
                sumHvMultiplyVi: (hv == null && viEachHour == null) ? null : parseToNumber6Decimal((hv ?? 0) * (viEachHour ?? 0)),
                sumSgMultiplyVi: (sg == null && viEachHour == null) ? null : parseToNumber6Decimal((sg ?? 0) * (viEachHour ?? 0)),
              });
            }
          }

          result.set(key, {
            zone_text: zone,
            area_text: area,
            entryExit: entryExit,
            sumVi: vi,
            sumHvMultiplyVi: (hv == null && vi == null) ? null : parseToNumber6Decimal((hv ?? 0) * (vi ?? 0)),
            sumSgMultiplyVi: (sg == null && vi == null) ? null : parseToNumber6Decimal((sg ?? 0) * (vi ?? 0)),
            eachHour: eachHour,
          });
        }


         if(area === "X3" && unit === "MMSCFD"){
          console.log('[X3] contract_code : ', nominationFile?.contract_code?.contract_code);
          console.log('[X3] area : ', area);
          console.log('[X3] unit : ', unit);
          console.log('[X3] point : ', point);
          console.log('[X3] sg : ', sg);
          // console.log('[X3] result : ', result);
          console.log('[X3] nominationRowJsonDataTemp : ', nominationRowJsonDataTemp);
          console.log('- - - - -');
        }

      });
    });
  });

  // zone East-West มีวิธีคิดแยกต่างหาก
  if(eastWestList.length > 0){
    try {
      const eastToBvw10Value = aggregateHistoryBvw10Ra6Vi(
        historyBvw10AndRa6List,
        matchBvw10Ra6Point('bvw10', 'east'),
        h1Key,
        dayOfWeek,
      );
      const westToBvw10Value = aggregateHistoryBvw10Ra6Vi(
        historyBvw10AndRa6List,
        matchBvw10Ra6Point('bvw10', 'west'),
        h1Key,
        dayOfWeek,
      );
      const eastToRa6Value = aggregateHistoryBvw10Ra6Vi(
        historyBvw10AndRa6List,
        matchBvw10Ra6Point('ra6', 'east'),
        h1Key,
        dayOfWeek,
      );
      const westToRa6Value = aggregateHistoryBvw10Ra6Vi(
        historyBvw10AndRa6List,
        matchBvw10Ra6Point('ra6', 'west'),
        h1Key,
        dayOfWeek,
      );
  
      eastWestList.sort((a: any, b: any) => {
        const aIsE = isMatch(a.area, 'e');
        const bIsE = isMatch(b.area, 'e');
        if (aIsE && !bIsE) return 1;
        if (!aIsE && bIsE) return -1;
        return a.area.localeCompare(b.area);
      });
  
      eastWestList.map((item: any) => {
        const zone = item.zone;
        const area = item.area;
        // const point = item.point;
        const entryExit = item.entryExit;
        // const hv = item.hv;
        // const sg = item.sg;
  
        const areaEastList = areaMaster.find((areaObj: any) => isMatch(areaObj.name, area) && isMatch(areaObj.zone.name, zone) && isMatch(areaObj.entry_exit.name, entryExit))?.owner_area?.map(ownerArea => ownerArea.east_area);
        const areaWestList = areaMaster.find((areaObj: any) => isMatch(areaObj.name, area) && isMatch(areaObj.zone.name, zone) && isMatch(areaObj.entry_exit.name, entryExit))?.owner_area?.map(ownerArea => ownerArea.west_area);
        // HV_F2 = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
        // HV_G = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
        // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
        let eastData : areaHvDataType | null = null;
        (areaEastList || []).map(areaEast => {
          const key = `east-${`${areaEast.name}`.trim().toLowerCase()}`;
          const exist = result.get(key);
          if(eastData){
            const vi = exist.sumVi
            const sumHvMultiplyVi = exist.sumHvMultiplyVi
            const sumSgMultiplyVi = exist.sumSgMultiplyVi
            const eachHour = exist.eachHour
            if (eastData.sumVi != null) {
              if (vi != null) {
                eastData.sumVi = parseToNumber6Decimal(eastData.sumVi + vi);
              }
            } else {
              eastData.sumVi = exist.sumVi;
            }

            if (eastData.sumHvMultiplyVi != null) {
              if (sumHvMultiplyVi != null) {
                eastData.sumHvMultiplyVi = parseToNumber6Decimal(eastData.sumHvMultiplyVi + sumHvMultiplyVi);
              }
            } else {
              eastData.sumHvMultiplyVi = sumHvMultiplyVi;
            }

            if (eastData.sumSgMultiplyVi != null) {
              if (sumSgMultiplyVi != null) {
                eastData.sumSgMultiplyVi = parseToNumber6Decimal(eastData.sumSgMultiplyVi + sumSgMultiplyVi);
              }
            } else {
              eastData.sumSgMultiplyVi = sumSgMultiplyVi;
            }

            eastData.eachHour?.forEach((eachHourItem, key) => {
              const viEachHour = eachHour.get(key)?.sumVi
              const sumHvMultiplyViEachHour = eachHour.get(key)?.sumHvMultiplyVi
              const sumSgMultiplyViEachHour = eachHour.get(key)?.sumSgMultiplyVi

              if (eachHourItem.sumVi != null) {
                if (viEachHour != null) {
                  eachHourItem.sumVi = parseToNumber6Decimal(eachHourItem.sumVi + viEachHour);
                }
              } else {
                eachHourItem.sumVi = viEachHour;
              }

              if (eachHourItem.sumHvMultiplyVi != null) {
                if (sumHvMultiplyViEachHour != null) {
                  eachHourItem.sumHvMultiplyVi = parseToNumber6Decimal(eachHourItem.sumHvMultiplyVi + sumHvMultiplyViEachHour);
                }
              } else {
                eachHourItem.sumHvMultiplyVi = sumHvMultiplyViEachHour;
              }

              if (eachHourItem.sumSgMultiplyVi != null) {
                if (sumSgMultiplyViEachHour != null) {
                  eachHourItem.sumSgMultiplyVi = parseToNumber6Decimal(eachHourItem.sumSgMultiplyVi + sumSgMultiplyViEachHour);
                }
              } else {
                eachHourItem.sumSgMultiplyVi = sumSgMultiplyViEachHour;
              }
            });
          }
          else{
            eastData = exist
          }
        })

        switch(area.toLowerCase()){
          case 'e': {
            const westData = result.get('east-west-f2')

            const eastHv = (eastData?.sumHvMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumHvMultiplyVi / eastData?.sumVi);
            const westHv = (westData?.sumHvMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumHvMultiplyVi / westData?.sumVi);
            const eastSg = (eastData?.sumSgMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumSgMultiplyVi / eastData?.sumVi);
            const westSg = (westData?.sumSgMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumSgMultiplyVi / westData?.sumVi);
            const sumVi = (eastToRa6Value.sumVi == null && westToRa6Value.sumVi == null) ? null : parseToNumber6Decimal((eastToRa6Value.sumVi || 0) + (westToRa6Value.sumVi || 0));
            const sumHvMultiplyVi = (
              (eastHv == null && eastToRa6Value.sumVi == null) || 
              (westHv == null && westToRa6Value.sumVi == null)
            ) ? null
            : parseToNumber6Decimal(((eastToRa6Value.sumVi || 0) * (eastHv || 0)) + ((westToRa6Value.sumVi || 0) * (westHv || 0)));
  
            const sumSgMultiplyVi = (
              (eastSg == null && eastToRa6Value.sumVi == null) || 
              (westSg == null && westToRa6Value.sumVi == null)
            ) ? null
            : parseToNumber6Decimal(((eastToRa6Value.sumVi || 0) * (eastSg || 0)) + ((westToRa6Value.sumVi || 0) * (westSg || 0)));


            const eachHour = new Map<number, { sumVi: number | null, sumHvMultiplyVi: number | null, sumSgMultiplyVi: number | null }>();
            for (let i = 0; i < 24; i++) {
              const eastEachHour = eastData?.eachHour?.get(i);
              const westEachHour = westData?.eachHour?.get(i);
              const eastToRa6EachHour = eastToRa6Value.eachHour?.get(i);
              const westToRa6EachHour = westToRa6Value.eachHour?.get(i);
              const eastHvEachHour = (eastEachHour?.sumHvMultiplyVi == null || eastEachHour?.sumVi == null) ? null : (eastEachHour?.sumHvMultiplyVi / eastEachHour?.sumVi);
              const westHvEachHour = (westEachHour?.sumHvMultiplyVi == null || westEachHour?.sumVi == null) ? null : (westEachHour?.sumHvMultiplyVi / westEachHour?.sumVi);
              const eastSgEachHour = (eastEachHour?.sumSgMultiplyVi == null || eastEachHour?.sumVi == null) ? null : (eastEachHour?.sumSgMultiplyVi / eastEachHour?.sumVi);
              const westSgEachHour = (westEachHour?.sumSgMultiplyVi == null || westEachHour?.sumVi == null) ? null : (westEachHour?.sumSgMultiplyVi / westEachHour?.sumVi);
              const sumViEachHour = (eastToRa6EachHour?.sumVi == null && westToRa6EachHour?.sumVi == null) ? null : parseToNumber6Decimal((eastToRa6EachHour?.sumVi || 0) + (westToRa6EachHour?.sumVi || 0));
              const sumHvMultiplyViEachHour = (
                (eastHvEachHour == null && eastToRa6EachHour?.sumVi == null) || 
                (westHvEachHour == null && westToRa6EachHour?.sumVi == null)
              ) ? null
              : parseToNumber6Decimal(((eastToRa6EachHour?.sumVi || 0) * (eastHvEachHour || 0)) + ((westToRa6EachHour?.sumVi || 0) * (westHvEachHour || 0)));
    
              const sumSgMultiplyViEachHour = (
                (eastSgEachHour == null && eastToRa6EachHour?.sumVi == null) || 
                (westSgEachHour == null && westToRa6EachHour?.sumVi == null)
              ) ? null
              : parseToNumber6Decimal(((eastToRa6EachHour?.sumVi || 0) * (eastSgEachHour || 0)) + ((westToRa6EachHour?.sumVi || 0) * (westSgEachHour || 0)));
              eachHour.set(i, {
                sumVi: sumViEachHour,
                sumHvMultiplyVi: sumHvMultiplyViEachHour,
                sumSgMultiplyVi: sumSgMultiplyViEachHour,
              });
            }
  
            const key = `${`${zone}`.trim().toLowerCase()}-${`${area}`.trim().toLowerCase()}`;
            result.set(key, {
              zone_text: zone,
              area_text: area,
              entryExit: entryExit,
              sumVi: sumVi,
              sumHvMultiplyVi: sumHvMultiplyVi,
              sumSgMultiplyVi: sumSgMultiplyVi,
              eachHour: eachHour,
            });

            break;
          }
          default:
            let westData : areaHvDataType | null = null;
            (areaWestList || []).map(areaWest => {
              const key = `west-${`${areaWest.name}`.trim().toLowerCase()}`;
              const exist = result.get(key);
              if(westData){
                const vi = exist.sumVi
                const sumHvMultiplyVi = exist.sumHvMultiplyVi
                const sumSgMultiplyVi = exist.sumSgMultiplyVi
                const eachHour = exist.eachHour
                if (westData.sumVi != null) {
                  if (vi != null) {
                    westData.sumVi = parseToNumber6Decimal(westData.sumVi + vi);
                  }
                } else {
                  westData.sumVi = exist.sumVi;
                }
                
                if (westData.sumHvMultiplyVi != null) {
                  if (sumHvMultiplyVi != null) {
                    westData.sumHvMultiplyVi = parseToNumber6Decimal(westData.sumHvMultiplyVi + sumHvMultiplyVi);
                  }
                } else {
                  westData.sumHvMultiplyVi = sumHvMultiplyVi;
                }
                
                if (westData.sumSgMultiplyVi != null) {
                  if (sumSgMultiplyVi != null) {
                    westData.sumSgMultiplyVi = parseToNumber6Decimal(westData.sumSgMultiplyVi + sumSgMultiplyVi);
                  }
                } else {
                  westData.sumSgMultiplyVi = sumSgMultiplyVi;
                }
                
                westData.eachHour?.forEach((eachHourItem, key) => {
                  const viEachHour = eachHour.get(key)?.sumVi
                  const sumHvMultiplyViEachHour = eachHour.get(key)?.sumHvMultiplyVi
                  const sumSgMultiplyViEachHour = eachHour.get(key)?.sumSgMultiplyVi
  
                  if (eachHourItem.sumVi != null) {
                    if (viEachHour != null) {
                      eachHourItem.sumVi = parseToNumber6Decimal(eachHourItem.sumVi + viEachHour);
                    }
                  } else {
                    eachHourItem.sumVi = viEachHour;
                  }
  
                  if (eachHourItem.sumHvMultiplyVi != null) {
                    if (sumHvMultiplyViEachHour != null) {
                      eachHourItem.sumHvMultiplyVi = parseToNumber6Decimal(eachHourItem.sumHvMultiplyVi + sumHvMultiplyViEachHour);
                    }
                  } else {
                    eachHourItem.sumHvMultiplyVi = sumHvMultiplyViEachHour;
                  }
  
                  if (eachHourItem.sumSgMultiplyVi != null) {
                    if (sumSgMultiplyViEachHour != null) {
                      eachHourItem.sumSgMultiplyVi = parseToNumber6Decimal(eachHourItem.sumSgMultiplyVi + sumSgMultiplyViEachHour);
                    }
                  } else {
                    eachHourItem.sumSgMultiplyVi = sumSgMultiplyViEachHour;
                  }
                });
              }
              else{
                westData = exist
              }
            })
  
            const eastHv = (eastData?.sumHvMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumHvMultiplyVi / eastData?.sumVi);
            const westHv = (westData?.sumHvMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumHvMultiplyVi / westData?.sumVi);
            const eastSg = (eastData?.sumSgMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumSgMultiplyVi / eastData?.sumVi);
            const westSg = (westData?.sumSgMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumSgMultiplyVi / westData?.sumVi);
            const sumVi = (eastToBvw10Value.sumVi == null && westToBvw10Value.sumVi == null) ? null : parseToNumber6Decimal((eastToBvw10Value.sumVi || 0) + (westToBvw10Value.sumVi || 0));
            const sumHvMultiplyVi = (
              (eastHv == null && eastToBvw10Value.sumVi == null) || 
              (westHv == null && westToBvw10Value.sumVi == null)
            ) ? null
            : parseToNumber6Decimal(((eastToBvw10Value.sumVi || 0) * (eastHv || 0)) + ((westToBvw10Value.sumVi || 0) * (westHv || 0)));
  
            const sumSgMultiplyVi = (
              (eastSg == null && eastToBvw10Value.sumVi == null) || 
              (westSg == null && westToBvw10Value.sumVi == null)
            ) ? null
            : parseToNumber6Decimal(((eastToBvw10Value.sumVi || 0) * (eastSg || 0)) + ((westToBvw10Value.sumVi || 0) * (westSg || 0)));


            const eachHour = new Map<number, { sumVi: number | null, sumHvMultiplyVi: number | null, sumSgMultiplyVi: number | null }>();
            for (let i = 0; i < 24; i++) {
              const eastEachHour = eastData?.eachHour?.get(i);
              const westEachHour = westData?.eachHour?.get(i);
              const eastToBvw10EachHour = eastToBvw10Value.eachHour?.get(i);
              const westToBvw10EachHour = westToBvw10Value.eachHour?.get(i);
              const eastHvEachHour = (eastEachHour?.sumHvMultiplyVi == null || eastEachHour?.sumVi == null) ? null : (eastEachHour?.sumHvMultiplyVi / eastEachHour?.sumVi);
              const westHvEachHour = (westEachHour?.sumHvMultiplyVi == null || westEachHour?.sumVi == null) ? null : (westEachHour?.sumHvMultiplyVi / westEachHour?.sumVi);
              const eastSgEachHour = (eastEachHour?.sumSgMultiplyVi == null || eastEachHour?.sumVi == null) ? null : (eastEachHour?.sumSgMultiplyVi / eastEachHour?.sumVi);
              const westSgEachHour = (westEachHour?.sumSgMultiplyVi == null || westEachHour?.sumVi == null) ? null : (westEachHour?.sumSgMultiplyVi / westEachHour?.sumVi);
              const sumViEachHour = (eastToBvw10EachHour?.sumVi == null && westToBvw10EachHour?.sumVi == null) ? null : parseToNumber6Decimal((eastToBvw10EachHour?.sumVi || 0) + (westToBvw10EachHour?.sumVi || 0));
              const sumHvMultiplyViEachHour = (
                (eastHvEachHour == null && eastToBvw10EachHour?.sumVi == null) || 
                (westHvEachHour == null && westToBvw10EachHour?.sumVi == null)
              ) ? null
              : parseToNumber6Decimal(((eastToBvw10EachHour?.sumVi || 0) * (eastHvEachHour || 0)) + ((westToBvw10EachHour?.sumVi || 0) * (westHvEachHour || 0)));
    
              const sumSgMultiplyViEachHour = (
                (eastSgEachHour == null && eastToBvw10EachHour?.sumVi == null) || 
                (westSgEachHour == null && westToBvw10EachHour?.sumVi == null)
              ) ? null
              : parseToNumber6Decimal(((eastToBvw10EachHour?.sumVi || 0) * (eastSgEachHour || 0)) + ((westToBvw10EachHour?.sumVi || 0) * (westSgEachHour || 0)));
              eachHour.set(i, {
                sumVi: sumViEachHour,
                sumHvMultiplyVi: sumHvMultiplyViEachHour,
                sumSgMultiplyVi: sumSgMultiplyViEachHour,
              });
            }
  
            const key = `${`${zone}`.trim().toLowerCase()}-${`${area}`.trim().toLowerCase()}`;
            result.set(key, {
              zone_text: zone,
              area_text: area,
              entryExit: entryExit,
              sumVi: sumVi,
              sumHvMultiplyVi: sumHvMultiplyVi,
              sumSgMultiplyVi: sumSgMultiplyVi,
              eachHour: eachHour,
            });
            break;
        }
      })
    } catch (error) {
      console.log('find hv for east-west area error', error);
    }
  }

  return result;
}


/**
 * ดึงค่า BTU/SCF จากสัญญา (contract) เพื่อใช้แทนกรณีไม่มี nomination ตามแต่ละ nomination point
 * @param prisma - PrismaService สำหรับดึงข้อมูลสัญญาและ nomination point
 * @param startDayjs - วันที่เริ่มต้นของช่วงคำนวณในรูปแบบ dayjs
 * @param todayStart - วันที่เริ่มต้นช่วงที่ต้องตรวจสอบสถานะสัญญา
 * @param todayEnd - วันที่สิ้นสุดช่วงที่ต้องตรวจสอบสถานะสัญญา
 * @param dailyAdjustGroupIDList - รายการ group_id ที่เกี่ยวข้องกับ daily adjustment
 * @returns Map ของค่า BTU/SCF ที่จัดกลุ่มตาม nomination point และ contract point
 */
export async function getContractCodeValueByNominationPoint({
  prisma,
  startDayjs,
  todayStart,
  todayEnd,
  dailyAdjustGroupIDList
}: {
  prisma: PrismaService
  startDayjs: dayjs.Dayjs
  todayStart: Date
  todayEnd: Date
  dailyAdjustGroupIDList: number[]
}) {
  // หาช่วงสัปดาห์ที่ครอบคลุมวันที่เริ่มต้นและสิ้นสุด (สำหรับดึงข้อมูล weekly nomination)
  const {
    weekStart: targetWeekStart
  } = getWeekRange(todayStart)
  const {
    weekEnd: targetWeekEnd
  } = getWeekRange(todayEnd)

  // ดึงข้อมูลสัญญาเพื่อนำค่ามาใช้แทนในกรณีที่ไม่มีการ nomination เข้ามา
  const contractData =
    await prisma.contract_code.findMany(
      {
        where: {
          AND: [
            {
              group_id: {
                in: dailyAdjustGroupIDList
              }
            },
            {
              contract_start_date:
                {
                  lte: todayEnd
                }
            }, // Started before or on target date
            // Not rejected
            {
              status_capacity_request_management:
                {
                  NOT: {
                    name: {
                      equals:
                        'Rejected',
                      mode: 'insensitive'
                    }
                  }
                }
            },
            // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
            {
              OR: [
                {
                  terminate_date:
                    null
                }, // No terminate date
                {
                  terminate_date:
                    {
                      gt: todayStart
                    }
                } // Terminate date is after target date
              ]
            },
            // Use extend_deadline if available, otherwise use contract_end_date
            {
              OR: [
                // If extend_deadline exists, use it as end date
                {
                  AND: [
                    {
                      extend_deadline:
                        {
                          not: null
                        }
                    },
                    {
                      extend_deadline:
                        {
                          gt: todayStart
                        }
                    }
                  ]
                },
                // If extend_deadline is null, use contract_end_date
                {
                  AND: [
                    {
                      extend_deadline:
                        null
                    },
                    {
                      OR: [
                        {
                          contract_end_date:
                            null
                        },
                        {
                          contract_end_date:
                            {
                              gt: todayStart
                            }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        select: {
          id: true,
          contract_code: true,
          ref_contract_code_by_id: true,
          ref_contract_code_by: {
            select: {
              id: true,
              contract_code: true,
            }
          },
          booking_version: {
            where: {
              flag_use: true
            },
            orderBy: {
              id: 'desc'
            },
            take: 1,
            select: {
              booking_full_json:
                {
                  select: {
                    data_temp: true
                  }
                },
              booking_row_json:
                {
                  where: {
                    OR: [
                      {
                        flag_use: true
                      },
                      {
                        flag_use:
                          null
                      }
                    ]
                  },
                  select: {
                    contract_point: true,
                    data_temp: true,
                    entry_exit_id: true
                  }
                },
              booking_row_json_release:
                {
                  where: {
                    OR: [
                      {
                        flag_use: true
                      },
                      {
                        flag_use:
                          null
                      }
                    ]
                  },
                  select: {
                    contract_point: true,
                    data_temp: true,
                    entry_exit_id: true
                  }
                }
            }
          }
        }
      }
    )

  const reserveBalancingGasContractData = await prisma.reserve_balancing_gas_contract.findMany({
    where: {
      reserve_balancing_gas_contract_detail: {
        some: {
          start_date: {
            lte: todayEnd,
          },
          end_date: {
            gt: todayStart,
          },
        },
      },
      query_shipper_nomination_file: {
        some: {
          AND: [
            {
              OR: [
                {
                  nomination_type_id: 1,
                  gas_day: {
                    gte: todayStart,
                    lte: todayEnd,
                  },
                },
                {
                  AND: [
                    {
                      nomination_type_id: 2,
                      gas_day: {
                        gte: targetWeekStart,
                        lte: targetWeekEnd,
                      },
                    },
                  ],
                },
              ],
            },
            {
              query_shipper_nomination_status: {
                id: {
                  in: [2, 5], // ['Approved', 'Approved by System']
                },
              },
            },
            {
              OR: [
                {
                  del_flag: false,
                },
                {
                  del_flag: null,
                },
              ],
            },
            {
              nomination_version: {
                some: {
                  flag_use: true,
                },
              },
            },
          ],
        },
      },
    },
    select: {
      id: true,
      res_bal_gas_contract: true,
      reserve_balancing_gas_contract_detail: {
        select: {
          nomination_point_id: true,
          nomination_point: true,
          daily_reserve_cap_mmbtu_d: true
        },
      },
      group: {
        select: {
          id: true,
          name: true,
          id_name: true,
        },
      },
    },
  })
  
  // สร้าง Map สำหรับเก็บข้อมูล contract code ที่จัดกลุ่มตาม nomination point และ contract point
  // Key: nomination_point หรือ contract_point, Value: array ของ contract code พร้อมค่า BTU, SCF และ contract point
  const contractCodeListByNominationPoint =
    new Map<
      string,
      {
        contractCodeId: number
        contractCode: string
        refContractCodeById?: number
        refContractCodeBy?: string
        BTUD: number | null
        BTUH: number | null
        SCFD: number | null
        SCFH: number | null
        contractPoint: string
        isReserveBalancingGasContract?: boolean
      }[]
    >()
  const contractCodeListByContractPoint =
    new Map<
      string,
      {
        contractCodeId: number
        contractCode: string
        BTUD: number | null
        BTUH: number | null
        SCFD: number | null
        SCFH: number | null
        contractPoint: string
      }[]
    >()

  // วนลูปประมวลผลข้อมูล contract แต่ละรายการ
  for (const contract of contractData) {
    // ตัวแปรสำหรับเก็บ key ที่ใช้ดึงค่า BTU และ SCF จาก booking JSON
    let entryBTUDKey = null // Key สำหรับดึงค่า BTUD ของ Entry point
    let entryBTUHKey = null // Key สำหรับดึงค่า BTUH ของ Entry point
    let exitBTUDKey = null // Key สำหรับดึงค่า BTUD ของ Exit point
    let exitBTUHKey = null // Key สำหรับดึงค่า BTUH ของ Exit point
    let entrySCFDKey = null // Key สำหรับดึงค่า SCFD ของ Entry point
    let entrySCFHKey = null // Key สำหรับดึงค่า SCFH ของ Entry point

    try {
      // แปลง booking_full_json จาก string เป็น object
      const bookingFullJsonDataTemp =
        JSON.parse(
          contract
            ?.booking_version[0]
            ?.booking_full_json[0]
            ?.data_temp
        )

      // ดึงข้อมูล header สำหรับ Entry point: Capacity Daily Booking (MMBTU/d)
      const headerEntryCDBMMBTUD =
        bookingFullJsonDataTemp
          ?.headerEntry[
          'Capacity Daily Booking (MMBTU/d)'
        ]
      delete headerEntryCDBMMBTUD[
        'key'
      ] // ลบ key property ออกเพื่อให้เหลือแค่ข้อมูลวันที่

      // ดึงข้อมูล header สำหรับ Entry point: Capacity Daily Booking (MMscfd)
      const headerEntryCDBMMscfd =
        bookingFullJsonDataTemp
          ?.headerEntry[
          'Capacity Daily Booking (MMscfd)'
        ]
      delete headerEntryCDBMMscfd[
        'key'
      ]

      // ดึงข้อมูล header สำหรับ Exit point: Capacity Daily Booking (MMBTU/d)
      const headerExitCDBMMBTUD =
        bookingFullJsonDataTemp
          ?.headerExit[
          'Capacity Daily Booking (MMBTU/d)'
        ]
      delete headerExitCDBMMBTUD[
        'key'
      ]

      // ดึงข้อมูล header สำหรับ Entry point: Maximum Hour Booking (MMBTU/h)
      const headerEntryCDBMMBTUH =
        bookingFullJsonDataTemp
          ?.headerEntry[
          'Maximum Hour Booking (MMBTU/h)'
        ]
      delete headerEntryCDBMMBTUH[
        'key'
      ]

      // ดึงข้อมูล header สำหรับ Entry point: Maximum Hour Booking (MMscfh)
      const headerEntryCDBMMscfh =
        bookingFullJsonDataTemp
          ?.headerEntry[
          'Maximum Hour Booking (MMscfh)'
        ]
      delete headerEntryCDBMMscfh[
        'key'
      ]

      // ดึงข้อมูล header สำหรับ Exit point: Maximum Hour Booking (MMBTU/h)
      const headerExitCDBMMBTUH =
        bookingFullJsonDataTemp
          ?.headerExit[
          'Maximum Hour Booking (MMBTU/h)'
        ]
      delete headerExitCDBMMBTUH[
        'key'
      ]

      // หา key สำหรับดึงค่า BTUD ของ Entry point โดยค้นหาวันที่ตรงกับ startDayjs หรือวันแรกของเดือน
      for (const date in headerEntryCDBMMBTUD) {
        const dateDayjs =
          getTodayNowDDMMYYYYDfault(
            date
          )
        if (
          dateDayjs.isSame(
            startDayjs,
            'day'
          )
        ) {
          entryBTUDKey =
            headerEntryCDBMMBTUD[
              date
            ].key
        } else if (
          dateDayjs.isSame(
            startDayjs.startOf(
              'month'
            ),
            'day'
          )
        ) {
          entryBTUDKey =
            headerEntryCDBMMBTUD[
              date
            ].key
        }
      }

      // หา key สำหรับดึงค่า BTUH ของ Entry point โดยค้นหาวันที่ตรงกับ startDayjs หรือวันแรกของเดือน
      for (const date in headerEntryCDBMMBTUH) {
        const dateDayjs =
          getTodayNowDDMMYYYYDfault(
            date
          )
        if (
          dateDayjs.isSame(
            startDayjs,
            'day'
          )
        ) {
          entryBTUHKey =
            headerEntryCDBMMBTUH[
              date
            ].key
        } else if (
          dateDayjs.isSame(
            startDayjs.startOf(
              'month'
            ),
            'day'
          )
        ) {
          entryBTUHKey =
            headerEntryCDBMMBTUH[
              date
            ].key
        }
      }

      // หา key สำหรับดึงค่า BTUD ของ Exit point โดยค้นหาวันที่ตรงกับ startDayjs หรือวันแรกของเดือน
      for (const date in headerExitCDBMMBTUD) {
        const dateDayjs =
          getTodayNowDDMMYYYYDfault(
            date
          )
        if (
          dateDayjs.isSame(
            startDayjs,
            'day'
          )
        ) {
          exitBTUDKey =
            headerExitCDBMMBTUD[
              date
            ].key
        } else if (
          dateDayjs.isSame(
            startDayjs.startOf(
              'month'
            ),
            'day'
          )
        ) {
          exitBTUDKey =
            headerExitCDBMMBTUD[
              date
            ].key
        }
      }

      // หา key สำหรับดึงค่า BTUH ของ Exit point โดยค้นหาวันที่ตรงกับ startDayjs หรือวันแรกของเดือน
      for (const date in headerExitCDBMMBTUH) {
        const dateDayjs =
          getTodayNowDDMMYYYYDfault(
            date
          )
        if (
          dateDayjs.isSame(
            startDayjs,
            'day'
          )
        ) {
          exitBTUHKey =
            headerExitCDBMMBTUH[
              date
            ].key
        } else if (
          dateDayjs.isSame(
            startDayjs.startOf(
              'month'
            ),
            'day'
          )
        ) {
          exitBTUHKey =
            headerExitCDBMMBTUH[
              date
            ].key
        }
      }

      // หา key สำหรับดึงค่า SCFD ของ Entry point โดยค้นหาวันที่ตรงกับ startDayjs หรือวันแรกของเดือน
      for (const date in headerEntryCDBMMscfd) {
        const dateDayjs =
          getTodayNowDDMMYYYYDfault(
            date
          )
        if (
          dateDayjs.isSame(
            startDayjs,
            'day'
          )
        ) {
          entrySCFDKey =
            headerEntryCDBMMscfd[
              date
            ].key
        } else if (
          dateDayjs.isSame(
            startDayjs.startOf(
              'month'
            ),
            'day'
          )
        ) {
          entrySCFDKey =
            headerEntryCDBMMscfd[
              date
            ].key
        }
      }

      // หา key สำหรับดึงค่า SCFH ของ Entry point โดยค้นหาวันที่ตรงกับ startDayjs หรือวันแรกของเดือน
      for (const date in headerEntryCDBMMscfh) {
        const dateDayjs =
          getTodayNowDDMMYYYYDfault(
            date
          )
        if (
          dateDayjs.isSame(
            startDayjs,
            'day'
          )
        ) {
          entrySCFHKey =
            headerEntryCDBMMscfh[
              date
            ].key
        } else if (
          dateDayjs.isSame(
            startDayjs.startOf(
              'month'
            ),
            'day'
          )
        ) {
          entrySCFHKey =
            headerEntryCDBMMscfh[
              date
            ].key
        }
      }
    } catch (error) {
      // ถ้าเกิด error ในการ parse JSON หรือดึงข้อมูล ให้ตั้งค่า key เป็น null
      entryBTUDKey = null
      entryBTUHKey = null
      exitBTUDKey = null
      exitBTUHKey = null
      entrySCFDKey = null
      entrySCFHKey = null
    }

    // ประมวลผล booking_row_json แต่ละรายการเพื่อดึงค่า BTU และ SCF
    ;(
      contract
        .booking_version?.[0]
        ?.booking_row_json ??
      []
    ).map(
      (
        bookingRowJson: any
      ) => {
        // ตรวจสอบว่ามี contract_point หรือไม่
        if (
          bookingRowJson.contract_point
        ) {
          let btudValue:
            | number
            | null = null // ค่า BTUD
          let btuhValue:
            | number
            | null = null // ค่า BTUH
          let scfdValue:
            | number
            | null = null // ค่า SCFD
          let scfhValue:
            | number
            | null = null // ค่า SCFH

          try {
            // แปลง booking_row_json จาก string เป็น object
            const bookingRowJsonDataTemp =
              JSON.parse(
                bookingRowJson.data_temp
              )

            // ถ้าเป็น Entry point (entry_exit_id == 1) ให้ดึงทั้ง BTU และ SCF
            if (
              bookingRowJson.entry_exit_id ==
              1
            ) {
              btudValue =
                entryBTUDKey
                  ? parseToNumber4Decimal(
                      bookingRowJsonDataTemp[
                        entryBTUDKey
                      ]
                    )
                  : null
              btuhValue =
                entryBTUHKey
                  ? parseToNumber4Decimal(
                      bookingRowJsonDataTemp[
                        entryBTUHKey
                      ]
                    )
                  : null
              scfdValue =
                entrySCFDKey
                  ? parseToNumber6Decimal(
                      bookingRowJsonDataTemp[
                        entrySCFDKey
                      ]
                    )
                  : null
              scfhValue =
                entrySCFHKey
                  ? parseToNumber6Decimal(
                      bookingRowJsonDataTemp[
                        entrySCFHKey
                      ]
                    )
                  : null
            }
            // ถ้าเป็น Exit point ให้ดึงเฉพาะ BTU
            else {
              btudValue =
                exitBTUDKey
                  ? parseToNumber4Decimal(
                      bookingRowJsonDataTemp[
                        exitBTUDKey
                      ]
                    )
                  : null
              btuhValue =
                exitBTUHKey
                  ? parseToNumber4Decimal(
                      bookingRowJsonDataTemp[
                        exitBTUHKey
                      ]
                    )
                  : null
            }
          } catch (error) {
            // ถ้าเกิด error ให้ตั้งค่าเป็น null
            btudValue = null
            btuhValue = null
            scfdValue = null
            scfhValue = null
          }

          // สร้าง object เก็บข้อมูล contract code พร้อมค่า BTU, SCF และ contract point
          const contractValue =
            {
              contractCodeId:
                contract.id,
              contractCode:
                contract.contract_code,
              refContractCodeById: contract.ref_contract_code_by_id,
              refContractCodeBy: contract.ref_contract_code_by?.contract_code,
              BTUD: btudValue,
              BTUH: btuhValue,
              SCFD: scfdValue,
              SCFH: scfhValue,
              contractPoint:
                bookingRowJson.contract_point
            }

          // เพิ่ม contract value เข้าไปใน Map ที่จัดกลุ่มตาม contract point
          const contractCodeList =
            contractCodeListByContractPoint.get(
              bookingRowJson.contract_point
            )
          if (
            contractCodeList
          ) {
            // ถ้ามี contract point นี้อยู่แล้ว ให้เพิ่ม contract value เข้าไปใน array
            contractCodeList.push(
              contractValue
            )
            // contractCodeListByContractPoint.set(bookingRowJson.contract_point, contractCodeList);
          } else {
            // ถ้ายังไม่มี contract point นี้ ให้สร้าง array ใหม่
            contractCodeListByContractPoint.set(
              bookingRowJson.contract_point,
              [contractValue]
            )
          }
        }
      }
    )
  }

  // ดึงข้อมูล nomination point ที่มี contract point ตรงกับ contract point ที่พบใน contract data
  const nominationPointList =
    await prisma.nomination_point.findMany(
      {
        where: {
          contract_point_list:
            {
              some: {
                contract_point:
                  {
                    in: Array.from(
                      contractCodeListByContractPoint.keys()
                    ) // ใช้ contract point ทั้งหมดที่พบเป็นเงื่อนไข
                  }
              }
            }
        },
        select: {
          id: true,
          nomination_point: true,
          contract_point_list:
            {
              select: {
                id: true,
                contract_point: true
              }
            }
        }
      }
    )

  const nominationPointNameListOfReserveBalancingGasContract = reserveBalancingGasContractData.flatMap(item => (item.reserve_balancing_gas_contract_detail || []).map(nom => nom.nomination_point?.nomination_point))

  const nominationPointListForReserveBalancingGasContract = await prisma.nomination_point.findMany(
    {
      where: {
        nomination_point: {
          in: nominationPointNameListOfReserveBalancingGasContract
        }
      },
      select: {
        id: true,
        nomination_point: true,
        contract_point_list:
          {
            select: {
              id: true,
              contract_point: true
            }
          }
      }
    }
  )

  // วนลูปเพื่อ map ข้อมูล contract code จาก contract point ไปยัง nomination point
  for (const nominationPoint of nominationPointList) {
    // วนลูป contract point ทั้งหมดที่เกี่ยวข้องกับ nomination point นี้
    ;(
      nominationPoint.contract_point_list ??
      []
    ).map(
      (
        contractPoint: any
      ) => {
        // ดึง contract code list ที่เกี่ยวข้องกับ contract point นี้
        const contractCodeList =
          contractCodeListByContractPoint.get(
            contractPoint.contract_point
          )
        if (
          contractCodeList
        ) {
          // ดึง contract code list ที่มีอยู่แล้วสำหรับ nomination point นี้
          const existingSet =
            contractCodeListByNominationPoint.get(
              nominationPoint.nomination_point
            )
          if (existingSet) {
            // ถ้ามีข้อมูลอยู่แล้ว ให้เพิ่ม contract code ที่ยังไม่มีเข้าไป (ป้องกันการซ้ำ)
            for (
              let i = 0;
              i <
              contractCodeList.length;
              i++
            ) {
              const contractValue =
                contractCodeList[
                  i
                ]
              // ตรวจสอบว่ามี contract code และ contract point นี้อยู่แล้วหรือไม่
              if (
                existingSet.find(
                  (f: {
                    contractCode: string
                    BTUD: number
                    BTUH: number
                    SCFD: number
                    SCFH: number
                    contractPoint: string
                  }) =>
                    f.contractCode ==
                      contractValue.contractCode &&
                    f.contractPoint ==
                      contractValue.contractPoint
                )
              ) {
                continue // ข้ามถ้ามีอยู่แล้ว
              }
              existingSet.push(
                contractValue
              ) // เพิ่มถ้ายังไม่มี
            }
            // contractCodeListByNominationPoint.set(nominationPoint.nomination_point, existingSet);
          } else {
            // ถ้ายังไม่มีข้อมูลสำหรับ nomination point นี้ ให้สร้างใหม่
            contractCodeListByNominationPoint.set(
              nominationPoint.nomination_point,
              contractCodeList
            )
          }
        }
      }
    )
  }

  // วนลูปเพื่อ map ข้อมูล reserve balancing gas contract ไปยัง nomination point
  for (const nominationPoint of nominationPointListForReserveBalancingGasContract) {
    // ดึง reserve balancing gas contract list ที่เกี่ยวข้องกับ nomination point นี้
    const reserveBalancingGasContractList = reserveBalancingGasContractData.filter(item => (item.reserve_balancing_gas_contract_detail || []).some(nom => nom.nomination_point?.nomination_point == nominationPoint.nomination_point))
    if (reserveBalancingGasContractList) {
      // ดึง reserve balancing gas contract list ที่มีอยู่แล้วสำหรับ nomination point นี้
      const existingSet = contractCodeListByNominationPoint.get(nominationPoint.nomination_point)
      if (existingSet) {
        // ถ้ามีข้อมูลอยู่แล้ว ให้เพิ่ม reserve balancing gas contract ที่ยังไม่มีเข้าไป (ป้องกันการซ้ำ)
        for (let i = 0; i < reserveBalancingGasContractList.length; i++) {
          const contractValue = reserveBalancingGasContractList[i]
          // ตรวจสอบว่ามี reserve balancing gas contract
          if (existingSet.find((f: {
              contractCode: string
              BTUD: number
              BTUH: number
              SCFD: number
              SCFH: number
              contractPoint: string
            }) => f.contractCode == contractValue.res_bal_gas_contract)
          ) {
            continue // ข้ามถ้ามีอยู่แล้ว
          }
          const BTUD = contractValue.reserve_balancing_gas_contract_detail
            .filter(nom => nom.nomination_point?.nomination_point == nominationPoint.nomination_point)
            .reduce((acc: number | undefined, curr) => {
              const value = parseToNumber6Decimal(curr.daily_reserve_cap_mmbtu_d)
              if(value || value === 0) {
                if(acc) {
                  return parseToNumber6Decimal(acc + value)
                }
                else{
                  return value
                }
              }
              return acc
            }, undefined)
          existingSet.push({
            contractCodeId: -1,
            contractCode: contractValue.res_bal_gas_contract,
            BTUD: BTUD,
            BTUH: divideTo3Decimal(BTUD, 24),
            SCFD: null,
            SCFH: null,
            contractPoint: '',
            isReserveBalancingGasContract: true
          }) // เพิ่มถ้ายังไม่มี
        }
        // contractCodeListByNominationPoint.set(nominationPoint.nomination_point, existingSet);
      } else {
        // ถ้ายังไม่มีข้อมูลสำหรับ nomination point นี้ ให้สร้างใหม่
        let reserveBalancingGasContractValueList = []
        for (let i = 0; i < reserveBalancingGasContractList.length; i++) {
          const contractValue = reserveBalancingGasContractList[i]
          const BTUD = contractValue.reserve_balancing_gas_contract_detail
            .filter(nom => nom.nomination_point?.nomination_point == nominationPoint.nomination_point)
            .reduce((acc: number | undefined, curr) => {
              const value = parseToNumber6Decimal(curr.daily_reserve_cap_mmbtu_d)
              if(value || value === 0) {
                if(acc) {
                  return parseToNumber6Decimal(acc + value)
                }
                else{
                  return value
                }
              }
              return acc
            }, undefined)

          reserveBalancingGasContractValueList.push({
            contractCodeId: -1,
            contractCode: contractValue.res_bal_gas_contract,
            BTUD: BTUD,
            BTUH: divideTo3Decimal(BTUD, 24),
            SCFD: null,
            SCFH: null,
            contractPoint: '',
            isReserveBalancingGasContract: true
          })
        }
        contractCodeListByNominationPoint.set(
          nominationPoint.nomination_point,
          reserveBalancingGasContractValueList
        )
      }
    }
  }

  return contractCodeListByNominationPoint
}

/**
 * ดึงรายการ nomination point ทั้งหมดที่มาจากสัญญา (contract_code) ที่ยัง Active ในช่วงวันที่ที่กำหนด
 * พร้อมรายละเอียด contract, group (shipper) และข้อมูล booking ที่ผูกกับแต่ละ nomination point
 * @param prisma - PrismaService สำหรับดึงข้อมูลจากฐานข้อมูล
 * @param todayStart - วันที่เริ่มต้นช่วงที่ต้องการตรวจสอบสถานะสัญญา/nomination point
 * @param todayEnd - วันที่สิ้นสุดช่วงที่ต้องการตรวจสอบสถานะสัญญา/nomination point
 * @returns รายการ nomination point พร้อมข้อมูล contract, group และ booking row ที่เกี่ยวข้อง
 */
export async function getNominationPointListFromActiveContractCode({
  prisma,
  todayStart,
  todayEnd
}: {
  prisma: PrismaService
  todayStart: Date
  todayEnd: Date
}) {
  try {
    // หาช่วงสัปดาห์ที่ครอบคลุมวันที่เริ่มต้นและสิ้นสุด (สำหรับดึงข้อมูล weekly nomination)
    const {weekStart} =
      getWeekRange(todayStart)
    const {weekEnd} =
      getWeekRange(todayEnd)

    // ดึงรายการสัญญา (contract_code) ที่ยัง Active อยู่ในช่วงวันที่ todayStart - todayEnd
    const contractData =
      await prisma.contract_code.findMany(
        {
          where: {
            AND: [
              // เริ่มสัญญาก่อนหรือในวันสิ้นสุดช่วงค้นหา
              {
                contract_start_date:
                  {
                    lte: todayEnd
                  }
              }, // Started before or on target date
              // ไม่เอาสัญญาที่ถูก Reject ออกไปแล้ว
              {
                status_capacity_request_management:
                  {
                    NOT: {
                      name: {
                        equals:
                          'Rejected',
                        mode: 'insensitive'
                      }
                    }
                  }
              },
              // ตัดสัญญาที่ terminate แล้ว (ถ้ามี terminate_date และ <= todayStart ให้ถือว่าไม่ active)
              {
                OR: [
                  {
                    terminate_date:
                      null
                  }, // No terminate date
                  {
                    terminate_date:
                      {
                        gt: todayStart
                      }
                  } // Terminate date is after target date
                ]
              },
              // เงื่อนไขวันสิ้นสุดสัญญา: ถ้ามี extend_deadline ให้ใช้เป็นวันสิ้นสุดแทน contract_end_date
              {
                OR: [
                  // ใช้ extend_deadline ถ้ามีค่า และยังมากกว่า todayStart (ยัง active)
                  {
                    AND: [
                      {
                        extend_deadline:
                          {
                            not: null
                          }
                      },
                      {
                        extend_deadline:
                          {
                            gt: todayStart
                          }
                      }
                    ]
                  },
                  // ถ้า extend_deadline เป็น null ให้ใช้ contract_end_date แทน (หรือไม่มีวันสิ้นสุด)
                  {
                    AND: [
                      {
                        extend_deadline:
                          null
                      },
                      {
                        OR: [
                          {
                            contract_end_date:
                              null
                          },
                          {
                            contract_end_date:
                              {
                                gt: todayStart
                              }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          select: {
            id: true,
            contract_code: true,
            contract_start_date: true,
            contract_end_date: true,
            extend_deadline: true,
            terminate_date: true,
            // ดึง booking_version ล่าสุดที่ถูกใช้งาน (flag_use = true)
            booking_version: {
              where: {
                flag_use: true
              },
              orderBy: {
                id: 'desc'
              },
              take: 1,
              select: {
                // booking_row_json: capacity ปกติ
                booking_row_json:
                  {
                    where: {
                      OR: [
                        {
                          flag_use: true
                        },
                        {
                          flag_use:
                            null
                        }
                      ]
                    },
                    select: {
                      contract_point: true,
                      entry_exit:
                        {
                          select:
                            {
                              id: true,
                              name: true,
                              color: true
                            }
                        },
                      zone_text: true,
                      area_text: true
                    }
                  },
                // booking_row_json_release: capacity ที่คืน (release)
                booking_row_json_release:
                  {
                    where: {
                      OR: [
                        {
                          flag_use: true
                        },
                        {
                          flag_use:
                            null
                        }
                      ]
                    },
                    select: {
                      contract_point: true,
                      entry_exit:
                        {
                          select:
                            {
                              id: true,
                              name: true,
                              color: true
                            }
                        },
                      zone_text: true,
                      area_text: true
                    }
                  }
              }
            },
            // ดึงข้อมูล group (shipper) ที่ผูกกับ contract นี้
            group: {
              select: {
                id: true,
                name: true,
                id_name: true,
                company_name: true
              }
            },
            term_type_id: true,
            query_shipper_nomination_file:
              {
                where: {
                  AND: [
                    {
                      OR: [
                        {
                          // nomination รายวัน (type 1) ที่อยู่ในช่วงวันที่ที่เลือก
                          nomination_type:
                            {
                              id: 1
                            },
                          gas_day:
                            {
                              gte: todayStart,
                              lte: todayEnd
                            }
                        },
                        {
                          // nomination รายสัปดาห์ (type 2) ที่อยู่ในช่วงสัปดาห์ที่ครอบคลุมวันที่เลือก
                          nomination_type:
                            {
                              id: 2
                            },
                          gas_day:
                            {
                              gte: weekStart,
                              lte: weekEnd
                            }
                        }
                      ]
                    },
                    // เฉพาะรายการที่ไม่ถูกลบ
                    {
                      OR: [
                        {
                          del_flag: false
                        },
                        {
                          del_flag:
                            null
                        }
                      ]
                    },
                    // เฉพาะ status 2 (Approved) และ 5 (Approved by System)
                    {
                      query_shipper_nomination_status:
                        {
                          id: {
                            in: [
                              2,
                              5
                            ]
                          }
                        }
                    }
                  ]
                },
                select: {
                  id: true,
                  nomination_code: true,
                  nomination_type_id: true,
                  gas_day: true,
                  contract_code_id: true,
                  reserve_balancing_gas_contract_id: true
                }
              }
          }
        }
      )

    // เก็บ list ของ contract_point ทั้งหมดที่เจอจาก contract ที่ active
    const contractPointListFromContract: string[] =
      []
    // เก็บรายละเอียด booking row ทั้งหมด (รวมข้อมูล contract และ group เข้าไปด้วย)
    const bookingRowJsonList: any[] =
      []
    for (const contract of contractData) {
      (contract.booking_version?.[0]?.booking_row_json ??[])
        // เอาเฉพาะ row ที่มี contract_point
        .filter(
          (bookingRowJson) =>
            bookingRowJson.contract_point
        )
        .map(
          (
            bookingRowJson
          ) => {
            // เก็บ contract_point ลงใน list (กันซ้ำด้วย includes)
            if (
              !contractPointListFromContract.includes(
                bookingRowJson.contract_point
              )
            ) {
              contractPointListFromContract.push(
                bookingRowJson.contract_point
              )
            }

            const dailyNominationList =
              contract.query_shipper_nomination_file.filter(
                (
                  nominationFile
                ) =>
                  nominationFile.nomination_type_id ==
                  1
              )

            // กรองข้อมูลการเสนอราคารายสัปดาห์สำหรับสัปดาห์ปัจจุบัน
            // และไม่ซ้ำกับข้อมูลรายวันที่มีสัญญาเดียวกัน
            const weeklyNominationList =
              contract.query_shipper_nomination_file.filter(
                (
                  nominationFile
                ) =>
                  nominationFile.nomination_type_id ==
                  2
              )

            dailyNominationList.map(
              (
                queryShipperNominationFile
              ) => {
                // รวมข้อมูล contract, group และ booking_row_json ไว้เป็น object เดียว
                bookingRowJsonList.push(
                  {
                    contract_code_id:
                      contract.id,
                    contract_code:
                      contract.contract_code,
                    contract_start_date:
                      contract.contract_start_date,
                    contract_end_date: contract.terminate_date || contract.extend_deadline || contract.contract_end_date,
                    term_type_id:
                      contract.term_type_id,
                    group_id:
                      contract
                        .group
                        ?.id,
                    group_name:
                      contract
                        .group
                        ?.name,
                    group_id_name:
                      contract
                        .group
                        ?.id_name,
                    group_company_name:
                      contract
                        .group
                        ?.company_name,
                    nomination_file_id:
                      queryShipperNominationFile.id,
                    nomination_code:
                      queryShipperNominationFile.nomination_code,
                    nomination_type_id:
                      queryShipperNominationFile.nomination_type_id,
                    ...bookingRowJson
                  }
                )
              }
            )

            weeklyNominationList.map(
              (
                queryShipperNominationFile
              ) => {
                if (
                  !bookingRowJsonList.some(
                    (
                      existItem
                    ) =>
                      existItem.contract_point ===
                        bookingRowJson.contract_point &&
                      existItem.contract_code_id ==
                        contract.id &&
                      existItem.group_id ==
                        contract
                          .group
                          ?.id
                  )
                ) {
                  bookingRowJsonList.push(
                    {
                      contract_code_id:
                        contract.id,
                      contract_code:
                        contract.contract_code,
                      contract_start_date:
                        contract.contract_start_date,
                      contract_end_date: contract.terminate_date || contract.extend_deadline || contract.contract_end_date,
                      term_type_id:
                        contract.term_type_id,
                      group_id:
                        contract
                          .group
                          ?.id,
                      group_name:
                        contract
                          .group
                          ?.name,
                      group_id_name:
                        contract
                          .group
                          ?.id_name,
                      group_company_name:
                        contract
                          .group
                          ?.company_name,
                      nomination_file_id:
                        queryShipperNominationFile.id,
                      nomination_code:
                        queryShipperNominationFile.nomination_code,
                      nomination_type_id:
                        queryShipperNominationFile.nomination_type_id,
                      ...bookingRowJson
                    }
                  )
                }
              }
            )

            if(
              !bookingRowJsonList.some((item) => 
                item.contract_point == bookingRowJson.contract_point &&
                item.contract_code_id == contract.id &&
                item.group_id == contract.group?.id
              )
            ){
              bookingRowJsonList.push(
                {
                  contract_code_id: contract.id,
                  contract_code: contract.contract_code,
                  contract_start_date: contract.contract_start_date,
                  contract_end_date: contract.terminate_date || contract.extend_deadline || contract.contract_end_date,
                  term_type_id: contract.term_type_id,
                  group_id: contract.group?.id,
                  group_name: contract.group?.name,
                  group_id_name: contract.group?.id_name,
                  group_company_name: contract.group?.company_name,
                  nomination_file_id: undefined,
                  nomination_code: undefined,
                  nomination_type_id: undefined,
                  ...bookingRowJson
                }
              )
            }
          }
        )
    }

    const reserveBalancingGasContractData = await prisma.reserve_balancing_gas_contract.findMany({
      where: {
        reserve_balancing_gas_contract_detail: {
          some: {
            start_date: {
              lte: todayEnd,
            },
            end_date: {
              gt: todayStart,
            },
          },
        },
        // query_shipper_nomination_file: {
        //   some: {
        //     AND: [
        //       {
        //         OR: [
        //           {
        //             nomination_type_id: 1,
        //             gas_day: {
        //               gte: todayStart,
        //               lte: todayEnd,
        //             },
        //           },
        //           {
        //             AND: [
        //               {
        //                 nomination_type_id: 2,
        //                 gas_day: {
        //                   gte: weekStart,
        //                   lte: weekEnd,
        //                 },
        //               },
        //             ],
        //           },
        //         ],
        //       },
        //       {
        //         query_shipper_nomination_status: {
        //           id: {
        //             in: [2, 5], // ['Approved', 'Approved by System']
        //           },
        //         },
        //       },
        //       {
        //         OR: [
        //           {
        //             del_flag: false,
        //           },
        //           {
        //             del_flag: null,
        //           },
        //         ],
        //       },
        //       {
        //         nomination_version: {
        //           some: {
        //             flag_use: true,
        //           },
        //         },
        //       },
        //     ],
        //   },
        // },
      },
      select: {
        id: true,
        res_bal_gas_contract: true,
        reserve_balancing_gas_contract_detail: {
          select: {
            nomination_point_id: true,
            nomination_point: true,
            daily_reserve_cap_mmbtu_d: true
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            id_name: true,
          },
        },
      },
    })

    // ดึงรายการ nomination_point ที่ผูกกับ contract_point ที่ได้มาจากสัญญา และยัง active อยู่ในช่วงวันที่ todayStart - todayEnd
    const nominationPointList =
      await prisma.nomination_point.findMany(
        {
          where: {
            contract_point_list:
              {
                some: {
                  contract_point:
                    {
                      in: contractPointListFromContract // ใช้ contract point ทั้งหมดที่พบเป็นเงื่อนไข
                    },
                  // ช่วงวันที่ของ contract_point ต้องครอบคลุมช่วงที่สนใจ
                  contract_point_start_date:
                    {
                      lte: todayEnd
                    },
                  OR: [
                    {
                      contract_point_end_date:
                        null
                    },
                    {
                      contract_point_end_date:
                        {
                          gt: todayStart
                        }
                    }
                  ]
                }
              },
            // ช่วงวันที่ของ nomination_point ต้องครอบคลุมช่วงที่สนใจ
            start_date: {
              lte: todayEnd
            },
            OR: [
              {
                end_date: null
              },
              {
                end_date: {
                  gt: todayStart
                }
              }
            ]
          },
          select: {
            id: true,
            nomination_point: true,
            contract_point_list:
              {
                select: {
                  id: true,
                  contract_point: true
                }
              },
            area: true
          }
        }
      )

    // map nomination_point กับ bookingRowJson (contract + group + contract_point)
    const result: any[] = []
    for (const nominationPoint of nominationPointList) {
      // หา booking row ที่ contract_point อยู่ใน contract_point_list ของ nomination_point นั้น
      const contractPointList =
        bookingRowJsonList.filter(
          (bookingRowJson) =>
            nominationPoint.contract_point_list
              .map(
                (
                  contractPoint
                ) =>
                  contractPoint.contract_point
              )
              .includes(
                bookingRowJson.contract_point
              )
        )
      for (const contractPoint of contractPointList) {
        // push ข้อมูลรวม: nomination_point + contract + group + booking row
        result.push({
          nomination_point_id:
            nominationPoint.id,
          nomination_point:
            nominationPoint.nomination_point,
          area: nominationPoint.area,
          ...contractPoint
        })
      }
      const matchNominationPointListOfReserveBalancingGasContract = reserveBalancingGasContractData.map(item => {
        return {
          ...item,
          reserve_balancing_gas_contract_detail: (item.reserve_balancing_gas_contract_detail || [])
          .filter(nom => nom.nomination_point?.nomination_point == nominationPoint.nomination_point)
        }
      })
      .filter(item => item.reserve_balancing_gas_contract_detail.length > 0)
      
      for (const reserveBalancingGasContract of matchNominationPointListOfReserveBalancingGasContract) {
        for (const reserveBalancingGasContractDetail of reserveBalancingGasContract.reserve_balancing_gas_contract_detail) {
          const {nomination_point: nominationPointData, ...detail } = reserveBalancingGasContractDetail
          // push ข้อมูลรวม: nomination_point + reserve_balancing_gas_contract + group
          result.push({
            nomination_point_id:
              nominationPoint.id,
            nomination_point:
              nominationPoint.nomination_point,
            area: nominationPoint.area,
            isReserveBalancingGasContract: true,
            reserve_balancing_gas_contract_id: reserveBalancingGasContract.id,
            reserve_balancing_gas_contract: reserveBalancingGasContract.res_bal_gas_contract,
            ...detail
          })
        }
      }
    }

    return result
  } catch (error) {
    // ถ้าเกิด error ให้คืน array ว่าง (ป้องกันไม่ให้ระบบล้ม)
    return []
  }
}

/**
 * คำนวณข้อมูล Nomination + Daily Adjustment ตามช่วงวันที่ที่กำหนด
 * แล้วจัดให้อยู่ในรูปแบบตาม nomination point/contract/กลุ่ม พร้อมข้อมูลรายชั่วโมง
 * @param prisma - PrismaService สำหรับดึงข้อมูล nomination, daily adjustment และ master data
 * @param startDate - วันที่เริ่มต้นของช่วงคำนวณ (string/Date ที่รองรับโดย date util)
 * @param endDate - วันที่สิ้นสุดของช่วงคำนวณ (string/Date ที่รองรับโดย date util)
 * @returns รายการข้อมูลที่จัดกลุ่มตาม nomination point + contract + group พร้อม timeShow รายชั่วโมง และผลจากการ adjust แล้ว
 */
export async function getAdjustNom({
  prisma,
  startDate,
  endDate
}: {
  prisma: PrismaService
  startDate: any
  endDate: any
}) {
  // แปลงวันที่เริ่มต้นและสิ้นสุดเป็น dayjs object
  const startDayjs =
    getTodayNowDDMMYYYYAdd7(
      startDate
    )
  const endDayjs =
    getTodayNowDDMMYYYYAdd7(
      endDate
    )
  const todayStart =
    startDayjs.toDate()
  const todayEnd =
    endDayjs.toDate()

  // หาช่วงสัปดาห์ที่ครอบคลุมวันที่เริ่มต้นและสิ้นสุด (สำหรับดึงข้อมูล weekly nomination)
  const {
    weekStart: targetWeekStart
  } = getWeekRange(todayStart)
  const {
    weekEnd: targetWeekEnd
  } = getWeekRange(todayEnd)

  // ดึงข้อมูล nomination files ทั้งแบบรายวัน (type 1) และรายสัปดาห์ (type 2)
  const nominationData: queryShipperNominationFileWithRelationsForCal[] =
    await prisma.query_shipper_nomination_file.findMany(
      {
        where: {
          NOT: {
            contract_code_id:
              null
          }, // revers bal ไม่แสดง effect
          AND: [
            {
              OR: [
                {
                  // nomination รายวัน (type 1) ที่อยู่ในช่วงวันที่ที่เลือก
                  nomination_type:
                    {id: 1},
                  gas_day: {
                    gte: todayStart,
                    lte: todayEnd
                  }
                },
                {
                  // nomination รายสัปดาห์ (type 2) ที่อยู่ในช่วงสัปดาห์ที่ครอบคลุมวันที่เลือก
                  nomination_type:
                    {id: 2},
                  gas_day: {
                    gte: targetWeekStart,
                    lte: targetWeekEnd
                  }
                }
              ]
            },
            // เฉพาะรายการที่ไม่ถูกลบ
            {
              OR: [
                {
                  del_flag: false
                },
                {
                  del_flag:
                    null
                }
              ]
            },
            // เฉพาะ status 2 (Approved) และ 5 (Approved by System)
            {
              query_shipper_nomination_status:
                {
                  id: {
                    in: [2, 5]
                  }
                }
            }
          ]
        },
        ...queryShipperNominationFilePopulateForCal,
        orderBy: [
          {
            nomination_type_id:
              'asc'
          },
          {id: 'desc'}
        ]
      }
    )

  // ดึงข้อมูล daily adjustment ที่ถูก approve (status 2) ในช่วงวันที่ที่เลือก
  const dailyAdjust =
    await prisma.daily_adjustment.findMany(
      {
        where: {
          daily_adjustment_status_id: 2, // เฉพาะที่ approved
          gas_day: {
            gte: getTodayStartDDMMYYYYAdd7(
              startDate
            ).toDate(),
            lte: getTodayEndDDMMYYYYAdd7(
              endDate
            ).toDate()
          }
        },
        orderBy: {
          create_date: 'asc'
        }, // เรียงตามวันที่สร้างเพื่อประมวลผล adjustment ตามลำดับเวลา
        select: {
          id: true,
          create_date: true,
          gas_day: true,
          time: true,
          daily_code: true,
          daily_adjustment_group:
            {
              select: {
                group: {
                  select: {
                    id: true,
                    id_name: true,
                    name: true,
                    contract_code:
                      {
                        select:
                          {
                            id: true,
                            contract_code: true
                          }
                      }
                  }
                }
              }
            },
          daily_adjustment_nom:
            {
              select: {
                heating_value: true, // heating value (BTU/SCF)
                valume_mmscfd: true, // ปริมาณต่อวัน (MMSCFD)
                valume_mmscfh: true, // ปริมาณต่อชั่วโมง (MMSCFH)
                valume_mmscfd2: true, // energy ต่อวัน (MMBTU/D)
                valume_mmscfh2: true, // energy ต่อชั่วโมง (MMBTU/H)
                nomination_point:
                  {
                    select: {
                      nomination_point: true,
                      zone: true,
                      area: true,
                      entry_exit: true
                    }
                  }
              }
            }
        }
        // orderBy: [
        //   {
        //     gas_day: 'asc',
        //   },
        //   {
        //     time: 'asc',
        //   },
        // ],
      }
    )

  // ดึงข้อมูลสัญญเพื่อนำค่ามาใช้แทนในกรณีที่ไม่มีการ nomination เข้ามา
  const dailyAdjustGroupIDList =
    Array.from(
      new Set(
        dailyAdjust.flatMap(
          (item: any) =>
            item.daily_adjustment_group.map(
              (group: any) =>
                group.group.id
            )
        )
      )
    )
  const contractCodeListByNominationPoint =
    await getContractCodeValueByNominationPoint(
      {
        prisma,
        startDayjs,
        todayStart,
        todayEnd,
        dailyAdjustGroupIDList
      }
    )

  const areaMaster =
    await prisma.area.findMany(
      {
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
                  end_date:
                    null
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
          zone: {
            select: {
              id: true,
              name: true
            }
          },
          entry_exit: {
            select: {
              id: true,
              name: true
            }
          },
          supply_reference_quality_area_by:
            {
              select: {
                id: true,
                name: true,
                start_date: true,
                end_date: true
              }
            }
        },
        orderBy: {
          id: 'desc'
        }
      }
    )

  const eachDateHvFromEntryArea: Map<
    string,
    Map<
      string,
      areaHvDataType
    >
  > = new Map()

  // สร้าง array สำหรับเก็บผลลัพธ์
  const result: adjustNomDataType[] =
    []

  let currentDate =
    endDayjs.clone()

  // วนลูปย้อนหลังจากวันสุดท้ายไปวันแรก
  while (
    currentDate.isSameOrAfter(
      startDayjs
    )
  ) {
    // // กรอง nomination แบบรายวันสำหรับวันที่กำลังประมวลผล
    // const dailyNominationList = nominationData.filter(
    //   nominationFile =>
    //     dayjs(nominationFile.gas_day).isSame(currentDate, 'day') &&
    //     nominationFile.nomination_type_id == 1
    // );

    // // กรอง nomination แบบรายสัปดาห์สำหรับสัปดาห์ที่กำลังประมวลผล
    // // ข้ามถ้ามี daily nomination สำหรับ contract เดียวกันแล้ว (daily nomination มีลำดับความสำคัญสูงกว่า)
    // const weeklyNominationList = nominationData.filter(
    //   nominationFile =>
    //     dayjs(nominationFile.gas_day).isSame(currentDate, 'week') &&
    //     nominationFile.nomination_type_id == 2 &&
    //     !dailyNominationList.some(daily => daily.contract_code_id == nominationFile.contract_code_id)
    // );

    const hvFromEntryArea =
      await findHvFromEntryArea(
        {
          prisma,
          targetArea: '',
          gasDate:
            currentDate.toDate(),
          dataList:
            nominationData
        }
      )

    eachDateHvFromEntryArea.set(
      currentDate
        .tz('Asia/Bangkok')
        .format('DD/MM/YYYY'),
      hvFromEntryArea
    )

    // [...dailyNominationList, ...weeklyNominationList].map(nominationFile => {
    nominationData.map(
      (nominationFile) => {
        nominationFile.nomination_version.map(
          (
            nominationVersion
          ) => {
            nominationVersion.nomination_row_json.map(
              (
                nominationRowJson
              ) => {
                // แปลง JSON string เป็น object
                const nominationRowJsonDataTemp =
                  JSON.parse(
                    nominationRowJson.data_temp
                  )

                // อ่านข้อมูลจาก JSON ตามตำแหน่งที่กำหนด
                const zone =
                  nominationRowJsonDataTemp[
                    '0'
                  ]
                const area =
                  nominationRowJsonDataTemp[
                    '2'
                  ]
                const point =
                  nominationRowJsonDataTemp[
                    '3'
                  ]
                const unit =
                  nominationRowJsonDataTemp[
                    '9'
                  ]
                const entryExit =
                  nominationRowJsonDataTemp[
                    '10'
                  ]
                // const wi = parseToNumber(nominationRowJsonDataTemp['11'])
                // const hv = parseToNumber(nominationRowJsonDataTemp['12'])
                // const sg = parseToNumber(nominationRowJsonDataTemp['13'])

                // ข้ามถ้าไม่มีข้อมูล zone, area (ต้องเป็น nomination point)
                // ข้ามถ้าไม่ใช่หน่วย MMBTU/D หรือ MMSCFD
                if (
                  !zone ||
                  !area ||
                  (!isMatch(
                    unit,
                    'MMBTU/D'
                  ) &&
                  !isMatch(
                    unit,
                    'MMBTU/H'
                  ) &&
                    !isMatch(
                      unit,
                      'MMSCFD'
                    ))
                ) {
                  return
                }
                if (
                  nominationFile.nomination_type_id ==
                    2 &&
                  result.some(
                    (f) => {
                      return (
                        f?.point === point &&
                        f?.zone_text ===
                          nominationRowJson.zone_text &&
                        f?.area_text ===
                          nominationRowJson.area_text &&
                        f?.entryExit === entryExit &&
                        f?.gas_day ===
                          currentDate.format(
                            'DD/MM/YYYY'
                          ) &&
                        f?.shipper_id_name ===
                          nominationFile
                            .group
                            ?.id_name &&
                        f?.contract_code_id ===
                          nominationFile.contract_code_id &&
                        f?.totalType ===
                          'daily' &&
                        f?.nomination_type_id ===
                          1
                      )
                    }
                  )
                ) {
                  return
                }

                // ดึงค่าตามวันในสัปดาห์ (Sunday = 0, Monday = 1, ..., Saturday = 6)
                const dayOfWeek =
                  Number(
                    currentDate
                      .tz(
                        'Asia/Bangkok'
                      )
                      .format(
                        'd'
                      )
                  ) // วันในสัปดาห์ (0 = Sunday, 6 = Saturday)
                let vi = null
                let hourlyVi =
                  null
                if (
                  nominationFile.nomination_type_id ==
                  2
                ) {
                  vi =
                    readNomFromJsonAs3Decimal(
                      nominationRowJsonDataTemp,
                      `${14 + dayOfWeek}`
                    )
                  // แบ่งค่ารายวันด้วย 24 เพื่อได้ค่ารายชั่วโมง
                  hourlyVi =
                    vi == null
                      ? null
                      : parseFloat(
                          (
                            vi /
                            24
                          ).toFixed(
                            3
                          )
                        )
                } else {
                  vi =
                    readNomFromJsonAs3Decimal(
                      nominationRowJsonDataTemp,
                      '38'
                    )
                }

                // หาว่ามี point นี้ใน result แล้วหรือยัง (เช็คตาม point, zone, area, entryExit, gas_day, group, contract, nomination)
                let existPointIndex =
                  result.findIndex(
                    (
                      f: any
                    ) => {
                      return (
                        f?.point === point &&
                        f?.zone_text ===
                          nominationRowJson.zone_text &&
                        f?.area_text ===
                          nominationRowJson.area_text &&
                        f?.entryExit === entryExit &&
                        f?.gas_day ===
                          currentDate
                            .tz(
                              'Asia/Bangkok'
                            )
                            .format(
                              'DD/MM/YYYY'
                            ) &&
                        f?.group_id ===
                          nominationFile.group_id &&
                        f?.contract_code_id ===
                          nominationFile.contract_code_id &&
                        f?.nomination_id ===
                          nominationFile.id
                      )
                    }
                  )
                let timeShow: timeShowDataType[] =
                  []

                // ถ้ายังไม่มี point นี้ใน result ให้สร้างใหม่
                if (
                  existPointIndex <
                  0
                ) {
                  existPointIndex =
                    result.length
                  result.push(
                    {
                      gas_day:
                        currentDate
                          .tz(
                            'Asia/Bangkok'
                          )
                          .format(
                            'DD/MM/YYYY'
                          ),
                      group_id:
                        nominationFile.group_id,
                      shipper_name:
                        nominationFile
                          .group
                          ?.name,
                      shipper_id_name:
                        nominationFile
                          .group
                          ?.id_name,
                      contract:
                        nominationFile
                          .contract_code
                          ?.contract_code || nominationFile.reserve_balancing_gas_contract?.res_bal_gas_contract,
                      contract_code_id:
                        nominationFile.contract_code_id,
                      reserve_balancing_gas_contract_id: nominationFile.reserve_balancing_gas_contract_id,
                      nomination_id:
                        nominationFile.id,
                      nomination_code:
                        nominationFile.nomination_code,
                      zone_text:
                        nominationRowJson.zone_text,
                      area_text:
                        nominationRowJson.area_text,
                      // "unit": unit,
                      point:
                        point,
                      entryExit:
                        entryExit,
                      total:
                        vi,
                      totalMmscfd: isMatch(unit, 'MMSCFD') ? vi : null,
                      totalType:
                        nominationFile.nomination_type_id ==
                        2
                          ? 'weekly'
                          : 'daily',
                      nomination_type_id:
                        nominationFile.nomination_type_id,
                      timeShow:
                        []
                    }
                  )
                } else {
                  // ถ้ามี point นี้แล้ว ให้ใช้ timeShowtimeShow ที่มีอยู่
                  timeShow =
                    result[
                      existPointIndex
                    ].timeShow
                }

                let hvFromEntryAreaData: areaHvDataType | undefined;
                if (
                  (
                  isMatch(
                    unit,
                    'MMBTU/D'
                  ) ||
                  isMatch(
                    unit,
                    'MMBTU/H'
                  )
                  ) &&
                  isMatch(
                    entryExit,
                    'Exit'
                  )
                ) {
                  const referenceArea =
                    areaMaster.find(
                      (
                        areaObj: any
                      ) =>
                        isMatch(
                          areaObj.name,
                          area
                        ) &&
                        isMatch(
                          areaObj
                            .zone
                            .name,
                          zone
                        ) &&
                        isMatch(
                          areaObj
                            .entry_exit
                            .name,
                          entryExit
                        )
                    )?.supply_reference_quality_area_by

                  const keyForHv = `${`${zone}`.trim().toLowerCase()}-${`${referenceArea?.name ?? area}`.trim().toLowerCase()}`
                  if (
                    hvFromEntryArea.has(
                      keyForHv
                    )
                  ) {
                    hvFromEntryAreaData =
                      hvFromEntryArea.get(
                        keyForHv
                      )
                  }
                }

                // ดึงข้อมูลรายชั่วโมง (24 ชั่วโมง) จาก JSON
                // ข้อมูลชั่วโมงเริ่มที่ตำแหน่ง 14 (H1 = 00:00, H2 = 01:00, ..., H24 = 23:00)
                const h1Key = 14
                for (
                  let i = 0;
                  i <= 23;
                  i++
                ) {
                  if (
                    nominationFile.nomination_type_id ==
                    1
                  ) {
                    hourlyVi =
                      readNomFromJsonAs3Decimal(
                        nominationRowJsonDataTemp,
                        `${h1Key + i}`
                      )
                  }
                  const key = `${i.toString().padStart(2, '0')}:00`
                  const heatingValueFromNomList: {
                    sumHvMultiplyVi: number
                    sumVi: number
                  }[] = []
                  let valueMmscfd =
                    null
                  let valueMmscfh =
                    null
                  if (
                    hvFromEntryAreaData
                  ) {
                    heatingValueFromNomList.push(
                      {
                        sumHvMultiplyVi:
                          hvFromEntryAreaData.sumHvMultiplyVi,
                        sumVi:
                          hvFromEntryAreaData.sumVi
                      }
                    )
                    if (
                      (hvFromEntryAreaData.sumHvMultiplyVi ||
                        hvFromEntryAreaData.sumHvMultiplyVi ==
                          0) &&
                      hvFromEntryAreaData.sumVi
                    ) {
                      const calculatedHeatingValueFromNom =
                        hvFromEntryAreaData.sumHvMultiplyVi /
                        hvFromEntryAreaData.sumVi
                      if (
                        vi !=
                        null
                      ) {
                        valueMmscfd =
                          vi /
                          calculatedHeatingValueFromNom
                      }
                      if (
                        hourlyVi !=
                        null
                      ) {
                        valueMmscfh =
                          hourlyVi /
                          calculatedHeatingValueFromNom
                      }
                    }
                  }

                  // หาว่ามีเวลานี้ใน timeShow แล้วหรือยัง
                  const timeShowIndex =
                    timeShow.findIndex(
                      (
                        f: any
                      ) => {
                        return (
                          f.time ===
                          key
                        )
                      }
                    )
                  if (
                    timeShowIndex <
                    0
                  ) {
                    // ถ้ายังไม่มี ให้สร้างใหม่
                    if (
                      isMatch(
                        unit,
                        'MMBTU/D'
                      ) ||
                      isMatch(
                        unit,
                        'MMBTU/H'
                      )
                    ) {
                      timeShow.push(
                        {
                          time: key,
                          value:
                            vi,
                          valueMmscfd:
                            valueMmscfd,
                          valuePerHour:
                            hourlyVi,
                          valueMmscfh:
                            valueMmscfh,
                          heatingValueFromNomList:
                            heatingValueFromNomList,
                          heatingValueFromAdjust:
                            null,
                          volumeFromAdjust:
                            null
                        }
                      )
                    } else if (
                      isMatch(
                        unit,
                        'MMSCFD'
                      )
                    ) {
                      timeShow.push(
                        {
                          time: key,
                          value:
                            null,
                          valueMmscfd:
                            vi,
                          valuePerHour:
                            null,
                          valueMmscfh:
                            hourlyVi,
                          heatingValueFromNomList:
                            heatingValueFromNomList,
                          heatingValueFromAdjust:
                            null,
                          volumeFromAdjust:
                            null
                        }
                      )
                    }
                  } else {
                    // ถ้ามีแล้ว ให้บวกค่าเข้าไป (กรณีมีหลาย row สำหรับ point เดียวกัน)
                    let timeShowValue =
                      null
                    let timeShowValuePerHour =
                      null
                    let newVi =
                      vi
                    let newHourlyVi =
                      hourlyVi
                    if (
                      isMatch(
                        unit,
                        'MMBTU/D'
                      )
                      ||
                      isMatch(
                        unit,
                        'MMBTU/H'
                      )
                    ) {
                      timeShowValue =
                        timeShow[
                          timeShowIndex
                        ]
                          .value
                      timeShowValuePerHour =
                        timeShow[
                          timeShowIndex
                        ]
                          .valuePerHour
                      if (
                        isMatch(
                          entryExit,
                          'Exit'
                        )
                      ) {
                        newVi =
                          valueMmscfd
                        newHourlyVi =
                          valueMmscfh
                      }
                    } else {
                      timeShowValue =
                        timeShow[
                          timeShowIndex
                        ]
                          .valueMmscfd
                      timeShowValuePerHour =
                        timeShow[
                          timeShowIndex
                        ]
                          .valueMmscfh
                    }
                    if (
                      timeShowValue !=
                      null
                    ) {
                      if (
                        newVi !=
                        null
                      ) {
                        timeShowValue +=
                          newVi
                      }
                    } else {
                      if (
                        newVi !=
                        null
                      ) {
                        timeShowValue =
                          newVi
                      }
                    }
                    if (
                      timeShowValuePerHour !=
                      null
                    ) {
                      if (
                        newHourlyVi !=
                        null
                      ) {
                        timeShowValuePerHour +=
                          newHourlyVi
                      }
                    } else {
                      timeShowValuePerHour =
                        newHourlyVi
                    }
                    if (
                      isMatch(
                        unit,
                        'MMBTU/D'
                      )
                      ||
                      isMatch(
                        unit,
                        'MMBTU/H'
                      )
                    ) {
                      timeShow[
                        timeShowIndex
                      ].value =
                        timeShowValue
                      timeShow[
                        timeShowIndex
                      ].valuePerHour =
                        timeShowValuePerHour
                    } else {
                      timeShow[
                        timeShowIndex
                      ].valueMmscfd =
                        timeShowValue
                      timeShow[
                        timeShowIndex
                      ].valueMmscfh =
                        timeShowValuePerHour
                    }
                  }
                }
                result[
                  existPointIndex
                ].timeShow =
                  timeShow
              }
            )
          }
        )
      }
    )

    // ไปวันก่อนหน้า
    currentDate =
      currentDate.subtract(
        1,
        'day'
      )
  }

  // เก็บประวัติการ adjust เพื่อจัดการกับการ adjust ซ้อนทับกัน
  const adjustHistory: {
    nomination_point: string
    zone_text: string
    area_text: string
    entry_exit_name: string
    gas_day: string
    group_id: number
    timeMinutes: number
    time: string
  }[] = []

  // ประมวลผล daily adjustment ทีละรายการ (เรียงตามเวลาที่สร้าง)
  for (const adjust of dailyAdjust) {
    const adjustTime =
      adjust.time // เวลาที่ทำการ adjust (เช่น "14:30")
    // แปลง adjustment time เป็นนาที (เพื่อใช้ในการเปรียบเทียบ)
    const adjustTimeMinutes =
      timeToMinutes(
        adjustTime
      )

    const hvFromEntryArea =
      eachDateHvFromEntryArea.get(
        dayjs(adjust.gas_day)
          .tz('Asia/Bangkok')
          .format(
            'DD/MM/YYYY'
          )
      )

    // วนลูปแต่ละ nomination point ที่ต้องการ adjust
    for (const dailyAdjustmentNom of adjust.daily_adjustment_nom) {
      // ดึงค่า adjust value (ใช้ค่ารายชั่วโมงถ้ามี ถ้าไม่มีให้แบ่งค่ารายวันด้วย 24)
      const adjustEnergy =
        parseToNumber3Decimal(
          dailyAdjustmentNom.valume_mmscfh2
        ) ??
        parseToNumber3Decimal(
          dailyAdjustmentNom.valume_mmscfd2
        ) / 24
      const adjustVolume =
        parseToNumber3Decimal(
          dailyAdjustmentNom.valume_mmscfh
        ) ??
        parseToNumber3Decimal(
          dailyAdjustmentNom.valume_mmscfd
        ) / 24
      const heatingValue =
        parseToNumber3Decimal(
          dailyAdjustmentNom.heating_value
        )

      // เก็บค่าก่อน adjust ของแต่ละ result item ที่ตรงกับเงื่อนไข (key = index ใน result, value = ค่าก่อน adjust)
      const energyBeforeAdjustInThisRound =
        new Map<
          number,
          number
        >()
      const volumeBeforeAdjustInThisRound =
        new Map<
          number,
          number
        >()
      const valueByContractCodeAndContractPoint =
        new Map<
          number,
          Map<
            number,
            {
              BTUD: number
              BTUH: number
              SCFD: number
              SCFH: number
            }
          >
        >()

      // ต้องเอาค่า book มาแทนตอนไม่มี nom
      if (
        result.every(
          (item: any) =>
            item.point !=
            dailyAdjustmentNom
              .nomination_point
              .nomination_point
        )
      ) {
        const allContracts =
          contractCodeListByNominationPoint.get(
            dailyAdjustmentNom
              .nomination_point
              .nomination_point
          ) || []
        if (
          allContracts.length >
          0
        ) {
          const uniqeContractPoint: {
            group_id: number
            shipper_name: string
            shipper_id_name: string
            contractCodeId: number
            contractCode: string
            BTUD: number
            BTUH: number
            SCFD: number
            SCFH: number
            contractPoint: string
            isReserveBalancingGasContract?: boolean
          }[] = []
          // สร้าง array สำหรับเก็บ contract code ที่ไม่ซ้ำกัน
          const uniqeContractCode: string[] =
            []

          // วนลูปเพื่อแยก contract code และ contract point ที่ไม่ซ้ำกัน
          const adjustGroupByContractCode: {
            group: {
              id: number
              id_name: string
              name: string
              contract_code: {
                id: number
                contract_code: string
                contractPointData?: {
                  contractCode: string
                  BTU: number
                  SCF: number
                  contractPoint: string
                  group_id: number
                  shipper_name: string
                  shipper_id_name: string
                }[]
              }[]
            }
          }[] =
            adjust.daily_adjustment_group
              .map(
                (
                  adjustmentGroup
                ) => {
                  const onlyMatchContractCode =
                    adjustmentGroup.group.contract_code
                      .map(
                        (
                          contractCode
                        ) => {
                          const matchContract =
                            allContracts.filter(
                              (
                                contract
                              ) =>
                                contract.contractCode ==
                                contractCode.contract_code
                            )
                          if (
                            matchContract.length >
                            0
                          ) {
                            const contractPointDataList =
                              matchContract.map(
                                (
                                  contractPointData
                                ) => {
                                  const contractPointDataWithGroup =
                                    {
                                      ...contractPointData,
                                      group_id:
                                        adjustmentGroup
                                          .group
                                          .id,
                                      shipper_name:
                                        adjustmentGroup
                                          .group
                                          .name,
                                      shipper_id_name:
                                        adjustmentGroup
                                          .group
                                          .id_name
                                    }

                                  // เพิ่ม contract code ที่ยังไม่มีใน list
                                  if (
                                    !uniqeContractCode.some(
                                      (
                                        u: any
                                      ) =>
                                        u ===
                                        contractCode.contract_code
                                    )
                                  ) {
                                    uniqeContractCode.push(
                                      contractCode.contract_code
                                    )
                                  }

                                  // เพิ่ม contract point ที่ตรงกับ contract code ของ target และยังไม่มีใน list
                                  if (
                                    !uniqeContractPoint.some(
                                      (
                                        u: any
                                      ) =>
                                        u.contractCode === contractPointData.contractCode &&
                                        u.contractPoint === contractPointData.contractPoint
                                    )
                                  ) {
                                    uniqeContractPoint.push(
                                      contractPointDataWithGroup
                                    )
                                  }
                                  return contractPointDataWithGroup
                                }
                              )
                            return {
                              ...contractCode,
                              contractPointData:
                                contractPointDataList
                            }
                          }
                          return contractCode
                        }
                      )
                      .filter(
                        (
                          contractCode: any
                        ) =>
                          contractCode.contractPointData &&
                          contractCode
                            .contractPointData
                            .length >
                            0
                      )

                  if (
                    onlyMatchContractCode.length >
                    0
                  ) {
                    return {
                      ...adjustmentGroup,
                      group: {
                        ...adjustmentGroup.group,
                        contract_code:
                          onlyMatchContractCode
                      }
                    }
                  }
                  return adjustmentGroup
                }
              )
              .filter(
                (
                  adjustmentGroup: any
                ) =>
                  adjustmentGroup
                    .group
                    ?.contract_code &&
                  adjustmentGroup
                    .group
                    .contract_code
                    .length >
                    0
              )

          // ตรวจสอบว่าทุก contract ที่เกี่ยวข้องไม่มี nomination ทั้งหมด (ไม่มี valuePerHour ในทุก timeShow)
          // เพื่อให้แน่ใจว่าจะใช้ค่า booking แทน nomination ได้
          const isNoNomInAllContract =
            result
              .filter(
                (item) =>
                  uniqeContractCode.includes(
                    item.contract
                  ) &&
                  item.point ==
                    dailyAdjustmentNom
                      .nomination_point
                      .nomination_point
              )
              .every((item) =>
                item.timeShow.every(
                  (
                    timeItem2: any
                  ) =>
                    timeItem2?.valuePerHour ==
                      null ||
                    timeItem2?.valuePerHour ==
                      undefined
                )
              )

          // ถ้าทุก contract ไม่มี nomination ให้ใช้ค่า booking จาก contract
          if (
            isNoNomInAllContract
          ) {
            let hvFromEntryAreaData: areaHvDataType | undefined
            if (
              isMatch(
                dailyAdjustmentNom
                  .nomination_point
                  .entry_exit
                  .name,
                'Exit'
              )
            ) {
              const referenceArea =
                areaMaster.find(
                  (
                    areaObj: any
                  ) =>
                    isMatch(
                      areaObj.name,
                      dailyAdjustmentNom
                        .nomination_point
                        .area
                        .name
                    ) &&
                    isMatch(
                      areaObj
                        .zone
                        .name,
                      dailyAdjustmentNom
                        .nomination_point
                        .zone
                        .name
                    ) &&
                    isMatch(
                      areaObj
                        .entry_exit
                        .name,
                      dailyAdjustmentNom
                        .nomination_point
                        .entry_exit
                        .name
                    )
                )?.supply_reference_quality_area_by

              const keyForHv = `${`${dailyAdjustmentNom.nomination_point.zone.name}`.trim().toLowerCase()}-${`${referenceArea?.name ?? dailyAdjustmentNom.nomination_point.area.name}`.trim().toLowerCase()}`
              if (
                hvFromEntryArea.has(
                  keyForHv
                )
              ) {
                hvFromEntryAreaData =
                  hvFromEntryArea.get(
                    keyForHv
                  )
              }
            }

            uniqeContractPoint.map(
              (
                contractPointData
              ) => {
                if (
                  !result.some(
                    (
                      f: any
                    ) =>
                      f?.point ===
                        contractPointData.contractPoint &&
                      f?.group_id ===
                        contractPointData.group_id &&
                      // && f?.shipper_name === contractPointData.shipper_name
                      // && f?.shipper_id_name === contractPointData.shipper_id_name
                      // && f?.contract === contractPointData.contractCode
                      f?.contract_code_id ===
                        contractPointData.contractCodeId
                  )
                ) {
                  // รวมค่า BTU และ SCF จาก contract point ทั้งหมดที่เกี่ยวข้อง
                  const sumBTUAndSCF =
                    uniqeContractPoint
                      .filter(
                        (
                          item
                        ) =>
                          item.contractCodeId ==
                            contractPointData.contractCodeId &&
                          item.contractPoint ==
                            contractPointData.contractPoint
                      )
                      .reduce(
                        (
                          accum,
                          item
                        ) => {
                          // รวมค่า BTUD
                          if (
                            item.BTUD
                          ) {
                            if (
                              accum.BTUD
                            ) {
                              accum.BTUD +=
                                item.BTUD // บวกค่า BTUD เข้าไป
                            } else {
                              accum.BTUD =
                                item.BTUD // ตั้งค่า BTUD ครั้งแรก
                            }
                          }
                          // รวมค่า BTUH
                          if (
                            item.BTUH
                          ) {
                            if (
                              accum.BTUH
                            ) {
                              accum.BTUH +=
                                item.BTUH // บวกค่า BTUH เข้าไป
                            } else {
                              accum.BTUH =
                                item.BTUH // ตั้งค่า BTUH ครั้งแรก
                            }
                          }
                          // รวมค่า SCFD
                          if (
                            item.SCFD
                          ) {
                            if (
                              accum.SCFD
                            ) {
                              accum.SCFD +=
                                item.SCFD // บวกค่า SCFD เข้าไป
                            } else {
                              accum.SCFD =
                                item.SCFD // ตั้งค่า SCFD ครั้งแรก
                            }
                          }
                          // รวมค่า SCFH
                          if (
                            item.SCFH
                          ) {
                            if (
                              accum.SCFH
                            ) {
                              accum.SCFH +=
                                item.SCFH // บวกค่า SCFH เข้าไป
                            } else {
                              accum.SCFH =
                                item.SCFH // ตั้งค่า SCFH ครั้งแรก
                            }
                          }
                          return accum
                        },
                        {
                          BTUD: null,
                          BTUH: null,
                          SCFD: null,
                          SCFH: null
                        } as {
                          BTUD:
                            | number
                            | null
                          BTUH:
                            | number
                            | null
                          SCFD:
                            | number
                            | null
                          SCFH:
                            | number
                            | null
                        }
                      )

                  let value =
                    null
                  let valuePerHour =
                    null
                  let valueMmscfd =
                    null
                  let valueMmscfh =
                    null
                  if (
                    sumBTUAndSCF.BTUH ||
                    sumBTUAndSCF.BTUH ==
                      0
                  ) {
                    valuePerHour =
                      sumBTUAndSCF.BTUH
                  }

                  if (
                    sumBTUAndSCF.BTUD ||
                    sumBTUAndSCF.BTUD ==
                      0
                  ) {
                    value =
                      sumBTUAndSCF.BTUD
                    if (
                      !sumBTUAndSCF.BTUH &&
                      sumBTUAndSCF.BTUH !=
                        0
                    ) {
                      valuePerHour =
                        sumBTUAndSCF.BTUD /
                        24
                    }
                  }

                  if (
                    sumBTUAndSCF.SCFH ||
                    sumBTUAndSCF.SCFH ==
                      0
                  ) {
                    valueMmscfh =
                      sumBTUAndSCF.SCFH
                  }

                  if (
                    sumBTUAndSCF.SCFD ||
                    sumBTUAndSCF.SCFD ==
                      0
                  ) {
                    valueMmscfd =
                      sumBTUAndSCF.SCFD
                    if (
                      !sumBTUAndSCF.SCFH &&
                      sumBTUAndSCF.SCFH !=
                        0
                    ) {
                      valueMmscfh =
                        sumBTUAndSCF.SCFD /
                        24
                    }
                  }

                  const heatingValueFromNomList: {
                    sumHvMultiplyVi:
                      | number
                      | null
                    sumVi:
                      | number
                      | null
                  }[] = []
                  if (
                    hvFromEntryAreaData
                  ) {
                    heatingValueFromNomList.push(
                      {
                        sumHvMultiplyVi:
                          hvFromEntryAreaData.sumHvMultiplyVi,
                        sumVi:
                          hvFromEntryAreaData.sumVi
                      }
                    )
                    if (
                      (hvFromEntryAreaData.sumHvMultiplyVi ||
                        hvFromEntryAreaData.sumHvMultiplyVi ==
                          0) &&
                      hvFromEntryAreaData.sumVi
                    ) {
                      const calculatedHeatingValueFromNom =
                        hvFromEntryAreaData.sumHvMultiplyVi /
                        hvFromEntryAreaData.sumVi
                      if (
                        value !=
                          null &&
                        valueMmscfd ==
                          null
                      ) {
                        valueMmscfd =
                          value /
                          calculatedHeatingValueFromNom
                      }
                      if (
                        valuePerHour !=
                          null &&
                        valueMmscfh ==
                          null
                      ) {
                        valueMmscfh =
                          valuePerHour /
                          calculatedHeatingValueFromNom
                      }
                    }
                  }

                  const [
                    hours,
                    minutes
                  ] =
                    adjustTime
                      .split(
                        ':'
                      )
                      .map(
                        Number
                      )

                  let timeShowIndex:
                    | number
                    | null =
                    null
                  const timeShow =
                    []
                  for (
                    let i = 0;
                    i <= 23;
                    i++
                  ) {
                    const key = `${i.toString().padStart(2, '0')}:00`

                    const isReplaceValue =
                      i >
                        hours ||
                      (i ==
                        hours &&
                        minutes ==
                          0)
                    if (
                      !timeShowIndex &&
                      i ==
                        hours &&
                      minutes ==
                        0
                    ) {
                      timeShowIndex =
                        timeShow.length
                    }

                    timeShow.push(
                      {
                        time: key,
                        value:
                          isReplaceValue
                            ? value
                            : null,
                        valueMmscfd:
                          isReplaceValue
                            ? valueMmscfd
                            : null,
                        valuePerHour:
                          isReplaceValue
                            ? valuePerHour
                            : null,
                        valueMmscfh:
                          isReplaceValue
                            ? valueMmscfh
                            : null,
                        heatingValueFromNomList:
                          heatingValueFromNomList,
                        heatingValueFromAdjust:
                          null,
                        volumeFromAdjust:
                          null
                      }
                    )
                  }

                  if (
                    minutes >
                    0
                  ) {
                    timeShowIndex =
                      timeShow.length
                    timeShow.push(
                      {
                        time: adjustTime,
                        value:
                          value,
                        valueMmscfd:
                          valueMmscfd,
                        valuePerHour:
                          valuePerHour,
                        valueMmscfh:
                          valueMmscfh,
                        heatingValueFromNomList:
                          heatingValueFromNomList,
                        heatingValueFromAdjust:
                          null,
                        volumeFromAdjust:
                          null
                      }
                    )
                  }

                  // เก็บค่า BTU และ SCF ที่คำนวณได้ไว้ใน Map เพื่อใช้ในภายหลัง
                  // Key: index ของ result item, Value: Map ที่เก็บ timeShowIndex และค่า BTU, SCF
                  valueByContractCodeAndContractPoint.set(
                    result.length,
                    new Map<
                      number,
                      {
                        BTUD:
                          | number
                          | null
                        BTUH:
                          | number
                          | null
                        SCFD:
                          | number
                          | null
                        SCFH:
                          | number
                          | null
                      }
                    >().set(
                      timeShowIndex,
                      {
                        BTUD: sumBTUAndSCF.BTUD,
                        BTUH: sumBTUAndSCF.BTUH,
                        SCFD: sumBTUAndSCF.SCFD,
                        SCFH: sumBTUAndSCF.SCFH
                      }
                    )
                  )
                  result.push(
                    {
                      gas_day:
                        dayjs(
                          adjust.gas_day
                        )
                          .tz(
                            'Asia/Bangkok'
                          )
                          .format(
                            'DD/MM/YYYY'
                          ),
                      group_id:
                        contractPointData.group_id,
                      shipper_name:
                        contractPointData.shipper_name,
                      shipper_id_name:
                        contractPointData.shipper_id_name,
                      contract:
                        contractPointData.contractCode,
                      contract_code_id: contractPointData.isReserveBalancingGasContract ? undefined :
                        contractPointData.contractCodeId,
                      reserve_balancing_gas_contract_id: undefined,
                      nomination_id:
                        undefined, // nominationFile.id,
                      nomination_code:
                        undefined, // nominationFile.nomination_code,
                      zone_text:
                        dailyAdjustmentNom
                          .nomination_point
                          .zone
                          .name,
                      area_text:
                        dailyAdjustmentNom
                          .nomination_point
                          .area
                          .name,
                      // "unit": 'MMBTU/D',
                      point:
                        dailyAdjustmentNom
                          .nomination_point
                          .nomination_point,
                      entryExit:
                        dailyAdjustmentNom
                          .nomination_point
                          .entry_exit
                          .name,
                      total:
                        value,
                      totalMmscfd: valueMmscfd,
                      totalType:
                        'daily', // nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
                      nomination_type_id: 1, // nominationFile.nomination_type_id,
                      timeShow:
                        timeShow
                    }
                  )

                  // valueByContractCodeAndContractPoint.set(result.length, new Map<number, {BTUD: number | null, BTUH: number | null, SCFD: number | null, SCFH: number | null}>().set(timeShowIndex, {BTUD: sumBTUAndSCF.BTUD, BTUH: sumBTUAndSCF.BTUH, SCFD: sumBTUAndSCF.SCFD, SCFH: sumBTUAndSCF.SCFH}))
                  // result.push({
                  //   "gas_day": getTodayNowAdd7(adjust.gas_day).tz('Asia/Bangkok').format('DD/MM/YYYY'),
                  //   "group_id": contractPointData.group_id,
                  //   "shipper_name": contractPointData.shipper_name,
                  //   "shipper_id_name": contractPointData.shipper_id_name,
                  //   "contract": contractPointData.contractCode,
                  //   "contract_code_id": contractPointData.contractCodeId,
                  //   "nomination_id": undefined,// nominationFile.id,
                  //   "nomination_code": undefined,// nominationFile.nomination_code,
                  //   "zone_text": dailyAdjustmentNom.nomination_point.zone.name,
                  //   "area_text": dailyAdjustmentNom.nomination_point.area.name,
                  //   "unit": 'MMSCFD',
                  //   "point": dailyAdjustmentNom.nomination_point.nomination_point,
                  //   "entryExit": dailyAdjustmentNom.nomination_point.entry_exit.name,
                  //   "total": valueMmscfd,
                  //   "totalType": 'daily', // nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
                  //   "nomination_type_id": 1, // nominationFile.nomination_type_id,
                  //   "timeShow": timeShow,
                  // })
                }
              }
            )
          }
        }
      }

      // หา result items ที่ต้องการ adjust (ต้องตรงกับ point, zone, area, entry/exit, gas_day และอยู่ใน group ที่กำหนด)
      for (
        let index = 0;
        index < result.length;
        index++
      ) {
        const target =
          result[index]
        if (
          target?.point ==
            dailyAdjustmentNom
              .nomination_point
              .nomination_point &&
          target?.zone_text ==
            dailyAdjustmentNom
              .nomination_point
              .zone.name &&
          target?.area_text ==
            dailyAdjustmentNom
              .nomination_point
              .area.name &&
          isMatch(
            target && target?.entryExit,
            dailyAdjustmentNom
              .nomination_point
              .entry_exit.name
          ) &&
          target?.gas_day ===
            dayjs(
              adjust.gas_day
            )
              .tz(
                'Asia/Bangkok'
              )
              .format(
                'DD/MM/YYYY'
              ) &&
          adjust.daily_adjustment_group
            .map(
              (item) =>
                item.group.id
            )
            .includes(
              target?.group_id
            )
        ) {
          if (
            target && target.timeShow &&
            Array.isArray(
              target.timeShow
            ) &&
            target.timeShow
              .length > 0
          ) {
            // หาค่าล่าสุดก่อนเวลา adjustment (เพื่อใช้ในการคำนวณสัดส่วนการกระจายค่า adjust)

            // กรอง timeShow ที่มีเวลาก่อน adjustment time
            const timeShowBeforeAdjust =
              target.timeShow.filter(
                (
                  timeItem: any
                ) => {
                  const timeItemMinutes =
                    timeToMinutes(
                      timeItem.time
                    )
                  return (
                    timeItemMinutes <
                    adjustTimeMinutes
                  )
                }
              )

            // สำหรับ Exit point: คำนวณค่า volume (MMSCFD, MMSCFH) จาก energy (MMBTU) โดยใช้ heating value
            // และเก็บค่า adjustment ไว้ใน timeShow items ที่เกิดขึ้นก่อนเวลา adjustment
            if (
              target && 
              isMatch(
                target?.entryExit,
                'Exit'
              )
            ) {
              // วนลูป timeShow items ทั้งหมดที่เกิดขึ้นก่อนเวลา adjustment
              timeShowBeforeAdjust.map(
                (
                  timeItem
                ) => {
                  let heatingValueFromNomList:
                    | {
                        sumHvMultiplyVi:
                          | number
                          | null
                        sumVi:
                          | number
                          | null
                      }
                    | undefined
                  let calculatedHeatingValueFromNom =
                    null
                  if (
                    timeItem.heatingValueFromNomList &&
                    timeItem
                      .heatingValueFromNomList
                      .length >
                      0
                  ) {
                    heatingValueFromNomList =
                      timeItem.heatingValueFromNomList.reduce(
                        (
                          acc,
                          item
                        ) => {
                          if (
                            item.sumHvMultiplyVi !=
                            null
                          ) {
                            if (
                              acc.sumHvMultiplyVi
                            ) {
                              acc.sumHvMultiplyVi +=
                                item.sumHvMultiplyVi
                            } else {
                              acc.sumHvMultiplyVi =
                                item.sumHvMultiplyVi
                            }
                          }

                          if (
                            item.sumVi !=
                            null
                          ) {
                            if (
                              acc.sumVi
                            ) {
                              acc.sumVi +=
                                item.sumVi
                            } else {
                              acc.sumVi =
                                item.sumVi
                            }
                          }
                          return acc
                        },
                        {
                          sumHvMultiplyVi:
                            null,
                          sumVi:
                            null
                        } as {
                          sumHvMultiplyVi:
                            | number
                            | null
                          sumVi:
                            | number
                            | null
                        }
                      )
                  }

                  if (
                    heatingValueFromNomList &&
                    (heatingValueFromNomList.sumHvMultiplyVi ||
                      heatingValueFromNomList.sumHvMultiplyVi ==
                        0) &&
                    heatingValueFromNomList.sumVi
                  ) {
                    calculatedHeatingValueFromNom =
                      heatingValueFromNomList.sumHvMultiplyVi /
                      heatingValueFromNomList.sumVi
                    if (
                      timeItem.value !=
                      null
                    ) {
                      timeItem.valueMmscfd =
                        timeItem.value /
                        calculatedHeatingValueFromNom
                    }
                    if (
                      timeItem.valuePerHour !=
                      null
                    ) {
                      timeItem.valueMmscfh =
                        timeItem.valuePerHour /
                        calculatedHeatingValueFromNom
                    }
                  }
                  // ถ้ามี heating value จาก adjustment ให้ใช้ในการคำนวณ volume
                  if (
                    heatingValue
                  ) {
                    // เก็บ heating value จาก adjustment ไว้ใน timeItem
                    timeItem.heatingValueFromAdjust =
                      heatingValue

                    // คำนวณค่า volume รายวัน (MMSCFD) จาก energy รายวัน (MMBTU/D)
                    // สูตร: Volume = Energy / Heating Value
                    if (
                      timeItem.value !=
                        null &&
                      calculatedHeatingValueFromNom ==
                        null
                    ) {
                      timeItem.valueMmscfd =
                        timeItem.value /
                        heatingValue
                    }

                    // คำนวณค่า volume รายชั่วโมง (MMSCFH) จาก energy รายชั่วโมง (MMBTU/H)
                    // สูตร: Volume per Hour = Energy per Hour / Heating Value
                    if (
                      timeItem.valuePerHour !=
                        null &&
                      calculatedHeatingValueFromNom ==
                        null
                    ) {
                      timeItem.valueMmscfh =
                        timeItem.valuePerHour /
                        heatingValue
                    }
                  }

                  // เก็บค่า volume จาก adjustment (MMSCFH) ไว้ใน timeItem
                  if (
                    adjustVolume
                  ) {
                    timeItem.volumeFromAdjust =
                      adjustVolume
                  }

                  // เก็บค่า energy จาก adjustment (MMBTU/H) ไว้ใน timeItem
                  if (
                    adjustEnergy
                  ) {
                    timeItem.energyFromAdjust =
                      adjustEnergy
                  }
                }
              )
            }

            // หา timeShow item ล่าสุด (เรียงตามเวลา)
            if (
              timeShowBeforeAdjust.length >
              0
            ) {
              const latestTimeShow =
                timeShowBeforeAdjust.reduce(
                  (
                    latest: any,
                    current: any
                  ) => {
                    const latestMinutes =
                      timeToMinutes(
                        latest.time
                      )
                    const currentMinutes =
                      timeToMinutes(
                        current.time
                      )
                    return currentMinutes >
                      latestMinutes
                      ? current
                      : latest
                  }
                )

              // เก็บค่าก่อน adjust ของ result item นี้
              energyBeforeAdjustInThisRound.set(
                index,
                latestTimeShow.valuePerHour
              )
              volumeBeforeAdjustInThisRound.set(
                index,
                latestTimeShow.valueMmscfh
              )
            }
          }
        } else {
          continue
        }
      }

      // ประมวลผลค่า BTU และ SCF ที่เก็บไว้ใน valueByContractCodeAndContractPoint (กรณีไม่มี nomination)
      // และนำไปตั้งค่าใน timeShow items พร้อมคำนวณค่า volume สำหรับ Exit point
      for (const [
        index,
        subMap
      ] of valueByContractCodeAndContractPoint.entries()) {
        const target =
          result[index]
        // วนลูป timeShow items ที่เก็บค่า BTU/SCF ไว้
        for (const [
          timeShowIndex,
          value
        ] of subMap.entries()) {
          // กรณีที่มีค่า BTU (Energy) จาก contract booking
          let valuePerHour:
            | number
            | null = null
          if (
            value.BTUH ||
            value.BTUH == 0
          ) {
            valuePerHour =
              value.BTUH
          }
          if (
            value.BTUD ||
            value.BTUD == 0
          ) {
            if (
              !value.BTUH &&
              value.BTUH != 0
            ) {
              // คำนวณค่า energy รายชั่วโมง (MMBTU/H) โดยแบ่งค่ารายวันด้วย 24
              valuePerHour =
                value.BTUD /
                24
            }

            // ตั้งค่า energy รายวันและรายชั่วโมงใน timeShow
            result[
              index
            ].timeShow[
              timeShowIndex
            ].value =
              value.BTUD
            result[
              index
            ].timeShow[
              timeShowIndex
            ].valuePerHour =
              valuePerHour

            // เก็บค่า energy ก่อน adjust เพื่อใช้ในการคำนวณสัดส่วนการกระจายค่า adjust ในภายหลัง
            // (เก็บเฉพาะถ้ายังไม่มีค่า)
            if (
              !energyBeforeAdjustInThisRound.get(
                index
              )
            ) {
              energyBeforeAdjustInThisRound.set(
                index,
                valuePerHour
              )
            }

            // สำหรับ Exit point: คำนวณค่า volume จาก energy โดยใช้ heating value
            if (
              target && 
              isMatch(
                target?.entryExit,
                'Exit'
              )
            ) {
              if (
                heatingValue
              ) {
                // คำนวณค่า volume รายวัน (MMSCFD) = Energy (MMBTU/D) / Heating Value
                const valueMmscfd =
                  value.BTUD /
                  heatingValue
                // คำนวณค่า volume รายชั่วโมง (MMSCFH) = Energy per Hour (MMBTU/H) / Heating Value
                const valueMmscfh =
                  (value.BTUH
                    ? value.BTUH
                    : value.BTUD /
                      24) /
                  heatingValue

                // ตั้งค่า volume รายวันและรายชั่วโมงใน timeShow
                result[
                  index
                ].timeShow[
                  timeShowIndex
                ].valueMmscfd =
                  valueMmscfd
                result[
                  index
                ].timeShow[
                  timeShowIndex
                ].valueMmscfh =
                  valueMmscfh

                // เก็บค่า volume ก่อน adjust เพื่อใช้ในการคำนวณสัดส่วนการกระจายค่า adjust ในภายหลัง
                // (เก็บเฉพาะถ้ายังไม่มีค่า)
                if (
                  !volumeBeforeAdjustInThisRound.get(
                    index
                  )
                ) {
                  volumeBeforeAdjustInThisRound.set(
                    index,
                    valueMmscfh
                  )
                }
              }
            }
          }

          // กรณีที่มีค่า SCF (Volume) จาก contract booking
          let valueMmscfh:
            | number
            | null = null
          if (
            value.SCFH ||
            value.SCFH == 0
          ) {
            valueMmscfh =
              value.SCFH
          }
          if (
            value.SCFD ||
            value.SCFD == 0
          ) {
            if (
              !value.SCFH &&
              value.SCFH != 0
            ) {
              // คำนวณค่า volume รายชั่วโมง (MMSCFH) โดยแบ่งค่ารายวันด้วย 24
              valueMmscfh =
                value.SCFD /
                24
            }

            // ตั้งค่า volume รายวันและรายชั่วโมงใน timeShow
            result[
              index
            ].timeShow[
              timeShowIndex
            ].valueMmscfd =
              value.SCFD
            result[
              index
            ].timeShow[
              timeShowIndex
            ].valueMmscfh =
              valueMmscfh

            // เก็บค่า volume ก่อน adjust เพื่อใช้ในการคำนวณสัดส่วนการกระจายค่า adjust ในภายหลัง
            // (เก็บเฉพาะถ้ายังไม่มีค่า)
            if (
              !volumeBeforeAdjustInThisRound.get(
                index
              )
            ) {
              volumeBeforeAdjustInThisRound.set(
                index,
                valueMmscfh
              )
            }
          }
        }
      }

      // รวมค่าก่อน adjust ทั้งหมด (เพื่อใช้คำนวณสัดส่วน)
      const sumEnergyBeforeAdjustInThisRound =
        Array.from(
          energyBeforeAdjustInThisRound.values()
        ).reduce(
          (sum, value) => {
            return sum + value
          },
          0
        )
      const sumVolumeBeforeAdjustInThisRound =
        Array.from(
          volumeBeforeAdjustInThisRound.values()
        ).reduce(
          (sum, value) => {
            return sum + value
          },
          0
        )
      // ประมวลผลแต่ละ result item ที่ต้องการ adjust
      for (const [
        index,
        volumeBeforeAdjust
      ] of volumeBeforeAdjustInThisRound) {
        const target =
          result[index]
        const energyBeforeAdjust =
          energyBeforeAdjustInThisRound.get(
            index
          )
        // หาประวัติการ adjust ที่เกิดขึ้นหลังจากเวลา adjust ปัจจุบัน (สำหรับ point, zone, area, entry/exit, gas_day, group เดียวกัน)
        // เพื่อไม่ให้ adjustment ปัจจุบันไปแก้ไขค่าหลังจาก adjustment ที่เกิดขึ้นในภายหลัง
        const activeHistory =
          adjustHistory.filter(
            (history) =>
              history.nomination_point ==
                target.point &&
              history.zone_text ==
                target.zone_text &&
              history.area_text ==
                target.area_text &&
              history.entry_exit_name ==
                target.entryExit &&
              history.gas_day ==
                target.gas_day &&
              history.group_id ==
                target.group_id &&
              history.timeMinutes >
                adjustTimeMinutes
          )
        // หาเวลาที่ไม่ควร adjust (เวลาของ adjustment ที่เกิดขึ้นหลังจากนี้)
        const doNotAdjustAfterTime =
          activeHistory.length >
          0
            ? Math.min(
                ...activeHistory.map(
                  (history) =>
                    history.timeMinutes
                )
              )
            : undefined

        // คำนวณค่าใหม่ตามสัดส่วน: (ค่าเดิม / ผลรวมค่าเดิมทั้งหมด) * ค่า adjust ที่ต้องการ
        const newMmscfh =
          (volumeBeforeAdjust /
            sumVolumeBeforeAdjustInThisRound) *
          adjustVolume
        let newMmbtuh = null
        if (
          energyBeforeAdjust ||
          energyBeforeAdjust ==
            0
        ) {
          newMmbtuh =
            (energyBeforeAdjust /
              sumEnergyBeforeAdjustInThisRound) *
            adjustEnergy
        }

        // อัพเดทค่าใน timeShow ตั้งแต่เวลา adjustment เป็นต้นไป (จนถึงเวลาของ adjustment ถัดไป ถ้ามี)
        for (
          let timeShowIndex = 0;
          timeShowIndex <
          target.timeShow
            .length;
          timeShowIndex++
        ) {
          const timeShow =
            target.timeShow[
              timeShowIndex
            ]
          const timeShowMinutes =
            timeToMinutes(
              timeShow.time
            )
          if (
            timeShowMinutes >=
              adjustTimeMinutes &&
            (!doNotAdjustAfterTime ||
              timeShowMinutes <
                doNotAdjustAfterTime)
          ) {
            ;((result[
              index
            ].timeShow[
              timeShowIndex
            ].value =
              parseToNumber3Decimal(
                newMmbtuh !=
                  null
                  ? parseToNumber3Decimal(
                      newMmbtuh
                    ) * 24
                  : result[
                      index
                    ]
                      .timeShow[
                      timeShowIndex
                    ].value
              )),
              (result[
                index
              ].timeShow[
                timeShowIndex
              ].valueMmscfd =
                parseToNumber3Decimal(
                  newMmscfh !=
                    null
                    ? parseToNumber3Decimal(
                        newMmscfh
                      ) * 24
                    : result[
                        index
                      ]
                        .timeShow[
                        timeShowIndex
                      ]
                        .valueMmscfd
                )),
              (result[
                index
              ].timeShow[
                timeShowIndex
              ].valuePerHour =
                parseToNumber3Decimal(
                  newMmbtuh ??
                    result[
                      index
                    ]
                      .timeShow[
                      timeShowIndex
                    ]
                      .valuePerHour
                )))
            result[
              index
            ].timeShow[
              timeShowIndex
            ].valueMmscfh =
              parseToNumber3Decimal(
                newMmscfh ??
                  result[
                    index
                  ].timeShow[
                    timeShowIndex
                  ]
                    .valueMmscfh
              )
            result[
              index
            ].timeShow[
              timeShowIndex
            ].heatingValueFromAdjust =
              heatingValue
            result[
              index
            ].timeShow[
              timeShowIndex
            ].volumeFromAdjust =
              adjustVolume
            result[
              index
            ].timeShow[
              timeShowIndex
            ].energyFromAdjust =
              adjustEnergy
            result[
              index
            ].timeShow[
              timeShowIndex
            ].isAdjust = true
          }
        }

        // เพิ่มจุดเวลา adjustment เข้าไปใน timeShow (เพื่อแสดงว่ามีการ adjust ที่เวลานี้)
        const existTimeShowIndex =
          result[
            index
          ].timeShow.findIndex(
            (f: any) =>
              f.time ==
              adjustTime
          )
        if (
          existTimeShowIndex <
          0
        ) {
          result[
            index
          ].timeShow.push({
            time: adjustTime,
            value:
              parseToNumber3Decimal(
                newMmbtuh !=
                  null
                  ? parseToNumber3Decimal(
                      newMmbtuh
                    ) * 24
                  : null
              ),
            valueMmscfd:
              parseToNumber3Decimal(
                newMmscfh !=
                  null
                  ? parseToNumber3Decimal(
                      newMmscfh
                    ) * 24
                  : null
              ),
            valuePerHour:
              parseToNumber3Decimal(
                newMmbtuh
              ),
            valueMmscfh:
              parseToNumber3Decimal(
                newMmscfh
              ),
            heatingValueFromAdjust:
              heatingValue,
            volumeFromAdjust:
              adjustVolume,
            energyFromAdjust:
              adjustEnergy,
            isAdjust: true
          })
          result[
            index
          ].timeShow.sort(
            (
              a: any,
              b: any
            ) => {
              return (
                timeToMinutes(
                  a.time
                ) -
                timeToMinutes(
                  b.time
                )
              )
            }
          )
        } else {
          result[
            index
          ].timeShow[
            existTimeShowIndex
          ].value =
            parseToNumber3Decimal(
              newMmbtuh !=
                null
                ? parseToNumber3Decimal(
                    newMmbtuh
                  ) * 24
                : result[
                    index
                  ].timeShow[
                    existTimeShowIndex
                  ].value
            )
          result[
            index
          ].timeShow[
            existTimeShowIndex
          ].valueMmscfd =
            parseToNumber3Decimal(
              newMmscfh !=
                null
                ? parseToNumber3Decimal(
                    newMmscfh
                  ) * 24
                : result[
                    index
                  ].timeShow[
                    existTimeShowIndex
                  ]
                    .valueMmscfd
            )
          result[
            index
          ].timeShow[
            existTimeShowIndex
          ].valuePerHour =
            parseToNumber3Decimal(
              newMmbtuh ??
                result[index]
                  .timeShow[
                  existTimeShowIndex
                ].valuePerHour
            )
          result[
            index
          ].timeShow[
            existTimeShowIndex
          ].valueMmscfh =
            parseToNumber3Decimal(
              newMmscfh ??
                result[index]
                  .timeShow[
                  existTimeShowIndex
                ].valueMmscfh
            )
          result[
            index
          ].timeShow[
            existTimeShowIndex
          ].heatingValueFromAdjust =
            heatingValue
          result[
            index
          ].timeShow[
            existTimeShowIndex
          ].volumeFromAdjust =
            adjustVolume
          result[
            index
          ].timeShow[
            existTimeShowIndex
          ].energyFromAdjust =
            adjustEnergy
          result[
            index
          ].timeShow[
            existTimeShowIndex
          ].isAdjust = true
        }

        // บันทึกประวัติการ adjust
        adjustHistory.push({
          nomination_point:
            target.point,
          zone_text:
            target.zone_text,
          area_text:
            target.area_text,
          entry_exit_name:
            target.entryExit,
          gas_day:
            target.gas_day,
          group_id:
            target.group_id,
          timeMinutes:
            adjustTimeMinutes,
          time: adjustTime
        })
      }
    }
  }

  const mustShowNominationPointList =
    await getNominationPointListFromActiveContractCode(
      {
        prisma,
        todayStart,
        todayEnd
      }
    )

  const timeShow = []
  for (
    let i = 0;
    i <= 23;
    i++
  ) {
    const key = `${i.toString().padStart(2, '0')}:00`

    timeShow.push({
      time: key,
      value: 0,
      valueMmscfd: 0,
      valuePerHour: 0,
      valueMmscfh: 0,
      heatingValueFromNomList:
        null,
      heatingValueFromAdjust:
        null,
      volumeFromAdjust: null
    })
  }

  currentDate =
    endDayjs.clone()
  while (
    currentDate.isSameOrAfter(
      startDayjs
    )
  ) {
    for (const nominationPoint of mustShowNominationPointList) {
      let existPointIndex =
        result.findIndex(
          (f: any) => {
            return (
              f?.point ===
                nominationPoint.nomination_point &&
              f?.zone_text ===
                nominationPoint.zone_text &&
              f?.area_text ===
                nominationPoint.area_text &&
              isMatch(
                f?.entryExit,
                nominationPoint
                  .entry_exit
                  ?.name
              ) &&
              f?.gas_day ===
                currentDate
                  .tz(
                    'Asia/Bangkok'
                  )
                  .format(
                    'DD/MM/YYYY'
                  ) &&
              f?.group_id ===
                nominationPoint.group_id &&
              f?.contract_code_id ===
                nominationPoint.contract_code_id
            )
          }
        )

      if (
        existPointIndex < 0
      ) {
        result.push({
          gas_day: currentDate
            .tz(
              'Asia/Bangkok'
            )
            .format(
              'DD/MM/YYYY'
            ),
          group_id:
            nominationPoint.group_id,
          shipper_name:
            nominationPoint.group_name,
          shipper_id_name:
            nominationPoint.group_id_name,
          contract:
            nominationPoint.contract_code || nominationPoint.reserve_balancing_gas_contract,
          contract_code_id:
            nominationPoint.contract_code_id,
          reserve_balancing_gas_contract_id: nominationPoint.reserve_balancing_gas_contract_id,
          // "nomination_id": nominationFile.id,
          // "nomination_code": nominationFile.nomination_code,
          zone_text:
            nominationPoint.zone_text,
          area_text:
            nominationPoint.area_text,
          // "unit": unit,
          point:
            nominationPoint.nomination_point,
          entryExit:
            nominationPoint
              .entry_exit
              ?.name,
          total: 0,
          totalMmscfd: null,
          totalType: 'daily',
          nomination_type_id: 1,
          timeShow: timeShow
        })
      }
    }

    // ไปวันก่อนหน้า
    currentDate =
      currentDate.subtract(
        1,
        'day'
      )
  }

  return result
}

/**
 * คำนวณข้อมูล Nomination + Daily Adjustment ตามช่วงวันที่ที่กำหนด
 * แล้วจัดให้อยู่ในรูปแบบตาม nomination point/contract/กลุ่ม พร้อมข้อมูลรายชั่วโมง
 * @param prisma - PrismaService สำหรับดึงข้อมูล nomination, daily adjustment และ master data
 * @param startDate - วันที่เริ่มต้นของช่วงคำนวณ (string/Date ที่รองรับโดย date util)
 * @param endDate - วันที่สิ้นสุดของช่วงคำนวณ (string/Date ที่รองรับโดย date util)
 * @returns รายการข้อมูลที่จัดกลุ่มตาม nomination point + contract + group พร้อม timeShow รายชั่วโมง และผลจากการ adjust แล้ว
 */
export async function getAdjustNom2({ prisma, startDate, endDate }: { prisma: PrismaService; startDate: any; endDate: any }) {
  // แปลงวันที่เริ่มต้นและสิ้นสุดเป็น dayjs object
  const startDayjs = getTodayNowDDMMYYYYAdd7(startDate);
  const endDayjs = getTodayNowDDMMYYYYAdd7(endDate);
  const todayStart = startDayjs.toDate();
  const todayEnd = endDayjs.toDate();

  // หาช่วงสัปดาห์ที่ครอบคลุมวันที่เริ่มต้นและสิ้นสุด (สำหรับดึงข้อมูล weekly nomination)
  const { weekStart: targetWeekStart } = getWeekRange(todayStart);
  const { weekEnd: targetWeekEnd } = getWeekRange(todayEnd);

  // ดึงข้อมูล nomination files ทั้งแบบรายวัน (type 1) และรายสัปดาห์ (type 2)
  const nominationData: queryShipperNominationFileWithRelationsForCal[] = await prisma.query_shipper_nomination_file.findMany({
    where: {
      // NOT: {
      //   contract_code_id: null,
      // }, // revers bal ไม่แสดง effect
      AND: [
        {
          OR: [
            {
              // nomination รายวัน (type 1) ที่อยู่ในช่วงวันที่ที่เลือก
              nomination_type: { id: 1 },
              gas_day: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            {
              // nomination รายสัปดาห์ (type 2) ที่อยู่ในช่วงสัปดาห์ที่ครอบคลุมวันที่เลือก
              nomination_type: { id: 2 },
              gas_day: {
                gte: targetWeekStart,
                lte: targetWeekEnd,
              },
            },
          ],
        },
        // เฉพาะรายการที่ไม่ถูกลบ
        {
          OR: [
            {
              del_flag: false,
            },
            {
              del_flag: null,
            },
          ],
        },
        // เฉพาะ status 2 (Approved) และ 5 (Approved by System)
        {
          query_shipper_nomination_status: {
            id: {
              in: [2, 5],
            },
          },
        },
      ],
    },
    ...queryShipperNominationFilePopulateForCal,
    orderBy: [
      {
        nomination_type_id: 'asc',
      },
      { id: 'desc' },
    ],
  });

  // ดึงข้อมูล daily adjustment ที่ถูก approve (status 2) ในช่วงวันที่ที่เลือก
  const dailyAdjust = await prisma.daily_adjustment.findMany({
    where: {
      daily_adjustment_status_id: 2, // เฉพาะที่ approved
      gas_day: {
        gte: getTodayStartDDMMYYYYAdd7(startDate).toDate(),
        lte: getTodayEndDDMMYYYYAdd7(endDate).toDate(),
      },
    },
    orderBy: {
      create_date: 'asc',
    }, // เรียงตามวันที่สร้างเพื่อประมวลผล adjustment ตามลำดับเวลา
    select: {
      id: true,
      create_date: true,
      gas_day: true,
      time: true,
      daily_code: true,
      daily_adjustment_group: {
        select: {
          group: {
            select: {
              id: true,
              id_name: true,
              name: true,
              contract_code: {
                where: {
                  AND: [
                    {
                      contract_start_date: {
                        lte: todayEnd
                      }
                    }, // Started before or on target date
                    // Not rejected
                    {
                      status_capacity_request_management: {
                        NOT: {
                          name: {
                            equals: 'Rejected',
                            mode: 'insensitive'
                          }
                        }
                      }
                    },
                    // If terminate_date exists and targetDate >= terminate_date, exclude (inactive)
                    {
                      OR: [
                        {
                          terminate_date: null
                        }, // No terminate date
                        {
                          terminate_date: {
                            gt: todayStart
                          }
                        } // Terminate date is after target date
                      ]
                    },
                    // Use extend_deadline if available, otherwise use contract_end_date
                    {
                      OR: [
                        // If extend_deadline exists, use it as end date
                        {
                          AND: [
                            {
                              extend_deadline: {
                                not: null
                              }
                            },
                            {
                              extend_deadline: {
                                gt: todayStart
                              }
                            }
                          ]
                        },
                        // If extend_deadline is null, use contract_end_date
                        {
                          AND: [
                            {
                              extend_deadline: null
                            },
                            {
                              OR: [
                                {
                                  contract_end_date: null
                                },
                                {
                                  contract_end_date: {
                                    gt: todayStart
                                  }
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                select: {
                  id: true,
                  contract_code: true,
                },
              },
            },
          },
        },
      },
      daily_adjustment_nom: {
        select: {
          heating_value: true, // heating value (BTU/SCF)
          valume_mmscfd: true, // ปริมาณต่อวัน (MMSCFD)
          valume_mmscfh: true, // ปริมาณต่อชั่วโมง (MMSCFH)
          valume_mmscfd2: true, // energy ต่อวัน (MMBTU/D)
          valume_mmscfh2: true, // energy ต่อชั่วโมง (MMBTU/H)
          nomination_point: {
            select: {
              nomination_point: true,
              zone: true,
              area: true,
              entry_exit: true,
            },
          },
        },
      },
    },
    // orderBy: [
    //   {
    //     gas_day: 'asc',
    //   },
    //   {
    //     time: 'asc',
    //   },
    // ],
  });

  // ดึงข้อมูลสัญญเพื่อนำค่ามาใช้แทนในกรณีที่ไม่มีการ nomination เข้ามา
  const dailyAdjustGroupIDList = Array.from(new Set(dailyAdjust.flatMap(item => item.daily_adjustment_group.map(group => group.group.id))));

  const contractCodeListByNominationPoint = await getContractCodeValueByNominationPoint({
    prisma,
    startDayjs,
    todayStart,
    todayEnd,
    dailyAdjustGroupIDList,
  });

  const areaMaster: areaWithRelationsForCal[] = await prisma.area.findMany({
    where: {
      AND: [
        {
          start_date: {
            lte: todayEnd, // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
        },
        {
          OR: [
            {
              end_date: null,
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gte: todayStart,
              },
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
          ],
        },
      ],
    },
    include: {
      zone: {
        select: {
          id: true,
          name: true,
        },
      },
      entry_exit: {
        select: {
          id: true,
          name: true,
        },
      },
      supply_reference_quality_area_by: {
        select: {
          id: true,
          name: true,
          start_date: true,
          end_date: true,
        },
      },
      owner_area: {
        include: {
          east_area: {
            select: {
              id: true,
              name: true,
              start_date: true,
              end_date: true,
            }
          },
          west_area: {
            select: {
              id: true,
              name: true,
              start_date: true,
              end_date: true,
            }
          }
        }
      },
    },
    orderBy: {
      id: 'desc',
    },
  });
  const bvw10AndRa6List = await prisma.concept_point.findMany({
    where: {
      OR: [
        {
          concept_point: {
            contains: 'BVW10',
            mode: 'insensitive'
          }
        },
        {
          concept_point: {
            contains: 'RA6',
            mode: 'insensitive'
          }
        }
      ],
      type_concept_point_id: 2 // Nomination Physical gas concepts
    }
  })

  const eachDateHvFromEntryArea: Map<
    string,
    Map<string, areaHvDataType>
  > = new Map()


  const historyBvw10AndRa6List: (adjustNomDataType & {
    nominationRowJsonDataTemp: any;
  })[] = [];

  // สร้าง array สำหรับเก็บผลลัพธ์
  const result: adjustNomDataType[] = [];

  let currentDate = endDayjs.clone();

  // วนลูปย้อนหลังจากวันสุดท้ายไปวันแรก
  while (currentDate.isSameOrAfter(startDayjs)) {

    const hvFromEntryArea = await findHvFromEntryArea({
      prisma,
      targetArea: '',
      gasDate: currentDate.toDate(),
      dataList: nominationData,
    });

    eachDateHvFromEntryArea.set(currentDate.tz('Asia/Bangkok').format('DD/MM/YYYY'), hvFromEntryArea)

    nominationData.map((nominationFile) => {
      if(nominationFile.contract_code){
      const contractStartDate = dayjs(nominationFile.contract_code?.contract_start_date);
      const contractEndDate = dayjs(nominationFile.contract_code?.terminate_date || nominationFile.contract_code?.extend_deadline || nominationFile.contract_code?.contract_end_date);
      if(currentDate.isBefore(contractStartDate) || currentDate.isSameOrAfter(contractEndDate)){
        return;
      }
      }

      nominationFile.nomination_version.map((nominationVersion) => {
        nominationVersion.nomination_row_json.map((nominationRowJson) => {
          // แปลง JSON string เป็น object
          const nominationRowJsonDataTemp = JSON.parse(nominationRowJson.data_temp);

          // อ่านข้อมูลจาก JSON ตามตำแหน่งที่กำหนด
          const zone = nominationRowJsonDataTemp['0'];
          const area = nominationRowJsonDataTemp['2'];
          const point = nominationRowJsonDataTemp['3'];
          const unit = nominationRowJsonDataTemp['9'];
          const entryExit = nominationRowJsonDataTemp['10'];
          const wi = parseToNumber6Decimal(nominationRowJsonDataTemp['11'])
          const hv = parseToNumber6Decimal(nominationRowJsonDataTemp['12'])
          const sg = parseToNumber6Decimal(nominationRowJsonDataTemp['13'])

          // ข้ามถ้าไม่มีข้อมูล zone, area (ต้องเป็น nomination point)
          // ข้ามถ้าไม่ใช่หน่วย MMBTU/D หรือ MMSCFD
          if (!zone || !area || (!isMatch(unit, 'MMBTU/D') && !isMatch(unit, 'MMBTU/H') && !isMatch(unit, 'MMSCFD') && !isMatch(unit, 'MMSCFH'))) {
            if(bvw10AndRa6List.some(conceptPoint => isMatch(conceptPoint.concept_point, point)) && (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H'))){
              if (
                nominationFile.nomination_type_id == 2 &&
                historyBvw10AndRa6List.some((f) => {
                  return (
                    f?.point === point &&
                    f?.zone_text === nominationRowJson.zone_text &&
                    f?.area_text === nominationRowJson.area_text &&
                    f?.entryExit === entryExit &&
                    f?.gas_day === currentDate.format('DD/MM/YYYY') &&
                    f?.shipper_id_name === nominationFile.group?.id_name &&
                    f?.contract_code_id === nominationFile.contract_code_id &&
                    f?.totalType === 'daily' &&
                    f?.nomination_type_id === 1
                  );
                })
              ) {
                return;
              }
              else{
                historyBvw10AndRa6List.push({
                  gas_day: currentDate.format('DD/MM/YYYY'),
                  group_id: nominationFile.group_id,
                  shipper_name: nominationFile.group?.name,
                  shipper_id_name: nominationFile.group?.id_name,
                  contract: nominationFile.contract_code?.contract_code || nominationFile.reserve_balancing_gas_contract?.res_bal_gas_contract,
                  contract_code_id: nominationFile.contract_code_id,
                  reserve_balancing_gas_contract_id: nominationFile.reserve_balancing_gas_contract_id,
                  nomination_id: nominationFile.id,
                  nomination_code: nominationFile.nomination_code,
                  zone_text: nominationRowJson.zone_text,
                  area_text: nominationRowJson.area_text,
                  // "unit": unit,
                  point: point,
                  entryExit: entryExit,
                  total: 0,
                  totalMmscfd: null,
                  totalType: nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
                  nomination_type_id: nominationFile.nomination_type_id,
                  timeShow: [],
                  nominationRowJsonDataTemp: nominationRowJsonDataTemp,
                });
              }
            }
            return;
          }
          if (
            nominationFile.nomination_type_id == 2 &&
            result.some((f) => {
              return (
                f?.point === point &&
                f?.zone_text === nominationRowJson.zone_text &&
                f?.area_text === nominationRowJson.area_text &&
                f?.entryExit === entryExit &&
                f?.gas_day === currentDate.format('DD/MM/YYYY') &&
                f?.shipper_id_name === nominationFile.group?.id_name &&
                f?.contract_code_id === nominationFile.contract_code_id &&
                f?.totalType === 'daily' &&
                f?.nomination_type_id === 1
              );
            })
          ) {
            return;
          }

          // ดึงค่าตามวันในสัปดาห์ (Sunday = 0, Monday = 1, ..., Saturday = 6)
          const dayOfWeek = Number(currentDate.tz('Asia/Bangkok').format('d')); // วันในสัปดาห์ (0 = Sunday, 6 = Saturday)
          let vi = null;
          let hourlyVi = null;
          let valueMmscfd = null;
          let valueMmscfh = null;

          let mmscfNominationRowJson = null;
          if(isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')){
            mmscfNominationRowJson = nominationVersion.nomination_row_json.find((anotherNominationRowJson) => {
              const anotherNominationRowJsonDataTemp = JSON.parse(anotherNominationRowJson.data_temp);
              const anotherNominationZone = anotherNominationRowJsonDataTemp['0'];
              const anotherNominationArea = anotherNominationRowJsonDataTemp['2'];
              const anotherNominationPoint = anotherNominationRowJsonDataTemp['3'];
              const anotherNominationUnit = anotherNominationRowJsonDataTemp['9'];
              const anotherNominationEntryExit = anotherNominationRowJsonDataTemp['10'];

              if(
                isMatch(anotherNominationRowJson.zone_text, nominationRowJson.zone_text) &&
                isMatch(anotherNominationRowJson.area_text, nominationRowJson.area_text) &&
                anotherNominationRowJson.nomination_version_id == nominationRowJson.nomination_version_id &&
                anotherNominationRowJson.query_shipper_nomination_type_id == nominationRowJson.query_shipper_nomination_type_id &&
                isMatch(anotherNominationZone, zone) &&
                isMatch(anotherNominationArea, area) &&
                isMatch(anotherNominationPoint, point) &&
                isMatch(anotherNominationEntryExit, entryExit) &&
                (
                  isMatch(anotherNominationUnit, 'MMSCFD') ||
                  isMatch(anotherNominationUnit, 'MMSCFH')
                )
              ){
                return anotherNominationRowJsonDataTemp;
              }
            });
          }

          if (nominationFile.nomination_type_id == 2) {
            const viFromExcel = readNomFromJsonAs3Decimal(nominationRowJsonDataTemp, `${14 + dayOfWeek}`);
            // แบ่งค่ารายวันด้วย 24 เพื่อได้ค่ารายชั่วโมง
            hourlyVi = viFromExcel == null ? null : divideTo3Decimal(viFromExcel, 24);
            vi = hourlyVi * 24;
            if(mmscfNominationRowJson){
              const mmscfNominationRowJsonDataTemp = JSON.parse(mmscfNominationRowJson.data_temp);
              const mmscfFromExcel = readNomFromJsonAs3Decimal(mmscfNominationRowJsonDataTemp, `${14 + dayOfWeek}`);
              valueMmscfh = mmscfFromExcel == null ? null : divideTo6Decimal(mmscfFromExcel, 24);
              valueMmscfd = valueMmscfh * 24;
            }
          } else {
            vi = readNomFromJsonAs3Decimal(nominationRowJsonDataTemp, '38');
            if(mmscfNominationRowJson){
              const mmscfNominationRowJsonDataTemp = JSON.parse(mmscfNominationRowJson.data_temp);
              valueMmscfd = readNomFromJsonAs6Decimal(mmscfNominationRowJsonDataTemp, '38');
            }
          }

          // หาว่ามี point นี้ใน result แล้วหรือยัง (เช็คตาม point, zone, area, entryExit, gas_day, group, contract, nomination)
          let existPointIndex = result.findIndex((f: any) => {
            return (
              f?.point === point &&
              f?.zone_text === nominationRowJson.zone_text &&
              f?.area_text === nominationRowJson.area_text &&
              f?.entryExit === entryExit &&
              f?.gas_day === currentDate.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
              f?.group_id === nominationFile.group_id &&
              f?.contract_code_id === nominationFile.contract_code_id &&
              f?.nomination_id === nominationFile.id
            );
          });
          let timeShow: timeShowDataType[] = [];

          // ถ้ายังไม่มี point นี้ใน result ให้สร้างใหม่
          if (existPointIndex < 0) {
            existPointIndex = result.length;
            result.push({
              gas_day: currentDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
              group_id: nominationFile.group_id,
              shipper_name: nominationFile.group?.name,
              shipper_id_name: nominationFile.group?.id_name,
              contract: nominationFile.contract_code?.contract_code || nominationFile.reserve_balancing_gas_contract?.res_bal_gas_contract,
              contract_code_id: nominationFile.contract_code_id,
              reserve_balancing_gas_contract_id: nominationFile.reserve_balancing_gas_contract_id,
              nomination_id: nominationFile.id,
              nomination_code: nominationFile.nomination_code,
              zone_text: nominationRowJson.zone_text,
              area_text: nominationRowJson.area_text,
              // "unit": unit,
              point: point,
              entryExit: entryExit,
              wi: wi,
              hv: hv,
              sg: sg,
              total: vi,
              totalMmscfd: (isMatch(unit, 'MMSCFD') || isMatch(unit, 'MMSCFH')) ? vi : valueMmscfd,
              totalType: nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
              nomination_type_id: nominationFile.nomination_type_id,
              timeShow: [],
            });
          } else {
            // ถ้ามี point นี้แล้ว ให้ใช้ timeShowtimeShow ที่มีอยู่
            timeShow = result[existPointIndex].timeShow;
            if(isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')){
              result[existPointIndex].total = vi;
            }

            if(!result[existPointIndex].wi && result[existPointIndex].wi != 0){
              result[existPointIndex].wi = wi;
            }
            if(!result[existPointIndex].hv && result[existPointIndex].hv != 0){
              result[existPointIndex].hv = hv;
            }
            if(!result[existPointIndex].sg && result[existPointIndex].sg != 0){
              result[existPointIndex].sg = sg;
            }
          }

          let hvFromEntryAreaData: areaHvDataType | undefined;
          if ((isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) && isMatch(entryExit, 'Exit')) {
            if(isMatch(zone, 'east-west') || isMatch(zone, 'EASTWEST') || isMatch(zone, 'EAST WEST')){
              const keyForHv = `${`${zone}`.trim().toLowerCase()}-${`${area}`.trim().toLowerCase()}`;
              if (hvFromEntryArea.has(keyForHv)) {
                hvFromEntryAreaData = hvFromEntryArea.get(keyForHv);
              }
            }
            else{
            const referenceArea = areaMaster.find((areaObj: any) => isMatch(areaObj.name, area) && isMatch(areaObj.zone.name, zone) && isMatch(areaObj.entry_exit.name, entryExit))?.supply_reference_quality_area_by;

            const keyForHv = `${`${zone}`.trim().toLowerCase()}-${`${referenceArea?.name ?? area}`.trim().toLowerCase()}`;
            if (hvFromEntryArea.has(keyForHv)) {
              hvFromEntryAreaData = hvFromEntryArea.get(keyForHv);
            }
            }
          }

          // ดึงข้อมูลรายชั่วโมง (24 ชั่วโมง) จาก JSON
          // ข้อมูลชั่วโมงเริ่มที่ตำแหน่ง 14 (H1 = 00:00, H2 = 01:00, ..., H24 = 23:00)
          const h1Key = 14;
          for (let i = 0; i <= 23; i++) {
            let valueHourlyMmscfd = valueMmscfd;
            let valueHourlyMmscfh = valueMmscfh;
            if (nominationFile.nomination_type_id == 1) {
              hourlyVi = readNomFromJsonAs3Decimal(nominationRowJsonDataTemp, `${h1Key + i}`);
            }
            const key = `${i.toString().padStart(2, '0')}:00`;
            const heatingValueFromNomList: {
              sumHvMultiplyVi: number;
              sumVi: number;
              eachHour?: Map<number, {
                sumVi: number | null;
                sumHvMultiplyVi: number | null;
                sumSgMultiplyVi: number | null;
              }> | null;
            }[] = [];
            if (hvFromEntryAreaData) {
              heatingValueFromNomList.push({
                sumHvMultiplyVi: hvFromEntryAreaData.sumHvMultiplyVi,
                sumVi: hvFromEntryAreaData.sumVi,
                eachHour: hvFromEntryAreaData.eachHour,
              });
              if ((hvFromEntryAreaData.sumHvMultiplyVi || hvFromEntryAreaData.sumHvMultiplyVi == 0) && hvFromEntryAreaData.sumVi) {
                if (vi != null && !valueHourlyMmscfd && valueHourlyMmscfd != 0) {
                  const calculatedHeatingValueFromNom = divideTo8Decimal(hvFromEntryAreaData.sumHvMultiplyVi, hvFromEntryAreaData.sumVi);
                  valueHourlyMmscfd = divideTo6Decimal(vi, calculatedHeatingValueFromNom);
                }
                if (hourlyVi != null && !valueHourlyMmscfh && valueHourlyMmscfh != 0) {
                  let sumHvMultiplyVi = hvFromEntryAreaData.eachHour?.get(i)?.sumHvMultiplyVi
                  if(!sumHvMultiplyVi && sumHvMultiplyVi != 0){
                    sumHvMultiplyVi = hvFromEntryAreaData.sumHvMultiplyVi
                  }
                  let sumVi = hvFromEntryAreaData.eachHour?.get(i)?.sumVi
                  if(!sumVi && sumVi != 0){
                    sumVi = hvFromEntryAreaData.sumVi
                  }
                  const calculatedHeatingValueFromNom = divideTo8Decimal(sumHvMultiplyVi, sumVi);
                  valueHourlyMmscfh = divideTo6Decimal(hourlyVi, calculatedHeatingValueFromNom);
                }
              }
            }

            // หาว่ามีเวลานี้ใน timeShow แล้วหรือยัง
            const timeShowIndex = timeShow.findIndex((f: any) => {
              return f.time === key;
            });
            if (timeShowIndex < 0) {
              // ถ้ายังไม่มี ให้สร้างใหม่
              if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                timeShow.push({
                  time: key,
                  value: vi,
                  valueMmscfd: valueHourlyMmscfd || valueMmscfd,
                  valuePerHour: hourlyVi,
                  valueMmscfh: valueHourlyMmscfh || valueMmscfh,
                  heatingValueFromNomList: heatingValueFromNomList,
                  heatingValueFromAdjust: null,
                  volumeFromAdjust: null,
                });
              } else if (isMatch(unit, 'MMSCFD')) {
                timeShow.push({
                  time: key,
                  value: null,
                  valueMmscfd: vi,
                  valuePerHour: null,
                  valueMmscfh: hourlyVi,
                  heatingValueFromNomList: heatingValueFromNomList,
                  heatingValueFromAdjust: null,
                  volumeFromAdjust: null,
                });
              }
            } else if(isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')){ // mmscf โดนเปลี่ยนวิธีคิด hv เลยต้องเอาออกไปก่อนไม่ให้บวกซ้ำ
              // ถ้ามีแล้ว ให้บวกค่าเข้าไป (กรณีมีหลาย row สำหรับ point เดียวกัน)
              let timeShowValue = null;
              let timeShowValuePerHour = null;
              let newVi = vi;
              let newHourlyVi = hourlyVi;
              if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                timeShowValue = timeShow[timeShowIndex].value;
                timeShowValuePerHour = timeShow[timeShowIndex].valuePerHour;
                if (isMatch(entryExit, 'Exit')) {
                  newVi = valueHourlyMmscfd || valueMmscfd;
                  newHourlyVi = valueHourlyMmscfh || valueMmscfh;
                }
              } else {
                timeShowValue = timeShow[timeShowIndex].valueMmscfd;
                timeShowValuePerHour = timeShow[timeShowIndex].valueMmscfh;
              }
              if (timeShowValue != null) {
                if (newVi != null) {
                  timeShowValue = parseToNumber6Decimal(timeShowValue + newVi);
                }
              } else {
                if (newVi != null) {
                  timeShowValue = newVi;
                }
              }
              if (timeShowValuePerHour != null) {
                if (newHourlyVi != null) {
                  timeShowValuePerHour = parseToNumber6Decimal(timeShowValuePerHour + newHourlyVi);
                }
              } else {
                timeShowValuePerHour = newHourlyVi;
              }
              if (isMatch(unit, 'MMBTU/D') || isMatch(unit, 'MMBTU/H')) {
                timeShow[timeShowIndex].value = timeShowValue;
                timeShow[timeShowIndex].valuePerHour = timeShowValuePerHour;
              } else {
                timeShow[timeShowIndex].valueMmscfd = timeShowValue;
                timeShow[timeShowIndex].valueMmscfh = timeShowValuePerHour;
              }
            }
          }
          result[existPointIndex].timeShow = timeShow;
        });
      });
    });

    // ไปวันก่อนหน้า
    currentDate = currentDate.subtract(1, 'day');
  }


  // เก็บประวัติการ adjust เพื่อจัดการกับการ adjust ซ้อนทับกัน
  const adjustHistory: {
    nomination_point: string;
    zone_text: string;
    area_text: string;
    entry_exit_name: string;
    gas_day: string;
    group_id: number;
    timeMinutes: number;
    time: string;
  }[] = [];

  // ประมวลผล daily adjustment ทีละรายการ (เรียงตามเวลาที่สร้าง)
  for (const adjust of dailyAdjust) {
    const adjustGasDay = dayjs(adjust.gas_day).tz('Asia/Bangkok').format('DD/MM/YYYY');
    const adjustTime = adjust.time; // เวลาที่ทำการ adjust (เช่น "14:30")
    // แปลง adjustment time เป็นนาที (เพื่อใช้ในการเปรียบเทียบ)
    const adjustTimeMinutes = timeToMinutes(adjustTime);

    const hvFromEntryArea = eachDateHvFromEntryArea.get(adjustGasDay)
    const resultThisRound = cloneAdjustNomResultForRound(result);

    // วนลูปแต่ละ nomination point ที่ต้องการ adjust
    for (const dailyAdjustmentNom of adjust.daily_adjustment_nom) {
      // ดึงค่า adjust value (ใช้ค่ารายชั่วโมงถ้ามี ถ้าไม่มีให้แบ่งค่ารายวันด้วย 24)
      const adjustEnergy = parseToNumber3Decimal(dailyAdjustmentNom.valume_mmscfh2) ?? divideTo3Decimal(parseToNumber3Decimal(dailyAdjustmentNom.valume_mmscfd2), 24);
      const adjustVolume = parseToNumber6Decimal(dailyAdjustmentNom.valume_mmscfh) ?? divideTo6Decimal(parseToNumber6Decimal(dailyAdjustmentNom.valume_mmscfd), 24);
      // const adjustEnergy24H = parseToNumber3Decimal(dailyAdjustmentNom.valume_mmscfd2) ?? parseToNumber3Decimal(parseToNumber3Decimal(dailyAdjustmentNom.valume_mmscfh2) * 24);
      const adjustVolume24H = parseToNumber6Decimal(dailyAdjustmentNom.valume_mmscfd) ?? parseToNumber6Decimal(parseToNumber6Decimal(dailyAdjustmentNom.valume_mmscfh) * 24);
      const heatingValue = parseToNumber6Decimal(dailyAdjustmentNom.heating_value);

      const valueByContractCodeAndContractPoint = new Map<
        number,
        Map<
          number,
          {
            BTUD: number;
            BTUH: number;
            SCFD: number;
            SCFH: number;
          }
        >
      >(); // เก็บค่าก่อน adjust ของแต่ละ result item ที่ตรงกับเงื่อนไข (key = index ใน result, value = ค่าก่อน adjust)

      if (result.every((item: any) => item.point != dailyAdjustmentNom.nomination_point?.nomination_point)) {
        // ต้องเอาค่า book มาแทนตอนไม่มี nom
        const allContracts = contractCodeListByNominationPoint.get(dailyAdjustmentNom.nomination_point?.nomination_point || '') || [];
        if (allContracts.length > 0) {
          const uniqeContractPoint: {
            group_id: number;
            shipper_name: string;
            shipper_id_name: string;
            contractCodeId: number;
            contractCode: string;
            BTUD: number;
            BTUH: number;
            SCFD: number;
            SCFH: number;
            contractPoint: string;
            isReserveBalancingGasContract?: boolean
          }[] = [];
          // สร้าง array สำหรับเก็บ contract code ที่ไม่ซ้ำกัน
          const uniqeContractCode: string[] = [];

          // วนลูปเพื่อแยก contract code และ contract point ที่ไม่ซ้ำกัน
          const adjustGroupByContractCode: {
            group: {
              id: number;
              id_name: string;
              name: string;
              contract_code: {
                id: number;
                contract_code: string;
                contractPointData?: {
                  contractCode: string;
                  BTU: number;
                  SCF: number;
                  contractPoint: string;
                  group_id: number;
                  shipper_name: string;
                  shipper_id_name: string;
                }[];
              }[];
            };
          }[] = adjust.daily_adjustment_group
            .map((adjustmentGroup) => {
              const onlyMatchContractCode = adjustmentGroup.group.contract_code
                .map((contractCode) => {
                  const matchContract = allContracts.filter((contract) => contract.contractCode == contractCode.contract_code);
                  if (matchContract.length > 0) {
                    const contractPointDataList = matchContract.map((contractPointData) => {
                      const contractPointDataWithGroup = {
                        ...contractPointData,
                        group_id: adjustmentGroup.group.id,
                        shipper_name: adjustmentGroup.group.name,
                        shipper_id_name: adjustmentGroup.group.id_name,
                      };

                      // เพิ่ม contract code ที่ยังไม่มีใน list
                      if (!uniqeContractCode.some((u: any) => u === contractCode.contract_code)) {
                        uniqeContractCode.push(contractCode.contract_code);
                      }

                      // เพิ่ม contract point ที่ตรงกับ contract code ของ target และยังไม่มีใน list
                      if (!uniqeContractPoint.some((u: any) => u.contractCode === contractPointData.contractCode && u.contractPoint === contractPointData.contractPoint)) {
                        uniqeContractPoint.push(contractPointDataWithGroup);
                      }
                      return contractPointDataWithGroup;
                    });
                    return {
                      ...contractCode,
                      contractPointData: contractPointDataList,
                    };
                  }
                  return contractCode;
                })
                .filter((contractCode: any) => contractCode.contractPointData && contractCode.contractPointData.length > 0);

              if (onlyMatchContractCode.length > 0) {
                return {
                  ...adjustmentGroup,
                  group: {
                    ...adjustmentGroup.group,
                    contract_code: onlyMatchContractCode,
                  },
                };
              }
              return adjustmentGroup;
            })
            .filter((adjustmentGroup: any) => adjustmentGroup.group?.contract_code && adjustmentGroup.group.contract_code.length > 0);

          // ตรวจสอบว่าทุก contract ที่เกี่ยวข้องไม่มี nomination ทั้งหมด (ไม่มี valuePerHour ในทุก timeShow)
          // เพื่อให้แน่ใจว่าจะใช้ค่า booking แทน nomination ได้
          const isNoNomInAllContract = result
            .filter((item) => uniqeContractCode.includes(item.contract) && item.point == dailyAdjustmentNom.nomination_point?.nomination_point)
            .every((item) => item.timeShow.every((timeItem2: any) => timeItem2?.valuePerHour == null || timeItem2?.valuePerHour == undefined));

          // ถ้าทุก contract ไม่มี nomination ให้ใช้ค่า booking จาก contract
          if (isNoNomInAllContract) {
            let hvFromEntryAreaData: areaHvDataType | undefined;
            if (isMatch(dailyAdjustmentNom.nomination_point?.entry_exit?.name, 'Exit')) {
              const referenceArea = areaMaster.find((areaObj: any) => isMatch(areaObj.name, dailyAdjustmentNom.nomination_point?.area?.name) && isMatch(areaObj.zone.name, dailyAdjustmentNom.nomination_point?.zone?.name) && isMatch(areaObj.entry_exit.name, dailyAdjustmentNom.nomination_point?.entry_exit?.name))?.supply_reference_quality_area_by;

              const keyForHv = `${`${dailyAdjustmentNom.nomination_point?.zone?.name}`.trim().toLowerCase()}-${`${referenceArea?.name ?? dailyAdjustmentNom.nomination_point?.area?.name}`.trim().toLowerCase()}`;
              if (hvFromEntryArea.has(keyForHv)) {
                hvFromEntryAreaData = hvFromEntryArea.get(keyForHv);
              }
            }

            uniqeContractPoint.map((contractPointData) => {
              if (
                !result.some(
                  (f: any) =>
                    f?.point === contractPointData.contractPoint &&
                    f?.group_id === contractPointData.group_id &&
                    // && f?.shipper_name === contractPointData.shipper_name
                    // && f?.shipper_id_name === contractPointData.shipper_id_name
                    // && f?.contract === contractPointData.contractCode
                    f?.contract_code_id === contractPointData.contractCodeId,
                )
              ) {
                // รวมค่า BTU และ SCF จาก contract point ทั้งหมดที่เกี่ยวข้อง
                const sumBTUAndSCF = uniqeContractPoint
                  .filter((item) => item.contractCodeId == contractPointData.contractCodeId && item.contractPoint == contractPointData.contractPoint)
                  .reduce(
                    (accum, item) => {
                      if (item.BTUD) {
                        // รวมค่า BTUD
                        if (accum.BTUD) {
                          accum.BTUD = parseToNumber6Decimal(accum.BTUD + item.BTUD); // บวกค่า BTUD เข้าไป
                        } else {
                          accum.BTUD = item.BTUD; // ตั้งค่า BTUD ครั้งแรก
                        }
                      }
                      if (item.BTUH) {
                        // รวมค่า BTUH
                        if (accum.BTUH) {
                          accum.BTUH = parseToNumber6Decimal(accum.BTUH + item.BTUH); // บวกค่า BTUH เข้าไป
                        } else {
                          accum.BTUH = item.BTUH; // ตั้งค่า BTUH ครั้งแรก
                        }
                      }
                      if (item.SCFD) {
                        // รวมค่า SCFD
                        if (accum.SCFD) {
                          accum.SCFD = parseToNumber6Decimal(accum.SCFD + item.SCFD); // บวกค่า SCFD เข้าไป
                        } else {
                          accum.SCFD = item.SCFD; // ตั้งค่า SCFD ครั้งแรก
                        }
                      }
                      if (item.SCFH) {
                        // รวมค่า SCFH
                        if (accum.SCFH) {
                          accum.SCFH = parseToNumber6Decimal(accum.SCFH + item.SCFH); // บวกค่า SCFH เข้าไป
                        } else {
                          accum.SCFH = item.SCFH; // ตั้งค่า SCFH ครั้งแรก
                        }
                      }
                      return accum;
                    },
                    {
                      BTUD: null,
                      BTUH: null,
                      SCFD: null,
                      SCFH: null,
                    } as {
                      BTUD: number | null;
                      BTUH: number | null;
                      SCFD: number | null;
                      SCFH: number | null;
                    },
                  );

                let value = null;
                let valuePerHour = null;
                let valueMmscfd = null;
                let valueMmscfh = null;
                if (sumBTUAndSCF.BTUH || sumBTUAndSCF.BTUH == 0) {
                  valuePerHour = sumBTUAndSCF.BTUH;
                }

                if (sumBTUAndSCF.BTUD || sumBTUAndSCF.BTUD == 0) {
                  value = sumBTUAndSCF.BTUD;
                  if (!sumBTUAndSCF.BTUH && sumBTUAndSCF.BTUH != 0) {
                    valuePerHour = sumBTUAndSCF.BTUD / 24;
                  }
                }

                if (sumBTUAndSCF.SCFH || sumBTUAndSCF.SCFH == 0) {
                  valueMmscfh = sumBTUAndSCF.SCFH;
                }

                if (sumBTUAndSCF.SCFD || sumBTUAndSCF.SCFD == 0) {
                  valueMmscfd = sumBTUAndSCF.SCFD;
                  if (!sumBTUAndSCF.SCFH && sumBTUAndSCF.SCFH != 0) {
                    valueMmscfh = sumBTUAndSCF.SCFD / 24;
                  }
                }

                const heatingValueFromNomList: {
                  sumHvMultiplyVi: number | null;
                  sumVi: number | null;
                }[] = [];
                if (hvFromEntryAreaData) {
                  heatingValueFromNomList.push({
                    sumHvMultiplyVi: hvFromEntryAreaData.sumHvMultiplyVi,
                    sumVi: hvFromEntryAreaData.sumVi,
                  });
                  if ((hvFromEntryAreaData.sumHvMultiplyVi || hvFromEntryAreaData.sumHvMultiplyVi == 0) && hvFromEntryAreaData.sumVi) {
                    const calculatedHeatingValueFromNom = hvFromEntryAreaData.sumHvMultiplyVi / hvFromEntryAreaData.sumVi;
                    if (value != null && valueMmscfd == null) {
                      valueMmscfd = value / calculatedHeatingValueFromNom;
                    }
                    if (valuePerHour != null && valueMmscfh == null) {
                      valueMmscfh = valuePerHour / calculatedHeatingValueFromNom;
                    }
                  }
                }

                const [hours, minutes] = adjustTime.split(':').map(Number);

                let timeShowIndex: number | null = null;
                const timeShow = [];
                for (let i = 0; i <= 23; i++) {
                  const key = `${i.toString().padStart(2, '0')}:00`;

                  const isReplaceValue = i > hours || (i == hours && minutes == 0);
                  if (!timeShowIndex && i == hours && minutes == 0) {
                    timeShowIndex = timeShow.length;
                  }

                  timeShow.push({
                    time: key,
                    value: isReplaceValue ? value : null,
                    valueMmscfd: isReplaceValue ? valueMmscfd : null,
                    valuePerHour: isReplaceValue ? valuePerHour : null,
                    valueMmscfh: isReplaceValue ? valueMmscfh : null,
                    heatingValueFromNomList: heatingValueFromNomList,
                    heatingValueFromAdjust: null,
                    volumeFromAdjust: null,
                  });
                }

                if (minutes > 0) {
                  timeShowIndex = timeShow.length;
                  timeShow.push({
                    time: adjustTime,
                    value: value,
                    valueMmscfd: valueMmscfd,
                    valuePerHour: valuePerHour,
                    valueMmscfh: valueMmscfh,
                    heatingValueFromNomList: heatingValueFromNomList,
                    heatingValueFromAdjust: null,
                    volumeFromAdjust: null,
                  });
                }

                // เก็บค่า BTU และ SCF ที่คำนวณได้ไว้ใน Map เพื่อใช้ในภายหลัง
                // Key: index ของ result item, Value: Map ที่เก็บ timeShowIndex และค่า BTU, SCF
                valueByContractCodeAndContractPoint.set(
                  result.length,
                  new Map<
                    number,
                    {
                      BTUD: number | null;
                      BTUH: number | null;
                      SCFD: number | null;
                      SCFH: number | null;
                    }
                  >().set(timeShowIndex, {
                    BTUD: sumBTUAndSCF.BTUD,
                    BTUH: sumBTUAndSCF.BTUH,
                    SCFD: sumBTUAndSCF.SCFD,
                    SCFH: sumBTUAndSCF.SCFH,
                  }),
                );
                result.push({
                  gas_day: adjustGasDay,
                  group_id: contractPointData.group_id,
                  shipper_name: contractPointData.shipper_name,
                  shipper_id_name: contractPointData.shipper_id_name,
                  contract: contractPointData.contractCode,
                  contract_code_id: contractPointData.isReserveBalancingGasContract ? undefined : contractPointData.contractCodeId,
                  reserve_balancing_gas_contract_id: undefined,
                  nomination_id: undefined, // nominationFile.id,
                  nomination_code: undefined, // nominationFile.nomination_code,
                  zone_text: dailyAdjustmentNom.nomination_point?.zone?.name,
                  area_text: dailyAdjustmentNom.nomination_point?.area?.name,
                  // "unit": 'MMBTU/D',
                  point: dailyAdjustmentNom.nomination_point?.nomination_point,
                  entryExit: dailyAdjustmentNom.nomination_point?.entry_exit?.name,
                  total: value,
                  totalMmscfd: valueMmscfd,
                  totalType: 'daily', // nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
                  nomination_type_id: 1, // nominationFile.nomination_type_id,
                  timeShow: timeShow,
                });

                // valueByContractCodeAndContractPoint.set(result.length, new Map<number, {BTUD: number | null, BTUH: number | null, SCFD: number | null, SCFH: number | null}>().set(timeShowIndex, {BTUD: sumBTUAndSCF.BTUD, BTUH: sumBTUAndSCF.BTUH, SCFD: sumBTUAndSCF.SCFD, SCFH: sumBTUAndSCF.SCFH}))
                // result.push({
                //   "gas_day": getTodayNowAdd7(adjust.gas_day).tz('Asia/Bangkok').format('DD/MM/YYYY'),
                //   "group_id": contractPointData.group_id,
                //   "shipper_name": contractPointData.shipper_name,
                //   "shipper_id_name": contractPointData.shipper_id_name,
                //   "contract": contractPointData.contractCode,
                //   "contract_code_id": contractPointData.contractCodeId,
                //   "nomination_id": undefined,// nominationFile.id,
                //   "nomination_code": undefined,// nominationFile.nomination_code,
                //   "zone_text": dailyAdjustmentNom.nomination_point.zone.name,
                //   "area_text": dailyAdjustmentNom.nomination_point.area.name,
                //   "unit": 'MMSCFD',
                //   "point": dailyAdjustmentNom.nomination_point.nomination_point,
                //   "entryExit": dailyAdjustmentNom.nomination_point.entry_exit.name,
                //   "total": valueMmscfd,
                //   "totalType": 'daily', // nominationFile.nomination_type_id == 2 ? 'weekly' : 'daily',
                //   "nomination_type_id": 1, // nominationFile.nomination_type_id,
                //   "timeShow": timeShow,
                // })
              }
            });
          }
        }
      }

      // ประมวลผลค่า BTU และ SCF ที่เก็บไว้ใน valueByContractCodeAndContractPoint (กรณีไม่มี nomination)
      // และนำไปตั้งค่าใน timeShow items พร้อมคำนวณค่า volume สำหรับ Exit point
      for (const [index, subMap] of valueByContractCodeAndContractPoint.entries()) {
        const target = result[index];
        // วนลูป timeShow items ที่เก็บค่า BTU/SCF ไว้
        for (const [timeShowIndex, value] of subMap.entries()) {
          // กรณีที่มีค่า BTU (Energy) จาก contract booking
          let valuePerHour: number | null = null;
          if (value.BTUH || value.BTUH == 0) {
            valuePerHour = value.BTUH;
          }
          if (value.BTUD || value.BTUD == 0) {
            if (!value.BTUH && value.BTUH != 0) {
              // คำนวณค่า energy รายชั่วโมง (MMBTU/H) โดยแบ่งค่ารายวันด้วย 24
              valuePerHour = value.BTUD / 24;
            }

            // ตั้งค่า energy รายวันและรายชั่วโมงใน timeShow
            result[index].timeShow[timeShowIndex].value = value.BTUD;
            result[index].timeShow[timeShowIndex].valuePerHour = valuePerHour;

            // สำหรับ Exit point: คำนวณค่า volume จาก energy โดยใช้ heating value
            if (target && isMatch(target?.entryExit, 'Exit')) {
              if (heatingValue) {
                // คำนวณค่า volume รายวัน (MMSCFD) = Energy (MMBTU/D) / Heating Value
                const valueMmscfd = value.BTUD / heatingValue;
                // คำนวณค่า volume รายชั่วโมง (MMSCFH) = Energy per Hour (MMBTU/H) / Heating Value
                const valueMmscfh = (value.BTUH ? value.BTUH : value.BTUD / 24) / heatingValue;

                // ตั้งค่า volume รายวันและรายชั่วโมงใน timeShow
                result[index].timeShow[timeShowIndex].valueMmscfd = valueMmscfd;
                result[index].timeShow[timeShowIndex].valueMmscfh = valueMmscfh;
              }
            }
          }

          // กรณีที่มีค่า SCF (Volume) จาก contract booking
          let valueMmscfh: number | null = null;
          if (value.SCFH || value.SCFH == 0) {
            valueMmscfh = value.SCFH;
          }
          if (value.SCFD || value.SCFD == 0) {
            if (!value.SCFH && value.SCFH != 0) {
              // คำนวณค่า volume รายชั่วโมง (MMSCFH) โดยแบ่งค่ารายวันด้วย 24
              valueMmscfh = value.SCFD / 24;
            }

            // ตั้งค่า volume รายวันและรายชั่วโมงใน timeShow
            result[index].timeShow[timeShowIndex].valueMmscfd = value.SCFD;
            result[index].timeShow[timeShowIndex].valueMmscfh = valueMmscfh;
          }
        }
      }

      // หา result items ที่ต้องการ adjust (ต้องตรงกับ point, zone, area, entry/exit, gas_day และอยู่ใน group ที่กำหนด)
      const adjustTargetList = result.filter(target => 
        (target && target?.point) == dailyAdjustmentNom.nomination_point?.nomination_point &&
        isMatch((target && target?.zone_text), dailyAdjustmentNom.nomination_point?.zone?.name) &&
        isMatch((target && target?.area_text), dailyAdjustmentNom.nomination_point?.area?.name) &&
        isMatch((target && target?.entryExit), dailyAdjustmentNom.nomination_point?.entry_exit?.name) &&
        target?.gas_day === adjustGasDay &&
        adjust.daily_adjustment_group.map((item) => item.group.id).includes(target?.group_id) &&
        (target.timeShow && Array.isArray(target.timeShow) && target.timeShow.length > 0) 
      )
      
      if(adjustTargetList.length > 0){
      adjustTargetList.map(target => {
        // ประมวลผลแต่ละ result item ที่ต้องการ adjust

        // หาค่าล่าสุดก่อนเวลา adjustment (เพื่อใช้ในการคำนวณสัดส่วนการกระจายค่า adjust)
        // กรอง timeShow ที่มีเวลาก่อน adjustment time
        const timeShowBeforeAdjust = (target.timeShow || []).filter((timeItem: any) => {
          const timeItemMinutes = timeToMinutes(timeItem.time);
          return timeItemMinutes < adjustTimeMinutes;
        });

        // หา timeShow item ล่าสุด (เรียงตามเวลา)
        if (timeShowBeforeAdjust.length > 0) {
          const latestTimeShow = timeShowBeforeAdjust.reduce((latest: any, current: any) => {
            const latestMinutes = timeToMinutes(latest.time);
            const currentMinutes = timeToMinutes(current.time);
            return currentMinutes > latestMinutes ? current : latest;
          });

          // energyBeforeAdjustInThisRound.set(index, latestTimeShow.valuePerHour);
          // volumeBeforeAdjustInThisRound.set(index, latestTimeShow.valueMmscfh);
        }

        // ค่า adjust ที่ต้องเพิ่มไปใน timeShow
        let newValue : {
          mmbtuh: number | null;
          mmscfh: number | null;
        } | null = null;
        let newItemList: adjustNomDataType[] = [];

        // หาประวัติการ adjust ที่เกิดขึ้นหลังจากเวลา adjust ปัจจุบัน (สำหรับ point, zone, area, entry/exit, gas_day, group เดียวกัน)
        // เพื่อไม่ให้ adjustment ปัจจุบันไปแก้ไขค่าหลังจาก adjustment ที่เกิดขึ้นในภายหลัง
        const activeHistory = adjustHistory.filter(
          (history) =>
            history.nomination_point == target.point &&
            history.zone_text == target.zone_text &&
            history.area_text == target.area_text &&
            history.entry_exit_name == target.entryExit &&
            history.gas_day == target.gas_day &&
            history.group_id == target.group_id &&
            history.timeMinutes > adjustTimeMinutes,
        );
        // หาเวลาที่ไม่ควร adjust (เวลาของ adjustment ที่เกิดขึ้นหลังจากนี้)
        const doNotAdjustAfterTime = activeHistory.length > 0 ? Math.min(...activeHistory.map((history) => history.timeMinutes)) : undefined;
        // อัพเดทค่าใน timeShow ตั้งแต่เวลา adjustment เป็นต้นไป (จนถึงเวลาของ adjustment ถัดไป ถ้ามี)
        for (let timeShowIndex = 0; timeShowIndex < target.timeShow.length; timeShowIndex++) {
          const timeShow = target.timeShow[timeShowIndex];
          const timeShowMinutes = timeToMinutes(timeShow.time);
          if (timeShowMinutes >= adjustTimeMinutes && (!doNotAdjustAfterTime || timeShowMinutes < doNotAdjustAfterTime)) {
            // รวมค่าก่อน adjust ทั้งหมด (เพื่อใช้คำนวณสัดส่วน)
            const {sumVi, sumHvMultiplyVi, sumSgMultiplyVi, sumEnergy, sumHvMultiplyEnergy, sumSgMultiplyEnergy} = getSumViForAdjustAtTimeShow({
              list: resultThisRound,
              zone: target.zone_text,
              area: target.area_text,
              entryExit: target && target?.entryExit,
              point: target.point,
              gasDay: target?.gas_day,
              time: target.timeShow[timeShowIndex].time,
              dailyAdjustmentGroup: adjust.daily_adjustment_group.map((item) => item.group.id),
              areaMaster: areaMaster,
              historyBvw10AndRa6List,
              dayOfWeek: Number(getTodayNowDDMMYYYYAdd7(target.gas_day).format('d'))
            })

            // เก็บค่าก่อน adjust ของ result item นี้
            let volumeBeforeAdjust = timeShow.valueMmscfh;
            if(!volumeBeforeAdjust && volumeBeforeAdjust != 0 && timeShow.valueMmscfd){
              volumeBeforeAdjust = timeShow.valueMmscfd / 24;
            }
            let energyBeforeAdjust = timeShow.valuePerHour;
            if(!energyBeforeAdjust && energyBeforeAdjust != 0 && timeShow.value){
              energyBeforeAdjust = timeShow.value / 24;
            }

            const adjustGroupContractCodes = adjust.daily_adjustment_group.flatMap(
              (dailyAdjustmentGroup) =>
                dailyAdjustmentGroup.group.contract_code.map((contractCode) => ({
                  contractCodeId: contractCode.id,
                  contractCode: contractCode.contract_code,
                  group_id: dailyAdjustmentGroup.group.id,
                  shipper_name: dailyAdjustmentGroup.group.name,
                  shipper_id_name: dailyAdjustmentGroup.group.id_name,
                })),
            );
            const activeContractCodeList = (contractCodeListByNominationPoint.get(target?.point) ?? []).filter((contractCodeByNominationPoint) =>
              adjustGroupContractCodes.some((item) => item.contractCodeId == contractCodeByNominationPoint.contractCodeId)
            );

            if (!sumVi || !sumEnergy) {
              const newAdjustResultList = ensureMissingActiveContractsInAdjustResult({
                result,
                target,
                activeContractCodeList,
                adjustGroupContractCodes,
              });

              newItemList.push(...newAdjustResultList);
            }

            // คำนวณค่าใหม่ตามสัดส่วน: (ค่าเดิม / ผลรวมค่าเดิมทั้งหมด) * ค่า adjust ที่ต้องการ
            let newMmscfh = null;
            if (!sumVi) {
              newMmscfh = activeContractCodeList.length > 0 ? adjustVolume / activeContractCodeList.length : null;
            } else {
              newMmscfh = (volumeBeforeAdjust / sumVi) * adjustVolume;
            }

            let newMmbtuh = null;
            if (!sumEnergy) {
              newMmbtuh = activeContractCodeList.length > 0 ? adjustEnergy / activeContractCodeList.length : null;
            }
            else if (energyBeforeAdjust || energyBeforeAdjust == 0) {
              newMmbtuh = (energyBeforeAdjust / sumEnergy) * adjustEnergy;
            }
            if(!newValue){
              newValue = {
                mmbtuh: newMmbtuh,
                mmscfh: newMmscfh,
              }
            }
            target.timeShow[timeShowIndex].value = parseToNumber6Decimal((newMmbtuh != null) ? parseToNumber6Decimal(newMmbtuh * 24) : target.timeShow[timeShowIndex].value);
            target.timeShow[timeShowIndex].valueMmscfd = parseToNumber6Decimal((newMmscfh != null) ? parseToNumber6Decimal(newMmscfh * 24) : target.timeShow[timeShowIndex].valueMmscfd);
            target.timeShow[timeShowIndex].valuePerHour = parseToNumber6Decimal(newMmbtuh ?? target.timeShow[timeShowIndex].valuePerHour);
            target.timeShow[timeShowIndex].valueMmscfh = parseToNumber6Decimal(newMmscfh ?? target.timeShow[timeShowIndex].valueMmscfh);
            target.timeShow[timeShowIndex].heatingValueFromAdjust = heatingValue;
            target.timeShow[timeShowIndex].volumeFromAdjust = adjustVolume;
            target.timeShow[timeShowIndex].energyFromAdjust = adjustEnergy;
            target.timeShow[timeShowIndex].isAdjust = true;
            if(newItemList.length > 0){
              newItemList.forEach(newItem => {
                const newItemIndex = result.findIndex(item => item.point == newItem.point &&
                  item.zone_text == newItem.zone_text &&
                  item.area_text == newItem.area_text &&
                  item.entryExit == newItem.entryExit &&
                  item.gas_day == newItem.gas_day &&
                  item.group_id == newItem.group_id &&
                  item.contract_code_id == newItem.contract_code_id
                )
                if(newItemIndex >= 0){
                  const newItemTimeShowIndex = result[newItemIndex].timeShow.findIndex(item => item.time == target.timeShow[timeShowIndex].time);
                  if(newItemTimeShowIndex >= 0){
                    ((result[newItemIndex].timeShow[newItemTimeShowIndex].value = parseToNumber6Decimal(newMmbtuh != null ? parseToNumber6Decimal(newMmbtuh * 24) : result[newItemIndex].timeShow[newItemTimeShowIndex].value)),
                    (result[newItemIndex].timeShow[newItemTimeShowIndex].valueMmscfd = parseToNumber6Decimal(newMmscfh != null ? parseToNumber6Decimal(newMmscfh * 24) : result[newItemIndex].timeShow[newItemTimeShowIndex].valueMmscfd)),
                    (result[newItemIndex].timeShow[newItemTimeShowIndex].valuePerHour = parseToNumber6Decimal(newMmbtuh ?? result[newItemIndex].timeShow[newItemTimeShowIndex].valuePerHour)));
                    result[newItemIndex].timeShow[newItemTimeShowIndex].valueMmscfh = parseToNumber6Decimal(newMmscfh ?? result[newItemIndex].timeShow[newItemTimeShowIndex].valueMmscfh);
                    result[newItemIndex].timeShow[newItemTimeShowIndex].heatingValueFromAdjust = heatingValue;
                    result[newItemIndex].timeShow[newItemTimeShowIndex].volumeFromAdjust = adjustVolume;
                    result[newItemIndex].timeShow[newItemTimeShowIndex].energyFromAdjust = adjustEnergy;
                    result[newItemIndex].timeShow[newItemTimeShowIndex].isAdjust = true;
                  }
                }
              })
            }
          }
        }



        // เพิ่มจุดเวลา adjustment เข้าไปใน timeShow (เพื่อแสดงว่ามีการ adjust ที่เวลานี้)
        const existTimeShowIndex = target.timeShow.findIndex((f: any) => f.time == adjustTime);
        if (existTimeShowIndex < 0) {
          if(!newValue){
            const refTimeShow = target.timeShow
              .filter(timeShow => {
                const timeShowMinutes = timeToMinutes(timeShow.time);
                return timeShowMinutes < adjustTimeMinutes && (!doNotAdjustAfterTime || timeShowMinutes < doNotAdjustAfterTime)
              })
              .reduce((latest, current) => {
                if (!latest) return current;
                return timeToMinutes(current.time) > timeToMinutes(latest.time) ? current : latest;
              }, null as timeShowDataType | null)
              
            // รวมค่าก่อน adjust ทั้งหมด (เพื่อใช้คำนวณสัดส่วน)
            const {sumVi, sumHvMultiplyVi, sumSgMultiplyVi, sumEnergy, sumHvMultiplyEnergy, sumSgMultiplyEnergy} = getSumViForAdjustAtTimeShow({
              list: resultThisRound,
              zone: target.zone_text,
              area: target.area_text,
              entryExit: target && target?.entryExit,
              point: target.point,
              gasDay: target?.gas_day,
              time: refTimeShow.time,
              dailyAdjustmentGroup: adjust.daily_adjustment_group.map((item) => item.group.id),
              areaMaster: areaMaster,
              historyBvw10AndRa6List,
              dayOfWeek: Number(getTodayNowDDMMYYYYAdd7(target.gas_day).format('d'))
            })
  
            // เก็บค่าก่อน adjust ของ result item นี้
            let volumeBeforeAdjust = refTimeShow.valueMmscfh;
            if(!volumeBeforeAdjust && volumeBeforeAdjust != 0 && refTimeShow.valueMmscfd){
              volumeBeforeAdjust = refTimeShow.valueMmscfd / 24;
            }
            let energyBeforeAdjust = refTimeShow.valuePerHour;
            if(!energyBeforeAdjust && energyBeforeAdjust != 0 && refTimeShow.value){
              energyBeforeAdjust = refTimeShow.value / 24;
            }
  
            const adjustGroupContractCodes = adjust.daily_adjustment_group.flatMap(
              (dailyAdjustmentGroup) =>
                dailyAdjustmentGroup.group.contract_code.map((contractCode) => ({
                  contractCodeId: contractCode.id,
                  contractCode: contractCode.contract_code,
                  group_id: dailyAdjustmentGroup.group.id,
                  shipper_name: dailyAdjustmentGroup.group.name,
                  shipper_id_name: dailyAdjustmentGroup.group.id_name,
                })),
            );
            const activeContractCodeList = (contractCodeListByNominationPoint.get(target?.point) ?? []).filter((contractCodeByNominationPoint) =>
              adjustGroupContractCodes.some((item) => item.contractCodeId == contractCodeByNominationPoint.contractCodeId)
            );
  
            if (!sumVi || !sumEnergy) {
              const newAdjustResultList = ensureMissingActiveContractsInAdjustResult({
                result,
                target,
                activeContractCodeList,
                adjustGroupContractCodes,
              });
  
              newItemList.push(...newAdjustResultList);
            }
  
            // คำนวณค่าใหม่ตามสัดส่วน: (ค่าเดิม / ผลรวมค่าเดิมทั้งหมด) * ค่า adjust ที่ต้องการ
            let newMmscfh = null;
            if (!sumVi) {
              newMmscfh = activeContractCodeList.length > 0 ? adjustVolume / activeContractCodeList.length : null;
            } else {
              newMmscfh = (volumeBeforeAdjust / sumVi) * adjustVolume;
            }
  
            let newMmbtuh = null;
            if (!sumEnergy) {
              newMmbtuh = activeContractCodeList.length > 0 ? adjustEnergy / activeContractCodeList.length : null;
            }
            else if (energyBeforeAdjust || energyBeforeAdjust == 0) {
              newMmbtuh = (energyBeforeAdjust / sumEnergy) * adjustEnergy;
            }
            if(!newValue){
              newValue = {
                mmbtuh: newMmbtuh,
                mmscfh: newMmscfh,
              }
            }
          }

          target.timeShow.push({
            time: adjustTime,
            value: parseToNumber6Decimal(newValue?.mmbtuh != null ? parseToNumber6Decimal(newValue?.mmbtuh * 24)  : null),
            valueMmscfd: parseToNumber6Decimal(newValue?.mmscfh != null ? parseToNumber6Decimal(newValue?.mmscfh * 24) : null),
            valuePerHour: parseToNumber6Decimal(newValue?.mmbtuh),
            valueMmscfh: parseToNumber6Decimal(newValue?.mmscfh),
            heatingValueFromAdjust: heatingValue,
            volumeFromAdjust: adjustVolume,
            energyFromAdjust: adjustEnergy,
            isAdjust: true,
          });
          target.timeShow.sort((a: any, b: any) => {
            return timeToMinutes(a.time) - timeToMinutes(b.time);
          });
        } else {
          target.timeShow[existTimeShowIndex].value = parseToNumber6Decimal(newValue?.mmbtuh != null ? parseToNumber6Decimal(newValue?.mmbtuh * 24) : target.timeShow[existTimeShowIndex].value);
          target.timeShow[existTimeShowIndex].valueMmscfd = parseToNumber6Decimal(newValue?.mmscfh != null ? parseToNumber6Decimal(newValue?.mmscfh * 24) : target.timeShow[existTimeShowIndex].valueMmscfd);
          target.timeShow[existTimeShowIndex].valuePerHour = parseToNumber6Decimal(newValue?.mmbtuh ?? target.timeShow[existTimeShowIndex].valuePerHour);
          target.timeShow[existTimeShowIndex].valueMmscfh = parseToNumber6Decimal(newValue?.mmscfh ?? target.timeShow[existTimeShowIndex].valueMmscfh);
          target.timeShow[existTimeShowIndex].heatingValueFromAdjust = heatingValue;
          target.timeShow[existTimeShowIndex].volumeFromAdjust = adjustVolume;
          target.timeShow[existTimeShowIndex].energyFromAdjust = adjustEnergy;
          target.timeShow[existTimeShowIndex].isAdjust = true;
        }
        if(newItemList.length > 0){
          newItemList.forEach(newItem => {
            const newItemIndex = result.findIndex(item => item.point == newItem.point &&
              item.zone_text == newItem.zone_text &&
              item.area_text == newItem.area_text &&
              item.entryExit == newItem.entryExit &&
              item.gas_day == newItem.gas_day &&
              item.group_id == newItem.group_id &&
              item.contract_code_id == newItem.contract_code_id
            )
            if(newItemIndex >= 0){
              const newItemExistTimeShowIndex = result[newItemIndex].timeShow.findIndex((f: any) => f.time == adjustTime);
              if(newItemExistTimeShowIndex < 0){
                result[newItemIndex].timeShow.push({
                  time: adjustTime,
                  value: parseToNumber6Decimal(newValue?.mmbtuh != null ? parseToNumber6Decimal(newValue?.mmbtuh * 24)  : null),
                  valueMmscfd: parseToNumber6Decimal(newValue?.mmscfh != null ? parseToNumber6Decimal(newValue?.mmscfh * 24) : null),
                  valuePerHour: parseToNumber6Decimal(newValue?.mmbtuh),
                  valueMmscfh: parseToNumber6Decimal(newValue?.mmscfh),
                  heatingValueFromAdjust: heatingValue,
                  volumeFromAdjust: adjustVolume,
                  energyFromAdjust: adjustEnergy,
                  isAdjust: true,
                });
                result[newItemIndex].timeShow.sort((a: any, b: any) => {
                  return timeToMinutes(a.time) - timeToMinutes(b.time);
                });
              }
              else{
                ((result[newItemIndex].timeShow[newItemExistTimeShowIndex].value = parseToNumber6Decimal(newValue?.mmbtuh != null ? parseToNumber6Decimal(newValue?.mmbtuh * 24) : result[newItemIndex].timeShow[newItemExistTimeShowIndex].value)),
                (result[newItemIndex].timeShow[newItemExistTimeShowIndex].valueMmscfd = parseToNumber6Decimal(newValue?.mmscfh != null ? parseToNumber6Decimal(newValue?.mmscfh * 24) : result[newItemIndex].timeShow[newItemExistTimeShowIndex].valueMmscfd)),
                (result[newItemIndex].timeShow[newItemExistTimeShowIndex].valuePerHour = parseToNumber6Decimal(newValue?.mmbtuh ?? result[newItemIndex].timeShow[newItemExistTimeShowIndex].valuePerHour)));
                result[newItemIndex].timeShow[newItemExistTimeShowIndex].valueMmscfh = parseToNumber6Decimal(newValue?.mmscfh ?? result[newItemIndex].timeShow[newItemExistTimeShowIndex].valueMmscfh);
                result[newItemIndex].timeShow[newItemExistTimeShowIndex].heatingValueFromAdjust = heatingValue;
                result[newItemIndex].timeShow[newItemExistTimeShowIndex].volumeFromAdjust = adjustVolume;
                result[newItemIndex].timeShow[newItemExistTimeShowIndex].energyFromAdjust = adjustEnergy;
                result[newItemIndex].timeShow[newItemExistTimeShowIndex].isAdjust = true;
              }
            }
          })
        }

        // บันทึกประวัติการ adjust
        adjustHistory.push({
          nomination_point: target.point,
          zone_text: target.zone_text,
          area_text: target.area_text,
          entry_exit_name: target.entryExit,
          gas_day: target.gas_day,
          group_id: target.group_id,
          timeMinutes: adjustTimeMinutes,
          time: adjustTime,
        });
      })
      }
      else{
        const target : adjustNomDataType = {
          gas_day: adjustGasDay,
          shipper_name: "HKH",
          zone_text: dailyAdjustmentNom.nomination_point?.zone?.name,
          area_text: dailyAdjustmentNom.nomination_point?.area?.name,
          point: dailyAdjustmentNom.nomination_point?.nomination_point,
          entryExit: dailyAdjustmentNom.nomination_point?.entry_exit?.name,
          timeShow: [],
          group_id: 0,
          shipper_id_name: '',
          contract: '',
          contract_code_id: undefined,
          reserve_balancing_gas_contract_id: undefined,
          total: 0,
          totalType: 'daily'
        }
    
        const adjustGroupContractCodes = adjust.daily_adjustment_group.flatMap(
          (dailyAdjustmentGroup) =>
            dailyAdjustmentGroup.group.contract_code.map((contractCode) => ({
              contractCodeId: contractCode.id,
              contractCode: contractCode.contract_code,
              group_id: dailyAdjustmentGroup.group.id,
              shipper_name: dailyAdjustmentGroup.group.name,
              shipper_id_name: dailyAdjustmentGroup.group.id_name,
            })),
        );
        const activeContractCodeList = (contractCodeListByNominationPoint.get(dailyAdjustmentNom.nomination_point.nomination_point) ?? []).filter((contractCodeByNominationPoint) =>
          adjustGroupContractCodes.some((item) => item.contractCodeId == contractCodeByNominationPoint.contractCodeId)
        );
        const newAdjustResultList = ensureMissingActiveContractsInAdjustResult({
          result,
          target,
          activeContractCodeList,
          adjustGroupContractCodes,
        });

        // คำนวณค่าใหม่ตามสัดส่วน
        const newMmscfh = activeContractCodeList.length > 0 ? divideTo6Decimal(adjustVolume, activeContractCodeList.length) : null;
        const newMmbtuh = activeContractCodeList.length > 0 ? divideTo6Decimal(adjustEnergy, activeContractCodeList.length) : null;

        if(newAdjustResultList.length > 0){
          newAdjustResultList.forEach(newItem => {
            const newItemIndex = result.findIndex(item => item.point == newItem.point &&
              item.zone_text == newItem.zone_text &&
              item.area_text == newItem.area_text &&
              item.entryExit == newItem.entryExit &&
              item.gas_day == newItem.gas_day &&
              item.group_id == newItem.group_id &&
              item.contract_code_id == newItem.contract_code_id
            )
            if(newItemIndex >= 0){
              newItem.timeShow.map((timeShow, newItemTimeShowIndex) => {
                const timeShowMinutes = timeToMinutes(timeShow.time);
                if (timeShowMinutes >= adjustTimeMinutes) {
                  result[newItemIndex].timeShow[newItemTimeShowIndex].value = parseToNumber6Decimal((newMmbtuh != null) ? parseToNumber6Decimal(newMmbtuh * 24) : result[newItemIndex].timeShow[newItemTimeShowIndex].value);
                  result[newItemIndex].timeShow[newItemTimeShowIndex].valueMmscfd = parseToNumber6Decimal((newMmscfh != null) ? parseToNumber6Decimal(newMmscfh * 24) : result[newItemIndex].timeShow[newItemTimeShowIndex].valueMmscfd);
                  result[newItemIndex].timeShow[newItemTimeShowIndex].valuePerHour = parseToNumber6Decimal(newMmbtuh ?? result[newItemIndex].timeShow[newItemTimeShowIndex].valuePerHour);
                  result[newItemIndex].timeShow[newItemTimeShowIndex].valueMmscfh = parseToNumber6Decimal(newMmscfh ?? result[newItemIndex].timeShow[newItemTimeShowIndex].valueMmscfh);
                  result[newItemIndex].timeShow[newItemTimeShowIndex].heatingValueFromAdjust = heatingValue;
                  result[newItemIndex].timeShow[newItemTimeShowIndex].volumeFromAdjust = adjustVolume;
                  result[newItemIndex].timeShow[newItemTimeShowIndex].energyFromAdjust = adjustEnergy;
                  result[newItemIndex].timeShow[newItemTimeShowIndex].isAdjust = true;
                }
              });

              if(!newItem.timeShow.some(timeShow => timeShow.time == adjustTime)){
                result[newItemIndex].timeShow.push({
                  time: adjustTime,
                  value: parseToNumber6Decimal((newMmbtuh != null) ? parseToNumber6Decimal(newMmbtuh * 24) : null),
                  valueMmscfd: parseToNumber6Decimal((newMmscfh != null) ? parseToNumber6Decimal(newMmscfh * 24) : null),
                  valuePerHour: parseToNumber6Decimal(newMmbtuh ?? null),
                  valueMmscfh: parseToNumber6Decimal(newMmscfh ?? null),
                  heatingValueFromAdjust: heatingValue,
                  volumeFromAdjust: adjustVolume,
                  energyFromAdjust: adjustEnergy,
                  isAdjust: true,
                });
                result[newItemIndex].timeShow.sort((a: any, b: any) => {
                  return timeToMinutes(a.time) - timeToMinutes(b.time);
                });
              }
            }
          })
        }

        adjustHistory.push({
          nomination_point: target.point,
          zone_text: target.zone_text,
          area_text: target.area_text,
          entry_exit_name: target.entryExit,
          gas_day: target.gas_day,
          group_id: target.group_id,
          timeMinutes: adjustTimeMinutes,
          time: adjustTime,
        });
      }

      // หา result items ที่ถูก adjust แล้ว (ต้องตรงกับ point, zone, area, entry/exit, gas_day และอยู่ใน group ที่กำหนด) เพื่อ reconcile ส่วนต่างจากการปัดเศษ/กระจายค่า
      const adjustedList = result.filter(target => 
        (target && target?.point) == dailyAdjustmentNom.nomination_point?.nomination_point &&
        isMatch((target && target?.zone_text), dailyAdjustmentNom.nomination_point?.zone?.name) &&
        isMatch((target && target?.area_text), dailyAdjustmentNom.nomination_point?.area?.name) &&
        isMatch((target && target?.entryExit), dailyAdjustmentNom.nomination_point?.entry_exit?.name) &&
        target?.gas_day === adjustGasDay &&
        adjust.daily_adjustment_group.map((item) => item.group.id).includes(target?.group_id) &&
        (target.timeShow && Array.isArray(target.timeShow) && target.timeShow.length > 0)
      )
      .sort((a, b) =>
          String(a.gas_day ?? '').localeCompare(String(b.gas_day ?? '')) ||
          String(a.contract ?? '').localeCompare(String(b.contract ?? '')) ||
          String(a.shipper_id_name ?? '').localeCompare(String(b.shipper_id_name ?? '')),
      )

      const reconcileFromHour: number = Math.ceil(adjustTimeMinutes / 60);
      for (let i = reconcileFromHour; i < 24; i++) {
        // let maxMember : adjustNomDataType | undefined = undefined;
        let maxMemberPerHour : adjustNomDataType | undefined = undefined;
        let maxMemberMmscfd : adjustNomDataType | undefined = undefined;
        let maxMemberMmscfh : adjustNomDataType | undefined = undefined;
        // let maxValue : number | undefined = undefined;
        let maxValuePerHour : number | undefined = undefined;
        let maxValueMmscfd : number | undefined = undefined;
        let maxValueMmscfh : number | undefined = undefined;
        
        const eachHourSumValue: timeShowDataType = {
          time: `${i.toString().padStart(2, '0')}:00`,
          value: 0,
          valueMmscfd: null,
          valuePerHour: null,
          valueMmscfh: null,
          heatingValueFromAdjust: null,
          volumeFromAdjust: null,
          energyFromAdjust: null,
          isAdjust: false,
        };
        adjustedList.map(target => {
          const eachHourValue = target.timeShow.find((timeShow) => timeToMinutes(timeShow.time) == i*60)
          if(eachHourValue){
            if(eachHourValue.energyFromAdjust || eachHourValue.energyFromAdjust == 0){
              eachHourSumValue.energyFromAdjust = eachHourValue.energyFromAdjust
            }
            if(eachHourValue.volumeFromAdjust || eachHourValue.volumeFromAdjust == 0){
              eachHourSumValue.volumeFromAdjust = eachHourValue.volumeFromAdjust
            }
            if(eachHourValue.heatingValueFromAdjust || eachHourValue.heatingValueFromAdjust == 0){
              eachHourSumValue.heatingValueFromAdjust = eachHourValue.heatingValueFromAdjust
            }
            if(eachHourValue.isAdjust == true){
              eachHourSumValue.isAdjust = true
            }
            if(eachHourValue.value || eachHourValue.value == 0){
              // const memberValue = parseToNumber3Decimal(eachHourValue.value)
              // if (!maxValue || memberValue > maxValue) {
              //   maxMember = target;
              //   maxValue = memberValue;
              // }
              if(eachHourSumValue.value){
                eachHourSumValue.value = parseToNumber3Decimal(eachHourSumValue.value + eachHourValue.value)
              }
              else{
                eachHourSumValue.value = parseToNumber3Decimal(eachHourValue.value)
              }
            }
            if(eachHourValue.valueMmscfd || eachHourValue.valueMmscfd == 0){
              const memberValue = parseToNumber6Decimal(eachHourValue.valueMmscfd)
              if (!maxValueMmscfd || memberValue > maxValueMmscfd) {
                maxMemberMmscfd = target;
                maxValueMmscfd = memberValue;
              }
              if(eachHourSumValue.valueMmscfd){
                eachHourSumValue.valueMmscfd = parseToNumber6Decimal(eachHourSumValue.valueMmscfd + eachHourValue.valueMmscfd)
              }
              else{
                eachHourSumValue.valueMmscfd = parseToNumber6Decimal(eachHourValue.valueMmscfd)
              }
            }
            if(eachHourValue.valuePerHour || eachHourValue.valuePerHour == 0){
              const memberValue = parseToNumber3Decimal(eachHourValue.valuePerHour)
              if (!maxValuePerHour || memberValue > maxValuePerHour) {
                maxMemberPerHour = target;
                maxValuePerHour = memberValue;
              }
              if(eachHourSumValue.valuePerHour){
                eachHourSumValue.valuePerHour = parseToNumber3Decimal(eachHourSumValue.valuePerHour + eachHourValue.valuePerHour)
              }
              else{
                eachHourSumValue.valuePerHour = parseToNumber3Decimal(eachHourValue.valuePerHour)
              }
            }
            if(eachHourValue.valueMmscfh || eachHourValue.valueMmscfh == 0){
              const memberValue = parseToNumber6Decimal(eachHourValue.valueMmscfh)
              if (!maxValueMmscfh || memberValue > maxValueMmscfh) {
                maxMemberMmscfh = target;
                maxValueMmscfh = memberValue;
              }
              if(eachHourSumValue.valueMmscfh){
                eachHourSumValue.valueMmscfh = parseToNumber6Decimal(eachHourSumValue.valueMmscfh + eachHourValue.valueMmscfh)
              }
              else{
                eachHourSumValue.valueMmscfh = parseToNumber6Decimal(eachHourValue.valueMmscfh)
              }
            }
          }
        })

        // if(eachHourSumValue.value != adjustEnergy24H && maxMember){
        //   const targetTimeShowIndex = maxMember.timeShow.findIndex((timeShow) => timeToMinutes(timeShow.time) == i*60)
        //   if(targetTimeShowIndex >= 0){
        //     const diff = parseToNumber3Decimal(adjustEnergy24H - eachHourSumValue.value)
        //     maxMember.timeShow[targetTimeShowIndex].value = parseToNumber3Decimal(parseToNumber3Decimal(maxMember.timeShow[targetTimeShowIndex].value) + diff)
        //   }
        // }

        if(eachHourSumValue.valueMmscfd != adjustVolume24H && maxMemberMmscfd){
          const targetTimeShowIndex = maxMemberMmscfd.timeShow.findIndex((timeShow) => timeToMinutes(timeShow.time) == i*60)
          if(targetTimeShowIndex >= 0){
            const diff = parseToNumber6Decimal(adjustVolume24H - eachHourSumValue.valueMmscfd)
            maxMemberMmscfd.timeShow[targetTimeShowIndex].valueMmscfd = parseToNumber6Decimal(parseToNumber6Decimal(maxMemberMmscfd.timeShow[targetTimeShowIndex].valueMmscfd) + diff)
          }
        }

        if(eachHourSumValue.valuePerHour != adjustEnergy && maxMemberPerHour){
          const targetTimeShowIndex = maxMemberPerHour.timeShow.findIndex((timeShow) => timeToMinutes(timeShow.time) == i*60)
          if(targetTimeShowIndex >= 0){
            const diff = parseToNumber3Decimal(adjustEnergy - eachHourSumValue.valuePerHour)
            maxMemberPerHour.timeShow[targetTimeShowIndex].valuePerHour = parseToNumber3Decimal(parseToNumber3Decimal(maxMemberPerHour.timeShow[targetTimeShowIndex].valuePerHour) + diff)
          }
        }

        if(eachHourSumValue.valueMmscfh != adjustVolume && maxMemberMmscfh){
          const targetTimeShowIndex = maxMemberMmscfh.timeShow.findIndex((timeShow) => timeToMinutes(timeShow.time) == i*60)
          if(targetTimeShowIndex >= 0){
            const diff = parseToNumber6Decimal(adjustVolume - eachHourSumValue.valueMmscfh)
            maxMemberMmscfh.timeShow[targetTimeShowIndex].valueMmscfh = parseToNumber6Decimal(parseToNumber6Decimal(maxMemberMmscfh.timeShow[targetTimeShowIndex].valueMmscfh) + diff)
          }
        }
      }
    }
  }

  const mustShowNominationPointList = await getNominationPointListFromActiveContractCode({
    prisma,
    todayStart,
    todayEnd,
  });

  const timeShow = [];
  for (let i = 0; i <= 23; i++) {
    const key = `${i.toString().padStart(2, '0')}:00`;

    timeShow.push({
      time: key,
      value: 0,
      valueMmscfd: 0,
      valuePerHour: 0,
      valueMmscfh: 0,
      heatingValueFromNomList: null,
      heatingValueFromAdjust: null,
      volumeFromAdjust: null,
    });
  }

  currentDate = endDayjs.clone();
  while (currentDate.isSameOrAfter(startDayjs)) {
    for (const nominationPoint of mustShowNominationPointList) {
      if(currentDate.isBefore(dayjs(nominationPoint.contract_start_date)) || currentDate.isSameOrAfter(dayjs(nominationPoint.contract_end_date))){
        continue;
      }
      let existPointIndex = result.findIndex((f: any) => {
        return (
          f?.point === nominationPoint.nomination_point &&
          f?.zone_text === nominationPoint.zone_text &&
          f?.area_text === nominationPoint.area_text &&
          isMatch(f?.entryExit, nominationPoint.entry_exit?.name) &&
          f?.gas_day === currentDate.tz('Asia/Bangkok').format('DD/MM/YYYY') &&
          f?.group_id === nominationPoint.group_id &&
          f?.contract_code_id === nominationPoint.contract_code_id
        );
      });

      if (existPointIndex < 0) {
        result.push({
          gas_day: currentDate.tz('Asia/Bangkok').format('DD/MM/YYYY'),
          group_id: nominationPoint.group_id,
          shipper_name: nominationPoint.group_name,
          shipper_id_name: nominationPoint.group_id_name,
          contract: nominationPoint.contract_code || nominationPoint.reserve_balancing_gas_contract,
          contract_code_id: nominationPoint.contract_code_id,
          reserve_balancing_gas_contract_id: nominationPoint.reserve_balancing_gas_contract_id,
          // "nomination_id": nominationFile.id,
          // "nomination_code": nominationFile.nomination_code,
          zone_text: nominationPoint.zone_text,
          area_text: nominationPoint.area_text,
          // "unit": unit,
          point: nominationPoint.nomination_point,
          entryExit: nominationPoint.entry_exit?.name,
          total: 0,
          totalType: 'daily',
          nomination_type_id: 1,
          timeShow: timeShow,
        });
      }
    }

    // ไปวันก่อนหน้า
    currentDate = currentDate.subtract(1, 'day');
  }

  return result;
}

function createDefaultAdjustNomTimeShow(): timeShowDataType[] {
  const timeShow: timeShowDataType[] = [];
  for (let i = 0; i <= 23; i++) {
    timeShow.push({
      time: `${i.toString().padStart(2, '0')}:00`,
      value: 0,
      valueMmscfd: 0,
      valuePerHour: 0,
      valueMmscfh: 0,
      heatingValueFromAdjust: null,
      volumeFromAdjust: null,
    });
  }
  return timeShow;
}

/**
 * เพิ่ม result สำหรับ contract ใน activeContractCodeList ที่ยังไม่มีแถวตรง point/zone/area/entry/gas_day/group
 */
function ensureMissingActiveContractsInAdjustResult({
  result,
  target,
  activeContractCodeList,
  adjustGroupContractCodes,
}: {
  result: adjustNomDataType[];
  target: adjustNomDataType;
  activeContractCodeList: {
    contractCodeId: number;
    contractCode: string;
    refContractCodeById?: number;
    refContractCodeBy?: string;
    isReserveBalancingGasContract?: boolean;
  }[];
  adjustGroupContractCodes: {
    contractCodeId: number;
    contractCode: string;
    group_id: number;
    shipper_name: string;
    shipper_id_name: string;
  }[];
}) {
  let returnList: adjustNomDataType[] = [];
  for (const activeContract of activeContractCodeList) {
    const groupInfo = adjustGroupContractCodes.find(
      (item) => item.contractCodeId === activeContract.contractCodeId,
    );
    if (!groupInfo) {
      continue;
    }

    const exists = result.some(
      (item) =>
        item.point === target.point &&
        isMatch(item.zone_text, target.zone_text) &&
        isMatch(item.area_text, target.area_text) &&
        isMatch(item.entryExit, target.entryExit) &&
        item.gas_day === target.gas_day &&
        (
          item.contract_code_id === activeContract.contractCodeId ||
          item.contract_code_id === activeContract.refContractCodeById
        ) &&
        item.group_id === groupInfo.group_id,
    );
    if (exists) {
      continue;
    }

    const newItem = {
      gas_day: target.gas_day,
      group_id: groupInfo.group_id,
      shipper_name: groupInfo.shipper_name,
      shipper_id_name: groupInfo.shipper_id_name,
      contract: activeContract.contractCode,
      contract_code_id: activeContract.isReserveBalancingGasContract ? undefined : activeContract.contractCodeId,
      reserve_balancing_gas_contract_id: undefined,
      zone_text: target.zone_text,
      area_text: target.area_text,
      point: target.point,
      entryExit: target.entryExit,
      total: 0,
      totalMmscfd: null,
      totalType: 'daily',
      nomination_type_id: 1,
      timeShow: createDefaultAdjustNomTimeShow(),
    }
    result.push(newItem);
    returnList.push(newItem);
  }
  return returnList;
}

/**
 * สำเนา result สำหรับคำนวณสัดส่วนในรอบ adjust (ไม่ให้โดน mutate ตาม result ระหว่าง loop)
 */
function cloneAdjustNomResultForRound(
  result: adjustNomDataType[],
): adjustNomDataType[] {
  return result.map((item) => ({
    ...item,
    timeShow: item.timeShow.map((timeShowItem) => ({ ...timeShowItem })),
  }));
}

/**
 * หา timeShow ที่ตรงกับ time (HH:mm) ถ้าไม่มีให้ใช้รายการล่าสุดที่อยู่ก่อน time
 */
function findTimeShowForAdjust(
  timeShow: timeShowDataType[],
  time: string,
): timeShowDataType[] {
  const exactMatches = timeShow.filter((ts) => isMatch(ts.time, time));
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const targetMinutes = timeToMinutes(time);
  const latestBefore = timeShow.reduce<timeShowDataType | null>((latest, current) => {
    const currentMinutes = timeToMinutes(current.time);
    if (currentMinutes >= targetMinutes) {
      return latest;
    }
    if (!latest) {
      return current;
    }
    return currentMinutes > timeToMinutes(latest.time) ? current : latest;
  }, null);

  return latestBefore ? [latestBefore] : [];
}

export function getSumViForAdjustAtTimeShow(
  {list, areaMaster, zone, area, entryExit, point, gasDay, time, dailyAdjustmentGroup, historyBvw10AndRa6List, dayOfWeek}:
  {
    list: adjustNomDataType[],
    areaMaster: areaWithRelationsForCal[]
    zone: string,
    area: string,
    entryExit: string,
    point: string,
    gasDay: string,
    time: string,
    dailyAdjustmentGroup?: number[],
    historyBvw10AndRa6List: (adjustNomDataType & {
      nominationRowJsonDataTemp: any;
    })[],
    dayOfWeek: number
  }
){
  let result: {
    sumVi: number | null;
    sumHvMultiplyVi: number | null;
    sumSgMultiplyVi: number | null;
    sumEnergy: number | null;
    sumHvMultiplyEnergy: number | null;
    sumSgMultiplyEnergy: number | null;
  } = {
    sumVi: null,
    sumHvMultiplyVi: null,
    sumSgMultiplyVi: null,
    sumEnergy: null,
    sumHvMultiplyEnergy: null,
    sumSgMultiplyEnergy: null,
  };
  // const h1Key = 14;
  // // adjust มันมี hv จาก adjust อยู่แล้ว ตอนทำงงหา hv ของ east-west ทำไมไม่รู้ แต่ทำไปแล้วก็เก็บไว้ก่อน
  // if(isMatch(zone, 'EAST-WEST')){
  //   try {
  //     const eastToBvw10Value = aggregateHistoryBvw10Ra6Vi(
  //       historyBvw10AndRa6List,
  //       matchBvw10Ra6Point('bvw10', 'east'),
  //       h1Key,
  //       dayOfWeek,
  //     );
  //     const westToBvw10Value = aggregateHistoryBvw10Ra6Vi(
  //       historyBvw10AndRa6List,
  //       matchBvw10Ra6Point('bvw10', 'west'),
  //       h1Key,
  //       dayOfWeek,
  //     );
  //     const eastToRa6Value = aggregateHistoryBvw10Ra6Vi(
  //       historyBvw10AndRa6List,
  //       matchBvw10Ra6Point('ra6', 'east'),
  //       h1Key,
  //       dayOfWeek,
  //     );
  //     const westToRa6Value = aggregateHistoryBvw10Ra6Vi(
  //       historyBvw10AndRa6List,
  //       matchBvw10Ra6Point('ra6', 'west'),
  //       h1Key,
  //       dayOfWeek,
  //     );

  //     const areaEastList = areaMaster.find((areaObj: any) => isMatch(areaObj.name, area) && isMatch(areaObj.zone.name, zone) && isMatch(areaObj.entry_exit.name, entryExit))?.owner_area?.map(ownerArea => ownerArea.east_area);
  //     const areaWestList = areaMaster.find((areaObj: any) => isMatch(areaObj.name, area) && isMatch(areaObj.zone.name, zone) && isMatch(areaObj.entry_exit.name, entryExit))?.owner_area?.map(ownerArea => ownerArea.west_area);
  //     // HV_F2 = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
  //     // HV_G = (East_to_BVW10*HV_X1)+(West_to_BVW10*HV_Y) / (East_to_BVW10+West_to_BVW10)
  //     // HV_E = (East_to_RA6*HV_X1)+(West_to_RA6*HV_F2) / (East_to_RA6+West_to_RA6)
  //     let eastData : {
  //       sumVi: number | null;
  //       sumHvMultiplyVi: number | null;
  //       sumSgMultiplyVi: number | null;
  //       sumEnergy: number | null;
  //       sumHvMultiplyEnergy: number | null;
  //       sumSgMultiplyEnergy: number | null;
  //     } | null = null;
  //     (areaEastList || []).map(areaEast => {
  //       const exist = getSumViForAdjustAtTimeShow({list, areaMaster, zone, area: areaEast.name, entryExit, point: '', gasDay, time, dailyAdjustmentGroup: undefined, historyBvw10AndRa6List, dayOfWeek})
  //       if(eastData){
  //         const vi = exist.sumVi
  //         const sumHvMultiplyVi = exist.sumHvMultiplyVi
  //         const sumSgMultiplyVi = exist.sumSgMultiplyVi
  //         if (eastData.sumVi != null) {
  //           if (vi != null) {
  //             eastData.sumVi = parseToNumber6Decimal(eastData.sumVi + vi);
  //           }
  //         } else {
  //           eastData.sumVi = exist.sumVi;
  //         }

  //         if (eastData.sumHvMultiplyVi != null) {
  //           if (sumHvMultiplyVi != null) {
  //             eastData.sumHvMultiplyVi = parseToNumber6Decimal(eastData.sumHvMultiplyVi + sumHvMultiplyVi);
  //           }
  //         } else {
  //           eastData.sumHvMultiplyVi = sumHvMultiplyVi;
  //         }

  //         if (eastData.sumSgMultiplyVi != null) {
  //           if (sumSgMultiplyVi != null) {
  //             eastData.sumSgMultiplyVi = parseToNumber6Decimal(eastData.sumSgMultiplyVi + sumSgMultiplyVi);
  //           }
  //         } else {
  //           eastData.sumSgMultiplyVi = sumSgMultiplyVi;
  //         }
  //       }
  //       else{
  //         eastData = exist
  //       }
  //     })

  //     switch(area.toLowerCase()){
  //       case 'e': {
  //         const westData = getSumViForAdjustAtTimeShow({list, areaMaster, zone, area: 'F2', entryExit, point: '', gasDay, time, dailyAdjustmentGroup: undefined, historyBvw10AndRa6List, dayOfWeek})

  //         const eastHv = (eastData?.sumHvMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumHvMultiplyVi / eastData?.sumVi);
  //         const westHv = (westData?.sumHvMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumHvMultiplyVi / westData?.sumVi);
  //         const eastSg = (eastData?.sumSgMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumSgMultiplyVi / eastData?.sumVi);
  //         const westSg = (westData?.sumSgMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumSgMultiplyVi / westData?.sumVi);
  //         const sumVi = (eastToRa6Value.sumVi == null && westToRa6Value.sumVi == null) ? null : parseToNumber6Decimal((eastToRa6Value.sumVi || 0) + (westToRa6Value.sumVi || 0));
  //         const sumHvMultiplyVi = (
  //           (eastHv == null && eastToRa6Value.sumVi == null) || 
  //           (westHv == null && westToRa6Value.sumVi == null)
  //         ) ? null
  //         : parseToNumber6Decimal(((eastToRa6Value.sumVi || 0) * (eastHv || 0)) + ((westToRa6Value.sumVi || 0) * (westHv || 0)));

  //         const sumSgMultiplyVi = (
  //           (eastSg == null && eastToRa6Value.sumVi == null) || 
  //           (westSg == null && westToRa6Value.sumVi == null)
  //         ) ? null
  //         : parseToNumber6Decimal(((eastToRa6Value.sumVi || 0) * (eastSg || 0)) + ((westToRa6Value.sumVi || 0) * (westSg || 0)));

  //         const hv = (sumHvMultiplyVi == null || sumVi == null) ? null : (sumHvMultiplyVi / sumVi);
  //         const sg = (sumSgMultiplyVi == null || sumVi == null) ? null : (sumSgMultiplyVi / sumVi);

  //         //พึึ่งได้ hv ยังไม่มี adjust อยู่

  //         break;
  //       }
  //       default:
  //         let westData : {
  //           sumVi: number | null;
  //           sumHvMultiplyVi: number | null;
  //           sumSgMultiplyVi: number | null;
  //           sumEnergy: number | null;
  //           sumHvMultiplyEnergy: number | null;
  //           sumSgMultiplyEnergy: number | null;
  //         } | null = null
  //         (areaWestList || []).map(areaWest => {
  //           const exist = getSumViForAdjustAtTimeShow({list, areaMaster, zone, area: areaWest.name, entryExit, point: '', gasDay, time, dailyAdjustmentGroup: undefined, historyBvw10AndRa6List, dayOfWeek})
  //           if(westData){
  //             const vi = exist.sumVi
  //             const sumHvMultiplyVi = exist.sumHvMultiplyVi
  //             const sumSgMultiplyVi = exist.sumSgMultiplyVi
  //             if (westData.sumVi != null) {
  //               if (vi != null) {
  //                 westData.sumVi = parseToNumber6Decimal(westData.sumVi + vi);
  //               }
  //             } else {
  //               westData.sumVi = exist.sumVi;
  //             }
              
  //             if (westData.sumHvMultiplyVi != null) {
  //               if (sumHvMultiplyVi != null) {
  //                 westData.sumHvMultiplyVi = parseToNumber6Decimal(westData.sumHvMultiplyVi + sumHvMultiplyVi);
  //               }
  //             } else {
  //               westData.sumHvMultiplyVi = sumHvMultiplyVi;
  //             }
              
  //             if (westData.sumSgMultiplyVi != null) {
  //               if (sumSgMultiplyVi != null) {
  //                 westData.sumSgMultiplyVi = parseToNumber6Decimal(westData.sumSgMultiplyVi + sumSgMultiplyVi);
  //               }
  //             } else {
  //               westData.sumSgMultiplyVi = sumSgMultiplyVi;
  //             }
  //           }
  //           else{
  //             westData = exist
  //           }
  //         })

  //         const eastHv = (eastData?.sumHvMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumHvMultiplyVi / eastData?.sumVi);
  //         const westHv = (westData?.sumHvMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumHvMultiplyVi / westData?.sumVi);
  //         const eastSg = (eastData?.sumSgMultiplyVi == null || eastData?.sumVi == null) ? null : (eastData?.sumSgMultiplyVi / eastData?.sumVi);
  //         const westSg = (westData?.sumSgMultiplyVi == null || westData?.sumVi == null) ? null : (westData?.sumSgMultiplyVi / westData?.sumVi);
  //         const sumVi = (eastToBvw10Value.sumVi == null && westToBvw10Value.sumVi == null) ? null : parseToNumber6Decimal((eastToBvw10Value.sumVi || 0) + (westToBvw10Value.sumVi || 0));
  //         const sumHvMultiplyVi = (
  //           (eastHv == null && eastToBvw10Value.sumVi == null) || 
  //           (westHv == null && westToBvw10Value.sumVi == null)
  //         ) ? null
  //         : parseToNumber6Decimal(((eastToBvw10Value.sumVi || 0) * (eastHv || 0)) + ((westToBvw10Value.sumVi || 0) * (westHv || 0)));

  //         const sumSgMultiplyVi = (
  //           (eastSg == null && eastToBvw10Value.sumVi == null) || 
  //           (westSg == null && westToBvw10Value.sumVi == null)
  //         ) ? null
  //         : parseToNumber6Decimal(((eastToBvw10Value.sumVi || 0) * (eastSg || 0)) + ((westToBvw10Value.sumVi || 0) * (westSg || 0)));

  //         const key = `${`${zone}`.trim().toLowerCase()}-${`${area}`.trim().toLowerCase()}`;
  //         result.set(key, {
  //           zone_text: zone,
  //           area_text: area,
  //           entryExit: entryExit,
  //           sumVi: sumVi,
  //           sumHvMultiplyVi: sumHvMultiplyVi,
  //           sumSgMultiplyVi: sumSgMultiplyVi,
  //           eachHour: eachHour,
  //         });
  //         break;
  //     }
  //   } catch (error) {
  //     console.log('find hv for east-west area error', error);
  //   }
  // }
  
  // let targetArea: string = area
  // if(isMatch(entryExit, 'Exit')){
  //   const referenceArea = areaMaster.find((areaObj: any) => isMatch(areaObj.name, area) && isMatch(areaObj.zone.name, zone) && isMatch(areaObj.entry_exit.name, entryExit))?.supply_reference_quality_area_by;
  //   targetArea = referenceArea?.name || area;
  // }

  list.filter(item => isMatch(item.zone_text, zone) &&
    isMatch(item.area_text, area) &&
    isMatch(item.entryExit, entryExit) &&
    (!point || isMatch(item.point, point)) &&
    isMatch(item.gas_day, gasDay) &&
    (!dailyAdjustmentGroup || dailyAdjustmentGroup.includes(item.group_id)) &&
    (item.timeShow && Array.isArray(item.timeShow) && item.timeShow.length > 0) 
  ).map(item => {
    const hv = item.hv;
    const sg = item.sg;
    findTimeShowForAdjust(item.timeShow, time).map(timeShow => {
      let vi : number | null | undefined = timeShow.valueMmscfh;
      if(!vi && vi != 0 && timeShow.valueMmscfd){
        vi = timeShow.valueMmscfd / 24;
      }

      let energy : number | null | undefined = timeShow.valuePerHour;
      if(!energy && energy != 0 && timeShow.value){
        energy = timeShow.value / 24;
      }


      if (result.sumVi != null) {
        if (vi != null) {
          result.sumVi = parseToNumber6Decimal(result.sumVi + vi);
        }
      } else {
        result.sumVi = vi;
      }

      if (result.sumHvMultiplyVi != null) {
        if (hv != null || vi != null) {
          result.sumHvMultiplyVi = parseToNumber6Decimal(result.sumHvMultiplyVi + parseToNumber6Decimal((hv ?? 0) * (vi ?? 0)));
        }
      } else {
        result.sumHvMultiplyVi = (hv == null && vi == null) ? null : parseToNumber6Decimal((hv ?? 0) * (vi ?? 0));
      }

      if (result.sumSgMultiplyVi != null) {
        if (sg != null || vi != null) {
          result.sumSgMultiplyVi = parseToNumber6Decimal(result.sumSgMultiplyVi + parseToNumber6Decimal((sg ?? 0) * (vi ?? 0)));
        }
      } else {
        result.sumSgMultiplyVi = (sg == null && vi == null) ? null : parseToNumber6Decimal((sg ?? 0) * (vi ?? 0));
      }


      if (result.sumHvMultiplyEnergy != null) {
        if (energy != null) {
          result.sumEnergy = parseToNumber6Decimal(result.sumEnergy + energy);
        }
      } else {
        result.sumEnergy = energy;
      }

      if (result.sumHvMultiplyEnergy != null) {
        if (hv != null || energy != null) {
          result.sumHvMultiplyEnergy = parseToNumber6Decimal(result.sumHvMultiplyEnergy + parseToNumber6Decimal((hv ?? 0) * (energy ?? 0)));
        }
      } else {
        result.sumHvMultiplyEnergy = (hv == null && energy == null) ? null : parseToNumber6Decimal((hv ?? 0) * (energy ?? 0));
      }

      if (result.sumSgMultiplyEnergy != null) {
        if (sg != null || energy != null) {
          result.sumSgMultiplyEnergy = parseToNumber6Decimal(result.sumSgMultiplyEnergy + parseToNumber6Decimal((sg ?? 0) * (energy ?? 0)));
        }
      } else {
        result.sumSgMultiplyEnergy = (sg == null && energy == null) ? null : parseToNumber6Decimal((sg ?? 0) * (energy ?? 0));
      }
    })
  })
  
  return result;
}

/**
 * รวมค่าใน timeShow เป็น “ผลรวมรายวัน” โดยแบ่งช่วงเวลาตามจุดเปลี่ยนค่าในแต่ละชั่วโมง
 * แต่ละรายการถือว่าค่าใน field เป็นค่าเฉลี่ยต่อนาทีในช่วงที่ใช้งาน (คูณ activeMinutes/60)
 * แล้วเพิ่ม/อัปเดตแถว time = 'Total' ด้วยผลรวม value, valuePerHour, valueMmscfd, valueMmscfh
 * @param timeShow - รายการช่วงเวลาและค่าที่ต้องการรวม (จะถูก sort ตามเวลา และ mutate array เดิม)
 * @returns timeShow เดิมหลังเพิ่มหรืออัปเดตแถว Total
 */
export function sumValueByTimeShow(timeShow: timeShowDataType[]) {
  // เรียงตามเวลาเพื่อให้การคำนวณช่วง activeMinutes ถูกต้อง
  timeShow.sort((a, b) => {
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  // จัดกลุ่มตามชั่วโมง (ส่วน HH ของ "HH:mm") เพื่อคำนวณทีละชั่วโมง
  const groupByHour = timeShow.reduce(
    (acc: Record<string, timeShowDataType[]>, timeShowItem: timeShowDataType) => {
      const hour = timeShowItem.time.split(':')[0];
      if (!acc[hour]) {
        acc[hour] = [];
      }
      acc[hour].push(timeShowItem);
      return acc;
    },
    {} as Record<string, timeShowDataType[]>,
  );

  let sumValue: number | null = null;
  let sumValuePerHour: number | null = null;
  let sumValueMmscfd: number | null = null;
  let sumValueMmscfh: number | null = null;
  for (const [hour, timeShowItems] of Object.entries(groupByHour)) {
    const orderByMinutes = timeShowItems.filter(item => item.time != 'Total').sort((a, b) => {
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });
    orderByMinutes.map((timeShowItem: timeShowDataType, index: number) => {
      const [hours, minutes] = timeShowItem.time.split(':').map(Number);

      // จำนวนนาทีที่ค่านี้มีผล: จนถึงจุดถัดไปในชั่วโมงเดียวกัน หรือจนสิ้นชั่วโมง (นาที 59→60)
      let activeMinutes = 60;
      if (index < orderByMinutes.length - 1) {
        const nextTimeShow = orderByMinutes[index + 1];
        const [nextHours, nextMinutes] = nextTimeShow.time.split(':').map(Number);
        activeMinutes = nextMinutes - minutes;
      } else {
        activeMinutes = 60 - minutes;
      }
      // สมมติค่าในแต่ละ field กระจายเท่ากันตลอดชั่วโมง → น้ำหนัก = (ค่า/60) * activeMinutes
      if (timeShowItem.value || timeShowItem.value == 0) {
        const value = parseToNumber3Decimal(timeShowItem.value)
        const activeValue = parseToNumber3Decimal(divideTo8Decimal(value, 60) * activeMinutes);
        const reverseValue= parseToNumber3Decimal(divideTo8Decimal(activeValue, activeMinutes) * 60);
        if (sumValue) {
          sumValue = parseToNumber6Decimal(sumValue + activeValue);
        } else {
          sumValue = parseToNumber6Decimal(activeValue);
        }
        // ตอนเทสเขาใช้ค่าที่เฉลี่ยแล้วปัดของแต่ละ contract มารวมกัน แต่ code เป็นรวมแต่ละ contract ก่อนจะเฉลี่ยเลยต้องเพิ่ม if นี้เข้ามา
        if(orderByMinutes.length > 1 && reverseValue != value){
          timeShowItem.value = reverseValue;
        }
      }
      if (timeShowItem.valuePerHour || timeShowItem.valuePerHour == 0) {
        const value = parseToNumber3Decimal(timeShowItem.valuePerHour)
        const activeValue = parseToNumber3Decimal(divideTo8Decimal(value, 60) * activeMinutes);
        const reverseValue = parseToNumber3Decimal(divideTo8Decimal(activeValue, activeMinutes) * 60);
        if (sumValuePerHour) {
          sumValuePerHour = parseToNumber6Decimal(sumValuePerHour + activeValue);
        } else {
          sumValuePerHour = parseToNumber6Decimal(activeValue);
        }
        // ตอนเทสเขาใช้ค่าที่เฉลี่ยแล้วปัดของแต่ละ contract มารวมกัน แต่ code เป็นรวมแต่ละ contract ก่อนจะเฉลี่ยเลยต้องเพิ่ม if นี้เข้ามา
        if(orderByMinutes.length > 1 && reverseValue != value){
          timeShowItem.valuePerHour = reverseValue;
        }
      }
      if (timeShowItem.valueMmscfd || timeShowItem.valueMmscfd == 0) {
        const value = parseToNumber6Decimal(timeShowItem.valueMmscfd)
        const activeValue = parseToNumber6Decimal(divideTo8Decimal(value, 60) * activeMinutes);
        const reverseValue = parseToNumber6Decimal(divideTo8Decimal(activeValue, activeMinutes) * 60);
        if (sumValueMmscfd) {
          sumValueMmscfd = parseToNumber6Decimal(sumValueMmscfd + activeValue);
        } else {
          sumValueMmscfd = parseToNumber6Decimal(activeValue);
        }
        if(orderByMinutes.length > 1 && reverseValue != value){
          timeShowItem.valueMmscfd = reverseValue;
        }
      }
      if (timeShowItem.valueMmscfh || timeShowItem.valueMmscfh == 0) {
        const value = parseToNumber6Decimal(timeShowItem.valueMmscfh)
        const activeValue = parseToNumber6Decimal(divideTo8Decimal(value, 60) * activeMinutes);
        const reverseValue = parseToNumber6Decimal(divideTo8Decimal(activeValue, activeMinutes) * 60);
        if (sumValueMmscfh) {
          sumValueMmscfh = parseToNumber6Decimal(sumValueMmscfh + activeValue);
        } else {
          sumValueMmscfh = parseToNumber6Decimal(activeValue);
        }
        if(orderByMinutes.length > 1 && reverseValue != value){
          timeShowItem.valueMmscfh = reverseValue;
        }
      }
    });
  }
  // เพิ่มหรืออัปเดตแถวสรุปผลรวม
  const totalTimeShowIndex = timeShow.findIndex((f: any) => f.time == 'Total');
  if (totalTimeShowIndex < 0) {
    timeShow.push({
      time: 'Total',
      value: sumValue,
      valueMmscfd: sumValueMmscfd,
      valuePerHour: sumValuePerHour,
      valueMmscfh: sumValueMmscfh,
      heatingValueFromNomList: null,
      heatingValueFromAdjust: null,
      volumeFromAdjust: null,
    });
  } else {
    timeShow[totalTimeShowIndex].value = sumValue;
    timeShow[totalTimeShowIndex].valuePerHour = sumValuePerHour;
    timeShow[totalTimeShowIndex].valueMmscfd = sumValueMmscfd;
    timeShow[totalTimeShowIndex].valueMmscfh = sumValueMmscfh;
  }

  return timeShow;
}

export function sumValueMmscfAfterGrouped(groupedList: groupedAdjustNomDataType[]){
  groupedList.map((groupedItem: groupedAdjustNomDataType) => {
    // เรียงตามเวลาเพื่อให้การคำนวณช่วง activeMinutes ถูกต้อง
    const timeShow = groupedItem.timeShow
      .filter(timeShowItem => timeShowItem.time != 'Total')
      .sort((a, b) => {
        return timeToMinutes(a.time) - timeToMinutes(b.time);
      });

    const totalTimeShowIndex = groupedItem.timeShow.findIndex((timeShowItem: timeShowDataType) => timeShowItem.time == 'Total')

    // จัดกลุ่มตามชั่วโมง (ส่วน HH ของ "HH:mm") เพื่อคำนวณทีละชั่วโมง
    const groupByHour = timeShow.reduce(
      (acc: Record<string, timeShowDataType[]>, timeShowItem: timeShowDataType) => {
        const hour = timeShowItem.time.split(':')[0];
        if (!acc[hour]) {
          acc[hour] = [];
        }
        acc[hour].push(timeShowItem);
        return acc;
      },
      {} as Record<string, timeShowDataType[]>,
    );

    let sumValueMmscfd: number | null = null;
    let sumValueMmscfh: number | null = null;
    for (const [hour, timeShowItems] of Object.entries(groupByHour)) {
      const orderByMinutes = timeShowItems.filter(item => item.time != 'Total').sort((a, b) => {
        return timeToMinutes(a.time) - timeToMinutes(b.time);
      });
      orderByMinutes.map((timeShowItem: timeShowDataType, index: number) => {
        const [hours, minutes] = timeShowItem.time.split(':').map(Number);
  
        // จำนวนนาทีที่ค่านี้มีผล: จนถึงจุดถัดไปในชั่วโมงเดียวกัน หรือจนสิ้นชั่วโมง (นาที 59→60)
        let activeMinutes = 60;
        if (index < orderByMinutes.length - 1) {
          const nextTimeShow = orderByMinutes[index + 1];
          const [nextHours, nextMinutes] = nextTimeShow.time.split(':').map(Number);
          activeMinutes = nextMinutes - minutes;
        } else {
          activeMinutes = 60 - minutes;
        }
        // สมมติค่าในแต่ละ field กระจายเท่ากันตลอดชั่วโมง → น้ำหนัก = (ค่า/60) * activeMinutes
        if (timeShowItem.valueMmscfd || timeShowItem.valueMmscfd == 0) {
          const value = parseToNumber6Decimal(timeShowItem.valueMmscfd)
          const activeValue = parseToNumber6Decimal(divideTo8Decimal(value, 60) * activeMinutes);
          const activeValuePerHour = divideTo6Decimal(activeValue, 24);
          if (sumValueMmscfd) {
            sumValueMmscfd = parseToNumber6Decimal(sumValueMmscfd + activeValue);
          } else {
            sumValueMmscfd = parseToNumber6Decimal(activeValue);
          }

          if (sumValueMmscfh) {
            sumValueMmscfh = parseToNumber6Decimal(sumValueMmscfh + activeValuePerHour);
          } else {
            sumValueMmscfh = parseToNumber6Decimal(activeValuePerHour);
          }
        }
        // if (timeShowItem.valueMmscfh || timeShowItem.valueMmscfh == 0) {
        //   const value = parseToNumber6Decimal(timeShowItem.valueMmscfh)
        //   const activeValue = parseToNumber6Decimal(divideTo8Decimal(value, 60) * activeMinutes);
        //   if (sumValueMmscfh) {
        //     sumValueMmscfh = parseToNumber6Decimal(sumValueMmscfh + activeValue);
        //   } else {
        //     sumValueMmscfh = parseToNumber6Decimal(activeValue);
        //   }
        // }
      });
    }

    if(totalTimeShowIndex >= 0){
      groupedItem.timeShow[totalTimeShowIndex].valueMmscfd = sumValueMmscfd;
      groupedItem.timeShow[totalTimeShowIndex].valueMmscfh = sumValueMmscfh;
    }
  })

  return groupedList;
}