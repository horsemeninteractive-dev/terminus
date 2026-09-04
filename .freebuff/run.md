# Run doc — Terminus (Vite + React + Three.js)

## Reproduce the artifacts a fresh checkout needs

1. Install dependencies with the project's package manager (lockfile is `bun.lock`;
   `npm install` also works and is what has been used in this worktree):
   ```
   npm install --no-audit --no-fund
   ```
   This creates `node_modules/` (gitignored). No `.env.local` / secrets are required
   to run the app — `.env.example` only documents optional `GEMINI_API_KEY` /
   `APP_URL`, which are not read by the game at dev time.

## Run the dev server

- Default script: `npm run dev` → `vite --port=3000 --host=0.0.0.0`.
- Port 3000 may be occupied by another thread's dev server. Inspect listeners first
  (`netstat -ano | findstr :3000`), and if taken, run on a free port, e.g. 3001:
  ```
  node node_modules/vite/bin/vite.js --port=3001 --host=127.0.0.1
  ```
- Detached start (Windows, outlives the conversation):
  ```
  powershell -NoProfile -Command "(Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/vite/bin/vite.js','--port=3001','--host=127.0.0.1' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
  ```
  Notes:
  - The PowerShell wrapper command itself may HANG until its timeout even though
    the detached server starts fine — that is normal. Wait for the timeout, then
    confirm the server independently: `netstat -ano | findstr :3001` for the pid,
    and `curl http://127.0.0.1:3001/` for HTTP 200.
  - stdout and stderr MUST go to different files; PowerShell fails if both point
    at one path.
  - Prefer the default port 3000 when it is free; only fall back to 3001 when
    taken.
