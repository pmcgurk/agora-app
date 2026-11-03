import { route } from "@/lib/api";
import { absoluteUrl } from "@/lib/webhooks";
import { creatorPath } from "@/lib/creator";

export const GET = route(async (_request, user) => ({
  body: {
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      tagline: user.tagline,
      currency: user.currency,
      allowDMs: user.allowDMs,
      url: absoluteUrl(creatorPath(user)),
    },
  },
}));
