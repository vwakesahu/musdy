export const PALETTE = ["#516bf6", "#21c85e", "#f5b70a", "#ff5b3a", "#a66bff", "#2ec5d3", "#0d0e14"];

export function hashOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const digit = (n: number, i: number) => Math.floor((n / Math.pow(10, i)) % 10);
const unit = (n: number, range: number, i?: number) => {
  const v = n % range;
  return i !== undefined && digit(n, i) % 2 === 0 ? -v : v;
};

export const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export function marbleSvg(seed: string) {
  const n = hashOf(seed.toLowerCase());
  const pick = (k: number) => PALETTE[(n + k * 3) % (PALETTE.length - 1)];
  const [a, b, c] = [pick(0), pick(1), pick(2)];
  const t = (k: number) => {
    const m = (n >>> (k * 3)) + k * 97;
    return { x: unit(m * (k + 1), 8, 1), y: unit(m * (k + 1), 8, 2), r: unit(m * (k + 1), 360), s: 1.2 + unit(m * (k + 1), 8) / 10 };
  };
  const p = t(1);
  const q = t(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80"><defs><filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter><clipPath id="c"><circle cx="40" cy="40" r="40"/></clipPath></defs><g clip-path="url(#c)"><rect width="80" height="80" fill="${a}"/><path filter="url(#f)" d="M32.414 59.35L50.376 70.5H72.5v-71H33.728L26.5 13.381l19.057 27.08L32.414 59.35z" fill="${b}" transform="translate(${p.x} ${p.y}) rotate(${p.r} 40 40) scale(${p.s})"/><path filter="url(#f)" style="mix-blend-mode:overlay" d="M22.216 24L0 46.75l14.108 38.129L78 86l-3.081-59.276-22.378 4.005 12.972 20.186-23.35 27.395L22.215 24z" fill="${c}" transform="translate(${q.x - q.y} ${-q.y}) rotate(${q.r} 40 40) scale(${q.s})"/></g></svg>`;
}

export const marbleUri = (seed: string) => svgUri(marbleSvg(seed));

export function blockiesSvg(address: string) {
  const s = [0, 0, 0, 0];
  const seed = address.toLowerCase();
  for (let i = 0; i < seed.length; i++) s[i % 4] = (s[i % 4] << 5) - s[i % 4] + seed.charCodeAt(i);
  const rand = () => {
    const t = s[0] ^ (s[0] << 11);
    s[0] = s[1];
    s[1] = s[2];
    s[2] = s[3];
    s[3] = s[3] ^ (s[3] >> 19) ^ t ^ (t >> 8);
    return (s[3] >>> 0) / ((1 << 31) >>> 0);
  };
  const color = () => `hsl(${Math.floor(rand() * 360)},${rand() * 60 + 40}%,${(rand() + rand() + rand() + rand()) * 25}%)`;
  const fg = color();
  const bg = color();
  const spot = color();
  const size = 8;
  const cells: number[] = [];
  for (let y = 0; y < size; y++) {
    const row = Array.from({ length: size / 2 }, () => Math.floor(rand() * 2.3));
    cells.push(...row, ...row.slice().reverse());
  }
  const rects = cells
    .map((v, i) => (v ? `<rect x="${i % size}" y="${Math.floor(i / size)}" width="1" height="1" fill="${v === 1 ? fg : spot}"/>` : ""))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="64" height="64" shape-rendering="crispEdges"><rect width="8" height="8" fill="${bg}"/>${rects}</svg>`;
}

// emoji avatar approach from RainbowKit (MIT), packages/rainbowkit/src/components/Avatar/emojiAvatarForAddress.ts
const EMOJI = [
  { color: "#FC5C54", emoji: "🌶" },
  { color: "#FFD95A", emoji: "🤑" },
  { color: "#E95D72", emoji: "🐙" },
  { color: "#6A87C8", emoji: "🫐" },
  { color: "#5FD0F3", emoji: "🐳" },
  { color: "#FC5C54", emoji: "🤶" },
  { color: "#75C06B", emoji: "🌲" },
  { color: "#FFDD86", emoji: "🌞" },
  { color: "#5FC6D4", emoji: "🐒" },
  { color: "#FF949A", emoji: "🐵" },
  { color: "#FF8024", emoji: "🦊" },
  { color: "#9BA1A4", emoji: "🐼" },
  { color: "#EC66FF", emoji: "🦄" },
  { color: "#FF8CBC", emoji: "🐷" },
  { color: "#FF9A23", emoji: "🐧" },
  { color: "#FF949A", emoji: "🦩" },
  { color: "#C5DADB", emoji: "👽" },
  { color: "#FC5C54", emoji: "🎈" },
  { color: "#FF949A", emoji: "🍉" },
  { color: "#FFD95A", emoji: "🎉" },
  { color: "#A8CE63", emoji: "🐲" },
  { color: "#71ABFF", emoji: "🌎" },
  { color: "#FFE279", emoji: "🍊" },
  { color: "#B6B1B6", emoji: "🐭" },
  { color: "#FF6780", emoji: "🍣" },
  { color: "#FFD95A", emoji: "🐥" },
  { color: "#A575FF", emoji: "👾" },
  { color: "#A8CE63", emoji: "🥦" },
  { color: "#FC5C54", emoji: "👹" },
  { color: "#FFE279", emoji: "🙀" },
  { color: "#5FD0F3", emoji: "⛱" },
  { color: "#4D82FF", emoji: "⛵️" },
  { color: "#FFE279", emoji: "🥳" },
  { color: "#FF949A", emoji: "🤯" },
  { color: "#FFB35A", emoji: "🤠" },
];

export function emojiAvatarForAddress(address: string) {
  let h = 0;
  const s = address.toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return EMOJI[Math.abs(h) % EMOJI.length];
}
