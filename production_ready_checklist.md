# Real-Money Ludo Platform: Production Readiness Checklist & Summary

This document serves as the master blueprint detailing the complete architecture of our real-money Ludo platform, what we have successfully built, and the exact step-by-step external configurations required to launch this platform into production.

---

## 🏆 Part 1: What We Have Built (Detailed Architecture)

We have implemented a high-performance, secure, and authoritative real-money gaming monorepo divided into a decoupled backend engine and a mobile-client application. 

### 1. Database & Financial Double-Entry Ledger
*   **ACID Transactions (`backend/src/config/db.ts`)**: Deployed Mongoose wrappers utilizing MongoDB Client Sessions (`runInTransaction`). Every financial movement (entry fees, payouts, rewards, wins, referral bonuses) is executed in atomic transactions, guaranteeing zero partial writes or balance drift.
*   **Dynamic Ledger (`backend/src/models/Transaction.ts`)**: Built a double-entry journal format tracking `DEPOSIT`, `WITHDRAWAL`, `ENTRY_FEE_DEBIT`, `ENTRY_FEE_REFUND`, `WINNINGS`, `TOURNAMENT_WIN_CREDIT`, `REFERRAL_BONUS_CREDIT`, and `PLATFORM_COMMISSION`. A user's balance is aggregated dynamically at runtime, ensuring ledger records cannot be manipulated or spoofed.
*   **Platform Commission Accounting**: The system maps a virtual admin profile `000000000000000000000000` to accumulate the 10% platform commission deducted from every match's prize pool. Real-time platform revenue and payout balances are aggregated dynamically via MongoDB pipelines.

### 2. Authoritative Ludo Engine & Matchmaking Queue
*   **Ludo Game Logic (`backend/src/services/gameEngine.ts`)**: Decoupled, server-authoritative state tracker defining grid coordinates, clockwise token travel pathing, locking rules, six-roll escapes, consecutive rolls limits (3 consecutive 6s void turn), and win condition checkers.
*   **Socket Manager (`backend/src/services/socketManager.ts`)**: Orchestrates real-time events (dice rolls, token shifts) via socket connections with turn management, 15-second turn timers, and 60-second player disconnect grace periods (forfeit prevention).
*   **Lobby Matchmaking (`backend/src/services/matchmaker.ts`)**: Sorts players into queues matching their entry fee tier (₹50, ₹100, ₹500, ₹1000). Launches matching within 13-20 seconds or triggers bot injection to maintain queue liquidity.
*   **Bot Driver Emulation (`backend/src/services/botDriver.ts`)**: Simulates realistic bot players with human-like delays (1.5s–3.0s) and a weighted priority selection matrix (favoring capturing opponents, escaping safety cells, and entering home pathing).

### 3. Double-Entry Referral Mechanism & Registration Binding
*   **Unique Code Generation (`backend/src/models/User.ts`)**: Automatically generates a unique uppercase alphanumeric referral code for every newly created user upon registration (e.g. `SEXUS50SEXUS`).
*   **Atomic Signup Referral Processing (`backend/src/server.ts`)**: Extends the authentication pipeline (`processSignupWithReferral`) to accept an optional `referredByCode`. Upon signup verification, Mongoose ACID transactions automatically credit **₹10.00 bonus balance** to the new user and **₹100.00** + incremented friend count to the Referrer with immutable `REFERRAL_BONUS_CREDIT` transaction records.
*   **Capsule Claim UI (`mobile-client/src/screens/AuthWalletScreen.tsx`)**: Built a pill-shaped referral code input container under the Sign Up tab with an interactive `CLAIM` button (`✓ CLAIMED`) and real-time status feedback.

### 4. Admin Terminal, Platform Telemetry & Admin Withdrawal Loop
*   **Privilege Verification Interceptor (`backend/src/middleware/auth.ts` & `server.ts`)**: Inbound authentication requests matching phone signature `7389927777` automatically inject `role: "SUPER_ADMIN"` and `isAdmin: true` into production JWTs. All admin API endpoints (`/api/admin/*`) are protected behind `requireSuperAdmin` middleware.
*   **Real-Time Financial & Concurrency Telemetry (`backend/src/routes/admin.ts`)**:
    *   *Earnings Telemetry*: 100% real MongoDB aggregation of Total Platform Revenue, Net Available to Withdraw, TDS Tax Collected (30%), Total Player Wallet Balances (Deposits, Winnings, Bonus), and match fee profit breakdown.
    *   *Concurrency & Live Telemetry*: Live player sockets, active game room directory, and bot driver diagnostic matrix.
