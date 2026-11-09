"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const AngklungSystemProvider = dynamic(() =>
  import("./AngklungSystemProvider").then(
    (module) => module.AngklungSystemProvider,
  ),
);

/** Studio has its own preview runtime; never mount the robot/session side effects there. */
export function LegacySystemBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/legacy" || pathname === "/studio" || pathname.startsWith("/studio/"))
    return children;
  return <AngklungSystemProvider>{children}</AngklungSystemProvider>;
}
