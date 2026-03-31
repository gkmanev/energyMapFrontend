export const FLOW_EIC_BY_ISO = Object.freeze({
  AL: '10YAL-KESH-----5',
  AT: '10YAT-APG------L',
  BA: '10YBA-JPCC-----D',
  BE: '10YBE----------2',
  BG: '10YCA-BULGARIA-R',
  BY: '10Y1001A1001A51S',
  CH: '10YCH-SWISSGRIDZ',
  CY: '10YCY-1001A0003J',
  CZ: '10YCZ-CEPS-----N',
  DE: [
    '10YDE-VE-------2',
    '10YDE-RWENET---I',
    '10YDE-EON------1',
    '10YDE-ENBW-----N',
  ],
  DK: ['10YDK-1--------W', '10YDK-2--------M'],
  EE: '10Y1001A1001A39I',
  ES: '10YES-REE------0',
  FI: '10YFI-1--------U',
  FR: '10YFR-RTE------C',
  GB: '10YGB----------A',
  GR: '10YGR-HTSO-----Y',
  HR: '10YHR-HEP------M',
  HU: '10YHU-MAVIR----U',
  IE: '10YIE-1001A00010',
  LT: '10YLT-1001A0008Q',
  LU: '10YLU-CEGEDEL-NQ',
  LV: '10YLV-1001A00074',
  MD: '10Y1001A1001A990',
  ME: '10YCS-CG-TSO---S',
  MK: '10YMK-MEPSO----8',
  MT: '10Y1001A1001A93C',
  NL: '10YNL----------L',
  NO: [
    '10YNO-1--------2',
    '10YNO-2--------T',
    '10YNO-3--------J',
    '10YNO-4--------9',
    '10Y1001A1001A48H',
  ],
  PL: '10YPL-AREA-----S',
  PT: '10YPT-REN------W',
  RO: '10YRO-TEL------P',
  RS: '10YCS-SERBIATSOV',
  SE: [
    '10Y1001A1001A44P',
    '10Y1001A1001A45N',
    '10Y1001A1001A46L',
    '10Y1001A1001A47J',
  ],
  SI: '10YSI-ELES-----O',
  SK: '10YSK-SEPS-----K',
  TR: '10YTR-TEIAS----W',
  UA: '10Y1001C--00003F',
  XK: '10Y1001C--00100H',
  GE: '10Y1001A1001B012',
})

export const FLOW_ISO_BY_EIC = Object.freeze(
  Object.entries(FLOW_EIC_BY_ISO).reduce((acc, [iso, value]) => {
    const codes = Array.isArray(value) ? value : [value]
    codes.forEach((code) => {
      acc[code] = iso
    })
    return acc
  }, {})
)
