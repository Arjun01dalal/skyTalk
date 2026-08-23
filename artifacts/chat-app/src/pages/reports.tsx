import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, RefreshCw, Search, Landmark, Banknote, FileCheck2, Dices } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Staff reports pulled from the customer's own domain API via the backend
// proxy (/api/external/...). Currently served from hardcoded sample data on
// the server (EXTERNAL_API_MOCK); tomorrow the same endpoints will hit the
// real laxminarayan.live API — no frontend changes needed.

type Row = Record<string, unknown>;
type ListResponse = { total: number; data: Row[] };

const TABS = [
  { key: "deposit-list", label: "Deposits", icon: Landmark },
  { key: "withdrawal-list", label: "Withdrawals", icon: Banknote },
  { key: "kyc-list", label: "KYC", icon: FileCheck2 },
  { key: "bet-history", label: "Bet History", icon: Dices },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Column configs per list: [field, header, render kind]
const COLUMNS: Record<TabKey, { field: string; header: string; kind?: "money" | "status" | "datetime" }[]> = {
  "deposit-list": [
    { field: "id", header: "ID" },
    { field: "userName", header: "User" },
    { field: "amount", header: "Amount", kind: "money" },
    { field: "method", header: "Method" },
    { field: "utr", header: "UTR" },
    { field: "status", header: "Status", kind: "status" },
    { field: "createdAt", header: "Date", kind: "datetime" },
  ],
  "withdrawal-list": [
    { field: "id", header: "ID" },
    { field: "userName", header: "User" },
    { field: "amount", header: "Amount", kind: "money" },
    { field: "bankAccount", header: "Account" },
    { field: "ifsc", header: "IFSC" },
    { field: "status", header: "Status", kind: "status" },
    { field: "requestedAt", header: "Requested", kind: "datetime" },
  ],
  "kyc-list": [
    { field: "id", header: "ID" },
    { field: "userName", header: "User" },
    { field: "docType", header: "Document" },
    { field: "docNumber", header: "Number" },
    { field: "status", header: "Status", kind: "status" },
    { field: "submittedAt", header: "Submitted", kind: "datetime" },
  ],
  "bet-history": [
    { field: "id", header: "ID" },
    { field: "userName", header: "User" },
    { field: "game", header: "Game" },
    { field: "market", header: "Market" },
    { field: "selection", header: "Selection" },
    { field: "stake", header: "Stake", kind: "money" },
    { field: "odds", header: "Odds" },
    { field: "status", header: "Status", kind: "status" },
    { field: "payout", header: "Payout", kind: "money" },
    { field: "placedAt", header: "Placed", kind: "datetime" },
  ],
};

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  verified: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  open: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  lost: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

function renderCell(value: unknown, kind?: "money" | "status" | "datetime") {
  if (value == null || value === "") return <span className="text-muted-foreground">—</span>;
  if (kind === "money") {
    return <span className="font-medium tabular-nums">₹{Number(value).toLocaleString("en-IN")}</span>;
  }
  if (kind === "status") {
    const s = String(value).toLowerCase();
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[s] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
        {s}
      </span>
    );
  }
  if (kind === "datetime") {
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? String(value) : (
      <span className="whitespace-nowrap text-muted-foreground">{d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    );
  }
  return String(value);
}

export default function Reports() {
  const [tab, setTab] = useState<TabKey>("deposit-list");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["external-report", tab],
    queryFn: () => customFetch<ListResponse>(`/api/external/${tab}`, { responseType: "json" }),
  });

  const columns = COLUMNS[tab];
  const q = search.trim().toLowerCase();
  const rows = (data?.data ?? []).filter(
    (r) => !q || Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(q)),
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5 overflow-y-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Deposits, withdrawals, KYC and bet history from laxminarayan.live</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearch(""); }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in this list..." className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-xl p-6 text-sm text-red-700 dark:text-red-300">
          Could not load this list from the domain API.
          <div className="text-xs mt-1 opacity-80">{error instanceof Error ? error.message : "Unknown error"}</div>
        </div>
      ) : (
        <div className="border border-border rounded-2xl shadow-sm overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {columns.map((c) => (
                  <th key={c.field} className="text-left font-semibold px-4 py-3 whitespace-nowrap">{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">No records found</td></tr>
              ) : rows.map((r, i) => (
                <tr key={String(r.id ?? i)} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  {columns.map((c) => (
                    <td key={c.field} className="px-4 py-3 whitespace-nowrap">{renderCell(r[c.field], c.kind)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Sample data (hardcoded) — real API connect hone ke baad yahi lists live data dikhayengi.
      </p>
    </div>
  );
}
