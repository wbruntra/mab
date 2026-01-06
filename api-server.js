const express = require('express')
const cors = require('cors')
const path = require('path')
const cookieSession = require('cookie-session')
const db = require('./db_connection.js')

const app = express()
const PORT = process.env.PORT || 3001
const secrets = require('./secrets.js')

const password = secrets.authorizationCode

const cookieOpts = {
  name: 'mab-letters',
  keys: [secrets.cookieSecret],
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
}

app.use(cookieSession(cookieOpts))

app.use(express.json())

app.post('/api/auth/login', (req, res) => {
  const { password: inputPassword } = req.body

  if (inputPassword === password) {
    req.session.authenticated = true
    res.json({ success: true })
  } else {
    res.status(401).json({ error: 'Invalid password' })
  }
})

app.post('/api/auth/logout', (req, res) => {
  req.session = null
  res.json({ success: true })
})

app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.authenticated),
  })
})

const protectedRoutes = require('./routes/protected.js')

app.use('/api', protectedRoutes)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Transcription API server running on http://localhost:${PORT}`)
  console.log(`📊 API endpoints available:`)
  console.log(`   GET /api/stats - Overall statistics`)
  console.log(`   GET /api/documents - List documents with pagination`)
  console.log(`   GET /api/documents/:id - Document details`)
  console.log(`   GET /api/files/:id - File details with transcription`)
  console.log(`   GET /api/search?q=text - Search transcriptions`)
  console.log(`   GET /api/batches - Batch job information`)
  console.log(`   GET /api/filters - Available filter options`)
  console.log(`   GET /api/pdf/:fileId - Serve PDF files`)
})

module.exports = app
