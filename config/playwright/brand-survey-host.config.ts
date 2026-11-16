import { defineConfig } from '@playwright/test'
import survey from './s01-normal-form.config'
import appointment from './normal-appointment-experience.config'
import mock from './main-h5-mock.config'
import { selectBrand } from '../vite/brand-profile'
import { rootPath } from '../paths'

// Dedicated local evidence suite. Inherits existing protocol-shaped fixtures and
// intercepted command grants; every scenario blocks external traffic.
// The readonly mode uses the existing inert DEV Mock and never enables writes.
const brand = selectBrand(process.env.VITE_XLINK_BRAND).id
const sharedAppointment = process.env.XLINK_SURVEY_HOST_APPOINTMENT === 'true'
const readOnly = process.env.XLINK_SURVEY_HOST_READONLY === 'true'
const base = readOnly ? mock : sharedAppointment ? appointment : survey
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer!
const narrow = process.env.XLINK_SURVEY_HOST_NARROW === 'true'
const suite = readOnly ? 'survey-readonly' : sharedAppointment ? (narrow ? 'appointment-375' : 'appointment-430') : 'survey'
const phase = process.env.XLINK_SURVEY_HOST_PHASE === 'before' ? 'before' : 'after'
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: readOnly ? 'normal-survey-mock-reader.spec.ts' : sharedAppointment ? 'normal-appointment-experience.spec.ts' : 'brand-survey-host.spec.ts',
  outputDir: rootPath(`test-results/brand-survey-host/${brand}/${phase}/${suite}/attachments`),
  reporter: [['list'], ['json', { outputFile: rootPath(`test-results/brand-survey-host/${brand}/${phase}/${suite}/results.json`) }]],
  use: { ...base.use, viewport: narrow ? { width: 375, height: 667 } : { width: 430, height: 932 }, screenshot: 'on', trace: 'retain-on-failure',
    ...(process.env.XLINK_SURVEY_HOST_CHROMIUM ? { launchOptions: { executablePath: process.env.XLINK_SURVEY_HOST_CHROMIUM } } : {}) },
  webServer: { ...server, env: { ...server.env, VITE_XLINK_BRAND: brand,
    UNI_OUTPUT_DIR: rootPath('unpackage/brand-survey-host-h5'),
    ...(!sharedAppointment && !readOnly ? { VITE_XLINK_R1_FORMS_GRANT: JSON.stringify({ version: 2,
      scope: { tenantId: 't', userId: 'u', roleId: 'r', workOrderId: 's', workflowRunId: 'w', runtimeNodeId: 'n', formDefinitionId: 'e' },
      fieldIds: ['checks', 'multi', 'memo'], operations: ['create', 'edit'], recordIds: ['saved'], expiresAt: '2099-01-01T00:00:00Z' }) } : {}) } },
})
