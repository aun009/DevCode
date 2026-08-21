#!/usr/bin/env bash
# ============================================================
#  DevCode — Lightsail Worker Setup Script
#  Run once on a fresh Ubuntu 22.04 / 24.04 Lightsail instance
#  Usage: curl -fsSL <raw-url>/setup-worker.sh | bash
# ============================================================
set -euo pipefail

echo "==> [1/7] System packages"
sudo apt-get update -qq
sudo apt-get install -y -qq \
  build-essential gcc g++ git curl unzip \
  default-jdk-headless python3 nodejs npm

echo "==> [2/7] Installing Bun"
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

echo "==> [3/7] Verifying runtimes"
python3 --version
node --version
java -version
gcc --version
g++ --version
bun --version

echo "==> [4/7] Clone / update repo"
if [ -d "$HOME/devcode" ]; then
  echo "Repo already exists — pulling latest"
  cd "$HOME/devcode" && git pull
else
  git clone https://github.com/aun009/DevCode.git "$HOME/devcode"
fi

echo "==> [5/7] Install worker dependencies"
cd "$HOME/devcode/worker"
bun install --frozen-lockfile

echo "==> [6/7] Confirm .env exists"
if [ ! -f "$HOME/devcode/worker/.env" ]; then
  echo ""
  echo "  ERROR: $HOME/devcode/worker/.env not found!"
  echo "  Copy your .env file to the server before continuing:"
  echo "    scp worker/.env ubuntu@<YOUR_IP>:~/devcode/worker/.env"
  echo ""
  exit 1
fi

echo "==> [7/7] Installing systemd service"
sudo cp "$HOME/devcode/deploy/code-worker.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable code-worker
sudo systemctl start  code-worker

echo ""
echo "✅  Worker is running!"
echo "    sudo systemctl status code-worker"
echo "    journalctl -u code-worker -f"
