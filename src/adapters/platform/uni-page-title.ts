/** Native/H5 title presentation belongs to the platform boundary, not Vue pages. */
export function setUniPageTitle(title: string): void {
  if (typeof uni === 'undefined' || typeof uni.setNavigationBarTitle !== 'function') return
  uni.setNavigationBarTitle({ title })
}
