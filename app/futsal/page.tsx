import { redirect } from "next/navigation";

export default function FutsalPage() {
  redirect("/dashboard?sport=futsal");
}
