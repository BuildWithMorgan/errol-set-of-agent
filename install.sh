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
  sed -i '' 's/OLLAMA_MODEL=.*/OLLAMA_MODEL=qwen3-coder-next/' .env
  echo "✅ Fichier .env créé avec le modèle qwen3-coder-next"
  echo ""
  echo "⚠️  Pensez à vérifier le chemin OneDrive dans .env :"
  echo "    ONEDRIVE_PATH=/Users/$(whoami)/OneDrive"
  # Auto-set OneDrive path to current user
  sed -i '' "s|ONEDRIVE_PATH=.*|ONEDRIVE_PATH=/Users/$(whoami)/OneDrive|" .env
else
  echo "✅ Fichier .env déjà présent — non modifié"
fi

# Make scripts executable
chmod +x start.sh update.sh

echo ""
echo "========================================"
echo "  ✅ Installation terminée !"
echo "========================================"
echo ""
echo "Pour lancer l'interface :"
echo "  cd $INSTALL_DIR && ./start.sh"
echo ""
echo "Ou ouvrez start.sh directement dans le Finder."
echo ""

# Ask to launch now
read -p "Lancer l'interface maintenant ? (o/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Oo]$ ]]; then
  echo "🚀 Démarrage..."
  cd "$INSTALL_DIR"
  ./start.sh
fi
