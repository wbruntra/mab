#!/bin/bash

# MAB Background Services Monitor
# Usage: ./monitor.sh [transcriber|summarizer|both|status]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"

function show_usage() {
    echo "MAB Background Services Monitor"
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start-transcriber  Start the background transcriber"
    echo "  start-summarizer   Start the background summarizer"
    echo "  start-both         Start both services"
    echo "  status             Show status of both services"
    echo "  logs-transcriber   Show transcriber logs (live)"
    echo "  logs-summarizer    Show summarizer logs (live)"
    echo "  stop-transcriber   Stop the background transcriber"
    echo "  stop-summarizer    Stop the background summarizer"
    echo "  stop-both          Stop both services"
    echo "  restart-both       Restart both services"
    echo ""
    echo "Log files are stored in: $LOG_DIR"
}

function check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo "❌ PM2 is not installed. Please install it first:"
        echo "   npm install -g pm2"
        exit 1
    fi
}

function show_status() {
    echo "📊 MAB Background Services Status"
    echo "=================================="
    pm2 list | grep -E "(mab-transcriber|mab-summarizer|Process)"
    echo ""
    
    # Show recent transcriber activity
    if [[ -f "$SCRIPT_DIR/transcription-background.log" ]]; then
        echo "📄 Recent Transcriber Activity:"
        tail -3 "$SCRIPT_DIR/transcription-background.log" 2>/dev/null || echo "   No activity yet"
        echo ""
    fi
    
    # Show recent summarizer activity
    if [[ -f "$SCRIPT_DIR/summarizer-background.log" ]]; then
        echo "📝 Recent Summarizer Activity:"
        tail -3 "$SCRIPT_DIR/summarizer-background.log" 2>/dev/null || echo "   No activity yet"
        echo ""
    fi
    
    # Show file counts
    echo "📈 Quick Statistics:"
    if command -v sqlite3 &> /dev/null && [[ -f "$SCRIPT_DIR/mab.sqlite3" ]]; then
        cd "$SCRIPT_DIR"
        TOTAL_FILES=$(sqlite3 mab.sqlite3 "SELECT COUNT(*) FROM document_files;")
        COMPLETED_FILES=$(sqlite3 mab.sqlite3 "SELECT COUNT(*) FROM document_files WHERE transcription_status = 'completed';")
        PENDING_FILES=$(sqlite3 mab.sqlite3 "SELECT COUNT(*) FROM document_files WHERE transcription_status = 'pending';")
        TOTAL_DOCS=$(sqlite3 mab.sqlite3 "SELECT COUNT(*) FROM documents;")
        DOCS_WITH_SUMMARY=$(sqlite3 mab.sqlite3 "SELECT COUNT(*) FROM documents WHERE summary IS NOT NULL;")
        
        echo "   Transcriptions: $COMPLETED_FILES/$TOTAL_FILES completed ($PENDING_FILES pending)"
        echo "   Summaries: $DOCS_WITH_SUMMARY/$TOTAL_DOCS documents"
    else
        echo "   Database not accessible for statistics"
    fi
}

function start_transcriber() {
    echo "🚀 Starting background transcriber..."
    cd "$SCRIPT_DIR"
    pm2 start ecosystem.config.json --only mab-transcriber
    echo "✅ Transcriber started. Monitor with: pm2 logs mab-transcriber"
}

function start_summarizer() {
    echo "🚀 Starting background summarizer..."
    cd "$SCRIPT_DIR"
    pm2 start ecosystem.config.json --only mab-summarizer
    echo "✅ Summarizer started. Monitor with: pm2 logs mab-summarizer"
}

function start_both() {
    echo "🚀 Starting both background services..."
    cd "$SCRIPT_DIR"
    pm2 start ecosystem.config.json
    echo "✅ Both services started."
    show_status
}

function stop_transcriber() {
    echo "🛑 Stopping background transcriber..."
    pm2 stop mab-transcriber
    echo "✅ Transcriber stopped."
}

function stop_summarizer() {
    echo "🛑 Stopping background summarizer..."
    pm2 stop mab-summarizer
    echo "✅ Summarizer stopped."
}

function stop_both() {
    echo "🛑 Stopping both background services..."
    pm2 stop mab-transcriber mab-summarizer
    echo "✅ Both services stopped."
}

function restart_both() {
    echo "🔄 Restarting both background services..."
    pm2 restart mab-transcriber mab-summarizer
    echo "✅ Both services restarted."
    show_status
}

function logs_transcriber() {
    echo "📄 Following transcriber logs (Ctrl+C to exit)..."
    pm2 logs mab-transcriber --lines 50
}

function logs_summarizer() {
    echo "📝 Following summarizer logs (Ctrl+C to exit)..."
    pm2 logs mab-summarizer --lines 50
}

# Main script logic
check_pm2

case "${1:-status}" in
    "start-transcriber")
        start_transcriber
        ;;
    "start-summarizer")
        start_summarizer
        ;;
    "start-both")
        start_both
        ;;
    "status")
        show_status
        ;;
    "logs-transcriber")
        logs_transcriber
        ;;
    "logs-summarizer")
        logs_summarizer
        ;;
    "stop-transcriber")
        stop_transcriber
        ;;
    "stop-summarizer")
        stop_summarizer
        ;;
    "stop-both")
        stop_both
        ;;
    "restart-both")
        restart_both
        ;;
    "help"|"-h"|"--help")
        show_usage
        ;;
    *)
        echo "❌ Unknown command: $1"
        show_usage
        exit 1
        ;;
esac
