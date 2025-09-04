const { GoogleGenAI } = require("@google/genai")
const OpenAI = require('openai')
const fs = require('fs')
const secrets = require('./secrets.js')

/**
 * Base transcription service interface
 */
class BaseTranscriptionService {
  constructor(name) {
    this.name = name
  }

  async transcribe(filePath) {
    throw new Error('transcribe method must be implemented by subclass')
  }

  async isRetryableError(error) {
    // Default implementation - can be overridden by services
    return error.message && (
      error.message.includes('RESOURCE_EXHAUSTED') ||
      error.message.includes('429') ||
      error.message.includes('quota') ||
      error.message.includes('rate limit')
    )
  }
}

/**
 * Google Gemini transcription service
 */
class GeminiTranscriptionService extends BaseTranscriptionService {
  constructor() {
    super('gemini')
    this.ai = new GoogleGenAI({ apiKey: secrets.GEMINI_API_KEY })
    this.model = 'gemini-2.5-flash'
  }

  async transcribe(filePath) {
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
      model: this.model,
      contents: contents
    })

    const transcription = response.text.trim()

    return {
      transcription,
      metadata: {
        service: this.name,
        model: this.model,
        transcribed_at: new Date().toISOString(),
        characters: transcription.length
      }
    }
  }
}

/**
 * OpenAI transcription service
 */
class OpenAITranscriptionService extends BaseTranscriptionService {
  constructor() {
    super('openai')
    this.client = new OpenAI({ apiKey: secrets.OPENAI_API_KEY })
    this.model = 'gpt-5-mini'
  }

  async transcribe(filePath) {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    // Read and encode PDF
    const pdfBuffer = fs.readFileSync(filePath)
    const base64Data = pdfBuffer.toString('base64')

    // Use the newer responses API that supports PDFs
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'document.pdf',
              file_data: `data:application/pdf;base64,${base64Data}`,
            },
            {
              type: 'input_text',
              text: `Please transcribe all the text content from this wartime letter/document page. 

INSTRUCTIONS:
- Preserve the original formatting, line breaks, and structure as much as possible
- If there are any handwritten portions that are difficult to read, indicate with [unclear] or your best interpretation in brackets
- Include any dates, addresses, signatures, and other details visible in the document
- Return only the transcribed text without any additional commentary or formatting markers
- If the page appears to be blank or contains no readable text, respond with "[blank page]"

Please provide the transcription as plain text.`,
            },
          ],
        },
      ],
    })

    const transcription = response.output_text.trim()

    return {
      transcription,
      metadata: {
        service: this.name,
        model: this.model,
        transcribed_at: new Date().toISOString(),
        characters: transcription.length
      }
    }
  }

  async isRetryableError(error) {
    // OpenAI specific retry logic
    return error.message && (
      error.message.includes('rate_limit_exceeded') ||
      error.message.includes('429') ||
      error.message.includes('quota') ||
      error.message.includes('insufficient_quota') ||
      error.message.includes('overloaded')
    )
  }
}

/**
 * Factory function to create transcription services
 */
function createTranscriptionService(serviceName = 'gemini') {
  switch (serviceName.toLowerCase()) {
    case 'gemini':
      return new GeminiTranscriptionService()
    case 'openai':
      return new OpenAITranscriptionService()
    default:
      throw new Error(`Unknown transcription service: ${serviceName}`)
  }
}

/**
 * Get available transcription services
 */
function getAvailableServices() {
  return ['gemini', 'openai']
}

module.exports = {
  BaseTranscriptionService,
  GeminiTranscriptionService,
  OpenAITranscriptionService,
  createTranscriptionService,
  getAvailableServices
}
