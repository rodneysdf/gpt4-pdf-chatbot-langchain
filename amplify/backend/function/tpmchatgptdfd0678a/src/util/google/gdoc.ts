import { auth, docs_v1 } from '@googleapis/docs'

export interface GoogleDoc {
  title: string
  content: string
}

export interface CredentialData {
  type?: string
  project_id?: string
  private_key_id?: string
  client_email: string
  private_key: string
}

let docsService: docs_v1.Docs

function extractTextRuns (content: docs_v1.Schema$StructuralElement[]): string[] {
  const paragraphs = content?.filter(c => c.paragraph !== undefined).map(c => c.paragraph as docs_v1.Schema$Paragraph)
  const elements = paragraphs.filter(p => p.elements !== undefined).map(p => p.elements as docs_v1.Schema$ParagraphElement[]).flat()
  return elements.filter(e => e.textRun?.content !== null && e.textRun?.content !== undefined).map(e => e.textRun?.content as string)
}

async function getDocsService (credentials: CredentialData): Promise<docs_v1.Docs> {
  console.log('getDocsService')
  credentials.private_key = credentials.private_key.split(String.raw`\n`).join('\n')

  const googleAuth = new auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/documents.readonly']
  })

  return new docs_v1.Docs({
    auth: googleAuth
  })
}

function convertToString (content: docs_v1.Schema$StructuralElement[]): string {
  const md = extractTextRuns(content).join('')

  return md
}

/**
 * Read a Google document
 *
 * @param documentId - The ID of the Google Doc, e.g. https://docs.google.com/document/d/<documentId>/edit#
 * @returns GoogleDoc - The Title and text content of document
 */
export async function readGoogleDoc (documentId: string, credentials: CredentialData): Promise<GoogleDoc> {
  if (docsService === undefined) {
    docsService = await getDocsService(credentials)
  }
  console.log('got getDocsService')

  const doc = await docsService.documents.get({
    documentId
  })
  console.log('doc=', doc)

  if (doc.data.body?.content === undefined) {
    throw Error('Document does not have content')
  }

  if (doc.data.title === undefined) {
    throw Error('Document does not have a title')
  }

  const title = doc.data.title ?? ''
  console.log(`GDoc '${title}'=`, doc.data)
  console.log(`GDoc '${title}'=`, JSON.stringify(doc.data.body, null, 4))

  const content = convertToString(doc.data.body.content)
  console.log(`GDoc string '${title}'=`, content)

  // const docstring = await readStructuralElements(doc.data.body.content)
  // console.log('docstring=', docstring)

  return {
    title,
    content
  }
}

// async function readParagraphElement (element: docs_v1.Schema$ParagraphElement): Promise<string> {
//   const run = element.textRun
//   if (run === null || run?.content === null) {
//     // The TextRun can be null if there is an inline object.
//     return ''
//   }
//   return run?.content || ''
// }

// async function readStructuralElements (elements: docs_v1.Schema$StructuralElement[]): Promise<string> {
//   let text = ''
//   for (const element of elements) {
//     if (element.paragraph !== null) {
//       for (const paragraphElement of ((element?.paragraph?.elements) != null) || []) {
//         text += await readParagraphElement(paragraphElement)
//       }
//     } else if (element.table !== null) {
//       // The text in table cells are in nested Structural Elements and tables may be
//       // nested.
//       for (const row of ((element?.table?.tableRows) != null) || []) {
//         for (const cell of (row.tableCells != null) || []) {
//           text += await readStructuralElements((cell.content != null) || [])
//         }
//       }
//     } else if (element.tableOfContents !== null) {
//       // The text in the TOC is also in a Structural Element.
//       text += await readStructuralElements(((element?.tableOfContents?.content) != null) || [])
//     }
//   }
//   return text
// }

// async function extractTextFromDocument (document: docs_v1.Schema$Document): Promise<string> {
//   let text = ''
//   const elements = document?.body?.content
//   if (elements != null) {
//     elements.forEach((contentElement) => {
//       if (contentElement.paragraph != null) {
//         contentElement.paragraph.elements.forEach((paragraphElement) => {
//           if (paragraphElement.textRun != null) {
//             text += paragraphElement.textRun.content
//           }
//         })
//       }
//     })
//   }
//   return text
// }
