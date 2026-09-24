import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {getTodayNowAdd7} from 'src/common/utils/date.util'
import {
  arrConfigSet,
  dfConfigSet
} from 'src/common/utils/asset.util'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

@Injectable()
export class AssetConfigMasterPathService {
  constructor(
    private prisma: PrismaService
  ) {}

  configMasterPath() {
    return this.prisma.config_master_path.findMany(
      {
        where: {
          // active: true,
        },
        include: {
          revised_capacity_path:
            {
              include: {
                area: true
              }
            },
          revised_capacity_path_edges: true,
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

  async configMasterPathCreate(
    payload: any,
    userId: any
  ) {
    const {nodes, edges} =
      payload

    let newConfigSet =
      await arrConfigSet(
        this.prisma,
        0
      )

    let newAreaArr =
      await dfConfigSet(
        nodes,
        edges
      )

    let checkHave =
      newConfigSet?.areaCode.find(
        (f: any) => {
          return (
            f === newAreaArr
          )
        }
      )
    if (checkHave) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'config master path already exist'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const configMasterPathCreate =
      await this.prisma.config_master_path.create(
        {
          data: {
            path_no: String(
              newConfigSet
                ?.configMasterPath
                .length +
                1 <
                10
                ? `000${newConfigSet?.configMasterPath.length + 1}`
                : newConfigSet
                      ?.configMasterPath
                      .length +
                      1 <
                    100
                  ? `00${newConfigSet?.configMasterPath.length + 1}`
                  : newConfigSet
                        ?.configMasterPath
                        .length +
                        1 <
                      1000
                    ? `0${newConfigSet?.configMasterPath.length + 1}`
                    : newConfigSet
                        ?.configMasterPath
                        .length +
                      1
            ),
            active: true,
            create_by:
              Number(userId),
            create_date:
              getTodayNowAdd7().toDate(),
            create_date_num:
              getTodayNowAdd7().unix()
          }
        }
      )

    let tempMaster = {
      active: true,
      create_by:
        Number(userId),
      create_date:
        getTodayNowAdd7().toDate(),
      create_date_num:
        getTodayNowAdd7().unix()
    }
    let newNodes = nodes.map(
      (e: any) => {
        let filTypeStart =
          edges.find(
            (f: any) => {
              return (
                f?.target_id ===
                e?.id
              )
            }
          )
        let filTypeEnd =
          edges.find(
            (f: any) => {
              return (
                f?.source_id ===
                e?.id
              )
            }
          )
        let typeUse = 2
        if (!!!filTypeStart) {
          typeUse = 1
        } else if (
          !!!filTypeEnd
        ) {
          typeUse = 3
        }
        return {
          ...tempMaster,
          area_id: Number(
            e?.id
          ),
          config_master_path_id:
            Number(
              configMasterPathCreate?.id
            ),
          revised_capacity_path_type_id:
            typeUse
        }
      }
    )
    await this.prisma.revised_capacity_path.createMany(
      {
        data: newNodes
      }
    )
    await this.prisma.revised_capacity_path_edges.createMany(
      {
        data: edges.map(
          (e: any) => {
            return {
              ...e,
              ...tempMaster,
              config_master_path_id:
                Number(
                  configMasterPathCreate?.id
                )
            }
          }
        )
      }
    )

    return configMasterPathCreate
  }

  async configMasterPathStatus(
    payload: any,
    userId: any,
    id: any
  ) {
    const {active} = payload
    const configMasterPathStatus =
      await this.prisma.config_master_path.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            active: active,
            update_by:
              Number(userId),
            update_date:
              getTodayNowAdd7().toDate(),
            update_date_num:
              getTodayNowAdd7().unix()
          }
        }
      )

    return configMasterPathStatus
  }

  async configMasterPathEdit(
    payload: any,
    userId: any,
    id: any
  ) {
    const {nodes, edges} =
      payload

    let newConfigSet =
      await arrConfigSet(
        this.prisma,
        Number(id)
      )

    let newAreaArr =
      await dfConfigSet(
        nodes,
        edges
      )

    let checkHave =
      newConfigSet?.areaCode.find(
        (f: any) => {
          return (
            f === newAreaArr
          )
        }
      )
    if (checkHave) {
      throw new HttpException(
        {
          status:
            HttpStatus.BAD_REQUEST,
          error:
            'config master path already exist'
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const configMasterPathEdit =
      await this.prisma.config_master_path.update(
        {
          where: {
            id: Number(id)
          },
          data: {
            update_by:
              Number(userId),
            update_date:
              getTodayNowAdd7().toDate(),
            update_date_num:
              getTodayNowAdd7().unix()
          }
        }
      )

    await this.prisma.revised_capacity_path.deleteMany(
      {
        where: {
          config_master_path_id:
            Number(id)
        }
      }
    )
    await this.prisma.revised_capacity_path_edges.deleteMany(
      {
        where: {
          config_master_path_id:
            Number(id)
        }
      }
    )

    let tempMaster = {
      active: true,
      create_by:
        Number(userId),
      create_date:
        getTodayNowAdd7().toDate(),
      create_date_num:
        getTodayNowAdd7().unix()
    }
    let newNodes = nodes.map(
      (e: any) => {
        let filTypeStart =
          edges.find(
            (f: any) => {
              return (
                f?.target_id ===
                e?.id
              )
            }
          )
        let filTypeEnd =
          edges.find(
            (f: any) => {
              return (
                f?.source_id ===
                e?.id
              )
            }
          )
        let typeUse = 2
        if (!!!filTypeStart) {
          typeUse = 1
        } else if (
          !!!filTypeEnd
        ) {
          typeUse = 3
        }
        return {
          ...tempMaster,
          area_id: Number(
            e?.id
          ),
          config_master_path_id:
            Number(id),
          revised_capacity_path_type_id:
            typeUse
        }
      }
    )
    await this.prisma.revised_capacity_path.createMany(
      {
        data: newNodes
      }
    )
    await this.prisma.revised_capacity_path_edges.createMany(
      {
        data: edges.map(
          (e: any) => {
            return {
              ...e,
              ...tempMaster,
              config_master_path_id:
                Number(id)
            }
          }
        )
      }
    )

    return configMasterPathEdit
  }

  configMasterPathOnce(
    id: any
  ) {
    return this.prisma.config_master_path.findUnique(
      {
        where: {
          id: Number(id)
        },
        include: {
          revised_capacity_path:
            {
              include: {
                area: true
              }
            },
          revised_capacity_path_edges: true,
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
}
