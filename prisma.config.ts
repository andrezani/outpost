// Prisma configuration for Outpost
// NOTE: do NOT import dotenv/config here — Railway injects env vars at runtime.
// Local dev: DATABASE_URL is set in .env, loaded by NestJS app bootstrap, not Prisma CLI.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
