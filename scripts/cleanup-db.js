// Temporary DB cleanup utility — run with: node scripts/cleanup-db.js
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  await db.documentChunk.deleteMany({});
  await db.document.deleteMany({});
  await db.chatMessage.deleteMany({});
  console.log("DB cleaned");
  await db.$disconnect();
})();
