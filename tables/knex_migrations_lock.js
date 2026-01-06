/**
 * knex_migrations_lock Table DDL:
 * BEGIN_DDL
CREATE TABLE knex_migrations_lock (
    index INTEGER NOT NULL,
    is_locked INTEGER,
    PRIMARY KEY (index)
);
 * END_DDL
 */
const { Model } = require('objection')
const knex = require('../db')


// Initialize knex connection for all models
if (!Model.knex()) {
  Model.knex(knex)
}

class KnexMigrationsLock extends Model {
  static get tableName() {
    return 'knex_migrations_lock'
  }
  

  // TODO: Add jsonSchema based on DDL above
  // TODO: Add relationMappings if needed
}

module.exports = KnexMigrationsLock
