#!/bin/bash
# ══════════════════════════════════════════
#  CRM CGP — Script d'installation & démarrage
# ══════════════════════════════════════════

echo "🚀 CRM CGP — Installation"
echo ""

# Vérifier Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 non trouvé. Installe Python 3.9+"
    exit 1
fi

# Installer les dépendances
echo "📦 Installation des dépendances..."
pip3 install -r requirements.txt

echo ""
echo "✅ Installation terminée !"
echo ""
echo "📋 Pour démarrer le CRM :"
echo "   python3 app.py"
echo ""
echo "🌍 Puis ouvre dans ton navigateur :"
echo "   http://localhost:5000"
echo ""
echo "📡 Pour accès depuis Bali (hébergement cloud) :"
echo "   → Déploie sur Railway.app ou Render.com (gratuit)"
echo "   → Ou utilise ngrok : ngrok http 5000"
