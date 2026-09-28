import {isMatch} from './allocation.util'
import * as dayjs from 'dayjs'
import { getTodayEndAdd7, getTodayStartAdd7 } from './date.util'
import { meteringPointWithRelations, nominationPointPopulateForShareMeter, nominationPointWithRelationsForShareMeter } from '@type/prisma.type'
import { PrismaService } from '@prisma/prisma.service'

/**
 * Status codes for rejected or cancelled nominations.
 */
export const REJECTED_OR_CANCELLED_STATUS =
  [3, 5]

export interface ActiveNominationFileParams {
  targetDate: Date
  targetWeekStart: Date
  targetWeekEnd: Date
  prisma: any
}

/**
 * Fetches active nomination files for a given date or week, including only the latest nomination_version where flag_use is not false.
 * @param params - The date and week range to filter nominations.
 * @returns A list of active nomination files with their latest valid version.
 */
export async function getActiveNominationFiles({
  targetDate,
  targetWeekStart,
  targetWeekEnd,
  prisma
}: ActiveNominationFileParams) {
  return prisma.query_shipper_nomination_file.findMany(
    {
      where: {
        AND: [
          {
            query_shipper_nomination_status:
              {
                id: {
                  notIn:
                    REJECTED_OR_CANCELLED_STATUS
                }
              }
          },
          {
            OR: [
              {
                nomination_type:
                  {id: 1},
                gas_day:
                  targetDate
              },
              {
                nomination_type:
                  {id: 2},
                gas_day: {
                  gte: targetWeekStart,
                  lte: targetWeekEnd
                }
              }
            ]
          }
        ]
      },
      include: {
        nomination_type: true,
        contract_code: {
          select: {
            contract_code: true
          }
        },
        query_shipper_nomination_status:
          {
            select: {
              name: true
            }
          },
        nomination_version: {
          where: {
            flag_use: {
              not: false
            }
          },
          orderBy: {
            create_date:
              'desc'
          },
          take: 1,
          include: {
            nomination_full_json:
              {
                where: {
                  flag_use: {
                    not: false
                  }
                },
                orderBy: {
                  create_date:
                    'desc'
                },
                take: 1
              }
          }
        }
      }
    }
  )
}

/**
 * DRY utility to apply nomination values to missing metering points for both daily and weekly nominations.
 */
