// Curated UCITS ETF catalog for one-click add — Ireland/EU-domiciled funds,
// each pre-mapped to a US-listed proxy tracking the same (or nearest) index.
// Display metadata only; TERs approximate. Proxy mapping is the load-bearing field.
export const ETF_CATALOG = [
  // Global
  { ucits: 'VWCE', name: 'Vanguard FTSE All-World (Acc)', ter: '0.22%', category: 'Global', proxy: 'VT' },
  { ucits: 'FWRA', name: 'Invesco FTSE All-World (Acc)', ter: '0.15%', category: 'Global', proxy: 'VT' },
  { ucits: 'SSAC', name: 'iShares MSCI ACWI (Acc)', ter: '0.20%', category: 'Global', proxy: 'ACWI' },
  { ucits: 'IWDA', name: 'iShares Core MSCI World (Acc)', ter: '0.20%', category: 'Global Dev', proxy: 'URTH' },
  { ucits: 'SWRD', name: 'SPDR MSCI World (Acc)', ter: '0.12%', category: 'Global Dev', proxy: 'URTH' },
  { ucits: 'XDWD', name: 'Xtrackers MSCI World (Acc)', ter: '0.19%', category: 'Global Dev', proxy: 'URTH' },
  { ucits: 'VHVG', name: 'Vanguard FTSE Developed World (Acc)', ter: '0.12%', category: 'Global Dev', proxy: 'VEA' },
  { ucits: 'WSML', name: 'iShares MSCI World Small Cap (Acc)', ter: '0.35%', category: 'Global Small Cap', proxy: 'IWM' },
  // Factors
  { ucits: 'IWMO', name: 'iShares Edge MSCI World Momentum (Acc)', ter: '0.30%', category: 'Momentum Factor', proxy: 'MTUM' },
  { ucits: 'IWQU', name: 'iShares Edge MSCI World Quality (Acc)', ter: '0.30%', category: 'Quality Factor', proxy: 'QUAL' },
  { ucits: 'IWVL', name: 'iShares Edge MSCI World Value (Acc)', ter: '0.30%', category: 'Value Factor', proxy: 'VLUE' },
  { ucits: 'MVOL', name: 'iShares Edge MSCI World Min Vol (Acc)', ter: '0.30%', category: 'Low Volatility', proxy: 'USMV' },
  // US
  { ucits: 'CSPX', name: 'iShares Core S&P 500 (Acc)', ter: '0.07%', category: 'Core US', proxy: 'SPY' },
  { ucits: 'VUAA', name: 'Vanguard S&P 500 (Acc)', ter: '0.07%', category: 'Core US', proxy: 'SPY' },
  { ucits: 'XDEW', name: 'Xtrackers S&P 500 Equal Weight (Acc)', ter: '0.20%', category: 'US Equal Weight', proxy: 'RSP' },
  { ucits: 'VNRT', name: 'Vanguard FTSE North America (Acc)', ter: '0.10%', category: 'North America', proxy: 'VTI' },
  { ucits: 'CNDX', name: 'iShares Nasdaq 100 (Acc)', ter: '0.33%', category: 'Tech', proxy: 'QQQ' },
  { ucits: 'EQAC', name: 'Invesco EQQQ Nasdaq-100 (Acc)', ter: '0.30%', category: 'Tech', proxy: 'QQQ' },
  { ucits: 'XNAS', name: 'Xtrackers Nasdaq 100 (Acc)', ter: '0.20%', category: 'Tech', proxy: 'QQQ' },
  // Regions
  { ucits: 'EIMI', name: 'iShares Core MSCI EM IMI (Acc)', ter: '0.18%', category: 'Emerging Markets', proxy: 'EEM' },
  { ucits: 'VFEG', name: 'Vanguard FTSE Emerging Markets (Acc)', ter: '0.22%', category: 'Emerging Markets', proxy: 'VWO' },
  { ucits: 'MEUD', name: 'Amundi Stoxx Europe 600 (Acc)', ter: '0.07%', category: 'Europe', proxy: 'VGK' },
  { ucits: 'SMEA', name: 'iShares Core MSCI Europe (Acc)', ter: '0.12%', category: 'Europe', proxy: 'IEUR' },
  { ucits: 'CSX5', name: 'iShares Core EURO STOXX 50 (Acc)', ter: '0.10%', category: 'Eurozone', proxy: 'FEZ' },
  { ucits: 'CUKX', name: 'iShares Core FTSE 100 (Acc)', ter: '0.07%', category: 'UK', proxy: 'EWU' },
  { ucits: 'SJPA', name: 'iShares Core MSCI Japan IMI (Acc)', ter: '0.12%', category: 'Japan', proxy: 'EWJ' },
  { ucits: 'NDIA', name: 'iShares MSCI India (Acc)', ter: '0.65%', category: 'India', proxy: 'INDA' },
  { ucits: 'FLXI', name: 'Franklin FTSE India (Acc)', ter: '0.19%', category: 'India', proxy: 'FLIN' },
  // US sectors
  { ucits: 'IITU', name: 'iShares S&P 500 Information Technology', ter: '0.15%', category: 'Tech Sector', proxy: 'XLK' },
  { ucits: 'IUFS', name: 'iShares S&P 500 Financials', ter: '0.15%', category: 'Financials', proxy: 'XLF' },
  { ucits: 'IUHC', name: 'iShares S&P 500 Health Care', ter: '0.15%', category: 'Healthcare', proxy: 'XLV' },
  { ucits: 'IUES', name: 'iShares S&P 500 Energy', ter: '0.15%', category: 'Energy', proxy: 'XLE' },
  { ucits: 'IUCD', name: 'iShares S&P 500 Consumer Discretionary', ter: '0.15%', category: 'Consumer Disc.', proxy: 'XLY' },
  { ucits: 'IUCS', name: 'iShares S&P 500 Consumer Staples', ter: '0.15%', category: 'Consumer Staples', proxy: 'XLP' },
  { ucits: 'XDWH', name: 'Xtrackers MSCI World Health Care (Acc)', ter: '0.25%', category: 'Healthcare', proxy: 'IXJ' },
  { ucits: 'XDWT', name: 'Xtrackers MSCI World Information Tech (Acc)', ter: '0.25%', category: 'Tech Sector', proxy: 'IXN' },
  // Thematic
  { ucits: 'SMGB', name: 'VanEck Semiconductor (Acc)', ter: '0.35%', category: 'Semis', proxy: 'SMH' },
  { ucits: 'AIAI', name: 'L&G Artificial Intelligence', ter: '0.49%', category: 'AI thematic', proxy: 'THNQ' },
  { ucits: 'XAIX', name: 'Xtrackers AI & Big Data (Acc)', ter: '0.35%', category: 'AI thematic', proxy: 'AIQ' },
  { ucits: 'RBOT', name: 'iShares Automation & Robotics (Acc)', ter: '0.40%', category: 'AI/Robotics', proxy: 'BOTZ' },
  { ucits: 'AIRO', name: 'Global X Robotics & AI', ter: '0.50%', category: 'AI/Robotics', proxy: 'BOTZ' },
  { ucits: 'ISPY', name: 'L&G Cyber Security', ter: '0.69%', category: 'Cybersecurity', proxy: 'HACK' },
  { ucits: 'LOCK', name: 'iShares Digital Security (Acc)', ter: '0.40%', category: 'Cybersecurity', proxy: 'CIBR' },
  { ucits: 'WCLD', name: 'WisdomTree Cloud Computing (Acc)', ter: '0.40%', category: 'Cloud', proxy: 'WCLD' },
  { ucits: 'BTEC', name: 'iShares Nasdaq US Biotechnology (Acc)', ter: '0.35%', category: 'Biotech', proxy: 'IBB' },
  { ucits: 'ECAR', name: 'iShares Electric Vehicles & Driving Tech (Acc)', ter: '0.40%', category: 'EV/Mobility', proxy: 'DRIV' },
  { ucits: 'INRG', name: 'iShares Global Clean Energy', ter: '0.65%', category: 'Clean Energy', proxy: 'ICLN' },
  { ucits: 'URNU', name: 'Global X Uranium (Acc)', ter: '0.65%', category: 'Uranium', proxy: 'URA' },
  { ucits: 'NUCL', name: 'VanEck Uranium & Nuclear (Acc)', ter: '0.55%', category: 'Nuclear', proxy: 'NLR' },
  { ucits: 'NATO', name: 'HANetf Future of Defence (Acc)', ter: '0.69%', category: 'Defense', proxy: 'ITA' },
  { ucits: 'DFNS', name: 'VanEck Defense (Acc)', ter: '0.55%', category: 'Defense', proxy: 'PPA' },
  { ucits: 'ESPO', name: 'VanEck Video Gaming & eSports (Acc)', ter: '0.55%', category: 'Gaming', proxy: 'ESPO' },
  { ucits: 'GDX',  name: 'VanEck Gold Miners', ter: '0.53%', category: 'Gold Miners', proxy: 'GDX' },
  { ucits: 'IH2O', name: 'iShares Global Water (Acc)', ter: '0.65%', category: 'Water', proxy: 'CGW' },
  { ucits: 'INFR', name: 'iShares Global Infrastructure', ter: '0.65%', category: 'Infrastructure', proxy: 'IGF' },
];

// Case-insensitive substring match on ticker, name, or category.
export function searchCatalog(query, existingUcits = []) {
  const q = query?.trim().toLowerCase();
  if (!q) return [];
  const existing = new Set(existingUcits.map(u => u.toUpperCase()));
  return ETF_CATALOG
    .filter(e =>
      e.ucits.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q))
    .map(e => ({ ...e, added: existing.has(e.ucits) }))
    .slice(0, 12);
}
