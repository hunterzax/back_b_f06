import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  Session,
  UnauthorizedException,
  UseGuards,
  Version,
  Headers,
  HttpException,
  Query
} from '@nestjs/common'
import {AuthService} from './auth.service'
import {AuthGuard} from './auth.guard'

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService
  ) {}

  @UseGuards(AuthGuard)
  @Version('1')
  @Get()
  findAllV1(): any {
    return this.authService.genPass()
  }

  @Version('1')
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(
    @Res() res,
    @Body()
    signInDto: Record<
      string,
      any
    >
  ) {
    const result =
      await this.authService.signIn(
        signInDto.username,
        signInDto.password
      )
    res.cookie(
      'accessToken',
      result?.accessToken,
      {
        maxAge: 2592000000, // 30 days
        sameSite: true,
        secure: false,
        httpOnly: false,
        domain: '.nueamek.app'
      }
    )

    // return this.authService.signIn(signInDto.username, signInDto.password);
    res.send({
      ...result?.data
    })
  }

  //   @UseGuards(AuthGuard)
  // @Version('1')
  // @Post('demoCSRF')
  // async demoCSRF(
  //   @Body() body: any,
  //   @Headers('csrf-token') csrfToken: string,
  //   @Headers('session-id') sessionId: string,
  //   @Req() req: any,
  // ) {

  //   let validate = await this.authService.validateCsrfToken(
  //     csrfToken,
  //     sessionId,
  //     "csrf:",
  //   );
  //   if (!validate) {
  //     throw new HttpException('Invalid CSRF token', HttpStatus.FORBIDDEN);
  //   } else {
  //     return 'demoCSRF';
  //   }
  // }

  // //   @UseGuards(AuthGuard)
  // @Version('1')
  // @Get('csrfToken')
  // async csrfToken(@Query() query: any) {
  //   const token = await this.authService.createCsrfToken({userId: query?.sessionId});
  //   return { csrfToken: token, sessionId: query?.sessionId };
  // }

  // /master/auth/callback-sso
  @HttpCode(HttpStatus.OK)
  @Post('callback-sso')
  async callbackSSO(
    @Res() res,
    @Req() req: any,
    @Body() body: any
  ) {
    return
  }
}
