"use client";
import { useEffect, useRef } from "react";
import { ColorType, LineSeries, createChart, type AutoscaleInfo, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "shared";
import { priceOfNumber } from "@/lib/format";

const MIN_HALF_RANGE = 0.02;

export function PriceChart({ candles }: { candles: Candle[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8B8696", attributionLogo: false, fontFamily: "inherit" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderVisible: false },
      crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { color: "#2A2633", labelVisible: false } },
      handleScroll: false,
      handleScale: false,
    });
    series.current = c.addSeries(LineSeries, {
      lineWidth: 2,
      priceLineVisible: false,
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
    s.applyOptions({ color: last < first ? "#FF5C6C" : "#2EE59D" });
    s.setData(data);
    chart.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={el} className="chart-reveal h-[220px] w-full" data-testid="price-chart" />;
}
