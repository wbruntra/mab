const fs = require('fs')
const path = require('path')
const UnifiedTranscriptionManager = require('./unified-transcriber.js')

class BackgroundTranscriber {
  constructor() {
    this.manager = new UnifiedTranscriptionManager('openai')
    this.logFile = path.join(__dirname, 'transcription-background.log')
    this.isRunning = false
    this.batchSize = 20
    this.delayBetweenBatches = 30000 // 30 seconds
    this.delayBetweenFiles = 6000 // 6 seconds
    this.maxRetries = 3
    this.stats = {
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      sessionStarted: new Date(),
      lastBatchTime: null,
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
      await this.manager.init()
      this.log('🚀 Background transcriber initialized successfully')
      this.log(`📊 Using service: openai`)
      this.log(`📦 Batch size: ${this.batchSize}`)
      this.log(`⏱️  Delay between batches: ${this.delayBetweenBatches / 1000}s`)
      this.log(`⏱️  Delay between files: ${this.delayBetweenFiles / 1000}s`)
      return true
    } catch (error) {
      this.log(`❌ Initialization failed: ${error.message}`)
      throw error
    }
  }

  async getInitialStats() {
    try {
      const stats = await this.manager.getStats()
      this.log(`📈 Initial statistics:`)
      this.log(`   Total files: ${stats.total}`)
      this.log(`   Pending: ${stats.pending}`)
      this.log(`   Completed: ${stats.completed}`)
      this.log(`   Failed: ${stats.failed}`)
      return stats
    } catch (error) {
      this.log(`❌ Error getting initial stats: ${error.message}`)
      return null
    }
  }

  async processBatch() {
    try {
      this.log(`🔍 Looking for ${this.batchSize} pending files...`)

      const files = await this.manager.getPendingFiles(this.batchSize, 'wartime_letters')

      if (files.length === 0) {
        this.log(`✅ No more pending files found. All transcriptions complete!`)
        return { completed: true, processed: 0 }
      }

      this.log(`📋 Found ${files.length} pending files to process`)
      this.stats.lastBatchTime = new Date()

      // Process each file individually with proper error handling
      let batchSuccessful = 0
      let batchFailed = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        try {
          this.log(
            `📄 Processing ${i + 1}/${files.length}: ${file.document_key} part ${file.part_number}`,
          )

          const result = await this.manager.transcribeFile(
            file.file_path,
            file.id,
            file.document_key,
          )

          if (result.success) {
            batchSuccessful++
            this.stats.totalSuccessful++
            this.log(`✅ Success: ${result.characters} characters transcribed`)
          } else {
            batchFailed++
            this.stats.totalFailed++
            this.log(`❌ Failed: ${result.error}`)
          }
        } catch (error) {
          batchFailed++
          this.stats.totalFailed++
          this.log(`❌ Exception processing file ${file.id}: ${error.message}`)
        }

        this.stats.totalProcessed++

        // Progress update
        const totalProgress = this.stats.totalProcessed
        this.log(
          `📊 Session progress: ${totalProgress} total (${this.stats.totalSuccessful} success, ${this.stats.totalFailed} failed)`,
        )

        // Delay between files (except for the last one)
        if (i < files.length - 1) {
          this.log(`⏳ Waiting ${this.delayBetweenFiles / 1000}s before next file...`)
          await new Promise((resolve) => setTimeout(resolve, this.delayBetweenFiles))
        }
      }

      this.log(`🎯 Batch complete: ${batchSuccessful} successful, ${batchFailed} failed`)

      return {
        completed: false,
        processed: files.length,
        successful: batchSuccessful,
        failed: batchFailed,
      }
    } catch (error) {
      this.log(`❌ Error processing batch: ${error.message}`)
      return { completed: false, processed: 0, error: error.message }
    }
  }

  async run() {
    if (this.isRunning) {
      this.log(`⚠️  Background transcriber is already running`)
      return
    }

    this.isRunning = true
    this.log(`🎬 Starting background transcription service`)

    try {
      // Get initial statistics
      await this.getInitialStats()

      let batchCount = 0

      while (this.isRunning) {
        batchCount++
        this.log(`\n🚀 Starting batch #${batchCount}`)

        const result = await this.processBatch()

        if (result.completed) {
          this.log(`🎉 All transcriptions completed! Session finished.`)
          break
        }

        if (result.error) {
          this.log(`⚠️  Batch error occurred, waiting before retry...`)
        } else {
          this.log(`✅ Batch #${batchCount} completed`)
        }

        // Get updated stats
        const currentStats = await this.manager.getStats()
        if (currentStats) {
          this.log(
            `📈 Current statistics: ${currentStats.completed} completed, ${currentStats.pending} pending, ${currentStats.failed} failed`,
          )
        }

        // Wait before next batch
        if (this.isRunning) {
          this.log(`⏳ Waiting ${this.delayBetweenBatches / 1000}s before next batch...`)
          await new Promise((resolve) => setTimeout(resolve, this.delayBetweenBatches))
        }
      }
    } catch (error) {
      this.log(`💥 Fatal error in background transcriber: ${error.message}`)
    } finally {
      this.isRunning = false
      await this.cleanup()
    }
  }

  async stop() {
    this.log(`🛑 Stopping background transcriber...`)
    this.isRunning = false
  }

  async cleanup() {
    try {
      this.log(`🧹 Cleaning up background transcriber...`)

      // Log final statistics
      const sessionDuration = (new Date() - this.stats.sessionStarted) / 1000
      this.log(`📊 Session summary:`)
      this.log(`   Duration: ${Math.round(sessionDuration)}s`)
      this.log(`   Total processed: ${this.stats.totalProcessed}`)
      this.log(`   Total successful: ${this.stats.totalSuccessful}`)
      this.log(`   Total failed: ${this.stats.totalFailed}`)
      this.log(
        `   Success rate: ${this.stats.totalProcessed > 0 ? Math.round((this.stats.totalSuccessful / this.stats.totalProcessed) * 100) : 0}%`,
      )

      await this.manager.close()
      this.log(`✅ Background transcriber stopped cleanly`)
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
  const transcriber = new BackgroundTranscriber()

  try {
    // Setup signal handlers for graceful shutdown
    transcriber.setupSignalHandlers()

    // Initialize and run
    await transcriber.init()
    await transcriber.run()
  } catch (error) {
    console.error('Failed to start background transcriber:', error.message)
    process.exit(1)
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main()
}

module.exports = BackgroundTranscriber
