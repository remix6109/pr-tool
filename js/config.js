/* 設定預設值 — 實際 API URL 與 PIN hash 都存在 localStorage */
window.CONFIG = {
  STORAGE_KEYS: {
    apiUrl: 'pr.apiUrl',
    pinHash: 'pr.pinHash',
    sessionUntil: 'pr.sessionUntil',
    defaultPerson: 'pr.defaultPerson',
    cache: 'pr.cache',
    theme: 'pr.theme',
    palette: 'pr.palette',
    personLabels: 'pr.personLabels'
  },
  TITLE_DEFAULT: '5 年存入計劃 (合計目標)',
  SESSION_HOURS: 24 * 30,                     // PIN 解鎖後保持登入 30 天
  PEOPLE: ['黃', '蘇'],
  YEARS: [2025, 2026, 2027, 2028, 2029],
  GOAL_DEFAULT: 3600000,                      // 預設 360 萬合計目標(可在前端編輯,存到 _meta)
  PLAN_START_DEFAULT: '2025-01-01',           // 5 年計劃起點 (可改)
  PLAN_END_DEFAULT: '2029-12-31'              // 5 年計劃終點 (可改)
};
