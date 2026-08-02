"use client";

import { SessionProvider } from "next-auth/react";
import { ChatProvider } from "@/components/providers/ChatProvider";
import { LibraryWatchedVisibilityProvider } from "@/components/providers/LibraryWatchedVisibilityProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LibraryWatchedVisibilityProvider>
        <ChatProvider>{children}</ChatProvider>
      </LibraryWatchedVisibilityProvider>
    </SessionProvider>
  );
}
