"use client";

import { useState, type ReactNode } from "react";
import { formatPrice } from "@/lib/currency";
import { buttonClass, cardClass, inputClass, secondaryButtonClass } from "@/components/ui";

export type TierValues = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  perks: string[];
  badge: string | null;
  highlighted: boolean;
  welcomeMessage?: string | null;
  active: boolean;
};

export const PERK_LIMIT = 12;
export const PERK_LENGTH = 120;
export const BADGE_LENGTH = 24;

let nextRow = 0;
const row = (text: string) => ({ key: `perk-${nextRow++}`, text });

// One editor for every tier: the dashboard, the support page and the new-tier form all use it.
// Each section is a block; the live preview mirrors the card visitors see on the support page.
export default function TierEditor({
  tier,
  currency,
  action,
  returnTo,
  creating = false,
  extra,
}: {
  tier?: TierValues;
  currency: string;
  action: (formData: FormData) => void | Promise<void>;
  returnTo?: string;
  creating?: boolean;
  extra?: ReactNode;
}) {
  const [name, setName] = useState(tier?.name ?? "");
  const [price, setPrice] = useState(tier && tier.price > 0 ? (tier.price / 100).toFixed(2) : "");
  const [description, setDescription] = useState(tier?.description ?? "");
  const [badge, setBadge] = useState(tier?.badge ?? "");
  const [welcome, setWelcome] = useState(tier?.welcomeMessage ?? "");
  const [highlighted, setHighlighted] = useState(tier?.highlighted ?? false);
  const [perks, setPerks] = useState(() => (tier?.perks ?? []).map(row));

  const paid = creating || (tier?.price ?? 0) > 0;
  const cents = Math.round(Number(price) * 100);
  const previewPrice = paid ? (Number.isFinite(cents) && cents > 0 ? formatPrice(cents, currency) : "Price") : "Free";

  function move(index: number, step: -1 | 1) {
    setPerks((current) => {
      const target = index + step;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  return (
    <form action={action} className={`${cardClass} space-y-6 p-5 ${highlighted ? "ring-2 ring-primary" : ""}`}>
      {tier && <input type="hidden" name="tierId" value={tier.id} />}
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Details</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm font-medium">
                Name
                <input name="name" required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </label>
              {paid ? (
                <label className="block space-y-1 text-sm font-medium">
                  Price / month ({currency})
                  <input
                    name="price"
                    type="number"
                    min="1"
                    max="1000"
                    step="0.01"
                    required
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className={inputClass}
                  />
                </label>
              ) : (
                <p className="self-end pb-2 text-sm text-muted">Free for everyone who follows you.</p>
              )}
            </div>
            <label className="block space-y-1 text-sm font-medium">
              Description
              <textarea
                name="description"
                rows={2}
                maxLength={400}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Thank-you message
              <textarea
                name="welcomeMessage"
                rows={2}
                maxLength={500}
                value={welcome}
                onChange={(event) => setWelcome(event.target.value)}
                placeholder={`Welcome to ${name || "the tier"}!`}
                className={inputClass}
              />
              <span className="block text-xs font-normal text-muted">Shown to people right after they join. Leave blank for the default.</span>
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Perks</legend>
            <p className="text-sm text-muted">What members get. Shown as a checklist, in this order.</p>
            <ul className="space-y-2">
              {perks.map((perk, index) => (
                <li key={perk.key} className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-primary">✓</span>
                  <input
                    name="perk"
                    aria-label={`Perk ${index + 1}`}
                    maxLength={PERK_LENGTH}
                    value={perk.text}
                    placeholder="e.g. Early access to new chapters"
                    onChange={(event) =>
                      setPerks((current) => current.map((item) => (item.key === perk.key ? { ...item, text: event.target.value } : item)))
                    }
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="px-2 disabled:opacity-30">↑</button>
                  <button type="button" aria-label="Move down" disabled={index === perks.length - 1} onClick={() => move(index, 1)} className="px-2 disabled:opacity-30">↓</button>
                  <button
                    type="button"
                    aria-label={`Remove perk ${index + 1}`}
                    onClick={() => setPerks((current) => current.filter((item) => item.key !== perk.key))}
                    className="px-2 text-danger"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={perks.length >= PERK_LIMIT}
              onClick={() => setPerks((current) => [...current, row("")])}
              className={`${secondaryButtonClass} disabled:opacity-40`}
            >
              Add perk
            </button>
            {perks.length >= PERK_LIMIT && <p className="text-xs text-muted">Up to {PERK_LIMIT} perks per tier.</p>}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Presentation</legend>
            <label className="block space-y-1 text-sm font-medium">
              Badge <span className="font-normal text-muted">(optional, e.g. Most popular)</span>
              <input
                name="badge"
                maxLength={BADGE_LENGTH}
                value={badge}
                onChange={(event) => setBadge(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="highlighted"
                checked={highlighted}
                onChange={(event) => setHighlighted(event.target.checked)}
              />
              Highlight this tier (outlined card)
            </label>
          </fieldset>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Preview</p>
          <div
            className={`agora-card agora-tier flex flex-col rounded-theme border bg-surface p-5 ${highlighted ? "border-primary" : "border-line"}`}
          >
            {badge && (
              <span className="mb-2 w-fit rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">{badge}</span>
            )}
            <h3 className="text-lg font-semibold">{name || "Tier name"}</h3>
            <p className="mt-2 text-3xl font-bold text-primary">
              {previewPrice}
              {paid && <span className="text-sm font-normal text-muted"> / month</span>}
            </p>
            {description && <p className="mt-3 whitespace-pre-wrap text-muted">{description}</p>}
            {perks.some((perk) => perk.text.trim()) && (
              <ul className="mt-4 space-y-1.5 text-sm">
                {perks
                  .filter((perk) => perk.text.trim())
                  .map((perk) => (
                    <li key={perk.key} className="flex gap-2">
                      <span aria-hidden="true" className="text-primary">✓</span>
                      <span>{perk.text}</span>
                    </li>
                  ))}
              </ul>
            )}
            <span className={`${buttonClass} mt-auto w-full pointer-events-none text-center opacity-70`}>
              {paid ? "Join" : "Follow"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button className={buttonClass}>{creating ? "Add tier" : "Save tier"}</button>
        {extra}
      </div>
    </form>
  );
}
