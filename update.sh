#!/bin/bash
cd "$(dirname "$0")"
echo "Mise à jour de l'application Le Play Avocats..."
git pull
pip3 install -r requirements.txt --quiet
echo "Mise à jour terminée. Redémarrage du serveur..."
python3 -m uvicorn server:app --host 0.0.0.0 --port 3000 --reload
