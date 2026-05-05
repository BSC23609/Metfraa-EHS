// ============================================================================
// Datetime utilities (IST Enforcer)
// ============================================================================

// Returns a date string formatted in IST (Indian Standard Time)
// Format: "YYYY-MM-DD HH:MM:SS"
function toIstString(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  
  // Use Intl.DateTimeFormat to strictly enforce Asia/Kolkata timezone
  // regardless of where the Render cloud server is physically located.
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Intl.DateTimeFormat with en-IN produces DD/MM/YYYY, HH:MM:SS
  const parts = formatter.formatToParts(d);
  const map = {};
  parts.forEach(p => map[p.type] = p.value);
  
  // Reformat to standard YYYY-MM-DD HH:MM:SS
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

// Generate a unique ID using the IST timestamp
function generateSubmissionId(formCode, dateInput) {
  const istStr = toIstString(dateInput); // YYYY-MM-DD HH:MM:SS
  // Convert to YYYYMMDD-HHMMSS
  const timeBlock = istStr.replace(/[-:]/g, '').replace(' ', '-');
  const randomBlock = Math.floor(1000 + Math.random() * 9000); // 4 random digits
  return `${formCode}-${timeBlock}-${randomBlock}`;
}

module.exports = {
  toIstString,
  generateSubmissionId
};