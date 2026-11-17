// Anonymous schedule labels require an official item description. They are
// discovery signals only, never evidence of healthcare or a product identity.
export function isAnonymousScheduleLabel(value) {
 const text=String(value??'').normalize('NFKC').trim().toUpperCase()
  .replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[.:]+$/,'').trimEnd()
  .replace(/^S\s+C\s+H(?=[\s._:#-]*[0-9IVXLC])/,'SCH');
 const match=text.match(/^(?:SCH|SCHED|SCHEDULE)[\s._:#-]*([0-9]{1,4}|[IVXLC]{1,8})$/);
 if(!match)return false;
 if(/^[0-9]+$/.test(match[1]))return true;
 // Bound Roman schedule labels to I–XCIX; avoid words such as "MIX".
 // Larger schedules can still use their numeric identifiers.
 return /^(?=[XLCIV]+$)(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/.test(match[1]);
}
