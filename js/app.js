// =========================================================
// STATE & HELPERS
// =========================================================
const state = { token:null, user:null, page:'home', managedSheets:[], schemaCache:{}, charts:{} };

// [CRM v2] plugin โชว์ตัวเลข/ข้อความกลางวง donut (ใช้ผ่าน options.plugins.centerText)
// [Premium redesign] ตั้งค่า default ให้ Chart.js ทุกกราฟในระบบพร้อมกันทีเดียว (ฟอนต์/สีตัวหนังสือ/แท่งโค้งมน)
Chart.defaults.font.family = "'Inter','Prompt',sans-serif";
Chart.defaults.color = '#6B7280';
Chart.defaults.elements.bar.borderRadius = 8;
Chart.defaults.elements.bar.borderSkipped = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#1F2328';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.titleFont = { family:"'Inter','Prompt',sans-serif", weight:'600' };
Chart.defaults.plugins.tooltip.bodyFont = { family:"'Inter','Prompt',sans-serif" };
Chart.defaults.plugins.legend.labels.font = { family:"'Inter','Prompt',sans-serif", size:11 };
Chart.defaults.plugins.legend.labels.boxWidth = 9;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.animation.duration = 650;
Chart.defaults.animation.easing = 'easeOutQuart';

Chart.register({
  id: 'centerText',
  beforeDraw(chart){
    // [แก้บั๊กสำคัญ] Chart.js เปิด plugin นี้เป็น true ให้ทุกกราฟอัตโนมัติทันทีที่ลงทะเบียน (แม้ไม่ได้ตั้งค่า)
    // ถ้าเช็คแค่ !opts จะไม่ return เพราะ true ไม่ใช่ falsy ต้องเช็คว่าเป็น object จริงที่มี .text ก่อนถึงจะวาด
    const opts = chart.options.plugins && chart.options.plugins.centerText;
    if (!opts || typeof opts !== 'object' || !opts.text) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const { width, height, top, left } = chartArea;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "800 26px Inter, sans-serif"; ctx.fillStyle = opts.color || '#1E293B';
    ctx.fillText(opts.text, left + width/2, top + height/2 - (opts.sub ? 10 : 0));
    if (opts.sub) { ctx.font = "500 11px Inter, sans-serif"; ctx.fillStyle = '#64748B'; ctx.fillText(opts.sub, left + width/2, top + height/2 + 14); }
    ctx.restore();
  }
});
// [CRM v2] สร้าง gradient แนวตั้งสำหรับกราฟแท่ง/เส้น
function crmGradient(canvasId, colorFrom, colorTo){
  const el = document.getElementById(canvasId);
  if (!el) return colorFrom;
  const ctx = el.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, el.height || 260);
  g.addColorStop(0, colorFrom); g.addColorStop(1, colorTo);
  return g;
}

const MASTER_DATA_LABELS = {
  'Employee':'พนักงาน','Document':'เอกสาร','SOP':'SOP','Announcement':'ประกาศ','Task':'งาน (Task)',
  'Asset':'ทรัพย์สิน','Training':'อบรม','Meeting':'ประชุม','Quick_Report':'Quick Report',
  'Ecommerce KPI':'Ecommerce KPI','KPI_Master':'KPI Master','KPI_Entry':'KPI Entry',
  'Role':'Role (สิทธิ์)','Department':'แผนก','Position':'ตำแหน่ง','Holiday':'วันหยุด','DocumentType':'ประเภทเอกสาร',
  'Settings':'ตั้งค่าระบบ','Approval Matrix':'Approval Matrix','Notification Matrix':'Notification Matrix',
  'Reward Matrix':'Reward Matrix','Sales Target':'เป้าขาย','Leave_Type':'ประเภทการลา','Leave_Balance':'สิทธิ์ลาคงเหลือ',
  'KPI Points':'ประวัติคะแนน KPI','AttendanceSchedule':'ตารางเวลาทำงาน','LateDeductionRule':'กฎหักเงินมาสาย',
  'LeaveEntitlementRule':'กฎสิทธิ์วันลา','LeaveDeductionRule':'กฎหักเบี้ยขยัน','Audit Log':'Audit Log',
  'KPI_Point_Rule':'กฎให้แต้ม KPI','Reward_Tier':'ระดับรางวัล','Reward_Catalog':'แคตตาล็อกของรางวัล','Redemption':'การแลกของรางวัล',
  'Task_Comment':'ความคิดเห็นงาน'
};
// โมดูลที่มีหน้าเฉพาะทางแล้ว ไม่ต้องซ้ำใน "ข้อมูลหลัก"
const DEDICATED_SHEETS = ['Attendance','OT','Leave_Request','Sales KPI','Employee','CustomerFollowup','Mistake','ForeignInquiry','Task'];
// [Phase 1: Freeze KPI/Reward] ซ่อนชีตกลุ่มนี้ทั้งหมดจากเมนู ไม่โหลด ไม่คำนวณ ไม่แสดง — โค้ด/ข้อมูลยังอยู่ครบ รอเปิดใช้ Phase 2
const FROZEN_SHEETS = ['Sales KPI','KPI Points','KPI_Point_Rule','Reward_Tier','Reward_Catalog','Redemption','Ecommerce KPI','KPI_Master','KPI_Entry','Task_Comment'];

// [ตั้งค่าระบบ] จัดหมวดหมู่ชีต config แทนการโชว์ list แบนราบยาวๆ — ไม่ต้องสร้างชีตใหม่ แค่จัดกลุ่มการแสดงผล
const SETTINGS_GROUPS = [
  { key:'docs', label:'งานเอกสาร', icon:'📄', sheets:['Document','SOP','DocumentType','Announcement'] },
  { key:'workrules', label:'กฎการทำงาน', icon:'📐', sheets:['AttendanceSchedule','LateDeductionRule','LeaveEntitlementRule','LeaveDeductionRule','Leave_Balance','Leave_Type'] },
  { key:'company', label:'ตั้งค่าบริษัท', icon:'🏢', sheets:['Role','Department','Position','Holiday','Approval Matrix','Notification Matrix','Settings'] },
  { key:'audit', label:'ตรวจสอบ', icon:'🔍', sheets:['Audit Log'] },
  { key:'extra', label:'อื่นๆ (ใช้ไม่บ่อย)', icon:'🗂️', sheets:['Asset','Training','Quick_Report','Meeting','Reward_Warning','Reward Matrix','Sales Target'] }
];
async function renderSettingsHub(){
  const grouped = new Set(SETTINGS_GROUPS.flatMap(g=>g.sheets));
  // ชีตที่ยังไม่ถูกจัดกลุ่ม (กันตกหล่น) ไปกองรวมใน "อื่นๆ" อัตโนมัติ — ไม่รวม FROZEN_SHEETS และ DEDICATED_SHEETS
  const uncategorized = state.managedSheets.filter(s => DEDICATED_SHEETS.indexOf(s)===-1 && FROZEN_SHEETS.indexOf(s)===-1 && !grouped.has(s));
  const groups = SETTINGS_GROUPS.map(g => g.key==='extra' ? Object.assign({}, g, { sheets: g.sheets.concat(uncategorized) }) : g);

  if (!state._settingsGroup) {
    document.getElementById('content').innerHTML = `
      <div class="grid grid-3">
        ${groups.map(g=>{
          const available = g.sheets.filter(s => state.managedSheets.indexOf(s)!==-1);
          return `<div class="card" style="cursor:pointer;" onclick="state._settingsGroup='${g.key}'; go('settingshub');">
            <div style="font-size:26px;margin-bottom:8px;">${g.icon}</div>
            <div class="card-title" style="margin-bottom:4px;">${g.label}</div>
            <div class="small text-muted">${available.length} รายการ</div>
          </div>`;
        }).join('')}
      </div>
    `;
    return;
  }
  const group = groups.find(g=>g.key===state._settingsGroup);
  const available = group.sheets.filter(s => state.managedSheets.indexOf(s)!==-1);
  document.getElementById('content').innerHTML = `
    <button class="btn btn-ghost btn-sm mb-2" onclick="state._settingsGroup=null; go('settingshub');">← กลับไปหมวดหมู่</button>
    <div class="card-title mb-2" style="font-size:16px;">${group.icon} ${group.label}</div>
    <div class="grid grid-3">
      ${available.length ? available.map(s=>`
        <div class="card" style="cursor:pointer;" onclick="${s==='Leave_Balance' ? "go('leavebalance')" : "openGenericSheet('"+s.replace(/'/g,"\\'")+"')"}">
          <div class="card-title" style="margin-bottom:0;">${s==='Leave_Balance' ? 'สิทธิ์วันลาคงเหลือ (Opening Balance)' : (MASTER_DATA_LABELS[s] || s)}</div>
        </div>`).join('') : '<div class="helper">ไม่มีรายการในหมวดนี้</div>'}
    </div>
  `;
}

function fmt(d){ if(!d) return '—'; try{ return new Date(d).toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'});}catch(e){return d;} }

// =========================================================
// [UI Standard] มาตรฐานการแสดงชื่อพนักงานทั้งระบบ — Helper กลาง 2 ตัว ห้ามเขียน logic ชื่อซ้ำที่อื่น ทุกหน้าต้องเรียกผ่านนี้
// ลำดับ: ชื่อเล่น → ชื่อจริง → EmployeeID
// รับได้ทั้ง employee object เต็มๆ หรือแค่ EmployeeID string เฉยๆ (จะ lookup จาก state._employeeMap ให้อัตโนมัติ)
// =========================================================
function resolveEmployeeRecord_(employeeOrId){
  if (employeeOrId && typeof employeeOrId === 'object') return employeeOrId;
  if (!employeeOrId) return null;
  return (state._employeeMap && state._employeeMap[String(employeeOrId)]) || null;
}
// ใช้ในรายการทั่วไป/การ์ด/หน้าแรก ฯลฯ — โชว์แค่ชื่อ ไม่ต้องมีรหัส
function getEmployeeDisplayName(employeeOrId){
  const emp = resolveEmployeeRecord_(employeeOrId);
  if (emp) return emp['ชื่อเล่น'] || emp['ชื่อจริง'] || emp['ID'] || String(employeeOrId||'');
  return String(employeeOrId || '');
}
// ใช้เฉพาะหน้าอ้างอิง/เอกสาร: Approval, Employee Profile, Payroll, Audit, Export/Print/PDF/Excel — โชว์ "ชื่อ (รหัส)"
function getEmployeeDisplayWithId(employeeOrId){
  const emp = resolveEmployeeRecord_(employeeOrId);
  const id = emp ? (emp['ID'] || String(employeeOrId||'')) : String(employeeOrId||'');
  const name = getEmployeeDisplayName(employeeOrId);
  return (!id || name === id) ? name : `${name} (${id})`;
}
// label จาก getMyWork มีรูปแบบ "... — EMPID" เสมอ (backend ไม่ได้ส่งชื่อมาด้วย) แปลงส่วนท้ายเป็นชื่อผ่าน Helper โดยไม่ต้องแก้ backend
// [Calendar Display Layer] backend ส่ง title มาเป็น "EmployeeID ลาXXX" — แปลงส่วน ID ให้เป็นชื่อ + Normalize ส่วนประเภทลาผ่าน normalizeLeaveTypeLabel() (ตัวเดียวกับที่ใช้ทั้งระบบ) ไม่แตะ Backend/Logic เลย
// รูปแบบคงที่จาก getCalendarEvents: r['EmployeeID'] + ' ลา' + ประเภทลา — หาก parse ไม่ได้ (ไม่มีช่องว่าง) fallback เป็นข้อความเดิมทั้งหมด กันข้อมูลหาย
// [Standardize Leave Type — Calendar Fix] ถ้าหา Employee ไม่เจอ (name===id) ก็ยัง fallback คืนค่า title ดิบทั้งก้อนเหมือนพฤติกรรมเดิม (ไม่เปลี่ยน Fallback Path เดิม)
function humanizeCalendarLeaveTitle_(title){
  if (!title) return title;
  const idx = title.indexOf(' ');
  if (idx === -1) return title;
  const id = title.slice(0, idx);
  const rest = title.slice(idx + 1);
  // [Standardize Leave Type — Calendar Fix v2] getCalendarEvents() ใน FWMS_Code.gs บรรทัด 1793 ต่อสตริงเป็น r['EmployeeID'] + ' ลา' + ประเภทลา เสมอ
  // เท่ากับว่า rest ที่ได้ ณ จุดนี้ = "ลา" (คำนำหน้าคงที่จาก Backend) + ค่าประเภทลาดิบจริง (ซึ่งข้อมูลเดิมส่วนใหญ่ในชีตเก็บเป็น "ลาพักร้อน"/"ลากิจ"/"ลาป่วย" ที่มีคำว่า "ลา" ติดอยู่ในตัวเองอยู่แล้ว)
  // ต้องตัดคำว่า "ลา" ที่ Backend เติมนำหน้าออกก่อน 1 ชั้น แล้วค่อยส่งค่าที่เหลือ (ประเภทลาจริง) เข้า normalizeLeaveTypeLabel() ไม่งั้นจะกลายเป็น "ลาลาพักร้อน" ไม่ถูก Normalize (พบจากการทดสอบจริงบนเว็บ)
  const rawType = rest.indexOf('ลา') === 0 ? rest.slice(2) : rest;
  const name = getEmployeeDisplayName(id);
  return name === id ? title : (name + ' ' + normalizeLeaveTypeLabel(rawType));
}
function humanizeApprovalLabel_(label){
  if (!label) return label;
  const idx = label.lastIndexOf(' — ');
  if (idx === -1) return label;
  return label.slice(0, idx) + ' — ' + getEmployeeDisplayName(label.slice(idx+3).trim());
}
let _employeeMapPromise = null;
function ensureEmployeeMapLoaded(){
  if (state._employeeMap) return Promise.resolve(state._employeeMap);
  if (_employeeMapPromise) return _employeeMapPromise;
  _employeeMapPromise = callGs('list', { sheetName:'Employee' }).then(list=>{
    const map = {};
    list.forEach(e=>{ map[String(e.ID)] = e; });
    state._employeeMap = map;
    return map;
  }).catch(()=>{ _employeeMapPromise = null; return {}; });
  return _employeeMapPromise;
}
// [Employee Profile] แปลงลิงก์ Google Drive ทุกรูปแบบเป็นลิงก์ดูรูปตรงที่ <img> โหลดได้จริง (กันสำรองไว้ฝั่ง frontend ด้วย แม้ backend แปลงให้แล้ว)
function driveImageUrl(url){
  const u = (url==null ? '' : String(url)).trim();
  if (!u) return '';
  let m = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id='+m[1]+'&sz=w1000';
  m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id='+m[1]+'&sz=w1000';
  return u;
}
// [Employee Profile] ดึง FILE_ID ออกมาสร้างลิงก์สำรองอีกแบบ (lh3.googleusercontent.com) เผื่อ thumbnail?id= โหลดไม่ได้ในบาง Drive config
function extractDriveFileId(url){
  const u = (url==null ? '' : String(url)).trim();
  let m = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/); if (m) return m[1];
  m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/); if (m) return m[1];
  return '';
}
function driveLh3Url(fileId){ return 'https://lh3.googleusercontent.com/d/'+fileId; }
// [ประสิทธิภาพ] โหลดไลบรารีอ่านไฟล์ Excel (ใหญ่ ~1MB) แบบ lazy ตอนใช้จริงเท่านั้น แทนที่จะบล็อกการโหลดหน้าเว็บทุกหน้าตั้งแต่แรก
let _xlsxLoadPromise = null;
function ensureXlsxLoaded(){
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (_xlsxLoadPromise) return _xlsxLoadPromise;
  _xlsxLoadPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ()=> resolve();
    s.onerror = ()=> { _xlsxLoadPromise = null; reject(new Error('โหลดไลบรารีอ่านไฟล์ Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')); };
    document.head.appendChild(s);
  });
  return _xlsxLoadPromise;
}
// สร้าง HTML รูป/avatar พร้อม fallback 2 ชั้น: thumbnail → lh3.googleusercontent → avatar ตัวอักษร (แสดง <img> ทันทีถ้ามี URL ไม่ fallback ตั้งแต่แรก)
// [Employee Directory — Square Photo] เพิ่มพารามิเตอร์ shape (optional) — ไม่ใส่ = พฤติกรรมเดิมเป๊ะ (วงกลม, ขนาดตายตัวตาม sizePx) ใช้เฉพาะจุดที่เรียกด้วย shape='square' เท่านั้น (การ์ด Employee Directory) จุดอื่นในระบบไม่กระทบ
function driveImgOrAvatar(rawUrl, initials, sizePx, avatarClass, extraImgClass, shape){
  const photo = driveImageUrl(rawUrl);
  if (!photo) return `<div class="${avatarClass}">${initials}</div>`;
  const fileId = extractDriveFileId(rawUrl);
  const fallbackUrl = fileId ? driveLh3Url(fileId) : '';
  // [Directory Layout v2] shape='square' ไม่ใส่ border-radius ใน inline style แล้ว — ให้ Container ด้านนอก (.dir-photo-square/.dir-photo-flat ใน style.css) เป็นตัวคุมมุมมน/มุมเหลี่ยมแทน (overflow:hidden ที่ Container ตัดรูปตามขอบอยู่แล้ว) จะได้สลับปัดมุม/ไม่ปัดมุมได้จาก CSS อย่างเดียว ไม่ต้องมาแก้ JS ทุกครั้ง
  const imgStyle = shape === 'square'
    ? `width:100%;height:100%;object-fit:cover;`
    : `width:${sizePx}px;height:${sizePx}px;border-radius:50%;object-fit:cover;`;
  return `<img src="${photo}" class="${extraImgClass||''}" style="${imgStyle}" data-fallback="${fallbackUrl}" data-tried="0"
    onerror="if(this.dataset.tried==='0' && this.dataset.fallback){ this.dataset.tried='1'; this.src=this.dataset.fallback; } else { this.outerHTML='<div class=&quot;${avatarClass}&quot;>${initials}</div>'; }">`;
}
function fmtMoney(n){ return new Intl.NumberFormat('th-TH',{minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(n)||0); }
// [Design System] Skeleton Loading กลาง — ใช้แทน "กำลังโหลด..." (statCount = จำนวนการ์ด KPI, chartCount = จำนวนกราฟ)
function skeleton(statCount, chartCount){
  const stats = statCount ? `<div class="grid grid-4 mb-3">${Array(statCount).fill('<div class="sk-block sk-stat"></div>').join('')}</div>` : '';
  const charts = chartCount ? `<div class="grid grid-2">${Array(chartCount).fill('<div class="card"><div class="sk-block sk-chart"></div></div>').join('')}</div>` : '';
  return stats + charts;
}
// [Design System] Empty State กลาง — ใช้แทนตาราง/การ์ดว่างเปล่าทุกจุด ห้ามโชว์ 0 หรือหน้าว่างเฉยๆ
function emptyState(icon, message, actionLabel, actionOnclick){
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon||'📭'}</div>
    <div class="empty-state-msg">${message||'ยังไม่มีข้อมูล'}</div>
    ${actionLabel ? `<button class="btn btn-accent btn-sm" onclick="${actionOnclick||''}">${actionLabel}</button>` : ''}
  </div>`;
}
// [Drill Down] Helper กลาง - เปิด modal แสดงตารางรายละเอียดจาก KPI ที่คลิก ใช้ข้อมูลที่มีอยู่แล้วในหน้านั้น ไม่ query ซ้ำ
// [Chart Redesign] Visual Ranking — เหรียญ gradient + progress bar แทนตารางธรรมดา ใช้ร่วมกันได้ทุก Dashboard
function rankingListHtml(items, maxItems){
  const medals = ['🥇','🥈','🥉'];
  const grads = ['var(--gradient-yellow)','var(--gradient-blue)','var(--gradient-orange)','var(--gradient-purple)','var(--gradient-teal)','var(--gradient-pink)'];
  const list = items.slice(0, maxItems||6);
  const maxVal = list.length ? Math.max(...list.map(r=>r.value)) : 1;
  return list.map((r,i)=>{
    const pct = maxVal>0 ? Math.round((r.value/maxVal)*100) : 0;
    const grad = grads[i % grads.length];
    return `
      <div class="${r.onclick?'ep-clickable':''}" ${r.onclick?`onclick="${r.onclick}"`:''} style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft);">
        <div style="width:30px;height:30px;border-radius:50%;background:${grad};display:grid;place-items:center;color:#fff;font-size:13px;flex-shrink:0;">${medals[i]||(i+1)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12.5px;font-weight:600;color:var(--ink);">${r.label}</div>
          <div class="kpi-progress-track"><div class="kpi-progress-fill" style="width:${pct}%;background:${grad};"></div></div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:12.5px;font-weight:700;color:var(--ink);">${r.valueLabel}</div>
          ${r.subLabel?`<div class="small text-muted">${r.subLabel}</div>`:''}
        </div>
      </div>`;
  }).join('');
}
function openDrillDown(title, columns, rows){
  modal(`
    <h2 class="mb-2">🔎 ${title}</h2>
    ${rows.length ? `<div style="max-height:60vh;overflow:auto;"><table>
      <thead><tr>${columns.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${columns.map(c=>`<td>${c.render ? c.render(r) : (r[c.key]!=null?r[c.key]:'')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>` : '<div class="helper">ไม่มีข้อมูล</div>'}
    <div style="text-align:right;margin-top:12px;"><button class="btn btn-ghost" onclick="closeModal()">ปิด</button></div>
  `);
}
function todayStr(){ return new Date().toISOString().slice(0,10); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function toast(msg,err){ const t=document.getElementById('toast'); const icon = err?'⚠ ':'✓ '; t.textContent = msg.startsWith(icon.trim())?msg:(icon+msg); t.className='toast show'+(err?' err':''); setTimeout(()=>t.className='toast',3000); }
function modal(html){ document.getElementById('modalContent').innerHTML=html; document.getElementById('modal').classList.add('show'); }
function closeModal(){ document.getElementById('modal').classList.remove('show'); }
document.getElementById('modal').addEventListener('click',e=>{ if(e.target.id==='modal') closeModal(); });

// [Migration Phase 1] เปลี่ยนจาก google.script.run -> fetch() ไปยัง GAS Web App เดิม (URL อยู่ใน js/config.js)
// Content-Type ต้องเป็น text/plain;charset=utf-8 เพื่อให้เป็น "Simple Request" ไม่ trigger CORS Preflight (OPTIONS)
// เพราะ Apps Script doPost ไม่มีกลไกตอบ OPTIONS Request — ดูรายละเอียดใน FWMS_Migration_Design_Review.md ข้อ 5
// action ถูกส่งไปใน payload เดียวกับ body เพราะฝั่ง Server (doPost) อ่านจาก body.action ตัวเดียวกับที่ callApi() ใช้อยู่แล้ว ไม่ต้องแก้ Backend
function callGsOnce(action, body){
  return new Promise((resolve,reject)=>{
    if (typeof API_BASE_URL === 'undefined' || !API_BASE_URL) { reject(new Error('ยังไม่ได้ตั้งค่า API_BASE_URL ใน js/config.js')); return; }
    const payload = Object.assign({ action: action, token: state.token }, body||{});
    fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(res => {
        if (!res || res.ok===false) { reject(new Error(res && res.error ? res.error : 'NULL_RESPONSE')); return; }
        resolve(res.data !== undefined ? res.data : res);
      })
      .catch(err => reject(new Error(err && err.message ? err.message : String(err))));
  });
}
// [แก้บั๊ก] google.script.run บางครั้งคืนค่า null เวลามีหลายคำขอวิ่งพร้อมกัน (เช่นหน้าที่ใช้ Promise.all) — ลองใหม่อัตโนมัติ 1 ครั้งก่อนถือว่าพัง
async function callGs(action, body){
  try {
    return await callGsOnce(action, body);
  } catch (err) {
    if (err.message === 'NULL_RESPONSE') {
      await new Promise(r=>setTimeout(r, 400));
      try { return await callGsOnce(action, body); }
      catch (err2) { throw new Error(err2.message === 'NULL_RESPONSE' ? 'เกิดข้อผิดพลาด (เซิร์ฟเวอร์ไม่ตอบกลับ ลองใหม่อีกครั้ง)' : err2.message); }
    }
    throw err;
  }
}

// =========================================================
// LOGIN / LOGOUT
// =========================================================
async function doLogin(){
  const id = document.getElementById('loginId').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errBox = document.getElementById('loginErr');
  errBox.textContent = '';
  if(!id || !pass){ errBox.textContent='กรุณากรอกรหัสพนักงานและรหัสผ่าน'; return; }
  if (typeof API_BASE_URL === 'undefined' || !API_BASE_URL) { errBox.textContent='ยังไม่ได้ตั้งค่า API_BASE_URL ใน js/config.js'; return; }
  // [Migration Phase 1] login เดิมเรียก google.script.run.callApi('login', ...) ตรงๆ ไม่ผ่าน callGs() — เปลี่ยนมาเรียกผ่าน callGs() แทน
  // เพื่อใช้ fetch() เส้นทางเดียวกับ Action อื่นทั้งหมด (routeAction('login', ...) ฝั่ง Server ไม่เปลี่ยน)
  try {
    const data = await callGs('login', { id: id, password: pass });
    // Backend คืนค่า { token, user } อยู่ใน res.data เดิม (callGs คืน res.data ให้ตรงๆ แล้ว)
    state.token = data.token; state.user = data.user;
    document.body.classList.add('logged-in');
    initAfterLogin();
  } catch (err) {
    errBox.textContent = err && err.message ? err.message : 'เข้าสู่ระบบไม่สำเร็จ';
  }
}
function doLogout(){
  // [Migration Phase 1] ยิง logout แบบ fire-and-forget ด้วย fetch({keepalive:true}) แทน google.script.run
  // keepalive:true เพื่อให้คำขอยังส่งสำเร็จแม้หน้าเว็บกำลังจะ reload/ปิดไปพร้อมกัน (พฤติกรรมเดิมก็เป็น fire-and-forget เหมือนกัน ไม่รอผลลัพธ์)
  if (typeof API_BASE_URL !== 'undefined' && API_BASE_URL && state.token) {
    try {
      fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'logout', token: state.token }),
        keepalive: true
      });
    } catch (e) { /* ignore — ไม่บล็อกการ reload */ }
  }
  location.reload();
}

async function initAfterLogin(){
  const u = state.user;
  document.getElementById('meName').textContent = u.nickname || u.name;
  document.getElementById('meRole').textContent = u.role + (u.department? ' · '+u.department : '');
  document.getElementById('meAvatar').textContent = (u.nickname||u.name||'?').charAt(0);

  const perm = u.permissions || {};
  const isExec = perm.IsSystemAdmin || perm.VisibilityScope === 'All';
  if (perm.IsSystemAdmin || isExec) {
    // [Dashboard] Admin เห็นโหมดแก้ไข (มีปุ่มนำเข้า/แก้ไข) ส่วน Exec อื่นๆ เห็นแดชบอร์ดอย่างเดียว — เลือกอัตโนมัติในหน้าเดียวกัน แท็บ "บุคลากร" รวม Executive Dashboard เดิมไว้แล้ว
    document.getElementById('navMrLabel').style.display='block';
    document.getElementById('navMonthlyReport').style.display='flex';
  }
  if (perm.IsSystemAdmin) {
    document.getElementById('navHealth').style.display='flex';
    document.getElementById('navSettingsLabel').style.display='block';
    document.getElementById('navSettingsHub').style.display='flex';
  }

  try { state.managedSheets = await callGs('listManagedSheets', {}); } catch(e){ state.managedSheets = []; }
  try { await ensureEmployeeMapLoaded(); } catch(e){ /* ไม่เป็นไร Helper จะ fallback แสดง ID แทนถ้าโหลดไม่สำเร็จ */ }
  try {
    state._dePerms = await callGs('getMyDataEntryPermissions', {});
    if (state._dePerms.isAdmin || state._dePerms.canSales || state._dePerms.canOnline || state._dePerms.canActivitySummary) {
      document.getElementById('navDataEntry').style.display='flex';
    }
  } catch(e){ state._dePerms = { isAdmin:false, canSales:false, canOnline:false, canActivitySummary:false }; }

  document.querySelectorAll('.nav-item[data-page]').forEach(b=> b.addEventListener('click', ()=> go(b.dataset.page)));
  refreshNotifBadge();
  go('home');
}

