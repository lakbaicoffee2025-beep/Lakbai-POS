import { useRef, useState } from "react";
import { parseCsv } from "../../lib/csvParse";
import { transformMenuCsv, type ImportPlan } from "../../lib/menuImport";
import { applyMenuImport, type ApplyImportResult } from "../../db/applyMenuImport";
import { Card, Button } from "../../components/ui";

type Stage = "idle" | "previewing" | "applying" | "done" | "error";

export default function ImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ApplyImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const parsedPlan = transformMenuCsv(rows);
      if (parsedPlan.products.length === 0 && parsedPlan.ingredients.length === 0) {
        setError("No products or ingredients were found in this file. Is it the right export?");
        setStage("error");
        return;
      }
      setPlan(parsedPlan);
      setStage("previewing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read/parse this file.");
      setStage("error");
    }
  }

  async function handleApply() {
    if (!plan) return;
    setStage("applying");
    try {
      const res = await applyMenuImport(plan);
      setResult(res);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply import.");
      setStage("error");
    }
  }

  function reset() {
    setStage("idle");
    setPlan(null);
    setResult(null);
    setError(null);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-coffee-800">Import Menu (CSV)</h3>
        <p className="text-xs text-coffee-400 mt-0.5">
          Upload an items export from your previous POS (Loyverse-style CSV) to bring in
          categories, products, variants, and ingredient recipes. Re-uploading an updated
          file later will update existing items by SKU instead of duplicating them.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {stage === "idle" && (
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          Choose CSV File
        </Button>
      )}

      {stage === "error" && (
        <div className="space-y-2">
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
          <Button variant="secondary" onClick={reset}>
            Try Another File
          </Button>
        </div>
      )}

      {stage === "previewing" && plan && (
        <div className="space-y-3">
          <div className="text-xs text-coffee-500">
            Parsed <span className="font-semibold text-coffee-800">{fileName}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Categories" value={plan.categories.length} />
            <Stat label="Ingredients" value={plan.ingredients.length} />
            <Stat label="Products" value={plan.products.length} />
            <Stat label="Modifier Groups" value={plan.modifierGroups.length} />
          </div>

          {plan.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
              <div className="text-xs font-semibold text-amber-800">
                {plan.warnings.length} thing(s) worth reviewing after import:
              </div>
              <ul className="text-xs text-amber-700 list-disc pl-4 space-y-1">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleApply} className="flex-[2]">
              Import {plan.products.length} Products
            </Button>
          </div>
        </div>
      )}

      {stage === "applying" && (
        <div className="text-sm text-coffee-500">Importing…</div>
      )}

      {stage === "done" && result && (
        <div className="space-y-3">
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Import complete.
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <SummaryRow label="Categories created" value={result.categoriesCreated} />
            <SummaryRow label="Modifier groups created" value={result.modifierGroupsCreated} />
            <SummaryRow label="Ingredients created" value={result.ingredientsCreated} />
            <SummaryRow label="Ingredients updated" value={result.ingredientsUpdated} />
            <SummaryRow label="Products created" value={result.productsCreated} />
            <SummaryRow label="Products updated" value={result.productsUpdated} />
          </div>
          <Button variant="secondary" onClick={reset}>
            Import Another File
          </Button>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-coffee-50 p-2.5 text-center">
      <div className="text-lg font-bold text-coffee-900">{value}</div>
      <div className="text-[11px] text-coffee-400">{label}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between rounded-lg bg-coffee-50 px-3 py-2">
      <span className="text-coffee-500">{label}</span>
      <span className="font-semibold text-coffee-900">{value}</span>
    </div>
  );
}
