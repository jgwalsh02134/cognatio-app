import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileDown, FileText } from "lucide-react";
import { buildGedcom, downloadGedcom } from "@/lib/gedcomExport";
import { people, families } from "@/lib/family";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ExportPage() {
  const [previewOpen, setPreviewOpen] = useState(false);

  const summary = useMemo(() => {
    const ged = buildGedcom();
    return {
      text: ged,
      bytes: new Blob([ged]).size,
      individuals: people.length,
      families: families.length,
      lines: ged.split(/\r?\n/).length,
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const filename = `cognatio_archive_${today}.ged`;

  return (
    <div className="container mx-auto px-4 py-6 sm:py-10 max-w-5xl">
      <header className="mb-6 sm:mb-10">
        <h1 className="font-display text-xl sm:text-2xl font-semibold mb-2">Export archive</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Download the entire family archive as a standards-compliant GEDCOM 5.5.1 file. The export
          always reflects the latest state of the site — re-download whenever the archive is
          updated. The .ged file can be imported into Ancestry, FamilySearch, MyHeritage, RootsMagic,
          Gramps, Reunion, and most genealogy software.
        </p>
      </header>

      <Card className="border-border/60 mb-6">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 text-primary p-2.5">
                <FileDown className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-base sm:text-lg font-semibold">
                  GEDCOM 5.5.1 (.ged)
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {summary.individuals} individuals · {summary.families} families ·{" "}
                  {summary.lines.toLocaleString()} lines · {formatBytes(summary.bytes)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{filename}</div>
              </div>
            </div>
            <Button
              size="lg"
              className="gap-2"
              onClick={() => downloadGedcom(filename)}
              data-testid="button-download-gedcom"
            >
              <Download className="h-4 w-4" /> Download .ged
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 mb-6">
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-display text-base sm:text-lg font-semibold mb-2">What's included</h2>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>Names, sex, suffixes, and full xref IDs for every individual</li>
            <li>Birth, death, and burial events with date + place</li>
            <li>All residences (census + city directory entries)</li>
            <li>Education events with date, place, and notes</li>
            <li>Occupations as standard OCCU records</li>
            <li>
              Custom <code className="text-xs">EVEN</code> blocks for military service (branch,
              conflict, awards, evidence) and affiliations (Harvard, Knights of Malta, Siena, RPI,
              NYS PSC, U.S. House, etc.)
            </li>
            <li>Family relationships: HUSB / WIFE / CHIL / FAMC / FAMS, including remarriages</li>
            <li>Marriage and divorce events on FAM records</li>
            <li>UTF-8 encoded with CRLF line endings per the GEDCOM 5.5.1 specification</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base sm:text-lg font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" /> Preview
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen((v) => !v)}
              data-testid="button-toggle-preview"
            >
              {previewOpen ? "Hide" : "Show first 80 lines"}
            </Button>
          </div>
          {previewOpen && (
            <pre className="text-xs bg-muted/40 border border-border/60 rounded-md p-3 overflow-auto max-h-96 font-mono leading-relaxed">
              {summary.text.split(/\r?\n/).slice(0, 80).join("\n")}
            </pre>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            The full file contains {summary.lines.toLocaleString()} lines — download to view in
            full or import into your genealogy software.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
