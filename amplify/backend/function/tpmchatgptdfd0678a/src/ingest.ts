import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import { DocxLoader } from 'langchain/document_loaders/fs/docx'
import { JSONLoader } from 'langchain/document_loaders/fs/json'
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { PineconeStore } from 'langchain/vectorstores/pinecone'
import YError from 'yerror'
import { LambdaFunctionURLEvent, LambdaFunctionURLResponse } from './interfaces'
import { collection, nullLambdaFunctionURLEvent } from './collection'
import { AddInput, Convert, Credentials } from './datamodels'
import { initPinecone } from './util/pineconeclient'
import { isLambdaMock } from './runtype'
import { readGoogleDoc } from './util/google/gdoc'
import { readGoogleSheet } from './util/google/gsheet'
import { listGoogleFolder, FolderItem, folderMimeType, readDriveFile, exportDriveFile } from './util/google/gdrive'
import { sanitize } from 'sanitize-filename-ts'
import { env } from 'node:process'
import { GaxiosError } from 'gaxios'
import axios from 'axios'
import { validateOpenAIKey } from './index'
import { CSVLoader } from 'langchain/document_loaders/fs/csv'
import { CustomExcelLoader } from './util/customExcelLoader'

const Busboy = require('busboy')
const fs = require('fs')
const path = require('path')

// dir for use by the Lambda
export const DESTINATION_DIR = (isLambdaMock) ? '/tmp/col' : '/tmp'

//
export const upload = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  let payload: string
  try {
    const body = event?.body ?? ''
    if (event?.isBase64Encoded ?? false) {
      payload = Buffer.from(body, 'base64').toString('utf8')
    } else {
      payload = body
    }
  } catch (error) {
    console.log('error converting payload:', error)
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'No uploaded file'
      })
    }
  }
  if (payload.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'No uploaded file'
      })
    }
  }

  // personal key overides
  // "x-key-openai": openAiKey,
  // "x-key-anthropic": anthropicKey
  if (event?.headers?.['x-key-openai'] != null) {
    const openaiKey = event.headers['x-key-openai']
    if (openaiKey.length !== 0) {
      credentials.openAiApiKey = openaiKey
      console.log('personal openai key', credentials.openAiApiKey)
      const ret = await validateOpenAIKey(openaiKey)
      if (ret !== null) {
        return ret
      }
    }
  }
  if (event?.headers?.['x-key-anthropic'] != null) {
    const anthropicKey = event.headers['x-key-anthropic']
    if (anthropicKey.length !== 0) {
      credentials.anthropicKey = anthropicKey
      console.log('personal anthropic key', credentials.anthropicKey)
    }
  }
  // write OPENAI_API_KEY env var to the process because:
  // OPENAI_API_KEY is required to be an ENV var by current code dependency
  env.OPENAI_API_KEY = credentials.openAiApiKey

  // load docs into dir
  const contype = event?.headers?.['content-type'] ?? ''
  try {
    emptyTheTmpDir()

    // parse incoming multipart into files in the dir
    const loadedDocs = await getMultiParts(payload, {
      'content-type': contype
    }, DESTINATION_DIR)
    console.log('multiparts loaded=', loadedDocs)
  } catch (error) {
    console.log('error', error)
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Failed to ingest from url'
      })
    }
  }
  return await langChainIngest(credentials)
}

const getMultiParts = async (content: any, headers: any, destDir: string): Promise<boolean> =>
  await new Promise((resolve, reject) => {
    const filePromises = [] as any
    const bb = Busboy({
      headers
    })

    bb.on('file', (name: string, file: any, info: any) => {
      const filename = info.filename
      const saveTo = path.join(destDir, filename)

      file.on('data', (data: any) => {
        // console.log('Saving to', filename);
        fs.writeFileSync(saveTo, data)
      })
    })

    bb.on('error', (err: Error) => reject(YError.wrap(err)))
    bb.on('finish', () =>
      resolve(Promise.all(filePromises).then(() => {
        return true
      }))
    )
    bb.write(content)
    bb.end()
  })

