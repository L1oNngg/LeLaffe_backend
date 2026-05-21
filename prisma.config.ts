import "dotenv/config";
import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Ép Prisma dùng link Direct (5432) để không bị lỗi P1000/P1012
    url: process.env.DIRECT_URL,
  },
  migrations: {
    // Config lệnh seed chuẩn cho Prisma 7
    seed: 'ts-node --project tsconfig.seed.json --transpile-only prisma/seed.ts',
  },
});