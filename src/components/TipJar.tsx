import { sendTip } from "@/app/actions/tips";
import { buttonClass, inputClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import type { getCreator } from "@/lib/creator";
import { formatMoney } from "@/lib/currency";
import { paymentMode } from "@/lib/payments";
import { MAX_TIP_MESSAGE, MAX_TIPPER_NAME, TIP_PRESETS } from "@/lib/tips";

type Creator = NonNullable<Awaited<ReturnType<typeof getCreator>>>;

export async function tipsAvailable(creator: Pick<Creator, "tipsEnabled">): Promise<boolean> {
  return creator.tipsEnabled && (await paymentMode()) !== "off";
}

// A friendly one-off tip card. Anyone can use it: logged-in patrons get their name pre-filled and
// guests can type one or stay anonymous. `returnTo` is where an error message should land.
export default async function TipJar({ creator, returnTo }: { creator: Creator; returnTo: string }) {
  const viewer = await getCurrentUser();
  if (viewer?.id === creator.id || !(await tipsAvailable(creator))) return null;

  return (
    <section id="tip" aria-label="Leave a tip" className="agora-card agora-tip scroll-mt-6 rounded-theme border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
            <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2 0 3.5 1.1 4.3 2.4l1.3 1.8 1.3-1.8c.8-1.3 2.3-2.4 4.3-2.4 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z" />
          </svg>
        </span>
        <div>
          <h2 className="text-lg font-semibold">Support {creator.name}</h2>
          <p className="text-sm text-muted">Enjoying the work? Leave a one-off tip. No account or subscription needed.</p>
        </div>
      </div>

      <form action={sendTip} className="mt-4 space-y-4">
        <input type="hidden" name="creatorId" value={creator.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Tip amount</legend>
          {TIP_PRESETS.map((preset) => (
            <label key={preset} className="cursor-pointer">
              <input type="radio" name="amount" value={(preset / 100).toFixed(2)} defaultChecked={preset === 500} className="peer sr-only" />
              <span className="inline-block rounded-full border border-line px-4 py-1.5 font-medium peer-checked:border-primary peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                {formatMoney(preset, creator.currency)}
              </span>
            </label>
          ))}
          <input
            name="customAmount"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`Other amount in ${creator.currency}`}
            placeholder={`Other (${creator.currency})`}
            className={`${inputClass} !w-36 !rounded-full`}
          />
        </fieldset>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">
            {viewer ? `Tipping as ${viewer.name}. Change your name or add a message` : "Add a name or message (optional)"}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              Your name
              <input name="tipperName" defaultValue={viewer?.name ?? ""} maxLength={MAX_TIPPER_NAME} placeholder="Leave blank to stay anonymous" className={inputClass} />
            </label>
            <label className="block">
              Message
              <input name="message" maxLength={MAX_TIP_MESSAGE} placeholder="Say something nice" className={inputClass} />
            </label>
          </div>
        </details>
        <button className={buttonClass}>Send tip</button>
      </form>
    </section>
  );
}
