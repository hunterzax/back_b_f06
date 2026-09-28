export function parseToNumber(
  value: any
) {
  try {
    let valueString =
      `${value}`
        ?.trim()
        ?.replace(/,/g, '')
    // Check if value is wrapped in parentheses and convert to negative
    if (
      valueString &&
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
        ) // Remove parentheses and add negative sign
    }
    let valueNumber:
      | number
      | null =
      valueString === ''
        ? null
        : Number(valueString)
    if (
      Number.isNaN(
        valueNumber
      )
    ) {
      valueNumber = null
    }
    return valueNumber
  } catch (error) {
    return null
  }
}

export function cascadingRound(value: number, targetDecimals: number): number {
  // 1. แปลงตัวเลขเป็น string เพื่อดูจำนวนทศนิยมทั้งหมดที่มีอยู่จริง
  const valueString = value.toString();
  const decimalIndex = valueString.indexOf('.');
  
  // ถ้าไม่มีทศนิยม หรือจำนวนทศนิยมเดิมน้อยกว่าหรือเท่ากับตำแหน่งที่ต้องการอยู่แล้ว ให้คืนค่าเลย
  if (decimalIndex === -1) return value;
  
  const currentDecimals = valueString.length - decimalIndex - 1;
  if (currentDecimals <= targetDecimals) return value;

  let currentVal = value;

  // 2. ลูปปัดเศษไล่ย้อนกลับทีละตำแหน่ง จากขวาสุดมาจนถึงตำแหน่งเป้าหมาย
  for (let i = currentDecimals - 1; i >= targetDecimals; i--) {
      // ใช้สูตร Math.round แบบเลื่อนจุดทศนิยมเพื่อปัดเศษในตำแหน่งนั้นๆ
      const factor = Math.pow(10, i);
      currentVal = Math.round(currentVal * factor) / factor;
  }

  // 3. จัดการเรื่อง Floating point precision error (เช่นพวก 0.000000001 ที่อาจโผล่มา)
  return Number(currentVal.toFixed(targetDecimals));
}

export function parseToNumber8Decimal(
  value: any
) {
  const valueNumber =
    parseToNumber(value)
  const value8Decimal =
    valueNumber == null
      ? null
      : Math.round((valueNumber + Number.EPSILON) * 100000000) / 100000000 //parseFloat(valueNumber.toFixed(8))
  return value8Decimal
}

export function parseToNumber2Decimal(
  value: any
) {
  const valueNumber = parseToNumber8Decimal(value)
  const value2Decimal =
    valueNumber == null
      ? null
      : cascadingRound(valueNumber, 2) // Math.round((valueNumber + Number.EPSILON) * 100) / 100 //parseFloat(valueNumber.toFixed(2))
  return value2Decimal
}

export function parseToNumber3Decimal(
  value: any
) {
  const valueNumber = parseToNumber8Decimal(value)
  const value3Decimal =
    valueNumber == null
      ? null
      : cascadingRound(valueNumber, 3) // Math.round((valueNumber + Number.EPSILON) * 1000) / 1000 //parseFloat(valueNumber.toFixed(3))
  return value3Decimal
}

export function parseToNumber4Decimal(
  value: any
) {
  const valueNumber = parseToNumber8Decimal(value)
  const value4Decimal =
    valueNumber == null
      ? null
      : cascadingRound(valueNumber, 4) // Math.round((valueNumber + Number.EPSILON) * 10000) / 10000 //parseFloat(valueNumber.toFixed(4))
  return value4Decimal
}

export function parseToNumber6Decimal(
  value: any
) {
  const valueNumber = parseToNumber8Decimal(value)
  const value6Decimal =
    valueNumber == null
      ? null
      : cascadingRound(valueNumber, 6) // Math.round((valueNumber + Number.EPSILON) * 1000000) / 1000000 //parseFloat(valueNumber.toFixed(6))
  return value6Decimal
}

export function divideTo3Decimal(
  value: number | null,
  divisor: number
) {
  if (value == null) {
    return null
  }
  return cascadingRound(value / divisor, 3);
}

export function divideTo6Decimal(
  value: number | null,
  divisor: number
) {
  if (value == null) {
    return null
  }
  return cascadingRound(value / divisor, 6);
}

export function divideTo8Decimal(
  value: number | null,
  divisor: number
) {
  if (value == null) {
    return null
  }
  return cascadingRound(value / divisor, 8);
}
