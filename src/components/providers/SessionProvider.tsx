"use client";

import { SessionProvider } from "next-auth/react";
import { ChatProvider } from "@/components/providers/ChatProvider";
import { DailySyncTrigger } from "@/components/providers/DailySyncTrigger";
import { DetailNavContrastProvider } from "@/components/providers/DetailNavContrastProvider";
import { LibraryWatchedVisibilityProvider } from "@/components/providers/LibraryWatchedVisibilityProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LibraryWatchedVisibilityProvider>
        <DailySyncTrigger />
        <DetailNavContrastProvider>
          <ChatProvider>{children}</ChatProvider>
        </DetailNavContrastProvider>
      </LibraryWatchedVisibilityProvider>
    </SessionProvider>
  );
}
