# Hướng dẫn cô lập network theo user bằng namespace, Caddy và SSH riêng

Tài liệu này ghi lại kiến trúc và cách triển khai mô hình **mỗi user có network namespace riêng**, có thể chạy app ở `localhost`, expose ra domain public qua Caddy/Cloudflared, và SSH/Antigravity hoạt động bình thường.

Trạng thái hiện tại:

- Đã triển khai thành công cho user mẫu: `daint`
- Domain chính: `littlepea.site`
- Máy host: `mshai`
- IP LAN host: `192.168.26.180`
- SSH host chính: port `2252`
- SSH riêng cho `daint`: port `2253`

---

## 1. Mục tiêu

Mỗi user dùng máy như bình thường:

```bash
ssh daint@server
cd project
npm run dev
```

App có thể listen trên:

```text
127.0.0.1:3000
localhost:3000
```

Nhưng bên ngoài vẫn truy cập được qua HTTPS:

```text
https://3000-daint.littlepea.site
```

Đồng thời:

- user không đụng port với user khác;
- mỗi user có `localhost` riêng;
- user có internet bình thường;
- Antigravity / VS Code Remote SSH hoạt động;
- user không SSH nhầm vào host namespace;
- mỗi user có SSH port và SSH domain riêng.

---

## 2. Vì sao cần network namespace?

Mặc định trên Linux, tất cả user dùng chung network namespace. Nghĩa là:

```text
user A localhost:3000
user B localhost:3000
```

sẽ bị đụng port.

Network namespace giải quyết bằng cách tạo network stack riêng:

```text
daintns:
  localhost = riêng của daint
  127.0.0.1:3000 = chỉ trong daintns

hiendans:
  localhost = riêng của hienda
  127.0.0.1:3000 = chỉ trong hiendans
```

Như vậy nhiều user có thể cùng chạy:

```bash
npm run dev
```

và cùng dùng port `3000` mà không xung đột.

---

## 3. Kiến trúc tổng thể

Ví dụ với user `daint`:

```text
Host namespace
  enp4s0: 192.168.26.180
  host sshd: 0.0.0.0:2252
  Caddy: :80
  cloudflared tunnel
  hapi-daint: 10.201.10.1/24
  socat: 0.0.0.0:2253 -> 10.201.10.2:2222

Network namespace: daintns
  lo: 127.0.0.1/8
  eth0: 10.201.10.2/24
  default route: via 10.201.10.1
  sshd: 10.201.10.2:2222
  Caddy ingress: 10.201.10.2:10080
  user apps: 127.0.0.1:<port>
```

Luồng HTTP public:

```text
Browser
  -> https://3000-daint.littlepea.site
  -> Cloudflare Edge TLS
  -> cloudflared trên host
  -> host Caddy :80
  -> 10.201.10.2:10080
  -> Caddy trong daintns
  -> 127.0.0.1:3000 trong daintns
```

Luồng SSH:

```text
ssh -p 2253 daint@192.168.26.180
  -> host socat :2253
  -> daintns sshd :2222
  -> shell chạy trong daintns
```

---

## 4. Vì sao không dùng `3000.daint.littlepea.site`?

Cloudflare Free Universal SSL thường cover:

```text
littlepea.site
*.littlepea.site
```

Nhưng không cover subdomain sâu hơn:

```text
3000.daint.littlepea.site
```

Vì vậy mình đổi convention sang dạng flat:

```text
<port>-<user>.littlepea.site
```

Ví dụ:

```text
3000-daint.littlepea.site
5173-daint.littlepea.site
8888-hienda.littlepea.site
```

Các domain này đều nằm dưới wildcard:

```text
*.littlepea.site
```

nên dùng được SSL free của Cloudflare.

---

## 5. Vì sao cần SSHD riêng trong namespace?

Ban đầu thử dùng:

```text
host sshd :2252
  -> ForceCommand
  -> ip netns exec daintns shell
```

Cách này dùng terminal thường được, nhưng Antigravity / VS Code Remote SSH lỗi.

Lý do:

```text
Antigravity server chạy trong daintns:
  127.0.0.1:<random>

Nhưng SSH forwarding vẫn do host sshd xử lý:
  host namespace không thấy daintns:127.0.0.1:<random>
```

