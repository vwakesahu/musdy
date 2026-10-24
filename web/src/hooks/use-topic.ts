"use client";
import { useEffect, useRef } from "react";
import type { ServerMsg } from "shared";
import { socket } from "@/lib/socket";

export function useTopic(topic: string | null, handler: (msg: ServerMsg) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!topic) return;
    return socket.subscribe(topic, (m) => ref.current(m));
  }, [topic]);
}
