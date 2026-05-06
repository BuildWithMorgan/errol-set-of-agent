# Le Play Avocats — Interface IA

Votre assistant juridique personnel, fonctionnant entièrement en local sur votre Mac Mini.

---

## Installation (première fois)

Ouvrez le **Terminal** (Finder → Applications → Utilitaires → Terminal) et collez cette commande :

```bash
curl -fsSL https://raw.githubusercontent.com/BuildWithMorgan/errol-set-of-agent/feature/interface-enhancements/install.sh | bash
```

C'est tout. Le script s'occupe du reste.

**Prérequis :** Git, Python3, pip3, et Ollama doivent être installés. Si ce n'est pas le cas :

```bash
# Installer Homebrew si besoin
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Installer Git et Python
brew install git python
```

---

## Lancer l'interface

```bash
cd ~/leplay-ia && ./start.sh
```

Ou double-cliquez sur **`start.sh`** dans le Finder (dossier `leplay-ia` dans votre dossier personnel).

L'interface est accessible dans votre navigateur à :
**http://localhost:3000**

---

## Mettre à jour l'application

Quand Morgan publie une mise à jour, depuis le Terminal :

```bash
cd ~/leplay-ia && ./update.sh
```

---

## En cas de problème

- Vérifiez qu'Ollama tourne : `ollama serve`
- Vérifiez que le modèle est bien installé : `ollama list`
- Contactez Morgan : morganracon@gmail.com