Lỗi thường gặp:

```text
channel open failed: connect failed: Connection refused
```

Cách đúng là chạy `sshd` thật bên trong namespace:

```text
daintns sshd :2222
```

Sau đó host forward port:

```text
host:2253 -> daintns:2222
```

Khi đó:

- shell nằm trong namespace;
- SSH forwarding nằm trong namespace;
- Antigravity/VS Code Remote SSH hoạt động đúng.

---

## 6. Trạng thái đã triển khai cho `daint`

### 6.1 User

```text
user: daint
home: /home/daint
shell: /bin/bash
sudo: có
```

Group:

```text
daint, sudo, users
```

SSH key đã tạo:

```text
/home/huynq/hapi-user-keys/daint/daint_ed25519
/home/huynq/hapi-user-keys/daint/daint_ed25519.pub
```

Public key đã cài vào:

```text
/home/daint/.ssh/authorized_keys
```

### 6.2 Namespace

```text
namespace: daintns
host veth: hapi-daint
host IP: 10.201.10.1/24
namespace IP: 10.201.10.2/24
```

Service tạo namespace:

```text
/etc/systemd/system/hapi-netns-daint.service
```

Nội dung chính:

```ini
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/hapi-netns-setup-user daint 10 enp4s0
```

Script dùng chung:

```text
/usr/local/sbin/hapi-netns-setup-user
```

Script này làm các việc:

- tạo namespace nếu chưa có;
- tạo veth pair;
- gán IP;
- bật loopback;
- thêm default route;
- cấu hình DNS;
- thêm iptables forwarding/NAT.

### 6.3 DNS trong namespace

File:

```text
/etc/netns/daintns/resolv.conf
```

Nội dung:

```text
nameserver 1.1.1.1
nameserver 8.8.8.8
```

### 6.4 NAT ra internet

Các rule chính:

```bash
iptables -A FORWARD -i hapi-daint -o enp4s0 -j ACCEPT
iptables -A FORWARD -i enp4s0 -o hapi-daint -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
iptables -t nat -A POSTROUTING -s 10.201.10.0/24 -o enp4s0 -j MASQUERADE
```

---

## 7. Caddy app proxy

### 7.1 Host Caddy

Host Caddy nhận tất cả HTTP từ Cloudflared:

```text
*.littlepea.site:80
```

Với `daint`, host Caddy match domain:

```text
^[0-9]+-daint\.littlepea\.site$
```

Rồi proxy vào namespace:

```text
10.201.10.2:10080
```

Block hiện tại trong `/etc/caddy/Caddyfile`:

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

### 7.2 Caddy trong namespace

File:

```text
/etc/caddy/netns/daint.Caddyfile
```

Nội dung:

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

Ý nghĩa:

```text
3000-daint.littlepea.site
  -> extract port 3000
  -> proxy tới 127.0.0.1:3000 trong daintns
```

Service:

```text
/etc/systemd/system/caddy-ns-daint.service
```

---

## 8. SSH riêng cho namespace

### 8.1 Host SSH

Host SSH chính:

```text
0.0.0.0:2252
```

`daint` bị chặn ở đây bằng file:

```text
/etc/ssh/sshd_config.d/98-deny-daint-host.conf
```

Nội dung:

```sshconfig
DenyUsers daint
```

Mục tiêu: tránh user vào nhầm host namespace.

### 8.2 SSHD trong namespace

File config:

```text
/etc/ssh/netns/daint/sshd_config
```

Nội dung chính:

```sshconfig
Port 2222
ListenAddress 10.201.10.2
Protocol 2
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
PasswordAuthentication yes
PubkeyAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
PermitRootLogin no
AllowUsers daint
AllowTcpForwarding yes
PermitTunnel no
X11Forwarding no
PermitTTY yes
Subsystem sftp /usr/lib/openssh/sftp-server
PidFile /run/sshd-daintns.pid
AuthorizedKeysFile .ssh/authorized_keys
PrintMotd no
AcceptEnv LANG LC_*
```

Service:

