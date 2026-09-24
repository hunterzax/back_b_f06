import axios from 'axios'
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger
} from '@nestjs/common'
import {PrismaService} from 'prisma/prisma.service'
import {JwtService} from '@nestjs/jwt'
import * as fs from 'fs'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as buddhistEra from 'dayjs/plugin/buddhistEra'
// import * as localizedFormat from 'dayjs/plugin/localizedFormat';

// import * as puppeteer from 'puppeteer';
import {Response} from 'express'

// const pdfMake = require('pdfmake/build/pdfmake');
// const pdfFonts = require('pdfmake/build/vfs_fonts');
// pdfMake.vfs = pdfFonts.vfs;
import * as pdfMake from 'pdfmake/build/pdfmake'
import * as isBetween from 'dayjs/plugin/isBetween'
import {
  getTodayEndAdd7,
  getTodayNow,
  getTodayNowAdd7,
  getTodayNowYYYYMMDDDfaultAdd7,
  getTodayStartAdd7,
  getYearEndAdd7,
  getYearStartAdd7
} from 'src/common/utils/date.util'
import * as archiver from 'archiver'
import * as nodemailer from 'nodemailer'
import JSZip from 'jszip'
import {parseToNumber} from 'src/common/utils/number.util'
import {uploadFilsTemp} from './uploadFileIn'
import {join} from 'path'

dayjs.extend(isBetween)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(
  customParseFormat
)
dayjs.extend(isSameOrAfter)
dayjs.extend(buddhistEra)

const logger = new Logger(
  'EmailPermissionUtil'
)

export async function emailGetpermissionEmailShipperGroupEmail(
  shipper: any,
  prisma: any,
  menus_id: any
) {
  // 1. Capacity Management ---> menu_id 49
  // 2. Planning --> menu_id 44
  // 3. Nomination --> menu_id 61
  // 4. Allocation --> menu_id 80
  // 5. Balancing --> menu_id 87
  // 6. Event --> menu_id 105

  const shipperGroupEmailArr =
    await prisma.group.findMany(
      {
        where: {
          id: {
            in: shipper
          }
        },
        select: {
          id: true,
          email: true
        },
        orderBy: {
          id: 'asc'
        }
      }
    )
  return shipperGroupEmailArr?.map(
    (e: any) => e?.email
  )
}

