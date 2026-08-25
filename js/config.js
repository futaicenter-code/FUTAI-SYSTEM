// ============================================================
// FWMS — Migration Phase 1 Config
// ไฟล์นี้เป็นไฟล์ใหม่ (ไม่มีในระบบเดิม) — เก็บค่าที่ต้องเปลี่ยนตอนย้าย Deployment เท่านั้น
// ============================================================

// ใส่ URL ของ GAS Web App Deployment (ต้อง Deploy แบบ "Execute as: Me" + "Who has access: Anyone")
// รูปแบบ: https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXX/exec
// วิธีหา URL: เปิด FWMS_Code.gs ใน Apps Script Editor -> Deploy -> Manage deployments -> คัดลอก Web app URL
// (ใช้ Deployment เดิมตัวเดียวกับที่ doGet เดิมเสิร์ฟหน้าเว็บอยู่ตอนนี้ก็ได้ ไม่ต้องสร้างใหม่ เพราะ doPost อยู่ใน Deployment เดียวกัน)
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbx0AVnVCbMMhV9ypeGb91maRN56rngLcRRNGSgfsMy_71-ztlVZw-HnpvkUtydVmEZt/exec';
