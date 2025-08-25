// scripts/seed-client.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.client.create({
    data: {
      name: "Vese Web Dev",
      embedKey: "acme_live_1234567890",
      allowedOrigins: ["https://www.vesewebdev.it", "https://vesewebdev.it", "https://chat.krakenstudio.it"],
      status: "active",
    },
  });
  console.log("Client creato");
}
main().finally(() => prisma.$disconnect());
