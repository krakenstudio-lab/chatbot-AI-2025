// src/lib/prisma.js
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"], // aggiungi 'query' in debug se vuoi
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
