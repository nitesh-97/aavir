import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { listingInclude, toListingDTO } from "@/lib/serialize";
import { ProductExperience } from "@/components/ProductExperience";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { title: true, description: true },
  });
  if (!listing) return { title: "Listing not found — Aavir" };
  return {
    title: `${listing.title} — Aavir`,
    description: listing.description.slice(0, 160),
  };
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const [listing, session] = await Promise.all([
    prisma.listing.findUnique({ where: { id }, include: listingInclude }),
    getSession(),
  ]);

  if (!listing) notFound();
  // An unpublished draft stays visible to the seller who owns it.
  if (!listing.published && listing.sellerId !== session?.id) notFound();

  const dto = toListingDTO(listing);
  const isOwner = session?.id === listing.sellerId;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-muted hover:text-text">
          ← Back to browse
        </Link>
        {isOwner && (
          <Link href={`/sell/${listing.id}/edit`} className="btn-ghost">
            Edit listing
          </Link>
        )}
      </div>

      {!dto.published && (
        <p className="mb-5 rounded-xl border border-edge bg-panel-2 px-4 py-2.5 text-sm text-muted">
          This listing is a draft — only you can see it.
        </p>
      )}

      <ProductExperience listing={dto} />
    </div>
  );
}
