import {
  Injectable,
  OnModuleInit,
  Inject
} from '@nestjs/common'
import {ClientGrpc} from '@nestjs/microservices'
import {Observable} from 'rxjs'

interface EmailService {
  sendEmail(data: {
    to: string
    subject: string
    body: string
  }): Observable<{
    status: string
  }>
}

@Injectable()
export class EmailClientService
  implements OnModuleInit
{
  private emailService: EmailService

  constructor(
    @Inject('Go_EMAIL')
    private readonly client: ClientGrpc
  ) {}

  onModuleInit() {
    this.emailService =
      this.client.getService<EmailService>(
        'EmailService'
      )
  }

  sendEmail(
    to: string,
    subject: string,
    body: string
  ): Observable<{
    status: string
  }> {
    return this.emailService.sendEmail(
      {to, subject, body}
    )
  }
}
