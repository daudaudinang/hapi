# Per-user namespace SSH/Caddy setup

> Status: phase 1 implemented for `daint` on `2026-05-09`.
>
> Goal: each interactive user gets isolated loopback/network namespace, normal dev workflow, public HTTPS app URLs, and Remote SSH/Antigravity compatibility.

## Final UX

For user `daint`:

```sshconfig
Host my-server2
    HostName 192.168.26.180
    User daint
    Port 2253
```

Remote via Cloudflare Tunnel:

```sshconfig
Host my-server2-remote
    HostName ssh-daint.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User daint
```

Dev app inside SSH session:

```bash
npm run dev         # app can listen on localhost / 127.0.0.1
# public URL:
# https://3000-daint.littlepea.site
```

`daint` cannot SSH through host port `2252`; must use `2253` / `ssh-daint.littlepea.site`.

## Architecture

```text
Host namespace
  enp4s0: 192.168.26.180
  host sshd: 0.0.0.0:2252          # admin/host SSH; daint denied
  Caddy: :80
  cloudflared tunnel
  hapi-daint: 10.201.10.1/24
  socat: 0.0.0.0:2253 -> 10.201.10.2:2222

Daint namespace: daintns
  lo: 127.0.0.1/8
  eth0: 10.201.10.2/24
  default route via 10.201.10.1
  sshd: 10.201.10.2:2222
  Caddy ingress: 10.201.10.2:10080
  user apps: 127.0.0.1:<port>
```

Public HTTP flow:

```text
https://3000-daint.littlepea.site
  -> Cloudflare Edge TLS
  -> cloudflared: *.littlepea.site -> http://localhost:80
  -> host Caddy matcher ^[0-9]+-daint\.littlepea\.site$
  -> 10.201.10.2:10080
  -> Caddy inside daintns extracts port 3000
  -> 127.0.0.1:3000 inside daintns
```

SSH/IDE flow:

```text
ssh -p 2253 daint@192.168.26.180
  -> host socat :2253
  -> daintns sshd :2222
  -> shell/commands/SSH forwarding all inside daintns
```

This is required for Antigravity / VS Code Remote SSH because SSH dynamic/direct forwarding must be handled by `sshd` inside the same network namespace as the remote server process.

## Why not ForceCommand on host sshd?

Earlier approach:

```text
host sshd :2252 -> ForceCommand ip netns exec daintns shell
```

worked for plain terminal SSH, but broke Antigravity/Remote SSH. Root cause:

```text
Remote SSH starts server inside daintns: 127.0.0.1:<random>
SSH -D/direct forwarding is still handled by host sshd in host namespace
host namespace cannot reach daintns 127.0.0.1:<random>
=> channel open failed: connect failed: Connection refused
```

Fix: run a real `sshd` inside each user namespace and expose it on a per-user host port.

## Implemented for `daint`

### User/account

Created/updated:

```text
user: daint
home: /home/daint
shell: /bin/bash
password: set during setup
sudo: yes, group sudo
```

SSH key generated:

```text
/home/huynq/hapi-user-keys/daint/daint_ed25519
/home/huynq/hapi-user-keys/daint/daint_ed25519.pub
```

Public key installed:

```text
/home/daint/.ssh/authorized_keys
```

### Namespace/network

Namespace:

```text
daintns
```

Veth:

```text
host:    hapi-daint 10.201.10.1/24
netns:   eth0       10.201.10.2/24
```

Route in namespace:

```text
default via 10.201.10.1 dev eth0
```

DNS:

```text
/etc/netns/daintns/resolv.conf
nameserver 1.1.1.1
nameserver 8.8.8.8
```

NAT/forwarding:

```bash
iptables -A FORWARD -i hapi-daint -o enp4s0 -j ACCEPT
iptables -A FORWARD -i enp4s0 -o hapi-daint -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -t nat -A POSTROUTING -s 10.201.10.0/24 -o enp4s0 -j MASQUERADE
```

Setup script:

```text
/usr/local/sbin/hapi-netns-setup-user
```

Service:

```text
/etc/systemd/system/hapi-netns-daint.service
ExecStart=/usr/local/sbin/hapi-netns-setup-user daint 10 enp4s0
```

### Caddy public app proxy

Because Cloudflare Free Universal SSL covers `*.littlepea.site` but not deeper names like `3000.daint.littlepea.site`, public app convention is flat:

```text
<port>-<user>.littlepea.site
```

Example:

```text
3000-daint.littlepea.site
5173-daint.littlepea.site
```

Host Caddy block in `/etc/caddy/Caddyfile`:

```caddyfile
*.littlepea.site:80 {
    @daint_ns header_regexp daintns Host ^[0-9]+-daint\.littlepea\.site$
    handle @daint_ns {
        reverse_proxy 10.201.10.2:10080 {
            header_up X-Forwarded-Proto https
            transport http {
                response_header_timeout 3600s
            }
        }
    }

    handle {
        reverse_proxy localhost:{http.request.host.labels.2} {
            header_up X-Forwarded-Proto https
            transport http {
                response_header_timeout 3600s
            }
        }
    }
}
```

