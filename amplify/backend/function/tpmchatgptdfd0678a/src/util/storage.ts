import {
  DynamoDBClient,
  GetItemCommandInput, GetItemCommand,
  UpdateItemCommand, UpdateItemCommandInput,
  PutItemCommand, PutItemCommandInput
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
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
    if (data?.$metadata?.httpStatusCode !== 200) {
      console.log('getUser failed with httpStatus', data?.$metadata?.httpStatusCode)
      console.log('getUser typeof data', typeof data)
      console.log('getUser data', data)
    }
    if (data?.Item != null) {
      const existingUser = unmarshall(data.Item)
      return new User(existingUser.sub, existingUser.namespace)
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
    UpdateExpression: 'set namespaces = namespaces + :val',
    ConditionExpression: 'attribute_exists(namespaces)',
    ReturnValues: 'UPDATED_NEW'
  }
  try {
    const data = await client.send(new UpdateItemCommand(params))
    if (data?.$metadata?.httpStatusCode !== 200) {
      console.log('getIncrementedCounter failed with httpStatus', data?.$metadata?.httpStatusCode)
      console.log('getIncrementedCounter typeof data', typeof data)
      console.log('getIncrementedCounter  data', data)
    }
    if (data?.Attributes != null) {
      const retval = unmarshall(data?.Attributes)
      return prependEnv(toBb26(retval.namespaces))
    }
  } catch (err) {
    if (err instanceof Error) {
      if (err?.name === 'ConditionalCheckFailedException') {
        // IncrementedCounter does not exist
        const value = await createIncrementedCounter()
        return prependEnv(toBb26(value))
      } else {
        console.error('getIncrementedCounter exception t', typeof err)
        console.error('getIncrementedCounter exception', err)
      }
    }
  }
  return ''
}
const awsDevProd: string = process.env.ENV ?? ''
function prependEnv (s: string): string {
  if (awsDevProd === 'dev' && s.length > 0) {
    return 'd' + s
  }
  return s
}

const NAMESPACE_START_NUMBER: number = 27
async function createIncrementedCounter (): Promise<number> {
  const params: UpdateItemCommandInput = {
    TableName,
    Key: marshall({
      sub: NamespaceCounter
    }),
    ExpressionAttributeValues: marshall({
      ':val': NAMESPACE_START_NUMBER
    }),
    UpdateExpression: 'set namespaces = :val',
    ReturnValues: 'UPDATED_NEW'
  }

  try {
    const data = await client.send(new UpdateItemCommand(params))
    if (data?.$metadata?.httpStatusCode !== 200) {
      console.log('createIncrementedCounter failed with httpStatus', data?.$metadata?.httpStatusCode)
      console.log('createIncrementedCounter typeof data', typeof data)
      console.log('createIncrementedCounter  data', data)
    }
    if (data?.Attributes != null) {
      const retval = unmarshall(data?.Attributes)
      return retval.namespaces
    }
  } catch (error) {
    // error handling.
    // not found takes this path
    console.log('createIncrementedCounter error', error)
  }
  return 0
}

export async function createUser (subId: string): Promise<User> {
  const namespace = await getIncrementedCounter()

  const params: PutItemCommandInput = {
    TableName,
    Item: marshall({
      sub: toStoredUsername(subId),
      namespace
    })
  }

  try {
    const data = await client.send(new PutItemCommand(params))
    if (data?.$metadata?.httpStatusCode !== 200) {
      console.log('createUser failed with httpStatus', data?.$metadata?.httpStatusCode)
      console.log('createUser typeof data', typeof data)
      console.log('createUser data', data)
    }

    if (namespace !== '') {
      // todo create a vector namespace

    }
    return new User(subId, namespace)
  } catch (error) {
    // error handling.
    // not found takes this path
    console.log('createUser error', error)
  }
  return new User('', '')
}

export class User {
  sub: string
  namespace: string

  constructor (subIn: string, namespaceIn: string) {
    if (subIn.startsWith(BaseUser)) {
      this.sub = subIn.slice(BaseUser.length)
    } else {
      this.sub = subIn
    }
    this.namespace = namespaceIn
  }
}

function toStoredUsername (s: string): string {
  return BaseUser + s
}

// Schema
const NamespaceCounter: string = '#NamespaceCounter'
const BaseUser: string = '#User'
