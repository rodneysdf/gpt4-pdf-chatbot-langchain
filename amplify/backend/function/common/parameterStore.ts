import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

const region: string = process.env.REGION ?? ''
const ssm = new SSMClient({ region })

// Get parameter from Parameter Store
export const getParameter = async (name: string, decrypt: boolean): Promise<string | undefined> => {
  const params = {
    /** input parameters */
    Name: name,
    WithDecryption: decrypt
  }
  const command = new GetParameterCommand(params)

  const result = await ssm.send(command)
  return result.Parameter?.Value
}
