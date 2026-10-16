import { Tower } from "@/features/tower/tower";
import { currentUser } from "@/server/infrastructure/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <Tower user={{ id: user.id, name: user.display_name, email: user.email }} />
  );
}
