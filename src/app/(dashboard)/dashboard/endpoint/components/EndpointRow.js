"use client";

import { Input } from "@/shared/components";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border-subtle bg-bg/60 p-2.5 transition-colors hover:border-brand-500/25 sm:gap-3 sm:p-3">
      <span className={`text-xs font-mono px-2 py-1 rounded-lg shrink-0 min-w-[72px] text-center ${
          (badge === "CF" || badge === "TS") ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-muted"
        }`}>{label}</span>
      <Input value={url} readOnly className="min-w-0 flex-1 font-mono text-sm" inputClassName="truncate bg-surface border-border-subtle" />
      <button
        onClick={() => onCopy(url, copyId)}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface text-text-muted transition-colors hover:border-brand-500/30 hover:bg-brand-500/5 hover:text-primary"
        aria-label={`Copy ${label} endpoint`}
        title={`Copy ${label} endpoint`}
      >
        <span className="material-symbols-outlined text-[18px]">{copied === copyId ? "check" : "content_copy"}</span>
      </button>
      {actions}
    </div>
  );
}
