import { useEffect, useMemo, useState } from "react";
import { Mail, Send, Loader2, Paperclip, X, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { maskCNPJ, formatBRL } from "@/lib/format";

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const parseEmails = (raw) => {
  const parts = String(raw || "").split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set();
  const valid = [];
  const invalid = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    (EMAIL_RX.test(p) ? valid : invalid).push(p);
  }
  return { valid, invalid };
};

export default function SendEmailDialog({ record, open, onOpenChange, defaultRecipients }) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      const list = Array.isArray(defaultRecipients) ? defaultRecipients : [];
      setTo(list.join(", "));
      setMessage("");
      setAttach(true);
    }
  }, [open, defaultRecipients]);

  const parsed = useMemo(() => parseEmails(to), [to]);

  if (!record) return null;
  const receiptsCount = (record.receipts || []).length;

  const removeChip = (email) => {
    const remaining = parsed.valid.filter((e) => e.toLowerCase() !== email.toLowerCase());
    setTo([...remaining, ...parsed.invalid].join(", "));
  };

  const send = async () => {
    if (parsed.valid.length === 0) return toast.error("Informe ao menos um e-mail válido");
    if (parsed.invalid.length > 0) return toast.error(`E-mail inválido: ${parsed.invalid[0]}`);
    try {
      setSending(true);
      const res = await api.post(`/records/${record.id}/send-email`, {
        to: parsed.valid.join(","),
        message: message || null,
        attach_receipts: attach,
      });
      const n = res.data.recipients?.length || 1;
      const att = res.data.attachments_count || 0;
      const links = res.data.download_links_count || 0;
      toast.success(`E-mail enviado para ${n} destinatário(s)` + (att ? ` com ${att} anexo(s)` : links ? ` com ${links} link(s) de download` : ""));
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Falha ao enviar e-mail");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wider flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-400" /> Enviar CT-e por e-mail
          </DialogTitle>
          <DialogDescription>
            CT-e <span className="font-mono-strong text-indigo-300 font-bold">{record.cte_number}</span> —{" "}
            {record.company_name} · {formatBRL(record.payment_value)} · CNPJ {maskCNPJ(record.cnpj)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Para (separe vários e-mails por vírgula)
            </Label>
            <Input
              data-testid="send-email-to-input"
              placeholder="fulano@empresa.com, contador@empresa.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {(parsed.valid.length > 0 || parsed.invalid.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {parsed.valid.map((e) => (
                  <span
                    key={e}
                    data-testid={`recipient-chip-${e}`}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-2 py-0.5 text-xs font-mono-strong"
                  >
                    {e}
                    <button type="button" onClick={() => removeChip(e)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {parsed.invalid.map((e) => (
                  <span
                    key={`bad-${e}`}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/50 bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-mono-strong"
                    title="E-mail inválido"
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}
            {defaultRecipients && defaultRecipients.length > 0 && parsed.valid.length === defaultRecipients.length &&
              parsed.valid.every((e, i) => e === defaultRecipients[i]) && (
              <span className="text-[11px] text-emerald-400">Usando destinatários padrão ({defaultRecipients.length})</span>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Mensagem (opcional)</Label>
            <Textarea
              data-testid="send-email-message-input"
              rows={3}
              placeholder="Segue em anexo o CT-e e seus comprovantes de pagamento."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-secondary/30 cursor-pointer">
            <Checkbox
              data-testid="attach-receipts-checkbox"
              checked={attach}
              onCheckedChange={(v) => setAttach(!!v)}
              disabled={receiptsCount === 0}
            />
            <div className="flex-1">
              <div className="text-sm font-medium flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-cyan-400" /> Anexar comprovantes
              </div>
              <div className="text-xs text-muted-foreground">
                {receiptsCount === 0
                  ? "Nenhum comprovante anexado a este registro"
                  : `${receiptsCount} arquivo(s) serão anexados + links de download no corpo do e-mail`}
              </div>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="cancel-send-email-btn">Cancelar</Button>
          <Button
            data-testid="confirm-send-email-btn"
            onClick={send}
            disabled={sending || parsed.valid.length === 0}
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar{parsed.valid.length > 1 ? ` (${parsed.valid.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
