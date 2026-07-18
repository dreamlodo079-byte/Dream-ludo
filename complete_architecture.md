# Sexus Ludo Platform: Full-Stack Architecture & Feature Logic Manual

This document provides a comprehensive, production-grade map of the entire **Sexus Ludo** real-money gaming codebase. It details every subsystem, transaction rule, game engine state, bracket logic, and mobile UI page.

---

## 1. Backend Architecture & Subsystems (`backend/`)

### 1.1 Database Configuration & Models (`src/models/`)

#### A. User Model (`User.ts`)
*   **Insulated Wallet:** Houses the 3-tier wallet structure:
    *   `depositBalance`: Unused cash added by the player.
    *   `winningsBalance`: Withdrawable rewards won from tournaments or matches.
    *   `bonusBalance`: Promo balance capped at 10% maximum usage per entry. Starts at ?10.00 for new registrations.
*   **KYC Profile Verification:** Tracks Aadhaar/PAN validation states (`kycStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'`).
*   **Referral rewards hook:** Invoking `handleReferralSuccess` credits the referrer with a ?100.00 bonus balance.

#### B. Transaction Model (`Transaction.ts`)
*   **Signed Ledger:** Logs all cash flows. Entries contain amount, status (`PENDING | SUCCESS | FAILED`), type, and a unique `referenceId` for idempotency.
*   **Ledger Types:**
    *   `DEPOSIT`: Direct deposit credits.
    *   `WITHDRAWAL`: Cash payouts.
    *   `ENTRY_FEE_DEBIT`: Cash deducted when joining regular queues or private lobbies.
    *   `ENTRY_FEE_REFUND`: Refunded queue entry fees.
    *   `WINNINGS`: Credits awarded to match winners.
    *   `TOURNAMENT_WIN_CREDIT`: Credits distributed for tournament placement brackets.
    *   `PLATFORM_COMMISSION`: Commission (10% platform rake) logged to platform ID `000000000000000000000000`.
*   **Running Balance Sync Trigger:** Mongoose post-save hooks automatically increment/decrement user wallet balances upon transaction resolution.

#### C. Tournament Model (`Tournament.ts`)
*   **Bracket state structure:** Persists tournament status (`UPCOMING | ACTIVE | CONCLUDED`), rounds matches pairings, player lists, bye exemptions, and rankings lists.

---

### 1.2 Core Services & Logic Engines (`src/services/`)

#### A. Ludo Game Engine (`gameEngine.ts`)
*   **Game Rules:** Enforces standard Ludo rules:
    *   **Three 6s Void Rule:** Rolling three consecutive 6s automatically voids the turn and passes the dice to the opponent.
    *   **Consecutive Roll Rule:** Rolling a 6 or capturing an opponent's token yields an extra roll.
    *   **Safe Zones:** Tokens on starting spots or star cells are protected.
    *   **Roll & Move Validations:** Calculates token path coordinates.
*   **Server Bot Logic:** Simulates realistic player behavior and moves.

#### B. Clustered Sockets Manager (`socketManager.ts`)
*   **Redis PubSub Adapter:** Pools events across clustered instances for horizontal scaling.
*   **Turn timers:** Monitors 15-second turn timers.
*   **Reconnection engine:** If a socket disconnects, starts a 60-second grace period. Auto-forfeits the match if reconnection fails.
*   **Wallet Settlement Hook:** Concludes matches, computes the 10% commission, and credits the winner's wallet.

#### C. Lobby & Matchmaking Service (`lobbyService.ts` & `matchmaker.ts`)
*   **Lobby Tiers:** 8 Cash Tiers (?3, ?5, ?10, ?25, ?50, ?100, ?250, ?500).
*   **Immediate Queue Debit:** When joining a queue, entry fees are debited immediately using Mongoose ACID transactions.
*   **Lobby state broadcasting:** Socket broadcasters emit real-time waiting/playing counts every 1000ms.
*   **Forfeit Refunds:** Leaving the queue triggers a Mongoose transaction that refunds the entry fee back to the precise source wallet slots.
*   **Automated Bot fallbacks:** Matches default to bots if the dynamic timeout (60s to 180s depending on tier) is reached without finding a human player.

#### D. Scheduled Tournament Engine (`tournamentEngine.ts`)
*   **Tournament Scheduler:** Periodically polls upcoming tournaments and starts brackets.
*   **Knockout Pairing Matrix:** Matches players randomly. Exempts odd player counts via standard BYEs.
*   **Connection forfeit timer:** Gives players 60 seconds to connect on match start, auto-advancing active opponents on failure.
*   **Payout & rake settles:** Distributes prize pools (1st: 50%, 2nd: 25%, 3rd: 15%, 4th: 10%) and logs the remaining rake.

---

## 2. Mobile Client Components (`mobile-client/`)

### 2.1 Screens & Layout Directory (`src/screens/`)

#### A. Auth & Wallet (`AuthWalletScreen.tsx`)
*   **Autofill Protection:** Disables password manager autocomplete hijackings.
*   **Ternary Toggles:** Toggle password visibility safely.
*   **Phone Validation:** Strips alphabets or symbols during entry: `onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}`.
*   **KYC forms:** Aadhaar/PAN fields displaying verify loaders and error dialogs.
*   **Insulated Withdrawals:** Displays balance limits and processes UPI payouts.

#### B. Dashboard screen (`DashboardScreen.tsx`)
*   **Tab Navigation:** HOME, LIVE, RANKINGS, PROFILE footer tabs.
*   **Match segment sliders:** Animated tabs for QUICK, REGULAR, and ROOMS modes.
*   **Lobby Creators:** Generates private room codes and invite shares via WhatsApp.

#### C. Live Arena Screen (`LiveArenaScreen.tsx`)
*   **Light-Theme Scroll View:** List displaying active cash cards, player online headcounts, and pulsing status wait timers.
*   **expandable prize selectors:** Displays prize pool commission details (e.g. Entry Fee ?50 yields WIN ?90).
*   **Overlay Loading Indicators:** Animated spinners with cancel hooks.

#### D. Game screen (`GameScreen.tsx`)
*   **Interactive canvas:** Renders the board, dice rollers, token counters, and valid move overlays.

---

### 2.2 Hooks (`src/hooks/`)
*   `useWallet.ts`: Balance synchronizers.
*   `useSocket.ts`: Socket communication client.
*   `useOTAUpdates.ts`: Checks for updates on app start, fetches them silently in the background, and deploys them when the app transitions to the background.
