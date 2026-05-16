import { useEffect, useMemo, useRef, useState } from "react";
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
import { Wallet, TrendingUp, TrendingDown, Plus, Trash2 } from "lucide-react";
import {
  AdvancedDetails,
  CollapsibleSection,
  InsightCard,
  PageDecisionHeader,
  SimpleOnly,
} from "@/components/ui-kit";
import { useUIMode } from "@/providers/UIModeContext";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/money-format";

const STORAGE_KEY = "lifeee.money_logs.v1";
const WEEKLY_KEY = "lifeee.money.weekly";

type WeeklyMoney = {
  currentCash: number;
  expectedIncome: number;
  requiredExpenses: number;
  savingsCommitment: number;
  minimumBuffer: number;
  debtBalance: number;
  debtPressure: number;
  moneyMove: string;
};

const defaultWeekly: WeeklyMoney = {
  currentCash: 0,
  expectedIncome: 0,
  requiredExpenses: 0,
  savingsCommitment: 0,
  minimumBuffer: 100,
  debtBalance: 0,
  debtPressure: 0,
  moneyMove: "",
};

function readWeekly(): WeeklyMoney {
  if (typeof window === "undefined") return defaultWeekly;
  try {
    const raw = window.localStorage.getItem(WEEKLY_KEY);
    if (!raw) return defaultWeekly;
    return { ...defaultWeekly, ...(JSON.parse(raw) as Partial<WeeklyMoney>) };
  } catch {
    return defaultWeekly;
  }
}

function writeWeekly(next: WeeklyMoney) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WEEKLY_KEY, JSON.stringify(next));
}

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

function hasMeaningfulMoneyDraft(entry: MoneyEntry) {
  return (
    entry.income > 0 ||
    entry.spending > 0 ||
    entry.savings > 0 ||
    entry.debt > 0 ||
    entry.subscriptions > 0 ||
    entry.upcomingExpenses > 0 ||
    Boolean(entry.biggestLeak.trim()) ||
    Boolean(entry.notes.trim()) ||
    entry.subscriptionItems.length > 0
  );
}

