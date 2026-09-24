const DECIMAL_STRING_PATTERN =
  /^-?\d+(\.\d+)?$/

function sanitizeDecimalString(
  value: any
): string | null {
  try {
    let valueString =
      `${value}`
        ?.trim()
        ?.replace(/,/g, '')

    if (!valueString) {
      return null
    }

    if (
      valueString.startsWith(
        '('
      ) &&
      valueString.endsWith(
        ')'
      )
    ) {
      valueString =
        '-' +
        valueString.slice(
          1,
          -1
        )
    }

    if (
      !DECIMAL_STRING_PATTERN.test(
        valueString
      )
    ) {
      return null
    }

    return valueString
  } catch (error) {
    return null
  }
}

function roundHalfUpFromDecimalString(
  decimalString: string,
  decimals: number
): number {
  const negative =
    decimalString.startsWith(
      '-'
    )
  const abs = negative
    ? decimalString.slice(
        1
      )
    : decimalString
  const [intPart, decPart = ''] =
    abs.split('.')
  const safeIntPart =
    intPart === ''
      ? '0'
      : intPart
  const padded = decPart.padEnd(
    decimals + 1,
    '0'
  )
  const keep = padded
    .slice(0, decimals)
    .padEnd(decimals, '0')
  const roundDigit = parseInt(
    padded[decimals] ?? '0',
    10
  )

  let scaled = BigInt(
    safeIntPart + keep
  )

  if (roundDigit >= 5) {
    scaled += 1n
  }

  const result =
    Number(scaled) /
    10 ** decimals

  return negative
    ? -result
    : result
}

function normalizeNumberToDecimalString(
  value: number,
  maxDecimals: number
): string {
  return value.toFixed(
    maxDecimals
  )
}

export function roundHalfUpDecimal(
  value: any,
  decimals: number
) {
  const decimalString =
    sanitizeDecimalString(
      value
    )

  if (decimalString) {
    return roundHalfUpFromDecimalString(
      decimalString,
      decimals
    )
  }

  const valueNumber =
    parseToNumber(value)

  if (valueNumber == null) {
    return null
  }

  const normalizeDecimals =
    Math.max(
      decimals + 5,
      8
    )
  const normalizedString =
    normalizeNumberToDecimalString(
      valueNumber,
      normalizeDecimals
    )

  return roundHalfUpFromDecimalString(
    normalizedString,
    decimals
  )
}

export function parseToNumber(
  value: any
) {
  try {
    const valueString =
      sanitizeDecimalString(
        value
      )

    if (valueString) {
      const valueNumber =
        Number(valueString)

      if (
        Number.isNaN(
          valueNumber
        )
      ) {
        return null
      }

      return valueNumber
    }

    let fallbackString =
      `${value}`
        ?.trim()
        ?.replace(/,/g, '')

    if (
      fallbackString &&
      fallbackString.startsWith(
        '('
      ) &&
      fallbackString.endsWith(
        ')'
      )
    ) {
      fallbackString =
        '-' +
        fallbackString.slice(
          1,
          -1
        )
    }

    const valueNumber =
      fallbackString ===
      ''
        ? null
        : Number(
            fallbackString
          )

    if (
      valueNumber != null &&
      Number.isNaN(
        valueNumber
      )
    ) {
      return null
    }

    return valueNumber
  } catch (error) {
    return null
  }
}

export function parseToNumber3Decimal(
  value: any
) {
  return roundHalfUpDecimal(
    value,
    3
  )
}

export function parseToNumber4Decimal(
  value: any
) {
  return roundHalfUpDecimal(
    value,
    4
  )
}

export function parseToNumber6Decimal(
  value: any
) {
  return roundHalfUpDecimal(
    value,
    6
  )
}

export function parseToNumber8Decimal(
  value: any
) {
  return roundHalfUpDecimal(
    value,
    8
  )
}

export function divideTo3Decimal(
  value: number | null,
  divisor: number
) {
  if (value == null) {
    return null
  }
  const scaled =
    Math.round(
      (value +
        Number.EPSILON) *
        1000
    )
  return (
    Math.round(
      scaled / divisor
    ) / 1000
  )
}

export function divideTo8Decimal(
  value: number | null,
  divisor: number
) {
  if (value == null) {
    return null
  }
  const scaled =
    Math.round(
      (value +
        Number.EPSILON) *
        100000000
    )
  return (
    Math.round(
      scaled / divisor
    ) / 100000000
  )
}
