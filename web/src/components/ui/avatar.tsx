/* eslint-disable @next/next/no-img-element */
const hue = (s: string) => {
  let h = 0;
  for (let i = 2; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export function Avatar({ user, size = 40 }: { user: { address: string; handle: string | null; avatar?: string | null }; size?: number }) {
  if (user.avatar) {
    return <img src={user.avatar} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const letter = (user.handle ?? user.address.slice(2, 3)).slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-text"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue(user.address.toLowerCase())} 22% 24%)` }}
    >
      {letter}
    </span>
  );
}
