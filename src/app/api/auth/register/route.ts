import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, userPreferences } from "@/lib/db/schema";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, data.username))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const [user] = await db
      .insert(users)
      .values({
        email: data.email,
        username: data.username,
        passwordHash,
        role: "user",
      })
      .returning();

    await db.insert(userPreferences).values({
      userId: user.id,
      tautulliUsernames: [],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
