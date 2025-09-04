const fs = require('fs')
const path = require('path')
const DocumentSummarizer = require('./document-summarizer.js')

class BackgroundSummarizer {
  constructor() {
    this.summarizer = new DocumentSummarizer()
    this.logFile = path.join(__dirname, 'summarizer-background.log')
    this.isRunning = false
    this.batchSize = 10
    this.delayBetweenBatches = 45000 // 45 seconds (longer for AI API calls)
    this.delayBetweenSummaries = 8000 // 8 seconds between summaries
    this.maxRetries = 3
    this.stats = {
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      totalSkipped: 0,
      sessionStarted: new Date(),
      lastBatchTime: null
    }
  }

  log(message) {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}`
    console.log(logMessage)
    
    // Append to log file
    fs.appendFileSync(this.logFile, logMessage + '\n')
  }

  async init() {
    try {
      await this.summarizer.init()
      this.log('🚀 Background summarizer initialized successfully')
      this.log(`📊 Using OpenAI for summaries`)
      this.log(`📦 Batch size: ${this.batchSize}`)
      this.log(`⏱️  Delay between batches: ${this.delayBetweenBatches / 1000}s`)
      this.log(`⏱️  Delay between summaries: ${this.delayBetweenSummaries / 1000}s`)
      return true
    } catch (error) {
      this.log(`❌ Initialization failed: ${error.message}`)
      throw error
    }
  }

  async getInitialStats() {
    try {
      const stats = await this.summarizer.getStats()
      this.log(`📈 Initial statistics:`)
      this.log(`   Total documents: ${stats.total_documents}`)
      this.log(`   Documents with summary: ${stats.documents_with_summary}`)
      this.log(`   Documents without summary: ${stats.documents_without_summary}`)
      this.log(`   Documents ready for summary: ${stats.documents_ready_for_summary}`)
      return stats
    } catch (error) {
      this.log(`❌ Error getting initial stats: ${error.message}`)
      return null
    }
  }

  async processBatch() {
    try {
      this.log(`🔍 Looking for ${this.batchSize} documents ready for summarization...`)
      
      const documents = await this.summarizer.getDocumentsReadyForSummary(this.batchSize, false)
      
      if (documents.length === 0) {
        this.log(`✅ No more documents ready for summarization. All summaries complete!`)
        return { completed: true, processed: 0 }
      }

      this.log(`📋 Found ${documents.length} documents ready for summarization`)
      this.stats.lastBatchTime = new Date()

      // Process each document individually with proper error handling
      let batchSuccessful = 0
      let batchFailed = 0
      let batchSkipped = 0

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i]
        
        try {
          this.log(`📄 Processing ${i + 1}/${documents.length}: ${doc.document_key} (${doc.completed_files}/${doc.total_files} files)`)
          
          const result = await this.summarizer.generateSummary(doc.id)

          if (result.success) {
            if (result.alreadyExists) {
              batchSkipped++
              this.stats.totalSkipped++
              this.log(`⏭️  Skipped: summary already exists`)
            } else {
              batchSuccessful++
              this.stats.totalSuccessful++
              this.log(`✅ Success: ${result.summary.length} character summary generated`)
              this.log(`📝 Summary preview: ${result.summary.substring(0, 100)}...`)
            }
          } else {
            batchFailed++
            this.stats.totalFailed++
            this.log(`❌ Failed: ${result.error}`)
          }

        } catch (error) {
          batchFailed++
          this.stats.totalFailed++
          this.log(`❌ Exception processing document ${doc.id}: ${error.message}`)
        }

        this.stats.totalProcessed++

        // Progress update
        const totalProgress = this.stats.totalProcessed
        this.log(`📊 Session progress: ${totalProgress} total (${this.stats.totalSuccessful} success, ${this.stats.totalFailed} failed, ${this.stats.totalSkipped} skipped)`)

        // Delay between summaries (except for the last one)
        if (i < documents.length - 1) {
          this.log(`⏳ Waiting ${this.delayBetweenSummaries / 1000}s before next summary...`)
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenSummaries))
        }
      }

      this.log(`🎯 Batch complete: ${batchSuccessful} successful, ${batchFailed} failed, ${batchSkipped} skipped`)
      
      return { 
        completed: false, 
        processed: documents.length,
        successful: batchSuccessful,
        failed: batchFailed,
        skipped: batchSkipped
      }

    } catch (error) {
      this.log(`❌ Error processing batch: ${error.message}`)
      return { completed: false, processed: 0, error: error.message }
    }
  }

  async run() {
    if (this.isRunning) {
      this.log(`⚠️  Background summarizer is already running`)
      return
    }

    this.isRunning = true
    this.log(`🎬 Starting background summarization service`)

    try {
      // Get initial statistics
      await this.getInitialStats()

      let batchCount = 0
      
      while (this.isRunning) {
        batchCount++
        this.log(`\n🚀 Starting batch #${batchCount}`)

