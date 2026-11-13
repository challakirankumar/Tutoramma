"use client";

import { useEffect, useMemo, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { useAppStore } from "@/stores/app-store";
import { navFor } from "@/config/nav";
import { toast } from "@/hooks/use-toast";
import { LogOut, Timer, Layers, Keyboard, Sparkles, Search, CalendarClock, Bot } from "lucide-react";

/** Opens the palette from anywhere (e.g. the top-bar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("ta:command-palette"));
}

/**
 * ⌘K / Ctrl+K command palette — jump to any workspace, or run quick actions
 * (start a focus block, review due flashcards, sign out…).
 */
export function CommandPalette() {
  const { user, setView, setUser } = useAppStore();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        setOpen(true);
      } else if (!typing && e.key === "?") {
        setHelp(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ta:command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ta:command-palette", onOpen);
    };
  }, []);

  const items = useMemo(() => (user ? navFor(user.role) : []), [user]);
  const groups = useMemo(() => {
    const g: Record<string, typeof items> = {};
    for (const i of items) (g[i.group ?? "Go to"] ??= []).push(i);
    return g;
  }, [items]);

  if (!user) return null;

  const run = (fn: () => void) => {
    setOpen(false);
    setTimeout(fn, 60);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    toast({ title: "Signed out", description: "See you soon!" });
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump anywhere or run an action">
        <CommandInput placeholder="Where do you want to go? Type a page or action…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No matches — try “timetable”, “focus” or “messages”.</CommandEmpty>
          {user.role === "student" && (
            <>
              <CommandGroup heading="Quick actions">
                <CommandItem value="start focus pomodoro timer 25" onSelect={() => run(() => setView("s-focus", { focusAutostart: Date.now() }))}>
                  <Timer /> Start a 25-minute focus block <CommandShortcut>Focus</CommandShortcut>
                </CommandItem>
                <CommandItem value="review due flashcards study" onSelect={() => run(() => setView("s-flashcards", { flashStudyDue: Date.now() }))}>
                  <Layers /> Review due flashcards <CommandShortcut>SRS</CommandShortcut>
                </CommandItem>
                <CommandItem value="today revision plan exam" onSelect={() => run(() => setView("s-planner"))}>
                  <CalendarClock /> Open today&apos;s revision plan
                </CommandItem>
                <CommandItem value="ask ai study buddy doubt" onSelect={() => run(() => setView("s-assistant"))}>
                  <Bot /> Ask the AI Study Buddy a doubt
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          {(user.role === "student" || user.role === "parent") && (
            <>
              <CommandGroup heading="Find">
                <CommandItem value="find tutor search subject board" onSelect={() => run(() => setView(user.role === "student" ? "s-find" : "p-find"))}>
                  <Search /> Find a verified tutor
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          {user.role === "tutor" && (
            <>
              <CommandGroup heading="Quick actions">
                <CommandItem value="generate lesson plan studio ai" onSelect={() => run(() => setView("t-studio"))}>
                  <Sparkles /> Generate a lesson plan
                </CommandItem>
                <CommandItem value="new question paper" onSelect={() => run(() => setView("t-papers"))}>
                  <Sparkles /> Create a question paper
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          {Object.entries(groups).map(([group, list]) => (
            <CommandGroup key={group} heading={group}>
              {list.map((item) => (
                <CommandItem key={item.id} value={`${item.label} ${group}`} onSelect={() => run(() => setView(item.id))}>
                  <item.icon /> {item.label}
                  {item.badge && <CommandShortcut className="!text-[#E76E0F] font-bold">{item.badge}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Account">
            <CommandItem value="keyboard shortcuts help" onSelect={() => run(() => setHelp(true))}>
              <Keyboard /> Keyboard shortcuts <CommandShortcut>?</CommandShortcut>
            </CommandItem>
            <CommandItem value="sign out logout" onSelect={() => run(signOut)}>
              <LogOut /> Sign out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <CommandDialog open={help} onOpenChange={setHelp} title="Keyboard shortcuts" description="Work faster with the keyboard">
        <div className="p-5">
          <div className="text-[15px] font-bold mb-3 flex items-center gap-2"><Keyboard className="w-4 h-4" /> Keyboard shortcuts</div>
          <div className="space-y-2 text-[13px]">
            {[
              ["Open command palette", ["Ctrl / ⌘", "K"]],
              ["Quick search", ["/"]],
              ["This help", ["?"]],
              ["Flashcards — flip card", ["Space"]],
              ["Flashcards — rate Again / Hard / Good / Easy", ["1", "2", "3", "4"]],
              ["Flashcards — show hint", ["H"]],
              ["Focus Studio — start / pause", ["Space"]],
              ["Focus Studio — reset", ["R"]],
            ].map(([label, keys]) => (
              <div key={label as string} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span className="flex gap-1">{(keys as string[]).map((k) => <span key={k} className="ta-kbd">{k}</span>)}</span>
              </div>
            ))}
          </div>
        </div>
      </CommandDialog>
    </>
  );
}
