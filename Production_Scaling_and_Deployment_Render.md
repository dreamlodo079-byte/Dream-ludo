# Real-Money Ludo Backend Deployment & 50,000 Concurrent User Scaling Guide

This document outlines the architecture, environment variables, Render setup, and scaling strategy required to scale the **Dream Ludo** backend to **50,000 simultaneous concurrent users (CCU)**.

---

## 1. Architectural Overview: Render vs. Vercel

| Platform | Recommended Role | Technical Justification |
| :--- | :--- | :--- |
| **Render** | **Node.js Backend & Game Engine** | Runs continuous, persistent Node.js servers. Essential for **Socket.IO WebSockets**, matchmaker timers, in-memory state caching, and live game loops. |
| **Vercel** | **Web Landing Page & APK Downloads** | Built for static asset delivery and serverless web pages with global CDN performance. Ideal for `dreamsludo.com` landing page and APK distribution. |

> **Note**: Vercel Serverless Functions *cannot* be used for the Socket.IO backend because serverless execution environments time out and cannot maintain persistent WebSocket connections.

---

## 2. Render Web Service Deployment Configuration

When setting up your **Web Service** on [Render](https://dashboard.render.com/):

### Core Service Settings

- **Service Type**: `Web Service`
- **Name**: `ludo-backend`
- **Region**: Select closest region to your users *(e.g., Singapore or Frankfurt)*
- **Branch**: `main`
- **Root Directory**: `backend` *(CRITICAL: Required because backend resides in a subdirectory)*
- **Language / Runtime**: `Node` *(Ensure Node is selected, NOT Rust)*
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Instance Type**: `Free` *(for initial testing)* $\rightarrow$ `Paid / Standard` *(for production launch)*

---

## 3. Environment Variables Reference

Configure these Key-Value pairs under **Render $\rightarrow$ Environment Variables**:

| Variable Name | Environment Purpose | Example / Production Setting |
| :--- | :--- | :--- |
| `PORT` | Web server listening port | `10000` |
| `MONGO_URI` | Production MongoDB Atlas cluster connection string | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/ludo_rmg?retryWrites=true&w=majority` |
| `TWO_FACTOR_API_KEY` | 2Factor SMS OTP gateway API credential | `f46c714b-8d6a-11f1-908b-0200cd936042` |
| `JWT_SECRET` | Cryptographic key for signing user auth tokens | `super_secret_jwt_key` |
| `ADMIN_API_KEY` | Authorization key for master admin panel endpoints | `master_admin_secret_key` |
| `PAYMENT_WEBHOOK_SECRET` | Signature key for payment gateway callbacks | `super_secret_gateway_key` |

---

## 4. Technical Blueprint for 50,000 Simultaneous Users (CCU)

Handling 50,000 concurrent real-time Ludo players requires a multi-instance architecture.

```
                           [ 50,000 Mobile Clients ]
                                      │
                      [ Render Global Load Balancer ]
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
  [ Render Instance 1 ]       [ Render Instance 2 ]       [ Render Instance N ]
  (Node + Socket.IO)          (Node + Socket.IO)          (Node + Socket.IO)
         │                            │                            │
         └────────────────────────────┴────────────────────────────┘
                                      │
                   [ Production Redis Cluster (PubSub) ]
                                      │
                        [ MongoDB Atlas Cluster (M30+) ]
```

### Metrics at 50,000 CCU

- **Concurrent WebSockets**: `50,000` active socket connections
- **Parallel Active Matches**: `12,500` (4-player mode) to `25,000` (2-player mode)
- **Message Rate**: ~25,000 to 50,000 events/second (timer ticks, dice rolls, token hops)

### Core Components for High CCU Scale

1. **Horizontal Node.js Clustering**:
   - Run **10 to 15 Render Web Instances** (e.g., `Standard` or `Pro` tiers with 4-8 vCPUs & 8GB RAM).
   - Render's built-in Global Load Balancer distributes incoming connections automatically across instances.

2. **Socket.IO Redis Adapter (`@socket.io/redis-adapter`)**:
   - The backend codebase already includes `@socket.io/redis-adapter`.
   - When Player 1 is connected to Instance #1 and Player 2 is connected to Instance #5, Redis PubSub synchronizes game events across nodes instantly.

3. **Database Scaling (MongoDB Atlas M30 / M40)**:
   - Upgrade MongoDB Atlas from M0 (Free) to a dedicated **M30 or M40 Replica Set**.
   - Configure connection pool size (`maxPoolSize=100`) to handle wallet debit/credit transactions smoothly.

4. **Redis Cache (Managed Redis / Upstash / Render Redis Pro)**:
   - Used for matchmaking queues, active room state caching, rate-limiting counters, and pub/sub message passing.

---

## 5. Deployment & Growth Roadmap

| Phase | Target CCU | Infrastructure Setup | Estimated Infra Cost |
| :--- | :--- | :--- | :--- |
| **Phase 1: Internal Testing** | 1 - 50 | 1 Render Free Web Service + MongoDB Atlas M0 + Local/In-Memory Engine | **$0 / month** |
| **Phase 2: Soft Launch** | 1,000 - 5,000 | 2 Render Standard Services + MongoDB Atlas M10 + Redis Starter | **~$50 - $120 / month** |
| **Phase 3: Commercial Scale** | 50,000 | 10-15 Render Pro Services + MongoDB Atlas M30 + Redis Pro | **Scale on demand** |

---

## 6. Summary Checklist Before Going Live

- [x] Removed 1-tap dev login bypass button from client auth screen.
- [x] Code pushed to GitHub repository: `https://github.com/dreamlodo079-byte/Dream-ludo.git`.
- [ ] Render Web Service created with `Node` runtime and `backend` root directory.
- [ ] All 6 environment variables added on Render dashboard.
- [ ] Render URL copied to `mobile-client/src/utils/config.ts` (`EXPO_PUBLIC_SERVER_URL`).
