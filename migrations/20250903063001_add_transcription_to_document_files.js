/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('document_files', function(table) {
    table.text('transcription').nullable()
    table.string('transcription_status').defaultTo('pending')
    table.text('transcription_metadata').nullable() // JSON metadata for transcription service details
    
    // Index for transcription status
    table.index(['transcription_status'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('document_files', function(table) {
    table.dropColumn('transcription')
    table.dropColumn('transcription_status')
    table.dropColumn('transcription_metadata')
  })
}