export function applyNominationValues({
  nominationFiles,
  missingGasPoints,
  data,
  gasDay,
  isWeekly = false,
  uniqueReplacedGasPoints = [],
  headData = null,
  gasDayKey = null
}) {
  const replacedGasPoints: any[] =
    []
  for (const file of nominationFiles) {
    const version =
      file
        .nomination_version?.[0]
    const fullJson =
      version
        ?.nomination_full_json?.[0]
        ?.data_temp
    if (!fullJson) continue
    const nominationFullJson =
      JSON.parse(fullJson)
    const valueData =
      nominationFullJson.valueData
    if (
      !Array.isArray(
        valueData
      ) ||
      valueData.length === 0
    )
      continue
    for (const value of valueData) {
      const zone = value['0']
      const area = value['2']
      const point = value['3']
      const unit = value['9']
      const entryExit =
        value['10']
      // For weekly, check headData and gasDayKey
      let total = null
      if (
        isWeekly &&
        headData &&
        gasDayKey
      ) {
        const gasDayValue =
          value[gasDayKey]
        if (gasDayValue) {
          total = Number(
            String(
              gasDayValue
            )
              .trim()
              .replace(
                /,/g,
                ''
              )
          )
        }
      } else {
        total = Number(
          String(value['38'])
            .trim()
            .replace(/,/g, '')
        )
      }
      // Find matching missing points
      const meterPointInNominationPoint =
        missingGasPoints.filter(
          (missingGasPoint) =>
            missingGasPoint
              .nomination_point
              ?.nomination_point ==
              point &&
            isMatch(
              missingGasPoint
                .nomination_point
                ?.zone?.name,
              zone
            ) &&
            isMatch(
              missingGasPoint
                .nomination_point
                ?.area?.name,
              area
            ) &&
            isMatch(
              missingGasPoint
                .nomination_point
                ?.entry_exit
                ?.name,
              entryExit
            ) &&
            (!isWeekly ||
              !uniqueReplacedGasPoints.some(
                (r) =>
                  r.id ==
                  missingGasPoint.id
              ))
        )
      if (
        meterPointInNominationPoint.length >
        0
      ) {
        const newMeterValue =
          Number.isNaN(total)
            ? null
            : total /
              meterPointInNominationPoint.length
        // --- DRY update logic ---
        const wobbeIndex =
          value['11']
        const heatingValue =
          value['12']
        const sg = value['13']
        const newData = {
          meterPointId: point,
          gasDay: gasDay,
          value: {
            meteringPointId:
              point,
            datasource:
              'Nomination',
            energy: unit
              ?.toUpperCase()
              .includes(
                'MMBTU'
              )
              ? newMeterValue
              : null,
            gasDay: gasDay,
            registerTimestamp:
              '',
            volume: unit
              ?.toUpperCase()
              .includes(
                'MMSCFD'
              )
              ? newMeterValue
              : null,
            heatingValue:
              heatingValue,
            wobbeIndex:
              wobbeIndex,
            sg: sg,
            data_temp: {},
            measurements: {},
            in_time: null,
            insert_timestamp:
              null,
            metering_retrieving_id:
              null,
            rw: true
          }
        }
        const indexToUpdate =
          data.findIndex(
            (meterData) =>
              meterData.meterPointId ==
                point &&
              meterData.gasDay ==
                gasDay
          )
        if (
          indexToUpdate > -1
        ) {
          if (
            data[
              indexToUpdate
            ].value &&
            newMeterValue
          ) {
            if (
              unit
                ?.toUpperCase()
                .includes(
                  'MMBTU'
                )
            ) {
              if (
                data[
                  indexToUpdate
                ].value.energy
              ) {
                const energy =
                  Number(
                    data[
                      indexToUpdate
                    ].value
                      .energy
                  )
                if (
                  !Number.isNaN(
                    energy
                  )
                ) {
                  data[
                    indexToUpdate
                  ].value.energy =
                    energy +
                    newMeterValue
                }
              } else {
                data[
                  indexToUpdate
                ].value.energy =
                  newMeterValue
              }
            }
            if (
              unit
                ?.toUpperCase()
                .includes(
                  'MMSCFD'
                )
            ) {
              if (
                data[
                  indexToUpdate
                ].value.volume
              ) {
                const volume =
                  Number(
                    data[
                      indexToUpdate
                    ].value
                      .volume
                  )
                if (
                  !Number.isNaN(
                    volume
                  )
                ) {
                  data[
                    indexToUpdate
                  ].value.volume =
                    volume +
                    newMeterValue
                }
              } else {
                data[
                  indexToUpdate
                ].value.volume =
                  newMeterValue
              }
            }
          } else {
            data[
              indexToUpdate
            ].value =
              newData.value
          }
        } else {
          data.push(newData)
        }
        replacedGasPoints.push(
          ...meterPointInNominationPoint
        )
      }
    }
  }
  // Return unique replaced points
  return Array.from(
    new Map(
      replacedGasPoints.map(
        (item) => [
          item.id,
          item
        ]
      )
    ).values()
  )
}
export function applyNominationValuesToValueOnlyObject({
  nominationFiles,
  missingGasPoints,
  data,
  gasDay,
  isWeekly = false,
  uniqueReplacedGasPoints = [],
  headData = null,
  gasDayKey = null
}) {
  const replacedGasPoints: any[] =
    []
  for (const file of nominationFiles) {
    const version =
      file
        .nomination_version?.[0]
    const fullJson =
      version
        ?.nomination_full_json?.[0]
        ?.data_temp
    if (!fullJson) continue
    const nominationFullJson =
      JSON.parse(fullJson)
    const valueData =
      nominationFullJson.valueData
    if (
      !Array.isArray(
        valueData
      ) ||
      valueData.length === 0
    )
      continue
    for (const value of valueData) {
      const zone = value['0']
      const area = value['2']
      const point = value['3']
      const unit = value['9']
      const entryExit =
        value['10']
      // For weekly, check headData and gasDayKey
      let total = null
      if (
        isWeekly &&
        headData &&
        gasDayKey
      ) {
        const gasDayValue =
          value[gasDayKey]
        if (gasDayValue) {
          total = Number(
            String(
              gasDayValue
            )
              .trim()
              .replace(
                /,/g,
                ''
              )
          )
        }
      } else {
        total = Number(
          String(value['38'])
            .trim()
            .replace(/,/g, '')
        )
      }
      // Find matching missing points
      const meterPointInNominationPoint =
        missingGasPoints.filter(
          (missingGasPoint) =>
            missingGasPoint
              .nomination_point
              ?.nomination_point ==
              point &&
            isMatch(
              missingGasPoint
                .nomination_point
                ?.zone?.name,
              zone
            ) &&
            isMatch(
              missingGasPoint
                .nomination_point
                ?.area?.name,
              area
            ) &&
            isMatch(
              missingGasPoint
                .nomination_point
                ?.entry_exit
                ?.name,
              entryExit
            ) &&
            (!isWeekly ||
              !uniqueReplacedGasPoints.some(
                (r) =>
                  r.id ==
                  missingGasPoint.id
              ))
        )
      if (
        meterPointInNominationPoint.length >
        0
      ) {
        const newMeterValue =
          Number.isNaN(total)
            ? null
            : total /
              meterPointInNominationPoint.length
        // --- DRY update logic ---
        const wobbeIndex =
          value['11']
        const heatingValue =
          value['12']
        const sg = value['13']
        const newData = {
          meteringPointId:
            point,
          datasource:
            'Nomination',
          energy: unit
            ?.toUpperCase()
            .includes('MMBTU')
            ? newMeterValue
            : null,
          gasDay: gasDay,
          registerTimestamp:
            '',
          volume: unit
            ?.toUpperCase()
            .includes(
              'MMSCFD'
            )
            ? newMeterValue
            : null,
          heatingValue:
            heatingValue,
          wobbeIndex:
            wobbeIndex,
          sg: sg,
          data_temp: {},
          measurements: {},
          in_time: null,
          insert_timestamp:
            null,
          metering_retrieving_id:
            null,
          rw: true
        }
        const indexToUpdate =
          data.findIndex(
            (
              meterData: any
            ) =>
              meterData.meteringPointId ==
                point &&
              meterData.gasDay ==
                gasDay
          )
        if (
          indexToUpdate > -1
        ) {
          if (
            data[
              indexToUpdate
            ] &&
            newMeterValue
          ) {
            if (
              unit
                ?.toUpperCase()
                .includes(
                  'MMBTU'
                )
            ) {
              if (
                data[
                  indexToUpdate
                ].energy
              ) {
                const energy =
                  Number(
                    data[
                      indexToUpdate
                    ].energy
                  )
                if (
                  !Number.isNaN(
                    energy
                  )
                ) {
                  data[
                    indexToUpdate
                  ].energy =
                    energy +
                    newMeterValue
                }
              } else {
                data[
                  indexToUpdate
                ].energy =
                  newMeterValue
              }
            }
            if (
              unit
                ?.toUpperCase()
                .includes(
                  'MMSCFD'
                )
            ) {
              if (
                data[
                  indexToUpdate
                ].volume
              ) {
                const volume =
                  Number(
                    data[
                      indexToUpdate
                    ].volume
                  )
                if (
                  !Number.isNaN(
                    volume
                  )
                ) {
                  data[
                    indexToUpdate
                  ].volume =
                    volume +
                    newMeterValue
                }
              } else {
                data[
                  indexToUpdate
                ].volume =
                  newMeterValue
              }
            }
          } else {
            data[
              indexToUpdate
            ] = newData
          }
        } else {
          data.push(newData)
        }
        replacedGasPoints.push(
          ...meterPointInNominationPoint
        )
      }
    }
  }
  // Return unique replaced points
  return Array.from(
    new Map(
      replacedGasPoints.map(
        (item) => [
          item.id,
          item
        ]
      )
    ).values()
  )
}

