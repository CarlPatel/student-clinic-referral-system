import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { readFile, writeFile } from "fs/promises";
import path from "path";

import type { AppUser, UserRole } from "@/lib/types";

type StoredUser = AppUser & {
  salt: string;
  passwordHash: string;
};

const usersPath = path.join(process.cwd(), "data", "users.json");

function validateUsers(value: unknown): StoredUser[] {
  if (!Array.isArray(value)) {
    throw new Error("Users file must be an array.");
  }

  return value as StoredUser[];
}

async function loadStoredUsers(): Promise<StoredUser[]> {
  const raw = await readFile(usersPath, "utf8");
  return validateUsers(JSON.parse(raw));
}

async function saveStoredUsers(users: StoredUser[]): Promise<void> {
  await writeFile(usersPath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

export function sanitizeUser(user: StoredUser): AppUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    clinicKey: user.clinicKey
  };
}

export async function listUsers(): Promise<AppUser[]> {
  const users = await loadStoredUsers();
  return users
    .map(sanitizeUser)
    .sort((left, right) => left.username.localeCompare(right.username));
}

export async function verifyUserPassword(username: string, password: string): Promise<AppUser | null> {
  const users = await loadStoredUsers();
  const user = users.find((entry) => entry.username === username);

  if (!user) {
    return null;
  }

  const storedKey = Buffer.from(user.passwordHash, "hex");
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
  const username = input.username.trim().toLowerCase();
  const password = input.password.trim();
  const clinicKey = input.clinicKey.trim();

  if (username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const users = await loadStoredUsers();

  if (users.some((user) => user.username === username)) {
    throw new Error("Username already exists.");
  }

  const salt = randomBytes(16).toString("hex");
  const storedUser: StoredUser = {
    id: randomUUID(),
    username,
    role: input.role,
    clinicKey,
    salt,
    passwordHash: hashPassword(password, salt)
  };

  users.push(storedUser);
  await saveStoredUsers(users);
  return sanitizeUser(storedUser);
}

export async function updateUserAccess(userId: string, role: UserRole, clinicKey: string): Promise<AppUser> {
  const users = await loadStoredUsers();
  const user = users.find((entry) => entry.id === userId);

  if (!user) {
    throw new Error("User not found.");
  }

  user.role = role;
  user.clinicKey = clinicKey.trim();
  await saveStoredUsers(users);
  return sanitizeUser(user);
}

export async function deleteUser(userId: string): Promise<void> {
  const users = await loadStoredUsers();
  const nextUsers = users.filter((user) => user.id !== userId);

  if (nextUsers.length === users.length) {
    throw new Error("User not found.");
  }

  await saveStoredUsers(nextUsers);
}
