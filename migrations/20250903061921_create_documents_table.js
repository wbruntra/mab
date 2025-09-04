/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('documents', function(table) {
    table.increments('id').primary()
    table.string('document_key').unique().notNullable()
    table.string('date').notNullable()
    table.string('type').notNullable()
    table.integer('year').notNullable()
    table.text('source_files').notNullable() // JSON array of file paths
    table.string('combined_pdf_path').nullable()
    table.text('transcription').nullable()
    table.string('transcription_status').defaultTo('pending')
    table.text('metadata').nullable() // JSON metadata
    table.timestamps(true, true) // created_at, updated_at
    
    // Indexes
    table.index(['year'])
    table.index(['type'])
    table.index(['transcription_status'])
    table.index(['date'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('documents')
}
