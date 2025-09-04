const knex = require('knex')
const knexfile = require('./knexfile')

const db = knex(knexfile[process.env.NODE_ENV || 'development'])

const run = async () => {
  // const documents = await db('documents').select('*')
  const document_files = await db('document_files')
    .select('transcription_status')
    .count('*')
    .groupBy('transcription_status')
  // const batch_jobs = await db('batch_jobs').select('*')

  // console.log(documents)
  console.log(document_files)
  // console.log(batch_jobs)

  await db('document_files')
    .update({
      transcription_status: 'pending',
    })
    .where('transcription_status', 'submitted')
}

run().then(() => {
  process.exit(0)
})
