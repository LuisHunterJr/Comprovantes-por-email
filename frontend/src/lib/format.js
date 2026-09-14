export const onlyDigits = (v) => (v || "").replace(/\D/g, "");

export const maskCNPJ = (v) => {
  const d = onlyDigits(v).slice(0, 14);
  const p = [];
  if (d.length > 0) p.push(d.slice(0, 2));
  if (d.length > 2) p.push(d.slice(2, 5));
  if (d.length > 5) p.push(d.slice(5, 8));
  let out = p.join(".");
  if (d.length > 8) out += "/" + d.slice(8, 12);
  if (d.length > 12) out += "-" + d.slice(12, 14);
  return out;
};

export const formatBRL = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export const parseBRLInput = (s) => {
  let str = String(s || "").replace(/[^\d,.-]/g, "");
  if (!str) return 0;
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");
  if (hasComma && hasDot) {
    // pt-BR: dots are thousand separators, comma is decimal
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Only comma -> decimal separator
    str = str.replace(",", ".");
  } else if (hasDot) {
    // Only dot: if there's a single dot followed by 1-2 digits, treat as decimal
    const parts = str.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      // decimal
    } else {
      // thousand separators
      str = str.replace(/\./g, "");
    }
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};

export const formatDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const formatFileSize = (bytes) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};
