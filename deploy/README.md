# Deploying to one Vultr server

One small Ubuntu server runs everything. Caddy serves the UI at `/` and proxies the API at `/api`, so the browser only ever talks to one origin. Inference stays on Vultr Serverless Inference; **no GPU instance**.

```
browser ──https──▶ Caddy :443 ──/api/*──▶ uvicorn 127.0.0.1:8000 ──▶ Vultr Serverless Inference
                              └──/*─────▶ next start 127.0.0.1:3000
```

## 1. Create the server (Vultr console)

- **Type:** Cloud Compute, Shared CPU. **Image:** Ubuntu 24.04 LTS x64.
- **Plan:** 2 GB RAM or more (the Next.js build needs it). Billed hourly; destroy it after the event.
- **SSH key:** add yours, so `ssh root@<ip>` works.
- **Firewall:** allow inbound TCP 22, 80, 443.

## 2. Install (from the repo root on your laptop)

```sh
scp backend/.env root@<ip>:/root/tribunal.env
ssh root@<ip> 'DEMO_PASSWORD=pick-one bash -s' < deploy/setup.sh
```

It prints the URL when done, e.g. `https://203-0-113-7.sslip.io` (a free hostname that resolves to your IP, so Caddy can get a real HTTPS certificate). Log in as `demo` with your password.

- Leave out `DEMO_PASSWORD=...` for an open site. Anyone with the link can then spend inference credits.
- Add `SITE=:80` for plain HTTP on the bare IP (skip HTTPS).
- `POST /api/eval` is disabled on the public site, because it runs every scenario several times. Run eval locally.

## 3. Update after pushing to main

```sh
ssh root@<ip> 'bash -s' < deploy/update.sh
```

## Troubleshooting

```sh
ssh root@<ip> journalctl -u tribunal-backend -n 50     # API errors, missing .env values
ssh root@<ip> journalctl -u tribunal-frontend -n 50
ssh root@<ip> journalctl -u caddy -n 50                # certificate or proxy problems
```
