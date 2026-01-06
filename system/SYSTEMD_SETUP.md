# Systemd Socket Activation Setup

This document outlines the systemd socket activation setup for scale-to-zero with mab-api-server.

## How It Works

1. **systemd socket** listens on port 8404
2. **First connection** triggers systemd to start the app
3. **App exits after idle** (30 minutes), memory goes to zero
4. **Next request** automatically restarts it via socket activation
5. **nginx** is unaware - just proxies normally

No PM2, no nginx hacks, no Lua modules required.

## Files Created

- [system/mab-api.socket](mab-api.socket) - Systemd socket unit
- [system/mab-api.service](mab-api.service) - Systemd service unit
- [system/nginx-sites.conf](nginx-sites.conf) - Simple nginx proxy config

## Installation Steps

### Step 1: Stop PM2 (if running)
```bash
pm2 delete mab-api-server
pm2 save
```

### Step 2: Install systemd units
```bash
cd /home/william/workspace/mab/system

sudo cp mab-api.socket /etc/systemd/system/
sudo cp mab-api.service /etc/systemd/system/

sudo systemctl daemon-reload
```

### Step 3: Enable and start the socket
```bash
sudo systemctl enable mab-api.socket
sudo systemctl start mab-api.socket
```

Verify the socket is listening:
```bash
sudo systemctl status mab-api.socket
sudo ss -tlnp | grep 8404
```

### Step 4: Update nginx config
```bash
sudo cp nginx-sites.conf /etc/nginx/sites-available/maryalice.bruntrager.win
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Test the setup

**Test 1: Socket is listening**
```bash
sudo systemctl status mab-api.socket
# Should show: Active: active (listening)
```

**Test 2: Service is NOT running yet**
```bash
sudo systemctl status mab-api.service
# Should show: Active: inactive (dead)
```

**Test 3: Make first request**
```bash
curl http://localhost:8404/api/auth/status
# Service should start automatically
```

**Test 4: Verify service started**
```bash
sudo systemctl status mab-api.service
# Should show: Active: active (running)
```

**Test 5: Trigger idle exit**
For quick testing with 1-minute timeout:
```bash
# Modify the service temporarily
sudo systemctl edit mab-api.service --full
# Add to Environment line:
Environment=IDLE_TIMEOUT_MS=60000

sudo systemctl daemon-reload
sudo systemctl restart mab-api.service

# Wait 1 minute, then check
sudo systemctl status mab-api.service
# Should show: Active: inactive (dead)
```

Or use the debug endpoint:
```bash
curl -X POST http://localhost:8404/api/debug/exit
# Service should exit cleanly
```

**Test 6: Verify auto-restart on next request**
```bash
# Make another request
curl http://localhost:8404/api/auth/status
# Service should start again automatically
```

## Benefits

✅ **Zero memory when idle** - App completely exits, systemd keeps socket  
✅ **Automatic startup** - First request triggers app start  
✅ **Clean architecture** - No PM2, no nginx hacks, no Lua  
✅ **Battle-tested** - Same pattern used by sshd, postfix, etc.  
✅ **Fast cold start** - Bun starts in ~2-10 seconds  
✅ **Production-ready** - Proper service management with systemd

## Monitoring & Logs

**View service logs:**
```bash
sudo journalctl -u mab-api.service -f
```

**View socket logs:**
```bash
sudo journalctl -u mab-api.socket -f
```

**Check if service is running:**
```bash
systemctl is-active mab-api.service
```

**Check socket status:**
```bash
systemctl is-active mab-api.socket
```

## Configuration

### Adjust Idle Timeout

Edit [api-server.js](../api-server.js):
```javascript
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS || '1800000') // 30 minutes
```

Or set via systemd service file:
```bash
sudo systemctl edit mab-api.service --full
# Add/modify Environment line:
Environment=IDLE_TIMEOUT_MS=900000
# (15 minutes = 900000ms)

sudo systemctl daemon-reload
```

### Change Port

Edit both [system/mab-api.socket](mab-api.socket) and [system/mab-api.service](mab-api.service):
```
# In mab-api.socket:
ListenStream=<new-port>

# In mab-api.service:
Environment=PORT=<new-port>
```

Then reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart mab-api.socket
```

## Troubleshooting

**Socket not listening:**
```bash
sudo systemctl status mab-api.socket
sudo journalctl -u mab-api.socket -n 50
```

**Service fails to start:**
```bash
sudo journalctl -u mab-api.service -n 50
# Check Bun path is correct:
which bun
# Update ExecStart in service file if needed
```

**Port already in use:**
```bash
sudo ss -tlnp | grep 8404
# Kill the process using the port
sudo systemctl stop mab-api.socket
sudo systemctl stop mab-api.service
```

**App doesn't exit when idle:**
- Check logs: `sudo journalctl -u mab-api.service -f`
- Verify idle logic in api-server.js is running
- Check for stuck in-flight requests

**Socket activation not working:**
```bash
# Verify StandardInput=socket in service file
sudo systemctl cat mab-api.service | grep StandardInput

# Verify socket is enabled
sudo systemctl is-enabled mab-api.socket
```

## Extending to Other Apps

This pattern can be applied to any low-traffic app:

1. Create `<app-name>.socket` with different port
2. Create `<app-name>.service` pointing to your app
3. Add idle-exit logic to the app
4. Configure nginx to proxy to that port

No changes needed to the basic pattern!

## Reverting to PM2

If you need to go back:
```bash
sudo systemctl stop mab-api.socket
sudo systemctl disable mab-api.socket
sudo systemctl stop mab-api.service
sudo systemctl disable mab-api.service

pm2 start ecosystem.config.js
pm2 save
```
