"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface UserAccountMenuProps {
  username: string;
  lightNav?: boolean;
}

export function UserAccountMenu({ username, lightNav = false }: UserAccountMenuProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
    setLoading(false);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) resetForm();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Failed to change password");
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setLoading(false);
    }
  }

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

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="border-gray-300/70 bg-white/40 text-gray-900 shadow-none backdrop-blur-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Change password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
                minLength={8}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
                minLength={8}
                required
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            {success && <p className="text-sm text-emerald-700">Password updated successfully.</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => handleDialogOpenChange(false)}
              >
                {success ? "Close" : "Cancel"}
              </Button>
              {!success && (
                <Button type="submit" variant="glass" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Update password"
                  )}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
