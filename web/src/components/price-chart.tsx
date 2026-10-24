"use client";
import { useEffect, useRef, useState } from "react";
import { AreaSeries, ColorType, LineStyle, createChart, type AutoscaleInfo, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "shared";
import { priceOfNumber } from "@/lib/format";

const MIN_HALF_RANGE = 0.02;
const UP = "#21c85e";
const DOWN = "#ff5b3a";

export function PriceChart({ candles, className = "h-[clamp(200px,36dvh,280px)] lg:h-[360px]" }: { candles: Candle[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const [tip, setTip] = useState<{ x: number; width: number; price: number; time: number } | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9999a3", attributionLogo: false, fontFamily: "inherit" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false, scaleMargins: { top: 0.14, bottom: 0.08 } },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderVisible: false },
      crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { color: "#2c2b35", labelVisible: false } },
      handleScroll: false,
      handleScale: false,
    });
    series.current = c.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: true,
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
      lastValueVisible: false,
      crosshairMarkerRadius: 4,
      priceFormat: { type: "custom", formatter: priceOfNumber, minMove: 1e-15, base: 1e15 },
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const info = base();
        if (!info?.priceRange) return info;
        const { minValue, maxValue } = info.priceRange;
        const mid = (minValue + maxValue) / 2;
        const half = Math.max((maxValue - minValue) / 2, Math.abs(mid) * MIN_HALF_RANGE);
        return { ...info, priceRange: { minValue: mid - half, maxValue: mid + half } };
      },
    });
    chart.current = c;
    c.subscribeCrosshairMove((p) => {
      const s = series.current;
      const v = s && p.point && p.time !== undefined ? p.seriesData.get(s) : undefined;
      if (!p.point || !v || !("value" in v)) return setTip(null);
      setTip({ x: p.point.x, width: el.current?.clientWidth ?? 0, price: Number(v.value), time: Number(p.time) });
    });
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const data = [...candles].sort((a, b) => a.t - b.t).map((x) => ({ time: x.t as UTCTimestamp, value: x.c }));
    const first = data[0]?.value ?? 0;
    const last = data[data.length - 1]?.value ?? 0;
    const col = last < first ? DOWN : UP;
    s.applyOptions({ lineColor: col, priceLineColor: col, topColor: `${col}47`, bottomColor: `${col}00` });
    s.setData(data);
    chart.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div className={`dot-grid relative w-full ${className}`}>
      <div ref={el} className="chart-reveal absolute inset-0" data-testid="price-chart" />
      {tip && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-center shadow-sm"
          style={{ left: Math.min(Math.max(tip.x - 60, 4), Math.max(tip.width - 124, 4)), width: 120 }}
          data-testid="chart-tooltip"
        >
          <div className="text-[14px] font-semibold tabular-nums text-text">{priceOfNumber(tip.price)}</div>
          <div className="text-[11px] tabular-nums text-muted">{new Date(tip.time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
        </div>
      )}
    </div>
  );
}
