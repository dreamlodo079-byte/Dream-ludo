# Real-Money Ludo Platform: Production Readiness Checklist & Summary

This document serves as the master blueprint detailing the complete architecture of our real-money Ludo platform, what we have successfully built, and the exact step-by-step external configurations required to launch this platform into production.

---

## 🏆 Part 1: What We Have Built (Detailed Architecture)

We have implemented a high-performance, secure, and authoritative real-money gaming monorepo divided into a decoupled backend engine and a mobile-client application. 

### 1. Database & Financial Double-Entry Ledger
*   **ACID Transactions (`backend/src/config/db.ts`)**: Deployed Mongoose wrappers utilizing MongoDB Client Sessions. Every financial movement (entry fees, payouts, rewards, wins) is executed in atomic transactions, guaranteeing no partial writes.
*   **Dynamic Ledger (`backend/src/models/Transaction.ts`)**: Built a double-entry journal format tracking `DEPOSIT`, `WITHDRAWAL`, `ENTRY_FEE`, `WINNINGS`, and `PLATFORM_COMMISSION`. A user's balance is aggregated dynamically at runtime, ensuring ledger records cannot be manipulated or spoofed.
*   **Platform Profits**: The system maps a virtual admin profile `000000000000000000000000` to accumulate the 10% platform commission deducted from every match's prize pool.

### 2. Authoritative Ludo Engine & Matchmaking Queue
*   **Ludo Game Logic (`backend/src/services/gameEngine.ts`)**: Decoupled, server-authoritative state tracker defining grid coordinates, clockwise token travel pathing, locking rules, six-roll escapes, consecutive rolls limits, and win condition checkers.
*   **Socket Manager (`backend/src/services/socketManager.ts`)**: Orchestrates actions (dice rolls, token shifts) via socket connections. Integrates strict 15-second turn timers and 60-second player disconnect grace periods (forfeit prevention).
*   **Lobby Matchmaking (`backend/src/services/matchmaker.ts`)**: Sorts players into queues matching their entry fee tier (₹50, ₹100, ₹500, ₹1000). Launches matching within 20s or triggers bot injection to maintain queue liquidity.
*   **Bot Driver Emulation (`backend/src/services/botDriver.ts`)**: Simulates realistic bot players with human-like delays (1.5s–3.0s) and a weighted priority selection matrix (favoring capturing opponents, escaping safety cells, and entering home pathing).

### 3. Delta Specifications (Tournaments, Challenges, & Leaderboards)
*   **Pool Tournaments (`backend/src/controllers/tournamentController.ts`)**: Deployed upcoming tournament indexes and registration paths that safely deduct entry fees from client deposit balances in transactions.
*   **Daily Challenges (`backend/src/services/challengeTracker.ts`)**: Tracks player games in Redis. Upon completing 10 daily matches, a hook triggers a transaction appending a ₹50 reward to the user's ledger.
*   **Global Top 50 Leaderboard (`backend/src/controllers/leaderboardController.ts`)**: Uses MongoDB Aggregation pipelines to return top 50 net winning earners filterable by timeframe (All-Time, Monthly, Weekly).

### 4. Enterprise-Grade Security Hardening
*   **Helmet & CORS (`backend/src/server.ts`)**: Injects secure HTTP headers and controls Cross-Origin Resource Sharing rules.
*   **Dual Rate Limiters (`backend/src/middleware/security.ts`)**:
    *   *General*: Max 100 requests per 15-minute window per IP.
    *   *Strict*: Max 5 requests per minute per IP for sensitive endpoints (`/api/users/login`, `/api/payout/withdraw`, `/api/payments/webhook`).
*   **NoSQL & XSS Sanitizer (`backend/src/middleware/security.ts`)**: Recursively screens body, query, and params. Rejects requests containing MongoDB operators (e.g. `$gt`, `$ne`, `$where`) and cleans raw script tags.
*   **JWT Token Blacklisting (`backend/src/middleware/auth.ts`)**: Deploys token session signatures. Upon logout, the active JWT is pushed to Redis with an explicit TTL expiration, rendering it blacklisted instantly.
*   **Raw Body Webhooks Signature Verification (`backend/src/controllers/paymentController.ts`)**: Intercepts raw incoming payment webhook buffers directly at the JSON parser layer to run HMAC-SHA256 signature calculations.

### 5. High-Fidelity Mobile Screens (React Native / Expo)
*   **Auth & Wallet Drawer (`mobile-client/src/screens/AuthWalletScreen.tsx`)**: Controls logins, deposit UPI intent generations, simulated webhook successes, instant IMPS payout requests, ledger logs, and compliance drawers (Responsible Gaming, Payout Config, Refund Policies).
*   **Dashboard Lobby (`mobile-client/src/screens/DashboardScreen.tsx`)**: Features tier selection cards, private room invitation generators, and redirects.
*   **SVG 2D Board Canvas (`mobile-client/src/screens/GameScreen.tsx`)**: High-performance SVG grid mapping token offset overlays, pulse play indicators, interactive dice rolling, and victory popups.
*   **Podium Leaderboard (`mobile-client/src/screens/LeaderboardScreen.tsx`)**: Visual podium graphics for the top 3 earners and list views for ranks 4 to 50.
*   **Challenges Screen (`mobile-client/src/screens/ChallengeScreen.tsx`)**: Progress tracking bars and bonus credit claim status.
*   **Silent Background OTA Updater (`mobile-client/src/hooks/useAppAutoUpdate.ts`)**: OTA update checks to refresh client assets without requiring APK re-installation.

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
  *   Configure nginx to proxy incoming HTTPS requests on port 443 to the backend local port 5000.

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

