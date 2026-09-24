import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault(
  'Asia/Bangkok'
)

// ------

export const matchTypeWithMenu =
  (type: any) => {
    if (type) {
      switch (type) {
        case 'group-2':
          return 'Group TSO'
        case 'group-3':
          return 'Group Shippers'
        case 'group-4':
          return 'Group Other'
        case 'booking-template':
          return 'Capacity Right Template'
        case 'setup-background':
          return 'Main Menu Background'
        case 'account':
          return 'Users'
        case 'term-and-condition':
          return 'Terms & Conditions'
        case 'systemLogin':
          return 'Login Management Tool'
        case 'limit-concept-point':
          return 'concept point'
        default:
          return type.replaceAll(
            '-',
            ' '
          )
      }
    }
    return ''
  }

export const renameMethod = (
  method: any,
  type: any
) => {
  if (method) {
    switch (method) {
      case 'changeFromAccount':
        return 'edit'
      case 'duplicate-new':
        return 'duplicate'
      case 'reason-account':
        return 'edit reason'
      case 'status':
        return 'update status'
      case 'reset':
        switch (type) {
          case 'system-login':
          case 'account':
            return 'reset password'
          default:
            return method
        }
      case 'signature':
        return 'update signature'
      case 'change':
        switch (type) {
          case 'account':
            return 'edited from login management tool'
          default:
            return method
        }
      default:
        return method
    }
  }
  return ''
}