```text
/etc/systemd/system/sshd-ns-daint.service
```

Nội dung chính:

```ini
[Service]
Type=simple
RuntimeDirectory=sshd
ExecStart=/usr/sbin/ip netns exec daintns /usr/sbin/sshd -D -e -f /etc/ssh/netns/daint/sshd_config
Restart=on-failure
RestartSec=3
```

### 8.3 Forward port 2253 vào namespace

Service:

```text
/etc/systemd/system/ssh-forward-daint.service
```

Nội dung chính:

```ini
[Service]
Type=simple
ExecStart=/usr/bin/socat TCP-LISTEN:2253,bind=0.0.0.0,fork,reuseaddr TCP:10.201.10.2:2222
Restart=on-failure
RestartSec=3
```

Luồng:

```text
client -> 192.168.26.180:2253 -> socat -> 10.201.10.2:2222 -> sshd trong daintns
```

---

## 9. Cloudflared

File:

```text
/etc/cloudflared/config.yml
```

Config hiện tại:

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

Ý nghĩa:

```text
ssh.littlepea.site       -> host SSH 2252
ssh-daint.littlepea.site -> daint SSH 2253
*.littlepea.site         -> Caddy HTTP 80
```

---

## 10. Cách user sử dụng

### 10.1 SSH LAN

```sshconfig
Host daint-local
    HostName 192.168.26.180
    User daint
    Port 2253
```

### 10.2 SSH qua Cloudflare Tunnel

```sshconfig
Host daint-remote
    HostName ssh-daint.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User daint
```

### 10.3 Chạy app

Trong SSH session của `daint`:

```bash
cd project
npm run dev
```

Nếu app listen:

```text
localhost:3000
```

thì public URL:

```text
https://3000-daint.littlepea.site
```

---

## 11. Kiểm tra vận hành

### 11.1 Kiểm tra service

```bash
sudo systemctl is-active hapi-netns-daint
sudo systemctl is-active caddy-ns-daint
sudo systemctl is-active sshd-ns-daint
sudo systemctl is-active ssh-forward-daint
sudo systemctl is-active caddy
sudo systemctl is-active cloudflared
sudo systemctl is-active ssh
```

Kỳ vọng tất cả đều:

```text
active
```

### 11.2 Kiểm tra namespace

```bash
sudo ip netns list
sudo ip netns exec daintns ip -br addr
sudo ip netns exec daintns ip route
```

Kỳ vọng:

```text
lo    127.0.0.1/8
eth0  10.201.10.2/24
default via 10.201.10.1 dev eth0
```

### 11.3 Kiểm tra internet trong namespace

```bash
sudo ip netns exec daintns curl -I https://example.com
```

Kỳ vọng:

```text
HTTP/2 200
```

### 11.4 Kiểm tra SSH port 2252 bị chặn

```bash
ssh -p 2252 daint@192.168.26.180
```

Kỳ vọng:

```text
Permission denied
```

### 11.5 Kiểm tra SSH port 2253 hoạt động

```bash
ssh -p 2253 daint@192.168.26.180 'id -un; ip -br addr'
```

Kỳ vọng:

```text
daint
lo    UNKNOWN 127.0.0.1/8
eth0  UP      10.201.10.2/24
```

### 11.6 Kiểm tra app proxy

Start test app:

```bash
sudo ip netns exec daintns runuser -u daint -- \
  python3 -m http.server 3000 --bind 127.0.0.1
```

Test qua host Caddy:

```bash
curl -i -H 'Host: 3000-daint.littlepea.site' http://localhost/
```

Kỳ vọng:

```text
HTTP/1.1 200 OK
```

Test public:

```bash
curl -I https://3000-daint.littlepea.site
```

Kỳ vọng:

```text
HTTP/2 200
```

### 11.7 Kiểm tra sudo

Trong session `daint`:

```bash
id
groups
sudo whoami
```

Kỳ vọng:

```text
sudo
root
```

Nếu Antigravity terminal vẫn dùng group cũ, kill process cũ:

```bash
sudo pkill -u daint -f antigravity-server
sudo pkill -u daint -f '/home/daint/.antigravity-server'
sudo pkill -KILL -u daint -f 'bash -s'
sudo systemctl restart sshd-ns-daint
```

