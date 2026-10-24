import { marbleSvg } from "@/lib/art";

export async function GET(_req: Request, { params }: { params: Promise<{ seed: string }> }) {
  const { seed } = await params;
  return new Response(marbleSvg(decodeURIComponent(seed).replace(/\.svg$/, "")), {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable" },
  });
}
