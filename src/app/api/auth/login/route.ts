import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { email, errorResponse, str, ValidationError } from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = email(body.email);
    const password = str(body.password, "Password", { min: 1, max: 200 });

    const user = await prisma.user.findUnique({ where: { email: address } });
    // Same message either way, so this can't be used to enumerate accounts.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new ValidationError("Email or password is incorrect.");
    }

    await createSession({ id: user.id, email: user.email, displayName: user.displayName });
    return Response.json({ id: user.id, displayName: user.displayName });
  } catch (error) {
    return errorResponse(error);
  }
}
