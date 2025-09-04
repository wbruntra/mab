const knex = require('knex')
const config = require('./knexfile.js')
const fs = require('fs')
const path = require('path')
const OpenAI = require('openai')
const secrets = require('./secrets')

class TranscriptionManager {
  constructor(environment = 'development') {
    this.db = knex(config[environment])
    this.openai = new OpenAI({
      apiKey: secrets.OPENAI_API_KEY,
    })
  }

  // Test database connection
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

  // Scan directories and populate database with document information
  async scanAndPopulateDocuments() {
    const years = ['1943', '1944', '1945']
    const documents = new Map()

    for (const year of years) {
      const originalsDir = path.join(__dirname, `wartime-${year}`, 'originals')
      
      if (!fs.existsSync(originalsDir)) {
        console.log(`Directory not found: ${originalsDir}`)
        continue
      }

      const files = fs.readdirSync(originalsDir)
      
      for (const file of files) {
        if (!file.endsWith('.pdf')) continue

        // Parse filename: MAR_wartime_letters_430216-1.pdf
        const match = file.match(/^([A-Z]+)_([a-z_]+)_(\d{6})-?(\d*)\.pdf$/)
        if (!match) {
          console.log(`Skipping file with unrecognized format: ${file}`)
          continue
        }

        const [, prefix, type, dateCode, partNum] = match
        const date = `19${dateCode.substring(0, 2)}-${dateCode.substring(2, 4)}-${dateCode.substring(4, 6)}`
        const documentKey = `${prefix}_${type}_${dateCode}`
        
        if (!documents.has(documentKey)) {
          documents.set(documentKey, {
            document_key: documentKey,
            date: date,
            type: type,
            year: parseInt(`19${dateCode.substring(0, 2)}`),
            files: [],
            source_files: []
          })
        }

        const doc = documents.get(documentKey)
        const filePath = path.join(originalsDir, file)
        const stats = fs.statSync(filePath)
        
        doc.files.push({
          file_path: filePath,
          part_number: partNum ? parseInt(partNum) : 1,
          file_size: stats.size
        })
        doc.source_files.push(filePath)
      }
    }

    // Insert documents into database using Knex
    for (const [key, doc] of documents) {
      try {
        // First try to find existing document
        const existingDoc = await this.db('documents')
          .where('document_key', doc.document_key)
          .first()

        let documentId
        if (existingDoc) {
          // Update existing document
          await this.db('documents')
            .where('document_key', doc.document_key)
            .update({
              date: doc.date,
              type: doc.type,
              year: doc.year,
              source_files: JSON.stringify(doc.source_files),
              updated_at: new Date()
            })
          documentId = existingDoc.id
        } else {
          // Insert new document
          const [newId] = await this.db('documents').insert({
            document_key: doc.document_key,
            date: doc.date,
            type: doc.type,
            year: doc.year,
            source_files: JSON.stringify(doc.source_files),
            transcription_status: 'pending'
          })
          documentId = newId
        }

        // Clear existing files for this document
        await this.db('document_files').where('document_id', documentId).del()
        
        // Insert files for this document
        if (doc.files.length > 0) {
          await this.db('document_files').insert(
            doc.files.map(file => ({
              document_id: documentId,
              file_path: file.file_path,
              part_number: file.part_number,
              file_size: file.file_size
            }))
          )
        }
      } catch (error) {
        console.error(`Error processing document ${doc.document_key}:`, error.message)
      }
    }

    console.log(`Populated database with ${documents.size} documents`)
    return documents.size
  }

    // Get pending files for transcription with optional filtering
  async getPendingFiles(limit = 10, typeFilter = null) {
    let query = this.db('document_files as df')
      .join('documents as d', 'df.document_id', 'd.id')
      .select('df.id', 'df.file_path', 'df.part_number', 'd.document_key', 'd.type', 'df.transcription_status')
      .where('df.transcription_status', 'pending')

    if (typeFilter) {
      query = query.where('d.type', typeFilter)
    }

    query = query.orderBy('d.date').limit(limit)

    return await query
  }

