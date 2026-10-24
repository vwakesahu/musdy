"use client";
import { useRouter } from "next/navigation";
import { SocketBanner } from "./socket-banner";
import { Icon } from "./ui/icon";

// the header for screens you drill into: back chevron and a title, no balance
export function BackBar({ title }: { title: string }) {
  const router = useRouter();
  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };
  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-bg/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <button onClick={back} aria-label="Back" className="press grid h-11 w-11 place-items-center">
          <Icon name="back" />
        </button>
        <h1 className="flex-1 truncate text-[17px] font-semibold">{title}</h1>
      </header>
      <SocketBanner />
    </>
  );
}
