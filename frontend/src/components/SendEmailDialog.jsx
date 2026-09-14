import { useEffect, useState } from "react";
import { Mail, Send, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { maskCNPJ, formatBRL } from "@/lib/format";

export default function SendEmailDialog({ record, open, onOpenChange, defaultRecipient }) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(defaultRecipient || "");
      setMessage("");
      setAttach(true);
    }
  }, [open, defaultRecipient]);

  if (!record) return null;
  const receiptsCount = (record.receipts || []).length;

  const send = async () => {
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return toast.error("Informe um e-mail válido");
    }
    try {
      setSending(true);
      const res = await api.post(`/records/${record.id}/send-email`, {
        to,
        message: message || null,
        attach_receipts: attach,
      });
      toast.success(`E-mail enviado para ${res.data.to}` + (res.data.attachments_count ? ` com ${res.data.attachments_count} anexo(s)` : ""));
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
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Para</Label>
            <Input
              data-testid="send-email-to-input"
              type="email"
              placeholder="destinatario@exemplo.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {defaultRecipient && to === defaultRecipient && (
              <span className="text-[11px] text-emerald-400">Usando destinatário padrão</span>
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
                {receiptsCount === 0 ? "Nenhum comprovante anexado a este registro" : `${receiptsCount} arquivo(s) serão enviados junto ao e-mail`}
              </div>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="cancel-send-email-btn">Cancelar</Button>
          <Button
            data-testid="confirm-send-email-btn"
            onClick={send}
            disabled={sending || !to}
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
