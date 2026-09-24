import {
  Inject,
  Injectable
} from '@nestjs/common'
import {ClientGrpc} from '@nestjs/microservices'
import {
  Observable,
  firstValueFrom
} from 'rxjs'

interface FileService {
  UploadFileJSONBook(data: {
    file_content: Uint8Array
  }): Observable<{
    json_data: string
  }>
  UploadFileJSON(data: {
    file_content: Uint8Array
  }): Observable<{
    json_data: string
  }>
  UploadFile(data: {
    file_content: Uint8Array
  }): Observable<{
    json_data: string
  }>
  UploadFileTemp(data: {
    file_content: Uint8Array
  }): Observable<{
    json_data: string
  }>
  UploadFileMultiSheetTemp(data: {
    file_content: Uint8Array
  }): Observable<{
    json_data: string
  }>
}

@Injectable()
export class FileUploadService {
  private fileService: FileService

  constructor(
    @Inject('FILE_SERVICE')
    private client: ClientGrpc
  ) {}

  onModuleInit() {
    this.fileService =
      this.client.getService<FileService>(
        'FileService'
      )
  }

  async UploadFileJSON(
    fileBuffer: Buffer
  ) {
    if (
      fileBuffer.length === 0
    ) {
      throw new Error(
        'File buffer is empty'
      )
    }

    // ใช้ Uint8Array.from() เพื่อแปลง buffer
    const response =
      await firstValueFrom(
        this.fileService.UploadFileJSON(
          {
            file_content:
              Uint8Array.from(
                fileBuffer
              )
          }
        )
      )

    return response
  }

  async UploadFileJSONBook(
    json: any
  ) {
    const payload = json

    let rows: any[]

    if (
      Array.isArray(payload)
    ) {
      rows = payload
    } else {
      const keys =
        Object.keys(
          payload
        ).filter((k) =>
          /^\d+$/.test(k)
        )
      if (keys.length > 0) {
        rows = keys
          .sort(
            (a, b) =>
              Number(a) -
              Number(b)
          )
          .map(
            (k) => payload[k]
          )
      } else if (
        Array.isArray(
          payload?.data
        )
      ) {
        rows = payload.data
      } else if (
        Array.isArray(
          payload?.rows
        )
      ) {
        rows = payload.rows
      } else {
        throw new Error(
          'fnJSONtoOBJBook is an object but not convertible to rows array'
        )
      }
    }

    const buf = Buffer.from(
      JSON.stringify(rows),
      'utf8'
    )

    const response =
      await firstValueFrom(
        this.fileService.UploadFileJSONBook(
          {
            file_content: buf
          }
        )
      )

    return response
  }

  async uploadFile(
    fileBuffer: Buffer
  ) {
    if (
      fileBuffer.length === 0
    ) {
      throw new Error(
        'File buffer is empty'
      )
    }

    // ใช้ Uint8Array.from() เพื่อแปลง buffer
    const response =
      await firstValueFrom(
        this.fileService.UploadFile(
          {
            file_content:
              Uint8Array.from(
                fileBuffer
              )
          }
        )
      )

    return response
  }

  async uploadFileTemp(
    fileBuffer: Buffer
  ) {
    if (
      fileBuffer.length === 0
    ) {
      throw new Error(
        'File buffer is empty'
      )
    }

    const response =
      await firstValueFrom(
        this.fileService.UploadFileTemp(
          {
            file_content:
              Uint8Array.from(
                fileBuffer
              )
          }
        )
      )

    return response
  }

  async uploadFileTempMultiSheet(
    fileBuffer: Buffer
  ) {
    if (
      fileBuffer.length === 0
    ) {
      throw new Error(
        'File buffer is empty'
      )
    }

    const response =
      await firstValueFrom(
        this.fileService.UploadFileMultiSheetTemp(
          {
            file_content:
              Uint8Array.from(
                fileBuffer
              )
          }
        )
      )

    return response
  }
}
