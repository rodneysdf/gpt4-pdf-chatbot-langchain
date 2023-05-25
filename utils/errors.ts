export function signinError (): void {
  alert(signinErrorText());
}

export function signinErrorText (): string {
  return('Error: You must be signed in with Google Sign in at top to use the functions');
}

export function toFriendlyChatError (error: string): string {
  // model_not_found - The model: `gpt-4` does not exist
  if (error.startsWith('model_not_found')) {
    const modelList = /\`(.*)\`/.exec(error);
    let modelName : string = ''
    if (modelList != null && modelList.length >= 2) {
      modelName = `'` + modelList[1] + `'`
    }
    // console.log('modelName:', modelName)
    // find the model
    return `The API Key you used is not licensed for the ${modelName} model. You can get that key access, or use the widely available 'gpt-3.5-turbo-0301' model below instead. (selection already changed)`
  }
  return error
}