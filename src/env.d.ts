/// <reference types="vite/client" />
/// <reference types="@dcloudio/types" />

declare module '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<{
    type?: string
    color?: string
    size?: number | string
    customPrefix?: string
    fontFamily?: string
  }>

  export default component
}
