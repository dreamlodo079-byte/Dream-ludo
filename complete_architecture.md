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
*   **Promoter Management Attributes:**
    *   `isPromoter`: Boolean flag designating if the user is a promotional account.
    *   `promoMatchState`: Mixed/Object schema storing target metrics and live match details allocated for automated promoters.
*   **Privilege & Security Flags:**
    *   `role`: `'USER' | 'SUPER_ADMIN'`.
    *   `isAdmin`: Boolean flag for administrative system access.
    *   `phone`: 10-digit mobile number string. Dedicated bypass numbers (`7024065858`, `9302561971`, and `7389927777`) bypass OTP verification and automatically acquire `SUPER_ADMIN` / `isAdmin: true` status on sign-up/login.
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
*   **Forced Promotional States:** Extends `MatchState` with an optional `promoState` parameter (`'PROMO_WIN_FORCED' | 'PROMO_LOSE_FORCED'`) to dynamically govern the bot's pathing strategy.

#### B. Socket Manager & Concurrency Engine (`socketManager.ts`)
*   **Multi-Device Session Enforcement (`userDeviceSockets`):**
    *   *Regular Users*: Strictly limited to **1 active socket session** per account/ID. Connecting on a new device emits `SESSION_TERMINATED` and disconnects the previous socket.
    *   *Super Admins (Bypass accounts like 7024065858, 9302561971, 7389927777)*: Allowed up to **3 active socket sessions** simultaneously. Connecting on a 4th device disconnects the oldest session.
*   **Turn Timers & Disconnect Grace Periods:** Monitors 15-second turn timers and 60-second player disconnect grace periods. Auto-forfeits if reconnection fails.
*   **Wallet Settlement Hook:** Concludes matches, computes the 10% commission, and credits the winner's wallet.
*   **Two-Way Handshake Synchronization Loop:** Implements a `READY_TO_ENTER` event listener. The server marks matched players as ready and transitions the room status to `ACTIVE` (emitting `START_MATCH_GAME` to launch the game screen simultaneously) only after verifying both clients responded successfully.
*   **Promoter Outcome Flipping:** Checks for `isPromoter === true` in the database transaction upon match termination. Swaps the promoter's target state for that custom stake key (`stake_<fee>`) from `MUST_WIN` to `MUST_LOSE` or vice versa.

#### C. Lobby & Matchmaking Service (`lobbyService.ts` & `matchmaker.ts`)
*   **Lobby Tiers:** 8 Cash Tiers (₹3, ₹5, ₹10, ₹25, ₹50, ₹100, ₹250, ₹500).
*   **Immediate Queue Debit:** When joining a queue, entry fees are debited immediately using Mongoose ACID transactions.
*   **Forfeit Refunds:** Leaving the queue triggers a Mongoose transaction that refunds the entry fee back to the source wallet.
*   **Automated Bot fallbacks:** Matches default to bots if the dynamic timeout (13s to 20s) is reached without finding a human player.
*   **Synchronized Handshake Gate:** When two humans match, their session is initialized with a status of `MATCH_PENDING`, their connection parameters are cached, they join the socket room, and a `MATCH_FOUND_ACK` signal is dispatched with a 5-second safety fallback timeout.
*   **Timeout & Disconnect Fallbacks:** If a client fails to report a ready handshake within 5 seconds (or disconnects during the pending state), the handshake aborts:
    *   The ready player is re-queued into the high-priority front slot of their matchmaking tier using Redis `lPush`.
    *   The timed-out/failed player is refunded in a Mongoose database transaction.
*   **Promoter Queue Interceptor:** Intercepts queue entries for accounts with `isPromoter === true`. It bypasses the human matching pool entirely, debits the fee, queries the custom stake key (e.g. `stake_13`) to identify if they must win or lose, and instantly launches a bot match with the corresponding `promoState`.

#### D. Admin & Tournament Routes (`src/routes/admin.ts` & `src/controllers/adminController.ts`)
*   **Privilege Middleware (`requireSuperAdmin`)**: Validates `role === 'SUPER_ADMIN'` or `isAdmin: true` before granting access.
*   **Real-Time Telemetry Endpoint (`GET /api/admin/audit`)**: Aggregates total platform rake, total admin payouts, net available to withdraw, TDS tax collected (30%), total player funds (Deposits, Winnings, Bonus), and match fee profit breakdown.
*   **Admin Payout Endpoint (`POST /api/admin/withdraw`)**: Processes platform rake withdrawals to target UPI ID, creates immutable `WITHDRAWAL` transaction logs, and updates telemetry in real-time.
*   **Promoter Management Routes**:
    *   `POST /api/admin/promoter/promote`: Promotes a regular user to a promoter account, checked against a strict concurrency limit of **3 active promoters** max inside a Mongoose ACID transaction.
    *   `POST /api/admin/promoter/demote`: Demotes a user and purges their promoter configuration and metrics.
    *   `GET /api/admin/users`: Lists all system users, displaying their promoter status and wallet profiles.
*   **Tournament CRUD Endpoints**:
    *   `POST /api/admin/tournament/create`: Creates a new tournament.
    *   `PUT /api/admin/tournament/update/:id`: Updates tournament title, prize pool, entry fee, capacity, start time (`startsAt`), or status.
    *   `DELETE /api/admin/tournament/delete/:id`: Permanently deletes a tournament.
    *   `POST /api/admin/tournament/trigger`: Force-starts a tournament bracket immediately.
    *   `POST /api/admin/tournament/cancel`: Cancels a tournament and refunds all entry fees to registrants in Mongoose ACID transactions.

