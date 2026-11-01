import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { type UserInsert, type UserSelect, usersTable } from "./schema.js";

export async function createUser(
  db: PostgresJsDatabase<Record<string, unknown>>,
  data: UserInsert,
): Promise<UserSelect> {
  const [created] = await db
    .insert(usersTable)
    .values({
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      role: data.role ?? "USER",
    })
    .returning();
  return created;
}

export async function findUserByEmail(
  db: PostgresJsDatabase<Record<string, unknown>>,
  email: string,
): Promise<UserSelect | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);
  return user ?? null;
}

export async function findUserById(
  db: PostgresJsDatabase<Record<string, unknown>>,
  id: string,
): Promise<UserSelect | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return user ?? null;
}