export default function MoneyPage() {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = `${today.slice(0, 7)}-01`;
  const { hasSupabaseConfig, isLoading: sessionLoading, userId } = useSupabaseSession();
  const { isSimple } = useUIMode();
  const [form, setForm] = useState<MoneyEntry>(() => {
    return readLocalMoneyEntries().find((entry) => entry.date === today) ?? defaultMoneyEntry(today);
  });
  const [weekly, setWeekly] = useState<WeeklyMoney>(() => readWeekly());
  const [monthLogs, setMonthLogs] = useState<MoneyEntry[]>([]);
  const [subName, setSubName] = useState("");
  const [subCost, setSubCost] = useState(0);
  const [syncStatus, setSyncStatus] = useState<LifeeeSyncStatus>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const remoteLoadedRef = useRef(false);

  const updateWeekly = (patch: Partial<WeeklyMoney>) => {
    setWeekly((prev) => {
      const next = { ...prev, ...patch };
      writeWeekly(next);
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      if (sessionLoading) {
        setSyncStatus("loading");
        return;
      }

      const localEntries = readLocalMoneyEntries();
      const localDraft = localEntries.find((entry) => entry.date === today) ?? null;
      const localEntry = localDraft && hasMeaningfulMoneyDraft(localDraft) ? localDraft : null;

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

        let nextSyncStatus: LifeeeSyncStatus = "saved";

        if (!remoteEntry && localEntry) {
          const uploaded = await upsertMoneyLog(userId, localEntry);
          if (!active) return;
          const nextEntry = uploaded ?? localEntry;
          setForm(nextEntry);
          writeLocalMoneyEntry(nextEntry);
          setMonthLogs(await fetchMoneyMonth(userId, monthStart));
        } else if (remoteEntry) {
          setForm(remoteEntry);
          writeLocalMoneyEntry(remoteEntry);
          setMonthLogs(remoteMonth);
        } else {
          setForm(defaultMoneyEntry(today));
          setMonthLogs(remoteMonth);
          nextSyncStatus = "local";
        }

        remoteLoadedRef.current = true;
        setSyncStatus(nextSyncStatus);
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

  const removeSubscription = async (id: string) => {
    const next = {
      ...form,
      subscriptionItems: form.subscriptionItems.filter((item) => item.id !== id),
    };
    await handleSave(next);
  };

  const totalIncome = monthLogs.reduce((sum, row) => sum + row.income, 0);
  const totalSpending = monthLogs.reduce((sum, row) => sum + row.spending, 0);
  const totalSavings = monthLogs.reduce((sum, row) => sum + row.savings, 0);
  const totalDebt = monthLogs.reduce((sum, row) => sum + row.debt, 0);
  const netFlow = totalIncome - totalSpending;
  const savingsRate = totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 10000) / 100 : 0;

  const safeToSpend = useMemo(
    () =>
      weekly.currentCash +
      weekly.expectedIncome -
      weekly.requiredExpenses -
      weekly.savingsCommitment -
      weekly.minimumBuffer,
    [weekly],
  );

  const interpretation = useMemo(() => {
    if (safeToSpend < 0) {
      return {
        tone: "Behind",
        line: "Behind — defer non-essential expenses",
        move:
          weekly.moneyMove.trim() ||
          "Move: postpone the largest discretionary line and cut one recurring leak this week.",
      };
    }
    if (safeToSpend < 100) {
      return {
        tone: "Tight",
        line: "Tight — limit discretionary spending",
        move:
          weekly.moneyMove.trim() ||
          "Move: hold a no-spend day and review your top recurring leak.",
      };
    }
    return {
      tone: "Comfortable",
      line: "Comfortable — on plan",
      move:
        weekly.moneyMove.trim() ||
        "Move: send the savings commitment now so it isn't spent.",
    };
  }, [safeToSpend, weekly.moneyMove]);

  const cashFlowWeek = weekly.currentCash + weekly.expectedIncome - weekly.requiredExpenses;

  const promptText = `Here is my money data:

Current cash: $${weekly.currentCash}
Expected income (week): $${weekly.expectedIncome}
Required expenses (week): $${weekly.requiredExpenses}
Savings commitment (week): $${weekly.savingsCommitment}
Minimum buffer: $${weekly.minimumBuffer}
Safe to spend: $${safeToSpend}
Debt balance: $${weekly.debtBalance} (pressure ${weekly.debtPressure}/10)

Month-to-date — Income: $${totalIncome}, Money Out: $${totalSpending}, Savings: $${totalSavings}, Cash Flow: $${netFlow}, Savings rate: ${savingsRate}%
Recurring leaks: ${form.subscriptionItems.length} active, $${form.subscriptions}/mo
Debt: $${totalDebt}

Calculate my cash flow, savings rate, biggest leak, and give me a simple money strategy for this week.`;

  return (
    <div className="space-y-6">
      <PageDecisionHeader
        title="Weekly Money Control"
        question="Am I financially safe this week?"
      >
        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getSyncTone(syncStatus)}`}>
          {getSyncLabel(syncStatus)}
        </span>
      </PageDecisionHeader>
      {syncError && <p className="text-xs text-destructive">{syncError}</p>}

      <InsightCard
        label="Safe to spend this week"
        value={formatCurrencyInput(safeToSpend)}
        interpretation={interpretation.line}
        reason={`current cash ${formatCurrencyInput(weekly.currentCash)} + expected income ${formatCurrencyInput(weekly.expectedIncome)} - required ${formatCurrencyInput(weekly.requiredExpenses)} - savings ${formatCurrencyInput(weekly.savingsCommitment)} - buffer ${formatCurrencyInput(weekly.minimumBuffer)}`}
        nextAction={`This week's money move: ${interpretation.move}`}
      />

      <CollapsibleSection
        title="Weekly inputs"
        subtitle="Drives Safe-to-Spend"
        defaultOpen={safeToSpend === 0 - weekly.minimumBuffer}
      >
        <p className="mb-3 text-xs text-muted-foreground">
          Weekly control inputs are a local-only scaffold for planning. The daily money log and recurring leaks still save normally.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <CurrencyInput label="Current cash" value={weekly.currentCash} onChange={(value) => updateWeekly({ currentCash: value })} />
          </div>
          <div>
            <CurrencyInput label="Expected income (week)" value={weekly.expectedIncome} onChange={(value) => updateWeekly({ expectedIncome: value })} />
          </div>
          <div>
            <CurrencyInput label="Required expenses (week)" value={weekly.requiredExpenses} onChange={(value) => updateWeekly({ requiredExpenses: value })} />
          </div>
          <div>
            <CurrencyInput label="Savings commitment (week)" value={weekly.savingsCommitment} onChange={(value) => updateWeekly({ savingsCommitment: value })} />
          </div>
          <div>
            <CurrencyInput label="Minimum buffer" value={weekly.minimumBuffer} onChange={(value) => updateWeekly({ minimumBuffer: value })} />
          </div>
        </div>
        <button onClick={() => void handleSave()} className="btn-primary mt-3 w-full">
          {syncStatus === "saving" ? "Saving..." : "Save Log"}
        </button>
      </CollapsibleSection>

      <CollapsibleSection title="Cash Flow" subtitle={`Week: $${cashFlowWeek}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card-surface p-4 text-center">
            <Wallet size={18} className="text-[#6b87ae] mx-auto mb-2" />
            <div className="text-xl font-bold text-[#25313c]">{formatCurrencyInput(weekly.currentCash + weekly.expectedIncome)}</div>
            <div className="text-[10px] text-[#6f685f]">Cash + Income (wk)</div>
          </div>
          <div className="card-surface p-4 text-center">
            <TrendingDown size={18} className="text-[#c97a73] mx-auto mb-2" />
            <div className="text-xl font-bold text-[#25313c]">{formatCurrencyInput(weekly.requiredExpenses)}</div>
            <div className="text-[10px] text-[#6f685f]">Money Out (wk)</div>
          </div>
          <div className="card-surface p-4 text-center">
            <TrendingUp size={18} className="text-[#6a9a74] mx-auto mb-2" />
            <div className="text-xl font-bold text-[#6a9a74]">{formatCurrencyInput(weekly.savingsCommitment)}</div>
            <div className="text-[10px] text-[#6f685f]">Savings (wk)</div>
          </div>
          <div className="card-surface p-4 text-center">
            <div className="text-xl font-bold" style={{ color: cashFlowWeek >= 0 ? "#6a9a74" : "#c97a73" }}>
              {formatCurrencyInput(cashFlowWeek)}
            </div>
            <div className="text-[10px] text-[#6f685f]">Cash Flow (wk)</div>
            <div className="text-[10px] text-[#6f685f]">MTD: {formatCurrencyInput(netFlow)}</div>
          </div>
        </div>
      </CollapsibleSection>

      <div className="card-surface p-4">
        <h3 className="text-sm font-semibold text-[#25313c] mb-3">RECURRING LEAKS</h3>
        <div className="space-y-2 mb-3">
          {form.subscriptionItems.map((sub) => (
            <div key={sub.id} className="flex items-center justify-between gap-3 rounded-md border border-[#e3d8c9] bg-[#fdfaf4] px-3 py-2 text-xs">
              <span className="text-[#25313c]">{sub.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[#6f685f]">{formatCurrencyInput(sub.monthlyCost)}/mo</span>
                <button
                  type="button"
                  onClick={() => void removeSubscription(sub.id)}
                  className="text-[#8c8478] hover:text-destructive"
                  aria-label={`Remove ${sub.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {form.subscriptionItems.length === 0 && (
            <div className="text-xs text-[#8c8478]">
              No recurring leaks tracked yet. Add recurring costs so the leak is visible.
            </div>
          )}
        </div>
        <div className="mb-3 text-xs text-[#6f685f]">
          Total monthly recurring cost:{" "}
          <span className="font-semibold text-[#25313c]">
            {formatCurrencyInput(form.subscriptionItems.reduce((sum, item) => sum + item.monthlyCost, 0))}
          </span>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="leak-name" className="text-[10px] uppercase text-[#6f685f] block mb-1">
              Recurring leak name
            </label>
            <input
              id="leak-name"
              type="text"
              placeholder="Streaming, app, membership"
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              className="input-dark w-full"
            />
          </div>
          <div className="w-24">
            <label htmlFor="leak-cost" className="text-[10px] uppercase text-[#6f685f] block mb-1">
              Cost / month
            </label>
            <input
              id="leak-cost"
              type="text"
              inputMode="numeric"
              placeholder="$/mo"
              value={subCost ? formatCurrencyInput(subCost) : ""}
              onChange={(e) => setSubCost(parseCurrencyInput(e.target.value))}
              className="input-dark w-full"
            />
          </div>
          <button onClick={() => void addSubscription()} className="btn-secondary">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <CollapsibleSection title="Upcoming Obligations" subtitle={formatCurrencyInput(form.upcomingExpenses)}>
        <label className="text-[10px] uppercase text-muted-foreground block mb-1">Total upcoming required expenses</label>
        <input
          type="text"
          inputMode="numeric"
          value={formatCurrencyInput(form.upcomingExpenses)}
          onChange={(e) => setForm((p) => ({ ...p, upcomingExpenses: parseCurrencyInput(e.target.value) }))}
          className="input-dark w-full"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Debt Pressure" subtitle={`${weekly.debtPressure}/10 - ${formatCurrencyInput(weekly.debtBalance)}`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <CurrencyInput label="Debt balance" value={weekly.debtBalance} onChange={(value) => updateWeekly({ debtBalance: value })} />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground block mb-1">
              Pressure (0–10): {weekly.debtPressure}
            </label>
            <input
              type="range"
              min={0}
              max={10}
              value={weekly.debtPressure}
              onChange={(e) => updateWeekly({ debtPressure: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="This week's money move" defaultOpen>
        <textarea
          value={weekly.moneyMove}
          onChange={(e) => updateWeekly({ moneyMove: e.target.value })}
          placeholder={interpretation.move}
          className="input-dark w-full min-h-[80px]"
        />
      </CollapsibleSection>

      <button onClick={() => void handleSave()} className="btn-primary w-full">
        {syncStatus === "saving" ? "Saving..." : "Save Log"}
      </button>

      {!isSimple && (
        <AdvancedDetails title="Money Strategy (detailed log)">
          <div className="card-surface p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Income (today)</label>
                <input type="number" value={form.income} onChange={(e) => setForm((p) => ({ ...p, income: Number(e.target.value) }))} className="input-dark w-full" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Money Out (today)</label>
                <input type="number" value={form.spending} onChange={(e) => setForm((p) => ({ ...p, spending: Number(e.target.value) }))} className="input-dark w-full" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Savings (today)</label>
                <input type="number" value={form.savings} onChange={(e) => setForm((p) => ({ ...p, savings: Number(e.target.value) }))} className="input-dark w-full" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Debt (today)</label>
                <input type="number" value={form.debt} onChange={(e) => setForm((p) => ({ ...p, debt: Number(e.target.value) }))} className="input-dark w-full" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase text-[#6f685f] block mb-1">Biggest leak</label>
                <input type="text" value={form.biggestLeak} onChange={(e) => setForm((p) => ({ ...p, biggestLeak: e.target.value }))} className="input-dark w-full" />
              </div>
            </div>
            <button onClick={() => void handleSave()} className="btn-primary w-full mt-3">
              {syncStatus === "saving" ? "Saving..." : "Save Log"}
            </button>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="card-surface p-3 text-center">
                <div className="text-base font-bold text-[#25313c]">${totalIncome}</div>
                <div className="text-[10px] text-[#6f685f]">MTD Income</div>
              </div>
              <div className="card-surface p-3 text-center">
                <div className="text-base font-bold text-[#25313c]">${totalSpending}</div>
                <div className="text-[10px] text-[#6f685f]">MTD Money Out</div>
              </div>
              <div className="card-surface p-3 text-center">
                <div className="text-base font-bold text-[#6a9a74]">${totalSavings}</div>
                <div className="text-[10px] text-[#6f685f]">MTD Savings</div>
              </div>
              <div className="card-surface p-3 text-center">
                <div className="text-base font-bold" style={{ color: netFlow >= 0 ? "#6a9a74" : "#c97a73" }}>${netFlow}</div>
                <div className="text-[10px] text-[#6f685f]">MTD Cash Flow · {savingsRate}%</div>
              </div>
            </div>
          </div>
        </AdvancedDetails>
      )}

      <SimpleOnly>
        <p className="text-xs text-muted-foreground">
          Switch to Advanced mode to see the detailed money strategy log and month-to-date totals.
        </p>
      </SimpleOnly>

      <ChatGPTPrompt title="Money Strategy" promptText={promptText} />
    </div>
  );
}

function CurrencyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-muted-foreground block mb-1">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={formatCurrencyInput(value)}
        onChange={(event) => onChange(parseCurrencyInput(event.target.value))}
        className="input-dark w-full"
      />
    </label>
  );
}
