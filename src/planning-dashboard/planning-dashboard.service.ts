import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {Cache} from 'cache-manager'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as XLSX from 'xlsx-js-style'
import * as XlsxPopulate from 'xlsx-populate'
import * as fs from 'fs'

import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween

dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)

@Injectable()
export class PlanningDashboardService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  groupYearlyData(data) {
    let yearMap = new Map()

    data.year.forEach(
      (date, index) => {
        if (!date) return // ข้ามค่า null หรือ undefined
        let match =
          date.match(/\d{4}$/) // ค้นหาปีจาก YYYY หรือ DD/MM/YYYY
        if (match) {
          let year = match[0] // ดึงปีออกมา
          let value =
            data.value[
              index
            ] || 0 // ถ้า value เป็น undefined ให้เป็น 0

          if (
            yearMap.has(year)
          ) {
            yearMap.set(
              year,
              yearMap.get(
                year
              ) + value
            ) // รวมค่า value
          } else {
            yearMap.set(
              year,
              value
            )
          }
        }
      }
    )

    // แปลง Map เป็น array แล้วเรียงลำดับปีจากน้อยไปมาก
    let sortedYears = [
      ...yearMap.entries()
    ].sort(
      (a, b) => a[0] - b[0]
    )

    // แยกเป็นอาร์เรย์ year กับ value
    return {
      year: sortedYears.map(
        (entry) => entry[0]
      ),
      value: sortedYears.map(
        (entry) => entry[1]
      )
    }
  }

  buildYearMaxFromMonthly(
    group_data
  ) {
    const isDateKey = (
      k: string
    ) =>
      /^\d{2}\/\d{2}\/\d{4}$/.test(
        k
      ) // DD/MM/YYYY
    const isYearKey = (
      k: string
    ) => /^\d{4}$/.test(k)

    const yearMap = new Map<
      string,
      number
    >()

    for (const key in group_data) {
      const data =
        group_data[key]
      if (
        !data ||
        !Array.isArray(
          data.value
        )
      )
        continue

      if (isDateKey(key)) {
        // key ที่เป็นเดือน ---> หาปี ---> แล้วเอา max
        const year =
          key.slice(-4)
        const monthlyVal =
          Math.max(
            ...data.value.filter(
              (v) => v != null
            )
          )
        const prev =
          yearMap.get(year)
        yearMap.set(
          year,
          prev == null
            ? monthlyVal
            : Math.max(
                prev,
                monthlyVal
              )
        )
      } else if (
        isYearKey(key)
      ) {
        // key ปี เดิม ๆ
        const year = key
        const sumYear =
          data.value
            .filter(
              (v) => v != null
            )
            .reduce((acc, curr) => {
              if(curr || (typeof curr == 'number' && curr == 0)){
                if(acc){
                  acc = acc + curr
                }
                else{
                  acc = curr
                }
              }
              return acc
            }, undefined)
        const prev =
          yearMap.get(year)
        // ถ้ามีทั้งข้อมูลรายเดือนและรายปีชนกัน ให้เลือกค่าสูงสุด กันเหนียวข้อมูลทับผิดฝั่ง
        yearMap.set(
          year,
          prev == null
            ? sumYear
            : Math.max(
                prev,
                sumYear
              )
        )
      } else {
        // คีย์อื่น ๆ ข้าม
        continue
      }
    }

    // สร้างผลลัพธ์ พร้อมเรียงปี
    const sortedYears =
      Array.from(
        yearMap.keys()
      ).sort(
        (a, b) =>
          Number(a) -
          Number(b)
      )

    return {
      year: sortedYears,
      value: sortedYears.map(
        (y) =>
          yearMap.get(
            y
          ) as number
      )
    }
  }

  async dashboardLong(
    userId: any
  ) {
    const resData =
      await this.prisma.query_shipper_planning_files_temp_long.findMany(
        {
          include: {
            query_shipper_planning_files:
              {
                include: {
                  group: {
                    select: {
                      id: true,
                      id_name: true,
                      name: true,
                      company_name: true
                    }
                  },
                  query_shipper_planning_files_temp_row: true
                }
              }
          }
        }
      )

    const convertData =
      resData.map(
        (e: any) => {
          let byrow = e[
            'query_shipper_planning_files'
          ][
            'query_shipper_planning_files_temp_row'
          ]?.map(
            (row: any) => {
              row['value'] =
                JSON.parse(
                  row['value']
                )
              const maxKey =
                Math.max(
                  ...Object.keys(
                    row[
                      'value'
                    ]
                  ).map(
                    (key) =>
                      parseInt(
                        key
                      )
                  )
                )

              const newData =
                {}
              for (
                let i = 6;
                i <= maxKey;
                i++
              ) {
                newData[i] = {
                  year: row[
                    'value'
                  ][i].year,
                  value:
                    !!row[
                      'value'
                    ][i]
                      ?.value
                      ? Number(
                          row[
                            'value'
                          ][
                            i
                          ]?.value.replace(
                            /,/g,
                            ''
                          )
                        )
                      : ''
                }
              }

              // สร้างอ็อบเจ็กต์ที่จัดกลุ่มข้อมูลตามปี
              let groupedData =
                {}
              // ลูปผ่านข้อมูลเพื่อจัดกลุ่ม
              for (let key in newData) {
                const year =
                  newData[key]
                    .year
                const value =
                  newData[key]
                    .value

                if (
                  !groupedData[
                    year
                  ]
                ) {
                  groupedData[
                    year
                  ] = {
                    year: year,
                    value: []
                  }
                }
                groupedData[
                  year
                ].value.push(
                  value
                )
              }

              // สร้างอ็อบเจ็กต์ใหม่ที่จัดกลุ่มปีและรวมค่า value
              let result = {
                year: [],
                value: []
              }

              const resultX =
                this.buildYearMaxFromMonthly(
                  groupedData
                )

              // ลูปผ่าน groupedData และรวมค่า value
              for (let year in groupedData) {
                const data =
                  groupedData[
                    year
                  ]
                result.year.push(
                  data.year
                ) // เพิ่มปี
                result.value.push(
                  data.value.reduce((acc, curr) => {
                    if(curr || (typeof curr == 'number' && curr == 0)){
                      if(acc){
                        acc = acc + curr
                      }
                      else{
                        acc = curr
                      }
                    }
                    return acc
                  }, undefined)
                ) // รวมค่า value
              }

              let groupYear =
                this.groupYearlyData(
                  result
                )

              return {
                id: row['id'],
                nomination_point:
                  row[
                    'value'
                  ]['2'],
                customer:
                  row[
                    'value'
                  ]['3'],
                area: row[
                  'value'
                ]['4'],
                unit: row[
                  'value'
                ]['5'],
                entry_exit_id:
                  row[
                    'value'
                  ]['1'] ===
                  'Entry'
                    ? 1
                    : 2,
                entry_exit:
                  row[
                    'value'
                  ]['1'],
                // ...groupYear // ของเดิมมันรวมค่าทุกเดือนช่วงห้าปีแรก ข้อมูลมันเป็นรายเดือน ---> user บอกว่าให้หา max แล้วเอามาแสดง // https://sharing.clickup.com/9018502823/t/h/86eve8faa/3FVULIDM3G6TG9M
                ...resultX
              }
            }
          )

          e['byrow'] = byrow

          e[
            'planning_code_id'
          ] =
            e[
              'query_shipper_planning_files'
            ]['id']
          e['planning_code'] =
            e[
              'query_shipper_planning_files'
            ]['planning_code']
          e['group'] =
            e[
              'query_shipper_planning_files'
            ]['group']
          e['start_date'] =
            e[
              'query_shipper_planning_files'
            ]['start_date']
          e['end_date'] =
            e[
              'query_shipper_planning_files'
            ]['end_date']
          e[
            'shipper_file_submission_date'
          ] =
            e[
              'query_shipper_planning_files'
            ][
              'shipper_file_submission_date'
            ]

          return {
            data: e['byrow'],
            planning_code_id:
              e[
                'planning_code_id'
              ],
            planning_code:
              e[
                'planning_code'
              ],
            group: e['group'],
            start_date:
              e['start_date'],
            end_date:
              e['end_date'],
            shipper_file_submission_date:
              e[
                'shipper_file_submission_date'
              ]
          }
        }
      )
    const areaArr =
      convertData?.flatMap(
        (e: any) => {
          const areaSp = e[
            'data'
          ].map((ar: any) => {
            return ar['area']
          })
          return areaSp
        }
      )
    const areaDb =
      await this.prisma.area.findMany(
        {
          where: {
            name: {
              in: areaArr
            }
          },
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      )
    const newConvertData =
      convertData.map(
        (e: any) => {
          e['data'] = e[
            'data'
          ].map(
            (eData: any) => {
              const findArea =
                areaDb.find(
                  (
                    f: any
                  ) => {
                    return (
                      f?.name ===
                      eData[
                        'area'
                      ]
                    )
                  }
                )
              if (findArea) {
                eData[
                  'area'
                ] = findArea
              } else {
                eData[
                  'area'
                ] = {
                  id: null,
                  name: eData[
                    'area'
                  ],
                  color: null
                }
              }
              return eData
            }
          )
          return e
        }
      )

    return newConvertData
  }

  async dashboardMedium(
    userId: any
  ) {
    const resData =
      await this.prisma.query_shipper_planning_files_temp_medium.findMany(
        {
          include: {
            query_shipper_planning_files:
              {
                include: {
                  group: {
                    select: {
                      id: true,
                      id_name: true,
                      name: true,
                      company_name: true
                    }
                  },
                  query_shipper_planning_files_temp_row: true
                }
              }
          }
        }
      )

    const convertData =
      resData.map(
        (e: any) => {
          e['byrow'] = e[
            'query_shipper_planning_files'
          ][
            'query_shipper_planning_files_temp_row'
          ]?.map(
            (row: any) => {
              row['value'] =
                JSON.parse(
                  row['value']
                )
              const maxKey =
                Math.max(
                  ...Object.keys(
                    row[
                      'value'
                    ]
                  ).map(
                    (key) =>
                      parseInt(
                        key
                      )
                  )
                )

              const newData =
                {}
              for (
                let i = 6;
                i <= maxKey;
                i++
              ) {
                newData[i] = {
                  month:
                    row[
                      'value'
                    ][i]
                      .month,
                  value:
                    !!row[
                      'value'
                    ][i]
                      ?.value
                      ? Number(
                          row[
                            'value'
                          ][
                            i
                          ]?.value.replace(
                            /,/g,
                            ''
                          )
                        )
                      : ''
                }
              }

              // สร้างอ็อบเจ็กต์ที่จัดกลุ่มข้อมูลตามปี
              let groupedData =
                {}

              // ลูปผ่านข้อมูลเพื่อจัดกลุ่ม
              for (let key in newData) {
                const month =
                  newData[key]
                    .month
                const value =
                  newData[key]
                    .value

                if (
                  !groupedData[
                    month
                  ]
                ) {
                  groupedData[
                    month
                  ] = {
                    month:
                      month,
                    value: []
                  }
                }
                groupedData[
                  month
                ].value.push(
                  value
                )
              }

              // สร้างอ็อบเจ็กต์ใหม่ที่จัดกลุ่มปีและรวมค่า value
              let result = {
                month: [],
                value: []
              }

              // ลูปผ่าน groupedData และรวมค่า value
              for (let month in groupedData) {
                const data =
                  groupedData[
                    month
                  ]
                result.month.push(
                  data.month
                ) // เพิ่มปี
                result.value.push(
                  data.value.reduce((acc, curr) => {
                    if(curr || (typeof curr == 'number' && curr == 0)){
                      if(acc){
                        acc = acc + curr
                      }
                      else{
                        acc = curr
                      }
                    }
                    return acc
                  }, undefined)
                ) // รวมค่า value
              }

              return {
                id: row['id'],
                nomination_point:
                  row[
                    'value'
                  ]['2'],
                customer:
                  row[
                    'value'
                  ]['3'],
                area: row[
                  'value'
                ]['4'],
                unit: row[
                  'value'
                ]['5'],
                entry_exit_id:
                  row[
                    'value'
                  ]['1'] ===
                  'Entry'
                    ? 1
                    : 2,
                entry_exit:
                  row[
                    'value'
                  ]['1'],
                ...result
              }
            }
          )

          e[
            'planning_code_id'
          ] =
            e[
              'query_shipper_planning_files'
            ]['id']
          e['planning_code'] =
            e[
              'query_shipper_planning_files'
            ]['planning_code']
          e['group'] =
            e[
              'query_shipper_planning_files'
            ]['group']
          e['start_date'] =
            e[
              'query_shipper_planning_files'
            ]['start_date']
          e['end_date'] =
            e[
              'query_shipper_planning_files'
            ]['end_date']
          e[
            'shipper_file_submission_date'
          ] =
            e[
              'query_shipper_planning_files'
            ][
              'shipper_file_submission_date'
            ]

          return {
            data: e['byrow'],
            planning_code_id:
              e[
                'planning_code_id'
              ],
            planning_code:
              e[
                'planning_code'
              ],
            group: e['group'],
            start_date:
              e['start_date'],
            end_date:
              e['end_date'],
            shipper_file_submission_date:
              e[
                'shipper_file_submission_date'
              ]
          }
        }
      )

    const areaArr =
      convertData?.flatMap(
        (e: any) => {
          const areaSp = e[
            'data'
          ].map((ar: any) => {
            return ar['area']
          })
          return areaSp
        }
      )
    const areaDb =
      await this.prisma.area.findMany(
        {
          where: {
            name: {
              in: areaArr
            }
          },
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      )
    const newConvertData =
      convertData.map(
        (e: any) => {
          e['data'] = e[
            'data'
          ].map(
            (eData: any) => {
              const findArea =
                areaDb.find(
                  (
                    f: any
                  ) => {
                    return (
                      f?.name ===
                      eData[
                        'area'
                      ]
                    )
                  }
                )
              if (findArea) {
                eData[
                  'area'
                ] = findArea
              } else {
                eData[
                  'area'
                ] = {
                  id: null,
                  name: eData[
                    'area'
                  ],
                  color: null
                }
              }
              return eData
            }
          )
          return e
        }
      )

    return newConvertData
  }

  async dashboardShort(
    userId: any
  ) {
    const resData =
      await this.prisma.query_shipper_planning_files_temp_short.findMany(
        {
          include: {
            query_shipper_planning_files:
              {
                include: {
                  group: {
                    select: {
                      id: true,
                      id_name: true,
                      name: true,
                      company_name: true
                    }
                  },
                  query_shipper_planning_files_temp_row: true
                }
              }
          }
        }
      )

    const convertData =
      resData.map(
        (e: any) => {
          e['byrow'] = e[
            'query_shipper_planning_files'
          ][
            'query_shipper_planning_files_temp_row'
          ]?.map(
            (row: any) => {
              row['value'] =
                JSON.parse(
                  row['value']
                )
              const maxKey =
                Math.max(
                  ...Object.keys(
                    row[
                      'value'
                    ]
                  ).map(
                    (key) =>
                      parseInt(
                        key
                      )
                  )
                )

              const newData =
                {}
              for (
                let i = 6;
                i <= maxKey;
                i++
              ) {
                newData[i] = {
                  day: row[
                    'value'
                  ][i].day,
                  value:
                    !!row[
                      'value'
                    ][i]
                      ?.value
                      ? Number(
                          row[
                            'value'
                          ][
                            i
                          ]?.value.replace(
                            /,/g,
                            ''
                          )
                        )
                      : ''
                }
              }

              // สร้างอ็อบเจ็กต์ที่จัดกลุ่มข้อมูลตามปี
              let groupedData =
                {}

              // ลูปผ่านข้อมูลเพื่อจัดกลุ่ม
              for (let key in newData) {
                const day =
                  newData[key]
                    .day
                const value =
                  newData[key]
                    .value

                if (
                  !groupedData[
                    day
                  ]
                ) {
                  groupedData[
                    day
                  ] = {
                    day: day,
                    value: []
                  }
                }
                groupedData[
                  day
                ].value.push(
                  value
                )
              }

              // สร้างอ็อบเจ็กต์ใหม่ที่จัดกลุ่มปีและรวมค่า value
              let result = {
                day: [],
                value: []
              }

              // ลูปผ่าน groupedData และรวมค่า value
              for (let day in groupedData) {
                const data =
                  groupedData[
                    day
                  ]
                result.day.push(
                  data.day
                ) // เพิ่มปี
                result.value.push(
                  data.value.reduce((acc, curr) => {
                    if(curr || (typeof curr == 'number' && curr == 0)){
                      if(acc){
                        acc = acc + curr
                      }
                      else{
                        acc = curr
                      }
                    }
                    return acc
                  }, undefined)
                ) // รวมค่า value
              }

              return {
                id: row['id'],
                nomination_point:
                  row[
                    'value'
                  ]['2'],
                customer:
                  row[
                    'value'
                  ]['3'],
                area: row[
                  'value'
                ]['4'],
                unit: row[
                  'value'
                ]['5'],
                entry_exit_id:
                  row[
                    'value'
                  ]['1'] ===
                  'Entry'
                    ? 1
                    : 2,
                entry_exit:
                  row[
                    'value'
                  ]['1'],
                ...result
              }
            }
          )

          e[
            'planning_code_id'
          ] =
            e[
              'query_shipper_planning_files'
            ]['id']
          e['planning_code'] =
            e[
              'query_shipper_planning_files'
            ]['planning_code']
          e['group'] =
            e[
              'query_shipper_planning_files'
            ]['group']
          e['start_date'] =
            e[
              'query_shipper_planning_files'
            ]['start_date']
          e['end_date'] =
            e[
              'query_shipper_planning_files'
            ]['end_date']
          e[
            'shipper_file_submission_date'
          ] =
            e[
              'query_shipper_planning_files'
            ][
              'shipper_file_submission_date'
            ]

          return {
            data: e['byrow'],
            planning_code_id:
              e[
                'planning_code_id'
              ],
            planning_code:
              e[
                'planning_code'
              ],
            group: e['group'],
            start_date:
              e['start_date'],
            end_date:
              e['end_date'],
            shipper_file_submission_date:
              e[
                'shipper_file_submission_date'
              ]
          }
        }
      )

    const areaArr =
      convertData?.flatMap(
        (e: any) => {
          const areaSp = e[
            'data'
          ].map((ar: any) => {
            return ar['area']
          })
          return areaSp
        }
      )
    const areaDb =
      await this.prisma.area.findMany(
        {
          where: {
            name: {
              in: areaArr
            }
          },
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      )
    const newConvertData =
      convertData.map(
        (e: any) => {
          e['data'] = e[
            'data'
          ].map(
            (eData: any) => {
              const findArea =
                areaDb.find(
                  (
                    f: any
                  ) => {
                    return (
                      f?.name ===
                      eData[
                        'area'
                      ]
                    )
                  }
                )
              if (findArea) {
                eData[
                  'area'
                ] = findArea
              } else {
                eData[
                  'area'
                ] = {
                  id: null,
                  name: eData[
                    'area'
                  ],
                  color: null
                }
              }
              return eData
            }
          )
          return e
        }
      )

    return newConvertData
  }
}
