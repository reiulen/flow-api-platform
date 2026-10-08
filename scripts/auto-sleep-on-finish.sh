#!/usr/bin/env bash
PROJECT_DIR="studio/projects/ANC-what-happened-if-you-couldn-t-pay-your-r-20261006"
LOG_FILE="/tmp/auto_sleep_watcher.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Auto-sleep watcher started for $PROJECT_DIR" >> "$LOG_FILE"

while true; do
  RUNNING=$(ps aux | grep "cli.js run ANC-what-happened-if-you-couldn-t-pay-your-r-20261006" | grep -v grep)
  
  if [ -z "$RUNNING" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Studio pipeline process finished." >> "$LOG_FILE"
    sleep 20
    
    if [ -f "$PROJECT_DIR/render/master.mp4" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] master.mp4 successfully rendered! Size: $(ls -lh "$PROJECT_DIR/render/master.mp4" 2>/dev/null | awk '{print $5}')" >> "$LOG_FILE"
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Triggering Mac sleep mode now..." >> "$LOG_FILE"
      pmset sleepnow || osascript -e 'tell application "System Events" to sleep'
      exit 0
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pipeline exited but master.mp4 not yet created. Waiting..." >> "$LOG_FILE"
      sleep 30
    fi
  fi
  
  sleep 15
done
