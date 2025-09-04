/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('document_files', function(table) {
    table.increments('id').primary()
    table.integer('document_id').unsigned().notNullable()
    table.string('file_path').notNullable()
    table.integer('part_number').notNullable()
    table.integer('file_size').nullable()
    table.timestamps(true, true) // created_at, updated_at
    
    // Foreign key constraint
    table.foreign('document_id').references('id').inTable('documents').onDelete('CASCADE')
    
    // Indexes
    table.index(['document_id'])
    table.index(['part_number'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('document_files')
}
