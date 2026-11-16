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
      fail: () => {
        uni.showToast({ title: '页面暂时无法打开，请重试', icon: 'none' })
        resolve(false)
      },
    })
  })
}
