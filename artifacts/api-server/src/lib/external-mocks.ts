// TEMPORARY hardcoded sample responses for the customer's domain API
// (laxminarayan.live). Served while their AWS WAF still blocks
// server-to-server calls. Once the firewall is opened, set the env var
// EXTERNAL_API_MOCK=false and the proxy will hit the real API instead.
// Shapes mirror typical gaming-platform list endpoints; adjust field names
// to the real API contract when it becomes reachable.

export const externalMocks: Record<string, unknown> = {
  "deposit-list": {
    total: 5,
    data: [
      { id: "DP-10231", userId: "USR-3001", userName: "Rahul Sharma", amount: 5000, method: "UPI", utr: "417223981123", status: "success", createdAt: "2026-07-23T09:15:00Z" },
      { id: "DP-10232", userId: "USR-3105", userName: "Priya Patel", amount: 12000, method: "IMPS", utr: "417223981456", status: "pending", createdAt: "2026-07-23T10:02:00Z" },
      { id: "DP-10233", userId: "USR-2988", userName: "Amit Verma", amount: 2500, method: "UPI", utr: "417223981789", status: "success", createdAt: "2026-07-23T10:40:00Z" },
      { id: "DP-10234", userId: "USR-3222", userName: "Sneha Reddy", amount: 800, method: "UPI", utr: "417223982001", status: "failed", createdAt: "2026-07-23T11:05:00Z" },
      { id: "DP-10235", userId: "USR-3001", userName: "Rahul Sharma", amount: 15000, method: "NEFT", utr: "417223982233", status: "success", createdAt: "2026-07-23T12:30:00Z" },
    ],
  },
  "withdrawal-list": {
    total: 4,
    data: [
      { id: "WD-5081", userId: "USR-3105", userName: "Priya Patel", amount: 8000, bankAccount: "XXXX4521", ifsc: "HDFC0001234", status: "processing", requestedAt: "2026-07-23T08:20:00Z" },
      { id: "WD-5082", userId: "USR-2988", userName: "Amit Verma", amount: 3000, bankAccount: "XXXX8817", ifsc: "SBIN0004567", status: "completed", requestedAt: "2026-07-23T09:45:00Z" },
      { id: "WD-5083", userId: "USR-3222", userName: "Sneha Reddy", amount: 20000, bankAccount: "XXXX9930", ifsc: "ICIC0002211", status: "rejected", reason: "KYC pending", requestedAt: "2026-07-23T10:10:00Z" },
      { id: "WD-5084", userId: "USR-3001", userName: "Rahul Sharma", amount: 6500, bankAccount: "XXXX1204", ifsc: "AXIS0007788", status: "pending", requestedAt: "2026-07-23T11:55:00Z" },
    ],
  },
  "kyc-list": {
    total: 4,
    data: [
      { id: "KYC-901", userId: "USR-3001", userName: "Rahul Sharma", docType: "Aadhaar", docNumber: "XXXX-XXXX-1234", status: "verified", submittedAt: "2026-07-20T14:00:00Z" },
      { id: "KYC-902", userId: "USR-3105", userName: "Priya Patel", docType: "PAN", docNumber: "XXXXX123X", status: "pending", submittedAt: "2026-07-22T16:30:00Z" },
      { id: "KYC-903", userId: "USR-3222", userName: "Sneha Reddy", docType: "Aadhaar", docNumber: "XXXX-XXXX-9876", status: "rejected", reason: "Blurry document photo", submittedAt: "2026-07-21T11:10:00Z" },
      { id: "KYC-904", userId: "USR-2988", userName: "Amit Verma", docType: "Driving License", docNumber: "DL-XX20260011", status: "verified", submittedAt: "2026-07-19T09:25:00Z" },
    ],
  },
  "bet-history": {
    total: 5,
    data: [
      { id: "BT-77012", userId: "USR-3001", userName: "Rahul Sharma", game: "Cricket - IND vs AUS", market: "Match Winner", selection: "India", stake: 1000, odds: 1.85, status: "won", payout: 1850, placedAt: "2026-07-22T15:00:00Z" },
      { id: "BT-77013", userId: "USR-3105", userName: "Priya Patel", game: "Teen Patti", market: "Table 12", selection: "Player A", stake: 500, odds: 2.1, status: "lost", payout: 0, placedAt: "2026-07-22T16:12:00Z" },
      { id: "BT-77014", userId: "USR-2988", userName: "Amit Verma", game: "Football - EPL", market: "Over/Under 2.5", selection: "Over", stake: 2000, odds: 1.95, status: "open", payout: null, placedAt: "2026-07-23T09:30:00Z" },
      { id: "BT-77015", userId: "USR-3222", userName: "Sneha Reddy", game: "Roulette", market: "Round 8812", selection: "Red", stake: 300, odds: 2.0, status: "won", payout: 600, placedAt: "2026-07-23T10:05:00Z" },
      { id: "BT-77016", userId: "USR-3001", userName: "Rahul Sharma", game: "Cricket - IND vs AUS", market: "Top Batsman", selection: "V. Kohli", stake: 750, odds: 3.5, status: "lost", payout: 0, placedAt: "2026-07-23T11:40:00Z" },
    ],
  },
};
