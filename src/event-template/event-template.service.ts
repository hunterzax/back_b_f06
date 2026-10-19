import {Injectable} from '@nestjs/common'
import {CreateEventTemplateDto} from './dto/create-event-template.dto'
import {UpdateEventTemplateDto} from './dto/update-event-template.dto'

import {PrismaService} from 'prisma/prisma.service'
import {JwtService} from '@nestjs/jwt'
import * as fs from 'fs'
import * as customParseFormat from 'dayjs/plugin/customParseFormat'
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as buddhistEra from 'dayjs/plugin/buddhistEra'

import {Response} from 'express'
import * as isBetween from 'dayjs/plugin/isBetween'
import {getTodayEndAdd7, getTodayNow, getTodayNowAdd7, getTodayNowYYYYMMDDDfaultAdd7, getTodayStartAdd7, getYearEndAdd7, getYearStartAdd7} from 'src/common/utils/date.util'

dayjs.extend(isBetween)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)
dayjs.extend(isSameOrAfter)
dayjs.extend(buddhistEra)

@Injectable()
export class EventTemplateService {
  constructor(private prisma: PrismaService) {}

  async findAll({userId}: any) {
    const dataDB = await this.prisma.event_template.findMany({
      where: {del_flag: false},
      include: {
        event_doc_master: true,
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
    })
    return dataDB
  }

  async findAllHistory({userId, id}: any) {
    const dataDB = await this.prisma.event_template_history.findMany({
      where: {event_template_id: Number(id ?? -1)},
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
      },
      orderBy: {id: 'desc'}
    })
    console.log('id : ', id);
    console.log('dataDB : ', dataDB);
    return dataDB
  }

  async findDoc({userId, id}: any) {
    const dataDB = await this.prisma.event_template.findMany({
      where: {del_flag: false, event_doc_master_id: Number(id ?? -1)},
      include: {
        event_doc_master: true,
        event_template_history: {
          take: 1,
          orderBy: {
            id: 'desc'
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
    })
    console.log('id : ', id);
    console.log('dataDB : ', dataDB);
    return dataDB
  }

  async findOnce({userId, id}: any) {
    const dataDB = await this.prisma.event_template.findFirst({
      where: {id: Number(id ?? -1)},
      include: {
        event_doc_master: true,
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
    })
    return dataDB
  }

  async create({userId, payload}: any) {
    console.log('payload : ', payload)
    const {event_doc_master_id, template_data, template_name} = payload
    const create = await this.prisma.event_template.create({
      data: {
        template_name: template_name,
        template_data: template_data,
        event_doc_master: {
          connect: {
            id: Number(event_doc_master_id ?? -1) || -1
          }
        },
        active: true,
        create_date: getTodayNowAdd7().toDate(),
        create_by_account: {
          connect: {
            id: Number(userId ?? -1) || -1
          }
        },
        update_date: getTodayNowAdd7().toDate(),
        update_by_account: {
          connect: {
            id: Number(userId ?? -1) || -1
          }
        }
      },
      select: {
        id: true
      }
    })
    try {
      await this.prisma.event_template_history.create({
        data: {
          template_name: template_name,
          template_data: template_data,
          event_template: {
            connect: {
              id: create.id ?? -1
            }
          },
          create_date: getTodayNowAdd7().toDate(),
          create_by_account: {
            connect: {
              id: Number(userId ?? -1) || -1
            }
          },
          update_date: getTodayNowAdd7().toDate(),
          update_by_account: {
            connect: {
              id: Number(userId ?? -1) || -1
            }
          }
        },
        select: {
          id: true
        }
      })
    } catch (error) {}

    return create
  }

  async update({userId, payload, id}: any) {
    console.log('payload : ', payload)
    console.log('id : ', id)
    const {template_data, template_name} = payload
    const update = await this.prisma.event_template.updateMany({
      where: {id: Number(id ?? -1)},
      data: {
        template_data: template_data,
        update_date: getTodayNowAdd7().toDate(),
        update_by: Number(userId ?? -1) || -1
      }
    })
    try {
      await this.prisma.event_template_history.create({
        data: {
          template_name: template_name,
          template_data: template_data,
          event_template: {
            connect: {
              id: Number(id ?? -1)
            }
          },
          create_date: getTodayNowAdd7().toDate(),
          create_by_account: {
            connect: {
              id: Number(userId ?? -1) || -1
            }
          },
          update_date: getTodayNowAdd7().toDate(),
          update_by_account: {
            connect: {
              id: Number(userId ?? -1) || -1
            }
          }
        },
        select: {
          id: true
        }
      })
    } catch (error) {}

    return {id}
  }

  async delete({userId, id}: any) {
    const dataDB = await this.prisma.event_template.updateMany({
      where: {id: Number(id ?? -1)},
      data: {
        del_flag: true
      }
    })
    return dataDB
  }

  async active({userId, id}: any) {
    const dataDB_ = await this.prisma.event_template.findFirst({
      where: {id: Number(id ?? -1)},
      select: {active: true}
    })
    const dataDB = await this.prisma.event_template.updateMany({
      where: {id: Number(id ?? -1)},
      data: {
        active: !dataDB_.active
      }
    })
    return dataDB
  }
}
