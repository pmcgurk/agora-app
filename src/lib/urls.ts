// Absolute links for emails. NEXT_PUBLIC_BASE_URL is the address browsers use (set it in .env).
export function publicUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
