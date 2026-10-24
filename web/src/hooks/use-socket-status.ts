"use client";
import { useSyncExternalStore } from "react";
import { socket, type SocketStatus } from "@/lib/socket";

export const useSocketStatus = (): SocketStatus =>
  useSyncExternalStore(
    (l) => socket.onStatus(l),
    () => socket.status,
    () => "idle",
  );