export async function emailGetpermissionEmailShipper(
  shipper: any,
  prisma: any,
  menus_id: any
) {
  // 1. Capacity Management ---> menu_id 49
  // 2. Planning --> menu_id 44
  // 3. Nomination --> menu_id 61
  // 4. Allocation --> menu_id 80
  // 5. Balancing --> menu_id 87
  // 6. Event --> menu_id 105
  const shipperEmailArr =
    await prisma.account.findMany(
      {
        where: {
          account_manage: {
            some: {
              group: {
                id: {
                  in: shipper
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
                          f_noti_email: 1
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
  return shipperEmailArr?.map(
    (e: any) => e?.email
  )
}

export async function emailGetpermissionEmailTSO(
  prisma: any,
  menus_id: any
) {
  // 1. Capacity Management ---> menu_id 49
  // 2. Planning --> menu_id 44
  // 3. Nomination --> menu_id 61
  // 4. Allocation --> menu_id 80
  // 5. Balancing --> menu_id 87
  // 6. Event --> menu_id 105
  const tsoEmailArr =
    await prisma.account.findMany(
      {
        where: {
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
                          f_noti_email: 1
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
  return tsoEmailArr?.map(
    (e: any) => e?.email
  )
}

export async function emailGetpermissionEmail(
  prisma: any,
  menus_id: any
) {
  // 1. Capacity Management ---> menu_id 49
  // 2. Planning --> menu_id 44
  // 3. Nomination --> menu_id 61
  // 4. Allocation --> menu_id 80
  // 5. Balancing --> menu_id 87
  // 6. Event --> menu_id 105
  const shipperEmailArr =
    await prisma.account?.findMany(
      {
        where: {
          account_manage: {
            some: {
              account_role: {
                some: {
                  role: {
                    menus_config:
                      {
                        some: {
                          menus_id:
                            Number(
                              menus_id
                            ),
                          f_noti_email: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          email: true
        }
      }
    )
  return shipperEmailArr?.map(
    (e: any) => e?.email
  )
}

export async function emailGetpermissionEmailByGroupName(
  prisma: any,
  menus_id: any,
  name: any
) {
  // 1. Capacity Management ---> menu_id 49
  // 2. Planning --> menu_id 44
  // 3. Nomination --> menu_id 61
  // 4. Allocation --> menu_id 80
  // 5. Balancing --> menu_id 87
  // 6. Event --> menu_id 105
  const shipperEmailArr =
    await prisma.account?.findMany(
      {
        where: {
          account_manage: {
            some: {
              group: {
                name: name
              },
              account_role: {
                some: {
                  role: {
                    menus_config:
                      {
                        some: {
                          menus_id:
                            Number(
                              menus_id
                            ),
                          f_noti_email: 1
                        }
                      }
                  }
                }
              }
            }
          }
        },
        select: {
          email: true
        }
      }
    )
  return shipperEmailArr?.map(
    (e: any) => e?.email
  )
}

export async function emailNotificationDAM(
  prisma: any = null,
  activity_id: any = 0
) {
  const find =
    await prisma?.email_notification_management?.findFirst(
      {
        where: {
          active: true,
          activity_id: Number(
            activity_id
          )
        }
      }
    )
  return find
}

export async function sendEmailProviderCustomDocs({
  cc,
  header,
  subject,
  sendEmail,
  detail,
  excelBuffer,
  tagHTMLDetail,
  filename,
  contentType
}: any) {
  try {
    const transporter =
      await nodemailer.createTransport(
        {
          host: process.env
            .SMTP_HOST,
          port: Number(
            process.env
              .SMTP_PORT
          ),
          secure: false,
          auth: {
            user: process.env
              .SMTP_USER,
            pass: process.env
              .SMTP_PASS
          },
          tls: {
            rejectUnauthorized: false // Ignore self-signed certificates
          }
        }
      )

    const info =
      await transporter.sendMail(
        {
          from: `<${process.env.SMTP_USER}>`,
          to: sendEmail,
          cc: cc || [],
          // bcc: [],
          subject:
            subject || '',
          // attachments: excelBuffer,
          attachments:
            (excelBuffer && [
              {
                filename:
                  filename,
                // content: responseUpFile?.file?.url,
                content:
                  excelBuffer,
                contentType:
                  contentType
              },
              {
                filename:
                  'logo-ptt.png',
                path: join(
                  process.cwd(),
                  'public',
                  'img/logo-ptt.png'
                ),
                cid: 'logoPtt'
              },
              {
                filename:
                  'email-img.png',
                path: join(
                  process.cwd(),
                  'public',
                  'img/email-img.png'
                ),
                cid: 'emailImg'
              }
            ]) || [
              {
                filename:
                  'logo-ptt.png',
                path: join(
                  process.cwd(),
                  'public',
                  'img/logo-ptt.png'
                ),
                cid: 'logoPtt'
              },
              {
                filename:
                  'email-img.png',
                path: join(
                  process.cwd(),
                  'public',
                  'img/email-img.png'
                ),
                cid: 'emailImg'
              }
            ],
          html: `<!DOCTYPE html>
                <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Document</title>
                    </head>
                    <body>
                        <div 
                            style="width: 500px; 
                            border: 1px solid #D6D6D6; 
                            height: auto; 
                            border-radius: 15px;
                            margin: 10px auto;
                            padding: 15px;"
                        >
                            <div
                                style="display: flex;
                                margin-bottom: 50px;"
                            >
                                <img
                                    src="cid:logoPtt"
                                    alt="logo-ptt"
                                    style="margin: 0 auto; width: 120px; object-fit: contain;"
                                />
                            </div>
                            <div
                                style="display: flex;
                                margin-bottom: 40px;"
                            >
                                <img
                                    src="cid:emailImg"
                                    alt="img-email"
                                    style="margin: 0 auto; object-fit: contain;"
                                />
                            </div>
                            <div
                                style="text-align: center;
                                font-size: 20px;
                                font-weight: 700;"
                            >
                                ${header || '-'}
                            </div>
                             <div
                                style="line-height: 40px;
                                margin-top: 20px;
                                text-align: left;
                                font-size: 15px;
                                "
                            >
                                <div>
                                ${tagHTMLDetail}
                                </div>
                            </div>
                          
                            <div style="margin-top: 30px; font-size: 15px;">
                                <div style="text-align: center;">
                                    Thank You,
                                </div>
                                <div style="text-align: center;">
                                    TPA, Systems
                                </div>
                            </div>
                            <div style="margin-top: 40px; text-align: center; font-size: 14px;">
                                <span>If you did not initiate this request, please contact us immediately at </span>
                                <a href="#">support@ptt.com.</a>
                            </div>
                        </div>
                    </body>
                </html>`
        }
      )

    return info
  } catch (error) {
    logger.error(
      'error : ',
      error
    )
  }
}
