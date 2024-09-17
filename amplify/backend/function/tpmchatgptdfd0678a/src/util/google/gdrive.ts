import { drive_v3 } from 'googleapis'
import { GoogleAuth } from 'googleapis-common'
import { CredentialData } from './gdoc'
import { GaxiosPromise } from 'gaxios'
import { sanitize } from 'sanitize-filename-ts'
import * as path from 'node:path'

let driveService: drive_v3.Drive

export const folderMimeType = 'application/vnd.google-apps.folder'
// https://developers.google.com/drive/api/guides/mime-types
// export mimetypes
// https://developers.google.com/drive/api/guides/ref-export-formats

async function getDriveService (credentials: CredentialData): Promise<drive_v3.Drive> {
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

  return new drive_v3.Drive({
    auth: googleAuth
  })
}
export interface FolderItem {
  id: string
  name: string
  mimeType: string
  size: string
  parentName: string
  parents: string[]
}

/**
 * List a Google Drive folder
 *
 * @param folderId - The ID of the Google folder, e.g. https://drive.google.com/drive/folders/1e_rjH9Y-08V6fDQC6Uui4124fJ2fbAfk
 * @returns ?
 */
export async function listGoogleFolder (folderId: string, credentials: CredentialData): Promise<FolderItem[]> {
  if (driveService === undefined) {
    driveService = await getDriveService(credentials)
  }

  let fileList: FolderItem[] = []
  const query = `'${folderId}' in parents and trashed=false`
  const fields: string = 'nextPageToken, files(id, name, mimeType, description, size, parents)'
  try {
    fileList = await getFolder(driveService, query, fields, '')
  } catch (err) {
    console.log('error listing folder', err)
  }
  return fileList
}

// get folder and sub folders
async function getFolder (drive: drive_v3.Drive, q: string, fields: string, folderName: string): Promise<FolderItem[]> {
  const fileList = await getListLoop(driveService, q, fields, folderName)

  // for each subfolder, get those folders. Don't append them to the list while we're iterating it
  const subFolders: FolderItem[] = []
  for (const ent of fileList) {
    // if a dir
    if (ent.mimeType === folderMimeType) {
      if (ent.name !== 'Recycle bin' && ent.name !== '__MACOSX') {
        // don't go into trash or Recycle bin folders
        subFolders.push(ent)
      }
    }
  }
  // go get the subfolders
  for (const sub of subFolders) {
    const subFolderQ = `'${sub.id}' in parents and trashed=false`
    const subFolderName = sanitize(sub.name)
    console.log(`getting sub '${subFolderName}'`)
    const subList = await getFolder(driveService, subFolderQ, fields, path.join(folderName, subFolderName))
    fileList.push(...subList)
  }

  return fileList
}

// gets files in one folder across multiple calls
async function getListLoop (drive: drive_v3.Drive, q: string, fields: string, folderName: string): Promise<FolderItem[]> {
  const list: FolderItem[] = []
  let NextPageToken: string = ''
  do {
    const res = await getList(drive, NextPageToken, q, fields)
    if (res.data.files != null) {
      pushtoList(list, folderName, res.data.files)
    }
    NextPageToken = res?.data?.nextPageToken ?? ''
  } while (NextPageToken.length !== 0)
  return list
}

function pushtoList (fileList: FolderItem[], folderName: string, fileSet: drive_v3.Schema$File[]): void {
  for (const fRef of fileSet) {
    const newItem: FolderItem = {
      id: fRef.id ?? '',
      name: fRef.name ?? '',
      mimeType: fRef.mimeType ?? '',
      size: fRef.size ?? '',
      parentName: folderName,
      parents: fRef.parents ?? []
    }
    fileList.push(newItem)
  }
}

// make one call
async function getList (drive: drive_v3.Drive, ptoken: string, q: string, fields: string):
GaxiosPromise<drive_v3.Schema$FileList> {
  const params = {
    q,
    fields,
    pageSize: 1000,
    pageToken: ptoken ?? '',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  }
  const res = await drive.files.list(params)
  return res
}

export interface GoogleRawFile {
  mimeType: string
  size: number
  content: ArrayBuffer
}

export async function readDriveFile (fileId: string, credentials: CredentialData): Promise<GoogleRawFile> {
  if (driveService === undefined) {
    driveService = await getDriveService(credentials)
  }

  const doc = await driveService.files.get({
    fileId,
    alt: 'media'
  }, {
    responseType: 'arraybuffer' // MUST set responseType (eg. Buffer)
  })

  return {
    content: doc.data as ArrayBuffer,
    mimeType: doc.headers['content-type'],
    size: (+(doc.headers['content-length']))
  }
}

export async function exportDriveFile (fileId: string, credentials: CredentialData): Promise<GoogleRawFile> {
  if (driveService === undefined) {
    driveService = await getDriveService(credentials)
  }

  const doc = await driveService.files.export({
    fileId,
    mimeType: 'text/plain'
  }, {
    responseType: 'arraybuffer' // MUST set responseType (eg. Buffer)
  })
  console.log('export:', typeof doc)
  console.log('export:', typeof doc.data)

  return {
    content: doc.data as ArrayBuffer,
    mimeType: doc.headers['content-type'],
    size: (+(doc.headers['content-length']))
  }
}
