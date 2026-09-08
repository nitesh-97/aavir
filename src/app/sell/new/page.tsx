import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ListingForm } from "@/components/ListingForm";

export const metadata = { title: "Upload a print — Aavir" };

export default async function NewListingPage() {
  if (!(await getSession())) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Upload a print</h1>
      <p className="mb-8 text-sm text-muted">
        The model is measured in the browser, so the sizes you set here are the real
        centimetres buyers will see standing on their floor.
      </p>
      <ListingForm />
    </div>
  );
}
