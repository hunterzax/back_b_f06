import { forwardRef, HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  getTodayEndAdd7,
  getTodayEndYYYYMMDDDfaultAdd7,
  getTodayNow,
  getTodayNowAdd7,
  getTodayStartAdd7,
  getTodayStartYYYYMMDDDfaultAdd7,
  getWeekRange,
} from 'src/common/utils/date.util';
import * as dayjs from 'dayjs';
import * as customParseFormat from 'dayjs/plugin/customParseFormat';
import axios from 'axios';
import { AdjEvent, AstosRepository } from './astos.repository';
import { AstosUtils } from './astos.utils';
import {
  middleNotiInapp,
  middleNotiInappMenuArr,
} from 'src/common/utils/inapp.util';
import { PrismaService } from '@prisma/prisma.service';
import { getIntradayBaseInentoryFromWebService } from 'src/common/utils/balancing.util';
import { MeteredMicroService } from 'src/grpc/metered-service.service';
import { isMatch } from 'src/common/utils/allocation.util';
import { parseToNumber } from 'src/common/utils/number.util';
import { AllocationService } from 'src/allocation/allocation.service';

dayjs.extend(customParseFormat);

@Injectable()
export class AstosService {
  private readonly logger = new Logger(AstosService.name);
  constructor(
    private readonly repo: AstosRepository,
    private readonly utils: AstosUtils,
    private prisma: PrismaService,
    private readonly meteredMicroService: MeteredMicroService,
    @Inject(forwardRef(() => AllocationService))
    private readonly allocationService: AllocationService,
  ) { }

