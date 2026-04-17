import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { readFile } from "fs/promises";
import path from "path";

import { getPool } from "@/lib/dataSource/postgres";
import type { AppUser, UserRole } from "@/lib/types";

type StoredUser = AppUser & {
  salt: string;
  passwordHash: string;
};

type DbUserRow = {
  id: string;
  username: string;
  role: UserRole;
  clinic_key: string | null;
  salt: string;
  password_hash: string;
};

const usersPath = path.join(process.cwd(), "data", "users.json");
const globalForUsers = globalThis as unknown as { __usersTableReady?: boolean };

function validateUsers(value: unknown): StoredUser[] {
  if (!Array.isArray(value)) {
    throw new Error("Users file must be an array.");
  }

  return value as StoredUser[];
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

async function ensureUsersTable(): Promise<void> {
  if (globalForUsers.__usersTableReady) {
    return;
  }

  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('clinic_member', 'clinic_admin', 'master_admin')),
      clinic_key VARCHAR(50) REFERENCES clinics(clinic_key) ON DELETE SET NULL ON UPDATE CASCADE,
      salt VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);

  const countResult = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
  const existingCount = parseInt(countResult.rows[0]?.count ?? "0", 10);

  if (existingCount === 0) {
    try {
      const raw = await readFile(usersPath, "utf8");
      const users = validateUsers(JSON.parse(raw));

      for (const user of users) {
        await pool.query(
          `
            INSERT INTO users (id, username, role, clinic_key, salt, password_hash)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO NOTHING
          `,
          [user.id, user.username, user.role, user.clinicKey || null, user.salt, user.passwordHash]
        );
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  globalForUsers.__usersTableReady = true;
}

export function sanitizeUser(user: Pick<DbUserRow, "id" | "username" | "role" | "clinic_key">): AppUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    clinicKey: user.clinic_key
  };
}

export async function listUsers(): Promise<AppUser[]> {
  await ensureUsersTable();
  const pool = getPool();
  const result = await pool.query<DbUserRow>(
    `
      SELECT id, username, role, clinic_key, salt, password_hash
      FROM users
      ORDER BY username ASC
    `
  );

  return result.rows.map(sanitizeUser);
}

export async function verifyUserPassword(username: string, password: string): Promise<AppUser | null> {
  await ensureUsersTable();
  const pool = getPool();
  const normalizedUsername = username.trim().toLowerCase();
  const result = await pool.query<DbUserRow>(
    `
      SELECT id, username, role, clinic_key, salt, password_hash
      FROM users
      WHERE username = $1
      LIMIT 1
    `,
    [normalizedUsername]
  );
  const user = result.rows[0];

  if (!user) {
    return null;
  }

  const storedKey = Buffer.from(user.password_hash, "hex");
  const derivedKey = scryptSync(password, user.salt, storedKey.length);

  if (storedKey.length !== derivedKey.length) return null;
  if (!timingSafeEqual(storedKey, derivedKey)) return null;

  return sanitizeUser(user);
}

export async function createUser(input: {
  username: string;
  password: string;
  role: UserRole;
  clinicKey: string;
}): Promise<AppUser> {
  await ensureUsersTable();

  const username = input.username.trim().toLowerCase();
  const password = input.password.trim();
  const clinicKey = input.clinicKey.trim() || null;

  if (username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const pool = getPool();
  const salt = randomBytes(16).toString("hex");
  const id = randomUUID();

  try {
    const result = await pool.query<DbUserRow>(
      `
        INSERT INTO users (id, username, role, clinic_key, salt, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, username, role, clinic_key, salt, password_hash
      `,
      [id, username, input.role, clinicKey, salt, hashPassword(password, salt)]
    );

    return sanitizeUser(result.rows[0]);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      throw new Error("Username already exists.");
    }

    throw error;
  }
}

export async function updateUserAccess(userId: string, role: UserRole, clinicKey: string): Promise<AppUser> {
  await ensureUsersTable();
  const pool = getPool();
  const result = await pool.query<DbUserRow>(
    `
      UPDATE users
      SET role = $2, clinic_key = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, username, role, clinic_key, salt, password_hash
    `,
    [userId, role, clinicKey.trim() || null]
  );

  const user = result.rows[0];

  if (!user) {
    throw new Error("User not found.");
  }

  return sanitizeUser(user);
}

export async function deleteUser(userId: string): Promise<void> {
  await ensureUsersTable();
  const pool = getPool();
  const result = await pool.query("DELETE FROM users WHERE id = $1", [userId]);

  if ((result.rowCount ?? 0) === 0) {
    throw new Error("User not found.");
  }
}
