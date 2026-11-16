/** Root navigation replaces the current root while child business pages keep their stack. */
export function currentPlatformPageRoute(): string | undefined {
  const pages = getCurrentPages()
  return pages[pages.length - 1]?.route
}

export function redirectPlatformRoot(url: string): Promise<boolean> {
  return new Promise(resolve => {
    uni.redirectTo({
      url,
      success: () => resolve(true),
      fail: () => resolve(false),
    })
  })
}
