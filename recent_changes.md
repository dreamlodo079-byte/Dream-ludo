# Session Development Log & Setup Actions

This document tracks the git operations and environment configurations performed during this session to get the Ludo platform running locally.

---

## 🛠️ Actions & Fixes Completed

### 1. Git Repository Tracking & Setup
* **Added Upstream Remote**: Configured `upstream-ludo` pointing to the main source repository:
  ```bash
  git remote add upstream-ludo https://github.com/Jalaj-01/Ludo.git
  ```
* **Fetched & Tracked Branch**: Fetched the latest updates from the remote and checked out the `aniket/fixes` branch:
  ```bash
  git checkout -t upstream-ludo/aniket/fixes
  ```
* **Created Personal Workspace Branch**: Created and checked out a new local branch named `jalaj` to capture this working state and serve as the push target for future updates:
  ```bash
  git checkout -b jalaj
  ```

### 2. Network & Login Issue Resolution
* **Identified IP Mismatch**: Diagnosed the `"Quick Login Error: Network Error"` issue on the mobile client. The server was listening on port `5000` at the machine's local IP address `192.168.1.14`, but the mobile configuration was hardcoded to `192.168.1.3`.
* **Updated Environment Variables**: Modified [mobile-client/.env](file:///g:/Ludo/mobile-client/.env) to reference the correct local network IP address:
  ```env
  EXPO_PUBLIC_SERVER_URL="http://192.168.1.14:5000"
  ```
* **Verification**: Verified that the backend port binding is correctly bound to `0.0.0.0:5000`, making it accessible on the local Wi-Fi network.
### 3. Session 2 Fixes & UI/UX Optimizations
* **Game Freeze Safety Guards**:
  - Wrapped room turn timer updates inside a try-catch block and added fallback checks against `NaN` parameters inside `startRoomTimer` in [socketManager.ts](file:///e:/Documents/Nexus-Ludo/backend/src/services/socketManager.ts).
  - Added player array index boundaries and optional chaining inside `handleTokenPress`, avatar rendering loops, and turn status hooks in [GameScreen.tsx](file:///e:/Documents/Nexus-Ludo/mobile-client/src/screens/GameScreen.tsx) to prevent `TypeError` exceptions from locking the JS thread.
* **Winnings Wallet Modifications**:
  - Created and ran a custom database migration script `add_balance.ts` in [backend/src/scratch/add_balance.ts](file:///e:/Documents/Nexus-Ludo/backend/src/scratch/add_balance.ts) crediting account `9405107842` (`Lucifer705`) with ₹5000 deposit and ₹5000 winnings balances.
* **Pawn Animation Reset**:
  - Implemented coordinate and scale resets inside the fallback render paths of [GameScreen.tsx](file:///e:/Documents/Nexus-Ludo/mobile-client/src/screens/GameScreen.tsx), solving the bug where interrupted tokens got stuck floating "in the air."
* **Delayed Turn Switching**:
  - Decoupled turn rotation from [gameEngine.ts](file:///e:/Documents/Nexus-Ludo/backend/src/services/gameEngine.ts). Added a `setTimeout` transition delay (1.2s for normal walks, 1.8s for captures) inside socket event listeners to ensure turns rotate only after pawn animations complete.
* **Status Bar Layout Clipping**:
  - Imported `Platform` and added dynamic top padding offsets to the main game arena, toast containers, and loaders in [GameScreen.tsx](file:///e:/Documents/Nexus-Ludo/mobile-client/src/screens/GameScreen.tsx) to accommodate Android status bars and notch cutouts.

### 4. Session 3 Fixes & Logic Tweaks
* **Unified Dying Animation Speed**:
  - Refactored `animateBackwardPath` in [GameScreen.tsx](file:///e:/Documents/Nexus-Ludo/mobile-client/src/screens/GameScreen.tsx) to dynamically compute step duration based on the number of tiles, ensuring backtracking completes efficiently (~450ms total). Ensured `useNativeDriver` works smoothly across both mobile and web.
* **Consecutive Sixes Rule Simplification**:
  - Modified the strict "3 consecutive 6s" penalty in [gameEngine.ts](file:///e:/Documents/Nexus-Ludo/backend/src/services/gameEngine.ts). A third consecutive 6 now simply voids the bonus roll and passes the turn, without reverting any valid token moves made during the first two 6s.
* **Mobile Dice Sync & Skipped Turns**:
  - Added a 1.5s delay timeout inside `REQUEST_ROLL` in [socketManager.ts](file:///e:/Documents/Nexus-Ludo/backend/src/services/socketManager.ts) when no valid moves are available. This fixes a race condition where the mobile dice animation skipped the final rolled value. Removed repetitive "turn skipped" system alerts for better UX.
* **Goal (Center Home) Pawn Stacking**:
  - Rewrote the coordinate grouping logic in `getTokenCoords` and `getStackingInfo` in [GameScreen.tsx](file:///e:/Documents/Nexus-Ludo/mobile-client/src/screens/GameScreen.tsx). Pawns resting in the center home triangle (pos 56) now correctly stack, scale down dynamically, and arrange themselves into neat micro-triangles instead of clipping over each other or hardcoding to 4 invisible slots.

---

## 🚀 How to Run the App (Current State)

1. **Redis Caching**: Ensure Redis is running locally on port `6379`.
2. **Backend**: Run `npm run dev` in the `backend/` directory.
3. **Mobile Client**: Run `npm start` in the `mobile-client/` directory and scan the QR code via Expo Go.
