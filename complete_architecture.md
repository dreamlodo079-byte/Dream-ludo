# Sexus Ludo Platform: Full-Stack Architecture & Feature Logic Manual

This document provides a comprehensive, production-grade map of the entire **Sexus Ludo** real-money gaming codebase. It details every subsystem, transaction rule, game engine state, bracket logic, admin terminal capability, referral binding loop, and mobile UI screen.

---

## 1. Backend Architecture & Subsystems (`backend/`)

### 1.1 Database Configuration & Models (`src/models/`)

#### A. User Model (`User.ts`)
*   **Insulated 3-Tier Wallet:** Houses distinct balance slots:
    *   `depositBalance`: Unused cash deposited by the player.
    *   `winningsBalance`: Withdrawable rewards won from tournaments or matches.
    *   `bonusBalance`: Promotional bonus cash (capped at 10% maximum usage per match entry). Starts with ₹10.00 for new registrations upon referral code binding.
*   **Referral Tracking Properties:**
    *   `referralCode`: Alphanumeric unique code string generated automatically upon registration (e.g. `SEXUS50SEXUS`).
    *   `referredBy`: Stores the referral code of the user who invited them.
    *   `friendsJoined`: Tracks the number of successful friend registrations.
*   **Privilege & Security Flags:**
    *   `role`: `'USER' | 'SUPER_ADMIN'`.
    *   `isAdmin`: Boolean flag for administrative system access.
    *   `phone`: 10-digit mobile number string. Dedicated admin signature `7389927777` automatically overrides token permissions.
*   **KYC Profile Verification:** Tracks Aadhaar/PAN validation states (`kycStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'`).

#### B. Transaction Model (`Transaction.ts`)
*   **Double-Entry Signed Ledger:** Logs all financial movements. Entries contain user ID, amount, status (`PENDING | SUCCESS | FAILED`), type, and a unique `referenceId` for idempotency.
*   **Ledger Types:**
    *   `DEPOSIT`: Direct deposit credits.
    *   `WITHDRAWAL`: Cash payouts to user UPI IDs or admin earnings withdrawals (`admin_payout_`).
    *   `ENTRY_FEE_DEBIT`: Entry fees deducted when joining regular queues or private lobbies.
    *   `ENTRY_FEE_REFUND`: Refunded entry fees when leaving queues or on emergency tournament cancellation.
    *   `WINNINGS`: Credits awarded to match winners.
    *   `TOURNAMENT_WIN_CREDIT`: Credits distributed for tournament placement brackets.
    *   `REFERRAL_BONUS_CREDIT`: Credits awarded for referring friends (₹100.00 to Referrer, ₹10.00 to New Registrant).
    *   `PLATFORM_COMMISSION`: Commission (10% platform rake) logged to virtual platform profile ID `000000000000000000000000`.
*   **Running Balance Sync Trigger:** Mongoose post-save hooks automatically increment/decrement user wallet balances upon transaction resolution.

#### C. Tournament Model (`Tournament.ts`)
*   **Properties & Bracket State:**
    *   `title`: Alphanumeric tournament name.
    *   `totalPrizePool`: Total prize cash allocated.
    *   `entryFee`: Cash required to enter.
    *   `maxEntries`: Maximum participant capacity.
    *   `registeredUsers`: Array of registered user ObjectIDs.
    *   `startsAt`: ISO Date object representing scheduled start date & time.
    *   `status`: `'UPCOMING' | 'ACTIVE' | 'CONCLUDED'`.
    *   `currentRound`: Round index tracker.

---

### 1.2 Core Services & Logic Engines (`src/services/`)

#### A. Ludo Game Engine (`gameEngine.ts`)
*   **Server-Authoritative Game Rules:**
    *   **Three 6s Void Rule:** Rolling three consecutive 6s automatically voids the turn and passes the dice to the opponent.
    *   **Consecutive Roll Rule:** Rolling a 6 or capturing an opponent's token yields an extra roll.
    *   **Safe Zones:** Tokens on starting spots or star cells are protected.
    *   **Roll & Move Validations:** Calculates token path coordinates.
*   **Server Bot Logic:** Simulates realistic player behavior and moves.

#### B. Socket Manager & Concurrency Engine (`socketManager.ts`)
*   **Multi-Device Session Enforcement (`userDeviceSockets`):**
    *   *Regular Users*: Strictly limited to **1 active socket session** per account/ID. Connecting on a new device emits `SESSION_TERMINATED` and disconnects the previous socket.
    *   *Admin Users*: Allowed up to **3 active socket sessions** simultaneously. Connecting on a 4th device disconnects the oldest session.
*   **Turn Timers & Disconnect Grace Periods:** Monitors 15-second turn timers and 60-second player disconnect grace periods. Auto-forfeits if reconnection fails.
*   **Wallet Settlement Hook:** Concludes matches, computes the 10% commission, and credits the winner's wallet.

