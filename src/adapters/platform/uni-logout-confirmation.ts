/** Platform confirmation only; never ends a session or changes account data. */
export async function confirmUniLogout(): Promise<boolean> {
  if (typeof uni === 'undefined') return false
  try {
    const result = await uni.showModal({
      title: '退出登录', content: '确定退出当前账号？',
      confirmText: '退出登录', cancelText: '取消',
    })
    return result.confirm === true
  } catch {
    return false
  }
}
