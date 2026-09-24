import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ----- [Optional] ----
// ถ้าใช้ hot-reload หรือ dev server ที่ reload บ่อย
// ป้องกันการ new PrismaClient ซ้ำ
const globalForPrisma = global as unknown as { prisma?: PrismaService };

// ----- [PrismaService] ----
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // log: ['query', 'info', 'warn', 'error'],
      log: ['error'],
    });

    // ป้องกันใน dev environment ไม่ให้ new PrismaClient ซ้ำ
    const pttEnv = ['production', 'pre-production', 'dr'];
    if (!pttEnv.includes(process.env.NODE_ENV)) {
      if (!globalForPrisma.prisma) {
        globalForPrisma.prisma = this;
      }
      return globalForPrisma.prisma;
    }
  }

  async onModuleInit() {
    this.logger.log('Prisma Client connecting...');
    await this.$connect();
    this.logger.log('Prisma Client connected');
  }

  async onModuleDestroy() {
    this.logger.log('Prisma Client disconnecting...');
    await this.$disconnect();
    this.logger.log('Prisma Client disconnected');
  }
}