  // ===== NOTIC =====
  private async providerNotiInapp(
    type: string,
    message: string,
    email: string[],
  ) {
    await axios.post(
      `http://${process.env.IN_APP_URL}/message`,
      {
        extras: { email },
        message: message || '',
        priority: 1,
        title: type || '',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.IN_APP_TOKEN}`,
        },
        maxBodyLength: Infinity,
      },
    );
  }

  private async executeNotiInapp(type: string, message: string) {
    const accounts = await this.repo.getInAppNotiRecipients(82);
    const emailArr = (accounts || []).map((a: any) => a.email).filter(Boolean);
    await this.providerNotiInapp(type, message, emailArr);
  }

  // ===== PUT UPDATE STATUS =====
  // menus_id | 87 Balancing | 88 Vent/Commissioning/Other Gas | 99 Intraday Acc. Imbalance Inventory Adjust | 100 Adjustment Daily Imbalance | 101 Adjust Accumulated Imbalance
  private static readonly ALLOC_BAL_BALANCING_MENUS = [87, 88, 99, 100, 101];
  // menus_id | 80 Allocation | 82 Allocation Management
  private static readonly ALLOC_BAL_ALLOCATION_MENUS = [80, 82];

  private buildExecuteUpdateInputs(payload: {
    request_number: any;
    execute_timestamp: any;
    finish_timestamp: any;
    status: string;
    msg?: string;
  }) {
    return {
      updateUnique: {
        request_number_id: Number(payload.request_number),
        execute_timestamp: Number(payload.execute_timestamp),
      },
      updateInfo: {
        finish_timestamp: payload.finish_timestamp,
        status: payload.status,
        ...(payload.msg != null ? { msg: payload.msg } : {}),
      },
    };
  }

  private async sendAllocBalNotifications(message: string) {
    try {
      await middleNotiInappMenuArr(
        this.prisma,
        'Balancing',
        message,
        AstosService.ALLOC_BAL_BALANCING_MENUS,
        1,
        'Alloc & Bal',
      );
      await middleNotiInappMenuArr(
        this.prisma,
        'Allocation',
        message,
        AstosService.ALLOC_BAL_ALLOCATION_MENUS,
        1,
        'Alloc & Bal',
      );
    } catch (error: any) {
      console.error('[ERROR] updateAllocatedStatus:', error?.stack || error);
    }
  }

  private resolveDailyAdjustmentUnit(unit?: any): 'MMBTU' | 'MMSCF' {
    const normalized = this.utils.toUpper(unit ?? 'MMBTU');
    if (normalized === 'MMBTU' || normalized === 'MMSCF') return normalized;
    throw new HttpException(
      {
        status_code: 400,
        error: 'Bad Request',
        message: 'unit must be MMBTU or MMSCF',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private async notifyMissingHvForShippers(executeEod: {
    start_date_date: Date;
    end_date_date: Date;
  }): Promise<boolean> {
    try {
      const intradayDate = executeEod.end_date_date;
      const intradayPeriod = {
        start_date_date: intradayDate,
        end_date_date: intradayDate,
      };
      const groups = await this.repo.findShippersMissingHv(intradayPeriod);

      if (groups.length === 0) return false;

      const shipperNames = groups.map((g) => g.name).filter(Boolean);
      const shipperListText =
        shipperNames.length === 1
          ? (shipperNames[0] ?? '')
          : shipperNames.length === 2
            ? `${shipperNames[0]} and ${shipperNames[1]}`
            : `${shipperNames.slice(0, -1).join(', ')}, and ${shipperNames[shipperNames.length - 1]}`;

      const dateText = getTodayNowAdd7(intradayDate).format('DD MMM YYYY');
      const skipReason = `Intraday allocation & balancing will not be executed because the HV parameter is missing for ${shipperListText} at ${dateText}.`;
      const noticeMessage = `Missing HV for Operation Flow and Instructed Flow for shipper at ${dateText}: ${shipperListText}\n${skipReason}`;

      middleNotiInapp(
        this.prisma,
        'DAM',
        noticeMessage,
        1008, // menus_id | 1008 HV for Operation Flow and Instructed Flow
        1,
      );

      await this.sendAllocBalNotifications(skipReason);
      return true;
    } catch (error) {
      this.logger.error(
        'Error in SendCheckHVForOperationFlowAndInstructedFlowNoti :',
        error,
      );
      return false;
    }
  }

  async execute_updateStatus_eod(payload: {
    request_number: any;
    execute_timestamp: any;
    finish_timestamp: any;
    status: string;
    msg?: string;
  }) {
    const { request_number, execute_timestamp, finish_timestamp, status } =
      payload;
    const nowAt = getTodayNow();
    const { updateUnique, updateInfo } = this.buildExecuteUpdateInputs(payload);

    let executeEodForHvNoti: any = undefined;
    let message = `The allocation and balancing process for all shippers has`;
    let status_code = 200;

    try {
      const find = await this.repo.findExecuteEod(updateUnique);
      if (!find) {
        message = `${message} failed due to not found execution request number ${request_number}.`;
      } else {
        await this.repo.updateExecuteEod(updateUnique, updateInfo);
        executeEodForHvNoti = find;
        console.log(
          `[DEBUG] execute_updateStatus_eod: update eod status ${execute_timestamp} ${status}`,
        );

        message = `${message} finished `;
        if (status === 'OK') {
          await this.repo.updateAllocatedStatus(
            Number(request_number),
            Number(execute_timestamp),
          );
          message = `${message} successfully`;
        } else {
          message = `${message} failed`;
        }
        message = `${message} at period ${getTodayNow(find?.start_date).format('DD/MM/YYYY')} to ${getTodayNow(find?.end_date).format('DD/MM/YYYY')}.`;
      }
    } catch (error) {
      status_code = 500;
      message = `${message} failed due to ${error}.`;
    } finally {
      message = `${message} \n(process executed on ${nowAt.format('DD/MM/YYYY HH:mm:ss')}).`;

      await this.sendAllocBalNotifications(message);
      let shouldContinueIntraday = true;
      if (executeEodForHvNoti) {
        shouldContinueIntraday = !(await this.notifyMissingHvForShippers(
          executeEodForHvNoti,
        ));
      }
      if (shouldContinueIntraday) {
        try {
          await this.allocationService.continueIntradayExecutionAfterEod(
            Number(request_number),
            Number(execute_timestamp),
            null,
          );
        } catch (error: any) {
          console.error(
            '[ERROR] execute_updateStatus_eod: continue intraday:',
            error?.stack || error,
          );
        }
      }

      return {
        request_number,
        execute_timestamp,
        finish_timestamp,
        status_code,
      };
    }
  }

  async execute_updateStatus_intraday(payload: {
    request_number: any;
    execute_timestamp: any;
    finish_timestamp: any;
    status: string;
    msg?: string;
  }) {
    const { request_number, execute_timestamp, finish_timestamp, status } =
      payload;
    const nowAt = getTodayNow();
    const { updateUnique, updateInfo } = this.buildExecuteUpdateInputs(payload);

    let message = `The allocation and balancing process for all shippers has`;
    let status_code = 200;

    try {
      const find = await this.repo.findExecuteIntraday(updateUnique);
      if (!find) {
        message = `${message} failed due to not found execution request number ${request_number}.`;
      } else {
        message = `${message} finished `;
        await this.repo.updateExecuteIntraday(updateUnique, updateInfo);
        message =
          status === 'OK' ? `${message} successfully` : `${message} failed`;
        message = `${message} at time: ${getTodayNow(find?.gas_day).format('DD/MM/YYYY')} hr ${find?.gas_hour}.`;
      }
    } catch (error) {
      status_code = 500;
      message = `${message} failed due to ${error}.`;
    } finally {
      message = `${message} \n(process executed on ${nowAt.format('DD/MM/YYYY HH:mm:ss')}).`;

      // !Ignore for tempo untill open function intraday
      if (process.env.NODE_ENV !== 'production') {
        await this.sendAllocBalNotifications(message);
      }

      return {
        request_number,
        execute_timestamp,
        finish_timestamp,
        status_code,
      };
    }
  }

  // ===== GET DATA =====
  async eviden_contract(payload: any) {
    const { start_date, end_date, skip, limit } = payload;

    const dayStart = getTodayStartAdd7(start_date).toDate();
    const dayEnd = getTodayStartAdd7(end_date).toDate();
    const rows = await this.repo.findContractsForEvidence(dayStart, dayEnd);

    const data = rows.map((e: any) => {
      const contract_point = e.booking_version?.[0]?.booking_row_json?.map(
        (cp: any) => cp?.contract_point,
      );
      return {
        contract: e.contract_code,
        shipper: e.group?.id_name,
        start_date: getTodayNow(e.contract_start_date).format('YYYY-MM-DD'),
        end_date: getTodayNow(e.contract_end_date).format('YYYY-MM-DD'),
        contract_point,
      };
    });

    return {
      total_record: data.length,
      status_code: 200,
      data,
    };
  }

  async eviden_contract_capacity(payload: any) {
    const { start_date, end_date, skip, limit } = payload;

    const dayStart = getTodayStartAdd7(start_date).toDate();
    const dayEnd = getTodayStartAdd7(end_date).toDate();

    const rows = await this.repo.findContractsForEvidence(dayStart, dayEnd);

    const resultPerDay = (rows ?? []).flatMap((e: any) => {
      const bookingFullJson = e.booking_version?.[0]?.booking_full_json?.[0];
      const terminate_date = e.terminate_date;
      if (!bookingFullJson?.data_temp) return [];

      const full = this.utils.safeParse(bookingFullJson.data_temp);

      // ----- pick capacity header & change points (unchanged) -----
      const head =
        full?.headerEntry?.['Capacity Daily Booking (MMBTU/d)'] || {};
      if (head && typeof head === 'object') delete (head as any)['key'];

      type ChangePoint = {
        at: dayjs.Dayjs;
        key: string;
      };
      const changePoints: ChangePoint[] = Object.entries(head || {})
        .filter(
          ([k, v]) =>
            /\d{2}\/\d{2}\/\d{4}/.test(k) &&
            v &&
            typeof v === 'object' &&
            'key' in (v as any),
        )
        .map(([k, v]) => ({
          at: dayjs(k, 'DD/MM/YYYY', true),
          key: String((v as any).key),
        }))
        .sort((a, b) => a.at.valueOf() - b.at.valueOf());

      const fallbackKey: string | null =
        (full?.headerEntry?.['Capacity Daily Booking (MMBTU/d)']
          ?.key as string) ??
        changePoints[0]?.key ??
        null;

      const selectKeyAsOf = (() => {
        let i = 0;
        return (dISO: string): string | null => {
          if (!fallbackKey && changePoints.length === 0) return null;
          const d = dayjs(dISO, 'YYYY-MM-DD', true);
          while (
            i + 1 < changePoints.length &&
            changePoints[i + 1].at.isSameOrBefore(d)
          )
            i++;
          if (changePoints.length === 0) return fallbackKey;
          if (changePoints[0].at.isAfter(d)) return fallbackKey;
          return changePoints[i].key;
        };
      })();

      // ----- period keys ("5"=From, "6"=To) -----
      const periodFromKey = full?.headerEntry?.Period?.From?.key ?? '5';
      const periodToKey = full?.headerEntry?.Period?.To?.key ?? '6';

      const rowsJson =
        e.booking_version?.[0]?.booking_row_json?.map((r: any) => ({
          ...r,
          data_temp: this.utils.safeParse(r.data_temp),
        })) || [];

      const days = this.utils.expandGasDays(start_date, end_date);

      const flatOut: any[] = [];
      for (const dISO of days) {
        const d = dayjs(dISO, 'YYYY-MM-DD', true);
        const key = selectKeyAsOf(dISO);

        for (const r of rowsJson) {
          // ---- read row's period window and gate the value ----
          const fromStr = r.data_temp?.[periodFromKey];
          let toStr = r.data_temp?.[periodToKey];
          if (terminate_date) {
            toStr = dayjs(terminate_date).format('DD/MM/YYYY');
          }

          const from = fromStr ? dayjs(fromStr, 'DD/MM/YYYY', true) : null; // inclusive
          const to = toStr ? dayjs(toStr, 'DD/MM/YYYY', true) : null; // exclusive

          const inLowerBound =
            !from || !from.isValid() || d.isSameOrAfter(from, 'day');
          const inUpperBound = !to || !to.isValid() || d.isBefore(to, 'day');
          const isInWindow = inLowerBound && inUpperBound;

          if (!isInWindow || !key) continue; // skip if not in window

          const value = this.utils.asNumber(r?.data_temp?.[key]);
          flatOut.push({
            contract: e.contract_code,
            shipper: e.group?.id_name,
            contract_point: r.contract_point,
            area: r.area_text,
            entry_exit: r.entry_exit_id === 1 ? 'ENTRY' : 'EXIT',
            zone: r.zone_text,
            dates: dISO,
            value,
          });
        }
      }

      return flatOut;
    });

    // ---- grouping (unchanged) ----
    const byDay = new Map<string, any[]>();
    for (const row of resultPerDay) {
      const k = row.dates;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(row);
    }

    const result = Array.from(byDay.entries()).map(([d, arr]) => {
      const k2 = new Map<string, any>();
      for (const a of arr) {
        const k = `${a.contract}| ${a.shipper} `;
        if (!k2.has(k))
          k2.set(k, {
            contract: a.contract,
            shipper: a.shipper,
            data: [] as any[],
          });
        k2.get(k)!.data.push({
          contract_point: a.contract_point,
          area: a.area,
          entry_exit: a.entry_exit,
          zone: a.zone,
          value: a.value,
        });
      }
      return {
        gas_day: d,
        data: Array.from(k2.values()),
      };
    });

    const data = this.utils.paginate(result, skip, limit);
    return {
      total_record: data.length,
      status_code: 200,
      data,
    };
  }

  // Per-gas-day active contract_points per contract derived from
  // booking_row_json + Period.From/To + terminate_date gating (matches
  // eviden_contract_capacity). Used by zero-baseline passes in both EOD daily
  // and intraday flows; the file-driven loop still uses the broader
  // getContractAllowedCPs set.
  private async buildActiveCpResolver(
    dayStart: Date,
    dayEnd: Date,
  ): Promise<{
    activeCPsForDay: (contract_code: string, gd: string) => Set<string>;
  }> {
    type BookingRow = {
      contract_point: string;
      from: dayjs.Dayjs | null;
      to: dayjs.Dayjs | null;
    };
    const evidenceContracts = await this.repo.findContractsForEvidence(
      dayStart,
      dayEnd,
    );
    const bookingByCode = new Map<string, BookingRow[]>();
    for (const e of evidenceContracts ?? []) {
      const bookingFullJson = e.booking_version?.[0]?.booking_full_json?.[0];
      if (!bookingFullJson?.data_temp) continue;
      const full = this.utils.safeParse(bookingFullJson.data_temp);
      const periodFromKey = full?.headerEntry?.Period?.From?.key ?? '5';
      const periodToKey = full?.headerEntry?.Period?.To?.key ?? '6';
      const terminate_date = e.terminate_date;
      const rows: BookingRow[] = (
        e.booking_version?.[0]?.booking_row_json ?? []
      )
        .map((r: any) => {
          const dt = this.utils.safeParse(r.data_temp);
          const fromStr = dt?.[periodFromKey];
          let toStr = dt?.[periodToKey];
          if (terminate_date)
            toStr = dayjs(terminate_date).format('DD/MM/YYYY');
          return {
            contract_point: r.contract_point,
            from: fromStr ? dayjs(fromStr, 'DD/MM/YYYY', true) : null,
            to: toStr ? dayjs(toStr, 'DD/MM/YYYY', true) : null,
          };
        })
        .filter((r) => r.contract_point);
      bookingByCode.set(e.contract_code, rows);
    }
    const activeCPsForDay = (
      contract_code: string,
      gd: string,
    ): Set<string> => {
      const rows = bookingByCode.get(contract_code);
      if (!rows?.length) return new Set();
      const d = dayjs(gd, 'YYYY-MM-DD', true);
      const out = new Set<string>();
      for (const r of rows) {
        const inLower =
          !r.from || !r.from.isValid() || d.isSameOrAfter(r.from, 'day');
        const inUpper = !r.to || !r.to.isValid() || d.isBefore(r.to, 'day');
        if (inLower && inUpper) out.add(r.contract_point);
      }
      return out;
    };
    return { activeCPsForDay };
  }

  async eviden_nomination_eod(payload: any) {
    const { start_date, end_date, skip, limit } = payload;

    // Build day list (ISO yyyy-mm-dd in UTC+7)
    const startISO = getTodayStartAdd7(start_date).format('YYYY-MM-DD');
    const endISO = getTodayStartAdd7(end_date).format('YYYY-MM-DD');
    const gasDays = this.utils.expandGasDays(startISO, endISO);

    // Prefetch
    const dayStart = getTodayStartAdd7(start_date).toDate();
    const dayEnd = getTodayStartAdd7(end_date).toDate();

    const nominationContracts = await this.repo.getContractsInRange(
      dayStart,
      dayEnd,
    );
    const baselineContracts = await this.repo.findContractsForEvidence(
      dayStart,
      dayEnd,
    );
    const filesMap = await this.repo.getPreferredNomFiles(
      nominationContracts.map((c) => c.id),
      dayStart,
      dayEnd,
    );
    const [nomDam, nonTpaDam, alloMode] = await Promise.all([
      this.repo.getDamNomPoints(dayStart, dayEnd),
      this.repo.getDamNonTpaPoints(dayStart, dayEnd),
      this.repo.getAllocationModes(dayEnd),
    ]);

    // Prepare lookups
    const nomMap = new Map(
      (nomDam ?? []).map((n: any) => [
        n.nomination_point,
        {
          entry_exit: n.entry_exit?.name ?? null,
          zone: n.zone?.name ?? null,
          area: n.area?.name ?? null,
          customer_type: n.customer_type?.name ?? null,
          cpList: (n.contract_point_list ?? []).map(
            (x: any) => x.contract_point,
          ),
        },
      ]),
    );

    const nonTpaMap = new Map(
      (nonTpaDam ?? []).map((nt: any) => [
        nt.non_tpa_point_name,
        {
          base_point: nt.nomination_point?.nomination_point ?? null,
          entry_exit: nt.nomination_point?.entry_exit?.name ?? null,
          zone: nt.nomination_point?.zone?.name ?? null,
          area: nt.nomination_point?.area?.name ?? null,
        },
      ]),
    );

    const contractCPs = await this.repo.getContractAllowedCPs(
      nominationContracts.map((c) => c.contract_code),
    );
    const baselineContractCPs = await this.repo.getContractAllowedCPs(
      baselineContracts.map((c) => c.contract_code),
    );
    const cpUniverse = Array.from(
      new Set(
        Array.from(baselineContractCPs.values()).flatMap((s) => Array.from(s)),
      ),
    );

    const { activeCPsForDay } = await this.buildActiveCpResolver(
      dayStart,
      dayEnd,
    );

    const modeForDay = (iso: string) => {
      const day = getTodayStartAdd7(iso).toDate();
      let mode: string | null = null;
      for (const r of alloMode || []) {
        if (r.start_date <= day) mode = r.allocation_mode_type?.mode ?? null;
        else break;
      }
      return mode || 'Daily Allocation Mode';
    };

    const out: Array<{
      gas_day: string;
      contract: string;
      shipper: string;
      data: any[];
    }> = [];

    for (const gd of gasDays) {
      const mode = modeForDay(gd);
      if (mode === 'Intraday Allocation Mode') {
        const res = await this.eviden_nomination_intraday({
          gas_day: gd,
          start_hour: 24,
          end_hour: 24,
          skip: 0,
          limit: 0,
        });
        for (const r of res?.data ?? [])
          out.push({
            gas_day: r.gas_day,
            contract: r.contract,
            shipper: r.shipper,
            data: r.data,
          });
        continue;
      }

      // Daily Allocation Mode
      const buckets = new Map<
        string,
        { gas_day: string; contract: string; shipper: string; data: any[] }
      >();
      const push = (
        gas_day: string,
        contract: string,
        shipper: string,
        item: any,
        override: boolean,
      ) => {
        const key = `${gas_day}| ${contract}| ${shipper} `;
        if (!buckets.has(key))
          buckets.set(key, { gas_day, contract, shipper, data: [] });
        this.utils.insertOrMerge(
          buckets.get(key)!.data,
          item,
          'DAILY_OVERRIDES_WEEKLY',
          override,
        );
      };

      for (const ctr of nominationContracts) {
        const files = filesMap.get(ctr.id) || [];
        const { weekStart } = getWeekRange(new Date(gd));
        const chosen = files.filter((f: any) => {
          const fDay = getTodayNow(f.gas_day as any).format('YYYY-MM-DD');
          const typeName = this.utils.toUpper(f.nomination_type?.name);
          return (
            (fDay === gd && typeName === 'DAILY') ||
            (fDay === dayjs(weekStart).format('YYYY-MM-DD') &&
              typeName === 'WEEKLY')
          );
        });

        // !old logic contain not replace daily by weeky as pernom
        // const dayFiles = files.filter((f: any) => getTodayNow(f.gas_day as any).format('YYYY-MM-DD') === gd);
        // const { weekStart, weekEnd } = getWeekRange(new Date(gd));
        // const weekFiles = files.filter((f: any) => getTodayNow(f.gas_day as any).format('YYYY-MM-DD') === dayjs(weekStart).format('YYYY-MM-DD'));
        // const hasDaily = dayFiles.some((f: any) => this.utils.toUpper(f.nomination_type?.name) === 'DAILY');
        // const chosen = hasDaily ? dayFiles.filter((f: any) => this.utils.toUpper(f.nomination_type?.name) === 'DAILY') : weekFiles.filter((f: any) => this.utils.toUpper(f.nomination_type?.name) === 'WEEKLY');

        for (const file of chosen) {
          const isDaily =
            this.utils.toUpper(file.nomination_type?.name) === 'DAILY';
          const full = file.nomination_version?.[0]?.nomination_full_json?.[0];
          if (!full?.data_temp) continue;
          const obj = this.utils.safeParse(full.data_temp);
          const head = obj?.headData ?? {};
          const rows: any[] = obj?.valueData ?? [];

          let colKey = this.utils.resolveColumnKey(head, gd, isDaily);
          if (!colKey) continue;
          colKey = colKey.trim();

          for (const row of rows) {
            const unit = this.utils.toUpper(row['9']);
            if (unit !== 'MMBTU/D') continue;

            const point = [row['3'], row['5']]
              .map((v: any) => (v ?? '').toString().trim())
              .find((v: string) => v.length > 0);
            if (!point) continue;

            const val = this.utils.asNumber(row[colKey]);
            // if (point === 'G_673R2') {
            //   console.log(`[DEBUG:eviden_nomination_eod] ${ point }, ${ ctr.contract_code }, ${ gd }, ${ isDaily }, ${ val } `)
            // }
            // console.log(`${ ctr.contract_code } ${ point }: ${ val } from \"${colKey}\"`);
            if (val == null || Number.isNaN(val)) continue;
            const Value = this.utils.round3(val);

            const allowed =
              contractCPs.get(ctr.contract_code) ?? new Set<string>();
            const nm = nomMap.get(point);
            const nt = nonTpaMap.get(point);
            const zone = this.utils.toUpper(row['0']) ?? null;

            if (nm) {
              const cp =
                (nm.cpList ?? []).find((x: string) => allowed.has(x)) ?? null;
              if (!cp) continue;
              const entryExit =
                (nm.entry_exit ?? row['10'])?.toString().toUpperCase() ?? null;
              push(
                gd,
                ctr.contract_code,
                ctr.group?.id_name as any,
                {
                  point,
                  point_type: 'NOM',
                  customer_type: nm.customer_type ?? null,
                  relation_point: cp,
                  relation_point_type: cp ? 'CONTRACT' : null,
                  area: nm.area ?? row['2'] ?? null,
                  zone: nm.zone ?? row['0'] ?? null,
                  entry_exit: entryExit,
                  value: Value,
                },
                isDaily,
              );
            } else if (nt) {
              const entryExit =
                (nt.entry_exit ?? row['10'])?.toString().toUpperCase() ?? null;
              push(
                gd,
                ctr.contract_code,
                ctr.group?.id_name as any,
                {
                  point,
                  point_type: 'NONTPA',
                  customer_type: null,
                  relation_point: nt.base_point,
                  relation_point_type: 'NOM',
                  area: nt.area ?? row['2'] ?? null,
                  zone: nt.zone ?? this.utils.toUpper(row['0']) ?? null,
                  entry_exit: entryExit,
                  value: Value,
                },
                isDaily,
              );
            } else if (zone) {
              // concept point
              // const netgative_tags = ['Instructed_Exit'];
              // if (point === 'Instructed_Exit') { multiplier = -1; }
              push(
                gd,
                ctr.contract_code,
                ctr.group?.id_name as any,
                {
                  point,
                  point_type: 'CONCEPT',
                  customer_type: null,
                  relation_point: null,
                  relation_point_type: null,
                  area: null,
                  zone,
                  entry_exit: null,
                  // value: Value * multiplier,
                  value: Value,
                },
                isDaily,
              );
            }
          }
        }
      }

      // Zero-baseline pass: emit value=0 NOM rows for nomination_points that
      // are related to the contract's contract_points on this gas day but were
      // not nominated in the file. Pushed with override=false so existing rows
      // from Loop 1 are preserved by insertOrMerge.
      const gdDate = getTodayStartAdd7(gd).toDate();
      const relations = cpUniverse.length
        ? await this.repo.getContractNomPointRelations(cpUniverse, gdDate)
        : [];
      console.log(
        `[DEBUG:eviden_nomination_eod:zero] gas_day=${gd} cp_universe=${cpUniverse.length} relations=${relations.length}`,
      );

      type RelMeta = {
        npStr: string;
        customer_type: string | null;
        area: string | null;
        zone: string | null;
        entry_exit: string | null;
      };
      const relByCp = new Map<string, RelMeta[]>();
      for (const r of relations as any[]) {
        const cpStr = r.contract_point?.contract_point;
        const np = r.nomination_point;
        const npStr = np?.nomination_point;
        if (!cpStr || !npStr) continue;
        const list = relByCp.get(cpStr) ?? [];
        list.push({
          npStr,
          customer_type: np?.customer_type?.name ?? null,
          area: np?.area?.name ?? null,
          zone: np?.zone?.name ?? null,
          entry_exit: np?.entry_exit?.name ?? null,
        });
        relByCp.set(cpStr, list);
      }
      for (const cpStr of cpUniverse) {
        const rels = relByCp.get(cpStr) ?? [];
        console.log(
          `[DEBUG:eviden_nomination_eod:relation] gas_day=${gd} cp=${cpStr} relation_count=${rels.length} nomination_points=${rels.map((r) => r.npStr).join(',')}`,
        );
      }

      for (const ctr of baselineContracts) {
        const allowed = activeCPsForDay(ctr.contract_code, gd);
        console.log(
          `[DEBUG:eviden_nomination_eod:contract] gas_day=${gd} contract=${ctr.contract_code} shipper=${ctr.group?.id_name ?? ''} active_cp=${Array.from(allowed).join(',')}`,
        );
        for (const cpStr of allowed) {
          const cpRelations = relByCp.get(cpStr) ?? [];
          if (cpRelations.length === 0) {
            console.log(
              `[DEBUG:eviden_nomination_eod:missing_relation] gas_day=${gd} contract=${ctr.contract_code} cp=${cpStr} relation=0`,
            );
          }
          for (const rel of cpRelations) {
            if (!rel.zone) {
              console.warn(
                `[WARN] eviden_nomination_eod: skipping zero baseline for nomination_point=${rel.npStr} contract=${ctr.contract_code} gas_day=${gd} — null zone`,
              );
              continue;
            }
            push(
              gd,
              ctr.contract_code,
              ctr.group?.id_name as any,
              {
                point: rel.npStr,
                point_type: 'NOM',
                customer_type: rel.customer_type,
                relation_point: cpStr,
                relation_point_type: 'CONTRACT',
                area: rel.area,
                zone: rel.zone,
                entry_exit: rel.entry_exit,
                value: 0,
              },
              false,
            );
          }
        }
      }

      out.push(...Array.from(buckets.values()));
    }

    out.sort(
      (a, b) =>
        a.gas_day.localeCompare(b.gas_day) ||
        a.contract.localeCompare(b.contract) ||
        a.shipper.localeCompare(b.shipper),
    );
    const data = this.utils.paginate(out, skip, limit);
    return { total_record: data.length, status_code: 200, data };
  }

  async eviden_revbal_eod(payload: any) {
    const { start_date, end_date, skip, limit } = payload;

    // Build day list (ISO yyyy-mm-dd in UTC+7)
    const startISO = getTodayStartAdd7(start_date).format('YYYY-MM-DD');
    const endISO = getTodayStartAdd7(end_date).format('YYYY-MM-DD');
    const gasDays = this.utils.expandGasDays(startISO, endISO);

    // Prefetch
    const dayStart = getTodayStartAdd7(start_date).toDate();
    const dayEnd = getTodayStartAdd7(end_date).toDate();

    const contracts = await this.repo.getRevBalContractsInRange(
      dayStart,
      dayEnd,
    );
    const filesMap = await this.repo.getRevBalPreferredNomFiles(
      contracts.map((c) => c.id),
      dayStart,
      dayEnd,
    );
    // const [nomDam, nonTpaDam, alloMode] = await Promise.all([
    //   this.repo.getDamNomPoints(dayStart, dayEnd),
    //   this.repo.getDamNonTpaPoints(dayStart, dayEnd),
    //   this.repo.getAllocationModes(dayEnd),
    // ]);
    const nomDam = await this.repo.getDamNomPoints(dayStart, dayEnd);

    // Prepare lookups
    const nomMap = new Map(
      (nomDam ?? []).map((n: any) => [
        n.nomination_point,
        {
          entry_exit: n.entry_exit?.name ?? null,
          zone: n.zone?.name ?? null,
          area: n.area?.name ?? null,
          customer_type: n.customer_type?.name ?? null,
          cpList: (n.contract_point_list ?? []).map(
            (x: any) => x.contract_point,
          ),
        },
      ]),
    );

    // const contractCPs = await this.repo.getContractAllowedCPs(contracts.map(c => c.contract_code));

    // const modeForDay = (iso: string) => {
    //   const day = getTodayStartAdd7(iso).toDate();
    //   let mode: string | null = null;
    //   for (const r of (alloMode || [])) { if (r.start_date <= day) mode = r.allocation_mode_type?.mode ?? null; else break; }
    //   return mode || 'Daily Allocation Mode';
    // };

    const out: Array<{
      gas_day: string;
      shipper: string;
      zone: string;
      data: any[];
    }> = [];

    for (const gd of gasDays) {
      // const mode = modeForDay(gd);
      // if (mode === 'Intraday Allocation Mode') {
      //   const res = await this.eviden_nomination_intraday({ gas_day: gd, start_hour: 24, end_hour: 24, skip: 0, limit: 0 });
      //   for (const r of (res?.data ?? [])) out.push({ gas_day: r.gas_day, contract: r.contract, shipper: r.shipper, data: r.data });
      //   continue;
      // }

      // Daily Allocation Mode
      const buckets = new Map<
        string,
        {
          gas_day: string;
          shipper: string;
          zone: string;
          data: any[];
        }
      >();
      const push = (
        gas_day: string,
        shipper: string,
        zone: string,
        item: any,
      ) => {
        const zoneName = this.utils.toUpper(zone) ?? '';
        const key = `${gas_day}|${shipper}|${zoneName}`;
        if (!buckets.has(key))
          buckets.set(key, {
            gas_day,
            shipper,
            zone: zoneName,
            data: [],
          });
        this.utils.insertOrMerge2(buckets.get(key)!.data, item);
      };

      for (const ctr of contracts) {
        const files = filesMap.get(ctr.id) || [];
        const { weekStart, weekEnd } = getWeekRange(new Date(gd));
        const chosen = files.filter(
          (f: any) =>
            (getTodayNow(f.gas_day as any).format('YYYY-MM-DD') === gd &&
              this.utils.toUpper(f.nomination_type?.name) === 'DAILY') ||
            (getTodayNow(f.gas_day as any).format('YYYY-MM-DD') ===
              dayjs(weekStart).format('YYYY-MM-DD') &&
              this.utils.toUpper(f.nomination_type?.name) === 'WEEKLY'),
        );

        for (const file of chosen) {
          const isDaily =
            this.utils.toUpper(file.nomination_type?.name) === 'DAILY';
          const full = file.nomination_version?.[0]?.nomination_full_json?.[0];
          if (!full?.data_temp) continue;
          const obj = this.utils.safeParse(full.data_temp);
          const head = obj?.headData ?? {};
          const rows: any[] = obj?.valueData ?? [];

          const colKey = this.utils.resolveColumnKey(head, gd, isDaily).trim();
          if (!colKey) continue;

          for (const row of rows) {
            const unit = this.utils.toUpper(row['9']);
            if (unit !== 'MMBTU/D') {
              continue;
            }

            const point = [row['3'], row['5']]
              .map((v: any) => (v ?? '').toString().trim())
              .find((v: string) => v.length > 0);
            if (!point) continue;
            const val = this.utils.asNumber(row[colKey]);
            // console.log(`${ctr.contract_code} ${point}: ${val} from \"${colKey}\"`);
            if (val == null || Number.isNaN(val)) continue;
            let Value = this.utils.round3(val);

            // const allowed = contractCPs.get(ctr.contract_code) ?? new Set<string>();
            const nm = nomMap.get(point);
            // const nt = nonTpaMap.get(point);
            if (nm) {
              const zone = nm.zone ?? this.utils.toUpper(row['0']) ?? 'UNKNOWN';
              const entryExit =
                (nm.entry_exit ?? row['10'])?.toString().toUpperCase() ?? null;
              if (entryExit === 'EXIT') Value *= -1;
              push(gd, ctr.group?.id_name as any, zone, {
                override: isDaily,
                value: Value,
              });
            }
          }
        }
      }
      out.push(...Array.from(buckets.values()));
    }

    out.sort(
      (a, b) =>
        a.gas_day.localeCompare(b.gas_day) ||
        a.shipper.localeCompare(b.shipper) ||
        a.zone.localeCompare(b.zone),
    );
    const data = this.utils.paginate(out, skip, limit);
    return {
      total_record: data.length,
      status_code: 200,
      data,
    };
  }

  async prepare_daily_adjustment_data(payload: any): Promise<{
    byHourPoint: Map<string, Set<string>>;
    orderedAdjCodes: string[];
    hasAdjKey: Set<string>;
    baseIndex: Map<
      string,
      {
        total: number;
        members: any[];
      }
    >;
    deviders: Map<string, number>;
    shipperPointAdj: Map<string, AdjEvent[]>;
    groups: Map<
      string,
      {
        gas_day: string;
        gas_hour: number;
        contract: string;
        shipper: string;
        data: any[];
      }
    >;
  }> {
    const { gas_day, start_hour, end_hour } = payload;
    const adjustmentUnit = this.resolveDailyAdjustmentUnit(
      payload?.daily_adjustment_summary_unit,
    );
    const nominationRowUnit =
      adjustmentUnit === 'MMSCF' ? 'MMSCFD' : 'MMBTU/D';
    const { fromH, toH } = this.utils.normalizeHourWindow(start_hour, end_hour);

    const reqFrom = Math.max(1, fromH ?? 1);
    const reqTo = Math.min(24, toH ?? 24);
    const buildFrom = 1; // always start at hour 1
    const buildTo = reqTo; // only need up to the latest requested hour
    const dayStart = getTodayStartYYYYMMDDDfaultAdd7(gas_day).toDate();
    const dayEnd = getTodayEndYYYYMMDDDfaultAdd7(gas_day).toDate();

    // Contracts + files
    const nominationContracts = await this.repo.getContractsInRange(
      dayStart,
      dayEnd,
    );
    const baselineContracts = await this.repo.findContractsForEvidence(
      dayStart,
      dayEnd,
    );
    const filesMap = await this.repo.getPreferredNomFiles(
      nominationContracts.map((c) => c.id),
      dayStart,
      dayEnd,
    );

    // Lookups
    const [nomDam, nonTpaDam, dailyAdjust] = await Promise.all([
      this.repo.getDamNomPoints(dayStart, dayEnd),
      this.repo.getDamNonTpaPoints(dayStart, dayEnd),
      this.repo.getDailyAdjustments(getTodayStartAdd7(gas_day).toDate()),
    ]);
    // console.log('[DEBUG][prepare_daily_adjustment_data]: input counts', {
    //   contracts: nominationContracts?.length ?? 0,
    //   nomDam: nomDam?.length ?? 0,
    //   nonTpaDam: nonTpaDam?.length ?? 0,
    //   dailyAdjust: dailyAdjust?.length ?? 0,
    // });

    // Build lookups
    const nomMap = new Map(
      (nomDam ?? []).map((n: any) => [
        n.nomination_point,
        {
          entry_exit: n.entry_exit?.name ?? null,
          zone: n.zone?.name ?? null,
          area: n.area?.name ?? null,
          customer_type: n.customer_type?.name ?? null,
          cpList: (n.contract_point_list ?? []).map(
            (x: any) => x.contract_point,
          ),
        },
      ]),
    );
    const nonTpaMap = new Map(
      (nonTpaDam ?? []).map((nt: any) => [
        nt.non_tpa_point_name,
        {
          base_point: nt.nomination_point?.nomination_point ?? null,
          entry_exit: nt.nomination_point?.entry_exit?.name ?? null,
          zone: nt.nomination_point?.zone?.name ?? null,
          area: nt.nomination_point?.area?.name ?? null,
        },
      ]),
    );

    const contractCPs = await this.repo.getContractAllowedCPs(
      nominationContracts.map((c) => c.contract_code),
      dayStart,
      dayEnd,
    );
    const baselineContractCPs = await this.repo.getContractAllowedCPs(
      baselineContracts.map((c) => c.contract_code),
      dayStart,
      dayEnd,
    );

    // Baseline groups per hour (fromH..toH)
    const groups = new Map<
      string,
      {
        gas_day: string;
        gas_hour: number;
        contract: string;
        shipper: string;
        data: any[];
      }
    >();
    const pushHour = (
      gasDayISO: string,
      hour: number,
      contract: string,
      shipper: string,
      item: any,
      override: boolean,
    ) => {
      const gas_day_s = getTodayNow(gasDayISO).format('YYYY-MM-DD');
      const key = `${gas_day_s}|${hour}|${contract}|${shipper}`;
      if (!groups.has(key))
        groups.set(key, {
          gas_day: gas_day_s,
          gas_hour: hour,
          contract,
          shipper,
          data: [],
        });
      this.utils.insertOrMerge(
        groups.get(key)!.data,
        item,
        'DAILY_OVERRIDES_WEEKLY',
        override,
      );
    };

    for (const ctr of nominationContracts) {
      const files = filesMap.get(ctr.id) || [];
      for (const file of files) {
        const gasDayISO = getTodayNow(file.gas_day as any).format('YYYY-MM-DD');
        const isDaily =
          this.utils.toUpper(file.nomination_type?.name) === 'DAILY';
        const version = file.nomination_version?.[0];
        const full = version?.nomination_full_json?.[0];
        if (!full?.data_temp) continue;

        const obj = this.utils.safeParse(full.data_temp);
        const head = obj?.headData ?? {};
        const rows: any[] = obj?.valueData ?? [];

        // Weekly: resolve the date column once per file
        // const weeklyColKey = !isDaily ? this.utils.resolveColumnKey(head, gasDayISO, false) : null;
        let weeklyColKey: {
          string: string;
        } | null = null;
        if (!isDaily) {
          // Get the week's start/end dates containing gasDayISO
          const weekRange = getWeekRange(file.gas_day);

          // Loop through each day in the week
          for (
            let d = weekRange.weekStart;
            d <= weekRange.weekEnd;
            d = dayjs(d).add(1, 'day').toDate()
          ) {
            // Only process if day falls within dayStart-dayEnd range
            if (d >= dayStart && d <= dayEnd) {
              const gasDayISOEachDay = dayjs(d).format('YYYY-MM-DD');
              const weeklyColKeyEachDay = this.utils.resolveColumnKey(
                head,
                gasDayISOEachDay,
                false,
              );
              if (weeklyColKeyEachDay) {
                if (weeklyColKey) {
                  weeklyColKey[gasDayISOEachDay] = weeklyColKeyEachDay;
                } else {
                  weeklyColKey = {} as {
                    string: string;
                  };
                  weeklyColKey[gasDayISOEachDay] = weeklyColKeyEachDay;
                }
              }
            }
          }
        }
        if (!isDaily && !weeklyColKey) continue;

        for (const row of rows) {
          const unit = this.utils.toUpper(row['9']);
          if (unit !== nominationRowUnit) {
            continue;
          }

          // point id or concept fallback
          const point = [row['3'], row['5']]
            .map((v: any) => (v ?? '').toString().trim())
            .find((v: string) => v.length > 0);
          if (!point) continue;

          // classify NOM → NONTPA → CONCEPT
          let base: any | null = null;
          const nm = nomMap.get(point);
          const nt = nonTpaMap.get(point);
          const zone = this.utils.toUpper(row['0']) ?? null;
          if (nm) {
            const allowed =
              contractCPs.get(ctr.contract_code) ?? new Set<string>();
            const cp =
              (nm.cpList ?? []).find((x: string) => allowed.has(x)) ?? null;
            const entryExit =
              (nm.entry_exit ?? row['10'])?.toString().toUpperCase() ?? null;
            if (adjustmentUnit === 'MMSCF' && entryExit !== 'ENTRY') {
              continue;
            }
            if (!cp) {
              continue;
            }
            base = {
              point,
              point_type: 'NOM',
              customer_type: nm.customer_type ?? null,
              relation_point: cp,
              relation_point_type: cp ? 'CONTRACT' : null,
              area: nm.area ?? row['2'] ?? null,
              zone: nm.zone ?? row['0'] ?? null,
              entry_exit: entryExit,
            };
          } else if (nt) {
            const entryExit =
              (nt.entry_exit ?? row['10'])?.toString().toUpperCase() ?? null;
            if (adjustmentUnit === 'MMSCF' && entryExit !== 'ENTRY') {
              continue;
            }
            base = {
              point,
              point_type: 'NONTPA',
              customer_type: null,
              relation_point: nt.base_point,
              relation_point_type: 'NOM',
              area: nt.area ?? row['2'] ?? null,
              zone: nt.zone ?? this.utils.toUpper(row['0']) ?? null,
              entry_exit: entryExit,
            };
          } else if (zone) {
            base = {
              point,
              point_type: 'CONCEPT',
              customer_type: null,
              relation_point: null,
              relation_point_type: null,
              area: row['2'] ?? null,
              zone: zone,
              entry_exit: null,
            };
          }
          if (!base) continue;

          if (isDaily) {
            // DAILY: per-hour columns. Read column for each hour and push that hour's value (as-is)
            for (let h = buildFrom; h <= buildTo; h++) {
              const colKeyH = this.utils.resolveColumnKey(
                head,
                gasDayISO,
                true,
                {
                  mode: 'INTRADAY',
                  gasHour: h,
                },
              );
              if (!colKeyH) continue;
              const vH = this.utils.asNumber(row[colKeyH]);
              if (vH == null || Number.isNaN(vH)) continue;
              let multiplier = 1;
              // const netgative_tags = ['Instructed_Exit'];
              // if (point === 'Instructed_Exit') { multiplier = -1; }
              pushHour(
                gasDayISO,
                h,
                ctr.contract_code,
                ctr.group?.id_name as any,
                {
                  ...base,
                  value: vH * multiplier,
                },
                true,
              );
            }
          } else {
            // WEEKLY: one per-day value → split evenly by 24
            Object.keys(weeklyColKey).map((gasDayISOEachDay) => {
              const weeklyColKeyEachDay = weeklyColKey[gasDayISOEachDay];
              const v = this.utils.asNumber(row[weeklyColKeyEachDay!]);
              if (v == null || Number.isNaN(v)) return;
              let multiplier = 1;
              // const netgative_tags = ['Instructed_Exit'];
              // if (point === 'Instructed_Exit') { multiplier = -1; }
              const hourlyValue = this.utils.round3((v / 24) * multiplier);
              // const hourlyValue = (v / 24) * multiplier;
              for (let h = buildFrom; h <= buildTo; h++) {
                pushHour(
                  gasDayISOEachDay,
                  h,
                  ctr.contract_code,
                  ctr.group?.id_name as any,
                  {
                    ...base,
                    value: hourlyValue,
                  },
                  false,
                );
              }
            });
          }
        }
      }
    }
    //น่าจะต้องแก้ตรงนี้
    // console.log('groups', groups)

    // Zero-baseline pass: emit value=0 NOM rows for nomination_points that
    // are related to the contract's contract_points on this gas day but were
    // not nominated in the file. Pushed with override=false so file rows from
    // Loop 1 are preserved by insertOrMerge. Mirrors eviden_nomination_eod.
    {
      const cpUniverse = Array.from(
        new Set(
          Array.from(baselineContractCPs.values()).flatMap((s) =>
            Array.from(s),
          ),
        ),
      );
      const { activeCPsForDay } = await this.buildActiveCpResolver(
        dayStart,
        dayEnd,
      );
      const gd = getTodayNow(gas_day).format('YYYY-MM-DD');
      const gdDate = getTodayStartAdd7(gas_day).toDate();
      const relations = cpUniverse.length
        ? await this.repo.getContractNomPointRelations(cpUniverse, gdDate)
        : [];
      console.log(
        `[DEBUG:prepare_daily_adjustment_data:zero] gas_day=${gd} cp_universe=${cpUniverse.length} relations=${relations.length}`,
      );

      type RelMeta = {
        npStr: string;
        customer_type: string | null;
        area: string | null;
        zone: string | null;
        entry_exit: string | null;
      };
      const relByCp = new Map<string, RelMeta[]>();
      for (const r of relations as any[]) {
        const cpStr = r.contract_point?.contract_point;
        const np = r.nomination_point;
        const npStr = np?.nomination_point;
        if (!cpStr || !npStr) continue;
        const list = relByCp.get(cpStr) ?? [];
        list.push({
          npStr,
          customer_type: np?.customer_type?.name ?? null,
          area: np?.area?.name ?? null,
          zone: np?.zone?.name ?? null,
          entry_exit: np?.entry_exit?.name ?? null,
        });
        relByCp.set(cpStr, list);
      }
      for (const cpStr of cpUniverse) {
        const rels = relByCp.get(cpStr) ?? [];
        console.log(
          `[DEBUG:prepare_daily_adjustment_data:relation] gas_day=${gd} cp=${cpStr} relation_count=${rels.length} nomination_points=${rels.map((r) => r.npStr).join(',')}`,
        );
      }

      for (const ctr of baselineContracts) {
        const allowed = activeCPsForDay(ctr.contract_code, gd);
        console.log(
          `[DEBUG:prepare_daily_adjustment_data:contract] gas_day=${gd} contract=${ctr.contract_code} shipper=${ctr.group?.id_name ?? ''} active_cp=${Array.from(allowed).join(',')}`,
        );
        for (const cpStr of allowed) {
          const cpRelations = relByCp.get(cpStr) ?? [];
          if (cpRelations.length === 0) {
            console.log(
              `[DEBUG:prepare_daily_adjustment_data:missing_relation] gas_day=${gd} contract=${ctr.contract_code} cp=${cpStr} relation=0`,
            );
          }
          for (const rel of cpRelations) {
            if (!rel.zone) {
              console.warn(
                `[WARN] prepare_daily_adjustment_data: skipping zero baseline for nomination_point=${rel.npStr} contract=${ctr.contract_code} gas_day=${gd} — null zone`,
              );
              continue;
            }
            if (
              adjustmentUnit === 'MMSCF' &&
              this.utils.toUpper(rel.entry_exit) !== 'ENTRY'
            ) {
              continue;
            }
            for (let h = buildFrom; h <= buildTo; h++) {
              pushHour(
                gd,
                h,
                ctr.contract_code,
                ctr.group?.id_name as any,
                {
                  point: rel.npStr,
                  point_type: 'NOM',
                  customer_type: rel.customer_type,
                  relation_point: cpStr,
                  relation_point_type: 'CONTRACT',
                  area: rel.area,
                  zone: rel.zone,
                  entry_exit: rel.entry_exit,
                  value: 0,
                },
                false,
              );
            }
          }
        }
      }
    }

    // Adjustment series (shipper+point → [{minute, valueH}...])
    const shipperPointAdj = new Map<string, AdjEvent[]>();
    const has = (x: any) => x !== null && x !== undefined;

    for (const adj of dailyAdjust ?? []) {
      // daily_adjustment_group is an array
      const shipperNames = Array.from(
        new Set(
          (adj.daily_adjustment_group ?? [])
            .map((g: any) => g?.group?.id_name)
            .filter(Boolean),
        ),
      ) as string[];

      if (shipperNames.length === 0) continue;

      const adjustTime = adj.time || '00:00';
      const [hh, mm] = adjustTime.split(':').map((n: any) => +n || 0);
      const minute = hh * 60 + mm;

      for (const item of adj.daily_adjustment_nom ?? []) {
        const point = item.nomination_point?.nomination_point;
        const entryExit = item.nomination_point?.entry_exit?.name;

        if (!point) continue;
        if (
          adjustmentUnit === 'MMSCF' &&
          this.utils.toUpper(entryExit) !== 'ENTRY'
        ) {
          continue;
        }

        const perDay =
          adjustmentUnit === 'MMSCF'
            ? item.valume_mmscfd
            : item.valume_mmscfd2;
        const perHour =
          adjustmentUnit === 'MMSCF'
            ? item.valume_mmscfh
            : item.valume_mmscfh2;

        let valueH: number | null = null;
        if (has(perHour) && !has(perDay)) valueH = Number(perHour);
        else if (!has(perHour) && has(perDay)) valueH = Number(perDay) / 24;
        else if (has(perHour) && has(perDay)) valueH = Number(perHour);
        else continue;

        if (Number.isNaN(valueH)) continue;

        // add for each shipper in the group list
        for (const shipper of shipperNames) {
          const key = `${adj.daily_code}|${shipper}|${point}`;
          const arr = shipperPointAdj.get(key) ?? [];
          arr.push({
            minute,
            valueH,
          });
          shipperPointAdj.set(key, arr);

          // 🔎 Add logging here
          // console.log(`[DEBUG][prepare_daily_adjustment_data]: adjustment event key=${key}`);
          // console.log('[DEBUG][prepare_daily_adjustment_data]: adjustment event items', arr);
          // console.log(`[DEBUG][prepare_daily_adjustment_data]: adjustment event count=${arr.length}`);
        }
      }
    }
    for (const arr of shipperPointAdj.values())
      arr.sort((a, b) => a.minute - b.minute);
    let adjPairs = 0,
      adjEvents = 0;
    for (const [k, arr] of shipperPointAdj.entries()) {
      adjPairs++;
      adjEvents += arr.length;
    }
    // console.log('[DEBUG][prepare_daily_adjustment_data]: adjustment counts', { adjPairs, adjEvents });

    // Index baseline for prorating
    const hasAdjKey = new Set<string>(Array.from(shipperPointAdj.keys()));
    // console.log(`[DEBUG][prepare_daily_adjustment_data]: hasAdjKey size=${hasAdjKey.size}`);

    const adjKeySample = Array.from(hasAdjKey).slice(0, 5);
    // console.log('[DEBUG][prepare_daily_adjustment_data]: hasAdjKey sample', adjKeySample);

    const uniqueAdjCodes = new Set<string>();
    for (const key of hasAdjKey) {
      // `${adjCode}|${shipper}|${point}`
      const [adjCode] = key.split('|');
      uniqueAdjCodes.add(adjCode);
    }

    // NEW: a quick lookup to know if any adj exists for (shipper,point)
    const hasAdjForSP = new Set<string>(); // `${shipper}|${point}`
    for (const key of hasAdjKey) {
      const [, shipper, point] = key.split('|');
      hasAdjForSP.add(`${shipper}|${point}`);
    }

    let totalRecords = 0;
    let baseIndexMembers = 0;
    type Member = Array<{
      shipper: string;
      contract: string;
      rec: any;
    }>;

    // CHANGED: baseIndex key no longer has adjCode
    const baseIndex = new Map<
      string,
      {
        total: number;
        members: Member;
      }
    >(); // key: gas_day|gas_hour|shipper|point

    for (const g of groups.values()) {
      totalRecords += g.data.length;
      const { gas_day, gas_hour, shipper } = g;

      for (const rec of g.data) {
        // Only index records that have ANY adjustment for this shipper+point (across adjCodes)
        if (!hasAdjForSP.has(`${shipper}|${rec.point}`)) continue;

        // CHANGED: no adjCode in the key
        const key = `${gas_day}|${gas_hour}|${shipper}|${rec.point}`;
        const slot = baseIndex.get(key) ?? {
          total: 0,
          members: [],
        };

        slot.total += Number(rec.value) || 0;
        slot.members.push({
          shipper,
          contract: g.contract,
          rec,
        });
        baseIndex.set(key, slot);
        baseIndexMembers++;
      }
    }

    // console.log('[DEBUG][prepare_daily_adjustment_data]: group counts', { buckets: groups.size, totalRecords });
    // console.log('[DEBUG][prepare_daily_adjustment_data]: baseIndex counts', { keys: baseIndex.size, members: baseIndexMembers });
    if (groups.size === 0) {
      // console.log('[WARN][prepare_daily_adjustment_data]: no groups built - quick reasons', {
      //   contracts: nominationContracts?.length ?? 0,
      //   filesMapKeys: nominationContracts?.length ? nominationContracts.map(c => filesMap.get(c.id)?.length ?? 0) : [],
      //   hasNomMap: nomDam && nomDam.length > 0,
      //   hasNonTpaMap: nonTpaDam && nonTpaDam.length > 0,
      // });
    }

    // Compute shipper-hour targets (piecewise inside hour)
    const deviders = new Map<string, number>();
    const dayShipperPoints = new Map<string, Set<string>>();
    for (const g of groups.values()) {
      const k = `${g.gas_day}|${g.shipper}`;
      const set = dayShipperPoints.get(k) ?? new Set<string>();
      for (const rec of g.data) set.add(rec.point);
      dayShipperPoints.set(k, set);
    }

    // We’ll iterate hours and collect (gas_day, point, shippers) from baseIndex
    const orderedAdjCodes = Array.from(uniqueAdjCodes); // ensure order ADJ1 -> ADJ2 -> ...

    // Group baseIndex by (day|hour|point) → shippers
    const byHourPoint = new Map<string, Set<string>>(); // `${day}|${hour}|${point}` -> set(shipper)
    for (const [k] of baseIndex.entries()) {
      const [day, hourStr, shipper, point] = k.split('|');
      const hour = Number(hourStr);
      if (hour < buildFrom || hour > buildTo) continue;
      const hp = `${day}|${hour}|${point}`;
      if (!byHourPoint.has(hp)) byHourPoint.set(hp, new Set());
      byHourPoint.get(hp)!.add(shipper);
    }

    return {
      byHourPoint,
      orderedAdjCodes,
      hasAdjKey,
      baseIndex,
      deviders,
      shipperPointAdj,
      groups,
    };
  }

  async daily_adjustment_summary(payload: any): Promise<
    {
      gas_day: string;
      gas_hour: number;
      contract: string;
      shipper: string;
      data: any[];
    }[]
  > {
    const {
      byHourPoint,
      orderedAdjCodes,
      hasAdjKey,
      baseIndex,
      deviders,
      shipperPointAdj,
      groups,
    } = await this.prepare_daily_adjustment_data(payload);
    const { gas_day } = payload;
    console.log('prorate adjust to contract');

    // Helper key builders
    const spKey = (day: string, hour: number, shipper: string, point: string) =>
      `${day}|${hour}|${shipper}|${point}`;

    type SegmentMember = {
      key: string;
      shipper: string;
      contract: string;
      rec: any;
    };
    type SegmentState = {
      from: number;
      to: number;
      values: Map<string, number>;
      owners: Map<string, number>;
    };
    const cloneSegment = (segment: SegmentState): SegmentState => ({
      from: segment.from,
      to: segment.to,
      values: new Map(segment.values),
      owners: new Map(segment.owners),
    });
    const splitSegments = (segments: SegmentState[], minute: number) => {
      if (!Number.isFinite(minute)) return;
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (minute <= segment.from || minute >= segment.to) continue;
        const left = cloneSegment(segment);
        const right = cloneSegment(segment);
        left.to = minute;
        right.from = minute;
        segments.splice(i, 1, left, right);
        return;
      }
    };
    const snapshotKeyOf = (minute: number, from: number, to: number) =>
      `${minute}|${from}|${to}`;
    const ratioValue = (values: Map<string, number>, keys: string[]) =>
      keys.reduce((sum, key) => sum + (Number(values.get(key)) || 0), 0);

    // Now process per (day,hour,point), replaying adjustment-owned minute segments.
    for (const [hp, shippers] of byHourPoint.entries()) {
      const [day, hourStr, point] = hp.split('|');
      const hour = Number(hourStr);
      const startMin = (hour - 1) * 60;
      const endMin = hour * 60;
      const membersByKey = new Map<string, SegmentMember>();
      const memberKeysByShipper = new Map<string, string[]>();
      const initialValues = new Map<string, number>();
      const initialOwners = new Map<string, number>();

      for (const shipper of shippers) {
        const slot = baseIndex.get(spKey(day, hour, shipper, point));
        if (!slot) continue;
        for (const member of slot.members || []) {
          const memberKey = `${member.shipper}|${member.contract}`;
          membersByKey.set(memberKey, {
            key: memberKey,
            shipper: member.shipper,
            contract: member.contract,
            rec: member.rec,
          });
          const shipperMembers =
            memberKeysByShipper.get(member.shipper) ?? [];
          shipperMembers.push(memberKey);
          memberKeysByShipper.set(member.shipper, shipperMembers);
          initialValues.set(memberKey, Number(member.rec.value) || 0);
          initialOwners.set(memberKey, Number.NEGATIVE_INFINITY);
        }
      }

      if (membersByKey.size === 0) continue;

      const segments: SegmentState[] = [
        {
          from: startMin,
          to: endMin,
          values: initialValues,
          owners: initialOwners,
        },
      ];
      const ratioSnapshots = new Map<string, Map<string, number>>();

      const applyEvent = (
        adjCode: string,
        minute: number,
        target: number,
        participants: string[],
      ) => {
        const applyFrom = Math.max(minute, startMin);
        if (applyFrom >= endMin) return;
        splitSegments(segments, applyFrom);

        for (const segment of segments) {
          if (segment.to <= applyFrom || segment.from >= endMin) continue;
          const candidateKeys = participants.flatMap(
            (shipper) => memberKeysByShipper.get(shipper) ?? [],
          );
          const affectedKeys = candidateKeys.filter(
            (key) =>
              (segment.owners.get(key) ?? Number.NEGATIVE_INFINITY) <= minute,
          );
          if (affectedKeys.length === 0) continue;

          const snapshotKey = snapshotKeyOf(minute, segment.from, segment.to);
          let ratioSource = ratioSnapshots.get(snapshotKey);
          if (!ratioSource) {
            ratioSource = new Map(segment.values);
            ratioSnapshots.set(snapshotKey, ratioSource);
          }

          const denominator = ratioValue(ratioSource, affectedKeys);
          console.log(
            `[DEBUG][daily_adjustment_summary:evolve] gas_day=${day} hour=${hour} point=${point} adjCode=${adjCode} minute=${minute} segment=${segment.from}-${segment.to} target=${target} denominator=${denominator} mode=${denominator !== 0 ? 'ratio' : 'equal'} affected=${affectedKeys.length}`,
          );
          if (denominator !== 0) {
            for (const key of affectedKeys) {
              const currentValue = Number(ratioSource.get(key)) || 0;
              const beforeValue = Number(segment.values.get(key)) || 0;
              const beforeOwner =
                segment.owners.get(key) ?? Number.NEGATIVE_INFINITY;
              const rawNextValue = target * (currentValue / denominator);
              const nextValue = this.utils.round3(rawNextValue);
              // const nextValue = rawNextValue;
              segment.values.set(key, nextValue);
              segment.owners.set(key, minute);
              const member = membersByKey.get(key);
              console.log(
                `[DEBUG][daily_adjustment_summary:evolve:member] gas_day=${day} hour=${hour} point=${point} adjCode=${adjCode} segment=${segment.from}-${segment.to} shipper=${member?.shipper ?? ''} contract=${member?.contract ?? ''} ratio_source=${currentValue} before=${beforeValue} raw_after=${rawNextValue} after=${nextValue} owner_before=${beforeOwner} owner_after=${minute}`,
              );
            }
          } else {
            const perContract = new Map<string, number>();
            for (const key of affectedKeys) {
              const member = membersByKey.get(key);
              if (!member) continue;
              perContract.set(
                member.contract,
                (perContract.get(member.contract) ?? 0) + 1,
              );
            }
            const distinctContracts = perContract.size;
            if (distinctContracts === 0) continue;
            const contractShare = target / distinctContracts;
            for (const key of affectedKeys) {
              const member = membersByKey.get(key);
              if (!member) continue;
              const beforeValue = Number(segment.values.get(key)) || 0;
              const beforeOwner =
                segment.owners.get(key) ?? Number.NEGATIVE_INFINITY;
              const rawNextValue =
                contractShare / (perContract.get(member.contract) as number);
              const nextValue = this.utils.round3(rawNextValue);
              // const nextValue = rawNextValue;
              segment.values.set(
                key,
                nextValue,
              );
              segment.owners.set(key, minute);
              console.log(
                `[DEBUG][daily_adjustment_summary:evolve:member] gas_day=${day} hour=${hour} point=${point} adjCode=${adjCode} segment=${segment.from}-${segment.to} shipper=${member.shipper} contract=${member.contract} ratio_source=0 before=${beforeValue} raw_after=${rawNextValue} after=${nextValue} owner_before=${beforeOwner} owner_after=${minute}`,
              );
            }
          }
        }
      };

      for (const adjCode of orderedAdjCodes) {
        const participants = Array.from(shippers).filter((s) =>
          hasAdjKey.has(`${adjCode}|${s}|${point}`),
        );
        if (participants.length === 0) {
          // console.log(`[DEBUG][daily_adjustment_summary]: skipped no shipper found for adjCode=${adjCode}`);
          continue;
        }

        const eventsByMinute = new Map<number, number>();
        for (const shipper of participants) {
          const seriesAdj =
            shipperPointAdj.get(`${adjCode}|${shipper}|${point}`) || [];
          const lastBefore = [...seriesAdj]
            .filter((a: any) => a.minute < startMin)
            .pop();
          if (lastBefore) {
            eventsByMinute.set(lastBefore.minute, lastBefore.valueH);
          }
          for (const event of seriesAdj.filter(
            (a: any) => a.minute >= startMin && a.minute < endMin,
          )) {
            eventsByMinute.set(event.minute, event.valueH);
          }
        }

        for (const [minute, target] of Array.from(eventsByMinute.entries()).sort(
          ([minuteA], [minuteB]) => minuteA - minuteB,
        )) {
          console.log(
            `[DEBUG][daily_adjustment_summary]: process adjustment gas_day=${gas_day} hour=${hour} point=${point} adjCode=${adjCode} minute=${minute} target=${target} participants=${participants.join(',')} apply_window=${Math.max(minute, startMin)}-${endMin}`,
          );
          applyEvent(adjCode, minute, target, participants);
        }
      }

      for (const shipper of shippers) {
        const keySP = spKey(day, hour, shipper, point);
        const slot = baseIndex.get(keySP);
        if (!slot) continue;
        slot.total = 0;
        for (const member of slot.members || []) {
          const memberKey = `${member.shipper}|${member.contract}`;
          const value =
            segments.reduce((sum, segment) => {
              const segmentValue = Number(segment.values.get(memberKey)) || 0;
              return sum + segmentValue * (segment.to - segment.from);
            }, 0) / 60;
          const roundedValue = this.utils.round3(value);
          // const roundedValue = value;
          const decimalDeviation = value - roundedValue;
          console.log(`[DEBUG][daily_adjustment_summary:rounding] gas_day=${day} hour=${hour} point=${point} shipper=${member.shipper} contract=${member.contract} raw=${value} rounded=${roundedValue} deviation=${decimalDeviation}`);
          member.rec.value = roundedValue;
          slot.total += member.rec.value;
        }
        baseIndex.set(keySP, slot);
      }
    }
    // Cumulative and response (round final values to 3 decimals)
    const sorted = Array.from(groups.values()).sort(
      (a, b) =>
        a.gas_day.localeCompare(b.gas_day) ||
        a.contract.localeCompare(b.contract) ||
        a.shipper.localeCompare(b.shipper) ||
        a.gas_hour - b.gas_hour,
    );

    if (
      this.resolveDailyAdjustmentUnit(payload?.daily_adjustment_summary_unit) ===
      'MMSCF'
    ) {
      return sorted
        .map((g) => ({
          ...g,
          data: g.data.filter(
            (rec: any) => this.utils.toUpper(rec.entry_exit) === 'ENTRY',
          ),
        }))
        .filter((g) => g.data.length > 0);
    }

    return sorted;
  }

  async eviden_nomination_intraday(payload: any) {
    const { gas_day, start_hour, end_hour, skip, limit } = payload;
    const { fromH, toH } = this.utils.normalizeHourWindow(start_hour, end_hour);

    const reqFrom = Math.max(1, fromH ?? 1);
    const reqTo = Math.min(24, toH ?? 24);

    const sorted = await this.daily_adjustment_summary(payload);

    const cum = new Map<string, number>();
    for (const g of sorted) {
      for (const rec of g.data) {
        const k = `${g.gas_day}|${g.contract}|${g.shipper}|${rec.point}${rec.zone}`;
        const prev = cum.get(k) ?? 0;
        const next = prev + (Number(rec.value) || 0);
        rec.value = this.utils.round3(next); // final values rounded to 3 decimals
        // rec.value = next; // final values rounded to 3 decimals
        cum.set(k, next);
      }
    }

    const filtered = sorted.filter(
      (g) => g.gas_hour >= reqFrom && g.gas_hour <= reqTo,
    );
    const data = this.utils.paginate(filtered, skip, limit);
    return {
      total_record: data.length,
      status_code: 200,
      data,
    };
  }

  async eviden_revbal_intraday(payload: any) {
    const { gas_day, start_hour, end_hour, skip, limit } = payload;
    const { fromH, toH } = this.utils.normalizeHourWindow(start_hour, end_hour);

    const reqFrom = Math.max(1, fromH ?? 1);
    const reqTo = Math.min(24, toH ?? 24);
    const buildFrom = 1; // always start at hour 1
    const buildTo = reqTo; // only need up to the latest requested hour
    const dayStart = getTodayStartYYYYMMDDDfaultAdd7(gas_day).toDate();
    const dayEnd = getTodayEndYYYYMMDDDfaultAdd7(gas_day).toDate();

    // Contracts + files
    const contracts = await this.repo.getRevBalContractsInRange(
      dayStart,
      dayEnd,
    );
    const filesMap = await this.repo.getRevBalPreferredNomFiles(
      contracts.map((c) => c.id),
      dayStart,
      dayEnd,
    );

    // Lookups
    // const [nomDam, nonTpaDam, dailyAdjust] = await Promise.all([
    //   this.repo.getDamNomPoints(dayStart, dayEnd),
    //   this.repo.getDamNonTpaPoints(dayStart, dayEnd),
    //   this.repo.getDailyAdjustments(getTodayStartAdd7(gas_day).toDate()),
    // ]);
    const nomDam = await this.repo.getDamNomPoints(dayStart, dayEnd);

    // Build lookups
    const nomMap = new Map(
      (nomDam ?? []).map((n: any) => [
        n.nomination_point,
        {
          entry_exit: n.entry_exit?.name ?? null,
          zone: n.zone?.name ?? null,
          area: n.area?.name ?? null,
          customer_type: n.customer_type?.name ?? null,
          cpList: (n.contract_point_list ?? []).map(
            (x: any) => x.contract_point,
          ),
        },
      ]),
    );

    // Baseline groups per hour (fromH..toH)
    const groups = new Map<
      string,
      {
        gas_day: string;
        gas_hour: number;
        shipper: string;
        zone: string;
        data: any[];
      }
    >();
    const pushHour = (
      gasDayISO: string,
      hour: number,
      shipper: string,
      zone: string,
      item: any,
    ) => {
      const gas_day_s = getTodayNow(gasDayISO).format('YYYY-MM-DD');
      const zoneName = this.utils.toUpper(zone) ?? '';
      const key = `${gas_day_s}|${hour}|${shipper}|${zoneName}`;
      if (!groups.has(key))
        groups.set(key, {
          gas_day: gas_day_s,
          gas_hour: hour,
          shipper,
          zone: zoneName,
          data: [],
        });
      this.utils.insertOrMerge2(groups.get(key)!.data, item);
    };

    for (const ctr of contracts) {
      const files = filesMap.get(ctr.id) || [];
      for (const file of files) {
        const gasDayISO = getTodayNow(file.gas_day as any).format('YYYY-MM-DD');
        const isDaily =
          this.utils.toUpper(file.nomination_type?.name) === 'DAILY';
        const version = file.nomination_version?.[0];
        const full = version?.nomination_full_json?.[0];
        if (!full?.data_temp) continue;

        const obj = this.utils.safeParse(full.data_temp);
        const head = obj?.headData ?? {};
        const rows: any[] = obj?.valueData ?? [];

        // Weekly: resolve the date column once per file
        // const weeklyColKey = !isDaily ? this.utils.resolveColumnKey(head, gasDayISO, false) : null;
        let weeklyColKey: {
          string: string;
        } | null = null;
        if (!isDaily) {
          // Get the week's start/end dates containing gasDayISO
          const weekRange = getWeekRange(file.gas_day);

          // Loop through each day in the week
          for (
            let d = weekRange.weekStart;
            d <= weekRange.weekEnd;
            d = dayjs(d).add(1, 'day').toDate()
          ) {
            // Only process if day falls within dayStart-dayEnd range
            if (d >= dayStart && d <= dayEnd) {
              const gasDayISOEachDay = dayjs(d).format('YYYY-MM-DD');
              const weeklyColKeyEachDay = this.utils.resolveColumnKey(
                head,
                gasDayISOEachDay,
                false,
              );
              if (weeklyColKeyEachDay) {
                if (weeklyColKey) {
                  weeklyColKey[gasDayISOEachDay] = weeklyColKeyEachDay;
                } else {
                  weeklyColKey = {} as {
                    string: string;
                  };
                  weeklyColKey[gasDayISOEachDay] = weeklyColKeyEachDay;
                }
              }
            }
          }
        }
        if (!isDaily && !weeklyColKey) continue;

        for (const row of rows) {
          const unit = this.utils.toUpper(row['9']);
          if (unit !== 'MMBTU/D') {
            continue;
          }

          // point id or concept fallback
          const point = [row['3'], row['5']]
            .map((v: any) => (v ?? '').toString().trim())
            .find((v: string) => v.length > 0);
          if (!point) continue;

          // classify NOM → NONTPA → CONCEPT
          let base: any | null = null;
          const nm = nomMap.get(point);
          if (nm) {
            const zone = nm.zone ?? this.utils.toUpper(row['0']) ?? 'UNKNOWN';
            const entryExit =
              (nm.entry_exit ?? row['10'])?.toString().toUpperCase() ?? null;

            if (isDaily) {
              // DAILY: per-hour columns. Read column for each hour and push that hour's value (as-is)
              for (let h = buildFrom; h <= buildTo; h++) {
                const colKeyH = this.utils.resolveColumnKey(
                  head,
                  gasDayISO,
                  true,
                  {
                    mode: 'INTRADAY',
                    gasHour: h,
                  },
                );
                if (!colKeyH) continue;
                let vH = this.utils.asNumber(row[colKeyH]);
                if (vH == null || Number.isNaN(vH)) continue;
                let multiplier = 1;
                if (entryExit === 'EXIT') vH *= -1;
                // const netgative_tags = ['Instructed_Exit'];
                // if (point === 'Instructed_Exit') { multiplier = -1; }
                pushHour(gasDayISO, h, ctr.group?.id_name as any, zone, {
                  override: true,
                  value: vH,
                });
              }
            } else {
              // WEEKLY: one per-day value → split evenly by 24
              Object.keys(weeklyColKey).map((gasDayISOEachDay) => {
                const weeklyColKeyEachDay = weeklyColKey[gasDayISOEachDay];
                const v = this.utils.asNumber(row[weeklyColKeyEachDay!]);
                if (v == null || Number.isNaN(v)) return;
                let multiplier = 1;
                // const netgative_tags = ['Instructed_Exit'];
                // if (point === 'Instructed_Exit') { multiplier = -1; }
                let hourlyValue = this.utils.round3((v / 24) * multiplier);
                // let hourlyValue = (v / 24) * multiplier;
                if (entryExit === 'EXIT') hourlyValue *= -1;
                for (let h = buildFrom; h <= buildTo; h++) {
                  pushHour(
                    gasDayISOEachDay,
                    h,
                    ctr.group?.id_name as any,
                    zone,
                    {
                      override: false,
                      value: hourlyValue,
                    },
                  );
                }
              });
            }
          }
        }
      }
    }

    const sorted = Array.from(groups.values()).sort(
      (a, b) =>
        a.gas_day.localeCompare(b.gas_day) ||
        a.shipper.localeCompare(b.shipper) ||
        a.zone.localeCompare(b.zone) ||
        a.gas_hour - b.gas_hour,
    );

    const cum = new Map<string, number>();
    for (const g of sorted) {
      for (const rec of g.data) {
        const k = `${g.gas_day}|${g.shipper}|${g.zone}`;
        const prev = cum.get(k) ?? 0;
        const next = prev + (Number(rec.value) || 0);
        rec.value = this.utils.round3(next); // final values rounded to 3 decimals
        // rec.value = next; // final values rounded to 3 decimals
        cum.set(k, next);
      }
    }

    const filtered = sorted.filter(
      (g) => g.gas_hour >= reqFrom && g.gas_hour <= reqTo,
    );
    const data = this.utils.paginate(filtered, skip, limit);
    return {
      total_record: data.length,
      status_code: 200,
      data,
    };
  }

  async balance_adjusment_by_system(payload: any) {
    const { start_date, end_date, skip, limit, zone } = payload;

    if (!skip && !limit) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Invalid input data.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      if (!Number.isInteger(skip) || skip < 0) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'skip must be a positive number.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'skip must be a positive number.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      if (!Number.isInteger(limit) || limit < 1) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'limit must be a positive number.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'limit must be a positive number.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const start = getTodayStartAdd7(start_date);
    const end = getTodayStartAdd7(end_date);

    const intradayAcc =
      await this.prisma.intraday_acc_imbalance_inventory.findMany({
        where: {
          OR: [
            {
              del_flag: null,
            },
            {
              del_flag: false,
            },
          ],
          gas_day: {
            gte: start.toDate(),
            lte: end.toDate(),
          },
          ...(zone
            ? {
              zone: {
                equals: zone,
                mode: 'insensitive',
              },
            }
            : {}),
        },
        orderBy: [{ gas_day: 'desc' }, { gas_hour: 'desc' }],
      });

    const mappedData = [];
    let current = start;
    while (current.isSameOrBefore(end)) {
      const gasDayText = current.format('YYYY-MM-DD');
      const intradayAccInGasDay = intradayAcc.filter(
        (e: any) => e.gas_day_text === gasDayText,
      );

      const zoneNameList: string[] = [];

      intradayAccInGasDay.map((item) => {
        if (!zoneNameList.some((zoneName) => isMatch(zoneName, item.zone))) {
          zoneNameList.push(item.zone.toUpperCase());
        }
      });

      zoneNameList.map((zoneName) => {
        const intradayAccTargetItem = intradayAccInGasDay.find((item) =>
          isMatch(item.zone, zoneName),
        );

        const adjustAccImbInv: number | null = parseToNumber(
          intradayAccTargetItem?.value,
        );

        const values = [
          {
            tag: 'adjustAccImbInv',
            value: adjustAccImbInv,
          },
        ];

        mappedData.push({
          gas_day: gasDayText,
          zone: zoneName,
          values,
        });
      });
      current = current.add(1, 'day');
    }

    return {
      total_record: mappedData.length,
      status_code: 200,
      data:
        skip === 0 && limit === 0
          ? mappedData
          : mappedData.slice(skip, skip + limit),
    };
  }

  async balance_adjusment_by_shipper(payload: any) {
    const { start_date, end_date, skip, limit, shipper, zone } = payload;

    if (!skip && !limit) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Invalid input data.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      if (!Number.isInteger(skip) || skip < 0) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'skip must be a positive number.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'skip must be a positive number.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      if (!Number.isInteger(limit) || limit < 1) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'limit must be a positive number.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'limit must be a positive number.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const start = getTodayStartAdd7(start_date);
    const end = getTodayStartAdd7(end_date);

    const adjustmentDailyImbalance =
      await this.prisma.balancing_adjustment_daily_imbalance.findMany({
        where: {
          gas_day: {
            gte: start.toDate(), // Filter by gas_day >= start date
            lte: end.toDate(), // Filter by gas_day <= end date
          },
          adjust_imbalance: {
            not: null,
          },
          ...(shipper
            ? {
              shipper_name_text: {
                equals: shipper,
                mode: 'insensitive',
              },
            }
            : {}),
          ...(zone
            ? {
              zone_text: {
                equals: zone,
                mode: 'insensitive',
              },
            }
            : {}),
        },
        orderBy: [{ gas_day: 'desc' }, { gas_hour: 'desc' }],
      });

    const adjustmentAccumulatedImbalance =
      await this.prisma.balancing_adjust_accumulated_imbalance.findMany({
        where: {
          gas_day: {
            gte: start.toDate(), // Filter by gas_day >= start date
            lte: end.toDate(), // Filter by gas_day <= end date
          },
          adjust_imbalance: {
            not: null,
          },
          ...(shipper
            ? {
              shipper_name_text: {
                equals: shipper,
                mode: 'insensitive',
              },
            }
            : {}),
          ...(zone
            ? {
              zone_text: {
                equals: zone,
                mode: 'insensitive',
              },
            }
            : {}),
        },
        orderBy: [{ gas_day: 'desc' }, { gas_hour: 'desc' }],
      });

    const ventCommissioningOtherGas =
      await this.prisma.vent_commissioning_other_gas.findMany({
        where: {
          gas_day: {
            gte: start.toDate(), // Filter by gas_day >= start date
            lte: end.toDate(), // Filter by gas_day <= end date
          },
          AND: [
            {
              OR: [
                {
                  del_flag: null,
                },
                {
                  del_flag: false,
                },
              ],
            },
            {
              OR: [
                {
                  active: null,
                },
                {
                  active: true,
                },
              ],
            },
          ],
          ...(shipper
            ? {
              group: {
                id_name: {
                  equals: shipper,
                  mode: 'insensitive',
                },
              },
            }
            : {}),
          ...(zone
            ? {
              zone: {
                name: {
                  equals: zone,
                  mode: 'insensitive',
                },
              },
            }
            : {}),
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              id_name: true,
              company_name: true,
            },
          },
          zone: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ gas_day: 'desc' }],
      });

    const mappedData = [];
    let current = start;
    while (current.isSameOrBefore(end)) {
      const gasDayText = current.format('YYYY-MM-DD');
      const adjustmentDailyImbalanceInGasDay = adjustmentDailyImbalance.filter(
        (e: any) => e.gas_day_text === gasDayText,
      );
      const adjustmentAccumulatedImbalanceInGasDay =
        adjustmentAccumulatedImbalance.filter(
          (e: any) => e.gas_day_text === gasDayText,
        );
      const ventCommissioningOtherGasInGasDay =
        ventCommissioningOtherGas.filter(
          (e: any) => e.gas_day_text === gasDayText,
        );

      const shipperIdList: string[] = [];
      const zoneNameList: string[] = [];

      adjustmentDailyImbalanceInGasDay.map((item) => {
        if (
          !shipperIdList.some((shipperId) =>
            isMatch(shipperId, item.shipper_name_text),
          )
        ) {
          shipperIdList.push(item.shipper_name_text.toUpperCase());
        }
        if (
          !zoneNameList.some((zoneName) => isMatch(zoneName, item.zone_text))
        ) {
          zoneNameList.push(item.zone_text.toUpperCase());
        }
      });

      adjustmentAccumulatedImbalanceInGasDay.map((item) => {
        if (
          !shipperIdList.some((shipperId) =>
            isMatch(shipperId, item.shipper_name_text),
          )
        ) {
          shipperIdList.push(item.shipper_name_text.toUpperCase());
        }
        if (
          !zoneNameList.some((zoneName) => isMatch(zoneName, item.zone_text))
        ) {
          zoneNameList.push(item.zone_text.toUpperCase());
        }
      });

      ventCommissioningOtherGasInGasDay.map((item) => {
        if (
          !shipperIdList.some((shipperId) =>
            isMatch(shipperId, item.group.id_name),
          )
        ) {
          shipperIdList.push(item.group.id_name.toUpperCase());
        }
        if (
          !zoneNameList.some((zoneName) => isMatch(zoneName, item.zone.name))
        ) {
          zoneNameList.push(item.zone.name.toUpperCase());
        }
      });

      shipperIdList.map((shipperId) => {
        zoneNameList.map((zoneName) => {
          const adjustmentDailyImbalanceTargetItem =
            adjustmentDailyImbalanceInGasDay.find(
              (item) =>
                isMatch(item.shipper_name_text, shipperId) &&
                isMatch(item.zone_text, zoneName),
            );
          const adjustmentAccumulatedImbalanceTargetItem =
            adjustmentAccumulatedImbalanceInGasDay.find(
              (item) =>
                isMatch(item.shipper_name_text, shipperId) &&
                isMatch(item.zone_text, zoneName),
            );
          const ventCommissioningOtherGasTargetItem =
            ventCommissioningOtherGasInGasDay.find(
              (item) =>
                isMatch(item.group.id_name, shipperId) &&
                isMatch(item.zone.name, zoneName),
            );

          const adjustDailyImb: number | null = parseToNumber(
            adjustmentDailyImbalanceTargetItem?.adjust_imbalance,
          );
          const adjustAccImb: number | null = parseToNumber(
            adjustmentAccumulatedImbalanceTargetItem?.adjust_imbalance,
          );
          const ventGas: number | null = parseToNumber(
            ventCommissioningOtherGasTargetItem?.vent_gas_value_mmbtud,
          );
          const commissioningGas: number | null = parseToNumber(
            ventCommissioningOtherGasTargetItem?.commissioning_gas_value_mmbtud,
          );
          const otherGas: number | null = parseToNumber(
            ventCommissioningOtherGasTargetItem?.other_gas_value_mmbtud,
          );

          const values = [
            {
              tag: 'adjustDailyImb',
              value: adjustDailyImb,
            },
            {
              tag: 'adjustAccImb',
              value: adjustAccImb,
            },
            {
              tag: 'ventGas',
              value: ventGas,
            },
            {
              tag: 'commissioningGas',
              value: commissioningGas,
            },
            {
              tag: 'otherGas',
              value: otherGas,
            },
          ];

          mappedData.push({
            gas_day: gasDayText,
            shipper: shipperId,
            zone: zoneName,
            values,
          });
        });
      });
      current = current.add(1, 'day');
    }

    return {
      total_record: mappedData.length,
      status_code: 200,
      data:
        skip === 0 && limit === 0
          ? mappedData
          : mappedData.slice(skip, skip + limit),
    };
  }

  async balance_intraday_base_inventory(payload: any) {
    const { skip = 0, limit = 0, ...restPayload } = payload || {};

    const rawResult = await getIntradayBaseInentoryFromWebService(
      this.prisma,
      this.meteredMicroService,
      {
        ...restPayload,
        skip,
        limit,
      },
      null,
    );

    const sourceData: any[] = rawResult?.data || [];

    const mappedData = sourceData.map((e: any) => {
      const rawGasHour = e?.gas_hour;
      let gasHour: number | null = null;

      if (typeof rawGasHour === 'number') {
        gasHour = rawGasHour;
      } else if (typeof rawGasHour === 'string') {
        const hourPart = rawGasHour.split(':')[0];
        const parsed = Number(hourPart);
        gasHour = Number.isNaN(parsed) ? null : parsed;
      }

      const values = [
        {
          tag: 'heatingValue_OFIF',
          value: e?.heatingValue_OFOIF_system,
        },
        {
          tag: 'heatingValue_base',
          value: e?.hv,
        },
        {
          tag: 'baseInv',
          value: e?.base_inventory_value,
        },
        {
          tag: 'high_last',
          value: e?.high_max,
        },
        {
          tag: 'high_difficultDay',
          value: e?.high_difficult_day,
        },
        {
          tag: 'high_red',
          value: e?.high_red,
        },
        {
          tag: 'high_orange',
          value: e?.high_orange,
        },
        {
          tag: 'high_alert',
          value: e?.alert_high,
        },
        {
          tag: 'low_last',
          value: e?.low_max,
        },
        {
          tag: 'low_difficultDay',
          value: e?.low_difficult_day,
        },
        {
          tag: 'low_red',
          value: e?.low_red,
        },
        {
          tag: 'low_orange',
          value: e?.low_orange,
        },
        {
          tag: 'low_alert',
          value: e?.alert_low,
        },
        {
          tag: 'totalInventory',
          value: e?.totalInv,
        },
      ].filter((v) => v.value !== undefined && v.value !== null);

      return {
        gas_day: e?.gas_day_text,
        gas_hour: gasHour,
        zone: e?.zone_text,
        mode: e?.mode,
        values,
      };
    });

    return {
      total_record: mappedData.length,
      status_code: rawResult?.status_code ?? 200,
      data:
        skip === 0 && limit === 0
          ? mappedData
          : mappedData.slice(skip, skip + limit),
    };
  }
}
