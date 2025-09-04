const express = require('express')
const router = express.Router()
const db = require('../db_connection')

const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    return next()
  } else {
    return res.status(401).json({ error: 'Authentication required' })
  }
}

router.use(requireAuth)

// API Routes (these require authentication)

// Get overall statistics
router.get('/stats', async (req, res) => {
  try {
    // Get file statistics
    const fileStats = await db('document_files')
      .select(
        db.raw('COUNT(*) as total_files'),
        db.raw(
          'SUM(CASE WHEN transcription_status = "completed" THEN 1 ELSE 0 END) as completed_files',
        ),
        db.raw(
          'SUM(CASE WHEN transcription_status = "pending" THEN 1 ELSE 0 END) as pending_files',
        ),
        db.raw(
          'SUM(CASE WHEN transcription_status = "submitted" THEN 1 ELSE 0 END) as submitted_files',
        ),
        db.raw('SUM(CASE WHEN transcription_status = "failed" THEN 1 ELSE 0 END) as failed_files'),
      )
      .first()

    // Get document statistics
    const documentStats = await db('documents')
      .select(
        db.raw('COUNT(*) as total_documents'),
        db.raw(
          'SUM(CASE WHEN transcription_status = "completed" THEN 1 ELSE 0 END) as documents_with_all_completed',
        ),
        db.raw(
          'SUM(CASE WHEN transcription_status = "partial" THEN 1 ELSE 0 END) as documents_with_partial_completed',
        ),
        db.raw(
          'SUM(CASE WHEN transcription_status = "pending" THEN 1 ELSE 0 END) as documents_with_no_completed',
        ),
        db.raw('SUM(CASE WHEN summary IS NOT NULL THEN 1 ELSE 0 END) as documents_with_summary'),
      )
      .first()

    // Calculate completion percentage
    const completionPercentage =
      fileStats.total_files > 0 ? (fileStats.completed_files / fileStats.total_files) * 100 : 0

    // Get document type breakdown
    const typeStats = await db('documents').select('type').count('* as count').groupBy('type')

    // Get completion progress by year
    const yearProgress = await db('documents as d')
      .join('document_files as df', 'd.id', 'df.document_id')
      .select('d.year')
      .select(db.raw('COUNT(*) as total'))
      .select(
        db.raw(
          'SUM(CASE WHEN df.transcription_status = "completed" THEN 1 ELSE 0 END) as completed',
        ),
      )
      .groupBy('d.year')
      .orderBy('d.year')

    // Get recent activity
    const recentActivity = await db('document_files as df')
      .join('documents as d', 'df.document_id', 'd.id')
      .select('d.document_key', 'df.part_number', 'df.transcription_status', 'df.updated_at')
      .where('df.transcription_status', '!=', 'pending')
      .orderBy('df.updated_at', 'desc')
      .limit(10)

    // Return stats in the format expected by frontend
    res.json({
      total_documents: parseInt(documentStats.total_documents),
      total_files: parseInt(fileStats.total_files),
      pending_files: parseInt(fileStats.pending_files),
      completed_files: parseInt(fileStats.completed_files),
      completion_percentage: completionPercentage,
      documents_with_all_completed: parseInt(documentStats.documents_with_all_completed),
      documents_with_partial_completed: parseInt(documentStats.documents_with_partial_completed),
      documents_with_no_completed: parseInt(documentStats.documents_with_no_completed),
      typeStats,
      yearProgress,
      recentActivity,
    })
  } catch (error) {
    console.error('Error getting stats:', error)
    res.status(500).json({ error: 'Failed to get statistics' })
  }
})