  // Create batch transcription job
  async createTranscriptionBatch(files, batchSize = 50) {
    try {
      console.log(`Creating batch transcription job for ${files.length} files`)
      
      // Generate transcription prompt for a file
      const generateTranscriptionPrompt = (file) => {
        const fileInfo = `${file.document_key} (${file.date}) - Part ${file.part_number}`
        return `Please transcribe all the text content from this wartime letter/document page. 

Document: ${fileInfo}

INSTRUCTIONS:
- Preserve the original formatting, line breaks, and structure as much as possible
- If there are any handwritten portions that are difficult to read, indicate with [unclear] or your best interpretation in brackets
- Include any dates, addresses, signatures, and other details visible in the document
- Return only the transcribed text without any additional commentary or formatting markers
- If the page appears to be blank or contains no readable text, respond with "[blank page]"

Please provide the transcription as plain text.`
      }

      // Create JSONL content - one request per file
      const jsonlLines = files.map(file => {
        // Read and encode the PDF file
        const pdfBase64 = fs.readFileSync(file.file_path).toString('base64')
        
        return JSON.stringify({
          custom_id: `transcribe-file-${file.id}`,
          method: 'POST',
          url: '/v1/responses',
          body: {
            model: 'gpt-5',
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_file',
                    filename: path.basename(file.file_path),
                    file_data: `data:application/pdf;base64,${pdfBase64}`
                  },
                  {
                    type: 'input_text',
                    text: generateTranscriptionPrompt(file)
                  }
                ]
              }
            ]
          }
        })
      })
      
      // Write to temporary file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `transcription-batch-${timestamp}.jsonl`
      const filepath = path.join('.', filename)
      
      fs.writeFileSync(filepath, jsonlLines.join('\n'))
      console.log(`📁 Created transcription batch file: ${filename}`)
      
      // Upload file to OpenAI
      const file = await this.openai.files.create({
        file: fs.createReadStream(filepath),
        purpose: 'batch'
      })
      
      console.log(`⬆️  Uploaded file: ${file.id}`)
      
      // Create batch job
      const batch = await this.openai.batches.create({
        input_file_id: file.id,
        endpoint: '/v1/responses',
        completion_window: '24h'
      })
      
      console.log(`🚀 Created batch: ${batch.id}`)
      
      // Save to transcription_batches table (create if needed)
      await this.ensureTranscriptionBatchTable()
      await this.db('transcription_batches').insert({
        batch_id: batch.id,
        status: batch.status,
        input_file_id: file.id,
        request_count: files.length,
        description: `PDF transcription batch - ${files.length} files`,
        file_ids: JSON.stringify(files.map(f => f.id))
      })

      // Mark files as submitted for transcription
      const fileIds = files.map(f => f.id)
      await this.db('document_files')
        .whereIn('id', fileIds)
        .update({
          transcription_status: 'submitted',
          updated_at: new Date()
        })

      // Clean up local file
      fs.unlinkSync(filepath)

      console.log(`✅ Batch transcription job created: ${batch.id}`)
      return batch.id

    } catch (error) {
      console.error('Error creating transcription batch:', error.message)
      throw error
    }
  }

  async ensureTranscriptionBatchTable() {
    const hasTable = await this.db.schema.hasTable('transcription_batches')
    if (!hasTable) {
      await this.db.schema.createTable('transcription_batches', table => {
        table.increments('id').primary()
        table.string('batch_id').unique().notNullable()
        table.string('status').notNullable()
        table.string('input_file_id')
        table.string('output_file_id')
        table.string('error_file_id')
        table.integer('request_count').defaultTo(0)
        table.integer('completed_count').defaultTo(0)
        table.integer('failed_count').defaultTo(0)
        table.timestamp('submitted_at').defaultTo(this.db.fn.now())
        table.timestamp('completed_at')
        table.timestamp('processed_at')
        table.text('description')
        table.text('file_ids') // JSON array of file IDs
      })
      console.log('✅ Created transcription_batches table')
    }
  }

  // Process transcription results from completed batches
  async processTranscriptionResults() {
    try {
      await this.ensureTranscriptionBatchTable()
      
      // Get completed unprocessed transcription batches
      const batches = await this.db('transcription_batches')
        .where('status', 'completed')
        .whereNull('processed_at')
      
      if (batches.length === 0) {
        console.log('No completed unprocessed transcription batches found')
        return { processedCount: 0, errorCount: 0 }
      }
      
      console.log(`📥 Processing ${batches.length} completed transcription batch(es)...`)
      
      let totalProcessed = 0
      let totalErrors = 0
      
      for (const batch of batches) {
        console.log(`\n📋 Processing batch: ${batch.batch_id}`)
        
        if (!batch.output_file_id) {
          console.log('   ⚠️  No output file available')
          continue
        }
        
        // Download results
        const fileResponse = await this.openai.files.content(batch.output_file_id)
        const fileContents = await fileResponse.text()
        
        console.log('   📄 Downloaded results file')
        
        // Process each line
        const lines = fileContents.trim().split('\n')
        let batchProcessed = 0
        let batchErrors = 0
        
        for (const line of lines) {
          try {
            const result = JSON.parse(line)
            
            if (result.error) {
              console.log(`   ❌ Request error: ${result.custom_id} - ${result.error.message}`)
              batchErrors++
              
              // Mark file as failed
              const fileIdMatch = result.custom_id.match(/transcribe-file-(\d+)/)
              if (fileIdMatch) {
                const fileId = parseInt(fileIdMatch[1])
                await this.db('document_files')
                  .where('id', fileId)
                  .update({
                    transcription_status: 'failed',
                    transcription_metadata: JSON.stringify({
                      error: result.error.message,
                      failed_at: new Date().toISOString(),
                      batch_id: batch.batch_id
                    }),
                    updated_at: new Date()
                  })
              }
              continue
            }
            
            // Extract transcription from response (Responses API format)
            let transcription
            if (result.response.body.output && Array.isArray(result.response.body.output)) {
              // Find the message output
              const messageOutput = result.response.body.output.find(item => item.type === 'message')
              if (messageOutput && messageOutput.content && messageOutput.content[0] && messageOutput.content[0].type === 'output_text') {
                transcription = messageOutput.content[0].text.trim()
              } else {
                console.log(`   ⚠️  No valid message content found in response for ${result.custom_id}`)
                batchErrors++
                continue
              }
            } else if (result.response.body.output_text) {
              // Direct output_text format
              transcription = result.response.body.output_text.trim()
            } else {
              console.log(`   ⚠️  No transcription content found in response for ${result.custom_id}`)
              batchErrors++
              continue
            }
            
            // Extract file ID from custom_id
            const fileIdMatch = result.custom_id.match(/transcribe-file-(\d+)/)
            if (!fileIdMatch) {
              console.log(`   ⚠️  Invalid custom_id format: ${result.custom_id}`)
              batchErrors++
              continue
            }
            
            const fileId = parseInt(fileIdMatch[1])
            
            const metadata = {
              service: 'openai',
              model: 'gpt-5',
              transcribed_at: new Date().toISOString(),
              batch_id: batch.batch_id,
              custom_id: result.custom_id
            }

            // Update document_files table with transcription
            await this.db('document_files')
              .where('id', fileId)
              .update({
                transcription: transcription,
                transcription_status: 'completed',
                transcription_metadata: JSON.stringify(metadata),
                updated_at: new Date()
              })

            console.log(`   ✅ Transcribed file ID ${fileId}`)
            batchProcessed++
            
          } catch (lineError) {
            console.error(`   ❌ Error processing line:`, lineError.message)
            batchErrors++
          }
        }
        
        // Mark batch as processed
        await this.db('transcription_batches')
          .where('batch_id', batch.batch_id)
          .update({ processed_at: new Date() })
        
        console.log(`   📊 Processed ${batchProcessed}/${lines.length} transcriptions`)
        totalProcessed += batchProcessed
        totalErrors += batchErrors
      }
      
      console.log(`\n🎉 Transcription processing complete: ${totalProcessed} transcribed, ${totalErrors} errors`)
      return { processedCount: totalProcessed, errorCount: totalErrors }
      
    } catch (error) {
      console.error('❌ Error processing transcription results:', error.message)
      throw error
    }
  }

  // Check status of transcription batches
  async checkTranscriptionBatches() {
    try {
      await this.ensureTranscriptionBatchTable()
      
      // Get unprocessed batches
      const batches = await this.db('transcription_batches')
        .whereNull('processed_at')
        .orderBy('submitted_at', 'desc')
      
      if (batches.length === 0) {
        console.log('No transcription batches found to check')
        return
      }
      
      console.log(`🔍 Checking ${batches.length} transcription batch(es)...`)
      
      for (const batch of batches) {
        console.log(`\n📋 Batch: ${batch.batch_id}`)
        console.log(`   Description: ${batch.description}`)
        console.log(`   Current status: ${batch.status}`)
        
        // Get latest status from OpenAI
        const apiBatch = await this.openai.batches.retrieve(batch.batch_id)
        
        console.log(`   API status: ${apiBatch.status}`)
        console.log(`   Requests: ${apiBatch.request_counts.completed}/${apiBatch.request_counts.total} completed`)
        
        if (apiBatch.request_counts.failed > 0) {
          console.log(`   ⚠️  Failed: ${apiBatch.request_counts.failed}`)
        }
        
        // Update database if status changed
        if (apiBatch.status !== batch.status) {
          await this.db('transcription_batches')
            .where('batch_id', batch.batch_id)
            .update({
              status: apiBatch.status,
              output_file_id: apiBatch.output_file_id,
              error_file_id: apiBatch.error_file_id,
              completed_count: apiBatch.request_counts.completed,
              failed_count: apiBatch.request_counts.failed,
              completed_at: apiBatch.completed_at ? new Date(apiBatch.completed_at * 1000) : null
            })
          
          console.log(`   📝 Updated status: ${batch.status} → ${apiBatch.status}`)
        }
      }
      
    } catch (error) {
      console.error('❌ Error checking transcription batch status:', error.message)
      throw error
    }
  }

  // Clean up failed batches and reset file statuses
  async cleanupFailedBatches() {
    try {
      await this.ensureTranscriptionBatchTable()
      
      // Get failed batches
      const failedBatches = await this.db('transcription_batches')
        .where('status', 'completed')
        .where('failed_count', '>', 0)
        .whereNull('processed_at')
      
      if (failedBatches.length === 0) {
        console.log('No failed batches found to clean up')
        return { cleanedFiles: 0, cleanedBatches: 0 }
      }
      
      console.log(`🧹 Cleaning up ${failedBatches.length} failed batch(es)...`)
      
      let totalCleanedFiles = 0
      
      for (const batch of failedBatches) {
        console.log(`\n📋 Cleaning batch: ${batch.batch_id}`)
        console.log(`   Failed count: ${batch.failed_count}`)
        
        // Parse file IDs from JSON
        let fileIds = []
        try {
          fileIds = JSON.parse(batch.file_ids)
          console.log(`   File IDs: ${fileIds.join(', ')}`)
        } catch (error) {
          console.log(`   ⚠️  Could not parse file IDs: ${batch.file_ids}`)
          continue
        }
        
        // Reset file statuses back to pending
        await this.db('document_files')
          .whereIn('id', fileIds)
          .update({
            transcription_status: 'pending',
            transcription_metadata: null,
            updated_at: new Date()
          })
        
        console.log(`   ✅ Reset ${fileIds.length} files to pending status`)
        totalCleanedFiles += fileIds.length
        
        // Mark batch as cleaned up
        await this.db('transcription_batches')
          .where('batch_id', batch.batch_id)
          .update({ 
            processed_at: new Date(),
            description: batch.description + ' [CLEANED UP - FAILED]'
          })
      }
      
      console.log(`\n🎉 Cleanup complete: ${totalCleanedFiles} files reset to pending`)
      return { cleanedFiles: totalCleanedFiles, cleanedBatches: failedBatches.length }
      
    } catch (error) {
      console.error('❌ Error cleaning up failed batches:', error.message)
      throw error
    }
  }

  // Get transcription statistics
  async getTranscriptionStats() {
    const stats = await this.db('document_files')
      .select('transcription_status')
      .count('* as count')
      .groupBy('transcription_status')

    const total = await this.db('document_files').count('* as count').first()
    
    const result = {
      total: total.count,
      pending: 0,
      submitted: 0,
      completed: 0,
      failed: 0
    }

    stats.forEach(stat => {
      result[stat.transcription_status] = parseInt(stat.count)
    })

    return result
  }

  // Get documents with optional filtering
  async getDocuments(filters = {}) {
    let query = this.db('documents as d')
      .leftJoin('document_files as df', 'd.id', 'df.document_id')
      .select('d.*')
      .count('df.id as file_count')
      .groupBy('d.id')

    if (filters.year) {
      query = query.where('d.year', filters.year)
    }
    
    if (filters.type) {
      query = query.where('d.type', filters.type)
    }
    
    if (filters.status) {
      query = query.where('d.transcription_status', filters.status)
    }

    query = query.orderBy('d.date')

    return await query
  }

  // Transcribe a document using OpenAI
  async transcribeDocument(documentId) {
    // Get document info
    const doc = await this.db('documents').where('id', documentId).first()

    if (!doc) {
      throw new Error(`Document with ID ${documentId} not found`)
    }

    console.log(`Starting transcription for document: ${doc.document_key}`)

    // Get all files for this document
    const files = await this.db('document_files')
      .where('document_id', documentId)
      .orderBy('part_number')

    if (files.length === 0) {
      throw new Error(`No files found for document ${doc.document_key}`)
    }

    // If multiple files, we'll need to combine them or process individually
    // For now, let's process the first file as a test
    const firstFile = files[0]
    
    if (!fs.existsSync(firstFile.file_path)) {
      throw new Error(`File not found: ${firstFile.file_path}`)
    }

    try {
      // Read and encode PDF
      const pdfBuffer = fs.readFileSync(firstFile.file_path)
      const base64Pdf = pdfBuffer.toString('base64')

      // Call OpenAI API
      const response = await openai.responses.create({
        model: 'gpt-5',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                filename: path.basename(firstFile.file_path),
                file_data: `data:application/pdf;base64,${base64Pdf}`,
              },
              {
                type: 'input_text',
                text: 'Please transcribe all the text content from this wartime letter/document. Preserve the original formatting, line breaks, and structure as much as possible. If there are any handwritten portions that are difficult to read, please indicate with [unclear] or your best interpretation in brackets.',
              },
            ],
          },
        ],
      })

      const transcription = response.output_text
      const metadata = {
        service: 'openai',
        model: 'gpt-5',
        transcribed_at: new Date().toISOString(),
        files_processed: files.map(f => f.file_path),
        file_count: files.length
      }

      // Update database
      await this.db('documents')
        .where('id', documentId)
        .update({
          transcription: transcription,
          transcription_status: 'completed',
          metadata: JSON.stringify(metadata),
          updated_at: new Date()
        })

      console.log(`Successfully transcribed document: ${doc.document_key}`)
      return {
        documentId,
        documentKey: doc.document_key,
        transcription,
        metadata
      }

    } catch (error) {
      // Mark as failed
      await this.db('documents')
        .where('id', documentId)
        .update({
          transcription_status: 'failed',
          metadata: JSON.stringify({ 
            error: error.message, 
            failed_at: new Date().toISOString() 
          }),
          updated_at: new Date()
        })
      throw error
    }
  }

  // Close database connection
  async close() {
    if (this.db) {
      await this.db.destroy()
    }
  }
}

