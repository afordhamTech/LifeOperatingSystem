import { useState } from "react";
import { trpc } from "@/providers/trpc";
import ChatGPTPrompt from "@/components/ChatGPTPrompt";
import { Wallet, TrendingUp, TrendingDown, Plus } from "lucide-react";

export default function MoneyPage() {
  const today = new Date().toISOString().split("T")[0];
  const utils = trpc.useUtils();

  const { data: dashboard } = trpc.money.getDashboard.useQuery();
  const { data: subscriptions } = trpc.money.listSubscriptions.useQuery();
  const upsertMoney = trpc.money.upsert.useMutation({
    onSuccess: () => {
      utils.money.getDashboard.invalidate();
    },
  });
  const addSubscription = trpc.money.addSubscription.useMutation({
    onSuccess: () => utils.money.listSubscriptions.invalidate(),
  });

  const [income, setIncome] = useState(0);
  const [spending, setSpending] = useState(0);
  const [savings, setSavings] = useState(0);
  const [debt, setDebt] = useState(0);
  const [subName, setSubName] = useState("");
  const [subCost, setSubCost] = useState(0);

  const handleSave = () => {
    upsertMoney.mutate({ date: today, income, spending, savings, debt });
  };

  const netFlow = (dashboard?.income ?? 0) - (dashboard?.spending ?? 0);
  const savingsRate = dashboard?.savingsRate ?? 0;

  const promptText = `Here is my money data:

Income: $${dashboard?.income ?? 0}
Spending: $${dashboard?.spending ?? 0}
Savings: $${dashboard?.savings ?? 0}
Net cash flow: $${netFlow}
Savings rate: ${savingsRate}%
Debt: $${dashboard?.debtPressure ?? 0}
Subscriptions: ${subscriptions?.length ?? 0} active

Calculate my cash flow, savings rate, biggest leak, and give me a simple financial plan for this week.`;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.06] pb-4">
        <h1 className="text-2xl font-semibold text-[#eaeaea]">Money</h1>
        <p className="text-sm text-[#777777] mt-1">
          Track income, spending, debt, savings, and whether your financial behavior matches your goals.
        </p>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-surface p-4 text-center">
          <Wallet size={18} className="text-[#3b82f6] mx-auto mb-2" />
          <div className="text-xl font-bold text-[#eaeaea]">${dashboard?.income ?? 0}</div>
          <div className="text-[10px] text-[#777777]">Income</div>
        </div>
        <div className="card-surface p-4 text-center">
          <TrendingDown size={18} className="text-[#ef4444] mx-auto mb-2" />
          <div className="text-xl font-bold text-[#eaeaea]">${dashboard?.spending ?? 0}</div>
          <div className="text-[10px] text-[#777777]">Spending</div>
        </div>
        <div className="card-surface p-4 text-center">
          <TrendingUp size={18} className="text-[#22c55e] mx-auto mb-2" />
          <div className="text-xl font-bold text-[#22c55e]">${dashboard?.savings ?? 0}</div>
          <div className="text-[10px] text-[#777777]">Savings</div>
        </div>
        <div className="card-surface p-4 text-center">
          <div className="text-xl font-bold" style={{ color: netFlow >= 0 ? "#22c55e" : "#ef4444" }}>
            ${netFlow}
          </div>
          <div className="text-[10px] text-[#777777]">Net Flow</div>
          <div className="text-[10px] text-[#777777]">{savingsRate}% saved</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input Form */}
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">LOG TRANSACTIONS</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-[#777777] block mb-1">Income</label>
              <input type="number" value={income} onChange={(e) => setIncome(Number(e.target.value))} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#777777] block mb-1">Spending</label>
              <input type="number" value={spending} onChange={(e) => setSpending(Number(e.target.value))} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#777777] block mb-1">Savings</label>
              <input type="number" value={savings} onChange={(e) => setSavings(Number(e.target.value))} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#777777] block mb-1">Debt</label>
              <input type="number" value={debt} onChange={(e) => setDebt(Number(e.target.value))} className="input-dark w-full" />
            </div>
          </div>
          <button onClick={handleSave} className="btn-primary w-full mt-3">
            {upsertMoney.isPending ? "Saving..." : "Save Log"}
          </button>
        </div>

        {/* Subscriptions */}
        <div className="card-surface p-4">
          <h3 className="text-sm font-semibold text-[#eaeaea] mb-3">SUBSCRIPTIONS</h3>
          <div className="space-y-2 mb-3">
            {(subscriptions ?? []).map((sub) => (
              <div key={sub.id} className="flex items-center justify-between text-xs">
                <span className="text-[#eaeaea]">{sub.name}</span>
                <span className="text-[#777777]">${sub.monthlyCost}/mo</span>
              </div>
            ))}
            {(!subscriptions || subscriptions.length === 0) && (
              <div className="text-xs text-[#444444]">No subscriptions tracked</div>
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
            <button
              onClick={() => {
                if (subName && subCost) {
                  addSubscription.mutate({ name: subName, monthlyCost: subCost });
                  setSubName("");
                  setSubCost(0);
                }
              }}
              className="btn-secondary"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      <ChatGPTPrompt title="Financial Plan" promptText={promptText} />
    </div>
  );
}
