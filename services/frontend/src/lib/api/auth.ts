import { ApiError, api } from "./client";

export async function login(password: string): Promise<boolean> {
  try {
    const resp = await api.post<{ ok: boolean }>("/api/auth/login", {
      password,
    });
    return resp.ok;
  } catch (err) {
    if (err instanceof ApiError) return false;
    throw err;
  }
}
