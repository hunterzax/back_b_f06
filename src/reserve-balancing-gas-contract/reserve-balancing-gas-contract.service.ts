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
import * as fs from 'fs'
import * as FormData from 'form-data'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import axios from 'axios'
import {getTodayNowAdd7} from 'src/common/utils/date.util'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class ReserveBalancingGasContractService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  findAll() {
    return this.prisma.reserve_balancing_gas_contract.findMany(
      {
        include: {
          group: true,
          reserve_balancing_gas_contract_comment:
            {
              include: {
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
              orderBy: {
                id: 'desc'
              }
            },
          reserve_balancing_gas_contract_files:
            {
              include: {
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
              orderBy: {
                id: 'desc'
              }
            },
          reserve_balancing_gas_contract_detail:
            {
              include: {
                zone: true,
                area: true,
                entry_exit: true,
                nomination_point: true,
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

  async create(
    payload: any,
    userId: any
  ) {
    const {
      group_id,
      res_bal_gas_contract,
      reserve_balancing_gas_contract_comment,
      reserve_balancing_gas_contract_files,
      reserve_balancing_gas_contract_detail
    } = payload

    const dateCre =
      getTodayNowAdd7()

    const resData =
      await this.prisma.reserve_balancing_gas_contract.create(
        {
          data: {
            res_bal_gas_contract:
              res_bal_gas_contract,
            ...(!!group_id && {
              group: {
                connect: {
                  id: Number(
                    group_id
                  )
                }
              }
            }),
            create_date:
              dateCre.toDate(),
            // create_by: Number(userId),
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

    for (
      let i = 0;
      i <
      reserve_balancing_gas_contract_comment.length;
      i++
    ) {
      await this.comment(
        {
          id: resData?.id,
          comment:
            reserve_balancing_gas_contract_comment[
              i
            ]
        },
        userId
      )
    }

    for (
      let i = 0;
      i <
      reserve_balancing_gas_contract_files.length;
      i++
    ) {
      await this.files(
        {
          id: resData?.id,
          url: reserve_balancing_gas_contract_files[
            i
          ]
        },
        userId
      )
    }

    for (
      let i = 0;
      i <
      reserve_balancing_gas_contract_detail.length;
      i++
    ) {
      const {
        zone_id,
        area_id,
        entry_exit_id,
        nomination_point_id,
        start_date,
        end_date,
        daily_reserve_cap_mmbtu_d
      } =
        reserve_balancing_gas_contract_detail[
          i
        ]
      await this.prisma.reserve_balancing_gas_contract_detail.create(
        {
          data: {
            daily_reserve_cap_mmbtu_d:
              daily_reserve_cap_mmbtu_d,
            ...(!!resData?.id && {
              reserve_balancing_gas_contract:
                {
                  connect: {
                    id: Number(
                      resData?.id
                    )
                  }
                }
            }),
            ...(!!zone_id && {
              zone: {
                connect: {
                  id: Number(
                    zone_id
                  )
                }
              }
            }),
            ...(!!area_id && {
              area: {
                connect: {
                  id: Number(
                    area_id
                  )
                }
              }
            }),
            ...(!!entry_exit_id && {
              entry_exit: {
                connect: {
                  id: Number(
                    entry_exit_id
                  )
                }
              }
            }),
            ...(!!nomination_point_id && {
              nomination_point:
                {
                  connect: {
                    id: Number(
                      nomination_point_id
                    )
                  }
                }
            }),
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            end_date: end_date
              ? getTodayNowAdd7(
                  end_date
                ).toDate()
              : null,
            create_date:
              dateCre.toDate(),
            // create_by: Number(userId),
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
    }

    return resData
  }

  async edit(
    payload: any,
    id: any,
    userId: any
  ) {
    const {
      group_id,
      res_bal_gas_contract,
      reserve_balancing_gas_contract_comment,
      reserve_balancing_gas_contract_files,
      reserve_balancing_gas_contract_detail
    } = payload

    const dateCre =
      getTodayNowAdd7()

    const resData =
      await this.prisma.reserve_balancing_gas_contract.update(
        {
          where: {
            id: Number(
              id ?? -1
            )
          },
          data: {
            res_bal_gas_contract:
              res_bal_gas_contract,
            ...(!!group_id && {
              group: {
                connect: {
                  id: Number(
                    group_id
                  )
                }
              }
            }),
            update_date:
              dateCre.toDate(),
            // update_by: Number(userId),
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

    for (
      let i = 0;
      i <
      reserve_balancing_gas_contract_comment.length;
      i++
    ) {
      await this.comment(
        {
          id: resData?.id,
          comment:
            reserve_balancing_gas_contract_comment[
              i
            ]
        },
        userId
      )
    }

    for (
      let i = 0;
      i <
      reserve_balancing_gas_contract_files.length;
      i++
    ) {
      await this.files(
        {
          id: resData?.id,
          url: reserve_balancing_gas_contract_files[
            i
          ]
        },
        userId
      )
    }

    await this.prisma.reserve_balancing_gas_contract_detail.deleteMany(
      {
        where: {
          reserve_balancing_gas_contract_id:
            Number(id)
        }
      }
    )
    for (
      let i = 0;
      i <
      reserve_balancing_gas_contract_detail.length;
      i++
    ) {
      const {
        zone_id,
        area_id,
        entry_exit_id,
        nomination_point_id,
        start_date,
        end_date,
        daily_reserve_cap_mmbtu_d
      } =
        reserve_balancing_gas_contract_detail[
          i
        ]
      await this.prisma.reserve_balancing_gas_contract_detail.create(
        {
          data: {
            daily_reserve_cap_mmbtu_d:
              daily_reserve_cap_mmbtu_d,
            ...(!!id && {
              reserve_balancing_gas_contract:
                {
                  connect: {
                    id: Number(
                      id
                    )
                  }
                }
            }),
            ...(!!zone_id && {
              zone: {
                connect: {
                  id: Number(
                    zone_id
                  )
                }
              }
            }),
            ...(!!area_id && {
              area: {
                connect: {
                  id: Number(
                    area_id
                  )
                }
              }
            }),
            ...(!!entry_exit_id && {
              entry_exit: {
                connect: {
                  id: Number(
                    entry_exit_id
                  )
                }
              }
            }),
            ...(!!nomination_point_id && {
              nomination_point:
                {
                  connect: {
                    id: Number(
                      nomination_point_id
                    )
                  }
                }
            }),
            start_date:
              start_date
                ? getTodayNowAdd7(
                    start_date
                  ).toDate()
                : null,
            end_date: end_date
              ? getTodayNowAdd7(
                  end_date
                ).toDate()
              : null,
            create_date:
              dateCre.toDate(),
            // create_by: Number(userId),
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
    }

    return resData
  }

  async comment(
    payload: any,
    userId: any
  ) {
    const {id, comment} =
      payload

    const dateCre =
      getTodayNowAdd7()

    const resData =
      await this.prisma.reserve_balancing_gas_contract_comment.create(
        {
          data: {
            ...(!!id && {
              reserve_balancing_gas_contract:
                {
                  connect: {
                    id: Number(
                      id
                    )
                  }
                }
            }),
            comment: comment,
            create_date:
              dateCre.toDate(),
            // create_by: Number(userId),
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

    return resData
  }

  async files(
    payload: any,
    userId: any
  ) {
    const {id, url} = payload

    const dateCre =
      getTodayNowAdd7()

    const resData =
      await this.prisma.reserve_balancing_gas_contract_files.create(
        {
          data: {
            ...(!!id && {
              reserve_balancing_gas_contract:
                {
                  connect: {
                    id: Number(
                      id
                    )
                  }
                }
            }),
            url: url,
            create_date:
              dateCre.toDate(),
            // create_by: Number(userId),
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

    return resData
  }
}
