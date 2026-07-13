# External Infrastructure, Licensing, & Operational Cost Breakdown

**Target Project Profile:** Nexus Ludo Clone (Real-Money Gaming Platform)  
**Scope of Analysis:** Client-Owned Infrastructure & Dynamic Third-Party Operational Costs  

---

## 1. Fixed & Predictable Infrastructure Outlays (1-Year Cycle)

These costs represent the core architectural building blocks required to host your application servers, deploy the database layer, establish business trust, and keep the application available for user downloads online.

| Infrastructure Asset | Billing Frequency | Estimated Cost (INR) | Operational Justification & Blueprint Context |
| :--- | :--- | :--- | :--- |
| **High-Compute VPS Server**<br>*(Hostinger KVM 2 / DO)* | Monthly / Annual | **₹9,588 / year**<br>*(~₹799/month)* | Dedicated resources (2 vCPU, 8GB RAM minimum) to keep background WebSockets active 24/7 and sync fluid live match lobbies. |
| **Official Domain Identity** | Annual Renewal | **₹818 / year** | Securing your official business link (`.com` / `.in`) to safely host API backend paths and serve app downloads. |
| **Professional Email**<br>*(Google Workspace / Hostinger)* | Annual Upfront | **₹2,376 / year**<br>*(2 Corporate Inboxes)* | Dedicated organizational communication hubs (e.g., `info@` and `billing@`) to fulfill banking compliance validation mandates. |
| **Google Play Console Developer Account** | One-Time Outlay | **₹2,100**<br>*($25 USD standard flat)* | Mandatory developer publishing credentials required to distribute Android APK updates or list directly on the store. |
| **Mandatory Government Taxes (18% GST)** | Per Purchase | **₹2,301**<br>*(Applied to cloud total)* | Standard statutory digital services tax calculated across the predictable infrastructure bill (₹12,782 pre-tax sum). |

> [!NOTE]
> **Total Predictable Infrastructure Launch Bill:** ₹17,183 INR (First-Year Core System Online)

---

## 2. Dynamic, Volume-Based Transactional Operations (Usage-Driven)

Unlike fixed servers, these variables are determined entirely by player volume, real-time signups, deposit actions, and tournament win volumes. These are automatically deducted or filled directly during ongoing scale operations:

| Operational Variable | Cost Parameter | Technical Execution & Budget Shielding Impact |
| :--- | :--- | :--- |
| **Transactional SMS Gateway**<br>*(Twilio / MSG91)* | **₹0.20 – ₹0.30**<br>*Per Outbound SMS* | Fires secure registration tokens (OTPs) directly to player devices. Essential to fully neutralize automated bot signups and fake profiles. |
| **Inbound Payins Gateway**<br>*(Razorpay / Cashfree Merchant)* | **1.5% – 3.0%**<br>*Per Deposit Transaction* | Automated commercial processing fee subtracted natively by payment providers from incoming player UPI deep-links or net deposits. |
| **Programmatic Corporate Payouts**<br>*(RazorpayX / Cashfree)* | **₹5.00 – ₹10.00**<br>*Per Automated Payout* | Flat operational fee charged per single instant bank API transfer (IMPS/UPI) when players clear winnings to their accounts inside 3 seconds. |
| **Automated 30% Net TDS Tax**<br>*(Section 194BA)* | **30% Deduction**<br>*On Net Win Balances* | Mandatory legal tax compliance layer. Programmatically deducted by the backend code from client winnings before routing the remainder to bank transfers. |

---

## 3. Consolidated Platform Deployment Overview

To keep responsibilities perfectly clear between the engineering team and business stakeholders, here is the total structural outline required to make your real-money gaming platform active:

| Financial Structure Track | Financial Obligation (INR) | Accounting Clarity Note |
| :--- | :--- | :--- |
| **1. Core Platform Engineering** | **₹55,000** | Fixed development cost paid directly to the engineering team for building out the full-stack code modules. |
| **2. Predictable Cloud Infrastructure** | **₹17,183** | Billed directly to client accounts via third-party cloud providers (Hostinger, Google, Domain Registrars) including 18% GST. |
| **3. Volume Operations (SMS & Payouts)** | *Usage-Driven / Pay-As-You-Go* | Deducted per transaction or loaded as standard pay-as-you-go balance tokens by the merchant directly. |
