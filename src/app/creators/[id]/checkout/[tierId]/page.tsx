import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { completeTestCheckout } from "@/app/actions/patron";
import { buttonClass, cardClass, linkClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { creatorPath, getCreator, supportPath } from "@/lib/creator";
import { formatPrice } from "@/lib/currency";
import { testCheckoutEnabled } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string; tierId: string }> }) {
  const { id, tierId } = await params;
  const creator = await getCreator(id);
  if (!creator) notFound();
  const tier = await prisma.tier.findFirst({ where: { id: tierId, creatorId: creator.id } });
  if (!tier || tier.price === 0 || !tier.active) notFound();

  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  if (viewer.role !== "PATRON" || !(await testCheckoutEnabled())) redirect(creatorPath(creator));

  return (
    <section className={`${cardClass} mx-auto max-w-md space-y-4`}>
      <h2 className="text-xl font-semibold">Checkout</h2>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-medium">{tier.name}</p>
          <p className="text-sm text-muted">{creator.name}</p>
        </div>
        <p className="text-xl font-bold text-primary">{formatPrice(tier.price, creator.currency)} / month</p>
      </div>
      <p className="rounded-theme bg-secondary p-3 text-sm">Test mode: no payment is taken.</p>
      <form action={completeTestCheckout} className="flex items-center gap-4">
        <input type="hidden" name="tierId" value={tier.id} />
        <button className={buttonClass}>Complete test payment</button>
        <Link href={await supportPath(creator)} className={linkClass}>Cancel</Link>
      </form>
    </section>
  );
}
