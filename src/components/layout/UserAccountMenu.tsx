"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, KeyRound } from "lucide-react";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { cn } from "@/lib/utils";

interface UserAccountMenuProps {
  username: string;
  lightNav?: boolean;
}

export function UserAccountMenu({ username, lightNav = false }: UserAccountMenuProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(
              "hidden items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors sm:inline-flex",
              lightNav
                ? "text-white hover:bg-white/10"
                : "text-gray-600 hover:bg-gray-900/5 hover:text-gray-900"
            )}
            aria-label={`Account menu for ${username}`}
          >
            <span>{username}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[11rem] overflow-hidden rounded-md border border-gray-300/70 bg-white/40 p-1 shadow-lg backdrop-blur-md"
          >
            <DropdownMenu.Item
              className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm text-gray-700 outline-none hover:bg-seerr-hover hover:text-gray-900 data-[highlighted]:bg-seerr-hover data-[highlighted]:text-gray-900"
              onSelect={() => setDialogOpen(true)}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Change password
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ChangePasswordDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