#### C. Lobby & Matchmaking Service (`lobbyService.ts` & `matchmaker.ts`)
*   **Lobby Tiers:** 8 Cash Tiers (₹3, ₹5, ₹10, ₹25, ₹50, ₹100, ₹250, ₹500).
*   **Immediate Queue Debit:** When joining a queue, entry fees are debited immediately using Mongoose ACID transactions.
*   **Forfeit Refunds:** Leaving the queue triggers a Mongoose transaction that refunds the entry fee back to the source wallet.
*   **Automated Bot fallbacks:** Matches default to bots if the dynamic timeout (13s to 20s) is reached without finding a human player.

#### D. Admin & Tournament Routes (`src/routes/admin.ts`)
*   **Privilege Middleware (`requireSuperAdmin`)**: Validates `role === 'SUPER_ADMIN'` or `isAdmin: true` before granting access.
*   **Real-Time Telemetry Endpoint (`GET /api/admin/audit`)**: Aggregates total platform rake, total admin payouts, net available to withdraw, TDS tax collected (30%), total player funds (Deposits, Winnings, Bonus), and match fee profit breakdown.
*   **Admin Payout Endpoint (`POST /api/admin/withdraw`)**: Processes platform rake withdrawals to target UPI ID, creates immutable `WITHDRAWAL` transaction logs, and updates telemetry in real-time.
*   **Tournament CRUD Endpoints**:
    *   `POST /api/admin/tournament/create`: Creates a new tournament.
    *   `PUT /api/admin/tournament/update/:id`: Updates tournament title, prize pool, entry fee, capacity, start time (`startsAt`), or status.
    *   `DELETE /api/admin/tournament/delete/:id`: Permanently deletes a tournament.
    *   `POST /api/admin/tournament/trigger`: Force-starts a tournament bracket immediately.
    *   `POST /api/admin/tournament/cancel`: Cancels a tournament and refunds all entry fees to registrants in Mongoose ACID transactions.

---

## 2. Mobile Client Components (`mobile-client/`)

### 2.1 Screens & Layout Directory (`src/screens/`)

#### A. Auth & Wallet (`AuthWalletScreen.tsx`)
*   **Auth Tabs (LOG IN / SIGN UP):** Toggle between Login and Registration views.
*   **Capsule Referral Claim Input:** Pill-shaped referral input container (`borderRadius: 24`, `#EEF2FF` backdrop) with an interactive `CLAIM` button (`✓ CLAIMED`).
*   **Sandbox Master OTP (`123456`):** Universal master test OTP (`123456`) accepting any 10-digit mobile number during testing without Redis errors.
*   **Insulated Deposit & Withdrawals:** Supports UPI payment intents and IMPS withdrawal processing.

#### B. Dashboard Screen (`DashboardScreen.tsx`)
*   **Tab Navigation:** HOME, LIVE, RANKINGS, PROFILE footer tabs.
*   **Match Segment Sliders:** Animated tabs for QUICK, REGULAR, and ROOMS modes.
*   **Multi-Tournament Cards:** Renders all active/upcoming tournaments dynamically with formatted start dates (`formatDateTime`).
*   **Private Lobby Generator:** Creates private room codes and handles direct room code joining.

#### C. Admin Terminal Screen (`AdminPanelScreen.tsx`)
*   **Header Branding:** Titled `🎛️ ADMIN TERMINAL` with `ADMIN ACCESS` badge.
*   **3 Segmented Capsule Sub-Tabs:**
    1. **`📈 Earnings`**: Real-time aggregated financial telemetry, total revenue, available withdrawal balance, TDS tax collected, player wallet reserves, and `WITHDRAW PLATFORM EARNINGS` quick-fill card.
    2. **`⚡ Matches`**: Live player sockets, active game room directory, bot driver diagnostic matrix, and concurrency tracking.
    3. **`🏆 Tournaments`**: Tournament list cards displaying `Start Time: 📅`, joined slots progress bar, and action buttons (`✏️ EDIT`, `🗑️ DELETE`, `⚡ FORCE START`, `🚨 CANCEL & REFUND`).
*   **Tournament Create/Edit Modal**: Modal overlay to create and edit tournaments with custom Start Date & Time input (`YYYY-MM-DDTHH:mm`) and quick presets (`⚡ NOW`, `⏱️ +1 HR`, `📅 +1 DAY`).
*   **Custom Toast & Modal System**: Replaces plain browser alerts with floating capsule Toast banners (`showToast`) and modern Modal Confirmation Dialogs (`showConfirmDialog`).

#### D. Game Screen (`GameScreen.tsx`)
*   **Interactive SVG Canvas:** Renders the board, dice rollers, token counters, safe cell indicators, valid move overlays, and victory popups.

#### E. Live Arena, Leaderboard & Challenges (`LiveArenaScreen.tsx`, `LeaderboardScreen.tsx`, `ChallengeScreen.tsx`)
*   **Live Arena:** List displaying active cash cards, player online headcounts, and status wait timers.
*   **Leaderboard:** Podium graphics for top 3 earners and list views for ranks 4 to 50.
*   **Challenges:** Progress tracking bars and milestone bonus credit claim hooks.

---

### 2.2 Hooks (`src/hooks/`)
*   `useWallet.ts`: Synchronizes deposit, winnings, and bonus balances with backend ledger.
*   `useSocket.ts`: Socket communication client handling turn events, timers, and session terminations.
*   `useAppAutoUpdate.ts`: Checks for updates on app start, fetches them silently in the background, and deploys them.