*   **Admin Earnings Payout Loop (`POST /api/admin/withdraw`)**: Allows the administrator to withdraw platform earnings to a target UPI ID. Deducts net available rake, creates immutable `WITHDRAWAL` transaction logs tagged with `admin_payout_` reference IDs, and updates telemetry in real-time.
*   **Admin Terminal UI (`mobile-client/src/screens/AdminPanelScreen.tsx`)**: Premium Light-Theme interface titled `🎛️ ADMIN TERMINAL` featuring capsule tab switchers (`📈 Earnings`, `⚡ Matches`, `🏆 Tournaments`), quick payout quick-fill controls (`WITHDRAW ALL`), and zero text clipping.

### 5. Full Tournament CRUD & Multi-Home Display Subsystem
*   **Backend Tournament CRUD Endpoints (`backend/src/routes/admin.ts`)**:
    *   `POST /api/admin/tournament/create`: Creates a new tournament.
    *   `PUT /api/admin/tournament/update/:id`: Edits any tournament property (Title, Prize Pool, Entry Fee, Capacity, Start Time, Status).
    *   `DELETE /api/admin/tournament/delete/:id`: Permanently deletes a tournament.
    *   `POST /api/admin/tournament/trigger`: Force-starts a tournament bracket immediately.
    *   `POST /api/admin/tournament/cancel`: Cancels a tournament and refunds all entry fees to registered users in Mongoose transactions.
*   **Admin Tournament Management Modal (`mobile-client/src/screens/AdminPanelScreen.tsx`)**: Modal interface to create and edit tournaments with custom Start Date & Time input (`YYYY-MM-DDTHH:mm`) and quick presets (`⚡ NOW`, `⏱️ +1 HR`, `📅 +1 DAY`).
*   **Multi-Tournament Home Display (`mobile-client/src/screens/DashboardScreen.tsx`)**: Dynamically renders all active and upcoming tournaments on the Home Screen with formatted start dates (`formatDateTime`).

### 6. Multi-Device Concurrent Session Enforcement
*   **Socket Session Limiter (`backend/src/services/socketManager.ts`)**: Implemented a `userDeviceSockets` tracking map inside the `REGISTER_USER` socket handler.
    *   *Regular Users*: Strictly limited to **1 active device session** at a time per account/ID. Logging in on a 2nd device emits `SESSION_TERMINATED` and disconnects the older socket.
    *   *Admin Account*: Allowed up to **3 active device sessions** simultaneously with the same account/ID. Logging in on a 4th device disconnects the oldest session.

### 7. Sandbox Test OTP & Enterprise Security Hardening
*   **Master Test OTP (`123456`)**: Universal master test OTP (`123456`) logic in `backend/src/server.ts` (`send-otp` & `verify-otp`) supporting instant verification for testing across any phone number without failing or requiring Redis during sandbox testing.
*   **Rate Limiters & Sanitizers (`backend/src/middleware/security.ts`)**: IP-based rate limiting (100 req/15min general, 5 req/min sensitive) and recursive NoSQL injection/XSS query sanitizers.
*   **JWT Token Blacklisting (`backend/src/middleware/auth.ts`)**: Revoked JWTs are pushed to Redis with TTL expiration upon logout.
*   **Webhook Signature Verification (`backend/src/controllers/paymentController.ts`)**: HMAC-SHA256 buffer signature verification for payment gateway webhooks.

