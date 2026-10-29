export declare const contractFile: string
export declare const inventoryFile: string
export declare const matrixFile: string
export declare function readSurveyContract(): Promise<Record<string, any>>
export declare function buildSurveyCapabilityInventory(contract: Record<string, any>): Record<string, any>
export declare function buildSurveyCapabilityMatrixMarkdown(inventory: Record<string, any>): string
