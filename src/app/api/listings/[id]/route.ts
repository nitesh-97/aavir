import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { errorResponse } from "@/lib/validate";
import { parseListingBody } from "@/lib/listing-payload";
import { listingInclude, toListingDTO } from "@/lib/serialize";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({ where: { id }, include: listingInclude });
  if (!listing) return Response.json({ error: "Listing not found." }, { status: 404 });
  return Response.json(toListingDTO(listing));
}

/** Only the seller who created a listing may change or remove it. */
async function assertOwner(id: string) {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };

  const listing = await prisma.listing.findUnique({ where: { id }, select: { sellerId: true } });
  if (!listing) return { error: Response.json({ error: "Listing not found." }, { status: 404 }) };
  if (listing.sellerId !== session.id) {
    return { error: Response.json({ error: "That listing isn't yours." }, { status: 403 }) };
  }
  return { error: null };
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const { error } = await assertOwner(id);
  if (error) return error;

  try {
    const data = parseListingBody(await request.json());
    const { colors, sizes, ...fields } = data;

    // Options are replaced wholesale, so the write has to be atomic.
    const listing = await prisma.$transaction(async (tx) => {
      await tx.colorOption.deleteMany({ where: { listingId: id } });
      await tx.sizeOption.deleteMany({ where: { listingId: id } });
      return tx.listing.update({
        where: { id },
        data: { ...fields, colors: { create: colors }, sizes: { create: sizes } },
        include: listingInclude,
      });
    });

    return Response.json(toListingDTO(listing));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const { error } = await assertOwner(id);
  if (error) return error;

  await prisma.listing.delete({ where: { id } });
  return Response.json({ ok: true });
}
