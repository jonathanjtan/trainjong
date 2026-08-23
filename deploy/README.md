# Putting the table on a box

What is actually running on kf-dev, kept here so it can be rebuilt or moved.

The shape:

    the internet  ->  Tailscale Funnel (TLS, <host>.<tailnet>.ts.net:443)
                  ->  127.0.0.1:8081   Caddy — asks for the password
                  ->  127.0.0.1:8080   node server.js, HOST=127.0.0.1

Tailscale is not how the players connect — they are never on the tailnet. It is
how the traffic reaches the box without the box having a single inbound port
open to the internet, which is what makes this safe to run beside somebody's
work.

## The pieces

- `trainjong.service` — systemd unit. Runs as its own unprivileged user and is
  refused nearly everything: the filesystem is read-only to it, `/home` is
  invisible, capabilities are dropped. The app writes no files at all, which is
  what makes that affordable. `systemd-analyze security` scores it 1.7.
- `Caddyfile` — the front door, on loopback, doing one job. Put a real hash in
  it from `caddy hash-password`; the plaintext never needs to touch the disk.
  The site is `:8081` rather than `http://127.0.0.1:8081` because Tailscale
  forwards the request under its own hostname, and a site keyed to the loopback
  address matches none of them — `bind` is what keeps it off other interfaces.

## Standing it up

    sudo useradd --system --no-create-home --shell /usr/sbin/nologin trainjong
    sudo mkdir -p /srv/trainjong
    git archive HEAD | ssh BOX 'sudo tar -x -C /srv/trainjong'
    sudo install -m 644 trainjong.service /etc/systemd/system/
    sudo install -m 640 -o root -g caddy Caddyfile /etc/caddy/Caddyfile
    sudo systemctl enable --now trainjong && sudo systemctl reload caddy
    sudo tailscale funnel --bg --https=443 http://127.0.0.1:8081

`git archive` rather than a copy of the working tree on purpose: `public/faces`
is gitignored, so nobody's personal pictures travel to a public-facing box.

## Taking it down

    sudo tailscale funnel --https=443 off      # off the internet, instantly
    sudo systemctl disable --now trainjong
