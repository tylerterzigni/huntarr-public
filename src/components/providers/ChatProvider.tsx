"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface ChatContextValue {
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  openChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = useCallback(() => setChatOpen(true), []);

  return (
    <ChatContext.Provider value={{ chatOpen, setChatOpen, openChat }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}
