import Avatar from "@/components/Avatar";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import Logo from "@/components/Logo";
import ModeToggle from "@/components/ModeToggle";
import { buttonClass, linkClass } from "@/components/ui";
import { isAdminDark } from "@/lib/admin-mode";
import { getCurrentUser } from "@/lib/auth";
import { getSiteCreator, isPrivateInstance } from "@/lib/instance";
import { prisma } from "@/lib/prisma";

export async function SiteHeader() {
  const [user, siteCreator, isPrivate, dark] = await Promise.all([
    getCurrentUser(),
    getSiteCreator(),
    isPrivateInstance(),
    isAdminDark(),
  ]);
  const [unread, unreadMessages] = user
    ? await Promise.all([
        prisma.notification.count({ where: { userId: user.id, readAt: null } }),
        prisma.message.count({ where: { recipientId: user.id, readAt: null } }),
      ])
    : [0, 0];
  const showMessages =
    (user !== null && (user.role === "CREATOR" ? user.allowDMs : Boolean(siteCreator?.allowDMs))) || unreadMessages > 0;
  // A single-creator instance is branded with the creator, except to signed-out visitors of a private one.
  const brand = siteCreator && (user || !isPrivate) ? siteCreator : null;

  return (
    <nav className="agora-header flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3">
      {brand ? (
        <Link href="/" className="agora-brand font-heading text-xl font-bold text-primary">
          {brand.name}
        </Link>
      ) : (
        <Link href="/" aria-label="Agora home">
          <Logo />
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {user ? (
          <>
            {user.role === "CREATOR" && (
              <Link href="/dashboard/posts/new" className={`${buttonClass} !py-1.5`}>New post</Link>
            )}
            {showMessages && (
              <Link href="/messages" className={linkClass}>
                Messages{unreadMessages > 0 && ` (${unreadMessages})`}
              </Link>
            )}
            <Link
              href="/notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              className="agora-bell relative rounded-full border border-line p-1.5 text-muted hover:text-primary"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-on-primary">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <Link href="/settings/profile" aria-label="Your profile" className="flex">
              <Avatar user={user} size={28} />
            </Link>
            <Link href="/dashboard" className={linkClass}>Dashboard</Link>
            <Link href="/settings" className={linkClass}>Settings</Link>
            <form action={logout}>
              <button className="underline">Log out</button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className={linkClass}>Log in</Link>
            <Link href="/signup" className={linkClass}>Sign up</Link>
          </>
        )}
        <ModeToggle dark={dark} />
      </div>
    </nav>
  );
}
