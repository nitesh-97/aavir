import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { listingInclude, toListingDTO } from "@/lib/serialize";
import { ListingForm } from "@/components/ListingForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditListingPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const listing = await prisma.listing.findUnique({ where: { id }, include: listingInclude });

  if (!listing) notFound();
  if (listing.sellerId !== session.id) notFound();

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold">Edit listing</h1>
      <ListingForm existing={toListingDTO(listing)} />
    </div>
  );
}