Namespace Caddy config `/etc/caddy/netns/daint.Caddyfile`:

```caddyfile
{
    auto_https off
    admin off
}

:10080 {
    bind 10.201.10.2

    @port header_regexp port Host ^([0-9]+)-daint\.littlepea\.site$

    handle @port {
        reverse_proxy 127.0.0.1:{re.port.1}
    }

    respond "bad namespace hostname" 404
}
```

Service:

```text
/etc/systemd/system/caddy-ns-daint.service
ExecStart=/usr/sbin/ip netns exec daintns /usr/bin/caddy run --config /etc/caddy/netns/daint.Caddyfile --adapter caddyfile
```

### SSH access

Host port allocation:

```text
2252: host sshd; `daint` denied
2253: forwarded to daintns sshd
```

Namespace sshd config:

```text
/etc/ssh/netns/daint/sshd_config
```

Key settings:

```sshconfig
Port 2222
ListenAddress 10.201.10.2
PasswordAuthentication yes
PubkeyAuthentication yes
UsePAM yes
PermitRootLogin no
AllowUsers daint
AllowTcpForwarding yes
PermitTTY yes
Subsystem sftp /usr/lib/openssh/sftp-server
```

Namespace sshd service:

```text
/etc/systemd/system/sshd-ns-daint.service
ExecStart=/usr/sbin/ip netns exec daintns /usr/sbin/sshd -D -e -f /etc/ssh/netns/daint/sshd_config
```

Host port forward service:

```text
/etc/systemd/system/ssh-forward-daint.service
ExecStart=/usr/bin/socat TCP-LISTEN:2253,bind=0.0.0.0,fork,reuseaddr TCP:10.201.10.2:2222
```

Host sshd block:

```text
/etc/ssh/sshd_config.d/98-deny-daint-host.conf
DenyUsers daint
```

Old ForceCommand file was disabled/moved to backup:

```text
/etc/ssh/sshd_config.d/99-hapi-netns-daint.conf
```

### Cloudflared

Config `/etc/cloudflared/config.yml`:

```yaml
ingress:
  - hostname: ssh.littlepea.site
    service: ssh://localhost:2252

  - hostname: ssh-daint.littlepea.site
    service: ssh://localhost:2253

  - hostname: '*.littlepea.site'
    service: http://localhost:80

  - service: http_status:404
```

Cloudflare dashboard/DNS must route `ssh-daint.littlepea.site` through the existing tunnel. `*.littlepea.site` must also route to the tunnel for app URLs.

## Verification commands

### Namespace/network

```bash
sudo systemctl is-active hapi-netns-daint
sudo ip netns exec daintns ip -br addr
sudo ip netns exec daintns curl -I https://example.com
```

Expected:

```text
active
lo UNKNOWN 127.0.0.1/8
eth0 UP 10.201.10.2/24
HTTP/2 200
```

### Caddy app proxy

Start app in namespace:

```bash
sudo ip netns exec daintns runuser -u daint -- \
  python3 -m http.server 3000 --bind 127.0.0.1
```

Test host Caddy:

```bash
curl -i -H 'Host: 3000-daint.littlepea.site' http://localhost/
```

Expected:

```text
HTTP/1.1 200 OK
```

Test public:

```bash
curl -I https://3000-daint.littlepea.site
```

Expected:

```text
HTTP/2 200
```

### SSH restriction

Port `2252` should reject `daint`:

```bash
ssh -p 2252 daint@localhost 'echo SHOULD_NOT_RUN'
```

Expected:

```text
Permission denied
```

Port `2253` should accept and land inside namespace:

```bash
ssh -p 2253 daint@localhost 'id -un; ip -br addr; echo $SSH_CONNECTION'
```

Expected:

```text
daint
lo UNKNOWN 127.0.0.1/8
eth0 UP 10.201.10.2/24
... 10.201.10.2 2222
```

### Remote SSH forwarding compatibility

Use SSH dynamic forwarding to reach a server bound to namespace localhost:

```bash
ssh -T -D 55295 -p 2253 daint@localhost bash -s
```

Remote script starts a service on `127.0.0.1:<random>`; local curl through SOCKS should reach it:

```bash
curl --socks5-hostname 127.0.0.1:55295 http://127.0.0.1:<random>/
```

Expected:

```text
NS_FORWARD_OK
```

### Sudo

`daint` is in group `sudo`:

```bash
id daint
sudo -l -U daint
```

Fresh SSH session:

```bash
sudo whoami
```

Expected:

```text
root
```

If Antigravity terminal shows stale sudo group, kill stale per-user Antigravity processes and reconnect:

```bash
sudo pkill -u daint -f antigravity-server
sudo pkill -u daint -f '/home/daint/.antigravity-server'
sudo pkill -KILL -u daint -f 'bash -s'
sudo systemctl restart sshd-ns-daint
```

## Rollout plan for remaining users

Interactive users currently present:

