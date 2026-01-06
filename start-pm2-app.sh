#!/bin/bash
# PM2 start wrapper for nginx on-demand startup
# This should be copied to /usr/local/bin/start-pm2-app.sh
# and made executable with: sudo chmod +x /usr/local/bin/start-pm2-app.sh
#
# Usage: start-pm2-app.sh <app-name>
# Example: start-pm2-app.sh mab-api-server
#
# IMPORTANT: This script must run as the user who owns the PM2 process.
# If nginx runs as www-data, you need to configure sudo to allow:
#   www-data ALL=(william) NOPASSWD: /usr/local/bin/start-pm2-app.sh

if [ -z "$1" ]; then
    echo "Error: PM2 app name required"
    echo "Usage: $0 <app-name>"
    exit 1
fi

APP_NAME="$1"
PM2_USER="william"
PM2_PATH="/home/william/.nvm/versions/node/v24.12.0/bin/pm2"

# If we're not running as the PM2 user, use su to switch
if [ "$(whoami)" != "$PM2_USER" ]; then
    exec su - "$PM2_USER" -c "$0 $APP_NAME"
fi

# Check if app is already running
if "$PM2_PATH" list | grep -q "│ $APP_NAME.*online"; then
    # Already running, exit quietly
    exit 0
fi

# Start the app
"$PM2_PATH" start "$APP_NAME" >/dev/null 2>&1

# Wait for it to be ready
sleep 3
