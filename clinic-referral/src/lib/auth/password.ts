import { readFile } from "fs/promises";
import { scryptSync, timingSafeEqual } from "crypto";
import path from "path";

type User = {
  id: string;
  username: string;
  salt: string;
  passwordHash: string;
};

const usersPath = path.join(process.cwd(), "data", "users.json");

async function loadUsers(): Promise<User[]> {
  const raw = await readFile(usersPath, "utf8");
  const parsed = JSON.parse(raw) as User[];

  if (!Array.isArray(parsed)) {
    throw new Error("Users file must be an array.");
  }

  return parsed;
}

export async function verifyUserPassword(username: string, password: string): Promise<User | null> {
  const users = await loadUsers();
  const user = users.find(u => u.username === username);

  if (!user) {
    return null;
  }

  const { salt, passwordHash } = user;
  const storedKey = Buffer.from(passwordHash, "hex");
  const derivedKey = scryptSync(password, salt, storedKey.length);

  if (storedKey.length !== derivedKey.length) return null;
  const isValid = timingSafeEqual(storedKey, derivedKey);
  return isValid ? user : null;
}
