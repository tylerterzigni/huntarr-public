import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { users, userPreferences } from "./schema";

async function seed() {
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) {
    console.log("Users exist, skipping seed.");
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@huntarr.local";
  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme";
  if (!process.env.SEED_ADMIN_PASSWORD || password === "changeme") {
    console.warn(
      "SEED_ADMIN_PASSWORD is using the default; set a strong value in the container environment before first boot."
    );
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const [admin] = await db
    .insert(users)
    .values({
      email,
      username,
      passwordHash,
      role: "admin",
    })
    .returning();

  await db.insert(userPreferences).values({
    userId: admin.id,
    tautulliUsernames: [],
  });

  console.log(`Seeded admin user: ${username} (${email})`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
