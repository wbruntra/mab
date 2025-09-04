/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('documents', function(table) {
    table.text('summary').nullable().comment('AI-generated summary of document content')
    table.text('summary_metadata').nullable().comment('Metadata about summary generation (service, model, etc.)')
  })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('documents', function(table) {
    table.dropColumn('summary')
    table.dropColumn('summary_metadata')
  })
};
