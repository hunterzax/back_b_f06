import { Injectable } from '@nestjs/common';
import * as dayjs from 'dayjs';
import { getTodayNow } from 'src/common/utils/date.util';
import { cascadingRound } from 'src/common/utils/number.util';

export type PushMode = 'DAILY_OVERRIDES_WEEKLY' | 'CONCEPT_SUMS';

export interface HourWindow {
  fromH: number;
  toH: number;
}
export interface MergeItem {
  point: string | number;
  point_type: string; // e.g. 'CONCEPT'
  value?: number | string | null;
  [k: string]: unknown;
}

type CaseFields = {
  zone?: unknown;
  entry_exit?: unknown;
};

@Injectable()
export class AstosUtils {
  safeParse<T extends object = Record<string, any>>(s: unknown): T {
    try {
      if (typeof s === 'string') return JSON.parse(s) as T;
      if (s && typeof s === 'object') return s as T;
      return {} as T;
    } catch {
      return {} as T;
    }
  }

  toUpper(v: unknown): string | null {
    return v == null ? null : String(v).toUpperCase();
  }

  asNumber(v: any): number | null {
    if (v == null) return null;
    const s = String(v).replace(/,/g, '').trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  resolveColumnKey(
    head: Record<string, unknown> | null | undefined,
    gasDayISO: string,
    isDaily: boolean,
    opts?: {
      mode?: 'EOD' | 'INTRADAY';
      gasHour?: number;
    },
  ): string | null {
    const entries = Object.entries(head || {});
    if (entries.length === 0) return null;

    const mode = opts?.mode ?? 'EOD';

    // Intraday + Daily → pick the column for the specific hour
    if (isDaily && mode === 'INTRADAY') {
      const h = Number(opts?.gasHour ?? 0);
      if (!(h >= 1 && h <= 24)) return null;

      const patt = [
        new RegExp(`^(?:HOUR|HR|H)\\s*0?${h}$`, 'i'), // "Hour 1", "H1", "HR01"
        new RegExp(`^0?${h}(?::00)?$`, 'i'), // "1", "01", "01:00"
        new RegExp(`^0?${h}[\\.:]00$`, 'i'), // "01.00"
      ];

      const found = entries.find(([, label]) => {
        const s = String(label ?? '').trim();
        return patt.some((rx) => rx.test(s));
      });

      return found ? (found[0] as string) : null;
    }

    // EOD behavior (unchanged)
    if (isDaily && mode === 'EOD') {
      const found = entries.find(
        ([, label]) => String(label).trim().toUpperCase() === 'TOTAL',
      );
      return found ? (found[0] as string) : null;
    }

    // Weekly → use the gas day label
    const gasDayText = getTodayNow(gasDayISO).format('DD/MM/YYYY');
    const found = entries.find(
      ([, label]) => String(label).trim() === gasDayText,
    );
    return found ? (found[0] as string) : null;
  }

  expandGasDays(startISO: string, endISO: string): string[] {
    const start = dayjs(startISO);
    const end = dayjs(endISO);
    const days: string[] = [];
    for (let d = start.clone(); d.isSameOrBefore(end); d = d.add(1, 'day')) {
      days.push(d.format('YYYY-MM-DD'));
    }
    return days;
  }

  normalizeHourWindow(startHour: unknown, endHour: unknown): HourWindow {
    const fromH = Math.max(1, Math.min(24, Number(startHour) || 1));
    const toH = Math.max(fromH, Math.min(24, Number(endHour) || 24));
    return { fromH, toH };
  }

  normalizeNominationCase<T extends object>(item: T): T {
    const normalized = { ...item } as any;
    if (normalized.zone != null) normalized.zone = this.toUpper(normalized.zone);
    if (normalized.entry_exit != null)
      normalized.entry_exit = this.toUpper(normalized.entry_exit);
    return normalized as T;
  }

  // `override` controls whether the incoming `item` replaces an existing entry
  // with the same (point, point_type, zone). Used by:
  //   - file-driven loops: pass `override = true` when the file is DAILY, so
  //     daily rows overwrite previously-inserted weekly rows; pass `false` for
  //     weekly rows so they don't clobber daily.
  //   - zero-baseline pass: omit (defaults to `false`) so synthetic value=0
  //     rows never overwrite real nominations.
  insertOrMerge<T extends MergeItem>(
    bucket: T[],
    item: T,
    mode: PushMode = 'DAILY_OVERRIDES_WEEKLY',
    override = false,
  ): void {
    const normalizedItem = this.normalizeNominationCase(item);
    const idx = bucket.findIndex(
      (d) =>
        d.point === normalizedItem.point &&
        d.point_type === normalizedItem.point_type &&
        this.toUpper(d.zone) === this.toUpper(normalizedItem.zone),
    );
    if (idx === -1) {
      bucket.push(normalizedItem);
      return;
    }

    if (normalizedItem.point_type === 'CONCEPT' && mode === 'CONCEPT_SUMS') {
      const prev = this.asNumber(bucket[idx].value);
      const curr = this.asNumber(normalizedItem.value);
      bucket[idx].value = (prev || 0) + (curr || 0);
    } else if (mode === 'DAILY_OVERRIDES_WEEKLY' && override) {
      bucket[idx] = normalizedItem;
    }
  }

  // `override` partitions and prioritizes the bucket:
  //   - override=true rows wipe all override=false rows already in the bucket.
  //   - override=false rows are dropped when an override=true row is present.
  //   - rows with matching `override` are merged by summing their `value`.
  // Callers set override=true for rows from DAILY files and override=false for
  // rows from WEEKLY files, so DAILY values take precedence and like-priority
  // values accumulate.
  insertOrMerge2<
    T extends {
      override: boolean;
      value: number;
    } & CaseFields,
  >(bucket: T[], item: T): void {
    const normalizedItem = this.normalizeNominationCase(item);
    const hasOverride = bucket.some((d) => d.override === true);

    if (!normalizedItem.override && hasOverride) return;

    if (normalizedItem.override) {
      for (let i = bucket.length - 1; i >= 0; i--) {
        if (!bucket[i].override) bucket.splice(i, 1);
      }
    }

    const idx = bucket.findIndex((d) => d.override === normalizedItem.override);
    if (idx === -1) {
      bucket.push({ ...normalizedItem });
    } else {
      const prev = this.asNumber(bucket[idx].value) || 0;
      const curr = this.asNumber(normalizedItem.value) || 0;
      bucket[idx].value = prev + curr;
    }
  }

  paginate<T>(arr: T[], skip?: number, limit?: number): T[] {
    if ((Number(skip) || 0) === 0 && (Number(limit) || 0) === 0) return arr;
    const s = Number(skip) || 0;
    const l = Number(limit) || 0;
    return l > 0 ? arr.slice(s, s + l) : arr.slice(s);
  }

  round3 = (n: number) => {
    // Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
    const valueNumber = Math.round((Number(n) + Number.EPSILON) * 100000000) / 100000000
    return (valueNumber == null || Number.isNaN(valueNumber)) ? valueNumber : cascadingRound(valueNumber, 3)
  }
}
