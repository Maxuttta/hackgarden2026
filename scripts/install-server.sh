#!/usr/bin/env bash
set -euo pipefail
umask 077

stage=${1:?Pass the staged deployment directory}
app=/opt/cybergarden
data=/var/lib/cybergarden
config=/etc/cybergarden.env
unit=/etc/systemd/system/cybergarden.service
user=cybergarden

if [[ $(id -u) != 0 || ! -d /run/systemd/system ]]; then
    echo 'This installer needs root on Linux with systemd.' >&2
    exit 1
fi
for destination in "$app" "$data" "$config" "$unit"; do
    if [[ -e $destination || -L $destination ]]; then
        echo "An installation already exists at $destination. Existing data was kept." >&2
        exit 1
    fi
done
if getent passwd "$user" >/dev/null; then
    echo "The service account $user already exists. Existing files were kept." >&2
    exit 1
fi
if curl -sS --noproxy '*' --max-time 2 -o /dev/null http://127.0.0.1:8787/health 2>/dev/null; then
    echo 'Port 8787 already has an HTTP service.' >&2
    exit 1
fi

node=/usr/bin/node
npm=/usr/bin/npm
if ! [[ -x $node && -x $npm ]] || ! "$node" -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)'; then
    case $(uname -m) in
        x86_64) arch=x64 ;;
        aarch64) arch=arm64 ;;
        *) echo 'Install Node.js 22 or later and npm for this architecture.' >&2; exit 1 ;;
    esac
    base=https://nodejs.org/dist/latest-v24.x
    curl -fsSL --max-time 60 "$base/SHASUMS256.txt" -o "$stage/node-checksums"
    checksum=$(awk -v arch="$arch" '$2 ~ ("^node-v24[.][0-9]+[.][0-9]+-linux-" arch "[.]tar[.]xz$") { print $1, $2; exit }' "$stage/node-checksums")
    [[ $checksum =~ ^[a-f0-9]{64}' '([^[:space:]]+)$ ]] || { echo 'No matching Node.js checksum.' >&2; exit 1; }
    archive=${BASH_REMATCH[1]}
    curl -fsSL --max-time 180 "$base/$archive" -o "$stage/$archive"
    (cd "$stage" && printf '%s\n' "$checksum" | sha256sum --check)
    mkdir "$stage/node"
    tar --no-same-owner --no-same-permissions -xJf "$stage/$archive" --strip-components=1 -C "$stage/node"
    node="$stage/node/bin/node"
    npm="$stage/node/bin/npm"
fi

(cd "$stage/server" && PATH="$(dirname "$node"):$PATH" "$npm" ci --omit=dev --ignore-scripts --no-audit --no-fund)
(cd "$stage/server" && "$node" -e 'require("./http.cjs"); require("./telegram.cjs"); require("./workspace.cjs")')

useradd --system --user-group --home-dir "$data" --shell /usr/sbin/nologin "$user"
install -d -m 0700 -o "$user" -g "$user" "$data"
install -d -m 0755 "$app"
for directory in assets garden mobile server; do
    mv "$stage/$directory" "$app/"
done
if [[ $node == "$stage/"* ]]; then
    mv "$stage/node" "$app/"
    node="$app/node/bin/node"
fi
chmod -R u=rwX,go=rX "$app"
install -m 0600 "$stage/service.env" "$config"
if [[ -f $stage/store.json ]]; then
    install -m 0600 -o "$user" -g "$user" "$stage/store.json" "$data/store.json"
fi

cat > "$unit" <<EOF
[Unit]
Description=Cyber Garden reports and Telegram bot
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$app/server
EnvironmentFile=$config
Environment=HOST=127.0.0.1 PORT=8787 DATA_DIR=$data
ExecStartPre=/usr/bin/rm -f $data/server.lock
ExecStart=$node $app/server/index.cjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$data

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$unit"
systemctl daemon-reload
systemctl enable --now cybergarden.service

status=
for attempt in {1..35}; do
    if status=$(curl -fsS --noproxy '*' --max-time 2 http://127.0.0.1:8787/health 2>/dev/null) &&
       [[ $status == *'"telegramConnected":true'* ]]; then
        printf 'Cyber Garden: %s\n' "$status"
        exit 0
    fi
    if ! systemctl is-active --quiet cybergarden.service; then break; fi
    sleep 1
done
if [[ -n $status ]]; then
    printf 'Cyber Garden: %s\n' "$status"
    echo 'The report server is up. Telegram polling has yet to connect. Check: journalctl -u cybergarden -n 30' >&2
    exit 0
fi
echo 'The service did not become healthy. Check: journalctl -u cybergarden -n 30' >&2
exit 1