//
// add from a url.
// Could be a supported filetype or a Google Docs or Spreadsheet link,
//    or a Google Drive folder
//    or a file url
export const add = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  // {"url":"http://exampleexzmple.com"}
  let addInput: AddInput
  try {
    const body = event?.body ?? ''
    if (event?.isBase64Encoded ?? false) {
      addInput = Convert.toAddInput(Buffer.from(body, 'base64').toString('utf8'))
    } else {
      addInput = Convert.toAddInput(body)
    }
  } catch (error) {
    console.log('error finding input url:', error)

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'No url found'
      })
    }
  }
  if (addInput.url.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'No url found'
      })
    }
  }
  // personal key overides
  if (addInput.openAiKey.length !== 0) {
    credentials.openAiApiKey = addInput.openAiKey
    console.log('personal openai key', credentials.openAiApiKey)
    const ret = await validateOpenAIKey(addInput.openAiKey)
    if (ret !== null) {
      return ret
    }
  }
  if (addInput.anthropicKey.length !== 0) {
    credentials.anthropicKey = addInput.anthropicKey
    console.log('personal anthropic key', credentials.anthropicKey)
  }
  // write OPENAI_API_KEY env var to the process because:
  // OPENAI_API_KEY is required to be an ENV var by current code dependency
  env.OPENAI_API_KEY = credentials.openAiApiKey

  // if not a Google Doc, Sheet or GDrive folder, upload the file.
  // doc
  // https://docs.google.com/document/d/1dRmrPrHK356JymDX4xp8ImQ8zNjSttMJAx0DyEtGGGk/edit
  // spreadsheet
  // https://docs.google.com/spreadsheets/d/1qade4nAAxb842as7Y1WVSoBi4v0tdM7bh9YuNAt5CHU/edit#gid=0
  // folder
  // https://drive.google.com/drive/folders/1e_rjH9Y-08V6fDQC6Uui4124fJ2fbAfk
  // https://drive.google.com/drive/u/0/folders/1jtyirJ_qOPEe3DjODFhWeBajSH08zUIV
  // else file
  if (addInput.url.startsWith('https://docs.google.com/document/d/')) {
    // handle GDoc
    return await handleGoogleDoc(addInput.url, credentials)
  } else if (addInput.url.startsWith('https://docs.google.com/spreadsheets/d/')) {
    // handle GSheet
    return await handleGoogleSheet(addInput.url, credentials)
  } else if (addInput.url.startsWith('https://drive.google.com/drive/')) {
    // handle an entire folder
    return await handleGoogleDriveFolder(addInput.url, credentials)
  } else {
    // upload as a regular file
    return await fileUpload(addInput.url, credentials)
  }
}

// List a Google Drive folder from url
const handleGoogleDriveFolder = async (url: string, credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  emptyTheTmpDir()
  const folderId = extractGoogleFolderId(url)
  console.log('GDrive folder=', folderId)
  if (folderId.length === 0) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'folder url not recognized'

      })
    }
  }

  // list drive files
  const glist = await listGoogleFolder(folderId, credentials.google)
  if (glist.length === 0) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'no files found in drive'

      })
    }
  }

  // iterate through the list acting on the different file types
  const count = await handleGDriveFiles(glist, credentials)
  if (count === 0) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'no files actually processed'

      })
    }
  }

  listdir(DESTINATION_DIR)

  // return {
  //   statusCode: 404,
  //   headers: {
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     error: 'early dev exit'

  //   })
  // }
  return await langChainIngest(credentials)
}

// sources:
// https://developers.google.com/drive/api/guides/mime-types
// https://developers.google.com/drive/api/guides/manage-downloads
// https://developers.google.com/drive/api/guides/ref-export-formats

