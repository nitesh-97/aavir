import type { ColorOption, Listing, SizeOption, User } from "@prisma/client";
import type { ListingDTO } from "./types";

type ListingWithRelations = Listing & {
  seller: Pick<User, "displayName">;
  colors: ColorOption[];
  sizes: SizeOption[];
};

/** Prisma rows carry Date objects, which cannot cross the server/client boundary. */
export function toListingDTO(listing: ListingWithRelations): ListingDTO {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    material: listing.material,
    modelUrl: listing.modelUrl,
    usdzUrl: listing.usdzUrl,
    posterUrl: listing.posterUrl,
    basePrice: listing.basePrice,
    currency: listing.currency,
    baseWidthCm: listing.baseWidthCm,
    baseHeightCm: listing.baseHeightCm,
    baseDepthCm: listing.baseDepthCm,
    published: listing.published,
    sellerId: listing.sellerId,
    sellerName: listing.seller.displayName,
    createdAt: listing.createdAt.toISOString(),
    colors: listing.colors
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        name: c.name,
        hex: c.hex,
        useOriginal: c.useOriginal,
        priceDelta: c.priceDelta,
      })),
    sizes: listing.sizes
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, label: s.label, scale: s.scale, priceDelta: s.priceDelta })),
  };
}

export const listingInclude = {
  seller: { select: { displayName: true } },
  colors: true,
  sizes: true,
} as const;
