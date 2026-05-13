#!/bin/bash
# Called by launchd — runs in the background at boot, no terminal needed.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$(dirname "$0")"

if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

exec python3 -m uvicorn server:app --host 0.0.0.0 --port 3000