const handleGDriveFiles = async (list: FolderItem[], credentials: Credentials): Promise<number> => {
  let fileCount: number = 0
  let totalSize: number = 0

  for (const ent of list) {
    if (ent.name.startsWith('[SNAPSHOT]')) {
      // skip [SNAPSHOT] files to reduce duplicate data
      continue
    }
    if (ent.mimeType.startsWith('application/vnd.google-apps.drive-sdk')) {
      // third party shortcut or app data types - like LucidCharts
      continue
    }
    switch (ent.mimeType) {
      // in order of importance
      case 'application/vnd.google-apps.document': {
        const success = await getGoogleDoc(ent.id, ent.parentName, credentials)
        fileCount = fileCount + success
        if (success === 1) {
          totalSize = totalSize + (+(ent.size))
        }
        break
      }
      case 'application/vnd.google-apps.spreadsheet': {
        const success = await getGoogleSheet(ent.id, ent.parentName, credentials)
        fileCount = fileCount + success
        if (success === 1) {
          totalSize = totalSize + (+(ent.size))
        }
        break
      }
      case 'application/vnd.google-apps.presentation': {
        // These can be exported as pdf or text. We'll have it go straight to text
        // https://developers.google.com/drive/api/guides/ref-export-formats
        const success = await getExportDriveFile(ent.id, ent.name, ent.parentName, '.txt', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      case 'application/pdf': {
        const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.pdf', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      case 'text/plain': {
        const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.txt', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      case 'application/json': {
        const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.json', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      case 'text/xml': { // treat xml as txt
        const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.txt', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { // for files like 'test_word.docx'
        const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.docx', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      case 'text/csv': {
        const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.csv', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { // for files like 'Test_XLSX1.xlsx'
        const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.xlsx', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      case 'application/vnd.ms-excel': { // for files like 'IdeasExportTemplate.xls'
        const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.xls', credentials)
        if (success > 0) {
          fileCount = fileCount + 1
          totalSize = totalSize + success
        }
        break
      }
      // case 'application/octet-stream': { // binary files
      //   // these are the truly unknown-to-Google file types
      //   if (ent.name.endsWith('.jsonl')) {
      //     const success = await getRawDriveFile(ent.id, ent.name, ent.parentName, '.jsonl', credentials)
      //     if (success > 0) {
      //       fileCount = fileCount + 1
      //       totalSize = totalSize + success
      //     }
      //   }
      //   break
      // }

      // skip these types
      case folderMimeType: // skip folders, only handle files
      case 'application/octet-stream':
      case 'application/vnd.google-apps.form':
      case 'application/vnd.google-apps.site':
      case 'application/vnd.google-apps.drive-sdk.7081045131': // Lucidcharts
      case 'application/zip':
      case 'video/mp4':
      case 'image/png':
      case 'image/gif':
      case 'image/jpeg':
      case 'image/svg+xml':
      case 'application/vnd.google-apps.video':
      case 'application/vnd.google-apps.audio':
      case 'application/vnd.google-apps.photo':
      case 'application/vnd.google-apps.shortcut':
      case 'application/vnd.google-apps.fusiontable': // Google Fusion Tables
      case 'application/vnd.google-apps.jam': // Google Jamboard
      case 'application/vnd.google-apps.map': // Google My Maps
      case 'application/vnd.google-apps.script+json': // Apps Scripts
      case 'application/vnd.google-apps.script': // Apps Scripts
      case 'application/vnd.google-apps.drawing': // note these can be converted to PDF
      case 'application/vnd.google-apps.unknown':
      case 'application/vnd.jgraph.mxfile': // draw.io file - don't know how to convert
        // case 'application/vnd.google-apps.file': // what are these?
        console.log(`ignored mimeType ${ent.mimeType} ${ent.id} '${ent.parentName}/${ent.name}'`)

        continue

      default:
        console.log(`unhandled mimeType ${ent.mimeType} ${ent.id} '${ent.parentName}/${ent.name}'`)
        break
    }
  }

  return fileCount
}

async function getGoogleDoc (documentId: string, folder: string, credentials: Credentials): Promise<number> {
  try {
    const gDoc = await readGoogleDoc(documentId, credentials.google)
    const filename = sanitize(gDoc.title + `__id(${documentId}).txt`)
    const parent = sanitize(folder)
    // console.log(`sanitize=${filename}`)
    const parentDir = path.join(DESTINATION_DIR, parent)
    if (fs.existsSync(parentDir) !== true) {
      fs.mkdirSync(parentDir)
    }

    // place file in the tmp dir
    fs.writeFileSync(path.join(parentDir, filename), gDoc.content)
  } catch (error) {
    if (error instanceof GaxiosError) {
      console.log(`getGoogleDoc ${documentId} err: ${error.message}`)
    } else {
      console.log(`getGoogleDoc ${documentId} err=`, error)
    }
    return 0
  }
  return 1
}
async function getGoogleSheet (documentId: string, folder: string, credentials: Credentials): Promise<number> {
  try {
    const gDoc = await readGoogleSheet(documentId, credentials.google)
    const filename = sanitize(gDoc.title + `__id(${documentId}).txt`)
    const parent = sanitize(folder)
    // console.log(`sanitize=${filename}`)
    const parentDir = path.join(DESTINATION_DIR, parent)
    if (fs.existsSync(parentDir) !== true) {
      fs.mkdirSync(parentDir)
    }

    // place file in the tmp dir
    fs.writeFileSync(path.join(parentDir, filename), gDoc.content)
  } catch (error) {
    if (error instanceof GaxiosError) {
      console.log(`getGoogleDoc ${documentId} err: ${error.message}`)
    } else {
      console.log(`getGoogleDoc ${documentId} err=`, error)
    }
    return 0
  }
  return 1
}

async function getRawDriveFile (documentId: string, name: string, folder: string, ext: string, credentials: Credentials): Promise<number> {
  console.log(`getRawDriveFile(${name})`)
  let size: number = 0
  try {
    const rawFile = await readDriveFile(documentId, credentials.google)
    const filename = sanitize(name + `__id(${documentId})${ext}`)
    const parent = sanitize(folder)
    // console.log(`sanitize=${filename}`)
    // place file in the tmp dir
    fs.writeFileSync(path.join(DESTINATION_DIR, parent, filename), Buffer.from(rawFile.content))
    size = rawFile.size
  } catch (error) {
    if (error instanceof GaxiosError) {
      console.log(`getRawDriveFile ${documentId} err: ${error.message}`)
    } else {
      console.log(`getRawDriveFile ${documentId} err=`, error)
    }
    return 0
  }
  return size
}

async function getExportDriveFile (documentId: string, name: string, folder: string, ext: string, credentials: Credentials): Promise<number> {
  console.log(`getExportDriveFile(${name})`)
  let size: number = 0
  try {
    const rawFile = await exportDriveFile(documentId, credentials.google)
    const filename = sanitize(name + `__id(${documentId})${ext}`)
    const parent = sanitize(folder)
    // console.log(`sanitize=${filename}`)
    // place file in the tmp dir
    fs.writeFileSync(path.join(DESTINATION_DIR, parent, filename), Buffer.from(rawFile.content))
    size = rawFile.size
  } catch (error) {
    if (error instanceof GaxiosError) {
      console.log(`getExportDriveFile ${documentId} err: ${error.message}`)
    } else {
      console.log(`getExportDriveFile ${documentId} err=`, error)
    }
    return 0
  }
  return size
}

// Read Google Doc from url
const handleGoogleDoc = async (url: string, credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  emptyTheTmpDir()
  console.log(credentials)
  const documentId = extractGoogleDocId(url)
  if (documentId.length === 0) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'url not recognized'

      })
    }
  }
  try {
    const gDoc = await readGoogleDoc(documentId, credentials.google)
    const filename = sanitize(gDoc.title + `__id(${documentId}).txt`)
    console.log(`sanitize=${filename}`)
    // place file in the tmp dir
    fs.writeFileSync(path.join(DESTINATION_DIR, filename), gDoc.content)
    // console.log(`gdoc content len=${gDoc.content.length}`)

    // is the file there?
    // listdir(DESTINATION_DIR)
  } catch (error) {
    emptyTheTmpDir()

    if (error instanceof GaxiosError) {
      if (error.message === 'The caller does not have permission') {
        return {
          statusCode: 401,
          body: JSON.stringify({
            error: 'Permission Denied'
          })
        }
      } else if (error.message === 'Requested entity was not found.') {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: 'Document not found'
          })
        }
      } else {
        console.log('GaxiosError', error.message, error)
      }
    }
    console.log('ingest error', error)
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Error accessing the Google Doc'
      })
    }
  }

  return await langChainIngest(credentials)
}

