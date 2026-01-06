/**
 * documents Table DDL:
 * BEGIN_DDL
CREATE TABLE documents (
    id INTEGER NOT NULL,
    document_key varchar(255) NOT NULL,
    date varchar(255) NOT NULL,
    type varchar(255) NOT NULL,
    year INTEGER NOT NULL,
    source_files TEXT NOT NULL,
    combined_pdf_path varchar(255),
    transcription TEXT,
    transcription_status varchar(255) DEFAULT 'pending',
    metadata TEXT,
    created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summary TEXT,
    summary_metadata TEXT,
    PRIMARY KEY (id),
    CONSTRAINT documents_document_key_unique UNIQUE (document_key)
);

-- Referenced by:
-- * document_files.document_id (fk_document_files_document_id_documents_id)
 * END_DDL
 */
const { Model } = require('objection')
const knex = require('../db')


// Initialize knex connection for all models
if (!Model.knex()) {
  Model.knex(knex)
}

class Documents extends Model {
  static get tableName() {
    return 'documents'
  }
  

  // TODO: Add jsonSchema based on DDL above
  // TODO: Add relationMappings if needed
}

module.exports = Documents
