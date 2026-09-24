export function buildUserIdLiteralIlikePattern(qInput?: string): string | null {
  const raw = qInput?.trim();
  if (!raw) {
    return null;
  }

  // ถ้าไม่มีตัวอักษร a-z เลย ไม่ต้องใช้ path พิเศษนี้ (ให้ใช้ contains ปกติ)
  if (!/[a-z]/i.test(raw)) {
    return null;
  }

  const escapeChar = '!';
  const escapeIlikeChar = (ch: string) => {
    if (ch === '%' || ch === '_' || ch === escapeChar) {
      return `${escapeChar}${ch}`;
    }
    return ch;
  };

  // literal contains: คง `_` เป็น `_` จริง (ไม่ให้กลายเป็น wildcard ของ ILIKE)
  return raw.split('').map(escapeIlikeChar).join('');
}

export const MODE_ACCOUNT_SEARCH_NAMES = [
  'LOCAL',
  'SSO',
] as const

const MODE_LABEL_SUFFIX = 'mode'

function modeNameMatchesQuery(
  modeName: string,
  qParts: string[],
): boolean {
  const name = modeName.toLowerCase()

  if (qParts.length === 0) {
    return false
  }

  if (qParts.length === 1) {
    const token = qParts[0].toLowerCase()
    return (
      name.startsWith(token) ||
      name.endsWith(token) ||
      name === token
    )
  }

  const first = qParts[0].toLowerCase()
  const tail = qParts
    .slice(1)
    .join('')
    .replace(/\s/g, '')
    .toLowerCase()

  if (tail && !MODE_LABEL_SUFFIX.startsWith(tail)) {
    return false
  }

  return (
    name.startsWith(first) ||
    name.endsWith(first)
  )
}

/**
 * ค้นหา mode_account แบบพิมพ์ทีละส่วน (prefix/suffix ของชื่อ + prefix ของ "mode")
 * - LOCAL: L, LOCAL, L m, LOCAL mode
 * - SSO: S, SSO, o m, o mode (พิมพ์ท้ายชื่อ SSO + ต่อท้าย mode)
 */
export function getMatchingModeAccountNames(
  qInput?: string,
  modeNames: readonly string[] = MODE_ACCOUNT_SEARCH_NAMES,
): string[] {
  const qTrim = qInput?.trim()
  if (!qTrim) {
    return []
  }

  const qParts = qTrim.split(/\s+/).filter(Boolean)

  return modeNames.filter((modeName) =>
    modeNameMatchesQuery(modeName, qParts),
  )
}

export function escapePostgresIlikeContains(
  input?: string,
): string | undefined {
  const s = input?.trim();
  if (!s) {
    return undefined;
  }

  // Postgres ILIKE/LIKE: `%` และ `_` เป็น wildcard — ต้อง escape ด้วย `\`
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
