const BatchProcessor = require('./batch-framework/BatchProcessor.js')
const BatchJobDB = require('./batch-framework/BatchJobDB.js')
const secrets = require('./secrets.js')
const OpenAI = require('openai')

async function testSimpleBatch() {
  console.log('🧪 Testing simple batch job...\n')

  const openai = new OpenAI({ apiKey: secrets.OPENAI_API_KEY })
  const batchJobDB = new BatchJobDB('./mab.sqlite3')
  const batchProcessor = new BatchProcessor(openai, batchJobDB)

  try {
    // Create simple test requests
    const requests = [
      {
        customId: 'test-1',
        prompt: 'What is 2 + 2? Answer with just the number.'
      },
      {
        customId: 'test-2', 
        prompt: 'What color is the sky on a clear day? Answer with just the color.'
      },
      {
        customId: 'test-3',
        prompt: 'What is the capital of France? Answer with just the city name.'
      }
    ]

    console.log('📝 Creating batch file...')
    const batchFilePath = await batchProcessor.createBatchFile(requests, {
      model: 'gpt-5',
      filePrefix: 'test-batch'
    })

    console.log('🚀 Submitting batch...')
    const batchInfo = await batchProcessor.submitBatch(batchFilePath, {
      metadata: {
        batch_type: 'simple_test',
        description: 'Simple test batch to validate framework'
      }
    })

    console.log('💾 Saving batch job to database...')
    await batchJobDB.createBatchJob({
      batch_id: batchInfo.batch_id,
      input_file_id: batchInfo.file_id,
      status: batchInfo.status,
      endpoint: '/v1/chat/completions',
      model: 'gpt-5',
      metadata: {
        batch_type: 'simple_test'
      },
      word_list: ['test-1', 'test-2', 'test-3'],
      request_count_total: batchInfo.request_count
    })

    console.log(`✅ Test batch created successfully: ${batchInfo.batch_id}`)
    console.log(`📄 Batch file: ${batchFilePath}`)
    
    return batchInfo.batch_id

  } catch (error) {
    console.error('❌ Error creating test batch:', error.message)
    throw error
  }
}

async function checkTestBatch() {
  console.log('🔍 Checking test batch status...\n')
  
  const openai = new OpenAI({ apiKey: secrets.OPENAI_API_KEY })
  const batchJobDB = new BatchJobDB('./mab.sqlite3')
  const batchProcessor = new BatchProcessor(openai, batchJobDB)

  await batchProcessor.checkBatchStatuses()
}

async function processTestResults() {
  console.log('📥 Processing test batch results...\n')
  
  const openai = new OpenAI({ apiKey: secrets.OPENAI_API_KEY })
  const batchJobDB = new BatchJobDB('./mab.sqlite3')
  const batchProcessor = new BatchProcessor(openai, batchJobDB)

  const processResult = async (responseText, customId, jobInfo) => {
    console.log(`  ✅ Result for ${customId}: ${responseText.trim()}`)
    return { success: true, count: 1 }
  }

  await batchProcessor.processCompletedBatches(processResult, {
    batchType: 'simple_test'
  })
}

// CLI interface
const command = process.argv[2]

async function main() {
  try {
    switch (command) {
      case 'create':
        await testSimpleBatch()
        break
      case 'check':
        await checkTestBatch()
        break
      case 'process':
        await processTestResults()
        break
      default:
        console.log('Usage: node test-batch.js [create|check|process]')
        console.log('  create  - Create a new test batch')
        console.log('  check   - Check status of test batches')
        console.log('  process - Process completed test batch results')
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

main()
