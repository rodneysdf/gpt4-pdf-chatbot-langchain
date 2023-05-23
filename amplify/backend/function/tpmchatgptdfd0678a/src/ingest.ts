import { CSVLoader } from "langchain/document_loaders/fs/csv";
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { DocxLoader } from "langchain/document_loaders/fs/docx";
import {
  JSONLinesLoader,
  JSONLoader,
} from "langchain/document_loaders/fs/json";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import YError from 'yerror';
import { LambdaFunctionURLResponse } from "./interfaces";
import { collection, nullLambdaFunctionURLEvent } from "./collection";
import { CustomExcelLoader } from "./util/customExcelLoader";
// import { CustomPDFLoader } from './util/customPDFLoader';
import axios from 'axios';
import { AddInput, Convert, Credentials, LambdaFunctionURLEvent } from "./datamodels";
import { initPinecone } from './util/pineconeclient';
import { isLambdaMock } from './runtype';
import { CredentialData, readGoogleDoc } from './util/google/gdoc'
import { sanitize } from "sanitize-filename-ts";

const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const getRawBody = require('raw-body');

// dir for use by the Lambda
const DESTINATION_DIR = (isLambdaMock) ? "/tmp/col" : "/tmp";


//
export const upload = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  let payload: string
  try {
    if (event.isBase64Encoded) {
      payload = Buffer.from(event.body, 'base64').toString("utf8");
    } else {
      payload = event.body;
    }
  } catch (error) {
    console.log("error converting payload:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No uploaded file"
      })
    }
  }
  if (!payload) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No uploaded file"
      })
    }
  }

  // load docs into dir
  let contype = event.headers['content-type']
  try {
    emptyTheTmpDir()

    // parse incoming multipart into files in the dir
    const lodedDocs = await getMultiParts(payload, {
      'content-type': contype
    }, DESTINATION_DIR)
  } catch (error) {
    console.log('error', error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "Failed to ingest from url"
      })
    }
  }

  return langChainIngest(credentials)

}

const getMultiParts = (content: any, headers: any, destDir: string) =>
  new Promise((resolve, reject) => {
    const filePromises = <any>[];
    const bb = Busboy({
      headers,
    });

    bb.on('file', (name: string, file: any, info: any) => {
      const filename = info.filename;
      const saveTo = path.join(destDir, filename);

      file.on('data', (data: any) => {
        // console.log('Saving to', filename);
        fs.writeFileSync(saveTo, data);
      });
    });

    bb.on('error', (err: Error) => reject(YError.wrap(err)));
    bb.on('finish', () =>
      resolve(Promise.all(filePromises).then(() => {
        return true;
      }))
    );
    bb.write(content);
    bb.end();
  })


//
// add from a url.
// Could be a supported filetype or a Google Docs or Spreadsheet link,
//    or a Google Drive folder
//    or a file url
export const add = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {

  let payload: string
  try {
    if (event.isBase64Encoded) {
      payload = Buffer.from(event.body, 'base64').toString("utf8");
    } else {
      payload = event.body;
    }
  } catch (error) {
    console.log("error converting payload:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No url"
      })
    }
  }
  if (!payload) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No url"
      })
    }
  }
  // {"url":"http://exampleexzmple.com"}
  let add: AddInput
  try {
    if (event.isBase64Encoded) {
      add = Convert.toAddInput(Buffer.from(payload, 'base64').toString("utf8"));
    } else {
      add = Convert.toAddInput(payload);
    }
  } catch (error) {
    console.log("error finding input url:", error);

    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No url found"
      })
    }
  }
  if (!add.url) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No url found"
      })
    }
  }

  // if not a Google Doc, Sheet or GDrive folder, upload the file.
  // doc
  // https://docs.google.com/document/d/1dRmrPrHK356JymDX4xp8ImQ8zNjSttMJAx0DyEtGGGk/edit
  // spreadsheet
  // https://docs.google.com/spreadsheets/d/1qade4nAAxb842as7Y1WVSoBi4v0tdM7bh9YuNAt5CHU/edit#gid=0
  // folder
  // https://drive.google.com/drive/folders/1e_rjH9Y-08V6fDQC6Uui4124fJ2fbAfk
  // else file
  if (add.url.startsWith('https://docs.google.com/document/d/')) {
    // handle Gdoc
    return getGoogleDoc(add.url, credentials)
  } else if (add.url.startsWith('https://docs.google.com/spreadsheets/d/')) {
    // handle Gsheet
  } else if (add.url.startsWith('https://drive.google.com/drive/folders/')) {
    // handle an entire folder
  } else {
    // upload as a regular file
    return fileUpload(add.url, credentials)
  }

  return {
    statusCode: 400,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "error": "url not recognized"

    })
  }
}

