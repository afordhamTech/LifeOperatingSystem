import { useMemo, useState } from "react";
import { CheckCheck, Copy, PanelRightOpen, X } from "lucide-react";
import { useLocation } from "react-router";
import { SyncBadge } from "@/components/SyncBadge";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { insertAiPromptExport, type LifeeeSyncStatus } from "@/lib/lifeee-persistence";
import {
  PROMPT_OPTIONS,
  buildLifeeePrompt,
  type LifeeePromptKind,
  type PromptBuilderContext,
} from "@/lib/prompt-builders";

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Browser automation and unfocused windows can reject async clipboard writes.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function PromptDrawer({ context }: { context?: PromptBuilderContext }) {
  const location = useLocation();
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const { syncStatus, syncError, setSyncStatus, markSaving, markSaved, markFailed } =
    useSyncStatus("waiting");
  const [open, setOpen] = useState(false);
  const [copiedKind, setCopiedKind] = useState<LifeeePromptKind | null>(null);

  const sourcePage = location.pathname === "/" ? "dashboard" : location.pathname.slice(1);
  const promptContext = useMemo<PromptBuilderContext>(
    () => ({
      date: new Date().toISOString().slice(0, 10),
      sourcePage,
      ...context,
    }),
    [context, sourcePage],
  );

  const visibleStatus: LifeeeSyncStatus = sessionLoading
    ? "loading"
    : !hasSupabaseConfig
      ? "local"
      : !userId
        ? "waiting"
        : syncStatus;

  const onCopy = async (kind: LifeeePromptKind, label: string) => {
    const promptText = buildLifeeePrompt(kind, promptContext);
    await copyText(promptText);
    setCopiedKind(kind);
    window.setTimeout(() => setCopiedKind(null), 1600);

    if (!hasSupabaseConfig) {
      setSyncStatus("local");
      return;
    }

    if (!userId) {
      setSyncStatus("waiting");
      return;
    }

    markSaving();
    try {
      await insertAiPromptExport(userId, {
        prompt_type: label,
        prompt_text: promptText,
        source_page: sourcePage,
      });
      markSaved();
    } catch (error) {
      markFailed(error, "Prompt copied, but export history did not save.");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-lg hover:bg-muted"
      >
        <PanelRightOpen size={16} />
        AI Prompts
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#25313c]/20" onClick={() => setOpen(false)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">AI Prompt Drawer</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Copies prompt text and saves export history when changes are saved.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close AI Prompt Drawer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <SyncBadge status={visibleStatus} />
              <span className="text-xs text-muted-foreground">{sourcePage}</span>
            </div>
            {syncError ? <p className="mt-2 text-xs text-destructive">{syncError}</p> : null}

            <div className="mt-4 grid gap-2">
              {PROMPT_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  onClick={() => void onCopy(option.kind, option.label)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground hover:bg-muted/70"
                >
                  <span>{option.label}</span>
                  {copiedKind === option.kind ? (
                    <CheckCheck size={15} className="text-emerald-700" />
                  ) : (
                    <Copy size={15} className="text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
