"use client";
import { useEffect, useRef } from "react";
import { ColorType, LineSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "shared";

// line chart of closes, colour follows the direction over the shown range
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
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderVisible: false },
      crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { color: "#2A2633", labelVisible: false } },
      handleScroll: false,
      handleScale: false,
    });
    series.current = c.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4 });
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

  return <div ref={el} className="chart-reveal h-[220px] w-full" />;
}
