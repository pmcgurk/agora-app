import Link from "next/link";
import { needsVerification } from "@/lib/account-email";
import { getCurrentUser } from "@/lib/auth";

// Asks a signed-in person who has not confirmed their email to do so. Only shown on sites that can send email.
export default async function VerifyBanner() {
  const user = await getCurrentUser();
  if (!user || !(await needsVerification(user))) return null;
  return (
    <div role="region" aria-label="Confirm your email" className="border-b border-line bg-secondary px-4 py-2 text-center text-sm text-text">
      Confirm your email address ({user.email}) to comment and send messages. We sent you a link.{" "}
      <Link href="/verify-email" className="agora-link text-primary underline">Send it again</Link>
    </div>
  );
}
