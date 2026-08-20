#!/usr/bin/env bash
# ============================================================
#  DevCode — Backend Setup Script
#  Run once on a fresh Ubuntu Lightsail / VPS instance
# ============================================================
set -euo pipefail

echo "==> [1/6] System packages"
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential git curl

echo "==> [2/6] Installing Bun"
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

echo "==> [3/6] Clone / update repo"
if [ -d "$HOME/devcode" ]; then
  cd "$HOME/devcode" && git pull
else
  git clone https://github.com/YOUR_USERNAME/devcode.git "$HOME/devcode"
fi

echo "==> [4/6] Install backend dependencies + generate Prisma client"
cd "$HOME/devcode/backend"
bun install --frozen-lockfile
bun prisma generate

echo "==> [5/6] Confirm .env exists"
if [ ! -f "$HOME/devcode/backend/.env" ]; then
  echo ""
  echo "  ERROR: $HOME/devcode/backend/.env not found!"
  echo "  Copy your .env file to the server before continuing:"
  echo "    scp backend/.env ubuntu@<YOUR_IP>:~/devcode/backend/.env"
  echo ""
  exit 1
fi

echo "==> [6/6] Installing systemd service"
sudo cp "$HOME/devcode/deploy/code-backend.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable code-backend
sudo systemctl start  code-backend

echo ""
echo "✅  Backend is running on port 3000!"
echo "    sudo systemctl status code-backend"
echo "    journalctl -u code-backend -f"
