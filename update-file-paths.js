const db = require('./db_connection.js')
const secrets = require('./secrets.js')
const path = require('path')

async function updateFilePaths() {
  try {
    console.log('Starting file path update...')
    console.log(`Base directory: ${secrets.base_directory}`)
    
    // Get all file paths from the database
    const files = await db('document_files').select('id', 'file_path')
    
    console.log(`Found ${files.length} files to process`)
    
    let updated = 0
    let skipped = 0
    let errors = 0
    
    for (const file of files) {
      try {
        const currentPath = file.file_path
        
        // Skip if already relative (doesn't start with the base directory)
        if (!currentPath.startsWith(secrets.base_directory)) {
          console.log(`Skipping ${file.id}: Already relative or different base - ${currentPath}`)
          skipped++
          continue
        }
        
        // Convert to relative path
        const relativePath = path.relative(secrets.base_directory, currentPath)
        
        // Update in database
        await db('document_files')
          .where('id', file.id)
          .update({ file_path: relativePath })
        
        console.log(`Updated ${file.id}: ${currentPath} -> ${relativePath}`)
        updated++
        
      } catch (error) {
        console.error(`Error processing file ${file.id}: ${error.message}`)
        errors++
      }
    }
    
    console.log('\n=== Update Summary ===')
    console.log(`Total files: ${files.length}`)
    console.log(`Updated: ${updated}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Errors: ${errors}`)
    
    // Show some examples of the updated paths
    console.log('\n=== Sample updated paths ===')
    const updatedSamples = await db('document_files')
      .select('file_path')
      .limit(5)
    
    updatedSamples.forEach((file, index) => {
      console.log(`${index + 1}. ${file.file_path}`)
    })
    
  } catch (error) {
    console.error('Error updating file paths:', error)
  } finally {
    await db.destroy()
  }
}

// Run the update
updateFilePaths()
