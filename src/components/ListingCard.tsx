import Link from "next/link";
import { ModelThumb } from "./ModelThumb";
import { formatPrice, type ListingDTO } from "@/lib/types";

export function ListingCard({ listing }: { listing: ListingDTO }) {
  const swatches = listing.colors.slice(0, 5);
  const extraColors = listing.colors.length - swatches.length;

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="card group overflow-hidden transition hover:border-brand"
    >
      <div className="relative aspect-square bg-panel-2">
        {listing.posterUrl ? (
          // Uploaded/generated thumbnails are plain files on disk, so the plain
          // img tag avoids routing them through the image optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.posterUrl}
            alt={listing.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <ModelThumb src={listing.modelUrl} alt={listing.title} />
        )}

        <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold tracking-wide text-white uppercase backdrop-blur-sm">
          AR ready
        </span>
      </div>

      <div className="p-4">
        <h3 className="truncate font-semibold">{listing.title}</h3>
        <p className="mt-0.5 truncate text-xs text-muted">
          {listing.sellerName} · {listing.material}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="font-bold">
            {formatPrice(listing.basePrice, listing.currency)}
          </span>

          <span className="flex items-center gap-1">
            {swatches.map((color) => (
              <span
                key={color.id}
                title={color.name}
                className="h-3.5 w-3.5 rounded-full border border-edge"
                style={{
                  background: color.useOriginal
                    ? "linear-gradient(135deg,#e8ecf3,#8a93a6)"
                    : color.hex,
                }}
              />
            ))}
            {extraColors > 0 && <span className="text-[10px] text-muted">+{extraColors}</span>}
          </span>
        </div>
      </div>
    </Link>
  );
}
