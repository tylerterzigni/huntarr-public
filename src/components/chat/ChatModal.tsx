"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatRecommendationCards } from "@/components/chat/ChatRecommendationCards";
import { Send, Loader2 } from "lucide-react";
import {
  CHAT_SEARCHES_PAGE_SIZE,
  loadMoreSearchCount,
  paginateChatMessages,
} from "@/lib/chat/paginate-messages";
import { glassBtn, glassInput } from "@/lib/styles/glass";
import { cn } from "@/lib/utils";
import { useKeyboardInset, useMobileViewport } from "@/hooks/useKeyboardInset";
import type { RecommendationItem } from "@/types";

interface ChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  items?: RecommendationItem[];
}

const MOBILE_COMPOSER_DOCK_HEIGHT = "4rem";

export function ChatModal({ open, onOpenChange }: ChatModalProps) {
  const defaultMessage: Message = {
    role: "assistant",
    content:
      "Tell me what you're in the mood for. I can adjust genres, runtime, mood, and exclusions to refine your recommendations.",
  };
  const [messages, setMessages] = useState<Message[]>([defaultMessage]);
  const [visibleSearchCount, setVisibleSearchCount] = useState(CHAT_SEARCHES_PAGE_SIZE);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasScrolledOnOpenRef = useRef(false);
  const skipScrollToBottomRef = useRef(false);

  const isMobile = useMobileViewport();
  const keyboardInset = useKeyboardInset(open && isMobile && inputFocused);

  const { visible, hiddenSearchCount, hasMore } = useMemo(
    () => paginateChatMessages(messages, visibleSearchCount),
    [messages, visibleSearchCount]
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior });
        return;
      }
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, []);

  useEffect(() => {
    if (!open) {
      hasScrolledOnOpenRef.current = false;
      setVisibleSearchCount(CHAT_SEARCHES_PAGE_SIZE);
      setInputFocused(false);
      return;
    }

    if (skipScrollToBottomRef.current) {
      skipScrollToBottomRef.current = false;
      return;
    }

    const behavior = hasScrolledOnOpenRef.current ? "smooth" : "auto";
    hasScrolledOnOpenRef.current = true;
    scrollToBottom(behavior);
  }, [open, messages, loading, scrollToBottom]);

  useEffect(() => {
    if (!open || !inputFocused) return;
    scrollToBottom("smooth");
  }, [open, inputFocused, keyboardInset, scrollToBottom]);

  useEffect(() => {
    if (!open) return;

    setVisibleSearchCount(CHAT_SEARCHES_PAGE_SIZE);

    fetch("/api/chat")
      .then((res) => res.json())
      .then((data) => {
        if (data.messages?.length) {
          setMessages(data.messages);
        }
      })
      .catch(() => {
        // keep default welcome message
      });
  }, [open]);

  function loadEarlierSearches() {
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    skipScrollToBottomRef.current = true;

    setVisibleSearchCount((prev) => prev + loadMoreSearchCount(hiddenSearchCount));

    requestAnimationFrame(() => {
      if (!container) return;
      container.scrollTop += container.scrollHeight - prevScrollHeight;
    });
  }

  function dismissKeyboard() {
    inputRef.current?.blur();
    setInputFocused(false);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    dismissKeyboard();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply ?? "Updated your criteria.",
          items: Array.isArray(data.items) ? data.items : undefined,
        },
      ]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I couldn't process that. ${detail}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    if (!input.trim() || loading) {
      dismissKeyboard();
      return;
    }
    void sendMessage();
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleSend();
  }

  const loadMoreCount = loadMoreSearchCount(hiddenSearchCount);
  const composerBottom = isMobile && inputFocused && keyboardInset > 0 ? keyboardInset : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn(
          "flex flex-col gap-4 border-gray-300/70 bg-white/40 p-4 shadow-none backdrop-blur-md",
          "fixed inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] w-full max-w-full translate-x-0 translate-y-0 rounded-none",
          "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-[600px] sm:max-w-[560px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:p-6",
          "[&>button]:right-4 [&>button]:top-[calc(1rem+var(--safe-area-top))] sm:[&>button]:top-4"
        )}
      >
        <DialogHeader className="shrink-0 pt-safe text-center sm:pt-0 sm:text-center">
          <DialogTitle className="text-gray-900">AI Recommendation Chat</DialogTitle>
        </DialogHeader>
        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-y-auto pr-2 sm:pr-4"
          style={
            isMobile
              ? {
                  paddingBottom: `calc(${MOBILE_COMPOSER_DOCK_HEIGHT} + var(--mobile-bottom-inset))`,
                }
              : undefined
          }
        >
          <div className="space-y-4">
            {hasMore && (
              <div className="flex justify-center pb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadEarlierSearches}
                  className={glassBtn}
                >
                  Load {loadMoreCount} earlier search{loadMoreCount === 1 ? "" : "es"}
                </Button>
              </div>
            )}
            {visible.map(({ message: msg, index }) => (
              <div
                key={`${msg.role}-${index}`}
                className={`rounded-lg border p-3 text-sm text-gray-900 ${
                  msg.role === "user"
                    ? "ml-8 border-gray-300/70 bg-gray-500/10 backdrop-blur-sm"
                    : "mr-8 border-gray-300/70 bg-white/40 backdrop-blur-md"
                }`}
              >
                {msg.content}
                {msg.role === "assistant" && msg.items && msg.items.length > 0 && (
                  <ChatRecommendationCards
                    items={msg.items}
                    onSelect={() => onOpenChange(false)}
                  />
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-8 flex items-center gap-2 rounded-lg border border-gray-300/70 bg-white/40 p-3 text-sm text-gray-900 backdrop-blur-md">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-600" />
                <span>Finding recommendations...</span>
              </div>
            )}
            <div ref={messagesEndRef} aria-hidden />
          </div>
        </div>
        <div
          className={cn(
            "shrink-0 sm:border-t sm:border-gray-300/70 sm:pt-4 sm:pb-safe",
            "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[60] max-sm:mobile-bottom-dock"
          )}
          style={
            isMobile
              ? {
                  bottom: composerBottom,
                  transition: inputFocused ? "bottom 0.2s ease-out" : undefined,
                }
              : undefined
          }
        >
          <div className={cn("flex items-center gap-2 sm:gap-2", isMobile && "mobile-bottom-dock-composer")}>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="e.g. gritty sci-fi under 2 hours..."
              className={cn(glassInput, isMobile && "h-10 flex-1")}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
            />
            <Button
              onClick={handleSend}
              disabled={loading}
              size="icon"
              variant="outline"
              className={cn(glassBtn, isMobile && "h-10 w-10 shrink-0")}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
