"use client";
import { useRouter } from "next/navigation";
import { SocketBanner } from "./socket-banner";
import { CaretLeftIcon } from "@phosphor-icons/react";

export function BackBar({ title }: { title: string }) {
  const router = useRouter();
  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };
  return (
    <>
      <header className="sticky top-0 z-20 flex h-[52px] items-center gap-2 bg-bg/80 px-2 backdrop-blur-[16px] lg:h-16 lg:px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <button onClick={back} aria-label="Back" className="press grid h-11 w-11 place-items-center">
          <CaretLeftIcon size={22} weight="bold" />
        </button>
        <h1 className="flex-1 truncate text-[17px] font-semibold">{title}</h1>
      </header>
      <SocketBanner />
    </>
  );
}
