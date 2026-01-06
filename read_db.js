const knex = require('./db_connection')
const fs = require('fs')
const path = require('path')

// Function to get table DDL using SQLite PRAGMA commands
const getTableDdl = async (tableName) => {
  try {
    // Get column information using PRAGMA table_info
    const columnsResult = await knex.raw(`PRAGMA table_info(${tableName})`)

    // Get foreign key information using PRAGMA foreign_key_list
    const foreignKeysResult = await knex.raw(`PRAGMA foreign_key_list(${tableName})`)

    // Get index information using PRAGMA index_list and index_info
    const indexListResult = await knex.raw(`PRAGMA index_list(${tableName})`)

    const columns = columnsResult
    const foreignKeys = foreignKeysResult
    const indexes = indexListResult

    // Process primary keys and unique constraints from column info and indexes
    const primaryKeys = columns
      .filter((col) => col.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((col) => col.name)

    // Get unique constraints from indexes
    const uniqueConstraints = []
    for (const index of indexes) {
      if (index.unique && !index.name.startsWith('sqlite_autoindex')) {
        const indexInfoResult = await knex.raw(`PRAGMA index_info(${index.name})`)
        const columnNames = indexInfoResult.map((info) => info.name).join(', ')
        uniqueConstraints.push({
          constraint_name: index.name,
          columns: columnNames,
        })
      }
    }

    // Build CREATE TABLE statement
    let ddl = `CREATE TABLE ${tableName} (\n`

    // Add columns
    const columnDefinitions = columns.map((col) => {
      let def = `    ${col.name} `

      // Add data type (SQLite uses simpler type system)
      def += col.type

      // Add NOT NULL
      if (col.notnull === 1) {
        def += ' NOT NULL'
      }

      // Add default value
      if (col.dflt_value !== null) {
        def += ` DEFAULT ${col.dflt_value}`
      }

      return def
    })

    ddl += columnDefinitions.join(',\n')

    // Add primary key constraint
    if (primaryKeys.length > 0) {
      ddl += `,\n    PRIMARY KEY (${primaryKeys.join(', ')})`
    }

    // Add unique constraints
    uniqueConstraints.forEach((constraint) => {
      ddl += `,\n    CONSTRAINT ${constraint.constraint_name} UNIQUE (${constraint.columns})`
    })

    // Add foreign key constraints
    foreignKeys.forEach((fk) => {
      ddl += `,\n    CONSTRAINT fk_${tableName}_${fk.from}_${fk.table}_${fk.to} FOREIGN KEY (${fk.from}) REFERENCES ${fk.table}(${fk.to})`
    })

    ddl += '\n);'

    return ddl
  } catch (error) {
    throw new Error(`Failed to generate DDL for table ${tableName}: ${error.message}`)
  }
}

// Function to get tables that reference the current table
const getReferencedBy = async (tableName) => {
  try {
    // Get all table names first
    const tablesResult = await knex.raw(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `)

    const referencedBy = []

    // Check each table for foreign keys that reference our table
    for (const table of tablesResult) {
      const foreignKeysResult = await knex.raw(`PRAGMA foreign_key_list(${table.name})`)

      for (const fk of foreignKeysResult) {
        if (fk.table === tableName) {
          referencedBy.push({
            table_name: table.name,
            column_name: fk.from,
            constraint_name: `fk_${table.name}_${fk.from}_${fk.table}_${fk.to}`,
          })
        }
      }
    }

    return referencedBy
  } catch (error) {
    console.error(`Error getting referenced by for ${tableName}:`, error)
    return []
  }
}

// Function to get tables that this table references
const getReferences = async (tableName) => {
  try {
    const foreignKeysResult = await knex.raw(`PRAGMA foreign_key_list(${tableName})`)

    const references = foreignKeysResult.map((fk) => ({
      referenced_table_name: fk.table,
      column_name: fk.from,
      constraint_name: `fk_${tableName}_${fk.from}_${fk.table}_${fk.to}`,
    }))

    return references
  } catch (error) {
    console.error(`Error getting references for ${tableName}:`, error)
    return []
  }
}

const hashLogic = (tableName) => {
  return ''
  //   if (!config.hashPrefixes[tableName]) return ''

  //   const hashPrefix = config.hashPrefixes[tableName]

  //   return `
  //   static encodeId(id) {
  //     return toHash(id, '${hashPrefix}')
  //   }

  //   static decodeId(hash) {
  //     return deHash(hash, '${hashPrefix}')
  //   }
  // `
}

const generateModelFile = async (tableName) => {
  const hashLogicResult = hashLogic(tableName)

  try {
    const filePath = path.join(__dirname, 'tables', `${tableName}.js`)
    const ddl = await getTableDdl(tableName)

    // Get relationship information
    const referencedBy = await getReferencedBy(tableName)
    const references = await getReferences(tableName)

    // Create the reference information text
    let referenceInfo = ''

    if (referencedBy.length > 0) {
      referenceInfo += '\n\n-- Referenced by:'
      referencedBy.forEach((ref) => {
        referenceInfo += `\n-- * ${ref.table_name}.${ref.column_name} (${ref.constraint_name})`
      })
    }

    if (references.length > 0) {
      referenceInfo += '\n\n-- References:'
      references.forEach((ref) => {
        referenceInfo += `\n-- * ${ref.referenced_table_name} via ${ref.column_name} (${ref.constraint_name})`
      })
    }

    // Combine DDL and reference info
    const fullDdl = ddl + referenceInfo

    if (fs.existsSync(filePath)) {
      // Update existing file
      let content = fs.readFileSync(filePath, 'utf8')
      let lines = content.split('\n')

      const startMarker = '* BEGIN_DDL'
      const endMarker = '* END_DDL'

      let startIndex = lines.findIndex((line) => line.includes(startMarker))
      if (startIndex === -1) {
        console.error(
          `DDL start marker not found in ${filePath}. Cannot update. Consider deleting the file and regenerating.`,
        )
        return
      }

      let endIndex = lines.findIndex((line) => line.includes(endMarker))
      if (endIndex === -1) {
        console.error(`DDL end marker not found in ${filePath}. Cannot update.`)
        return
      }

      if (endIndex <= startIndex) {
        console.error(`Invalid marker positions in ${filePath}. Cannot update.`)
        return
      }

      // New DDL content lines (raw DDL + reference info split)
      const newDdlLines = fullDdl.split('\n')

      // Create new lines array with updated DDL
      const newLines = lines.slice(0, startIndex + 1).concat(newDdlLines, lines.slice(endIndex))

      // Join back into a string and write to file
      const newContent = newLines.join('\n')
      fs.writeFileSync(filePath, newContent)
      console.log(`Updated ${filePath}`)
    } else {
      // Generate new file
      const fileContent = `/**
 * ${tableName} Table DDL:
 * BEGIN_DDL
${fullDdl.split('\n').join('\n')}
 * END_DDL
 */
const { Model } = require('objection')
const knex = require('../db')
${hashLogicResult ? `const { toHash, deHash } = require('@utils/hashids')\n` : ''}

// Initialize knex connection for all models
if (!Model.knex()) {
  Model.knex(knex)
}

class ${tableNameToClassName(tableName)} extends Model {
  static get tableName() {
    return '${tableName}'
  }
  ${hashLogic(tableName)}

  // TODO: Add jsonSchema based on DDL above
  // TODO: Add relationMappings if needed
}

module.exports = ${tableNameToClassName(tableName)}
`
      fs.writeFileSync(filePath, fileContent)
      console.log(`Generated ${filePath}`)
    }
  } catch (error) {
    console.error(`Error processing table ${tableName}:`, error.message)
  }
}

const tableNameToClassName = (tableName) => {
  return tableName
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

const run = async () => {
  // Create tables directory if it doesn't exist
  const tablesDir = path.join(__dirname, 'tables')
  if (!fs.existsSync(tablesDir)) {
    fs.mkdirSync(tablesDir)
  }

  // Get a list of all the tables in the database using SQLite syntax
  const db_tables = await knex.raw(`
    SELECT name as table_name 
    FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `)

  const tableNames = db_tables.map((row) => row.table_name)

  console.log('Table names:', tableNames)

  // Process all tables
  for (const tableName of tableNames) {
    await generateModelFile(tableName)
  }

  console.log('Finished generating all model files')
}

run()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
