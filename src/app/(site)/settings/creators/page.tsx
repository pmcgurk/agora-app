import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  decideApplication,
  inviteCreator,
  revokeInvite,
  setCreatorPage,
  setCreatorSignupMode,
  setMultiCreatorMode,
} from "@/app/actions/creators";
import Flash from "@/components/Flash";
import { buttonClass, cardClass, inputClass, linkClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import { INVITE_COOKIE } from "@/lib/invites";
import { getCreatorSettings, isInstanceOwner } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

const SIGNUP_OPTIONS = [
  { value: "INVITE", label: "Invite only", help: "You send each creator an invitation link. Nobody else can create a creator account." },
  { value: "OPEN", label: "Open sign-up", help: "Anyone can create a creator account from the sign-up page and pick their own page name." },
  { value: "APPROVAL", label: "Applications", help: "Anyone can apply. Applications wait here until you approve or reject them." },
];

export default async function CreatorsSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  if (!(await isInstanceOwner(user.id))) redirect("/settings/profile");
  const { notice, error } = await searchParams;

  const [settings, creators, invites, applications] = await Promise.all([
    getCreatorSettings(),
    prisma.user.findMany({
      where: { role: "CREATOR" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, slug: true },
    }),
    prisma.creatorInvite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creatorApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const multi = settings.multiCreator;
  const freshToken = (await cookies()).get(INVITE_COOKIE)?.value;
  const inviteLink = freshToken ? publicUrl(`/invite/${freshToken}`) : null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Creators</h2>
        <p className="text-sm text-muted">
          Only you can see this page. Each creator signs in with their own account and gets their own page.
        </p>
      </div>
      <Flash notice={notice} error={error} />

      <form action={setMultiCreatorMode} className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="multiCreator" defaultChecked={multi} />
          <span>
            <span className="block font-medium">Host more than one creator</span>
            <span className="block text-sm text-muted">
              {multi ? "Several creators can have pages on this site." : "Off: this site is your page alone."}
            </span>
          </span>
        </label>
        <button className={secondaryButtonClass}>Save</button>
      </form>

      {multi && (
        <>
          <form action={setCreatorSignupMode} className={`${cardClass} space-y-3 p-4`}>
            <h3 className="font-semibold">How new creators join</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {SIGNUP_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-theme border p-3 ${settings.signup === option.value ? "border-primary bg-secondary" : "border-line"}`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input type="radio" name="signup" value={option.value} defaultChecked={settings.signup === option.value} />
                    {option.label}
                  </span>
                  <span className="text-sm text-muted">{option.help}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button className={secondaryButtonClass}>Save sign-up option</button>
              {settings.signup === "OPEN" && (
                <Link href="/signup?as=creator" className={linkClass}>Preview the creator sign-up page</Link>
              )}
              {settings.signup === "APPROVAL" && (
                <Link href="/apply" className={linkClass}>Preview the application page</Link>
              )}
            </div>
          </form>

          {applications.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-semibold">Waiting for review ({applications.length})</h3>
              <ul className="space-y-3">
                {applications.map((application) => (
                  <li key={application.id} className={`${cardClass} space-y-3 p-4`}>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium">{application.name}</span>
                      <span className="text-sm text-muted">{application.email}</span>
                      <span className="text-sm text-muted">
                        {application.slug ? `wants /creators/${application.slug}` : "no page name yet"}
                      </span>
                      <span className="text-sm text-muted">applied {application.createdAt.toISOString().slice(0, 10)}</span>
                    </div>
                    {application.about && <p className="whitespace-pre-wrap text-sm">{application.about}</p>}
                    <div className="flex flex-wrap gap-2">
                      <form action={decideApplication}>
                        <input type="hidden" name="applicationId" value={application.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <button className={buttonClass}>Approve</button>
                      </form>
                      <form action={decideApplication}>
                        <input type="hidden" name="applicationId" value={application.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <button className={secondaryButtonClass}>Reject</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${cardClass} space-y-4 p-4`}>
            <h3 className="font-semibold">Invite a creator</h3>
            <form action={inviteCreator} className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm font-medium">
                Name
                <input name="name" required maxLength={100} className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Email
                <input name="email" type="email" required className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium sm:col-span-2">
                Page name <span className="font-normal text-muted">(optional, e.g. jo-makes)</span>
                <input name="slug" maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" className={inputClass} />
              </label>
              <div className="sm:col-span-2">
                <button className={buttonClass}>Send invite</button>
              </div>
            </form>

            {inviteLink && (
              <div className="rounded-theme bg-secondary p-3 text-sm">
                <p className="font-medium">Invite link (shown until you leave this page, for 10 minutes):</p>
                <code className="mt-1 block break-all">{inviteLink}</code>
              </div>
            )}

            {invites.length > 0 && (
              <ul className="divide-y divide-line">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="font-medium">{invite.name}</span>
                    <span className="text-muted">{invite.email}</span>
                    <span className="text-muted">
                      {invite.slug ? `/creators/${invite.slug}` : "page name chosen later"}
                    </span>
                    <span className="text-muted">expires {invite.expiresAt.toISOString().slice(0, 10)}</span>
                    <form action={revokeInvite} className="ml-auto">
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <button className="text-sm text-danger underline">Revoke</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">Creators on this site</h3>
            <ul className="space-y-3">
              {creators.map((creator) => (
                <li key={creator.id} className={`${cardClass} space-y-2 p-4`}>
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium">{creator.name}</span>
                    <span className="text-sm text-muted">{creator.email}</span>
                    {creator.id !== user.id && (
                      <Link href={creatorPath(creator)} className={`${linkClass} text-sm`}>View page</Link>
                    )}
                  </div>
                  <form action={setCreatorPage} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="userId" value={creator.id} />
                    <label className="block space-y-1 text-sm font-medium">
                      Page name
                      <input
                        name="slug"
                        defaultValue={creator.slug ?? ""}
                        maxLength={30}
                        pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]"
                        placeholder="none yet"
                        className={inputClass}
                      />
                    </label>
                    <button className={secondaryButtonClass}>Save page name</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
