import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  const user = await getCurrentUser();
  if (user && hasRole(user, "reviewer", "operator")) redirect("/admin/reviews");
  if (user && hasRole(user, "finance")) redirect("/admin/payments");
  redirect("/admin/departures");
}
