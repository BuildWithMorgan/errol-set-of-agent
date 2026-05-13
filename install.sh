#!/bin/bash
set -e

REPO_URL="https://github.com/BuildWithMorgan/errol-set-of-agent"
BRANCH="feature/interface-enhancements"
INSTALL_DIR="$HOME/leplay-ia"

echo "========================================"
echo "  Installation — Le Play Avocats IA"
echo "========================================"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌ Python3 non trouvé. Installez-le avec : brew install python"
  exit 1
fi

# Check pip
if ! command -v pip3 &>/dev/null; then
  echo "❌ pip3 non trouvé. Installez Python via : brew install python"
  exit 1
fi

# Check git
if ! command -v git &>/dev/null; then
  echo "❌ Git non trouvé. Installez-le avec : brew install git"
  exit 1
fi

# Check Ollama
if ! command -v ollama &>/dev/null; then
  echo "❌ Ollama non trouvé. Installez-le depuis : https://ollama.com"
  exit 1
fi

echo "✅ Prérequis vérifiés"
echo ""

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "📦 Mise à jour du projet existant..."
  cd "$INSTALL_DIR"
  git pull origin "$BRANCH"
else
  echo "📦 Téléchargement du projet..."
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo ""
echo "📦 Installation des dépendances Python..."
pip3 install -r requirements.txt --quiet

# Setup .env
if [ ! -f ".env" ]; then
  echo ""
  echo "⚙️  Configuration de l'environnement..."
  cp .env.example .env
  # Set the correct model
  sed -i '' 's/OLLAMA_MODEL=.*/OLLAMA_MODEL=llama3.1:8b/' .env
  echo "✅ Fichier .env créé avec le modèle llama3.1:8b"
  echo ""
  echo "⚠️  Pensez à vérifier le chemin OneDrive dans .env :"
  echo "    ONEDRIVE_PATH=/Users/$(whoami)/OneDrive"
  # Auto-set OneDrive path to current user
  sed -i '' "s|ONEDRIVE_PATH=.*|ONEDRIVE_PATH=/Users/$(whoami)/OneDrive|" .env
else
  echo "✅ Fichier .env déjà présent — non modifié"
fi

# Make scripts executable
chmod +x start.sh update.sh run-server.sh

# Create logs directory
mkdir -p "$INSTALL_DIR/logs"

# Setup launchd service
echo ""
echo "⚙️  Installation du service automatique..."

PLIST_PATH="$HOME/Library/LaunchAgents/com.leplayavocats.ia.plist"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.leplayavocats.ia</string>
  <key>ProgramArguments</key>
  <array>
    <string>$INSTALL_DIR/run-server.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$INSTALL_DIR/logs/server.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_DIR/logs/server-error.log</string>
</dict>
</plist>
PLIST

# Stop existing service if running, then load
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "✅ Service installé — le serveur démarre automatiquement à chaque allumage"

echo ""
echo "========================================"
echo "  ✅ Installation terminée !"
echo "========================================"
echo ""
echo "L'interface est disponible sur : http://localhost:3000"
echo ""
echo "Pour mettre à jour l'application : ./update.sh"
echo ""
