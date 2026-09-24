import {PrismaService} from 'prisma/prisma.service'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {
  getTodayNowAdd7,
  getTodayNowDDMMYYYYAdd7
} from './date.util'
import {isMatch} from './allocation.util'
import {parseToNumber} from './number.util'
import {
  area,
  path_management_config,
  Prisma
} from '@prisma/client'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

const pathManagementPopulate =
  {
    include: {
      path_management_config: true
    }
  }
const contractPointPopulate =
  {
    include: {
      area: true,
      zone: true
    }
  }
type pathManagementWithRelations =
  Prisma.path_managementGetPayload<
    typeof pathManagementPopulate
  >
type contractPointWithRelations =
  Prisma.contract_pointGetPayload<
    typeof contractPointPopulate
  >
type bookingValue = {
  area: area
  mmbtud: number | undefined
  mmscfd: number | undefined
  mmbtuh: number | undefined
  mmscfh: number | undefined
  contractPoint: contractPointWithRelations[]
  pathConfig?: path_management_config
  originalMmbtud?: number
  originalMmscfd?: number
  originalMmbtuh?: number
  originalMmscfh?: number
}
type bookingValueGroup = {
  [key: string]: bookingValue
}

function setValueToBookingValueGroup(
  group: bookingValueGroup,
  key: string,
  mmbtud: any,
  mmscfd: any,
  mmbtuh: any,
  mmscfh: any,
  pathConfig?: path_management_config
) {
  const mmbtudNumber =
    parseToNumber(mmbtud)
  const mmscfdNumber =
    parseToNumber(mmscfd)
  const mmbtuhNumber =
    parseToNumber(mmbtuh)
  const mmscfhNumber =
    parseToNumber(mmscfh)
  if (mmbtudNumber) {
    if (group[key].mmbtud) {
      group[key].mmbtud =
        group[key].mmbtud +
        mmbtudNumber
    } else {
      group[key].mmbtud =
        mmbtudNumber
    }
  }
  if (mmscfdNumber) {
    if (group[key].mmscfd) {
      group[key].mmscfd =
        group[key].mmscfd +
        mmscfdNumber
    } else {
      group[key].mmscfd =
        mmscfdNumber
    }
  }

  if (mmbtuhNumber) {
    if (group[key].mmbtuh) {
      group[key].mmbtuh =
        group[key].mmbtuh +
        mmbtuhNumber
    } else {
      group[key].mmbtuh =
        mmbtuhNumber
    }
  }

  if (mmscfhNumber) {
    if (group[key].mmscfh) {
      group[key].mmscfh =
        group[key].mmscfh +
        mmscfhNumber
    } else {
      group[key].mmscfh =
        mmscfhNumber
    }
  }

  if (pathConfig) {
    group[key].pathConfig =
      pathConfig
  }
}

function getAreaInPathConfigTemps(
  temps: any
): any[] {
  if (
    !temps ||
    !temps.revised_capacity_path ||
    !temps.revised_capacity_path_edges
  ) {
    return []
  }

  const areas =
    temps.revised_capacity_path
  const edges =
    temps.revised_capacity_path_edges

  // Create a map of area_id to area for quick lookup
  const areaMap = new Map()
  areas.forEach(
    (area: any) => {
      areaMap.set(
        area.area_id,
        area
      )
    }
  )

  // Find the starting point (entry point with entry_exit_id = 1)
  const entryArea =
    areas.find(
      (area: any) =>
        area.area
          .entry_exit_id === 1
    )
  if (!entryArea) {
    return []
  }

  // Create adjacency list for path traversal
  const adjacencyList =
    new Map()
  edges.forEach(
    (edge: any) => {
      if (
        !adjacencyList.has(
          edge.source_id
        )
      ) {
        adjacencyList.set(
          edge.source_id,
          []
        )
      }
      adjacencyList
        .get(edge.source_id)
        .push(edge.target_id)
    }
  )

  // Traverse the path starting from entry point
  const orderedAreas: any[] =
    []
  const visited = new Set()

  function traverse(
    currentAreaId: number
  ) {
    if (
      visited.has(
        currentAreaId
      )
    ) {
      return
    }

    const area = areaMap.get(
      currentAreaId
    )
    if (area) {
      orderedAreas.push(area)
      visited.add(
        currentAreaId
      )
    }

    // Get next areas in the path
    const nextAreas =
      adjacencyList.get(
        currentAreaId
      ) || []
    nextAreas.forEach(
      (
        nextAreaId: number
      ) => {
        traverse(nextAreaId)
      }
    )
  }

  // Start traversal from entry area
  traverse(entryArea.area_id)

  return orderedAreas
}

