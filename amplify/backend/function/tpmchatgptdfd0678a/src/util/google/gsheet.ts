import { sheets_v4 } from 'googleapis'
import { GoogleAuth } from 'googleapis-common'
import { CredentialData } from './gdoc'

export interface GoogleSheet {
  title: string
  content: string
}

let sheetsService: sheets_v4.Sheets

async function getSheetsService (credentials: CredentialData): Promise<sheets_v4.Sheets> {
  credentials.private_key = credentials.private_key.split(String.raw`\n`).join('\n')

  const googleAuth = new GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/drive.appdata',
      'https://www.googleapis.com/auth/drive.file'
    ]
  })

  return new sheets_v4.Sheets({
    auth: googleAuth
  })
}

/**
 * Read a Google sheet
 *
 * @param documentId - The ID of the Google Sheet, e.g. https://docs.google.com/spreadsheets/d/<spreadsheetId>/edit#
 * @returns GoogleDoc - The Title and text content of sheet
 */
export async function readGoogleSheet (spreadsheetId: string, credentials: CredentialData): Promise<GoogleSheet> {
  if (sheetsService === undefined) {
    sheetsService = await getSheetsService(credentials)
  }
  const doc = await sheetsService.spreadsheets.get({
    spreadsheetId,
    ranges: [],
    includeGridData: true
  })

  console.log('readGoogleSheet', spreadsheetId)

  const title = doc.data?.properties?.title ?? ''

  if (doc.data.sheets === undefined || doc.data.sheets.length === 0) {
    throw Error('Document does not have content')
  }

  const content = readSheetText(doc.data.sheets)

  return {
    title,
    content
  }
}

function readSheetText (sheets: sheets_v4.Schema$Sheet[]): string {
  let text = ''
  for (const sheet of sheets) {
    if (sheet.properties?.title != null && sheet.properties?.title.length > 0) {
      text += sheet.properties?.title + ':\n'
    }
    // console.log('sheet properties', sheet, sheet.properties?.index, sheet.properties?.gridProperties)
    if (sheet?.properties?.sheetType === 'GRID' && sheet.data != null && sheet?.data?.length > 0) {
      for (const grid of sheet.data) { // Schema$GridData
        // console.log('grid', grid)
        if (grid.rowData != null && grid.rowData.length > 0) {
          text += readGridText(grid.rowData)
        }
      }
    }
  }
  return text + '\n'
}

function readGridText (rows: sheets_v4.Schema$RowData[]): string {
  let text = ''
  for (const row of rows) {
    // console.log('row', row)
    let rowHasData: boolean = false

    if (row.values != null && row.values.length > 0) {
      for (const value of row.values) {
        // console.log('value', value)
        // console.log('formatted cell data', value.formattedValue ?? '')
        const cell = value.formattedValue ?? ''
        if (cell.length > 0) {
          text += ' ' + cell
          rowHasData = true
        }
      }
    }
    if (rowHasData) {
      text += '\n'
    }
  }
  return text + '\n'
}
