import { Suspense } from "react";
import { RowSkeletons } from "@/components/feed-list";
import { ScreenHeader } from "@/components/screen-header";
import { ExploreScreen } from "@/components/screens/explore-screen";

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <ScreenHeader title="Explore" />
          <RowSkeletons />
        </>
      }
    >
      <ExploreScreen />
    </Suspense>
  );
}
