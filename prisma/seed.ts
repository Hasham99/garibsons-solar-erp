import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import bcrypt from "bcryptjs"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🌱 Seeding database...")

  const adminPwd = await bcrypt.hash("admin123", 12)

  await prisma.user.upsert({
    where: { email: "admin@garibsons.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@garibsons.com",
      password: adminPwd,
      role: "ADMIN",
    },
  })
  console.log("✅ Admin user created")

  const year = new Date().getFullYear()
  for (const type of ["PO", "SO", "QT", "DO", "SOL-DO", "COST", "INV"]) {
    await prisma.counter.upsert({
      where: { id: `${type}-${year}` },
      update: {},
      create: { id: `${type}-${year}`, value: 0 },
    })
  }
  console.log("✅ Counters initialised")

  console.log("\n🎉 Seeding complete!")
  console.log("  Admin login: admin@garibsons.com / admin123")
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
