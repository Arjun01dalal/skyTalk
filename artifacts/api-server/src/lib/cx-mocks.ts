// TEMPORARY hardcoded customer-scoped sample data for the in-chat
// Deposit / Withdrawal / Bet History issue flows. Personalized with the
// requesting user's name/id so the flow feels real. Once laxminarayan.live's
// WAF is opened, set EXTERNAL_API_MOCK=false and replace these with real
// upstream calls in routes/cx-data.ts.

export type CxDeposit = {
  dpId: string;
  name: string;
  mobileNo: string;
  txnId: string;
  amount: number;
  status: string;
  state: string;
  city: string;
  createdAt: string;
};

export type CxWithdrawal = CxDeposit & {
  check: string;
  crossCheck: string;
  lockStatus: string;
};

export type CxBet = {
  dpId: string;
  name: string;
  mobileNo: string;
  amount: number;
  status: string;
  category: string;
  appName: string;
  transactionId: string;
  roundId: string;
  provider: string;
  gameName: string;
  currency: string;
  gameSource: string;
  placedAt: string;
};

export const GAME_TYPES = [
  "Satta Matka",
  "Casino",
  "Exchange",
  "BetConstruct",
  "AN Exchange",
  "Sport Exchange",
  "AAA Excg",
] as const;

function dpIdFor(userId: number) {
  return `DP-${3000 + (userId % 1000)}`;
}

function mobileFor(userId: number) {
  return `98${String(10000000 + ((userId * 7919) % 89999999)).slice(0, 8)}`;
}

export function mockDeposits(userId: number, name: string): CxDeposit[] {
  const base = { dpId: dpIdFor(userId), name, mobileNo: mobileFor(userId), state: "Maharashtra", city: "Mumbai" };
  return [
    { ...base, txnId: "TXN-88121", amount: 5000, status: "success", createdAt: "2026-07-23T09:15:00Z" },
    { ...base, txnId: "TXN-88145", amount: 2000, status: "pending", createdAt: "2026-07-23T11:40:00Z" },
    { ...base, txnId: "TXN-88160", amount: 10000, status: "failed", createdAt: "2026-07-22T18:05:00Z" },
    { ...base, txnId: "TXN-88093", amount: 750, status: "success", createdAt: "2026-07-21T14:22:00Z" },
  ];
}

export function mockPendingWithdrawals(userId: number, name: string): CxWithdrawal[] {
  const base = { dpId: dpIdFor(userId), name, mobileNo: mobileFor(userId), state: "Maharashtra", city: "Mumbai" };
  return [
    { ...base, txnId: "WTX-55012", amount: 8000, status: "pending", check: "done", crossCheck: "pending", lockStatus: "unlocked", createdAt: "2026-07-23T08:20:00Z" },
    { ...base, txnId: "WTX-55031", amount: 3500, status: "processing", check: "done", crossCheck: "done", lockStatus: "locked", createdAt: "2026-07-22T19:45:00Z" },
  ];
}

export function mockBets(
  userId: number,
  name: string,
  filters: { from?: string; to?: string; gameType?: string; status?: string },
): CxBet[] {
  const base = { dpId: dpIdFor(userId), name, mobileNo: mobileFor(userId), currency: "INR" };
  const all: CxBet[] = [
    { ...base, amount: 1000, status: "Completed", category: "Sports", appName: "MainApp", transactionId: "BTX-77012", roundId: "RND-8801", provider: "BetConstruct", gameName: "Cricket - IND vs AUS", gameSource: "BetConstruct", placedAt: "2026-07-22T15:00:00Z" },
    { ...base, amount: 500, status: "Pending", category: "Casino", appName: "MainApp", transactionId: "BTX-77045", roundId: "RND-8834", provider: "Evolution", gameName: "Teen Patti", gameSource: "Casino", placedAt: "2026-07-23T09:12:00Z" },
    { ...base, amount: 2000, status: "Completed", category: "Matka", appName: "MainApp", transactionId: "BTX-77051", roundId: "RND-8840", provider: "SattaMatka", gameName: "Kalyan Open", gameSource: "Satta Matka", placedAt: "2026-07-23T10:30:00Z" },
    { ...base, amount: 300, status: "Pending", category: "Exchange", appName: "MainApp", transactionId: "BTX-77066", roundId: "RND-8852", provider: "AN Exchange", gameName: "Football - EPL", gameSource: "AN Exchange", placedAt: "2026-07-23T11:40:00Z" },
    { ...base, amount: 1500, status: "Completed", category: "Exchange", appName: "MainApp", transactionId: "BTX-77070", roundId: "RND-8860", provider: "Sport Exchange", gameName: "Tennis - Wimbledon", gameSource: "Sport Exchange", placedAt: "2026-07-21T13:05:00Z" },
  ];
  return all.filter((b) => {
    if (filters.gameType && b.gameSource !== filters.gameType) return false;
    if (filters.status && b.status.toLowerCase() !== filters.status.toLowerCase()) return false;
    if (filters.from && new Date(b.placedAt) < new Date(filters.from)) return false;
    if (filters.to && new Date(b.placedAt) > new Date(`${filters.to}T23:59:59Z`)) return false;
    return true;
  });
}
