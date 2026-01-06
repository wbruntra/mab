/**
 * knex_migrations Table DDL:
 * BEGIN_DDL
CREATE TABLE knex_migrations (
    id INTEGER NOT NULL,
    name varchar(255),
    batch INTEGER,
    migration_time datetime,
    PRIMARY KEY (id)
);
 * END_DDL
 */
const { Model } = require('objection')
const knex = require('../db')


// Initialize knex connection for all models
if (!Model.knex()) {
  Model.knex(knex)
}

class KnexMigrations extends Model {
  static get tableName() {
    return 'knex_migrations'
  }
  

  // TODO: Add jsonSchema based on DDL above
  // TODO: Add relationMappings if needed
}

module.exports = KnexMigrations
