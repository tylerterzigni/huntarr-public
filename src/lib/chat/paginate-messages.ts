export const CHAT_SEARCHES_PAGE_SIZE = 5;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatDisplayMessage<T extends ChatMessage = ChatMessage> {
  message: T;
  index: number;
}

export function paginateChatMessages<T extends ChatMessage>(
  messages: T[],
  visibleSearchCount: number
): {
  visible: ChatDisplayMessage<T>[];
  hiddenSearchCount: number;
  hasMore: boolean;
} {
  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") userIndices.push(i);
  }

  const totalSearches = userIndices.length;
  if (totalSearches <= visibleSearchCount) {
    return {
      visible: messages.map((message, index) => ({ message, index })),
      hiddenSearchCount: 0,
      hasMore: false,
    };
  }

  const startIndex = userIndices[totalSearches - visibleSearchCount];
  const visible: ChatDisplayMessage<T>[] = [];

  if (messages[0]?.role === "assistant" && startIndex > 0) {
    visible.push({ message: messages[0], index: 0 });
  }

  for (let i = startIndex; i < messages.length; i++) {
    visible.push({ message: messages[i], index: i });
  }

  return {
    visible,
    hiddenSearchCount: totalSearches - visibleSearchCount,
    hasMore: true,
  };
}

export function loadMoreSearchCount(hiddenSearchCount: number): number {
  return Math.min(CHAT_SEARCHES_PAGE_SIZE, hiddenSearchCount);
}
