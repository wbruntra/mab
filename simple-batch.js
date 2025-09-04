const OpenAI = require('openai')
const fs = require('fs')
const path = require('path')
const secrets = require('./secrets.js')
const db = require('./db_connection.js')

class SimpleBatchProcessor {
  constructor() {
    this.openai = new OpenAI({ apiKey: secrets.OPENAI_API_KEY })
    this.db = db
  }

  async ensureBatchTable() {
    // Create simple batch tracking table if it doesn't exist
    const hasTable = await this.db.schema.hasTable('simple_batches')
    if (!hasTable) {
      await this.db.schema.createTable('simple_batches', table => {
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
      })
      console.log('✅ Created simple_batches table')
    }
  }

  async createSimpleBatch(requests, description = 'Simple batch test') {
    try {
      await this.ensureBatchTable()
      
      console.log(`📝 Creating batch with ${requests.length} requests...`)
      
      // Create JSONL content
      const jsonlLines = requests.map(req => JSON.stringify({
        custom_id: req.customId,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: 'gpt-5',
          messages: [
            {
              role: 'user',
              content: req.prompt
            }
          ]
        }
      }))
      
      // Write to temporary file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `simple-batch-${timestamp}.jsonl`
      const filepath = path.join('.', filename)
      
      fs.writeFileSync(filepath, jsonlLines.join('\n'))
      console.log(`📁 Created batch file: ${filename}`)
      
      // Upload file to OpenAI
      const file = await this.openai.files.create({
        file: fs.createReadStream(filepath),
        purpose: 'batch'
      })
      
      console.log(`⬆️  Uploaded file: ${file.id}`)
      
      // Create batch job
      const batch = await this.openai.batches.create({
        input_file_id: file.id,
        endpoint: '/v1/chat/completions',
        completion_window: '24h'
      })
      
      console.log(`🚀 Created batch: ${batch.id}`)
      
      // Save to database using knex
      await this.db('simple_batches').insert({
        batch_id: batch.id,
        status: batch.status,
        input_file_id: file.id,
        request_count: requests.length,
        description: description
      })
      
      // Clean up local file
      fs.unlinkSync(filepath)
      
      console.log(`✅ Batch created successfully: ${batch.id}`)
      return batch.id
      
    } catch (error) {
      console.error('❌ Error creating batch:', error.message)
      throw error
    }
  }

  async checkBatchStatus(batchId = null) {
    try {
      await this.ensureBatchTable()
      
      let batches
      if (batchId) {
        batches = await this.db('simple_batches').where('batch_id', batchId)
      } else {
        batches = await this.db('simple_batches')
          .whereNull('processed_at')
          .orderBy('submitted_at', 'desc')
      }
      
      if (batches.length === 0) {
        console.log('No batches found to check')
        return
      }
      
      console.log(`🔍 Checking ${batches.length} batch(es)...`)
      
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
          await this.db('simple_batches')
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
      console.error('❌ Error checking batch status:', error.message)
      throw error
    }
  }

  async processResults(batchId = null) {
    try {
      await this.ensureBatchTable()
      
      let batches
      if (batchId) {
        batches = await this.db('simple_batches')
          .where('batch_id', batchId)
          .where('status', 'completed')
          .whereNull('processed_at')
      } else {
        batches = await this.db('simple_batches')
          .where('status', 'completed')
          .whereNull('processed_at')
      }
      
      if (batches.length === 0) {
        console.log('No completed unprocessed batches found')
        return
      }
      
      console.log(`📥 Processing ${batches.length} completed batch(es)...`)
      
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
        let successCount = 0
        
        for (const line of lines) {
          try {
            const result = JSON.parse(line)
            const response = result.response.body.choices[0].message.content
            
            console.log(`   ✅ ${result.custom_id}: ${response.trim()}`)
            successCount++
            
          } catch (lineError) {
            console.error(`   ❌ Error processing line:`, lineError.message)
          }
        }
        
        // Mark as processed
        await this.db('simple_batches')
          .where('batch_id', batch.batch_id)
          .update({ processed_at: new Date() })
        
        console.log(`   📊 Processed ${successCount}/${lines.length} results`)
      }
      
    } catch (error) {
      console.error('❌ Error processing results:', error.message)
      throw error
    }
  }

  async listBatches() {
    await this.ensureBatchTable()
    
    const batches = await this.db('simple_batches').orderBy('submitted_at', 'desc')
    
    console.log(`📋 Found ${batches.length} batch(es):`)
    console.log('')
    
    for (const batch of batches) {
      console.log(`🔹 ${batch.batch_id}`)
      console.log(`   Status: ${batch.status}`)
      console.log(`   Description: ${batch.description}`)
      console.log(`   Requests: ${batch.request_count}`)
      console.log(`   Submitted: ${batch.submitted_at}`)
      if (batch.completed_at) {
        console.log(`   Completed: ${batch.completed_at}`)
      }
      if (batch.processed_at) {
        console.log(`   Processed: ${batch.processed_at}`)
      }
      console.log('')
    }
  }
}

// CLI interface
async function main() {
  const processor = new SimpleBatchProcessor()
  const command = process.argv[2]
  const arg = process.argv[3]

  try {
    switch (command) {
      case 'create':
        const testRequests = [
          { customId: 'test-1', prompt: 'What is 2 + 2? Answer with just the number.' },
          { customId: 'test-2', prompt: 'What color is the sky on a clear day? Answer with just the color.' },
          { customId: 'test-3', prompt: 'What is the capital of France? Answer with just the city name.' }
        ]
        await processor.createSimpleBatch(testRequests, 'Simple math and facts test')
        break
        
      case 'check':
        await processor.checkBatchStatus(arg)
        break
        
      case 'process':
        await processor.processResults(arg)
        break
        
      case 'list':
        await processor.listBatches()
        break
        
      default:
        console.log('Usage: node simple-batch.js [create|check|process|list] [batch_id]')
        console.log('  create        - Create a new test batch')
        console.log('  check [id]    - Check status of batch(es)')
        console.log('  process [id]  - Process completed batch results')
        console.log('  list          - List all batches')
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = SimpleBatchProcessor
