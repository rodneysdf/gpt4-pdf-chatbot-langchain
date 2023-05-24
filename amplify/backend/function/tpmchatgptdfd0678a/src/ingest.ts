import { CSVLoader } from 'langchain/document_loaders/fs/csv'
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import { DocxLoader } from 'langchain/document_loaders/fs/docx'
import {
  JSONLinesLoader,
  JSONLoader
} from 'langchain/document_loaders/fs/json'
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { PineconeStore } from 'langchain/vectorstores/pinecone'
import YError from 'yerror'
import { LambdaFunctionURLEvent, LambdaFunctionURLResponse } from './interfaces'
import { collection, nullLambdaFunctionURLEvent } from './collection'
import { CustomExcelLoader } from './util/customExcelLoader'
// import { CustomPDFLoader } from './util/customPDFLoader';
import axios from 'axios'
import { AddInput, Convert, Credentials } from './datamodels'
import { initPinecone } from './util/pineconeclient'
import { isLambdaMock } from './runtype'
import { readGoogleDoc } from './util/google/gdoc'
import { sanitize } from 'sanitize-filename-ts'
import { env } from 'node:process'

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
  // else file
  if (addInput.url.startsWith('https://docs.google.com/document/d/')) {
    // handle Gdoc
    return await getGoogleDoc(addInput.url, credentials)
  } else if (addInput.url.startsWith('https://docs.google.com/spreadsheets/d/')) {
    // handle Gsheet
  } else if (addInput.url.startsWith('https://drive.google.com/drive/folders/')) {
    // handle an entire folder
  } else {
    // upload as a regular file
    return await fileUpload(addInput.url, credentials)
  }

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

// Read Google Doc from url
const getGoogleDoc = async (url: string, credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  emptyTheTmpDir()
  console.log(credentials)
  const documentId = extractGoogleDocID(url)
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
    console.log(`gdoc content len=${gDoc.content.length}`)

    // is the file there?
    listdir(DESTINATION_DIR)
  } catch (error) {
    emptyTheTmpDir()
    console.log('readGDoc error', error)
    console.log(typeof error)

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Failed to access the Google Doc'
      })
    }
  }

  return await langChainIngest(credentials)
}

// Ingest a file from a url
const fileUpload = async (url: string, credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  emptyTheTmpDir()
  await downloadFile(url)

  return await langChainIngest(credentials)
}

// download a file and save it
async function downloadFile(url: string): Promise<void> {
  const filename = path.basename(url)
  const response = await axios.get(url, { responseType: 'stream' })
  const writer = fs.createWriteStream(path.join(DESTINATION_DIR, filename))

  response.data.pipe(writer)

  return await new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

function emptyTheTmpDir(): void {
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
      // '.pdf': (path) => new CustomPDFLoader(path),
      '.pdf': (path) => new PDFLoader(path, { splitPages: true }),
      '.docx': (path) => new DocxLoader(path),
      '.json': (path) => new JSONLoader(path, '/texts'),
      '.jsonl': (path) => new JSONLinesLoader(path, '/html'),
      '.txt': (path) => new TextLoader(path),
      '.csv': (path) => new CSVLoader(path, 'text'),
      '.xlsx': (path) => new CustomExcelLoader(path),
      '.xls': (path) => new CustomExcelLoader(path)
      // todo add after upgrading langchain
      // '.html': (path) => new UnstructuredHTMLLoader(path),
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

function extractGoogleDocID(url: string): string {
  const match = url.match(/https:\/\/docs\.google\.com\/document\/d\/([\w-]{25,})/)
  return (match != null) ? match[1] : ''
}

function listdir(dir: string): void {
  const ls = fs.readdirSync(dir)
  ls.forEach((filename: string) => {
    const filepath = path.join(dir, filename)
    const info = fs.statSync(filepath)
    console.log(`found ${filename} ${info.size as number} bytes`);
  })
}