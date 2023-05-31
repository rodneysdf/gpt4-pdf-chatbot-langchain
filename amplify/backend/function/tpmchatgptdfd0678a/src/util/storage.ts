import {
  DynamoDBClient,
  GetItemCommandInput, GetItemCommand,
  UpdateItemCommand, UpdateItemCommandInput,
  PutItemCommand, PutItemCommandInput
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import toBb26 from './to-bb26'

const region: string = process.env.REGION ?? ''
const client = new DynamoDBClient({ region })
const TableName = process.env.STORAGE_TPMAI_NAME ?? ''

// see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write-batch.html
export async function getUser (subId: string): Promise<User> {
  let createNewUser: boolean = false
  const params: GetItemCommandInput = {
    /** input parameters */
    TableName,
    Key: marshall({
      sub: toStoredUsername(subId)
    })
  }

  try {
    const data = await client.send(new GetItemCommand(params))
    // process data.
    console.log('typeof data', typeof data)
    console.log(data)
    if (data?.Item != null) {
      console.log('getUser got', data?.Item)
      return new User('sub', 'nspace')
    }
    createNewUser = true
  } catch (error) {
    // error handling.
    // not found takes this path
    console.log('getUser exception t', typeof error)
    console.log('getUser exception', error)
    createNewUser = true
  }
  if (createNewUser) {
    // create user
    return await createUser(subId)
  }

  return {
    sub: '',
    namespace: ''
  }
}

// Atomic counter
async function getIncrementedCounter (): Promise<string> {
  const params: UpdateItemCommandInput = {
    TableName,
    Key: marshall({
      sub: NamespaceCounter
    }),
    ExpressionAttributeValues: marshall({
      ':val': 1
    }),
    UpdateExpression: 'set counter = counter + :val'
  }
  try {
    const results = await client.send(new UpdateItemCommand(params))
    console.log('getIncrementedCounter ', typeof results)
    console.log('getIncrementedCounter', results)
    return toBb26(5)
  } catch (err) {
    console.error('getIncrementedCounter exception', err)
    // todo if missing, create it
    return toBb26(4)
  }
}

export async function createUser (subId: string): Promise<User> {
  const next = await getIncrementedCounter()

  const params: PutItemCommandInput = {
    TableName,
    Item: marshall({
      sub: toStoredUsername(subId),
      namespace: next
    })
  }

  try {
    const data = await client.send(new PutItemCommand(params))
    // process data.
    console.log('createUser typeof data', typeof data)
    console.log('createUser  data', data)
    return {
      sub: '',
      namespace: ''
    }
  } catch (error) {
    // error handling.
    // not found takes this path
    console.log('createUser error', error)
  }
  return {
    sub: '',
    namespace: ''
  }
}

export class User {
  sub: string
  namespace: string

  constructor (subIn: string, namespaceIn: string) {
    this.sub = subIn
    this.namespace = namespaceIn
  }
}

function toStoredUsername (s: string): string {
  return BaseUser + s
}

// Schema
const NamespaceCounter: string = '#NamespaceCounter'
const BaseUser: string = '#User'
