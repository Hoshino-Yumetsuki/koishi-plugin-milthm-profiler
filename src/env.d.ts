declare module 'virtual:milthm-constants' {
  /**
   * 来自 milthm-calculator-web/js/constant.js 的原始定数数据。
   * 键为谱面 UUID，值数组格式为：
   * [constant, (constantv3,) difficulty, name, yct?, ad?, ae?, af?, ag?]
   */
  const data: Record<string, (number | string | undefined)[]>
  export default data
}
