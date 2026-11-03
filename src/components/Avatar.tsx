import { profileImageUrl } from "@/lib/profile-images";

type Props = {
  user: { id: string; name: string; avatarKey: string | null; bannerKey: string | null };
  size?: number;
  className?: string;
};

// Round profile picture with an initial as the fallback.
export default function Avatar({ user, size = 32, className = "" }: Props) {
  const src = profileImageUrl(user, "avatar");
  const style = { width: size, height: size, fontSize: size * 0.45 };
  const base = `agora-avatar inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-on-primary ${className}`;
  if (!src) {
    return (
      <span aria-hidden="true" style={style} className={base}>
        {user.name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} style={style} className={`${base} object-cover`} />;
}
