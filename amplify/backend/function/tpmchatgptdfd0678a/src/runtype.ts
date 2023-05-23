export const isLambdaMock: boolean = isLambdaMockfunc()

function isLambdaMockfunc (): boolean {
  const hasRoot: string = process.env.LAMBDA_TASK_ROOT || ''
  const awsEnv: string = process.env.AWS_EXECUTION_ENV || ''

  if (hasRoot && (awsEnv === 'AWS_Lambda_amplify-mock')) {
    return true
  }

  return false
}
