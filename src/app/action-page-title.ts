import { setUniPageTitle } from '@adapters/platform/uni-page-title'

/** Visual shell title only; never changes business workflow or route identity. */
export function setActionWorkspacePageTitle(title: string): void {
  setUniPageTitle(title)
}
