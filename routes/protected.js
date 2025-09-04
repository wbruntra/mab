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



module.exports = router