/**
 * คำนวณค่าการจอง (booking value) สำหรับแต่ละวัน
 * ยังไม่รองรับ short term non firm
 *
 * @param currentDay - วันที่ที่ต้องการคำนวณ
 * @param allPointInContract - รายการจุดทั้งหมดในสัญญา (entry และ exit points)
 * @param pathManagementList - รายการการจัดการเส้นทาง
 * @param contractPointList - รายการจุดสัญญา
 * @param mmbtuKey - คีย์สำหรับข้อมูล MMBTU/d
 * @param mmscfdKey - คีย์สำหรับข้อมูล MMscfd
 * @param mmbtuhKey - คีย์สำหรับข้อมูล MMBTU/h
 * @param mmscfhKey - คีย์สำหรับข้อมูล MMscfh
 * @param entryContractPointKey - คีย์สำหรับจุดเข้า
 * @param exitContractPointKey - คีย์สำหรับจุดออก
 * @returns bookingValueGroup - กลุ่มค่าการจองที่จัดกลุ่มตามพื้นที่
 */
function getBookingValueForEachDay({
  currentDay,
  allPointInContract,
  pathManagementList,
  contractPointList,
  mmbtuKey,
  mmscfdKey,
  mmbtuhKey,
  mmscfhKey,
  entryContractPointKey,
  exitContractPointKey
}: {
  currentDay: dayjs.Dayjs
  allPointInContract: {
    isEntry: boolean
    pointName: string
    value: any
  }[]
  pathManagementList: pathManagementWithRelations[]
  contractPointList: contractPointWithRelations[]
  mmbtuKey: number
  mmscfdKey: number
  mmbtuhKey: number
  mmscfhKey: number
  entryContractPointKey: string
  exitContractPointKey: string
}): bookingValue[] {
  const result: bookingValueGroup =
    {}
  try {
    // วนลูปครั้งที่ 1: สร้างโครงสร้างผลลัพธ์และรวบรวม contract points
    allPointInContract.map(
      (point: any) => {
        // ดึงข้อมูลการจองจากจุดนั้น
        const bookData =
          point.value
        const mmbtud =
          bookData[mmbtuKey] // MMBTU/d
        const mmscfd =
          bookData[mmscfdKey] // MMscfd
        const mmbtuh =
          bookData[mmbtuhKey] // MMBTU/h
        const mmscfh =
          bookData[mmscfhKey] // MMscfh
        // กำหนดชื่อจุดสัญญาตามประเภท (entry หรือ exit)
        const contractPointName =
          bookData[
            point.isEntry
              ? entryContractPointKey
              : exitContractPointKey
          ]

        // ค้นหาจุดสัญญาที่ตรงกับเงื่อนไข:
        // 1. ชื่อจุดสัญญาตรงกัน
        // 2. วันที่เริ่มต้นสัญญา <= วันที่ปัจจุบัน
        // 3. วันที่สิ้นสุดสัญญา >= วันที่ปัจจุบัน (หรือเป็น null/undefined)
        const contractPoint =
          contractPointList.find(
            (
              contractPoint: any
            ) =>
              contractPoint.contract_point ===
                contractPointName &&
              getTodayNowAdd7(
                contractPoint.contract_point_start_date
              ).isSameOrBefore(
                currentDay,
                'day'
              ) &&
              (contractPoint.contract_point_end_date ===
                null ||
                contractPoint.contract_point_end_date ===
                  undefined ||
                getTodayNowAdd7(
                  contractPoint.contract_point_end_date
                ).isSameOrAfter(
                  currentDay,
                  'day'
                ))
          )

        if (contractPoint) {
          // สร้าง key สำหรับจัดกลุ่มตามชื่อพื้นที่และประเภท (entry/exit)
          const key = `${contractPoint.area?.name}_${contractPoint.area?.entry_exit_id == 1}`

          // สร้างโครงสร้างผลลัพธ์ใหม่หากยังไม่มี
          if (!result[key]) {
            result[key] = {
              area: contractPoint.area,
              mmbtud:
                undefined,
              mmscfd:
                undefined,
              mmbtuh:
                undefined,
              mmscfh:
                undefined,
              contractPoint: [
                contractPoint
              ],
              originalMmbtud:
                mmbtud,
              originalMmscfd:
                mmscfd,
              originalMmbtuh:
                mmbtuh,
              originalMmscfh:
                mmscfh
            }
          } else {
            // เพิ่ม contract point เข้าไปในรายการที่มีอยู่แล้ว
            result[
              key
            ].contractPoint.push(
              contractPoint
            )
          }
        }
      }
    )

    // วนลูปครั้งที่ 2: คำนวณค่าการจองและจัดสรรตามเส้นทาง
    allPointInContract.map(
      (point: any) => {
        // ดึงข้อมูลการจองจากจุดนั้น
        const bookData =
          point.value
        // ดึงค่าการจองในหน่วยต่างๆ
        const mmbtud =
          bookData[mmbtuKey] // MMBTU/d
        const mmscfd =
          bookData[mmscfdKey] // MMscfd
        const mmbtuh =
          bookData[mmbtuhKey] // MMBTU/h
        const mmscfh =
          bookData[mmscfhKey] // MMscfh

        // กำหนดชื่อจุดสัญญาตามประเภท (entry หรือ exit)
        const contractPointName =
          bookData[
            point.isEntry
              ? entryContractPointKey
              : exitContractPointKey
          ]

        // ค้นหาจุดสัญญาที่ตรงกับเงื่อนไข (เช่นเดียวกับลูปแรก)
        const contractPoint =
          contractPointList.find(
            (
              contractPoint: any
            ) =>
              contractPoint.contract_point ===
                contractPointName &&
              getTodayNowAdd7(
                contractPoint.contract_point_start_date
              ).isSameOrBefore(
                currentDay,
                'day'
              ) &&
              (contractPoint.contract_point_end_date ===
                null ||
                contractPoint.contract_point_end_date ===
                  undefined ||
                getTodayNowAdd7(
                  contractPoint.contract_point_end_date
                ).isSameOrAfter(
                  currentDay,
                  'day'
                ))
          )

        if (contractPoint) {
          // สร้าง key สำหรับจัดกลุ่มตามชื่อพื้นที่และประเภท (entry/exit)
          const key = `${contractPoint.area?.name}_${contractPoint.area?.entry_exit_id == 1}`

          // หากเป็นจุดออก (exit point) ต้องพิจารณาเส้นทาง
          if (
            contractPoint.area
              ?.entry_exit_id ==
            2
          ) {
            // ค้นหาเส้นทางที่ใช้งานได้ล่าสุดที่เริ่มต้นก่อนหรือในวันที่ปัจจุบัน
            let path: pathManagementWithRelations | null =
              null
            const pathList =
              pathManagementList.filter(
                (path) => {
                  return (
                    currentDay.isSameOrAfter(
                      path.start_date,
                      'day'
                    ) &&
                    path.path_management_config.some(
                      (
                        config
                      ) =>
                        config.flag_use &&
                        isMatch(
                          config.exit_name_temp,
                          contractPoint
                            .area
                            .name
                        )
                    )
                  )
                }
              )

            // เลือกเส้นทางที่ใหม่ที่สุด
            if (
              pathList.length >
              0
            ) {
              path =
                pathList.sort(
                  (a, b) =>
                    new Date(
                      b.start_date
                    ).getTime() -
                    new Date(
                      a.start_date
                    ).getTime()
                )[0]
            }

            if (path) {
              // ค้นหาการกำหนดค่าเส้นทางที่ตรงกับจุดออก
              const pathConfig:
                | path_management_config
                | undefined =
                path.path_management_config.find(
                  (config) =>
                    config.flag_use &&
                    isMatch(
                      config.exit_name_temp,
                      contractPoint
                        .area
                        .name
                    )
                )

              if (
                pathConfig
              ) {
                // เส้นทางจะถูกกำหนดที่จุดออก
                setValueToBookingValueGroup(
                  result,
                  key,
                  undefined,
                  undefined,
                  undefined,
                  undefined,
                  pathConfig
                )

                // แปลงข้อมูล temps เป็น JSON และดึงพื้นที่ในเส้นทาง
                const temps =
                  JSON.parse(
                    pathConfig[
                      'temps'
                    ]
                  )
                const areaInPathConfigTemps =
                  getAreaInPathConfigTemps(
                    temps
                  )

                // หาตำแหน่งของจุดปัจจุบันในเส้นทาง
                const currentPointIndex =
                  areaInPathConfigTemps.findIndex(
                    (area) =>
                      isMatch(
                        area
                          .area
                          .name,
                        contractPoint
                          .area
                          .name
                      )
                  )

                // ตัดพื้นที่ที่อยู่หลังจุดปัจจุบันออก (เพื่อไม่ให้ส่งค่ากลับไป)
                if (
                  currentPointIndex !==
                  -1
                ) {
                  areaInPathConfigTemps.splice(
                    currentPointIndex +
                      1
                  )
                }

                // ส่งค่าการจองไปยังทุกพื้นที่ในเส้นทาง (ก่อนจุดออก)
                areaInPathConfigTemps.map(
                  (item) => {
                    const otherAreaKey = `${item?.area?.name}_${item?.area?.entry_exit_id == 1}`
                    if (
                      result[
                        otherAreaKey
                      ]
                    ) {
                      setValueToBookingValueGroup(
                        result,
                        otherAreaKey,
                        mmbtud,
                        mmscfd,
                        mmbtuh,
                        mmscfh
                      )
                    }
                  }
                )
              } else {
                // หากไม่พบการกำหนดค่าเส้นทาง ให้ส่งค่าไปยังจุดออกโดยตรง
                setValueToBookingValueGroup(
                  result,
                  key,
                  mmbtud,
                  mmscfd,
                  mmbtuh,
                  mmscfh
                )
              }
            } else {
              // หากไม่พบเส้นทาง ให้ส่งค่าไปยังจุดออกโดยตรง
              setValueToBookingValueGroup(
                result,
                key,
                mmbtud,
                mmscfd,
                mmbtuh,
                mmscfh
              )
            }
          } else {
            // หากเป็นจุดเข้า (entry point) ให้ส่งค่าไปยังจุดนั้นโดยตรง
            setValueToBookingValueGroup(
              result,
              key,
              mmbtud,
              mmscfd,
              mmbtuh,
              mmscfh
            )
          }
        }
      }
    )

    return Object.values(
      result
    )
  } catch (error) {
    // หากเกิดข้อผิดพลาด ให้คืนค่าผลลัพธ์ที่ว่าง
    return Object.values(
      result
    )
  }
}

