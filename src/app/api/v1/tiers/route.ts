import { route } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = route(async (_request, user) => {
  const tiers = await prisma.tier.findMany({ where: { creatorId: user.id }, orderBy: { price: "asc" } });
  return {
    body: {
      data: tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        description: tier.description,
        price: tier.price,
        currency: user.currency,
      })),
    },
  };
});
