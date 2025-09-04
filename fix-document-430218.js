const db = require('./db_connection.js')
const { createTranscriptionService } = require('./transcription-services.js')

async function fixDocument430218() {
  console.log('🔧 Fixing document MAR_wartime_letters_430218')
  
  // Get the pending files for this document
  const files = await db('document_files')
    .where('document_id', 24)
    .where('transcription_status', 'pending')
    .orderBy('part_number')
  
  console.log(`Found ${files.length} pending files to process`)
  
  // Create OpenAI transcription service
  const transcriptionService = createTranscriptionService('openai')
  
  let processed = 0
  let successful = 0
  let failed = 0
  
  for (const file of files) {
    try {
      console.log(`\n📄 Processing file ${file.id} (part ${file.part_number}): ${file.file_path}`)
      
      // Transcribe using OpenAI
      const result = await transcriptionService.transcribe(file.file_path)
      
      console.log(`✅ Transcribed ${result.transcription.length} characters`)
      
      // Update database
      await db('document_files')
        .where('id', file.id)
        .update({
          transcription: result.transcription,
          transcription_status: 'completed',
          transcription_metadata: JSON.stringify(result.metadata),
          updated_at: new Date()
        })
      
      console.log(`💾 Updated database for file ID ${file.id}`)
      successful++
      
    } catch (error) {
      console.error(`❌ Error processing file ${file.id}:`, error.message)
      
      // Mark as failed
      await db('document_files')
        .where('id', file.id)
        .update({
          transcription_status: 'failed',
          transcription_metadata: JSON.stringify({
            error: error.message,
            failed_at: new Date().toISOString(),
            service: 'openai'
          }),
          updated_at: new Date()
        })
      
      failed++
    }
    
    processed++
    console.log(`📊 Progress: ${processed}/${files.length} (${successful} success, ${failed} failed)`)
    
    // Small delay to avoid rate limits
    if (processed < files.length) {
      console.log('⏳ Waiting 3 seconds...')
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }
  
  // Check final status
  const finalStatus = await db('document_files')
    .where('document_id', 24)
    .select('transcription_status')
    .count('* as count')
    .groupBy('transcription_status')
  
  console.log('\n🎉 Processing complete!')
  console.log('📊 Final status for document MAR_wartime_letters_430218:')
  finalStatus.forEach(status => {
    console.log(`  ${status.transcription_status}: ${status.count}`)
  })
  
  await db.destroy()
}

fixDocument430218().catch(console.error)
