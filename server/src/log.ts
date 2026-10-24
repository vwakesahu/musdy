const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export const log = (type: string, fields: Record<string, unknown> = {}) => {
  process.stdout.write(JSON.stringify({ t: Date.now(), type, ...fields }, replacer) + "\n");
};

export const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