#### E. Bot Driver & Pathing Engine (`botDriver.ts`)
*   **Dynamic Outcomes Pathing:** Employs customized weights based on `state.promoState`:
    *   **Forced Bot Loss (`PROMO_WIN_FORCED`)**: Bot plays sub-optimally to guarantee the promoter wins. It actively avoids captures, safe zones, and entering the home zone.
    *   **Forced Bot Win (`PROMO_LOSE_FORCED`)**: Bot plays in a high-difficulty mode, selecting the mathematically optimal move deterministically.
*   **Promoter Outcome Flipping:** Similar to the socket manager, swaps the promoter's target win/loss state inside the database transaction when a bot match terminates.

---

## 2. Mobile Client Components (`mobile-client/`)

### 2.0 Bootstrapping & Entry Configuration
*   **Custom Entry Point (`index.js`)**: Configured `"main": "index.js"` inside `package.json` to allow global environment preparation.
*   **DOMException Hermes Polyfill**: Intercepts missing references before bundling React Native frameworks. Injected at the absolute top of `index.js`, it declares an inline class constructor for `DOMException` extending the native JavaScript `Error` object. Subsequent files are loaded using CommonJS `require()` to bypass ES6 import hoisting and ensure the polyfill runs strictly first.
*   **Babel Compiler Compatibility**: Standardized on Expo SDK 54 expected dependencies (`babel-preset-expo@~54.0.10` and `typescript@~5.9.2`) and removed manual, conflicting class properties plugins from `babel.config.js` to avoid `property is not configurable` runtime errors inside virtualized lists.

### 2.1 Screens & Layout Directory (`src/screens/`)

#### A. Auth & Wallet (`AuthWalletScreen.tsx`)
*   **Auth Tabs (LOG IN / SIGN UP):** Toggle between Login and Registration views.
*   **Capsule Referral Claim Input:** Pill-shaped referral input container (`borderRadius: 24`, `#EEF2FF` backdrop) with an interactive `CLAIM` button (`✓ CLAIMED`).
*   **Sandbox Master OTP (`123456`):** Universal master test OTP (`123456`) accepting any 10-digit mobile number during testing without Redis errors.
*   **Bypass Accounts Auto-Verification**: Bypasses the OTP step entirely for developer accounts `7024065858` and `9302561971` to allow instant access to the platform.
*   **Insulated Deposit & Withdrawals:** Supports UPI payment intents and IMPS withdrawal processing.

#### B. Dashboard Screen (`DashboardScreen.tsx`)
*   **Tab Navigation:** HOME, LIVE, RANKINGS, PROFILE footer tabs.
*   **Match Segment Sliders:** Animated tabs for QUICK, REGULAR, and ROOMS modes.
*   **Multi-Tournament Cards:** Renders all active/upcoming tournaments dynamically with formatted start dates (`formatDateTime`).
*   **Private Lobby Generator:** Creates private room codes and handles direct room code joining.

#### C. Admin Terminal Screen (`AdminPanelScreen.tsx`)
*   **Header Branding:** Titled `🎛️ ADMIN TERMINAL` with `ADMIN ACCESS` badge.
*   **4 Segmented Capsule Sub-Tabs:**
    1. **`📈 Earnings`**: Real-time aggregated financial telemetry, total revenue, available withdrawal balance, TDS tax collected, player wallet reserves, and `WITHDRAW PLATFORM EARNINGS` quick-fill card.
    2. **`⚡ Matches`**: Live player sockets, active game room directory, bot driver diagnostic matrix, and concurrency tracking.
    3. **`🏆 Tournaments`**: Tournament list cards displaying `Start Time: 📅`, joined slots progress bar, and action buttons (`✏️ EDIT`, `🗑️ DELETE`, `⚡ FORCE START`, `🚨 CANCEL & REFUND`).
    4. **`🛡️ Users`**: Complete user management panel. Displays the user list, promoter counts, and a promoter allocation card (`Active Promoters: X / 3`). Includes live action buttons to `PROMOTE` or `DEMOTE` users, automatically handling verification logic and blocking promotions once the capacity is reached.
*   **Tournament Create/Edit Modal**: Modal overlay to create and edit tournaments with custom Start Date & Time input (`YYYY-MM-DDTHH:mm`) and quick presets (`⚡ NOW`, `⏱️ +1 HR`, `📅 +1 DAY`).
*   **Custom Toast & Modal System**: Replaces plain browser alerts with floating capsule Toast banners (`showToast`) and modern Modal Confirmation Dialogs (`showConfirmDialog`).

#### D. Game Screen (`GameScreen.tsx`)
*   **Interactive SVG Canvas:** Renders the board, dice rollers, token counters, safe cell indicators, valid move overlays, and victory popups.

#### E. Live Arena, Leaderboard & Challenges (`LiveArenaScreen.tsx`, `LeaderboardScreen.tsx`, `ChallengeScreen.tsx`)
*   **Live Arena:** List displaying active cash cards, player online headcounts, and status wait timers.
*   **Leaderboard:** Podium graphics for top 3 earners and list views for ranks 4 to 50.
*   **Challenges:** Progress tracking bars and milestone bonus credit claim hooks.

---

### 2.2 Components
*   `MatchmakingOverlay.tsx`: Premium light-themed overlay component rendering a versus layout grid. Fades out the searching ring placeholder and dynamically renders opponent details upon finding a match. Executes a 1500ms reveal delay, synchronizes with the two-way server handshake, and initiates transition to `GameScreen`.

---

### 2.3 Hooks (`src/hooks/`)
*   `useWallet.ts`: Synchronizes deposit, winnings, and bonus balances with backend ledger.
*   `useSocket.ts`: Socket communication client handling turn events, timers, and session terminations. Hooks into the socket handshake to trigger `READY_TO_ENTER` when the matchmaking overlay appears.
*   `useAppAutoUpdate.ts`: Checks for updates on app start, fetches them silently in the background, and deploys them.
