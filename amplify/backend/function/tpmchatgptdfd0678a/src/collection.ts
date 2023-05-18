import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import YError from 'yerror';
import { LambdaFunctionURLResponse } from "./interfaces";
import { CustomPDFLoader } from './util/customPDFLoader';
import { initPinecone } from './util/pineconeclient';
import { Convert, Credentials, LambdaFunctionURLEvent, } from "./datamodels";
import { getParameter } from './util/parameterStore';
import { env } from 'node:process';
const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const getRawBody = require('raw-body');

export const upload = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResponse> => {
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

  // load credentials needed to call ChatGPT
  let credentials: Credentials
  try {
    // see https://docs.amplify.aws/cli/function/secrets/#configuring-secret-values
    const credentialsSecret: string = process.env["credentials"] || ""
    const credentialsJSON: string = await getParameter(credentialsSecret, true) || "";
    credentials = Convert.toCredentials(credentialsJSON);
  } catch (error) {
    console.log("error accessing credentials :", error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "could not get configuration"
      })
    }
  }
  // write OPENAI_API_KEY env var to the process because:
  // OPENAI_API_KEY is required to be an ENV var by current code dependency
  env.OPENAI_API_KEY = credentials.openAiApiKey;

  // load docs
  let contype = event.headers['content-type']
  try {
    // make a dir for the upload batch
    const DESTINATION_DIR = "/tmp/col";

    if (!fs.existsSync(DESTINATION_DIR)) {
      fs.mkdirSync(DESTINATION_DIR);
    }

    // delete any files that already exist
    const lsdel = fs.readdirSync(DESTINATION_DIR);
    // console.log('LS -deleting', DESTINATION_DIR);
    lsdel.forEach((filename: string) => {
      const filepath = path.join(DESTINATION_DIR, filename);
      const info = fs.statSync(filepath);
      // console.log(`deleting ${filename}`, info.size+' bytes');
      fs.unlink(filepath, (err: any) => {
        if (err) throw err;
      });
    });

    const lodedDocs = await getMultiParts(payload, {
      'content-type': contype
    }, DESTINATION_DIR)

    // const ls = fs.readdirSync(DESTINATION_DIR);
    // console.log('LS', DESTINATION_DIR);
    // ls.forEach((filename: string) => {
    //   const filepath = path.join(DESTINATION_DIR, filename);
    //   const info = fs.statSync(filepath);
    //   console.log(filename, info.size+' bytes');
    // })

    // Start of LangChain loading
    /* load raw docs from the all files in the directory */
    const directoryLoader = new DirectoryLoader(DESTINATION_DIR, {
      '.pdf': (path) => new CustomPDFLoader(path),
    });

    // const loader = new PDFLoader(filePath);
    const rawDocs = await directoryLoader.load();

    /* Split text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.splitDocuments(rawDocs);
    console.log('split docs', docs);

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

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "size": 15,
        "max": 100
      })
    }

  } catch (error) {
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
      "size": 15,
      "max": 100
    })
  }
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


export const add = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResponse> => {
  console.log(event);
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "size": 15,
      "max": 100
    })
  }
}
export const purge = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResponse> => {
  console.log(event);
  return {
    statusCode: 200,
    body: JSON.stringify({
      "size": 15,
      "max": 100
    })
  }
}

export const collection = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResponse> => {

  console.log(event);
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "size": 15,
      "max": 100
    })
  }
}
