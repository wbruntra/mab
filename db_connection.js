const knex = require('knex')
const knexfile = require('./knexfile')

const db = knex(knexfile[process.env.NODE_ENV || 'development'])

module.exports = db