// Read Google Sheet from url
const handleGoogleSheet = async (url: string, credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  emptyTheTmpDir()
  const spreadsheetId = extractGoogleSheetId(url)
  if (spreadsheetId.length === 0) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'url not recognized'

      })
    }
  }
  try {
    const gDoc = await readGoogleSheet(spreadsheetId, credentials.google)
    const filename = sanitize(gDoc.title + `__id(${spreadsheetId}).txt`)
    console.log(`sanitize=${filename}`)
    // place file in the tmp dir
    fs.writeFileSync(path.join(DESTINATION_DIR, filename), gDoc.content)
    // console.log(`gsheet content len=${gDoc.content.length}`)

    // is the file there?
    // listdir(DESTINATION_DIR)
  } catch (error) {
    emptyTheTmpDir()

    if (error instanceof GaxiosError) {
      if (error.message === 'The caller does not have permission') {
        return {
          statusCode: 401,
          body: JSON.stringify({
            error: 'Permission Denied'
          })
        }
      } else if (error.message === 'Requested entity was not found.') {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: 'Spreadsheet not found'
          })
        }
      } else {
        console.log('GaxiosError', error.message, error)
      }
    }
    console.log('ingest error', error)
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Error accessing the Google Spreadsheet'
      })
    }
  }

  return await langChainIngest(credentials)
}

