# Nexus Ludo: Comprehensive Deployment & Resources Guide

This document outlines the core features, working mechanisms, and the complete list of external platforms and resources required to deploy the Nexus Ludo real-money gaming platform into production.

---

## 1. Deep Dive: Core Features & Working Mechanisms

The Nexus Ludo app operates on a decoupled client-server architecture, ensuring security, high concurrency, and real-time responsiveness.

*   **Server-Authoritative Game Engine**: The backend (`gameEngine.ts`) is the single source of truth. It validates all token movements, pathing coordinates, safe zone logic, and dice roll constraints (e.g., rolling three 6s voids the turn). This prevents any client-side hacking or spoofing.
*   **Financial Integrity (Double-Entry Ledger)**: Uses MongoDB ACID transactions to manage an insulated 3-tier wallet (Deposit, Winnings, Bonus). Every financial event (deposits, entry fees, winnings, referral bonuses) is logged immutably, ensuring zero balance drift.
*   **Real-Time Multiplayer (WebSockets)**: The `socketManager.ts` orchestrates live gameplay. It enforces 15-second turn timers, provides a 60-second disconnect grace period to prevent immediate forfeits, and strictly limits regular users to 1 active device session to prevent account sharing.
*   **Matchmaking & Bot Liquidity**: Players are grouped into queues based on entry fee tiers (₹3 to ₹500). If a human opponent isn't found within 13-20 seconds, a sophisticated bot driver (`botDriver.ts`) is injected with human-like delays to maintain game liquidity.
*   **Admin Telemetry & Commission System**: The platform automatically takes a 10% rake on matches. The Admin Terminal allows the owner to view real-time earnings, manage tournament brackets, and withdraw accumulated commissions directly to their bank account via IMPS.
*   **Automated Updates**: The mobile client incorporates a silent background OTA (Over-The-Air) updater, ensuring users always have the latest patches without reinstalling the APK.

---

## 2. Infrastructure & Platforms Required for Deployment

To successfully launch the platform, you will need to provision the following third-party services and infrastructure components:

### A. Core Cloud Infrastructure (Backend & Databases)
*   **High-Compute Virtual Private Server (VPS)**: Needed to host the Node.js WebSocket server.
    *   *Requirements*: Minimum 2 vCPU, 8GB RAM to handle constant live WebSocket connections and game loops.
    *   *Providers*: DigitalOcean, AWS EC2, or Hostinger KVM.
    *   *Tools*: Nginx (Reverse Proxy) and PM2 (Node Process Manager & Clustering).
*   **MongoDB Atlas (Database)**: 
    *   *Requirements*: M10 tier or higher is recommended. The system heavily relies on MongoDB Client Sessions (`runInTransaction`) for financial accuracy, which requires a replica set (standard on Atlas).
*   **Redis Cluster (Caching & Matchmaking)**:
    *   *Requirements*: Managed Redis instance for high-speed matchmaking queues, live match state caching, and JWT blacklisting.
    *   *Providers*: Redis Labs, AWS ElastiCache, or Upstash.

### B. Mobile App Build & Distribution
*   **Expo Application Services (EAS)**:
    *   Required to compile the React Native (Bare Workflow) codebase into a production-signed `.apk` or `.aab`.
    *   *Usage*: Run `eas build --platform android` via the EAS CLI.
*   **Google Play Console Account**:
    *   A one-time $25 USD developer account is required if you plan to distribute the application officially on the Google Play Store (subject to local real-money gaming policies).

### C. Third-Party Services & APIs
*   **Payment Gateway (Payins & Payouts)**:
    *   *Providers*: Razorpay, Cashfree, or similar Indian gateways supporting real-money gaming.
    *   *Needs*: A merchant account to accept UPI deposits, and API access to corporate payouts (e.g., RazorpayX) for instant user IMPS withdrawals.
*   **Transactional SMS Gateway**:
    *   *Providers*: Twilio, MSG91, or Fast2SMS.
    *   *Needs*: Essential for sending OTPs during the registration and login process to prevent automated bot signups.
*   **Domain & SSL Certificates**:
    *   *Providers*: GoDaddy, Route53, Namecheap.
    *   *Needs*: A registered domain (e.g., `api.ludogame.com`) pointing to your VPS via DNS `A` records. SSL is mandatory for WebSockets (`wss://`) and secure payments. SSL can be provisioned for free using **Certbot (Let's Encrypt)**.
*   **Professional Corporate Email**:
    *   *Providers*: Google Workspace or Zoho Mail.
    *   *Needs*: An official email (e.g., `support@yourdomain.com`) is strictly required by payment gateways for compliance and KYC approval.

---

## 3. Step-by-Step Deployment Summary

1.  **Provision Databases**: Setup MongoDB Atlas and Redis. Restrict their network access to your VPS IP address for security.
2.  **Server Setup**: Deploy the VPS, install Nginx, Node.js, and Certbot for SSL.
3.  **Environment Variables**: Populate the `.env` file with production DB URIs, JWT secrets, and Payment Gateway API keys.
4.  **Launch Backend**: Use `pm2 start ecosystem.config.js --env production` to launch the backend in a clustered mode for load balancing.
5.  **Configure Webhooks**: Set up the payment gateway webhooks to point to `https://api.yourdomain.com/api/payments/webhook`.
6.  **Build Mobile Client**: Use EAS to build the Android APK and upload it to your website or the Google Play Store.
