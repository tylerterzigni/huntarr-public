"use client";

import { Suspense } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ChatModal } from "@/components/chat/ChatModal";
import { PullToRefresh } from "@/components/pwa/PullToRefresh";
import { useChat } from "@/components/providers/ChatProvider";

interface MainLayoutProps {
  children: React.ReactNode;
  username?: string;
}

export function MainLayout({ children, username }: MainLayoutProps) {
  const { chatOpen, setChatOpen, openChat } = useChat();

  return (
    <div className="min-h-screen bg-seerr-bg text-foreground">
      <PullToRefresh disabled={chatOpen}>
        <>
          <Suspense
            fallback={
              <header className="sticky top-0 z-40 h-20 border-b border-gray-300 bg-seerr-bg/95 pt-safe" />
            }
          >
            <Navbar onChatOpen={openChat} username={username} />
          </Suspense>
          <main className="pb-[calc(var(--mobile-bottom-nav-height)+var(--mobile-bottom-inset))] md:pb-safe">{children}</main>
        </>
      </PullToRefresh>
      <MobileBottomNav />
      <ChatModal open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}
