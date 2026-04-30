/* 主題色票 — 5 種預設,可在「設定」切換 */
window.THEMES = [
  {
    id: 'sage',
    name: '沉靜大地',
    swatch: ['#3F7373', '#768C45', '#A8BDBF', '#C5D7D9', '#F2F1F0'],
    light: {
      '--bg': '#F2F1F0', '--surface': '#FFFFFF', '--surface-2': '#E8EFF0', '--bar-bg': '#C5D7D9',
      '--text': '#2A3938', '--muted': '#6B7676', '--border': '#C5D7D9',
      '--primary': '#3F7373', '--primary-d': '#2D5959',
      '--green': '#768C45', '--purple': '#5C8C7D', '--red': '#B85042',
      '--huang': '#768C45', '--su': '#3F7373', '--slate': '#6B7676', '--time': '#A8BDBF',
      '--gain-bg': 'rgba(118,140,69,.12)', '--loss-bg': 'rgba(184,80,66,.10)', '--neutral-bg': 'rgba(168,189,191,.18)',
      '--shadow': '0 1px 3px rgba(63,115,115,.07), 0 1px 2px rgba(63,115,115,.04)'
    },
    dark: {
      '--bg': '#1A2424', '--surface': '#2A3636', '--surface-2': '#354242', '--bar-bg': '#3D4D4D',
      '--text': '#F2F1F0', '--muted': '#A8BDBF', '--border': '#3D4D4D',
      '--primary': '#A8BDBF', '--primary-d': '#C5D7D9',
      '--green': '#A4B96C', '--purple': '#8FA68F', '--red': '#D49278',
      '--huang': '#A4B96C', '--su': '#C5D7D9', '--slate': '#A8BDBF', '--time': '#A8BDBF',
      '--gain-bg': 'rgba(164,185,108,.14)', '--loss-bg': 'rgba(212,146,120,.14)', '--neutral-bg': 'rgba(168,189,191,.10)',
      '--shadow': '0 1px 4px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.25)'
    },
    chart: ['#3F7373', '#768C45', '#A8BDBF', '#B85042', '#5C8C7D', '#8FA068', '#B8945E', '#6B5947', '#A88C5A', '#4A6B5C', '#C5D7D9'],
    metaLight: '#3F7373', metaDark: '#1A2424'
  },
  {
    id: 'classic',
    name: '原始藍',
    swatch: ['#2563EB', '#9333EA', '#16A34A', '#F59E0B', '#F4F6FB'],
    light: {
      '--bg': '#F4F6FB', '--surface': '#FFFFFF', '--surface-2': '#F1F5F9', '--bar-bg': '#E2E8F0',
      '--text': '#1F2937', '--muted': '#6B7280', '--border': '#E5E7EB',
      '--primary': '#2563EB', '--primary-d': '#1D4ED8',
      '--green': '#16A34A', '--purple': '#9333EA', '--red': '#DC2626',
      '--huang': '#F59E0B', '--su': '#A855F7', '--slate': '#475569', '--time': '#94A3B8',
      '--gain-bg': '#ECFDF5', '--loss-bg': '#FEF2F2', '--neutral-bg': '#F1F5F9',
      '--shadow': '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)'
    },
    dark: {
      '--bg': '#0B1120', '--surface': '#1E293B', '--surface-2': '#273344', '--bar-bg': '#334155',
      '--text': '#E2E8F0', '--muted': '#94A3B8', '--border': '#334155',
      '--primary': '#3B82F6', '--primary-d': '#2563EB',
      '--green': '#4ADE80', '--purple': '#C084FC', '--red': '#F87171',
      '--huang': '#FBBF24', '--su': '#C084FC', '--slate': '#64748B', '--time': '#64748B',
      '--gain-bg': 'rgba(74,222,128,.12)', '--loss-bg': 'rgba(248,113,113,.12)', '--neutral-bg': '#273344',
      '--shadow': '0 1px 4px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.3)'
    },
    chart: ['#F59E0B', '#A855F7', '#3B82F6', '#16A34A', '#DC2626', '#EC4899', '#14B8A6', '#EAB308', '#8B5CF6', '#06B6D4', '#84CC16'],
    metaLight: '#2563EB', metaDark: '#0B1120'
  },
  {
    id: 'wood',
    name: '暖木調',
    swatch: ['#8B5E3C', '#B8884E', '#7A8C4A', '#C4514A', '#F5EFE6'],
    light: {
      '--bg': '#F5EFE6', '--surface': '#FFFFFF', '--surface-2': '#F1E8DD', '--bar-bg': '#E5D5C2',
      '--text': '#3D2E20', '--muted': '#8C7459', '--border': '#E5D5C2',
      '--primary': '#8B5E3C', '--primary-d': '#6F4A2E',
      '--green': '#7A8C4A', '--purple': '#B86D52', '--red': '#C4514A',
      '--huang': '#B8884E', '--su': '#8B5E3C', '--slate': '#8C7459', '--time': '#C2A883',
      '--gain-bg': 'rgba(122,140,74,.12)', '--loss-bg': 'rgba(196,81,74,.10)', '--neutral-bg': 'rgba(229,213,194,.30)',
      '--shadow': '0 1px 3px rgba(140,116,89,.10), 0 1px 2px rgba(140,116,89,.06)'
    },
    dark: {
      '--bg': '#2A1F18', '--surface': '#3A2C22', '--surface-2': '#4A3A2D', '--bar-bg': '#5A4A3D',
      '--text': '#F5EFE6', '--muted': '#C2A883', '--border': '#5A4A3D',
      '--primary': '#C2A883', '--primary-d': '#E5D5C2',
      '--green': '#B5C18A', '--purple': '#D9A088', '--red': '#E08F87',
      '--huang': '#DDB880', '--su': '#C2A883', '--slate': '#C2A883', '--time': '#C2A883',
      '--gain-bg': 'rgba(181,193,138,.14)', '--loss-bg': 'rgba(224,143,135,.14)', '--neutral-bg': 'rgba(194,168,131,.10)',
      '--shadow': '0 1px 4px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.25)'
    },
    chart: ['#8B5E3C', '#7A8C4A', '#B8884E', '#C4514A', '#A07054', '#B0905C', '#6F8C66', '#9C6A48', '#D9A088', '#7C6552', '#C2A883'],
    metaLight: '#8B5E3C', metaDark: '#2A1F18'
  },
  {
    id: 'ink',
    name: '墨韻',
    swatch: ['#2C2C2C', '#4A7060', '#B59B41', '#A8453A', '#FAF8F2'],
    light: {
      '--bg': '#FAF8F2', '--surface': '#FFFFFF', '--surface-2': '#F0EDE3', '--bar-bg': '#DDD8C8',
      '--text': '#1F1F1F', '--muted': '#5C5C5C', '--border': '#DDD8C8',
      '--primary': '#2C2C2C', '--primary-d': '#000000',
      '--green': '#4A7060', '--purple': '#6B7E5A', '--red': '#A8453A',
      '--huang': '#B59B41', '--su': '#2C2C2C', '--slate': '#5C5C5C', '--time': '#A8A095',
      '--gain-bg': 'rgba(74,112,96,.12)', '--loss-bg': 'rgba(168,69,58,.10)', '--neutral-bg': 'rgba(221,216,200,.30)',
      '--shadow': '0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.04)'
    },
    dark: {
      '--bg': '#15151A', '--surface': '#232328', '--surface-2': '#2D2D33', '--bar-bg': '#3A3A40',
      '--text': '#FAF8F2', '--muted': '#A8A095', '--border': '#3A3A40',
      '--primary': '#DDD8C8', '--primary-d': '#FAF8F2',
      '--green': '#88B09C', '--purple': '#A2B58F', '--red': '#D4827A',
      '--huang': '#DBC176', '--su': '#DDD8C8', '--slate': '#A8A095', '--time': '#A8A095',
      '--gain-bg': 'rgba(136,176,156,.14)', '--loss-bg': 'rgba(212,130,122,.14)', '--neutral-bg': 'rgba(168,160,149,.10)',
      '--shadow': '0 1px 4px rgba(0,0,0,.5), 0 1px 2px rgba(0,0,0,.3)'
    },
    chart: ['#2C2C2C', '#4A7060', '#B59B41', '#A8453A', '#6B7E5A', '#7B6F4F', '#56756B', '#9C7A33', '#787266', '#5A5A5A', '#A8A095'],
    metaLight: '#2C2C2C', metaDark: '#15151A'
  },
  {
    id: 'mist',
    name: '晨霧',
    swatch: ['#5A6B82', '#6B8B6F', '#D08778', '#C9A276', '#F4F1EC'],
    light: {
      '--bg': '#F4F1EC', '--surface': '#FFFFFF', '--surface-2': '#ECE7DF', '--bar-bg': '#D5D7DC',
      '--text': '#2D3540', '--muted': '#6F7782', '--border': '#D5D7DC',
      '--primary': '#5A6B82', '--primary-d': '#3F4F66',
      '--green': '#6B8B6F', '--purple': '#8295A8', '--red': '#D08778',
      '--huang': '#C9A276', '--su': '#5A6B82', '--slate': '#6F7782', '--time': '#A4ABB5',
      '--gain-bg': 'rgba(107,139,111,.12)', '--loss-bg': 'rgba(208,135,120,.12)', '--neutral-bg': 'rgba(213,215,220,.30)',
      '--shadow': '0 1px 3px rgba(90,107,130,.08), 0 1px 2px rgba(90,107,130,.04)'
    },
    dark: {
      '--bg': '#1A1F26', '--surface': '#2A3038', '--surface-2': '#353B45', '--bar-bg': '#3F4754',
      '--text': '#F4F1EC', '--muted': '#A4ABB5', '--border': '#3F4754',
      '--primary': '#A4ABB5', '--primary-d': '#C7CCD3',
      '--green': '#94B197', '--purple': '#B0BAC8', '--red': '#E5A99B',
      '--huang': '#DDC09A', '--su': '#C7CCD3', '--slate': '#A4ABB5', '--time': '#A4ABB5',
      '--gain-bg': 'rgba(148,177,151,.14)', '--loss-bg': 'rgba(229,169,155,.14)', '--neutral-bg': 'rgba(164,171,181,.10)',
      '--shadow': '0 1px 4px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.25)'
    },
    chart: ['#5A6B82', '#6B8B6F', '#D08778', '#C9A276', '#8295A8', '#94A294', '#9F8B66', '#7A6E76', '#A4ABB5', '#B59C7E', '#6F8186'],
    metaLight: '#5A6B82', metaDark: '#1A1F26'
  }
];

window.THEMES_DEFAULT_ID = 'sage';
