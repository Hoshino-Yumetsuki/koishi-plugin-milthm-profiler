declare module 'virtual:milthm-constants' {
  /**
   * 来自 milthm-calculator-web/js/constant.js 的原始定数数据。
   * 键为谱面 UUID，值可能为旧数组格式或新对象格式。
   */
  const data: Record<
    string,
    | (number | string | undefined)[]
    | {
        constant?: number | string
        constantv3?: number | string
        category?: string
        name?: string
        yct?: number | string
      }
  >
  export default data
}
