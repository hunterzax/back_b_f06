// prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // ทำให้ทุก module สามารถใช้ได้โดยไม่ต้อง import หลายรอบ
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // <-- สำคัญ
})
export class PrismaModule {}