export function isHasGasData(
  value: any
) {
  return (
    value?.registerTimestamp !==
      null &&
    value?.registerTimestamp !==
      undefined &&
    value?.registerTimestamp !==
      '' &&
    value?.volume !== null &&
    value?.volume !==
      undefined &&
    value?.volume !== '' &&
    value?.heatingValue !==
      null &&
    value?.heatingValue !==
      undefined &&
    value?.heatingValue !==
      '' &&
    value?.wobbeIndex !==
      null &&
    value?.wobbeIndex !==
      undefined &&
    value?.wobbeIndex !==
      '' &&
    value?.energy !== null &&
    value?.energy !==
      undefined &&
    value?.energy !== ''
  )
}

/**
 * Find active metering points that don't have volume, heatingValue, wobbeIndex and energy data for a specific gas day
 */
export function findMissingGasData(
  activeMeteringPoints: any[],
  data: any[],
  gasDay: string
): any[] {
  return activeMeteringPoints.filter(
    (activePoint) => {
      const pointName =
        activePoint.metered_point_name

      // Find data entries for this metering point on this gas day
      const pointDataForDay =
        data.filter(
          (item) =>
            item.meterPointId ===
              pointName &&
            item.gasDay === gasDay
        )

      // Check if any entry has actual volume, heatingValue, wobbeIndex and energy data (not empty string)
      const hasGasData =
        pointDataForDay.some(
          (item) => {
            if (
              item.value &&
              typeof item.value ===
                'object'
            ) {
              return isHasGasData(
                item.value
              )
            }
            return false
          }
        )

      return !hasGasData
    }
  )
}

