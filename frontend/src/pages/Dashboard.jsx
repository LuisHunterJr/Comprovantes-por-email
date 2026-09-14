import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Truck, FileText, Upload, Search, Trash2, Eye, Copy, CheckCircle2, Loader2, Package, Wallet, ReceiptText, TrendingUp, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import CteHighlight from "@/components/CteHighlight";
import ReceiptUpload from "@/components/ReceiptUpload";
import SettingsDialog from "@/components/SettingsDialog";
import SendEmailDialog from "@/components/SendEmailDialog";
import { maskCNPJ, onlyDigits, formatBRL, parseBRLInput, formatDate } from "@/lib/format";
import { lookupCnpj, createRecord, listRecords, deleteRecord, getStats, fileUrl } from "@/lib/api";
import { api } from "@/lib/api";

const INITIAL_FORM = {
  cnpj: "",
  companyName: "",
  cteNumber: "",
  paymentValueStr: "",
  notes: "",
};

export default function Dashboard() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [autoFilled, setAutoFilled] = useState(false);
  const [lookupState, setLookupState] = useState("idle"); // idle | loading | success | error
  const [receipts, setReceipts] = useState([]); // uploaded receipt refs
  const [submitting, setSubmitting] = useState(false);

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ total_records: 0, total_value: 0, total_receipts: 0, average_value: 0 });
  const [previewFile, setPreviewFile] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [emailTarget, setEmailTarget] = useState(null);
  const [defaultRecipient, setDefaultRecipient] = useState("");

  useEffect(() => {
    api.get("/settings").then((r) => setDefaultRecipient(r.data.default_recipient || "")).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [rec, st] = await Promise.all([listRecords(search), getStats()]);
      setRecords(rec);
      setStats(st);
    } catch (e) {
      console.error(e);
    }
  }, [search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onCnpjChange = (e) => {
    const masked = maskCNPJ(e.target.value);
    setForm((f) => ({ ...f, cnpj: masked }));
    setAutoFilled(false);
    if (onlyDigits(masked).length === 14) {
      handleLookup(onlyDigits(masked));
    } else {
      setLookupState("idle");
    }
  };

  const handleLookup = async (raw) => {
    const c = raw || onlyDigits(form.cnpj);
    if (c.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return;
    }
    try {
      setLookupState("loading");
      const data = await lookupCnpj(c);
      setForm((f) => ({ ...f, companyName: data.razao_social || f.companyName }));
      setAutoFilled(true);
      setLookupState("success");
      toast.success(`Razão social encontrada: ${data.razao_social}`);
    } catch (err) {
      setLookupState("error");
      const msg = err?.response?.data?.detail || "Não foi possível consultar o CNPJ";
      toast.error(msg);
    }
  };

  const onValueChange = (e) => {
    const raw = e.target.value;
    setForm((f) => ({ ...f, paymentValueStr: raw }));
  };

  const onValueBlur = () => {
    const num = parseBRLInput(form.paymentValueStr);
    setForm((f) => ({ ...f, paymentValueStr: num ? formatBRL(num) : "" }));
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setReceipts([]);
    setAutoFilled(false);
    setLookupState("idle");
  };

  const submit = async () => {
    const cnpj = onlyDigits(form.cnpj);
    if (cnpj.length !== 14) return toast.error("Informe um CNPJ válido");
    if (!form.companyName.trim()) return toast.error("Informe a razão social");
    if (!form.cteNumber.trim()) return toast.error("Informe o número do CT-e");
    const value = parseBRLInput(form.paymentValueStr);
    if (value <= 0) return toast.error("Informe o valor de pagamento");
    try {
      setSubmitting(true);
      await createRecord({
        cnpj,
        company_name: form.companyName.trim(),
        cte_number: form.cteNumber.trim(),
        payment_value: value,
        receipts,
        notes: form.notes || null,
      });
      toast.success("Registro salvo com sucesso");
      resetForm();
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao salvar registro");
    } finally {
      setSubmitting(false);
    }
  };

  const doDelete = async (id) => {
    try {
      await deleteRecord(id);
      toast.success("Registro removido");
      refresh();
    } catch (e) {
      toast.error("Erro ao remover");
    } finally {
      setConfirmDelete(null);
    }
  };

  const kpis = [
    { label: "CT-e Cadastrados", value: stats.total_records, icon: Package, color: "text-emerald-400" },
    { label: "Valor Total Pago", value: formatBRL(stats.total_value), icon: Wallet, color: "text-amber-400" },
    { label: "Comprovantes", value: stats.total_receipts, icon: ReceiptText, color: "text-cyan-400" },
    { label: "Média por CT-e", value: formatBRL(stats.average_value), icon: TrendingUp, color: "text-indigo-400" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60 bg-[#0B0F17]/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Truck className="w-5 h-5 text-emerald-400" strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Painel Logístico</div>
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">CT-e & Comprovantes</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden md:inline-flex border-emerald-500/40 text-emerald-400 bg-emerald-500/5 gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            BrasilAPI conectada
          </Badge>
          <SettingsDialog onSaved={(v) => setDefaultRecipient(v || "")} />
        </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stats-section">
          {kpis.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="bg-card/60 border-border/60 hover:border-emerald-500/40 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
                      <div className="mt-2 font-mono-strong text-2xl font-bold">{k.value}</div>
                    </div>
                    <k.icon className={`w-5 h-5 ${k.color}`} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form */}
          <section className="lg:col-span-5 xl:col-span-5">
            <Card className="bg-card/60 border-border/60">
              <CardHeader>
                <CardTitle className="font-display text-xl uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" /> Novo Registro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* CNPJ */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">CNPJ</Label>
                  <div className="flex gap-2">
                    <Input
                      data-testid="cnpj-input"
                      placeholder="00.000.000/0000-00"
                      value={form.cnpj}
                      onChange={onCnpjChange}
                      className="font-mono-strong text-base"
                      maxLength={18}
                    />
                    <Button
                      data-testid="cnpj-lookup-btn"
                      variant="outline"
                      onClick={() => handleLookup()}
                      disabled={lookupState === "loading"}
                      className="border-emerald-500/40 hover:bg-emerald-500/10"
                    >
                      {lookupState === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                  {lookupState === "loading" && (
                    <span className="text-xs text-cyan-400 inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Buscando razão social na Receita Federal…
                    </span>
                  )}
                  {autoFilled && lookupState === "success" && (
                    <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Preenchimento automático
                    </span>
                  )}
                </div>

                {/* Company name */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Razão Social</Label>
                  <Input
                    data-testid="company-name-input"
                    placeholder="Preenchido automaticamente após consulta"
                    value={form.companyName}
                    onChange={(e) => { setForm({ ...form, companyName: e.target.value }); setAutoFilled(false); }}
                  />
                </div>

                {/* CTe number - highlighted preview */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Número do CT-e</Label>
                  <Input
                    data-testid="cte-number-input"
                    placeholder="Ex.: 000128945"
                    value={form.cteNumber}
                    onChange={(e) => setForm({ ...form, cteNumber: e.target.value })}
                    className="font-mono-strong text-lg tracking-wider"
                  />
                  <CteHighlight number={form.cteNumber} />
                </div>

                {/* Payment value */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Valor do Pagamento</Label>
                  <Input
                    data-testid="payment-value-input"
                    placeholder="R$ 0,00"
                    value={form.paymentValueStr}
                    onChange={onValueChange}
                    onBlur={onValueBlur}
                    className="font-mono-strong text-lg"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[100, 500, 1000, 5000].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          const cur = parseBRLInput(form.paymentValueStr);
                          setForm((f) => ({ ...f, paymentValueStr: formatBRL(cur + v) }));
                        }}
                        className="px-2.5 py-1 text-xs rounded-md border border-border hover:border-emerald-500/40 hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-300 transition-colors"
                        data-testid={`quick-amount-${v}`}
                      >
                        +R$ {v.toLocaleString("pt-BR")}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, paymentValueStr: "" }))}
                      className="px-2.5 py-1 text-xs rounded-md border border-border hover:border-destructive/50 hover:text-destructive text-muted-foreground transition-colors"
                      data-testid="quick-amount-clear"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Receipts upload */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Comprovantes (até 5)</Label>
                  <ReceiptUpload receipts={receipts} setReceipts={setReceipts} />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Observações</Label>
                  <Textarea
                    data-testid="notes-input"
                    rows={2}
                    placeholder="Opcional"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    data-testid="submit-record-btn"
                    onClick={submit}
                    disabled={submitting}
                    className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold flex-1"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Salvar Registro
                  </Button>
                  <Button
                    data-testid="reset-form-btn"
                    variant="ghost"
                    onClick={resetForm}
                    className="border border-border/60"
                  >
                    Limpar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Records table */}
          <section className="lg:col-span-7 xl:col-span-7">
            <Card className="bg-card/60 border-border/60">
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="font-display text-xl uppercase tracking-wider flex items-center gap-2">
                    <ReceiptText className="w-5 h-5 text-cyan-400" /> Registros
                  </CardTitle>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      data-testid="records-search-input"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por CNPJ, empresa ou CT-e"
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <Table data-testid="records-table">
                    <TableHeader>
                      <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                        <TableHead className="text-xs uppercase tracking-widest">CT-e</TableHead>
                        <TableHead className="text-xs uppercase tracking-widest">Empresa</TableHead>
                        <TableHead className="text-xs uppercase tracking-widest">Valor</TableHead>
                        <TableHead className="text-xs uppercase tracking-widest text-center">Comprov.</TableHead>
                        <TableHead className="text-xs uppercase tracking-widest">Data</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                            Nenhum registro ainda. Cadastre o primeiro CT-e ao lado.
                          </TableCell>
                        </TableRow>
                      )}
                      {records.map((r) => (
                        <TableRow key={r.id} data-testid={`record-row-${r.id}`} className="hover:bg-secondary/20">
                          <TableCell>
                            <div className="font-mono-strong font-bold text-indigo-300 text-sm">{r.cte_number}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium max-w-[220px] truncate">{r.company_name}</div>
                            <div className="text-xs text-muted-foreground font-mono-strong">{maskCNPJ(r.cnpj)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono-strong font-semibold text-emerald-400">{formatBRL(r.payment_value)}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="border-border/60 font-mono-strong">
                              {(r.receipts || []).length}/5
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEmailTarget(r)}
                                data-testid={`send-email-btn-${r.id}`}
                                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                title="Enviar por e-mail"
                              >
                                <Mail className="w-4 h-4" />
                              </Button>
                              {(r.receipts || []).length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPreviewFile({ record: r, index: 0 })}
                                  data-testid={`view-receipts-${r.id}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmDelete(r)}
                                data-testid={`delete-record-${r.id}`}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      {/* Preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wider">
              Comprovantes · CT-e {previewFile?.record?.cte_number}
            </DialogTitle>
          </DialogHeader>
          {previewFile && (
            <PreviewGallery record={previewFile.record} />
          )}
        </DialogContent>
      </Dialog>

      {/* Send email dialog */}
      <SendEmailDialog
        record={emailTarget}
        open={!!emailTarget}
        onOpenChange={(o) => !o && setEmailTarget(null)}
        defaultRecipient={defaultRecipient}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o CT-e {confirmDelete?.cte_number} e desativará os comprovantes anexados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-btn">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-btn"
              onClick={() => confirmDelete && doDelete(confirmDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PreviewGallery({ record }) {
  const receipts = record.receipts || [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-auto">
      {receipts.map((f) => {
        const isPdf = (f.content_type || "").includes("pdf");
        const url = fileUrl(f.id);
        return (
          <div key={f.id} className="rounded-lg border border-border/60 overflow-hidden bg-secondary/20">
            <div className="p-3 flex items-center justify-between border-b border-border/60">
              <div className="text-xs truncate max-w-[70%]" title={f.original_filename}>{f.original_filename}</div>
              <a href={url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline">Abrir</a>
            </div>
            <div className="h-64 bg-black/40 flex items-center justify-center">
              {isPdf ? (
                <iframe src={url} title={f.original_filename} className="w-full h-full" />
              ) : (
                <img src={url} alt={f.original_filename} className="max-h-full max-w-full object-contain" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