        const result = await this.processBatch()

        if (result.completed) {
          this.log(`🎉 All summaries completed! Session finished.`)
          break
        }

        if (result.error) {
          this.log(`⚠️  Batch error occurred, waiting before retry...`)
        } else {
          this.log(`✅ Batch #${batchCount} completed`)
        }

        // Get updated stats
        const currentStats = await this.summarizer.getStats()
        if (currentStats) {
          this.log(`📈 Current statistics: ${currentStats.documents_with_summary} with summaries, ${currentStats.documents_ready_for_summary} ready for summary`)
        }

        // Wait before next batch
        if (this.isRunning) {
          this.log(`⏳ Waiting ${this.delayBetweenBatches / 1000}s before next batch...`)
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches))
        }
      }

    } catch (error) {
      this.log(`💥 Fatal error in background summarizer: ${error.message}`)
    } finally {
      this.isRunning = false
      await this.cleanup()
    }
  }

  async stop() {
    this.log(`🛑 Stopping background summarizer...`)
    this.isRunning = false
  }

  async cleanup() {
    try {
      this.log(`🧹 Cleaning up background summarizer...`)
      
      // Log final statistics
      const sessionDuration = (new Date() - this.stats.sessionStarted) / 1000
      this.log(`📊 Session summary:`)
      this.log(`   Duration: ${Math.round(sessionDuration)}s`)
      this.log(`   Total processed: ${this.stats.totalProcessed}`)
      this.log(`   Total successful: ${this.stats.totalSuccessful}`)
      this.log(`   Total failed: ${this.stats.totalFailed}`)
      this.log(`   Total skipped: ${this.stats.totalSkipped}`)
      this.log(`   Success rate: ${this.stats.totalProcessed > 0 ? Math.round((this.stats.totalSuccessful / this.stats.totalProcessed) * 100) : 0}%`)

      await this.summarizer.close()
      this.log(`✅ Background summarizer stopped cleanly`)
    } catch (error) {
      this.log(`❌ Error during cleanup: ${error.message}`)
    }
  }

  // Handle graceful shutdown
  setupSignalHandlers() {
    process.on('SIGINT', async () => {
      this.log(`📨 Received SIGINT, gracefully shutting down...`)
      await this.stop()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      this.log(`📨 Received SIGTERM, gracefully shutting down...`)
      await this.stop()
      process.exit(0)
    })

    process.on('uncaughtException', (error) => {
      this.log(`💥 Uncaught exception: ${error.message}`)
      this.log(`${error.stack}`)
      process.exit(1)
    })
  }
}

// Main execution
async function main() {
  const summarizer = new BackgroundSummarizer()
  
  try {
    // Setup signal handlers for graceful shutdown
    summarizer.setupSignalHandlers()
    
    // Initialize and run
    await summarizer.init()
    await summarizer.run()
    
  } catch (error) {
    console.error('Failed to start background summarizer:', error.message)
    process.exit(1)
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main()
}

module.exports = BackgroundSummarizer
