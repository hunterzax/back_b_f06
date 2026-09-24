import {
  Injectable,
  OnModuleInit,
  Inject
} from '@nestjs/common'
import {ClientGrpc} from '@nestjs/microservices'
import {Observable} from 'rxjs'

interface DataService {
  getData(payload: {
    query: string
  }): Observable<{
    result: string
  }>
}

@Injectable()
export class TranfClientService
  implements OnModuleInit
{
  private dataService: DataService // เพิ่ม property

  constructor(
    @Inject('TRANF_SERVICE')
    private readonly client: ClientGrpc
  ) {}

  onModuleInit() {
    this.dataService =
      this.client.getService<DataService>(
        'DataService'
      )
  }

  sendTranfPython(
    payload: any
  ): Observable<{
    result: string
  }> {
    return this.dataService.getData(
      payload
    )
  }
}