// Read Google Doc from url
const getGoogleDoc = async (url: string, credentials: Credentials):
  Promise<LambdaFunctionURLResponse> => {
  console.log("getGoogleDoc ", url)
  emptyTheTmpDir()
  console.log("getGoogleDoc emptied")
  const id = extractGoogleDocID(url)
  if (!id) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "error": "url not recognized"

      })
    }
  }
  const gDoc = await readGoogleDoc(id, credentials.google)
  const filename = sanitize(gDoc.title)
  console.log(`filename=${filename}`)
  console.log(`sanitize=${filename}`)

  return {
    statusCode: 400,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "error": "url not recognized"

    })
  }
  // return langChainIngest(credentials)
}

// Ingest a file from a url
const fileUpload = async (url: string, credentials: Credentials):
  Promise<LambdaFunctionURLResponse> => {
  emptyTheTmpDir()
  await downloadFile(url)

  return langChainIngest(credentials)
}

// download a file and save it
async function downloadFile(url: string): Promise<void> {
  const filename = path.basename(url);
  const response = await axios.get(url, { responseType: 'stream' });
  const writer = fs.createWriteStream(path.join(DESTINATION_DIR, filename));

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function emptyTheTmpDir(): void {
  if (!fs.existsSync(DESTINATION_DIR)) {
    fs.mkdirSync(DESTINATION_DIR);
  }

  // delete any files that already exist
  const lsdel = fs.readdirSync(DESTINATION_DIR);
  lsdel.forEach((filename: string) => {
    const filepath = path.join(DESTINATION_DIR, filename);
    // const info = fs.statSync(filepath);
    // console.log(`deleting ${filename}`, info.size+' bytes');
    fs.unlink(filepath, (err: any) => {
      if (err) throw err;
    });
  });
}

// add contents of the directory to the (vector) db
const langChainIngest = async (credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  try {
    // Start of LangChain loading
    /* load raw docs from the all files in the directory */
    const directoryLoader = new DirectoryLoader(DESTINATION_DIR, {
      // '.pdf': (path) => new CustomPDFLoader(path),
      '.pdf': (path) => new PDFLoader(path, { splitPages: true }),
      '.docx': (path) => new DocxLoader(path),
      '.json': (path) => new JSONLoader(path, "/texts"),
      '.jsonl': (path) => new JSONLinesLoader(path, "/html"),
      '.txt': (path) => new TextLoader(path),
      '.csv': (path) => new CSVLoader(path, "text"),
      '.xlsx': (path) => new CustomExcelLoader(path),
      '.xls': (path) => new CustomExcelLoader(path),
      // todo add after upgrading langchain
      //'.html': (path) => new UnstructuredHTMLLoader(path),
    });

    // const loader = new PDFLoader(filePath);
    const rawDocs = await directoryLoader.load();

    /* Split text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.splitDocuments(rawDocs);
    console.log('split docs.length)', docs.length);

    console.log('creating vector store...');
    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings();
    // const index = pinecone.Index(PINECONE_INDEX_NAME); //change to your own index name
    const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
    const index = pinecone.Index(credentials.pinecone.indexName);

    //embed the PDF documents
    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      namespace: credentials.pinecone.namespace,
      textKey: 'text',
    });

    emptyTheTmpDir()
    return collection(nullLambdaFunctionURLEvent(), credentials)

  } catch (error) {
    emptyTheTmpDir()
    console.log('error', error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "Failed to ingest your data"
      })
    }
  }

  return {
    statusCode: 500,
    body: JSON.stringify({
      "error": "Failed to ingest your file(s)",
      "size": 0,
      "max": 100
    })
  }
}

function extractGoogleDocID(url: string): string | null {
  const match = url.match(/https:\/\/docs\.google\.com\/document\/d\/([\w-]{25,})/);
  return match ? match[1] : null;
}
