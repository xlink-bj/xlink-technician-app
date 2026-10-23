#!/usr/bin/env node

import { runInspectionContractCli } from './inspection-contract.mjs'

runInspectionContractCli().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Inspection contract discovery failed')
  process.exitCode = 1
})
