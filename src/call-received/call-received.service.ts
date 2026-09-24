import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { PrismaService } from '@prisma/prisma.service'

import * as bcrypt from 'bcrypt'

import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { parseToNumber } from 'src/common/utils/number.util'
import { Prisma } from '@prisma/client'
import { CAA } from 'src/common/utils/caa.util'
import { AccountManageService } from 'src/account-manage/account-manage.service'
dayjs.extend(utc)
dayjs.extend(timezone)

@Injectable()
export class CallReceivedService {
  constructor(
    private prisma: PrismaService,
    // private readonly emailClientService: EmailClientService,
    private readonly accountManageService: AccountManageService
  ) { }

  async useReqs(req: any) {
    const ip = req.headers['x-forwarded-for'] || req.ip
    return {
      ip: ip,
      sub: req?.user?.sub,
      first_name: req?.user?.first_name,
      last_name: req?.user?.last_name,
      username: req?.user?.username,
      originalUrl: req?.originalUrl
    }
  }

  async whenAddNewShipper(payload: any, updateByUserId?: any) {
    const { email, userId, firstName, lastName, telephone, action, shipper, startDate, endDate, ignoreAction = false } = payload
    const SHIPPER_SSO_DEFAULT = 'SHIPPER_SSO_DEFAULT'
    const emailLower = email?.toLowerCase()
    const adminAccountId = parseToNumber(updateByUserId) ?? parseToNumber(process.env.SYSTEM_ACCOUNT_ID) ?? 1
    const adminAccount = await this.prisma.account.findFirst({
      where: {
        id: adminAccountId
      }
    })
    const caa = new CAA();

    if (action !== 'create' && action !== 'update' && !ignoreAction) {
      throw new HttpException(
        {
          status: {
            code: `E`,
            message: `action != create | action != update`
          }
        },
        HttpStatus.BAD_REQUEST
      )
    }
    if (shipper?.action !== 'create' && shipper?.action !== 'update' && !ignoreAction) {
      throw new HttpException(
        {
          status: {
            code: `E`,
            message: `shipper.action != create | shipper.action != update`
          }
        },
        HttpStatus.BAD_REQUEST
      )
    }

    const user = await this.prisma.account.findFirst({
      where: {
        email: emailLower
      },
      include: {
        account_manage: {
          include: {
            account_role: true
          }
        }
      }
    })

    // กรณีที่ข้อมูล ID ต่างชื่อเหมือน ต้องไม่สามารถยิงข้อมูลเข้าไปได้
    const andInWhereForShipper: Prisma.groupWhereInput[] = [
      {
        user_type_id: 3,
      },
    ];
    // ช่วง shipper [startDate, endDate]; endDate ว่าง = ไม่มีวันสิ้นสุด
    // group [start_date, end_date]; end_date ว่าง = ไม่มีวันสิ้นสุด — ทับซ้อนเมื่อ group.end >= shipper.start และ group.start <= shipper.end
    const shipperRangeStart = shipper?.startDate ? dayjs(shipper.startDate) : null;
    const shipperRangeEnd = shipper?.endDate ? dayjs(shipper.endDate) : null;

    if (shipperRangeStart?.isValid() && shipper?.action === 'create') {
      andInWhereForShipper.push({
        OR: [
          { end_date: { gte: shipperRangeStart.toDate() } },
          { end_date: null },
        ],
      });

    }

    if (shipperRangeEnd?.isValid() && shipper?.action === 'create') {
      andInWhereForShipper.push({
        start_date: { lte: shipperRangeEnd.toDate() },
      });
    }
    // console.log('user : ', user);
    // console.log(user?.user_id && userId && user?.user_id !== String(userId));
    // console.log('user?.user_id : ', user?.user_id);
    // console.log('String(userId) : ', String(userId));
 

    if (user) {
      // มี email ในระบบ
      if (action === 'create' && !ignoreAction) {
        throw new HttpException(
          {
            status: {
              code: `E`,
              message: `มี email ในระบบแต่ (action = create)`
            }
          },
          HttpStatus.BAD_REQUEST
        )
      }

      if (user?.user_id && userId && user?.user_id !== String(userId)) {
        throw new HttpException(
          {
            status: {
              code: `E`,
              message: `มี email ในระบบแต่ user_id ไม่ตรง`
            }
          },
          HttpStatus.BAD_REQUEST
        )
      } else {
        // เช็ค shipper

        const shipper_ = await this.prisma.group.findFirst({
          where: {
            id_name: shipper?.ShipperCode,
            AND: andInWhereForShipper,
          },
          include: {
            role_default: true
          }
        })
        const shipperName_ = await this.prisma.group.findFirst({
          where: {
            name: shipper?.ShipperCode,
            AND: andInWhereForShipper,
          },
        })
        // console.log('shipper_ : ', shipper_);
        // console.log('andInWhereForShipper : ', andInWhereForShipper);
        if(!shipper_ ){
          const companyName = await this.prisma.group.findFirst({
            where: {
              company_name: shipper?.shipperName,
              AND: andInWhereForShipper,
            },
          })
          if(companyName){
              throw new HttpException(
                {
                  status: {
                    code: `E`,
                    message: `กรณีที่ข้อมูล Shipper ID ตรงกัน แต่ company ต่าง เช็คว่า company มีซ้ำในระบบถ้ามีแล้วไม่ได้ ต้องไม่สามารถยิงข้อมูลเข้าไปได้`,
                    key:[
                      `[ShipperCode] ลงที่ name, id_name`,
                      `[shipperName] ลงที่ company_name`,
                    ]
                  }
                },
                HttpStatus.BAD_REQUEST
              )
            }
        }
       
        if (shipperName_) {
          if (shipperName_?.id_name !== shipper?.ShipperCode) {
            throw new HttpException(
              {
                status: {
                  code: `E`,
                  message: `กรณีที่ข้อมูล Shipper ID ต่างชื่อเหมือน ต้องไม่สามารถยิงข้อมูลเข้าไปได้`
                }
              },
              HttpStatus.BAD_REQUEST
            )
          }
          if (shipperName_?.id_name === shipper?.ShipperCode && shipperName_?.company_name !== shipper?.shipperName) {
            // กรณี id_name name ตรง แต่ company ไม่เหมือนเดิม เช็คว่ามีในระบบยังถ้าซ้ำ ไม่ให้เอาเข้า
            const companyName = await this.prisma.group.findFirst({
                where: {
                  company_name: shipper?.shipperName,
                  AND: andInWhereForShipper,
                },
              })
              // console.log('companyName : ', companyName);
              if(companyName){
                throw new HttpException(
                  {
                    status: {
                      code: `E`,
                      message: `กรณีที่ข้อมูล Shipper ID ตรงกัน แต่ company ต่าง เช็คว่า company มีซ้ำในระบบถ้ามีแล้วไม่ได้ ต้องไม่สามารถยิงข้อมูลเข้าไปได้`,
                      key:[
                        `[ShipperCode] ลงที่ name, id_name`,
                        `[shipperName] ลงที่ company_name`,
                      ]
                    }
                  },
                  HttpStatus.BAD_REQUEST
                )
              }
          }
          
        }


        let groupId = shipper_?.id || null
        let roleId = null
        if (shipper_) {
          if (shipper?.action === 'create' && !ignoreAction) {
            throw new HttpException(
              {
                status: {
                  code: `E`,
                  message: `มี shipper ในระบบแต่ (action = create)`
                }
              },
              HttpStatus.BAD_REQUEST
            )
          }
          // มี shipper update
          if (shipper?.ShipperCode) {
            await this.prisma.group.updateMany({
              where: {
                id_name: shipper?.ShipperCode
              },
              data: {
                company_name: shipper?.shipperName,
                address: shipper?.address || null,
                telephone: shipper?.telephone || null,
                start_date: shipper?.startDate ? dayjs(shipper?.startDate).toDate() : null,
                end_date: shipper?.endDate ? dayjs(shipper?.endDate).toDate() : null,
                status: true,
                user_type_id: 3,
                active: true,
                update_date: dayjs().toDate(),
                update_date_num: dayjs().unix(),
                update_by: adminAccountId
              }
            })
          }
          roleId = shipper_?.role_default?.[0]?.role_id
        } else {
          if (shipper?.action === 'update' && !ignoreAction) {
            throw new HttpException(
              {
                status: {
                  code: `E`,
                  message: `มี shipper ในระบบแต่ (action = update)`
                }
              },
              HttpStatus.BAD_REQUEST
            )
          }
          
          // ไม่มี shipper create
          const CK_SHIPPER_SSO_DEFAULT_ROLE = await this.prisma.role.findFirst({
            where: {
              name: SHIPPER_SSO_DEFAULT
            },
            select: {
              id: true
            }
          })
          roleId = CK_SHIPPER_SSO_DEFAULT_ROLE?.id
          if (!CK_SHIPPER_SSO_DEFAULT_ROLE) {
            await this.prisma.$executeRawUnsafe(`
            SELECT setval(
                pg_get_serial_sequence('public.role','id'),
                COALESCE((SELECT MAX(id) FROM public.role), 0),
                true
            )
            `)
            const CREATE_TSO_SSO_DEFAULT_ROLE = await this.prisma.role.create({
              data: {
                name: SHIPPER_SSO_DEFAULT,
                user_type_id: 3,
                start_date: dayjs().toDate(),
                end_date: null,
                active: true
              }
            })
            roleId = CREATE_TSO_SSO_DEFAULT_ROLE?.id

            try {
              if(CREATE_TSO_SSO_DEFAULT_ROLE?.id){
                caa.createRoleInBackground({
                  name: SHIPPER_SSO_DEFAULT,
                  by: adminAccount?.email || process.env.CAA_SYSTEM_USER || 'tpasystem@pttplc.com',
                  extraXml: 'test no extra xml',
                });
              }
            } catch (error) {
              console.log('whenAddNewShipper createRoleInBackground error : ', error);
            }

            const menuMaster = await this.prisma.menus.findMany({
              orderBy: {
                id: 'asc'
              }
            })
            // create permission menu
            let menuConfig = []
            for (let i = 0; i < menuMaster.length; i++) {
              menuConfig.push({
                role_id: roleId,
                menus_id: menuMaster[i]?.id,
                parent: menuMaster[i]?.parent,
                seq: menuMaster[i]?.seq,
                f_view: menuMaster[i]?.tso_default_f_view,
                f_create: menuMaster[i]?.tso_default_f_create,
                f_edit: menuMaster[i]?.tso_default_f_edit,
                f_import: menuMaster[i]?.tso_default_f_import,
                f_export: menuMaster[i]?.tso_default_f_export,
                f_approved: menuMaster[i]?.tso_default_f_approved,
                f_noti_inapp: menuMaster[i]?.tso_default_f_noti_email,
                f_noti_email: menuMaster[i]?.tso_default_f_noti_inapp,
                b_manage: menuMaster[i]?.tso_default_b_manage
              })
            }
            await this.prisma.$executeRawUnsafe(`
            SELECT setval(
                pg_get_serial_sequence('public.menus_config','id'),
                COALESCE((SELECT MAX(id) FROM public.menus_config), 0),
                true
            )
            `)
            await this.prisma.menus_config.createMany({
              data: menuConfig
            })
          }
          await this.prisma.$executeRawUnsafe(`
                  SELECT setval(
                    pg_get_serial_sequence('public.group','id'),
                    COALESCE((SELECT MAX(id) FROM public.group), 0),
                    true
                  )
                `)
          const CREATE_SHIPPER_SSO_DEFAULT_GROUP = await this.prisma.group.create({
            data: {
              id_name: shipper?.ShipperCode,
              name: shipper?.ShipperCode,
              company_name: shipper?.shipperName,
              address: shipper?.address || null,
              telephone: shipper?.telephone || null,
              start_date: shipper?.startDate ? dayjs(shipper?.startDate).toDate() : null,
              end_date: shipper?.endDate ? dayjs(shipper?.endDate).toDate() : null,
              status: true,
              user_type_id: 3,
              active: true,
              create_date: dayjs().toDate(),
              create_date_num: dayjs().unix(),
              create_by: adminAccountId
              // division:[]
            }
          })
          groupId = CREATE_SHIPPER_SSO_DEFAULT_GROUP?.id

          await this.prisma.$executeRawUnsafe(`
                    SELECT setval(
                        pg_get_serial_sequence('public.role_default','id'),
                        COALESCE((SELECT MAX(id) FROM public.role_default), 0),
                        true
                    )
                    `)
          await this.prisma.role_default.create({
            data: {
              group_id: groupId,
              role_id: roleId
            }
          })
        }
        // ผูก user กับ shipper
        // create db
        let accountNew = {
          email: emailLower,
          f_t_and_c: null,
          start_date: startDate ? dayjs(startDate).toDate() : dayjs().toDate(),
          end_date: endDate ? dayjs(endDate).toDate() : null,
          detail: null,
          address: null,
          first_name: firstName || null,
          last_name: lastName || null,
          telephone: telephone || null,
          user_id: String(userId),
          status: true,
          account_manage: {
            mode_account_id: 1, // 2 = local // 1 = sso
            division_id: null,
            user_type_id: 3,
            group_id: groupId
          },
          role_manage: [
            {
              id: roleId
            }
          ]
        }

        const accountBeforeList = await this.prisma.account.findMany({
          where: {
            email: accountNew?.email
          },
          include: {
            account_manage: {
              include: {
                user_type: {
                  include: {
                    column_table_config: {
                      include: {
                        column_table: true,
                        column_field: true
                      }
                    }
                  }
                },
                mode_account: true,
                division: true,
                group: {
                  include: {
                    division: true
                  }
                },
                account_role: {
                  include: {
                    role: {
                      where: {
                        active: true
                      },
                      include: {
                        menus_config: {
                          include: {
                            menus: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            account_reason: {
              include: {
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
            },
            type_account: true,
            created_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            updated_by_account: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true
              }
            },
            login_logs: {
              select: {
                id: true,
                create_date: true
              },
              orderBy: {
                id: 'desc' // เรียง login_logs ตาม id ในลำดับที่ลดลง
              },
              take: 1
            }
          }
        })

        await this.prisma.account.updateMany({
          where: {
            email: accountNew?.email
          }, // ต้องเป็น unique field
          data: {
            start_date: accountNew?.start_date,
            end_date: accountNew?.end_date,
            first_name: accountNew?.first_name,
            last_name: accountNew?.last_name,
            telephone: accountNew?.telephone,
            status: true,
            type_account_id: 3, // 1 Manual | 2 PTT | 3 TPA WEBSITE
            update_date: dayjs().toDate(),
            update_date_num: dayjs().unix(),
            update_by: adminAccountId
          } // ถ้าเจออยู่แล้ว จะไม่อัปเดตอะไร (หรืออัปเดตบาง field ได้)
        })

        if (user?.id) {
          await this.prisma.account_manage.updateMany({
            where: {
              id: user?.account_manage?.[0]?.id ?? -1
            },
            data: {
              ...accountNew?.account_manage,
              update_date: dayjs().toDate(),
              update_date_num: dayjs().unix()
            }
          })

          if (accountNew?.role_manage.length > 0) {
            for (let i = 0; i < accountNew?.role_manage.length; i++) {
              if (!!user?.account_manage?.[0]?.account_role?.[0]?.id) {
                const res_create_account_role = await this.prisma.account_role.updateMany({
                  where: {
                    id: user?.account_manage?.[0]?.account_role?.[0]?.id || 0
                  },
                  data: {
                    account_manage_id: user?.account_manage?.[0]?.id,
                    role_id: accountNew?.role_manage[i]?.id,
                    update_date: dayjs().toDate(),
                    update_date_num: dayjs().unix()
                  }
                })
              } else {
                const res_create_account_role = await this.prisma.account_role.create({
                  data: {
                    account_manage_id: user?.account_manage?.[0]?.id,
                    role_id: accountNew?.role_manage[i]?.id,
                    create_date: dayjs().toDate(),
                    create_date_num: dayjs().unix()
                  }
                })
              }
            }
          }
          
          const accountAfter = await this.accountManageService.accountLocalGetSure(user.id);
          caa.syncUserRoleInBackground({
            account: accountAfter,
            by: adminAccount?.email || process.env.CAA_SYSTEM_USER || 'tpasystem@pttplc.com',
          });
        }

        try {
          accountBeforeList.map(async (accountBefore) => {
            const { password, ...newAccount } = accountBefore
            caa.syncUserRoleInBackground({
              account: newAccount,
              by: adminAccount?.email || process.env.CAA_SYSTEM_USER || 'tpasystem@pttplc.com',
            });
          })
        } catch (error) {
          console.log('whenAddNewShipper syncUserRoleInBackground error : ', error);
        }
      }
    } else {
      // ไม่มี email ในระบบ
      if (action === 'update' && !ignoreAction) {
        throw new HttpException(
          {
            status: {
              code: `E`,
              message: `ไม่มี email ในระบบแต่ (action = update)`
            }
          },
          HttpStatus.BAD_REQUEST
        )
      }

      const user_id = await this.prisma.account.findFirst({
        where: {
          user_id: String(userId)
        }
      })
      if (user_id) {
        throw new HttpException(
          {
            status: {
              code: `E`,
              message: `ไม่มี email ในระบบแต่ user_id มีในระบบแล้ว`
            }
          },
          HttpStatus.BAD_REQUEST
        )
      } else {
        // เช็ค shipper
        const shipper_ = await this.prisma.group.findFirst({
          where: {
            id_name: shipper?.ShipperCode,
            AND: andInWhereForShipper,
          },
          include: {
            role_default: true
          }
        })

        const shipperName = await this.prisma.group.findFirst({
          where: {
            name: shipper?.ShipperCode,
            AND: andInWhereForShipper,
          },
        })
        if (shipperName) {
          if (shipperName?.id_name !== shipper?.ShipperCode) {
            throw new HttpException(
              {
                status: {
                  code: `E`,
                  message: `กรณีที่ข้อมูล Shipper ID ต่างชื่อเหมือน ต้องไม่สามารถยิงข้อมูลเข้าไปได้`
                }
              },
              HttpStatus.BAD_REQUEST
            )
          }
        }

        let groupId = shipper_?.id || null
        let roleId = null
        if (shipper_) {
          if (shipper?.action === 'create' && !ignoreAction) {
            throw new HttpException(
              {
                status: {
                  code: `E`,
                  message: `มี shipper ในระบบแต่ (action = create)`
                }
              },
              HttpStatus.BAD_REQUEST
            )
          }
          // มี shipper update
          if (shipper?.ShipperCode) {
            await this.prisma.group.updateMany({
              where: {
                id_name: shipper?.ShipperCode
              },
              data: {
                company_name: shipper?.shipperName,
                address: shipper?.address || null,
                telephone: shipper?.telephone || null,
                start_date: shipper?.startDate ? dayjs(shipper?.startDate).toDate() : null,
                end_date: shipper?.endDate ? dayjs(shipper?.endDate).toDate() : null,
                status: true,
                user_type_id: 3,
                active: true,
                update_date: dayjs().toDate(),
                update_date_num: dayjs().unix(),
                update_by: adminAccountId
                // division:[]
              }
            })
          }
          roleId = shipper_?.role_default?.[0]?.role_id
        } else {
          if (shipper?.action === 'update' && !ignoreAction) {
            throw new HttpException(
              {
                status: {
                  code: `E`,
                  message: `มี shipper ในระบบแต่ (action = update)`
                }
              },
              HttpStatus.BAD_REQUEST
            )
          }

          // เงื่อนไขช่วง end_date ของ group เดิม: ยังไม่ปิด (null) หรือปิดหลังวันเริ่มของ shipper ใหม่
          // เพื่อไม่นับ group ที่หมดอายุไปแล้วก่อนช่วงที่จะสร้าง/อัปเดต
          const endDateOrCondition: Prisma.groupWhereInput[] = [
            {
              end_date: null
            }
          ]
          if (shipper?.startDate) {
            endDateOrCondition.push({
              end_date: {
                gte: dayjs(shipper?.startDate).toDate()
              }
            })
          }
          // หา group ประเภท shipper (user_type_id = 3) ที่ชื่อ/รหัสซ้ำกับ payload
          // จับคู่ได้ทั้ง ShipperCode (id_name), company_name หรือ name
          const andInWhere: Prisma.groupWhereInput[] = [
            {
              user_type_id: 3
            },
            {
              OR: [
                {
                  id_name: shipper?.ShipperCode
                },
                {
                  company_name: shipper?.shipperName
                },
                {
                  name: shipper?.ShipperCode
                }
              ]
            },
            {
              OR: endDateOrCondition
            }
          ]
          // ถ้ามี endDate ของ shipper ใหม่: group เดิมต้องเริ่มใช้งานไม่หลังวันสิ้นสุดนั้น
          // (ช่วงเวลาของ group เดิมต้องทับซ้อนกับช่วงที่ shipper ใหม่จะใช้ได้)
          if (shipper?.endDate) {
            andInWhere.push({
              start_date: {
                lte: dayjs(shipper?.endDate).toDate()
              }
            })
          }

          // ถ้าพบ record ที่ผ่านเงื่อนไขทั้งหมด = มี shipper ซ้ำในช่วงเวลาที่เกี่ยวข้อง
          const existShipperName = await this.prisma.group.findFirst({
            where: {
              AND: andInWhere
            },
            include: {
              role_default: true
            }
          })

          if (existShipperName) {
            throw new HttpException(
              {
                status: {
                  code: `E`,
                  message: `This shipperName has already been used.`
                }
              },
              HttpStatus.BAD_REQUEST
            )
          }

          // ไม่มี shipper create
          const CK_SHIPPER_SSO_DEFAULT_ROLE = await this.prisma.role.findFirst({
            where: {
              name: SHIPPER_SSO_DEFAULT
            },
            select: {
              id: true
            }
          })
          roleId = CK_SHIPPER_SSO_DEFAULT_ROLE?.id
          if (!CK_SHIPPER_SSO_DEFAULT_ROLE) {
            await this.prisma.$executeRawUnsafe(`
            SELECT setval(
                pg_get_serial_sequence('public.role','id'),
                COALESCE((SELECT MAX(id) FROM public.role), 0),
                true
            )
            `)
            const CREATE_TSO_SSO_DEFAULT_ROLE = await this.prisma.role.create({
              data: {
                name: SHIPPER_SSO_DEFAULT,
                user_type_id: 3,
                start_date: dayjs().toDate(),
                end_date: null,
                active: true
              }
            })
            roleId = CREATE_TSO_SSO_DEFAULT_ROLE?.id

            try {
              if(CREATE_TSO_SSO_DEFAULT_ROLE?.id){
                caa.createRoleInBackground({
                  name: SHIPPER_SSO_DEFAULT,
                  by: adminAccount?.email || process.env.CAA_SYSTEM_USER || 'tpasystem@pttplc.com',
                  extraXml: 'test no extra xml',
                });
              }
            } catch (error) {
              console.log('whenAddNewShipper createRoleInBackground error : ', error);
            }

            const menuMaster = await this.prisma.menus.findMany({
              orderBy: {
                id: 'asc'
              }
            })
            // create permission menu
            let menuConfig = []
            for (let i = 0; i < menuMaster.length; i++) {
              menuConfig.push({
                role_id: roleId,
                menus_id: menuMaster[i]?.id,
                parent: menuMaster[i]?.parent,
                seq: menuMaster[i]?.seq,
                f_view: menuMaster[i]?.tso_default_f_view,
                f_create: menuMaster[i]?.tso_default_f_create,
                f_edit: menuMaster[i]?.tso_default_f_edit,
                f_import: menuMaster[i]?.tso_default_f_import,
                f_export: menuMaster[i]?.tso_default_f_export,
                f_approved: menuMaster[i]?.tso_default_f_approved,
                f_noti_inapp: menuMaster[i]?.tso_default_f_noti_email,
                f_noti_email: menuMaster[i]?.tso_default_f_noti_inapp,
                b_manage: menuMaster[i]?.tso_default_b_manage
              })
            }
            await this.prisma.$executeRawUnsafe(`
            SELECT setval(
                pg_get_serial_sequence('public.menus_config','id'),
                COALESCE((SELECT MAX(id) FROM public.menus_config), 0),
                true
            )
            `)
            await this.prisma.menus_config.createMany({
              data: menuConfig
            })
          }
          await this.prisma.$executeRawUnsafe(`
                  SELECT setval(
                    pg_get_serial_sequence('public.group','id'),
                    COALESCE((SELECT MAX(id) FROM public.group), 0),
                    true
                  )
                `)
          const CREATE_SHIPPER_SSO_DEFAULT_GROUP = await this.prisma.group.create({
            data: {
              id_name: shipper?.ShipperCode,
              name: shipper?.ShipperCode,
              company_name: shipper?.shipperName,
              address: shipper?.address || null,
              telephone: shipper?.telephone || null,
              start_date: shipper?.startDate ? dayjs(shipper?.startDate).toDate() : null,
              end_date: shipper?.endDate ? dayjs(shipper?.endDate).toDate() : null,
              status: true,
              user_type_id: 3,
              active: true
            }
          })
          groupId = CREATE_SHIPPER_SSO_DEFAULT_GROUP?.id

          await this.prisma.$executeRawUnsafe(`
                    SELECT setval(
                        pg_get_serial_sequence('public.role_default','id'),
                        COALESCE((SELECT MAX(id) FROM public.role_default), 0),
                        true
                    )
                    `)
          await this.prisma.role_default.create({
            data: {
              group_id: groupId,
              role_id: roleId
            }
          })
        }
        // ผูก user กับ shipper

        await this.prisma.$executeRawUnsafe(`
        SELECT setval(
            pg_get_serial_sequence('public.account','id'),
            COALESCE((SELECT MAX(id) FROM public.account), 0),
            true
        )
        `)
        await this.prisma.$executeRawUnsafe(`
        SELECT setval(
            pg_get_serial_sequence('public.account_manage','id'),
            COALESCE((SELECT MAX(id) FROM public.account_manage), 0),
            true
        )
        `)
        // create db
        let accountNew = {
          email: emailLower,
          f_t_and_c: null,
          start_date: startDate ? dayjs(startDate).toDate() : dayjs().toDate(),
          end_date: endDate ? dayjs(endDate).toDate() : null,
          detail: null,
          address: null,
          first_name: firstName || null,
          last_name: lastName || null,
          telephone: telephone || null,
          user_id: String(userId),
          status: true,
          account_manage: {
            mode_account_id: 1, // 2 = local // 1 = sso
            division_id: null,
            user_type_id: 3,
            group_id: groupId
          },
          role_manage: [
            {
              id: roleId
            }
          ]
        }

        const account = await this.prisma.account.upsert({
          where: {
            email: accountNew?.email
          }, // ต้องเป็น unique field
          update: {}, // ถ้าเจออยู่แล้ว จะไม่อัปเดตอะไร (หรืออัปเดตบาง field ได้)
          create: {
            email: accountNew?.email,
            start_date: accountNew?.start_date,
            end_date: accountNew?.end_date,
            first_name: accountNew?.first_name,
            last_name: accountNew?.last_name,
            telephone: accountNew?.telephone,
            user_id: userId ? String(userId) : undefined,
            status: true,
            type_account_id: 3, // 1 Manual | 2 PTT | 3 TPA WEBSITE
            create_date: dayjs().toDate(),
            create_date_num: dayjs().unix(),
            create_by: adminAccountId
          },
          select: {
            id: true,
            email: true
          } // คืนเฉพาะที่ต้องการ
        })

        if (account?.id) {
          const accountManage = await this.prisma.account_manage.create({
            data: {
              account_id: account?.id,
              ...accountNew?.account_manage,
              create_date: dayjs().toDate(),
              create_date_num: dayjs().unix()
            }
          })

          if (accountNew?.role_manage.length > 0) {
            for (let i = 0; i < accountNew?.role_manage.length; i++) {
              const res_create_account_role = await this.prisma.account_role.create({
                data: {
                  account_manage_id: accountManage?.id,
                  role_id: accountNew?.role_manage[i]?.id,
                  create_date: dayjs().toDate(),
                  create_date_num: dayjs().unix()
                }
              })
            }
          }
          const accountAfter = await this.accountManageService.accountLocalGetSure(account.id);
          caa.syncUserRoleInBackground({
            account: accountAfter,
            by: adminAccount?.email || process.env.CAA_SYSTEM_USER || 'tpasystem@pttplc.com',
          });
        }
      }
    }

    return payload
  }
}
