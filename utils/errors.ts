export function signinError (): void {
  alert(signinErrorText());
}

export function signinErrorText (): string {
  return('Error: You must be signed in with Google Sign in at top to use the functions');
}
