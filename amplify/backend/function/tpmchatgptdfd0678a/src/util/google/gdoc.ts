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

async function getDocsService(credentials: CredentialData): Promise<docs_v1.Docs> {
  credentials.private_key = credentials.private_key.split(String.raw`\n`).join('\n')

  const googleAuth = new auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/documents.readonly']
  })

  return new docs_v1.Docs({
    auth: googleAuth
  })
}

// function convertToString (content: docs_v1.Schema$StructuralElement[]): string {
//   const md = extractTextRuns(content).join('')

//   return md
// }

/**
 * Read a Google document
 *
 * @param documentId - The ID of the Google Doc, e.g. https://docs.google.com/document/d/<documentId>/edit#
 * @returns GoogleDoc - The Title and text content of document
 */
export async function readGoogleDoc(documentId: string, credentials: CredentialData): Promise<GoogleDoc> {
  if (docsService === undefined) {
    docsService = await getDocsService(credentials)
  }
  const doc = await docsService.documents.get({
    documentId
  })

  console.log('readGoogleDoc of ', documentId)

  if (doc.data.body?.content === undefined) {
    throw Error('Document does not have content')
  }

  if (doc.data.title === undefined) {
    throw Error('Document does not have a title')
  }

  const title = doc.data.title ?? ''
  // console.log(`GDoc '${title}'=`, doc.data)
  // console.log(`GDoc json.stringify '${title}'=`, JSON.stringify(doc.data.body, null, 2))

  // strip out all the formatting to get to just the text
  const docstring = readStructuralElements(doc.data.body.content)

  return {
    title,
    content: docstring
  }
}

// Returns the text in the given ParagraphElement.
function readParagraphElement(element: docs_v1.Schema$ParagraphElement): string {
  const run = element.textRun
  if (run === null || run?.content === null || run?.content?.length === 0) {
    // The TextRun can be null if there is an inline object.
    return ''
  }
  return run?.content ?? ''
}

// Returns the text in the given TableRow.
function readTableRow(element: docs_v1.Schema$TableRow): string {
  let text = ''
  if (element.tableCells != null) {
    for (const cell of element.tableCells) {
      if (cell.content != null) {
        text += readStructuralElements(cell.content)
      }
    }
  }
  return text
}

function readStructuralElements(elements: docs_v1.Schema$StructuralElement[]): string {
  let text = ''
  for (const element of elements) {
    if (element?.paragraph?.elements != null) {
      // Handle paragraphs
      for (const paragraphElement of element.paragraph?.elements) {
        text += readParagraphElement(paragraphElement)
      }
    } else if (element?.table != null) {
      // Handle tables
      // The text in table cells are in nested Structural Elements and tables may be
      // nested.
      if (element?.table?.tableRows != null) {
        for (const row of element?.table?.tableRows) {
          text += readTableRow(row)
        }
      }
    } else if (element.tableOfContents !== null) {
      // The text in the TOC is also in a Structural Element.
      if (element.tableOfContents?.content != null) {
        text += readStructuralElements(element?.tableOfContents?.content)
      }
    }
  }
  return text
}
