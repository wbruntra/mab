const fs = require('fs')
const path = require('path')

/**
 * Database class for managing batch jobs
 * Adapted for CommonJS and Knex
 */
class BatchJobDB {
  constructor(database) {
    if (!database) {
      throw new Error('Database instance is required')
    }
    this.db = database
  }

  async createBatchJob(batchData) {
    try {
      const [jobId] = await this.db('batch_jobs').insert({
        batch_id: batchData.batch_id,
        input_file_id: batchData.input_file_id,
        status: batchData.status,
        endpoint: batchData.endpoint,
        model: batchData.model,
        metadata: JSON.stringify(batchData.metadata || {}),
        word_list: JSON.stringify(batchData.word_list || []),
        request_count_total: batchData.request_count_total || 0,
        submitted_at: new Date(),
      })
      return jobId
    } catch (error) {
      console.error('Error creating batch job:', error.message)
      throw error
    }
  }

  async updateBatchJob(batchId, updates) {
    try {
      const updateData = { ...updates, updated_at: new Date() }
      await this.db('batch_jobs')
        .where('batch_id', batchId)
        .update(updateData)
    } catch (error) {
      console.error(`Error updating batch job ${batchId}:`, error.message)
      throw error
    }
  }

  async getBatchJob(batchId) {
    try {
      const job = await this.db('batch_jobs').where('batch_id', batchId).first()

      if (job) {
        // Parse JSON fields
        job.metadata = JSON.parse(job.metadata || '{}')
        job.word_list = JSON.parse(job.word_list || '[]')
      }

      return job
    } catch (error) {
      console.error(`Error getting batch job ${batchId}:`, error.message)
      throw error
    }
  }

  async getAllBatchJobs(status = null) {
    try {
      let query = this.db('batch_jobs').orderBy('created_at', 'desc')

      if (status) {
        query = query.where('status', status)
      }

      const jobs = await query

      // Parse JSON fields for all jobs
      return jobs.map((job) => ({
        ...job,
        metadata: JSON.parse(job.metadata || '{}'),
        word_list: JSON.parse(job.word_list || '[]'),
      }))
    } catch (error) {
      console.error('Error getting batch jobs:', error.message)
      throw error
    }
  }

  async getPendingJobs() {
    return this.getAllBatchJobs().then((jobs) =>
      jobs.filter((job) => ['validating', 'in_progress', 'finalizing'].includes(job.status)),
    )
  }

  async getCompletedUnprocessedJobs() {
    return this.getAllBatchJobs('completed').then((jobs) =>
      jobs.filter((job) => !job.processed_at),
    )
  }

  async markAsProcessed(batchId) {
    await this.updateBatchJob(batchId, { processed_at: new Date() })
  }

  async markAsProcessingFailed(batchId, errorMessage) {
    await this.updateBatchJob(batchId, { 
      status: 'processing_failed',
      error_message: errorMessage 
    })
  }
}

/**
 * Batch processor for OpenAI batch API
 */
class BatchProcessor {
  constructor(openai, batchJobDB) {
    this.openai = openai
    this.batchJobDB = batchJobDB
  }

  async createBatchFile(requests, options = {}) {
    const { filePrefix = 'batch', model = 'gpt-4o', reasoningLevel = 'low' } = options
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${filePrefix}-${timestamp}.jsonl`
    const filePath = path.join(__dirname, 'batch-files', filename)
    
    // Ensure directory exists
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Create JSONL content
    const jsonlContent = requests.map(request => JSON.stringify({
      custom_id: request.custom_id,
      method: 'POST',
      url: '/v1/responses',
      body: {
        model,
        reasoning_level: reasoningLevel,
        input: request.input
      }
    })).join('\n')

    fs.writeFileSync(filePath, jsonlContent)
    console.log(`Created batch file: ${filePath} (${requests.length} requests)`)
    
    return filePath
  }

  async submitBatch(filePath, options = {}) {
    try {
      // Upload file
      const file = await this.openai.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'batch'
      })

      // Create batch
      const batch = await this.openai.batches.create({
        input_file_id: file.id,
        endpoint: '/v1/responses',
        completion_window: '24h',
        metadata: options.metadata || {}
      })

      return {
        batch_id: batch.id,
        file_id: file.id,
        status: batch.status,
        request_count: batch.request_counts?.total || 0
      }
    } catch (error) {
      console.error('Error submitting batch:', error.message)
      throw error
    }
  }

  async checkBatchStatuses(batchIds = null) {
    try {
      const jobs = batchIds 
        ? await Promise.all(batchIds.map(id => this.batchJobDB.getBatchJob(id)))
        : await this.batchJobDB.getPendingJobs()

      for (const job of jobs.filter(Boolean)) {
        try {
          const batch = await this.openai.batches.retrieve(job.batch_id)
          
          const updates = {
            status: batch.status,
            request_count_completed: batch.request_counts?.completed || 0,
            request_count_failed: batch.request_counts?.failed || 0
          }

          if (batch.status === 'completed') {
            updates.completed_at = new Date()
            updates.output_file_id = batch.output_file_id
            updates.error_file_id = batch.error_file_id
          }

          await this.batchJobDB.updateBatchJob(job.batch_id, updates)
          console.log(`Updated batch ${job.batch_id}: ${batch.status}`)
        } catch (error) {
          console.error(`Error checking batch ${job.batch_id}:`, error.message)
        }
      }
    } catch (error) {
      console.error('Error checking batch statuses:', error.message)
      throw error
    }
  }

  async processCompletedBatches(resultProcessor, options = {}) {
    try {
      const completedJobs = await this.batchJobDB.getCompletedUnprocessedJobs()
      let totalProcessed = 0

      for (const job of completedJobs) {
        try {
          if (!job.output_file_id) {
            console.log(`No output file for batch ${job.batch_id}`)
            continue
          }

          // Download results
          const outputFile = await this.openai.files.content(job.output_file_id)
          const outputText = await outputFile.text()
          
          const results = outputText.trim().split('\n').map(line => JSON.parse(line))
          
          for (const result of results) {
            if (result.response?.body?.output_text) {
              const processResult = await resultProcessor(
                result.response.body.output_text,
                result.custom_id,
                job
              )
              
              if (processResult.success) {
                totalProcessed += processResult.count || 1
              }
            }
          }

          await this.batchJobDB.markAsProcessed(job.batch_id)
          console.log(`Processed batch ${job.batch_id}`)
          
        } catch (error) {
          console.error(`Error processing batch ${job.batch_id}:`, error.message)
          await this.batchJobDB.markAsProcessingFailed(job.batch_id, error.message)
        }
      }

      return { totalProcessed }
    } catch (error) {
      console.error('Error processing completed batches:', error.message)
      throw error
    }
  }
}

// Utility functions
function chunkArray(array, chunkSize) {
  const chunks = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

function createBatchRequests(dataChunks, promptGenerator, options = {}) {
  const { customIdPrefix = 'req', itemsPerRequest = 1 } = options
  const requests = []
  
  let requestIndex = 0
  for (const chunk of dataChunks) {
    // Split chunk into smaller groups if needed
    const itemGroups = chunkArray(chunk, itemsPerRequest)
    
    for (const items of itemGroups) {
      requests.push({
        custom_id: `${customIdPrefix}-${requestIndex}`,
        input: [{
          role: 'user',
          content: [{
            type: 'input_text',
            text: promptGenerator(items)
          }]
        }]
      })
      requestIndex++
    }
  }
  
  return requests
}

module.exports = {
  BatchJobDB,
  BatchProcessor,
  chunkArray,
  createBatchRequests
}
