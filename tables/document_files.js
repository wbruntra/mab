/**
 * document_files Table DDL:
 * BEGIN_DDL
CREATE TABLE document_files (
    id INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    file_path varchar(255) NOT NULL,
    part_number INTEGER NOT NULL,
    file_size INTEGER,
    created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    transcription TEXT,
    transcription_status varchar(255) DEFAULT 'pending',
    transcription_metadata TEXT,
    PRIMARY KEY (id),
    CONSTRAINT fk_document_files_document_id_documents_id FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- References:
-- * documents via document_id (fk_document_files_document_id_documents_id)
 * END_DDL
 */
const { Model } = require('objection')
const knex = require('../db')


// Initialize knex connection for all models
if (!Model.knex()) {
  Model.knex(knex)
}

class DocumentFiles extends Model {
  static get tableName() {
    return 'document_files'
  }
  

  // TODO: Add jsonSchema based on DDL above
  // TODO: Add relationMappings if needed
}

module.exports = DocumentFiles
