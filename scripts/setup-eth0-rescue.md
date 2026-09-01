# eth0 wired rescue access

A always-on wired fallback for reaching the Pi when WiFi is off, there is no
internet, and mDNS is being unreliable. Plug an Ethernet cable from any
computer straight into the Pi's Ethernet port — no router, no WiFi needed.

## What it does
- `eth0` is a NetworkManager **shared** connection: fixed IP `10.55.0.1`, its
  own DHCP handing out `10.55.0.x` to whatever is plugged in, and internet
  shared from `wlan1` (same as the hotspot). Multiple wired devices work via a
  cheap switch.
- Autoconnects at boot, so it is always waiting — a spare key, not a toggle.
  Deliberately no frontend control: a fallback you enable from the dashboard
  is useless when the dashboard is unreachable.
- `10.55.0.x` chosen to avoid collisions (hotspot 10.42, OHeck 192.168.1,
  Starlink 192.168.4).

## How to connect
- **Browser:** `http://10.55.0.1` or `http://van-pi.local`
- **SSH / command line, any computer:** `ssh todd@10.55.0.1`
  (Mac, Linux, and Windows PowerShell all have ssh built in.)

## Setup (already applied 2026-09-01 — here for rebuilds)
```bash
sudo nmcli connection delete netplan-eth0 2>/dev/null
sudo nmcli connection add type ethernet ifname eth0 con-name eth0-rescue \
  ipv4.method shared ipv4.addresses 10.55.0.1/24 \
  connection.autoconnect yes connection.autoconnect-priority 100
sudo nmcli connection up eth0-rescue

# van-pi.local over the wire
echo "address=/van-pi.local/10.55.0.1" | \
  sudo tee /etc/NetworkManager/dnsmasq-shared.d/eth0-van-pi.conf

# add eth0 to avahi's allowed interfaces (keep wlan0 excluded — see
# TROUBLESHOOTING.md, the hotspot-0.0.0.0 browser-hang fix)
sudo sed -i 's/^allow-interfaces=.*/allow-interfaces=wlan1,tailscale0,eth0/' \
  /etc/avahi/avahi-daemon.conf
sudo systemctl restart avahi-daemon
```