// =========================================================
// NAVIGATION
// =========================================================
const PAGES = {
  home:{title:'หน้าแรก',crumb:'HOME',render:renderHome},
  calendar:{title:'ปฏิทินบริษัท',crumb:'CALENDAR',render:renderCalendar},
  attendance:{title:'เข้า-ออกงาน',crumb:'ATTENDANCE',render:renderAttendanceHub},
  attendancematrix:{title:'ตารางเข้า-ออกงานรายเดือน',crumb:'ATTENDANCE MATRIX',render:renderAttendanceMatrix},
  leave:{title:'ระบบลา',crumb:'LEAVE',render:renderLeave},
  ot:{title:'OT (Overtime)',crumb:'OT',render:renderOT},
  saleskpi:{title:'Sales KPI',crumb:'SALES KPI',render:renderSalesKpi},
  payroll:{title:'Payroll (เงินเดือน)',crumb:'PAYROLL',render:renderPayroll},
  points:{title:'คะแนนสะสม & ของรางวัล',crumb:'POINTS & REWARDS',render:renderPoints},
  employeerisk:{title:'พนักงาน & ความเสี่ยงลาออก',crumb:'EMPLOYEE RISK',render:renderEmployeeRisk},
  customerfollowup:{title:'ติดตามลูกค้า (จัดการข้อมูล)',crumb:'CUSTOMER FOLLOW-UP',render:()=>renderCustomerFollowup()},
  mistake:{title:'ความผิด (จัดการข้อมูล)',crumb:'MISTAKE',render:()=>renderMistake()},
  foreigninquiry:{title:'ถามราคา ตปท. (จัดการข้อมูล)',crumb:'FOREIGN INQUIRY',render:()=>renderForeignInquiry()},
  customerfollowup_view:{title:'ติดตามลูกค้า',crumb:'CUSTOMER FOLLOW-UP',render:()=>renderCustomerFollowupView()},
  mistake_view:{title:'ความผิด',crumb:'MISTAKE',render:()=>renderMistakeView()},
  foreigninquiry_view:{title:'ถามราคา ตปท.',crumb:'FOREIGN INQUIRY',render:()=>renderForeignInquiryView()},
  healthcheck:{title:'ตรวจสอบระบบ',crumb:'HEALTH CHECK',render:renderHealthCheck},
  monthlyreport:{title:'Dashboard',crumb:'DASHBOARD',render:renderMonthlyReport},
  dataentry:{title:'กรอกข้อมูลผลงาน',crumb:'DATA ENTRY',render:renderDataEntryHub},
  leavebalance:{title:'สิทธิ์วันลาคงเหลือ',crumb:'LEAVE BALANCE',render:renderLeaveBalanceAdmin},
  settingshub:{title:'ตั้งค่าระบบ',crumb:'SETTINGS',render:renderSettingsHub},
  employeedirectory:{title:'Employee Directory',crumb:'EMPLOYEE DIRECTORY',render:renderEmployeeDirectory},
  employeeprofile:{title:'Employee Profile',crumb:'EMPLOYEE PROFILE',render:renderEmployeeProfile},
  generic:{title:'',crumb:'',render:()=>Promise.resolve()}
};

function go(page, opts){
  Object.values(state.charts).forEach(c=>{ try{c.destroy();}catch(e){} });
  state.charts = {};
  state.page = page;
  document.querySelectorAll('.nav-item[data-page]').forEach(b=> b.classList.toggle('active', b.dataset.page===page));
  const p = PAGES[page];
  document.getElementById('pageTitle').textContent = (opts && opts.title) || p.title;
  document.getElementById('crumb').textContent = (opts && opts.crumb) || p.crumb;
  document.getElementById('content').innerHTML = '<div class="helper">กำลังโหลด...</div>';
  p.render(opts).catch(err => { document.getElementById('content').innerHTML = `<div class="card"><div class="helper">${err.message}</div></div>`; });
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo(0,0);
}

// =========================================================
// HOME / MY WORK
// =========================================================
async function renderHome(){
  const perm = state.user.permissions || {};
  const isExec = perm.IsSystemAdmin || perm.VisibilityScope === 'All';
  const [myWork, dashboard] = await Promise.all([
    callGs('getMyWork', {}),
    isExec ? callGs('getDashboardSummary', {}).catch(()=>null) : Promise.resolve(null)
  ]);

  let dashHtml = '';
  if (dashboard) {
    dashHtml = `
    <div class="grid grid-4 mb-3">
      <div class="stat"><div class="stat-label">พนักงานทั้งหมด</div><div class="stat-value">${dashboard.employeeCount}<span class="stat-unit">คน</span></div></div>
      <div class="stat"><div class="stat-label">มาทำงานวันนี้</div><div class="stat-value" style="color:var(--success)">${dashboard.presentToday}<span class="stat-unit">คน</span></div></div>
      <div class="stat"><div class="stat-label">มาสายวันนี้</div><div class="stat-value" style="color:var(--warn)">${dashboard.lateToday}<span class="stat-unit">คน</span></div></div>
      <div class="stat"><div class="stat-label">รออนุมัติ</div><div class="stat-value" style="color:var(--danger)">${dashboard.pendingApprovals}<span class="stat-unit">รายการ</span></div></div>
    </div>`;
  }

  document.getElementById('content').innerHTML = `
    ${dashHtml}
    <div class="grid grid-2">
      <div class="card mb-2">
        <div class="card-title">✅ งานของฉัน <span class="hint">${myWork.myTasks.length} รายการ</span></div>
        ${myWork.myTasks.length? myWork.myTasks.map(t=>`<div class="small mb-1" style="padding:8px;background:var(--line-soft);border-radius:8px;">${t.Title||''} <span class="badge badge-info">${t.Status||''}</span></div>`).join('') : '<div class="helper">ไม่มีงานค้าง</div>'}
      </div>
      <div class="card mb-2">
        <div class="card-title">📝 รออนุมัติจากฉัน <span class="hint">${myWork.pendingOnMe.length} รายการ</span></div>
        ${myWork.pendingOnMe.length? myWork.pendingOnMe.map(p=>`
          <div class="small mb-1" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--line-soft);border-radius:8px;">
            <span>${humanizeApprovalLabel_(p.label)}</span>
            <span class="row-actions">
              ${p.sheetName==='Leave_Request' ? `
              <button class="btn btn-accent btn-sm" onclick="openApprovalReview('${p.sheetName}','${p.recordId}','${p.actionType||''}')">${p.actionType==='Acknowledge' ? 'ตรวจสอบ &amp; รับทราบ' : 'ตรวจสอบ &amp; อนุมัติ'}</button>
              ` : `
              <button class="btn btn-accent btn-sm" onclick="doApproval('${p.sheetName}','${p.recordId}','approve')">อนุมัติ</button>
              <button class="btn btn-danger btn-sm" onclick="doApproval('${p.sheetName}','${p.recordId}','reject')">ปฏิเสธ</button>
              `}
            </span>
          </div>`).join('') : '<div class="helper">ไม่มีรายการรออนุมัติ</div>'}
      </div>
      <div class="card mb-2">
        <div class="card-title">📅 ประชุมวันนี้</div>
        ${myWork.meetingsToday.length? myWork.meetingsToday.map(m=>`<div class="small mb-1">${m.Title||''} ${m.Time?('· '+m.Time):''}</div>`).join('') : '<div class="helper">ไม่มีประชุมวันนี้</div>'}
      </div>
      <div class="card mb-2">
        <div class="card-title">🌴 ทีมลาวันนี้</div>
        ${myWork.teamLeaveToday.length? myWork.teamLeaveToday.map(l=>`<div class="small mb-1"><span class="ep-clickable" onclick="openEmployeeProfile('${l.EmployeeID}')">${getEmployeeDisplayName(l.EmployeeID)}</span> - ${normalizeLeaveTypeLabel(l['ประเภทลา'])}</div>`).join('') : '<div class="helper">ไม่มีใครลาวันนี้</div>'}
      </div>
    </div>
    ${!myWork.checkedInToday? '<div class="card mb-2" style="border-color:var(--warn);background:var(--warn-soft);"><b>⏱ วันนี้ยังไม่มีบันทึกเวลาเข้างานของคุณ</b></div>':''}
    <!-- [Freeze Phase 1] ไม่แสดง banner แจ้งเตือน Sales KPI ที่หน้าแรกแล้ว -->
  `;
}

let _approvalInFlight = false;
async function doApproval(sheetName, recordId, decision){
  if (_approvalInFlight) return; // [PART 7] กัน double-submit ถ้ากำลังดำเนินการอยู่แล้ว
  _approvalInFlight = true;
  const docLabel = sheetName === 'Leave_Request' ? 'ใบลา' : sheetName === 'OT' ? 'คำขอ OT' : 'คำขอ';
  try {
    const res = await callGs('approvalAction', { sheetName, recordId, decision });
    // [PART 3+4] แยกข้อความ Toast ตามผลจริงจาก Backend (res.status/res.nextStep) — ไม่ hardcode ชื่อคน ใช้ Role ที่ Backend ส่งมา
    if (res.status === 'Rejected') {
      toast(`ปฏิเสธ${docLabel}เรียบร้อย`);
    } else if (res.status === 'InProgress' && res.nextStep) {
      toast(`รับทราบเรียบร้อย — ส่งต่อให้ ${res.nextStep} อนุมัติขั้นถัดไปแล้ว`);
    } else if (res.status === 'Approved') {
      toast(`อนุมัติ${docLabel}เรียบร้อย`);
    } else {
      toast(decision==='approve' ? 'ดำเนินการเรียบร้อย' : `ปฏิเสธ${docLabel}เรียบร้อย`);
    }
    closeModal();
    go(state.page);
  } catch(e){ toast(e.message, true); }
  finally { _approvalInFlight = false; }
}

// [หน้าผู้อนุมัติ - อนุมัติแล้ว] แสดงข้อมูลช่วยตัดสินใจครบในหน้าเดียว: รูป/ชื่อ/ตำแหน่ง/แผนก/อายุงาน/สิทธิ์คงเหลือ/ลาย้อนหลัง/ใบรับรองแพทย์/ประวัติลา
async function openApprovalReview(sheetName, recordId, actionType){
  modal('<div class="helper">กำลังโหลดข้อมูล...</div>');
  try {
    const rows = await callGs('list', { sheetName:'Leave_Request' });
    const record = rows.find(r=> String(r.RecordID)===String(recordId));
    if (!record) { modal('<div class="helper">ไม่พบรายการนี้ (อาจถูกดำเนินการไปแล้ว)</div>'); return; }
    const bundle = await callGs('getEmployeeProfileBundle', { employeeId: record.EmployeeID });
    const emp = bundle.employee;
    const initials = getEmployeeDisplayName(emp).charAt(0);
    const vacBalance = bundle.leaveSummary.balances.find(b=>b.leaveType==='ลาพักร้อน') || { remaining:0, used:0, entitlement:0 };

    // [ลาย้อนหลัง] เทียบวันที่ส่งคำขอ (RequestDateTime) กับวันที่เริ่มลา
    let backdatedHtml = '';
    const reqDt = record['RequestDateTime'] ? new Date(record['RequestDateTime']) : null;
    if (reqDt && !isNaN(reqDt.getTime())) {
      const reqDateOnly = new Date(reqDt.getFullYear(), reqDt.getMonth(), reqDt.getDate());
      const leaveStart = new Date(record['วันที่เริ่มลา']);
      const daysLate = Math.round((reqDateOnly - leaveStart) / 86400000);
      if (daysLate > 0) {
        backdatedHtml = `<div class="card mb-2" style="border-color:var(--warn);background:var(--warn-soft);padding:10px 14px;">
          <b>🔶 ลาย้อนหลัง ${daysLate} วัน</b> — ส่งคำขอวันที่ ${fmt(record['RequestDateTime'])} (ลาตั้งแต่ ${fmt(record['วันที่เริ่มลา'])})
        </div>`;
      }
    }

    const fileLink = record['แนบไฟล์'];
    const isImageFile = fileLink && /\.(jpg|jpeg|png)(\?|$)/i.test(fileLink);
    const recentLeaves = bundle.leaveHistory.filter(r=>r.Status==='Approved').slice(0,5);

    modal(`
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;">
        ${driveImgOrAvatar(emp['รูป'], initials, 52, 'avatar-52')}
        <div class="ep-clickable" onclick="closeModal();openEmployeeProfile('${record.EmployeeID}')" title="เปิดโปรไฟล์">
          <div style="font-weight:600;">${getEmployeeDisplayWithId(emp)}</div>
          <div class="small text-muted">${emp['ตำแหน่ง']||''} · ${emp['แผนก']||''} · อายุงาน ${epTenureText(emp['วันที่เริ่มงาน'])}</div>
        </div>
      </div>
      ${backdatedHtml}
      <table style="width:100%;margin-bottom:12px;">
        <tr><td class="text-muted small" style="padding:4px 0;">ประเภทลา</td><td style="text-align:right;font-size:13px;">${normalizeLeaveTypeLabel(record['ประเภทลา'])}</td></tr>
        <tr><td class="text-muted small" style="padding:4px 0;">วันที่ลา</td><td style="text-align:right;font-size:13px;">${fmt(record['วันที่เริ่มลา'])} → ${fmt(record['วันที่สิ้นสุด'])} (${record['จำนวนวัน']||0} วัน)</td></tr>
        <tr><td class="text-muted small" style="padding:4px 0;">สิทธิ์คงเหลือ / ใช้ไปแล้ว</td><td style="text-align:right;font-size:13px;">${vacBalance.remaining} / ${vacBalance.used} วัน</td></tr>
        <tr><td class="text-muted small" style="padding:4px 0;">เหตุผล${backdatedHtml?'ลาย้อนหลัง':''}</td><td style="text-align:right;font-size:13px;">${record['เหตุผล']||'—'}</td></tr>
        ${fileLink ? `<tr><td class="text-muted small" style="padding:4px 0;">ใบรับรองแพทย์ / ไฟล์แนบ</td><td style="text-align:right;font-size:13px;">
          ${isImageFile ? `<a href="${fileLink}" target="_blank"><img src="${fileLink}" style="max-width:60px;max-height:60px;border-radius:6px;vertical-align:middle;"></a>` : `<a href="${fileLink}" target="_blank">เปิดไฟล์</a>`}
        </td></tr>` : ''}
      </table>
      <div class="small text-muted mb-2">ประวัติลาล่าสุดในปีนี้: ${recentLeaves.length? recentLeaves.map(r=>`${normalizeLeaveTypeLabel(r['ประเภทลา'])} ${fmt(r['วันที่เริ่มลา'])}`).join(', ') : 'ไม่มี'}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
        <button class="btn btn-danger" onclick="doApproval('Leave_Request','${recordId}','reject')">ปฏิเสธ</button>
        <button class="btn btn-accent" onclick="doApproval('Leave_Request','${recordId}','approve')">${actionType==='Acknowledge' ? 'รับทราบ' : 'อนุมัติ'}</button>
      </div>
    `);
  } catch(err){ modal(`<div class="helper">${err.message}</div>`); }
}

// =========================================================
// GENERIC TABLE (ครอบคลุมโมดูล master data ทั้งหมด)
// =========================================================
async function openGenericSheet(sheetName){
  go('generic', { title: MASTER_DATA_LABELS[sheetName] || sheetName, crumb: 'ข้อมูลหลัก' });
  await renderGenericTable(sheetName);
}
let genericState = { sheetName:null, headers:[], rows:[], refresh:null };

async function renderGenericTable(sheetName){
  const { schema, rows } = await callGs('getSheetData', { sheetName });
  genericState = { sheetName, headers: schema.headers, rows, refresh: ()=>renderGenericTable(sheetName) };
  const readOnly = sheetName === 'Audit Log';
  document.getElementById('content').innerHTML = `
    <div class="toolbar">
      <input class="search" id="genSearch" placeholder="ค้นหา..." oninput="filterGenericTable()">
      ${!readOnly? `<button class="btn btn-accent" onclick="openGenericForm()">+ เพิ่มรายการ</button>` : ''}
    </div>
    <div class="card" style="padding:0;overflow:auto;">
      <table id="genTable" style="min-width:${Math.max(700, schema.headers.length*130)}px;">
        <thead><tr>${schema.headers.map(h=>`<th>${h}</th>`).join('')}${!readOnly?'<th></th>':''}</tr></thead>
        <tbody id="genTableBody"></tbody>
      </table>
    </div>
  `;
  filterGenericTable();
}

// [UI Standard] คอลัมน์ที่เก็บ EmployeeID ในตารางทั่วไป (Task/Document/SOP ฯลฯ) — resolve เป็นชื่อผ่าน Helper อัตโนมัติ
const EMPLOYEE_REF_FIELDS = ['EmployeeID','AssignedTo','AssignedBy','ผู้รับผิดชอบงานแทน','CreatedBy'];
function filterGenericTable(){
  const searchEl = document.getElementById('genSearch');
  const tbody = document.getElementById('genTableBody');
  if (!searchEl || !tbody || !genericState.headers) return; // ไม่มีตารางในหน้านี้ (เช่นหน้าดูอย่างเดียวของผู้บริหาร) ข้ามไป
  const q = (searchEl.value||'').toLowerCase();
  const rows = genericState.rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  const readOnly = genericState.sheetName === 'Audit Log';
  const idField = genericState.headers[0];
  tbody.innerHTML = rows.length ? rows.map(r=>{
    const cells = genericState.headers.map(h=>{
      let v = r[h];
      if (v instanceof Object && v.toISOString) v = fmt(v);
      if (typeof v === 'boolean') v = v ? '✓' : '';
      // Audit Log คอลัมน์ "Email" จริงๆ เก็บผู้ทำรายการ (EmployeeID/SYSTEM) — ต้องตรวจสอบย้อนหลังได้ ใช้รูปแบบมีรหัสกำกับ
      if (genericState.sheetName === 'Audit Log' && h === 'Email' && v) v = getEmployeeDisplayWithId(v);
      else if (EMPLOYEE_REF_FIELDS.indexOf(h) !== -1 && v) v = getEmployeeDisplayName(v);
      return `<td>${v!=null?v:''}</td>`;
    }).join('');
    return `<tr>${cells}${!readOnly?`<td><button class="btn btn-ghost btn-sm" onclick='openGenericForm(${JSON.stringify(String(r[idField]))})'>แก้ไข</button> <button class="btn btn-danger btn-sm" onclick="deleteGenericRow('${String(r[idField]).replace(/'/g,"\\'")}')">ลบ</button></td>`:''}</tr>`;
  }).join('') : `<tr><td colspan="${genericState.headers.length+1}"><div class="helper">ไม่มีข้อมูล</div></td></tr>`;
}

function fieldInputType(h){
  if (/วันที่|Date|Deadline|StartDate|IssueDate/i.test(h)) return 'date';
  if (/เหตุผล|รายละเอียด|เนื้อหา|หมายเหตุ|Comment|Notes|Detail|Description/i.test(h)) return 'textarea';
  if (/^Is|^Checklist|Pinned$|^Read$/i.test(h)) return 'checkbox';
  if (/จำนวน|ชั่วโมง|Points|ยอดขาย|เป้า|Salary|Amount|Days|Years|Cost|MinPoints|MinYears|MinLateMinutes|%|Hours|StepOrder/i.test(h)) return 'number';
  return 'text';
}

function openGenericForm(recordId){
  const row = recordId ? (genericState.rows.find(r=> String(r[genericState.headers[0]])===String(recordId)) || {}) : {};
  const isEdit = !!recordId;
  const fieldsHtml = genericState.headers.map((h,i)=>{
    const type = fieldInputType(h);
    const val = row[h]!=null ? row[h] : '';
    const fid = 'gf-'+i;
    const ro = (isEdit && h===genericState.headers[0]) ? 'readonly' : '';
    if (type==='textarea') return `<div class="field field-wide"><label>${h}</label><textarea id="${fid}" rows="2">${val}</textarea></div>`;
    if (type==='checkbox') return `<div class="field"><label>${h}</label><select id="${fid}"><option value="">-</option><option value="TRUE" ${val===true||val==='TRUE'?'selected':''}>TRUE</option><option value="FALSE" ${val===false||val==='FALSE'?'selected':''}>FALSE</option></select></div>`;
    const dv = (type==='date' && val) ? (typeof val==='string'? val.slice(0,10) : fmt(val)) : val;
    return `<div class="field"><label>${h}</label><input id="${fid}" type="${type}" value="${String(dv).replace(/"/g,'&quot;')}" ${ro}></div>`;
  }).join('');

  modal(`
    <h2 class="mb-2">${isEdit? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h2>
    <div class="field-grid">${fieldsHtml}</div>
    <div class="small text-muted mb-1" id="genFormMsg"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-accent" onclick="saveGenericForm()">บันทึก</button>
    </div>
  `);
}

async function saveGenericForm(){
  const row = {};
  genericState.headers.forEach((h,i)=>{
    const fid = 'gf-'+i;
    const el = document.getElementById(fid);
    if (el) row[h] = el.value;
  });
  const msg = document.getElementById('genFormMsg');
  msg.textContent = 'กำลังบันทึก...';
  try {
    await callGs('save', { sheetName: genericState.sheetName, row });
    closeModal(); toast('บันทึกเรียบร้อย');
    await (genericState.refresh ? genericState.refresh() : renderGenericTable(genericState.sheetName));
  } catch(e){ msg.textContent = e.message; }
}

async function deleteGenericRow(recordId){
  if (!confirm('ยืนยันลบรายการนี้?')) return;
  try {
    await callGs('delete', { sheetName: genericState.sheetName, recordId });
    toast('ลบเรียบร้อย');
    await (genericState.refresh ? genericState.refresh() : renderGenericTable(genericState.sheetName));
  } catch(e){ toast(e.message, true); }
}

