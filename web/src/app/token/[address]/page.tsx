import { Suspense } from "react";
import { TokenScreen } from "@/components/screens/token-screen";

export default function Page() {
  return (
    <Suspense>
      <TokenScreen />
    </Suspense>
  );
}
