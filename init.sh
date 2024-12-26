yum install -y git
yum install -y npm
npm install -g pnpm
yum install -y chromium
git clone https://github.com/wxaiway/markmap.git
cd markmap
pnpm install
pnpm run build
