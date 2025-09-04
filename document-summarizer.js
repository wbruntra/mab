const OpenAI = require('openai')
const fs = require('fs')
const path = require('path')
const secrets = require('./secrets.js')
const db = require('./db_connection.js')

class DocumentSummarizer {
  constructor() {
    this.client = new OpenAI({ apiKey: secrets.OPENAI_API_KEY })
    this.model = 'gpt-5-mini'  // Latest model as requested
    this.db = db
  }

  // Test connection
  async init() {
    try {
      await this.db.raw('SELECT 1')
      console.log('Connected to database')
      console.log(`Using OpenAI model: ${this.model}`)
      return true
    } catch (error) {
      console.error('Database connection failed:', error.message)
      throw error
    }
  }

  // Get a document with all its transcribed files
  async getDocumentWithTranscriptions(documentId) {
    // Get document info
    const document = await this.db('documents')
      .where('id', documentId)
      .first()

    if (!document) {
      throw new Error(`Document not found: ${documentId}`)
    }

    // Get all completed transcriptions for this document
    const files = await this.db('document_files')
      .where('document_id', documentId)
      .where('transcription_status', 'completed')
      .whereNotNull('transcription')
      .orderBy('part_number')
      .select('id', 'part_number', 'transcription', 'file_path')

    if (files.length === 0) {
      throw new Error(`No completed transcriptions found for document ${documentId}`)
    }

    return {
      document,
      files,
      combinedTranscription: files.map(f => f.transcription).join('\n\n--- PAGE BREAK ---\n\n')
    }
  }

  // Generate summary for a document
  async generateSummary(documentId) {
    try {
      console.log(`📄 Generating summary for document ID: ${documentId}`)

      // Get document and transcriptions
      const { document, files, combinedTranscription } = await this.getDocumentWithTranscriptions(documentId)
      
      console.log(`📋 Document: ${document.document_key}`)
      console.log(`📑 Found ${files.length} transcribed pages`)
      console.log(`📝 Total characters: ${combinedTranscription.length}`)

      // Check if summary already exists
      if (document.summary) {
        console.log('⚠️  Summary already exists. Use force option to regenerate.')
        return {
          success: true,
          summary: document.summary,
          metadata: JSON.parse(document.summary_metadata || '{}'),
          alreadyExists: true
        }
      }

      // Create summary prompt
      const prompt = `Please provide a concise summary of this wartime letter/document written by a woman named Mary Alice, who served in the Women's Army Auxiliary Corps (WAACs). The summary should be less than 100 words and should provide a quick reference about where she was and what she was doing at the time she wrote the letter. Many such letters will be summarized so we do not need the whole context of World War II and its events, just the particulars of this document.

      Here is an example of a good summary: 
      Fort Des Moines, Iowa. Now in "basic" training in Boom Town (3rd platoon, 2nd squad). The writer describes daily army routine: close‑order drill, P.T., K.P., mess, moving barracks, issued galoshes, attending Mass, and attending dances/parties. She had just received letters from home, missed her loved one, saved baggage for his visit, and asked him to confirm weekend plans.

Here is the current document content:
${combinedTranscription}`

      // Generate summary using OpenAI (using newer responses API)
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
            ],
          },
        ],
      })

      const summary = response.output_text.trim()
      
      console.log(`✅ Generated summary (${summary.length} characters)`)

      // Save summary to database
      const metadata = {
        service: 'openai',
        model: this.model,
        generated_at: new Date().toISOString(),
        source_files: files.length,
        total_characters: combinedTranscription.length,
        summary_characters: summary.length
      }

      await this.db('documents')
        .where('id', documentId)
        .update({
          summary: summary,
          summary_metadata: JSON.stringify(metadata),
          updated_at: new Date()
        })

      console.log(`💾 Saved summary to database`)

      return {
        success: true,
        summary,
        metadata,
        documentKey: document.document_key,
        sourceFiles: files.length
      }

    } catch (error) {
      console.error(`❌ Error generating summary for document ${documentId}:`, error.message)
      return {
        success: false,
        error: error.message,
        documentId
      }
    }
  }

  // Generate summaries for multiple documents
  async generateBatchSummaries(documentIds, force = false) {
    console.log(`🚀 Starting batch summary generation for ${documentIds.length} documents`)
    
    let processed = 0
    let successful = 0
    let failed = 0
    let skipped = 0
    const results = []

    for (const documentId of documentIds) {
      try {
        // Check if summary exists and force is not set
        if (!force) {
          const existingDoc = await this.db('documents')
            .where('id', documentId)
            .first()
          
          if (existingDoc && existingDoc.summary) {
            console.log(`⏭️  Skipping document ${documentId} (${existingDoc.document_key}) - summary exists`)
            skipped++
            processed++
            results.push({
              success: true,
              skipped: true,
              documentId,
              documentKey: existingDoc.document_key
            })
            continue
          }
        }

        const result = await this.generateSummary(documentId)
        results.push(result)
        processed++

        if (result.success) {
          successful++
        } else {
          failed++
        }

        console.log(`📊 Progress: ${processed}/${documentIds.length} (${successful} success, ${failed} failed, ${skipped} skipped)`)
        
        // Small delay to avoid hitting rate limits
        if (processed < documentIds.length) {
          await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
        }

      } catch (error) {
        console.error(`❌ Error processing document ${documentId}:`, error.message)
        failed++
        processed++
        results.push({
          success: false,
          error: error.message,
          documentId
        })
      }
    }

    console.log(`\n🎉 Batch summary generation complete!`)
    console.log(`📊 Final results: ${successful} successful, ${failed} failed, ${skipped} skipped out of ${processed} total`)

    return {
      processed,
      successful,
      failed,
      skipped,
      results
    }
  }

  // Get documents that are ready for summarization (have completed transcriptions)
  async getDocumentsReadyForSummary(limit = 50, force = false) {
    // First, get all documents with at least one completed transcription
    let baseQuery = this.db('documents as d')
      .select('d.id', 'd.document_key', 'd.date', 'd.type', 'd.summary')
      .whereExists(function() {
        this.select('*')
          .from('document_files as df')
          .whereRaw('df.document_id = d.id')
          .where('df.transcription_status', 'completed')
      })

    // If not forcing, exclude documents that already have summaries
    if (!force) {
      baseQuery = baseQuery.whereNull('d.summary')
    }

    const documents = await baseQuery.limit(limit).orderBy('d.date')

    // Now get the file counts for each document
    const enrichedDocs = []
    for (const doc of documents) {
      const fileCounts = await this.db('document_files')
        .where('document_id', doc.id)
        .select(
          this.db.raw('COUNT(*) as total_files'),
          this.db.raw('SUM(CASE WHEN transcription_status = "completed" THEN 1 ELSE 0 END) as completed_files')
        )
        .first()

      enrichedDocs.push({
        ...doc,
        total_files: parseInt(fileCounts.total_files || 0),
        completed_files: parseInt(fileCounts.completed_files || 0)
      })
    }

    return enrichedDocs
  }

  // Get summary statistics
  async getStats() {
    const stats = await this.db('documents')
      .select(
        this.db.raw('COUNT(*) as total_documents'),
        this.db.raw('SUM(CASE WHEN summary IS NOT NULL THEN 1 ELSE 0 END) as documents_with_summary'),
        this.db.raw('SUM(CASE WHEN summary IS NULL THEN 1 ELSE 0 END) as documents_without_summary')
      )
      .first()

    // Get documents ready for summarization
    const readyDocs = await this.getDocumentsReadyForSummary(1000)

    return {
      total_documents: parseInt(stats.total_documents),
      documents_with_summary: parseInt(stats.documents_with_summary),
      documents_without_summary: parseInt(stats.documents_without_summary),
      documents_ready_for_summary: readyDocs.length
    }
  }

  async close() {
    await this.db.destroy()
  }
}

