const { GoogleGenAI } = require("@google/genai")
const fs = require('fs')
const path = require('path')
const secrets = require('./secrets.js')
const db = require('./db_connection.js')

class GeminiTranscriptionManager {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: secrets.GEMINI_API_KEY })
    this.db = db
  }

  // Test connection
  async init() {
    try {
      await this.db.raw('SELECT 1')
      console.log('Connected to database')
      return true
    } catch (error) {
      console.error('Database connection failed:', error.message)
      throw error
    }
  }

  // Transcribe a single PDF file
  async transcribeFile(filePath, fileId = null, documentKey = null) {
    try {
      console.log(`📄 Transcribing: ${path.basename(filePath)}`)
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`)
      }

      // Read and encode PDF
      const pdfBuffer = fs.readFileSync(filePath)
      const base64Data = pdfBuffer.toString('base64')

      // Prepare content for Gemini
      const contents = [
        { 
          text: `Please transcribe all the text content from this wartime letter/document page. 

INSTRUCTIONS:
- Preserve the original formatting, line breaks, and structure as much as possible
- If there are any handwritten portions that are difficult to read, indicate with [unclear] or your best interpretation in brackets
- Include any dates, addresses, signatures, and other details visible in the document
- Return only the transcribed text without any additional commentary or formatting markers
- If the page appears to be blank or contains no readable text, respond with "[blank page]"

Please provide the transcription as plain text.`
        },
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Data
          }
        }
      ]

      // Generate transcription
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents
      })

      const transcription = response.text.trim()
      console.log(`✅ Transcribed ${transcription.length} characters`)

      // If file ID provided, update database
      if (fileId) {
        const metadata = {
          service: 'gemini',
          model: 'gemini-2.5-flash',
          transcribed_at: new Date().toISOString(),
          characters: transcription.length
        }

        await this.db('document_files')
          .where('id', fileId)
          .update({
            transcription: transcription,
            transcription_status: 'completed',
            transcription_metadata: JSON.stringify(metadata),
            updated_at: new Date()
          })

        console.log(`💾 Updated database for file ID ${fileId}`)
      }

      return {
        success: true,
        transcription: transcription,
        characters: transcription.length,
        fileId: fileId,
        documentKey: documentKey
      }

    } catch (error) {
      console.error(`❌ Error transcribing ${path.basename(filePath)}:`, error.message)
      
      // Check if this is a retryable error (rate limit/quota)
      const isRetryableError = error.message && (
        error.message.includes('RESOURCE_EXHAUSTED') ||
        error.message.includes('429') ||
        error.message.includes('quota') ||
        error.message.includes('rate limit')
      )
      
      // Mark as failed in database if file ID provided
      if (fileId) {
        await this.db('document_files')
          .where('id', fileId)
          .update({
            transcription_status: isRetryableError ? 'pending' : 'failed',
            transcription_metadata: JSON.stringify({
              error: error.message,
              failed_at: new Date().toISOString(),
              service: 'gemini',
              retryable: isRetryableError
            }),
            updated_at: new Date()
          })
      }

      return {
        success: false,
        error: error.message,
        fileId: fileId,
        documentKey: documentKey
      }
    }
  }

  // Batch transcribe multiple files
  async transcribeBatch(files, batchSize = 5) {
    console.log(`🚀 Starting batch transcription of ${files.length} files`)
    console.log(`📦 Processing in batches of ${batchSize} files`)
    
    let processed = 0
    let successful = 0
    let failed = 0
    const results = []

    // Process files in batches to avoid rate limiting
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      console.log(`\n📋 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(files.length/batchSize)} (${batch.length} files)`)

      // Process batch with delay between files
      for (const file of batch) {
        const result = await this.transcribeFile(
          file.file_path, 
          file.id, 
          file.document_key
        )
        
        results.push(result)
        processed++

        if (result.success) {
          successful++
        } else {
          failed++
        }

        console.log(`📊 Progress: ${processed}/${files.length} (${successful} success, ${failed} failed)`)
        
        // Small delay to avoid hitting rate limits
        if (processed < files.length) {
          await new Promise(resolve => setTimeout(resolve, 6000)) // 6 second delay
        }
      }

      // Longer delay between batches
      if (i + batchSize < files.length) {
        console.log('⏳ Waiting 6 seconds before next batch...')
        await new Promise(resolve => setTimeout(resolve, 6000)) // 6 second delay
      }
    }

    console.log(`\n🎉 Batch transcription complete!`)
    console.log(`📊 Final results: ${successful} successful, ${failed} failed out of ${processed} total`)

    return {
      processed,
      successful,
      failed,
      results
    }
  }

  // Get pending files for transcription
  async getPendingFiles(limit = 50, typeFilter = null) {
    let query = this.db('document_files as df')
      .join('documents as d', 'df.document_id', 'd.id')
      .select(
        'df.id', 
        'df.file_path', 
        'df.part_number', 
        'd.document_key', 
        'd.type', 
        'd.date',
        'df.transcription_status'
      )
      .where('df.transcription_status', 'pending')

    if (typeFilter) {
      query = query.where('d.type', typeFilter)
    }

    query = query.orderBy('d.date').limit(limit)

    return await query
  }

  // Get transcription statistics
  async getStats() {
    const stats = await this.db('document_files')
      .select('transcription_status')
      .count('* as count')
      .groupBy('transcription_status')

    const total = await this.db('document_files').count('* as count').first()
    
    const result = {
      total: total.count,
      pending: 0,
      completed: 0,
      failed: 0
    }

    stats.forEach(stat => {
      result[stat.transcription_status] = parseInt(stat.count)
    })

    return result
  }

  // Transcribe files from a specific folder
  async transcribeFolder(folderPath, filePattern = '*.pdf') {
    try {
      console.log(`📁 Scanning folder: ${folderPath}`)
      
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder not found: ${folderPath}`)
      }

      // Get all PDF files in folder
      const files = fs.readdirSync(folderPath)
        .filter(file => file.toLowerCase().endsWith('.pdf'))
        .map(file => ({
          name: file,
          path: path.join(folderPath, file)
        }))

      if (files.length === 0) {
        console.log('No PDF files found in folder')
        return { processed: 0, successful: 0, failed: 0, results: [] }
      }

      console.log(`Found ${files.length} PDF files`)

      const results = []
      let successful = 0
      let failed = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        console.log(`\n📄 Processing ${i + 1}/${files.length}: ${file.name}`)
        
        const result = await this.transcribeFile(file.path, null, file.name)
        results.push({
          ...result,
          fileName: file.name,
          filePath: file.path
        })

        if (result.success) {
          successful++
          
          // Save transcription to text file
          const outputDir = path.join(folderPath, 'transcriptions')
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
          }
          
          const outputFile = path.join(outputDir, file.name.replace('.pdf', '.txt'))
          fs.writeFileSync(outputFile, result.transcription)
          console.log(`💾 Saved transcription: ${outputFile}`)
        } else {
          failed++
        }

        // Rate limiting delay
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
        }
      }

      console.log(`\n🎉 Folder transcription complete!`)
      console.log(`📊 Results: ${successful} successful, ${failed} failed out of ${files.length} total`)

      return {
        processed: files.length,
        successful,
        failed,
        results
      }

    } catch (error) {
      console.error('❌ Error transcribing folder:', error.message)
      throw error
    }
  }

  async close() {
    await this.db.destroy()
  }
}

