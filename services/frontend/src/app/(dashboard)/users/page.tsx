import { getUsers } from "@/lib/api/server";
import { UsersView } from "./view";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  let users: import("@/lib/types").PaginatedUsers | undefined;
  try {
    users = await getUsers(50);
  } catch {
    /* client hooks surface errors */
  }
  return <UsersView initialUsers={users} />;
}
