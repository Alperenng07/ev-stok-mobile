/** Liste adı → API arama varyantları (Türkçe günlük ürünler). */
const SEARCH_VARIANTS: Record<string, string[]> = {
  ekmek: ['ekmek', 'normal ekmek', 'ekmek 1 adet'],
  sut: ['sut 1 lt', 'sut 1l', 'yagli sut 1 lt', 'sut'],
  yumurta: ['yumurta 15', 'yumurta 10', 'yumurta 30', 'yumurta'],
  deterjan: ['camasir deterjani', 'toz deterjan', 'sivi deterjan', 'deterjan'],
  camasir: ['camasir deterjani', 'toz deterjan', 'sivi deterjan'],
  yumusatici: ['camasir yumusatici', 'yumusatici', 'konsantre yumusatici'],
  peynir: ['beyaz peynir', 'peynir'],
  tereyag: ['tereyagi', 'tereyag'],
  pirinc: ['pirinc 1 kg', 'pirinc'],
  seker: ['toz seker', 'seker 1 kg', 'seker'],
  cay: ['cay 1 kg', 'cay'],
  makarna: ['makarna', 'spagetti'],
  yag: ['aycicek yagi', 'aycicek yag', 'sivi yag'],
  cikolata: ['sutlu cikolata', 'cikolata tablet', 'cikolata'],
  su: ['su 5 lt', 'su 5l', 'su'],
  tavuk: ['tavuk gogus', 'tavuk'],
  tuvalet: ['tuvalet kagidi', 'tuvalet kagidi 32'],
}

const SPECIALTY_PENALTY =
  /(organik|glutensiz|ruseym\w*|kepekli|sandvic\w*|cocuk|cilekli|cikolatali|kakaolu|bildiricin|gezen|omega|tam bugday|siyez|cavdar|yagli tohum|premium|gourmet|laktozsuz|protein|susamli|odun ekmek|hamburger|tost ekmek|cesitleri|nutella|maximus|findik kremasi|kakao findik)/i

/** Jenerik aramada yanlış marka / yan ürün cezası. */
const GENERIC_WRONG_HIT =
  /(yumos|nutella|maximus|findik kremasi|kakao findik|misir yag|cicek yag|zeytinyag|zeytin yag|kanola|soya yag)/i

function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeQuery(text: string): string {
  return normalize(text)
}

function stemKey(query: string): string {
  const q = normalize(query)
  if (q.includes('yumusatici')) return 'yumusatici'
  if (q.includes('deterjan') || q.includes('camasir')) return 'deterjan'
  if (q.includes('ekmek')) return 'ekmek'
  if (q.includes('yumurta')) return 'yumurta'
  if (/(^|\s)sut(\s|$)/.test(q) || q.includes('sut ')) return 'sut'
  if (q.includes('peynir')) return 'peynir'
  if (q.includes('tereyag')) return 'tereyag'
  if (q.includes('pirinc')) return 'pirinc'
  if (q.includes('seker')) return 'seker'
  if (/(^|\s)cay(\s|$)/.test(q)) return 'cay'
  if (q.includes('makarna') || q.includes('spagetti')) return 'makarna'
  if (q.includes('cikolata')) return 'cikolata'
  if (q.includes('aycicek') || q.includes('sivi yag') || /(^|\s)yag(\s|$)/.test(q)) return 'yag'
  if (/(^|\s)su(\s|$)/.test(q)) return 'su'
  if (q.includes('tavuk')) return 'tavuk'
  if (q.includes('tuvalet')) return 'tuvalet'
  return q.split(/\s+/)[0] ?? q
}

/** API’ye gönderilecek arama kelimeleri (öncelikli sırayla). */
export function searchKeywordsFor(itemName: string): string[] {
  const q = normalize(itemName)
  const key = stemKey(itemName)
  const variants = SEARCH_VARIANTS[key] ?? []
  const list = [...variants, q, itemName.trim()].filter(Boolean)
  const unique: string[] = []
  for (const v of list) {
    const n = normalize(v)
    if (n && !unique.some((u) => normalize(u) === n)) unique.push(v)
  }
  return unique.slice(0, 4)
}

function queryWantsSpecialty(query: string): boolean {
  return SPECIALTY_PENALTY.test(normalize(query)) || GENERIC_WRONG_HIT.test(normalize(query))
}