module.exports = TranscriptionManager

// CLI usage
if (require.main === module) {
  const manager = new TranscriptionManager()
  
  const command = process.argv[2]
  
  async function main() {
    try {
      await manager.init()
      
      switch (command) {
        case 'scan':
          const count = await manager.scanAndPopulateDocuments()
          console.log(`Scanned and found ${count} documents`)
          break
          
        case 'list':
          const filters = {}
          if (process.argv[3]) filters.year = parseInt(process.argv[3])
          if (process.argv[4]) filters.type = process.argv[4]
          
          const docs = await manager.getDocuments(filters)
          console.log('\nDocuments:')
          docs.forEach(doc => {
            console.log(`${doc.id}: ${doc.document_key} (${doc.date}) - ${doc.transcription_status} - ${doc.file_count} files`)
          })
          break

        case 'list-files':
          const limit = process.argv[3] ? parseInt(process.argv[3]) : 20
          const files = await manager.getPendingFiles(limit)
          console.log(`\nPending files for transcription (showing first ${limit}):`)
          files.forEach(file => {
            console.log(`${file.id}: ${file.document_key} - Part ${file.part_number} - ${file.transcription_status}`)
          })
          break

        case 'stats':
          const stats = await manager.getTranscriptionStats()
          console.log('\nTranscription Statistics:')
          console.log(`Total files: ${stats.total}`)
          console.log(`Pending: ${stats.pending}`)
          console.log(`Submitted: ${stats.submitted}`)
          console.log(`Completed: ${stats.completed}`)
          console.log(`Failed: ${stats.failed}`)
          break

        case 'create-batch':
          const arg = process.argv[3]
          if (!arg) {
            console.log('Please provide either file IDs (comma-separated) or batch size')
            break
          }
          
          let filesToProcess
          if (arg.includes(',')) {
            // Comma-separated file IDs
            const fileIds = arg.split(',').map(id => parseInt(id.trim()))
            console.log(`Creating batch job for specific files: ${fileIds.join(', ')}`)
            
            // Get the specific files
            filesToProcess = await manager.db('document_files as df')
              .join('documents as d', 'df.document_id', 'd.id')
              .select('df.id', 'df.file_path', 'df.part_number', 'd.document_key', 'd.type', 'df.transcription_status')
              .whereIn('df.id', fileIds)
              .where('df.transcription_status', 'pending')
              
          } else {
            // Batch size
            const batchSize = parseInt(arg)
            console.log(`Creating batch job for ${batchSize} files`)
            filesToProcess = await manager.getPendingFiles(batchSize)
          }
          
          if (filesToProcess.length === 0) {
            console.log('No pending files found for transcription')
          } else {
            console.log(`Processing ${filesToProcess.length} files`)
            const batchId = await manager.createTranscriptionBatch(filesToProcess)
            console.log(`Created batch job: ${batchId} for ${filesToProcess.length} files`)
          }
          break

        case 'check-batches':
          await manager.checkTranscriptionBatches()
          console.log('Checked batch statuses')
          break

        case 'process-results':
          const result = await manager.processTranscriptionResults()
          console.log(`Processed ${result.processedCount} transcription results`)
          break

        case 'cleanup-failed':
          const cleanupResult = await manager.cleanupFailedBatches()
          console.log(`Cleaned up ${cleanupResult.cleanedFiles} files from ${cleanupResult.cleanedBatches} failed batches`)
          break
          
        case 'transcribe':
          const docId = parseInt(process.argv[3])
          if (!docId) {
            console.error('Please provide a document ID')
            break
          }
          
          const transcribeResult = await manager.transcribeDocument(docId)
          console.log(`\nTranscription completed for: ${transcribeResult.documentKey}`)
          console.log('\nTranscription preview:')
          console.log(transcribeResult.transcription.substring(0, 500) + '...')
          break
          
        default:
          console.log('Usage:')
          console.log('  node transcription-manager.js scan')
          console.log('  node transcription-manager.js list [year] [type]')
          console.log('  node transcription-manager.js list-files [limit]')
          console.log('  node transcription-manager.js stats')
          console.log('  node transcription-manager.js create-batch [batch_size|file_ids]')
          console.log('  node transcription-manager.js check-batches')
          console.log('  node transcription-manager.js process-results')
          console.log('  node transcription-manager.js cleanup-failed')
          console.log('  node transcription-manager.js transcribe <document_id>')
      }
    } catch (error) {
      console.error('Error:', error.message)
    } finally {
      await manager.close()
    }
  }
  
  main().then(() => {
    process.exit(0)
  })
}
