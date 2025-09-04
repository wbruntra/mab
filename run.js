const OpenAI = require('openai')
const secrets = require('./secrets')

const openai = new OpenAI({
  apiKey: secrets.OPENAI_API_KEY,
})

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'data', 'sample_letter.pdf')

const run = async () => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('PDF file not found:', filePath)
      return
    }

    console.log('Processing PDF file with OpenAI...')
    
    // Read the PDF file and convert to base64
    const pdfBuffer = fs.readFileSync(filePath)
    const base64Pdf = pdfBuffer.toString('base64')

    // Create a response using the newer API format
    console.log('Extracting text from PDF...')
    
    const response = await openai.responses.create({
      model: 'gpt-5',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'sample_letter.pdf',
              file_data: `data:application/pdf;base64,${base64Pdf}`,
            },
            {
              type: 'input_text',
              text: 'Please extract all the text content from this PDF file. Return only the extracted text in a clean, readable format without any additional commentary or formatting markers.',
            },
          ],
        },
      ],
    })

    const extractedText = response.output_text
    
    // Save the extracted text to a file
    const outputPath = path.join(__dirname, 'output', 'extracted_text.txt')
    fs.writeFileSync(outputPath, extractedText)
    
    console.log('Text extraction completed!')
    console.log('Extracted text saved to:', outputPath)
    console.log('\n--- Extracted Text Preview ---')
    console.log(extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''))

  } catch (error) {
    console.error('Error:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
  }
}

run()

