import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { absoluteUrl, WEBHOOK_EVENTS } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-theme bg-secondary p-3 text-sm"><code>{children}</code></pre>;
}

function Endpoint({ method, path, children }: { method: string; path: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p><code className="font-semibold">{method} {path}</code></p>
      <div className="text-muted">{children}</div>
    </div>
  );
}

export default async function ApiDocs() {
  await requireUser("CREATOR");
  const base = absoluteUrl("/api/v1");

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">API docs</h2>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Authentication</h3>
        <p>Create a key under API keys, then send it as a bearer token.</p>
        <Code>{`curl ${base}/me \\\n  -H "Authorization: Bearer agora_your_key"`}</Code>
        <p>
          Responses are JSON: <code>{`{ "data": … }`}</code>, or <code>{`{ "error": { "code", "message" } }`}</code> with a 4xx/5xx status.
          Lists take <code>limit</code> (1–100) and <code>cursor</code>, and return <code>nextCursor</code>.
          Each key is limited to 120 requests per minute.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Endpoints</h3>
        <Endpoint method="GET" path="/me">Your profile, currency and page URL.</Endpoint>
        <Endpoint method="GET" path="/posts">Your posts, newest first, with like and comment counts.</Endpoint>
        <Endpoint method="GET" path="/posts/{id}">One post.</Endpoint>
        <Endpoint method="POST" path="/posts">
          Publish a text post. Photos and videos are uploaded from the dashboard.
        </Endpoint>
        <Code>{`curl -X POST ${base}/posts \\
  -H "Authorization: Bearer agora_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Hello","text":"First post","visibility":"public"}'`}</Code>
        <p className="text-muted"><code>visibility</code> is <code>&quot;public&quot;</code> or a tier id (that tier and above can see it). Optionally add <code>{'"status": "draft"'}</code> to save it unpublished, or <code>publishAt</code> (an ISO time in the future) to schedule it. Posts in the list show a <code>status</code> of <code>draft</code>, <code>scheduled</code> or <code>published</code>.</p>
        <Endpoint method="GET" path="/tiers">Your tiers. Prices are in minor units (cents).</Endpoint>
        <Endpoint method="GET" path="/members">Active followers and subscribers, including gifts.</Endpoint>
        <Endpoint method="GET" path="/stats">Followers, subscribers, estimated monthly revenue and per-tier numbers.</Endpoint>
        <Endpoint method="GET" path="/notifications">Your notifications, newest first.</Endpoint>
      </div>

      <div id="webhooks" className="space-y-3">
        <h3 className="text-lg font-semibold">Webhooks</h3>
        <p>Add endpoints under Webhooks. Each delivery is a JSON POST:</p>
        <Code>{`{
  "id": "5b1c…",
  "type": "comment.created",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "data": { … }
}`}</Code>
        <ul className="space-y-1">
          {WEBHOOK_EVENTS.map((event) => (
            <li key={event.key}><code>{event.key}</code> <span className="text-muted">— {event.label}</span></li>
          ))}
          <li><code>ping</code> <span className="text-muted">— sent by &ldquo;Send test&rdquo;</span></li>
        </ul>
        <p>
          Headers: <code>X-Agora-Event</code>, <code>X-Agora-Delivery</code>, <code>X-Agora-Timestamp</code> and{" "}
          <code>X-Agora-Signature</code>, an HMAC-SHA256 of <code>{"{timestamp}.{body}"}</code> using your signing secret.
          Reject requests with an old timestamp and compare signatures in constant time.
        </p>
        <Code>{`import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, headers, rawBody) {
  const expected = "sha256=" + createHmac("sha256", secret)
    .update(headers["x-agora-timestamp"] + "." + rawBody)
    .digest("hex");
  const given = headers["x-agora-signature"];
  return given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}`}</Code>
        <p>
          Reply with any 2xx within 5 seconds. Network errors and 5xx responses are retried twice
          (after 2 and 10 seconds). Events are not queued across restarts.
        </p>
      </div>
    </section>
  );
}
