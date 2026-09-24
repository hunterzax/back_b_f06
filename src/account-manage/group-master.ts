import {HttpException, HttpStatus, Injectable} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import {getTodayEndAdd7, getTodayNowAdd7, getTodayNowDDMMYYYYDfaultAdd7, getTodayStartAdd7} from 'src/common/utils/date.util'

dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class AccountManageGroupMasterService {
  constructor(private prisma: PrismaService) {}

  async groupMasterOne(id: any) {
    const groupMaster = await this.prisma.group.findUnique({
      include: {
        user_type: true,
        bank_master: true,
        role_default: {
          include: {
            role: true
          }
        },
        division: true,
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
        },
        shipper_contract_point: {
          include: {
            contract_point: {
              include: {
                area: true
              }
            }
          }
        }
      },
      where: {
        id: Number(id),
        active: true
      }
    })
    return groupMaster
  }

  async groupMaster(user_type: any) {
    const groupMaster = await this.prisma.group.findMany({
      include: {
        user_type: true,
        bank_master: true,
        role_default: {
          include: {
            role: true
          }
        },
        division: true,
        division_group_show: {
          include: {
            division: true
          }
        },
        shipper_contract_point: {
          include: {
            contract_point: {
              include: {
                area: {
                  include: {
                    zone: true
                  }
                },
                zone: true,
                nomination_point_list: true
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
      where: {
        user_type_id: Number(user_type),
        active: true
      },
      orderBy: {
        id: 'desc'
      }
    })
    return groupMaster
  }

  async groupMasterCreate(payload: any, userId: any) {
    // try {
    const {role_default, division, start_date, end_date, ...dataWithout} = payload

    let validateList = []
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    const startDate = start_date ? getTodayNowAdd7(start_date).toDate() : null
    const endDate = end_date ? getTodayNowAdd7(end_date).toDate() : null

    if (!!dataWithout?.email) {
      // komliv231@gmail.com
      const ckEmail = await this.prisma.group.findFirst({
        where: {
          email: dataWithout?.email,
          start_date: {
            lte: startDate // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: startDate || todayStart
              }
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            {
              end_date: {
                gt: endDate || todayEnd
              }
            }
          ]
        },
        include: {
          user_type: true
        }
      })
      if (!!ckEmail) {
        // const adverb =
        //   ckEmail.user_type?.id == dataWithout.user_type_id
        //     ? ''
        //     : ckEmail.user_type?.name
        //       ? ` as a ${ckEmail.user_type.name}'s email`
        //       : '';
        const message = ckEmail.user_type?.id == dataWithout.user_type_id && ckEmail.user_type?.name ? `This ${ckEmail.user_type.name} Email has already been used.` : `Duplicate Email found in ${ckEmail.user_type?.name || ''} Group. Please enter a new email.` //`This email has already been used${adverb}.`;
        validateList.push(message)
      }
    }

    if (!!dataWithout?.name) {
      // komliv231@gmail.com
      const ckName = await this.prisma.group.findFirst({
        where: {
          name: dataWithout?.name,
          start_date: {
            lte: startDate // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: startDate || todayStart
              }
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            {
              end_date: {
                gt: endDate || todayEnd
              }
            }
          ]
        },
        include: {
          user_type: true
        }
      })
      if (!!ckName) {
        // const adverb =
        //   ckName.user_type?.id == dataWithout.user_type_id
        //     ? ''
        //     : ckName.user_type?.name
        //       ? ` as a ${ckName.user_type.name}'s name`
        //       : '';
        const message =
          ckName.user_type?.id == dataWithout.user_type_id && ckName.user_type?.name
            ? `This ${ckName.user_type.name} Name has already been used.`
            : `Duplicate ${ckName.user_type?.name?.toLowerCase() == 'tso' ? 'Group' : ckName.user_type?.name || ''} Name found in ${ckName.user_type.name} Group. Please enter a new name.` //`This name has already been used${adverb}.`;
        validateList.push(message)
      }
    }

    if (!!dataWithout?.id_name) {
      // komliv231@gmail.com
      const ckId = await this.prisma.group.findFirst({
        where: {
          id_name: dataWithout?.id_name,
          start_date: {
            lte: startDate // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: startDate || todayStart
              }
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            {
              end_date: {
                gt: endDate || todayEnd
              }
            }
          ]
        },
        include: {
          user_type: true
        }
      })
      if (!!ckId) {
        // const adverb =
        //   ckId.user_type?.id == dataWithout.user_type_id
        //     ? ''
        //     : ckId.user_type?.name
        //       ? ` as a ${ckId.user_type.name} ID`
        //       : '';
        const message = ckId.user_type?.id == dataWithout.user_type_id && ckId.user_type?.name ? `This ${ckId.user_type.name} ID has already been used.` : `Duplicate ID found in ${ckId.user_type?.name || ''} Group. Please enter a new ID.` //`This ID has already been used${adverb}.`;
        validateList.push(message)
      }
    }

    if (!!dataWithout?.company_name) {
      // komliv231@gmail.com
      const ckId = await this.prisma.group.findFirst({
        where: {
          company_name: dataWithout?.company_name,
          user_type_id: dataWithout?.user_type_id,
          start_date: {
            lte: startDate // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: startDate || todayStart
              }
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            {
              end_date: {
                gt: endDate || todayEnd
              }
            }
          ]
        },
        include: {
          user_type: true
        }
      })
      if (!!ckId) {
        const message = `This ${ckId.user_type?.name || 'Shipper'} Company Name has already been used.`
        validateList.push(message)
      }
    }

    if (validateList.length > 0) {
      const message = validateList.join('<br/>')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: message,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const groupMaster = await this.prisma.group.create({
      data: {
        ...dataWithout,
        active: true,
        start_date: startDate,
        end_date: endDate,
        create_date: getTodayNowAdd7().toDate(),
        create_by: Number(userId),
        // create_by_account: {
        //   connect: {
        //     id: Number(userId),
        //   },
        // },
        create_date_num: getTodayNowAdd7().unix()
      }
    })
    if (role_default.length > 0) {
      for (let i = 0; i < role_default.length; i++) {
        await this.prisma.role_default.create({
          data: {
            group_id: groupMaster?.id,
            role_id: role_default[i]?.id
          }
        })
      }
    }
    // await this.prisma.$executeRawUnsafe(`
    //   SELECT setval(
    //     pg_get_serial_sequence('public.division_group_show','id'),
    //     COALESCE((SELECT MAX(id) FROM public.division_group_show), 0),
    //     true
    //   )
    // `);
    if (division.length > 0) {
      for (let i = 0; i < division.length; i++) {
        await this.prisma.division.update({
          where: {
            id: division[i]?.id ?? -1
          },
          data: {
            group_id: groupMaster?.id
          }
        })
        try {
          await this.prisma.division_group_show.create({
            data: {
              group_id: groupMaster?.id,
              division_id: division[i]?.id
            }
          })
        } catch (error) {}
      }
    }
    return groupMaster
    // } catch (error) {
    //   if (
    //     (error.code === 'P2002' && error.meta?.target.includes('name')) ||
    //     error.meta?.target.includes('id_name')
    //   ) {
    //     throw new HttpException(
    //       {
    //         status: HttpStatus.BAD_REQUEST,
    //         key: !!error.meta?.target.includes('id_name') ? 'id_name' : 'name',
    //         error: `group ${!!error.meta?.target.includes('id_name') ? 'id_name' : 'name'} already exists. Please choose another ${!!error.meta?.target.includes('id_name') ? 'id_name' : 'name'}`,
    //       },
    //       HttpStatus.BAD_REQUEST,
    //     );
    //   }
    //   throw new HttpException(
    //     {
    //       status: HttpStatus.INTERNAL_SERVER_ERROR,
    //       error: 'Internal server error',
    //     },
    //     HttpStatus.INTERNAL_SERVER_ERROR,
    //   );
    // }
  }

  async groupMasterEdit(id: any, payload: any, userId: any) {
    // try {
    const {role_default, division, start_date, end_date, ...dataWithout} = payload

    let validateList = []
    const todayStart = getTodayStartAdd7().toDate()
    const todayEnd = getTodayEndAdd7().toDate()
    // const startDate = start_date ? getTodayNowAdd7(start_date).toDate() : null
    const startDate = getTodayNowAdd7(start_date).toDate()
    const endDate = end_date ? getTodayNowAdd7(end_date).toDate() : null
    const isAfterNow = dayjs(startDate).isAfter(dayjs());
    console.log('isAfterNow : ', isAfterNow);


    if (!!dataWithout?.email) {
      // komliv231@gmail.com
      const ckEmail = await this.prisma.group.findFirst({
        where: {
          id: {
            not: Number(id)
          },
          email: dataWithout?.email,
          start_date: {
            lte: startDate // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: startDate || todayStart
              }
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            {
              end_date: {
                gt: endDate || todayEnd
              }
            }
          ]
        },
        include: {
          user_type: true
        }
      })
      if (!!ckEmail) {
        // const adverb =
        //   ckEmail.user_type?.id == dataWithout.user_type_id
        //     ? ''
        //     : ckEmail.user_type?.name
        //       ? ` as a ${ckEmail.user_type.name}'s email`
        //       : '';
        const message = ckEmail.user_type?.id == dataWithout.user_type_id && ckEmail.user_type?.name ? `This ${ckEmail.user_type.name} Email has already been used.` : `Duplicate Email found in ${ckEmail.user_type?.name || ''} Group. Please enter a new email.` //`This email has already been used${adverb}.`;
        validateList.push(message)
      }
    }

    if (!!dataWithout?.name) {
      // komliv231@gmail.com
      const ckName = await this.prisma.group.findFirst({
        where: {
          id: {
            not: Number(id)
          },
          name: dataWithout?.name,
          start_date: {
            lte: startDate // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: startDate || todayStart
              }
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            {
              end_date: {
                gt: endDate || todayEnd
              }
            }
          ]
        },
        include: {
          user_type: true
        }
      })
      if (!!ckName) {
        // const adverb =
        //   ckName.user_type?.id == dataWithout.user_type_id
        //     ? ''
        //     : ckName.user_type?.name
        //       ? ` as a ${ckName.user_type.name}'s name`
        //       : '';
        const message =
          ckName.user_type?.id == dataWithout.user_type_id && ckName.user_type?.name
            ? `This ${ckName.user_type.name} Name has already been used.`
            : `Duplicate ${ckName.user_type?.name?.toLowerCase() == 'tso' ? 'Group' : ckName.user_type?.name || ''} Name found in ${ckName.user_type.name} Group. Please enter a new name.` //`This name has already been used${adverb}.`;
        validateList.push(message)
      }
    }

    if (!!dataWithout?.id_name) {
      // komliv231@gmail.com
      const ckId = await this.prisma.group.findFirst({
        where: {
          id: {
            not: Number(id)
          },
          id_name: dataWithout?.id_name,
          start_date: {
            lte: startDate // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: startDate || todayStart
              }
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            {
              end_date: {
                gt: endDate || todayEnd
              }
            }
          ]
        },
        include: {
          user_type: true
        }
      })
      if (!!ckId) {
        // const adverb =
        //   ckId.user_type?.id == dataWithout.user_type_id
        //     ? ''
        //     : ckId.user_type?.name
        //       ? ` as a ${ckId.user_type.name} ID`
        //       : '';
        const message = ckId.user_type?.id == dataWithout.user_type_id && ckId.user_type?.name ? `This ${ckId.user_type.name} ID has already been used.` : `Duplicate ID found in ${ckId.user_type?.name || ''} Group. Please enter a new ID.` //`This ID has already been used${adverb}.`;
        validateList.push(message)
      }
    }

    if (!!dataWithout?.company_name) {
      // komliv231@gmail.com
      const ckId = await this.prisma.group.findFirst({
        where: {
          id: {
            not: Number(id)
          },
          company_name: dataWithout?.company_name,
          user_type_id: dataWithout?.user_type_id,
          start_date: {
            lte: startDate // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
          },
          OR: [
            {
              end_date: null
            }, // ถ้า end_date เป็น null
            {
              end_date: {
                gt: startDate || todayStart
              }
            }, // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
            {
              end_date: {
                gt: endDate || todayEnd
              }
            }
          ]
        },
        include: {
          user_type: true
        }
      })
      if (!!ckId) {
        const message = `This ${ckId.user_type?.name || 'Shipper'} Company Name has already been used.`
        validateList.push(message)
      }
    }

    if (validateList.length > 0) {
      const message = validateList.join('<br/>')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: message,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    }

    console.log('id : ', id);
    console.log('payload : ', payload);
    // division_group_show
    const g_dv_o = await this.prisma.group.findFirst({
      where:{
        id: Number(id)
      },
      include:{
        division_group_show:{
            include: {
              division:true,
            }
          },
      }
    })
    // console.log('g_dv_o : ', g_dv_o);
    const dv_o = (g_dv_o?.division_group_show || [])?.flatMap((fm:any) => {
      return fm?.division_id
    })
    // console.log('g_dv_o?.start_date : ', g_dv_o?.start_date);
    // console.log('g_dv_o?.end_date : ', g_dv_o?.end_date);
    // console.log('dv_o : ', dv_o);
    if(dv_o?.length > 0){
      const g_dv_other = await this.prisma.group.findMany({
        where:{
          division_group_show:{
            some:{
              division:{
                id:{
                  in: dv_o
                }
              }
            }
          },
          id:{
            not: Number(id)
          },
          ...(payload?.end_date
          ? {
              start_date: {
                lte: dayjs(payload.end_date, "YYYY-MM-DD")
                  .subtract(1, "day")
                  .toDate(),
              },
            }
          : {}),
          OR: [
                {
                  end_date:
                    null
                },
                {
                  end_date: {
                    gte: dayjs(payload?.start_date, "YYYY-MM-DD").toDate()
                  }
                }
              ],
        },
        include:{
          division_group_show:{
            include: {
              division:true,
            }
          },
        }
      })
      console.log('g_dv_other : ', g_dv_other);
      if (g_dv_other.length > 0) {
          const duplicateDivisionNames = Array.from(
            new Set(
              g_dv_other.flatMap((group: any) =>
                (group.division_group_show || [])
                  .filter((item: any) => dv_o.includes(item.division_id))
                  .map((item: any) => item.division?.division_name)
                  .filter(Boolean)
              )
            )
          );

          const divisionNameText = duplicateDivisionNames.join(", ");

          throw new HttpException(
            {
              status: HttpStatus.BAD_REQUEST,
              key: `Division "${divisionNameText}" is active in the same period.`,
              error: `Division "${divisionNameText}" is active in the same period.`,
            },
            HttpStatus.BAD_REQUEST
          );
        }
    }

    // return null

    try {
      const groupMaster = await this.prisma.group.update({
        where: {
          id: Number(id)
        },
        data: {
          ...dataWithout,
          start_date: startDate,
          end_date: endDate,
          update_date: getTodayNowAdd7().toDate(),
          update_by: Number(userId),
          update_date_num: getTodayNowAdd7().unix()
        }
      })
      await this.prisma.role_default.updateMany({
        where: {
          group_id: groupMaster?.id ?? -1
        },
        data: {
          group_id: null
        }
      })
      await this.prisma.division.updateMany({
        where: {
          group_id: groupMaster?.id ?? -1
        },
        data: {
          group_id: null
        }
      })
      if (role_default.length > 0) {
        for (let i = 0; i < role_default.length; i++) {
          await this.prisma.role_default.create({
            data: {
              group_id: groupMaster?.id,
              role_id: role_default[i]?.id
            }
          })
        }
      }
      try {
        console.log('D');
        if(!isAfterNow){
          await this.prisma.division_group_show.deleteMany({
            where: {
              group_id: groupMaster?.id ?? -1
            }
          })
        }
      } catch (error) {}
      if (division.length > 0) {
        for (let i = 0; i < division.length; i++) {
          await this.prisma.division.update({
            where: {
              id: division[i]?.id ?? -1
            },
            data: {
              group_id: groupMaster?.id
            }
          })
          try {
            const groupId = groupMaster?.id
            const divisionId = division[i]?.id

            if (groupId && divisionId) {
              const existingList = await this.prisma.division_group_show.findMany({
                where: {
                  group_id: groupId,
                  division_id: divisionId
                },
                orderBy: {
                  id: 'asc'
                }
              })

              if (existingList.length === 0) {
                await this.prisma.division_group_show.create({
                  data: {
                    group_id: groupId,
                    division_id: divisionId
                  }
                })
              } else if (existingList.length > 1) {
                // เก็บตัวแรกไว้ แล้วลบตัวที่ซ้ำทั้งหมด
                const duplicateIds = existingList.slice(1).map(item => item.id)

                await this.prisma.division_group_show.deleteMany({
                  where: {
                    id: {
                      in: duplicateIds
                    }
                  }
                })
              }
            }
           
          } catch (error) {}
        }
      }
      return groupMaster
    } catch (error) {
      const message = error?.meta?.target
        .map((item) => {
          if (item == 'name') {
            return 'This Name has already been used.'
          }
          if (item == 'id_name') {
            return 'This ID has already been used.'
          }
          return `This ${item} has already been used.`
        })
        .join('<br/>')
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          key: message,
          error: message
        },
        HttpStatus.BAD_REQUEST
      )
    }
    
  }

  async groupMasterStatus(id: any, payload: any, userId: any) {
    try {
      const {...dataWithout} = payload
      const groupMasterStatus = await this.prisma.group.update({
        where: {
          id: Number(id)
        },
        data: {
          ...dataWithout,
          update_date: getTodayNowAdd7().toDate(),
          update_by: Number(userId),
          update_date_num: getTodayNowAdd7().unix()
        }
      })

      return groupMasterStatus
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal server error'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async shipperContractPoint(id: any, payload: any, userId: any) {
    const {contract_point, ...dataWithout} = payload

    await this.prisma.shipper_contract_point.deleteMany({
      where: {
        group_id: Number(id)
      }
    })

    for (let i = 0; i < contract_point.length; i++) {
      await this.prisma.shipper_contract_point.create({
        data: {
          ...(Number(id) !== null && {
            group: {
              connect: {
                id: Number(id)
              }
            }
          }),
          ...(contract_point[i]?.id !== null && {
            contract_point: {
              connect: {
                id: contract_point[i]?.id
              }
            }
          }),
          create_date: getTodayNowAdd7().toDate(),
          create_date_num: getTodayNowAdd7().unix(),
          create_by_account: {
            connect: {
              id: Number(userId) // Prisma จะใช้ connect แทนการใช้ create_by โดยตรง
            }
          }
        }
      })
    }
    return {id: Number(id)}
  }
}
