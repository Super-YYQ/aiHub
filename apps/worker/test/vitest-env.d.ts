/// <reference types="@cloudflare/vitest-pool-workers/types" />
/// <reference types="vitest/globals" />

// vitest 的 ?raw 导入（迁移 SQL 以字符串进入运行时）
declare module '*?raw' {
  const content: string;
  export default content;
}