// Ingest a file from a url
const fileUpload = async (url: string, credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  emptyTheTmpDir()
  try {
    await downloadFile(url)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.message === 'The caller does not have permission') {
        return {
          statusCode: 401,
          body: JSON.stringify({
            error: 'Permission Denied'
          })
        }
      } else if (error.message === 'Request failed with status code 404') {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: 'File not found'
          })
        }
      }
      console.log('Axios file access error.message', error.message)
    }
    console.log('file access error', error)
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: `Problem accessing file - ${error as string}`
      })
    }
  }
  return await langChainIngest(credentials)
}

// download a file and save it
async function downloadFile (url: string): Promise<void> {
  const filename = path.basename(url)
  const response = await axios.get(url, { responseType: 'stream' })
  const writer = fs.createWriteStream(path.join(DESTINATION_DIR, filename))

  response.data.pipe(writer)

  return await new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

function emptyTheTmpDir (): void {
  if (fs.existsSync(DESTINATION_DIR) !== true) {
    fs.mkdirSync(DESTINATION_DIR)
  }

  // delete any files that already exist
  const lsdel = fs.readdirSync(DESTINATION_DIR)
  lsdel.forEach((filename: string) => {
    const filepath = path.join(DESTINATION_DIR, filename)
    // const info = fs.statSync(filepath);
    // console.log(`deleting ${filename}`, info.size+' bytes');
    fs.unlinkSync(filepath)
  })
}

// add contents of the directory to the (vector) db
const langChainIngest = async (credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  console.log('lCingest')

  try {
    // Start of LangChain loading
    /* load raw docs from the all files in the directory */
    const directoryLoader = new DirectoryLoader(DESTINATION_DIR, {
      '.pdf': (path) => new PDFLoader(path, { splitPages: true }),
      '.docx': (path) => new DocxLoader(path),
      '.json': (path) => new JSONLoader(path),
      '.txt': (path) => new TextLoader(path),
      '.csv': (path) => new CSVLoader(path),
      '.xlsx': (path) => new CustomExcelLoader(path),
      '.xls': (path) => new CustomExcelLoader(path)
    })

    // const loader = new PDFLoader(filePath);
    const rawDocs = await directoryLoader.load()

    /* Split text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    })

    const docs = await textSplitter.splitDocuments(rawDocs)
    console.log('split docs.length=', docs.length)

    console.log('creating vector store...')
    /* create and store the embeddings in the vectorStore */
    const embeddings = new OpenAIEmbeddings()
    // const index = pinecone.Index(PINECONE_INDEX_NAME); //change to your own index name
    const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
    const index = pinecone.Index(credentials.pinecone.indexName)

    // adding the documents
    console.log('adding the documents via fromDocuments...')
    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      namespace: credentials.pinecone.namespace,
      textKey: 'text'
    })

    emptyTheTmpDir()
    return await collection(nullLambdaFunctionURLEvent(), credentials)
  } catch (error) {
    emptyTheTmpDir()
    console.log('lc error', error)
    console.log(typeof error)
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Failed to ingest your data'
      })
    }
  }
}

// https://docs.google.com/document/d/1dRmrPrHK356JymDX4xp8ImQ8zNjSttMJAx0DyEtGGGk/edit
function extractGoogleDocId (url: string): string {
  const match = url.match(/https:\/\/docs\.google\.com\/document\/d\/([\w-]{25,})/)
  return (match != null) ? match[1] : ''
}

// https://docs.google.com/spreadsheets/d/1lTBwij-V3C2x49ys-A4z0bbGnVMoINOx5bjF3aKniXs/edit
function extractGoogleSheetId (url: string): string {
  const match = url.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]{25,})/)
  return (match != null) ? match[1] : ''
}

// https://drive.google.com/drive/folders/1e_rjH9Y-08V6fDQC6Uui4124fJ2fbAfk
// &
// https://drive.google.com/drive/u/0/folders/1jtyirJ_qOPEe3DjODFhWeBajSH08zUIV
function extractGoogleFolderId (url: string): string {
  let match = url.match(/https:\/\/drive\.google\.com\/drive\/folders\/([\w-]{25,})/)
  let result = (match != null) ? match[1] : ''
  if (result.length === 0) {
    // try alternate form
    match = url.match(/https:\/\/drive\.google\.com\/drive\/u\/0\/folders\/([\w-]{25,})/)
    result = (match != null) ? match[1] : ''
  }
  return result
}

function listdir (dir: string): void {
  const ls = fs.readdirSync(dir)
  ls.forEach((filename: string) => {
    const filepath = path.join(dir, filename)
    const info = fs.statSync(filepath)
    console.log(`found ${filename} ${info.size as number} bytes`)
  })
}
