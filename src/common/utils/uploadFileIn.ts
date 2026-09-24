import * as FormData from 'form-data'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import * as isBetween from 'dayjs/plugin/isBetween' // นำเข้า plugin isBetween
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore' // นำเข้า plugin isSameOrBefore
import axios from 'axios'
dayjs.extend(isSameOrBefore) // เปิดใช้งาน plugin isSameOrBefore
dayjs.extend(isBetween) // เปิดใช้งาน plugin isBetween
dayjs.extend(utc)
dayjs.extend(timezone)

export async function uploadFilsTemp(
  file: any
) {
  const data = new FormData()
  const env =
    process.env.NODE_ENV ??
    'development'
  const pttEnv = [
    'production',
    'pre-production',
    'dr'
  ]
  const uploadUrl =
    pttEnv.includes(env)
      ? `http://${process.env.IP_URL}:${process.env.KONG_PORT}/files/uploadfile/`
      : `http://${process.env.IP_URL}:4006/uploadfile/`
  // uploadUrl: `https://tpasystem-pre-gw.pttplc.com/files/uploadfile/`,
  // uploadUrl: `http://${process.env.IP_URL}:8443/files/uploadfile/`,
  // uploadUrl: `http://${process.env.IP_URL}:4006/uploadfile/`,
  data.append(
    'file',
    file.buffer,
    file.originalname
  ) // ใช้ buffer ตรง ๆ และกำหนดชื่อไฟล์

  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: uploadUrl,
    headers: {
      ...data.getHeaders()
    },
    data: data
  }

  try {
    const response =
      await axios.request(
        config
      )
    return response.data // คืนค่าผลลัพธ์จาก API
  } catch (error) {
    console.error(
      'Upload error:',
      error.response?.data ||
        error.message
    )
    throw error // ส่งข้อผิดพลาดกลับไป
  }
}