function volumeScore(query: string, title: string): number {
  const q = normalize(query)
  const t = normalize(title)
  const key = stemKey(query)

  if (key === 'sut') {
    if (/\b1\s*(lt|l|litre)\b/.test(t)) return 35
    if (/\b(180|200|250|500)\s*ml\b/.test(t)) return -40
    if (/\bcocuk|cilek|cikolata|kakaolu\b/.test(t)) return -50
  }
  if (key === 'ekmek') {
    if (/^(ekmek 1 adet|normal ekmek 1 adet|ekmek)$/.test(t)) return 45
    if (/^ekmek\b/.test(t) && t.length < 22) return 30
    if (/\b1\s*adet\b/.test(t) && t.startsWith('ekmek')) return 25
    if (/\b(sandvic|hamburger|tost|ruseym|kepek|odun|cesit)\b/.test(t)) return -45
  }
  if (key === 'yumurta') {
    if (/\b(10|15|30)\s*adet\b/.test(t) && !/\bbildiricin\b/.test(t)) return 25
    if (/\bbildiricin\b/.test(t)) return -50
    if (/\b6\s*adet\b/.test(t)) return -10
  }
  if (key === 'deterjan') {
    if (/\b(toz|sivi)\s+deterjan\b/.test(t) || /\bdeterjan\b/.test(t)) return 20
    if (/\bbulasik|makine yumusatici|yumusatici\b/.test(t) && !q.includes('bulasik')) return -25
  }
  if (key === 'yumusatici') {
    if (/\byumusatici\b/.test(t)) return 35
    if (/\bdeterjan\b/.test(t) && !/\byumusatici\b/.test(t)) return -40
    if (/\byumos\b/.test(t) && !/\byumos\b/.test(q)) return -35
  }
  if (key === 'yag') {
    if (/\baycicek\b/.test(t)) return 40
    if (/\bsivi yag\b/.test(t) && !/\b(misir|cicek|zeytin|findik|kanola|soya)\b/.test(t)) return 25
    if (/\b(misir|cicek yag|zeytin|findik|kanola|soya)\b/.test(t)) {
      const wantsAlt =
        /\bmisir\b/.test(q) ||
        /\bcicek\b/.test(q) ||
        /\bzeytin\b/.test(q) ||
        /\bfindik\b/.test(q) ||
        /\bkanola\b/.test(q) ||
        /\bsoya\b/.test(q)
      if (!wantsAlt) return -55
    }
  }
  if (key === 'cikolata') {
    if (/\b(nutella|maximus|findik kremasi|kakao findik)\b/.test(t) && !queryWantsSpecialty(query)) {
      return -60
    }
    if (/\bcikolata\b/.test(t) && !/\bkrem\b/.test(t)) return 30
    if (/\bkrem\b/.test(t) && !/\bkrem\b/.test(q)) return -40
  }
  return 0
}

/**
 * Ürün adı eşleşme skoru. Düşük skorlar elenir; yanlış “lüks” ürünlere düşmemek için
 * specialty cezası ve hacim tercihleri uygulanır.
 */
export function scoreProductTitle(query: string, title: string): number {
  const q = normalize(query)
  const t = normalize(title)
  if (!q || !t) return 0

  const qTokens = q.split(/\s+/).filter((tok) => tok.length > 1)
  const key = stemKey(query)

  let score = 0

  if (t === q) score += 140
  else if (t === `${q} 1 adet` || t === `normal ${q} 1 adet`) score += 130
  else if (t.startsWith(`${q} `) || t.startsWith(`normal ${q}`)) score += 100
  else if (new RegExp(`(^|\\s)${key}(\\s|$)`).test(t)) score += 70
  else {
    const hits = qTokens.filter((tok) => t.includes(tok)).length
    if (hits === 0) return 0
    score += (hits / Math.max(qTokens.length, 1)) * 55
  }

  // Ana kelime başlıkta yoksa ele
  if (key.length >= 3 && !t.includes(key) && !qTokens.some((tok) => t.includes(tok))) {
    // yağ aramasında aycicek kabul
    if (!(key === 'yag' && /\baycicek\b/.test(t))) return 0
  }

  // Kısa / sade isim bonus
  score += Math.max(0, 36 - Math.min(t.length, 72) / 2)

  // Özel ürün cezası (kullanıcı özellikle istemediyse)
  if (!queryWantsSpecialty(query) && SPECIALTY_PENALTY.test(t)) {
    score -= 55
  }

  // Jenerik aramada yanlış marka / yan ürün
  if (!queryWantsSpecialty(query) && GENERIC_WRONG_HIT.test(t)) {
    score -= 40
  }

  score += volumeScore(query, title)

  // Markasız / jenerik ekmek vb.
  if (/\bmarkasiz\b/.test(t) || /^ekmek\b/.test(t) || /^normal ekmek\b/.test(t)) {
    score += 8
  }

  return score
}

export function minAcceptScore(query: string): number {
  const q = normalize(query)
  // Tek kelimelik günlük ürünlerde daha seçici ol
  if (q.split(/\s+/).length === 1) return 95
  return 65
}
