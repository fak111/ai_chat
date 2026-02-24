/**
 * SkillLoader — 热加载 .ts 技能文件
 *
 * 参考 pi-mono/doc/learn/chat-new.ts 的 SkillLoader 实现。
 * 每个群有独立的 skills 目录：storage/skills/{groupId}/
 * 技能文件 export default { name, description, prompt?, tools[] }
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createJiti } from '@mariozechner/jiti';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { logger } from '../../utils/logger.js';

/** 技能文件的 export default 格式 */
export interface SkillDefinition {
  name: string;
  description?: string;
  prompt?: string;
  tools?: AgentTool<any>[];
}

interface LoadedSkill {
  definition: SkillDefinition;
  filePath: string;
}

export interface SkillEvent {
  type: 'loaded' | 'unloaded' | 'error';
  skillName: string;
  fileName: string;
  error?: string;
}

export class SkillLoader {
  private skills = new Map<string, LoadedSkill>();
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  public onChange?: (event: SkillEvent) => void;

  constructor(private skillsDir: string) {}

  /** 加载单个技能文件 */
  async loadSkill(filePath: string): Promise<SkillEvent> {
    const fileName = path.basename(filePath);
    // jiti 需要绝对路径
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    try {
      const jiti = createJiti(import.meta.url, { moduleCache: false });
      const module = await jiti.import(absolutePath, { default: true });
      const def = module as SkillDefinition;

      if (!def || typeof def !== 'object' || !def.name) {
        return { type: 'error', skillName: fileName, fileName, error: '缺少 name 字段' };
      }

      this.skills.set(filePath, { definition: def, filePath });
      logger.info({ skillName: def.name, fileName }, 'Skill loaded');
      return { type: 'loaded', skillName: def.name, fileName };
    } catch (err: any) {
      logger.error({ fileName, error: err.message }, 'Skill load failed');
      return { type: 'error', skillName: fileName, fileName, error: err.message };
    }
  }

  /** 卸载技能 */
  unloadSkill(filePath: string): SkillEvent | null {
    const skill = this.skills.get(filePath);
    if (!skill) return null;
    this.skills.delete(filePath);
    logger.info({ skillName: skill.definition.name }, 'Skill unloaded');
    return { type: 'unloaded', skillName: skill.definition.name, fileName: path.basename(filePath) };
  }

  /** 扫描目录，加载所有 .ts 技能 */
  async loadAll(): Promise<SkillEvent[]> {
    const events: SkillEvent[] = [];
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      return events;
    }
    const files = fs.readdirSync(this.skillsDir).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      events.push(await this.loadSkill(path.join(this.skillsDir, file)));
    }
    return events;
  }

  /** 监听目录变化，处理编辑器原子写入 */
  startWatching(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
    this.watcher = fs.watch(this.skillsDir, (_eventType, filename) => {
      if (!filename || !filename.endsWith('.ts')) return;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.handleFileChange(filename), 50);
    });
    this.watcher.on('error', () => {
      this.watcher?.close();
      this.watcher = null;
    });
  }

  private async handleFileChange(filename: string): Promise<void> {
    this.debounceTimer = null;
    const filePath = path.join(this.skillsDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        const event = await this.loadSkill(filePath);
        this.onChange?.(event);
      } else {
        const event = this.unloadSkill(filePath);
        if (event) this.onChange?.(event);
      }
    } catch (err: any) {
      this.onChange?.({ type: 'error', skillName: filename, fileName: filename, error: err.message });
    }
  }

  /** 合并所有技能的 tools */
  getAllTools(): AgentTool<any>[] {
    const tools: AgentTool<any>[] = [];
    for (const skill of this.skills.values()) {
      if (skill.definition.tools) tools.push(...skill.definition.tools);
    }
    return tools;
  }

  /** 合并所有技能的 prompt 片段 */
  getPromptFragment(): string {
    const fragments: string[] = [];
    for (const skill of this.skills.values()) {
      if (skill.definition.prompt) fragments.push(skill.definition.prompt);
    }
    return fragments.length > 0 ? '\n\n' + fragments.join('\n') : '';
  }

  /** 获取已加载技能列表 */
  getLoadedSkills(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  /** 获取技能目录路径 */
  getSkillsDir(): string {
    return this.skillsDir;
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
