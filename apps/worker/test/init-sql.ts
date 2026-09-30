// 读取 0001_init.sql 原文，供测试库建表（vite 的 ?raw 导入在运行时是纯字符串）。
import sql from '../migrations/0001_init.sql?raw';

export const INIT_SQL: string = sql;
