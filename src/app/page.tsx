import Link from "next/link";
import { prisma } from "@/lib/db";
import { listingInclude, toListingDTO } from "@/lib/serialize";
import { ListingCard } from "@/components/ListingCard";
import { CATEGORIES } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

export default async function BrowsePage({ searchParams }: Props) {
  const { q, category } = await searchParams;
  const query = q?.trim() ?? "";
  const activeCategory = category ?? "All";

  const listings = await prisma.listing.findMany({
    where: {
      published: true,
      ...(activeCategory !== "All" ? { category: activeCategory } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: listingInclude,
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const buildHref = (nextCategory: string) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (nextCategory !== "All") params.set("category", nextCategory);
    const search = params.toString();
    return search ? `/?${search}` : "/";
  };

  return (
    <div>
      <section className="mb-10">
        <h1 className="max-w-2xl text-4xl font-bold sm:text-5xl">
          See the print in your room{" "}
          <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent">
            before you order it
          </span>
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Every listing here can be placed on your floor at true scale, in the colour and size
          you would actually receive.
        </p>
      </section>

      <form className="mb-5 flex gap-2" action="/">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search prints…"
          className="field"
        />
        {activeCategory !== "All" && (
          <input type="hidden" name="category" value={activeCategory} />
        )}
        <button type="submit" className="btn-primary shrink-0">
          Search
        </button>
      </form>

      <div className="mb-8 flex flex-wrap gap-2">
        {["All", ...CATEGORIES].map((name) => (
          <Link
            key={name}
            href={buildHref(name)}
            className={`chip ${name === activeCategory ? "chip-on" : "text-muted"}`}
          >
            {name}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted">
            {query || activeCategory !== "All"
              ? "Try a different search or category."
              : "Run npm run db:seed to load the sample catalogue, or upload the first print."}
          </p>
          <Link href="/sell/new" className="btn-primary mt-5 inline-flex">
            Upload a print
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={toListingDTO(listing)} />
          ))}
        </div>
      )}
    </div>
  );
}
