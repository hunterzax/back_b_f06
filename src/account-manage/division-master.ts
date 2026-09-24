import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { PIS } from 'src/common/utils/pis.util';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

const PIS_DIVISION_SYNC_FAILED = 'Unable to sync division from PIS, please contact Admin.';
const PIS_DIVISION_DATA_NOT_FOUND = 'Division data is not found in PIS, please contact Admin.';

@Injectable()
export class AccountManageDivisionMasterService {
  constructor(
    private prisma: PrismaService
  ) { }

  async divisionMaster() {
    const divisionMaster =
      await this.prisma.division.findMany(
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
          }
        }
      )
    return divisionMaster
  }

  async divisionNotUse() {
    // เดิมโรงงาน
    // const divisionNotUse = await this.prisma.division.findMany({
    //   include: {
    //     create_by_account: {
    //       select: {
    //         id: true,
    //         email: true,
    //         first_name: true,
    //         last_name: true,
    //       },
    //     },
    //     update_by_account: {
    //       select: {
    //         id: true,
    //         email: true,
    //         first_name: true,
    //         last_name: true,
    //       },
    //     },
    //   },
    //   where: {
    //     group_id: null,
    //   },
    //   orderBy: {
    //     id: 'asc',
    //   },
    // });

    // v1.0.90 การเลือก Division หาก Group เดิม End Date แล้ว Group ที่ Create ใหม่ต้องกลับมาเลือก Division เดิมได้
    const now = dayjs().tz("Asia/Bangkok").endOf("day").toDate();
    const divisionNotUse = await this.prisma.division.findMany({
      include: {
        create_by_account: { select: { id: true, email: true, first_name: true, last_name: true } },
        update_by_account: { select: { id: true, email: true, first_name: true, last_name: true } },
        // group: true
      },
      where: {
        OR: [
          // ยังไม่ผูก group
          { group_id: null },

          // group หมดอายุ (ใช้ is:)
          {
            AND: [
              { group_id: { not: null } },
              { group: { is: { end_date: { lt: now } } } },
            ],
          },
        ],
      },
      orderBy: { id: "asc" },
    });

    return divisionNotUse
  }

  async divisionNotUseWayEdit(
    id: any
  ) {
    const divisionNotUse =
      await this.prisma.division.findMany(
        {
          where: {
            OR: [
              {
                group_id: null
              },
              {
                group_id:
                  Number(id)
              }
            ]
          },
          orderBy: {
            id: 'asc'
          }
        }
      )
    return divisionNotUse
  }

  async divisionSync(payload: any, userId: any) {
    const syncSource = 'pis';
    if (Array.isArray(payload?.data)) {
      console.log(`[INFO][divisionSync]: ignored frontend payload data row_count=${payload.data.length} requester=${userId ?? 'unknown'}`);
    }
    const data = await this.resolveDivisionSyncData();
    console.log(`[INFO][divisionSync]: source=${syncSource} row_count=${data.length}`);

    let skippedCount = 0;
    let upsertCount = 0;
    for (let i = 0; i < data.length; i++) {
      const raw = data[i];
      const division_id = String(raw?.unitcode ?? '').trim();
      if (!division_id) {
        skippedCount++;
        continue;
      }

      await this.prisma.division.upsert({
        where: { division_id },
        update: {
          division_name: String(raw?.unitname ?? ''),
          division_short_name: String(raw?.unitabbr ?? ''),
        },
        create: {
          division_id,
          division_name: String(raw?.unitname ?? ''),
          division_short_name: String(raw?.unitabbr ?? ''),
          create_date: new Date(),
        },
      });
      upsertCount++;
    }

    console.log(`[INFO][divisionSync]: source=${syncSource} upsert_count=${upsertCount} skipped_empty_unitcode=${skippedCount}`);

    if (upsertCount === 0) {
      console.log(`[ERROR][divisionSync]: no division rows upserted source=${syncSource} skipped_empty_unitcode=${skippedCount}`);
      throw this.divisionSyncBadRequest(PIS_DIVISION_DATA_NOT_FOUND);
    }

    return `success`
  }

  private async resolveDivisionSyncData() {
    try {
      console.log(`[INFO][resolveDivisionSyncData]: request PIS SearchUnit`);
      const pis = new PIS();
      const rows = await pis.getSearchUnitEntries();
      return this.ensureDivisionRows(rows, 'pis');
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      const status = error?.response?.status || 'unknown';
      const message = error?.message || 'unknown';
      console.log(`[ERROR][resolveDivisionSyncData]: PIS SearchUnit request failed status=${status} message=${message}`);
      throw this.divisionSyncBadRequest(PIS_DIVISION_SYNC_FAILED);
    }
  }

  private ensureDivisionRows(rows: any[], source: string) {
    if (!rows?.length) {
      console.log(`[ERROR][ensureDivisionRows]: division data not found source=${source}`);
      throw this.divisionSyncBadRequest(PIS_DIVISION_DATA_NOT_FOUND);
    }

    return rows;
  }

  private divisionSyncBadRequest(message: string) {
    return new HttpException(
      {
        status: HttpStatus.BAD_REQUEST,
        error: message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
