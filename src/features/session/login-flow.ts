export type LoginStage = 'launch' | 'methods' | 'form'

export type LoginMethod = 'verification_code' | 'password' | 'quick'

export const supportedLoginMethod: LoginMethod = 'verification_code'

export function advanceLoginStage(stage: LoginStage): LoginStage {
  if (stage === 'launch') return 'methods'
  if (stage === 'methods') return 'form'
  return 'form'
}

export function stageForLoginMethod(method: LoginMethod): LoginStage | undefined {
  return method === supportedLoginMethod ? 'form' : undefined
}
