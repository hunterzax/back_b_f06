import {Cache} from 'cache-manager'
import {CACHE_MANAGER} from '@nestjs/cache-manager'
import {
  Inject,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import {JwtService} from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'

export type User = any

@Injectable()
export class AuthService {
  private readonly users = [
    {
      userId: 1,
      username: 'admin',
      password:
        '$2b$10$bEXWzNQG8eInI23DZAswMufeWvKA4luRTrZAkU4rb2hEqQCdBFf/i'
    }
  ]

  constructor(
    private jwtService: JwtService
    // @Inject(CACHE_MANAGER) private cacheService: Cache,
  ) {}

  async findOne(
    username: string
  ): Promise<
    any | undefined
  > {
    return this.users.find(
      (user) =>
        user.username ===
        username
    )
  }

  async signIn(
    username: string,
    pass: string
  ): Promise<{
    accessToken: string
    data: any
  }> {
    const user =
      await this.findOne(
        username
      )
    const isMatch =
      await bcrypt.compare(
        pass,
        user?.password
      )
    if (!isMatch) {
      throw new UnauthorizedException()
    }
    const payload = {
      sub: user.userId,
      username: user.username,
      type: 'access'
    }
    return {
      data: payload,
      accessToken:
        await this.jwtService.signAsync(
          payload
        )
    }
  }

  async genPass() {
    const password = '1234'
    const salt =
      await bcrypt.genSalt()
    const hash =
      await bcrypt.hash(
        password,
        salt
      )

    const isMatch =
      await bcrypt.compare(
        password,
        hash
      )

    return {
      hash,
      isMatch
    }
  }

  async createCsrfToken({
    userId
  }: any) {
    const csrfToken = crypto
      .randomBytes(32)
      .toString('hex')

    // await this.cacheService.set(`csrf:${userId}`, csrfToken, 3600);
    return csrfToken
  }

  async validateCsrfToken(
    token: string,
    key: string,
    prefix: string
  ) {
    let keys = `${prefix}${key}`
    // let testCache: any = await this.cacheService.get(keys);
    // await this.cacheService.del(keys)

    // return token === testCache;
  }
}
