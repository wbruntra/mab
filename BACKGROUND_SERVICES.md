# MAB Background Processing Services

This directory contains background services for processing transcriptions and generating summaries for the MAB (Mary Alice Bailey) wartime letters project.

## Services

### 1. Background Transcriber (`background-transcriber.js`)
- Continuously processes pending PDF files for transcription
- Uses OpenAI service for accurate transcription
- Processes files in batches of 20 with proper rate limiting
- Automatically handles retries and error recovery

### 2. Background Summarizer (`background-summarizer.js`)
- Continuously generates summaries for completed documents
- Uses OpenAI GPT models for intelligent summarization
- Processes documents in batches of 10 with appropriate delays
- Skips documents that already have summaries

## Quick Start

### Prerequisites
```bash
# Install PM2 globally if not already installed
npm install -g pm2

# Ensure all dependencies are installed
npm install
```

### Start Services
```bash
# Start both services
./monitor.sh start-both

# Or start individually
./monitor.sh start-transcriber
./monitor.sh start-summarizer
```

### Monitor Progress
```bash
# Show status and recent activity
./monitor.sh status

# Follow live logs
./monitor.sh logs-transcriber
./monitor.sh logs-summarizer

# Show PM2 dashboard
pm2 monit
```

### Stop Services
```bash
# Stop both services
./monitor.sh stop-both

# Or stop individually
./monitor.sh stop-transcriber
./monitor.sh stop-summarizer
```

## Log Files

### Application Logs
- `transcription-background.log` - Detailed transcriber activity
- `summarizer-background.log` - Detailed summarizer activity

### PM2 Logs (in `logs/` directory)
- `transcriber-combined.log` - Combined transcriber output
- `transcriber-out.log` - Standard output
- `transcriber-error.log` - Error output
- `summarizer-combined.log` - Combined summarizer output
- `summarizer-out.log` - Standard output  
- `summarizer-error.log` - Error output

## Configuration

### Transcriber Settings
- **Service**: OpenAI
- **Batch Size**: 20 files
- **Delay Between Batches**: 30 seconds
- **Delay Between Files**: 6 seconds
- **Target**: `wartime_letters` type documents

### Summarizer Settings
- **Service**: OpenAI GPT
- **Batch Size**: 10 documents
- **Delay Between Batches**: 45 seconds
- **Delay Between Summaries**: 8 seconds
- **Target**: Documents with completed transcriptions

## Service Management Commands

```bash
# Monitor script commands
./monitor.sh status              # Show service status and statistics
./monitor.sh start-both          # Start both services
./monitor.sh stop-both           # Stop both services
./monitor.sh restart-both        # Restart both services
./monitor.sh logs-transcriber    # Follow transcriber logs
./monitor.sh logs-summarizer     # Follow summarizer logs

# Direct PM2 commands
pm2 list                         # List all PM2 processes
pm2 logs mab-transcriber         # Show transcriber logs
pm2 logs mab-summarizer          # Show summarizer logs
pm2 stop mab-transcriber         # Stop transcriber
pm2 restart mab-transcriber      # Restart transcriber
pm2 delete mab-transcriber       # Remove from PM2
```

## Troubleshooting

### Common Issues

1. **Services not starting**
   - Check PM2 is installed: `pm2 --version`
   - Verify file paths in `ecosystem.config.json`
   - Check log files for error details

2. **API Rate Limiting**
   - Services include built-in rate limiting
   - Increase delays in service files if needed
   - Check OpenAI API quota and billing

3. **Database Connection Issues**
   - Ensure `mab.sqlite3` exists and is accessible
   - Check database file permissions
   - Verify file paths are correct after directory moves

4. **Out of Memory**
   - Services restart automatically at 1GB memory usage
   - Monitor with `pm2 monit`
   - Adjust `max_memory_restart` in ecosystem config if needed

### Service Recovery
- Services automatically restart on crashes
- Graceful shutdown handles SIGINT/SIGTERM signals
- Progress is logged continuously for recovery tracking

## Performance Expectations

### Transcription Service
- **Rate**: ~3-4 files per minute (with rate limiting)
- **API Calls**: ~1 per file
- **Typical Session**: 100 files = ~25-30 minutes

### Summarizer Service  
- **Rate**: ~4-5 documents per minute (with rate limiting)
- **API Calls**: ~1 per document
- **Typical Session**: 50 documents = ~12-15 minutes

## Statistics Monitoring

The monitor script provides real-time statistics including:
- Total files vs completed transcriptions
- Documents with summaries vs total documents
- Recent activity from both services
- PM2 process status and resource usage

## Auto-Completion Detection

Both services automatically detect when all work is complete:
- **Transcriber**: Stops when no pending files remain
- **Summarizer**: Stops when no documents need summaries

Services can be safely restarted at any time - they will resume from where they left off.
