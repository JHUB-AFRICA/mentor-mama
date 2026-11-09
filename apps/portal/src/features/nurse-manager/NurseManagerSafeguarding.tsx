import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Skeleton } from "@mentormama/ui";
import { useNavigate } from "react-router-dom";
import { getEscalations, type CurrentUser } from "../../services/api";
import { SafeguardingReviewPanel } from "../safeguarding/SafeguardingReviewPanel";
import { FacilityWorkspaceFrame } from "./FacilityWorkspaceFrame";

export function NurseManagerSafeguarding({ user, onError }: { user: CurrentUser; onError: (message: string) => void }) {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["manager-safeguarding"], queryFn: getEscalations, staleTime: 15_000 });
  const rows = query.data ?? [];
  const open = rows.filter((row) => row.state !== "closed");
  const high = open.filter((row) => row.severity === "high").length;
  const assigned = open.filter((row) => row.reviewer).length;
  const nav = (destination: string) => navigate(destination === "overview" ? "/facility" : destination === "placements" ? "/placements" : `/facility/${destination}`);
  return <FacilityWorkspaceFrame user={user} active="safeguarding" title="Safeguarding" onNavigate={nav} onAccount={() => navigate("/facility/account")} onError={onError}>
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-7 pb-10">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end"><div><p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-warning">Facility safety · authorised workspace</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl">Safeguarding review</h1><p className="mt-3 max-w-2xl font-body text-sm leading-6 text-navy-muted">Triage concerns raised in your facility, take ownership, and keep every response traceable. Sensitive narrative opens only when you are authorised to review it.</p></div><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-warning/10 text-warning"><ShieldCheck size={23} aria-hidden="true" /></span></header>
      <section className="rounded-3xl bg-navy p-6 text-white shadow-[0_16px_36px_rgba(8,25,53,0.12)] sm:p-8"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="font-body text-xs font-bold uppercase tracking-[0.16em] text-teal-bright">Manager safety desk</p><h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">Keep concerns moving to resolution.</h2><p className="mt-3 max-w-xl font-body text-sm leading-6 text-slate-300">Start with the highest-severity open concern, assign ownership, then record the finding and action taken.</p></div><button type="button" onClick={() => void query.refetch()} className="rounded-full border border-white/20 px-4 py-2 font-body text-sm font-bold text-white hover:bg-white/10">Refresh cases</button></div></section>
      {query.isPending ? <div className="grid gap-3 sm:grid-cols-3">{[1,2,3].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div> : query.isError ? <div role="alert" className="rounded-2xl border border-error/20 bg-error/5 px-5 py-4 font-body text-sm text-error">We could not load safeguarding concerns. <button type="button" onClick={() => void query.refetch()} className="font-bold underline">Try again</button></div> : <div className="grid gap-3 sm:grid-cols-3"><Stat label="Open concerns" value={open.length} detail="Need an owner or response" icon={<AlertTriangle size={18} />} tone={open.length ? "warning" : "default"} /><Stat label="High severity" value={high} detail="Review these first" icon={<AlertTriangle size={18} />} tone={high ? "warning" : "default"} /><Stat label="Assigned" value={assigned} detail="Owned by a reviewer" icon={<CheckCircle2 size={18} />} /></div>}
      <SafeguardingReviewPanel user={user} onError={onError} />
    </main>
  </FacilityWorkspaceFrame>;
}
function Stat({ label, value, detail, icon, tone = "default" }: { label: string; value: number; detail: string; icon: React.ReactNode; tone?: "default" | "warning" }) { return <div className={`rounded-2xl border p-5 ${tone === "warning" ? "border-warning/20 bg-warning/5" : "border-border bg-white"}`}><div className="flex items-center justify-between gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-teal-light text-teal">{icon}</span><span className="font-display text-3xl font-bold tabular-nums text-navy">{value}</span></div><p className="mt-4 font-body text-sm font-bold text-navy">{label}</p><p className="mt-1 font-body text-xs text-navy-muted">{detail}</p></div>; }