// ยังไม่รองรับ short term non firm
export async function getBookingValueWithPath({
  prisma,
  startDate,
  endDate,
  bookingFullJson
}: {
  prisma: PrismaService
  startDate: dayjs.Dayjs
  endDate: dayjs.Dayjs
  bookingFullJson: any
}) {
  try {
    const dataTemp =
      typeof bookingFullJson?.data_temp ===
      'string'
        ? JSON.parse(
            bookingFullJson.data_temp
          )
        : bookingFullJson.data_temp

    const headMMBTU =
      dataTemp?.[
        'headerEntry'
      ]?.[
        'Capacity Daily Booking (MMBTU/d)'
      ]
    const headMMSCFD =
      dataTemp?.[
        'headerEntry'
      ]?.[
        'Capacity Daily Booking (MMscfd)'
      ]
    const headMMBTUH =
      dataTemp?.[
        'headerEntry'
      ]?.[
        'Maximum Hour Booking (MMBTU/h)'
      ]
    const headMMSCFH =
      dataTemp?.[
        'headerEntry'
      ]?.[
        'Maximum Hour Booking (MMscfh)'
      ]
    const headExitMMBTU =
      dataTemp?.[
        'headerExit'
      ]?.[
        'Capacity Daily Booking (MMBTU/d)'
      ]
    const headExitMMBTUH =
      dataTemp?.[
        'headerExit'
      ]?.[
        'Maximum Hour Booking (MMBTU/h)'
      ]
    const entryContractPointKey =
      dataTemp?.[
        'headerEntry'
      ]?.['Entry']?.['key']
    const exitContractPointKey =
      dataTemp?.[
        'headerExit'
      ]?.['Exit']?.['key']

    const allDate = [
      ...new Set([
        ...Object.keys(
          headMMBTU || {}
        ),
        ...Object.keys(
          headMMSCFD || {}
        ),
        ...Object.keys(
          headMMBTUH || {}
        ),
        ...Object.keys(
          headMMSCFH || {}
        ),
        ...Object.keys(
          headExitMMBTU || {}
        ),
        ...Object.keys(
          headExitMMBTUH || {}
        )
      ])
    ]
      .filter((date) => {
        const dayjsDate =
          getTodayNowDDMMYYYYAdd7(
            date
          )
        return (
          date !== 'key' &&
          dayjsDate.isSameOrBefore(
            endDate,
            'month'
          ) &&
          dayjsDate.isSameOrAfter(
            startDate,
            'month'
          )
        )
      })
      .sort((a, b) =>
        getTodayNowDDMMYYYYAdd7(
          a
        ).diff(
          getTodayNowDDMMYYYYAdd7(
            b
          )
        )
      )

    const pathManagementList: pathManagementWithRelations[] =
      await prisma.path_management.findMany(
        {
          where: {
            start_date: {
              lt: endDate.toDate()
            }
          },
          ...pathManagementPopulate,
          orderBy: {
            start_date: 'desc'
          }
        }
      )

    const allPointInContract =
      dataTemp[
        'entryValue'
      ].map((entry: any) => {
        return {
          isEntry: true,
          pointName:
            entry[
              entryContractPointKey
            ],
          value: entry
        }
      })
    allPointInContract.push(
      ...dataTemp[
        'exitValue'
      ].map((exit: any) => {
        return {
          isEntry: false,
          pointName:
            exit[
              exitContractPointKey
            ],
          value: exit
        }
      })
    )
    const contractPointNameList =
      allPointInContract.map(
        (point: any) =>
          point.pointName
      )
    const contractPointList: contractPointWithRelations[] =
      await prisma.contract_point.findMany(
        {
          where: {
            contract_point: {
              in: contractPointNameList
            },
            contract_point_start_date:
              {
                lt: endDate.toDate()
              },
            OR: [
              {
                contract_point_end_date:
                  null
              },
              {
                contract_point_end_date:
                  {
                    gte: startDate.toDate()
                  }
              }
            ]
          },
          ...contractPointPopulate
        }
      )

    const result: {
      [
        date: string
      ]: bookingValue[]
    } = {}
    allDate.map((date) => {
      const mmbtuKey = Number(
        headMMBTU[date].key
      )
      const mmscfdKey =
        Number(
          headMMSCFD[date].key
        )
      const mmbtuhKey =
        Number(
          headMMBTUH[date].key
        )
      const mmscfhKey =
        Number(
          headMMSCFH[date].key
        )

      const currentDate =
        getTodayNowDDMMYYYYAdd7(
          date
        )

      // Loop through every day in the same month as currentDate
      const monthStart =
        currentDate.startOf(
          'month'
        )
      const monthEnd =
        currentDate.endOf(
          'month'
        )

      let currentDay =
        monthStart
      while (
        currentDay.isSameOrBefore(
          monthEnd,
          'day'
        )
      ) {
        const valueForEachDay =
          getBookingValueForEachDay(
            {
              currentDay,
              allPointInContract,
              pathManagementList,
              contractPointList,
              mmbtuKey,
              mmscfdKey,
              mmbtuhKey,
              mmscfhKey,
              entryContractPointKey:
                entryContractPointKey,
              exitContractPointKey:
                exitContractPointKey
            }
          )
        result[
          currentDay.format(
            'DD/MM/YYYY'
          )
        ] = valueForEachDay

        currentDay =
          currentDay.add(
            1,
            'day'
          )
      }
    })

    return result
  } catch (e) {}
}
