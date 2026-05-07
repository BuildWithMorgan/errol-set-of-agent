#!/bin/bash
cd "$(dirname "$0")"
echo "Démarrage du serveur Le Play Avocats..."
python3 -m uvicorn server:app --host 0.0.0.0 --port 3000 --reload
