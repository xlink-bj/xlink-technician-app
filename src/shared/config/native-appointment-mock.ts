/** Independent native synthetic profile; never a localhost proxy grant. */
export function nativeAppointmentMockEnabled(env: Record<string,unknown>, origin:string, compiledPlatform:unknown=process.env.UNI_PLATFORM):boolean {
  return env.DEV===true && env.PROD!==true && compiledPlatform==='mp-weixin' && origin===''
    && env.VITE_XLINK_PLATFORM==='mp-weixin' && env.VITE_XLINK_ENVIRONMENT==='dev'
    && env.VITE_XLINK_NATIVE_APPOINTMENT_MOCK==='true'
    && env.VITE_XLINK_H5_MOCK_E2E==='true' && env.VITE_XLINK_R1_MP_UX_FIXTURES==='true'
    && env.VITE_XLINK_R1_APPOINTMENT_ARCHIVE_FIXTURE==='true' && env.VITE_XLINK_MOCK==='true'
    && env.VITE_XLINK_AUTH_TENANT==='synthetic-qa-tenant' && env.VITE_XLINK_API_BASE_URL==='https://example.invalid'
    && env.VITE_XLINK_ENABLE_REAL_WRITES==='false' && env.VITE_XLINK_ENABLE_R1_SPECIAL_WRITES==='false'
    && env.VITE_XLINK_AUTH_ONLY_MOCK_BUSINESS!=='true' && !env.VITE_XLINK_AUTH_API_BASE_URL
    && !env.VITE_XLINK_QUICK_LOGIN_PHONE && !env.VITE_XLINK_QUICK_LOGIN_CODE
    && env.VITE_XLINK_R1_REPEAT_ACTIONS!=='true' && env.VITE_XLINK_R1_FORMS_ACTIONS!=='true'
    && !env.VITE_XLINK_R1_REPEAT_GRANT && !env.VITE_XLINK_R1_FORMS_GRANT
}
