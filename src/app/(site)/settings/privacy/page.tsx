import { savePrivacy } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import { buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isPrivateInstance } from "@/lib/instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PrivacySettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { notice, error } = await searchParams;
  const [isPrivate, tiers] = await Promise.all([
    isPrivateInstance(),
    prisma.tier.findMany({ where: { creatorId: user.id }, orderBy: { price: "asc" } }),
  ]);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Privacy</h2>
      <Flash notice={notice} error={error} />
      <form action={savePrivacy} className="space-y-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isPrivate" defaultChecked={isPrivate} />
          Private instance: only signed-in users can view anything
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="allowDMs" defaultChecked={user.allowDMs} />
          Allow direct messages from patrons
        </label>
        <label className="block space-y-1">
          <span>Who can message you</span>
          <select name="dmMinTierId" defaultValue={user.dmMinTierId ?? ""} className={inputClass}>
            <option value="">Any follower or member</option>
            {tiers.filter((tier) => tier.price > 0).map((tier) => (
              <option key={tier.id} value={tier.id}>{tier.name} and above</option>
            ))}
          </select>
        </label>
        <button className={buttonClass}>Save</button>
      </form>
    </section>
  );
}
