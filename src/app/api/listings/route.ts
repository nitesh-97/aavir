import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { errorResponse } from "@/lib/validate";
import { parseListingBody } from "@/lib/listing-payload";
import { listingInclude, toListingDTO } from "@/lib/serialize";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim();

  const listings = await prisma.listing.findMany({
    where: {
      published: true,
      ...(category && category !== "All" ? { category } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
            ],
          }
        : {}),
    },
    include: listingInclude,
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return Response.json(listings.map(toListingDTO));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to publish a listing." }, { status: 401 });

  try {
    const data = parseListingBody(await request.json());
    const { colors, sizes, ...fields } = data;

    const listing = await prisma.listing.create({
      data: {
        ...fields,
        sellerId: session.id,
        colors: { create: colors },
        sizes: { create: sizes },
      },
      include: listingInclude,
    });

    return Response.json(toListingDTO(listing), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
