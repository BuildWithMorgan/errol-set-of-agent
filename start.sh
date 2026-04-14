#!/bin/bash
cd "$(dirname "$0")"
echo "Démarrage du serveur Le Play Avocats..."
uvicorn server:app --host 0.0.0.0 --port 3000 --reload