// Get list of documents with pagination and filtering
router.get('/documents', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      year,
      status,
      search,
      sortBy = 'date',
      sortOrder = 'asc',
    } = req.query

    const offset = (page - 1) * limit

    let query = db('documents as d')
      .leftJoin('document_files as df', 'd.id', 'df.document_id')
      .select(
        'd.id',
        'd.document_key',
        'd.date',
        'd.type',
        'd.year',
        'd.summary',
        db.raw('COUNT(df.id) as file_count'),
        db.raw(
          'SUM(CASE WHEN df.transcription_status = "completed" THEN 1 ELSE 0 END) as completed_count',
        ),
        db.raw(
          'SUM(CASE WHEN df.transcription_status = "pending" THEN 1 ELSE 0 END) as pending_count',
        ),
        db.raw(
          'SUM(CASE WHEN df.transcription_status = "failed" THEN 1 ELSE 0 END) as failed_count',
        ),
        db.raw('MAX(df.updated_at) as last_updated'),
      )
      .groupBy('d.id', 'd.document_key', 'd.date', 'd.type', 'd.year', 'd.summary')

    // Apply filters
    if (type) {
      query = query.where('d.type', type)
    }
    if (year) {
      query = query.where('d.year', year)
    }
    if (search) {
      query = query.where('d.document_key', 'like', `%${search}%`)
    }
    if (status) {
      if (status === 'completed') {
        query = query.having(db.raw('completed_count = file_count AND file_count > 0'))
      } else if (status === 'partial') {
        query = query.having(db.raw('completed_count > 0 AND completed_count < file_count'))
      } else if (status === 'pending') {
        query = query.having(db.raw('completed_count = 0'))
      }
    }

    // Get total count for pagination (need to handle HAVING clauses differently)
    let countQuery = db('documents as d')
      .leftJoin('document_files as df', 'd.id', 'df.document_id')
      .groupBy('d.id')

    // Apply the same filters to count query
    if (type) {
      countQuery = countQuery.where('d.type', type)
    }
    if (year) {
      countQuery = countQuery.where('d.year', year)
    }
    if (search) {
      countQuery = countQuery.where('d.document_key', 'like', `%${search}%`)
    }
    if (status) {
      if (status === 'completed') {
        countQuery = countQuery.having(
          db.raw(
            'COUNT(CASE WHEN df.transcription_status = "completed" THEN 1 END) = COUNT(df.id) AND COUNT(df.id) > 0',
          ),
        )
      } else if (status === 'partial') {
        countQuery = countQuery.having(
          db.raw(
            'COUNT(CASE WHEN df.transcription_status = "completed" THEN 1 END) > 0 AND COUNT(CASE WHEN df.transcription_status = "completed" THEN 1 END) < COUNT(df.id)',
          ),
        )
      } else if (status === 'pending') {
        countQuery = countQuery.having(
          db.raw('COUNT(CASE WHEN df.transcription_status = "completed" THEN 1 END) = 0'),
        )
      }
    }

    // Get the total count by wrapping the grouped query
    const totalCountResult = await db.from(countQuery.as('subquery')).count('* as total').first()
    const totalCount = totalCountResult ? parseInt(totalCountResult.total) : 0

    // Determine sort column and direction
    let sortColumn = 'd.date' // default
    if (sortBy === 'document_key') sortColumn = 'd.document_key'
    else if (sortBy === 'type') sortColumn = 'd.type'
    else if (sortBy === 'year') sortColumn = 'd.year'
    else if (sortBy === 'file_count') sortColumn = 'file_count'
    else if (sortBy === 'transcription_status') sortColumn = 'completed_count' // sort by completion for status

    const sortDirection = sortOrder === 'desc' ? 'desc' : 'asc'

    // Apply pagination and get results
    const rawDocuments = await query
      .orderBy(sortColumn, sortDirection)
      .limit(parseInt(limit))
      .offset(offset)

    // Add transcription_status to each document
    const documents = rawDocuments.map((doc) => {
      let transcription_status = 'pending'
      if (doc.completed_count > 0) {
        if (doc.completed_count === doc.file_count) {
          transcription_status = 'completed'
        } else {
          transcription_status = 'partial'
        }
      }

      return {
        ...doc,
        transcription_status,
        file_count: parseInt(doc.file_count),
        completed_count: parseInt(doc.completed_count),
        pending_count: parseInt(doc.pending_count),
        failed_count: parseInt(doc.failed_count),
      }
    })

    res.json({
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error('Error getting documents:', error)
    res.status(500).json({ error: 'Failed to get documents' })
  }
})