export function findMissingGasDataFromValueOnly(
  activeMeteringPoints: any[],
  data: any[],
  gasDay: string
): any[] {
  return activeMeteringPoints.filter(
    (activePoint) => {
      const pointName =
        activePoint.metered_point_name

      // Find data entries for this metering point on this gas day
      const pointDataForDay =
        data.filter(
          (item) =>
            item.meteringPointId ===
              pointName &&
            item.gasDay === gasDay
        )

      // Check if any entry has actual volume, heatingValue, wobbeIndex and energy data (not empty string)
      const hasGasData =
        pointDataForDay.some(
          (item) => {
            if (
              item &&
              typeof item ===
                'object'
            ) {
              return isHasGasData(
                item
              )
            }
            return false
          }
        )

      return !hasGasData
    }
  )
}

export async function shareShipper( 
  payload: meteringPointWithRelations[],
  prisma: PrismaService,
  start: dayjs.Dayjs | null, 
  end: dayjs.Dayjs | null
) : Promise<meteringPointWithRelations[]> {
  // const shareData = payload?.filter((f:any) => {
  //   return f?.nomination_point?.contract_point?.shipper_contract_point.length > 1
  // })
  // HKP1
  // HKP2
  // console.log('[H] payload : ', payload?.filter((f:any) => f?.area?.name === "H")?.filter((f:any) => (f?.metered_point_name === "HKP1" || f?.metered_point_name === "HKP2")));
  const todayStart = start && (start?.isValid() ? start.toDate() : getTodayStartAdd7().toDate()) || getTodayStartAdd7().toDate()
  const todayEnd = end && end?.isValid() ? end.toDate() : (start && (start.isValid() ? start.toDate() : getTodayEndAdd7().toDate()) || getTodayEndAdd7().toDate()) 
  const nomMaster = await prisma.nomination_point.findMany({
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
                  end_date:
                    {
                      gt: todayStart
                    }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        },
    ...nominationPointPopulateForShareMeter,
  })
  console.log('nomMaster : ', nomMaster);

  // https://app.clickup.com/t/9018502823/86eub6dcw
  console.log('payload : ', payload);
  const contractCode = await prisma.contract_code.findMany({
    where: {
      AND: [
        {
          contract_start_date: {
            lte: todayEnd
          }
        },
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
        {
          OR: [
            {
              terminate_date: null
            },
            {
              terminate_date: {
                gt: todayStart
              }
            } // Terminate date is after target date
          ]
        },
        {
          OR: [
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
    select:{
      id: true,
      contract_code: true,
      group:{
        select:{
          name: true,
        },
      },
      contract_start_date: true,
      contract_end_date: true,
      booking_version:{
        include:{
          booking_row_json:{
            select:{
              contract_point:true,
            }
          },
        },
        where:{
          flag_use: true
        }
      }
    }
  })

  const contract_point_contractSE = contractCode?.flatMap((fm:any) => {
    return fm?.booking_version?.flatMap((fm_v:any) => {
      return fm_v?.booking_row_json?.flatMap((fm_r:any) => {
        return {
          // contract_start_date: fm?.contract_start_date,
          // contract_end_date: fm?.terminate_date || fm?.extend_deadline ||fm?.contract_end_date,
          // contract_code: fm?.contract_code,
          contract_point: fm_r?.contract_point,
          group: fm?.group?.name
        }
      })
    })
  })

  // console.log('contract_point_contractSE : ', contract_point_contractSE);


  // const shareData =
  //   payload?.filter(
  //     (f: any) => {
  //       const nomDate = nomMaster?.find((f_:any) => f_?.nomination_point === f?.nomination_point?.nomination_point)
  //       const nomination_point_use = nomDate || f?.nomination_point
  //       const shipperIdNameList: string[] = [];
  //       (nomination_point_use?.contract_point_list ?? []).map(
  //         (
  //           contract_point: any
  //         ) => {
  //           (contract_point?.shipper_contract_point ?? []).map(
  //             (
  //               shipper_contract_point: any
  //             ) => {
  //               const shipperIdName = `${shipper_contract_point?.group?.id_name ?? ''}`
  //               if (
  //                 shipperIdName &&
  //                 !shipperIdNameList.includes(
  //                   shipperIdName
  //                 )
  //               ) {
  //                 shipperIdNameList.push(
  //                   shipperIdName
  //                 )
  //               }
  //             }
  //           )
  //         }
  //       )
  //       return (
  //         shipperIdNameList.length >
  //         1
  //       )
  //     }
  //   )
  const shareData =
    payload?.filter(
      (f: any) => {
        const nomMaster_ = nomMaster?.find((f_:any) => f_?.nomination_point === f?.nomination_point?.nomination_point)
        // [วิธีเดิม] รวม shipper จากทุก contract point ของ nomination point นี้เป็นก้อนเดียว
        // แล้วถือว่า "share" ถ้ามี shipper มากกว่า 1 คน (getCountShipper.length > 1)
        // ข้อจำกัด: แม้ทุก contract point จะมี shipper ชุดเดียวกัน (เช่น A,B ใช้ X,Y เหมือนกัน) ก็ยังถูกนับเป็น share
        // const contractPoint = (nomMaster_?.contract_point_list || [])?.map((e:any) => e?.contract_point) 
        // const filterContractPointByContractCode = contract_point_contractSE?.filter((f:any) => contractPoint?.includes(f?.contract_point))?.map((shipper:any) => shipper?.group)
        // const getCountShipper = [...new Set(filterContractPointByContractCode)]
        // return getCountShipper.length > 1

        // [วิธีใหม่] เปรียบเทียบ shipper แยกตาม contract point ทีละตัว
        // share เมื่อ contract point คนละตัวมี shipper (group) ไม่ตรงกัน
        // (มี group ใน contract point หนึ่งที่ไม่อยู่ใน contract point อีกตัว)
        const mapData = new Map<string, string[]>();
        let isShare = false;
        for(const e of (nomMaster_?.contract_point_list || [])){
          // หา shipper (group) ที่ผูกกับ contract point นี้เท่านั้น
          const filterContractPointByContractCode = contract_point_contractSE?.filter((f:any) => e?.contract_point == f?.contract_point)?.map((shipper:any) => shipper?.group)
          const getCountShipper = [...new Set<string>(filterContractPointByContractCode)]
          if(getCountShipper.length > 0){
            mapData.set(e?.contract_point, getCountShipper);
            // เทียบกับ contract point ที่เก็บไว้ก่อนหน้า: ถ้ามี group ที่ไม่ตรงกัน = share
            Array.from(mapData.keys()).filter(key => key != e?.contract_point).map(key => {
              if(mapData.get(key).some(group => !getCountShipper.includes(group))){
                isShare = true
              }
            })
          }
          if(isShare){
            break;
          }
        }
        return isShare;
      }
    )
  // console.log('shareData : ', shareData); 

  return shareData
}

export async function shareShipperAtNomLevel( 
  prisma: PrismaService,
  start: dayjs.Dayjs | null, 
  end: dayjs.Dayjs | null
) : Promise<nominationPointWithRelationsForShareMeter[]> {
  const todayStart = start && (start?.isValid() ? start.toDate() : getTodayStartAdd7().toDate()) || getTodayStartAdd7().toDate()
  const todayEnd = end && end?.isValid() ? end.toDate() : (start && (start.isValid() ? start.toDate() : getTodayEndAdd7().toDate()) || getTodayEndAdd7().toDate()) 
  const nomMaster: nominationPointWithRelationsForShareMeter[] = await prisma.nomination_point.findMany({
    where: {
      AND: [
        {
          start_date: { lte: todayEnd } // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
        },
        {
          OR: [
            { end_date: null }, // ถ้า end_date เป็น null
            { end_date: { gt: todayStart } } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
          ]
        }
      ]
    },
    ...nominationPointPopulateForShareMeter,
  })

  // https://app.clickup.com/t/9018502823/86eub6dcw
  const contractCode = await prisma.contract_code.findMany({
    where: {
      AND: [
        {
          contract_start_date: { lte: todayEnd }
        },
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
        {
          OR: [
            { terminate_date: null },
            { terminate_date: { gt: todayStart } } // Terminate date is after target date
          ]
        },
        {
          OR: [
            {
              AND: [
                { extend_deadline: { not: null } },
                { extend_deadline: { gt: todayStart } }
              ]
            },
            {
              AND: [
                { extend_deadline: null },
                {
                  OR: [
                    { contract_end_date: null },
                    { contract_end_date: { gt: todayStart } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    select:{
      id: true,
      contract_code: true,
      group:{
        select:{
          name: true,
        },
      },
      contract_start_date: true,
      contract_end_date: true,
      booking_version:{
        include:{
          booking_row_json:{
            select:{
              contract_point:true,
            }
          },
        },
        where:{
          flag_use: true
        }
      }
    }
  })

  const contract_point_contractSE = contractCode.flatMap(fm => {
    return (fm.booking_version || []).flatMap(fm_v => {
      return (fm_v.booking_row_json || []).flatMap(fm_r => {
        return {
          // contract_start_date: fm?.contract_start_date,
          // contract_end_date: fm?.terminate_date || fm?.extend_deadline ||fm?.contract_end_date,
          // contract_code: fm?.contract_code,
          contract_point: fm_r.contract_point,
          group: fm.group?.name
        }
      })
    })
  })

  const shareData = nomMaster.filter(nom => {
    const mapData = new Map<string, string[]>();
    let isShare = false;
    for(const e of (nom?.contract_point_list || [])){
      // หา shipper (group) ที่ผูกกับ contract point นี้เท่านั้น
      const filterContractPointByContractCode = contract_point_contractSE.filter(f => e.contract_point == f.contract_point).map(shipper => shipper.group)
      const getCountShipper = [...new Set<string>(filterContractPointByContractCode)]
      if(getCountShipper.length > 0){
        mapData.set(e.contract_point, getCountShipper);
        // เทียบกับ contract point ที่เก็บไว้ก่อนหน้า: ถ้ามี group ที่ไม่ตรงกัน = share
        Array.from(mapData.keys()).filter(key => key != e.contract_point).map(key => {
          if(mapData.get(key).some(group => !getCountShipper.includes(group))){
            isShare = true
          }
        })
      }
      if(isShare){
        break;
      }
    }
    return isShare;
  })

  return shareData
}

export function parseGasHoursFromRows(rows: any[]): number[] {
  return [...new Set(rows.map((r) => Number(r?.gasHour)).filter(Number.isFinite))].sort((a, b) => a - b)
}
