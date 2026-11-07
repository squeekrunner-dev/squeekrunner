# SqueekRunner

Browser endless runner powered by the **live Squeekchain hamster**. The real wheel speed
(RPM) drives the game-world speed, and each new settled Squeek block drops a bonus/checkpoint.
A submission for the Squeekchain Genesis · Code Lane.

## Status
Early scaffold (Vite + TypeScript + Phaser 3). Game logic and Squeekchain integration in progress.

## Develop
```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # typecheck + production build to dist/
npm run preview
```

## How it uses Squeekchain (verified contract)
Pure browser client, no backend required (public API sends `Access-Control-Allow-Origin: *`).

- **Telemetry:** `GET https://api.squeekchain.com/v1/status`
  - World speed = `measurement.rpmMilli / 1000` (RPM), smoothed and capped.
  - Block bonus = increase of `builder.anchor.blockHeight` (confirmed). `builder.projected.blockHeight` may be used for provisional visual cues only.
  - Handle `measurement.freshness` (`online` / `stale`, `staleAfterSeconds: 120`) and `coreStatus` (`IDLE` / `ACTIVE` / `COUNTER_FAULT`): missing/stale data is a "no data / wheel idle" mode, **not** a hamster "sleep" state.
- Poll every 1–2 s. Respect rate limits (status: 30 req/s per IP). Do not add query params to `/v1/status`.
- Scores are stored locally (per block). An online leaderboard / on-chain records are out of MVP scope.

Full verified API, contract and whitepaper reference lives in the team knowledge base
(`../team/knowledge/squeekchain-tech.md`), which is **not** part of this public repo.

## Stack
TypeScript · Phaser 3 · Vite.
