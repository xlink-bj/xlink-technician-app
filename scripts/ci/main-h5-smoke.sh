#!/usr/bin/env bash
set -euo pipefail

# Existing real-App DEV Mock cases only. Browser config denies external business
# traffic and starts a fresh local H5 server for each distinct test environment.
# Clear inherited fixture/browser selectors before enabling each scoped case.
unset VITE_XLINK_R1_MP_UX_FIXTURES VITE_XLINK_R1_SPECIAL_MEDIA \
  VITE_XLINK_R1_BUSINESS_FIELDS VITE_XLINK_R1_DEEP_CASCADE \
  VITE_XLINK_R1_TEMPORAL_RATING_FIELDS VITE_XLINK_R1_ARRAY_CASCADE_FIELDS \
  VITE_XLINK_R1_TYPED_PRIMITIVE_FIELDS VITE_XLINK_DYNAMIC_SCALAR_QA \
  VITE_XLINK_R1_CATALOG_SCALE VITE_XLINK_R1_CATEGORY_FIXTURES \
  VITE_XLINK_BRAND VITE_XLINK_ENVIRONMENT XLINK_M08_BROWSER_CHANNEL PW_CHANNEL
export VITE_XLINK_ENABLE_REAL_WRITES=false
export VITE_XLINK_R1_MP_UX_FIXTURES=true
playwright=./node_modules/.bin/playwright
test -x "$playwright"

"$playwright" test --config config/playwright/main-h5-mock.config.ts \
  tests/h5-main-mock/forms-save-process-readback.spec.ts \
  tests/h5-main-mock/a-stage-p1-acceptance.spec.ts \
  tests/h5-main-mock/order-fields-flow.spec.ts \
  tests/h5-main-mock/package-price-source.spec.ts \
  --grep 'confirmed Save and Process survives reload|020 forms.*@430|021 repeat.*@430|order-fields-flow\.spec\.ts|package-price-source\.spec\.ts'
mkdir -p test-results/main-h5-smoke
cp test-results/main-h5-mock/results.json test-results/main-h5-smoke/business-results.json

"$playwright" test --config config/playwright/input-delivery.config.ts \
  --grep 'rapid multiline note|actual H5 text control textarea'
"$playwright" test --config config/playwright/search-delivery.config.ts \
  --grep 'rapid search button|IME preedit Enter keeps focus'

VITE_XLINK_R1_TEMPORAL_RATING_FIELDS=true "$playwright" test \
  --config config/playwright/main-h5-mock.config.ts \
  tests/h5-main-mock/media-interrupted-receipt.spec.ts
cp test-results/main-h5-mock/results.json test-results/main-h5-smoke/media-results.json

for brand in xlink yuhong; do
  VITE_XLINK_BRAND="$brand" "$playwright" test \
    --config config/playwright/brand-h5.config.ts \
    tests/h5-main-mock/brand-home.spec.ts \
    tests/h5-main-mock/brand-quotation.spec.ts \
    --grep 'at 430'
done
