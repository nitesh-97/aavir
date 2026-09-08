import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatPrice } from "@/lib/types";
import { DeleteListingButton } from "@/components/DeleteListingButton";

export const dynamic = "force-dynamic";

export default async function SellerDashboard() {
  const session = await getSession();
  if (!session) redirect("/login");

  const listings = await prisma.listing.findMany({
    where: { sellerId: session.id },
    include: { _count: { select: { colors: true, sizes: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{session.displayName}</h1>
          <p className="text-sm text-muted">
            {listings.length} {listings.length === 1 ? "listing" : "listings"}
          </p>
        </div>
        <Link href="/sell/new" className="btn-primary">
          Upload a print
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold">No listings yet</p>
          <p className="mt-1 text-sm text-muted">
            Upload a GLB, add the colours and sizes you print in, and buyers can place it in
            their room.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li
              key={listing.id}
              className="card flex flex-wrap items-center gap-4 p-4"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-panel-2">
                {listing.posterUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={listing.posterUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center opacity-30">◈</div>
                )}
              </div>

              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold">{listing.title}</h2>
                  {!listing.published && (
                    <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] tracking-wide text-muted uppercase">
                      Draft
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatPrice(listing.basePrice, listing.currency)} ·{" "}
                  {listing._count.colors} colours · {listing._count.sizes} sizes
                </p>
              </div>

              <div className="flex gap-2">
                <Link href={`/listing/${listing.id}`} className="btn-ghost">
                  View
                </Link>
                <Link href={`/sell/${listing.id}/edit`} className="btn-ghost">
                  Edit
                </Link>
                <DeleteListingButton id={listing.id} title={listing.title} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
