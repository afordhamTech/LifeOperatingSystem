import { useEffect, useRef, useState } from "react";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import {
  createLifeeeId,
  fetchMoneyLog,
  fetchMoneyMonth,
  getSyncLabel,
  getSyncTone,
  type LifeeeSyncStatus,
  type MoneyEntry,
  type SubscriptionItem,
  upsertMoneyLog,
} from "@/lib/lifeee-persistence";
import { Wallet, TrendingUp, TrendingDown, Plus } from "lucide-react";

const STORAGE_KEY = "lifeee.money_logs.v1";

function defaultMoneyEntry(date: string): MoneyEntry {
  return {
    date,
    income: 0,
    spending: 0,
    savings: 0,
    debt: 0,
    subscriptions: 0,
    upcomingExpenses: 0,
    biggestLeak: "",
    notes: "",
    subscriptionItems: [],
  };
}

function readLocalMoneyEntries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MoneyEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocalMoneyEntry(entry: MoneyEntry) {
  if (typeof window === "undefined") return;
  const entries = readLocalMoneyEntries().filter((item) => item.date !== entry.date);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...entries]));
}

export default function MoneyPage() {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = `${today.slice(0, 7)}-01`;
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const [form, setForm] = useState<MoneyEntry>(() => {
    return readLocalMoneyEntries().find((entry) => entry.date === today) ?? defaultMoneyEntry(today);
  });
  const [monthLogs, setMonthLogs] = useState<MoneyEntry[]>([]);
  const [subName, setSubName] = useState("");
  const [subCost, setSubCost] = useState(0);
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      const localEntries = readLocalMoneyEntries();
      const localEntry = localEntries.find((entry) => entry.date === today) ?? null;

      if (!hasSupabaseConfig || !userId) {
        remoteLoadedRef.current = false;
        setForm(localEntry ?? defaultMoneyEntry(today));
        setMonthLogs(localEntries.filter((entry) => entry.date >= monthStart));
        setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
        return;
      }

      setSyncStatus("loading");
      setSyncError(null);

      try {
        const [remoteEntry, remoteMonth] = await Promise.all([
          fetchMoneyLog(userId, today),
          fetchMoneyMonth(userId, monthStart),
        ]);
        if (!active) return;

        if (!remoteEntry && localEntry) {
          const uploaded = await upsertMoneyLog(userId, localEntry);
          if (!active) return;
          const nextEntry = uploaded ?? localEntry;
          setForm(nextEntry);
          writeLocalMoneyEntry(nextEntry);
          setMonthLogs(await fetchMoneyMonth(userId, monthStart));
        } else {
          const nextEntry = remoteEntry ?? defaultMoneyEntry(today);
          setForm(nextEntry);
          writeLocalMoneyEntry(nextEntry);
          setMonthLogs(remoteMonth);
        }

        remoteLoadedRef.current = true;
        setSyncStatus("saved");
      } catch (error) {
        if (!active) return;
        setSyncError(error instanceof Error ? error.message : "Could not load money log.");
        setSyncStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [hasSupabaseConfig, monthStart, sessionLoading, today, userId]);

  const handleSave = async (entry: MoneyEntry = form) => {
    const subscriptions = entry.subscriptionItems.reduce((sum, item) => sum + item.monthlyCost, 0);
    const next = { ...entry, date: today, subscriptions };
    writeLocalMoneyEntry(next);
    setForm(next);

    if (hasSupabaseConfig && userId && remoteLoadedRef.current) {
      try {
        setSyncStatus("saving");
        const saved = (await upsertMoneyLog(userId, next)) ?? next;
        setForm(saved);
        writeLocalMoneyEntry(saved);
        setMonthLogs(await fetchMoneyMonth(userId, monthStart));
        setSyncStatus("saved");
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Could not save money log.");
        setSyncStatus("error");
      }
    } else {
      const localEntries = readLocalMoneyEntries();
      setMonthLogs(localEntries.filter((entry) => entry.date >= monthStart));
      setSyncStatus(hasSupabaseConfig ? "waiting" : "local");
    }
  };

  const addSubscription = async () => {
    if (!subName.trim() || subCost <= 0) return;
    const subscription: SubscriptionItem = {
      id: createLifeeeId(),
      name: subName.trim(),
      monthlyCost: subCost,
      active: true,
    };
    const next = { ...form, subscriptionItems: [subscription, ...form.subscriptionItems] };
    setSubName("");
    setSubCost(0);
    await handleSave(next);
  };

  const totalIncome = monthLogs.reduce((sum, row) => sum + row.income, 0);
  const totalSpending = monthLogs.reduce((sum, row) => sum + row.spending, 0);
  const totalSavings = monthLogs.reduce((sum, row) => sum + row.savings, 0);
  const totalDebt = monthLogs.reduce((sum, row) => sum + row.debt, 0);
  const netFlow = totalIncome - totalSpending;
  const savingsRate = totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 10000) / 100 : 0;

  const promptText = `Here is my money data:

Income: $${totalIncome}
Spending: $${totalSpending}
Savings: $${totalSavings}
Net cash flow: $${netFlow}
Savings rate: ${savingsRate}%
Debt: $${totalDebt}
Subscriptions: ${form.subscriptionItems.length} active, $${form.subscriptions}/mo

Calculate my cash flow, savings rate, biggest leak, and give me a simple financial plan for this week.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#ddd4c6] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[#25313c]">Money</h1>
            <p className="text-sm text-[#6f685f] mt-1">
              Track income, spending, debt, savings, and whether your financial behavior matches your goals.
            </p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getSyncTone(syncStatus)}`}>
            {getSyncLabel(syncStatus)}
          </span>
        </div>
        {syncError && <p className="mt-2 text-xs text-destructive">{syncError}</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-surface p-4 text-center">
          <Wallet size={18} className="text-[#6b87ae] mx-auto mb-2" />
          <div className="text-xl font-bold text-[#25313c]">${totalIncome}</div>
          <div className="text-[10px] text-[#6f685f]">Income</div>
        </div>
        <div className="card-surface p-4 text-center">
          <TrendingDown size={18} className="text-[#c97a73] mx-auto mb-2" />
          <div className="text-xl font-bold text-[#25313c]">${totalSpending}</div>
          <div className="text-[10px] text-[#6f685f]">Spending</div>
        </div>
        <div className="card-surface p-4 text-center">
          <TrendingUp size={18} className="text-[#6a9a74] mx-auto mb-2" />
          <div className="text-xl font-bold text-[#6a9a74]">${totalSavings}</div>
          <div className="text-[10px] text-[#6f685f]">Savings</div>
        </div>
        <div className="card-surface p-4 text-center">
          <div className="text-xl font-bold" style={{ color: netFlow >= 0 ? "#6a9a74" : "#c97a73" }}>
            ${netFlow}
          </div>
          <div className="text-[10px] text-[#6f685f]">Net Flow</div>
          <div className="text-[10px] text-[#6f685f]">{savingsRate}% saved</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">LOG TRANSACTIONS</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Income</label>
              <input type="number" value={form.income} onChange={(e) => setForm((p) => ({ ...p, income: Number(e.target.value) }))} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Spending</label>
              <input type="number" value={form.spending} onChange={(e) => setForm((p) => ({ ...p, spending: Number(e.target.value) }))} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Savings</label>
              <input type="number" value={form.savings} onChange={(e) => setForm((p) => ({ ...p, savings: Number(e.target.value) }))} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Debt</label>
              <input type="number" value={form.debt} onChange={(e) => setForm((p) => ({ ...p, debt: Number(e.target.value) }))} className="input-dark w-full" />
            </div>
          </div>
          <button onClick={() => void handleSave()} className="btn-primary w-full mt-3">
            {syncStatus === "saving" ? "Saving..." : "Save Log"}
          </button>
        </div>

        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#25313c] mb-3">SUBSCRIPTIONS</h3>
          <div className="space-y-2 mb-3">
            {form.subscriptionItems.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between text-xs">
                <span className="text-[#25313c]">{sub.name}</span>
                <span className="text-[#6f685f]">${sub.monthlyCost}/mo</span>
              </div>
            ))}
            {form.subscriptionItems.length === 0 && (
              <div className="text-xs text-[#8c8478]">
                No subscriptions tracked yet. Add recurring costs so the leak is visible.
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Name"
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              className="input-dark flex-1"
            />
            <input
              type="number"
              placeholder="$/mo"
              value={subCost}
              onChange={(e) => setSubCost(Number(e.target.value))}
              className="input-dark w-20"
            />
            <button onClick={() => void addSubscription()} className="btn-secondary">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      <ChatGPTPrompt title="Financial Plan" promptText={promptText} />
    </div>
  );
}
