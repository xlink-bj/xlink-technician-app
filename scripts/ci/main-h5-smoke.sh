#!/usr/bin/env bash
set -euo pipefail

# Existing real-App DEV Mock cases only. Browser config denies external business
# traffic and starts a fresh local H5 server for each distinct test environment.
export VITE_XLINK_ENABLE_REAL_WRITES=false
export VITE_XLINK_R1_MP_UX_FIXTURES=true
export VITE_XLINK_R1_STAGE2D_FIELDS=false
export VITE_XLINK_R1_CATALOG_SCALE=false
unset VITE_XLINK_BRAND
playwright=./node_modules/.bin/playwright
test -x "$playwright"

"$playwright" test --config config/playwright/main-h5-mock.config.ts \
  tests/h5-main-mock/stage1b-r1-forms-after-save.spec.ts \
  tests/h5-main-mock/a-stage-p1-acceptance.spec.ts \
  tests/h5-main-mock/order-fields-flow.spec.ts \
  tests/h5-main-mock/package-price-source.spec.ts \
  --grep 'confirmed Save and Process survives reload|020 forms.*@430|021 repeat.*@430|order-fields-flow\.spec\.ts|package-price-source\.spec\.ts'

"$playwright" test --config config/playwright/input-delivery.config.ts \
  --grep 'rapid multiline note|actual H5 text control textarea'
"$playwright" test --config config/playwright/search-delivery.config.ts \
  --grep 'rapid search button|IME preedit Enter keeps focus'

VITE_XLINK_R1_STAGE2D_FIELDS=true "$playwright" test \
  --config config/playwright/main-h5-mock.config.ts \
  tests/h5-main-mock/media-interrupted-receipt.spec.ts

for brand in xlink yuhong; do
  VITE_XLINK_BRAND="$brand" "$playwright" test \
    --config config/playwright/brand-h5.config.ts \
    tests/h5-main-mock/brand-home.spec.ts \
    tests/h5-main-mock/brand-quotation.spec.ts \
    --grep 'at 430'
done
