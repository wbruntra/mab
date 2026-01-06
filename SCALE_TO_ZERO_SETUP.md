# Scale-to-Zero Setup Instructions

This document outlines the changes needed to implement scale-to-zero for the mab-api-server.

## Changes Made

### 1. Application (api-server.js) ✅
- Added idle tracking middleware that records the time of each request
- Added in-flight request counter to prevent shutdown during active requests
- Added idle watchdog that exits cleanly after 30 minutes of inactivity with no in-flight requests

### 2. PM2 Configuration (ecosystem.config.js) ✅
- Added `"stop_exit_codes": [0]` to mab-api-server config
- This prevents PM2 from auto-restarting when the app exits cleanly
- PM2 will mark the app as "stopped" rather than immediately restarting it

### 3. PM2 Wrapper Script (start-pm2-app.sh) ✅
- Created generic wrapper script for nginx to start any PM2 process on-demand
- Takes app name as command-line argument
- Script must be copied to system location and made executable

## Installation Steps

### Step 1: Copy the PM2 Wrapper Script
```bash
sudo cp /home/william/workspace/mab/start-pm2-app.sh /usr/local/bin/start-pm2-app.sh
sudo chmod +x /usr/local/bin/start-pm2-app.sh
```

**Important:** Since PM2 runs as your user (via nvm), the script needs permission to switch users. Add this to your sudoers file:

```bash
sudo visudo
```

Add this line:
```
www-data ALL=(william) NOPASSWD: /usr/local/bin/start-pm2-app.sh
```

This allows nginx (running as www-data) to execute the script as your user without a password prompt.

### Step 2: Update PM2 Configuration
```bash
cd /home/william/workspace/mab
pm2 delete mab-api-server  # If already running
pm2 start ecosystem.config.js
pm2 save
```

### Step 3: Configure nginx

The nginx configuration has been updated in [system/nginx-sites.conf](system/nginx-sites.conf).

Key changes:
- Added connection timeouts to the `/api` location
- Added `error_page 502 503 504 = @start_mab` to catch downstream failures
- Created `@start_mab` location that executes the startup script and retries

**Note:** The config uses `content_by_lua_block` which requires the `nginx-extras` or `nginx-lua` module:

```bash
# Install nginx with Lua support (if not already installed)
sudo apt-get install nginx-extras
# or
sudo apt-get install libnginx-mod-http-lua
```

Alternatively, if you don't want to use Lua, consider these approaches:

#### Alternative A: Systemd Socket Activation (Recommended)
Create a systemd socket that activates the service on connection:

```bash
# /etc/systemd/system/mab-api.socket
[Unit]
Description=MAB API Socket

[Socket]
ListenStream=8404

[Install]
WantedBy=sockets.target
```

```bash
# /etc/systemd/system/mab-api.service
[Unit]
Description=MAB API Server
Requires=mab-api.socket

[Service]
Type=simple
ExecStart=/usr/bin/pm2 start mab-api-server
ExecStop=/usr/bin/pm2 stop mab-api-server
User=william
Restart=no

[Install]
WantedBy=multi-user.target
```

#### Alternative B: Health Check Service
Create a small always-on service (minimal memory) that:
1. Listens on a different port (e.g., 8405)
2. When pinged, starts PM2 process
3. Proxies request to main app

#### Alternative C: Monitoring Script (Simple, no nginx changes needed)
Simple approach - run a lightweight monitor:

```bash
# In a lightweight always-on process or cron job every minute
curl -f http://localhost:8404/api/auth/status || /usr/local/bin/start-pm2-app.sh mab-api-server
```

### Step 4: Copy nginx config and restart
```bash
sudo cp /home/william/workspace/mab/system/nginx-sites.conf /etc/nginx/sites-available/maryalice.bruntrager.win
sudo systemctl restart nginx
```

### Step 5: Test the Setup

1. Start the service normally:
   ```bash
   pm2 start mab-api-server
   ```

2. Check that it's running:
   ```bash
   pm2 status
   curl http://localhost:8404/api/auth/status
   ```

3. Wait 30+ minutes with no requests, it should exit cleanly:
   ```bash
   pm2 logs mab-api-server --lines 50
   # Should show: "Idle for XXXs with no in-flight requests, exiting cleanly"
   ```

4. Verify PM2 shows it as stopped (not restarting):
   ```bash
   pm2 status
   # Should show status as "stopped"
   ```

5. Manually restart it:
   ```bash
   pm2 start mab-api-server
   ```

## Benefits

- **Memory savings**: When idle, the app exits completely, freeing all memory
- **Clean startup**: Cold start takes only a few seconds (Bun + app initialization)
- **No complexity**: No exotic tooling, just PM2 + app logic
- **Safe**: Won't exit during active requests (in-flight counter)

## Configuration Options

You can adjust the idle timeout in [api-server.js](api-server.js):

```javascript
const IDLE_TIMEOUT_MS = 1000 * 60 * 30 // 30 minutes
```

Change to your preference (e.g., 15 minutes = `1000 * 60 * 15`)

## Monitoring

Watch the logs to see idle behavior:

```bash
pm2 logs mab-api-server --lines 100

# Or check the log files directly:
tail -f /home/william/personal/mab/logs/api-server-out.log
```

## Troubleshooting

**App keeps restarting immediately:**
- Check that `"stop_exit_codes": [0]` is in ecosystem.config.js
- Verify with: `pm2 show mab-api-server`

**App exits too quickly:**
- Increase `IDLE_TIMEOUT_MS` in api-server.js
- Check that requests are being tracked: look for in-flight counter in logs

**App never exits:**
- Check that there are no long-running connections keeping in-flight > 0
- Verify the interval is running (check logs for idle messages before exit)

## Future Enhancements

1. Make idle tracking reusable across multiple services
2. Implement proper nginx integration (systemd socket activation recommended)
3. Add metrics/monitoring for idle/active time
4. Consider implementing for other low-traffic services (transcriber, summarizer)