// CLI interface
async function main() {
  const command = process.argv[2]
  const arg1 = process.argv[3]
  const arg2 = process.argv[4]

  const summarizer = new DocumentSummarizer()
  await summarizer.init()

  try {
    switch (command) {
      case 'stats':
        const stats = await summarizer.getStats()
        console.log('\nDocument Summary Statistics:')
        console.log(`Total documents: ${stats.total_documents}`)
        console.log(`Documents with summary: ${stats.documents_with_summary}`)
        console.log(`Documents without summary: ${stats.documents_without_summary}`)
        console.log(`Documents ready for summary: ${stats.documents_ready_for_summary}`)
        break

      case 'ready':
        const limit = arg1 ? parseInt(arg1) : 20
        const readyDocs = await summarizer.getDocumentsReadyForSummary(limit)
        console.log(`\nDocuments ready for summarization (showing ${readyDocs.length}):`);
        readyDocs.forEach(doc => {
          console.log(`  ${doc.id}: ${doc.document_key} (${doc.completed_files}/${doc.total_files} files transcribed)`)
        })
        break

      case 'summarize':
        if (!arg1) {
          console.log('Usage: node document-summarizer.js summarize <document_id>')
          break
        }
        const result = await summarizer.generateSummary(parseInt(arg1))
        if (result.success && !result.alreadyExists) {
          console.log('\n--- Generated Summary ---')
          console.log(result.summary)
        }
        break

      case 'batch':
        const batchSize = arg1 ? parseInt(arg1) : 10
        const force = process.argv.includes('--force')
        
        console.log(`Getting ${batchSize} documents ready for summarization...`)
        const docs = await summarizer.getDocumentsReadyForSummary(batchSize, force)
        
        if (docs.length === 0) {
          console.log('No documents ready for summarization')
          break
        }

        const docIds = docs.map(d => d.id)
        await summarizer.generateBatchSummaries(docIds, force)
        break

      default:
        console.log('Document Summarizer')
        console.log('Usage:')
        console.log('  node document-summarizer.js stats')
        console.log('  node document-summarizer.js ready [limit]')
        console.log('  node document-summarizer.js summarize <document_id>')
        console.log('  node document-summarizer.js batch [batch_size] [--force]')
        console.log('')
        console.log('Examples:')
        console.log('  node document-summarizer.js ready 20')
        console.log('  node document-summarizer.js summarize 123')
        console.log('  node document-summarizer.js batch 10')
        console.log('  node document-summarizer.js batch 5 --force  # Regenerate existing summaries')
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await summarizer.close()
  }
}

if (require.main === module) {
  main()
}

module.exports = DocumentSummarizer
