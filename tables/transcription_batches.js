/**
 * transcription_batches Table DDL:
 * BEGIN_DDL
CREATE TABLE transcription_batches (
    id INTEGER NOT NULL,
    batch_id varchar(255) NOT NULL,
    status varchar(255) NOT NULL,
    input_file_id varchar(255),
    output_file_id varchar(255),
    error_file_id varchar(255),
    request_count INTEGER DEFAULT '0',
    completed_count INTEGER DEFAULT '0',
    failed_count INTEGER DEFAULT '0',
    submitted_at datetime DEFAULT CURRENT_TIMESTAMP,
    completed_at datetime,
    processed_at datetime,
    description TEXT,
    file_ids TEXT,
    PRIMARY KEY (id),
    CONSTRAINT transcription_batches_batch_id_unique UNIQUE (batch_id)
);
 * END_DDL
 */
const { Model } = require('objection')
const knex = require('../db')


// Initialize knex connection for all models
if (!Model.knex()) {
  Model.knex(knex)
}

class TranscriptionBatches extends Model {
  static get tableName() {
    return 'transcription_batches'
  }
  

  // TODO: Add jsonSchema based on DDL above
  // TODO: Add relationMappings if needed
}

module.exports = TranscriptionBatches