// Get specific document details with all files
router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Get document info including summary
    const document = await db('documents').where('id', id).first()

    if (!document) {
      return res.status(404).json({ error: 'Document not found' })
    }

    // Parse summary metadata if it exists
    if (document.summary_metadata) {
      try {
        document.summary_metadata = JSON.parse(document.summary_metadata)
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }

    // Get all files for this document
    const files = await db('document_files').where('document_id', id).orderBy('part_number')

    res.json({
      document,
      files,
    })
  } catch (error) {
    console.error('Error getting document details:', error)
    res.status(500).json({ error: 'Failed to get document details' })
  }
})

// Get specific file details with full transcription
router.get('/files/:id', async (req, res) => {
  try {
    const { id } = req.params

    const file = await db('document_files as df')
      .join('documents as d', 'df.document_id', 'd.id')
      .select('df.*', 'd.document_key', 'd.date', 'd.type', 'd.year')
      .where('df.id', id)
      .first()

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    // Parse metadata if it exists
    if (file.transcription_metadata) {
      try {
        file.transcription_metadata = JSON.parse(file.transcription_metadata)
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }

    res.json(file)
  } catch (error) {
    console.error('Error getting file details:', error)
    res.status(500).json({ error: 'Failed to get file details' })
  }
})

// Search transcriptions
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query

    if (!q) {
      return res.status(400).json({ error: 'Search query required' })
    }

    const results = await db('document_files as df')
      .join('documents as d', 'df.document_id', 'd.id')
      .select(
        'df.id as file_id',
        'd.id as document_id',
        'd.document_key',
        'df.part_number',
        'd.date',
        'd.type',
        'df.transcription_status',
        db.raw('substr(df.transcription, 1, 300) as preview'),
      )
      .where('df.transcription', 'like', `%${q}%`)
      .where('df.transcription_status', 'completed')
      .orderBy('d.date', 'desc')
      .limit(parseInt(limit))

    res.json({ results, query: q })
  } catch (error) {
    console.error('Error searching transcriptions:', error)
    res.status(500).json({ error: 'Failed to search transcriptions' })
  }
})

// Get batch job information
router.get('/batches', async (req, res) => {
  try {
    // Check if transcription_batches table exists
    const hasTable = await db.schema.hasTable('transcription_batches')
    if (!hasTable) {
      return res.json({ batches: [] })
    }

    const batches = await db('transcription_batches').orderBy('submitted_at', 'desc')

    // Parse file_ids for each batch
    const batchesWithDetails = batches.map((batch) => {
      try {
        batch.file_ids = JSON.parse(batch.file_ids || '[]')
      } catch (e) {
        batch.file_ids = []
      }
      return batch
    })

    res.json({ batches: batchesWithDetails })
  } catch (error) {
    console.error('Error getting batches:', error)
    res.status(500).json({ error: 'Failed to get batch information' })
  }
})

// Get available filter options
router.get('/filters', async (req, res) => {
  try {
    const types = await db('documents').distinct('type').orderBy('type')

    const years = await db('documents').distinct('year').orderBy('year')

    res.json({
      types: types.map((t) => t.type),
      years: years.map((y) => y.year),
    })
  } catch (error) {
    console.error('Error getting filters:', error)
    res.status(500).json({ error: 'Failed to get filter options' })
  }
})

// Serve PDF files
router.get('/pdf/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params
    const secrets = require('../secrets')
    const path = require('path')
    const fs = require('fs')

    // Get file info from database
    const fileInfo = await db('document_files').where('id', fileId).first()

    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found' })
    }

    // Construct full path using base directory + relative path
    const fullPath = path.join(secrets.base_directory, fileInfo.file_path)

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.error(`PDF file not found: ${fullPath}`)
      return res.status(404).json({ error: 'PDF file not found on disk' })
    }

    // Set appropriate headers for PDF
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath)}"`)

    // Stream the PDF file
    fs.createReadStream(fullPath).pipe(res)
  } catch (error) {
    console.error('Error serving PDF:', error)
    res.status(500).json({ error: 'Failed to serve PDF file' })
  }
})

module.exports = router