---

## 12. Kế hoạch rollout cho các user còn lại

Các user interactive hiện có:

```text
mshai
hienda
phannt
thanhnt
dongpv
huynq
tungbv
daint
```

`daint` đã hoàn thành.

Khuyến nghị: giữ `huynq` và `mshai` làm admin/host trước, chưa migrate ngay. Rollout trước cho user thường.

| User | Namespace | Subnet | Host IP | NS IP | SSH port | App domain | SSH domain |
|---|---|---|---|---|---:|---|---|
| hienda | hiendans | 10.201.11.0/24 | 10.201.11.1 | 10.201.11.2 | 2254 | `<port>-hienda.littlepea.site` | ssh-hienda.littlepea.site |
| phannt | phanntns | 10.201.12.0/24 | 10.201.12.1 | 10.201.12.2 | 2255 | `<port>-phannt.littlepea.site` | ssh-phannt.littlepea.site |
| thanhnt | thanhntns | 10.201.13.0/24 | 10.201.13.1 | 10.201.13.2 | 2256 | `<port>-thanhnt.littlepea.site` | ssh-thanhnt.littlepea.site |
| dongpv | dongpvns | 10.201.14.0/24 | 10.201.14.1 | 10.201.14.2 | 2257 | `<port>-dongpv.littlepea.site` | ssh-dongpv.littlepea.site |
| tungbv | tungbvns | 10.201.15.0/24 | 10.201.15.1 | 10.201.15.2 | 2258 | `<port>-tungbv.littlepea.site` | ssh-tungbv.littlepea.site |
| hungnt | hungntns | 10.201.16.0/24 | 10.201.16.1 | 10.201.16.2 | 2259 | `<port>-hungnt.littlepea.site` | ssh-hungnt.littlepea.site |

Có thể migrate sau:

| User | Namespace | Subnet | SSH port |
|---|---|---|---:|
| mshai | mshains | 10.201.17.0/24 | 2260 |

---

## 13. Checklist triển khai cho mỗi user mới

Giả sử:

```text
user = hienda
index = 11
ssh_port = 2254
ns = hiendans
ns_ip = 10.201.11.2
host_ip = 10.201.11.1
```

### 13.1 User và sudo

```bash
sudo usermod -aG sudo hienda
```

### 13.2 SSH key

```bash
sudo install -d -m 700 -o huynq -g huynq /home/huynq/hapi-user-keys/hienda
sudo -u huynq ssh-keygen -t ed25519 -N '' \
  -C 'hienda@littlepea.site' \
  -f /home/huynq/hapi-user-keys/hienda/hienda_ed25519

sudo install -d -m 700 -o hienda -g hienda /home/hienda/.ssh
sudo cp /home/huynq/hapi-user-keys/hienda/hienda_ed25519.pub /home/hienda/.ssh/authorized_keys
sudo chown hienda:hienda /home/hienda/.ssh/authorized_keys
sudo chmod 600 /home/hienda/.ssh/authorized_keys
```

### 13.3 Namespace service

File:

```text
/etc/systemd/system/hapi-netns-hienda.service
```

Nội dung:

```ini
[Unit]
Description=HAPI network namespace for hienda
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/hapi-netns-setup-user hienda 11 enp4s0

[Install]
WantedBy=multi-user.target
```

### 13.4 Namespace Caddy

File:

```text
/etc/caddy/netns/hienda.Caddyfile
```

Nội dung:

```caddyfile
{
    auto_https off
    admin off
}

:10080 {
    bind 10.201.11.2

    @port header_regexp port Host ^([0-9]+)-hienda\.littlepea\.site$

    handle @port {
        reverse_proxy 127.0.0.1:{re.port.1}
    }

    respond "bad namespace hostname" 404
}
```

Service:

```text
/etc/systemd/system/caddy-ns-hienda.service
```

Nội dung:

```ini
[Unit]
Description=Caddy ingress for hienda namespace
After=hapi-netns-hienda.service
Requires=hapi-netns-hienda.service

[Service]
Type=simple
ExecStart=/usr/sbin/ip netns exec hiendans /usr/bin/caddy run --config /etc/caddy/netns/hienda.Caddyfile --adapter caddyfile
ExecReload=/usr/sbin/ip netns exec hiendans /usr/bin/caddy reload --config /etc/caddy/netns/hienda.Caddyfile --adapter caddyfile --force
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### 13.5 Namespace SSHD

File:

```text
/etc/ssh/netns/hienda/sshd_config
```

Nội dung:

```sshconfig
Port 2222
ListenAddress 10.201.11.2
Protocol 2
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
PasswordAuthentication yes
PubkeyAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
PermitRootLogin no
AllowUsers hienda
AllowTcpForwarding yes
PermitTunnel no
X11Forwarding no
PermitTTY yes
Subsystem sftp /usr/lib/openssh/sftp-server
PidFile /run/sshd-hiendans.pid
AuthorizedKeysFile .ssh/authorized_keys
PrintMotd no
AcceptEnv LANG LC_*
```

Service:

```text
/etc/systemd/system/sshd-ns-hienda.service
```

Nội dung:

```ini
[Unit]
Description=OpenSSH server inside hienda network namespace
After=hapi-netns-hienda.service
Requires=hapi-netns-hienda.service

[Service]
Type=simple
RuntimeDirectory=sshd
ExecStart=/usr/sbin/ip netns exec hiendans /usr/sbin/sshd -D -e -f /etc/ssh/netns/hienda/sshd_config
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### 13.6 Forward SSH port

File:

```text
/etc/systemd/system/ssh-forward-hienda.service
```

Nội dung:

```ini
[Unit]
Description=Forward host SSH port 2254 to hienda namespace sshd
After=sshd-ns-hienda.service
Requires=sshd-ns-hienda.service

[Service]
Type=simple
ExecStart=/usr/bin/socat TCP-LISTEN:2254,bind=0.0.0.0,fork,reuseaddr TCP:10.201.11.2:2222
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### 13.7 Host Caddy matcher

Trong `/etc/caddy/Caddyfile`, thêm matcher trước fallback `handle`:

```caddyfile
@hienda_ns header_regexp hiendans Host ^[0-9]+-hienda\.littlepea\.site$
handle @hienda_ns {
    reverse_proxy 10.201.11.2:10080 {
        header_up X-Forwarded-Proto https
        transport http {
            response_header_timeout 3600s
        }
    }
}
```

### 13.8 Cloudflared SSH route

Trong `/etc/cloudflared/config.yml`, thêm trước wildcard HTTP:

```yaml
  - hostname: ssh-hienda.littlepea.site
    service: ssh://localhost:2254
```

### 13.9 Chặn user khỏi host SSH 2252

File:

```text
/etc/ssh/sshd_config.d/98-deny-namespace-users.conf
```

Nội dung nên gom chung:

```sshconfig
DenyUsers daint hienda phannt thanhnt dongpv tungbv hungnt
```

Lưu ý: nếu đang có file riêng `98-deny-daint-host.conf`, có thể merge vào file chung để dễ quản lý.

### 13.10 Validate và restart

```bash
sudo sshd -t
sudo sshd -t -f /etc/ssh/netns/hienda/sshd_config
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo caddy validate --config /etc/caddy/netns/hienda.Caddyfile --adapter caddyfile
sudo cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate

sudo systemctl daemon-reload
sudo systemctl enable --now hapi-netns-hienda
sudo systemctl enable --now caddy-ns-hienda
sudo systemctl enable --now sshd-ns-hienda
sudo systemctl enable --now ssh-forward-hienda
sudo systemctl reload caddy
sudo systemctl restart cloudflared
sudo systemctl reload ssh
```

### 13.11 Verify

```bash
ssh -p 2252 hienda@192.168.26.180
# expected: denied

ssh -p 2254 hienda@192.168.26.180 'id -un; ip -br addr'
# expected: hienda + 10.201.11.2

