import { describe, it, expect } from 'vitest';
import { buildChecklist } from '../src/checklist';

describe('安装清单生成', () => {
  it('按类型分组、待勾选、附安装命令', () => {
    const md = buildChecklist('主力电脑', [
      {
        type: 'plugin',
        title: '插件B',
        snippets: [{ code: 'install-b', install: true, lang: 'text' }],
      },
      {
        type: 'tool',
        title: '工具A',
        snippets: [
          { code: 'install-a', install: true },
          { code: 'not-install', install: false },
        ],
      },
      { type: 'tool', title: '工具C', snippets: [] },
    ]);
    expect(md).toContain('# 主力电脑 安装清单');
    expect(md).toContain('## 工具');
    expect(md.indexOf('## 工具')).toBeLessThan(md.indexOf('## 插件')); // 类型顺序按内置 sort
    expect(md).toContain('- [ ] 工具A');
    expect(md).toContain('```text\ninstall-b\n```');
    expect(md).not.toContain('not-install'); // 非安装命令不进清单
  });
  it('空条目 → 只有标题', () => {
    expect(buildChecklist('空环境', [])).toBe('# 空环境 安装清单\n');
  });
});