```text
mshai    uid=1000
hienda   uid=1002
phannt   uid=1005
thanhnt  uid=1006
dongpv   uid=1009
huynq    uid=1011
tungbv   uid=1014
daint    uid=1001  # done
```

Recommended: do not migrate `huynq`/admin until all non-admin users are stable. Keep `2252` as admin/host sshd.

Proposed allocation for non-admin rollout:

| User | Namespace | Subnet | Host veth | NS IP | SSH port | App host pattern | SSH tunnel host |
|---|---|---:|---|---|---:|---|---|
| hienda | hiendans | 10.201.11.0/24 | hapi-hienda | 10.201.11.2 | 2254 | `<port>-hienda.littlepea.site` | ssh-hienda.littlepea.site |
| phannt | phanntns | 10.201.12.0/24 | hapi-phannt | 10.201.12.2 | 2255 | `<port>-phannt.littlepea.site` | ssh-phannt.littlepea.site |
| thanhnt | thanhntns | 10.201.13.0/24 | hapi-thanhnt | 10.201.13.2 | 2256 | `<port>-thanhnt.littlepea.site` | ssh-thanhnt.littlepea.site |
| dongpv | dongpvns | 10.201.14.0/24 | hapi-dongpv | 10.201.14.2 | 2257 | `<port>-dongpv.littlepea.site` | ssh-dongpv.littlepea.site |
| tungbv | tungbvns | 10.201.15.0/24 | hapi-tungbv | 10.201.15.2 | 2258 | `<port>-tungbv.littlepea.site` | ssh-tungbv.littlepea.site |

Optional later:

| User | Namespace | Subnet | SSH port |
|---|---|---:|---:|
| huynq | huynqns | 10.201.16.0/24 | 2259 |
| mshai | mshains | 10.201.17.0/24 | 2260 |

## Rollout checklist per user

For user `$u`, index `$n`, ssh port `$p`:

1. Ensure user exists and has shell.
2. Add to `sudo` if desired:
   ```bash
   sudo usermod -aG sudo "$u"
   ```
3. Create SSH key folder:
   ```bash
   /home/huynq/hapi-user-keys/$u/${u}_ed25519
   ```
4. Install public key to `/home/$u/.ssh/authorized_keys`.
5. Create namespace service:
   ```text
   /etc/systemd/system/hapi-netns-$u.service
   ExecStart=/usr/local/sbin/hapi-netns-setup-user $u $n enp4s0
   ```
6. Create namespace Caddy config:
   ```text
   /etc/caddy/netns/$u.Caddyfile
   bind 10.201.$n.2:10080
   Host regex ^([0-9]+)-$u\.littlepea\.site$
   proxy to 127.0.0.1:{re.port.1}
   ```
7. Create namespace Caddy service `caddy-ns-$u.service`.
8. Create namespace sshd config `/etc/ssh/netns/$u/sshd_config`:
   ```text
   Port 2222
   ListenAddress 10.201.$n.2
   AllowUsers $u
   AllowTcpForwarding yes
   ```
9. Create namespace sshd service `sshd-ns-$u.service`.
10. Create host forward service:
    ```text
    ssh-forward-$u.service
    0.0.0.0:$p -> 10.201.$n.2:2222
    ```
11. Add host Caddy matcher before fallback:
    ```caddyfile
    @$u_ns header_regexp ${u}ns Host ^[0-9]+-$u\.littlepea\.site$
    handle @$u_ns {
        reverse_proxy 10.201.$n.2:10080 { ... }
    }
    ```
12. Add cloudflared SSH route before wildcard HTTP:
    ```yaml
    - hostname: ssh-$u.littlepea.site
      service: ssh://localhost:$p
    ```
13. Add user to host sshd deny list or file:
    ```text
    DenyUsers daint hienda phannt ...
    ```
14. Validate:
    ```bash
    sshd -t
    sshd -t -f /etc/ssh/netns/$u/sshd_config
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    caddy validate --config /etc/caddy/netns/$u.Caddyfile --adapter caddyfile
    cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
    ```
15. Start/restart:
    ```bash
    systemctl daemon-reload
    systemctl enable --now hapi-netns-$u caddy-ns-$u sshd-ns-$u ssh-forward-$u
    systemctl reload caddy
    systemctl restart cloudflared
    systemctl reload ssh
    ```
16. Verify all behaviors from the verification section.

## Rollback notes

Backups created during `daint` setup:

```text
/root/hapi-netns-backup-20260509-104315
/root/hapi-domain-migration-*
/root/hapi-ns-sshd-daint-20260509-113422
/root/hapi-cloudflared-ssh-daint-20260509-115018
```

Disable daint namespace SSH:

```bash
sudo systemctl disable --now ssh-forward-daint sshd-ns-daint caddy-ns-daint hapi-netns-daint
sudo rm -f /etc/ssh/sshd_config.d/98-deny-daint-host.conf
sudo systemctl reload ssh
```

Remove namespace manually only after services are stopped:

```bash
sudo ip netns delete daintns
sudo ip link delete hapi-daint
```