// =========================================================
// EMPLOYEE & RISK (รวม Employee CRUD + Risk Score จากข้อมูลจริงในระบบ)
// =========================================================
async function renderEmployeeRisk(){
  const empData = await callGs('getSheetData', { sheetName:'Employee' });
  const risk = await callGs('getRiskList', {});
  genericState = { sheetName:'Employee', headers: empData.schema.headers, rows: empData.rows, refresh: renderEmployeeRisk };
  const riskMap = {};
  risk.list.forEach(r => riskMap[String(r.employeeId)] = r);

  document.getElementById('content').innerHTML = `
    <div class="grid grid-3 mb-3">
      <div class="stat"><div class="stat-label">พนักงานทั้งหมด</div><div class="stat-value">${empData.rows.length}<span class="stat-unit">คน</span></div></div>
      <div class="stat"><div class="stat-label">เสี่ยงลาออกสูง</div><div class="stat-value" style="color:var(--danger)">${risk.highRiskCount}<span class="stat-unit">คน</span></div></div>
      <div class="stat"><div class="stat-label">คำนวณจาก</div><div class="small text-muted mt-1">มาสาย/ลา/Warning-Reward ย้อนหลัง 3 เดือน</div></div>
    </div>
    <div class="toolbar">
      <input class="search" id="genSearch" placeholder="ค้นหาชื่อ รหัส แผนก..." oninput="filterEmployeeRiskTable()">
      <button class="btn btn-accent" onclick="openGenericForm()">+ เพิ่มพนักงาน</button>
    </div>
    <div class="card" style="padding:0;overflow:auto;">
      <table style="min-width:820px;">
        <thead><tr><th>รหัส</th><th>ชื่อ</th><th>แผนก</th><th>มาสาย(3ด.)</th><th>วันลา(3ด.)</th><th>Risk</th><th></th></tr></thead>
        <tbody id="empRiskBody"></tbody>
      </table>
    </div>
  `;
  state._empRiskMap = riskMap;
  filterEmployeeRiskTable();
}
function riskPill(level, score){
  const cls = level==='High' ? 'risk-high' : level==='Medium' ? 'risk-medium' : 'risk-low';
  return `<span class="risk-pill ${cls}">${level} ${score}</span>`;
}
function filterEmployeeRiskTable(){
  const q = (document.getElementById('genSearch').value||'').toLowerCase();
  const idField = genericState.headers[0];
  const rows = genericState.rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  document.getElementById('empRiskBody').innerHTML = rows.length ? rows.map(r=>{
    const id = String(r[idField]);
    const rk = state._empRiskMap[id] || { score:0, level:'Low', lateCount:0, leaveDays:0 };
    return `<tr>
      <td>${id}</td><td><span class="ep-clickable" onclick="openEmployeeProfile('${id.replace(/'/g,"\\'")}')">${getEmployeeDisplayName(r)}</span></td><td>${r['แผนก']||''}</td>
      <td>${rk.lateCount}</td><td>${rk.leaveDays}</td>
      <td>${riskPill(rk.level, rk.score)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick='openGenericForm(${JSON.stringify(id)})'>แก้ไข</button> <button class="btn btn-danger btn-sm" onclick="deleteGenericRow('${id.replace(/'/g,"\\'")}')">ลบ</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7"><div class="helper">ไม่มีข้อมูลพนักงาน</div></td></tr>`;
}

// =========================================================
// MONTHLY EXCEL REPORT MODULES (ติดตามลูกค้า / ความผิด / ถามราคาตปท)
// ใช้โครง Generic Table เดิม (genericState/openGenericForm/filterGenericTable) สำหรับตารางแก้ไขได้
// เสริม KPI cards + กราฟ + ปุ่มนำเข้า Excel (.xlsx) เฉพาะ 3 โมดูลนี้
// =========================================================
state._importMappers = {};

// อ่านชีตที่ชื่อมีคำว่า nameGuess ปนอยู่ (กันชื่อชีตสะกดต่างกันเล็กน้อยในแต่ละเดือน)
// สมมติโครงไฟล์: แถว 1 = หัวเรื่องรวม (merge cell), แถว 2 = หัวคอลัมน์จริง, แถว 3 เป็นต้นไป = ข้อมูล
function extractRowsFromWorkbook(wb, nameGuess, headers){
  const wsName = wb.SheetNames.find(n=> n.indexOf(nameGuess)!==-1);
  if(!wsName) throw new Error(`ไม่พบชีตที่มีคำว่า "${nameGuess}" ในไฟล์ที่เลือก (ชีตในไฟล์: ${wb.SheetNames.join(', ')})`);
  const ws = wb.Sheets[wsName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
  let headerRowIdx = aoa.findIndex(r => r && String(r[0]||'').trim() === headers[1]);
  if (headerRowIdx === -1) headerRowIdx = 1;
  const dataRows = aoa.slice(headerRowIdx+1).filter(r => r && r.some(c => c!=null && String(c).trim()!==''));
  return dataRows.map(r=>{
    const obj = {};
    headers.slice(1).forEach((h,idx)=>{ obj[h] = r[idx]!=null ? r[idx] : ''; });
    return obj;
  });
}

function handleExcelImport(evt, sheetName, nameGuess){
  const file = evt.target.files[0];
  if(!file) return;
  const msg = document.getElementById('importMsg');
  msg.textContent = 'กำลังอ่านไฟล์...';
  const reader = new FileReader();
  reader.onload = async function(e){
    try {
      await ensureXlsxLoaded();
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
      const rows = extractRowsFromWorkbook(wb, nameGuess, genericState.headers);
      if(!rows.length){ msg.textContent='ไม่พบแถวข้อมูลในชีต (เช็คหัวตารางแถวที่ 2 ของไฟล์)'; return; }
      msg.textContent = `พบ ${rows.length} แถว กำลังนำเข้า...`;
      const res = await callGs('bulkImportGeneric', { sheetName, rows });
      toast(`นำเข้าสำเร็จ ${res.imported} แถว`);
      await genericState.refresh();
    } catch(err){ msg.textContent = 'เกิดข้อผิดพลาด: '+err.message; toast('นำเข้าไม่สำเร็จ: '+err.message, true); }
  };
  reader.readAsArrayBuffer(file);
  evt.target.value = '';
}

// เฟรมกลาง: KPI/กราฟ (ส่งมาเป็น HTML+ฟังก์ชันวาดกราฟ) + ตัวกรองเดือน (ถ้าระบุ dateField) + ปุ่มนำเข้า Excel + ตาราง generic แก้ไขได้
// [ทนต่อ error] ถ้าสร้าง KPI/กราฟพัง (ข้อมูลแปลกๆ จากไฟล์ที่นำเข้า) จะไม่ทำให้ตาราง+ปุ่มนำเข้าใช้งานไม่ได้ไปด้วย
async function renderModuleDashboard(sheetName, nameGuess, buildDash, dateField, headerHtml, suppressMonthUI){
  const { schema, rows } = await callGs('getSheetData', { sheetName });
  state._moduleCache = state._moduleCache || {};
  state._moduleCache[sheetName] = { schema, rows, nameGuess, buildDash, dateField, headerHtml, suppressMonthUI };
  renderModuleDashboardView(sheetName);
}

function renderModuleDashboardView(sheetName){
  const cacheEntry = state._moduleCache[sheetName];
  const { schema, rows, nameGuess, buildDash, dateField, headerHtml, suppressMonthUI } = cacheEntry;
  genericState = { sheetName, headers: schema.headers, rows, refresh: ()=>renderModuleDashboard(sheetName, nameGuess, buildDash, dateField, headerHtml, suppressMonthUI) };

  let monthHtml = '';
  let filteredRows = rows;
  if (dateField) {
    const months = Array.from(new Set(rows.map(r=> String(r[dateField]||'').slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m)))).sort().reverse();
    state._moduleMonthFilter = state._moduleMonthFilter || {};
    const selected = state._moduleMonthFilter[sheetName] || '';
    if (!suppressMonthUI) {
      monthHtml = `
        <div class="toolbar mb-2">
          <label class="small" style="font-weight:600;">กรองตามเดือน / ปี</label>
          <select onchange="state._moduleMonthFilter['${sheetName}']=this.value; renderModuleDashboardView('${sheetName}');" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12px;">
            <option value="">ทั้งหมด (${rows.length} รายการ)</option>
            ${months.map(m=>`<option value="${m}" ${selected===m?'selected':''}>${m} (${rows.filter(r=>String(r[dateField]||'').slice(0,7)===m).length} รายการ)</option>`).join('')}
          </select>
        </div>`;
    }
    if (selected) filteredRows = rows.filter(r=> String(r[dateField]||'').slice(0,7) === selected);
  }

  // [PART 1] เอา Dashboard/KPI/Chart ออกจากหน้านี้แล้ว — หน้านี้เหลือแค่ Import + Data Management Table เท่านั้น (Dashboard แยกไปอยู่หน้า Dashboard แล้ว)
  document.getElementById('content').innerHTML = `
    ${headerHtml || ''}
    <div class="card mb-2">
      <div class="card-title">📥 Import Excel <span class="hint">.xlsx (ชีตต้องมีคำว่า "${nameGuess}" อยู่ในชื่อ)</span></div>
      <input type="file" accept=".xlsx" onchange="handleExcelImport(event,'${sheetName}','${nameGuess}')">
      <div class="small text-muted mt-1" id="importMsg"></div>
    </div>
    ${monthHtml}
    <div class="toolbar">
      <input class="search" id="genSearch" placeholder="ค้นหา..." oninput="filterGenericTable()">
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="genericState.refresh()">🔄 Refresh</button>
        <button class="btn btn-accent" onclick="openGenericForm()">+ เพิ่มรายการ</button>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:auto;">
      <table id="genTable" style="min-width:${Math.max(700, schema.headers.length*120)}px;">
        <thead><tr>${schema.headers.map(h=>`<th>${h}</th>`).join('')}<th></th></tr></thead>
        <tbody id="genTableBody"></tbody>
      </table>
    </div>
  `;
  filterGenericTable();
}

function countBy(rows, field){
  const map = {};
  rows.forEach(r=>{ const v = (r[field]||'ไม่ระบุ').toString().trim() || 'ไม่ระบุ'; map[v]=(map[v]||0)+1; });
  return map;
}
function topN(map, n){ return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,n); }

// --- ติดตามลูกค้า (Customer Follow-up) ---
// [CRM v2] เทียบยอด 7 วันล่าสุด vs 7 วันก่อนหน้า จากวันที่จริงในข้อมูล (ไม่ใช้ตัวเลขสมมติ)
function crmWeekTrend(rows, dateField, filterFn){
  const list = filterFn ? rows.filter(filterFn) : rows;
  const valid = list.map(r=>r[dateField]).filter(d=>d && /^\d{4}-\d{2}-\d{2}/.test(String(d)));
  if(!valid.length) return { pct:0, dir:'flat' };
  const maxDate = new Date(Math.max.apply(null, valid.map(d=>new Date(d))));
  const cutoff1 = new Date(maxDate); cutoff1.setDate(cutoff1.getDate()-7);
  const cutoff2 = new Date(maxDate); cutoff2.setDate(cutoff2.getDate()-14);
  const cur = list.filter(r=>{ const d=new Date(r[dateField]); return d>cutoff1 && d<=maxDate; }).length;
  const prev = list.filter(r=>{ const d=new Date(r[dateField]); return d>cutoff2 && d<=cutoff1; }).length;
  const pct = prev ? Math.round(((cur-prev)/prev)*100) : (cur>0?100:0);
  return { pct, dir: pct>0?'up':(pct<0?'down':'flat') };
}
function crmTrendBadge(t){
  const cls = t.dir==='up' ? 'crm-trend-up' : t.dir==='down' ? 'crm-trend-down' : 'crm-trend-flat';
  const arrow = t.dir==='up' ? '▲' : t.dir==='down' ? '▼' : '—';
  return `<span class="crm-kpi-trend ${cls}">${arrow} ${Math.abs(t.pct)}% <span style="font-weight:400;opacity:.8">7 วัน</span></span>`;
}

function buildCustomerFollowupDash(rows){
  const total = rows.length;
  const bySource = countBy(rows, 'แหล่งที่มา');
  const online = Object.entries(bySource).filter(([k])=>k.indexOf('ออนไลน์')!==-1).reduce((s,[,v])=>s+v,0);
  const booth = Object.entries(bySource).filter(([k])=>k.indexOf('บูธ')!==-1).reduce((s,[,v])=>s+v,0);
  const contacted = rows.filter(r=> String(r['สถานะ']||'').trim()!=='').length;
  const contactRate = total? Math.round(contacted/total*100) : 0;
  const newCust = rows.filter(r=> String(r['ประเภทลูกค้า']||'').indexOf('ใหม่')!==-1).length;
  const bySales = countBy(rows,'ชื่อเซลส์');
  const byIndustry = countBy(rows,'ประเภทอุตสาหกรรม');
  const byStatus = countBy(rows,'สถานะ');
  const monthly = (function(){
    const map = {};
    rows.forEach(r=>{ const d = String(r['วันที่บันทึก']||'').slice(0,7); if(/^\d{4}-\d{2}$/.test(d)) map[d]=(map[d]||0)+1; });
    return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);
  })();

  const trendTotal = crmWeekTrend(rows, 'วันที่บันทึก');
  const trendContact = crmWeekTrend(rows, 'วันที่บันทึก', r=>String(r['สถานะ']||'').trim()!=='');
  const trendNew = crmWeekTrend(rows, 'วันที่บันทึก', r=>String(r['ประเภทลูกค้า']||'').indexOf('ใหม่')!==-1);

  // จัดกลุ่มสถานะเป็น 3 หมวดสไตล์ SaaS (Completed / Pending / Cancelled) จากข้อความสถานะจริง
  let completed=0, cancelled=0, pending=0;
  rows.forEach(r=>{
    const st = String(r['สถานะ']||'').trim();
    if (!st) pending++;
    else if (st.indexOf('ไม่ได้')!==-1 || st.indexOf('ไม่สำเร็จ')!==-1 || st.indexOf('ยกเลิก')!==-1) cancelled++;
    else completed++;
  });
  const completedPct = total ? Math.round(completed/total*100) : 0;

  const html = `
  <div class="crm-v2">
    <div class="crm-search-wrap"><input id="genSearch" placeholder="ค้นหาลูกค้า บริษัท หรือเอกสาร..." oninput="filterGenericTable()"></div>

    <div class="crm-kpi-grid">
      <div class="crm-card">
        <div class="crm-kpi-icon" style="background:var(--c-primary-soft);color:var(--c-primary);">📊</div>
        <div class="crm-kpi-label">Lead ทั้งหมด</div>
        <div class="crm-kpi-value">${total}</div>
        ${crmTrendBadge(trendTotal)}
      </div>
      <div class="crm-card">
        <div class="crm-kpi-icon" style="background:var(--c-secondary-soft);color:var(--c-secondary);">🌐</div>
        <div class="crm-kpi-label">ออนไลน์ / บูธ</div>
        <div class="crm-kpi-value">${online}<span style="font-size:16px;color:var(--c-sub);font-weight:600;"> / ${booth}</span></div>
        <span class="crm-kpi-trend crm-trend-flat">สัดส่วนแหล่งที่มา</span>
      </div>
      <div class="crm-card">
        <div class="crm-kpi-icon" style="background:var(--c-warn-soft);color:#B45309;">📞</div>
        <div class="crm-kpi-label">Contact Rate</div>
        <div class="crm-kpi-value">${contactRate}%</div>
        ${crmTrendBadge(trendContact)}
      </div>
      <div class="crm-card">
        <div class="crm-kpi-icon" style="background:var(--c-danger-soft);color:var(--c-danger);">✨</div>
        <div class="crm-kpi-label">ลูกค้าใหม่</div>
        <div class="crm-kpi-value">${newCust}</div>
        ${crmTrendBadge(trendNew)}
      </div>
    </div>

    <div class="crm-grid-3">
      <div class="crm-card">
        <div class="crm-card-head"><div><div class="crm-card-title">Lead แยกตามเซลส์</div><div class="crm-card-sub">จำนวน Lead ต่อพนักงานขาย</div></div></div>
        <div class="crm-chart-wrap"><canvas id="cfSales"></canvas></div>
      </div>
      <div class="crm-card">
        <div class="crm-card-head"><div><div class="crm-card-title">แหล่งที่มา</div><div class="crm-card-sub">Lead Source</div></div></div>
        <div class="crm-chart-wrap sm"><canvas id="cfSource"></canvas></div>
      </div>
    </div>

    <div class="crm-grid-2">
      <div class="crm-card">
        <div class="crm-card-head"><div><div class="crm-card-title">แนวโน้มรายเดือน</div><div class="crm-card-sub">Monthly Trend</div></div></div>
        <div class="crm-chart-wrap"><canvas id="cfMonthly"></canvas></div>
      </div>
      <div class="crm-card">
        <div class="crm-card-head"><div><div class="crm-card-title">สถานะการติดตาม</div><div class="crm-card-sub">Follow-up Status</div></div></div>
        <div class="crm-chart-wrap sm"><canvas id="cfStatus"></canvas></div>
        <div class="crm-legend">
          <div class="crm-legend-item"><span class="crm-legend-dot" style="background:#00C2A8"></span>ติดต่อแล้ว ${completed}</div>
          <div class="crm-legend-item"><span class="crm-legend-dot" style="background:#FFB648"></span>ยังไม่ติดต่อ ${pending}</div>
          <div class="crm-legend-item"><span class="crm-legend-dot" style="background:#FF5B5B"></span>ติดต่อไม่ได้ ${cancelled}</div>
        </div>
      </div>
    </div>

    <div class="crm-card">
      <div class="crm-card-head"><div><div class="crm-card-title">ประเภทอุตสาหกรรม</div><div class="crm-card-sub">Industry Breakdown</div></div></div>
      <div class="crm-chart-wrap"><canvas id="cfIndustry"></canvas></div>
    </div>
  </div>
  `;

  return { html, afterRender: ()=>{
    const salesE = topN(bySales,12);
    state.charts.cfSales = new Chart(document.getElementById('cfSales'), {
      type:'bar',
      data:{ labels:salesE.map(e=>e[0]), datasets:[{ data:salesE.map(e=>e[1]), backgroundColor:crmGradient('cfSales','#9B7BFF','#7C5CFC'), borderRadius:10, maxBarThickness:34 }] },
      options:{ responsive:true, maintainAspectRatio:false, animation:{duration:600,easing:'easeOutQuart'},
        plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#1E293B', padding:10, cornerRadius:10, titleFont:{family:'Inter'}, bodyFont:{family:'Inter'} } },
        scales:{ x:{ grid:{display:false} }, y:{ grid:{color:'#F0F2F7'}, beginAtZero:true, ticks:{precision:0} } } }
    });

    const srcE = Object.entries(bySource);
    state.charts.cfSource = new Chart(document.getElementById('cfSource'), {
      type:'doughnut',
      data:{ labels:srcE.map(e=>e[0]), datasets:[{ data:srcE.map(e=>e[1]), backgroundColor:['#7C5CFC','#17B6C4','#F5A524','#F0576B','#94A3B8'], borderWidth:0, hoverOffset:10 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'72%', animation:{duration:700,animateRotate:true},
        plugins:{ legend:{position:'bottom',labels:{boxWidth:9,font:{size:10,family:'Inter'},padding:12}}, centerText:{text:String(total),sub:'Lead'},
          tooltip:{ backgroundColor:'#1E293B', padding:10, cornerRadius:10 } } }
    });

    state.charts.cfMonthly = new Chart(document.getElementById('cfMonthly'), {
      type:'line',
      data:{ labels: monthly.length? monthly.map(m=>m[0]) : ['ไม่มีข้อมูล'], datasets:[{ data: monthly.length? monthly.map(m=>m[1]) : [0],
        borderColor:'#7C5CFC', backgroundColor:crmGradient('cfMonthly','rgba(124,92,252,0.28)','rgba(124,92,252,0.01)'),
        fill:true, tension:0.4, borderWidth:3, pointRadius:4, pointBackgroundColor:'#7C5CFC', pointBorderColor:'#fff', pointBorderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, animation:{duration:700,easing:'easeOutQuart'},
        plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#1E293B', padding:10, cornerRadius:10 } },
        scales:{ x:{ grid:{display:false} }, y:{ grid:{color:'#F0F2F7'}, beginAtZero:true, ticks:{precision:0} } } }
    });

    state.charts.cfStatus = new Chart(document.getElementById('cfStatus'), {
      type:'doughnut',
      data:{ labels:['ติดต่อแล้ว','ยังไม่ติดต่อ','ติดต่อไม่ได้'], datasets:[{ data:[completed,pending,cancelled], backgroundColor:['#00C2A8','#FFB648','#FF5B5B'], borderWidth:0, hoverOffset:10 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'75%', animation:{duration:700,animateRotate:true},
        plugins:{ legend:{display:false}, centerText:{text:completedPct+'%', sub:'Completed'}, tooltip:{ backgroundColor:'#1E293B', padding:10, cornerRadius:10 } } }
    });

    const indE = topN(byIndustry,10).reverse();
    state.charts.cfIndustry = new Chart(document.getElementById('cfIndustry'), {
      type:'bar',
      data:{ labels:indE.map(e=>e[0]), datasets:[{ data:indE.map(e=>e[1]), backgroundColor:crmGradient('cfIndustry','#5EE6E0','#17B6C4'), borderRadius:8, maxBarThickness:22 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, animation:{duration:600,easing:'easeOutQuart'},
        plugins:{ legend:{display:false}, tooltip:{ backgroundColor:'#1E293B', padding:10, cornerRadius:10 } },
        scales:{ x:{ grid:{color:'#F0F2F7'}, beginAtZero:true, ticks:{precision:0} }, y:{ grid:{display:false} } } }
    });
  }};
}
async function renderCustomerFollowup(){ await renderModuleDashboard('CustomerFollowup', 'ติดตามลูกค้า', buildCustomerFollowupDash, 'วันที่บันทึก'); }
async function renderCustomerFollowupView(){ await renderModuleReadOnly('CustomerFollowup', buildCustomerFollowupDash, 'วันที่บันทึก'); }

function buildMistakeDash(rows){
  const total = rows.length;
  const byDept = countBy(rows,'แผนก');
  const topDept = topN(byDept,1)[0];
  const totalValue = rows.reduce((s,r)=> s + (parseFloat(r['มูลค่าสินค้า'])||0), 0);
  const byEmp = countBy(rows,'ชื่อพนักงาน');
  const byEvent = countBy(rows,'เหตุการณ์ (รายละเอียดความผิด)');
  const topIssues = topN(byEvent, 5).filter(e=>e[1]>1);

  const html = `
    <div class="grid grid-3 mb-3">
      <div class="stat"><div class="stat-label">ความผิดทั้งหมด</div><div class="stat-value">${total}<span class="stat-unit">รายการ</span></div></div>
      <div class="stat"><div class="stat-label">แผนกที่ผิดบ่อยสุด</div><div class="stat-value" style="font-size:18px;">${topDept?topDept[0]:'—'}<span class="stat-unit">${topDept?'('+topDept[1]+' ครั้ง)':''}</span></div></div>
      <div class="stat"><div class="stat-label">มูลค่าความเสียหายรวม</div><div class="stat-value">฿${fmtMoney(totalValue)}</div></div>
    </div>
    <div class="grid grid-2 mb-3">
      <div class="card"><div class="card-title">ความผิดแยกตามแผนก</div><div class="chart-wrap"><canvas id="mkDept"></canvas></div></div>
      <div class="card"><div class="card-title">ความผิดแยกตามพนักงาน</div><div class="chart-wrap"><canvas id="mkEmp"></canvas></div></div>
    </div>
    <div class="card mb-3">
      <div class="card-title">เหตุการณ์ที่เกิดซ้ำบ่อยที่สุด <span class="hint">นับจากข้อความที่ตรงกันเป๊ะ</span></div>
      ${topIssues.length? topIssues.map(e=>`<div class="small mb-1">「${e[0]}」 — เกิด ${e[1]} ครั้ง</div>`).join('') : '<div class="helper">ไม่มีเหตุการณ์ซ้ำ</div>'}
    </div>
  `;
  return { html, afterRender: ()=>{
    const dE = topN(byDept,10);
    state.charts.mkDept = new Chart(document.getElementById('mkDept'), { type:'bar', data:{ labels:dE.map(e=>e[0]), datasets:[{data:dE.map(e=>e[1]),backgroundColor:'#EF4444'}]}, options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}} });
    const eE = topN(byEmp,10);
    state.charts.mkEmp = new Chart(document.getElementById('mkEmp'), { type:'doughnut', data:{ labels:eE.map(e=>e[0]), datasets:[{data:eE.map(e=>e[1]),backgroundColor:['#F59E0B','#EF4444','#3B82F6','#00A693','#5B93EF','#94A3B8','#1E3A5F','#22C55E']}]}, options:{responsive:true,maintainAspectRatio:false,cutout:'60%'} });
  }};
}
async function renderMistake(){ await renderModuleDashboard('Mistake', 'ความผิด', buildMistakeDash, 'วันที่'); }
async function renderMistakeView(){ await renderModuleReadOnly('Mistake', buildMistakeDash, 'วันที่'); }

// หมายเหตุ: ไฟล์จริงเก็บ "สถานะ" เป็นข้อความอิสระ (ไม่ใช่ Won/Lost ชัดเจน) จึงประเมิน "ได้งาน" แบบคร่าวๆ จากคำว่า "ผ่าน" ในข้อความ
function buildForeignInquiryDash(rows){
  const total = rows.length;
  const won = rows.filter(r=> String(r['สถานะ']||'').indexOf('ผ่าน')!==-1 && String(r['สถานะ']||'').indexOf('ไม่ได้งาน')===-1).length;
  const lost = total - won;
  const winRate = total? Math.round(won/total*100) : 0;
  const bySales = countBy(rows,'ชื่อเซลส์');
  const byStatus = countBy(rows,'สถานะ');
  const topReasons = topN(byStatus, 6);

  const html = `
    <div class="grid grid-4 mb-3">
      <div class="stat"><div class="stat-label">รายการทั้งหมด</div><div class="stat-value">${total}</div></div>
      <div class="stat"><div class="stat-label">แนวโน้มได้งาน (ประมาณ)</div><div class="stat-value" style="color:var(--success)">${won}</div></div>
      <div class="stat"><div class="stat-label">ไม่ได้งาน/อื่นๆ</div><div class="stat-value" style="color:var(--danger)">${lost}</div></div>
      <div class="stat"><div class="stat-label">Win Rate (ประมาณ)</div><div class="stat-value">${winRate}%</div></div>
    </div>
    <div class="grid grid-2 mb-3">
      <div class="card"><div class="card-title">จำนวนรายการแยกตามเซลส์</div><div class="chart-wrap"><canvas id="fiSales"></canvas></div></div>
      <div class="card">
        <div class="card-title">สถานะ/เหตุผลที่พบบ่อย</div>
        ${topReasons.map(e=>`<div class="small mb-1">「${e[0]}」 — ${e[1]} รายการ</div>`).join('')}
      </div>
    </div>
  `;
  return { html, afterRender: ()=>{
    const sE = topN(bySales,15);
    state.charts.fiSales = new Chart(document.getElementById('fiSales'), { type:'bar', data:{ labels:sE.map(e=>e[0]), datasets:[{data:sE.map(e=>e[1]),backgroundColor:'#1E3A5F'}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}} });
  }};
}
async function renderForeignInquiry(){ await renderModuleDashboard('ForeignInquiry', 'ถามราคา', buildForeignInquiryDash); }
async function renderForeignInquiryView(){ await renderModuleReadOnly('ForeignInquiry', buildForeignInquiryDash); }

// เฟรมสำหรับผู้บริหาร: KPI/กราฟอย่างเดียว ไม่มีปุ่มนำเข้า/แก้ไข/ลบ (อ่านอย่างเดียว)
async function renderModuleReadOnly(sheetName, buildDash, dateField, headerHtml, suppressMonthUI){
  if (headerHtml !== undefined) window['_roHeader_'+sheetName] = headerHtml;
  const savedHeader = window['_roHeader_'+sheetName] || '';
  const rows = await callGs('list', { sheetName });

  let monthHtml = '';
  let filteredRows = rows;
  if (dateField) {
    const months = Array.from(new Set(rows.map(r=> String(r[dateField]||'').slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m)))).sort().reverse();
    state._roMonthFilter = state._roMonthFilter || {};
    const selected = state._roMonthFilter[sheetName] || '';
    if (!suppressMonthUI) {
      monthHtml = `
        <div class="toolbar mb-2">
          <label class="small" style="font-weight:600;">กรองตามเดือน / ปี</label>
          <select onchange="state._roMonthFilter['${sheetName}']=this.value; renderModuleReadOnly('${sheetName}', window['_roBuild_${sheetName}'], '${dateField}');" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12px;">
            <option value="">ทั้งหมด (${rows.length} รายการ)</option>
            ${months.map(m=>`<option value="${m}" ${selected===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>`;
    }
    if (selected) filteredRows = rows.filter(r=> String(r[dateField]||'').slice(0,7) === selected);
  }

  // [PART 1] ไม่มี Dashboard/Chart ในหน้านี้ — ตารางอ่านอย่างเดียว (ไม่มีปุ่มแก้ไข/ลบ/Import)
  const headers = filteredRows.length ? Object.keys(filteredRows[0]) : (rows.length ? Object.keys(rows[0]) : []);
  const tableHtml = headers.length ? `
    <div class="card" style="padding:0;overflow:auto;">
      <table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${filteredRows.map(r=>`<tr>${headers.map(h=>`<td>${r[h]!=null?r[h]:''}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>` : `<div class="card">${emptyState('📭','ยังไม่มีข้อมูล')}</div>`;

  document.getElementById('content').innerHTML = savedHeader + monthHtml + tableHtml;
}
window._roBuild_CustomerFollowup = buildCustomerFollowupDash;
window._roBuild_Mistake = buildMistakeDash;
window._roBuild_ForeignInquiry = buildForeignInquiryDash;

// =========================================================
// รายงานประจำเดือน (รวม ติดตามลูกค้า/ความผิด/ถามราคาตปท. เป็นหน้าเดียว)
// Admin เห็นโหมดแก้ไข (นำเข้า/เพิ่ม/ลบ) — Exec อื่นๆ เห็นแดชบอร์ดอย่างเดียว เลือกอัตโนมัติตามสิทธิ์
// =========================================================
const MR_TABS = [
  { key:'customerfollowup', group:'monthly', label:'Customer Activity', icon:'📞', sub:'Import + Activity Summary', sheet:'CustomerFollowup', nameGuess:'ติดตามลูกค้า', build:'buildCustomerFollowupDash', dateField:'วันที่บันทึก' },
  { key:'mistake', group:'monthly', label:'ความผิด', icon:'⚠️', sub:'Incident Report', sheet:'Mistake', nameGuess:'ความผิด', build:'buildMistakeDash', dateField:'วันที่' },
  { key:'foreigninquiry', group:'monthly', label:'ถามราคา ตปท.', icon:'🌏', sub:'Foreign Inquiry', sheet:'ForeignInquiry', nameGuess:'ถามราคา', build:'buildForeignInquiryDash', dateField:undefined },
  { key:'personnel', group:'business', label:'Employee Performance', icon:'👥', sub:'KPI · Attendance · Task', sheet:null },
  { key:'salesperformance', group:'business', label:'Sales Performance', icon:'📈', sub:'Achievement · Ranking', sheet:null },
  { key:'onlineperformance', group:'business', label:'Online Performance', icon:'🌐', sub:'Platform Analysis', sheet:null },
  { key:'bizexecutive', group:'business', label:'Executive Dashboard', icon:'🏢', sub:'สรุปภาพรวมธุรกิจ', sheet:null }
];
const MR_GROUP_LABELS = { monthly:'📊 Monthly Report', business:'📈 Business Performance' };
function mrCurrentYearMonth(){
  if (!state._mrYearMonth) state._mrYearMonth = todayStr().slice(0,7);
  return state._mrYearMonth;
}
function mrTabBar(){
  const ym = mrCurrentYearMonth();
  const [y,m] = ym.split('-').map(Number);
  const months = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const yearNow = new Date().getFullYear();
  const yearOptions = []; for(let yy=yearNow-3; yy<=yearNow+1; yy++) yearOptions.push(yy);
  const groups = ['monthly','business'];
  return `
    ${groups.map(g=>`
      <div class="dash-section-title">${MR_GROUP_LABELS[g]}</div>
      <div class="dash-nav-grid">
        ${MR_TABS.filter(t=>t.group===g).map(t=>`
          <div class="dash-nav-card ${state._mrTab===t.key?'active':''}" onclick="state._mrTab='${t.key}'; go('monthlyreport');">
            <div class="dash-nav-icon">${t.icon}</div>
            <div class="dash-nav-title">${t.label}</div>
            <div class="dash-nav-sub">${t.sub}</div>
          </div>`).join('')}
      </div>`).join('')}
    <div class="toolbar mb-2" style="gap:8px;">
      <div class="small text-muted">ตัวกรองร่วม (มีผลกับทุกแดชบอร์ดในหน้านี้)</div>
      <div style="display:flex;gap:8px;">
        <select id="mrMonthSel" onchange="onMrYearMonthChange()" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12px;">
          ${months.slice(1).map((mn,i)=>`<option value="${i+1}" ${m===i+1?'selected':''}>${mn}</option>`).join('')}
        </select>
        <select id="mrYearSel" onchange="onMrYearMonthChange()" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12px;">
          ${yearOptions.map(yy=>`<option value="${yy}" ${y===yy?'selected':''}>${yy}</option>`).join('')}
        </select>
      </div>
    </div>`;
}
function onMrYearMonthChange(){
  const m = document.getElementById('mrMonthSel').value.padStart(2,'0');
  const y = document.getElementById('mrYearSel').value;
  state._mrYearMonth = `${y}-${m}`;
  // ซิงก์ตัวกรองเดือนภายในของแต่ละแดชบอร์ดให้ตรงกับตัวกรองร่วม (ใช้ Logic การกรองเดิมทุกอย่าง)
  state._moduleMonthFilter = state._moduleMonthFilter || {};
  state._roMonthFilter = state._roMonthFilter || {};
  MR_TABS.forEach(t=>{ if(t.dateField){ state._moduleMonthFilter[t.sheet] = state._mrYearMonth; state._roMonthFilter[t.sheet] = state._mrYearMonth; } });
  go('monthlyreport');
}
async function renderMonthlyReport(){
  if (!state._mrTab) state._mrTab = 'customerfollowup';
  mrCurrentYearMonth();
  const tab = MR_TABS.find(t=>t.key===state._mrTab) || MR_TABS[0];
  const isAdmin = !!(state.user.permissions && state.user.permissions.IsSystemAdmin);
  const bar = mrTabBar();

  // [Business Performance] Dashboard ใหม่ทั้ง 4 ตัว — Read Only ล้วนๆ ไม่มีปุ่มแก้ไขข้อมูลเลย
  if (tab.key === 'personnel') {
    document.getElementById('content').innerHTML = bar + '<div id="mrPersonnelArea">' + skeleton(4,2) + '</div>';
    await renderPersonnelTab('mrPersonnelArea', state._mrYearMonth);
    return;
  }
  if (tab.key === 'salesperformance') {
    document.getElementById('content').innerHTML = bar + '<div id="mrBizArea">' + skeleton(4,1) + '</div>';
    await renderSalesPerformanceInto('mrBizArea', state._mrYearMonth);
    return;
  }
  if (tab.key === 'onlineperformance') {
    document.getElementById('content').innerHTML = bar + '<div id="mrBizArea">' + skeleton(4,1) + '</div>';
    await renderOnlinePerformanceInto('mrBizArea', state._mrYearMonth);
    return;
  }
  if (tab.key === 'bizexecutive') {
    document.getElementById('content').innerHTML = bar + '<div id="mrBizArea">' + skeleton(4,1) + '</div>';
    await renderBusinessExecutiveInto('mrBizArea', state._mrYearMonth);
    return;
  }

  // [Dashboard = Read Only] ใช้ buildXDash เดิมตรงๆ (มีแค่ KPI/Chart อยู่แล้วโดยธรรมชาติ ไม่มี Import/Table ปนมาด้วย) — ไม่ใช้ renderModuleDashboard/ReadOnly อีกต่อไปเพราะมี Import ฝังอยู่ในนั้น
  const buildFn = window[tab.build];
  document.getElementById('content').innerHTML = bar + '<div id="mrAnalyticsArea">' + skeleton(4,2) + '</div>';
  await renderMonthlyAnalyticsInto('mrAnalyticsArea', tab.sheet, buildFn, tab.dateField);

  // [Customer Activity] รวมข้อมูล Activity Summary (กรอกจากเว็บ) เข้ากับ Dashboard เดิมที่มาจาก Import Excel — แยกแหล่งข้อมูลชัดเจนแต่แสดงหน้าเดียวกัน
  if (tab.key === 'customerfollowup') await injectCustomerActivitySummary(state._mrYearMonth);
}
// [Dashboard = Read Only] ใช้ตัวกรองเดือน/ปีร่วม (state._mrYearMonth) ไม่มี Import/Table/ปุ่มแก้ไขใดๆ ทั้งสิ้น
async function renderMonthlyAnalyticsInto(containerId, sheetName, buildFn, dateField){
  const area = document.getElementById(containerId);
  try {
    const rows = await callGs('list', { sheetName });
    let filteredRows = rows;
    if (dateField && state._mrYearMonth) filteredRows = rows.filter(r => String(r[dateField]||'').slice(0,7) === state._mrYearMonth);
    let dash = { html: '' };
    try { dash = buildFn(filteredRows); } catch(err){ area.innerHTML = `<div class="card">${emptyState('⚠️', err.message)}</div>`; return; }
    area.innerHTML = dash.html || `<div class="card">${emptyState('📭','ยังไม่มีข้อมูลเดือนนี้')}</div>`;
    if (dash.afterRender) dash.afterRender();
  } catch(err){ area.innerHTML = `<div class="card">${emptyState('⚠️', err.message)}</div>`; }
}
async function injectCustomerActivitySummary(yearMonth){
  try {
    const data = await callGs('getCustomerActivityDashboard', { params:{ yearMonth } });
    const s = data.activitySummary;
    const maxV = Math.max(s.calls, s.followUps, s.emails, s.visits, 1);
    const items = [
      { icon:'📞', label:'โทร', v:s.calls, grad:'var(--gradient-purple)' },
      { icon:'🔁', label:'Follow Up', v:s.followUps, grad:'var(--gradient-blue)' },
      { icon:'✉️', label:'ส่งอีเมล', v:s.emails, grad:'var(--gradient-cyan)' },
      { icon:'🤝', label:'เข้าพบ', v:s.visits, grad:'var(--gradient-green)' }
    ];
    const card = document.createElement('div');
    card.className = 'card mb-2';
    card.innerHTML = `
      <div class="card-title">📞 Activity Summary <span class="hint">กรอกจากเว็บแยกจากไฟล์ Import — ${yearMonth}</span></div>
      <div class="grid grid-4">
        ${items.map(it=>`
          <div class="kpi-card" style="box-shadow:none;padding:14px;">
            <div class="kpi-icon" style="background:${it.grad};width:32px;height:32px;font-size:14px;margin-bottom:8px;">${it.icon}</div>
            <div class="kpi-label">${it.label}</div>
            <div class="kpi-value" style="font-size:20px;">${it.v}</div>
            <div class="kpi-progress-track"><div class="kpi-progress-fill" style="width:${Math.round(it.v/maxV*100)}%;background:${it.grad};"></div></div>
          </div>`).join('')}
      </div>`;
    const analyticsArea = document.getElementById('mrAnalyticsArea');
    if (analyticsArea) analyticsArea.insertBefore(card, analyticsArea.firstChild);
  } catch(err) { /* ไม่กระทบ Dashboard หลักถ้าโหลดไม่สำเร็จ */ }
}

// --- แท็บ "บุคลากร": ภาพรวมบริษัท (Logic เดิมของ Executive Dashboard ทุกอย่าง) / รายบุคคล ---
async function renderPersonnelTab(containerId, yearMonth){
  const area = document.getElementById(containerId);
  if (!state._personnelMode) state._personnelMode = 'company';
  area.innerHTML = `
    <div class="toolbar mb-2" style="gap:8px;">
      <div style="display:flex;gap:6px;background:var(--line-soft);padding:4px;border-radius:10px;">
        <button class="btn btn-sm ${state._personnelMode==='company'?'btn-accent':'btn-ghost'}" onclick="state._personnelMode='company'; go('monthlyreport');">ภาพรวมบริษัท</button>
        <button class="btn btn-sm ${state._personnelMode==='individual'?'btn-accent':'btn-ghost'}" onclick="state._personnelMode='individual'; go('monthlyreport');">รายบุคคล</button>
      </div>
      ${state._personnelMode==='individual' ? `<select id="personnelEmpSel" onchange="onPersonnelEmpChange()" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:12px;min-width:200px;"><option>กำลังโหลดรายชื่อ...</option></select>` : '<div></div>'}
    </div>
    <div id="personnelBody"><div class="helper">กำลังโหลด...</div></div>
  `;
  if (state._personnelMode === 'individual') {
    try {
      const employees = await callGs('list', { sheetName:'Employee' });
      state._personnelEmployees = employees;
      const savedEmp = state._personnelSelectedEmp || (employees[0] && employees[0].ID) || '';
      state._personnelSelectedEmp = savedEmp;
      const sel = document.getElementById('personnelEmpSel');
      if (sel) sel.innerHTML = employees.map(e=>`<option value="${e.ID}" ${e.ID===savedEmp?'selected':''}>${getEmployeeDisplayWithId(e)}</option>`).join('');
      await renderPersonnelIndividualInto('personnelBody', savedEmp, yearMonth);
    } catch(err){ document.getElementById('personnelBody').innerHTML = `<div class="card"><div class="helper">${err.message}</div></div>`; }
  } else {
    await renderCompanyOverviewInto('personnelBody', yearMonth);
  }
}
function onPersonnelEmpChange(){
  state._personnelSelectedEmp = document.getElementById('personnelEmpSel').value;
  renderPersonnelIndividualInto('personnelBody', state._personnelSelectedEmp, state._mrYearMonth);
}

// =========================================================
// ATTENDANCE
// =========================================================
function attTabBar(active){
  return `<div class="toolbar mb-2" style="gap:8px;">
    <button class="btn ${active==='today'?'btn-accent':'btn-ghost'} btn-sm" onclick="state._attTab='today'; go('attendance');">วันนี้</button>
    <button class="btn ${active==='matrix'?'btn-accent':'btn-ghost'} btn-sm" onclick="state._attTab='matrix'; go('attendance');">ตารางรายเดือน</button>
  </div>`;
}
async function renderAttendanceHub(){
  if (!state._attTab) state._attTab = 'today';
  if (state._attTab === 'matrix') await renderAttendanceMatrix();
  else await renderAttendance();
}
async function renderAttendance(){
  const rows = await callGs('list', { sheetName:'Attendance' });
  const isAdmin = !!(state.user.permissions && state.user.permissions.IsSystemAdmin);
  const today = todayStr();
  const thisMonth = today.slice(0,7);
  const todayRow = rows.find(r=> String(r.Date)===today && String(r.EmployeeID)===state.user.id);
  const todayRows = rows.filter(r=> String(r.Date)===today);
  const monthRows = rows.filter(r=> String(r.Date).indexOf(thisMonth)===0);
  const lateToday = todayRows.filter(r=>r.Status==='สาย').length;
  const lateMonth = monthRows.filter(r=>r.Status==='สาย').length;
  const deductionMonth = monthRows.reduce((s,r)=> s+(Number(r.LateDeduction)||0), 0);

  document.getElementById('content').innerHTML = `
    ${attTabBar('today')}
    <div class="grid grid-4 mb-3">
      <div class="stat"><div class="stat-label">เช็คอินแล้ววันนี้</div><div class="stat-value">${todayRows.length}<span class="stat-unit">รายการ</span></div></div>
      <div class="stat"><div class="stat-label">มาสายวันนี้</div><div class="stat-value" style="color:var(--warn)">${lateToday}</div></div>
      <div class="stat"><div class="stat-label">มาสายสะสม (เดือนนี้)</div><div class="stat-value" style="color:var(--warn)">${lateMonth}<span class="stat-unit">ครั้ง</span></div></div>
      <div class="stat"><div class="stat-label">หักเบี้ยขยันสะสม (เดือนนี้)</div><div class="stat-value" style="color:var(--danger)">฿${fmtMoney(deductionMonth)}</div></div>
    </div>
    <div class="card mb-2">
      <div class="card-title">⏱ เช็คอิน / เช็คเอาท์วันนี้ (ของฉัน) <span class="hint">${fmt(today)}</span></div>
      <div class="grid grid-2 mb-1">
        <div class="stat"><div class="stat-label">เวลาเข้า</div><div class="stat-value">${todayRow&&todayRow.CheckIn?todayRow.CheckIn:'—'}</div></div>
        <div class="stat"><div class="stat-label">เวลาออก</div><div class="stat-value">${todayRow&&todayRow.CheckOut?todayRow.CheckOut:'—'}</div></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-accent" style="flex:1;justify-content:center;" onclick="doSelfCheck('in')" ${todayRow&&todayRow.CheckIn?'disabled':''}>เช็คอิน</button>
        <button class="btn btn-primary" style="flex:1;justify-content:center;" onclick="doSelfCheck('out')" ${!todayRow||!todayRow.CheckIn||todayRow.CheckOut?'disabled':''}>เช็คเอาท์</button>
      </div>
      <div class="small text-muted mt-1" id="selfCheckMsg"></div>
    </div>
    ${isAdmin? `
    <div class="card mb-2">
      <div class="card-title">📥 นำเข้าข้อมูลเข้า-ออกงาน (Admin) <span class="hint">คอลัมน์: EmployeeID, Date (yyyy-mm-dd), CheckIn (HH:mm), CheckOut (HH:mm)</span></div>
      <label class="small" style="font-weight:600;display:block;margin-bottom:4px;">อัปโหลดไฟล์ (.xlsx หรือ .csv)</label>
      <input type="file" accept=".xlsx,.csv" onchange="handleAttendanceFileImport(event)">
      <div class="small text-muted mt-1 mb-1">หรือวางข้อมูลเป็นข้อความ (คั่นด้วย , แต่ละแถวขึ้นบรรทัดใหม่):</div>
      <textarea id="attImport" rows="4" placeholder="EMP001,2026-08-01,08:25,17:35&#10;EMP002,2026-08-01,08:45,17:30"></textarea>
      <button class="btn btn-accent mt-1" onclick="importAttendance()">นำเข้าจากข้อความด้านบน</button>
      <div class="small text-muted mt-1" id="attImportMsg"></div>
    </div>
    <div class="card mb-2">
      <div class="card-title">📇 นำเข้าไฟล์บัตรสแกนลายนิ้วมือ <span class="hint">รูปแบบ 工号/姓名 (บล็อกละ 3 แถวต่อพนักงาน)</span></div>
      <div class="field-grid mb-1">
        <div class="field"><label>เดือน</label><input type="number" id="cardMonth" min="1" max="12" value="${new Date().getMonth()+1}"></div>
        <div class="field"><label>ปี (ค.ศ.)</label><input type="number" id="cardYear" value="${new Date().getFullYear()}"></div>
      </div>
      <input type="file" accept=".xls,.xlsx" onchange="handleCardSwipeFile(event)">
      <div class="small text-muted mt-1" id="cardSwipeMsg"></div>
      <div id="cardSwipeMatchArea"></div>
    </div>` : ''}
    <div class="card">
      <div class="card-title">ประวัติเข้า-ออกงาน <span class="hint">${rows.length} รายการ</span></div>
      <table>
        <thead><tr><th>วันที่</th>${isAdmin?'<th>พนักงาน</th>':''}<th>เข้า</th><th>ออก</th><th>สถานะ</th><th>สายกี่นาที</th><th>หัก</th>${isAdmin?'<th></th>':''}</tr></thead>
        <tbody>
          ${rows.length? rows.slice().reverse().map(r=>`
            <tr>
              <td>${fmt(r.Date)}</td>
              ${isAdmin?`<td><span class="ep-clickable" onclick="openEmployeeProfile('${r.EmployeeID}')">${getEmployeeDisplayName(r.EmployeeID)}</span></td>`:''}
              <td>${r.CheckIn||'—'}</td><td>${r.CheckOut||'—'}</td>
              <td>${attBadge(r.Status)}</td>
              <td>${r.LateMinutes||0}</td>
              <td>${r.LateDeduction? '฿'+fmtMoney(r.LateDeduction) : '—'}</td>
              ${isAdmin?`<td><button class="btn btn-ghost btn-sm" onclick='openEditAttendance(${JSON.stringify(r)})'>แก้ไข</button></td>`:''}
            </tr>`).join('') : `<tr><td colspan="8"><div class="helper">ไม่มีข้อมูล</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
async function doSelfCheck(type){
  const msg = document.getElementById('selfCheckMsg');
  msg.textContent = 'กำลังบันทึก...';
  try {
    const res = await callGs('checkInOut', { type });
    toast(type==='in' ? `เช็คอินสำเร็จ ${res.checkIn} น.` : `เช็คเอาท์สำเร็จ ${res.checkOut} น.`);
    renderAttendance();
  } catch(e){ msg.textContent = e.message; }
}

// =========================================================
// นำเข้าไฟล์บัตรสแกนลายนิ้วมือ (รูปแบบ 工号/姓名 บล็อก 3 แถวต่อพนักงาน)
// แถวป้าย: คอลัมน์ E="工号：", F=รหัส, K="姓名：", L=ชื่อเล่น, W="部门：", X=แผนก
// แถวถัดมา: เลขวัน 1-31 (คอลัมน์ B..AF)
// แถวถัดมาอีก: "เข้า\nออก" ต่อวัน (คอลัมน์เดียวกับเลขวัน)
// =========================================================
function parseCardSwipeWorkbook(wb, year, month){
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'' });
  const blocks = [];
  for (let r=0; r<aoa.length; r++){
    const row = aoa[r] || [];
    if (String(row[4]||'').trim() !== '工号：') continue;
    const fileId = String(row[5]||'').trim();
    const fileName = String(row[11]||'').trim();
    const fileDept = String(row[23]||'').trim();
    const timeRow = aoa[r+2] || [];
    const days = {};
    for (let day=1; day<=31; day++){
      const cell = timeRow[day];
      if (!cell) continue;
      const parts = String(cell).split('\n');
      const checkIn = (parts[0]||'').trim();
      const checkOut = (parts[1]||'').trim();
      if (!checkIn && !checkOut) continue;
      const mm = String(month).padStart(2,'0');
      const dd = String(day).padStart(2,'0');
      days[day] = { date: `${year}-${mm}-${dd}`, checkIn, checkOut };
    }
    blocks.push({ fileId, fileName, fileDept, days, dayCount: Object.keys(days).length });
    r += 2; // ข้ามแถววันที่กับแถวเวลาที่อ่านไปแล้ว
  }
  return blocks;
}

async function handleCardSwipeFile(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const msg = document.getElementById('cardSwipeMsg');
  const year = document.getElementById('cardYear').value;
  const month = document.getElementById('cardMonth').value;
  if(!year || !month){ msg.textContent='กรุณาระบุเดือน/ปีก่อน'; evt.target.value=''; return; }
  msg.textContent = 'กำลังอ่านไฟล์...';
  const reader = new FileReader();
  reader.onload = async (e)=>{
    try {
      await ensureXlsxLoaded();
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
      const blocks = parseCardSwipeWorkbook(wb, year, month);
      if(!blocks.length){ msg.textContent='ไม่พบข้อมูลพนักงานในไฟล์ (เช็ครูปแบบไฟล์)'; return; }
      msg.textContent = `พบพนักงาน ${blocks.length} คนในไฟล์ — กำลังจับคู่กับรายชื่อในระบบ...`;
      const employees = await callGs('list', { sheetName:'Employee' });
      state._cardSwipeBlocks = blocks;
      state._cardSwipeEmployees = employees;
      renderCardSwipeMatchTable();
      msg.textContent = `พบพนักงาน ${blocks.length} คน — ตรวจสอบการจับคู่ด้านล่างก่อนกดยืนยัน`;
    } catch(err){ msg.textContent = 'เกิดข้อผิดพลาด: '+err.message; }
  };
  reader.readAsArrayBuffer(file);
  evt.target.value = '';
}

function renderCardSwipeMatchTable(){
  const blocks = state._cardSwipeBlocks;
  const employees = state._cardSwipeEmployees;
  const rowsHtml = blocks.map((b,i)=>{
    const auto = employees.find(e => String(e['ชื่อเล่น']||'').trim().toLowerCase() === b.fileName.toLowerCase());
    const options = employees.map(e => `<option value="${e.ID}" ${auto&&auto.ID===e.ID?'selected':''}>${getEmployeeDisplayWithId(e)}</option>`).join('');
    return `
      <tr>
        <td>${b.fileId}</td>
        <td>${b.fileName}</td>
        <td>${b.dayCount} วัน</td>
        <td>
          <select id="cardMatch_${i}" style="padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:12px;min-width:180px;">
            <option value="">— ข้าม ไม่นำเข้า —</option>
            ${options}
          </select>
        </td>
        <td>${auto? '<span class="badge badge-success">จับคู่อัตโนมัติ</span>' : '<span class="badge badge-warn">ไม่พบ กรุณาเลือกเอง</span>'}</td>
      </tr>`;
  }).join('');
  document.getElementById('cardSwipeMatchArea').innerHTML = `
    <div class="card-title mt-2">ตรวจสอบการจับคู่พนักงาน <span class="hint">${blocks.length} คน</span></div>
    <div style="overflow:auto;">
      <table><thead><tr><th>รหัสในไฟล์</th><th>ชื่อในไฟล์</th><th>จำนวนวันที่มีข้อมูล</th><th>จับคู่กับพนักงาน</th><th>สถานะ</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
    </div>
    <button class="btn btn-accent mt-2" onclick="confirmCardSwipeImport()">ยืนยันและนำเข้าทั้งหมด</button>
    <div class="small text-muted mt-1" id="cardSwipeConfirmMsg"></div>
  `;
}

async function confirmCardSwipeImport(){
  const blocks = state._cardSwipeBlocks;
  const msg = document.getElementById('cardSwipeConfirmMsg');
  const rows = [];
  blocks.forEach((b,i)=>{
    const sel = document.getElementById('cardMatch_'+i);
    const employeeId = sel ? sel.value : '';
    if(!employeeId) return;
    Object.values(b.days).forEach(d=>{
      rows.push({ EmployeeID: employeeId, Date: d.date, CheckIn: d.checkIn, CheckOut: d.checkOut });
    });
  });
  if(!rows.length){ msg.textContent='ไม่มีรายการที่จับคู่ไว้ (เลือกพนักงานอย่างน้อย 1 คนก่อนยืนยัน)'; return; }
  msg.textContent = `กำลังนำเข้า ${rows.length} รายการ...`;
  try {
    const res = await callGs('bulkImportAttendance', { rows });
    toast(`นำเข้าสำเร็จ: สร้างใหม่ ${res.created}, อัปเดต ${res.updated}, ข้าม ${res.skipped}`);
    document.getElementById('cardSwipeMatchArea').innerHTML = '';
    state._cardSwipeBlocks = null;
    renderAttendance();
  } catch(err){ msg.textContent = 'เกิดข้อผิดพลาด: '+err.message; }
}

// =========================================================
// ตารางเข้า-ออกงานรายเดือน (เลือกพนักงาน+เดือน, เชื่อมกับข้อมูลลาอัตโนมัติ)
// =========================================================
async function renderAttendanceMatrix(){
  const employees = await callGs('list', { sheetName:'Employee' });
  state._matrixEmployees = employees;
  if (!employees.length) { document.getElementById('content').innerHTML = attTabBar('matrix') + '<div class="card"><div class="helper">ยังไม่มีข้อมูลพนักงานในระบบ</div></div>'; return; }
  const savedEmp = state._matrixSelectedEmp || employees[0].ID;
  const savedMonth = state._matrixSelectedMonth || todayStr().slice(0,7);
  const sundayOff = state._matrixSundayOff !== false; // ค่าเริ่มต้น: นับวันอาทิตย์เป็นวันหยุด
  document.getElementById('content').innerHTML = `
    ${attTabBar('matrix')}
    <div class="card mb-2">
      <div class="field-grid">
        <div class="field"><label>พนักงาน</label><select id="matrixEmp" onchange="onMatrixFilterChange()">
          ${employees.map(e=>`<option value="${e.ID}" ${e.ID===savedEmp?'selected':''}>${getEmployeeDisplayWithId(e)}</option>`).join('')}
        </select></div>
        <div class="field"><label>เดือน</label><input type="month" id="matrixMonth" value="${savedMonth}" onchange="onMatrixFilterChange()"></div>
        <div class="field field-wide">
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;margin-bottom:0;width:auto;">
            <input type="checkbox" id="matrixSundayOff" style="width:16px;height:16px;padding:0;border:none;background:none;flex:none;" ${sundayOff?'checked':''} onchange="onMatrixFilterChange()">
            <span>นับวันอาทิตย์เป็นวันหยุด</span>
          </label>
        </div>
      </div>
    </div>
    <div id="matrixTableArea"><div class="helper">กำลังโหลด...</div></div>
  `;
  await loadMatrixTable();
}
function onMatrixFilterChange(){
  state._matrixSelectedEmp = document.getElementById('matrixEmp').value;
  state._matrixSelectedMonth = document.getElementById('matrixMonth').value;
  const sundayEl = document.getElementById('matrixSundayOff');
  if (sundayEl) state._matrixSundayOff = sundayEl.checked;
  loadMatrixTable();
}
// วันที่ 'YYYY-MM-DD' → true ถ้าเป็นวันอาทิตย์ (ใช้ปีเดือนวันสร้าง Date ตรงๆ กันปัญหา timezone เพี้ยนจากการ parse เป็น UTC)
function isSundayDateStr_(dateStr){
  const p = String(dateStr).split('-').map(Number);
  return new Date(p[0], p[1]-1, p[2]).getDay() === 0;
}
async function loadMatrixTable(){
  const employeeId = document.getElementById('matrixEmp').value;
  const yearMonth = document.getElementById('matrixMonth').value;
  const sundayOff = state._matrixSundayOff !== false;
  const area = document.getElementById('matrixTableArea');
  if (!yearMonth) { area.innerHTML = '<div class="card"><div class="helper">กรุณาเลือกเดือน</div></div>'; return; }
  area.innerHTML = '<div class="helper">กำลังโหลด...</div>';
  try {
    const data = await callGs('getAttendanceMatrix', { params:{ employeeId, yearMonth } });
    const isDayOff = d => d.isHoliday || (sundayOff && isSundayDateStr_(d.date));
    const workDays = data.days.filter(d=>!d.isLeave && d.checkIn).length;
    const lateDays = data.days.filter(d=>d.status==='สาย').length;
    const totalLateMinutes = data.days.reduce((sum,d)=> sum + (Number(d.lateMinutes)||0), 0);
    const leaveDays = data.days.filter(d=>d.isLeave).length;
    const missingDays = data.days.filter(d=>!d.isLeave && !d.checkIn && !d.checkOut && !isDayOff(d)).length;
    area.innerHTML = `
      <div class="grid grid-4 mb-2">
        <div class="stat"><div class="stat-label">มาทำงาน</div><div class="stat-value">${workDays}<span class="stat-unit">วัน</span></div></div>
        <div class="stat"><div class="stat-label">มาสาย</div><div class="stat-value" style="color:var(--warn)">${lateDays}<span class="stat-unit">วัน</span></div><div class="small text-muted">รวม ${totalLateMinutes} นาที</div></div>
        <div class="stat"><div class="stat-label">ลา</div><div class="stat-value" style="color:var(--info)">${leaveDays}<span class="stat-unit">วัน</span></div></div>
        <div class="stat"><div class="stat-label">ยังไม่มีข้อมูล</div><div class="stat-value" style="color:var(--danger)">${missingDays}<span class="stat-unit">วัน</span></div></div>
      </div>
      <div class="card" style="padding:0;overflow:auto;">
        <table>
          <thead><tr><th>วัน</th><th>วันที่</th><th>เข้า</th><th>ออก</th><th>สถานะ</th><th>สาย(นาที)</th><th>หัก</th><th></th></tr></thead>
          <tbody>
            ${data.days.map(d=>{
              const dayOff = isDayOff(d);
              const offLabel = d.isHoliday ? ('หยุด: ' + (d.holidayName||'วันหยุดบริษัท')) : 'หยุด (วันอาทิตย์)';
              return `
              <tr${dayOff && !d.isLeave ? ' style="opacity:.65;"' : ''}>
                <td>${d.day}</td>
                <td>${fmt(d.date)}</td>
                <td>${d.isLeave? '—' : (d.checkIn || '<span class="text-muted">ว่าง</span>')}</td>
                <td>${d.isLeave? '—' : (d.checkOut || '<span class="text-muted">ว่าง</span>')}</td>
                <td>${d.isLeave? `<span class="badge badge-info">${d.status}</span>` : (dayOff && !d.checkIn ? `<span class="badge badge-neutral">${offLabel}</span>` : (d.status? attBadge(d.status) : '<span class="badge badge-neutral">ไม่มีข้อมูล</span>'))}</td>
                <td>${d.lateMinutes||0}</td>
                <td>${d.deduction? '฿'+fmtMoney(d.deduction) : '—'}</td>
                <td>${d.isLeave? '' : `<button class="btn btn-ghost btn-sm" onclick='openMatrixDayEdit(${JSON.stringify(d)})'>แก้ไข</button>`}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch(err){ area.innerHTML = `<div class="card"><div class="helper">${err.message}</div></div>`; }
}
function openMatrixDayEdit(d){
  modal(`
    <h2 class="mb-2">แก้ไขวันที่ ${fmt(d.date)}</h2>
    <div class="field-grid">
      <div class="field"><label>เวลาเข้า (HH:mm)</label><input id="mxCheckIn" value="${d.checkIn||''}" placeholder="08:30"></div>
      <div class="field"><label>เวลาออก (HH:mm)</label><input id="mxCheckOut" value="${d.checkOut||''}" placeholder="17:30"></div>
    </div>
    <div class="small text-muted mb-1" id="mxMsg"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-accent" onclick="saveMatrixDay('${d.date}')">บันทึก</button>
    </div>
  `);
}
async function saveMatrixDay(date){
  const employeeId = document.getElementById('matrixEmp').value;
  const checkIn = document.getElementById('mxCheckIn').value;
  const checkOut = document.getElementById('mxCheckOut').value;
  const msg = document.getElementById('mxMsg');
  msg.textContent = 'กำลังบันทึก...';
  try {
    await callGs('saveAttendanceDay', { employeeId, date, checkIn, checkOut });
    closeModal(); toast('บันทึกเรียบร้อย'); loadMatrixTable();
  } catch(err){ msg.textContent = err.message; }
}

function attBadge(s){
  if(s==='มา') return '<span class="badge badge-success">มา</span>';
  if(s==='สาย') return '<span class="badge badge-warn">สาย</span>';
  if(s==='ขาด') return '<span class="badge badge-danger">ขาด</span>';
  return `<span class="badge badge-neutral">${s||''}</span>`;
}
async function importAttendance(){
  const text = document.getElementById('attImport').value.trim();
  const msg = document.getElementById('attImportMsg');
  if(!text){ msg.textContent='กรุณาวางข้อมูล'; return; }
  const rows = text.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
    const [EmployeeID, Date, CheckIn, CheckOut] = l.split(',').map(s=>s.trim());
    return { EmployeeID, Date, CheckIn, CheckOut };
  });
  msg.textContent = 'กำลังนำเข้า...';
  try {
    const res = await callGs('bulkImportAttendance', { rows });
    msg.textContent = `สำเร็จ: สร้างใหม่ ${res.created}, อัปเดต ${res.updated}, ข้าม ${res.skipped}`;
    toast('นำเข้าข้อมูลเรียบร้อย');
    renderAttendance();
  } catch(e){ msg.textContent = e.message; }
}
// อ่านไฟล์ .xlsx/.csv รูปแบบคอลัมน์ EmployeeID, Date, CheckIn, CheckOut (แถวแรกเป็นหัวตาราง)
function parseAttendanceFile(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      try {
        if (file.name.toLowerCase().endsWith('.csv')) {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(e.target.result));
          const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
          const rows = lines.slice(1).map(l=>{
            const [EmployeeID, Date, CheckIn, CheckOut] = l.split(',').map(s=>(s||'').trim());
            return { EmployeeID, Date, CheckIn, CheckOut };
          });
          resolve(rows);
        } else {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, defval:'', dateNF:'yyyy-mm-dd' });
          const rows = aoa.slice(1).filter(r=> r && r.some(c=> String(c).trim()!=='')).map(r=>({
            EmployeeID: r[0]!=null? String(r[0]).trim() : '',
            Date: r[1]!=null? String(r[1]).trim() : '',
            CheckIn: r[2]!=null? String(r[2]).trim() : '',
            CheckOut: r[3]!=null? String(r[3]).trim() : ''
          }));
          resolve(rows);
        }
      } catch(err){ reject(err); }
    };
    reader.onerror = ()=> reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsArrayBuffer(file);
  });
}
async function handleAttendanceFileImport(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const msg = document.getElementById('attImportMsg');
  msg.textContent = 'กำลังอ่านไฟล์...';
  try {
    if (!file.name.toLowerCase().endsWith('.csv')) await ensureXlsxLoaded();
    const rows = await parseAttendanceFile(file);
    if(!rows.length){ msg.textContent='ไม่พบข้อมูลในไฟล์ (แถวแรกต้องเป็นหัวตาราง: EmployeeID,Date,CheckIn,CheckOut)'; return; }
    msg.textContent = `พบ ${rows.length} แถว กำลังนำเข้า...`;
    const res = await callGs('bulkImportAttendance', { rows });
    msg.textContent = `สำเร็จ: สร้างใหม่ ${res.created}, อัปเดต ${res.updated}, ข้าม ${res.skipped}`;
    toast('นำเข้าข้อมูลเรียบร้อย');
    renderAttendance();
  } catch(err){ msg.textContent = 'เกิดข้อผิดพลาด: '+err.message; }
  evt.target.value = '';
}
function openEditAttendance(r){
  modal(`
    <h2 class="mb-2">แก้ไขเวลาเข้า-ออก: ${getEmployeeDisplayName(r.EmployeeID)} (${fmt(r.Date)})</h2>
    <div class="field-grid">
      <div class="field"><label>เวลาเข้า (HH:mm)</label><input id="edCheckIn" value="${r.CheckIn||''}" placeholder="08:30"></div>
      <div class="field"><label>เวลาออก (HH:mm)</label><input id="edCheckOut" value="${r.CheckOut||''}" placeholder="17:30"></div>
    </div>
    <div class="small text-muted mb-1" id="edAttMsg"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-accent" onclick="saveEditAttendance('${r.RecordID}')">บันทึก</button>
    </div>
  `);
}
async function saveEditAttendance(recordId){
  const checkIn = document.getElementById('edCheckIn').value;
  const checkOut = document.getElementById('edCheckOut').value;
  try {
    await callGs('editAttendanceRecord', { recordId, checkIn, checkOut });
    closeModal(); toast('บันทึกเรียบร้อย'); renderAttendance();
  } catch(e){ document.getElementById('edAttMsg').textContent = e.message; }
}

// =========================================================
// LEAVE
// =========================================================
// [Standardize Leave Type — 2026-08 Fix] Normalize/รวม Leave Type ตอน "แสดงผล/จัดกลุ่ม" เท่านั้น
// ไม่แตะค่าที่ Submit/บันทึกจริงลง Sheet และไม่แตะ Backend getLeaveSummary()/computeVacationEntitlement()
// Canonical: "พักร้อน" (รวม "ลาพักร้อน" เดิม), "ลาป่วย (มีใบรับรองแพทย์)" (รวม "ลาป่วย" เดิม) — ค่าอื่นผ่านตรงๆ ไม่แตะ
function normalizeLeaveTypeLabel(raw){
  const t = String(raw||'').trim();
  if (t === 'ลาพักร้อน' || t === 'พักร้อน') return 'พักร้อน';
  if (t === 'ลาป่วย') return 'ลาป่วย (มีใบรับรองแพทย์)';
  return t || 'อื่นๆ';
}
// รวมรายการใน balances array (ผลลัพธ์จาก getLeaveSummary()) ตาม Canonical Type — sum entitlement/used/carryover ที่ Backend คำนวณมาแล้ว แล้วคำนวณ remaining ใหม่จากผลรวม (ไม่แตะสูตรคำนวณเดิม แค่รวมตัวเลขที่ได้มา)
function mergeLeaveBalancesByCanonicalType(balances){
  const order = []; const map = {};
  (balances||[]).forEach(b=>{
    const key = normalizeLeaveTypeLabel(b.leaveType);
    if (!map[key]) { map[key] = { leaveType:key, entitlement:0, used:0, remaining:0, carryover:0 }; order.push(key); }
    map[key].entitlement += Number(b.entitlement||0);
    map[key].used += Number(b.used||0);
    map[key].carryover += Number(b.carryover||0);
  });
  order.forEach(key=>{ map[key].remaining = map[key].entitlement - map[key].used; });
  return order.map(key=>map[key]);
}
async function renderLeave(){
  const [rows, summary, leaveTypes] = await Promise.all([ callGs('list',{sheetName:'Leave_Request'}), callGs('getLeaveSummary',{}), callGs('list',{sheetName:'Leave_Type'}) ]);
  // [PART 1] "รายการลาของฉัน" ต้องเป็นของ User ปัจจุบันเท่านั้น — filter ฝั่ง Frontend ไม่แตะ genericList() เพราะยังต้องใช้ rows เต็ม (ตาม Permission เดิม) สำหรับ "รวมการลา" ด้านล่าง
  const myRows = rows.filter(r => String(r.EmployeeID) === String(state.user.id));
  document.getElementById('content').innerHTML = `
    <div class="card mb-2">
      <div class="card-title">สรุปสิทธิ์การลา <span class="hint">อายุงาน ${summary.tenureYears} ปี</span></div>
      <div class="grid grid-3">
        ${mergeLeaveBalancesByCanonicalType(summary.balances).map(b=>`
          <div class="stat">
            <div class="stat-label">${b.leaveType}</div>
            <div class="stat-value" style="color:var(--accent)">${b.remaining}<span class="stat-unit">วัน คงเหลือ</span></div>
            <div class="small text-muted mt-1">สิทธิ์ปีนี้ ${b.entitlement} วัน · ใช้ไปแล้ว ${b.used} วัน${b.carryover?' · ยกมา '+b.carryover+' วัน':''}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="grid grid-2">
      <div class="card mb-2">
        <div class="card-title">📝 ยื่นลา</div>
        <div class="field"><label>ประเภทการลา</label><select id="lvType">
          <option value="">▼ เลือกประเภทการลา</option>
          <!-- [Standardize Leave Type] RULE 4: Dropdown แสดงเฉพาะ 4 ตัวเลือกมาตรฐาน — ตัวเลือก "พักร้อน" ยัง Submit ด้วย value="ลาพักร้อน" เดิม (ไม่เปลี่ยน) เพื่อไม่ให้ Leave Balance/Vacation Calculation เดิมพัง เปลี่ยนแค่ Label ที่ผู้ใช้เห็น -->
          <option value="ลาพักร้อน">พักร้อน</option>
          <option value="ลากิจ">ลากิจ</option>
          <option value="ลาป่วย (มีใบรับรองแพทย์)">ลาป่วย (มีใบรับรองแพทย์)</option>
          <option value="ลาป่วย (ไม่มีใบรับรองแพทย์)">ลาป่วย (ไม่มีใบรับรองแพทย์)</option>
        </select></div>
        <div class="field-grid">
          <div class="field"><label>วันที่เริ่ม</label><input type="date" id="lvStart" value="${todayStr()}" onchange="updateLeaveDaysPreview()"></div>
          <div class="field"><label>ช่วงเวลา (วันแรก)</label><select id="lvStartPart" onchange="updateLeaveDaysPreview()">
            <option value="เต็มวัน">เต็มวัน</option><option value="ครึ่งวันเช้า">ครึ่งวันเช้า</option><option value="ครึ่งวันบ่าย">ครึ่งวันบ่าย</option>
          </select></div>
          <div class="field"><label>วันที่สิ้นสุด</label><input type="date" id="lvEnd" value="${todayStr()}" onchange="updateLeaveDaysPreview()"></div>
          <div class="field"><label>ช่วงเวลา (วันสุดท้าย)</label><select id="lvEndPart" onchange="updateLeaveDaysPreview()">
            <option value="เต็มวัน">เต็มวัน</option><option value="ครึ่งวันเช้า">ครึ่งวันเช้า</option><option value="ครึ่งวันบ่าย">ครึ่งวันบ่าย</option>
          </select></div>
        </div>
        <div class="stat mb-1" style="text-align:center;padding:12px;">
          <div class="stat-label">จำนวนวันลา (คำนวณอัตโนมัติ)</div>
          <div class="stat-value" id="lvDaysPreview" style="color:var(--accent)">1<span class="stat-unit">วัน</span></div>
        </div>
        <div id="lvBackdatedWarning"></div>
        <div class="field"><label>เหตุผล <span id="lvReasonRequired" style="color:var(--danger);display:none;">*จำเป็นสำหรับลาย้อนหลัง</span></label><textarea id="lvReason" rows="2"></textarea></div>
        <div class="field"><label>แนบใบรับรองแพทย์ (ถ้ามี — JPG/PNG/PDF)</label><input type="file" id="lvFile" accept=".jpg,.jpeg,.png,.pdf"></div>
        <div class="field"><label>ผู้รับผิดชอบงานแทน (รหัสพนักงาน, ถ้ามี)</label><input id="lvCover"></div>
        <button class="btn btn-accent" id="lvSubmitBtn" style="width:100%;justify-content:center;" onclick="submitLeave()">ส่งคำขอลา</button>
        <div class="small text-muted mt-1" id="lvMsg"></div>
      </div>
      <div class="card mb-2">
        <div class="card-title">📋 รายการลาของฉัน <span class="hint">${myRows.length} รายการ</span></div>
        <table><thead><tr><th>ประเภท</th><th>วันที่</th><th>จำนวน</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${myRows.length? myRows.slice().reverse().map(r=>`
          <tr><td>${normalizeLeaveTypeLabel(r['ประเภทลา'])} ${leaveBackdatedBadge(r)}</td><td>${fmt(r['วันที่เริ่มลา'])}${r['วันที่เริ่มลา']!==r['วันที่สิ้นสุด']?' → '+fmt(r['วันที่สิ้นสุด']):''}</td>
          <td>${r['จำนวนวัน']||0} วัน</td><td>${statusBadge(r.Status)}</td>
          <td>${r.Status==='InProgress'?`<button class="btn btn-danger btn-sm" onclick="cancelReq('Leave_Request','${r.RecordID}')">ยกเลิก</button>`:''}</td></tr>
        `).join('') : '<tr><td colspan="5"><div class="helper">ยังไม่มีรายการ</div></td></tr>'}</tbody></table>
      </div>
    </div>
    ${leaveOverviewHtml(rows)}
  `;
  updateLeaveDaysPreview();
}
// [PART 2] "รวมการลา" — ใช้ rows เดิมที่ genericList คืนมาแล้วตาม Permission/VisibilityScope เดิมของระบบเป๊ะ (ไม่ยิง API เพิ่ม ไม่สร้าง Permission ใหม่)
function leaveOverviewHtml(rows){
  if (!rows.length) return `<div class="card mb-2"><div class="card-title">📊 รวมการลา</div>${emptyState('📊','ไม่มีข้อมูลการลาตามสิทธิ์ที่มองเห็น')}</div>`;
  const approvedRows = rows.filter(r=>r.Status==='Approved');
  const totalDays = approvedRows.reduce((s,r)=>s+Number(r['จำนวนวัน']||0),0);
  const byType = {};
  approvedRows.forEach(r=>{ const t=normalizeLeaveTypeLabel(r['ประเภทลา']); byType[t]=(byType[t]||0)+Number(r['จำนวนวัน']||0); });
  const byStatus = {};
  rows.forEach(r=>{ byStatus[r.Status]=(byStatus[r.Status]||0)+1; });
  const uniquePeople = new Set(rows.map(r=>r.EmployeeID)).size;
  const statusLabels = { Approved:'อนุมัติแล้ว', InProgress:'รออนุมัติ', Rejected:'ปฏิเสธ', Cancelled:'ยกเลิก' };
  return `
    <div class="card mb-2">
      <div class="card-title">📊 รวมการลา <span class="hint">ตามสิทธิ์การมองเห็นของบัญชีนี้ — ${uniquePeople} คน / ${rows.length} รายการ</span></div>
      <div class="grid grid-4 mb-2">
        <div class="stat"><div class="stat-label">วันลารวม (อนุมัติแล้ว)</div><div class="stat-value">${totalDays}<span class="stat-unit">วัน</span></div></div>
        ${Object.entries(byStatus).map(([s,c])=>`<div class="stat"><div class="stat-label">${statusLabels[s]||s}</div><div class="stat-value" style="font-size:20px;">${c}<span class="stat-unit">รายการ</span></div></div>`).join('')}
      </div>
      <div class="card-title" style="margin-bottom:8px;">แยกตามประเภทการลา (อนุมัติแล้ว)</div>
      <table><thead><tr><th>ประเภทลา</th><th>จำนวนวันรวม</th></tr></thead>
      <tbody>${Object.entries(byType).length? Object.entries(byType).map(([t,d])=>`<tr><td>${t}</td><td>${d} วัน</td></tr>`).join('') : '<tr><td colspan="2"><div class="helper">ยังไม่มีข้อมูล</div></td></tr>'}</tbody></table>
    </div>
  `;
}
// [ลาย้อนหลัง] เทียบวันที่เริ่มลากับวันที่ส่งคำขอจริง (RequestDateTime)
function leaveBackdatedBadge(r){
  if (!r['RequestDateTime']) return '';
  const reqDt = new Date(r['RequestDateTime']);
  if (isNaN(reqDt.getTime())) return '';
  const reqDateOnly = new Date(reqDt.getFullYear(), reqDt.getMonth(), reqDt.getDate());
  const leaveStart = new Date(r['วันที่เริ่มลา']);
  const daysLate = Math.round((reqDateOnly - leaveStart)/86400000);
  return daysLate > 0 ? `<span class="badge badge-warn" title="ส่งคำขอช้ากว่าวันลา ${daysLate} วัน">🔶 ย้อนหลัง ${daysLate}วัน</span>` : '';
}
// [โมดูล Leave] คำนวณจำนวนวันลาอัตโนมัติ รองรับลาครึ่งวัน — ผู้ใช้กรอกเองไม่ได้
function calcLeaveDays(startDate, startPart, endDate, endPart){
  if (!startDate || !endDate) return 0;
  if (startDate === endDate) return startPart === 'เต็มวัน' ? 1 : 0.5;
  const totalDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  let days = totalDays;
  if (startPart !== 'เต็มวัน') days -= 0.5;
  if (endPart !== 'เต็มวัน') days -= 0.5;
  return Math.max(0, days);
}
function updateLeaveDaysPreview(){
  const start = document.getElementById('lvStart').value;
  const end = document.getElementById('lvEnd').value;
  const startPart = document.getElementById('lvStartPart').value;
  const endPart = document.getElementById('lvEndPart').value;
  const days = calcLeaveDays(start, startPart, end, endPart);
  document.getElementById('lvDaysPreview').innerHTML = `${days}<span class="stat-unit">วัน</span>`;
  const isBackdated = start && new Date(start) < new Date(todayStr());
  document.getElementById('lvBackdatedWarning').innerHTML = isBackdated
    ? `<div class="card mb-1" style="border-color:var(--warn);background:var(--warn-soft);padding:8px 12px;">🔶 นี่คือการลาย้อนหลัง — กรุณาระบุเหตุผล</div>` : '';
  document.getElementById('lvReasonRequired').style.display = isBackdated ? 'inline' : 'none';
}
function statusBadge(s){
  if(s==='Approved') return '<span class="badge badge-success">อนุมัติ</span>';
  if(s==='InProgress') return '<span class="badge badge-warn">รออนุมัติ</span>';
  if(s==='Rejected') return '<span class="badge badge-danger">ปฏิเสธ</span>';
  if(s==='Cancelled') return '<span class="badge badge-neutral">ยกเลิก</span>';
  return `<span class="badge badge-neutral">${s||''}</span>`;
}
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function submitLeave(){
  const btn = document.getElementById('lvSubmitBtn');
  if (btn.disabled) return; // [PART 5] กัน double-submit ถ้ากำลังส่งอยู่แล้ว
  const type = document.getElementById('lvType').value.trim();
  const start = document.getElementById('lvStart').value;
  const end = document.getElementById('lvEnd').value;
  const startPart = document.getElementById('lvStartPart').value;
  const endPart = document.getElementById('lvEndPart').value;
  const reason = document.getElementById('lvReason').value.trim();
  const cover = document.getElementById('lvCover').value.trim();
  const fileInput = document.getElementById('lvFile');
  const msg = document.getElementById('lvMsg');
  if(!type || !start || !end){ msg.textContent='กรุณากรอกข้อมูลให้ครบ'; return; }
  const days = calcLeaveDays(start, startPart, end, endPart);
  if (days <= 0) { msg.textContent = 'ช่วงวันที่ไม่ถูกต้อง (วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม)'; return; }
  const isBackdated = new Date(start) < new Date(todayStr());
  if (isBackdated && !reason) { msg.textContent = 'กรุณาระบุเหตุผลลาย้อนหลัง (จำเป็น)'; return; }
  btn.disabled = true; btn.style.opacity = '0.6';
  msg.textContent = 'กำลังส่งคำขอ...';
  try {
    let fileUrl = '';
    if (fileInput.files[0]) {
      msg.textContent = 'กำลังอัปโหลดไฟล์แนบ...';
      const b64 = await fileToBase64(fileInput.files[0]);
      const up = await callGs('uploadFile', { fileName: fileInput.files[0].name, mimeType: fileInput.files[0].type, base64Data: b64 });
      fileUrl = up.url;
    }
    msg.textContent = 'กำลังส่งคำขอ...';
    await callGs('save', { sheetName:'Leave_Request', row:{
      'ประเภทลา':type, 'วันที่เริ่มลา':start, 'วันที่สิ้นสุด':end, 'จำนวนวัน':days, 'เหตุผล':reason, 'ผู้รับผิดชอบงานแทน':cover,
      'ช่วงวันแรก':startPart, 'ช่วงวันสุดท้าย':endPart, 'RequestDateTime': new Date().toISOString(), 'แนบไฟล์': fileUrl
    }});
    toast('ส่งคำขอลาเรียบร้อย'); renderLeave();
  } catch(e){ msg.textContent = e.message; btn.disabled = false; btn.style.opacity = '1'; }
}
async function cancelReq(sheetName, recordId){
  if(!confirm('ยืนยันยกเลิกคำขอนี้?')) return;
  try { await callGs('cancelRequest', {sheetName, recordId}); toast('ยกเลิกเรียบร้อย'); go(state.page); }
  catch(e){ toast(e.message, true); }
}

// =========================================================
// สิทธิ์วันลาคงเหลือ (Opening Leave Balance) — System Admin เท่านั้น
// กรอกครั้งเดียวตอนเริ่มระบบปีแรก ปีถัดไปคำนวณอัตโนมัติจากกฎ LeaveEntitlementRule (ไม่ต้องกรอกซ้ำ)
// =========================================================
async function renderLeaveBalanceAdmin(){
  if (!state._lbYear) state._lbYear = new Date().getFullYear();
  document.getElementById('content').innerHTML = `
    <div class="card mb-2" style="border-color:var(--info);background:var(--info-soft);">
      <b>ℹ️ วิธีใช้:</b> กรอก "สิทธิ์ทั้งปี" และ "ใช้ไปก่อนเริ่มระบบ" ของพนักงานแต่ละคนสำหรับปีแรกที่เริ่มใช้งาน — ระบบจะคำนวณ Opening Balance ให้อัตโนมัติ (สิทธิ์ทั้งปี − ใช้ไปก่อนเริ่มระบบ) หลังจากนั้นทุกใบลาที่อนุมัติจะหักจากยอดนี้ทันที
      <br>ปีถัดไปที่ <u>ไม่ได้กรอกในหน้านี้</u> ระบบจะคำนวณสิทธิ์ให้อัตโนมัติจากอายุงาน (LeaveEntitlementRule) เอง ไม่ต้องกรอกซ้ำทุกปี
    </div>
    <div class="field mb-2" style="max-width:200px;"><label>ปี (ค.ศ.)</label><input type="number" id="lbYear" value="${state._lbYear}" onchange="state._lbYear=Number(this.value); renderLeaveBalanceAdmin();"></div>
    <div id="lbTableArea"><div class="helper">กำลังโหลด...</div></div>
  `;
  await loadLeaveBalanceTable();
}
async function loadLeaveBalanceTable(){
  const area = document.getElementById('lbTableArea');
  try {
    const res = await callGs('getLeaveBalanceOverview', { params:{ year: state._lbYear } });
    state._lbList = res.list;
    area.innerHTML = `
      <div class="card" style="padding:0;overflow:auto;">
        <table>
          <thead><tr><th>พนักงาน</th><th>แผนก</th><th>สิทธิ์ทั้งปี</th><th>ใช้ไปก่อนเริ่มระบบ</th><th>Opening Balance</th><th>ใช้ในระบบปีนี้</th><th>คงเหลือปัจจุบัน</th><th>ที่มา</th><th></th></tr></thead>
          <tbody>
            ${res.list.map((r,i)=>`
              <tr>
                <td>${getEmployeeDisplayWithId(r.employeeId)}</td>
                <td>${r.department||''}</td>
                <td>${r.isSet? r.annualEntitlement : '<span class="text-muted">ยังไม่ตั้งค่า</span>'}</td>
                <td>${r.isSet? r.usedBeforeSystem : '—'}</td>
                <td>${r.isSet? r.openingBalance : '—'}</td>
                <td>${r.usedInSystem}</td>
                <td><b style="color:var(--accent)">${r.isSet? r.currentBalance : '—'}</b></td>
                <td>${r.isSet? `<span class="badge badge-neutral">${r.openingNote||'—'}</span>` : '—'}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="openLeaveBalanceEdit(${i})">${r.isSet?'แก้ไข':'ตั้งค่า'}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch(err){ area.innerHTML = `<div class="card"><div class="helper">${err.message}</div></div>`; }
}
function openLeaveBalanceEdit(idx){
  const r = state._lbList[idx];
  // [PART B] Admin เลือกได้เฉพาะ 2 ค่านี้ — Auto-Generated/Carry Forward สงวนไว้ให้ระบบเขียนเองเท่านั้น (กันคำนวณทับ Admin-controlled โดยไม่ตั้งใจ)
  const noteOptions = ['Opening Balance','Admin Adjustment'];
  const currentNote = r.isSet ? (r.openingNote || 'Opening Balance') : 'Opening Balance';
  modal(`
    <h2 class="mb-2">สิทธิ์วันลาพักร้อน — ${getEmployeeDisplayWithId(r.employeeId)} ปี ${r.year}</h2>
    <div class="field-grid">
      <div class="field field-wide"><label>สิทธิ์ทั้งปี (วัน)</label><input type="number" id="lbEntitlement" value="${r.isSet? r.annualEntitlement : 0}" step="0.5" oninput="updateOpeningPreview()"></div>
      <div class="field field-wide"><label>ใช้ไปก่อนเริ่มระบบ (วัน)</label><input type="number" id="lbUsedBefore" value="${r.isSet? r.usedBeforeSystem : 0}" step="0.5" oninput="updateOpeningPreview()"></div>
      <div class="field field-wide"><label>ที่มา (บันทึกไว้ตรวจสอบย้อนหลัง)</label><select id="lbNote">
        ${noteOptions.map(n=>`<option value="${n}" ${currentNote===n?'selected':''}>${n}</option>`).join('')}
      </select></div>
    </div>
    <div class="stat mb-1" style="text-align:center;padding:12px;">
      <div class="stat-label">Opening Balance (คำนวณอัตโนมัติ = สิทธิ์ทั้งปี − ใช้ไปก่อนเริ่มระบบ)</div>
      <div class="stat-value" id="lbOpeningPreview" style="color:var(--accent)">${r.isSet? r.openingBalance : 0}<span class="stat-unit">วัน</span></div>
    </div>
    <div class="small text-muted mb-1" id="lbEditMsg"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-accent" onclick="saveLeaveBalanceEdit(${idx})">บันทึก</button>
    </div>
  `);
}
function updateOpeningPreview(){
  const ent = Number(document.getElementById('lbEntitlement').value)||0;
  const used = Number(document.getElementById('lbUsedBefore').value)||0;
  document.getElementById('lbOpeningPreview').innerHTML = `${ent-used}<span class="stat-unit">วัน</span>`;
}
async function saveLeaveBalanceEdit(idx){
  const r = state._lbList[idx];
  const entitlement = Number(document.getElementById('lbEntitlement').value)||0;
  const usedBefore = Number(document.getElementById('lbUsedBefore').value)||0;
  const note = document.getElementById('lbNote').value;
  const msg = document.getElementById('lbEditMsg');
  msg.textContent = 'กำลังบันทึก...';
  try {
    const row = {
      EmployeeID: r.employeeId, LeaveType: 'ลาพักร้อน', Year: r.year,
      Entitlement: entitlement, OpeningBalance: entitlement - usedBefore, UsedBeforeSystem: usedBefore, OpeningNote: note
    };
    if (r.recordId) row.RecordID = r.recordId;
    await callGs('save', { sheetName:'Leave_Balance', row });
    closeModal(); toast('บันทึกเรียบร้อย'); loadLeaveBalanceTable();
  } catch(err){ msg.textContent = err.message; }
}

// =========================================================
// OT
// =========================================================
async function renderOT(){
  const rows = await callGs('list', { sheetName:'OT' });
  document.getElementById('content').innerHTML = `
    <div class="grid grid-2">
      <div class="card mb-2">
        <div class="card-title">ส่งคำขอ OT</div>
        <div class="field"><label>วันที่ทำ OT</label><input type="date" id="otDate" value="${todayStr()}"></div>
        <div class="field"><label>จำนวนชั่วโมง</label><input type="number" id="otHours" value="2" step="0.5" min="0.5"></div>
        <div class="field"><label>เหตุผล</label><textarea id="otReason" rows="2"></textarea></div>
        <button class="btn btn-accent" style="width:100%;justify-content:center;" onclick="submitOT()">ส่งคำขอ OT</button>
        <div class="small text-muted mt-1" id="otMsg"></div>
      </div>
      <div class="card mb-2">
        <div class="card-title">รายการ OT ของฉัน <span class="hint">${rows.length} รายการ</span></div>
        <table><thead><tr><th>วันที่</th><th>ชั่วโมง</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${rows.length? rows.slice().reverse().map(r=>`
          <tr><td>${fmt(r['วันที่'])}</td><td>${r['ชั่วโมง']||0} ชม.</td><td>${statusBadge(r.Status)}</td>
          <td>${r.Status==='InProgress'?`<button class="btn btn-danger btn-sm" onclick="cancelReq('OT','${r.RecordID}')">ยกเลิก</button>`:''}</td></tr>
        `).join('') : '<tr><td colspan="4"><div class="helper">ยังไม่มีรายการ</div></td></tr>'}</tbody></table>
      </div>
    </div>
  `;
}
async function submitOT(){
  const date = document.getElementById('otDate').value;
  const hours = parseFloat(document.getElementById('otHours').value);
  const reason = document.getElementById('otReason').value.trim();
  const msg = document.getElementById('otMsg');
  if(!date || !hours || hours<=0){ msg.textContent='กรุณากรอกข้อมูลให้ถูกต้อง'; return; }
  msg.textContent = 'กำลังส่งคำขอ...';
  try {
    await callGs('save', { sheetName:'OT', row:{ 'วันที่':date, 'ชั่วโมง':hours, 'เหตุผล':reason }});
    toast('ส่งคำขอ OT เรียบร้อย'); renderOT();
  } catch(e){ msg.textContent = e.message; }
}

// =========================================================
// SALES KPI
// =========================================================
async function renderSalesKpi(){
  const perm = state.user.permissions || {};
  const isExec = perm.IsSystemAdmin || perm.VisibilityScope === 'All';
  if (isExec) { await renderSalesKpiExecutive(); return; }

  const rows = await callGs('list', { sheetName:'Sales KPI' });
  const now = new Date();
  document.getElementById('content').innerHTML = `
    <div class="grid grid-2">
      <div class="card mb-2">
        <div class="card-title">กรอก Sales KPI ประจำสัปดาห์</div>
        <div class="field-grid">
          <div class="field"><label>ปี</label><input type="number" id="skYear" value="${now.getFullYear()}"></div>
          <div class="field"><label>เดือน</label><input type="number" id="skMonth" value="${now.getMonth()+1}" min="1" max="12"></div>
          <div class="field field-wide"><label>สัปดาห์ (เช่น 2026-W31)</label><input id="skWeek"></div>
          <div class="field"><label>ลูกค้าใหม่</label><input type="number" id="skNew" value="0"></div>
          <div class="field"><label>ลูกค้าเก่า</label><input type="number" id="skOld" value="0"></div>
          <div class="field"><label>โทรติดตาม</label><input type="number" id="skCalls" value="0"></div>
          <div class="field"><label>เข้าพบ</label><input type="number" id="skVisits" value="0"></div>
          <div class="field"><label>ใบเสนอราคา</label><input type="number" id="skQuotes" value="0"></div>
          <div class="field"><label>ปิดการขาย</label><input type="number" id="skCloses" value="0"></div>
          <div class="field"><label>ยอดขาย (บาท)</label><input type="number" id="skSales" value="0"></div>
          <div class="field"><label>กำไร %</label><input type="number" id="skProfit" value="0" step="0.1"></div>
        </div>
        <button class="btn btn-accent" style="width:100%;justify-content:center;" onclick="submitSalesKpi()">บันทึก KPI</button>
        <div class="small text-muted mt-1" id="skMsg"></div>
      </div>
      <div class="card mb-2">
        <div class="card-title">ประวัติของฉัน <span class="hint">${rows.length} รายการ</span></div>
        <table><thead><tr><th>สัปดาห์</th><th>ยอดขาย</th><th>ปิดการขาย</th></tr></thead>
        <tbody>${rows.length? rows.slice().reverse().map(r=>`<tr><td>${r.Week||''}</td><td>฿${fmtMoney(r['ยอดขาย'])}</td><td>${r['ปิดการขาย']||0}</td></tr>`).join('') : '<tr><td colspan="3"><div class="helper">ยังไม่มีข้อมูล</div></td></tr>'}</tbody></table>
      </div>
    </div>
  `;
}
async function submitSalesKpi(){
  const msg = document.getElementById('skMsg');
  const row = {
    Year: document.getElementById('skYear').value, Month: document.getElementById('skMonth').value, Week: document.getElementById('skWeek').value,
    'ลูกค้าใหม่': document.getElementById('skNew').value, 'ลูกค้าเก่า': document.getElementById('skOld').value,
    'โทรติดตาม': document.getElementById('skCalls').value, 'เข้าพบ': document.getElementById('skVisits').value,
    'ใบเสนอราคา': document.getElementById('skQuotes').value, 'ปิดการขาย': document.getElementById('skCloses').value,
    'ยอดขาย': document.getElementById('skSales').value, 'กำไร%': document.getElementById('skProfit').value
  };
  if(!row.Week){ msg.textContent='กรุณาระบุสัปดาห์'; return; }
  msg.textContent = 'กำลังบันทึก...';
  try { await callGs('save', {sheetName:'Sales KPI', row}); toast('บันทึก KPI เรียบร้อย'); renderSalesKpi(); }
  catch(e){ msg.textContent = e.message; }
}

async function renderSalesKpiExecutive(){
  const now = new Date();
  const periodValue = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const data = await callGs('getExecutiveDashboard', { params:{ periodType:'month', periodValue } });
  document.getElementById('content').innerHTML = `
    <div class="grid grid-4 mb-3">
      <div class="stat"><div class="stat-label">ยอดขายเดือนนี้</div><div class="stat-value">฿${fmtMoney(data.current.sales)}</div><div class="small text-muted">${data.comparison.sales>=0?'▲':'▼'} ${Math.abs(data.comparison.sales)}% จากเดือนก่อน</div></div>
      <div class="stat"><div class="stat-label">เป้าหมาย</div><div class="stat-value">${data.targetPct!=null?data.targetPct+'%':'—'}</div></div>
      <div class="stat"><div class="stat-label">ปิดการขาย</div><div class="stat-value">${data.current.closes}</div></div>
      <div class="stat"><div class="stat-label">กำไรเฉลี่ย</div><div class="stat-value">${data.current.profitPct}%</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card mb-2"><div class="card-title">แนวโน้มยอดขาย 12 เดือน</div><div class="chart-wrap"><canvas id="skTrend"></canvas></div></div>
      <div class="card mb-2">
        <div class="card-title">Top Sales เดือนนี้</div>
        <table><thead><tr><th>#</th><th>พนักงาน</th><th>ยอดขาย</th></tr></thead>
        <tbody>${data.ranking.map((r,i)=>`<tr><td>${i+1}</td><td>${getEmployeeDisplayName(r.employeeId)}</td><td>฿${fmtMoney(r.sales)}</td></tr>`).join('')}</tbody></table>
      </div>
    </div>
  `;
  state.charts.skTrend = new Chart(document.getElementById('skTrend'), {
    type:'line',
    data:{ labels:data.trend.map(t=>t.month), datasets:[{ data:data.trend.map(t=>t.sales), borderColor:'#00A693', backgroundColor:'rgba(0,166,147,0.1)', fill:true, tension:0.3 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
  });
}

// =========================================================
// PAYROLL
// =========================================================
async function renderPayroll(){
  const now = new Date();
  const yearMonth = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const p = await callGs('getPayroll', { yearMonth });
  const monthLabel = now.toLocaleDateString('th-TH',{month:'long',year:'numeric'});
  document.getElementById('content').innerHTML = `
    <div class="card" style="max-width:600px;">
      <div class="card-title">สลิปเงินเดือน <span class="hint">${monthLabel}</span></div>
      <div class="small text-muted mb-1">${getEmployeeDisplayWithId(p.employeeId)}</div>
      ${p.base<=0? '<div class="helper">ยังไม่ได้ตั้งเงินเดือนพื้นฐานในชีต Employee (คอลัมน์ "เงินเดือน") กรุณาแจ้ง Admin</div>' : `
      <table>
        <tr><td>เงินเดือนพื้นฐาน</td><td style="text-align:right;">฿${fmtMoney(p.base)}</td></tr>
        <tr><td>OT (${p.otHours} ชม. อนุมัติแล้ว)</td><td style="text-align:right;">฿${fmtMoney(p.otPay)}</td></tr>
        <tr><td><b>รวมรายรับ</b></td><td style="text-align:right;"><b>฿${fmtMoney(p.gross)}</b></td></tr>
        <tr><td style="color:var(--danger)">ประกันสังคม (5%)</td><td style="text-align:right;color:var(--danger)">−฿${fmtMoney(p.sso)}</td></tr>
        <tr><td style="color:var(--danger)">ภาษีหัก ณ ที่จ่าย</td><td style="text-align:right;color:var(--danger)">−฿${fmtMoney(p.tax)}</td></tr>
        <tr><td style="color:var(--danger)">หักมาสาย (${p.lateCount} ครั้ง)</td><td style="text-align:right;color:var(--danger)">−฿${fmtMoney(p.lateDeduction)}</td></tr>
        <tr><td style="color:var(--danger)">หักเบี้ยขยัน (ลา ${p.leaveDays} วัน)</td><td style="text-align:right;color:var(--danger)">−฿${fmtMoney(p.leaveDeduction)}</td></tr>
        <tr><td style="padding-top:14px;font-family:'Kanit';font-size:18px;"><b>เงินสุทธิ</b></td><td style="text-align:right;padding-top:14px;font-family:'Kanit';font-size:18px;color:var(--accent);"><b>฿${fmtMoney(p.net)}</b></td></tr>
      </table>`}
    </div>
  `;
}

// =========================================================
// POINTS & REWARDS
// =========================================================
async function renderPoints(){
  const perm = state.user.permissions || {};
  const [my, suggestions] = await Promise.all([
    callGs('getMyPoints', {}),
    perm.IsSystemAdmin ? callGs('getRewardSuggestions',{}).catch(()=>({suggestions:[]})) : Promise.resolve(null)
  ]);
  let adminHtml = '';
  if (perm.IsSystemAdmin) {
    const pendingRedemptions = await callGs('list', { sheetName:'Redemption' }).catch(()=>[]);
    const pending = pendingRedemptions.filter(r=>r.Status==='Requested');
    adminHtml = `
      <div class="card mb-2">
        <div class="card-title">🎯 ข้อเสนอรางวัลอัตโนมัติ (Admin)</div>
        ${suggestions.suggestions.length ? suggestions.suggestions.map(s=>`
          <div class="small mb-1" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--line-soft);border-radius:8px;">
            <span>${getEmployeeDisplayName(s.employeeId)} — ${s.totalPoints} แต้ม → ${s.rewardName} (${s.rewardAmount})</span>
            <button class="btn btn-accent btn-sm" onclick="approveSuggestion('${s.employeeId}','${s.rewardName.replace(/'/g,"\\'")}',${s.rewardAmount})">อนุมัติ</button>
          </div>`).join('') : '<div class="helper">ไม่มีข้อเสนอ</div>'}
      </div>
      <div class="card mb-2">
        <div class="card-title">📦 คำขอแลกของรางวัลที่รอส่งมอบ</div>
        ${pending.length? pending.map(p=>`
          <div class="small mb-1" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--line-soft);border-radius:8px;">
            <span>${getEmployeeDisplayName(p.EmployeeID)} — ${p.ItemName} (${p.PointsCost} แต้ม)</span>
            <button class="btn btn-accent btn-sm" onclick="fulfillRedemptionBtn('${p.RecordID}')">ยืนยันส่งแล้ว</button>
          </div>`).join('') : '<div class="helper">ไม่มีคำขอค้าง</div>'}
      </div>
    `;
  }
  document.getElementById('content').innerHTML = `
    <div class="grid grid-2">
      <div class="card mb-2">
        <div class="points-balance"><div class="stat-label">แต้มคงเหลือของฉัน</div><div class="num">${my.balance}</div><div class="small text-muted">สะสม ${my.totalEarned} · ใช้ไป ${my.totalRedeemed}</div></div>
        <div class="card-title mt-2">🎁 แคตตาล็อกของรางวัล</div>
        ${my.catalog.length? my.catalog.map(c=>`
          <div class="catalog-item"><span>${c.ItemName} <span class="text-muted small">(${c.PointsCost} แต้ม)</span></span>
          <button class="btn btn-ghost btn-sm" onclick="redeem('${c.ItemName.replace(/'/g,"\\'")}')" ${my.balance<Number(c.PointsCost)?'disabled':''}>แลก</button></div>
        `).join('') : '<div class="helper">ยังไม่มีของรางวัลในแคตตาล็อก</div>'}
      </div>
      <div class="card mb-2">
        <div class="card-title">ประวัติคะแนนล่าสุด</div>
        ${my.recentLog.length? my.recentLog.map(l=>`<div class="small mb-1">+${l.Points} — ${l.Reason||''} <span class="text-muted">(${fmt(l.Date)})</span></div>`).join('') : '<div class="helper">ยังไม่มีประวัติ</div>'}
        <div class="card-title mt-2">การแลกของฉัน</div>
        ${my.myRedemptions.length? my.myRedemptions.map(r=>`<div class="small mb-1">${r.ItemName} — ${statusRedeemBadge(r.Status)}</div>`).join('') : '<div class="helper">ยังไม่มีการแลก</div>'}
      </div>
    </div>
    ${adminHtml}
  `;
}
function statusRedeemBadge(s){
  if(s==='Fulfilled') return '<span class="badge badge-success">ได้รับแล้ว</span>';
  if(s==='Requested') return '<span class="badge badge-warn">รอส่งมอบ</span>';
  return `<span class="badge badge-neutral">${s||''}</span>`;
}
async function redeem(itemName){
  if(!confirm('ยืนยันแลกของรางวัลนี้?')) return;
  try { await callGs('redeemReward', { itemName }); toast('ส่งคำขอแลกของรางวัลเรียบร้อย'); renderPoints(); }
  catch(e){ toast(e.message, true); }
}
async function approveSuggestion(employeeId, rewardName, rewardAmount){
  try { await callGs('approveRewardSuggestion', { employeeId, rewardName, rewardAmount }); toast('อนุมัติรางวัลเรียบร้อย'); renderPoints(); }
  catch(e){ toast(e.message, true); }
}
async function fulfillRedemptionBtn(recordId){
  try { await callGs('fulfillRedemption', { recordId }); toast('ยืนยันส่งมอบเรียบร้อย'); renderPoints(); }
  catch(e){ toast(e.message, true); }
}

// =========================================================
// EXECUTIVE DASHBOARD
// =========================================================
// [ย้ายจาก Executive Dashboard เดิม — Logic/Query/Chart เหมือนเดิม 100% ไม่แก้อะไรเลย แค่ย้ายมาอยู่ในแท็บ "บุคลากร" โหมดภาพรวมบริษัท]
async function renderCompanyOverviewInto(containerId, yearMonth){
  Object.values(state.charts).forEach(c=>{ try{c.destroy();}catch(e){} });
  state.charts = {};
  const area = document.getElementById(containerId);
  area.innerHTML = skeleton(4,0) + skeleton(4,2);
  try {
    const s = await callGs('getAttendanceExecutiveSummary', { params:{ yearMonth } });
    const trendLabels = s.trend.map(t=>t.month);
    const bucketE = Object.entries(s.timeBuckets);
    // [Standardize Leave Type] RULE 1: Dashboard ต้องไม่แยก "พักร้อน"/"ลาพักร้อน" หรือ "ลาป่วย" เดิม/ใหม่เป็นคนละแท่งกราฟ — รวมตาม Canonical Type ฝั่ง Frontend (ไม่แตะ Backend getAttendanceExecutiveSummary())
    const leaveTypeBreakdownMerged = {};
    Object.entries(s.leaveTypeBreakdown).forEach(([t,c])=>{ const key=normalizeLeaveTypeLabel(t); leaveTypeBreakdownMerged[key]=(leaveTypeBreakdownMerged[key]||0)+Number(c||0); });
    const leaveTypeE = Object.entries(leaveTypeBreakdownMerged);
    const arrow = (v)=> v>=0 ? `↑ ${v}%` : `↓ ${Math.abs(v)}%`;
    const kpi = (grad, icon, label, value, unit, sub) => `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:${grad}">${icon}</div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}<span class="kpi-unit">${unit||''}</span></div>
        ${sub?`<div class="kpi-sub">${sub}</div>`:''}
      </div>`;

    area.innerHTML = `
      <div class="mgrid">
        <div class="mg-3">${kpi('var(--gradient-teal)','👥','พนักงานทั้งหมด',s.totalEmployees,'คน')}</div>
        <div class="mg-3">${kpi('var(--gradient-pink)','🔴','ขาดงาน',s.absentCount,'ครั้ง',arrow(s.absentChange)+' เทียบเดือนก่อน')}</div>
        <div class="mg-3">${kpi('var(--gradient-green)','🌴','ลางาน',s.leaveCount,'ครั้ง',arrow(s.leaveChange)+' เทียบเดือนก่อน')}</div>
        <div class="mg-3">${kpi('var(--gradient-yellow)','⏰','มาสาย',s.lateCount,'ครั้ง',arrow(s.lateChange)+' เทียบเดือนก่อน')}</div>
      </div>
      <div class="mgrid">
        <div class="mg-8">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">แนวโน้มการขาด ลา มาสาย</div><div class="s">ย้อนหลัง 6 เดือน</div></div></div>
            <div class="chart-wrap" style="height:250px;"><canvas id="execTrend"></canvas></div>
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">สัดส่วนขาด ลา มาสาย</div></div></div>
            <div class="chart-wrap" style="height:200px;"><canvas id="execRatio"></canvas></div>
            <div class="stat-value" style="text-align:center;font-size:26px;margin-top:6px;">${s.rate}%</div>
            <div class="small text-muted" style="text-align:center;">อัตรารวม</div>
          </div>
        </div>
      </div>
      <div class="mgrid">
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">มาสายแยกตามช่วงเวลา</div></div></div>
            <div class="chart-wrap" style="height:170px;"><canvas id="execBucket"></canvas></div>
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">ประเภทการลา</div></div></div>
            <div class="chart-wrap" style="height:170px;"><canvas id="execLeaveType"></canvas></div>
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">🏆 มาสายสูงสุด (Top 5)</div></div></div>
            ${s.top5.length? rankingListHtml(s.top5.map(e=>({employeeId:e.employeeId, label:getEmployeeDisplayName(e.employeeId), value:e.lateCount, valueLabel:e.lateCount+' ครั้ง', subLabel:e.department||'', onclick:`openEmployeeProfile('${e.employeeId}')`})), 5) : emptyState('✅','ไม่มีข้อมูลมาสาย')}
          </div>
        </div>
      </div>
      <div class="mgrid">
        <div class="mg-12">
          <div class="card">
            <div class="chart-card-head"><div><div class="t">สถิติแยกตามแผนก</div></div></div>
            ${s.byDepartment.length? `<table><thead><tr><th>แผนก</th><th>มาสาย(ครั้ง)</th><th>นาทีสายรวม</th></tr></thead>
            <tbody>${s.byDepartment.map(d=>`<tr><td>${d.department}</td><td>${d.lateCount}</td><td>${d.lateMinutes}</td></tr>`).join('')}</tbody></table>` : emptyState('📭','ไม่มีข้อมูล')}
          </div>
        </div>
      </div>
    `;

    state.charts.execTrend = new Chart(document.getElementById('execTrend'), {
      type:'line',
      data:{ labels:trendLabels, datasets:[
        { label:'ขาดงาน', data:s.trend.map(t=>t.absent), borderColor:'#F0559E', backgroundColor:crmGradient('execTrend','rgba(240,85,158,0.2)','rgba(240,85,158,0.01)'), fill:true, tension:0.4, pointRadius:2.5, borderWidth:2.2 },
        { label:'ลางาน', data:s.trend.map(t=>t.leave), borderColor:'#3EBD6A', backgroundColor:crmGradient('execTrend','rgba(62,189,106,0.18)','rgba(62,189,106,0.01)'), fill:true, tension:0.4, pointRadius:2.5, borderWidth:2.2 },
        { label:'มาสาย', data:s.trend.map(t=>t.late), borderColor:'#F5A524', backgroundColor:crmGradient('execTrend','rgba(245,165,36,0.18)','rgba(245,165,36,0.01)'), fill:true, tension:0.4, pointRadius:2.5, borderWidth:2.2 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{boxWidth:9,font:{size:10},usePointStyle:true} } }, scales:{ y:{grid:{color:'rgba(32,35,46,0.05)'},ticks:{font:{size:10}}}, x:{grid:{display:false},ticks:{font:{size:10}}} } }
    });
    state.charts.execRatio = new Chart(document.getElementById('execRatio'), {
      type:'doughnut',
      data:{ labels:['ขาดงาน','ลางาน','มาสาย'], datasets:[{ data:[s.absentCount,s.leaveCount,s.lateCount], backgroundColor:['#F0559E','#3EBD6A','#F5A524'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{legend:{position:'bottom',labels:{boxWidth:8,font:{size:9}}}} }
    });
    state.charts.execBucket = new Chart(document.getElementById('execBucket'), {
      type:'bar',
      data:{ labels:bucketE.map(e=>e[0]), datasets:[{ data:bucketE.map(e=>e[1]), backgroundColor:'#7C5CFC', borderRadius:8, maxBarThickness:28 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{grid:{color:'rgba(32,35,46,0.05)'}}, x:{grid:{display:false}} } }
    });
    state.charts.execLeaveType = new Chart(document.getElementById('execLeaveType'), {
      type:'bar',
      data:{ labels:leaveTypeE.map(e=>e[0]), datasets:[{ data:leaveTypeE.map(e=>e[1]), backgroundColor:'#17B6C4', borderRadius:8, maxBarThickness:20 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(32,35,46,0.05)'}}, y:{grid:{display:false}} } }
    });
  } catch(err){ area.innerHTML = `<div class="card">${emptyState('⚠️',err.message)}</div>`; }
}

// --- โหมดรายบุคคล: ใช้ getEmployeeProfileBundle (คำขอเดียว) + getEmployeeTrend (คำขอเดียว คำนวณ 6 เดือนใน memory) ---
async function renderPersonnelIndividualInto(containerId, employeeId, yearMonth){
  const area = document.getElementById(containerId);
  area.innerHTML = skeleton(4,2);
  if (!employeeId) { area.innerHTML = `<div class="card">${emptyState('👤','กรุณาเลือกพนักงาน')}</div>`; return; }
  Object.values(state.charts).forEach(c=>{ try{c.destroy();}catch(e){} });
  state.charts = {};
  try {
    const bundle = await callGs('getEmployeeProfileBundle', { employeeId });
    const now = new Date();
    const trendMonths = [];
    for (let i=5;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); trendMonths.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); }
    // [ประสิทธิภาพ] เดิม loop เรียก getEmployeeMonthlySummary 6 รอบ (6 คำขอ) เปลี่ยนเป็นเรียก getEmployeeTrend ครั้งเดียว คำนวณ 6 เดือนในคำขอเดียว ผลลัพธ์รูปแบบเดิมทุก field
    const trend = await callGs('getEmployeeTrend', { employeeId, months: trendMonths });
    const emp = bundle.employee;
    const vacBalance = bundle.leaveSummary.balances.find(b=>b.leaveType==='ลาพักร้อน') || {remaining:0,entitlement:0,used:0};
    const thisMonthSummary = bundle.monthlySummary;

    area.innerHTML = `
      <div class="grid grid-4 mb-2">
        <div class="stat ep-clickable" onclick="openEmployeeProfile('${employeeId}')"><div class="stat-label">${getEmployeeDisplayName(emp)} 👤</div><div class="small text-muted mt-1">${emp['ตำแหน่ง']||''} · ${emp['แผนก']||''}</div></div>
        <div class="stat"><div class="stat-label">สิทธิ์ลาคงเหลือ</div><div class="stat-value" style="color:var(--accent)">${vacBalance.remaining}<span class="stat-unit">วัน</span></div></div>
        <div class="stat"><div class="stat-label">Attendance %</div><div class="stat-value">${bundle.attendancePct!=null?bundle.attendancePct+'%':'—'}</div></div>
        <div class="stat"><div class="stat-label">Risk Score</div><div class="stat-value" style="color:${bundle.risk&&bundle.risk.level==='High'?'var(--danger)':bundle.risk&&bundle.risk.level==='Medium'?'var(--warn)':'var(--success)'}">${bundle.risk? bundle.risk.level : '—'}</div></div>
      </div>
      <div class="grid grid-4 mb-3">
        <div class="stat"><div class="stat-label">มาสายเดือนนี้</div><div class="stat-value" style="color:var(--warn)">${thisMonthSummary.lateCount}<span class="stat-unit">ครั้ง</span></div></div>
        <div class="stat"><div class="stat-label">ขาดเดือนนี้</div><div class="stat-value" style="color:var(--danger)">${thisMonthSummary.absentCount}<span class="stat-unit">ครั้ง</span></div></div>
        <div class="stat"><div class="stat-label">OT เดือนนี้</div><div class="stat-value">${thisMonthSummary.otHours}<span class="stat-unit">ชม.</span></div></div>
        <div class="stat"><div class="stat-label">ลาปีนี้ (รวมทุกประเภท)</div><div class="stat-value">${bundle.leaveSummary.balances.reduce((s,b)=>s+b.used,0)}<span class="stat-unit">วัน</span></div></div>
      </div>
      <div class="grid grid-2 mb-3">
        <div class="card"><div class="card-title">แนวโน้มการลา / มาสาย / ขาด (6 เดือน)</div><div class="chart-wrap"><canvas id="pTrend1"></canvas></div></div>
        <div class="card"><div class="card-title">แนวโน้ม OT (6 เดือน)</div><div class="chart-wrap"><canvas id="pTrend2"></canvas></div></div>
      </div>
      <div class="card mb-2">
        <div class="card-title">ประวัติการลา <span class="hint">${bundle.leaveHistory.length} รายการ</span></div>
        <table><thead><tr><th>ประเภท</th><th>วันที่</th><th>จำนวน</th><th>สถานะ</th></tr></thead>
        <tbody>${bundle.leaveHistory.length? bundle.leaveHistory.slice(0,15).map(r=>`<tr><td>${normalizeLeaveTypeLabel(r['ประเภทลา'])}</td><td>${fmt(r['วันที่เริ่มลา'])}</td><td>${r['จำนวนวัน']||0} วัน</td><td>${statusBadge(r.Status)}</td></tr>`).join('') : '<tr><td colspan="4"><div class="helper">ไม่มีข้อมูล</div></td></tr>'}</tbody></table>
      </div>
    `;
    state.charts.pTrend1 = new Chart(document.getElementById('pTrend1'), {
      type:'line',
      data:{ labels:trend.map(t=>t.month), datasets:[
        { label:'ลา (วัน)', data:trend.map(t=>t.leave), borderColor:'#10B981', backgroundColor:'transparent', tension:0.3 },
        { label:'มาสาย (ครั้ง)', data:trend.map(t=>t.late), borderColor:'#F59E0B', backgroundColor:'transparent', tension:0.3 },
        { label:'ขาด (ครั้ง)', data:trend.map(t=>t.absent), borderColor:'#EF4444', backgroundColor:'transparent', tension:0.3 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}} } }
    });
    state.charts.pTrend2 = new Chart(document.getElementById('pTrend2'), {
      type:'bar',
      data:{ labels:trend.map(t=>t.month), datasets:[{ label:'OT (ชม.)', data:trend.map(t=>t.ot), backgroundColor:'#FF7A1A' }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });
  } catch(err){ area.innerHTML = `<div class="card">${emptyState('⚠️',err.message)}</div>`; }
}

// =========================================================
// [Business Performance] Sales / Online / Executive Dashboard — Read Only ล้วนๆ ห้ามแก้ไขข้อมูลจากตรงนี้
// =========================================================
async function renderSalesPerformanceInto(containerId, yearMonth){
  Object.values(state.charts).forEach(c=>{ try{c.destroy();}catch(e){} });
  const area = document.getElementById(containerId);
  area.innerHTML = skeleton(4,0) + skeleton(4,2);
  try {
    const data = await callGs('getExecutiveDashboard', { params:{ periodType:'month', periodValue: yearMonth } });
    state._spRanking = data.ranking;
    const kpi = (grad, icon, label, value, unit, sub, onclick) => `
      <div class="kpi-card${onclick?' kpi-drill':''}" ${onclick?`onclick="${onclick}"`:''}>
        <div class="kpi-icon" style="background:${grad}">${icon}</div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}<span class="kpi-unit">${unit||''}</span></div>
        ${sub?`<div class="kpi-sub">${sub}</div>`:''}
      </div>`;
    area.innerHTML = `
      <div class="mgrid">
        <div class="mg-3">${kpi('var(--gradient-orange)','📈','ยอดขายรวม','฿'+fmtMoney(data.current.sales),'','', `openDrillDown('Ranking ยอดขาย เดือน ${yearMonth}',[{label:'อันดับ',render:(r,i)=>i+1},{label:'พนักงาน',render:r=>getEmployeeDisplayName(r.employeeId)},{label:'ยอดขาย',render:r=>'฿'+fmtMoney(r.sales)}], state._spRanking)`)}</div>
        <div class="mg-3">${kpi('var(--gradient-blue)','🎯','เป้าหมาย','฿'+fmtMoney(data.targetSales),'','')}</div>
        <div class="mg-3">${kpi('var(--gradient-teal)','✅','Achievement','',data.targetPct!=null?data.targetPct+'%':'—')}</div>
        <div class="mg-3">${kpi('var(--gradient-pink)','💰','กำไรเฉลี่ย','',data.current.profitPct+'%','อ้างอิงจาก Sales KPI')}</div>
      </div>
      <div class="mgrid">
        <div class="mg-8">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">Sales Trend</div><div class="s">12 เดือนย้อนหลัง</div></div></div>
            <div class="chart-wrap" style="height:260px;"><canvas id="spTrend"></canvas></div>
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">🏆 Ranking</div><div class="s">คลิกเพื่อดูทั้งหมด</div></div></div>
            ${data.ranking.length ? rankingListHtml(data.ranking.map(r=>({employeeId:r.employeeId, label:getEmployeeDisplayName(r.employeeId), value:r.sales, valueLabel:'฿'+fmtMoney(r.sales), onclick:`openEmployeeProfile('${r.employeeId}')`})), 6)
            : emptyState('📈','ยังไม่มีข้อมูลยอดขายเดือนนี้','กรอกยอดขาย',"state._deForm='sales'; go('dataentry');")}
          </div>
        </div>
      </div>
      <div class="mgrid">
        <div class="mg-5">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">Individual & Team Performance</div></div></div>
            <div class="grid grid-2">
              <div class="stat" style="box-shadow:none;padding:12px;"><div class="stat-label">ลูกค้าใหม่ / เก่า</div><div class="stat-value" style="font-size:18px;">${data.current.newCust} / ${data.current.oldCust}</div></div>
              <div class="stat" style="box-shadow:none;padding:12px;"><div class="stat-label">ใบเสนอราคา / ปิดการขาย</div><div class="stat-value" style="font-size:18px;">${data.current.quotes} / ${data.current.closes}</div></div>
              <div class="stat" style="box-shadow:none;padding:12px;grid-column:span 2;"><div class="stat-label">โทรติดตาม / เข้าพบ</div><div class="stat-value" style="font-size:18px;">${data.current.calls} / ${data.current.visits}</div></div>
            </div>
          </div>
        </div>
        <div class="mg-3">
          <div class="card" style="height:100%;display:flex;flex-direction:column;align-items:center;">
            <div class="chart-card-head" style="width:100%;"><div><div class="t">Achievement Progress</div></div></div>
            <div class="chart-wrap" style="height:150px;width:100%;"><canvas id="spGauge"></canvas></div>
            <div class="stat-value" style="font-size:24px;margin-top:-6px;">${data.targetPct!=null?data.targetPct+'%':'—'}</div>
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">Monthly Comparison</div><div class="s">เทียบเดือนก่อน</div></div></div>
            ${['sales','newCust','closes'].map(f=>{
              const labels = {sales:'ยอดขาย', newCust:'ลูกค้าใหม่', closes:'ปิดการขาย'};
              const v = data.comparison[f];
              const up = v>=0;
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-soft);">
                <span class="small">${labels[f]}</span>
                <span class="kpi-trend ${up?'up':'down'}">${up?'↑':'↓'} ${Math.abs(v)}%</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
    state.charts.spTrend = new Chart(document.getElementById('spTrend'), {
      type:'line', data:{ labels:data.trend.map(t=>t.month), datasets:[
        { label:'ยอดขาย', data:data.trend.map(t=>t.sales), borderColor:'#7C5CFC', backgroundColor:crmGradient('spTrend','rgba(124,92,252,0.32)','rgba(124,92,252,0.01)'), fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#7C5CFC', pointBorderColor:'#fff', pointBorderWidth:2, borderWidth:2.5 },
        { label:'เป้าหมาย', data:data.trend.map(()=>data.targetSales||0), borderColor:'#B7C0CC', backgroundColor:'transparent', borderDash:[5,5], borderWidth:1.5, pointRadius:0, tension:0 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:9,font:{size:10},usePointStyle:true}}}, scales:{ y:{grid:{color:'rgba(32,35,46,0.05)'},ticks:{font:{size:10}}}, x:{grid:{display:false},ticks:{font:{size:10}}} } }
    });
    const gaugeEl = document.getElementById('spGauge');
    if (gaugeEl) {
      const pct = Math.min(100, data.targetPct || 0);
      state.charts.spGauge = new Chart(gaugeEl, {
        type:'doughnut',
        data:{ datasets:[{ data:[pct, Math.max(0,100-pct)], backgroundColor:['#F5793B','rgba(245,121,59,0.1)'], borderWidth:0 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'75%', rotation:-90, circumference:180, plugins:{legend:{display:false},tooltip:{enabled:false}} }
      });
    }
  } catch(err){ area.innerHTML = `<div class="card">${emptyState('⚠️',err.message)}</div>`; }
}
async function renderOnlinePerformanceInto(containerId, yearMonth){
  Object.values(state.charts).forEach(c=>{ try{c.destroy();}catch(e){} });
  const area = document.getElementById(containerId);
  area.innerHTML = skeleton(4,0) + skeleton(4,2);
  try {
    const data = await callGs('getSalesExecutiveDashboard', { params:{ periodType:'month', periodValue: yearMonth } });
    const o = data.online;
    const kpi = (grad, icon, label, value, unit, sub) => `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:${grad}">${icon}</div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}<span class="kpi-unit">${unit||''}</span></div>
        ${sub?`<div class="kpi-sub">${sub}</div>`:''}
      </div>`;
    area.innerHTML = `
      <div class="mgrid">
        <div class="mg-3">${kpi('var(--gradient-cyan)','🌐','ยอดขาย Online','฿'+fmtMoney(o.sales),'',o.deptName)}</div>
        <div class="mg-3">${kpi('var(--gradient-blue)','🎯','เป้าทีม','฿'+fmtMoney(o.teamTarget),'')}</div>
        <div class="mg-3">${kpi('var(--gradient-teal)','✅','Achievement ทีม','',o.teamTargetPct!=null?o.teamTargetPct+'%':'—')}</div>
        <div class="mg-3">${kpi('var(--gradient-purple)','📦','จำนวน Platform',o.byPlatform.length,'แพลตฟอร์ม')}</div>
      </div>
      <div class="mgrid">
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">🌐 Platform Sales</div><div class="s">สัดส่วนยอดขาย</div></div></div>
            ${o.byPlatform.length ? `<div class="chart-wrap" style="height:200px;"><canvas id="opDonut"></canvas></div>` : emptyState('🌐','ยังไม่มีข้อมูล','กรอกยอดขายออนไลน์',"state._deForm='online'; go('dataentry');")}
          </div>
        </div>
        <div class="mg-8">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">แนวโน้มยอดขาย</div><div class="s">12 เดือนย้อนหลัง</div></div></div>
            <div class="chart-wrap" style="height:220px;"><canvas id="opTrend"></canvas></div>
          </div>
        </div>
      </div>
      <div class="mgrid">
        <div class="mg-8">
          <div class="card kpi-drill" ${o.byPlatform.length?`onclick='openDrillDown("ยอดขายแยกตาม Platform", [{label:"Platform",key:"platform"},{label:"ยอดขาย",render:r=>"฿"+fmtMoney(r.sales)},{label:"Orders",key:"orders"},{label:"กำไร%",key:"profitPct"}], ${JSON.stringify(o.byPlatform).replace(/'/g,"&#39;")})'`:''}>
            <div class="chart-card-head"><div><div class="t">Platform Ranking</div><div class="s">คลิกเพื่อดูทั้งหมด</div></div></div>
            ${o.byPlatform.length ? `<table><thead><tr><th>Platform</th><th>ยอดขาย</th></tr></thead>
            <tbody>${o.byPlatform.slice(0,6).map(p=>`<tr><td>${p.platform}</td><td>฿${fmtMoney(p.sales)}</td></tr>`).join('')}</tbody></table>`
            : emptyState('🌐','ยังไม่มีข้อมูล')}
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">Online Team Performance</div></div></div>
            ${o.byEmployee.length ? `<table><thead><tr><th>พนักงาน</th><th>Achievement</th></tr></thead>
            <tbody>${o.byEmployee.map(e=>`<tr><td><span class="ep-clickable" onclick="openEmployeeProfile('${e.employeeId}')">${e.name}</span></td><td>${e.targetPct!=null?e.targetPct+'%':'—'}</td></tr>`).join('')}</tbody></table>`
            : emptyState('👥','ยังไม่มีพนักงานในทีมออนไลน์')}
          </div>
        </div>
      </div>
    `;
    if (o.byPlatform.length) {
      const grads = ['#17B6C4','#3E7BFA','#7C5CFC','#0FA98A','#F0559E','#F5A524'];
      state.charts.opDonut = new Chart(document.getElementById('opDonut'), {
        type:'doughnut', data:{ labels:o.byPlatform.map(p=>p.platform), datasets:[{ data:o.byPlatform.map(p=>p.sales), backgroundColor:grads, borderWidth:0 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom',labels:{boxWidth:8,font:{size:9}}}} }
      });
    }
    state.charts.opTrend = new Chart(document.getElementById('opTrend'), {
      type:'line', data:{ labels:o.trend.map(t=>t.month), datasets:[{ label:'ยอดขาย', data:o.trend.map(t=>t.sales), borderColor:'#17B6C4', backgroundColor:crmGradient('opTrend','rgba(23,182,196,0.32)','rgba(23,182,196,0.01)'), fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#17B6C4', pointBorderColor:'#fff', pointBorderWidth:2, borderWidth:2.5 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{grid:{color:'rgba(32,35,46,0.05)'},ticks:{font:{size:10}}}, x:{grid:{display:false},ticks:{font:{size:10}}} } }
    });
  } catch(err){ area.innerHTML = `<div class="card">${emptyState('⚠️',err.message)}</div>`; }
}
async function renderBusinessExecutiveInto(containerId, yearMonth){
  Object.values(state.charts).forEach(c=>{ try{c.destroy();}catch(e){} });
  const area = document.getElementById(containerId);
  area.innerHTML = skeleton(4,0) + skeleton(4,2);
  try {
    const data = await callGs('getBusinessExecutiveDashboard', { params:{ yearMonth } });
    const companyTotal = data.sales.sales + data.online.sales + data.ceoSales;
    const topSalesEmp = data.sales.byEmployee.slice().sort((a,b)=>b.sales-a.sales)[0];
    const kpi = (grad, icon, label, value, unit, sub, onclick) => `
      <div class="kpi-card${onclick?' kpi-drill':''}" ${onclick?`onclick="${onclick}"`:''}>
        <div class="kpi-icon" style="background:${grad}">${icon}</div>
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}<span class="kpi-unit">${unit||''}</span></div>
        ${sub?`<div class="kpi-sub">${sub}</div>`:''}
      </div>`;

    area.innerHTML = `
      <div class="mgrid">
        <div class="mg-3">${kpi('var(--gradient-purple)','🏢','ยอดขายรวมบริษัท','฿'+fmtMoney(companyTotal),'','Sales + Online + CEO')}</div>
        <div class="mg-3">${kpi('var(--gradient-blue)','🎯','Achievement ทีม Sales','',data.sales.teamTargetPct!=null?data.sales.teamTargetPct+'%':'—')}</div>
        <div class="mg-3">${kpi('var(--gradient-orange)','👤','ยอดขาย Sales','฿'+fmtMoney(data.sales.sales),'','ไม่รวม CEO', "state._mrTab='salesperformance'; go('monthlyreport');")}</div>
        <div class="mg-3">${kpi('var(--gradient-cyan)','🌐','ยอดขาย Online','฿'+fmtMoney(data.online.sales),'','', "state._mrTab='onlineperformance'; go('monthlyreport');")}</div>
        <div class="mg-3">${kpi('var(--gradient-pink)','🏢','CEO / Company Sales','฿'+fmtMoney(data.ceoSales),'','แยกจาก Ranking')}</div>
        <div class="mg-3">${kpi('var(--gradient-green)','✨','ลูกค้าใหม่','',data.customerActivity.newCustomer+' ราย')}</div>
        <div class="mg-3">${kpi('var(--gradient-yellow)','📞','Lead / Activity','',data.customerActivity.leadTotal+' Lead', '', "state._mrTab='customerfollowup'; go('monthlyreport');")}</div>
        <div class="mg-3">${kpi('var(--gradient-teal)','👥','พนักงานทั้งหมด',data.workforce.totalEmployees,'คน','ลา '+data.workforce.leaveCount+' · สาย '+data.workforce.lateCount, "go('leave')")}</div>
      </div>

      <div class="mgrid">
        <div class="mg-8">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">Company Sales Trend</div><div class="s">Sales vs Online — 6 เดือนย้อนหลัง</div></div></div>
            <div class="chart-wrap" style="height:260px;"><canvas id="execTrendChart"></canvas></div>
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;display:flex;flex-direction:column;">
            <div class="chart-card-head"><div><div class="t">Sales vs Target</div><div class="s">ทีมขาย เดือนนี้</div></div></div>
            <div class="chart-wrap" style="height:180px;"><canvas id="execGaugeChart"></canvas></div>
            <div style="text-align:center;margin-top:6px;">
              <div class="stat-value" style="font-size:30px;">${data.sales.teamTargetPct!=null?data.sales.teamTargetPct+'%':'—'}</div>
              <div class="small text-muted">฿${fmtMoney(data.sales.sales)} / ฿${fmtMoney(data.sales.teamTarget||0)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="mgrid">
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">🌐 Online Platform Breakdown</div><div class="s">สัดส่วนยอดขายแต่ละ Platform</div></div></div>
            ${data.online.byPlatform.length ? `<div class="chart-wrap" style="height:190px;"><canvas id="execPlatformChart"></canvas></div>` : emptyState('🌐','ยังไม่มีข้อมูล')}
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">📞 Customer Activity</div><div class="s">${yearMonth}</div></div></div>
            <div class="grid grid-2">
              <div class="stat" style="box-shadow:none;padding:12px;"><div class="stat-label">Lead ทั้งหมด</div><div class="stat-value" style="font-size:20px;">${data.customerActivity.leadTotal}</div></div>
              <div class="stat" style="box-shadow:none;padding:12px;"><div class="stat-label">ลูกค้าใหม่</div><div class="stat-value" style="font-size:20px;">${data.customerActivity.newCustomer}</div></div>
              <div class="stat" style="box-shadow:none;padding:12px;grid-column:span 2;"><div class="stat-label">Top Industry</div><div class="stat-value" style="font-size:14px;">${data.customerActivity.topIndustry[0]? data.customerActivity.topIndustry[0][0] : '—'}</div></div>
            </div>
          </div>
        </div>
        <div class="mg-4">
          <div class="card" style="height:100%;">
            <div class="chart-card-head"><div><div class="t">⚠️ Business Alerts</div></div></div>
            ${execAlertsHtml(data)}
          </div>
        </div>
      </div>

      <div class="mgrid">
        <div class="mg-12">
          <div class="card">
            <div class="chart-card-head"><div><div class="t">🏆 Sales Team Ranking</div><div class="s">ไม่รวม CEO/Company Sales</div></div></div>
            ${data.sales.byEmployee.length ? `<div style="columns:2;column-gap:28px;">${rankingListHtml(data.sales.byEmployee.slice().sort((a,b)=>b.sales-a.sales).map(e=>({employeeId:e.employeeId, label:e.name, value:e.sales, valueLabel:'฿'+fmtMoney(e.sales), subLabel:e.targetPct!=null?e.targetPct+'%':'', onclick:`openEmployeeProfile('${e.employeeId}')`})), 12)}</div>`
            : emptyState('📈','ยังไม่มีข้อมูลยอดขาย Sales เดือนนี้','กรอกยอดขาย',"state._deForm='sales'; go('dataentry');")}
          </div>
        </div>
      </div>

      <div class="dash-section-title">📋 Monthly Report</div>
      <div class="grid grid-3">
        <div class="stat kpi-drill" onclick="state._mrTab='mistake'; go('monthlyreport');"><div class="stat-label">ความผิด</div><div class="stat-value" style="font-size:16px;">ดูรายละเอียด →</div></div>
        <div class="stat kpi-drill" onclick="state._mrTab='foreigninquiry'; go('monthlyreport');"><div class="stat-label">ถามราคาต่างประเทศ</div><div class="stat-value" style="font-size:16px;">ดูรายละเอียด →</div></div>
        <div class="stat kpi-drill" onclick="state._mrTab='customerfollowup'; go('monthlyreport');"><div class="stat-label">ติดตามลูกค้า</div><div class="stat-value" style="font-size:16px;">ดูรายละเอียด →</div></div>
      </div>
    `;

    // Company Sales Trend — รวม trend ของ Sales + Online ที่มีอยู่แล้วในข้อมูลเดิม (ไม่เรียก API เพิ่ม)
    const trendEl = document.getElementById('execTrendChart');
    if (trendEl) {
      state.charts.execTrendChart = new Chart(trendEl, {
        type:'line',
        data:{ labels:(data.sales.trend||[]).map(t=>t.month), datasets:[
          { label:'Sales', data:(data.sales.trend||[]).map(t=>t.sales), borderColor:'#F5793B', backgroundColor:crmGradient('execTrendChart','rgba(245,121,59,0.28)','rgba(245,121,59,0.01)'), fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#F5793B', pointBorderColor:'#fff', pointBorderWidth:2, borderWidth:2.5 },
          { label:'Online', data:(data.online.trend||[]).map(t=>t.sales), borderColor:'#17B6C4', backgroundColor:crmGradient('execTrendChart','rgba(23,182,196,0.22)','rgba(23,182,196,0.01)'), fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#17B6C4', pointBorderColor:'#fff', pointBorderWidth:2, borderWidth:2.5 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom',labels:{boxWidth:9,font:{size:10},usePointStyle:true}} }, scales:{ y:{grid:{color:'rgba(32,35,46,0.05)'},ticks:{font:{size:10}}}, x:{grid:{display:false},ticks:{font:{size:10}}} } }
      });
    }
    const gaugeEl = document.getElementById('execGaugeChart');
    if (gaugeEl) {
      const pct = Math.min(100, data.sales.teamTargetPct || 0);
      state.charts.execGaugeChart = new Chart(gaugeEl, {
        type:'doughnut',
        data:{ labels:['Achieved','Remaining'], datasets:[{ data:[pct, Math.max(0,100-pct)], backgroundColor:['#7C5CFC','rgba(124,92,252,0.1)'], borderWidth:0 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'75%', rotation:-90, circumference:180, plugins:{legend:{display:false},tooltip:{enabled:false}} }
      });
    }
    const platEl = document.getElementById('execPlatformChart');
    if (platEl) {
      const grads = ['#7C5CFC','#3E7BFA','#17B6C4','#0FA98A','#F0559E','#F5A524'];
      state.charts.execPlatformChart = new Chart(platEl, {
        type:'doughnut',
        data:{ labels:data.online.byPlatform.map(p=>p.platform), datasets:[{ data:data.online.byPlatform.map(p=>p.sales), backgroundColor:grads, borderWidth:0 }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom',labels:{boxWidth:8,font:{size:9}}}} }
      });
    }
  } catch(err){ area.innerHTML = `<div class="card">${emptyState('⚠️',err.message)}</div>`; }
}
// [Business Alerts] เตือนภาพรวมจากข้อมูลที่มีอยู่แล้ว ไม่ใช้ API ใหม่
function execAlertsHtml(data){
  const alerts = [];
  if (data.workforce.absentCount > 0) alerts.push({icon:'🔴', text:`ขาดงาน ${data.workforce.absentCount} ครั้งเดือนนี้`, action:"go('attendance')"});
  if (data.workforce.lateCount > 5) alerts.push({icon:'🟠', text:`มาสายสะสม ${data.workforce.lateCount} ครั้ง`, action:"go('attendance')"});
  if (data.sales.teamTargetPct != null && data.sales.teamTargetPct < 80) alerts.push({icon:'🟡', text:`Sales Achievement ต่ำกว่าเป้า (${data.sales.teamTargetPct}%)`, action:"state._mrTab='salesperformance'; go('monthlyreport');"});
  if (data.online.teamTargetPct != null && data.online.teamTargetPct < 80) alerts.push({icon:'🟡', text:`Online Achievement ต่ำกว่าเป้า (${data.online.teamTargetPct}%)`, action:"state._mrTab='onlineperformance'; go('monthlyreport');"});
  if (!alerts.length) return emptyState('✅','ไม่มีประเด็นที่ต้องระวังในเดือนนี้');
  return alerts.map(a=>`<div class="kpi-drill" onclick="${a.action}" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line-soft);font-size:12.5px;"><span>${a.icon}</span><span>${a.text}</span></div>`).join('');
}

// =========================================================
// EMPLOYEE PROFILE — ศูนย์กลางข้อมูลพนักงาน (เปิดจากทุกหน้าได้)
// =========================================================
// =========================================================
// [Data Entry] แยกจาก Dashboard โดยสิ้นเชิง — ใช้สำหรับกรอกข้อมูลเท่านั้น ไม่มีกราฟ/วิเคราะห์ในหน้านี้
// Layout มาตรฐานเดียวกันทุกฟอร์ม: 📅เดือน 👤ผู้รับผิดชอบ 🎯Target 📊Actual 📈ผลลัพธ์(Auto) 💾บันทึก
// =========================================================
async function renderDataEntryHub(){
  const perms = state._dePerms || { isAdmin:false, canSales:false, canOnline:false, canActivitySummary:false };
  // [Direct route access guard] กันกรณี state._deForm ถูกตั้งค่าไว้แต่ผู้ใช้ไม่มีสิทธิ์จริง (เช่น เปลี่ยนหน้าจากที่อื่นมา)
  const formPermMap = { sales:perms.canSales, online:perms.canOnline, activity:perms.canActivitySummary,
    import_customerfollowup:perms.isAdmin, import_mistake:perms.isAdmin, import_foreigninquiry:perms.isAdmin };
  if (state._deForm && !formPermMap[state._deForm]) {
    document.getElementById('content').innerHTML = `<div class="card">${emptyState('🔒','ไม่มีสิทธิ์เข้าถึงส่วนนี้')}</div>`;
    return;
  }
  if (state._deForm === 'sales') { renderSalesEntryForm(); return; }
  if (state._deForm === 'online') { renderOnlineEntryForm(); return; }
  if (state._deForm === 'activity') { renderActivitySummaryForm(); return; }
  if (state._deForm === 'import_customerfollowup') { await renderImportManagement('CustomerFollowup','ติดตามลูกค้า','buildCustomerFollowupDash','วันที่บันทึก'); return; }
  if (state._deForm === 'import_mistake') { await renderImportManagement('Mistake','ความผิด','buildMistakeDash','วันที่'); return; }
  if (state._deForm === 'import_foreigninquiry') { await renderImportManagement('ForeignInquiry','ถามราคา','buildForeignInquiryDash',undefined); return; }

  const importSection = perms.isAdmin ? `
    <div class="dash-section-title">📥 Import Monthly Report</div>
    <div class="dash-nav-grid">
      <div class="dash-nav-card" onclick="state._deForm='import_customerfollowup'; go('dataentry');"><div class="dash-nav-icon">📞</div><div class="dash-nav-title">Import Customer Activity</div><div class="dash-nav-sub">นำเข้าไฟล์ Excel เดิม</div></div>
      <div class="dash-nav-card" onclick="state._deForm='import_mistake'; go('dataentry');"><div class="dash-nav-icon">⚠️</div><div class="dash-nav-title">Import ความผิด</div><div class="dash-nav-sub">นำเข้าไฟล์ Excel เดิม</div></div>
      <div class="dash-nav-card" onclick="state._deForm='import_foreigninquiry'; go('dataentry');"><div class="dash-nav-icon">🌏</div><div class="dash-nav-title">Import ถามราคา ตปท.</div><div class="dash-nav-sub">นำเข้าไฟล์ Excel เดิม</div></div>
    </div>` : '';
  const bizCards = [
    perms.canSales ? `<div class="dash-nav-card" onclick="state._deForm='sales'; go('dataentry');"><div class="dash-nav-icon">📈</div><div class="dash-nav-title">กรอกยอดขาย</div><div class="dash-nav-sub">เลือกพนักงาน Sales หรือ CEO</div></div>` : '',
    perms.canOnline ? `<div class="dash-nav-card" onclick="state._deForm='online'; go('dataentry');"><div class="dash-nav-icon">🌐</div><div class="dash-nav-title">กรอกยอดขายออนไลน์</div><div class="dash-nav-sub">หัวหน้าออนไลน์ · เดือนละ 1 ครั้ง</div></div>` : '',
    perms.canActivitySummary ? `<div class="dash-nav-card" onclick="state._deForm='activity'; go('dataentry');"><div class="dash-nav-icon">📞</div><div class="dash-nav-title">Activity Summary</div><div class="dash-nav-sub">สรุปรายเดือน แยกทีม</div></div>` : ''
  ].filter(Boolean).join('');
  const bizSection = bizCards ? `<div class="dash-section-title">📝 Business Performance Entry</div><div class="dash-nav-grid">${bizCards}</div>` : '';

  document.getElementById('content').innerHTML = (importSection + bizSection) || `<div class="card">${emptyState('🔒','ไม่มีสิทธิ์กรอกข้อมูลส่วนใดเลย')}</div>`;
}
// [Import Monthly Report] ใช้ renderModuleDashboard/renderModuleReadOnly เดิมทุกอย่างเป๊ะๆ (ของเดิมมี Import Excel + ตาราง + ปุ่มแก้ไข/ลบ อยู่แล้ว)
// ย้ายมาไว้ที่ Data Entry เท่านั้น ไม่ได้แก้ Logic การ Import ใดๆ เลย
async function renderImportManagement(sheetName, nameGuess, buildFnName, dateField){
  const isAdmin = !!(state.user.permissions && state.user.permissions.IsSystemAdmin);
  const buildFn = window[buildFnName];
  const backBar = deBackBtn();
  if (isAdmin) await renderModuleDashboard(sheetName, nameGuess, buildFn, dateField, backBar);
  else await renderModuleReadOnly(sheetName, buildFn, dateField, backBar);
}
function deBackBtn(){ return `<button class="btn btn-ghost btn-sm mb-2" onclick="state._deForm=null; go('dataentry');">← กลับ</button>`; }

function renderSalesEntryForm(){
  // [Final Requirement + Bug Fix] Admin เลือกพนักงาน Sales หรือ CEO จาก Dropdown — ใช้ employee map ที่แคชไว้แล้ว ไม่ยิง API เพิ่ม
  // [Root cause เดิม]: กรองด้วย Role==='Sales' แต่พนักงาน Sales จริงไม่มี Role นี้ (Role คือ permission role เช่น 'Special Executive' ไม่ใช่ตำแหน่งงาน)
  // "Sales" ตัวจริงอยู่ในฟิลด์ "แผนก" — ใช้ค่า default เดียวกับที่ backend ใช้ทุกจุด (getSetting('SalesRunnerDept','Sales'))
  const salesAndCeo = Object.values(state._employeeMap || {}).filter(e => e['แผนก']==='Sales' || e['Role']==='CEO');
  document.getElementById('content').innerHTML = `
    ${deBackBtn()}
    <div class="de-card">
      <div class="card-title">📈 กรอกยอดขาย</div>
      <div class="de-field"><label>👤 ผู้รับผิดชอบ</label><select id="deSalesEmp" onchange="updateSalesEntryPreview()">
        ${salesAndCeo.length ? salesAndCeo.map(e=>`<option value="${e.ID}" data-role="${e.Role}">${getEmployeeDisplayWithId(e)}${e.Role==='CEO'?' — CEO (ยอดขายบริษัท)':' — '+(e['ตำแหน่ง']||e['แผนก'])}</option>`).join('') : '<option value="">ไม่พบพนักงาน Sales หรือ CEO ในระบบ</option>'}
      </select></div>
      <div class="de-field"><label>📅 เดือน</label><input type="month" id="deSalesMonth" value="${todayStr().slice(0,7)}"></div>
      <div class="de-field"><label>🎯 เป้าส่วนตัว (บาท)</label><input type="number" id="deSalesTarget" placeholder="0" oninput="updateSalesEntryPreview()"></div>
      <div class="de-field"><label>📊 ยอดขายส่ง (บาท)</label><input type="number" id="deSalesWholesale" placeholder="0" oninput="updateSalesEntryPreview()"></div>
      <div class="de-field"><label>📊 ยอดขายปลีก (บาท)</label><input type="number" id="deSalesRetail" placeholder="0" oninput="updateSalesEntryPreview()"></div>
      <div class="de-result" id="deSalesPreview"><div class="de-result-row"><span>📈 ยอดรวม (Auto Calculate)</span><b>0 บาท</b></div></div>
      <button class="btn btn-accent" style="width:100%;justify-content:center;" onclick="submitSalesEntry()">💾 บันทึก</button>
      <div class="small text-muted mt-1" id="deSalesMsg"></div>
    </div>
  `;
  updateSalesEntryPreview();
}
function updateSalesEntryPreview(){
  const sel = document.getElementById('deSalesEmp');
  const isCeo = sel && sel.selectedOptions[0] && sel.selectedOptions[0].dataset.role === 'CEO';
  const w = Number(document.getElementById('deSalesWholesale').value)||0;
  const r = Number(document.getElementById('deSalesRetail').value)||0;
  const t = Number(document.getElementById('deSalesTarget').value)||0;
  const total = w+r;
  const pct = t>0? Math.round(total/t*10000)/100 : 0;
  document.getElementById('deSalesPreview').innerHTML = `
    <div class="de-result-row"><span>ยอดรวม${isCeo?' (ยอดขายบริษัท/CEO)':''}</span><b>${fmtMoney(total)} บาท</b></div>
    <div class="de-result-row"><span>Achievement</span><b>${pct}%</b></div>
    ${isCeo? '<div class="small text-muted mt-1">CEO ไม่นับเข้า Sales Ranking</div>' : ''}`;
}
async function submitSalesEntry(){
  const msg = document.getElementById('deSalesMsg');
  const employeeId = document.getElementById('deSalesEmp').value;
  if (!employeeId) { msg.textContent = 'ไม่มีพนักงาน Sales/CEO ให้เลือก'; return; }
  const params = { employeeId, yearMonth: document.getElementById('deSalesMonth').value, personalTarget: document.getElementById('deSalesTarget').value,
    wholesaleSales: document.getElementById('deSalesWholesale').value, retailSales: document.getElementById('deSalesRetail').value };
  if (!params.yearMonth) { msg.textContent = 'กรุณาเลือกเดือน'; return; }
  msg.textContent = 'กำลังบันทึก...';
  try {
    // [Performance Dashboard เท่านั้น] Backend ยังคำนวณ/บันทึก Commission-Bonus ลง Sales KPI เหมือนเดิมทุกอย่าง แค่ไม่นำมาแสดงผลใน UI ตามที่กำหนด
    const res = await callGs('saveSalesPerformanceEntry', { params });
    toast(`บันทึกให้ ${getEmployeeDisplayName(employeeId)} เรียบร้อย — Achievement ${res.achievementPct}%`);
    msg.textContent = '';
  } catch(err){ msg.textContent = err.message; }
}

const ONLINE_PLATFORMS = ['Shopee','Lazada','TikTok','Facebook','Website','Line OA'];
function renderOnlineEntryForm(){
  document.getElementById('content').innerHTML = `
    ${deBackBtn()}
    <div class="de-card">
      <div class="card-title">🌐 กรอกยอดขายออนไลน์</div>
      <div class="de-field"><label>📅 เดือน</label><input type="month" id="deOnlineMonth" value="${todayStr().slice(0,7)}"></div>
      <div class="de-field"><label>👤 ผู้รับผิดชอบ</label><input value="${getEmployeeDisplayName(state.user.id)}" disabled></div>
      <div class="de-field"><label>🎯 เป้าส่วนตัว (บาท)</label><input type="number" id="deOnlineTarget" placeholder="0" oninput="updateOnlineEntryPreview()"></div>
      <div class="de-field"><label>🎯 เป้าทีม (บาท)</label><input type="number" id="deOnlineTeamTarget" placeholder="0"></div>
      <div class="de-field"><label>📊 ยอดขายแต่ละ Platform</label>
        ${ONLINE_PLATFORMS.map(p=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="width:80px;font-size:12px;">${p}</span><input type="number" class="de-platform-input" data-platform="${p}" placeholder="0" oninput="updateOnlineEntryPreview()" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px;"></div>`).join('')}
      </div>
      <div class="de-result" id="deOnlinePreview"><div class="de-result-row"><span>📈 ยอดรวม (Auto Calculate)</span><b>0 บาท</b></div></div>
      <button class="btn btn-accent" style="width:100%;justify-content:center;" onclick="submitOnlineEntry()">💾 บันทึก</button>
      <div class="small text-muted mt-1" id="deOnlineMsg"></div>
    </div>
  `;
}
function updateOnlineEntryPreview(){
  let total = 0; document.querySelectorAll('.de-platform-input').forEach(i=> total += Number(i.value)||0);
  const t = Number(document.getElementById('deOnlineTarget').value)||0;
  const pct = t>0? Math.round(total/t*10000)/100 : 0;
  document.getElementById('deOnlinePreview').innerHTML = `
    <div class="de-result-row"><span>ยอดรวม</span><b>${fmtMoney(total)} บาท</b></div>
    <div class="de-result-row"><span>Achievement</span><b>${pct}%</b></div>`;
}
async function submitOnlineEntry(){
  const msg = document.getElementById('deOnlineMsg');
  const platformSales = Array.from(document.querySelectorAll('.de-platform-input')).map(i=>({platform:i.dataset.platform, sales:Number(i.value)||0})).filter(p=>p.sales>0);
  const params = { yearMonth: document.getElementById('deOnlineMonth').value, personalTarget: document.getElementById('deOnlineTarget').value,
    teamTarget: document.getElementById('deOnlineTeamTarget').value, platformSales };
  if (!params.yearMonth) { msg.textContent = 'กรุณาเลือกเดือน'; return; }
  if (!platformSales.length) { msg.textContent = 'กรุณากรอกยอดขายอย่างน้อย 1 Platform'; return; }
  msg.textContent = 'กำลังบันทึก...';
  try {
    const res = await callGs('saveOnlinePerformanceEntry', { params });
    toast(`บันทึกเรียบร้อย — Achievement ${res.achievementPct}%`);
    msg.textContent = '';
  } catch(err){ msg.textContent = err.message; }
}

function renderActivitySummaryForm(){
  document.getElementById('content').innerHTML = `
    ${deBackBtn()}
    <div class="de-card">
      <div class="card-title">📞 Activity Summary รายเดือน</div>
      <div class="de-field"><label>📅 เดือน</label><input type="month" id="deActMonth" value="${todayStr().slice(0,7)}"></div>
      <div class="de-field"><label>👤 ทีม</label><select id="deActTeam"><option value="ฝ่ายขาย">ฝ่ายขาย</option><option value="ออนไลน์">ออนไลน์</option></select></div>
      <div class="de-field"><label>📊 จำนวนการโทร</label><input type="number" id="deActCalls" placeholder="0"></div>
      <div class="de-field"><label>📊 จำนวน Follow Up</label><input type="number" id="deActFollowUps" placeholder="0"></div>
      <div class="de-field"><label>📊 จำนวนส่งอีเมล</label><input type="number" id="deActEmails" placeholder="0"></div>
      <div class="de-field"><label>📊 จำนวนเข้าพบ</label><input type="number" id="deActVisits" placeholder="0"></div>
      <button class="btn btn-accent" style="width:100%;justify-content:center;" onclick="submitActivitySummary()">💾 บันทึก</button>
      <div class="small text-muted mt-1" id="deActMsg"></div>
    </div>
  `;
}
async function submitActivitySummary(){
  const msg = document.getElementById('deActMsg');
  const params = { yearMonth: document.getElementById('deActMonth').value, team: document.getElementById('deActTeam').value,
    calls: document.getElementById('deActCalls').value, followUps: document.getElementById('deActFollowUps').value,
    emails: document.getElementById('deActEmails').value, visits: document.getElementById('deActVisits').value };
  if (!params.yearMonth) { msg.textContent = 'กรุณาเลือกเดือน'; return; }
  msg.textContent = 'กำลังบันทึก...';
  try {
    await callGs('saveCustomerActivitySummary', { params });
    toast('บันทึกเรียบร้อย'); msg.textContent = '';
  } catch(err){ msg.textContent = err.message; }
}

function openEmployeeProfile(employeeId){
  if (!employeeId) return;
  state._profileEmployeeId = employeeId;
  state._profileTab = 'overview';
  go('employeeprofile');
}
// [Employee Directory] เปิดจาก Sidebar — ใช้ state._employeeMap ที่แคชไว้แล้ว ไม่เพิ่ม API call
function openEmployeeDirectory(){
  go('employeedirectory');
}
async function renderEmployeeDirectory(){
  const area = document.getElementById('content');
  await ensureEmployeeMapLoaded();
  // [Directory Layout v2 — ตามที่ระบุใหม่] แสดงทุกคนรวม FT000/CEO ด้วย (ยกเลิกการซ่อนแบบเดิม) เรียงตามรหัสพนักงานจากน้อยไปมาก ไม่แยกแผนก ไม่มีกรอบ/หัวข้อแผนกคั่น
  // เรียงตามรหัสพนักงานตรงๆ แบบ String compare — รหัสจริงในระบบเป็น "FT" + เลขความกว้างเท่ากันเสมอ (FT000, FT001, ... ) เรียงแบบนี้ตรงกับเรียงตัวเลขพอดี ไม่ต้องแยกเลขออกมาให้ซับซ้อน
  const employees = Object.values(state._employeeMap || {}).slice().sort((a,b)=> String(a.ID||'').localeCompare(String(b.ID||'')));
  if (!employees.length) { area.innerHTML = `<div class="card">${emptyState('👥','ไม่มีข้อมูลพนักงาน')}</div>`; return; }

  // [ตามที่ระบุ] FT000/CEO แยกออกมาอยู่บนสุด กึ่งกลางหน้าจอ คนเดียว ไม่ปนอยู่ใน Grid หลัก 6 คอลัมน์
  const ceo = employees.find(e => String(e.ID) === 'FT000' || e['Role'] === 'CEO');
  const rest = ceo ? employees.filter(e => e !== ceo) : employees;

  area.innerHTML = `
    <div class="mb-2">
      <div style="font-size:20px;font-weight:700;font-family:'Prompt';">👥 Employee Directory</div>
      <div class="small text-muted">ทีมงานทั้งหมด ${employees.length} คน</div>
    </div>
    ${ceo ? employeeDirectoryCeoCardHtml(ceo) : ''}
    <div class="dir-grid-flat">${rest.map(e => employeeDirectoryCardHtml(e)).join('')}</div>
  `;
}
// [ตามที่ระบุ] การ์ด CEO (FT000) พิเศษ — อยู่บนสุดกึ่งกลาง มีอีโมจิมงกุฎเหนือรูป ใต้รูปโชว์ตำแหน่ง (ดึงจากข้อมูลจริง) แล้วอีกบรรทัดเป็นชื่อ
// ชื่อที่แสดง ("คุณธีรเมธ ปิติโชคเจริญ") ล็อกตายตัวตามที่ระบุมาเป๊ะๆ ไม่ได้ดึงจาก state._employeeMap — ถ้าชื่อเปลี่ยนในอนาคตแก้ค่าคงที่ตัวแปร ceoName ตรงนี้ได้เลย
function employeeDirectoryCeoCardHtml(e){
  const initials = getEmployeeDisplayName(e).charAt(0);
  const role = e['ตำแหน่ง']||'';
  const ceoName = 'คุณธีรเมธ ปิติโชคเจริญ';
  return `
    <div class="dir-ceo-wrap">
      <div class="dir-ceo-card" onclick="openPublicProfileModal('${e.ID}')">
        <div class="dir-ceo-crown">👑</div>
        <div class="dir-photo-square dir-photo-flat dir-ceo-photo">
          ${driveImgOrAvatar(e['รูป'], initials, 100, 'avatar-100 avatar-100-square', 'ep-photo dir-photo-img', 'square')}
        </div>
        <div class="dir-ceo-role">${role}</div>
        <div class="dir-ceo-name">${ceoName}</div>
      </div>
    </div>`;
}
// [Employee Directory — Square Photo + Hover Info] รูปใหญ่ขึ้น ทรงสี่เหลี่ยมมุมมน (แทนวงกลมเดิม) คลิกยังเปิดโปรไฟล์เต็มได้เหมือนเดิม (onclick เดิมไม่เปลี่ยน)
// Hover เมาส์เหนือรูป (ยังไม่คลิก) แสดง Overlay: ชื่อเล่น / แผนก / ตำแหน่ง เท่านั้น ตามที่ระบุ
function employeeDirectoryCardHtml(e){
  const initials = getEmployeeDisplayName(e).charAt(0);
  const nickname = e['ชื่อเล่น']||e['ชื่อจริง']||'';
  const dept = e['แผนก']||'';
  const role = e['ตำแหน่ง']||'';
  return `
    <div class="dir-card dir-card-flat" onclick="openPublicProfileModal('${e.ID}')">
      <div class="dir-photo-square dir-photo-flat">
        ${driveImgOrAvatar(e['รูป'], initials, 100, 'avatar-100 avatar-100-square', 'ep-photo dir-photo-img', 'square')}
        <div class="dir-hover-info">
          <div class="dir-hover-name">${nickname}</div>
          <div class="dir-hover-dept">${dept}</div>
          <div class="dir-hover-role">${role}</div>
        </div>
      </div>
    </div>`;
}
function openProfileOverlay(html){ document.getElementById('profileOverlayContent').innerHTML=html; document.getElementById('profileOverlay').classList.add('show'); }
function closeProfileOverlay(){ document.getElementById('profileOverlay').classList.remove('show'); }
// [Public Profile — Large Overlay ตาม Reference Image 3] ข้อมูลจำกัดตามที่กำหนด — ไม่มีเงินเดือน/Leave/Attendance/KPI/Commission/Bonus ใดๆ ทั้งสิ้น
function openPublicProfileModal(employeeId){
  const e = state._employeeMap ? state._employeeMap[employeeId] : null;
  if (!e) return;
  const initials = getEmployeeDisplayName(e).charAt(0);
  const isSelf = String(employeeId) === String(state.user.id);
  const perm = state.user.permissions || {};
  const canSeeDetail = isSelf || perm.IsSystemAdmin || perm.VisibilityScope === 'All' || perm.VisibilityScope === 'Department';
  const photoUrl = driveImageUrl(e['รูป']);
  const fileId = extractDriveFileId(e['รูป']);
  const fallbackUrl = fileId ? driveLh3Url(fileId) : '';
  const photoHtml = photoUrl
    ? `<img src="${photoUrl}" data-fallback="${fallbackUrl}" data-tried="0" onerror="if(this.dataset.tried==='0' && this.dataset.fallback){this.dataset.tried='1'; this.src=this.dataset.fallback;} else { this.outerHTML='<div class=&quot;avatar-big&quot;>${initials}</div>'; }">`
    : `<div class="avatar-big">${initials}</div>`;
  openProfileOverlay(`
    <button class="profile-overlay-close" onclick="closeProfileOverlay()">✕</button>
    <div class="profile-overlay-photo">${photoHtml}</div>
    <div class="profile-overlay-info">
      <div class="profile-overlay-eyebrow">Employee Profile</div>
      <div class="profile-overlay-name">${e['ชื่อเล่น']||e['ชื่อจริง']} <span style="font-weight:400;font-size:20px;color:var(--ink-muted);">(${e.ID})</span></div>
      <div class="profile-overlay-fullname">${e['ชื่อจริง']||''}</div>
      <div class="profile-overlay-role">${e['ตำแหน่ง']||''}</div>
      <div class="profile-overlay-dept">${e['แผนก']||''}</div>
      <div class="profile-overlay-facts">
        <div><div class="profile-overlay-fact-label">อายุงาน</div><div class="profile-overlay-fact-value">${epTenureText(e['วันที่เริ่มงาน'])}</div></div>
        <div><div class="profile-overlay-fact-label">เริ่มงาน</div><div class="profile-overlay-fact-value">${fmt(e['วันที่เริ่มงาน'])}</div></div>
      </div>
      <div class="profile-overlay-actions">
        <button class="btn btn-ghost" onclick="closeProfileOverlay()">ปิด</button>
        ${canSeeDetail ? `<button class="btn btn-accent" onclick="closeProfileOverlay(); openEmployeeProfile('${employeeId}');">${isSelf?'👤 My Profile':'ดูข้อมูลแบบละเอียด'}</button>` : ''}
      </div>
    </div>
  `);
}
const EP_TABS = [
  { key:'overview', label:'👤 ภาพรวม' },
  { key:'attendance', label:'🕒 เวลาเข้างาน' },
  { key:'leave', label:'🏖 การลา' },
  { key:'ot', label:'⏱ OT' },
  { key:'task', label:'✅ Task' },
  { key:'document', label:'📄 เอกสาร' },
  { key:'stats', label:'📈 สถิติ' }
];
async function renderEmployeeProfile(){
  if (!state._profileEmployeeId) state._profileEmployeeId = state.user.id;
  if (!state._profileTab) state._profileTab = 'overview';
  document.getElementById('content').innerHTML = '<div class="helper">กำลังโหลด...</div>';
  try {
    const bundle = await callGs('getEmployeeProfileBundle', { employeeId: state._profileEmployeeId });
    state._profileBundle = bundle;
    const isAdmin = !!(state.user.permissions && state.user.permissions.IsSystemAdmin);
    let employeeOptions = '';
    if (isAdmin) {
      if (!state._profileEmployeeList) state._profileEmployeeList = await callGs('list', { sheetName:'Employee' });
      employeeOptions = `<select onchange="openEmployeeProfile(this.value)" style="padding:9px 12px;border-radius:10px;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:12px;">
        ${state._profileEmployeeList.map(e=>`<option value="${e.ID}" ${e.ID===state._profileEmployeeId?'selected':''}>${getEmployeeDisplayWithId(e)}</option>`).join('')}
      </select>`;
    }
    renderEmployeeProfileFrame(bundle, employeeOptions);
  } catch(err){ document.getElementById('content').innerHTML = `<div class="card"><div class="helper">${err.message}</div></div>`; }
}
function epTenureText(startDate){
  if (!startDate) return '—';
  const start = new Date(startDate); const now = new Date();
  let years = now.getFullYear()-start.getFullYear(); let months = now.getMonth()-start.getMonth();
  if (months < 0) { years--; months += 12; }
  return `${years} ปี ${months} เดือน`;
}
// [รีเซ็ตรหัสผ่าน] Admin เท่านั้น — สุ่มอัตโนมัติ หรือกำหนดเองก็ได้ โชว์รหัสผ่านจริงแค่ครั้งเดียวหลังบันทึก
function openResetPasswordModal(employeeId, name){
  modal(`
    <h2 class="mb-2">🔑 รีเซ็ตรหัสผ่าน — ${name} (${employeeId})</h2>
    <div class="field"><label>รหัสผ่านใหม่ (เว้นว่างไว้ = สุ่มให้อัตโนมัติ)</label><input id="rpNewPass" placeholder="เว้นว่างเพื่อสุ่มอัตโนมัติ"></div>
    <div class="small text-muted mb-2">ระบบเก็บรหัสผ่านแบบเข้ารหัส (hash) เท่านั้น — หลังบันทึกแล้วจะไม่มีทางดูรหัสผ่านนี้ซ้ำได้อีก ต้องคัดลอกไปแจกพนักงานทันที</div>
    <div id="rpResult"></div>
    <div class="small text-muted mb-1" id="rpMsg"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-accent" onclick="doResetPassword('${employeeId}')">รีเซ็ตรหัสผ่าน</button>
    </div>
  `);
}
async function doResetPassword(employeeId){
  const newPass = document.getElementById('rpNewPass').value.trim();
  const msg = document.getElementById('rpMsg');
  if (!confirm('ยืนยันรีเซ็ตรหัสผ่านของพนักงานคนนี้? รหัสผ่านเดิมจะใช้ไม่ได้ทันที')) return;
  msg.textContent = 'กำลังดำเนินการ...';
  try {
    const res = await callGs('adminResetPassword', { employeeId, newPassword: newPass });
    msg.textContent = '';
    document.getElementById('rpResult').innerHTML = `
      <div class="card mb-2" style="border-color:var(--success);background:var(--success-soft);">
        <div class="small" style="font-weight:600;margin-bottom:6px;">✅ รีเซ็ตสำเร็จ — รหัสผ่านใหม่:</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <code style="font-size:16px;font-weight:700;background:#fff;padding:6px 12px;border-radius:8px;">${res.newPassword}</code>
          <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${res.newPassword}');toast('คัดลอกแล้ว')">คัดลอก</button>
        </div>
        <div class="small text-muted mt-1">ส่งรหัสนี้ให้พนักงานทันที (จะไม่แสดงซ้ำอีก)</div>
      </div>`;
  } catch(err){ msg.textContent = err.message; }
}
function renderEmployeeProfileFrame(bundle, employeeOptions){
  const emp = bundle.employee;
  const initials = getEmployeeDisplayName(emp).charAt(0);
  const isAdmin = !!(state.user.permissions && state.user.permissions.IsSystemAdmin);
  console.log('[Employee Profile] emp["รูป"] raw =', JSON.stringify(emp['รูป']), '| แปลงแล้ว =', JSON.stringify(driveImageUrl(emp['รูป'])));
  const vacBalance = bundle.leaveSummary.balances.find(b=>b.leaveType==='ลาพักร้อน') || {remaining:0};
  document.getElementById('content').innerHTML = `
    <div class="ep-hero">
      ${driveImgOrAvatar(emp['รูป'], initials, 104, 'ep-avatar-lg', 'ep-photo')}
      <div style="position:relative;z-index:1;">
        <div class="ep-name">${getEmployeeDisplayWithId(emp)}</div>
        <div class="ep-nick">${emp['ชื่อจริง']||''}</div>
        <div class="ep-meta">${emp['ตำแหน่ง']||''} · ${emp['แผนก']||''}</div>
        <div class="ep-meta2">
          <span>อายุงาน ${epTenureText(emp['วันที่เริ่มงาน'])}</span>
          <span>เริ่มงาน ${fmt(emp['วันที่เริ่มงาน'])}</span>
          <span>หัวหน้างาน: ${getEmployeeDisplayName(emp['หัวหน้า']) || '—'}</span>
          <span class="ep-status-badge">${emp['สถานะ']||''}</span>
        </div>
      </div>
      <div style="margin-left:auto;display:flex;flex-direction:column;gap:8px;align-items:flex-end;position:relative;z-index:1;">
        ${employeeOptions}
        ${isAdmin ? `<button class="btn btn-sm" style="background:rgba(255,255,255,0.15);color:#fff;" onclick="openResetPasswordModal('${emp['ID']}','${getEmployeeDisplayName(emp).replace(/'/g,"\\'")}')">🔑 รีเซ็ตรหัสผ่าน</button>` : ''}
      </div>
    </div>
    <div class="grid grid-4 mb-3">
      <div class="stat"><div class="stat-label">สิทธิ์วันลาคงเหลือ</div><div class="stat-value" style="color:var(--accent)">${vacBalance.remaining}<span class="stat-unit">วัน</span></div></div>
      <div class="stat"><div class="stat-label">Attendance %</div><div class="stat-value">${bundle.attendancePct!=null?bundle.attendancePct+'%':'—'}</div></div>
      <div class="stat"><div class="stat-label">OT เดือนนี้</div><div class="stat-value">${bundle.monthlySummary.otHours}<span class="stat-unit">ชม.</span></div></div>
      <div class="stat"><div class="stat-label">มาสายเดือนนี้</div><div class="stat-value" style="color:var(--warn)">${bundle.monthlySummary.lateCount}<span class="stat-unit">ครั้ง</span></div></div>
      <div class="stat"><div class="stat-label">Risk Score</div><div class="stat-value" style="color:${bundle.risk&&bundle.risk.level==='High'?'var(--danger)':bundle.risk&&bundle.risk.level==='Medium'?'var(--warn)':'var(--success)'}">${bundle.risk?bundle.risk.level:'—'}</div></div>
      <div class="stat"><div class="stat-label">Payroll ล่าสุด</div><div class="stat-value" style="font-size:20px;">${bundle.payroll?'฿'+fmtMoney(bundle.payroll.net):'—'}</div></div>
      <div class="stat"><div class="stat-label">งานที่รับผิดชอบ</div><div class="stat-value">${bundle.myTasks.length}<span class="stat-unit">งาน</span></div></div>
      <div class="stat"><div class="stat-label">คำขอรออนุมัติ</div><div class="stat-value" style="color:var(--warn)">${bundle.pendingRequests}<span class="stat-unit">รายการ</span></div></div>
    </div>
    <div class="ep-tabs">${EP_TABS.map(t=>`<div class="ep-tab ${state._profileTab===t.key?'active':''}" onclick="state._profileTab='${t.key}'; renderEmployeeProfileTabBody();">${t.label}</div>`).join('')}</div>
    <div id="epTabBody"></div>
  `;
  renderEmployeeProfileTabBody();
}
function renderEmployeeProfileTabBody(){
  document.querySelectorAll('.ep-tab').forEach(el=> el.classList.toggle('active', el.textContent === EP_TABS.find(t=>t.key===state._profileTab).label));
  const bundle = state._profileBundle;
  const area = document.getElementById('epTabBody');
  const tab = state._profileTab;
  if (tab === 'overview') {
    area.innerHTML = `
      <div class="card">
        <div class="card-title">เหตุการณ์ล่าสุด</div>
        ${bundle.timeline.length? bundle.timeline.slice().reverse().slice(0,10).map(e=>`<div class="small mb-1">${fmt(e.date)} — <b>${e.type}</b> ${e.detail||''}</div>`).join('') : '<div class="helper">ไม่มีข้อมูล</div>'}
      </div>`;
  } else if (tab === 'attendance') {
    area.innerHTML = `<div class="card" style="padding:0;overflow:auto;"><table>
      <thead><tr><th>วันที่</th><th>เข้า</th><th>ออก</th><th>สถานะ</th><th>สาย(นาที)</th></tr></thead>
      <tbody>${bundle.attendanceHistory.length? bundle.attendanceHistory.slice(0,30).map(r=>`<tr><td>${fmt(r.Date)}</td><td>${r.CheckIn||'—'}</td><td>${r.CheckOut||'—'}</td><td>${attBadge(r.Status)}</td><td>${r.LateMinutes||0}</td></tr>`).join('') : '<tr><td colspan="5"><div class="helper">ไม่มีข้อมูล</div></td></tr>'}</tbody>
    </table></div>`;
  } else if (tab === 'leave') {
    area.innerHTML = `
      <div class="card mb-2">
        <div class="card-title">สิทธิ์การลา</div>
        <div class="grid grid-3">${mergeLeaveBalancesByCanonicalType(bundle.leaveSummary.balances).map(b=>`<div class="stat"><div class="stat-label">${b.leaveType}</div><div class="stat-value" style="color:var(--accent)">${b.remaining}<span class="stat-unit">/${b.entitlement} วัน</span></div></div>`).join('')}</div>
      </div>
      <div class="card" style="padding:0;overflow:auto;"><table>
        <thead><tr><th>ประเภท</th><th>วันที่</th><th>จำนวน</th><th>สถานะ</th></tr></thead>
        <tbody>${bundle.leaveHistory.length? bundle.leaveHistory.map(r=>`<tr><td>${normalizeLeaveTypeLabel(r['ประเภทลา'])}</td><td>${fmt(r['วันที่เริ่มลา'])}</td><td>${r['จำนวนวัน']||0} วัน</td><td>${statusBadge(r.Status)}</td></tr>`).join('') : '<tr><td colspan="4"><div class="helper">ไม่มีข้อมูล</div></td></tr>'}</tbody>
      </table></div>`;
  } else if (tab === 'ot') {
    area.innerHTML = `<div class="card" style="padding:0;overflow:auto;"><table>
      <thead><tr><th>วันที่</th><th>ชั่วโมง</th><th>เหตุผล</th><th>สถานะ</th></tr></thead>
      <tbody>${bundle.otHistory.length? bundle.otHistory.map(r=>`<tr><td>${fmt(r['วันที่'])}</td><td>${r['ชั่วโมง']||0}</td><td>${r['เหตุผล']||''}</td><td>${statusBadge(r.Status)}</td></tr>`).join('') : '<tr><td colspan="4"><div class="helper">ไม่มีข้อมูล</div></td></tr>'}</tbody>
    </table></div>`;
  } else if (tab === 'task') {
    area.innerHTML = `<div class="card">${bundle.myTasks.length? bundle.myTasks.map(t=>`<div class="small mb-1" style="padding:8px;background:var(--line-soft);border-radius:8px;">${t.Title||''} <span class="badge badge-info">${t.Status||''}</span></div>`).join('') : '<div class="helper">ไม่มีงานค้าง</div>'}</div>`;
  } else if (tab === 'document') {
    area.innerHTML = '<div class="card"><div class="helper">กำลังโหลดเอกสาร...</div></div>';
    callGs('list', { sheetName:'Document' }).then(docs=>{
      const mine = docs.filter(d=> String(d['EmployeeID'])===String(state._profileEmployeeId));
      area.innerHTML = `<div class="card">${mine.length? mine.map(d=>`<div class="small mb-1">${d['ชื่อเอกสาร']||''} ${d['ลิงก์ไฟล์']?`<a href="${d['ลิงก์ไฟล์']}" target="_blank">เปิดไฟล์</a>`:''}</div>`).join('') : '<div class="helper">ไม่มีเอกสาร</div>'}</div>`;
    }).catch(()=>{ area.innerHTML = '<div class="card"><div class="helper">ไม่มีสิทธิ์ดูเอกสาร หรือเกิดข้อผิดพลาด</div></div>'; });
  } else if (tab === 'stats') {
    area.innerHTML = `
      <div class="grid grid-2 mb-2">
        <div class="stat"><div class="stat-label">ขาดเดือนนี้</div><div class="stat-value" style="color:var(--danger)">${bundle.monthlySummary.absentCount}<span class="stat-unit">ครั้ง</span></div></div>
        <div class="stat"><div class="stat-label">หักเบี้ยขยันเดือนนี้</div><div class="stat-value" style="color:var(--danger)">฿${fmtMoney(bundle.monthlySummary.lateDeductionTotal)}</div></div>
      </div>
      <div class="card"><div class="card-title">ประวัติทั้งหมด (Timeline)</div>
        ${bundle.timeline.length? bundle.timeline.map(e=>`<div class="small mb-1">${fmt(e.date)} — <b>${e.type}</b> ${e.detail||''}</div>`).join('') : '<div class="helper">ไม่มีข้อมูล</div>'}
      </div>`;
  }
}


// =========================================================
async function renderHealthCheck(){
  document.getElementById('content').innerHTML = `<div class="card"><button class="btn btn-accent" onclick="runHc()">▶ ตรวจสอบระบบตอนนี้</button><div id="hcResult" class="mt-2"></div></div>`;
}
async function runHc(){
  const box = document.getElementById('hcResult');
  box.innerHTML = '<div class="helper">กำลังตรวจสอบ...</div>';
  try {
    const r = await callGs('runHealthCheck', {});
    box.innerHTML = r.isReady
      ? `<div class="badge badge-success" style="font-size:13px;padding:8px 14px;">✅ ระบบพร้อมใช้งาน — ผ่านทั้งหมด ${r.sheetsOk.length} ชีต</div>`
      : `<div class="mb-1"><span class="badge badge-danger" style="font-size:13px;padding:8px 14px;">⚠️ พบ ${r.issues.length} ปัญหา</span></div>` +
        r.issues.map(i=>`<div class="small mb-1" style="padding:8px;background:var(--danger-soft);border-radius:8px;"><b>${i.sheet}</b> — ${i.detail}</div>`).join('');
  } catch(e){ box.innerHTML = `<div class="helper">${e.message}</div>`; }
}

// =========================================================
// CALENDAR
// =========================================================
async function renderCalendar(){
  if (!state._calMonth) state._calMonth = new Date().toISOString().slice(0,7);
  await drawCalendar();
}
async function shiftCalMonth(delta){
  const [y,m] = state._calMonth.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  state._calMonth = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  await drawCalendar();
}
async function drawCalendar(){
  const monthStr = state._calMonth;
  const events = await callGs('getCalendarEvents', { monthStr });
  const [y,m] = monthStr.split('-').map(Number);
  const first = new Date(y, m-1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDow = first.getDay();
  const byDay = {};
  events.forEach(e=>{ const d=Number(e.date.split('-')[2]); (byDay[d]=byDay[d]||[]).push(e); });

  let cells = '';
  for (let i=0;i<startDow;i++) cells += '<div class="cal-cell" style="visibility:hidden;"></div>';
  for (let d=1; d<=daysInMonth; d++) {
    const evs = byDay[d]||[];
    cells += `<div class="cal-cell"><div class="dnum">${d}</div>${evs.slice(0,3).map(e=>`<div class="cal-ev">${e.type}: ${e.type==='ลา'?humanizeCalendarLeaveTitle_(e.title):(e.title||'')}</div>`).join('')}${evs.length>3?`<div class="small text-muted">+${evs.length-3}</div>`:''}</div>`;
  }
  document.getElementById('content').innerHTML = `
    <div class="card">
      <div class="card-title">
        <span>${y}-${String(m).padStart(2,'0')}</span>
        <span><button class="btn btn-ghost btn-sm" onclick="shiftCalMonth(-1)">← ก่อนหน้า</button> <button class="btn btn-ghost btn-sm" onclick="shiftCalMonth(1)">ถัดไป →</button></span>
      </div>
      <div class="cal-grid mb-1">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>
  `;
}

// =========================================================
// SEARCH
// =========================================================
let searchTimer;
function onSearchInput(){
  clearTimeout(searchTimer);
  const q = document.getElementById('searchInput').value.trim();
  const box = document.getElementById('searchResults');
  if (q.length < 2) { box.classList.remove('show'); return; }
  searchTimer = setTimeout(async ()=>{
    try {
      const results = await callGs('globalSearch', { query: q });
      box.innerHTML = results.length ? results.map(r=>`<div class="sr-item" onclick='onSearchResultClick(${JSON.stringify(r)})'><div>${r.label}</div><div class="t">${r.type}</div></div>`).join('') : '<div class="sr-item">ไม่พบผลลัพธ์</div>';
      box.classList.add('show');
    } catch(e){}
  }, 350);
}
function onSearchResultClick(r){
  document.getElementById('searchResults').classList.remove('show');
  document.getElementById('searchInput').value='';
  if (r.navKey === 'employees') go('employeerisk');
  else if (['Task','Document','SOP','Announcement'].indexOf(r.navKey)!==-1) openGenericSheet(r.navKey);
}
document.addEventListener('click', e=>{
  if (!e.target.closest('.search-box')) document.getElementById('searchResults').classList.remove('show');
  if (!e.target.closest('.bell-btn') && !e.target.closest('.notif-panel')) document.getElementById('notifPanel').classList.remove('show');
});

// =========================================================
// NOTIFICATIONS
// =========================================================
async function refreshNotifBadge(){
  try {
    const rows = await callGs('getMyNotifications', {});
    const unread = rows.filter(r=>!r.Read).length;
    document.getElementById('bellBadge').classList.toggle('show', unread>0);
  } catch(e){}
}
async function toggleNotif(){
  const panel = document.getElementById('notifPanel');
  if (panel.classList.contains('show')) { panel.classList.remove('show'); return; }
  const rows = await callGs('getMyNotifications', {});
  panel.innerHTML = rows.length ? rows.map(r=>`
    <div class="notif-item ${!r.Read?'unread':''}" onclick="markRead('${r.RecordID}')">
      <div class="t">${r.Event||''}</div><div>${r.Detail||''}</div><div class="d">${fmt(r.CreatedAt)}</div>
    </div>`).join('') : '<div class="notif-item">ไม่มีการแจ้งเตือน</div>';
  panel.classList.add('show');
}
async function markRead(recordId){
  try { await callGs('markNotificationRead', {recordId}); refreshNotifBadge(); toggleNotif(); toggleNotif(); } catch(e){}
}