curl -I -H 'Host: 3000-hienda.littlepea.site' http://localhost
# app phải đang chạy trong hiendans:127.0.0.1:3000
```

---

## 14. Rollback

Disable services cho một user, ví dụ `daint`:

```bash
sudo systemctl disable --now ssh-forward-daint
sudo systemctl disable --now sshd-ns-daint
sudo systemctl disable --now caddy-ns-daint
sudo systemctl disable --now hapi-netns-daint
```

Xóa namespace sau khi service đã stop:

```bash
sudo ip netns delete daintns
sudo ip link delete hapi-daint
```

Gỡ chặn SSH host nếu cần:

```bash
sudo rm /etc/ssh/sshd_config.d/98-deny-daint-host.conf
sudo sshd -t
sudo systemctl reload ssh
```

Backup đã tạo trong quá trình setup `daint`:

```text
/root/hapi-netns-backup-20260509-104315
/root/hapi-domain-migration-*
/root/hapi-ns-sshd-daint-20260509-113422
/root/hapi-cloudflared-ssh-daint-20260509-115018
```

---

## 15. Ghi chú vận hành

1. `2252` nên giữ làm SSH host/admin.
2. Mỗi user namespace nên có port riêng: `2253`, `2254`, ...
3. Mỗi user nên có SSH domain riêng: `ssh-<user>.littlepea.site`.
4. App public dùng format: `<port>-<user>.littlepea.site`.
5. Không dùng format sâu như `<port>.<user>.littlepea.site` nếu muốn Cloudflare Free SSL.
6. Nếu thêm user mới, luôn validate đủ Caddy, cloudflared, sshd trước khi reload.
7. Nếu IDE Remote SSH lỗi forwarding, kiểm tra xem user có thật sự connect vào SSHD trong namespace không:

```bash
echo $SSH_CONNECTION
```

Kỳ vọng đích là:

```text
10.201.x.2 2222
```

Không phải:

```text
192.168.26.180 2252
```

---

## 16. Cập nhật rollout thực tế ngày 2026-05-09

Đã triển khai mô hình namespace/SSH/Caddy/Cloudflared cho toàn bộ user interactive hiện có, ngoại trừ `huynq`.

`huynq` được giữ lại để SSH vào host qua port `2252` làm tài khoản admin/điều phối.

### 16.1 Bảng trạng thái thực tế

| User | Namespace | Subnet | Host IP | NS IP | SSH port LAN | SSH domain Cloudflared | App domain pattern | Trạng thái |
|---|---|---|---|---|---:|---|---|---|
| daint | daintns | 10.201.10.0/24 | 10.201.10.1 | 10.201.10.2 | 2253 | ssh-daint.littlepea.site | `<port>-daint.littlepea.site` | done |
| hienda | hiendans | 10.201.11.0/24 | 10.201.11.1 | 10.201.11.2 | 2254 | ssh-hienda.littlepea.site | `<port>-hienda.littlepea.site` | done |
| phannt | phanntns | 10.201.12.0/24 | 10.201.12.1 | 10.201.12.2 | 2255 | ssh-phannt.littlepea.site | `<port>-phannt.littlepea.site` | done |
| thanhnt | thanhntns | 10.201.13.0/24 | 10.201.13.1 | 10.201.13.2 | 2256 | ssh-thanhnt.littlepea.site | `<port>-thanhnt.littlepea.site` | done |
| dongpv | dongpvns | 10.201.14.0/24 | 10.201.14.1 | 10.201.14.2 | 2257 | ssh-dongpv.littlepea.site | `<port>-dongpv.littlepea.site` | done |
| tungbv | tungbvns | 10.201.15.0/24 | 10.201.15.1 | 10.201.15.2 | 2258 | ssh-tungbv.littlepea.site | `<port>-tungbv.littlepea.site` | done |
| hungnt | hungntns | 10.201.16.0/24 | 10.201.16.1 | 10.201.16.2 | 2259 | ssh-hungnt.littlepea.site | `<port>-hungnt.littlepea.site` | done |
| mshai | mshains | 10.201.17.0/24 | 10.201.17.1 | 10.201.17.2 | 2260 | ssh-mshai.littlepea.site | `<port>-mshai.littlepea.site` | done |
| huynq | host namespace | n/a | n/a | n/a | 2252 | ssh.littlepea.site | host-level `<port>.littlepea.site` | kept as admin |

### 16.2 User bị chặn khỏi host SSH 2252

File:

```text
/etc/ssh/sshd_config.d/98-deny-namespace-users.conf
```

Nội dung hiện tại:

```sshconfig
DenyUsers daint mshai hienda phannt thanhnt dongpv tungbv hungnt
```

Ý nghĩa:

- các user namespace không được SSH qua `2252`;
- tránh vào nhầm host namespace;
- `huynq` vẫn vào `2252` được.

### 16.3 SSH config mẫu cho từng user qua LAN

```sshconfig
Host daint-local
    HostName 192.168.26.180
    User daint
    Port 2253

