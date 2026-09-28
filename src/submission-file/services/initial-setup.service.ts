import {Injectable, Logger} from '@nestjs/common'
import {PrismaService} from '../../../prisma/prisma.service'
import {getTodayStartAdd7, getTodayEndAdd7, getTodayNowAdd7} from '../../common/utils/date.util'

export interface InitialSetupResult {
  todayStart: Date
  todayEnd: Date
  nowAts: any
  gAuserType: any
  zoneQualityMaster: any
}

@Injectable()
export class InitialSetupService {
  private readonly logger = new Logger(InitialSetupService.name)
  constructor(private readonly prisma: PrismaService) {}

  /**
   * STEP 1: INITIAL SETUP - ตั้งค่าเริ่มต้นและดึงข้อมูล user group
   * @param userId - ID ของผู้ใช้
   * @returns InitialSetupResult - ข้อมูลที่ตั้งค่าเริ่มต้น
   */
  async executeInitialSetup(userId: number): Promise<InitialSetupResult> {
    try {
      // Get current date ranges for validation (with 7-day offset)
      const todayStart = getTodayStartAdd7().toDate()
      const todayEnd = getTodayEndAdd7().toDate()
      const nowAts = getTodayNowAdd7()

      // Get user group information for permission checking
      const gAuserType = await this.prisma.group.findFirst({
        where: {
          account_manage: {
            some: {
              account_id: Number(userId)
            }
          }
        }
      })

      this.logger.log('STEP 1: INITIAL SETUP completed successfully')

      const zoneQualityMaster = await this.prisma.zone.findMany({
        where: {
          AND: [
            {
              start_date: {
                lte: todayEnd // start_date ต้องก่อนหรือเท่ากับสิ้นสุดวันนี้
              }
            },
            {
              OR: [
                {
                  end_date: null
                }, // ถ้า end_date เป็น null
                {
                  end_date: {
                    gte: todayStart
                  }
                } // ถ้า end_date ไม่เป็น null ต้องหลังหรือเท่ากับเริ่มต้นวันนี้
              ]
            }
          ]
        },
        include: {
          zone_master_quality: true,
          contract_point: true
        }
      })

      return {
        todayStart,
        todayEnd,
        nowAts,
        gAuserType,
        zoneQualityMaster
      }
    } catch (error) {
      this.logger.error('Error in STEP 1: INITIAL SETUP:', error)
      throw error
    }
  }
}