### 8. Premium Mobile Client Architecture (React Native / Expo)
*   **Auth & Wallet Drawer (`mobile-client/src/screens/AuthWalletScreen.tsx`)**: Controls login/signup, capsule referral claiming, UPI deposit intent generation, IMPS withdrawal processing, and compliance policies.
*   **Dashboard Lobby (`mobile-client/src/screens/DashboardScreen.tsx`)**: Home screen featuring capsule sub-view switchers (QUICK, REGULAR, ROOMS), active tournament cards, and private room lobby code generators.
*   **Custom Toast & Modal Confirmation System**: Replaced default browser/system alert dialogs across the app with floating capsule Toast notification banners (`showToast`) and modern glassmorphic Modal Confirmation Dialogs (`showConfirmDialog`) for payouts, deletions, and emergency cancellations.
*   **SVG 2D Board Canvas (`mobile-client/src/screens/GameScreen.tsx`)**: SVG board grid mapping, token movement animations, pulse play indicators, interactive dice rolling, and victory overlays.
*   **Podium Leaderboard & Challenges (`mobile-client/src/screens/LeaderboardScreen.tsx` & `ChallengeScreen.tsx`)**: Top 50 earners podium graphics and daily milestone progress tracking.
*   **Silent Background OTA Updater (`mobile-client/src/hooks/useAppAutoUpdate.ts`)**: Background update checker for seamless client refreshes.

---

## 🚀 Part 2: What is Left to Launch (Production Checklist)

Before releasing the platform to production, the following steps must be completed to configure external production environments.

### Step 1: Production Databases Provisioning
- [ ] **MongoDB Atlas Setup**:
  1. Set up a MongoDB Atlas cluster (M10 tier or higher recommended to handle ACID transaction client sessions).
  2. Navigate to **Network Access** and add your backend server IP to the whitelist.
  3. Copy the production Connection String (e.g. `mongodb+srv://admin:...`).
- [ ] **Redis Cluster Setup**:
  1. Provision a hosted Redis cluster (e.g., Redis Labs or AWS ElastiCache).
  2. Ensure port `6379` is open and restricted exclusively to your backend server's IP address.
  3. Copy the URL: `redis://:password@host:port`.

### Step 2: Set Production Environment Variables (`backend/.env`)
Create a production environment file with the following variables:
```env
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/ludo?retryWrites=true&w=majority
REDIS_URL=redis://:<password>@<redis-host>:<redis-port>

# Cryptographic Keys
JWT_SECRET=generate_a_random_32_character_hex_string
ADMIN_API_KEY=generate_secure_admin_dispute_secret_key

# Payment Gateway Keys (Razorpay / Cashfree)
RAZORPAY_KEY_ID=rzp_live_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_live_secret
PAYMENT_WEBHOOK_SECRET=your_webhook_validation_secret
```

### Step 3: Domain, DNS, and SSL Certificates Routing
- [ ] **Domain Setup**: Register a domain (e.g., `ludoarena.com`) on GoDaddy, Namecheap, or Route53.
- [ ] **DNS Records mapping**:
  *   Create an `A` record pointing `api.ludoarena.com` to your backend server host IP.
- [ ] **HTTPS / SSL Configuration**:
  *   SSH into your virtual host server.
  *   Install Certbot and obtain an SSL certificate for your domain:
      ```bash
      sudo certbot --nginx -d api.ludoarena.com
      ```
  *   Configure Nginx to proxy incoming HTTPS requests on port 443 to the backend local port 5000.

### Step 4: Webhook Dashboard Configuration
- [ ] **Configure Dashboard Endpoint**:
  *   Log in to your Razorpay/Cashfree Merchant portal.
  *   Navigate to **Account & Settings** > **Webhooks**.
  *   Set Webhook URL to: `https://api.yourdomain.com/api/payments/webhook`.
  *   Save the webhook secret and match it to `PAYMENT_WEBHOOK_SECRET` inside the production `.env`.

### Step 5: Mobile App Build (Expo Application Services)
- [ ] Install Expo CLI and log in:
  ```bash
  npm install -g eas-cli
  eas login
  ```
- [ ] Configure EAS credentials inside `mobile-client/app.json`.
- [ ] Run the compilation tool to build the production signed APK:
  ```bash
  eas build --platform android
  ```
- [ ] Distribute the generated `.apk` bundle on your website for direct downloads.

### Step 6: Server Node Multi-Process Clustering (PM2)
- [ ] Build the backend production assets:
  ```bash
  npm run build
  ```
- [ ] Initialize the PM2 cluster load balancer using our ecosystem manifest:
  ```bash
  pm2 start ecosystem.config.js --env production
  ```
- [ ] Monitor clustered execution nodes to ensure they scale and auto-restart properly:
  ```bash
  pm2 list
  pm2 monit
  ```
