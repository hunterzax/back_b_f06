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

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import {CapacityService} from 'src/capacity/capacity.service'
import {
  getTodayEndAdd7,
  getTodayNowAdd7,
  getTodayStartAdd7
} from 'src/common/utils/date.util'
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class PathManagementService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
    private readonly capacityService: CapacityService
  ) {}

  groupByExitIdTemp = (
    arr: any
  ) => {
    return arr.reduce(
      (
        acc: any,
        item: any
      ) => {
        const key =
          item.exit_name_temp
        if (!acc[key]) {
          acc[key] = []
        }
        acc[key].push(item)
        return acc
      },
      {}
    )
  }

  async useReqs(req: any) {
    const ip =
      req.headers[
        'x-forwarded-for'
      ] || req.ip
    return {
      ip: ip,
      sub: req?.user?.sub,
      first_name:
        req?.user?.first_name,
      last_name:
        req?.user?.last_name,
      username:
        req?.user?.username,
      originalUrl:
        req?.originalUrl
    }
  }

  async writeReq(
    reqUser: any,
    type: any,
    method: any,
    value: any
  ) {
    const usedData = {
      reqUser: !!reqUser
        ? JSON.stringify(
            await this.useReqs(
              reqUser
            )
          )
        : null,
      type: type,
      method: method,
      value:
        JSON.stringify(value),
      time: new Date(),
      id_value: value?.id,
      create_date:
        getTodayNowAdd7().toDate(),
      create_date_num:
        getTodayNowAdd7().unix(),
      module:
        'Capacity Management', // Booking -> Capacity Management UPDATE history SET module = 'Capacity Management' WHERE module = 'Booking';
      create_by_account: {
        connect: {
          id: Number(
            reqUser?.user?.sub
          ) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
        }
      }
    }
    await this.prisma.history.create(
      {
        data: usedData
      }
    )
    return true
  }

  async pathManagementOnce(
    id: any
  ) {
    return await this.prisma.path_management.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          path_management_config:
            {
              where: {
                flag_use: true
              }
            },
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
        }
      }
    )
  }

  async pathManagementOnceFull(
    id: any
  ) {
    const resData =
      await this.prisma.path_management.findUnique(
        {
          where: {
            id: Number(id)
          },
          include: {
            path_management_config:
              {
                include: {
                  config_master_path:
                    {
                      include:
                        {
                          revised_capacity_path:
                            {
                              include:
                                {
                                  area: true
                                },
                              orderBy:
                                {
                                  area_id:
                                    'desc'
                                }
                            },
                          revised_capacity_path_edges: true
                        }
                    }
                },
                // distinct: ['exit_name_temp'], // เอา exit_name_temp ที่ไม่ซ้ำกัน
                where: {
                  flag_use: true
                }
              },
            create_by_account:
              {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },
            update_by_account:
              {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              }
          }
        }
      )

    return resData
  }

  async pathManagement() {
    return await this.prisma.path_management.findMany(
      {
        include: {
          path_management_config:
            {
              where: {
                flag_use: true
              }
            },
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
      }
    )
  }

  findFinalExitAreas(
    paths: any[]
  ) {
    const finalExits = []

    paths.forEach((path) => {
      const edges =
        path.revised_capacity_path_edges

      // สร้าง Set สำหรับเก็บ source_id ทั้งหมด
      const sourceIds =
        new Set(
          edges.map(
            (edge: any) =>
              edge.source_id
          )
        )

      // หา target_id ที่ไม่มี source_id ไปต่อ
      const exitEdges =
        edges.filter(
          (edge: any) =>
            !sourceIds.has(
              edge.target_id
            )
        )

      // นำ target_id ที่เป็น exit มาแมพกลับไปหา area_id
      exitEdges.forEach(
        (exitEdge: any) => {
          const exitArea =
            path.revised_capacity_path.find(
              (area: any) =>
                area.area_id ===
                exitEdge.target_id
            )
          if (exitArea) {
            finalExits.push(
              exitArea
            )
          }
        }
      )
    })

    return finalExits
  }

  async groupPathTemp() {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()

    const configPath =
      await this.prisma.config_master_path.findMany(
        {
          include: {
            revised_capacity_path:
              {
                include: {
                  area: true
                },
                orderBy: {
                  area_id:
                    'desc'
                }
              },
            revised_capacity_path_edges: true
          },
          where: {
            active: true,
            revised_capacity_path:
              {
                some: {
                  area: {
                    start_date:
                      {
                        lte: todayEnd // วันที่เริ่มต้นน้อยกว่าหรือเท่ากับวันนี้
                      },
                    end_date:
                      {
                        gte: todayStart // วันที่สิ้นสุดมากกว่าหรือเท่ากับวันนี้
                      }
                  }
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    // เรียกใช้ฟังก์ชัน findFinalExitAreas เพื่อหาพื้นที่ exit ที่เป็นจุดสิ้นสุด
    const finalExitAreas =
      await this.findFinalExitAreas(
        configPath
      )

    // จัดกลุ่ม exit areas โดยใช้ชื่อ exit เป็น key
    const groupedExits =
      finalExitAreas.reduce(
        (
          acc: any,
          area: any
        ) => {
          const exitName =
            area?.area?.id

          // ถ้ายังไม่มี key ที่เป็นชื่อ exit นี้ใน acc ให้สร้าง array ใหม่
          if (
            !acc[exitName]
          ) {
            acc[exitName] = []
          }

          // เพิ่มข้อมูลของ area เข้าไปในกลุ่มที่มีชื่อ exit เดียวกัน
          acc[exitName].push({
            ...area?.area,
            config_master_path_id:
              area?.config_master_path_id
          })

          return acc
        },
        {}
      )

    const objToArray =
      this.capacityService.objToArray(
        groupedExits
      )

    const groupedResult =
      objToArray.map(
        (e: any, i: any) => {
          const {
            config_master_path_id,
            ...newObjToArray
          } =
            objToArray[i]
              ?.value[0]

          const value =
            e?.value.map(
              (
                value: any
              ) => {
                const find =
                  configPath?.find(
                    (
                      f: any
                    ) => {
                      return (
                        f?.id ===
                        value?.config_master_path_id
                      )
                    }
                  )
                return find
              }
            )

          return {
            ...newObjToArray,
            pathConfigs: value
          }
        }
      )

    return groupedResult || []
  }

  async groupPath() {
    const todayStart =
      getTodayStartAdd7().toDate()
    const todayEnd =
      getTodayEndAdd7().toDate()

    const configPath =
      await this.prisma.config_master_path.findMany(
        {
          include: {
            revised_capacity_path:
              {
                include: {
                  area: true
                },
                orderBy: {
                  area_id:
                    'desc'
                }
              },
            revised_capacity_path_edges: true
          },
          where: {
            active: true,
            revised_capacity_path:
              {
                some: {
                  area: {
                    AND: [
                      {
                        start_date:
                          {
                            lte: todayEnd // วันที่เริ่มต้นน้อยกว่าหรือเท่ากับวันนี้
                          }
                      },
                      {
                        OR: [
                          {
                            end_date:
                              {
                                gte: todayStart // วันที่สิ้นสุดมากกว่าหรือเท่ากับวันนี้
                              }
                          },
                          {
                            end_date:
                              null // หรือไม่มี end_date (null)
                          }
                        ]
                      }
                    ]
                  }
                }
              }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )

    // entry_exit_id === 1
    let exitArrId: any = []
    const pathConfigs =
      configPath.map(
        (e: any) => {
          for (
            let iex = 0;
            iex <
            e
              ?.revised_capacity_path
              .length;
            iex++
          ) {
            if (
              e
                ?.revised_capacity_path[
                iex
              ]?.area
                ?.entry_exit_id ===
              2
            ) {
              const area =
                e
                  ?.revised_capacity_path[
                  iex
                ]?.area
              if (
                !exitArrId.find(
                  (item) =>
                    item.id ===
                    area?.id
                )
              ) {
                exitArrId.push(
                  area
                )
              }
            }
          }

          return e
        }
      )

    const exitArrResult =
      exitArrId.map(
        (e: any) => {
          // pathConfigs
          // revised_capacity_path
          // area?.id
          const filId =
            pathConfigs?.filter(
              (f: any) => {
                const filData =
                  f?.revised_capacity_path?.find(
                    (
                      fs: any
                    ) => {
                      return (
                        fs
                          ?.area
                          ?.id ===
                        e?.id
                      )
                    }
                  )
                return !!filData
              }
            )

          return {
            ...e,
            pathConfigs: filId
          }
        }
      )

    const newData = (
      exitArrResult || []
    ).filter((item) => {
      const startDate =
        item.start_date
          ? getTodayStartAdd7(
              item.start_date
            ).toDate()
          : null
      const endDate =
        item.end_date
          ? getTodayStartAdd7(
              item.end_date
            ).toDate()
          : null

      const isStartDateValid =
        startDate &&
        startDate <=
          todayStart

      //  - ถ้ามีค่า → ต้อง >= วันนี้
      //  - ถ้าเป็น null → ให้ผ่าน
      const isEndDateValid =
        !endDate ||
        endDate >= todayStart

      return (
        isStartDateValid &&
        isEndDateValid
      )
    })

    return newData || []
  }

  async pathManagementCreate(
    payload: any,
    userId: any
  ) {
    const {
      start_date,
      path_management_config,
      ref,
      ...dataWithout
    } = payload
    const checkSE =
      await this.prisma.path_management.findFirst(
        {
          where: {
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null
          }
        }
      )

    let flagSE = false
    if (checkSE) {
      flagSE = true
    }

    if (flagSE) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          // error: 'Date is Match.',
          error:
            'Activated Date should not overlap.' // TOP: Path Management ปรับข้อความ Fail กรณีที่สร้าง แล้วใส่วันที่ตรงกับที่มีอยู่แล้ว เป็นเคส  Activated Date should not overlap
        },
        HttpStatus.BAD_REQUEST
      )
    } else {
      const useStartDate =
        start_date
          ? getTodayNowAdd7(
              start_date
            ).toDate()
          : null

      const pathManagement =
        await this.prisma.path_management.findMany(
          {}
        )
      const pathManagementCreate =
        await this.prisma.path_management.create(
          {
            data: {
              // ...dataWithout,
              version:
                'v.' +
                String(
                  pathManagement.length +
                    1 <
                    10
                    ? `000${pathManagement.length + 1}`
                    : pathManagement.length +
                          1 <
                        100
                      ? `00${pathManagement.length + 1}`
                      : pathManagement.length +
                            1 <
                          1000
                        ? `0${pathManagement.length + 1}`
                        : pathManagement.length +
                          1
                ),
              start_date:
                useStartDate,
              ref: ref,
              create_date:
                getTodayNowAdd7().toDate(),
              create_date_num:
                getTodayNowAdd7().unix(),
              create_by_account:
                {
                  connect: {
                    id: Number(
                      userId
                    ) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                  }
                }
            }
          }
        )

      // id                    Int                 @id @default(autoincrement())
      // path_management_id    Int?
      // path_management       path_management?    @relation(fields: [path_management_id], references: [id])
      // config_master_path_id Int?
      // config_master_path    config_master_path? @relation(fields: [config_master_path_id], references: [id])
      // temps                 String?
      // start_date            DateTime?
      // create_date           DateTime?
      // update_date           DateTime?
      // create_date_num       Int?
      // update_date_num       Int?
      // create_by             Int?
      // create_by_account     account?            @relation(name: "created_by_account", fields: [create_by], references: [id]) // ชื่อความสัมพันธ์ที่แตกต่างกันสำหรับ create_by
      // update_by             Int?
      // update_by_account     account?            @relation(name: "updated_by_account", fields: [update_by], references: [id]) // ชื่อความสัมพันธ์ที่แตกต่างกันสำหรับ update_by
      // flag_use              Boolean?
      // exit_name_temp        String?
      // exit_id_temp          Int?
      const useDataArr = []
      const configPathArr =
        path_management_config.map(
          (e: any) =>
            e?.config_master_path_id
        )
      const configPath =
        await this.prisma.config_master_path.findMany(
          {
            include: {
              revised_capacity_path:
                {
                  include: {
                    area: true
                  },
                  orderBy: {
                    area_id:
                      'desc'
                  }
                },
              revised_capacity_path_edges: true
            },
            where: {
              id: {
                in: configPathArr
              }
            },
            orderBy: {
              id: 'desc'
            }
          }
        )
      for (
        let i = 0;
        i <
        path_management_config.length;
        i++
      ) {
        const {
          config_master_path_id,
          ...usePathManagementConfig
        } =
          path_management_config[
            i
          ]
        const filPathIdTemp =
          configPath.find(
            (f: any) => {
              return (
                f?.id ===
                config_master_path_id
              )
            }
          )
        const useData = {
          ...usePathManagementConfig,
          // ...(pathManagementCreate?.id !== null && {
          //   path_management: {
          //     connect: {
          //       id: pathManagementCreate?.id,
          //     },
          //   },
          // }),
          temps:
            JSON.stringify(
              filPathIdTemp
            ) || null,
          // temps_json: filPathIdTemp || null,
          path_management_id:
            pathManagementCreate?.id,
          config_master_path_id:
            config_master_path_id,
          flag_use: true,
          start_date:
            useStartDate,
          create_date:
            getTodayNowAdd7().toDate(),
          create_date_num:
            getTodayNowAdd7().unix(),
          create_by:
            Number(userId)
          // create_by_account: {
          //   connect: {
          //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
          //   },
          // },
        }

        useDataArr.push(
          useData
        )
      }
      await this.prisma.path_management_config.updateMany(
        {
          where: {
            path_management_id:
              pathManagementCreate?.id ??
              -1
          },
          data: {
            flag_use: false
          }
        }
      )
      await this.prisma.path_management_config.createMany(
        {
          data: useDataArr
        }
      )

      return pathManagementCreate
    }
  }

  async pathManagementEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {
      start_date,
      path_management_config,
      ...dataWithout
    } = payload

    const checkMidDate =
      await this.prisma.path_management.findFirst(
        {
          where: {
            id: {
              not: Number(id)
            },
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null
          }
        }
      )
    if (!!checkMidDate) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'Date is Match.'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const pathManagementEdit =
      await this.prisma.path_management.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            update_date:
              getTodayNowAdd7().toDate(),
            update_date_num:
              getTodayNowAdd7().unix(),
            update_by_account:
              {
                connect: {
                  id: Number(
                    userId
                  ) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
                }
              }
          }
        }
      )

    // id                    Int                 @id @default(autoincrement())
    // path_management_id    Int?
    // path_management       path_management?    @relation(fields: [path_management_id], references: [id])
    // config_master_path_id Int?
    // config_master_path    config_master_path? @relation(fields: [config_master_path_id], references: [id])
    // temps                 String?
    // start_date            DateTime?
    // create_date           DateTime?
    // update_date           DateTime?
    // create_date_num       Int?
    // update_date_num       Int?
    // create_by             Int?
    // create_by_account     account?            @relation(name: "created_by_account", fields: [create_by], references: [id]) // ชื่อความสัมพันธ์ที่แตกต่างกันสำหรับ create_by
    // update_by             Int?
    // update_by_account     account?            @relation(name: "updated_by_account", fields: [update_by], references: [id]) // ชื่อความสัมพันธ์ที่แตกต่างกันสำหรับ update_by
    // flag_use              Boolean?
    // exit_name_temp        String?
    // exit_id_temp          Int?
    const useDataArr = []

    const oldCN =
      await this.prisma.path_management_config.findMany(
        {
          where: {
            path_management_id:
              Number(id),
            flag_use: true
          }
        }
      )

    const old = (
      oldCN || []
    ).map(
      (e: any) =>
        `${e?.config_master_path_id}${e?.exit_name_temp}`
    )
    const arrNew = (
      path_management_config ||
      []
    ).map((e: any) => {
      return {
        temp: `${e?.config_master_path_id}${e?.exit_name_temp}`,
        exit_name_temp:
          e?.exit_name_temp,
        config_master_path_id:
          e?.config_master_path_id
      }
    })

    // (หายไป)
    // const removedItems = old.filter((item: any) => {
    //   return !arrNew.includes(item);
    // });

    // (เหลือ)
    // const unchangedItems = old.filter((item: any) => {
    //   return arrNew.includes(item);
    // });

    // (มาใหม่)
    const addedItems =
      arrNew.filter(
        (item: any) => {
          return !old.includes(
            item?.temp
          )
        }
      )

    const filteredData =
      path_management_config.filter(
        (item: any) =>
          addedItems
            .map(
              (ea: any) =>
                ea?.temp
            )
            .includes(
              `${item.config_master_path_id}${item.exit_name_temp}`
            )
        // addedItems.includes(item.config_master_path_id),
      )

    const findLast =
      await this.prisma.path_management.findFirst(
        {
          where: {
            id: Number(id)
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    let flag_use = false
    if (
      findLast?.id ===
      Number(id)
    ) {
      flag_use = true
    }
    const configPathArr =
      filteredData.map(
        (e: any) =>
          e?.config_master_path_id
      )
    const configPath =
      await this.prisma.config_master_path.findMany(
        {
          include: {
            revised_capacity_path:
              {
                include: {
                  area: true
                },
                orderBy: {
                  area_id:
                    'desc'
                }
              },
            revised_capacity_path_edges: true
          },
          where: {
            id: {
              in: configPathArr
            }
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    for (
      let i = 0;
      i < filteredData.length;
      i++
    ) {
      const {
        config_master_path_id,
        ...usePathManagementConfig
      } = filteredData[i]
      const filPathIdTemp =
        configPath.find(
          (f: any) => {
            return (
              f?.id ===
              config_master_path_id
            )
          }
        )
      const useData = {
        ...usePathManagementConfig,
        // ...(pathManagementEdit?.id !== null && {
        //   path_management: {
        //     connect: {
        //       id: pathManagementEdit?.id,
        //     },
        //   },
        // }),
        temps:
          JSON.stringify(
            filPathIdTemp
          ) || null,
        // temps_json: filPathIdTemp || null,
        path_management_id:
          pathManagementEdit?.id,
        config_master_path_id:
          config_master_path_id,
        flag_use: flag_use,
        start_date: start_date
          ? getTodayNowAdd7(
              start_date
            ).toDate()
          : null,
        create_date:
          getTodayNowAdd7().toDate(),
        create_date_num:
          getTodayNowAdd7().unix(),
        create_by:
          Number(userId)
        // create_by_account: {
        //   connect: {
        //     id: Number(userId), // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
        //   },
        // },
      }

      useDataArr.push(useData)
    }

    await this.prisma.path_management_config.updateMany(
      {
        where: {
          path_management_id:
            Number(id),
          // config_master_path_id: { notIn: configMasterPathIds },
          exit_name_temp: {
            in: addedItems.map(
              (e: any) =>
                e?.exit_name_temp
            )
          }
        },
        data: {
          flag_use: false
        }
      }
    )

    await this.prisma.path_management_config.createMany(
      {
        data: useDataArr
      }
    )

    // if (flag_use) {
    // const configMasterPathIds = path_management_config.map(
    //   (e: any) => e?.config_master_path_id,
    // );

    // await this.prisma.path_management_config.updateMany({
    //   where: {
    //     path_management_id: Number(id),
    //     config_master_path_id: { in: configMasterPathIds },
    //   },
    //   data: { flag_use: true },
    // });
    // }

    return {
      mode: 1,
      data: pathManagementEdit
    }
    // } else {
    //   payload.ref = Number(id);
    //   const duplicate = await this.pathManagementCreate(payload, userId);
    //   return { mode: 2, data: duplicate };
    // }
  }

  async pathManagementLog(
    id: any
  ) {
    const result =
      await this.prisma.path_management_config.findMany(
        {
          include: {
            path_management: true,
            config_master_path:
              {
                include: {
                  revised_capacity_path:
                    {
                      include:
                        {
                          area: true
                        },
                      orderBy:
                        {
                          area_id:
                            'desc'
                        }
                    },
                  revised_capacity_path_edges: true
                }
              },
            create_by_account:
              {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              },
            update_by_account:
              {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true
                }
              }
          },
          where: {
            path_management_id:
              Number(id)
          },
          orderBy: {
            id: 'desc'
          }
        }
      )
    const resultGroup =
      result.map((e: any) => {
        const paths =
          JSON.parse(e?.temps)
        const {
          temps,
          ...newE
        } = e
        return {
          ...newE,
          paths: paths
        }
      })
    const groupByExitIdTemp =
      await this.groupByExitIdTemp(
        resultGroup
      )
    return groupByExitIdTemp
  }
}
