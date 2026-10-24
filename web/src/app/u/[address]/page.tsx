import { Suspense } from "react";
import { UserProfileScreen } from "@/components/screens/profile-screen";

export default function Page() {
  return (
    <Suspense>
      <UserProfileScreen />
    </Suspense>
  );
}
