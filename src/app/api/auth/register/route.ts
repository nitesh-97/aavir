import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { email, errorResponse, str, ValidationError } from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = email(body.email);
    const password = str(body.password, "Password", { min: 8, max: 200 });
    const displayName = str(body.displayName, "Shop name", { min: 2, max: 60 });

    const existing = await prisma.user.findUnique({ where: { email: address } });
    if (existing) throw new ValidationError("An account with that email already exists.");

    const user = await prisma.user.create({
      data: { email: address, displayName, passwordHash: await hashPassword(password) },
    });

    await createSession({ id: user.id, email: user.email, displayName: user.displayName });
    return Response.json({ id: user.id, displayName: user.displayName });
  } catch (error) {
    return errorResponse(error);
  }
}
