#!/bin/bash
cd "$(dirname "$0")"

echo "========================================"
echo "  Mise à jour — Le Play Avocats IA"
echo "========================================"
echo ""

echo "📦 Récupération des dernières modifications..."
git pull

echo ""
echo "📦 Mise à jour des dépendances Python..."
pip3 install -r requirements.txt --quiet

echo ""
echo "🔄 Redémarrage du service..."
launchctl kickstart -k "gui/$(id -u)/com.leplayavocats.ia"

echo ""
echo "✅ Mise à jour terminée !"
echo "L'interface est disponible sur : http://localhost:3000"
echo ""
