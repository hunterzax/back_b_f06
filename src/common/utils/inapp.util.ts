import axios from 'axios'
import {parseToNumber} from './number.util'

// shipper ที่ติ้กจาก shipper id ที่ส่งมา และ อื่นๆที่ติ้ก
export async function middleNotiInappShipper(
  prisma: any,
  type: any,
  message: any,
  menus_id: number,
  priority?: number,
  shipperId?: number
) {
  const adminAccountId =
    parseToNumber(
      process.env
        .SYSTEM_ACCOUNT_ID
    ) ?? 1
  // return
  const SHIPPERroleMenuAllocationManagementNoticeInapp =
    await prisma.account.findMany(
      {
        where: {
          OR: [
            { status: true },
            { status: null}
          ],
          account_manage: {
            some: {
              group: {
                id: shipperId
              },
              account_role: {
                some: {
                  role: {
                    menus_config:
                      {
                        some: {
                          menus_id:
                            menus_id ||
                            0,
                          f_noti_inapp: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          telephone: true,
          account_manage: {
            include: {
              account_role: {
                include: {
                  role: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    )

  const roleMenuAllocationManagementNoticeInapp =
    await prisma.account.findMany(
      {
        where: {
          id: {
            not: adminAccountId
          },
          OR: [
            { status: true },
            { status: null}
          ],
          account_manage: {
            some: {
              account_role: {
                some: {
                  role: {
                    user_type:
                      {
                        id: {
                          notIn:
                            [
                              3
                            ]
                        }
                      },
                    menus_config:
                      {
                        some: {
                          menus_id:
                            menus_id ||
                            0,
                          f_noti_inapp: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          telephone: true,
          account_manage: {
            include: {
              account_role: {
                include: {
                  role: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    )

  const emailArrShipper =
    SHIPPERroleMenuAllocationManagementNoticeInapp?.map(
      (e: any) => e?.email
    )
  const emailArr =
    roleMenuAllocationManagementNoticeInapp?.map(
      (e: any) => e?.email
    )
  const email_ = [
    ...emailArrShipper,
    ...emailArr
  ]
  // const email_ = [ ...emailArrShipper, ...emailArr,  ]
  if (email_?.length > 0) {
    await providerNotiInapp(
      type,
      message,
      email_,
      priority,
      menus_id,
      prisma
    )
  }
}
export async function middleNotiInappShipperMulti(
  prisma: any,
  type: any,
  message: any,
  menus_id: number,
  priority?: number,
  shipperId?: any
) {
  const adminAccountId =
    parseToNumber(
      process.env
        .SYSTEM_ACCOUNT_ID
    ) ?? 1
  // return
  const SHIPPERroleMenuAllocationManagementNoticeInapp =
    await prisma.account.findMany(
      {
        where: {
          OR: [
            { status: true },
            { status: null}
          ],
          account_manage: {
            some: {
              group: {
                id: {
                  in: shipperId
                }
              },
              account_role: {
                some: {
                  role: {
                    menus_config:
                      {
                        some: {
                          menus_id:
                            menus_id ||
                            0,
                          f_noti_inapp: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          telephone: true,
          account_manage: {
            include: {
              account_role: {
                include: {
                  role: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    )

  const roleMenuAllocationManagementNoticeInapp =
    await prisma.account.findMany(
      {
        where: {
          id: {
            not: adminAccountId
          },
          OR: [
            { status: true },
            { status: null}
          ],
          account_manage: {
            some: {
              account_role: {
                some: {
                  role: {
                    user_type:
                      {
                        id: {
                          notIn:
                            [
                              3
                            ]
                        }
                      },
                    menus_config:
                      {
                        some: {
                          menus_id:
                            menus_id ||
                            0,
                          f_noti_inapp: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          telephone: true,
          account_manage: {
            include: {
              account_role: {
                include: {
                  role: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    )

  const emailArrShipper =
    SHIPPERroleMenuAllocationManagementNoticeInapp?.map(
      (e: any) => e?.email
    )
  const emailArr =
    roleMenuAllocationManagementNoticeInapp?.map(
      (e: any) => e?.email
    )
  const email_ = [
    ...emailArrShipper,
    ...emailArr
  ]
  // const email_ = [ ...emailArrShipper, ...emailArr,  ]
  if (email_?.length > 0) {
    await providerNotiInapp(
      type,
      message,
      email_,
      priority,
      menus_id,
      prisma
    )
  }
}

// shipper ที่ติ้กจาก shipper id ที่ส่งมา
export async function middleNotiInappShipperonly(
  prisma: any,
  type: any,
  message: any,
  menus_id: number,
  priority?: number,
  shipperId?: number
) {
  // return
  const SHIPPERroleMenuAllocationManagementNoticeInapp =
    await prisma.account.findMany(
      {
        where: {
          OR: [
            { status: true },
            { status: null}
          ],
          account_manage: {
            some: {
              group: {
                id: shipperId
              },
              account_role: {
                some: {
                  role: {
                    menus_config:
                      {
                        some: {
                          menus_id:
                            menus_id ||
                            0,
                          f_noti_inapp: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          telephone: true,
          account_manage: {
            include: {
              account_role: {
                include: {
                  role: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    )

  const emailArrShipper =
    SHIPPERroleMenuAllocationManagementNoticeInapp?.map(
      (e: any) => e?.email
    )
  const email_ = [
    ...emailArrShipper
  ]
  // const email_ = [ ...emailArrShipper, ...emailArr,  ]
  if (email_?.length > 0) {
    await providerNotiInapp(
      type,
      message,
      email_,
      priority,
      menus_id,
      prisma
    )
  }
}

// tso ที่ติ้ก เท่่านั้น
export async function middleNotiInappTSOonly(
  prisma: any,
  type: any,
  message: any,
  menus_id: number,
  priority?: number,
  shipperId?: number
) {
  const adminAccountId =
    parseToNumber(
      process.env
        .SYSTEM_ACCOUNT_ID
    ) ?? 1

  const TSOroleMenuAllocationManagementNoticeInapp =
    await prisma.account.findMany(
      {
        where: {
          id: {
            not: adminAccountId
          },
          OR: [
            { status: true },
            { status: null}
          ],
          account_manage: {
            some: {
              account_role: {
                some: {
                  role: {
                    user_type_id: 2,
                    menus_config:
                      {
                        some: {
                          menus_id:
                            menus_id ||
                            0,
                          f_noti_inapp: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          telephone: true,
          account_manage: {
            include: {
              account_role: {
                include: {
                  role: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    )

  const emailArrTSO =
    TSOroleMenuAllocationManagementNoticeInapp?.map(
      (e: any) => e?.email
    )
  const email_ = [
    ...emailArrTSO
  ]
  if (email_?.length > 0) {
    await providerNotiInapp(
      type,
      message,
      email_,
      priority,
      menus_id,
      prisma
    )
  }
}

// ทั้งหมดที่ติ้กไม่สน type
export async function middleNotiInappMenuArr(
  prisma: any,
  type: any,
  message: any,
  menus_id: any,
  priority?: number,
  menu_name?: string
) {
  const adminAccountId =
    parseToNumber(
      process.env
        .SYSTEM_ACCOUNT_ID
    ) ?? 1
  // return
  const roleMenuAllocationManagementNoticeInapp =
    await prisma.account.findMany(
      {
        where: {
          id: {
            not: adminAccountId
          },
          OR: [
            { status: true },
            { status: null}
          ],
          account_manage: {
            some: {
              account_role: {
                some: {
                  role: {
                    // user_type_id: 2,
                    menus_config:
                      {
                        some: {
                          // menus_id: menus_id || 0,
                          menus:
                            {
                              id: {
                                in: menus_id
                              }
                            },
                          f_noti_inapp: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          telephone: true,
          account_manage: {
            include: {
              account_role: {
                include: {
                  role: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    )

  const nAccount =
    roleMenuAllocationManagementNoticeInapp?.map(
      (e: any) => {
        const {
          account_manage,
          ...nE
        } = e
        const role =
          account_manage?.[0]
            ?.account_role?.[0]
            ?.role?.name ||
          null
        return {
          ...nE,
          role_name:
            role || null
        }
      }
    )
  const emailArr = [
    ...new Set(
      nAccount?.map(
        (e: any) => e?.email
      )
    )
  ]
  if (emailArr?.length > 0) {
    await providerNotiInapp(
      type,
      message,
      emailArr,
      priority,
      menus_id,
      prisma,
      menu_name
    )
  }
}

// ทั้งหมดที่ติ้กไม่สน type
export async function middleNotiInapp(
  prisma: any,
  type: any,
  message: any,
  menus_id: number,
  priority?: number
) {
  const adminAccountId =
    parseToNumber(
      process.env
        .SYSTEM_ACCOUNT_ID
    ) ?? 1
  // return
  const roleMenuAllocationManagementNoticeInapp =
    await prisma.account.findMany(
      {
        where: {
          id: {
            not: adminAccountId
          },
          OR: [
            { status: true },
            { status: null}
          ],
          account_manage: {
            some: {
              account_role: {
                some: {
                  role: {
                    // user_type_id: 2,
                    menus_config:
                      {
                        some: {
                          menus_id:
                            menus_id ||
                            0,
                          f_noti_inapp: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          telephone: true,
          account_manage: {
            include: {
              account_role: {
                include: {
                  role: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    )

  const nAccount =
    roleMenuAllocationManagementNoticeInapp?.map(
      (e: any) => {
        const {
          account_manage,
          ...nE
        } = e
        const role =
          account_manage?.[0]
            ?.account_role?.[0]
            ?.role?.name ||
          null
        return {
          ...nE,
          role_name:
            role || null
        }
      }
    )
  const emailArr =
    nAccount?.map(
      (e: any) => e?.email
    )
  if (emailArr?.length > 0) {
    await providerNotiInapp(
      type,
      message,
      emailArr,
      priority,
      menus_id,
      prisma
    )
  }
}

export async function providerNotiInapp(
  type: any,
  message: any,
  email: any,
  priority: number,
  menus_id: any,
  prisma: any,
  menu_name?: string
) {
  try {
    let menuName = undefined
    let menuList = undefined
    if (
      menus_id &&
      Array.isArray(menus_id)
    ) {
      menuList =
        await prisma.menus.findMany(
          {
            where: {
              id: {
                in: menus_id.map(
                  Number
                )
              }
            },
            select: {
              name: true
            }
          }
        )
      menuName = menu_name
        ? {name: menu_name}
        : undefined
    } else if (
      `${menus_id}`.includes(
        ','
      )
    ) {
      menuList =
        await prisma.menus.findMany(
          {
            where: {
              id: {
                in: menus_id
                  .split(',')
                  .map(Number)
              }
            },
            select: {
              name: true
            }
          }
        )
      menuName = menu_name
        ? {name: menu_name}
        : undefined
    } else {
      menuName =
        await prisma.menus.findFirst(
          {
            where: {
              id: Number(
                menus_id || 0
              )
            },
            select: {
              name: true
            }
          }
        )
    }
    let data = JSON.stringify(
      {
        extras: {
          email: email, // []
          menus_id: menus_id,
          menus_name:
            menuName?.name,
          menus_list:
            menuList?.map(
              (e: any) =>
                e?.name
            )
        },
        message:
          message || '', // msg
        priority:
          priority || 1,
        title: type || '' // module
      }
    )

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `http://${process.env.IN_APP_URL}/message`,
      headers: {
        'Content-Type':
          'application/json',
        // 'X-Gotify-Key': process.env.IN_APP_URL_TOKEN,
        Authorization: `Bearer ${process.env.IN_APP_URL_TOKEN}`
      },
      data: data
    }

    const sendData =
      await axios.request(
        config
      )
    return sendData
  } catch (error) {}
}

// https://docs.google.com/spreadsheets/d/18l5P9ldPdZdxG8XjZsOOWlS-ffNYMg7OwkVJS87ayl8/edit?gid=2007651369#gid=2007651369
// (รอเส้นจริงมา) DAM>Admintration // Division Master // Division was synced at {sync_time} // ได้รับทุกคนที่ถูก Check Box Notice Inapp (Role Management) ในเมนู Division Master
// (เสร็จ) DAM>Parameter // Zone // Area // Customer Type // Contract Point // Nomination Point // Metered Point // Concept Point // NON TPA Point // Config Master Path
// - capacity right template // Planning Deadline // Nomination Deadline // Email Management // Email Group For Event // System Parameter // Allocation Mode // HV for Operation Flow and Instructed Flow
// - user guide // metering checking condition // Terms & Condition

// await middleNotiInapp(
//       this.prisma,
//       'DAM',
//       `${his?.contract_point} was created active from ${getTodayNowAdd7(his?.contract_point_start_date).format('YYYY-MM-DD')} to ${(his?.contract_point_end_date && getTodayNowAdd7(his?.contract_point_end_date).format('YYYY-MM-DD')) || '-'}`,
//       23, // contract point menus_id
//       1,
//     );