Host hienda-local
    HostName 192.168.26.180
    User hienda
    Port 2254

Host phannt-local
    HostName 192.168.26.180
    User phannt
    Port 2255

Host thanhnt-local
    HostName 192.168.26.180
    User thanhnt
    Port 2256

Host dongpv-local
    HostName 192.168.26.180
    User dongpv
    Port 2257

Host tungbv-local
    HostName 192.168.26.180
    User tungbv
    Port 2258

Host hungnt-local
    HostName 192.168.26.180
    User hungnt
    Port 2259

Host mshai-local
    HostName 192.168.26.180
    User mshai
    Port 2260
```

### 16.4 SSH config mẫu qua Cloudflared

```sshconfig
Host daint-remote
    HostName ssh-daint.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User daint

Host hienda-remote
    HostName ssh-hienda.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User hienda

Host phannt-remote
    HostName ssh-phannt.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User phannt

Host thanhnt-remote
    HostName ssh-thanhnt.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User thanhnt

Host dongpv-remote
    HostName ssh-dongpv.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User dongpv

Host tungbv-remote
    HostName ssh-tungbv.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User tungbv

Host hungnt-remote
    HostName ssh-hungnt.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User hungnt

Host mshai-remote
    HostName ssh-mshai.littlepea.site
    ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
    User mshai
```

### 16.5 SSH key đã sinh

Private/public key cho từng user được lưu ở:

```text
/home/huynq/hapi-user-keys/<user>/<user>_ed25519
/home/huynq/hapi-user-keys/<user>/<user>_ed25519.pub
```

Đã sinh cho:

```text
daint
mshai
hienda
phannt
thanhnt
dongpv
tungbv
hungnt
```

Public key đã được append vào:

```text
/home/<user>/.ssh/authorized_keys
```

### 16.6 Cloudflared routes đã thêm

`/etc/cloudflared/config.yml` hiện có route SSH riêng:

```yaml
- hostname: ssh-daint.littlepea.site
  service: ssh://localhost:2253

- hostname: ssh-mshai.littlepea.site
  service: ssh://localhost:2260

- hostname: ssh-hienda.littlepea.site
  service: ssh://localhost:2254

- hostname: ssh-phannt.littlepea.site
  service: ssh://localhost:2255

- hostname: ssh-thanhnt.littlepea.site
  service: ssh://localhost:2256

- hostname: ssh-dongpv.littlepea.site
  service: ssh://localhost:2257

- hostname: ssh-tungbv.littlepea.site
  service: ssh://localhost:2258

- hostname: ssh-hungnt.littlepea.site
  service: ssh://localhost:2259
```

Cần đảm bảo các hostname này được khai báo trong Cloudflare Tunnel/Public Hostname hoặc DNS route tương ứng.

### 16.7 Verification đã chạy

Đã kiểm tra cho từng user:

- 4 service namespace active:
  - `hapi-netns-<user>`
  - `caddy-ns-<user>`
  - `sshd-ns-<user>`
  - `ssh-forward-<user>`
- SSH vào port riêng thành công bằng generated key;
- SSH vào `2252` bị deny;
- trong SSH session thấy IP namespace đúng `10.201.x.2`;
- namespace curl được internet `https://example.com`;
- Caddy config valid;
- Cloudflared ingress valid;
- host sshd config valid;
- `huynq` login qua host SSH `2252` bằng password vẫn OK.

### 16.8 Backup của rollout hàng loạt

Backup tạo tại:

```text
/root/hapi-rollout-users-20260509-121607
```
