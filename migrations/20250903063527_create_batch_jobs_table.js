/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('batch_jobs', function(table) {
    table.increments('id').primary()
    table.string('batch_id').unique().notNullable()
    table.string('input_file_id').nullable()
    table.string('output_file_id').nullable()
    table.string('error_file_id').nullable()
    table.string('status').notNullable()
    table.string('endpoint').nullable()
    table.string('model').nullable()
    table.text('metadata').nullable() // JSON string
    table.text('word_list').nullable() // JSON array of items being processed
    table.integer('request_count_total').defaultTo(0)
    table.integer('request_count_completed').defaultTo(0)
    table.integer('request_count_failed').defaultTo(0)
    table.datetime('submitted_at').nullable()
    table.datetime('completed_at').nullable()
    table.datetime('processed_at').nullable()
    table.timestamps(true, true) // created_at, updated_at
    table.text('error_message').nullable()
    
    // Indexes
    table.index(['status'])
    table.index(['submitted_at'])
    table.index(['completed_at'])
    table.index(['processed_at'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('batch_jobs')
}
