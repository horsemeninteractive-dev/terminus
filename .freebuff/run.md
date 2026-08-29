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
  Then confirm it survived and wait until `http://127.0.0.1:3001/` answers HTTP.
