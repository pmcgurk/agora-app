import { credentialProblems } from "@/lib/secrets";

// Tells the owner, on the pages where keys are saved, whether those keys are protected in the database.
export default async function CredentialNotice() {
  const { status, plainTextStored, unreadable } = await credentialProblems();
  let message: string | null = null;
  if (unreadable) {
    message = "Some saved keys can't be read: APP_SECRET has changed or is missing. Enter them again to save them under the current secret.";
  } else if (status === "weak") {
    message = "APP_SECRET is set but shorter than 16 characters, so it isn't used. Saved keys are stored unencrypted until you set a longer one.";
  } else if (status === "off") {
    message = plainTextStored
      ? "Saved keys are stored unencrypted in the database. Set APP_SECRET in the server's environment and restart to encrypt them."
      : "Set APP_SECRET in the server's environment before saving keys here, so they are stored encrypted.";
  } else if (plainTextStored) {
    message = "Some saved keys are not encrypted yet. They will be the next time the server restarts.";
  }
  if (!message) return null;
  return (
    <p role="note" className="rounded-theme border border-line bg-secondary p-3 text-sm">
      <strong>Saved keys.</strong> {message}
    </p>
  );
}