// CLI interface
async function main() {
  const manager = new GeminiTranscriptionManager()
  await manager.init()

  const command = process.argv[2]
  const arg1 = process.argv[3]
  const arg2 = process.argv[4]

  try {
    switch (command) {
      case 'stats':
        const stats = await manager.getStats()
        console.log('\nGemini Transcription Statistics:')
        console.log(`Total files: ${stats.total}`)
        console.log(`Pending: ${stats.pending}`)
        console.log(`Completed: ${stats.completed}`)
        console.log(`Failed: ${stats.failed}`)
        break

      case 'transcribe-file':
        if (!arg1) {
          console.log('Usage: node gemini-transcriber.js transcribe-file <file_path>')
          break
        }
        const result = await manager.transcribeFile(arg1)
        if (result.success) {
          console.log('\n--- Transcription ---')
          console.log(result.transcription)
        }
        break

      case 'transcribe-folder':
        if (!arg1) {
          console.log('Usage: node gemini-transcriber.js transcribe-folder <folder_path>')
          break
        }
        await manager.transcribeFolder(arg1)
        break

      case 'transcribe-batch':
        const batchSize = arg1 ? parseInt(arg1) : 10
        const typeFilter = arg2 || 'wartime_letters'
        
        console.log(`Getting ${batchSize} pending ${typeFilter} files...`)
        const files = await manager.getPendingFiles(batchSize, typeFilter)
        
        if (files.length === 0) {
          console.log('No pending files found')
          break
        }

        await manager.transcribeBatch(files, 5) // Process 5 at a time
        break

      default:
        console.log('Gemini PDF Transcriber')
        console.log('Usage:')
        console.log('  node gemini-transcriber.js stats')
        console.log('  node gemini-transcriber.js transcribe-file <file_path>')
        console.log('  node gemini-transcriber.js transcribe-folder <folder_path>')
        console.log('  node gemini-transcriber.js transcribe-batch [batch_size] [type_filter]')
        console.log('')
        console.log('Examples:')
        console.log('  node gemini-transcriber.js transcribe-folder ./poep-wartime')
        console.log('  node gemini-transcriber.js transcribe-batch 10 wartime_letters')
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await manager.close()
  }
}

if (require.main === module) {
  main()
}

module.exports = GeminiTranscriptionManager
